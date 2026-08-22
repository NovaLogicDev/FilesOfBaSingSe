import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  StreamDownloadService,
  streamDownloadService,
} from '../../src/services/streamDownloadService'
import {
  FileSystemFileHandle,
  FileSystemWritableFileStream,
  UserCancelledPickerError,
  StreamDownloadError,
  DownloadProgressTelemetry,
} from '../../src/types/stream'
import {
  GCSClientError,
  UserProjectMissingError,
  UserProjectAccessDeniedError,
  BucketNotFoundError,
  CorsConfigurationError,
  IAMPermissionDeniedError,
} from '../../src/types/gcs'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { STUDIO_MASTER_DATASET, MASSIVE_50GB_ITEM } from '../fixtures/mediaDatasets'
import { resetAllStores } from '../helpers/testUtils'

/**
 * Creates an instrumented mock FileSystemFileHandle with configurable latency and error injection.
 */
function createMockFileHandle(
  name = 'test_asset.mxf',
  options?: {
    writeDelayMs?: number
    failOnChunkIndex?: number
    failError?: Error
  },
): {
  handle: FileSystemFileHandle
  writable: FileSystemWritableFileStream
  writtenChunks: Uint8Array[]
  isClosed: () => boolean
  isAborted: () => boolean
  getAbortReason: () => any
  getAbortTimestamp: () => number | null
  getCloseTimestamp: () => number | null
} {
  let closed = false
  let aborted = false
  let abortReason: any = null
  let abortTimestamp: number | null = null
  let closeTimestamp: number | null = null
  const writtenChunks: Uint8Array[] = []
  let chunkCount = 0

  const writable: FileSystemWritableFileStream = {
    locked: false,
    write: vi.fn(async (data: any) => {
      if (closed || aborted) throw new Error('Stream is closed or aborted')
      chunkCount++
      if (options?.failOnChunkIndex && chunkCount === options.failOnChunkIndex) {
        throw options.failError || new Error('Simulated disk write I/O error')
      }
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
      closeTimestamp = performance.now()
    }),
    abort: vi.fn(async (reason?: any) => {
      aborted = true
      abortReason = reason
      abortTimestamp = performance.now()
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
    getAbortTimestamp: () => abortTimestamp,
    getCloseTimestamp: () => closeTimestamp,
  }
}

/**
 * Creates a mock ReadableStream yielding Uint8Array chunks with optional pull delay or failure injection
 */
function createMockReadableStream(
  chunks: Uint8Array[],
  options?: {
    pullDelayMs?: number
    errorAtChunk?: number
    errorToThrow?: Error
    signal?: AbortSignal
  },
): {
  stream: ReadableStream<Uint8Array>
  getCancelCalled: () => boolean
  getCancelReason: () => any
  getCancelTimestamp: () => number | null
} {
  let index = 0
  let cancelCalled = false
  let cancelReason: any = null
  let cancelTimestamp: number | null = null

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (options?.signal?.aborted) {
        controller.error(new Error('AbortError'))
        return
      }
      if (options?.pullDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.pullDelayMs))
      }
      if (options?.errorAtChunk && index === options.errorAtChunk) {
        controller.error(options.errorToThrow || new Error('Network socket disconnected'))
        return
      }
      if (index < chunks.length) {
        controller.enqueue(chunks[index++])
      } else {
        controller.close()
      }
    },
    cancel(reason) {
      cancelCalled = true
      cancelReason = reason
      cancelTimestamp = performance.now()
    },
  })

  return {
    stream,
    getCancelCalled: () => cancelCalled,
    getCancelReason: () => cancelReason,
    getCancelTimestamp: () => cancelTimestamp,
  }
}

