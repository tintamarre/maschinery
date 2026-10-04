<script setup lang="ts">
import { CHORD_QUALITIES, NOTE_NAMES, SCALES } from '../core/constants'
import { currentPattern, project, settings, ui } from '../store'
</script>

<template>
  <div class="opts mono">
    <template v-if="ui.mode === 'keyboard' || ui.mode === 'chords'">
      <label>Scale
        <select v-model="settings.scale">
          <option v-for="(_, name) in SCALES" :key="name">{{ name }}</option>
        </select>
      </label>
      <label>Root
        <select v-model.number="settings.root">
          <option v-for="(n, i) in NOTE_NAMES" :key="n" :value="i">{{ n }}</option>
        </select>
      </label>
      <label>Oct
        <button class="mini" @click="settings.octave = Math.max(-3, settings.octave - 1)">−</button>
        <b>{{ settings.octave > 0 ? '+' : '' }}{{ settings.octave }}</b>
        <button class="mini" @click="settings.octave = Math.min(3, settings.octave + 1)">+</button>
      </label>
      <label v-if="ui.mode === 'chords'">Chords
        <select v-model.number="ui.chordQuality">
          <option v-for="(q, i) in CHORD_QUALITIES" :key="q" :value="i">{{ q }}</option>
        </select>
      </label>
    </template>
    <template v-else-if="ui.mode === 'step'">
      <label>Bar
        <button
          v-for="b in currentPattern.bars"
          :key="b"
          class="mini"
          :class="{ on: ui.stepBar === b - 1 }"
          @click="ui.stepBar = b - 1"
        >{{ b }}</button>
      </label>
      <span class="hint">{{ project.groups[ui.group]!.sounds[ui.sound]!.name }}</span>
    </template>
    <template v-else-if="ui.mode === 'pattern'">
      <span class="hint">Pattern select · Duplicate+pad copies · Erase+pad clears</span>
    </template>
    <template v-else-if="ui.mode === 'scene'">
      <span class="hint">Scene launch · Duplicate+pad captures current patterns</span>
    </template>
    <template v-else>
      <span class="hint">Drop an audio file on a pad to load a sample</span>
    </template>
  </div>
</template>

<style scoped>
.opts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-height: 26px; font-size: 11px; color: #8a8a96; }
label { display: inline-flex; align-items: center; gap: 5px; text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; }
select { background: #17171b; color: #d0d0d8; border: 1px solid #2c2c32; border-radius: 4px; padding: 2px 4px; font: inherit; font-size: 11px; }
.mini { min-width: 22px; height: 22px; border: 1px solid #2c2c32; border-radius: 4px; background: #17171b; color: #ccc; font-size: 11px; }
.mini.on { background: var(--g); color: #000; border-color: var(--g); }
b { min-width: 20px; text-align: center; color: #fff; }
.hint { opacity: 0.7; text-transform: none; letter-spacing: 0; }
</style>
