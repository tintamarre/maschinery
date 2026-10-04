<script setup lang="ts">
import { computed, ref } from 'vue'
import type { KnobDef } from '../core/types'

const props = defineProps<{ k: KnobDef }>()

const dragging = ref(false)
let startY = 0
let startVal = 0

const norm = computed(() => {
  const { min, max, value } = props.k
  return max === min ? 0 : (value - min) / (max - min)
})
const bipolar = computed(() => props.k.min < 0)

const SWEEP = 270
const R = 24

function polar(angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [32 + R * Math.cos(a), 32 + R * Math.sin(a)]
}

function arc(from: number, to: number): string {
  if (Math.abs(to - from) < 0.5) return ''
  const [x1, y1] = polar(from)
  const [x2, y2] = polar(to)
  const large = Math.abs(to - from) > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} ${to > from ? 1 : 0} ${x2} ${y2}`
}

const startAngle = -SWEEP / 2
const valueAngle = computed(() => startAngle + norm.value * SWEEP)
const trackPath = arc(startAngle, startAngle + SWEEP)
const valuePath = computed(() => (bipolar.value ? arc(0, valueAngle.value) : arc(startAngle, valueAngle.value)))
const tip = computed(() => polar(valueAngle.value))

function snap(v: number): number {
  const { min, max, step } = props.k
  const s = Math.round((v - min) / step) * step + min
  return Math.min(max, Math.max(min, Number(s.toFixed(4))))
}

function onDown(e: PointerEvent) {
  if (!props.k.label) return
  dragging.value = true
  startY = e.clientY
  startVal = props.k.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  const range = props.k.max - props.k.min
  const px = e.shiftKey ? 700 : 180
  props.k.set(snap(startVal + ((startY - e.clientY) / px) * range))
}

function onUp() {
  dragging.value = false
}

function onWheel(e: WheelEvent) {
  if (!props.k.label) return
  const range = props.k.max - props.k.min
  const dir = e.deltaY < 0 ? 1 : -1
  const stepSize = Math.max(props.k.step, range / (e.shiftKey ? 400 : 60))
  props.k.set(snap(props.k.value + dir * stepSize))
}

function reset() {
  if (props.k.label) props.k.set(props.k.def)
}

function onKey(e: KeyboardEvent) {
  if (!props.k.label) return
  const range = props.k.max - props.k.min
  const small = Math.max(props.k.step, range / 100)
  const big = Math.max(props.k.step, range / 10)
  const map: Record<string, number> = { ArrowUp: small, ArrowRight: small, ArrowDown: -small, ArrowLeft: -small, PageUp: big, PageDown: -big }
  if (e.key in map) { e.preventDefault(); e.stopPropagation(); props.k.set(snap(props.k.value + map[e.key]!)) }
  else if (e.key === 'Home') { e.preventDefault(); props.k.set(props.k.min) }
  else if (e.key === 'End') { e.preventDefault(); props.k.set(props.k.max) }
  else if (e.key === 'Enter') { e.preventDefault(); reset() }
}
</script>

<template>
  <div class="knob" :class="{ empty: !k.label, drag: dragging }">
    <div class="lbl">{{ k.label || '&nbsp;' }}</div>
    <svg
      viewBox="0 0 64 64"
      class="dial"
      role="slider"
      :tabindex="k.label ? 0 : -1"
      :aria-label="k.label"
      :aria-valuemin="k.min"
      :aria-valuemax="k.max"
      :aria-valuenow="k.value"
      :aria-valuetext="k.text"
      @keydown="onKey"
      @pointerdown.prevent="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel.prevent="onWheel"
      @dblclick="reset"
    >
      <circle cx="32" cy="32" r="29" class="cap" />
      <path :d="trackPath" class="track" />
      <path v-if="k.label" :d="valuePath" class="val" />
      <line v-if="k.label" x1="32" y1="32" :x2="tip[0]" :y2="tip[1]" class="needle" />
    </svg>
    <div class="txt mono">{{ k.text || '&nbsp;' }}</div>
  </div>
</template>

<style scoped>
.knob { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
.lbl { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6f8593; height: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.txt { font-size: 11px; color: #cfe0ea; height: 14px; }
.dial:focus-visible { outline: 2px solid var(--g); outline-offset: 2px; border-radius: 50%; }
.dial { width: 100%; max-width: 62px; aspect-ratio: 1; touch-action: none; cursor: ns-resize; }
.cap { fill: url(#none); fill: #232328; stroke: #000; stroke-width: 2; }
.track { fill: none; stroke: #0c0c0e; stroke-width: 5; stroke-linecap: round; }
.val { fill: none; stroke: var(--g); stroke-width: 5; stroke-linecap: round; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--g) 60%, transparent)); }
.needle { stroke: #e8e8ee; stroke-width: 2.5; stroke-linecap: round; transform-origin: 32px 32px; }
.drag .cap { fill: #2c2c33; }
.empty .dial { opacity: 0.25; pointer-events: none; }
</style>
