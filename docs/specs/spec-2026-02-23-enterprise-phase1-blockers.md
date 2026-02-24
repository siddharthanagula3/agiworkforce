# Specification: Enterprise Phase 1 Critical Blockers

Generated: 2026-02-23T12:00:00Z

## Task Overview

Implement 5 critical enterprise blockers in parallel: (1) fix rustls-tls and add proxy support with a centralized HttpClientFactory, (2) SQLCipher database encryption, (3) SSO via Supabase, (4) SCIM provisioning via WorkOS, and (5) expand the filesystem deny list in Tauri capabilities.

These 5 items are assigned to 5 agents (J, K, L, M, N) that will run concurrently. This spec defines exact file boundaries, interface contracts, and conflicts to avoid.

---

## Team Composition

- **Agent J**: Cargo.toml changes (BOTH rustls + sqlcipher features) + HttpClientFactory + proxy settings (Rust backend + frontend UI)
- **Agent K**: SQLCipher DB initialization (db/mod.rs only, NOT Cargo.toml) + migration utility for unencrypted-to-encrypted DB
- **Agent L**: SSO implementation (web login page + admin API + Supabase migration)
- **Agent M**: SCIM webhook handler (WorkOS directory sync + Supabase migration + admin API)
- **Agent N**: Filesystem deny list expansion (already launched, capabilities/default.json only)

---

## File Allocation

### Agent J -- Cargo.toml + HttpClientFactory + Proxy Support

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/http_client.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/mod.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/settings/models.rs` (add `ProxySettings` struct and `Network` category)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/commands/proxy.rs` (NEW -- Tauri commands for proxy config)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Settings/ProxySettings.tsx` (NEW -- frontend proxy settings component)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/stores/settingsStore.ts` (add proxy-related state fields)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/components/Settings/SettingsPanel.tsx` (add "Network" tab)

**Current State of Key Files:**

`Cargo.toml` line 62:

```toml
rusqlite = { version = "0.31", features = ["bundled", "backup", "blob", "chrono"] }
```

`Cargo.toml` line 73:

```toml
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls", "multipart", "blocking"], default-features = false }
```

`http_client.rs`: Contains `HttpClient` struct with `Client::builder()` at line 34. Has `FALLBACK_CLIENT` lazy static at line 10. Has `should_retry()` at line 78. **Does NOT support proxy or custom CA certs.**

`managed_cloud_provider.rs`: Contains `ManagedCloudProvider` struct at line 15 with its own `Client` field. Constructs its own `Client::builder()` at line 129. **Does NOT use HttpClient or any shared factory.**

`ollama.rs`: Contains `OllamaProvider` struct at line 54 with its own `Client` field. Constructs its own `Client::builder()` at line 61. **Does NOT use HttpClient or any shared factory.**

`providers/mod.rs`: Exports `HttpClient`, `ManagedCloudProvider`, `OllamaProvider`. Agent J should add `http_client_factory` module here.

`data/settings/models.rs`: Has `SettingCategory` enum (Llm, Ui, Security, Window, System). Has `AppSettings` struct with `security_settings: SecuritySettings`. **No proxy/network settings exist yet.** Agent J should add a `Network` variant to `SettingCategory` and a `ProxySettings` struct.

`settingsStore.ts`: Zustand store with tabs: llm-config, instructions, filesystem, integrations, window, data-privacy, system. **No proxy/network settings exist.** Agent J should add proxy state and a new Network tab.

`SettingsPanel.tsx`: Has 7 tabs defined at lines 233-261. Agent J should add a "Network" tab.

**Will Produce (Cargo.toml changes for BOTH Agent J and Agent K):**

Agent J owns `Cargo.toml` and must make BOTH sets of changes in a single edit:

1. Line 62: Change `bundled` to `bundled-sqlcipher` -- this is FOR Agent K's SQLCipher work
2. Line 73: Change `rustls-tls` to `rustls-tls-native-roots` (or add `rustls-native-certs`) -- this is for Agent J's proxy/TLS work

```toml
# Line 62 change (for Agent K):
rusqlite = { version = "0.31", features = ["bundled-sqlcipher", "backup", "blob", "chrono"] }

