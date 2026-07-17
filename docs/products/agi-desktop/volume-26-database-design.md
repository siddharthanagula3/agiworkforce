# AGI Desktop — Volume 26 — Database Design

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/desktop/AGENTS.md`; and repo paths — `apps/desktop/src-tauri/src/data/database/{sqlite_pool,pool,security}.rs`, `apps/desktop/src-tauri/src/data/db/{migrations,encryption,repository,models}.rs`, `apps/desktop/src-tauri/src/data/cloud_sync.rs`, `apps/desktop/src-tauri/src/core/embeddings/{mod,cache,generator,indexer,similarity}.rs`, `apps/desktop/src-tauri/src/core/agi/semantic_search.rs`, `apps/desktop/src-tauri/src/core/llm/models_config.rs`, `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/db/neon/{0001_mvp_chat,0002_profiles,0003_subscriptions,0006_projects,0010_memory,0013_devices,0016_misc,0036_media_assets,0037_rls_user_isolation,0038_cloud_sync_versioning,0039_artifact_cloud_sync,0040_memory_cloud_sync,0041_projects_cloud_sync,0043_audit_log_immutability}.sql`, `packages/contracts/types/src/models.json`.

## Overview & stance

AGI Desktop is the full-trust surface (Local + BYOK + Managed Cloud) and the local-private compute host. Its data design is therefore **two-store, one-directional-gated**: an embedded SQLite database owns all on-device state (Local and BYOK), and Neon Postgres owns Managed-Cloud state. **Local/BYOK rows never sync.** A SQLite row becomes eligible for cloud delta-sync only when it is minted with a `cloud_id` and `app_mode='cloud'` (`data/cloud_sync.rs`, migration v66); everything else stays on the machine. Cross-device sync is Web↔Mobile↔Desktop only, over the Neon delta-sync APIs (`apps/web/app/api/{chat,memory,projects}/sync`), Managed-Cloud chats only. Integer primary keys never leave the device — only `cloud_id` (UUIDv7) crosses the wire, and `user_id` is derived server-side from the verified Clerk session with RLS `WITH CHECK` as the DB backstop (`0037_rls_user_isolation.sql`). Stack is **Clerk + Neon + Stripe**; there is no Supabase. Model IDs come only from `packages/contracts/types/src/models.json`.

## Cloud (Neon Postgres)

### Users

Cloud identity is Clerk-owned; the `public.profiles` row is keyed by the Clerk user id (`id` IS the Clerk `sub`, no separate `user_id` column) and holds profile/preference state (**✅ Built** — `apps/web/db/neon/0002_profiles.sql`; RLS policy keys on `id`, `0037_rls_user_isolation.sql`). All user-scoped cloud tables isolate rows by `request.jwt.claim.sub`. **✅ Built.**

### Sessions

Auth sessions are Clerk's; the Neon side stores device/session-authorization records for pairing and remote-control approval (**🟡 Partial** — `apps/web/db/neon/0013_devices.sql`, `0029_device_authorization_contract.sql`). Remote Control is a secure remote window over a locally-running desktop session, not a cloud session — no local session data is persisted to Neon by pairing. Full desktop session-registry wiring is **🟡**.

### Chats

Cloud chats live in `public.web_conversations` with a server-authoritative monotonic `server_version` cursor (**✅ Built** — `0001_mvp_chat.sql`, `0038_cloud_sync_versioning.sql`; a trigger advances `server_version` on every insert/update). Desktop maps its local INTEGER PK to a UUIDv7 `cloud_id` before push. **✅ Built.**

### Messages

`public.web_messages` carries `server_version`, `updated_at`, and a `deleted_at` tombstone so edits and soft-deletes advance the shared cursor (**✅ Built** — `0038_cloud_sync_versioning.sql`). One monotonic sequence spans conversations + messages for a single delta cursor. **✅ Built.**

### Projects

Cloud Projects and their knowledge/file lifecycle are Neon-backed with their own cloud-sync versioning (**✅ Built (schema)** — `0006_projects.sql`, `0035_project_knowledge_file_lifecycle.sql`, `0041_projects_cloud_sync.sql`). Desktop Projects sync is **🟡** (`apps/desktop/src-tauri/src/data/projects_sync.rs` is a partial path). **🟡 Partial.**

### Memories

Cloud memory rows are Neon-backed with delta-sync columns (**✅ Built (schema)** — `0010_memory.sql`, `0040_memory_cloud_sync.sql`; API `apps/web/app/api/memory/sync/route.ts`). Local memory never appears here unless the user is in Managed Cloud. **🟡 Partial** (desktop mint path `data/memory_sync.rs` is cloud-gated but not fully exercised).

### Attachments

Cloud attachments/artifacts are stored as `public.media_assets` with artifact cloud-sync versioning sharing the chat cursor (**✅ Built (schema)** — `0036_media_assets.sql`, `0039_artifact_cloud_sync.sql`). Binary payloads are object-store-backed; Neon holds metadata + references. **🟡 Partial** (desktop artifact push exists in `cloud_sync.rs`; orphan-artifact buffering is a known gap noted in that file).

### Subscriptions

Billing state is `public.subscriptions` with Stripe linkage and metered usage (**✅ Built (schema)** — `0003_subscriptions.sql`, `0012_stripe.sql`, `0033_auto_economy_trial_usage.sql`, `0044_fix_increment_usage_unit_bug.sql`; Enterprise tier allowed by `0030_allow_enterprise_subscription_tier.sql`). Specs use the canon ladder — **Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise; no Plus/pro_plus/Hobby; no credit top-ups.** The schema/`packages/contracts/types/src/billing-catalog.ts` still encode older tiers — reconciliation is a separate tracked task. **🟡 Partial** (tier reconciliation gap).

### Telemetry

Usage/telemetry events, feedback, notifications, and feature flags are Neon tables, with an immutability guard on the audit log (**✅ Built (schema)** — `public.usage_events` etc. in `0016_misc.sql`; `0043_audit_log_immutability.sql`). Telemetry is cloud-account-scoped and RLS-isolated; Local/BYOK activity is never exported here. **✅ Built (schema) / 🟡 (desktop emission coverage).**

## Local (SQLite)

### SQLite

The on-device store is embedded SQLite via `rusqlite` with a connection pool and at-rest encryption (**✅ Built** — `data/database/sqlite_pool.rs`, `data/database/pool.rs`, `data/db/{encryption,repository,models}.rs`). Schema is versioned by numbered migrations (`data/db/migrations.rs`, `CURRENT_VERSION = 71`) that fail closed when FTS5 is unavailable. **✅ Built.**

### Conversations

`conversations` persists chat threads with an FTS5 mirror (`conversations_fts`) and per-conversation sync columns `cloud_id`, `server_version`, `deleted_at_utc`, `needs_push`, plus `app_mode` (default `'local'`), so a partial-UNIQUE index enforces uniqueness only on non-null `cloud_ids` (**✅ Built** — `data/db/migrations.rs`). Local rows stay local until explicitly cloud-minted. **✅ Built.**

### Messages

`messages` stores turns with `messages_fts`, `conversation_cloud_id`, and the same sync-column set + `needs_push` partial index (**✅ Built** — `data/db/migrations.rs`). Integer PKs never leave the device; only `cloud_id` is sent (`cloud_sync.rs`). **✅ Built.**

### Projects

Local `projects` + `project_settings` tables hold on-device project state and indexes (**✅ Built** — `data/db/migrations.rs`). In Local/BYOK, project rows are excluded from delta-sync. Project-scoped local model/context binding is **🟡** (`data/projects_sync.rs`). **✅ Built (storage) / 🟡 (sync binding).**

### Memories

On-device memory persists in `user_memory` with category/importance/recency indexes, plus `daily_logs` (**✅ Built** — `data/db/migrations.rs`; `core/agi/memory_persistence.rs`). Local memory never leaves the device; the cloud mint path is inert unless Managed Cloud is active. **🟡 Partial** (on-device semantic recall index not shipped).

### Vector Database

Embedding infrastructure exists — `EmbeddingService` with chunker, generator, incremental indexer, similarity search, and a `rusqlite`-backed embedding cache (**🟡 Partial** — `core/embeddings/{mod,cache,generator,indexer,similarity}.rs`; wired via `core/mod.rs`). Vectors are `Vec<f32>` tagged with a `model_id` so incompatible spaces do not mix; embeddings are Ollama-served (models referenced in `generator.rs`, not re-listed here). Memory recall today uses in-memory TF-IDF (`core/agi/semantic_search.rs`), and there is **no dedicated vector-index table in the main migrations** — a persistent local vector store is **🔭 Planned**. **🟡 Partial / 🔭 Planned.**

### Provider Configuration

BYOK/local provider config (base URLs, health, selection) is stored on-device; endpoints are restricted to a loopback allow-list with SSRF guards (**✅ Built** — `core/llm/providers/direct_api_provider.rs`). Provider secrets/keys are encrypted at rest via the machine-key store (`sys/security/{storage,secret_manager,machine_key}.rs`) — **🟡** vs the "keys in OS keychains" target (keychain-vs-machine-key reconciliation tracked). **✅ Built (config) / 🟡 (keychain gap).**

### Model Registry

The model catalog is a single source of truth loaded from `packages/contracts/types/src/models.json` via `include_str!` at build time (**✅ Built** — `core/llm/models_config.rs`); it is code-embedded, not a mutable SQLite table, so IDs can never be invented or drift. Installed Ollama models are discovered at runtime, not hardcoded. **✅ Built.**

## Repository map

- `apps/desktop/src-tauri/src/data/database/{sqlite_pool,pool,security,connection}.rs`
- `apps/desktop/src-tauri/src/data/db/{migrations,encryption,repository,models}.rs`
- `apps/desktop/src-tauri/src/data/{cloud_sync,memory_sync,projects_sync,settings_sync}.rs`
- `apps/desktop/src-tauri/src/core/embeddings/{mod,cache,chunker,generator,indexer,similarity}.rs`; `core/agi/{semantic_search,memory_persistence}.rs`
- `apps/desktop/src-tauri/src/core/llm/{models_config}.rs`; `core/llm/providers/direct_api_provider.rs`; `sys/security/{storage,secret_manager,machine_key}.rs`
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts`; `apps/web/db/neon/00*.sql`; `packages/contracts/types/src/models.json`

