import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BrowserDownloadBridgeEngine } from '../../src/engines/browserDownloadBridge'
import { swService } from '../../src/services/swService'

describe('Engine 10: BrowserDownloadBridgeEngine Unit Tests', () => {
  let messageListeners: ((event: MessageEvent) => void)[] = []

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    messageListeners = []

    const mockSW = {
      addEventListener: vi.fn((type: string, listener: any) => {
        if (type === 'message') messageListeners.push(listener)
      }),
      removeEventListener: vi.fn((type: string, listener: any) => {
        if (type === 'message') {
          messageListeners = messageListeners.filter((l) => l !== listener)
        }
      }),
    }

    vi.stubGlobal('navigator', {
      serviceWorker: mockSW,
    })

    vi.spyOn(swService, 'startKeepAlive').mockImplementation(() => {})
    vi.spyOn(swService, 'stopKeepAlive').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('formats byte sizes cleanly in decimal format', () => {
    expect(BrowserDownloadBridgeEngine.formatBytes(0)).toBe('0 B')
    expect(BrowserDownloadBridgeEngine.formatBytes(1000)).toBe('1 KB')
    expect(BrowserDownloadBridgeEngine.formatBytes(1500000)).toBe('1.5 MB')
    expect(BrowserDownloadBridgeEngine.formatBytes(2000000000)).toBe('2 GB')
  })

  it('listens to SW_STREAM_PROGRESS messages and passes them to progress callback', () => {
    const onProgress = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    const unsubscribe = BrowserDownloadBridgeEngine.initStreamListener(onProgress, onComplete, onError)

    const progressEvent = new MessageEvent('message', {
      data: {
        type: 'SW_STREAM_PROGRESS',
        streamId: 'stream_1',
        loadedBytes: 5000,
        totalBytes: 10000,
        percentage: 50,
      },
    })

    for (const listener of messageListeners) {
      listener(progressEvent)
    }

    expect(onProgress).toHaveBeenCalledWith(progressEvent.data)
    unsubscribe()
  })

  it('listens to SW_STREAM_COMPLETE messages and extracts diagnostics', () => {
    const onProgress = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    const unsubscribe = BrowserDownloadBridgeEngine.initStreamListener(onProgress, onComplete, onError)

    const completeEvent = new MessageEvent('message', {
      data: {
        type: 'SW_STREAM_COMPLETE',
        streamId: 'stream_complete_1',
        loadedBytes: 1000000,
        totalBytes: 1000000,
        crc32cHex: '0xAF82F6C0',
        crc32cBase64: 'r4L2wA==',
        durationSeconds: 5,
        averageSpeedMBs: 0.2,
      },
    })

    for (const listener of messageListeners) {
      listener(completeEvent)
    }

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId: 'stream_complete_1',
        crc32cHex: '0xAF82F6C0',
        crc32cBase64: 'r4L2wA==',
        integrityMatch: true,
      }),
    )

    unsubscribe()
  })

  it('listens to SW_STREAM_ERROR messages and handles stream failure', () => {
    const onProgress = vi.fn()
    const onComplete = vi.fn()
    const onError = vi.fn()

    const unsubscribe = BrowserDownloadBridgeEngine.initStreamListener(onProgress, onComplete, onError)

    const errorEvent = new MessageEvent('message', {
      data: {
        type: 'SW_STREAM_ERROR',
        streamId: 'stream_err_1',
        errorMessage: 'Connection terminated unexpectedly.',
      },
    })

    for (const listener of messageListeners) {
      listener(errorEvent)
    }

    expect(onError).toHaveBeenCalledWith('Connection terminated unexpectedly.')
    unsubscribe()
  })

  it('manages keep alive watchdog start and stop via swService', () => {
    BrowserDownloadBridgeEngine.startKeepAlive('stream_keep_alive_1')
    expect(swService.startKeepAlive).toHaveBeenCalledWith('stream_keep_alive_1')

    BrowserDownloadBridgeEngine.stopKeepAlive()
    expect(swService.stopKeepAlive).toHaveBeenCalledWith('stream_keep_alive_1')
  })
})
