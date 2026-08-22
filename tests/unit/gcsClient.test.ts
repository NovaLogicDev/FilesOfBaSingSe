import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  GCSClientService,
  gcsClientService,
} from '../../src/services/gcsClientService'
import {
  GCSClientError,
  UserProjectMissingError,
  UserProjectAccessDeniedError,
  BucketNotFoundError,
  IAMPermissionDeniedError,
  CorsConfigurationError,
  GCSObject,
} from '../../src/types/gcs'
import { resetAllStores } from '../helpers/testUtils'

describe('GCSClientService - Live GCS JSON REST API v1 Client & 4-Point Preflight Handshake', () => {
  const sampleToken = 'ya29.sample_gcs_test_token'
  const sampleBucket = 'partner-raw-master-archives-2026'
  const sampleProject = 'client-media-project-2026'
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetAllStores()
    originalFetch = globalThis.fetch
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('Singleton Instance', () => {
    it('returns the same singleton instance', () => {
      const instance1 = GCSClientService.getInstance()
      const instance2 = GCSClientService.getInstance()
      expect(instance1).toBe(instance2)
      expect(instance1).toBe(gcsClientService)
    })
  })

  describe('cleanBucketName', () => {
    it('strips leading gs:// case-insensitively', () => {
      expect(gcsClientService.cleanBucketName('gs://my-bucket')).toBe('my-bucket')
      expect(gcsClientService.cleanBucketName('GS://MY-BUCKET')).toBe('MY-BUCKET')
      expect(gcsClientService.cleanBucketName('Gs://mixed-case-bucket')).toBe('mixed-case-bucket')
    })

    it('trims leading and trailing slashes and whitespace', () => {
      expect(gcsClientService.cleanBucketName('  gs://my-bucket/  ')).toBe('my-bucket')
      expect(gcsClientService.cleanBucketName('///my-bucket///')).toBe('my-bucket')
      expect(gcsClientService.cleanBucketName('gs://my-bucket///')).toBe('my-bucket')
    })

    it('returns default fallback when given empty or whitespace-only input', () => {
      expect(gcsClientService.cleanBucketName('')).toBe('partner-raw-master-archives-2026')
      expect(gcsClientService.cleanBucketName('   ')).toBe('partner-raw-master-archives-2026')
      expect(gcsClientService.cleanBucketName('gs://')).toBe('partner-raw-master-archives-2026')
      expect(gcsClientService.cleanBucketName(null as any)).toBe('partner-raw-master-archives-2026')
    })

    it('allows custom fallback', () => {
      expect(gcsClientService.cleanBucketName('', 'custom-fallback')).toBe('custom-fallback')
    })
  })

  describe('validateBucketName', () => {
    it('accepts valid bucket names according to Google Cloud rules', () => {
      expect(gcsClientService.validateBucketName('partner-raw-master-archives-2026').valid).toBe(true)
      expect(gcsClientService.validateBucketName('my-bucket-123').valid).toBe(true)
      expect(gcsClientService.validateBucketName('bucket.with.dots').valid).toBe(true)
      expect(gcsClientService.validateBucketName('bucket_with_underscores').valid).toBe(true)
      expect(gcsClientService.validateBucketName('gs://valid-bucket-name').valid).toBe(true)
    })

    it('rejects empty bucket names', () => {
      expect(gcsClientService.validateBucketName('').valid).toBe(false)
      expect(gcsClientService.validateBucketName('   ').valid).toBe(false)
    })

    it('rejects bucket names shorter than 3 characters', () => {
      const res = gcsClientService.validateBucketName('ab')
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/between 3 and 63 characters/i)
    })

    it('rejects bucket names longer than 63 characters', () => {
      const res = gcsClientService.validateBucketName('a'.repeat(64))
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/between 3 and 63 characters/i)
    })

    it('rejects bucket names containing uppercase letters', () => {
      const res = gcsClientService.validateBucketName('My-Bucket')
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/lowercase/i)
    })

    it('rejects bucket names not starting or ending with alphanumeric characters', () => {
      expect(gcsClientService.validateBucketName('-start-hyphen').valid).toBe(false)
      expect(gcsClientService.validateBucketName('end-hyphen-').valid).toBe(false)
      expect(gcsClientService.validateBucketName('.start-dot').valid).toBe(false)
      expect(gcsClientService.validateBucketName('end-dot.').valid).toBe(false)
    })

    it('rejects bucket names formatted as IP addresses', () => {
      const res = gcsClientService.validateBucketName('192.168.1.1')
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/IP address/i)
    })

    it('rejects bucket names with consecutive dots', () => {
      const res = gcsClientService.validateBucketName('my..bucket')
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/consecutive dots/i)
    })
  })

  describe('base64ToHex (CRC32c Checksum Conversion)', () => {
    it('correctly converts Base64 CRC32c hashes to big-endian Hex strings', () => {
      // r4L2wA== -> [0xaf, 0x82, 0xf6, 0xc0] -> 0xAF82F6C0
      expect(gcsClientService.base64ToHex('r4L2wA==')).toBe('0xAF82F6C0')
      // v9M3xA== -> [0xbf, 0xd3, 0x37, 0xc4] -> 0xBFD337C4
      expect(gcsClientService.base64ToHex('v9M3xA==')).toBe('0xBFD337C4')
      // 4waSgw== -> [0xe3, 0x06, 0x92, 0x83] -> 0xE3069283
      expect(gcsClientService.base64ToHex('4waSgw==')).toBe('0xE3069283')
    })

    it('handles empty or invalid inputs gracefully', () => {
      expect(gcsClientService.base64ToHex('')).toBe('0x00000000')
      expect(gcsClientService.base64ToHex(null as any)).toBe('0x00000000')
      expect(gcsClientService.base64ToHex('invalid-base-64-!!')).toBe('0x00000000')
    })
  })

  describe('convertGCSObjectToAssetItem', () => {
    it('converts raw GCSObject into normalized AssetItem for UI display', () => {
      const rawObject: GCSObject = {
        kind: 'storage#object',
        id: 'partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_A_raw.mxf/1721038935129482',
        name: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
        bucket: 'partner-raw-master-archives-2026',
        generation: '1721038935129482',
        metageneration: '1',
        contentType: 'application/mxf',
        storageClass: 'ARCHIVE',
        size: '18400000000',
        md5Hash: '3a4f8d9b1c2e4a5f6e7d8c9b0a1b2c3d',
        crc32c: 'r4L2wA==',
        etag: 'CPj8kO78u4cDEAE=',
        timeCreated: '2026-07-14T10:20:00Z',
        updated: '2026-07-14T10:22:15Z',
      }

      const item = gcsClientService.convertGCSObjectToAssetItem(rawObject)
      expect(item.name).toBe('feature_films/reel_04/reel04_cam_A_raw.mxf')
      expect(item.displayName).toBe('reel04_cam_A_raw.mxf')
      expect(item.type).toBe('file')
      expect(item.bucket).toBe('partner-raw-master-archives-2026')
      expect(item.sizeBytes).toBe(18_400_000_000)
      expect(item.formattedSize).toBe('18.4 GB')
      expect(item.storageClass).toBe('ARCHIVE')
      expect(item.crc32c).toBe('r4L2wA==')
      expect(item.crc32cHex).toBe('0xAF82F6C0')
      expect(item.generation).toBe('1721038935129482')
    })

    it('identifies directory folders if name ends with /', () => {
      const rawFolder: GCSObject = {
        kind: 'storage#object',
        id: 'partner-raw-master-archives-2026/feature_films/reel_04/',
        name: 'feature_films/reel_04/',
        bucket: 'partner-raw-master-archives-2026',
        generation: '1',
        contentType: 'application/x-directory',
        storageClass: 'STANDARD',
        size: '0',
        crc32c: 'AAAAAA==',
        etag: 'xyz',
        updated: '2026-07-14T10:20:00Z',
      }

      const item = gcsClientService.convertGCSObjectToAssetItem(rawFolder)
      expect(item.type).toBe('folder')
    })
  })

  describe('getBucketMetadata (GET /storage/v1/b/{bucket})', () => {
    it('throws UNAUTHENTICATED error when token is missing', async () => {
      await expect(
        gcsClientService.getBucketMetadata('', sampleBucket, sampleProject),
      ).rejects.toThrow(GCSClientError)
    })

    it('throws UserProjectMissingError when userProject is empty', async () => {
      await expect(
        gcsClientService.getBucketMetadata(sampleToken, sampleBucket, ''),
      ).rejects.toThrow(UserProjectMissingError)
    })

    it('queries GCS REST API with Authorization Bearer header and ?userProject param', async () => {
      const mockBucket = {
        kind: 'storage#bucket',
        id: sampleBucket,
        name: sampleBucket,
        billing: { requesterPays: true },
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockBucket,
      } as any)

      const result = await gcsClientService.getBucketMetadata(sampleToken, sampleBucket, sampleProject)
      expect(result.id).toBe(sampleBucket)
      expect(result.billing?.requesterPays).toBe(true)

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `https://storage.googleapis.com/storage/v1/b/${sampleBucket}?userProject=${sampleProject}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${sampleToken}`,
            Accept: 'application/json',
          }),
        }),
      )
    })

    it('throws TOKEN_EXPIRED on HTTP 401', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid Credentials' } }),
      } as any)

      await expect(
        gcsClientService.getBucketMetadata(sampleToken, sampleBucket, sampleProject),
      ).rejects.toMatchObject({
        code: 'TOKEN_EXPIRED',
        httpStatus: 401,
      })
    })

    it('throws UserProjectMissingError on HTTP 400 mentioning UserProject', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { message: 'Bucket is a requester pays bucket but no user project provided.' },
        }),
      } as any)

      await expect(
        gcsClientService.getBucketMetadata(sampleToken, sampleBucket, sampleProject),
      ).rejects.toThrow(UserProjectMissingError)
    })

    it('throws UserProjectAccessDeniedError on HTTP 403 with userProjectAccessDenied reason', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          error: {
            message: 'User project access denied or billing not enabled.',
            errors: [{ reason: 'userProjectAccessDenied' }],
          },
        }),
      } as any)

      await expect(
        gcsClientService.getBucketMetadata(sampleToken, sampleBucket, sampleProject),
      ).rejects.toThrow(UserProjectAccessDeniedError)
    })

    it('throws IAMPermissionDeniedError on HTTP 403 standard permission denied', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          error: {
            message: 'Caller does not have storage.buckets.get access to bucket.',
          },
        }),
      } as any)

      await expect(
        gcsClientService.getBucketMetadata(sampleToken, sampleBucket, sampleProject),
      ).rejects.toThrow(IAMPermissionDeniedError)
    })

    it('throws BucketNotFoundError on HTTP 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: { message: 'Not Found' } }),
      } as any)

      await expect(
        gcsClientService.getBucketMetadata(sampleToken, 'non-existent-bucket', sampleProject),
      ).rejects.toThrow(BucketNotFoundError)
    })

    it('throws CorsConfigurationError on browser TypeError fetch failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(
        gcsClientService.getBucketMetadata(sampleToken, sampleBucket, sampleProject),
      ).rejects.toThrow(CorsConfigurationError)
    })
  })

  describe('listObjects (GET /storage/v1/b/{bucket}/o)', () => {
    it('constructs correct query parameters with delimiter, prefix, and userProject', async () => {
      const mockListResponse = {
        kind: 'storage#objects',
        prefixes: ['feature_films/reel_04/'],
        items: [
          {
            kind: 'storage#object',
            id: 'sample-01',
            name: 'feature_films/manifest.json',
            bucket: sampleBucket,
            generation: '100',
            size: '1024',
            storageClass: 'STANDARD',
            contentType: 'application/json',
            crc32c: '4waSgw==',
            etag: 'etag-1',
            updated: '2026-08-01T00:00:00Z',
          },
        ],
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockListResponse,
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: 'feature_films/',
        delimiter: '/',
        userProject: sampleProject,
        maxResults: 100,
      })

      expect(result.currentPrefix).toBe('feature_films/')
      expect(result.folders).toEqual(['feature_films/reel_04/'])
      expect(result.files).toHaveLength(1)
      expect(result.files[0].displayName).toBe('manifest.json')
      expect(result.files[0].crc32cHex).toBe('0xE3069283')

      const callUrl = (globalThis.fetch as any).mock.calls[0][0]
      expect(callUrl).toContain(`delimiter=%2F`)
      expect(callUrl).toContain(`prefix=feature_films%2F`)
      expect(callUrl).toContain(`userProject=${sampleProject}`)
      expect(callUrl).toContain(`maxResults=100`)
    })

    it('filters out self-referencing directory marker objects matching prefix', async () => {
      const mockListResponse = {
        kind: 'storage#objects',
        items: [
          {
            kind: 'storage#object',
            id: 'dir-marker',
            name: 'sound_stems/',
            bucket: sampleBucket,
            generation: '1',
            size: '0',
            storageClass: 'STANDARD',
            contentType: 'application/x-directory',
            crc32c: 'AAAAAA==',
            etag: 'etag-0',
            updated: '2026-08-01T00:00:00Z',
          },
          {
            kind: 'storage#object',
            id: 'file-01',
            name: 'sound_stems/audio.wav',
            bucket: sampleBucket,
            generation: '2',
            size: '5000000',
            storageClass: 'ARCHIVE',
            contentType: 'audio/wav',
            crc32c: '1pQ2wQ==',
            etag: 'etag-2',
            updated: '2026-08-01T00:00:00Z',
          },
        ],
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockListResponse,
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: 'sound_stems/',
        userProject: sampleProject,
      })

      expect(result.files).toHaveLength(1)
      expect(result.files[0].name).toBe('sound_stems/audio.wav')
    })

    it('attaches pageToken when querying next page', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          kind: 'storage#objects',
          items: [],
          nextPageToken: 'next-token-xyz',
        }),
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: '',
        userProject: sampleProject,
        pageToken: 'prev-token-123',
      })

      expect(result.nextPageToken).toBe('next-token-xyz')
      const callUrl = (globalThis.fetch as any).mock.calls[0][0]
      expect(callUrl).toContain('pageToken=prev-token-123')
    })
  })

  describe('run4PointPreflight Handshake', () => {
    it('executes successful 4-point preflight when all checks pass', async () => {
      globalThis.fetch = vi
        .fn()
        // Step 2: Bucket metadata check
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            kind: 'storage#bucket',
            id: sampleBucket,
            name: sampleBucket,
            billing: { requesterPays: true },
          }),
        } as any)
        // Step 3: IAM ObjectViewer check
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            kind: 'storage#objects',
            items: [],
          }),
        } as any)

      const result = await gcsClientService.run4PointPreflight(
        sampleToken,
        sampleBucket,
        sampleProject,
        Date.now() + 3600 * 1000,
      )

      expect(result.oauthTokenValid).toBe(true)
      expect(result.bucketReachable).toBe(true)
      expect(result.requesterPaysActive).toBe(true)
      expect(result.iamViewerGranted).toBe(true)
      expect(result.corsConfigured).toBe(true)
      expect(result.steps).toHaveLength(4)
      expect(result.steps?.every((s) => s.status === 'passed')).toBe(true)
    })

    it('fails preflight if token is expired (remaining TTL <= 60s)', async () => {
      const result = await gcsClientService.run4PointPreflight(
        sampleToken,
        sampleBucket,
        sampleProject,
        Date.now() + 30 * 1000, // 30s remaining
      )

      expect(result.oauthTokenValid).toBe(false)
      expect(result.bucketReachable).toBe(false)
      expect(result.steps?.[0].status).toBe('failed')
      expect(result.rawError).toBe('TOKEN_EXPIRED')
    })

    it('returns warning when userProject is missing', async () => {
      const result = await gcsClientService.run4PointPreflight(
        sampleToken,
        sampleBucket,
        '',
      )

      expect(result.oauthTokenValid).toBe(true)
      expect(result.bucketReachable).toBe(true)
      expect(result.requesterPaysActive).toBe(true)
      expect(result.iamViewerGranted).toBe(false)
      expect(result.corsConfigured).toBe(false)
      expect(result.rawError).toContain('UserProjectMissing')
      expect(result.remediationStep).toBeDefined()
    })

    it('fails Step 2 when bucket is not found (404)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: { message: 'Not Found' } }),
      } as any)

      const result = await gcsClientService.run4PointPreflight(
        sampleToken,
        'non-existent-bucket',
        sampleProject,
      )

      expect(result.bucketReachable).toBe(false)
      expect(result.iamViewerGranted).toBe(false)
      expect(result.steps?.find((s) => s.id === 'bucket')?.status).toBe('failed')
    })

    it('fails Step 2 with remediation link when billing project access is denied (403)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          error: {
            message: 'User project access denied',
            errors: [{ reason: 'userProjectAccessDenied' }],
          },
        }),
      } as any)

      const result = await gcsClientService.run4PointPreflight(
        sampleToken,
        sampleBucket,
        sampleProject,
      )

      expect(result.bucketReachable).toBe(false)
      expect(result.remediationUrl).toContain('billing/linkedaccount')
    })

    it('fails Step 3 when IAM roles/storage.objectViewer permission is missing', async () => {
      globalThis.fetch = vi.fn().mockImplementation((input: any) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/o?')) {
          return Promise.resolve({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            json: async () => ({
              error: { message: 'Caller lacks storage.objects.list' },
            }),
          } as any)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: sampleBucket,
            billing: { requesterPays: true },
          }),
        } as any)
      })

      const result = await gcsClientService.run4PointPreflight(
        sampleToken,
        sampleBucket,
        sampleProject,
      )

      expect(result.bucketReachable).toBe(true)
      expect(result.iamViewerGranted).toBe(false)
      expect(result.steps?.find((s) => s.id === 'iam')?.status).toBe('failed')
    })

    it('fails Step 4 with CORS remediation when browser fetch is blocked by CORS', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      const result = await gcsClientService.run4PointPreflight(
        sampleToken,
        sampleBucket,
        sampleProject,
      )

      expect(result.bucketReachable).toBe(false)
      expect(result.corsConfigured).toBe(false)
      expect(result.steps?.find((s) => s.id === 'cors')?.status).toBe('failed')
      expect(result.remediationStep).toContain('cors.json')
    })
  })

  describe('Custom Error Class Hierarchy', () => {
    it('preserves prototype chain and instanceof checks for all custom errors', () => {
      const baseErr = new GCSClientError('UNKNOWN', 'base error')
      expect(baseErr instanceof Error).toBe(true)
      expect(baseErr instanceof GCSClientError).toBe(true)

      const missingProjectErr = new UserProjectMissingError('my-bucket')
      expect(missingProjectErr instanceof GCSClientError).toBe(true)
      expect(missingProjectErr instanceof UserProjectMissingError).toBe(true)
      expect(missingProjectErr.code).toBe('USER_PROJECT_MISSING')

      const accessDeniedErr = new UserProjectAccessDeniedError('my-bucket', 'my-proj')
      expect(accessDeniedErr instanceof GCSClientError).toBe(true)
      expect(accessDeniedErr instanceof UserProjectAccessDeniedError).toBe(true)
      expect(accessDeniedErr.remediationUrl).toContain('billing/linkedaccount')

      const notFoundErr = new BucketNotFoundError('my-bucket')
      expect(notFoundErr instanceof GCSClientError).toBe(true)
      expect(notFoundErr instanceof BucketNotFoundError).toBe(true)
      expect(notFoundErr.httpStatus).toBe(404)

      const iamErr = new IAMPermissionDeniedError('my-bucket', 'user@example.com')
      expect(iamErr instanceof GCSClientError).toBe(true)
      expect(iamErr instanceof IAMPermissionDeniedError).toBe(true)
      expect(iamErr.httpStatus).toBe(403)

      const corsErr = new CorsConfigurationError('my-bucket', 'CORS preflight failed')
      expect(corsErr instanceof GCSClientError).toBe(true)
      expect(corsErr instanceof CorsConfigurationError).toBe(true)
      expect(corsErr.remediationStep).toContain('cors.json')
    })
  })
})