# Line 73 change (for Agent J):
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls", "rustls-tls-native-roots", "multipart", "blocking"], default-features = false }
```

**Will Produce (HttpClientFactory):**

New file `http_client_factory.rs` (or refactor within `http_client.rs`) providing:

```rust
/// Centralized HTTP client factory that respects proxy settings and custom CA certs
pub struct HttpClientFactory;

impl HttpClientFactory {
    /// Build a reqwest::Client with proxy and CA cert configuration.
    /// Reads proxy settings from:
    ///   1. App settings (ProxySettings struct)
    ///   2. Environment variables HTTP_PROXY/HTTPS_PROXY/NO_PROXY as fallback
    /// Supports custom CA certificate via .add_root_certificate()
    pub fn build_client(proxy_settings: Option<&ProxySettings>) -> Result<Client, String>;

    /// Build a ClientWithMiddleware with retry policy
    pub fn build_client_with_retries(proxy_settings: Option<&ProxySettings>) -> Result<ClientWithMiddleware, String>;
}
```

**Will Produce (ProxySettings model):**

In `data/settings/models.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySettings {
    pub enabled: bool,
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
    pub custom_ca_cert_path: Option<String>,
}
```

**Will Produce (Frontend):**

New `ProxySettings.tsx` component and a new tab in `SettingsPanel.tsx`.

In `settingsStore.ts`, add:

```typescript
interface ProxyConfig {
  enabled: boolean;
  httpProxy: string;
  httpsProxy: string;
  noProxy: string;
  customCaCertPath: string;
}
```

**Interface Contract for Agent K:**

Agent K MUST NOT touch `Cargo.toml`. Agent J will change line 62 from `"bundled"` to `"bundled-sqlcipher"` on Agent K's behalf. After Agent J's Cargo.toml change, Agent K's code in `db/mod.rs` can call `PRAGMA key = '...'` because the `bundled-sqlcipher` feature enables SQLCipher support in rusqlite.

---

### Agent K -- SQLCipher DB Initialization + Migration Utility

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/mod.rs`
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/encryption.rs` (NEW -- encryption key derivation + migration logic)
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/lib.rs` (ONLY the DB initialization block at lines 140-158 where `Connection::open(&db_path)` and pragmas are set)

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml` -- Agent J handles the `bundled-sqlcipher` feature change
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/migrations.rs` -- do not modify the migration system itself
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/repository.rs` -- no changes needed
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/data/db/models.rs` -- no changes needed
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/machine_key.rs` -- read-only, do not modify

**Current State of Key Files:**

`data/db/mod.rs`:

- `Database` struct wraps `Arc<Mutex<Connection>>` (line 22-24)
- `Database::new(path: &str)` opens connection, runs migrations (line 27-33)
- `Database::in_memory()` for tests (line 36-43)
- No encryption logic exists

`lib.rs` DB initialization (lines 140-158):

```rust
let db_path = app_data_dir.join("agiworkforce.db");
let conn = Connection::open(&db_path).context("Failed to open database")?;
conn.execute_batch("
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
").context("Failed to set database pragmas")?;
if let Err(e) = migrations::run_migrations(&conn) { ... }
```

`machine_key.rs` (READ ONLY -- Agent K consumes this):

- `KeyPurpose::DatabaseEncryption` exists at line 46
- `derive_key(purpose: KeyPurpose) -> Vec<u8>` at line 198
- `derive_key_with_password(password_key: &[u8], purpose: KeyPurpose) -> Vec<u8>` at line 238
- The key is 32 bytes (AES-256)

**Will Produce:**

Modified `Database::new()` in `mod.rs`:

```rust
impl Database {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        // SQLCipher: derive key and set PRAGMA key BEFORE any other operation
        let encryption_key = crate::sys::security::machine_key::derive_key(
            crate::sys::security::machine_key::KeyPurpose::DatabaseEncryption
        );
        let hex_key = hex::encode(&encryption_key);
        conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", hex_key))?;

        migrations::run_migrations(&conn)?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }
}
```

New `encryption.rs` module with:

```rust
/// Detect if an existing database is unencrypted (pre-SQLCipher)
pub fn is_database_encrypted(path: &str) -> bool;

/// Migrate an unencrypted database to encrypted:
/// 1. Open unencrypted DB
/// 2. ATTACH new encrypted DB
/// 3. sqlcipher_export('encrypted')
/// 4. Swap files
pub fn migrate_to_encrypted(path: &str) -> Result<(), String>;

