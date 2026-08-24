import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { StepUpConsentModalShell } from '../../src/components/auth/StepUpConsentModalShell'
import { renderWithProviders } from '../helpers/testUtils'

describe('StepUpConsentModalShell (Module 14) - Unit Tests', () => {
  it('does not render when isOpen is false', () => {
    renderWithProviders(
      <StepUpConsentModalShell
        isOpen={false}
        onClose={() => {}}
        onConfirmStepUp={() => {}}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders discovery reason explanations and action buttons when open', () => {
    const onCloseSpy = vi.fn()
    const onConfirmSpy = vi.fn()
    const onManualSpy = vi.fn()

    renderWithProviders(
      <StepUpConsentModalShell
        isOpen={true}
        onClose={onCloseSpy}
        onConfirmStepUp={onConfirmSpy}
        onSwitchToManual={onManualSpy}
        reason="discovery"
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/GCP Project Automation Permission/i)).toBeInTheDocument()
    expect(screen.getByText(/To automatically scan and list your existing Google Cloud projects/i)).toBeInTheDocument()
    expect(screen.getByText('cloud-platform')).toBeInTheDocument()
    expect(screen.getByText(/Prefer zero elevated permissions\?/i)).toBeInTheDocument()

    // Test Confirm action
    const grantBtn = screen.getByRole('button', { name: /Grant Permission with Google/i })
    fireEvent.click(grantBtn)
    expect(onCloseSpy).toHaveBeenCalledTimes(1)
    expect(onConfirmSpy).toHaveBeenCalledTimes(1)
  })

  it('renders creation reason and triggers manual input switch', () => {
    const onCloseSpy = vi.fn()
    const onConfirmSpy = vi.fn()
    const onManualSpy = vi.fn()

    renderWithProviders(
      <StepUpConsentModalShell
        isOpen={true}
        onClose={onCloseSpy}
        onConfirmStepUp={onConfirmSpy}
        onSwitchToManual={onManualSpy}
        reason="creation"
      />,
    )

    expect(screen.getByText(/To automatically create a dedicated media project/i)).toBeInTheDocument()

    const manualBtn = screen.getByRole('button', { name: /Enter Project ID Manually/i })
    fireEvent.click(manualBtn)
    expect(onCloseSpy).toHaveBeenCalledTimes(1)
    expect(onManualSpy).toHaveBeenCalledTimes(1)
  })
})
