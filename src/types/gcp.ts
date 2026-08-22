/**
 * Google Cloud Platform (GCP) Resource Management, Service Usage & Billing Types
 * Defined for Google Cloud Resource Manager API v1, Service Usage API v1, and Cloud Billing API v1.
 */

/**
 * GCP Project Lifecycle States as defined in Cloud Resource Manager API v1
 */
export type ProjectLifecycleState =
  | 'LIFECYCLE_STATE_UNSPECIFIED'
  | 'ACTIVE'
  | 'DELETE_REQUESTED'
  | 'DELETE_IN_PROGRESS'

/**
 * Cloud Resource Manager API v1 GCP Project Resource
 */
export interface GCPProject {
  projectId: string
  projectNumber: string
  name: string
  lifecycleState: ProjectLifecycleState
  createTime?: string
  labels?: Record<string, string>
  parent?: {
    type: string
    id: string
  }
}

/**
 * Cloud Resource Manager GET /v1/projects response
 */
export interface ListProjectsResponse {
  projects?: GCPProject[]
  nextPageToken?: string
}

/**
 * Cloud Resource Manager POST /v1/projects request payload
 */
export interface CreateProjectRequest {
  projectId: string
  name?: string
  parent?: {
    type: string
    id: string
  }
  labels?: Record<string, string>
}

/**
 * Google Cloud Long-Running Operation (CRM / Service Usage API)
 */
export interface LongRunningOperation<TMetadata = any, TResponse = any> {
  name: string
  done?: boolean
  error?: {
    code: number
    message: string
    details?: any[]
  }
  metadata?: TMetadata
  response?: TResponse
}

/**
 * Service Usage API v1 Service State
 */
export type ServiceUsageState = 'STATE_UNSPECIFIED' | 'DISABLED' | 'ENABLED'

/**
 * Service Usage API v1 Service Resource
 */
export interface GoogleService {
  name: string // "projects/{project}/services/{service}"
  title?: string
  state?: ServiceUsageState
}

/**
 * Service Usage API POST /services/{service}:enable response
 */
export interface EnableServiceResponse {
  name?: string
  done?: boolean
  error?: {
    code: number
    message: string
    details?: any[]
  }
  response?: {
    service?: GoogleService
    [key: string]: any
  }
}

/**
 * Cloud Billing API v1 ProjectBillingInfo Resource
 * GET https://cloudbilling.googleapis.com/v1/projects/{projectId}/billingInfo
 */
export interface ProjectBillingInfo {
  name: string // "projects/{projectId}/billingInfo"
  projectId: string
  billingAccountName: string // e.g. "billingAccounts/0182A9-983FBC-7721AA" or empty ""
  billingEnabled: boolean
}

/**
 * Normalized Billing Status with user-facing guidance
 */
export interface BillingStatus {
  projectId: string
  billingAccountName: string
  billingEnabled: boolean
  hasActiveBilling?: boolean
  warningMessage?: string
  remediationUrl?: string
}

/**
 * 1-Click Auto-Provisioning Multi-Stage State
 */
export type ProvisioningStage =
  | 'generating_id'
  | 'creating_project'
  | 'enabling_storage_api'
  | 'checking_billing'
  | 'completed'
  | 'failed'

export interface ProvisioningProgress {
  stage: ProvisioningStage
  stageIndex: number
  totalStages: number
  projectId: string
  projectName: string
  status: 'pending' | 'in_progress' | 'success' | 'warning' | 'error'
  message: string
  detail?: string
  remediationUrl?: string
}

/**
 * Final result returned from autoProvisionProject
 */
export interface AutoProvisionResult {
  success: boolean
  project: GCPProject
  billing: ProjectBillingInfo
  storageApiEnabled: boolean
  warning?: string
  remediationUrl?: string
}

/**
 * Standard GCP Service Error Codes
 */
export type GCPErrorCode =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'PROJECT_ALREADY_EXISTS'
  | 'PROJECT_QUOTA_EXCEEDED'
  | 'INVALID_PROJECT_ID'
  | 'SERVICE_ENABLE_FAILED'
  | 'BILLING_NOT_LINKED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN'

export interface GCPServiceError {
  code: GCPErrorCode
  httpStatus?: number
  message: string
  projectId?: string
  remediationStep?: string
  remediationUrl?: string
  rawError?: unknown
}
