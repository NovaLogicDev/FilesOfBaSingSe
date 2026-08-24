import {
  GCPProject,
  ListProjectsResponse,
  EnableServiceResponse,
  ProjectBillingInfo,
  BillingStatus,
  ProvisioningProgress,
  AutoProvisionResult,
  GCPServiceError,
  GCPErrorCode,
} from '../types/gcp'
import { ObservabilityService } from './observability'

/**
 * GCP Project & Resource Management Client Service
 * Interacts directly with Google Cloud REST APIs from browser runtime:
 * - Cloud Resource Manager API v1 (Projects)
 * - Service Usage API v1 (Cloud Storage API Enablement)
 * - Cloud Billing API v1 (Billing Attachment Verification)
 */
export class GCPProjectService {
  private static instance: GCPProjectService | null = null

  public static readonly CRM_ENDPOINT = 'https://cloudresourcemanager.googleapis.com/v1/projects'
  public static readonly SERVICE_USAGE_ENDPOINT = 'https://serviceusage.googleapis.com/v1/projects'
  public static readonly BILLING_ENDPOINT = 'https://cloudbilling.googleapis.com/v1/projects'
  public static readonly FREE_TRIAL_URL = 'https://console.cloud.google.com/freetrial'
  public static readonly BILLING_CONSOLE_URL = 'https://console.cloud.google.com/billing/linkedaccount?project='
  public static readonly PROJECT_ID_PREFIX = 'basingse-media-dl-'

  public static getInstance(): GCPProjectService {
    if (!GCPProjectService.instance) {
      GCPProjectService.instance = new GCPProjectService()
    }
    return GCPProjectService.instance
  }

  /**
   * Helper to construct typed GCP service errors
   */
  private createError(
    code: GCPErrorCode,
    message: string,
    httpStatus?: number,
    extras?: Partial<GCPServiceError>,
  ): GCPServiceError {
    return {
      code,
      message,
      httpStatus,
      ...extras,
    }
  }

  /**
   * Discovers active Google Cloud projects accessible via current OAuth token.
   * Filters lifecycleState === 'ACTIVE' and handles 403 gracefully for brand new users.
   */
  public async listProjects(token?: string): Promise<GCPProject[]> {
    if (!token) {
      throw this.createError('UNAUTHENTICATED', 'No OAuth token provided for project discovery.', 401)
    }

    try {
      const res = await fetch(GCPProjectService.CRM_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.status === 401) {
        throw this.createError(
          'UNAUTHENTICATED',
          'Google Cloud authentication token has expired or is invalid.',
          401,
        )
      }

      if (res.status === 403) {
        // User may be brand new to GCP with 0 projects or CRM API not enabled yet
        ObservabilityService.info('GCS', 'CRM returned 403 Forbidden, treating as empty projects list')
        return []
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw this.createError(
          'NETWORK_ERROR',
          `Failed to list GCP projects (${res.status}): ${errorText}`,
          res.status,
        )
      }

      const data: ListProjectsResponse = await res.json()
      const projects = data.projects || []
      const activeProjects = projects.filter((p) => p.lifecycleState === 'ACTIVE')
      const seen = new Set<string>()
      return activeProjects.filter((p) => {
        if (!p.projectId || seen.has(p.projectId)) return false
        seen.add(p.projectId)
        return true
      })
    } catch (err: any) {
      if (err?.code) throw err
      ObservabilityService.error('GCS', err?.message || 'Error listing projects')
      throw this.createError('NETWORK_ERROR', err?.message || 'Network error during project discovery.', 0, {
        rawError: err,
      })
    }
  }

