import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { DownloadManagerShell } from '../../src/components/downloader/DownloadManagerShell'
import { GCPConfigCenterModalShell } from '../../src/components/config/GCPConfigCenterModalShell'
import { AppShell } from '../../src/components/layout/AppShell'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { useToastStore } from '../../src/store/toastStore'
import { OSFileSystemRevealEngine } from '../../src/engines/osFileSystemReveal'

describe('OS File System Feedback & Reveal Integration Tests (Module 12 / Epic 12)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    useToastStore.setState({ toasts: [] })

    usePersistentStore.setState({
      savedBucketName: 'gs://partner-raw-master-archives-2026',
      savedProjectId: 'client-prod-media-2026',
      hasCompletedOnboarding: true,
      preferredDownloadStrategy: 'fsaa',
    })

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('DownloadManagerShell Post-Download Success Card', () => {
    it('renders post-download OS reveal controls upon download completion', async () => {
      const mockFile = new File(['mock binary content'], 'reel04_cam_A_raw.mxf', {
        type: 'application/octet-stream',
        lastModified: 1740000000000,
      })
      const mockHandle = {
        name: 'reel04_cam_A_raw.mxf',
        getFile: vi.fn().mockResolvedValue(mockFile),
      }

      useRuntimeStore.setState({
        activeDownload: {
          itemId: 'test-item-1',
          itemName: 'reel04_cam_A_raw.mxf',
          loadedBytes: 18_400_000_000,
          totalBytes: 18_400_000_000,
          percentage: 100,
          speedBytesPerSec: 48_500_000,
          formattedSpeed: '48.5 MB/s',
          etaSeconds: 0,
          formattedETA: '00s',
          elapsedSeconds: 222,
          formattedElapsed: '03m 42s',
          memoryHeapMB: 11.4,
          status: 'completed',
          strategy: 'fsaa',
          computedCrc32cBase64: 'r4L2wA==',
          computedCrc32cHex: '0xAF82F6C0',
          integrityVerified: true,
          fileHandle: mockHandle as any,
        },
      })

      render(<DownloadManagerShell />)

      expect(screen.getByText('Saved File Location')).toBeInTheDocument()
      expect(screen.getByText('[✓ Flushed to Disk]')).toBeInTheDocument()
      expect(screen.getByText('Local Path on Disk:')).toBeInTheDocument()

      // Copy file path
      const copyBtn = screen.getByRole('button', { name: /Copy Path/i })
      expect(copyBtn).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(copyBtn)
      })

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('reel04_cam_A_raw.mxf')
      expect(screen.getByText('Copied')).toBeInTheDocument()

      // Inspect disk handle
      const inspectBtn = screen.getByRole('button', { name: /Inspect On-Disk Properties/i })
      await act(async () => {
        fireEvent.click(inspectBtn)
      })

      expect(mockHandle.getFile).toHaveBeenCalled()
      expect(screen.getByText(/Verified On-Disk Properties:/i)).toBeInTheDocument()
      expect(screen.getAllByText(/reel04_cam_A_raw.mxf/i).length).toBeGreaterThan(1)
    })

    it('allows toggling download strategy in post-download card', async () => {
      useRuntimeStore.setState({
        activeDownload: {
          itemId: 'test-item-1',
          itemName: 'clip.mp4',
          loadedBytes: 1000,
          totalBytes: 1000,
          percentage: 100,
          speedBytesPerSec: 100,
          formattedSpeed: '100 B/s',
          etaSeconds: 0,
          formattedETA: '00s',
          elapsedSeconds: 10,
          formattedElapsed: '10s',
          memoryHeapMB: 11.4,
          status: 'completed',
          strategy: 'fsaa',
        },
      })

      render(<DownloadManagerShell />)

      const toggleBtn = screen.getByText(/Prefer Chrome Downloads shelf\? Switch to Service Worker Stream/i)
      expect(toggleBtn).toBeInTheDocument()

      await act(async () => {
        fireEvent.click(toggleBtn)
      })

      expect(usePersistentStore.getState().preferredDownloadStrategy).toBe('service_worker')
    })
  })

  describe('GCPConfigCenterModalShell Download Pipeline Strategy (Section 7)', () => {
    it('allows user to select preferred download strategy', async () => {
      render(
        <GCPConfigCenterModalShell
          isOpen={true}
          onClose={vi.fn()}
          onOpenPricingSettings={vi.fn()}
          onOpenOnboarding={vi.fn()}
        />,
      )

      expect(screen.getByText('7. Download Pipeline Strategy & OS Integration')).toBeInTheDocument()

      const swBtn = screen.getByRole('button', { name: /Chrome Download Manager/i })
      await act(async () => {
        fireEvent.click(swBtn)
      })

      expect(usePersistentStore.getState().preferredDownloadStrategy).toBe('service_worker')

      const fsaaBtn = screen.getByRole('button', { name: /Direct to Disk \(FSAA\)/i })
      await act(async () => {
        fireEvent.click(fsaaBtn)
      })

      expect(usePersistentStore.getState().preferredDownloadStrategy).toBe('fsaa')
    })
  })

  describe('Global Keyboard Shortcut (Ctrl+R / Cmd+R)', () => {
    it('copies reveal command when download is complete upon Ctrl+R keypress', async () => {
      useRuntimeStore.setState({
        activeDownload: {
          itemId: 'test-item-1',
          itemName: 'master_reel.mxf',
          loadedBytes: 1000,
          totalBytes: 1000,
          percentage: 100,
          speedBytesPerSec: 100,
          formattedSpeed: '100 B/s',
          etaSeconds: 0,
          formattedETA: '00s',
          elapsedSeconds: 10,
          formattedElapsed: '10s',
          memoryHeapMB: 11.4,
          status: 'completed',
          strategy: 'fsaa',
        },
      })

      render(<AppShell />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 'r', ctrlKey: true })
      })

      expect(navigator.clipboard.writeText).toHaveBeenCalled()
    })
  })
})
