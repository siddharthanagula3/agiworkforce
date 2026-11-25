---
id: "F090-02"
type: "feature"
title: "Versions, branches and forks"
aliases: ["Message-version store (S90.03)", "Branch graph (S90.04)", "Response variants / in-thread variants", "Version pager (previous/next)", "Branch conversation from here", "Duplicate as branch", "Fork", "conversation_branches"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.03", "S90.04"]
depends_on: ["SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-subscriptions-entitlements-and-usage", "F090-01", "F090-03", "table:web_messages", "table:web_conversations", "table:conversation_branches", "table:conversation_branch_messages", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-02 Versions, branches and forks

Edits and regenerations are kept as sibling messages under one parent, and the chat records which path is visible. A fork copies the chat up to a chosen message into a new chat linked to its source. Web and mobile can fork; web shows a version pager on turns.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.03](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9003), [S90.04](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9004).

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

**What it does.** Stores a chat as a tree through web_messages.parent_id, records the visible path in web_conversations.active_leaf_message_id, and creates forked chats that copy messages up to a fork point and are linked in conversation_branches and conversation_branch_messages (apps/web/db/neon/0156_message_thread_variants.sql:36-53; apps/web/lib/services/conversation-branch-service.ts:194-479).

**Why it exists.** Replacing a regenerated answer or an edited question in place destroys the earlier one; the product contract says in-place replacement is not acceptable when later turns depend on the old message (doc: docs/product/experience-contract.md:417-429).

**Who uses it.** People who regenerate answers, edit earlier questions, or want to try another direction without changing the original chat.

**Problems it solves**

- Lost earlier answers after Regenerate.
- Lost later turns after editing a question.
- No way to explore a side path without altering the source chat.
- Duplicate forks from a retried request (idempotent request id).

**Use cases**

- Regenerate an answer and page back to the first one.
- Edit the opening question and keep both versions with their own replies.
- Branch a chat from a message to try a different model or direction.
- Duplicate a whole chat on mobile (fork from the last message).

## 2. User experience

**Where to find it**

- Web: message actions on each turn: Regenerate (tooltip), Retry this message, Edit message, Branch conversation from here (apps/web/features/chat/components/messages/MessageBubble.tsx:3918-3934, :3717-3734, :4008-4018).
- Web: conversation title menu item Duplicate as branch (apps/web/features/chat/components/ConversationTitleMenu.tsx:209).
- Web: a version pager on a turn when it has siblings (MessageBubble.tsx:992-996, :3695, :3863).
- Mobile: Branch action on a message and Duplicate in the chat menu (apps/mobile/app/(app)/chat/[id].tsx:1316-1341; apps/mobile/src/features/conversation-actions/useConversationActions.ts:238-250).
- Other apps: not verified.

**Before you start**

- Cloud mode with a signed-in account for server versions and forks.
- A saved chat with at least one message.
- For Free accounts a daily allowance left for one more chat and message write.

**Screens and controls**

- Version pager (previous/next) rendered by VariantInfo with index and total (MessageBubble.tsx:992-998).
- Delete response action on a turn with siblings, with a confirmation titled Delete this response? and button Delete response (apps/web/features/chat/components/messages/variantDeleteConfirm.ts:24-37).
- Branch button with accessible label Branch conversation from here, or Creating branch... while working (MessageBubble.tsx:3930-3934).
- Branch navigator when a message has other branches (MessageBubble.tsx:729-732).

**Journey**

1. Person edits a question or asks for another answer.
2. The client saves the new turn with a parentId naming the branch point (POST message with parentId).
3. The first variant converts a linear chat to a tree inside one transaction (persist-message.ts:106-134).
4. The new turn becomes the active leaf; the pager shows 2 of 2.
5. Person moves between versions; the client sets the active leaf with PUT activeLeafMessageId, which does not move the chat in the list.
6. To fork, the person chooses Branch conversation from here; the client posts messageId and a new requestId to /branches and opens the new chat.

**What the person sees and gets**

- Web success toast: Conversation branch created; failure toast: Could not create conversation branch (apps/web/features/chat/hooks/use-conversation-branches.ts:138-141).
- Mobile success toast Conversation branch created; failure alert Could not create conversation branch (apps/mobile/app/(app)/chat/[id].tsx:1325-1334); Duplicate shows Chat duplicated or Could not duplicate chat (useConversationActions.ts:245-250).
- Forked chat title is the source title with (branch) appended, or Untitled (branch) (apps/web/lib/services/conversation-branch-service.ts:52-55).
- Server refusals: This message already has the maximum number of branches; This conversation already has the maximum number of forks (branch-service:279-284).

**Settings**

- Limits are constants: 50 branches per fork point and 100 fork points per chat (conversation-branch-service.ts:49-50).
- No user setting for versions found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Parent pointer and active leaf columns with an index (apps/web/db/neon/0156_message_thread_variants.sql:36-53).
- POST message accepts parentId: a uuid names the branch point, null means the root group, absent continues from the active leaf (apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:78-90; packages/contracts/cloud-contracts/src/conversations.ts:205-216).
- Linear chats convert to a tree under a row lock the first time a sibling is written, safe under two devices (persist-message.ts:103-134; message-thread.ts:46-76).
- PUT activeLeafMessageId validates the message belongs to the caller's chat; null resets to linear; paging versions does not change updated_at (apps/web/app/api/chat/conversations/[id]/route.ts:341-364, :382-383, :424).
- GET chat returns parent_id on each message and active_leaf_message_id on the chat (route.ts:110, :132).
- Deleting one response: default splices its children to its parent; ?subtree=true deletes it and everything below, moving the reader to a surviving sibling (apps/web/app/api/chat/conversations/[id]/messages/[messageId]/route.ts:249-292).
- Fork: copies messages up to the fork point (only the lineage path when the chat has variants), writes the relation row and an id map, and indexes copied artifacts (conversation-branch-service.ts:344-476).
- Idempotent fork: the request id is the new chat id and a unique (user_id, request_id) index returns the same branch on retry (conversation-branch-service.ts:57-86, :222-224; apps/web/db/neon/0078_conversation_branching_runtime.sql:15-17).
- Branch group listing for a chat (GET .../branches), capped at 5000 relation rows (conversation-branch-service.ts:88-192).
- Mobile forks cloud chats through the same route and local chats by copying messages with new ids (apps/mobile/stores/chat/chatMessageStore.ts:607-700).
- The sync push inserts messages with their parent and handles the active leaf (apps/web/app/api/chat/sync/route.ts:274-293); the sync pull returns active_leaf_message_id (packages/contracts/cloud-contracts/src/sync.ts:123).

**Incomplete**

- Copied messages in a fork are inserted without parent_id, so the new chat is linear; variants not on the lineage path are not carried (conversation-branch-service.ts:399-423).
- Free allowance for a fork asks for 1 chat and 1 message write although many messages are copied (conversation-branch-service.ts:208-212) [inferred undercount].
- The branch graph in the product contract lists branch id, version ordinal, provenance and trust-transition metadata (doc: docs/product/experience-contract.md:419-427); only parent_id, model/provider on rows and the relation tables were found.

**Present but disconnected or switched off**

- Migration header of 0156 says NOT YET APPLIED; routes already read the columns, so applied status is unknown (0156_message_thread_variants.sql:4).

**Not available**

- Version pager and fork in the Chrome side panel, VS Code and CLI: not found in files opened (unknown).
- Mobile version pager label and behaviour: tests exist (apps/mobile/__tests__/ChatThreadVersions.test.tsx) but the screen was not opened.

## 4. Required behaviour

**Established requirements**

- S90.03: regenerations and edits of a turn are kept as versions (siblings of one parent) and the visible version is recorded so users can page between versions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.03)
- S90.04: conversation lineage is a graph: messages form a parent tree and forks create a new conversation linked to its source message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S90.04)
- Edits and retries preserve a branch graph with parent id, branch id, version ordinal, active branch pointer, provenance, trust transition and previous/next UI; in-place replacement is not acceptable. (source: doc: docs/product/experience-contract.md:417-429)
- Edit, regenerate and branch must preserve lineage after reload. (source: doc: docs/product/experience-contract.md:775 (W02))
- A retried fork returns the same branch. (source: apps/web/lib/services/conversation-branch-service.ts:57)

