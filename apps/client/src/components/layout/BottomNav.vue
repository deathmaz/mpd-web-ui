<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { name: 'now-playing', path: '/', label: 'Playing', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
  { name: 'queue', path: '/queue', label: 'Queue', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  { name: 'library', path: '/library/folders', label: 'Library', icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z' },
  { name: 'search', path: '/search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { name: 'playlists', path: '/playlists', label: 'Lists', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
]

function isActive(tab: typeof tabs[number]): boolean {
  if (tab.name === 'library') {
    return route.path.startsWith('/library')
  }
  if (tab.name === 'playlists') {
    return route.path.startsWith('/playlists')
  }
  return route.name === tab.name
}
</script>

<template>
  <nav class="flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.path"
      class="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors"
      :class="isActive(tab) ? 'text-primary' : 'text-text-muted hover:text-text'"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" :d="tab.icon" />
      </svg>
      <span>{{ tab.label }}</span>
    </router-link>
  </nav>
</template>
