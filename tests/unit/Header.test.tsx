import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Header } from '../../src/components/layout/Header'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { resetAllStores, renderWithProviders } from '../helpers/testUtils'

describe('Header - Top Bar State & Neutrality Pre-Sign-In / Pre-Setup', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
  })

  it('renders neutral GCS Disconnected state and Connect GCS button when unauthenticated', () => {
    useRuntimeStore.setState({
      oauthToken: null,
    })

    renderWithProviders(
      <Header
        onOpenOnboarding={() => {}}
        onOpenDiagnostics={() => {}}
        onOpenPricingSettings={() => {}}
        onOpenGcpConfig={() => {}}
        onBucketSwitch={() => {}}
        onProjectSwitch={() => {}}
      />,
    )

    // Neutrality indicator is displayed
    expect(screen.getByText(/GCS Disconnected • Ready for Setup/i)).toBeInTheDocument()

    // Popover switchers are NOT rendered
    expect(screen.queryByLabelText(/Switch Active Target Bucket/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Switch Billed GCP Project/i)).not.toBeInTheDocument()

    // Connect GCS button is displayed
    expect(screen.getByText(/Connect GCS/i)).toBeInTheDocument()
  })

  it('renders active popover switchers and user identity when authenticated', () => {
    useRuntimeStore.setState({
      oauthToken: 'live-token-123',
      userEmail: 'colorist@post-house.org',
      userName: 'Taylor Colorist',
    })
    usePersistentStore.setState({
      savedProjectId: 'my-color-suite-prod',
      savedBucketName: 'gs://feature-film-masters-2026',
    })

    renderWithProviders(
      <Header
        onOpenOnboarding={() => {}}
        onOpenDiagnostics={() => {}}
        onOpenPricingSettings={() => {}}
        onOpenGcpConfig={() => {}}
        onBucketSwitch={() => {}}
        onProjectSwitch={() => {}}
      />,
    )

    // Neutral disconnected badge is NOT shown
    expect(screen.queryByText(/GCS Disconnected • Ready for Setup/i)).not.toBeInTheDocument()

    // Popover switchers are active
    expect(screen.getByLabelText(/Switch Active Target Bucket/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Switch Billed GCP Project/i)).toBeInTheDocument()

    // User profile is rendered
    expect(screen.getByText('Taylor Colorist')).toBeInTheDocument()
    expect(screen.getByText('colorist@post-house.org')).toBeInTheDocument()
    expect(screen.getByLabelText(/Disconnect Session/i)).toBeInTheDocument()
  })

  it('toggles theme between dark and light with Sun and Moon icons when clicking toggle button', () => {
    usePersistentStore.setState({
      theme: 'dark',
    })

    renderWithProviders(
      <Header
        onOpenOnboarding={() => {}}
        onOpenDiagnostics={() => {}}
        onOpenPricingSettings={() => {}}
        onOpenGcpConfig={() => {}}
        onBucketSwitch={() => {}}
        onProjectSwitch={() => {}}
      />,
    )

    const toggleBtn = screen.getByRole('button', { name: /Toggle Theme/i })
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveAttribute('aria-label', 'Toggle Theme (Current: dark)')
    expect(toggleBtn.querySelector('.lucide-sun')).toBeInTheDocument()

    // Click 1: dark -> light (displays Moon icon)
    fireEvent.click(toggleBtn)
    expect(usePersistentStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(toggleBtn).toHaveAttribute('aria-label', 'Toggle Theme (Current: light)')
    expect(toggleBtn.querySelector('.lucide-moon')).toBeInTheDocument()

    // Click 2: light -> dark (displays Sun icon)
    fireEvent.click(toggleBtn)
    expect(usePersistentStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(toggleBtn).toHaveAttribute('aria-label', 'Toggle Theme (Current: dark)')
    expect(toggleBtn.querySelector('.lucide-sun')).toBeInTheDocument()
  })
})




