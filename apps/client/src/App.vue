<script setup lang="ts">
import { useWebSocket } from '@/composables/useWebSocket'
import AppLayout from '@/components/layout/AppLayout.vue'

useWebSocket()
</script>

<template>
  <AppLayout />
</template>
