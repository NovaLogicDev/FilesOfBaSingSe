# Module 1: Authentication & GCP Project Onboarding Design & Requirements Specification
## Module ID: `MOD-01-AUTH-ONBOARDING`

---

### 1. Module Overview & Scope

The **Authentication & GCP Project Onboarding Module** is the gateway to Files of Ba Sing Se. It is responsible for user identity authentication via Google Identity Services (GIS OAuth 2.0), automated discovery of client Google Cloud Platform (GCP) projects via the Cloud Resource Manager API, 1-click project auto-provisioning with Storage API activation, the \$300 Free Trial assistant flow for first-time GCP users, billing linkage verification, and automated 4-point preflight validation.

```mermaid
flowchart TD
    subgraph Mod01 ["Module 1: Auth & Onboarding Architecture"]
        GISClient["GIS Token Client (OAuth 2.0)\nScoped to devstorage.read_only & cloud-platform"]
        ProjectDiscovery["Project Discovery Service\n(GET /v1/projects)"]
        ProjectAutoCreate["Project Auto-Creation Service\n(POST /v1/projects & enable storage)"]
        BillingChecker["Billing Linkage Checker\n(GET /v1/projects/{id}/billingInfo)"]
        FreeTrialGuide["$300 Free Trial Assistant\n(60s Signup Deep-Link & Return Detector)"]
        PreflightRunner["4-Point Preflight Handshake Runner\n(OAuth, Bucket, IAM Viewer, CORS)"]
    end

    GISClient --> ProjectDiscovery
    ProjectDiscovery -->|Projects Found| BillingChecker
    ProjectDiscovery -->|No Projects| ProjectAutoCreate
    ProjectDiscovery -->|Brand New to GCP| FreeTrialGuide
    FreeTrialGuide --> ProjectDiscovery
    ProjectAutoCreate --> BillingChecker
    BillingChecker --> PreflightRunner
```

---

### 2. Functional & Non-Functional Requirements

#### Functional Requirements
- **FR-1.1**: Direct Google Sign-In with popup OAuth 2.0 requesting `https://www.googleapis.com/auth/devstorage.read_only` and progressive onboarding scope `https://www.googleapis.com/auth/cloud-platform`.
- **FR-1.2**: Project auto-discovery via `GET https://cloudresourcemanager.googleapis.com/v1/projects`, automatically populating existing projects in a user-friendly dropdown.
- **FR-1.3**: 1-click automated project creation (`basingse-media-dl-XXXX`) via `POST /v1/projects` with automated `storage.googleapis.com` enablement via Service Usage API.
- **FR-1.4**: \$300 Free Trial visual assistant card for clients with zero prior GCP experience, deep-linking to `https://console.cloud.google.com/freetrial` and providing an instant `[Auto-Detect My Project]` return trigger.
- **FR-1.5**: Billing linkage validation via `GET https://cloudbilling.googleapis.com/v1/projects/{projectId}/billingInfo` ensuring `billingEnabled == true`.
- **FR-1.6**: 4-point Preflight handshake executing probe requests against `GET /storage/v1/b/{bucket}` to auto-detect billing mode:
  1. OAuth token validity & expiration timer.
  2. Bucket reachability & Billing Mode classification (`Requester-Pays Enforced` vs `Owner-Pays / Free Egress`).
  3. IAM `roles/storage.objectViewer` permission.
  4. CORS preflight exposure headers (`x-goog-hash`, `Content-Length`, `Range`, `ETag`).
- **FR-1.7**: Automated Onboarding Bypass for Returning Users: When an authenticated session is established (via interactive sign-in or silent token restoration) and the system verifies that `hasCompletedOnboarding === true` with valid `savedBucketName` (and `savedProjectId` if in Requester-Pays mode), the system shall bypass the 4-step wizard entirely and route the user directly to the active media workspace (`AssetExplorer`) with background preflight verification.
- **FR-1.8**: Owner-Pays Onboarding Fast-Track & Deferred Detection:
  - **Standard Flow**: In Step 2 (Project Setup), the UI provides an option to skip project setup (`[ Skip for now (I am connecting to an Owner-Sponsored bucket) ]`). In Step 3, the user enters the bucket. In Step 4 Preflight, the bucket is probed without `userProject`. If detected as `owner-pays`, the user enters the workspace without project configuration ($0.00 cost). If detected as `requester-pays` and the user had skipped Step 2, preflight prompts them with a 1-click action: `[ Return to Step 2: Configure Project ]`.
  - **Deep-Link / Seeded Flow**: When the target bucket is known at the outset (via deep link `#/browse/{bucket}`), preflight probes the bucket immediately upon Step 1 authentication. If `owner-pays`, Step 2 is automatically bypassed, taking the user directly into Step 4/workspace.

