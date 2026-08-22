import React, { memo } from 'react'
import { StorageClass } from '../../types'

interface StorageClassBadgeProps {
  storageClass: StorageClass
}

export const StorageClassBadge: React.FC<StorageClassBadgeProps> = memo(({ storageClass }) => {
  switch (storageClass) {
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
})

StorageClassBadge.displayName = 'StorageClassBadge'
