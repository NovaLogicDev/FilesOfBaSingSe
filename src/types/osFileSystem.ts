/**
 * Operating System and File Manager Reveal Types
 * Module 12: MOD-12-OS-FILESYSTEM-FEEDBACK
 */

export type SupportedOS = 'macos' | 'windows' | 'linux' | 'unknown'
export type FileManagerTarget = 'finder' | 'explorer' | 'dolphin' | 'nautilus' | 'xdg' | 'generic'

export interface OSFileSystemMetadata {
  os: SupportedOS
  desktopEnvironment: 'kde' | 'gnome' | 'xfce' | 'generic' | 'windows' | 'macos'
  fileManager: FileManagerTarget
  fileManagerLabel: string // e.g. "Finder", "File Explorer", "Dolphin"
  iconName: string
}

export interface LocalFileRevealAction {
  filename: string
  suggestedDirectory?: string
  osMetadata: OSFileSystemMetadata
  command: string
  powershellCommand?: string
  fileUri: string
  copyFeedbackText: string
}

export interface LocalHandleInspectionResult {
  filename: string
  sizeBytes: number
  formattedSize: string
  lastModified: number
  lastModifiedDate: string
  mimeType: string
  isHandleValid: boolean
}
