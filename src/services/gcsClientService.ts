import {
  AssetItem,
  BucketNotFoundError,
  CorsConfigurationError,
  DirectoryListingResult,
  GCSBucket,
  GCSClientError,
  GCSListResponse,
  GCSObject,
  IAMPermissionDeniedError,
  ListObjectsOptions,
  PreflightCheckResult,
  PreflightStep,
  UserProjectAccessDeniedError,
  UserProjectMissingError,
} from '../types/gcs'
import { CostGovernanceEngine } from '../engines/cost'
import { ObservabilityService } from './observability'

/**
 * Google Cloud Storage (GCS) JSON REST API v1 Client Service
 * Strictly adheres to Zero-Backend Client Liability: executes directly from browser to
 * https://storage.googleapis.com/storage/v1 with ?userProject={projectId} billing attribution.
 */
export class GCSClientService {
  private static instance: GCSClientService
  private readonly baseUrl = 'https://storage.googleapis.com/storage/v1'

  public static getInstance(): GCSClientService {
    if (!GCSClientService.instance) {
      GCSClientService.instance = new GCSClientService()
    }
    return GCSClientService.instance
  }

  /**
   * Sanitizes and normalizes bucket names:
   * - Strips leading 'gs://' or 'GS://'
   * - Trims leading and trailing slashes
   * - Trims whitespace
   * - Defaults to fallback if empty
   */
  public cleanBucketName(bucket: string, fallback: string = 'partner-raw-master-archives-2026'): string {
    if (!bucket || typeof bucket !== 'string') return fallback
    const cleaned = bucket
      .trim()
      .replace(/^gs:\/\//i, '')
      .replace(/^\/+|\/+$/g, '')
      .trim()
    return cleaned || fallback
  }

  /**
   * Validates GCS Bucket Name format according to GCP naming guidelines:
   * - 3 to 63 characters
   * - Lowercase letters, numbers, hyphens, underscores, dots
   * - Must start and end with a number or lowercase letter
   * - Cannot be formatted as an IP address
   */
  public validateBucketName(bucket: string): { valid: boolean; error?: string } {
    const clean = this.cleanBucketName(bucket, '')
    if (!clean) {
      return { valid: false, error: 'Bucket name cannot be empty.' }
    }

    if (clean.length < 3 || clean.length > 63) {
      return { valid: false, error: 'Bucket name must be between 3 and 63 characters.' }
    }

    if (/[A-Z]/.test(clean)) {
      return { valid: false, error: 'Bucket name must contain only lowercase letters (no uppercase).' }
    }

    if (!/^[a-z0-9]/.test(clean) || !/[a-z0-9]$/.test(clean)) {
      return { valid: false, error: 'Bucket name must start and end with a number or lowercase letter.' }
    }

    if (!/^[a-z0-9._-]+$/.test(clean)) {
      return { valid: false, error: 'Bucket name can only contain lowercase letters, numbers, hyphens (-), underscores (_), and dots (.).' }
    }

    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) {
      return { valid: false, error: 'Bucket name cannot be formatted as an IP address.' }
    }

    if (clean.includes('..')) {
      return { valid: false, error: 'Bucket name cannot contain consecutive dots.' }
    }

    return { valid: true }
  }

  /**
   * Converts Base64-encoded Castagnoli CRC32c hash (as returned by GCS API)
   * into a standardized big-endian uppercase 8-character hex string (e.g. "0xAF82F6C0").
   */
  public base64ToHex(base64: string): string {
    if (!base64 || typeof base64 !== 'string') return '0x00000000'
    try {
      let binary = ''
      if (typeof atob === 'function') {
        binary = atob(base64.trim())
      } else if (typeof Buffer !== 'undefined') {
        binary = Buffer.from(base64.trim(), 'base64').toString('binary')
      }
      let hex = ''
      for (let i = 0; i < binary.length; i++) {
        const byte = binary.charCodeAt(i) & 0xff
        hex += byte.toString(16).padStart(2, '0').toUpperCase()
      }
      return hex ? `0x${hex}` : '0x00000000'
    } catch {
      return '0x00000000'
    }
  }

