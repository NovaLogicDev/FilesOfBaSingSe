import { describe, it, expect, beforeEach } from 'vitest'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'
import { resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F1: GIS Auth & In-Memory Token Isolation', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('stores OAuth 2.0 access token and profile strictly in volatile runtime RAM', () => {
    const mockToken = 'ya29.a0AfH6SMB_live_sample_token_2026'
    const email = 'editor@basingse-post.com'
    const name = 'Toph Beifong (VFX Lead)'
    const avatar = 'https://avatars.example.com/toph.jpg'
    const ttlSeconds = 3600

    useRuntimeStore.getState().setAuthSession(mockToken, email, name, avatar, ttlSeconds)

    const state = useRuntimeStore.getState()
    expect(state.oauthToken).toBe(mockToken)
    expect(state.userEmail).toBe(email)
    expect(state.userName).toBe(name)
    expect(state.userAvatar).toBe(avatar)
    expect(state.tokenExpiresAt).toBeGreaterThan(Date.now())
  })

  it('proves zero-persistence: persistent localStorage client preferences contain zero token data', () => {
    const mockToken = 'ya29.a0AfH6SMB_secret_access_token'
    useRuntimeStore.getState().setAuthSession(mockToken, 'sokka@water-tribe-films.com', 'Sokka', undefined, 1800)

    // Trigger persistent store operation
    usePersistentStore.getState().setSavedProjectId('client-media-corp')
    usePersistentStore.getState().setSavedBucketName('gs://production-vault')

    // Audit persistent storage boundaries
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(true)
    expect(audit.violations).toHaveLength(0)

    // Inspect raw localStorage client preferences: must never leak token
    const prefs = localStorage.getItem('basingse-media-client-prefs')
    if (prefs) {
      expect(prefs).not.toContain(mockToken)
      expect(prefs).not.toContain('oauthToken')
      expect(prefs).not.toContain('ya29.')
    }
  })

  it('purges RAM credentials immediately upon sign-out and aborts active controller', () => {
    const mockToken = 'ya29.a0AfH6SMB_to_be_purged'
    useRuntimeStore.getState().setAuthSession(mockToken, 'zuko@fire-nation-stems.com', 'Zuko')

    const abortController = new AbortController()
    let abortFired = false
    abortController.signal.addEventListener('abort', () => {
      abortFired = true
    })
    useRuntimeStore.getState().setActiveAbortController(abortController)

    // Verify set
    expect(useRuntimeStore.getState().oauthToken).toBe(mockToken)
    expect(useRuntimeStore.getState().activeAbortController).toBe(abortController)

    // Execute sign out / clear
    useRuntimeStore.getState().clearAuthSession()

    const clearedState = useRuntimeStore.getState()
    expect(clearedState.oauthToken).toBeNull()
    expect(clearedState.userEmail).toBeNull()
    expect(clearedState.userName).toBeNull()
    expect(clearedState.userAvatar).toBeNull()
    expect(clearedState.tokenExpiresAt).toBeNull()
    expect(clearedState.activeAbortController).toBeNull()
    expect(abortFired).toBe(true)
  })

  it('accurately calculates remaining token TTL and detects pending expiration', () => {
    const ttlSeconds = 600 // 10 minutes
    const beforeSet = Date.now()
    useRuntimeStore.getState().setAuthSession('ya29.sample', 'katara@south-pole.org', 'Katara', undefined, ttlSeconds)
    const afterSet = Date.now()

    const expiresAt = useRuntimeStore.getState().tokenExpiresAt!
    expect(expiresAt).toBeGreaterThanOrEqual(beforeSet + ttlSeconds * 1000)
    expect(expiresAt).toBeLessThanOrEqual(afterSet + ttlSeconds * 1000)

    const remainingSeconds = Math.round((expiresAt - Date.now()) / 1000)
    expect(remainingSeconds).toBeGreaterThan(590)
    expect(remainingSeconds).toBeLessThanOrEqual(600)
  })

  it('supports seamless user account switching without retaining previous identity', () => {
    // Sign in Account 1
    useRuntimeStore.getState().setAuthSession('ya29.token_user_1', 'user1@studio.com', 'User One')
    expect(useRuntimeStore.getState().userEmail).toBe('user1@studio.com')

    // Switch to Account 2
    useRuntimeStore.getState().setAuthSession('ya29.token_user_2', 'user2@studio.com', 'User Two')
    const state2 = useRuntimeStore.getState()
    expect(state2.oauthToken).toBe('ya29.token_user_2')
    expect(state2.userEmail).toBe('user2@studio.com')
    expect(state2.userName).toBe('User Two')
  })

  it('detects violations when forbidden tokens are inadvertently placed in storage', () => {
    // Artificially inject a leaked token into localStorage to test auditor enforcement
    localStorage.setItem('leaked_session', JSON.stringify({ token: 'ya29.leaked_token_payload' }))
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(false)
    expect(audit.violations.length).toBeGreaterThan(0)
    expect(audit.violations[0]).toContain('leaked_session')

    // Test emergency purge
    StorageBoundaryAuditor.emergencyPurge()
    expect(localStorage.getItem('leaked_session')).toBeNull()
    expect(StorageBoundaryAuditor.audit().isClean).toBe(true)
  })
})
