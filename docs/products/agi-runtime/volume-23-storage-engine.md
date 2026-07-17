# AGI Runtime — Volume 23 — Storage Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/cli/AGENTS.md` and `apps/desktop/AGENTS.md` (nearest surface
owners of local stores); `docs/current/source-of-truth.md`; `docs/products/README.md`
(binding canon). Grounded in real repo paths: `apps/cli/src/config.rs`,
`apps/cli/src/features/session/mod.rs`, `apps/cli/src/agent/history.rs`,
`apps/desktop/src-tauri/src/data/settings/service.rs`,
`apps/desktop/src-tauri/src/sys/security/{storage.rs,machine_key.rs,secret_manager.rs,audit_logger.rs,log_redaction.rs}`,
`apps/desktop/src-tauri/src/sys/logging/mod.rs`,
`apps/desktop/src-tauri/src/sys/telemetry/logging.rs`,
`apps/desktop/src-tauri/src/core/mcp/logs.rs`,
`apps/mobile/stores/settingsStore.ts`, `apps/mobile/lib/biometricFlagStore.ts`,
`crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`,
`crates/agiworkforce-app-server/src/lib.rs`,
`crates/agiworkforce-utils-cache/src/lib.rs`,
`apps/web/app/api/{chat,memory,projects}/sync/route.ts`,
`apps/web/db/neon/{0005,0021,0022,0023,0028,0038,0042,0043}_*.sql`.

## Overview & stance

The Storage Engine is the AGI Runtime's set of persistence surfaces: where configuration,
sessions, conversations, caches, provider settings, and logs live. It is an internal
layer, not a user product, and it is deliberately **split by trust boundary**. Two
storage worlds exist and never blur: **local stores** on the host (SQLite, TOML, encrypted
MMKV, `output_path` files) that hold Local and BYOK state, and **Neon Postgres** (RLS,
Clerk-scoped) that holds only Managed-Cloud rows. Local and BYOK rows **never** enter Neon
delta-sync; a Local→BYOK move is an explicit fork (context selection, secret scan, payload
preview, provider label, consent), not a storage migration.

Per-surface reality follows the trust matrix: **Desktop/CLI/VS Code** keep local stores
plus Neon for cloud rows; **Mobile** keeps on-device stores (encrypted MMKV + SecureStore)
plus Neon; **Web** is Cloud-only (Neon); **Chrome** is `chrome.storage.local` only,
device-scoped and never synced. Secrets are encrypted at rest, never plaintext. Under
Remote Control the phone/web window persists nothing authoritative — the session and its
stores stay on the host.

## Configuration Storage

Requirement: layered config (global → project → env), typed and versioned, with the
active trust mode recorded per profile; no secrets in plaintext config files.

**✅ Built (CLI).** `apps/cli/src/config.rs` loads `~/.agiworkforce/config.toml` into
`CliConfig`, tracks provenance in `ConfigSource { global_path, project_path,
env_overrides }`, and carries `UiConfig.privacy_mode` (`local | byok | managed`) so the
trust boundary is part of config, not an afterthought. **✅ Built (Desktop).**
`apps/desktop/src-tauri/src/data/settings/service.rs` persists settings in the local SQLite
`settings` table (`INSERT OR REPLACE INTO settings (key, value, encrypted)`; see
`sys/security/storage.rs`). **✅ Built (Mobile).** `apps/mobile/stores/settingsStore.ts`
rehydrates from an **encrypted MMKV** store (deferred until the encrypted store is open —
`AUDIT-FIX: MMKV-RACE`). **🟡 Partial (Cloud settings sync).** Migration
`apps/web/db/neon/0042_settings_cloud_sync.sql` adds a monotonic `server_version` cursor to
the single-row `user_settings` (0028) reusing the 0038 sequence/trigger; settings sync is
**allowlist-gated and lands last** by canon, so cross-device settings propagation is 🔭.

## Session Storage

Requirement: durable per-session state (id, kind, status, timing, output location) with
local-only retention; sessions never leave the host or sync to Cloud.

