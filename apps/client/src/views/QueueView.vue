<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useQueueStore } from '@/stores/queue'
import { sendCommand } from '@/composables/useWebSocket'
import { formatDuration, formatTotalDuration } from '@/utils/format'
import FilterInput from '@/components/common/FilterInput.vue'

const player = usePlayerStore()
const queue = useQueueStore()
const filter = ref('')

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

onMounted(() => {
  nextTick(() => {
    const el = document.querySelector('[data-current-song]')
    if (el) el.scrollIntoView({ block: 'center' })
  })
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
    <div class="flex-1 overflow-y-auto">
      <div v-if="queue.songs.length === 0" class="flex items-center justify-center h-full text-text-muted text-sm">
        Queue is empty
      </div>
      <div v-else-if="filteredSongs.length === 0" class="flex items-center justify-center py-8 text-text-muted text-sm">
        No matches
      </div>
      <template
        v-for="(song, idx) in filteredSongs"
        :key="song.Id"
      >
        <!-- Album separator -->
        <div
          v-if="song.Album && (idx === 0 || song.Album !== filteredSongs[idx - 1]?.Album || song.AlbumArtist !== filteredSongs[idx - 1]?.AlbumArtist)"
          class="flex items-center gap-2 px-4 py-1.5 bg-surface-hover border-t border-border sticky top-0 z-10"
        >
          <span class="text-xs font-medium text-text-muted truncate">{{ song.Album }}</span>
          <span v-if="song.Date" class="text-xs text-text-muted/60 truncate">({{ song.Date.slice(0, 4) }})</span>
          <span v-if="song.AlbumArtist || song.Artist" class="text-xs text-text-muted/60 truncate">&mdash; {{ song.AlbumArtist || song.Artist }}</span>
        </div>
        <div
          class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-alt transition-colors cursor-pointer group"
          :class="{ 'bg-surface-alt': song.Pos === player.currentSong?.Pos }"
          :data-current-song="song.Pos === player.currentSong?.Pos ? '' : undefined"
          @click="playSong(song.Pos!)"
        >
        <!-- Now playing indicator -->
        <div class="w-5 shrink-0 text-center">
          <span
            v-if="song.Pos === player.currentSong?.Pos && player.playState === 'play'"
            class="text-primary text-xs"
          >&#9654;</span>
          <span v-else class="text-xs text-text-muted">{{ (song.Pos ?? 0) + 1 }}</span>
        </div>

        <!-- Song info -->
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate" :class="{ 'text-primary': song.Pos === player.currentSong?.Pos }">
            {{ song.Title || song.file }}
          </p>
          <p class="text-xs text-text-muted truncate">
            {{ song.Artist || 'Unknown Artist' }}{{ song.Album ? ` \u00b7 ${song.Album}` : '' }}
          </p>
        </div>

        <!-- Duration -->
        <span class="text-xs text-text-muted shrink-0">
          {{ formatDuration(song.duration || song.Time) }}
        </span>

        <!-- Remove button -->
        <button
          class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          @click.stop="removeSong(song.Id!)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        </div>
      </template>
    </div>
  </div>
</template>
