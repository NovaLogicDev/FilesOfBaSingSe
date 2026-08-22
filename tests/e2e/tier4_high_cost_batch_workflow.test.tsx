import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { CostGovernanceEngine } from '../../src/engines/cost'
import { HighCostConfirmationModalShell } from '../../src/components/cost/HighCostConfirmationModalShell'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'
import { usePersistentStore } from '../../src/store/persistentStore'

describe('Tier 4 - Scenario 3: High-Cost Batch Selection Confirmation Gate', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
  })

  it('evaluates studio multi-reel selection (>30GB Archive), blocks direct download, and gates with modal', () => {
    // Select Reel 04 Cam A (18.4GB Archive) and Reel 04 Cam B (16.2GB Archive) -> 34.6 GB Total
    const selectedReels = [STUDIO_MASTER_DATASET[0], STUDIO_MASTER_DATASET[1]]

    usePersistentStore.getState().setSavedProjectId('studio-post-production-2026')
    usePersistentStore.getState().setFreeTrialAccount(false)

    // Calculate cost
    const costResult = CostGovernanceEngine.calculate(
      selectedReels.map((r) => ({ sizeBytes: r.sizeBytes, storageClass: r.storageClass })),
      undefined,
      false,
    )

    // 34.6 GB Archive: 34.6 * $0.05 ($1.73 retrieval) + 34.6 * $0.12 ($4.15 egress) = $5.88
    expect(costResult.totalDecimalGB).toBe(34.6)
    expect(costResult.grandTotalUSD).toBeGreaterThan(5.0)
    expect(costResult.isHighCostThreshold).toBe(true)

    const onConfirmDownload = vi.fn()
    const onCancel = vi.fn()

    // Render Confirmation Gate Modal
    renderWithProviders(
      <HighCostConfirmationModalShell
        isOpen={true}
        costResult={costResult}
        onConfirm={onConfirmDownload}
        onCancel={onCancel}
      />,
    )

    // Verify modal elements
    expect(screen.getByText(/High-Volume \/ Cold-Tier Transfer Confirmation/i)).toBeInTheDocument()
    expect(screen.getByText(/studio-post-production-2026/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(costResult.formattedTotalSize, 'i'))).toBeInTheDocument()
    expect(screen.getByText(/Confirm & Incur/i)).toBeInTheDocument()

    // User confirms transfer
    fireEvent.click(screen.getByText(/Confirm & Incur/i))
    expect(onConfirmDownload).toHaveBeenCalledTimes(1)
  })
})
