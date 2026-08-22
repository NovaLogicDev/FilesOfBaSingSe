# E2E Test Infra: Files of Ba Sing Se

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source | Tier 1 (≥5) | Tier 2 (≥5) | Tier 3 | Tier 4 |
|---|---------|--------|:-----------:|:-----------:|:------:|:------:|
| 1 | GIS OAuth 2.0 Auth & Token RAM Isolation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | GCP Project Auto-Discovery & Provisioning | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 3 | GCS REST Querying & 4-Point Preflight Handshake | ORIGINAL_REQUEST §R3, §R7 | 5 | 5 | ✓ | ✓ |
| 4 | Native Chromium 4MB Micro-Chunk Direct-to-Disk Stream | ORIGINAL_REQUEST §R4, §R7 | 5 | 5 | ✓ | ✓ |
| 5 | Castagnoli CRC32c Integrity Parity Verification | ORIGINAL_REQUEST §R4, Module 5 | 5 | 5 | ✓ | ✓ |
| 6 | Safari SW Stream Interceptor & Blob/CLI Fallbacks | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ |
| 7 | High-Density 10k+ Virtualized Asset Grid | ORIGINAL_REQUEST §R6 | 5 | 5 | ✓ | ✓ |
| 8 | Cost Governance & High-Cost Modal Gate ($5/25GB) | ORIGINAL_REQUEST §R6, Module 3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: Vitest (`npm test` / `vitest run`)
- Setup & Polyfills: `src/test/setup.ts` (polyfilling FSAA `window.showSaveFilePicker`, Service Workers, crypto)
- Mock HTTP Handlers: Deterministic REST API endpoints for CRM, Service Usage, Billing, and GCS REST v1
- Test Directories:
  - `tests/unit/`: Core mathematical and engine logic
  - `tests/integration/`: Service-level preflight, discovery, streaming, and SW interactions
  - `tests/e2e/`: Full opaque-box user flows (Onboarding -> Preflight -> Explorer -> Virtualization -> Download -> CRC32c Verify)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | End-to-End Onboarding to Verified Download | F1, F2, F3, F4, F5 | High |
| 2 | 10,000 Items Virtualized Explorer Navigation & Search | F7, F3, F8 | High |
| 3 | High-Cost Batch Selection Confirmation Gate | F7, F8, F4 | Medium |
| 4 | Safari Service Worker Stream Interception & Fallback | F6, F4, F5 | High |
| 5 | Network Failure & Rapid Abort Latency Verification | F4, F1, F3 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature area (≥40 tests)
- Tier 2: ≥5 boundary & error cases per feature area (≥40 tests)
- Tier 3: Pairwise coverage across major feature interactions (≥10 tests)
- Tier 4: ≥5 realistic application scenarios
- **Total Suite Target**: 95+ comprehensive tests
