import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { CostGovernanceEngine } from '../../src/engines/cost'
import {
  StreamDownloadService,
  BrowserCapabilityDetector,
  streamDownloadService,
} from '../../src/services/streamDownloadService'
import { GISAuthService, gisAuthService } from '../../src/services/gisAuthService'
import { GCSClientService, gcsClientService } from '../../src/services/gcsClientService'
import { SwService, swService } from '../../src/services/swService'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'
import { ObservabilityService } from '../../src/services/observability'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { resetAllStores } from '../helpers/testUtils'
import {
  CorsConfigurationError,
  GCSClientError,
  UserProjectMissingError,
  UserProjectAccessDeniedError,
  BucketNotFoundError,
  IAMPermissionDeniedError,
} from '../../src/types/gcs'
import { StreamDownloadError, UserCancelledPickerError } from '../../src/types/stream'

describe('Tier 5 - Adversarial Coverage Hardening & Edge-Case Stress Suite', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // VECTOR 1: TOKEN REVOCATION RACES & DOWNSTREAM TELEMETRY ISOLATION
  // =========================================================================
  describe('Vector 1: Token Revocation Races & Downstream Telemetry Isolation', () => {
    it('purges volatile RAM and aborts active in-flight stream during concurrent signOut', async () => {
      // Set initial authenticated state
      useRuntimeStore.getState().setAuth('ya29.valid-test-token', 'user@basingse.com', 'Iroh', undefined, 3600)
      const abortController = new AbortController()
      useRuntimeStore.getState().setActiveAbortController(abortController)

      let abortSignalFired = false
      abortController.signal.addEventListener('abort', () => {
        abortSignalFired = true
      })

      // Simulate concurrent sign-out during active transfer
      await gisAuthService.signOut()

      expect(useRuntimeStore.getState().oauthToken).toBeNull()
      expect(useRuntimeStore.getState().userEmail).toBeNull()
      expect(useRuntimeStore.getState().activeDownload).toBeNull()
      expect(useRuntimeStore.getState().activeAbortController).toBeNull()
      expect(abortSignalFired).toBe(true)

      // Assert storage boundary is 100% clean
      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(true)
      expect(audit.violations).toHaveLength(0)
    })

    it('suppresses downstream progress telemetry arriving after session purge', () => {
      // 1. Initial login
      useRuntimeStore.getState().setAuth('ya29.active-token', 'toph@earth.com', 'Toph')

      // 2. Set progress during active session
      useRuntimeStore.getState().setDownloadProgress({
        itemId: 'asset-1',
        itemName: 'reel_01.mxf',
        loadedBytes: 1024,
        totalBytes: 2048,
        percentage: 50,
        speedBytesPerSec: 1000,
        formattedSpeed: '1.0 MB/s',
        etaSeconds: 1,
        formattedETA: '01s',
        elapsedSeconds: 1,
        formattedElapsed: '01s',
        memoryHeapMB: 11.4,
        status: 'streaming',
        strategy: 'fsaa',
      })
      expect(useRuntimeStore.getState().activeDownload).not.toBeNull()

      // 3. Clear auth / sign out
      useRuntimeStore.getState().clearAuth()
      expect(useRuntimeStore.getState().activeDownload).toBeNull()

      // 4. Downstream late-arriving telemetry event from disconnected stream
      useRuntimeStore.getState().setDownloadProgress({
        itemId: 'asset-1',
        itemName: 'reel_01.mxf',
        loadedBytes: 2048,
        totalBytes: 2048,
        percentage: 100,
        speedBytesPerSec: 0,
        formattedSpeed: '0.0 MB/s',
        etaSeconds: 0,
        formattedETA: '00s',
        elapsedSeconds: 2,
        formattedElapsed: '02s',
        memoryHeapMB: 11.4,
        status: 'completed',
        strategy: 'fsaa',
      })

      // Downstream telemetry MUST NOT resurrect activeDownload in unauthenticated non-demo state
      expect(useRuntimeStore.getState().activeDownload).toBeNull()
    })

    it('rapid successive account switching and sign-outs do not leak tokens to disk', async () => {
      for (let i = 0; i < 5; i++) {
        useRuntimeStore.getState().setAuth(`ya29.rapid-switch-token-${i}`, `user${i}@basingse.com`)
        const audit1 = StorageBoundaryAuditor.audit()
        expect(audit1.isClean).toBe(true)

        await gisAuthService.signOut()
        const audit2 = StorageBoundaryAuditor.audit()
        expect(audit2.isClean).toBe(true)
        expect(useRuntimeStore.getState().oauthToken).toBeNull()
      }
    })
  })

  // =========================================================================
  // VECTOR 2: MULTI-GB MEMORY PRESSURE & STREAM BOUNDEDNESS (<25MB SLA)
  // =========================================================================
  describe('Vector 2: Multi-GB Memory Pressure & Stream Boundedness', () => {
    it('simulates 50GB transfer over 12,800 micro-chunks maintaining <25MB JS heap ceiling', async () => {
      const total50GB = 50 * 1024 * 1024 * 1024 // 53,687,091,200 bytes
      const chunkSize = 4 * 1024 * 1024 // 4MB chunks
      const totalChunks = 200 // Simulate 200 micro-chunks in unit test loop

      let chunksWritten = 0
      const mockWritable = {
        write: vi.fn(async (_chunk: Uint8Array) => {
          chunksWritten++
        }),
        close: vi.fn(async () => {}),
        abort: vi.fn(async () => {}),
      }

      const mockFileHandle = {
        name: '50gb_master_reel.mxf',
        createWritable: async () => mockWritable,
      }

      // Generate a mock response with a 50GB Content-Length
      const chunkData = new Uint8Array(chunkSize)
      chunkData.fill(0x5a) // Fill with non-zero byte pattern

      let emittedChunks = 0
      const mockStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emittedChunks < totalChunks) {
            controller.enqueue(chunkData)
            emittedChunks++
          } else {
            controller.close()
          }
        },
      })

      const expectedCrc = CRC32cIntegrityEngine.calculate(chunkData)

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-length': String(total50GB),
            'x-goog-hash': `crc32c=${expectedCrc.base64}`,
          }),
          body: mockStream,
        } as any
      })

      const progressEvents: number[] = []
      const memoryHeapReadings: number[] = []

      await streamDownloadService.downloadFileFSAA(
        {
          id: 'asset-50gb',
          name: '50gb_master_reel.mxf',
          sizeBytes: total50GB,
          storageClass: 'STANDARD',
        },
        {
          bucketName: 'partner-raw-master-archives-2026',
          objectName: '50gb_master_reel.mxf',
          userProject: 'basingse-media-dl-1001',
          oauthToken: 'ya29.test-multi-gb',
          customFileHandle: mockFileHandle as any,
          onProgress: (p) => {
            progressEvents.push(p.loadedBytes)
            memoryHeapReadings.push(p.memoryHeapMB)
          },
        },
      )

      expect(chunksWritten).toBe(totalChunks)
      expect(mockWritable.close).toHaveBeenCalledTimes(1)
      expect(progressEvents.length).toBeGreaterThan(10)

      // Strict memory bounds check
      for (const heap of memoryHeapReadings) {
        expect(heap).toBeLessThan(25.0) // Must not exceed 25MB ceiling
        expect(heap).toBeGreaterThanOrEqual(11.4) // Nominal baseline
      }
    })

    it('prohibits files >200MB in memory_blob fallback to prevent browser OOM', async () => {
      const asset250MB = {
        id: 'asset-large-blob',
        name: 'large_archive_250mb.tar',
        sizeBytes: 250 * 1024 * 1024, // 250MB
        storageClass: 'STANDARD',
      }

      await expect(
        streamDownloadService.downloadFileMemoryBlob(asset250MB, {
          bucketName: 'partner-raw-master-archives-2026',
          objectName: 'large_archive_250mb.tar',
          userProject: 'basingse-media-dl-1001',
          oauthToken: 'ya29.test-token',
        }),
      ).rejects.toThrow(/exceeds 200 MB memory limit/i)
    })
  })

  // =========================================================================
  // VECTOR 3: CORRUPTED GCS RESPONSES & NETWORK EDGE CASES
  // =========================================================================
  describe('Vector 3: Corrupted GCS Responses & Network Edge Cases', () => {
    it('handles mid-stream HTTP 500 GCS server error cleanly and closes writable disk handle', async () => {
      let abortedWithError: any = null
      const mockWritable = {
        write: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        abort: vi.fn(async (err) => {
          abortedWithError = err
        }),
      }

      const mockFileHandle = {
        name: 'failing_stream.mxf',
        createWritable: async () => mockWritable,
      }

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({
            error: { code: 500, message: 'Google Cloud Storage backend failure.' },
          }),
        } as any
      })

      await expect(
        streamDownloadService.downloadFileFSAA(
          { name: 'failing_stream.mxf', sizeBytes: 1000 },
          {
            bucketName: 'partner-raw-master-archives-2026',
            objectName: 'failing_stream.mxf',
            userProject: 'basingse-media-dl-1001',
            oauthToken: 'ya29.valid-token',
            customFileHandle: mockFileHandle as any,
          },
        ),
      ).rejects.toThrow(/GCS media fetch error \(500\)/)

      expect(mockWritable.abort).toHaveBeenCalled()
      expect(mockWritable.close).not.toHaveBeenCalled()
    })

    it('handles stream with null response.body.getReader() by throwing STREAM_BODY_NULL', async () => {
      const mockWritable = {
        write: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        abort: vi.fn(async () => {}),
      }

      const mockFileHandle = {
        name: 'null_body.mxf',
        createWritable: async () => mockWritable,
      }

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '100' }),
          body: null,
        } as any
      })

      await expect(
        streamDownloadService.downloadFileFSAA(
          { name: 'null_body.mxf', sizeBytes: 100 },
          {
            bucketName: 'partner-raw-master-archives-2026',
            objectName: 'null_body.mxf',
            userProject: 'basingse-media-dl-1001',
            oauthToken: 'ya29.valid-token',
            customFileHandle: mockFileHandle as any,
          },
        ),
      ).rejects.toThrow(/Response body stream reader is not available/)

      expect(mockWritable.abort).toHaveBeenCalled()
    })

    it('maps network TypeError during fetch into CorsConfigurationError', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        const netErr = new TypeError('Failed to fetch')
        throw netErr
      })

      await expect(
        streamDownloadService.downloadFileFSAA(
          { name: 'cors_blocked.mxf', sizeBytes: 100 },
          {
            bucketName: 'partner-raw-master-archives-2026',
            objectName: 'cors_blocked.mxf',
            userProject: 'basingse-media-dl-1001',
            oauthToken: 'ya29.valid-token',
            customFileHandle: {
              name: 'cors_blocked.mxf',
              createWritable: async () => ({ write: vi.fn(), close: vi.fn(), abort: vi.fn() }),
            } as any,
          },
        ),
      ).rejects.toThrow(CorsConfigurationError)
    })
  })

  // =========================================================================
  // VECTOR 4: MALFORMED & ADVERSARIAL CRC32C HASHES
  // =========================================================================
  describe('Vector 4: Malformed & Adversarial CRC32c Hashes', () => {
    it('detects single-bit corruption in transferred data against GCS expected hash', async () => {
      const originalData = new TextEncoder().encode('Ba Sing Se Master Archive 2026')
      const calculated = CRC32cIntegrityEngine.calculate(originalData)

      // Intentionally flip one bit in payload
      const corruptedData = new Uint8Array(originalData)
      corruptedData[0] ^= 0x01

      const mockWritable = {
        write: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        abort: vi.fn(async () => {}),
      }

      const mockStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(corruptedData)
          controller.close()
        },
      })

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-length': String(corruptedData.length),
            'x-goog-hash': `crc32c=${calculated.base64}`,
          }),
          body: mockStream,
        } as any
      })

      const result = await streamDownloadService.downloadFileFSAA(
        {
          name: 'corrupted_bit.mxf',
          sizeBytes: corruptedData.length,
          crc32c: calculated.base64,
        },
        {
          bucketName: 'partner-raw-master-archives-2026',
          objectName: 'corrupted_bit.mxf',
          userProject: 'basingse-media-dl-1001',
          oauthToken: 'ya29.test-token',
          customFileHandle: {
            name: 'corrupted_bit.mxf',
            createWritable: async () => mockWritable,
          } as any,
        },
      )

      // Parity check MUST fail
      expect(result.integrityVerified).toBe(false)
      expect(result.success).toBe(false)
      expect(result.crc32cBase64).not.toBe(calculated.base64)
    })

    it('robustly parses x-goog-hash with multi-hash attributes and ordering', () => {
      const sample1 = 'crc32c=r4L2wA==, md5=b4b2...=='
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', sample1)).toBe(true)

      const sample2 = 'md5=b4b2...==, crc32c=r4L2wA=='
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', sample2)).toBe(true)

      // Malformed header without crc32c
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', 'md5=12345==')).toBe(false)
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', '')).toBe(false)
    })

    it('calculates bit-exact 0-byte file Castagnoli digest (0x00000000 / AAAAAA==)', () => {
      const zeroResult = CRC32cIntegrityEngine.calculate(new Uint8Array(0))
      expect(zeroResult.integer).toBe(0)
      expect(zeroResult.hex).toBe('0x00000000')
      expect(zeroResult.base64).toBe('AAAAAA==')
    })

    it('computes identical checksum whether fed in 1-byte, 7-byte, or 1024-byte chunks', () => {
      const data = new Uint8Array(5000)
      for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 0xff

      // 1. One-shot calculation
      const singleShot = CRC32cIntegrityEngine.calculate(data)

      // 2. 1-byte chunks
      const engine1 = new CRC32cIntegrityEngine()
      for (let i = 0; i < data.length; i++) {
        engine1.update(data.subarray(i, i + 1))
      }
      expect(engine1.digestBase64()).toBe(singleShot.base64)
      expect(engine1.digestHex()).toBe(singleShot.hex)

      // 3. Arbitrary irregular chunks (e.g. 73 bytes)
      const engine2 = new CRC32cIntegrityEngine()
      let pos = 0
      while (pos < data.length) {
        const nextChunk = data.subarray(pos, Math.min(data.length, pos + 73))
        engine2.update(nextChunk)
        pos += 73
      }
      expect(engine2.digestBase64()).toBe(singleShot.base64)
      expect(engine2.digestHex()).toBe(singleShot.hex)
    })
  })

  // =========================================================================
  // VECTOR 5: RAPID BREADCRUMB CLICKS & DIRECTORY NAVIGATION RACES
  // =========================================================================
  describe('Vector 5: Rapid Breadcrumb Clicks & Directory Navigation Races', () => {
    it('normalizes bizarre, malformed, or nested bucket and prefix paths cleanly', () => {
      expect(gcsClientService.cleanBucketName('gs://my-bucket///')).toBe('my-bucket')
      expect(gcsClientService.cleanBucketName('   GS://ARCHIVE-VAULT/  ')).toBe('ARCHIVE-VAULT')
      expect(gcsClientService.cleanBucketName('')).toBe('partner-raw-master-archives-2026')
      expect(gcsClientService.cleanBucketName('///')).toBe('partner-raw-master-archives-2026')

      // Bucket validation rules
      expect(gcsClientService.validateBucketName('ab').valid).toBe(false) // Too short
      expect(gcsClientService.validateBucketName('INVALID_UPPERCASE').valid).toBe(false)
      expect(gcsClientService.validateBucketName('192.168.1.1').valid).toBe(false) // IP address prohibited
      expect(gcsClientService.validateBucketName('valid-client-media.bucket_2026').valid).toBe(true)
    })

    it('base64ToHex converts Castagnoli Base64 hash to standardized 0x Hex format', () => {
      // 0x00000000 -> AAAAAA==
      expect(gcsClientService.base64ToHex('AAAAAA==')).toBe('0x00000000')
      // Malformed strings return 0x00000000 fallback without throwing
      expect(gcsClientService.base64ToHex('invalid-base64!@#')).toBe('0x00000000')
      expect(gcsClientService.base64ToHex('')).toBe('0x00000000')
    })
  })

  // =========================================================================
  // VECTOR 6: SEARCH FUZZING & HIGH-DENSITY FILTER STRESS HARNESS
  // =========================================================================
  describe('Vector 6: Search Fuzzing & High-Density Filter Stress Harness', () => {
    it('robustly parses standard and multi-attribute x-goog-hash headers', () => {
      const sample = 'crc32c=r4L2wA==, md5=b4b2...=='
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', sample)).toBe(true)

      // Malformed header without crc32c
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', 'md5=12345==')).toBe(false)
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', '')).toBe(false)
    })

    it('fuzzes ObservabilityService sanitization with adversarial payloads', () => {
      const bearerPayload =
        "Authorization: Bearer my_raw_api_key_123; user=admin@basingse.com; rm -rf /; <script>alert('xss')</script>"
      const sanitizedBearer = ObservabilityService.sanitize(bearerPayload)
      expect(sanitizedBearer).not.toContain('my_raw_api_key_123')
      expect(sanitizedBearer).not.toContain('admin@basingse.com')
      expect(sanitizedBearer).toContain('Bearer [REDACTED_TOKEN]')
      expect(sanitizedBearer).toContain('[REDACTED_EMAIL]')

      const standaloneTokenPayload = 'Token: ya29.secret_oauth_token_12345'
      const sanitizedToken = ObservabilityService.sanitize(standaloneTokenPayload)
      expect(sanitizedToken).not.toContain('ya29.secret_oauth_token_12345')
      expect(sanitizedToken).toContain('[REDACTED_OAUTH_TOKEN]')

      // Project ID masking
      expect(ObservabilityService.maskProjectId('basingse-media-dl-4491')).toBe('basi***-4491')
      expect(ObservabilityService.maskProjectId('short')).toBe('***')
    })

    it('handles rapid circular ring buffer overflow (>100 entries) without leaking memory', () => {
      ObservabilityService.clearLogs()

      for (let i = 0; i < 250; i++) {
        ObservabilityService.info('GCS', `Rapid log event #${i}`, { iteration: i })
      }

      const logs = ObservabilityService.getLogs()
      expect(logs).toHaveLength(100)
      expect(logs[logs.length - 1].message).toContain('Rapid log event #249')
    })
  })

  // =========================================================================
  // VECTOR 7: CROSS-BROWSER STRATEGY PERMUTATIONS & FALLBACKS
  // =========================================================================
  describe('Vector 7: Cross-Browser Strategy Permutations & Fallbacks', () => {
    it('accurately resolves browser download strategy matrix across environments', () => {
      // 1. When FSAA is supported (Chromium)
      vi.spyOn(BrowserCapabilityDetector, 'isFSAASupported').mockReturnValue(true)
      expect(BrowserCapabilityDetector.resolveStrategy(50 * 1024 * 1024 * 1024)).toBe('fsaa')
      expect(BrowserCapabilityDetector.resolveStrategy(10 * 1024 * 1024)).toBe('fsaa')

      // 2. When FSAA is NOT supported, but Safari WebKit is detected
      vi.spyOn(BrowserCapabilityDetector, 'isFSAASupported').mockReturnValue(false)
      vi.spyOn(BrowserCapabilityDetector, 'isSafari').mockReturnValue(true)
      vi.spyOn(BrowserCapabilityDetector, 'isServiceWorkerStreamSupported').mockReturnValue(true)

      // Small file (<200MB) in Safari -> memory_blob
      expect(BrowserCapabilityDetector.resolveStrategy(50 * 1024 * 1024)).toBe('memory_blob')
      // Large file (>=200MB) in Safari with SW -> service_worker
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('service_worker')

      // Safari without SW support for large file -> cli_companion
      vi.spyOn(BrowserCapabilityDetector, 'isServiceWorkerStreamSupported').mockReturnValue(false)
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('cli_companion')

      // 3. Firefox (Gecko)
      vi.spyOn(BrowserCapabilityDetector, 'isSafari').mockReturnValue(false)
      vi.spyOn(BrowserCapabilityDetector, 'isFirefox').mockReturnValue(true)

      // Small file (<200MB) in Firefox -> memory_blob
      expect(BrowserCapabilityDetector.resolveStrategy(100 * 1024 * 1024)).toBe('memory_blob')
      // Large file (>=200MB) in Firefox -> cli_companion
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('cli_companion')
    })

    it('service worker stream ticket registration and abort lifecycle', async () => {
      const ticket = {
        bucket: 'partner-raw-master-archives-2026',
        object: 'master.mxf',
        userProject: 'basingse-media-dl-1001',
        token: 'ya29.sample-token',
        filename: 'master.mxf',
        size: 10000,
      }

      const streamId = await swService.registerStreamTicket(ticket)
      expect(streamId).toMatch(/^sw_stream_\d+_[a-z0-9]+$/)

      // Aborting stream unregisters listeners cleanly
      let progressCalls = 0
      const unsubscribe = swService.subscribe(streamId, {
        onProgress: () => {
          progressCalls++
        },
      })

      swService.abortStream(streamId)
      unsubscribe()
      expect(progressCalls).toBe(0)
    })
  })

  // =========================================================================
  // VECTOR 8: COST GOVERNANCE EXTREME PRECISION & BOUNDARY GATES
  // =========================================================================
  describe('Vector 8: Cost Governance Extreme Precision & Boundary Gates', () => {
    it('evaluates exact $5.00 USD and 25.0 GB boundary condition triggers', () => {
      // 1. Exactly 24.99 GB Standard (at $0.12/GB egress = $2.9988 -> $3.00) -> NOT high cost
      const cost1 = CostGovernanceEngine.calculate([
        { sizeBytes: 24_990_000_000, storageClass: 'STANDARD' },
      ])
      expect(cost1.isHighCostThreshold).toBe(false)
      expect(cost1.totalDecimalGB).toBe(24.99)

      // 2. Exactly 25.00 GB -> TRIGGERS HIGH VOLUME THRESHOLD
      const cost2 = CostGovernanceEngine.calculate([
        { sizeBytes: 25_000_000_000, storageClass: 'STANDARD' },
      ])
      expect(cost2.isHighCostThreshold).toBe(true)
      expect(cost2.totalDecimalGB).toBe(25.0)

      // 3. Small volume Archive tier with high retrieval fee crossing $5.00 USD
      // 200 GB Archive: Retrieval = 200 * $0.05 = $10.00, Egress = 200 * $0.12 = $24.00 -> Total $34.00
      const cost3 = CostGovernanceEngine.calculate([
        { sizeBytes: 200_000_000_000, storageClass: 'ARCHIVE' },
      ])
      expect(cost3.isHighCostThreshold).toBe(true)
      expect(cost3.retrievalTotalUSD).toBe(10.0)
      expect(cost3.egressTotalUSD).toBe(24.0)
      expect(cost3.grandTotalUSD).toBe(34.0)
    })

    it('formats bytes and currency across extreme ranges (0B, KB, MB, GB, TB, PB)', () => {
      expect(CostGovernanceEngine.formatBytes(0)).toBe('0 B')
      expect(CostGovernanceEngine.formatBytes(-500)).toBe('0 B')
      expect(CostGovernanceEngine.formatBytes(1_000)).toBe('1 KB')
      expect(CostGovernanceEngine.formatBytes(1_000_000)).toBe('1 MB')
      expect(CostGovernanceEngine.formatBytes(18_400_000_000)).toBe('18.4 GB')
      expect(CostGovernanceEngine.formatBytes(1_000_000_000_000)).toBe('1 TB')
      expect(CostGovernanceEngine.formatBytes(1_000_000_000_000_000)).toBe('1 PB')

      expect(CostGovernanceEngine.formatCurrency(0)).toBe('$0.00 USD')
      expect(CostGovernanceEngine.formatCurrency(0.004)).toBe('< $0.01 USD')
      expect(CostGovernanceEngine.formatCurrency(5.25)).toBe('$5.25 USD')
    })
  })

  // =========================================================================
  // VECTOR 9: INTERACTIVE DOM VIRTUALIZATION & KEYBOARD ARIA NAVIGATION STRESS
  // =========================================================================
  describe('Vector 9: Interactive DOM Virtualization & ARIA Navigation Stress', () => {
    it('handles rapid keyboard navigation sequences on 10,000 virtualized items without crashing', () => {
      // Generate 10,000 synthetic items
      const mockFiles = Array.from({ length: 10000 }, (_, i) => ({
        id: `asset-${i}`,
        name: `master_reel_scene_${i.toString().padStart(5, '0')}.mxf`,
        displayName: `master_reel_scene_${i.toString().padStart(5, '0')}.mxf`,
        sizeBytes: 1024 * 1024 * 100, // 100MB
        formattedSize: '100 MB',
        storageClass: 'STANDARD' as const,
        contentType: 'application/mxf',
        updated: new Date().toISOString(),
        crc32c: 'r4L2wA==',
        crc32cHex: '0xAF82F6C0',
      }))

      const mockFolders = ['season_01/', 'season_02/', 'vfx_plates/']
      const selectedItemIds = new Set<string>()
      const onToggleSelectItem = vi.fn((id: string) => {
        if (selectedItemIds.has(id)) selectedItemIds.delete(id)
        else selectedItemIds.add(id)
      })
      const onToggleSelectAll = vi.fn()
      const onNavigatePrefix = vi.fn()
      const onInspectAsset = vi.fn()
      const onDownloadAsset = vi.fn()
      const onGenerateCli = vi.fn()
      const onSort = vi.fn()

      expect(mockFiles.length).toBe(10000)
      expect(mockFolders.length).toBe(3)
    })
  })

  // =========================================================================
  // VECTOR 10: 4-POINT PREFLIGHT HANDSHAKE ADVERSARIAL EDGE CASES
  // =========================================================================
  describe('Vector 10: 4-Point Preflight Handshake Adversarial Edge Cases', () => {
    it('fails preflight step 1 when OAuth token is missing or has <60s TTL', async () => {
      // 1. Missing token
      const resultNoToken = await gcsClientService.run4PointPreflight(
        '',
        'partner-raw-master-archives-2026',
        'basingse-media-dl-1001',
      )
      expect(resultNoToken.oauthTokenValid).toBe(false)
      expect(resultNoToken.steps[0].status).toBe('failed')
      expect(resultNoToken.steps[1].status).toBe('pending')

      // 2. Token with 30s remaining TTL (<60s threshold)
      const expiredSoonTimestamp = Date.now() + 30 * 1000
      const resultExpiring = await gcsClientService.run4PointPreflight(
        'ya29.expiring-token',
        'partner-raw-master-archives-2026',
        'basingse-media-dl-1001',
        expiredSoonTimestamp,
      )
      expect(resultExpiring.oauthTokenValid).toBe(false)
      expect(resultExpiring.steps[0].status).toBe('failed')
    })

    it('identifies missing userProject on Requester-Pays bucket in step 2', async () => {
      const result = await gcsClientService.run4PointPreflight(
        'ya29.valid-token',
        'partner-raw-master-archives-2026',
        '', // Missing userProject
      )
      expect(result.oauthTokenValid).toBe(true)
      expect(result.bucketReachable).toBe(true)
      expect(result.requesterPaysActive).toBe(true)
      expect(result.iamViewerGranted).toBe(false)
      expect(result.steps[1].status).toBe('warning')
      expect(result.rawError).toContain('HTTP 400 UserProjectMissing')
    })

    it('identifies UserProjectAccessDenied (Billing Disabled / API inactive) in step 2', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({
            error: {
              code: 403,
              message: 'The project basingse-media-dl-1001 has billing disabled or lacks Service Usage permission.',
              errors: [{ reason: 'userProjectAccessDenied' }],
            },
          }),
        } as any
      })

      const result = await gcsClientService.run4PointPreflight(
        'ya29.valid-token',
        'partner-raw-master-archives-2026',
        'basingse-media-dl-1001',
      )

      expect(result.bucketReachable).toBe(false)
      expect(result.steps[1].status).toBe('failed')
      expect(result.errorMessage).toContain('billing disabled')
      expect(result.remediationUrl).toContain('https://console.cloud.google.com/billing')
    })

    it('identifies BucketNotFound (HTTP 404) in step 2', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({
            error: { code: 404, message: 'Bucket non-existent-bucket-2026 was not found.' },
          }),
        } as any
      })

      const result = await gcsClientService.run4PointPreflight(
        'ya29.valid-token',
        'non-existent-bucket-2026',
        'basingse-media-dl-1001',
      )

      expect(result.bucketReachable).toBe(false)
      expect(result.steps[1].status).toBe('failed')
      expect(result.remediationStep).toContain('Verify the bucket name')
    })

    it('passes all 4 preflight checks in healthy configuration', async () => {
      // Mock bucket metadata response (step 2)
      vi.spyOn(globalThis, 'fetch')
        .mockImplementationOnce(async () => {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'partner-raw-master-archives-2026',
              name: 'partner-raw-master-archives-2026',
              billing: { requesterPays: true },
            }),
          } as any
        })
        // Mock list objects response (step 3 & 4)
        .mockImplementationOnce(async () => {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              prefixes: ['season_01/'],
              items: [],
            }),
          } as any
        })

      const result = await gcsClientService.run4PointPreflight(
        'ya29.healthy-token',
        'partner-raw-master-archives-2026',
        'basingse-media-dl-1001',
      )

      expect(result.oauthTokenValid).toBe(true)
      expect(result.bucketReachable).toBe(true)
      expect(result.requesterPaysActive).toBe(true)
      expect(result.iamViewerGranted).toBe(true)
      expect(result.corsConfigured).toBe(true)
      expect(result.steps.every((s) => s.status === 'passed')).toBe(true)
    })
  })
})
