<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import GroupButtons from './components/GroupButtons.vue'
import GroupOverview from './components/GroupOverview.vue'
import HwButton from './components/HwButton.vue'
import Knob from './components/Knob.vue'
import PadGrid from './components/PadGrid.vue'
import PadOptions from './components/PadOptions.vue'
import TouchStrip from './components/TouchStrip.vue'
import Transport from './components/Transport.vue'
import { PAD_KEYS } from './core/constants'
import BrowserView from './views/BrowserView.vue'
import FileView from './views/FileView.vue'
import MasterView from './views/MasterView.vue'
import MixerView from './views/MixerView.vue'
import PatternView from './views/PatternView.vue'
import SampleView from './views/SampleView.vue'
import ScenesView from './views/ScenesView.vue'
import SettingsView from './views/SettingsView.vue'
import SongView from './views/SongView.vue'
import SoundView from './views/SoundView.vue'
import {
  PAD_MODES, currentGroup, cycleMode, knobs, padDown, padUp, pageCount, play, playback, project, redo, releaseAllPads, selectGroup,
  setMode, setNoteRepeat, setTempo, setView, settings, tapTempo, toggleRecord, ui, undo, type ViewId,
} from './store'

const views: { id: ViewId; label: string }[] = [
  { id: 'pattern', label: 'Pattern' },
  { id: 'sound', label: 'Sound' },
  { id: 'sample', label: 'Sample' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'master', label: 'Master' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'song', label: 'Song' },
  { id: 'browser', label: 'Browser' },
  { id: 'file', label: 'File' },
  { id: 'settings', label: 'Setup' },
]

const viewComp = {
  pattern: PatternView, sound: SoundView, sample: SampleView, mixer: MixerView, master: MasterView,
  scenes: ScenesView, song: SongView, browser: BrowserView, file: FileView, settings: SettingsView,
}

const modeLabels: Record<string, string> = { pad: 'Pad', keyboard: 'Keys', chords: 'Chords', step: 'Step', scene: 'Scene', pattern: 'Pattern' }

const position = computed(() =>
  playback.playing ? `${String(playback.bar).padStart(2, '0')}.${playback.beat}` : '--.-',
)

const keyToPad = new Map(PAD_KEYS.map((k, i) => [k.length === 1 && /\d/.test(k) ? 'Digit' + k : 'Key' + k.toUpperCase(), i]))
const heldKeys = new Set<string>()

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox'
    || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
}

function onKeyDown(e: KeyboardEvent) {
  if (typing(e)) return
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
    return
  }
  if (e.metaKey || e.ctrlKey) return
  const pad = keyToPad.get(e.code)
  if (pad !== undefined) {
    e.preventDefault()
    if (e.repeat || heldKeys.has(e.code)) return
    heldKeys.add(e.code)
    padDown(pad, 100, 'kbd')
    return
  }
  switch (e.code) {
    case 'Space': e.preventDefault(); if (!e.repeat) play(); break
    case 'Enter': e.preventDefault(); if (!e.repeat) toggleRecord(); break
    case 'KeyB': if (!e.repeat) setNoteRepeat(!ui.noteRepeat); break
    case 'KeyG': if (!e.repeat) ui.fixedVel = !ui.fixedVel; break
    case 'KeyN': if (!e.repeat) settings.metronome = !settings.metronome; break
    case 'KeyT': if (!e.repeat) tapTempo(); break
    case 'Tab': e.preventDefault(); if (!e.repeat) cycleMode(); break
    case 'Backspace': case 'Delete': e.preventDefault(); ui.erase = true; break
    case 'ShiftLeft': case 'ShiftRight': ui.duplicate = true; break
    case 'AltLeft': case 'AltRight': e.preventDefault(); ui.select = true; break
    case 'KeyM': ui.mute = true; break
    case 'KeyL': ui.solo = true; break
    case 'ArrowLeft': e.preventDefault(); selectGroup((ui.group + 7) % 8); break
    case 'ArrowRight': e.preventDefault(); selectGroup((ui.group + 1) % 8); break
    case 'ArrowUp': e.preventDefault(); setTempo(project.tempo + (e.shiftKey ? 10 : 1)); break
    case 'ArrowDown': e.preventDefault(); setTempo(project.tempo - (e.shiftKey ? 10 : 1)); break
    case 'Comma': settings.octave = Math.max(-3, settings.octave - 1); break
    case 'Period': settings.octave = Math.min(3, settings.octave + 1); break
  }
}

function onKeyUp(e: KeyboardEvent) {
  const pad = keyToPad.get(e.code)
  if (pad !== undefined) {
    heldKeys.delete(e.code)
    padUp(pad, 'kbd')
    return
  }
  switch (e.code) {
    case 'Backspace': case 'Delete': ui.erase = false; break
    case 'ShiftLeft': case 'ShiftRight': ui.duplicate = false; break
    case 'AltLeft': case 'AltRight': ui.select = false; break
    case 'KeyM': ui.mute = false; break
    case 'KeyL': ui.solo = false; break
  }
}

function onBlur() {
  releaseAllPads()
  heldKeys.clear()
  ui.erase = ui.duplicate = ui.select = ui.mute = ui.solo = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
})

// ---- scale-to-fit: the controller is a fixed-size layout that never scrolls --------
const stage = ref<HTMLElement | null>(null)
const portrait = ref(false)
const scale = ref(1)

function fit() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  portrait.value = vw / vh < 0.95
  const el = stage.value
  if (!el) return
  const dw = portrait.value ? 560 : 1240
  const dh = el.offsetHeight
  scale.value = Math.min(vw / dw, vh / dh, 1.6)
}

