<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'
import { useScrollRestore } from '@/composables/useScrollRestore'
import type { MpdPlaylist } from '@mpd-web/shared'

const router = useRouter()
const playlists = ref<MpdPlaylist[]>([])
const loading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
useScrollRestore(scrollRef)

onMounted(async () => {
  try {
    const res = await fetch('/api/playlists')
    if (!res.ok) return
    const data = await res.json()
    playlists.value = data.playlists
  } finally {
    loading.value = false
  }
})

function viewPlaylist(name: string) {
  router.push({ name: 'playlist-detail', params: { name } })
}

async function playPlaylist(name: string) {
  await sendCommand('clear')
  await sendCommand('loadPlaylist', { name })
  await sendCommand('play', { pos: 0 })
}

async function loadPlaylist(name: string) {
  await sendCommand('loadPlaylist', { name })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b border-border">
      <h1 class="text-lg font-semibold">Playlists</h1>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-8 text-text-muted text-sm">Loading...</div>

    <div v-else-if="playlists.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
      No saved playlists
    </div>

    <div v-else ref="scrollRef" class="flex-1 overflow-y-auto">
      <div
        v-for="pl in playlists"
        :key="pl.playlist"
        class="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors cursor-pointer group"
        @click="viewPlaylist(pl.playlist)"
      >
        <div class="w-10 h-10 rounded bg-surface-hover flex items-center justify-center text-text-muted shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ pl.playlist }}</p>
        </div>
        <button
          class="px-2 py-1 text-xs bg-primary text-surface rounded hover:bg-primary-hover md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click.stop="playPlaylist(pl.playlist)"
        >Play</button>
        <button
          class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click.stop="loadPlaylist(pl.playlist)"
        >Load</button>
      </div>
    </div>
  </div>
</template>
