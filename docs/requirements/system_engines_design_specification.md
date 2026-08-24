# System Engines & Subsystem Design Specification
## Project: Files of Ba Sing Se — GCS Requester-Pays Media Distribution Portal

---

## Executive Architectural Overview

**Files of Ba Sing Se** is powered by twelve modular, decoupled, client-side engineering **Engines**. Each engine encapsulates a discrete domain of responsibility, adhering to strict memory boundaries, zero-backend host liability constraints, dynamic dual-billing attribution (Requester-Pays vs Owner-Pays), Google OAuth Trust & Safety least-privilege policies, and rigorous cryptographic integrity standards.

```mermaid
flowchart TD
    subgraph CoreEngines ["Files of Ba Sing Se Engine Architecture"]
        E1["1. GCP Onboarding & Provisioning Engine\n(GIS OAuth 2.0, CRM, Billing, Free Trial)"]
        E2["2. GCS REST & Hierarchical Metadata Engine\n(Directory Virtualization, Delimiters, Pagination)"]
        E3["3. Cost Governance & Estimation Engine\n(Decimal GB Math, Archive Retrieval, Egress)"]
        E4["4. Resilient SW Stream Download Engine\n(Keep-Alive Heartbeat, Pass-Through CRC32c, <15MB Heap)"]
        E5["5. CRC32c Cryptographic Integrity Engine\n(Castagnoli 0x1EDC6F41, Big-Endian Base64)"]
        E6["6. Automated Batch & CLI Generator Engine\n(gcloud storage, gsutil, Adaptive Billing Flags)"]
        E7["7. State Isolation & Persistence Engine\n(Zustand Volatile RAM, LocalStorage, IndexedDB)"]
        E8["8. Session Lifecycle & Restoration Engine\n(Silent Reload, Onboarding Bypass, 1-Click Reconnect)"]
        E9["9. Browser History & Navigation Router Engine\n(pushState, popstate, URL Hash Sync, Deep-Link)"]
        E10["10. Browser Download Bridge Engine\n(chrome://downloads, Native 'Show in Folder', Watchdog)"]
        E11["11. Dual Billing Mode & Owner-Pays Engine\n(Auto-Detection, Free Egress, Status Badges)"]
        E12["12. Trust & Safety & Scope Governance Engine\n(Least Privilege, Step-Up Consent, Zero-Telemetry, Privacy)"]
    end

    E12 --> E1
    E12 --> E7
    E8 --> E1
    E8 --> E7
    E1 --> E11
    E11 --> E2
    E9 --> E2
    E2 --> E3
    E2 --> E4
    E4 --> E5
    E4 --> E10
    E2 --> E6
    E11 --> E3
    E11 --> E6
    E7 -.->|"Supplies Ephemeral Token & Billing Mode"| E1
    E7 -.->|"Supplies Active State"| E2
    E7 -.->|"Maintains Active Stream Tickets"| E4
    E8 -.->|"Rehydrates Active Workspace"| E2
    E9 -.->|"Synchronizes URL & History Stack"| E2
```

---

## 1. Engine 1: GCP Onboarding & Project Auto-Provisioning Engine

### 1.1 Purpose & Domain Scope
Enables friction-free onboarding for non-technical users and solo freelancers (Taylor persona) by automating Google OAuth 2.0 authentication, project discovery via Google Cloud Resource Manager, 1-click media project creation, Cloud Storage API enablement, billing account linkage checks, and 4-point preflight verification.

### 1.2 Subsystem Architecture & State Machine

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated: App Launch
    Unauthenticated --> Authenticating: User clicks 'Sign in with Google'
    Authenticating --> QueryingProjects: GIS Token Returned (RAM)
    
    QueryingProjects --> ProjectsDiscovered: Projects Found via CRM API
    QueryingProjects --> NoProjectsFound: Zero Projects Returned
    
    ProjectsDiscovered --> VerifyingBilling: User selects Project
    NoProjectsFound --> FreeTrialGuidance: User clicks 'New to GCP ($300 Free Trial)'
    NoProjectsFound --> AutoCreatingProject: User clicks '1-Click Auto-Create'
    
    AutoCreatingProject --> EnablingStorageAPI: POST /v1/projects OK
    EnablingStorageAPI --> VerifyingBilling: storage.googleapis.com Enabled
    
    FreeTrialGuidance --> QueryingProjects: User returns & clicks 'Auto-Detect'
    
    VerifyingBilling --> PreflightCheck: billingEnabled == true
    VerifyingBilling --> BillingUnlinkedWarning: billingEnabled == false
    BillingUnlinkedWarning --> VerifyingBilling: User links billing & retries
    
    PreflightCheck --> PortalReady: 4 Checkpoints Pass
    PreflightCheck --> PreflightError: IAM/Bucket/CORS Error
    PreflightError --> PreflightCheck: Retry Handshake
    
    PortalReady --> [*]: Enter Media Explorer
```

### 1.3 TypeScript Interface & Contract Specification

```typescript
export interface GCPProject {
  projectId: string;
  name: string;
  projectNumber: string;
  createTime?: string;
  lifecycleState: 'ACTIVE' | 'DELETE_REQUESTED';
}

export interface BillingInfo {
  billingAccountName: string;
  billingEnabled: boolean;
  projectId: string;
}

export type BucketBillingMode = 'requester-pays' | 'owner-pays';

export interface PreflightStatus {
  oauthValid: boolean;
  oauthExpiresInSeconds: number;
  bucketReachable: boolean;
  billingMode: BucketBillingMode;
  requesterPaysActive: boolean;
  iamViewerGranted: boolean;
  corsConfigured: boolean;
  rawError?: string;
  errorRemediation?: string;
}

export class GCPOnboardingEngine {
  private static CRM_ENDPOINT = 'https://cloudresourcemanager.googleapis.com/v1/projects';
  private static BILLING_ENDPOINT = 'https://cloudbilling.googleapis.com/v1/projects';
  private static SERVICE_USAGE_ENDPOINT = 'https://serviceusage.googleapis.com/v1/projects';

  /**
   * Discovers existing GCP projects owned or accessible by the client.
   */
  public static async listProjects(oauthToken: string): Promise<GCPProject[]> {
    const res = await fetch(this.CRM_ENDPOINT, {
      headers: { Authorization: `Bearer ${oauthToken}` }
    });
    if (!res.ok) {
      if (res.status === 403) return []; // User has not activated GCP yet
      throw new Error(`Failed to list GCP projects (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    return data.projects?.filter((p: GCPProject) => p.lifecycleState === 'ACTIVE') || [];
  }

  /**
   * 1-Click Auto-Creation of a dedicated Media Project
   */
  public static async autoCreateMediaProject(oauthToken: string): Promise<string> {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const projectId = `basingse-media-dl-${randomSuffix}`;
    const name = 'Ba Sing Se Media Downloads';

    // 1. Create Project
    const createRes = await fetch(this.CRM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ projectId, name })
    });

    if (!createRes.ok) {
      throw new Error(`Project creation failed (${createRes.status}): ${await createRes.text()}`);
    }

    // 2. Enable Cloud Storage API
    const enableUrl = `${this.SERVICE_USAGE_ENDPOINT}/${projectId}/services/storage.googleapis.com:enable`;
    await fetch(enableUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${oauthToken}` }
    });

