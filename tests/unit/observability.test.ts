import { describe, it, expect, beforeEach } from 'vitest'
import { ObservabilityService } from '../../src/services/observability'

describe('ObservabilityService (Logging & Sanitized Diagnostics)', () => {
  beforeEach(() => {
    ObservabilityService.clearLogs()
  })

  it('records logs in memory ring buffer and retrieves them', () => {
    ObservabilityService.info('AUTH', 'User signed in successfully')
    ObservabilityService.warn('GCS', 'Transient network retry 1 of 3')
    ObservabilityService.error('STREAM', 'Stream aborted by user')

    const logs = ObservabilityService.getLogs()
    expect(logs).toHaveLength(3)
    expect(logs[0].category).toBe('AUTH')
    expect(logs[1].level).toBe('warn')
    expect(logs[2].level).toBe('error')
  })

  it('enforces circular buffer cap of 100 entries', () => {
    for (let i = 0; i < 120; i++) {
      ObservabilityService.info('GCS', `Event sequence #${i}`)
    }

    const logs = ObservabilityService.getLogs()
    expect(logs).toHaveLength(100)
    expect(logs[0].message).toContain('Event sequence #20')
    expect(logs[99].message).toContain('Event sequence #119')
  })

  it('sanitizes and redacts Bearer tokens and emails from log messages', () => {
    const rawMessage = 'Auth failed for user taylor@freelance-edit.com with Bearer ya29.secretToken12345'
    const sanitized = ObservabilityService.sanitize(rawMessage)

    expect(sanitized).not.toContain('taylor@freelance-edit.com')
    expect(sanitized).not.toContain('ya29.secretToken12345')
    expect(sanitized).toContain('[REDACTED_EMAIL]')
    expect(sanitized).toContain('[REDACTED_TOKEN]')
  })

  it('correctly masks GCP project ID for support diagnostic reports', () => {
    expect(ObservabilityService.maskProjectId('demo-client-media-2026')).toBe('demo***-2026')
    expect(ObservabilityService.maskProjectId('avatar-vfx-prod')).toBe('avat***-prod')
  })

  it('generates a well-formed diagnostic report payload', () => {
    ObservabilityService.info('PREFLIGHT', 'Handshake completed with 4 green checkpoints')

    const report = ObservabilityService.generateReport(
      'gs://client-media-vault',
      'client-media-project-2026',
    )

    expect(report.appVersion).toBe('0.2.0-alpha')
    expect(report.activeProjectIdMasked).toBe('clie***-2026')
    expect(report.recentLogs.length).toBeGreaterThan(0)
    expect(report.heapMemoryMB).toBe(11.4)
  })
})
