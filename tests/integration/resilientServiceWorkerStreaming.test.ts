import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { swService } from '../../src/services/swService'
import { streamDownloadService } from '../../src/services/streamDownloadService'
import { ResilientSWStreamEngine } from '../../src/engines/resilientSWStreamEngine'
import { BrowserDownloadBridgeEngine } from '../../src/engines/browserDownloadBridge'

describe('Resilient Service Worker Streaming & Native Browser Download Integration', () => {
  let mockController: any
  let messageListeners: ((event: any) => void)[] = []

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    messageListeners = []

    mockController = {
      postMessage: vi.fn(),
    }

    const mockServiceWorker = {
      controller: mockController,
      register: vi.fn().mockResolvedValue({
        scope: '/',
        active: mockController,
      }),
      ready: Promise.resolve({
        scope: '/',
        active: mockController,
      }),
      addEventListener: vi.fn((event: string, listener: any) => {
        if (event === 'message') {
          messageListeners.push(listener)
        }
      }),
      removeEventListener: vi.fn(),
    }

    vi.stubGlobal('navigator', {
      serviceWorker: mockServiceWorker,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('coordinates keep-alive heartbeat loop during active service worker streaming', async () => {
    vi.useFakeTimers()
    try {
      await swService.register()
      const streamId = 'sw_stream_keepalive_integration'

      swService.startKeepAlive(streamId)

      // Advance 10 seconds -> expect SW_KEEP_ALIVE_PING
      vi.advanceTimersByTime(10000)
      expect(mockController.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SW_KEEP_ALIVE_PING',
          streamId,
        }),
      )

      // Advance another 10 seconds -> expect second ping
      vi.advanceTimersByTime(10000)
      expect(mockController.postMessage).toHaveBeenCalledTimes(2)

      // Stop keep-alive
      swService.stopKeepAlive(streamId)
      vi.advanceTimersByTime(10000)
      expect(mockController.postMessage).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('completes streaming download and delivers verified CRC32c digest to client', async () => {
    await swService.register()

    const onProgress = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    const streamId = 'sw_stream_crc32c_integration'
    const unsubscribe = swService.subscribe(streamId, {
      onProgress,
      onComplete,
      onError,
    })

    // Simulate progress
    for (const listener of messageListeners) {
      listener({
        data: {
          type: 'SW_STREAM_PROGRESS',
          streamId,
          loadedBytes: 25000000,
          totalBytes: 50000000,
          percentage: 50,
          speed: 25000000,
        },
      })
    }

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId,
        loadedBytes: 25000000,
        percentage: 50,
      }),
    )

    // Simulate stream completion with CRC32c diagnostics
    for (const listener of messageListeners) {
      listener({
        data: {
          type: 'SW_STREAM_COMPLETE',
          streamId,
          loadedBytes: 50000000,
          totalBytes: 50000000,
          crc32cHex: '0xAF82F6C0',
          crc32cBase64: 'r4L2wA==',
          durationSeconds: 2,
          averageSpeedMBs: 25,
          diagnostics: {
            streamId,
            filename: 'reel01.mxf',
            totalBytes: 50000000,
            formattedSize: '50.00 MB',
            durationSeconds: 2,
            averageSpeedMBs: 25,
            crc32cHex: '0xAF82F6C0',
            crc32cBase64: 'r4L2wA==',
            integrityMatch: true,
            serviceWorkerActive: true,
            downloadLocation: '~/Downloads (Browser Default)',
          },
        },
      })
    }

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SW_STREAM_COMPLETE',
        streamId,
        crc32cHex: '0xAF82F6C0',
        crc32cBase64: 'r4L2wA==',
      }),
    )

    unsubscribe()
  })

  it('ResilientSWStreamEngine integrates with BrowserDownloadBridgeEngine', async () => {
    const streamId = await ResilientSWStreamEngine.streamToBrowser({
      bucketName: 'gs://partner-bucket',
      objectName: 'media/asset.mov',
      suggestedFilename: 'asset.mov',
      totalBytes: 1048576,
      userProject: 'billing-project',
      oauthToken: 'token123',
    })

    expect(streamId).toBeDefined()
    expect(mockController.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'REGISTER_STREAM',
      }),
    )

    ResilientSWStreamEngine.abortStream(streamId)
    expect(mockController.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ABORT_STREAM',
        streamId,
      }),
    )
  })
})
