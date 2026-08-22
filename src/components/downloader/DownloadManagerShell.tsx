import React from 'react'
import {
  X,
  Minus,
  Maximize2,
  Zap,
  Clock,
  ShieldCheck,
  HardDrive,
  Cpu,
} from 'lucide-react'
import { useRuntimeStore } from '../../store/runtimeStore'
import { usePersistentStore } from '../../store/persistentStore'
import { CostGovernanceEngine } from '../../engines/cost'

export const DownloadManagerShell: React.FC = () => {
  const {
    activeDownload,
    isDownloadMinimized,
    setDownloadMinimized,
    abortActiveDownload,
    setDownloadProgress,
  } = useRuntimeStore()
  const { savedProjectId } = usePersistentStore()

  if (!activeDownload) return null

  const isComplete = activeDownload.status === 'completed'
  const isCancelled = activeDownload.status === 'cancelled'
  const isStreaming = activeDownload.status === 'streaming' || activeDownload.status === 'verifying'

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
          className="p-1 hover:text-emerald-400"
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
      className="fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-md overflow-hidden text-xs flex flex-col animate-in slide-in-from-bottom-4 duration-200"
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
            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDownloadProgress(null)}
            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
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
            <span className="font-semibold text-white truncate max-w-[220px]">
              {activeDownload.itemName}
            </span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              {activeDownload.percentage}%
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
            Billed to: <strong className="text-slate-300">{savedProjectId}</strong>
          </p>
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
              <span>Fixed Heap:</span>
            </div>
            <div className="text-emerald-300 font-bold mt-0.5">
              ~{activeDownload.memoryHeapMB.toFixed(1)} MB (Stable)
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
      </div>

      {/* Footer Controls */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <span className="text-[10px] text-slate-500 font-mono">
          Elapsed: {activeDownload.formattedElapsed}
        </span>
        {isStreaming && (
          <button
            onClick={abortActiveDownload}
            className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-200 font-semibold text-xs transition-colors"
          >
            Cancel Download
          </button>
        )}
        {isComplete && (
          <button
            onClick={() => setDownloadProgress(null)}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all"
          >
            Done
          </button>
        )}
      </div>
    </aside>
  )
}
