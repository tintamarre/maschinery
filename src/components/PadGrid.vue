<script setup lang="ts">
import { computed } from 'vue'
import Pad, { type PadState } from './Pad.vue'
import { NOTE_NAMES, PAD_KEYS, STEP, soundColor } from '../core/constants'
import {
  assignSampleFile, chordName, currentGroup, currentPattern, keyboardNote, padDown, padUp, playback, settings, ui,
} from '../store'

// top row = pads 13-16 (like the hardware, pad 1 is bottom-left)
const order = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]

function stateFor(i: number): PadState {
  const grp = currentGroup.value
  const color = grp.color
  const level = playback.padLevel[i] ?? 0
  const key = PAD_KEYS[i]
  switch (ui.mode) {
    case 'pad': {
      const s = grp.sounds[i]!
      return { label: s.name, sub: key, color: soundColor(s.engine), on: true, selected: ui.sound === i, muted: s.mute || (grp.sounds.some((x) => x.solo) && !s.solo), level }
    }
    case 'keyboard': {
      const n = keyboardNote(i)
      const isRoot = (((n - settings.root) % 12) + 12) % 12 === 0
      return { label: NOTE_NAMES[((n % 12) + 12) % 12]! + (Math.floor(n / 12) + 3), sub: key, color, on: isRoot, level }
    }
    case 'chords':
      return { label: chordName(i), sub: key, color, on: i % 7 === 0 || i === 0, level }
    case 'step': {
      const step = ui.stepBar * 16 + i
      const pat = currentPattern.value
      const active = pat.events.some((e) => e.s === ui.sound && Math.floor(e.t / STEP) === step)
      const playStep = Math.floor((playback.pos[ui.group] ?? 0) / STEP)
      return {
        label: String(step + 1), sub: key, color: soundColor(grp.sounds[ui.sound]!.engine), on: active, level,
        head: playback.playing && playStep === step,
        muted: step >= pat.bars * 16,
      }
    }
    case 'scene':
      return { label: `Scene ${i + 1}`, sub: key, color: '#ffd60a', on: ui.scene === i, selected: ui.scene === i, level }
    case 'pattern': {
      const pat = grp.patterns[i]!
      const pending = playback.pending[ui.group] === i
      return { label: `Pat ${i + 1}`, sub: key, color, on: grp.pattern === i, selected: grp.pattern === i, blink: pending, muted: pat.events.length === 0 && grp.pattern !== i, level }
    }
  }
}

function onDrop(i: number, f: File) {
  void assignSampleFile(ui.group, i, f)
}

const states = computed(() => order.map((i) => stateFor(i)))
</script>

<template>
  <div class="grid">
    <Pad
      v-for="(i, n) in order"
      :key="i"
      :state="states[n]!"
      @down="(v) => padDown(i, v)"
      @up="padUp(i)"
      @drop="(f) => onDrop(i, f)"
    />
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: clamp(6px, 1.2vw, 12px);
  padding: clamp(8px, 1.4vw, 14px);
  border-radius: 14px;
  background: #0d0d0f;
  box-shadow: inset 0 0 0 1px #000, 0 1px 0 #3a3a42;
}
</style>
