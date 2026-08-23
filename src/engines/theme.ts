export type ThemeMode = 'dark' | 'light' | 'system'

export class ThemeEngine {
  private static activeCleanup: (() => void) | null = null

  /**
   * Reads the current operating system color scheme preference.
   */
  public static getSystemPreference(): 'dark' | 'light' {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return 'dark'
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  /**
   * Resolves the effective 'dark' | 'light' theme based on user preference or OS setting.
   */
  public static resolveEffectiveTheme(mode: ThemeMode): 'dark' | 'light' {
    if (mode === 'system') {
      return ThemeEngine.getSystemPreference()
    }
    return mode
  }

  /**
   * Applies the theme mode to document.documentElement and syncs with colorScheme style.
   * Returns the resolved effective theme ('dark' | 'light').
   */
  public static applyTheme(mode: ThemeMode): 'dark' | 'light' {
    const effectiveTheme = ThemeEngine.resolveEffectiveTheme(mode)

    if (typeof document !== 'undefined') {
      const root = document.documentElement

      if (effectiveTheme === 'dark') {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.remove('dark')
        root.classList.add('light')
      }

      root.setAttribute('data-theme', mode)
      root.style.colorScheme = effectiveTheme
    }

    return effectiveTheme
  }

  /**
   * Registers a listener for OS color scheme changes when system mode is active.
   */
  public static listenToSystemThemeChanges(
    onChange: (theme: 'dark' | 'light') => void,
  ): () => void {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return () => {}
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent | { matches: boolean }) => {
      onChange(e.matches ? 'dark' : 'light')
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else if ((mediaQuery as any).addListener) {
      ;(mediaQuery as any).addListener(handler)
      return () => (mediaQuery as any).removeListener(handler)
    }

    return () => {}
  }

  /**
   * Initializes dynamic listener that auto-applies theme when OS color scheme changes and mode is 'system'.
   */
  public static initListener(
    getMode: () => ThemeMode,
    onChange?: (theme: 'dark' | 'light') => void,
  ): () => void {
    ThemeEngine.cleanup()

    const cleanup = ThemeEngine.listenToSystemThemeChanges((effectiveTheme) => {
      const currentMode = getMode()
      if (currentMode === 'system') {
        ThemeEngine.applyTheme('system')
        if (onChange) onChange(effectiveTheme)
      }
    })

    ThemeEngine.activeCleanup = cleanup
    return cleanup
  }

  /**
   * Cleans up any registered system theme listeners.
   */
  public static cleanup(): void {
    if (ThemeEngine.activeCleanup) {
      ThemeEngine.activeCleanup()
      ThemeEngine.activeCleanup = null
    }
  }
}

