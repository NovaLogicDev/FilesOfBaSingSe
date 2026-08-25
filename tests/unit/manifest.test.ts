import { describe, it, expect, vi } from 'vitest'
import { ManifestExporterEngine } from '../../src/engines/manifest'
import { GCSMediaItem } from '../../src/types/gcs'

describe('ManifestExporterEngine (AUX-07)', () => {
  const sampleItems: GCSMediaItem[] = [
    {
      id: 'mock-01',
      name: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
      displayName: 'reel04_cam_A_raw.mxf',
      type: 'file',
      bucket: 'test-studio-vault-2026',
      sizeBytes: 18_400_000_000,
      formattedSize: '18.40 GB',
      storageClass: 'ARCHIVE',
      contentType: 'application/mxf',
      updated: '2026-07-14T10:22:15Z',
      timeCreated: '2026-07-14T10:20:00Z',
      crc32c: 'r4L2wA==',
      crc32cHex: '0xAF82F6C0',
      md5Hash: '3a4f8d9b1c2e4a5f6e7d8c9b0a1b2c3d',
      etag: 'CPj8kO78u4cDEAE=',
      generation: '1721038935129482',
    },
    {
      id: 'mock-05',
      name: 'feature_films/reel_04/metadata_manifest, "quotes".json',
      displayName: 'metadata_manifest, "quotes".json',
      type: 'file',
      bucket: 'test-studio-vault-2026',
      sizeBytes: 4_200,
      formattedSize: '4.20 KB',
      storageClass: 'STANDARD',
      contentType: 'application/json',
      updated: '2026-07-14T12:00:00Z',
      timeCreated: '2026-07-14T12:00:00Z',
      crc32c: '4waSgw==',
      crc32cHex: '0xE3069283',
      etag: 'CPP2sS12y8gHEHA=',
    },
  ]

  it('generates compliant RFC 4180 CSV manifest with proper column headers and escaping', () => {
    const csv = ManifestExporterEngine.generateCsv({
      bucketName: 'test-studio-vault-2026',
      items: sampleItems,
    })

    const lines = csv.split('\n')
    expect(lines[0]).toBe(
      'Object Path,File Name,Storage Class,Size Bytes,Size Formatted,CRC32c Hex,Created UTC,Estimated Cost USD',
    )
    expect(lines).toHaveLength(3)

    // Check row 1 (ARCHIVE file)
    expect(lines[1]).toContain('feature_films/reel_04/reel04_cam_A_raw.mxf')
    expect(lines[1]).toContain('18400000000')
    expect(lines[1]).toContain('0xAF82F6C0')
    expect(lines[1]).toContain('$3.13')

    // Check row 2 (File containing comma and double quotes properly escaped)
    expect(lines[2]).toContain('"feature_films/reel_04/metadata_manifest, ""quotes"".json"')
    expect(lines[2]).toContain('"metadata_manifest, ""quotes"".json"')
  })

  it('generates structured JSON manifest with complete metadata and itemized costs', () => {
    const jsonStr = ManifestExporterEngine.generateJson({
      bucketName: 'gs://test-studio-vault-2026',
      items: sampleItems,
    })

    const parsed = JSON.parse(jsonStr)
    expect(parsed.manifestVersion).toBe('1.0.0')
    expect(parsed.bucket).toBe('gs://test-studio-vault-2026')
    expect(parsed.itemCount).toBe(2)
    expect(parsed.totalBytes).toBe(18400004200)
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0].crc32cHex).toBe('0xAF82F6C0')
    expect(parsed.items[0].costEstimate.grandTotalUSD).toBe(3.13)
    expect(parsed.items[1].costEstimate.grandTotalUSD).toBe(0)
  })

  it('respects Free Trial account flag in manifest calculations', () => {
    const jsonStr = ManifestExporterEngine.generateJson({
      bucketName: 'test-studio-vault-2026',
      items: sampleItems,
      isFreeTrial: true,
    })

    const parsed = JSON.parse(jsonStr)
    expect(parsed.coveredByFreeTrial).toBe(true)
    expect(parsed.totalEstimatedCostUSD).toBe(3.13)
  })

  it('handles client-side blob download trigger without errors', () => {
    const clickSpy = vi.fn()
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName)
      if (tagName === 'a') {
        el.click = clickSpy
      }
      return el
    })

    ManifestExporterEngine.downloadBlob('test-content', 'manifest.csv', 'text/csv')
    expect(clickSpy).toHaveBeenCalled()
  })
})
