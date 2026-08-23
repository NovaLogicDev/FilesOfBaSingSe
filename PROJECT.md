# Project: Files of Ba Sing Se (Work Increment 3)

## Architecture
Zero-backend, client-side media portal communicating directly from browser runtime to Google Cloud APIs (`cloudresourcemanager.googleapis.com`, `serviceusage.googleapis.com`, `cloudbilling.googleapis.com`, `storage.googleapis.com`) with `?userProject={projectId}` billing attribution.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER RUNTIME                                │
│                                                                             │
│  ┌────────────────────────┐  ┌───────────────────────┐  ┌────────────────┐  │
│  │   useRuntimeStore      │  │  usePersistentStore   │  │ VirtualizedGrid│  │
│  │ (Volatile RAM Tokens)  │  │(localStorage non-sens)│  │ (10,000+ Rows) │  │
│  └───────────┬────────────┘  └───────────────────────┘  └────────────────┘  │
│              │                                                              │
│  ┌───────────▼────────────┐  ┌───────────────────────┐  ┌────────────────┐  │
│  │   gisAuthService       │  │   gcpProjectService   │  │gcsClientService│  │
│  │  (GIS OAuth 2.0 Popup) │  │ (CRM / Billing / Svc) │  │ (REST / Prefl) │  │
│  └────────────────────────┘  └───────────────────────┘  └───────┬────────┘  │
│                                                                 │           │
│  ┌──────────────────────────────────────────────────────────────▼────────┐  │
│  │                        STREAMING PIPELINE                             │  │
│  │  ┌───────────────────────────┐     ┌───────────────────────────────┐  │  │
│  │  │ Chromium: streamDownload  │     │ Safari: public/sw.js          │  │  │
│  │  │ (FSAA 4MB micro-chunks)   │     │ (SW Stream Interceptor)       │  │  │
│  │  │ + Castagnoli CRC32c Parity│     │ Fallback: In-memory blob<200MB│  │  │
│  │  └───────────────────────────┘     └───────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Direct Client HTTPS (?userProject=)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GOOGLE CLOUD PLATFORM                              │
│  - Google Identity Services (OAuth 2.0)                                     │
│  - Cloud Resource Manager API v1 (`GET/POST /v1/projects`)                  │
│  - Service Usage API (`serviceusage.googleapis.com`)                        │
│  - Cloud Billing API (`cloudbilling.googleapis.com`)                        │
│  - Google Cloud Storage JSON API v1 (`storage.googleapis.com/storage/v1`)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | GIS OAuth 2.0 Popup | Google Identity Services popup auth requesting `devstorage.read_only` and `cloud-platform` | M1 | R1, Module 1 |
| 2 | In-Memory Token Isolation | Strict volatile RAM token storage (`useRuntimeStore`), zero persistence in localStorage/cookies | M1 | R1, Module 8 |
| 3 | Silent Background Token Refresh | Automatic token renewal before expiry; user account switching | M1 | R1, Module 1 |
| 4 | Volatile Memory Purge & Stream Abort | Sign-out purges volatile RAM, aborts active network/disk streams, resets state | M1 | R1, Module 8 |
| 5 | Storage Boundary Auditor | Proactive scanning of localStorage/sessionStorage for prohibited token patterns | M1 | R1, Module 8 |
| 6 | GCP Project Auto-Discovery | CRM API `GET /v1/projects` listing client accessible projects | M2 | R2, Module 1 |
| 7 | 1-Click Project Auto-Provisioning | `POST /v1/projects` creating `basingse-media-dl-XXXX` and activating `storage.googleapis.com` | M2 | R2, Module 1 |
| 8 | $300 Free Trial Flow & Billing Check | Cloud Billing API validation (`billingEnabled: true`) preventing `UserProjectAccessDenied` | M2 | R2, Module 1 |
| 9 | GCS Delimiter Virtual Slicing | GCS JSON REST API v1 querying with `delimiter=/` and breadcrumb navigation | M3 | R3, Module 2 |
| 10 | GCS Pagination (`nextPageToken`) | Seamless continuation fetching across directories with thousands of objects | M3 | R3, Module 2 |
| 11 | Object Metadata Extraction | Extraction of Content-Type, Updated, StorageClass, CRC32c, MD5, Generation IDs | M3 | R3, Module 2, 6 |
| 12 | 4-Point Preflight Handshake | Automated check: Token TTL, Requester-Pays enforcement, IAM ObjectViewer, CORS headers | M3 | R3, Module 1 |
| 13 | Zero-Backend Host Liability | Strict client-side execution with `?userProject={projectId}` on all GCP requests | M3 | R7, Arch Spec |
| 14 | Native Chromium FSAA Streaming | `window.showSaveFilePicker()` and `FileSystemWritableFileStream` 4MB chunk direct-to-disk | M4 | R4, Module 4 |
| 15 | Bounded Memory SLA (<25MB Heap) | Micro-chunk buffer flushing to maintain memory ceiling <25MB (nominal ~11.4MB) for 50GB+ | M4 | R4, Module 4 |
| 16 | Real-time Stream Telemetry | Moving-average speed (MB/s), ETA calculation, transferred bytes, and RAM gauge | M4 | R4, Module 4 |
| 17 | Running Castagnoli CRC32c Parity | Bit-reflected `0x1EDC6F41` table lookup checksum verified against `x-goog-hash: crc32c=` | M4 | R4, Module 5 |
| 18 | Instantaneous Stream Abort | `AbortController` cancellation terminating network and closing disk handles in <200ms | M4 | R4, Module 4 |
| 19 | Safari SW Stream Interceptor | Service Worker (`public/sw.js`) intercepting download URLs to stream directly to `~/Downloads` | M5 | R5, Module 5 |
| 20 | Universal In-Memory Blob Fallback | Memory blob download fallback for lightweight files (<200MB) | M5 | R5, Module 5 |
| 21 | Firefox CLI Companion Routing | Automatic detection of Firefox with routing to generated `gcloud`/`gsutil` CLI commands | M5 | R5, Module 7 |
| 22 | Windowed DOM Virtualization | 60 FPS table virtualization (<16ms frame time) handling 10,000+ items with low DOM node count | M6 | R6, Module 2 |
| 23 | Multi-Column Sorting & Debounced Search | Sorting by Name, Size, Storage Class, Updated, and <50ms debounced fuzzy search | M6 | R6, Module 2 |
| 24 | Category Filter Chips & Multi-Select | Filter chips (All, Video, Audio, Archives, Documents) and batch selection | M6 | R6, Module 2 |
| 25 | Full ARIA Grid Keyboard Navigation | Keyboard navigation (`/`, `Esc`, `Ctrl+A`, `Space`, `Enter`, Arrow keys) | M6 | R6, Module 2 |
| 26 | High-Cost Confirmation Modal Gate | Warning confirmation modal triggered whenever selected items exceed $5.00 USD or 25 GB | M6 | R6, Module 3 |
| 27 | 100% E2E Test Suite Pass | 4-tier opaque-box test suite passing 100% of tests | M7 | Acceptance Criteria |
| 28 | Adversarial Coverage Hardening | White-box adversarial testing (Tier 5) hardening edge cases, race conditions, memory | M7 | Project Spec |
| 29 | Silent Background Session Restoration on Reload | Background GIS token re-acquisition without disk token storage on page reload | M1 | R1, Module 10 |
| 30 | Returning User Onboarding Bypass & Direct Workspace Landing | Automatic bypass of 4-step wizard for returning configured users directly to AssetExplorer | M1 | R1, Module 10 |
| 31 | Browser History API Breadcrumbs Sync | `popstate` and `pushState` integration for native Back/Forward traversal in <16ms | M6 | R6, Module 11 |
| 32 | Deep-Link Hash Routing & Cancel Guard | Bookmarkable `#/browse/{bucket}/{prefix}` URLs with in-flight fetch cancellation via AbortController | M6 | R6, Module 11 |
| 33 | Dual Billing Mode & Owner-Pays Consumption | Automated preflight classification of `requester-pays` vs `owner-pays`, $0.00 client cost engine, and project-optional fast track | M3 | Module 13, Engine 11 |
| 34 | Mixed-Mode Multi-Bucket Traversal & Badges | Dynamic status badge rendering (`[Requester-Pays Enforced 🛡️]` vs `[Owner-Pays / Free Egress 🎁]`) and adaptive CLI generation | M6 | Module 13, Engine 11 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | GIS Auth, Session Continuity & Token Lifecycle | Live GIS popup, silent refresh, token purge, storage boundary, reload recovery, onboarding bypass (R1, Module 10) | none | DONE |
| M2 | GCP Project Auto-Discovery, Provisioning & Billing | CRM API discovery, 1-click project provisioning, Service Usage, Billing check (R2) | M1 | DONE |
| M3 | Live GCS REST Client & 4-Point Preflight | Delimiter slicing, pagination, metadata, 4-point preflight, zero-backend ?userProject (R3, R7) | M1, M2 | DONE |
| M4 | 4MB Micro-Chunk FSAA Stream Engine & CRC32c | Chromium FSAA 4MB streaming, memory <25MB, telemetry, CRC32c parity, abort <200ms (R4, R7) | M3 | DONE |
| M5 | Safari SW Stream Interceptor & Fallbacks | `public/sw.js`, Service Worker streaming, blob fallback (<200MB), Firefox CLI routing (R5) | M4 | DONE |
| M6 | 10k+ Virtualized Asset Grid, Breadcrumbs & History | 60 FPS DOM virtualization, debounced search, ARIA keys, high-cost gate, Browser History API (R6, Module 11) | M3 | DONE |
| M7 | Integration, 100% E2E Pass & Adversarial Hardening | Pass 100% of E2E test suite (Tiers 1-4), Tier 5 adversarial testing, typecheck, build | M1–M6, E2E | DONE |

