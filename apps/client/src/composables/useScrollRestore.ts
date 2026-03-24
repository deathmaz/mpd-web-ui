import { watch, nextTick, type Ref } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'

const MAX_ENTRIES = 200
const savedPositions = new Map<string, number>()

function save(key: string, el: HTMLElement | null) {
  if (!el) return
  savedPositions.set(key, el.scrollTop)
  // Evict oldest entries if over limit
  if (savedPositions.size > MAX_ENTRIES) {
    const first = savedPositions.keys().next().value!
    savedPositions.delete(first)
  }
}

function restore(key: string, containerRef: Ref<HTMLElement | null>) {
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = containerRef.value
      if (!el) return
      el.scrollTop = savedPositions.get(key) ?? 0
    })
  })
}

export function useScrollRestore(containerRef: Ref<HTMLElement | null>, key?: string) {
  const route = useRoute()
  const getKey = () => key || route.fullPath
  let hasFullPathWatcher = false

  // Restore when container is first attached
  watch(containerRef, (el) => {
    if (el && !hasFullPathWatcher) restore(getKey(), containerRef)
  })

  // Handle within-route navigation (same route name, different params/query)
  if (!key) {
    hasFullPathWatcher = true
    watch(() => route.fullPath, (newPath, oldPath) => {
      if (oldPath) save(oldPath, containerRef.value)
      restore(newPath, containerRef)
    })
  }

  // Save before leaving the route entirely
  onBeforeRouteLeave(() => {
    save(getKey(), containerRef.value)
  })
}
