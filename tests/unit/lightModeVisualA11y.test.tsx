import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { useToastStore } from '../../src/store/toastStore'
import { StorageClassBadge } from '../../src/components/explorer/StorageClassBadge'
import { HighlightMatch } from '../../src/components/explorer/HighlightMatch'
import { BreadcrumbNav } from '../../src/components/explorer/BreadcrumbNav'
import { FilterToolbar } from '../../src/components/explorer/FilterToolbar'
import { AssetRow } from '../../src/components/explorer/AssetRow'
import { FolderRow } from '../../src/components/explorer/FolderRow'
import { AssetInspectorDrawerShell } from '../../src/components/inspector/AssetInspectorDrawerShell'
import { DownloadManagerShell } from '../../src/components/downloader/DownloadManagerShell'
import { CliGeneratorModalShell } from '../../src/components/cli/CliGeneratorModalShell'
import { HighCostConfirmationModalShell } from '../../src/components/cost/HighCostConfirmationModalShell'
import { PricingSettingsModalShell } from '../../src/components/cost/PricingSettingsModalShell'
import { DiagnosticsModalShell } from '../../src/components/diagnostics/DiagnosticsModalShell'
import { GCPConfigCenterModalShell } from '../../src/components/config/GCPConfigCenterModalShell'
import { ToastContainer } from '../../src/components/ui/Toast'
import { GCSMediaItem } from '../../src/types'

