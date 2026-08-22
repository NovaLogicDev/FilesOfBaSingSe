import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  StreamDownloadService,
  streamDownloadService,
} from '../../src/services/streamDownloadService'
import {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
  DownloadProgressTelemetry,
} from '../../src/types/stream'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { resetAllStores } from '../helpers/testUtils'

/**
 * Creates an instrumented mock FileSystemFileHandle with configurable latency and error injection.
 */
function createMockFileHandle(
  name = 'deep_stress_asset.mxf',
  options?: {
    writeDelayMs?: number
  },
): {
  handle: FileSystemFileHandle
  writable: FileSystemWritableFileStream
  writtenChunks: Uint8Array[]
  isClosed: () => boolean
  isAborted: () => boolean
  getAbortReason: () => any
} {
  let closed = false
  let aborted = false
  let abortReason: any = null
  const writtenChunks: Uint8Array[] = []

  const writable: FileSystemWritableFileStream = {
    locked: false,
    write: vi.fn(async (data: any) => {
      if (closed || aborted) throw new Error('Stream is closed or aborted')
      if (options?.writeDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.writeDelayMs))
      }
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
    abort: vi.fn(async (reason?: any) => {
      aborted = true
      abortReason = reason
    }),
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
    isAborted: () => aborted,
    getAbortReason: () => abortReason,
  }
}

