import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ShieldCheck,
  ArrowRight,
  FolderLock,
} from 'lucide-react'
import { Header } from './Header'
import { NetworkBanner } from './NetworkBanner'
import { AssetExplorerShell } from '../explorer/AssetExplorerShell'
import { AssetInspectorDrawerShell } from '../inspector/AssetInspectorDrawerShell'
import { DownloadManagerShell } from '../downloader/DownloadManagerShell'
import { CliGeneratorModalShell } from '../cli/CliGeneratorModalShell'
import { HighCostConfirmationModalShell } from '../cost/HighCostConfirmationModalShell'
import { OnboardingWizardShell } from '../onboarding/OnboardingWizardShell'
import { SessionReconnectCard } from '../onboarding/SessionReconnectCard'
import { DiagnosticsModalShell } from '../diagnostics/DiagnosticsModalShell'
import { PricingSettingsModalShell } from '../cost/PricingSettingsModalShell'
import { GCPConfigCenterModalShell } from '../config/GCPConfigCenterModalShell'
import { ToastContainer } from '../ui/Toast'

import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'
import { gisAuthService } from '../../services/gisAuthService'
import { gcsClientService } from '../../services/gcsClientService'
import { streamDownloadService, BrowserCapabilityDetector } from '../../services/streamDownloadService'
import { ObservabilityService } from '../../services/observability'
import { CostGovernanceEngine } from '../../engines/cost'
import { SessionLifecycleEngine } from '../../engines/sessionLifecycleEngine'
import { BrowserHistoryRouterEngine } from '../../engines/browserHistoryRouter'
import { CalculatedCostResult, GCSMediaItem } from '../../types'

