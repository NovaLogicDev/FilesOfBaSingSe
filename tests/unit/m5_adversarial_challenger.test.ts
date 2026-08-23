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
import { CliGeneratorEngine } from '../../src/engines/cli'
import { resetAllStores } from '../helpers/testUtils'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { UserProjectMissingError, GCSClientError } from '../../src/types/gcs'

/**
 * Helper to create an isolated Service Worker environment executing public/sw.js directly.
 * Uses dynamic fetch delegation to respect vitest stubGlobal mocks.
 */
function createServiceWorkerEnvironment() {
  const listeners: Record<string, ((event: any) => void)[]> = {
    install: [],
    activate: [],
    message: [],
    fetch: [],
  }

  const windowClients: any[] = []

  const selfContext: any = {
    addEventListener: (type: string, listener: (event: any) => void) => {
      if (!listeners[type]) listeners[type] = []
      listeners[type].push(listener)
    },
    skipWaiting: vi.fn(async () => {}),
    clients: {
      claim: vi.fn(async () => {}),
      matchAll: vi.fn(async (_opts?: any) => windowClients),
    },
  }

  // Read public/sw.js content directly from workspace
  const swPath = path.resolve(__dirname, '../../public/sw.js')
  const swCode = fs.readFileSync(swPath, 'utf-8')

  // Dynamic fetch wrapper that delegates to current globalThis.fetch
  const dynamicFetch = (...args: any[]) => (globalThis as any).fetch(...args)

  // Execute script in sandbox with selfContext as 'self'
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
    self: selfContext,
    listeners,
    windowClients,
    dispatchMessage: async (data: any, ports: any[] = [], source: any = null) => {
      const event = { data, ports, source }
      for (const listener of listeners['message'] || []) {
        listener(event)
      }
    },
    dispatchFetch: async (requestOrUrl: string | Request) => {
      const request = typeof requestOrUrl === 'string' ? new Request(requestOrUrl) : requestOrUrl
      let responded = false
      let responsePromise: Promise<Response> | null = null

      const event = {
        request,
        respondWith: (p: Promise<Response> | Response) => {
          responded = true
          responsePromise = Promise.resolve(p)
        },
      }

      for (const listener of listeners['fetch'] || []) {
        listener(event)
        if (responded) break
      }

      if (!responded) return null
      return responsePromise!
    },
  }
}