**✅ Built.** `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` defines `Task { id: TaskId
(Uuid), kind: TaskKind, status: TaskStatus, command, output_path: PathBuf, started_at,
ended_at, exit_code, error }` with validated status transitions (`TaskError::
InvalidTransition`); task output is streamed to `output_path` on the local disk. The CLI's
session layer lives in `apps/cli/src/features/session/mod.rs`, with agent turn history in
`apps/cli/src/agent/history.rs`. The local tool host bounds live sessions via
`AppServerConfig { max_sessions, session_timeout_secs }`
(`crates/agiworkforce-app-server/src/lib.rs`). **Sessions stay local by design** — matching
canon's "CLI/VS Code/Desktop sessions stay local" and the Remote-Control model (compute on
the host). A durable cross-restart session-resume store and cross-surface presence
(`surface_heartbeats`) are **🔭 Planned** (the table does not exist; only
`apps/web/app/api/control-plane/status` is stubbed).

## Conversation Storage

Requirement: store chat conversations, messages, and artifacts; local chats stay
on-device; only Managed-Cloud chats sync via cursor + tombstone delta-sync with idempotent
upsert and server-set ownership.

**✅ Built (Cloud).** `apps/web/app/api/chat/sync/route.ts` implements delta-sync: `GET
?since=<server_version cursor>` returns conversations + messages + artifacts with
`server_version > cursor` (including tombstones), scoped to the Clerk user; `POST` does an
**idempotent UPSERT by id** with `user_id` set **server-side**, messages append-only (only
a `deleted_at` tombstone mutates an existing row). Schema: `0021_shared_conversations.sql`,
`0022_chat_features.sql`, `0038_cloud_sync_versioning.sql` (the shared `server_version`
sequence/trigger), with RLS from `0037_rls_user_isolation.sql`. Web ↔ Mobile ↔ Desktop
only. **✅ Built (Local).** Local/BYOK conversations persist in the host's SQLite / encrypted
MMKV and are **excluded** from these endpoints — no Local or BYOK row is ever written to
Neon. A local↔cloud handoff must be an explicit, redacted fork, never automatic.

## Cache Storage

Requirement: bounded, evicting in-memory cache with content-addressed keys; caches are
disposable and never a trust-boundary crossing.

**✅ Built.** `crates/agiworkforce-utils-cache/src/lib.rs` provides `BlockingLruCache<K,V>`
(Tokio-mutex-guarded `lru::LruCache`, capacity-bounded eviction, `get_or_insert_with` /
`get_or_try_insert_with`, current-thread-safe locking after the `P1-CACHE-PANIC`
regression) and `sha1_digest(bytes)` for content-based keys to avoid path-only staleness.
Caches are **in-memory and process-scoped** — disposable by construction, so a cache never
persists cross-trust data. A persistent on-disk cache (encrypted, trust-tagged) is
**🔭 Planned**; if built, cached Local/BYOK bytes must never reach the Cloud path.

## Provider Storage — provider settings

Requirement: persist provider configuration and BYOK secrets encrypted at rest on the dev
surfaces only; Web and Mobile hold no provider keys; Managed-Cloud provider access is
server-brokered.

**✅ Built (CLI).** `CliConfig.providers: HashMap<String, ProviderConfig>`
(`apps/cli/src/config.rs`) stores non-secret provider config. **✅ Built (Desktop, encrypted
at rest).** `apps/desktop/src-tauri/src/sys/security/storage.rs` stores BYOK keys via
`store_api_key`/`retrieve_api_key` in the SQLite `api_keys` table, encrypted with
**AES-256-GCM** (per-write random nonce). Password mode derives the key with PBKDF2-HMAC-
SHA256 at 600,000 iterations; a locked-vault gate (DESK-3) **refuses** reads/writes until
unlocked and keys are zeroized on `lock()`. Neon-side provider tables exist for cloud key
metadata: `0005_api_keys.sql` / `0023_api_keys.sql`. **🟡 Partial (OS keychain).** Desktop
deliberately uses a **machine-derived key** (`sys/security/machine_key.rs`) _instead of_ the
OS keyring to avoid permission prompts — so "never plaintext" is met, but native
Keychain/Keystore storage of the master key is a design divergence, not shipped. On Mobile
the biometric flag _does_ use the OS keychain (`apps/mobile/lib/biometricFlagStore.ts` —
iOS Keychain / Android Keystore via SecureStore); Mobile has **no BYOK** and stores no
provider keys. Managed-Cloud access is brokered by
`apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs`, not by a stored
user key. Provider model IDs come only from `packages/contracts/types/src/models.json`.

## Log Storage — runtime logs

Requirement: structured local logs with secret redaction, bounded retention, and an
immutable audit trail; logs never leak keys or Local content into Cloud.

