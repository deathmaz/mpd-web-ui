<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'
import { formatDuration } from '@/utils/format'
import type { MpdSong } from '@mpd-web/shared'
import AlbumArt from '@/components/common/AlbumArt.vue'

const route = useRoute()
const router = useRouter()
const albumName = route.query.album as string
const artistName = route.query.artist as string
const songs = ref<MpdSong[]>([])
const loading = ref(true)

const artUrl = computed(() => {
  if (songs.value.length === 0) return ''
  return `/api/art/${encodeURIComponent(songs.value[0].file)}`
})

onMounted(async () => {
  try {
    const params = new URLSearchParams({ album: albumName })
    if (artistName) params.set('artist', artistName)
    const res = await fetch(`/api/library/songs?${params}`)
    if (!res.ok) return
    const data = await res.json()
    songs.value = data.songs
  } finally {
    loading.value = false
  }
})

async function addSong(uri: string) {
  await sendCommand('add', { uri })
}

async function addAll() {
  await sendCommand('addMultiple', { uris: songs.value.map((s) => s.file) })
}

async function replaceAll() {
  await sendCommand('clear')
  await sendCommand('addMultiple', { uris: songs.value.map((s) => s.file) })
  await sendCommand('play', { pos: 0 })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-border">
      <div class="flex items-center gap-3 mb-3">
        <button class="text-text-muted hover:text-text" @click="router.back()">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <div class="flex gap-4">
        <div class="w-24 h-24 rounded-lg bg-surface-hover shrink-0 overflow-hidden">
          <AlbumArt :src="artUrl" />
        </div>
        <div class="flex-1 min-w-0">
          <h1 class="text-lg font-semibold truncate">{{ albumName }}</h1>
          <p class="text-sm text-text-muted truncate">{{ artistName }}</p>
          <div class="flex gap-2 mt-3">
            <button
              class="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
              @click="replaceAll"
            >Play</button>
            <button
              class="px-3 py-1.5 text-xs bg-surface-hover text-text-muted rounded-lg hover:text-text transition-colors"
              @click="addAll"
            >Add to queue</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-8 text-text-muted text-sm">Loading...</div>

    <div v-else class="flex-1 overflow-y-auto">
      <div
        v-for="song in songs"
        :key="song.file"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt transition-colors cursor-pointer"
        @click="addSong(song.file)"
      >
        <span class="w-6 text-xs text-text-muted text-right shrink-0">{{ song.Track || '' }}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ song.Title || song.file }}</p>
        </div>
        <span class="text-xs text-text-muted shrink-0">{{ formatDuration(song.duration || song.Time) }}</span>
      </div>
    </div>
  </div>
</template>
