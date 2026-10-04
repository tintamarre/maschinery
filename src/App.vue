<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Pad from './components/Pad.vue'
import { PADS, useSynth, type PadDef } from './composables/useSynth'

const { trigger, setVolume } = useSynth()
const volume = ref(0.8)
const padRefs = ref<Record<number, InstanceType<typeof Pad> | null>>({})
const byKey = new Map(PADS.map((p) => [p.key, p]))

function hit(pad: PadDef, velocity = 0.9) {
  trigger(pad, velocity)
}

function onKey(e: KeyboardEvent) {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
  const pad = byKey.get(e.key.toLowerCase())
  if (!pad) return
  padRefs.value[pad.id]?.flash()
  hit(pad)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4">
    <header class="flex items-baseline justify-between">
      <h1 class="text-xl font-bold tracking-widest">MASCHINERY</h1>
      <span class="text-xs opacity-50">tap or use 1234 / QWER / ASDF / ZXCV</span>
    </header>

    <section class="grid grid-cols-4 gap-3 rounded-2xl bg-dark-700 p-4">
      <Pad
        v-for="pad in PADS"
        :key="pad.id"
        :ref="(el) => (padRefs[pad.id] = el as InstanceType<typeof Pad> | null)"
        :pad="pad"
        @hit="hit"
      />
    </section>

    <label class="flex items-center gap-3 text-sm">
      Volume
      <input
        v-model.number="volume"
        type="range" min="0" max="1" step="0.01"
        class="flex-1"
        @input="setVolume(volume)"
      />
    </label>
  </main>
</template>
