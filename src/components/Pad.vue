<script setup lang="ts">
import { computed } from 'vue'

export interface PadState {
  label: string
  sub?: string
  color: string
  on?: boolean // steady lit
  selected?: boolean
  muted?: boolean
  blink?: boolean
  head?: boolean // playhead
  level: number // flash level 0..1
}

const props = defineProps<{ state: PadState }>()
const emit = defineEmits<{ down: [velocity: number]; up: []; drop: [files: File[]] }>()

const style = computed(() => {
  const s = props.state
  const base = s.on ? 0.42 : 0.08
  const lvl = Math.min(1, Math.max(base, s.level) + (s.head ? 0.4 : 0))
  return { '--c': s.color, '--lvl': lvl.toFixed(3) }
})

function velocityOf(e: PointerEvent): number {
  if ((e.pointerType === 'pen' || e.pointerType === 'touch') && e.pressure > 0 && e.pressure !== 0.5) {
    return Math.round(30 + e.pressure * 97)
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  return Math.round(127 - Math.min(1, Math.max(0, y)) * 62)
}

function onDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  emit('down', velocityOf(e))
}

function onDrop(e: DragEvent) {
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aif|aiff)$/i.test(f.name))
  if (files.length) emit('drop', files)
}
</script>

<template>
  <button
    class="pad"
    :class="{ selected: state.selected, muted: state.muted, blink: state.blink }"
    :aria-label="`Pad ${state.sub ? state.sub.toUpperCase() + ' ' : ''}${state.label}`"
    :aria-pressed="state.selected || undefined"
    :style="style"
    @pointerdown.prevent="onDown"
    @pointerup="emit('up')"
    @pointercancel="emit('up')"
    @contextmenu.prevent
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <span class="sub mono">{{ state.sub }}</span>
    <span class="label">{{ state.label }}</span>
  </button>
</template>

<style scoped>
.pad {
  --c: #fff;
  --lvl: 0.08;
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  border: 1px solid #000;
  border-radius: 10px;
  padding: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  touch-action: none;
  background:
    radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--c) calc(var(--lvl) * 100%), #26262b), color-mix(in srgb, var(--c) calc(var(--lvl) * 55%), #17171a));
  box-shadow:
    0 0 calc(var(--lvl) * 26px) color-mix(in srgb, var(--c) calc(var(--lvl) * 90%), transparent),
    inset 0 1px 0 #ffffff14,
    inset 0 -3px 6px #0008,
    0 3px 5px #000a;
  transition: box-shadow 0.05s;
  overflow: hidden;
}
.pad.selected { outline: 2px solid color-mix(in srgb, var(--c) 80%, #fff); outline-offset: -4px; }
.pad.muted { filter: grayscale(0.9) brightness(0.6); }
.pad.blink { animation: pb 0.45s steps(2) infinite; }
@keyframes pb { 50% { filter: brightness(1.7); } }
.label {
  font-size: 11px;
  font-weight: 700;
  padding: 0 3px 7px;
  color: color-mix(in srgb, #fff calc(40% + var(--lvl) * 60%), #9a9aa4);
  text-shadow: 0 1px 2px #000;
  line-height: 1.05;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.sub {
  position: absolute;
  top: 5px;
  left: 7px;
  font-size: 9px;
  opacity: 0.55;
  text-transform: uppercase;
}
</style>
