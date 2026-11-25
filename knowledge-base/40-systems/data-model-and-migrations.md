---
id: "SYS-data-model-and-migrations"
type: "system"
title: "Data model and migrations"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Data model and migrations

AGI Workforce keeps account data in one Postgres database (Neon) built from 425 numbered, checksummed SQL migrations in apps/web/db/neon. Row-level security isolates users and workspaces. Deletion runs through a retention matrix, soft-delete windows and scheduled erasure. Devices hold separate stores: mobile encrypted SQLite and MMKV, desktop JSON files plus the CLI home, CLI JSONL sessions. Migrations run with pnpm db:migrate and are guarded by repository checks.

## What it is and why it exists

This page covers where AGI Workforce data lives and how the database schema changes over time.

**One cloud database.** Account data for Web, Desktop (Electron), Mobile in Cloud mode, CLI, VS Code and Chrome sits in one Postgres database, hosted on Neon. The code reaches it through a vendor-neutral adapter, chosen by the `AGI_DATABASE_PROVIDER` setting, so the host can change without code changes. [code] (packages/platform/data-layer/src/adapters/neon.ts:1-14; packages/platform/data-layer/package.json description). Its schema comes only from numbered SQL files in `apps/web/db/neon`. [requirement] (AGENTS.md section 5; docs/architecture/overview.md:38).

**Why numbered migrations.** The chain is append-only and checksummed. A file that already ran must never change, because the deploy gate compares its hash with the ledger and refuses to promote on a mismatch. [code] (scripts/lib/neon-migrations.mjs:94-96; apps/web/db/neon/CORRECTIONS.md). [executed] CORRECTIONS.md records a real incident: a comment-only edit to 0087 changed its checksum, production refused to promote, and nine migrations were queued behind it on 2026-08-24.

**Device stores.** Local mode on mobile, desktop and CLI keeps data on the device. Nothing in Local mode may move silently to BYOK (own key) or managed cloud. [requirement] (AGENTS.md section 6).

**Terms.**
- RLS (row-level security): Postgres refuses rows that do not belong to the caller.
- Tombstone: a row marked deleted but still stored.
- Ledger: the table `schema_migrations`, which records every applied migration with its checksum.
- Subject: the person whose data it is.

**Scope.** This page does not describe the chat turn pipeline (see SYS-chat-turn-pipeline) or billing rules in depth. It names the tables those features use.

## How it works today

### 1. The migration chain
- 425 forward files, `0001_mvp_chat.sql` to `0425_adult_eligibility.sql`, named `NNNN_lower_snake_case.sql` and contiguous. [code] (apps/web/db/neon listing; scripts/lib/neon-migrations.mjs:13,59-73).
- The recorded production high-water mark is 425, dated 2026-11-21. [code] (scripts/config/production-migrations-applied.json). This file, not header prose, is the repository's record of deployment state. [code] (scripts/check-migration-dependencies.mjs, comment above loadAppliedThrough).
- The runner (`scripts/neon-migrate.mjs`) applies each pending file in its own transaction with `lock_timeout` 10 s and `statement_timeout` 120 s, then inserts a ledger row (sequence, filename, SHA-256 checksum, duration). It holds a session advisory lock, so `apply` and `baseline` swap a Neon `-pooler` host for the direct host. [code] (scripts/lib/neon-migrations.mjs:146,181-196; scripts/neon-migrate.mjs:84-99).
- Drift is any of: a changed checksum, a renamed file, an unknown ledger entry, or a gap before an applied file. [code] (scripts/lib/neon-migrations.mjs:85-110).
- CI applies the chain twice to prove it can run again, then runs `verify` and an RLS probe. [code] (.github/workflows/ci.yml:204-210). The production deploy workflow only runs `verify` without changing anything. [code] (.github/workflows/deploy-production.yml:328-329). Who runs a production `apply`, and when, is not shown in the workflows. [unknown]

### 2. How a request reaches rows
- Request code calls `getUserScopedDb`. It verifies the session and opens a database handle bound to the user and the active workspace. [code] (apps/web/lib/server/rls-db.ts:116-182).
- On each transaction the adapter does `BEGIN; SET LOCAL ROLE app_rls`, then sets two transaction-local settings (the user id and the organization id). [code] (packages/platform/data-layer/src/adapters/sql-session.ts:49-56).
- `app_rls` is a login-less role that cannot bypass RLS. [code] (apps/web/db/neon/0037_rls_user_isolation.sql:74).
- Policies call `current_app_user_id()` and `current_app_org_id()`. These return NULL when unset, so an unbound request sees nothing. [code] (0037_rls_user_isolation.sql header; 0073_tenancy_foundation.sql header).
- `app_row_is_visible` shows a row to its owner in the same workspace, or to a workspace owner or admin. `app_row_is_writable` lets only the owner write, and only into a workspace they belong to. [code] (apps/web/db/neon/0110_active_workspace_content_scope.sql:18-40).
- `organization_id` NULL means personal; non-NULL means workspace-owned. [code] (0073_tenancy_foundation.sql header).

### 3. Handles that skip RLS
`getNeonDb()` is the service pool. It runs as the owner role and is used by crons, webhooks and erasure. [code] (apps/web/lib/server/neon-db.ts:20-31). `check:rls-boundary` blocks web code from using it on user-owned tables unless the file is on an allowlist with a stated reason; the allowlist has 78 entries. [code] (scripts/check-rls-boundary.mjs:11-20; scripts/config/rls-boundary-allowlist.json).

