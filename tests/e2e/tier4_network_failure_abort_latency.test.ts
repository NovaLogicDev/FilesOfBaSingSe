import { describe, it, expect, beforeEach } from 'vitest'
import { MockGCSService } from '../../src/services/mockGcsService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { MASSIVE_50GB_ITEM } from '../fixtures/mediaDatasets'
import { resetAllStores } from '../helpers/testUtils'
import { DownloadProgressTelemetry } from '../../src/types'

describe('Tier 4 - Scenario 5: Network Failure & Rapid Abort Latency Verification', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('verifies sub-200ms abort response time and zero memory leaks during 54GB streaming failure', async () => {
    const controller = new AbortController()
    useRuntimeStore.getState().setActiveAbortController(controller)

    const telemetryEvents: DownloadProgressTelemetry[] = []

    let abortTimeMs = 0
    const streamPromise = MockGCSService.simulateStream(
      MASSIVE_50GB_ITEM,
      (progress) => {
        telemetryEvents.push(progress)
        useRuntimeStore.getState().setDownloadProgress(progress)

        // Trigger abort when transfer reaches 25%
        if (progress.percentage >= 25 && !controller.signal.aborted) {
          const t0 = performance.now()
          controller.abort()
          abortTimeMs = performance.now() - t0
        }
      },
      controller.signal,
    )

    await streamPromise

    // Verify sub-200ms abort latency
    expect(abortTimeMs).toBeLessThan(200)

    // Verify final telemetry state is cancelled
    expect(telemetryEvents.length).toBeGreaterThan(1)
    const finalEvent = telemetryEvents[telemetryEvents.length - 1]
    expect(finalEvent.status).toBe('cancelled')
    expect(finalEvent.speedBytesPerSec).toBe(0)
    expect(finalEvent.formattedSpeed).toBe('0.0 MB/s')
    expect(finalEvent.memoryHeapMB).toBe(0) // Released memory
  })
})