## E2E Testing Track
- Parallel track creating comprehensive Opaque-Box Test Suite (`tests/e2e/`, `tests/integration/`) across Tiers 1-4.
- Publishes `TEST_READY.md` upon completion.

## Code Layout
- `src/types/`: `auth.ts`, `gcp.ts`, `gcs.ts`, `stream.ts`, `cost.ts`, `observability.ts`, `store.ts`, `session.ts`, `navigation.ts`
- `src/services/`:
  - `gisAuthService.ts` (Live GIS OAuth 2.0 & Token Client)
  - `gcpProjectService.ts` (CRM, Service Usage, Cloud Billing)
  - `gcsClientService.ts` (Live GCS REST API v1 & 4-Point Preflight)
  - `streamDownloadService.ts` (Chromium FSAA 4MB micro-chunk engine & CRC32c verification)
  - `swService.ts` (Safari Service Worker stream coordinator)
  - `storageBoundary.ts` (Storage isolation auditor)
  - `observability.ts` (Sanitized diagnostics ring buffer)
- `src/engines/`: `cost.ts`, `crc32c.ts`, `cli.ts`, `sessionLifecycle.ts`, `browserHistoryRouter.ts`
- `src/store/`: `runtimeStore.ts` (volatile RAM), `persistentStore.ts` (localStorage prefs)
- `src/components/`:
  - `layout/`: `AppShell.tsx`, `Header.tsx`, `Footer.tsx`
  - `onboarding/`: `OnboardingWizardShell.tsx`, `GisAuthStep.tsx`, `ProjectStep.tsx`, `BucketStep.tsx`, `PreflightStep.tsx`, `SessionReconnectCard.tsx`
  - `explorer/`: `AssetExplorerShell.tsx`, `VirtualizedAssetGrid.tsx`, `BreadcrumbNav.tsx`, `FilterToolbar.tsx`
  - `downloader/`: `DownloadManagerShell.tsx`, `DownloadItem.tsx`
  - `inspector/`: `AssetInspectorDrawerShell.tsx`
  - `cost/`: `HighCostConfirmationModalShell.tsx`
  - `cli/`: `CliGeneratorModalShell.tsx`
  - `diagnostics/`: `DiagnosticsModalShell.tsx`