**✅ Built (Desktop).** `apps/desktop/src-tauri/src/sys/logging/mod.rs` and
`sys/telemetry/logging.rs` own runtime logging; `sys/security/log_redaction.rs` strips
secrets before write; `sys/security/audit_logger.rs` records security-relevant events;
MCP server logs are captured in `core/mcp/logs.rs`. IPC commands expose read/clear/export
(`error_clear_logs`, `error_export_logs`, `mcp_get_server_logs` in `src-tauri/src/lib.rs`).
**✅ Built (Cloud audit immutability).** `apps/web/db/neon/0043_audit_log_immutability.sql`
enforces append-only audit rows in Neon. **🔭 Planned:** a unified cross-surface log store,
rollover policy, and a redaction corpus that fails closed on any unredacted secret. Logs
stay on the host; no runtime log is auto-synced to Cloud.

## Repository map

- `apps/cli/src/config.rs` — `~/.agiworkforce/config.toml`, layered config + `privacy_mode`.
- `apps/cli/src/features/session/mod.rs`, `apps/cli/src/agent/history.rs` — CLI session/turn state.
- `apps/desktop/src-tauri/src/data/settings/service.rs` — desktop settings (SQLite).
- `apps/desktop/src-tauri/src/sys/security/{storage.rs,machine_key.rs,secret_manager.rs}` — encrypted vault + keys.
- `apps/desktop/src-tauri/src/sys/security/{audit_logger.rs,log_redaction.rs}`; `sys/logging/mod.rs`; `sys/telemetry/logging.rs`; `core/mcp/logs.rs` — logs + audit.
- `apps/mobile/stores/settingsStore.ts` (encrypted MMKV); `apps/mobile/lib/biometricFlagStore.ts` (SecureStore/keychain).
- `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — `Task`/`output_path` session records.
- `crates/agiworkforce-app-server/src/lib.rs` — `max_sessions`/`session_timeout_secs`.
- `crates/agiworkforce-utils-cache/src/lib.rs` — in-memory LRU + `sha1_digest`.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync (cursor + tombstones + upsert).
- `apps/web/db/neon/{0005,0021,0022,0023,0028,0037,0038,0042,0043}_*.sql` — cloud schema.

## Competitor notes

Claude, ChatGPT, and Codex store conversations, settings, and keys against a single
first-party backend; local caches are convenience layers over one cloud of record. AGI
diverges deliberately: storage is **trust-partitioned and local-first**. Local and BYOK
state lives only on the host in encrypted local stores; only Managed-Cloud chats reach
Neon, via cursor+tombstone delta-sync with server-set ownership. BYOK keys are encrypted
at rest on the dev surfaces and structurally absent on Web and Mobile. This is "your data
stays where you put it," not "everything is in our cloud."

## Acceptance / Definition of Done

Production-ready when every store is trust-labeled, secrets are encrypted at rest, and no
storage path can move Local/BYOK data into Neon without an explicit consented fork.

- [ ] **Build:** config layering (`config.rs`), `Task` persistence (task-runtime), LRU
      cache (`utils-cache`), and chat delta-sync (`chat/sync/route.ts`) pass their unit
      tests; encrypted MMKV and desktop vault round-trip verified.
- [ ] **Trust:** Local/BYOK rows provably excluded from `{chat,memory,projects}/sync`;
      settings sync stays allowlist-gated; sessions never persist to Cloud.
- [ ] **Security:** BYOK secrets AES-256-GCM at rest with a locked-vault gate; logs
      redact secrets before write; Neon audit rows immutable (0043); RLS enforced (0037).

## Anti-patterns

- Writing Local/BYOK conversations, sessions, files, or keys into Neon, or removing the
  server-side `user_id` / RLS scoping in the sync routes.
- Persisting provider keys or any secret in plaintext config, logs, or an unencrypted
  table; logging an unredacted key or Local content.
- Treating a cache or a Remote-Control window as authoritative storage, or syncing an
  in-memory cache across the trust boundary.
- Enabling settings sync ahead of the allowlist gate, or inventing a monolithic runtime
  storage daemon the repo does not have.
- Hardcoding or inventing model IDs (read only from `packages/contracts/types/src/models.json`),
  referencing removed tiers (`Plus`/`pro_plus`/`Hobby`) or credit top-ups, or naming
  Supabase — the stack is Clerk + Neon + Stripe.
