<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useQueueStore } from '@/stores/queue'
import { sendCommand } from '@/composables/useWebSocket'
import { useVirtualList, findStartIndex } from '@/composables/useVirtualList'
import { formatDuration, formatTotalDuration } from '@/utils/format'
import FilterInput from '@/components/common/FilterInput.vue'
import type { MpdSong } from '@mpd-web/shared'

const HEADER_HEIGHT = 28
const SONG_HEIGHT = 56

type QueueItem =
  | { type: 'header'; key: string; groupKey: string; album: string; date?: string; artist?: string }
  | { type: 'song'; key: string; song: MpdSong }

const player = usePlayerStore()
const queue = useQueueStore()
const filter = ref('')
const collapsedAlbums = ref(new Set<string>())

function albumGroupKey(album: string, artist?: string): string {
  return `${album}::${artist || ''}`
}

function toggleAlbum(key: string) {
  const s = new Set(collapsedAlbums.value)
  s.has(key) ? s.delete(key) : s.add(key)
  collapsedAlbums.value = s
}

const filteredSongs = computed(() => {
  const q = filter.value.toLowerCase().trim()
  if (!q) return queue.songs
  return queue.songs.filter((song) => {
    const title = (song.Title || song.file || '').toLowerCase()
    const artist = (song.Artist || '').toLowerCase()
    const album = (song.Album || '').toLowerCase()
    return title.includes(q) || artist.includes(q) || album.includes(q)
  })
})

const flatItems = computed<QueueItem[]>(() => {
  const songs = filteredSongs.value
  const collapsed = collapsedAlbums.value
  const result: QueueItem[] = []
  let currentGroupKey = ''
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i]
    if (song.Album && (i === 0 || song.Album !== songs[i - 1]?.Album || song.AlbumArtist !== songs[i - 1]?.AlbumArtist)) {
      currentGroupKey = albumGroupKey(song.Album, song.AlbumArtist || song.Artist)
      result.push({
        type: 'header',
        key: `h-${result.length}`,
        groupKey: currentGroupKey,
        album: song.Album,
        date: song.Date,
        artist: song.AlbumArtist || song.Artist,
      })
    }
    if (!collapsed.has(currentGroupKey)) {
      result.push({ type: 'song', key: `s-${song.Id}`, song })
    }
  }
  return result
})

const allCollapsed = computed(() => {
  const items = flatItems.value
  const collapsed = collapsedAlbums.value
  let headerCount = 0
  for (const item of items) {
    if (item.type === 'header') {
      headerCount++
      if (!collapsed.has(item.groupKey)) return false
    }
  }
  return headerCount > 0
})

function collapseAll() {
  const keys = new Set<string>()
  for (const item of flatItems.value) {
    if (item.type === 'header') keys.add(item.groupKey)
  }
  collapsedAlbums.value = keys
}

function expandAll() {
  collapsedAlbums.value = new Set()
}

const { containerRef, scrollTop, prefixSums, totalHeight, visibleItems, scrollToIndex, resetScroll } = useVirtualList({
  items: flatItems,
  itemHeight: (item) => item.type === 'header' ? HEADER_HEIGHT : SONG_HEIGHT,
})

// Sticky header: binary search for scroll position, then walk back to find nearest header
const stickyHeader = computed(() => {
  const items = flatItems.value
  const sums = prefixSums.value
  const top = scrollTop.value
  if (top <= 0 || items.length === 0) return null

  const startIdx = findStartIndex(sums, top)
  for (let i = Math.min(startIdx, items.length - 1); i >= 0; i--) {
    const item = items[i]
    if (item.type === 'header' && sums[i + 1] <= top) return item
  }
  return null
})

const summary = computed(() => {
  const total = queue.songs.length
  const dur = formatTotalDuration(queue.totalDuration)
  const base = `${total} song${total !== 1 ? 's' : ''}, ${dur}`
  if (filteredSongs.value.length !== total) {
    return `${filteredSongs.value.length} of ${base}`
  }
  return base
})

async function playSong(pos: number) {
  await sendCommand('play', { pos })
}

async function removeSong(id: number) {
  await sendCommand('deleteId', { id })
}

watch(filter, () => resetScroll())

