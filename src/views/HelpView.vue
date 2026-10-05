<script setup lang="ts">
import { computed, ref } from 'vue'
import { setView, ui } from '../store'

interface Section {
  id: string
  tab: string
  title: string
  intro: string
  steps: string[]
}

const sections: Section[] = [
  {
    id: 'start', tab: 'Start', title: 'Start in one minute',
    intro: 'Maschinery is a drum machine, sampler and sequencer. Eight groups (A–H) each hold 16 pads and 16 patterns.',
    steps: [
      '<b>Space</b> plays the demo loop, Space again stops it.',
      'Tap the pads or use the keys <b>Z X C V · A S D F · Q W E R · 1 2 3 4</b>. Hit a pad lower for a louder sound.',
      'Click a letter <b>A–H</b> on the left to switch group. Each group has its own sounds and patterns.',
      'The buttons under <b>Screen</b> change what the big display shows. The eight knobs always control that screen.',
      'Everything is saved automatically in this browser. The <b>Tour</b> button in the header shows each area.',
    ],
  },
  {
    id: 'beat', tab: 'Beat', title: 'Make a beat',
    intro: 'A pattern is one to four bars of notes. Build one by clicking, or play it in.',
    steps: [
      '<b>File → New</b> for a blank project (or load a demo song there).',
      'Pick a sound in <b>Pad</b> mode, then switch to <b>Step</b> mode: the 16 pads are the 16 steps of one bar. Press Play and tap steps.',
      'Or open <b>Pattern</b> and click cells with the <b>Draw</b> tool. With <b>Select</b> you can drag a box, move notes, and copy or paste with Cmd/Ctrl+C and V.',
      '<b>Bars 1–4</b> makes the pattern longer. The chips <b>1–16</b> are different patterns of the same group.',
      '<b>Tempo</b> and <b>Swing</b> are the first two knobs on the Pattern and Master screens.',
    ],
  },
  {
    id: 'record', tab: 'Record', title: 'Record what you play',
    intro: 'Rec writes your pad hits into the current pattern, on top of what is already there.',
    steps: [
      'In <b>Pad</b>, <b>Keys</b> or <b>Chords</b> mode press <b>Rec</b> (Enter). After a one bar count-in, play. Press Stop when done.',
      '<b>Setup → General</b> sets <b>Quantize</b> (snap to 1/16 by default), the count-in and the <b>Calibrate</b> latency test.',
      '<b>Repeat</b> (B) rolls a note while you hold the pad. Hold <b>Erase</b> (Backspace) and tap a pad to delete that sound.',
      '<b>Auto</b> + Play + turn a knob records the knob movement into the pattern.',
      'Mistakes: <b>Undo</b> (Cmd/Ctrl+Z). Sampling: <b>Sample → Record mic</b>.',
    ],
  },
  {
    id: 'sound', tab: 'Sound', title: 'Shape the sound',
    intro: 'Every pad is an instrument you can tweak or replace.',
    steps: [
      '<b>Sound</b> shows all settings of the selected pad. The knobs have three pages (the 1 2 3 buttons).',
      'The instrument menu switches the engine (kick, snare, bass, lead, pad, sample…). <b>Browser</b> loads whole kits.',
      '<b>Sample</b>: drop audio files on pads, or Load files. Chop a loop into slices, set loop or reverse.',
      '<b>Keys</b> and <b>Chords</b> play a sound as a scale. Try the Synth Lab kit in Browser.',
      '<b>Mixer</b> balances groups, <b>Master</b> has reverb, delay and compressor. The touch strip bends pitch or sweeps a filter.',
    ],
  },
  {
    id: 'arrange', tab: 'Arrange', title: 'Build a song',
    intro: 'A scene picks one pattern per group. A song chains scenes.',
    steps: [
      '<b>Scenes</b> is a grid of patterns per group. Click a number to change it, click a scene header to launch it.',
      'Changes wait for the end of the pattern, so the music stays in time.',
      '<b>Scene</b> pad mode launches scenes from the pads. <b>Dup</b> + pad stores the patterns playing right now.',
      '<b>Song</b>: add sections (scene + number of bars), turn <b>Song</b> on in the transport, press Play.',
      'Use <b>Snapshots</b> on the Sound screen to store and recall all sound settings of a group.',
    ],
  },
  {
    id: 'share', tab: 'Share', title: 'Save, share, export',
    intro: 'Your project lives in this browser until you export it.',
    steps: [
      '<b>File → Save to browser</b> keeps named copies. <b>Export project</b> downloads a file with your samples.',
      '<b>Copy share link</b> gives a link that opens your project anywhere (samples are not included).',
      '<b>Bounce</b> renders your patterns or the whole song to a WAV file. Live tweaks you did by hand are not in it.',
      'It works offline after the first visit and can be installed from your browser menu.',
      '<b>Setup → MIDI</b> connects a keyboard or pad controller and can send MIDI clock and notes out.',
    ],
  },
]

const current = ref('start')
const section = computed(() => sections.find((s) => s.id === current.value)!)
</script>

<template>
  <div class="hp">
    <div class="tabs">
      <button v-for="s in sections" :key="s.id" class="chip" :class="{ on: current === s.id }" @click="current = s.id">{{ s.tab }}</button>
      <span class="sp" />
      <button class="btn primary" @click="ui.tourOpen = true">Take the tour</button>
    </div>
    <h3>{{ section.title }}</h3>
    <p class="intro">{{ section.intro }}</p>
    <ol>
      <!-- content is static text defined above, never user input -->
      <li v-for="(step, i) in section.steps" :key="i" v-html="step" />
    </ol>
    <p class="more sub">
      Need a shortcut? <button class="link" @click="setView('settings')">Setup → Shortcuts</button>
    </p>
  </div>
</template>

<style scoped>
.hp { display: flex; flex-direction: column; gap: 8px; }
.tabs { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.sp { flex: 1; }
h3 { margin-top: 4px; font-size: 13px; }
.intro { margin: 0; color: #9db1bd; font-size: 12.5px; line-height: 1.45; }
ol { margin: 0; padding: 0; list-style: none; counter-reset: step; display: flex; flex-direction: column; gap: 6px; }
li { counter-increment: step; position: relative; padding-left: 28px; font-size: 12.5px; line-height: 1.45; color: #d4e0e8; }
li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in srgb, var(--g) 25%, #0d151a);
  border: 1px solid var(--g);
  color: #fff;
}
li :deep(b) { color: #fff; font-weight: 700; }
.more { margin: 2px 0 0; }
.link { background: none; border: 0; padding: 0; color: var(--g); text-decoration: underline; font-size: inherit; }
</style>
