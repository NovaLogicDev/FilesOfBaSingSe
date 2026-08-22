/**
 * Session Lifecycle, Continuity & Onboarding Bypass Types (MOD-10)
 */

export interface SessionHint {
  hasCompletedOnboarding: boolean
  lastAuthUserEmail: string | null
  lastAuthUserName: string | null
  lastAuthTimestamp: number | null
  sessionContinuityEnabled: boolean
}

export interface SessionRestorationState {
  isRestoringSession: boolean
  restorationStatus: 'idle' | 'restoring' | 'restored' | 'interactive_required' | 'failed'
  restorationError: string | null
}

export interface SessionRestorationResult {
  restored: boolean
  requiresInteraction: boolean
  userEmail?: string
  userName?: string
  errorMessage?: string
}
