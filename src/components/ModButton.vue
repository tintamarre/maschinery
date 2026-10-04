<script setup lang="ts">
import HwButton from './HwButton.vue'
import { ui } from '../store'

type Mod = 'erase' | 'duplicate' | 'select' | 'solo' | 'mute'
const props = defineProps<{ mod: Mod; label?: string; title?: string }>()

// tap = latch on/off, hold (> 350 ms) = momentary
let downAt = 0
let wasOn = false

function down() {
  downAt = performance.now()
  wasOn = ui[props.mod]
  ui[props.mod] = true
}

function up() {
  if (!downAt) return
  const held = performance.now() - downAt
  downAt = 0
  if (held > 350) ui[props.mod] = false
  else if (wasOn) ui[props.mod] = false
}
</script>

<template>
  <span @pointerdown="down" @pointerup="up" @pointerleave="up" @pointercancel="up">
    <HwButton :label="label ?? mod" :on="ui[mod]" :title="title" />
  </span>
</template>