**Acceptance criteria**

1. Regenerating twice leaves three sibling answers under one parent and a pager 3 of 3.
2. Reloading keeps the selected version visible.
3. Switching versions does not reorder the sidebar.
4. Editing the first message creates a root sibling group and both versions keep their replies.
5. A fork from message M copies the chat up to M, opens as a new chat titled (branch), and leaves the source unchanged.
6. Posting the same fork requestId twice yields one new chat.
7. A parent id from another chat is refused with Parent message not found.
8. Deleting a response with followers asks for confirmation and, after confirming, moves the reader to a surviving sibling.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A fork carries the visible path, not every variant, because with variants only lineage rows are copied (conversation-branch-service.ts:395-397).
- [inferred] The fork lands in the active workspace default, since the insert omits organization_id and the column default is current_app_org_id() (apps/web/db/neon/0110_active_workspace_content_scope.sql:50) while the source is read by user only (conversation-branch-service.ts:226-248); confirm.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Copy parent_id mapping in forks so the new chat keeps its own tree.
- [proposed] Count copied messages against the Free allowance, or document why one is requested.
- [proposed] Store a version ordinal if the product contract requires it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | 0156 message thread variants | `apps/web/db/neon/0156_message_thread_variants.sql` | Adds parent_id and active_leaf_message_id. |
| schema | 0078 conversation branching runtime | `apps/web/db/neon/0078_conversation_branching_runtime.sql` | request_id, indexes, conversation_branch_messages and RLS. |
| service | conversation-branch-service | `apps/web/lib/services/conversation-branch-service.ts` | listConversationBranchGroups and forkConversation. |
| endpoint | GET/POST /api/chat/conversations/[id]/branches | `apps/web/app/api/chat/conversations/[id]/branches/route.ts` | List branch groups; create a fork. |
| service | message-thread helpers | `apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts` | Parent resolution, linear conversion, subtree and splice delete, leaf resolution. |
| service | persistConversationMessage | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Writes a sibling and sets the leaf under a lock. |
| endpoint | DELETE /api/chat/conversations/[id]/messages/[messageId] | `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/route.ts` | Delete one message with splice, or its subtree. |
| endpoint | PUT /api/chat/conversations/[id] (activeLeafMessageId) | `apps/web/app/api/chat/conversations/[id]/route.ts` | Sets the visible leaf. |
| schema | Branch request and response schemas | `packages/contracts/cloud-contracts/src/conversations.ts` | messageId and requestId; subtree param constants. |
| hook | useConversationBranches | `apps/web/features/chat/hooks/use-conversation-branches.ts` | Loads branch groups, creates a branch, switches branch. |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Version pager, branch buttons, delete response. |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Duplicate as branch menu item. |
| service | activeLeafSelection | `apps/web/features/chat/lib/activeLeafSelection.ts` | PUT of the selected leaf. |
| store | mobile chat message store fork | `apps/mobile/stores/chat/chatMessageStore.ts` | forkConversation for Cloud and on-device chats; createCloudBranch. |
| service | conversationThread (mobile) | `apps/mobile/src/features/chat/utils/conversationThread.ts` | Resolves the visible thread from the leaf (name and imports only; not opened). |
| service | Tauri CloudRuntime visible thread | `apps/desktop/src/runtime/CloudRuntime.ts` | resolveVisibleThread from activeLeafMessageId (line 1801). |
| table | conversation_branches / conversation_branch_messages | `apps/web/db/neon/0078_conversation_branching_runtime.sql` | Fork relation and source-to-copy message id map. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client saves a sibling turn with parentId. | device | apps/web/lib/hooks/useChatStream.ts:781 |
| Server locks the chat row, checks the parent belongs to the chat, converts a linear chat once, inserts, and sets the leaf. | our servers | apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:106-134 |
| Client pages versions locally and writes the choice with PUT activeLeafMessageId. | device and our servers | apps/web/features/chat/lib/activeLeafSelection.ts:14-26; apps/web/app/api/chat/conversations/[id]/route.ts:341-383 |
| Fork: server checks allowance, locks the source, verifies the fork point, checks branch capacity, inserts the new chat, the relation and the copied messages with new ids in one transaction. | our servers | apps/web/lib/services/conversation-branch-service.ts:208-452 |
| After commit, copied assistant messages are indexed for artifacts in the background. | our servers | conversation-branch-service.ts:465-476 |
| Client opens the new chat. | device | apps/web/features/chat/hooks/use-conversation-branches.ts:137-139 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| parent_id on messages; active_leaf_message_id on chats | tables web_messages and web_conversations | Yes, including in the sync pull | parent_id has no cascade; deleting a parented row needs its children moved first (0156_message_thread_variants.sql:27-32); leaf clears itself when its row is deleted. |
| Fork relation and id map | tables conversation_branches and conversation_branch_messages | Read through the branches route | Map rows cascade with the branch or messages (0078:25-30). |
| Mobile on-device forks | mobile chat store; fields parentConversationId and forkPointMessageId | No (Local mode) | Deleted with the chat on the device. |

