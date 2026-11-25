---
id: "F103-03"
type: "feature"
title: "Chats, branches and memory"
aliases: ["Conversations and turns (S103.06)", "Message versions and branches (S103.07)", "Context manifests (S103.09)", "Memory items and provenance (S103.10)", "web_conversations", "web_messages", "conversation_branches", "context_manifests", "user_memories", "Temporary chat"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.06", "S103.07", "S103.09", "S103.10"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-local-inference", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:cloud", "table:web_conversations", "table:web_messages", "table:context_manifests", "table:user_memories"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-03 Chats, branches and memory

The server records of chats: conversations and messages, message versions and forked branches, a per-turn record of what context was sent to the model, and saved memories with versions for conflict-safe sync. Temporary chats carry a flag and are purged after 30 days. Local-mode chats are not written here unless the app syncs.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.06](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10306), [S103.07](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10307), [S103.09](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10309), [S103.10](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10310).

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

**What it does.** Keeps conversations (web_conversations) and messages (web_messages) with tree parents for message versions, copies a conversation into a branch from a chosen message, records a context manifest for each turn, and stores memories with a server version so apps can sync them (apps/web/db/neon/0001_mvp_chat.sql:3; apps/web/lib/services/conversation-branch-service.ts:194; packages/platform/context-engine/src/manifest-store.ts:55; apps/web/app/api/memory/sync/route.ts:211).

**Why it exists.** So chat history survives devices and sessions, a person can try another answer without losing the first, the product can show what context shaped a turn, and what the assistant remembers is the same on every app. Brief items S103.06, S103.07, S103.09 and S103.10 (doc: knowledge-base/data/area-briefs/103-data-and-persistence-categories.md).

**Who uses it.** Every person who chats in Cloud mode; sync clients (mobile, CLI, VS Code) for memory.

**Problems it solves**

- Losing chats between devices (apps/web/app/api/chat/sync/route.ts)
- Overwriting a newer memory edit from another device (apps/web/app/api/memory/sync/route.ts:211)
- Two devices creating the first message variant at once (apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:29)
- Chats meant to be temporary living forever (apps/web/app/api/cron/purge-temporary-chats/route.ts)

**Use cases**

- Start a chat on web and continue on mobile in Cloud mode.
- Branch from an earlier message to try a different question.
- Edit a message and flip between versions.
- Save a memory on the phone and see it on web.

## 2. User experience

**Where to find it**

- Web: /chat (history and composer), Settings > Memory, Settings > Archived chats, Settings > Deleted chats (apps/web/app/settings/memory; apps/web/features/settings/sections/ArchivedChatsSection.tsx:87; apps/web/features/settings/sections/DeletedChatsSection.tsx:60). Composer text 'Temporary chats never read or save memory.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6137).
- Mobile: syncs chats and memory only when the app mode is cloud (apps/mobile/services/cloudSyncEngine.ts:101). A Temporary chat setting exists in mobile settings (apps/mobile/src/features/settings/data-controls/index.tsx).
- CLI: hosted chat history and memory clients (apps/cli/src/cloud/chat.rs; apps/cli/src/cloud/memory.rs).
- VS Code: account memory client (apps/extension-vscode/src/memory/accountMemoryClient.ts).
- Desktop and Chrome: chat sync metadata exists in the desktop (apps/desktop/src/runtime/cloudMessageMetadata.ts); visible labels: unknown.

**Before you start**

- Cloud mode with a signed-in account for server storage.
- Memory also needs the workspace and personal memory switches on (apps/web/app/api/memory/sync/route.ts:211).

**Screens and controls**

- Composer with a Temporary chat toggle.
- Message variant pager and delete confirmation (test apps/web/features/chat/components/messages/VariantPager.test.tsx exists).
- Memory list and settings.

**Journey**

1. 1. Person sends a message; the conversation is created or updated (POST /api/chat/conversations).
2. 2. The turn is assembled and a context manifest is written.
3. 3. Messages are stored; editing creates a variant; Branch calls the fork service.
4. 4. A memory is saved on any app; the app pushes it with the version it saw.
5. 5. Server applies it or returns the current server copy as a conflict.

**What the person sees and gets**

- Creating a conversation in a missing or archived project returns 'Project not found' (apps/web/app/api/chat/conversations/route.ts:238).
- A conversation that is gone returns 409 'This conversation is no longer available. Start a new conversation.' (apps/web/app/api/chat/conversations/route.ts:238).
- Memory push answers applied, conflicts (with the current server copy), rejected (with reason and message) and a cursor (apps/web/app/api/memory/sync/route.ts:211).
- Branch limits: 'This message already has the maximum number of branches'; 'This conversation already has the maximum number of forks' (apps/web/lib/services/conversation-branch-service.ts:279).

**Settings**

