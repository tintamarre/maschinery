<script setup lang="ts">
defineProps<{ label: string; on?: boolean; blink?: boolean; kind?: string; disabled?: boolean; title?: string }>()
</script>

<template>
  <button class="hw" :class="[{ on, blink }, kind]" :disabled="disabled" :title="title" :aria-pressed="on === undefined ? undefined : on">{{ label }}</button>
</template>
