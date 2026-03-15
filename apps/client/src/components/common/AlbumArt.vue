<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  src?: string | null
}>()

const errored = ref(false)

watch(() => props.src, () => {
  errored.value = false
})
</script>

<template>
  <img
    v-if="src && !errored"
    :src="src"
    class="w-full h-full object-cover"
    loading="lazy"
    @error="errored = true"
  />
  <div v-else class="w-full h-full flex items-center justify-center text-text-muted">
    <svg class="w-1/2 h-1/2" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  </div>
</template>
