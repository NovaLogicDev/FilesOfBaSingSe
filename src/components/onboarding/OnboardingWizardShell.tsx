import React, { useState, useEffect } from 'react'
import {
  X,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  FolderLock,
  ArrowRight,
  AlertTriangle,
  User,
  Users,
  Check,
  Sparkles,
  CreditCard,
  Copy,
  Plus,
} from 'lucide-react'
import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'
import { gisAuthService } from '../../services/gisAuthService'
import { gcpProjectService } from '../../services/gcpProjectService'
import { gcsClientService } from '../../services/gcsClientService'
import { GCPProject, BillingStatus, ProvisioningProgress, PreflightCheckResult } from '../../types'

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
  const { oauthToken, userEmail, userName, userAvatar, tokenExpiresAt, isDemoMode } = useRuntimeStore()
  const { addToast } = useToastStore()

  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1)
  const [projectIdInput, setProjectIdInput] = useState(
    isDemoMode ? (savedProjectId || 'demo-client-media-2026') : (oauthToken ? savedProjectId : ''),
  )
  const [bucketInput, setBucketInput] = useState(
    isDemoMode ? (savedBucketName || 'gs://partner-raw-master-archives-2026') : (oauthToken ? savedBucketName : ''),
  )
  const [discoveredProjects, setDiscoveredProjects] = useState<GCPProject[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [provisioningProgress, setProvisioningProgress] = useState<ProvisioningProgress | null>(null)
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [isCheckingBilling, setIsCheckingBilling] = useState(false)
  const [projectValidationError, setProjectValidationError] = useState<string | null>(null)
  const [bucketValidationError, setBucketValidationError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [preflightStatus, setPreflightStatus] = useState<PreflightCheckResult | null>(null)
  const [isPreflightRunning, setIsPreflightRunning] = useState(false)
  const [manualOverride, setManualOverride] = useState(false)
  const [projectSetupTab, setProjectSetupTab] = useState<'new_user' | 'existing_project' | 'auto_create'>('new_user')
  const [copiedCors, setCopiedCors] = useState(false)

  // Load GCP Projects
  useEffect(() => {
    if (!isOpen) return

    if (!oauthToken && !isDemoMode) {
      setDiscoveredProjects([])
      setProjectIdInput('')
      setBucketInput('')
      setBillingStatus(null)
      setProjectValidationError(null)
      setBucketValidationError(null)
      setPreflightStatus(null)
      setIsLoadingProjects(false)
      setProjectSetupTab('new_user')
      return
    }

    if (isDemoMode && !oauthToken) {
      const fallback = gcpProjectService.listDemoProjects()
      setDiscoveredProjects(fallback)
      setProjectSetupTab('existing_project')
      if (!projectIdInput) {
        setProjectIdInput('demo-client-media-2026')
      }
      if (!bucketInput) {
        setBucketInput('gs://partner-raw-master-archives-2026')
      }
      return
    }

    if (oauthToken) {
      setIsLoadingProjects(true)
      gcpProjectService
        .listProjects(oauthToken)
        .then((projects) => {
          setDiscoveredProjects(projects)
          if (projects.length > 0) {
            setProjectSetupTab('existing_project')
            // Only retain projectIdInput if user already had an explicit valid project in this account
            if (projectIdInput && projects.some((p) => p.projectId === projectIdInput)) {
              // keep user's active choice
            } else {
              setProjectIdInput('')
              setBillingStatus(null)
            }
          } else {
            setProjectSetupTab('new_user')
            setProjectIdInput('')
            setBillingStatus(null)
          }
        })
        .catch(() => {
          setDiscoveredProjects([])
          setProjectSetupTab('new_user')
          setProjectIdInput('')
          setBillingStatus(null)
        })
        .finally(() => {
          setIsLoadingProjects(false)
        })
    }
  }, [isOpen, oauthToken, isDemoMode])

  // Validate Project ID & Verify Billing
  useEffect(() => {
    if (!projectIdInput || projectIdInput.trim() === '') {
      setBillingStatus(null)
      setProjectValidationError(null)
      setIsCheckingBilling(false)
      return
    }

    const validation = gcpProjectService.validateProjectId(projectIdInput)
    if (!validation.valid) {
      setProjectValidationError(validation.error || 'Invalid project ID format.')
      setBillingStatus(null)
      setIsCheckingBilling(false)
      return
    }

    setProjectValidationError(null)
    setIsCheckingBilling(true)

    const checkPromise = oauthToken
      ? gcpProjectService.checkBillingStatus(oauthToken, projectIdInput)
      : Promise.resolve(gcpProjectService.checkDemoBilling(projectIdInput))

    checkPromise
      .then((status) => {
        setBillingStatus(status)
      })
      .catch(() => {
        setBillingStatus({
          projectId: projectIdInput,
          billingAccountName: '',
          billingEnabled: false,
          hasActiveBilling: false,
          warningMessage: 'Could not verify billing status.',
          remediationUrl: `https://console.cloud.google.com/billing/linkedaccount?project=${projectIdInput}`,
        })
      })
      .finally(() => {
        setIsCheckingBilling(false)
      })
  }, [projectIdInput, oauthToken])

  // Validate Bucket Name
  useEffect(() => {
    if (!bucketInput || bucketInput.trim() === '') {
      setBucketValidationError(null)
      return
    }
    const val = gcsClientService.validateBucketName(bucketInput)
    if (!val.valid) {
      setBucketValidationError(val.error || 'Invalid bucket name.')
    } else {
      setBucketValidationError(null)
    }
  }, [bucketInput])

  if (!isOpen) return null

  const handleSignInGoogle = async () => {
    setIsSigningIn(true)
    try {
      const session = await gisAuthService.signIn()
      setProjectIdInput('')
      setSavedProjectId('')
      setBillingStatus(null)
      setProjectValidationError(null)
      addToast({
        type: 'success',
        title: 'Google Account Connected',
        message: `Signed in as ${session.userName || session.userEmail} (${session.userEmail})`,
      })
      setActiveStep(2)
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Sign-In Cancelled or Failed',
        message: err?.message || 'Google Sign-In was cancelled or popup closed.',
      })
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleSwitchAccount = async () => {
    setIsSigningIn(true)
    try {
      const session = await gisAuthService.switchAccount()
      setProjectIdInput('')
      setSavedProjectId('')
      setBillingStatus(null)
      setProjectValidationError(null)
      addToast({
        type: 'success',
        title: 'Account Switched',
        message: `Switched to ${session.userName || session.userEmail} (${session.userEmail})`,
      })
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Account Switch Failed',
        message: err?.message || 'Could not switch accounts.',
      })
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleAutoCreateProject = async () => {
    setIsCreatingProject(true)
    setProvisioningProgress(null)
    try {
      const result = await gcpProjectService.autoProvisionProject(
        oauthToken || '',
        (progress) => {
          setProvisioningProgress(progress)
        },
      )

      setDiscoveredProjects((prev) => {
        const exists = prev.some((p) => p.projectId === result.project.projectId)
        return exists ? prev : [result.project, ...prev]
      })
      setProjectIdInput(result.project.projectId)
      setSavedProjectId(result.project.projectId)

      if (result.billing.billingEnabled) {
        addToast({
          type: 'success',
          title: 'Media Project Auto-Created',
          message: `Project ${result.project.projectId} created, Storage API enabled & Billing active.`,
        })
      } else {
        addToast({
          type: 'warning',
          title: 'Project Created (Billing Unlinked)',
          message: `Project ${result.project.projectId} created. Please link a billing account in GCP Console.`,
        })
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Project Creation Failed',
        message: err?.message || 'Could not auto-create project. Please use manual project ID.',
      })
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleDetectNewProjects = async () => {
    setIsDetecting(true)
    addToast({
      type: 'info',
      title: 'Auto-Detecting Project',
      message: 'Scanning for newly created Google Cloud projects...',
    })
    try {
      const knownIds = discoveredProjects.map((p) => p.projectId)
      const newProjects = await gcpProjectService.detectNewProjects(oauthToken || '', knownIds)
      if (newProjects.length > 0) {
        setDiscoveredProjects((prev) => [...newProjects, ...prev])
        setProjectIdInput(newProjects[0].projectId)
        setSavedProjectId(newProjects[0].projectId)
        addToast({
          type: 'success',
          title: 'New Project Detected',
          message: `Discovered and selected project ${newProjects[0].projectId}.`,
        })
      } else {
        const allProjects = await gcpProjectService.listProjects(oauthToken || undefined)
        setDiscoveredProjects(allProjects)
        addToast({
          type: 'info',
          title: 'Project List Refreshed',
          message: `Found ${allProjects.length} active projects.`,
        })
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Auto-Detection Failed',
        message: err?.message || 'Could not detect new projects.',
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleRecheckBilling = async () => {
    if (!projectIdInput) return
    setIsCheckingBilling(true)
    try {
      const status = oauthToken
        ? await gcpProjectService.checkBillingStatus(oauthToken, projectIdInput)
        : gcpProjectService.checkDemoBilling(projectIdInput)
      setBillingStatus(status)
      if (status.billingEnabled) {
        addToast({
          type: 'success',
          title: 'Billing Linked',
          message: `Project ${projectIdInput} has active billing (${status.billingAccountName || 'Active'}).`,
        })
      } else {
        addToast({
          type: 'warning',
          title: 'Billing Still Unlinked',
          message: 'Please link a billing account in the Google Cloud Console.',
        })
      }
    } finally {
      setIsCheckingBilling(false)
    }
  }

  const handleRunPreflight = async () => {
    setIsPreflightRunning(true)
    setPreflightStatus(null)
    try {
      const cleanBucket = gcsClientService.cleanBucketName(bucketInput)
      const result =
        isDemoMode || !oauthToken
          ? await gcsClientService.runDemoPreflight(cleanBucket, projectIdInput)
          : await gcsClientService.run4PointPreflight(
              oauthToken,
              cleanBucket,
              projectIdInput,
              tokenExpiresAt || undefined,
            )
      setPreflightStatus(result)
      if (result.bucketReachable && result.iamViewerGranted && result.corsConfigured) {
        addToast({
          type: 'success',
          title: '4-Point Preflight Handshake Passed',
          message: 'GCS Requester-Pays, IAM Viewer, and CORS headers verified.',
        })
      } else if (result.errorMessage) {
        addToast({
          type: 'error',
          title: 'Preflight Check Warning',
          message: result.errorMessage,
        })
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Preflight Error',
        message: err?.message || 'Failed to run preflight check.',
      })
    } finally {
      setIsPreflightRunning(false)
    }
  }

  // Auto-run preflight when entering Step 4 for the first time
  useEffect(() => {
    if (activeStep === 4 && !preflightStatus && !isPreflightRunning) {
      handleRunPreflight()
    }
  }, [activeStep, preflightStatus, isPreflightRunning])

  const handleContinueStep = () => {
    if (activeStep === 1) {
      if (!oauthToken && !isDemoMode) {
        addToast({
          type: 'warning',
          title: 'Sign-In Required',
          message: 'Please sign in with Google or select Demo Sandbox to continue.',
        })
        return
      }
      setActiveStep(2)
    } else if (activeStep === 2) {
      if (!projectIdInput.trim()) {
        setProjectValidationError('Please select or auto-create a Google Cloud project before continuing.')
        return
      }
      const val = gcpProjectService.validateProjectId(projectIdInput)
      if (!val.valid) {
        setProjectValidationError(val.error || 'Invalid project ID format.')
        return
      }
      setProjectValidationError(null)
      setActiveStep(3)
    } else if (activeStep === 3) {
      if (!bucketInput.trim()) {
        setBucketValidationError('Please enter a target GCS bucket URI before continuing.')
        return
      }
      const val = gcsClientService.validateBucketName(bucketInput)
      if (!val.valid) {
        setBucketValidationError(val.error || 'Invalid bucket name.')
        return
      }
      setBucketValidationError(null)
      setActiveStep(4)
    }
  }

  const handleCancelOrClose = async () => {
    // If cancelling before finishing setup in live mode, sign out and clear session state
    if (!isDemoMode && (!savedProjectId || !savedBucketName || activeStep < 4 || !isPreflightPassed)) {
      await gisAuthService.signOut()
      setSavedProjectId('')
      setSavedBucketName('')
    }
    setProjectIdInput('')
    setBucketInput('')
    setBillingStatus(null)
    setDiscoveredProjects([])
    setProjectValidationError(null)
    setBucketValidationError(null)
    setPreflightStatus(null)
    setActiveStep(1)
    onClose()
  }

  const handleFinish = () => {
    const cleanBucket = gcsClientService.cleanBucketName(bucketInput)
    setSavedProjectId(projectIdInput)
    setSavedBucketName(cleanBucket)
    addRecentBucket(cleanBucket)
    onComplete()
    onClose()
    addToast({
      type: 'success',
      title: 'Onboarding Complete',
      message: `Connected to gs://${cleanBucket} billed to ${projectIdInput}`,
    })
  }

  const handleCopyCorsJson = () => {
    const corsJson = JSON.stringify(
      [
        {
          origin: ['*'],
          method: ['GET', 'HEAD', 'OPTIONS'],
          responseHeader: ['x-goog-hash', 'Content-Length', 'Range', 'ETag'],
          maxAgeSeconds: 3600,
        },
      ],
      null,
      2,
    )
    navigator.clipboard.writeText(corsJson)
    setCopiedCors(true)
    setTimeout(() => setCopiedCors(false), 2000)
    addToast({
      type: 'info',
      title: 'CORS Config Copied',
      message: 'cors.json configuration copied to clipboard.',
    })
  }

  const remainingMinutes = tokenExpiresAt
    ? Math.max(1, Math.round((tokenExpiresAt - Date.now()) / 1000 / 60))
    : 58

  const isPreflightPassed =
    preflightStatus?.oauthTokenValid &&
    preflightStatus?.bucketReachable &&
    preflightStatus?.requesterPaysActive &&
    preflightStatus?.iamViewerGranted &&
    preflightStatus?.corsConfigured

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
            onClick={handleCancelOrClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
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
              className={`py-3 px-2 text-center transition-all border-b-2 flex items-center justify-center space-x-1.5 cursor-pointer ${
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

                {oauthToken ? (
                  /* Authenticated State Card */
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {userAvatar ? (
                          <img
                            src={userAvatar}
                            alt={userName || 'User'}
                            className="w-10 h-10 rounded-full border border-emerald-400 object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center font-bold text-emerald-300">
                            {userName ? userName.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-white flex items-center space-x-2">
                            <span>{userName || 'Authenticated User'}</span>
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Connected
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">{userEmail}</div>
                        </div>
                      </div>

                      <button
                        onClick={handleSwitchAccount}
                        disabled={isSigningIn}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center space-x-1.5 transition-all cursor-pointer"
                      >
                        {isSigningIn ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Users className="w-3.5 h-3.5" />
                        )}
                        <span>Switch Account</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80">
                        <span className="text-slate-400">Granted Scopes:</span>
                        <span className="font-mono text-[11px] text-emerald-400">devstorage.read_only + CRM</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80">
                        <span className="text-slate-400">Token Renewal:</span>
                        <span className="font-mono text-[11px] text-emerald-400">~{remainingMinutes}m remaining</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Unauthenticated Sign-In Card */
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-300">Requested Permission Scopes:</span>
                        <span className="text-xs font-mono text-emerald-400">devstorage.read_only, cloud-platform</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Tokens are held strictly in temporary runtime memory and are never written to disk or local storage.
                      </p>
                    </div>

                    <button
                      onClick={handleSignInGoogle}
                      disabled={isSigningIn}
                      className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                    >
                      {isSigningIn ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                      ) : (
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
                      )}
                      <span>{isSigningIn ? 'Opening Google Sign-In...' : 'Sign In with Google'}</span>
                    </button>

                    <div className="relative flex items-center justify-center pt-2">
                      <div className="border-t border-slate-800 w-full" />
                      <span className="bg-slate-950 px-3 text-[11px] text-slate-500 uppercase font-mono absolute">
                        or
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        gisAuthService.signInDemo()
                        setProjectIdInput('demo-client-media-2026')
                        setBucketInput('gs://partner-raw-master-archives-2026')
                        addToast({
                          type: 'info',
                          title: 'Demo Sandbox Initialized',
                          message: 'Exploring with synthetic GCS media assets.',
                        })
                        setActiveStep(2)
                      }}
                      className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Explore in Demo Sandbox (No Sign-In Required)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Smart GCP Billing Project Setup */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Step 2: Smart GCP Billing Project Setup</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select an existing project, claim Google's $300 Free Trial credits, or auto-create a dedicated media project.
                </p>
              </div>

              {/* 3-Tab Intent Selector */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setProjectSetupTab('new_user')}
                  className={`py-2 px-2.5 rounded-lg text-center transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    projectSetupTab === 'new_user'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span className="truncate">New to GCP ($300 Free)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectSetupTab('existing_project')}
                  className={`py-2 px-2.5 rounded-lg text-center transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    projectSetupTab === 'existing_project'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FolderLock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="truncate">Existing Projects ({discoveredProjects.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectSetupTab('auto_create')}
                  className={`py-2 px-2.5 rounded-lg text-center transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    projectSetupTab === 'auto_create'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="truncate">Auto-Create Project</span>
                </button>
              </div>

              {/* TAB 1: New to Google Cloud ($300 Free Trial Guided 2-Step Flow) */}
              {projectSetupTab === 'new_user' && (
                <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 p-4 space-y-4">
                  <div className="flex items-start space-x-2.5">
                    <div className="p-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex-shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Google Cloud $300 Free Trial Assistant (90 Days)
                      </h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        Google provides all new accounts with <strong className="text-white">$300 in free trial credits for 90 days</strong>. This completely covers all media download and retrieval charges with $0 out-of-pocket costs.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Step 1 */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] flex items-center justify-center font-mono">1</span>
                          <span>Activate $300 Credits</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Opens Google Cloud Console in a new tab. Complete the 60-second signup. Google will not auto-charge when credits expire.
                        </p>
                      </div>
                      <a
                        href="https://console.cloud.google.com/freetrial"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-indigo-950/50"
                      >
                        <span>Open 60s Free Trial Signup</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Step 2 */}
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] flex items-center justify-center font-mono">2</span>
                          <span>Link & Detect New Project</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          After completing signup in Google Console, click below. We will automatically discover and link your new project.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDetectNewProjects}
                        disabled={isDetecting}
                        className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
                        <span>Auto-Detect My Project</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Existing Projects */}
              {projectSetupTab === 'existing_project' && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300">
                      Discovered Google Cloud Projects:
                    </label>
                    {isLoadingProjects && (
                      <span className="text-[11px] text-cyan-400 flex items-center space-x-1 font-mono">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Scanning CRM API...</span>
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <select
                      value={projectIdInput}
                      onChange={(e) => {
                        setProjectIdInput(e.target.value)
                        setSavedProjectId(e.target.value)
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:border-emerald-400 focus:outline-none"
                    >
                      <option value="">
                        {discoveredProjects.length > 0
                          ? `-- Select a Google Cloud Project (${discoveredProjects.length} available) --`
                          : '-- No active projects discovered --'}
                      </option>
                      {discoveredProjects.map((p) => (
                        <option key={p.projectId} value={p.projectId}>
                          {p.name} ({p.projectId})
                        </option>
                      ))}
                    </select>
                  </div>

                  {!projectIdInput && discoveredProjects.length > 0 && (
                    <p className="text-xs text-slate-400">
                      Select a project from the dropdown above to inspect Requester-Pays billing compatibility.
                    </p>
                  )}

                  {discoveredProjects.length === 0 && !isLoadingProjects && (
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1">
                      <p>
                        No active Google Cloud projects were discovered under this account.
                      </p>
                      <p className="text-slate-500">
                        If you are new to GCP, claim free credits in the <strong>New to GCP</strong> tab, or use <strong>Auto-Create Project</strong> to provision one.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Auto-Create Media Project */}
              {projectSetupTab === 'auto_create' && (
                <div className="rounded-xl border border-cyan-500/30 bg-slate-950/60 p-4 space-y-3.5">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Dedicated Media Project Auto-Provisioning</span>
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Automatically configures an isolated Google Cloud project in your account dedicated to media transfers:
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-emerald-400 font-bold block">1. Unique Project</span>
                      <span className="text-[11px] text-slate-400">Allocates basingse-media-dl-XXXX</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-cyan-400 font-bold block">2. Storage API</span>
                      <span className="text-[11px] text-slate-400">Enables storage.googleapis.com</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-amber-400 font-bold block">3. Billing Routing</span>
                      <span className="text-[11px] text-slate-400">Routes Requester-Pays egress</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoCreateProject}
                    disabled={isCreatingProject}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingProject ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-emerald-200" />
                    )}
                    <span>1-Click Auto-Create Media Project</span>
                  </button>

                  {/* Multi-Stage Provisioning Progress Indicator */}
                  {isCreatingProject && provisioningProgress && (
                    <div className="rounded-xl border border-emerald-500/30 bg-slate-900 p-4 space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white flex items-center space-x-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                          <span>Provisioning Progress</span>
                        </span>
                        <span className="font-mono text-emerald-400 text-[11px]">
                          Stage {provisioningProgress.stageIndex} of {provisioningProgress.totalStages}
                        </span>
                      </div>

                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-400 h-2 transition-all duration-300 rounded-full"
                          style={{
                            width: `${(provisioningProgress.stageIndex / provisioningProgress.totalStages) * 100}%`,
                          }}
                        />
                      </div>

                      <div className="text-xs text-slate-300 font-mono flex items-center space-x-2">
                        <span className="text-emerald-400">●</span>
                        <span>{provisioningProgress.message}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Project Validation Error Message */}
              {projectValidationError && (
                <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  <span>{projectValidationError}</span>
                </div>
              )}

              {/* Smart Live Billing Status Card (Only shown when a valid project ID is populated) */}
              {projectIdInput.trim().length > 0 && !projectValidationError && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Cloud Billing Status on <span className="font-mono text-emerald-400">{projectIdInput}</span>:
                      </span>
                    </div>

                    {isCheckingBilling ? (
                      <span className="text-[11px] font-mono text-cyan-400 flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Verifying billing...</span>
                      </span>
                    ) : billingStatus?.billingEnabled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Billing Linked (Active Account)</span>
                      </span>
                    ) : billingStatus?.apiDisabled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Cloud Billing API Disabled</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Billing Unlinked</span>
                      </span>
                    )}
                  </div>

                  {/* API Disabled Diagnostic Card */}
                  {billingStatus?.apiDisabled && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2 text-xs">
                      <p className="text-amber-200 leading-relaxed">
                        The <strong>Cloud Billing API</strong> has not been enabled on project <code className="font-mono text-amber-300">{projectIdInput}</code>. Click below to enable it in Google Cloud Console.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={billingStatus.apiEnableUrl || `https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=${projectIdInput}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-all"
                        >
                          <span>Enable Cloud Billing API in Google Console</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={handleRecheckBilling}
                          disabled={isCheckingBilling}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isCheckingBilling ? 'animate-spin' : ''}`} />
                          <span>Re-check</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Billing Unlinked Diagnostic Card */}
                  {billingStatus && !billingStatus.billingEnabled && !billingStatus.apiDisabled && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2 text-xs">
                      <p className="text-amber-200 leading-relaxed">
                        Google Cloud Storage Requester-Pays requires an attached billing account to attribute download network egress. Free trial accounts are 100% eligible ($0 out-of-pocket).
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={billingStatus.remediationUrl || `https://console.cloud.google.com/billing/linkedaccount?project=${projectIdInput}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-all"
                        >
                          <span>Link Billing Account in Google Console</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={handleRecheckBilling}
                          disabled={isCheckingBilling}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isCheckingBilling ? 'animate-spin' : ''}`} />
                          <span>Re-check</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Override Toggle (For IT-managed clients) */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setManualOverride(!manualOverride)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
                >
                  <span>Manual Project ID Override (For IT-managed clients)</span>
                </button>
                {manualOverride && (
                  <div className="mt-2 space-y-1">
                    <input
                      type="text"
                      value={projectIdInput}
                      onChange={(e) => {
                        setProjectIdInput(e.target.value)
                        setSavedProjectId(e.target.value)
                      }}
                      placeholder="e.g. corporate-media-prod-2026"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-emerald-400 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500 font-mono">
                      Format: 6-30 chars, lowercase letters, digits, and hyphens (must start with letter).
                    </p>
                  </div>
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
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-300">Bucket URI / Name:</label>
                  {bucketValidationError ? (
                    <span className="text-[11px] text-rose-400 font-mono">{bucketValidationError}</span>
                  ) : (
                    <span className="text-[11px] text-emerald-400 font-mono flex items-center space-x-1">
                      <Check className="w-3 h-3" />
                      <span>Valid bucket name syntax</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <FolderLock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={bucketInput}
                    onChange={(e) => setBucketInput(e.target.value)}
                    placeholder="gs://mediaserverrecovery"
                    className={`w-full bg-slate-950 border rounded-xl pl-9 pr-3 py-2.5 text-sm text-white font-mono focus:outline-none ${
                      bucketValidationError
                        ? 'border-rose-500/60 focus:border-rose-400'
                        : 'border-slate-700 focus:border-emerald-400'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  Standard format: <code className="text-slate-400">gs://bucket-name</code> or <code className="text-slate-400">bucket-name</code> (3-63 chars, lowercase).
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                <span className="text-xs font-semibold text-slate-400">Recent & Recommended Buckets:</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    'gs://mediaserverrecovery',
                  ].map((b) => (
                    <button
                      key={b}
                      onClick={() => setBucketInput(b)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-cyan-300 transition-all cursor-pointer"
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
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPreflightRunning ? 'animate-spin' : ''}`} />
                  <span>{isPreflightRunning ? 'Executing Preflight...' : 'Run Preflight Test'}</span>
                </button>
              </div>

              {/* 4 Discrete Step Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Token Step */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    preflightStatus?.oauthTokenValid
                      ? 'border-emerald-500/30 bg-emerald-950/10'
                      : preflightStatus && !preflightStatus.oauthTokenValid
                      ? 'border-rose-500/30 bg-rose-950/10'
                      : 'border-slate-800 bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.oauthTokenValid ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && !preflightStatus.oauthTokenValid ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-700 text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      1
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-white">1. OAuth 2.0 Token Valid</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      {preflightStatus?.oauthTokenValid
                        ? `Expires in ~${Math.max(1, Math.round(preflightStatus.oauthExpiresInSeconds / 60))}m (Auto-Renewal)`
                        : oauthToken
                        ? `Expires in ~${remainingMinutes}m (Auto-Renewal)`
                        : 'Requires Sign-In'}
                    </div>
                  </div>
                </div>

                {/* 2. Requester-Pays Step */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    preflightStatus?.requesterPaysActive && preflightStatus?.bucketReachable
                      ? 'border-emerald-500/30 bg-emerald-950/10'
                      : preflightStatus && (!preflightStatus.bucketReachable || !preflightStatus.requesterPaysActive)
                      ? 'border-rose-500/30 bg-rose-950/10'
                      : 'border-slate-800 bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.bucketReachable && preflightStatus?.requesterPaysActive ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && (!preflightStatus.bucketReachable || !preflightStatus.requesterPaysActive) ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-700 text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      2
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-white">2. Requester-Pays Enforced</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      {projectIdInput ? `Billed to: ${projectIdInput}` : 'Missing Project ID'}
                    </div>
                  </div>
                </div>

                {/* 3. IAM Object Viewer Step */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    preflightStatus?.iamViewerGranted
                      ? 'border-emerald-500/30 bg-emerald-950/10'
                      : preflightStatus && !preflightStatus.iamViewerGranted
                      ? 'border-rose-500/30 bg-rose-950/10'
                      : 'border-slate-800 bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.iamViewerGranted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && !preflightStatus.iamViewerGranted ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-700 text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      3
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-white">3. IAM Object Viewer Granted</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      {preflightStatus?.iamViewerGranted
                        ? 'roles/storage.objectViewer OK'
                        : 'Unverified'}
                    </div>
                  </div>
                </div>

                {/* 4. CORS Preflight Step */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    preflightStatus?.corsConfigured
                      ? 'border-emerald-500/30 bg-emerald-950/10'
                      : preflightStatus && !preflightStatus.corsConfigured
                      ? 'border-rose-500/30 bg-rose-950/10'
                      : 'border-slate-800 bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.corsConfigured ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && !preflightStatus.corsConfigured ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-700 text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      4
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-white">4. CORS Preflight Headers OK</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      {preflightStatus?.corsConfigured
                        ? 'x-goog-hash, Content-Length Exposed'
                        : 'Unverified'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rich Error & Remediation Banner */}
              {preflightStatus?.errorMessage && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 flex flex-col space-y-3 text-xs text-rose-200 animate-in fade-in">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-300">Preflight Check Remediation Needed</div>
                      <p className="mt-1 leading-relaxed text-slate-200">{preflightStatus.errorMessage}</p>
                      {preflightStatus.remediationStep && (
                        <p className="mt-1 text-slate-300 font-mono text-[11px]">{preflightStatus.remediationStep}</p>
                      )}
                    </div>
                  </div>

                  {/* CORS Remediation Tools */}
                  {(!preflightStatus.corsConfigured || preflightStatus.errorMessage.toLowerCase().includes('cors')) && (
                    <div className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-300">Required Bucket CORS Configuration:</span>
                        <button
                          onClick={handleCopyCorsJson}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-mono flex items-center space-x-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedCors ? 'Copied!' : 'Copy cors.json'}</span>
                        </button>
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-950 p-2 rounded text-emerald-300 overflow-x-auto">
{`[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["x-goog-hash", "Content-Length", "Range", "ETag"],
    "maxAgeSeconds": 3600
  }
]`}
                      </pre>
                      <p className="text-[11px] text-slate-400">
                        Apply via CLI:{' '}
                        <code className="text-cyan-300 bg-slate-950 px-1.5 py-0.5 rounded">
                          gcloud storage buckets update {bucketInput} --cors-file=cors.json
                        </code>
                      </p>
                    </div>
                  )}

                  {/* Remediation External Deep Link */}
                  {preflightStatus.remediationUrl && (
                    <div className="pt-1">
                      <a
                        href={preflightStatus.remediationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-sm"
                      >
                        <span>Open Google Cloud Documentation / Console</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
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
              else handleCancelOrClose()
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            {activeStep === 1 ? 'Cancel' : 'Back'}
          </button>

          {activeStep < 4 ? (
            <button
              onClick={handleContinueStep}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!isDemoMode && !isPreflightPassed}
              className={`px-6 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-lg ${
                !isDemoMode && !isPreflightPassed
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 cursor-pointer'
              }`}
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
