<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, toRaw, watch, watchEffect } from 'vue'
import { BAR, NUM_PATTERNS, STEP, soundColor } from '../core/constants'
import { addEvent, removeEventsIn } from '../core/pattern'
import { SUSTAINED } from '../core/voices'
import {
  adjustNote, adjustVelocity, applyMove, beginMove, clearSelection, copySelection, deleteSelection, duplicateSelection, isSelected,
  moveSnap, pasteAtCursor, sel, selectAll, selectionSize, setSelection,
} from '../selection'
import {
  PARAM_META, clearCurrentPattern, clearCurrentSound, deleteLane, laneLabel, currentGroup, currentPattern, doubleCurrent, patternBars, playback, previewSound,
  quantTicks, quantizeCurrent, selectPattern, selectSound, setEventVelocity, settings, shiftCurrent, snapshot, ui,
} from '../store'

const LABEL_W = 92
const HEAD_H = 14
const ROW_H = 13
const GRID_H = HEAD_H + 16 * ROW_H
const VEL_H = 40

const wrap = ref<HTMLElement | null>(null)
const cv = ref<HTMLCanvasElement | null>(null)
const vel = ref<HTMLCanvasElement | null>(null)
const width = ref(600)
let ro: ResizeObserver | null = null

onMounted(() => {
  ro = new ResizeObserver(() => { width.value = Math.max(300, wrap.value?.clientWidth ?? 600) })
  if (wrap.value) ro.observe(wrap.value)
  width.value = Math.max(300, wrap.value?.clientWidth ?? 600)
})
onUnmounted(() => ro?.disconnect())

function setup(c: HTMLCanvasElement, h: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1
  c.width = Math.floor(width.value * dpr)
  c.height = Math.floor(h * dpr)
  c.style.width = width.value + 'px'
  c.style.height = h + 'px'
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function cellW(): number {
  return (width.value - LABEL_W) / (currentPattern.value.bars * 16)
}

function drawGrid() {
  const c = cv.value
  if (!c) return
  const ctx = setup(c, GRID_H)
  const pat = currentPattern.value
  const grp = currentGroup.value
  const steps = pat.bars * 16
  const cw = cellW()
  void pat.rev
  void sel.rev
  const events = toRaw(pat).events

  ctx.fillStyle = '#070b0e'
  ctx.fillRect(0, 0, width.value, GRID_H)
  ctx.font = '10px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'middle'

  for (let s = 0; s < 16; s++) {
    const y = HEAD_H + s * ROW_H
    const sound = grp.sounds[s]!
    ctx.fillStyle = s === ui.sound ? '#13222b' : s % 2 ? '#0a1014' : '#0c1318'
    ctx.fillRect(0, y, width.value, ROW_H)
    ctx.fillStyle = soundColor(sound.engine)
    ctx.globalAlpha = sound.mute ? 0.25 : s === ui.sound ? 1 : 0.6
    ctx.fillRect(2, y + 3, 3, ROW_H - 6)
    ctx.fillStyle = sound.mute ? '#4a5560' : s === ui.sound ? '#ffffff' : '#8ea3b0'
    ctx.globalAlpha = 1
    ctx.fillText(`${s + 1} ${sound.name}`.slice(0, 14), 9, y + ROW_H / 2)
  }
  for (let i = 0; i <= steps; i++) {
    const x = LABEL_W + i * cw
    ctx.strokeStyle = i % 16 === 0 ? '#3d5666' : i % 4 === 0 ? '#1f313c' : '#111c23'
    ctx.beginPath()
    ctx.moveTo(x + 0.5, HEAD_H)
    ctx.lineTo(x + 0.5, GRID_H)
    ctx.stroke()
    if (i % 4 === 0 && i < steps) {
      ctx.fillStyle = i % 16 === 0 ? '#9fb6c4' : '#4b6070'
      ctx.fillText(i % 16 === 0 ? String(i / 16 + 1) : String((i % 16) / 4 + 1), x + 3, HEAD_H / 2)
    }
  }
  for (const e of events) {
    const sound = grp.sounds[e.s]!
    const x = LABEL_W + (e.t / STEP) * cw
    const sustained = !!SUSTAINED[sound.engine]
    const w = sustained ? Math.max(4, Math.min((e.l / STEP) * cw - 1, pat.bars * BAR / STEP * cw - (x - LABEL_W))) : Math.max(3, cw - 1.5)
    const y = HEAD_H + e.s * ROW_H + 2
    ctx.globalAlpha = 0.3 + (0.7 * e.v) / 127
    ctx.fillStyle = soundColor(sound.engine)
    ctx.beginPath()
    ctx.roundRect(x + 0.5, y, w, ROW_H - 4, 2)
    ctx.fill()
    ctx.globalAlpha = 1
    if (isSelected(e)) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x + 0.5, y - 0.5, w, ROW_H - 3)
    }
    if (sustained && e.n !== 0 && w > 14) {
      ctx.fillStyle = '#000'
      ctx.fillText((e.n > 0 ? '+' : '') + e.n, x + 3, y + (ROW_H - 4) / 2)
    }
  }
  if (sel.tool === 'select') {
    const cx = LABEL_W + (sel.cursor / STEP) * cw
    ctx.strokeStyle = '#ffd60a'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(cx + 0.5, HEAD_H)
    ctx.lineTo(cx + 0.5, GRID_H)
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (rubber) {
    ctx.fillStyle = '#ffffff22'
    ctx.strokeStyle = '#ffffffaa'
    ctx.lineWidth = 1
    ctx.fillRect(rubber.x0, rubber.y0, rubber.x1 - rubber.x0, rubber.y1 - rubber.y0)
    ctx.strokeRect(rubber.x0 + 0.5, rubber.y0 + 0.5, rubber.x1 - rubber.x0, rubber.y1 - rubber.y0)
  }
  if (playback.playing) {
    const pos = playback.pos[ui.group] ?? 0
    const x = LABEL_W + (pos / STEP) * cw
    ctx.fillStyle = '#ffffffcc'
    ctx.fillRect(x, HEAD_H, 1.5, GRID_H - HEAD_H)
  }
}

