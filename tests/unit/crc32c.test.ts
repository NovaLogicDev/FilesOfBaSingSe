import { describe, it, expect } from 'vitest'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'

describe('CRC32cIntegrityEngine (Castagnoli Polynomial 0x1EDC6F41)', () => {
  it('correctly computes standard test vector for "123456789"', () => {
    // Known standard Castagnoli CRC32c test vector: "123456789" -> 0xE3069283
    const result = CRC32cIntegrityEngine.calculate('123456789')
    expect(result.hex).toBe('0xE3069283')
    expect(result.integer).toBe(0xe3069283 >>> 0)
    expect(result.base64).toBe('4waSgw==')
  })

  it('correctly computes CRC32c for empty buffer', () => {
    const result = CRC32cIntegrityEngine.calculate('')
    expect(result.hex).toBe('0x00000000')
    expect(result.integer).toBe(0)
    expect(result.base64).toBe('AAAAAA==')
  })

  it('computes identical checksum when chunked incrementally vs one-shot', () => {
    const payload = new TextEncoder().encode(
      'Files of Ba Sing Se: Zero-Host-Liability GCS Media Distribution Engine 2026',
    )

    // One-shot
    const oneShot = CRC32cIntegrityEngine.calculate(payload)

    // Incremental 8-byte chunks
    const engine = new CRC32cIntegrityEngine()
    const chunkSize = 8
    for (let i = 0; i < payload.length; i += chunkSize) {
      engine.update(payload.slice(i, i + chunkSize))
    }

    expect(engine.digestHex()).toBe(oneShot.hex)
    expect(engine.digestBase64()).toBe(oneShot.base64)
    expect(engine.digest()).toBe(oneShot.integer)
  })

  it('parses and verifies GCS x-goog-hash header matching', () => {
    const header = 'crc32c=r4L2wA==,md5=3a4f8d9b1c2e4a5f6e7d8c9b0a1b2c3d'

    expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', header)).toBe(true)
    expect(CRC32cIntegrityEngine.verifyMatch('WRONG_HASH==', header)).toBe(false)
    expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', '')).toBe(false)
  })

  it('formats big-endian 4-byte buffer into base64 correctly', () => {
    const engine = new CRC32cIntegrityEngine()
    // Test with sample bytes
    const sample = new Uint8Array([0x41, 0x76, 0x61, 0x74, 0x61, 0x72]) // "Avatar"
    engine.update(sample)

    const base64 = engine.digestBase64()
    const hex = engine.digestHex()

    expect(base64).toBeDefined()
    expect(hex).toMatch(/^0x[0-9A-F]{8}$/)
  })
})
