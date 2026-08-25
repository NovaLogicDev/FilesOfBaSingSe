import { describe, it, expect, beforeEach } from 'vitest'
import { gcsClientService } from '../../src/services/gcsClientService'
import { CliGeneratorEngine } from '../../src/engines/cli'
import { resetAllStores } from '../helpers/testUtils'

describe('Tier 1 - F3: GCS REST Querying & 4-Point Preflight Handshake', () => {
  const testToken = 'ya29.test-oauth-token'

  beforeEach(() => {
    resetAllStores()
  })

  it('performs delimiter-based virtual directory slicing at root level (delimiter=/)', async () => {
    const listing = await gcsClientService.listObjects(testToken, 'test-studio-vault-2026', {
      prefix: '',
      delimiter: '/',
      userProject: 'client-media-project-2026',
    })
    expect(listing.currentPrefix).toBe('')
    expect(listing.folders).toContain('feature_films/')
    expect(listing.folders).toContain('sound_stems/')
    expect(listing.folders).toContain('vfx_plates/')
  })

  it('slices nested virtual directories and returns leaf media objects', async () => {
    const listing = await gcsClientService.listObjects(testToken, 'test-studio-vault-2026', {
      prefix: 'sound_stems/',
      delimiter: '/',
      userProject: 'client-media-project-2026',
    })
    expect(listing.currentPrefix).toBe('sound_stems/')
    expect(listing.files.length).toBeGreaterThan(0)

    const dialogueStem = listing.files.find((f) => f.displayName === 'dialogue_isolated_master.wav')
    expect(dialogueStem).toBeDefined()
    expect(dialogueStem?.contentType).toBe('audio/wav')
    expect(dialogueStem?.storageClass).toBe('ARCHIVE')
    expect(dialogueStem?.sizeBytes).toBe(3_400_000_000)
  })

  it('extracts complete GCS object metadata including generation and checksums', async () => {
    const listing = await gcsClientService.listObjects(testToken, 'test-studio-vault-2026', {
      prefix: 'feature_films/reel_04/',
      delimiter: '/',
      userProject: 'client-media-project-2026',
    })
    const mxf = listing.files.find((f) => f.displayName === 'reel04_cam_A_raw.mxf')
    expect(mxf).toBeDefined()
    expect(mxf?.generation).toBeDefined()
    expect(mxf?.etag).toBeDefined()
    expect(mxf?.crc32c).toBe('r4L2wA==')
    expect(mxf?.crc32cHex).toBe('0xAF82F6C0')
    expect(mxf?.timeCreated).toBeDefined()
  })

  it('executes successful 4-point preflight handshake with active userProject', async () => {
    const preflight = await gcsClientService.run4PointPreflight(
      testToken,
      'test-studio-vault-2026',
      'client-media-project-2026',
    )

    // 1. OAuth Token validity & TTL
    expect(preflight.oauthTokenValid).toBe(true)
    expect(preflight.oauthExpiresInSeconds).toBeGreaterThan(0)

    // 2. Requester-Pays enforcement & bucket reachability
    expect(preflight.bucketReachable).toBe(true)
    expect(preflight.requesterPaysActive).toBe(true)

    // 3. IAM ObjectViewer permission
    expect(preflight.iamViewerGranted).toBe(true)

    // 4. CORS Preflight Header Exposure
    expect(preflight.corsConfigured).toBe(true)
    expect(preflight.rawError).toBeUndefined()
  })

  it('fails preflight with actionable remediation when userProject is omitted', async () => {
    const preflight = await gcsClientService.run4PointPreflight(
      testToken,
      'test-studio-vault-2026',
      '',
    )

    expect(preflight.iamViewerGranted).toBe(false)
    expect(preflight.corsConfigured).toBe(false)
    expect(preflight.errorMessage).toBeDefined()
  })

  it('cleans and normalizes bucket URIs with gs:// prefixes and trailing slashes', () => {
    expect(CliGeneratorEngine.cleanBucketName('gs://my-bucket-name/')).toBe('my-bucket-name')
    expect(CliGeneratorEngine.cleanBucketName('GS://CAPITAL-BUCKET///')).toBe('CAPITAL-BUCKET')
    expect(CliGeneratorEngine.cleanBucketName('my-plain-bucket')).toBe('my-plain-bucket')
    expect(CliGeneratorEngine.cleanBucketName('')).toBe('your-bucket-name')
  })
})
