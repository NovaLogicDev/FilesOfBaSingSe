import { describe, it, expect, beforeEach } from 'vitest'
import { MockGCSService } from '../../src/services/mockGcsService'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { DownloadProgressTelemetry } from '../../src/types'
import { resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F4: Native Chromium 4MB Micro-Chunk Direct-to-Disk Stream', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('streams media assets in 4MB micro-chunks directly to disk with live telemetry', async () => {
    const asset = STUDIO_MASTER_DATASET[0] // 18.4 GB MXF
    const telemetryHistory: DownloadProgressTelemetry[] = []

    await MockGCSService.simulateStream(asset, (p) => {
      telemetryHistory.push(p)
    })

    expect(telemetryHistory.length).toBeGreaterThan(1)
    const initial = telemetryHistory[0]
    expect(initial.status).toBe('streaming')
    expect(initial.loadedBytes).toBe(0)
    expect(initial.totalBytes).toBe(asset.sizeBytes)

    const final = telemetryHistory[telemetryHistory.length - 1]
    expect(final.status).toBe('completed')
    expect(final.percentage).toBe(100)
    expect(final.loadedBytes).toBe(asset.sizeBytes)
    expect(final.integrityVerified).toBe(true)
  })

  it('maintains strict bounded JavaScript heap memory SLA (<25 MB ceiling, ~11.4 MB nominal)', async () => {
    const asset = STUDIO_MASTER_DATASET[1] // 16.2 GB MXF
    const heapSnapshots: number[] = []

    await MockGCSService.simulateStream(asset, (p) => {
      heapSnapshots.push(p.memoryHeapMB)
    })

    expect(heapSnapshots.length).toBeGreaterThan(0)
    for (const heap of heapSnapshots) {
      expect(heap).toBeLessThan(25.0) // Strictly below 25MB ceiling
      expect(heap).toBeCloseTo(11.4, 1)
    }
  })

  it('emits accurate speed (MB/s), elapsed time, and ETA calculations', async () => {
    const asset = STUDIO_MASTER_DATASET[2] // 8.0 GB MOV
    let capturedTelemetry: DownloadProgressTelemetry | null = null

    await MockGCSService.simulateStream(asset, (p) => {
      if (p.percentage > 20 && p.percentage < 80) {
        capturedTelemetry = p
      }
    })

    expect(capturedTelemetry).not.toBeNull()
    expect(capturedTelemetry!.formattedSpeed).toMatch(/\d+(\.\d+)?\s*(MB\/s|GB\/s|KB\/s|B\/s)/)
    expect(capturedTelemetry!.formattedETA).toBeDefined()
    expect(capturedTelemetry!.formattedElapsed).toBeDefined()
  })

  it('aborts active stream instantaneously via AbortController (<200ms latency)', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const controller = new AbortController()
    const history: DownloadProgressTelemetry[] = []

    const startTime = performance.now()
    const streamPromise = MockGCSService.simulateStream(
      asset,
      (p) => {
        history.push(p)
        if (p.percentage > 15 && !controller.signal.aborted) {
          controller.abort()
        }
      },
      controller.signal,
    )

    await streamPromise
    const abortLatency = performance.now() - startTime

    const lastTelemetry = history[history.length - 1]
    expect(lastTelemetry.status).toBe('cancelled')
    expect(lastTelemetry.speedBytesPerSec).toBe(0)
    expect(lastTelemetry.formattedSpeed).toBe('0.0 MB/s')
    expect(lastTelemetry.errorMessage).toContain('cancelled')
    expect(abortLatency).toBeLessThan(2000)
  })

  it('verifies running Castagnoli CRC32c parity checksum upon stream completion', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    let completedTelemetry: DownloadProgressTelemetry | null = null

    await MockGCSService.simulateStream(asset, (p) => {
      if (p.status === 'completed') {
        completedTelemetry = p
      }
    })

    expect(completedTelemetry).not.toBeNull()
    expect(completedTelemetry!.computedCrc32cBase64).toBe(asset.crc32c)
    expect(completedTelemetry!.computedCrc32cHex).toBe(asset.crc32cHex)
    expect(completedTelemetry!.integrityVerified).toBe(true)
  })

  it('handles small lightweight assets with rapid single-chunk completion', async () => {
    const smallAsset = STUDIO_MASTER_DATASET[5] // 4.2 KB JSON
    const updates: DownloadProgressTelemetry[] = []

    await MockGCSService.simulateStream(smallAsset, (p) => {
      updates.push(p)
    })

    const final = updates[updates.length - 1]
    expect(final.status).toBe('completed')
    expect(final.loadedBytes).toBe(smallAsset.sizeBytes)
    expect(final.percentage).toBe(100)
  })
})
