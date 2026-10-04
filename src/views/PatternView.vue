<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, toRaw, watch, watchEffect } from 'vue'
import { BAR, NUM_PATTERNS, STEP } from '../core/constants'
import { addEvent, removeEventsIn } from '../core/pattern'
import { SUSTAINED } from '../core/voices'
import {
  clearCurrentPattern, clearCurrentSound, currentGroup, currentPattern, doubleCurrent, patternBars, playback, previewSound,
  quantTicks, quantizeCurrent, selectPattern, selectSound, setEventVelocity, settings, shiftCurrent, snapshot, ui,
} from '../store'

const LABEL_W = 92
const HEAD_H = 14
const ROW_H = 15
const GRID_H = HEAD_H + 16 * ROW_H
const VEL_H = 52

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
    ctx.fillStyle = sound.mute ? '#4a5560' : s === ui.sound ? '#ffffff' : '#8ea3b0'
    ctx.fillText(`${s + 1} ${sound.name}`.slice(0, 14), 6, y + ROW_H / 2)
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
    ctx.fillStyle = grp.color
    ctx.beginPath()
    ctx.roundRect(x + 0.5, y, w, ROW_H - 4, 2)
    ctx.fill()
    ctx.globalAlpha = 1
    if (sustained && e.n !== 0 && w > 14) {
      ctx.fillStyle = '#000'
      ctx.fillText((e.n > 0 ? '+' : '') + e.n, x + 3, y + (ROW_H - 4) / 2)
    }
  }
  if (playback.playing) {
    const pos = playback.pos[ui.group] ?? 0
    const x = LABEL_W + (pos / STEP) * cw
    ctx.fillStyle = '#ffffffcc'
    ctx.fillRect(x, HEAD_H, 1.5, GRID_H - HEAD_H)
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
  ctx.fillStyle = '#5d7280'
  ctx.font = '10px ui-monospace, Menlo, monospace'
  ctx.textBaseline = 'top'
  ctx.fillText('VELOCITY', 6, 4)
  for (const e of toRaw(pat).events) {
    if (e.s !== ui.sound) continue
    const x = LABEL_W + (e.t / STEP) * cw
    const h = (e.v / 127) * (VEL_H - 6)
    ctx.fillStyle = currentGroup.value.color
    ctx.globalAlpha = 0.85
    ctx.fillRect(x + 1, VEL_H - 2 - h, Math.max(3, Math.min(cw - 2, 8)), h)
    ctx.globalAlpha = 1
  }
}

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

let paint: 'add' | 'remove' | null = null
let lastCell = ''

function hit(e: PointerEvent): { s: number; step: number } | null {
  const r = cv.value!.getBoundingClientRect()
  const x = e.clientX - r.left - LABEL_W
  const y = e.clientY - r.top - HEAD_H
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

function onDown(e: PointerEvent) {
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
  if (e.buttons === 0 || (paint === null && lastCell === '')) return
  const h = hit(e)
  if (h && h.step >= 0) apply(h.s, h.step)
}

function onUp() {
  paint = null
  lastCell = ''
}

// ---- velocity lane -----------------------------------------------------------

let velTarget: import('../core/types').NoteEvent | null = null

function velAt(e: PointerEvent) {
  const r = vel.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function velDown(e: PointerEvent) {
  const { x, y } = velAt(e)
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
      <div class="chips">
        <button class="btn" :title="quantTicks ? 'Quantize all notes to the grid' : 'Quantize is off (Settings)'" @click="quantizeCurrent(true)">Quantize</button>
        <button class="btn" @click="doubleCurrent">×2</button>
        <button class="btn" title="Shift pattern one step left" @click="shiftCurrent(-1)">◀</button>
        <button class="btn" title="Shift pattern one step right" @click="shiftCurrent(1)">▶</button>
        <button class="btn danger" @click="clearCurrentSound">Clear sound</button>
        <button class="btn danger" @click="clearCurrentPattern">Clear pattern</button>
      </div>
    </div>
    <div ref="wrap" class="canvases">
      <canvas ref="cv" @pointerdown.prevent="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" />
      <canvas ref="vel" class="vel" @pointerdown.prevent="velDown" @pointermove="velMove" @pointerup="velUp" @pointercancel="velUp" />
    </div>
  </div>
</template>

<style scoped>
.pv { display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 0; }
.tools { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
.chips { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.canvases { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-x: hidden; }
canvas { display: block; touch-action: none; border-radius: 4px; cursor: crosshair; }
canvas.vel { cursor: ns-resize; }
</style>
