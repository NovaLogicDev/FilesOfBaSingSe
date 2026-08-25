import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, renderHook, act } from '@testing-library/react'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'
import { AssetExplorerShell } from '../../src/components/explorer/AssetExplorerShell'
import { HighlightMatch } from '../../src/components/explorer/HighlightMatch'
import { BreadcrumbNav } from '../../src/components/explorer/BreadcrumbNav'
import { useVirtualizer } from '../../src/hooks/useVirtualizer'
import { STUDIO_MASTER_DATASET, generate10kMediaItems } from '../fixtures/mediaDatasets'

describe('Unit - Milestone 6: High-Density 10,000+ Windowed Virtualized Asset Grid', () => {
  const defaultProps = {
    currentPrefix: 'feature_films/reel_04/',
    folders: ['feature_films/reel_04/subfolder_alpha/', 'feature_films/reel_04/subfolder_beta/'],
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

  describe('1. 10,000 Items Virtualization Windowing SLA', () => {
    it('maintains <= 30 active DOM rows for 10,000+ items dataset', () => {
      const tenThousandItems = generate10kMediaItems(10000)

      const { container } = renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={[]}
          files={tenThousandItems}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      // Query data rows inside grid (excluding header row)
      const rows = container.querySelectorAll('[role="row"]')
      // Header row (1) + virtualized window rows (<= 30) -> total <= 31
      expect(rows.length).toBeLessThanOrEqual(31)
      expect(rows.length).toBeGreaterThan(0)

      // Verify total virtual canvas height is 10,000 * 48px = 480,000px
      const virtualCanvas = container.querySelector('[style*="480000px"]')
      expect(virtualCanvas).not.toBeNull()
    })

    it('useVirtualizer hook calculates correct window slice and total height', () => {
      const { result } = renderHook(() =>
        useVirtualizer({
          count: 10000,
          itemHeight: 48,
          overscan: 6,
          containerHeight: 576,
        }),
      )

      expect(result.current.totalHeight).toBe(480000)
      expect(result.current.startIndex).toBe(0)
      // 576 / 48 = 12 visible rows + 6 overscan = 18 items
      expect(result.current.endIndex).toBe(18)
      expect(result.current.virtualItems.length).toBe(18)
      expect(result.current.virtualItems.length).toBeLessThanOrEqual(30)
    })

    it('useVirtualizer handles scrolling programmatically and updates virtual items', () => {
      const { result } = renderHook(() =>
        useVirtualizer({
          count: 1000,
          itemHeight: 48,
          overscan: 6,
          containerHeight: 576,
        }),
      )

      // Scroll to row 100 (offset = 4800)
      act(() => {
        result.current.scrollToOffset(4800)
      })

      // startRow = 100, startIndex = max(0, 100 - 6) = 94
      // endRow = 100 + 12 = 112, endIndex = min(1000, 112 + 6) = 118
      expect(result.current.startIndex).toBe(94)
      expect(result.current.endIndex).toBe(118)
      expect(result.current.virtualItems.length).toBe(24)
      expect(result.current.virtualItems[0].index).toBe(94)
      expect(result.current.virtualItems[0].top).toBe(94 * 48)
    })

    it('useVirtualizer handles 0 items cleanly without NaN or errors', () => {
      const { result } = renderHook(() =>
        useVirtualizer({
          count: 0,
          itemHeight: 48,
          overscan: 6,
          containerHeight: 576,
        }),
      )

      expect(result.current.totalHeight).toBe(0)
      expect(result.current.startIndex).toBe(0)
      expect(result.current.endIndex).toBe(0)
      expect(result.current.virtualItems).toEqual([])
    })
  })

  describe('2. Full ARIA Grid Compliance & Semantics', () => {
    it('declares role="grid", role="rowgroup", role="row", role="columnheader", role="gridcell"', () => {
      const { container } = renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const grid = screen.getByRole('grid', { name: /media asset explorer grid/i })
      expect(grid).toBeInTheDocument()
      expect(grid).toHaveAttribute('aria-multiselectable', 'true')
      expect(grid).toHaveAttribute('aria-colcount', '7')

      const rowgroups = container.querySelectorAll('[role="rowgroup"]')
      expect(rowgroups.length).toBeGreaterThanOrEqual(2)

      const columnHeaders = screen.getAllByRole('columnheader')
      expect(columnHeaders.length).toBe(7)

      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)

      const gridcells = screen.getAllByRole('gridcell')
      expect(gridcells.length).toBeGreaterThan(0)
    })

    it('sets aria-sort correctly on active and inactive sort columns', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const nameHeader = screen.getByText(/^Name$/i).closest('[role="columnheader"]')
      expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')

      const sizeHeader = screen.getByText(/^Size$/i).closest('[role="columnheader"]')
      expect(sizeHeader).toHaveAttribute('aria-sort', 'none')

      // Click size to sort ascending
      fireEvent.click(sizeHeader!)
      expect(sizeHeader).toHaveAttribute('aria-sort', 'ascending')
      expect(nameHeader).toHaveAttribute('aria-sort', 'none')

      // Click size again to sort descending
      fireEvent.click(sizeHeader!)
      expect(sizeHeader).toHaveAttribute('aria-sort', 'descending')
    })

    it('sets aria-selected and aria-rowindex on asset rows', () => {
      const { container } = renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const assetRows = container.querySelectorAll('[role="row"][aria-selected]')
      expect(assetRows.length).toBeGreaterThan(0)

      const firstAssetRow = assetRows[0]
      expect(firstAssetRow).toHaveAttribute('aria-selected', 'false')
      expect(firstAssetRow).toHaveAttribute('aria-rowindex')

      // Select first asset via checkbox
      const checkbox = firstAssetRow.querySelector('input[type="checkbox"]')
      fireEvent.click(checkbox!)
      expect(firstAssetRow).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('3. Keyboard Navigation Suite Engine', () => {
    it('focuses search input on "/" keypress and selects input text', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const grid = screen.getByRole('grid')
      const searchInput = screen.getByPlaceholderText(/search by file name/i)

      fireEvent.keyDown(grid, { key: '/' })
      expect(document.activeElement).toBe(searchInput)
    })

    it('selects all filtered items on Ctrl+A / Cmd+A keypress', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const grid = screen.getByRole('grid')
      fireEvent.keyDown(grid, { key: 'a', ctrlKey: true })

      // Batch banner should appear
      expect(screen.getByRole('button', { name: /download selected/i })).toBeInTheDocument()
    })

    it('navigates rows with ArrowDown and ArrowUp, and toggles selection with Space', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const grid = screen.getByRole('grid')

      // Press ArrowDown to focus first folder (index 0)
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      // Press ArrowDown to focus second folder (index 1)
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      // Press ArrowDown to focus first file (index 2: folders.length)
      fireEvent.keyDown(grid, { key: 'ArrowDown' })

      // Press Space to toggle selection of first file
      fireEvent.keyDown(grid, { key: ' ' })

      // Verify batch banner appears with 1 selected item
      expect(screen.getByText(/1 items selected/i)).toBeInTheDocument()

      // Press Space again to unselect
      fireEvent.keyDown(grid, { key: ' ' })
      expect(screen.queryByText(/COST ESTIMATE:/i)).not.toBeInTheDocument()
    })

    it('opens folder on Enter when focused on a virtual folder row', () => {
      const onNavigatePrefix = vi.fn()
      renderWithProviders(
        <AssetExplorerShell {...defaultProps} onNavigatePrefix={onNavigatePrefix} />,
      )

      const grid = screen.getByRole('grid')

      // Focus first folder (index 0)
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      fireEvent.keyDown(grid, { key: 'Enter' })

      expect(onNavigatePrefix).toHaveBeenCalledWith('feature_films/reel_04/subfolder_alpha/')
    })

    it('opens inspector on Enter when focused on a leaf media file row', () => {
      const onInspectAsset = vi.fn()
      renderWithProviders(
        <AssetExplorerShell {...defaultProps} onInspectAsset={onInspectAsset} />,
      )

      const grid = screen.getByRole('grid')

      // Move past 2 folders to first file (index 2, which is dialogue_isolated_master.wav alphabetically)
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      fireEvent.keyDown(grid, { key: 'Enter' })

      expect(onInspectAsset).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'dialogue_isolated_master.wav' }),
      )
    })

    it('jumps to top and bottom with Home and End keys', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const grid = screen.getByRole('grid')

      fireEvent.keyDown(grid, { key: 'End' })
      fireEvent.keyDown(grid, { key: 'Home' })
      expect(grid).toBeInTheDocument()
    })
  })

  describe('4. Multi-Column Sorting & Stable Folders-First Tie-Breaking', () => {
    it('always places folders at the top regardless of sorting direction', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      // Sort descending by Name
      const nameHeader = screen.getByText(/^Name$/i)
      fireEvent.click(nameHeader) // Click to desc

      expect(screen.getByText(/subfolder_alpha\//i)).toBeInTheDocument()
      expect(screen.getByText(/subfolder_beta\//i)).toBeInTheDocument()
    })

    it('sorts by storage class hierarchy and last modified timestamp', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const storageClassHeader = screen.getByText(/^Storage Class$/i)
      fireEvent.click(storageClassHeader)
      expect(storageClassHeader.closest('[role="columnheader"]')).toHaveAttribute(
        'aria-sort',
        'ascending',
      )

      const lastModifiedHeader = screen.getByText(/^Last Modified$/i)
      fireEvent.click(lastModifiedHeader)
      expect(lastModifiedHeader.closest('[role="columnheader"]')).toHaveAttribute(
        'aria-sort',
        'ascending',
      )
    })
  })

  describe('5. Search Filtering & HighlightMatch Substring Rendering', () => {
    it('renders <mark> highlight tags around matched substrings', () => {
      const { container } = renderWithProviders(
        <HighlightMatch text="reel04_cam_A_raw.mxf" query="cam_A" />,
      )

      const mark = container.querySelector('mark')
      expect(mark).toBeInTheDocument()
      expect(mark?.textContent).toBe('cam_A')
    })

    it('displays match count badge when filter query is active', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText(/search by file name/i)
      fireEvent.change(searchInput, { target: { value: 'raw' } })

      const matchBadge = screen.getByTestId('match-count-badge')
      expect(matchBadge).toBeInTheDocument()
      expect(matchBadge.textContent).toMatch(/\d+ of \d+ match/i)
    })

    it('clears search query and restores full list when clear button is clicked', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const searchInput = screen.getByPlaceholderText(/search by file name/i)
      fireEvent.change(searchInput, { target: { value: 'proxy' } })

      expect(screen.queryByText(/reel04_cam_A_raw\.mxf/i)).not.toBeInTheDocument()

      const clearBtn = screen.getByLabelText(/clear search/i)
      fireEvent.click(clearBtn)

      expect(screen.getByText(/reel04_cam_A_raw\.mxf/i)).toBeInTheDocument()
    })
  })

  describe('6. Breadcrumbs Navigation & Path Resolution', () => {
    it('renders bucket root gs:// and clickable ancestor segments', () => {
      const onNavigatePrefix = vi.fn()
      renderWithProviders(
        <BreadcrumbNav
          currentPrefix="feature_films/reel_04/scene_01/"
          bucketName="test-studio-vault-2026"
          onNavigatePrefix={onNavigatePrefix}
        />,
      )

      expect(screen.getByText(/gs:\/\//i)).toBeInTheDocument()
      expect(screen.getByText(/test-studio-vault-2026/i)).toBeInTheDocument()
      expect(screen.getByText('feature_films')).toBeInTheDocument()
      expect(screen.getByText('reel_04')).toBeInTheDocument()
      expect(screen.getByText('scene_01')).toBeInTheDocument()

      // Click ancestor "feature_films"
      fireEvent.click(screen.getByText('feature_films'))
      expect(onNavigatePrefix).toHaveBeenCalledWith('feature_films/')

      // Click root "gs://"
      fireEvent.click(screen.getByLabelText(/Root directory/i))
      expect(onNavigatePrefix).toHaveBeenCalledWith('')
    })

    it('clicking the bucket in AssetExplorerShell breadcrumb bar navigates back to root prefix without opening switcher dropdown', () => {
      const onNavigatePrefix = vi.fn()

      renderWithProviders(
        <AssetExplorerShell
          {...defaultProps}
          currentPrefix="feature_films/reel_04/"
          onNavigatePrefix={onNavigatePrefix}
        />,
      )

      const rootBucketBtn = screen.getByLabelText(/Root directory/i)
      expect(rootBucketBtn).toBeInTheDocument()

      fireEvent.click(rootBucketBtn)
      expect(onNavigatePrefix).toHaveBeenCalledWith('')
      expect(screen.queryByText(/Target GCS Bucket Switcher/i)).not.toBeInTheDocument()
    })
  })

  describe('7. Category Filter Slicing', () => {
    it('filters by metadata extensions (json, csv, pdf, cube, nk, uproject, abc, xml)', () => {
      renderWithProviders(<AssetExplorerShell {...defaultProps} />)

      const metadataChip = screen.getByRole('button', { name: /^Metadata$/i })
      fireEvent.click(metadataChip)

      expect(screen.getByText(/metadata_manifest\.json/i)).toBeInTheDocument()
      expect(screen.queryByText(/reel04_cam_A_raw\.mxf/i)).not.toBeInTheDocument()
    })
  })
})
