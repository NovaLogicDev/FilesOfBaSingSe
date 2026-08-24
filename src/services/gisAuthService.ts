import {
  AuthError,
  AuthErrorCode,
  AuthSession,
  GoogleTokenClient,
  GoogleTokenClientConfig,
  GoogleTokenError,
  GoogleTokenResponse,
  GoogleUserInfo,
} from '../types/auth'
import { useRuntimeStore } from '../store/runtimeStore'
import { usePersistentStore } from '../store/persistentStore'
import { ObservabilityService } from './observability'
import { StorageBoundaryAuditor } from './storageBoundary'

export const GIS_DEFAULT_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/devstorage.read_only',
]

export const DEFAULT_CLIENT_ID =
  (typeof import.meta !== 'undefined' &&
    ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string)) ||
  '1029384756-dummyclientid.apps.googleusercontent.com'

/**
 * Live Google Identity Services (GIS) OAuth 2.0 & In-Memory Token Service
 * Manages OAuth 2.0 popup flows, profile retrieval, silent background renewal,
 * account switching, token revocation, and zero-persistence memory purging.
 */
export class GISAuthService {
  private static instance: GISAuthService | null = null
  private tokenClient: GoogleTokenClient | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private clientId: string = DEFAULT_CLIENT_ID
  private scopes: string[] = [...GIS_DEFAULT_SCOPES]
  private refreshBufferSeconds: number = 300 // 5 minutes before expiry
  public userinfoEndpoint: string = 'https://www.googleapis.com/oauth2/v3/userinfo'

  // Pending resolver / rejecter for active popup requests
  private pendingAuthResolver: ((session: AuthSession) => void) | null = null
  private pendingAuthRejecter: ((error: AuthError) => void) | null = null

  constructor(clientId?: string, scopes?: string[]) {
    if (clientId) this.clientId = clientId
    if (scopes) this.scopes = scopes
  }

  public static getInstance(): GISAuthService {
    if (!GISAuthService.instance) {
      GISAuthService.instance = new GISAuthService()
    }
    return GISAuthService.instance
  }

  /**
   * Configures client ID and scopes.
   */
  public configure(config: {
    clientId?: string
    scopes?: string[]
    refreshBufferSeconds?: number
  }): void {
    if (config.clientId) this.clientId = config.clientId
    if (config.scopes) this.scopes = config.scopes
    if (config.refreshBufferSeconds !== undefined) {
      this.refreshBufferSeconds = config.refreshBufferSeconds
    }
    this.tokenClient = null // Invalidate client to re-initialize with new config
  }

