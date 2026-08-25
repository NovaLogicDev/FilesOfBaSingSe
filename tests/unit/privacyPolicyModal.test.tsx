import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { PrivacyPolicyModalShell } from '../../src/components/privacy/PrivacyPolicyModalShell'
import { renderWithProviders } from '../helpers/testUtils'

describe('PrivacyPolicyModalShell (AUX-09) - Unit Tests', () => {
  it('does not render when isOpen is false', () => {
    renderWithProviders(<PrivacyPolicyModalShell isOpen={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders all required regulatory disclosures when open', () => {
    renderWithProviders(<PrivacyPolicyModalShell isOpen={true} onClose={() => {}} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/Privacy Policy & Google API Trust & Safety/i)).toBeInTheDocument()

    // 1. Zero-Backend & Core Guarantees
    expect(screen.getByText(/Zero-Backend Client Execution/i)).toBeInTheDocument()
    expect(screen.getByText(/zero intermediary backend servers/i)).toBeInTheDocument()

    // 2. Scopes & Least Privilege
    expect(screen.getByText(/Base Non-Sensitive Scopes/i)).toBeInTheDocument()
    expect(screen.getByText(/Elevated Scope \(Optional\)/i)).toBeInTheDocument()
    expect(screen.getByText(/devstorage\.read_only/i)).toBeInTheDocument()
    expect(screen.getByText(/cloud-platform/i)).toBeInTheDocument()

    // 3. Credential Isolation, Storage Boundaries & Session Continuity
    expect(
      screen.getByText(/Credential Isolation, Storage Boundaries & Session Continuity/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Volatile Credential Isolation/i)).toBeInTheDocument()
    expect(screen.getByText(/Session Continuity & Non-Sensitive Preferences/i)).toBeInTheDocument()

    // 4. Zero Telemetry & CSP
    expect(screen.getByText(/Zero Telemetry & Content Security Policy/i)).toBeInTheDocument()

    // 5. Google API Services User Data Policy (Limited Use disclosure)
    expect(screen.getByText(/Google API Services User Data Policy Compliance/i)).toBeInTheDocument()
    expect(
      screen.getByText(
        /Files of Ba Sing Se's use and transfer to any other app of information received from Google APIs will adhere to the/i,
      ),
    ).toBeInTheDocument()

    // 6. External link to /privacy.html
    const standaloneLink = screen.getByRole('link', { name: /Open Standalone Privacy Document/i })
    expect(standaloneLink).toBeInTheDocument()
    expect(standaloneLink).toHaveAttribute('href', '/privacy.html')
  })

  it('triggers onClose when Close button or X is clicked', () => {
    const onCloseSpy = vi.fn()
    renderWithProviders(<PrivacyPolicyModalShell isOpen={true} onClose={onCloseSpy} />)

    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    expect(closeButtons.length).toBeGreaterThanOrEqual(1)

    fireEvent.click(closeButtons[0])
    expect(onCloseSpy).toHaveBeenCalledTimes(1)
  })
})