- Temporary chat (privacy settings; apps/web/features/settings/sections/PrivacySection.tsx).
- Memory switches and workspace memory policy (apps/web/lib/services/managed-memory-context-service.ts:721).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create conversation checks the project belongs to the user and workspace, is not archived or deleted; a temporary chat cannot join a project (apps/web/app/api/chat/conversations/route.ts:238).
- Create counts against a free daily allowance for conversation creates (assertFreeDailyAllowance, apps/web/app/api/chat/conversations/route.ts:238).
- Message insert is idempotent on the client message id and cannot touch another conversation's message (apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:29).
- Message variants form a tree with parent ids and an active leaf, serialised by a row lock (apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:29; apps/web/db/neon/0156_message_thread_variants.sql).
- forkConversation copies a conversation up to a message into a new conversation, is idempotent by request id, and caps 50 branches per fork point and 100 fork points per conversation (apps/web/lib/services/conversation-branch-service.ts:49-50,194).
- Context manifests are written with insert-or-update by turn id; an update applies only when the stored user is the same user (packages/platform/context-engine/src/manifest-store.ts:55). The manifest carries a temporary_chat flag.
- Memory push applies each change only when the client's base version equals the server version, otherwise returns a conflict with the current record; deletes are allowed even when memory is off (apps/web/app/api/memory/sync/route.ts:211).
- Memory text passes exclusion and admission gates before it is stored (apps/web/lib/services/managed-memory-context-service.ts:721).
- Temporary chats are flagged is_temporary and purged by a cron with a 30-day retention (apps/web/db/neon/0050_temporary_chat_retention.sql:1; apps/web/app/api/cron/purge-temporary-chats/route.ts).

**Incomplete**

- Memory provenance columns source_conversation_id, source_turn_id and provenance are written by managed-memory-context-service.ts:820 but the sync push SQL does not set them (apps/web/app/api/memory/sync/route.ts:211), so a memory pushed from an app carries no source conversation. Migration header says not applied (apps/web/db/neon/0285_user_memories_provenance.sql:4).

**Present but disconnected or switched off**

- Migrations 0252 (context manifests) and 0285 (memory provenance) carry 'NOT YET APPLIED : draft only' headers (apps/web/db/neon/0252_context_manifests_and_source_policy.sql; apps/web/db/neon/0285_user_memories_provenance.sql:4). Applied state: unknown. The file 0285 is titled 'Migration 0284' inside.

**Not available**

- Server storage of Local-mode chats: not written by the apps unless in cloud mode (mobile evidence: apps/mobile/services/cloudSyncEngine.ts:101); for desktop, CLI and VS Code: unknown.

## 4. Required behaviour

**Established requirements**

- Conversations and their turns are durably stored and classified. (source: S103.06)
- Message versions and conversation branches are stored and classified with their conversation. (source: S103.07)
- Context manifests (what went into each turn's context) are durably recorded and classified. (source: S103.09)
- Memory items and their provenance (source conversation and turn) are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.10)
- A conversation joins a project only if the user owns it and it is not archived or deleted. (source: apps/web/app/api/chat/conversations/route.ts:238)
- Temporary chats never read or save memory. (source: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6137)

**Acceptance criteria**

