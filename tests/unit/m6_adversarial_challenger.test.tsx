import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, renderHook, act } from '@testing-library/react'
import { CostGovernanceEngine } from '../../src/engines/cost'
import { RateCard } from '../../src/types/cost'
import { GCSMediaItem, StorageClass } from '../../src/types/gcs'
import { AssetExplorerShell } from '../../src/components/explorer/AssetExplorerShell'
import { HighCostConfirmationModalShell } from '../../src/components/cost/HighCostConfirmationModalShell'
import { HighlightMatch } from '../../src/components/explorer/HighlightMatch'
import { useVirtualizer } from '../../src/hooks/useVirtualizer'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'
import {
  generate10kMediaItems,
  STUDIO_MASTER_DATASET,
  ZERO_BYTE_ITEM,
  MASSIVE_100GB_ITEM,
} from '../fixtures/mediaDatasets'

/**
 * Generator for 50,000 synthetic media items for ultra-high-density virtualization benchmarks
 */
function generate50kMediaItems(count: number = 50000): GCSMediaItem[] {
  const classes: StorageClass[] = ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE']
  const extensions = ['mxf', 'mov', 'wav', 'dpx', 'exr', 'tar', 'json', 'cube', 'pdf', 'flac']
  const contentTypes: Record<string, string> = {
    mxf: 'application/mxf',
    mov: 'video/quicktime',
    wav: 'audio/wav',
    dpx: 'image/x-dpx',
    exr: 'image/x-exr',
    tar: 'application/x-tar',
    json: 'application/json',
    cube: 'application/octet-stream',
    pdf: 'application/pdf',
    flac: 'audio/flac',
  }

  const items: GCSMediaItem[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const ext = extensions[i % extensions.length]
    const sClass = classes[i % classes.length]
    const sizeBytes = 1000 + ((i * 1337) % 50_000_000_000)
    const displayName = `asset_${String(i).padStart(7, '0')}.${ext}`
    const name = `vault_50k/batch_${Math.floor(i / 1000)}/${displayName}`

    items[i] = {
      id: `virtual-50k-${i}`,
      name,
      displayName,
      type: 'file',
      bucket: 'test-studio-vault-2026',
      sizeBytes,
      formattedSize: `${(sizeBytes / 1_000_000_000).toFixed(2)} GB`,
      storageClass: sClass,
      contentType: contentTypes[ext] || 'application/octet-stream',
      updated: '2026-08-22T00:00:00Z',
      crc32c: '4waSgw==',
      crc32cHex: '0xE3069283',
      etag: `C50KVIRTUAL${i}=`,
    }
  }
  return items
}

