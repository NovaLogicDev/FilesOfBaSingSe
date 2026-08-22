/**
 * Storage Boundary & Token Hygiene Security Auditor
 * Enforces Zero-Host-Liability & Zero-Credential Leakage constraints.
 * Asserts that OAuth tokens, refresh tokens, and private keys never touch persistent disk storage.
 */
export class StorageBoundaryAuditor {
  private static FORBIDDEN_KEYS_OR_PATTERNS = [
    'oauth',
    'token',
    'bearer',
    'secret',
    'private_key',
    'client_secret',
    'refresh_token',
    'credential',
    'service_account',
  ]

  /**
   * Scans localStorage and sessionStorage for any prohibited keys or values.
   * Returns true if 100% clean, throws or returns violations if detected.
   */
  public static audit(): {
    isClean: boolean
    violations: string[]
    localStorageKeys: string[]
  } {
    const violations: string[] = []
    const localStorageKeys: string[] = []

    // 1. Audit LocalStorage
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) continue
        localStorageKeys.push(key)

        // Check if key itself is forbidden
        const lowerKey = key.toLowerCase()
        if (
          this.FORBIDDEN_KEYS_OR_PATTERNS.some((p) => lowerKey.includes(p)) &&
          key !== 'basingse-media-client-prefs'
        ) {
          violations.push(`Prohibited key in localStorage: "${key}"`)
        }

        // Inspect value of basingse-media-client-prefs
        const value = localStorage.getItem(key) || ''
        if (
          value.includes('ya29.') ||
          value.includes('"oauthToken"') ||
          value.includes('BEGIN PRIVATE KEY')
        ) {
          violations.push(`Sensitive token signature found in localStorage key: "${key}"`)
        }
      }
    } catch {
      // Storage access blocked or unavailable
    }

    // 2. Audit SessionStorage
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (!key) continue

        const value = sessionStorage.getItem(key) || ''
        if (
          value.includes('ya29.') ||
          value.includes('"oauthToken"') ||
          value.includes('BEGIN PRIVATE KEY')
        ) {
          violations.push(`Sensitive token signature found in sessionStorage key: "${key}"`)
        }
      }
    } catch {
      // Storage access blocked
    }

    return {
      isClean: violations.length === 0,
      violations,
      localStorageKeys,
    }
  }

  /**
   * Emergency purge of all persistent storage if a security anomaly is suspected.
   */
  public static emergencyPurge(): void {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // Storage clear blocked
    }
  }
}
