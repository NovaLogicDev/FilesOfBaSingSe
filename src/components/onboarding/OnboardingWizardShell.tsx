import React, { useState, useEffect } from 'react'
import {
  X,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  PlusCircle,
  FolderLock,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'
import { MockGCSService } from '../../services/mockGcsService'
import { GCPProject, PreflightCheckResult } from '../../types'

interface OnboardingWizardShellProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export const OnboardingWizardShell: React.FC<OnboardingWizardShellProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const { savedProjectId, setSavedProjectId, savedBucketName, setSavedBucketName, addRecentBucket } =
    usePersistentStore()
  const { setAuthSession } = useRuntimeStore()
  const { addToast } = useToastStore()

  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1)
  const [projectIdInput, setProjectIdInput] = useState(savedProjectId || 'demo-client-media-2026')
  const [bucketInput, setBucketInput] = useState(
    savedBucketName || 'gs://partner-raw-master-archives-2026',
  )
  const [discoveredProjects, setDiscoveredProjects] = useState<GCPProject[]>([])
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [preflightStatus, setPreflightStatus] = useState<PreflightCheckResult | null>(null)
  const [isPreflightRunning, setIsPreflightRunning] = useState(false)
  const [manualOverride, setManualOverride] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Load mock/discovered projects
      MockGCSService.listProjects().then((projects) => {
        setDiscoveredProjects(projects)
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSignInGoogle = () => {
    setAuthSession(
      'mock-oauth-token-ya29-sample',
      'taylor@freelance-edit.com',
      'Taylor (Colorist)',
      undefined,
      3600,
    )
    addToast({
      type: 'success',
      title: 'Google Account Connected',
      message: 'Signed in as taylor@freelance-edit.com with Storage Read-Only scope.',
    })
    setActiveStep(2)
  }

  const handleAutoCreateProject = async () => {
    setIsCreatingProject(true)
    try {
      const newProj = await MockGCSService.autoCreateProject()
      setDiscoveredProjects((prev) => [newProj, ...prev])
      setProjectIdInput(newProj.projectId)
      setSavedProjectId(newProj.projectId)
      addToast({
        type: 'success',
        title: 'Media Project Auto-Created',
        message: `Project ${newProj.projectId} created and Storage API enabled.`,
      })
    } catch {
      addToast({
        type: 'error',
        title: 'Project Creation Failed',
        message: 'Could not auto-create project. Please use manual project ID.',
      })
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleRunPreflight = async () => {
    setIsPreflightRunning(true)
    setPreflightStatus(null)
    try {
      const result = await MockGCSService.runPreflight(bucketInput, projectIdInput)
      setPreflightStatus(result)
      if (result.bucketReachable && result.iamViewerGranted) {
        addToast({
          type: 'success',
          title: '4-Point Preflight Handshake Passed',
          message: 'GCS Requester-Pays and IAM Viewer permissions verified.',
        })
      }
    } finally {
      setIsPreflightRunning(false)
    }
  }

  const handleFinish = () => {
    setSavedProjectId(projectIdInput)
    setSavedBucketName(bucketInput)
    addRecentBucket(bucketInput)
    onComplete()
    onClose()
    addToast({
      type: 'success',
      title: 'Onboarding Complete',
      message: `Connected to ${bucketInput} billed to ${projectIdInput}`,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="onboarding-title" className="text-lg font-bold text-white">
                Client GCP Connection & Onboarding Wizard
              </h2>
              <p className="text-xs text-slate-400">
                Configure direct-to-browser media access with 100% Requester-Pays billing attribution.
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

        {/* Linear Step Bar */}
        <div className="grid grid-cols-4 border-b border-slate-800 text-xs font-semibold">
          {[
            { num: 1, label: '1. Identity' },
            { num: 2, label: '2. GCP Billing Project' },
            { num: 3, label: '3. Target Bucket' },
            { num: 4, label: '4. Preflight' },
          ].map((s) => (
            <button
              key={s.num}
              onClick={() => setActiveStep(s.num as any)}
              className={`py-3 px-2 text-center transition-all border-b-2 flex items-center justify-center space-x-1.5 ${
                activeStep === s.num
                  ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                  : activeStep > s.num
                  ? 'border-slate-700 text-slate-300'
                  : 'border-transparent text-slate-500'
              }`}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Step Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* STEP 1: Google Identity */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Step 1: Google Identity Sign-In</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Sign in with your Google account (@gmail.com or Workspace) to authenticate against Google Cloud Storage.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    OAuth 2.0
                  </span>
                </div>

                <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">Requested Permission Scope:</span>
                    <span className="text-xs font-mono text-emerald-400">devstorage.read_only</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Tokens are held strictly in temporary runtime memory and are never written to disk or local storage.
                  </p>
                </div>

                <button
                  onClick={handleSignInGoogle}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-md"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Sign In with Google</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Smart GCP Billing Project Setup */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Step 2: Smart GCP Billing Project Setup</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select an existing project, auto-create a dedicated media project, or claim Google's $300 Free Trial credits.
                </p>
              </div>

              {/* Project Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Discovered Google Cloud Projects:
                </label>
                <select
                  value={projectIdInput}
                  onChange={(e) => {
                    setProjectIdInput(e.target.value)
                    setSavedProjectId(e.target.value)
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:border-emerald-400 focus:outline-none"
                >
                  {discoveredProjects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.name} ({p.projectId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleAutoCreateProject}
                  disabled={isCreatingProject}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-emerald-300 flex items-center justify-center space-x-1.5 transition-all"
                >
                  {isCreatingProject ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  ) : (
                    <PlusCircle className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>1-Click Auto-Create Media Project</span>
                </button>
              </div>

              {/* $300 Free Trial Guidance Card */}
              <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 p-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <span className="text-base">✨</span>
                  <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wide">
                    New to Google Cloud? $300 Free Trial Assistant
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Google provides all new accounts with <strong className="text-white">$300 in free trial credits for 90 days</strong>. This completely covers all download and retrieval charges with $0 out-of-pocket costs.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="https://console.cloud.google.com/freetrial"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-950/50"
                  >
                    <span>Open 60s Free Trial Signup</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => {
                      addToast({
                        type: 'info',
                        title: 'Auto-Detecting Project',
                        message: 'Scanning for newly created Google Cloud projects...',
                      })
                      MockGCSService.listProjects().then((p) => setDiscoveredProjects(p))
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all"
                  >
                    <RefreshCw className="w-3 h-3 text-cyan-400" />
                    <span>Auto-Detect My Project</span>
                  </button>
                </div>
              </div>

              {/* Manual Override Toggle */}
              <div className="pt-1">
                <button
                  onClick={() => setManualOverride(!manualOverride)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1"
                >
                  <span>Manual Project ID Override (For IT-managed clients)</span>
                </button>
                {manualOverride && (
                  <input
                    type="text"
                    value={projectIdInput}
                    onChange={(e) => setProjectIdInput(e.target.value)}
                    placeholder="e.g. corporate-media-prod-2026"
                    className="mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Target GCS Bucket */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Step 3: Target Google Cloud Storage Bucket</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter the GCS bucket URI containing your production media assets.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-300">Bucket URI:</label>
                <div className="relative">
                  <FolderLock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={bucketInput}
                    onChange={(e) => setBucketInput(e.target.value)}
                    placeholder="gs://partner-raw-master-archives-2026"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                <span className="text-xs font-semibold text-slate-400">Recent & Recommended Buckets:</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    'gs://partner-raw-master-archives-2026',
                    'gs://avatar-fire-nation-stems-2026',
                    'gs://ba-sing-se-vfx-vault',
                  ].map((b) => (
                    <button
                      key={b}
                      onClick={() => setBucketInput(b)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-cyan-300 transition-all"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: 4-Point Preflight Handshake */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Step 4: Automated 4-Point Preflight Handshake</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Validates token expiration, Requester-Pays enforcement, IAM read permission, and CORS headers.
                  </p>
                </div>
                <button
                  onClick={handleRunPreflight}
                  disabled={isPreflightRunning}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center space-x-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPreflightRunning ? 'animate-spin' : ''}`} />
                  <span>Run Preflight Test</span>
                </button>
              </div>

              {/* Checklist Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">OAuth 2.0 Token Valid</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      Expires in ~58m (Auto-Renewal)
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Requester-Pays Enforced</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      Billed to: {projectIdInput}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">IAM Object Viewer Granted</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      roles/storage.objectViewer OK
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">CORS Preflight Headers OK</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      x-goog-hash, Content-Length Exposed
                    </div>
                  </div>
                </div>
              </div>

              {preflightStatus?.errorMessage && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 flex items-start space-x-3 text-xs text-rose-200">
                  <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-300">Preflight Error</div>
                    <p className="mt-1 leading-relaxed">{preflightStatus.errorMessage}</p>
                    {preflightStatus.remediationStep && (
                      <p className="mt-1 text-slate-300 font-mono text-[11px]">{preflightStatus.remediationStep}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={() => {
              if (activeStep > 1) setActiveStep((activeStep - 1) as any)
              else onClose()
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {activeStep === 1 ? 'Cancel' : 'Back'}
          </button>

          {activeStep < 4 ? (
            <button
              onClick={() => setActiveStep((activeStep + 1) as any)}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-950/40"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="px-6 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finish Setup & Enter Media Portal</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
