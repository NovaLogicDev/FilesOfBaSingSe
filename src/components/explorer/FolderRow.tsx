import React, { memo } from 'react'
import { Folder } from 'lucide-react'

interface FolderRowProps {
  folderPath: string
  currentPrefix: string
  rowIndex: number
  top: number
  height: number
  isFocused: boolean
  onNavigatePrefix: (prefix: string) => void
}

export const FolderRow: React.FC<FolderRowProps> = memo(
  ({
    folderPath,
    currentPrefix,
    rowIndex,
    top,
    height,
    isFocused,
    onNavigatePrefix,
  }) => {
    const folderDisplayName = folderPath.replace(currentPrefix, '')

    return (
      <div
        role="row"
        aria-rowindex={rowIndex}
        tabIndex={isFocused ? 0 : -1}
        onClick={() => onNavigatePrefix(folderPath)}
        style={{
          position: 'absolute',
          top: `${top}px`,
          left: 0,
          right: 0,
          height: `${height}px`,
        }}
        className={`grid grid-cols-[40px_minmax(0,1fr)_112px_96px_144px_112px_128px] items-center px-4 border-b border-slate-800/60 transition-colors cursor-pointer group text-xs ${
          isFocused ? 'bg-slate-800/60 ring-1 ring-cyan-400/50' : 'hover:bg-slate-800/40'
        }`}
      >
        <div role="gridcell" aria-colindex={1} className="w-10 flex items-center justify-center">
          {/* Spacer for checkbox column alignment */}
        </div>

        <div
          role="gridcell"
          aria-colindex={2}
          className="flex items-center space-x-2 text-white font-medium overflow-hidden"
        >
          <Folder className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform flex-shrink-0" />
          <span className="font-mono text-cyan-300 group-hover:underline truncate">
            {folderDisplayName}
          </span>
        </div>

        <div role="gridcell" aria-colindex={3} className="px-1" />
        <div role="gridcell" aria-colindex={4} className="px-1" />
        <div role="gridcell" aria-colindex={5} className="px-1 hidden md:block" />
        <div role="gridcell" aria-colindex={6} className="px-1 hidden lg:block" />

        <div role="gridcell" aria-colindex={7} className="text-right">
          <span className="text-[11px] text-slate-400 group-hover:text-emerald-400 font-mono">
            Open &rarr;
          </span>
        </div>
      </div>
    )
  },
)

FolderRow.displayName = 'FolderRow'
