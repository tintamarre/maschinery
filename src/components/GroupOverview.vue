<script setup lang="ts">
import { BAR } from '../core/constants'
import { playback, project, selectGroup, toggleMuteGroup, toggleSoloGroup, ui } from '../store'

function progress(g: number): number {
  if (!playback.playing) return 0
  const len = project.groups[g]!.patterns[project.groups[g]!.pattern]!.bars * BAR
  return Math.min(100, ((playback.pos[g] ?? 0) / len) * 100)
}
</script>

<template>
  <div class="lcd ov">
    <div v-for="(g, i) in project.groups" :key="i" class="row" :class="{ sel: ui.group === i, off: g.mute }" :style="{ '--gc': g.color }" @click="selectGroup(i)">
      <span class="l">{{ g.name }}</span>
      <span class="p mono">{{ g.pattern + 1 }}<em v-if="playback.pending[i] !== null">→{{ playback.pending[i]! + 1 }}</em></span>
      <div class="bar"><i :style="{ width: progress(i) + '%' }" /><b :style="{ opacity: playback.groupLevel[i] }" /></div>
      <button class="chip" :class="{ on: g.mute }" @click.stop="toggleMuteGroup(i)">M</button>
      <button class="chip" :class="{ on: g.solo }" @click.stop="toggleSoloGroup(i)">S</button>
    </div>
  </div>
</template>

<style scoped>
.ov { display: flex; flex-direction: column; gap: 1px; padding: 6px 10px; }
.row { display: grid; grid-template-columns: 16px 34px 1fr 24px 24px; gap: 8px; align-items: center; padding: 0 4px; border-radius: 5px; border: 1px solid transparent; cursor: pointer; }
.row.sel { border-color: var(--gc); background: color-mix(in srgb, var(--gc) 9%, transparent); }
.row.off { opacity: 0.45; }
.l { font-weight: 800; color: var(--gc); }
.p { font-size: 11px; color: #cfe0ea; }
.p em { font-style: normal; color: #ffd60a; }
.bar { position: relative; height: 7px; border-radius: 4px; background: #0d151a; overflow: hidden; }
.bar i { position: absolute; inset: 0 auto 0 0; background: color-mix(in srgb, var(--gc) 55%, #0d151a); }
.bar b { position: absolute; inset: 0; background: var(--gc); }
.chip { min-width: 0; width: 24px; height: 17px; padding: 0; font-size: 9px; }
</style>
