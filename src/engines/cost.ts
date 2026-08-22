import { CalculatedCostResult, DEFAULT_GCS_RATES, RateCard } from '../types/cost'

/**
 * Cost Governance & Real-Time Estimator Engine
 * Strictly enforces GCS Decimal Gigabyte Standard (1 GB = 10^9 bytes = 1,000,000,000 bytes)
 * Evaluates itemized retrieval and internet data egress charges.
 */
export class CostGovernanceEngine {
  public static readonly HIGH_COST_USD_THRESHOLD = 5.0
  public static readonly HIGH_VOLUME_GB_THRESHOLD = 25.0

  /**
   * Resolves a complete RateCard from partial/custom pricing overrides, safely falling back to DEFAULT_GCS_RATES.
   */
  public static resolveRateCard(rates?: Partial<RateCard> | null): RateCard {
    return {
      archiveRetrievalPerGB:
        typeof rates?.archiveRetrievalPerGB === 'number' && !Number.isNaN(rates.archiveRetrievalPerGB)
          ? rates.archiveRetrievalPerGB
          : DEFAULT_GCS_RATES.archiveRetrievalPerGB,
      coldlineRetrievalPerGB:
        typeof rates?.coldlineRetrievalPerGB === 'number' && !Number.isNaN(rates.coldlineRetrievalPerGB)
          ? rates.coldlineRetrievalPerGB
          : DEFAULT_GCS_RATES.coldlineRetrievalPerGB,
      nearlineRetrievalPerGB:
        typeof rates?.nearlineRetrievalPerGB === 'number' && !Number.isNaN(rates.nearlineRetrievalPerGB)
          ? rates.nearlineRetrievalPerGB
          : DEFAULT_GCS_RATES.nearlineRetrievalPerGB,
      standardRetrievalPerGB:
        typeof rates?.standardRetrievalPerGB === 'number' && !Number.isNaN(rates.standardRetrievalPerGB)
          ? rates.standardRetrievalPerGB
          : DEFAULT_GCS_RATES.standardRetrievalPerGB,
      internetEgressPerGB:
        typeof rates?.internetEgressPerGB === 'number' && !Number.isNaN(rates.internetEgressPerGB)
          ? rates.internetEgressPerGB
          : DEFAULT_GCS_RATES.internetEgressPerGB,
    }
  }

  /**
   * Calculates exact retrieval and egress fees for a collection of media assets.
   */
  public static calculate(
    items: Array<{ sizeBytes: number | string; storageClass: string }>,
    rates?: Partial<RateCard> | null,
    isFreeTrial: boolean = false,
  ): CalculatedCostResult {
    const effectiveRates = this.resolveRateCard(rates)
    let totalBytes = 0
    let archiveBytes = 0
    let coldlineBytes = 0
    let nearlineBytes = 0
    let standardBytes = 0
    let retrievalTotalUSD = 0

    for (const item of items) {
      const bytes =
        typeof item.sizeBytes === 'string'
          ? parseInt(item.sizeBytes, 10) || 0
          : item.sizeBytes || 0

      totalBytes += bytes
      const decimalGB = bytes / 1_000_000_000

      const storageClass = (item.storageClass || 'STANDARD').toUpperCase()
      switch (storageClass) {
        case 'ARCHIVE':
          archiveBytes += bytes
          retrievalTotalUSD += decimalGB * effectiveRates.archiveRetrievalPerGB
          break
        case 'COLDLINE':
          coldlineBytes += bytes
          retrievalTotalUSD += decimalGB * effectiveRates.coldlineRetrievalPerGB
          break
        case 'NEARLINE':
          nearlineBytes += bytes
          retrievalTotalUSD += decimalGB * effectiveRates.nearlineRetrievalPerGB
          break
        default:
          standardBytes += bytes
          retrievalTotalUSD += decimalGB * effectiveRates.standardRetrievalPerGB
          break
      }
    }

    const totalDecimalGB = totalBytes / 1_000_000_000
    const egressTotalUSD = totalDecimalGB * effectiveRates.internetEgressPerGB
    const grandTotalUSD = retrievalTotalUSD + egressTotalUSD

    const roundedGrandTotal = Math.round(grandTotalUSD * 100) / 100
    const roundedTotalGB = Math.round(totalDecimalGB * 100) / 100

    const isHighCostThreshold =
      roundedGrandTotal >= this.HIGH_COST_USD_THRESHOLD ||
      roundedTotalGB >= this.HIGH_VOLUME_GB_THRESHOLD

    return {
      totalBytes,
      totalDecimalGB,
      formattedTotalSize: this.formatBytes(totalBytes),
      itemCount: items.length,
      archiveBytes,
      coldlineBytes,
      nearlineBytes,
      standardBytes,
      retrievalTotalUSD: Math.round(retrievalTotalUSD * 100) / 100,
      egressTotalUSD: Math.round(egressTotalUSD * 100) / 100,
      grandTotalUSD: roundedGrandTotal,
      isHighCostThreshold,
      coveredByFreeTrial: isFreeTrial,
    }
  }

  /**
   * Calculates cost for a single media asset.
   */
  public static calculateSingle(
    sizeBytes: number | string,
    storageClass: string,
    rates?: Partial<RateCard> | null,
    isFreeTrial: boolean = false,
  ): CalculatedCostResult {
    return this.calculate([{ sizeBytes, storageClass }], rates, isFreeTrial)
  }

  /**
   * Formats raw byte counts into human-readable strings using GCS Decimal standard (1 KB = 1000 Bytes).
   * e.g. 18,400,000,000 -> "18.40 GB"
   */
  public static formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const k = 1000 // GCS Decimal Standard
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(2))
    return `${formatted} ${sizes[i] || 'B'}`
  }

  /**
   * Formats USD currency values cleanly.
   * e.g. 3.128 -> "$3.13 USD"
   */
  public static formatCurrency(amount: number): string {
    if (amount === 0) return '$0.00 USD'
    if (amount > 0 && amount < 0.01) return '< $0.01 USD'
    return `$${amount.toFixed(2)} USD`
  }
}
