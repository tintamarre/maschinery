<script setup lang="ts">
import { ref } from 'vue'
import { bounceBars } from '../core/bounce'
import {
  bounce, copyShareLink, deleteSlot, exportProject, importProject, listSlots, loadDemo, loadSlot, newProject, project, saveSlot, ui,
} from '../store'

const slots = ref(listSlots())
const name = ref(project.name)
const loops = ref(4)
const file = ref<HTMLInputElement | null>(null)

function save() {
  saveSlot(name.value)
  slots.value = listSlots()
}

function remove(s: string) {
  deleteSlot(s)
  slots.value = listSlots()
}

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) void importProject(f)
  ;(e.target as HTMLInputElement).value = ''
}

const songBars = () => bounceBars(project, { song: true, loops: 1 })
</script>

<template>
  <div class="fv">
    <section>
      <h3>Project</h3>
      <div class="row">
        <input v-model="name" type="text" placeholder="Project name" @input="project.name = name" />
        <button class="btn primary" @click="save">Save to browser</button>
        <button class="btn" @click="newProject">New</button>
        <button class="btn" @click="loadDemo">Load demo</button>
      </div>
      <div v-if="slots.length" class="slots">
        <div v-for="s in slots.slice(0, 8)" :key="s" class="slot">
          <span>{{ s }}</span>
          <button class="btn" @click="loadSlot(s); name = s">Load</button>
          <button class="btn danger" @click="remove(s)">✕</button>
        </div>
      </div>
      <p class="sub">The current project is auto-saved in this browser.<template v-if="slots.length > 8"> Showing 8 of {{ slots.length }} saves.</template></p>
    </section>
    <section>
      <h3>Export / import</h3>
      <div class="row">
        <button class="btn" @click="exportProject">Export project (.json with samples)</button>
        <button class="btn" @click="file?.click()">Import project…</button>
        <button class="btn primary" title="Copy a link that opens this project (samples are not included)" @click="copyShareLink">Copy share link</button>
        <input ref="file" type="file" accept=".json,application/json" hidden @change="onFile" />
      </div>
    </section>
    <section>
      <h3>Bounce to WAV</h3>
      <div class="row">
        <label class="sub">Pattern loops <input v-model.number="loops" type="number" min="1" max="64" class="mono" /></label>
        <button class="btn primary" :disabled="!!ui.busy" @click="bounce(false, loops)">Bounce current patterns</button>
        <button class="btn" :disabled="!!ui.busy || !project.song.length" @click="bounce(true, 1)">Bounce song ({{ songBars() }} bars)</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.fv { display: flex; flex-direction: column; gap: 14px; }
section { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.slots { display: flex; flex-wrap: wrap; gap: 6px; }
.slot { display: flex; gap: 4px; align-items: center; padding: 3px 6px; background: #0b1216; border: 1px solid #14212a; border-radius: 6px; font-size: 12px; }
input[type='number'] { width: 56px; }
p { margin: 0; }
</style>
