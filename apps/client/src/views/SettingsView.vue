<script setup lang="ts">
import { usePlayerStore } from '@/stores/player'
import { useWebSocket, sendCommand } from '@/composables/useWebSocket'
import { useStream } from '@/composables/useStream'

const player = usePlayerStore()
const { connected } = useWebSocket()
const stream = useStream()

async function toggleOutput(id: number) {
  await sendCommand('toggleOutput', { id })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-4 py-3 border-b border-border">
      <h1 class="text-lg font-semibold">Settings</h1>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <!-- Connection status -->
      <section>
        <h2 class="text-sm font-medium text-text-muted mb-2">Connection</h2>
        <div class="flex items-center gap-2">
          <div
            class="w-2 h-2 rounded-full"
            :class="connected ? 'bg-green-400' : 'bg-red-400'"
          />
          <span class="text-sm">{{ connected ? 'Connected to MPD' : 'Disconnected' }}</span>
        </div>
      </section>

      <!-- Stream status -->
      <section>
        <h2 class="text-sm font-medium text-text-muted mb-2">Audio Stream</h2>
        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 text-sm rounded-lg transition-colors"
            :class="stream.isPlaying.value
              ? 'bg-primary text-white'
              : 'bg-surface-hover text-text-muted hover:text-text'"
            @click="stream.toggle()"
          >
            {{ stream.isPlaying.value ? 'Stop listening' : 'Start listening' }}
          </button>
          <span v-if="stream.streamError.value" class="text-xs text-red-400">{{ stream.streamError.value }}</span>
          <span v-else-if="stream.isLoading.value" class="text-xs text-text-muted">Buffering...</span>
          <span v-else-if="stream.isPlaying.value" class="text-xs text-green-400">Playing</span>
        </div>
      </section>

      <!-- Audio info -->
      <section v-if="player.audioFormat">
        <h2 class="text-sm font-medium text-text-muted mb-2">Audio Info</h2>
        <div class="text-sm space-y-1">
          <p>Format: {{ player.audioFormat }}</p>
          <p v-if="player.bitrate">Bitrate: {{ player.bitrate }} kbps</p>
        </div>
      </section>

      <!-- Outputs -->
      <section>
        <h2 class="text-sm font-medium text-text-muted mb-2">Outputs</h2>
        <div class="space-y-2">
          <div
            v-for="output in player.outputs"
            :key="output.outputid"
            class="flex items-center justify-between py-2"
          >
            <div>
              <p class="text-sm">{{ output.outputname }}</p>
              <p class="text-xs text-text-muted">{{ output.plugin }}</p>
            </div>
            <button
              class="w-10 h-6 rounded-full relative transition-colors"
              :class="output.outputenabled ? 'bg-primary' : 'bg-surface-hover'"
              @click="toggleOutput(output.outputid)"
            >
              <div
                class="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all"
                :class="output.outputenabled ? 'left-[18px]' : 'left-0.5'"
              />
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
