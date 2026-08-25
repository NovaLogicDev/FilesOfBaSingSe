import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BucketSwitcherPopover } from '../../src/components/navigation/BucketSwitcherPopover'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { useToastStore } from '../../src/store/toastStore'

describe('Unit - Module 9: BucketSwitcherPopover', () => {
  const onBucketSwitchMock = vi.fn()
  const onOpenWizardMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    usePersistentStore.setState({
      savedBucketName: 'gs://test-studio-vault-2026',
      recentBuckets: [
        'gs://test-recovery-vault',
      ],
      savedProjectId: 'client-media-project-2026',
    })
    useRuntimeStore.setState({
      oauthToken: 'mock-oauth-token',
    })
    useToastStore.setState({ toasts: [] })
  })

  it('renders closed by default and shows active bucket name', () => {
    render(
      <BucketSwitcherPopover
        onBucketSwitch={onBucketSwitchMock}
        onOpenWizard={onOpenWizardMock}
      />,
    )

    expect(screen.getByText('gs://test-studio-vault-2026')).toBeDefined()
    expect(screen.queryByText(/Target GCS Bucket Switcher/i)).toBeNull()
  })

  it('opens dropdown sheet when trigger button is clicked and shows recent buckets', () => {
    render(
      <BucketSwitcherPopover
        onBucketSwitch={onBucketSwitchMock}
        onOpenWizard={onOpenWizardMock}
      />,
    )

    const trigger = screen.getByRole('button', { name: /switch active target bucket/i })
    fireEvent.click(trigger)

    expect(screen.getByText(/Target GCS Bucket Switcher/i)).toBeDefined()
    expect(screen.getByText('gs://test-recovery-vault')).toBeDefined()
  })

  it('allows switching to a recent bucket with 1 click', async () => {
    render(
      <BucketSwitcherPopover
        onBucketSwitch={onBucketSwitchMock}
        onOpenWizard={onOpenWizardMock}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /switch active target bucket/i }))

    const switchButtons = screen.getAllByRole('button', { name: /^switch$/i })
    expect(switchButtons.length).toBeGreaterThan(0)
    fireEvent.click(switchButtons[0])

    await waitFor(() => {
      expect(onBucketSwitchMock).toHaveBeenCalledWith('gs://test-recovery-vault')
    })
  })

  it('validates syntax when entering a custom bucket name', async () => {
    render(
      <BucketSwitcherPopover
        onBucketSwitch={onBucketSwitchMock}
        onOpenWizard={onOpenWizardMock}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /switch active target bucket/i }))

    const input = screen.getByPlaceholderText(/gs:\/\/your-bucket-name/i)
    fireEvent.change(input, { target: { value: 'AB' } }) // too short / uppercase

    const connectButton = screen.getByRole('button', { name: /connect/i })
    fireEvent.click(connectButton)

    expect(
      screen.getByText(/bucket name must be between 3 and 63 characters/i),
    ).toBeDefined()
    expect(onBucketSwitchMock).not.toHaveBeenCalled()
  })

  it('successfully switches bucket on valid custom input', async () => {
    render(
      <BucketSwitcherPopover
        onBucketSwitch={onBucketSwitchMock}
        onOpenWizard={onOpenWizardMock}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /switch active target bucket/i }))

    const input = screen.getByPlaceholderText(/gs:\/\/your-bucket-name/i)
    fireEvent.change(input, { target: { value: 'gs://dailies-reel-05-archive' } })

    const connectButton = screen.getByRole('button', { name: /connect/i })
    fireEvent.click(connectButton)

    await waitFor(() => {
      expect(onBucketSwitchMock).toHaveBeenCalledWith('gs://dailies-reel-05-archive')
    })
  })

  it('triggers onOpenWizard when launch wizard link is clicked', () => {
    render(
      <BucketSwitcherPopover
        onBucketSwitch={onBucketSwitchMock}
        onOpenWizard={onOpenWizardMock}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /switch active target bucket/i }))

    const wizardBtn = screen.getByRole('button', {
      name: /launch full preflight wizard for new bucket/i,
    })
    fireEvent.click(wizardBtn)

    expect(onOpenWizardMock).toHaveBeenCalled()
  })
})
