<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useElapsedTime } from '@/composables/useElapsedTime'
import { useStream } from '@/composables/useStream'
import { sendCommand } from '@/composables/useWebSocket'
import { formatDuration } from '@/utils/format'

const player = usePlayerStore()
const { currentTime } = useElapsedTime()
const stream = useStream()

const title = computed(() => player.currentSong?.Title || 'Not playing')
const artist = computed(() => player.currentSong?.Artist || '')
const album = computed(() => player.currentSong?.Album || '')
const artUrl = computed(() => {
  if (!player.currentSong?.file) return ''
  return `/api/art/${encodeURIComponent(player.currentSong.file)}`
})

const progress = computed(() => {
  if (!player.duration) return 0
  return Math.min((currentTime.value / player.duration) * 100, 100)
})

async function togglePlay() {
  if (player.playState === 'play') {
    await sendCommand('pause', { state: true })
  } else {
    await sendCommand('play')
  }
}

async function handleSeek(e: MouseEvent | TouchEvent) {
  if (!player.duration) return
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  await sendCommand('seekCur', { time: ratio * player.duration })
}

async function setVolume(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value)
  await sendCommand('setVolume', { volume: value })
}
</script>

<template>
  <div class="flex flex-col h-full px-6 py-4">
    <!-- Album art -->
    <div class="flex-1 flex items-center justify-center min-h-0 py-4">
      <div class="w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-surface-alt shadow-2xl">
        <img
          v-if="artUrl"
          :src="artUrl"
          :key="artUrl"
          class="w-full h-full object-cover"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-text-muted">
          <svg class="w-20 h-20" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Song info -->
    <div class="text-center mb-4">
      <h2 class="text-lg font-semibold truncate">{{ title }}</h2>
      <p class="text-sm text-text-muted truncate">{{ artist }}</p>
      <p class="text-xs text-text-muted truncate">{{ album }}</p>
    </div>

    <!-- Progress bar (seekable) -->
    <div class="mb-4">
      <div
        class="relative h-1.5 bg-surface-hover rounded-full cursor-pointer group"
        @click="handleSeek"
      >
        <div
          class="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-200"
          :style="{ width: progress + '%' }"
        />
        <div
          class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          :style="{ left: `calc(${progress}% - 6px)` }"
        />
      </div>
      <div class="flex justify-between text-xs text-text-muted mt-1">
        <span>{{ formatDuration(currentTime) }}</span>
        <span>{{ formatDuration(player.duration) }}</span>
      </div>
    </div>

    <!-- Playback controls -->
    <div class="flex items-center justify-center gap-6 mb-4">
      <button class="w-10 h-10 flex items-center justify-center text-text-muted hover:text-text" @click="sendCommand('previous')">
        <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>
      <button class="w-14 h-14 flex items-center justify-center bg-primary hover:bg-primary-hover rounded-full text-white transition-colors" @click="togglePlay">
        <svg v-if="player.playState === 'play'" class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        </svg>
        <svg v-else class="w-8 h-8 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
      <button class="w-10 h-10 flex items-center justify-center text-text-muted hover:text-text" @click="sendCommand('next')">
        <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>
    </div>

    <!-- Volume -->
    <div class="flex items-center gap-3 mb-3">
      <svg class="w-4 h-4 text-text-muted shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3z" />
      </svg>
      <input
        type="range"
        min="0"
        max="100"
        :value="player.volume"
        class="flex-1 h-1 accent-primary bg-surface-hover rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        @input="setVolume"
      />
      <svg class="w-4 h-4 text-text-muted shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
    </div>

    <!-- Playback modes + stream toggle -->
    <div class="flex items-center justify-center gap-2 mb-2">
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.repeat ? 'bg-primary text-white' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setRepeat', { state: !player.repeat })"
      >Repeat</button>
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.random ? 'bg-primary text-white' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setRandom', { state: !player.random })"
      >Random</button>
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.single ? 'bg-primary text-white' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setSingle', { state: !player.single })"
      >Single</button>
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.consume ? 'bg-primary text-white' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setConsume', { state: !player.consume })"
      >Consume</button>
    </div>

    <!-- Stream toggle -->
    <div class="flex justify-center pb-2">
      <button
        class="flex items-center gap-2 px-4 py-2 text-sm rounded-full transition-colors"
        :class="stream.isPlaying.value
          ? 'bg-primary text-white'
          : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="stream.toggle()"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        {{ stream.isLoading.value ? 'Connecting...' : stream.isPlaying.value ? 'Listening' : 'Listen' }}
      </button>
    </div>
  </div>
</template>
