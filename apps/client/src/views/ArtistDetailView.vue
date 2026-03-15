<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'
import AlbumArt from '@/components/common/AlbumArt.vue'

const route = useRoute()
const router = useRouter()
const artistName = route.params.name as string
const albums = ref<{ album: string; artist: string; coverFile: string | null }[]>([])
const loading = ref(true)

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
  router.push({ name: 'album-detail', query: { album, artist: artistName } })
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

    <div v-else class="flex-1 overflow-y-auto">
      <div
        v-for="item in albums"
        :key="item.album"
        class="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors cursor-pointer group"
        @click="goToAlbum(item.album)"
      >
        <div class="w-12 h-12 rounded bg-surface-hover shrink-0 overflow-hidden">
          <AlbumArt :src="item.coverFile ? `/api/art/${encodeURIComponent(item.coverFile)}` : null" />
        </div>
        <span class="flex-1 text-sm truncate">{{ item.album }}</span>
        <button
          class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
          @click.stop="addAlbum(item.album)"
        >Add</button>
      </div>
    </div>
  </div>
</template>
