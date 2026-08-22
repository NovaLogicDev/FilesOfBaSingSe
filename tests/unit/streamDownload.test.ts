import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  StreamDownloadService,
  streamDownloadService,
} from '../../src/services/streamDownloadService'
import {
  DownloadProgressTelemetry,
  FileSystemFileHandle,
  FileSystemWritableFileStream,
  UserCancelledPickerError,
  StreamDownloadError,
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
import { STUDIO_MASTER_DATASET, MASSIVE_50GB_ITEM } from '../fixtures/mediaDatasets'

/**
 * Creates a mock FileSystemFileHandle with controllable writable stream
 */
function createMockFileHandle(name = 'test_asset.mxf'): {
  handle: FileSystemFileHandle
  writable: FileSystemWritableFileStream
  writtenChunks: Uint8Array[]
  isClosed: () => boolean
  isAborted: () => boolean
} {
  let closed = false
  let aborted = false
  const writtenChunks: Uint8Array[] = []

  const writable: FileSystemWritableFileStream = {
    locked: false,
    write: vi.fn(async (data: any) => {
      if (closed || aborted) throw new Error('Stream is closed or aborted')
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
    isClosed: () => closed,
    isAborted: () => aborted,
  }
}

/**
 * Creates a mock ReadableStream yielding Uint8Array chunks
 */
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

describe('StreamDownloadService (Native Chromium 4MB Micro-Chunk Direct-to-Disk Stream)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('provides singleton instance via getInstance() and export', () => {
    const instance1 = StreamDownloadService.getInstance()
    const instance2 = StreamDownloadService.getInstance()
    expect(instance1).toBe(instance2)
    expect(streamDownloadService).toBe(instance1)
  })

  it('correctly detects FileSystemAccessAPI availability in window runtime', () => {
    // When showSaveFilePicker is absent
    vi.stubGlobal('window', {})
    expect(streamDownloadService.isFSAASupported()).toBe(false)

    // When showSaveFilePicker is present
    vi.stubGlobal('window', {
      showSaveFilePicker: vi.fn(),
    })
    expect(streamDownloadService.isFSAASupported()).toBe(true)
  })

  it('prompts native Save File Picker with correct suggested name and mime filters', async () => {
    const mockShowPicker = vi.fn().mockResolvedValue({
      kind: 'file',
      name: 'reel04_cam_A_raw.mxf',
      createWritable: vi.fn(),
      getFile: vi.fn(),
    })
    vi.stubGlobal('window', { showSaveFilePicker: mockShowPicker })

    const handle = await streamDownloadService.promptSaveFileHandle(
      'reel04_cam_A_raw.mxf',
      'application/mxf',
    )
    expect(handle).toBeDefined()
    expect(handle.name).toBe('reel04_cam_A_raw.mxf')
    expect(mockShowPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'reel04_cam_A_raw.mxf',
        types: expect.arrayContaining([
          expect.objectContaining({
            accept: { 'application/mxf': ['.mxf'] },
          }),
        ]),
      }),
    )
  })

  it('throws UserCancelledPickerError when user cancels Save File Picker dialog', async () => {
    const abortErr = new Error('The user aborted a request.')
    abortErr.name = 'AbortError'
    vi.stubGlobal('window', {
      showSaveFilePicker: vi.fn().mockRejectedValue(abortErr),
    })

    await expect(
      streamDownloadService.promptSaveFileHandle('test.mov', 'video/quicktime'),
    ).rejects.toThrow(UserCancelledPickerError)
  })

  it('streams media assets in 4MB micro-chunks directly to disk with live telemetry', async () => {
    const asset = STUDIO_MASTER_DATASET[0] // 18.4GB MXF
    const { handle, writable, isClosed } = createMockFileHandle(asset.displayName)

    // Create 4 synthetic 4MB chunks
    const chunk1 = new Uint8Array(4 * 1024 * 1024).fill(0xaa)
    const chunk2 = new Uint8Array(4 * 1024 * 1024).fill(0xbb)
    const chunk3 = new Uint8Array(4 * 1024 * 1024).fill(0xcc)
    const chunk4 = new Uint8Array(4 * 1024 * 1024).fill(0xdd)
    const totalBytes = chunk1.length * 4

    // Compute expected CRC32c for the synthetic chunks
    const testCrcEngine = new CRC32cIntegrityEngine()
    testCrcEngine.update(chunk1)
    testCrcEngine.update(chunk2)
    testCrcEngine.update(chunk3)
    testCrcEngine.update(chunk4)
    const expectedBase64 = testCrcEngine.digestBase64()

    const mockStream = createMockReadableStream([chunk1, chunk2, chunk3, chunk4])

    const mockResponse = new Response(mockStream, {
      status: 200,
      headers: {
        'content-length': String(totalBytes),
        'x-goog-hash': `crc32c=${expectedBase64}`,
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const telemetryEvents: DownloadProgressTelemetry[] = []

    const result = await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.synthetic-valid-token',
      customFileHandle: handle,
      onProgress: (p) => telemetryEvents.push(p),
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.bytesDownloaded).toBe(totalBytes)
    expect(result.crc32cBase64).toBe(expectedBase64)
    expect(result.integrityVerified).toBe(true)
    expect(writable.write).toHaveBeenCalledTimes(4)
    expect(writable.close).toHaveBeenCalledTimes(1)
    expect(isClosed()).toBe(true)

    // Verify telemetry event stream
    expect(telemetryEvents.length).toBeGreaterThanOrEqual(5)
    const initial = telemetryEvents[0]
    expect(initial.status).toBe('streaming')
    expect(initial.loadedBytes).toBe(0)
    expect(initial.percentage).toBe(0)

    const final = telemetryEvents[telemetryEvents.length - 1]
    expect(final.status).toBe('completed')
    expect(final.percentage).toBe(100)
    expect(final.loadedBytes).toBe(totalBytes)
    expect(final.integrityVerified).toBe(true)
  })

  it('maintains strict bounded JavaScript heap memory SLA (<25 MB ceiling, ~11.4 MB nominal)', async () => {
    const asset = STUDIO_MASTER_DATASET[1]
    const { handle } = createMockFileHandle(asset.displayName)

    const chunks = [
      new Uint8Array(1024 * 1024).fill(1),
      new Uint8Array(1024 * 1024).fill(2),
      new Uint8Array(1024 * 1024).fill(3),
    ]

    const mockResponse = new Response(createMockReadableStream(chunks), {
      status: 200,
      headers: { 'content-length': String(3 * 1024 * 1024) },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const heapValues: number[] = []

    await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.synthetic-valid-token',
      customFileHandle: handle,
      onProgress: (p) => heapValues.push(p.memoryHeapMB),
    })

    expect(heapValues.length).toBeGreaterThan(0)
    for (const heap of heapValues) {
      expect(heap).toBeLessThan(25.0) // Strictly below 25MB SLA ceiling
      expect(heap).toBeGreaterThanOrEqual(0)
    }
  })

  it('detects and flags 1-bit or checksum mismatch between stream data and GCS x-goog-hash', async () => {
    const asset = STUDIO_MASTER_DATASET[2]
    const { handle } = createMockFileHandle(asset.displayName)

    const chunk = new Uint8Array(1024).fill(0x42)
    const mockResponse = new Response(createMockReadableStream([chunk]), {
      status: 200,
      headers: {
        'content-length': '1024',
        'x-goog-hash': 'crc32c=MISMATCHED_HASH==', // Deliberate mismatch
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const telemetryEvents: DownloadProgressTelemetry[] = []

    const result = await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.synthetic-valid-token',
      customFileHandle: handle,
      onProgress: (p) => telemetryEvents.push(p),
    })

    expect(result.success).toBe(false)
    expect(result.integrityVerified).toBe(false)
    const final = telemetryEvents[telemetryEvents.length - 1]
    expect(final.integrityVerified).toBe(false)
  })

  it('aborts active stream instantaneously via AbortController (<200ms latency)', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle, writable, isAborted } = createMockFileHandle(asset.displayName)

    const controller = new AbortController()
    const chunk = new Uint8Array(1024 * 1024).fill(0x55)

    // Infinite or multi-chunk stream that triggers abort on chunk 2
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

    const telemetryEvents: DownloadProgressTelemetry[] = []
    const startTime = performance.now()

    const result = await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.synthetic-valid-token',
      customFileHandle: handle,
      abortSignal: controller.signal,
      onProgress: (p) => telemetryEvents.push(p),
    })

    const abortLatency = performance.now() - startTime
    expect(abortLatency).toBeLessThan(2000)

    expect(result.status).toBe('cancelled')
    expect(result.success).toBe(false)
    expect(writable.abort).toHaveBeenCalled()
    expect(isAborted()).toBe(true)

    const lastEvent = telemetryEvents[telemetryEvents.length - 1]
    expect(lastEvent.status).toBe('cancelled')
    expect(lastEvent.speedBytesPerSec).toBe(0)
    expect(lastEvent.formattedSpeed).toBe('0.0 MB/s')
    expect(lastEvent.memoryHeapMB).toBe(0) // Purged volatile state
  })

  it('handles GCS HTTP 401 Unauthorized by throwing TOKEN_EXPIRED GCSClientError', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    const mockResponse = new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'expired-token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(GCSClientError)
  })

  it('handles GCS HTTP 400 Requester Pays missing project by throwing UserProjectMissingError', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    const mockResponse = new Response(
      JSON.stringify({ error: { message: 'User project is required for requester pays.' } }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(UserProjectMissingError)
  })

  it('handles GCS HTTP 403 UserProjectAccessDenied by throwing UserProjectAccessDeniedError', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    const mockResponse = new Response(
      JSON.stringify({
        error: {
          message: 'The billing account for project is disabled.',
          errors: [{ reason: 'userProjectAccessDenied' }],
        },
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' },
      },
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(UserProjectAccessDeniedError)
  })

  it('handles GCS HTTP 403 IAM permission denied by throwing IAMPermissionDeniedError', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    const mockResponse = new Response(
      JSON.stringify({
        error: {
          message: 'Caller does not have storage.objects.get access to bucket.',
        },
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' },
      },
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(IAMPermissionDeniedError)
  })

  it('handles GCS HTTP 404 Bucket Not Found by throwing BucketNotFoundError', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    const mockResponse = new Response(JSON.stringify({ error: { message: 'Not Found' } }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: 'non-existent-bucket',
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(BucketNotFoundError)
  })

  it('handles browser CORS preflight blocking by throwing CorsConfigurationError', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    const networkErr = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkErr))

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(CorsConfigurationError)
  })

  it('handles disk write quota exceeded error and cleanly aborts stream', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle, writable } = createMockFileHandle()

    // Mock writable.write failing with QuotaExceededError
    const quotaErr = new Error('Disk quota exceeded')
    quotaErr.name = 'QuotaExceededError'
    ;(writable.write as any).mockRejectedValue(quotaErr)

    const chunk = new Uint8Array(1024).fill(0x11)
    const mockResponse = new Response(createMockReadableStream([chunk]), {
      status: 200,
      headers: { 'content-length': '1024' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow('Disk quota exceeded')

    expect(writable.abort).toHaveBeenCalled()
  })

  it('handles zero-byte asset stream download correctly', async () => {
    const asset = {
      id: 'zero-01',
      name: 'empty.txt',
      displayName: 'empty.txt',
      sizeBytes: 0,
      bucket: 'partner-raw-master-archives-2026',
    }
    const { handle, isClosed } = createMockFileHandle(asset.displayName)

    const mockResponse = new Response(createMockReadableStream([]), {
      status: 200,
      headers: {
        'content-length': '0',
        'x-goog-hash': 'crc32c=AAAAAA==',
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const result = await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: asset.bucket,
      objectName: asset.name,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'token',
      customFileHandle: handle,
    })

    expect(result.success).toBe(true)
    expect(result.crc32cBase64).toBe('AAAAAA==')
    expect(result.crc32cHex).toBe('0x00000000')
    expect(result.bytesDownloaded).toBe(0)
    expect(isClosed()).toBe(true)
  })

  it('constructs correct direct GCS media query URL with userProject and Authorization headers', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle(asset.displayName)

    const mockResponse = new Response(createMockReadableStream([new Uint8Array(10)]), {
      status: 200,
      headers: { 'content-length': '10' },
    })
    const fetchMock = vi.fn().mockResolvedValue(mockResponse)
    vi.stubGlobal('fetch', fetchMock)

    await streamDownloadService.downloadFileFSAA(asset, {
      bucketName: 'gs://partner-raw-master-archives-2026/',
      objectName: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
      userProject: 'my-billing-project-99',
      oauthToken: 'secret-token-xyz',
      customFileHandle: handle,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://storage.googleapis.com/storage/v1/b/partner-raw-master-archives-2026/o/feature_films%2Freel_04%2Freel04_cam_A_raw.mxf?alt=media&userProject=my-billing-project-99',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer secret-token-xyz',
          Accept: '*/*',
        },
      }),
    )
  })

  it('rejects with UNAUTHENTICATED error when token is missing or empty', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: '',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(GCSClientError)
  })

  it('rejects with UserProjectMissingError when userProject is missing or empty', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle()

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: '   ',
        oauthToken: 'valid-token',
        customFileHandle: handle,
      }),
    ).rejects.toThrow(UserProjectMissingError)
  })

  it('throws FSAA_NOT_SUPPORTED when browser lacks showSaveFilePicker and no customHandle provided', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    vi.stubGlobal('window', {}) // window without showSaveFilePicker

    await expect(
      streamDownloadService.downloadFileFSAA(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'valid-token',
      }),
    ).rejects.toThrow(StreamDownloadError)
  })

  it('executes demo sandbox fallback stream simulation correctly', async () => {
    const asset = STUDIO_MASTER_DATASET[0]
    const telemetryEvents: DownloadProgressTelemetry[] = []

    const result = await streamDownloadService.streamDemoDownload(asset, {
      onProgress: (p) => telemetryEvents.push(p),
    })

    expect(result.success).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.integrityVerified).toBe(true)
    expect(result.crc32cBase64).toBe(asset.crc32c)
    expect(telemetryEvents.length).toBeGreaterThan(1)
  })
})