/// Handle the case where master password is not yet set
/// (use machine-only key derivation as fallback)
pub fn get_db_encryption_key() -> Vec<u8>;
```

Modified `lib.rs` DB init block to call `encryption::migrate_to_encrypted()` before opening.

**Interface Contract with Agent J:**

Agent K depends on Agent J adding `bundled-sqlcipher` feature to `Cargo.toml` line 62. Without this feature, `PRAGMA key` will be silently ignored and encryption will not work.

Agent K depends on `machine_key.rs` (read-only, existing code). The function `derive_key(KeyPurpose::DatabaseEncryption)` returns a 32-byte Vec<u8>. Agent K should hex-encode this for use as the SQLCipher PRAGMA key.

---

### Agent L -- SSO via Supabase

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/login/page.tsx`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/sso/route.ts` (NEW)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260224000000_add_sso_connections.sql` (NEW)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/sso.ts` (NEW -- SSO helper utilities)

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/auth/callback/route.ts` -- existing callback handles both OAuth and SSO code exchange already via `exchangeCodeForSession`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/services/supabase.ts` -- client config is fine as-is
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/services/supabase-server.ts` -- no changes needed
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/login/layout.tsx` -- metadata only, leave alone
- Any file under `apps/desktop/` -- Agent L works only in `apps/web/`

**Current State of Key Files:**

`app/login/page.tsx`:

- Client component with `LoginForm` function (line 18)
- Has email/password login (line 34-64)
- Has magic link login (line 66-94)
- Has OAuth login for GitHub and Google (line 96-104)
- Uses `getSupabaseClient()` from `../../services/supabase`
- Has `appUrl` helper, `redirectTo` with safe redirect validation
- **No SSO support exists**

`app/auth/callback/route.ts`:

- Handles OAuth code exchange via `supabase.auth.exchangeCodeForSession(code)` at line 29
- This ALREADY works for SSO -- Supabase SSO redirects also use a `code` parameter
- **No changes needed here**

`app/api/admin/security/route.ts`:

- Shows the admin auth pattern: `verifyAdminAccess()` checks Bearer token, validates admin via app_metadata or profiles table
- Agent L should follow this EXACT pattern for admin SSO endpoints

Existing Supabase migration naming convention:

- Format: `YYYYMMDDHHMMSS_description.sql`
- Latest: `20260223000000_resilience_security_fixes.sql`
- Agent L's migration should be `20260224000000_add_sso_connections.sql`

Existing schema has:

- `public.organizations` table with `id`, `name`, `slug`, `created_by` (from consolidated_schema.sql)
- `public.organization_members` with `organization_id`, `user_id`, `role`
- `public.profiles` with `id`, `email`, `display_name`, `avatar_url`, `account_status`

Supabase config (`supabase/config.toml`) at line 296-308:

- External OAuth providers listed include `apple`, `azure`, `github`, `google`, `keycloak`, etc.
- **No SSO/SAML configuration exists**

Web app dependencies (`package.json`):

- `@supabase/supabase-js: ^2.93.3` -- Has `auth.signInWithSSO({ domain })` method
- `@supabase/ssr: ^0.8.0`
- No WorkOS SDK (that is for Agent M)

**Will Produce:**

Modified `login/page.tsx` with SSO domain detection:

```typescript
// After user enters email, detect domain
const emailDomain = email.split('@')[1];

// Check if domain has SSO configured
const checkSSO = async (domain: string) => {
  const res = await fetch(`/api/admin/sso?action=check-domain&domain=${domain}`);
  // ... if SSO configured, show "Sign in with SSO" button
};

// SSO sign-in handler
const handleSSO = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithSSO({
    domain: emailDomain,
  });
  if (data?.url) {
    window.location.href = data.url;
  }
};
```

New `app/api/admin/sso/route.ts`:

```typescript
// GET /api/admin/sso - List SSO connections (admin only)
// GET /api/admin/sso?action=check-domain&domain=example.com - Public: check if domain has SSO
// POST /api/admin/sso - Create SSO connection (admin only)
// DELETE /api/admin/sso?connectionId=xxx - Delete SSO connection (admin only)
export async function GET(request: NextRequest) { ... }
export async function POST(request: NextRequest) { ... }
export async function DELETE(request: NextRequest) { ... }
```

New migration `20260224000000_add_sso_connections.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.sso_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  metadata_url text,
  metadata_xml text,
  domain text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT sso_connections_pkey PRIMARY KEY (id),
  CONSTRAINT sso_connections_domain_unique UNIQUE (domain)
);