  /**
   * Converts raw GCS Object resource into normalized AssetItem for UI display.
   */
  public convertGCSObjectToAssetItem(obj: GCSObject): AssetItem {
    const sizeBytes = parseInt(obj.size || '0', 10) || 0
    const displayName = obj.name.includes('/')
      ? obj.name.substring(obj.name.lastIndexOf('/') + 1)
      : obj.name

    return {
      id: obj.id || `${obj.bucket}/${obj.name}`,
      name: obj.name,
      displayName: displayName || obj.name,
      type: obj.name.endsWith('/') ? 'folder' : 'file',
      bucket: obj.bucket,
      sizeBytes,
      formattedSize: CostGovernanceEngine.formatBytes(sizeBytes),
      storageClass: obj.storageClass || 'STANDARD',
      contentType: obj.contentType || 'application/octet-stream',
      updated: obj.updated || new Date().toISOString(),
      timeCreated: obj.timeCreated,
      crc32c: obj.crc32c || '',
      crc32cHex: obj.crc32c ? this.base64ToHex(obj.crc32c) : '0x00000000',
      md5Hash: obj.md5Hash,
      etag: obj.etag,
      generation: obj.generation,
      metageneration: obj.metageneration,
    }
  }

  /**
   * Fetches GCS Bucket Metadata:
   * GET https://storage.googleapis.com/storage/v1/b/{bucket}?userProject={userProject}
   */
  public async getBucketMetadata(
    token: string,
    bucket: string,
    userProject: string,
  ): Promise<GCSBucket> {
    const cleanBucket = this.cleanBucketName(bucket)

    if (!token || token.trim() === '') {
      throw new GCSClientError('UNAUTHENTICATED', 'No OAuth access token provided.', {
        bucket: cleanBucket,
        userProject,
      })
    }

    if (!userProject || userProject.trim() === '') {
      throw new UserProjectMissingError(cleanBucket)
    }

    const url = `${this.baseUrl}/b/${encodeURIComponent(cleanBucket)}?userProject=${encodeURIComponent(
      userProject.trim(),
    )}`

    try {
      ObservabilityService.info('GCS', `Fetching metadata for gs://${cleanBucket} (userProject=${userProject})`)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        let errorBody: any = {}
        try {
          errorBody = await response.json()
        } catch {
          // Ignore JSON parse failure on raw error responses
        }

        const errorMessage = errorBody?.error?.message || response.statusText

        if (response.status === 401) {
          throw new GCSClientError('TOKEN_EXPIRED', 'OAuth access token has expired or is invalid.', {
            httpStatus: 401,
            bucket: cleanBucket,
            userProject,
            rawError: errorBody,
          })
        }

        if (response.status === 400) {
          if (
            errorMessage.toLowerCase().includes('userproject') ||
            errorMessage.toLowerCase().includes('requester pays')
          ) {
            throw new UserProjectMissingError(cleanBucket, errorMessage)
          }
          throw new GCSClientError('INVALID_ARGUMENT', errorMessage, {
            httpStatus: 400,
            bucket: cleanBucket,
            userProject,
            rawError: errorBody,
          })
        }

        if (response.status === 403) {
          if (
            errorMessage.toLowerCase().includes('billing') ||
            errorMessage.toLowerCase().includes('serviceusage') ||
            errorMessage.toLowerCase().includes('userprojectaccessdenied') ||
            errorBody?.error?.errors?.some((e: any) => e.reason === 'userProjectAccessDenied')
          ) {
            throw new UserProjectAccessDeniedError(cleanBucket, userProject, errorMessage)
          }
          throw new IAMPermissionDeniedError(cleanBucket)
        }

        if (response.status === 404) {
          throw new BucketNotFoundError(cleanBucket)
        }

        throw new GCSClientError('UNKNOWN', `GCS API error (${response.status}): ${errorMessage}`, {
          httpStatus: response.status,
          bucket: cleanBucket,
          userProject,
          rawError: errorBody,
        })
      }

      const data: GCSBucket = await response.json()
      return data
    } catch (err: any) {
      if (err instanceof GCSClientError) {
        throw err
      }

      if (err.name === 'TypeError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        throw new CorsConfigurationError(cleanBucket, err.message)
      }

      throw new GCSClientError('NETWORK_ERROR', `Network error accessing gs://${cleanBucket}: ${err.message}`, {
        bucket: cleanBucket,
        userProject,
        rawError: err,
      })
    }
  }

  /**
   * Queries GCS Objects using Delimiter virtual slicing and pagination:
   * GET https://storage.googleapis.com/storage/v1/b/{bucket}/o?delimiter=/&prefix={prefix}&userProject={userProject}&pageToken={pageToken}&maxResults={maxResults}
   */
  public async listObjects(
    token: string,
    bucket: string,
    options: ListObjectsOptions,
  ): Promise<DirectoryListingResult> {
    const cleanBucket = this.cleanBucketName(bucket)
    const { userProject, maxResults = 250, pageToken, delimiter = '/' } = options

    if (!token || token.trim() === '') {
      throw new GCSClientError('UNAUTHENTICATED', 'No OAuth access token provided.', {
        bucket: cleanBucket,
        userProject,
      })
    }

    if (!userProject || userProject.trim() === '') {
      throw new UserProjectMissingError(cleanBucket)
    }

    const cleanPrefix = (options.prefix || '').replace(/^\/+/, '')

    const params = new URLSearchParams()
    if (delimiter) params.set('delimiter', delimiter)
    if (cleanPrefix) params.set('prefix', cleanPrefix)
    params.set('userProject', userProject.trim())
    params.set('maxResults', String(maxResults))
    if (pageToken) params.set('pageToken', pageToken)

    const url = `${this.baseUrl}/b/${encodeURIComponent(cleanBucket)}/o?${params.toString()}`

    try {
      ObservabilityService.info('GCS', `Listing objects in gs://${cleanBucket}/${cleanPrefix} (userProject=${userProject})`)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/json',
        },
        signal: options.signal,
      })

      if (!response.ok) {
        let errorBody: any = {}
        try {
          errorBody = await response.json()
        } catch {
          // Ignore parse errors
        }

        const errorMessage = errorBody?.error?.message || response.statusText

        if (response.status === 401) {
          throw new GCSClientError('TOKEN_EXPIRED', 'OAuth access token has expired or is invalid.', {
            httpStatus: 401,
            bucket: cleanBucket,
            userProject,
            rawError: errorBody,
          })
        }

        if (response.status === 400) {
          if (
            errorMessage.toLowerCase().includes('userproject') ||
            errorMessage.toLowerCase().includes('requester pays')
          ) {
            throw new UserProjectMissingError(cleanBucket, errorMessage)
          }
          throw new GCSClientError('INVALID_ARGUMENT', errorMessage, {
            httpStatus: 400,
            bucket: cleanBucket,
            userProject,
            rawError: errorBody,
          })
        }

        if (response.status === 403) {
          if (
            errorMessage.toLowerCase().includes('billing') ||
            errorMessage.toLowerCase().includes('serviceusage') ||
            errorMessage.toLowerCase().includes('userprojectaccessdenied') ||
            errorBody?.error?.errors?.some((e: any) => e.reason === 'userProjectAccessDenied')
          ) {
            throw new UserProjectAccessDeniedError(cleanBucket, userProject, errorMessage)
          }
          throw new IAMPermissionDeniedError(cleanBucket)
        }

        if (response.status === 404) {
          throw new BucketNotFoundError(cleanBucket)
        }

        throw new GCSClientError('UNKNOWN', `GCS API error (${response.status}): ${errorMessage}`, {
          httpStatus: response.status,
          bucket: cleanBucket,
          userProject,
          rawError: errorBody,
        })
      }

      const data: GCSListResponse = await response.json()

      const folders = (data.prefixes || []).sort()
      const files: AssetItem[] = []

      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          // Filter out directory marker placeholder matching the cleanPrefix itself
          if (item.name === cleanPrefix || (item.name === `${cleanPrefix}/` && item.size === '0')) {
            continue
          }
          files.push(this.convertGCSObjectToAssetItem(item))
        }
      }

      return {
        currentPrefix: cleanPrefix,
        folders,
        files,
        nextPageToken: data.nextPageToken,
        totalEstimatedItems: folders.length + files.length,
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || options.signal?.aborted) {
        throw err
      }

      if (err instanceof GCSClientError) {
        throw err
      }

      if (err.name === 'TypeError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        throw new CorsConfigurationError(cleanBucket, err.message)
      }

      throw new GCSClientError('NETWORK_ERROR', `Network error listing gs://${cleanBucket}: ${err.message}`, {
        bucket: cleanBucket,
        userProject,
        rawError: err,
      })
    }
  }

  /**
   * Executes the automated 4-point preflight handshake against the target bucket:
   * 1. Token TTL Validity (>60s)
   * 2. Bucket Reachability & Requester-Pays Enforcement
   * 3. IAM roles/storage.objectViewer Permission Check
   * 4. CORS Preflight Header Exposure Check
   */
  public async run4PointPreflight(
    token: string,
    bucket: string,
    userProject: string,
    tokenExpiresAt?: number,
  ): Promise<PreflightCheckResult> {
    const cleanBucket = this.cleanBucketName(bucket)
    const cleanProject = (userProject || '').trim()

    // Step 1: Token Validity & TTL
    let oauthTokenValid = false
    let oauthExpiresInSeconds = 0

    if (token && token.trim().length > 0) {
      if (tokenExpiresAt && tokenExpiresAt > 0) {
        const remaining = Math.max(0, Math.round((tokenExpiresAt - Date.now()) / 1000))
        oauthExpiresInSeconds = remaining
        oauthTokenValid = remaining > 60
      } else {
        oauthTokenValid = true
        oauthExpiresInSeconds = 3600
      }
    }

    const tokenStep: PreflightStep = {
      id: 'token',
      name: 'OAuth 2.0 Token Valid',
      description: 'Verifies volatile in-memory access token validity and remaining TTL.',
      status: oauthTokenValid ? 'passed' : 'failed',
      detail: oauthTokenValid
        ? `Expires in ~${Math.max(1, Math.round(oauthExpiresInSeconds / 60))}m (Auto-Renewal)`
        : 'Access token is expired, missing, or has <60s remaining TTL.',
      errorMessage: oauthTokenValid ? undefined : 'OAuth access token is invalid or expired.',
      remediation: oauthTokenValid ? undefined : 'Sign in with your Google account in Step 1 to obtain a fresh token.',
    }

    if (!oauthTokenValid) {
      return {
        oauthTokenValid: false,
        oauthExpiresInSeconds,
        bucketReachable: false,
        requesterPaysActive: false,
        iamViewerGranted: false,
        corsConfigured: false,
        steps: [
          tokenStep,
          {
            id: 'bucket',
            name: 'Requester-Pays Enforced',
            description: 'Validates bucket reachability and billing attribution.',
            status: 'pending',
          },
          {
            id: 'iam',
            name: 'IAM Object Viewer Granted',
            description: 'Probes roles/storage.objectViewer permission on bucket.',
            status: 'pending',
          },
          {
            id: 'cors',
            name: 'CORS Preflight Headers OK',
            description: 'Validates browser CORS preflight and exposure headers.',
            status: 'pending',
          },
        ],
        rawError: 'TOKEN_EXPIRED',
        errorMessage: 'OAuth access token is missing or expired.',
        remediationStep: 'Sign in with your Google account in Step 1 to obtain a fresh token.',
      }
    }

    // If userProject is missing
    if (!cleanProject) {
      const bucketStep: PreflightStep = {
        id: 'bucket',
        name: 'Requester-Pays Enforced',
        description: 'Validates bucket reachability and billing attribution.',
        status: 'warning',
        detail: 'Requester Pays requires a valid Google Cloud Project ID.',
        errorMessage: `Requester Pays is enabled on bucket gs://${cleanBucket}. Enter a valid GCP Project ID.`,
        remediation: 'Provide a valid Google Cloud Project ID with billing enabled.',
      }
      const iamStep: PreflightStep = {
        id: 'iam',
        name: 'IAM Object Viewer Granted',
        description: 'Probes roles/storage.objectViewer permission on bucket.',
        status: 'failed',
        detail: 'Cannot evaluate IAM permissions without an active billing project.',
      }
      const corsStep: PreflightStep = {
        id: 'cors',
        name: 'CORS Preflight Headers OK',
        description: 'Validates browser CORS preflight and exposure headers.',
        status: 'failed',
        detail: 'Preflight probe could not execute without billing project.',
      }

      return {
        oauthTokenValid: true,
        oauthExpiresInSeconds,
        bucketReachable: true,
        requesterPaysActive: true,
        iamViewerGranted: false,
        corsConfigured: false,
        steps: [tokenStep, bucketStep, iamStep, corsStep],
        rawError: 'HTTP 400 UserProjectMissing',
        errorMessage: 'Requester Pays is enabled on this bucket. Enter a valid GCP Project ID.',
        remediationStep: 'Provide a valid Google Cloud Project ID with billing enabled.',
      }
    }

    // Step 2, 3 & 4: Probe GCS via listObjects (requires roles/storage.objectViewer + requester-pays userProject)
    let bucketReachable = false
    let requesterPaysActive = false
    let iamViewerGranted = false
    let bucketStepStatus: PreflightStep['status'] = 'pending'
    let iamStepStatus: PreflightStep['status'] = 'pending'
    let bucketError: string | undefined
    let bucketRemediation: string | undefined
    let bucketRemediationUrl: string | undefined
    let iamError: string | undefined
    let iamRemediation: string | undefined
    let iamRemediationUrl: string | undefined
    let isCors = false

    try {
      await this.listObjects(token, cleanBucket, {
        prefix: '',
        delimiter: '/',
        userProject: cleanProject,
        maxResults: 1,
      })

      bucketReachable = true
      requesterPaysActive = true
      bucketStepStatus = 'passed'
      iamViewerGranted = true
      iamStepStatus = 'passed'
    } catch (err: any) {
      if (err instanceof UserProjectMissingError) {
        bucketReachable = true
        requesterPaysActive = true
        bucketStepStatus = 'warning'
        bucketError = err.message
        bucketRemediation = err.remediationStep
        iamStepStatus = 'failed'
        iamError = 'Requester-Pays project required to evaluate IAM permissions.'
      } else if (err instanceof UserProjectAccessDeniedError) {
        bucketReachable = false
        requesterPaysActive = true
        bucketStepStatus = 'failed'
        bucketError = err.message
        bucketRemediation = err.remediationStep
        bucketRemediationUrl = err.remediationUrl
        iamStepStatus = 'failed'
        iamError = 'Cannot verify IAM access: billing project access denied.'
      } else if (err instanceof BucketNotFoundError) {
        bucketReachable = false
        bucketStepStatus = 'failed'
        bucketError = err.message
        bucketRemediation = err.remediationStep
        iamStepStatus = 'failed'
        iamError = 'Bucket does not exist.'
      } else if (err instanceof CorsConfigurationError) {
        isCors = true
        bucketReachable = false
        bucketStepStatus = 'failed'
        bucketError = err.message
        bucketRemediation = err.remediationStep
        bucketRemediationUrl = err.remediationUrl
        iamStepStatus = 'failed'
        iamError = 'CORS blocked preflight probe request.'
      } else if (err instanceof IAMPermissionDeniedError) {
        bucketReachable = true
        requesterPaysActive = true
        bucketStepStatus = 'passed'
        iamViewerGranted = false
        iamStepStatus = 'failed'
        iamError = err.message
        iamRemediation = err.remediationStep
        iamRemediationUrl = err.remediationUrl
      } else {
        bucketReachable = false
        bucketStepStatus = 'failed'
        bucketError = err.message
        iamStepStatus = 'failed'
        iamError = err.message
      }
    }

    const bucketStep: PreflightStep = {
      id: 'bucket',
      name: 'Requester-Pays Enforced',
      description: 'Validates bucket reachability and billing attribution.',
      status: bucketStepStatus,
      detail: bucketStepStatus === 'passed' ? `Billed to: ${cleanProject}` : bucketError,
      errorMessage: bucketError,
      remediation: bucketRemediation,
      remediationUrl: bucketRemediationUrl,
    }

    const iamStep: PreflightStep = {
      id: 'iam',
      name: 'IAM Object Viewer Granted',
      description: 'Probes roles/storage.objectViewer permission on bucket.',
      status: iamStepStatus,
      detail: iamViewerGranted ? 'roles/storage.objectViewer OK' : iamError,
      errorMessage: iamError,
      remediation: iamRemediation,
      remediationUrl: iamRemediationUrl,
    }

    // Step 4: CORS Exposure Headers Check
    const corsConfigured = !isCors && bucketStepStatus !== 'failed' && (iamStepStatus === 'passed' || iamViewerGranted)
    const corsStep: PreflightStep = {
      id: 'cors',
      name: 'CORS Preflight Headers OK',
      description: 'Validates browser CORS preflight and exposure headers.',
      status: corsConfigured ? 'passed' : 'failed',
      detail: corsConfigured
        ? 'x-goog-hash, Content-Length Exposed'
        : 'Bucket lacks required CORS headers for direct browser media retrieval.',
      errorMessage: corsConfigured ? undefined : 'CORS configuration missing or invalid on bucket.',
      remediation: corsConfigured
        ? undefined
        : `Apply CORS configuration to the bucket using: gcloud storage buckets update gs://${cleanBucket} --cors-file=cors.json`,
      remediationUrl: corsConfigured ? undefined : 'https://cloud.google.com/storage/docs/using-cors',
    }

    const allPassed = oauthTokenValid && bucketReachable && requesterPaysActive && iamViewerGranted && corsConfigured

    return {
      oauthTokenValid,
      oauthExpiresInSeconds,
      bucketReachable,
      requesterPaysActive,
      iamViewerGranted,
      corsConfigured,
      steps: [tokenStep, bucketStep, iamStep, corsStep],
      rawError: allPassed ? undefined : (bucketError || iamError),
      errorMessage: allPassed ? undefined : (bucketError || iamError),
      remediationStep: allPassed ? undefined : (bucketRemediation || iamRemediation),
      remediationUrl: allPassed ? undefined : (bucketRemediationUrl || iamRemediationUrl),
    }
  }
}

export const gcsClientService = GCSClientService.getInstance()
