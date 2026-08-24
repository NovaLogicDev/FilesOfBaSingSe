# Privacy Policy Specification & Regulatory Compliance Document
## Project: Files of Ba Sing Se — GCS Requester-Pays Media Distribution Portal
## Document ID: `SPEC-PRIVACY-POLICY-2026`

---

### Executive Overview & Purpose

This document constitutes the official **Privacy Policy and Google API Services User Data Policy Compliance Statement** for **Files of Ba Sing Se**. It is published as a publicly accessible, unauthenticated web resource (`/privacy.html`) and submitted to the **Google Cloud Console OAuth Consent Screen** verification registry.

---

# Privacy Policy for Files of Ba Sing Se

**Effective Date:** August 24, 2026  
**Last Updated:** August 24, 2026  

Files of Ba Sing Se ("we", "our", or "the Application") is an open-source, client-side web application designed to allow creative media professionals, video editors, and engineering teams to browse, inspect, and stream digital media assets directly from Google Cloud Storage (GCS) to their local workstations.

We are deeply committed to protecting your privacy, personal information, and cloud security. This Privacy Policy details how the Application interacts with Google APIs, what information is accessed, how that information is handled, and the strict technical safeguards in place.

---

### 1. Architectural Foundation: Zero-Backend Processing

Files of Ba Sing Se is built on a **Zero-Backend Architecture**:
* **Direct Client-to-Google Communication**: All interactions with Google services occur directly between your web browser runtime and Google's official API endpoints (`storage.googleapis.com`, `cloudresourcemanager.googleapis.com`, `cloudbilling.googleapis.com`, `serviceusage.googleapis.com`, and `accounts.google.com`).
* **Zero Intermediary Servers**: We do not operate an intermediary application server, proxy server, or custom backend. 
* **Zero Telemetry / Zero Tracking**: The Application does **not** employ third-party analytics trackers, tracking cookies, advertising beacons, or telemetry logging services (including Firebase Analytics, Google Analytics, or external monitoring networks).

---

### 2. Information Accessed & Scopes of Authorization

When you sign in using Google Identity Services (OAuth 2.0), the Application requests access to specific permissions according to the **Principle of Least Privilege**:

#### A. Base Non-Sensitive Permissions (Default Sign-In)
1. **User Identity (`openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`)**:
   - **Purpose**: Retrieves your name, email address, and avatar image to display your active session identity in the application interface and verify authorized bucket access.
2. **Google Cloud Storage Read-Only Access (`https://www.googleapis.com/auth/devstorage.read_only`)**:
   - **Purpose**: Enables the Application to list GCS bucket folders, inspect object technical metadata (sizes, Content-Types, CRC32c checksums), and stream media file contents directly to your local workstation.

#### B. Optional Step-Up Administrative Permissions (On-Demand)
3. **Google Cloud Platform Access (`https://www.googleapis.com/auth/cloud-platform`)**:
   - **Purpose**: Requested *strictly on-demand* only if you explicitly choose to use the automated GCP project discovery, 1-click project auto-provisioning, or billing account linkage verification features.
   - **Exemption**: If you manually enter your existing GCP Project ID, this permission is **never requested**.

---

### 3. Data Storage, Memory Isolation & Retention

* **Volatile Memory Storage Only**: All OAuth 2.0 access tokens and runtime session parameters reside strictly in temporary, volatile browser RAM (JavaScript memory).
* **Zero Disk Persistence of Credentials**: The Application **never** writes OAuth access tokens, bearer credentials, private keys, or refresh tokens to `localStorage`, `sessionStorage`, cookies, or IndexedDB.
* **Immediate Session Purge**: Active authentication credentials in volatile memory are completely purged when you click "Sign Out", close your browser tab/window, or when the token reaches its expiration time.
* **Persistent Non-Sensitive Preferences**: The Application only saves non-sensitive operational preferences to your browser's `localStorage` (such as your chosen UI theme, last entered bucket name, and project ID label) to preserve your workflow across visits.

---

### 4. Third-Party Data Sharing & Disclosure

* **No Data Selling or Commercial Exploitation**: We do not sell, rent, monetize, trade, or transfer your personal data, Google credentials, or storage data to any third party.
* **No External Database Storage**: Your files and metadata are never uploaded to, cached on, or processed by any third-party infrastructure.

---

### 5. Google API Services User Data Policy Compliance (Limited Use Disclosure)

Files of Ba Sing Se strictly adheres to the **[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)**, including the Limited Use requirements:

> **Limited Use Disclosure**:  
> *Files of Ba Sing Se's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.*

Specifically:
* Human agents do not read your storage data or profile information.
* Information retrieved via Google APIs is used solely to provide user-facing media browsing and downloading features within your own browser.
* Data obtained through Google APIs is not used for serving advertisements or training machine learning models.

---

### 6. User Rights, Session Management & Revocation of Access

You maintain complete control over your Google credentials and authorizations:
1. **In-App Sign Out**: Clicking **"Sign Out"** in the Application header instantly invokes Google's OAuth 2.0 token revocation endpoint (`https://accounts.google.com/o/oauth2/revoke`) and flushes all runtime memory.
2. **Google Account Permissions Dashboard**: You can review and revoke authorization at any time directly through your **[Google Account Permissions](https://myaccount.google.com/permissions)**.

---

### 7. Security Safeguards

The Application implements industry-standard client-side security safeguards:
* **Content Security Policy (CSP)**: Strict HTTP/meta headers restrict network outbound connections exclusively to authenticated Google Cloud endpoints.
* **Cryptographic Checksum Verification**: Every streamed file is validated against hardware-accelerated Castagnoli CRC32c checksums to prevent bit rot and data tampering.
* **Automated Boundary Auditing**: In-browser runtime scanners continuously verify that no sensitive token strings are leaked into persistent web storage.

---

### 8. Changes to This Privacy Policy

We may update this Privacy Policy periodically to reflect enhancements in application functionality or regulatory requirements. Any updates will be posted to this document with a revised "Last Updated" date.

---

### 9. Contact & Inquiries

For technical questions, privacy inquiries, or security reports, please contact the maintainers via the open-source repository or email:
* **Maintainer**: Max Paulson
* **Project Repository**: `https://github.com/maxpaulson/files-of-ba-sing-se`
* **Email**: `privacy@basingse.dev`