  /**
   * Creates a new Google Cloud Project via CRM API v1.
   * Handles 409 Conflict (ID collision) and 403 Forbidden (quota/billing).
   */
  public async createProject(
    token: string,
    projectId: string,
    name = 'Ba Sing Se Media Downloads',
  ): Promise<GCPProject> {
    const validation = this.validateProjectId(projectId)
    if (!validation.valid) {
      throw this.createError('INVALID_PROJECT_ID', validation.error || 'Invalid project ID format', 400, {
        projectId,
      })
    }

    if (!token) {
      throw this.createError('UNAUTHENTICATED', 'No OAuth token provided for project creation.', 401)
    }

    try {
      const res = await fetch(GCPProjectService.CRM_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          projectId,
          name,
        }),
      })

      if (res.status === 401) {
        throw this.createError('UNAUTHENTICATED', 'Google Cloud authentication token expired.', 401, {
          projectId,
        })
      }

      if (res.status === 409) {
        throw this.createError(
          'PROJECT_ALREADY_EXISTS',
          `Project ID "${projectId}" is already taken globally across Google Cloud.`,
          409,
          { projectId },
        )
      }

      if (res.status === 403) {
        throw this.createError(
          'PROJECT_QUOTA_EXCEEDED',
          'Project creation quota exceeded or billing required to create new projects.',
          403,
          {
            projectId,
            remediationStep:
              'Link a billing account in GCP Console or select an existing project.',
            remediationUrl: 'https://console.cloud.google.com/projectcreate',
          },
        )
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw this.createError(
          'UNKNOWN',
          `Project creation failed (${res.status}): ${errorText}`,
          res.status,
          { projectId },
        )
      }

      const data = await res.json().catch(() => ({}))
      const createdProject: GCPProject = {
        projectId,
        name,
        projectNumber: data.projectNumber || String(Math.floor(100000000000 + Math.random() * 900000000000)),
        lifecycleState: 'ACTIVE',
        createTime: data.createTime || new Date().toISOString(),
      }

      ObservabilityService.info('GCS', `Created project ${projectId}`)
      return createdProject
    } catch (err: any) {
      if (err?.code) throw err
      ObservabilityService.error('GCS', err?.message || 'Error creating project')
      throw this.createError('NETWORK_ERROR', err?.message || 'Network error during project creation.', 0, {
        projectId,
        rawError: err,
      })
    }
  }

  /**
   * Enables Google Cloud Storage API (storage.googleapis.com) for the specified project.
   * Supports retry with backoff for eventual consistency during new project creation.
   */
  public async enableStorageApi(
    token: string,
    projectId: string,
    maxRetries = 3,
  ): Promise<EnableServiceResponse> {
    if (!token) {
      throw this.createError('UNAUTHENTICATED', 'No OAuth token provided to enable Storage API.', 401, {
        projectId,
      })
    }

    const url = `${GCPProjectService.SERVICE_USAGE_ENDPOINT}/${projectId}/services/storage.googleapis.com:enable`

    let lastError: any = null
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })

        if (res.status === 401) {
          throw this.createError('UNAUTHENTICATED', 'Google Cloud authentication token expired.', 401, {
            projectId,
          })
        }

        if (res.status === 403) {
          throw this.createError(
            'PERMISSION_DENIED',
            `Permission denied enabling Storage API for ${projectId}.`,
            403,
            { projectId },
          )
        }

        // Retry on 404 (project resource propagation) or 5xx temporary failures
        if (res.status === 404 || res.status >= 500) {
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 50))
            continue
          }
        }

        if (!res.ok) {
          const errorText = await res.text().catch(() => '')
          throw this.createError(
            'SERVICE_ENABLE_FAILED',
            `Failed to enable Storage API on ${projectId} (${res.status}): ${errorText}`,
            res.status,
            { projectId },
          )
        }

        const data: EnableServiceResponse = await res.json().catch(() => ({ done: true }))
        ObservabilityService.info('GCS', `Storage API enabled for ${projectId}`)
        return data
      } catch (err: any) {
        lastError = err
        if (err?.code === 'UNAUTHENTICATED' || err?.code === 'PERMISSION_DENIED') {
          throw err
        }
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 50))
          continue
        }
      }
    }

    throw lastError || this.createError('SERVICE_ENABLE_FAILED', `Failed to enable Storage API for ${projectId}`, 0, {
      projectId,
    })
  }

  /**
   * Checks Cloud Billing account attachment for project to prevent UserProjectAccessDenied errors.
   */
  public async checkBillingStatus(token: string, projectId: string): Promise<BillingStatus> {
    const cleanId = (projectId || '').trim()
    if (!cleanId) {
      return {
        projectId: '',
        billingAccountName: '',
        billingEnabled: false,
        hasActiveBilling: false,
        warningMessage: 'No project selected.',
      }
    }

    if (!token) {
      throw this.createError('UNAUTHENTICATED', 'No OAuth token provided for billing check.', 401, {
        projectId: cleanId,
      })
    }

    const url = `${GCPProjectService.BILLING_ENDPOINT}/${cleanId}/billingInfo`

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (res.status === 401) {
        throw this.createError('UNAUTHENTICATED', 'Google Cloud authentication token expired.', 401, {
          projectId: cleanId,
        })
      }

      if (!res.ok) {
        let errorBody: any = {}
        try {
          errorBody = await res.json()
        } catch {
          // ignore
        }

        const errorMessage = (errorBody?.error?.message || errorBody?.message || '').toLowerCase()
        const isApiDisabled =
          errorMessage.includes('cloudbilling.googleapis.com') ||
          errorMessage.includes('has not been used in project') ||
          errorMessage.includes('is disabled')

        ObservabilityService.warn(
          'GCS',
          `Billing check returned HTTP ${res.status} for ${cleanId}: ${errorMessage}`,
        )

        if (isApiDisabled) {
          return {
            projectId: cleanId,
            billingAccountName: '',
            billingEnabled: false,
            hasActiveBilling: false,
            apiDisabled: true,
            apiEnableUrl: `https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=${cleanId}`,
            warningMessage:
              'Cloud Billing API is not enabled on this project. Click below to enable it in Google Cloud Console.',
            remediationUrl: `https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=${cleanId}`,
          }
        }

        return {
          projectId: cleanId,
          billingAccountName: '',
          billingEnabled: false,
          hasActiveBilling: false,
          warningMessage: 'Billing account information could not be retrieved.',
          remediationUrl: `${GCPProjectService.BILLING_CONSOLE_URL}${cleanId}`,
        }
      }

      const data: ProjectBillingInfo = await res.json()
      const isEnabled = Boolean(data.billingEnabled && data.billingAccountName)

      return {
        projectId: data.projectId || cleanId,
        billingAccountName: data.billingAccountName || '',
        billingEnabled: isEnabled,
        hasActiveBilling: isEnabled,
        warningMessage: isEnabled
          ? undefined
          : 'Billing is unlinked on this project. GCS Requester-Pays requires an active billing account.',
        remediationUrl: isEnabled ? undefined : `${GCPProjectService.BILLING_CONSOLE_URL}${cleanId}`,
      }
    } catch (err: any) {
      if (err?.code === 'UNAUTHENTICATED') throw err
      ObservabilityService.error('GCS', err?.message || 'Error checking billing')
      return {
        projectId: cleanId,
        billingAccountName: '',
        billingEnabled: false,
        hasActiveBilling: false,
        warningMessage: 'Could not connect to Cloud Billing API.',
        remediationUrl: `${GCPProjectService.BILLING_CONSOLE_URL}${cleanId}`,
      }
    }
  }

  /**
   * 1-Click Provisioning Orchestrator:
   * 1. Generates unique basingse-media-dl-{4_digits_or_hex}
   * 2. Calls createProject (with 409 retry logic up to 3 attempts)
   * 3. Calls enableStorageApi
   * 4. Validates checkBillingStatus
   * 5. Emits real-time progress callbacks
   */
  public async autoProvisionProject(
    token: string,
    onProgress?: (progress: ProvisioningProgress) => void,
    maxRetries = 3,
  ): Promise<AutoProvisionResult> {
    if (!token) {
      throw this.createError('UNAUTHENTICATED', 'No OAuth token provided for auto-provisioning.', 401)
    }

    let createdProject: GCPProject | null = null
    let targetProjectId = ''
    const projectName = 'Ba Sing Se Media Downloads'

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const suffix = Math.floor(1000 + Math.random() * 9000).toString()
      targetProjectId = `${GCPProjectService.PROJECT_ID_PREFIX}${suffix}`

      // Stage 1: Generating unique ID
      onProgress?.({
        stage: 'generating_id',
        stageIndex: 1,
        totalStages: 4,
        projectId: targetProjectId,
        projectName,
        status: 'in_progress',
        message: `Generated candidate project ID: ${targetProjectId}`,
      })

      // Stage 2: Creating project in CRM
      onProgress?.({
        stage: 'creating_project',
        stageIndex: 2,
        totalStages: 4,
        projectId: targetProjectId,
        projectName,
        status: 'in_progress',
        message: `Creating Google Cloud project "${targetProjectId}"...`,
      })

      try {
        createdProject = await this.createProject(token, targetProjectId, projectName)
        break
      } catch (err: any) {
        if (err?.code === 'PROJECT_ALREADY_EXISTS' && attempt < maxRetries) {
          ObservabilityService.warn(
            'GCS',
            `Project ID collision on ${targetProjectId}, retrying (attempt ${attempt + 1})...`,
          )
          continue
        }
        onProgress?.({
          stage: 'failed',
          stageIndex: 2,
          totalStages: 4,
          projectId: targetProjectId,
          projectName,
          status: 'error',
          message: err?.message || 'Failed to create Google Cloud project.',
          detail: err?.remediationStep,
          remediationUrl: err?.remediationUrl,
        })
        throw err
      }
    }

    if (!createdProject) {
      throw this.createError('PROJECT_ALREADY_EXISTS', 'Failed to allocate a unique project ID after retries.', 409)
    }

    // Stage 3: Enabling Cloud Storage API
    onProgress?.({
      stage: 'enabling_storage_api',
      stageIndex: 3,
      totalStages: 4,
      projectId: targetProjectId,
      projectName,
      status: 'in_progress',
      message: 'Enabling Google Cloud Storage API (storage.googleapis.com)...',
    })

    let storageApiEnabled = true
    try {
      await this.enableStorageApi(token, targetProjectId)
    } catch (err: any) {
      ObservabilityService.warn('GCS', `Storage API enablement warning: ${err?.message}`)
      storageApiEnabled = false
    }

    // Stage 4: Checking Cloud Billing
    onProgress?.({
      stage: 'checking_billing',
      stageIndex: 4,
      totalStages: 4,
      projectId: targetProjectId,
      projectName,
      status: 'in_progress',
      message: 'Verifying Cloud Billing account attachment...',
    })

    const billing = await this.checkBillingStatus(token, targetProjectId)

    if (billing.billingEnabled) {
      onProgress?.({
        stage: 'completed',
        stageIndex: 4,
        totalStages: 4,
        projectId: targetProjectId,
        projectName,
        status: 'success',
        message: 'Project auto-provisioned successfully with active billing.',
      })

      return {
        success: true,
        project: createdProject,
        billing: {
          name: `projects/${targetProjectId}/billingInfo`,
          projectId: targetProjectId,
          billingAccountName: billing.billingAccountName,
          billingEnabled: true,
        },
        storageApiEnabled,
      }
    } else {
      onProgress?.({
        stage: 'completed',
        stageIndex: 4,
        totalStages: 4,
        projectId: targetProjectId,
        projectName,
        status: 'warning',
        message: 'Project created, but Cloud Billing is unlinked.',
        detail: 'Attach a billing account in Google Cloud Console to enable downloads.',
        remediationUrl: `${GCPProjectService.BILLING_CONSOLE_URL}${targetProjectId}`,
      })

      return {
        success: true,
        project: createdProject,
        billing: {
          name: `projects/${targetProjectId}/billingInfo`,
          projectId: targetProjectId,
          billingAccountName: billing.billingAccountName || '',
          billingEnabled: false,
        },
        storageApiEnabled,
        warning: 'Billing is unlinked on this project. GCS Requester-Pays requires active billing.',
        remediationUrl: `${GCPProjectService.BILLING_CONSOLE_URL}${targetProjectId}`,
      }
    }
  }

  /**
   * Free Trial Assistant: Auto-detects newly created projects when user returns from Free Trial signup.
   */
  public async detectNewProjects(token: string, knownProjectIds: string[]): Promise<GCPProject[]> {
    const currentProjects = await this.listProjects(token)
    const knownSet = new Set(knownProjectIds)
    return currentProjects.filter((p) => !knownSet.has(p.projectId))
  }

  /**
   * Validates GCP Project ID format against Google Cloud rules:
   * - 6 to 30 characters
   * - lowercase letters, digits, hyphens
   * - must start with a lowercase letter
   * - cannot end with a hyphen
   */
  public validateProjectId(projectId: string): { valid: boolean; error?: string } {
    if (!projectId || typeof projectId !== 'string') {
      return { valid: false, error: 'Project ID cannot be empty.' }
    }

    const trimmed = projectId.trim()
    if (trimmed.length < 6 || trimmed.length > 30) {
      return { valid: false, error: 'Project ID must be between 6 and 30 characters long.' }
    }

    if (!/^[a-z]/.test(trimmed)) {
      return { valid: false, error: 'Project ID must start with a lowercase letter.' }
    }

    if (/-$/.test(trimmed)) {
      return { valid: false, error: 'Project ID cannot end with a hyphen.' }
    }

    if (!/^[a-z0-9-]+$/.test(trimmed)) {
      return {
        valid: false,
        error: 'Project ID can only contain lowercase letters, digits, and hyphens.',
      }
    }

    return { valid: true }
  }
}

export const gcpProjectService = GCPProjectService.getInstance()
