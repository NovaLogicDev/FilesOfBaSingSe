import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingWizardShell } from '../../src/components/onboarding/OnboardingWizardShell'
import { gisAuthService } from '../../src/services/gisAuthService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { resetAllStores, renderWithProviders } from '../helpers/testUtils'

describe('OnboardingWizardShell - GIS Auth Flow', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
  })

  it('renders Google Sign-In button on Step 1 when unauthenticated', () => {
    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={() => {}} onComplete={() => {}} />,
    )

    expect(screen.getByText(/Step 1: Google Identity Sign-In/i)).toBeInTheDocument()
    expect(screen.getByText(/Sign In with Google/i)).toBeInTheDocument()
  })

  it('triggers gisAuthService.signIn() when Sign In with Google is clicked', async () => {
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
})
