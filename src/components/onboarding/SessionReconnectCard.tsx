import React, { useState } from 'react'
import {
  KeyRound,
  ShieldCheck,
  Zap,
  RotateCcw,
  AlertCircle,
  Database,
  Building2,
} from 'lucide-react'

export interface SessionReconnectCardProps {
  userEmail?: string | null
  userName?: string | null
  savedProjectId: string
  savedBucketName: string
  onReconnect: () => Promise<void> | void
  onReconfigure: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

export const SessionReconnectCard: React.FC<SessionReconnectCardProps> = ({
  userEmail,
  userName,
  savedProjectId,
  savedBucketName,
  onReconnect,
  onReconfigure,
  isLoading = false,
  errorMessage = null,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleReconnectClick = async () => {
    setIsSubmitting(true)
    try {
      await onReconnect()
    } finally {
      setIsSubmitting(false)
    }
  }

  const busy = isLoading || isSubmitting

  return (
    <div
      data-testid="session-reconnect-card"
      className="py-12 px-4 max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-300"
    >
      <div className="rounded-2xl bg-white dark:bg-slate-900/90 border border-emerald-500/40 p-6 sm:p-8 shadow-2xl shadow-emerald-500/10 dark:shadow-emerald-950/40 relative overflow-hidden backdrop-blur-md transition-colors">
        {/* Glow ambient background decoration */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Card Header */}
        <div className="flex items-start justify-between gap-4 mb-6 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Resume Google Cloud Session
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                  Config Saved
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Zero-token session continuity enabled
              </p>
            </div>
          </div>
        </div>

        {/* User Identity Welcome */}
        <div className="mb-6 relative z-10">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Welcome back{userName ? `, ${userName}` : ''}!
            {userEmail && (
              <span className="font-mono text-emerald-600 dark:text-emerald-400 ml-1.5 font-medium">
                ({userEmail})
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Your workspace configuration is preserved in your browser. Please re-authenticate your Google account to restore directory access and direct streaming.
          </p>
        </div>

        {/* Active Configuration Summary Box */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-4 mb-6 space-y-3 relative z-10">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Active Target Workspace</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-start space-x-2 bg-white dark:bg-slate-900/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/80">
              <Building2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Billed GCP Project</div>
                <div className="font-mono text-slate-800 dark:text-slate-200 truncate font-medium">
                  {savedProjectId || 'Unset'}
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-2 bg-white dark:bg-slate-900/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/80">
              <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Target GCS Bucket</div>
                <div className="font-mono text-emerald-700 dark:text-emerald-300 truncate font-medium">
                  {savedBucketName || 'Unset'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error / Alert Message if renewal encountered issue */}
        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start space-x-2.5 relative z-10">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">Interactive Re-Authentication Required: </span>
              <span className="text-amber-800 dark:text-amber-300/90">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 relative z-10">
          <button
            type="button"
            data-testid="reconnect-button"
            disabled={busy}
            onClick={handleReconnectClick}
            className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            {busy ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Re-Authenticating...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Reconnect Google Session (1-Click)</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="reconfigure-button"
            disabled={busy}
            onClick={onReconfigure}
            className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center space-x-1.5 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Switch Account / Reconfigure</span>
          </button>
        </div>
      </div>
    </div>

  )
}
