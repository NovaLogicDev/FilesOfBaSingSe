import '@testing-library/jest-dom/vitest'

// Mock crypto.getRandomValues if not present in jsdom
if (!globalThis.crypto) {
  const nodeCrypto = require('crypto')
  globalThis.crypto = {
    getRandomValues: (buffer: any) => nodeCrypto.randomFillSync(buffer),
  } as any
}
