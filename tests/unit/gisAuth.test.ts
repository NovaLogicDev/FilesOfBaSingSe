import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GISAuthService, gisAuthService, GIS_DEFAULT_SCOPES } from '../../src/services/gisAuthService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'
import { GoogleTokenClientConfig, GoogleTokenResponse, GoogleTokenError } from '../../src/types/auth'
import { resetAllStores } from '../helpers/testUtils'

describe('GISAuthService - Unit Tests', () => {
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
        requestAccessToken: vi.fn((_overrideConfig?: { prompt?: string }) => {
          // Default behavior can be controlled in individual tests
        }),
      }
    })

    mockRevoke = vi.fn((_token: string, done?: (res: { successful: boolean }) => void) => {
      if (done) done({ successful: true })
    })

    // Setup global window.google mock
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

    // Setup global fetch mock for userinfo endpoint
    mockFetch = vi.fn().mockImplementation((url: any) => {
      const urlStr = typeof url === 'string' ? url : (url?.url || String(url || ''))
      if (urlStr.includes('userinfo')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            sub: '1092837465',
            name: 'Aang Avatar',
            given_name: 'Aang',
            family_name: 'Avatar',
            picture: 'https://lh3.googleusercontent.com/aang.png',
            email: 'aang@air-temple.org',
            email_verified: true,
          }),
        })
      }
      return Promise.reject(new Error(`Unknown URL: ${urlStr}`))
    })
    vi.stubGlobal('fetch', mockFetch)

    gisAuthService.configure({
      clientId: 'test-client-id.apps.googleusercontent.com',
      scopes: [...GIS_DEFAULT_SCOPES],
      refreshBufferSeconds: 300,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    delete (window as any).google
  })

  it('initializes token client with minimal non-sensitive scopes (Least Privilege)', () => {
    const service = new GISAuthService('test-id', GIS_DEFAULT_SCOPES)
    const client = service.initTokenClient()

    expect(client).toBeDefined()
    expect(mockInitTokenClient).toHaveBeenCalledTimes(1)
    expect(capturedConfig).toBeDefined()
    expect(capturedConfig!.client_id).toBe('test-id')
    expect(capturedConfig!.scope).toContain('https://www.googleapis.com/auth/devstorage.read_only')
    expect(capturedConfig!.scope).toContain('openid')
    expect(capturedConfig!.scope).toContain('userinfo.email')
    expect(capturedConfig!.scope).toContain('userinfo.profile')
    expect(capturedConfig!.scope).not.toContain('https://www.googleapis.com/auth/cloud-platform')
  })

  it('authenticates user via interactive popup and populates volatile runtime store', async () => {
    let clientInstance: any

    mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
      capturedConfig = config
      clientInstance = {
        requestAccessToken: vi.fn(() => {
          // Simulate successful OAuth popup callback
          const response: GoogleTokenResponse = {
            access_token: 'ya29.mock_interactive_token_12345',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: GIS_DEFAULT_SCOPES.join(' '),
          }
          config.callback(response)
        }),
      }
      return clientInstance
    })

    const sessionPromise = gisAuthService.signIn()
    const session = await sessionPromise

    expect(session.accessToken).toBe('ya29.mock_interactive_token_12345')
    expect(session.userEmail).toBe('aang@air-temple.org')
    expect(session.userName).toBe('Aang Avatar')
    expect(session.userAvatar).toBe('https://lh3.googleusercontent.com/aang.png')
    expect(session.expiresIn).toBe(3600)

    // Verify runtime store is strictly populated
    const runtimeState = useRuntimeStore.getState()
    expect(runtimeState.oauthToken).toBe('ya29.mock_interactive_token_12345')
    expect(runtimeState.userEmail).toBe('aang@air-temple.org')
    expect(runtimeState.userName).toBe('Aang Avatar')
    expect(runtimeState.userAvatar).toBe('https://lh3.googleusercontent.com/aang.png')
    expect(runtimeState.tokenExpiresAt).toBeGreaterThan(Date.now())

    // Verify zero storage leakage
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(true)
  })

  it('rejects with POPUP_CLOSED when user closes popup window', async () => {
    mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
      capturedConfig = config
      return {
        requestAccessToken: vi.fn(() => {
          const error: GoogleTokenError = {
            type: 'popup_closed',
            message: 'User closed popup',
          }
          if (config.error_callback) {
            config.error_callback(error)
          }
        }),
      }
    })

    await expect(gisAuthService.signIn()).rejects.toMatchObject({
      code: 'POPUP_CLOSED',
    })

    // Store must remain unauthenticated
    expect(useRuntimeStore.getState().oauthToken).toBeNull()
  })

  it('rejects with ACCESS_DENIED when user denies consent', async () => {
    mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
      capturedConfig = config
      return {
        requestAccessToken: vi.fn(() => {
          const error: GoogleTokenError = {
            type: 'access_denied',
            message: 'Consent denied by user',
          }
          if (config.error_callback) {
            config.error_callback(error)
          }
        }),
      }
    })

    await expect(gisAuthService.signIn()).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    })

    expect(useRuntimeStore.getState().oauthToken).toBeNull()
  })

  it('triggers silent background renewal before token expiry', async () => {
    let lastPrompt: string | undefined

    mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
      return {
        requestAccessToken: vi.fn((opts?: { prompt?: string }) => {
          lastPrompt = opts?.prompt
          if (opts?.prompt === '') {
            config.callback({
              access_token: 'ya29.renewed_token_67890',
              expires_in: 3600,
              token_type: 'Bearer',
              scope: GIS_DEFAULT_SCOPES.join(' '),
            })
          }
        }),
      }
    })

    // Setup initial session
    useRuntimeStore
      .getState()
      .setAuth(
        'ya29.initial_token_123',
        'aang@air-temple.org',
        'Aang Avatar',
        undefined,
        3600,
      )

    // Trigger silent refresh directly
    const session = await gisAuthService.refreshTokenSilent()

    expect(lastPrompt).toBe('')
    expect(session.accessToken).toBe('ya29.renewed_token_67890')
    expect(useRuntimeStore.getState().oauthToken).toBe('ya29.renewed_token_67890')
  })

  it('supports seamless user account switching with select_account prompt', async () => {
    let lastPrompt: string | undefined

    mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
      return {
        requestAccessToken: vi.fn((opts?: { prompt?: string }) => {
          lastPrompt = opts?.prompt
          config.callback({
            access_token: 'ya29.switched_account_token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: GIS_DEFAULT_SCOPES.join(' '),
          })
        }),
      }
    })

    // Mock fetch for second user
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          sub: '987654321',
          name: 'Katara of the Water Tribe',
          email: 'katara@water-tribe.org',
          picture: 'https://lh3.googleusercontent.com/katara.png',
        }),
      }),
    )

    const session = await gisAuthService.switchAccount()

    expect(lastPrompt).toBe('select_account')
    expect(session.accessToken).toBe('ya29.switched_account_token')
    expect(session.userEmail).toBe('katara@water-tribe.org')
    expect(session.userName).toBe('Katara of the Water Tribe')

    const state = useRuntimeStore.getState()
    expect(state.oauthToken).toBe('ya29.switched_account_token')
    expect(state.userEmail).toBe('katara@water-tribe.org')
  })

  it('revokes token, aborts active streams, and purges volatile RAM upon sign-out', async () => {
    // 1. Setup authenticated state
    useRuntimeStore
      .getState()
      .setAuth(
        'ya29.token_to_revoke',
        'sokka@water-tribe.org',
        'Sokka',
        undefined,
        3600,
      )

    const abortController = new AbortController()
    let abortFired = false
    abortController.signal.addEventListener('abort', () => {
      abortFired = true
    })
    useRuntimeStore.getState().setActiveAbortController(abortController)

    expect(gisAuthService.isAuthenticated()).toBe(true)
    expect(gisAuthService.getToken()).toBe('ya29.token_to_revoke')

    // 2. Perform sign out
    await gisAuthService.signOut()

    // 3. Verify revocation call
    expect(mockRevoke).toHaveBeenCalledWith('ya29.token_to_revoke', expect.any(Function))

    // 4. Verify stream abort
    expect(abortFired).toBe(true)

    // 5. Verify volatile store is purged
    const state = useRuntimeStore.getState()
    expect(state.oauthToken).toBeNull()
    expect(state.userEmail).toBeNull()
    expect(state.userName).toBeNull()
    expect(state.userAvatar).toBeNull()
    expect(state.tokenExpiresAt).toBeNull()
    expect(state.activeAbortController).toBeNull()
    expect(gisAuthService.isAuthenticated()).toBe(false)
    expect(gisAuthService.getToken()).toBeNull()
  })

  it('accurately calculates remaining TTL seconds', () => {
    const ttlSeconds = 1200
    useRuntimeStore
      .getState()
      .setAuth('ya29.ttl_token', 'toph@earth-rumble.org', 'Toph', undefined, ttlSeconds)

    const remaining = gisAuthService.getRemainingTTLSeconds()
    expect(remaining).toBeGreaterThan(1190)
    expect(remaining).toBeLessThanOrEqual(1200)
  })

  it('performs contextual step-up authorization with include_granted_scopes: true', async () => {
    let capturedOverride: any

    mockInitTokenClient.mockImplementation((config: GoogleTokenClientConfig) => {
      capturedConfig = config
      return {
        requestAccessToken: vi.fn((override?: any) => {
          capturedOverride = override
          const response: GoogleTokenResponse = {
            access_token: 'ya29.elevated_step_up_token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope:
              'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/devstorage.read_only https://www.googleapis.com/auth/cloud-platform',
          }
          config.callback(response)
        }),
      }
    })

    const session = await gisAuthService.requestElevatedScopes([
      'https://www.googleapis.com/auth/cloud-platform',
    ])

    expect(session.accessToken).toBe('ya29.elevated_step_up_token')
    expect(capturedOverride).toBeDefined()
    expect(capturedOverride.scope).toBe('https://www.googleapis.com/auth/cloud-platform')
    expect(capturedOverride.include_granted_scopes).toBe(true)
    expect(capturedOverride.prompt).toBe('consent')

    expect(gisAuthService.hasElevatedScopes()).toBe(true)
    expect(gisAuthService.hasScope('https://www.googleapis.com/auth/cloud-platform')).toBe(true)
    expect(gisAuthService.getGrantedScopes()).toContain(
      'https://www.googleapis.com/auth/cloud-platform',
    )
  })
})
