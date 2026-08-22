import React, { useState, useEffect, useCallback } from 'react'
import { Header } from './Header'
import { AssetExplorerShell } from '../explorer/AssetExplorerShell'
import { AssetInspectorDrawerShell } from '../inspector/AssetInspectorDrawerShell'
import { DownloadManagerShell } from '../downloader/DownloadManagerShell'
import { CliGeneratorModalShell } from '../cli/CliGeneratorModalShell'
import { HighCostConfirmationModalShell } from '../cost/HighCostConfirmationModalShell'
import { OnboardingWizardShell } from '../onboarding/OnboardingWizardShell'
import { DiagnosticsModalShell } from '../diagnostics/DiagnosticsModalShell'
import { ToastContainer } from '../ui/Toast'

import { usePersistentStore } from '../../store/persistentStore'
import { useRuntimeStore } from '../../store/runtimeStore'
import { useToastStore } from '../../store/toastStore'
import { gcsClientService } from '../../services/gcsClientService'
import { streamDownloadService, BrowserCapabilityDetector } from '../../services/streamDownloadService'
import { ObservabilityService } from '../../services/observability'
import { CostGovernanceEngine } from '../../engines/cost'
import { CalculatedCostResult, GCSMediaItem } from '../../types'

export const AppShell: React.FC = () => {
  const { savedBucketName, savedProjectId, isFreeTrialAccount } = usePersistentStore()
  const {
    oauthToken,
    setDownloadProgress,
    setActiveAbortController,
    isDemoMode,
  } = useRuntimeStore()
  const { addToast } = useToastStore()

  // Navigation state
  const [currentPrefix, setCurrentPrefix] = useState<string>('feature_films/reel_04/')
  const [folders, setFolders] = useState<string[]>([])
  const [files, setFiles] = useState<GCSMediaItem[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined)
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false)

  // Modals & Drawers state
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const [inspectedAsset, setInspectedAsset] = useState<GCSMediaItem | null>(null)
  const [cliModalPaths, setCliModalPaths] = useState<string[] | null>(null)
  const [highCostConfirm, setHighCostConfirm] = useState<{
    costResult: CalculatedCostResult
    pendingAction: () => void
  } | null>(null)

  // Load directory contents
  const loadDirectory = useCallback(
    async (prefix: string, pageToken?: string) => {
      setIsLoadingDirectory(true)
      try {
        ObservabilityService.info('GCS', `Listing directory prefix: "${prefix}"`)
        const cleanBucket = gcsClientService.cleanBucketName(savedBucketName)
        const res =
          isDemoMode || !oauthToken
            ? await gcsClientService.listDemoObjects(prefix)
            : await gcsClientService.listObjects(oauthToken, cleanBucket, {
                prefix,
                delimiter: '/',
                userProject: savedProjectId,
                pageToken,
              })
        setFolders(res.folders)
        setFiles(res.files)
        setCurrentPrefix(prefix)
        setNextPageToken(res.nextPageToken)
      } catch (err: any) {
        ObservabilityService.error('GCS', `Failed to list directory: ${err.message}`)
        addToast({
          type: 'error',
          title: 'Directory Load Error',
          message: err.message,
        })
      } finally {
        setIsLoadingDirectory(false)
      }
    },
    [savedBucketName, savedProjectId, oauthToken, isDemoMode, addToast],
  )

  useEffect(() => {
    loadDirectory(currentPrefix)
  }, [loadDirectory, currentPrefix])

  // Single Item Download Trigger
  const handleInitiateDownload = (item: GCSMediaItem) => {
    const cost = CostGovernanceEngine.calculateSingle(
      item.sizeBytes,
      item.storageClass,
      undefined,
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

  // Batch Download Trigger
  const handleInitiateBatchDownload = (items: GCSMediaItem[]) => {
    if (items.length === 0) return

    const cost = CostGovernanceEngine.calculate(
      items.map((i) => ({ sizeBytes: i.sizeBytes, storageClass: i.storageClass })),
      undefined,
      isFreeTrialAccount,
    )

    if (cost.isHighCostThreshold) {
      setHighCostConfirm({
        costResult: cost,
        pendingAction: () => executeStreamDownload(items[0]),
      })
    } else {
      executeStreamDownload(items[0])
    }
  }

  // Execute Stream Download Pipeline
  const executeStreamDownload = async (item: GCSMediaItem) => {
    const strategy = BrowserCapabilityDetector.resolveStrategy(item.sizeBytes)

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
      if (isDemoMode || !oauthToken) {
        await streamDownloadService.streamDemoDownload(item, {
          onProgress: (progress) => {
            const currentToken = useRuntimeStore.getState().oauthToken
            const currentDemo = useRuntimeStore.getState().isDemoMode
            if (!currentToken && !currentDemo && progress !== null) return

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
      } else {
        await streamDownloadService.downloadFile(item, {
          bucketName: cleanBucket,
          objectName: item.name,
          suggestedFilename: item.displayName,
          userProject: savedProjectId,
          oauthToken,
          expectedCrc32c: item.crc32c,
          fileSize: item.sizeBytes,
          onProgress: (progress) => {
            const currentToken = useRuntimeStore.getState().oauthToken
            const currentDemo = useRuntimeStore.getState().isDemoMode
            if (!currentToken && !currentDemo && progress !== null) return

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
      }
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header */}
      <Header
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoadingDirectory ? (
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
            onNavigatePrefix={(prefix) => loadDirectory(prefix)}
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
            <span>Zero-Backend Media Distribution Portal</span>
            <span>&bull;</span>
            <span className="font-mono text-emerald-400">
              {isDemoMode ? 'Sandbox Active' : 'Live GCP'}
            </span>
          </div>
          <div>React 19 &bull; TypeScript 5.7 &bull; Vite 6 &bull; Tailwind CSS v4</div>
        </div>
      </footer>
    </div>
  )
}
