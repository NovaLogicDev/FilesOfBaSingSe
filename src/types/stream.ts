import { AssetItem, GCSMediaItem } from './gcs'
import { LocalFileRevealAction } from './osFileSystem'

/**
 * Discrete lifecycle state of a streaming download task
 */
export type StreamStatus =
  | 'idle'
  | 'initializing'
  | 'prompting' // Awaiting native Save File Picker dialog
  | 'streaming' // Active 4MB micro-chunk transfer to disk
  | 'verifying' // Computing final CRC32c digest and comparing headers
  | 'completed' // Finished successfully with verified integrity
  | 'paused' // Stream paused
  | 'cancelled' // Aborted by user via AbortController (<200ms)
  | 'error' // Terminated on network/disk error

export type DownloadStatus = StreamStatus // Backward-compatible alias

/**
 * Available download execution strategies across browser engines
 */
export type DownloadStrategy = 'fsaa' | 'service_worker' | 'memory_blob' | 'cli_companion'

/**
 * Service Worker registration lifecycle state
 */
export type SWRegistrationState =
  | 'unsupported'
  | 'unregistered'
  | 'registering'
  | 'registered'
  | 'active'
  | 'error'

/**
 * Volatile in-memory stream ticket registered with Service Worker
 */
export interface StreamTicket {
  bucket?: string
  bucketName?: string
  object?: string
  objectName?: string
  userProject: string
  token?: string
  oauthToken?: string
  filename: string
  size?: number
  totalBytes?: number
  expectedCrc32c?: string
  url?: string
  streamId?: string
}

/**
 * Progress payload emitted from Service Worker to window clients
 */
export interface SwProgressPayload {
  streamId: string
  loadedBytes: number
  totalBytes: number
  percentage: number
  speed?: number
}

/**
 * Stream Diagnostics and Checksum Audit information
 */
export interface StreamDiagnostics {
  streamId: string
  filename: string
  totalBytes: number
  formattedSize: string
  durationSeconds: number
  averageSpeedMBs: number
  crc32cHex: string
  crc32cBase64: string
  integrityMatch: boolean
  serviceWorkerActive: boolean
  downloadLocation: string
}

/**
 * Completion payload emitted from Service Worker to window clients
 */
export interface SwCompletePayload {
  type: 'SW_STREAM_COMPLETE'
  streamId: string
  loadedBytes: number
  totalBytes: number
  crc32cHex?: string
  crc32cBase64?: string
  durationSeconds?: number
  averageSpeedMBs?: number
  diagnostics?: StreamDiagnostics
}

/**
 * Diagnostic status information for Service Worker stream engine
 */
export interface SwStatusInfo {
  isRegistered: boolean
  isActive: boolean
  version?: string
  activeStreamsCount: number
}

/**
 * Real-time transfer telemetry emitted during stream execution
 */
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
  memoryHeapMB: number // Constant bounded heap e.g. 11.4 MB (<25MB SLA)
  status: StreamStatus
  strategy?: DownloadStrategy
  computedCrc32cBase64?: string
  computedCrc32cHex?: string
  expectedCrc32cBase64?: string
  integrityVerified?: boolean
  errorMessage?: string
  fileHandleName?: string
  fileHandle?: FileSystemFileHandle
  revealAction?: LocalFileRevealAction
}

export type StreamTelemetry = DownloadProgressTelemetry // Backward-compatible alias
export type StreamProgress = DownloadProgressTelemetry // Backward-compatible alias

/**
 * Options passed to stream download service
 */
export interface StreamDownloadOptions {
  bucketName: string
  objectName: string
  suggestedFilename?: string
  userProject: string
  oauthToken: string
  expectedCrc32c?: string
  fileSize?: number
  strategy?: DownloadStrategy
  onProgress?: (progress: DownloadProgressTelemetry) => void
  abortSignal?: AbortSignal
  customFileHandle?: FileSystemFileHandle // For unit tests & programmatic handles
}

export type StreamOptions = StreamDownloadOptions // Backward-compatible alias

/**
 * Result returned upon download completion or termination
 */
export interface DownloadResult {
  success: boolean
  itemId: string
  itemName: string
  bytesDownloaded: number
  crc32cBase64: string
  crc32cHex: string
  expectedCrc32c?: string
  integrityVerified: boolean
  durationSeconds: number
  averageSpeedBytesPerSec: number
  status: StreamStatus
  strategy?: DownloadStrategy
  errorMessage?: string
  fileHandle?: FileSystemFileHandle
  revealAction?: LocalFileRevealAction
}

export type StreamResult = DownloadResult // Backward-compatible alias

/**
 * Configuration parameters for the 4MB micro-chunk engine
 */
export interface MicroChunkBufferConfig {
  chunkSizeBytes: number // Default: 4 * 1024 * 1024 (4,194,304 bytes = 4MB)
  slidingWindowSamples: number // Default: 6 samples (sampled every ~500ms)
  maxHeapBudgetMB: number // Hard SLA ceiling: 25.0 MB
  nominalHeapMB: number // Nominal telemetry baseline: 11.4 MB
  telemetryThrottleMs: number // Throttle frequency for UI event dispatch: 250ms
}

/**
 * Active Task tracking representation
 */
export interface DownloadTask {
  id: string
  asset: AssetItem | GCSMediaItem
  bucket: string
  objectName: string
  userProject: string
  abortController: AbortController
  telemetry: DownloadProgressTelemetry
  startTime: number
  fileHandle?: FileSystemFileHandle
  writableStream?: FileSystemWritableFileStream
}

/**
 * Native Chromium File System Access API Declarations
 */
export interface SaveFilePickerAcceptType {
  description?: string
  accept: Record<string, string[]>
}

export interface SaveFilePickerOptions {
  suggestedName?: string
  types?: SaveFilePickerAcceptType[]
  excludeAcceptAllOption?: boolean
}

export interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
  close(): Promise<void>
  abort(reason?: any): Promise<void>
}

export interface FileSystemFileHandle {
  kind: 'file'
  name: string
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>
  getFile(): Promise<File>
}

/**
 * Custom error thrown when the user dismisses or cancels the Save File Picker dialog
 */
export class UserCancelledPickerError extends Error {
  constructor(message = 'User cancelled file picker dialog.') {
    super(message)
    this.name = 'UserCancelledPickerError'
    Object.setPrototypeOf(this, UserCancelledPickerError.prototype)
  }
}

/**
 * Custom error thrown during stream download pipeline failures
 */
export class StreamDownloadError extends Error {
  public readonly code: string
  public readonly itemId?: string

  constructor(code: string, message: string, itemId?: string) {
    super(message)
    this.name = 'StreamDownloadError'
    this.code = code
    this.itemId = itemId
    Object.setPrototypeOf(this, StreamDownloadError.prototype)
  }
}
