<script setup lang="ts">
import { NUM_SCENES } from '../core/constants'
import { launchScene, playback, project, setScenePattern, ui } from '../store'

function cycle(scene: number, g: number, dir: number) {
  const cur = project.scenes[scene]![g]!
  setScenePattern(scene, g, (cur + dir + 16) % 16)
}

function capture(scene: number) {
  project.scenes[scene] = project.groups.map((g) => g.pattern)
}
</script>

<template>
  <div class="sc">
    <p class="sub">Scenes launch one pattern per group. Click a cell to change its pattern (right-click: previous), click a header to launch the scene. “Capture” stores the patterns playing right now.</p>
    <div class="matrix">
      <div class="corner" />
      <div v-for="s in NUM_SCENES" :key="s" class="head">
        <button class="chip" :class="{ on: ui.scene === s - 1 }" @click="launchScene(s - 1)">{{ s }}</button>
        <button class="cap" title="Capture current patterns into this scene" @click="capture(s - 1)">●</button>
      </div>
      <template v-for="(g, gi) in project.groups" :key="gi">
        <div class="gname" :style="{ color: g.color }">{{ g.name }}</div>
        <button
          v-for="s in NUM_SCENES"
          :key="s"
          class="cell"
          :class="{ cur: g.pattern === project.scenes[s - 1]![gi], sel: ui.scene === s - 1 }"
          :style="{ '--gc': g.color }"
          @click="cycle(s - 1, gi, 1)"
          @contextmenu.prevent="cycle(s - 1, gi, -1)"
        >{{ project.scenes[s - 1]![gi]! + 1 }}</button>
      </template>
    </div>
    <p class="sub">Playing: <span v-for="(g, gi) in project.groups" :key="gi" class="mono" :style="{ color: g.color }">{{ g.name }}{{ g.pattern + 1 }}<template v-if="playback.pending[gi] !== null">→{{ playback.pending[gi]! + 1 }}</template>&nbsp;</span></p>
  </div>
</template>

<style scoped>
.sc { display: flex; flex-direction: column; gap: 8px; }
p { margin: 0; }
.matrix { display: grid; grid-template-columns: 22px repeat(16, minmax(0, 1fr)); gap: 3px; align-items: center; }
.head { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.head .chip { min-width: 0; width: 100%; padding: 0; }
.cap { border: 0; background: none; color: #5d7280; font-size: 9px; padding: 0; line-height: 1; }
.cap:hover { color: var(--g); }
.gname { font-weight: 800; text-align: center; }
.cell { height: 22px; border: 1px solid #14212a; border-radius: 4px; background: #0b1216; color: #8ea3b0; font-size: 11px; font-family: ui-monospace, monospace; padding: 0; }
.cell.sel { background: #10202a; }
.cell.cur { border-color: var(--gc); color: #fff; }
.cell:hover { border-color: var(--g); }
</style>
