# Sub-Feature: Cloud Storage

> Multi-provider cloud storage integration with OAuth2 authentication, end-to-end encryption, chunked uploads, file browsing, sharing, and a separate data-sync layer for cross-device entity synchronization.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust IPC Commands | `apps/desktop/src-tauri/src/sys/commands/cloud.rs` |
| Rust Provider Clients | `apps/desktop/src-tauri/src/integrations/cloud/mod.rs` (manager + CloudClient enum) |
| Google Drive Client | `apps/desktop/src-tauri/src/integrations/cloud/google_drive.rs` (777 lines) |
| Dropbox Client | `apps/desktop/src-tauri/src/integrations/cloud/dropbox.rs` (736 lines) |
| OneDrive Client | `apps/desktop/src-tauri/src/integrations/cloud/one_drive.rs` (657 lines) |
| Cloud Executor (AGI tools) | `apps/desktop/src-tauri/src/core/agi/executors/cloud_executor.rs` (698 lines) |
| Data Sync Layer | `apps/desktop/src-tauri/src/integrations/sync/` (cloud.rs, manager.rs, queue.rs, conflict.rs) |
| OAuth2 Infrastructure | `apps/desktop/src-tauri/src/sys/api/oauth.rs` (OAuth2Client, PkceChallenge, TokenResponse) |
| E2EE Key Derivation | `apps/desktop/src-tauri/src/sys/security/machine_key.rs` (KeyPurpose::CloudEncryption) |
| E2EE File Encryption | `apps/desktop/src-tauri/src/sys/security/storage.rs` (encrypt/decrypt_file_with_key) |
| State Registration | `apps/desktop/src-tauri/src/lib.rs` (line 313: `app.manage(CloudState::new())`) |
| Command Registration | `apps/desktop/src-tauri/src/lib.rs` (lines 1020-1028: 9 commands) |
| TypeScript Types | `apps/desktop/src/types/cloud.ts` |
| Zustand Store | `apps/desktop/src/stores/cloudStore.ts` |
| React Hook | `apps/desktop/src/hooks/useCloudStorage.ts` |
| UI Panel | `apps/desktop/src/components/Cloud/CloudStoragePanel.tsx` |
| Store Tests | `apps/desktop/src/stores/__tests__/cloudStore.test.ts` |
| Sidecar Mount | `apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx` (case `'cloud'`) |

## Architecture Overview

Cloud Storage has two distinct subsystems that share the "cloud" name but serve different purposes:

### 1. Cloud Storage Integration (File Operations)

Provides Google Drive, Dropbox, and OneDrive file management. The architecture follows a three-layer pattern:

```
Frontend (TS)                    IPC Boundary                   Backend (Rust)
---------------------------     ---------------     -----------------------------------
CloudStoragePanel.tsx                                cloud_connect (OAuth start)
  |                                                  cloud_complete_oauth
useCloudStore (Zustand)   ---->  invoke()  ---->     cloud_list_accounts
  |                                                  cloud_list / cloud_upload / ...
useCloudStorage (hook)                               cloud_delete / cloud_create_folder
                                                     cloud_share
                                                         |
                                                    CloudState
                                                         |
                                                  CloudStorageManager
                                                    |    |    |
                                              Google  Dropbox  OneDrive
                                              Drive   Client   Client
                                                         |
                                              E2EE encrypt/decrypt
                                              (machine_key + AES-256-GCM)
```

**OAuth Flow:**

1. Frontend calls `cloud_connect` with provider + OAuth credentials (client_id, client_secret, redirect_uri)
2. Rust generates a PKCE challenge (for Google Drive and OneDrive; Dropbox uses basic OAuth), builds the auth URL, stores the pending auth keyed by a UUID `state` param
3. Frontend opens the auth URL in the system browser via `openUrl()`
4. User authorizes and gets redirected; captures the `code` parameter manually
5. Frontend calls `cloud_complete_oauth` with the `state` + `code`
6. Rust exchanges the code for tokens, fetches account label (email/display name), stores the client in `CloudStorageManager.accounts` (DashMap)

