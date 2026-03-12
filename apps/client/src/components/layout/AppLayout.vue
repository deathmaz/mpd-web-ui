<script setup lang="ts">
import { useRoute } from 'vue-router'
import MiniPlayer from './MiniPlayer.vue'
import BottomNav from './BottomNav.vue'

const route = useRoute()
</script>

<template>
  <div class="flex flex-col h-full">
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
