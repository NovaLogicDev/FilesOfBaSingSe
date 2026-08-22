import { NavigationRoute, NavigationHistoryState } from '../types'
import { ObservabilityService } from './observability'

/**
 * NavigationRouter: Zero-backend client-side navigation router that manages
 * GCS directory paths and browser History API integration (Back/Forward buttons,
 * URL hash synchronization, deep linking, bookmarking, and reload restoration).
 */
export class NavigationRouter {
  private static ROUTE_PREFIX = '#/browse/'

  /**
   * Normalizes a GCS prefix string (ensures proper trailing slash if non-empty).
   */
  public static normalizePrefix(prefix: string): string {
    const trimmed = prefix.replace(/^\/+/, '').trim()
    if (!trimmed) return ''
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
  }

  /**
   * Encodes a GCS directory prefix into a URL hash route.
   * Special characters in each directory segment are safely encoded using encodeURIComponent.
   * e.g. "feature_films/reel 04/" -> "#/browse/feature_films/reel%2004/"
   */
  public static encodeRoute(prefix: string, bucket?: string): string {
    const normalized = this.normalizePrefix(prefix)
    if (!normalized) {
      return '#/browse/'
    }

    const segments = normalized
      .replace(/\/+$/, '')
      .split('/')
      .filter(Boolean)
      .map((s) => encodeURIComponent(s))

    const encodedPath = segments.join('/') + '/'
    return `${this.ROUTE_PREFIX}${encodedPath}`
  }

  /**
   * Parses the GCS prefix from a URL hash or full URL.
   * Safely decodes each path segment with decodeURIComponent.
   * e.g. "#/browse/feature_films/reel%2004/" -> { prefix: "feature_films/reel 04/" }
   */
  public static parseRoute(hashOrUrl?: string): NavigationRoute {
    let hash = ''
    if (typeof hashOrUrl === 'string') {
      const hashIndex = hashOrUrl.indexOf('#')
      hash = hashIndex >= 0 ? hashOrUrl.slice(hashIndex) : hashOrUrl
    } else if (typeof window !== 'undefined') {
      hash = window.location.hash || ''
    }

    if (!hash || hash === '#' || hash === '#/' || hash === '#/browse' || hash === '#/browse/') {
      return { prefix: '' }
    }

    // Strip '#/browse/' or '#/browse' or '#/' or '#'
    let cleanPath = hash
    if (cleanPath.startsWith('#/browse/')) {
      cleanPath = cleanPath.slice('#/browse/'.length)
    } else if (cleanPath.startsWith('#/browse')) {
      cleanPath = cleanPath.slice('#/browse'.length)
    } else if (cleanPath.startsWith('#/')) {
      cleanPath = cleanPath.slice(2)
    } else if (cleanPath.startsWith('#')) {
      cleanPath = cleanPath.slice(1)
    }

    // Strip any query parameters for prefix extraction
    const queryIndex = cleanPath.indexOf('?')
    if (queryIndex >= 0) {
      cleanPath = cleanPath.slice(0, queryIndex)
    }

    const rawSegments = cleanPath.split('/').filter(Boolean)
    if (rawSegments.length === 0) {
      return { prefix: '' }
    }

    try {
      const decodedSegments = rawSegments.map((s) => decodeURIComponent(s))
      const prefix = decodedSegments.join('/') + '/'
      return { prefix }
    } catch {
      // Fallback for malformed URI components
      const prefix = rawSegments.join('/') + '/'
      return { prefix }
    }
  }

  /**
   * Extracts the initial GCS prefix from current window.location.hash on app boot.
   */
  public static getInitialPrefix(): string {
    if (typeof window === 'undefined') return ''
    return this.parseRoute(window.location.hash).prefix
  }

  /**
   * Pushes a new entry to the browser History API stack.
   * Synchronizes window.location.hash and window.history.state.
   */
  public static pushRoute(prefix: string, bucket?: string): void {
    if (typeof window === 'undefined') return

    const normalized = this.normalizePrefix(prefix)
    const targetHash = this.encodeRoute(normalized, bucket)

    // Check if we are already on this route to avoid redundant pushes
    const currentParsed = this.parseRoute(window.location.hash)
    if (currentParsed.prefix === normalized && window.location.hash === targetHash) {
      return
    }

    const state: NavigationHistoryState = {
      prefix: normalized,
      bucket,
      timestamp: Date.now(),
    }

    try {
      window.history.pushState(state, '', targetHash)
      ObservabilityService.info('ROUTER', `History pushState: "${normalized}" -> ${targetHash}`)
    } catch (err: any) {
      // In restricted sandbox environments or legacy browsers, fallback to direct hash assignment
      window.location.hash = targetHash
    }
  }

  /**
   * Replaces the current browser History API state without adding a new back stop.
   */
  public static replaceRoute(prefix: string, bucket?: string): void {
    if (typeof window === 'undefined') return

    const normalized = this.normalizePrefix(prefix)
    const targetHash = this.encodeRoute(normalized, bucket)

    const state: NavigationHistoryState = {
      prefix: normalized,
      bucket,
      timestamp: Date.now(),
    }

    try {
      window.history.replaceState(state, '', targetHash)
      ObservabilityService.info('ROUTER', `History replaceState: "${normalized}" -> ${targetHash}`)
    } catch (err: any) {
      window.location.hash = targetHash
    }
  }

  /**
   * Subscribes to browser popstate and hashchange events (triggered by Back/Forward buttons).
   * Returns an unsubscribe cleanup function.
   */
  public static listen(callback: (route: NavigationRoute) => void): () => void {
    if (typeof window === 'undefined') return () => {}

    const handlePopState = (e: PopStateEvent) => {
      let prefix = ''
      let bucket: string | undefined = undefined

      if (e.state && typeof e.state === 'object') {
        const historyState = e.state as NavigationHistoryState
        if (typeof historyState.prefix === 'string') {
          prefix = this.normalizePrefix(historyState.prefix)
          bucket = historyState.bucket
        } else {
          const parsed = this.parseRoute(window.location.hash)
          prefix = parsed.prefix
          bucket = parsed.bucket
        }
      } else {
        const parsed = this.parseRoute(window.location.hash)
        prefix = parsed.prefix
        bucket = parsed.bucket
      }

      ObservabilityService.info('ROUTER', `PopState event received: prefix="${prefix}"`)
      callback({ prefix, bucket })
    }

    const handleHashChange = () => {
      const parsed = this.parseRoute(window.location.hash)
      ObservabilityService.info('ROUTER', `HashChange event received: prefix="${parsed.prefix}"`)
      callback(parsed)
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }
}
