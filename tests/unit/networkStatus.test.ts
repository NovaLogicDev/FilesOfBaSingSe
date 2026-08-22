import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus'

describe('useNetworkStatus (AUX-05)', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with current navigator.onLine status', () => {
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(true)
    expect(result.current.wasOffline).toBe(false)
  })

  it('updates state when offline and online events fire', () => {
    const { result } = renderHook(() => useNetworkStatus())

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.isOnline).toBe(false)
    expect(result.current.wasOffline).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current.isOnline).toBe(true)
    expect(result.current.wasOffline).toBe(true)
  })

  it('allows manual reconnect check', () => {
    const { result } = renderHook(() => useNetworkStatus())

    act(() => {
      result.current.reconnect()
    })

    expect(result.current.isOnline).toBe(true)
  })
})
