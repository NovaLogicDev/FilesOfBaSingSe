import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useToastStore } from '../../src/store/toastStore'
import { ObservabilityService } from '../../src/services/observability'
import { gcpProjectService } from '../../src/services/gcpProjectService'

/**
 * Resets all volatile and persistent Zustand stores and observability logs to clean initial state.
 */
export function resetAllStores(): void {
  gcpProjectService.resetDemoProjects()

  // 1. Reset Runtime Store
  useRuntimeStore.setState({
    oauthToken: null,
    userEmail: null,
    userName: null,
    userAvatar: null,
    tokenExpiresAt: null,
    activeDownload: null,
    activeAbortController: null,
    isDownloadMinimized: false,
    isDemoMode: true,
    isRestoringSession: false,
    sessionRestorationError: null,
  })

  // 2. Reset Persistent Store
  usePersistentStore.setState({
    savedProjectId: 'demo-client-media-2026',
    savedBucketName: 'gs://partner-raw-master-archives-2026',
    recentBuckets: [],
    theme: 'dark',
    customPricing: {},
    isFreeTrialAccount: true,
    hasCompletedOnboarding: false,
    lastAuthUserEmail: null,
    lastAuthUserName: null,
    lastAuthTimestamp: null,
  })

  // 3. Reset Toast Store
  useToastStore.setState({
    toasts: [],
  })

  // 4. Clear Observability Logs
  ObservabilityService.clearLogs()

  // 5. Clear Storage
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {}
}

/**
 * Custom render helper wrapping components if needed
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { ...options })
}
