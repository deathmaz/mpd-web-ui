<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'
import { useScrollRestore } from '@/composables/useScrollRestore'
import AlbumArt from '@/components/common/AlbumArt.vue'

const route = useRoute()
const router = useRouter()
const artistName = route.params.name as string
const albums = ref<{ album: string; artist: string; date?: string; coverFile: string | null }[]>([])
const loading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
useScrollRestore(scrollRef)

onMounted(async () => {
  try {
    const res = await fetch(`/api/library/albums?artist=${encodeURIComponent(artistName)}`)
    if (!res.ok) return
    const data = await res.json()
    albums.value = data.albums
  } finally {
    loading.value = false
  }
})

function goToAlbum(album: string) {
  router.push({ name: 'album-detail', params: { artist: artistName, album } })
}

async function playAlbum(album: string) {
  const res = await fetch(`/api/library/songs?album=${encodeURIComponent(album)}&artist=${encodeURIComponent(artistName)}`)
  if (!res.ok) return
  const uris = (await res.json()).songs.map((s: { file: string }) => s.file)
  if (uris.length === 0) return
  await sendCommand('clear')
  await sendCommand('addMultiple', { uris })
  await sendCommand('play', { pos: 0 })
}

async function addAlbum(album: string) {
  const res = await fetch(`/api/library/songs?album=${encodeURIComponent(album)}&artist=${encodeURIComponent(artistName)}`)
  if (!res.ok) return
  const data = await res.json()
  await sendCommand('addMultiple', { uris: data.songs.map((s: { file: string }) => s.file) })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-3 px-4 py-3 border-b border-border">
      <button class="text-text-muted hover:text-text" @click="router.back()">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-lg font-semibold truncate">{{ artistName }}</h1>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-8 text-text-muted text-sm">Loading...</div>

    <div v-else ref="scrollRef" class="flex-1 overflow-y-auto">
      <div
        v-for="item in albums"
        :key="item.album"
        class="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors cursor-pointer group"
        @click="goToAlbum(item.album)"
      >
        <div class="w-12 h-12 rounded bg-surface-hover shrink-0 overflow-hidden">
          <AlbumArt :src="item.coverFile ? `/api/art/${encodeURIComponent(item.coverFile)}` : null" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ item.album }}</p>
          <p v-if="item.date" class="text-xs text-text-muted truncate">{{ item.date.slice(0, 4) }}</p>
        </div>
        <button
          class="px-2 py-1 text-xs bg-primary text-surface rounded hover:bg-primary-hover md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click.stop="playAlbum(item.album)"
        >Play</button>
        <button
          class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click.stop="addAlbum(item.album)"
        >Add</button>
      </div>
    </div>
  </div>
</template>