// Scroll to current song on mount (expand its album if collapsed)
onMounted(async () => {
  await nextTick()
  const currentSong = player.currentSong
  if (currentSong?.Pos == null) return
  if (currentSong.Album) {
    const key = albumGroupKey(currentSong.Album, currentSong.AlbumArtist || currentSong.Artist)
    if (collapsedAlbums.value.has(key)) {
      const s = new Set(collapsedAlbums.value)
      s.delete(key)
      collapsedAlbums.value = s
      await nextTick()
    }
  }
  const idx = flatItems.value.findIndex(
    (item) => item.type === 'song' && item.song.Pos === currentSong.Pos,
  )
  if (idx >= 0) scrollToIndex(idx, 'center')
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-border">
      <div>
        <h1 class="text-lg font-semibold">Queue</h1>
        <p class="text-xs text-text-muted">{{ summary }}</p>
      </div>
      <div class="flex gap-2">
        <button
          class="px-3 py-1.5 text-xs bg-surface-hover hover:bg-surface-hover/80 rounded-lg text-text-muted hover:text-text transition-colors"
          @click="allCollapsed ? expandAll() : collapseAll()"
        >{{ allCollapsed ? 'Expand' : 'Collapse' }}</button>
        <button
          class="px-3 py-1.5 text-xs bg-surface-hover hover:bg-surface-hover/80 rounded-lg text-text-muted hover:text-text transition-colors"
          @click="sendCommand('shuffle')"
        >Shuffle</button>
        <button
          class="px-3 py-1.5 text-xs bg-surface-hover hover:bg-surface-hover/80 rounded-lg text-text-muted hover:text-text transition-colors"
          @click="sendCommand('clear')"
        >Clear</button>
      </div>
    </div>

    <FilterInput
      v-if="queue.songs.length > 0"
      v-model="filter"
      placeholder="Filter queue..."
    />

    <!-- Song list -->
    <div v-if="queue.songs.length === 0" class="flex-1 flex items-center justify-center text-text-muted text-sm">
      Queue is empty
    </div>
    <div v-else-if="filteredSongs.length === 0" class="flex-1 flex items-center justify-center text-text-muted text-sm">
      No matches
    </div>
    <div v-else ref="containerRef" class="flex-1 overflow-y-auto relative">
      <!-- Sticky header overlay (zero-height wrapper so it doesn't shift the spacer) -->
      <div class="sticky top-0 z-10" style="height: 0;">
        <div
          v-if="stickyHeader"
          class="flex items-center gap-2 px-4 bg-surface-hover border-b border-border cursor-pointer select-none"
          :style="{ height: HEADER_HEIGHT + 'px' }"
          @click="toggleAlbum(stickyHeader.groupKey)"
        >
          <svg class="w-3 h-3 text-text-muted shrink-0 transition-transform" :class="{ '-rotate-90': collapsedAlbums.has(stickyHeader.groupKey) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
          <span class="text-xs font-medium text-text-muted truncate">{{ stickyHeader.album }}</span>
          <span v-if="stickyHeader.date" class="text-xs text-text-muted/60 truncate">({{ stickyHeader.date.slice(0, 4) }})</span>
          <span v-if="stickyHeader.artist" class="text-xs text-text-muted/60 truncate">&mdash; {{ stickyHeader.artist }}</span>
        </div>
      </div>

      <!-- Virtual spacer -->
      <div :style="{ height: totalHeight + 'px', position: 'relative', overflow: 'hidden' }">
        <template v-for="vItem in visibleItems">
          <!-- Album header -->
          <div
            v-if="vItem.item.type === 'header'"
            :key="vItem.item.key"
            class="absolute left-0 right-0 flex items-center gap-2 px-4 bg-surface-hover border-t border-border cursor-pointer select-none"
            :style="{ top: vItem.offsetTop + 'px', height: vItem.height + 'px' }"
            @click="toggleAlbum(vItem.item.groupKey)"
          >
            <svg class="w-3 h-3 text-text-muted shrink-0 transition-transform" :class="{ '-rotate-90': collapsedAlbums.has(vItem.item.groupKey) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" /></svg>
            <span class="text-xs font-medium text-text-muted truncate">{{ vItem.item.album }}</span>
            <span v-if="vItem.item.date" class="text-xs text-text-muted/60 truncate">({{ vItem.item.date.slice(0, 4) }})</span>
            <span v-if="vItem.item.artist" class="text-xs text-text-muted/60 truncate">&mdash; {{ vItem.item.artist }}</span>
          </div>
          <!-- Song row -->
          <div
            v-else
            :key="vItem.item.key"
            class="absolute left-0 right-0 flex items-center gap-3 px-4 hover:bg-surface-alt transition-colors cursor-pointer group"
            :class="{ 'bg-surface-alt': vItem.item.song.Pos === player.currentSong?.Pos }"
            :style="{ top: vItem.offsetTop + 'px', height: vItem.height + 'px' }"
            @click="playSong(vItem.item.song.Pos!)"
          >
            <!-- Now playing indicator -->
            <div class="w-5 shrink-0 text-center">
              <span
                v-if="vItem.item.song.Pos === player.currentSong?.Pos && player.playState === 'play'"
                class="text-primary text-xs"
              >&#9654;</span>
              <span v-else class="text-xs text-text-muted">{{ (vItem.item.song.Pos ?? 0) + 1 }}</span>
            </div>

            <!-- Song info -->
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate" :class="{ 'text-primary': vItem.item.song.Pos === player.currentSong?.Pos }">
                {{ vItem.item.song.Title || vItem.item.song.file }}
              </p>
              <p class="text-xs text-text-muted truncate">
                {{ vItem.item.song.Artist || 'Unknown Artist' }}{{ vItem.item.song.Album ? ` \u00b7 ${vItem.item.song.Album}` : '' }}
              </p>
            </div>

            <!-- Duration -->
            <span class="text-xs text-text-muted shrink-0">
              {{ formatDuration(vItem.item.song.duration || vItem.item.song.Time) }}
            </span>

            <!-- Remove button -->
            <button
              class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              @click.stop="removeSong(vItem.item.song.Id!)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