**E2EE on Upload/Download:**

- **Upload:** Local file is encrypted to a temp `.enc` file using AES-256-GCM with a key derived from `KeyPurpose::CloudEncryption` via `machine_key::derive_key()`. The encrypted file is uploaded, then the temp file is cleaned up.
- **Download:** File is downloaded to a temp `.enc` path, then decrypted with the same derived key to the final destination, then the temp file is cleaned up.
- This means cloud providers never see plaintext file contents. The encryption key is deterministic per machine (derived from install ID + HKDF).

### 2. Data Sync Layer (Entity Synchronization)

Separately from file operations, the sync layer (`integrations/sync/`) provides cross-device synchronization for app entities (conversations, messages, projects, memories, settings, artifacts). This uses a dedicated API endpoint at `https://api.agiworkforce.com/api/sync` and is not related to Google Drive/Dropbox/OneDrive.

```
SyncManager
  |--- CloudSyncClient (HTTP client to sync API)
  |--- SyncQueue (SQLite-backed queue: sync_queue + received_updates tables)
  |--- ConflictResolver (LWW auto-resolve + JSON merge)
```

The SyncManager runs an auto-sync loop on a configurable interval (default 30s), batching pending local changes to the cloud API and pulling remote updates.

## Supported Providers

### Google Drive

| Detail | Value |
|--------|-------|
| Auth URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| API Base | `https://www.googleapis.com/drive/v3` |
| Upload URL | `https://www.googleapis.com/upload/drive/v3/files` |
| Scopes | `drive.metadata.readonly`, `drive.file`, `drive` |
| PKCE | Yes (SHA-256 challenge) |
| Upload Strategy | Resumable upload API, 10 MB chunks |
| Path Resolution | Walks folder tree via parent queries, creates missing folders on upload |
| ID-Based Access | Supports `id:FILE_ID` prefix for direct access |
| Account Label | Fetched via `/about?fields=user(emailAddress,displayName)` |

### Dropbox

| Detail | Value |
|--------|-------|
| Auth URL | `https://www.dropbox.com/oauth2/authorize` |
| Token URL | `https://api.dropboxapi.com/oauth2/token` |
| API Base | `https://api.dropboxapi.com/2` |
| Content URL | `https://content.dropboxapi.com/2` |
| Scopes | None (full access token) |
| PKCE | No |
| Upload Strategy | Upload sessions with 8 MB chunks; zero-byte files use simple upload |
| Path Format | Lowercased paths, empty string = root (Dropbox convention) |
| Share Links | Handles `shared_link_already_exists` (409) by fetching existing link |
| Account Label | Fetched via `/users/get_current_account` |

### OneDrive

| Detail | Value |
|--------|-------|
| Auth URL | `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` |
| Token URL | `https://login.microsoftonline.com/common/oauth2/v2.0/token` |
| API Base | `https://graph.microsoft.com/v1.0` |
| Scopes | `offline_access`, `Files.ReadWrite.All` |
| PKCE | Yes (SHA-256 challenge) |
| Upload Strategy | Simple PUT for files <= 4 MB; upload sessions with 8 MB chunks for larger |
| Path Resolution | Uses Graph API item path format (`/me/drive/root:/path:/`) |
| ID-Based Access | Supports `id:ITEM_ID` prefix for direct access |
| Share Links | Uses Graph `createLink` endpoint with `anonymous` scope |
| Account Label | Fetched via `/me` (displayName) |

## Rust Commands (IPC)

