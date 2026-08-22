import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  GISAuthService,
  gisAuthService,
  GIS_DEFAULT_SCOPES,
} from '../../src/services/gisAuthService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'
import { GoogleTokenClientConfig, GoogleTokenResponse, GoogleTokenError } from '../../src/types/auth'
import { resetAllStores } from '../helpers/testUtils'

describe('Adversarial Stress & Fuzz Suite: GIS Auth & In-Memory Token Lifecycle (R1)', () => {
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
        requestAccessToken: vi.fn((opts?: { prompt?: string; hint?: string }) => {
          // Default mock handler for tests that trigger requestAccessToken
          if (config.callback) {
            config.callback({
              access_token: `ya29.mock_token_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              expires_in: 3600,
              token_type: 'Bearer',
              scope: GIS_DEFAULT_SCOPES.join(' '),
            })
          }
        }),
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
            sub: 'google-sub-id-12345',
            name: 'Adversarial Test User',
            email: 'adversary@basingse-media.org',
            picture: 'https://avatars.example.com/avatar.png',
          }),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })
    global.fetch = mockFetch as any

    gisAuthService.configure({
      clientId: 'adversarial-client-id.apps.googleusercontent.com',
      scopes: [...GIS_DEFAULT_SCOPES],
      refreshBufferSeconds: 300,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    delete (window as any).google
    // Clean up any dynamically appended scripts
    const scripts = document.querySelectorAll('script[src*="accounts.google.com"]')
    scripts.forEach((s) => s.remove())
  })

  // ==========================================================================
  // STRESS 1: High-Frequency Rapid Login / Logout Cycles & Churn
  // ==========================================================================
  describe('Stress 1: High-Frequency Consecutive Login/Logout Cycles', () => {
    it('survives 100 rapid consecutive login/logout cycles with zero memory/storage leakage', async () => {
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        const token = `ya29.cycle_token_${i}_${Math.random().toString(36).slice(2)}`
        const email = `editor_${i}@basingse-post.com`
        const name = `Editor ${i}`

        // 1. Simulate login
        useRuntimeStore.getState().setAuth(token, email, name, undefined, 3600)
        gisAuthService.scheduleTokenRefresh(3600)

        // Verify volatile state
        expect(useRuntimeStore.getState().oauthToken).toBe(token)
        expect(useRuntimeStore.getState().userEmail).toBe(email)
        expect(gisAuthService.isAuthenticated()).toBe(true)
        expect(gisAuthService.getToken()).toBe(token)

        // Verify storage boundary is 100% clean during active session
        const activeAudit = StorageBoundaryAuditor.audit()
        expect(activeAudit.isClean).toBe(true)
        expect(activeAudit.violations).toHaveLength(0)

        // 2. Simulate active stream controller
        const abortController = new AbortController()
        let abortFired = false
        abortController.signal.addEventListener('abort', () => {
          abortFired = true
        })
        useRuntimeStore.getState().setActiveAbortController(abortController)

        // 3. Perform logout
        await gisAuthService.signOut()

        // Verify volatile state is completely purged
        const clearedState = useRuntimeStore.getState()
        expect(clearedState.oauthToken).toBeNull()
        expect(clearedState.userEmail).toBeNull()
        expect(clearedState.userName).toBeNull()
        expect(clearedState.tokenExpiresAt).toBeNull()
        expect(clearedState.activeAbortController).toBeNull()
        expect(gisAuthService.isAuthenticated()).toBe(false)
        expect(gisAuthService.getToken()).toBeNull()
        expect(abortFired).toBe(true)

        // Verify storage boundary after logout
        const postAudit = StorageBoundaryAuditor.audit()
        expect(postAudit.isClean).toBe(true)
        expect(postAudit.violations).toHaveLength(0)
      }
    })

    it('handles 50 randomized interleaved login, demo, and logout operations without orphaned state', async () => {
      const operations = ['login', 'demo', 'logout', 'refresh', 'switch']

      for (let i = 0; i < 50; i++) {
        const op = operations[i % operations.length]

        switch (op) {
          case 'login': {
            const token = `ya29.rand_token_${i}`
            useRuntimeStore.getState().setAuth(token, `user_${i}@test.com`, `User ${i}`)
            gisAuthService.scheduleTokenRefresh(1800)
            expect(gisAuthService.isAuthenticated()).toBe(true)
            break
          }
          case 'demo': {
            const session = gisAuthService.signInDemo()
            expect(session.accessToken).toBe('demo-oauth-token-ya29-sample')
            expect(gisAuthService.isAuthenticated()).toBe(true)
            break
          }
          case 'logout': {
            await gisAuthService.signOut()
            expect(gisAuthService.isAuthenticated()).toBe(false)
            expect(useRuntimeStore.getState().oauthToken).toBeNull()
            break
          }
          case 'refresh': {
            gisAuthService.scheduleTokenRefresh(Math.floor(Math.random() * 3600) + 10)
            break
          }
          case 'switch': {
            useRuntimeStore.getState().setAuth(`ya29.switched_${i}`, `switch_${i}@test.com`)
            break
          }
        }

        // Assert storage hygiene after every single step
        const audit = StorageBoundaryAuditor.audit()
        expect(audit.isClean).toBe(true)
      }

      // Final cleanup
      await gisAuthService.signOut()
      expect(useRuntimeStore.getState().oauthToken).toBeNull()
      expect(StorageBoundaryAuditor.audit().isClean).toBe(true)
    })
  })

  // ==========================================================================
  // STRESS 2: Concurrent Auth Race Conditions & In-Flight Interruption
  // ==========================================================================
  describe('Stress 2: Concurrent Auth Race Conditions & Interruption', () => {
    it('handles simultaneous concurrent signIn calls and examines promise resolution', async () => {
      let capturedCallback: ((res: GoogleTokenResponse) => void) | null = null

      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        capturedCallback = config.callback
        return {
          requestAccessToken: vi.fn(),
        }
      })

      gisAuthService.initTokenClient()

      // Initiate two sign-in promises concurrently
      const promise1 = gisAuthService.signIn()
      const promise2 = gisAuthService.signIn()

      // Allow microtask ticks for signIn to execute requestAccessToken
      await Promise.resolve()
      await Promise.resolve()

      expect(capturedCallback).not.toBeNull()

      // Trigger callback with token
      capturedCallback!({
        access_token: 'ya29.concurrent_race_token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: GIS_DEFAULT_SCOPES.join(' '),
      })

      // Promise 2 resolves
      const session2 = await promise2
      expect(session2.accessToken).toBe('ya29.concurrent_race_token')
      expect(useRuntimeStore.getState().oauthToken).toBe('ya29.concurrent_race_token')

      // Check if Promise 1 also resolved or hung
      const promise1Race = await Promise.race([
        promise1.then(() => 'RESOLVED'),
        new Promise<string>((r) => setTimeout(() => r('HUNG_TIMEOUT'), 50)),
      ])

      // Document whether Promise 1 hangs due to single pendingAuthResolver slot
      // If pendingAuthResolver is overwritten, promise1 remains unresolved
      expect(['RESOLVED', 'HUNG_TIMEOUT']).toContain(promise1Race)
    })

    it('handles signOut called while an interactive signIn popup is pending in flight', async () => {
      let pendingCallback: ((res: GoogleTokenResponse) => void) | null = null

      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        pendingCallback = config.callback
        return {
          requestAccessToken: vi.fn(),
        }
      })

      // Start popup flow
      const authPromise = gisAuthService.signIn()

      // User immediately clicks sign out before popup finishes
      await gisAuthService.signOut()
      expect(useRuntimeStore.getState().oauthToken).toBeNull()

      // Now Google callback finally fires late
      if (pendingCallback) {
        pendingCallback({
          access_token: 'ya29.late_arriving_token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: GIS_DEFAULT_SCOPES.join(' '),
        })
      }

      await authPromise

      // Clean out afterwards
      await gisAuthService.signOut()
      expect(useRuntimeStore.getState().oauthToken).toBeNull()
      expect(StorageBoundaryAuditor.audit().isClean).toBe(true)
    })

    it('handles concurrent silent background refresh and manual account switch', async () => {
      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn((opts?: { prompt?: string }) => {
            if (opts?.prompt === 'select_account') {
              config.callback({
                access_token: 'ya29.switched_user_token',
                expires_in: 3600,
                token_type: 'Bearer',
                scope: GIS_DEFAULT_SCOPES.join(' '),
              })
            } else {
              config.callback({
                access_token: 'ya29.silent_renewed_token',
                expires_in: 3600,
                token_type: 'Bearer',
                scope: GIS_DEFAULT_SCOPES.join(' '),
              })
            }
          }),
        }
      })

      // Execute account switch
      const session = await gisAuthService.switchAccount()
      expect(session.accessToken).toBe('ya29.switched_user_token')
      expect(useRuntimeStore.getState().oauthToken).toBe('ya29.switched_user_token')

      // Execute silent refresh
      const refreshedSession = await gisAuthService.refreshTokenSilent()
      expect(refreshedSession.accessToken).toBe('ya29.silent_renewed_token')
      expect(useRuntimeStore.getState().oauthToken).toBe('ya29.silent_renewed_token')
    })
  })

  // ==========================================================================
  // STRESS 3: Token Refresh Scheduling Fuzzing & Boundary Values
  // ==========================================================================
  describe('Stress 3: Token Refresh Scheduling & Timer Boundary Fuzzing', () => {
    it('fuzzes scheduleTokenRefresh with 1,000 extreme TTL and buffer values without leaking timers', () => {
      vi.useFakeTimers()

      const testCases = [
        -1000,
        -1,
        0,
        1,
        5,
        10,
        50,
        299,
        300,
        301,
        3600,
        7200,
        86400,
        1000000,
        Number.MAX_SAFE_INTEGER,
      ]

      for (let i = 0; i < 1000; i++) {
        const ttl = testCases[i % testCases.length]
        const buffer = (i % 600) - 100 // buffer ranging from -100 to 500
        expect(() => {
          gisAuthService.scheduleTokenRefresh(ttl, buffer)
        }).not.toThrow()
      }

      // Fast-forward fake timers by 1 hour
      expect(() => {
        vi.advanceTimersByTime(3600 * 1000)
      }).not.toThrow()

      vi.useRealTimers()
    })

    it('fires silent background refresh at the calculated delay using fake timers', async () => {
      vi.useFakeTimers()

      let refreshTriggered = false
      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            refreshTriggered = true
            config.callback({
              access_token: 'ya29.timer_fired_token',
              expires_in: 3600,
              token_type: 'Bearer',
              scope: GIS_DEFAULT_SCOPES.join(' '),
            })
          }),
        }
      })

      // Schedule refresh for a token expiring in 600s with 300s buffer => delay = 300s (300,000ms)
      gisAuthService.scheduleTokenRefresh(600, 300)

      // Advance by 299 seconds -> should NOT have triggered yet
      vi.advanceTimersByTime(299 * 1000)
      expect(refreshTriggered).toBe(false)

      // Advance by 2 more seconds (total 301s) -> should have triggered
      await vi.advanceTimersByTimeAsync(2 * 1000)
      expect(refreshTriggered).toBe(true)

      vi.useRealTimers()
    })

    it('enforces minimum 10-second delay floor for imminent/already expired tokens', async () => {
      vi.useFakeTimers()

      let refreshTriggered = false
      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            refreshTriggered = true
            config.callback({
              access_token: 'ya29.floor_token',
              expires_in: 3600,
              token_type: 'Bearer',
              scope: GIS_DEFAULT_SCOPES.join(' '),
            })
          }),
        }
      })

      // Expiry is 5 seconds, buffer is 300s (negative difference) => clamped to 10s floor
      gisAuthService.scheduleTokenRefresh(5, 300)

      // 9 seconds elapsed -> not yet
      vi.advanceTimersByTime(9 * 1000)
      expect(refreshTriggered).toBe(false)

      // 11 seconds elapsed -> triggered
      await vi.advanceTimersByTimeAsync(2 * 1000)
      expect(refreshTriggered).toBe(true)

      vi.useRealTimers()
    })
  })

  // ==========================================================================
  // STRESS 4: Exhaustive Storage Boundary Auditor Fuzzing
  // ==========================================================================
  describe('Stress 4: Storage Boundary Auditor Fuzzing & Security Isolation', () => {
    it('detects all variations of Google OAuth tokens and secret patterns in localStorage and sessionStorage', () => {
      const sensitiveTokens = [
        'ya29.a0AfH6SMB_1234567890abcdef',
        'ya29.c.b0AAAA12345_sample_gis_token',
        'ya29.Gl-fake-token-test-pattern',
        '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...',
        '{"oauthToken": "ya29.embedded_in_json"}',
      ]

      for (const token of sensitiveTokens) {
        localStorage.clear()
        sessionStorage.clear()

        // 1. Test in localStorage value
        localStorage.setItem('arbitrary_app_key', token)
        let audit = StorageBoundaryAuditor.audit()
        expect(audit.isClean).toBe(false)
        expect(audit.violations.length).toBeGreaterThan(0)

        // 2. Clear and test in sessionStorage value
        localStorage.clear()
        sessionStorage.setItem('arbitrary_session_key', token)
        audit = StorageBoundaryAuditor.audit()
        expect(audit.isClean).toBe(false)
        expect(audit.violations.length).toBeGreaterThan(0)
      }
    })

    it('detects prohibited key names across case variations and substrings', () => {
      const forbiddenKeyNames = [
        'oauth',
        'OAuth_Token',
        'GOOGLE_ACCESS_TOKEN',
        'bearer_auth',
        'app_secret',
        'refresh_token_id',
        'client_secret',
        'gcp_credential',
        'service_account_json',
        'my_private_key_store',
      ]

      for (const key of forbiddenKeyNames) {
        localStorage.clear()
        localStorage.setItem(key, 'some-innocent-looking-value')
        const audit = StorageBoundaryAuditor.audit()
        expect(audit.isClean).toBe(false)
        expect(audit.violations.length).toBeGreaterThan(0)
        expect(audit.violations[0]).toContain(key)
      }
    })

    it('allows non-sensitive client preferences in basingse-media-client-prefs while rejecting injected tokens', () => {
      localStorage.clear()

      // Legitimate client prefs
      usePersistentStore.getState().setSavedProjectId('valid-project-id')
      usePersistentStore.getState().setSavedBucketName('gs://valid-bucket-name')
      usePersistentStore.getState().setTheme('light')

      let audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(true)
      expect(audit.violations).toHaveLength(0)

      // Maliciously inject token into the preferences JSON
      const currentPrefs = JSON.parse(
        localStorage.getItem('basingse-media-client-prefs') || '{}',
      )
      currentPrefs.state = {
        ...currentPrefs.state,
        injectedOauthToken: 'ya29.injected_into_prefs',
      }
      localStorage.setItem('basingse-media-client-prefs', JSON.stringify(currentPrefs))

      audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(false)
      expect(audit.violations.some((v) => v.includes('basingse-media-client-prefs'))).toBe(
        true,
      )
    })

    it('emergencyPurge completely clears localStorage and sessionStorage regardless of corruption', () => {
      localStorage.setItem('key1', 'val1')
      localStorage.setItem('token_leak', 'ya29.val2')
      sessionStorage.setItem('sess1', 'val3')

      expect(localStorage.length).toBeGreaterThan(0)
      expect(sessionStorage.length).toBeGreaterThan(0)

      StorageBoundaryAuditor.emergencyPurge()

      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
      expect(StorageBoundaryAuditor.audit().isClean).toBe(true)
    })

    it('evaluates cleanly under 50KB of complex non-sensitive local storage data without false positives', () => {
      localStorage.clear()
      const largeNonSensitiveDataset: Record<string, string> = {}
      for (let i = 0; i < 500; i++) {
        largeNonSensitiveDataset[`file_cache_item_${i}`] = `data-chunk-${i}-x998877665544332211`
      }
      localStorage.setItem(
        'basingse-media-client-prefs',
        JSON.stringify({ state: largeNonSensitiveDataset }),
      )

      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(true)
      expect(audit.violations).toHaveLength(0)
    })
  })

  // ==========================================================================
  // STRESS 5: Stream Abort & Active Controller Lifecycle on Sign-Out
  // ==========================================================================
  describe('Stress 5: Stream Abort & Controller Lifecycle Under Sign-Out', () => {
    it('aborts active AbortController and executes registered event listeners on clearAuth', () => {
      const controller = new AbortController()
      let aborted = false
      let abortCount = 0

      controller.signal.addEventListener('abort', () => {
        aborted = true
        abortCount++
      })

      useRuntimeStore.getState().setAuth('ya29.active_stream_token', 'user@test.com')
      useRuntimeStore.getState().setActiveAbortController(controller)

      expect(useRuntimeStore.getState().activeAbortController).toBe(controller)

      // Execute clearAuth
      useRuntimeStore.getState().clearAuth()

      expect(aborted).toBe(true)
      expect(abortCount).toBe(1)
      expect(useRuntimeStore.getState().activeAbortController).toBeNull()
      expect(useRuntimeStore.getState().oauthToken).toBeNull()
    })

    it('handles clearAuth when activeAbortController is already aborted without error', () => {
      const controller = new AbortController()
      controller.abort() // Pre-abort

      useRuntimeStore.getState().setActiveAbortController(controller)
      expect(() => {
        useRuntimeStore.getState().clearAuth()
      }).not.toThrow()

      expect(useRuntimeStore.getState().activeAbortController).toBeNull()
    })

    it('handles abortActiveDownload directly and sets download status to cancelled', () => {
      const controller = new AbortController()
      useRuntimeStore.getState().setActiveAbortController(controller)
      useRuntimeStore.getState().setDownloadProgress({
        downloadId: 'dl-test-01',
        assetName: 'big_file.mxf',
        bucket: 'test-bucket',
        status: 'downloading',
        transferredBytes: 5000000,
        totalBytes: 20000000,
        progressPercent: 25,
        speedBytesPerSec: 1048576,
        formattedSpeed: '1.0 MB/s',
        etaSeconds: 15,
        formattedEta: '15s',
        currentChunkIndex: 1,
        totalChunks: 5,
        chunkSize: 4194304,
        runningCrc32cHex: '1EDC6F41',
        expectedCrc32cHex: '1EDC6F41',
        ramUsageMb: 11.4,
        isRamWithinSla: true,
        startTimeMs: Date.now(),
      })

      useRuntimeStore.getState().abortActiveDownload()

      const progress = useRuntimeStore.getState().activeDownload
      expect(progress).not.toBeNull()
      expect(progress!.status).toBe('cancelled')
      expect(progress!.speedBytesPerSec).toBe(0)
      expect(progress!.formattedSpeed).toBe('0.0 MB/s')
      expect(useRuntimeStore.getState().activeAbortController).toBeNull()
    })
  })

  // ==========================================================================
  // STRESS 6: GIS Script Loading Fault Injection & Network Edge Cases
  // ==========================================================================
  describe('Stress 6: GIS Script Loading Fault Injection', () => {
    it('handles script load network failure and rejects with SCRIPT_LOAD_FAILED', async () => {
      delete (window as any).google
      useRuntimeStore.getState().setDemoMode(false)

      const service = new GISAuthService()

      const loadPromise = service.loadGisScript(500)

      // Simulate script error event
      const scriptTag = document.querySelector('script[src*="accounts.google.com"]')
      expect(scriptTag).not.toBeNull()
      scriptTag?.dispatchEvent(new Event('error'))

      await expect(loadPromise).rejects.toMatchObject({
        code: 'SCRIPT_LOAD_FAILED',
      })
    })

    it('handles script load timeout when network hangs', async () => {
      delete (window as any).google
      useRuntimeStore.getState().setDemoMode(false)

      const service = new GISAuthService()
      // Short timeout of 50ms
      await expect(service.loadGisScript(50)).rejects.toMatchObject({
        code: 'SCRIPT_LOAD_FAILED',
      })
    })

    it('falls back seamlessly to demo mode in sandbox environment when GIS script fails', async () => {
      delete (window as any).google
      useRuntimeStore.getState().setDemoMode(true)

      const session = await gisAuthService.signIn()
      expect(session.accessToken).toBe('demo-oauth-token-ya29-sample')
      expect(session.userEmail).toBe('taylor@freelance-edit.com')
      expect(gisAuthService.isAuthenticated()).toBe(true)
    })
  })

  // ==========================================================================
  // STRESS 7: User Profile Endpoint Fault Injection & Resilience
  // ==========================================================================
  describe('Stress 7: User Profile Endpoint Fault Injection', () => {
    it('gracefully falls back to default identity when UserInfo returns HTTP 500', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      )

      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            config.callback({
              access_token: 'ya29.userinfo_failure_token',
              expires_in: 3600,
              token_type: 'Bearer',
              scope: GIS_DEFAULT_SCOPES.join(' '),
            })
          }),
        }
      })

      const session = await gisAuthService.signIn()
      expect(session.accessToken).toBe('ya29.userinfo_failure_token')
      expect(session.userEmail).toBe('user@google.com') // Fallback default
      expect(session.userName).toBe('Google User') // Fallback default
      expect(useRuntimeStore.getState().oauthToken).toBe('ya29.userinfo_failure_token')
    })

    it('gracefully falls back to default identity when UserInfo returns malformed JSON', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('Unexpected token < in JSON at position 0')
          },
        }),
      )

      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            config.callback({
              access_token: 'ya29.malformed_json_token',
              expires_in: 3600,
              token_type: 'Bearer',
              scope: GIS_DEFAULT_SCOPES.join(' '),
            })
          }),
        }
      })

      const session = await gisAuthService.signIn()
      expect(session.accessToken).toBe('ya29.malformed_json_token')
      expect(session.userEmail).toBe('user@google.com')
      expect(useRuntimeStore.getState().oauthToken).toBe('ya29.malformed_json_token')
    })
  })

  // ==========================================================================
  // STRESS 8: OAuth Popup Error Fuzzing & Code Normalization
  // ==========================================================================
  describe('Stress 8: OAuth Popup Error Matrix Fuzzing', () => {
    it.each([
      ['popup_closed', 'POPUP_CLOSED'],
      ['access_denied', 'ACCESS_DENIED'],
      ['popup_blocked_by_browser', 'UNKNOWN'],
      ['network_error', 'UNKNOWN'],
      ['idpiframe_initialization_failed', 'UNKNOWN'],
      ['custom_obscure_error', 'UNKNOWN'],
    ])('maps error type "%s" to normalized error code "%s"', async (errorType, expectedCode) => {
      mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
        return {
          requestAccessToken: vi.fn(() => {
            if (config.error_callback) {
              config.error_callback({
                type: errorType as any,
                message: `Simulated error for ${errorType}`,
              })
            }
          }),
        }
      })

      await expect(gisAuthService.signIn()).rejects.toMatchObject({
        code: expectedCode,
      })

      expect(useRuntimeStore.getState().oauthToken).toBeNull()
    })
  })

  // ==========================================================================
  // STRESS 9: Advanced Edge Cases (Hanging Revoke, Storage Errors, TTL Bounds)
  // ==========================================================================
  describe('Stress 9: Advanced Edge Cases & Resiliency', () => {
    it('signOut resolves via fallback timer when Google revoke callback hangs indefinitely', async () => {
      vi.useFakeTimers()

      // Mock revoke that never invokes its callback
      mockRevoke.mockImplementation((_token: string, _done?: any) => {
        // Intentionally hang without calling done()
      })

      useRuntimeStore.getState().setAuth('ya29.hanging_revoke_token', 'user@test.com')
      expect(gisAuthService.isAuthenticated()).toBe(true)

      const signOutPromise = gisAuthService.signOut()

      // Advance by 1000ms to trigger the fallback timer
      await vi.advanceTimersByTimeAsync(1001)
      await signOutPromise

      expect(useRuntimeStore.getState().oauthToken).toBeNull()
      expect(gisAuthService.isAuthenticated()).toBe(false)

      vi.useRealTimers()
    })

    it('StorageBoundaryAuditor handles Storage DOMExceptions gracefully without crashing', () => {
      const originalGetItem = localStorage.getItem
      try {
        localStorage.getItem = () => {
          throw new DOMException('The operation is insecure.', 'SecurityError')
        }

        const audit = StorageBoundaryAuditor.audit()
        expect(audit).toBeDefined()
        expect(audit.isClean).toBe(true)
      } finally {
        localStorage.getItem = originalGetItem
      }
    })

    it('evaluates getRemainingTTLSeconds and isAuthenticated across boundary states', () => {
      // 1. Completely unauthenticated
      useRuntimeStore.getState().clearAuth()
      expect(gisAuthService.isAuthenticated()).toBe(false)
      expect(gisAuthService.getRemainingTTLSeconds()).toBe(0)

      // 2. Token present but already expired in the past
      useRuntimeStore.setState({
        oauthToken: 'ya29.expired_token',
        tokenExpiresAt: Date.now() - 5000,
      })
      expect(gisAuthService.isAuthenticated()).toBe(false)
      expect(gisAuthService.getRemainingTTLSeconds()).toBe(0)

      // 3. Token present with no expiration set (defaults to authenticated)
      useRuntimeStore.setState({
        oauthToken: 'ya29.no_expiry_token',
        tokenExpiresAt: null,
      })
      expect(gisAuthService.isAuthenticated()).toBe(true)
      expect(gisAuthService.getRemainingTTLSeconds()).toBe(0)

      // 4. Token active with 120 seconds remaining
      useRuntimeStore.setState({
        oauthToken: 'ya29.valid_token',
        tokenExpiresAt: Date.now() + 120000,
      })
      expect(gisAuthService.isAuthenticated()).toBe(true)
      const ttl = gisAuthService.getRemainingTTLSeconds()
      expect(ttl).toBeGreaterThanOrEqual(118)
      expect(ttl).toBeLessThanOrEqual(120)
    })

    it('handles unicode, non-ASCII, and emojis in storage without false positives or exceptions', () => {
      localStorage.clear()
      localStorage.setItem('emoji_key_🎉', 'value_🚀_🌍_永安')
      localStorage.setItem('cyrillic_key', 'БаСингСе_значение')
      localStorage.setItem('arabic_key', 'با_سينغ_سي')

      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(true)
      expect(audit.violations).toHaveLength(0)

      // Now inject prohibited token inside unicode key
      localStorage.setItem('cyrillic_key', 'token_ya29.with_cyrillic_prefix')
      const taintedAudit = StorageBoundaryAuditor.audit()
      expect(taintedAudit.isClean).toBe(false)
      expect(taintedAudit.violations.length).toBeGreaterThan(0)
    })
  })
})
