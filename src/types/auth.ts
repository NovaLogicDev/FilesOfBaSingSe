import { PreflightCheckResult } from './gcs'

export interface GCPProject {
  projectId: string
  name: string
  projectNumber: string
  createTime?: string
  lifecycleState: 'ACTIVE' | 'DELETE_REQUESTED'
}

export interface BillingStatus {
  projectId: string
  billingAccountName: string
  billingEnabled: boolean
}

export interface SessionProfile {
  email: string | null
  name: string | null
  avatar: string | null
}

export interface OnboardingState {
  step: 'auth' | 'project' | 'bucket' | 'verify' | 'ready'
  oauthToken: string | null
  userEmail: string | null
  userAvatar: string | null
  discoveredProjects: GCPProject[]
  selectedProjectId: string
  targetBucket: string
  preflight: PreflightCheckResult | null
  isLoading: boolean
  error: string | null
}
