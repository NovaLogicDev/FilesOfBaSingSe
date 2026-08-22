import { StreamTicket, SwProgressPayload, SwStatusInfo } from '../types/stream'
import { ObservabilityService } from './observability'

/**
 * Service Worker Lifecycle & Stream Interceptor Manager
 * Coordinates registration, stream ticket passing over volatile memory, keep-alive ping,
 * and synthetic browser download dispatch for Safari (WebKit).
 */
export class SwService {
  private static instance: SwService
  private registration: ServiceWorkerRegistration | null = null
  private progressListeners = new Map<string, (payload: SwProgressPayload) => void>()
  private completionListeners = new Map<string, () => void>()
  private errorListeners = new Map<string, (error: string) => void>()
  private messageHandler = (event: MessageEvent) => this.handleMessage(event)

  public static getInstance(): SwService {
    if (!SwService.instance) {
      SwService.instance = new SwService()
    }
    return SwService.instance
  }

  /**
   * Checks if Service Worker API is available in current browser environment.
   */
  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  }

  /**
   * Registers sw.js with root scope '/' and binds incoming message dispatcher.
   */
  public async register(scriptUrl = '/sw.js', scope = '/'): Promise<boolean> {
    if (!this.isSupported()) {
      ObservabilityService.warn('SERVICE_WORKER', 'Service Worker API not supported in this runtime.')
      return false
    }

    try {
      this.registration = await navigator.serviceWorker.register(scriptUrl, { scope })
      await navigator.serviceWorker.ready

      if (typeof navigator.serviceWorker.removeEventListener === 'function') {
        navigator.serviceWorker.removeEventListener('message', this.messageHandler)
      }
      navigator.serviceWorker.addEventListener('message', this.messageHandler)

      ObservabilityService.info('SERVICE_WORKER', `Registered download interceptor scope=${scope}`)
      return true
    } catch (err: any) {
      ObservabilityService.error('SERVICE_WORKER', `Service Worker registration failed: ${err.message}`)
      return false
    }
  }

  /**
   * Health-check ping to the active Service Worker via MessageChannel.
   */
  public async ping(): Promise<boolean> {
    if (!this.isSupported() || !navigator.serviceWorker.controller) {
      return false
    }

    return new Promise((resolve) => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => resolve(false), 1500)

      channel.port1.onmessage = (event) => {
        clearTimeout(timer)
        if (event.data?.type === 'PONG') {
          resolve(true)
        } else {
          resolve(false)
        }
      }

      try {
        navigator.serviceWorker.controller!.postMessage({ type: 'PING' }, [channel.port2])
      } catch {
        clearTimeout(timer)
        resolve(false)
      }
    })
  }

  /**
   * Registers a volatile in-memory stream ticket and returns a unique streamId.
   * Access tokens are NEVER placed in URLs.
   */
  public async registerStreamTicket(ticket: StreamTicket): Promise<string> {
    const streamId = `sw_stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    if (this.isSupported() && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket,
      })
    }

    return streamId
  }

  /**
   * Triggers browser download by appending a synthetic <a> link and clicking it.
   */
  public triggerDownload(streamId: string, filename: string): void {
    if (typeof document === 'undefined') return

    const downloadUrl = `/api/stream-download?streamId=${encodeURIComponent(
      streamId,
    )}&filename=${encodeURIComponent(filename)}`

    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link)
      }
    }, 2000)
  }

  /**
   * Sends abort signal to Service Worker for a specific stream.
   */
  public abortStream(streamId: string): void {
    if (this.isSupported() && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'ABORT_STREAM',
        streamId,
      })
    }
    this.progressListeners.delete(streamId)
    this.completionListeners.delete(streamId)
    this.errorListeners.delete(streamId)
  }

  /**
   * Subscribes to lifecycle progress and completion events for a streamId.
   */
  public subscribe(
    streamId: string,
    callbacks: {
      onProgress?: (payload: SwProgressPayload) => void
      onComplete?: () => void
      onError?: (error: string) => void
    },
  ): () => void {
    if (callbacks.onProgress) this.progressListeners.set(streamId, callbacks.onProgress)
    if (callbacks.onComplete) this.completionListeners.set(streamId, callbacks.onComplete)
    if (callbacks.onError) this.errorListeners.set(streamId, callbacks.onError)

    return () => {
      this.progressListeners.delete(streamId)
      this.completionListeners.delete(streamId)
      this.errorListeners.delete(streamId)
    }
  }

  /**
   * Dispatches incoming Service Worker messages to registered subscribers.
   */
  private handleMessage(event: MessageEvent): void {
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.type === 'SW_STREAM_PROGRESS' && data.streamId) {
      const listener = this.progressListeners.get(data.streamId)
      listener?.({
        streamId: data.streamId,
        loadedBytes: data.loadedBytes,
        totalBytes: data.totalBytes,
        percentage: data.percentage,
      })
    }

    if (data.type === 'SW_STREAM_COMPLETE' && data.streamId) {
      const listener = this.completionListeners.get(data.streamId)
      listener?.()
    }

    if (data.type === 'SW_STREAM_ERROR' && data.streamId) {
      const listener = this.errorListeners.get(data.streamId)
      listener?.(data.error || 'Stream error occurred in Service Worker.')
    }
  }

  /**
   * Purges all active streams (e.g. on sign-out / volatile memory purge).
   */
  public purgeAllStreams(): void {
    if (this.isSupported() && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_STREAMS' })
    }
    this.progressListeners.clear()
    this.completionListeners.clear()
    this.errorListeners.clear()
  }

  /**
   * Retrieves diagnostic status of the Service Worker.
   */
  public async getStatus(): Promise<SwStatusInfo> {
    const isActive = Boolean(
      this.isSupported() && navigator.serviceWorker.controller,
    )
    return {
      isRegistered: Boolean(this.registration),
      isActive,
      version: 'v1.0.0',
      activeStreamsCount: this.progressListeners.size,
    }
  }
}

export const swService = SwService.getInstance()