const LANE_COLORS = ['#4cc9f0', '#ffd60a', '#7bd389', '#ff8a3d', '#c77dff', '#ff4d6d']

function laneRange(target: string): [number, number] {
  if (target.startsWith('g.')) return target === 'g.pan' ? [-1, 1] : [0, 1]
  const meta = PARAM_META[target.slice(target.indexOf('.') + 1) as keyof typeof PARAM_META]
  return meta ? [meta.min, meta.max] : [0, 1]
}

function drawAuto(ctx: CanvasRenderingContext2D) {
  const pat = currentPattern.value
  const len = pat.bars * BAR
  const gridW = width.value - LABEL_W
  ctx.font = '9px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#5d7280'
  if (!pat.auto.length) {
    ctx.fillText('AUTOMATION', 6, 4)
    ctx.fillText('Arm Auto, press Play, then move a knob', LABEL_W + 8, VEL_H / 2 - 5)
    return
  }
  pat.auto.forEach((lane, i) => {
    const col = LANE_COLORS[i % LANE_COLORS.length]!
    ctx.fillStyle = col
    ctx.fillText('✕ ' + laneLabel(ui.group, lane.target).slice(0, 14), 4, 3 + i * 12)
    const [lo, hi] = laneRange(lane.target)
    const yOf = (v: number) => VEL_H - 4 - ((v - lo) / (hi - lo || 1)) * (VEL_H - 8)
    ctx.strokeStyle = col
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const pts = lane.points
    if (pts.length) {
      ctx.moveTo(LABEL_W, yOf(pts[0]!.v))
      for (const pt of pts) ctx.lineTo(LABEL_W + (pt.t / len) * gridW, yOf(pt.v))
      ctx.lineTo(LABEL_W + gridW, yOf(pts[pts.length - 1]!.v))
    }
    ctx.stroke()
    ctx.fillStyle = col
    for (const pt of pts) ctx.fillRect(LABEL_W + (pt.t / len) * gridW - 1.5, yOf(pt.v) - 1.5, 3, 3)
  })
  if (playback.playing) {
    ctx.fillStyle = '#ffffffcc'
    ctx.fillRect(LABEL_W + ((playback.pos[ui.group] ?? 0) / len) * gridW, 0, 1.5, VEL_H)
  }
}