ALTER TABLE public.sso_connections ENABLE ROW LEVEL SECURITY;
-- RLS policies allowing org admins/owners to manage SSO connections
```

---

### Agent M -- SCIM via WorkOS

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/webhooks/directory-sync/route.ts` (NEW)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/directory-sync/route.ts` (NEW)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/scim.ts` (NEW -- SCIM event handlers)
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260224000001_add_scim_fields.sql` (NEW)

**DO NOT TOUCH:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/login/page.tsx` -- Agent L's file
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/sso/route.ts` -- Agent L's file
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/supabase/migrations/20260224000000_add_sso_connections.sql` -- Agent L's migration
- Any file under `apps/desktop/` -- Agent M works only in `apps/web/`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/admin/security/route.ts` -- existing admin API, read-only reference

**Current State:**

No SCIM or WorkOS integration exists anywhere in the codebase.

Web `package.json` does not include `@workos-inc/node` SDK. Agent M needs to add it.

Existing `profiles` table columns (from consolidated_schema + later migrations):

- `id`, `email`, `display_name`, `avatar_url`, `created_at`, `updated_at`, `account_status`
- **No `external_id`, `provisioning_source`, or `provisioned_at` columns**

Existing `organization_members` table columns:

- `organization_id`, `user_id`, `role`, `joined_at`
- **No SCIM-related columns**

Migration naming: Agent M's migration must be `20260224000001_add_scim_fields.sql` (one timestamp after Agent L's `20260224000000`).

Admin auth pattern from `app/api/admin/security/route.ts`:

- Uses `verifyAdminAccess()` which checks Bearer token -> `supabase.auth.getUser(token)` -> checks `app_metadata.role === 'admin'` with fallback to `profiles.is_admin`
- Agent M should copy/import this exact pattern

**Will Produce:**

New dependency in `package.json`: `"@workos-inc/node": "^7.0.0"` (Agent M should add this).

New webhook handler `app/api/webhooks/directory-sync/route.ts`:

```typescript
// Verifies WorkOS webhook signature
// Handles events:
//   dsync.user.created -> upsert profile with external_id, provisioning_source='workos'
//   dsync.user.updated -> update profile email/display_name
//   dsync.user.deleted -> deactivate profile (set account_status='disabled')
//   dsync.group.created -> create org or team mapping
//   dsync.group.updated -> update org/team name
//   dsync.group.deleted -> handle group removal
//   dsync.group.user_added -> add user to org_members
//   dsync.group.user_removed -> remove user from org_members
export async function POST(request: NextRequest) { ... }
```

New admin API `app/api/admin/directory-sync/route.ts`:

```typescript
// GET /api/admin/directory-sync - List directory sync configurations
// POST /api/admin/directory-sync - Configure WorkOS directory connection
// DELETE /api/admin/directory-sync?id=xxx - Remove directory connection
export async function GET(request: NextRequest) { ... }
export async function POST(request: NextRequest) { ... }
export async function DELETE(request: NextRequest) { ... }
```

New migration `20260224000001_add_scim_fields.sql`:

```sql
-- Add SCIM provisioning fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS provisioning_source text CHECK (provisioning_source IN ('manual', 'workos', 'scim', 'okta', 'azure_ad')),
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_external_id ON public.profiles(external_id) WHERE external_id IS NOT NULL;

-- Add SCIM fields to organization_members
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS provisioning_source text,
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

-- Directory sync connections table
CREATE TABLE IF NOT EXISTS public.directory_sync_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workos_directory_id text NOT NULL,
  provider_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT directory_sync_connections_pkey PRIMARY KEY (id)
);

ALTER TABLE public.directory_sync_connections ENABLE ROW LEVEL SECURITY;
```

---

### Agent N -- Filesystem Deny List Expansion

**Allowed Files:**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/capabilities/default.json`

**DO NOT TOUCH:**