### 4. Deletion and retention
- Soft delete then purge: a conversation, message, artifact, project, project knowledge file or media asset keeps its tombstone for 30 days (`RESOURCE_RECOVERY_WINDOW_DAYS`), then a cron purges it. [code] (apps/web/lib/resources/deletion-policies.ts:8; vercel.json cron `/api/cron/purge-soft-deleted-resources`).
- Temporary chats purge 30 days after creation. [code] (apps/web/app/api/cron/purge-temporary-chats/route.ts:24).
- Account deletion: the request sets `deletion_scheduled_for` 24 hours ahead. Signing in and cancelling inside that window keeps the account. After the deadline `/api/cron/purge-deleted-accounts` erases it. [code] (apps/web/app/api/user/delete-account/route.ts:481; apps/web/lib/server/account-deletion-cancellation.ts:126-146; vercel.json).
- Workspace deletion has a 14-day cooling period. [code] (apps/web/lib/server/organization-deletion.ts:10).
- Erasure walks `USER_SCOPED_TABLES` (hard delete), `ANONYMIZED_USER_COLUMNS` (row survives, person detached) and `UNDELETED_USER_TABLES` (kept, each with a reason). Object-store bytes (media, chat files, backups, knowledge files, exports, avatars, feedback screenshots) are removed too. [code] (apps/web/lib/server/account-erasure.ts:37,300,360; apps/web/lib/services/deletion-manifest.ts:~330-420). A tombstone table (`erasure_tombstones`) keeps a suppression record so an erased subject stays erased. [code] (account-erasure.ts erasure_tombstones entry).
- Financial and telemetry tables have age limits: usage events are trimmed at 180 days and purged at 730; credit transactions are minimised at 730 and purged at 2,922 days (about 8 years); security audit logs go after 90 days. [code] (apps/web/lib/billing/financial-record-retention.ts:1-3,67-107; apps/web/lib/server/security-log-retention.ts:6).
- `docs/architecture/RETENTION_MATRIX.md` is generated from those lists by `renderRetentionMatrixMarkdown`. A test fails when file and code disagree. It lists 246 tables, 7 object stores and 3 caches. [code] (docs/architecture/RETENTION_MATRIX.md:6-12; apps/web/lib/services/deletion-manifest.ts:206)

### 5. Legal hold
`legal_holds` suspends retention for its subject. [code] (apps/web/db/neon/0138_retention_enforcement_and_legal_hold.sql:19,59). The temporary-chat purge checks holds before deleting. [code] (purge-temporary-chats/route.ts imports `legalHoldExclusion`).

## Implementation map

