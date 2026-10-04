<script setup lang="ts">
import { computed, ref } from 'vue'
import { stripInput, ui, type StripMode } from '../store'

const el = ref<HTMLElement | null>(null)
const modes: { id: StripMode; label: string }[] = [
  { id: 'pitch', label: 'Pitch' },
  { id: 'filter', label: 'Filter' },
  { id: 'mod', label: 'Mod' },
]

function pos(e: PointerEvent): number {
  const r = el.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))
}

function down(e: PointerEvent) {
  el.value!.setPointerCapture(e.pointerId)
  stripInput(pos(e), true)
}
function move(e: PointerEvent) {
  if (ui.stripActive) stripInput(pos(e), true)
}
function up() {
  if (ui.stripActive) stripInput(ui.stripValue, false)
}

const leds = Array.from({ length: 25 }, (_, i) => i)
const lit = computed(() => Math.round(ui.stripValue * 24))
</script>

<template>
  <div class="strip-wrap">
    <div
      ref="el"
      class="strip"
      :class="{ active: ui.stripActive }"
      @pointerdown.prevent="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <i v-for="i in leds" :key="i" :class="{ on: ui.stripMode === 'pitch' ? (i >= Math.min(12, lit) && i <= Math.max(12, lit)) : i <= lit }" />
    </div>
    <div class="modes">
      <button v-for="m in modes" :key="m.id" :class="{ on: ui.stripMode === m.id }" @click="ui.stripMode = m.id">{{ m.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.strip-wrap { display: flex; flex-direction: column; gap: 6px; align-items: center; }
.strip {
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  width: 26px;
  height: 100%;
  min-height: 150px;
  padding: 5px;
  border-radius: 13px;
  background: #0c0c0e;
  box-shadow: inset 0 0 0 1px #000, 0 1px 0 #3a3a42;
  touch-action: none;
  cursor: pointer;
}
.strip i { flex: 1; border-radius: 2px; background: #1c1c20; }
.strip i.on { background: var(--g); box-shadow: 0 0 6px var(--g); }
.modes { display: flex; flex-direction: column; gap: 3px; }
.modes button { font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 4px; border: 0; border-radius: 3px; background: #1d1d21; color: #888; }
.modes button.on { background: var(--g); color: #000; }
</style>
