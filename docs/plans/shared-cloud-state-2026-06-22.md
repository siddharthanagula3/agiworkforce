# Shared Cloud State — Local/Cloud Complete Separation + Cross-Surface Sync

Status: APPROVED-DIRECTION 2026-06-22 (founder request) — extends the approved sync design
Owner: Founder + platform lead
Date: 2026-06-22
Builds on: `docs/plans/cross-device-cloud-sync-design-2026-06-20.md` (chats), `docs/plans/artifact-cloud-sync-design-2026-06-21.md` (artifacts)
Spec: `docs/current/trust-mode-surface-matrix.md`

## Goal (founder, 2026-06-22)

> "There should be a toggle to switch between both, but **Local** should use **local storage** and
> **Cloud** should use the **Neon database**, and make sure that the chats, projects, memory,
> settings, artifacts, etc. are **shared** in mobile (cloud mode), desktop (cloud mode), and web —
> just like ChatGPT/Claude."

Two halves:

1. **Complete separation** — a toggle flips between Local and Cloud. Local data lives only on-device
   and NEVER egresses; Cloud data lives in Neon. The two never co-mingle. _(Largely already built — verify + harden.)_
2. **Shared cloud state** — in Cloud mode, a single signed-in account sees the same chats, projects,
   memory, settings, and artifacts on web, desktop, and mobile. _(The real gap — only chats are wired today.)_

This is a delta on an already-approved architecture. **We reuse the proven chat-sync primitives; we do
not invent a new sync model.**

## Locked constraints (inherited, non-negotiable)

