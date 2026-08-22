import React, { useState, useMemo } from 'react'
import {
  Folder,
  FileVideo,
  FileAudio,
  FileArchive,
  FileText,
  FileCode,
  Download,
  Terminal,
  Info,
  Search,
  Check,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  DollarSign,
  ArrowUpDown,
} from 'lucide-react'
import { GCSMediaItem, StorageClass } from '../../types'
import { CostGovernanceEngine } from '../../engines/cost'
import { usePersistentStore } from '../../store/persistentStore'

interface AssetExplorerShellProps {
  currentPrefix: string
  folders: string[]
  files: GCSMediaItem[]
  onNavigatePrefix: (prefix: string) => void
  onInspectAsset: (item: GCSMediaItem) => void
  onDownloadAsset: (item: GCSMediaItem) => void
  onGenerateCli: (selectedPaths: string[]) => void
  onDownloadBatch: (selectedItems: GCSMediaItem[]) => void
}

export const AssetExplorerShell: React.FC<AssetExplorerShellProps> = ({
  currentPrefix,
  folders,
  files,
  onNavigatePrefix,
  onInspectAsset,
  onDownloadAsset,
  onGenerateCli,
  onDownloadBatch,
}) => {
  const { savedBucketName, isFreeTrialAccount } = usePersistentStore()

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'video' | 'audio' | 'archive' | 'metadata'
  >('all')
  const [sortColumn, setSortColumn] = useState<'name' | 'size' | 'class' | 'updated'>('name')
  const [sortAsc, setSortAsc] = useState(true)

  // Breadcrumbs breakdown
  const breadcrumbSegments = useMemo(() => {
    const cleanPrefix = currentPrefix.replace(/^\/+|\/+$/g, '')
    if (!cleanPrefix) return []
    return cleanPrefix.split('/')
  }, [currentPrefix])

  // Filtered & Sorted items
  const filteredFiles = useMemo(() => {
    let result = [...files]

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (f) =>
          f.displayName.toLowerCase().includes(q) ||
          f.storageClass.toLowerCase().includes(q) ||
          (f.crc32cHex && f.crc32cHex.toLowerCase().includes(q)),
      )
    }

    // 2. Category Filter
    if (categoryFilter !== 'all') {
      result = result.filter((f) => {
        const ext = f.displayName.split('.').pop()?.toLowerCase() || ''
        if (categoryFilter === 'video') return ['mxf', 'mov', 'mp4', 'dpx'].includes(ext)
        if (categoryFilter === 'audio') return ['wav', 'aac', 'flac', 'ptx'].includes(ext)
        if (categoryFilter === 'archive') return ['tar', 'zip', 'bsp', 'psd'].includes(ext)
        if (categoryFilter === 'metadata') return ['json', 'csv', 'pdf', 'cube', 'nk', 'uproject', 'abc'].includes(ext)
        return true
      })
    }

    // 3. Sort
    result.sort((a, b) => {
      let cmp = 0
      if (sortColumn === 'name') cmp = a.displayName.localeCompare(b.displayName)
      else if (sortColumn === 'size') cmp = a.sizeBytes - b.sizeBytes
      else if (sortColumn === 'class') cmp = a.storageClass.localeCompare(b.storageClass)
      else if (sortColumn === 'updated') cmp = a.updated.localeCompare(b.updated)
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [files, searchQuery, categoryFilter, sortColumn, sortAsc])

  // Selected items array
  const selectedItems = useMemo(() => {
    return files.filter((f) => selectedItemIds.has(f.id))
  }, [files, selectedItemIds])

  // Real-time Cost Estimation for selected items
  const costEstimate = useMemo(() => {
    if (selectedItems.length === 0) return null
    return CostGovernanceEngine.calculate(
      selectedItems.map((item) => ({
        sizeBytes: item.sizeBytes,
        storageClass: item.storageClass,
      })),
      undefined,
      isFreeTrialAccount,
    )
  }, [selectedItems, isFreeTrialAccount])

  const toggleSelectAll = () => {
    if (selectedItemIds.size === filteredFiles.length) {
      setSelectedItemIds(new Set())
    } else {
      setSelectedItemIds(new Set(filteredFiles.map((f) => f.id)))
    }
  }

  const toggleSelectItem = (id: string) => {
    const next = new Set(selectedItemIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedItemIds(next)
  }

  const handleSort = (column: 'name' | 'size' | 'class' | 'updated') => {
    if (sortColumn === column) setSortAsc(!sortAsc)
    else {
      setSortColumn(column)
      setSortAsc(true)
    }
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    if (['mxf', 'mov', 'mp4', 'dpx'].includes(ext)) {
      return <FileVideo className="w-4 h-4 text-cyan-400" />
    }
    if (['wav', 'aac', 'flac', 'ptx'].includes(ext)) {
      return <FileAudio className="w-4 h-4 text-emerald-400" />
    }
    if (['tar', 'zip', 'bsp', 'psd'].includes(ext)) {
      return <FileArchive className="w-4 h-4 text-amber-400" />
    }
    if (['json', 'csv', 'cube', 'nk', 'abc'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-indigo-400" />
    }
    return <FileText className="w-4 h-4 text-slate-400" />
  }

  const getStorageClassBadge = (sClass: StorageClass) => {
    switch (sClass) {
      case 'ARCHIVE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-sky-950/80 text-sky-400 border border-sky-800/60">
            ARCHIVE
          </span>
        )
      case 'COLDLINE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-950/80 text-amber-400 border border-amber-800/60">
            COLDLINE
          </span>
        )
      case 'NEARLINE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-950/80 text-indigo-400 border border-indigo-800/60">
            NEARLINE
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            STANDARD
          </span>
        )
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Interactive Breadcrumb Navigation Bar */}
      <div className="flex items-center space-x-1.5 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800 overflow-x-auto">
        <button
          onClick={() => onNavigatePrefix('')}
          className="text-slate-400 hover:text-emerald-400 font-mono flex items-center space-x-1 transition-colors"
        >
          <span>gs://</span>
          <span>{savedBucketName.replace(/^gs:\/\//, '')}</span>
        </button>

        {breadcrumbSegments.map((segment, idx) => {
          const pathUpToSegment = breadcrumbSegments.slice(0, idx + 1).join('/') + '/'
          const isLast = idx === breadcrumbSegments.length - 1
          return (
            <React.Fragment key={idx}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
              <button
                onClick={() => onNavigatePrefix(pathUpToSegment)}
                className={`font-mono transition-colors ${
                  isLast
                    ? 'font-bold text-white cursor-default'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                {segment}
              </button>
            </React.Fragment>
          )
        })}
      </div>

      {/* 2. Sticky Cost Governance Banner (Dynamically Calculated) */}
      {costEstimate && (
        <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/60 via-slate-900 to-slate-950 p-4 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex-shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-white">
                  COST ESTIMATE: {costEstimate.itemCount} items selected ({costEstimate.formattedTotalSize})
                </span>
                {isFreeTrialAccount && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Covered by $300 Free Credits</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 font-mono">
                Archive Retrieval: ${costEstimate.retrievalTotalUSD.toFixed(2)} | Egress ($0.12/GB): ${costEstimate.egressTotalUSD.toFixed(2)} |{' '}
                <strong className="text-cyan-300">Total Estimate: ${costEstimate.grandTotalUSD.toFixed(2)} USD</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto">
            <button
              onClick={() => onDownloadBatch(selectedItems)}
              className="flex-1 md:flex-none px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-emerald-950/40"
            >
              <Download className="w-4 h-4" />
              <span>Download Selected ({selectedItems.length})</span>
            </button>
            <button
              onClick={() => onGenerateCli(selectedItems.map((i) => i.name))}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center space-x-1.5 transition-all"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>CLI Script</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Filter Toolbar & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        {/* Category Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {[
            { id: 'all', label: 'All Files' },
            { id: 'video', label: 'Videos' },
            { id: 'audio', label: 'Audio' },
            { id: 'archive', label: 'Archives' },
            { id: 'metadata', label: 'Metadata' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                categoryFilter === cat.id
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Instant Search Bar */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by file name or extension..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
          />
        </div>
      </div>

      {/* 4. Asset Data Grid */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold select-none">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredFiles.length > 0 && selectedItemIds.size === filteredFiles.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th
                  onClick={() => handleSort('name')}
                  className="py-3 px-3 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Name</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('class')}
                  className="py-3 px-3 w-28 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Storage Class</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('size')}
                  className="py-3 px-3 w-24 cursor-pointer hover:text-white transition-colors"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Size</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('updated')}
                  className="py-3 px-3 w-36 cursor-pointer hover:text-white transition-colors hidden md:table-cell"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Last Modified</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3 w-28 text-center hidden lg:table-cell">Integrity</th>
                <th className="py-3 px-4 w-32 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {/* Virtual Folders */}
              {folders.map((folderPath) => {
                const folderDisplayName = folderPath.replace(currentPrefix, '')
                return (
                  <tr
                    key={folderPath}
                    onClick={() => onNavigatePrefix(folderPath)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4"></td>
                    <td colSpan={5} className="py-3 px-3">
                      <div className="flex items-center space-x-2 text-white font-medium">
                        <Folder className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                        <span className="font-mono text-cyan-300 group-hover:underline">
                          {folderDisplayName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-[11px] text-slate-400 group-hover:text-emerald-400 font-mono">
                        Open &rarr;
                      </span>
                    </td>
                  </tr>
                )
              })}

              {/* Leaf Media Objects */}
              {filteredFiles.map((file) => {
                const isSelected = selectedItemIds.has(file.id)
                return (
                  <tr
                    key={file.id}
                    className={`hover:bg-slate-800/50 transition-colors ${
                      isSelected ? 'bg-emerald-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(file.id)}
                        className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    <td className="py-3 px-3">
                      <div
                        onClick={() => onInspectAsset(file)}
                        className="flex items-center space-x-2.5 cursor-pointer group"
                      >
                        {getFileIcon(file.displayName)}
                        <span className="font-medium text-white group-hover:text-cyan-300 group-hover:underline transition-colors truncate max-w-xs md:max-w-md">
                          {file.displayName}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3">{getStorageClassBadge(file.storageClass)}</td>

                    <td className="py-3 px-3 font-mono text-slate-200">{file.formattedSize}</td>

                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px] hidden md:table-cell">
                      {file.updated.replace('T', ' ').substring(0, 16)}
                    </td>

                    <td className="py-3 px-3 text-center hidden lg:table-cell">
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Check className="w-3 h-3" />
                        <span>CRC32c</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => onDownloadAsset(file)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 transition-colors"
                          title="Stream Download to Disk"
                          aria-label={`Download ${file.displayName}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onGenerateCli([file.name])}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 transition-colors"
                          title="Generate CLI Command"
                          aria-label={`Generate CLI command for ${file.displayName}`}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onInspectAsset(file)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Inspect Metadata & Checksums"
                          aria-label={`Inspect ${file.displayName}`}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {folders.length === 0 && filteredFiles.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <p className="text-sm">No media files found matching your criteria.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing {filteredFiles.length} files ({folders.length} folders)
          </span>
          <div className="flex items-center space-x-2">
            <span>Requester-Pays Enforced</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>
      </div>
    </div>
  )
}
