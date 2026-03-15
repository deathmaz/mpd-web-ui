<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useElapsedTime } from '@/composables/useElapsedTime'
import { sendCommand } from '@/composables/useWebSocket'
import AlbumArt from '@/components/common/AlbumArt.vue'

const router = useRouter()
const player = usePlayerStore()
const { currentTime } = useElapsedTime()

const progress = computed(() => {
  if (!player.duration) return 0
  return Math.min((currentTime.value / player.duration) * 100, 100)
})

const title = computed(() => player.currentSong?.Title || 'Not playing')
const artist = computed(() => player.currentSong?.Artist || '')

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
        <p class="text-xs text-text-muted truncate">{{ artist }}</p>
      </div>

      <!-- Play/Pause button -->
      <button
        class="w-10 h-10 flex items-center justify-center text-text hover:text-primary transition-colors"
        @click.stop="togglePlay"
      >
        <svg v-if="player.playState === 'play'" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        </svg>
        <svg v-else class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </div>
  </div>
</template>