1. POST a conversation with another user's project id: 404 'Project not found'.
2. POST a temporary conversation with a project id: validation refusal.
3. Push a memory with a stale base version: response has a conflict containing the server copy and the server copy is unchanged.
4. Fork a conversation twice with the same request id: one new conversation.
5. Fork the 51st branch from one message: refused with the maximum message.
6. Write a manifest for a turn id owned by another user: the other user's manifest is unchanged.
7. After 30 days a temporary conversation is removed by the purge job.
8. A memory created by the model records its source conversation and turn.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A memory typed by hand has no source conversation [inferred from nullable columns in 0285].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass source conversation and turn through the memory sync contract so app-made memories carry provenance.
- [proposed] Show the person which memory came from which chat.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | web_conversations / web_messages | `apps/web/db/neon/0001_mvp_chat.sql` | Conversation and message rows with soft delete. |
| table | conversation_branches | `apps/web/db/neon/0022_chat_features.sql` | Maps a source conversation and branch point to its branch conversation. |
| schema | message thread variants | `apps/web/db/neon/0156_message_thread_variants.sql` | parent id and active leaf for message versions. |
| table | context_manifests | `apps/web/db/neon/0252_context_manifests_and_source_policy.sql` | One row per turn: entries, budgets, versions, temporary flag. |
| table | user_memories | `apps/web/db/neon/0010_memory.sql` | Memory text with category, source, pinned, deleted flag, server version. |
| schema | memory provenance columns | `apps/web/db/neon/0285_user_memories_provenance.sql` | source_conversation_id, source_turn_id, provenance. |
| endpoint | /api/chat/conversations | `apps/web/app/api/chat/conversations/route.ts` | List and create conversations with project and quota checks. |
| endpoint | /api/chat/conversations/[id] | `apps/web/app/api/chat/conversations/[id]/route.ts` | Read, update, delete, restore, keep, branches, messages. |
| service | message-thread | `apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts` | Idempotent message insert and thread locking. |
| service | conversation-branch-service | `apps/web/lib/services/conversation-branch-service.ts` | List branch groups and fork a conversation. |
| endpoint | /api/chat/sync | `apps/web/app/api/chat/sync/route.ts` | Sync protocol for chats, messages and artifacts used by mobile, desktop and CLI. |
| service | createPostgresContextManifestStore | `packages/platform/context-engine/src/manifest-store.ts` | Writes and reads manifests, owner-scoped. |
| endpoint | /api/memory/sync | `apps/web/app/api/memory/sync/route.ts` | Versioned memory push and pull with conflicts. |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Memory admission policy and consolidated writes with provenance. |
| job | purge-temporary-chats | `apps/web/app/api/cron/purge-temporary-chats/route.ts` | Removes temporary chats after 30 days. |
| job | expire-memories | `apps/web/app/api/cron/expire-memories` | Memory expiry cron (behaviour not opened). |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | Mobile sync of chats, memory, projects and settings, gated on cloud mode. |
| service | CLI chat and memory sync | `apps/cli/src/cloud/chat.rs` | CLI writes to hosted chat history; memory.rs does the same for memory. |
| service | VS Code accountMemoryClient | `apps/extension-vscode/src/memory/accountMemoryClient.ts` | VS Code memory client. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies conversation, message, memory and manifest tables. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App sends a message to create or update the conversation; server validates project and free allowance and upserts the row. | our servers | apps/web/app/api/chat/conversations/route.ts:238 |
| The turn's context is assembled and a manifest row is written. | our servers | packages/platform/context-engine/src/manifest-store.ts:55 |
| The model call itself is handled by the chat pipeline (SYS-chat-turn-pipeline); here only the stored result matters. | outside service | apps/web/db/neon/0001_mvp_chat.sql:3 (messages keep model and provider) |
| Mobile pushes dirty messages and memories when mode is cloud. | device and our servers | apps/mobile/services/cloudSyncEngine.ts:101 |
| Memory push is applied row by row by base version in one SQL statement; conflicts return the current server row. | our servers | apps/web/app/api/memory/sync/route.ts:211 |
| Daily cron deletes temporary chats past 30 days. | our servers | apps/web/app/api/cron/purge-temporary-chats/route.ts; vercel.json:26 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Messages and conversations | web_conversations, web_messages | Through /api/chat/sync for mobile, desktop and CLI; web reads directly. | Soft delete; recoverable for 30 days from Deleted chats (apps/web/features/settings/sections/DeletedChatsSection.tsx:60); temporary chats purged at 30 days. |
| Context manifest | context_manifests | Server only. | Classified as derived content (apps/web/lib/services/deletion-manifest.ts:108-115). |
| Memories | user_memories | Pull and push by cursor. | Deleted memory text is cleared (migration 0355, test apps/web/app/api/memory/__tests__/deletion-clears-text.test.ts). |

