import {
  DirectoryListingResult,
  GCSMediaItem,
  PreflightCheckResult,
} from '../types/gcs'
import { BillingStatus, GCPProject } from '../types/auth'
import { DownloadProgressTelemetry } from '../types/stream'
import { CRC32cIntegrityEngine } from '../engines/crc32c'
import { formatDuration, formatSpeed } from '../engines/formatters'

/**
 * Synthetic GCS Demo Sandbox Service
 * Provides 24 authentic cinematic media assets, hierarchical directory simulation,
 * 4-point preflight validation, project discovery, and realistic streaming simulation.
 */
export class MockGCSService {
  private static MOCK_DATASET: GCSMediaItem[] = [
    // 1. Feature Films - Reel 04
    {
      id: 'mock-01',
      name: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
      displayName: 'reel04_cam_A_raw.mxf',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
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
      id: 'mock-02',
      name: 'feature_films/reel_04/reel04_cam_B_raw.mxf',
      displayName: 'reel04_cam_B_raw.mxf',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 16_200_000_000,
      formattedSize: '16.20 GB',
      storageClass: 'ARCHIVE',
      contentType: 'application/mxf',
      updated: '2026-07-14T10:45:00Z',
      timeCreated: '2026-07-14T10:40:00Z',
      crc32c: 'v9M3xA==',
      crc32cHex: '0xBF91A2D1',
      md5Hash: '7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e',
      etag: 'CKL9pP89v5dEBEA=',
      generation: '1721039800451928',
    },
    {
      id: 'mock-03',
      name: 'feature_films/reel_04/reel04_prores_proxy.mov',
      displayName: 'reel04_prores_proxy.mov',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 8_000_000_000,
      formattedSize: '8.00 GB',
      storageClass: 'STANDARD',
      contentType: 'video/quicktime',
      updated: '2026-07-14T11:30:00Z',
      timeCreated: '2026-07-14T11:25:00Z',
      crc32c: '8sN1yQ==',
      crc32cHex: '0xCD88E3F4',
      md5Hash: '9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
      etag: 'CMN0qQ90w6eFCFA=',
      generation: '1721043000128491',
    },
    {
      id: 'mock-04',
      name: 'feature_films/reel_04/reel04_sound_mix.wav',
      displayName: 'reel04_sound_mix.wav',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 1_200_000_000,
      formattedSize: '1.20 GB',
      storageClass: 'ARCHIVE',
      contentType: 'audio/wav',
      updated: '2026-07-14T11:45:00Z',
      timeCreated: '2026-07-14T11:40:00Z',
      crc32c: '1pQ2wQ==',
      crc32cHex: '0x54A3B2C1',
      etag: 'CPO1rR01x7fGDGA=',
      generation: '1721043900982341',
    },
    {
      id: 'mock-05',
      name: 'feature_films/reel_04/metadata_manifest.json',
      displayName: 'metadata_manifest.json',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 4_200,
      formattedSize: '4.20 KB',
      storageClass: 'STANDARD',
      contentType: 'application/json',
      updated: '2026-07-14T12:00:00Z',
      timeCreated: '2026-07-14T12:00:00Z',
      crc32c: '4waSgw==',
      crc32cHex: '0xE3069283',
      etag: 'CPP2sS12y8gHEHA=',
      generation: '1721044800771239',
    },
    {
      id: 'mock-06',
      name: 'feature_films/reel_04/color_grading_lut.cube',
      displayName: 'color_grading_lut.cube',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 1_800_000,
      formattedSize: '1.80 MB',
      storageClass: 'STANDARD',
      contentType: 'application/octet-stream',
      updated: '2026-07-14T12:15:00Z',
      crc32c: '2bQ3xA==',
      crc32cHex: '0x65B4C3D2',
      etag: 'CQQ3tT23z9hIEIA=',
      generation: '1721045700552190',
    },
    {
      id: 'mock-07',
      name: 'feature_films/reel_04/scene_notes.pdf',
      displayName: 'scene_notes.pdf',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 340_000,
      formattedSize: '340.0 KB',
      storageClass: 'STANDARD',
      contentType: 'application/pdf',
      updated: '2026-07-14T12:30:00Z',
      crc32c: '3cR4yA==',
      crc32cHex: '0x76C5D4E3',
      etag: 'CRR4uU34a0iJFJA=',
      generation: '1721046600441920',
    },
    {
      id: 'mock-08',
      name: 'feature_films/reel_04/vfx_pull_slate_01.exr',
      displayName: 'vfx_pull_slate_01.exr',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 450_000_000,
      formattedSize: '450.0 MB',
      storageClass: 'NEARLINE',
      contentType: 'image/x-exr',
      updated: '2026-07-14T12:45:00Z',
      crc32c: '4dS5zA==',
      crc32cHex: '0x87D6E5F4',
      etag: 'CSS5vV45b1jKGKA=',
      generation: '1721047500332810',
    },

    // 2. Sound Stems
    {
      id: 'mock-09',
      name: 'sound_stems/dialogue_isolated_master.wav',
      displayName: 'dialogue_isolated_master.wav',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 3_400_000_000,
      formattedSize: '3.40 GB',
      storageClass: 'ARCHIVE',
      contentType: 'audio/wav',
      updated: '2026-07-15T09:00:00Z',
      crc32c: '5eT6aA==',
      crc32cHex: '0x98E7F6A5',
      etag: 'CTT6wW56c2kLHLA=',
      generation: '1721120400112930',
    },
    {
      id: 'mock-10',
      name: 'sound_stems/foley_effects_5.1.wav',
      displayName: 'foley_effects_5.1.wav',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 2_800_000_000,
      formattedSize: '2.80 GB',
      storageClass: 'COLDLINE',
      contentType: 'audio/wav',
      updated: '2026-07-15T09:30:00Z',
      crc32c: '6fU7bA==',
      crc32cHex: '0xA9F8A7B6',
      etag: 'CUU7xX67d3lMIMA=',
      generation: '1721122200223840',
    },
    {
      id: 'mock-11',
      name: 'sound_stems/orchestral_score_96k24b.wav',
      displayName: 'orchestral_score_96k24b.wav',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 5_200_000_000,
      formattedSize: '5.20 GB',
      storageClass: 'ARCHIVE',
      contentType: 'audio/wav',
      updated: '2026-07-15T10:00:00Z',
      crc32c: '7gV8cA==',
      crc32cHex: '0xBA09B8C7',
      etag: 'CVV8yY78e4mNJNA=',
      generation: '1721124000334750',
    },
    {
      id: 'mock-12',
      name: 'sound_stems/ambience_earth_kingdom_quad.wav',
      displayName: 'ambience_earth_kingdom_quad.wav',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 1_900_000_000,
      formattedSize: '1.90 GB',
      storageClass: 'NEARLINE',
      contentType: 'audio/wav',
      updated: '2026-07-15T10:30:00Z',
      crc32c: '8hW9dA==',
      crc32cHex: '0xCB1AC9D8',
      etag: 'CWW9zZ89f5nOKOA=',
      generation: '1721125800445660',
    },
    {
      id: 'mock-13',
      name: 'sound_stems/pro_tools_session_archive.ptx',
      displayName: 'pro_tools_session_archive.ptx',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 12_500_000,
      formattedSize: '12.50 MB',
      storageClass: 'STANDARD',
      contentType: 'application/octet-stream',
      updated: '2026-07-15T11:00:00Z',
      crc32c: '9iX0eA==',
      crc32cHex: '0xDC2BD0E9',
      etag: 'CXX0aA90g6oPLPA=',
      generation: '1721127600556570',
    },
    {
      id: 'mock-14',
      name: 'sound_stems/stem_routing_matrix.csv',
      displayName: 'stem_routing_matrix.csv',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 15_200,
      formattedSize: '15.20 KB',
      storageClass: 'STANDARD',
      contentType: 'text/csv',
      updated: '2026-07-15T11:15:00Z',
      crc32c: '0jY1fA==',
      crc32cHex: '0xED3CE1FA',
      etag: 'CYY1bB01h7pQMQE=',
      generation: '1721128500667480',
    },
    {
      id: 'mock-15',
      name: 'sound_stems/mix_stems_master_bundle.tar',
      displayName: 'mix_stems_master_bundle.tar',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 14_600_000_000,
      formattedSize: '14.60 GB',
      storageClass: 'ARCHIVE',
      contentType: 'application/x-tar',
      updated: '2026-07-15T11:30:00Z',
      crc32c: '1kZ2gA==',
      crc32cHex: '0xFE4DF20B',
      etag: 'CZZ2cC12i8qRNRE=',
      generation: '1721129400778390',
    },
    {
      id: 'mock-16',
      name: 'sound_stems/soundtrack_lossless_preview.flac',
      displayName: 'soundtrack_lossless_preview.flac',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 680_000_000,
      formattedSize: '680.0 MB',
      storageClass: 'STANDARD',
      contentType: 'audio/flac',
      updated: '2026-07-15T12:00:00Z',
      crc32c: '2lA3hA==',
      crc32cHex: '0x0F5E031C',
      etag: 'CAA3dD23j9rSOSE=',
      generation: '1721131200889200',
    },

    // 3. VFX Plates
    {
      id: 'mock-17',
      name: 'vfx_plates/plate_040_earthbending_4k.dpx',
      displayName: 'plate_040_earthbending_4k.dpx',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 22_500_000_000,
      formattedSize: '22.50 GB',
      storageClass: 'ARCHIVE',
      contentType: 'image/x-dpx',
      updated: '2026-07-16T14:00:00Z',
      crc32c: '3mB4iA==',
      crc32cHex: '0x106F142D',
      etag: 'CBB4eE34k0sTPTE=',
      generation: '1721224800119310',
    },
    {
      id: 'mock-18',
      name: 'vfx_plates/plate_041_crystal_catacombs_raw.mxf',
      displayName: 'plate_041_crystal_catacombs_raw.mxf',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 19_800_000_000,
      formattedSize: '19.80 GB',
      storageClass: 'ARCHIVE',
      contentType: 'application/mxf',
      updated: '2026-07-16T14:30:00Z',
      crc32c: '4nC5jA==',
      crc32cHex: '0x2170253E',
      etag: 'CCC5fF45l1tUQUE=',
      generation: '1721226600228420',
    },
    {
      id: 'mock-19',
      name: 'vfx_plates/matte_painting_background_16k.psd',
      displayName: 'matte_painting_background_16k.psd',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 4_800_000_000,
      formattedSize: '4.80 GB',
      storageClass: 'COLDLINE',
      contentType: 'image/vnd.adobe.photoshop',
      updated: '2026-07-16T15:00:00Z',
      crc32c: '5oD6kA==',
      crc32cHex: '0x3281364F',
      etag: 'CDD6gG56m2uVRVE=',
      generation: '1721228400337530',
    },
    {
      id: 'mock-20',
      name: 'vfx_plates/cgi_dai_li_rock_glove_stems.bsp',
      displayName: 'cgi_dai_li_rock_glove_stems.bsp',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 7_200_000_000,
      formattedSize: '7.20 GB',
      storageClass: 'NEARLINE',
      contentType: 'application/octet-stream',
      updated: '2026-07-16T15:30:00Z',
      crc32c: '6pE7lA==',
      crc32cHex: '0x43924750',
      etag: 'CEE7hH67n3vWSWE=',
      generation: '1721230200446640',
    },
    {
      id: 'mock-21',
      name: 'vfx_plates/camera_tracking_alembic.abc',
      displayName: 'camera_tracking_alembic.abc',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 85_000_000,
      formattedSize: '85.0 MB',
      storageClass: 'STANDARD',
      contentType: 'application/octet-stream',
      updated: '2026-07-16T16:00:00Z',
      crc32c: '7qF8mA==',
      crc32cHex: '0x54A35861',
      etag: 'CFF8iI78o4wXTXE=',
      generation: '1721232000555750',
    },
    {
      id: 'mock-22',
      name: 'vfx_plates/nuke_comp_script_v12.nk',
      displayName: 'nuke_comp_script_v12.nk',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 2_400_000,
      formattedSize: '2.40 MB',
      storageClass: 'STANDARD',
      contentType: 'text/plain',
      updated: '2026-07-16T16:30:00Z',
      crc32c: '8rG9nA==',
      crc32cHex: '0x65B46972',
      etag: 'CGG9jJ89p5xYTYE=',
      generation: '1721233800664860',
    },
    {
      id: 'mock-23',
      name: 'vfx_plates/unreal_scene_manifest.uproject',
      displayName: 'unreal_scene_manifest.uproject',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 520_000,
      formattedSize: '520.0 KB',
      storageClass: 'STANDARD',
      contentType: 'application/json',
      updated: '2026-07-16T17:00:00Z',
      crc32c: '9sH0oA==',
      crc32cHex: '0x76C57A83',
      etag: 'CHH0kK90q6yZUEE=',
      generation: '1721235600773970',
    },
    {
      id: 'mock-24',
      name: 'vfx_plates/vfx_shot_breakdown_2026.pdf',
      displayName: 'vfx_shot_breakdown_2026.pdf',
      type: 'file',
      bucket: 'partner-raw-master-archives-2026',
      sizeBytes: 6_200_000,
      formattedSize: '6.20 MB',
      storageClass: 'STANDARD',
      contentType: 'application/pdf',
      updated: '2026-07-16T17:30:00Z',
      crc32c: '0tI1pA==',
      crc32cHex: '0x87D68B94',
      etag: 'CII1lL01r7zaVFE=',
      generation: '1721237400882080',
    },
  ]

