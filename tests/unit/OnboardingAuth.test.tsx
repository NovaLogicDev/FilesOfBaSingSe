import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingWizardShell } from '../../src/components/onboarding/OnboardingWizardShell'
import { gisAuthService } from '../../src/services/gisAuthService'
import { gcpProjectService } from '../../src/services/gcpProjectService'
import { gcsClientService } from '../../src/services/gcsClientService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { resetAllStores, renderWithProviders } from '../helpers/testUtils'

describe('OnboardingWizardShell - GIS Auth & Step 2 Smart GCP Setup Flow', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    usePersistentStore.setState({
      savedProjectId: 'client-media-project-2026',
      savedBucketName: 'gs://partner-raw-master-archives-2026',
    })
    useRuntimeStore.setState({
      oauthToken: 'mock-oauth-token',
    })
  })

  it('renders Google Sign-In button on Step 1 when unauthenticated and blanks inputs', () => {
    useRuntimeStore.setState({
      oauthToken: null,
    })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    expect(screen.getByText(/Step 1: Google Identity Sign-In/i)).toBeInTheDocument()
    expect(screen.getByText(/Sign In with Google/i)).toBeInTheDocument()
  })

  it('triggers gisAuthService.signIn() when Sign In with Google is clicked', async () => {
    useRuntimeStore.setState({
      oauthToken: null,
    })

    const signInSpy = vi.spyOn(gisAuthService, 'signIn').mockImplementation(async () => {
      useRuntimeStore
        .getState()
        .setAuth(
          'ya29.sample_onboarding_token',
          'editor@basingse.org',
          'Toph Beifong',
          undefined,
          3600,
        )
      return {
        accessToken: 'ya29.sample_onboarding_token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'editor@basingse.org',
        userName: 'Toph Beifong',
        scopes: [],
      }
    })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    const signInButton = screen.getByText(/Sign In with Google/i)
    fireEvent.click(signInButton)

    await waitFor(() => {
      expect(signInSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('displays connected user card and allows account switching when authenticated', async () => {
    useRuntimeStore
      .getState()
      .setAuth(
        'ya29.existing_token',
        'iroh@tea-shop.org',
        'General Iroh',
        undefined,
        3600,
      )

    const switchSpy = vi.spyOn(gisAuthService, 'switchAccount').mockImplementation(async () => {
      useRuntimeStore
        .getState()
        .setAuth(
          'ya29.new_iroh_token',
          'iroh-master@tea-shop.org',
          'Uncle Iroh (Grand Lotus)',
          undefined,
          3600,
        )
      return {
        accessToken: 'ya29.new_iroh_token',
        expiresIn: 3600,
        tokenExpiresAt: Date.now() + 3600000,
        userEmail: 'iroh-master@tea-shop.org',
        userName: 'Uncle Iroh (Grand Lotus)',
        scopes: [],
      }
    })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    expect(screen.getByText('General Iroh')).toBeInTheDocument()
    expect(screen.getByText('iroh@tea-shop.org')).toBeInTheDocument()
    expect(screen.getByText(/Switch Account/i)).toBeInTheDocument()

    const switchButton = screen.getByText(/Switch Account/i)
    fireEvent.click(switchButton)

    await waitFor(() => {
      expect(switchSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('renders Step 2 with 3-tab choice architecture and allows switching tabs', async () => {
    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Navigate to Step 2
    fireEvent.click(screen.getByText(/2\. GCP Billing Project/i))

    expect(screen.getByText(/Step 2: Smart GCP Billing Project Setup/i)).toBeInTheDocument()
    expect(screen.getByText(/New to GCP \(\$300 Free\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Existing Projects/i)).toBeInTheDocument()
    expect(screen.getByText(/Auto-Create Project/i)).toBeInTheDocument()

    // Switch to New User tab
    fireEvent.click(screen.getByText(/New to GCP \(\$300 Free\)/i))
    expect(screen.getByText(/Google Cloud \$300 Free Trial Assistant/i)).toBeInTheDocument()
    expect(screen.getByText(/Open 60s Free Trial Signup/i)).toBeInTheDocument()
    expect(screen.getByText(/Auto-Detect My Project/i)).toBeInTheDocument()

    // Switch to Auto-Create tab
    fireEvent.click(screen.getByText(/Auto-Create Project/i))
    expect(screen.getByText(/Dedicated Media Project Auto-Provisioning/i)).toBeInTheDocument()
    expect(screen.getByText(/1-Click Auto-Create Media Project/i)).toBeInTheDocument()
  })

  it('blanks project selection on fresh login and triggers billing check only upon explicit project selection', async () => {
    const checkBillingSpy = vi.spyOn(gcpProjectService, 'checkBillingStatus').mockResolvedValue({
      projectId: 'novalogic-dev',
      billingAccountName: 'billingAccounts/0182A9',
      billingEnabled: true,
      hasActiveBilling: true,
    })

    vi.spyOn(gcpProjectService, 'listProjects').mockResolvedValue([
      { projectId: 'novalogic-dev', name: 'Novalogic Dev Project', lifecycleState: 'ACTIVE' },
      { projectId: 'avatar-media-prod', name: 'Avatar Media Production', lifecycleState: 'ACTIVE' },
    ])

    useRuntimeStore.setState({
      oauthToken: 'live-oauth-token',
    })
    usePersistentStore.setState({ savedProjectId: '' })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Navigate to Step 2
    fireEvent.click(screen.getByText(/2\. GCP Billing Project/i))

    await waitFor(() => {
      expect(screen.getByText(/Select a project from the dropdown above/i)).toBeInTheDocument()
    })

    // Initially when unselected, no billing check has run
    expect(checkBillingSpy).not.toHaveBeenCalled()
    expect(screen.queryByText(/Cloud Billing Status on/i)).not.toBeInTheDocument()

    // User explicitly chooses novalogic-dev from the dropdown
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'novalogic-dev' } })

    // Now billing check triggers
    await waitFor(() => {
      expect(checkBillingSpy).toHaveBeenCalledWith('live-oauth-token', 'novalogic-dev')
      expect(screen.getByText(/Cloud Billing Status on/i)).toBeInTheDocument()
      expect(screen.getByText(/Billing Linked \(Active Account\)/i)).toBeInTheDocument()
    })
  })

  it('displays API disabled diagnostic card when checkBillingStatus returns apiDisabled: true', async () => {
    vi.spyOn(gcpProjectService, 'checkBillingStatus').mockResolvedValue({
      projectId: 'test-api-disabled-proj',
      billingAccountName: '',
      billingEnabled: false,
      hasActiveBilling: false,
      apiDisabled: true,
      apiEnableUrl: 'https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=test-api-disabled-proj',
      warningMessage: 'Cloud Billing API is not enabled on this project.',
    })

    vi.spyOn(gcpProjectService, 'listProjects').mockResolvedValue([
      { projectId: 'test-api-disabled-proj', name: 'Test API Disabled Proj', lifecycleState: 'ACTIVE' },
    ])

    useRuntimeStore.setState({
      oauthToken: 'live-token-api-disabled',
    })
    usePersistentStore.setState({ savedProjectId: 'test-api-disabled-proj' })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Navigate to Step 2
    fireEvent.click(screen.getByText(/2\. GCP Billing Project/i))

    // Select the project
    const select = await screen.findByRole('combobox')
    fireEvent.change(select, { target: { value: 'test-api-disabled-proj' } })

    await waitFor(() => {
      expect(screen.getByText(/Cloud Billing API Disabled/i)).toBeInTheDocument()
      expect(screen.getByText(/Enable Cloud Billing API in Google Console/i)).toBeInTheDocument()
    })
  })

  it('signs user back out and purges volatile session when onboarding is cancelled before finish', async () => {
    const signOutSpy = vi.spyOn(gisAuthService, 'signOut').mockResolvedValue()

    useRuntimeStore.setState({
      oauthToken: 'live-token-to-cancel',
    })
    usePersistentStore.setState({
      savedProjectId: '',
      savedBucketName: '',
    })

    const closeHandler = vi.fn()
    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={closeHandler} onComplete={() => {}} />,
    )

    // Click Close (X button)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(signOutSpy).toHaveBeenCalledTimes(1)
      expect(closeHandler).toHaveBeenCalledTimes(1)
    })
  })

  it('automatically triggers 4-point preflight test upon entering Step 4 for the first time', async () => {
    vi.spyOn(gcpProjectService, 'listProjects').mockResolvedValue([
      { projectId: 'media-prod-2026', name: 'Media Prod', lifecycleState: 'ACTIVE' },
    ])

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

    useRuntimeStore.setState({
      oauthToken: 'live-token-for-step-4',
    })
    usePersistentStore.setState({
      savedProjectId: '',
      savedBucketName: '',
    })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Step 2: Select project
    fireEvent.click(screen.getByText(/2\. GCP Billing Project/i))
    const select = await screen.findByRole('combobox')
    fireEvent.change(select, { target: { value: 'media-prod-2026' } })

    // Step 3: Enter bucket
    fireEvent.click(screen.getByText(/3\. Target Bucket/i))
    const bucketInputEl = screen.getByPlaceholderText(/gs:\/\/your-bucket-name/i)
    fireEvent.change(bucketInputEl, { target: { value: 'gs://mediaserverrecovery' } })

    // Step 4: Navigate to Preflight
    fireEvent.click(screen.getByText(/4\. Preflight/i))

    // Preflight automatically runs upon entering Step 4
    await waitFor(() => {
      expect(preflightSpy).toHaveBeenCalledWith(
        'live-token-for-step-4',
        'mediaserverrecovery',
        'media-prod-2026',
        undefined,
      )
      expect(screen.getByRole('button', { name: /finish setup & enter media portal/i })).not.toBeDisabled()
    })
  })

  it('renders correctly without hook order violation when toggling isOpen from false to true', () => {
    const { rerender } = renderWithProviders(
      <OnboardingWizardShell isOpen={false} onClose={() => {}} onComplete={() => {}} />,
    )

    // Verify nothing rendered when closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Open wizard (transition from isOpen=false to isOpen=true)
    rerender(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Should render successfully without throwing hook order errors
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Client GCP Connection & Onboarding Wizard/i)).toBeInTheDocument()
  })

  it('does not display any recent buckets default list when the app first loads with empty recentBuckets', () => {
    usePersistentStore.setState({
      recentBuckets: [],
      savedBucketName: '',
    })

    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    // Navigate to Step 3
    fireEvent.click(screen.getByText(/3\. Target Bucket/i))

    // Verify input has neutral placeholder and no recent buckets section is rendered
    expect(screen.getByPlaceholderText(/gs:\/\/your-bucket-name/i)).toBeInTheDocument()
    expect(screen.queryByText(/Recently Used Buckets/i)).not.toBeInTheDocument()
    expect(screen.queryByText('gs://mediaserverrecovery')).not.toBeInTheDocument()
  })
})