- Any Rust source files
- Any TypeScript source files
- Any other JSON configuration files

**Current State:**

`capabilities/default.json` has multiple permission blocks with deny lists. The current deny entries across blocks include:

- `$HOME/.ssh/**`
- `$HOME/.aws/**`
- `$HOME/.gnupg/**`
- `$HOME/.kube/**`
- `$HOME/.config/gcloud/**`
- `$HOME/Library/Keychains/**`
- `/etc/passwd`
- `/etc/shadow`

**Will Produce:**

Add these paths to ALL relevant deny lists (fs:allow-read-file, fs:allow-read-dir, fs:allow-read-text-file, fs:allow-read-text-file-lines, fs:allow-write-file, fs:allow-write-text-file, fs:allow-copy-file, fs:allow-remove, fs:allow-rename):

```json
{ "path": "$HOME/.docker/**" },
{ "path": "$HOME/.npmrc" },
{ "path": "$HOME/.pypirc" },
{ "path": "$HOME/.netrc" },
{ "path": "$HOME/.azure/**" },
{ "path": "$HOME/.config/gh/**" },
{ "path": "$HOME/.config/heroku/**" },
{ "path": "$HOME/.config/op/**" }
```

---

## Interface Contracts

### Agent J -> Agent K (Cargo.toml bundled-sqlcipher)

- **What:** Agent J changes `Cargo.toml` line 62 from `features = ["bundled", ...]` to `features = ["bundled-sqlcipher", ...]`
- **Location:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/Cargo.toml`
- **Contract:** After this change, rusqlite will compile with SQLCipher support. The `PRAGMA key` SQL command becomes functional. Without this change, `PRAGMA key` is silently ignored by standard SQLite.
- **Verification:** Agent K's code should NOT conditionally check for SQLCipher availability -- it must rely on Agent J's Cargo.toml change being present.

### Agent K -> Rest of system (Database encryption key)

- **What:** Agent K reads `machine_key::derive_key(KeyPurpose::DatabaseEncryption)` which returns `Vec<u8>` (32 bytes)
- **Location:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/security/machine_key.rs` (read-only)
- **Contract:** The key is deterministic per machine. Agent K hex-encodes it and uses `PRAGMA key = "x'<hex>'"` format for SQLCipher.

### Agent J -> All HTTP consumers (HttpClientFactory)

- **What:** Agent J creates `HttpClientFactory::build_client()` that all providers should use
- **Location:** `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/core/llm/providers/http_client.rs` (or new `http_client_factory.rs`)
- **Consumers:** `ManagedCloudProvider::new()`, `OllamaProvider::new()`, `HttpClient::new()`
- **Contract:** Agent J refactors all three providers to use the factory. The factory reads proxy settings from app state or env vars. Callers get a `reqwest::Client` that already has proxy and CA cert configuration applied.

### Agent L -> Agent M (migration ordering)

- **What:** Agent L creates migration `20260224000000_add_sso_connections.sql`, Agent M creates `20260224000001_add_scim_fields.sql`
- **Contract:** Agent M's migration runs AFTER Agent L's. Agent M should NOT reference `sso_connections` table. These migrations are independent in schema but must be ordered by timestamp.

### Agent L -> Auth callback (existing, no change needed)

- **What:** SSO login redirects back to `/auth/callback` with a `code` parameter
- **Location:** `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/auth/callback/route.ts`
- **Contract:** The existing callback already calls `supabase.auth.exchangeCodeForSession(code)` which handles both OAuth and SSO codes. NO CHANGES NEEDED to the callback.

### Agent M -> WorkOS webhook (new, environment variables)

- **What:** Agent M's webhook handler needs `WORKOS_API_KEY` and `WORKOS_WEBHOOK_SECRET` environment variables
- **Contract:** These must be set in the deployment environment. Agent M should document the required env vars but NOT commit actual secrets.

---

## DO NOT TOUCH Sections

### Critical -- No Agent Should Modify:

