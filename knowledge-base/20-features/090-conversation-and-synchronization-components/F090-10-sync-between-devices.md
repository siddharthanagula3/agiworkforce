---
id: "F090-10"
type: "feature"
title: "Sync between devices"
aliases: ["Cloud sync", "Chat sync", "/api/chat/sync", "Sync engine", "cloudSyncEngine", "server_version", "tombstone", "Offline queue", "Dirty set", "protocolVersion", "S90.16", "S90.17", "S90.19", "S90.21", "S90.23"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.16", "S90.17", "S90.19", "S90.21", "S90.23"]
depends_on: ["surface:mobile", "surface:cli", "surface:chrome", "surface:web", "surface:desktop", "mode:cloud", "table:web_conversations", "table:web_messages", "table:web_artifacts", "api:GET /api/chat/sync", "api:POST /api/chat/sync", "store:cloud-sync-state", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-10 Sync between devices

Cloud chats, messages and artifacts move between devices through one pull and push endpoint using a server version counter. A push names the version it was based on; the server applies it, accepts an exact repeat, or returns the server copy as a conflict. Deletes are tombstones. Old or new protocol versions are refused with a clear message.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.16](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9016), [S90.17](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9017), [S90.19](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9019), [S90.21](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9021), [S90.23](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9023).

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

**What it does.** GET /api/chat/sync returns changes after a cursor (up to 500 chats, 1000 messages, 500 artifacts). POST /api/chat/sync applies a device's changes using a base version, returns applied rows and conflicts with the current server copy, and advances a cursor. Deletes set deleted_at and flow as ordinary changes. (apps/web/app/api/chat/sync/route.ts:54-56,105-220,542-917)

**Why it exists.** The same account chat must look the same on Web, Mobile and other apps, and edits made offline must not be lost or overwrite newer changes. The brief states the rules: base version apply/conflict/idempotent, cursor pull/push, offline queue, tombstones, and a version floor (brief S90.16, S90.17, S90.19, S90.21, S90.23). Product docs name Account Cloud as the continuity domain shared by Web, Mobile Cloud, Desktop Cloud and eligible Chrome Managed Cloud. (doc: docs/product/suite.md:64-72)

**Who uses it.** Signed-in Cloud users on Mobile (full engine), Chrome (pull of conversations), CLI (push of sessions, pull of history), and the Web app (artifact sync). (apps/mobile/services/cloudSyncEngine.ts:1068-1077; apps/extension/src/features/cloud-bridge/conversationSync.ts:865; apps/cli/src/cloud/mod.rs:326-360; apps/web/features/chat/services/artifact-cloud-sync.ts:60,114)

**Problems it solves**

- Same chat on two devices.
- Edits made offline are queued and sent later (Mobile).
- A delete on one device is not undone by another device's later push.
- Old apps are told to update instead of failing to parse.
- Pages never skip rows: the cursor stops at the lowest unfinished table frontier. (apps/web/app/api/chat/sync/route.ts:958-998)

**Use cases**

- Write on the phone, open Web and see it.
- Edit in a tunnel; changes push when the phone reconnects.
- Delete a chat on Web; it disappears on the phone after the next pull.
- Run a CLI session; it appears in the account history.

## 2. User experience

**Where to find it**

- Mobile: runs on its own every 30 s while active and on return to foreground; status and error shown through the sync state store. (apps/mobile/services/cloudSyncEngine.ts:1068-1077; apps/mobile/stores/chat/cloudSyncStateStore.ts:45-75)
- CLI: a finished session is pushed to the account when Managed privacy mode is used (sync_session). 'agi sync' is a different feature: it syncs configuration files. (apps/cli/src/cloud/mod.rs:326-360; apps/cli/src/lib.rs:2327-2338)
- Chrome: eligible Managed Cloud conversations mirror to the account; the extension pulls conversations scope. (apps/extension/src/features/cloud-bridge/conversationSync.ts:865; doc: docs/product/suite.md:68-72)
- Web and Electron Desktop: the hosted app reads and writes chats through the conversation API directly; the sync endpoint is used there for artifacts. (apps/web/features/chat/services/artifact-cloud-sync.ts:60,114) [inferred for chats]

**Before you start**

- Cloud mode, signed in, and the Cloud chat feature flag on Mobile. (apps/mobile/services/cloudSyncEngine.ts:97-107)
- The workspace policy must allow chat sync. (apps/web/app/api/chat/sync/route.ts:111-112,551-552)
- Temporary chats never sync. (apps/mobile/services/cloudSyncEngine.ts:453,1088-1094; apps/web/app/api/chat/sync/route.ts:131)

**Screens and controls**

- No sync control found on Web. Mobile shows sync status and a 'chat sync off' reason from the state store (chatSyncOffReason). (apps/mobile/stores/chat/cloudSyncStateStore.ts:45)
- CLI prints a warning on conflicts: 'cloud sync has unresolved conflicts' with /export advice. (apps/cli/src/cloud/mod.rs:356-362)

**Journey**

1. Person makes a change; the app marks it dirty.
2. Every 30 s (or on foreground) Mobile pushes dirty conversations, messages and artifacts with a base version.
3. Server applies, accepts repeats, or returns conflicts with the server copy.
4. Mobile adopts the server copy for conflicts, or rebases.
5. Mobile then pulls in pages until hasMore is false and stores the new cursor.
6. Deleted rows arrive as tombstones and are removed or marked.

**What the person sees and gets**

- Push response: applied rows with new server_version, conflicts with current rows, cursor. (apps/web/app/api/chat/sync/route.ts:906-912)
- Too old: 426 client update required with a sentence naming the remedy; too new: validation error. (apps/web/app/api/chat/sync/route.ts:940-947; packages/contracts/cloud-contracts/src/sync.ts:33-43)
- Free daily limit refusal on new conversations or messages. (apps/web/app/api/chat/sync/route.ts:576-582)
- Workspace policy refusal shows the organization message on Mobile. (apps/mobile/services/cloudSyncEngine.ts:987-991)

**Settings**

- Workspace chat-sync policy (resource chat_sync). (apps/web/lib/managed-compute-gate.ts:262-281)
- Mobile app mode must be Cloud. (apps/mobile/services/cloudSyncEngine.ts:101)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Pull: three queries ordered by server_version; non-temporary chats only; deleted message and artifact content blanked; cursor from computePullCursor. (apps/web/app/api/chat/sync/route.ts:130-198,974-998)
- Push: applies when server_version equals base version, inserts base 0, tombstones, treats identical repeats as applied, returns conflicts with current rows. (apps/web/app/api/chat/sync/route.ts:222-340,833-875)
- A push does not revive a deleted row unless it is itself a delete. (apps/web/app/api/chat/sync/route.ts:629,833)
- Every insert or update gets a new version from a sequence by trigger. (apps/web/db/neon/0038_cloud_sync_versioning.sql:50-62)
- Deleting through sync revokes shares and unpublishes artifacts of those chats. (apps/web/app/api/chat/sync/route.ts:696-697)
- Protocol floor and ceiling: SYNC_PROTOCOL_VERSION 2, min 2; unversioned bodies read as too old except an empty legacy push. (packages/contracts/cloud-contracts/src/sync.ts:27-60; apps/web/app/api/chat/sync/route.ts:560-568,940-956)
- Mobile: durable dirty queue in MMKV, push then pull, conflict adoption, 30 s loop, foreground trigger. (apps/mobile/stores/chat/cloudSyncStateStore.ts:88-96; apps/mobile/services/cloudSyncEngine.ts:405-600,1068-1077)
- Shared client logic: tombstones and next-cursor rule in packages/client/sync. (packages/client/sync/src/tombstones.ts:20-25; packages/client/sync/src/cursor.ts:21-31)
- CLI records server versions after push and pull and sends protocolVersion; handshake reads 426 and the minimum version header. (apps/cli/src/cloud/chat.rs:343-364; apps/cli/src/cloud/handshake.rs:31-60)

**Incomplete**

- CLI pushes finished sessions; conflicts keep the local copy and warn, with no automatic merge. (apps/cli/src/cloud/mod.rs:356-362)
- Chrome pulls conversations only (scope) and mirrors eligible chats; the push side was not traced. (apps/extension/src/features/cloud-bridge/conversationSync.ts:865)
- Mobile's conflict handler removes a local conversation when the server copy is deleted (remove, not tombstone). (apps/mobile/services/cloudSyncEngine.ts:552-555)

**Present but disconnected or switched off**

- Tauri desktop has local tables cloud_sync_state and cloud_sync_pending_messages, but no engine calling /api/chat/sync was found in apps/desktop or src-tauri. (apps/desktop/src-tauri/src/data/db/migrations.rs:192-194; grep of apps/desktop)
- The brief says the CLI 'record server versions'; the CLI's 'agi sync' command is unrelated config sync. (apps/cli/src/lib.rs:2327-2338)

**Not available**

- VS Code: no chat sync client found; doc says VS Code stays local unless handed off. (doc: docs/product/suite.md:75-79)
- Local mode: sync is off; Local chats stay on the device. (apps/mobile/services/cloudSyncEngine.ts:101; doc: docs/product/suite.md:64-79)
- Web: no chat-sync client for conversations found (artifacts only).

## 4. Required behaviour

**Established requirements**

- Client pushes carry a base version; server applies, rejects as conflict, or treats as idempotent; clients reconcile conflicts with the server copy. (source: brief S90.16)
- Conversations, messages and artifacts changed on one device appear on the user's other devices through cursor pull and push. (source: brief S90.17)
- Changes made offline are queued durably and reconciled when connectivity returns. (source: brief S90.19)
- Deletions become tombstones that advance the cursor, reach other devices, and are not re-created by a later push. (source: brief S90.21)
- Clients declare a version; the server refuses too-old or too-new clients with an update-required answer instead of a parse failure. (source: brief S90.23)
- Normal synced chat is shared by Web, Mobile Cloud and public Electron Desktop; Chrome mirrors only chats whose every turn is Managed Cloud; CLI and VS Code stay local unless explicitly handed off. (source: doc: docs/decisions/README.md:55)
- Unknown-provenance or Local/BYOK-mixed Chrome conversations stay browser-local. (source: doc: docs/product/suite.md:68-72)
- Temporary chats are never synced. (source: apps/web/app/api/chat/sync/route.ts:131)

**Acceptance criteria**

1. A message written on Mobile appears on a second signed-in client after one sync interval.
2. Pushing with a stale base version returns a conflict containing the current server row and does not overwrite it.
3. Repeating an identical push returns applied, not a conflict.
4. A chat deleted on device A is absent on device B after pull, and a later push from B of the same chat does not recreate it.
5. With 600 changed chats, the first pull returns 500 and hasMore true, and the second returns the rest with no missed row.
6. A push with protocolVersion 1 returns 426; one above the server's returns a validation error.
7. A temporary chat created on Mobile never appears in a pull.
8. Airplane-mode edits on Mobile are sent after reconnect and survive an app restart.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Free-plan daily creation caps apply to sync pushes, so a Free user can be refused on sync. [inferred from assertFreeDailyAllowance]
- Local mode on Mobile and Desktop must never sync to Cloud without an explicit fork. (doc: AGENTS.md section 6)

**Proposed improvements** (suggestions, not requirements)

- [proposed] A visible 'Sync paused' state with the reason on every app that syncs.
- [proposed] A pending-changes count on Mobile while offline.
- [proposed] Document the Tauri desktop sync tables as unused or wire them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/chat/sync | `apps/web/app/api/chat/sync/route.ts` | Pull, push, conflict, cursor, protocol check. |
| schema | sync contracts | `packages/contracts/cloud-contracts/src/sync.ts` | Request and response schemas, protocol versions. |
| schema | 0038 versioning | `apps/web/db/neon/0038_cloud_sync_versioning.sql` | server_version column, sequence and trigger. |
| schema | 0039 artifact sync | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Versioning for artifacts. |
| table | web_conversations / web_messages / web_artifacts | `apps/web/app/api/chat/sync/route.ts` | Rows read and written by sync. |
| service | managed-compute-gate chat sync | `apps/web/lib/managed-compute-gate.ts` | buildChatSyncGateResponse workspace policy. |
| service | tier-unit-quota-service | `apps/web/lib/services/tier-unit-quota-service.ts` | assertFreeDailyAllowance for new chats and messages. |
| service | packages/client/sync | `packages/client/sync/src/conversations.ts` | Shared apply-delta, tombstone and cursor logic. |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | Mobile push, pull, conflicts, 30 s loop. |
| store | cloudSyncStateStore | `apps/mobile/stores/chat/cloudSyncStateStore.ts` | Persisted cursor and dirty queue (MMKV 'cloud-sync-state'). |
| service | CLI chat sync | `apps/cli/src/cloud/chat.rs` | Builds push, applies responses, pull. |
| service | CLI sync_session | `apps/cli/src/cloud/mod.rs` | Pushes a session snapshot after a turn. |
| service | CLI handshake | `apps/cli/src/cloud/handshake.rs` | Reads 426 and minimum version header. |
| service | Chrome conversationSync | `apps/extension/src/features/cloud-bridge/conversationSync.ts` | Pull with conversations scope. |
| service | artifact-cloud-sync (web) | `apps/web/features/chat/services/artifact-cloud-sync.ts` | Web artifact pull and push. |
| config | client handshake headers | `packages/contracts/cloud-contracts/src/client-handshake.ts` | x-agi-api-version and minimum version header names. |
| service | api-gateway-policy | `apps/web/lib/api-gateway-policy.ts` | Refuses a too-old API contract version with client update required. |
| service | Desktop sync tables | `apps/desktop/src-tauri/src/data/db/migrations.rs` | Local tables cloud_sync_state, cloud_sync_pending_messages (no engine found). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A local change marks the chat or message dirty and stores it in the persisted queue. | device | apps/mobile/stores/chat/cloudSyncStateStore.ts:50-62,88-96 |
| The 30 s timer or a foreground event starts a sync if Cloud mode and signed in. | device | apps/mobile/services/cloudSyncEngine.ts:1068-1077,1008 |
| Push sends items with baseVersion and protocolVersion 2. | device and our servers | apps/mobile/services/cloudSyncEngine.ts:505; apps/web/app/api/chat/sync/route.ts:542-568 |
| Server checks CSRF, rate limit, workspace policy, protocol, free-plan allowance, then applies each batch in SQL. | our servers | apps/web/app/api/chat/sync/route.ts:542-582,222-340 |
| Server returns applied versions, conflicts and a cursor; the device clears applied items and adopts server copies of conflicts. | device | apps/mobile/services/cloudSyncEngine.ts:521-583 |
| Pull fetches changes after the cursor in pages; the device applies deltas and stores the safe cursor. | device and our servers | apps/mobile/services/cloudSyncEngine.ts:431-444; packages/client/sync/src/cursor.ts:21-31 |
| Deleted rows come as deleted_at and are applied as tombstones. | device | packages/client/sync/src/conversations.ts:49-55 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversations, messages (with model and provider labels), artifacts, server_version | tables web_conversations, web_messages, web_artifacts | Yes, this is the sync | Soft-delete (deleted_at) with content blanked on pull; hard removal policy not established here. |
| Cursor and dirty queue | Mobile MMKV store 'cloud-sync-state'; CLI local SyncState file | No (device-only) | Reset on sign-out or account change (reset action) (apps/mobile/stores/chat/cloudSyncStateStore.ts:77-87) |

**Models and providers.** Sync carries model and provider labels per message as text; no model is called. (apps/web/app/api/chat/sync/route.ts:236-239)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account; rows are per user and workspace through the user-scoped database. (apps/web/app/api/chat/sync/route.ts:111,543) |
| Permissions | Workspace policy 'chat_sync'; project ids must belong to the active workspace. (apps/web/lib/managed-compute-gate.ts:262-281; apps/web/app/api/chat/sync/route.ts:68-98) |
| Subscription | Free plan has daily caps on new conversations and new messages written by sync; paid plan caps not read here. (apps/web/app/api/chat/sync/route.ts:576-582; apps/web/lib/services/tier-unit-quota-service.ts:519-539) |
| Limits and metering | Pull page limits 500, 1000 and 500; rate limits 'chat-conversation-read' and 'chat-conversation'. (apps/web/app/api/chat/sync/route.ts:54-56,106-108,547-549) |
| Feature flags | Mobile: FEATURES.cloudChat. (apps/mobile/services/cloudSyncEngine.ts:100) |
| Model compatibility | Model independent. |
| Provider restrictions | None. |
| Local mode | No sync: Mobile requires appMode 'cloud'; the docs keep Local, BYOK-mixed and developer sessions out of the account store unless handed off. (apps/mobile/services/cloudSyncEngine.ts:101; doc: docs/product/suite.md:64-79) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Conflict | Server returns current row; Mobile adopts or rebases; CLI keeps local and warns. | apps/mobile/services/cloudSyncEngine.ts:549-583; apps/cli/src/cloud/mod.rs:356-362 |
| Identical repeat | Counted as applied (idempotent CTE). | apps/web/app/api/chat/sync/route.ts:305-327 |
| Saturated page | Cursor stays at the lowest frontier; overlap re-sent and upserted. | route.ts:958-998 |
| Protocol too old / too new | 426 / validation error with a sentence. | route.ts:940-947 |
| Workspace policy denies | 403 organization_policy; Mobile shows the message and turns chat sync off with a reason. | apps/mobile/services/cloudSyncEngine.ts:987-1000 |
| Offline | Dirty queue persists; next loop pushes. | cloudSyncStateStore.ts:88-96 |
| Account switch mid-sync | Stale account operations are ignored. | apps/mobile/services/cloudSyncEngine.ts:1036-1040 |
| Temporary chat | Skipped from push, not returned on pull. | cloudSyncEngine.ts:453,1088-1094; route.ts:131,150 |
| Push failure | Server logs 'Cloud sync push failed' and returns an internal error; Mobile sets status error with failed steps. | route.ts:913-916; cloudSyncEngine.ts:1030-1036 |
| Accessibility | Not handled in the code reviewed; no UI found. | none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/chat-sync-push.test.ts`: Push route.
- `apps/web/__tests__/api/chat-sync-push.variants.test.ts`: Push variants.
- `apps/web/__tests__/api/chat-sync-cursor.test.ts`: Pull cursor computation.
- `apps/web/app/api/chat/sync/__tests__/route.contract.test.ts`: Route contract.
- `packages/contracts/cloud-contracts/src/__tests__/sync-protocol-floor.test.ts`: Protocol floor.
- `packages/contracts/cloud-contracts/src/__tests__/sync-protocol-version.test.ts`: Protocol version rules.
- `packages/client/sync/src/__tests__/tombstone-coverage.test.ts`: Tombstone handling across object types.
- `packages/client/sync/src/__tests__/deletion-durability.test.ts`: Deletions survive the sync.
- `apps/mobile/__tests__/cloud-sync-engine.test.ts`: Mobile engine.
- `apps/mobile/__tests__/cloud-sync-turn-order.test.ts`: Message order.
- `apps/extension/__tests__/conversation-cloud-sync-state.test.ts`: Chrome sync state.
- `apps/web/features/chat/services/artifact-cloud-sync.test.ts`: Web artifact sync.

**Test scenarios**

- **Two-device round trip**
  1. Sign in on two devices.
  2. Write a message on the phone.
  3. Wait one interval, open Web.
  - Expected: Message shown on both, same order.
- **Stale push conflict**
  1. Edit a chat title on device A and device B while both offline.
  2. Reconnect A then B.
  - Expected: B gets a conflict with A's title and does not overwrite it silently.
- **Delete propagation**
  1. Delete a chat on Web.
  2. Sync the phone.
  3. Edit the same chat locally before the pull if possible, then sync.
  - Expected: Chat is gone on the phone and not recreated.
- **Old client**
  1. Send a push with protocolVersion 1.
  - Expected: 426 with a message naming the remedy.
- **Large history**
  1. Seed 1200 messages after the cursor and pull repeatedly.
  - Expected: Pages of up to 1000 messages, no gaps, hasMore ends false.
- **Temporary chat**
  1. Create a temporary chat on Mobile, edit it, sync.
  - Expected: Nothing for it appears on the server.

**Where to look when it fails**

- Logs 'Cloud sync pull failed', 'Cloud sync push failed', '[chat-sync] denied by workspace policy'.
- Mobile store fields status, lastError, failedSyncSteps, chatSyncOffReason.
- Table columns server_version and deleted_at on web_conversations, web_messages, web_artifacts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No chat sync engine found on Tauri desktop or Web for conversations; only artifacts on Web** Affects: Tauri desktop shell (internal) and any claim of a client engine on Web. Evidence: grep of apps/desktop and apps/web for api/chat/sync; apps/desktop/src-tauri/src/data/db/migrations.rs:192-194. Work needed: Confirm how the hosted app reads chats, and wire or remove the Tauri tables.
- **CLI conflicts need manual resolution** Affects: CLI users. Evidence: apps/cli/src/cloud/mod.rs:356-362. Work needed: A merge or rebase flow.
- **Brief cites CLI chat.rs:348 for pull; this build's pull code is at chat.rs:1164-1201 and record logic at 343-364** Affects: Documentation. Evidence: apps/cli/src/cloud/chat.rs:1164. Work needed: Refresh the brief.
- **Two version rules exist (sync protocol 2 and API contract date header); the 426 for contract is raised in api-gateway-policy, not in the sync route** Affects: Engineers testing version refusals. Evidence: apps/web/lib/api-gateway-policy.ts:61-70; route.ts:940-947. Work needed: Document both in one place.
- **VS Code has no chat sync (by design per docs)** Affects: VS Code users. Evidence: doc: docs/product/suite.md:75-79. Work needed: None unless parity decision changes.

**Depends on**

- surface:mobile
- surface:cli
- surface:chrome
- surface:web
- surface:desktop
- mode:cloud
- table:web_conversations
- table:web_messages
- table:web_artifacts
- api:GET /api/chat/sync
- api:POST /api/chat/sync
- store:cloud-sync-state
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts

## Unknown

- Whether Electron Desktop or Web read chats through the sync endpoint (only artifacts found).
- Whether the Tauri desktop cloud_sync tables have a caller.
- Paid plan caps on sync writes.
- How Chrome pushes mirrored conversations.
- Hard-delete retention of tombstoned rows.
- Whether the brief's 'artifact' sync is available on CLI (CLI push code sends conversations and messages only, not artifacts).
