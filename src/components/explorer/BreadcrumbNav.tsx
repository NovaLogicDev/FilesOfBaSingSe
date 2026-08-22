import React, { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { NavigationRouter } from '../../services/navigationRouter'

interface BreadcrumbNavProps {
  currentPrefix: string
  bucketName: string
  onNavigatePrefix: (prefix: string) => void
}

export const BreadcrumbNav: React.FC<BreadcrumbNavProps> = memo(
  ({ currentPrefix, bucketName, onNavigatePrefix }) => {
    const cleanBucket = (bucketName || '').replace(/^gs:\/\//, '')
    const cleanPrefix = (currentPrefix || '').replace(/^\/+|\/+$/g, '')
    const segments = cleanPrefix ? cleanPrefix.split('/') : []
    const isAtRoot = segments.length === 0

    const handleLinkClick = (e: React.MouseEvent, targetPrefix: string) => {
      // Allow default browser behavior for Cmd+Click / Ctrl+Click / middle-click to open in new tab
      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        onNavigatePrefix(targetPrefix)
      }
    }

    return (
      <nav
        aria-label="Breadcrumb"
        className="flex items-center space-x-1.5 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800 overflow-x-auto"
      >
        <ol className="flex items-center space-x-1.5 list-none m-0 p-0">
          <li className="flex items-center">
            <a
              href={NavigationRouter.encodeRoute('')}
              onClick={(e) => handleLinkClick(e, '')}
              className={`font-mono flex items-center space-x-1 transition-colors cursor-pointer ${
                isAtRoot
                  ? 'font-bold text-white cursor-default pointer-events-none'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
              aria-current={isAtRoot ? 'location' : undefined}
              aria-label={`Root directory gs://${cleanBucket}`}
            >
              <span>gs://</span>
              <span>{cleanBucket}</span>
            </a>
          </li>

          {segments.map((segment, idx) => {
            const pathUpToSegment = segments.slice(0, idx + 1).join('/') + '/'
            const isLast = idx === segments.length - 1
            return (
              <li key={idx} className="flex items-center space-x-1.5">
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" aria-hidden="true" />
                <a
                  href={NavigationRouter.encodeRoute(pathUpToSegment)}
                  onClick={(e) => handleLinkClick(e, pathUpToSegment)}
                  className={`font-mono transition-colors cursor-pointer ${
                    isLast
                      ? 'font-bold text-white cursor-default pointer-events-none'
                      : 'text-slate-400 hover:text-emerald-400'
                  }`}
                  aria-current={isLast ? 'location' : undefined}
                  aria-label={isLast ? `Current folder: ${segment}` : `Navigate to ${segment}`}
                >
                  {segment}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>
    )
  },
)

BreadcrumbNav.displayName = 'BreadcrumbNav'
