import { PreflightCheckResult } from './gcs'

// --- Google Identity Services (GIS) OAuth 2.0 Types ---

export interface GoogleTokenClientConfig {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
  error_callback?: (error: GoogleTokenError) => void
  prompt?: string // 'none' | 'consent' | 'select_account' | ''
  hosted_domain?: string
  hint?: string
  enable_serial_consent?: boolean
}

export interface GoogleOverridableTokenClientConfig {
  prompt?: string
  hint?: string
  state?: string
  scope?: string
  include_granted_scopes?: boolean
  enable_serial_consent?: boolean
}

export interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: GoogleOverridableTokenClientConfig) => void
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number | string // seconds (e.g. 3599 or "3599")
  hd?: string
  prompt?: string
  token_type?: string
  scope?: string
  state?: string
  error?: string
  error_description?: string
  error_uri?: string
}

export interface GoogleTokenError {
  type: string // 'popup_closed' | 'popup_failed_to_open' | 'access_denied' | 'unknown'
  message?: string
}

export interface GoogleRevocationResponse {
  successful: boolean
  error?: string
}

// Global window extension for GIS
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
          revoke: (accessToken: string, done?: (res: GoogleRevocationResponse) => void) => void
          hasGrantedAllScopes: (
            tokenResponse: GoogleTokenResponse,
            firstScope: string,
            ...restScopes: string[]
          ) => boolean
          hasGrantedAnyScope: (
            tokenResponse: GoogleTokenResponse,
            firstScope: string,
            ...restScopes: string[]
          ) => boolean
        }
      }
    }
  }
}

// --- Google User Info API (GET https://www.googleapis.com/oauth2/v3/userinfo) ---

export interface GoogleUserInfo {
  sub: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
  email?: string
  email_verified?: boolean
  locale?: string
  hd?: string
}

// --- Normalized Internal Auth Session & Error Contracts ---

export interface AuthSession {
  accessToken: string
  expiresIn: number
  tokenExpiresAt: number // Epoch timestamp in ms
  userEmail: string
  userName: string
  userAvatar?: string
  scopes: string[]
}

export type AuthErrorCode =
  | 'POPUP_CLOSED'
  | 'ACCESS_DENIED'
  | 'NETWORK_ERROR'
  | 'PROFILE_FETCH_FAILED'
  | 'SCRIPT_LOAD_FAILED'
  | 'CLIENT_NOT_INITIALIZED'
  | 'UNKNOWN'

export interface AuthError {
  code: AuthErrorCode
  message: string
  rawError?: unknown
}

export interface GisAuthConfig {
  clientId?: string
  scopes?: string[]
  autoRefresh?: boolean
  refreshBufferSeconds?: number // Default: 300 (5 mins)
}

// --- Google OAuth Trust & Safety Scope Classifications (Module 14) ---

export const GIS_BASE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/devstorage.read_only',
] as const

export const GIS_ELEVATED_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
] as const

export type BaseOAuthScope = (typeof GIS_BASE_SCOPES)[number]
export type ElevatedOAuthScope = (typeof GIS_ELEVATED_SCOPES)[number]

export interface ScopePolicyStatus {
  hasBaseScopes: boolean
  hasElevatedScopes: boolean
  activeScopes: string[]
  isLeastPrivilegeCompliant: boolean
}

export interface StepUpConsentOptions {
  reason: 'PROJECT_DISCOVERY' | 'PROJECT_CREATION' | 'BILLING_CHECK'
  title?: string
  description?: string
}

export interface StepUpConsentResult {
  granted: boolean
  session?: AuthSession
  error?: AuthError
}

import { GCPProject, BillingStatus } from './gcp'

export type { GCPProject, BillingStatus }


export interface SessionProfile {
  email: string | null
  name: string | null
  avatar: string | null
}

export interface OnboardingState {
  step: 'auth' | 'project' | 'bucket' | 'verify' | 'ready'
  oauthToken: string | null
  userEmail: string | null
  userAvatar: string | null
  discoveredProjects: GCPProject[]
  selectedProjectId: string
  targetBucket: string
  preflight: PreflightCheckResult | null
  isLoading: boolean
  error: string | null
}
