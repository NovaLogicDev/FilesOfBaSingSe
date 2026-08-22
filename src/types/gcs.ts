/**
 * Google Cloud Storage (GCS) Types & Contracts
 * Defined for GCS JSON REST API v1, Domain Asset Items, 4-Point Preflight Handshake, and Typed Error Classes.
 */

/**
 * Storage Class types supported by Google Cloud Storage
 */
export type GCSStorageClass = 'ARCHIVE' | 'COLDLINE' | 'NEARLINE' | 'STANDARD'
export type StorageClass = GCSStorageClass // Backward-compatible alias

/**
 * Raw GCS Bucket Metadata Schema from GCS JSON API v1
 * Endpoint: GET https://storage.googleapis.com/storage/v1/b/{bucket}
 */
export interface GCSBucket {
  kind: 'storage#bucket'
  id: string
  name: string
  projectNumber?: string
  location?: string
  locationType?: string
  storageClass?: GCSStorageClass
  billing?: {
    requesterPays?: boolean
  }
  cors?: Array<{
    origin?: string[]
    method?: string[]
    responseHeader?: string[]
    maxAgeSeconds?: number
  }>
  timeCreated?: string
  updated?: string
  etag?: string
  metageneration?: string
}

/**
 * Raw GCS Object Resource Schema from GCS JSON API v1
 * Endpoint: GET https://storage.googleapis.com/storage/v1/b/{bucket}/o/{object}
 */
export interface GCSObject {
  kind: 'storage#object'
  id: string
  name: string
  bucket: string
  generation: string
  metageneration?: string
  contentType?: string
  storageClass: GCSStorageClass
  size: string // BigInt string as returned by GCS API
  md5Hash?: string
  crc32c: string // Base64 encoded Castagnoli CRC32c
  etag: string
  timeCreated?: string
  updated: string
  mediaLink?: string
}

export type GCSObjectMetadata = GCSObject // Backward-compatible alias

/**
 * Raw GCS Objects List API Response Schema
 * Endpoint: GET https://storage.googleapis.com/storage/v1/b/{bucket}/o
 */
export interface GCSListResponse {
  kind: 'storage#objects'
  prefixes?: string[] // Subfolder paths when delimiter=/ is used
  items?: GCSObject[] // Leaf objects in the current prefix
  nextPageToken?: string
}

/**
 * Normalized Virtual Directory Asset Item
 * Used throughout UI components (Explorer, Inspector, Downloader, CLI)
 */
export interface AssetItem {
  id: string
  name: string // e.g. "feature_films/reel_04/reel04_cam_A_raw.mxf"
  displayName: string // e.g. "reel04_cam_A_raw.mxf"
  type: 'folder' | 'file'
  bucket: string
  sizeBytes: number
  formattedSize: string
  storageClass: GCSStorageClass
  contentType: string
  updated: string
  timeCreated?: string
  crc32c: string // Base64 encoded
  crc32cHex?: string // Hex e.g. "0xAF82F6C0"
  md5Hash?: string
  etag: string
  generation?: string
  metageneration?: string
}

export type GCSMediaItem = AssetItem // Backward-compatible alias

/**
 * Unified Directory Listing Result for UI consumption
 */
export interface DirectoryListingResult {
  currentPrefix: string
  folders: string[] // Virtual folder prefixes, e.g. ["feature_films/reel_04/"]
  files: AssetItem[]
  nextPageToken?: string
  totalEstimatedItems: number
}

/**
 * Preflight Check Step Status
 */
export type PreflightStepStatus = 'pending' | 'checking' | 'passed' | 'failed' | 'warning'

/**
 * Discrete 4-Point Preflight Handshake Step
 */
export interface PreflightStep {
  id: 'token' | 'bucket' | 'iam' | 'cors'
  name: string
  description: string
  status: PreflightStepStatus
  detail?: string
  errorMessage?: string
  remediation?: string
  remediationUrl?: string
}

/**
 * Result of the 4-Point Preflight Handshake
 */
export interface PreflightCheckResult {
  oauthTokenValid: boolean
  oauthExpiresInSeconds: number
  bucketReachable: boolean
  requesterPaysActive: boolean
  iamViewerGranted: boolean
  corsConfigured: boolean
  steps?: PreflightStep[]
  rawError?: string
  errorMessage?: string
  remediationStep?: string
  remediationUrl?: string
}

export type PreflightStatus = PreflightCheckResult // Backward-compatible alias

/**
 * Explorer Table Filtering and Sorting State
 */
export interface ExplorerFilterState {
  searchQuery: string
  categoryFilter: 'all' | 'video' | 'audio' | 'archive' | 'metadata'
  sortColumn: 'name' | 'size' | 'storageClass' | 'updated'
  sortDirection: 'asc' | 'desc'
}

