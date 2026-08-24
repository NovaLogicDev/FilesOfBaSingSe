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

export const TAB_SESSION_STORAGE_KEY = 'basingse-tab-session'

export interface PersistedTabSession {
  oauthToken: string
  userEmail: string
  userName: string
  userAvatar?: string
  tokenExpiresAt: number
  grantedScopes: string[]
}

function loadInitialTabSession(): Partial<VolatileRuntimeSession> {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return {}
  }
  try {
    const raw = window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed: PersistedTabSession = JSON.parse(raw)
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
      // Expired token in sessionStorage: purge it
      window.sessionStorage.removeItem(TAB_SESSION_STORAGE_KEY)
    }
  } catch {
    // Ignore parse error
  }
  return {}
}

function saveTabSession(data: PersistedTabSession): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

function clearTabSession(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.removeItem(TAB_SESSION_STORAGE_KEY)
  } catch {}
}

const initialSession = loadInitialTabSession()

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
    saveTabSession({
      oauthToken: token,
      userEmail: email,
      userName: name,
      userAvatar: avatar,
      tokenExpiresAt,
      grantedScopes: scopes,
    })
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
    clearTabSession()
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