| File                                                     | Reason                                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/desktop/src-tauri/src/lib.rs` (lines 1-139, 159+)  | Core app initialization. Only Agent K may touch lines 140-158 (DB init block) |
| `apps/desktop/src-tauri/src/sys/security/machine_key.rs` | Shared security infrastructure. Read-only for Agent K                         |
| `apps/desktop/src-tauri/src/data/db/migrations.rs`       | Migration runner. No changes needed for SQLCipher                             |
| `apps/desktop/src-tauri/src/data/db/repository.rs`       | Repository queries. Encryption is transparent to queries                      |
| `apps/desktop/src-tauri/src/data/db/models.rs`           | Data models. No changes needed                                                |
| `apps/web/app/auth/callback/route.ts`                    | Auth callback. Already handles SSO codes                                      |
| `apps/web/services/supabase.ts`                          | Client setup. No changes needed                                               |
| `apps/web/services/supabase-server.ts`                   | Server client. No changes needed                                              |
| `apps/web/app/login/layout.tsx`                          | Metadata only                                                                 |
| `apps/web/app/api/admin/security/route.ts`               | Existing admin API. Reference only                                            |
| `apps/web/supabase/config.toml`                          | Local dev config. SSO is configured via Supabase dashboard, not config.toml   |
| `packages/types/`                                        | Shared types package                                                          |
| `packages/utils/`                                        | Shared utilities package                                                      |
| `services/api-gateway/`                                  | API gateway (separate service)                                                |
| `apps/extension/`                                        | Browser extension (not in scope)                                              |

### Conflict Prevention Matrix:

| File                                  | Agent J | Agent K       | Agent L | Agent M | Agent N |
| ------------------------------------- | ------- | ------------- | ------- | ------- | ------- |
| `Cargo.toml`                          | WRITE   | **FORBIDDEN** | --      | --      | --      |
| `data/db/mod.rs`                      | --      | WRITE         | --      | --      | --      |
| `providers/http_client.rs`            | WRITE   | --            | --      | --      | --      |
| `providers/managed_cloud_provider.rs` | WRITE   | --            | --      | --      | --      |
| `providers/ollama.rs`                 | WRITE   | --            | --      | --      | --      |
| `providers/mod.rs`                    | WRITE   | --            | --      | --      | --      |
| `data/settings/models.rs`             | WRITE   | --            | --      | --      | --      |
| `settingsStore.ts`                    | WRITE   | --            | --      | --      | --      |
| `SettingsPanel.tsx`                   | WRITE   | --            | --      | --      | --      |
| `lib.rs` (lines 140-158)              | --      | WRITE         | --      | --      | --      |
| `login/page.tsx`                      | --      | --            | WRITE   | --      | --      |
| `capabilities/default.json`           | --      | --            | --      | --      | WRITE   |
| `migration 20260224000000`            | --      | --            | WRITE   | --      | --      |
| `migration 20260224000001`            | --      | --            | --      | WRITE   | --      |
| `api/admin/sso/`                      | --      | --            | WRITE   | --      | --      |
| `api/webhooks/directory-sync/`        | --      | --            | --      | WRITE   | --      |
| `api/admin/directory-sync/`           | --      | --            | --      | WRITE   | --      |
| `web/package.json`                    | --      | --            | --      | WRITE   | --      |

---

## Implementation Details for Each Agent

### Agent J: Detailed Steps

1. **Cargo.toml** (TWO changes):
   - Line 62: `rusqlite = { version = "0.31", features = ["bundled-sqlcipher", "backup", "blob", "chrono"] }`
   - Line 73: `reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls", "rustls-tls-native-roots", "multipart", "blocking"], default-features = false }`
   - Note: `rustls-tls-native-roots` makes reqwest trust the system's native certificate store via `rustls-native-certs` crate, which is essential for corporate proxy CA certs

2. **HttpClientFactory** (in `http_client.rs` or new file):
   - Read `ProxySettings` from function parameter
   - If proxy enabled: `client_builder.proxy(Proxy::https(&https_proxy)?)` etc.
   - Read env vars `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` as fallback
   - If `custom_ca_cert_path` set: read PEM file, `reqwest::Certificate::from_pem()`, `client_builder.add_root_certificate(cert)`
   - Keep existing retry middleware logic

3. **Refactor all providers** to use factory:
   - `ManagedCloudProvider::new()` line 128-134: Replace `Client::builder()...build()` with `HttpClientFactory::build_client(proxy_settings)?`
   - `OllamaProvider::new()` line 61-65: Replace `Client::builder()...build()` with factory
   - `HttpClient::new()` line 34-38: Replace `Client::builder()...build()` with factory

