import { describe, it, expect, beforeEach } from 'vitest'
import { CliGeneratorEngine } from '../../src/engines/cli'
import { ObservabilityService } from '../../src/services/observability'
import { resetAllStores } from '../helpers/testUtils'

describe('Tier 4 - Scenario 4: Safari SW Stream Interception & Firefox CLI Routing', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('routes Firefox users directly to automated multi-threaded CLI generator', () => {
    // Generate CLI commands with pre-filled parameters for full directory
    const gcloudScript = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'gs://partner-raw-master-archives-2026',
      selectedPaths: [
        'feature_films/reel_04/reel04_cam_A_raw.mxf',
        'sound_stems/mix_stems_master_bundle.tar',
      ],
      userProject: 'firefox-client-media',
      destinationDir: './renders_drop/',
    })

    expect(gcloudScript).toContain('gcloud storage cp')
    expect(gcloudScript).toContain('--billing-project=firefox-client-media')
    expect(gcloudScript).toContain('reel04_cam_A_raw.mxf')
    expect(gcloudScript).toContain('mix_stems_master_bundle.tar')

    const gsutilScript = CliGeneratorEngine.generateGsutilCommand({
      bucketName: 'partner-raw-master-archives-2026',
      selectedPaths: ['vfx_plates/plate_040_earthbending_4k.dpx'],
      userProject: 'firefox-client-media',
      destinationDir: './vfx/',
    })

    expect(gsutilScript).toContain('gsutil -u firefox-client-media -m cp')
  })

  it('verifies Safari diagnostics logging and Service Worker health reporting', () => {
    ObservabilityService.info('SERVICE_WORKER', 'Registered download interceptor scope=/')
    const report = ObservabilityService.generateReport(
      'gs://partner-raw-master-archives-2026',
      'safari-client-2026',
    )

    expect(report.activeProjectIdMasked).toBe('safa***-2026')
    expect(report.recentLogs.some((l) => l.category === 'SERVICE_WORKER')).toBe(true)
    expect(report.heapMemoryMB).toBe(11.4)
  })
})
