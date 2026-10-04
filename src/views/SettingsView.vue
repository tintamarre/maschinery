<script setup lang="ts">
import { CHORD_QUALITIES, NOTE_NAMES, QUANTIZE, REPEAT_RATES, SCALES } from '../core/constants'
import { midiSupported } from '../core/midi'
import { chooseMidiChannel, chooseMidiInput, enableMidi, settings, toast, ui } from '../store'

const shortcuts: [string, string][] = [
  ['Z X C V / A S D F / Q W E R / 1 2 3 4', 'Pads 1–16 (bottom row first)'],
  ['Space', 'Play / stop'],
  ['Enter', 'Record (count-in when stopped)'],
  ['B / G / N / T', 'Repeat / fixed vel / metro / tap'],
  ['Backspace / Shift / Alt / M / L', 'Hold: erase/dup/select/mute/solo'],
  ['Tab', 'Next pad mode'],
  ['← →', 'Previous / next group'],
  ['↑ ↓', 'Tempo ±1 (Shift: ±10)'],
  [', .', 'Octave down / up'],
  ['Cmd/Ctrl+Z (+Shift)', 'Undo / redo pattern edits'],
  ['MIDI 36–51 · CC 70–77 · CC 1', 'Pads · knobs · touch strip (+ pitch bend)'],
]

function reset() {
  if (confirm('Clear all saved data (project, slots, settings) and reload?')) {
    try { localStorage.clear() } catch { /* ignore */ }
    toast('Cleared')
    setTimeout(() => location.reload(), 300)
  }
}
</script>

<template>
  <div class="st">
    <section>
      <h3>MIDI</h3>
      <div class="row">
        <template v-if="midiSupported">
          <button class="btn primary" @click="enableMidi">{{ ui.midiReady ? 'Rescan' : 'Enable MIDI' }}</button>
          <select :value="settings.midiInput" :disabled="!ui.midiReady" @change="chooseMidiInput(($event.target as HTMLSelectElement).value)">
            <option value="all">All inputs</option>
            <option value="none">None</option>
            <option v-for="p in ui.midiPorts" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <label class="sub">Channel
            <select :value="settings.midiChannel" @change="chooseMidiChannel(Number(($event.target as HTMLSelectElement).value))">
              <option :value="0">Omni</option>
              <option v-for="c in 16" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
        </template>
        <span v-else class="sub">Web MIDI is not available in this browser (use Chrome or Edge).</span>
      </div>
    </section>
    <section>
      <h3>Recording</h3>
      <div class="row">
        <label class="sub">Quantize <select v-model.number="settings.quantize"><option v-for="(q, i) in QUANTIZE" :key="q.label" :value="i">{{ q.label }}</option></select></label>
        <label class="sub">Count-in <select v-model.number="settings.countIn"><option :value="0">Off</option><option v-for="n in [1, 2, 4]" :key="n" :value="n">{{ n }} bar</option></select></label>
        <label class="sub">Note repeat <select v-model.number="settings.repeatRate"><option v-for="(r, i) in REPEAT_RATES" :key="r.label" :value="i">{{ r.label }}</option></select></label>
        <label class="sub">Latency comp. <input v-model.number="settings.latency" type="number" min="-50" max="150" class="mono" /> ms</label>
        <label class="sub"><input v-model="settings.metronome" type="checkbox" /> Metronome</label>
      </div>
    </section>
    <section>
      <h3>Keyboard &amp; chords</h3>
      <div class="row">
        <label class="sub">Scale <select v-model="settings.scale"><option v-for="(_, n) in SCALES" :key="n">{{ n }}</option></select></label>
        <label class="sub">Root <select v-model.number="settings.root"><option v-for="(n, i) in NOTE_NAMES" :key="n" :value="i">{{ n }}</option></select></label>
        <label class="sub">Octave <input v-model.number="settings.octave" type="number" min="-3" max="3" class="mono" /></label>
        <label class="sub">Chords <select v-model.number="ui.chordQuality"><option v-for="(q, i) in CHORD_QUALITIES" :key="q" :value="i">{{ q }}</option></select></label>
      </div>
    </section>
    <section>
      <h3>Data</h3>
      <div class="row"><button class="btn danger" @click="reset">Reset all saved data</button></div>
      <p class="sub">Clears the autosaved project, saved slots and settings of this browser.</p>
    </section>
    <section class="wide">
      <h3>Shortcuts</h3>
      <div class="keys">
        <div v-for="[k, d] in shortcuts" :key="k"><b class="mono">{{ k }}</b><span class="sub">{{ d }}</span></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.st { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 22px; align-content: start; }
section { display: flex; flex-direction: column; gap: 6px; }
section.wide { grid-column: 1 / -1; }
.row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
input[type='number'] { width: 60px; }
.keys { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 22px; font-size: 10px; }
.keys div { display: grid; grid-template-columns: 10.5rem 1fr; gap: 8px; align-items: baseline; white-space: nowrap; }
p { margin: 0; }
.keys b { color: #cfe0ea; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.keys span { font-size: 10px; overflow: hidden; text-overflow: ellipsis; }
</style>
