/**
 * Files of Ba Sing Se - Service Worker Stream Interceptor
 * Intercepts /api/stream-download to stream GCS assets directly to ~/Downloads in Safari (WebKit).
 * Adheres strictly to Zero-Backend Client Liability (R7) and Volatile In-Memory Token Isolation.
 */

const SW_VERSION = 'v1.0.0'
const STREAM_ENDPOINT = '/api/stream-download'

// Volatile in-memory map of registered stream tickets: streamId -> Ticket
const activeStreams = new Map()

// Install Event: Skip waiting to activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

// Activate Event: Claim all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Broadcast helper to notify all window clients of progress/completion
async function notifyClients(message) {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      client.postMessage(message)
    }
  } catch (_) {}
}

// Message Event: Handle ticket registration, ping, and abort commands
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return

  const port = event.ports && event.ports[0] ? event.ports[0] : null

  switch (data.type) {
    case 'REGISTER_STREAM': {
      const { streamId, ticket } = data
      if (streamId && ticket) {
        const abortController = new AbortController()
        activeStreams.set(streamId, {
          ...ticket,
          streamId,
          abortController,
          createdAt: Date.now(),
        })

        const reply = {
          type: 'STREAM_REGISTERED',
          streamId,
        }
        if (port) {
          port.postMessage(reply)
        } else if (event.source) {
          event.source.postMessage(reply)
        }
      }
      break
    }

    case 'ABORT_STREAM': {
      const { streamId } = data
      if (streamId && activeStreams.has(streamId)) {
        const entry = activeStreams.get(streamId)
        try {
          entry.abortController.abort()
        } catch (_) {}
        activeStreams.delete(streamId)

        const reply = {
          type: 'STREAM_ABORTED',
          streamId,
        }
        if (port) {
          port.postMessage(reply)
        } else if (event.source) {
          event.source.postMessage(reply)
        }
      }
      break
    }

    case 'PING': {
      const pongResponse = {
        type: 'PONG',
        version: SW_VERSION,
        activeStreams: activeStreams.size,
        timestamp: Date.now(),
      }
      if (port) {
        port.postMessage(pongResponse)
      } else if (event.source) {
        event.source.postMessage(pongResponse)
      }
      break
    }

    case 'CLEAR_STREAMS': {
      for (const [id, entry] of activeStreams.entries()) {
        try {
          entry.abortController.abort()
        } catch (_) {}
      }
      activeStreams.clear()
      if (port) {
        port.postMessage({ type: 'STREAMS_CLEARED' })
      }
      break
    }

    case 'GET_STATUS': {
      const statusResponse = {
        type: 'STATUS_RESPONSE',
        version: SW_VERSION,
        activeStreamsCount: activeStreams.size,
        isRegistered: true,
        isActive: true,
      }
      if (port) {
        port.postMessage(statusResponse)
      } else if (event.source) {
        event.source.postMessage(statusResponse)
      }
      break
    }
  }
})

// Fetch Interception
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only intercept synthetic download endpoint
  if (url.pathname !== STREAM_ENDPOINT && !url.pathname.endsWith(STREAM_ENDPOINT)) {
    return
  }

  event.respondWith(handleStreamDownload(event, url))
})

async function handleStreamDownload(event, url) {
  const streamId = url.searchParams.get('streamId')
  let ticket = null

  if (streamId && activeStreams.has(streamId)) {
    ticket = activeStreams.get(streamId)
  }

  // Fallback to query params if not pre-registered (e.g. for testing)
  const bucket = ticket?.bucket || url.searchParams.get('bucket') || ''
  const object = ticket?.object || url.searchParams.get('object') || ''
  const userProject = ticket?.userProject || url.searchParams.get('userProject') || ''
  const token = ticket?.token || url.searchParams.get('token') || ''
  const filename = ticket?.filename || url.searchParams.get('filename') || 'downloaded_asset'
  const abortController = ticket?.abortController || new AbortController()

  if (!bucket || !object || !userProject || !token) {
    return new Response(
      JSON.stringify({
        error: 'Missing required stream parameters (bucket, object, userProject, token)',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const cleanBucket = bucket.replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim()
  const cleanObject = object.replace(/^\/+/, '').trim()
  const gcsUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    cleanBucket,
  )}/o/${encodeURIComponent(cleanObject)}?alt=media&userProject=${encodeURIComponent(userProject)}`

  // Forward Range header if present
  const rangeHeader = event.request.headers.get('Range')
  const fetchHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: '*/*',
  }
  if (rangeHeader) {
    fetchHeaders['Range'] = rangeHeader
  }

  let gcsResponse
  try {
    gcsResponse = await fetch(gcsUrl, {
      method: 'GET',
      headers: fetchHeaders,
      signal: abortController.signal,
    })
  } catch (fetchErr) {
    if (fetchErr.name === 'AbortError') {
      return new Response('Stream aborted by client.', { status: 499 })
    }
    return new Response(`GCS network connection failure: ${fetchErr.message}`, { status: 502 })
  }

  if (!gcsResponse.ok) {
    return new Response(gcsResponse.body, {
      status: gcsResponse.status,
      statusText: gcsResponse.statusText,
      headers: {
        'Content-Type': gcsResponse.headers.get('Content-Type') || 'application/json',
      },
    })
  }

  // Construct download response headers
  const safeFilename = filename.replace(/["\r\n\\]/g, '_')
  const encodedFilename = encodeURIComponent(filename)

  const responseHeaders = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  })

  if (gcsResponse.headers.has('content-length')) {
    responseHeaders.set('Content-Length', gcsResponse.headers.get('content-length'))
  }
  if (gcsResponse.headers.has('x-goog-hash')) {
    responseHeaders.set('x-goog-hash', gcsResponse.headers.get('x-goog-hash'))
  }
  if (gcsResponse.headers.has('content-range')) {
    responseHeaders.set('Content-Range', gcsResponse.headers.get('content-range'))
  }

  const contentLength = parseInt(responseHeaders.get('Content-Length') || '0', 10)
  let loadedBytes = 0
  let lastProgressTime = 0

  // If ReadableStream or TransformStream is available, pipe through TransformStream
  if (typeof TransformStream !== 'undefined' && gcsResponse.body) {
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        loadedBytes += chunk.byteLength || chunk.length
        controller.enqueue(chunk)

        const now = Date.now()
        if (now - lastProgressTime > 250 || loadedBytes === contentLength) {
          lastProgressTime = now
          notifyClients({
            type: 'SW_STREAM_PROGRESS',
            streamId,
            loadedBytes,
            totalBytes: contentLength,
            percentage:
              contentLength > 0
                ? Math.min(100, Math.round((loadedBytes / contentLength) * 100))
                : 0,
          })
        }
      },
      flush() {
        notifyClients({
          type: 'SW_STREAM_COMPLETE',
          streamId,
          loadedBytes,
          totalBytes: contentLength,
        })
        if (streamId) {
          activeStreams.delete(streamId)
        }
      },
    })

    const streamBody = gcsResponse.body.pipeThrough(transformStream)

    return new Response(streamBody, {
      status: gcsResponse.status,
      statusText: gcsResponse.statusText,
      headers: responseHeaders,
    })
  }

  // Fallback if TransformStream not available
  return new Response(gcsResponse.body, {
    status: gcsResponse.status,
    statusText: gcsResponse.statusText,
    headers: responseHeaders,
  })
}
