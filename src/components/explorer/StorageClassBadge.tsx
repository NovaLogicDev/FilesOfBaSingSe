import React, { memo } from 'react'
import { StorageClass } from '../../types'

interface StorageClassBadgeProps {
  storageClass: StorageClass
}

export const StorageClassBadge: React.FC<StorageClassBadgeProps> = memo(({ storageClass }) => {
  switch (storageClass) {
    case 'ARCHIVE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-950/80 dark:text-sky-400 dark:border-sky-800/60">
          ARCHIVE
        </span>
      )
    case 'COLDLINE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-400 dark:border-amber-800/60">
          COLDLINE
        </span>
      )
    case 'NEARLINE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-400 dark:border-indigo-800/60">
          NEARLINE
        </span>
      )
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-800/60">
          STANDARD
        </span>
      )
  }
})


StorageClassBadge.displayName = 'StorageClassBadge'
