import { create } from 'zustand'
import { DownloadProgressTelemetry } from '../types/stream'

export interface VolatileRuntimeSession {
  // Authentication & OAuth 2.0 Credentials (VOLATILE RAM ONLY)
  oauthToken: string | null
  userEmail: string | null
  userName: string | null
  userAvatar: string | null
  tokenExpiresAt: number | null

  // Active Download & Telemetry (VOLATILE RAM ONLY)
  activeDownload: DownloadProgressTelemetry | null
  activeAbortController: AbortController | null
  isDownloadMinimized: boolean

  // Sandbox Mode
  isDemoMode: boolean

  // Methods
  setAuthSession: (
    token: string,
    email: string,
    name?: string,
    avatar?: string,
    expiresInSeconds?: number,
  ) => void
  clearAuthSession: () => void
  setDownloadProgress: (progress: DownloadProgressTelemetry | null) => void
  setActiveAbortController: (controller: AbortController | null) => void
  setDownloadMinimized: (minimized: boolean) => void
  abortActiveDownload: () => void
  setDemoMode: (isDemo: boolean) => void
}

export const useRuntimeStore = create<VolatileRuntimeSession>((set, get) => ({
  oauthToken: null,
  userEmail: null,
  userName: null,
  userAvatar: null,
  tokenExpiresAt: null,

  activeDownload: null,
  activeAbortController: null,
  isDownloadMinimized: false,
  isDemoMode: true, // Default to demo sandbox mode for immediate interactivity

  setAuthSession: (
    token,
    email,
    name = 'Media Client',
    avatar = undefined,
    expiresInSeconds = 3600,
  ) => {
    set({
      oauthToken: token,
      userEmail: email,
      userName: name,
      userAvatar: avatar,
      tokenExpiresAt: Date.now() + expiresInSeconds * 1000,
    })
  },

  clearAuthSession: () => {
    const { activeAbortController } = get()
    if (activeAbortController) {
      try {
        activeAbortController.abort()
      } catch (_) {}
    }
    set({
      oauthToken: null,
      userEmail: null,
      userName: null,
      userAvatar: null,
      tokenExpiresAt: null,
      activeDownload: null,
      activeAbortController: null,
    })
  },

  setDownloadProgress: (progress) => {
    set({ activeDownload: progress })
  },

  setActiveAbortController: (controller) => {
    set({ activeAbortController: controller })
  },

  setDownloadMinimized: (minimized) => {
    set({ isDownloadMinimized: minimized })
  },

  abortActiveDownload: () => {
    const { activeAbortController, activeDownload } = get()
    if (activeAbortController) {
      try {
        activeAbortController.abort()
      } catch (_) {}
    }
    if (activeDownload) {
      set({
        activeDownload: {
          ...activeDownload,
          status: 'cancelled',
          speedBytesPerSec: 0,
          formattedSpeed: '0.0 MB/s',
        },
        activeAbortController: null,
      })
    }
  },

  setDemoMode: (isDemo) => {
    set({ isDemoMode: isDemo })
  },
}))
