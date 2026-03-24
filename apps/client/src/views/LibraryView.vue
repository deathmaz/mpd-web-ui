<script lang="ts">
import { ref } from 'vue'
import type { MpdDirectoryEntry } from '@mpd-web/shared'

// Module-level state — persists across component remounts
const artists = ref<string[]>([])
const albums = ref<{ album: string; artist: string; coverFile: string | null }[]>([])
const folderEntries = ref<MpdDirectoryEntry[]>([])
const folderPath = ref('')
const FOLDER_CACHE_MAX = 100
const folderCache = new Map<string, MpdDirectoryEntry[]>()
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sendCommand } from '@/composables/useWebSocket'
import { useVirtualList } from '@/composables/useVirtualList'
import { formatDuration } from '@/utils/format'
import FilterInput from '@/components/common/FilterInput.vue'
import AlbumArt from '@/components/common/AlbumArt.vue'
import ArtistLink from '@/components/common/ArtistLink.vue'
import AlbumLink from '@/components/common/AlbumLink.vue'
import { useScrollRestore } from '@/composables/useScrollRestore'

const ARTIST_HEIGHT = 64
const ALBUM_HEIGHT = 64
const FOLDER_HEIGHT = 52

type Tab = 'artists' | 'albums' | 'folders'
const tabLabels: Record<Tab, string> = { artists: 'Artists', albums: 'Albums', folders: 'Folders' }

const route = useRoute()
const router = useRouter()

const routeToTab: Record<string, Tab> = {
  'library-folders': 'folders',
  'library-artists': 'artists',
  'library-albums': 'albums',
}
const tabToRoute: Record<Tab, string> = {
  folders: 'library-folders',
  artists: 'library-artists',
  albums: 'library-albums',
}
const activeTab = computed(() => routeToTab[route.name as string] || 'folders')
const loading = ref(false)
const filter = ref('')

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

// Virtual lists for each tab
const artistsVl = useVirtualList({ items: filteredArtists, itemHeight: () => ARTIST_HEIGHT })
const albumsVl = useVirtualList({ items: filteredAlbums, itemHeight: () => ALBUM_HEIGHT })
const foldersVl = useVirtualList({ items: filteredFolderEntries, itemHeight: () => FOLDER_HEIGHT })
useScrollRestore(artistsVl.containerRef, '/library/artists')
useScrollRestore(albumsVl.containerRef, '/library/albums')
useScrollRestore(foldersVl.containerRef)

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
    if (folderCache.size > FOLDER_CACHE_MAX) {
      const first = folderCache.keys().next().value!
      folderCache.delete(first)
    }
    folderEntries.value = data.entries
    folderPath.value = path
  } finally {
    loading.value = false
  }
}

function selectTab(tab: Tab) {
  router.push({ name: tabToRoute[tab] })
}

function loadTabData(tab: Tab) {
  filter.value = ''
  if (tab === 'artists' && artists.value.length === 0) fetchArtists()
  if (tab === 'albums' && albums.value.length === 0) fetchAlbums()
  if (tab === 'folders') fetchFolder(getFolderPathFromRoute())
}

function getFolderPathFromRoute(): string {
  const p = route.params.path
  if (Array.isArray(p)) return p.join('/')
  return p || ''
}

function goToArtist(name: string) {
  router.push({ name: 'artist-detail', params: { name } })
}

function goToAlbum(album: string, artist: string) {
  router.push({ name: 'album-detail', params: { artist, album } })
}

function enterFolder(path: string) {
  router.push({ name: 'library-folders', params: { path } })
}

function goBack() {
  router.back()
}

async function playUri(uri: string) {
  await sendCommand('clear')
  await sendCommand('add', { uri })
  await sendCommand('play', { pos: 0 })
}

async function playEntry(entry: MpdDirectoryEntry) {
  if (entry.type === 'directory') {
    await playUri(entry.path)
  } else {
    const id = await sendCommand('addId', { uri: entry.path }) as number
    await sendCommand('playId', { id })
  }
}

