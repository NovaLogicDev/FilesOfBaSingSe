import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RateCard } from '../types/cost'
import { DownloadStrategy } from '../types/stream'

export interface PersistentPreferences {
  savedProjectId: string
  savedBucketName: string
  recentBuckets: string[]
  theme: 'dark' | 'light'
  customPricing: Partial<RateCard>
  isFreeTrialAccount: boolean
  hasCompletedOnboarding: boolean
  lastAuthUserEmail: string | null
  lastAuthUserName: string | null
  lastAuthTimestamp: number | null
  preferredDownloadStrategy: DownloadStrategy | null
  localDestinationPath: string

  setSavedProjectId: (projectId: string) => void
  setSavedBucketName: (bucketName: string) => void
  addRecentBucket: (bucketName: string) => void
  setTheme: (theme: 'dark' | 'light') => void
  setCustomPricing: (pricing: Partial<RateCard>) => void
  setFreeTrialAccount: (isFreeTrial: boolean) => void
  setHasCompletedOnboarding: (completed: boolean) => void
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
      lastAuthUserEmail: null,
      lastAuthUserName: null,
      lastAuthTimestamp: null,
      preferredDownloadStrategy: null,
      localDestinationPath: '~/Downloads',

      setSavedProjectId: (projectId) =>
        set({ savedProjectId: projectId.trim() }),

      setSavedBucketName: (bucketName) => {
        const clean = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim()
        set({ savedBucketName: `gs://${clean}` })
      },

      addRecentBucket: (bucketName) =>
        set((state) => {
          const clean = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim()
          if (!clean) return state
          const filtered = state.recentBuckets.filter((b) => b !== clean)
          return { recentBuckets: [clean, ...filtered].slice(0, 5) }
        }),

      setTheme: (theme) => set({ theme }),

      setCustomPricing: (pricing) =>
        set((state) => ({ customPricing: { ...state.customPricing, ...pricing } })),

      setFreeTrialAccount: (isFreeTrial) =>
        set({ isFreeTrialAccount: isFreeTrial }),

      setHasCompletedOnboarding: (completed) =>
        set({
          hasCompletedOnboarding: completed,
          lastAuthTimestamp: completed ? Date.now() : null,
        }),

      setLastAuthUserEmail: (email) => set({ lastAuthUserEmail: email }),

      setLastAuthUserName: (name) => set({ lastAuthUserName: name }),

      setPreferredDownloadStrategy: (strategy) =>
        set({ preferredDownloadStrategy: strategy }),

      setLocalDestinationPath: (path) =>
        set({ localDestinationPath: path.trim() || '~/Downloads' }),

      resetPreferences: () =>
        set({
          savedProjectId: '',
          savedBucketName: '',
          recentBuckets: [],
          theme: 'dark',
          customPricing: {},
          isFreeTrialAccount: false,
          hasCompletedOnboarding: false,
          lastAuthUserEmail: null,
          lastAuthUserName: null,
          lastAuthTimestamp: null,
          preferredDownloadStrategy: null,
          localDestinationPath: '~/Downloads',
        }),
    }),
    {
      name: 'basingse-media-client-prefs',
    },
  ),
)

