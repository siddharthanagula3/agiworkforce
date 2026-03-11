# Sub-Feature: Email

> Full IMAP/SMTP email client with Gmail OAuth, contact management, real-time Pub/Sub notifications, and AI agent integration -- all inside the native desktop app.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust Commands (IPC) | `apps/desktop/src-tauri/src/sys/commands/email.rs` (1451 lines) |
| Rust Commands (Gmail OAuth) | `apps/desktop/src-tauri/src/sys/commands/gmail_oauth.rs` (820 lines) |
| Rust Commands (Google Batch) | `apps/desktop/src-tauri/src/sys/commands/google_batch.rs` (424 lines) |
| Rust Feature Module | `apps/desktop/src-tauri/src/features/communications/mod.rs` -- shared types |
| Rust IMAP Client | `apps/desktop/src-tauri/src/features/communications/imap_client.rs` (523 lines) |
| Rust SMTP Client | `apps/desktop/src-tauri/src/features/communications/smtp_client.rs` (179 lines) |
| Rust Email Parser | `apps/desktop/src-tauri/src/features/communications/email_parser.rs` (315 lines) |
| Rust Gmail OAuth Client | `apps/desktop/src-tauri/src/features/communications/gmail_oauth.rs` (643 lines) |
| Rust Gmail Pub/Sub | `apps/desktop/src-tauri/src/features/communications/gmail_pubsub.rs` (927 lines) |
| Rust Contacts Manager | `apps/desktop/src-tauri/src/features/communications/contacts.rs` (369 lines) |
| Rust Email Executor (AGI) | `apps/desktop/src-tauri/src/core/agi/executors/email_executor.rs` (482 lines) |
| Rust Communication Tools (LLM) | `apps/desktop/src-tauri/src/core/llm/tool_executor/communication_tools.rs` |
| TS Store | `apps/desktop/src/stores/emailStore.ts` (435 lines) |
| TS Hook | `apps/desktop/src/hooks/useEmail.ts` (367 lines) |
| TS Component | `apps/desktop/src/components/Communications/EmailWorkspace.tsx` (950 lines) |
| TS Types | `apps/desktop/src/types/email.ts` (82 lines) |
| TS Security Utils | `apps/desktop/src/utils/security.ts` -- `sanitizeEmailHtml()` |
| Rust OAuth Foundation | `apps/desktop/src-tauri/src/sys/api/oauth.rs` -- `OAuth2Client`, `PkceChallenge`, `TokenResponse` |

## Architecture Overview

The email feature implements two independent authentication paths that converge on a unified frontend:

```
                         +-----------------------+
                         |   EmailWorkspace.tsx   |
                         |  (3-column email UI)   |
                         +-----------+-----------+
                                     |
                    +----------------+----------------+
                    |                                 |
            emailStore.ts                      useEmail.ts
            (Zustand store)                   (React hook)
                    |                                 |
                    +----------------+----------------+
                                     |
                              invoke() IPC
                                     |
            +------------------------+------------------------+
            |                        |                        |
    email_connect()          gmail_oauth_*()          email_fetch_inbox()
    email_send()             (OAuth 2.0 + PKCE)       email_search()
    email_mark_read()                                 email_get_message()
    email_delete()                                    email_move_message()
    email_list_folders()                              email_download_attachment()
            |                        |                        |
    +-------+-------+       +-------+-------+       +--------+--------+
    | ImapClient    |       | GmailOAuth    |       | email_parser.rs |
    | smtp_client   |       | Manager       |       | (RFC 2822)      |
    +---------------+       | GmailOAuth    |       +-----------------+
                            | Client        |
                            +-------+-------+
                                    |
                            +-------+-------+
                            | GmailPubSub   |
                            | Client        |
                            | (real-time)   |
                            +---------------+
```

### Two Auth Paths

