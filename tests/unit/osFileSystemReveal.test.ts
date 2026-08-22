import { describe, it, expect, vi } from 'vitest'
import { OSFileSystemRevealEngine } from '../../src/engines/osFileSystemReveal'

describe('Engine 10: OSFileSystemRevealEngine (MOD-12)', () => {
  describe('detectOS', () => {
    it('detects macOS environment correctly', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'MacIntel',
      }
      const meta = OSFileSystemRevealEngine.detectOS(mockNav)
      expect(meta.os).toBe('macos')
      expect(meta.desktopEnvironment).toBe('macos')
      expect(meta.fileManager).toBe('finder')
      expect(meta.fileManagerLabel).toBe('Finder')
      expect(meta.iconName).toBe('apple')
    })

    it('detects Windows environment correctly', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'Win32',
      }
      const meta = OSFileSystemRevealEngine.detectOS(mockNav)
      expect(meta.os).toBe('windows')
      expect(meta.desktopEnvironment).toBe('windows')
      expect(meta.fileManager).toBe('explorer')
      expect(meta.fileManagerLabel).toBe('File Explorer')
      expect(meta.iconName).toBe('monitor')
    })

    it('detects Linux KDE environment correctly', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; KDE) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'Linux x86_64',
      }
      const meta = OSFileSystemRevealEngine.detectOS(mockNav)
      expect(meta.os).toBe('linux')
      expect(meta.desktopEnvironment).toBe('kde')
      expect(meta.fileManager).toBe('dolphin')
      expect(meta.fileManagerLabel).toBe('Dolphin')
    })

    it('detects Linux GNOME environment correctly', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; GNOME) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        platform: 'Linux x86_64',
      }
      const meta = OSFileSystemRevealEngine.detectOS(mockNav)
      expect(meta.os).toBe('linux')
      expect(meta.desktopEnvironment).toBe('gnome')
      expect(meta.fileManager).toBe('nautilus')
      expect(meta.fileManagerLabel).toBe('Files (Nautilus)')
    })

    it('falls back to generic file manager when navigator is undefined', () => {
      const meta = OSFileSystemRevealEngine.detectOS(null)
      expect(meta.os).toBe('unknown')
      expect(meta.fileManager).toBe('generic')
      expect(meta.fileManagerLabel).toBe('File Manager')
    })
  })

  describe('Shell Escaping', () => {
    it('escapes POSIX shell single quotes correctly', () => {
      expect(OSFileSystemRevealEngine.escapePosix("reel'04_final.mxf")).toBe("reel'\\''04_final.mxf")
      expect(OSFileSystemRevealEngine.escapePosix("simple_file.mov")).toBe("simple_file.mov")
    })

    it('escapes Windows PowerShell double quotes correctly', () => {
      expect(OSFileSystemRevealEngine.escapeWindows('reel"04_final.mxf')).toBe('reel`"04_final.mxf')
      expect(OSFileSystemRevealEngine.escapeWindows('simple_file.mov')).toBe('simple_file.mov')
    })
  })

  describe('generateRevealAction', () => {
    it('generates accurate macOS Finder reveal command', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
      }
      const action = OSFileSystemRevealEngine.generateRevealAction('reel04_cam_A_raw.mxf', './', mockNav)
      expect(action.filename).toBe('reel04_cam_A_raw.mxf')
      expect(action.command).toBe('open -R "./reel04_cam_A_raw.mxf"')
      expect(action.fileUri).toBe('file://./reel04_cam_A_raw.mxf')
      expect(action.copyFeedbackText).toContain('Finder')
    })

    it('generates accurate Windows Explorer reveal command', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
      }
      const action = OSFileSystemRevealEngine.generateRevealAction('reel04_cam_A_raw.mxf', './', mockNav)
      expect(action.command).toBe('explorer.exe /select,"reel04_cam_A_raw.mxf"')
      expect(action.powershellCommand).toBe('Invoke-Item (Get-Item "reel04_cam_A_raw.mxf")')
    })

    it('generates accurate Linux Dolphin reveal command', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; KDE)',
        platform: 'Linux x86_64',
      }
      const action = OSFileSystemRevealEngine.generateRevealAction('reel04_cam_A_raw.mxf', './', mockNav)
      expect(action.command).toBe('dolphin --select "./reel04_cam_A_raw.mxf"')
    })

    it('generates accurate Linux Nautilus reveal command', () => {
      const mockNav = {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; GNOME)',
        platform: 'Linux x86_64',
      }
      const action = OSFileSystemRevealEngine.generateRevealAction('reel04_cam_A_raw.mxf', './', mockNav)
      expect(action.command).toBe('nautilus --select "./reel04_cam_A_raw.mxf"')
    })
  })

  describe('inspectLocalHandle', () => {
    it('returns verified file properties for active FileSystemFileHandle', async () => {
      const mockFile = new File(['sample bytes'], 'test_video.mp4', {
        type: 'video/mp4',
        lastModified: 1740000000000,
      })
      const mockHandle = {
        getFile: vi.fn().mockResolvedValue(mockFile),
      }

      const res = await OSFileSystemRevealEngine.inspectLocalHandle(mockHandle)
      expect(res).not.toBeNull()
      expect(res?.filename).toBe('test_video.mp4')
      expect(res?.sizeBytes).toBe(mockFile.size)
      expect(res?.mimeType).toBe('video/mp4')
      expect(res?.isHandleValid).toBe(true)
    })

    it('returns null if handle is invalid or getFile fails', async () => {
      expect(await OSFileSystemRevealEngine.inspectLocalHandle(null)).toBeNull()
      expect(await OSFileSystemRevealEngine.inspectLocalHandle({})).toBeNull()

      const failingHandle = {
        getFile: vi.fn().mockRejectedValue(new Error('Handle closed or file moved')),
      }
      expect(await OSFileSystemRevealEngine.inspectLocalHandle(failingHandle)).toBeNull()
    })
  })

  describe('formatBytes helper', () => {
    it('formats bytes into human-readable strings', () => {
      expect(OSFileSystemRevealEngine.formatBytes(0)).toBe('0 B')
      expect(OSFileSystemRevealEngine.formatBytes(1000)).toBe('1 KB')
      expect(OSFileSystemRevealEngine.formatBytes(1_000_000)).toBe('1 MB')
      expect(OSFileSystemRevealEngine.formatBytes(18_400_000_000)).toBe('18.4 GB')
    })
  })
})