#### Non-Functional Requirements & Security Constraints
- **NFR-1.1**: OAuth access tokens **MUST NEVER** be written to `localStorage`, `sessionStorage`, or cookies. Tokens reside strictly in volatile closure memory (`Zustand`).
- **NFR-1.2**: Project ID regex validation: `^[a-z0-9-]{6,30}$`.
- **NFR-1.3**: Preflight check timeout: **< 3000 ms** with exponential backoff on network failures.

---

### 3. Subsystem Protocol & Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Client as User (Taylor)
    participant UI as OnboardingWizard / AppShell (UI)
    participant GIS as Google Identity Services
    participant CRM as Cloud Resource Manager API
    participant SU as Service Usage API
    participant CB as Cloud Billing API
    participant GCS as GCS REST API
    participant PStore as PersistentStore

    Client->>UI: Clicks "Sign in with Google" (or silent auto-auth on reload)
    UI->>GIS: initTokenClient({ scope: 'devstorage.read_only cloud-platform' })
    GIS-->>Client: Displays Google OAuth Consent
    Client->>GIS: Grants Consent
    GIS-->>UI: Returns Access Token (Stored in volatile RAM)

    UI->>PStore: Check { hasCompletedOnboarding, savedProjectId, savedBucketName, activeBucketBillingMode }
    alt Returning User (hasCompletedOnboarding == true & Config Present)
        PStore-->>UI: Existing Bucket & Mode Found
        UI->>GCS: Background 4-Point Preflight Handshake
        GCS-->>UI: HTTP 200 OK (Billing Mode & IAM OK)
        UI-->>Client: DIRECT WORKSPACE LANDING (Bypasses Wizard Steps 1-4)
    else First-Time User (Standard Unseeded Flow)
        Note over UI,Client: Step 2: GCP Project Setup (or Skip for Owner-Pays)
        UI->>CRM: GET /v1/projects (Authorization: Bearer <TOKEN>)
        alt User Selects / Auto-Creates Project
            CRM-->>UI: Projects Found or Auto-Created via POST /v1/projects
            UI->>CB: Verify Billing Active
            UI->>Client: Step 2 Complete (Project Selected)
        else User Clicks "Skip for Owner-Sponsored Bucket"
            UI->>Client: Step 2 Skipped (projectId = null)
        end

        Note over UI,Client: Step 3: Target GCS Bucket Input
        Client->>UI: Inputs Target Bucket "gs://TARGET_BUCKET"

        Note over UI,GCS: Step 4: 4-Point Preflight Handshake & Detection
        UI->>GCS: Probe GET /storage/v1/b/TARGET_BUCKET (No userProject)
        alt Bucket is Owner-Pays (HTTP 200 OK & requesterPays == false)
            GCS-->>UI: HTTP 200 OK (Owner-Sponsored Detected)
            UI->>Client: All 4 Checks Green ($0.00 Client Cost) -> "Enter Media Portal"
        else Bucket is Requester-Pays (HTTP 400 UserProjectMissing)
            alt User Configured Project in Step 2
                UI->>GCS: GET /storage/v1/b/TARGET_BUCKET?userProject={projectId}
                GCS-->>UI: HTTP 200 OK (Requester-Pays Validated)
                UI->>Client: All 4 Checks Green (Billed to {projectId}) -> "Enter Media Portal"
            else User Skipped Step 2
                UI->>Client: Halts: "Requester-Pays Enforced — Project Required" -> [Return to Step 2]
            end
        end
        Client->>UI: Clicks "Enter Media Portal" -> Sets hasCompletedOnboarding = true
    end
```

---

### 4. TypeScript Interfaces & Data Contracts

```typescript
export type BucketBillingMode = 'requester-pays' | 'owner-pays';

export interface GCPProject {
  projectId: string;
  name: string;
  projectNumber: string;
  lifecycleState: 'ACTIVE' | 'DELETE_REQUESTED';
}

