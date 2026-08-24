import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingWizardShell } from '../../src/components/onboarding/OnboardingWizardShell'
import { AppShell } from '../../src/components/layout/AppShell'
import { gisAuthService } from '../../src/services/gisAuthService'
import { gcpProjectService } from '../../src/services/gcpProjectService'
import { gcsClientService } from '../../src/services/gcsClientService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { resetAllStores, renderWithProviders } from '../helpers/testUtils'

describe('Trust & Safety, Scope Minimization & Privacy Integration (Epic 14)', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    usePersistentStore.setState({
      savedProjectId: '',
      savedBucketName: '',
      hasCompletedOnboarding: false,
    })
    useRuntimeStore.getState().clearAuth()
  })

  it('enforces least-privilege base scopes upon initial Google Sign-In', async () => {
    const signInSpy = vi.spyOn(gisAuthService, 'signIn').mockImplementation(async () => {
      useRuntimeStore
        .getState()
        .setAuth(
          'ya29.base_token_minimal',
          'editor@basingse.org',
          'Toph Beifong',
          undefined,
          3600,
          [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/devstorage.read_only',
          ],
        )
      return {
        accessToken: 'ya29.base_token_minimal',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'editor@basingse.org',
        userName: 'Toph Beifong',
        scopes: [
          'openid',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/devstorage.read_only',
        ],
      }
    })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Verify initial requested scopes card displays minimal scopes
    expect(screen.getByText(/devstorage\.read_only \(Minimal\)/i)).toBeInTheDocument()

    // Perform Sign In
    const signInBtn = screen.getByRole('button', { name: /Sign In with Google/i })
    fireEvent.click(signInBtn)

    await waitFor(() => {
      expect(signInSpy).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Toph Beifong')).toBeInTheDocument()
      expect(screen.getByText(/devstorage\.read_only \(Minimal\)/i)).toBeInTheDocument()
    })

    expect(gisAuthService.hasElevatedScopes()).toBe(false)
  })

  it('triggers contextual step-up consent when user clicks Auto-Detect or Auto-Create Project', async () => {
    // Session starts with minimal base scopes
    useRuntimeStore.getState().setAuth(
      'ya29.base_token',
      'editor@basingse.org',
      'Toph Beifong',
      undefined,
      3600,
      ['openid', 'https://www.googleapis.com/auth/devstorage.read_only'],
    )

    const stepUpSpy = vi.spyOn(gisAuthService, 'requestElevatedScopes').mockImplementation(async () => {
      useRuntimeStore.getState().setAuth(
        'ya29.merged_elevated_token',
        'editor@basingse.org',
        'Toph Beifong',
        undefined,
        3600,
        [
          'openid',
          'https://www.googleapis.com/auth/devstorage.read_only',
          'https://www.googleapis.com/auth/cloud-platform',
        ],
      )
      return {
        accessToken: 'ya29.merged_elevated_token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'editor@basingse.org',
        userName: 'Toph Beifong',
        scopes: [
          'openid',
          'https://www.googleapis.com/auth/devstorage.read_only',
          'https://www.googleapis.com/auth/cloud-platform',
        ],
      }
    })

    const listProjectsSpy = vi.spyOn(gcpProjectService, 'listProjects').mockResolvedValue([
      { projectId: 'earth-kingdom-media-prod', name: 'Earth Kingdom Media', lifecycleState: 'ACTIVE' },
    ])

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Navigate to Step 2
    fireEvent.click(screen.getByText(/2\. GCP Billing Project/i))

    // Click Auto-Detect My Project
    const autoDetectBtn = screen.getByRole('button', { name: /Auto-Detect My Project/i })
    fireEvent.click(autoDetectBtn)

    // Step-up consent modal should appear
    expect(screen.getByRole('dialog', { name: /GCP Project Automation Permission/i })).toBeInTheDocument()
    expect(screen.getByText(/cloud-platform/i)).toBeInTheDocument()

    // User confirms step-up consent
    const confirmBtn = screen.getByRole('button', { name: /Grant Permission with Google/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(stepUpSpy).toHaveBeenCalledTimes(1)
      expect(gisAuthService.hasElevatedScopes()).toBe(true)
      expect(listProjectsSpy).toHaveBeenCalled()
    })
  })

  it('allows complete manual project ID bypass with zero elevated permissions requested', async () => {
    // User signed in with minimal scopes only
    useRuntimeStore.getState().setAuth(
      'ya29.base_token',
      'editor@basingse.org',
      'Toph Beifong',
      undefined,
      3600,
      ['openid', 'https://www.googleapis.com/auth/devstorage.read_only'],
    )

    const stepUpSpy = vi.spyOn(gisAuthService, 'requestElevatedScopes')
    const preflightSpy = vi.spyOn(gcsClientService, 'run4PointPreflight').mockResolvedValue({
      oauthTokenValid: true,
      oauthExpiresInSeconds: 3600,
      bucketReachable: true,
      requesterPaysActive: true,
      iamViewerGranted: true,
      corsConfigured: true,
      steps: [
        { id: 'token', name: 'OAuth 2.0 Token Valid', description: '', status: 'passed' },
        { id: 'bucket', name: 'Requester-Pays Enforced', description: '', status: 'passed' },
        { id: 'iam', name: 'IAM Object Viewer Granted', description: '', status: 'passed' },
        { id: 'cors', name: 'CORS Preflight Headers OK', description: '', status: 'passed' },
      ],
    })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Navigate to Step 2
    fireEvent.click(screen.getByText(/2\. GCP Billing Project/i))

    // User types manual Project ID in the input
    const projectInput = screen.getByPlaceholderText(/e\.g\. client-prod-media-2026/i)
    fireEvent.change(projectInput, { target: { value: 'client-manual-project-2026' } })

    // Navigate to Step 3
    fireEvent.click(screen.getByText(/3\. Target Bucket/i))
    const bucketInput = screen.getByPlaceholderText(/gs:\/\/your-bucket-name/i)
    fireEvent.change(bucketInput, { target: { value: 'gs://earth-kingdom-archives' } })

    // Navigate to Step 4
    fireEvent.click(screen.getByText(/4\. Preflight/i))

    await waitFor(() => {
      expect(preflightSpy).toHaveBeenCalledWith(
        'ya29.base_token',
        'earth-kingdom-archives',
        'client-manual-project-2026',
        expect.any(Number),
      )
      expect(screen.getByRole('button', { name: /Finish Setup & Enter Media Portal/i })).not.toBeDisabled()
    })

    // Assert that stepUp was NEVER called throughout the entire manual flow!
    expect(stepUpSpy).not.toHaveBeenCalled()
    expect(gisAuthService.hasElevatedScopes()).toBe(false)
  })

  it('opens Privacy Policy modal from AppShell footer and allows viewing Google Limited Use statement', () => {
    renderWithProviders(<AppShell />)

    // Find and click footer Privacy Policy button
    const privacyFooterBtn = screen.getByRole('button', { name: /Privacy Policy & Google Trust/i })
    expect(privacyFooterBtn).toBeInTheDocument()

    fireEvent.click(privacyFooterBtn)

    // Modal opens
    expect(screen.getByRole('dialog', { name: /Privacy Policy & Google API Trust & Safety/i })).toBeInTheDocument()
    expect(screen.getByText(/Google API Services User Data Policy Compliance/i)).toBeInTheDocument()
    expect(screen.getByText(/Zero-Backend Client Execution/i)).toBeInTheDocument()

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /Close Privacy Policy/i })
    fireEvent.click(closeBtn)

    expect(screen.queryByRole('dialog', { name: /Privacy Policy & Google API Trust & Safety/i })).not.toBeInTheDocument()
  })
})
