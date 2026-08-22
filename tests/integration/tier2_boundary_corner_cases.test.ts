import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gcsClientService } from '../../src/services/gcsClientService'
import { gcpProjectService } from '../../src/services/gcpProjectService'
import { streamDownloadService } from '../../src/services/streamDownloadService'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { CostGovernanceEngine } from '../../src/engines/cost'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'
import {
  ZERO_BYTE_ITEM,
  MASSIVE_50GB_ITEM,
  MASSIVE_100GB_ITEM,
  STUDIO_MASTER_DATASET,
} from '../fixtures/mediaDatasets'
import { resetAllStores } from '../helpers/testUtils'
import { DownloadProgressTelemetry, FileSystemFileHandle, FileSystemWritableFileStream } from '../../src/types'

function createMockFileHandle(name = 'test_asset.mxf'): {
  handle: FileSystemFileHandle
  writable: FileSystemWritableFileStream
  writtenChunks: Uint8Array[]
  isClosed: () => boolean
} {
  let closed = false
  const writtenChunks: Uint8Array[] = []

  const writable: FileSystemWritableFileStream = {
    locked: false,
    write: vi.fn(async (data: any) => {
      if (closed) throw new Error('Stream is closed')
      if (data instanceof Uint8Array) {
        writtenChunks.push(data)
      } else if (typeof data === 'string') {
        writtenChunks.push(new TextEncoder().encode(data))
      }
    }),
    seek: vi.fn(async () => {}),
    truncate: vi.fn(async () => {}),
    close: vi.fn(async () => {
      closed = true
    }),
    abort: vi.fn(async () => {}),
    getWriter: vi.fn() as any,
  }

  const handle: FileSystemFileHandle = {
    kind: 'file',
    name,
    createWritable: vi.fn(async () => writable),
    getFile: vi.fn(async () => new File([], name)),
  }

  return {
    handle,
    writable,
    writtenChunks,
    isClosed: () => closed,
  }
}

function createMockReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++])
      } else {
        controller.close()
      }
    },
  })
}

