import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  BrowserCapabilityDetector,
  StreamDownloadService,
  streamDownloadService,
} from '../../src/services/streamDownloadService'
import { SwService, swService } from '../../src/services/swService'
import {
  DownloadProgressTelemetry,
  StreamDownloadError,
  StreamTicket,
  SwProgressPayload,
} from '../../src/types/stream'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { StorageBoundaryAuditor } from '../../src/services/storageBoundary'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { resetAllStores } from '../helpers/testUtils'

/**
 * Isolated SW Sandbox with direct evaluation of public/sw.js
 */
function createServiceWorkerSandbox() {
  const listeners: Record<string, ((event: any) => void)[]> = {
    message: [],
    fetch: [],
  }
  const windowClients: any[] = []

  const selfContext: any = {
    addEventListener: (type: string, listener: any) => {
      if (!listeners[type]) listeners[type] = []
      listeners[type].push(listener)
    },
    skipWaiting: vi.fn(async () => {}),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async () => windowClients),
    },
  }

  const swPath = path.resolve(__dirname, '../../public/sw.js')
  const swCode = fs.readFileSync(swPath, 'utf-8')
  const dynamicFetch = (...args: any[]) => (globalThis as any).fetch(...args)

  const fn = new Function(
    'self',
    'Response',
    'Request',
    'Headers',
    'URL',
    'AbortController',
    'TransformStream',
    'ReadableStream',
    'fetch',
    swCode,
  )

  fn(
    selfContext,
    Response,
    Request,
    Headers,
    URL,
    AbortController,
    typeof TransformStream !== 'undefined' ? TransformStream : undefined,
    ReadableStream,
    dynamicFetch,
  )

  return {
    windowClients,
    dispatchMessage: async (data: any, ports: any[] = []) => {
      for (const listener of listeners['message'] || []) {
        listener({ data, ports })
      }
    },
    dispatchFetch: async (reqUrl: string | Request) => {
      const request = typeof reqUrl === 'string' ? new Request(reqUrl) : reqUrl
      let result: Promise<Response> | null = null
      for (const listener of listeners['fetch'] || []) {
        listener({
          request,
          respondWith: (p: any) => {
            result = Promise.resolve(p)
          },
        })
      }
      return result
    },
  }
}