function drawVel() {
  const c = vel.value
  if (!c) return
  const ctx = setup(c, VEL_H)
  const pat = currentPattern.value
  void pat.rev
  const cw = cellW()
  ctx.fillStyle = '#070b0e'
  ctx.fillRect(0, 0, width.value, VEL_H)
  if (ui.autoView) {
    drawAuto(ctx)
    return
  }
  ctx.fillStyle = '#5d7280'
  ctx.font = '10px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'top'
  ctx.fillText('VELOCITY', 6, 4)
  for (const e of toRaw(pat).events) {
    if (e.s !== ui.sound) continue
    const x = LABEL_W + (e.t / STEP) * cw
    const h = (e.v / 127) * (VEL_H - 6)
    ctx.fillStyle = soundColor(currentGroup.value.sounds[ui.sound]!.engine)
    ctx.globalAlpha = 0.85
    ctx.fillRect(x + 1, VEL_H - 2 - h, Math.max(3, Math.min(cw - 2, 8)), h)
    ctx.globalAlpha = 1
  }
}

watch(() => [ui.group, currentGroup.value.pattern], () => clearSelection())
watchEffect(drawGrid)
watchEffect(drawVel)
watch(width, () => nextTick(() => { drawGrid(); drawVel() }))

// follow playhead in step mode
watch(
  () => playback.pos[ui.group],
  (p) => {
    if (settings.follow && ui.mode === 'step' && playback.playing && p !== undefined) {
      const bar = Math.min(currentPattern.value.bars - 1, Math.floor(p / BAR))
      if (ui.stepBar !== bar) ui.stepBar = bar
    }
  },
)

// ---- painting ---------------------------------------------------------------

let rubber: { x0: number; y0: number; x1: number; y1: number } | null = null
let drag: { mode: 'move' | 'rect'; x: number; y: number } | null = null
let paint: 'add' | 'remove' | null = null
let lastCell = ''

function hit(e: PointerEvent): { s: number; step: number } | null {
  const r = cv.value!.getBoundingClientRect()
  const k = cv.value!.offsetWidth / r.width // undo the stage scale
  const x = (e.clientX - r.left) * k - LABEL_W
  const y = (e.clientY - r.top) * k - HEAD_H
  if (y < 0) return null
  const s = Math.floor(y / ROW_H)
  if (s < 0 || s > 15) return null
  if (x < 0) return { s, step: -1 }
  const step = Math.floor(x / cellW())
  if (step < 0 || step >= currentPattern.value.bars * 16) return null
  return { s, step }
}

function apply(s: number, step: number) {
  const key = s + ':' + step
  if (key === lastCell) return
  lastCell = key
  const pat = currentPattern.value
  const from = step * STEP
  const exists = pat.events.some((e) => e.s === s && e.t >= from && e.t < from + STEP)
  if (paint === null) paint = exists ? 'remove' : 'add'
  if (paint === 'remove' && exists) removeEventsIn(pat, s, from, from + STEP)
  else if (paint === 'add' && !exists) {
    addEvent(pat, { t: from, s, v: ui.fixedVel ? 127 : 100, l: STEP, n: 0 })
    if (!playback.playing) previewSound(ui.group, s, 100)
  }
}

function localXY(e: PointerEvent): { x: number; y: number } {
  const r = cv.value!.getBoundingClientRect()
  const k = cv.value!.offsetWidth / r.width
  return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }
}

function eventAt(x: number, y: number) {
  const row = Math.floor((y - HEAD_H) / ROW_H)
  const tick = ((x - LABEL_W) / cellW()) * STEP
  const grp = currentGroup.value
  for (const ev of toRaw(currentPattern.value).events) {
    if (ev.s !== row) continue
    const sustained = !!SUSTAINED[grp.sounds[ev.s]!.engine]
    if (tick >= ev.t && tick < ev.t + (sustained ? Math.max(ev.l, STEP / 2) : STEP)) return ev
  }
  return null
}

function selectDown(e: PointerEvent): boolean {
  const { x, y } = localXY(e)
  if (x < LABEL_W || y < HEAD_H) return false
  cv.value!.setPointerCapture(e.pointerId)
  const ev = eventAt(x, y)
  if (ev) {
    if (!isSelected(ev)) setSelection([ev], e.shiftKey)
    selectSound(ev.s)
    beginMove()
    drag = { mode: 'move', x, y }
  } else {
    if (!e.shiftKey) clearSelection()
    const snap = ((x - LABEL_W) / cellW()) * STEP
    sel.cursor = Math.max(0, Math.round(snap / STEP) * STEP)
    drag = { mode: 'rect', x, y }
    rubber = { x0: x, y0: y, x1: x, y1: y }
  }
  return true
}

