import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GISAuthService, gisAuthService, GIS_DEFAULT_SCOPES } from '../../src/services/gisAuthService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'
import { GoogleTokenClientConfig, GoogleTokenResponse, GoogleTokenError } from '../../src/types/auth'
import { resetAllStores } from '../helpers/testUtils'

describe('M1 Challenger - Empirical Adversarial Stress Test Suite', () => {
  let mockInitTokenClient: ReturnType<typeof vi.fn>
  let mockRevoke: ReturnType<typeof vi.fn>
  let capturedConfig: GoogleTokenClientConfig | null = null
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetAllStores()
    capturedConfig = null

    mockInitTokenClient = vi.fn((config: GoogleTokenClientConfig) => {
      capturedConfig = config
      return {
        requestAccessToken: vi.fn((_overrideConfig?: { prompt?: string; hint?: string }) => {}),
      }
    })

    mockRevoke = vi.fn((_token: string, done?: (res: { successful: boolean }) => void) => {
      if (done) done({ successful: true })
    })

    ;(window as any).google = {
      accounts: {
        oauth2: {
          initTokenClient: mockInitTokenClient,
          revoke: mockRevoke,
          hasGrantedAllScopes: vi.fn().mockReturnValue(true),
          hasGrantedAnyScope: vi.fn().mockReturnValue(true),
        },
      },
    }

    mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('userinfo')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sub: 'user-sub-123',
            name: 'Adversarial Tester',
            email: 'adversary@basingse-qa.org',
            picture: 'https://avatar.example.com/adversary.png',
          }),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })
    global.fetch = mockFetch as any

    gisAuthService.configure({
      clientId: 'stress-test-client-id.apps.googleusercontent.com',
      scopes: [...GIS_DEFAULT_SCOPES],
      refreshBufferSeconds: 300,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    delete (window as any).google
  })

  describe('1. Token Expiry & TTL Countdown Edge Cases', () => {
    it('returns 0 for TTL when no token is present', () => {
      expect(useRuntimeStore.getState().tokenExpiresAt).toBeNull()
      expect(gisAuthService.getRemainingTTLSeconds()).toBe(0)
      expect(gisAuthService.isAuthenticated()).toBe(false)
    })

    it('returns 0 (never negative) when token has expired in the past', () => {
      // Simulate token expired 500 seconds ago
      useRuntimeStore.setState({
        oauthToken: 'ya29.expired_token_test',
        tokenExpiresAt: Date.now() - 500 * 1000,
      })

      expect(gisAuthService.getRemainingTTLSeconds()).toBe(0)
      expect(gisAuthService.isAuthenticated()).toBe(false)
    })

    it('returns 0 when token expires at exactly current timestamp', () => {
      useRuntimeStore.setState({
        oauthToken: 'ya29.exact_now_token',
        tokenExpiresAt: Date.now(),
      })

      expect(gisAuthService.getRemainingTTLSeconds()).toBe(0)
      expect(gisAuthService.isAuthenticated()).toBe(false)
    })

    it('returns accurate positive TTL for fresh tokens', () => {
      const ttl = 1800
      useRuntimeStore.getState().setAuth('ya29.fresh_token', 'user@qa.org', 'User', undefined, ttl)

      const remaining = gisAuthService.getRemainingTTLSeconds()
      expect(remaining).toBeGreaterThanOrEqual(1798)
      expect(remaining).toBeLessThanOrEqual(1800)
      expect(gisAuthService.isAuthenticated()).toBe(true)
    })

    it('handles short TTLs where expiresIn < refreshBufferSeconds without negative delay', () => {
      vi.useFakeTimers()
      const service = new GISAuthService('test-client')
      const scheduleSpy = vi.spyOn(service, 'refreshTokenSilent').mockResolvedValue({
        accessToken: 'ya29.new_token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'u@qa.org',
        userName: 'U',
        scopes: [],
      })

      // TTL is 60s, refreshBuffer is 300s -> expiresIn - buffer = -240s -> max(10, -240) = 10s
      service.scheduleTokenRefresh(60, 300)

      // Fast forward 9 seconds: should not have fired yet
      vi.advanceTimersByTime(9000)
      expect(scheduleSpy).not.toHaveBeenCalled()

      // Fast forward past 10 seconds: must fire
      vi.advanceTimersByTime(2000)
      expect(scheduleSpy).toHaveBeenCalledTimes(1)
    })

    it('clears previous timer on repeated scheduleTokenRefresh calls preventing timer leaks', () => {
      vi.useFakeTimers()
      const service = new GISAuthService('test-client')
      const scheduleSpy = vi.spyOn(service, 'refreshTokenSilent').mockResolvedValue({
        accessToken: 'ya29.new_token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'u@qa.org',
        userName: 'U',
        scopes: [],
      })

      // Schedule 10 times consecutively
      for (let i = 0; i < 10; i++) {
        service.scheduleTokenRefresh(600, 300)
      }

      // Advance by 300s (refresh delay)
      vi.advanceTimersByTime(301 * 1000)

      // Should only fire once (previous 9 timers cleared)
      expect(scheduleSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('2. Silent Renewal Failure & Error Handling', () => {
    it('properly rejects when silent renewal encounters OAuth error response', async () => {
      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            const errorResponse: GoogleTokenResponse = {
              access_token: '',
              expires_in: 0,
              token_type: 'Bearer',
              scope: '',
              error: 'invalid_grant',
              error_description: 'Token has been expired or revoked by user.',
            }
            config.callback(errorResponse)
          }),
        }
      })

      await expect(gisAuthService.refreshTokenSilent()).rejects.toMatchObject({
        code: 'UNKNOWN',
        message: 'Token has been expired or revoked by user.',
      })
    })

    it('properly rejects when silent renewal encounters access_denied', async () => {
      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            const error: GoogleTokenError = {
              type: 'access_denied',
              message: 'Immediate request failed because user interaction is required.',
            }
            if (config.error_callback) {
              config.error_callback(error)
            }
          }),
        }
      })

      await expect(gisAuthService.refreshTokenSilent()).rejects.toMatchObject({
        code: 'ACCESS_DENIED',
      })
    })

    it('survives fetch user profile failure gracefully by providing fallback identity', async () => {
      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            config.callback({
              access_token: 'ya29.valid_token_but_profile_fails',
              expires_in: 3600,
              token_type: 'Bearer',
              scope: GIS_DEFAULT_SCOPES.join(' '),
            })
          }),
        }
      })

      // Simulate 500 internal server error from userinfo endpoint
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      )

      const session = await gisAuthService.signIn()
      expect(session.accessToken).toBe('ya29.valid_token_but_profile_fails')
      expect(session.userEmail).toBe('user@google.com') // Fallback identity
      expect(session.userName).toBe('Google User')
      expect(useRuntimeStore.getState().oauthToken).toBe('ya29.valid_token_but_profile_fails')
    })
  })

  describe('3. Sign-out Stream Abort & State Purge Stress Tests', () => {
    it('immediately aborts active AbortController on clearAuth()', () => {
      const controller = new AbortController()
      let aborted = false
      let abortReason: any = null

      controller.signal.addEventListener('abort', () => {
        aborted = true
        abortReason = controller.signal.reason
      })

      useRuntimeStore.getState().setAuth('ya29.sample_active', 'user@qa.org', 'User')
      useRuntimeStore.getState().setActiveAbortController(controller)
      useRuntimeStore.getState().setDownloadProgress({
        assetName: 'large_video.mov',
        progress: 45.2,
        speedBytesPerSec: 15000000,
        formattedSpeed: '15.0 MB/s',
        etaSeconds: 120,
        formattedEta: '2m 00s',
        transferredBytes: 452000000,
        totalBytes: 1000000000,
        ramMb: 11.4,
        status: 'downloading',
      })

      expect(useRuntimeStore.getState().activeAbortController).toBe(controller)
      expect(useRuntimeStore.getState().activeDownload).not.toBeNull()

      // Execute clearAuth
      useRuntimeStore.getState().clearAuth()

      // Verify immediate abort
      expect(aborted).toBe(true)
      expect(controller.signal.aborted).toBe(true)

      // Verify all runtime state purged
      const state = useRuntimeStore.getState()
      expect(state.oauthToken).toBeNull()
      expect(state.userEmail).toBeNull()
      expect(state.userName).toBeNull()
      expect(state.userAvatar).toBeNull()
      expect(state.tokenExpiresAt).toBeNull()
      expect(state.activeAbortController).toBeNull()
      expect(state.activeDownload).toBeNull()
    })

    it('clearAuth gracefully handles AbortController that throws during abort()', () => {
      const faultyController = {
        abort: vi.fn(() => {
          throw new Error('Native controller abort failure')
        }),
      } as unknown as AbortController

      useRuntimeStore.getState().setAuth('ya29.sample_active', 'user@qa.org', 'User')
      useRuntimeStore.getState().setActiveAbortController(faultyController)

      // clearAuth must not throw and must still clean up all state
      expect(() => {
        useRuntimeStore.getState().clearAuth()
      }).not.toThrow()

      expect(faultyController.abort).toHaveBeenCalledTimes(1)
      const state = useRuntimeStore.getState()
      expect(state.oauthToken).toBeNull()
      expect(state.activeAbortController).toBeNull()
    })

    it('signOut cancels active refresh timer so no background refresh triggers after logout', () => {
      vi.useFakeTimers()
      const service = new GISAuthService('test-client')
      const refreshSpy = vi.spyOn(service, 'refreshTokenSilent').mockResolvedValue({
        accessToken: 'ya29.renewed',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'u@qa.org',
        userName: 'U',
        scopes: [],
      })

      useRuntimeStore.getState().setAuth('ya29.to_logout', 'u@qa.org', 'U', undefined, 3600)
      service.scheduleTokenRefresh(3600, 300)

      // Sign out
      void service.signOut()

      // Fast forward past the refresh time (3300s)
      vi.advanceTimersByTime(3500 * 1000)

      // Must not have called refresh
      expect(refreshSpy).not.toHaveBeenCalled()
    })

    it('signOut succeeds even if window.google.accounts.oauth2.revoke hangs or throws', async () => {
      // Simulate revoke throwing an exception
      mockRevoke.mockImplementation(() => {
        throw new Error('Network error revoking token')
      })

      useRuntimeStore.getState().setAuth('ya29.token_error', 'u@qa.org', 'U')
      expect(gisAuthService.isAuthenticated()).toBe(true)

      await expect(gisAuthService.signOut()).resolves.not.toThrow()

      expect(useRuntimeStore.getState().oauthToken).toBeNull()
      expect(gisAuthService.isAuthenticated()).toBe(false)
    })

    it('handles multiple concurrent signOut calls safely', async () => {
      useRuntimeStore.getState().setAuth('ya29.concurrent_token', 'u@qa.org', 'U')

      const p1 = gisAuthService.signOut()
      const p2 = gisAuthService.signOut()
      const p3 = gisAuthService.signOut()

      await Promise.all([p1, p2, p3])

      expect(useRuntimeStore.getState().oauthToken).toBeNull()
      expect(gisAuthService.isAuthenticated()).toBe(false)
    })
  })

  describe('4. Storage Boundary & Prohibited Pattern Detection', () => {
    it('detects case-insensitive token and credential variations in localStorage', () => {
      const badKeys = [
        'user_OAuth_Token',
        'APP_BEARER_SECRET',
        'my_refresh_token_cache',
        'service_account_json',
        'client_secret_vault',
      ]

      for (const badKey of badKeys) {
        localStorage.clear()
        localStorage.setItem(badKey, 'some-value')
        const audit = StorageBoundaryAuditor.audit()
        expect(audit.isClean).toBe(false)
        expect(audit.violations.length).toBeGreaterThan(0)
      }
    })

    it('detects ya29 tokens nested inside JSON strings in sessionStorage', () => {
      sessionStorage.setItem('nested_session', JSON.stringify({ access: 'ya29.a0AfH6SMB_leaked' }))
      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(false)
      expect(audit.violations.some((v) => v.includes('sessionStorage'))).toBe(true)
    })

    it('allows valid non-sensitive preference keys', () => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem('basingse-media-client-prefs', JSON.stringify({ theme: 'dark', savedProjectId: 'my-project' }))
      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(true)
      expect(audit.violations).toHaveLength(0)
    })
  })
})
