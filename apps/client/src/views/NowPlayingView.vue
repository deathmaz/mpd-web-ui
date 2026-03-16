<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useElapsedTime, seekTo } from '@/composables/useElapsedTime'
import { useAudioSource } from '@/composables/useAudioSource'
import { sendCommand } from '@/composables/useWebSocket'
import { formatDuration } from '@/utils/format'
import SnapcastDialog from '@/components/player/SnapcastDialog.vue'
import AlbumArt from '@/components/common/AlbumArt.vue'

const router = useRouter()
const player = usePlayerStore()
const { currentTime } = useElapsedTime()
const { stream, snapcast, startMpdStream, startSnapcast } = useAudioSource()

const showSnapcastDialog = ref(false)

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
  const time = ratio * player.duration
  seekTo(time)
  await sendCommand('seekCur', { time })
}

let volumeTimer: ReturnType<typeof setTimeout> | null = null
let pendingVolume: number | null = null
let lastSentVolume: number | null = null

function setVolume(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value)
  if (value === lastSentVolume) return
  pendingVolume = value
  if (!volumeTimer) {
    lastSentVolume = value
    pendingVolume = null
    void sendCommand('setVolume', { volume: value })
    volumeTimer = setTimeout(() => {
      volumeTimer = null
      if (pendingVolume !== null && pendingVolume !== lastSentVolume) {
        lastSentVolume = pendingVolume
        void sendCommand('setVolume', { volume: pendingVolume })
        pendingVolume = null
      }
    }, 50)
  }
}

function handleListenToggle() {
  if (stream.isPlaying.value) {
    stream.stop()
  } else {
    startMpdStream()
  }
}

let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressed = false

function handleSnapcastToggle() {
  if (snapcast.connected) {
    snapcast.disconnect()
  } else if (snapcast.configured) {
    startSnapcast()
  } else {
    showSnapcastDialog.value = true
  }
}

function onPointerDown() {
  if (!snapcast.configured) return
  longPressed = false
  longPressTimer = setTimeout(() => {
    longPressed = true
    showSnapcastDialog.value = true
  }, 500)
}

function onPointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onPointerClick() {
  if (longPressed) {
    longPressed = false
    return
  }
  handleSnapcastToggle()
}

onBeforeUnmount(() => {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  if (volumeTimer) {
    clearTimeout(volumeTimer)
    volumeTimer = null
  }
})
</script>

<template>
  <div class="flex flex-col h-full px-6 py-4">
    <!-- Settings -->
    <div class="flex justify-end -mb-2">
      <button
        class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text transition-colors"
        @click="router.push('/settings')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992.014.38.16.748.43.99l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.002c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>
    </div>

    <!-- Album art -->
    <div class="flex-1 flex items-center justify-center min-h-0 py-4">
      <div class="w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-surface-alt shadow-2xl">
        <AlbumArt :src="artUrl" :key="artUrl" />
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
      <button class="w-14 h-14 flex items-center justify-center bg-primary hover:bg-primary-hover rounded-full text-surface transition-colors" @click="togglePlay">
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

    <!-- Playback modes -->
    <div class="flex items-center justify-center gap-2 mb-2">
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.repeat ? 'bg-primary text-surface' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setRepeat', { state: !player.repeat })"
      >Repeat</button>
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.random ? 'bg-primary text-surface' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setRandom', { state: !player.random })"
      >Random</button>
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.single ? 'bg-primary text-surface' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setSingle', { state: !player.single })"
      >Single</button>
      <button
        class="px-3 py-1.5 text-xs rounded-full transition-colors"
        :class="player.consume ? 'bg-primary text-surface' : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="sendCommand('setConsume', { state: !player.consume })"
      >Consume</button>
    </div>

    <!-- Audio source toggles -->
    <div class="flex justify-center gap-2 pb-2">
      <button
        class="flex items-center gap-2 px-4 py-2 text-sm rounded-full transition-colors"
        :class="stream.isPlaying.value
          ? 'bg-primary text-surface'
          : 'bg-surface-hover text-text-muted hover:text-text'"
        @click="handleListenToggle"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        {{ stream.isLoading.value ? 'Connecting...' : stream.isPlaying.value ? 'Listening' : 'Listen' }}
      </button>
      <button
        class="flex items-center gap-2 px-4 py-2 text-sm rounded-full transition-colors"
        :class="snapcast.connected
          ? 'bg-primary text-surface'
          : 'bg-surface-hover text-text-muted hover:text-text'"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        @pointercancel="onPointerUp"
        @contextmenu.prevent
        @click="onPointerClick"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
        </svg>
        {{ snapcast.connectionState === 'connecting' ? 'Connecting...' : 'Snapcast' }}
      </button>
    </div>

    <!-- Snapcast dialog -->
    <SnapcastDialog v-if="showSnapcastDialog" @close="showSnapcastDialog = false" @connect="startSnapcast" />
  </div>
</template>