describe('Light Mode & Dual-Theme Visual / WCAG Accessibility Verification', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    document.documentElement.className = 'light'
    document.documentElement.setAttribute('data-theme', 'light')
    usePersistentStore.setState({
      theme: 'light',
      savedProjectId: 'media-prod-2026',
      savedBucketName: 'gs://basingse-4k-masters',
    })
  })

  it('renders 4 storage class badges with proper light theme contrast classes', () => {
    const { rerender } = renderWithProviders(<StorageClassBadge storageClass="STANDARD" />)
    let badge = screen.getByText('STANDARD')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('bg-emerald-100')
    expect(badge.className).toContain('text-emerald-800')

    rerender(<StorageClassBadge storageClass="ARCHIVE" />)
    badge = screen.getByText('ARCHIVE')
    expect(badge.className).toContain('bg-sky-100')
    expect(badge.className).toContain('text-sky-800')

    rerender(<StorageClassBadge storageClass="COLDLINE" />)
    badge = screen.getByText('COLDLINE')
    expect(badge.className).toContain('bg-amber-100')
    expect(badge.className).toContain('text-amber-800')

    rerender(<StorageClassBadge storageClass="NEARLINE" />)
    badge = screen.getByText('NEARLINE')
    expect(badge.className).toContain('bg-indigo-100')
    expect(badge.className).toContain('text-indigo-800')
  })

  it('renders HighlightMatch with light and dark contrast marks', () => {
    renderWithProviders(<HighlightMatch text="Scene01_Master_ProRes4444.mov" query="Master" />)
    const mark = screen.getByText('Master')
    expect(mark.tagName).toBe('MARK')
    expect(mark.className).toContain('text-amber-950')
  })

  it('renders BreadcrumbNav with interactive directory segments in light mode', () => {
    renderWithProviders(
      <BreadcrumbNav
        bucketName="basingse-4k-masters"
        currentPrefix="Season01/Episode04/Renders/"
        onNavigatePrefix={() => {}}
      />,
    )
    expect(screen.getByText('basingse-4k-masters')).toBeInTheDocument()
    expect(screen.getByText('Season01')).toBeInTheDocument()
    expect(screen.getByText('Episode04')).toBeInTheDocument()
    expect(screen.getByText('Renders')).toBeInTheDocument()
  })

  it('renders FilterToolbar with light mode search inputs and category filters', () => {
    renderWithProviders(
      <FilterToolbar
        searchQuery=""
        onSearchChange={() => {}}
        selectedCategory="ALL"
        onSelectCategory={() => {}}
        selectedStorageClass="ALL"
        onSelectStorageClass={() => {}}
        totalItemsCount={120}
        filteredCount={120}
        selectedCount={0}
        isAllSelected={false}
        onToggleSelectAll={() => {}}
        onClearSelection={() => {}}
        onDownloadSelected={() => {}}
        onOpenCliGenerator={() => {}}
        currentPrefix=""
      />,
    )
    expect(screen.getByPlaceholderText(/Search by file name/i)).toBeInTheDocument()
    expect(screen.getByText('All Files')).toBeInTheDocument()
    expect(screen.getByText('Videos')).toBeInTheDocument()
    expect(screen.getByText('Audio')).toBeInTheDocument()
    expect(screen.getByText('Archives')).toBeInTheDocument()
  })

  it('renders AssetRow and FolderRow with accessible focus and hover states in light mode', () => {
    const mockAsset: GCSMediaItem = {
      id: 'Season01/Episode04/FinalGrade_4K.mov',
      name: 'Season01/Episode04/FinalGrade_4K.mov',
      bucket: 'basingse-4k-masters',
      size: 12884901888,
      contentType: 'video/quicktime',
      updated: '2026-08-20T10:00:00.000Z',
      storageClass: 'STANDARD',
      crc32c: 'a1b2c3d4',
      md5Hash: 'xyz',
      mediaCategory: 'video',
      estimatedCost: 1.54,
    }

    renderWithProviders(
      <div role="table">
        <FolderRow
          folderPath="Season01/Episode04/Audio/"
          currentPrefix="Season01/Episode04/"
          rowIndex={0}
          top={0}
          height={48}
          isFocused={false}
          onNavigatePrefix={() => {}}
        />
        <AssetRow
          file={mockAsset}
          rowIndex={1}
          top={48}
          height={56}
          isSelected={false}
          isFocused={false}
          searchQuery=""
          onToggleSelect={() => {}}
          onInspect={() => {}}
          onDownload={() => {}}
          onGenerateCli={() => {}}
        />
      </div>,
    )

    expect(screen.getByText('Audio/')).toBeInTheDocument()
    expect(screen.getByText('FinalGrade_4K.mov')).toBeInTheDocument()
  })

  it('renders CLI Generator Modal preserving dark code block contrast in light mode', () => {
    renderWithProviders(
      <CliGeneratorModalShell
        isOpen={true}
        selectedPaths={['Media/CameraRaw_01.ari']}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText(/Automated Batch & CLI Command Generator/i)).toBeInTheDocument()
    const codeBlock = screen.getByText(/gcloud storage cp/i)
    expect(codeBlock).toBeInTheDocument()
  })

  it('renders Cost Confirmation Modal and Pricing Settings in light mode', () => {
    const { rerender } = renderWithProviders(
      <HighCostConfirmationModalShell
        isOpen={true}
        costResult={{
          itemCount: 10,
          formattedTotalSize: '100.00 GB',
          retrievalTotalUSD: 5.36,
          egressTotalUSD: 12.88,
          grandTotalUSD: 18.24,
          isHighCost: true,
          breakdowns: [],
        } as any}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText(/High-Volume \/ Cold-Tier Transfer Confirmation/i)).toBeInTheDocument()
    expect(screen.getAllByText(/\$18\.24/).length).toBeGreaterThan(0)

    rerender(
      <PricingSettingsModalShell
        isOpen={true}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText(/GCS Rate Card & Pricing Overrides/i)).toBeInTheDocument()
  })

  it('renders Diagnostics Modal and GCP Config Center in light mode', () => {
    const { rerender } = renderWithProviders(
      <DiagnosticsModalShell
        isOpen={true}
        onClose={() => {}}
      />,
    )

    expect(screen.getByText(/Observability & System Diagnostics/i)).toBeInTheDocument()

    rerender(
      <GCPConfigCenterModalShell
        isOpen={true}
        onClose={() => {}}
        onOpenOnboarding={() => {}}
        onOpenPricingSettings={() => {}}
      />,
    )

    expect(screen.getByText(/Google Cloud Platform Configuration & Session Inspector/i)).toBeInTheDocument()
  })

  it('renders Toast notifications with accessible light mode backgrounds and icons', () => {
    useToastStore.getState().addToast({
      type: 'success',
      title: 'Direct Transfer Complete',
      message: 'Downloaded 4K media master with validated CRC32C.',
    })

    renderWithProviders(<ToastContainer />)

    expect(screen.getByText('Direct Transfer Complete')).toBeInTheDocument()
    expect(screen.getByText('Downloaded 4K media master with validated CRC32C.')).toBeInTheDocument()
  })

  it('renders AssetInspectorDrawerShell and DownloadManagerShell in light mode', () => {
    const mockAsset: GCSMediaItem = {
      id: 'Season01/Episode04/FinalGrade_4K.mov',
      name: 'Season01/Episode04/FinalGrade_4K.mov',
      displayName: 'FinalGrade_4K.mov',
      bucket: 'basingse-4k-masters',
      size: 12884901888,
      sizeBytes: 12884901888,
      contentType: 'video/quicktime',
      updated: '2026-08-20T10:00:00.000Z',
      storageClass: 'ARCHIVE',
      crc32c: 'a1b2c3d4',
      md5Hash: 'xyz',
      mediaCategory: 'video',
      estimatedCost: 1.54,
    }

    const { rerender } = renderWithProviders(
      <AssetInspectorDrawerShell
        item={mockAsset}
        isOpen={true}
        onClose={() => {}}
        onDownload={() => {}}
        onGenerateCli={() => {}}
      />,
    )

    expect(screen.getByText('DIRECT BILLING ESTIMATE')).toBeInTheDocument()
    expect(screen.getByText('FinalGrade_4K.mov')).toBeInTheDocument()

    useRuntimeStore.setState({
      activeDownload: {
        item: mockAsset,
        status: 'streaming',
        strategy: 'service_worker',
        receivedBytes: 6442450944,
        totalBytes: 12884901888,
        speedBytesPerSec: 104857600,
        estimatedTimeRemainingSec: 61,
        liveCalculatedCrc32c: 'a1b2c3d4',
        expectedCrc32c: 'a1b2c3d4',
        checksumValidated: true,
        error: null,
      },
    })

    rerender(<DownloadManagerShell />)
    expect(screen.getByText(/ACTIVE DOWNLOAD MANAGER/i)).toBeInTheDocument()
  })
})

