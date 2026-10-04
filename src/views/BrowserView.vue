<script setup lang="ts">
import { ref } from 'vue'
import { ENGINE_LABELS } from '../core/project'
import { GROUP_NAMES } from '../core/constants'
import { KITS, loadKit, loadSoundPreset, ui } from '../store'

const tab = ref<'kits' | 'sounds'>('kits')
const kitIdx = ref(0)
</script>

<template>
  <div class="br">
    <div class="tabs">
      <button class="chip" :class="{ on: tab === 'kits' }" @click="tab = 'kits'">Kits</button>
      <button class="chip" :class="{ on: tab === 'sounds' }" @click="tab = 'sounds'">Sounds</button>
      <span class="sub">Group {{ GROUP_NAMES[ui.group] }} · pad {{ ui.sound + 1 }}</span>
    </div>
    <div v-if="tab === 'kits'" class="list scroll-y">
      <div v-for="k in KITS" :key="k.name" class="item">
        <div><b>{{ k.name }}</b><div class="sub">{{ k.sounds.slice(0, 6).map((s) => s[0]).join(' · ') }}…</div></div>
        <button class="btn primary" @click="loadKit(ui.group, k)">Load into group {{ GROUP_NAMES[ui.group] }}</button>
      </div>
    </div>
    <div v-else class="sounds">
      <div class="kits">
        <button v-for="(k, i) in KITS" :key="k.name" class="chip" :class="{ on: kitIdx === i }" @click="kitIdx = i">{{ k.name }}</button>
      </div>
      <div class="list scroll-y">
        <button v-for="(s, i) in KITS[kitIdx]!.sounds" :key="i" class="item sound" @click="loadSoundPreset(ui.group, ui.sound, KITS[kitIdx]!, i)">
          <b>{{ s[0] }}</b><span class="sub">{{ ENGINE_LABELS[s[1]] }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.br { display: flex; flex-direction: column; gap: 8px; }
.tabs, .kits { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; }
.item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px; border-radius: 6px; background: #0b1216; border: 1px solid #14212a; color: inherit; text-align: left; }
.item:hover { border-color: var(--g); }
.sounds { display: flex; flex-direction: column; gap: 8px; }
</style>
