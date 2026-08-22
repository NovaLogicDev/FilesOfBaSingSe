export interface RateCard {
  archiveRetrievalPerGB: number
  coldlineRetrievalPerGB: number
  nearlineRetrievalPerGB: number
  standardRetrievalPerGB: number
  internetEgressPerGB: number
}

export const DEFAULT_GCS_RATES: RateCard = {
  archiveRetrievalPerGB: 0.05,
  coldlineRetrievalPerGB: 0.02,
  nearlineRetrievalPerGB: 0.01,
  standardRetrievalPerGB: 0.0,
  internetEgressPerGB: 0.12,
}

export interface CalculatedCostResult {
  totalBytes: number
  totalDecimalGB: number
  formattedTotalSize: string
  itemCount: number
  archiveBytes: number
  coldlineBytes: number
  nearlineBytes: number
  standardBytes: number
  retrievalTotalUSD: number
  egressTotalUSD: number
  grandTotalUSD: number
  isHighCostThreshold: boolean
  coveredByFreeTrial: boolean
}
