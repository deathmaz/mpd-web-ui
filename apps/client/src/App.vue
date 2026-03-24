<script setup lang="ts">
import { watchEffect } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { usePlayerStore } from '@/stores/player'
import AppLayout from '@/components/layout/AppLayout.vue'

useWebSocket()

const player = usePlayerStore()

watchEffect(() => {
  const song = player.currentSong
  document.title = song?.Title
    ? `${song.Title}${song.Artist ? ` — ${song.Artist}` : ''}`
    : 'MPD Web'
})
</script>

<template>
  <AppLayout />
</template>