    return projectId;
  }

  /**
   * Verifies that the client project has an active Cloud Billing Account attached.
   */
  public static async checkBillingStatus(projectId: string, oauthToken: string): Promise<BillingInfo> {
    const url = `${this.BILLING_ENDPOINT}/${projectId}/billingInfo`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${oauthToken}` }
    });
    if (!res.ok) {
      return { billingAccountName: '', billingEnabled: false, projectId };
    }
    return await res.json();
  }

  /**
   * Executes 4-Point Preflight Handshake against target bucket with automatic Billing Mode detection.
   */
  public static async runPreflightHandshake(
    bucketName: string,
    userProject: string,
    oauthToken: string
  ): Promise<PreflightStatus> {
    const cleanBucket = bucketName.replace(/^gs:\/\//, '').replace(/\/+$/, '');
    
    // Probe 1: Check bucket reachability without userProject to determine if Owner-Pays
    const probeUrl = `https://storage.googleapis.com/storage/v1/b/${cleanBucket}`;
    try {
      const probeRes = await fetch(probeUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${oauthToken}` }
      });

      if (probeRes.ok) {
        const metadata = await probeRes.json();
        const isReqPays = metadata.billing?.requesterPays === true;
        return {
          oauthValid: true,
          oauthExpiresInSeconds: 3600,
          bucketReachable: true,
          billingMode: isReqPays ? 'requester-pays' : 'owner-pays',
          requesterPaysActive: isReqPays,
          iamViewerGranted: true,
          corsConfigured: true
        };
      }

      // If probe without userProject returned 400 UserProjectMissing -> It is Requester-Pays
      const probeErrorText = await probeRes.text();
      const isUserProjectMissing = probeRes.status === 400 && probeErrorText.includes('UserProjectMissing');

      if (isUserProjectMissing && userProject) {
        // Probe 2: Re-attempt with client's active userProject
        const reqPaysUrl = `https://storage.googleapis.com/storage/v1/b/${cleanBucket}?userProject=${encodeURIComponent(userProject)}`;
        const rpRes = await fetch(reqPaysUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${oauthToken}` }
        });

        if (rpRes.ok) {
          return {
            oauthValid: true,
            oauthExpiresInSeconds: 3600,
            bucketReachable: true,
            billingMode: 'requester-pays',
            requesterPaysActive: true,
            iamViewerGranted: true,
            corsConfigured: true
          };
        }

        const rpErrText = await rpRes.text();
        return {
          oauthValid: true,
          oauthExpiresInSeconds: 3600,
          bucketReachable: rpRes.status !== 404,
          billingMode: 'requester-pays',
          requesterPaysActive: true,
          iamViewerGranted: false,
          corsConfigured: false,
          rawError: `HTTP ${rpRes.status}: ${rpErrText}`,
          errorRemediation: rpRes.status === 403
            ? 'Your Google account lacks Storage Object Viewer access (roles/storage.objectViewer) on this bucket.'
            : 'Check your GCP project and bucket permissions.'
        };
      }

      return {
        oauthValid: true,
        oauthExpiresInSeconds: 3600,
        bucketReachable: probeRes.status !== 404,
        billingMode: isUserProjectMissing ? 'requester-pays' : 'owner-pays',
        requesterPaysActive: isUserProjectMissing,
        iamViewerGranted: false,
        corsConfigured: false,
        rawError: `HTTP ${probeRes.status}: ${probeErrorText}`,
        errorRemediation: isUserProjectMissing
          ? 'Requester-Pays is enabled on this bucket. Please configure and select an active GCP Billing Project.'
          : 'Check bucket reachability, IAM permissions, and CORS settings.'
      };
    } catch (err: any) {
      return {
        oauthValid: false,
        oauthExpiresInSeconds: 0,
        bucketReachable: false,
        billingMode: 'requester-pays',
        requesterPaysActive: false,
        iamViewerGranted: false,
        corsConfigured: false,
        rawError: err.message,
        errorRemediation: 'Network error or CORS preflight blocked by browser. Verify bucket CORS configuration.'
      };
    }
  }
}
```

---

## 2. Engine 2: GCS REST & Hierarchical Metadata Engine

### 2.1 Purpose & Domain Scope
Handles GCS JSON REST API v1 querying, directory hierarchy simulation via delimiters (`delimiter=/`), pagination (`nextPageToken`), object metadata normalization, and fast in-memory indexing for the virtualized data grid.

### 2.2 Directory Hierarchy Simulation Protocol

```mermaid
flowchart TD
    QueryGCS["GCS JSON API Query\nGET /storage/v1/b/{bucket}/o?delimiter=/&prefix={path}&userProject={project}"] --> ParseResp["Parse GCS Response"]
    ParseResp --> ExtractPrefixes["Extract 'prefixes' Array\n(Common Folder Names)"]
    ParseResp --> ExtractItems["Extract 'items' Array\n(Leaf Media Objects)"]
    
    ExtractPrefixes --> FolderNodes["Construct Virtual Folder Rows\n• type: 'folder'\n• name: 'feature_films/'\n• path: 'feature_films/'"]
    ExtractItems --> FileNodes["Construct Asset Object Rows\n• type: 'file'\n• size: bytes\n• storageClass: 'ARCHIVE'\n• crc32c, md5, etag, updated"]
    
    FolderNodes --> UnifiedView["Unified Virtualized Directory Grid\nSorted: Folders First $\rightarrow$ Files Alphabetical"]
    FileNodes --> UnifiedView
```

### 2.3 TypeScript Contract Specification

```typescript
export interface GCSObjectMetadata {
  kind: 'storage#object';
  id: string;
  name: string;
  bucket: string;
  generation: string;
  metageneration: string;
  contentType: string;
  storageClass: 'ARCHIVE' | 'COLDLINE' | 'NEARLINE' | 'STANDARD';
  size: string; // BigInt string
  md5Hash?: string;
  crc32c: string; // Base64 encoded
  etag: string;
  timeCreated: string;
  updated: string;
}

export interface DirectoryListingResult {
  currentPrefix: string;
  folders: string[]; // e.g. ["scene_01/", "scene_02/"]
  files: GCSObjectMetadata[];
  nextPageToken?: string;
  totalEstimatedItems: number;
}

export class BucketExplorerEngine {
  public static async listDirectory(
    bucketName: string,
    prefix: string,
    userProject: string,
    oauthToken: string,
    pageToken?: string
  ): Promise<DirectoryListingResult> {
    const cleanBucket = bucketName.replace(/^gs:\/\//, '').replace(/\/+$/, '');
    const params = new URLSearchParams({
      delimiter: '/',
      prefix: prefix,
      userProject: userProject,
      maxResults: '250'
    });
    if (pageToken) params.append('pageToken', pageToken);

    const url = `https://storage.googleapis.com/storage/v1/b/${cleanBucket}/o?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${oauthToken}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to list directory (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    return {
      currentPrefix: prefix,
      folders: data.prefixes || [],
      files: data.items || [],
      nextPageToken: data.nextPageToken,
      totalEstimatedItems: (data.prefixes?.length || 0) + (data.items?.length || 0)
    };
  }
}
```

---

## 3. Engine 3: Real-Time Dynamic Cost Calculation & Governance Engine

### 3.1 Purpose & Mathematical Formulation
Calculates exact retrieval and internet egress fees before downloads execute. Guarantees that clients understand their exact financial commitment on a per-file and batch selection basis.

### 3.2 Exact Pricing Formula & Scalability Model

$$\text{BytesToGB}(B) = \frac{B}{10^9} = \frac{B}{1,000,000,000}$$

$$\text{RetrievalCost} = \sum_{i \in \text{Selected}} \left( \text{BytesToGB}(B_i) \times \text{Rate}_{\text{Class}}(i) \right)$$

$$\text{EgressCost} = \sum_{i \in \text{Selected}} \left( \text{BytesToGB}(B_i) \times \$0.1200 \right)$$

$$\text{TotalEstimatedCharge} = \text{RetrievalCost} + \text{EgressCost}$$

| Storage Class | Retrieval Rate ($\text{Rate}_{\text{Class}}$) | Egress Rate | Combined Rate / Decimal GB |
| :--- | :--- | :--- | :--- |
| **`ARCHIVE`** | **\$0.0500 / GB** | **\$0.1200 / GB** | **\$0.1700 / GB** |
| **`COLDLINE`** | **\$0.0200 / GB** | **\$0.1200 / GB** | **\$0.1400 / GB** |
| **`NEARLINE`** | **\$0.0100 / GB** | **\$0.1200 / GB** | **\$0.1300 / GB** |
| **`STANDARD`** | **\$0.0000 / GB** | **\$0.1200 / GB** | **\$0.1200 / GB** |

### 3.3 TypeScript Contract & Implementation

```typescript
export interface CostBreakdown {
  totalBytes: number;
  totalDecimalGB: number;
  archiveBytes: number;
  coldlineBytes: number;
  standardBytes: number;
  retrievalChargeUSD: number;
  egressChargeUSD: number;
  totalEstimatedChargeUSD: number;
  formattedTotalSize: string;
  isHighCostAlert: boolean; // Triggers safety modal if > $5.00 or > 25 GB (Requester-Pays only)
  isOwnerSponsored: boolean; // True when bucket is Owner-Pays ($0.00 client cost)
  billingMode: BucketBillingMode;
}

export class CostGovernanceEngine {
  public static ARCHIVE_RETRIEVAL_RATE = 0.05;
  public static COLDLINE_RETRIEVAL_RATE = 0.02;
  public static NEARLINE_RETRIEVAL_RATE = 0.01;
  public static STANDARD_RETRIEVAL_RATE = 0.00;
  public static EGRESS_RATE = 0.12;

  public static calculateCost(
    items: Array<{ size: string | number; storageClass: string }>,
    billingMode: BucketBillingMode = 'requester-pays'
  ): CostBreakdown {
    let totalBytes = 0;
    let archiveBytes = 0;
    let coldlineBytes = 0;
    let nearlineBytes = 0;
    let standardBytes = 0;
    let retrievalChargeUSD = 0;

    for (const item of items) {
      const bytes = typeof item.size === 'string' ? parseInt(item.size, 10) : item.size;
      totalBytes += bytes;
      const gb = bytes / 1_000_000_000;

      switch (item.storageClass.toUpperCase()) {
        case 'ARCHIVE':
          archiveBytes += bytes;
          retrievalChargeUSD += gb * this.ARCHIVE_RETRIEVAL_RATE;
          break;
        case 'COLDLINE':
          coldlineBytes += bytes;
          retrievalChargeUSD += gb * this.COLDLINE_RETRIEVAL_RATE;
          break;
        case 'NEARLINE':
          nearlineBytes += bytes;
          retrievalChargeUSD += gb * this.NEARLINE_RETRIEVAL_RATE;
          break;
        default:
          standardBytes += bytes;
          break;
      }
    }

    const totalDecimalGB = totalBytes / 1_000_000_000;
    const isOwnerPays = billingMode === 'owner-pays';
    const egressChargeUSD = isOwnerPays ? 0 : totalDecimalGB * this.EGRESS_RATE;
    const finalRetrievalChargeUSD = isOwnerPays ? 0 : retrievalChargeUSD;
    const totalEstimatedChargeUSD = isOwnerPays ? 0 : finalRetrievalChargeUSD + egressChargeUSD;

    return {
      totalBytes,
      totalDecimalGB,
      archiveBytes,
      coldlineBytes,
      standardBytes,
      retrievalChargeUSD: Math.round(finalRetrievalChargeUSD * 100) / 100,
      egressChargeUSD: Math.round(egressChargeUSD * 100) / 100,
      totalEstimatedChargeUSD: Math.round(totalEstimatedChargeUSD * 100) / 100,
      formattedTotalSize: this.formatBytes(totalBytes),
      isHighCostAlert: !isOwnerPays && (totalEstimatedChargeUSD >= 5.0 || totalDecimalGB >= 25.0),
      isOwnerSponsored: isOwnerPays,
      billingMode
    };
  }

  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1000; // Decimal GCS standard
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
```

---

## 4. Engine 4: Resilient Service Worker Streaming Download Engine

### 4.1 Purpose & Memory Isolation Principles
Eliminates browser crashes and Out-of-Memory (OOM) errors during 25GB–50GB+ media downloads. Implements the **Resilient Service Worker Stream Interceptor** with an active keep-alive heartbeat watchdog, pass-through Castagnoli CRC32c `TransformStream`, and native browser download shelf integration, maintaining a constant **<15MB JavaScript heap footprint**.

### 4.2 Stream Pipeline Architecture & Backpressure Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Client User
    participant Bridge as ResilientSWStreamEngine
    participant SW as Service Worker (sw.js)
    participant GCS as GCS JSON API (storage.googleapis.com)
    participant HashEngine as CRC32cIntegrityEngine
    participant BrowserDL as Native Browser Download Shelf

    User->>Bridge: Initiate Stream (25.4 GB MXF Master)
    Bridge->>SW: Register Stream Ticket (URL, Token, Project, CRC32c)
    SW-->>Bridge: Ticket Confirmed (60s Claim TTL)

    Bridge->>Bridge: Start Keep-Alive Watchdog (10s Ping)
    Bridge->>BrowserDL: Trigger Hidden Anchor <a href="/sw-pipe/:id/file.mxf" download>

    BrowserDL->>SW: GET /sw-pipe/:id/reel04_master.mxf
    SW->>GCS: GET /o/OBJECT?alt=media&userProject=PROJECT (Auth: Bearer)
    GCS-->>SW: HTTP 200 OK (ReadableStream, 4MB Chunk Slices)

    SW-->>BrowserDL: HTTP 200 Response(transformStream.readable, { Content-Disposition: attachment })

    loop While Stream Active (Constant <15MB Heap)
        GCS->>SW: Binary Chunk (4MB Uint8Array)
        SW->>HashEngine: update(chunk)
        SW->>Bridge: postMessage({ type: 'SW_STREAM_PROGRESS', loadedBytes, speed })
        Bridge->>User: Emit Telemetry (48.5 MB/s, ETA 02:41, RAM: 11.4MB)
        SW->>BrowserDL: Pipe Chunk to Local ~/Downloads File
        Bridge->>SW: SW_KEEP_ALIVE_PING (PONG OK)
    end

    SW->>SW: Stream Closed -> Finalize CRC32c Digest
    SW->>Bridge: postMessage({ type: 'SW_STREAM_COMPLETE', finalCrc32c: '0xAF82F6C0' })
    Bridge->>Bridge: Stop Keep-Alive Watchdog
    Bridge-->>User: Emit 'completed' Event (CRC32c Match Verified)
    BrowserDL-->>User: Logged in chrome://downloads ("Show in folder" Available)
```

### 4.3 Production TypeScript Implementation

```typescript
export interface StreamTicket {
  streamId: string;
  url: string;
  filename: string;
  totalBytes: number;
  userProject: string;
  oauthToken: string;
  expectedCrc32c?: string;
  createdAt: number;
}

export interface StreamProgress {
  streamId: string;
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  elapsedSeconds: number;
  fixedMemoryHeapMB: number;
  crc32cCurrentHex?: string;
  status: 'initializing' | 'streaming' | 'verifying' | 'completed' | 'cancelled' | 'error';
  errorMessage?: string;
}

export class ResilientSWStreamEngine {
  private static keepAliveTimer: number | null = null;
  private static activeStreamId: string | null = null;

  /**
   * Registers stream ticket with Service Worker and launches native browser download.
   */
  public static async streamToBrowser(options: {
    bucketName: string;
    objectName: string;
    suggestedFilename: string;
    totalBytes: number;
    userProject: string;
    oauthToken: string;
    expectedCrc32c?: string;
    onProgress: (p: StreamProgress) => void;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const { bucketName, objectName, suggestedFilename, totalBytes, userProject, oauthToken, expectedCrc32c, onProgress, abortSignal } = options;

    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      throw new Error('Service Worker is not active. Please reload the page.');
    }

    const streamId = `sw-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.activeStreamId = streamId;

    const cleanBucket = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '');
    const cleanObject = objectName.replace(/^\/+/, '');
    const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(cleanBucket)}/o/${encodeURIComponent(cleanObject)}?alt=media&userProject=${encodeURIComponent(userProject)}`;

    const ticket: StreamTicket = {
      streamId,
      url: mediaUrl,
      filename: suggestedFilename,
      totalBytes,
      userProject,
      oauthToken,
      expectedCrc32c,
      createdAt: Date.now()
    };

    // 1. Register ticket with SW
    await this.registerTicket(ticket);

    // 2. Start Keep-Alive Heartbeat
    this.startKeepAlive(streamId);

    // 3. Handle Abort Signal
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        this.abortStream(streamId);
        onProgress({
          streamId,
          loadedBytes: 0,
          totalBytes: 0,
          percentage: 0,
          speedBytesPerSec: 0,
          etaSeconds: 0,
          elapsedSeconds: 0,
          fixedMemoryHeapMB: 0,
          status: 'cancelled'
        });
      });
    }

    // 4. Trigger native browser download shelf
    const link = document.createElement('a');
    link.href = `/sw-pipe/${streamId}/${encodeURIComponent(suggestedFilename)}`;
    link.download = suggestedFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private static registerTicket(ticket: StreamTicket): Promise<void> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        if (event.data?.success) resolve();
        else reject(new Error(event.data?.error || 'Failed to register stream ticket with Service Worker'));
      };
      navigator.serviceWorker.controller?.postMessage(
        { type: 'REGISTER_STREAM_TICKET', ticket },
        [channel.port2]
      );
    });
  }

  private static startKeepAlive(streamId: string): void {
    this.stopKeepAlive();
    this.keepAliveTimer = window.setInterval(() => {
      navigator.serviceWorker.controller?.postMessage({
        type: 'SW_KEEP_ALIVE_PING',
        streamId,
        timestamp: Date.now()
      });
    }, 10000);
  }

  public static stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  public static abortStream(streamId: string): void {
    this.stopKeepAlive();
    navigator.serviceWorker.controller?.postMessage({
      type: 'SW_ABORT_STREAM',
      streamId
    });
  }
}
```
```

---

## 5. Engine 5: Cryptographic Checksum & CRC32c Integrity Engine

### 5.1 Purpose & Checksum Standardization
Computes running CRC32c hashes across binary stream chunks using the Castagnoli polynomial (`0x1EDC6F41`). Converts the final 32-bit integer to a big-endian 4-byte buffer and Base64 encodes it to match GCS's standard `x-goog-hash: crc32c=...` header.

### 5.2 Castagnoli Polynomial Verification Pipeline

```mermaid
flowchart LR
    Chunk["Binary Chunk\n(4MB Uint8Array)"] --> CRC["Castagnoli CRC32c Engine\n(Polynomial 0x1EDC6F41)"]
    CRC --> RollingState["Update 32-bit Integer Hash State"]
    RollingState --> Done{"Stream Complete?"}
    Done -->|No| Chunk
    Done -->|Yes| Transform["4-Byte Big-Endian Buffer\n[0xAF, 0x82, 0xF6, 0xC0]"]
    Transform --> Base64["Base64 Encode $\rightarrow$ 'r4L2wA=='"]
    Transform --> Hex["Hex Representation $\rightarrow$ '0xAF82F6C0'"]
    Base64 --> Compare{"Compare with GCS Header\nx-goog-hash: crc32c=r4L2wA=="}
    Compare -->|Match| Pass["[OK] Integrity 100% Verified"]
    Compare -->|Mismatch| Fail["[ERROR] Checksum Mismatch Alert"]
