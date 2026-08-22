import { RateCard } from './cost'

export interface PreflightMatrixStatus {
  tokenValid: boolean
  bucketReachable: boolean
  iamGranted: boolean
  corsOk: boolean
}

export interface GCPConfigurationSummary {
  // Identity
  userEmail: string | null
  userName: string | null
  userAvatar: string | null
  tokenExpiresAt: number | null
  remainingTokenMinutes: number
  scopes: string[]

  // GCP Project
  savedProjectId: string
  billingEnabled: boolean
  billingAccountName?: string

  // GCS Bucket
  savedBucketName: string
  recentBuckets: string[]
  requesterPaysActive: boolean
  corsConfigured: boolean

  // Pricing
  rates: RateCard
  isCustomRates: boolean
  isFreeTrialAccount: boolean

  // Preflight Health
  preflightMatrix: PreflightMatrixStatus

  // Storage Boundary
  storageBoundaryClean: boolean
  violationsCount: number
}
