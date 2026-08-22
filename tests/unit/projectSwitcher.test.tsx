import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectSwitcherPopover } from '../../src/components/navigation/ProjectSwitcherPopover'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { useToastStore } from '../../src/store/toastStore'

describe('Unit - Module 9: ProjectSwitcherPopover', () => {
  const onProjectSwitchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    usePersistentStore.setState({
      savedProjectId: 'client-media-project-2026',
    })
    useRuntimeStore.setState({
      oauthToken: 'mock-oauth-token',
    })
    useToastStore.setState({ toasts: [] })
  })

  it('renders closed trigger displaying the active billed project', () => {
    render(<ProjectSwitcherPopover onProjectSwitch={onProjectSwitchMock} />)

    expect(screen.getByText('client-media-project-2026')).toBeDefined()
    expect(screen.queryByText(/Billed GCP Project Switcher/i)).toBeNull()
  })

  it('opens project switcher popover and displays discovered projects', async () => {
    render(<ProjectSwitcherPopover onProjectSwitch={onProjectSwitchMock} />)

    fireEvent.click(screen.getByRole('button', { name: /switch billed gcp project/i }))

    expect(screen.getByText(/Billed GCP Project Switcher/i)).toBeDefined()
    await waitFor(() => {
      expect(screen.getByText('Client Post Production Studio')).toBeDefined()
      expect(screen.getAllByText('client-media-project-2026').length).toBeGreaterThan(0)
    })
  })

  it('switches to a selected project from list', async () => {
    usePersistentStore.setState({ savedProjectId: 'initial-other-project' })
    render(<ProjectSwitcherPopover onProjectSwitch={onProjectSwitchMock} />)

    fireEvent.click(screen.getByRole('button', { name: /switch billed gcp project/i }))

    await waitFor(() => {
      expect(screen.getByText('Client Post Production Studio')).toBeDefined()
    })

    const selectBtn = screen.getByRole('button', { name: /select/i })
    fireEvent.click(selectBtn)

    expect(onProjectSwitchMock).toHaveBeenCalledWith('client-media-project-2026')
    expect(usePersistentStore.getState().savedProjectId).toBe('client-media-project-2026')
  })

  it('validates manual project ID format and applies valid override', async () => {
    render(<ProjectSwitcherPopover onProjectSwitch={onProjectSwitchMock} />)

    fireEvent.click(screen.getByRole('button', { name: /switch billed gcp project/i }))

    const input = screen.getByPlaceholderText(/e\.g\. corporate-media-prod-2026/i)
    fireEvent.change(input, { target: { value: '1234567' } }) // invalid: starts with digit

    const applyBtn = screen.getByRole('button', { name: /apply/i })
    fireEvent.click(applyBtn)

    expect(screen.getByText(/project id must start with a lowercase letter/i)).toBeDefined()
    expect(onProjectSwitchMock).not.toHaveBeenCalled()

    // Valid override
    fireEvent.change(input, { target: { value: 'custom-media-prod-2026' } })
    fireEvent.click(applyBtn)

    expect(onProjectSwitchMock).toHaveBeenCalledWith('custom-media-prod-2026')
  })
})