Nine commands are registered in `lib.rs`. Note: `cloud_disconnect` is defined in `cloud.rs` but **not registered** in `lib.rs`.

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `cloud_connect` | `config: CloudOAuthConfig` | `CloudAuthorizationResponse { auth_url, state }` | Starts OAuth flow; emits `cloud:auth_started` |
| `cloud_complete_oauth` | `request: { state, code }` | `CloudAccountResponse { account_id }` | Exchanges auth code for tokens; emits `cloud:connected` |
| `cloud_list_accounts` | (none) | `Vec<CloudAccount>` | Lists all connected cloud accounts |
| `cloud_list` | `request: { accountId, folderPath?, search?, includeFolders }` | `Vec<CloudFile>` | Lists files/folders with pagination and search |
| `cloud_upload` | `request: { accountId, localPath, remotePath }` | `String` (file ID) | E2EE encrypts then uploads; emits `cloud:file_uploaded` |
| `cloud_download` | `request: { accountId, remotePath, localPath }` | `()` | Downloads then E2EE decrypts; emits `cloud:file_downloaded` |
| `cloud_delete` | `request: { accountId, remotePath }` | `()` | Deletes file/folder; emits `cloud:file_deleted` |
| `cloud_create_folder` | `request: { accountId, remotePath }` | `String` (folder ID) | Creates folder; emits `cloud:folder_created` |
| `cloud_share` | `request: { accountId, remotePath, allowEdit }` | `ShareLink { url, expires_at, scope, allow_edit }` | Creates shareable link |
| `cloud_disconnect` | `accountId: String` | `()` | **NOT REGISTERED** -- disconnects account; would emit `cloud:disconnected` |

### CloudExecutor (AGI Tool Interface)

The `CloudExecutor` in `core/agi/executors/cloud_executor.rs` exposes cloud operations as agent tools, allowing AI agents to autonomously manage cloud files. It implements the `ToolExecutor` trait with six tools:

| Tool Name | Parameters |
|-----------|-----------|
| `cloud_upload` | `account_id`, `local_path`, `remote_path` |
| `cloud_download` | `account_id`, `remote_path`, `local_path` |
| `cloud_list` | `account_id`, `folder_path?`, `search?`, `include_folders?` |
| `cloud_delete` | `account_id`, `remote_path` |
| `cloud_create_folder` | `account_id`, `folder_path` |
| `cloud_share` | `account_id`, `remote_path`, `allow_edit?` |

The executor accesses `CloudState` via `context.app_handle` and emits progress events for large file uploads (> 10 MB).

## Store Schema

### `cloudStore.ts` (Zustand)

```typescript
interface CloudState {
  // State
  accounts: Account[];              // Connected cloud accounts
  activeAccountId: string | null;   // Currently selected account
  files: CloudFile[];               // Files in current directory
  currentPath: string;              // Current browsing path (default: '/')
  loading: boolean;                 // Operation in progress
  error: string | null;             // Last error message
  pendingAuth: PendingAuthorization | null;  // Active OAuth flow
  lastShareLink: ShareLink | null;  // Most recent share link

  // Actions
  refreshAccounts(): Promise<void>;
  selectAccount(accountId: string | null): Promise<void>;
  listFiles(path?, options?): Promise<void>;
  beginConnect(provider, credentials): Promise<void>;
  completeConnect(state, code): Promise<void>;
  uploadFile(localPath, remotePath): Promise<void>;
  downloadFile(remotePath, localPath): Promise<void>;
  deleteEntry(remotePath): Promise<void>;
  createFolder(remotePath): Promise<string>;
  shareLink(remotePath, allowEdit?): Promise<ShareLink | null>;
  clearError(): void;
}
```

### TypeScript Types (`types/cloud.ts`)

```typescript
type CloudProvider = 'google_drive' | 'dropbox' | 'one_drive';

interface CloudFile {
  id: string;
  name: string;
  path: string;
  mime_type?: string | null;
  size?: number | null;
  modified_at?: string | null;
  is_folder: boolean;
  share_link?: string | null;
}

interface ShareLink {
  url: string;
  expires_at?: string | null;
  scope?: string | null;
  allow_edit: boolean;
}

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface PendingAuthorization {
  provider: CloudProvider;
  state: string;
  authUrl: string;
}
```

### Rust Types (`integrations/cloud/mod.rs`)

