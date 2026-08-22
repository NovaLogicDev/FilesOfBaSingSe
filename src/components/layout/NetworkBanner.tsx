import React from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'

export interface NetworkBannerProps {
  onRetry?: () => void
}

export const NetworkBanner: React.FC<NetworkBannerProps> = ({ onRetry }) => {
  const { isOnline, reconnect } = useNetworkStatus()

  if (isOnline) {
    return null
  }

  const handleRetry = () => {
    reconnect()
    onRetry?.()
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-amber-950/90 border-b border-amber-600/50 text-amber-200 px-4 py-2.5 text-xs flex items-center justify-between shadow-lg sticky top-0 z-40 backdrop-blur-md animate-in slide-in-from-top duration-200"
    >
      <div className="flex items-center space-x-2.5">
        <WifiOff className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
        <span className="font-medium">
          Network connection lost. Active downloads and GCS queries are paused.
        </span>
      </div>

      <button
        type="button"
        onClick={handleRetry}
        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
        aria-label="Retry connection"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Check Connection</span>
      </button>
    </div>
  )
}
