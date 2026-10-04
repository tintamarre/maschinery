<script setup lang="ts">
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { sampleBuffers } from '../core/samples'
import {
  assignSampleFiles, chopSample, resampleGroupToPad, currentGroup, currentSound, previewSound, setEngine, setSoundParam, toggleMic, ui,
} from '../store'

const cv = ref<HTMLCanvasElement | null>(null)
const file = ref<HTMLInputElement | null>(null)
const poll = ref(0)
let timer = 0

// samples restore asynchronously after a reload; poll until the buffer shows up
onMounted(() => { timer = window.setInterval(() => poll.value++, 600) })
onUnmounted(() => clearInterval(timer))

function draw() {
  void poll.value
  const c = cv.value
  if (!c) return
  const w = c.clientWidth || 600
  const h = 120
  const dpr = window.devicePixelRatio || 1
  c.width = w * dpr
  c.height = h * dpr
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#05090c'
  ctx.fillRect(0, 0, w, h)
  const id = currentSound.value.sampleId
  const buf = id ? sampleBuffers.get(id) : null
  const p = currentSound.value.params
  if (!buf) {
    ctx.fillStyle = '#5d7280'
    ctx.font = '12px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(currentSound.value.engine === 'sample' ? 'No sample loaded — load a file, drop one on a pad, or record' : 'This pad is a synth. Switch it to a sampler to load audio.', w / 2, h / 2)
    return
  }
  const data = buf.getChannelData(0)
  const per = data.length / w
  ctx.fillStyle = '#0f1c24'
  ctx.fillRect(p.start * w, 0, (p.end - p.start) * w, h)
  ctx.strokeStyle = '#4cc9f0'
  ctx.beginPath()
  for (let x = 0; x < w; x++) {
    let mn = 1
    let mx = -1
    const a = Math.floor(x * per)
    const b = Math.min(data.length, Math.floor((x + 1) * per) + 1)
    const stride = Math.max(1, Math.floor((b - a) / 32))
    for (let i = a; i < b; i += stride) {
      const v = data[i]!
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    ctx.moveTo(x + 0.5, h / 2 - mx * (h / 2 - 3))
    ctx.lineTo(x + 0.5, h / 2 - mn * (h / 2 - 3))
  }
  ctx.stroke()
  ctx.fillStyle = '#000a'
  ctx.fillRect(0, 0, p.start * w, h)
  ctx.fillRect(p.end * w, 0, w - p.end * w, h)
  const grp = currentGroup.value.color
  ctx.fillStyle = grp
  ctx.fillRect(p.start * w - 1, 0, 2, h)
  ctx.fillRect(p.end * w - 1, 0, 2, h)
  // slice markers for other pads that share this sample
  ctx.fillStyle = '#ffffff55'
  currentGroup.value.sounds.forEach((s, i) => {
    if (s.sampleId === id && i !== ui.sound) ctx.fillRect(s.params.start * w, 0, 1, h)
  })
}
watchEffect(draw)

let drag: 'start' | 'end' | null = null
function down(e: PointerEvent) {
  const r = cv.value!.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const p = currentSound.value.params
  drag = Math.abs(x - p.start) <= Math.abs(x - p.end) ? 'start' : 'end'
  cv.value!.setPointerCapture(e.pointerId)
  move(e)
}
function move(e: PointerEvent) {
  if (!drag) return
  const r = cv.value!.getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  const p = currentSound.value.params
  if (drag === 'start') setSoundParam(ui.group, ui.sound, 'start', Math.min(x, p.end - 0.005))
  else setSoundParam(ui.group, ui.sound, 'end', Math.max(x, p.start + 0.005))
}
function up() { drag = null }

function onFile(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  if (files.length) void assignSampleFiles(ui.group, ui.sound, files)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div class="sm">
    <div class="bar">
      <h3>Sampler · pad {{ ui.sound + 1 }} · {{ currentSound.name }}</h3>
      <button v-if="currentSound.engine !== 'sample'" class="btn primary" @click="setEngine(ui.group, ui.sound, 'sample')">Make this pad a sampler</button>
      <button class="btn" title="Several files fill consecutive pads" @click="file?.click()">Load files…</button>
      <input ref="file" type="file" accept="audio/*" multiple hidden @change="onFile" />
      <button class="btn" :class="{ primary: ui.micRecording }" @click="toggleMic">{{ ui.micRecording ? '■ Stop recording' : '● Record mic' }}</button>
      <button class="btn" @click="previewSound()">Audition</button>
      <button class="btn" @click="chopSample('equal')">Chop 16 equal</button>
      <button class="btn" @click="chopSample('transients')">Chop by transients</button>
      <button class="btn" title="Render the current pattern of this group, with effects, into this pad" @click="resampleGroupToPad">Resample group</button>
    </div>
    <canvas ref="cv" class="wave" @pointerdown.prevent="down" @pointermove="move" @pointerup="up" @pointercancel="up" />
    <p class="sub">Drag the markers to set start and end. Chopping spreads slices over the 16 pads of the group. Drop one or several audio files on a pad: several files fill consecutive pads. “Resample group” renders this group's pattern into the selected pad.</p>
  </div>
</template>

<style scoped>
.sm { display: flex; flex-direction: column; gap: 8px; }
.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.bar h3 { margin-right: 8px; }
.wave { width: 100%; height: 120px; border-radius: 6px; border: 1px solid #16222a; touch-action: none; cursor: col-resize; }
p { margin: 0; }
</style>
