import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { AppShell } from '../../src/components/layout/AppShell'
import { usePersistentStore } from '../../src/store/persistentStore'
import { useRuntimeStore } from '../../src/store/runtimeStore'
import { gcsClientService } from '../../src/services/gcsClientService'
import { BrowserHistoryRouterEngine } from '../../src/engines/browserHistoryRouter'

describe('Browser History & URL Synchronization Integration Tests (Module 11 / Epic 11)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    window.location.hash = ''

    usePersistentStore.setState({
      savedBucketName: 'partner-raw-master-archives-2026',
      savedProjectId: 'client-prod-media-2026',
      hasCompletedOnboarding: true,
      lastAuthUserEmail: 'alex@production-studio.com',
      lastAuthUserName: 'Alex Supervisor',
      isFreeTrialAccount: false,
    })

    useRuntimeStore.setState({
      oauthToken: 'mock-valid-token-12345',
      userEmail: 'alex@production-studio.com',
      userName: 'Alex Supervisor',
      isRestoringSession: false,
      sessionRestorationError: null,
    })

    // Mock listObjects to return appropriate folder contents
    vi.spyOn(gcsClientService, 'listObjects').mockImplementation(async (_token, _bucket, options) => {
      const prefix = options.prefix || ''
      if (prefix === '') {
        return {
          currentPrefix: '',
          folders: ['feature_films/'],
          files: [],
          totalEstimatedItems: 1,
        }
      } else if (prefix === 'feature_films/') {
        return {
          currentPrefix: 'feature_films/',
          folders: ['feature_films/reel_04/'],
          files: [],
          totalEstimatedItems: 1,
        }
      } else if (prefix === 'feature_films/reel_04/') {
        return {
          currentPrefix: 'feature_films/reel_04/',
          folders: [],
          files: [
            {
              id: 'partner-raw-master-archives-2026/feature_films/reel_04/cam_A.mxf',
              name: 'feature_films/reel_04/cam_A.mxf',
              displayName: 'cam_A.mxf',
              type: 'file',
              bucket: 'partner-raw-master-archives-2026',
              sizeBytes: 1024 * 1024 * 500,
              formattedSize: '500.00 MB',
              storageClass: 'STANDARD',
              contentType: 'application/mxf',
              updated: new Date().toISOString(),
              crc32c: 'AAAAAA==',
              etag: 'mock-etag',
            },
          ],
          totalEstimatedItems: 1,
        }
      }
      return {
        currentPrefix: prefix,
        folders: [],
        files: [],
        totalEstimatedItems: 0,
      }
    })
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('should push history state and update URL hash when navigating folders and clicking breadcrumbs', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')

    render(<AppShell />)

    // Initially loads root
    await waitFor(() => {
      expect(screen.getByText('feature_films/')).toBeInTheDocument()
    })

    // Click on folder row 'feature_films/'
    const folderRow = screen.getByText('feature_films/')
    await act(async () => {
      fireEvent.click(folderRow)
    })

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'partner-raw-master-archives-2026',
          prefix: 'feature_films/',
          source: 'user_interaction',
        }),
        '',
        '#/browse/partner-raw-master-archives-2026/feature_films/'
      )
    })

    // Subfolder 'reel_04/' should be visible
    await waitFor(() => {
      expect(screen.getByText('reel_04/')).toBeInTheDocument()
    })

    // Click on 'reel_04/'
    const reelRow = screen.getByText('reel_04/')
    await act(async () => {
      fireEvent.click(reelRow)
    })

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'partner-raw-master-archives-2026',
          prefix: 'feature_films/reel_04/',
        }),
        '',
        '#/browse/partner-raw-master-archives-2026/feature_films/reel_04/'
      )
    })

    // File cam_A.mxf should now be rendered
    await waitFor(() => {
      expect(screen.getByText('cam_A.mxf')).toBeInTheDocument()
    })

    // Breadcrumbs should render: [gs://partner-raw-master-archives-2026] > [feature_films] > [reel_04]
    expect(screen.getByText('feature_films')).toBeInTheDocument()
    expect(screen.getByText('reel_04')).toBeInTheDocument()

    // Click breadcrumb segment 'feature_films' to navigate up
    const featureFilmsBreadcrumb = screen.getByText('feature_films')
    await act(async () => {
      fireEvent.click(featureFilmsBreadcrumb)
    })

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'feature_films/',
        }),
        '',
        '#/browse/partner-raw-master-archives-2026/feature_films/'
      )
    })
  })

  it('should handle browser Back/Forward (popstate event) without page reload', async () => {
    render(<AppShell />)

    await waitFor(() => {
      expect(screen.getByText('feature_films/')).toBeInTheDocument()
    })

    // Simulate user navigating deep
    const folderRow = screen.getByText('feature_films/')
    await act(async () => {
      fireEvent.click(folderRow)
    })

    await waitFor(() => {
      expect(screen.getByText('reel_04/')).toBeInTheDocument()
    })

    // Now simulate browser Back button: fires 'popstate' with root state
    await act(async () => {
      const popStateEvent = new PopStateEvent('popstate', {
        state: {
          bucket: 'partner-raw-master-archives-2026',
          prefix: '',
          timestamp: Date.now(),
          source: 'popstate',
        },
      })
      window.dispatchEvent(popStateEvent)
    })

    // Root folder 'feature_films/' should be displayed again
    await waitFor(() => {
      expect(screen.getByText('feature_films/')).toBeInTheDocument()
    })
  })

  it('should hydrate deep link on boot from initial window.location.hash', async () => {
    window.location.hash = '#/browse/partner-raw-master-archives-2026/feature_films/reel_04/'

    render(<AppShell />)

    // Should directly query and display deep-linked folder contents
    await waitFor(() => {
      expect(screen.getByText(/reel04_cam_A_raw\.mxf/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/reel_04/i)).toBeInTheDocument()
  })

  it('should guarantee zero credential token leakage in history.state', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState')

    render(<AppShell />)

    await waitFor(() => {
      expect(screen.getByText('feature_films/')).toBeInTheDocument()
    })

    const folderRow = screen.getByText('feature_films/')
    await act(async () => {
      fireEvent.click(folderRow)
    })

    expect(pushSpy).toHaveBeenCalled()
    const lastCallState = pushSpy.mock.calls[pushSpy.mock.calls.length - 1][0]
    const serialized = JSON.stringify(lastCallState)

    expect(serialized).not.toContain('mock-valid-token')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('secret')
  })
})
