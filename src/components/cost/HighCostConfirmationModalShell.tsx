import React from 'react'
import { AlertTriangle, X, CheckCircle2 } from 'lucide-react'
import { CalculatedCostResult } from '../../types'
import { usePersistentStore } from '../../store/persistentStore'

interface HighCostConfirmationModalShellProps {
  isOpen: boolean
  costResult: CalculatedCostResult | null
  onConfirm: () => void
  onCancel: () => void
}

export const HighCostConfirmationModalShell: React.FC<
  HighCostConfirmationModalShellProps
> = ({ isOpen, costResult, onConfirm, onCancel }) => {
  const { savedProjectId, isFreeTrialAccount } = usePersistentStore()

  if (!isOpen || !costResult) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="high-cost-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/80 dark:bg-amber-950/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="high-cost-title" className="text-base font-bold text-slate-900 dark:text-white">
                High-Volume / Cold-Tier Transfer Confirmation
              </h2>
              <p className="text-xs text-amber-700 dark:text-amber-400/90 font-medium">
                Estimated charge exceeds standard threshold ($5.00+ or 25GB+)
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            You are about to initiate a transfer of{' '}
            <strong className="text-slate-900 dark:text-white">
              {costResult.itemCount} asset{costResult.itemCount === 1 ? '' : 's'} (
              {costResult.formattedTotalSize})
            </strong>
            . Google Cloud Storage will bill the following retrieval and internet egress fees directly to your GCP project:
          </p>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2 font-mono">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Target Billing Project:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{savedProjectId}</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Archive/Coldline Retrieval:</span>
              <span className="text-slate-900 dark:text-white">${costResult.retrievalTotalUSD.toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Google Internet Egress ($0.12/GB):</span>
              <span className="text-slate-900 dark:text-white">${costResult.egressTotalUSD.toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-cyan-700 dark:text-cyan-300 font-bold text-sm">
              <span>ESTIMATED TOTAL:</span>
              <span>${costResult.grandTotalUSD.toFixed(2)} USD</span>
            </div>
          </div>

          {isFreeTrialAccount && (
            <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 text-indigo-800 dark:text-indigo-300 text-[11px] flex items-center space-x-2">
              <span className="text-base">✨</span>
              <span>
                Your account is eligible for Google's $300 Free Trial credits. This charge will be credited against your trial balance.
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between transition-colors">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-md shadow-amber-500/10 dark:shadow-amber-950/40 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirm & Incur ~${costResult.grandTotalUSD.toFixed(2)} Charge</span>
          </button>
        </div>
      </div>

    </div>
  )
}
