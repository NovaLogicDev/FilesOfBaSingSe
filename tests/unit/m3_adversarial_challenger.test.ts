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

describe('M3 Challenger - Empirical Adversarial Stress & Fuzz Suite for GCS Client & 4-Point Preflight Handshake', () => {
  const sampleToken = 'ya29.sample_adversarial_m3_test_token'
  const sampleBucket = 'partner-raw-master-archives-2026'
  const sampleProject = 'demo-client-media-2026'
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetAllStores()
    originalFetch = globalThis.fetch
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ==========================================================================
  // Section 1: Bucket Name Sanitization & RFC 1123 Validation Fuzzing
  // ==========================================================================
  describe('Section 1: Bucket Name Sanitization & RFC 1123 Validation Fuzzing', () => {
    describe('cleanBucketName Pathological Edge Cases', () => {
      it('strips leading gs:// case-insensitively with mixed cases and multiple slashes', () => {
        expect(gcsClientService.cleanBucketName('gs://my-bucket')).toBe('my-bucket')
        expect(gcsClientService.cleanBucketName('GS://MY-BUCKET')).toBe('MY-BUCKET')
        expect(gcsClientService.cleanBucketName('Gs://mixed-bucket')).toBe('mixed-bucket')
        expect(gcsClientService.cleanBucketName('gS://another-bucket')).toBe('another-bucket')
        expect(gcsClientService.cleanBucketName('gs://///my-deep-bucket////')).toBe('my-deep-bucket')
        expect(gcsClientService.cleanBucketName('   \t\n  gs://padded-bucket/  \r\n ')).toBe('padded-bucket')
      })

      it('returns fallback safely for empty, null, undefined, or malformed inputs', () => {
        const defaultFallback = 'partner-raw-master-archives-2026'
        expect(gcsClientService.cleanBucketName('')).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName('    ')).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName('gs://')).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName('gs://///')).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName('///')).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName(null as any)).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName(undefined as any)).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName(12345 as any)).toBe(defaultFallback)
        expect(gcsClientService.cleanBucketName({} as any)).toBe(defaultFallback)
      })

      it('honors custom fallback when given invalid input', () => {
        expect(gcsClientService.cleanBucketName('', 'custom-archive-bucket')).toBe('custom-archive-bucket')
        expect(gcsClientService.cleanBucketName('   ', 'fallback-99')).toBe('fallback-99')
      })
    })

    describe('validateBucketName RFC 1123 & GCS Naming Boundary Matrix', () => {
      it('validates boundary lengths [0, 1, 2, 3, 62, 63, 64, 100, 1000]', () => {
        // Empty
        expect(gcsClientService.validateBucketName('').valid).toBe(false)
        expect(gcsClientService.validateBucketName('   ').valid).toBe(false)

        // Lengths 1 and 2 (Too short)
        expect(gcsClientService.validateBucketName('a').valid).toBe(false)
        expect(gcsClientService.validateBucketName('ab').valid).toBe(false)
        expect(gcsClientService.validateBucketName('ab').error).toMatch(/between 3 and 63 characters/i)

        // Min valid length: 3
        expect(gcsClientService.validateBucketName('abc').valid).toBe(true)
        expect(gcsClientService.validateBucketName('123').valid).toBe(true)
        expect(gcsClientService.validateBucketName('a-1').valid).toBe(true)

        // Valid lengths: 62 and 63
        const len62 = 'a' + 'b'.repeat(60) + 'c'
        const len63 = 'a' + 'b'.repeat(61) + 'c'
        expect(gcsClientService.validateBucketName(len62).valid).toBe(true)
        expect(gcsClientService.validateBucketName(len63).valid).toBe(true)

        // Invalid length: 64 and beyond (Too long)
        const len64 = 'a' + 'b'.repeat(62) + 'c'
        const result64 = gcsClientService.validateBucketName(len64)
        expect(result64.valid).toBe(false)
        expect(result64.error).toMatch(/between 3 and 63 characters/i)

        expect(gcsClientService.validateBucketName('a'.repeat(100)).valid).toBe(false)
        expect(gcsClientService.validateBucketName('a'.repeat(1000)).valid).toBe(false)
      })

      it('rejects all uppercase letters with specific descriptive error', () => {
        const uppercaseSamples = [
          'My-Bucket',
          'BUCKET',
          'bucketA',
          'aBucket',
          'basingSe-media',
        ]
        for (const bucket of uppercaseSamples) {
          const res = gcsClientService.validateBucketName(bucket)
          expect(res.valid).toBe(false)
          expect(res.error).toMatch(/lowercase/i)
        }
      })

      it('rejects illegal starting and ending characters (dots, hyphens, underscores, symbols)', () => {
        const invalidStartOrEnd = [
          '-my-bucket',
          'my-bucket-',
          '.my-bucket',
          'my-bucket.',
          '_my-bucket',
          'my-bucket_',
          '-abc-',
          '.abc.',
          '_abc_',
        ]
        for (const bucket of invalidStartOrEnd) {
          const res = gcsClientService.validateBucketName(bucket)
          expect(res.valid).toBe(false)
          expect(res.error).toMatch(/must start and end with a number or lowercase letter/i)
        }
      })

      it('rejects consecutive dots', () => {
        const consecutiveDotsSamples = [
          'my..bucket',
          'bucket..name..test',
          'a..b',
          'data...store',
        ]
        for (const bucket of consecutiveDotsSamples) {
          const res = gcsClientService.validateBucketName(bucket)
          expect(res.valid).toBe(false)
          expect(res.error).toMatch(/consecutive dots/i)
        }
      })

      it('rejects IP address formatted bucket names according to RFC 1123', () => {
        const ipSamples = [
          '192.168.1.1',
          '0.0.0.0',
          '255.255.255.255',
          '10.0.0.1',
          '127.0.0.1',
          '8.8.8.8',
        ]
        for (const ip of ipSamples) {
          const res = gcsClientService.validateBucketName(ip)
          expect(res.valid).toBe(false)
          expect(res.error).toMatch(/IP address/i)
        }

        // Non-IP addresses with dots should be valid
        expect(gcsClientService.validateBucketName('192.168.1.1.2').valid).toBe(true)
        expect(gcsClientService.validateBucketName('my-192.168.1.1').valid).toBe(true)
        expect(gcsClientService.validateBucketName('192.168.1.com').valid).toBe(true)
        expect(gcsClientService.validateBucketName('media.basingse.org').valid).toBe(true)
      })

      it('rejects special characters, spaces, unicode, emojis, control characters', () => {
        const forbiddenChars = [
          'bucket with space',
          'bucket\tname',
          'bucket\nname',
          'bucket\x00null',
          'bucket@media',
          'bucket#123',
          'bucket$cost',
          'bucket%percent',
          'bucket^power',
          'bucket&and',
          'bucket*star',
          'bucket(brace)',
          'bucket+plus',
          'bucket=equals',
          'bucket/slash',
          'bucket\\escape',
          'bucket:colon',
          'bucket;semi',
          'bucket"quote',
          'bucket\'apos',
          'bucket<tag>',
          'bucket?query',
          'bucket`back',
          'bucket~tilde',
          'bucket|pipe',
          'bucket{curly}',
          'bucket[brack]',
          'básíngsé-media',
          '🪣-bucket',
          '🎬-films',
        ]
        for (const bucket of forbiddenChars) {
          const res = gcsClientService.validateBucketName(bucket)
          expect(res.valid).toBe(false)
        }
      })

      it('fuzzes validateBucketName with 500 randomized mutated strings', () => {
        const fuzzAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789-_./\\@#$%^&*()+= \t\n\x00\u00FF'
        for (let i = 0; i < 500; i++) {
          const len = Math.floor(Math.random() * 70)
          let candidate = ''
          for (let j = 0; j < len; j++) {
            candidate += fuzzAlphabet[Math.floor(Math.random() * fuzzAlphabet.length)]
          }

          const res = gcsClientService.validateBucketName(candidate)
          const clean = gcsClientService.cleanBucketName(candidate, '')

          // Independent Oracle validation logic
          const expectedValid =
            clean.length >= 3 &&
            clean.length <= 63 &&
            !/[A-Z]/.test(clean) &&
            /^[a-z0-9]/.test(clean) &&
            /[a-z0-9]$/.test(clean) &&
            /^[a-z0-9._-]+$/.test(clean) &&
            !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean) &&
            !clean.includes('..')

          expect(res.valid).toBe(expectedValid)
        }
      })

      it('safely handles non-string and pathological types without throwing', () => {
        const pathologicalInputs: any[] = [
          null,
          undefined,
          123456,
          0,
          -1,
          NaN,
          Infinity,
          true,
          false,
          {},
          { bucket: 'my-bucket' },
          [],
          ['my-bucket'],
          () => 'my-bucket',
          Symbol('bucket'),
          BigInt(12345),
        ]
        for (const input of pathologicalInputs) {
          const res = gcsClientService.validateBucketName(input)
          expect(res.valid).toBe(false)
          expect(res.error).toMatch(/cannot be empty/i)
        }
      })
    })
  })

  // ==========================================================================
  // Section 2: Big-Endian CRC32c Base64-to-Hex Checksum Conversion
  // ==========================================================================
  describe('Section 2: Big-Endian CRC32c Base64-to-Hex Checksum Conversion', () => {
    it('accurately converts all standard and edge-case CRC32c test vectors', () => {
      const testVectors = [
        // All zeros: 0x00, 0x00, 0x00, 0x00
        { base64: 'AAAAAA==', expectedHex: '0x00000000' },
        // All ones: 0xFF, 0xFF, 0xFF, 0xFF
        { base64: '/////w==', expectedHex: '0xFFFFFFFF' },
        // Sample 1 from requirements: [0xAF, 0x82, 0xF6, 0xC0]
        { base64: 'r4L2wA==', expectedHex: '0xAF82F6C0' },
        // Sample 2: [0xBF, 0xD3, 0x37, 0xC4]
        { base64: 'v9M3xA==', expectedHex: '0xBFD337C4' },
        // Sample 3: [0xE3, 0x06, 0x92, 0x83]
        { base64: '4waSgw==', expectedHex: '0xE3069283' },
        // Sample 4: [0xD6, 0x94, 0x36, 0xC1]
        { base64: '1pQ2wQ==', expectedHex: '0xD69436C1' },
        // Sample 5: [0xCB, 0xBB, 0x6A, 0x7B]
        { base64: 'y7tqew==', expectedHex: '0xCBBB6A7B' },
        // Sample 6 (high bit set): [0x80, 0x00, 0x00, 0x04]
        { base64: 'gAAABA==', expectedHex: '0x80000004' },
        // Sample 7: [0x01, 0x02, 0x03, 0x04]
        { base64: 'AQIDBA==', expectedHex: '0x01020304' },
        // Sample 8: [0xF9, 0xF9, 0xFB, 0xFC]
        { base64: '+fn7/A==', expectedHex: '0xF9F9FBFC' },
        // Sample 9: [0x10, 0x01, 0x01, 0x01]
        { base64: 'EAEBAQ==', expectedHex: '0x10010101' },
        // Sample 10 (leading zero bytes): [0x00, 0x00, 0x01, 0x00]
        { base64: 'AAABAA==', expectedHex: '0x00000100' },
        // Sample 11 (trailing zero bytes): [0x00, 0x00, 0x00, 0x01]
        { base64: 'AAAAAQ==', expectedHex: '0x00000001' },
      ]

      for (const { base64, expectedHex } of testVectors) {
        const hex = gcsClientService.base64ToHex(base64)
        expect(hex).toBe(expectedHex)
      }
    })

    it('fuzzes base64ToHex with 2,000 random 32-bit big-endian integers', () => {
      for (let i = 0; i < 2000; i++) {
        // Generate random 4-byte buffer (32-bit unsigned int)
        const b0 = Math.floor(Math.random() * 256)
        const b1 = Math.floor(Math.random() * 256)
        const b2 = Math.floor(Math.random() * 256)
        const b3 = Math.floor(Math.random() * 256)

        const buf = Buffer.from([b0, b1, b2, b3])
        const base64 = buf.toString('base64')

        const expectedHex =
          '0x' +
          [b0, b1, b2, b3]
            .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
            .join('')

        const calculatedHex = gcsClientService.base64ToHex(base64)
        expect(calculatedHex).toBe(expectedHex)
        expect(calculatedHex).toMatch(/^0x[0-9A-F]{8}$/)
      }
    })

    it('handles malformed, empty, or non-string inputs gracefully without throwing', () => {
      const nonStringInputs = [
        '',
        '   ',
        null as any,
        undefined as any,
        123456 as any,
        {} as any,
        [] as any,
      ]

      for (const input of nonStringInputs) {
        const hex = gcsClientService.base64ToHex(input)
        expect(hex).toBe('0x00000000')
      }
    })

    it('normalizes whitespace in base64 strings', () => {
      expect(gcsClientService.base64ToHex('  r4L2wA==\n')).toBe('0xAF82F6C0')
      expect(gcsClientService.base64ToHex('\t4waSgw==  ')).toBe('0xE3069283')
    })
  })

  // ==========================================================================
  // Section 3: Prefix & Delimiter Virtual Slicing with Pathological Characters
  // ==========================================================================
  describe('Section 3: Prefix & Delimiter Virtual Slicing with Pathological Characters', () => {
    it('handles deeply nested virtual directories (50 levels deep)', async () => {
      const levels = Array.from({ length: 50 }, (_, i) => `level_${i.toString().padStart(2, '0')}`)
      const deepPrefix = levels.join('/') + '/'
      const deepSubfolder = deepPrefix + 'level_50/'
      const deepFileName = deepPrefix + 'master_audio_track.flac'

      const mockResponse = {
        kind: 'storage#objects',
        prefixes: [deepSubfolder],
        items: [
          {
            kind: 'storage#object',
            id: `${sampleBucket}/${deepFileName}`,
            name: deepFileName,
            bucket: sampleBucket,
            generation: '1001',
            size: '52428800',
            storageClass: 'STANDARD',
            contentType: 'audio/flac',
            crc32c: 'r4L2wA==',
            etag: 'etag-deep',
            updated: '2026-08-20T12:00:00Z',
          },
        ],
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: deepPrefix,
        delimiter: '/',
        userProject: sampleProject,
      })

      expect(result.currentPrefix).toBe(deepPrefix)
      expect(result.folders).toEqual([deepSubfolder])
      expect(result.files).toHaveLength(1)
      expect(result.files[0].name).toBe(deepFileName)
      expect(result.files[0].displayName).toBe('master_audio_track.flac')
      expect(result.files[0].sizeBytes).toBe(52_428_800)
    })

    it('correctly handles spaces, unicode, CJK, accents, and emojis in prefixes and filenames', async () => {
      const complexPrefix = '🎬_master_vault/第1季 2026/café_rêve/'
      const subfolder = `${complexPrefix}日本語_subtitles/`
      const cjkFile = `${complexPrefix}épisode_01_4K_HDR_🌟.mkv`

      const mockResponse = {
        kind: 'storage#objects',
        prefixes: [subfolder],
        items: [
          {
            kind: 'storage#object',
            id: 'cjk-item-1',
            name: cjkFile,
            bucket: sampleBucket,
            generation: '2001',
            size: '8589934592',
            storageClass: 'ARCHIVE',
            contentType: 'video/x-matroska',
            crc32c: 'v9M3xA==',
            etag: 'etag-cjk',
            updated: '2026-08-21T08:00:00Z',
          },
        ],
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: complexPrefix,
        delimiter: '/',
        userProject: sampleProject,
      })

      expect(result.currentPrefix).toBe(complexPrefix)
      expect(result.folders).toEqual([subfolder])
      expect(result.files).toHaveLength(1)
      expect(result.files[0].displayName).toBe('épisode_01_4K_HDR_🌟.mkv')
      expect(result.files[0].crc32cHex).toBe('0xBFD337C4')

      const callUrl = (globalThis.fetch as any).mock.calls[0][0]
      const parsedUrl = new URL(callUrl)
      expect(parsedUrl.searchParams.get('delimiter')).toBe('/')
      expect(parsedUrl.searchParams.get('prefix')).toBe(complexPrefix)
      expect(parsedUrl.searchParams.get('userProject')).toBe(sampleProject)
    })

    it('sanitizes leading slashes on prefixes while preserving directory structure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          kind: 'storage#objects',
          prefixes: ['feature_films/reel_01/'],
          items: [],
        }),
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: '///feature_films/',
        userProject: sampleProject,
      })

      expect(result.currentPrefix).toBe('feature_films/')
      const callUrl = (globalThis.fetch as any).mock.calls[0][0]
      const parsedUrl = new URL(callUrl)
      expect(parsedUrl.searchParams.get('prefix')).toBe('feature_films/')
    })

    it('filters out both directory marker types: exact prefix name and prefix/ with 0 size', async () => {
      const prefix = 'vfx_plates/scene_88'
      const mockResponse = {
        kind: 'storage#objects',
        items: [
          // Marker 1: exact prefix string
          {
            kind: 'storage#object',
            name: 'vfx_plates/scene_88',
            bucket: sampleBucket,
            size: '0',
            storageClass: 'STANDARD',
            crc32c: 'AAAAAA==',
            etag: 'e1',
            updated: '2026-08-01T00:00:00Z',
          },
          // Marker 2: prefix + '/' with size 0
          {
            kind: 'storage#object',
            name: 'vfx_plates/scene_88/',
            bucket: sampleBucket,
            size: '0',
            storageClass: 'STANDARD',
            crc32c: 'AAAAAA==',
            etag: 'e2',
            updated: '2026-08-01T00:00:00Z',
          },
          // Real leaf object
          {
            kind: 'storage#object',
            name: 'vfx_plates/scene_88/plate_01.exr',
            bucket: sampleBucket,
            size: '104857600',
            storageClass: 'STANDARD',
            contentType: 'image/x-exr',
            crc32c: '4waSgw==',
            etag: 'e3',
            updated: '2026-08-01T00:00:00Z',
          },
        ],
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix,
        userProject: sampleProject,
      })

      expect(result.files).toHaveLength(1)
      expect(result.files[0].name).toBe('vfx_plates/scene_88/plate_01.exr')
    })
  })

  // ==========================================================================
  // Section 4: 10,000 Items Pagination Chaining via nextPageToken
  // ==========================================================================
  describe('Section 4: 10,000 Items Pagination Chaining via nextPageToken', () => {
    it('seamlessly chains 40 consecutive pages totaling 10,000 items without corruption', async () => {
      const TOTAL_ITEMS = 10_000
      const PAGE_SIZE = 250
      const TOTAL_PAGES = TOTAL_ITEMS / PAGE_SIZE // 40 pages

      let requestCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestCount++
        const urlObj = new URL(url)
        const pageToken = urlObj.searchParams.get('pageToken')

        // Determine current page index (0-based)
        let pageIndex = 0
        if (pageToken) {
          pageIndex = parseInt(pageToken.replace('token_page_', ''), 10)
        }

        const startIndex = pageIndex * PAGE_SIZE
        const items: GCSObject[] = []

        for (let i = 0; i < PAGE_SIZE; i++) {
          const itemIdx = startIndex + i
          items.push({
            kind: 'storage#object',
            id: `item-${itemIdx}`,
            name: `archives/high_volume_batch/asset_${itemIdx.toString().padStart(6, '0')}.mov`,
            bucket: sampleBucket,
            generation: String(100000 + itemIdx),
            size: String(1024 * 1024 * ((itemIdx % 50) + 1)),
            storageClass: 'STANDARD',
            contentType: 'video/quicktime',
            crc32c: 'r4L2wA==',
            etag: `etag-${itemIdx}`,
            updated: '2026-08-20T00:00:00Z',
          })
        }

        const isLastPage = pageIndex === TOTAL_PAGES - 1
        const nextPageToken = isLastPage ? undefined : `token_page_${pageIndex + 1}`

        return {
          ok: true,
          status: 200,
          json: async () => ({
            kind: 'storage#objects',
            items,
            nextPageToken,
          }),
        }
      })

      // Simulate client paginating through all 40 pages
      const allAccumulatedFiles = []
      let currentPageToken: string | undefined = undefined
      let pagesFetched = 0

      const startTime = performance.now()

      do {
        const pageResult = await gcsClientService.listObjects(sampleToken, sampleBucket, {
          prefix: 'archives/high_volume_batch/',
          delimiter: '/',
          userProject: sampleProject,
          maxResults: PAGE_SIZE,
          pageToken: currentPageToken,
        })

        allAccumulatedFiles.push(...pageResult.files)
        currentPageToken = pageResult.nextPageToken
        pagesFetched++
      } while (currentPageToken)

      const durationMs = performance.now() - startTime

      expect(pagesFetched).toBe(40)
      expect(requestCount).toBe(40)
      expect(allAccumulatedFiles).toHaveLength(10_000)
      expect(durationMs).toBeLessThan(1500) // Fast execution (<1.5s)

      // Verify data integrity across boundaries (start, middle, end)
      expect(allAccumulatedFiles[0].name).toBe('archives/high_volume_batch/asset_000000.mov')
      expect(allAccumulatedFiles[4999].name).toBe('archives/high_volume_batch/asset_004999.mov')
      expect(allAccumulatedFiles[9999].name).toBe('archives/high_volume_batch/asset_009999.mov')

      // Verify uniqueness (zero duplicate items)
      const uniqueNames = new Set(allAccumulatedFiles.map((f) => f.name))
      expect(uniqueNames.size).toBe(10_000)
    })

    it('correctly handles complex nextPageTokens containing Base64 padding and special characters', async () => {
      const complexToken = 'CigKGnBhcnRuZXItcmF3LW1hc3Rlci1hcmNoaXZlcxIBMA==&x=1+2/3'

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        const urlObj = new URL(url)
        expect(urlObj.searchParams.get('pageToken')).toBe(complexToken)

        return {
          ok: true,
          status: 200,
          json: async () => ({
            kind: 'storage#objects',
            items: [],
            nextPageToken: undefined,
          }),
        }
      })

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: '',
        userProject: sampleProject,
        pageToken: complexToken,
      })

      expect(result.nextPageToken).toBeUndefined()
    })

    it('correctly terminates pagination when API returns empty nextPageToken or empty items', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          kind: 'storage#objects',
          items: [],
          nextPageToken: undefined,
        }),
      } as any)

      const result = await gcsClientService.listObjects(sampleToken, sampleBucket, {
        prefix: 'empty_folder/',
        userProject: sampleProject,
      })

      expect(result.files).toHaveLength(0)
      expect(result.folders).toHaveLength(0)
      expect(result.nextPageToken).toBeUndefined()
    })
  })

  // ==========================================================================
  // Section 5: 4-Point Preflight Handshake Stress, Error Injections & Concurrency
  // ==========================================================================
  describe('Section 5: 4-Point Preflight Handshake Stress, Error Injections & Concurrency', () => {
    describe('Token TTL Exact Boundary Checks', () => {
      it('passes Step 1 when remaining TTL is exactly 61 seconds', async () => {
        globalThis.fetch = vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ kind: 'storage#bucket', id: sampleBucket, billing: { requesterPays: true } }),
          } as any)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ kind: 'storage#objects', items: [] }),
          } as any)

        const result = await gcsClientService.run4PointPreflight(
          sampleToken,
          sampleBucket,
          sampleProject,
          Date.now() + 61 * 1000,
        )

        expect(result.oauthTokenValid).toBe(true)
        expect(result.steps?.[0].status).toBe('passed')
      })

      it('fails Step 1 when remaining TTL is exactly 60 seconds (boundary edge)', async () => {
        const result = await gcsClientService.run4PointPreflight(
          sampleToken,
          sampleBucket,
          sampleProject,
          Date.now() + 60 * 1000,
        )

        expect(result.oauthTokenValid).toBe(false)
        expect(result.steps?.[0].status).toBe('failed')
        expect(result.steps?.[1].status).toBe('pending')
      })

      it('fails Step 1 when remaining TTL is 59 seconds or negative (already expired)', async () => {
        const result = await gcsClientService.run4PointPreflight(
          sampleToken,
          sampleBucket,
          sampleProject,
          Date.now() - 5000,
        )

        expect(result.oauthTokenValid).toBe(false)
        expect(result.steps?.[0].status).toBe('failed')
      })
    })

    describe('Server Fault & Error Injections across Steps 2-4', () => {
      it('handles HTTP 500 Internal Server Error during Step 2 gracefully', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: { message: 'Backend storage cluster timeout' } }),
        } as any)

        const result = await gcsClientService.run4PointPreflight(
          sampleToken,
          sampleBucket,
          sampleProject,
        )

        expect(result.oauthTokenValid).toBe(true)
        expect(result.bucketReachable).toBe(false)
        expect(result.steps?.[1].status).toBe('failed')
        expect(result.steps?.[1].errorMessage).toContain('Backend storage cluster timeout')
      })

      it('handles HTTP 503 Service Unavailable during Step 3 (IAM probe)', async () => {
        globalThis.fetch = vi.fn().mockImplementation((input: any) => {
          const url = typeof input === 'string' ? input : input.toString()
          if (url.includes('/o?')) {
            return Promise.resolve({
              ok: false,
              status: 503,
              statusText: 'Service Unavailable',
              json: async () => ({ error: { message: 'IAM service temporarily unavailable' } }),
            } as any)
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ kind: 'storage#bucket', id: sampleBucket, billing: { requesterPays: true } }),
          } as any)
        })

        const result = await gcsClientService.run4PointPreflight(
          sampleToken,
          sampleBucket,
          sampleProject,
        )

        expect(result.iamViewerGranted).toBe(false)
        expect(result.steps?.[2].status).toBe('failed')
      })

      it('correctly provides CORS configuration snippet and URL when browser throws TypeError', async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch: CORS preflight channel blocked'))

        const result = await gcsClientService.run4PointPreflight(
          sampleToken,
          sampleBucket,
          sampleProject,
        )

        expect(result.bucketReachable).toBe(false)
        expect(result.corsConfigured).toBe(false)
        expect(result.steps?.[3].status).toBe('failed')
        expect(result.steps?.[3].remediation).toContain('cors.json')
        expect(result.steps?.[3].remediationUrl).toContain('cloud.google.com/storage/docs/using-cors')
      })
    })

    describe('Concurrency & Race Condition Isolation', () => {
      it('executes 50 simultaneous preflight requests without cross-contamination', async () => {
        let callCount = 0
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
          callCount++
          if (url.includes('/b/failed-bucket-')) {
            return {
              ok: false,
              status: 404,
              statusText: 'Not Found',
              json: async () => ({ error: { message: 'Bucket not found' } }),
            }
          }
          if (url.includes('/b/success-bucket-')) {
            if (url.includes('/o?')) {
              return {
                ok: true,
                status: 200,
                json: async () => ({ kind: 'storage#objects', items: [] }),
              }
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                kind: 'storage#bucket',
                id: 'success-bucket',
                billing: { requesterPays: true },
              }),
            }
          }
          return { ok: false, status: 400 }
        })

        const promises = Array.from({ length: 50 }, (_, i) => {
          const isSuccess = i % 2 === 0
          const bucket = isSuccess ? `success-bucket-${i}` : `failed-bucket-${i}`
          return gcsClientService
            .run4PointPreflight(sampleToken, bucket, sampleProject)
            .then((res) => ({ res, isSuccess, i }))
        })

        const results = await Promise.all(promises)
        expect(results).toHaveLength(50)

        for (const { res, isSuccess } of results) {
          if (isSuccess) {
            expect(res.bucketReachable).toBe(true)
            expect(res.iamViewerGranted).toBe(true)
            expect(res.corsConfigured).toBe(true)
            expect(res.steps?.every((s) => s.status === 'passed')).toBe(true)
          } else {
            expect(res.bucketReachable).toBe(false)
            expect(res.iamViewerGranted).toBe(false)
            expect(res.steps?.find((s) => s.id === 'bucket')?.status).toBe('failed')
          }
        }
      })
    })
  })
})
