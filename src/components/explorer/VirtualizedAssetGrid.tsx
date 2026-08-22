import React, { useState, useCallback, useRef, useEffect, memo } from 'react'
import { ArrowUpDown, RefreshCw, ShieldCheck, Inbox } from 'lucide-react'
import { GCSMediaItem } from '../../types'
import { useVirtualizer } from '../../hooks/useVirtualizer'
import { FolderRow } from './FolderRow'
import { AssetRow } from './AssetRow'

export interface VirtualizedAssetGridProps {
  currentPrefix: string
  folders: string[]
  files: GCSMediaItem[]
  selectedItemIds: Set<string>
  searchQuery: string
  sortColumn: 'name' | 'size' | 'class' | 'updated'
  sortAsc: boolean
  nextPageToken?: string
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  onToggleSelectItem: (id: string) => void
  onToggleSelectAll: () => void
  onSort: (column: 'name' | 'size' | 'class' | 'updated') => void
  onNavigatePrefix: (prefix: string) => void
  onInspectAsset: (item: GCSMediaItem) => void
  onDownloadAsset: (item: GCSMediaItem) => void
  onGenerateCli: (selectedPaths: string[]) => void
  onLoadNextPage?: () => void
}

export const VirtualizedAssetGrid: React.FC<VirtualizedAssetGridProps> = memo(
  ({
    currentPrefix,
    folders,
    files,
    selectedItemIds,
    searchQuery,
    sortColumn,
    sortAsc,
    nextPageToken,
    searchInputRef,
    onToggleSelectItem,
    onToggleSelectAll,
    onSort,
    onNavigatePrefix,
    onInspectAsset,
    onDownloadAsset,
    onGenerateCli,
    onLoadNextPage,
  }) => {
    const totalCount = folders.length + files.length
    const allSelected = files.length > 0 && selectedItemIds.size === files.length
    const [focusedIndex, setFocusedIndex] = useState<number>(-1)

    const scrollContainerRef = useRef<HTMLDivElement | null>(null)

    const virtualizer = useVirtualizer({
      count: totalCount,
      itemHeight: 48,
      overscan: 6,
      containerHeight: 576,
      getScrollElement: () => scrollContainerRef.current,
    })

    // Reset focused index when folder or files change
    useEffect(() => {
      setFocusedIndex(-1)
    }, [currentPrefix, folders.length, files.length])

    // Keyboard navigation suite
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        // 1. '/' focuses search input
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (searchInputRef?.current) {
            e.preventDefault()
            searchInputRef.current.focus()
            searchInputRef.current.select()
          }
          return
        }

        // 2. 'Ctrl+A' or 'Cmd+A' selects all
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          onToggleSelectAll()
          return
        }

        // 3. 'Escape' blurs grid or clears selection
        if (e.key === 'Escape') {
          setFocusedIndex(-1)
          return
        }

        if (totalCount === 0) return

        // 4. Arrow navigation
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = Math.min(totalCount - 1, prev + 1)
            virtualizer.scrollToIndex(next, { align: 'auto' })
            return next
          })
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = Math.max(0, prev - 1)
            virtualizer.scrollToIndex(next, { align: 'auto' })
            return next
          })
          return
        }

        // 5. Home / End
        if (e.key === 'Home') {
          e.preventDefault()
          setFocusedIndex(0)
          virtualizer.scrollToIndex(0, { align: 'start' })
          return
        }

        if (e.key === 'End') {
          e.preventDefault()
          const lastIdx = totalCount - 1
          setFocusedIndex(lastIdx)
          virtualizer.scrollToIndex(lastIdx, { align: 'end' })
          return
        }

        // 6. PageUp / PageDown
        if (e.key === 'PageDown') {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = Math.min(totalCount - 1, (prev < 0 ? 0 : prev) + 10)
            virtualizer.scrollToIndex(next, { align: 'auto' })
            return next
          })
          return
        }

        if (e.key === 'PageUp') {
          e.preventDefault()
          setFocusedIndex((prev) => {
            const next = Math.max(0, (prev < 0 ? 0 : prev) - 10)
            virtualizer.scrollToIndex(next, { align: 'auto' })
            return next
          })
          return
        }

        // 7. Space toggles checkbox for focused row
        if (e.key === ' ' || e.key === 'Spacebar') {
          if (focusedIndex >= folders.length) {
            e.preventDefault()
            const file = files[focusedIndex - folders.length]
            if (file) {
              onToggleSelectItem(file.id)
            }
          }
          return
        }

        // 8. Enter opens folder or opens Inspector for file
        if (e.key === 'Enter') {
          if (focusedIndex >= 0 && focusedIndex < folders.length) {
            e.preventDefault()
            const folder = folders[focusedIndex]
            if (folder) onNavigatePrefix(folder)
          } else if (focusedIndex >= folders.length) {
            e.preventDefault()
            const file = files[focusedIndex - folders.length]
            if (file) onInspectAsset(file)
          }
        }
      },
      [
        totalCount,
        folders,
        files,
        searchInputRef,
        onToggleSelectAll,
        onToggleSelectItem,
        onNavigatePrefix,
        onInspectAsset,
        virtualizer,
        focusedIndex,
      ],
    )

    return (
      <div
        role="grid"
        aria-label="Media Asset Explorer Grid"
        aria-rowcount={totalCount + 1}
        aria-colcount={7}
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
      >
        <div className="overflow-x-auto">
          {/* Header Row */}
          <div
            role="rowgroup"
            className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold select-none min-w-[800px]"
          >
            <div
              role="row"
              aria-rowindex={1}
              className="grid grid-cols-[40px_minmax(0,1fr)_112px_96px_144px_112px_128px] items-center px-4 py-3 text-xs"
            >
              {/* Col 1: Checkbox */}
              <div role="columnheader" aria-colindex={1} className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Select all files"
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Col 2: Name */}
              <div
                role="columnheader"
                aria-colindex={2}
                aria-sort={sortColumn === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                onClick={() => onSort('name')}
                className="cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center space-x-1.5">
                  <span>Name</span>
                  <ArrowUpDown
                    className={`w-3 h-3 ${sortColumn === 'name' ? 'text-emerald-400 opacity-100' : 'opacity-60'}`}
                  />
                </div>
              </div>

              {/* Col 3: Storage Class */}
              <div
                role="columnheader"
                aria-colindex={3}
                aria-sort={sortColumn === 'class' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                onClick={() => onSort('class')}
                className="cursor-pointer hover:text-white transition-colors px-1"
              >
                <div className="flex items-center space-x-1.5">
                  <span>Storage Class</span>
                  <ArrowUpDown
                    className={`w-3 h-3 ${sortColumn === 'class' ? 'text-emerald-400 opacity-100' : 'opacity-60'}`}
                  />
                </div>
              </div>

              {/* Col 4: Size */}
              <div
                role="columnheader"
                aria-colindex={4}
                aria-sort={sortColumn === 'size' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                onClick={() => onSort('size')}
                className="cursor-pointer hover:text-white transition-colors px-1"
              >
                <div className="flex items-center space-x-1.5">
                  <span>Size</span>
                  <ArrowUpDown
                    className={`w-3 h-3 ${sortColumn === 'size' ? 'text-emerald-400 opacity-100' : 'opacity-60'}`}
                  />
                </div>
              </div>

              {/* Col 5: Last Modified */}
              <div
                role="columnheader"
                aria-colindex={5}
                aria-sort={
                  sortColumn === 'updated' ? (sortAsc ? 'ascending' : 'descending') : 'none'
                }
                onClick={() => onSort('updated')}
                className="cursor-pointer hover:text-white transition-colors px-1 hidden md:block"
              >
                <div className="flex items-center space-x-1.5">
                  <span>Last Modified</span>
                  <ArrowUpDown
                    className={`w-3 h-3 ${sortColumn === 'updated' ? 'text-emerald-400 opacity-100' : 'opacity-60'}`}
                  />
                </div>
              </div>

              {/* Col 6: Integrity */}
              <div
                role="columnheader"
                aria-colindex={6}
                className="text-center px-1 hidden lg:block"
              >
                Integrity
              </div>

              {/* Col 7: Actions */}
              <div role="columnheader" aria-colindex={7} className="text-right">
                Actions
              </div>
            </div>
          </div>

          {/* Virtualized Body Rows */}
          <div
            role="rowgroup"
            ref={scrollContainerRef}
            className="overflow-y-auto max-h-[576px] relative min-w-[800px]"
          >
            {totalCount === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3 text-slate-400">
                <div className="p-3 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-500">
                  <Inbox className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium">No media files found matching your criteria.</p>
                <p className="text-xs text-slate-500">
                  Try adjusting your search query or category filters.
                </p>
              </div>
            ) : (
              <div style={{ height: `${virtualizer.totalHeight}px`, position: 'relative', width: '100%' }}>
                {virtualizer.virtualItems.map((virtualRow) => {
                  const idx = virtualRow.index
                  const isFolder = idx < folders.length

                  if (isFolder) {
                    const folderPath = folders[idx]
                    return (
                      <FolderRow
                        key={folderPath}
                        folderPath={folderPath}
                        currentPrefix={currentPrefix}
                        rowIndex={idx + 2}
                        top={virtualRow.top}
                        height={virtualRow.height}
                        isFocused={focusedIndex === idx}
                        onNavigatePrefix={onNavigatePrefix}
                      />
                    )
                  }

                  const file = files[idx - folders.length]
                  if (!file) return null

                  const isSelected = selectedItemIds.has(file.id)
                  return (
                    <AssetRow
                      key={file.id}
                      file={file}
                      rowIndex={idx + 2}
                      top={virtualRow.top}
                      height={virtualRow.height}
                      isSelected={isSelected}
                      isFocused={focusedIndex === idx}
                      searchQuery={searchQuery}
                      onToggleSelect={onToggleSelectItem}
                      onInspect={onInspectAsset}
                      onDownload={onDownloadAsset}
                      onGenerateCli={(name) => onGenerateCli([name])}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Table Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-3">
            <span>
              Showing {files.length} files ({folders.length} folders)
            </span>
            {nextPageToken && onLoadNextPage && (
              <button
                type="button"
                onClick={onLoadNextPage}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Load More Assets</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span>Requester-Pays Enforced</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>
      </div>
    )
  },
)

VirtualizedAssetGrid.displayName = 'VirtualizedAssetGrid'
