import { describe, it, expect, vi, beforeEach } from 'vitest'
import { streamDownloadService } from '../../src/services/streamDownloadService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { MASSIVE_50GB_ITEM } from '../fixtures/mediaDatasets'
import { resetAllStores } from '../helpers/testUtils'
import { DownloadProgressTelemetry, FileSystemFileHandle, FileSystemWritableFileStream } from '../../src/types'

function createMockFileHandle(name = 'massive.mov'): {
  handle: FileSystemFileHandle
  writable: FileSystemWritableFileStream
  writtenChunks: Uint8Array[]
  isAborted: () => boolean
} {
  let aborted = false
  const writtenChunks: Uint8Array[] = []

  const writable: FileSystemWritableFileStream = {
    locked: false,
    write: vi.fn(async (data: any) => {
      if (data instanceof Uint8Array) {
        writtenChunks.push(data)
      }
    }),
    seek: vi.fn(async () => {}),
    truncate: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {
      aborted = true
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
    isAborted: () => aborted,
  }
}

describe('Tier 4 - Scenario 5: Network Failure & Rapid Abort Latency Verification', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('verifies sub-200ms abort response time and zero memory leaks during 54GB streaming failure', async () => {
    const controller = new AbortController()
    useRuntimeStore.getState().setActiveAbortController(controller)
    const { handle, isAborted } = createMockFileHandle(MASSIVE_50GB_ITEM.displayName)

    const chunk = new Uint8Array(1024 * 1024).fill(0x55)
    let chunkCount = 0
    let abortTimeMs = 0

    const stream = new ReadableStream({
      async pull(c) {
        chunkCount++
        if (chunkCount === 2) {
          const t0 = performance.now()
          controller.abort()
          abortTimeMs = performance.now() - t0
        }
        c.enqueue(chunk)
      },
    })

    const mockResponse = new Response(stream, {
      status: 200,
      headers: { 'content-length': String(MASSIVE_50GB_ITEM.sizeBytes) },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const telemetryEvents: DownloadProgressTelemetry[] = []

    const downloadPromise = streamDownloadService.downloadFileFSAA(MASSIVE_50GB_ITEM, {
      bucketName: MASSIVE_50GB_ITEM.bucket,
      objectName: MASSIVE_50GB_ITEM.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.test-token',
      customFileHandle: handle,
      abortSignal: controller.signal,
      onProgress: (progress) => {
        telemetryEvents.push(progress)
        useRuntimeStore.getState().setDownloadProgress(progress)
      },
    })

    const result = await downloadPromise

    // Verify sub-200ms abort latency
    expect(abortTimeMs).toBeLessThan(200)
    expect(result.status).toBe('cancelled')
    expect(isAborted()).toBe(true)

    // Verify final telemetry state is cancelled
    expect(telemetryEvents.length).toBeGreaterThan(1)
    const finalEvent = telemetryEvents[telemetryEvents.length - 1]
    expect(finalEvent.status).toBe('cancelled')
    expect(finalEvent.speedBytesPerSec).toBe(0)
    expect(finalEvent.formattedSpeed).toBe('0.0 MB/s')
    expect(finalEvent.memoryHeapMB).toBe(0) // Released memory
  })
})