| Concern | Where | Basis |
|---|---|---|
| Migration files | file:apps/web/db/neon/*.sql | [code] |
| Reversal scripts (0097 onward) | file:apps/web/db/neon/down/*.down.sql, down/README.md | [code] |
| Corrections to applied files | file:apps/web/db/neon/CORRECTIONS.md | [code] |
| Real-Postgres verification recipe | file:apps/web/db/neon/verify/README.md | [code] |
| Runner CLI | file:scripts/neon-migrate.mjs | [code] |
| Runner library (ledger, lock, drift) | file:scripts/lib/neon-migrations.mjs | [code] |
| Migration guard | file:scripts/check-neon-migrations.mjs | [code] |
| Dependency and applied-watermark guard | file:scripts/check-migration-dependencies.mjs, scripts/config/production-migrations-applied.json, scripts/config/applied-migration-checksums.json | [code] |
| Table privilege guard | file:scripts/check-migration-table-privileges.mjs, scripts/config/migration-table-privileges.json | [code] |
| RLS and isolation guards | file:scripts/check-rls-boundary.mjs, scripts/check-db-isolation.mjs | [code] |
| Deletion graph guard | file:scripts/check-retention-graph.mjs | [code] |
| Database adapter | file:packages/platform/data-layer/src (adapters/neon.ts, adapters/postgres.ts, adapters/sql-session.ts, factory.ts) | [code] |
| Key-value (cache) adapter | file:packages/platform/key-value/src (memory, redis, upstash adapters) | [code] |
| Object storage (S3 API) | file:packages/platform/object-storage/src (s3.ts, memory.ts) | [code] |
| Other platform packages | packages/platform/artifacts, files, context-engine, identity, local-llm, observability, utils | [code] (directory listing) |
| Per-request scoped handle | file:apps/web/lib/server/rls-db.ts | [code] |
| Service handle (no RLS) | file:apps/web/lib/server/neon-db.ts | [code] |
| Account erasure | file:apps/web/lib/server/account-erasure.ts, scheduled-account-erasure.ts, account-deletion-cancellation.ts | [code] |
| Workspace erasure | file:apps/web/lib/server/organization-erasure.ts, organization-deletion.ts | [code] |
| Retention matrix | file:apps/web/lib/services/deletion-manifest.ts, docs/architecture/RETENTION_MATRIX.md | [code] |
| Soft-delete policies | file:apps/web/lib/resources/deletion-policies.ts | [code] |
| Financial retention rules | file:apps/web/lib/billing/financial-record-retention.ts | [code] |
| Cron schedule | file:vercel.json | [code] |
| Mobile stores | file:apps/mobile/storage/db.ts, storage/migrations.ts, lib/mmkv.ts | [code] |
| Desktop (Tauri, retained) store | file:apps/desktop/src-tauri/src/data/db/migrations.rs, key_management.rs | [code] |
| Desktop (Electron) files | file:apps/desktop/electron/settingsStore.ts, runtime/storageService.ts, userDataLocation.ts | [code] |
| CLI sessions | file:apps/cli/src/sessions.rs, apps/cli/src/cloud/chat.rs, apps/cli/src/cloud/state.rs | [code] |

**Main tables by domain** (each created in the file shown; the full list is the retention matrix).

| Domain | Tables | Created in |
|---|---|---|
| Accounts | table:profiles (id is the Clerk user id), table:identities, table:account_sessions, table:account_security_*, table:user_settings, table:device_registrations | 0002, 0174, 0338, 0207 |
| Conversations and messages | table:web_conversations, table:web_messages (cascade from conversation), conversation_branches, conversation_tags, message_reactions, message_bookmarks, chat_folders | 0001, 0078, 0156 |
| Legacy gateway chat | table:conversations, messages, table:chat_messages | 0077 |
| Projects | table:user_projects, table:project_knowledge_files, project_knowledge_objects | 0006, 0035, 0419 |
| Memory | table:user_memories (project-scoped from 0135, expiry and supersede from 0203) | 0010 |
| Files | table:media_assets, chat_file_intakes, chat_file_preparations, file_lineage, user_skill_files, user_agent_files | 0036, 0422, 0257 |
| Artifacts | table:web_artifacts, web_artifact_versions, web_artifact_index, table:published_artifacts, published_artifact_versions, published_artifact_storage, live_artifacts, artifact_comments, organization_shared_artifacts | 0039, 0095, 0257, 0325, 0380 |
| Schedules and jobs | table:scheduled_tasks, scheduled_task_runs, scheduled_task_shares, background_jobs, event_triggers | 0009, 0057, 0208, 0210 |
| Subscription, usage and credits | table:subscriptions, table:token_credits, table:credit_transactions, expiring_credit_purchases, bonus_credit_grants, table:managed_usage_requests, usage_events, provider_cost_events, cogs_adjustments, credit_settlement_jobs | 0003, 0004, 0056, 0016, 0127, 0295 |
| Organizations | table:organizations, table:organization_members, roles, policies, spend limits, audit destinations, usage ledger | 0015, 0073, 0200, 0142 |
| Connectors | table:user_connectors, user_custom_connectors, connector_oauth_grants, connector_tool_permissions, connector_account_states, connector_call_events | 0048, 0052, 0097, 0253 |
| Cross-device sync | table:sync_data, plus `server_version` on web_conversations and web_messages | 0013, 0038 |
| Evidence | table:security_audit_logs (append-only), enterprise_audit_events, erasure_tombstones, legal_holds | 0043, 0087, 0103, 0138 |

Across all migrations 278 distinct table names are created; some were dropped later. [code] (grep over apps/web/db/neon/*.sql).

## Data and state

### Where each kind of data lives

| Data | Store | Notes |
|---|---|---|
| Chats, messages, memory, projects, artifacts, schedules, usage, credits, org settings | Postgres tables above | RLS on user-owned tables [code] |
| Bytes: generated images and video, chat file staging, project knowledge files, exports, avatars, screenshots, published artifact storage | Object storage over the S3 API | Config names are `AGI_STORAGE_*` (provider, endpoint, region, bucket, private bucket, keys, encryption, key id). Values are never recorded here. [code] (packages/platform/object-storage/src/config.ts:7-17). The media migration says the bytes are in Cloudflare R2. [code] (0036_media_assets.sql header) |
| Response and rate-limit caches | Key-value store (memory, Redis, Upstash adapters), chosen by `AGI_KV_PROVIDER` | [code] (packages/platform/key-value/src/factory.ts:19-20). The matrix lists 3 caches (response cache keys, mcp_response_cache, mcp_discovery_cache). [code] (deletion-manifest.ts:~386-420) |
| Migration state | table:schema_migrations and schema_migration_deployments | [code] (scripts/lib/neon-migrations.mjs:119,337) |

### Key table facts
- `web_conversations` has `deleted_at`, `pinned`, `project_id`, `is_temporary` (0050), `server_version` (0038) and `organization_id` (0073). [code] (0001_mvp_chat.sql:3-13; 0050; 0038; 0073)
- A trigger on `web_messages` touches the parent's `updated_at`. [code] (0001_mvp_chat.sql:~40-55)
- `server_version` is a monotonic cursor from one sequence, `cloud_sync_version_seq`, so clients pull changes since a cursor. [code] (0038_cloud_sync_versioning.sql:~24)
- `subscriptions` holds one row per user, with Stripe ids, a status, and a `plan_tier` check. Its last widening is 0074 (free, hobby, basic, pro, max, max_15x, team, enterprise). [code] (0003_subscriptions.sql:1-20; 0074_allow_max_15x_subscription_tier.sql:8-19)
- `team_premium` appears in the shared plan type but in no migration. In the database it is a seat type on a Team subscription (`organizations.licensed_premium_seats`, plus a seat type on the membership row). [code] (packages/contracts/types/src/billing-catalog.ts:5-15; 0360_team_premium_seats.sql header)
- Credits: one credit is 5,000 microUSD of provider cost. Ledgers also keep a legacy cents column kept in step by migration 0182. [code] (packages/contracts/types/src/credits.ts:3; 0182 header)
- Plan catalog version is 4, and a subscription records the version it was sold under (0300). [code] (packages/contracts/types/src/billing-plan-catalog.ts:18; 0300_plan_catalog_version.sql)
- Plan ids and labels: free=Free, basic=Basic, pro=Premium, max=Max, max_15x=Ultra, team=Team, team_premium=Team Premium, enterprise=Enterprise; also `local-only` (Local Mode) and `byok`. [code] (packages/contracts/types/src/billing-catalog.ts:5-15,169-227)

### On-device stores

| Store | Contents | Protection |
|---|---|---|
| store:mobile-sqlite (`agi_mobile.db`) | Tables conversations, messages, memory_facts, memory_vectors, installed_models, custom_instructions, settings, telemetry_queue, doc_chunks. Version kept in `PRAGMA user_version`, now 5. | SQLCipher with a random 256-bit key in the OS keychain, this-device-only. [code] (apps/mobile/storage/db.ts:24-26,45-52,111-125; storage/migrations.ts:5-143; app.config.js:454) |
| store:mobile-mmkv | Persisted app state: chat messages (`chat-message-store-local`, `chat-message-store-cloud`), settings, memory and project caches, offline queue, notification items, drafts | Encrypted with a key held in SecureStore. [code] (apps/mobile/lib/mmkv.ts:12-17; stores/chat/chatMessageStore.ts:1729) |
| store:mobile-secure-store | DB key, MMKV key, device id, biometric flag | Keychain. [code] (db.ts:24; mmkv.ts:12-15; lib/deviceId.ts) |
| store:desktop-electron-userdata | Folder `AGI Cloud` under app data: settings.json, window-state.json, desktop-workspaces.json, desktop-shell-policy.json, local-routines.json, device-identity.json, desktop-cli-account.json | Plain JSON files; no database. [code] (apps/desktop/electron/userDataLocation.ts:9-16; settingsStore.ts:18; runtime/workspaceStore.ts:36; shellWindowStore.ts:16; runtime/localRoutineService.ts:56; runtime/deviceIdentity.ts:25) |
| store:cli-home (`~/.agiworkforce`, or `AGIWORKFORCE_HOME`) | `managed_sessions/<id>.jsonl`, `managed_session_metadata/<id>.json` (title, model, cwd, branch, pinned, imported_from), `conversations/`, config.toml, `cloud/sync-state.json` | Plain files; session writes are atomic (temp file then rename) under a directory lock. [code] (apps/cli/src/sessions.rs:69-95,229-262; config.rs:480-484; cloud/state.rs:116-118) |
| store:desktop-tauri-sqlcipher | Retained internal build: SQLCipher database, schema version 89, `schema_version` table, key in the OS credential store | [code] (src-tauri/src/data/db/migrations.rs:8,312; key_management.rs:1-28) |
| store:chrome-extension-storage | `chrome.storage.local`, `.session`, `.sync` (model choice, settings, memory cache) | A shipped build holds no bearer token of its own; tokens come from the Clerk background client. [code] (apps/extension/__tests__/extension-token-storage.test.ts:1-8; src/background/memory-bridge.ts:72) |
| store:vscode-state | `globalState`, `workspaceState`, `secrets` | [code] (counts from grep in apps/extension-vscode/src; contents not read) [unknown] |

The Electron Desktop reads the CLI home for sessions and measures it as the Storage screen's "sessions" category (managed_sessions, sessions.db, history.jsonl). [code] (apps/desktop/electron/runtime/storageService.ts:100-106)

## Rules: access, plans, modes

**Access.**
- A user sees only their own rows, and a workspace owner or admin sees workspace-owned rows of the active workspace. Unbound requests see nothing. [code] (0110:18-40; 0037 header)
- The application role needs its grants named: every new table starts with full DML for `app_rls` through default privileges, so the privilege guard requires each new table to state every privilege `app_rls` ends with, and to enable RLS with a policy or give a registry reason. [code] (scripts/check-migration-table-privileges.mjs:2-12)
- Governance tables are meant to be unwritable through the app role. A gap here once passed the unit suite and was caught only on a real database (0144). [code] (apps/web/db/neon/verify/README.md, "Why bother")
- `security_audit_logs` is append-only for the app role. Only the SECURITY DEFINER function `delete_user_data()` and the 90-day cleanup may delete from it. [code] (0043_audit_log_immutability.sql:6-13; account-erasure.ts UNDELETED_USER_TABLES)

**Plans.**
- Plan limits, credit allowances and windows come from the shared plan catalog, not from the database schema. [code] (packages/contracts/types/src/billing-plan-catalog.ts; apps/web/lib/billing/usage-credits.ts:15-27). Allowance values are in docs/architecture/credits.md. [requirement]
- `local-only` and `byok` have no managed allowance: `resolvePlanCreditAllowance` returns null for them. [code] (apps/web/lib/billing/usage-credits.ts:21-27)
- Subscription rows are erased with the account. The subscription is a live entitlement, not a retained record. [code] (account-erasure.ts FINANCIAL_ERASURE_DISPOSITION). Purchase history in `credit_transactions` is also deleted with the account, while the platform's own cost rows (`provider_cost_events`, `cogs_adjustments`) survive with the person detached. [code] (account-erasure.ts:300-350)

**Modes.**
- mode:local data stays on the device. On mobile, Local and Cloud chats use separate persisted stores. A cloud-cache owner key clears the cloud cache when the account changes. [code] (apps/mobile/stores/chat/chatMessageStore.ts:1729; src/features/auth/services/cloudAccountSession.ts:3,50-66)
- mode:cloud uses the Postgres tables. Mobile, Web and Desktop sync chat history through `/api/chat/sync`. [code] (apps/web/app/api/chat/sync/route.ts:1020-1021)
- The CLI joins that sync only in managed (cloud) privacy mode. A Local or BYOK session is refused inside the client. [code] (apps/cli/src/cloud/client.rs:361-373; apps/cli/src/agent/mod.rs:2748-2754)
- Local inference needs no paid plan. That is a product rule [requirement] (task brief); whether any database row is written for a signed-out Local session was not checked. [unknown]

**Sign-in.** Cloud-mode requests require a verified Clerk session or bearer token. [code] (rls-db.ts:116-182)

## Differences between apps

| Surface | Where its data lives | Synced to cloud? | Basis |
|---|---|---|---|
| surface:web | Postgres only; browser holds no durable chat store described here | Is the cloud | [code] |
| surface:desktop (public, Electron) | No conversation database. Shows the hosted web app. Local files only for shell state and CLI-home sessions | Cloud-mode chats live in the account | [code] (apps/desktop/electron/runtime/storageService.ts:100-106; AGENTS.md section 5); [requirement] (docs/architecture/desktop.md:189-192) |
| surface:desktop (Tauri, internal) | SQLCipher database, schema version 89 | Cloud-mode rows not kept there | [code] (migrations.rs:8); [requirement] (desktop.md:195-212) |
| surface:mobile | SQLCipher SQLite for memory and models, MMKV for chat state | Cloud mode syncs; Local mode does not | [code] |
| surface:cli | JSONL session files | Managed mode only, via `/api/chat/sync` | [code] |
| surface:vscode | `globalState`, `workspaceState`, `secrets` | Not established | [unknown] |
| surface:chrome | `chrome.storage.*` | Memory cached from account (`agi_memories` legacy key, account memory cache) | [code] (memory-bridge.ts:40-41,72) |

**Mobile detail.** The SQLite `conversations` and `messages` tables exist (migration version 1) but the only exported functions on them are readers, and no INSERT into them was found in mobile code. Chat content is in MMKV. The local data export builds its chat section from the MMKV store. [code] (apps/mobile/storage/conversations.ts:18; storage/messages.ts:23; src/features/settings/data-controls/localDataSnapshot.ts:75-120). That the SQL chat tables are unused is [inferred]; a grep over .ts and .tsx found no insert.

**Backups.** Mobile keys are this-device-only, so a backup restored to another phone cannot open the database. The unreadable file is renamed with a marker, a fresh database starts, and the person is told Local data was reset. [code] (apps/mobile/storage/db.ts:60-90, storage/localDataReset.ts:11-16)

**CLI header drift.** The module comment in sessions.rs says the CLI must not sync consumer chat. The code does sync managed sessions (see Rules). The code wins.

## Failure handling

- **Migration fails.** The runner rolls back that file's transaction and stops with the file name and message. Earlier files stay applied. [code] (scripts/lib/neon-migrations.mjs:179-215)
- **Drift.** `apply` refuses to run while the ledger and files disagree. `verify` reports the same drift without changing anything. [code] (neon-migrate.mjs:101-112; neon-migrations.mjs:85-110)
- **Applied file edited.** The guard reads the applied checksums and fails. Corrections go in CORRECTIONS.md. [code] (scripts/check-migration-dependencies.mjs findEditedAppliedMigrations; apps/web/db/neon/CORRECTIONS.md)
- **Rollback.** Each migration from 0097 on must ship a `.down.sql` that begins with BEGIN, ends with COMMIT, undoes every object, and deletes its own ledger row. Older migrations are undone by restore. [code] (scripts/check-neon-migrations.mjs:14,162-211; apps/web/db/neon/down/README.md)
- **Restore.** Neon point-in-time branches are the recovery mechanism; there is no separate dump schedule. The retained history window is not recorded in the repository. [requirement] (docs/runbooks/database-backup-restore.md:1-35)
- **Row-level policy mistakes** are only visible on a real database, since service tests mock the adapter. [requirement] (apps/web/db/neon/verify/README.md). CI runs an RLS probe against the applied chain. [code] (.github/workflows/ci.yml:210)
- **Erasure partly fails.** The scheduled erasure reports each store that did not complete and stages the work as billing, tombstone, erasure, identity. A failure names the stage. [code] (apps/web/lib/server/scheduled-account-erasure.ts:21-34)
- **Purge is batched.** Temporary-chat purge runs in 500-row batches with a time budget so a long run cannot roll back everything. [code] (purge-temporary-chats/route.ts:14-25)
- **Cron calls** need a secret of at least 32 characters. [code] (apps/web/lib/server/cron-auth.ts:19,64)
- **Mobile database cannot open.** Not-a-database errors set the file aside and retry with the same key. Other errors surface. [code] (db.ts:111-125)
- **Desktop (Tauri) database newer than the app** is refused. [code] (src-tauri/src/data/db/migrations.rs:327-331)

## How it should work

These are proposals unless marked otherwise.

1. **Single source of deployment state.** Keep `production-migrations-applied.json` as the record and consider generating or checking it from the real ledger after each production apply. [proposed]
2. **Stale draft headers.** 143 migrations carry the text "NOT YET APPLIED : draft only" but the chain is applied through 425. Because headers cannot be edited, record this once in CORRECTIONS.md or in a guard message so readers do not trust the header. [proposed]
3. **Mobile SQL chat tables.** Either write chats there or drop the empty tables through a new migration of the local store. Decide before the next mobile schema version. [proposed]
4. **Mixed transaction control.** The runner opens a transaction around each file; files that carry their own BEGIN/COMMIT are allowed when they are one enclosing block. The guard permits this shape, so the effect on the ledger insert should be confirmed on a real database. [inferred] (neon-migrations.mjs:181-196; check-neon-migrations.mjs:537-570)
5. **Legacy gateway tables.** Name an owner for `conversations`, `messages` and `chat_messages` or retire them. [proposed]
6. **Rules for adding a migration** (what the repository enforces today):
   - Name the file `NNNN_lower_snake_case.sql`, the next number, with no gaps or duplicates. [code] (neon-migrations.mjs:13,59-73; check-neon-migrations.mjs:670-690)
   - Never edit a file at or below the applied watermark. [code]
   - Write the matching `down/NNNN_name.down.sql`. [code]
   - Make changes expand-then-contract. No renaming of columns or tables, no NOT NULL column without a default, no add and drop of columns on one table in one file. [code] (check-neon-migrations.mjs:376-427)
   - Mark a destructive statement with a `-- destructive: <reason>` comment. [code] (check-neon-migrations.mjs:324-352)
   - Keep transaction control to one enclosing BEGIN/COMMIT or none. [code] (check-neon-migrations.mjs:537-570)
   - No blanket `GRANT ... ON ALL TABLES IN SCHEMA public`. [code] (check-neon-migrations.mjs:429-440)
   - Name `app_rls` privileges and enable RLS with a policy on user-owned tables. [code] (check-migration-table-privileges.mjs)
   - Add the table to the erasure inventories and the retention data class lists so `check:retention-graph` and the retention test pass. [code] (scripts/check-retention-graph.mjs:21-30; deletion-manifest.ts)
   - Stage first, then run the guards, because most read the working tree. [requirement] (AGENTS.md section 12)
   - Test on a Neon branch or a throwaway database before production. [requirement] (verify/README.md; 0037 header)

## Gaps

| Gap | Basis |
|---|---|
| The production migration apply step is not visible in the workflows read; only `verify` and `record` appear. Who applies and with which target is not established. | [unknown] |
| Migration targets include `staging`, but the CLI help text lists only local, ci, branch and production. | [code] (scripts/lib/neon-migrations.mjs:16; scripts/neon-migrate.mjs:101-112) |
| 143 applied migrations still say "NOT YET APPLIED". | [code] (grep) |
| The retention matrix covers 246 tables, while about 278 tables have been created across the chain. Some were dropped; which created tables are in no inventory was not computed. `check:retention-graph` is the guard that answers this. | [inferred] |
| The mobile SQLite chat tables look unused. | [inferred] |
| The legacy gateway tables `conversations`, `messages` and `chat_messages` have readers (export, erasure) but no writer in apps/web app or lib. The gateway service that used them was removed. | [inferred] (CORRECTIONS.md; grep) |
| Neon's point-in-time window for this project is not recorded in the repository. | [requirement] (database-backup-restore.md:12-19) |
| Whether the real database has all 425 migrations applied is not proven by any run in this review. The repository records it. | [code] (production-migrations-applied.json) |
| Real-Postgres harnesses sit as `.ts.txt` files in db/neon/verify and are not wired as tests. | [code] (directory listing of db/neon/verify) |
| The VS Code extension's stored keys and any chat history it keeps were not read. | [unknown] |
| No document states the retention of Local-mode data on device (mobile MMKV, CLI JSONL). Only the Storage screens and a reset path exist. | [unknown] |

Implementation status and verification status are separate. All code above exists and is wired. Nothing in this review was run. [executed] facts are limited to those the repository records (the 0087 drift incident, and the CI apply steps as configured).

## How to verify

Nothing below was run for this page. These are the commands the repository defines. [code]

**Migration state**
- `pnpm db:migrate -- inventory` lists files and the latest.
- `pnpm db:migrate -- status` shows applied, pending and drift for the database in `AGI_DATABASE_URL`, `DATABASE_URL` or `NEON_DATABASE_URL` (checked in that order). Add `--json` for a machine-readable result.
- `pnpm db:migrate -- apply --target local|ci|branch|staging|production`. Production also needs `--confirm-production`. A local target refuses a non-local host.
- `pnpm db:migrate -- verify` checks the ledger without changing it.
- `pnpm db:migrate -- record --surface web|gateway --commit SHA --target ...` stores a deployment record. `deployments` lists them.
- `pnpm db:migrate -- baseline --through N --reason TEXT --evidence TEXT --confirm-baseline --target branch|production` seeds an empty ledger.
  (scripts/neon-migrate.mjs:84-99; scripts/lib/neon-migrations.mjs:16-17)

**Guards**
- `pnpm check:neon-migrations` runs the file rules and the runner tests.
- `pnpm check:migration-dependencies` and `pnpm check:migration-table-privileges` check dependencies, the applied watermark and `app_rls` grants.
- `pnpm check:rls-boundary`, `pnpm check:db-isolation`, `pnpm check:retention-graph` check scope and deletion coverage.
- `pnpm db:rls-probe -- --target ci` runs a cross-tenant probe against a real database.
- `pnpm check:llm-operability` runs the full guard chain. (package.json:201,245,359-360,422-423,397)

**Tests**
- test:apps/web/lib/services/__tests__/deletion-manifest.test.ts keeps RETENTION_MATRIX.md in step with the code.
- test:scripts/check-neon-migrations.test.mjs and test:scripts/neon-migrate.test.mjs cover the guard and runner.
- test:apps/web/db/neon/user-content-rls-coverage-migration.test.ts and its siblings in the same folder read migration text.
- Service tests in apps/web mock the database adapter, so they cannot prove schema or policy behaviour. Use the recipe in apps/web/db/neon/verify/README.md with a throwaway Postgres.

**Reading a table answer fast**
1. Find the creating file with `grep -il "create table.*<name>" apps/web/db/neon/*.sql`.
2. Find later changes with `grep -l "<name>" apps/web/db/neon/*.sql`.
3. Find its erasure behaviour in docs/architecture/RETENTION_MATRIX.md.
4. Use apps/web/lib/server/rls-db.ts to see which handle a route uses.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The cloud schema is 425 contiguous numbered SQL files, 0001 to 0425, in apps/web/db/neon, and filenames must match NNNN_lower_snake_case.sql. | read in the code | `apps/web/db/neon (425 .sql files)`; `scripts/lib/neon-migrations.mjs:13,59-73` |
| The repository records production as applied through migration 425 on 2026-11-21. Draft headers do not show deployment state. | read in the code | `scripts/config/production-migrations-applied.json`; `scripts/check-migration-dependencies.mjs (comment above loadAppliedThrough)` |
| The runner applies each pending file in its own transaction with lock_timeout 10s and statement_timeout 120s, records a SHA-256 checksum in public.schema_migrations, and holds a session advisory lock. | read in the code | `scripts/lib/neon-migrations.mjs:146,181-196` |
| Commands are inventory, status, apply, verify, baseline, record, deployments. Production mutation needs --confirm-production; local target refuses non-local hosts; apply and baseline swap a -pooler host for the direct host. | read in the code | `scripts/neon-migrate.mjs:84-99,101-122` |
| An applied migration must never be edited: its checksum is in the ledger and the deploy gate refuses drift. A comment-only edit to 0087 caused a refused promotion with nine migrations queued on 2026-08-24. | seen in a real run | `apps/web/db/neon/CORRECTIONS.md (0087 section)`; `scripts/lib/neon-migrations.mjs:94-96` |
| Every migration from 0097 on needs a down/NNNN_name.down.sql that opens with BEGIN, ends with COMMIT, names every object touched, and deletes its own ledger row (329 reversal files exist for 0097-0425). | read in the code | `scripts/check-neon-migrations.mjs:14,162-211`; `apps/web/db/neon/down/README.md` |
| The migration guard rejects column or table renames, NOT NULL columns without a default, add and drop of columns on one table in one file, unmarked destructive statements, blanket GRANT on all tables, and mixed transaction control. Frozen baseline sets name older exceptions. | read in the code | `scripts/check-neon-migrations.mjs:287-352,376-440,522-570` |
| Row isolation uses a non-bypass role app_rls and transaction-local settings for user id and organization id; policies call current_app_user_id() and current_app_org_id(), which return NULL when unset so access fails closed. | read in the code | `apps/web/db/neon/0037_rls_user_isolation.sql:74`; `packages/platform/data-layer/src/adapters/sql-session.ts:49-56`; `apps/web/db/neon/0073_tenancy_foundation.sql header` |
| organization_id NULL means a personal row; non-NULL means workspace-owned, visible to the owner and to workspace owners and admins of the active workspace. | read in the code | `apps/web/db/neon/0073_tenancy_foundation.sql header`; `apps/web/db/neon/0110_active_workspace_content_scope.sql:18-40` |
| The 0037 header says RLS is dormant on the live path; the code now routes request handlers through getUserScopedDb (about 810 files import rls-db). getNeonDb() remains an owner-role handle for crons, webhooks and erasure, and check:rls-boundary allowlists 78 files that use it. | read in the code | `apps/web/lib/server/rls-db.ts:116-182`; `apps/web/lib/server/neon-db.ts:20-31`; `scripts/config/rls-boundary-allowlist.json` |
| Chats are web_conversations and web_messages (messages cascade from the conversation); server_version from one sequence is the sync cursor; GET and POST /api/chat/sync serve pull and push. | read in the code | `apps/web/db/neon/0001_mvp_chat.sql:3-24`; `apps/web/db/neon/0038_cloud_sync_versioning.sql`; `apps/web/app/api/chat/sync/route.ts:1020-1021` |
| Soft-deleted conversations, messages, artifacts, projects, project knowledge files and media assets are restorable for 30 days, then purged by a daily cron. | read in the code | `apps/web/lib/resources/deletion-policies.ts:8,75-117`; `vercel.json (/api/cron/purge-soft-deleted-resources 10 4 * * *)` |
| Temporary chats are purged 30 days after creation, skipping rows under legal hold. | read in the code | `apps/web/app/api/cron/purge-temporary-chats/route.ts:24`; `apps/web/db/neon/0050_temporary_chat_retention.sql` |
| Account deletion has a 24-hour cancellation window; erasure runs from a daily cron after the deadline. Workspace deletion has a 14-day cooling period. | read in the code | `apps/web/app/api/user/delete-account/route.ts:481`; `apps/web/lib/server/organization-deletion.ts:10`; `vercel.json (/api/cron/purge-deleted-accounts)` |
| Erasure inventories: USER_SCOPED_TABLES (hard delete), ANONYMIZED_USER_COLUMNS (content_reports, organization_usage_ledger, project_knowledge_files.added_by_user_id, slack_installations, provider_cost_events, cogs_adjustments, billing_disputes), UNDELETED_USER_TABLES (each with a reason). | read in the code | `apps/web/lib/server/account-erasure.ts:37,300,360` |
| RETENTION_MATRIX.md is generated from the erasure lists and retention rules; it lists 246 tables, 7 object stores and 3 caches, and a test fails if it drifts from the code. | read in the code | `docs/architecture/RETENTION_MATRIX.md:6-12`; `apps/web/lib/services/deletion-manifest.ts:206`; `apps/web/lib/services/__tests__/deletion-manifest.test.ts` |
| Age limits: usage_events minimised at 180 days and purged at 730; credit_transactions minimised at 730 and purged at 2,922 days; credit_settlement_jobs purged at 90 days after completion; security_audit_logs at 90 days. | read in the code | `apps/web/lib/billing/financial-record-retention.ts:1-3,41-107`; `apps/web/lib/server/security-log-retention.ts:6` |
| One credit is 5,000 microUSD. The 0182 migration header says 20,000, which is wrong. | read in the code | `packages/contracts/types/src/credits.ts:3`; `docs/architecture/credits.md:14` |
| Plan tier ids and labels: free, basic, pro (Premium), max, max_15x (Ultra), team, team_premium, enterprise, plus local-only and byok. In the database, subscriptions.plan_tier was last widened in 0074 and has no team_premium; team_premium is a seat type on Team. | read in the code | `packages/contracts/types/src/billing-catalog.ts:5-15,191-206`; `apps/web/db/neon/0074_allow_max_15x_subscription_tier.sql:8-19`; `apps/web/db/neon/0360_team_premium_seats.sql` |
| Mobile Local data: a SQLCipher database (agi_mobile.db, user_version 5) keyed from the keychain this-device-only, plus an encrypted MMKV store. Chat messages persist in MMKV; the SQLite conversations and messages tables have only readers. | read in the code | `apps/mobile/storage/db.ts:24-26,111-125`; `apps/mobile/storage/migrations.ts:5-143`; `apps/mobile/stores/chat/chatMessageStore.ts:1729`; `apps/mobile/storage/conversations.ts:18` |
| Public Desktop (Electron) keeps no conversation database. It keeps JSON state in a folder named 'AGI Cloud' and measures sessions in the CLI home. | read in the code | `apps/desktop/electron/userDataLocation.ts:9-16`; `apps/desktop/electron/runtime/storageService.ts:100-106`; `docs/architecture/desktop.md:189-192` |
| The retained Tauri desktop build has a SQLCipher database at schema version 89, with a random 256-bit key in the OS credential store, and it refuses a database newer than the app. | read in the code | `apps/desktop/src-tauri/src/data/db/migrations.rs:8,327-331`; `apps/desktop/src-tauri/src/data/db/key_management.rs:1-28` |
| CLI sessions are JSONL files under managed_sessions in the CLI home (default ~/.agiworkforce, override AGIWORKFORCE_HOME), with metadata JSON beside them and atomic writes under a directory lock; the CLI no longer uses SQLite for sessions. | read in the code | `apps/cli/src/sessions.rs:1-12,69-95,229-262`; `apps/cli/src/config.rs:480-484` |
| The CLI pushes managed-mode sessions to /api/chat/sync; a Local or BYOK session is refused by the client. The module comment in sessions.rs claiming no consumer chat sync is outdated. | read in the code | `apps/cli/src/cloud/mod.rs:326-335`; `apps/cli/src/cloud/client.rs:361-373`; `apps/cli/src/agent/mod.rs:2748-2754` |
| Production deploy only runs db:migrate verify; CI applies the chain twice, then verifies and runs an RLS probe. | read in the code | `.github/workflows/deploy-production.yml:328-329`; `.github/workflows/ci.yml:204-210` |
| Recovery is Neon point-in-time branching; there is no separate dump schedule, and the project's retained history window is not recorded in the repository. | stated requirement | `docs/runbooks/database-backup-restore.md:1-35` |
| 143 applied migrations still carry a 'NOT YET APPLIED : draft only' header; headers are not deployment state. | read in the code | `grep over apps/web/db/neon/*.sql` (not found); `scripts/check-migration-dependencies.mjs (comment above loadAppliedThrough)` |
| The legacy tables conversations, messages and chat_messages (0077) are exported and erased but no writer was found in apps/web app or lib. | inferred | `apps/web/db/neon/0077_gateway_compatibility_tables.sql`; `apps/web/app/api/user/export/route.ts:1773-1790`; `apps/web/lib/server/account-erasure.ts:65-66` |

## Open questions

- Who runs the production migration apply, with which target, and when? The production deploy workflow only runs verify and record.
- Does a migration file with its own BEGIN and COMMIT leave the ledger insert inside the runner's transaction? The runner opens BEGIN first and sends the file as one query. Not tested here.
- Is the mobile SQLite conversations and messages table pair intentionally empty, or is a writer planned? Product choice left open by the code.
- Which of the 278 created tables are in no erasure or retention inventory? check:retention-graph answers this but was not run.
- What is the Neon point-in-time history window for the production project?
- What does the VS Code extension store in globalState, workspaceState and secrets, and does it keep any chat history?
- Is any database row written for a signed-out Local mode session on any app? Not checked.
- Should the pre-0097 migrations get reversal scripts, or stay restore-only as the down README states?
- Should the 143 stale 'NOT YET APPLIED' headers be recorded in CORRECTIONS.md, given they cannot be edited?
- Who owns the legacy gateway tables conversations, messages and chat_messages now that no writer exists in apps/web?

## Project documents found out of date

- `apps/web/db/neon/0037_rls_user_isolation.sql (header)`: Says the live web query path uses getNeonDb() without withUser(), so RLS is correct but dormant and the app-layer user_id filter is the only active control. The code says: Request handlers obtain a scoped handle from getUserScopedDb, which binds the verified user and workspace and runs under app_rls. About 810 files import rls-db; getNeonDb() remains for crons, webhooks and erasure. (apps/web/lib/server/rls-db.ts:116-182; apps/web/lib/server/neon-db.ts:20-31; scripts/check-rls-boundary.mjs:11-20)
- `apps/web/db/neon/0182_managed_usage_microusd_ledger.sql (header)`: Says one credit is 20,000 microUSD and one cent is 10,000. The code says: One credit is 5,000 microUSD, and docs/architecture/credits.md agrees. (packages/contracts/types/src/credits.ts:3; docs/architecture/credits.md:14)
- `143 migration headers, for example 0203_user_memories_lifecycle.sql, 0239_resource_deletion_semantics.sql, 0425_adult_eligibility.sql`: Header text 'NOT YET APPLIED : draft only, pending explicit approval'. The code says: The recorded production watermark is 425, so these files are applied. Applied files cannot be edited. (scripts/config/production-migrations-applied.json; scripts/check-migration-dependencies.mjs (comment above loadAppliedThrough))
- `apps/cli/src/sessions.rs (module comment, Sync-rule isolation)`: Says the CLI must not sync consumer chat history and that no CLI code touches the synced chat tables. The code says: In managed (cloud) privacy mode the CLI pushes sessions to /api/chat/sync, which writes web_conversations and web_messages. Local and BYOK sessions are refused. (apps/cli/src/cloud/chat.rs:1-13; apps/cli/src/cloud/mod.rs:326-335; apps/cli/src/cloud/client.rs:361-373)
- `docs/architecture/overview.md (large chat files paragraph, line 158)`: Says that on 2026-11-15 migration 0422 is unapplied (appliedThrough 421). The code says: The recorded watermark is 425 as of 2026-11-21, so 0422 is applied. Whether large files are offered is a separate flag question. (scripts/config/production-migrations-applied.json; docs/architecture/overview.md:158)
- `apps/web/db/neon/0036_media_assets.sql (header)`: Not outdated on storage (it already says R2), but it names lib/server/object-storage.ts; the owner of bytes is now the shared platform object-storage package plus app helpers. The code says: Object storage is configured through AGI_STORAGE_* settings in packages/platform/object-storage. (packages/platform/object-storage/src/config.ts:7-17)
- `scripts/neon-migrate.mjs --help text`: Lists targets local, ci, branch and production only. The code says: MIGRATION_TARGETS also includes staging, and the staging deploy workflow uses it. (scripts/lib/neon-migrations.mjs:16; .github/workflows/deploy-staging.yml:145)
