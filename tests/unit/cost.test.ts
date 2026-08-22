import { describe, it, expect } from 'vitest'
import { CostGovernanceEngine } from '../../src/engines/cost'

describe('CostGovernanceEngine (Decimal GB $10^9 Pricing Math)', () => {
  it('correctly calculates single 18.40 GB ARCHIVE asset cost ($3.13 USD)', () => {
    // 18.40 GB = 18,400,000,000 bytes
    // Retrieval: 18.4 * $0.05 = $0.920
    // Egress: 18.4 * $0.12 = $2.208
    // Total: $3.128 -> $3.13 USD
    const result = CostGovernanceEngine.calculateSingle(18_400_000_000, 'ARCHIVE')

    expect(result.totalDecimalGB).toBe(18.4)
    expect(result.retrievalTotalUSD).toBe(0.92)
    expect(result.egressTotalUSD).toBe(2.21)
    expect(result.grandTotalUSD).toBe(3.13)
    expect(result.isHighCostThreshold).toBe(false) // < $5.00 and < 25GB
  })

  it('correctly calculates single 8.00 GB STANDARD asset cost ($0.96 USD)', () => {
    // 8.00 GB = 8,000,000,000 bytes
    // Retrieval: 8.0 * $0.00 = $0.00
    // Egress: 8.0 * $0.12 = $0.96
    // Total: $0.96 USD
    const result = CostGovernanceEngine.calculateSingle(8_000_000_000, 'STANDARD')

    expect(result.totalDecimalGB).toBe(8.0)
    expect(result.retrievalTotalUSD).toBe(0.0)
    expect(result.egressTotalUSD).toBe(0.96)
    expect(result.grandTotalUSD).toBe(0.96)
  })

  it('correctly calculates mixed batch selection (2 Archive + 1 Standard = 42.60 GB -> $6.84 USD)', () => {
    // Asset 1: 18.40 GB Archive ($0.92 ret + $2.208 eg)
    // Asset 2: 16.20 GB Archive ($0.81 ret + $1.944 eg)
    // Asset 3: 8.00 GB Standard ($0.00 ret + $0.960 eg)
    // Total size: 42.60 GB
    // Total retrieval: $0.92 + $0.81 = $1.73
    // Total egress: 42.60 * $0.12 = $5.112 -> $5.11
    // Total: $1.73 + $5.112 = $6.842 -> $6.84 USD
    const batch = [
      { sizeBytes: 18_400_000_000, storageClass: 'ARCHIVE' },
      { sizeBytes: 16_200_000_000, storageClass: 'ARCHIVE' },
      { sizeBytes: 8_000_000_000, storageClass: 'STANDARD' },
    ]

    const result = CostGovernanceEngine.calculate(batch)

    expect(result.itemCount).toBe(3)
    expect(result.totalDecimalGB).toBe(42.6)
    expect(result.retrievalTotalUSD).toBe(1.73)
    expect(result.egressTotalUSD).toBe(5.11)
    expect(result.grandTotalUSD).toBe(6.84)
    expect(result.isHighCostThreshold).toBe(true) // > $5.00 and > 25 GB
  })

  it('correctly applies COLDLINE ($0.02/GB) and NEARLINE ($0.01/GB) rates', () => {
    // 10 GB Coldline -> Retrieval: $0.20, Egress: $1.20, Total: $1.40
    const coldline = CostGovernanceEngine.calculateSingle(10_000_000_000, 'COLDLINE')
    expect(coldline.retrievalTotalUSD).toBe(0.2)
    expect(coldline.grandTotalUSD).toBe(1.4)

    // 10 GB Nearline -> Retrieval: $0.10, Egress: $1.20, Total: $1.30
    const nearline = CostGovernanceEngine.calculateSingle(10_000_000_000, 'NEARLINE')
    expect(nearline.retrievalTotalUSD).toBe(0.1)
    expect(nearline.grandTotalUSD).toBe(1.3)
  })

  it('flags high-cost threshold for transfers >= $5.00 or >= 25.0 GB', () => {
    // $4.90 USD / 20 GB -> False
    const low = CostGovernanceEngine.calculateSingle(20_000_000_000, 'STANDARD')
    expect(low.grandTotalUSD).toBe(2.4)
    expect(low.isHighCostThreshold).toBe(false)

    // 30 GB Standard -> 30 * 0.12 = $3.60 USD (Volume >= 25 GB triggers threshold)
    const highVolume = CostGovernanceEngine.calculateSingle(30_000_000_000, 'STANDARD')
    expect(highVolume.isHighCostThreshold).toBe(true)

    // 30 GB Archive -> 30 * 0.17 = $5.10 USD (Cost >= $5.00 triggers threshold)
    const highCost = CostGovernanceEngine.calculateSingle(30_000_000_000, 'ARCHIVE')
    expect(highCost.isHighCostThreshold).toBe(true)
  })

  it('formats decimal bytes correctly using GCS standard (1 KB = 1000 Bytes)', () => {
    expect(CostGovernanceEngine.formatBytes(0)).toBe('0 B')
    expect(CostGovernanceEngine.formatBytes(4_200)).toBe('4.2 KB')
    expect(CostGovernanceEngine.formatBytes(1_800_000)).toBe('1.8 MB')
    expect(CostGovernanceEngine.formatBytes(18_400_000_000)).toBe('18.4 GB')
    expect(CostGovernanceEngine.formatBytes(2_500_000_000_000)).toBe('2.5 TB')
  })
})
