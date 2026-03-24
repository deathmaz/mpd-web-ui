<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = defineProps<{ album: string; artist: string }>()
const router = useRouter()

function goToAlbum() {
  router.push({ name: 'album-detail', params: { artist: props.artist, album: props.album } })
}
</script>

<template>
  <span class="hover:text-text cursor-pointer transition-colors" @click.stop="goToAlbum"><slot>{{ album }}</slot></span>
</template>
