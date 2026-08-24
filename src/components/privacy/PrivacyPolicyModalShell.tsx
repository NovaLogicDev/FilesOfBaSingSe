import React from 'react'
import {
  X,
  ShieldCheck,
  ExternalLink,
  Lock,
  EyeOff,
  FileText,
  ServerOff,
  CheckCircle2,
} from 'lucide-react'

interface PrivacyPolicyModalShellProps {
  isOpen: boolean
  onClose: () => void
}

export const PrivacyPolicyModalShell: React.FC<PrivacyPolicyModalShellProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="privacy-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                Privacy Policy &amp; Google API Trust &amp; Safety
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Zero-Backend Architecture &bull; Zero Telemetry &bull; Principle of Least Privilege
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Close Privacy Policy"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {/* Executive Overview Highlight */}
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" />
              <span>Core Privacy Guarantees</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              <strong>Files of Ba Sing Se</strong> is an open-source, client-side application. We operate <strong>zero intermediary backend servers</strong>, collect <strong>zero telemetry or tracking beacons</strong>, and store all Google OAuth tokens <strong>exclusively in temporary volatile RAM</strong>.
            </p>
          </div>

          {/* Section 1: Architecture */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <ServerOff className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>1. Zero-Backend Client Execution</span>
            </h3>
            <p>
              All API interactions execute directly from your web browser runtime to official Google Cloud endpoints (<code className="font-mono text-emerald-700 dark:text-emerald-400">storage.googleapis.com</code>, <code className="font-mono text-emerald-700 dark:text-emerald-400">cloudresourcemanager.googleapis.com</code>, <code className="font-mono text-emerald-700 dark:text-emerald-400">accounts.google.com</code>). No media chunks, file metadata, or authentication credentials ever transit through a third-party server.
            </p>
          </div>

          {/* Section 2: OAuth Scopes & Least Privilege */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Lock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>2. Scopes Requested &amp; Principle of Least Privilege</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>Base Non-Sensitive Scopes</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-mono font-semibold">Default</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  <code className="font-mono text-[10px]">devstorage.read_only</code>, <code className="font-mono text-[10px]">userinfo.email</code>, <code className="font-mono text-[10px]">userinfo.profile</code>, <code className="font-mono text-[10px]">openid</code>.<br />
                  Allows 100% of GCS bucket browsing, preflight checks, and direct-to-disk streaming.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>Elevated Scope (Optional)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 font-mono font-semibold">On-Demand</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  <code className="font-mono text-[10px]">cloud-platform</code>.<br />
                  Requested <em>strictly on-demand</em> only if you choose 1-click project auto-discovery or auto-creation. If you enter your project ID manually, this is <strong>never requested</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Data Storage & Memory Isolation */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <EyeOff className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>3. Volatile In-Memory Credential Isolation</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
              <li>OAuth 2.0 access tokens reside <strong>strictly in volatile browser RAM</strong> (Zustand state).</li>
              <li>Tokens are <strong>never</strong> written to <code className="font-mono text-xs">localStorage</code>, <code className="font-mono text-xs">sessionStorage</code>, or cookies.</li>
              <li>Signing out or closing your browser tab immediately flushes memory and invokes Google's token revocation API.</li>
              <li>Only non-sensitive preferences (UI theme, target bucket string, project ID label) persist in <code className="font-mono text-xs">localStorage</code>.</li>
            </ul>
          </div>

          {/* Section 4: Zero Telemetry */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FileText className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>4. Zero Telemetry &amp; Content Security Policy</span>
            </h3>
            <p>
              The Application does not include Firebase Analytics, Google Tag Manager, Sentry, or third-party advertising cookies. Our HTTP Content Security Policy (CSP) restricts outbound network connections exclusively to official Google Cloud endpoints.
            </p>
          </div>

          {/* Section 5: Google Limited Use Statement */}
          <div className="p-4 rounded-xl border border-sky-300 dark:border-sky-500/30 bg-sky-50/70 dark:bg-sky-950/20 space-y-2">
            <div className="text-xs font-bold text-sky-900 dark:text-sky-300 uppercase tracking-wider">
              Google API Services User Data Policy Compliance
            </div>
            <p className="text-slate-800 dark:text-slate-200 italic leading-relaxed">
              "Files of Ba Sing Se's use and transfer to any other app of information received from Google APIs will adhere to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-700 dark:text-cyan-400 underline font-semibold"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements."
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
          <a
            href="/privacy.html"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:underline flex items-center space-x-1"
          >
            <span>Open Standalone Privacy Document</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 transition-colors cursor-pointer shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
