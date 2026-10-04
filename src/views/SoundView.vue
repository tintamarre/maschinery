<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ENGINES, ENGINE_LABELS } from '../core/project'
import type { EngineId, SoundParams } from '../core/types'
import {
  PARAM_META, copySound, currentGroup, snapshotSlot, currentSound, getEngine, previewSound, renameSound, setEngine, setSoundParam, toggleMuteSound,
  toggleSoloSound, ui,
} from '../store'

const keys = Object.keys(PARAM_META) as (keyof SoundParams)[]
const PAGES = [
  ['pitch', 'attack', 'decay', 'tone', 'drive', 'cutoff', 'reso', 'volume'],
  ['pan', 'reverb', 'delay', 'velSens', 'choke', 'gate', 'start', 'end'],
  ['hp', 'crush', 'reverse'],
]
const activeKeys = computed(() => PAGES[ui.page] ?? PAGES[0]!)

function onInput(key: keyof SoundParams, e: Event) {
  setSoundParam(ui.group, ui.sound, key, Number((e.target as HTMLInputElement).value))
}

function onEngine(e: Event) {
  setEngine(ui.group, ui.sound, (e.target as HTMLSelectElement).value as EngineId)
}

// oscilloscope
const scope = ref<HTMLCanvasElement | null>(null)
let raf = 0
const data = new Float32Array(1024)

function loop() {
  const c = scope.value
  const e = getEngine()
  if (c) {
    const ctx = c.getContext('2d')!
    const w = c.width
    const h = c.height
    ctx.fillStyle = '#05090c'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#13222b'
    ctx.beginPath()
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
    if (e) {
      e.getWaveform(data)
      ctx.strokeStyle = getComputedStyle(c).getPropertyValue('--g') || '#ff4d6d'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * w
        const y = h / 2 - data[i]! * (h / 2 - 4)
        if (i) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
      ctx.stroke()
    }
  }
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop) })
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="sv">
    <div class="top">
      <div class="who">
        <h3>Sound {{ ui.sound + 1 }} · Group {{ currentGroup.name }}</h3>
        <div class="line">
        <input type="text" :value="currentSound.name" maxlength="18" @input="renameSound(ui.group, ui.sound, ($event.target as HTMLInputElement).value)" />
        <select :value="currentSound.engine" @change="onEngine">
          <option v-for="id in ENGINES" :key="id" :value="id">{{ ENGINE_LABELS[id] }}</option>
        </select>
        </div>
      </div>
      <div class="acts">
        <button class="btn primary" @click="previewSound()">Audition</button>
        <button class="btn" :class="{ primary: currentSound.mute }" @click="toggleMuteSound(ui.group, ui.sound)">Mute</button>
        <button class="btn" :class="{ primary: currentSound.solo }" @click="toggleSoloSound(ui.group, ui.sound)">Solo</button>
        <button class="btn" title="Copy this sound to the next pad" @click="copySound(ui.group, ui.sound, (ui.sound + 1) % 16)">Copy → next</button>
      </div>
      <div class="snaps">
        <span class="sub">Snapshots</span>
        <button v-for="n in 8" :key="n" class="chip" :class="{ on: ui.snap[ui.group] === n - 1, dim: !currentGroup.snapshots[n - 1] }" :title="currentGroup.snapshots[n - 1] ? 'Recall (all 16 sounds)' : 'Store the current sound settings here'" @click="snapshotSlot(ui.group, n - 1)">{{ n }}</button>
        <button class="chip" :class="{ on: ui.snapArm }" title="Store into the next slot you click" @click="ui.snapArm = !ui.snapArm">Store</button>
      </div>
      <canvas ref="scope" width="300" height="48" class="scope" />
    </div>
    <div class="params">
      <label v-for="k in keys" :key="k" :class="{ hot: activeKeys.includes(k) }">
        <span>{{ PARAM_META[k].label }}</span>
        <input type="range" :min="PARAM_META[k].min" :max="PARAM_META[k].max" :step="PARAM_META[k].step" :value="currentSound.params[k]" @input="onInput(k, $event)" />
        <em class="mono">{{ PARAM_META[k].fmt(currentSound.params[k]) }}</em>
      </label>
    </div>
  </div>
</template>

<style scoped>
.sv { display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: flex-end; }
.who { display: flex; flex-direction: column; gap: 4px; }
.line { display: flex; gap: 6px; }
.line input { width: 130px; }
.who h3 { margin-bottom: 2px; }
.acts { display: flex; gap: 5px; flex-wrap: wrap; }
.snaps { display: flex; gap: 3px; align-items: center; }
.scope { margin-left: auto; border-radius: 4px; border: 1px solid #16222a; max-width: 100%; }
.params { margin-top: 2px; display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 2px 16px; }
label { display: grid; grid-template-columns: 54px 1fr 46px; align-items: center; gap: 6px; font-size: 11px; color: #5d7280; padding: 0; }
label.hot { color: #cfe0ea; }
label.hot span { color: var(--g); }
em { font-style: normal; text-align: right; font-size: 10px; }
</style>
