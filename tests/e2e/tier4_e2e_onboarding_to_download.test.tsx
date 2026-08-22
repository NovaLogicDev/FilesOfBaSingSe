import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingWizardShell } from '../../src/components/onboarding/OnboardingWizardShell'
import { MockGCSService } from '../../src/services/mockGcsService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { DownloadProgressTelemetry } from '../../src/types'

describe('Tier 4 - Scenario 2: Full End-to-End Onboarding to Verified Direct-to-Disk Download', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
  })

  it('completes entire user journey: Sign In -> Project Discovery -> 4-Point Preflight -> Streaming -> CRC32c Parity', async () => {
    const onComplete = vi.fn()
    const onClose = vi.fn()

    // 1. Render Onboarding Wizard
    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={onClose} onComplete={onComplete} />,
    )

    expect(screen.getByText(/Client GCP Connection & Onboarding Wizard/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 1: Google Identity Sign-In/i)).toBeInTheDocument()

    // 2. Step 1: Sign in with Google
    const signInBtn = screen.getByRole('button', { name: /sign in with google/i })
    fireEvent.click(signInBtn)

    // Verify volatile RAM token stored and advanced to Step 2
    await waitFor(() => {
      expect(useRuntimeStore.getState().oauthToken).not.toBeNull()
    })
    expect(useRuntimeStore.getState().userEmail).toBe('taylor@freelance-edit.com')

    // 3. Step 2: Smart GCP Billing Project Setup
    await waitFor(() => {
      expect(screen.getByText(/Step 2: Smart GCP Billing Project Setup/i)).toBeInTheDocument()
    })

    // Switch to Auto-Create tab
    const autoCreateTab = screen.getByRole('button', { name: /Auto-Create Project/i })
    fireEvent.click(autoCreateTab)

    // Click Auto-Create Project
    const autoCreateBtn = screen.getByRole('button', { name: /1-Click Auto-Create Media Project/i })
    fireEvent.click(autoCreateBtn)

    await waitFor(() => {
      expect(usePersistentStore.getState().savedProjectId).toMatch(/^basingse-media-dl-\d{4}$/)
    })

    // Advance to Step 3
    const continueToBucketBtn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(continueToBucketBtn)

    // 4. Step 3: Target GCS Bucket
    await waitFor(() => {
      expect(screen.getByText(/Step 3: Target Google Cloud Storage Bucket/i)).toBeInTheDocument()
    })

    // Advance to Step 4
    const continueToPreflightBtn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(continueToPreflightBtn)

    // 5. Step 4: Run 4-Point Preflight Handshake
    await waitFor(() => {
      expect(screen.getByText(/Step 4: Automated 4-Point Preflight Handshake/i)).toBeInTheDocument()
    })

    const runPreflightBtn = screen.getByRole('button', { name: /run preflight test/i })
    fireEvent.click(runPreflightBtn)

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /finish setup & enter media portal/i })
      expect(btn).not.toBeDisabled()
    })

    // Click Finish Setup & Enter Media Portal
    const finishBtn = screen.getByRole('button', { name: /finish setup & enter media portal/i })
    fireEvent.click(finishBtn)

    expect(onComplete).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()

    // 6. Direct-to-Disk Stream Execution for 18.4GB MXF master reel
    const targetAsset = STUDIO_MASTER_DATASET[0]
    const streamTelemetryHistory: DownloadProgressTelemetry[] = []

    await MockGCSService.simulateStream(targetAsset, (progress) => {
      streamTelemetryHistory.push(progress)
      useRuntimeStore.getState().setDownloadProgress(progress)
    })

    // 7. Verify Stream Results and Checksum Parity
    expect(streamTelemetryHistory.length).toBeGreaterThan(1)
    const finalTelemetry = streamTelemetryHistory[streamTelemetryHistory.length - 1]

    expect(finalTelemetry.status).toBe('completed')
    expect(finalTelemetry.percentage).toBe(100)
    expect(finalTelemetry.loadedBytes).toBe(targetAsset.sizeBytes)
    expect(finalTelemetry.computedCrc32cBase64).toBe(targetAsset.crc32c)
    expect(finalTelemetry.computedCrc32cHex).toBe(targetAsset.crc32cHex)
    expect(finalTelemetry.integrityVerified).toBe(true)
    expect(finalTelemetry.memoryHeapMB).toBe(11.4) // Strictly bounded memory
  })
})
