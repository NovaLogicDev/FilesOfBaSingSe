import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionLifecycleEngine } from '../../src/engines/sessionLifecycleEngine'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { gisAuthService } from '../../src/services/gisAuthService'

describe('SessionLifecycleEngine (MOD-10 & Engine 8)', () => {
  beforeEach(() => {
    usePersistentStore.getState().resetPreferences()
    useRuntimeStore.getState().clearAuth()
    vi.restoreAllMocks()
  })

  describe('shouldBypassOnboarding evaluation', () => {
    it('returns true when hasCompletedOnboarding is true and project/bucket are valid', () => {
      const eligible = SessionLifecycleEngine.shouldBypassOnboarding(
        true,
        'client-prod-media-2026',
        'gs://test-studio-vault-2026',
      )
      expect(eligible).toBe(true)
    })

    it('returns false if hasCompletedOnboarding is false even if project and bucket exist', () => {
      const eligible = SessionLifecycleEngine.shouldBypassOnboarding(
        false,
        'client-prod-media-2026',
        'gs://test-studio-vault-2026',
      )
      expect(eligible).toBe(false)
    })

    it('returns false if savedProjectId is missing or less than 6 characters', () => {
      expect(SessionLifecycleEngine.shouldBypassOnboarding(true, '', 'gs://media-bucket')).toBe(false)
      expect(SessionLifecycleEngine.shouldBypassOnboarding(true, 'abc', 'gs://media-bucket')).toBe(false)
      expect(SessionLifecycleEngine.shouldBypassOnboarding(true, '  ', 'gs://media-bucket')).toBe(false)
    })

    it('returns false if savedBucketName is missing or less than 3 characters', () => {
      expect(SessionLifecycleEngine.shouldBypassOnboarding(true, 'client-prod-2026', '')).toBe(false)
      expect(SessionLifecycleEngine.shouldBypassOnboarding(true, 'client-prod-2026', 'gs://')).toBe(false)
      expect(SessionLifecycleEngine.shouldBypassOnboarding(true, 'client-prod-2026', 'ab')).toBe(false)
    })
  })

  describe('restoreSessionOnBoot lifecycle', () => {
    it('returns not eligible when onboarding was not previously completed', async () => {
      const result = await SessionLifecycleEngine.restoreSessionOnBoot()
      expect(result.restored).toBe(false)
      expect(result.requiresInteraction).toBe(false)
      expect(useRuntimeStore.getState().isRestoringSession).toBe(false)
    })

    it('successfully restores token silently on boot for returning configured user', async () => {
      // Setup persistent store state
      usePersistentStore.getState().setHasCompletedOnboarding(true)
      usePersistentStore.getState().setSavedProjectId('client-prod-2026')
      usePersistentStore.getState().setSavedBucketName('gs://test-studio-vault-2026')
      usePersistentStore.getState().setLastAuthUserEmail('taylor@freelance-edit.com')

      // Mock gisAuthService.refreshTokenSilent
      vi.spyOn(gisAuthService, 'refreshTokenSilent').mockResolvedValueOnce({
        accessToken: 'ya29.silent-restored-token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'taylor@freelance-edit.com',
        userName: 'Taylor (Colorist)',
        scopes: ['devstorage.read_only'],
      })

      const result = await SessionLifecycleEngine.restoreSessionOnBoot()

      expect(result.restored).toBe(true)
      expect(result.requiresInteraction).toBe(false)
      expect(result.userEmail).toBe('taylor@freelance-edit.com')
      expect(useRuntimeStore.getState().isRestoringSession).toBe(false)
      expect(useRuntimeStore.getState().sessionRestorationError).toBeNull()
    })

    it('handles interaction_required / third-party cookie blockage gracefully', async () => {
      usePersistentStore.getState().setHasCompletedOnboarding(true)
      usePersistentStore.getState().setSavedProjectId('client-prod-2026')
      usePersistentStore.getState().setSavedBucketName('gs://test-studio-vault-2026')
      usePersistentStore.getState().setLastAuthUserEmail('taylor@freelance-edit.com')

      vi.spyOn(gisAuthService, 'refreshTokenSilent').mockRejectedValueOnce(
        new Error('Third-party cookies partitioned or user interaction required.'),
      )

      const result = await SessionLifecycleEngine.restoreSessionOnBoot()

      expect(result.restored).toBe(false)
      expect(result.requiresInteraction).toBe(true)
      expect(result.userEmail).toBe('taylor@freelance-edit.com')
      expect(result.errorMessage).toContain('Third-party cookies partitioned')
      expect(useRuntimeStore.getState().isRestoringSession).toBe(false)
      expect(useRuntimeStore.getState().sessionRestorationError).toContain('Third-party cookies partitioned')
    })
  })

  describe('markOnboardingComplete & purgeSession', () => {
    it('records non-sensitive hints upon onboarding completion', () => {
      SessionLifecycleEngine.markOnboardingComplete({
        email: 'alex@vfx-lead.com',
        name: 'Alex (VFX)',
        projectId: 'vfx-studio-prod-2026',
        bucketName: 'gs://vfx-shot-plates-2026',
      })

      const persistent = usePersistentStore.getState()
      expect(persistent.hasCompletedOnboarding).toBe(true)
      expect(persistent.lastAuthUserEmail).toBe('alex@vfx-lead.com')
      expect(persistent.lastAuthUserName).toBe('Alex (VFX)')
      expect(persistent.savedProjectId).toBe('vfx-studio-prod-2026')
      expect(persistent.savedBucketName).toBe('gs://vfx-shot-plates-2026')
      expect(persistent.recentBuckets).toContain('vfx-shot-plates-2026')
      expect(persistent.lastAuthTimestamp).toBeGreaterThan(0)
    })

    it('completely purges volatile store and clears persistent session hints on sign out', async () => {
      // First populate state
      useRuntimeStore.getState().setAuth('ya29.secret-token', 'alex@vfx.com', 'Alex', undefined, 3600)
      usePersistentStore.getState().setHasCompletedOnboarding(true)
      usePersistentStore.getState().setLastAuthUserEmail('alex@vfx.com')

      const signOutSpy = vi.spyOn(gisAuthService, 'signOut').mockResolvedValueOnce()

      await SessionLifecycleEngine.purgeSession()

      expect(signOutSpy).toHaveBeenCalled()
      expect(usePersistentStore.getState().hasCompletedOnboarding).toBe(false)
      expect(usePersistentStore.getState().lastAuthUserEmail).toBeNull()
      expect(usePersistentStore.getState().lastAuthUserName).toBeNull()
    })
  })
})