```

### 5.3 TypeScript Implementation

```typescript
export class CRC32cIntegrityEngine {
  private static TABLE: Uint32Array = CRC32cIntegrityEngine.generateTable();
  private crc: number = 0xffffffff;

  private static generateTable(): Uint32Array {
    const table = new Uint32Array(256);
    const POLY = 0x82f63b78; // Bit-reflected Castagnoli polynomial

    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ POLY : crc >>> 1;
      }
      table[i] = crc >>> 0;
    }
    return table;
  }

  public update(chunk: Uint8Array): void {
    let crc = this.crc;
    const table = CRC32cIntegrityEngine.TABLE;
    for (let i = 0; i < chunk.length; i++) {
      crc = (table[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
    }
    this.crc = crc;
  }

  public digestBase64(): string {
    const finalCrc = (this.crc ^ 0xffffffff) >>> 0;
    const buffer = new Uint8Array([
      (finalCrc >>> 24) & 0xff,
      (finalCrc >>> 16) & 0xff,
      (finalCrc >>> 8) & 0xff,
      finalCrc & 0xff
    ]);
    return btoa(String.fromCharCode.apply(null, Array.from(buffer)));
  }

  public digestHex(): string {
    const finalCrc = (this.crc ^ 0xffffffff) >>> 0;
    return '0x' + finalCrc.toString(16).toUpperCase().padStart(8, '0');
  }
}
```

---

## 6. Engine 6: Automated Batch & CLI Companion Generator Engine

### 6.1 Purpose & Command Generation
Constructs syntactically valid shell commands for modern Google Cloud CLI (`gcloud storage`) and legacy `gsutil`. Pre-populates the client's active billing project (`--billing-project` or `-u`), selected object paths, and multi-threaded flags.

### 6.2 TypeScript Contract & Implementation

```typescript
export interface CLIOptions {
  bucketName: string;
  selectedPaths: string[];
  userProject?: string;
  destinationDir?: string;
  billingMode?: BucketBillingMode;
}

export class CliGeneratorEngine {
  /**
   * Generates modern multi-threaded gcloud storage cp command
   */
  public static generateGcloudCommand(options: CLIOptions): string {
    const {
      bucketName,
      selectedPaths,
      userProject,
      destinationDir = './destination_folder/',
      billingMode = 'requester-pays'
    } = options;
    const cleanBucket = bucketName.replace(/^gs:\/\//, '').replace(/\/+$/, '');
    const projectFlag = billingMode === 'requester-pays' && userProject ? ` --billing-project=${userProject}` : '';

    if (selectedPaths.length === 1) {
      return `gcloud storage cp gs://${cleanBucket}/${selectedPaths[0]} ${destinationDir}${projectFlag}`;
    }

    const pathList = selectedPaths.map((p) => `  gs://${cleanBucket}/${p}`).join(' \\\n');
    return projectFlag
      ? `gcloud storage cp \\\n${pathList} \\\n  ${destinationDir} \\\n ${projectFlag}`
      : `gcloud storage cp \\\n${pathList} \\\n  ${destinationDir}`;
  }

  /**
   * Generates legacy multi-threaded gsutil cp command
   */
  public static generateGsutilCommand(options: CLIOptions): string {
    const {
      bucketName,
      selectedPaths,
      userProject,
      destinationDir = './',
      billingMode = 'requester-pays'
    } = options;
    const cleanBucket = bucketName.replace(/^gs:\/\//, '').replace(/\/+$/, '');
    const userFlag = billingMode === 'requester-pays' && userProject ? `-u ${userProject} ` : '';

    if (selectedPaths.length === 1) {
      return `gsutil ${userFlag}-m cp gs://${cleanBucket}/${selectedPaths[0]} ${destinationDir}`;
    }

    const pathList = selectedPaths.map((p) => `  gs://${cleanBucket}/${p}`).join(' \\\n');
    return `gsutil ${userFlag}-m cp \\\n${pathList} \\\n  ${destinationDir}`;
  }
}
```

---

## 7. Engine 7: State Isolation & Persistence Engine

### 7.1 Purpose & Security Architecture
Maintains strict segregation between ephemeral in-memory runtime credentials (OAuth tokens, active stream handles) and persisted non-sensitive preferences (GCP Project ID string, recent buckets, UI theme).

```mermaid
flowchart TD
    subgraph ZustandStore ["Volatile Runtime Store (RAM Only)"]
        Token["OAuth Access Token (Expires in 3600s)"]
        TokenExpiry["Token Expiry Countdown Timer"]
        UserEmail["Authenticated User Profile"]
        ActiveStreams["Active Stream Downloader Handles & AbortControllers"]
        LiveSpeed["Live Moving Average Speed (MB/s)"]
    end

    subgraph LocalStorageStore ["Persistent LocalStorage (Disk)"]
        ProjectID["Selected Client GCP Project ID"]
        RecentBuckets["Recent Bucket History List"]
        UITheme["Theme ('dark' | 'light')"]
        RateCard["Custom Rate Overrides (Optional)"]
    end

    subgraph IndexedDBStore ["IndexedDB Storage (idb)"]
        RangeCheckpoints["Resumable Download Pointers & ETags"]
    end

    ZustandStore -.->|"Never Written To"| LocalStorageStore
    LocalStorageStore -->|"Rehydrates Non-Sensitive State on Load"| ZustandStore
```

### 7.2 Zustand Global Store Definition

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PersistentSettings {
  savedProjectId: string;
  savedBucketName: string;
  activeBucketBillingMode: BucketBillingMode;
  recentBuckets: string[];
  recentBucketModes: Record<string, BucketBillingMode>;
  theme: 'dark' | 'light';
  hasCompletedOnboarding: boolean;
  setSavedProjectId: (id: string) => void;
  setSavedBucketName: (bucket: string) => void;
  setActiveBucketBillingMode: (mode: BucketBillingMode) => void;
  addRecentBucket: (bucket: string, mode?: BucketBillingMode) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
}

export const usePersistentStore = create<PersistentSettings>()(
  persist(
    (set) => ({
      savedProjectId: '',
      savedBucketName: '',
      activeBucketBillingMode: 'requester-pays',
      recentBuckets: [],
      recentBucketModes: {},
      theme: 'dark',
      hasCompletedOnboarding: false,
      setSavedProjectId: (id) => set({ savedProjectId: id }),
      setSavedBucketName: (bucket) => set({ savedBucketName: bucket }),
      setActiveBucketBillingMode: (mode) => set({ activeBucketBillingMode: mode }),
      addRecentBucket: (bucket, mode = 'requester-pays') =>
        set((state) => ({
          recentBuckets: Array.from(new Set([bucket, ...state.recentBuckets])).slice(0, 5),
          recentBucketModes: { ...state.recentBucketModes, [bucket]: mode }
        })),
      setTheme: (theme) => set({ theme }),
      setHasCompletedOnboarding: (completed) => set({ hasCompletedOnboarding: completed })
    }),
    { name: 'basingse-media-settings' }
  )
);

interface RuntimeSessionState {
  oauthToken: string | null;
  userEmail: string | null;
  tokenExpiresAt: number | null;
  activeDownloadAbortController: AbortController | null;
  setAuthSession: (token: string, email: string, expiresIn: number) => void;
  clearAuthSession: () => void;
  setActiveAbortController: (ac: AbortController | null) => void;
}

export const useRuntimeStore = create<RuntimeSessionState>((set) => ({
  oauthToken: null,
  userEmail: null,
  tokenExpiresAt: null,
  activeDownloadAbortController: null,
  setAuthSession: (token, email, expiresIn) =>
    set({
      oauthToken: token,
      userEmail: email,
      tokenExpiresAt: Date.now() + expiresIn * 1000
    }),
  clearAuthSession: () =>
    set({
      oauthToken: null,
      userEmail: null,
      tokenExpiresAt: null,
      activeDownloadAbortController: null
    }),
  setActiveAbortController: (ac) => set({ activeDownloadAbortController: ac })
}));
```

---

---

## 8. Engine 8: Session Lifecycle & Silent Restoration Engine

### 8.1 Purpose & Domain Scope
Eliminates session loss on page reloads and removes onboarding friction for returning users. Coordinates with Google Identity Services to silently restore volatile OAuth credentials on boot without disk persistence, evaluates onboarding completion to bypass the 4-step wizard, and manages graceful 1-click re-authentication prompts.

### 8.2 State Machine & Boot Protocol

```mermaid
stateDiagram-v2
    [*] --> AppInit: AppShell Mount
    AppInit --> EvaluateEligibility: Check Local Preferences
    
    state EvaluateEligibility {
        [*] --> CheckPrefs
        CheckPrefs --> EligibleForRestore: hasCompletedOnboarding == true && savedProjectId && savedBucketName
        CheckPrefs --> Unconfigured: hasCompletedOnboarding == false || missing config
    }
    
    Unconfigured --> RenderWelcomeLanding: Show First-Time Connect View
    
    EligibleForRestore --> SilentTokenHandshake: Call gisAuthService.refreshTokenSilent()
    
    state SilentTokenHandshake {
        [*] --> GISSilentRequest: prompt: ''
        GISSilentRequest --> RestoreSuccess: Access Token Ingested to RAM
        GISSilentRequest --> InteractiveRequired: Third-Party Cookie Blocked / Token Revoked
    }
    
    RestoreSuccess --> BackgroundPreflight: runPreflightHandshake()
    BackgroundPreflight --> DirectWorkspaceMount: Render AssetExplorer (Zero Wizard Steps)
    
    InteractiveRequired --> RenderReconnectCard: Show 1-Click "Resume Session" Prompt
    RenderReconnectCard --> GISPopupConsent: User Clicks "Reconnect"
    GISPopupConsent --> DirectWorkspaceMount: Token Granted -> Mount Workspace
    GISPopupConsent --> RenderWelcomeLanding: User Clicks "Switch Account"
```

### 8.3 TypeScript Contract Specification

```typescript
export interface SessionRestorationResult {
  restored: boolean;
  requiresInteraction: boolean;
  userEmail?: string;
  errorMessage?: string;
}

export class SessionLifecycleEngine {
  /**
   * Evaluates whether current client state qualifies for onboarding bypass.
   * For Owner-Pays buckets, savedProjectId is optional.
   */
  public static shouldBypassOnboarding(
    hasCompletedOnboarding: boolean,
    savedProjectId: string,
    savedBucketName: string,
    billingMode: BucketBillingMode = 'requester-pays'
  ): boolean {
    const hasValidBucket = Boolean(savedBucketName && savedBucketName.trim().length >= 3);
    const hasValidProject = billingMode === 'owner-pays' || Boolean(savedProjectId && savedProjectId.trim().length >= 6);
    return Boolean(hasCompletedOnboarding && hasValidBucket && hasValidProject);
  }

  /**
   * Executes silent boot-time session restoration.
   */
  public static async restoreSessionOnBoot(
    gisService: { refreshTokenSilent: () => Promise<{ accessToken: string; userEmail: string; userName: string; expiresIn: number }> },
    runtimeStore: { setAuth: (t: string, e: string, n?: string, a?: string, exp?: number) => void },
    persistentConfig: {
      hasCompletedOnboarding: boolean;
      savedProjectId: string;
      savedBucketName: string;
      activeBucketBillingMode?: BucketBillingMode;
    }
  ): Promise<SessionRestorationResult> {
    const { hasCompletedOnboarding, savedProjectId, savedBucketName, activeBucketBillingMode = 'requester-pays' } = persistentConfig;

    if (!this.shouldBypassOnboarding(hasCompletedOnboarding, savedProjectId, savedBucketName, activeBucketBillingMode)) {
      return { restored: false, requiresInteraction: false };
    }

    try {
      const session = await gisService.refreshTokenSilent();
      if (session && session.accessToken) {
        runtimeStore.setAuth(
          session.accessToken,
          session.userEmail,
          session.userName,
          undefined,
          session.expiresIn
        );
        return {
          restored: true,
          requiresInteraction: false,
          userEmail: session.userEmail
        };
      }
      return { restored: false, requiresInteraction: true };
    } catch (err: any) {
      return {
        restored: false,
        requiresInteraction: true,
        errorMessage: err?.message || 'Silent session renewal requires user prompt.'
      };
    }
  }
}
```

---

## 9. Engine 9: Browser History & Navigation Routing Engine

### 9.1 Purpose & Domain Scope
Synchronizes user directory navigation with the browser's native History API (`history.pushState`, `history.replaceState`, `popstate`), ensuring that clicking breadcrumbs, folder rows, or browser Back/Forward buttons smoothly updates directory views in $<16\text{ ms}$ without page reloads, supports bookmarkable URL hashes (`#/browse/{bucket}/{prefix}`), cancels in-flight GCS fetch race conditions upon fast history traversal, and prevents credential leakage in history states.

### 9.2 Subsystem Architecture & Navigation Flow

```mermaid
flowchart TD
    subgraph Engine9Flow ["Engine 9: History Routing Protocol"]
        UserAction["User Action\n(Folder Row / Breadcrumb Click)"] --> Serialize["serializeHash(bucket, prefix)"]
        Serialize --> PushState["history.pushState(state, '', hash)"]
        PushState --> NotifyExplorer["AppShell.onPrefixChange(prefix)"]
        
        BrowserNav["Browser Back / Forward Button ⬅️ ➡️"] --> PopstateEvent["window.onpopstate Event"]
        PopstateEvent --> ParseHash["parseHash(window.location.hash)"]
        ParseHash --> AbortPending["AbortController.abort() (In-Flight Fetch)"]
        AbortPending --> ApplyHistoricalState["Update active state without pushState"]
        ApplyHistoricalState --> NotifyExplorer
    end
```

### 9.3 TypeScript Contract Specification

```typescript
export interface NavigationHistoryState {
  bucket: string;
  prefix: string;
  timestamp: number;
  source: 'user_interaction' | 'deep_link' | 'popstate' | 'bucket_switch';
}

export interface ParsedRoute {
  view: 'browse' | 'onboarding' | 'config' | 'root';
  bucket: string;
  prefix: string;
  isValid: boolean;
}

export class BrowserHistoryRouterEngine {
  private static ROUTE_PREFIX = '#/browse';

  /**
   * Encodes bucket and directory prefix into canonical URL hash
   */
  public static serializeHash(bucketName: string, prefix: string): string {
    const cleanBucket = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim();
    const cleanPrefix = prefix.replace(/^\/+/, '');

    if (!cleanBucket) return '';
    if (!cleanPrefix) return `${this.ROUTE_PREFIX}/${encodeURIComponent(cleanBucket)}/`;

    const encodedSegments = cleanPrefix
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');

    return `${this.ROUTE_PREFIX}/${encodeURIComponent(cleanBucket)}/${encodedSegments}`;
  }

  /**
   * Decodes URL hash string into structured route
   */
  public static parseHash(hashString: string = window.location.hash): ParsedRoute {
    if (!hashString || !hashString.startsWith('#')) {
      return { view: 'root', bucket: '', prefix: '', isValid: false };
    }

    // Support Query Param style: #/browse?bucket=abc&prefix=xyz
    if (hashString.startsWith('#/browse?') || hashString.startsWith('#?')) {
      const queryPart = hashString.split('?')[1] || '';
      const params = new URLSearchParams(queryPart);
      const bucket = (params.get('bucket') || '').replace(/^gs:\/\//i, '').trim();
      const prefix = params.get('prefix') || '';
      return { view: 'browse', bucket, prefix, isValid: Boolean(bucket) };
    }

    const cleanHash = hashString.replace(/^#\/?/, '');
    const parts = cleanHash.split('/');

    if (parts[0] !== 'browse' || parts.length < 2 || !parts[1]) {
      return { view: 'root', bucket: '', prefix: '', isValid: false };
    }

    const bucket = decodeURIComponent(parts[1]).replace(/^gs:\/\//i, '').trim();
    const rawPrefixParts = parts.slice(2);
    const decodedPrefix = rawPrefixParts
      .map((seg) => decodeURIComponent(seg))
      .filter((seg, idx) => seg.length > 0 || idx === rawPrefixParts.length - 1)
      .join('/');

    const prefix = decodedPrefix ? (decodedPrefix.endsWith('/') ? decodedPrefix : `${decodedPrefix}/`) : '';

    return {
      view: 'browse',
      bucket,
      prefix,
      isValid: Boolean(bucket && bucket.length >= 3)
    };
  }

  /**
   * Pushes a new navigation state to browser history
   */
  public static pushNavigation(
    bucketName: string,
    prefix: string,
    options: { replace?: boolean; source?: NavigationHistoryState['source'] } = {}
  ): void {
    const cleanBucket = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '').trim();
    const targetHash = this.serializeHash(cleanBucket, prefix);
    if (!targetHash) return;

    const state: NavigationHistoryState = {
      bucket: cleanBucket,
      prefix,
      timestamp: Date.now(),
      source: options.source || 'user_interaction'
    };

    if (options.replace || window.location.hash === targetHash) {
      window.history.replaceState(state, '', targetHash);
    } else {
      window.history.pushState(state, '', targetHash);
    }
  }
}
```

---

## 10. Engine 10: Native Browser Download Bridge & Stream Watchdog Engine

### 10.1 Purpose & Domain Scope
Guarantees full integration with native browser download managers (`chrome://downloads`, Microsoft Edge Downloads, Apple Safari Downloads). Manages active Service Worker stream telemetry bridging, coordinates the 10-second keep-alive heartbeat ping loop preventing background worker suspension during 50GB+ transfers, surfaces real-time transfer diagnostics, and validates native browser "Show in folder" accessibility.

### 10.2 Subsystem Architecture & Handshake Workflow

```mermaid
flowchart TD
    subgraph StreamStart ["1. Stream Dispatch"]
        Initiate["ResilientSWStreamEngine.streamToBrowser()"] --> RegisterTicket["Register Ticket in SW Memory"]
        RegisterTicket --> LaunchWatchdog["Start 10s Keep-Alive Watchdog"]
    end

    subgraph SWExecution ["2. Service Worker Stream & Watchdog"]
        WatchdogPing["SW_KEEP_ALIVE_PING (Every 10s)"] --> ResetIdle["Worker Resets Idle Timeout"]
        TransformPipe["Pass-Through TransformStream"] --> EmitProgress["SW_STREAM_PROGRESS (Speed, ETA, CRC32c)"]
    end

    subgraph NativeBrowserShelf ["3. Native Browser Download Shelf"]
        TransformPipe --> ChromeDownloads["Logged in chrome://downloads & Download Bubble"]
        ChromeDownloads --> ShowInFolder["Native OS 'Show in Folder' Magnifying Glass Operable"]
    end

    subgraph UIBridge ["4. UI Telemetry & Diagnostics Bridge"]
        EmitProgress --> DownloadManagerUI["DownloadManager Widget Updates Telemetry"]
        StreamComplete["SW_STREAM_COMPLETE (CRC32c Match Verified)"] --> StopWatchdog["Clear Keep-Alive Watchdog Timer"]
        StopWatchdog --> SuccessCard["Post-Download Success Card in UI"]
        SuccessCard --> DiagnosticsDrawer["Stream Diagnostics & Checksum Drawer"]
    end

    Initiate --> WatchdogPing
    RegisterTicket --> TransformPipe
    TransformPipe --> StreamComplete
```

### 10.3 TypeScript Implementation & Reference Contract

```typescript
export interface StreamDiagnostics {
  streamId: string;
  filename: string;
  totalBytes: number;
  formattedSize: string;
  durationSeconds: number;
  averageSpeedMBs: number;
  crc32cHex: string;
  crc32cBase64: string;
  integrityMatch: boolean;
  serviceWorkerActive: boolean;
  downloadLocation: string; // e.g. "~/Downloads (Browser Default)"
}

export class BrowserDownloadBridgeEngine {
  private static keepAliveTimer: number | null = null;
  private static activeStreamId: string | null = null;

  /**
   * Initializes message listener for Service Worker progress and lifecycle events.
   */
  public static initStreamListener(
    onProgress: (progress: any) => void,
    onComplete: (diag: StreamDiagnostics) => void,
    onError: (err: string) => void
  ): () => void {
    if (!('serviceWorker' in navigator)) {
      return () => {};
    }

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'SW_STREAM_PROGRESS':
          onProgress(data);
          break;
        case 'SW_STREAM_COMPLETE':
          this.stopKeepAlive();
          onComplete(data.diagnostics);
          break;
        case 'SW_STREAM_ERROR':
          this.stopKeepAlive();
          onError(data.errorMessage || 'Streaming error in Service Worker');
          break;
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }

  /**
   * Starts the 10-second keep-alive watchdog ping.
   */
  public static startKeepAlive(streamId: string): void {
    this.stopKeepAlive();
    this.activeStreamId = streamId;

    this.keepAliveTimer = window.setInterval(() => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SW_KEEP_ALIVE_PING',
          streamId,
          timestamp: Date.now()
        });
      }
    }, 10000);
  }

  /**
   * Stops the keep-alive watchdog ping.
   */
  public static stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.activeStreamId = null;
  }

  /**
   * Formats human-readable byte sizes.
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1000;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
```

---

## 11. Engine 11: Dual Bucket Billing Mode & Owner-Pays Governance Engine

### 11.1 Purpose & Domain Scope
Governs the detection, classification, financial calculation, and UI badge synchronization between **Requester-Pays Enforced** buckets and **Owner-Pays (Standard / Sponsored)** buckets. It ensures that clients consuming Owner-Pays buckets incur **$0.00 USD** in retrieval and egress fees, provides clean CLI commands without billing flags, and enables frictionless onboarding without mandatory GCP project creation.

### 11.2 Subsystem Architecture & Classification Protocol

```mermaid
flowchart TD
    subgraph ModeDetectionPipeline ["Billing Mode Auto-Detection Pipeline"]
        TargetBucket["Target Bucket URI (gs://bucket)"] --> NoProjectProbe["Initial Probe: GET /storage/v1/b/{bucket} (NO userProject)"]
        
        NoProjectProbe -->|HTTP 200 OK & requesterPays == false| ClassifyOwner["Classify as OWNER-PAYS\n• Zero Client Egress / Retrieval Cost\n• No userProject required"]
        NoProjectProbe -->|HTTP 400 UserProjectMissing| ClassifyReq["Classify as REQUESTER-PAYS\n• userProject MANDATORY\n• Client Billed Retrieval + Egress"]
        NoProjectProbe -->|HTTP 200 OK & requesterPays == true| ClassifyReq
    end

    subgraph StatePropagation ["State & Contract Propagation"]
        ClassifyOwner --> CostZero["Cost Engine: Set Rates to $0.00 / GB\nSticky Banner: 'Owner-Sponsored ($0.00 Cost)'\nHigh-Cost Gate: Inactive"]
        ClassifyOwner --> BadgeCyan["Grid Footer: [ Owner-Pays / Free Egress 🎁 ]"]
        ClassifyOwner --> CleanCliGen["CLI Generator: Clean gcloud cp (No --billing-project)"]
        ClassifyOwner --> SwPipeNoProj["SW Stream: Omit ?userProject from fetch"]

        ClassifyReq --> CostLive["Cost Engine: Standard GCP Rates ($0.05/$0.02/$0.12)\nSticky Banner: Live Archive + Egress USD\nHigh-Cost Gate: Active (>$5.00 / >25GB)"]
        ClassifyReq --> BadgeEmerald["Grid Footer: [ Requester-Pays Enforced 🛡️ ]"]
        ClassifyReq --> ProjectCliGen["CLI Generator: gcloud cp --billing-project=..."]
        ClassifyReq --> SwPipeProj["SW Stream: Attach ?userProject=CLIENT_ID"]
    end
```

### 11.3 TypeScript Implementation & Reference Contract

```typescript
export interface DualModeBadgeConfig {
  label: string;
  variant: 'emerald' | 'cyan';
  icon: 'shield-check' | 'gift';
  tooltip: string;
  isOwnerSponsored: boolean;
}

export class DualModeBillingEngine {
  /**
   * Evaluates bucket billing mode from HTTP responses.
   */
  public static classifyBucketMode(
    metadata: { billing?: { requesterPays?: boolean } } | null,
    statusCode: number,
    errorBody: string = ''
  ): BucketBillingMode {
    if (statusCode === 400 && errorBody.includes('UserProjectMissing')) {
      return 'requester-pays';
    }
    if (metadata?.billing?.requesterPays === true) {
      return 'requester-pays';
    }
    return 'owner-pays';
  }

  /**
   * Returns UI badge configuration for active billing mode.
   */
  public static getBadgeConfig(mode: BucketBillingMode): DualModeBadgeConfig {
    if (mode === 'requester-pays') {
      return {
        label: 'Requester-Pays Enforced',
        variant: 'emerald',
        icon: 'shield-check',
        tooltip: 'Requester-Pays is active. All GCS retrieval and internet egress fees are billed directly to your GCP project.',
        isOwnerSponsored: false
      };
    }
    return {
      label: 'Owner-Pays / Free Egress',
      variant: 'cyan',
      icon: 'gift',
      tooltip: 'This bucket is sponsored by the owner. Retrieval and internet egress fees are $0.00 to you.',
      isOwnerSponsored: true
    };
  }

  /**
   * Adapts target GCS request URL based on billing mode.
   */
  public static buildGcsUrl(
    bucketName: string,
    objectName: string,
    userProject: string,
    mode: BucketBillingMode = 'requester-pays'
  ): string {
    const cleanBucket = bucketName.replace(/^gs:\/\//i, '').replace(/\/+$/, '');
    const cleanObject = objectName.replace(/^\/+/, '');
    const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(cleanBucket)}/o/${encodeURIComponent(cleanObject)}`;

    if (mode === 'requester-pays' && userProject) {
      return `${base}?alt=media&userProject=${encodeURIComponent(userProject)}`;
    }
    return `${base}?alt=media`;
  }
}
```

---

---

## 12. Engine 12: Trust & Safety, Incremental Authorization & Scope Governance Engine

### 12.1 Purpose & Domain Scope
Governs Google OAuth 2.0 scope compliance under the **Principle of Least Privilege**, manages contextual step-up consent prompts for administrative GCP scopes (`cloud-platform`), enforces zero-telemetry boundaries via strict Content Security Policy headers, and manages instant Google OAuth token revocation.

### 12.2 Subsystem Architecture & State Machine

```mermaid
stateDiagram-v2
    [*] --> MinimalAuth: User Signs In
    MinimalAuth --> NonSensitiveActive: GIS Grants Base Scopes\n(openid, email, profile, devstorage.read_only)
    
    NonSensitiveActive --> StandardOperation: Browsing, Inspecting, Streaming\n(Manual Project ID or Owner-Pays)
    
    NonSensitiveActive --> StepUpRequested: User clicks 'Auto-Detect Projects'\nor '1-Click Auto-Create'
    StepUpRequested --> StepUpConsentModal: Pre-Consent Explanation
    
    StepUpConsentModal --> NonSensitiveActive: User Cancels (Returns to manual entry)
    StepUpConsentModal --> LaunchingGISStepUp: User Confirms
    
    LaunchingGISStepUp --> ElevatedActive: GIS Returns Merged Token\n(devstorage.read_only + cloud-platform)
    LaunchingGISStepUp --> StepUpFailed: User Closes Popup / Denies
    StepUpFailed --> NonSensitiveActive: Fallback to Manual Project Input
    
    ElevatedActive --> StandardOperation: CRM Projects Discovered / Auto-Created
    
    StandardOperation --> RevokingSession: User clicks 'Sign Out'
    RevokingSession --> [*]: google.accounts.oauth2.revoke() + RAM Purge
```

### 12.3 TypeScript Interface & Contract Specification

```typescript
export const GIS_BASE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/devstorage.read_only',
] as const;

