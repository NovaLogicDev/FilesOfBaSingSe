import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { gcsClientService } from '../../src/services/gcsClientService'
import {
  GCSClientError,
  UserProjectMissingError,
  UserProjectAccessDeniedError,
  BucketNotFoundError,
  IAMPermissionDeniedError,
  CorsConfigurationError,
} from '../../src/types/gcs'
import { resetAllStores } from '../helpers/testUtils'

describe('M3 Adversarial Empirical Verification - 4-Point Preflight Edge Cases & Zero-Backend Liability', () => {
  const token = 'ya29.adversarial_test_token_2026'
  const bucket = 'test-studio-vault-2026'
  const userProject = 'client-billing-prod-2026'
  let originalFetch: typeof globalThis.fetch
  let interceptedRequests: { url: string; init?: RequestInit }[] = []

  beforeEach(() => {
    resetAllStores()
    originalFetch = globalThis.fetch
    interceptedRequests = []
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const mockFetchResponse = (status: number, body: any, ok: boolean = status >= 200 && status < 300) => {
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      interceptedRequests.push({ url, init })
      return Promise.resolve({
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response)
    })
  }

  const mockFetchSequence = (responses: Array<{ status: number; body: any; ok?: boolean; urlMatch?: string | RegExp }>) => {
    let callIndex = 0
    globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      interceptedRequests.push({ url, init })

      let matchedRes: { status: number; body: any; ok?: boolean } | undefined
      // Check if any response specifies urlMatch
      const urlMatched = responses.find((r) => {
        if (!r.urlMatch) return false
        if (typeof r.urlMatch === 'string') return url.includes(r.urlMatch)
        return r.urlMatch.test(url)
      })

      if (urlMatched) {
        matchedRes = urlMatched
      } else {
        // Fallback: Smart endpoint routing for bucket vs objects
        if (url.includes('/o?') || url.includes('/o/')) {
          matchedRes = responses.find((r) => r.body?.kind === 'storage#objects')
        } else if (url.includes('/storage/v1/b/')) {
          matchedRes = responses.find((r) => r.body?.kind === 'storage#bucket')
        }
        if (!matchedRes) {
          matchedRes = responses[callIndex] || responses[responses.length - 1]
          callIndex++
        }
      }

      const ok = matchedRes.ok !== undefined ? matchedRes.ok : matchedRes.status >= 200 && matchedRes.status < 300
      return Promise.resolve({
        ok,
        status: matchedRes.status,
        statusText: ok ? 'OK' : 'Error',
        json: async () => matchedRes.body,
        text: async () => JSON.stringify(matchedRes.body),
      } as Response)
    })
  }

  describe('1. 4-Point Preflight Handshake: Edge Cases & Failure Modes', () => {
    describe('Token TTL Boundary Tests', () => {
      it('fails when token is already expired (TTL = 0s)', async () => {
        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject, Date.now())
        expect(result.oauthTokenValid).toBe(false)
        expect(result.oauthExpiresInSeconds).toBe(0)
        expect(result.rawError).toBe('TOKEN_EXPIRED')
        expect(result.steps?.[0].status).toBe('failed')
        expect(result.steps?.[1].status).toBe('pending')
        expect(result.steps?.[2].status).toBe('pending')
        expect(result.steps?.[3].status).toBe('pending')
        expect(interceptedRequests.length).toBe(0)
      })

      it('fails when token TTL is exactly 59s (<60s boundary)', async () => {
        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject, Date.now() + 59 * 1000)
        expect(result.oauthTokenValid).toBe(false)
        expect(result.oauthExpiresInSeconds).toBeLessThanOrEqual(59)
        expect(result.steps?.[0].status).toBe('failed')
        expect(interceptedRequests.length).toBe(0)
      })

      it('fails when token TTL is exactly 60s (not strictly >60s)', async () => {
        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject, Date.now() + 60 * 1000)
        expect(result.oauthTokenValid).toBe(false)
        expect(result.steps?.[0].status).toBe('failed')
        expect(interceptedRequests.length).toBe(0)
      })

      it('passes Step 1 when token TTL is 65s (>60s boundary)', async () => {
        mockFetchSequence([
          { status: 200, body: { kind: 'storage#bucket', id: bucket, billing: { requesterPays: true } } },
          { status: 200, body: { kind: 'storage#objects', items: [] } },
        ])

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject, Date.now() + 65 * 1000)
        expect(result.oauthTokenValid).toBe(true)
        expect(result.steps?.[0].status).toBe('passed')
        expect(result.steps?.[0].detail).toContain('Auto-Renewal')
      })

      it('fails immediately when token string is empty or whitespace', async () => {
        const resultEmpty = await gcsClientService.run4PointPreflight('', bucket, userProject)
        expect(resultEmpty.oauthTokenValid).toBe(false)
        expect(resultEmpty.rawError).toBe('TOKEN_EXPIRED')

        const resultWhitespace = await gcsClientService.run4PointPreflight('   ', bucket, userProject)
        expect(resultWhitespace.oauthTokenValid).toBe(false)
        expect(resultWhitespace.rawError).toBe('TOKEN_EXPIRED')
      })

      it('defaults to 3600s TTL when tokenExpiresAt is omitted', async () => {
        mockFetchSequence([
          { status: 200, body: { kind: 'storage#bucket', id: bucket, billing: { requesterPays: true } } },
          { status: 200, body: { kind: 'storage#objects', items: [] } },
        ])

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.oauthTokenValid).toBe(true)
        expect(result.oauthExpiresInSeconds).toBe(3600)
      })
    })

    describe('Requester-Pays & Billing Project Boundary Tests', () => {
      it('returns warning on Step 2 and aborts subsequent probes when userProject is empty string', async () => {
        const result = await gcsClientService.run4PointPreflight(token, bucket, '')
        expect(result.oauthTokenValid).toBe(true)
        expect(result.bucketReachable).toBe(true)
        expect(result.requesterPaysActive).toBe(true)
        expect(result.iamViewerGranted).toBe(false)
        expect(result.corsConfigured).toBe(false)
        expect(result.steps?.[1].status).toBe('warning')
        expect(result.steps?.[1].errorMessage).toContain('Requester Pays is enabled')
        expect(result.steps?.[2].status).toBe('failed')
        expect(result.steps?.[3].status).toBe('failed')
        expect(result.rawError).toBe('HTTP 400 UserProjectMissing')
        expect(interceptedRequests.length).toBe(0)
      })

      it('correctly handles bucket reachability and object probe', async () => {
        mockFetchSequence([
          { status: 200, body: { kind: 'storage#objects', items: [] } },
        ])

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.bucketReachable).toBe(true)
        expect(result.requesterPaysActive).toBe(true)
        expect(result.iamViewerGranted).toBe(true)
        expect(result.corsConfigured).toBe(true)
      })

      it('correctly handles bucket with requesterPays: true', async () => {
        mockFetchSequence([
          { status: 200, body: { kind: 'storage#objects', items: [] } },
        ])

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.bucketReachable).toBe(true)
        expect(result.requesterPaysActive).toBe(true)
        expect(result.iamViewerGranted).toBe(true)
        expect(result.corsConfigured).toBe(true)
        expect(result.steps?.every((s) => s.status === 'passed')).toBe(true)
      })

      it('handles HTTP 400 UserProjectMissing error from GCS API', async () => {
        mockFetchResponse(400, {
          error: {
            code: 400,
            message: 'Bucket is a requester pays bucket but no user project provided.',
          },
        })

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.bucketReachable).toBe(true)
        expect(result.requesterPaysActive).toBe(true)
        expect(result.steps?.[1].status).toBe('warning')
        expect(result.steps?.[1].errorMessage).toMatch(/requester pays/i)
        expect(result.remediationStep).toBeDefined()
      })

      it('handles HTTP 403 UserProjectAccessDenied error with billing console remediation URL', async () => {
        mockFetchResponse(403, {
          error: {
            code: 403,
            message: 'The project client-billing-prod-2026 does not have billing enabled.',
            errors: [{ reason: 'userProjectAccessDenied', message: 'User project billing disabled' }],
          },
        })

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.bucketReachable).toBe(false)
        expect(result.steps?.[1].status).toBe('failed')
        expect(result.steps?.[1].remediationUrl).toContain(`https://console.cloud.google.com/billing/linkedaccount?project=${userProject}`)
        expect(result.remediationUrl).toContain('billing/linkedaccount')
      })

      it('handles HTTP 403 serviceusage.googleapis.com billing error message strings', async () => {
        mockFetchResponse(403, {
          error: {
            code: 403,
            message: 'Access Not Configured. Service Usage API (serviceusage.googleapis.com) has not been used in project 12345.',
          },
        })

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.bucketReachable).toBe(false)
        expect(result.steps?.[1].status).toBe('failed')
        expect(result.remediationUrl).toContain('billing/linkedaccount')
      })
    })

    describe('Bucket Reachability & 404 Not Found Tests', () => {
      it('handles HTTP 404 Bucket Not Found gracefully', async () => {
        mockFetchResponse(404, {
          error: {
            code: 404,
            message: 'The specified bucket does not exist.',
          },
        })

        const result = await gcsClientService.run4PointPreflight(token, 'non-existent-bucket-999', userProject)
        expect(result.bucketReachable).toBe(false)
        expect(result.iamViewerGranted).toBe(false)
        expect(result.steps?.[1].status).toBe('failed')
        expect(result.steps?.[1].errorMessage).toContain('does not exist')
        expect(result.steps?.[2].status).toBe('failed')
      })
    })

    describe('IAM ObjectViewer Permission (Step 3) Tests', () => {
      it('fails Step 3 when IAM read permission is denied (HTTP 403 roles/storage.objectViewer missing)', async () => {
        mockFetchSequence([
          // Object list probe fails with standard 403
          {
            urlMatch: '/o?',
            status: 403,
            body: {
              error: {
                code: 403,
                message: 'Access denied: user lacks storage.objects.list on bucket.',
              },
            },
          },
          // Bucket metadata
          {
            urlMatch: /\/b\/[^/]+\?/,
            status: 200,
            body: { kind: 'storage#bucket', id: bucket, billing: { requesterPays: true } },
          },
        ])

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.bucketReachable).toBe(true)
        expect(result.iamViewerGranted).toBe(false)
        expect(result.steps?.[1].status).toBe('passed')
        expect(result.steps?.[2].status).toBe('failed')
        expect(result.steps?.[2].errorMessage).toContain('roles/storage.objectViewer')
        expect(result.steps?.[2].remediation).toContain('roles/storage.objectViewer')
        expect(result.steps?.[2].remediationUrl).toContain('storage/docs/access-control/iam-roles')
      })

      it('passes preflight when user has roles/storage.objectViewer even if storage.buckets.get is denied on bucket metadata', async () => {
        mockFetchSequence([
          // Object list probe succeeds (200 OK)
          {
            urlMatch: '/o?',
            status: 200,
            body: { kind: 'storage#objects', items: [] },
          },
          // Bucket metadata fails with 403 storage.buckets.get denied
          {
            urlMatch: /\/b\/[^/]+\?/,
            status: 403,
            body: {
              error: {
                code: 403,
                message: "user does not have storage.buckets.get access to the Google Cloud Storage bucket. Permission 'storage.buckets.get' denied on resource",
              },
            },
          },
        ])

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.oauthTokenValid).toBe(true)
        expect(result.bucketReachable).toBe(true)
        expect(result.requesterPaysActive).toBe(true)
        expect(result.iamViewerGranted).toBe(true)
        expect(result.corsConfigured).toBe(true)
        expect(result.steps?.every((s) => s.status === 'passed')).toBe(true)
      })
    })

    describe('CORS Preflight Headers & Browser Network Rejection (Step 4) Tests', () => {
      it('fails Step 4 with CORS remediation when browser fetch throws TypeError (Failed to fetch)', async () => {
        globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
          interceptedRequests.push({ url: typeof input === 'string' ? input : input.toString() })
          return Promise.reject(new TypeError('Failed to fetch'))
        })

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.bucketReachable).toBe(false)
        expect(result.corsConfigured).toBe(false)
        expect(result.steps?.[3].status).toBe('failed')
        expect(result.steps?.[3].remediation).toContain('cors.json')
        expect(result.steps?.[3].remediationUrl).toContain('storage/docs/using-cors')
      })

      it('fails Step 4 when NetworkError is thrown', async () => {
        globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
          interceptedRequests.push({ url: typeof input === 'string' ? input : input.toString() })
          return Promise.reject(new Error('NetworkError when attempting to fetch resource.'))
        })

        const result = await gcsClientService.run4PointPreflight(token, bucket, userProject)
        expect(result.corsConfigured).toBe(false)
        expect(result.steps?.[3].status).toBe('failed')
      })
    })
  })

  describe('2. Zero-Backend Host Liability Invariant: 100% ?userProject= Enforcement', () => {
    it('enforces ?userProject= on getBucketMetadata', async () => {
      mockFetchResponse(200, { kind: 'storage#bucket', id: bucket })

      await gcsClientService.getBucketMetadata(token, bucket, userProject)

      expect(interceptedRequests.length).toBe(1)
      const req = interceptedRequests[0]
      expect(req.url).toContain(`?userProject=${userProject}`)
      expect(req.url.startsWith('https://storage.googleapis.com/storage/v1/b/')).toBe(true)
      expect(req.init?.headers).toMatchObject({
        Authorization: `Bearer ${token}`,
      })
    })

    it('rejects getBucketMetadata before network call if userProject is missing or whitespace', async () => {
      globalThis.fetch = vi.fn()

      await expect(gcsClientService.getBucketMetadata(token, bucket, '')).rejects.toThrow(UserProjectMissingError)
      await expect(gcsClientService.getBucketMetadata(token, bucket, '   ')).rejects.toThrow(UserProjectMissingError)

      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('enforces ?userProject= on listObjects for root and subdirectories', async () => {
      mockFetchResponse(200, { kind: 'storage#objects', prefixes: ['sub/'], items: [] })

      await gcsClientService.listObjects(token, bucket, {
        prefix: 'feature_films/reel_04/',
        delimiter: '/',
        userProject,
        maxResults: 50,
      })

      expect(interceptedRequests.length).toBe(1)
      const req = interceptedRequests[0]
      const url = new URL(req.url)
      expect(url.searchParams.get('userProject')).toBe(userProject)
      expect(url.searchParams.get('delimiter')).toBe('/')
      expect(url.searchParams.get('prefix')).toBe('feature_films/reel_04/')
      expect(url.searchParams.get('maxResults')).toBe('50')
      expect(req.init?.headers).toMatchObject({
        Authorization: `Bearer ${token}`,
      })
    })

    it('rejects listObjects before network call if userProject is missing or whitespace', async () => {
      globalThis.fetch = vi.fn()

      await expect(
        gcsClientService.listObjects(token, bucket, { userProject: '', prefix: '' }),
      ).rejects.toThrow(UserProjectMissingError)
      await expect(
        gcsClientService.listObjects(token, bucket, { userProject: '  ', prefix: '' }),
      ).rejects.toThrow(UserProjectMissingError)

      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('enforces ?userProject= across ALL internal requests during 4-point preflight handshake', async () => {
      mockFetchSequence([
        { status: 200, body: { kind: 'storage#bucket', id: bucket, billing: { requesterPays: true } } },
        { status: 200, body: { kind: 'storage#objects', items: [] } },
      ])

      await gcsClientService.run4PointPreflight(token, bucket, userProject)

      expect(interceptedRequests.length).toBeGreaterThanOrEqual(1)
      for (const req of interceptedRequests) {
        const url = new URL(req.url)
        expect(url.searchParams.get('userProject')).toBe(userProject)
      }
    })

    it('properly URL-encodes special characters in userProject and bucket names', async () => {
      const specialBucket = 'my.bucket_with-special.chars'
      const specialProject = 'project:custom-scope-123'

      mockFetchResponse(200, { kind: 'storage#bucket', id: specialBucket })

      await gcsClientService.getBucketMetadata(token, specialBucket, specialProject)

      expect(interceptedRequests.length).toBe(1)
      const req = interceptedRequests[0]
      expect(req.url).toContain('project%3Acustom-scope-123')
    })
  })
})