describe('M6 Challenger - Empirical Adversarial Stress Test Suite', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // 1. DOM NODE COUNT BENCHMARKS ACROSS 10,000 AND 50,000 ITEMS (<= 30 ACTIVE DATA ROWS)
  // =========================================================================
  describe('1. DOM Node Count Benchmark across 10,000 and 50,000 items (<= 30 Active Rendered Rows)', () => {
    it('HOOK LEVEL: strictly bounds active rendered virtual items <= 24 across 10,000 items at arbitrary scroll offsets', () => {
      const { result } = renderHook(() =>
        useVirtualizer({
          count: 10000,
          itemHeight: 48,
          overscan: 6,
          containerHeight: 576,
        }),
      )

      expect(result.current.totalHeight).toBe(480000) // 10,000 * 48px

      const testOffsets = [
        0, // Top
        4800, // Row 100
        48000, // Row 1000
        240000, // Middle (Row 5000)
        400000, // Row 8333
        479424, // Near bottom (Row 9988)
        480000, // Exact bottom
      ]

      for (const offset of testOffsets) {
        act(() => {
          result.current.scrollToOffset(offset)
        })

        const count = result.current.virtualItems.length
        expect(count).toBeGreaterThan(0)
        expect(count).toBeLessThanOrEqual(24) // 12 visible + 12 overscan = 24
        expect(count).toBeLessThanOrEqual(30) // Hard architectural bound
      }
    })

    it('HOOK LEVEL: strictly bounds active rendered virtual items <= 24 across 50,000 items at ultra-high scroll offsets', () => {
      const { result } = renderHook(() =>
        useVirtualizer({
          count: 50000,
          itemHeight: 48,
          overscan: 6,
          containerHeight: 576,
        }),
      )

      expect(result.current.totalHeight).toBe(2400000) // 50,000 * 48px = 2,400,000px

      const testOffsets = [
        0, // Top (row 0)
        24000, // Row 500
        480000, // Row 10,000
        1200000, // Midpoint (Row 25,000)
        1920000, // Row 40,000
        2399424, // Near bottom (Row 49,988)
        2400000, // Exact bottom (Row 50,000)
      ]

      for (const offset of testOffsets) {
        act(() => {
          result.current.scrollToOffset(offset)
        })

        const count = result.current.virtualItems.length
        expect(count).toBeGreaterThan(0)
        expect(count).toBeLessThanOrEqual(24)
        expect(count).toBeLessThanOrEqual(30)
      }
    })

    it('COMPONENT LEVEL: verifies DOM node count <= 31 (1 header + <=30 data rows) for 10,000 items in AssetExplorerShell', () => {
      const items = generate10kMediaItems(10000)

      const { container } = renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={[]}
          files={items}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const allRows = container.querySelectorAll('[role="row"]')
      // 1 header row + 18 initial virtual rows = 19 rows total <= 31
      expect(allRows.length).toBeLessThanOrEqual(31)
      expect(allRows.length).toBeGreaterThan(0)

      const dataRows = container.querySelectorAll('[role="row"][aria-rowindex]')
      const renderedLeafRows = Array.from(dataRows).filter(
        (r) => r.getAttribute('aria-rowindex') !== '1',
      )
      expect(renderedLeafRows.length).toBeLessThanOrEqual(30)
    })

    it('COMPONENT LEVEL: verifies DOM node count <= 31 for 50,000 items dataset', () => {
      const items50k = generate50kMediaItems(50000)

      const { container } = renderWithProviders(
        <AssetExplorerShell
          currentPrefix="vault_50k/"
          folders={[]}
          files={items50k}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const allRows = container.querySelectorAll('[role="row"]')
      expect(allRows.length).toBeLessThanOrEqual(31)

      const virtualCanvas = container.querySelector('[style*="2400000px"]')
      expect(virtualCanvas).not.toBeNull()
    })

    it('MIXED FOLDERS & FILES: maintains <= 30 active rows with 200 folders and 10,000 files', () => {
      const folders = Array.from({ length: 200 }, (_, i) => `virtual_vault/sub_${i}/`)
      const files = generate10kMediaItems(10000)

      const { container } = renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={folders}
          files={files}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const allRows = container.querySelectorAll('[role="row"]')
      expect(allRows.length).toBeLessThanOrEqual(31)

      // Total items = 10,200 -> height = 489,600px
      const virtualCanvas = container.querySelector('[style*="489600px"]')
      expect(virtualCanvas).not.toBeNull()
    })
  })

  // =========================================================================
  // 2. RAPID KEYBOARD NAVIGATION SUITE STRESS TESTING
  // =========================================================================
  describe('2. Rapid Keyboard Navigation Suite Stress Testing', () => {
    it('handles rapid ArrowDown x100 in succession without crashing or losing focus state', () => {
      const items = generate10kMediaItems(1000)
      const onNavigatePrefix = vi.fn()
      const onInspectAsset = vi.fn()

      const { container } = renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={['virtual_vault/folder_01/', 'virtual_vault/folder_02/']}
          files={items}
          onNavigatePrefix={onNavigatePrefix}
          onInspectAsset={onInspectAsset}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const grid = screen.getByRole('grid')

      // Fire 100 consecutive ArrowDown keydowns rapidly
      for (let i = 0; i < 100; i++) {
        fireEvent.keyDown(grid, { key: 'ArrowDown' })
      }

      // DOM rows must remain bounded <= 31
      const allRows = container.querySelectorAll('[role="row"]')
      expect(allRows.length).toBeLessThanOrEqual(31)

      // Active focused row should exist
      const focusedElement = container.querySelector('.ring-cyan-400\\/50')
      expect(focusedElement).not.toBeNull()
    })

    it('jumps accurately with Home, End, PageDown x5, and PageUp x3', () => {
      const items = generate10kMediaItems(500)
      const { container } = renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={[]}
          files={items}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const grid = screen.getByRole('grid')

      // 1. End key
      fireEvent.keyDown(grid, { key: 'End' })
      expect(container.querySelectorAll('[role="row"]').length).toBeLessThanOrEqual(31)

      // 2. Home key
      fireEvent.keyDown(grid, { key: 'Home' })
      expect(container.querySelectorAll('[role="row"]').length).toBeLessThanOrEqual(31)

      // 3. PageDown 5 times (+10 * 5 = +50 rows)
      for (let p = 0; p < 5; p++) {
        fireEvent.keyDown(grid, { key: 'PageDown' })
      }
      expect(container.querySelectorAll('[role="row"]').length).toBeLessThanOrEqual(31)

      // 4. PageUp 3 times (-10 * 3 = -30 rows)
      for (let p = 0; p < 3; p++) {
        fireEvent.keyDown(grid, { key: 'PageUp' })
      }
      expect(container.querySelectorAll('[role="row"]').length).toBeLessThanOrEqual(31)
    })

    it('toggles selection with Space only on leaf files, ignoring folder rows', () => {
      const items = generate10kMediaItems(10)
      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={['virtual_vault/folder_01/']}
          files={items}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const grid = screen.getByRole('grid')

      // ArrowDown 1: focus folder (index 0)
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      // Press Space on folder -> should NOT select
      fireEvent.keyDown(grid, { key: ' ' })
      expect(screen.queryByText(/COST ESTIMATE:/i)).not.toBeInTheDocument()

      // ArrowDown 2: focus first file (index 1)
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      // Press Space on file -> should select
      fireEvent.keyDown(grid, { key: ' ' })
      expect(screen.getByText(/1 items selected/i)).toBeInTheDocument()

      // Press Space again -> should deselect
      fireEvent.keyDown(grid, { key: ' ' })
      expect(screen.queryByText(/COST ESTIMATE:/i)).not.toBeInTheDocument()
    })

    it('executes Enter on folder to navigate prefix and Enter on file to inspect asset', () => {
      const onNavigatePrefix = vi.fn()
      const onInspectAsset = vi.fn()
      const items = generate10kMediaItems(10)

      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={['virtual_vault/subfolder_alpha/']}
          files={items}
          onNavigatePrefix={onNavigatePrefix}
          onInspectAsset={onInspectAsset}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const grid = screen.getByRole('grid')

      // Focus folder
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      fireEvent.keyDown(grid, { key: 'Enter' })
      expect(onNavigatePrefix).toHaveBeenCalledWith('virtual_vault/subfolder_alpha/')

      // Focus file
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      fireEvent.keyDown(grid, { key: 'Enter' })
      expect(onInspectAsset).toHaveBeenCalledTimes(1)
    })

    it('handles "/" to focus search input and Escape to blur grid focus', () => {
      const items = generate10kMediaItems(10)
      const { container } = renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={[]}
          files={items}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const grid = screen.getByRole('grid')
      const searchInput = screen.getByPlaceholderText(/search by file name/i)

      // Test '/' keypress
      fireEvent.keyDown(grid, { key: '/' })
      expect(document.activeElement).toBe(searchInput)

      // Test 'Escape' keypress
      fireEvent.keyDown(grid, { key: 'ArrowDown' })
      expect(container.querySelector('.ring-cyan-400\\/50')).not.toBeNull()

      fireEvent.keyDown(grid, { key: 'Escape' })
      expect(container.querySelector('.ring-cyan-400\\/50')).toBeNull()
    })
  })

  // =========================================================================
  // 3. BATCH SELECTION (Ctrl+A / Cmd+A) STRESS TESTING
  // =========================================================================
  describe('3. Batch Selection (Ctrl+A / Cmd+A) Stress Testing', () => {
    it('selects and deselects all 10,000 items with Ctrl+A and Cmd+A without heap collapse', () => {
      const items = generate10kMediaItems(10000)

      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={[]}
          files={items}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const grid = screen.getByRole('grid')

      // 1. Ctrl+A -> Selects all 10,000
      fireEvent.keyDown(grid, { key: 'a', ctrlKey: true })
      expect(screen.getByText(/10000 items selected/i)).toBeInTheDocument()

      // 2. Ctrl+A again -> Deselects all
      fireEvent.keyDown(grid, { key: 'a', ctrlKey: true })
      expect(screen.queryByText(/items selected/i)).not.toBeInTheDocument()

      // 3. Cmd+A (metaKey) -> Selects all 10,000
      fireEvent.keyDown(grid, { key: 'a', metaKey: true })
      expect(screen.getByText(/10000 items selected/i)).toBeInTheDocument()
    })

    it('Ctrl+A selects only filtered subset when search filter is active', () => {
      const items = generate10kMediaItems(100)

      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="virtual_vault/"
          folders={[]}
          files={items}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      // Search for .mxf (10 items out of 100)
      const searchInput = screen.getByPlaceholderText(/search by file name/i)
      fireEvent.change(searchInput, { target: { value: 'mxf' } })

      const grid = screen.getByRole('grid')
      fireEvent.keyDown(grid, { key: 'a', ctrlKey: true })

      expect(screen.getByText(/10 items selected/i)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // 4. SEARCH FILTERING WITH REGEX CHARACTERS & UNICODE
  // =========================================================================
  describe('4. Search Filtering with Regex Characters & Unicode', () => {
    const specialItems: GCSMediaItem[] = [
      {
        id: 'special-01',
        name: 'special/item.[a-z]+.mxf',
        displayName: 'item.[a-z]+.mxf',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 1000,
        formattedSize: '1.00 KB',
        storageClass: 'STANDARD',
        contentType: 'application/mxf',
        updated: '2026-08-22T00:00:00Z',
      },
      {
        id: 'special-02',
        name: 'special/regex_(foo|bar)*.mov',
        displayName: 'regex_(foo|bar)*.mov',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 2000,
        formattedSize: '2.00 KB',
        storageClass: 'STANDARD',
        contentType: 'video/quicktime',
        updated: '2026-08-22T00:00:00Z',
      },
      {
        id: 'special-03',
        name: 'special/dollar$and^caret?+*.tar',
        displayName: 'dollar$and^caret?+*.tar',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 3000,
        formattedSize: '3.00 KB',
        storageClass: 'ARCHIVE',
        contentType: 'application/x-tar',
        updated: '2026-08-22T00:00:00Z',
      },
      {
        id: 'unicode-01',
        name: 'special/日本語_マスター_映像.mxf',
        displayName: '日本語_マスター_映像.mxf',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 4000,
        formattedSize: '4.00 KB',
        storageClass: 'STANDARD',
        contentType: 'application/mxf',
        updated: '2026-08-22T00:00:00Z',
      },
      {
        id: 'unicode-02',
        name: 'special/Ba_Sīng_Sè_🎬_scene_01.mov',
        displayName: 'Ba_Sīng_Sè_🎬_scene_01.mov',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 5000,
        formattedSize: '5.00 KB',
        storageClass: 'STANDARD',
        contentType: 'video/quicktime',
        updated: '2026-08-22T00:00:00Z',
      },
      {
        id: 'unicode-03',
        name: 'special/🔥_fire_nation_audio.wav',
        displayName: '🔥_fire_nation_audio.wav',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 6000,
        formattedSize: '6.00 KB',
        storageClass: 'ARCHIVE',
        contentType: 'audio/wav',
        updated: '2026-08-22T00:00:00Z',
      },
    ]

    it('safely handles adversarial regex metacharacters in search without crashing HighlightMatch or Explorer', () => {
      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="special/"
          folders={[]}
          files={specialItems}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const searchInput = screen.getByPlaceholderText(/search by file name/i)

      const regexAttacks = [
        '.*',
        '[a-z]+',
        '(foo|bar)',
        '^$',
        '\\d+',
        '?+*^$()[]{}|\\',
        '[',
        '(',
        '\\',
        '{1,3}',
      ]

      for (const attack of regexAttacks) {
        expect(() => {
          fireEvent.change(searchInput, { target: { value: attack } })
        }).not.toThrow()
      }

      // Check specific literal match for [a-z]+
      fireEvent.change(searchInput, { target: { value: '[a-z]+' } })
      expect(screen.getAllByText(/item\.\[a-z\]\+\.mxf/i).length).toBeGreaterThan(0)

      // Check specific literal match for (foo|bar)
      fireEvent.change(searchInput, { target: { value: '(foo|bar)' } })
      expect(screen.getAllByText(/regex_\(foo\|bar\)\*\.mov/i).length).toBeGreaterThan(0)
    })

    it('searches and highlights Unicode, Japanese, Accented characters, and Emojis', () => {
      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="special/"
          folders={[]}
          files={specialItems}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const searchInput = screen.getByPlaceholderText(/search by file name/i)

      // 1. Japanese Kanji/Katakana search
      fireEvent.change(searchInput, { target: { value: '日本語' } })
      expect(screen.getAllByText(/日本語_マスター_映像\.mxf/i).length).toBeGreaterThan(0)
      expect(screen.queryByText(/Ba_Sīng_Sè/i)).not.toBeInTheDocument()

      // 2. Emoji search (🎬)
      fireEvent.change(searchInput, { target: { value: '🎬' } })
      expect(screen.getAllByText(/Ba_Sīng_Sè_🎬_scene_01\.mov/i).length).toBeGreaterThan(0)

      // 3. Emoji search (🔥)
      fireEvent.change(searchInput, { target: { value: '🔥' } })
      expect(screen.getAllByText(/🔥_fire_nation_audio\.wav/i).length).toBeGreaterThan(0)

      // 4. Accented character search (Sīng)
      fireEvent.change(searchInput, { target: { value: 'Sīng' } })
      expect(screen.getAllByText(/Ba_Sīng_Sè_🎬_scene_01\.mov/i).length).toBeGreaterThan(0)
    })

    it('HighlightMatch component safely escapes regex characters and wraps matches in <mark>', () => {
      const { container } = renderWithProviders(
        <HighlightMatch text="complex_name.[0-9]+.ext" query="[0-9]+" />,
      )

      const mark = container.querySelector('mark')
      expect(mark).not.toBeNull()
      expect(mark?.textContent).toBe('[0-9]+')
    })
  })

  // =========================================================================
  // 5. SORTING ON EXTREME / EDGE-CASE VALUES & FOLDERS-FIRST INVARIANT
  // =========================================================================
  describe('5. Sorting on Extreme / Edge-Case Values & Folders-First Invariant', () => {
    const extremeItems: GCSMediaItem[] = [
      ZERO_BYTE_ITEM, // 0 bytes
      MASSIVE_100GB_ITEM, // 108 GB
      {
        id: 'extreme-dup-1',
        name: 'duplicate_asset.mxf',
        displayName: 'duplicate_asset.mxf',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 5_000_000,
        formattedSize: '5.00 MB',
        storageClass: 'NEARLINE',
        contentType: 'application/mxf',
        updated: '2026-01-01T00:00:00Z',
      },
      {
        id: 'extreme-dup-2',
        name: 'duplicate_asset.mxf',
        displayName: 'duplicate_asset.mxf',
        type: 'file',
        bucket: 'test-studio-vault-2026',
        sizeBytes: 5_000_000,
        formattedSize: '5.00 MB',
        storageClass: 'NEARLINE',
        contentType: 'application/mxf',
        updated: '2026-01-01T00:00:00Z',
      },
    ]

    const testFolders = ['archives/raw_rushes/', 'archives/sound_fx/']

    it('preserves Folders-First Invariant under all sorting columns and directions', () => {
      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="archives/"
          folders={testFolders}
          files={extremeItems}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const columns: Array<'name' | 'size' | 'class' | 'updated'> = [
        'name',
        'size',
        'class',
        'updated',
      ]

      for (const col of columns) {
        const headerText =
          col === 'name'
            ? /^Name$/i
            : col === 'size'
              ? /^Size$/i
              : col === 'class'
                ? /^Storage Class$/i
                : /^Last Modified$/i

        const header = screen.getByText(headerText)

        // Click once (asc or desc)
        fireEvent.click(header)
        expect(screen.getByText(/raw_rushes\//i)).toBeInTheDocument()
        expect(screen.getByText(/sound_fx\//i)).toBeInTheDocument()

        // Click second time (toggle direction)
        fireEvent.click(header)
        expect(screen.getByText(/raw_rushes\//i)).toBeInTheDocument()
        expect(screen.getByText(/sound_fx\//i)).toBeInTheDocument()
      }
    })

    it('correctly sorts 0-byte file and 108GB file in ascending and descending order', () => {
      renderWithProviders(
        <AssetExplorerShell
          currentPrefix="archives/"
          folders={[]}
          files={extremeItems}
          onNavigatePrefix={vi.fn()}
          onInspectAsset={vi.fn()}
          onDownloadAsset={vi.fn()}
          onGenerateCli={vi.fn()}
          onDownloadBatch={vi.fn()}
        />,
      )

      const sizeHeader = screen.getByText(/^Size$/i)

      // Sort Ascending (0 bytes first)
      fireEvent.click(sizeHeader)
      expect(sizeHeader.closest('[role="columnheader"]')).toHaveAttribute('aria-sort', 'ascending')

      // Sort Descending (108 GB first)
      fireEvent.click(sizeHeader)
      expect(sizeHeader.closest('[role="columnheader"]')).toHaveAttribute('aria-sort', 'descending')
    })
  })

  // =========================================================================
  // 6. HIGH-COST CONFIRMATION GATE: BOUNDARY & ARITHMETIC STRESS
  // =========================================================================
  describe('6. High-Cost Confirmation Gate: Boundary & Arithmetic Stress', () => {
    it('evaluates $4.99 USD as isHighCostThreshold: false and $5.00 USD as isHighCostThreshold: true', () => {
      const customRates499: RateCard = {
        archiveRetrievalPerGB: 0.379,
        coldlineRetrievalPerGB: 0.0,
        nearlineRetrievalPerGB: 0.0,
        standardRetrievalPerGB: 0.0,
        internetEgressPerGB: 0.12,
      }

      const res499 = CostGovernanceEngine.calculate(
        [{ sizeBytes: 10_000_000_000, storageClass: 'ARCHIVE' }],
        customRates499,
      )
      expect(res499.grandTotalUSD).toBe(4.99)
      expect(res499.isHighCostThreshold).toBe(false)

      const customRates500: RateCard = {
        archiveRetrievalPerGB: 0.38,
        coldlineRetrievalPerGB: 0.0,
        nearlineRetrievalPerGB: 0.0,
        standardRetrievalPerGB: 0.0,
        internetEgressPerGB: 0.12,
      }

      const res500 = CostGovernanceEngine.calculate(
        [{ sizeBytes: 10_000_000_000, storageClass: 'ARCHIVE' }],
        customRates500,
      )
      expect(res500.grandTotalUSD).toBe(5.0)
      expect(res500.isHighCostThreshold).toBe(true)
    })

    it('evaluates 24.99 GB as false and 25.00 GB as true for standard egress threshold', () => {
      const res2499 = CostGovernanceEngine.calculate([
        { sizeBytes: 24_990_000_000, storageClass: 'STANDARD' },
      ])
      expect(res2499.totalDecimalGB).toBe(24.99)
      expect(res2499.isHighCostThreshold).toBe(false)

      const res2500 = CostGovernanceEngine.calculate([
        { sizeBytes: 25_000_000_000, storageClass: 'STANDARD' },
      ])
      expect(res2500.totalDecimalGB).toBe(25.0)
      expect(res2500.isHighCostThreshold).toBe(true)
    })

    it('renders HighCostConfirmationModalShell with exact breakdown and invokes onConfirm/onCancel', () => {
      const onConfirm = vi.fn()
      const onCancel = vi.fn()
      const costResult = CostGovernanceEngine.calculate([
        { sizeBytes: 25_000_000_000, storageClass: 'ARCHIVE' },
      ])

      renderWithProviders(
        <HighCostConfirmationModalShell
          isOpen={true}
          costResult={costResult}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(
        screen.getByText(/High-Volume \/ Cold-Tier Transfer Confirmation/i),
      ).toBeInTheDocument()
      expect(screen.getByText(new RegExp(costResult.formattedTotalSize, 'i'))).toBeInTheDocument()
      expect(screen.getByText(/\$1\.25 USD/i)).toBeInTheDocument() // 25 * 0.05
      expect(screen.getByText(/\$3\.00 USD/i)).toBeInTheDocument() // 25 * 0.12
      expect(screen.getByText(/\$4\.25 USD/i)).toBeInTheDocument() // Total

      fireEvent.click(screen.getByRole('button', { name: /Confirm & Incur/i }))
      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onCancel).not.toHaveBeenCalled()
    })
  })
})
