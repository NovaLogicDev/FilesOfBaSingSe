import { create } from 'zustand'
import { DownloadProgressTelemetry } from '../types/stream'

export interface VolatileRuntimeSession {
  // Authentication & OAuth 2.0 Credentials (VOLATILE RAM ONLY)
  oauthToken: string | null
  userEmail: string | null
  userName: string | null
  userAvatar: string | null
  tokenExpiresAt: number | null
  grantedScopes: string[]

  // Active Download & Telemetry (VOLATILE RAM ONLY)
  activeDownload: DownloadProgressTelemetry | null
  activeAbortController: AbortController | null
  isDownloadMinimized: boolean

  // Session Restoration & Continuity (VOLATILE RAM ONLY)
  isRestoringSession: boolean
  sessionRestorationError: string | null

  // Methods
  setAuth: (
    token: string,
    email: string,
    name?: string,
    avatar?: string,
    expiresInSeconds?: number,
    scopes?: string[],
  ) => void
  setAuthSession: (
    token: string,
    email: string,
    name?: string,
    avatar?: string,
    expiresInSeconds?: number,
    scopes?: string[],
  ) => void
  setGrantedScopes: (scopes: string[]) => void
  clearAuth: () => void
  clearAuthSession: () => void
  setIsRestoringSession: (restoring: boolean, error?: string | null) => void
  setDownloadProgress: (progress: DownloadProgressTelemetry | null) => void
  setActiveAbortController: (controller: AbortController | null) => void
  setDownloadMinimized: (minimized: boolean) => void
  abortActiveDownload: () => void
}

export const APP_SESSION_STORAGE_KEY = 'basingse-app-session'
export const TAB_SESSION_STORAGE_KEY = 'basingse-tab-session'
export const AUTH_CHANNEL_NAME = 'basingse-auth-channel'

export interface PersistedAppSession {
  oauthToken: string
  userEmail: string
  userName: string
  userAvatar?: string
  tokenExpiresAt: number
  grantedScopes: string[]
}

export type AuthChannelMessage =
  | { type: 'AUTH_UPDATED'; payload: PersistedAppSession }
  | { type: 'AUTH_CLEARED' }

function getAuthChannel(): BroadcastChannel | null {
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      return new BroadcastChannel(AUTH_CHANNEL_NAME)
    } catch {
      return null
    }
  }
  return null
}

const authChannel = getAuthChannel()

function loadInitialAppSession(): Partial<VolatileRuntimeSession> {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    // 1. Check origin-wide localStorage first
    let raw = window.localStorage?.getItem(APP_SESSION_STORAGE_KEY)

    // 2. Fallback to tab-scoped sessionStorage if present
    if (!raw && window.sessionStorage) {
      raw = window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY)
    }

    if (!raw) return {}
    const parsed: PersistedAppSession = JSON.parse(raw)

    // Validate that token is still unexpired
    if (parsed.oauthToken && parsed.tokenExpiresAt && parsed.tokenExpiresAt > Date.now()) {
      return {
        oauthToken: parsed.oauthToken,
        userEmail: parsed.userEmail || null,
        userName: parsed.userName || null,
        userAvatar: parsed.userAvatar || null,
        tokenExpiresAt: parsed.tokenExpiresAt,
        grantedScopes: parsed.grantedScopes || [],
      }
    } else {
      // Expired token in storage: purge it immediately
      window.localStorage?.removeItem(APP_SESSION_STORAGE_KEY)
      window.sessionStorage?.removeItem(TAB_SESSION_STORAGE_KEY)
    }
  } catch {
    // Ignore parse error
  }
  return {}
}

function saveAppSession(data: PersistedAppSession): void {
  if (typeof window === 'undefined') return
  try {
    const serialized = JSON.stringify(data)
    window.localStorage?.setItem(APP_SESSION_STORAGE_KEY, serialized)
    window.sessionStorage?.setItem(TAB_SESSION_STORAGE_KEY, serialized)
    authChannel?.postMessage({ type: 'AUTH_UPDATED', payload: data })
  } catch {}
}

function clearAppSession(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.removeItem(APP_SESSION_STORAGE_KEY)
    window.sessionStorage?.removeItem(TAB_SESSION_STORAGE_KEY)
    authChannel?.postMessage({ type: 'AUTH_CLEARED' })
  } catch {}
}