## Competitor notes

Claude, ChatGPT, and Codex are cloud-first: all chats, memory, and files live in a single vendor database with no user-run local store or BYOK. AGI's deliberate divergence: a genuine local-first SQLite store that owns Local and BYOK state and **never** syncs, a separate RLS-isolated Neon store for Managed-Cloud only, and a `cloud_id`-gated one-way boundary so local data cannot leak into the cloud by accident. Model identity is a code-embedded SSOT, not a mutable DB row. Remote Control keeps compute (and its data) on the host rather than persisting sessions server-side.

## Acceptance / Definition of Done

The data domain is production-ready when Local/BYOK rows are provably unsyncable, cloud rows are RLS-isolated and delta-synced, and no store can surface an invented model ID.

- [ ] **Build:** SQLite migrations (`CURRENT_VERSION`) apply cleanly with FTS5 present and degrade safely when absent; Neon sync APIs round-trip conversations/messages/artifacts by `cloud_id`.
- [ ] **Trust:** rows with `app_mode='local'` and NULL `cloud_id` are never pushed; only `cloud_id`/`server_version` cross the wire; `user_id` is server-derived; Local→BYOK requires the explicit fork.
- [ ] **Security:** RLS `WITH CHECK` enforced on all user-scoped Neon tables; local secrets encrypted at rest; audit log immutable; keychain-vs-machine-key gap tracked.

## Anti-patterns

- Syncing Local/BYOK rows, or minting a `cloud_id` outside the Managed-Cloud path; sending INTEGER PKs or `user_id` over the wire.
- Storing model IDs in a mutable table or hardcoding them instead of reading `packages/contracts/types/src/models.json`.
- Claiming a persistent local vector database exists (it is 🔭 Planned) or labeling in-memory TF-IDF recall as a vector DB.
- Referencing Supabase (migrated away), removed tiers ("Plus", `pro_plus`, "Hobby"), credit top-ups, or invented INR prices for Pro/Max.
- Disabling RLS or bypassing `withUser()`/GUC binding on cloud queries; renaming `proxy.ts`/`proxy` back to `middleware.ts` in any shared web build path.
