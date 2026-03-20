<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useElapsedTime } from '@/composables/useElapsedTime'
import { sendCommand } from '@/composables/useWebSocket'
import { formatDuration } from '@/utils/format'
import AlbumArt from '@/components/common/AlbumArt.vue'
import ArtistLink from '@/components/common/ArtistLink.vue'
import AlbumLink from '@/components/common/AlbumLink.vue'

const router = useRouter()
const player = usePlayerStore()
const { currentTime } = useElapsedTime()

const progress = computed(() => {
  if (!player.duration) return 0
  return Math.min((currentTime.value / player.duration) * 100, 100)
})

const title = computed(() => player.currentSong?.Title || 'Not playing')
const albumLabel = computed(() => {
  const song = player.currentSong
  if (!song?.Album) return ''
  const year = song.Date?.slice(0, 4)
  return year ? `${song.Album} (${year})` : song.Album
})

async function togglePlay() {
  if (player.playState === 'play') {
    await sendCommand('pause', { state: true })
  } else {
    await sendCommand('play')
  }
}
</script>

<template>
  <div
    class="relative bg-surface-alt border-t border-border cursor-pointer"
    @click="router.push('/')"
  >
    <!-- Thin progress bar -->
    <div class="absolute top-0 left-0 h-0.5 bg-primary transition-all duration-300" :style="{ width: progress + '%' }" />

    <div class="flex items-center gap-3 px-4 py-2">
      <!-- Album art thumbnail -->
      <div class="w-10 h-10 rounded bg-surface-hover shrink-0 overflow-hidden">
        <AlbumArt :src="player.currentSong?.file ? `/api/art/${encodeURIComponent(player.currentSong.file)}` : null" />
      </div>

      <!-- Song info -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{{ title }}</p>
        <p class="text-xs text-text-muted truncate"><ArtistLink v-if="player.currentSong?.Artist" :name="player.currentSong.Artist" /><template v-if="player.currentSong?.Album"> &middot; <AlbumLink :album="player.currentSong.Album" :artist="player.currentSong.Artist || ''">{{ albumLabel }}</AlbumLink></template></p>
      </div>

      <!-- Timer -->
      <span v-if="player.duration" class="hidden md:inline text-xs text-text-muted shrink-0 tabular-nums">
        {{ formatDuration(currentTime) }} / {{ formatDuration(player.duration) }}
      </span>

      <!-- Prev button -->
      <button
        class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text transition-colors shrink-0"
        @click.stop="sendCommand('previous')"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      <!-- Play/Pause button -->
      <button
        class="w-8 h-8 flex items-center justify-center text-text hover:text-primary transition-colors shrink-0"
        @click.stop="togglePlay"
      >
        <svg v-if="player.playState === 'play'" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        </svg>
        <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>

      <!-- Next button -->
      <button
        class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text transition-colors shrink-0"
        @click.stop="sendCommand('next')"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>
    </div>
  </div>
</template>