4. **Settings model** in `data/settings/models.rs`:
   - Add `Network` variant to `SettingCategory` enum (update both `as_str()` and `from_str()`)
   - Add `ProxySettings` struct
   - Add `proxy_settings: ProxySettings` field to `AppSettings`

5. **Tauri commands** in new `sys/commands/proxy.rs`:
   - `#[tauri::command] pub async fn get_proxy_settings(...) -> Result<ProxySettings, String>`
   - `#[tauri::command] pub async fn set_proxy_settings(...) -> Result<(), String>`
   - Register these commands in `lib.rs` command list

6. **Frontend** proxy settings component and SettingsPanel tab

### Agent K: Detailed Steps

1. **New `data/db/encryption.rs`**:
   - `is_database_encrypted(path: &str) -> bool`: Try to read first 16 bytes. SQLite header starts with "SQLite format 3\0". If the file exists but the header is different, it is encrypted.
   - `get_db_encryption_key() -> Vec<u8>`: Call `machine_key::derive_key(KeyPurpose::DatabaseEncryption)`. Returns 32-byte key.
   - `migrate_to_encrypted(db_path: &str) -> Result<(), String>`:
     ```
     1. Check if already encrypted (return Ok if so)
     2. Open unencrypted DB
     3. Create temp encrypted DB path
     4. ATTACH encrypted DB with key
     5. SELECT sqlcipher_export('encrypted')
     6. DETACH
     7. Move original to .bak, move encrypted to original path
     ```
   - `get_db_encryption_key_hex() -> String`: hex-encode the raw key

2. **Modify `data/db/mod.rs`**:
   - Add `pub mod encryption;`
   - Modify `Database::new(path: &str)`:

     ```rust
     pub fn new(path: &str) -> Result<Self> {
         // First: migrate unencrypted DB if needed
         if std::path::Path::new(path).exists() && !encryption::is_database_encrypted(path) {
             encryption::migrate_to_encrypted(path)
                 .map_err(|e| rusqlite::Error::SqliteFailure(
                     rusqlite::ffi::Error::new(1), Some(e)
                 ))?;
         }

         let conn = Connection::open(path)?;

         // PRAGMA key must be the FIRST statement after opening
         let key_hex = encryption::get_db_encryption_key_hex();
         conn.pragma_update(None, "key", &format!("x'{}'", key_hex))?;

         migrations::run_migrations(&conn)?;
         Ok(Self { conn: Arc::new(Mutex::new(conn)) })
     }
     ```

   - Modify `Database::in_memory()` for tests (in-memory SQLCipher does not need PRAGMA key, but adding it is harmless)

3. **Modify `lib.rs`** lines 140-158 (DB init block):
   - The `Connection::open(&db_path)` at line 144 and the PRAGMA block at lines 147-153 need updating
   - PRAGMA key must come BEFORE journal_mode and other pragmas
   - Add the encryption key pragma:

     ```rust
     let conn = Connection::open(&db_path).context("Failed to open database")?;

     // SQLCipher: set encryption key (must be first pragma)
     let key_hex = crate::data::db::encryption::get_db_encryption_key_hex();
     conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";\n", key_hex))
         .context("Failed to set database encryption key")?;

     conn.execute_batch("
         PRAGMA busy_timeout = 5000;
         ...
     ").context("Failed to set database pragmas")?;
     ```

   - Also handle ALL other `Connection::open(&db_path)` calls in lib.rs (lines 236, 255, 283, 543, 556, 562, 572, 603, 641) -- these ALL need the PRAGMA key set after opening. Create a helper function: `fn open_encrypted_connection(path: &Path) -> Result<Connection>` to avoid repetition.

### Agent L: Detailed Steps

1. **Modify `login/page.tsx`**:
   - Add state: `ssoAvailable`, `ssoLoading`, `emailDomain`
   - On email blur/change (debounced): extract domain, call `/api/admin/sso?action=check-domain&domain=xxx`
   - If SSO available: show "Sign in with SSO" button, hide password field
   - SSO handler: `supabase.auth.signInWithSSO({ domain: emailDomain })` -> redirect to `data.url`

