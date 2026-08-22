import { GCSMediaItem } from '../types/gcs'
import { RateCard } from '../types/cost'
import { CostGovernanceEngine } from './cost'

export interface ManifestExportOptions {
  bucketName: string
  items: GCSMediaItem[]
  rates?: Partial<RateCard> | null
  isFreeTrial?: boolean
}

export class ManifestExporterEngine {
  /**
   * Generates standard RFC 4180 CSV manifest string with exact byte counts,
   * storage classes, CRC32c checksums, and calculated costs.
   */
  public static generateCsv(options: ManifestExportOptions): string {
    const { items, rates, isFreeTrial = false } = options

    const headers = [
      'Object Path',
      'File Name',
      'Storage Class',
      'Size Bytes',
      'Size Formatted',
      'CRC32c Hex',
      'Created UTC',
      'Estimated Cost USD',
    ]

    const rows = items.map((item) => {
      const cost = CostGovernanceEngine.calculateSingle(
        item.sizeBytes,
        item.storageClass,
        rates,
        isFreeTrial,
      )

      const objectPath = this.escapeCsv(item.name)
      const fileName = this.escapeCsv(item.displayName)
      const storageClass = this.escapeCsv(item.storageClass)
      const sizeBytes = item.sizeBytes.toString()
      const sizeFormatted = this.escapeCsv(item.formattedSize)
      const crc32cHex = this.escapeCsv(item.crc32cHex || '0x00000000')
      const createdUtc = this.escapeCsv(item.timeCreated || item.updated || '')
      const estimatedCost = `$${cost.grandTotalUSD.toFixed(2)}`

      return [
        objectPath,
        fileName,
        storageClass,
        sizeBytes,
        sizeFormatted,
        crc32cHex,
        createdUtc,
        estimatedCost,
      ].join(',')
    })

    return [headers.join(','), ...rows].join('\n')
  }

  /**
   * Generates formatted JSON manifest string including complete metadata and cost breakdowns.
   */
  public static generateJson(options: ManifestExportOptions): string {
    const { bucketName, items, rates, isFreeTrial = false } = options

    const cleanBucket = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '')

    let totalBytes = 0
    let totalCostUSD = 0

    const itemManifests = items.map((item) => {
      const cost = CostGovernanceEngine.calculateSingle(
        item.sizeBytes,
        item.storageClass,
        rates,
        isFreeTrial,
      )

      totalBytes += item.sizeBytes
      totalCostUSD += cost.grandTotalUSD

      return {
        id: item.id,
        objectPath: item.name,
        fileName: item.displayName,
        type: item.type,
        bucket: cleanBucket,
        sizeBytes: item.sizeBytes,
        formattedSize: item.formattedSize,
        storageClass: item.storageClass,
        contentType: item.contentType,
        crc32cHex: item.crc32cHex || '0x00000000',
        crc32cBase64: item.crc32c,
        md5Hash: item.md5Hash || null,
        etag: item.etag,
        generation: item.generation || null,
        updated: item.updated,
        timeCreated: item.timeCreated || item.updated,
        costEstimate: {
          retrievalUSD: cost.retrievalTotalUSD,
          egressUSD: cost.egressTotalUSD,
          grandTotalUSD: cost.grandTotalUSD,
        },
      }
    })

    const manifestObject = {
      manifestVersion: '1.0.0',
      bucket: `gs://${cleanBucket}`,
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      totalBytes,
      formattedTotalSize: CostGovernanceEngine.formatBytes(totalBytes),
      totalEstimatedCostUSD: Math.round(totalCostUSD * 100) / 100,
      coveredByFreeTrial: isFreeTrial,
      items: itemManifests,
    }

    return JSON.stringify(manifestObject, null, 2)
  }

  /**
   * Triggers client-side download of generated manifest file using synthetic Blob.
   */
  public static downloadBlob(content: string, filename: string, mimeType: string): void {
    if (typeof document === 'undefined') return

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()

    setTimeout(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor)
      }
      URL.revokeObjectURL(url)
    }, 1000)
  }

  /**
   * Helper to escape special characters for RFC 4180 CSV compliance.
   */
  private static escapeCsv(value: string): string {
    if (!value) return ''
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }
}