**Models and providers.** No model call in storing, paging or forking. A regenerated or edited answer is produced by the chat pipeline (SYS-chat-turn-pipeline). Mobile lets a fork pick a model only within the same execution mode (chatMessageStore.ts:621-628).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; owner-only access to the source chat. |
| Permissions | Fork reads the source by user and writes a new chat for the same user; RLS policies on the branch tables use the current app user (0078:46-60). |
| Subscription | Free plan: a fork asks for 1 chat create and 1 message write against the daily allowance; at the cap a retry of an already made fork still returns it (conversation-branch-service.ts:208-220). Other plans have no hard limit from this check. |
| Limits and metering | 50 branches per fork point, 100 fork points per chat; 5000 relation rows read at most; rate bucket chat-conversation for create and chat-conversation-read for list (branches/route.ts:26, :40). |
| Feature flags | None found in the code. |
| Model compatibility | None found in the code; the fork copies the source model and route (conversation-branch-service.ts:306-315). |
| Provider restrictions | None found in the code for storage. |
| Local mode | Local chats are forked on the device by copying messages with new ids and no server call (apps/mobile/stores/chat/chatMessageStore.ts:643-700). Tauri desktop has a separate own-key fork stored by its runtime (apps/desktop/src/stores/chat/chatStore.ts:409-477). Web Local-model behaviour for versions: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Branch button shows Creating branch... and is disabled while working; a second tap is ignored. | MessageBubble.tsx:3926-3934; apps/web/features/chat/hooks/use-conversation-branches.ts:104 |
| Error | Fork failure shows a toast or alert; server refuses missing fork point (Fork-point message not found) and over-capacity. | conversation-branch-service.ts:265, :279-284 |
| Retry | Same requestId returns the first branch, including at the Free cap; a failed allowance read is not treated as a replay. | conversation-branch-service.ts:213-219; lib/services/conversation-branch-service.test.ts:366-388 |
| Concurrent edits from two devices | Serialised by the row lock; the loser reads the winner's leaf and does not convert twice. | message-thread.ts:46-76; messages/route.variants.test.ts:173 |
| Retried message | A retry re-asserts content but never rewrites parent_id. | message-thread.ts:21-31 |
| Parent from another chat | Refused: Parent message not found. | message-thread.ts:104-110 |
| Deleted source or fork point | 404 Conversation not found or Fork-point message not found. | conversation-branch-service.ts:250, :265 |
| Temporary source | A fork of a temporary chat stays temporary and out of projects. | conversation-branch-service.ts:309-312 |
| Offline | Fork is a server call in Cloud mode; offline behaviour not handled in the code I read. | apps/mobile/stores/chat/chatMessageStore.ts:631 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/chat/conversations/[id]/messages/route.variants.test.ts`: Linear-to-tree conversion once, no second stamping, race loser reads winner leaf, root siblings, foreign parent refused, retried payload cannot rewrite lineage.
- `apps/web/app/api/chat/conversations/[id]/route.variants.test.ts`: GET returns tree columns and nulls for older chats; PUT persists a leaf that belongs to the chat and scopes the check to the caller.
- `apps/web/app/api/chat/conversations/[id]/branches/route.test.ts`: Branch list, fork request validation, malformed ids, CSRF rejection.
- `apps/web/lib/services/conversation-branch-service.test.ts`: Sibling group mapping, owner scope, single-transaction fork, temporary chat project rules, idempotent retry, Free allowance replay and refusal.
- `apps/web/lib/services/conversation-branch-service.artifact-index.test.ts`: Artifact indexing of copied messages (file name; contents not opened).
- `apps/web/db/neon/message-thread-variants-migration.test.ts`: The 0156 migration (file name; contents not opened).
- `apps/web/e2e/variant-pager.spec.ts`: Regenerate keeps previous answer and pages; third regenerate extends the group; edit branches; root edit survives reload; selected variant survives reload; long transcript anchors.
- `apps/web/features/chat/hooks/useConversationBranches.test.tsx`: Branch hook (file name; contents not opened).
- `apps/mobile/__tests__/ChatThreadVersions.test.tsx`: Mobile versions UI (file name; contents not opened).
- `apps/mobile/__tests__/cloud-message-variants.test.ts`: Mobile Cloud variants (file name; contents not opened).

**Test scenarios**

- **Regenerate and page**
  1. Send a question on web.
  2. Regenerate the answer twice.
  3. Use the pager to go to 1 of 3, then reload.
  - Expected: Three answers share one parent; the chosen one stays selected; sidebar order unchanged.
- **Edit first message**
  1. Edit the opening question.
  2. Wait for the reply.
  3. Page between the two versions.
  - Expected: Each version has its own reply.
- **Fork and retry**
  1. Branch from a middle message.
  2. Repeat the same request id through the API.
  - Expected: One new chat titled (branch) holding messages up to the fork point; the repeat returns the same chat.
- **Delete a response with followers**
  1. Open a turn with 2 siblings and later messages.
  2. Delete this response.
  3. Confirm.
  - Expected: Confirmation names the count of followers; after confirming, the reader lands on the newest sibling; deletion cannot be undone.
- **Branch capacity**
  1. Create 49 branches from one message through the API.
  2. Create one more.
  - Expected: Validation error: maximum number of branches.

**Where to look when it fails**

- Error texts: Parent message not found, Fork-point message not found, Branch request id is already in use.
- Tables: web_messages.parent_id, web_conversations.active_leaf_message_id, conversation_branches, conversation_branch_messages.
- Client log: [useConversationBranches] Failed to load branch groups.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Forked chats lose the parent tree (messages copied without parent_id).** Affects: Web and mobile Cloud forks; people expecting variants in the fork.. Evidence: apps/web/lib/services/conversation-branch-service.ts:399-423. Work needed: Map parent ids through the copy or document that a fork is linear.
- **Product contract lists branch id, version ordinal, trust transition in the branch graph; not stored as such.** Affects: All apps; audit and handoff.. Evidence: docs/product/experience-contract.md:419-427 versus 0156 and 0078 migrations. Work needed: Decide which fields are required and add them.
- **Fork allowance counts one message write for many copied messages.** Affects: Free users.. Evidence: conversation-branch-service.ts:208-212. Work needed: Confirm intent; adjust count.
- **Fork workspace placement is unconfirmed (source read by user only, target insert omits organization_id).** Affects: Workspace members forking a chat from another workspace.. Evidence: conversation-branch-service.ts:226-248, :289-292. Work needed: Test a fork with an active workspace different from the source.
- **Version paging and fork on Chrome, VS Code and CLI not found.** Affects: Those apps.. Evidence: no matching code in opened files. Work needed: Search and record, or add.

**Depends on**

- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-subscriptions-entitlements-and-usage
- F090-01
- F090-03
- table:web_messages
- table:web_conversations
- table:conversation_branches
- table:conversation_branch_messages
- mode:cloud

## Unknown

- Whether migrations 0156 and 0078 are applied in each environment.
- Which workspace a fork lands in when the active workspace differs from the source.
- Mobile version pager screen and label.
- Version paging and fork on Chrome, VS Code, CLI and Tauri desktop UI.
- Contents of useConversationBranches.test.tsx and the mobile variant tests.
