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
    useRuntimeStore.getState().setDemoMode(false)
    useToastStore.setState({ toasts: [] })
    vi.restoreAllMocks()
  })

  it('Scenario 1: Silent reload restoration bypasses onboarding wizard directly into workspace', async () => {
    // 1. Setup persistent session hints simulating a returning user
    usePersistentStore.getState().setHasCompletedOnboarding(true)
    usePersistentStore.getState().setSavedProjectId('client-media-prod-2026')
    usePersistentStore.getState().setSavedBucketName('gs://partner-raw-master-archives-2026')
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
    usePersistentStore.getState().setSavedBucketName('gs://partner-raw-master-archives-2026')
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
    expect(within(card).getByText(/gs:\/\/partner-raw-master-archives-2026/i)).toBeInTheDocument()

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
    expect(screen.getByText(/Connect to Google Cloud Storage/i)).toBeInTheDocument()
    expect(screen.getByText(/Launch Connection Wizard/i)).toBeInTheDocument()

    // 3. User clicks Launch Connection Wizard
    const user = userEvent.setup()
    await user.click(screen.getByText(/Launch Connection Wizard/i))

    // 4. Onboarding wizard modal opens
    expect(screen.getByText(/Client GCP Connection & Onboarding Wizard/i)).toBeInTheDocument()

    unmount()
  })
})

