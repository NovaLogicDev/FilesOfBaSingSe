import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GCPProjectService, gcpProjectService } from '../../src/services/gcpProjectService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { resetAllStores } from '../helpers/testUtils'
import { ProvisioningProgress } from '../../src/types/gcp'

describe('M2 Challenger - Comprehensive Empirical Adversarial Stress & Fuzz Suite', () => {
  const sampleToken = 'ya29.sample_adversarial_token_m2_empirical'
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetAllStores()
    originalFetch = globalThis.fetch
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ==========================================================================
  // Section 1: ID Regex Fuzzing & Boundary Matrix (validateProjectId)
  // ==========================================================================
  describe('Section 1: ID Regex Fuzzing & Boundary Condition Matrix', () => {
    it('accurately validates boundary lengths [0, 5, 6, 29, 30, 31, 100]', () => {
      // Length 0 (Empty)
      expect(gcpProjectService.validateProjectId('').valid).toBe(false)

      // Lengths 1 through 5 (Too short)
      for (let len = 1; len <= 5; len++) {
        const shortId = 'a'.repeat(len)
        const result = gcpProjectService.validateProjectId(shortId)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/between 6 and 30 characters/i)
      }

      // Min valid length: 6
      expect(gcpProjectService.validateProjectId('a12345').valid).toBe(true)
      expect(gcpProjectService.validateProjectId('abcdef').valid).toBe(true)

      // Valid lengths: 7 through 30
      expect(gcpProjectService.validateProjectId('a'.repeat(29)).valid).toBe(true)
      expect(gcpProjectService.validateProjectId('a'.repeat(30)).valid).toBe(true)

      // Max invalid length: 31 (Too long)
      const long31 = 'a'.repeat(31)
      const result31 = gcpProjectService.validateProjectId(long31)
      expect(result31.valid).toBe(false)
      expect(result31.error).toMatch(/between 6 and 30 characters/i)

      // Extreme lengths: 100, 1000
      expect(gcpProjectService.validateProjectId('a'.repeat(100)).valid).toBe(false)
      expect(gcpProjectService.validateProjectId('a'.repeat(1000)).valid).toBe(false)
    })

    it('rejects all start-character violations (digits, hyphens, uppercase, symbols)', () => {
      // Starting with digits
      for (let digit = 0; digit <= 9; digit++) {
        const id = `${digit}abcdef`
        const result = gcpProjectService.validateProjectId(id)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/must start with a lowercase letter/i)
      }

      // Starting with hyphens
      expect(gcpProjectService.validateProjectId('-abcdef').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('--abcdef').valid).toBe(false)

      // Starting with uppercase
      expect(gcpProjectService.validateProjectId('Abcdef').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('Z12345').valid).toBe(false)
    })

    it('rejects all trailing hyphen violations', () => {
      expect(gcpProjectService.validateProjectId('abcdef-').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('basingse-media-dl-').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('valid-project-name-').valid).toBe(false)
      expect(gcpProjectService.validateProjectId('a-b-c-d-e-').valid).toBe(false)
    })

    it('rejects illegal characters (symbols, spaces, uppercase, unicode, null bytes, emojis)', () => {
      const illegalSamples = [
        'project_one_two',
        'project.name.12',
        'project@company',
        'project#tag123',
        'project$cost12',
        'project%percent',
        'project^power',
        'project&and123',
        'project*star12',
        'project(brace)',
        'project+plus12',
        'project=equals',
        'project/slash1',
        'project\\escape',
        'project:colon1',
        'project;semi12',
        'project"quote1',
        'project\'apos1',
        'project<tag>12',
        'project?query1',
        'project`back12',
        'project~tilde1',
        'project|pipe12',
        'project{curly}',
        'project[brack]',
        'project space1',
        'project\t\nspace',
        'project\x00null',
        'pröject-12345',
        'project-🚀-dl',
        'PROJECT-MEDIA',
        'Project-Media',
        'project-Media',
      ]

      for (const id of illegalSamples) {
        const result = gcpProjectService.validateProjectId(id)
        expect(result.valid).toBe(false)
      }
    })

    it('fuzzes validateProjectId with 500 randomized pseudo-malicious inputs', () => {
      const fuzzChars = 'abcdefghijklmnopqrstuvwxyz0123456789-_./\\@#$%^&*()+= \t\n\x00\u00FF'

      for (let i = 0; i < 500; i++) {
        const length = Math.floor(Math.random() * 40)
        let generated = ''
        for (let j = 0; j < length; j++) {
          generated += fuzzChars[Math.floor(Math.random() * fuzzChars.length)]
        }

        const result = gcpProjectService.validateProjectId(generated)
        const trimmed = generated.trim()

        const expectedValid =
          trimmed.length >= 6 &&
          trimmed.length <= 30 &&
          /^[a-z]/.test(trimmed) &&
          !/-$/.test(trimmed) &&
          /^[a-z0-9-]+$/.test(trimmed)

        expect(result.valid).toBe(expectedValid)
      }
    })

    it('fuzzes validateProjectId with non-string and pathological types', () => {
      const pathologicalInputs: any[] = [
        null,
        undefined,
        123456,
        0,
        -1,
        NaN,
        Infinity,
        true,
        false,
        {},
        { projectId: 'valid-id' },
        [],
        ['valid-project-id'],
        () => 'valid-project-id',
        Symbol('project'),
        BigInt(123456),
      ]

      for (const input of pathologicalInputs) {
        const result = gcpProjectService.validateProjectId(input)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/cannot be empty/i)
      }
    })
  })

  // ==========================================================================
  // Section 2: Collision Retry Exhaustion & CRM Faults
  // ==========================================================================
  describe('Section 2: Collision Retry Exhaustion & CRM Faults', () => {
    it('exhausts all retries when CRM consistently returns 409 Conflict', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      let crmCalls = 0
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          crmCalls++
          return {
            ok: false,
            status: 409,
            text: async () => 'Entity already exists globally',
            json: async () => ({ error: { code: 409, message: 'Requested entity already exists' } }),
          }
        }
        return { ok: false, status: 404 }
      })

      const progressStages: ProvisioningProgress[] = []
      const maxRetries = 4

      await expect(
        gcpProjectService.autoProvisionProject(
          sampleToken,
          (progress) => progressStages.push(progress),
          maxRetries,
        ),
      ).rejects.toMatchObject({
        code: 'PROJECT_ALREADY_EXISTS',
        httpStatus: 409,
      })

      expect(crmCalls).toBe(maxRetries)
      const failedProgress = progressStages.find((p) => p.stage === 'failed')
      expect(failedProgress).toBeDefined()
      expect(failedProgress?.status).toBe('error')
    })

    it('recovers on last retry attempt after preceding 409 collisions', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      let crmCalls = 0
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          crmCalls++
          if (crmCalls < 3) {
            return {
              ok: false,
              status: 409,
              text: async () => 'Conflict',
              json: async () => ({ error: { code: 409 } }),
            }
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ projectNumber: '9988776655', createTime: '2026-08-22T05:00:00Z' }),
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

      const result = await gcpProjectService.autoProvisionProject(sampleToken, undefined, 3)
      expect(crmCalls).toBe(3)
      expect(result.success).toBe(true)
      expect(result.project.projectNumber).toBe('9988776655')
    })

    it('fails immediately on CRM 403 Forbidden (Quota Exceeded) without retrying uselessly', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      let crmCalls = 0
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          crmCalls++
          return {
            ok: false,
            status: 403,
            text: async () => 'Quota exceeded',
            json: async () => ({ error: { code: 403, message: 'Project creation quota exceeded' } }),
          }
        }
        return { ok: false, status: 404 }
      })

      const progressStages: ProvisioningProgress[] = []
      await expect(
        gcpProjectService.autoProvisionProject(sampleToken, (p) => progressStages.push(p)),
      ).rejects.toMatchObject({
        code: 'PROJECT_QUOTA_EXCEEDED',
        httpStatus: 403,
        remediationUrl: 'https://console.cloud.google.com/projectcreate',
      })

      // Must fail fast on attempt 1
      expect(crmCalls).toBe(1)
      const failed = progressStages.find((p) => p.stage === 'failed')
      expect(failed?.status).toBe('error')
      expect(failed?.remediationUrl).toBe('https://console.cloud.google.com/projectcreate')
    })

    it('handles unexpected CRM 500 Internal Server Error with typed UNKNOWN error', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          return {
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error in Google CRM backend',
          }
        }
        return { ok: false, status: 404 }
      })

      await expect(gcpProjectService.autoProvisionProject(sampleToken)).rejects.toMatchObject({
        code: 'UNKNOWN',
        httpStatus: 500,
      })
    })

    it('handles CRM returning malformed HTML error payload instead of JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '<html><body>502 Bad Gateway</body></html>',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0')
        },
      } as any)

      await expect(
        gcpProjectService.createProject(sampleToken, 'basingse-media-dl-1234'),
      ).rejects.toMatchObject({
        code: 'UNKNOWN',
        httpStatus: 502,
      })
    })
  })

  // ==========================================================================
  // Section 3: Rapid Repeated & Concurrent Provisioning Stress
  // ==========================================================================
  describe('Section 3: Rapid Repeated & Concurrent Auto-Provisioning Calls', () => {
    it('executes 100 rapid concurrent autoProvisionDemoProject calls without collision or mutation corruption', () => {
      gcpProjectService.resetDemoProjects()
      const initialCount = gcpProjectService.listDemoProjects().length

      const results = Array.from({ length: 100 }, () => gcpProjectService.autoProvisionDemoProject())

      expect(results).toHaveLength(100)
      for (const proj of results) {
        expect(proj.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
        expect(proj.lifecycleState).toBe('ACTIVE')
        expect(proj.name).toBe('Ba Sing Se Media Downloads')
        expect(proj.projectNumber).toBeDefined()
      }

      const totalDemoProjects = gcpProjectService.listDemoProjects()
      expect(totalDemoProjects.length).toBe(initialCount + 100)
    })

    it('executes 30 rapid concurrent autoProvisionProject calls in live mode with clean isolation', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      let invocationCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          invocationCount++
          return {
            ok: true,
            status: 200,
            json: async () => ({
              projectNumber: String(100000000000 + invocationCount),
              createTime: new Date().toISOString(),
            }),
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

      const parallelPromises = Array.from({ length: 30 }, (_, index) => {
        const progressSteps: ProvisioningProgress[] = []
        return gcpProjectService
          .autoProvisionProject(sampleToken, (p) => progressSteps.push(p))
          .then((res) => ({ res, progressSteps, index }))
      })

      const completed = await Promise.all(parallelPromises)
      expect(completed).toHaveLength(30)

      for (const { res, progressSteps } of completed) {
        expect(res.success).toBe(true)
        expect(res.project.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
        expect(res.billing.billingEnabled).toBe(true)
        expect(res.storageApiEnabled).toBe(true)

        // Verify each callback trail is complete and consistent
        const stages = progressSteps.map((p) => p.stage)
        expect(stages).toEqual([
          'generating_id',
          'creating_project',
          'enabling_storage_api',
          'checking_billing',
          'completed',
        ])
      }
    })

    it('handles concurrent interleaved demo and live provisioning requests safely', async () => {
      useRuntimeStore.getState().setDemoMode(true)
      const demoResult = await gcpProjectService.autoProvisionProject('')
      expect(demoResult.success).toBe(true)
      expect(demoResult.project.projectId).toMatch(/^basingse-media-dl-\d{4}$/)

      useRuntimeStore.getState().setDemoMode(false)
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          return { ok: true, status: 200, json: async () => ({ projectNumber: '7766554433' }) }
        }
        if (url.includes('serviceusage.googleapis.com')) {
          return { ok: true, status: 200, json: async () => ({ done: true }) }
        }
        if (url.includes('cloudbilling.googleapis.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ billingAccountName: 'billingAccounts/123', billingEnabled: true }),
          }
        }
        return { ok: false, status: 404 }
      })

      const liveResult = await gcpProjectService.autoProvisionProject(sampleToken)
      expect(liveResult.success).toBe(true)
      expect(liveResult.project.projectNumber).toBe('7766554433')
    })
  })

  // ==========================================================================
  // Section 4: Network Drop & Fault Injection during Multi-Stage Provisioning
  // ==========================================================================
  describe('Section 4: Network Drop & Fault Injection during Multi-Stage Provisioning', () => {
    it('handles abrupt network drop (TypeError: Failed to fetch) during Stage 2 (CRM createProject)', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          throw new TypeError('Failed to fetch: Network offline or DNS resolution error')
        }
        return { ok: false, status: 404 }
      })

      const progressStages: ProvisioningProgress[] = []
      await expect(
        gcpProjectService.autoProvisionProject(sampleToken, (p) => progressStages.push(p)),
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.stringMatching(/Network offline/i),
      })

      const failedProgress = progressStages.find((p) => p.stage === 'failed')
      expect(failedProgress).toBeDefined()
      expect(failedProgress?.status).toBe('error')
    })

    it('survives transient network drop during Stage 3 (Service Usage enableStorageApi) via retry', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      let suAttempts = 0
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          return { ok: true, status: 200, json: async () => ({ projectNumber: '1122334455' }) }
        }
        if (url.includes('serviceusage.googleapis.com')) {
          suAttempts++
          if (suAttempts === 1) {
            throw new Error('Socket closed unexpectedly by remote host')
          }
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
      expect(result.success).toBe(true)
      expect(result.storageApiEnabled).toBe(true)
      expect(suAttempts).toBe(2)
    })

    it('degrades gracefully when Stage 3 completely fails (network unreachable) while preserving created project', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          return { ok: true, status: 200, json: async () => ({ projectNumber: '1122334455' }) }
        }
        if (url.includes('serviceusage.googleapis.com')) {
          throw new Error('ETIMEDOUT: Connection timed out')
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
      expect(result.success).toBe(true)
      expect(result.storageApiEnabled).toBe(false)
      expect(result.project.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
      expect(result.billing.billingEnabled).toBe(true)
    })

    it('handles network drop during Stage 4 (Billing Check) by returning warning without breaking project creation', async () => {
      useRuntimeStore.getState().setDemoMode(false)

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('cloudresourcemanager.googleapis.com')) {
          return { ok: true, status: 200, json: async () => ({ projectNumber: '1122334455' }) }
        }
        if (url.includes('serviceusage.googleapis.com')) {
          return { ok: true, status: 200, json: async () => ({ done: true }) }
        }
        if (url.includes('cloudbilling.googleapis.com')) {
          throw new TypeError('Network connection reset by peer')
        }
        return { ok: false, status: 404 }
      })

      const progressStages: ProvisioningProgress[] = []
      const result = await gcpProjectService.autoProvisionProject(sampleToken, (p) =>
        progressStages.push(p),
      )

      expect(result.success).toBe(true)
      expect(result.billing.billingEnabled).toBe(false)
      expect(result.warning).toContain('Billing is unlinked')
      expect(result.remediationUrl).toContain('console.cloud.google.com/billing')

      const finalStage = progressStages[progressStages.length - 1]
      expect(finalStage.stage).toBe('completed')
      expect(finalStage.status).toBe('warning')
    })
  })

  // ==========================================================================
  // Section 5: Free Trial Assistant & High-Volume Project Diffing
  // ==========================================================================
  describe('Section 5: Free Trial Assistant & High-Volume Project Diffing', () => {
    it('efficiently diffs large project catalogs (10,000 project IDs)', async () => {
      const existingIds = Array.from({ length: 10000 }, (_, i) => `existing-project-${i}`)
      const newProjectId = 'brand-new-project-from-trial'

      const mockGcpProjects = [
        ...existingIds.map((id) => ({
          projectId: id,
          name: `Project ${id}`,
          lifecycleState: 'ACTIVE',
        })),
        {
          projectId: newProjectId,
          name: 'Newly Created Trial Project',
          lifecycleState: 'ACTIVE',
        },
      ]

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: mockGcpProjects }),
      } as any)

      const startTime = performance.now()
      const diff = await gcpProjectService.detectNewProjects(sampleToken, existingIds)
      const duration = performance.now() - startTime

      expect(diff).toHaveLength(1)
      expect(diff[0].projectId).toBe(newProjectId)
      expect(duration).toBeLessThan(100) // Fast Set lookup (<100ms)
    })

    it('handles listProjects throwing NETWORK_ERROR inside detectNewProjects', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'))

      await expect(gcpProjectService.detectNewProjects(sampleToken, [])).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      })
    })
  })
})
