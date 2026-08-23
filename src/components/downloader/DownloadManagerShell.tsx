import React, { useState } from 'react'
import {
  X,
  Minus,
  Maximize2,
  Zap,
  Clock,
  ShieldCheck,
  HardDrive,
  Cpu,
  FolderOpen,
  Copy,
  Check,
  Search,
  Settings2,
  FileCheck,
  ExternalLink,
} from 'lucide-react'
import { useRuntimeStore } from '../../store/runtimeStore'
import { usePersistentStore } from '../../store/persistentStore'
import { useToastStore } from '../../store/toastStore'
import { CostGovernanceEngine } from '../../engines/cost'
import { OSFileSystemRevealEngine } from '../../engines/osFileSystemReveal'
import { LocalHandleInspectionResult } from '../../types/osFileSystem'

export const DownloadManagerShell: React.FC = () => {
  const {
    activeDownload,
    isDownloadMinimized,
    setDownloadMinimized,
    abortActiveDownload,
    setDownloadProgress,
  } = useRuntimeStore()
  const {
    savedProjectId,
    preferredDownloadStrategy,
    setPreferredDownloadStrategy,
  } = usePersistentStore()
  const { addToast } = useToastStore()

  const [copiedReveal, setCopiedReveal] = useState(false)
  const [handleInspection, setHandleInspection] = useState<LocalHandleInspectionResult | null>(null)
  const [isInspectingHandle, setIsInspectingHandle] = useState(false)

  if (!activeDownload) return null

  const isComplete = activeDownload.status === 'completed'
  const isCancelled = activeDownload.status === 'cancelled'
  const isStreaming = activeDownload.status === 'streaming' || activeDownload.status === 'verifying'

  const revealAction =
    activeDownload.revealAction ||
    OSFileSystemRevealEngine.generateRevealAction(activeDownload.itemName)

  const handleCopyRevealCommand = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(revealAction.command)
        setCopiedReveal(true)
        setTimeout(() => setCopiedReveal(false), 2500)
        addToast({
          type: 'success',
          title: 'Reveal Command Copied',
          message: `Run in terminal to reveal in ${revealAction.osMetadata.fileManagerLabel}: ${revealAction.command}`,
        })
      }
    } catch {
      addToast({
        type: 'info',
        title: 'Reveal Command',
        message: revealAction.command,
      })
    }
  }

  const handleInspectDiskHandle = async () => {
    if (!activeDownload.fileHandle) {
      addToast({
        type: 'info',
        title: 'Local Handle Information',
        message: `File saved to disk as "${activeDownload.itemName}". Direct handle reference was finalized.`,
      })
      return
    }

    setIsInspectingHandle(true)
    try {
      const res = await OSFileSystemRevealEngine.inspectLocalHandle(activeDownload.fileHandle)
      setHandleInspection(res)
      if (res) {
        addToast({
          type: 'success',
          title: 'Local File Verified on Disk',
          message: `Verified ${res.formattedSize} (${res.sizeBytes} bytes) on local filesystem.`,
        })
      } else {
        addToast({
          type: 'warning',
          title: 'Disk Verification Notice',
          message: 'File handle closed or file moved outside browser.',
        })
      }
    } finally {
      setIsInspectingHandle(false)
    }
  }

  const handleToggleStrategy = () => {
    const nextStrategy = preferredDownloadStrategy === 'service_worker' ? 'fsaa' : 'service_worker'
    setPreferredDownloadStrategy(nextStrategy)
    addToast({
      type: 'info',
      title: 'Download Strategy Updated',
      message:
        nextStrategy === 'service_worker'
          ? 'Switched to Chrome Download Manager (Service Worker stream). Downloads will appear in chrome://downloads.'
          : 'Switched to Direct-to-Disk (File System Access API). Stream directly to chosen folder.',
    })
  }

  // Minimized Compact Pill Bar
  if (isDownloadMinimized) {
    return (
      <aside
        aria-label="Active Download"
        className="fixed bottom-4 right-4 z-50 flex items-center space-x-3 px-4 py-2.5 rounded-full bg-slate-900/95 border border-emerald-500/40 text-xs text-white shadow-2xl backdrop-blur-md cursor-pointer hover:border-emerald-400 transition-all"
        onClick={() => setDownloadMinimized(false)}
      >
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-semibold truncate max-w-[140px]">{activeDownload.itemName}</span>
        <span className="font-mono text-emerald-400 font-bold">{activeDownload.percentage}%</span>
        <span className="font-mono text-slate-400">({activeDownload.formattedSpeed})</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setDownloadMinimized(false)
          }}
          className="p-1 hover:text-emerald-400 cursor-pointer"
          aria-label="Expand Download Manager"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </aside>
    )
  }

  // Full Expanded Card
  return (
    <aside
      aria-label="Active Download Manager"
      className="fixed bottom-4 right-4 z-50 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-md overflow-hidden text-xs flex flex-col animate-in slide-in-from-bottom-4 duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isComplete
                ? 'bg-emerald-400'
                : isCancelled
                ? 'bg-rose-400'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span className="font-bold text-white tracking-tight">ACTIVE DOWNLOAD MANAGER</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setDownloadMinimized(true)}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDownloadProgress(null)}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
            title="Close"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-3.5">
        {/* Item Title & Billed Project */}
        <div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white truncate max-w-[260px]">
              {activeDownload.itemName}
            </span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              {activeDownload.percentage}%
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px] text-slate-400 font-mono">
              Billed to: <strong className="text-slate-300">{savedProjectId}</strong>
            </p>
            {/* Strategy Badge */}
            {(!activeDownload.strategy || activeDownload.strategy === 'fsaa') && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                [FSAA Direct-to-Disk]
              </span>
            )}
            {activeDownload.strategy === 'service_worker' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                [Service Worker Stream]
              </span>
            )}
            {activeDownload.strategy === 'memory_blob' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                [Memory Blob (&lt;200MB)]
              </span>
            )}
            {activeDownload.strategy === 'cli_companion' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                [CLI Companion]
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-200 rounded-full ${
              isComplete
                ? 'bg-emerald-500'
                : isCancelled
                ? 'bg-rose-500'
                : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400'
            }`}
            style={{ width: `${activeDownload.percentage}%` }}
          />
        </div>

        {/* Live Transfer Telemetry Metrics */}
        <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400 text-[10px] flex items-center space-x-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Speed:</span>
            </div>
            <div className="text-white font-bold mt-0.5">{activeDownload.formattedSpeed}</div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400 text-[10px] flex items-center space-x-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>ETA:</span>
            </div>
            <div className="text-white font-bold mt-0.5">{activeDownload.formattedETA}</div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400 text-[10px] flex items-center space-x-1">
              <HardDrive className="w-3 h-3 text-emerald-400" />
              <span>Transferred:</span>
            </div>
            <div className="text-slate-200 mt-0.5">
              {CostGovernanceEngine.formatBytes(activeDownload.loadedBytes)} /{' '}
              {CostGovernanceEngine.formatBytes(activeDownload.totalBytes)}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="text-slate-400 text-[10px] flex items-center space-x-1">
              <Cpu className="w-3 h-3 text-indigo-400" />
              <span>{activeDownload.strategy === 'memory_blob' ? 'Allocated Heap:' : 'Fixed Heap:'}</span>
            </div>
            <div className="text-emerald-300 font-bold mt-0.5">
              ~{activeDownload.memoryHeapMB.toFixed(1)} MB {activeDownload.strategy === 'memory_blob' ? '(In-Memory)' : '(Stable)'}
            </div>
          </div>
        </div>

        {/* Cryptographic Verification Status */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300 text-[11px]">
              {isComplete
                ? 'CRC32c Checksum Verified Match'
                : activeDownload.status === 'verifying'
                ? 'Verifying CRC32c Digest...'
                : 'Live CRC32c Integrity Stream Active'}
            </span>
          </div>
          {isComplete && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              100% OK
            </span>
          )}
        </div>

        {/* Post-Download OS File Manager Reveal Section (Module 12) */}
        {isComplete && (
          <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white text-xs">
                  Reveal in {revealAction.osMetadata.fileManagerLabel}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                [✓ Flushed to Local Disk]
              </span>
            </div>

            {/* Command Preview */}
            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 break-all select-all">
              {revealAction.command}
            </div>

            {/* Direct Clickable Hyperlink & Action Buttons */}
            <div className="space-y-2">
              <a
                href={revealAction.fileUri}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-emerald-950/40 cursor-pointer text-center"
              >
                <FolderOpen className="w-4 h-4 flex-shrink-0" />
                <span>Open in {revealAction.osMetadata.fileManagerLabel}</span>
                <ExternalLink className="w-3.5 h-3.5 ml-0.5 opacity-80" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyRevealCommand}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-semibold text-[11px] flex items-center justify-center space-x-1 transition-all cursor-pointer"
                >
                  {copiedReveal ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedReveal ? 'Command Copied!' : `Copy Shell Command`}</span>
                </button>

                {activeDownload.fileHandle && (
                  <button
                    type="button"
                    onClick={handleInspectDiskHandle}
                    disabled={isInspectingHandle}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-semibold flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                    title="Inspect local file properties on disk"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Inspect Disk</span>
                  </button>
                )}
              </div>
            </div>

            {/* Handle Inspection Details Dropdown */}
            {handleInspection && (
              <div className="mt-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1 font-mono text-[10px] text-slate-300">
                <div className="flex items-center space-x-1 text-emerald-400 font-semibold mb-1">
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Verified On-Disk Properties:</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">File Name:</span>
                  <span className="text-white truncate max-w-[200px]">{handleInspection.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">On-Disk Size:</span>
                  <span className="text-emerald-300">{handleInspection.formattedSize} ({handleInspection.sizeBytes.toLocaleString()} bytes)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Modified:</span>
                  <span className="text-slate-300">{handleInspection.lastModifiedDate}</span>
                </div>
              </div>
            )}

            {/* Chromium direct-to-disk note & Strategy Quick Toggle */}
            <div className="pt-1 border-t border-slate-900 text-[10px] text-slate-400 space-y-1">
              <p className="leading-tight">
                Chrome direct disk streams bypass <code className="text-slate-300 font-mono">chrome://downloads</code>. Use the command above to open your file manager.
              </p>
              <button
                type="button"
                onClick={handleToggleStrategy}
                className="text-cyan-400 hover:text-cyan-300 text-[10px] flex items-center space-x-1 underline cursor-pointer"
              >
                <Settings2 className="w-3 h-3" />
                <span>
                  {preferredDownloadStrategy === 'service_worker'
                    ? 'Active: Chrome Downloads Shelf (Click to switch to Direct-to-Disk)'
                    : 'Prefer Chrome Downloads shelf? Switch to Service Worker Stream'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <span className="text-[10px] text-slate-500 font-mono">
          Elapsed: {activeDownload.formattedElapsed}
        </span>
        {isStreaming && (
          <button
            onClick={abortActiveDownload}
            className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-200 font-semibold text-xs transition-colors cursor-pointer"
          >
            Cancel Download
          </button>
        )}
        {isComplete && (
          <button
            onClick={() => setDownloadProgress(null)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md"
          >
            Done
          </button>
        )}
      </div>
    </aside>
  )
}
