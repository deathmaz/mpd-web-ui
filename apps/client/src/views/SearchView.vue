<script setup lang="ts">
import { ref } from 'vue'
import { sendCommand } from '@/composables/useWebSocket'
import { useVirtualList } from '@/composables/useVirtualList'
import { formatDuration } from '@/utils/format'
import { useScrollRestore } from '@/composables/useScrollRestore'
import ArtistLink from '@/components/common/ArtistLink.vue'
import AlbumLink from '@/components/common/AlbumLink.vue'
import type { MpdSong } from '@mpd-web/shared'

const ROW_HEIGHT = 48

const query = ref('')
const searchType = ref('any')
const results = ref<MpdSong[]>([])
const loading = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const { containerRef, totalHeight, visibleItems } = useVirtualList({
  items: results,
  itemHeight: () => ROW_HEIGHT,
})
useScrollRestore(containerRef)

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(doSearch, 300)
}

async function doSearch() {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    return
  }
  loading.value = true
  try {
    const params = new URLSearchParams({ q, type: searchType.value })
    const res = await fetch(`/api/search?${params}`)
    if (!res.ok) return
    const data = await res.json()
    results.value = data.results
  } finally {
    loading.value = false
  }
}

async function addSong(uri: string) {
  await sendCommand('add', { uri })
}

async function addAndPlay(uri: string) {
  const id = await sendCommand('addId', { uri }) as number
  await sendCommand('playId', { id })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Search bar -->
    <div class="px-4 py-3 border-b border-border">
      <div class="flex gap-2">
        <input
          v-model="query"
          type="text"
          placeholder="Search music..."
          class="flex-1 bg-surface-hover text-text placeholder:text-text-muted px-3 py-2 rounded-lg text-base outline-none focus:ring-1 focus:ring-primary"
          @input="onInput"
          @keydown.enter="doSearch"
        />
        <select
          v-model="searchType"
          class="bg-surface-hover text-text-muted text-base rounded-lg px-2 outline-none"
          @change="doSearch"
        >
          <option value="any">Any</option>
          <option value="title">Title</option>
          <option value="artist">Artist</option>
          <option value="album">Album</option>
          <option value="genre">Genre</option>
        </select>
      </div>
    </div>

    <!-- Results -->
    <div ref="containerRef" class="flex-1 overflow-y-auto">
      <div v-if="loading" class="flex items-center justify-center py-8 text-text-muted text-sm">
        Searching...
      </div>
      <div v-else-if="results.length === 0 && query.trim()" class="flex items-center justify-center py-8 text-text-muted text-sm">
        No results
      </div>
      <div v-else-if="results.length > 0" :style="{ height: totalHeight + 'px', position: 'relative', overflow: 'hidden' }">
        <div
          v-for="vItem in visibleItems"
          :key="vItem.item.file"
          class="absolute left-0 right-0 flex items-center gap-3 px-4 hover:bg-surface-alt transition-colors cursor-pointer group"
          :style="{ top: vItem.offsetTop + 'px', height: vItem.height + 'px' }"
          @click="addAndPlay(vItem.item.file)"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm truncate">{{ vItem.item.Title || vItem.item.file }}</p>
            <p class="text-xs text-text-muted truncate">
              <ArtistLink v-if="vItem.item.Artist" :name="vItem.item.Artist" /><span v-else>Unknown</span><template v-if="vItem.item.Album"> &middot; <AlbumLink :album="vItem.item.Album" :artist="vItem.item.AlbumArtist || vItem.item.Artist || ''" /></template>
            </p>
          </div>
          <span class="text-xs text-text-muted shrink-0">{{ formatDuration(vItem.item.duration || vItem.item.Time) }}</span>
          <button
            class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="addSong(vItem.item.file)"
            title="Add to queue"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