export interface BillingStatus {
  projectId: string;
  billingAccountName: string;
  billingEnabled: boolean;
}

export interface PreflightCheckResult {
  oauthTokenValid: boolean;
  oauthExpiresInSeconds: number;
  bucketReachable: boolean;
  billingMode: BucketBillingMode;
  requesterPaysActive: boolean;
  iamViewerGranted: boolean;
  corsConfigured: boolean;
  errorMessage?: string;
  remediationStep?: string;
}

export interface OnboardingState {
  step: 'auth' | 'project' | 'bucket' | 'verify' | 'ready';
  oauthToken: string | null;
  userEmail: string | null;
  userAvatar: string | null;
  discoveredProjects: GCPProject[];
  selectedProjectId: string;
  billingMode: BucketBillingMode;
  targetBucket: string;
  preflight: PreflightCheckResult | null;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
}
```

---

### 5. UI Components & State Transitions

1. **`OnboardingWizard.tsx`**: Main multi-step modal dialog with linear progress bar (used for first-time onboarding or explicit reconfiguration).
2. **`GoogleSignInButton.tsx`**: GIS OAuth 2.0 trigger with account switching support.
3. **`ProjectSelector.tsx`**: Smart combo-box containing auto-discovered projects, 1-click create button, and Free Trial assistant card.
4. **`PreflightChecklist.tsx`**: Live checklist with spinning loaders transitioning into animated green checkmarks or error diagnosis alerts.
5. **`SessionReconnectCard.tsx`**: 1-click fast-reconnect prompt for returning users requiring interactive consent.

---

### 6. Error Handling & Edge Cases

| Error Condition | GCS / API Response | User-Facing Diagnostics & Remediation |
| :--- | :--- | :--- |
| **No Billing Linked** | `billingEnabled: false` | Inline warning: *"Billing is unlinked on this project. GCS Requester Pays requires billing."* with 1-click link to GCP Billing Console. |
| **IAM Access Denied** | `HTTP 403 Forbidden` | Card: *"Your Google account lacks Storage Object Viewer access on this bucket. Request roles/storage.objectViewer from the bucket administrator."* |
| **CORS Blocked** | `TypeError: Failed to fetch` | Card: *"Bucket CORS origin not configured for this web domain."* with copyable `cors.json` config. |
| **Token Expired** | Expiry timer reaches 0 | Silent background renewal attempted; if failed, prompts 1-click re-auth without resetting project ID or forcing onboarding. |

---

### 7. Verification & Test Matrix

- **Unit Tests**:
  - `test_project_id_regex`: Validates string formats.
  - `test_billing_status_parser`: Tests JSON response handling for unlinked accounts.
  - `test_onboarding_bypass_evaluation`: Verifies returning users with complete config bypass steps 1-4.
- **Integration Tests**:
  - Mock GIS popup response and verify token remains in volatile store.
  - Mock CRM API with empty list $\rightarrow$ verify transition to Free Trial Assistant view.
  - Mock preflight HTTP 403 $\rightarrow$ verify actionable IAM diagnosis message.
  - Mock returning user sign-in $\rightarrow$ verify immediate workspace mount.

---

### 8. Relationship with Downstream Modules & Post-Setup Controls

Once initial onboarding completes, configuration management transitions to post-setup controls:
- **[Module 10: Session Continuity, Silent Token Restoration & Onboarding Bypass](module_10_session_lifecycle_and_restoration_design_and_requirements.md)** (`MOD-10-SESSION-LIFECYCLE`): Manages silent token re-acquisition on reload, session hints, and automated onboarding bypass.
- **[Module 9: Workspace Navigation, Bucket Switcher & GCP Config Center](module_9_workspace_and_gcp_config_center_design_and_requirements.md)** (`MOD-09-WORKSPACE-GCP-CONFIG-CENTER`): Provides on-the-fly bucket switching (`BucketSwitcherControl`), project switching (`ProjectSwitcherControl`), and holistic configuration auditing (`GCPConfigCenterModalShell`) without re-running this onboarding wizard.
- **[Module 8: State Management & Persistence](module_8_state_persistence_design_and_requirements.md)** (`MOD-08-STATE-PERSISTENCE`): Persists `savedProjectId`, `savedBucketName`, `recentBuckets`, and `hasCompletedOnboarding` across sessions.