describe('M4 Deep Adversarial Stress Harness — Volatile RAM & Abort Latency', () => {
  const sampleToken = 'ya29.deep_adversarial_m4_valid_token'
  const sampleBucket = 'partner-raw-master-archives-2026'
  const sampleProject = 'basingse-media-dl-1234'
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetAllStores()
    originalFetch = globalThis.fetch
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ==========================================================================
  // Stress Suite 1: Volatile Memory Isolation on clearAuth() Under Active Egress
  // ==========================================================================
  describe('Stress Suite 1: Volatile Memory Isolation on clearAuth() with in-flight stream', () => {
    it('guarantees activeDownload === null immediately and permanently during active in-flight streaming', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, isAborted } = createMockFileHandle(asset.displayName)

      const controller = new AbortController()
      useRuntimeStore.getState().setAuth(sampleToken, 'avatar.korra@republiccity.org')
      useRuntimeStore.getState().setActiveAbortController(controller)

      // Verify authenticated state
      expect(useRuntimeStore.getState().oauthToken).toBe(sampleToken)

      const chunk = new Uint8Array(1024 * 1024).fill(0xaa)
      let pullCount = 0
      const stream = new ReadableStream({
        async pull(ctrl) {
          pullCount++
          await new Promise((r) => setTimeout(r, 20))
          if (ctrl.desiredSize && ctrl.desiredSize > 0) {
            ctrl.enqueue(chunk)
          }
        },
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

      let clearAuthCalled = false
      const downloadPromise = streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => {
          useRuntimeStore.getState().setDownloadProgress(p)
          if (p.loadedBytes >= 1024 * 1024 && !clearAuthCalled) {
            clearAuthCalled = true
            // Instantaneous sign-out / volatile memory purge
            useRuntimeStore.getState().clearAuth()
            // IMMEDIATELY assert volatile memory is wiped
            const snapshot = useRuntimeStore.getState()
            expect(snapshot.oauthToken).toBeNull()
            expect(snapshot.userEmail).toBeNull()
            expect(snapshot.activeAbortController).toBeNull()
            expect(snapshot.activeDownload).toBeNull()
          }
        },
      })

      const result = await downloadPromise
      expect(result.status).toBe('cancelled')
      expect(isAborted()).toBe(true)

      // PERMANENCE CHECK: Verify activeDownload is STILL null after all stream teardown promises resolve
      await new Promise((r) => setTimeout(r, 100))
      const postTeardownState = useRuntimeStore.getState()
      expect(postTeardownState.activeDownload).toBeNull()
      expect(postTeardownState.oauthToken).toBeNull()
      expect(postTeardownState.userEmail).toBeNull()
      expect(postTeardownState.userName).toBeNull()
      expect(postTeardownState.userAvatar).toBeNull()
      expect(postTeardownState.tokenExpiresAt).toBeNull()
      expect(postTeardownState.activeAbortController).toBeNull()
    })

    it('suppresses trailing out-of-order setDownloadProgress calls when session is unauthenticated', () => {
      // Setup authenticated session then clear it
      useRuntimeStore.getState().setAuth(sampleToken, 'iroh@tea.shop')
      useRuntimeStore.getState().clearAuth()

      expect(useRuntimeStore.getState().activeDownload).toBeNull()

      // Attempt to push malicious / trailing telemetry frames
      const dummyTelemetry: DownloadProgressTelemetry = {
        itemId: 'malicious-item',
        itemName: 'malicious.mp4',
        loadedBytes: 5000000,
        totalBytes: 10000000,
        percentage: 50,
        speedBytesPerSec: 1000000,
        formattedSpeed: '1.0 MB/s',
        etaSeconds: 5,
        formattedETA: '05s',
        elapsedSeconds: 5,
        formattedElapsed: '05s',
        memoryHeapMB: 11.4,
        status: 'streaming',
      }

      // Call setDownloadProgress with various statuses
      useRuntimeStore.getState().setDownloadProgress(dummyTelemetry)
      expect(useRuntimeStore.getState().activeDownload).toBeNull()

      useRuntimeStore.getState().setDownloadProgress({ ...dummyTelemetry, status: 'completed' })
      expect(useRuntimeStore.getState().activeDownload).toBeNull()

      useRuntimeStore.getState().setDownloadProgress({ ...dummyTelemetry, status: 'cancelled' })
      expect(useRuntimeStore.getState().activeDownload).toBeNull()

      useRuntimeStore.getState().setDownloadProgress({ ...dummyTelemetry, status: 'error' })
      expect(useRuntimeStore.getState().activeDownload).toBeNull()
    })

    it('survives multi-cycle rapid authenticate -> download -> purge -> re-authenticate cycles without memory leaks', async () => {
      const asset = STUDIO_MASTER_DATASET[1]

      for (let cycle = 0; cycle < 5; cycle++) {
        const { handle, isAborted } = createMockFileHandle(`cycle_${cycle}.mxf`)
        const controller = new AbortController()

        useRuntimeStore.getState().setAuth(`token_cycle_${cycle}`, `user_${cycle}@basingse.gov`)
        useRuntimeStore.getState().setActiveAbortController(controller)

        const chunk = new Uint8Array(256 * 1024)
        const stream = new ReadableStream({
          async pull(ctrl) {
            await new Promise((r) => setTimeout(r, 10))
            ctrl.enqueue(chunk)
          },
        })

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

        let cleared = false
        const promise = streamDownloadService.downloadFileFSAA(asset, {
          bucketName: sampleBucket,
          objectName: asset.name,
          userProject: sampleProject,
          oauthToken: `token_cycle_${cycle}`,
          customFileHandle: handle,
          abortSignal: controller.signal,
          onProgress: (p) => {
            useRuntimeStore.getState().setDownloadProgress(p)
            if (p.loadedBytes > 0 && !cleared) {
              cleared = true
              useRuntimeStore.getState().clearAuth()
            }
          },
        })

        const res = await promise
        expect(res.status).toBe('cancelled')
        expect(isAborted()).toBe(true)

        const state = useRuntimeStore.getState()
        expect(state.oauthToken).toBeNull()
        expect(state.activeDownload).toBeNull()
        expect(state.activeAbortController).toBeNull()
      }
    })
  })

  // ==========================================================================
  // Stress Suite 2: Abort Latency During Stalled / Slow Network Chunk Reception
  // ==========================================================================
  describe('Stress Suite 2: Abort Latency Under Severe Network Stalls (<200ms SLA)', () => {
    it('aborts within <50ms when stream is blocked on an unresolvable hanging socket promise', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, writable, isAborted } = createMockFileHandle('hanging_socket.mxf')
      const controller = new AbortController()

      // Stream that NEVER resolves after chunk 0 (simulates permanently hanging connection)
      let chunkCount = 0
      const hangingStream = new ReadableStream<Uint8Array>({
        pull(ctrl) {
          chunkCount++
          if (chunkCount === 1) {
            ctrl.enqueue(new Uint8Array(1024 * 1024).fill(0x01))
          } else {
            // Return hanging promise that never resolves
            return new Promise<void>(() => {})
          }
        },
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(hangingStream, { status: 200 })))

      let abortCallTime = 0
      const promise = streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => {
          if (p.loadedBytes >= 1024 * 1024 && !controller.signal.aborted) {
            // Wait 20ms to ensure reader.read() has entered the hanging state
            setTimeout(() => {
              abortCallTime = performance.now()
              controller.abort()
            }, 20)
          }
        },
      })

      const result = await promise
      const latencyMs = performance.now() - abortCallTime

      // Must be well below 200ms SLA (empirically < 50ms)
      expect(latencyMs).toBeLessThan(50)
      expect(result.status).toBe('cancelled')
      expect(result.success).toBe(false)
      expect(writable.abort).toHaveBeenCalled()
      expect(isAborted()).toBe(true)
    })

    it('aborts within <50ms when network socket stalls with 5000ms delay per chunk', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, writable, isAborted } = createMockFileHandle('5000ms_stalled.mxf')
      const controller = new AbortController()

      const chunk = new Uint8Array(512 * 1024).fill(0xbb)
      let pullIndex = 0
      const stalledStream = new ReadableStream<Uint8Array>({
        async pull(ctrl) {
          pullIndex++
          if (pullIndex === 1) {
            ctrl.enqueue(chunk)
          } else {
            // 5000ms stall on subsequent chunk
            await new Promise((r) => setTimeout(r, 5000))
            ctrl.enqueue(chunk)
          }
        },
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stalledStream, { status: 200 })))

      let abortCallTime = 0
      const promise = streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => {
          if (p.loadedBytes >= 512 * 1024 && !controller.signal.aborted) {
            setTimeout(() => {
              abortCallTime = performance.now()
              controller.abort()
            }, 30)
          }
        },
      })

      const result = await promise
      const latencyMs = performance.now() - abortCallTime

      expect(latencyMs).toBeLessThan(50)
      expect(result.status).toBe('cancelled')
      expect(writable.abort).toHaveBeenCalled()
      expect(isAborted()).toBe(true)
    })

    it('executes 50 rapid sequential abort cycles with 100% success rate and <30ms average latency', async () => {
      const asset = STUDIO_MASTER_DATASET[2]
      const latencies: number[] = []

      for (let i = 0; i < 50; i++) {
        const { handle, writable, isAborted } = createMockFileHandle(`rapid_${i}.mov`)
        const controller = new AbortController()

        const chunk = new Uint8Array(64 * 1024).fill(0xcc)
        const stream = new ReadableStream<Uint8Array>({
          async pull(ctrl) {
            await new Promise((r) => setTimeout(r, 15))
            ctrl.enqueue(chunk)
          },
        })

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

        let abortTriggeredAt = 0
        const promise = streamDownloadService.downloadFileFSAA(asset, {
          bucketName: sampleBucket,
          objectName: asset.name,
          userProject: sampleProject,
          oauthToken: sampleToken,
          customFileHandle: handle,
          abortSignal: controller.signal,
          onProgress: (p) => {
            if (p.loadedBytes > 0 && !controller.signal.aborted) {
              abortTriggeredAt = performance.now()
              controller.abort()
            }
          },
        })

        const result = await promise
        const latency = performance.now() - abortTriggeredAt
        latencies.push(latency)

        expect(result.status).toBe('cancelled')
        expect(isAborted()).toBe(true)
        expect(writable.abort).toHaveBeenCalled()
        expect(latency).toBeLessThan(100)
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
      const maxLatency = Math.max(...latencies)
      expect(avgLatency).toBeLessThan(30)
      expect(maxLatency).toBeLessThan(100)
    })
  })
})