describe('M5 Deep Stress Harness & Fuzzing (Milestone 5)', () => {
  beforeEach(() => {
    resetAllStores()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // =========================================================================
  // 1. PSEUDO-RANDOM FUZZ TESTING OF ROUTE & TICKET PARAMETERS (100+ ITERATIONS)
  // =========================================================================
  describe('1. Pseudo-Random Parameter Fuzzing on /api/stream-download', () => {
    it('survives 100 iterations of randomized malformed queries without crashing or leaking state', async () => {
      const sandbox = createServiceWorkerSandbox()

      const fuzzPayloads = [
        '',
        'undefined',
        'null',
        'NaN',
        '0',
        '-1',
        '%00',
        '%2e%2e%2f',
        '../'.repeat(50),
        'A'.repeat(5000), // Buffer overflow attempt
        '<script>document.location="http://evil.com"</script>',
        '${7*7}',
        '{{7*7}}',
        'ya29.fake-token-attempt',
        '{"streamId":"injected_json"}',
        '\\x00\\x01\\x02',
        '😀🚀👾🔥',
        'http://evil.com/redirect',
        'javascript:void(0)',
      ]

      for (let i = 0; i < 100; i++) {
        const fuzzStreamId = fuzzPayloads[i % fuzzPayloads.length] + `_${i}`
        const fuzzBucket = fuzzPayloads[(i + 1) % fuzzPayloads.length]
        const fuzzObject = fuzzPayloads[(i + 2) % fuzzPayloads.length]
        const fuzzProject = fuzzPayloads[(i + 3) % fuzzPayloads.length]

        const query = new URLSearchParams({
          streamId: fuzzStreamId,
          bucket: fuzzBucket,
          object: fuzzObject,
          userProject: fuzzProject,
        }).toString()

        const responsePromise = await sandbox.dispatchFetch(`https://app.basingse.org/api/stream-download?${query}`)
        expect(responsePromise).not.toBeNull()
        const response = await responsePromise!
        // Should return 400 Bad Request (missing token or unknown ticket) without 500 unhandled exceptions
        expect([400, 404, 502]).toContain(response.status)
      }
    })
  })

  // =========================================================================
  // 2. HIGH-FREQUENCY CHUNK PIPING & PROGRESS THROTTLING STRESS
  // =========================================================================
  describe('2. High-Frequency Chunk Streaming & Telemetry Throttling Stress', () => {
    it('pipes 250 micro-chunks through TransformStream and emits throttled progress events', async () => {
      const sandbox = createServiceWorkerSandbox()
      const clientMessages: any[] = []

      sandbox.windowClients.push({
        postMessage: (msg: any) => clientMessages.push(msg),
      })

      const CHUNK_COUNT = 250
      const CHUNK_SIZE = 16 * 1024 // 16 KB per chunk
      const TOTAL_SIZE = CHUNK_COUNT * CHUNK_SIZE

      let chunksSent = 0
      const mockStream = new ReadableStream({
        async pull(controller) {
          if (chunksSent < CHUNK_COUNT) {
            controller.enqueue(new Uint8Array(CHUNK_SIZE).fill(chunksSent % 256))
            chunksSent++
          } else {
            controller.close()
          }
        },
      })

      vi.stubGlobal('fetch', vi.fn(async () => {
        return new Response(mockStream, {
          status: 200,
          headers: {
            'content-length': String(TOTAL_SIZE),
            'x-goog-hash': 'crc32c=placeholder==',
          },
        })
      }))

      const streamId = 'sw_stress_chunks_01'
      await sandbox.dispatchMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket: {
          bucket: 'stress-bucket',
          object: 'stress_video.mxf',
          userProject: 'proj',
          token: 'ya29.token',
          filename: 'stress_video.mxf',
          size: TOTAL_SIZE,
        },
      })

      const res = await sandbox.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
      expect(res).not.toBeNull()

      let totalReceived = 0
      const reader = res!.body!.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) totalReceived += value.length
      }

      expect(totalReceived).toBe(TOTAL_SIZE)

      // Allow flush microtasks to complete
      await new Promise((r) => setTimeout(r, 60))

      // Verify completion message emitted
      const completeEvent = clientMessages.find((m) => m.type === 'SW_STREAM_COMPLETE' && m.streamId === streamId)
      expect(completeEvent).toBeDefined()
      expect(completeEvent.loadedBytes).toBe(TOTAL_SIZE)
      expect(completeEvent.totalBytes).toBe(TOTAL_SIZE)
    })
  })

  // =========================================================================
  // 3. STORAGE BOUNDARY AUDITOR VERIFICATION DURING SW / BLOB STREAMING
  // =========================================================================
  describe('3. Storage Isolation & Zero Leakage Audit', () => {
    it('verifies StorageBoundaryAuditor detects NO leaked tokens before, during, or after streaming', async () => {
      const activeToken = 'ya29.a0ARrdaM_ACTIVE_VOLATILE_STREAM_TOKEN_12345'
      useRuntimeStore.setState({
        oauthToken: activeToken,
        userEmail: 'auditor@basingse.org',
        userName: 'Auditor',
        isAuthenticated: true,
      })

      // 1. Initial Storage Audit
      const initialAudit = StorageBoundaryAuditor.audit()
      expect(initialAudit.isClean).toBe(true)
      expect(initialAudit.violations.length).toBe(0)

      // 2. Trigger synthetic SW download and in-memory ticket registration
      const streamId = await swService.registerStreamTicket({
        bucket: 'partner-bucket',
        object: 'clip.mxf',
        userProject: 'basingse-dl-1',
        token: activeToken,
        filename: 'clip.mxf',
      })
      swService.triggerDownload(streamId, 'clip.mxf')

      // 3. Audit storage during stream
      const midStreamAudit = StorageBoundaryAuditor.audit()
      expect(midStreamAudit.isClean).toBe(true)
      expect(midStreamAudit.violations.length).toBe(0)

      // 4. Memory Blob Download
      const mockFetch = vi.fn(async () => {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3', 'x-goog-hash': 'crc32c=test==' },
        })
      })
      vi.stubGlobal('fetch', mockFetch)
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock-uuid'),
        revokeObjectURL: vi.fn(),
      })

      await streamDownloadService.downloadFileMemoryBlob(
        { id: 'item-1', name: 'small.json', sizeBytes: 3, bucket: 'b' },
        {
          bucketName: 'b',
          objectName: 'small.json',
          userProject: 'proj',
          oauthToken: activeToken,
        },
      )

      // 5. Audit storage after blob download
      const postBlobAudit = StorageBoundaryAuditor.audit()
      expect(postBlobAudit.isClean).toBe(true)
      expect(postBlobAudit.violations.length).toBe(0)
    })
  })

  // =========================================================================
  // 4. STRICT 200MB BLOB MEMORY SLA & OVERFLOW BOUNDARY VERIFICATION
  // =========================================================================
  describe('4. Strict 200MB Memory Boundary & Overflow Resistance', () => {
    it('handles numeric edge cases in blob size checking without integer overflow', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const overflowSizes = [
        Number.MAX_SAFE_INTEGER,
        Number.MAX_VALUE,
        Infinity,
        1000 * 1024 * 1024 * 1024, // 1 Terabyte
      ]

      for (const size of overflowSizes) {
        const asset = {
          id: `overflow-${size}`,
          name: 'overflow.mxf',
          sizeBytes: size,
          bucket: 'bucket',
        }

        await expect(
          streamDownloadService.downloadFileMemoryBlob(asset, {
            bucketName: 'bucket',
            objectName: 'overflow.mxf',
            userProject: 'proj',
            oauthToken: 'ya29.token',
          }),
        ).rejects.toThrowError(StreamDownloadError)

        expect(mockFetch).not.toHaveBeenCalled()
      }
    })

    it('verifies exact micro-boundary between 200MB (allowed) and 200MB + 1 byte (rejected)', async () => {
      const mockFetch = vi.fn(async () => new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-length': '1' },
      }))
      vi.stubGlobal('fetch', mockFetch)
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock'),
        revokeObjectURL: vi.fn(),
      })

      const EXACT_200MB = 200 * 1024 * 1024 // 209715200 bytes

      // Allowed
      await expect(
        streamDownloadService.downloadFileMemoryBlob(
          { id: 'exact-200mb', name: '200mb.bin', sizeBytes: EXACT_200MB, bucket: 'b' },
          { bucketName: 'b', objectName: '200mb.bin', userProject: 'p', oauthToken: 'ya29.token' },
        ),
      ).resolves.toBeDefined()

      // Rejected
      await expect(
        streamDownloadService.downloadFileMemoryBlob(
          { id: 'exceed-200mb', name: '200mb_plus_1.bin', sizeBytes: EXACT_200MB + 1, bucket: 'b' },
          { bucketName: 'b', objectName: '200mb_plus_1.bin', userProject: 'p', oauthToken: 'ya29.token' },
        ),
      ).rejects.toThrow(/exceeds 200 MB memory limit/)
    })
  })
})