1. **IMAP/SMTP Path** (primary, fully wired): User provides email + app password. Rust connects via IMAP (TLS-only) for reading and SMTP (STARTTLS) for sending. Supports Gmail, Outlook, Yahoo, and custom IMAP/SMTP servers. Credentials stored in OS keyring (macOS Keychain / Windows Credential Manager / Linux Secret Service) with AES-256-GCM SQLite fallback.

2. **Gmail OAuth Path** (secondary): Full OAuth 2.0 with PKCE via Google endpoints. Tokens encrypted with machine-derived keys (Argon2id) in SQLite. `GmailOAuthManager` handles multi-account state with `DashMap` for concurrent access. Accounts persisted and loaded at app startup via `load_persisted_gmail_accounts()`.

### AI Agent Integration

Email operations are exposed to the AI agent system through two executor paths:

- **`EmailExecutor`** (`core/agi/executors/email_executor.rs`): Implements the `ToolExecutor` trait with `email_send` and `email_fetch` tools. Used by the AGI orchestration layer. Parses comma-separated addresses, validates attachment paths, builds filters from natural-language parameters.

- **`communication_tools.rs`** (`core/llm/tool_executor/`): Direct `execute_email_send_tool` and `execute_email_fetch_tool` methods on the LLM `ToolExecutor`. Used by the chat pipeline for inline tool execution during agentic conversations.

## IMAP/SMTP Integration

### IMAP Client (`imap_client.rs`)

Built on `async_imap` with `tokio_native_tls`. Key behaviors:

- **TLS-only**: Non-TLS connections are rejected with an explicit error. All connections go through `TlsConnector`.
- **UID-based operations**: All fetch/store/delete use IMAP UID commands (not sequence numbers) for stability.
- **Search**: Builds IMAP SEARCH queries from `EmailFilter` -- supports `UNSEEN`, `SINCE`, `BEFORE`. Additional filters (from, subject, body, has_attachments) applied in-memory post-fetch via `matches_filter()`.
- **Move**: Attempts RFC 6851 `UID MOVE` first, falls back to `COPY + DELETE + EXPUNGE`.
- **Fetch limit**: Clamped to `1..=200` messages. UIDs sorted descending (newest first).
- **Connection lifecycle**: Each command opens a fresh IMAP connection, performs the operation, and calls `logout()`. No persistent connection pooling.

### SMTP Client (`smtp_client.rs`)

Built on `lettre` with `AsyncSmtpTransport`:

- STARTTLS by default (port 587). Dangerous plain connection available for custom configs.
- Supports multipart messages: `text/plain` + `text/html` as `multipart/alternative`, attachments via `multipart/mixed`.
- Attachments loaded from local filesystem paths. MIME types auto-detected via `mime_guess`.
- Message IDs generated as `<uuid@agiworkforce.local>`.
- 30-second timeout. Connection tested at creation time.

### Email Parser (`email_parser.rs`)

Built on `mailparse`:

- Recursive MIME part extraction: walks `multipart/*` trees to extract `text/plain`, `text/html`, and attachments.
- Attachment detection: `Content-Disposition: attachment` or `name` parameter in Content-Type.
- Address parsing: Handles both `user@example.com` and `Name <user@example.com>` formats.
- HTML sanitization (Rust-side): Strips `<script>` tags, `on*` event handlers, and `javascript:` URIs via regex before sending to frontend.
- Attachment saving: Writes to `$TMPDIR/agiworkforce/attachments/` with original filenames.

## Gmail OAuth Integration

### OAuth Flow (`gmail_oauth.rs`)

```
Frontend                    Rust Backend                  Google
   |                            |                            |
   |-- gmail_oauth_start ------>|                            |
   |                            |-- generate PKCE ---------->|
   |                            |-- build auth URL --------->|
   |<-- auth_url + state ------|                            |
   |                            |                            |
   | (user authorizes in browser)                           |
   |                            |                            |
   |-- gmail_oauth_complete --->|                            |
   |   (code + state)          |-- exchange_code ---------->|
   |                            |<-- TokenResponse ---------|
   |                            |-- get_user_profile ------>|
   |                            |<-- email, name, picture --|
   |                            |-- encrypt + store ------->| (SQLite)
   |<-- account_id ------------|                            |
```

