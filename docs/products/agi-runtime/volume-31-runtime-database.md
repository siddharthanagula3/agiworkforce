# AGI Runtime — Volume 31 — Runtime Database

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/desktop/AGENTS.md`, `apps/cli/AGENTS.md`, `services/AGENTS.md`
(nearest owners); `docs/current/source-of-truth.md`; `docs/products/README.md` (binding
canon). Grounded in real repo paths:
`crates/agiworkforce-{task-runtime,app-server,plugin-runtime,execpolicy}`,
`crates/agiworkforce-protocol/src/{permissions.rs,request_permissions.rs,models.rs}`,
`crates/agiworkforce-utils-cache/src/lib.rs`, `services/signaling-server/src/index.ts`,
`services/api-gateway/src/routes/{pair,mobile}.ts`,
`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`,
`apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts`,
`apps/web/app/api/{chat,memory,projects}/sync/route.ts`,
`apps/web/app/api/control-plane/status`, `packages/types/src/models.json`,
`apps/web/db/neon/{0021,0022,0037,0038,0039}_*.sql`.

## Overview & stance

The Runtime Database is the AGI Runtime's set of **structured record stores** — where
sessions, conversations, runtime state, caches, provider metadata, and permission grants
persist. It is an internal layer, not a user product, and it is deliberately **partitioned
by trust boundary**. The rule is absolute: **cloud rows live in Neon Postgres (RLS,
Clerk-scoped); local rows live in per-surface SQLite / encrypted stores; there is never a
shared writable database across trust boundaries.** Local and BYOK records never enter Neon
delta-sync; a Local→BYOK move is an explicit consented fork (context selection, secret scan,
payload preview, provider label), not a database migration.

Per-surface reality follows the trust matrix: **Desktop/CLI/VS Code** keep local stores plus
Neon for cloud rows; **Mobile** keeps on-device stores (encrypted MMKV + SecureStore) plus
Neon; **Web** is Cloud-only (Neon); **Chrome** is `chrome.storage.local` only, device-scoped.
Under Remote Control the phone/web window writes nothing authoritative. There is **no
monolithic runtime daemon and no single runtime DB** today; this volume documents a coherent
target assembled from real parts, labeling every gap.

## Sessions — session metadata

Requirement: durable per-session records (id, kind, status, timing, output location) held
**local-only**; sessions never leave the host.

**✅ Built.** `crates/agiworkforce-task-runtime/src/lib.rs` defines `Task { id: TaskId (Uuid),
kind: TaskKind, status: TaskStatus, command, output_path, started_at, ended_at, exit_code,
error }` in a `TaskRegistry` with validated status transitions (`TaskError::
InvalidTransition`; `Pending→Running→{Completed,Failed,Stopped}`). The local tool host bounds
live sessions via `AppServerConfig { max_sessions, session_timeout_secs }`
(`crates/agiworkforce-app-server/src/lib.rs`, consumed only by the CLI). Remote-Control pairing
sessions are held in `services/signaling-server/src/index.ts` (`Session { code, createdAt,
expiresAt, participants }`, roles `desktop | mobile`) — ephemeral relay state, not a
conversation store. **🔭 Planned:** a durable cross-restart session-resume record and
**cross-surface presence** (`surface_heartbeats`) — the table does not exist; only
`apps/web/app/api/control-plane/status` is stubbed. Sessions stay local.

## Conversations — conversation storage

Requirement: store conversations, messages, and artifacts; local chats stay on-device; only
Managed-Cloud chats sync via cursor + tombstone delta-sync with idempotent upsert.

**✅ Built (Cloud).** `apps/web/app/api/chat/sync/route.ts` implements delta-sync over
`web_conversations` / `web_messages` / `web_artifacts`: `GET ?since=<server_version cursor>`
returns rows with `server_version > cursor` (including tombstones), Clerk-scoped; `POST` does
an **idempotent UPSERT by id** with `user_id` set **server-side** (never from the body),
messages append-only (only a `deleted_at` tombstone mutates a row). Schema: `0021`, `0022`,
`0038` (the shared monotonic `server_version` sequence/trigger), `0039`, with RLS from
`0037_rls_user_isolation.sql`. Web ↔ Mobile ↔ Desktop only. **✅ Built (Local).** Local/BYOK
conversations persist in the host's SQLite / encrypted MMKV, have **no `cloud_id`**, and are
structurally excluded from these endpoints. No Local or BYOK row is ever written to Neon; a
local↔cloud handoff is an explicit, redacted fork.

## Runtime State — runtime metadata

Requirement: transient execution state (task status, connection health, pairing/approval
queues) held where the compute runs; never a shared mutable table across trust modes.

**✅ Built (host).** Task lifecycle is the `TaskStatus` machine in task-runtime; the
app-server tracks live session count against `max_sessions`. **✅ Built (relay).** The
signaling server holds per-`Session` runtime state: heartbeat freshness
(`STALE_SESSION_HEARTBEAT_THRESHOLD_MS`), **offline approval queueing**
(`MAX_PENDING_APPROVALS_PER_SESSION`, `PENDING_APPROVAL_TTL_MS`), and pending rehydrations —
control verbs `approval_request/response`, `sync`, `dispatch`, `heartbeat`, `cancel`.
**✅ Built (mobile mirror).** `apps/mobile/services/companion.ts` + `stores/connectionStore`
track connection quality, stale detection, and reconnect countdown. **🟡 Partial.** The
Desktop↔Mobile companion channel is feature-flagged **off** (`apps/mobile/lib/
v1FeatureFlags.ts` — `companion: false`, `dispatch: false`) and the desktop last mile is
unwired (control events re-emitted as a window `CustomEvent` `'mobile-companion:control'` with
no listener). **🔭 Planned:** durable cross-surface presence (`surface_heartbeats`) and a
persisted runtime-state ledger. Runtime state is process/relay scoped — never persisted to Neon.

## Cache — runtime cache

Requirement: bounded, evicting cache with content-addressed keys; caches are **disposable**
and never cross a trust boundary.

**✅ Built.** `crates/agiworkforce-utils-cache/src/lib.rs` provides `BlockingLruCache<K,V>`
(Tokio-mutex-guarded `lru::LruCache`, capacity-bounded eviction, `get_or_insert_with` /
`get_or_try_insert_with`) plus `sha1_digest(bytes)` for content-based keys that avoid
path-only staleness. Caches are **in-memory and process-scoped** — disposable by construction,
so a cache never persists cross-trust data. **🔭 Planned:** a persistent on-disk cache
(encrypted, trust-tagged); if built, cached Local/BYOK bytes must never reach the Cloud path.

## Providers — provider registry

Requirement: one source of truth for provider/model metadata; BYOK secrets encrypted at rest
on the dev surfaces only; Web and Mobile hold no provider keys; Managed-Cloud is
server-brokered.

**✅ Built (registry SSOT).** `packages/types/src/models.json` is the canonical provider /
model catalog (providers include `anthropic`, `openai`, `google`, `managed_cloud`, plus BYOK
providers such as `deepseek`, `groq`, `mistral`, `open_router`, `nvidia_nim`). It is a
**static, versioned SSOT file** consumed by every surface — **not** a mutable per-user
database — read in Rust via `crates/agiworkforce-protocol/src/models.rs`. **Model IDs come
only from this file; never invent or hardcode them.** **✅ Built (BYOK config).** Non-secret
provider config lives in `apps/cli/src/config.rs`; BYOK keys persist encrypted at rest on
Desktop (AES-256-GCM, `apps/desktop/src-tauri/src/sys/security/storage.rs`). Managed-Cloud is
**brokered server-side**, not a stored user key; the `managed_cloud` catalog is routed by
`SLOT_REGISTRY`. **🔭 Planned:** a runtime provider-health/availability registry (live status,
rate-limits, deprecation surfacing).

## Permissions — permission database

Requirement: a durable, auditable record of tool/file/network/approval grants, scoped per
session and trust mode; risky actions are approval-gated, never silently allowed.

**🟡 Partial.** The permission **model** is built: `crates/agiworkforce-protocol/src/
permissions.rs` defines `FileSystemSandboxPolicy` (read/write roots, `ReadDenyMatcher`,
special paths) and `NetworkSandboxPolicy`; `request_permissions.rs` defines
`PermissionGrantScope` and `RequestPermissionProfile` for approval prompts, and
`crates/agiworkforce-execpolicy` gates command execution. Approval **transport** is built —
signaling `approval_request/response` with offline queueing (above), and the desktop
`127.0.0.1` WS host enforces origin allowlist, IPC token, and IP lockout (5 auth failures /
60s → lockout) in `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`. The
**gap**: a persisted, queryable grant store ("remember this decision" across restarts) is not
yet a durable table — grants are session-scoped policy, not a database. **🔭 Planned:** a
per-surface local permission-grant store (SQLite, trust-tagged) with an immutable audit trail;
any Cloud-side grant record is Neon+RLS and Managed-Cloud only.

## Repository map

- `crates/agiworkforce-task-runtime/src/lib.rs` — `Task`/`TaskRegistry`/`TaskStatus` session records.
- `crates/agiworkforce-app-server/src/lib.rs` — `max_sessions`/`session_timeout_secs` bounds.
- `crates/agiworkforce-protocol/src/{permissions.rs,request_permissions.rs,models.rs}` — sandbox/permission model + provider reads.
- `crates/agiworkforce-{execpolicy,plugin-runtime}` — exec gating, plugin manifests.
- `crates/agiworkforce-utils-cache/src/lib.rs` — in-memory LRU + `sha1_digest`.
- `services/signaling-server/src/index.ts` — pairing `Session`, heartbeat, offline approval queue.
- `services/api-gateway/src/routes/{pair,mobile}.ts` — pairing routes.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs` — loopback WS host, IPC token, IP lockout.
- `apps/mobile/services/companion.ts`, `apps/mobile/lib/v1FeatureFlags.ts` — client runtime state (off).
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync (cursor + tombstones + upsert).
- `packages/types/src/models.json` — provider/model registry SSOT.
- `apps/web/db/neon/{0021,0022,0037,0038,0039}_*.sql` — cloud schema, RLS, versioning.

