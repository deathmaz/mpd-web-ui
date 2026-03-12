<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'
import { formatDuration } from '@/utils/format'
import type { MpdSong } from '@mpd-web/shared'

const route = useRoute()
const router = useRouter()
const name = route.params.name as string
const songs = ref<MpdSong[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch(`/api/playlists/${encodeURIComponent(name)}`)
    if (!res.ok) return
    const data = await res.json()
    songs.value = data.songs
  } finally {
    loading.value = false
  }
})

async function loadAndPlay() {
  await sendCommand('clear')
  await sendCommand('loadPlaylist', { name })
  await sendCommand('play', { pos: 0 })
}

async function appendToQueue() {
  await sendCommand('loadPlaylist', { name })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b border-border">
      <div class="flex items-center gap-3 mb-2">
        <button class="text-text-muted hover:text-text" @click="router.back()">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-lg font-semibold truncate">{{ name }}</h1>
      </div>
      <div class="flex gap-2">
        <button
          class="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          @click="loadAndPlay"
        >Play</button>
        <button
          class="px-3 py-1.5 text-xs bg-surface-hover text-text-muted rounded-lg hover:text-text transition-colors"
          @click="appendToQueue"
        >Add to queue</button>
      </div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-8 text-text-muted text-sm">Loading...</div>

    <div v-else class="flex-1 overflow-y-auto">
      <div
        v-for="(song, idx) in songs"
        :key="song.file"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt transition-colors"
      >
        <span class="w-6 text-xs text-text-muted text-right shrink-0">{{ idx + 1 }}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ song.Title || song.file }}</p>
          <p class="text-xs text-text-muted truncate">{{ song.Artist || '' }}</p>
        </div>
        <span class="text-xs text-text-muted shrink-0">{{ formatDuration(song.duration || song.Time) }}</span>
      </div>
    </div>
  </div>
</template>
