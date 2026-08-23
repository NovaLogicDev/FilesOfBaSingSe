import React, { memo } from 'react'
import {
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileText,
  Check,
  Download,
  Terminal,
  Info,
} from 'lucide-react'
import { GCSMediaItem } from '../../types'
import { HighlightMatch } from './HighlightMatch'
import { StorageClassBadge } from './StorageClassBadge'

interface AssetRowProps {
  file: GCSMediaItem
  rowIndex: number
  top: number
  height: number
  isSelected: boolean
  isFocused: boolean
  searchQuery: string
  onToggleSelect: (id: string) => void
  onInspect: (file: GCSMediaItem) => void
  onDownload: (file: GCSMediaItem) => void
  onGenerateCli: (name: string) => void
}

const getFileIcon = (fileName?: string) => {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || ''
  if (['mxf', 'mov', 'mp4', 'dpx', 'mkv', 'avi'].includes(ext)) {
    return <FileVideo className="w-4 h-4 text-cyan-600 dark:text-cyan-400 flex-shrink-0" />
  }
  if (['wav', 'aac', 'flac', 'ptx', 'mp3', 'aiff'].includes(ext)) {
    return <FileAudio className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
  }
  if (['tar', 'zip', 'bsp', 'psd', 'exr', '7z', 'gz'].includes(ext)) {
    return <FileArchive className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
  }
  if (['json', 'csv', 'cube', 'nk', 'abc', 'xml', 'uproject'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
  }
  return <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
}

export const AssetRow: React.FC<AssetRowProps> = memo(
  ({
    file,
    rowIndex,
    top,
    height,
    isSelected,
    isFocused,
    searchQuery,
    onToggleSelect,
    onInspect,
    onDownload,
    onGenerateCli,
  }) => {
    const displayName = file.displayName || file.name.split('/').pop() || file.name

    return (
      <div
        role="row"
        aria-rowindex={rowIndex}
        aria-selected={isSelected}
        tabIndex={isFocused ? 0 : -1}
        style={{
          position: 'absolute',
          top: `${top}px`,
          left: 0,
          right: 0,
          height: `${height}px`,
        }}
        className={`grid grid-cols-[40px_minmax(0,1fr)_112px_96px_144px_112px_128px] items-center px-4 border-b border-slate-200 dark:border-slate-800/80 text-xs transition-colors group ${
          isSelected
            ? 'bg-cyan-50/80 dark:bg-cyan-950/30'
            : rowIndex % 2 === 0
            ? 'bg-transparent'
            : 'bg-slate-50/50 dark:bg-slate-900/30'
        } ${
          isFocused
            ? 'bg-slate-100 dark:bg-slate-800/60 ring-1 ring-cyan-400/50 z-10'
            : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
        }`}
      >
        {/* Col 1: Select Checkbox */}
        <div role="gridcell" aria-colindex={1} className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(file.id || file.name)}
            aria-label={`Select ${displayName}`}
            className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-emerald-600 dark:text-emerald-500 focus:ring-0 cursor-pointer"
          />
        </div>

        {/* Col 2: Name */}
        <div role="gridcell" aria-colindex={2} className="min-w-0 pr-3">
          <div
            onClick={() => onInspect(file)}
            className="flex items-center space-x-2.5 cursor-pointer group truncate"
          >
            {getFileIcon(displayName)}
            <span className="font-medium text-slate-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 group-hover:underline transition-colors truncate">
              {searchQuery ? (
                <>
                  <HighlightMatch text={displayName} query={searchQuery} />
                  <span className="sr-only">{displayName}</span>
                </>
              ) : (
                displayName
              )}
            </span>
          </div>
        </div>

        {/* Col 3: Storage Class */}
        <div role="gridcell" aria-colindex={3} className="px-1">
          <StorageClassBadge storageClass={file.storageClass} />
        </div>

        {/* Col 4: Size */}
        <div role="gridcell" aria-colindex={4} className="font-mono text-slate-700 dark:text-slate-200 px-1 truncate font-medium">
          {file.formattedSize}
        </div>

        {/* Col 5: Last Modified */}
        <div
          role="gridcell"
          aria-colindex={5}
          className="text-slate-500 dark:text-slate-400 font-mono text-[11px] px-1 truncate hidden md:block"
        >
          {file.updated.replace('T', ' ').substring(0, 16)}
        </div>

        {/* Col 6: Integrity */}
        <div role="gridcell" aria-colindex={6} className="text-center px-1 hidden lg:block">
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <Check className="w-3 h-3" />
            <span>CRC32c</span>
          </span>
        </div>

        {/* Col 7: Actions */}
        <div role="gridcell" aria-colindex={7} className="text-right">
          <div className="flex items-center justify-end space-x-1">
            <button
              type="button"
              onClick={() => onDownload(file)}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-500 hover:text-slate-950 text-slate-600 dark:bg-slate-800 dark:hover:bg-emerald-500 dark:hover:text-slate-950 dark:text-slate-300 transition-colors cursor-pointer"
              title="Stream Download to Disk"
              aria-label={`Download ${file.displayName}`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onGenerateCli(file.name)}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-cyan-500 hover:text-slate-950 text-slate-600 dark:bg-slate-800 dark:hover:bg-cyan-500 dark:hover:text-slate-950 dark:text-slate-300 transition-colors cursor-pointer"
              title="Generate CLI Command"
              aria-label={`Generate CLI command for ${file.displayName}`}
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onInspect(file)}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Inspect Metadata & Checksums"
              aria-label={`Inspect ${file.displayName}`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  },
)


AssetRow.displayName = 'AssetRow'