**Scopes requested:**
- `gmail.readonly` -- read messages and settings
- `gmail.send` -- send on behalf of user
- `gmail.modify` -- read, send, delete, manage
- `userinfo.email` -- get user email address
- `userinfo.profile` -- get display name and picture

**Security:**
- PKCE (S256 challenge) prevents authorization code interception
- `access_type=offline` + `prompt=consent` ensures refresh token is always returned
- Client secrets encrypted with `machine_key::derive_key(KeyPurpose::EmailCredentials)` before SQLite storage
- Tokens encrypted with same key derivation, stored as JSON `EncryptedSecret` in `token_encrypted` column

### Multi-Account Manager (`GmailOAuthManager`)

Thread-safe via `Arc<DashMap<>>`:

```rust
struct GmailOAuthManager {
    clients: Arc<DashMap<String, GmailOAuthClient>>,   // active API clients
    accounts: Arc<DashMap<String, GmailAccountInfo>>,   // account metadata
    pending_auth: Arc<DashMap<String, PendingOAuth>>,   // in-flight OAuth flows
}
```

- `start_oauth()` -- creates client, generates auth URL + PKCE, stores pending state
- `take_pending()` -- consumes pending state for completion (prevents replay)
- `complete_oauth()` -- exchanges code, fetches profile, returns `GmailAccountInfo`
- `upsert_account()` -- adds/updates account, creates client if needed
- `refresh_account_token()` -- refreshes via stored refresh token, preserves refresh token if new response omits it
- `get_client()` -- returns client with auto-refresh of expired tokens

### Gmail Pub/Sub (`gmail_pubsub.rs`)

Real-time email notifications via Google Cloud Pub/Sub:

- **Watch setup**: `POST /gmail/v1/users/me/watch` with Pub/Sub topic, filtering to INBOX label
- **Streaming pull**: Long-poll loop pulling up to 10 messages per batch, 1-second polling interval, 5-second backoff on error
- **History sync**: `sync_from_history()` fetches incremental changes (added, deleted, label changes) since a given history ID. Capped at `MAX_HISTORY_ITEMS = 1000` to prevent unbounded fetching.
- **Message format**: Gmail sends base64-encoded JSON `{emailAddress, historyId}` notifications
- **Lifecycle**: `is_running` AtomicBool controls the streaming loop; `stop_watch()` sets it to false and calls Gmail stop API

### Database Schema (`gmail_accounts` table)

