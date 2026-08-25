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
import { SessionLifecycleEngine } from '../../engines/sessionLifecycleEngine'
import { PrivacyPolicyModalShell } from '../privacy/PrivacyPolicyModalShell'
import { StepUpConsentModalShell } from '../auth/StepUpConsentModalShell'
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
  const { savedProjectId, setSavedProjectId, savedBucketName, setSavedBucketName, recentBuckets, addRecentBucket } =
    usePersistentStore()
  const { oauthToken, userEmail, userName, userAvatar, tokenExpiresAt } = useRuntimeStore()
  const { addToast } = useToastStore()

  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1)
  const [projectIdInput, setProjectIdInput] = useState(savedProjectId || '')
  const [bucketInput, setBucketInput] = useState(savedBucketName || '')
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
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false)
  const [stepUpModalState, setStepUpModalState] = useState<{
    isOpen: boolean
    reason: 'discovery' | 'creation'
    onConfirm: () => void
    onSwitchToManual?: () => void
  }>({ isOpen: false, reason: 'discovery', onConfirm: () => {} })

  // Load GCP Projects
  useEffect(() => {
    if (!isOpen) return

    if (!oauthToken) {
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

    // If active session only has base scopes, do not auto-query CRM API (Least Privilege)
    if (!gisAuthService.hasElevatedScopes()) {
      setDiscoveredProjects([])
      setIsLoadingProjects(false)
      return
    }

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
  }, [isOpen, oauthToken])

  // Validate Project ID & Verify Billing
  useEffect(() => {
    if (!isOpen) return
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

    if (!oauthToken) {
      setIsCheckingBilling(false)
      return
    }

    gcpProjectService
      .checkBillingStatus(oauthToken, projectIdInput)
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
  }, [isOpen, projectIdInput, oauthToken])

  // Validate Bucket Name
  useEffect(() => {
    if (!isOpen) return
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
  }, [isOpen, bucketInput])

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

  const executeAutoCreateProject = async () => {
    setIsCreatingProject(true)
    setProvisioningProgress(null)
    try {
      const token = useRuntimeStore.getState().oauthToken || ''
      const result = await gcpProjectService.autoProvisionProject(
        token,
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

  const handleAutoCreateProject = async () => {
    if (!gisAuthService.hasElevatedScopes()) {
      setStepUpModalState({
        isOpen: true,
        reason: 'creation',
        onConfirm: async () => {
          try {
            await gisAuthService.requestElevatedScopes()
            executeAutoCreateProject()
          } catch (err: any) {
            addToast({
              type: 'error',
              title: 'Step-Up Consent Denied',
              message: err?.message || 'Elevated project creation permission was not granted.',
            })
          }
        },
        onSwitchToManual: () => {
          setProjectSetupTab('new_user')
        },
      })
      return
    }
    executeAutoCreateProject()
  }

  const executeDetectNewProjects = async () => {
    setIsDetecting(true)
    addToast({
      type: 'info',
      title: 'Scanning Projects',
      message: 'Scanning for accessible Google Cloud projects...',
    })
    try {
      const token = useRuntimeStore.getState().oauthToken || ''
      const allProjects = await gcpProjectService.listProjects(token)
      // Deduplicate projects by projectId
      const seen = new Set<string>()
      const uniqueProjects = allProjects.filter((p) => {
        if (!p.projectId || seen.has(p.projectId)) return false
        seen.add(p.projectId)
        return true
      })

      setDiscoveredProjects(uniqueProjects)
      if (uniqueProjects.length > 0) {
        setProjectSetupTab('existing_project')
        if (!projectIdInput || !uniqueProjects.some((p) => p.projectId === projectIdInput)) {
          setProjectIdInput(uniqueProjects[0].projectId)
          setSavedProjectId(uniqueProjects[0].projectId)
        }
        addToast({
          type: 'success',
          title: 'Project List Updated',
          message: `Discovered ${uniqueProjects.length} active Google Cloud project${uniqueProjects.length === 1 ? '' : 's'}.`,
        })
      } else {
        addToast({
          type: 'info',
          title: 'No Projects Found',
          message: 'No active Google Cloud projects found for this account.',
        })
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Project Discovery Failed',
        message: err?.message || 'Could not list Google Cloud projects.',
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleDetectNewProjects = async () => {
    if (!gisAuthService.hasElevatedScopes()) {
      setStepUpModalState({
        isOpen: true,
        reason: 'discovery',
        onConfirm: async () => {
          try {
            await gisAuthService.requestElevatedScopes()
            executeDetectNewProjects()
          } catch (err: any) {
            addToast({
              type: 'error',
              title: 'Step-Up Consent Denied',
              message: err?.message || 'Elevated project discovery permission was not granted.',
            })
          }
        },
        onSwitchToManual: () => {
          setProjectSetupTab('new_user')
        },
      })
      return
    }
    executeDetectNewProjects()
  }

  const handleScanExistingProjects = async () => {
    handleDetectNewProjects()
  }

  const handleRecheckBilling = async () => {
    if (!projectIdInput || !oauthToken) return
    setIsCheckingBilling(true)
    try {
      const status = await gcpProjectService.checkBillingStatus(oauthToken, projectIdInput)
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
    if (!oauthToken) return
    setIsPreflightRunning(true)
    setPreflightStatus(null)
    try {
      const cleanBucket = gcsClientService.cleanBucketName(bucketInput)
      const result = await gcsClientService.run4PointPreflight(
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
    if (!isOpen) return
    if (activeStep === 4 && !preflightStatus && !isPreflightRunning) {
      handleRunPreflight()
    }
  }, [isOpen, activeStep, preflightStatus, isPreflightRunning])

  const handleContinueStep = () => {
    if (activeStep === 1) {
      if (!oauthToken) {
        addToast({
          type: 'warning',
          title: 'Sign-In Required',
          message: 'Please sign in with Google to continue.',
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
    // If cancelling before finishing setup, sign out and clear session state
    if (!savedProjectId || !savedBucketName || activeStep < 4 || !isPreflightPassed) {
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
    SessionLifecycleEngine.markOnboardingComplete({
      email: userEmail,
      name: userName,
      projectId: projectIdInput,
      bucketName: cleanBucket,
    })
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

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="onboarding-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Client GCP Connection & Onboarding Wizard
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure direct-to-browser media access with 100% Requester-Pays billing attribution.
              </p>
            </div>
          </div>
          <button
            onClick={handleCancelOrClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Linear Step Bar */}
        <div className="grid grid-cols-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold">
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
                  ? 'border-emerald-600 dark:border-emerald-400 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20'
                  : activeStep > s.num
                  ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  : 'border-transparent text-slate-400 dark:text-slate-500'
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
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Step 1: Google Identity Sign-In</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Sign in with your Google account (@gmail.com or Workspace) to authenticate against Google Cloud Storage.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-100 dark:bg-cyan-500/10 text-cyan-800 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/20 font-semibold">
                    OAuth 2.0
                  </span>
                </div>

                {oauthToken ? (
                  /* Authenticated State Card */
                  <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-950/10 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {userAvatar ? (
                          <img
                            src={userAvatar}
                            alt={userName || 'User'}
                            className="w-10 h-10 rounded-full border border-emerald-500 object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-400 flex items-center justify-center font-bold text-emerald-800 dark:text-emerald-300">
                            {userName ? userName.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                            <span>{userName || 'Authenticated User'}</span>
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                              Connected
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{userEmail}</div>
                        </div>
                      </div>

                      <button
                        onClick={handleSwitchAccount}
                        disabled={isSigningIn}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-cyan-700 dark:text-cyan-300 flex items-center space-x-1.5 transition-all cursor-pointer"
                      >
                        {isSigningIn ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Users className="w-3.5 h-3.5" />
                        )}
                        <span>Switch Account</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 dark:text-slate-400">Granted Scopes:</span>
                        <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                          {gisAuthService.hasElevatedScopes()
                            ? 'devstorage.read_only + CRM'
                            : 'devstorage.read_only (Minimal)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                        <span className="text-slate-500 dark:text-slate-400">Token Renewal:</span>
                        <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">~{remainingMinutes}m remaining</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Unauthenticated Sign-In Card */
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-700 dark:text-slate-300">Requested Permission Scopes:</span>
                        <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                          devstorage.read_only (Minimal)
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Authentication session is maintained client-side in your browser for seamless continuity. Credentials are never sent to third-party servers.
                      </p>
                      <div className="pt-1 flex items-center justify-between border-t border-slate-200 dark:border-slate-800/80 text-[11px]">
                        <span className="text-slate-500">Principle of Least Privilege</span>
                        <button
                          type="button"
                          onClick={() => setIsPrivacyModalOpen(true)}
                          className="text-cyan-700 dark:text-cyan-400 hover:underline font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Privacy Policy &amp; Scopes</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleSignInGoogle}
                      disabled={isSigningIn}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                    >
                      {isSigningIn ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-current" />
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
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Smart GCP Billing Project Setup */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Step 2: Smart GCP Billing Project Setup</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select an existing project, claim Google's $300 Free Trial credits, or auto-create a dedicated media project.
                </p>
              </div>

              {/* 3-Tab Intent Selector */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setProjectSetupTab('new_user')}
                  className={`py-2 px-2.5 rounded-lg text-center transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    projectSetupTab === 'new_user'
                      ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-900 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/40 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                  <span className="truncate">New to GCP ($300 Free)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectSetupTab('existing_project')}
                  className={`py-2 px-2.5 rounded-lg text-center transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    projectSetupTab === 'existing_project'
                      ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <FolderLock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span className="truncate">Existing Projects ({discoveredProjects.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProjectSetupTab('auto_create')}
                  className={`py-2 px-2.5 rounded-lg text-center transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                    projectSetupTab === 'auto_create'
                      ? 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-900 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/40 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 flex-shrink-0" />
                  <span className="truncate">Auto-Create Project</span>
                </button>
              </div>

              {/* TAB 1: New to Google Cloud ($300 Free Trial Guided 2-Step Flow) */}
              {projectSetupTab === 'new_user' && (
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-gradient-to-br dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-950 p-4 space-y-4">
                  <div className="flex items-start space-x-2.5">
                    <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 border border-indigo-300 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 flex-shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Google Cloud $300 Free Trial Assistant (90 Days)
                      </h4>
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                        Google provides all new accounts with <strong className="text-slate-900 dark:text-white">$300 in free trial credits for 90 days</strong>. This completely covers all media download and retrieval charges with $0 out-of-pocket costs.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Step 1 */}
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[10px] flex items-center justify-center font-mono font-bold">1</span>
                          <span>Activate $300 Credits</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Opens Google Cloud Console in a new tab. Complete the 60-second signup. Google will not auto-charge when credits expire.
                        </p>
                      </div>
                      <a
                        href="https://console.cloud.google.com/freetrial"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-indigo-600/10 dark:shadow-indigo-950/50"
                      >
                        <span>Open 60s Free Trial Signup</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Step 2 */}
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[10px] flex items-center justify-center font-mono font-bold">2</span>
                          <span>Link & Detect New Project</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          After completing signup in Google Console, click below. We will automatically discover and link your new project.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDetectNewProjects}
                        disabled={isDetecting}
                        className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyan-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
                        <span>Auto-Detect My Project</span>
                      </button>
                    </div>
                  </div>

                  {/* Direct Manual Project ID Input (Zero Elevated Permissions) */}
                  <div className="pt-3 border-t border-indigo-200 dark:border-indigo-500/20 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Or enter Google Cloud Project ID manually:
                      </label>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold font-mono">
                        Zero Elevated Scopes
                      </span>
                    </div>
                    <input
                      type="text"
                      value={projectIdInput}
                      onChange={(e) => {
                        setProjectIdInput(e.target.value)
                        setSavedProjectId(e.target.value)
                      }}
                      placeholder="e.g. client-prod-media-2026"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: Existing Projects */}
              {projectSetupTab === 'existing_project' && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Discovered Google Cloud Projects:
                    </label>
                    {isLoadingProjects && (
                      <span className="text-[11px] text-cyan-600 dark:text-cyan-400 flex items-center space-x-1 font-mono">
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
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white font-mono focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none transition-colors"
                    >
                      <option value="">
                        {discoveredProjects.length > 0
                          ? `-- Select a Google Cloud Project (${discoveredProjects.length} available) --`
                          : '-- No active projects discovered --'}
                      </option>
                      {Array.from(new Map(discoveredProjects.map((p) => [p.projectId, p])).values()).map((p) => (
                        <option key={p.projectId} value={p.projectId}>
                          {p.name} ({p.projectId})
                        </option>
                      ))}
                    </select>
                  </div>

                  {!projectIdInput && discoveredProjects.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Select a project from the dropdown above to inspect Requester-Pays billing compatibility.
                    </p>
                  )}

                  {discoveredProjects.length === 0 && !isLoadingProjects && (
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
                      {!gisAuthService.hasElevatedScopes() ? (
                        <>
                          <p className="text-slate-800 dark:text-slate-200">
                            Automatic project discovery requires Cloud Resource Manager read permissions (<code className="font-mono text-cyan-600 dark:text-cyan-400">cloud-platform</code>).
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleScanExistingProjects}
                              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Grant Permission &amp; Scan Projects</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setProjectSetupTab('new_user')}
                              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
                            >
                              <span>Enter Project ID Manually</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p>
                            No active Google Cloud projects were discovered under this account.
                          </p>
                          <p className="text-slate-500">
                            If you are new to GCP, claim free credits in the <strong>New to GCP</strong> tab, or use <strong>Auto-Create Project</strong> to provision one.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Auto-Create Media Project */}
              {projectSetupTab === 'auto_create' && (
                <div className="rounded-xl border border-cyan-300 dark:border-cyan-500/30 bg-cyan-50/30 dark:bg-slate-950/60 p-4 space-y-3.5">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>Dedicated Media Project Auto-Provisioning</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Automatically configures an isolated Google Cloud project in your account dedicated to media transfers:
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold block">1. Unique Project</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Allocates basingse-media-dl-XXXX</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span className="text-cyan-700 dark:text-cyan-400 font-bold block">2. Storage API</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Enables storage.googleapis.com</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span className="text-amber-700 dark:text-amber-400 font-bold block">3. Billing Routing</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Routes Requester-Pays egress</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoCreateProject}
                    disabled={isCreatingProject}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md shadow-emerald-600/10 dark:shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
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
                    <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-white dark:bg-slate-900 p-4 space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                          <span>Provisioning Progress</span>
                        </span>
                        <span className="font-mono text-emerald-700 dark:text-emerald-400 text-[11px] font-bold">
                          Stage {provisioningProgress.stageIndex} of {provisioningProgress.totalStages}
                        </span>
                      </div>

                      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 dark:bg-emerald-400 h-2 transition-all duration-300 rounded-full"
                          style={{
                            width: `${(provisioningProgress.stageIndex / provisioningProgress.totalStages) * 100}%`,
                          }}
                        />
                      </div>

                      <div className="text-xs text-slate-700 dark:text-slate-300 font-mono flex items-center space-x-2">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">●</span>
                        <span>{provisioningProgress.message}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Project Validation Error Message */}
              {projectValidationError && (
                <div className="p-2.5 rounded-lg bg-rose-100 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{projectValidationError}</span>
                </div>
              )}

              {/* Smart Live Billing Status Card (Only shown when a valid project ID is populated) */}
              {projectIdInput.trim().length > 0 && !projectValidationError && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 p-4 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Cloud Billing Status on <span className="font-mono text-emerald-700 dark:text-emerald-400">{projectIdInput}</span>:
                      </span>
                    </div>

                    {isCheckingBilling ? (
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Verifying billing...</span>
                      </span>
                    ) : billingStatus?.billingEnabled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Billing Linked (Active Account)</span>
                      </span>
                    ) : billingStatus?.apiDisabled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Cloud Billing API Disabled</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Billing Unlinked</span>
                      </span>
                    )}
                  </div>

                  {/* API Disabled Diagnostic Card */}
                  {billingStatus?.apiDisabled && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 space-y-2 text-xs">
                      <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                        The <strong>Cloud Billing API</strong> has not been enabled on project <code className="font-mono text-amber-800 dark:text-amber-300">{projectIdInput}</code>. Click below to enable it in Google Cloud Console.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={billingStatus.apiEnableUrl || `https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=${projectIdInput}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all shadow-sm"
                        >
                          <span>Enable Cloud Billing API in Google Console</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={handleRecheckBilling}
                          disabled={isCheckingBilling}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 ${isCheckingBilling ? 'animate-spin' : ''}`} />
                          <span>Re-check</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Billing Unlinked Diagnostic Card */}
                  {billingStatus && !billingStatus.billingEnabled && !billingStatus.apiDisabled && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-500/40 space-y-2 text-xs">
                      <p className="text-amber-900 dark:text-amber-200 leading-relaxed">
                        Google Cloud Storage Requester-Pays requires an attached billing account to attribute download network egress. Free trial accounts are 100% eligible ($0 out-of-pocket).
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={billingStatus.remediationUrl || `https://console.cloud.google.com/billing/linkedaccount?project=${projectIdInput}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all shadow-sm"
                        >
                          <span>Link Billing Account in Google Console</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={handleRecheckBilling}
                          disabled={isCheckingBilling}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition-all cursor-pointer"
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
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
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
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-mono focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none transition-colors"
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
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Step 3: Target Google Cloud Storage Bucket</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Enter the GCS bucket URI containing your production media assets.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Bucket URI / Name:</label>
                  {bucketValidationError ? (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-mono">{bucketValidationError}</span>
                  ) : (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono flex items-center space-x-1 font-semibold">
                      <Check className="w-3 h-3" />
                      <span>Valid bucket name syntax</span>
                    </span>
                  )}
                </div>
                <div className="relative">
                  <FolderLock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={bucketInput}
                    onChange={(e) => setBucketInput(e.target.value)}
                    placeholder="gs://your-bucket-name"
                    className={`w-full bg-white dark:bg-slate-950 border rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-white font-mono focus:outline-none transition-colors ${
                      bucketValidationError
                        ? 'border-rose-300 dark:border-rose-500/60 focus:border-rose-500 dark:focus:border-rose-400'
                        : 'border-slate-300 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-400'
                    }`}
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  Standard format: <code className="text-slate-700 dark:text-slate-400">gs://bucket-name</code> or <code className="text-slate-700 dark:text-slate-400">bucket-name</code> (3-63 chars, lowercase).
                </p>
              </div>

              {recentBuckets && recentBuckets.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4 space-y-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Recently Used Buckets:</span>
                  <div className="flex flex-wrap gap-2">
                    {recentBuckets.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBucketInput(b)}
                        className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-mono text-cyan-800 dark:text-cyan-300 transition-all cursor-pointer"
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: 4-Point Preflight Handshake */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Step 4: Automated 4-Point Preflight Handshake</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Validates token expiration, Requester-Pays enforcement, IAM read permission, and CORS headers.
                  </p>
                </div>
                <button
                  onClick={handleRunPreflight}
                  disabled={isPreflightRunning}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-cyan-800 dark:text-cyan-300 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors"
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
                      ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/10'
                      : preflightStatus && !preflightStatus.oauthTokenValid
                      ? 'border-rose-300 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.oauthTokenValid ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && !preflightStatus.oauthTokenValid ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      1
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">1. OAuth 2.0 Token Valid</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono mt-0.5 font-semibold">
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
                      ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/10'
                      : preflightStatus && (!preflightStatus.bucketReachable || !preflightStatus.requesterPaysActive)
                      ? 'border-rose-300 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.bucketReachable && preflightStatus?.requesterPaysActive ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && (!preflightStatus.bucketReachable || !preflightStatus.requesterPaysActive) ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      2
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">2. Requester-Pays Enforced</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono mt-0.5 font-semibold">
                      {projectIdInput ? `Billed to: ${projectIdInput}` : 'Missing Project ID'}
                    </div>
                  </div>
                </div>

                {/* 3. IAM Object Viewer Step */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    preflightStatus?.iamViewerGranted
                      ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/10'
                      : preflightStatus && !preflightStatus.iamViewerGranted
                      ? 'border-rose-300 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.iamViewerGranted ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && !preflightStatus.iamViewerGranted ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      3
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">3. IAM Object Viewer Granted</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono mt-0.5 font-semibold">
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
                      ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/10'
                      : preflightStatus && !preflightStatus.corsConfigured
                      ? 'border-rose-300 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/10'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                  } flex items-start space-x-3`}
                >
                  {preflightStatus?.corsConfigured ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : preflightStatus && !preflightStatus.corsConfigured ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                      4
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">4. CORS Preflight Headers OK</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono mt-0.5 font-semibold">
                      {preflightStatus?.corsConfigured
                        ? 'x-goog-hash, Content-Length Exposed'
                        : 'Unverified'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rich Error & Remediation Banner */}
              {preflightStatus?.errorMessage && (
                <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/20 flex flex-col space-y-3 text-xs text-rose-900 dark:text-rose-200 animate-in fade-in">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-800 dark:text-rose-300">Preflight Check Remediation Needed</div>
                      <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-200">{preflightStatus.errorMessage}</p>
                      {preflightStatus.remediationStep && (
                        <p className="mt-1 text-slate-600 dark:text-slate-300 font-mono text-[11px]">{preflightStatus.remediationStep}</p>
                      )}
                    </div>
                  </div>

                  {/* CORS Remediation Tools */}
                  {(!preflightStatus.corsConfigured || preflightStatus.errorMessage.toLowerCase().includes('cors')) && (
                    <div className="mt-2 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-slate-300">Required Bucket CORS Configuration:</span>
                        <button
                          onClick={handleCopyCorsJson}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyan-300 text-[11px] font-mono flex items-center space-x-1 cursor-pointer transition-colors"
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
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Apply via CLI:{' '}
                        <code className="text-cyan-700 dark:text-cyan-300 bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 rounded font-mono">
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
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between transition-colors">
          <button
            onClick={() => {
              if (activeStep > 1) setActiveStep((activeStep - 1) as any)
              else handleCancelOrClose()
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            {activeStep === 1 ? 'Cancel' : 'Back'}
          </button>

          {activeStep < 4 ? (
            <button
              onClick={handleContinueStep}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/40 cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!isPreflightPassed}
              className={`px-6 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-lg ${
                !isPreflightPassed
                  ? 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed border border-slate-300 dark:border-slate-700'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 cursor-pointer'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finish Setup & Enter Media Portal</span>
            </button>
          )}
        </div>
      </div>

      {/* Privacy Policy Modal (AUX-09) */}
      <PrivacyPolicyModalShell
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      {/* Contextual Step-Up Consent Modal (Module 14) */}
      <StepUpConsentModalShell
        isOpen={stepUpModalState.isOpen}
        onClose={() => setStepUpModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirmStepUp={stepUpModalState.onConfirm}
        onSwitchToManual={stepUpModalState.onSwitchToManual}
        reason={stepUpModalState.reason}
      />
    </div>
  )
}

