import { describe, it, expect } from 'vitest'
import { CliGeneratorEngine } from '../../src/engines/cli'

describe('CliGeneratorEngine (Shell Command Builder)', () => {
  it('generates single-item gcloud storage cp command with --billing-project', () => {
    const cmd = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'gs://test-studio-vault-2026',
      selectedPaths: ['feature_films/reel_04/reel04_cam_A_raw.mxf'],
      userProject: 'client-prod-media-2026',
      destinationDir: './destination_folder/',
    })

    expect(cmd).toBe(
      'gcloud storage cp gs://test-studio-vault-2026/feature_films/reel_04/reel04_cam_A_raw.mxf ./destination_folder/ --billing-project=client-prod-media-2026',
    )
  })

  it('generates multi-line gcloud storage cp command for multiple items', () => {
    const cmd = CliGeneratorEngine.generateGcloudCommand({
      bucketName: 'test-studio-vault-2026',
      selectedPaths: [
        'feature_films/reel_04/reel04_cam_A_raw.mxf',
        'feature_films/reel_04/reel04_cam_B_raw.mxf',
      ],
      userProject: 'client-prod-media-2026',
      destinationDir: './destination_folder/',
    })

    expect(cmd).toContain('gcloud storage cp \\\n')
    expect(cmd).toContain('  gs://test-studio-vault-2026/feature_films/reel_04/reel04_cam_A_raw.mxf \\\n')
    expect(cmd).toContain('  gs://test-studio-vault-2026/feature_films/reel_04/reel04_cam_B_raw.mxf \\\n')
    expect(cmd).toContain('  ./destination_folder/ \\\n')
    expect(cmd).toContain('  --billing-project=client-prod-media-2026')
  })

  it('generates legacy gsutil command with -u and -m flags', () => {
    const cmd = CliGeneratorEngine.generateGsutilCommand({
      bucketName: 'gs://test-studio-vault-2026',
      selectedPaths: ['feature_films/reel_04/reel04_cam_A_raw.mxf'],
      userProject: 'client-prod-media-2026',
      destinationDir: './',
    })

    expect(cmd).toBe(
      'gsutil -u client-prod-media-2026 -m cp gs://test-studio-vault-2026/feature_films/reel_04/reel04_cam_A_raw.mxf ./',
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

  it('generates direct cURL command for single item with gcloud token fallback', () => {
    const cmd = CliGeneratorEngine.generateCurlCommand({
      bucketName: 'gs://test-studio-vault-2026',
      selectedPaths: ['feature_films/reel_04/reel04_cam_A_raw.mxf'],
      userProject: 'client-prod-media-2026',
    })

    expect(cmd).toContain('curl -X GET')
    expect(cmd).toContain('https://storage.googleapis.com/storage/v1/b/test-studio-vault-2026/o/feature_films%2Freel_04%2Freel04_cam_A_raw.mxf?alt=media&userProject=client-prod-media-2026')
    expect(cmd).toContain('-H "Authorization: Bearer $(gcloud auth print-access-token)"')
    expect(cmd).toContain('-o "reel04_cam_A_raw.mxf"')
  })

  it('generates direct cURL command with explicit in-memory OAuth token', () => {
    const cmd = CliGeneratorEngine.generateCurlCommand({
      bucketName: 'test-studio-vault-2026',
      selectedPaths: ['audio/stems/dialogue.wav'],
      userProject: 'audio-team-2026',
      oauthToken: 'ya29.in-memory-token-12345',
    })

    expect(cmd).toContain('-H "Authorization: Bearer ya29.in-memory-token-12345"')
    expect(cmd).toContain('-o "dialogue.wav"')
  })

  it('generates multi-item chained cURL command', () => {
    const cmd = CliGeneratorEngine.generateCurlCommand({
      bucketName: 'test-studio-vault-2026',
      selectedPaths: ['reel_01.mov', 'reel_02.mov'],
      userProject: 'client-prod-media-2026',
    })

    expect(cmd).toContain('reel_01.mov')
    expect(cmd).toContain('reel_02.mov')
    expect(cmd).toContain(' && \\\n')
  })
})

