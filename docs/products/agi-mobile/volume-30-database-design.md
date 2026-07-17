# AGI Mobile — Volume 30 — Database Design

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `apps/mobile/AGENTS.md`, `docs/products/README.md` (canon), and the real repo paths cited per section — `apps/mobile/storage/{db,migrations,conversations,messages,memory,docChunks,telemetry,types}.ts`, `apps/mobile/services/{cloudSyncEngine,remoteChatGate,companion}.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/stores/**`, `apps/web/db/neon/00{02,06,10,13,29,36,37,38,39,40}*.sql`, and `packages/contracts/types/src/models.json` (model-ID SSOT).

## Overview & stance

Mobile keeps **two physically separate datastores**, one per trust mode, and never lets a row cross between them implicitly.

- **Local (on-device)** lives in a single **SQLCipher-encrypted SQLite file** (`agi_mobile.db`) plus MMKV for flags/preferences. It holds Local-mode chats, messages, on-device memory, doc-chunk RAG, installed-model records, and an opt-in telemetry queue. Nothing here is networked unless the user runs an explicit, reviewed transfer.
- **Managed Cloud** lives in **Neon Postgres**, user-scoped, addressed by Clerk identity, and delta-synced through `services/cloudSyncEngine.ts`. On the device, cloud-mode data is held in MMKV-backed Zustand stores (`stores/chat`, `stores/memory`, `stores/projects`, `stores/settings`) — _not_ in the SQLite file — which is what structurally guarantees Local rows are never synced.

The **no-BYOK rule** shapes the schema directly: there is no `api_keys` / provider-credential table on mobile and there must never be one. The `default_provider` / `default_model` columns store identifiers drawn **only** from `packages/contracts/types/src/models.json` (Local on-device runtime entries, or Managed-Cloud model IDs) — never a user-entered key. "Provider configuration" on mobile means on-device model management, full stop. `remoteChatGate.ts` fails closed when Cloud is off, so the cloud datastore is simply unreachable in a local-only build.

## Users

Identity is **Clerk**; there is no local `users` table. The signed-in Clerk session _is_ the Managed-Cloud entitlement (`FEATURES.auth = true`, `services/authSession.ts`). Cloud user records are Neon `profiles` keyed by the Clerk user id (`apps/web/db/neon/0002_profiles.sql`). Per-user isolation is enforced by RLS reading `request.jwt.claim.sub` (`apps/web/db/neon/0037_rls_user_isolation.sql`).
**🟡 Partial** — Clerk auth gate is ✅ Built (`apps/mobile/services/authSession.ts`, `lib/v1FeatureFlags.ts`), but per the migration's own note RLS is correct-but-dormant on the live web query path until it is wired through `withUser()`; app-layer `where user_id = $1` is the active control today.

## Conversations

**Local:** `conversations(id TEXT PK, title, default_mode CHECK(chat|agent|voice), default_provider, default_model, created_at, updated_at, archived_at, pinned)` — `apps/mobile/storage/migrations.ts` (v1), CRUD in `apps/mobile/storage/conversations.ts`. No `cloud_id` column exists, so a Local conversation is structurally unsyncable. **✅ Built.**
**Cloud:** Neon `web_conversations` carries a server-authoritative `server_version` (delta cursor + LWW key) and soft-delete tombstones (`apps/web/db/neon/0038_cloud_sync_versioning.sql`). The mobile cloud copy lives in `stores/chat/chatCloudMessageStore.ts`; IDs are **UUIDv7** (client-generated, time-ordered) and _are_ the canonical cloud IDs. **✅ Built** (`apps/mobile/services/cloudSyncEngine.ts` `applyConversationDeltas`/`push`).

## Messages

**Local:** `messages(id, conversation_id REFERENCES conversations ON DELETE CASCADE, role CHECK(user|assistant|tool|system), content, mode, provider, model, runtime, tokens_in, tokens_out, duration_ms, attachments TEXT, created_at, parent_message_id)`, indexed `(conversation_id, created_at)` — `storage/migrations.ts` (v1), `storage/messages.ts`. **✅ Built.**
**Cloud:** Neon `web_messages` with `server_version`, `updated_at`, and tombstone columns (`0038_cloud_sync_versioning.sql`). Sync merges by id with remote-delete-wins and dirty-title preservation; only `user|assistant|system` rows are pushable (`tool` rows stay local). **✅ Built** (`cloudSyncEngine.ts` `applyMessageDeltas`/`push`).

## Projects

Projects are **Cloud-only on mobile** — there is no local SQLite `projects` table. Neon schema in `apps/web/db/neon/0006_projects.sql`; mobile copy in `stores/projects/cloudProjectStore.ts` with an independent cursor (`stores/projects/projectSyncStateStore.ts`) synced via `/api/projects/sync` (`cloudSyncEngine.ts` `pullProjects`/`pushProjects`). Soft-delete via `deleted_at` tombstones; `FEATURES.projects = true`. **✅ Built** (cloud); a Local-only projects store is **🔭 Planned** (intentionally — Local stays chat/memory/files-scoped).

## Memories

**Local:** `memory_facts(id, fact, source_conversation_id REFERENCES conversations ON DELETE SET NULL, pinned, created_at)` plus a `memory_vectors(fact_id, embedding BLOB)` index (768-dim, `nomic-embed-text-v1.5`) — `storage/migrations.ts` (v3), `storage/memory.ts`. Text search is ✅ Built; **🟡 Partial** for vector search — it degrades gracefully to text-only when `sqlite-vec` is not loaded.
**Cloud:** Neon memory + cloud-sync schema (`apps/web/db/neon/0010_memory.sql`, `0040_memory_cloud_sync.sql`); device copy in `stores/memory/cloudMemoryStore.ts`, separate cursor, `/api/memory/sync`, soft-delete tombstones hard-deleted after server ack. **✅ Built** (`cloudSyncEngine.ts` `pullMemory`/`pushMemory`).

