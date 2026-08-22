/**
 * Cryptographic Integrity & Checksum Verification Engine
 * Implements hardware-efficient table-driven Castagnoli CRC32c (polynomial 0x1EDC6F41 / reflected 0x82F63B78)
 * Conforms to Google Cloud Storage x-goog-hash specification.
 */
export class CRC32cIntegrityEngine {
  private static TABLE: Uint32Array = CRC32cIntegrityEngine.generateTable()
  private crc: number = 0xffffffff

  /**
   * Generates 256-entry lookup table for bit-reflected Castagnoli polynomial 0x82F63B78.
   */
  private static generateTable(): Uint32Array {
    const table = new Uint32Array(256)
    const POLY = 0x82f63b78 // Castagnoli bit-reflected polynomial

    for (let i = 0; i < 256; i++) {
      let crc = i
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ POLY : crc >>> 1
      }
      table[i] = crc >>> 0
    }
    return table
  }

  /**
   * Resets CRC32c state to initial 0xFFFFFFFF
   */
  public reset(): void {
    this.crc = 0xffffffff
  }

  /**
   * Incrementally updates rolling CRC32c hash with incoming binary slice.
   */
  public update(chunk: Uint8Array): void {
    let crc = this.crc
    const table = CRC32cIntegrityEngine.TABLE
    for (let i = 0; i < chunk.length; i++) {
      crc = (table[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8)) >>> 0
    }
    this.crc = crc
  }

  /**
   * Returns final unsigned 32-bit integer digest.
   */
  public digest(): number {
    return (this.crc ^ 0xffffffff) >>> 0
  }

  /**
   * Converts final 32-bit CRC into 4-byte big-endian buffer and Base64 encodes it.
   * Matches GCS header format: x-goog-hash: crc32c=<base64>
   */
  public digestBase64(): string {
    const finalCrc = this.digest()
    const bytes = new Uint8Array([
      (finalCrc >>> 24) & 0xff,
      (finalCrc >>> 16) & 0xff,
      (finalCrc >>> 8) & 0xff,
      finalCrc & 0xff,
    ])
    return CRC32cIntegrityEngine.bytesToBase64(bytes)
  }

  /**
   * Formats final 32-bit CRC into standardized 8-character uppercase hex string.
   * e.g. "0xAF82F6C0"
   */
  public digestHex(): string {
    const finalCrc = this.digest()
    return '0x' + finalCrc.toString(16).toUpperCase().padStart(8, '0')
  }

  /**
   * Convenience one-shot calculation on a string or Uint8Array.
   */
  public static calculate(input: Uint8Array | string): {
    integer: number
    hex: string
    base64: string
  } {
    const engine = new CRC32cIntegrityEngine()
    const bytes =
      typeof input === 'string' ? new TextEncoder().encode(input) : input
    engine.update(bytes)
    return {
      integer: engine.digest(),
      hex: engine.digestHex(),
      base64: engine.digestBase64(),
    }
  }

  /**
   * Verifies match between locally computed Base64 hash and GCS x-goog-hash header value.
   * Parses: "crc32c=r4L2wA==,md5=..."
   */
  public static verifyMatch(localBase64: string, gcsHashHeader: string): boolean {
    if (!gcsHashHeader) return false
    const match = gcsHashHeader.match(/crc32c=([^, ]+)/i)
    if (!match) return false
    return localBase64.trim() === match[1].trim()
  }

  /**
   * Portable binary-to-Base64 encoder compatible across Node, jsdom, and all browser environments.
   */
  private static bytesToBase64(bytes: Uint8Array): string {
    if (typeof btoa === 'function') {
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      return btoa(binary)
    }

    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''
    let i = 0
    const len = bytes.length

    while (i < len) {
      const b0 = bytes[i++]
      const b1 = i < len ? bytes[i++] : NaN
      const b2 = i < len ? bytes[i++] : NaN

      const idx0 = b0 >> 2
      const idx1 = ((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)
      const idx2 = isNaN(b1) ? 64 : ((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)
      const idx3 = isNaN(b2) ? 64 : b2 & 63

      result +=
        chars.charAt(idx0) +
        chars.charAt(idx1) +
        (idx2 === 64 ? '=' : chars.charAt(idx2)) +
        (idx3 === 64 ? '=' : chars.charAt(idx3))
    }
    return result
  }
}
