<script setup lang="ts">
import { playback, project, selectGroup, ui } from '../store'
</script>

<template>
  <div class="groups">
    <button
      v-for="(g, i) in project.groups"
      :key="i"
      class="grp"
      :class="{ on: ui.group === i, muted: g.mute }"
      :aria-label="`Group ${g.name}`"
      :aria-pressed="ui.group === i"
      :style="{ '--gc': g.color, '--lvl': playback.groupLevel[i] }"
      @click="selectGroup(i)"
    >
      <span class="name">{{ g.name }}</span>
      <i class="led" />
    </button>
  </div>
</template>

<style scoped>
.groups { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.grp {
  position: relative;
  height: 40px;
  border: 1px solid #000;
  border-radius: 8px;
  background: linear-gradient(#34343a, #26262b);
  box-shadow: 0 1px 0 #4a4a52 inset, 0 2px 3px #000a;
  font-weight: 800;
  color: #c9c9d2;
}
.grp .led {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 5px;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--gc) calc(18% + var(--lvl) * 82%), #101012);
  box-shadow: 0 0 calc(var(--lvl) * 12px) var(--gc);
}
.grp.on .led { background: var(--gc); box-shadow: 0 0 8px var(--gc); }
.grp.on { color: #fff; background: linear-gradient(#3c3c44, #2c2c32); }
.grp.muted { opacity: 0.45; }
.name { position: relative; top: 4px; font-size: 15px; }
</style>