```sql
CREATE TABLE gmail_accounts (
    id TEXT PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    picture_url TEXT,
    client_id TEXT NOT NULL,
    client_secret_encrypted TEXT NOT NULL,  -- JSON EncryptedSecret
    redirect_uri TEXT NOT NULL,
    token_encrypted TEXT NOT NULL,          -- JSON EncryptedSecret
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

## Rust Commands (IPC)

### Email Account Commands

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `email_connect` | `provider`, `email`, `password`, `display_name?`, `custom_config?` | `EmailAccount` | Connect IMAP/SMTP account. Validates by connecting to both servers. |
| `email_list_accounts` | -- | `Vec<EmailAccount>` | List all connected IMAP/SMTP accounts |
| `email_remove_account` | `accountId` | `()` | Remove account, clear keyring + DB credentials |

### Email Operations

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `email_fetch_inbox` | `accountId`, `folder?`, `limit?`, `filter?` | `Vec<Email>` | Fetch messages from folder (default INBOX, limit 50) |
| `email_list_messages` | same as above | `Vec<Email>` | Alias for `email_fetch_inbox` (frontend compat) |
| `email_get_message` | `accountId`, `folder`, `uid` | `Email` | Get single message by UID |
| `email_search` | `accountId`, `query`, `folder?`, `limit?` | `EmailSearchResult` | Search by subject (uses IMAP filter) |
| `email_send` | `request: SendEmailRequest` | `String` (message_id) | Send via SMTP |
| `email_send_message` | same as above | `String` | Alias for `email_send` (frontend compat) |
| `email_mark_read` | `accountId`, `uid`, `read` | `()` | Set/clear \Seen flag |
| `email_delete` | `accountId`, `uid` | `()` | Delete + expunge |
| `email_move_message` | `accountId`, `uid`, `fromFolder`, `toFolder` | `()` | MOVE or COPY+DELETE |
| `email_list_folders` | `accountId` | `Vec<String>` | List IMAP folders |
| `email_download_attachment` | `accountId`, `folder`, `uid`, `attachmentIndex` | `String` (path) | Save attachment to temp dir |

### Credential Management

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `email_check_keyring_status` | -- | `KeyringStatus` | Check keyring availability and credential storage distribution |
| `email_migrate_credentials` | -- | `Vec<MigrationResult>` | Migrate all credentials to OS keyring |

**Note:** `email_check_keyring_status` and `email_migrate_credentials` are defined but **not registered** in `lib.rs`. They are currently unreachable from the frontend.

### Gmail OAuth Commands

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `gmail_oauth_start` | `config: GmailOAuthConfig` | `GmailAuthUrlResponse` | Start OAuth flow, return auth URL |
| `gmail_oauth_complete` | `request: GmailOAuthCompleteRequest` | `GmailAccountIdResponse` | Complete OAuth with authorization code |
| `gmail_oauth_refresh` | `accountId` | `bool` | Refresh access token |
| `gmail_oauth_list_accounts` | -- | `Vec<GmailAccount>` | List connected Gmail accounts |
| `gmail_oauth_disconnect` | `accountId` | `()` | Disconnect and delete Gmail account |
| `gmail_oauth_get_account` | `accountId` | `Option<GmailAccount>` | Get specific Gmail account info |

**Note:** All Gmail OAuth commands are defined but **not registered** in `lib.rs`. The `GmailOAuthState` is managed (loaded at startup), but the commands themselves are unreachable from the frontend.

### Contact Commands (registered)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `contact_create` | `contact: Contact` | `i64` (id) | Create new contact |
| `contact_list` | `limit?`, `offset?` | `Vec<Contact>` | List contacts (default limit 100) |
| `contact_update` | `contact: Contact` | `()` | Update existing contact |
| `contact_delete` | `id` | `()` | Delete contact by ID |

**Not registered:** `contact_get`, `contact_search`, `contact_import_vcard`, `contact_export_vcard`

### Google Batch API Commands (registered, stub implementation)

| Command | Params | Returns | Description |
|---------|--------|---------|-------------|
| `google_batch_create` | `requests?`, `model`, `displayName?` | `BatchJob` | Create batch LLM job (in-memory, not persisted) |
| `google_batch_get` | `jobName` | `BatchJob` | Get job status |
| `google_batch_list` | `pageSize?`, `pageToken?`, `filter?` | `ListBatchJobsResponse` | List all batch jobs |
| `google_batch_cancel` | `jobName` | `BatchJob` | Cancel a job |
| `google_batch_delete` | `jobName` | `()` | Delete a job |
| `google_batch_get_results` | `jobName`, `outputPath?` | `BatchJob` | Get results for completed job |
| `google_batch_create_embeddings` | `texts?`, `model?` | `EmbeddingsBatchJob` | Create embeddings batch |
| `google_batch_get_embeddings` | `jobName` | `EmbeddingsBatchJob` | Get embeddings batch status |
| `google_batch_create_images` | `prompts`, `model` | `BatchJob` | Create image generation batch |
| `google_batch_calculate_cost` | `model`, `inputTokens`, `outputTokens`, `cachedTokens?` | `f64` | Estimate batch cost |
| `google_batch_create_jsonl` | `requests`, `outputPath` | `()` | Write JSONL file from requests |

## Store Schema

### `emailStore.ts` (Zustand)

```typescript
interface EmailState {
  // Data
  accounts: EmailAccount[];
  selectedAccountId: number | null;
  folders: string[];
  selectedFolder: string;           // default: 'INBOX'
  emails: EmailMessage[];
  selectedEmail: EmailMessage | null;
  contacts: Contact[];