  /**
   * Dynamically loads the Google Identity Services client library script if not already present.
   */
  public async loadGisScript(timeoutMs: number = 5000): Promise<void> {
    if (typeof window === 'undefined') return

    if (window.google?.accounts?.oauth2) {
      return
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false
      let checkInterval: ReturnType<typeof setInterval> | null = null
      let timer: ReturnType<typeof setTimeout> | null = null

      const cleanup = () => {
        if (checkInterval) {
          clearInterval(checkInterval)
          checkInterval = null
        }
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
      }

      timer = setTimeout(() => {
        cleanup()
        if (window.google?.accounts?.oauth2) {
          if (!settled) {
            settled = true
            resolve()
          }
        } else {
          if (!settled) {
            settled = true
            reject({
              code: 'SCRIPT_LOAD_FAILED' as AuthErrorCode,
              message: 'Timed out waiting for Google Identity Services (GIS) script to load.',
            })
          }
        }
      }, timeoutMs)

      // Fast polling interval in case script loads asynchronously without triggering our event listener
      checkInterval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          cleanup()
          if (!settled) {
            settled = true
            resolve()
          }
        }
      }, 50)

      // Check if script tag already exists in DOM
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src*="accounts.google.com/gsi/client"]',
      )

      if (existingScript) {
        if (window.google?.accounts?.oauth2) {
          cleanup()
          settled = true
          resolve()
          return
        }
        existingScript.addEventListener('load', () => {
          cleanup()
          if (!settled) {
            settled = true
            resolve()
          }
        })
        existingScript.addEventListener('error', () => {
          cleanup()
          if (!settled) {
            settled = true
            reject({
              code: 'SCRIPT_LOAD_FAILED' as AuthErrorCode,
              message: 'Failed to load Google Identity Services client script from CDN.',
            })
          }
        })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => {
        cleanup()
        if (!settled) {
          settled = true
          resolve()
        }
      }
      script.onerror = () => {
        cleanup()
        if (!settled) {
          settled = true
          reject({
            code: 'SCRIPT_LOAD_FAILED' as AuthErrorCode,
            message: 'Failed to load Google Identity Services client script from CDN.',
          })
        }
      }
      document.head.appendChild(script)
    })
  }

  /**
   * Initializes the GIS Token Client instance if not already initialized.
   */
  public initTokenClient(): GoogleTokenClient {
    if (this.tokenClient) {
      return this.tokenClient
    }

    if (
      typeof window === 'undefined' ||
      !window.google?.accounts?.oauth2?.initTokenClient
    ) {
      throw {
        code: 'CLIENT_NOT_INITIALIZED' as AuthErrorCode,
        message: 'Google Identity Services SDK is not available in current environment.',
      }
    }

    const config: GoogleTokenClientConfig = {
      client_id: this.clientId,
      scope: this.scopes.join(' '),
      callback: (response: GoogleTokenResponse) => {
        void this.handleTokenCallback(response)
      },
      error_callback: (error: GoogleTokenError) => this.handleTokenError(error),
    }

    this.tokenClient = window.google.accounts.oauth2.initTokenClient(config)
    return this.tokenClient
  }

  /**
   * Internal callback when Google OAuth responds with tokens.
   */
  private async handleTokenCallback(response: GoogleTokenResponse): Promise<void> {
    if (response.error) {
      const authError: AuthError = {
        code: response.error === 'access_denied' ? 'ACCESS_DENIED' : 'UNKNOWN',
        message: response.error_description || `OAuth error: ${response.error}`,
        rawError: response,
      }
      ObservabilityService.warn('AUTH', `OAuth token error: ${authError.message}`, {
        error: response.error,
      })
      if (this.pendingAuthRejecter) {
        this.pendingAuthRejecter(authError)
        this.pendingAuthResolver = null
        this.pendingAuthRejecter = null
      }
      return
    }

    const accessToken = response.access_token
    const expiresIn =
      typeof response.expires_in === 'string'
        ? parseInt(response.expires_in, 10)
        : response.expires_in || 3600

    let userProfile: GoogleUserInfo | null = null

    try {
      userProfile = await this.fetchUserProfile(accessToken)
    } catch (e) {
      ObservabilityService.warn(
        'AUTH',
        'Could not fetch Google userinfo profile; using fallback identity.',
        { error: String(e) },
      )
    }

    const email = userProfile?.email || 'user@google.com'
    const name = userProfile?.name || 'Google User'
    const avatar = userProfile?.picture

    const grantedScopesList = response.scope
      ? response.scope.split(' ').filter(Boolean)
      : [...this.scopes]

    // 1. Commit strictly to volatile in-memory store
    useRuntimeStore
      .getState()
      .setAuth(accessToken, email, name, avatar, expiresIn, grantedScopesList)

    // 2. Schedule silent background renewal
    this.scheduleTokenRefresh(expiresIn)

    // 3. Storage boundary verification
    StorageBoundaryAuditor.audit()

    // 4. Log structured observability audit event
    ObservabilityService.info('AUTH', 'GIS OAuth 2.0 authentication successful', {
      userEmail: email,
      expiresIn,
      scopes: response.scope || this.scopes.join(' '),
    })

    const session: AuthSession = {
      accessToken,
      expiresIn,
      tokenExpiresAt: Date.now() + expiresIn * 1000,
      userEmail: email,
      userName: name,
      userAvatar: avatar,
      scopes: grantedScopesList,
    }

    if (this.pendingAuthResolver) {
      this.pendingAuthResolver(session)
      this.pendingAuthResolver = null
      this.pendingAuthRejecter = null
    }
  }

  /**
   * Internal error callback when popup fails or is closed.
   */
  private handleTokenError(error: GoogleTokenError): void {
    const errCode: AuthErrorCode =
      error.type === 'popup_closed'
        ? 'POPUP_CLOSED'
        : error.type === 'access_denied'
        ? 'ACCESS_DENIED'
        : 'UNKNOWN'

    const authError: AuthError = {
      code: errCode,
      message:
        error.message ||
        (error.type === 'popup_closed'
          ? 'Google Sign-In popup was closed before completing authorization.'
          : `Google OAuth Error: ${error.type}`),
      rawError: error,
    }

    ObservabilityService.warn('AUTH', 'GIS OAuth token error', { error: error.type })

    if (this.pendingAuthRejecter) {
      this.pendingAuthRejecter(authError)
      this.pendingAuthResolver = null
      this.pendingAuthRejecter = null
    }
  }

  /**
   * Initiates interactive Google OAuth 2.0 popup sign-in.
   */
  public async signIn(options?: {
    prompt?: string
    selectAccount?: boolean
    hint?: string
  }): Promise<AuthSession> {
    try {
      await this.loadGisScript()
    } catch {
      throw {
        code: 'SCRIPT_LOAD_FAILED' as AuthErrorCode,
        message: 'Could not load Google Identity Services library.',
      }
    }

    const client = this.initTokenClient()

    const prompt =
      options?.prompt ?? (options?.selectAccount ? 'select_account' : 'consent')

    return new Promise<AuthSession>((resolve, reject) => {
      this.pendingAuthResolver = resolve
      this.pendingAuthRejecter = reject

      try {
        client.requestAccessToken({
          prompt,
          hint: options?.hint,
        })
      } catch (err) {
        this.pendingAuthResolver = null
        this.pendingAuthRejecter = null
        reject({
          code: 'UNKNOWN' as AuthErrorCode,
          message: err instanceof Error ? err.message : 'Failed to launch Google popup.',
          rawError: err,
        })
      }
    })
  }

  /**
   * Account switching: launches interactive popup with account selection prompt.
   */
  public async switchAccount(): Promise<AuthSession> {
    return this.signIn({ selectAccount: true, prompt: 'select_account' })
  }

  /**
   * Performs contextual step-up authorization for elevated GCP scopes (e.g. cloud-platform).
   * Appends include_granted_scopes: true to preserve existing base permissions.
   */
  public async requestElevatedScopes(
    elevatedScopes: string[] = ['https://www.googleapis.com/auth/cloud-platform'],
  ): Promise<AuthSession> {
    try {
      await this.loadGisScript()
    } catch {
      throw {
        code: 'SCRIPT_LOAD_FAILED' as AuthErrorCode,
        message: 'Could not load Google Identity Services library.',
      }
    }

    const client = this.initTokenClient()

    ObservabilityService.info(
      'AUTH',
      `Requesting elevated Google OAuth scopes via step-up consent: ${elevatedScopes.join(', ')}`,
    )

    return new Promise<AuthSession>((resolve, reject) => {
      this.pendingAuthResolver = resolve
      this.pendingAuthRejecter = reject

      try {
        client.requestAccessToken({
          scope: elevatedScopes.join(' '),
          include_granted_scopes: true,
          prompt: 'consent',
        })
      } catch (err) {
        this.pendingAuthResolver = null
        this.pendingAuthRejecter = null
        reject({
          code: 'UNKNOWN' as AuthErrorCode,
          message: err instanceof Error ? err.message : 'Step-up authorization failed.',
          rawError: err,
        })
      }
    })
  }

  /**
   * Checks whether the current active session has a specific scope granted.
   */
  public hasScope(scope: string): boolean {
    const scopes = useRuntimeStore.getState().grantedScopes || []
    return scopes.includes(scope)
  }

  /**
   * Checks whether the current session has elevated cloud-platform management scope.
   */
  public hasElevatedScopes(): boolean {
    return this.hasScope('https://www.googleapis.com/auth/cloud-platform')
  }

  /**
   * Returns list of currently granted scopes from runtime store.
   */
  public getGrantedScopes(): string[] {
    return useRuntimeStore.getState().grantedScopes || []
  }

  /**
   * Retrieves Google User Profile metadata via standard OpenID Connect endpoint.
   */
  public async fetchUserProfile(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
      const res = await fetch(this.userinfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        ObservabilityService.warn(
          'AUTH',
          `Failed to fetch user profile metadata: HTTP ${res.status}`,
        )
        return null
      }

      const data = await res.json()
      return {
        sub: data.sub,
        email: data.email,
        name: data.name,
        picture: data.picture,
        email_verified: data.email_verified,
      }
    } catch (err: any) {
      ObservabilityService.warn('AUTH', `User profile network error: ${err.message}`)
      return null
    }
  }

  /**
   * Schedules silent background token refresh ~5 minutes before expiration.
   */
  public scheduleTokenRefresh(
    expiresInSeconds: number,
    bufferSeconds: number = this.refreshBufferSeconds,
  ): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    // Calculate delay in ms, ensuring at least 10 seconds minimum delay
    const refreshDelayMs = Math.max(10, expiresInSeconds - bufferSeconds) * 1000

    this.refreshTimer = setTimeout(() => {
      this.refreshTokenSilent().catch((err) => {
        ObservabilityService.warn(
          'AUTH',
          'Automatic background token renewal attempt failed; will retry before expiration',
          { error: err instanceof Error ? err.message : String(err) },
        )
        // If renewal failed but token hasn't expired yet, retry before expiration
        const remainingTTL = this.getRemainingTTLSeconds()
        if (remainingTTL > 15) {
          const retryDelay = Math.min(30, Math.max(10, Math.floor(remainingTTL / 2)))
          this.scheduleTokenRefresh(remainingTTL, remainingTTL - retryDelay)
        }
      })
    }, refreshDelayMs)
  }

  /**
   * Performs silent token refresh via `prompt: ''` without user interaction.
   * Ensures GIS script is ready and provides user account hint to avoid disambiguation errors.
   */
  public async refreshTokenSilent(hint?: string): Promise<AuthSession> {
    try {
      await this.loadGisScript()
    } catch {
      throw {
        code: 'SCRIPT_LOAD_FAILED' as AuthErrorCode,
        message: 'Could not load Google Identity Services library.',
      }
    }

    const client = this.initTokenClient()
    const { userEmail } = useRuntimeStore.getState()
    const lastAuthUserEmail = usePersistentStore.getState().lastAuthUserEmail
    const effectiveHint = hint || userEmail || lastAuthUserEmail || undefined

    return new Promise<AuthSession>((resolve, reject) => {
      this.pendingAuthResolver = resolve
      this.pendingAuthRejecter = reject

      try {
        client.requestAccessToken({
          prompt: '',
          ...(effectiveHint ? { hint: effectiveHint } : {}),
        })
      } catch (err) {
        this.pendingAuthResolver = null
        this.pendingAuthRejecter = null
        reject({
          code: 'UNKNOWN' as AuthErrorCode,
          message:
            err instanceof Error ? err.message : 'Silent token renewal request failed.',
          rawError: err,
        })
      }
    })
  }

  /**
   * Proactively returns a valid access token.
   * If the current token is missing, expired, or expiring in less than 60 seconds,
   * attempts silent background renewal before returning.
   */
  public async getValidToken(): Promise<string | null> {
    const { oauthToken, tokenExpiresAt } = useRuntimeStore.getState()
    if (!oauthToken) return null

    if (tokenExpiresAt && tokenExpiresAt - Date.now() < 60000) {
      try {
        const session = await this.refreshTokenSilent()
        return session.accessToken
      } catch (err) {
        ObservabilityService.warn('AUTH', 'Proactive token refresh attempt failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return useRuntimeStore.getState().oauthToken
  }

  /**
   * Request access token interface contract required by PROJECT.md.
   */
  public async requestAccessToken(): Promise<{
    accessToken: string
    expiresIn: number
    userEmail: string
    userName: string
    userAvatar?: string
  }> {
    const session = await this.signIn()
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      userEmail: session.userEmail,
      userName: session.userName,
      userAvatar: session.userAvatar,
    }
  }

  /**
   * Returns remaining TTL of currently active token in seconds (or 0 if expired/absent).
   */
  public getRemainingTTLSeconds(): number {
    const tokenExpiresAt = useRuntimeStore.getState().tokenExpiresAt
    if (!tokenExpiresAt) return 0
    return Math.max(0, Math.round((tokenExpiresAt - Date.now()) / 1000))
  }

  /**
   * Checks if active token exists in volatile memory and is unexpired.
   */
  public isAuthenticated(): boolean {
    const { oauthToken, tokenExpiresAt } = useRuntimeStore.getState()
    if (!oauthToken) return false
    if (tokenExpiresAt && tokenExpiresAt <= Date.now()) return false
    return true
  }

  /**
   * Gets current access token from volatile memory.
   */
  public getToken(): string | null {
    return useRuntimeStore.getState().oauthToken
  }

  /**
   * Signs out: revokes token at Google endpoint, cancels background timers,
   * purges volatile RAM, and aborts any active streams.
   */
  public async signOut(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }

    const currentToken = useRuntimeStore.getState().oauthToken

    // Revoke token via Google Identity Services if available
    if (
      currentToken &&
      typeof window !== 'undefined' &&
      window.google?.accounts?.oauth2?.revoke
    ) {
      try {
        await new Promise<void>((resolve) => {
          window.google!.accounts.oauth2.revoke(currentToken, () => {
            resolve()
          })
          // Fallback resolve after 1s if revoke callback hangs
          setTimeout(resolve, 1000)
        })
      } catch (err) {
        ObservabilityService.warn('AUTH', 'Token revocation request failed', {
          error: String(err),
        })
      }
    }

    // Wipe volatile RAM memory and abort streams
    useRuntimeStore.getState().clearAuth()

    // Assert zero leakage in persistent storage
    StorageBoundaryAuditor.audit()

    ObservabilityService.info('AUTH', 'User signed out; volatile memory purged.')
  }
}

// Export singleton instance
export const gisAuthService = GISAuthService.getInstance()