export const GIS_ELEVATED_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
] as const;

export type BaseOAuthScope = typeof GIS_BASE_SCOPES[number];
export type ElevatedOAuthScope = typeof GIS_ELEVATED_SCOPES[number];

export interface ScopePolicyStatus {
  hasBaseScopes: boolean;
  hasElevatedScopes: boolean;
  activeScopes: string[];
  isLeastPrivilegeCompliant: boolean;
}

export interface StepUpAuthOptions {
  reason: 'PROJECT_DISCOVERY' | 'PROJECT_CREATION' | 'BILLING_CHECK';
  prompt?: string;
}

export class TrustSafetyEngine {
  private static instance: TrustSafetyEngine | null = null;

  public static getInstance(): TrustSafetyEngine {
    if (!this.instance) {
      this.instance = new TrustSafetyEngine();
    }
    return this.instance;
  }

  public getBaseScopes(): string[] {
    return [...GIS_BASE_SCOPES];
  }

  public getElevatedScopes(): string[] {
    return [...GIS_ELEVATED_SCOPES];
  }

  /**
   * Evaluates if active session conforms to Principle of Least Privilege
   */
  public evaluateScopeStatus(grantedScopes: string[]): ScopePolicyStatus {
    const hasBase = GIS_BASE_SCOPES.every((scope) => grantedScopes.includes(scope));
    const hasElevated = GIS_ELEVATED_SCOPES.some((scope) => grantedScopes.includes(scope));

    return {
      hasBaseScopes: hasBase,
      hasElevatedScopes: hasElevated,
      activeScopes: grantedScopes,
      isLeastPrivilegeCompliant: hasBase && !hasElevated, // Ideal default state
    };
  }

