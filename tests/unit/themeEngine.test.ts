import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ThemeEngine } from '../../src/engines/theme'

describe('ThemeEngine (AUX-06 Theme & Design System Engine)', () => {
  let originalMatchMedia: typeof window.matchMedia
  let mediaQueryListeners: ((e: any) => void)[] = []
  let matchesDark = true

  beforeEach(() => {
    document.documentElement.className = ''
    mediaQueryListeners = []
    matchesDark = true

    originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: matchesDark,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        if (event === 'change') {
          mediaQueryListeners.push(handler)
        }
      }),
      removeEventListener: vi.fn((event: string, handler: (e: any) => void) => {
        mediaQueryListeners = mediaQueryListeners.filter((h) => h !== handler)
      }),
      dispatchEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    ThemeEngine.cleanup()
    window.matchMedia = originalMatchMedia
    document.documentElement.className = ''
  })

  it('applies dark theme explicitly by adding .dark class and removing .light', () => {
    const effective = ThemeEngine.applyTheme('dark')
    expect(effective).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('applies light theme explicitly by removing .dark class and adding .light', () => {
    // First set to dark
    ThemeEngine.applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    // Switch to light
    const effective = ThemeEngine.applyTheme('light')
    expect(effective).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('resolves system theme matching prefers-color-scheme: dark', () => {
    matchesDark = true
    const effective = ThemeEngine.applyTheme('system')
    expect(effective).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('system')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('resolves system theme matching prefers-color-scheme: light', () => {
    matchesDark = false
    const effective = ThemeEngine.applyTheme('system')
    expect(effective).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('system')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('dynamically adapts when system OS theme changes while in system mode', () => {
    matchesDark = true
    ThemeEngine.applyTheme('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    let callbackCalledWith: 'dark' | 'light' | null = null
    const cleanupListener = ThemeEngine.initListener(() => 'system', (eff) => {
      callbackCalledWith = eff
    })

    // Simulate OS toggle to light
    matchesDark = false
    mediaQueryListeners.forEach((listener) =>
      listener({ matches: false, media: '(prefers-color-scheme: dark)' }),
    )

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(callbackCalledWith).toBe('light')

    cleanupListener()
  })

  it('ignores OS theme change if user explicitly set dark or light theme', () => {
    ThemeEngine.applyTheme('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)

    let callbackCalled = false
    ThemeEngine.initListener(() => 'light', () => {
      callbackCalled = true
    })

    // Simulate OS toggle to dark
    matchesDark = true
    mediaQueryListeners.forEach((listener) =>
      listener({ matches: true, media: '(prefers-color-scheme: dark)' }),
    )

    // Should remain light
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(callbackCalled).toBe(false)
  })
})
