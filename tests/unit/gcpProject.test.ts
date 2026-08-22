import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GCPProjectService, gcpProjectService } from '../../src/services/gcpProjectService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { resetAllStores } from '../helpers/testUtils'

describe('GCPProjectService - CRM, Service Usage & Cloud Billing REST Client', () => {
  const sampleToken = 'ya29.sample_test_access_token'
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetAllStores()
    originalFetch = globalThis.fetch
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('validateProjectId', () => {
    it('accepts valid project IDs according to Google Cloud rules', () => {
      expect(gcpProjectService.validateProjectId('basingse-media-dl-9821').valid).toBe(true)
      expect(gcpProjectService.validateProjectId('my-project-123').valid).toBe(true)
      expect(gcpProjectService.validateProjectId('avatar-raw-edit-2026').valid).toBe(true)
      expect(gcpProjectService.validateProjectId('abcdef').valid).toBe(true)
    })

    it('rejects project IDs shorter than 6 characters', () => {
      const result = gcpProjectService.validateProjectId('abc')
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/between 6 and 30 characters/i)
    })

    it('rejects project IDs longer than 30 characters', () => {
      const result = gcpProjectService.validateProjectId('a'.repeat(31))
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/between 6 and 30 characters/i)
    })

    it('rejects project IDs starting with a digit or hyphen', () => {
      expect(gcpProjectService.validateProjectId('1project').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('-project').valid).toBe(false)
    })

    it('rejects project IDs ending with a hyphen', () => {
      const result = gcpProjectService.validateProjectId('valid-project-')
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/cannot end with a hyphen/i)
    })

    it('rejects project IDs containing uppercase letters or special characters', () => {
      expect(gcpProjectService.validateProjectId('Project-Media').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('project_media').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('project.media').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('project!media').valid).toBe(false)
    })

    it('rejects empty or non-string inputs', () => {
      expect(gcpProjectService.validateProjectId('').valid).toBe(false)
      expect(gcpProjectService.validateProjectId(null as any).valid).toBe(false)
    })
  })

  describe('listProjects', () => {
    it('returns active projects and filters out DELETE_REQUESTED projects on 200 OK', async () => {
      const mockProjects = [
        {
          projectId: 'active-project-1',
          name: 'Active Project One',
          projectNumber: '123456789012',
          lifecycleState: 'ACTIVE',
        },
        {
          projectId: 'deleted-project-2',
          name: 'Deleted Project Two',
          projectNumber: '987654321098',
          lifecycleState: 'DELETE_REQUESTED',
        },
        {
          projectId: 'active-project-3',
          name: 'Active Project Three',
          projectNumber: '112233445566',
          lifecycleState: 'ACTIVE',
        },
      ]

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: mockProjects }),
      } as any)

      const result = await gcpProjectService.listProjects(sampleToken)
      expect(result).toHaveLength(2)
      expect(result.map((p) => p.projectId)).toEqual(['active-project-1', 'active-project-3'])
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://cloudresourcemanager.googleapis.com/v1/projects',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${sampleToken}`,
          }),
        }),
      )
    })

    it('handles 403 Forbidden gracefully by returning empty array for new GCP users', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'The caller does not have permission' } }),
      } as any)

      const result = await gcpProjectService.listProjects(sampleToken)
      expect(result).toEqual([])
    })

    it('throws UNAUTHENTICATED error on 401 Unauthorized', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid Credentials' } }),
      } as any)

      await expect(gcpProjectService.listProjects(sampleToken)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        httpStatus: 401,
      })
    })

    it('throws UNAUTHENTICATED error if no token is provided', async () => {
      await expect(gcpProjectService.listProjects('')).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      })
    })
  })

  describe('createProject', () => {
    it('creates project successfully on 200 OK', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          projectNumber: '556677889900',
          createTime: '2026-08-22T05:30:00Z',
        }),
      } as any)

      const project = await gcpProjectService.createProject(
        sampleToken,
        'basingse-media-dl-9821',
        'Ba Sing Se Media Downloads',
      )

      expect(project.projectId).toBe('basingse-media-dl-9821')
      expect(project.name).toBe('Ba Sing Se Media Downloads')
      expect(project.lifecycleState).toBe('ACTIVE')
      expect(project.projectNumber).toBe('556677889900')
    })

    it('throws PROJECT_ALREADY_EXISTS on 409 Conflict', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => 'Project already exists',
        json: async () => ({ error: { code: 409, message: 'Requested entity already exists' } }),
      } as any)

      await expect(
        gcpProjectService.createProject(sampleToken, 'basingse-media-dl-9821'),
      ).rejects.toMatchObject({
        code: 'PROJECT_ALREADY_EXISTS',
        httpStatus: 409,
      })
    })

    it('throws PROJECT_QUOTA_EXCEEDED on 403 Forbidden with remediation guidance', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Quota exceeded',
        json: async () => ({ error: { code: 403, message: 'Project creation quota exceeded' } }),
      } as any)

      await expect(
        gcpProjectService.createProject(sampleToken, 'basingse-media-dl-9821'),
      ).rejects.toMatchObject({
        code: 'PROJECT_QUOTA_EXCEEDED',
        httpStatus: 403,
        remediationStep: expect.stringMatching(/billing account/i),
      })
    })

    it('throws INVALID_PROJECT_ID if format validation fails', async () => {
      await expect(
        gcpProjectService.createProject(sampleToken, 'Invalid_Project_ID'),
      ).rejects.toMatchObject({
        code: 'INVALID_PROJECT_ID',
      })
    })
  })

  describe('enableStorageApi', () => {
    it('enables Google Cloud Storage API on 200 OK', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'operations/serviceusage.enableStorage',
          done: true,
        }),
      } as any)

      const result = await gcpProjectService.enableStorageApi(sampleToken, 'basingse-media-dl-9821')
      expect(result.done).toBe(true)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://serviceusage.googleapis.com/v1/projects/basingse-media-dl-9821/services/storage.googleapis.com:enable',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${sampleToken}`,
          }),
        }),
      )
    })

    it('retries on 404 (eventual consistency) and succeeds on next attempt', async () => {
      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return {
            ok: false,
            status: 404,
            text: async () => 'Project not found yet',
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ done: true }),
        }
      })

      const result = await gcpProjectService.enableStorageApi(sampleToken, 'basingse-media-dl-9821', 3)
      expect(result.done).toBe(true)
      expect(callCount).toBe(2)
    })
  })

  describe('checkBillingStatus', () => {
    it('returns billingEnabled: true when active billing account is linked', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'projects/basingse-media-dl-9821/billingInfo',
          projectId: 'basingse-media-dl-9821',
          billingAccountName: 'billingAccounts/0182A9-983FBC-7721AA',
          billingEnabled: true,
        }),
      } as any)

      const status = await gcpProjectService.checkBillingStatus(sampleToken, 'basingse-media-dl-9821')
      expect(status.projectId).toBe('basingse-media-dl-9821')
      expect(status.billingEnabled).toBe(true)
      expect(status.hasActiveBilling).toBe(true)
      expect(status.billingAccountName).toBe('billingAccounts/0182A9-983FBC-7721AA')
      expect(status.warningMessage).toBeUndefined()
    })

    it('returns billingEnabled: false with remediation link when unlinked', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'projects/basingse-media-dl-9821/billingInfo',
          projectId: 'basingse-media-dl-9821',
          billingAccountName: '',
          billingEnabled: false,
        }),
      } as any)

      const status = await gcpProjectService.checkBillingStatus(sampleToken, 'basingse-media-dl-9821')
      expect(status.billingEnabled).toBe(false)
      expect(status.hasActiveBilling).toBe(false)
      expect(status.warningMessage).toMatch(/Billing is unlinked/i)
      expect(status.remediationUrl).toContain('basingse-media-dl-9821')
    })

    it('detects 403 API disabled error and returns apiDisabled: true with enableUrl', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 403,
            message:
              'Cloud Billing API has not been used in project 932304314277 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=932304314277 then retry.',
            status: 'PERMISSION_DENIED',
          },
        }),
      } as any)

      const status = await gcpProjectService.checkBillingStatus(sampleToken, 'basingse-media-dl-9821')
      expect(status.billingEnabled).toBe(false)
      expect(status.hasActiveBilling).toBe(false)
      expect(status.apiDisabled).toBe(true)
      expect(status.apiEnableUrl).toContain('cloudbilling.googleapis.com/overview?project=basingse-media-dl-9821')
      expect(status.warningMessage).toMatch(/Cloud Billing API is not enabled/i)
    })
  })

  describe('autoProvisionProject', () => {
    it('orchestrates end-to-end auto-provisioning with progress callback in live mode', async () => {
      let crmCalled = false
      let suCalled = false
      let billingCalled = false

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          crmCalled = true
          return {
            ok: true,
            status: 200,
            json: async () => ({ projectNumber: '1092837465' }),
          }
        }
        if (url.includes('serviceusage.googleapis.com')) {
          suCalled = true
          return {
            ok: true,
            status: 200,
            json: async () => ({ done: true }),
          }
        }
        if (url.includes('cloudbilling.googleapis.com')) {
          billingCalled = true
          return {
            ok: true,
            status: 200,
            json: async () => ({
              billingAccountName: 'billingAccounts/0182A9-983FBC-7721AA',
              billingEnabled: true,
            }),
          }
        }
        return { ok: false, status: 404 }
      })

      const progressSteps: any[] = []
      const result = await gcpProjectService.autoProvisionProject(sampleToken, (progress) => {
        progressSteps.push(progress)
      })

      expect(result.success).toBe(true)
      expect(result.project.projectId).toMatch(/^basingse-media-dl-[a-f0-9]{4}$/)
      expect(result.billing.billingEnabled).toBe(true)
      expect(result.storageApiEnabled).toBe(true)

      expect(crmCalled).toBe(true)
      expect(suCalled).toBe(true)
      expect(billingCalled).toBe(true)

      const stages = progressSteps.map((p) => p.stage)
      expect(stages).toContain('generating_id')
      expect(stages).toContain('creating_project')
      expect(stages).toContain('enabling_storage_api')
      expect(stages).toContain('checking_billing')
      expect(stages).toContain('completed')
    })

    it('retries project creation on 409 conflict and succeeds with new ID', async () => {
      let crmAttempts = 0
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          crmAttempts++
          if (crmAttempts === 1) {
            return {
              ok: false,
              status: 409,
              text: async () => 'Collision',
              json: async () => ({ error: { code: 409 } }),
            }
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ projectNumber: '9988776655' }),
          }
        }
        if (url.includes('serviceusage.googleapis.com')) {
          return { ok: true, status: 200, json: async () => ({ done: true }) }
        }
        if (url.includes('cloudbilling.googleapis.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              billingAccountName: 'billingAccounts/0182A9-983FBC-7721AA',
              billingEnabled: true,
            }),
          }
        }
        return { ok: false, status: 404 }
      })

      const result = await gcpProjectService.autoProvisionProject(sampleToken)
      expect(crmAttempts).toBe(2)
      expect(result.success).toBe(true)
      expect(result.project.projectId).toMatch(/^basingse-media-dl-[a-f0-9]{4}$/)
    })
  })

  describe('detectNewProjects', () => {
    it('identifies newly created projects not present in knownProjectIds', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          projects: [
            { projectId: 'existing-proj-1', name: 'Existing 1', lifecycleState: 'ACTIVE' },
            { projectId: 'brand-new-proj-2', name: 'New Free Trial Project', lifecycleState: 'ACTIVE' },
          ],
        }),
      } as any)

      const newProjects = await gcpProjectService.detectNewProjects(sampleToken, ['existing-proj-1'])
      expect(newProjects).toHaveLength(1)
      expect(newProjects[0].projectId).toBe('brand-new-proj-2')
    })
  })
})
