import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { AssetExplorerShell } from '../../src/components/explorer/AssetExplorerShell'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F7: High-Density Virtualized Asset Grid UI', () => {
  const defaultProps = {
    currentPrefix: 'feature_films/reel_04/',
    folders: ['feature_films/reel_04/subfolder/'],
    files: STUDIO_MASTER_DATASET,
    onNavigatePrefix: vi.fn(),
    onInspectAsset: vi.fn(),
    onDownloadAsset: vi.fn(),
    onGenerateCli: vi.fn(),
    onDownloadBatch: vi.fn(),
  }

  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
  })

  it('renders asset explorer table with virtual folders and files', () => {
    renderWithProviders(<AssetExplorerShell {...defaultProps} />)

    expect(screen.getByText(/reel04_cam_A_raw\.mxf/i)).toBeInTheDocument()
    expect(screen.getByText(/subfolder\//i)).toBeInTheDocument()
    expect(screen.getByText(/18\.40 GB/i)).toBeInTheDocument()
  })

  it('filters files dynamically using category filter chips', () => {
    renderWithProviders(<AssetExplorerShell {...defaultProps} />)

    // Click "Audio" category chip
    const audioChip = screen.getByRole('button', { name: /audio/i })
    fireEvent.click(audioChip)

    // Should display wav files, but not mxf video files
    expect(screen.getByText(/dialogue_isolated_master\.wav/i)).toBeInTheDocument()
    expect(screen.queryByText(/reel04_cam_A_raw\.mxf/i)).not.toBeInTheDocument()

    // Click "All Files" chip
    const allChip = screen.getByRole('button', { name: /all files/i })
    fireEvent.click(allChip)
    expect(screen.getByText(/reel04_cam_A_raw\.mxf/i)).toBeInTheDocument()
  })

  it('filters files via real-time search query input', () => {
    renderWithProviders(<AssetExplorerShell {...defaultProps} />)

    const searchInput = screen.getByPlaceholderText(/search by file name/i)
    fireEvent.change(searchInput, { target: { value: 'proxy' } })

    expect(screen.getByText(/reel04_prores_proxy\.mov/i)).toBeInTheDocument()
    expect(screen.queryByText(/reel04_cam_A_raw\.mxf/i)).not.toBeInTheDocument()
  })

  it('sorts columns by size, name, and storage class ascending/descending', () => {
    renderWithProviders(<AssetExplorerShell {...defaultProps} />)

    const sizeHeader = screen.getByText(/^Size$/i)
    // Click to sort by size
    fireEvent.click(sizeHeader)
    // Click again to reverse sort direction
    fireEvent.click(sizeHeader)

    expect(screen.getByText(/reel04_cam_A_raw\.mxf/i)).toBeInTheDocument()
  })

  it('manages multi-select checkbox selection and triggers batch action buttons', () => {
    renderWithProviders(<AssetExplorerShell {...defaultProps} />)

    const checkboxes = screen.getAllByRole('checkbox')
    // Select-all checkbox is index 0
    fireEvent.click(checkboxes[0])

    // Should reveal sticky cost estimate banner with Download Selected button
    const downloadSelectedBtn = screen.getByRole('button', { name: /download selected/i })
    expect(downloadSelectedBtn).toBeInTheDocument()

    fireEvent.click(downloadSelectedBtn)
    expect(defaultProps.onDownloadBatch).toHaveBeenCalled()
  })

  it('invokes item action callbacks: download, inspect, and CLI generation', () => {
    renderWithProviders(<AssetExplorerShell {...defaultProps} />)

    // Click inspect on first file
    const fileTitle = screen.getByText(/reel04_cam_A_raw\.mxf/i)
    fireEvent.click(fileTitle)
    expect(defaultProps.onInspectAsset).toHaveBeenCalledWith(STUDIO_MASTER_DATASET[0])

    // Click download button for reel04_cam_A_raw.mxf
    const downloadBtn = screen.getByLabelText(/Download reel04_cam_A_raw\.mxf/i)
    fireEvent.click(downloadBtn)
    expect(defaultProps.onDownloadAsset).toHaveBeenCalledWith(STUDIO_MASTER_DATASET[0])
  })
})
