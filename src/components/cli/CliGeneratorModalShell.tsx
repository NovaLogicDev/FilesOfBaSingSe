import React, { useState } from 'react'
import { X, Copy, Check, Terminal, Info, FolderDown, AlertTriangle } from 'lucide-react'
import { CliGeneratorEngine } from '../../engines/cli'
import { BrowserCapabilityDetector } from '../../services/streamDownloadService'
import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'

interface CliGeneratorModalShellProps {
  isOpen: boolean
  selectedPaths: string[]
  isFirefoxNotice?: boolean
  onClose: () => void
}

export const CliGeneratorModalShell: React.FC<CliGeneratorModalShellProps> = ({
  isOpen,
  selectedPaths,
  isFirefoxNotice = false,
  onClose,
}) => {
  const { savedBucketName, savedProjectId } = usePersistentStore()
  const { oauthToken } = useRuntimeStore()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab] = useState<'gcloud' | 'gsutil' | 'curl'>('gcloud')
  const [destinationDir, setDestinationDir] = useState('./destination_folder/')
  const [isCopied, setIsCopied] = useState(false)

  if (!isOpen) return null

  const showFirefoxBanner = isFirefoxNotice || BrowserCapabilityDetector.isFirefox()

  let command = ''
  if (activeTab === 'gcloud') {
    command = CliGeneratorEngine.generateGcloudCommand({
      bucketName: savedBucketName,
      selectedPaths,
      userProject: savedProjectId,
      destinationDir,
    })
  } else if (activeTab === 'gsutil') {
    command = CliGeneratorEngine.generateGsutilCommand({
      bucketName: savedBucketName,
      selectedPaths,
      userProject: savedProjectId,
      destinationDir,
    })
  } else {
    command = CliGeneratorEngine.generateCurlCommand({
      bucketName: savedBucketName,
      selectedPaths,
      userProject: savedProjectId,
      oauthToken: oauthToken || undefined,
    })
  }

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
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-500/10 border border-cyan-300 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cli-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                Automated Batch & CLI Command Generator
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedPaths.length} asset{selectedPaths.length === 1 ? '' : 's'} selected &bull; Multi-threaded shell transfer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold px-6 pt-3 space-x-4">
          <button
            onClick={() => setActiveTab('gcloud')}
            className={`pb-3 transition-colors border-b-2 flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'gcloud'
                ? 'border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>Google Cloud CLI (gcloud storage)</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-100 dark:bg-cyan-500/10 text-cyan-800 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/20">
              Recommended
            </span>
          </button>

          <button
            onClick={() => setActiveTab('gsutil')}
            className={`pb-3 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'gsutil'
                ? 'border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>Legacy gsutil Script</span>
          </button>

          <button
            onClick={() => setActiveTab('curl')}
            className={`pb-3 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'curl'
                ? 'border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>Direct cURL (HTTPS)</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          {/* Firefox Compatibility Notice Banner */}
          {showFirefoxBanner && (
            <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block text-amber-800 dark:text-amber-300">Firefox Compatibility Notice</strong>
                <p className="mt-0.5 text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  Multi-GB direct browser streaming is optimized for Chromium (Chrome/Edge) and Safari. For Firefox, use our 1-click CLI script generator or switch to Chrome.
                </p>
              </div>
            </div>
          )}

          {/* Destination Directory Input (shown for gcloud and gsutil) */}
          {activeTab !== 'curl' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Local Destination Directory:
              </label>
              <div className="relative">
                <FolderDown className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={destinationDir}
                  onChange={(e) => setDestinationDir(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* Formatted Code Block (Always Dark Terminal Theme for Contrast) */}
          <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-emerald-300 overflow-x-auto max-h-56 leading-relaxed select-all shadow-inner">
            <pre>{command}</pre>
          </div>

          {/* Notice */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start space-x-3 text-xs text-slate-600 dark:text-slate-400">
            <Info className="w-4 h-4 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {activeTab === 'curl'
                ? 'Direct HTTPS transfers using cURL bypass browser memory limits and stream directly to local disk with client billing attribution.'
                : 'Multi-threaded terminal transfers support automatic resume and run directly on your workstation or headless render nodes with your active GCP billing account pre-configured.'}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between transition-colors">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            onClick={handleCopy}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-md shadow-cyan-500/10 dark:shadow-cyan-950/40 cursor-pointer"
          >
            {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{isCopied ? 'Copied to Clipboard!' : 'Copy Command'}</span>
          </button>
        </div>
      </div>

    </div>
  )
}