function selectMove(e: PointerEvent) {
  if (!drag) return
  const { x, y } = localXY(e)
  if (drag.mode === 'move') {
    const snap = moveSnap()
    const dTicks = Math.round((((x - drag.x) / cellW()) * STEP) / snap) * snap
    const dRows = Math.round((y - drag.y) / ROW_H)
    applyMove(dTicks, dRows)
  } else if (rubber) {
    rubber = { x0: Math.min(drag.x, x), y0: Math.min(drag.y, y), x1: Math.max(drag.x, x), y1: Math.max(drag.y, y) }
    sel.rev++
  }
}

function selectUp(e: PointerEvent) {
  if (!drag) return
  if (drag.mode === 'rect' && rubber) {
    const cw = cellW()
    const grp = currentGroup.value
    const hits = toRaw(currentPattern.value).events.filter((ev) => {
      const sustained = !!SUSTAINED[grp.sounds[ev.s]!.engine]
      const x0 = LABEL_W + (ev.t / STEP) * cw
      const x1 = x0 + (sustained ? Math.max((ev.l / STEP) * cw, 4) : cw)
      const y0 = HEAD_H + ev.s * ROW_H
      return x1 >= rubber!.x0 && x0 <= rubber!.x1 && y0 + ROW_H >= rubber!.y0 && y0 <= rubber!.y1
    })
    setSelection(hits, e.shiftKey)
  }
  drag = null
  rubber = null
  sel.rev++
}

function onDown(e: PointerEvent) {
  if (sel.tool === 'select' && selectDown(e)) return
  const h = hit(e)
  if (!h) return
  if (h.step < 0) { selectSound(h.s); previewSound(ui.group, h.s); return }
  cv.value!.setPointerCapture(e.pointerId)
  snapshot()
  paint = null
  lastCell = ''
  selectSound(h.s)
  apply(h.s, h.step)
}

function onMove(e: PointerEvent) {
  if (sel.tool === 'select') { selectMove(e); return }
  if (e.buttons === 0 || (paint === null && lastCell === '')) return
  const h = hit(e)
  if (h && h.step >= 0) apply(h.s, h.step)
}

function onUp(e: PointerEvent) {
  if (sel.tool === 'select') { selectUp(e); return }
  paint = null
  lastCell = ''
}

// ---- velocity lane -----------------------------------------------------------

let velTarget: import('../core/types').NoteEvent | null = null

function velAt(e: PointerEvent) {
  const r = vel.value!.getBoundingClientRect()
  const k = vel.value!.offsetWidth / r.width
  return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }
}

function velDown(e: PointerEvent) {
  const { x, y } = velAt(e)
  if (ui.autoView) {
    if (x < LABEL_W) {
      const lane = currentPattern.value.auto[Math.floor((y - 3) / 12)]
      if (lane) deleteLane(lane.target)
    }
    return
  }
  const cw = cellW()
  let best: import('../core/types').NoteEvent | null = null
  let bestD = Infinity
  for (const ev of currentPattern.value.events) {
    if (ev.s !== ui.sound) continue
    const d = Math.abs(LABEL_W + (ev.t / STEP) * cw + 3 - x)
    if (d < bestD) { bestD = d; best = ev }
  }
  if (best && bestD < Math.max(10, cw)) {
    snapshot(ui.group, currentGroup.value.pattern, 600)
    velTarget = best
    vel.value!.setPointerCapture(e.pointerId)
    setEventVelocity(best, (1 - (y - 2) / (VEL_H - 6)) * 127)
  }
}

function velMove(e: PointerEvent) {
  if (!velTarget) return
  setEventVelocity(velTarget, (1 - (velAt(e).y - 2) / (VEL_H - 6)) * 127)
}

function velUp() { velTarget = null }
</script>