- **Sync is Managed-Cloud-only.** Local and BYOK NEVER sync — no `cloud_id`, excluded from pull/push.
  (CLAUDE.md: "Local, BYOK, and Managed Cloud are separate trust boundaries… never silently route Local
  to managed cloud.")
- **RLS `WITH CHECK` is the backstop; the API is the gate.** Every sync route MUST use the RLS-scoped DB
  wrapper `getUserScopedDb` (`SET LOCAL ROLE app_rls`, server-set `user_id` from the verified Clerk
  session). NEVER `getNeonDb` for multi-tenant sync data.
- **Canonical cloud ID = client-generated UUIDv7.** Server-authoritative monotonic `server_version`
  (from `public.cloud_sync_version_seq`) is the cursor + conflict key. Soft-delete tombstones only.
- **Conflict policy = last-writer-wins** on metadata; append-only where applicable (messages).

## Current state (grounded, 2026-06-22) — per entity × surface

| Entity     | Neon schema                                    | Web          | Mobile (cloud)                      | Desktop (cloud)                                   |
| ---------- | ---------------------------------------------- | ------------ | ----------------------------------- | ------------------------------------------------- |
| Chats/msgs | `web_conversations`/`web_messages` + `0038`    | ✅ native    | ✅ delta + continuation merge fixed | ✅ delta via shared SQLite table                  |
| Artifacts  | `+0039` on chat-sync endpoint                  | ✅           | ⚠️ verify                           | ❌ `cloud_sync.rs` doesn't gather/apply artifacts |
| Memory     | `user_memories` (`0010`) — no `server_version` | ⚠️ weak auth | ❌ no cloud sync client             | ❌ no cloud sync client                           |
| Projects   | `user_projects` (`0006`) — no `server_version` | ⚠️ weak auth | ❌ blocked in cloud mode            | ❌ no `project_id` column on conversations        |
| Settings   | `user_settings` (`0028`) — no `server_version` | ⚠️ weak auth | ❌ shared local-only across modes   | ❌ local-only                                     |

Legend: ✅ done · ⚠️ partial/needs hardening · ❌ missing.

**The "separation" half is largely done** (desktop `appModeStore` + `LocalCloudToggle` + egress guard;
mobile `appModeStore` + `ModeSwitchModal` + physically-separate MMKV `chat-message-store-{local,cloud}` +
`guardedFetch`). The "shared cloud" half is the work below.

## The unified pattern (one shape for every entity)

Every synced entity follows the exact `0038` chat-sync template:

**Neon (Phase 0 foundation, additive migration per entity):**

1. Reuse the existing `public.cloud_sync_version_seq` + `public.assign_cloud_sync_version()` trigger fn.
2. `ALTER TABLE <t> ADD COLUMN server_version BIGINT` (+ tombstone col if absent) → backfill → `NOT NULL`.
3. `BEFORE INSERT OR UPDATE` trigger calling `assign_cloud_sync_version()`.
4. `CREATE INDEX ON <t>(server_version)` for the delta-pull query.

**Web API (`/api/<entity>/sync`):**

- `GET ?since=<cursor>` → rows with `server_version > cursor` (incl. tombstones) + next cursor.
- `POST { rows: [...] }` → idempotent UPSERT by id, `user_id` set server-side, returns authoritative rows.
- MUST use `getUserScopedDb(request)` (RLS-scoped). Mirror `/api/chat/sync` exactly.

**Clients (mobile + desktop, Managed-mode-gated):**

- A cloud-only store/table mirroring web; a managed-only push/pull loop reusing the same cursor machinery.
- Local entities have no `cloud_id` and never push. Reuse `cloudSyncEngine` (mobile) / `cloud_sync.rs` (desktop) scaffolding.

## Trust-boundary guardrails (entity-specific)

- **Settings — DO LAST, behind a cloud-safe allowlist.** `user_settings.settings` is a JSONB doc grouped
  by namespace. We sync ONLY an explicit allowlist of device-agnostic, non-secret keys
  (e.g. theme, personalization/custom-instructions, language, UI prefs). We HARD-EXCLUDE: BYOK/provider
  API keys, local model paths/downloads, device IDs, push tokens, `providerMode`, and anything secret or
  device-specific. A wholesale settings upsert would be a **credential leak across the trust boundary** —
  forbidden. The allowlist lives in shared code and is unit-tested against the secret-key denylist.
- **Memory / Projects** are managed-cloud content → sync wholesale (no secrets), but local-mode memory and
  local-only projects stay device-local (no `cloud_id`).
- **Project knowledge files**: metadata syncs; file _bytes_ follow the existing media/blob path, not the
  delta JSON (size). Out of scope for the first projects slice.

## Sequencing (advisor-validated — one entity end-to-end, then replicate)

0. **Chats = the template (≈done).** Close residual desktop gaps (artifacts gather/apply; `project_id`
   lands with the projects slice). Verify mobile artifact sync.
1. **Memory** (first replication — richest existing infra, high "remembers-you-everywhere" value, low risk).
2. **Projects** (adds `project_id` to desktop conversations; metadata sync; knowledge-file bytes deferred).
3. **Settings** (LAST — allowlist-gated, as above).

Within each: **web foundation (migration + endpoint contract) ships first and serially**; then the mobile

- desktop clients fan out in parallel against the _frozen_ contract. (Never fan out all entities × surfaces
  at once on an evolving transport.)

## Acceptance (per entity) — cross-surface demonstration, not green tests

> Sign in as one managed-cloud account on surface A, create/edit the entity, then open surface B and **see
> AND use** it (e.g. continue the chat, see the memory applied, open the project). Green unit tests are
> necessary but NOT sufficient.

## Out of scope (by matrix)

CLI / VS Code coding history stays Local. Chrome stays an isolated store. No E2EE on managed cloud (server-
readable, Claude-parity); Local/BYOK remain private.

---

## Implementation status — 2026-06-22 (this session)

Reuse-the-primitives plan executed across all three entities. Every web endpoint runs through
`getUserScopedDb` (RLS); every client is managed-mode gated (`isManagedSyncEnabled()` / `derive_cloud_sync_enabled`)
with the egress guard as the independent backstop. All tests below were run and confirmed green.

| Entity   | Web (Neon)                                              | Mobile (cloud)                          | Desktop (cloud)                       |
| -------- | ------------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| Memory   | `0040` + `/api/memory/sync` delta (9 tests)             | cloud store + sync loop (25 tests)      | `v68` + `memory_sync.rs` (11 tests)   |
| Projects | `0041` + `/api/projects/sync` + soft-delete (6 tests)   | cloud store + drawer unblock (15 tests) | `v69` + `projects_sync.rs` (12 tests) |
| Settings | `0042` + `/api/settings/sync` allowlist+scrub (8 tests) | store mapping + sync (22 tests)         | `v70` + `settings_sync.rs` (12 tests) |
| Artifacts | pre-existing on `/api/chat/sync` (shared cursor)       | pull wired + view-only by design (7 tests) | `v71` + `cloud_sync.rs` push/pull (47 cloud_sync + 2 persistence tests) |

**Desktop runtime wiring (critical):** `memory_sync`, `projects_sync`, `settings_sync` are all driven from the
existing managed-cloud trigger (`sync_conversations_to_cloud` in `sys/commands/chat/conversation.rs`); artifacts ride
inside `cloud_sync::sync_now` (same trigger). So the already-wired `cloudSyncTrigger` (mode→managed, post-turn, 30s)
reconciles all FIVE entity types. Each runs in a graceful-degrade `match{}` (a failure logs + continues, never
breaks chat sync). Without this the memory/projects/settings engines were built-but-unreachable dead code.

**Artifacts trust model (by `artifact-cloud-sync-design`):** desktop PUSHES (it edits/creates artifacts); web +
mobile are view-only PULL (artifacts re-derivable) — so mobile correctly never pushes. Desktop `mark_artifact_for_push`
is guarded `WHERE app_mode='cloud'`; `save_artifact_to_db` stamps `app_mode` from the parent conversation.

**Separation (the literal goal):** verified airtight — mobile `guardedFetch` + desktop `egressGuard`
(`privacyMode==='managed'` gate, incl. BYOK) + Rust `local_only` router; physically separate stores; explicit
toggle.

### Tracked gaps (NOT done — follow-ups)

1. **Settings cross-surface inner-key contract — PARTIALLY reconciled this session.** Canonical inner keys are
   documented in `apps/mobile/services/cloudSettingsMapping.ts` (maps to web's field names). Aligned: `appearance.theme`,
   `personalization.warmth`, and `language.locale` (desktop's `LanguageSettings` inner key was renamed `language`→`locale`
   to match — 5 edits, re-tested). STILL divergent: personalization/profile/chat hold genuinely surface-specific fields
   (mobile `customInstructions`/`enthusiasm`/`nickname`; desktop `formality`/`detail`/`emojiUsage`/`occupation`/`bio`;
   desktop `chat.*` toggles vs mobile `chat.autoListen`). These are different settings _models_, not renames — only
   shared keys cross-sync today. Full mobile↔desktop parity needs a **canonical personalization schema** decision
   (shared types). NO security impact — leak guards + server allowlist hold; worst case is a surface-specific preference
   not crossing.
2. **Desktop pulled settings persist in-memory only** (SettingsState), not to `settings.json`, until the next
   `settings_save` (needs `AppHandle` in the sync path). Pulled prefs survive the session but a per-namespace LWW
   timestamp in `cloud_sync_state` would make it robust.
3. **Desktop auto-saved memories** (Rust-internal `MemoryManager` chat auto-save / compaction) create rows with
   default `app_mode='local'` and never get a `cloud_id`, so they don't sync. Needs an `app_mode` hint at the
   repository layer.
4. **Desktop chat residual:** `conversation.project_id` isn't synced (no column on desktop conversations), so a
   chat's project association doesn't cross devices from desktop. (Artifacts are now DONE — `v71` +
   `cloud_sync.rs` push/pull.) Also: artifact cross-page orphan recovery is best-effort (no buffer table, unlike
   messages) — a pulled artifact whose parent conversation lands on a later page is recovered on the next cycle.
5. **Acceptance = cross-surface LIVE demo** (sign in on A, see+use on B) not yet run — needs a deployed Neon + two
   signed-in surfaces. All three sides are contract-matched + unit-tested. **Real-DB partial proof (2026-06-22):**
   on an ephemeral Neon branch (copy of prod, since deleted) the full chain `0037→0038→0040→0041→0042` applied
   cleanly (48/14/6/6/6 statements), the `server_version` trigger fired (116→117 on edit), and a delta query
   returned the row. Still unproven: the full HTTP API path with Clerk auth + two live surfaces.

   ⚠️ **DEPLOYMENT BLOCKER (high-value finding from the branch test):** migrations **`0037`–`0042` are NOT yet
   applied to the Neon production/main branch** — applying `0037`/`0038` to a prod copy succeeded _fresh_ (their
   objects weren't already there). So **cloud sync (chat included) cannot work in prod until these are applied, in
   order.** They are now proven deployable. This is the single most important next operational step.

6. **Mobile memory client + all web changes are UNCOMMITTED** (desktop slices were committed by their agents).
   Knowledge-file BYTES (project attachments) are out of scope for v1 projects sync (metadata only).
