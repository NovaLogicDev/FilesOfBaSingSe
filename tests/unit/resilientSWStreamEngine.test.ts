import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ResilientSWStreamEngine } from '../../src/engines/resilientSWStreamEngine'
import { swService } from '../../src/services/swService'

describe('Engine 4: ResilientSWStreamEngine Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()

    vi.spyOn(swService, 'isSupported').mockReturnValue(true)
    vi.spyOn(swService, 'register').mockResolvedValue(true)
    vi.spyOn(swService, 'registerStreamTicket').mockResolvedValue('sw_stream_mock_123')
    vi.spyOn(swService, 'startKeepAlive').mockImplementation(() => {})
    vi.spyOn(swService, 'stopKeepAlive').mockImplementation(() => {})
    vi.spyOn(swService, 'triggerDownload').mockImplementation(() => {})
    vi.spyOn(swService, 'abortStream').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('registers stream ticket with Service Worker, starts keep-alive, and triggers native download', async () => {
    const onProgress = vi.fn()
    const abortController = new AbortController()

    const streamId = await ResilientSWStreamEngine.streamToBrowser({
      bucketName: 'gs://partner-raw-master-archives-2026',
      objectName: 'footage/reel01.mxf',
      suggestedFilename: 'reel01.mxf',
      totalBytes: 524288000,
      userProject: 'basingse-media-dl-1234',
      oauthToken: 'ya29.mock-token',
      expectedCrc32c: 'r4L2wA==',
      onProgress,
      abortSignal: abortController.signal,
    })

    expect(streamId).toMatch(/^sw-stream-/)
    expect(swService.register).toHaveBeenCalled()
    expect(swService.registerStreamTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'partner-raw-master-archives-2026',
        object: 'footage/reel01.mxf',
        filename: 'reel01.mxf',
        totalBytes: 524288000,
        userProject: 'basingse-media-dl-1234',
        token: 'ya29.mock-token',
        expectedCrc32c: 'r4L2wA==',
      }),
    )
    expect(swService.startKeepAlive).toHaveBeenCalledWith(streamId)
    expect(swService.triggerDownload).toHaveBeenCalledWith(streamId, 'reel01.mxf')
  })

  it('throws error when Service Worker is unsupported', async () => {
    vi.spyOn(swService, 'isSupported').mockReturnValue(false)

    await expect(
      ResilientSWStreamEngine.streamToBrowser({
        bucketName: 'gs://bucket',
        objectName: 'obj',
        suggestedFilename: 'file.dat',
        totalBytes: 100,
        userProject: 'proj',
        oauthToken: 'token',
      }),
    ).rejects.toThrow('Service Worker API is not supported in this browser.')
  })

  it('handles client abort signal gracefully and notifies progress callback', async () => {
    const onProgress = vi.fn()
    const abortController = new AbortController()

    const streamId = await ResilientSWStreamEngine.streamToBrowser({
      bucketName: 'bucket',
      objectName: 'obj',
      suggestedFilename: 'file.dat',
      totalBytes: 100,
      userProject: 'proj',
      oauthToken: 'token',
      onProgress,
      abortSignal: abortController.signal,
    })

    abortController.abort()

    expect(swService.abortStream).toHaveBeenCalledWith(streamId)
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        streamId,
        status: 'cancelled',
      }),
    )
  })

  it('stops keep alive timer properly', () => {
    ResilientSWStreamEngine.startKeepAlive('stream_123')
    expect(swService.startKeepAlive).toHaveBeenCalledWith('stream_123')

    ResilientSWStreamEngine.stopKeepAlive()
    expect(swService.stopKeepAlive).toHaveBeenCalledWith('stream_123')
  })
})
