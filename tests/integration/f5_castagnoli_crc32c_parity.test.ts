import { describe, it, expect } from 'vitest'
import { CRC32cIntegrityEngine } from '../../src/engines/crc32c'

describe('Tier 1 - F5: Castagnoli CRC32c Integrity Parity', () => {
  it('matches standard RFC 3720 Castagnoli CRC32c test vector for "123456789"', () => {
    const res = CRC32cIntegrityEngine.calculate('123456789')
    expect(res.integer).toBe(0xe3069283 >>> 0)
    expect(res.hex).toBe('0xE3069283')
    expect(res.base64).toBe('4waSgw==')
  })

  it('produces standard 0x00000000 and AAAAAA== for empty 0-byte input', () => {
    const emptyBytes = new Uint8Array(0)
    const res = CRC32cIntegrityEngine.calculate(emptyBytes)
    expect(res.integer).toBe(0)
    expect(res.hex).toBe('0x00000000')
    expect(res.base64).toBe('AAAAAA==')
  })

  it('ensures incremental chunking parity across arbitrary buffer slice sizes', () => {
    // 64 KB pseudo-random test payload
    const payload = new Uint8Array(64 * 1024)
    for (let i = 0; i < payload.length; i++) {
      payload[i] = (i * 31 + 17) & 0xff
    }

    const oneShot = CRC32cIntegrityEngine.calculate(payload)

    // Chunked into 4096-byte slices
    const engine = new CRC32cIntegrityEngine()
    const sliceSize = 4096
    for (let i = 0; i < payload.length; i += sliceSize) {
      engine.update(payload.subarray(i, i + sliceSize))
    }

    expect(engine.digest()).toBe(oneShot.integer)
    expect(engine.digestHex()).toBe(oneShot.hex)
    expect(engine.digestBase64()).toBe(oneShot.base64)
  })

  it('detects 1-bit data corruption with complete avalanche disparity', () => {
    const dataA = new TextEncoder().encode('Ba Sing Se Master Archive Tape 2026 - Scene 40')
    const dataB = new Uint8Array(dataA)
    dataB[10] = dataB[10] ^ 0x01 // Flip a single bit

    const resA = CRC32cIntegrityEngine.calculate(dataA)
    const resB = CRC32cIntegrityEngine.calculate(dataB)

    expect(resA.hex).not.toBe(resB.hex)
    expect(resA.base64).not.toBe(resB.base64)
    expect(resA.integer).not.toBe(resB.integer)
  })

  it('parses composite GCS x-goog-hash headers containing both crc32c and md5', () => {
    const compositeHeader = 'crc32c=r4L2wA==, md5=3a4f8d9b1c2e4a5f6e7d8c9b0a1b2c3d'
    expect(CRC32cIntegrityEngine.verifyMatch('r4L2wA==', compositeHeader)).toBe(true)
    expect(CRC32cIntegrityEngine.verifyMatch('v9M3xA==', compositeHeader)).toBe(false)
    expect(CRC32cIntegrityEngine.verifyMatch('', compositeHeader)).toBe(false)
  })

  it('supports engine reset() for multi-pass stream processing without reallocation', () => {
    const engine = new CRC32cIntegrityEngine()

    engine.update(new TextEncoder().encode('Pass One'))
    const digest1 = engine.digest()

    engine.reset()
    expect(engine.digest()).toBe(0) // Reset to 0 after inversion

    engine.update(new TextEncoder().encode('Pass One'))
    expect(engine.digest()).toBe(digest1)
  })
})
