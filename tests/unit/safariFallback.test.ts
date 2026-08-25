import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BrowserCapabilityDetector,
  StreamDownloadService,
  streamDownloadService,
} from '../../src/services/streamDownloadService'
import { swService } from '../../src/services/swService'
import { DownloadProgressTelemetry, StreamDownloadError } from '../../src/types/stream'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { CliGeneratorEngine } from '../../src/engines/cli'

describe('Cross-Browser Fallbacks & Multi-Strategy Downloader (Safari SW, Memory Blob, Firefox CLI)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('BrowserCapabilityDetector', () => {
    it('detects Chromium browser signatures with showSaveFilePicker', () => {
      vi.stubGlobal('window', {
        showSaveFilePicker: vi.fn(),
      })
      vi.stubGlobal('navigator', {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        vendor: 'Google Inc.',
        serviceWorker: {},
      })

      expect(BrowserCapabilityDetector.isFSAASupported()).toBe(true)
      expect(BrowserCapabilityDetector.isSafari()).toBe(false)
      expect(BrowserCapabilityDetector.isFirefox()).toBe(false)
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('service_worker')
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024, 'fsaa')).toBe('fsaa')
    })

    it('detects Apple Safari (WebKit) without Chromium tokens', () => {
      vi.stubGlobal('window', {})
      vi.stubGlobal('navigator', {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        vendor: 'Apple Computer, Inc.',
        serviceWorker: {},
      })

      expect(BrowserCapabilityDetector.isFSAASupported()).toBe(false)
      expect(BrowserCapabilityDetector.isSafari()).toBe(true)
      expect(BrowserCapabilityDetector.isFirefox()).toBe(false)
      expect(BrowserCapabilityDetector.isServiceWorkerStreamSupported()).toBe(true)

      // <200MB -> memory_blob
      expect(BrowserCapabilityDetector.resolveStrategy(50 * 1024 * 1024)).toBe('memory_blob')
      // >=200MB -> service_worker
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('service_worker')
    })

    it('detects Mozilla Firefox (Gecko engine)', () => {
      vi.stubGlobal('window', {})
      vi.stubGlobal('navigator', {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        vendor: '',
      })

      expect(BrowserCapabilityDetector.isFSAASupported()).toBe(false)
      expect(BrowserCapabilityDetector.isSafari()).toBe(false)
      expect(BrowserCapabilityDetector.isFirefox()).toBe(true)

      // <200MB -> memory_blob
      expect(BrowserCapabilityDetector.resolveStrategy(50 * 1024 * 1024)).toBe('memory_blob')
      // >=200MB -> cli_companion
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('cli_companion')
    })

    it('respects forceStrategy parameter override', () => {
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024, 'service_worker')).toBe(
        'service_worker',
      )
      expect(BrowserCapabilityDetector.resolveStrategy(10 * 1024 * 1024, 'cli_companion')).toBe(
        'cli_companion',
      )
    })
  })

  describe('Safari Service Worker Stream Pipeline (downloadFileServiceWorker)', () => {
    it('registers ticket, wires progress subscription, and dispatches synthetic download click', async () => {
      const mockRegister = vi.spyOn(swService, 'register').mockResolvedValue(true)
      const mockRegisterTicket = vi
        .spyOn(swService, 'registerStreamTicket')
        .mockResolvedValue('sw_stream_safari_001')
      const mockTriggerDownload = vi.spyOn(swService, 'triggerDownload').mockImplementation(() => {})

      let progressCb: any = null
      let completeCb: any = null
      vi.spyOn(swService, 'subscribe').mockImplementation((_id, callbacks) => {
        progressCb = callbacks.onProgress
        completeCb = callbacks.onComplete
        return () => {}
      })

      const asset = {
        id: 'asset-safari-01',
        name: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
        displayName: 'reel04_cam_A_raw.mxf',
        sizeBytes: 1048576000, // ~1GB
        crc32c: 'aB3d==',
        bucket: 'test-studio-vault-2026',
      }

      const telemetry: DownloadProgressTelemetry[] = []

      const downloadPromise = streamDownloadService.downloadFileServiceWorker(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.valid-token-safari',
        expectedCrc32c: asset.crc32c,
        onProgress: (p) => telemetry.push(p),
      })

      // Allow registration and ticket setup promise to tick
      await new Promise((r) => setTimeout(r, 10))

      expect(mockRegister).toHaveBeenCalled()
      expect(mockRegisterTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'test-studio-vault-2026',
          object: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
          userProject: 'basingse-media-dl-1234',
          token: 'ya29.valid-token-safari',
        }),
      )
      expect(mockTriggerDownload).toHaveBeenCalledWith('sw_stream_safari_001', 'reel04_cam_A_raw.mxf')

      // Simulate intermediate progress
      progressCb?.({
        streamId: 'sw_stream_safari_001',
        loadedBytes: 524288000,
        totalBytes: 1048576000,
        percentage: 50,
      })

      // Simulate completion
      completeCb?.()

      const result = await downloadPromise

      expect(result.success).toBe(true)
      expect(result.status).toBe('completed')
      expect(result.strategy).toBe('service_worker')
      expect(result.bytesDownloaded).toBe(1048576000)
      expect(result.integrityVerified).toBe(true)

      expect(telemetry.length).toBeGreaterThanOrEqual(2)
      const last = telemetry[telemetry.length - 1]
      expect(last.strategy).toBe('service_worker')
      expect(last.memoryHeapMB).toBe(11.4) // Constant bounded heap
    })

    it('handles cancellation in Service Worker streaming via abortStream', async () => {
      vi.spyOn(swService, 'register').mockResolvedValue(true)
      vi.spyOn(swService, 'registerStreamTicket').mockResolvedValue('sw_stream_to_cancel')
      vi.spyOn(swService, 'triggerDownload').mockImplementation(() => {})
      const mockAbort = vi.spyOn(swService, 'abortStream').mockImplementation(() => {})

      const abortController = new AbortController()

      const asset = {
        id: 'asset-safari-cancel',
        name: 'video.mxf',
        displayName: 'video.mxf',
        sizeBytes: 500000000,
        bucket: 'test-studio-vault-2026',
      }

      const downloadPromise = streamDownloadService.downloadFileServiceWorker(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.valid-token-safari',
        abortSignal: abortController.signal,
      })

      abortController.abort()

      const result = await downloadPromise
      expect(result.status).toBe('cancelled')
      expect(result.strategy).toBe('service_worker')
      expect(mockAbort).toHaveBeenCalledWith('sw_stream_to_cancel')
    })
  })

  describe('Universal In-Memory Blob Fallback (downloadFileMemoryBlob)', () => {
    it('executes in-memory blob download and verifies CRC32c parity for <200MB assets', async () => {
      const chunk1 = new Uint8Array([10, 20, 30, 40, 50])
      const chunk2 = new Uint8Array([60, 70, 80, 90, 100])
      const totalBytes = chunk1.length + chunk2.length

      const crcEngine = new CRC32cIntegrityEngine()
      crcEngine.update(chunk1)
      crcEngine.update(chunk2)
      const expectedCrc32c = crcEngine.digestBase64()

      let index = 0
      const chunks = [chunk1, chunk2]
      const mockStream = new ReadableStream({
        async pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(chunks[index++])
          } else {
            controller.close()
          }
        },
      })

      const mockResponse = new Response(mockStream, {
        status: 200,
        headers: {
          'content-length': String(totalBytes),
          'x-goog-hash': `crc32c=${expectedCrc32c}`,
        },
      })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock-blob-uuid'),
        revokeObjectURL: vi.fn(),
      })

      const asset = {
        id: 'small-asset-01',
        name: 'document.pdf',
        displayName: 'document.pdf',
        sizeBytes: totalBytes,
        crc32c: expectedCrc32c,
        bucket: 'test-studio-vault-2026',
        contentType: 'application/pdf',
      }

      const telemetry: DownloadProgressTelemetry[] = []

      const result = await streamDownloadService.downloadFileMemoryBlob(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'basingse-media-dl-1234',
        oauthToken: 'ya29.valid-token-small',
        expectedCrc32c,
        onProgress: (p) => telemetry.push(p),
      })

      expect(result.success).toBe(true)
      expect(result.status).toBe('completed')
      expect(result.strategy).toBe('memory_blob')
      expect(result.bytesDownloaded).toBe(totalBytes)
      expect(result.crc32cBase64).toBe(expectedCrc32c)
      expect(result.integrityVerified).toBe(true)

      expect(telemetry.length).toBeGreaterThan(1)
      const streamingEvent = telemetry.find((t) => t.loadedBytes > 0 && t.status === 'streaming')
      expect(streamingEvent?.strategy).toBe('memory_blob')
      expect(streamingEvent?.memoryHeapMB).toBeGreaterThan(11.4) // Shows dynamically calculated memory usage
    })

    it('strictly rejects assets >=200MB with FILE_TOO_LARGE_FOR_BLOB error', async () => {
      const massiveAsset = {
        id: 'massive-asset-01',
        name: 'massive_render.mxf',
        displayName: 'massive_render.mxf',
        sizeBytes: 250 * 1024 * 1024, // 250MB (>200MB limit)
        bucket: 'test-studio-vault-2026',
      }

      await expect(
        streamDownloadService.downloadFileMemoryBlob(massiveAsset, {
          bucketName: massiveAsset.bucket,
          objectName: massiveAsset.name,
          userProject: 'basingse-media-dl-1234',
          oauthToken: 'ya29.valid-token',
        }),
      ).rejects.toThrow(StreamDownloadError)

      await expect(
        streamDownloadService.downloadFileMemoryBlob(massiveAsset, {
          bucketName: massiveAsset.bucket,
          objectName: massiveAsset.name,
          userProject: 'basingse-media-dl-1234',
          oauthToken: 'ya29.valid-token',
        }),
      ).rejects.toThrow(/exceeds 200 MB memory limit/)
    })
  })

  describe('Unified Download Dispatcher (downloadFile)', () => {
    it('dispatches to CLI Companion error on Firefox for large files (>=200MB)', async () => {
      vi.stubGlobal('window', {})
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      })

      const largeAsset = {
        id: 'large-firefox-asset',
        name: 'render_master.tar',
        displayName: 'render_master.tar',
        sizeBytes: 500 * 1024 * 1024, // 500MB
        bucket: 'test-studio-vault-2026',
      }

      await expect(
        streamDownloadService.downloadFile(largeAsset, {
          bucketName: largeAsset.bucket,
          objectName: largeAsset.name,
          userProject: 'basingse-media-dl-1234',
          oauthToken: 'ya29.token',
        }),
      ).rejects.toThrow('Direct browser streaming is not supported for large files in Firefox. Please use CLI Companion.')
    })
  })

  describe('CLI Command Generator cURL Output', () => {
    it('constructs syntactically valid single-item cURL commands with billing attribution', () => {
      const curl = CliGeneratorEngine.generateCurlCommand({
        bucketName: 'gs://partner-bucket',
        selectedPaths: ['folder/video.mxf'],
        userProject: 'client-vfx-billing',
        oauthToken: 'ya29.synthetic-token',
      })

      expect(curl).toContain('curl -X GET')
      expect(curl).toContain('https://storage.googleapis.com/storage/v1/b/partner-bucket/o/folder%2Fvideo.mxf?alt=media&userProject=client-vfx-billing')
      expect(curl).toContain('-H "Authorization: Bearer ya29.synthetic-token"')
      expect(curl).toContain('-o "video.mxf"')
    })
  })
})
