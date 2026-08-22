import React, { memo } from 'react'

interface HighlightMatchProps {
  text: string
  query: string
  className?: string
  matchClassName?: string
}

/**
 * Fast substring highlighting for search queries with <mark> tags.
 */
export const HighlightMatch: React.FC<HighlightMatchProps> = memo(
  ({
    text,
    query,
    className = '',
    matchClassName = 'bg-cyan-500/30 text-cyan-200 font-semibold px-0.5 rounded',
  }) => {
    if (!query || !query.trim()) {
      return <span className={className}>{text}</span>
    }

    const trimmed = query.trim()
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escaped})`, 'gi')
    const parts = text.split(regex)

    return (
      <span className={className}>
        {parts.map((part, idx) => {
          if (part.toLowerCase() === trimmed.toLowerCase()) {
            return (
              <mark key={idx} className={matchClassName}>
                {part}
              </mark>
            )
          }
          return <React.Fragment key={idx}>{part}</React.Fragment>
        })}
      </span>
    )
  },
)

HighlightMatch.displayName = 'HighlightMatch'
