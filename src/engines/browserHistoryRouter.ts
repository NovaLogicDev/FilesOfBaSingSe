import { NavigationHistoryState, ParsedRoute, NavigateOptions } from '../types/navigation'

/**
 * BrowserHistoryRouterEngine (Engine 9 / Module 11)
 * Manages bidirectional synchronization between directory navigation, breadcrumbs,
 * and the browser's native History API (pushState, replaceState, popstate).
 */
export class BrowserHistoryRouterEngine {
  private static ROUTE_PREFIX = '#/browse'

  /**
   * Sanitizes a bucket name by stripping 'gs://', leading/trailing slashes, and whitespace.
   */
  public static cleanBucket(bucketName: string): string {
    if (!bucketName) return ''
    return bucketName.replace(/^gs:\/\//i, '').replace(/^\/+|\/+$/g, '').trim()
  }

  /**
   * Serializes a bucket and directory prefix into a canonical URL hash.
   * e.g. "my-bucket", "feature_films/reel_04/" -> "#/browse/my-bucket/feature_films/reel_04/"
   */
  public static serializeHash(bucketName: string, prefix: string): string {
    const cleanB = this.cleanBucket(bucketName)
    if (!cleanB) return ''

    const cleanP = (prefix || '').replace(/^\/+/, '')

    if (!cleanP) {
      return `${this.ROUTE_PREFIX}/${encodeURIComponent(cleanB)}/`
    }

    // Split prefix segments to encode each path component safely
    const encodedSegments = cleanP
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')

    const normalizedPath = encodedSegments.endsWith('/') ? encodedSegments : `${encodedSegments}/`
    return `${this.ROUTE_PREFIX}/${encodeURIComponent(cleanB)}/${normalizedPath}`
  }

  /**
   * Parses the URL hash string into structured route data.
   * Supports both path-style (#/browse/bucket/prefix) and query-style (#/browse?bucket=...&prefix=...).
   */
  public static parseHash(hashString?: string): ParsedRoute {
    const rawHash =
      typeof hashString === 'string'
        ? hashString
        : typeof window !== 'undefined'
        ? window.location.hash
        : ''

    if (!rawHash || !rawHash.startsWith('#')) {
      return { view: 'root', bucket: '', prefix: '', isValid: false }
    }

    // Handle query-param style: #/browse?bucket=abc&prefix=xyz or #?bucket=abc&prefix=xyz
    if (rawHash.includes('?')) {
      const queryPart = rawHash.split('?')[1] || ''
      const params = new URLSearchParams(queryPart)
      const rawBucket = params.get('bucket') || ''
      const rawPrefix = params.get('prefix') || ''
      const bucket = this.cleanBucket(rawBucket)
      const prefix = rawPrefix ? (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) : ''

      return {
        view: 'browse',
        bucket,
        prefix,
        isValid: Boolean(bucket && bucket.length >= 3),
      }
    }

    // Handle path-style: #/browse/{bucket}/{...segments}
    const cleanHash = rawHash.replace(/^#\/?/, '')
    const parts = cleanHash.split('/').filter(Boolean)

    if (parts.length === 0) {
      return { view: 'root', bucket: '', prefix: '', isValid: false }
    }

    if (parts[0] !== 'browse') {
      return { view: 'root', bucket: '', prefix: '', isValid: false }
    }

    if (parts.length < 2) {
      return { view: 'browse', bucket: '', prefix: '', isValid: false }
    }

    let bucket = ''
    try {
      bucket = this.cleanBucket(decodeURIComponent(parts[1]))
    } catch {
      bucket = this.cleanBucket(parts[1])
    }

    const rawPrefixParts = parts.slice(2)
    let decodedPrefix = ''

    if (rawPrefixParts.length > 0) {
      const decodedSegments = rawPrefixParts.map((seg) => {
        try {
          return decodeURIComponent(seg)
        } catch {
          return seg
        }
      })
      decodedPrefix = decodedSegments.join('/')
      if (!decodedPrefix.endsWith('/')) {
        decodedPrefix += '/'
      }
    }

    return {
      view: 'browse',
      bucket,
      prefix: decodedPrefix,
      isValid: Boolean(bucket && bucket.length >= 3),
    }
  }

  /**
   * Pushes a new navigation entry to browser history or updates current entry.
   */
  public static pushNavigation(
    bucketName: string,
    prefix: string,
    options: NavigateOptions = {}
  ): void {
    if (typeof window === 'undefined' || !window.history) return

    const cleanB = this.cleanBucket(bucketName)
    const targetHash = this.serializeHash(cleanB, prefix)
    if (!targetHash) return

    const state: NavigationHistoryState = {
      bucket: cleanB,
      prefix: prefix || '',
      timestamp: Date.now(),
      source: options.source || 'user_interaction',
    }

    try {
      if (options.replace || window.location.hash === targetHash) {
        window.history.replaceState(state, '', targetHash)
      } else {
        window.history.pushState(state, '', targetHash)
      }
    } catch (e) {
      // In constrained environments (e.g. sandboxed iframes or test runners), fallback to location.hash
      try {
        window.location.hash = targetHash
      } catch {
        // silent fallback
      }
    }
  }

  /**
   * Replaces current history entry without creating a duplicate history stack item.
   */
  public static replaceNavigation(
    bucketName: string,
    prefix: string,
    source: NavigationHistoryState['source'] = 'deep_link'
  ): void {
    this.pushNavigation(bucketName, prefix, { replace: true, source })
  }
}
