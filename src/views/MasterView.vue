<script setup lang="ts">
import { DELAY_DIVS, REPEAT_RATES } from '../core/constants'
import { project, setMaster, setPerformFilter, setStutter, setSwing, setTempo, setThrow, settings, tapTempo, ui } from '../store'

const m = project.master

function num(e: Event): number {
  return Number((e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="mv">
    <section>
      <h3>Timing</h3>
      <div class="big">
        <div class="tempo">
          <button class="btn" @click="setTempo(project.tempo - 1)">−</button>
          <input type="number" class="mono" :value="project.tempo" min="40" max="240" step="0.5" @change="setTempo(num($event))" />
          <button class="btn" @click="setTempo(project.tempo + 1)">+</button>
          <button class="btn" @click="tapTempo">Tap</button>
          <span class="sub">BPM</span>
        </div>
        <label><span>Swing</span><input type="range" min="50" max="75" step="1" :value="project.swing" @input="setSwing(num($event))" /><em class="mono">{{ project.swing }}%</em></label>
        <label><span>Quantize</span>
          <select v-model.number="settings.quantize"><option :value="0">Off</option><option :value="1">1/4</option><option :value="2">1/8</option><option :value="3">1/16</option><option :value="4">1/32</option></select>
        </label>
      </div>
    </section>

    <section>
      <h3>Master &amp; effects</h3>
      <div class="grid">
        <label><span>Volume</span><input type="range" min="0" max="1" step="0.01" :value="m.volume" @input="setMaster('volume', num($event))" /></label>
        <label><span>Compressor</span><input type="range" min="0" max="1" step="0.01" :value="m.comp" @input="setMaster('comp', num($event))" /></label>
        <label><span>Reverb size</span><input type="range" min="0" max="1" step="0.01" :value="m.reverbSize" @input="setMaster('reverbSize', num($event))" /></label>
        <label><span>Reverb level</span><input type="range" min="0" max="1.5" step="0.01" :value="m.reverbLevel" @input="setMaster('reverbLevel', num($event))" /></label>
        <label><span>Delay time</span>
          <select :value="m.delayDiv" @change="setMaster('delayDiv', num($event))"><option v-for="(d, i) in DELAY_DIVS" :key="d.label" :value="i">{{ d.label }}</option></select>
        </label>
        <label><span>Delay feedback</span><input type="range" min="0" max="0.92" step="0.01" :value="m.delayFeedback" @input="setMaster('delayFeedback', num($event))" /></label>
        <label><span>Delay level</span><input type="range" min="0" max="1.5" step="0.01" :value="m.delayLevel" @input="setMaster('delayLevel', num($event))" /></label>
        <label><span>Delay tone</span><input type="range" min="0" max="1" step="0.01" :value="m.delayTone" @input="setMaster('delayTone', num($event))" /></label>
      </div>
    </section>

    <section>
      <h3>Perform FX <span class="sub">(hold)</span></h3>
      <div class="fx">
        <button
          v-for="(r, i) in REPEAT_RATES"
          :key="r.label"
          class="chip big"
          :class="{ on: ui.stutter === i + 1 }"
          @pointerdown.prevent="setStutter(i + 1)"
          @pointerup="setStutter(0)"
          @pointerleave="ui.stutter === i + 1 && setStutter(0)"
        >Stutter {{ r.label }}</button>
        <button class="chip big" :class="{ on: ui.reverbThrow }" @pointerdown.prevent="setThrow('reverb', true)" @pointerup="setThrow('reverb', false)" @pointerleave="ui.reverbThrow && setThrow('reverb', false)">Reverb throw</button>
        <button class="chip big" :class="{ on: ui.delayThrow }" @pointerdown.prevent="setThrow('delay', true)" @pointerup="setThrow('delay', false)" @pointerleave="ui.delayThrow && setThrow('delay', false)">Delay throw</button>
        <button class="chip big" :class="{ on: ui.perfFilter !== null }" @click="setPerformFilter(null)">Filter reset</button>
      </div>
      <p class="sub">Filter sweep: use the touch strip in <b>Filter</b> mode (left = low-pass, right = high-pass).</p>
    </section>
  </div>
</template>

<style scoped>
.mv { display: flex; flex-direction: column; gap: 12px; }
section { display: flex; flex-direction: column; gap: 6px; }
.big { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: center; }
.tempo { display: flex; align-items: center; gap: 5px; }
.tempo input { width: 76px; font-size: 22px !important; text-align: center; color: var(--g) !important; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 20px; }
label { display: grid; grid-template-columns: 96px 1fr 44px; align-items: center; gap: 8px; font-size: 11px; color: #8ea3b0; }
label span { color: #5d7280; }
.fx { display: flex; flex-wrap: wrap; gap: 5px; }
.chip.big { height: 30px; padding: 0 12px; }
em { font-style: normal; font-size: 10px; text-align: right; }
p { margin: 0; }
</style>
