<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'
import { formatDuration } from '@/utils/format'
import FilterInput from '@/components/common/FilterInput.vue'
import AlbumArt from '@/components/common/AlbumArt.vue'
import type { MpdDirectoryEntry } from '@mpd-web/shared'

type Tab = 'artists' | 'albums' | 'folders'
const tabLabels: Record<Tab, string> = { artists: 'Artists', albums: 'Albums', folders: 'Folders' }

const router = useRouter()
const activeTab = ref<Tab>('folders')
const artists = ref<string[]>([])
const albums = ref<{ album: string; artist: string; coverFile: string | null }[]>([])
const loading = ref(false)
const filter = ref('')

// Folders state
const folderEntries = ref<MpdDirectoryEntry[]>([])
const folderPath = ref('')
const folderHistory = ref<string[]>([])
const folderCache = new Map<string, MpdDirectoryEntry[]>()

const filteredArtists = computed(() => {
  const q = filter.value.toLowerCase().trim()
  if (!q) return artists.value
  return artists.value.filter((a) => a.toLowerCase().includes(q))
})

const filteredAlbums = computed(() => {
  const q = filter.value.toLowerCase().trim()
  if (!q) return albums.value
  return albums.value.filter(
    (item) => item.album.toLowerCase().includes(q) || item.artist.toLowerCase().includes(q),
  )
})

const filteredFolderEntries = computed(() => {
  const q = filter.value.toLowerCase().trim()
  if (!q) return folderEntries.value
  return folderEntries.value.filter((e) => e.name.toLowerCase().includes(q))
})

const filterPlaceholder = computed(() => {
  if (activeTab.value === 'artists') return 'Filter artists...'
  if (activeTab.value === 'albums') return 'Filter albums...'
  return 'Filter folders...'
})

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

async function fetchFolder(path: string) {
  const cached = folderCache.get(path)
  if (cached) {
    folderEntries.value = cached
    folderPath.value = path
    return
  }
  loading.value = true
  try {
    const params = path ? `?path=${encodeURIComponent(path)}` : ''
    const res = await fetch(`/api/library/browse${params}`)
    if (!res.ok) return
    const data = await res.json()
    folderCache.set(path, data.entries)
    folderEntries.value = data.entries
    folderPath.value = path
  } finally {
    loading.value = false
  }
}

function selectTab(tab: Tab) {
  activeTab.value = tab
  filter.value = ''
  if (tab === 'artists' && artists.value.length === 0) fetchArtists()
  if (tab === 'albums' && albums.value.length === 0) fetchAlbums()
  if (tab === 'folders' && folderEntries.value.length === 0 && !folderPath.value) fetchFolder('')
}

function goToArtist(name: string) {
  router.push({ name: 'artist-detail', params: { name } })
}

function goToAlbum(album: string, artist: string) {
  router.push({ name: 'album-detail', query: { album, artist } })
}

function enterFolder(path: string) {
  folderHistory.value.push(folderPath.value)
  filter.value = ''
  fetchFolder(path)
}

function goBack() {
  const prev = folderHistory.value.pop()
  if (prev !== undefined) {
    filter.value = ''
    fetchFolder(prev)
  }
}

async function playEntry(entry: MpdDirectoryEntry) {
  const id = await sendCommand('addId', { uri: entry.path }) as number
  await sendCommand('playId', { id })
}

async function addEntry(entry: MpdDirectoryEntry) {
  await sendCommand('add', { uri: entry.path })
}

async function playFolder() {
  await sendCommand('clear')
  await sendCommand('add', { uri: folderPath.value })
  await sendCommand('play', { pos: 0 })
}

async function addFolder() {
  await sendCommand('add', { uri: folderPath.value })
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

onMounted(() => fetchFolder(''))
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tabs -->
    <div class="flex border-b border-border">
      <button
        v-for="tab in (['folders', 'artists', 'albums'] as const)"
        :key="tab"
        class="flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2"
        :class="activeTab === tab
          ? 'text-primary border-primary'
          : 'text-text-muted border-transparent hover:text-text'"
        @click="selectTab(tab)"
      >{{ tabLabels[tab] }}</button>
    </div>

    <FilterInput
      v-if="!loading"
      v-model="filter"
      :placeholder="filterPlaceholder"
    />

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-8 text-text-muted text-sm">
      Loading...
    </div>

    <!-- Artists list -->
    <div v-else-if="activeTab === 'artists'" class="flex-1 overflow-y-auto">
      <div v-if="filteredArtists.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
        No matches
      </div>
      <div
        v-for="artist in filteredArtists"
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
    <div v-else-if="activeTab === 'albums'" class="flex-1 overflow-y-auto">
      <div v-if="filteredAlbums.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
        No matches
      </div>
      <div
        v-for="item in filteredAlbums"
        :key="`${item.artist}-${item.album}`"
        class="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt transition-colors cursor-pointer"
        @click="goToAlbum(item.album, item.artist)"
      >
        <div class="w-10 h-10 rounded bg-surface-hover overflow-hidden shrink-0">
          <AlbumArt :src="item.coverFile ? `/api/art/${encodeURIComponent(item.coverFile)}` : null" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ item.album }}</p>
          <p class="text-xs text-text-muted truncate">{{ item.artist }}</p>
        </div>
      </div>
    </div>

    <!-- Folders list -->
    <div v-else-if="activeTab === 'folders'" class="flex-1 overflow-y-auto">
      <!-- Breadcrumb / back -->
      <div v-if="folderPath" class="flex items-center gap-2 px-4 py-2 border-b border-border text-sm">
        <button class="text-text-muted hover:text-text shrink-0" @click="goBack">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span class="flex-1 text-text-muted truncate">{{ folderPath }}</span>
        <button
          class="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shrink-0"
          @click="playFolder"
        >Play</button>
        <button
          class="px-3 py-1.5 text-xs bg-surface-hover text-text-muted rounded-lg hover:text-text transition-colors shrink-0"
          @click="addFolder"
        >Add to queue</button>
      </div>

      <div v-if="filteredFolderEntries.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
        {{ filter ? 'No matches' : 'Empty folder' }}
      </div>

      <div
        v-for="entry in filteredFolderEntries"
        :key="entry.path"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt transition-colors cursor-pointer group"
        @click="entry.type === 'directory' ? enterFolder(entry.path) : playEntry(entry)"
      >
        <!-- Icon -->
        <div class="w-8 h-8 flex items-center justify-center text-text-muted shrink-0">
          <svg v-if="entry.type === 'directory'" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
        </div>

        <!-- Name & details -->
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">{{ entry.type === 'file' && entry.Title ? entry.Title : entry.name }}</p>
          <p v-if="entry.type === 'file' && entry.Artist" class="text-xs text-text-muted truncate">
            {{ entry.Artist }}{{ entry.Album ? ` \u00b7 ${entry.Album}` : '' }}
          </p>
        </div>

        <!-- Duration for files -->
        <span v-if="entry.type === 'file'" class="text-xs text-text-muted shrink-0">
          {{ formatDuration(entry.duration || entry.Time) }}
        </span>

        <!-- Add button -->
        <button
          class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click.stop="addEntry(entry)"
        >Add</button>
      </div>
    </div>
  </div>
</template>