  /**
   * Simulates GCS delimiter directory listing (GET /b/{bucket}/o?delimiter=/&prefix={prefix})
   */
  public static async listDirectory(
    _bucketName: string,
    prefix: string = '',
  ): Promise<DirectoryListingResult> {
    // Artificial lightweight delay to simulate real asynchronous API response
    await new Promise((resolve) => setTimeout(resolve, 80))

    const cleanPrefix = prefix.replace(/^\/+/, '')
    const folderSet = new Set<string>()
    const files: GCSMediaItem[] = []

    for (const item of this.MOCK_DATASET) {
      if (cleanPrefix === '') {
        // Root level
        const firstSlash = item.name.indexOf('/')
        if (firstSlash !== -1) {
          folderSet.add(item.name.substring(0, firstSlash + 1))
        } else {
          files.push(item)
        }
      } else if (item.name.startsWith(cleanPrefix)) {
        const remaining = item.name.substring(cleanPrefix.length)
        const nextSlash = remaining.indexOf('/')
        if (nextSlash !== -1) {
          folderSet.add(cleanPrefix + remaining.substring(0, nextSlash + 1))
        } else {
          files.push(item)
        }
      }
    }

    const folders = Array.from(folderSet).sort()
    return {
      currentPrefix: cleanPrefix,
      folders,
      files,
      totalEstimatedItems: folders.length + files.length,
    }
  }

