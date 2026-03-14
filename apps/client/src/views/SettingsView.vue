<script setup lang="ts">
import { ref } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useWebSocket, sendCommand } from '@/composables/useWebSocket'
import { useAudioSource } from '@/composables/useAudioSource'
import { useSnapcastStore } from '@/stores/snapcast'

const player = usePlayerStore()
const { connected } = useWebSocket()
const { stream } = useAudioSource()
const snapcast = useSnapcastStore()

const snapcastUrl = ref(snapcast.serverUrl)

async function toggleOutput(id: number) {
  await sendCommand('toggleOutput', { id })
}

function saveSnapcastUrl() {
  snapcast.saveUrl(snapcastUrl.value)
}

function handleSnapcastToggle() {
  if (snapcast.connected) {
    snapcast.disconnect()
  } else {
    snapcast.saveUrl(snapcastUrl.value)
    snapcast.connect()
  }
}

async function setSnapcastVolume(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value)
  await snapcast.setVolume(value)
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

      <!-- Snapcast -->
      <section>
        <h2 class="text-sm font-medium text-text-muted mb-2">Snapcast</h2>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <input
              v-model="snapcastUrl"
              type="text"
              placeholder="192.168.1.50:1780"
              class="flex-1 px-3 py-2 bg-surface-alt rounded-lg text-sm text-text border border-border focus:border-primary focus:outline-none"
              @blur="saveSnapcastUrl"
              @keydown.enter="saveSnapcastUrl"
            />
            <button
              class="px-4 py-2 text-sm rounded-lg transition-colors"
              :class="snapcast.connected
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-text-muted hover:text-text'"
              :disabled="!snapcastUrl.trim() && !snapcast.connected"
              @click="handleSnapcastToggle"
            >
              {{ snapcast.connected ? 'Disconnect' : snapcast.connectionState === 'connecting' ? 'Connecting...' : 'Connect' }}
            </button>
          </div>

          <!-- Connection status -->
          <div class="flex items-center gap-2">
            <div
              class="w-2 h-2 rounded-full"
              :class="{
                'bg-green-400': snapcast.connected,
                'bg-yellow-400': snapcast.connectionState === 'connecting',
                'bg-gray-400': snapcast.connectionState === 'disconnected',
              }"
            />
            <span class="text-sm">
              {{ snapcast.connected ? 'Connected' : snapcast.connectionState === 'connecting' ? 'Connecting...' : 'Disconnected' }}
            </span>
            <span v-if="snapcast.codec" class="text-xs text-text-muted ml-2">{{ snapcast.codec.toUpperCase() }}</span>
          </div>

          <span v-if="snapcast.error" class="text-xs text-red-400">{{ snapcast.error }}</span>

          <!-- Snapcast volume (only when connected) -->
          <div v-if="snapcast.connected" class="flex items-center gap-3">
            <span class="text-xs text-text-muted shrink-0">Volume</span>
            <input
              type="range"
              min="0"
              max="100"
              :value="snapcast.volume"
              class="flex-1 h-1 accent-primary bg-surface-hover rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
              @input="setSnapcastVolume"
            />
            <button
              class="text-xs px-2 py-1 rounded transition-colors"
              :class="snapcast.muted ? 'text-red-400' : 'text-text-muted hover:text-text'"
              @click="snapcast.toggleMute()"
            >
              {{ snapcast.muted ? 'Muted' : 'Mute' }}
            </button>
          </div>
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