const initialSession = loadInitialAppSession()

export const useRuntimeStore = create<VolatileRuntimeSession>((set, get) => ({
  oauthToken: initialSession.oauthToken || null,
  userEmail: initialSession.userEmail || null,
  userName: initialSession.userName || null,
  userAvatar: initialSession.userAvatar || null,
  tokenExpiresAt: initialSession.tokenExpiresAt || null,
  grantedScopes: initialSession.grantedScopes || [],

  activeDownload: null,
  activeAbortController: null,
  isDownloadMinimized: false,
  isRestoringSession: false,
  sessionRestorationError: null,

  setAuth: (
    token,
    email,
    name = 'Google User',
    avatar = undefined,
    expiresInSeconds = 3600,
    scopes = [],
  ) => {
    const tokenExpiresAt = Date.now() + expiresInSeconds * 1000
    const sessionData: PersistedAppSession = {
      oauthToken: token,
      userEmail: email,
      userName: name,
      userAvatar: avatar,
      tokenExpiresAt,
      grantedScopes: scopes,
    }
    saveAppSession(sessionData)
    set({
      oauthToken: token,
      userEmail: email,
      userName: name,
      userAvatar: avatar,
      tokenExpiresAt,
      grantedScopes: scopes,
      isRestoringSession: false,
      sessionRestorationError: null,
    })
  },

  setAuthSession: (
    token,
    email,
    name = 'Google User',
    avatar = undefined,
    expiresInSeconds = 3600,
    scopes = [],
  ) => {
    get().setAuth(token, email, name, avatar, expiresInSeconds, scopes)
  },

  setGrantedScopes: (scopes) => {
    set({ grantedScopes: scopes })
  },

  clearAuth: () => {
    clearAppSession()
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
      grantedScopes: [],
      activeDownload: null,
      activeAbortController: null,
      isRestoringSession: false,
      sessionRestorationError: null,
    })
  },

  clearAuthSession: () => {
    get().clearAuth()
  },

  setIsRestoringSession: (restoring, error = null) => {
    set({
      isRestoringSession: restoring,
      sessionRestorationError: error,
    })
  },

  setDownloadProgress: (progress) => {
    const { oauthToken } = get()
    // Suppress downstream progress telemetry mutations if session has been cleared/purged
    if (!oauthToken && progress !== null) {
      return
    }
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
}))

// Cross-tab synchronization listener initialization
if (typeof window !== 'undefined') {
  if (authChannel) {
    authChannel.onmessage = (event: MessageEvent<AuthChannelMessage>) => {
      const data = event.data
      if (data?.type === 'AUTH_UPDATED' && data.payload) {
        const payload = data.payload
        if (payload.tokenExpiresAt > Date.now()) {
          useRuntimeStore.setState({
            oauthToken: payload.oauthToken,
            userEmail: payload.userEmail,
            userName: payload.userName,
            userAvatar: payload.userAvatar,
            tokenExpiresAt: payload.tokenExpiresAt,
            grantedScopes: payload.grantedScopes,
            isRestoringSession: false,
            sessionRestorationError: null,
          })
        }
      } else if (data?.type === 'AUTH_CLEARED') {
        const state = useRuntimeStore.getState()
        if (state.oauthToken) {
          state.clearAuth()
        }
      }
    }
  }

  // Cross-browser/storage event fallback listener
  window.addEventListener('storage', (event) => {
    if (event.key === APP_SESSION_STORAGE_KEY) {
      if (!event.newValue) {
        const state = useRuntimeStore.getState()
        if (state.oauthToken) {
          state.clearAuth()
        }
      } else {
        try {
          const payload: PersistedAppSession = JSON.parse(event.newValue)
          if (payload.oauthToken && payload.tokenExpiresAt > Date.now()) {
            useRuntimeStore.setState({
              oauthToken: payload.oauthToken,
              userEmail: payload.userEmail,
              userName: payload.userName,
              userAvatar: payload.userAvatar,
              tokenExpiresAt: payload.tokenExpiresAt,
              grantedScopes: payload.grantedScopes,
              isRestoringSession: false,
              sessionRestorationError: null,
            })
          }
        } catch {}
      }
    }
  })
}
