# Original User Request

## 2026-08-22T05:23:03Z

Implement Work Increment 3 for "Files of Ba Sing Se", transforming the client-side media portal from a mock-backed prototype into a fully operational production application capable of live Google Cloud interactions, memory-bounded direct-to-disk streaming, and high-density virtualization.

Working directory: .
Integrity mode: development

Reference specifications: `docs/requirements/` (`module_1_auth_onboarding_design_and_requirements.md` through `module_8_state_persistence_design_and_requirements.md`, `system_engines_design_specification.md`, `web_and_backend_architecture_requirements.md`, `auxiliary_and_supporting_components_specification.md`, `user_stories_specification.md`, `ui_wireframes_and_interface_specification.md`).

## Requirements

### R1. Live Google Identity Services (GIS) Authentication & In-Memory Token Lifecycle
Provide Google OAuth 2.0 popup authentication requesting `https://www.googleapis.com/auth/devstorage.read_only` and `https://www.googleapis.com/auth/cloud-platform` scopes. The authentication lifecycle must maintain access tokens strictly within volatile in-memory runtime state (never persisted to `localStorage`, `sessionStorage`, or cookies), support silent background token refresh, handle user account switching, and provide immediate volatile memory purge and stream abort upon sign-out.

### R2. Live GCP Project Auto-Discovery, 1-Click Provisioning & Billing Validation
Integrate with the Google Cloud Resource Manager API (`GET https://cloudresourcemanager.googleapis.com/v1/projects`) to auto-populate client projects, provide 1-click project auto-creation (`POST /v1/projects`) with automated Cloud Storage API activation (`serviceusage.googleapis.com`), support the $300 Free Trial assistant flow with auto-detection on return, and verify billing account attachment (`cloudbilling.googleapis.com`) to prevent `UserProjectAccessDenied` errors.

### R3. Live GCS REST Client & 4-Point Preflight Handshake
Implement live GCS JSON REST API v1 querying supporting delimiter-based virtual directory slicing (`delimiter=/`), pagination (`nextPageToken`), and object metadata extraction. Execute an automated live 4-point preflight handshake against the target bucket with the client's active `userProject` to validate: (1) OAuth token validity and remaining TTL, (2) Bucket reachability and Requester-Pays enforcement, (3) IAM `roles/storage.objectViewer` permission, and (4) CORS exposure headers (`x-goog-hash`, `Content-Length`, `Range`, `ETag`).

### R4. Native Chromium 4MB Micro-Chunk Direct-to-Disk Stream Pipeline
Implement direct-to-disk media streaming using the native Chromium File System Access API (`window.showSaveFilePicker()` and `FileSystemWritableFileStream`). The streaming pipe must read binary data in 4MB micro-chunks directly to disk while keeping JavaScript heap memory strictly bounded (<25 MB ceiling, ~11.4 MB nominal) during multi-gigabyte transfers (up to 50GB+), emit real-time moving average speed (MB/s) and ETA telemetry, support instantaneous cancellation (<200ms abort latency), and compute running Castagnoli CRC32c checksums to verify bit-exact parity against Google Cloud Storage `x-goog-hash` response headers.

### R5. Safari Service Worker Stream Interceptor & Universal Fallbacks
Implement the Safari WebKit stream interceptor via Service Worker (`public/sw.js`) to stream media assets directly to `~/Downloads` without browser tab crashes, support universal in-memory blob handling for lightweight files (<200MB), and provide graceful degradation with automatic routing to the CLI companion generator when Mozilla Firefox is detected.

### R6. High-Performance Virtualized Asset Data Grid (10,000+ Files)
Implement high-performance windowed DOM virtualization for the media asset explorer table to support smooth 60 FPS rendering (<16ms frame render time) for directories containing 10,000+ items. Support interactive multi-column sorting (Name, Size, Storage Class, Last Modified), real-time fuzzy search (<50ms debounce), category filter chips, multi-select batch actions, and full ARIA grid keyboard navigation (`/`, `Esc`, `Ctrl+A`, `Space`, `Enter`).

### R7. Controlled Zero-Backend Host-Liability Infrastructure
The application must operate under a strict zero-backend host liability model: all storage retrieval and network egress operations must execute directly from the client browser to Google Cloud endpoints with `?userProject={projectId}` attached to attribute all billing to the client project. No intermediate backend proxy or compute server may be introduced.

## Acceptance Criteria

### Security & Token Isolation
- [ ] OAuth access tokens, renewal handles, and active stream controllers reside exclusively in volatile runtime memory (`useRuntimeStore`) and are never written to `localStorage` or `sessionStorage`
- [ ] Disconnecting or signing out purges volatile memory, aborts active streams, and resets the session cleanly

### GCP Onboarding & Preflight Verification
- [ ] Cloud Resource Manager API discovery accurately populates accessible GCP projects into the project selector
- [ ] 1-Click project auto-provisioning creates `basingse-media-dl-XXXX` and enables `storage.googleapis.com` via Service Usage API
- [ ] 4-Point preflight check accurately verifies token validity, bucket Requester-Pays enforcement, IAM viewer permissions, and CORS preflight headers

### Streaming Pipeline & Memory SLA
- [ ] File System Access API streaming executes via 4MB micro-chunks without accumulating data in browser memory, maintaining JavaScript heap usage under 25 MB
- [ ] Running Castagnoli CRC32c hash calculation matches GCS `x-goog-hash: crc32c=...` header upon stream completion
- [ ] Stream cancellation via `AbortController` terminates network transfer and closes disk handles in <200ms

### Virtualization & Interactivity
- [ ] Asset explorer table renders directories with 10,000+ items maintaining 60 FPS scrolling and low DOM node count
- [ ] Real-time search and filter chips update the visible dataset in <50ms
- [ ] High-cost confirmation gate triggers whenever selected items exceed $5.00 USD or 25 GB

### Quality & Build Verification
- [ ] All unit and integration test suites pass (`npm test`) with 100% success rate
- [ ] TypeScript static typecheck passes with zero errors (`npm run typecheck`)
- [ ] Production build succeeds without errors or warnings (`npm run build`)
