<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useWebSocket } from '@/composables/useWebSocket'
import { useAudioSource } from '@/composables/useAudioSource'
import MiniPlayer from './MiniPlayer.vue'
import BottomNav from './BottomNav.vue'

const route = useRoute()
const { connected, reconnect } = useWebSocket()
const { snapcast, startSnapcast } = useAudioSource()

// Delay showing disconnect banner to avoid flashing on quick reconnects
const showDisconnected = ref(false)
let disconnectTimer: ReturnType<typeof setTimeout> | null = null

watch(connected, (isConnected) => {
  if (isConnected) {
    if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null }
    showDisconnected.value = false
  } else {
    disconnectTimer = setTimeout(() => { showDisconnected.value = true }, 1500)
  }
})

onBeforeUnmount(() => {
  if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div v-if="showDisconnected" class="flex items-center justify-between px-4 py-2 bg-red-900/80 text-red-100 text-sm shrink-0">
      <span>Disconnected from server</span>
      <button class="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-medium transition-colors" @click="reconnect()">
        Reconnect
      </button>
    </div>
    <div v-if="snapcast.configured && snapcast.error" class="flex items-center justify-between px-4 py-2 bg-amber-900/80 text-amber-100 text-sm shrink-0">
      <span>Snapcast: {{ snapcast.error }}</span>
      <button class="px-3 py-1 bg-amber-700 hover:bg-amber-600 rounded text-xs font-medium transition-colors" @click="startSnapcast()">
        Reconnect
      </button>
    </div>
    <main class="flex-1 overflow-y-auto">
      <router-view />
    </main>
    <MiniPlayer
      v-if="route.name !== 'now-playing'"
      class="shrink-0"
    />
    <BottomNav class="shrink-0" />
  </div>
</template>