**Models and providers.** Messages record the model and provider that answered (web_messages model and provider columns, apps/web/db/neon/0001_mvp_chat.sql:3). A model may extract memories from a chat (managed-auto-memory-service tests exist); which models: unknown and not named here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required for any server storage. |
| Permissions | Every query is scoped by user id and workspace; the manifest update applies only to its owner (packages/platform/context-engine/src/manifest-store.ts:55). Workspace policy allow_memory can switch memory off for the workspace (apps/web/lib/services/managed-memory-context-service.ts:721). |
| Subscription | Free accounts have a daily allowance checked on conversation create and branch (assertFreeDailyAllowance in apps/web/app/api/chat/conversations/route.ts:238 and apps/web/lib/services/conversation-branch-service.ts:194). The numeric allowance: unknown. |
| Limits and metering | Branch limits 50 and 100 (apps/web/lib/services/conversation-branch-service.ts:49-50). Temporary chat retention 30 days (purge cron). Memory limits per plan: unknown. |
| Feature flags | none found in the code opened for these tables. |
| Model compatibility | Selected route must serve the model: 'The selected provider route cannot serve this model' (apps/web/app/api/chat/conversations/route.ts:238). |
| Provider restrictions | The conversation stores selected_route_id for managed routes (apps/web/app/api/chat/conversations/route.ts:238). |
| Local mode | In Local mode on mobile no chat or memory is pushed (apps/mobile/services/cloudSyncEngine.ts:101). For desktop, CLI, VS Code and Chrome the rule: unknown. Local inference needs no subscription; whether it needs sign-in: not determined here. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Retry of a stored message | Same id updates in place, no duplicate or unique error. | apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:29 |
| Two devices create a first variant at once | Serialised by a row lock; the second reads the first's leaf. | apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:29 |
| Memory conflict | Returned in conflicts with the server copy; nothing is overwritten. | apps/web/app/api/memory/sync/route.ts:211 |
| Memory refused by policy | Listed in rejected with message; deletes never blocked. | apps/web/app/api/memory/sync/route.ts:211 |
| Free daily allowance reached while forking | If the same request id already branched, return that branch; else raise the limit error. | apps/web/lib/services/conversation-branch-service.ts:194 |
| Conversation deleted | Create returns 409 conversation_unavailable. | apps/web/app/api/chat/conversations/route.ts:238 |
| Offline | Mobile keeps messages as dirty and syncs later (dirty refs); details not opened. | apps/mobile/services/cloudSyncEngine.ts (imports DirtyMessageRef from cloudSyncStateStore) |
| Accessibility | not established in this pass. | Variant pager and branch controls not opened |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/route.organization-scope.test.ts`: Workspace scoping of conversations.
- `apps/web/app/api/chat/conversations/route.temporary-history.test.ts`: Temporary chats kept out of history.
- `apps/web/app/api/chat/conversations/[id]/route.variants.test.ts`: Message variants.
- `apps/web/db/neon/message-thread-variants-migration.test.ts`: Variant migration.
- `apps/web/lib/services/conversation-branch-service.test.ts`: Fork and branch groups.
- `apps/web/app/api/memory/sync/__tests__/route.contract.test.ts`: Memory sync contract.
- `apps/web/app/api/memory/__tests__/deletion-clears-text.test.ts`: Deleted memory text cleared.
- `apps/web/lib/services/__tests__/memory-provenance.test.ts`: Provenance.
- `apps/web/lib/server/__tests__/temporary-chat-purge.test.ts`: Temporary chat purge.
- `apps/web/app/api/cron/purge-temporary-chats/route.test.ts`: Purge cron.
- `packages/platform/context-engine/src/__tests__/engine.test.ts`: Context engine (a direct manifest store test was not found).

**Test scenarios**

- **Cross-device memory conflict**
  1. Create a memory on device A and sync.
  2. Edit it on A and B without syncing between.
  3. Sync A, then B.
  - Expected: B gets a conflict with A's text; server text stays A's.
- **Project guard**
  1. Create a conversation with a project id owned by someone else.
  2. Create one with an archived project.
  - Expected: Both refused with 'Project not found'.
- **Branch cap**
  1. Fork one message repeatedly with new request ids.
  - Expected: Refused once the 50 limit is reached.
- **Temporary chat purge**
  1. Create a temporary chat.
  2. Age it past 30 days in a test database.
  3. Run the purge job.
  - Expected: Conversation and its files removed.
- **Manifest ownership**
  1. Write a manifest as user A.
  2. Write the same turn id as user B.
  - Expected: A's row is unchanged.
- **Local mode on phone**
  1. Set the phone to Local.
  2. Chat and memory-save.
  3. Check server tables.
  - Expected: No rows for these chats.

**Where to look when it fails**

- Log 'Failed to create conversation', 'Memory sync push failed', 'Failed to validate conversation project'.
- Tables web_conversations, web_messages, context_manifests, user_memories (server_version).
- Response fields conflicts and rejected from /api/memory/sync.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Memory pushed from an app has no source conversation or turn.** Affects: Mobile, CLI, VS Code and any sync client. Evidence: apps/web/app/api/memory/sync/route.ts:211 insert list vs apps/web/lib/services/managed-memory-context-service.ts:820. Work needed: Add provenance to the sync contract and SQL.
- **Migrations 0252 and 0285 marked not applied.** Affects: All apps. Evidence: headers line 4 of each file. Work needed: Confirm ledger; fix the 0284/0285 title mismatch.
- **Manifest writes are not write-once: same-user rewrites replace the row.** Affects: Audit use of manifests. Evidence: packages/platform/context-engine/src/manifest-store.ts:55. Work needed: Decide whether turns need immutable manifests.
- **Local mode behaviour on desktop, CLI, VS Code and Chrome not established.** Affects: Those apps. Evidence: Only mobile gate found (apps/mobile/services/cloudSyncEngine.ts:101). Work needed: Trace each app's sync gate.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-local-inference
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:cloud
- table:web_conversations
- table:web_messages
- table:context_manifests
- table:user_memories

## Unknown

- Whether migrations 0252 and 0285 are applied in production.
- Numeric free daily allowance and memory limits per plan.
- Local-mode sync rules on desktop, CLI, VS Code and Chrome.
- Which model extracts automatic memories.
- What expire-memories removes and when.
- Accessibility of the variant pager and branch controls.
