import { describe, it, expect, beforeEach } from 'vitest'
import { CostGovernanceEngine } from '../../src/engines/cost'
import { DEFAULT_GCS_RATES, RateCard } from '../../src/types/cost'
import { usePersistentStore } from '../../src/store/persistentStore'

describe('Pricing Settings & Custom Rate Cards (AUX-06)', () => {
  beforeEach(() => {
    usePersistentStore.getState().resetPreferences()
  })

  it('calculates costs accurately with standard GCS rate card', () => {
    const items = [
      { sizeBytes: 10_000_000_000, storageClass: 'ARCHIVE' }, // 10 GB * 0.05 = $0.50 retrieval + 10 * 0.12 = $1.20 egress = $1.70
    ]

    const cost = CostGovernanceEngine.calculate(items, DEFAULT_GCS_RATES)
    expect(cost.retrievalTotalUSD).toBe(0.5)
    expect(cost.egressTotalUSD).toBe(1.2)
    expect(cost.grandTotalUSD).toBe(1.7)
  })

  it('calculates costs accurately when custom rates are supplied', () => {
    const customRates: RateCard = {
      archiveRetrievalPerGB: 0.02, // Discounted enterprise archive retrieval
      coldlineRetrievalPerGB: 0.01,
      nearlineRetrievalPerGB: 0.005,
      standardRetrievalPerGB: 0.0,
      internetEgressPerGB: 0.08, // Discounted enterprise egress
    }

    const items = [
      { sizeBytes: 10_000_000_000, storageClass: 'ARCHIVE' }, // 10 GB * 0.02 = $0.20 retrieval + 10 * 0.08 = $0.80 egress = $1.00
    ]

    const cost = CostGovernanceEngine.calculate(items, customRates)
    expect(cost.retrievalTotalUSD).toBe(0.2)
    expect(cost.egressTotalUSD).toBe(0.8)
    expect(cost.grandTotalUSD).toBe(1.0)
  })

  it('persists and retrieves custom rate card overrides in persistentStore', () => {
    usePersistentStore.getState().setCustomPricing({
      archiveRetrievalPerGB: 0.035,
      internetEgressPerGB: 0.09,
    })

    const customPricing = usePersistentStore.getState().customPricing
    expect(customPricing.archiveRetrievalPerGB).toBe(0.035)
    expect(customPricing.internetEgressPerGB).toBe(0.09)

    // Resetting restores empty customPricing
    usePersistentStore.getState().resetPreferences()
    expect(usePersistentStore.getState().customPricing).toEqual({})
  })
})