<template>
  <div class="pv">
    <div class="tools">
      <div class="chips">
        <button
          v-for="i in NUM_PATTERNS"
          :key="i"
          class="chip"
          :class="{ on: currentGroup.pattern === i - 1, dim: currentGroup.patterns[i - 1]!.events.length === 0 && currentGroup.pattern !== i - 1, blink: playback.pending[ui.group] === i - 1 }"
          @click="selectPattern(ui.group, i - 1)"
        >{{ i }}</button>
      </div>
      <div class="chips">
        <span class="sub">Bars</span>
        <button v-for="b in 4" :key="b" class="chip" :class="{ on: currentPattern.bars === b }" @click="patternBars(b)">{{ b }}</button>
      </div>
    </div>
    <div class="tools">
      <div class="chips">
        <button class="chip" :class="{ on: sel.tool === 'draw' }" title="Click cells to add or remove notes" @click="sel.tool = 'draw'">Draw</button>
        <button class="chip" :class="{ on: sel.tool === 'select' }" title="Select, move and copy notes" @click="sel.tool = 'select'">Select</button>
      </div>
      <div class="chips">
        <button class="chip" :class="{ on: !ui.autoView }" @click="ui.autoView = false">Vel</button>
        <button class="chip" :class="{ on: ui.autoView }" title="Show recorded automation lanes" @click="ui.autoView = true">Auto{{ currentPattern.auto.length ? ' ' + currentPattern.auto.length : '' }}</button>
      </div>
      <div class="chips">
        <button class="btn" :title="quantTicks ? 'Quantize all notes to the grid' : 'Quantize is off (Setup)'" @click="quantizeCurrent(true)">Quant</button>
        <button class="btn" title="Double the pattern" @click="doubleCurrent">×2</button>
        <button class="btn" title="Shift pattern one step left" @click="shiftCurrent(-1)">◀</button>
        <button class="btn" title="Shift pattern one step right" @click="shiftCurrent(1)">▶</button>
        <button class="btn danger" @click="clearCurrentSound">Clr snd</button>
        <button class="btn danger" @click="clearCurrentPattern">Clr pat</button>
      </div>
    </div>
    <div class="tools sel">
      <span class="sub">Selection {{ selectionSize() || '' }}</span>
      <div class="chips">
        <button class="btn" title="Cmd/Ctrl+A" @click="sel.tool = 'select'; selectAll()">All</button>
        <button class="btn" :disabled="!selectionSize()" title="Cmd/Ctrl+C" @click="copySelection">Copy</button>
        <button class="btn" title="Paste at the yellow cursor · Cmd/Ctrl+V" @click="pasteAtCursor">Paste</button>
        <button class="btn" :disabled="!selectionSize()" title="Cmd/Ctrl+D" @click="duplicateSelection">Dup</button>
        <button class="btn danger" :disabled="!selectionSize()" title="Delete" @click="deleteSelection">Del</button>
        <span class="sep" />
        <button class="btn" :disabled="!selectionSize()" @click="adjustVelocity(-10)">Vel −</button>
        <button class="btn" :disabled="!selectionSize()" @click="adjustVelocity(10)">Vel +</button>
        <button class="btn" :disabled="!selectionSize()" title="Transpose down a semitone" @click="adjustNote(-1)">Note −</button>
        <button class="btn" :disabled="!selectionSize()" title="Transpose up a semitone" @click="adjustNote(1)">Note +</button>
      </div>
    </div>
    <div ref="wrap" class="canvases">
      <canvas ref="cv" @pointerdown.prevent="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" />
      <canvas ref="vel" class="vel" @pointerdown.prevent="velDown" @pointermove="velMove" @pointerup="velUp" @pointercancel="velUp" />
    </div>
  </div>
</template>

<style scoped>
.pv { display: flex; flex-direction: column; gap: 4px; height: 100%; min-height: 0; }
.tools { display: flex; flex-wrap: wrap; gap: 5px 10px; align-items: center; }
.chips { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.tools .btn { padding: 3px 7px; height: 24px; }
.tools .chip { min-width: 22px; padding: 0 6px; height: 22px; }
.tools { min-height: 24px; }
.tools.sel { gap: 8px; }
.sep { width: 8px; }
.canvases { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: none; }
canvas { display: block; touch-action: none; border-radius: 4px; cursor: crosshair; }
canvas.vel { cursor: ns-resize; }
</style>
