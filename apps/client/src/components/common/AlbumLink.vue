<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = defineProps<{ album: string; artist: string }>()
const router = useRouter()

function goToAlbum() {
  router.push({ name: 'album-detail', query: { album: props.album, artist: props.artist } })
}
</script>

<template>
  <span class="hover:text-text cursor-pointer transition-colors" @click.stop="goToAlbum"><slot>{{ album }}</slot></span>
</template>
