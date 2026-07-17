# AGI Web — Volume 20 — Database Design

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`, and real repo paths: the canonical Neon migrations `apps/web/db/neon/0001…0044`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/lib/server/rls-db.ts`. Cross-refs `docs/products/agi-web/volume-14-security.md` (RLS/IDOR) and `volume-13-subscription.md`.

## Overview & stance

AGI Web is the **cloud-only** surface — no Local mode, no BYOK, ever. Every row it stores belongs to a signed-in **Managed-Cloud** account (public alpha, open by default). The database is therefore the suite's shared cloud state: Web _hosts_ the Neon delta-sync APIs (`apps/web/app/api/{chat,memory,projects}/sync`) that Mobile and Desktop pull from, so this schema is load-bearing for cross-device data — Local/BYOK rows from other surfaces have no `cloud_id` and are **never** written here. The stack is **Neon Postgres** with canonical, numbered, idempotent migrations in `apps/web/db/neon`; **Clerk** owns identity (the Clerk `sub` is the `user_id`/`profiles.id` key, `text` not uuid); **Stripe** owns billing state. Two schema-wide invariants dominate every table below: (1) **user-scoped isolation** via app-layer `where user_id = $1` plus Neon **RLS** (`0037_rls_user_isolation.sql`), and (2) a shared **monotonic sync cursor** (`cloud_sync_version_seq` + `assign_cloud_sync_version()` trigger, `0038`) so one `?since=` cursor spans conversations, messages, artifacts, memories, projects, and settings.

## Users

`public.profiles` (`0002_profiles.sql`, ✅ Built) is keyed by `id text primary key` = the Clerk user id; there is **no** `user_id` column, so its RLS policy compares `id = current_app_user_id()` (`0037`). Holds `email`, `display_name`, `avatar_url`, `stripe_customer_id` (unique partial index), `routing_preferences jsonb`, timestamps. Per-user config lives in `user_settings` (`0028`, sync cursor added in `0042`) — **one JSONB row per user, upsert-only, no tombstone**; cross-device settings sync is **allowlist-gated** (theme/personalization only, never secret namespaces). Supporting user tables: `email_preferences`, `feature_flags` (`0016`). Requirement: user provisioning must upsert `profiles` on first authenticated request; deletion flows through `delete_user_data(text)` (`SECURITY DEFINER`, `0043`) for GDPR erasure.

## Sessions

Auth sessions are **Clerk-managed and not stored in Neon** — Web never mints its own session rows (see volume-14). What the DB _does_ own is device/pairing state (`0013_devices.sql`, ✅ Built): `device_authorization_codes` (OAuth-device-flow: `user_code`, `status` pending→approved/denied/expired/consumed, `expires_at`, encrypted `access_token`/`refresh_token`), `desktop_devices` and `mobile_devices` (per-user registries, `push_token`, `last_seen_at`), and `sync_data` (device-scoped blob, unique on `user_id,device_id,sync_type,created_at`). Two-factor state is in `0025_two_factor.sql`. Note: within chat, a "session" is a `web_conversations` row (see `move_session_to_folder`, `0022`) — distinct from an auth session. Remote-control / cloud-run session records are **🔭 Planned** (not yet a table).

## Chats

`public.web_conversations` (`0001_mvp_chat.sql`, ✅ Built): `id uuid`, `user_id text`, `title`, `model text` (a label, not authoritative — model IDs resolve from `packages/contracts/types/src/models.json`), `pinned`, `project_id`, `created_at/updated_at`, `deleted_at` tombstone. Sync columns `server_version bigint not null` + `deleted_at` added in `0038`; an `AFTER INSERT` trigger bumps `updated_at`, and the `assign_cloud_sync_version` trigger stamps every insert/update. `folder_id` FK added in `0022` alongside `chat_folders`, `conversation_branches`, and `conversation_tags` (`0016`). Indexes: `(user_id, updated_at desc) where deleted_at is null` for the list, `(server_version)` for delta pull. RLS enforces `user_id = current_app_user_id()`.

## Messages

`public.web_messages` (`0001`, ✅ Built): `id uuid`, `conversation_id` FK `on delete cascade`, `role check in ('user','assistant','system')`, `content`, `model`/`provider`, `input_tokens`/`output_tokens`/`cost_cents` for metering, `metadata jsonb` (GIN-indexed). `0038` adds `server_version`, `updated_at`, `deleted_at`. Sync semantics are **append-only**: the push path may only add a message or set its `deleted_at` tombstone — existing content is immutable (`apps/web/app/api/chat/sync/route.ts`). Messages inherit RLS through their parent conversation (subquery policy, `0037`). Reactions/bookmarks in `0022` (`message_reactions`, `message_bookmarks`, `bookmarked_messages` view). Index `(conversation_id, created_at asc)` orders a thread.

## Attachments

There is **no dedicated per-message attachment table today (🔭 Planned)**. Attachment-shaped data is stored three ways: (1) `public.media_assets` (`0036_media_assets.sql`, ✅ Built) — AI-generated images/video: `kind`, `mime_type`, `byte_size`, durable `storage_url` + `storage_pathname` (Vercel Blob), `prompt`/`provider`/`model`, `source_surface` provenance, `deleted_at`, indexed `(user_id, created_at desc) where deleted_at is null`; (2) `public.project_knowledge_files` (`0006`, lifecycle columns `added_at`/`retention_expires_at`/`deleted_at` in `0035`, ✅ Built) — uploaded project files with `checksum_sha256`, `byte_count`, `storage_uri`; (3) inline references inside `web_messages.metadata` jsonb. Requirement: attachment bytes live in object storage; Neon holds only durable URLs + provenance + checksums. A first-class `web_message_attachments` table with sync-cursor parity is the planned consolidation.

