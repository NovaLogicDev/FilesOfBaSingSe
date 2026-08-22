import { describe, it, expect } from 'vitest'
import { CliGeneratorEngine } from '../../src/engines/cli'

describe('CliGeneratorEngine (Shell Command Builder)', () => {
  it('generates single-item gcloud storage cp command with --billing-project', () => {
    const cmd = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'gs://partner-raw-master-archives-2026',
      selectedPaths: ['feature_films/reel_04/reel04_cam_A_raw.mxf'],
      userProject: 'client-prod-media-2026',
      destinationDir: './destination_folder/',
    })

    expect(cmd).toBe(
      'gcloud storage cp gs://partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_A_raw.mxf ./destination_folder/ --billing-project=client-prod-media-2026',
    )
  })

  it('generates multi-line gcloud storage cp command for multiple items', () => {
    const cmd = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'partner-raw-master-archives-2026',
      selectedPaths: [
        'feature_films/reel_04/reel04_cam_A_raw.mxf',
        'feature_films/reel_04/reel04_cam_B_raw.mxf',
      ],
      userProject: 'client-prod-media-2026',
      destinationDir: './destination_folder/',
    })

    expect(cmd).toContain('gcloud storage cp \\\n')
    expect(cmd).toContain('  gs://partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_A_raw.mxf \\\n')
    expect(cmd).toContain('  gs://partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_B_raw.mxf \\\n')
    expect(cmd).toContain('  ./destination_folder/ \\\n')
    expect(cmd).toContain('  --billing-project=client-prod-media-2026')
  })

  it('generates legacy gsutil command with -u and -m flags', () => {
    const cmd = CliGeneratorEngine.generateGsutilCommand({
      bucketName: 'gs://partner-raw-master-archives-2026',
      selectedPaths: ['feature_films/reel_04/reel04_cam_A_raw.mxf'],
      userProject: 'client-prod-media-2026',
      destinationDir: './',
    })

    expect(cmd).toBe(
      'gsutil -u client-prod-media-2026 -m cp gs://partner-raw-master-archives-2026/feature_films/reel_04/reel04_cam_A_raw.mxf ./',
    )
  })

  it('cleans bucket name by stripping gs:// and trailing slashes', () => {
    expect(CliGeneratorEngine.cleanBucketName('gs://my-bucket/')).toBe('my-bucket')
    expect(CliGeneratorEngine.cleanBucketName('my-bucket///')).toBe('my-bucket')
  })

  it('safely escapes file paths containing spaces', () => {
    const escaped = CliGeneratorEngine.escapeShellArg('path/to/my video file.mov')
    expect(escaped).toBe('"path/to/my video file.mov"')
  })
})
