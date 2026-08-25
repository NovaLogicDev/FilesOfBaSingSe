import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionReconnectCard } from '../../src/components/onboarding/SessionReconnectCard'

describe('SessionReconnectCard Component (Screen 7)', () => {
  it('renders correctly with saved configuration and user identity hints', () => {
    render(
      <SessionReconnectCard
        userEmail="taylor@freelance-edit.com"
        userName="Taylor (Colorist)"
        savedProjectId="client-prod-media-2026"
        savedBucketName="gs://test-studio-vault-2026"
        onReconnect={vi.fn()}
        onReconfigure={vi.fn()}
      />,
    )

    expect(screen.getByText(/Resume Google Cloud Session/i)).toBeInTheDocument()
    expect(screen.getByText(/Config Saved/i)).toBeInTheDocument()
    expect(screen.getByText(/Welcome back, Taylor \(Colorist\)!/i)).toBeInTheDocument()
    expect(screen.getByText(/taylor@freelance-edit\.com/i)).toBeInTheDocument()
    expect(screen.getByText(/client-prod-media-2026/i)).toBeInTheDocument()
    expect(screen.getByText(/gs:\/\/test-studio-vault-2026/i)).toBeInTheDocument()
    expect(screen.getByTestId('reconnect-button')).toBeInTheDocument()
    expect(screen.getByTestId('reconfigure-button')).toBeInTheDocument()
  })

  it('triggers onReconnect when 1-Click Reconnect button is clicked', async () => {
    const user = userEvent.setup()
    const handleReconnect = vi.fn()

    render(
      <SessionReconnectCard
        userEmail="taylor@freelance-edit.com"
        userName="Taylor"
        savedProjectId="client-prod-media-2026"
        savedBucketName="gs://test-studio-vault-2026"
        onReconnect={handleReconnect}
        onReconfigure={vi.fn()}
      />,
    )

    const btn = screen.getByTestId('reconnect-button')
    await user.click(btn)
    expect(handleReconnect).toHaveBeenCalledTimes(1)
  })

  it('triggers onReconfigure when Switch Account / Reconfigure button is clicked', async () => {
    const user = userEvent.setup()
    const handleReconfigure = vi.fn()

    render(
      <SessionReconnectCard
        userEmail="taylor@freelance-edit.com"
        userName="Taylor"
        savedProjectId="client-prod-media-2026"
        savedBucketName="gs://test-studio-vault-2026"
        onReconnect={vi.fn()}
        onReconfigure={handleReconfigure}
      />,
    )

    const btn = screen.getByTestId('reconfigure-button')
    await user.click(btn)
    expect(handleReconfigure).toHaveBeenCalledTimes(1)
  })

  it('renders interactive error notice when errorMessage is present', () => {
    render(
      <SessionReconnectCard
        userEmail="taylor@freelance-edit.com"
        userName="Taylor"
        savedProjectId="client-prod-media-2026"
        savedBucketName="gs://test-studio-vault-2026"
        onReconnect={vi.fn()}
        onReconfigure={vi.fn()}
        errorMessage="Third-party cookies partitioned in Safari"
      />,
    )

    expect(
      screen.getByText(/Third-party cookies partitioned in Safari/i),
    ).toBeInTheDocument()
  })
})
