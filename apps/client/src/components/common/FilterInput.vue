<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const local = ref(props.modelValue)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.modelValue, (v) => {
  local.value = v
})

function onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  local.value = value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', value)
  }, 150)
}

function clear() {
  local.value = ''
  if (debounceTimer) clearTimeout(debounceTimer)
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="px-4 py-2 border-b border-border">
    <div class="relative">
      <input
        :value="local"
        type="text"
        :placeholder="placeholder || 'Filter...'"
        class="w-full bg-surface-hover text-text placeholder:text-text-muted px-3 py-1.5 pr-8 rounded-lg text-base outline-none focus:ring-1 focus:ring-primary"
        @input="onInput"
      />
      <button
        v-if="local"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
        @click="clear"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>
