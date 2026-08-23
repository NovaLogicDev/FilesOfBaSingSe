import React from 'react'
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore, ToastItem } from '../../store/toastStore'

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <aside
      aria-label="Notifications"
      className="fixed top-4 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </aside>
  )
}

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({
  toast,
  onDismiss,
}) => {
  const iconMap = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />,
  }

  const borderMap = {
    success: 'border-emerald-500/40 bg-white/95 text-emerald-950 dark:bg-slate-900/95 dark:text-emerald-100 shadow-emerald-500/10 dark:shadow-emerald-950/40',
    info: 'border-cyan-500/40 bg-white/95 text-cyan-950 dark:bg-slate-900/95 dark:text-cyan-100 shadow-cyan-500/10 dark:shadow-cyan-950/40',
    warning: 'border-amber-500/40 bg-white/95 text-amber-950 dark:bg-slate-900/95 dark:text-amber-100 shadow-amber-500/10 dark:shadow-amber-950/40',
    error: 'border-rose-500/40 bg-white/95 text-rose-950 dark:bg-slate-900/95 dark:text-rose-100 shadow-rose-500/10 dark:shadow-rose-950/40',
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all flex items-start space-x-3 ${borderMap[toast.type]}`}
    >
      {iconMap[toast.type]}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{toast.title}</h4>
        {toast.message && (
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-md transition-colors cursor-pointer"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