async function addEntry(entry: MpdDirectoryEntry) {
  await sendCommand('add', { uri: entry.path })
}

async function playFolder() {
  await playUri(folderPath.value)
}

async function addFolder() {
  await sendCommand('add', { uri: folderPath.value })
}

async function playAlbum(album: string, artist: string) {
  const res = await fetch(`/api/library/songs?album=${encodeURIComponent(album)}&artist=${encodeURIComponent(artist)}`)
  if (!res.ok) return
  const data = await res.json()
  const uris = data.songs.map((s: { file: string }) => s.file)
  if (uris.length === 0) return
  await sendCommand('clear')
  await sendCommand('addMultiple', { uris })
  await sendCommand('play', { pos: 0 })
}

async function addAlbum(album: string, artist: string) {
  const res = await fetch(`/api/library/songs?album=${encodeURIComponent(album)}&artist=${encodeURIComponent(artist)}`)
  if (!res.ok) return
  const data = await res.json()
  const uris = data.songs.map((s: { file: string }) => s.file)
  if (uris.length > 0) {
    await sendCommand('addMultiple', { uris })
  }
}

async function fetchArtistUris(artist: string): Promise<string[]> {
  const res = await fetch(`/api/library/albums?artist=${encodeURIComponent(artist)}`)
  if (!res.ok) return []
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
  return allUris
}

async function playArtist(artist: string) {
  const uris = await fetchArtistUris(artist)
  if (uris.length === 0) return
  await sendCommand('clear')
  await sendCommand('addMultiple', { uris })
  await sendCommand('play', { pos: 0 })
}

async function addArtist(artist: string) {
  const uris = await fetchArtistUris(artist)
  if (uris.length > 0) {
    await sendCommand('addMultiple', { uris })
  }
}

watch(filter, () => {
  if (activeTab.value === 'artists') artistsVl.resetScroll()
  else if (activeTab.value === 'albums') albumsVl.resetScroll()
  else foldersVl.resetScroll()
})