  // UI state
  loading: boolean;
  error: string | null;
  filter: EmailFilter;              // default: { unread_only: false }

  // Actions
  refreshAccounts(): Promise<void>;
  connectAccount(payload: ConnectAccountPayload): Promise<void>;
  removeAccount(accountId: number): Promise<void>;
  selectAccount(accountId: number | null): Promise<void>;
  refreshFolders(accountId?: number): Promise<void>;
  refreshEmails(options?: { accountId?; folder?; filter? }): Promise<void>;
  selectEmail(emailId: string | null): void;
  markRead(uid: number, read: boolean): Promise<void>;
  deleteEmail(uid: number): Promise<void>;
  sendEmail(payload: SendEmailPayload): Promise<string>;
  setFilter(partial: Partial<EmailFilter>): void;
  downloadAttachment(message, attachmentIndex): Promise<string>;
  clearError(): void;
  refreshContacts(): Promise<void>;
  saveContact(contact): Promise<void>;
  deleteContact(id: number): Promise<void>;
}
```

Key patterns:
- Account selection auto-triggers `refreshFolders()` + `refreshEmails()`
- Account removal auto-selects next available account
- Folder change preserves current filter settings
- Attachment download updates the email's attachment `file_path` in state optimistically

### `useEmail.ts` (React Hook)

Standalone hook with independent `loading`/`error` state (not shared with store). Provides:
- `listAccounts()`, `listMessages()`, `getMessage()`, `sendMessage()`, `searchEmails()`
- `moveMessage()`, `deleteMessage()`, `markRead()`, `listFolders()`
- All operations show toast on error via `sonner`

## TypeScript Types (`types/email.ts`)

```typescript
interface EmailProviderConfig {
  name: string;
  imap_host: string; imap_port: number; imap_use_tls: boolean;
  smtp_host: string; smtp_port: number; smtp_use_tls: boolean;
}

interface EmailAccount {
  id: number; provider: string; email: string;
  display_name?: string | null;
  imap_host: string; imap_port: number; imap_use_tls: boolean;
  smtp_host: string; smtp_port: number; smtp_use_tls: boolean;
  created_at: number; last_sync?: number | null;
}

interface EmailMessage {
  id: string;              // format: "folder:uid"
  uid: number; account_id: number; message_id: string;
  subject: string; from: EmailAddress;
  to: EmailAddress[]; cc: EmailAddress[]; bcc: EmailAddress[];
  reply_to?: EmailAddress | null;
  date: number;            // unix timestamp
  body_text?: string | null; body_html?: string | null;
  attachments: EmailAttachment[];
  is_read: boolean; is_flagged: boolean;
  folder: string; size: number;
}

interface EmailFilter {
  unread_only: boolean;
  date_from?: number | null; date_to?: number | null;
  from?: string | null; to?: string | null;
  subject_contains?: string | null; body_contains?: string | null;
  has_attachments?: boolean | null;
}