let ro: ResizeObserver | null = null
onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  if (stage.value) ro.observe(stage.value)
  window.addEventListener('resize', fit)
  setTimeout(fit, 50)
})
onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('resize', fit)
})
</script>

<template>
  <div class="viewport" :style="{ '--g': currentGroup.color }">
  <div ref="stage" class="app" :class="{ portrait }" :style="{ transform: `scale(${scale})` }">
    <header class="top">
      <div class="brand"><b>MASCHINERY</b><span>MK3</span></div>
      <div class="readouts mono">
        <div class="ro"><small>Project</small><span>{{ project.name }}</span></div>
        <div class="ro"><small>BPM</small><span>{{ project.tempo.toFixed(1) }}</span></div>
        <div class="ro"><small>Bar</small><span>{{ position }}</span></div>
        <div class="ro"><small>Group</small><span :style="{ color: currentGroup.color }">{{ currentGroup.name }}{{ currentGroup.pattern + 1 }}</span></div>
      </div>
      <div class="vu"><i :style="{ width: Math.min(100, Math.sqrt(playback.master) * 100) + '%' }" /></div>
    </header>

    <div class="main">
      <aside class="left">
        <nav class="views">
          <HwButton v-for="v in views" :key="v.id" :label="v.label" :on="ui.view === v.id" @click="setView(v.id)" />
        </nav>
        <GroupButtons class="groups-box" />
        <div class="modes">
          <HwButton v-for="m in PAD_MODES" :key="m" :label="modeLabels[m]!" :on="ui.mode === m" @click="setMode(m)" />
        </div>
      </aside>

      <main class="center">
        <section class="lcd screen">
          <component :is="viewComp[ui.view]" />
        </section>
        <section class="lcd knobs">
          <Knob v-for="(k, i) in knobs" :key="i" :k="k" />
          <div v-if="pageCount > 1" class="pager">
            <button class="chip" :class="{ on: ui.page === 0 }" @click="ui.page = 0">1</button>
            <button class="chip" :class="{ on: ui.page === 1 }" @click="ui.page = 1">2</button>
          </div>
        </section>
        <Transport class="transport-box" />
      </main>

      <section class="right">
        <PadOptions />
        <div class="padrow">
          <TouchStrip />
          <PadGrid />
        </div>
        <GroupOverview />
      </section>
    </div>
  </div>
  <div v-if="ui.toast" class="toast">{{ ui.toast }}</div>
  <div v-if="ui.busy" class="busy">{{ ui.busy }}</div>
  </div>
</template>

<style scoped>
.viewport {
  position: fixed;
  inset: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.app {
  flex: none;
  width: 1240px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transform-origin: center center;
}
.app.portrait { width: 560px; padding: 12px; gap: 10px; }
.top {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 14px;
  border-radius: 12px;
  background: linear-gradient(var(--body-1), var(--body-2));
  border: 1px solid #000;
  box-shadow: 0 1px 0 #3a3a42 inset;
}
.brand { display: flex; align-items: baseline; gap: 6px; letter-spacing: 0.22em; font-size: 14px; }
.brand span { font-size: 10px; color: var(--g); letter-spacing: 0.1em; font-weight: 800; }
.readouts { display: flex; gap: 10px; flex: 1; }
.ro { display: flex; flex-direction: column; min-width: 56px; padding: 2px 8px; background: var(--lcd); border-radius: 5px; border: 1px solid #000; }
.ro small { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #5d7280; }
.ro span { font-size: 14px; color: #cfe0ea; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.vu { width: 120px; height: 8px; background: #05090c; border-radius: 4px; overflow: hidden; }
.vu i { display: block; height: 100%; background: linear-gradient(90deg, #38e07b, #ffd60a 70%, #ff4d4d); }

.main {
  display: grid;
  grid-template-columns: 124px minmax(0, 1fr) 372px;
  gap: 14px;
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(var(--body-1), var(--body-2));
  border: 1px solid #000;
  box-shadow: 0 1px 0 #3a3a42 inset, 0 20px 40px #0008;
}
.left { display: flex; flex-direction: column; gap: 14px; }
.views { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-content: start; }
.views :deep(.hw), .modes :deep(.hw) { min-width: 0; padding-left: 2px; padding-right: 2px; width: 100%; }
.modes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.center { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.screen { padding: 8px 12px; height: 376px; overflow: hidden; }
.knobs { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; padding: 8px 10px; position: relative; }
.pager { position: absolute; right: 8px; top: -26px; display: flex; gap: 3px; }
.right { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.padrow { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; align-items: stretch; }

.toast {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 8px;
  background: #000d;
  border: 1px solid var(--g);
  color: #fff;
  font-size: 13px;
  z-index: 50;
}
.busy { position: fixed; inset: 0; display: grid; place-items: center; background: #000a; color: #fff; z-index: 60; font-size: 15px; }

/* portrait: one column, still scaled to fit without scrolling */
.portrait .main { display: flex; flex-direction: column; gap: 10px; padding: 10px; }
.portrait .left, .portrait .center { display: contents; }
.portrait .screen { order: 0; height: 462px; }
.portrait .knobs { order: 1; grid-template-columns: repeat(4, minmax(0, 1fr)); row-gap: 10px; }
.portrait .views { order: 2; grid-template-columns: repeat(5, 1fr); }
.portrait .groups-box { order: 3; grid-template-columns: repeat(8, 1fr); }
.portrait .modes { order: 4; grid-template-columns: repeat(6, 1fr); }
.portrait .transport-box { order: 5; }
.portrait .right { order: 6; width: 100%; max-width: 440px; margin: 0 auto; }
.portrait .right :deep(.ov) { display: none; }
.portrait .readouts .ro:nth-child(4) { display: none; }
.portrait .vu { display: none; }
</style>