  /**
   * Simulates 4-Point Preflight Handshake against GCS Requester-Pays bucket
   */
  public static async runPreflight(
    _bucketName: string,
    userProject: string,
  ): Promise<PreflightCheckResult> {
    await new Promise((resolve) => setTimeout(resolve, 300))

    if (!userProject || userProject.trim() === '') {
      return {
        oauthTokenValid: true,
        oauthExpiresInSeconds: 3600,
        bucketReachable: true,
        requesterPaysActive: true,
        iamViewerGranted: false,
        corsConfigured: false,
        rawError: 'HTTP 400 UserProjectMissing',
        errorMessage: 'Requester Pays is enabled on this bucket. Enter a valid GCP Project ID.',
        remediationStep: 'Provide a valid Google Cloud Project ID with billing enabled.',
      }
    }

    return {
      oauthTokenValid: true,
      oauthExpiresInSeconds: 3600,
      bucketReachable: true,
      requesterPaysActive: true,
      iamViewerGranted: true,
      corsConfigured: true,
    }
  }

  /**
   * Simulates GCP Project Auto-Discovery via Cloud Resource Manager API
   */
  public static async listProjects(): Promise<GCPProject[]> {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return [
      {
        projectId: 'demo-client-media-2026',
        name: 'Client Post Production Studio',
        projectNumber: '891029384712',
        lifecycleState: 'ACTIVE',
        createTime: '2026-01-10T12:00:00Z',
      },
      {
        projectId: 'avatar-freelance-vfx',
        name: 'Avatar Freelance VFX Works',
        projectNumber: '109283746501',
        lifecycleState: 'ACTIVE',
        createTime: '2026-02-15T08:30:00Z',
      },
    ]
  }

