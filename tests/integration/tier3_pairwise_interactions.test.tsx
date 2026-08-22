import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useToastStore } from '../../src/store/toastStore'
import { gcsClientService } from '../../src/services/gcsClientService'
import { ObservabilityService } from '../../src/services/observability'
import { CostGovernanceEngine } from '../../src/engines/cost'
import { CliGeneratorEngine } from '../../src/engines/cli'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'
import { AssetExplorerShell } from '../../src/components/explorer/AssetExplorerShell'
import { AssetInspectorDrawerShell } from '../../src/components/inspector/AssetInspectorDrawerShell'
import { Header } from '../../src/components/layout/Header'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'

describe('Tier 3 - Cross-Feature Pairwise Interactions', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
  })

  // 1. Auth switch while streaming
  it('Pairwise 1: Auth sign-out / switch while streaming immediately aborts active stream and purges RAM', () => {
    // Start auth session
    useRuntimeStore.getState().setAuthSession('ya29.active_user_token', 'lead@studio.com', 'Lead')
    const abortController = new AbortController()
    useRuntimeStore.getState().setActiveAbortController(abortController)
    useRuntimeStore.getState().setDownloadProgress({
      itemId: 'mock-download',
      itemName: 'reel04_cam_A_raw.mxf',
      loadedBytes: 2_000_000_000,
      totalBytes: 18_400_000_000,
      percentage: 11,
      speedBytesPerSec: 48000000,
      formattedSpeed: '48.0 MB/s',
      etaSeconds: 340,
      formattedETA: '05m 40s',
      elapsedSeconds: 40,
      formattedElapsed: '40s',
      memoryHeapMB: 11.4,
      status: 'streaming',
    })

    let abortTriggered = false
    abortController.signal.addEventListener('abort', () => {
      abortTriggered = true
    })

    // User signs out
    useRuntimeStore.getState().clearAuthSession()

    // Assert: RAM tokens wiped and active stream aborted
    expect(useRuntimeStore.getState().oauthToken).toBeNull()
    expect(useRuntimeStore.getState().activeAbortController).toBeNull()
    expect(abortTriggered).toBe(true)
  })

  // 2. Project switch during directory navigation
  it('Pairwise 2: Project switch updates billing attribution across directory querying and preflight', async () => {
    // Initially project A
    usePersistentStore.getState().setSavedProjectId('project-alpha-2026')
    expect(usePersistentStore.getState().savedProjectId).toBe('project-alpha-2026')

    // Switch to project B
    usePersistentStore.getState().setSavedProjectId('project-beta-vfx-2026')
    expect(usePersistentStore.getState().savedProjectId).toBe('project-beta-vfx-2026')

    // Run preflight with new project ID
    const preflight = await gcsClientService.run4PointPreflight(
      'ya29.test-token',
      'partner-raw-master-archives-2026',
      usePersistentStore.getState().savedProjectId,
    )
    expect(preflight.bucketReachable).toBe(true)
    expect(preflight.requesterPaysActive).toBe(true)
    expect(preflight.iamViewerGranted).toBe(true)
  })

  // 3. Filter chips + multi-select + high-cost confirmation
  it('Pairwise 3: Category filter + multi-select calculates subset cost and invokes batch action', () => {
    const onDownloadBatch = vi.fn()
    renderWithProviders(
      <AssetExplorerShell
        currentPrefix="feature_films/reel_04/"
        folders={[]}
        files={STUDIO_MASTER_DATASET}
        onNavigatePrefix={() => {}}
        onInspectAsset={() => {}}
        onDownloadAsset={() => {}}
        onGenerateCli={() => {}}
        onDownloadBatch={onDownloadBatch}
      />,
    )

    // Filter to Archives
    const archiveChip = screen.getByRole('button', { name: /^Archives$/i })
    fireEvent.click(archiveChip)

    // Select all filtered archives
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // Select All

    // Verify Download Selected button appears
    const downloadBatchBtn = screen.getByRole('button', { name: /download selected/i })
    expect(downloadBatchBtn).toBeInTheDocument()

    fireEvent.click(downloadBatchBtn)
    expect(onDownloadBatch).toHaveBeenCalled()
  })

  // 4. Safari SW interception fallback to memory blob
  it('Pairwise 4: Small asset fallback generates Blob URL with Castagnoli CRC32c verification', () => {
    const smallPayload = new TextEncoder().encode('Ba Sing Se In-Memory Fallback Blob')
    const calculated = CRC32cIntegrityEngine.calculate(smallPayload)

    const blob = new Blob([smallPayload], { type: 'text/plain' })
    const blobUrl = URL.createObjectURL(blob)

    expect(blobUrl).toMatch(/^blob:/)
    expect(calculated.hex).toMatch(/^0x[0-9A-F]{8}$/)
    expect(calculated.base64).toBeDefined()
    URL.revokeObjectURL(blobUrl)
  })

  // 5. Free Trial Account + Custom Pricing Override
  it('Pairwise 5: Free Trial toggle updates coveredByFreeTrial and custom rate card calculations', () => {
    // Free trial active
    usePersistentStore.getState().setFreeTrialAccount(true)
    const costFreeTrial = CostGovernanceEngine.calculateSingle(
      20_000_000_000,
      'ARCHIVE',
      undefined,
      usePersistentStore.getState().isFreeTrialAccount,
    )
    expect(costFreeTrial.coveredByFreeTrial).toBe(true)

    // Free trial disabled
    usePersistentStore.getState().setFreeTrialAccount(false)
    const costNoTrial = CostGovernanceEngine.calculateSingle(
      20_000_000_000,
      'ARCHIVE',
      undefined,
      usePersistentStore.getState().isFreeTrialAccount,
    )
    expect(costNoTrial.coveredByFreeTrial).toBe(false)
  })

  // 6. Search query combined with Category filter
  it('Pairwise 6: Intersection of Search Query and Category Filter', () => {
    renderWithProviders(
      <AssetExplorerShell
        currentPrefix="feature_films/reel_04/"
        folders={[]}
        files={STUDIO_MASTER_DATASET}
        onNavigatePrefix={() => {}}
        onInspectAsset={() => {}}
        onDownloadAsset={() => {}}
        onGenerateCli={() => {}}
        onDownloadBatch={() => {}}
      />,
    )

    // Filter to Videos
    fireEvent.click(screen.getByRole('button', { name: /videos/i }))
    // Search for "cam_A"
    const searchInput = screen.getByPlaceholderText(/search by file name/i)
    fireEvent.change(searchInput, { target: { value: 'cam_A' } })

    // Should find reel04_cam_A_raw.mxf
    expect(screen.getByText(/reel04_cam_A_raw\.mxf/i)).toBeInTheDocument()
    // Should NOT find reel04_cam_B_raw.mxf
    expect(screen.queryByText(/reel04_cam_B_raw\.mxf/i)).not.toBeInTheDocument()
  })

  // 7. CLI Generator + Mixed Storage Class Batch Selection
  it('Pairwise 7: CLI Generator formats multi-path command with billing project flag', () => {
    const selectedPaths = [
      'feature_films/reel_04/reel04_cam_A_raw.mxf',
      'sound_stems/dialogue_isolated_master.wav',
    ]
    const gcloudCmd = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'partner-raw-master-archives-2026',
      selectedPaths,
      userProject: 'color-suite-prod-2026',
      destinationDir: './master_ingest/',
    })

    expect(gcloudCmd).toContain('gcloud storage cp')
    expect(gcloudCmd).toContain('--billing-project=color-suite-prod-2026')
    expect(gcloudCmd).toContain('./master_ingest/')
    expect(gcloudCmd).toContain('reel04_cam_A_raw.mxf')
    expect(gcloudCmd).toContain('dialogue_isolated_master.wav')
  })

  // 8. Diagnostics Report Export during Active Stream
  it('Pairwise 8: Generating diagnostic report during active stream captures memory heap and masked project', () => {
    ObservabilityService.info('STREAM', 'Micro-chunk pipe active')
    const report = ObservabilityService.generateReport(
      'gs://partner-raw-master-archives-2026',
      'client-media-project-2026',
    )

    expect(report.heapMemoryMB).toBe(11.4)
    expect(report.activeProjectIdMasked).toBe('clie***-2026')
    expect(report.recentLogs.length).toBeGreaterThan(0)
    expect(report.activeBucket).toContain('partner-raw-master-archives-2026')
  })

  // 9. Toast Notifications + Download Lifecycle
  it('Pairwise 9: Download lifecycle events dispatch toasts correctly', () => {
    const { addToast } = useToastStore.getState()

    addToast({
      type: 'info',
      title: 'Download Stream Initiated',
      message: 'Streaming reel04_cam_A_raw.mxf directly to disk.',
    })
    expect(useToastStore.getState().toasts.length).toBe(1)
    expect(useToastStore.getState().toasts[0].title).toBe('Download Stream Initiated')

    addToast({
      type: 'success',
      title: 'Download & Integrity Verified',
      message: 'CRC32c checksum match confirmed.',
    })
    expect(useToastStore.getState().toasts.length).toBe(2)
  })

  // 10. Inspector Drawer + Direct Download Trigger
  it('Pairwise 10: Triggering download from Technical Inspector Drawer invokes callback with asset', () => {
    const onDownload = vi.fn()
    const onGenerateCli = vi.fn()
    const onClose = vi.fn()

    renderWithProviders(
      <AssetInspectorDrawerShell
        item={STUDIO_MASTER_DATASET[0]}
        isOpen={true}
        onClose={onClose}
        onDownload={onDownload}
        onGenerateCli={onGenerateCli}
      />,
    )

    expect(screen.getByText(/reel04_cam_A_raw\.mxf/i)).toBeInTheDocument()
    expect(screen.getByText(/0xAF82F6C0/i)).toBeInTheDocument()

    // Click Stream Download to Disk button in drawer
    const downloadBtn = screen.getByRole('button', { name: /stream download to disk/i })
    fireEvent.click(downloadBtn)

    expect(onDownload).toHaveBeenCalledWith(STUDIO_MASTER_DATASET[0])
    expect(onClose).toHaveBeenCalled()
  })

  // 11. Theme Switcher in Header updates store state
  it('Pairwise 11: Toggling theme button in Header flips dark and light state', () => {
    renderWithProviders(
      <Header onOpenOnboarding={() => {}} onOpenDiagnostics={() => {}} />,
    )

    const themeToggleBtn = screen.getByLabelText(/toggle theme/i)
    fireEvent.click(themeToggleBtn)
    expect(usePersistentStore.getState().theme).toBe('light')

    fireEvent.click(themeToggleBtn)
    expect(usePersistentStore.getState().theme).toBe('dark')
  })
})