/**
 * Options for querying objects from GCS REST API
 */
export interface ListObjectsOptions {
  prefix?: string
  delimiter?: string
  pageToken?: string
  maxResults?: number
  userProject: string
  signal?: AbortSignal
}

/**
 * Error Codes for GCS Client Operations
 */
export type GCSClientErrorCode =
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'USER_PROJECT_MISSING'
  | 'USER_PROJECT_ACCESS_DENIED'
  | 'BUCKET_NOT_FOUND'
  | 'IAM_PERMISSION_DENIED'
  | 'CORS_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_BUCKET_NAME'
  | 'INVALID_ARGUMENT'
  | 'UNKNOWN'

/**
 * Base GCS Client Error with structured error metadata
 */
export class GCSClientError extends Error {
  public readonly code: GCSClientErrorCode
  public readonly httpStatus?: number
  public readonly bucket?: string
  public readonly userProject?: string
  public readonly remediationStep?: string
  public readonly remediationUrl?: string
  public readonly rawError?: any

  constructor(
    code: GCSClientErrorCode,
    message: string,
    options?: {
      httpStatus?: number
      bucket?: string
      userProject?: string
      remediationStep?: string
      remediationUrl?: string
      rawError?: any
    },
  ) {
    super(message)
    this.name = 'GCSClientError'
    this.code = code
    this.httpStatus = options?.httpStatus
    this.bucket = options?.bucket
    this.userProject = options?.userProject
    this.remediationStep = options?.remediationStep
    this.remediationUrl = options?.remediationUrl
    this.rawError = options?.rawError
    Object.setPrototypeOf(this, GCSClientError.prototype)
  }
}

export class UserProjectMissingError extends GCSClientError {
  constructor(bucket: string, message?: string) {
    super(
      'USER_PROJECT_MISSING',
      message || `Requester Pays is enabled on bucket gs://${bucket}. Enter a valid GCP Project ID.`,
      {
        httpStatus: 400,
        bucket,
        remediationStep: 'Provide a valid Google Cloud Project ID with billing enabled.',
      },
    )
    this.name = 'UserProjectMissingError'
    Object.setPrototypeOf(this, UserProjectMissingError.prototype)
  }
}

export class UserProjectAccessDeniedError extends GCSClientError {
  constructor(bucket: string, userProject: string, message?: string) {
    super(
      'USER_PROJECT_ACCESS_DENIED',
      message ||
        `Access denied using billing project "${userProject}". The project does not have billing enabled or lacks serviceusage permission.`,
      {
        httpStatus: 403,
        bucket,
        userProject,
        remediationStep: 'Link an active billing account to this project in Google Cloud Console.',
        remediationUrl: `https://console.cloud.google.com/billing/linkedaccount?project=${userProject}`,
      },
    )
    this.name = 'UserProjectAccessDeniedError'
    Object.setPrototypeOf(this, UserProjectAccessDeniedError.prototype)
  }
}

export class BucketNotFoundError extends GCSClientError {
  constructor(bucket: string) {
    super('BUCKET_NOT_FOUND', `The specified bucket "gs://${bucket}" does not exist.`, {
      httpStatus: 404,
      bucket,
      remediationStep: 'Verify the bucket name spelling and ensure you have access.',
    })
    this.name = 'BucketNotFoundError'
    Object.setPrototypeOf(this, BucketNotFoundError.prototype)
  }
}

export class IAMPermissionDeniedError extends GCSClientError {
  constructor(bucket: string, userEmail?: string) {
    super(
      'IAM_PERMISSION_DENIED',
      `Your Google account ${userEmail ? `(${userEmail}) ` : ''}lacks Storage Object Viewer access (roles/storage.objectViewer) on gs://${bucket}.`,
      {
        httpStatus: 403,
        bucket,
        remediationStep:
          'Contact the bucket administrator to grant roles/storage.objectViewer to your account.',
        remediationUrl: 'https://cloud.google.com/storage/docs/access-control/iam-roles',
      },
    )
    this.name = 'IAMPermissionDeniedError'
    Object.setPrototypeOf(this, IAMPermissionDeniedError.prototype)
  }
}

export class CorsConfigurationError extends GCSClientError {
  constructor(bucket: string, rawMessage?: string) {
    super(
      'CORS_ERROR',
      `Browser preflight (CORS) check failed against gs://${bucket}. The bucket must allow web origin requests.`,
      {
        httpStatus: 0,
        bucket,
        remediationStep:
          'Apply CORS configuration to the bucket using: gcloud storage buckets update gs://BUCKET --cors-file=cors.json',
        remediationUrl: 'https://cloud.google.com/storage/docs/using-cors',
        rawError: rawMessage,
      },
    )
    this.name = 'CorsConfigurationError'
    Object.setPrototypeOf(this, CorsConfigurationError.prototype)
  }
}