## Attachments

**Local:** message attachments are stored as a JSON string in `messages.attachments`; extracted document text is chunked into `doc_chunks(id, conversation_id ON DELETE CASCADE, chunk_index, text, token_count, doc_type, source_uri, created_at)` for on-device RAG — `storage/migrations.ts` (v2), `storage/docChunks.ts`, `services/docParser.ts`. **✅ Built** for text/doc chunking.
**Cloud media:** Neon `media_assets` (`apps/web/db/neon/0036_media_assets.sql`) and artifact sync (`0039_artifact_cloud_sync.sql`); image generation is **cloud-backed** (`FEATURES.imageGen = true`, server-side Pro+ gating). Per `apps/mobile/AGENTS.md`, mobile must **not** be the first heavy local PDF/PPTX/DOCX/image-gen surface — heavy parsing/generation delegates to the host/cloud. A local binary blob store for large files is **🔭 Planned**.

## Runtime Sessions — remote session metadata

Remote Control is a secure **window**, not a trust mode: compute stays on the host, the link is outbound-only, QR + HMAC paired, approval-gated. Session/connection metadata is held in MMKV-backed Zustand (`stores/connectionStore.ts`) with helpers in `services/companion.ts` and HMAC in `lib/dispatchHmac.ts`; paired-device records map to Neon `devices` (`apps/web/db/neon/0013_devices.sql`, `0029_device_authorization_contract.sql`). There is no SQLite table for this.
**🟡 Partial** — the companion/dispatch channel exists but is feature-flagged **off** (`FEATURES.dispatch = false`, `FEATURES.companion = false` in `lib/v1FeatureFlags.ts`) and not wired to task execution.

## Local Storage — device SQLite

`agi_mobile.db` is opened via `PRAGMA key` (SQLCipher); the 256-bit hex key is generated with `expo-crypto` and stored in `expo-secure-store` as `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. `journal_mode = WAL`, `foreign_keys = ON`, and migrations bump `PRAGMA user_version` **inside a transaction** so an interrupted migration cannot half-apply (`storage/db.ts`, `storage/migrations.ts`); `rekeyDb` persists the new key before re-encrypting and rolls back on failure. Tables: `conversations`, `messages`, `memory_facts`, `memory_vectors`, `installed_models`, `custom_instructions`, `settings`, `telemetry_queue` (opt-in, content-free, non-Local only — `storage/telemetry.ts`), `doc_chunks`. **✅ Built.** No table carries a `cloud_id`, which is the structural enforcement of "Local rows never synced."

## Repository map

- `apps/mobile/storage/{db,migrations,types,conversations,messages,memory,docChunks,telemetry,installedModels,customInstructions,settingsDb}.ts` — device SQLite (SQLCipher).
- `apps/mobile/services/{cloudSyncEngine,remoteChatGate,companion,authSession}.ts`, `apps/mobile/lib/{v1FeatureFlags,mmkv,dispatchHmac}.ts` — cloud sync, gates, remote-window plumbing.
- `apps/mobile/stores/{chat,memory,projects,settings}/**`, `apps/mobile/stores/connectionStore.ts` — MMKV-backed cloud + session state.
- `apps/web/db/neon/00{02,06,10,13,29,36,37,38,39,40}*.sql` — canonical Neon schema (profiles, projects, memory, devices, media, RLS, cloud-sync versioning, artifacts).
- `packages/contracts/types/src/models.json` — model-ID SSOT for `default_model`/`model` columns.

## Competitor notes

ChatGPT and Claude mobile keep all conversation/memory state server-side under one provider; there is no user-owned, on-device, encrypted store and no notion of a separate local trust boundary. AGI's deliberate divergence: a **per-mode split datastore** — a SQLCipher device DB that runs fully offline against a free on-device model, plus an opt-in Neon delta-sync for Managed-Cloud chats only. Model identity is **multi-provider** (any id in `models.json`), not single-vendor. And unlike the desktop tier, mobile is **deliberately BYOK-free**: no key table, no key UI, ever.

## Acceptance / Definition of Done

Production-ready when: every cloud table is RLS-protected with the GUC wired through `withUser()` on the live path; Local and Cloud datastores share no table and no `cloud_id` bridge; the SQLite file is always SQLCipher-encrypted with the key only in SecureStore; sync is single-flight and fails closed in Local mode; and all model identifiers resolve against `packages/contracts/types/src/models.json`.

- [ ] Build: migrations are transactional + idempotent; `pnpm --filter @agiworkforce/mobile typecheck` and `test` green.
- [ ] Trust: a Local-mode session performs zero network I/O (verified via `cloudSyncEngine.isManagedSyncEnabled()` + `guardedFetch` backstop); no Local row reaches Neon.
- [ ] Security: SQLCipher key never leaves SecureStore; telemetry stays opt-in, content-free, non-Local; no provider-key column or UI exists anywhere in mobile.

## Anti-patterns

- Adding any BYOK/provider-key table, column, or settings field to mobile.
- Giving Local tables a `cloud_id` or auto-promoting Local rows into the cloud store without an explicit, reviewed, consented transfer.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json`.
- Storing chat content in the telemetry queue, or enqueuing telemetry in Local mode / without opt-in.
- Writing the SQLite file unencrypted, or persisting the SQLCipher key outside SecureStore.
- Referencing Supabase, or claiming the companion/runtime-session path is live while it is flag-gated off.
