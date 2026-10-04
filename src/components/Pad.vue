<script setup lang="ts">
import { ref } from 'vue'
import type { PadDef } from '../composables/useSynth'

defineProps<{ pad: PadDef }>()
const emit = defineEmits<{ hit: [pad: PadDef, velocity: number] }>()

const active = ref(false)
let timer: number | undefined

// Public so the parent can flash the pad on keyboard hits
function flash() {
  active.value = true
  clearTimeout(timer)
  timer = window.setTimeout(() => (active.value = false), 120)
}
defineExpose({ flash })

// No real pressure on mouse/touch: use hit position (higher = louder)
function onDown(e: PointerEvent, pad: PadDef) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const velocity = 0.5 + 0.5 * (1 - (e.clientY - rect.top) / rect.height)
  flash()
  emit('hit', pad, velocity)
}
</script>

<template>
  <button
    class="relative aspect-square rounded-lg border-2 border-dark-700 bg-dark-800 transition-all duration-100 select-none"
    style="touch-action: none"
    :style="active ? { backgroundColor: pad.color, boxShadow: `0 0 24px ${pad.color}`, borderColor: pad.color } : { borderColor: pad.color + '55' }"
    @pointerdown.prevent="onDown($event, pad)"
  >
    <span class="absolute left-2 top-1 text-xs font-mono uppercase opacity-60">{{ pad.key }}</span>
    <span class="text-sm font-semibold" :class="active ? 'text-black' : 'text-white'">{{ pad.name }}</span>
  </button>
</template>
