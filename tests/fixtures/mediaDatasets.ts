import { GCSMediaItem, DirectoryListingResult, GCPProject, StorageClass } from '../../src/types'

/**
 * Standard 24-item cinematic media dataset
 */
export const STUDIO_MASTER_DATASET: GCSMediaItem[] = [
  {
    id: 'fixture-01',
    name: 'feature_films/reel_04/reel04_cam_A_raw.mxf',
    displayName: 'reel04_cam_A_raw.mxf',
    type: 'file',
    bucket: 'test-studio-vault-2026',
    sizeBytes: 18_400_000_000,
    formattedSize: '18.40 GB',
    storageClass: 'ARCHIVE',
    contentType: 'application/mxf',
    updated: '2026-07-14T10:22:15Z',
    crc32c: 'r4L2wA==',
    crc32cHex: '0xAF82F6C0',
    etag: 'CPj8kO78u4cDEAE=',
    generation: '1721038935129482',
  },
  {
    id: 'fixture-02',
    name: 'feature_films/reel_04/reel04_cam_B_raw.mxf',
    displayName: 'reel04_cam_B_raw.mxf',
    type: 'file',
    bucket: 'test-studio-vault-2026',
    sizeBytes: 16_200_000_000,
    formattedSize: '16.20 GB',
    storageClass: 'ARCHIVE',
    contentType: 'application/mxf',
    updated: '2026-07-14T10:45:00Z',
    crc32c: 'v9M3xA==',
    crc32cHex: '0xBF91A2D1',
    etag: 'CKL9pP89v5dEBEA=',
  },
  {
    id: 'fixture-03',
    name: 'feature_films/reel_04/reel04_prores_proxy.mov',
    displayName: 'reel04_prores_proxy.mov',
    type: 'file',
    bucket: 'test-studio-vault-2026',
    sizeBytes: 8_000_000_000,
    formattedSize: '8.00 GB',
    storageClass: 'STANDARD',
    contentType: 'video/quicktime',
    updated: '2026-07-14T11:30:00Z',
    crc32c: '8sN1yQ==',
    crc32cHex: '0xCD88E3F4',
    etag: 'CMN0qQ90w6eFCFA=',
  },
  {
    id: 'fixture-04',
    name: 'sound_stems/dialogue_isolated_master.wav',
    displayName: 'dialogue_isolated_master.wav',
    type: 'file',
    bucket: 'test-studio-vault-2026',
    sizeBytes: 3_400_000_000,
    formattedSize: '3.40 GB',
    storageClass: 'ARCHIVE',
    contentType: 'audio/wav',
    updated: '2026-07-15T09:00:00Z',
    crc32c: '5eT6aA==',
    crc32cHex: '0x98E7F6A5',
    etag: 'CTT6wW56c2kLHLA=',
  },
  {
    id: 'fixture-05',
    name: 'sound_stems/mix_stems_master_bundle.tar',
    displayName: 'mix_stems_master_bundle.tar',
    type: 'file',
    bucket: 'test-studio-vault-2026',
    sizeBytes: 14_600_000_000,
    formattedSize: '14.60 GB',
    storageClass: 'ARCHIVE',
    contentType: 'application/x-tar',
    updated: '2026-07-15T11:30:00Z',
    crc32c: '1kZ2gA==',
    crc32cHex: '0xFE4DF20B',
    etag: 'CZZ2cC12i8qRNRE=',
  },
  {
    id: 'fixture-06',
    name: 'feature_films/reel_04/metadata_manifest.json',
    displayName: 'metadata_manifest.json',
    type: 'file',
    bucket: 'test-studio-vault-2026',
    sizeBytes: 4_200,
    formattedSize: '4.20 KB',
    storageClass: 'STANDARD',
    contentType: 'application/json',
    updated: '2026-07-14T12:00:00Z',
    crc32c: '4waSgw==',
    crc32cHex: '0xE3069283',
    etag: 'CPP2sS12y8gHEHA=',
  },
  {
    id: 'fixture-07',
    name: 'vfx_plates/scene_01/plate_01.exr',
    displayName: 'plate_01.exr',
    type: 'file',
    bucket: 'test-studio-vault-2026',
    sizeBytes: 120_000_000,
    formattedSize: '120.00 MB',
    storageClass: 'STANDARD',
    contentType: 'image/x-exr',
    updated: '2026-07-16T14:00:00Z',
    crc32c: '9aB3cD==',
    crc32cHex: '0x12345678',
    etag: 'CVFX01EXR01=',
  },
]

