import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { CostGovernanceEngine } from '../../src/engines/cost'
import { HighCostConfirmationModalShell } from '../../src/components/cost/HighCostConfirmationModalShell'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F8: Cost Governance & High-Cost Modal Gate', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('calculates exact itemized storage tier retrieval and internet egress fees', () => {
    const items = [
      { sizeBytes: 10_000_000_000, storageClass: 'ARCHIVE' }, // 10 GB * $0.05 = $0.50
      { sizeBytes: 10_000_000_000, storageClass: 'COLDLINE' }, // 10 GB * $0.02 = $0.20
      { sizeBytes: 10_000_000_000, storageClass: 'NEARLINE' }, // 10 GB * $0.01 = $0.10
      { sizeBytes: 10_000_000_000, storageClass: 'STANDARD' }, // 10 GB * $0.00 = $0.00
    ]
    // Total 40 GB egress * $0.12 = $4.80
    // Total retrieval = $0.80
    // Grand total = $5.60

    const result = CostGovernanceEngine.calculate(items)
    expect(result.totalBytes).toBe(40_000_000_000)
    expect(result.totalDecimalGB).toBe(40.0)
    expect(result.retrievalTotalUSD).toBe(0.8)
    expect(result.egressTotalUSD).toBe(4.8)
    expect(result.grandTotalUSD).toBe(5.6)
    expect(result.isHighCostThreshold).toBe(true) // >= $5.00 and >= 25GB
  })

  it('triggers high-cost threshold when estimated charge exceeds $5.00 USD', () => {
    // 35 GB of Standard storage = $0 retrieval + (35 * 0.12 = $4.20 egress) -> below $5.00, but >= 25GB
    const resVolume = CostGovernanceEngine.calculate([
      { sizeBytes: 30_000_000_000, storageClass: 'STANDARD' },
    ])
    expect(resVolume.isHighCostThreshold).toBe(true)

    // 50 GB Archive: 50*0.05 + 50*0.12 = $8.50 -> exceeds $5.00
    const resCost = CostGovernanceEngine.calculateSingle(50_000_000_000, 'ARCHIVE')
    expect(resCost.isHighCostThreshold).toBe(true)
    expect(resCost.grandTotalUSD).toBe(8.5)
  })

  it('does NOT trigger threshold for lightweight standard transfers below $5.00 and <25GB', () => {
    // 2 GB Standard = $0.24 egress, $0 retrieval
    const smallRes = CostGovernanceEngine.calculateSingle(2_000_000_000, 'STANDARD')
    expect(smallRes.isHighCostThreshold).toBe(false)
    expect(smallRes.grandTotalUSD).toBe(0.24)
  })

  it('renders High-Cost Confirmation Modal with breakdown and handles Confirm action', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const costResult = CostGovernanceEngine.calculateSingle(30_000_000_000, 'ARCHIVE', undefined, true)

    renderWithProviders(
      <HighCostConfirmationModalShell
        isOpen={true}
        costResult={costResult}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByText(/High-Volume \/ Cold-Tier Transfer Confirmation/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(costResult.formattedTotalSize, 'i'))).toBeInTheDocument()
    expect(screen.getByText(/Confirm & Incur/i)).toBeInTheDocument()

    // Click confirm
    fireEvent.click(screen.getByText(/Confirm & Incur/i))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('renders Cancel button and closes modal on dismiss', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const costResult = CostGovernanceEngine.calculateSingle(30_000_000_000, 'ARCHIVE')

    renderWithProviders(
      <HighCostConfirmationModalShell
        isOpen={true}
        costResult={costResult}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('formats currency and bytes according to GCS decimal standard (1 GB = 10^9 bytes)', () => {
    expect(CostGovernanceEngine.formatBytes(0)).toBe('0 B')
    expect(CostGovernanceEngine.formatBytes(1_000)).toBe('1 KB')
    expect(CostGovernanceEngine.formatBytes(1_000_000_000)).toBe('1 GB')
    expect(CostGovernanceEngine.formatCurrency(0)).toBe('$0.00 USD')
    expect(CostGovernanceEngine.formatCurrency(0.002)).toBe('< $0.01 USD')
    expect(CostGovernanceEngine.formatCurrency(12.5)).toBe('$12.50 USD')
  })
})