```rust
enum CloudProvider { GoogleDrive, Dropbox, OneDrive }

struct CloudAccount { account_id, provider, label }
struct CloudFile { id, name, path, mime_type, size, modified_at, is_folder, share_link }
struct ShareLink { url, expires_at, scope, allow_edit }
struct ListOptions { folder_path, search, include_folders }
struct CloudOAuthConfig { provider, client_id, client_secret, redirect_uri }

// Internal
struct CloudStorageManager { accounts: DashMap, pending: DashMap }
enum CloudClient { Google(GoogleDriveClient), Dropbox(DropboxClient), OneDrive(OneDriveClient) }
```

## Tauri Events

All events are emitted from Rust to the frontend via `app.emit()`.

| Event | Payload | Emitted By | Listened By |
|-------|---------|-----------|------------|
| `cloud:auth_started` | `CloudProvider` (string) | `cloud_connect` | (not listened in store) |
| `cloud:connected` | `String` (account_id) | `cloud_complete_oauth` | `cloudStore` -- triggers `refreshAccounts()` |
| `cloud:disconnected` | `String` (account_id) | `cloud_disconnect` | (not listened -- command not registered) |
| `cloud:file_uploaded` | `{ accountId, remotePath, localPath, fileId }` | `cloud_upload` | `cloudStore` -- triggers `listFiles()` if same account |
| `cloud:file_downloaded` | `{ accountId, remotePath, localPath }` | `cloud_download` | (not listened in store) |
| `cloud:file_deleted` | `{ accountId, remotePath }` | `cloud_delete` | `cloudStore` -- triggers `listFiles()` if same account |
| `cloud:folder_created` | `{ accountId, remotePath, folderId }` | `cloud_create_folder` | (not listened in store) |

The store registers event listeners lazily on first `refreshAccounts()` call using `ensureListeners()`. A `cleanupCloudStoreListeners()` export allows teardown.

## Key Patterns

### CloudStorageManager Pattern
The manager uses `DashMap` for lock-free concurrent access to accounts. Client operations go through `with_client()`, which:
1. Looks up the account in the DashMap
2. Clones the `Arc<Mutex<CloudClient>>`
3. Drops the DashMap reference (avoids holding it across await)
4. Locks the mutex and calls the closure

### Token Refresh
Each provider client stores its `TokenResponse` with `expires_at` tracking. Before every API call, `ensure_token()` checks expiration and uses the refresh token if needed. If no refresh token exists, it returns an error asking for re-authentication.

### Path Resolution
- **Google Drive:** Walks the folder tree segment by segment via `resolve_folder_id()`, querying each parent for the next segment. Can create missing folders on-the-fly (`create_missing: true`).
- **Dropbox:** Uses native path-based API (paths are lowercased, root is empty string `""`).
- **OneDrive:** Uses Graph API path format (`/me/drive/root:/path:/children`). Supports `id:` prefix for direct item access.

### Chunked/Resumable Uploads
All three providers support large file uploads via chunking:
- **Google Drive:** Initiates a resumable upload session, then sends 10 MB chunks with `Content-Range` headers. Status 308 = continue, 200 = complete.
- **Dropbox:** Starts an upload session, appends 8 MB chunks via `upload_session/append_v2`, then finishes with `upload_session/finish`.
- **OneDrive:** Files <= 4 MB use simple PUT. Larger files create an upload session and send 8 MB chunks. Status 202 = continue, 200/201 = complete.

### E2EE Implementation
Files are encrypted before upload and decrypted after download using:
- **Key derivation:** `machine_key::derive_key(KeyPurpose::CloudEncryption)` -- HKDF from a machine-specific install ID stored in OS keychain
- **Cipher:** AES-256-GCM
- **Format:** `[salt (32 bytes)][nonce (12 bytes)][ciphertext]`
- **Temp file pattern:** `{UUID}.enc` in system temp directory, cleaned up after operation

### Stale Request Guard
The `listFiles()` action in `cloudStore` captures the `activeAccountId` before the async call. After the response arrives, it checks if the active account has changed and discards stale results if so.

