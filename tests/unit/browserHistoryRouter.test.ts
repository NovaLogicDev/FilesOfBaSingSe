import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { BrowserHistoryRouterEngine } from '../../src/engines/browserHistoryRouter'

describe('BrowserHistoryRouterEngine Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('serializeHash()', () => {
    it('should serialize root directory correctly', () => {
      const hash = BrowserHistoryRouterEngine.serializeHash('partner-raw-master-archives-2026', '')
      expect(hash).toBe('#/browse/partner-raw-master-archives-2026/')
    })

    it('should strip gs:// prefix from bucket name', () => {
      const hash = BrowserHistoryRouterEngine.serializeHash('gs://partner-raw-master-archives-2026', '')
      expect(hash).toBe('#/browse/partner-raw-master-archives-2026/')
    })

    it('should serialize single folder correctly', () => {
      const hash = BrowserHistoryRouterEngine.serializeHash('partner-raw-master-archives-2026', 'feature_films/')
      expect(hash).toBe('#/browse/partner-raw-master-archives-2026/feature_films/')
    })

    it('should serialize deep nested directory path correctly', () => {
      const hash = BrowserHistoryRouterEngine.serializeHash(
        'partner-raw-master-archives-2026',
        'feature_films/reel_04/camera_raw/'
      )
      expect(hash).toBe('#/browse/partner-raw-master-archives-2026/feature_films/reel_04/camera_raw/')
    })

    it('should append trailing slash if missing on folder prefix', () => {
      const hash = BrowserHistoryRouterEngine.serializeHash('my-bucket', 'folder1/subfolder')
      expect(hash).toBe('#/browse/my-bucket/folder1/subfolder/')
    })

    it('should properly URI encode special characters, spaces, and hash symbols in segments', () => {
      const hash = BrowserHistoryRouterEngine.serializeHash('my-bucket', 'reel 04/scene#1/take&2 (final)/')
      expect(hash).toBe('#/browse/my-bucket/reel%2004/scene%231/take%262%20(final)/')
    })

    it('should return empty string if bucket is empty', () => {
      const hash = BrowserHistoryRouterEngine.serializeHash('', 'folder/')
      expect(hash).toBe('')
    })
  })

  describe('parseHash()', () => {
    it('should parse root hash correctly', () => {
      const parsed = BrowserHistoryRouterEngine.parseHash('#/browse/partner-raw-master-archives-2026/')
      expect(parsed).toEqual({
        view: 'browse',
        bucket: 'partner-raw-master-archives-2026',
        prefix: '',
        isValid: true,
      })
    })

    it('should parse nested folder hash correctly', () => {
      const parsed = BrowserHistoryRouterEngine.parseHash(
        '#/browse/partner-raw-master-archives-2026/feature_films/reel_04/'
      )
      expect(parsed).toEqual({
        view: 'browse',
        bucket: 'partner-raw-master-archives-2026',
        prefix: 'feature_films/reel_04/',
        isValid: true,
      })
    })

    it('should decode URI encoded segments properly', () => {
      const parsed = BrowserHistoryRouterEngine.parseHash(
        '#/browse/partner-raw-master-archives-2026/reel%2004/scene%231/'
      )
      expect(parsed).toEqual({
        view: 'browse',
        bucket: 'partner-raw-master-archives-2026',
        prefix: 'reel 04/scene#1/',
        isValid: true,
      })
    })

    it('should parse query-param formatted hash (#/browse?bucket=...&prefix=...)', () => {
      const parsed = BrowserHistoryRouterEngine.parseHash(
        '#/browse?bucket=my-bucket&prefix=dailies/day_01/'
      )
      expect(parsed).toEqual({
        view: 'browse',
        bucket: 'my-bucket',
        prefix: 'dailies/day_01/',
        isValid: true,
      })
    })

    it('should return isValid: false for empty or non-browse hashes', () => {
      expect(BrowserHistoryRouterEngine.parseHash('')).toEqual({
        view: 'root',
        bucket: '',
        prefix: '',
        isValid: false,
      })
      expect(BrowserHistoryRouterEngine.parseHash('#/settings')).toEqual({
        view: 'root',
        bucket: '',
        prefix: '',
        isValid: false,
      })
      expect(BrowserHistoryRouterEngine.parseHash('#/browse/')).toEqual({
        view: 'browse',
        bucket: '',
        prefix: '',
        isValid: false,
      })
    })
  })

  describe('pushNavigation() & replaceNavigation()', () => {
    it('should call window.history.pushState with structured state and hash', () => {
      const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})

      BrowserHistoryRouterEngine.pushNavigation('my-bucket', 'dailies/day_01/')

      expect(pushSpy).toHaveBeenCalledTimes(1)
      const [state, title, url] = pushSpy.mock.calls[0]
      expect(state).toMatchObject({
        bucket: 'my-bucket',
        prefix: 'dailies/day_01/',
        source: 'user_interaction',
      })
      expect(typeof state.timestamp).toBe('number')
      expect(title).toBe('')
      expect(url).toBe('#/browse/my-bucket/dailies/day_01/')
    })

    it('should call window.history.replaceState when replace option is set', () => {
      const replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

      BrowserHistoryRouterEngine.replaceNavigation('my-bucket', 'dailies/day_01/', 'deep_link')

      expect(replaceSpy).toHaveBeenCalledTimes(1)
      const [state, title, url] = replaceSpy.mock.calls[0]
      expect(state).toMatchObject({
        bucket: 'my-bucket',
        prefix: 'dailies/day_01/',
        source: 'deep_link',
      })
      expect(url).toBe('#/browse/my-bucket/dailies/day_01/')
    })

    it('should not throw if bucket is empty', () => {
      const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
      BrowserHistoryRouterEngine.pushNavigation('', '')
      expect(pushSpy).not.toHaveBeenCalled()
    })
  })
})
