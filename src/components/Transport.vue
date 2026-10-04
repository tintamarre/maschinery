<script setup lang="ts">
import HwButton from './HwButton.vue'
import ModButton from './ModButton.vue'
import {
  play, playback, redo, setNoteRepeat, settings, stop, tapTempo, toggleRecord, ui, undo,
} from '../store'
</script>

<template>
  <div class="transport">
    <div class="row">
      <HwButton label="Play" kind="play" :on="playback.playing" @click="play" title="Space" />
      <HwButton label="Rec" kind="rec" :on="playback.recording" :blink="playback.countIn" @click="toggleRecord" title="Enter" />
      <HwButton label="Stop" @click="stop" />
      <HwButton label="Tap" @click="tapTempo" title="T" />
      <HwButton label="Metro" :on="settings.metronome" @click="settings.metronome = !settings.metronome" title="N" />
      <HwButton label="Follow" :on="settings.follow" @click="settings.follow = !settings.follow" />
      <HwButton label="Song" :on="ui.songMode" @click="ui.songMode = !ui.songMode" title="Play the arranger instead of the current patterns" />
    </div>
    <div class="row">
      <HwButton label="Repeat" :on="ui.noteRepeat" @click="setNoteRepeat(!ui.noteRepeat)" title="B" />
      <HwButton label="Fixed Vel" :on="ui.fixedVel" @click="ui.fixedVel = !ui.fixedVel" title="G" />
      <ModButton mod="erase" title="Backspace (hold)" />
      <ModButton mod="duplicate" label="Dup" title="Shift (hold)" />
      <ModButton mod="select" title="Alt (hold)" />
      <ModButton mod="solo" title="L (hold)" />
      <ModButton mod="mute" title="M (hold)" />
      <HwButton label="Undo" :disabled="!playback.canUndo" @click="undo" title="Cmd/Ctrl+Z" />
      <HwButton label="Redo" :disabled="!playback.canRedo" @click="redo" title="Cmd/Ctrl+Shift+Z" />
    </div>
  </div>
</template>

<style scoped>
.transport { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
.row > span { display: inline-flex; }
</style>
