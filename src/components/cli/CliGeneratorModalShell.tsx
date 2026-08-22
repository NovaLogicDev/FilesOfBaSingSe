import React, { useState } from 'react'
import { X, Copy, Check, Terminal, Info, FolderDown } from 'lucide-react'
import { CliGeneratorEngine } from '../../engines/cli'
import { usePersistentStore } from '../../store/persistentStore'
import { useToastStore } from '../../store/toastStore'

interface CliGeneratorModalShellProps {
  isOpen: boolean
  selectedPaths: string[]
  onClose: () => void
}

export const CliGeneratorModalShell: React.FC<CliGeneratorModalShellProps> = ({
  isOpen,
  selectedPaths,
  onClose,
}) => {
  const { savedBucketName, savedProjectId } = usePersistentStore()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab] = useState<'gcloud' | 'gsutil'>('gcloud')
  const [destinationDir, setDestinationDir] = useState('./destination_folder/')
  const [isCopied, setIsCopied] = useState(false)

  if (!isOpen) return null

  const command =
    activeTab === 'gcloud'
      ? CliGeneratorEngine.generateGcloudCommand({
          bucketName: savedBucketName,
          selectedPaths,
          userProject: savedProjectId,
          destinationDir,
        })
      : CliGeneratorEngine.generateGsutilCommand({
          bucketName: savedBucketName,
          selectedPaths,
          userProject: savedProjectId,
          destinationDir,
        })

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setIsCopied(true)
      addToast({
        type: 'success',
        title: 'Command Copied',
        message: 'CLI command copied to clipboard.',
      })
      setTimeout(() => setIsCopied(false), 2000)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cli-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cli-modal-title" className="text-base font-bold text-white">
                Automated Batch & CLI Command Generator
              </h2>
              <p className="text-xs text-slate-400">
                {selectedPaths.length} asset{selectedPaths.length === 1 ? '' : 's'} selected &bull; Multi-threaded shell transfer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 text-xs font-semibold px-6 pt-3 space-x-4">
          <button
            onClick={() => setActiveTab('gcloud')}
            className={`pb-3 transition-colors border-b-2 flex items-center space-x-1.5 ${
              activeTab === 'gcloud'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Google Cloud CLI (gcloud storage)</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Recommended
            </span>
          </button>

          <button
            onClick={() => setActiveTab('gsutil')}
            className={`pb-3 transition-colors border-b-2 ${
              activeTab === 'gsutil'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Legacy gsutil Script</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          {/* Destination Directory Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Local Destination Directory:
            </label>
            <div className="relative">
              <FolderDown className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={destinationDir}
                onChange={(e) => setDestinationDir(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Formatted Code Block */}
          <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-emerald-300 overflow-x-auto max-h-56 leading-relaxed select-all">
            <pre>{command}</pre>
          </div>

          {/* Firefox / Terminal Notice */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start space-x-3 text-xs text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Multi-threaded terminal transfers support automatic resume and run directly on your workstation or headless render nodes with your active GCP billing account pre-configured.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            Close
          </button>

          <button
            onClick={handleCopy}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-md shadow-cyan-950/40"
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{isCopied ? 'Copied to Clipboard!' : 'Copy Command'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
