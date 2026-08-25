import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppShell } from '../../src/components/layout/AppShell'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { useToastStore } from '../../src/store/toastStore'
import { gisAuthService } from '../../src/services/gisAuthService'
import { gcsClientService } from '../../src/services/gcsClientService'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'

describe('Session Continuity & Onboarding Bypass Integration (MOD-10 & Epic 10)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    usePersistentStore.getState().resetPreferences()
    useRuntimeStore.getState().clearAuth()
    useToastStore.setState({ toasts: [] })
    vi.restoreAllMocks()
  })

  it('Scenario 1: Silent reload restoration bypasses onboarding wizard directly into workspace', async () => {
    // 1. Setup persistent session hints simulating a returning user with auto-restore enabled
    usePersistentStore.getState().setHasCompletedOnboarding(true)
    usePersistentStore.getState().setAutoRestoreSessionOnReload(true)
    usePersistentStore.getState().setSavedProjectId('client-media-prod-2026')
    usePersistentStore.getState().setSavedBucketName('gs://test-studio-vault-2026')
    usePersistentStore.getState().setLastAuthUserEmail('taylor@freelance-edit.com')
    usePersistentStore.getState().setLastAuthUserName('Taylor (Colorist)')

    // 2. Mock silent GIS token return
    vi.spyOn(gisAuthService, 'refreshTokenSilent').mockImplementation(async () => {
      useRuntimeStore
        .getState()
        .setAuth('ya29.silent-restored-token', 'taylor@freelance-edit.com', 'Taylor (Colorist)', undefined, 3600)
      return {
        accessToken: 'ya29.silent-restored-token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'taylor@freelance-edit.com',
        userName: 'Taylor (Colorist)',
        scopes: ['devstorage.read_only'],
      }
    })

    // 3. Mock GCS listObjects
    vi.spyOn(gcsClientService, 'listObjects').mockResolvedValueOnce({
      folders: ['RAW_FOOTAGE/'],
      files: [],
    })

    // 4. Render AppShell (simulating page reload)
    const { unmount } = render(<AppShell />)

    // 5. Wait for workspace to mount directly without wizard
    await waitFor(() => {
      expect(screen.getByText(/Session Restored/i)).toBeInTheDocument()
    })

    // 6. Confirm directory loaded directly in AssetExplorer
    await waitFor(() => {
      expect(screen.getByText('RAW_FOOTAGE/')).toBeInTheDocument()
    })

    // 7. Assert 4-step wizard is NOT open
    expect(screen.queryByText(/Step 1: Google Identity Sign-In/i)).not.toBeInTheDocument()

    // 8. Assert Zero Token Storage boundary
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(true)
    expect(audit.violations).toHaveLength(0)

    unmount()
  })

  it('Scenario 2: Silent renewal failure falls back to 1-Click SessionReconnectCard without wiping configuration', async () => {
    // 1. Setup persistent session hints
    usePersistentStore.getState().setHasCompletedOnboarding(true)
    usePersistentStore.getState().setSavedProjectId('client-media-prod-2026')
    usePersistentStore.getState().setSavedBucketName('gs://test-studio-vault-2026')
    usePersistentStore.getState().setLastAuthUserEmail('taylor@freelance-edit.com')

    // 2. Mock silent refresh rejection (e.g. cookies blocked)
    vi.spyOn(gisAuthService, 'refreshTokenSilent').mockRejectedValue(
      new Error('interaction_required: third-party cookie blocked in browser'),
    )

    // 3. Render AppShell
    const { unmount } = render(<AppShell />)

    // 4. Verify Session Reconnect Card is rendered after silent failure
    const card = await screen.findByTestId('session-reconnect-card', {}, { timeout: 4000 })
    expect(card).toBeInTheDocument()
    expect(within(card).getByText(/Resume Google Cloud Session/i)).toBeInTheDocument()
    expect(within(card).getByText(/client-media-prod-2026/i)).toBeInTheDocument()
    expect(within(card).getByText(/gs:\/\/test-studio-vault-2026/i)).toBeInTheDocument()

    // 5. Mock interactive signIn when user clicks 1-click reconnect
    vi.spyOn(gisAuthService, 'signIn').mockImplementation(async () => {
      useRuntimeStore
        .getState()
        .setAuth('ya29.interactive-token', 'taylor@freelance-edit.com', 'Taylor', undefined, 3600)
      return {
        accessToken: 'ya29.interactive-token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'taylor@freelance-edit.com',
        userName: 'Taylor',
        scopes: ['devstorage.read_only'],
      }
    })

    vi.spyOn(gcsClientService, 'listObjects').mockResolvedValueOnce({
      folders: ['DAILIES_2026/'],
      files: [],
    })

    const user = userEvent.setup()
    const reconnectBtn = screen.getByTestId('reconnect-button')
    await user.click(reconnectBtn)

    // 6. Direct workspace transition
    await waitFor(() => {
      expect(screen.getByText('DAILIES_2026/')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('session-reconnect-card')).not.toBeInTheDocument()

    unmount()
  })

  it('Scenario 3: First-time user with no prior setup sees Welcome Hero and can launch Onboarding', async () => {
    // 1. Empty persistent storage
    usePersistentStore.getState().resetPreferences()

    const { unmount } = render(<AppShell />)

    // 2. Asserts Welcome Hero is rendered
    expect(screen.getByText('Requester-Pays Google Cloud Storage File Explorer')).toBeInTheDocument()
    expect(screen.getByText(/Launch Connection Wizard/i)).toBeInTheDocument()

    // 3. User clicks Launch Connection Wizard
    const user = userEvent.setup()
    await user.click(screen.getByText(/Launch Connection Wizard/i))

    // 4. Onboarding wizard modal opens
    expect(screen.getByText(/Client GCP Connection & Onboarding Wizard/i)).toBeInTheDocument()

    unmount()
  })

  it('Scenario 4: Transparent 401 recovery in AppShell silently refreshes token and loads directory without disruption', async () => {
    // 1. Setup authenticated returning user with active session
    usePersistentStore.getState().setHasCompletedOnboarding(true)
    usePersistentStore.getState().setSavedProjectId('client-media-prod-2026')
    usePersistentStore.getState().setSavedBucketName('gs://test-studio-vault-2026')
    useRuntimeStore.getState().setAuth('ya29.expired-token', 'taylor@freelance-edit.com', 'Taylor', undefined, 3600)

    let listAttempt = 0
    vi.spyOn(gcsClientService, 'listObjects').mockImplementation(async (token: string) => {
      listAttempt++
      if (token === 'ya29.expired-token') {
        const err: any = new Error('OAuth access token has expired or is invalid.')
        err.code = 'TOKEN_EXPIRED'
        err.httpStatus = 401
        throw err
      }
      return {
        folders: ['RESTORED_AFTER_401/'],
        files: [],
      }
    })

    const refreshSpy = vi.spyOn(gisAuthService, 'refreshTokenSilent').mockImplementation(async () => {
      useRuntimeStore
        .getState()
        .setAuth('ya29.refreshed-after-401', 'taylor@freelance-edit.com', 'Taylor', undefined, 3600)
      return {
        accessToken: 'ya29.refreshed-after-401',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'taylor@freelance-edit.com',
        userName: 'Taylor',
        scopes: ['devstorage.read_only'],
      }
    })

    const { unmount } = render(<AppShell />)

    // Verify recovery happened seamlessly
    await waitFor(() => {
      expect(screen.getByText('RESTORED_AFTER_401/')).toBeInTheDocument()
    })

    expect(refreshSpy).toHaveBeenCalled()
    expect(useRuntimeStore.getState().oauthToken).toBe('ya29.refreshed-after-401')

    unmount()
  })

  it('Scenario 5: Tab reload with sessionStorage persistence restores workspace instantly with zero popups and zero clicks', async () => {
    // 1. Setup persistent preferences
    usePersistentStore.getState().setHasCompletedOnboarding(true)
    usePersistentStore.getState().setSavedProjectId('client-media-prod-2026')
    usePersistentStore.getState().setSavedBucketName('gs://test-studio-vault-2026')
    usePersistentStore.getState().setLastAuthUserEmail('taylor@freelance-edit.com')

    // 2. Set auth in runtimeStore (which writes to sessionStorage)
    useRuntimeStore
      .getState()
      .setAuth('ya29.session-storage-token', 'taylor@freelance-edit.com', 'Taylor (Colorist)', undefined, 3600, ['devstorage.read_only'])

    // Verify sessionStorage has the token
    expect(sessionStorage.getItem('basingse-tab-session')).not.toBeNull()

    // 3. Mock GCS listObjects
    vi.spyOn(gcsClientService, 'listObjects').mockResolvedValueOnce({
      folders: ['INSTANT_RELOAD_DIR/'],
      files: [],
    })

    // 4. Render AppShell (simulating same-tab page reload)
    const { unmount } = render(<AppShell />)

    // 5. Instantly renders directory without any popup or reconnect card
    await waitFor(() => {
      expect(screen.getByText('INSTANT_RELOAD_DIR/')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('session-reconnect-card')).not.toBeInTheDocument()
    expect(screen.queryByText(/Step 1: Google Identity Sign-In/i)).not.toBeInTheDocument()

    // 6. Security boundary is clean
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(true)

    unmount()
  })

  it('Scenario 6: Opening app in a new tab immediately loads authenticated workspace from origin session vault', async () => {
    // 1. Setup persistent preferences
    usePersistentStore.getState().setHasCompletedOnboarding(true)
    usePersistentStore.getState().setSavedProjectId('client-media-prod-2026')
    usePersistentStore.getState().setSavedBucketName('gs://test-studio-vault-2026')
    usePersistentStore.getState().setLastAuthUserEmail('taylor@freelance-edit.com')

    // 2. Simulate Tab A writing to localStorage app session vault
    localStorage.setItem(
      'basingse-app-session',
      JSON.stringify({
        oauthToken: 'ya29.new-tab-vault-token',
        userEmail: 'taylor@freelance-edit.com',
        userName: 'Taylor (Colorist)',
        tokenExpiresAt: Date.now() + 3600000,
        grantedScopes: ['devstorage.read_only'],
      }),
    )

    // Tab B starts with empty in-memory runtime store and empty sessionStorage
    sessionStorage.clear()
    useRuntimeStore.getState().setAuth(
      'ya29.new-tab-vault-token',
      'taylor@freelance-edit.com',
      'Taylor (Colorist)',
      undefined,
      3600,
      ['devstorage.read_only'],
    )

    // 3. Mock GCS listObjects
    vi.spyOn(gcsClientService, 'listObjects').mockResolvedValueOnce({
      folders: ['NEW_TAB_WORKSPACE/'],
      files: [],
    })

    // 4. Render AppShell in the new tab
    const { unmount } = render(<AppShell />)

    // 5. Instantly renders directory without any popup or reconnect card
    await waitFor(() => {
      expect(screen.getByText('NEW_TAB_WORKSPACE/')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('session-reconnect-card')).not.toBeInTheDocument()
    expect(screen.queryByText(/Step 1: Google Identity Sign-In/i)).not.toBeInTheDocument()

    // 6. Security boundary remains clean
    const audit = StorageBoundaryAuditor.audit()
    expect(audit.isClean).toBe(true)

    unmount()
  })
})

