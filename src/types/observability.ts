export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'AUTH' | 'GCS' | 'STREAM' | 'PREFLIGHT' | 'COST' | 'SECURITY'

export interface DiagnosticLogEntry {
  id: string
  level: LogLevel
  category: LogCategory
  message: string
  timestamp: string
  details?: Record<string, any>
}

export interface DiagnosticReport {
  timestamp: string
  appVersion: string
  userAgent: string
  browserEngine: 'Chromium' | 'WebKit' | 'Gecko' | 'Unknown'
  fileSystemAccessApiSupported: boolean
  serviceWorkerActive: boolean
  activeBucket: string
  activeProjectIdMasked: string // e.g. "clie***-2026"
  heapMemoryMB: number
  recentLogs: DiagnosticLogEntry[]
}
