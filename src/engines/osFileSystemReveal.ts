import {
  LocalFileRevealAction,
  LocalHandleInspectionResult,
  OSFileSystemMetadata,
} from '../types/osFileSystem'

/**
 * OS File System Feedback & File Manager Reveal Engine
 * Module 12: MOD-12-OS-FILESYSTEM-FEEDBACK / Engine 10
 */
export class OSFileSystemRevealEngine {
  /**
   * Detects client operating system and desktop environment heuristics.
   */
  public static detectOS(customNavigator?: any): OSFileSystemMetadata {
    const nav = customNavigator || (typeof navigator !== 'undefined' ? navigator : null)

    if (!nav) {
      return {
        os: 'unknown',
        desktopEnvironment: 'generic',
        fileManager: 'generic',
        fileManagerLabel: 'File Manager',
        iconName: 'folder',
      };
    }

    const ua = nav.userAgent || ''
    const platform = nav.userAgentData?.platform || nav.platform || ''

    // 1. macOS (Apple Finder)
    if (/Macintosh|MacIntel|MacPPC|Mac68K|Darwin/i.test(platform) || /Mac OS X/i.test(ua)) {
      return {
        os: 'macos',
        desktopEnvironment: 'macos',
        fileManager: 'finder',
        fileManagerLabel: 'Finder',
        iconName: 'apple',
      }
    }

    // 2. Windows (File Explorer)
    if (/Win32|Win64|Windows|WinCE/i.test(platform) || /Windows NT/i.test(ua)) {
      return {
        os: 'windows',
        desktopEnvironment: 'windows',
        fileManager: 'explorer',
        fileManagerLabel: 'File Explorer',
        iconName: 'monitor',
      }
    }

    // 3. Linux (Dolphin / Nautilus / XDG)
    if (/Linux/i.test(platform) || /Linux|X11/i.test(ua)) {
      const isKDE = /KDE/i.test(ua)
      const isGNOME = /GNOME/i.test(ua)

      if (isKDE) {
        return {
          os: 'linux',
          desktopEnvironment: 'kde',
          fileManager: 'dolphin',
          fileManagerLabel: 'Dolphin',
          iconName: 'folder-open',
        }
      }

      if (isGNOME) {
        return {
          os: 'linux',
          desktopEnvironment: 'gnome',
          fileManager: 'nautilus',
          fileManagerLabel: 'Files (Nautilus)',
          iconName: 'folder-open',
        }
      }

      return {
        os: 'linux',
        desktopEnvironment: 'generic',
        fileManager: 'dolphin', // Default preferred for media workstations & Dolphin support
        fileManagerLabel: 'File Manager (Dolphin / Files)',
        iconName: 'folder-open',
      }
    }

    return {
      os: 'unknown',
      desktopEnvironment: 'generic',
      fileManager: 'generic',
      fileManagerLabel: 'File Manager',
      iconName: 'folder',
    }
  }

  /**
   * Safely escapes filenames for POSIX shells (bash, zsh).
   */
  public static escapePosix(filename: string): string {
    return filename.replace(/'/g, "'\\''")
  }

  /**
   * Safely escapes filenames for Windows PowerShell / CMD.
   */
  public static escapeWindows(filename: string): string {
    return filename.replace(/"/g, '`"')
  }

  /**
   * Synthesizes OS-specific reveal commands and file URI metadata.
   */
  public static generateRevealAction(
    filename: string,
    suggestedDirectory: string = './',
    customNavigator?: any,
  ): LocalFileRevealAction {
    const osMeta = this.detectOS(customNavigator)
    const cleanFilename = filename.trim()
    let command = ''
    let powershellCommand: string | undefined = undefined

    switch (osMeta.fileManager) {
      case 'finder':
        command = `open -R "./${this.escapePosix(cleanFilename)}"`
        break
      case 'explorer':
        command = `explorer.exe /select,"${this.escapeWindows(cleanFilename)}"`
        powershellCommand = `Invoke-Item (Get-Item "${this.escapeWindows(cleanFilename)}")`
        break
      case 'dolphin':
        command = `dolphin --select "./${this.escapePosix(cleanFilename)}"`
        break
      case 'nautilus':
        command = `nautilus --select "./${this.escapePosix(cleanFilename)}"`;
        break
      case 'xdg':
      default:
        command = `xdg-open .`
        break
    }

    const fileUri = `file://${suggestedDirectory.replace(/\/+$/, '')}/${encodeURIComponent(cleanFilename)}`

    return {
      filename: cleanFilename,
      suggestedDirectory,
      osMetadata: osMeta,
      command,
      powershellCommand,
      fileUri,
      copyFeedbackText: `Copied reveal command for ${osMeta.fileManagerLabel}: ${command}`,
    }
  }

  /**
   * Re-verifies local file presence on disk using active FileSystemFileHandle.
   */
  public static async inspectLocalHandle(
    handle: any,
  ): Promise<LocalHandleInspectionResult | null> {
    if (!handle || typeof handle.getFile !== 'function') {
      return null
    }

    try {
      const file: File = await handle.getFile()
      return {
        filename: file.name,
        sizeBytes: file.size,
        formattedSize: this.formatBytes(file.size),
        lastModified: file.lastModified,
        lastModifiedDate: new Date(file.lastModified).toISOString(),
        mimeType: file.type || 'application/octet-stream',
        isHandleValid: true,
      }
    } catch {
      return null
    }
  }

  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1000
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}
