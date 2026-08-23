import { swService } from '../services/swService'
import { StreamProgress, StreamTicket } from '../types/stream'

export { type StreamTicket, type StreamProgress }

/**
 * Engine 4: Resilient Service Worker Streaming Download Engine
 * Coordinates ephemeral ticket registration, keep-alive heartbeat watchdog,
 * and synthetic browser download dispatch for native browser download manager integration.
 */
export class ResilientSWStreamEngine {
  private static activeStreamId: string | null = null

  /**
   * Registers stream ticket with Service Worker and launches native browser download.
   */
  public static async streamToBrowser(options: {
    bucketName: string
    objectName: string
    suggestedFilename: string
    totalBytes: number
    userProject: string
    oauthToken: string
    expectedCrc32c?: string
    onProgress?: (p: any) => void
    abortSignal?: AbortSignal
  }): Promise<string> {
    const {
      bucketName,
      objectName,
      suggestedFilename,
      totalBytes,
      userProject,
      oauthToken,
      expectedCrc32c,
      onProgress,
      abortSignal,
    } = options

    if (!swService.isSupported()) {
      throw new Error('Service Worker API is not supported in this browser.')
    }

    const cleanBucket = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '')
    const cleanObject = objectName.replace(/^\/+/, '')
    const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
      cleanBucket,
    )}/o/${encodeURIComponent(cleanObject)}?alt=media&userProject=${encodeURIComponent(userProject)}`

    const streamId = `sw-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.activeStreamId = streamId

    const ticket: StreamTicket = {
      streamId,
      bucket: cleanBucket,
      object: cleanObject,
      url: mediaUrl,
      filename: suggestedFilename,
      totalBytes,
      userProject,
      token: oauthToken,
      oauthToken,
      expectedCrc32c,
    }

    // 1. Register ticket with SW
    await swService.register()
    await swService.registerStreamTicket(ticket)

    // 2. Start Keep-Alive Watchdog
    this.startKeepAlive(streamId)

    // 3. Handle Abort Signal
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        this.abortStream(streamId)
        onProgress?.({
          streamId,
          loadedBytes: 0,
          totalBytes: 0,
          percentage: 0,
          speedBytesPerSec: 0,
          etaSeconds: 0,
          elapsedSeconds: 0,
          fixedMemoryHeapMB: 0,
          status: 'cancelled',
        })
      })
    }

    // 4. Trigger native browser download shelf
    swService.triggerDownload(streamId, suggestedFilename)

    return streamId
  }

  /**
   * Starts the 10-second keep-alive heartbeat loop.
   */
  public static startKeepAlive(streamId: string): void {
    this.stopKeepAlive()
    this.activeStreamId = streamId
    swService.startKeepAlive(streamId)
  }

  /**
   * Stops the keep-alive heartbeat loop.
   */
  public static stopKeepAlive(): void {
    if (this.activeStreamId) {
      swService.stopKeepAlive(this.activeStreamId)
      this.activeStreamId = null
    }
  }

  /**
   * Aborts an in-flight stream.
   */
  public static abortStream(streamId: string): void {
    this.stopKeepAlive()
    swService.abortStream(streamId)
  }
}
