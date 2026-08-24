import {
  GIS_BASE_SCOPES,
  GIS_ELEVATED_SCOPES,
  ScopePolicyStatus,
  StepUpConsentOptions,
  StepUpConsentResult,
} from '../types/auth'
import { gisAuthService } from '../services/gisAuthService'
import { ObservabilityService } from '../services/observability'
import { useRuntimeStore } from '../store/runtimeStore'

/**
 * Engine 12: Google API Trust & Safety, Incremental Authorization & Scope Governance Engine
 * Implements the Principle of Least Privilege, evaluates active session scope hygiene,
 * coordinates contextual step-up consent prompts, and handles token revocation.
 */
export class TrustSafetyEngine {
  private static instance: TrustSafetyEngine | null = null

  public static getInstance(): TrustSafetyEngine {
    if (!this.instance) {
      this.instance = new TrustSafetyEngine()
    }
    return this.instance
  }

  /**
   * Returns the minimal non-sensitive base scopes requested by default.
   */
  public getBaseScopes(): string[] {
    return [...GIS_BASE_SCOPES]
  }

  /**
   * Returns elevated scopes requiring contextual step-up authorization.
   */
  public getElevatedScopes(): string[] {
    return [...GIS_ELEVATED_SCOPES]
  }

  /**
   * Evaluates if a given list of granted scopes conforms to the Principle of Least Privilege.
   */
  public evaluateScopeStatus(grantedScopes: string[] = []): ScopePolicyStatus {
    const hasBase = GIS_BASE_SCOPES.every((scope) => grantedScopes.includes(scope))
    const hasElevated = GIS_ELEVATED_SCOPES.some((scope) => grantedScopes.includes(scope))

    return {
      hasBaseScopes: hasBase,
      hasElevatedScopes: hasElevated,
      activeScopes: grantedScopes,
      isLeastPrivilegeCompliant: hasBase && !hasElevated,
    }
  }

  /**
   * Evaluates the current active session in volatile runtime store.
   */
  public getCurrentScopeStatus(): ScopePolicyStatus {
    const activeScopes = useRuntimeStore.getState().grantedScopes || []
    return this.evaluateScopeStatus(activeScopes)
  }

  /**
   * Performs contextual step-up consent for elevated GCP scopes (e.g. cloud-platform).
   */
  public async requestStepUpConsent(
    options?: StepUpConsentOptions,
  ): Promise<StepUpConsentResult> {
    ObservabilityService.info('AUTH', 'Initiating Trust & Safety Step-Up Consent Flow', {
      reason: options?.reason || 'PROJECT_DISCOVERY',
    })

    try {
      const session = await gisAuthService.requestElevatedScopes()
      return {
        granted: true,
        session,
      }
    } catch (err: any) {
      ObservabilityService.warn('AUTH', 'Step-up authorization rejected or failed', {
        error: err?.message || String(err),
      })
      return {
        granted: false,
        error: err,
      }
    }
  }

  /**
   * Revokes token at Google OAuth endpoint upon user sign-out.
   */
  public async revokeSessionToken(token?: string): Promise<boolean> {
    const effectiveToken = token || useRuntimeStore.getState().oauthToken
    if (!effectiveToken) return true

    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2?.revoke) {
      return true
    }

    return new Promise<boolean>((resolve) => {
      try {
        window.google!.accounts.oauth2.revoke(effectiveToken, (res) => {
          resolve(res.successful)
        })
        setTimeout(() => resolve(true), 1500)
      } catch {
        resolve(false)
      }
    })
  }
}

export const trustSafetyEngine = TrustSafetyEngine.getInstance()
