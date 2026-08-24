import { describe, it, expect, beforeEach } from 'vitest'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'

describe('Storage Boundary & Security Isolation Auditor', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useRuntimeStore.getState().clearAuthSession()
  })

  it('stores active OAuth token in application session vault and NOT in user preferences', () => {
    // 1. Set session
    useRuntimeStore
      .getState()
      .setAuthSession('ya29.sample-ephemeral-access-token', 'taylor@freelance-edit.com')

    expect(useRuntimeStore.getState().oauthToken).toBe('ya29.sample-ephemeral-access-token')
    expect(useRuntimeStore.getState().userEmail).toBe('taylor@freelance-edit.com')

    // 2. Audit persistent storage
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(true)
    expect(audit.violations).toHaveLength(0)

    // 3. Inspect raw localStorage preferences: preferences must NEVER contain token
    const rawPrefs = localStorage.getItem('basingse-media-client-prefs')
    if (rawPrefs) {
      expect(rawPrefs).not.toContain('ya29.')
      expect(rawPrefs).not.toContain('oauthToken')
    }

    // 4. Inspect authorized app session
    const rawAppSession = localStorage.getItem('basingse-app-session')
    expect(rawAppSession).not.toBeNull()
    const parsed = JSON.parse(rawAppSession!)
    expect(parsed.oauthToken).toBe('ya29.sample-ephemeral-access-token')
  })

  it('detects violations if a prohibited unauthorized key or token is stored in localStorage', () => {
    localStorage.setItem('oauth_access_token', 'ya29.leaked-token')

    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(false)
    expect(audit.violations.length).toBeGreaterThan(0)
  })

  it('flushes application session from storage and aborts active streams on clearAuthSession()', () => {
    const abortController = new AbortController()
    let wasAborted = false
    abortController.signal.addEventListener('abort', () => {
      wasAborted = true
    })

    useRuntimeStore.getState().setAuthSession('token-123', 'editor@test.com')
    useRuntimeStore.getState().setActiveAbortController(abortController)

    expect(useRuntimeStore.getState().oauthToken).toBe('token-123')
    expect(localStorage.getItem('basingse-app-session')).not.toBeNull()

    // Clear session
    useRuntimeStore.getState().clearAuthSession()

    expect(useRuntimeStore.getState().oauthToken).toBeNull()
    expect(useRuntimeStore.getState().userEmail).toBeNull()
    expect(useRuntimeStore.getState().activeAbortController).toBeNull()
    expect(localStorage.getItem('basingse-app-session')).toBeNull()
    expect(wasAborted).toBe(true)
  })

  it('persists non-sensitive user preferences across sessions', () => {
    usePersistentStore.getState().setSavedProjectId('client-project-99')
    usePersistentStore.getState().setSavedBucketName('gs://my-cinematic-bucket')
    usePersistentStore.getState().addRecentBucket('gs://my-cinematic-bucket')

    expect(usePersistentStore.getState().savedProjectId).toBe('client-project-99')
    expect(usePersistentStore.getState().savedBucketName).toBe('gs://my-cinematic-bucket')
    expect(usePersistentStore.getState().recentBuckets).toContain('my-cinematic-bucket')
  })

  it('persists application session across all tabs and cleans up on clearAuthSession()', () => {
    useRuntimeStore
      .getState()
      .setAuth('ya29.tab-token', 'editor@test.com', 'Editor', undefined, 3600, ['devstorage.read_only'])

    // Check localStorage contains app session
    const appSessionRaw = localStorage.getItem('basingse-app-session')
    expect(appSessionRaw).not.toBeNull()
    const parsed = JSON.parse(appSessionRaw!)
    expect(parsed.oauthToken).toBe('ya29.tab-token')
    expect(parsed.userEmail).toBe('editor@test.com')

    // Boundary auditor should consider authorized app session clean
    expect(StorageBoundaryAuditor.audit().isClean).toBe(true)

    // Clear session
    useRuntimeStore.getState().clearAuth()
    expect(localStorage.getItem('basingse-app-session')).toBeNull()
  })

  it('detects violations if unauthorized keys or private keys are stored in sessionStorage', () => {
    sessionStorage.setItem('unauthorized_token_key', 'some-token')
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(false)
    expect(audit.violations.length).toBeGreaterThan(0)
    expect(audit.violations[0]).toContain('unauthorized_token_key')
  })
})
