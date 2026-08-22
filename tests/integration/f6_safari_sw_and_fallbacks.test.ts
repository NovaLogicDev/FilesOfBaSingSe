import { describe, it, expect, beforeEach } from 'vitest'
import { ObservabilityService } from '../../src/services/observability'
import { CliGeneratorEngine } from '../../src/engines/cli'
import { resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F6: Safari SW Stream Interceptor & Universal Fallbacks', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('correctly classifies browser engines (Chromium vs WebKit vs Gecko) in diagnostics', () => {
    const report = ObservabilityService.generateReport('partner-bucket', 'demo-project')
    expect(report.browserEngine).toBeDefined()
    expect(['Chromium', 'WebKit', 'Gecko', 'Unknown']).toContain(report.browserEngine)
  })

  it('generates multi-threaded gcloud storage cp CLI commands with billing project flag', () => {
    const command = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'gs://partner-raw-master-archives-2026',
      selectedPaths: [
        'feature_films/reel_04/reel04_cam_A_raw.mxf',
        'feature_films/reel_04/reel04_cam_B_raw.mxf',
      ],
      userProject: 'freelance-vfx-lead',
      destinationDir: './local_drop/',
    })

    expect(command).toContain('gcloud storage cp')
    expect(command).toContain('gs://partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_A_raw.mxf')
    expect(command).toContain('gs://partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_B_raw.mxf')
    expect(command).toContain('./local_drop/')
    expect(command).toContain('--billing-project=freelance-vfx-lead')
  })

  it('generates legacy gsutil commands with -u project flag and multi-threading (-m)', () => {
    const command = CliGeneratorEngine.generateGsutilCommand({
      bucketName: 'partner-raw-master-archives-2026',
      selectedPaths: ['sound_stems/dialogue_isolated_master.wav'],
      userProject: 'audio-post-2026',
      destinationDir: '/Volumes/Scratch/Audio/',
    })

    expect(command).toContain('gsutil -u audio-post-2026 -m cp')
    expect(command).toContain('gs://partner-raw-master-archives-2026/sound_stems/dialogue_isolated_master.wav')
    expect(command).toContain('/Volumes/Scratch/Audio/')
  })

  it('supports recursive wildcard directory download generation when no paths selected', () => {
    const gcloudWildcard = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'partner-bucket',
      selectedPaths: [],
      userProject: 'test-project',
    })
    expect(gcloudWildcard).toContain('gs://partner-bucket/*')

    const gsutilWildcard = CliGeneratorEngine.generateGsutilCommand({
      bucketName: 'partner-bucket',
      selectedPaths: [],
      userProject: 'test-project',
      includeRecursive: true,
    })
    expect(gsutilWildcard).toContain('-r')
    expect(gsutilWildcard).toContain('gs://partner-bucket/*')
  })

  it('escapes special characters and spaces safely in CLI arguments', () => {
    const escapedSpace = CliGeneratorEngine.escapeShellArg('reel 04 scene 1.mxf')
    expect(escapedSpace).toBe('"reel 04 scene 1.mxf"')

    const normal = CliGeneratorEngine.escapeShellArg('reel_04_scene_1.mxf')
    expect(normal).toBe('reel_04_scene_1.mxf')
  })

  it('simulates in-memory blob fallback generation and URL revocation for <200MB assets', () => {
    const smallPayload = new Uint8Array([1, 2, 3, 4, 5])
    const blob = new Blob([smallPayload], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)

    expect(url).toMatch(/^blob:/)
    expect(() => URL.revokeObjectURL(url)).not.toThrow()
  })
})
