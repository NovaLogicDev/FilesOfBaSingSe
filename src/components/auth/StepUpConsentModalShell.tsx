import React from 'react'
import {
  X,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Edit3,
  Lock,
} from 'lucide-react'

interface StepUpConsentModalShellProps {
  isOpen: boolean
  onClose: () => void
  onConfirmStepUp: () => void
  onSwitchToManual?: () => void
  reason?: 'discovery' | 'creation'
}

export const StepUpConsentModalShell: React.FC<StepUpConsentModalShellProps> = ({
  isOpen,
  onClose,
  onConfirmStepUp,
  onSwitchToManual,
  reason = 'discovery',
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-up-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="step-up-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                GCP Project Automation Permission
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Principle of Least Privilege &bull; Contextual Consent
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

        {/* Body Content */}
        <div className="p-6 space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {reason === 'creation'
              ? 'To automatically create a dedicated media project and enable Google Cloud Storage for you, Google requires elevated Cloud Resource Manager permissions.'
              : 'To automatically scan and list your existing Google Cloud projects in a dropdown, Google requires Cloud Resource Manager read permissions.'}
          </p>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
              <span className="flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Requested Elevated Scope:</span>
              </span>
              <span className="font-mono text-[11px] text-cyan-700 dark:text-cyan-400 font-bold">
                cloud-platform
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Your credentials remain strictly client-side on your browser. Tokens are never sent to third-party backend servers.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-500/30 flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
              <strong>Prefer zero elevated permissions?</strong> You can skip this and type your GCP Project ID manually. GCS media browsing and streaming will work with 100% functionality under base read-only permissions.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          {onSwitchToManual ? (
            <button
              onClick={() => {
                onClose()
                onSwitchToManual()
              }}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Enter Project ID Manually</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            onClick={() => {
              onClose()
              onConfirmStepUp()
            }}
            className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
          >
            <span>Grant Permission with Google</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
