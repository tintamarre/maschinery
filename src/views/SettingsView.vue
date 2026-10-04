<script setup lang="ts">
import { ref } from 'vue'
import { CHORD_QUALITIES, NOTE_NAMES, QUANTIZE, REPEAT_RATES, SCALES } from '../core/constants'
import { midiSupported } from '../core/midi'
import {
  chooseMidiChannel, chooseMidiInput, chooseMidiOutput, enableMidi, settings, startCalibration, toast, ui,
} from '../store'

const tab = ref<'general' | 'midi' | 'keys'>('general')

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
  ['Cmd/Ctrl+A / C / V / D', 'Pattern editor: select all / copy / paste / duplicate'],
  ['Delete · Esc', 'Pattern editor: delete selection · deselect'],
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
    <div class="tabs">
      <button class="chip" :class="{ on: tab === 'general' }" @click="tab = 'general'">General</button>
      <button class="chip" :class="{ on: tab === 'midi' }" @click="tab = 'midi'">MIDI</button>
      <button class="chip" :class="{ on: tab === 'keys' }" @click="tab = 'keys'">Shortcuts</button>
    </div>

    <div v-if="tab === 'general'" class="cols">
      <section>
        <h3>Recording</h3>
        <div class="row">
          <label class="sub">Quantize <select v-model.number="settings.quantize"><option v-for="(q, i) in QUANTIZE" :key="q.label" :value="i">{{ q.label }}</option></select></label>
          <label class="sub">Count-in <select v-model.number="settings.countIn"><option :value="0">Off</option><option v-for="n in [1, 2, 4]" :key="n" :value="n">{{ n }} bar</option></select></label>
          <label class="sub">Note repeat <select v-model.number="settings.repeatRate"><option v-for="(r, i) in REPEAT_RATES" :key="r.label" :value="i">{{ r.label }}</option></select></label>
          <label class="sub"><input v-model="settings.metronome" type="checkbox" /> Metronome</label>
        </div>
        <div class="row">
          <label class="sub">Latency comp. <input v-model.number="settings.latency" type="number" min="-50" max="150" class="mono" /> ms</label>
          <button class="btn" :disabled="ui.calibrating" title="Tap along with 12 clicks (any key or click) to measure your recording latency" @click="startCalibration">{{ ui.calibrating ? `Tap along… ${ui.calibCount}` : 'Calibrate' }}</button>
        </div>
      </section>
      <section>
        <h3>Keyboard &amp; chords</h3>
        <div class="row">
          <label class="sub">Scale <select v-model="settings.scale"><option v-for="(_, n) in SCALES" :key="n">{{ n }}</option></select></label>
          <label class="sub">Root <select v-model.number="settings.root"><option v-for="(n, i) in NOTE_NAMES" :key="n" :value="i">{{ n }}</option></select></label>
        </div>
        <div class="row">
          <label class="sub">Octave <input v-model.number="settings.octave" type="number" min="-3" max="3" class="mono" /></label>
          <label class="sub">Chords <select v-model.number="ui.chordQuality"><option v-for="(q, i) in CHORD_QUALITIES" :key="q" :value="i">{{ q }}</option></select></label>
        </div>
      </section>
      <section>
        <h3>Playback</h3>
        <div class="row"><label class="sub"><input v-model="settings.songLoop" type="checkbox" /> Loop the song</label><label class="sub"><input v-model="settings.follow" type="checkbox" /> Follow playhead in step mode</label></div>
      </section>
      <section>
        <h3>Data</h3>
        <div class="row"><button class="btn danger" @click="reset">Reset all saved data</button></div>
        <p class="sub">Clears the autosaved project, saved slots and settings of this browser.</p>
      </section>
    </div>

    <div v-else-if="tab === 'midi'" class="cols">
      <p v-if="!midiSupported" class="sub wide">Web MIDI is not available in this browser (use Chrome or Edge on desktop or Android).</p>
      <template v-else>
        <section>
          <h3>Input</h3>
          <div class="row">
            <button class="btn primary" @click="enableMidi">{{ ui.midiReady ? 'Rescan devices' : 'Enable MIDI' }}</button>
          </div>
          <div class="row">
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
          </div>
          <p class="sub">Notes 36–51 play pads 1–16 (velocity sensitive), CC 70–77 move the knobs, CC 1 the touch strip, plus pitch bend and MIDI start/stop.</p>
        </section>
        <section>
          <h3>Output</h3>
          <div class="row">
            <select :value="settings.midiOutput" :disabled="!ui.midiReady" @change="chooseMidiOutput(($event.target as HTMLSelectElement).value)">
              <option value="none">None</option>
              <option v-for="p in ui.midiOutPorts" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <label class="sub">Channel
              <select v-model.number="settings.midiOutChannel">
                <option :value="0">By group (A = 1…)</option>
                <option v-for="c in 16" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
          </div>
          <div class="row">
            <label class="sub"><input v-model="settings.midiClockOut" type="checkbox" /> Clock + start/stop</label>
            <label class="sub"><input v-model="settings.midiNoteOut" type="checkbox" /> Notes</label>
          </div>
          <p class="sub">Drum sounds send notes 36–51 (pad number), melodic sounds send the played note around C3 (60). Messages are time-stamped to line up with the audio you hear.</p>
        </section>
      </template>
    </div>

    <div v-else class="keys">
      <div v-for="[k, d] in shortcuts" :key="k"><b class="mono">{{ k }}</b><span class="sub">{{ d }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.st { display: flex; flex-direction: column; gap: 10px; }
.tabs { display: flex; gap: 4px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; align-content: start; }
section { display: flex; flex-direction: column; gap: 6px; }
.wide { grid-column: 1 / -1; }
.row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
input[type='number'] { width: 60px; }
p { margin: 0; line-height: 1.35; }
.keys { display: grid; grid-template-columns: 1fr; gap: 3px; font-size: 11px; }
.keys div { display: grid; grid-template-columns: 17rem 1fr; gap: 12px; align-items: baseline; padding: 2px 0; border-bottom: 1px solid #0f1b22; }
.keys b { color: #cfe0ea; font-weight: 600; }
</style>
