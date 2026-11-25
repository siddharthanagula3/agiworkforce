---
id: "F016-07"
type: "feature"
title: "Branch from here"
aliases: ["Branch conversation from here", "Branch from here", "Creating branch...", "Conversation branch created", "Branched into a new chat", "/fork", "/branch", "Branch (VS Code user-message button)", "thread/fork", "S16.10", "fork at message"]
area: "16 User-message components"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S16.10"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "table:web_conversations", "table:web_messages", "table:conversation_branches", "table:conversation_branch_messages", "api:POST /api/chat/conversations/[id]/branches", "api:GET /api/chat/conversations/[id]/branches", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F016-07 Branch from here

Branch from here copies a conversation up to a chosen message into a new conversation, so the person can try another direction while the original stays unchanged. Web and the hosted desktop do it in the cloud, the internal Tauri desktop does it on the device in Local mode, the CLI forks the whole session, and VS Code forks before a user message.

Area: [16. User-message components](README.md). Requirement items: [S16.10](../../10-requirements/capabilities/016-user-message-components.md#s1610).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates a second conversation that holds the messages of the first up to the chosen message. The original chat is not changed. Web also lists sibling branches so the person can page between them (apps/web/lib/services/conversation-branch-service.ts:88-192).

**Why it exists.** People want to explore a different follow-up without losing the first line of conversation. The competitor guidance records Branch as a context-preserving divergence point, distinct from edit, regenerate or continue (doc: docs/product/competitive-guidance.md:214).

**Who uses it.** Anyone who wants to try a different question from an earlier point: general chat users on web and desktop, and developers using the CLI or VS Code.

**Problems it solves**

- A different question normally needs a new chat and a re-pasted context.
- Editing a message replaces the later thread, so the first path is lost (MessageBubble.tsx edit is a separate action).
- Experiments in a long working session risk the good result already reached.

**Use cases**

- On web, open '...' on your own message and choose 'Branch conversation from here' to ask a different follow-up.
- In the CLI, type /fork or /branch to copy the whole session to a new saved session and resume it later.
- In VS Code, click 'Branch' on one of your messages to start a new session from just before it with the message text ready to edit.
- In the internal Tauri desktop in Local mode, click the branch button under a reply to copy the chat up to that reply.

## 2. User experience

**Where to find it**

- Web: the '...' menu on a user message shows 'Branch conversation from here' (apps/web/features/chat/components/messages/MessageBubble.tsx:4008-4017). On an assistant reply a fork icon button has the same label and the tooltip 'Branch conversation: this chat stays unchanged' (MessageBubble.tsx:3922-3944). The conversation-level menu also has a fork entry that branches from the last message (apps/web/features/chat/pages/WebChatPage.tsx:7414-7424).
- Desktop: the public Electron desktop shows the hosted web app, so it has the web controls (doc: AGENTS.md section 5). The internal Tauri build shows a button labelled 'Branch conversation from here' in the reply action bar, only when Local mode is active (packages/ui/unified-chat/src/components/ActionBar.tsx:243-254, apps/desktop/src/features/chat/useTauriMessageActions.ts:195-215).
- CLI: slash command /fork, alias /branch (apps/cli/src/tui/tui_app.rs:6014).
- VS Code: a button labelled 'Branch' on each of your messages, and 'Branch from here' on answers (packages/ui/i18n/locales/en/vscode.json:378,388; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4930).
- Mobile: not found in the code searched. Chrome extension: not found (brief: missing).

**Before you start**

- Web: signed in; the conversation must already be stored on the server (the hook reports 'Sign in to branch this conversation' otherwise) (use-conversation-branches.ts:40-47).
- Tauri desktop: Local mode and a saved conversation (useTauriMessageActions.ts:195-203).
- CLI: session persistence on, at least one non-system message (apps/cli/src/repl/registry.rs:1362-1382).
- VS Code: no reply running, and a CLI new enough to offer message-level fork (ChatStateManager.ts:5964-5976).

**Screens and controls**

- Web: menu item, disabled and relabelled 'Creating branch…' while one is being made (MessageBubble.tsx:4010-4014).
- Web: a branch navigator on a message that has sibling branches, to switch between them (MessageBubble.tsx:2605-2620, hook switchBranch).
- CLI: system line in the transcript with the outcome text.
- VS Code: toast warnings and a new session opened in the sidebar.

**Journey**

1. Web: open '...' on your message.
2. Choose 'Branch conversation from here'. The item greys out and reads 'Creating branch…'.
3. The page posts the message id and a fresh request id to the server.
4. On success a toast reads 'Conversation branch created' and the page opens the new chat at /chat/<new id>; on failure an error toast shows the message (use-conversation-branches.ts:103-146).
5. CLI: type /fork name. The line 'Branched conversation '<name>' as managed session <id>. Resume with: agiworkforce --session <id>' is shown; the current session stays open (registry.rs:1417-1422).
6. VS Code: click 'Branch' on your message. A new session opens containing the thread before that message, and your message text is placed in the composer as an editable draft (ChatStateManager.ts:6088-6118).

**What the person sees and gets**

- Web toasts: 'Conversation branch created'; errors via toUserMessage with fallback 'Could not create conversation branch'.
- The new conversation is titled '<source title> (branch)' (conversation-branch-service.ts:52-55).
- Tauri desktop toasts: 'Branched into a new chat' and 'Could not branch this chat' (useTauriMessageActions.ts:148,151).
- CLI messages: 'Nothing to branch, no messages yet.' and the --no-session-persistence refusal (registry.rs:1362-1375).
- VS Code warnings from the strings messageActions.stopFirst, notFound, needsUpdate and a failure message (vscode.json:371-375).

**Settings**

- No setting controls the web branch action.
- CLI: --no-session-persistence disables branching (registry.rs:1362-1366).
- Web server limits are constants: 50 branches per fork point, 100 fork points per conversation (conversation-branch-service.ts:49-50).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: server route POST/GET for branches with CSRF check, rate limit and validation (apps/web/app/api/chat/conversations/[id]/branches/route.ts:29-67).
- Web: fork copies the thread in one database transaction and is safe to repeat with the same request id; the request id doubles as the new conversation id (conversation-branch-service.ts:222-224,289-322).
- Web: when the thread has edit variants, only the chosen lineage is copied (conversation-branch-service.ts:336-413).
- Web: copied assistant messages get artifact index rows after commit (conversation-branch-service.ts:449-465).
- Web: sibling groups listing so a branched message shows a navigator (conversation-branch-service.ts:88-192).
- Tauri desktop, Local mode: SQLite copy in one transaction through command chat_branch_conversation, with sibling paging (apps/desktop/src-tauri/src/sys/commands/chat/branching.rs:19-47, apps/desktop/src-tauri/src/data/db/repository.rs:554-610).
- CLI: /fork copies the whole current session to a new managed session and names it (registry.rs:1353-1425).
- CLI app server and VS Code: thread/fork supports forking through a message index (apps/cli/src/app_server/developer_host.rs:3076-3135, apps/extension-vscode/src/integrations/localRuntimeClient.ts:1679-1696).
- VS Code: Branch on a user message and Branch from here on an answer (webviewContent.ts:4829-4851,4930; ChatStateManager.ts:6066-6118).

**Incomplete**

- The CLI /fork branches the whole session, not 'up to a chosen message'; per-message fork exists only in the app-server path used by VS Code (registry.rs:1353-1425 versus developer_host.rs:3076-3135).
- VS Code Branch on a user message forks before that message and puts its text in the composer; it does not include the message itself (ChatStateManager.ts:6088-6118). Web includes the chosen message.
- Tauri desktop shows branch only on assistant replies, not on the user bubble (packages/ui/unified-chat/src/components/MessageBubble.tsx:726-780, ActionBar.tsx:243).
- The Tauri copy is up to and including the chosen message but excludes superseded and compacted rows, and refuses a message that was summarised (repository.rs:560-590).

**Present but disconnected or switched off**

- Tauri branch actions are attached only when privacy mode is local and a saved conversation is open; in other modes the slots are empty (useTauriMessageActions.ts:207-218).
- The unified chat list removes onBranch for history views (packages/ui/unified-chat/src/components/MessageList.tsx:34-41); which screens use that is unknown.

**Not available**

- Mobile: no branch action found in apps/mobile (brief gives no status).
- Chrome extension: missing (brief S16.10).
- Web branching of a conversation that holds on-device model turns: not established; the server copies only stored messages (unknown).

## 4. Required behaviour

**Established requirements**

- From a chosen user message the user can start a new branch conversation that contains the thread up to that message. (source: brief S16.10)
- The menu item shows 'Creating branch...' and is disabled while one is being made. (source: brief S16.10 and MessageBubble.tsx:4010-4014)
- The page calls POST on the conversation's branches route with messageId and a request id; the server copies the thread in one transaction and is safe to repeat with the same request id. (source: use-conversation-branches.ts:103-125, branches/route.ts:52-67, conversation-branch-service.ts:194-265)
- Success shows a toast and navigates to the new chat; failure shows an error toast; a missing source or message gives not found. (source: use-conversation-branches.ts:126-146, conversation-branch-service.ts:250,265)
- A branch is a context-preserving divergence point, distinct from edit, continuation, regeneration or a read-only side conversation. (source: doc: docs/product/competitive-guidance.md:214)
- Status per app from the brief: web, desktop, CLI and VS Code built; Chrome missing; mobile no status. (source: brief S16.10)

**Acceptance criteria**

1. On web, choosing the item on a user message creates a new conversation titled '<title> (branch)' holding messages up to and including that message, and opens it.
2. While the request runs, the menu item is disabled and reads 'Creating branch…'; a second click creates nothing.
3. Repeating the request with the same request id returns the same conversation and creates no second copy.
4. A message id that is not in the source conversation returns not found and writes nothing.
5. The original conversation is unchanged after branching.
6. The 51st branch at one message and the 101st fork point in one conversation are refused with a clear message.
7. In the CLI, /fork with no messages answers 'Nothing to branch, no messages yet.' and with --no-session-persistence refuses.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A user on the Free plan may be refused at the daily conversation-create or message-write cap, except when repeating an already-made branch (conversation-branch-service.ts:208-220).
- [inferred] The brief's 'desktop built' is true only for the hosted web app in Electron and for Local mode in the Tauri build.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the CLI /fork accept a message position, so it matches the brief wording.
- [proposed] Offer branch on the user bubble in the Tauri desktop, to match web.
- [proposed] Decide and document whether VS Code Branch should include the chosen message, as web does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Renders the branch menu item (user) and fork button (assistant); props onBranch and isBranching. |
| component | ChatMessageList (web) | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Passes onBranch and branchingMessageId to each bubble (handleBranch at line 700). |
| hook | useConversationBranches | `apps/web/features/chat/hooks/use-conversation-branches.ts` | Loads branch groups, creates a branch with a random request id, shows toasts, navigates. |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Wires the hook into the message list and the conversation-level fork entry. |
| endpoint | GET/POST /api/chat/conversations/[id]/branches | `apps/web/app/api/chat/conversations/[id]/branches/route.ts` | List sibling groups and create a branch; CSRF, rate limit, validation. |
| service | conversation-branch-service | `apps/web/lib/services/conversation-branch-service.ts` | forkConversation and listConversationBranchGroups: transaction, copy, limits, idempotency, free-cap check. |
| table | conversation_branches and conversation_branch_messages | `apps/web/db/neon/0078_conversation_branching_runtime.sql` | Records source, target, branch point and the source-to-copy message map. |
| schema | ManagedCloudCreateConversationBranchRequestSchema | `packages/contracts/cloud-contracts/src` | Request and response contract for branch creation (imported by the route and hook; exact file not opened). |
| hook | useTauriMessageActions | `apps/desktop/src/features/chat/useTauriMessageActions.ts` | Tauri desktop: onBranch calling chat_branch_conversation, branch groups and pager, Local only. |
| component | ActionBar (unified chat) | `packages/ui/unified-chat/src/components/ActionBar.tsx` | Shows the branch button when the host supplies onBranch. |
| command | chat_branch_conversation | `apps/desktop/src-tauri/src/sys/commands/chat/branching.rs` | Tauri command that branches a Local conversation and lists branch groups. |
| service | branch_conversation (SQLite) | `apps/desktop/src-tauri/src/data/db/repository.rs` | Transactional copy into a new conversation with branched_from columns. |
| command | /fork, /branch | `apps/cli/src/tui/tui_app.rs` | CLI slash command routed to branch_session_for_display. |
| service | branch_session_for_display | `apps/cli/src/repl/registry.rs` | Forks the managed session, names it, reports the resume command. |
| endpoint | thread/fork | `apps/cli/src/app_server/developer_host.rs` | App-server fork, optionally through a message index; refuses while a turn runs or in a worktree. |
| service | forkThread | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code client call to thread/fork with throughMessageIndex. |
| service | _branchFromMessage and _branchFromAnswer | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Chooses the fork point, resumes the new thread, posts the draft. |
| component | userActionButton branch | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | The Branch button on user messages and answers. |
| config | English VS Code strings | `packages/ui/i18n/locales/en/vscode.json` | Labels 'Branch', 'Branch from here' and the warning texts. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: person chooses the menu item; the hook checks sign-in, gets a token, adds CSRF headers. | device | apps/web/features/chat/hooks/use-conversation-branches.ts:103-112 |
| Web: POST sends messageId and a new request id to the branches route. | our servers | use-conversation-branches.ts:113-120, apps/web/app/api/chat/conversations/[id]/branches/route.ts:52-67 |
| Server checks the Free daily allowance (one conversation create and one message write), then opens a transaction, returns an existing branch for the same request id, locks the source, verifies the message, enforces the branch caps. | our servers | apps/web/lib/services/conversation-branch-service.ts:208-284 |
| Server inserts the new conversation, the branch link and the copied messages with new ids, and the id map; after commit it schedules artifact indexing for copied assistant messages. | our servers | conversation-branch-service.ts:289-465 |
| Page adds the conversation to the local store, shows the toast and navigates. | device | use-conversation-branches.ts:126-143 |
| Tauri desktop, Local: invoke chat_branch_conversation; SQLite copy runs in the app. | device | apps/desktop/src/features/chat/useTauriMessageActions.ts:134-155, apps/desktop/src-tauri/src/data/db/repository.rs:554-610 |
| CLI: /fork persists the session file and forks it into a new managed session file on disk; no server call is in this path. | device | apps/cli/src/repl/registry.rs:1394-1422 |
| VS Code: the webview posts a messageAction, the extension asks the local CLI runtime to fork through a message index, then resumes the new thread. | device | ChatStateManager.ts:6017-6020,6066-6086, localRuntimeClient.ts:1690-1695 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| New conversation row plus copied message rows (content, model, provider, tokens, cost, metadata) on web | tables web_conversations, web_messages | Yes, it is server data and reaches every signed-in app on the account. | Kept until the person deletes it; deleted_at is respected by the queries. Retention rules beyond that: unknown. |
| Branch link and message map on web | tables conversation_branches, conversation_branch_messages | Server only. | Kept with the conversations; deletion cascade not opened (unknown). |
| Local branch on Tauri desktop | SQLite conversations table with branched_from_conversation_id, branched_from_message_id | Not synced; stays on the device. | Kept until deleted by the person. |
| CLI branch session file and metadata | managed session store in the user's config root | Not synced by this command. | Kept until the person removes it. |

**Models and providers.** No model is called when branching. Copied messages keep their model and provider columns (conversation_branch service insert list, lines 408-419), and the new conversation keeps the source's model and selected provider route (lines 289-316). The branch itself does not choose or change a model [inferred from the insert].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs a signed-in account (use-conversation-branches.ts:40-47) and the route resolves the user through getUserScopedDb (route.ts:56-57). Tauri Local branch needs a local owner id only (useTauriMessageActions.ts:136-141). CLI and VS Code need none for the fork itself. |
| Permissions | Only the owner of the conversation can branch it; the queries filter by user_id and deleted_at (conversation-branch-service.ts:93-102,226-248). Organization rules for branches: unknown. |
| Subscription | No plan gate found. On web the Free daily allowance for conversation creates and message writes is checked first (conversation-branch-service.ts:208-220). |
| Limits and metering | Rate limit bucket 'chat-conversation' on create and 'chat-conversation-read' on list (route.ts:29-31,53-54); 50 branches per fork point and 100 fork points per conversation (conversation-branch-service.ts:49-50). Whether the branch counts as usage beyond the Free daily allowance: unknown. |
| Feature flags | none found in the code for web branching. VS Code depends on the capability forkAtMessage reported by the CLI runtime (ChatStateManager.ts:6072; localRuntimeClient.ts:237). |
| Model compatibility | No model dependence in the action. Conversations with on-device model turns on web are treated specially by drafts, but branching rules for them: unknown. |
| Provider restrictions | none found in the code. |
| Local mode | Tauri desktop: works only in Local mode and acts on SQLite on the device (useTauriMessageActions.ts:42-47,207-218). CLI: works with any privacy mode, writes only local files (registry.rs:1353-1425). Web branch is always a Cloud action on our servers; whether web branch is offered when a local model is selected: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Branch in progress | Item disabled and labelled 'Creating branch…'; the hook ignores a second call while one runs. | MessageBubble.tsx:4010-4014, use-conversation-branches.ts:105 |
| Not signed in or auth loading | Error toast 'Sign in to branch this conversation' or 'Authentication is still loading'. | use-conversation-branches.ts:40-47 |
| Conversation not stored yet | Branch group fetch is skipped and a 404 is treated as no branches; creating a branch returns not found from the server. | use-conversation-branches.ts:61-90, conversation-branch-service.ts:250 |
| Retry with the same request id | Returns the existing branch, even at the Free daily cap. | conversation-branch-service.ts:214-224 |
| Branch caps reached | Validation error 'This message already has the maximum number of branches' or '...maximum number of forks'. | conversation-branch-service.ts:279-284 |
| Temporary chat | The branch inherits is_temporary and no project; project is dropped for temporary chats. | conversation-branch-service.ts:311-312 |
| Offline or network failure | Error toast with fallback 'Could not create conversation branch'; no automatic retry. | use-conversation-branches.ts:144-146 |
| CLI turn running or worktree session | app-server fork refuses while a turn runs and for a worktree-owned session. | developer_host.rs:3081-3095 |
| VS Code reply in flight | Warning to stop the current reply first; old CLI shows 'update the CLI'. | ChatStateManager.ts:5964-5976, vscode.json:371-373 |
| Accessibility | Web button has an aria-label; icon is aria-hidden. VS Code button has title and aria-label. | MessageBubble.tsx:3932-3936, webviewContent.ts:4829-4837 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/conversation-branch-service.test.ts`: Fork into sibling group, temporary chat and project handling, fork point not owned, Free daily cap refusal and idempotent retry at the cap.
- `apps/web/lib/services/conversation-branch-service.artifact-index.test.ts`: Artifact indexing after a fork.
- `apps/web/app/api/chat/conversations/[id]/branches/route.test.ts`: The branches route.
- `apps/web/features/chat/hooks/useConversationBranches.test.tsx`: 404 treated as no branches, idempotent create adds to store and navigates, switching to a sibling.
- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Branch indicator, persisted branch navigation, branch from the action row, duplicate click disabled.
- `apps/web/features/chat/components/messages/ChatMessageList.test.tsx`: onBranch and branchingMessageId passing.
- `apps/desktop/src/features/chat/__tests__/useTauriMessageActions.test.tsx`: Branch into a new chat and paging between branches.
- `apps/desktop/src-tauri/src/sys/commands/chat/branching.rs`: Rust unit tests for the SQLite branch command (module tests).
- `apps/cli/src/repl/registry.rs`: branch_tests: privacy-flag refusal, empty session, store refusal reported as failure.
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: Branch and rewind message actions through forkThread.

**Test scenarios**

- **Web branch from a user message**
  1. Sign in on web and send two messages with replies.
  2. Open '...' on the first user message and choose 'Branch conversation from here'.
  3. Watch the menu item and the toast.
  - Expected: Item shows 'Creating branch…', toast 'Conversation branch created', a new chat '<title> (branch)' opens holding only messages up to the first user message; the original still has all messages.
- **Duplicate click**
  1. Throttle the network.
  2. Click the item twice quickly.
  - Expected: Only one POST is sent and one branch is made.
- **Branch limit**
  1. Create 49 branches from one message through the API, then a 50th.
  - Expected: The 50th request is refused with the maximum-branches message.
- **CLI fork**
  1. Run the CLI TUI, send one message.
  2. Type /fork test.
  3. Run the printed resume command.
  - Expected: A new managed session named test resumes with the same messages; with --no-session-persistence the command refuses.
- **VS Code branch**
  1. Open a session with two user messages.
  2. Click Branch on the second user message.
  - Expected: A new session opens with the thread before that message and its text in the composer.
- **Tauri Local branch**
  1. In the Tauri build choose Local mode, open a saved chat.
  2. Click the branch button under a reply.
  - Expected: Toast 'Branched into a new chat' and the new chat opens; sibling pager appears.

**Where to look when it fails**

- Web: error names from createError.validation and notFound in the route response; log key '[useConversationBranches]' for group loading failures.
- Tables conversation_branches and conversation_branch_messages for the link and id map.
- CLI: the messages 'Failed to fork managed session' and 'Failed to persist current session before fork'.
- Tauri: error strings 'Failed to branch conversation' and 'Failed to read the new branch'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/016-user-message-components.md](../../70-qa/test-plans/web/016-user-message-components.md)
- Desktop: [70-qa/test-plans/desktop/016-user-message-components.md](../../70-qa/test-plans/desktop/016-user-message-components.md)
- CLI: [70-qa/test-plans/cli/016-user-message-components.md](../../70-qa/test-plans/cli/016-user-message-components.md)
- VS Code: [70-qa/test-plans/vscode/016-user-message-components.md](../../70-qa/test-plans/vscode/016-user-message-components.md)

## 10. Gaps and dependencies

- **Brief says CLI is built for branch up to a chosen message, but the CLI /fork copies the whole session.** Affects: CLI users. Evidence: apps/cli/src/repl/registry.rs:1353-1425; per-message fork exists only in app-server (developer_host.rs:3076-3135). Work needed: Add a message position to /fork or correct the brief.
- **Tauri desktop shows branch only on replies, and only in Local mode; the brief lists desktop as built for user messages.** Affects: Tauri desktop users. Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:726-780; useTauriMessageActions.ts:207-218. Work needed: Add branch to the user bubble actions, or record the difference.
- **Mobile has no branch action found.** Affects: Mobile users. Evidence: No match under apps/mobile in the searched files; brief has no status. Work needed: Decide whether mobile needs it; add a status row.
- **Chrome extension has no branch action.** Affects: Chrome users. Evidence: brief S16.10 missing. Work needed: Build it against the conversation branches API, or record as out of scope.
- **VS Code Branch on a user message excludes that message while web includes it.** Affects: VS Code users. Evidence: ChatStateManager.ts:6088-6118 versus conversation-branch-service.ts:386-390. Work needed: Decide the intended meaning and align wording.
- **No test found for the Rust CLI /fork per-message path or for web branching of local-model conversations.** Affects: Testers. Evidence: searched test files listed above. Work needed: Add tests.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- table:web_conversations
- table:web_messages
- table:conversation_branches
- table:conversation_branch_messages
- api:POST /api/chat/conversations/[id]/branches
- api:GET /api/chat/conversations/[id]/branches
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-files-artifacts-and-storage

## Unknown

- Whether the exact contract schema file for branches is packages/contracts/cloud-contracts/src (file not opened).
- Whether web branch is offered or works when a conversation holds on-device model turns.
- What organization policy applies to branching.
- Whether branching counts toward paid-plan usage beyond the Free daily allowance.
- Whether mobile has branch under another name (not found in the files searched).
- Which screens render the unified message list without branch (MessageList.tsx:34-41 strips it).
