<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { getEngine, playback, project, selectGroup, setGroupParam, setSoundParam, toggleMuteGroup, toggleMuteSound, toggleSoloGroup, toggleSoloSound, ui, currentGroup } from '../store'

const soundMode = ref(false)
const soundMeters = reactive<number[]>(new Array(16).fill(0))
let raf = 0

function loop() {
  const e = getEngine()
  if (e && soundMode.value) {
    for (let s = 0; s < 16; s++) {
      const p = e.soundPeak(ui.group, s)
      soundMeters[s] = p > soundMeters[s]! ? p : soundMeters[s]! * 0.88
    }
  }
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop) })
onUnmounted(() => cancelAnimationFrame(raf))

const db = (v: number) => Math.min(100, Math.sqrt(v) * 100)
</script>

<template>
  <div class="mx">
    <div class="tabs">
      <button class="chip" :class="{ on: !soundMode }" @click="soundMode = false">Groups</button>
      <button class="chip" :class="{ on: soundMode }" @click="soundMode = true">Sounds of {{ currentGroup.name }}</button>
    </div>
    <div class="strips">
      <template v-if="!soundMode">
        <div v-for="(g, i) in project.groups" :key="i" class="strip" :class="{ sel: ui.group === i }" :style="{ '--gc': g.color }" @click="selectGroup(i)">
          <div class="name" :style="{ color: g.color }">{{ g.name }}</div>
          <div class="fader">
            <div class="meter"><i :style="{ height: db(playback.meters[i]!) + '%' }" /></div>
            <input type="range" orient="vertical" min="0" max="1" step="0.01" :value="g.volume" @input="setGroupParam(i, 'volume', Number(($event.target as HTMLInputElement).value))" />
          </div>
          <input class="pan" type="range" min="-1" max="1" step="0.02" :value="g.pan" @input="setGroupParam(i, 'pan', Number(($event.target as HTMLInputElement).value))" />
          <div class="sends mono">
            <span title="Reverb send">R</span>
            <input type="range" min="0" max="1" step="0.01" :value="g.reverb" @input="setGroupParam(i, 'reverb', Number(($event.target as HTMLInputElement).value))" />
            <span title="Delay send">D</span>
            <input type="range" min="0" max="1" step="0.01" :value="g.delay" @input="setGroupParam(i, 'delay', Number(($event.target as HTMLInputElement).value))" />
          </div>
          <div class="ms">
            <button class="chip" :class="{ on: g.mute }" @click.stop="toggleMuteGroup(i)">M</button>
            <button class="chip" :class="{ on: g.solo }" @click.stop="toggleSoloGroup(i)">S</button>
          </div>
        </div>
      </template>
      <template v-else>
        <div v-for="(s, i) in currentGroup.sounds" :key="i" class="strip small" :class="{ sel: ui.sound === i }" :style="{ '--gc': currentGroup.color }" @click="ui.sound = i">
          <div class="name">{{ i + 1 }}</div>
          <div class="fader">
            <div class="meter"><i :style="{ height: db(soundMeters[i]!) + '%' }" /></div>
            <input type="range" orient="vertical" min="0" max="1" step="0.01" :value="s.params.volume" @input="setSoundParam(ui.group, i, 'volume', Number(($event.target as HTMLInputElement).value))" />
          </div>
          <input class="pan" type="range" min="-1" max="1" step="0.02" :value="s.params.pan" @input="setSoundParam(ui.group, i, 'pan', Number(($event.target as HTMLInputElement).value))" />
          <div class="ms">
            <button class="chip" :class="{ on: s.mute }" @click.stop="toggleMuteSound(ui.group, i)">M</button>
            <button class="chip" :class="{ on: s.solo }" @click.stop="toggleSoloSound(ui.group, i)">S</button>
          </div>
          <div class="nm">{{ s.name }}</div>
        </div>
      </template>
      <div class="strip master">
        <div class="name">MST</div>
        <div class="fader">
          <div class="meter"><i :style="{ height: db(playback.master) + '%' }" /></div>
          <input type="range" orient="vertical" min="0" max="1" step="0.01" :value="project.master.volume" @input="project.master.volume = Number(($event.target as HTMLInputElement).value); getEngine()?.refreshMaster()" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mx { display: flex; flex-direction: column; gap: 8px; }
.tabs { display: flex; gap: 4px; }
.strips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.strip { flex: 1 0 64px; max-width: 96px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 6px 4px; border-radius: 6px; background: #0b1216; border: 1px solid #14212a; }
.strip.small { flex-basis: 46px; max-width: 60px; }
.strip.sel { border-color: var(--gc); }
.strip.master { border-color: #3a4d58; }
.name { font-weight: 800; font-size: 13px; }
.strip.small .name { font-size: 11px; color: #8ea3b0; }
.fader { display: flex; gap: 4px; height: 120px; }
.meter { width: 6px; background: #05090c; border-radius: 3px; display: flex; align-items: flex-end; overflow: hidden; }
.meter i { display: block; width: 100%; background: linear-gradient(#ff5d5d, #ffd60a 25%, #38e07b 55%); min-height: 0; }
.fader input[type='range'] { writing-mode: vertical-lr; direction: rtl; width: 18px; height: 100%; }
.pan { width: 100%; }
.sends { display: grid; grid-template-columns: 10px 1fr; gap: 0 3px; width: 100%; align-items: center; font-size: 9px; color: #5d7280; }
.sends input { width: 100%; }
.ms { display: flex; gap: 3px; }
.nm { font-size: 9px; color: #5d7280; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
