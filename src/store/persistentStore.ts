import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RateCard } from '../types/cost'

export interface PersistentPreferences {
  savedProjectId: string
  savedBucketName: string
  recentBuckets: string[]
  theme: 'dark' | 'light'
  customPricing: Partial<RateCard>
  isFreeTrialAccount: boolean

  setSavedProjectId: (projectId: string) => void
  setSavedBucketName: (bucketName: string) => void
  addRecentBucket: (bucketName: string) => void
  setTheme: (theme: 'dark' | 'light') => void
  setCustomPricing: (pricing: Partial<RateCard>) => void
  setFreeTrialAccount: (isFreeTrial: boolean) => void
  resetPreferences: () => void
}

export const usePersistentStore = create<PersistentPreferences>()(
  persist(
    (set) => ({
      savedProjectId: 'demo-client-media-2026',
      savedBucketName: 'gs://partner-raw-master-archives-2026',
      recentBuckets: [
        'partner-raw-master-archives-2026',
        'avatar-fire-nation-stems-2026',
        'ba-sing-se-vfx-vault',
      ],
      theme: 'dark',
      customPricing: {},
      isFreeTrialAccount: true,

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

      resetPreferences: () =>
        set({
          savedProjectId: '',
          savedBucketName: '',
          recentBuckets: [],
          theme: 'dark',
          customPricing: {},
          isFreeTrialAccount: false,
        }),
    }),
    {
      name: 'basingse-media-client-prefs',
    },
  ),
)
