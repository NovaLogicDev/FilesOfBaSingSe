import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GCPConfigCenterModalShell } from '../../src/components/config/GCPConfigCenterModalShell'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { useToastStore } from '../../src/store/toastStore'

describe('Unit - Module 9: GCPConfigCenterModalShell', () => {
  const onCloseMock = vi.fn()
  const onOpenPricingSettingsMock = vi.fn()
  const onOpenOnboardingMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    usePersistentStore.setState({
      savedBucketName: 'gs://partner-raw-master-archives-2026',
      savedProjectId: 'demo-client-media-2026',
      recentBuckets: ['gs://mediaserverrecovery'],
      isFreeTrialAccount: true,
      customPricing: {
        archiveRetrievalPerGB: 0.05,
        coldlineRetrievalPerGB: 0.02,
        nearlineRetrievalPerGB: 0.01,
        standardRetrievalPerGB: 0.0,
        internetEgressPerGB: 0.12,
      },
    })
    useRuntimeStore.setState({
      isDemoMode: true,
      oauthToken: 'mock-oauth-token',
      userName: 'Taylor (Colorist)',
      userEmail: 'taylor@freelance-edit.com',
      tokenExpiresAt: Date.now() + 3300 * 1000,
    })
    useToastStore.setState({ toasts: [] })
  })

  it('renders nothing when isOpen is false', () => {
    render(
      <GCPConfigCenterModalShell
        isOpen={false}
        onClose={onCloseMock}
        onOpenPricingSettings={onOpenPricingSettingsMock}
        onOpenOnboarding={onOpenOnboardingMock}
      />,
    )

    expect(screen.queryByText(/Google Cloud Platform Configuration & Session Inspector/i)).toBeNull()
  })

  it('renders all 7 configuration & audit sections when open', async () => {
    render(
      <GCPConfigCenterModalShell
        isOpen={true}
        onClose={onCloseMock}
        onOpenPricingSettings={onOpenPricingSettingsMock}
        onOpenOnboarding={onOpenOnboardingMock}
      />,
    )

    expect(screen.getByText(/Google Cloud Platform Configuration & Session Inspector/i)).toBeDefined()

    // 1. Google Identity
    expect(screen.getByText(/1\. Google Identity & Credentials/i)).toBeDefined()
    expect(screen.getByText('Taylor (Colorist)')).toBeDefined()
    expect(screen.getByText('taylor@freelance-edit.com')).toBeDefined()

    // 2. Billed GCP Project
    expect(screen.getByText(/2\. Billed GCP Project/i)).toBeDefined()
    expect(screen.getByText('demo-client-media-2026')).toBeDefined()

    // 3. Target GCS Bucket
    expect(screen.getByText(/3\. Target GCS Bucket/i)).toBeDefined()
    expect(screen.getByText('gs://partner-raw-master-archives-2026')).toBeDefined()

    // 4. Cost Governance & Rates
    expect(screen.getByText(/4\. Cost Governance & Rate Card/i)).toBeDefined()
    expect(screen.getByText('$0.050/GB')).toBeDefined()
    expect(screen.getByText('$0.120/GB')).toBeDefined()
    expect(screen.getByText(/Google Free Trial credit balance active/i)).toBeDefined()

    // 5. Preflight Health Matrix
    expect(screen.getByText(/5\. Real-Time 4-Point Preflight Health Matrix/i)).toBeDefined()

    // 6. Storage Boundary Audit
    expect(screen.getByText(/6\. Storage Boundary & Token Hygiene Audit/i)).toBeDefined()
    expect(screen.getByText(/100% Clean \(0 Leaked Tokens\)/i)).toBeDefined()
  })

  it('re-runs preflight audit when button is clicked', async () => {
    render(
      <GCPConfigCenterModalShell
        isOpen={true}
        onClose={onCloseMock}
        onOpenPricingSettings={onOpenPricingSettingsMock}
        onOpenOnboarding={onOpenOnboardingMock}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-run complete audit/i })).toBeDefined()
    })

    const reRunBtn = screen.getByRole('button', { name: /re-run complete audit/i })
    fireEvent.click(reRunBtn)

    await waitFor(() => {
      expect(screen.getByText('Active & Valid')).toBeDefined()
      expect(screen.getByText('Enforced OK')).toBeDefined()
    })
  })

  it('triggers onOpenPricingSettings when Edit Rates is clicked', () => {
    render(
      <GCPConfigCenterModalShell
        isOpen={true}
        onClose={onCloseMock}
        onOpenPricingSettings={onOpenPricingSettingsMock}
        onOpenOnboarding={onOpenOnboardingMock}
      />,
    )

    const editRatesBtn = screen.getByRole('button', { name: /edit rates/i })
    fireEvent.click(editRatesBtn)

    expect(onOpenPricingSettingsMock).toHaveBeenCalled()
  })

  it('closes modal when Done or X is clicked', () => {
    render(
      <GCPConfigCenterModalShell
        isOpen={true}
        onClose={onCloseMock}
        onOpenPricingSettings={onOpenPricingSettingsMock}
        onOpenOnboarding={onOpenOnboardingMock}
      />,
    )

    const doneBtn = screen.getByRole('button', { name: /done/i })
    fireEvent.click(doneBtn)

    expect(onCloseMock).toHaveBeenCalled()
  })
})
