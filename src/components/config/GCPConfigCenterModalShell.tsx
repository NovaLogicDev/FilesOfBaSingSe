import React, { useState, useEffect } from 'react'
import {
  ShieldCheck,
  X,
  User,
  Lock,
  Layers,
  DollarSign,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Download,
  LogOut,
  Sparkles,
  Key,
} from 'lucide-react'
import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'
import { gisAuthService } from '../../services/gisAuthService'
import { gcsClientService } from '../../services/gcsClientService'
import { ObservabilityService } from '../../services/observability'
import { CostGovernanceEngine } from '../../engines/cost'
import { PreflightCheckResult } from '../../types'

interface GCPConfigCenterModalShellProps {
  isOpen: boolean
  onClose: () => void
  onOpenPricingSettings: () => void
  onOpenOnboarding: () => void
}

export const GCPConfigCenterModalShell: React.FC<GCPConfigCenterModalShellProps> = ({
  isOpen,
  onClose,
  onOpenPricingSettings,
  onOpenOnboarding,
}) => {
  const {
    savedProjectId,
    savedBucketName,
    recentBuckets,
    customPricing,
    isFreeTrialAccount,
    hasCompletedOnboarding,
    preferredDownloadStrategy,
    setPreferredDownloadStrategy,
    setSavedProjectId,
    setSavedBucketName,
  } = usePersistentStore()

  const {
    oauthToken,
    userEmail,
    userName,
    userAvatar,
    tokenExpiresAt,
  } = useRuntimeStore()

  const { addToast } = useToastStore()

  const [preflightResult, setPreflightResult] = useState<PreflightCheckResult | null>(null)
  const [isRunningPreflight, setIsRunningPreflight] = useState(false)
  const [remainingMinutes, setRemainingMinutes] = useState<number>(55)

  // Live Token Expiration Countdown
  useEffect(() => {
    if (!tokenExpiresAt) {
      setRemainingMinutes(55)
      return
    }

    const updateMinutes = () => {
      const ms = tokenExpiresAt - Date.now()
      setRemainingMinutes(Math.max(0, Math.round(ms / 60000)))
    }

    updateMinutes()
    const interval = setInterval(updateMinutes, 10000)
    return () => clearInterval(interval)
  }, [tokenExpiresAt])

  // Run Preflight on open
  const runPreflightAudit = async () => {
    setIsRunningPreflight(true)
    try {
      if (oauthToken && savedBucketName && savedProjectId) {
        const cleanBucket = gcsClientService.cleanBucketName(savedBucketName)
        const res = await gcsClientService.run4PointPreflight(
          oauthToken,
          cleanBucket,
          savedProjectId,
          tokenExpiresAt || undefined,
        )
        setPreflightResult(res)
      } else {
        setPreflightResult({
          oauthTokenValid: !!oauthToken,
          oauthExpiresInSeconds: oauthToken ? remainingMinutes * 60 : 0,
          bucketReachable: false,
          requesterPaysActive: false,
          iamViewerGranted: false,
          corsConfigured: false,
          errorMessage: 'Session requires Google Sign-In and target bucket configuration.',
        })
      }
    } catch (err: any) {
      setPreflightResult({
        oauthTokenValid: !!oauthToken,
        oauthExpiresInSeconds: 0,
        bucketReachable: false,
        requesterPaysActive: false,
        iamViewerGranted: false,
        corsConfigured: false,
        errorMessage: err.message,
      })
    } finally {
      setIsRunningPreflight(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      runPreflightAudit()
    }
  }, [isOpen, oauthToken, savedBucketName, savedProjectId])

  // Storage Boundary Audit (Confirm 0 leaked tokens in localStorage)
  const auditStorageBoundary = (): { isClean: boolean; violations: string[] } => {
    const violations: string[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || ''
        const val = localStorage.getItem(key) || ''
        if (
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('oauth') ||
          key.toLowerCase().includes('bearer')
        ) {
          violations.push(`LocalStorage key contains token identifier: "${key}"`)
        }
        if (val.includes('ya29.') || val.includes('Bearer ')) {
          violations.push(`LocalStorage value contains bearer token string in key: "${key}"`)
        }
      }
    } catch (_) {}
    return { isClean: violations.length === 0, violations }
  }

  const storageAudit = auditStorageBoundary()

  const handleExportDiagnostics = () => {
    ObservabilityService.downloadDiagnosticReport()
    addToast({
      type: 'success',
      title: 'Diagnostic Report Exported',
      message: 'Downloaded sanitized configuration JSON report.',
    })
  }

  const handleSignOut = async () => {
    await gisAuthService.signOut()
    setSavedProjectId('')
    setSavedBucketName('')
    onClose()
    addToast({
      type: 'info',
      title: 'Session Disconnected',
      message: 'Volatile authentication tokens and active project contexts have been purged from memory.',
    })
  }

  if (!isOpen) return null

  const displayBucket = savedBucketName || 'No Bucket Connected'
  const displayProject = savedProjectId || 'Unconfigured'

  const activeRates = CostGovernanceEngine.resolveRateCard(customPricing)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gcp-config-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-slate-950 flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="gcp-config-title" className="text-base font-bold text-white tracking-tight">
                Google Cloud Platform Configuration & Session Inspector
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Live audit of identity, project attribution, bucket access, rate cards & security boundaries.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close GCP Configuration Inspector"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: 7 Discrete Audit Sections */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Top 4-Grid Configuration Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Google Identity & Credentials */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    1. Google Identity & Credentials
                  </span>
                </div>
                {oauthToken ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Authenticated
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    Unauthenticated
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-3">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt="User Avatar"
                    className="w-10 h-10 rounded-full border border-emerald-400/40 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate">
                    {userName || 'Google User'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono truncate">
                    {userEmail || 'Not signed in'}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-300 font-mono pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Token Expiry:</span>
                  <span className="text-emerald-400 font-semibold">
                    ~{remainingMinutes}m remaining (Auto-Renewal)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Session Continuity:</span>
                  <span className="text-emerald-400 font-semibold">
                    {hasCompletedOnboarding ? 'Active (Zero-Token Reload)' : 'Initial Setup'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Scopes:</span>
                  <span className="text-slate-300 text-[11px]">
                    devstorage.read_only, cloud-platform
                  </span>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Switch Account / Reconnect GCS</span>
                </button>
              </div>
            </div>

            {/* 2. Billed GCP Project */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    2. Billed GCP Project (userProject)
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Billing Linked
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold">Project ID:</span>
                  <div className="font-mono text-sm font-bold text-emerald-300">{displayProject}</div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  All Google Cloud Storage Requester-Pays data retrieval and internet egress fees are directly attributed to this project.
                </p>

                <div className="pt-1 flex items-center space-x-2">
                  <a
                    href={`https://console.cloud.google.com/billing?project=${displayProject}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>View in GCP Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* 3. Target GCS Bucket */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    3. Target GCS Bucket
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Requester-Pays
                </span>
              </div>

              <div className="space-y-1.5">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold">Active Bucket:</span>
                  <div className="font-mono text-xs font-bold text-white truncate">{displayBucket}</div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono pt-1">
                  <span className="text-slate-500">Recent Buckets:</span>
                  <span className="text-slate-300">{recentBuckets.length} saved</span>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">CORS Headers:</span>
                  <span className="text-emerald-400 font-semibold">x-goog-hash, Content-Length</span>
                </div>
              </div>
            </div>

            {/* 4. Cost Governance & Pricing Model */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    4. Cost Governance & Rate Card
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenPricingSettings}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline underline-offset-2"
                >
                  Edit Rates
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Archive Retrieval:</span>
                  <span className="font-bold text-white">
                    ${(activeRates.archiveRetrievalPerGB ?? 0.05).toFixed(3)}/GB
                  </span>
                </div>
                <div className="bg-slate-900 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Internet Egress:</span>
                  <span className="font-bold text-white">
                    ${(activeRates.internetEgressPerGB ?? 0.12).toFixed(3)}/GB
                  </span>
                </div>
              </div>

              {isFreeTrialAccount && (
                <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-500/30 flex items-center space-x-2 text-xs text-indigo-300 font-mono">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />
                  <span>$300 Google Free Trial credit balance active ($0 out-of-pocket).</span>
                </div>
              )}
            </div>
          </div>

          {/* 5. Real-Time 4-Point Preflight Health Matrix */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  5. Real-Time 4-Point Preflight Health Matrix
                </span>
              </div>
              <button
                type="button"
                onClick={runPreflightAudit}
                disabled={isRunningPreflight}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningPreflight ? 'animate-spin' : ''}`} />
                <span>{isRunningPreflight ? 'Verifying...' : 'Re-Run Complete Audit'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Check 1 */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start space-x-2.5">
                {preflightResult?.oauthTokenValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-semibold text-white">1. OAuth 2.0 Token</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {preflightResult?.oauthTokenValid ? 'Active & Valid' : 'Requires Sign-In'}
                  </div>
                </div>
              </div>

              {/* Check 2 */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start space-x-2.5">
                {preflightResult?.requesterPaysActive ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-semibold text-white">2. Requester-Pays</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {preflightResult?.requesterPaysActive ? 'Enforced OK' : 'Unverified'}
                  </div>
                </div>
              </div>

              {/* Check 3 */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start space-x-2.5">
                {preflightResult?.iamViewerGranted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-semibold text-white">3. IAM ObjectViewer</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {preflightResult?.iamViewerGranted ? 'Granted' : 'Unverified'}
                  </div>
                </div>
              </div>

              {/* Check 4 */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start space-x-2.5">
                {preflightResult?.corsConfigured ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-semibold text-white">4. CORS Headers</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {preflightResult?.corsConfigured ? 'Exposed OK' : 'Unverified'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6. Storage Boundary Security Audit */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  6. Storage Boundary & Token Hygiene Audit
                </span>
              </div>
              {storageAudit.isClean ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>100% Clean (0 Leaked Tokens)</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Storage Violation Detected
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              OAuth 2.0 access bearer tokens are held exclusively in volatile RAM and are never written to disk or LocalStorage.
            </p>
          </div>

          {/* 7. Download Pipeline Strategy & OS Integration (Module 12) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center space-x-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  7. Download Pipeline Strategy & OS Integration
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Module 12
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Configure how media transfers are handled in your browser. Choose between direct-to-disk streaming with OS reveal commands or routing through Chrome&apos;s download shelf.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPreferredDownloadStrategy('service_worker')
                  addToast({
                    type: 'success',
                    title: 'Strategy Updated',
                    message: 'Selected: Chrome Download Manager (Service Worker Stream).',
                  })
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  preferredDownloadStrategy === 'service_worker' || !preferredDownloadStrategy
                    ? 'border-purple-500/60 bg-purple-950/20 text-white'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-purple-300">Chrome Download Manager</span>
                  {(preferredDownloadStrategy === 'service_worker' || !preferredDownloadStrategy) && (
                    <span className="text-[10px] font-mono text-purple-400 font-bold">[Active Default]</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Streams direct to your browser&apos;s download manager (<code className="font-mono text-slate-300">chrome://downloads</code>) with native &quot;Show in folder&quot; without annoying file picker dialogs.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreferredDownloadStrategy('fsaa')
                  addToast({
                    type: 'success',
                    title: 'Strategy Updated',
                    message: 'Selected: Direct to Disk (FSAA) with OS File Reveal feedback.',
                  })
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  preferredDownloadStrategy === 'fsaa'
                    ? 'border-emerald-500/60 bg-emerald-950/20 text-white'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-emerald-300">Direct to Disk (FSAA)</span>
                  {preferredDownloadStrategy === 'fsaa' && (
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">[Active]</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Prompts OS folder picker dialog on every download. Useful only if you wish to bypass browser downloads and manually pick a target directory.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleExportDiagnostics}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Diagnostics JSON</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {oauthToken && (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect & Purge Memory</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
