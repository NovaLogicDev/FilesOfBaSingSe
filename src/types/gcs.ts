export type StorageClass = 'ARCHIVE' | 'COLDLINE' | 'NEARLINE' | 'STANDARD'

export interface GCSObjectMetadata {
  kind: 'storage#object'
  id: string
  name: string
  bucket: string
  generation: string
  metageneration: string
  contentType: string
  storageClass: StorageClass
  size: string // BigInt string as returned by GCS API
  md5Hash?: string
  crc32c: string // Base64 encoded Castagnoli CRC32c
  etag: string
  timeCreated: string
  updated: string
  mediaLink?: string
}

export interface GCSMediaItem {
  id: string
  name: string // e.g. "feature_films/reel_04/reel04_cam_A_raw.mxf"
  displayName: string // e.g. "reel04_cam_A_raw.mxf"
  type: 'folder' | 'file'
  bucket: string
  sizeBytes: number
  formattedSize: string
  storageClass: StorageClass
  contentType: string
  updated: string
  timeCreated?: string
  crc32c: string // Base64 encoded
  crc32cHex?: string // Hex e.g. "0xAF82F6C0"
  md5Hash?: string
  etag: string
  generation?: string
}

export interface DirectoryListingResult {
  currentPrefix: string
  folders: string[] // Virtual folder prefixes, e.g. ["feature_films/reel_04/"]
  files: GCSMediaItem[]
  nextPageToken?: string
  totalEstimatedItems: number
}

export interface PreflightCheckResult {
  oauthTokenValid: boolean
  oauthExpiresInSeconds: number
  bucketReachable: boolean
  requesterPaysActive: boolean
  iamViewerGranted: boolean
  corsConfigured: boolean
  rawError?: string
  errorMessage?: string
  remediationStep?: string
}

export interface ExplorerFilterState {
  searchQuery: string
  categoryFilter: 'all' | 'video' | 'audio' | 'archive' | 'metadata'
  sortColumn: 'name' | 'size' | 'storageClass' | 'updated'
  sortDirection: 'asc' | 'desc'
}
