# Sprint 1 — Vault rewire (FIX-001 / FIX-002 / FIX-004)

Drafted 2026-05-02 after read-through of the security stack. The plan in `make-a-plan-to-purrfect-papert.md` understated the scope; this doc captures what the code actually requires before any of it gets touched.

## Investigation findings (what the audit missed)

The infrastructure is **mostly already there**. The audit said the master-password manager is dead code with zero callers — that part is true. What it didn't say:

- `MasterPasswordManager` (`apps/desktop/src-tauri/src/sys/security/master_password.rs:148-630`) ships with full Argon2id + HKDF, migration tracking tables, lock/unlock, derive_key per `KeyPurpose`. **Done.**
- `MasterPasswordState` is wired as Tauri State at startup (`apps/desktop/src-tauri/src/lib.rs:321-328`) with a `new_degraded()` fallback when the DB is missing. **Done.**
- All 11 `master_password_*` IPC commands are registered in `lib.rs:2061-2071` (`is_configured`, `is_unlocked`, `get_status`, `setup`, `verify`, `unlock`, `lock`, `change`, `needs_migration`, `start_migration`, `complete_migration`). **Done.**
- The Settings UI exists at `apps/desktop/src/components/Settings/MasterPasswordSettings.tsx` with `setup` / `unlock` / `change` views. **Done.**
- `derive_key_with_password()` exists in `machine_key.rs:238` but, per the audit, has zero callers. **Confirmed.**
- All `KeyPurpose` variants the plan mentioned already exist (`MasterEncryption`, `JwtSecret`, `DatabaseEncryption`, `McpCredentials`, `ApiKeys`, `EmailCredentials`, `CalendarCredentials`, `CloudEncryption`). **Done.** The plan's request to add `Messaging(Platform)` and `SupabaseAuth` variants is still outstanding.

## What's actually broken

Two things, both narrow:

### Bug 1 — `encrypt_credential` in mcp_oauth.rs uses machine-only key

`apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1269-1286`:

```rust
fn encrypt_credential(value: &str) -> Result<String, String> {
    let key = derive_key(KeyPurpose::McpCredentials);  // <- machine-only
    ...
}
```

Used by `save_api_key` (line 1739) and OAuth credential storage (lines 1249, 1255). Plus four more `derive_key(KeyPurpose::McpCredentials)` sites in `apps/desktop/src-tauri/src/core/mcp/config.rs:1046, 1090, 1117, 1158` and one `KeyPurpose::ApiKeys` site in `core/mcp/extensions/manager.rs:557`. **Total: 8 call sites that need the master-password derivation, all in the MCP/credentials family.**

### Bug 2 — messaging.rs writes plaintext credentials

`apps/desktop/src-tauri/src/sys/commands/messaging.rs:71-237`. Three handlers (`connect_slack`, `connect_whatsapp`, `connect_teams`) build `serde_json::json!({...})` of secrets and INSERT as plaintext `messaging_connections.credentials`. The TODOs at lines 87, 140, 199 acknowledge this and reference "FIX-R10". `send_message` reads them back at line 245 and uses them in API calls.

### Bug 3 — Supabase tokens encrypted with public-derivable key

`apps/desktop/src/lib/supabase.ts:28-65, 87-104`. Key material at line 33 is the constant `'agiworkforce-storage-v1-' + window.location.hostname` (in Tauri the hostname is fixed `tauri://localhost`). Salt at line 41 is the hardcoded constant `'agi-supabase-storage-salt-2026'`. Author's own comment at lines 24-25 admits _"anyone with source can reproduce the derivation"_.

## Proposed fix sequence (one PR, in this order)

The plan file is right that this must land in one shot — partial migration leaves the database with mixed-key rows.

### Step 1 — Add 2 new `KeyPurpose` variants

`apps/desktop/src-tauri/src/sys/security/machine_key.rs:42`:

```rust
pub enum KeyPurpose {
    ...existing variants...
    Messaging,        // FIX-002: Slack/WhatsApp/Teams credentials
    SupabaseAuth,     // FIX-004: Tauri-side Supabase session
}
```

Plus `as_str()` arms. Trivial.

### Step 2 — Add `MasterPasswordEncryption` helper struct

New file `apps/desktop/src-tauri/src/sys/security/master_password_encryption.rs`. One struct that wraps `Arc<MasterPasswordState>` and exposes:

```rust
impl MasterPasswordEncryption {
    pub fn encrypt(&self, purpose: KeyPurpose, value: &str) -> Result<String, MasterPasswordError>;
    pub fn decrypt(&self, purpose: KeyPurpose, ciphertext: &str) -> Result<String, MasterPasswordError>;
    pub fn is_unlocked(&self) -> bool;
}
```

`encrypt`:

1. `manager.derive_key(purpose)` → returns `AppLocked` if vault not unlocked
2. AES-256-GCM with random nonce, base64(nonce || ciphertext)

`decrypt`:

1. base64-decode, split nonce/ciphertext
2. `manager.derive_key(purpose)` → same `AppLocked` behavior
3. AES-256-GCM verify

Both surface `MasterPasswordError::AppLocked` to the IPC layer so the frontend can prompt for unlock.

### Step 3 — Rewire the 8 MCP/credentials call sites

| File                             | Line                        | Change                                                            |
| -------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| `mcp_oauth.rs`                   | 1269 (`encrypt_credential`) | take `&MasterPasswordEncryption`, return `Result<String, String>` |
| `mcp_oauth.rs`                   | 1249, 1255 (OAuth)          | thread the encryption helper through                              |
| `mcp_oauth.rs`                   | 1739 (`save_api_key`)       | inject Tauri `State<'_, MasterPasswordEncryption>`                |
| `core/mcp/config.rs`             | 1046, 1090, 1117, 1158      | same                                                              |
| `core/mcp/extensions/manager.rs` | 557                         | same                                                              |

For decrypt — same pattern in the read paths. Need to find the matching `decrypt_credential` calls (haven't traced yet but they're alongside).

### Step 4 — Encrypt messaging credentials

`messaging.rs:71-237`:

- Build the same `json!({...})` blob
- Encrypt via `MasterPasswordEncryption::encrypt(KeyPurpose::Messaging, &json)`
- Store ciphertext in `messaging_connections.credentials`

`messaging.rs:245-310` `send_message`:

- Decrypt via `MasterPasswordEncryption::decrypt(KeyPurpose::Messaging, &row_value)`
- Parse the resulting JSON

### Step 5 — Tauri-route Supabase tokens

New IPC commands in Rust:

```rust
#[tauri::command] pub async fn supabase_token_set(key: String, value: String, ...) -> Result<(), String>
#[tauri::command] pub async fn supabase_token_get(key: String, ...) -> Result<Option<String>, String>
#[tauri::command] pub async fn supabase_token_remove(key: String, ...) -> Result<(), String>
```

Each uses `MasterPasswordEncryption` with `KeyPurpose::SupabaseAuth` and stores in a new `supabase_tokens(key, ciphertext)` table.

`apps/desktop/src/lib/supabase.ts`:

```typescript
import { isTauri } from '@agiworkforce/runtime';

const secureStorage = isTauri()
  ? {
      getItem: (key) => invoke<string | null>('supabase_token_get', { key }),
      setItem: (key, value) => invoke<void>('supabase_token_set', { key, value }),
      removeItem: (key) => invoke<void>('supabase_token_remove', { key }),
    }
  : {
      // existing localStorage adapter — web build only, no Tauri-spurious encryption
      getItem: (key) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key, value) => {
        localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key) => {
        localStorage.removeItem(key);
        return Promise.resolve();
      },
    };
```

Delete `deriveStorageKey` / `encryptValue` / `decryptValue` from the Tauri build entirely.

### Step 6 — Atomic migration

Run on first app launch after the upgrade, gated by `master_password_needs_migration`:

