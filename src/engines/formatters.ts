/**
 * UI and Telemetry Formatting Helpers
 */

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0.0 MB/s'
  const mbps = bytesPerSec / 1_000_000
  if (mbps < 0.1) {
    const kbps = bytesPerSec / 1_000
    return `${kbps.toFixed(1)} KB/s`
  }
  return `${mbps.toFixed(1)} MB/s`
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '00s'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
  }
  if (mins > 0) {
    return `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`
  }
  return `${secs.toString().padStart(2, '0')}s`
}

export function formatDateTime(isoString: string): string {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
  } catch {
    return isoString
  }
}

export function formatRelativeTime(isoString: string): string {
  if (!isoString) return '—'
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`
    return formatDateTime(isoString).split(' ')[0]
  } catch {
    return isoString
  }
}
