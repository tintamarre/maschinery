<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ENGINE_LABELS } from '../core/project'
import { GROUP_NAMES } from '../core/constants'
import { KITS, fetchKitPacks, loadKit, loadKitPack, loadSoundPreset, ui, type KitPack } from '../store'

const tab = ref<'kits' | 'sounds' | 'packs'>('kits')
const packs = ref<KitPack[]>([])
onMounted(async () => { packs.value = await fetchKitPacks() })
const kitIdx = ref(0)
</script>

<template>
  <div class="br">
    <div class="tabs">
      <button class="chip" :class="{ on: tab === 'kits' }" @click="tab = 'kits'">Kits</button>
      <button class="chip" :class="{ on: tab === 'sounds' }" @click="tab = 'sounds'">Sounds</button>
      <button class="chip" :class="{ on: tab === 'packs' }" @click="tab = 'packs'">Sample packs{{ packs.length ? ` (${packs.length})` : '' }}</button>
      <span class="sub">Group {{ GROUP_NAMES[ui.group] }} · pad {{ ui.sound + 1 }}</span>
    </div>
    <div v-if="tab === 'kits'" class="list kits-list">
      <div v-for="k in KITS" :key="k.name" class="item">
        <div><b>{{ k.name }}</b><div class="sub">{{ k.sounds.slice(0, 6).map((s) => s[0]).join(' · ') }}…</div></div>
        <button class="btn primary" @click="loadKit(ui.group, k)">Load into group {{ GROUP_NAMES[ui.group] }}</button>
      </div>
    </div>
    <div v-else-if="tab === 'packs'" class="list kits-list">
      <p v-if="!packs.length" class="sub none">No sample packs installed. Add audio files and list them in <b>public/kits/index.json</b> (see the README there), or drop files on pads / use Sample → Load files.</p>
      <div v-for="p in packs" :key="p.name" class="item">
        <div><b>{{ p.name }}</b><div class="sub">{{ p.files.length }} files</div></div>
        <button class="btn primary" @click="loadKitPack(ui.group, p)">Load into group {{ GROUP_NAMES[ui.group] }}</button>
      </div>
    </div>
    <div v-else class="sounds">
      <div class="kits">
        <button v-for="(k, i) in KITS" :key="k.name" class="chip" :class="{ on: kitIdx === i }" @click="kitIdx = i">{{ k.name }}</button>
      </div>
      <div class="list sound-list">
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
.list { display: grid; gap: 6px; }
.kits-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sound-list { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.none { grid-column: 1 / -1; margin: 0; }
.kits-list .item { flex-direction: column; align-items: flex-start; }
.item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 10px; border-radius: 6px; background: #0b1216; border: 1px solid #14212a; color: inherit; text-align: left; }
.item:hover { border-color: var(--g); }
.sounds { display: flex; flex-direction: column; gap: 8px; }
</style>
