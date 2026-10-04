<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const steps = [
  { sel: '.padrow', title: 'Play the pads', text: 'Click or tap the pads, or use the keyboard: Z X C V is the bottom row, then A S D F, Q W E R and 1 2 3 4. Hit a pad lower for a louder sound.' },
  { sel: '.transport-box', title: 'Transport', text: 'Play (Space) runs the patterns. Rec (Enter) records what you play, with a count-in and quantizing. Auto records knob moves, Repeat gives rolls.' },
  { sel: '.views', title: 'Screens', text: 'Pattern is the note editor. Sound shapes the selected pad, Sample loads or records audio, Mixer and Master balance and add effects, Scenes and Song arrange, File saves, shares and exports WAV.' },
  { sel: '.knobs', title: 'Eight knobs', text: 'Drag, scroll or use the arrow keys. Double-click resets. They always control what the screen above shows; the page buttons reveal more.' },
  { sel: '.groups-box', title: 'Eight groups', text: 'Each group A–H has 16 pads and 16 patterns. The Pad mode buttons below turn the pads into a keyboard, chords, a step sequencer, scenes or patterns.' },
  { sel: '.top', title: 'Up here', text: 'Tempo and position, a master level meter, Mute for silence, Full for fullscreen. Everything is saved automatically in this browser, and it works offline once loaded.' },
]

const i = ref(0)
const box = ref({ x: 0, y: 0, w: 0, h: 0 })
const card = ref({ x: 0, y: 0 })

function place() {
  const el = document.querySelector(steps[i.value]!.sel) as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  box.value = { x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 }
  const cw = 320
  const ch = 170
  const below = r.bottom + ch + 14 < window.innerHeight
  const x = Math.min(Math.max(8, r.left + r.width / 2 - cw / 2), window.innerWidth - cw - 8)
  card.value = { x, y: below ? r.bottom + 12 : Math.max(8, r.top - ch - 12) }
}

function go(n: number) {
  if (n >= steps.length) { emit('close'); return }
  i.value = Math.max(0, n)
  void nextTick(place)
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') emit('close')
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(i.value + 1) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i.value - 1) }
  e.stopPropagation()
}

watch(() => props.open, (v) => { if (v) { i.value = 0; void nextTick(place) } })
onMounted(() => {
  window.addEventListener('resize', place)
  window.addEventListener('keydown', onKey, true)
  if (props.open) void nextTick(place)
})
onUnmounted(() => {
  window.removeEventListener('resize', place)
  window.removeEventListener('keydown', onKey, true)
})

const step = computed(() => steps[i.value]!)
</script>

<template>
  <div v-if="open" class="tour" role="dialog" aria-label="Quick tour">
    <div class="hole" :style="{ left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' }" />
    <div class="card" :style="{ left: card.x + 'px', top: card.y + 'px' }">
      <small class="mono">{{ i + 1 }} / {{ steps.length }}</small>
      <h4>{{ step.title }}</h4>
      <p>{{ step.text }}</p>
      <div class="acts">
        <button class="btn" @click="emit('close')">Skip</button>
        <span class="sp" />
        <button class="btn" :disabled="i === 0" @click="go(i - 1)">Back</button>
        <button class="btn primary" @click="go(i + 1)">{{ i === steps.length - 1 ? 'Done' : 'Next' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 80; }
.hole {
  position: fixed;
  border-radius: 14px;
  border: 2px solid var(--g);
  box-shadow: 0 0 0 9999px #000a, 0 0 24px var(--g);
  transition: all 0.25s ease;
  pointer-events: none;
}
.card {
  position: fixed;
  width: 320px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #0b1216;
  border: 1px solid var(--g);
  color: #dfe9ef;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.25s ease;
}
h4 { margin: 0; font-size: 15px; color: var(--g); }
p { margin: 0; font-size: 12.5px; line-height: 1.45; }
small { color: #5d7280; }
.acts { display: flex; gap: 6px; margin-top: 4px; }
.sp { flex: 1; }
</style>