2. **New `app/api/admin/sso/route.ts`**:
   - `GET` with `action=check-domain`: PUBLIC endpoint, returns `{ ssoAvailable: boolean }` for a domain
   - `GET` without action or `action=list`: ADMIN endpoint, lists all SSO connections
   - `POST`: ADMIN endpoint, creates SSO connection via Supabase admin API
   - `DELETE`: ADMIN endpoint, removes SSO connection
   - Use same `verifyAdminAccess()` pattern from `security/route.ts`
   - For creating SSO in Supabase: use service role to call Supabase Auth admin API

3. **New migration `20260224000000_add_sso_connections.sql`**:
   - Create `sso_connections` table (see schema above)
   - Add RLS policies for org admin access
   - Add index on `domain` column

### Agent M: Detailed Steps

1. **Add WorkOS SDK** to `apps/web/package.json`:
   - `"@workos-inc/node": "^7.0.0"` in dependencies

2. **New webhook handler `app/api/webhooks/directory-sync/route.ts`**:
   - Verify WorkOS webhook signature using `WORKOS_WEBHOOK_SECRET`
   - Parse event payload, switch on event type
   - For user events: upsert profiles via Supabase service role client
   - For group events: manage organization_members
   - Return 200 for successful processing, 400 for unknown events

3. **New admin API `app/api/admin/directory-sync/route.ts`**:
   - CRUD for directory sync configuration
   - Follow admin auth pattern from security/route.ts

4. **New migration `20260224000001_add_scim_fields.sql`**:
   - Add columns to profiles and organization_members (see schema above)
   - Create directory_sync_connections table

5. **New utility `lib/scim.ts`**:
   - Functions for each WorkOS event type
   - Maps WorkOS user fields to profiles columns
   - Maps WorkOS group fields to organization_members

---

## Environment Variables Required

### Agent L (SSO):

No new env vars required. SSO is managed via Supabase Auth admin API using the existing `SUPABASE_SERVICE_ROLE_KEY`.

### Agent M (SCIM/WorkOS):

```
WORKOS_API_KEY=sk_...           # WorkOS API key
WORKOS_WEBHOOK_SECRET=whsec_... # WorkOS webhook signing secret
WORKOS_CLIENT_ID=client_...     # WorkOS client ID (optional, for admin SDK)
```

---

## Verification Checklist

Before spawning agents, verify:

- [x] All file paths exist in the codebase (verified via Read/Glob)
- [x] All interface contracts are compatible (machine_key exports derive_key, login uses signInWithSSO, callback handles codes)
- [x] No circular dependencies between agent scopes (J->K is one-way via Cargo.toml; L and M are independent)
- [x] DO NOT TOUCH sections are clearly communicated
- [x] Migration ordering is deterministic (L: 20260224000000, M: 20260224000001)
- [x] Agent J handles BOTH Cargo.toml changes (rustls AND sqlcipher) to prevent conflict with Agent K
- [x] Agent K's lib.rs edits are scoped to lines 140-158 and helper functions for other Connection::open calls
- [x] No two agents write to the same file

---

## Risk Notes

1. **SQLCipher compile time**: Switching from `bundled` to `bundled-sqlcipher` significantly increases Rust compile time (SQLCipher includes OpenSSL). First build after the change may take 5-10 minutes longer.

2. **SQLCipher migration risk**: If the migration from unencrypted to encrypted DB fails mid-way, data could be lost. Agent K MUST keep the original `.bak` file and implement rollback.

3. **Supabase SSO**: `signInWithSSO({ domain })` requires that the SSO connection is configured in Supabase Auth (not just in our `sso_connections` table). The admin API must call Supabase's auth admin endpoint to register the SAML/OIDC provider.

4. **WorkOS webhook security**: The webhook endpoint must verify the WorkOS signature. If `WORKOS_WEBHOOK_SECRET` is not set, the endpoint should return 500 and log an error, never process unverified webhooks.

5. **Proxy settings + reqwest**: The `rustls-tls-native-roots` feature may conflict with `rustls-tls` on some platforms. Test on macOS, Windows, and Linux. If issues arise, consider using `native-tls-vendored` instead.

6. **lib.rs has 8+ Connection::open calls**: Agent K must handle ALL of them, not just the first one at line 144. Each `Connection::open` needs the PRAGMA key set. A helper function is strongly recommended.
