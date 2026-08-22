import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

export interface VirtualItem {
  index: number
  start: number
  top: number
  size: number
  height: number
  end: number
}

export interface UseVirtualizerOptions {
  count: number
  itemHeight?: number
  estimateSize?: (index: number) => number
  overscan?: number
  containerHeight?: number
  getScrollElement?: () => HTMLElement | null
}

export interface UseVirtualizerResult {
  virtualItems: VirtualItem[]
  totalHeight: number
  totalSize: number
  startIndex: number
  endIndex: number
  containerRef: React.RefObject<HTMLDivElement | null>
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => void
  scrollToOffset: (offset: number) => void
}

/**
 * Zero-dependency high-performance windowing hook.
 * Calculates visible item slice from scrollTop, viewport height, row height (default 48px),
 * and overscan buffer (default 6 rows), maintaining <= 30 active DOM rows for 10,000+ items.
 */
export function useVirtualizer({
  count,
  itemHeight = 48,
  estimateSize,
  overscan = 6,
  containerHeight = 576,
  getScrollElement,
}: UseVirtualizerOptions): UseVirtualizerResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [measuredHeight, setMeasuredHeight] = useState(0)

  const getItemHeight = useCallback(
    (index: number) => {
      if (estimateSize) return estimateSize(index)
      return itemHeight
    },
    [estimateSize, itemHeight],
  )

  const effectiveContainerHeight = useMemo(() => {
    if (measuredHeight > 0) return measuredHeight
    return containerHeight
  }, [measuredHeight, containerHeight])

  // Passive scroll & resize listener
  useEffect(() => {
    const element = getScrollElement?.() || containerRef.current
    if (!element) return

    const updateDimensions = () => {
      if (element.clientHeight > 0) {
        setMeasuredHeight(element.clientHeight)
      }
      setScrollTop(element.scrollTop)
    }

    updateDimensions()

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setScrollTop(element.scrollTop)
      })
    }

    element.addEventListener('scroll', handleScroll, { passive: true })

    // ResizeObserver if available
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.height > 0) {
            setMeasuredHeight(entry.contentRect.height)
          }
        }
      })
      resizeObserver.observe(element)
    }

    return () => {
      element.removeEventListener('scroll', handleScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (resizeObserver) resizeObserver.disconnect()
    }
  }, [getScrollElement])

  const totalHeight = useMemo(() => {
    if (count <= 0) return 0
    return count * itemHeight
  }, [count, itemHeight])

  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    if (count <= 0) {
      return { startIndex: 0, endIndex: 0, virtualItems: [] }
    }

    const startRow = Math.floor(scrollTop / itemHeight)
    const visibleRowCount = Math.ceil(effectiveContainerHeight / itemHeight)
    const endRow = startRow + visibleRowCount

    const start = Math.max(0, startRow - overscan)
    const end = Math.min(count, endRow + overscan)

    const items: VirtualItem[] = []
    for (let i = start; i < end; i++) {
      const startOffset = i * itemHeight
      const size = getItemHeight(i)
      items.push({
        index: i,
        start: startOffset,
        top: startOffset,
        size,
        height: size,
        end: startOffset + size,
      })
    }

    return {
      startIndex: start,
      endIndex: end,
      virtualItems: items,
    }
  }, [count, scrollTop, itemHeight, effectiveContainerHeight, overscan, getItemHeight])

  const scrollToOffset = useCallback(
    (offset: number) => {
      const element = getScrollElement?.() || containerRef.current
      const clamped = Math.max(0, Math.min(totalHeight - effectiveContainerHeight, offset))
      if (element) {
        element.scrollTop = clamped
      }
      setScrollTop(clamped)
    },
    [getScrollElement, totalHeight, effectiveContainerHeight],
  )

  const scrollToIndex = useCallback(
    (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => {
      const align = options?.align || 'auto'
      const itemTop = index * itemHeight
      const itemBottom = itemTop + itemHeight

      if (align === 'start') {
        scrollToOffset(itemTop)
      } else if (align === 'end') {
        scrollToOffset(itemBottom - effectiveContainerHeight)
      } else if (align === 'center') {
        scrollToOffset(itemTop - (effectiveContainerHeight - itemHeight) / 2)
      } else {
        // Auto: scroll only if outside current viewport
        if (itemTop < scrollTop) {
          scrollToOffset(itemTop)
        } else if (itemBottom > scrollTop + effectiveContainerHeight) {
          scrollToOffset(itemBottom - effectiveContainerHeight)
        }
      }
    },
    [itemHeight, effectiveContainerHeight, scrollTop, scrollToOffset],
  )

  return {
    virtualItems,
    totalHeight,
    totalSize: totalHeight,
    startIndex,
    endIndex,
    containerRef,
    scrollToIndex,
    scrollToOffset,
  }
}