## Projects

`public.user_projects` (`0006_projects.sql`, ✅ Built): `id uuid`, `user_id`, `name`, `description`, `instructions`, `color`, `is_archived`, `metadata jsonb`. `0041_projects_cloud_sync.sql` adds `server_version` + a `deleted_at` tombstone (projects moved from hard-delete to soft-delete so a delete propagates cross-device instead of resurrecting on next pull). Child `project_knowledge_files` cascade on delete and inherit RLS via a subquery on the parent project (`0037`). Chats attach to projects through `web_conversations.project_id`.

## Memories

`public.user_memories` (`0010_memory.sql`, ✅ Built): `id uuid`, `user_id`, `content`, `category`, `source`, `is_deleted` boolean tombstone, timestamps. `0040_memory_cloud_sync.sql` adds `server_version` on the shared sequence. Two indexes on purpose: a **partial** `(user_id) where is_deleted = false` for the live list, and a **full** `(server_version)` so the delta pull returns tombstones (deletes must propagate). RLS scopes to `user_id`.

## Subscriptions

`public.subscriptions` (`0003_subscriptions.sql`, 🟡 Partial): one row per user (`user_id` unique, FK to `profiles`), Stripe linkage (`stripe_customer_id`/`stripe_subscription_id`/`stripe_price_id` unique), `status`, period/cancel fields. **Gap:** the `plan_tier` CHECK still encodes `free/hobby/pro/max` (+ `enterprise` from `0030`) — this contradicts the canon ladder **Free $0 / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise**. Reconciling the constraint (add `basic`, remove `hobby`, model the two Max price points via `stripe_price_id`) is a **separate tracked task**; specs use the canon model. Metering is `usage_events` (below); `token_credits`/`credit_transactions` (`0004`) exist but **credit top-ups stay policy-disabled** (no top-ups). Stripe event log in `0012`. RLS scopes rows to `user_id`; the webhook is the only trusted writer.

## Telemetry

Usage metering: `public.usage_events` (`0016_misc.sql`, ✅ Built) — `user_id`, `event_type`, `quantity`, `metadata jsonb`, indexed `(user_id, created_at desc)`; per-message token/cost columns on `web_messages` are the fine-grained meter. Security telemetry: `security_audit_logs` (`0037`, made **append-only** in `0043_audit_log_immutability.sql` — UPDATE/DELETE revoked from `app_rls`; retention/GDPR purges run `SECURITY DEFINER`). `notifications` and `feedback` (`0016`) round out product signals. A dedicated product-analytics/event-pipeline schema (funnels, retention rollups) is **🔭 Planned** — usage_events is the raw source.

## Repository map

- `apps/web/db/neon/0001…0044` — canonical, ordered, idempotent migrations (the schema SSOT).
- `apps/web/db/neon/{0037_rls_user_isolation,0038_cloud_sync_versioning,0039_artifact_cloud_sync,0040_memory_cloud_sync,0041_projects_cloud_sync,0042_settings_cloud_sync,0043_audit_log_immutability}.sql` — RLS + delta-sync spine + audit immutability.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — cursor + tombstone + idempotent-upsert transport over these tables.
- `apps/web/lib/server/rls-db.ts` — `withUser()` binds `request.jwt.claim.sub` and `SET LOCAL ROLE app_rls`.

## Competitor notes

Claude, ChatGPT, and Codex store hosted conversation/memory/project state in single-vendor backends. AGI's deliberate divergence: (1) **per-surface trust in the schema itself** — only Managed-Cloud rows exist here; there is no column or table that could hold a Local/BYOK secret, so the "no Local/BYOK on Web" boundary is enforced structurally, not by convention. (2) **One monotonic cursor across entities** (`cloud_sync_version_seq`) so Web/Mobile/Desktop reconcile chats + memories + projects + artifacts + settings with a single delta pull — a cross-device design competitors do not document. (3) **RLS defense-in-depth** as a backstop to app-layer scoping, plus append-only audit. AGI competes on private, isolated, portable cloud state — not frontier-model exclusivity.

## Acceptance / Definition of Done

Production-ready when: every user-scoped table has RLS `ENABLE`+`FORCE` with `USING` and `WITH CHECK` on `current_app_user_id()`; no route derives `user_id` from the request body; sync-eligible tables carry `server_version` + a tombstone and a `(server_version)` index; migrations apply idempotently on a Neon branch and pass `rls-probe.mjs` before production.

- [ ] Build: all `0001…0044` apply clean on a fresh Neon branch; `pnpm --filter @agiworkforce/web typecheck`/`test`/`build` green.
- [ ] Trust: cross-tenant read/write rejected by RLS `WITH CHECK`; no Local/BYOK row path into any table; sync forces server-side `user_id`.
- [ ] Security: `security_audit_logs` stays append-only for `app_rls`; secrets stored encrypted/hashed, never plaintext; delete flow purges all user rows.

## Anti-patterns

- Reading `user_id` from a request body (IDOR); relying on app-layer filters while RLS is dormant on a legacy `getNeonDb()` path.
- Adding a Local/BYOK column, key, or table to any Web schema; writing non-cloud rows into the sync store.
- Hard-deleting a sync-eligible entity (breaks cross-device propagation — use a tombstone) or forgetting the full `(server_version)` index so tombstones don't pull.
- Hardcoding model IDs in a column as authoritative (resolve from `packages/contracts/types/src/models.json`); inventing INR prices; reintroducing removed tiers (`hobby`/`Plus`/`pro_plus`) or enabling credit top-ups.
- Renaming `proxy.ts` → `middleware.ts`; referencing Supabase; re-granting blanket UPDATE/DELETE on `security_audit_logs` to `app_rls`.
