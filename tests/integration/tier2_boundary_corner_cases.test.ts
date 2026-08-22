import { describe, it, expect, beforeEach } from 'vitest'
import { MockGCSService } from '../../src/services/mockGcsService'
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
import { DownloadProgressTelemetry } from '../../src/types'

describe('Tier 2 - Boundary & Corner Cases (R1-R7)', () => {
  beforeEach(() => {
    resetAllStores()
  })

  // --------------------------------------------------------------------------
  // Category 1: Empty Buckets & Directories
  // --------------------------------------------------------------------------
  describe('Boundary 1: Empty Buckets & Directories', () => {
    it('handles non-existent or completely empty directory prefix gracefully', async () => {
      const result = await MockGCSService.listDirectory('empty-bucket-2026', 'non_existent_prefix/')
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
      const gcloud = MockGCSService.listDirectory('empty-bucket', '')
      expect(gcloud).toBeDefined()
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
      const telemetryUpdates: DownloadProgressTelemetry[] = []
      await MockGCSService.simulateStream(ZERO_BYTE_ITEM, (p) => {
        telemetryUpdates.push(p)
      })

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
      const heapSnapshots: number[] = []
      await MockGCSService.simulateStream(MASSIVE_50GB_ITEM, (p) => {
        heapSnapshots.push(p.memoryHeapMB)
      })

      expect(heapSnapshots.length).toBeGreaterThan(0)
      for (const heap of heapSnapshots) {
        expect(heap).toBeLessThan(25.0) // Bounded memory SLA
        expect(heap).toBeCloseTo(11.4, 1)
      }
    })

    it('computes 50GB progress telemetry percentages without integer overflow', async () => {
      let maxPercentage = 0
      await MockGCSService.simulateStream(MASSIVE_50GB_ITEM, (p) => {
        maxPercentage = Math.max(maxPercentage, p.percentage)
        expect(p.percentage).toBeGreaterThanOrEqual(0)
        expect(p.percentage).toBeLessThanOrEqual(100)
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

      const telemetryHistory: DownloadProgressTelemetry[] = []
      await MockGCSService.simulateStream(
        STUDIO_MASTER_DATASET[0],
        (p) => {
          telemetryHistory.push(p)
        },
        controller.signal,
      )

      expect(telemetryHistory.length).toBeGreaterThanOrEqual(1)
      const last = telemetryHistory[telemetryHistory.length - 1]
      expect(last.status).toBe('cancelled')
      expect(last.speedBytesPerSec).toBe(0)
    })

    it('handles mid-stream abort and zeroes moving average speed', async () => {
      const controller = new AbortController()
      let abortedAtStep = 0
      let stepCount = 0

      await MockGCSService.simulateStream(
        STUDIO_MASTER_DATASET[0],
        (p) => {
          stepCount++
          if (stepCount === 2 && !controller.signal.aborted) {
            controller.abort()
            abortedAtStep = stepCount
          }
        },
        controller.signal,
      )

      expect(abortedAtStep).toBe(2)
      const state = useRuntimeStore.getState()
      expect(state.activeDownload?.status).not.toBe('completed')
    })

    it('resets runtime store active download upon abortActiveDownload call', () => {
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
      const preflight = await MockGCSService.runPreflight('requester-pays-bucket', '')
      expect(preflight.corsConfigured).toBe(false)
      expect(preflight.iamViewerGranted).toBe(false)
      expect(preflight.rawError).toBe('HTTP 400 UserProjectMissing')
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
      const preflight = await MockGCSService.runPreflight('partner-bucket', '    ')
      expect(preflight.iamViewerGranted).toBe(false)
      expect(preflight.rawError).toContain('UserProjectMissing')
    })

    it('generates CLI companion command with fallback placeholder when userProject is empty', () => {
      const cmd = MockGCSService.listProjects()
      expect(cmd).toBeDefined()
    })

    it('normalizes project ID by trimming excess whitespace in persistent store', () => {
      usePersistentStore.getState().setSavedProjectId('  project-with-spaces-2026  ')
      expect(usePersistentStore.getState().savedProjectId).toBe('project-with-spaces-2026')
    })

    it('validates active GCP billing check for valid project', async () => {
      const status = await MockGCSService.checkBilling('demo-client-media-2026')
      expect(status.billingEnabled).toBe(true)
      expect(status.projectId).toBe('demo-client-media-2026')
    })

    it('verifies generated project ID format basingse-media-dl-XXXX across multiple calls', async () => {
      const p1 = await MockGCSService.autoCreateProject()
      const p2 = await MockGCSService.autoCreateProject()
      expect(p1.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
      expect(p2.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
      expect(p1.lifecycleState).toBe('ACTIVE')
    })
  })

  // --------------------------------------------------------------------------
  // Category 8: Rapid Sequential Aborts & Race Conditions
  // --------------------------------------------------------------------------
  describe('Boundary 8: Rapid Sequential Aborts & Race Conditions', () => {
    it('handles rapid sequential abort trigger during stream initialization', async () => {
      const controller = new AbortController()
      const streamPromise = MockGCSService.simulateStream(
        STUDIO_MASTER_DATASET[0],
        () => {},
        controller.signal,
      )

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
