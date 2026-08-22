import React, { memo } from 'react'
import { Search, X } from 'lucide-react'

export type CategoryFilterType = 'all' | 'video' | 'audio' | 'archive' | 'metadata'

interface FilterToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  categoryFilter: CategoryFilterType
  onCategoryChange: (category: CategoryFilterType) => void
  matchCount: number
  totalCount: number
  searchInputRef?: React.RefObject<HTMLInputElement | null>
}

export const FilterToolbar: React.FC<FilterToolbarProps> = memo(
  ({
    searchQuery,
    onSearchChange,
    categoryFilter,
    onCategoryChange,
    matchCount,
    totalCount,
    searchInputRef,
  }) => {
    const categories: Array<{ id: CategoryFilterType; label: string }> = [
      { id: 'all', label: 'All Files' },
      { id: 'video', label: 'Videos' },
      { id: 'audio', label: 'Audio' },
      { id: 'archive', label: 'Archives' },
      { id: 'metadata', label: 'Metadata' },
    ]

    const isFiltering = searchQuery.trim() !== '' || categoryFilter !== 'all'

    return (
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        {/* Category Filter Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                categoryFilter === cat.id
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Right controls: Match Count Badge + Search Input */}
        <div className="flex items-center space-x-2.5">
          {isFiltering && (
            <span
              data-testid="match-count-badge"
              className="px-2 py-1 rounded-md text-[11px] font-mono font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 whitespace-nowrap animate-in fade-in duration-150"
            >
              {matchCount} of {totalCount} match{matchCount === 1 ? '' : 'es'}
            </span>
          )}

          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by file name or extension... (/)"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300 p-0.5"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  },
)

FilterToolbar.displayName = 'FilterToolbar'
