import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from '../../src/components/layout/AppShell'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { useToastStore } from '../../src/store/toastStore'

describe('Welcome Hero & Feature Highlight Cards when Unauthenticated', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    usePersistentStore.getState().resetPreferences()
    useRuntimeStore.getState().clearAuth()
    useToastStore.setState({ toasts: [] })
    vi.restoreAllMocks()
  })

  it('renders the up-to-date hero title, subtitle, and feature cards when unauthenticated', () => {
    render(<AppShell />)

    // Hero title & subtitle
    expect(screen.getAllByText('Files of Ba Sing Se').length).toBeGreaterThan(0)
    expect(screen.getByText('Requester-Pays Google Cloud Storage File Explorer')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Authenticate directly from your browser to access Requester-Pays/i,
      ),
    ).toBeInTheDocument()

    // Wizard launch button
    expect(screen.getByRole('button', { name: /Launch Connection Wizard/i })).toBeInTheDocument()

    // Feature Highlight Card 1: Direct-to-Disk & Multi-Engine Streaming
    expect(screen.getByText('Direct-to-Disk Streaming')).toBeInTheDocument()
    expect(
      screen.getByText(
        /4MB micro-chunks streamed via Service Worker with bounded memory \(<15MB\)\./i,
      ),
    ).toBeInTheDocument()

    // Feature Highlight Card 2: Castagnoli CRC32c
    expect(screen.getByText('Castagnoli CRC32c')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Live bit-exact parity validation against Google Cloud Storage x-goog-hash checksum digests\./i,
      ),
    ).toBeInTheDocument()

    // Feature Highlight Card 3: Zero Host Liability & Privacy
    expect(screen.getByText('Zero Host Liability')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Client-side execution with minimal scopes, client-side session persistence, and zero telemetry tracking\./i,
      ),
    ).toBeInTheDocument()
  })
})
