import React, { memo } from 'react'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbNavProps {
  currentPrefix: string
  bucketName: string
  onNavigatePrefix: (prefix: string) => void
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = memo(
  ({ currentPrefix, bucketName, onNavigatePrefix }) => {
    const cleanBucket = bucketName.replace(/^gs:\/\//, '')
    const cleanPrefix = currentPrefix.replace(/^\/+|\/+$/g, '')
    const segments = cleanPrefix ? cleanPrefix.split('/') : []
    const isAtRoot = segments.length === 0

    return (
      <nav
        aria-label="Breadcrumb"
        className="flex items-center space-x-1.5 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800 overflow-x-auto"
      >
        <button
          type="button"
          onClick={() => onNavigatePrefix('')}
          className={`font-mono flex items-center space-x-1 transition-colors cursor-pointer rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            isAtRoot
              ? 'font-bold text-white cursor-default'
              : 'text-slate-400 hover:text-emerald-400'
          }`}
          aria-current={isAtRoot ? 'location' : undefined}
          aria-label={`Root directory gs://${cleanBucket}`}
        >
          <span>gs://</span>
          <span>{cleanBucket}</span>
        </button>

        {segments.map((segment, idx) => {
          const pathUpToSegment = segments.slice(0, idx + 1).join('/') + '/'
          const isLast = idx === segments.length - 1
          return (
            <React.Fragment key={idx}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onNavigatePrefix(pathUpToSegment)}
                className={`font-mono transition-colors cursor-pointer rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isLast
                    ? 'font-bold text-white cursor-default'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
                aria-current={isLast ? 'location' : undefined}
                aria-label={isLast ? `Current folder ${segment}` : `Navigate up to folder ${segment}`}
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
