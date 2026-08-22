import { describe, it, expect, beforeEach } from 'vitest'
import { MockGCSService } from '../../src/services/mockGcsService'
import { usePersistentStore } from '../../src/store/persistentStore'
import { resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F2: GCP Project Auto-Discovery & Provisioning', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('discovers accessible Google Cloud projects via Resource Manager API', async () => {
    const projects = await MockGCSService.listProjects()
    expect(projects).toBeInstanceOf(Array)
    expect(projects.length).toBeGreaterThanOrEqual(2)

    const studioProj = projects.find((p) => p.projectId === 'demo-client-media-2026')
    expect(studioProj).toBeDefined()
    expect(studioProj?.name).toBe('Client Post Production Studio')
    expect(studioProj?.lifecycleState).toBe('ACTIVE')
    expect(studioProj?.projectNumber).toBeDefined()
  })

  it('provisions 1-click dedicated project with basingse-media-dl-XXXX naming convention', async () => {
    const newProject = await MockGCSService.autoCreateProject()
    expect(newProject.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
    expect(newProject.lifecycleState).toBe('ACTIVE')
    expect(newProject.name).toBe('Ba Sing Se Media Downloads')
    expect(newProject.createTime).toBeDefined()
  })

  it('verifies Cloud Billing account status is enabled to prevent UserProjectAccessDenied', async () => {
    const billing = await MockGCSService.checkBilling('demo-client-media-2026')
    expect(billing.projectId).toBe('demo-client-media-2026')
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
    const projects = await MockGCSService.listProjects()
    const projectNumbers = projects.map((p) => p.projectNumber)
    const uniqueNumbers = new Set(projectNumbers)
    expect(uniqueNumbers.size).toBe(projectNumbers.length)
  })
})
