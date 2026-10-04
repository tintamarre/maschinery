<script setup lang="ts">
import { NUM_SCENES } from '../core/constants'
import { addSongSection, moveSongSection, playback, project, removeSongSection, settings, ui } from '../store'

const total = () => project.song.reduce((a, s) => a + s.bars, 0)
</script>

<template>
  <div class="sg">
    <div class="bar">
      <button class="btn" :class="{ primary: ui.songMode }" @click="ui.songMode = !ui.songMode">Song mode {{ ui.songMode ? 'ON' : 'OFF' }}</button>
      <label class="sub"><input v-model="settings.songLoop" type="checkbox" /> Loop</label>
      <span class="sub">{{ project.song.length }} sections · {{ total() }} bars</span>
      <button class="btn" :disabled="project.song.length >= 16" @click="addSongSection()">+ Add section (scene {{ ui.scene + 1 }})</button>
    </div>
    <p v-if="!project.song.length" class="sub">No sections yet. Build scenes in the Scenes view, then chain them here and press Play with Song mode on.</p>
    <div class="list">
      <div v-for="(s, i) in project.song" :key="i" class="row" :class="{ now: playback.songIdx === i && playback.playing }">
        <span class="n mono">{{ i + 1 }}</span>
        <select v-model.number="s.scene">
          <option v-for="n in NUM_SCENES" :key="n" :value="n - 1">Scene {{ n }}</option>
        </select>
        <input v-model.number="s.bars" type="number" min="1" max="64" class="mono" title="Bars" />
        <button class="btn" @click="moveSongSection(i, -1)">▲</button>
        <button class="btn" @click="moveSongSection(i, 1)">▼</button>
        <button class="btn danger" @click="removeSongSection(i)">✕</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sg { display: flex; flex-direction: column; gap: 8px; }
.bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
p { margin: 0; }
.list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; }
.row { display: flex; align-items: center; gap: 4px; padding: 4px 6px; border-radius: 6px; background: #0b1216; border: 1px solid #14212a; }
.row.now { border-color: var(--g); background: color-mix(in srgb, var(--g) 12%, #0b1216); }
.n { width: 22px; color: #5d7280; }
input[type='number'] { width: 44px; }
.row .btn { padding: 4px 5px; min-width: 22px; }
.row select { min-width: 0; flex: 1; }
</style>