describe('M4 Adversarial Challenger - Stream Engine & CRC32c Empirical Stress Suite', () => {
  const sampleToken = 'ya29.sample_adversarial_m4_valid_token'
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
  // Section 1: Rapid Stream Abort Latency & Resource Termination (<200ms SLA)
  // ==========================================================================
  describe('Section 1: Rapid Stream Abort Latency (<200ms SLA Requirement)', () => {
    it('aborts active transfer in <200ms and immediately terminates disk handles', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, writable, isAborted } = createMockFileHandle(asset.displayName)

      const controller = new AbortController()
      const chunk = new Uint8Array(1024 * 1024).fill(0xaa)

      let abortTriggerTime = 0
      const { stream, getCancelCalled } = createMockReadableStream(
        [chunk, chunk, chunk, chunk, chunk, chunk, chunk, chunk],
        {
          pullDelayMs: 10,
          signal: controller.signal,
        },
      )

      const mockResponse = new Response(stream, {
        status: 200,
        headers: { 'content-length': String(8 * 1024 * 1024) },
      })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const telemetryEvents: DownloadProgressTelemetry[] = []

      const downloadPromise = streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => {
          telemetryEvents.push(p)
          // Trigger abort after receiving first chunk
          if (p.loadedBytes >= 1024 * 1024 && !controller.signal.aborted) {
            abortTriggerTime = performance.now()
            controller.abort()
          }
        },
      })

      const result = await downloadPromise
      const abortDurationMs = performance.now() - abortTriggerTime

      // Strictly verify <200ms abort latency requirement
      expect(abortDurationMs).toBeLessThan(200)

      // Verify result and handle termination
      expect(result.status).toBe('cancelled')
      expect(result.success).toBe(false)
      expect(writable.abort).toHaveBeenCalled()
      expect(isAborted()).toBe(true)
      expect(getCancelCalled()).toBe(true)

      // Verify volatile telemetry reset
      const lastEvent = telemetryEvents[telemetryEvents.length - 1]
      expect(lastEvent.status).toBe('cancelled')
      expect(lastEvent.speedBytesPerSec).toBe(0)
      expect(lastEvent.formattedSpeed).toBe('0.0 MB/s')
      expect(lastEvent.memoryHeapMB).toBe(0)
    })

    it('measures immediate <10ms abort resolution when signal is already aborted prior to invocation', async () => {
      const asset = STUDIO_MASTER_DATASET[1]
      const { handle, writable, isAborted } = createMockFileHandle(asset.displayName)

      const preAbortedController = new AbortController()
      preAbortedController.abort()

      const t0 = performance.now()
      const result = await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: preAbortedController.signal,
      })
      const elapsed = performance.now() - t0

      expect(elapsed).toBeLessThan(50) // Immediate short-circuit
      expect(result.status).toBe('cancelled')
      expect(result.success).toBe(false)
      expect(result.bytesDownloaded).toBe(0)
      expect(isAborted()).toBe(true)
    })

    it('aborts cleanly in <200ms during mid-stream chunk transfer with backpressure', async () => {
      const asset = STUDIO_MASTER_DATASET[2]
      const { handle, writable, isAborted } = createMockFileHandle(asset.displayName, {
        writeDelayMs: 10,
      })

      const controller = new AbortController()
      const chunk = new Uint8Array(512 * 1024).fill(0x55)

      let pullCount = 0
      const stream = new ReadableStream({
        async pull(ctrl) {
          pullCount++
          if (controller.signal.aborted) {
            ctrl.close()
            return
          }
          if (pullCount <= 10) {
            ctrl.enqueue(chunk)
          } else {
            ctrl.close()
          }
        },
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

      let abortStartTime = 0
      const promise = streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => {
          if (p.loadedBytes >= 1024 * 1024 && !controller.signal.aborted) {
            abortStartTime = performance.now()
            controller.abort()
          }
        },
      })

      const result = await promise
      const totalAbortTime = performance.now() - abortStartTime

      expect(result.status).toBe('cancelled')
      expect(writable.abort).toHaveBeenCalled()
      expect(isAborted()).toBe(true)
      expect(totalAbortTime).toBeLessThan(200)
    })

    it('aborts cleanly in <200ms when abort arrives while waiting for slow network chunk', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, writable, isAborted } = createMockFileHandle(asset.displayName)

      const controller = new AbortController()
      const chunk = new Uint8Array(1024 * 1024).fill(0xaa)

      // Stream with 500ms chunk delay to simulate slow network socket
      const { stream, getCancelCalled } = createMockReadableStream(
        [chunk, chunk, chunk, chunk],
        { pullDelayMs: 500, signal: controller.signal },
      )

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

      let abortStartTime = 0
      const promise = streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => {
          if (p.loadedBytes >= 1024 * 1024 && !controller.signal.aborted) {
            abortStartTime = performance.now()
            // Abort while waiting for next slow chunk
            controller.abort()
          }
        },
      })

      const result = await promise
      const totalAbortTime = performance.now() - abortStartTime

      expect(result.status).toBe('cancelled')
      expect(writable.abort).toHaveBeenCalled()
      expect(isAborted()).toBe(true)
      expect(getCancelCalled()).toBe(true)
      expect(totalAbortTime).toBeLessThan(200)
    })

    it('runtime store clearAuth() immediately aborts running stream and purges volatile RAM', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, isAborted } = createMockFileHandle(asset.displayName)

      const controller = new AbortController()
      useRuntimeStore.getState().setAuth(sampleToken, 'editor@ba-sing-se.gov')
      useRuntimeStore.getState().setActiveAbortController(controller)

      const chunk = new Uint8Array(1024 * 1024)
      const { stream } = createMockReadableStream([chunk, chunk, chunk, chunk], { pullDelayMs: 20 })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

      const downloadPromise = streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        abortSignal: controller.signal,
        onProgress: (p) => {
          useRuntimeStore.getState().setDownloadProgress(p)
          if (p.loadedBytes > 0 && !controller.signal.aborted) {
            // User signs out / purges session
            useRuntimeStore.getState().clearAuth()
          }
        },
      })

      const result = await downloadPromise
      expect(result.status).toBe('cancelled')
      expect(isAborted()).toBe(true)

      // Assert volatile credentials are wiped
      const storeState = useRuntimeStore.getState()
      expect(storeState.oauthToken).toBeNull()
      expect(storeState.userEmail).toBeNull()
      expect(storeState.activeAbortController).toBeNull()
      // Active download must be null because clearAuth() purged volatile RAM
      expect(storeState.activeDownload).toBeNull()
    })
  })

  // ==========================================================================
  // Section 2: Concurrent Download Conflicts & Stream Isolation
  // ==========================================================================
  describe('Section 2: Concurrent Download Conflicts & Stream Isolation', () => {
    it('executes two concurrent stream pipelines simultaneously without cross-stream contamination', async () => {
      const assetA = STUDIO_MASTER_DATASET[0]
      const assetB = STUDIO_MASTER_DATASET[1]

      const handleA = createMockFileHandle('assetA.mxf')
      const handleB = createMockFileHandle('assetB.mxf')

      const chunkA = new Uint8Array(2 * 1024 * 1024).fill(0x11)
      const chunkB = new Uint8Array(2 * 1024 * 1024).fill(0x22)

      const crcA = CRC32cIntegrityEngine.calculate(chunkA).base64
      const crcB = CRC32cIntegrityEngine.calculate(chunkB).base64

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.includes(encodeURIComponent(assetA.name))) {
          return new Response(createMockReadableStream([chunkA]).stream, {
            status: 200,
            headers: { 'content-length': String(chunkA.length), 'x-goog-hash': `crc32c=${crcA}` },
          })
        } else {
          return new Response(createMockReadableStream([chunkB]).stream, {
            status: 200,
            headers: { 'content-length': String(chunkB.length), 'x-goog-hash': `crc32c=${crcB}` },
          })
        }
      }))

      const [resA, resB] = await Promise.all([
        streamDownloadService.downloadFileFSAA(assetA, {
          bucketName: sampleBucket,
          objectName: assetA.name,
          userProject: sampleProject,
          oauthToken: sampleToken,
          customFileHandle: handleA.handle,
        }),
        streamDownloadService.downloadFileFSAA(assetB, {
          bucketName: sampleBucket,
          objectName: assetB.name,
          userProject: sampleProject,
          oauthToken: sampleToken,
          customFileHandle: handleB.handle,
        }),
      ])

      expect(resA.success).toBe(true)
      expect(resA.crc32cBase64).toBe(crcA)
      expect(handleA.isClosed()).toBe(true)
      expect(handleA.isAborted()).toBe(false)

      expect(resB.success).toBe(true)
      expect(resB.crc32cBase64).toBe(crcB)
      expect(handleB.isClosed()).toBe(true)
      expect(handleB.isAborted()).toBe(false)
    })

    it('aborts Stream A while Stream B continues to completion unaffected', async () => {
      const assetA = STUDIO_MASTER_DATASET[0]
      const assetB = STUDIO_MASTER_DATASET[1]

      const handleA = createMockFileHandle('assetA.mxf')
      const handleB = createMockFileHandle('assetB.mxf')

      const controllerA = new AbortController()
      const controllerB = new AbortController()

      const chunkA = new Uint8Array(1024 * 1024).fill(0x33)
      const chunkB = new Uint8Array(1024 * 1024).fill(0x44)
      const crcB = CRC32cIntegrityEngine.calculate(chunkB).base64

      const streamA = createMockReadableStream([chunkA, chunkA, chunkA, chunkA], { pullDelayMs: 25 })
      const streamB = createMockReadableStream([chunkB], { pullDelayMs: 10 })

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.includes(encodeURIComponent(assetA.name))) {
          return new Response(streamA.stream, { status: 200, headers: { 'content-length': '4194304' } })
        } else {
          return new Response(streamB.stream, {
            status: 200,
            headers: { 'content-length': String(chunkB.length), 'x-goog-hash': `crc32c=${crcB}` },
          })
        }
      }))

      const promiseA = streamDownloadService.downloadFileFSAA(assetA, {
        bucketName: sampleBucket,
        objectName: assetA.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handleA.handle,
        abortSignal: controllerA.signal,
        onProgress: (p) => {
          if (p.loadedBytes > 0 && !controllerA.signal.aborted) {
            controllerA.abort()
          }
        },
      })

      const promiseB = streamDownloadService.downloadFileFSAA(assetB, {
        bucketName: sampleBucket,
        objectName: assetB.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handleB.handle,
        abortSignal: controllerB.signal,
      })

      const [resA, resB] = await Promise.all([promiseA, promiseB])

      // Stream A was cancelled
      expect(resA.status).toBe('cancelled')
      expect(resA.success).toBe(false)
      expect(handleA.isAborted()).toBe(true)

      // Stream B completed successfully
      expect(resB.status).toBe('completed')
      expect(resB.success).toBe(true)
      expect(resB.crc32cBase64).toBe(crcB)
      expect(handleB.isClosed()).toBe(true)
    })
  })

  // ==========================================================================
  // Section 3: Stream Failure Recovery & Clean Retry Lifecycle
  // ==========================================================================
  describe('Section 3: Stream Failure Recovery & Clean Retry Lifecycle', () => {
    it('recovers cleanly from a failed initial attempt and succeeds on retry with fresh handle', async () => {
      const asset = STUDIO_MASTER_DATASET[2]
      const handleAttempt1 = createMockFileHandle('attempt1.mov')
      const handleAttempt2 = createMockFileHandle('attempt2.mov')

      const validChunk = new Uint8Array(2 * 1024 * 1024).fill(0x77)
      const expectedCrc = CRC32cIntegrityEngine.calculate(validChunk).base64

      let attemptCount = 0
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        attemptCount++
        if (attemptCount === 1) {
          // Attempt 1 fails midway
          const failedStream = createMockReadableStream([validChunk], {
            errorAtChunk: 1,
            errorToThrow: new Error('Socket abruptly severed by proxy/GCS'),
          })
          return new Response(failedStream.stream, { status: 200, headers: { 'content-length': '4194304' } })
        } else {
          // Attempt 2 succeeds
          const successStream = createMockReadableStream([validChunk])
          return new Response(successStream.stream, {
            status: 200,
            headers: {
              'content-length': String(validChunk.length),
              'x-goog-hash': `crc32c=${expectedCrc}`,
            },
          })
        }
      }))

      // Attempt 1: Expect rejection
      await expect(
        streamDownloadService.downloadFileFSAA(asset, {
          bucketName: sampleBucket,
          objectName: asset.name,
          userProject: sampleProject,
          oauthToken: sampleToken,
          customFileHandle: handleAttempt1.handle,
        }),
      ).rejects.toThrow('Socket abruptly severed by proxy/GCS')

      expect(handleAttempt1.isAborted()).toBe(true)

      // Attempt 2: Retry with new handle
      const retryResult = await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handleAttempt2.handle,
      })

      expect(retryResult.success).toBe(true)
      expect(retryResult.status).toBe('completed')
      expect(retryResult.crc32cBase64).toBe(expectedCrc)
      expect(handleAttempt2.isClosed()).toBe(true)
      expect(handleAttempt2.isAborted()).toBe(false)
    })
  })

  // ==========================================================================
  // Section 4: Network Drops, Socket Resets & Premature Termination
  // ==========================================================================
  describe('Section 4: Network Drops, Socket Resets & Premature Termination', () => {
    it('aborts disk handle immediately when network fetch rejects with TypeError', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, writable, isAborted } = createMockFileHandle(asset.displayName)

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch: Connection refused')))

      await expect(
        streamDownloadService.downloadFileFSAA(asset, {
          bucketName: sampleBucket,
          objectName: asset.name,
          userProject: sampleProject,
          oauthToken: sampleToken,
          customFileHandle: handle,
        }),
      ).rejects.toThrow(CorsConfigurationError)

      expect(writable.abort).toHaveBeenCalled()
      expect(isAborted()).toBe(true)
    })

    it('handles server aborting connection during stream body reading', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle, writable, isAborted } = createMockFileHandle(asset.displayName)

      let chunkIdx = 0
      const brokenStream = new ReadableStream({
        pull(ctrl) {
          chunkIdx++
          if (chunkIdx === 1) {
            ctrl.enqueue(new Uint8Array(1024))
          } else {
            ctrl.error(new Error('The connection was terminated by remote peer.'))
          }
        },
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(brokenStream, { status: 200 })))

      await expect(
        streamDownloadService.downloadFileFSAA(asset, {
          bucketName: sampleBucket,
          objectName: asset.name,
          userProject: sampleProject,
          oauthToken: sampleToken,
          customFileHandle: handle,
        }),
      ).rejects.toThrow('The connection was terminated by remote peer.')

      expect(writable.abort).toHaveBeenCalled()
      expect(isAborted()).toBe(true)
    })
  })

  // ==========================================================================
  // Section 5: Zero-Byte & Boundary Sizing Pathological Edge Cases
  // ==========================================================================
  describe('Section 5: Zero-Byte & Boundary Sizing Pathological Edge Cases', () => {
    it('handles 0-byte marker files with correct 0x00000000 / AAAAAA== CRC32c parity', async () => {
      const emptyAsset = {
        id: 'empty-file-id',
        name: 'markers/.keep',
        displayName: '.keep',
        sizeBytes: 0,
        bucket: sampleBucket,
      }
      const { handle, isClosed, writtenChunks } = createMockFileHandle('.keep')

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(createMockReadableStream([]).stream, {
            status: 200,
            headers: {
              'content-length': '0',
              'x-goog-hash': 'crc32c=AAAAAA==',
            },
          }),
        ),
      )

      const result = await streamDownloadService.downloadFileFSAA(emptyAsset, {
        bucketName: sampleBucket,
        objectName: emptyAsset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
      })

      expect(result.success).toBe(true)
      expect(result.bytesDownloaded).toBe(0)
      expect(result.crc32cBase64).toBe('AAAAAA==')
      expect(result.crc32cHex).toBe('0x00000000')
      expect(result.integrityVerified).toBe(true)
      expect(isClosed()).toBe(true)
      expect(writtenChunks.length).toBe(0)
    })

    it('handles 1-byte minimal file transfer correctly', async () => {
      const oneByteAsset = {
        name: 'single_byte.bin',
        sizeBytes: 1,
        bucket: sampleBucket,
      }
      const { handle, isClosed, writtenChunks } = createMockFileHandle('single_byte.bin')

      const oneByte = new Uint8Array([0x42])
      const oneByteCrc = CRC32cIntegrityEngine.calculate(oneByte).base64

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(createMockReadableStream([oneByte]).stream, {
            status: 200,
            headers: {
              'content-length': '1',
              'x-goog-hash': `crc32c=${oneByteCrc}`,
            },
          }),
        ),
      )

      const result = await streamDownloadService.downloadFileFSAA(oneByteAsset, {
        bucketName: sampleBucket,
        objectName: oneByteAsset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
      })

      expect(result.success).toBe(true)
      expect(result.bytesDownloaded).toBe(1)
      expect(result.crc32cBase64).toBe(oneByteCrc)
      expect(isClosed()).toBe(true)
      expect(writtenChunks.length).toBe(1)
    })

    it('handles exact 4MB chunk boundary (4,194,304 bytes) transfer', async () => {
      const asset = {
        name: 'exact_4mb.dat',
        sizeBytes: 4 * 1024 * 1024,
        bucket: sampleBucket,
      }
      const { handle, isClosed } = createMockFileHandle('exact_4mb.dat')

      const exact4MBChunk = new Uint8Array(4 * 1024 * 1024).fill(0x88)
      const expectedCrc = CRC32cIntegrityEngine.calculate(exact4MBChunk).base64

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(createMockReadableStream([exact4MBChunk]).stream, {
            status: 200,
            headers: {
              'content-length': String(exact4MBChunk.length),
              'x-goog-hash': `crc32c=${expectedCrc}`,
            },
          }),
        ),
      )

      const result = await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
      })

      expect(result.success).toBe(true)
      expect(result.bytesDownloaded).toBe(4 * 1024 * 1024)
      expect(result.crc32cBase64).toBe(expectedCrc)
      expect(isClosed()).toBe(true)
    })

    it('handles 4MB + 1 byte (4,194,305 bytes) spanning two micro-chunks', async () => {
      const asset = {
        name: 'boundary_overflow.dat',
        sizeBytes: 4 * 1024 * 1024 + 1,
        bucket: sampleBucket,
      }
      const { handle, isClosed, writtenChunks } = createMockFileHandle('boundary_overflow.dat')

      const chunk1 = new Uint8Array(4 * 1024 * 1024).fill(0x99)
      const chunk2 = new Uint8Array([0xfe])

      const engine = new CRC32cIntegrityEngine()
      engine.update(chunk1)
      engine.update(chunk2)
      const expectedCrc = engine.digestBase64()

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(createMockReadableStream([chunk1, chunk2]).stream, {
            status: 200,
            headers: {
              'content-length': String(chunk1.length + chunk2.length),
              'x-goog-hash': `crc32c=${expectedCrc}`,
            },
          }),
        ),
      )

      const result = await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
      })

      expect(result.success).toBe(true)
      expect(result.bytesDownloaded).toBe(4 * 1024 * 1024 + 1)
      expect(result.crc32cBase64).toBe(expectedCrc)
      expect(isClosed()).toBe(true)
      expect(writtenChunks.length).toBe(2)
    })

    it('handles stream responses with missing Content-Length header without failing', async () => {
      const asset = {
        name: 'chunked_unknown_length.dat',
        bucket: sampleBucket,
      }
      const { handle, isClosed } = createMockFileHandle('chunked_unknown_length.dat')

      const chunk = new Uint8Array(1024 * 1024).fill(0xab)
      const expectedCrc = CRC32cIntegrityEngine.calculate(chunk).base64

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(createMockReadableStream([chunk]).stream, {
            status: 200,
            headers: {
              // No content-length header
              'x-goog-hash': `crc32c=${expectedCrc}`,
            },
          }),
        ),
      )

      const result = await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
      })

      expect(result.success).toBe(true)
      expect(result.bytesDownloaded).toBe(1024 * 1024)
      expect(result.crc32cBase64).toBe(expectedCrc)
      expect(isClosed()).toBe(true)
    })
  })

  // ==========================================================================
  // Section 6: Cryptographic Castagnoli CRC32c Parity, Bit-Flip & Fuzzing
  // ==========================================================================
  describe('Section 6: Castagnoli CRC32c Standard Test Vectors & Bit-Flip Fuzzing', () => {
    it('validates RFC 3720 / Castagnoli standard test vectors', () => {
      // Vector 1: Empty string
      const empty = CRC32cIntegrityEngine.calculate('')
      expect(empty.integer).toBe(0x00000000)
      expect(empty.hex).toBe('0x00000000')
      expect(empty.base64).toBe('AAAAAA==')

      // Vector 2: "123456789" -> 0xE3069283 / 4waSgw==
      const digits = CRC32cIntegrityEngine.calculate('123456789')
      expect(digits.integer).toBe(0xe3069283)
      expect(digits.hex).toBe('0xE3069283')
      expect(digits.base64).toBe('4waSgw==')

      // Vector 3: 32 bytes of 0x00 -> 0x8A9136AA
      const zeros32 = new Uint8Array(32).fill(0x00)
      const zerosCrc = CRC32cIntegrityEngine.calculate(zeros32)
      expect(zerosCrc.integer).toBe(0x8a9136aa)
      expect(zerosCrc.hex).toBe('0x8A9136AA')

      // Vector 4: 32 bytes of 0xFF -> 0x62A8AB43
      const ones32 = new Uint8Array(32).fill(0xff)
      const onesCrc = CRC32cIntegrityEngine.calculate(ones32)
      expect(onesCrc.integer).toBe(0x62a8ab43)
      expect(onesCrc.hex).toBe('0x62A8AB43')
    })

    it('detects single-bit tampering anywhere across multi-chunk stream', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle } = createMockFileHandle(asset.displayName)

      // Create 3 chunks
      const chunk1 = new Uint8Array(1024 * 1024).fill(0x11)
      const chunk2 = new Uint8Array(1024 * 1024).fill(0x22)
      const chunk3 = new Uint8Array(1024 * 1024).fill(0x33)

      // Calculate correct CRC for original unmodified stream
      const engine = new CRC32cIntegrityEngine()
      engine.update(chunk1)
      engine.update(chunk2)
      engine.update(chunk3)
      const trueCrcBase64 = engine.digestBase64()

      // Tamper with single bit in chunk 2
      const tamperedChunk2 = new Uint8Array(chunk2)
      tamperedChunk2[500] ^= 0x01 // Flip 1 bit

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(createMockReadableStream([chunk1, tamperedChunk2, chunk3]).stream, {
            status: 200,
            headers: {
              'content-length': String(chunk1.length * 3),
              'x-goog-hash': `crc32c=${trueCrcBase64}`, // Original expected header
            },
          }),
        ),
      )

      const result = await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
      })

      // Verification MUST fail due to 1-bit corruption
      expect(result.success).toBe(false)
      expect(result.integrityVerified).toBe(false)
      expect(result.crc32cBase64).not.toBe(trueCrcBase64)
    })

    it('fuzzes arbitrary chunk sizes against one-shot digest across 200 iterations', () => {
      for (let run = 0; run < 200; run++) {
        const totalSize = Math.floor(Math.random() * 8192) + 1
        const payload = new Uint8Array(totalSize)
        for (let i = 0; i < totalSize; i++) {
          payload[i] = Math.floor(Math.random() * 256)
        }

        const oneShot = CRC32cIntegrityEngine.calculate(payload)

        // Stream slice by arbitrary variable chunks
        const streamingEngine = new CRC32cIntegrityEngine()
        let offset = 0
        while (offset < totalSize) {
          const sliceSize = Math.min(totalSize - offset, Math.floor(Math.random() * 512) + 1)
          streamingEngine.update(payload.subarray(offset, offset + sliceSize))
          offset += sliceSize
        }

        expect(streamingEngine.digest()).toBe(oneShot.integer)
        expect(streamingEngine.digestHex()).toBe(oneShot.hex)
        expect(streamingEngine.digestBase64()).toBe(oneShot.base64)
      }
    })
  })

  // ==========================================================================
  // Section 7: Zero-Backend Security & Parameter Attribution (Requirement R7)
  // ==========================================================================
  describe('Section 7: Zero-Backend Security & UserProject Parameter Attribution', () => {
    it('strictly attaches userProject query parameter and Authorization Bearer header', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle } = createMockFileHandle(asset.displayName)

      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(createMockReadableStream([new Uint8Array(10)]).stream, {
          status: 200,
          headers: { 'content-length': '10' },
        }),
      )
      vi.stubGlobal('fetch', fetchSpy)

      await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: 'gs://partner-raw-master-archives-2026/',
        objectName: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
        userProject: 'my-custom-billing-project-2026',
        oauthToken: 'ya29.valid-oauth-bearer-token',
        customFileHandle: handle,
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [calledUrl, calledOptions] = fetchSpy.mock.calls[0]
      expect(calledUrl).toBe(
        'https://storage.googleapis.com/storage/v1/b/partner-raw-master-archives-2026/o/feature_films%2Freel_04%2Freel04_cam_A_raw.mxf?alt=media&userProject=my-custom-billing-project-2026',
      )
      expect(calledOptions.headers.Authorization).toBe('Bearer ya29.valid-oauth-bearer-token')
    })

    it('rejects immediately with UserProjectMissingError when userProject is whitespace or empty', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle } = createMockFileHandle(asset.displayName)

      await expect(
        streamDownloadService.downloadFileFSAA(asset, {
          bucketName: sampleBucket,
          objectName: asset.name,
          userProject: '   ',
          oauthToken: sampleToken,
          customFileHandle: handle,
        }),
      ).rejects.toThrow(UserProjectMissingError)
    })

    it('rejects immediately with UNAUTHENTICATED error when oauthToken is missing', async () => {
      const asset = STUDIO_MASTER_DATASET[0]
      const { handle } = createMockFileHandle(asset.displayName)

      await expect(
        streamDownloadService.downloadFileFSAA(asset, {
          bucketName: sampleBucket,
          objectName: asset.name,
          userProject: sampleProject,
          oauthToken: '',
          customFileHandle: handle,
        }),
      ).rejects.toThrow(GCSClientError)
    })
  })

  // ==========================================================================
  // Section 8: Multi-Gigabyte (50GB+) Simulation, Heap Memory SLA & Backpressure
  // ==========================================================================
  describe('Section 8: Multi-Gigabyte (50GB+) Simulation, Heap Memory SLA & Backpressure', () => {
    it('simulates 54.2GB multi-gigabyte transfer with chunk-by-chunk memory heap assertions (<25MB limit)', async () => {
      const asset = MASSIVE_50GB_ITEM // 54.0 GB asset
      const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB micro-chunks
      const SIMULATED_CHUNKS = 100 // 100 x 4MB = 400MB active generator loop
      const TOTAL_BYTES = SIMULATED_CHUNKS * CHUNK_SIZE

      const { handle, writable, isClosed } = createMockFileHandle(asset.displayName)

      const sharedChunk = new Uint8Array(CHUNK_SIZE)
      for (let i = 0; i < CHUNK_SIZE; i += 128) {
        sharedChunk[i] = (i % 255) ^ 0x3c
      }

      let currentChunk = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (currentChunk < SIMULATED_CHUNKS) {
            currentChunk++
            controller.enqueue(sharedChunk)
          } else {
            controller.close()
          }
        },
      })

      const expectedCrcEngine = new CRC32cIntegrityEngine()
      for (let i = 0; i < SIMULATED_CHUNKS; i++) {
        expectedCrcEngine.update(sharedChunk)
      }
      const expectedBase64 = expectedCrcEngine.digestBase64()

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(stream, {
            status: 200,
            headers: {
              'content-length': String(TOTAL_BYTES),
              'x-goog-hash': `crc32c=${expectedBase64}`,
            },
          }),
        ),
      )

      const telemetrySamples: DownloadProgressTelemetry[] = []

      const result = await streamDownloadService.downloadFileFSAA(asset, {
        bucketName: sampleBucket,
        objectName: asset.name,
        userProject: sampleProject,
        oauthToken: sampleToken,
        customFileHandle: handle,
        onProgress: (p) => telemetrySamples.push(p),
      })

      expect(result.success).toBe(true)
      expect(result.status).toBe('completed')
      expect(result.bytesDownloaded).toBe(TOTAL_BYTES)
      expect(result.crc32cBase64).toBe(expectedBase64)
      expect(result.integrityVerified).toBe(true)
      expect(isClosed()).toBe(true)

      // Strict Memory SLA: Every single telemetry event must assert memoryHeapMB < 25MB ceiling
      expect(telemetrySamples.length).toBeGreaterThan(SIMULATED_CHUNKS)
      for (const sample of telemetrySamples) {
        expect(sample.memoryHeapMB).toBeLessThan(25.0)
        expect(sample.memoryHeapMB).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(sample.percentage)).toBe(true)
        expect(sample.percentage).toBeGreaterThanOrEqual(0)
        expect(sample.percentage).toBeLessThanOrEqual(100)
        expect(Number.isFinite(sample.speedBytesPerSec)).toBe(true)
        expect(Number.isFinite(sample.etaSeconds)).toBe(true)
      }

      // Verify progress curve starts at 0% and ends at 100%
      expect(telemetrySamples[0].percentage).toBe(0)
      expect(telemetrySamples[telemetrySamples.length - 1].percentage).toBe(100)
    }, 15000)

    it('enforces strict backpressure buffer pacing when disk write is delayed', async () => {
      const CHUNK_COUNT = 8
      const CHUNK_SIZE = 1024 * 1024 // 1MB
      const WRITE_DELAY_MS = 15

      let maxInFlightWrites = 0
      let activeWrites = 0

      const { handle, writable } = createMockFileHandle('pacing.mxf')
      const originalWrite = writable.write
      writable.write = vi.fn(async (data: any) => {
        activeWrites++
        maxInFlightWrites = Math.max(maxInFlightWrites, activeWrites)
        await new Promise((resolve) => setTimeout(resolve, WRITE_DELAY_MS))
        const res = await originalWrite(data)
        activeWrites--
        return res
      })

      const chunk = new Uint8Array(CHUNK_SIZE).fill(0xee)
      let emittedChunks = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(ctrl) {
          if (emittedChunks < CHUNK_COUNT) {
            emittedChunks++
            ctrl.enqueue(chunk)
          } else {
            ctrl.close()
          }
        },
      })

      const expectedEngine = new CRC32cIntegrityEngine()
      for (let i = 0; i < CHUNK_COUNT; i++) expectedEngine.update(chunk)
      const expectedCrc = expectedEngine.digestBase64()

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(stream, {
            status: 200,
            headers: {
              'content-length': String(CHUNK_COUNT * CHUNK_SIZE),
              'x-goog-hash': `crc32c=${expectedCrc}`,
            },
          }),
        ),
      )

      const result = await streamDownloadService.downloadFileFSAA(
        { name: 'pacing.mxf', sizeBytes: CHUNK_COUNT * CHUNK_SIZE },
        {
          bucketName: sampleBucket,
          objectName: 'pacing.mxf',
          userProject: sampleProject,
          oauthToken: sampleToken,
          customFileHandle: handle,
        },
      )

      expect(result.success).toBe(true)
      // Assert sequential backpressure: maxInFlightWrites is exactly 1
      expect(maxInFlightWrites).toBe(1)
    })
  })
})
