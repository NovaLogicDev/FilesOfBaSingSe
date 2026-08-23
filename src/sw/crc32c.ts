/**
 * Castagnoli CRC32c (0x1EDC6F41) Type-Safe Engine for Service Worker Streaming
 */

const CRC32C_TABLE = new Int32Array(256)
;(function initCRC32cTable() {
  const POLY = 0x82f63b78
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ POLY
      } else {
        crc = crc >>> 1
      }
    }
    CRC32C_TABLE[i] = crc
  }
})()

/**
 * Updates running CRC32c with a chunk buffer.
 */
export function updateCRC32c(crc: number, buffer: Uint8Array): number {
  let c = ~crc
  for (let i = 0; i < buffer.length; i++) {
    c = CRC32C_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }
  return ~c
}

/**
 * Formats CRC32c into big-endian Hex (0x...) and Base64 representations.
 */
export function formatCRC32c(crc: number): { hex: string; base64: string } {
  const uint32 = crc >>> 0
  const hex = '0x' + uint32.toString(16).toUpperCase().padStart(8, '0')

  const bytes = new Uint8Array([
    (uint32 >>> 24) & 0xff,
    (uint32 >>> 16) & 0xff,
    (uint32 >>> 8) & 0xff,
    uint32 & 0xff,
  ])

  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  return { hex, base64 }
}