- `public/`: `sw.js` (Service Worker stream interceptor)
- `tests/`: `unit/`, `integration/`, `e2e/`, `fixtures/`, `helpers/`

## Interface Contracts
### Auth (`gisAuthService`) ↔ Runtime Store (`useRuntimeStore`)
- `requestAccessToken(): Promise<TokenResponse>` -> returns `{ accessToken, expiresIn, userEmail, userName, userAvatar }`
- `refreshTokenSilent(): Promise<TokenResponse>` -> silent background renewal without popup
- `useRuntimeStore.getState().setAuth(token, email, name, avatar, ttl)`
- `useRuntimeStore.getState().clearAuth()` -> wipes RAM tokens, aborts active streams

### History Router (`BrowserHistoryRouterEngine`) ↔ AppShell & BreadcrumbNav
- `serializeHash(bucketName: string, prefix: string): string`
- `parseHash(hashString?: string): ParsedRoute`
- `pushNavigation(bucketName: string, prefix: string, options?: NavigateOptions): void`

### Session Lifecycle (`SessionLifecycleEngine`) ↔ AppShell
- `shouldBypassOnboarding(hasCompletedOnboarding: boolean, savedProjectId: string, savedBucketName: string): boolean`
- `restoreSessionOnBoot(): Promise<{ restored: boolean, requireInteractive: boolean }>`

### GCP Resource (`gcpProjectService`) ↔ Onboarding Wizard
- `listProjects(token: string): Promise<GCPProject[]>`
- `createProject(token: string, projectId: string): Promise<GCPProject>`
- `enableStorageApi(token: string, projectId: string): Promise<void>`
- `checkBillingStatus(token: string, projectId: string): Promise<{ billingEnabled: boolean }>`

### GCS Client (`gcsClientService`) ↔ Asset Grid & Inspector
- `listBucketObjects(token: string, bucket: string, options: { prefix?: string, delimiter?: string, pageToken?: string, userProject: string }): Promise<GCSListResponse>`
- `runPreflightCheck(token: string, bucket: string, userProject: string): Promise<PreflightResults>`

### Stream Engine (`streamDownloadService`) ↔ Download Manager
- `downloadFileFSAA(asset: GCSAsset, options: StreamOptions): Promise<DownloadResult>`
- Emits telemetry events: `{ progress, speedBytesPerSec, etaSeconds, transferredBytes, ramMb }`
- `cancelDownload(downloadId: string): void` (must abort and close disk handle <200ms)
