import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RateCard } from '../types/cost'
import { DownloadStrategy } from '../types/stream'
import { ThemeEngine, ThemeMode } from '../engines/theme'

export interface PersistentPreferences {
  savedProjectId: string
  savedBucketName: string
  recentBuckets: string[]
  theme: ThemeMode
  customPricing: Partial<RateCard>
  isFreeTrialAccount: boolean
  hasCompletedOnboarding: boolean
  autoRestoreSessionOnReload: boolean
  lastAuthUserEmail: string | null
  lastAuthUserName: string | null
  lastAuthTimestamp: number | null
  preferredDownloadStrategy: DownloadStrategy | null
  localDestinationPath: string

  setSavedProjectId: (projectId: string) => void
  setSavedBucketName: (bucketName: string) => void
  addRecentBucket: (bucketName: string) => void
  setTheme: (theme: ThemeMode) => void
  setCustomPricing: (pricing: Partial<RateCard>) => void
  setFreeTrialAccount: (isFreeTrial: boolean) => void
  setHasCompletedOnboarding: (completed: boolean) => void
  setAutoRestoreSessionOnReload: (enabled: boolean) => void
  setLastAuthUserEmail: (email: string | null) => void
  setLastAuthUserName: (name: string | null) => void
  setPreferredDownloadStrategy: (strategy: DownloadStrategy | null) => void
  setLocalDestinationPath: (path: string) => void
  resetPreferences: () => void
}

export const usePersistentStore = create<PersistentPreferences>()(
  persist(
    (set) => ({
      savedProjectId: '',
      savedBucketName: '',
      recentBuckets: [],
      theme: 'dark',
      customPricing: {},
      isFreeTrialAccount: false,
      hasCompletedOnboarding: false,
      autoRestoreSessionOnReload: false,
      lastAuthUserEmail: null,
      lastAuthUserName: null,
      lastAuthTimestamp: null,
      preferredDownloadStrategy: null,
      localDestinationPath: '~/Downloads',

      setSavedProjectId: (projectId) =>
        set({ savedProjectId: projectId.trim() }),

      setSavedBucketName: (bucketName) => {
        const clean = (bucketName || '').replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim()
        set({ savedBucketName: clean ? `gs://${clean}` : '' })
      },

      addRecentBucket: (bucketName) =>
        set((state) => {
          const clean = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim()
          if (!clean) return state
          const filtered = state.recentBuckets.filter((b) => b !== clean)
          return { recentBuckets: [clean, ...filtered].slice(0, 5) }
        }),

      setTheme: (theme) => {
        ThemeEngine.applyTheme(theme)
        set({ theme })
      },

      setCustomPricing: (pricing) =>
        set((state) => ({ customPricing: { ...state.customPricing, ...pricing } })),

      setFreeTrialAccount: (isFreeTrial) =>
        set({ isFreeTrialAccount: isFreeTrial }),

      setHasCompletedOnboarding: (completed) =>
        set({
          hasCompletedOnboarding: completed,
          lastAuthTimestamp: completed ? Date.now() : null,
        }),

      setAutoRestoreSessionOnReload: (enabled) =>
        set({ autoRestoreSessionOnReload: enabled }),

      setLastAuthUserEmail: (email) => set({ lastAuthUserEmail: email }),

      setLastAuthUserName: (name) => set({ lastAuthUserName: name }),

      setPreferredDownloadStrategy: (strategy) =>
        set({ preferredDownloadStrategy: strategy }),

      setLocalDestinationPath: (path) =>
        set({ localDestinationPath: path.trim() || '~/Downloads' }),

      resetPreferences: () => {
        ThemeEngine.applyTheme('dark')
        set({
          savedProjectId: '',
          savedBucketName: '',
          recentBuckets: [],
          theme: 'dark',
          customPricing: {},
          isFreeTrialAccount: false,
          hasCompletedOnboarding: false,
          autoRestoreSessionOnReload: false,
          lastAuthUserEmail: null,
          lastAuthUserName: null,
          lastAuthTimestamp: null,
          preferredDownloadStrategy: null,
          localDestinationPath: '~/Downloads',
        })
      },
    }),
    {
      name: 'basingse-media-client-prefs',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          ThemeEngine.applyTheme(state.theme)
        }
      },
    },
  ),
)