export const AppShell: React.FC = () => {
  const {
    savedBucketName,
    savedProjectId,
    isFreeTrialAccount,
    customPricing,
    hasCompletedOnboarding,
    lastAuthUserEmail,
    lastAuthUserName,
    setSavedBucketName,
    setSavedProjectId,
  } = usePersistentStore()

  const {
    oauthToken,
    setDownloadProgress,
    setActiveAbortController,
    isRestoringSession,
    sessionRestorationError,
  } = useRuntimeStore()
  const { addToast } = useToastStore()

  // Navigation state
  const [currentPrefix, setCurrentPrefix] = useState<string>('')
  const [folders, setFolders] = useState<string[]>([])
  const [files, setFiles] = useState<GCSMediaItem[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined)
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false)

  // Modals & Drawers state
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const [isPricingSettingsOpen, setIsPricingSettingsOpen] = useState(false)
  const [isGcpConfigOpen, setIsGcpConfigOpen] = useState(false)
  const [inspectedAsset, setInspectedAsset] = useState<GCSMediaItem | null>(null)
  const [cliModalPaths, setCliModalPaths] = useState<string[] | null>(null)
  const [highCostConfirm, setHighCostConfirm] = useState<{
    costResult: CalculatedCostResult
    pendingAction: () => void
  } | null>(null)

  const isBatchDownloadingRef = useRef(false)
  const inFlightDirectoryAbortControllerRef = useRef<AbortController | null>(null)

  // Load directory contents
  const loadDirectory = useCallback(
    async (prefix: string, pageToken?: string, targetBucket?: string) => {
      const effectiveBucket = targetBucket || savedBucketName
      // If unauthenticated or unconfigured, skip loading
      if (!oauthToken || !effectiveBucket || !savedProjectId) {
        setFolders([])
        setFiles([])
        return
      }

      // Abort prior in-flight request if a new navigation occurred
      if (inFlightDirectoryAbortControllerRef.current) {
        inFlightDirectoryAbortControllerRef.current.abort()
      }
      const abortController = new AbortController()
      inFlightDirectoryAbortControllerRef.current = abortController

      setIsLoadingDirectory(true)
      try {
        ObservabilityService.info('GCS', `Listing directory prefix: "${prefix}" in gs://${effectiveBucket}`)
        const cleanBucket = gcsClientService.cleanBucketName(effectiveBucket)

        const res = await gcsClientService.listObjects(oauthToken, cleanBucket, {
          prefix,
          delimiter: '/',
          userProject: savedProjectId,
          pageToken,
          signal: abortController.signal,
        })
        setFolders(res.folders)
        setFiles(res.files)
        setCurrentPrefix(prefix)
        setNextPageToken(res.nextPageToken)
      } catch (err: any) {
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          return
        }
        ObservabilityService.error('GCS', `Failed to list directory: ${err.message}`)
        addToast({
          type: 'error',
          title: 'Directory Load Error',
          message: err.message,
        })
      } finally {
        if (inFlightDirectoryAbortControllerRef.current === abortController) {
          setIsLoadingDirectory(false)
        }
      }
    },
    [savedBucketName, savedProjectId, oauthToken, addToast],
  )

  // Handle forward navigation from breadcrumb click or folder row click
  const handleNavigatePrefix = useCallback(
    (prefix: string) => {
      if (savedBucketName) {
        BrowserHistoryRouterEngine.pushNavigation(savedBucketName, prefix)
      }
      loadDirectory(prefix)
    },
    [savedBucketName, loadDirectory],
  )

  // Handle browser popstate event (Back/Forward buttons)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const historyState = event.state
      if (historyState && historyState.bucket) {
        if (historyState.bucket !== savedBucketName) {
          setSavedBucketName(historyState.bucket)
        }
        loadDirectory(historyState.prefix || '', undefined, historyState.bucket)
        return
      }

      const parsed = BrowserHistoryRouterEngine.parseHash(window.location.hash)
      if (parsed.isValid && parsed.view === 'browse') {
        if (parsed.bucket && parsed.bucket !== savedBucketName) {
          setSavedBucketName(parsed.bucket)
        }
        loadDirectory(parsed.prefix, undefined, parsed.bucket || savedBucketName)
      } else if (savedBucketName) {
        loadDirectory('', undefined, savedBucketName)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [savedBucketName, setSavedBucketName, loadDirectory])

  // Initial boot deep-link hash hydration
  useEffect(() => {
    const parsed = BrowserHistoryRouterEngine.parseHash(window.location.hash)
    if (parsed.isValid && parsed.view === 'browse') {
      if (parsed.bucket && parsed.bucket !== savedBucketName) {
        setSavedBucketName(parsed.bucket)
      }
      if (parsed.prefix !== currentPrefix) {
        setCurrentPrefix(parsed.prefix)
      }
    } else if (savedBucketName) {
      BrowserHistoryRouterEngine.replaceNavigation(savedBucketName, currentPrefix)
    }
  }, [])

  // Boot-time silent session restoration (MOD-10)
  useEffect(() => {
    if (
      !oauthToken &&
      SessionLifecycleEngine.shouldBypassOnboarding(
        hasCompletedOnboarding,
        savedProjectId,
        savedBucketName,
      )
    ) {
      SessionLifecycleEngine.restoreSessionOnBoot().then((result) => {
        if (result.restored) {
          addToast({
            type: 'success',
            title: 'Session Restored',
            message: `Welcome back${result.userName ? ', ' + result.userName : ''}! Resumed session for ${savedBucketName}.`,
          })
        }
      })
    }
  }, [])

  useEffect(() => {
    loadDirectory(currentPrefix)
  }, [loadDirectory, currentPrefix, oauthToken, savedProjectId, savedBucketName])

  // Handle on-the-fly bucket switch
  const handleBucketSwitch = useCallback(
    (newBucket: string) => {
      setSavedBucketName(newBucket)
      setCurrentPrefix('')
      BrowserHistoryRouterEngine.pushNavigation(newBucket, '', { source: 'bucket_switch' })
      loadDirectory('', undefined, newBucket)
    },
    [setSavedBucketName, loadDirectory],
  )

  // Handle on-the-fly project switch
  const handleProjectSwitch = useCallback(
    (newProjectId: string) => {
      setSavedProjectId(newProjectId)
    },
    [setSavedProjectId],
  )

  // Global Keyboard Shortcuts (AUX-04 & Module 9)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Esc closes top modal or drawer
      if (e.key === 'Escape') {
        if (cliModalPaths !== null) setCliModalPaths(null)
        else if (highCostConfirm !== null) setHighCostConfirm(null)
        else if (inspectedAsset !== null) setInspectedAsset(null)
        else if (isGcpConfigOpen) setIsGcpConfigOpen(false)
        else if (isPricingSettingsOpen) setIsPricingSettingsOpen(false)
        else if (isDiagnosticsOpen) setIsDiagnosticsOpen(false)
        else if (isOnboardingOpen) setIsOnboardingOpen(false)
        return
      }

      // 2. Global search shortcut Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search"]',
        )
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
      }

      // 3. Global GCP Config Center shortcut Ctrl+G or Cmd+G (Module 9)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setIsGcpConfigOpen((prev) => !prev)
      }

      // 4. Global Canonical Path shortcut Ctrl+R or Cmd+R when download is complete (Module 12 / AUX-04)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && !e.shiftKey) {
        const { activeDownload } = useRuntimeStore.getState()
        const { localDestinationPath } = usePersistentStore.getState()
        if (activeDownload && activeDownload.status === 'completed') {
          e.preventDefault()
          const folder = (localDestinationPath || '~/Downloads').replace(/\/+$/, '')
          const filename = activeDownload.fileHandleName || activeDownload.itemName
          const canonicalLocation = `${folder}/${filename}`
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(canonicalLocation).then(() => {
              addToast({
                type: 'success',
                title: 'Canonical Path Copied',
                message: `Copied "${canonicalLocation}" to clipboard.`,
              })
            })
          }
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [
    cliModalPaths,
    highCostConfirm,
    inspectedAsset,
    isGcpConfigOpen,
    isPricingSettingsOpen,
    isDiagnosticsOpen,
    isOnboardingOpen,
    addToast,
  ])

  // Single Item Download Trigger
  const handleInitiateDownload = (item: GCSMediaItem) => {
    const cost = CostGovernanceEngine.calculateSingle(
      item.sizeBytes,
      item.storageClass,
      customPricing,
      isFreeTrialAccount,
    )

    if (cost.isHighCostThreshold) {
      setHighCostConfirm({
        costResult: cost,
        pendingAction: () => executeStreamDownload(item),
      })
    } else {
      executeStreamDownload(item)
    }
  }

  // Batch Download Trigger (Multi-Asset Sequential Queue)
  const handleInitiateBatchDownload = (items: GCSMediaItem[]) => {
    if (items.length === 0) return

    const cost = CostGovernanceEngine.calculate(
      items.map((i) => ({ sizeBytes: i.sizeBytes, storageClass: i.storageClass })),
      customPricing,
      isFreeTrialAccount,
    )

    const runBatch = async () => {
      isBatchDownloadingRef.current = true
      addToast({
        type: 'info',
        title: 'Batch Download Initiated',
        message: `Starting sequential download for ${items.length} assets...`,
      })

      for (let i = 0; i < items.length; i++) {
        if (!isBatchDownloadingRef.current) break
        const item = items[i]
        try {
          await executeStreamDownload(item)
        } catch (err: any) {
          if (err.name === 'UserCancelledPickerError' || err.name === 'AbortError') {
            break
          }
        }
      }
      isBatchDownloadingRef.current = false
    }

    if (cost.isHighCostThreshold) {
      setHighCostConfirm({
        costResult: cost,
        pendingAction: runBatch,
      })
    } else {
      runBatch()
    }
  }

  // Execute Stream Download Pipeline
  const executeStreamDownload = async (item: GCSMediaItem) => {
    const { preferredDownloadStrategy } = usePersistentStore.getState()
    const strategy = BrowserCapabilityDetector.resolveStrategy(
      item.sizeBytes,
      preferredDownloadStrategy || undefined,
    )

    // Firefox large asset routing
    if (strategy === 'cli_companion') {
      ObservabilityService.warn(
        'STREAM',
        `Firefox large asset download (${item.displayName}) routed to CLI Companion`,
      )
      setCliModalPaths([item.name])
      addToast({
        type: 'warning',
        title: 'Firefox Degradation Notice',
        message: `${item.displayName} (${item.formattedSize}) requires CLI Companion on Firefox to prevent memory crashes.`,
      })
      return
    }

    ObservabilityService.info(
      'STREAM',
      `Starting memory-bounded stream download for ${item.displayName} (${item.formattedSize}) [strategy: ${strategy}]`,
    )
    const abortController = new AbortController()
    setActiveAbortController(abortController)

    const strategyDescriptions: Record<string, string> = {
      fsaa: 'File System Access API direct-to-disk',
      service_worker: 'Safari Service Worker Stream Interceptor',
      memory_blob: 'Universal in-memory blob handling',
    }

    addToast({
      type: 'info',
      title: 'Download Stream Initiated',
      message: `Streaming ${item.displayName} via ${strategyDescriptions[strategy] || strategy}.`,
    })

    const cleanBucket = gcsClientService.cleanBucketName(savedBucketName)

    try {
      await streamDownloadService.downloadFile(item, {
        bucketName: cleanBucket,
        objectName: item.name,
        suggestedFilename: item.displayName,
        userProject: savedProjectId,
        oauthToken: oauthToken || '',
        expectedCrc32c: item.crc32c,
        fileSize: item.sizeBytes,
        onProgress: (progress) => {
          const currentToken = useRuntimeStore.getState().oauthToken
          if (!currentToken && progress !== null) return

          setDownloadProgress(progress)
          if (progress.status === 'completed') {
            ObservabilityService.info(
              'STREAM',
              `Stream completed and CRC32c verified: ${item.displayName}`,
            )
            addToast({
              type: 'success',
              title: 'Download & Integrity Verified',
              message: `${item.displayName} downloaded. CRC32c checksum match confirmed.`,
            })
          }
        },
        abortSignal: abortController.signal,
      })
    } catch (err: any) {
      if (err.name === 'UserCancelledPickerError' || err.name === 'AbortError') {
        ObservabilityService.info('STREAM', `Download cancelled by user: ${item.displayName}`)
        return
      }
      ObservabilityService.error('STREAM', `Stream download failed: ${err.message}`)
      addToast({
        type: 'error',
        title: 'Download Failed',
        message: err.message,
      })
    }
  }

  const isUnconfiguredLive = !oauthToken || !savedBucketName || !savedProjectId

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Accessible Skip Link (AUX-04) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-500 focus:text-slate-950 focus:font-bold focus:rounded-xl focus:shadow-xl"
      >
        Skip to main content
      </a>

      {/* Network Resiliency Banner (AUX-05) */}
      <NetworkBanner onRetry={() => loadDirectory(currentPrefix)} />

      {/* Top Header */}
      <Header
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenPricingSettings={() => setIsPricingSettingsOpen(true)}
        onOpenGcpConfig={() => setIsGcpConfigOpen(true)}
        onBucketSwitch={handleBucketSwitch}
        onProjectSwitch={handleProjectSwitch}
      />

      {/* Main Workspace Area */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isRestoringSession ? (
          <div
            data-testid="session-restoring-indicator"
            className="py-24 flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-200"
          >
            <div className="w-10 h-10 rounded-full border-3 border-emerald-400 border-t-transparent animate-spin" />
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-white">Restoring Google Cloud Session...</h3>
              <p className="text-xs text-slate-400 font-mono">
                Silently reconnecting to {savedBucketName || 'GCS'} (Zero-Token Security)
              </p>
            </div>
          </div>
        ) : isUnconfiguredLive ? (
          SessionLifecycleEngine.shouldBypassOnboarding(
            hasCompletedOnboarding,
            savedProjectId,
            savedBucketName,
          ) ? (
            <SessionReconnectCard
              userEmail={lastAuthUserEmail}
              userName={lastAuthUserName}
              savedProjectId={savedProjectId}
              savedBucketName={savedBucketName}
              errorMessage={sessionRestorationError}
              onReconnect={async () => {
                try {
                  const session = await gisAuthService.signIn()
                  addToast({
                    type: 'success',
                    title: 'Google Session Reconnected',
                    message: `Welcome back, ${session.userName || session.userEmail}!`,
                  })
                } catch (err: any) {
                  addToast({
                    type: 'error',
                    title: 'Re-Authentication Failed',
                    message: err?.message || 'Failed to reconnect Google session.',
                  })
                }
              }}
              onReconfigure={() => setIsOnboardingOpen(true)}
            />
          ) : (
            /* Clean Live Mode Welcome / Connect Hero */
            <div className="py-16 px-4 max-w-2xl mx-auto text-center space-y-6 animate-in fade-in duration-300">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-950/40">
                <FolderLock className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Connect to Google Cloud Storage
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed max-w-lg mx-auto">
                  Authenticate directly from your browser to access Requester-Pays production buckets. No server middleware, 100% zero host liability.
                </p>
              </div>

              <div className="flex items-center justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setIsOnboardingOpen(true)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>Launch Connection Wizard</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
              </div>

              {/* Feature Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-8 border-t border-slate-800/80 text-left">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="font-semibold text-white text-xs">Direct-to-Disk Streaming</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    4MB micro-chunks streamed via Native Chromium File System Access API with bounded memory (&lt;15MB).
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="font-semibold text-white text-xs">Castagnoli CRC32c</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Live bit-exact parity validation against Google Cloud Storage hash digests.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="font-semibold text-white text-xs">Zero Host Liability</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Client-side execution with volatile in-memory OAuth tokens. Keys never touch server disk.
                  </p>
                </div>
              </div>
            </div>
          )
        ) : isLoadingDirectory ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            <p className="text-xs font-mono text-slate-400">Querying GCS directory metadata...</p>
          </div>
        ) : (
          <AssetExplorerShell
            currentPrefix={currentPrefix}
            folders={folders}
            files={files}
            nextPageToken={nextPageToken}
            onNavigatePrefix={handleNavigatePrefix}
            onLoadNextPage={() => nextPageToken && loadDirectory(currentPrefix, nextPageToken)}
            onInspectAsset={(item) => setInspectedAsset(item)}
            onDownloadAsset={handleInitiateDownload}
            onGenerateCli={(paths) => setCliModalPaths(paths)}
            onDownloadBatch={handleInitiateBatchDownload}
          />
        )}

      </main>

      {/* Slide-out Technical Inspector Drawer */}
      <AssetInspectorDrawerShell
        item={inspectedAsset}
        isOpen={inspectedAsset !== null}
        onClose={() => setInspectedAsset(null)}
        onDownload={handleInitiateDownload}
        onGenerateCli={(item) => setCliModalPaths([item.name])}
      />

      {/* Floating Download Manager Telemetry Widget */}
      <DownloadManagerShell />

      {/* CLI Companion Generator Modal */}
      <CliGeneratorModalShell
        isOpen={cliModalPaths !== null}
        selectedPaths={cliModalPaths || []}
        onClose={() => setCliModalPaths(null)}
      />

      {/* High-Cost Safety Confirmation Modal */}
      <HighCostConfirmationModalShell
        isOpen={highCostConfirm !== null}
        costResult={highCostConfirm?.costResult || null}
        onConfirm={() => {
          const action = highCostConfirm?.pendingAction
          setHighCostConfirm(null)
          if (action) action()
        }}
        onCancel={() => setHighCostConfirm(null)}
      />

      {/* Onboarding Wizard Modal */}
      <OnboardingWizardShell
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={() => loadDirectory(currentPrefix)}
      />

      {/* Pricing Settings Modal (AUX-06) */}
      <PricingSettingsModalShell
        isOpen={isPricingSettingsOpen}
        onClose={() => setIsPricingSettingsOpen(false)}
      />

      {/* Unified GCP Configuration Center & Session Inspector (Module 9) */}
      <GCPConfigCenterModalShell
        isOpen={isGcpConfigOpen}
        onClose={() => setIsGcpConfigOpen(false)}
        onOpenPricingSettings={() => {
          setIsGcpConfigOpen(false)
          setIsPricingSettingsOpen(true)
        }}
        onOpenOnboarding={() => {
          setIsGcpConfigOpen(false)
          setIsOnboardingOpen(true)
        }}
      />

      {/* System Diagnostics & Health Modal */}
      <DiagnosticsModalShell
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />

      {/* Toast Notification Container */}
      <ToastContainer />

      {/* Persistent Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-5 mt-auto text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-400">Files of Ba Sing Se</span>
            <span>&bull;</span>
            <span className="text-white">&copy;</span>
            <span className="font-mono text-white">
              2026 Max Paulson
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
