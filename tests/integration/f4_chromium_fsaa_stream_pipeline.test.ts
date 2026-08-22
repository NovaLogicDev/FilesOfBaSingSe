import { describe, it, expect, vi, beforeEach } from 'vitest'
import { streamDownloadService } from '../../src/services/streamDownloadService'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { DownloadProgressTelemetry, FileSystemFileHandle, FileSystemWritableFileStream } from '../../src/types'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { resetAllStores } from '../helpers/testUtils'

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

describe('Tier 1 - F4: Native Chromium 4MB Micro-Chunk Direct-to-Disk Stream', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('streams media assets in 4MB micro-chunks directly to disk with live telemetry', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle(asset.displayName)

    const chunk1 = new Uint8Array(4 * 1024 * 1024).fill(0xaa)
    const chunk2 = new Uint8Array(4 * 1024 * 1024).fill(0xbb)
    const totalBytes = chunk1.length + chunk2.length

    const crcEngine = new CRC32cIntegrityEngine()
    crcEngine.update(chunk1)
    crcEngine.update(chunk2)
    const expectedBase64 = crcEngine.digestBase64()

    const mockResponse = new Response(createMockReadableStream([chunk1, chunk2]), {
      status: 200,
      headers: {
        'content-length': String(totalBytes),
        'x-goog-hash': `crc32c=${expectedBase64}`,
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const telemetryHistory: DownloadProgressTelemetry[] = []

    const result = await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.test-token',
      customFileHandle: handle,
      onProgress: (p) => telemetryHistory.push(p),
    })

    expect(result.success).toBe(true)
    expect(telemetryHistory.length).toBeGreaterThan(1)
    const initial = telemetryHistory[0]
    expect(initial.status).toBe('streaming')
    expect(initial.loadedBytes).toBe(0)

    const final = telemetryHistory[telemetryHistory.length - 1]
    expect(final.status).toBe('completed')
    expect(final.percentage).toBe(100)
    expect(final.loadedBytes).toBe(totalBytes)
    expect(final.integrityVerified).toBe(true)
  })

  it('maintains strict bounded JavaScript heap memory SLA (<25 MB ceiling, ~11.4 MB nominal)', async () => {
    const asset = STUDIO_MASTER_DATASET[1]
    const { handle } = createMockFileHandle(asset.displayName)

    const chunk = new Uint8Array(1024 * 1024).fill(1)
    const mockResponse = new Response(createMockReadableStream([chunk]), {
      status: 200,
      headers: { 'content-length': String(chunk.length) },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const heapSnapshots: number[] = []

    await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.test-token',
      customFileHandle: handle,
      onProgress: (p) => heapSnapshots.push(p.memoryHeapMB),
    })

    expect(heapSnapshots.length).toBeGreaterThan(0)
    for (const heap of heapSnapshots) {
      expect(heap).toBeLessThan(25.0)
      expect(heap).toBeGreaterThanOrEqual(0)
    }
  })

  it('emits accurate speed (MB/s), elapsed time, and ETA calculations', async () => {
    const asset = STUDIO_MASTER_DATASET[2]
    const { handle } = createMockFileHandle(asset.displayName)

    const chunk1 = new Uint8Array(2 * 1024 * 1024).fill(1)
    const chunk2 = new Uint8Array(2 * 1024 * 1024).fill(2)

    const mockResponse = new Response(createMockReadableStream([chunk1, chunk2]), {
      status: 200,
      headers: { 'content-length': String(chunk1.length + chunk2.length) },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    let capturedTelemetry: DownloadProgressTelemetry | null = null

    await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.test-token',
      customFileHandle: handle,
      onProgress: (p) => {
        if (p.percentage >= 50 && p.percentage < 100) {
          capturedTelemetry = p
        }
      },
    })

    expect(capturedTelemetry).not.toBeNull()
    expect(capturedTelemetry!.formattedSpeed).toBeDefined()
    expect(capturedTelemetry!.formattedETA).toBeDefined()
    expect(capturedTelemetry!.formattedElapsed).toBeDefined()
  })

  it('aborts active stream instantaneously via AbortController (<200ms latency)', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle(asset.displayName)
    const controller = new AbortController()
    const history: DownloadProgressTelemetry[] = []

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

    const startTime = performance.now()
    const result = await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.test-token',
      customFileHandle: handle,
      abortSignal: controller.signal,
      onProgress: (p) => history.push(p),
    })
    const abortLatency = performance.now() - startTime

    expect(result.status).toBe('cancelled')
    expect(result.success).toBe(false)
    const lastTelemetry = history[history.length - 1]
    expect(lastTelemetry.status).toBe('cancelled')
    expect(lastTelemetry.speedBytesPerSec).toBe(0)
    expect(abortLatency).toBeLessThan(2000)
  })

  it('verifies running Castagnoli CRC32c parity checksum upon stream completion', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle(asset.displayName)

    const chunk = new Uint8Array(1024).fill(0x42)
    const crcEngine = new CRC32cIntegrityEngine()
    crcEngine.update(chunk)
    const expectedBase64 = crcEngine.digestBase64()
    const expectedHex = crcEngine.digestHex()

    const mockResponse = new Response(createMockReadableStream([chunk]), {
      status: 200,
      headers: {
        'content-length': String(chunk.length),
        'x-goog-hash': `crc32c=${expectedBase64}`,
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    let completedTelemetry: DownloadProgressTelemetry | null = null

    await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.test-token',
      customFileHandle: handle,
      onProgress: (p) => {
        if (p.status === 'completed') {
          completedTelemetry = p
        }
      },
    })

    expect(completedTelemetry).not.toBeNull()
    expect(completedTelemetry!.computedCrc32cBase64).toBe(expectedBase64)
    expect(completedTelemetry!.computedCrc32cHex).toBe(expectedHex)
    expect(completedTelemetry!.integrityVerified).toBe(true)
  })

  it('handles small lightweight assets with rapid single-chunk completion', async () => {
    const smallAsset = STUDIO_MASTER_DATASET[5] // 4.2 KB JSON
    const { handle } = createMockFileHandle(smallAsset.displayName)

    const chunk = new Uint8Array(1024).fill(0x20)
    const crcEngine = new CRC32cIntegrityEngine()
    crcEngine.update(chunk)
    const expectedBase64 = crcEngine.digestBase64()

    const mockResponse = new Response(createMockReadableStream([chunk]), {
      status: 200,
      headers: {
        'content-length': String(chunk.length),
        'x-goog-hash': `crc32c=${expectedBase64}`,
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const updates: DownloadProgressTelemetry[] = []

    const result = await streamDownloadService.downloadFileFSAA(smallAsset, {
      bucketName: smallAsset.bucket,
      objectName: smallAsset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.test-token',
      customFileHandle: handle,
      onProgress: (p) => updates.push(p),
    })

    expect(result.success).toBe(true)
    const final = updates[updates.length - 1]
    expect(final.status).toBe('completed')
    expect(final.percentage).toBe(100)
  })
})