### UI Integration
`CloudStoragePanel` is rendered inside the `DynamicSidecar` component (case `'cloud'`) as a lazy-loaded Suspense boundary. The panel features:
- Provider selection + OAuth credential inputs (Client ID, Secret, Redirect URI)
- OAuth completion form (state + authorization code)
- Account sidebar with selection
- File browser with breadcrumb navigation, search, and a table listing (Name, Type, Size, Modified, Actions)
- Actions: Upload (via `@tauri-apps/plugin-dialog` file picker), Download (via save dialog), Delete (with confirmation), Share (copies URL to clipboard), Create Folder (via prompt dialog)

### Data Sync Layer
The sync subsystem (`integrations/sync/`) is independent from cloud storage file operations:
- **SyncQueue:** SQLite-backed queue with `sync_queue` and `received_updates` tables. Items have retry counts (max 5) and are indexed by sync status and entity type.
- **CloudSyncClient:** HTTP client targeting the AGI Workforce sync API (`/batch`, `/updates`, `/resolve-conflict`, `/status`, `/devices/register`).
- **SyncManager:** Orchestrates periodic sync (configurable interval, default 30s). Pushes local changes in batches, pulls remote updates, and handles conflicts.
- **ConflictResolver:** Last-Write-Wins (LWW) auto-resolution by timestamp comparison. Supports recursive JSON object merging. Generates conflict reports.
- **Sync Entities:** Conversation, Message, Project, Memory, Settings, Artifact.

## Known Issues / Tech Debt

1. **`cloud_disconnect` not registered:** The `cloud_disconnect` Tauri command is defined in `cloud.rs` (line 120) but is **not registered** in `lib.rs`. The frontend `useCloudStorage` hook has a `disconnect()` method that only calls `refreshAccounts()` as a workaround. Users cannot disconnect individual cloud accounts.

2. **No frontend disconnect invoke:** The `cloudStore` does not expose a `disconnect` action that calls `invoke('cloud_disconnect', ...)`. The hook comments this: *"The cloudStore doesn't expose disconnect directly through Zustand, but the backend command exists."*

3. **Unlistened events:** `cloud:auth_started`, `cloud:file_downloaded`, and `cloud:folder_created` are emitted by Rust but no frontend listener handles them. These are no-ops.

4. **OAuth redirect requires manual code entry:** The user must manually capture the authorization code from the redirect URI and paste it into the app. There is no automatic deep-link or localhost callback server to capture the code.

5. **In-memory token storage:** OAuth tokens are stored in-memory in the `CloudClient` struct. They are lost on app restart, requiring re-authentication each session. Tokens are not persisted to SecretManager or any encrypted store.

6. **E2EE key is machine-bound:** The encryption key is derived from the machine's install ID, meaning files encrypted on one machine cannot be decrypted on another. There is no key export/import or cross-device key sharing mechanism.

7. **No upload progress events:** While the `CloudExecutor` emits a progress event at the start of large uploads, there are no intermediate progress events during chunked uploads. The frontend has no upload progress bar.

8. **Sync layer not wired to UI:** The data sync subsystem (`integrations/sync/`) has no corresponding Tauri commands, frontend store, or UI. It exists only as Rust library code. The `SyncManager` is not instantiated in `lib.rs` or managed as Tauri state.

9. **No quota/storage info:** None of the provider clients fetch storage quota information (used/total space). The `useCloudStorage` hook defines a `CloudQuota` interface but it is never populated.

10. **No file rename/move:** The cloud API supports list, upload, download, delete, create folder, and share -- but not rename or move operations.

11. **Search is client-side for Dropbox/OneDrive:** While Google Drive uses server-side search queries (`name contains 'term'`), Dropbox and OneDrive download the full folder listing and filter client-side by name. This is inefficient for large directories.

12. **No pagination in frontend:** The Rust layer handles pagination (Google Drive `nextPageToken`, Dropbox `cursor`/`has_more`, OneDrive `@odata.nextLink`), but all results are returned at once to the frontend. No virtual scrolling or lazy loading for large file lists.

13. **Test coverage is minimal:** The `cloudStore.test.ts` has a single test checking default state initialization. No integration tests for OAuth flows, file operations, or E2EE.
