<script setup lang="ts">
import HwButton from './HwButton.vue'
import ModButton from './ModButton.vue'
import {
  play, playback, redo, setNoteRepeat, settings, stop, tapTempo, toggleRecord, ui, undo,
} from '../store'
</script>

<template>
  <div class="transport">
    <div class="big">
      <button class="tbtn rec" :class="{ on: playback.recording, blink: playback.countIn }" :aria-pressed="playback.recording" title="Enter" @click="toggleRecord"><i>●</i>Rec</button>
      <button class="tbtn play" :class="{ on: playback.playing }" :aria-pressed="playback.playing" title="Space" @click="play"><i>▶</i>Play</button>
      <button class="tbtn" title="Stop and rewind" @click="stop"><i>■</i>Stop</button>
    </div>
    <div class="row">
      <HwButton label="Tap" title="T" @click="tapTempo" />
      <HwButton label="Metro" :on="settings.metronome" title="N" @click="settings.metronome = !settings.metronome" />
      <HwButton label="Follow" :on="settings.follow" @click="settings.follow = !settings.follow" />
      <HwButton label="Song" :on="ui.songMode" title="Play the arranger instead of the current patterns" @click="ui.songMode = !ui.songMode" />
      <HwButton label="Repeat" :on="ui.noteRepeat" title="B" @click="setNoteRepeat(!ui.noteRepeat)" />
      <HwButton label="Auto" :on="ui.autoWrite" title="Auto Write: record knob moves into the pattern while playing" @click="ui.autoWrite = !ui.autoWrite" />
      <HwButton label="Fixed" :on="ui.fixedVel" title="G · fixed velocity" @click="ui.fixedVel = !ui.fixedVel" />
    </div>
    <div class="row">
      <ModButton mod="erase" title="Backspace (hold)" />
      <ModButton mod="duplicate" label="Dup" title="Shift (hold)" />
      <ModButton mod="select" title="Alt (hold)" />
      <ModButton mod="solo" title="L (hold)" />
      <ModButton mod="mute" title="M (hold)" />
      <span class="gap" />
      <HwButton label="Undo" :disabled="!playback.canUndo" title="Cmd/Ctrl+Z" @click="undo" />
      <HwButton label="Redo" :disabled="!playback.canRedo" title="Cmd/Ctrl+Shift+Z" @click="redo" />
    </div>
  </div>
</template>

<style scoped>
.transport { display: flex; flex-direction: column; gap: 7px; }
.big { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tbtn {
  position: relative;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #000;
  border-radius: 9px;
  background: linear-gradient(#3a3a41, #28282d);
  box-shadow: 0 1px 0 #55555e inset, 0 2px 4px #000a;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c4c4cc;
}
.tbtn i { font-style: normal; font-size: 15px; line-height: 1; }
.tbtn:active { transform: translateY(1px); }
.tbtn.play.on { color: #fff; background: linear-gradient(#27a85c, #1b7a43); box-shadow: 0 0 14px #38e07b66, 0 1px 0 #7be8a8 inset; }
.tbtn.rec i { color: #ff4d4d; }
.tbtn.rec.on { color: #fff; background: linear-gradient(#c92d2d, #8e1f1f); box-shadow: 0 0 14px #ff2d2d66, 0 1px 0 #ff9a9a inset; }
.tbtn.rec.on i { color: #fff; }
.tbtn.blink { animation: tb 0.5s steps(2) infinite; }
@keyframes tb { 50% { filter: brightness(1.6); } }
.row { display: flex; gap: 6px; }
.row > * { flex: 1 1 0; min-width: 0; }
.row > span { display: flex; }
.row :deep(.hw) { width: 100%; min-width: 0; padding: 12px 2px 5px; font-size: 9.5px; }
.gap { flex: 0 0 8px !important; }
</style>
