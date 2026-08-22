import { describe, it, expect } from 'vitest'
import { MockGCSService } from '../../src/services/mockGcsService'
import { DownloadProgressTelemetry } from '../../src/types'

describe('MockGCSService (Synthetic GCS Demo Sandbox Engine)', () => {
  it('correctly simulates GCS delimiter directory listing at root level', async () => {
    const root = await MockGCSService.listDirectory('partner-raw-master-archives-2026', '')

    expect(root.folders).toContain('feature_films/')
    expect(root.folders).toContain('sound_stems/')
    expect(root.folders).toContain('vfx_plates/')
  })

  it('correctly retrieves leaf media objects inside feature_films/reel_04/', async () => {
    const sub = await MockGCSService.listDirectory(
      'partner-raw-master-archives-2026',
      'feature_films/reel_04/',
    )

    expect(sub.files.length).toBeGreaterThanOrEqual(8)
    const mxf = sub.files.find((f) => f.displayName === 'reel04_cam_A_raw.mxf')
    expect(mxf).toBeDefined()
    expect(mxf?.storageClass).toBe('ARCHIVE')
    expect(mxf?.sizeBytes).toBe(18_400_000_000)
    expect(mxf?.crc32c).toBe('r4L2wA==')
    expect(mxf?.crc32cHex).toBe('0xAF82F6C0')
  })

  it('returns valid 4-point preflight handshake when userProject is provided', async () => {
    const preflight = await MockGCSService.runPreflight(
      'partner-raw-master-archives-2026',
      'demo-client-media-2026',
    )

    expect(preflight.oauthTokenValid).toBe(true)
    expect(preflight.bucketReachable).toBe(true)
    expect(preflight.requesterPaysActive).toBe(true)
    expect(preflight.iamViewerGranted).toBe(true)
    expect(preflight.corsConfigured).toBe(true)
  })

  it('fails preflight with UserProjectMissing when project ID is empty', async () => {
    const preflight = await MockGCSService.runPreflight('partner-raw-master-archives-2026', '')

    expect(preflight.iamViewerGranted).toBe(false)
    expect(preflight.rawError).toContain('UserProjectMissing')
  })

  it('discovers mock projects and auto-creates media projects', async () => {
    const projects = await MockGCSService.listProjects()
    expect(projects.length).toBeGreaterThan(0)

    const newProj = await MockGCSService.autoCreateProject()
    expect(newProj.projectId).toMatch(/^basingse-media-dl-\d{4}$/)
    expect(newProj.lifecycleState).toBe('ACTIVE')
  })

  it('simulates 4MB micro-chunk stream transfer with CRC32c verification', async () => {
    const sub = await MockGCSService.listDirectory(
      'partner-raw-master-archives-2026',
      'feature_films/reel_04/',
    )
    const item = sub.files[0]

    const progressUpdates: DownloadProgressTelemetry[] = []
    await MockGCSService.simulateStream(item, (p) => {
      progressUpdates.push(p)
    })

    expect(progressUpdates.length).toBeGreaterThan(0)
    const finalUpdate = progressUpdates[progressUpdates.length - 1]
    expect(finalUpdate.status).toBe('completed')
    expect(finalUpdate.percentage).toBe(100)
    expect(finalUpdate.integrityVerified).toBe(true)
    expect(finalUpdate.memoryHeapMB).toBe(11.4) // Constant bounded heap
  })
})
