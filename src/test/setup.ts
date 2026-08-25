import '@testing-library/jest-dom/vitest'
import { STUDIO_MASTER_DATASET } from '../../tests/fixtures/mediaDatasets'

// Mock crypto.getRandomValues if not present in jsdom
if (!globalThis.crypto) {
  const nodeCrypto = require('crypto')
  globalThis.crypto = {
    getRandomValues: (buffer: any) => nodeCrypto.randomFillSync(buffer),
  } as any
}

// Mock window.showSaveFilePicker (Native Chromium File System Access API)
if (typeof window !== 'undefined' && !('showSaveFilePicker' in window)) {
  class MockFileSystemWritableFileStream {
    public chunks: any[] = []
    public closed: boolean = false

    async write(data: any): Promise<void> {
      if (this.closed) throw new Error('Stream is closed')
      this.chunks.push(data)
    }

    async close(): Promise<void> {
      this.closed = true
    }

    async abort(): Promise<void> {
      this.closed = true
    }
  }

  class MockFileSystemFileHandle {
    public name: string
    public kind = 'file'

    constructor(name: string = 'downloaded_file.mxf') {
      this.name = name
    }

    async createWritable(): Promise<MockFileSystemWritableFileStream> {
      return new MockFileSystemWritableFileStream()
    }
  }

  ;(window as any).showSaveFilePicker = async (options?: any) => {
    return new MockFileSystemFileHandle(options?.suggestedName || 'downloaded_file.mxf')
  }
}

// Mock navigator.clipboard
if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  let clipboardContent = ''
  ;(navigator as any).clipboard = {
    writeText: async (text: string) => {
      clipboardContent = text
      return Promise.resolve()
    },
    readText: async () => Promise.resolve(clipboardContent),
  }
}

// Mock navigator.serviceWorker
if (typeof navigator !== 'undefined' && !navigator.serviceWorker) {
  const listeners: Record<string, Function[]> = {}
  ;(navigator as any).serviceWorker = {
    controller: {
      postMessage: (msg: any) => {
        if (listeners['message']) {
          listeners['message'].forEach((cb) => cb({ data: msg }))
        }
      },
    },
    register: async () => Promise.resolve({ scope: '/' }),
    ready: Promise.resolve({}),
    addEventListener: (event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    },
    removeEventListener: (event: string, cb: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== cb)
      }
    },
  }
}

// Mock window.matchMedia
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as any)
}

// Mock ResizeObserver & IntersectionObserver
if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    ;(window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (!('IntersectionObserver' in window)) {
    ;(window as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
}

// Mock Google Identity Services (GIS) OAuth 2.0 SDK
if (typeof window !== 'undefined') {
  ;(window as any).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: any) => ({
          requestAccessToken: (_options?: any) => {
            setTimeout(() => {
              if (config.callback) {
                config.callback({
                  access_token: 'ya29.sample_token_gis_mock_2026',
                  expires_in: 3600,
                  scope:
                    'https://www.googleapis.com/auth/devstorage.read_only https://www.googleapis.com/auth/cloud-platform',
                })
              }
            }, 20)
          },
        }),
        revoke: (_token: string, done?: () => void) => {
          if (done) setTimeout(done, 10)
        },
      },
    },
  }
}

// Mock fetch for Google OAuth and GCP endpoints in test environment
const originalFetch = globalThis.fetch
globalThis.fetch = async (input: any, init?: any) => {
  if (init?.signal?.aborted) {
    const err = new Error('The operation was aborted')
    err.name = 'AbortError'
    throw err
  }

  const url = typeof input === 'string' ? input : input?.url || ''
  if (url.includes('oauth2/v3/userinfo')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        sub: '1092837465',
        email: 'taylor@freelance-edit.com',
        name: 'Taylor (Colorist)',
        picture: 'https://avatars.example.com/taylor.jpg',
      }),
    } as any
  }
  if (url.includes('cloudresourcemanager.googleapis.com/v1/projects')) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    return {
      ok: true,
      status: 200,
      json: async () => ({
        projectId: `basingse-media-dl-${randomSuffix}`,
        projectNumber: '109283746501',
        lifecycleState: 'ACTIVE',
        name: 'Ba Sing Se Media Downloads',
        projects: [
          {
            projectId: 'client-media-project-2026',
            name: 'Client Post Production Studio',
            projectNumber: '891029384712',
            lifecycleState: 'ACTIVE',
          },
        ],
      }),
    } as any
  }
  if (url.includes('serviceusage.googleapis.com')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ done: true }),
    } as any
  }
  if (url.includes('cloudbilling.googleapis.com')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        billingEnabled: true,
        billingAccountName: 'billingAccounts/0182A9-983FBC-7721AA',
      }),
    } as any
  }
  if (url.includes('storage.googleapis.com/storage/v1')) {
    const isMedia = url.includes('alt=media')
    const chunk = new Uint8Array(1024)
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(chunk)
        ctrl.close()
      },
    })

    if (url.includes('/o?') || url.endsWith('/o')) {
      const urlObj = new URL(url)
      const prefix = urlObj.searchParams.get('prefix') || ''
      const delimiter = urlObj.searchParams.get('delimiter') || ''

      const prefixesSet = new Set<string>()
      const matchedItems: any[] = []

      for (const item of STUDIO_MASTER_DATASET) {
        if (!item.name.startsWith(prefix)) continue
        const remainder = item.name.slice(prefix.length)
        if (delimiter && remainder.includes(delimiter)) {
          const folderName = remainder.slice(0, remainder.indexOf(delimiter) + delimiter.length)
          prefixesSet.add(prefix + folderName)
        } else {
          matchedItems.push({
            id: item.id,
            name: item.name,
            bucket: item.bucket,
            size: String(item.sizeBytes),
            contentType: item.contentType,
            storageClass: item.storageClass,
            updated: item.updated,
            crc32c: item.crc32c,
            etag: item.etag,
            generation: item.generation || '1721038935129482',
            timeCreated: item.updated,
          })
        }
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'content-length': '1024',
          'x-goog-hash': 'crc32c=AAAAAA==',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': 'x-goog-hash, Content-Length, Range, ETag',
        }),
        body: isMedia ? stream : undefined,
        json: async () => ({
          kind: 'storage#objects',
          prefixes: Array.from(prefixesSet),
          items: matchedItems,
        }),
      } as any
    }

    const bucketMatch = url.match(/\/b\/([^/?]+)/)
    const mockBucketName = bucketMatch ? decodeURIComponent(bucketMatch[1]) : 'test-bucket'

    return {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': '1024',
        'x-goog-hash': 'crc32c=AAAAAA==',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'x-goog-hash, Content-Length, Range, ETag',
      }),
      body: isMedia ? stream : undefined,
      json: async () => ({
        name: mockBucketName,
        billing: { requesterPays: true },
        cors: [
          {
            origin: ['*'],
            method: ['GET', 'HEAD', 'OPTIONS'],
            responseHeader: ['x-goog-hash', 'Content-Length', 'Range', 'ETag'],
            maxAgeSeconds: 3600,
          },
        ],
      }),
    } as any
  }
  if (originalFetch) {
    return originalFetch(input, init)
  }
  return { ok: true, status: 200, json: async () => ({}) } as any
}

// Mock URL.createObjectURL & revokeObjectURL if jsdom doesn't support them
if (typeof window !== 'undefined' && typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:http://localhost:3000/${Math.random().toString(36).substring(2)}`
  URL.revokeObjectURL = () => {}
}


