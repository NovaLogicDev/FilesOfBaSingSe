import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { AssetInspectorDrawerShell } from '../../src/components/inspector/AssetInspectorDrawerShell'
import { usePersistentStore } from '../../src/store/persistentStore'
import { resetAllStores, renderWithProviders } from '../helpers/testUtils'
import { GCSMediaItem } from '../../src/types/gcs'

const sampleArchiveItem: GCSMediaItem = {
  id: 'partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_A_raw.mxf',
  name: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
  displayName: 'reel04_cam_A_raw.mxf',
  type: 'file',
  bucket: 'partner-raw-master-archives-2026',
  sizeBytes: 18_400_000_000,
  formattedSize: '18.40 GB',
  storageClass: 'ARCHIVE',
  contentType: 'application/mxf',
  updated: '2026-07-14T10:22:15.000Z',
  timeCreated: '2026-07-14T10:22:15.000Z',
  crc32c: 'r4L2wA==',
  crc32cHex: '0xAF82F6C0',
  md5Hash: '3a4f8d9b1c2e4a5f6e7d8c9b',
  etag: 'CP+34f9a0=',
  generation: '1721038935129482',
}

const sampleStandardItem: GCSMediaItem = {
  id: 'partner-raw-master-archives-2026/feature_films/reel_04/reel04_prores_proxy.mov',
  name: 'feature_films/reel_04/reel04_prores_proxy.mov',
  displayName: 'reel04_prores_proxy.mov',
  type: 'file',
  bucket: 'partner-raw-master-archives-2026',
  sizeBytes: 8_000_000_000,
  formattedSize: '8.00 GB',
  storageClass: 'STANDARD',
  contentType: 'video/quicktime',
  updated: '2026-07-14T10:22:15.000Z',
  timeCreated: '2026-07-14T10:22:15.000Z',
  crc32c: 'ab12cd==',
  crc32cHex: '0x12345678',
  etag: 'CP+proxy99=',
}

describe('AssetInspectorDrawerShell - Direct Billing Estimate & Technical Metadata', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
  })

  it('renders accurate Direct Billing Estimate for ARCHIVE asset with default empty customPricing (NO $NaN)', () => {
    // Persistent store has default customPricing: {}
    expect(usePersistentStore.getState().customPricing).toEqual({})

    renderWithProviders(
      <AssetInspectorDrawerShell
        item={sampleArchiveItem}
        isOpen={true}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onGenerateCli={vi.fn()}
      />,
    )

    // Direct Billing Estimate card header
    expect(screen.getByText(/DIRECT BILLING ESTIMATE/i)).toBeInTheDocument()

    // Must NOT contain NaN anywhere in the document
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\$NaN/i)).not.toBeInTheDocument()

    // Verify itemized calculations:
    // 18.40 GB Archive retrieval: 18.4 * $0.05 = $0.92
    expect(screen.getByText(/ARCHIVE Retrieval:/i)).toBeInTheDocument()
    expect(screen.getByText('$0.92')).toBeInTheDocument()

    // 18.40 GB Egress: 18.4 * $0.12 = $2.21
    expect(screen.getByText(/Google Egress \(\$0\.12\/GB\):/i)).toBeInTheDocument()
    expect(screen.getByText('$2.21')).toBeInTheDocument()

    // Grand total: $0.92 + $2.208 = $3.13 USD
    expect(screen.getByText(/TOTAL ESTIMATE:/i)).toBeInTheDocument()
    expect(screen.getByText('$3.13 USD')).toBeInTheDocument()
  })

  it('renders accurate Direct Billing Estimate for STANDARD asset ($0.00 retrieval, $0.96 egress)', () => {
    renderWithProviders(
      <AssetInspectorDrawerShell
        item={sampleStandardItem}
        isOpen={true}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onGenerateCli={vi.fn()}
      />,
    )

    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument()

    // 8.00 GB Standard retrieval: $0.00
    expect(screen.getByText(/STANDARD Retrieval:/i)).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()

    // 8.00 GB Egress: 8.0 * $0.12 = $0.96
    expect(screen.getByText(/Google Egress \(\$0\.12\/GB\):/i)).toBeInTheDocument()
    expect(screen.getByText('$0.96')).toBeInTheDocument()

    // Total: $0.96 USD
    expect(screen.getByText('$0.96 USD')).toBeInTheDocument()
  })

  it('dynamically adapts to custom pricing overrides', () => {
    usePersistentStore.setState({
      customPricing: {
        archiveRetrievalPerGB: 0.02,
        internetEgressPerGB: 0.08,
      },
    })

    renderWithProviders(
      <AssetInspectorDrawerShell
        item={sampleArchiveItem}
        isOpen={true}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onGenerateCli={vi.fn()}
      />,
    )

    // 18.4 * 0.02 = $0.37 retrieval
    expect(screen.getByText('$0.37')).toBeInTheDocument()

    // 18.4 * 0.08 = $1.47 egress (with dynamic rate label)
    expect(screen.getByText(/Google Egress \(\$0\.08\/GB\):/i)).toBeInTheDocument()
    expect(screen.getByText('$1.47')).toBeInTheDocument()

    // Total: $1.84 USD
    expect(screen.getByText('$1.84 USD')).toBeInTheDocument()
  })

  it('renders Free Trial Covered badge when isFreeTrialAccount is true', () => {
    usePersistentStore.setState({
      isFreeTrialAccount: true,
    })

    renderWithProviders(
      <AssetInspectorDrawerShell
        item={sampleArchiveItem}
        isOpen={true}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onGenerateCli={vi.fn()}
      />,
    )

    expect(screen.getByText(/Free Trial Covered/i)).toBeInTheDocument()
  })

  it('triggers download and cli modal actions properly', () => {
    const onDownload = vi.fn()
    const onGenerateCli = vi.fn()
    const onClose = vi.fn()

    renderWithProviders(
      <AssetInspectorDrawerShell
        item={sampleArchiveItem}
        isOpen={true}
        onClose={onClose}
        onDownload={onDownload}
        onGenerateCli={onGenerateCli}
      />,
    )

    // Click download button
    const downloadBtn = screen.getByRole('button', { name: /Stream Download to Disk/i })
    fireEvent.click(downloadBtn)
    expect(onDownload).toHaveBeenCalledWith(sampleArchiveItem)
    expect(onClose).toHaveBeenCalled()

    // Click CLI modal button
    const cliBtn = screen.getByRole('button', { name: /CLI Modal/i })
    fireEvent.click(cliBtn)
    expect(onGenerateCli).toHaveBeenCalledWith(sampleArchiveItem)
  })

  it('closes drawer on Escape key or Close button', () => {
    const onClose = vi.fn()

    renderWithProviders(
      <AssetInspectorDrawerShell
        item={sampleArchiveItem}
        isOpen={true}
        onClose={onClose}
        onDownload={vi.fn()}
        onGenerateCli={vi.fn()}
      />,
    )

    // Click close button
    const closeBtn = screen.getByRole('button', { name: /Close drawer/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
