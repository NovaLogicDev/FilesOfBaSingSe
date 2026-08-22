import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { Header } from '../../src/components/layout/Header'
import { gisAuthService } from '../../src/services/gisAuthService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { resetAllStores, renderWithProviders } from '../helpers/testUtils'

describe('Header - GIS Auth & Profile Display', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
  })

  it('renders user display name and email when session is authenticated', () => {
    useRuntimeStore
      .getState()
      .setAuth(
        'ya29.auth_header_token',
        'zuko@fire-palace.gov',
        'Fire Lord Zuko',
        'https://avatars.example.com/zuko.png',
        3600,
      )

    renderWithProviders(
      <Header onOpenOnboarding={() => {}} onOpenDiagnostics={() => {}} />,
    )

    expect(screen.getByText('Fire Lord Zuko')).toBeInTheDocument()
    expect(screen.getByText('zuko@fire-palace.gov')).toBeInTheDocument()
    expect(screen.getByAltText('Fire Lord Zuko')).toHaveAttribute(
      'src',
      'https://avatars.example.com/zuko.png',
    )
  })

  it('calls gisAuthService.signOut() when disconnect button is clicked', async () => {
    useRuntimeStore
      .getState()
      .setAuth(
        'ya29.to_disconnect',
        'suki@kyoshi-warriors.org',
        'Suki',
        undefined,
        3600,
      )

    const signOutSpy = vi.spyOn(gisAuthService, 'signOut').mockImplementation(async () => {
      useRuntimeStore.getState().clearAuth()
    })

    renderWithProviders(
      <Header onOpenOnboarding={() => {}} onOpenDiagnostics={() => {}} />,
    )

    const disconnectBtn = screen.getByLabelText(/Disconnect Session/i)
    fireEvent.click(disconnectBtn)

    await waitFor(() => {
      expect(signOutSpy).toHaveBeenCalledTimes(1)
      expect(useRuntimeStore.getState().oauthToken).toBeNull()
    })
  })
})
