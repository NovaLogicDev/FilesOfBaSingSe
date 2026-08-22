import { useState, useEffect, useCallback } from 'react'
import { ObservabilityService } from '../services/observability'

export interface NetworkStatus {
  isOnline: boolean
  wasOffline: boolean
  lastChangedAt: number
  reconnect: () => void
}

/**
 * Hook for Network Resiliency & Reconnection Monitor (AUX-05)
 * Detects online/offline browser state and allows triggering retry hooks.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  })
  const [wasOffline, setWasOffline] = useState<boolean>(false)
  const [lastChangedAt, setLastChangedAt] = useState<number>(Date.now())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      setIsOnline(true)
      setLastChangedAt(Date.now())
      ObservabilityService.info('NETWORK', 'Network connection restored.')
    }

    const handleOffline = () => {
      setIsOnline(false)
      setWasOffline(true)
      setLastChangedAt(Date.now())
      ObservabilityService.warn('NETWORK', 'Network connection lost. Offline state detected.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const reconnect = useCallback(() => {
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine)
      setLastChangedAt(Date.now())
    }
  }, [])

  return {
    isOnline,
    wasOffline,
    lastChangedAt,
    reconnect,
  }
}