/**
 * 0-Byte file corner case fixture
 */
export const ZERO_BYTE_ITEM: GCSMediaItem = {
  id: 'fixture-zero-byte',
  name: 'empty_marker.touch',
  displayName: 'empty_marker.touch',
  type: 'file',
  bucket: 'test-studio-vault-2026',
  sizeBytes: 0,
  formattedSize: '0 B',
  storageClass: 'STANDARD',
  contentType: 'text/plain',
  updated: '2026-08-01T00:00:00Z',
  crc32c: 'AAAAAA==',
  crc32cHex: '0x00000000',
  etag: 'CEMPTY0000001=',
}

/**
 * Massive 50GB+ simulation items
 */
export const MASSIVE_50GB_ITEM: GCSMediaItem = {
  id: 'fixture-massive-50gb',
  name: 'archives/2026_season_raw_4k_master_50gb.tar',
  displayName: '2026_season_raw_4k_master_50gb.tar',
  type: 'file',
  bucket: 'test-studio-vault-2026',
  sizeBytes: 54_000_000_000,
  formattedSize: '54.00 GB',
  storageClass: 'ARCHIVE',
  contentType: 'application/x-tar',
  updated: '2026-08-10T15:00:00Z',
  crc32c: '54GBHash==',
  crc32cHex: '0x54545454',
  etag: 'CMASSIVE54GB=',
}

export const MASSIVE_100GB_ITEM: GCSMediaItem = {
  id: 'fixture-massive-100gb',
  name: 'archives/uncompressed_imax_100gb.tar',
  displayName: 'uncompressed_imax_100gb.tar',
  type: 'file',
  bucket: 'test-studio-vault-2026',
  sizeBytes: 108_000_000_000,
  formattedSize: '108.00 GB',
  storageClass: 'ARCHIVE',
  contentType: 'application/x-tar',
  updated: '2026-08-11T12:00:00Z',
  crc32c: '100GBHash=',
  crc32cHex: '0x10010010',
  etag: 'CMASSIVE100GB=',
}

/**
 * Empty bucket directory listing result
 */
export const EMPTY_DIRECTORY_RESULT: DirectoryListingResult = {
  currentPrefix: '',
  folders: [],
  files: [],
  totalEstimatedItems: 0,
}

/**
 * Generator for 10,000+ realistic synthetic media items for virtualization benchmarks
 */
export function generate10kMediaItems(count: number = 10000): GCSMediaItem[] {
  const classes: StorageClass[] = ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE']
  const extensions = ['mxf', 'mov', 'wav', 'dpx', 'exr', 'tar', 'json', 'cube', 'pdf', 'flac']
  const contentTypes: Record<string, string> = {
    mxf: 'application/mxf',
    mov: 'video/quicktime',
    wav: 'audio/wav',
    dpx: 'image/x-dpx',
    exr: 'image/x-exr',
    tar: 'application/x-tar',
    json: 'application/json',
    cube: 'application/octet-stream',
    pdf: 'application/pdf',
    flac: 'audio/flac',
  }

  const items: GCSMediaItem[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const ext = extensions[i % extensions.length]
    const sClass = classes[i % classes.length]
    const sizeBytes = 1000 + ((i * 1337) % 25_000_000_000)
    const displayName = `asset_${String(i).padStart(6, '0')}.${ext}`
    const name = `virtual_vault/batch_${Math.floor(i / 1000)}/${displayName}`

    items[i] = {
      id: `virtual-asset-${i}`,
      name,
      displayName,
      type: 'file',
      bucket: 'test-studio-vault-2026',
      sizeBytes,
      formattedSize: `${(sizeBytes / 1_000_000_000).toFixed(2)} GB`,
      storageClass: sClass,
      contentType: contentTypes[ext] || 'application/octet-stream',
      updated: '2026-07-20T12:00:00Z',
      crc32c: '4waSgw==',
      crc32cHex: '0xE3069283',
      etag: `CVIRTUAL${i}=`,
    }
  }

  return items
}

/**
 * Mock GCP Projects
 */
export const MOCK_GCP_PROJECTS: GCPProject[] = [
  {
    projectId: 'client-media-project-2026',
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
  {
    projectId: 'archived-legacy-project-2025',
    name: 'Legacy Project Deletion Pending',
    projectNumber: '445566778899',
    lifecycleState: 'DELETE_REQUESTED',
    createTime: '2025-01-01T00:00:00Z',
  },
]