interface Contact {
  id: number; email: string;
  display_name?: string | null;
  first_name?: string | null; last_name?: string | null;
  phone?: string | null; company?: string | null;
  notes?: string | null;
  created_at: number; updated_at: number;
}
```

## Tauri Events

| Event | Payload | Emitted By | Description |
|-------|---------|------------|-------------|
| `gmail:auth_started` | `String` (state) | `gmail_oauth_start` | OAuth flow initiated |
| `gmail:connected` | `String` (account_id) | `gmail_oauth_complete` | Account successfully connected |
| `gmail:token_refreshed` | `String` (account_id) | `gmail_oauth_refresh` | Token refreshed |
| `gmail:disconnected` | `String` (account_id) | `gmail_oauth_disconnect` | Account disconnected |

**Note:** No frontend listeners for these events were found. The Gmail OAuth commands are not registered in `lib.rs`, making these events currently unreachable.

## Credential Security

### Three-Tier Storage (IMAP/SMTP)

1. **OS Keyring** (preferred): macOS Keychain, Windows Credential Manager, Linux Secret Service. Service name: `agiworkforce-email`. Database stores `__KEYRING__` marker.

2. **AES-256-GCM Encrypted SQLite** (fallback): Password encrypted with `machine_key::derive_key(KeyPurpose::EmailCredentials)`, stored as JSON `EncryptedSecret` (`{ nonce, ciphertext }`).

3. **Legacy Base64** (migration target): Old format automatically detected and migrated to tier 1 or 2 on first access. `decode_legacy_password()` handles backward compatibility.

Flow on `get_email_password()`:
```
Read password_encrypted from DB
  -> if "__KEYRING__" -> read from OS keyring
  -> if starts with '{' -> decrypt EncryptedSecret (AES-256-GCM)
  -> else -> decode Base64 (legacy), then attempt migration to keyring
