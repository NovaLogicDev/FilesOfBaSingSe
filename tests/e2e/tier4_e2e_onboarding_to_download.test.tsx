import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingWizardShell } from '../../src/components/onboarding/OnboardingWizardShell'
import { streamDownloadService } from '../../src/services/streamDownloadService'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { usePersistentStore } from '../../src/store/persistentStore'
import { renderWithProviders, resetAllStores } from '../helpers/testUtils'
import { STUDIO_MASTER_DATASET } from '../fixtures/mediaDatasets'
import { DownloadProgressTelemetry, FileSystemFileHandle, FileSystemWritableFileStream } from '../../src/types'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'

function createMockFileHandle(name = 'test_asset.mxf'): {
  handle: FileSystemFileHandle
  writable: FileSystemWritableFileStream
  writtenChunks: Uint8Array[]
  isClosed: () => boolean
} {
  let closed = false
  const writtenChunks: Uint8Array[] = []

  const writable: FileSystemWritableFileStream = {
    locked: false,
    write: vi.fn(async (data: any) => {
      if (closed) throw new Error('Stream is closed')
      if (data instanceof Uint8Array) {
        writtenChunks.push(data)
      }
    }),
    seek: vi.fn(async () => {}),
    truncate: vi.fn(async () => {}),
    close: vi.fn(async () => {
      closed = true
    }),
    abort: vi.fn(async () => {}),
    getWriter: vi.fn() as any,
  }

  const handle: FileSystemFileHandle = {
    kind: 'file',
    name,
    createWritable: vi.fn(async () => writable),
    getFile: vi.fn(async () => new File([], name)),
  }

  return {
    handle,
    writable,
    writtenChunks,
    isClosed: () => closed,
  }
}

function createMockReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++])
      } else {
        controller.close()
      }
    },
  })
}

describe('Tier 4 - Scenario 2: Full End-to-End Onboarding to Verified Direct-to-Disk Download', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('completes entire user journey: Sign In -> Project Discovery -> 4-Point Preflight -> Streaming -> CRC32c Parity', async () => {
    const onComplete = vi.fn()
    const onClose = vi.fn()

    // 1. Render Onboarding Wizard
    renderWithProviders(
      <OnboardingWizardShell isOpen={true} onClose={onClose} onComplete={onComplete} />,
    )

    expect(screen.getByText(/Client GCP Connection & Onboarding Wizard/i)).toBeInTheDocument()
    expect(screen.getByText(/Step 1: Google Identity Sign-In/i)).toBeInTheDocument()

    // 2. Step 1: Sign in with Google
    const signInBtn = screen.getByRole('button', { name: /sign in with google/i })
    fireEvent.click(signInBtn)

    // Verify volatile RAM token stored and advanced to Step 2
    await waitFor(() => {
      expect(useRuntimeStore.getState().oauthToken).not.toBeNull()
    })
    expect(useRuntimeStore.getState().userEmail).toBe('taylor@freelance-edit.com')

    // 3. Step 2: Smart GCP Billing Project Setup
    await waitFor(() => {
      expect(screen.getByText(/Step 2: Smart GCP Billing Project Setup/i)).toBeInTheDocument()
    })

    // Switch to Auto-Create tab
    const autoCreateTab = screen.getByRole('button', { name: /Auto-Create Project/i })
    fireEvent.click(autoCreateTab)

    // Click Auto-Create Project
    const autoCreateBtn = screen.getByRole('button', { name: /1-Click Auto-Create Media Project/i })
    fireEvent.click(autoCreateBtn)

    await waitFor(() => {
      expect(usePersistentStore.getState().savedProjectId).toMatch(/^basingse-media-dl-\d{4}$/)
    })

    // Advance to Step 3
    const continueToBucketBtn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(continueToBucketBtn)

    // 4. Step 3: Target GCS Bucket
    await waitFor(() => {
      expect(screen.getByText(/Step 3: Target Google Cloud Storage Bucket/i)).toBeInTheDocument()
    })

    const bucketInput = screen.getByPlaceholderText(/gs:\/\/your-bucket-name/i)
    fireEvent.change(bucketInput, { target: { value: 'gs://partner-raw-master-archives-2026' } })

    // Advance to Step 4
    const continueToPreflightBtn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(continueToPreflightBtn)

    // 5. Step 4: Run 4-Point Preflight Handshake
    await waitFor(() => {
      expect(screen.getByText(/Step 4: Automated 4-Point Preflight Handshake/i)).toBeInTheDocument()
    })

    const runPreflightBtn = screen.getByRole('button', { name: /run preflight test/i })
    fireEvent.click(runPreflightBtn)

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /finish setup & enter media portal/i })
      expect(btn).not.toBeDisabled()
    })

    // Click Finish Setup & Enter Media Portal
    const finishBtn = screen.getByRole('button', { name: /finish setup & enter media portal/i })
    fireEvent.click(finishBtn)

    expect(onComplete).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()

    // 6. Direct-to-Disk Stream Execution for 18.4GB MXF master reel
    const targetAsset = STUDIO_MASTER_DATASET[0]
    const { handle } = createMockFileHandle(targetAsset.displayName)

    const chunk1 = new Uint8Array(4 * 1024 * 1024).fill(0xaa)
    const chunk2 = new Uint8Array(4 * 1024 * 1024).fill(0xbb)
    const totalBytes = chunk1.length + chunk2.length

    const crcEngine = new CRC32cIntegrityEngine()
    crcEngine.update(chunk1)
    crcEngine.update(chunk2)
    const expectedBase64 = crcEngine.digestBase64()
    const expectedHex = crcEngine.digestHex()

    const mockResponse = new Response(createMockReadableStream([chunk1, chunk2]), {
      status: 200,
      headers: {
        'content-length': String(totalBytes),
        'x-goog-hash': `crc32c=${expectedBase64}`,
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

    const streamTelemetryHistory: DownloadProgressTelemetry[] = []

    const downloadResult = await streamDownloadService.downloadFileFSAA(targetAsset, {
      bucketName: targetAsset.bucket,
      objectName: targetAsset.name,
      userProject: usePersistentStore.getState().savedProjectId,
      oauthToken: useRuntimeStore.getState().oauthToken!,
      customFileHandle: handle,
      onProgress: (progress) => {
        streamTelemetryHistory.push(progress)
        useRuntimeStore.getState().setDownloadProgress(progress)
      },
    })

    // 7. Verify Stream Results and Checksum Parity
    expect(downloadResult.success).toBe(true)
    expect(streamTelemetryHistory.length).toBeGreaterThan(1)
    const finalTelemetry = streamTelemetryHistory[streamTelemetryHistory.length - 1]

    expect(finalTelemetry.status).toBe('completed')
    expect(finalTelemetry.percentage).toBe(100)
    expect(finalTelemetry.loadedBytes).toBe(totalBytes)
    expect(finalTelemetry.computedCrc32cBase64).toBe(expectedBase64)
    expect(finalTelemetry.computedCrc32cHex).toBe(expectedHex)
    expect(finalTelemetry.integrityVerified).toBe(true)
  })
})