watch(() => [route.name, route.params.path], () => loadTabData(activeTab.value), { immediate: true })
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
    <div v-else-if="activeTab === 'artists'" :ref="(el) => { artistsVl.containerRef.value = el as HTMLElement | null }" class="flex-1 overflow-y-auto">
      <div v-if="filteredArtists.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
        No matches
      </div>
      <div v-else :style="{ height: artistsVl.totalHeight.value + 'px', position: 'relative', overflow: 'hidden' }">
        <div
          v-for="vItem in artistsVl.visibleItems.value"
          :key="vItem.item"
          class="absolute left-0 right-0 flex items-center gap-3 px-4 hover:bg-surface-alt transition-colors cursor-pointer group"
          :style="{ top: vItem.offsetTop + 'px', height: vItem.height + 'px' }"
          @click="goToArtist(vItem.item)"
        >
          <div class="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted shrink-0">
            <span class="text-sm font-medium">{{ (vItem.item[0] || '?').toUpperCase() }}</span>
          </div>
          <span class="flex-1 text-sm truncate">{{ vItem.item }}</span>
          <button
            class="px-2 py-1 text-xs bg-primary text-surface rounded hover:bg-primary-hover md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="playArtist(vItem.item)"
          >Play</button>
          <button
            class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="addArtist(vItem.item)"
          >Add</button>
        </div>
      </div>
    </div>

    <!-- Albums list -->
    <div v-else-if="activeTab === 'albums'" :ref="(el) => { albumsVl.containerRef.value = el as HTMLElement | null }" class="flex-1 overflow-y-auto">
      <div v-if="filteredAlbums.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
        No matches
      </div>
      <div v-else :style="{ height: albumsVl.totalHeight.value + 'px', position: 'relative', overflow: 'hidden' }">
        <div
          v-for="vItem in albumsVl.visibleItems.value"
          :key="`${vItem.item.artist}-${vItem.item.album}`"
          class="absolute left-0 right-0 flex items-center gap-3 px-4 hover:bg-surface-alt transition-colors cursor-pointer group"
          :style="{ top: vItem.offsetTop + 'px', height: vItem.height + 'px' }"
          @click="goToAlbum(vItem.item.album, vItem.item.artist)"
        >
          <div class="w-10 h-10 rounded bg-surface-hover overflow-hidden shrink-0">
            <AlbumArt :src="vItem.item.coverFile ? `/api/art/${encodeURIComponent(vItem.item.coverFile)}` : null" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{{ vItem.item.album }}</p>
            <p class="text-xs text-text-muted truncate"><ArtistLink :name="vItem.item.artist" /></p>
          </div>
          <button
            class="px-2 py-1 text-xs bg-primary text-surface rounded hover:bg-primary-hover md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="playAlbum(vItem.item.album, vItem.item.artist)"
          >Play</button>
          <button
            class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="addAlbum(vItem.item.album, vItem.item.artist)"
          >Add</button>
        </div>
      </div>
    </div>

    <!-- Folders list -->
    <template v-else-if="activeTab === 'folders'">
      <!-- Breadcrumb / back (outside scroll container) -->
      <div v-if="folderPath" class="flex items-center gap-2 px-4 py-2 border-b border-border text-sm">
        <button class="text-text-muted hover:text-text shrink-0" @click="goBack">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span class="flex-1 text-text-muted truncate">{{ folderPath }}</span>
        <button
          class="px-3 py-1.5 text-xs bg-primary text-surface rounded-lg hover:bg-primary-hover transition-colors shrink-0"
          @click="playFolder"
        >Play</button>
        <button
          class="px-3 py-1.5 text-xs bg-surface-hover text-text-muted rounded-lg hover:text-text transition-colors shrink-0"
          @click="addFolder"
        >Add to queue</button>
      </div>

      <div :ref="(el) => { foldersVl.containerRef.value = el as HTMLElement | null }" class="flex-1 overflow-y-auto">
        <div v-if="filteredFolderEntries.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
          {{ filter ? 'No matches' : 'Empty folder' }}
        </div>
        <div v-else :style="{ height: foldersVl.totalHeight.value + 'px', position: 'relative', overflow: 'hidden' }">
          <div
            v-for="vItem in foldersVl.visibleItems.value"
            :key="vItem.item.path"
            class="absolute left-0 right-0 flex items-center gap-3 px-4 hover:bg-surface-alt transition-colors cursor-pointer group"
            :style="{ top: vItem.offsetTop + 'px', height: vItem.height + 'px' }"
            @click="vItem.item.type === 'directory' ? enterFolder(vItem.item.path) : playEntry(vItem.item)"
          >
            <!-- Icon -->
            <div class="w-8 h-8 flex items-center justify-center text-text-muted shrink-0">
              <svg v-if="vItem.item.type === 'directory'" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
              </svg>
            </div>

            <!-- Name & details -->
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate">{{ vItem.item.type === 'file' && vItem.item.Title ? vItem.item.Title : vItem.item.name }}</p>
              <p v-if="vItem.item.type === 'file' && vItem.item.Artist" class="text-xs text-text-muted truncate">
                <ArtistLink :name="vItem.item.Artist" /><template v-if="vItem.item.Album"> &middot; <AlbumLink :album="vItem.item.Album" :artist="vItem.item.Artist" /></template>
              </p>
            </div>

            <!-- Duration for files -->
            <span v-if="vItem.item.type === 'file'" class="text-xs text-text-muted shrink-0">
              {{ formatDuration(vItem.item.duration || vItem.item.Time) }}
            </span>

            <!-- Play / Add buttons -->
            <button
              class="px-2 py-1 text-xs bg-primary text-surface rounded hover:bg-primary-hover md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              @click.stop="playEntry(vItem.item)"
            >Play</button>
            <button
              class="px-2 py-1 text-xs bg-surface-hover rounded text-text-muted hover:text-text md:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              @click.stop="addEntry(vItem.item)"
            >Add</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
