<script setup lang="ts">
import { CHORD_QUALITIES, NOTE_NAMES, QUANTIZE, REPEAT_RATES, SCALES } from '../core/constants'
import { midiSupported } from '../core/midi'
import { chooseMidiChannel, chooseMidiInput, enableMidi, settings, toast, ui } from '../store'

const shortcuts: [string, string][] = [
  ['Z X C V · A S D F · Q W E R · 1 2 3 4', 'Pads 1–16 (same layout as the hardware)'],
  ['Space', 'Play / stop'],
  ['Enter', 'Record (with count-in when stopped)'],
  ['B / G / N / T', 'Note repeat / fixed velocity / metronome / tap tempo'],
  ['Backspace · Shift · Alt · M · L', 'Hold: Erase · Duplicate · Select · Mute · Solo'],
  ['Tab', 'Cycle pad mode'],
  ['← →', 'Previous / next group'],
  ['↑ ↓', 'Tempo ±1 (Shift: ±10)'],
  [', .', 'Octave down / up (keyboard & chords)'],
  ['Cmd/Ctrl + Z · + Shift', 'Undo / redo pattern edits'],
  ['MIDI notes 36–51', 'Pads 1–16, velocity sensitive; CC 70–77 = knobs, CC 1 = touch strip, pitch bend'],
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
  <div class="st scroll-y">
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
      <h3>Shortcuts</h3>
      <table>
        <tr v-for="[k, d] in shortcuts" :key="k"><td class="mono">{{ k }}</td><td class="sub">{{ d }}</td></tr>
      </table>
    </section>
    <section>
      <button class="btn danger" @click="reset">Reset all saved data</button>
    </section>
  </div>
</template>

<style scoped>
.st { display: flex; flex-direction: column; gap: 12px; max-height: 330px; }
section { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
input[type='number'] { width: 60px; }
table { border-collapse: collapse; font-size: 11px; }
td { padding: 2px 14px 2px 0; vertical-align: top; }
td.mono { color: #cfe0ea; white-space: nowrap; }
</style>