```

### Gmail OAuth Token Storage

- Client secret: encrypted with `machine_key::derive_key(KeyPurpose::EmailCredentials)` via `encrypt_secret()`
- Access + refresh tokens: serialized to JSON, encrypted with same key, stored in `token_encrypted` column
- Decryption at load time in `fetch_gmail_account()` / `list_gmail_accounts()`

## Frontend Component

### `EmailWorkspace.tsx`

Full-featured email client UI with three panels:

1. **Sidebar (272px)**: Account list with connect/remove/sync buttons. Folder navigator. "Connect Email Account" dialog with provider selector (Gmail, Outlook, Yahoo, Custom IMAP/SMTP) and custom server settings form.

2. **Email List (320px)**: All/Unread tabs. Local search (subject, from, body text). Attachment filter toggle. Each email shows sender, subject, preview, date, read/unread status, delete button.

3. **Email Detail (flex)**: Subject, from, to, cc, date. HTML body rendered via `dangerouslySetInnerHTML` with `sanitizeEmailHtml()`. Plain text fallback. Attachment list with download/open buttons. Contact save prompt for unknown senders.

**Compose Dialog**: To/CC/BCC, subject, body (plain text), file attachments. Recipients parsed from comma-separated input.

### HTML Sanitization (`sanitizeEmailHtml`)

Dual-layer sanitization:

1. **Rust-side** (`email_parser::sanitize_html`): Regex-based removal of `<script>` tags, `on*` event handlers, `javascript:` URIs. Applied before sending data to frontend.

2. **Frontend-side** (`utils/security.ts::sanitizeEmailHtml`): DOMPurify with strict allowlist. Permits `a`, `img`, common formatting tags. Anchors forced to `target="_blank"` with `rel="noopener noreferrer"`. Non-HTTP(S)/mailto/tel hrefs stripped. Images restricted to HTTPS or base64 data URIs. `style` attribute intentionally excluded to prevent image-beacon exfiltration.

## Key Patterns

### Connection Per Operation
Every email command (fetch, send, mark read, delete, move) opens a new IMAP/SMTP connection, performs the operation, and closes it. This is simple but has performance implications for rapid operations. No connection pooling.

### Provider Auto-Configuration
`get_provider_config()` maps provider names to server settings:
- `gmail` -> `imap.gmail.com:993` / `smtp.gmail.com:587`
- `outlook` / `hotmail` -> `outlook.office365.com:993` / `smtp.office365.com:587`
- `yahoo` -> `imap.mail.yahoo.com:993` / `smtp.mail.yahoo.com:587`
- `custom` -> user-supplied IMAP/SMTP hostnames and ports

### Search Implementation
`email_search` uses IMAP filter for subject matching (server-side) but falls back to in-memory filtering for other criteria (from, body, attachments). This means complex searches fetch up to `limit` messages and filter client-side.

### Contacts + vCard
`ContactManager` supports vCard 3.0 import/export (`BEGIN:VCARD` / `END:VCARD` parsing). Import uses `ON CONFLICT(email) DO UPDATE` for upsert semantics. Export generates compliant vCard with FN, N, EMAIL, TEL, ORG, NOTE fields. Contact entries sanitized via `escape_vcard_value()`.

## Known Issues / Tech Debt

### Critical: Unregistered Commands
The following commands are defined in Rust but **not registered** in `lib.rs`, making them unreachable from the frontend:

- All 6 Gmail OAuth commands: `gmail_oauth_start`, `gmail_oauth_complete`, `gmail_oauth_refresh`, `gmail_oauth_list_accounts`, `gmail_oauth_disconnect`, `gmail_oauth_get_account`
- Email keyring commands: `email_check_keyring_status`, `email_migrate_credentials`
- Contact commands: `contact_get`, `contact_search`, `contact_import_vcard`, `contact_export_vcard`

The `GmailOAuthState` is initialized and loaded at startup (line 346-375 in `lib.rs`), but none of the Gmail OAuth IPC commands are in the `generate_handler!` invocation. This means Gmail OAuth is fully implemented but completely inaccessible.

### IPC Parameter Naming (snake_case violations)

`useEmail.ts` uses **snake_case** parameter names in several `invoke()` calls, which will silently fail because Tauri auto-converts Rust snake_case to camelCase:

```typescript
// BROKEN - should be accountId, not account_id
invoke('email_list_messages', { account_id: accountId, ... });
invoke('email_get_message', { account_id: accountId, ... });
invoke('email_search', { account_id: accountId, ... });
invoke('email_move_message', { account_id: accountId, from_folder, to_folder });
invoke('email_mark_read', { account_id: accountId, ... });
invoke('email_delete', { account_id: accountId, ... });
invoke('email_list_folders', { account_id: accountId, ... });
```

**Impact:** These 7 `invoke()` calls in `useEmail.ts` will pass `undefined` for the account ID parameter, causing runtime failures. The `emailStore.ts` has a mix -- some use `accountId` (correct) and some use snake_case (broken).

### Google Batch API is a Stub
`google_batch.rs` is explicitly documented as a "mock/stub implementation using in-memory storage." Jobs are not persisted across app restarts. No actual Google AI Batch API integration exists.

### No Connection Pooling
Each email operation opens a fresh TLS connection, authenticates, performs the operation, and logs out. For inbox polling or rapid operations, this creates significant overhead. A connection pool with keepalive would improve performance.

### Attachment Handling Limitations
- Compose dialog captures `file.name` (browser-side) but not the actual file path. In a Tauri app, the file input does not provide filesystem paths, so the attachment feature in compose is effectively broken without Tauri's file dialog.
- Download saves to `$TMPDIR/agiworkforce/attachments/` with no cleanup mechanism.

### No Offline Cache
All email data is fetched live from the IMAP server. No local caching or offline access. Repeated folder views re-fetch everything.

### `email_search` is Simplistic
Search only matches `subject_contains` via IMAP-level filter. The body and attachment filters are applied in-memory after fetching, limited to the `limit` count. A search for body content in a folder with 10,000 emails but `limit=50` will only search the 50 most recent.

### Gmail Pub/Sub Not Connected to Frontend
`GmailPubSubClient` is fully implemented (watch setup, streaming pull, history sync) but there is no IPC command to start/stop it, no frontend integration, and no Tauri event emission for real-time notifications.

### Duplicate `useEmail` Hook
Both `emailStore.ts` (Zustand) and `useEmail.ts` (standalone hook) provide overlapping email operations with different state management. The `EmailWorkspace` component uses only the store. The hook is unused in any component but is available for programmatic use.
