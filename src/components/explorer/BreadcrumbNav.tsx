import React, { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { BucketSwitcherPopover } from '../navigation/BucketSwitcherPopover'

interface BreadcrumbNavProps {
  currentPrefix: string
  bucketName: string
  onNavigatePrefix: (prefix: string) => void
  onBucketSwitch?: (newBucket: string) => void
  onOpenWizard?: () => void
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = memo(
  ({ currentPrefix, bucketName, onNavigatePrefix, onBucketSwitch, onOpenWizard }) => {
    const cleanBucket = bucketName.replace(/^gs:\/\//, '')
    const cleanPrefix = currentPrefix.replace(/^\/+|\/+$/g, '')
    const segments = cleanPrefix ? cleanPrefix.split('/') : []

    return (
      <nav
        aria-label="Breadcrumb"
        className="flex items-center space-x-1.5 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800 overflow-x-auto"
      >
        {onBucketSwitch && onOpenWizard ? (
          <BucketSwitcherPopover
            onBucketSwitch={onBucketSwitch}
            onOpenWizard={onOpenWizard}
            variant="breadcrumb"
          />
        ) : (
          <button
            type="button"
            onClick={() => onNavigatePrefix('')}
            className="text-slate-400 hover:text-emerald-400 font-mono flex items-center space-x-1 transition-colors cursor-pointer"
            aria-label={`Root directory gs://${cleanBucket}`}
          >
            <span>gs://</span>
            <span>{cleanBucket}</span>
          </button>
        )}

        {segments.map((segment, idx) => {
          const pathUpToSegment = segments.slice(0, idx + 1).join('/') + '/'
          const isLast = idx === segments.length - 1
          return (
            <React.Fragment key={idx}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onNavigatePrefix(pathUpToSegment)}
                className={`font-mono transition-colors cursor-pointer ${
                  isLast
                    ? 'font-bold text-white cursor-default'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
                aria-current={isLast ? 'location' : undefined}
              >
                {segment}
              </button>
            </React.Fragment>
          )
        })}
      </nav>
    )
  },
)

BreadcrumbNav.displayName = 'BreadcrumbNav'
