<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useWebSocket } from '@/composables/useWebSocket'
import MiniPlayer from './MiniPlayer.vue'
import BottomNav from './BottomNav.vue'

const route = useRoute()
const { connected, reconnect } = useWebSocket()
</script>

<template>
  <div class="flex flex-col h-full">
    <div v-if="!connected" class="flex items-center justify-between px-4 py-2 bg-red-900/80 text-red-100 text-sm shrink-0">
      <span>Disconnected from server</span>
      <button class="px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-xs font-medium transition-colors" @click="reconnect()">
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
