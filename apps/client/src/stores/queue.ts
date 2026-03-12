import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MpdSong } from '@mpd-web/shared'

export const useQueueStore = defineStore('queue', () => {
  const songs = ref<MpdSong[]>([])

  const totalDuration = computed(() =>
    songs.value.reduce((sum, s) => sum + (s.duration || s.Time || 0), 0),
  )

  function updateQueue(queue: MpdSong[]) {
    songs.value = queue
  }

  return { songs, totalDuration, updateQueue }
})