  /**
   * Simulates Cloud Billing account check
   */
  public static async checkBilling(projectId: string): Promise<BillingStatus> {
    await new Promise((resolve) => setTimeout(resolve, 100))
    return {
      projectId,
      billingAccountName: 'billingAccounts/0182A9-983FBC-7721AA',
      billingEnabled: true,
    }
  }

  /**
   * Simulates 1-Click Auto-Create Project
   */
  public static async autoCreateProject(): Promise<GCPProject> {
    await new Promise((resolve) => setTimeout(resolve, 400))
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    return {
      projectId: `basingse-media-dl-${randomSuffix}`,
      name: 'Ba Sing Se Media Downloads',
      projectNumber: String(Math.floor(100000000000 + Math.random() * 900000000000)),
      lifecycleState: 'ACTIVE',
      createTime: new Date().toISOString(),
    }
  }

  /**
   * Simulates 4MB micro-chunk stream pipeline directly to disk with live telemetry
   */
  public static async simulateStream(
    item: GCSMediaItem,
    onProgress: (progress: DownloadProgressTelemetry) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const totalBytes = item.sizeBytes
    const chunkSize = 4_000_000 // 4MB micro-chunks
    let loadedBytes = 0
    const startTime = performance.now()
    let lastTime = startTime
    let lastBytes = 0
    let currentSpeed = 48_500_000 // ~48.5 MB/s initial average speed

    // Initialize CRC32c engine
    const crcEngine = new CRC32cIntegrityEngine()

    onProgress({
      itemId: item.id,
      itemName: item.displayName,
      loadedBytes: 0,
      totalBytes,
      percentage: 0,
      speedBytesPerSec: currentSpeed,
      formattedSpeed: formatSpeed(currentSpeed),
      etaSeconds: Math.round(totalBytes / currentSpeed),
      formattedETA: formatDuration(Math.round(totalBytes / currentSpeed)),
      elapsedSeconds: 0,
      formattedElapsed: '00s',
      memoryHeapMB: 11.4, // Constant bounded memory heap
      status: 'streaming',
    })

    // Simulate fast streaming ticks
    const totalChunks = Math.max(1, Math.min(25, Math.ceil(totalBytes / chunkSize)))
    const bytesPerTick = totalBytes / totalChunks

    for (let i = 1; i <= totalChunks; i++) {
      if (abortSignal?.aborted) {
        onProgress({
          itemId: item.id,
          itemName: item.displayName,
          loadedBytes,
          totalBytes,
          percentage: Math.round((loadedBytes / totalBytes) * 100),
          speedBytesPerSec: 0,
          formattedSpeed: '0.0 MB/s',
          etaSeconds: 0,
          formattedETA: '00s',
          elapsedSeconds: Math.round((performance.now() - startTime) / 1000),
          formattedElapsed: formatDuration(Math.round((performance.now() - startTime) / 1000)),
          memoryHeapMB: 0,
          status: 'cancelled',
          errorMessage: 'Download cancelled by user.',
        })
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 80))

      loadedBytes = Math.min(totalBytes, Math.round(i * bytesPerTick))
      const now = performance.now()
      const deltaSec = (now - lastTime) / 1000
      if (deltaSec > 0.2) {
        currentSpeed = (loadedBytes - lastBytes) / deltaSec
        lastBytes = loadedBytes
        lastTime = now
      }

      // Update synthetic CRC chunk
      const dummySlice = new Uint8Array(32)
      dummySlice.fill(i & 0xff)
      crcEngine.update(dummySlice)

      const remainingBytes = totalBytes - loadedBytes
      const etaSeconds = currentSpeed > 0 ? Math.round(remainingBytes / currentSpeed) : 0
      const elapsedSeconds = Math.round((now - startTime) / 1000)

      onProgress({
        itemId: item.id,
        itemName: item.displayName,
        loadedBytes,
        totalBytes,
        percentage: Math.round((loadedBytes / totalBytes) * 100),
        speedBytesPerSec: currentSpeed,
        formattedSpeed: formatSpeed(currentSpeed),
        etaSeconds,
        formattedETA: formatDuration(etaSeconds),
        elapsedSeconds,
        formattedElapsed: formatDuration(elapsedSeconds),
        memoryHeapMB: 11.4,
        status: i === totalChunks ? 'verifying' : 'streaming',
      })
    }

    // Completion & CRC32c verification
    const verified = true // Mock always verifies against expected hash
    onProgress({
      itemId: item.id,
      itemName: item.displayName,
      loadedBytes: totalBytes,
      totalBytes,
      percentage: 100,
      speedBytesPerSec: 0,
      formattedSpeed: '0.0 MB/s',
      etaSeconds: 0,
      formattedETA: '00s',
      elapsedSeconds: Math.round((performance.now() - startTime) / 1000),
      formattedElapsed: formatDuration(Math.round((performance.now() - startTime) / 1000)),
      memoryHeapMB: 11.4,
      status: 'completed',
      computedCrc32cBase64: item.crc32c,
      computedCrc32cHex: item.crc32cHex || '0xAF82F6C0',
      integrityVerified: verified,
    })
  }
}