describe('M5 Challenger - Empirical Adversarial Stress Test Suite', () => {
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
  // 1. SERVICE WORKER DIRECT EXECUTION & ROUTE MANIPULATION FUZZING
  // =========================================================================
  describe('1. Service Worker Route Manipulation & Fuzzing (public/sw.js)', () => {
    it('ignores non-download endpoints without intercepting them', async () => {
      const env = createServiceWorkerEnvironment()
      const urls = [
        'https://app.basingse.org/index.html',
        'https://app.basingse.org/api/auth/token',
        'https://app.basingse.org/api/stream-download-extra',
        'https://app.basingse.org/storage/v1/b/bucket/o/obj',
        'https://app.basingse.org/api/stream-download/nested',
      ]

      for (const url of urls) {
        const response = await env.dispatchFetch(url)
        expect(response).toBeNull()
      }
    })

    it('rejects /api/stream-download requests with missing or empty streamId and no fallback params with 400 Bad Request', async () => {
      const env = createServiceWorkerEnvironment()
      const malformedUrls = [
        'https://app.basingse.org/api/stream-download',
        'https://app.basingse.org/api/stream-download?',
        'https://app.basingse.org/api/stream-download?streamId=',
        'https://app.basingse.org/api/stream-download?streamId=non_existent_stream_999',
        'https://app.basingse.org/api/stream-download?streamId=../../etc/passwd',
        'https://app.basingse.org/api/stream-download?streamId=%00%00',
        'https://app.basingse.org/api/stream-download?streamId=<script>alert(1)</script>',
      ]

      for (const url of malformedUrls) {
        const response = await env.dispatchFetch(url)
        expect(response).not.toBeNull()
        expect(response!.status).toBe(400)
        const body = await response!.json()
        expect(body.error).toContain('Missing required stream parameters')
      }
    })

    it('rejects partial fallback query parameters when any required param is missing', async () => {
      const env = createServiceWorkerEnvironment()
      const partialUrls = [
        // Missing token
        'https://app.basingse.org/api/stream-download?bucket=my-bucket&object=clip.mxf&userProject=proj-1',
        // Missing userProject
        'https://app.basingse.org/api/stream-download?bucket=my-bucket&object=clip.mxf&token=ya29.secret',
        // Missing object
        'https://app.basingse.org/api/stream-download?bucket=my-bucket&userProject=proj-1&token=ya29.secret',
        // Missing bucket
        'https://app.basingse.org/api/stream-download?object=clip.mxf&userProject=proj-1&token=ya29.secret',
      ]

      for (const url of partialUrls) {
        const response = await env.dispatchFetch(url)
        expect(response).not.toBeNull()
        expect(response!.status).toBe(400)
        const body = await response!.json()
        expect(body.error).toContain('Missing required stream parameters')
      }
    })

    it('forwards Range headers accurately to GCS upstream fetch', async () => {
      const env = createServiceWorkerEnvironment()
      let capturedFetchHeaders: Record<string, string> = {}
      let capturedFetchUrl = ''

      vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
        capturedFetchUrl = url
        capturedFetchHeaders = init.headers
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: {
            'content-length': '4',
            'content-range': 'bytes 100-103/1000',
            'x-goog-hash': 'crc32c=test==',
          },
        })
      }))

      // Register ticket
      const streamId = 'sw_stream_range_test'
      await env.dispatchMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket: {
          bucket: 'gs://partner-master-archives',
          object: 'folder/clip.mxf',
          userProject: 'billing-project-100',
          token: 'ya29.token-for-range',
          filename: 'clip.mxf',
          size: 1000,
        },
      })

      const req = new Request(`https://app.basingse.org/api/stream-download?streamId=${streamId}`, {
        headers: {
          Range: 'bytes=100-103',
        },
      })

      const res = await env.dispatchFetch(req)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(206)
      expect(capturedFetchHeaders['Range']).toBe('bytes=100-103')
      expect(capturedFetchHeaders['Authorization']).toBe('Bearer ya29.token-for-range')
      expect(capturedFetchUrl).toContain('storage.googleapis.com/storage/v1/b/partner-master-archives/o/folder%2Fclip.mxf?alt=media&userProject=billing-project-100')
    })

    it('handles GCS upstream error status codes (401, 403, 404, 500, 503) cleanly without crashing', async () => {
      const env = createServiceWorkerEnvironment()

      const testCases = [
        { gcsStatus: 401, gcsStatusText: 'Unauthorized', body: '{"error": {"message": "Invalid Credentials"}}' },
        { gcsStatus: 403, gcsStatusText: 'Forbidden', body: '{"error": {"message": "userProjectAccessDenied"}}' },
        { gcsStatus: 404, gcsStatusText: 'Not Found', body: '{"error": {"message": "Bucket not found"}}' },
        { gcsStatus: 500, gcsStatusText: 'Internal Server Error', body: '{"error": {"message": "Backend Error"}}' },
        { gcsStatus: 503, gcsStatusText: 'Service Unavailable', body: '{"error": {"message": "GCS Unavailable"}}' },
      ]

      for (const tc of testCases) {
        vi.stubGlobal('fetch', vi.fn(async () => {
          return new Response(tc.body, {
            status: tc.gcsStatus,
            statusText: tc.gcsStatusText,
            headers: { 'Content-Type': 'application/json' },
          })
        }))

        const streamId = `sw_stream_err_${tc.gcsStatus}`
        await env.dispatchMessage({
          type: 'REGISTER_STREAM',
          streamId,
          ticket: {
            bucket: 'test-bucket',
            object: 'test.mxf',
            userProject: 'proj',
            token: 'ya29.token',
            filename: 'test.mxf',
          },
        })

        const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
        expect(res).not.toBeNull()
        expect(res!.status).toBe(tc.gcsStatus)
        const text = await res!.text()
        expect(text).toBe(tc.body)
      }
    })

    it('handles network-level fetch failures and returns 502 Bad Gateway', async () => {
      const env = createServiceWorkerEnvironment()
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('Failed to fetch (DNS / Network failure)')
      }))

      const streamId = 'sw_stream_network_fail'
      await env.dispatchMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket: {
          bucket: 'test-bucket',
          object: 'test.mxf',
          userProject: 'proj',
          token: 'ya29.token',
          filename: 'test.mxf',
        },
      })

      const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(502)
      const text = await res!.text()
      expect(text).toContain('GCS network connection failure')
    })

    it('sanitizes Content-Disposition filename against header injection attacks (newlines, quotes, backslashes)', async () => {
      const env = createServiceWorkerEnvironment()
      vi.stubGlobal('fetch', vi.fn(async () => {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        })
      }))

      const dangerousFilenames = [
        'normal.mxf',
        'evil\r\nSet-Cookie: session=stolen.mxf',
        'file"with"quotes.mxf',
        'path\\with\\backslashes.mxf',
        'film_scene_01 (4K_Clean).mxf',
      ]

      for (let i = 0; i < dangerousFilenames.length; i++) {
        const streamId = `sw_stream_sec_${i}`
        const fn = dangerousFilenames[i]

        await env.dispatchMessage({
          type: 'REGISTER_STREAM',
          streamId,
          ticket: {
            bucket: 'test-bucket',
            object: 'test.mxf',
            userProject: 'proj',
            token: 'ya29.token',
            filename: fn,
          },
        })

        const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
        expect(res).not.toBeNull()
        const cd = res!.headers.get('Content-Disposition')
        expect(cd).toBeDefined()
        expect(cd).not.toContain('\r')
        expect(cd).not.toContain('\n')
        expect(cd).toContain('attachment;')
      }
    })
  })

  // =========================================================================
  // 2. TICKET TAMPERING, REPLAY ATTACKS, AND TICKET LIFECYCLE SECURITY
  // =========================================================================
  describe('2. Ticket Tampering, Replay & Lifecycle Security', () => {
    it('prevents replay attacks: ticket cannot be reused after stream completion', async () => {
      const env = createServiceWorkerEnvironment()

      vi.stubGlobal('fetch', vi.fn(async () => {
        return new Response(new Uint8Array([1, 2, 3, 4, 5]), {
          status: 200,
          headers: { 'content-length': '5' },
        })
      }))

      const streamId = 'sw_stream_single_use'
      await env.dispatchMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket: {
          bucket: 'test-bucket',
          object: 'clip.mxf',
          userProject: 'proj',
          token: 'ya29.token',
          filename: 'clip.mxf',
          size: 5,
        },
      })

      // 1st request succeeds and consumes ticket
      const firstRes = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
      expect(firstRes).not.toBeNull()
      expect(firstRes!.status).toBe(200)

      // Drain response body to trigger stream flush
      if (firstRes!.body) {
        const reader = firstRes!.body.getReader()
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      }

      // 2nd request with same streamId must fail because ticket was deleted
      const secondRes = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
      expect(secondRes).not.toBeNull()
      expect(secondRes!.status).toBe(400)
    })

    it('prevents replay attacks after explicit ABORT_STREAM', async () => {
      const env = createServiceWorkerEnvironment()

      const streamId = 'sw_stream_abort_test'
      await env.dispatchMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket: {
          bucket: 'test-bucket',
          object: 'clip.mxf',
          userProject: 'proj',
          token: 'ya29.token',
          filename: 'clip.mxf',
          size: 5,
        },
      })

      // Abort the stream
      await env.dispatchMessage({
        type: 'ABORT_STREAM',
        streamId,
      })

      // Request with aborted streamId must be rejected
      const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(400)
    })

    it('prevents attacker URL parameter override of in-memory ticket credentials', async () => {
      const env = createServiceWorkerEnvironment()
      let capturedUrl = ''
      let capturedAuth = ''

      vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
        capturedUrl = url
        capturedAuth = init.headers['Authorization']
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        })
      }))

      const streamId = 'sw_stream_legit'
      await env.dispatchMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket: {
          bucket: 'legitimate-vault-bucket',
          object: 'secure/raw_camera.mxf',
          userProject: 'legit-billing-project',
          token: 'ya29.legitimate-session-token',
          filename: 'raw_camera.mxf',
          size: 3,
        },
      })

      // Attacker crafts URL with manipulated query parameters
      const attackerUrl = `https://app.basingse.org/api/stream-download?streamId=${streamId}&bucket=attacker-bucket&object=stolen.mxf&userProject=attacker-billing&token=ya29.attacker-token`

      const res = await env.dispatchFetch(attackerUrl)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(200)

      // Verify that the Service Worker utilized the in-memory ticket values, NOT the attacker query parameters!
      expect(capturedUrl).toContain('b/legitimate-vault-bucket/o/secure%2Fraw_camera.mxf')
      expect(capturedUrl).toContain('userProject=legit-billing-project')
      expect(capturedAuth).toBe('Bearer ya29.legitimate-session-token')
      expect(capturedUrl).not.toContain('attacker')
      expect(capturedAuth).not.toContain('attacker')
    })

    it('CLEAR_STREAMS purges all registered tickets and aborts all active streams', async () => {
      const env = createServiceWorkerEnvironment()

      // Register 5 streams
      for (let i = 1; i <= 5; i++) {
        await env.dispatchMessage({
          type: 'REGISTER_STREAM',
          streamId: `sw_stream_batch_${i}`,
          ticket: {
            bucket: 'bucket',
            object: `file_${i}.mxf`,
            userProject: 'proj',
            token: 'ya29.token',
            filename: `file_${i}.mxf`,
          },
        })
      }

      // Check status via PING
      let pingPong: any = null
      const port: any = { postMessage: (msg: any) => { pingPong = msg } }
      await env.dispatchMessage({ type: 'PING' }, [port])
      expect(pingPong?.activeStreams).toBe(5)

      // Dispatch CLEAR_STREAMS
      await env.dispatchMessage({ type: 'CLEAR_STREAMS' }, [port])

      // Verify PING shows 0 active streams
      await env.dispatchMessage({ type: 'PING' }, [port])
      expect(pingPong?.activeStreams).toBe(0)

      // All 5 stream requests must now return 400
      for (let i = 1; i <= 5; i++) {
        const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=sw_stream_batch_${i}`)
        expect(res!.status).toBe(400)
      }
    })
  })

  // =========================================================================
  // 3. ZERO OAUTH TOKEN LEAKAGE VERIFICATION ACROSS ALL URLS & DOM
  // =========================================================================
  describe('3. Zero OAuth Token Leakage Verification', () => {
    it('guarantees SwService.triggerDownload creates URLs strictly devoid of tokens or secrets', () => {
      const appendedElements: HTMLElement[] = []
      vi.spyOn(document.body, 'appendChild').mockImplementation((el: any) => {
        appendedElements.push(el)
        return el
      })

      const sensitiveToken = 'ya29.a0ARrdaM_SUPER_SECRET_OAUTH_BEARER_TOKEN_NEVER_LEAK_IN_URL'
      const streamId = 'sw_stream_isolated_99'
      const filename = 'feature_reel_4k.mxf'

      swService.triggerDownload(streamId, filename)

      expect(appendedElements.length).toBe(1)
      const iframe = appendedElements[0] as HTMLIFrameElement
      expect(iframe.tagName).toBe('IFRAME')

      const parsedUrl = new URL(iframe.src, 'https://app.basingse.org')

      // Assert NO sensitive keys in search params
      expect(parsedUrl.searchParams.has('token')).toBe(false)
      expect(parsedUrl.searchParams.has('access_token')).toBe(false)
      expect(parsedUrl.searchParams.has('bearer')).toBe(false)
      expect(parsedUrl.searchParams.has('Authorization')).toBe(false)
      expect(parsedUrl.searchParams.has('oauthToken')).toBe(false)
      expect(parsedUrl.searchParams.has('key')).toBe(false)
      expect(parsedUrl.searchParams.has('apiKey')).toBe(false)

      // Assert iframe.src does NOT contain token string anywhere
      expect(iframe.src).not.toContain(sensitiveToken)
      expect(iframe.src).not.toMatch(/ya29\.[a-zA-Z0-9_\-]+/)

      // Assert download URL routes to /sw-pipe/:streamId/:filename
      expect(parsedUrl.pathname).toContain(`/sw-pipe/${streamId}/${filename}`)
    })

    it('ensures postMessage communication between SW and client contains zero token payload', async () => {
      const env = createServiceWorkerEnvironment()
      const clientReceivedMessages: any[] = []

      env.windowClients.push({
        postMessage: (msg: any) => {
          clientReceivedMessages.push(msg)
        },
      })

      const token = 'ya29.confidential_in_memory_token_xyz'
      const streamId = 'sw_stream_telemetry_test'

      vi.stubGlobal('fetch', vi.fn(async () => {
        return new Response(new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]), {
          status: 200,
          headers: { 'content-length': '8' },
        })
      }))

      await env.dispatchMessage({
        type: 'REGISTER_STREAM',
        streamId,
        ticket: {
          bucket: 'bucket',
          object: 'obj.mxf',
          userProject: 'proj',
          token,
          filename: 'obj.mxf',
          size: 8,
        },
      })

      const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
      expect(res).not.toBeNull()

      // Read stream to flush
      const reader = res!.body!.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      // Allow microtask ticks for progress / complete broadcast
      await new Promise((r) => setTimeout(r, 50))

      expect(clientReceivedMessages.length).toBeGreaterThan(0)
      for (const msg of clientReceivedMessages) {
        const jsonStr = JSON.stringify(msg)
        expect(jsonStr).not.toContain(token)
        expect(jsonStr).not.toContain('ya29.')
      }
    })
  })

  // =========================================================================
  // 4. MULTIPLE CONCURRENT SW STREAMS & BACKPRESSURE STRESS HARNESS
  // =========================================================================
  describe('4. Multiple Concurrent SW Streams & Resource Isolation', () => {
    it('supports 20 concurrent streams with isolated lifecycle and zero cross-talk', async () => {
      const env = createServiceWorkerEnvironment()
      const NUM_STREAMS = 20
      const streamResults = new Map<string, { loaded: number; total: number; completed: boolean }>()

      env.windowClients.push({
        postMessage: (msg: any) => {
          if (msg.type === 'SW_STREAM_PROGRESS') {
            const entry = streamResults.get(msg.streamId) || { loaded: 0, total: msg.totalBytes, completed: false }
            entry.loaded = msg.loadedBytes
            streamResults.set(msg.streamId, entry)
          } else if (msg.type === 'SW_STREAM_COMPLETE') {
            const entry = streamResults.get(msg.streamId) || { loaded: 0, total: 0, completed: false }
            entry.completed = true
            streamResults.set(msg.streamId, entry)
          }
        },
      })

      // Mock GCS responding to each stream
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const match = url.match(/stream_(\d+)/)
        const id = match ? parseInt(match[1], 10) : 1
        const size = (id + 1) * 1024 // variable sizes
        const data = new Uint8Array(size)
        return new Response(data, {
          status: 200,
          headers: { 'content-length': String(size) },
        })
      }))

      // 1. Register 20 streams
      for (let i = 1; i <= NUM_STREAMS; i++) {
        const streamId = `sw_stream_${i}`
        const size = (i + 1) * 1024
        await env.dispatchMessage({
          type: 'REGISTER_STREAM',
          streamId,
          ticket: {
            bucket: 'concurrent-bucket',
            object: `stream_${i}.mxf`,
            userProject: 'proj',
            token: `ya29.token_${i}`,
            filename: `stream_${i}.mxf`,
            size,
          },
        })
      }

      // 2. Fetch all 20 streams concurrently
      const fetchPromises = Array.from({ length: NUM_STREAMS }, async (_, idx) => {
        const i = idx + 1
        const streamId = `sw_stream_${i}`
        const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=${streamId}`)
        expect(res).not.toBeNull()
        expect(res!.status).toBe(200)

        // Consume body
        const reader = res!.body!.getReader()
        let receivedBytes = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) receivedBytes += value.length
        }
        return { streamId, receivedBytes }
      })

      const results = await Promise.all(fetchPromises)
      expect(results.length).toBe(NUM_STREAMS)

      for (const res of results) {
        const id = parseInt(res.streamId.split('_')[2], 10)
        const expectedSize = (id + 1) * 1024
        expect(res.receivedBytes).toBe(expectedSize)
      }

      // 3. Verify all tickets were evicted and memory is completely cleaned
      let pingPong: any = null
      const port: any = { postMessage: (msg: any) => { pingPong = msg } }
      await env.dispatchMessage({ type: 'PING' }, [port])
      expect(pingPong?.activeStreams).toBe(0)
    })

    it('allows targeted abort of a subset of concurrent streams without disrupting remaining streams', async () => {
      const env = createServiceWorkerEnvironment()

      // Register 10 streams
      for (let i = 1; i <= 10; i++) {
        await env.dispatchMessage({
          type: 'REGISTER_STREAM',
          streamId: `sw_stream_selective_${i}`,
          ticket: {
            bucket: 'bucket',
            object: `file_${i}.mxf`,
            userProject: 'proj',
            token: 'ya29.token',
            filename: `file_${i}.mxf`,
          },
        })
      }

      // Abort even-numbered streams: 2, 4, 6, 8, 10
      for (let i = 2; i <= 10; i += 2) {
        await env.dispatchMessage({
          type: 'ABORT_STREAM',
          streamId: `sw_stream_selective_${i}`,
        })
      }

      // Odd-numbered streams (1, 3, 5, 7, 9) must still exist and be valid
      for (let i = 1; i <= 9; i += 2) {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        })))
        const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=sw_stream_selective_${i}`)
        expect(res!.status).toBe(200)
      }

      // Even-numbered streams (2, 4, 6, 8, 10) must return 400
      for (let i = 2; i <= 10; i += 2) {
        const res = await env.dispatchFetch(`https://app.basingse.org/api/stream-download?streamId=sw_stream_selective_${i}`)
        expect(res!.status).toBe(400)
      }
    })
  })

  // =========================================================================
  // 5. STRICT 200MB BLOB MEMORY LIMIT & BOUNDARY STRESS VERIFICATION
  // =========================================================================
  describe('5. Strict 200MB Blob Memory Ceiling & Boundary Fuzzing', () => {
    const EXACT_200MB = 200 * 1024 * 1024 // 209,715,200 bytes
    const EXCEEDS_BY_ONE = EXACT_200MB + 1 // 209,715,201 bytes

    it('permits memory blob download for assets up to and including exactly 200MB', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: {
            'content-length': '4',
            'x-goog-hash': 'crc32c=test==',
          },
        })
      })
      vi.stubGlobal('fetch', mockFetch)
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/mock-uuid'),
        revokeObjectURL: vi.fn(),
      })

      const asset = {
        id: 'boundary-200mb',
        name: 'video_boundary.mxf',
        sizeBytes: EXACT_200MB,
        bucket: 'partner-bucket',
      }

      // Exactly 200MB must NOT throw FILE_TOO_LARGE_FOR_BLOB
      const result = await streamDownloadService.downloadFileMemoryBlob(asset, {
        bucketName: asset.bucket,
        objectName: asset.name,
        userProject: 'proj-123',
        oauthToken: 'ya29.valid-token',
        fileSize: EXACT_200MB,
      })

      expect(result.status).toBe('completed')
      expect(result.strategy).toBe('memory_blob')
      expect(mockFetch).toHaveBeenCalled()
    })

    it('strictly rejects assets exceeding 200MB by 1 byte (209,715,201 bytes) immediately with FILE_TOO_LARGE_FOR_BLOB without network fetch', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const asset = {
        id: 'boundary-exceeds-1',
        name: 'video_exceeds.mxf',
        sizeBytes: EXCEEDS_BY_ONE,
        bucket: 'partner-bucket',
      }

      let thrownError: any = null
      try {
        await streamDownloadService.downloadFileMemoryBlob(asset, {
          bucketName: asset.bucket,
          objectName: asset.name,
          userProject: 'proj-123',
          oauthToken: 'ya29.valid-token',
        })
      } catch (err) {
        thrownError = err
      }

      expect(thrownError).toBeInstanceOf(StreamDownloadError)
      expect(thrownError.code).toBe('FILE_TOO_LARGE_FOR_BLOB')
      expect(thrownError.message).toContain('exceeds 200 MB memory limit')
      expect(thrownError.itemId).toBe('boundary-exceeds-1')

      // Zero-egress verification: fetch must NEVER have been called!
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects multi-gigabyte production assets (250MB, 500MB, 1GB, 50GB) immediately before any network egress', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const massiveSizes = [
        250 * 1024 * 1024,
        500 * 1024 * 1024,
        1024 * 1024 * 1024,
        50 * 1024 * 1024 * 1024,
      ]

      for (const size of massiveSizes) {
        const asset = {
          id: `massive-${size}`,
          name: `render_${size}.mxf`,
          sizeBytes: size,
          bucket: 'partner-bucket',
        }

        await expect(
          streamDownloadService.downloadFileMemoryBlob(asset, {
            bucketName: asset.bucket,
            objectName: asset.name,
            userProject: 'proj-123',
            oauthToken: 'ya29.valid-token',
          }),
        ).rejects.toThrowError(StreamDownloadError)

        expect(mockFetch).not.toHaveBeenCalled()
      }
    })

    it('checks options.fileSize override priority over asset.sizeBytes for blob limit validation', async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      // asset says 10MB, but options.fileSize says 300MB
      const asset = {
        id: 'size-override-test',
        name: 'override.mxf',
        sizeBytes: 10 * 1024 * 1024,
        bucket: 'partner-bucket',
      }

      await expect(
        streamDownloadService.downloadFileMemoryBlob(asset, {
          bucketName: asset.bucket,
          objectName: asset.name,
          userProject: 'proj-123',
          oauthToken: 'ya29.valid-token',
          fileSize: 300 * 1024 * 1024,
        }),
      ).rejects.toThrow(/exceeds 200 MB memory limit/)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('handles boundary and edge-case file sizes (0 bytes, 1 byte, undefined)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => {
        return new Response(new Uint8Array([]), {
          status: 200,
          headers: { 'content-length': '0' },
        })
      }))
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/empty-blob'),
        revokeObjectURL: vi.fn(),
      })

      const emptyAsset = {
        id: 'empty-file',
        name: 'empty.txt',
        sizeBytes: 0,
        bucket: 'partner-bucket',
      }

      const result = await streamDownloadService.downloadFileMemoryBlob(emptyAsset, {
        bucketName: emptyAsset.bucket,
        objectName: emptyAsset.name,
        userProject: 'proj-123',
        oauthToken: 'ya29.valid-token',
      })

      expect(result.status).toBe('completed')
      expect(result.bytesDownloaded).toBe(0)
    })
  })

  // =========================================================================
  // 6. CROSS-BROWSER CAPABILITY MATRIX & CLI COMPANION GENERATOR INTEGRITY
  // =========================================================================
  describe('6. Cross-Browser Capability Matrix & CLI Generator Integrity', () => {
    it('correctly maps capability matrix across all major browser UAs and file sizes', () => {
      // Chromium Browser (Chrome 120) defaults to Service Worker streaming
      vi.stubGlobal('window', { showSaveFilePicker: vi.fn() })
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        vendor: 'Google Inc.',
        serviceWorker: {},
      })
      expect(BrowserCapabilityDetector.resolveStrategy(50 * 1024 * 1024)).toBe('service_worker')
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('service_worker')

      // Apple Safari (WebKit) on macOS
      vi.stubGlobal('window', {})
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        vendor: 'Apple Computer, Inc.',
        serviceWorker: {},
      })
      expect(BrowserCapabilityDetector.isSafari()).toBe(true)
      expect(BrowserCapabilityDetector.resolveStrategy(100 * 1024 * 1024)).toBe('memory_blob')
      expect(BrowserCapabilityDetector.resolveStrategy(300 * 1024 * 1024)).toBe('service_worker')

      // Mozilla Firefox (Gecko) on Windows
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        vendor: '',
      })
      expect(BrowserCapabilityDetector.isFirefox()).toBe(true)
      expect(BrowserCapabilityDetector.resolveStrategy(50 * 1024 * 1024)).toBe('memory_blob')
      expect(BrowserCapabilityDetector.resolveStrategy(500 * 1024 * 1024)).toBe('cli_companion')
    })

    it('generates multi-file and single-file cURL commands with proper shell escaping and billing project attribution', () => {
      const curlSingle = CliGeneratorEngine.generateCurlCommand({
        bucketName: 'gs://partner-master-archives',
        selectedPaths: ['vfx/earthbending shot 01.mxf'],
        userProject: 'vfx-billing-corp',
        oauthToken: 'ya29.curl-test-token',
      })

      expect(curlSingle).toContain('curl -X GET')
      expect(curlSingle).toContain('https://storage.googleapis.com/storage/v1/b/partner-master-archives/o/vfx%2Fearthbending%20shot%2001.mxf?alt=media&userProject=vfx-billing-corp')
      expect(curlSingle).toContain('-H "Authorization: Bearer ya29.curl-test-token"')
      expect(curlSingle).toContain('-o "earthbending shot 01.mxf"')

      const curlMulti = CliGeneratorEngine.generateCurlCommand({
        bucketName: 'partner-master-archives',
        selectedPaths: ['reel1.mxf', 'reel2.mxf'],
        userProject: 'vfx-billing-corp',
        oauthToken: 'ya29.curl-test-token',
      })

      expect(curlMulti).toContain('reel1.mxf')
      expect(curlMulti).toContain('reel2.mxf')
      expect(curlMulti).toContain('&&')
    })

    it('rejects unauthenticated requests in downloadFileServiceWorker and downloadFileMemoryBlob', async () => {
      const asset = {
        id: 'no-auth-asset',
        name: 'file.mxf',
        sizeBytes: 1000,
        bucket: 'bucket',
      }

      await expect(
        streamDownloadService.downloadFileServiceWorker(asset, {
          bucketName: 'bucket',
          objectName: 'file.mxf',
          userProject: 'proj',
          oauthToken: '',
        }),
      ).rejects.toThrow('No OAuth access token provided.')

      await expect(
        streamDownloadService.downloadFileMemoryBlob(asset, {
          bucketName: 'bucket',
          objectName: 'file.mxf',
          userProject: 'proj',
          oauthToken: '',
        }),
      ).rejects.toThrow('No OAuth access token provided.')
    })

    it('rejects missing userProject in downloadFileServiceWorker and downloadFileMemoryBlob with UserProjectMissingError', async () => {
      const asset = {
        id: 'no-proj-asset',
        name: 'file.mxf',
        sizeBytes: 1000,
        bucket: 'bucket',
      }

      await expect(
        streamDownloadService.downloadFileServiceWorker(asset, {
          bucketName: 'bucket',
          objectName: 'file.mxf',
          userProject: '',
          oauthToken: 'ya29.token',
        }),
      ).rejects.toThrowError(UserProjectMissingError)

      await expect(
        streamDownloadService.downloadFileMemoryBlob(asset, {
          bucketName: 'bucket',
          objectName: 'file.mxf',
          userProject: '',
          oauthToken: 'ya29.token',
        }),
      ).rejects.toThrowError(UserProjectMissingError)
    })
  })
})
