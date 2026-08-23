import React, { useState, useMemo, useRef, useCallback } from 'react'
import { Download, Terminal, DollarSign, Sparkles } from 'lucide-react'
import { GCSMediaItem } from '../../types'
import { CostGovernanceEngine } from '../../engines/cost'
import { ManifestExporterEngine } from '../../engines/manifest'
import { usePersistentStore } from '../../store/persistentStore'
import { useToastStore } from '../../store/toastStore'
import { BreadcrumbNav } from './BreadcrumbNav'
import { FilterToolbar, CategoryFilterType } from './FilterToolbar'
import { VirtualizedAssetGrid } from './VirtualizedAssetGrid'

interface AssetExplorerShellProps {
  currentPrefix: string
  folders: string[]
  files: GCSMediaItem[]
  nextPageToken?: string
  onNavigatePrefix: (prefix: string) => void
  onLoadNextPage?: () => void
  onInspectAsset: (item: GCSMediaItem) => void
  onDownloadAsset: (item: GCSMediaItem) => void
  onGenerateCli: (selectedPaths: string[]) => void
  onDownloadBatch: (selectedItems: GCSMediaItem[]) => void
}

export const AssetExplorerShell: React.FC<AssetExplorerShellProps> = ({
  currentPrefix,
  folders,
  files,
  nextPageToken,
  onNavigatePrefix,
  onLoadNextPage,
  onInspectAsset,
  onDownloadAsset,
  onGenerateCli,
  onDownloadBatch,
}) => {
  const { savedBucketName, isFreeTrialAccount, customPricing } = usePersistentStore()
  const { addToast } = useToastStore()

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterType>('all')
  const [sortColumn, setSortColumn] = useState<'name' | 'size' | 'class' | 'updated'>('name')
  const [sortAsc, setSortAsc] = useState(true)

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Filtered & Sorted files dataset
  const filteredFiles = useMemo(() => {
    let result = [...files]

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (f) =>
          f.displayName.toLowerCase().includes(q) ||
          f.storageClass.toLowerCase().includes(q) ||
          (f.crc32cHex && f.crc32cHex.toLowerCase().includes(q)) ||
          (f.contentType && f.contentType.toLowerCase().includes(q)),
      )
    }

    // 2. Category Extension Filter
    if (categoryFilter !== 'all') {
      result = result.filter((f) => {
        const ext = f.displayName.split('.').pop()?.toLowerCase() || ''
        if (categoryFilter === 'video') return ['mxf', 'mov', 'mp4', 'dpx', 'mkv', 'avi'].includes(ext)
        if (categoryFilter === 'audio') return ['wav', 'aac', 'flac', 'ptx', 'mp3', 'aiff'].includes(ext)
        if (categoryFilter === 'archive') return ['tar', 'zip', 'bsp', 'psd', 'exr', '7z', 'gz'].includes(ext)
        if (categoryFilter === 'metadata') {
          return ['json', 'csv', 'pdf', 'cube', 'nk', 'uproject', 'abc', 'xml'].includes(ext)
        }
        return true
      })
    }

    // 3. Multi-Column Sorting with Stable Secondary Tie-Breaker
    result.sort((a, b) => {
      let cmp = 0
      if (sortColumn === 'name') {
        cmp = a.displayName.localeCompare(b.displayName, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      } else if (sortColumn === 'size') {
        cmp = a.sizeBytes - b.sizeBytes
      } else if (sortColumn === 'class') {
        cmp = a.storageClass.localeCompare(b.storageClass)
      } else if (sortColumn === 'updated') {
        cmp = a.updated.localeCompare(b.updated)
      }

      if (cmp === 0) {
        cmp = a.displayName.localeCompare(b.displayName)
      }
      if (cmp === 0) {
        cmp = a.id.localeCompare(b.id)
      }

      return sortAsc ? cmp : -cmp
    })

    return result
  }, [files, searchQuery, categoryFilter, sortColumn, sortAsc])

  // Selected items array
  const selectedItems = useMemo(() => {
    return files.filter((f) => selectedItemIds.has(f.id))
  }, [files, selectedItemIds])

  // Real-time Cost Estimation for selected items
  const effectiveRates = CostGovernanceEngine.resolveRateCard(customPricing)
  const costEstimate = useMemo(() => {
    if (selectedItems.length === 0) return null
    return CostGovernanceEngine.calculate(
      selectedItems.map((item) => ({
        sizeBytes: item.sizeBytes,
        storageClass: item.storageClass,
      })),
      customPricing,
      isFreeTrialAccount,
    )
  }, [selectedItems, customPricing, isFreeTrialAccount])

  const toggleSelectAll = useCallback(() => {
    if (filteredFiles.length > 0 && selectedItemIds.size === filteredFiles.length) {
      setSelectedItemIds(new Set())
    } else {
      setSelectedItemIds(new Set(filteredFiles.map((f) => f.id)))
    }
  }, [filteredFiles, selectedItemIds.size])

  const toggleSelectItem = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSort = useCallback((column: 'name' | 'size' | 'class' | 'updated') => {
    setSortColumn((prevCol) => {
      if (prevCol === column) {
        setSortAsc((prevAsc) => !prevAsc)
        return prevCol
      }
      setSortAsc(true)
      return column
    })
  }, [])

  // Manifest Exporters (AUX-07)
  const handleExportCsv = useCallback(() => {
    const itemsToExport = selectedItems.length > 0 ? selectedItems : filteredFiles
    if (itemsToExport.length === 0) {
      addToast({ type: 'warning', title: 'Export Failed', message: 'No assets available to export.' })
      return
    }

    const csvContent = ManifestExporterEngine.generateCsv({
      bucketName: savedBucketName || 'bucket',
      items: itemsToExport,
      rates: customPricing,
      isFreeTrial: isFreeTrialAccount,
    })

    const filename = `manifest-${(savedBucketName || 'gcs').replace(/^gs:\/\//, '')}-${Date.now()}.csv`
    ManifestExporterEngine.downloadBlob(csvContent, filename, 'text/csv')

    addToast({
      type: 'success',
      title: 'Manifest Exported (CSV)',
      message: `Downloaded manifest for ${itemsToExport.length} asset${itemsToExport.length === 1 ? '' : 's'}.`,
    })
  }, [selectedItems, filteredFiles, savedBucketName, customPricing, isFreeTrialAccount, addToast])

  const handleExportJson = useCallback(() => {
    const itemsToExport = selectedItems.length > 0 ? selectedItems : filteredFiles
    if (itemsToExport.length === 0) {
      addToast({ type: 'warning', title: 'Export Failed', message: 'No assets available to export.' })
      return
    }

    const jsonContent = ManifestExporterEngine.generateJson({
      bucketName: savedBucketName || 'bucket',
      items: itemsToExport,
      rates: customPricing,
      isFreeTrial: isFreeTrialAccount,
    })

    const filename = `manifest-${(savedBucketName || 'gcs').replace(/^gs:\/\//, '')}-${Date.now()}.json`
    ManifestExporterEngine.downloadBlob(jsonContent, filename, 'application/json')

    addToast({
      type: 'success',
      title: 'Manifest Exported (JSON)',
      message: `Downloaded JSON metadata manifest for ${itemsToExport.length} asset${itemsToExport.length === 1 ? '' : 's'}.`,
    })
  }, [selectedItems, filteredFiles, savedBucketName, customPricing, isFreeTrialAccount, addToast])

  return (
    <div className="space-y-4">
      {/* 1. Interactive Clickable Breadcrumb Navigation */}
      <BreadcrumbNav
        currentPrefix={currentPrefix}
        bucketName={savedBucketName}
        onNavigatePrefix={onNavigatePrefix}
      />

      {/* 2. Sticky Cost Governance Banner */}
      {costEstimate && (
        <div className="rounded-xl border border-cyan-300 dark:border-cyan-500/40 bg-gradient-to-r from-cyan-50 via-slate-50 to-white dark:from-cyan-950/60 dark:via-slate-900 dark:to-slate-950 p-4 shadow-xl shadow-cyan-500/5 dark:shadow-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-200 transition-colors">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-cyan-100 dark:bg-cyan-500/10 border border-cyan-300 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-400 flex-shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  COST ESTIMATE: {costEstimate.itemCount} items selected (
                  {costEstimate.formattedTotalSize})
                </span>
                {isFreeTrialAccount && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30 flex items-center space-x-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Covered by $300 Free Credits</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-mono">
                Archive Retrieval: ${costEstimate.retrievalTotalUSD.toFixed(2)} | Egress (${effectiveRates.internetEgressPerGB.toFixed(2)}/GB): $
                {costEstimate.egressTotalUSD.toFixed(2)} |{' '}
                <strong className="text-cyan-700 dark:text-cyan-300 font-bold">
                  Total Estimate: ${costEstimate.grandTotalUSD.toFixed(2)} USD
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto">
            <button
              type="button"
              onClick={() => onDownloadBatch(selectedItems)}
              className="flex-1 md:flex-none px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/40 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Selected ({selectedItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => onGenerateCli(selectedItems.map((i) => i.name))}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>CLI Script</span>
            </button>
          </div>
        </div>
      )}


      {/* 3. Filter Toolbar & Search Bar */}
      <FilterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        matchCount={filteredFiles.length}
        totalCount={files.length}
        selectedCount={selectedItems.length}
        searchInputRef={searchInputRef}
        onExportManifestCsv={handleExportCsv}
        onExportManifestJson={handleExportJson}
      />

      {/* 4. High-Performance Virtualized Asset Data Grid */}
      <VirtualizedAssetGrid
        currentPrefix={currentPrefix}
        folders={folders}
        files={filteredFiles}
        selectedItemIds={selectedItemIds}
        searchQuery={searchQuery}
        sortColumn={sortColumn}
        sortAsc={sortAsc}
        nextPageToken={nextPageToken}
        searchInputRef={searchInputRef}
        onToggleSelectItem={toggleSelectItem}
        onToggleSelectAll={toggleSelectAll}
        onSort={handleSort}
        onNavigatePrefix={onNavigatePrefix}
        onInspectAsset={onInspectAsset}
        onDownloadAsset={onDownloadAsset}
        onGenerateCli={onGenerateCli}
        onLoadNextPage={onLoadNextPage}
      />
    </div>
  )
}
