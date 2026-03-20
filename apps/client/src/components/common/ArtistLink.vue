<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = defineProps<{ name: string }>()
const router = useRouter()

function goToArtist() {
  router.push({ name: 'artist-detail', params: { name: props.name } })
}
</script>

<template>
  <span class="hover:text-text cursor-pointer transition-colors" @click.stop="goToArtist">{{ name }}</span>
</template>