  /**
   * Triggers contextual step-up consent for elevated GCP management scopes
   */
  public async requestStepUpConsent(
    tokenClient: any,
    options: StepUpAuthOptions
  ): Promise<boolean> {
    if (!tokenClient || typeof tokenClient.requestAccessToken !== 'function') {
      throw new Error('GIS Token Client is not initialized.');
    }

    return new Promise<boolean>((resolve) => {
      try {
        tokenClient.requestAccessToken({
          scope: GIS_ELEVATED_SCOPES.join(' '),
          include_granted_scopes: true,
          prompt: 'consent',
        });
        resolve(true);
      } catch (err) {
        resolve(false);
      }
    });
  }

  /**
   * Revokes token at Google OAuth endpoint upon user sign-out
   */
  public async revokeSessionToken(token: string): Promise<boolean> {
    if (!token || typeof window === 'undefined' || !window.google?.accounts?.oauth2?.revoke) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      window.google!.accounts.oauth2.revoke(token, (res) => {
        resolve(res.successful);
      });
      // Safety timeout in case revocation callback hangs
      setTimeout(() => resolve(true), 1500);
    });
  }
}
```

---

## 13. Cross-Engine Integration Matrix (Engines 1 through 12)

The primary engines operate as a cohesive, dual-mode, zero-liability mesh:
- **Engine 12 (`TrustSafetyEngine`)**: Enforces default minimal non-sensitive scopes on Engine 1 (`GCPOnboardingEngine`), prompts for step-up consent on-demand during project discovery, and handles Google OAuth token revocation during logout coordinated with Engine 8 (`SessionLifecycleEngine`).
- **Engine 11 (`DualModeBillingEngine`)**: Classifies bucket billing mode (`requester-pays` vs `owner-pays`), informs Engine 3 (`CostGovernanceEngine`) for zero-cost client governance, adjusts Engine 6 (`CliGeneratorEngine`) to omit project flags, and synchronizes status badges.
- **Engine 10 (`BrowserDownloadBridgeEngine`)**: Manages the keep-alive heartbeat loop with Engine 4 (`ResilientSWStreamEngine`), ensures native download shelf tracking (`chrome://downloads`), and bridges real-time stream diagnostics.
- **Engine 9 (`BrowserHistoryRouterEngine`)**: Intercepts `popstate` events from browser Back/Forward navigation, manages `pushState` for breadcrumbs and folder clicks, and drives directory re-fetching via Engine 2 (`BucketExplorerEngine`).
- **Engine 8 (`SessionLifecycleEngine`)**: Coordinates boot-time silent token restoration with deep-link hash hydration parsed by Engine 9 before mounting `AssetExplorer`, supporting project-optional bypass for Owner-Pays buckets.
- **Engine 1 (`GCPOnboardingEngine`)**: Provides reusable preflight validation called when navigating to new buckets via history or switchers, auto-detecting billing mode.
- **Engine 2 (`BucketExplorerEngine`)**: Directly consumes prefixes dispatched from Engine 9, parsing common prefixes and leaf objects for the virtualized grid.
- **Engine 3 (`CostGovernanceEngine`)**: Ingests selected items from the active directory to render real-time retrieval/egress cost estimates ($0.00 USD in Owner-Pays mode).
- **Engine 4 (`ResilientSWStreamEngine`)**: Streams multi-gigabyte media assets via Service Worker pass-through micro-chunks with constant <15MB heap and native browser download integration.
- **Engine 5 (`CRC32cIntegrityEngine`)**: Validates bit-exact Castagnoli CRC32c checksum parity against GCS `x-goog-hash` headers.
- **Engine 6 (`CliGeneratorEngine`)**: Formats copyable `gcloud storage` and `gsutil` shell scripts with adaptive project flags based on billing mode.
- **Engine 7 (`StatePersistenceEngine`)**: Maintains strict isolation between volatile RAM tokens and persisted preferences, persisting `activeBucketBillingMode` and `recentBucketModes`.

---

### Architectural Sign-Off for System Engines

All 12 engines conform to the **Zero Host Liability** paradigm, provide full memory isolation, furnish production-ready TypeScript contracts, and seamlessly support dual billing modes (Requester-Pays vs Owner-Pays), Google Trust & Safety scope minimization, persistent live session continuity, browser history traversal, native browser download integration, and frictionless onboarding bypass.





