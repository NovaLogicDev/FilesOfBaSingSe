export type StreamStatus =
  | 'idle'
  | 'initializing'
  | 'streaming'
  | 'verifying'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'error'

export interface DownloadProgressTelemetry {
  itemId: string
  itemName: string
  loadedBytes: number
  totalBytes: number
  percentage: number
  speedBytesPerSec: number
  formattedSpeed: string // e.g. "48.5 MB/s"
  etaSeconds: number
  formattedETA: string // e.g. "02m 41s"
  elapsedSeconds: number
  formattedElapsed: string // e.g. "03m 42s"
  memoryHeapMB: number // e.g. 11.4
  status: StreamStatus
  computedCrc32cBase64?: string
  computedCrc32cHex?: string
  integrityVerified?: boolean
  errorMessage?: string
}

export interface StreamDownloadOptions {
  bucketName: string
  objectName: string
  suggestedFilename: string
  userProject: string
  oauthToken: string
  expectedCrc32c?: string
  onProgress: (progress: DownloadProgressTelemetry) => void
  abortSignal?: AbortSignal
}
