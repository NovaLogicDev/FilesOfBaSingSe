import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  TrustSafetyEngine,
  trustSafetyEngine,
} from '../../src/engines/trustSafety'
import {
  GIS_BASE_SCOPES,
  GIS_ELEVATED_SCOPES,
} from '../../src/types/auth'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { gisAuthService } from '../../src/services/gisAuthService'

describe('TrustSafetyEngine (Engine 12) - Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useRuntimeStore.getState().clearAuth()
  })

  it('provides singleton instance and correct scope constants', () => {
    const engine = TrustSafetyEngine.getInstance()
    expect(engine).toBe(trustSafetyEngine)

    const baseScopes = engine.getBaseScopes()
    expect(baseScopes).toEqual([...GIS_BASE_SCOPES])
    expect(baseScopes).toContain('https://www.googleapis.com/auth/devstorage.read_only')
    expect(baseScopes).toContain('openid')
    expect(baseScopes).not.toContain('https://www.googleapis.com/auth/cloud-platform')

    const elevatedScopes = engine.getElevatedScopes()
    expect(elevatedScopes).toEqual([...GIS_ELEVATED_SCOPES])
    expect(elevatedScopes).toContain('https://www.googleapis.com/auth/cloud-platform')
  })

  it('evaluates scope status according to Principle of Least Privilege', () => {
    // 1. Minimal base scopes only -> Compliant
    const baseOnly = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/devstorage.read_only',
    ]
    const status1 = trustSafetyEngine.evaluateScopeStatus(baseOnly)
    expect(status1.hasBaseScopes).toBe(true)
    expect(status1.hasElevatedScopes).toBe(false)
    expect(status1.isLeastPrivilegeCompliant).toBe(true)

    // 2. Base + Elevated scopes -> Valid, but has elevated privileges
    const basePlusElevated = [...baseOnly, 'https://www.googleapis.com/auth/cloud-platform']
    const status2 = trustSafetyEngine.evaluateScopeStatus(basePlusElevated)
    expect(status2.hasBaseScopes).toBe(true)
    expect(status2.hasElevatedScopes).toBe(true)
    expect(status2.isLeastPrivilegeCompliant).toBe(false)

    // 3. Incomplete base scopes
    const incomplete = ['openid', 'https://www.googleapis.com/auth/userinfo.email']
    const status3 = trustSafetyEngine.evaluateScopeStatus(incomplete)
    expect(status3.hasBaseScopes).toBe(false)
    expect(status3.isLeastPrivilegeCompliant).toBe(false)
  })

  it('evaluates current runtime store scopes accurately', () => {
    useRuntimeStore.getState().setAuth(
      'ya29.test_token',
      'toph@earth-rumble.org',
      'Toph',
      undefined,
      3600,
      [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/devstorage.read_only',
      ],
    )

    const status = trustSafetyEngine.getCurrentScopeStatus()
    expect(status.hasBaseScopes).toBe(true)
    expect(status.hasElevatedScopes).toBe(false)
    expect(status.isLeastPrivilegeCompliant).toBe(true)
  })

  it('coordinates step-up consent through gisAuthService', async () => {
    const mockSession = {
      accessToken: 'ya29.step_up_token',
      expiresIn: 3600,
      tokenExpiresAt: Date.now() + 3600000,
      userEmail: 'toph@earth-rumble.org',
      userName: 'Toph',
      scopes: [
        'openid',
        'https://www.googleapis.com/auth/devstorage.read_only',
        'https://www.googleapis.com/auth/cloud-platform',
      ],
    }

    const stepUpSpy = vi
      .spyOn(gisAuthService, 'requestElevatedScopes')
      .mockResolvedValue(mockSession)

    const result = await trustSafetyEngine.requestStepUpConsent({
      reason: 'PROJECT_DISCOVERY',
    })

    expect(stepUpSpy).toHaveBeenCalledTimes(1)
    expect(result.granted).toBe(true)
    expect(result.session).toEqual(mockSession)
  })

  it('gracefully handles step-up consent rejection', async () => {
    vi.spyOn(gisAuthService, 'requestElevatedScopes').mockRejectedValue({
      code: 'ACCESS_DENIED',
      message: 'User closed the consent window.',
    })

    const result = await trustSafetyEngine.requestStepUpConsent({
      reason: 'PROJECT_CREATION',
    })

    expect(result.granted).toBe(false)
    expect(result.error?.message).toContain('User closed')
  })

  it('revokes session token via Google Identity endpoint when available', async () => {
    const mockRevoke = vi.fn((token: string, done: (res: { successful: boolean }) => void) => {
      done({ successful: true })
    })
    ;(window as any).google = {
      accounts: {
        oauth2: {
          revoke: mockRevoke,
        },
      },
    }

    const revoked = await trustSafetyEngine.revokeSessionToken('ya29.token_to_revoke')
    expect(mockRevoke).toHaveBeenCalledWith('ya29.token_to_revoke', expect.any(Function))
    expect(revoked).toBe(true)

    delete (window as any).google
  })
})