1. Block all LLM calls until migration completes (frontend gate via `master_password_get_status().needs_migration`).
2. Prompt user for master password (use existing `MasterPasswordSettings` setup view).
3. After unlock, in a single SQLite transaction:
   - For each `settings_v2` row with `category = 'security'` and `encrypted = 1`:
     - decrypt with old `derive_key(KeyPurpose::McpCredentials)` (machine-only)
     - re-encrypt with `MasterPasswordEncryption::encrypt(KeyPurpose::McpCredentials, ...)`
     - update row
   - For each `messaging_connections` row:
     - re-encrypt the existing JSON with `MasterPasswordEncryption::encrypt(KeyPurpose::Messaging, ...)`
   - For each `localStorage` Supabase token:
     - read (still plaintext / weak-encrypted), promote to IPC-stored ciphertext, `localStorage.removeItem`
4. `master_password_complete_migration()` flips the row in `master_password_migration` table.

If anything in step 3 fails, the transaction rolls back. The user can retry.

## Risks

- **The migration must be atomic.** A crash mid-migration would leave half the rows under the old key and half under the new. Wrap each table's pass in its own transaction.
- **Cold-start UX**: the LLM router must refuse to call providers when `is_unlocked() == false`. Otherwise the user types a prompt, the call fails with `AppLocked`, the UI is confused. Best place to gate: `apps/desktop/src-tauri/src/core/llm/llm_router.rs` — early-return `Err(LlmError::VaultLocked)` from `route()`/`route_with_fallback()` when state says locked.
- **Test coverage**: the existing `MasterPasswordManager` tests cover the manager but nothing exercises the encrypt/decrypt round-trip through `MasterPasswordEncryption`. Add 6+ tests:
  1. encrypt + decrypt round-trip
  2. encrypt fails when locked
  3. decrypt fails when locked
  4. ciphertext from one purpose doesn't decrypt under another
  5. ciphertext from one machine doesn't decrypt on another (mock different machine_id)
  6. corrupted ciphertext returns descriptive error
- **Rolling back**: if anything goes wrong post-migration, the user has no way to revert short of restoring from backup. Document the migration in the changelog and recommend a backup before upgrade.

## Estimated effort

- Step 1: 30 min
- Step 2: 90 min (struct + tests)
- Step 3: 2 hr (8 call sites, careful refactor)
- Step 4: 1 hr (3 connect handlers + send_message)
- Step 5: 2 hr (Rust IPC + TS branching + new SQLite table + migration)
- Step 6: 3 hr (the migration logic itself + thorough testing)
- Cold-start UX gate: 1 hr

**Total: ~10 hours of focused work.** Bigger than a single session. Recommend splitting into:

- PR 1: Steps 1, 2 (helper + variants + tests). No behavior change. Safe to merge alone.
- PR 2: Steps 3, 4 (rewire MCP + messaging) + migration of those tables in step 6. Behavior change but contained.
- PR 3: Step 5 (Supabase token rerouting) + remaining migration + cold-start UX gate.

## Decision points for user

1. **Add `Messaging` as flat variant or `Messaging(MessagingPlatform)` parameterized?** Plan says parameterized. I lean flat — the per-platform key separation is theatre when one master key controls all purposes anyway. Parameterized adds enum noise without security benefit.
2. **Encrypt `messaging_connections.credentials` as one blob, or split into per-field columns?** Plan implies blob. Concur — the connectors already parse the JSON on read.
3. **Pre-existing settings_v2 rows from earlier installs**: there's a real risk they were encrypted with `derive_key(KeyPurpose::ApiKeys)` rather than `McpCredentials`. Step 6 needs to attempt both purpose decryptions on each row before giving up. Worth grepping all existing `KeyPurpose::*` use sites and treating them as legacy candidates.
4. **What happens if user forgets master password?** Currently: data unrecoverable (correct security posture). Need to surface this clearly in the setup UX. Suggest adding a `MasterPasswordSettings` warning before setup confirm.
