<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'

const router = useRouter()
const activeTab = ref<'artists' | 'albums'>('artists')
const artists = ref<string[]>([])
const albums = ref<{ album: string; artist: string }[]>([])
const loading = ref(false)

async function fetchArtists() {
  loading.value = true
  try {
    const res = await fetch('/api/library/artists')
    if (!res.ok) return
    const data = await res.json()
    artists.value = data.artists
  } finally {
    loading.value = false
  }
}

async function fetchAlbums() {
  loading.value = true
  try {
    const res = await fetch('/api/library/albums')
    if (!res.ok) return
    const data = await res.json()
    albums.value = data.albums
  } finally {
    loading.value = false
  }
}

function selectTab(tab: 'artists' | 'albums') {
  activeTab.value = tab
  if (tab === 'artists' && artists.value.length === 0) fetchArtists()
  if (tab === 'albums' && albums.value.length === 0) fetchAlbums()
}

function goToArtist(name: string) {
  router.push({ name: 'artist-detail', params: { name } })
}

function goToAlbum(album: string, artist: string) {
  router.push({ name: 'album-detail', query: { album, artist } })
}

async function addArtist(artist: string) {
  const res = await fetch(`/api/library/albums?artist=${encodeURIComponent(artist)}`)
  if (!res.ok) return
  const data = await res.json()
  const allUris: string[] = []
  await Promise.all(
    data.albums.map(async (a: { album: string }) => {
      const songsRes = await fetch(`/api/library/songs?album=${encodeURIComponent(a.album)}&artist=${encodeURIComponent(artist)}`)
      if (!songsRes.ok) return
      const songsData = await songsRes.json()
      for (const song of songsData.songs) {
        allUris.push(song.file)
      }
    }),
  )
  if (allUris.length > 0) {
    await sendCommand('addMultiple', { uris: allUris })
  }
}

onMounted(fetchArtists)
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tabs -->
    <div class="flex border-b border-border">
      <button
        v-for="tab in (['artists', 'albums'] as const)"
        :key="tab"
        class="flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2"
        :class="activeTab === tab
          ? 'text-primary border-primary'
          : 'text-text-muted border-transparent hover:text-text'"
        @click="selectTab(tab)"
      >{{ tab === 'artists' ? 'Artists' : 'Albums' }}</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-8 text-text-muted text-sm">
      Loading...
    </div>

    <!-- Artists list -->
    <div v-else-if="activeTab === 'artists'" class="flex-1 overflow-y-auto">
      <div
        v-for="artist in artists"
        :key="artist"
        class="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors cursor-pointer group"
        @click="goToArtist(artist)"
      >
        <div class="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted shrink-0">
          <span class="text-sm font-medium">{{ (artist[0] || '?').toUpperCase() }}</span>
        </div>
        <span class="flex-1 text-sm truncate">{{ artist }}</span>
        <button
          class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
          @click.stop="addArtist(artist)"
        >Add</button>
      </div>
    </div>

    <!-- Albums list -->
    <div v-else class="flex-1 overflow-y-auto">
      <div
        v-for="item in albums"
        :key="`${item.artist}-${item.album}`"
        class="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors cursor-pointer"
        @click="goToAlbum(item.album, item.artist)"
      >
        <div class="w-10 h-10 rounded bg-surface-hover overflow-hidden shrink-0">
          <!-- Could add album art here -->
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ item.album }}</p>
          <p class="text-xs text-text-muted truncate">{{ item.artist }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
