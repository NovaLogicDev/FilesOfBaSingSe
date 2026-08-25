import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SwService, swService } from '../../src/services/swService'
import { StreamTicket, SwProgressPayload } from '../../src/types/stream'

describe('SwService (Safari Service Worker Lifecycle & Stream Interceptor Manager)', () => {
  let mockController: { postMessage: ReturnType<typeof vi.fn> }
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
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('provides singleton instance via getInstance() and swService export', () => {
    const instance1 = SwService.getInstance()
    const instance2 = SwService.getInstance()
    expect(instance1).toBe(instance2)
    expect(swService).toBe(instance1)
  })

  it('detects Service Worker support when navigator.serviceWorker is available', () => {
    expect(swService.isSupported()).toBe(true)

    vi.stubGlobal('navigator', {})
    expect(swService.isSupported()).toBe(false)
  })

  it('registers sw.js with root scope / and binds incoming message dispatcher', async () => {
    const registered = await swService.register('/sw.js', '/')
    expect(registered).toBe(true)
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function))
  })

  it('gracefully handles registration failure and returns false', async () => {
    vi.mocked(navigator.serviceWorker.register).mockRejectedValueOnce(
      new Error('SecurityError: The operation is insecure.'),
    )

    const registered = await swService.register('/sw.js', '/')
    expect(registered).toBe(false)
  })

  it('handles PING / PONG heartbeat health check exchange', async () => {
    // Mock MessageChannel for ping
    const mockPort1: any = { onmessage: null }
    const mockPort2: any = {}

    class MockMessageChannel {
      port1 = mockPort1
      port2 = mockPort2
    }

    vi.stubGlobal('MessageChannel', MockMessageChannel)

    mockController.postMessage.mockImplementation((msg: any, ports: any[]) => {
      if (msg.type === 'PING' && ports && ports[0] === mockPort2) {
        setTimeout(() => {
          mockPort1.onmessage?.({
            data: { type: 'PONG', version: 'v1.0.0', activeStreams: 0, timestamp: Date.now() },
          })
        }, 10)
      }
    })

    const isAlive = await swService.ping()
    expect(isAlive).toBe(true)
    expect(mockController.postMessage).toHaveBeenCalledWith({ type: 'PING' }, [mockPort2])
  })

  it('returns false when PING times out or controller is missing', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { controller: null },
    })

    const isAlive = await swService.ping()
    expect(isAlive).toBe(false)
  })

  it('registers one-time volatile stream tickets with unique streamIds without URL token exposure', async () => {
    const ticket: StreamTicket = {
      bucket: 'test-studio-vault-2026',
      object: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
      userProject: 'basingse-media-dl-1234',
      token: 'ya29.secret-volatile-ram-token',
      filename: 'reel04_cam_A_raw.mxf',
      size: 104857600,
      expectedCrc32c: 'aB3d==',
    }

    const streamId = await swService.registerStreamTicket(ticket)

    expect(streamId).toMatch(/^sw_stream_\d+_[a-z0-9]+$/)
    expect(mockController.postMessage).toHaveBeenCalledWith({
      type: 'REGISTER_STREAM',
      streamId,
      ticket,
    })
  })

  it('creates hidden <iframe> tag and navigates to /sw-pipe/:streamId/:filename', () => {
    const appendChildSpy = vi.spyOn(document.body, 'appendChild')

    swService.triggerDownload('sw_stream_123', 'my_video.mxf')

    expect(appendChildSpy).toHaveBeenCalled()
    const addedElement = appendChildSpy.mock.calls[0][0] as HTMLIFrameElement
    expect(addedElement.tagName).toBe('IFRAME')
    expect(addedElement.src).toContain('/sw-pipe/sw_stream_123/my_video.mxf')
    expect(addedElement.style.display).toBe('none')
  })

  it('subscribes to SW_STREAM_PROGRESS and SW_STREAM_COMPLETE events', async () => {
    await swService.register()
    const progressSpy = vi.fn()
    const completeSpy = vi.fn()
    const streamId = 'sw_stream_test_001'

    const unsubscribe = swService.subscribe(streamId, {
      onProgress: progressSpy,
      onComplete: completeSpy,
    })

    // Simulate progress message from Service Worker
    for (const listener of messageListeners) {
      listener({
        data: {
          type: 'SW_STREAM_PROGRESS',
          streamId,
          loadedBytes: 52428800,
          totalBytes: 104857600,
          percentage: 50,
        },
      })
    }

    expect(progressSpy).toHaveBeenCalledWith({
      streamId,
      loadedBytes: 52428800,
      totalBytes: 104857600,
      percentage: 50,
    })

    // Simulate complete message from Service Worker
    for (const listener of messageListeners) {
      listener({
        data: {
          type: 'SW_STREAM_COMPLETE',
          streamId,
        },
      })
    }

    expect(completeSpy).toHaveBeenCalled()

    // Test unsubscribe
    unsubscribe()
    progressSpy.mockClear()

    for (const listener of messageListeners) {
      listener({
        data: {
          type: 'SW_STREAM_PROGRESS',
          streamId,
          loadedBytes: 75000000,
          totalBytes: 104857600,
          percentage: 75,
        },
      })
    }

    expect(progressSpy).not.toHaveBeenCalled()
  })

  it('sends ABORT_STREAM message on user cancellation', () => {
    swService.abortStream('sw_stream_to_abort')

    expect(mockController.postMessage).toHaveBeenCalledWith({
      type: 'ABORT_STREAM',
      streamId: 'sw_stream_to_abort',
    })
  })

  it('purges all active streams on CLEAR_STREAMS signal', () => {
    swService.purgeAllStreams()

    expect(mockController.postMessage).toHaveBeenCalledWith({
      type: 'CLEAR_STREAMS',
    })
  })

  it('retrieves diagnostic status information', async () => {
    await swService.register()
    const status = await swService.getStatus()

    expect(status.isRegistered).toBe(true)
    expect(status.isActive).toBe(true)
    expect(status.version).toBe('v1.0.0')
    expect(typeof status.activeStreamsCount).toBe('number')
  })
})