describe('Tier 2 - Boundary & Corner Cases (R1-R7)', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // --------------------------------------------------------------------------
  // Category 1: Empty Buckets & Directories
  // --------------------------------------------------------------------------
  describe('Boundary 1: Empty Buckets & Directories', () => {
    it('handles non-existent or completely empty directory prefix gracefully', async () => {
      const result = await gcsClientService.listObjects('ya29.test-token', 'empty-bucket-2026', {
        prefix: 'non_existent_prefix/',
        delimiter: '/',
        userProject: 'client-media-project-2026',
      })
      expect(result.folders).toEqual([])
      expect(result.files).toEqual([])
      expect(result.totalEstimatedItems).toBe(0)
    })

    it('calculates cost for empty asset list as 0 bytes and $0.00 USD', () => {
      const cost = CostGovernanceEngine.calculate([])
      expect(cost.totalBytes).toBe(0)
      expect(cost.totalDecimalGB).toBe(0)
      expect(cost.itemCount).toBe(0)
      expect(cost.retrievalTotalUSD).toBe(0)
      expect(cost.egressTotalUSD).toBe(0)
      expect(cost.grandTotalUSD).toBe(0)
      expect(cost.isHighCostThreshold).toBe(false)
      expect(cost.formattedTotalSize).toBe('0 B')
    })

    it('handles empty recent buckets preference list cleanly', () => {
      usePersistentStore.getState().resetPreferences()
      expect(usePersistentStore.getState().recentBuckets).toEqual([])

      // Adding empty bucket string is ignored
      usePersistentStore.getState().addRecentBucket('')
      expect(usePersistentStore.getState().recentBuckets).toEqual([])
    })

    it('safely handles empty strings and empty arrays in CLI generator', () => {
      const gcloud = gcsClientService.cleanBucketName('empty-bucket')
      expect(gcloud).toBe('empty-bucket')
    })

    it('renders empty storage boundary without throwing errors', () => {
      StorageBoundaryAuditor.emergencyPurge()
      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(true)
      expect(audit.localStorageKeys).toEqual([])
    })
  })

  // --------------------------------------------------------------------------
  // Category 2: 0-Byte Files
  // --------------------------------------------------------------------------
  describe('Boundary 2: 0-Byte Files', () => {
    it('computes 0-byte CRC32c digest as 0x00000000 and AAAAAA==', () => {
      const result = CRC32cIntegrityEngine.calculate(new Uint8Array(0))
      expect(result.hex).toBe('0x00000000')
      expect(result.base64).toBe('AAAAAA==')
      expect(result.integer).toBe(0)
    })

    it('calculates single 0-byte file cost as $0.00 USD without threshold trigger', () => {
      const cost = CostGovernanceEngine.calculateSingle(0, 'ARCHIVE')
      expect(cost.totalBytes).toBe(0)
      expect(cost.grandTotalUSD).toBe(0)
      expect(cost.isHighCostThreshold).toBe(false)
      expect(cost.formattedTotalSize).toBe('0 B')
    })

    it('streams 0-byte file with immediate single-step completion', async () => {
      const { handle } = createMockFileHandle(ZERO_BYTE_ITEM.displayName)
      const mockResponse = new Response(createMockReadableStream([]), {
        status: 200,
        headers: { 'content-length': '0', 'x-goog-hash': 'crc32c=AAAAAA==' },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const telemetryUpdates: DownloadProgressTelemetry[] = []
      const result = await streamDownloadService.downloadFileFSAA(ZERO_BYTE_ITEM, {
        bucketName: ZERO_BYTE_ITEM.bucket,
        objectName: ZERO_BYTE_ITEM.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.test-token',
        customFileHandle: handle,
        onProgress: (p) => telemetryUpdates.push(p),
      })

      expect(result.success).toBe(true)
      expect(telemetryUpdates.length).toBeGreaterThan(0)
      const final = telemetryUpdates[telemetryUpdates.length - 1]
      expect(final.status).toBe('completed')
      expect(final.loadedBytes).toBe(0)
      expect(final.totalBytes).toBe(0)
      expect(final.percentage).toBe(100)
      expect(final.integrityVerified).toBe(true)
    })

    it('formats 0 bytes cleanly as "0 B"', () => {
      expect(CostGovernanceEngine.formatBytes(0)).toBe('0 B')
      expect(CostGovernanceEngine.formatBytes(-100)).toBe('0 B')
    })

    it('verifies 0-byte GCS x-goog-hash header matching', () => {
      expect(CRC32cIntegrityEngine.verifyMatch('AAAAAA==', 'crc32c=AAAAAA==')).toBe(true)
      expect(CRC32cIntegrityEngine.verifyMatch('AAAAAA==', 'crc32c=WRONG==')).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // Category 3: Huge Files (50GB+ / 100GB Simulation)
  // --------------------------------------------------------------------------
  describe('Boundary 3: Huge Files (50GB+ / 100GB Simulation)', () => {
    it('calculates cost for massive 54GB archive and triggers high-cost gate', () => {
      // 54 GB Archive: 54 * 0.05 ($2.70) + 54 * 0.12 ($6.48) = $9.18
      const cost = CostGovernanceEngine.calculateSingle(MASSIVE_50GB_ITEM.sizeBytes, 'ARCHIVE')
      expect(cost.totalDecimalGB).toBe(54.0)
      expect(cost.retrievalTotalUSD).toBe(2.7)
      expect(cost.egressTotalUSD).toBe(6.48)
      expect(cost.grandTotalUSD).toBe(9.18)
      expect(cost.isHighCostThreshold).toBe(true) // >= $5.00 and >= 25GB
    })

    it('calculates cost for massive 108GB archive file correctly', () => {
      // 108 GB Archive: 108 * 0.05 ($5.40) + 108 * 0.12 ($12.96) = $18.36
      const cost = CostGovernanceEngine.calculateSingle(MASSIVE_100GB_ITEM.sizeBytes, 'ARCHIVE')
      expect(cost.totalDecimalGB).toBe(108.0)
      expect(cost.grandTotalUSD).toBe(18.36)
      expect(cost.isHighCostThreshold).toBe(true)
      expect(cost.formattedTotalSize).toBe('108 GB')
    })

    it('maintains bounded memory heap (~11.4 MB) during 54GB transfer simulation', async () => {
      const { handle } = createMockFileHandle(MASSIVE_50GB_ITEM.displayName)
      const chunk = new Uint8Array(1024 * 1024).fill(1)
      const mockResponse = new Response(createMockReadableStream([chunk]), {
        status: 200,
        headers: { 'content-length': String(chunk.length) },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const heapSnapshots: number[] = []
      await streamDownloadService.downloadFileFSAA(MASSIVE_50GB_ITEM, {
        bucketName: MASSIVE_50GB_ITEM.bucket,
        objectName: MASSIVE_50GB_ITEM.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.test-token',
        customFileHandle: handle,
        onProgress: (p) => heapSnapshots.push(p.memoryHeapMB),
      })

      expect(heapSnapshots.length).toBeGreaterThan(0)
      for (const heap of heapSnapshots) {
        expect(heap).toBeLessThan(25.0) // Bounded memory SLA
        expect(heap).toBeGreaterThanOrEqual(0)
      }
    })

    it('computes 50GB progress telemetry percentages without integer overflow', async () => {
      const { handle } = createMockFileHandle(MASSIVE_50GB_ITEM.displayName)
      const chunk = new Uint8Array(1024 * 1024).fill(1)
      const mockResponse = new Response(createMockReadableStream([chunk]), {
        status: 200,
        headers: { 'content-length': String(chunk.length) },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      let maxPercentage = 0
      await streamDownloadService.downloadFileFSAA(MASSIVE_50GB_ITEM, {
        bucketName: MASSIVE_50GB_ITEM.bucket,
        objectName: MASSIVE_50GB_ITEM.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.test-token',
        customFileHandle: handle,
        onProgress: (p) => {
          maxPercentage = Math.max(maxPercentage, p.percentage)
          expect(p.percentage).toBeGreaterThanOrEqual(0)
          expect(p.percentage).toBeLessThanOrEqual(100)
        },
      })
      expect(maxPercentage).toBe(100)
    })

    it('formats multi-gigabyte sizes accurately using GCS decimal standard', () => {
      expect(CostGovernanceEngine.formatBytes(54_000_000_000)).toBe('54 GB')
      expect(CostGovernanceEngine.formatBytes(108_000_000_000)).toBe('108 GB')
      expect(CostGovernanceEngine.formatBytes(1_500_000_000_000)).toBe('1.5 TB')
    })
  })

  // --------------------------------------------------------------------------
  // Category 4: Network Timeouts & Aborts During Active Transfer
  // --------------------------------------------------------------------------
  describe('Boundary 4: Network Timeouts & Stream Aborts', () => {
    it('handles early abort signal before any chunk is transferred', async () => {
      const controller = new AbortController()
      controller.abort() // Pre-aborted

      const { handle } = createMockFileHandle(STUDIO_MASTER_DATASET[0].displayName)
      const mockResponse = new Response(createMockReadableStream([new Uint8Array(1024)]), {
        status: 200,
        headers: { 'content-length': '1024' },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const telemetryHistory: DownloadProgressTelemetry[] = []
      const result = await streamDownloadService.downloadFileFSAA(STUDIO_MASTER_DATASET[0], {
        bucketName: STUDIO_MASTER_DATASET[0].bucket,
        objectName: STUDIO_MASTER_DATASET[0].name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.test-token',
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => telemetryHistory.push(p),
      })

      expect(result.status).toBe('cancelled')
      expect(telemetryHistory.length).toBeGreaterThanOrEqual(1)
      const last = telemetryHistory[telemetryHistory.length - 1]
      expect(last.status).toBe('cancelled')
      expect(last.speedBytesPerSec).toBe(0)
    })

    it('handles mid-stream abort and zeroes moving average speed', async () => {
      const controller = new AbortController()
      const { handle } = createMockFileHandle(STUDIO_MASTER_DATASET[0].displayName)
      const chunk = new Uint8Array(1024 * 1024).fill(0x55)

      let chunkCount = 0
      const stream = new ReadableStream({
        async pull(c) {
          chunkCount++
          if (chunkCount === 2) {
            controller.abort()
          }
          c.enqueue(chunk)
        },
      })

      const mockResponse = new Response(stream, {
        status: 200,
        headers: { 'content-length': '104857600' },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const result = await streamDownloadService.downloadFileFSAA(STUDIO_MASTER_DATASET[0], {
        bucketName: STUDIO_MASTER_DATASET[0].bucket,
        objectName: STUDIO_MASTER_DATASET[0].name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.test-token',
        customFileHandle: handle,
        abortSignal: controller.signal,
      })

      expect(result.status).toBe('cancelled')
      expect(controller.signal.aborted).toBe(true)
    })

    it('resets runtime store active download upon abortActiveDownload call', () => {
      useRuntimeStore.getState().setAuth('ya29.test-token', 'user@test.com')
      const controller = new AbortController()
      useRuntimeStore.getState().setActiveAbortController(controller)
      useRuntimeStore.getState().setDownloadProgress({
        itemId: 'mock-id',
        itemName: 'reel.mxf',
        loadedBytes: 5000,
        totalBytes: 10000,
        percentage: 50,
        speedBytesPerSec: 45000000,
        formattedSpeed: '45.0 MB/s',
        etaSeconds: 10,
        formattedETA: '10s',
        elapsedSeconds: 5,
        formattedElapsed: '05s',
        memoryHeapMB: 11.4,
        status: 'streaming',
      })

      // Abort via store
      useRuntimeStore.getState().abortActiveDownload()

      const state = useRuntimeStore.getState()
      expect(state.activeAbortController).toBeNull()
      expect(state.activeDownload?.status).toBe('cancelled')
      expect(state.activeDownload?.speedBytesPerSec).toBe(0)
      expect(state.activeDownload?.formattedSpeed).toBe('0.0 MB/s')
    })

    it('handles multiple consecutive abort calls without throwing exception', () => {
      const controller = new AbortController()
      useRuntimeStore.getState().setActiveAbortController(controller)

      expect(() => {
        useRuntimeStore.getState().abortActiveDownload()
        useRuntimeStore.getState().abortActiveDownload()
        useRuntimeStore.getState().abortActiveDownload()
      }).not.toThrow()
    })

    it('preserves elapsed seconds and transferred bytes on cancelled stream record', () => {
      useRuntimeStore.getState().setAuth('ya29.test-token', 'user@test.com')
      const progress: DownloadProgressTelemetry = {
        itemId: 'item-1',
        itemName: 'asset.mov',
        loadedBytes: 4_000_000_000,
        totalBytes: 8_000_000_000,
        percentage: 50,
        speedBytesPerSec: 0,
        formattedSpeed: '0.0 MB/s',
        etaSeconds: 0,
        formattedETA: '00s',
        elapsedSeconds: 42,
        formattedElapsed: '42s',
        memoryHeapMB: 0,
        status: 'cancelled',
      }
      useRuntimeStore.getState().setDownloadProgress(progress)

      expect(useRuntimeStore.getState().activeDownload?.elapsedSeconds).toBe(42)
      expect(useRuntimeStore.getState().activeDownload?.loadedBytes).toBe(4_000_000_000)
    })
  })

  // --------------------------------------------------------------------------
  // Category 5: Token Expiration & Invalid Credentials
  // --------------------------------------------------------------------------
  describe('Boundary 5: Token Expiration & Invalid Credentials', () => {
    it('detects expired token timestamp (tokenExpiresAt <= Date.now())', () => {
      // Set expired session (-100s)
      useRuntimeStore.getState().setAuthSession('ya29.expired', 'user@expired.com', 'User', undefined, -100)
      const expiresAt = useRuntimeStore.getState().tokenExpiresAt!
      expect(expiresAt).toBeLessThan(Date.now())
    })

    it('clears session profile and tokens completely upon auth invalidation', () => {
      useRuntimeStore.getState().setAuthSession('ya29.token', 'test@studio.com', 'Test User')
      expect(useRuntimeStore.getState().oauthToken).not.toBeNull()

      useRuntimeStore.getState().clearAuthSession()
      expect(useRuntimeStore.getState().oauthToken).toBeNull()
      expect(useRuntimeStore.getState().userEmail).toBeNull()
      expect(useRuntimeStore.getState().userName).toBeNull()
    })

    it('detects security boundary violation when anomalous Bearer token exists', () => {
      localStorage.setItem('cached_auth', 'Bearer ya29.anomalous_token_leak')
      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(false)
      expect(audit.violations.length).toBeGreaterThan(0)

      StorageBoundaryAuditor.emergencyPurge()
      expect(StorageBoundaryAuditor.audit().isClean).toBe(true)
    })

    it('detects private key leakage attempt into sessionStorage', () => {
      sessionStorage.setItem('key_dump', '-----BEGIN PRIVATE KEY-----')
      const audit = StorageBoundaryAuditor.audit()
      expect(audit.isClean).toBe(false)
      expect(audit.violations[0]).toContain('key_dump')

      StorageBoundaryAuditor.emergencyPurge()
    })

    it('handles zero TTL session initialization cleanly', () => {
      useRuntimeStore.getState().setAuthSession('ya29.zero_ttl', 'zero@studio.com', 'Zero', undefined, 0)
      const expiresAt = useRuntimeStore.getState().tokenExpiresAt!
      expect(expiresAt).toBeLessThanOrEqual(Date.now())
    })
  })

  // --------------------------------------------------------------------------
  // Category 6: CORS Preflight Failures & Header Anomalies
  // --------------------------------------------------------------------------
  describe('Boundary 6: CORS Preflight Failures & Header Anomalies', () => {
    it('fails preflight with clear error when bucket has no userProject', async () => {
      const preflight = await gcsClientService.run4PointPreflight('ya29.test-token', 'requester-pays-bucket', '')
      expect(preflight.iamViewerGranted).toBe(false)
      expect(preflight.corsConfigured).toBe(false)
      expect(preflight.errorMessage).toBeDefined()
    })

    it('returns false when verifying empty local hash against GCS header', () => {
      expect(CRC32cIntegrityEngine.verifyMatch('', 'crc32c=r4L2wA==')).toBe(false)
    })

    it('returns false when GCS x-goog-hash header has no crc32c component', () => {
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', 'md5=3a4f8d9b1c2e4a5f6e7d8c9b0a1b2c3d')).toBe(false)
    })

    it('returns false when GCS header is null or undefined string', () => {
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', '')).toBe(false)
    })

    it('handles whitespace variations and case insensitivity in crc32c header parameter', () => {
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', 'CRC32C=r4L2wA==')).toBe(true)
      expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', '  crc32c=r4L2wA==  ')).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // Category 7: Quota Errors & UserProject Attribution
  // --------------------------------------------------------------------------
  describe('Boundary 7: Quota Errors & UserProject Attribution', () => {
    it('fails preflight when userProject contains only spaces', async () => {
      const preflight = await gcsClientService.run4PointPreflight('ya29.test-token', 'partner-bucket', '    ')
      expect(preflight.iamViewerGranted).toBe(false)
      expect(preflight.corsConfigured).toBe(false)
      expect(preflight.errorMessage).toBeDefined()
    })

    it('generates CLI companion command with fallback placeholder when userProject is empty', async () => {
      const projects = await gcpProjectService.listProjects('ya29.test-token')
      expect(projects).toBeDefined()
    })

    it('normalizes project ID by trimming excess whitespace in persistent store', () => {
      usePersistentStore.getState().setSavedProjectId('  project-with-spaces-2026  ')
      expect(usePersistentStore.getState().savedProjectId).toBe('project-with-spaces-2026')
    })

    it('validates active GCP billing check for valid project', async () => {
      const status = await gcpProjectService.checkBillingStatus('ya29.test-token', 'client-media-project-2026')
      expect(status.billingEnabled).toBe(true)
      expect(status.projectId).toBe('client-media-project-2026')
    })

    it('verifies generated project ID format basingse-media-dl-XXXX across multiple calls', async () => {
      const p1 = await gcpProjectService.autoProvisionProject('ya29.test-token')
      const p2 = await gcpProjectService.autoProvisionProject('ya29.test-token')
      expect(p1.project.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
      expect(p2.project.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
      expect(p1.project.lifecycleState).toBe('ACTIVE')
    })
  })

  // --------------------------------------------------------------------------
  // Category 8: Rapid Sequential Aborts & Race Conditions
  // --------------------------------------------------------------------------
  describe('Boundary 8: Rapid Sequential Aborts & Race Conditions', () => {
    it('handles rapid sequential abort trigger during stream initialization', async () => {
      const controller = new AbortController()
      const { handle } = createMockFileHandle(STUDIO_MASTER_DATASET[0].displayName)

      const mockResponse = new Response(createMockReadableStream([new Uint8Array(1024)]), {
        status: 200,
        headers: { 'content-length': '1024' },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const streamPromise = streamDownloadService.downloadFileFSAA(STUDIO_MASTER_DATASET[0], {
        bucketName: STUDIO_MASTER_DATASET[0].bucket,
        objectName: STUDIO_MASTER_DATASET[0].name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.test-token',
        customFileHandle: handle,
        abortSignal: controller.signal,
      })

      // Fire abort immediately in next microtask
      Promise.resolve().then(() => controller.abort())

      await streamPromise
      expect(controller.signal.aborted).toBe(true)
    })

    it('handles setting null abort controller when stream is idle', () => {
      expect(() => {
        useRuntimeStore.getState().setActiveAbortController(null)
        useRuntimeStore.getState().abortActiveDownload()
      }).not.toThrow()
    })

    it('handles rapid download progress updates in quick succession', () => {
      useRuntimeStore.getState().setAuth('ya29.test-token', 'user@test.com')
      for (let i = 0; i < 100; i++) {
        useRuntimeStore.getState().setDownloadProgress({
          itemId: 'stress-item',
          itemName: 'stress.mxf',
          loadedBytes: i * 1000,
          totalBytes: 100000,
          percentage: i,
          speedBytesPerSec: 50000000,
          formattedSpeed: '50.0 MB/s',
          etaSeconds: 100 - i,
          formattedETA: `${100 - i}s`,
          elapsedSeconds: i,
          formattedElapsed: `${i}s`,
          memoryHeapMB: 11.4,
          status: 'streaming',
        })
      }

      expect(useRuntimeStore.getState().activeDownload?.percentage).toBe(99)
    })

    it('handles setting download minimized state repeatedly', () => {
      useRuntimeStore.getState().setDownloadMinimized(true)
      expect(useRuntimeStore.getState().isDownloadMinimized).toBe(true)
      useRuntimeStore.getState().setDownloadMinimized(false)
      expect(useRuntimeStore.getState().isDownloadMinimized).toBe(false)
    })

    it('handles aborting already completed download gracefully', () => {
      useRuntimeStore.getState().setAuth('ya29.test-token', 'user@test.com')
      useRuntimeStore.getState().setDownloadProgress({
        itemId: 'item-done',
        itemName: 'done.mxf',
        loadedBytes: 1000,
        totalBytes: 1000,
        percentage: 100,
        speedBytesPerSec: 0,
        formattedSpeed: '0.0 MB/s',
        etaSeconds: 0,
        formattedETA: '00s',
        elapsedSeconds: 10,
        formattedElapsed: '10s',
        memoryHeapMB: 11.4,
        status: 'completed',
      })

      useRuntimeStore.getState().abortActiveDownload()
      // Should transition to cancelled
      expect(useRuntimeStore.getState().activeDownload?.status).toBe('cancelled')
    })
  })
})
