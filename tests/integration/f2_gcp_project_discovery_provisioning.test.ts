import { describe, it, expect, beforeEach } from 'vitest'
import { gcpProjectService } from '../../src/services/gcpProjectService'
import { usePersistentStore } from '../../src/store/persistentStore'
import { resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F2: GCP Project Auto-Discovery & Provisioning', () => {
  const testToken = 'ya29.test-oauth-token'

  beforeEach(() => {
    resetAllStores()
  })

  it('discovers accessible Google Cloud projects via Resource Manager API', async () => {
    const projects = await gcpProjectService.listProjects(testToken)
    expect(projects).toBeInstanceOf(Array)
    expect(projects.length).toBeGreaterThanOrEqual(1)

    const studioProj = projects.find((p) => p.projectId === 'client-media-project-2026')
    expect(studioProj).toBeDefined()
    expect(studioProj?.name).toBe('Client Post Production Studio')
    expect(studioProj?.lifecycleState).toBe('ACTIVE')
    expect(studioProj?.projectNumber).toBeDefined()
  })

  it('provisions 1-click dedicated project with basingse-media-dl-XXXX naming convention', async () => {
    const result = await gcpProjectService.autoProvisionProject(testToken)
    expect(result.success).toBe(true)
    expect(result.project.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
    expect(result.project.lifecycleState).toBe('ACTIVE')
    expect(result.project.name).toBe('Ba Sing Se Media Downloads')
    expect(result.project.createTime).toBeDefined()
  })

  it('verifies Cloud Billing account status is enabled to prevent UserProjectAccessDenied', async () => {
    const billing = await gcpProjectService.checkBillingStatus(testToken, 'client-media-project-2026')
    expect(billing.projectId).toBe('client-media-project-2026')
    expect(billing.billingEnabled).toBe(true)
    expect(billing.billingAccountName).toMatch(/^billingAccounts\//)
  })

  it('persists selected project ID in persistent preferences store', () => {
    const targetProject = 'freelance-color-suite-2026'
    usePersistentStore.getState().setSavedProjectId(targetProject)

    expect(usePersistentStore.getState().savedProjectId).toBe(targetProject)
  })

  it('trims leading/trailing whitespace on saved project ID', () => {
    usePersistentStore.getState().setSavedProjectId('   spaced-project-id   ')
    expect(usePersistentStore.getState().savedProjectId).toBe('spaced-project-id')
  })

  it('handles multiple project discovery results and verifies unique project numbers', async () => {
    const projects = await gcpProjectService.listProjects(testToken)
    const projectNumbers = projects.map((p) => p.projectNumber)
    const uniqueNumbers = new Set(projectNumbers)
    expect(uniqueNumbers.size).toBe(projectNumbers.length)
  })

  it('guarantees discovered projects are unique by projectId without duplicates', async () => {
    const projects = await gcpProjectService.listProjects(testToken)
    const projectIds = projects.map((p) => p.projectId)
    const uniqueIds = new Set(projectIds)
    expect(uniqueIds.size).toBe(projectIds.length)
  })
})
