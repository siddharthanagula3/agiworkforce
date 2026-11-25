---
id: "F094-04"
type: "feature"
title: "Expiry and background upkeep"
aliases: ["Memory expiry (S94.10)", "Background Memory maintenance (S94.15)", "expire-memories cron", "/api/cron/expire-memories", "memory consolidation sweep", "expires_at"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.10", "S94.15"]
depends_on: ["surface:web", "mode:cloud", "table:user_memories", "api:GET /api/cron/expire-memories", "file:vercel.json", "file:apps/web/lib/services/managed-memory-context-service.ts", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "SYS-authorization-and-workspaces", "SYS-sync-and-continuity", "F094-01", "F094-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-04 Expiry and background upkeep

A memory can have an end date. Expired memories stop appearing in replies at once. A daily job at 03:05 UTC marks expired memories deleted, then merges duplicates and replaces stale conflicting ones, in bounded batches. It needs no person to run it, and a run that cannot finish continues the next day.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.10](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9410), [S94.15](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9415).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps account memory tidy: hides then removes expired memories, merges leftover duplicates and resolves leftover conflicts on a schedule (apps/web/app/api/cron/expire-memories/route.ts:15-41).

**Why it exists.** Memories with an expiry must stop being used and be removed on schedule; maintenance must run without user action (S94.10, S94.15). Workspace retention can force an end date (apps/web/lib/services/managed-memory-context-service.ts:674-684).

**Who uses it.** The system; people see the effect (shorter, cleaner memory).

**Problems it solves**

- Temporary facts (a trip, a project) do not stay forever.
- Concurrent writes that left duplicates are cleaned up.
- Old stale facts about name, residence, employer, role and origin stop competing.

**Use cases**

- A memory created through the API with expiresAt 30 days ahead disappears from replies after that date and is blanked at the next daily run.
- A workspace with enforced retention caps new memory lifetimes.
- Two copies of 'I live in Rome' written at the same time are merged overnight.

## 2. User experience

**Where to find it**

- No screen. It is a server job configured in vercel.json (vercel.json:106-107).
- The effect shows in Settings > Memory on every app (entries vanish; replaced entries appear under 'Replaced memories').

**Before you start**

- A memory with expires_at set, or duplicate or conflicting rows. Expiry can be set by POST or PUT /api/memory with expiresAt (future, within 3,650 days) or imposed by workspace retention (apps/web/lib/services/managed-memory-context-service.ts:416-430,674-684).

**Screens and controls**

- None in the UI read. Expiry has no control in the shared editor (packages/ui/unified-chat/src/components/MemoryEditor.tsx).

**Journey**

1. A memory is saved with an expiry (API) or retention is enforced.
2. At the expiry time every read path stops returning it.
3. At 03:05 UTC the job blanks it (soft delete) in batches.
4. Then it merges duplicates and supersedes stale same-topic rows.
5. Other devices see the deletion at next sync.

**What the person sees and gets**

- No user-facing message. The route returns JSON {expired, remaining, consolidation:{merged, superseded, remaining}} and logs 'Memory expiry sweep completed' and 'Memory consolidation completed' (apps/web/app/api/cron/expire-memories/route.ts:22-35).

**Settings**

- Workspace memory retention (retentionDays, retentionEnforced) in the workspace policy; enforcement flag recorded since migration 0138 (apps/web/lib/services/managed-memory-context-service.ts:668-673).
- Cron schedule in vercel.json.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cron GET /api/cron/expire-memories at '5 3 * * *' (vercel.json:106-107), maxDuration 300 s, protected by verifyCronRequest (401 otherwise) (apps/web/app/api/cron/expire-memories/route.ts:11-21).
- Sweep: batches of 500, up to 200 batches, 240 s budget; sets the tombstone assignments on rows with expires_at <= now (apps/web/lib/services/managed-memory-context-service.ts:884-917).
- If the sweep ends with rows remaining, it logs a warning, skips consolidation and returns consolidation null (apps/web/app/api/cron/expire-memories/route.ts:28-31).
- Consolidation: duplicates first (batch 500, up to 50 batches, 40 s) then stale conflicts; a duplicate keeper takes the stronger rank and the longer expiry (or none) (apps/web/lib/services/managed-memory-context-service.ts:931-1082).
- Errors return HTTP 500 'Internal server error' and log 'Memory expiry cron failed' (apps/web/app/api/cron/expire-memories/route.ts:36-41).
- Reads check expires_at at query time, so expiry is immediate even before the job runs (apps/web/lib/services/managed-memory-context-service.ts:375-381).

**Incomplete**

- Consolidation topics are the five in MEMORY_CONFLICT_TOPICS only (packages/ai/agent-core/src/memory.ts:612-619).
- Imported memories are deduped by import key only at write time; the job later merges near duplicates (apps/web/lib/memory/import-store.ts:33-75).

**Present but disconnected or switched off**

- Nothing is switched off. Whether the cron is enabled in the production Vercel project is not recorded in files read.

**Not available**

- No user control to set an expiry in the UI, and a remember command cannot set one (apps/web/lib/services/memory-commands.ts:122-141).
- No hard removal of expired rows; they remain as blank tombstones.

## 4. Required behaviour

**Established requirements**

- Memories with an expiry date stop being used and are removed on schedule. (source: S94.10)
- Background jobs maintain memory (expiry, consolidation) without user action. (source: S94.15)

**Acceptance criteria**

1. A memory whose expires_at has passed is not returned by chat, list, export, import preview or sync as active, even before the cron runs.
2. After the 03:05 UTC run, expired rows have empty text and is_deleted true.
3. With more than 500 expired rows the sweep continues in batches until a short batch or its ceiling.
4. If the sweep hits its ceiling, consolidation is skipped for that run.
5. A request without the cron secret gets 401 and nothing changes.
6. A database failure returns 500 and is logged.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A person-set expiry in the past is refused by the API ('expiresAt must be in the future') [inferred from apps/web/lib/services/managed-memory-context-service.ts:416-430].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Alert when 'remaining' is true on consecutive days.
- [proposed] Add a metric for rows swept and merged per run.
- [proposed] Add an expiry choice to Settings > Memory.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/cron/expire-memories | `apps/web/app/api/cron/expire-memories/route.ts` | Runs sweep then consolidation |
| job | cron schedule | `vercel.json` | Schedule '5 3 * * *' at line 106-107 |
| service | sweepExpiredMemories | `apps/web/lib/services/managed-memory-context-service.ts` | Batched soft delete of expired rows |
| service | consolidateMemories | `apps/web/lib/services/managed-memory-context-service.ts` | mergeDuplicateMemoryBatch and supersedeStaleMemoryBatch |
| service | parseMemoryExpiry | `apps/web/lib/services/managed-memory-context-service.ts` | Validates expiresAt, 3,650 days max |
| service | clampMemoryExpiryToRetention | `apps/web/lib/services/managed-memory-context-service.ts` | Applies workspace retention when enforced |
| service | cron-auth | `apps/web/lib/server/cron-auth.ts` | verifyCronRequest |
| service | neon-db | `apps/web/lib/server/neon-db.ts` | getNeonDb used by the job |
| table | user_memories | `apps/web/db/neon/0203_user_memories_lifecycle.sql` | expires_at, superseded_by, superseded_at columns and index |
| schema | conflict topics | `packages/ai/agent-core/src/memory.ts` | MEMORY_CONFLICT_TOPICS |
| endpoint | POST/PUT /api/memory | `apps/web/app/api/memory/route.ts` | Accepts expiresAt |
| test | cron route test | `apps/web/app/api/cron/expire-memories/route.test.ts` | 401, success, 500 |
| test | memory-lifecycle test | `apps/web/lib/services/__tests__/memory-lifecycle.test.ts` | Sweep batching, backlog flag |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Vercel calls GET /api/cron/expire-memories on the schedule with the cron credential. | our servers | vercel.json:106-107; apps/web/app/api/cron/expire-memories/route.ts:15-21 |
| The sweep updates up to 500 due rows per statement to is_deleted true with text, category and import key cleared, repeating up to 200 times or 240 s. | our servers | apps/web/lib/services/managed-memory-context-service.ts:884-917 |
| If rows remain, return with consolidation null; otherwise run consolidation. | our servers | apps/web/app/api/cron/expire-memories/route.ts:28-31 |
| Duplicate merge: group active rows by user, project, workspace and normalised key; keep the highest rank then newest; extend the keeper's expiry to the longest; tombstone the rest. | our servers | apps/web/lib/services/managed-memory-context-service.ts:931-984 |
| Stale supersede: among active rows matching a conflict-topic prefix, keep one per topic and mark the others superseded_by it. | our servers | apps/web/lib/services/managed-memory-context-service.ts:986-1036 |
| Clients learn of the changes at the next /api/memory/sync pull. | device and our servers | apps/web/app/api/memory/sync/route.ts:55-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tombstoned and superseded rows | table user_memories | Yes; deleted flag computed from the active predicate | Rows are kept; text is blanked; no hard delete found |

**Models and providers.** No model or provider is used; it is SQL only.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No user account: a scheduled system call that covers all accounts' rows [inferred from getNeonDb and queries without a user filter]. |
| Permissions | Cron credential checked by verifyCronRequest (apps/web/app/api/cron/expire-memories/route.ts:16-19). Details of the credential: not read. |
| Subscription | none found in the code. |
| Limits and metering | Sweep 500 per batch, 200 batches, 240 s; consolidation 500 per batch, 50 batches, 40 s; route max duration 300 s; expiry max 3,650 days (apps/web/lib/services/managed-memory-context-service.ts:409,884-890,1054-1060; apps/web/app/api/cron/expire-memories/route.ts:11). |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Does not touch device-local memory. Mobile Local facts and CLI files have no expiry in the code read; the CLI prunes session summaries older than 30 days (apps/cli/src/memory_pipeline.rs:55-56). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unauthorized | 401 JSON and a warning log. | apps/web/app/api/cron/expire-memories/route.ts:16-19 |
| Backlog | remaining true, warning 'Memory expiry sweep hit its per-run ceiling', consolidation skipped, next day continues. | apps/web/app/api/cron/expire-memories/route.ts:25-31 |
| Consolidation backlog | Warning 'Memory consolidation hit its per-run ceiling'; duplicates before stale; remaining returned. | apps/web/app/api/cron/expire-memories/route.ts:32-35; apps/web/lib/services/managed-memory-context-service.ts:1054-1082 |
| Error | 500 and log; no partial-rollback logic shown beyond the per-batch statement. | apps/web/app/api/cron/expire-memories/route.ts:36-41 |
| Retry | Next scheduled run; no in-run retry. | apps/web/app/api/cron/expire-memories/route.ts:15-41 |
| Concurrent writes | Merge re-checks the key and active state in the same statement. | apps/web/lib/services/managed-memory-context-service.ts:970-979 |
| Offline / accessibility | Not applicable (server job). | apps/web/app/api/cron/expire-memories/route.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/cron/expire-memories/route.test.ts`: 401 without authorization with nothing swept; sweep plus consolidation summary; consolidation skipped when the sweep has a backlog; 500 on failure
- `apps/web/lib/services/__tests__/memory-lifecycle.test.ts`: Expiry parsing (future, null, past, distant), SQL excludes expired rows, soft-delete batches until a short batch, backlog report
- `apps/web/lib/services/__tests__/memory-eligibility-gate.test.ts`: Retention clamp may be covered (by file name; not read)

**Test scenarios**

- **Expired memory stops at once**
  1. Create a memory with expiresAt a few minutes ahead via the API.
  2. Wait until it passes without running the cron.
  3. Ask a question that would use it; list memories.
  - Expected: Not used and not listed; the row is still present until the cron.
- **Cron run**
  1. With a valid cron credential call GET /api/cron/expire-memories in a test database.
  2. Query user_memories for the expired row.
  - Expected: JSON with expired count and consolidation; row blank and is_deleted true.
- **Unauthorized**
  1. Call the route without the credential.
  - Expected: 401 and no changes.
- **Duplicates**
  1. Insert two active rows with the same normalised text in the same scope.
  2. Run the job.
  - Expected: One active row remains; the other is a tombstone; the keeper has the longer expiry or none.

**Where to look when it fails**

- Logs 'Memory expiry sweep completed', 'Memory expiry sweep hit its per-run ceiling', 'Memory consolidation completed', 'Memory expiry cron failed', 'Unauthorized memory expiry cron request'.
- Cron response body fields expired, remaining, consolidation.
- Table user_memories: expires_at, is_deleted, superseded_by.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No UI to set an expiry; remember command cannot set one.** Affects: All apps.. Evidence: apps/web/lib/services/memory-commands.ts:122-141. Work needed: Add UI and command phrasing.
- **Expired rows stay as tombstones forever.** Affects: Storage size.. Evidence: apps/web/lib/services/managed-memory-context-service.ts:391-392. Work needed: Decide a purge age after sync clients have seen the tombstone.
- **Local stores (Mobile Local, CLI files) have no expiry.** Affects: Mobile Local, CLI.. Evidence: apps/mobile/storage/memory.ts:1-60 has no expiry column. Work needed: Decide whether Local memory should expire.
- **Cron schedule time 03:05 UTC is not documented against production enablement.** Affects: Operations.. Evidence: vercel.json:106-107. Work needed: Confirm in the deployment.

**Depends on**

- surface:web
- mode:cloud
- table:user_memories
- api:GET /api/cron/expire-memories
- file:vercel.json
- file:apps/web/lib/services/managed-memory-context-service.ts
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- SYS-authorization-and-workspaces
- SYS-sync-and-continuity
- F094-01
- F094-03

## Unknown

- Whether the cron is enabled and succeeding in production.
- The credential mechanism inside verifyCronRequest.
- Whether workspace retention enforcement (migration 0138) is applied anywhere.
- Whether Mobile Local or CLI ever expire facts.