## Competitor notes

Claude, ChatGPT, and Codex persist sessions, conversations, and permissions against a single
first-party backend; local databases are convenience caches over one cloud of record. AGI
diverges deliberately: the runtime database is **trust-partitioned and local-first**. Local
and BYOK records live only on the host; only Managed-Cloud chats reach Neon, via
cursor+tombstone delta-sync with server-set ownership and RLS. The provider registry is a
static multi-provider SSOT (`models.json`), not a vendor-locked catalog, and BYOK keys are
structurally absent on Web and Mobile — "your records stay where you put them."

## Acceptance / Definition of Done

Production-ready when every record store is trust-labeled, cloud rows are RLS-scoped in Neon,
local rows stay on the host, and no path moves Local/BYOK records into Neon without a
consented fork.

- [ ] **Build:** `Task` lifecycle, chat delta-sync, LRU cache, and provider reads
      (`models.json` via `protocol/models.rs`) pass unit tests; signaling approval queue
      round-trips.
- [ ] **Trust:** conversations/messages/artifacts scoped by server-side `user_id` + RLS
      (0037); Local/BYOK rows excluded from `{chat,memory,projects}/sync`; sessions and grants
      never persist to Cloud.
- [ ] **Security:** BYOK keys AES-256-GCM at rest; desktop WS host enforces IPC token + IP
      lockout; approval-gated actions cannot bypass the permission model; Neon audit rows
      immutable.

## Anti-patterns

- Building a single shared writable database across Local/BYOK/Cloud, or a monolithic runtime
  daemon the repo does not have.
- Writing Local/BYOK sessions, conversations, permission grants, or provider keys into Neon,
  or dropping the server-side `user_id` / RLS scoping in the sync routes.
- Treating a cache or Remote-Control window as authoritative storage, or syncing an in-memory
  cache across the trust boundary.
- Persisting any secret in plaintext, or logging an unredacted key.
- Hardcoding or inventing model IDs (read only from `packages/types/src/models.json`); claiming
  presence (`surface_heartbeats`) or a persisted grant DB as shipped when they are 🔭.
- Referencing removed tiers (`Plus`/`pro_plus`/`Hobby`), credit top-ups, or Supabase — the
  stack is Clerk + Neon + Stripe.
