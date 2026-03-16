import { ref, computed, watch, onMounted, onBeforeUnmount, type Ref, type ComputedRef } from 'vue'

export interface VirtualItem<T> {
  item: T
  index: number
  offsetTop: number
  height: number
}

export interface VirtualListOptions<T> {
  items: Ref<T[]> | ComputedRef<T[]>
  itemHeight: (item: T) => number
  overscan?: number
}

const DEFAULT_OVERSCAN = 5

/** Binary search: find the first index where prefixSums[i] > target. */
export function findStartIndex(prefixSums: number[], scrollTop: number): number {
  let lo = 0
  let hi = prefixSums.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (prefixSums[mid + 1] <= scrollTop) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/** Build prefix sum array: prefixSums[i] = total height of items 0..i-1. */
export function buildPrefixSums<T>(items: T[], itemHeight: (item: T) => number): number[] {
  const sums = new Array<number>(items.length + 1)
  sums[0] = 0
  for (let i = 0; i < items.length; i++) {
    sums[i + 1] = sums[i] + itemHeight(items[i])
  }
  return sums
}

export function useVirtualList<T>(options: VirtualListOptions<T>) {
  const { items, itemHeight, overscan = DEFAULT_OVERSCAN } = options

  const containerRef = ref<HTMLElement | null>(null)
  const scrollTop = ref(0)
  const clientHeight = ref(0)

  const prefixSums = computed(() => buildPrefixSums(items.value, itemHeight))

  const totalHeight = computed(() => {
    const sums = prefixSums.value
    return sums[sums.length - 1] || 0
  })

  const visibleItems = computed<VirtualItem<T>[]>(() => {
    const sums = prefixSums.value
    const list = items.value
    if (list.length === 0) return []

    const top = scrollTop.value
    const bottom = top + clientHeight.value

    let startIdx = findStartIndex(sums, top)
    let endIdx = startIdx
    while (endIdx < list.length && sums[endIdx] < bottom) {
      endIdx++
    }

    // Apply overscan
    startIdx = Math.max(0, startIdx - overscan)
    endIdx = Math.min(list.length, endIdx + overscan)

    const result: VirtualItem<T>[] = []
    for (let i = startIdx; i < endIdx; i++) {
      result.push({
        item: list[i],
        index: i,
        offsetTop: sums[i],
        height: sums[i + 1] - sums[i],
      })
    }
    return result
  })

  function scrollToIndex(index: number, align: 'start' | 'center' = 'start'): void {
    const el = containerRef.value
    if (!el || index < 0 || index >= items.value.length) return

    const sums = prefixSums.value
    const itemTop = sums[index]
    const itemH = sums[index + 1] - sums[index]

    if (align === 'center') {
      el.scrollTop = itemTop - (el.clientHeight - itemH) / 2
    } else {
      el.scrollTop = itemTop
    }
  }

  function resetScroll(): void {
    scrollTop.value = 0
    if (containerRef.value) {
      containerRef.value.scrollTop = 0
      clientHeight.value = containerRef.value.clientHeight
    }
  }

  function onScroll() {
    const el = containerRef.value
    if (!el) return
    scrollTop.value = el.scrollTop
    clientHeight.value = el.clientHeight
  }

  // Attach/detach scroll listener when containerRef is set
  let currentEl: HTMLElement | null = null

  function attach(el: HTMLElement) {
    if (currentEl === el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    currentEl = el
    scrollTop.value = el.scrollTop
    clientHeight.value = el.clientHeight
  }

  function detach() {
    if (currentEl) {
      currentEl.removeEventListener('scroll', onScroll)
      currentEl = null
    }
  }

  watch(containerRef, (newEl, oldEl) => {
    if (oldEl) detach()
    if (newEl) attach(newEl)
  })

  onMounted(() => {
    if (containerRef.value) attach(containerRef.value)
  })

  onBeforeUnmount(() => {
    detach()
  })

  return {
    containerRef,
    scrollTop,
    prefixSums,
    totalHeight,
    visibleItems,
    scrollToIndex,
    resetScroll,
  }
}
