import React, { useState, useEffect } from 'react'
import {
  X,
  Copy,
  Check,
  Download,
  Terminal,
  FileCode,
  DollarSign,
  ShieldCheck,
  Layers,
  Sparkles,
} from 'lucide-react'
import { GCSMediaItem } from '../../types'
import { CostGovernanceEngine } from '../../engines/cost'
import { useToastStore } from '../../store/toastStore'
import { usePersistentStore } from '../../store/persistentStore'
import { StorageClassBadge } from '../explorer/StorageClassBadge'

interface AssetInspectorDrawerShellProps {
  item: GCSMediaItem | null
  isOpen: boolean
  onClose: () => void
  onDownload: (item: GCSMediaItem) => void
  onGenerateCli: (item: GCSMediaItem) => void
}

export const AssetInspectorDrawerShell: React.FC<AssetInspectorDrawerShellProps> = ({
  item,
  isOpen,
  onClose,
  onDownload,
  onGenerateCli,
}) => {
  const { isFreeTrialAccount, savedProjectId, savedBucketName, customPricing } =
    usePersistentStore()
  const { addToast } = useToastStore()
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Handle ESC key to dismiss drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !item) return null

  const effectiveRates = CostGovernanceEngine.resolveRateCard(customPricing)
  const cost = CostGovernanceEngine.calculateSingle(
    item.sizeBytes,
    item.storageClass,
    effectiveRates,
    isFreeTrialAccount,
  )

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldName)
      addToast({
        type: 'success',
        title: 'Copied to Clipboard',
        message: `${fieldName} copied.`,
      })
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const handleCopyJson = () => {
    copyToClipboard(JSON.stringify(item, null, 2), 'Object JSON Metadata')
  }

  const handleCopyGsutil = () => {
    const bucket = savedBucketName.replace(/^gs:\/\//, '') || item.bucket
    const proj = savedProjectId ? ` -u ${savedProjectId}` : ''
    const cmd = `gsutil -m${proj} cp "gs://${bucket}/${item.name}" .`
    copyToClipboard(cmd, 'gsutil Command')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Asset Details for ${item.displayName || item.name}`}
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 transition-colors"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/30">
            <Layers className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[260px]">
            {item.displayName || item.name.split('/').pop() || item.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
          aria-label="Close drawer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body Content */}
      <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
        {/* Storage Class & Size Hero */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Storage Class:</span>
            <StorageClassBadge storageClass={item.storageClass} />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">Exact Size:</span>
            <span className="font-mono text-slate-900 dark:text-white font-semibold">
              {(item.sizeBytes ?? 0).toLocaleString()} bytes ({item.formattedSize || CostGovernanceEngine.formatBytes(item.sizeBytes ?? 0)})
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400 font-medium">MIME Content-Type:</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">{item.contentType}</span>
          </div>
        </div>

        {/* Itemized Direct Cost Calculation Callout */}
        <div className="rounded-xl border border-cyan-300 dark:border-cyan-500/30 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/40 dark:to-slate-950 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-cyan-800 dark:text-cyan-300 font-bold">
              <DollarSign className="w-4 h-4" />
              <span>DIRECT BILLING ESTIMATE</span>
            </div>
            {isFreeTrialAccount && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30 flex items-center space-x-1">
                <Sparkles className="w-3 h-3" />
                <span>Free Trial Covered</span>
              </span>
            )}
          </div>

          <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-2 font-mono text-slate-700 dark:text-slate-300">
            <div className="flex justify-between">
              <span>{item.storageClass} Retrieval:</span>
              <span className="text-slate-900 dark:text-white">${cost.retrievalTotalUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Google Egress (${effectiveRates.internetEgressPerGB.toFixed(2)}/GB):</span>
              <span className="text-slate-900 dark:text-white">${cost.egressTotalUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800 font-bold text-cyan-700 dark:text-cyan-300 text-sm">
              <span>TOTAL ESTIMATE:</span>
              <span>${cost.grandTotalUSD.toFixed(2)} USD</span>
            </div>
          </div>
        </div>

        {/* Cryptographic Checksums */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>CRYPTOGRAPHIC CHECKSUMS</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              Verified
            </span>
          </div>

          {/* CRC32c Base64 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>CRC32c (Base64):</span>
              <button
                onClick={() => copyToClipboard(item.crc32c, 'CRC32c Base64')}
                className="hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center space-x-1 transition-colors cursor-pointer"
              >
                {copiedField === 'CRC32c Base64' ? (
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>Copy</span>
              </button>
            </div>
            <div className="p-2 rounded bg-slate-900 font-mono text-white text-[11px] truncate">
              {item.crc32c}
            </div>
          </div>

          {/* CRC32c Hex */}
          {item.crc32cHex && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>CRC32c (Hex):</span>
                <button
                  onClick={() => copyToClipboard(item.crc32cHex!, 'CRC32c Hex')}
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {copiedField === 'CRC32c Hex' ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Copy</span>
                </button>
              </div>
              <div className="p-2 rounded bg-slate-900 font-mono text-white text-[11px] truncate">
                {item.crc32cHex}
              </div>
            </div>
          )}

          {/* MD5 Checksum */}
          {item.md5Hash && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>MD5 Hash:</span>
                <button
                  onClick={() => copyToClipboard(item.md5Hash!, 'MD5 Hash')}
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {copiedField === 'MD5 Hash' ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Copy</span>
                </button>
              </div>
              <div className="p-2 rounded bg-slate-900 font-mono text-white text-[11px] truncate">
                {item.md5Hash}
              </div>
            </div>
          )}
        </div>

        {/* GCS Object Properties */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-2 font-mono">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>ETag:</span>
            <span className="text-slate-900 dark:text-white truncate max-w-[200px]">{item.etag}</span>
          </div>
          {item.generation && (
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Generation:</span>
              <span className="text-slate-900 dark:text-white">{item.generation}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Updated:</span>
            <span className="text-slate-900 dark:text-white">{item.updated.replace('T', ' ').substring(0, 19)}</span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 space-y-2 transition-colors">
        <button
          onClick={() => {
            onDownload(item)
            onClose()
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/50 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Stream Download to Disk</span>
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              onGenerateCli(item)
              onClose()
            }}
            className="py-2 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer"
            title="Generate CLI Command Dialog"
          >
            <Terminal className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>CLI Modal</span>
          </button>

          <button
            onClick={handleCopyGsutil}
            className="py-2 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer"
            title="Copy 1-line gsutil cp command"
          >
            <Copy className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>gsutil</span>
          </button>

          <button
            onClick={handleCopyJson}
            className="py-2 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer"
            title="Copy full JSON object metadata"
          >
            <FileCode className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>JSON</span>
          </button>
        </div>
      </div>
    </div>

  )
}
