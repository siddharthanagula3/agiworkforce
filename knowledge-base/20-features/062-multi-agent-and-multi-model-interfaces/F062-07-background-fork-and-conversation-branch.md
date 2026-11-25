---
id: "F062-07"
type: "feature"
title: "Background fork and conversation branch"
aliases: ["Branch conversation", "Branch conversation from here", "Duplicate as branch", "/fork", "/branch", "Fork Conversation (VS Code: Code: Fork Conversation)", "Fork session", "agi session fork", "--fork-session", "Thread / parallel thread (/thread, /threads, /gather)", "Background run (/bg, /background, agi background)", "S62.16 Background fork", "S62.17 Interactive branch"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S62.16", "S62.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "table:conversation_branches", "table:conversation_branch_messages", "table:web_conversations", "table:web_messages", "api:POST /api/chat/conversations/{id}/branches", "api:GET /api/chat/conversations/{id}/branches", "store:managed session files", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-07 Background fork and conversation branch

Two related things. A conversation branch copies a chat up to a chosen message into a new chat, and the original stays unchanged. A background fork exists only in the command-line app: /thread copies the session and runs a side task in parallel, /gather brings results back. Web, mobile, desktop and VS Code have branches only.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.16](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6216), [S62.17](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6217).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** A branch copies a conversation up to a chosen message into a new conversation or session. The person continues in the copy, and the source is not changed. In the command-line app (CLI) a separate background-fork path starts a headless run on a copy of the session (/thread) and later pulls the finished answers into the main chat (/gather).

**Why it exists.** People want to try another approach without losing the first one. The product requirements say branches are needed for safe alternate attempts, multi-track debugging and for keeping the original Local thread when a chat moves to another mode (doc: docs/product/requirements.md:687-694). The brief item S62.16 wants a side task that runs without disturbing the main one, and S62.17 wants an interactive branch (doc: knowledge-base/data/area-briefs/062-multi-agent-and-multi-model-interfaces.md).

**Who uses it.** Chat users on web, mobile and the Tauri desktop (branch from a reply); developers on the CLI and in VS Code (fork a session); CLI power users who run parallel threads.

**Problems it solves**

- Trying a different prompt or model path without overwriting the original chat.
- Keeping a record of the point where two lines of work split (branch group, ancestry).
- Running a side investigation in the CLI while the main conversation continues (/thread).

**Use cases**

- Web: the user likes an answer, branches from it, and asks a different follow-up in the copy.
- CLI: type /fork refactor-b, then later resume the copy with agiworkforce --session <id>.
- CLI: type /thread check the failing tests, keep chatting, then /threads and /gather.
- VS Code: fork a developer session from the session list and continue in the copy.

## 2. User experience

**Where to find it**

- Web: assistant reply action row, icon button labelled 'Branch conversation from here' with tooltip 'Branch conversation: this chat stays unchanged'; user-message menu item 'Branch conversation from here'; conversation title menu item 'Duplicate as branch' (copies from the last message) (apps/web/features/chat/components/messages/MessageBubble.tsx:3922-3945, :4008-4016; apps/web/features/chat/components/ConversationTitleMenu.tsx:206-210).
- Web branch navigation between siblings: BranchNavigator on the message that has branches (apps/web/features/chat/components/messages/MessageBubble.tsx:2605-2617).
- Desktop (Tauri build only): same reply actions, Local mode only; toast 'Branched into a new chat' (apps/desktop/src/features/chat/useTauriMessageActions.ts:44-48, :134-155). The public Electron desktop shows the hosted web app, so it uses the web control [inferred from AGENTS.md section 5].
- Mobile: long-press/action menu item 'Branch Conversation from Here' on a message; toast 'Conversation branch created' (apps/mobile/src/features/chat/components/MessageBubble.tsx:1669-1675; apps/mobile/app/(app)/chat/[id].tsx:1316-1342). Hidden for temporary chats (apps/mobile/app/(app)/chat/[id].tsx:2589).
- CLI: slash commands /fork and /branch (alias) with optional name (apps/cli/src/tui/tui_app.rs:6014; apps/cli/src/repl/slash_commands.rs:491). Also `agi session fork <id> --at-turn N --as <name>` (apps/cli/src/lib.rs:5686-5760) and the --fork-session resume flag (apps/cli/src/lib.rs:2446-2460, :8229-8240).
- CLI background fork: /thread <instruction>, /threads, /gather (apps/cli/src/claude_parity.rs:142-153); /bg or /background <instruction> moves the whole conversation to a background run (apps/cli/src/tui/tui_app.rs:5960); `agi background start|list|logs|stop|remove|attach` (apps/cli/src/lib.rs:1708-1819).
- VS Code: command 'Code: Fork Conversation' (agi-workforce.forkConversation) on the sessions tree, and slash entry '/fork' (alias 'branch') described 'Copy a session into a new one' (apps/extension-vscode/package.json:197; apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:111-116); message-level branch in the chat panel (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6068-6115).
- Chrome: no branch control found. The side panel copies a chat silently when the selected chat is already open in another browser window (apps/extension/src/features/background/conversation-session.ts:226-247) [inferred: a window-ownership copy, not a user feature].

**Before you start**

- Web: signed in; the chat must already be saved on the server (the hook asks the server and gets 404 for an unsaved chat) (apps/web/features/chat/hooks/use-conversation-branches.ts:40-42, :61-78).
- Desktop Tauri: Local privacy mode and a saved SQLite conversation (apps/desktop/src/features/chat/useTauriMessageActions.ts:44-48).
- Mobile: a Cloud chat needs the Cloud server; a Local chat copies on the device (apps/mobile/stores/chat/chatMessageStore.ts:607-700).
- CLI: session persistence on and at least one non-system message (apps/cli/src/repl/registry.rs:1366-1380); /thread also needs a saved session (apps/cli/src/background.rs:342-360).
- VS Code: the installed AGI CLI must offer 'forkAtMessage' to branch from a message; otherwise a warning is shown (apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6072-6076).

**Screens and controls**

- Web: GitFork icon button, 'Creating branch…' disabled state, BranchNavigator, 'Duplicate as branch' menu item.
- CLI: text commands; reply line 'Branched conversation '<name>' as managed session <id>. Resume with: agiworkforce --session <id>' (apps/cli/src/repl/registry.rs:1421-1423).
- VS Code: input box 'Name for the forked session' with default '<title> (fork)' (apps/extension-vscode/src/core/commandSetup.ts:1455-1460).

**Journey**

1. Web: open a saved chat and pick 'Branch conversation from here' on a reply.
2. The hook sends POST with the message id and a fresh request id (apps/web/features/chat/hooks/use-conversation-branches.ts:107-118).
3. The server copies the messages up to that point into a new conversation titled '<title> (branch)'.
4. The page adds the new chat to the store, shows toast 'Conversation branch created' and opens /chat/<new id> (apps/web/features/chat/hooks/use-conversation-branches.ts:131-148).
5. CLI: type /fork [name]; the command writes a second session file, renames it, and prints how to resume it; the current session stays active.
6. CLI background fork: type /thread <instruction>; the CLI copies the session, starts a headless run on the copy, and prints the thread id; later /threads lists them and /gather turns the finished answers into one prompt for the main chat (apps/cli/src/background.rs:342-465).

**What the person sees and gets**

- Web success toast 'Conversation branch created'; error toast from the server message or 'Could not create conversation branch' (apps/web/features/chat/hooks/use-conversation-branches.ts:131, :149-150).
- Mobile alert 'Could not create conversation branch' on failure (apps/mobile/app/(app)/chat/[id].tsx:1328-1337).
- CLI messages: 'Nothing to branch, no messages yet.' (warning), the --no-session-persistence refusal (error), 'Failed to fork managed session: ...' (apps/cli/src/repl/registry.rs:1366-1424).
- CLI /threads lines: '<id> <state>[, gathered] <prompt>' with states running, finished, failed, stopped, ended without a result (apps/cli/src/background.rs:48-57, :387-407).

**Settings**

- CLI: --no-session-persistence blocks branching (apps/cli/src/repl/registry.rs:1366).
- CLI: --fork-session with --resume forks at startup (apps/cli/src/lib.rs:8229-8240).
- Web: chat sync/saving of conversations (branch needs a saved chat) [inferred].

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI /fork and /branch copy the managed session via fork_managed_session and rename the copy (apps/cli/src/repl/registry.rs:1353-1425; apps/cli/src/platform/runtime/session_control.rs:714-718).
- CLI refuses with --no-session-persistence and says 'Nothing to branch' for an empty session (apps/cli/src/repl/registry.rs:1366-1380).
- CLI `agi session fork` can cut at a user turn (--at-turn), name the copy (--as) and refuses to overwrite without --force (apps/cli/src/lib.rs:5686-5760).
- CLI background fork exists: /thread forks the session and starts a headless run on the copy with the parent recorded; /threads lists; /gather builds a combined prompt asking the model to reconcile conflicts (apps/cli/src/background.rs:342-465; apps/cli/src/claude_parity.rs:142-153). The brief says 'background fork not found'; the code shows it exists.
- CLI /bg moves the current conversation into a detached run and opens a new conversation (apps/cli/src/background.rs:303-340).
- Web branch API: GET lists branch groups, POST creates a branch, idempotent by request id, limits of 50 branches per message and 100 fork points per conversation, copies messages and artifacts index (apps/web/app/api/chat/conversations/[id]/branches/route.ts:66-67; apps/web/lib/services/conversation-branch-service.ts:49-50, :194-479).
- Web UI: per-reply branch button, user-message menu item, title-menu 'Duplicate as branch', and sibling navigator (see user_experience).
- Web blocks a second branch request while one is in flight (apps/web/features/chat/hooks/use-conversation-branches.ts:105).
- Desktop Tauri: chat_branch_conversation and chat_list_conversation_branches commands copy a Local SQLite chat up to a message (apps/desktop/src-tauri/src/sys/commands/chat/branching.rs:15-70; registered at apps/desktop/src-tauri/src/lib.rs:1627).
- Mobile: forkConversation creates a Cloud branch through the server branch API or a Local on-device copy; the menu item is wired (apps/mobile/stores/chat/chatMessageStore.ts:607-700; apps/mobile/app/(app)/chat/[id].tsx:2589). The brief says mobile is missing; the code shows it exists.
- VS Code: forkConversation command and message-level fork go through the AGI CLI app server request thread/fork (apps/extension-vscode/src/integrations/localRuntimeClient.ts:1679-1696; apps/cli/src/app_server/developer_host.rs:3076-3150).

**Incomplete**

- Desktop branching is Local only in the Tauri build; Managed Cloud shows only read aloud (apps/desktop/src/features/chat/useTauriMessageActions.ts:44-48; test apps/desktop/src/features/chat/__tests__/useTauriMessageActions.test.tsx:147).
- VS Code cannot fork a session that runs in its own worktree, or while a turn is running (apps/cli/src/app_server/developer_host.rs:3086-3098).
- The CLI /fork copies the whole session. Cutting at a point exists only in `agi session fork --at-turn` (apps/cli/src/lib.rs:5693-5702).
- CLI threads inherit the saved session; no check was found that a thread keeps the parent's Local privacy limits beyond what the resumed session stores (apps/cli/src/background.rs:342-373) [unknown].

**Present but disconnected or switched off**

- Chrome extension: the cloud branch call exists but is triggered only by window ownership, not by a person asking for a branch (apps/extension/src/features/cloud-bridge/conversationHistoryPull.ts:489-540; apps/extension/src/features/background/conversation-session.ts:226-247).

**Not available**

- Background fork on web, desktop, mobile, VS Code and Chrome: no code found.
- Chrome: no user-facing branch control found.
- Branch metadata required by the product requirements (selected context, trust-boundary change, redaction result, consent time) is not recorded by the web branch service (it stores source, target, branch point and request id) (apps/web/lib/services/conversation-branch-service.ts:323-336; doc: docs/product/requirements.md:696-703).

## 4. Required behaviour

**Established requirements**

- CLI refuses to branch when started with the no-session-persistence flag. (source: S62.17 brief item; apps/cli/src/repl/registry.rs:1366-1370)
- An empty session says there is nothing to branch yet. (source: S62.17; apps/cli/src/repl/registry.rs:1373-1380)
- The user can fork a side task that runs in the background without disturbing the main one. (source: S62.16 Should)
- The user can branch the conversation from a point and continue interactively in the branch. (source: S62.17 Should)
- Branches preserve the original; branch metadata records source session, selected context, trust boundary change, provider/model change, redaction result and consent time. (source: doc: docs/product/requirements.md:687-703)
- Resuming a developer session appends to the same session id; forking creates a new id. (source: doc: docs/product/definition.md:119)
- A Local original stays Local; a BYOK continuation is a new reviewed branch, not a hidden mode flip. (source: doc: docs/product/definition.md:102)

**Acceptance criteria**

1. CLI: with --no-session-persistence, /fork prints the refusal and creates no session file.
2. CLI: in a new session with no messages, /fork prints 'Nothing to branch, no messages yet.'
3. CLI: /fork name creates a new session id different from the source; the active session id does not change.
4. Web: choosing 'Branch conversation from here' on a reply creates a chat titled '<title> (branch)' holding messages up to that reply; the source chat is unchanged; double clicking creates one branch.
5. Web: the same request id retried returns the same branch, not a second one.
6. Mobile: Local chat branch copies on the device and does not call the server; Cloud chat branch calls the branch API.
7. CLI: /thread starts a run whose session is a copy; /threads shows it; /gather includes only finished, not-yet-gathered threads.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A background fork should respect the parent session's trust boundary (Local, own key, Cloud) [inferred from AGENTS.md section 6].
- A branch should show provenance of the source chat to the user [inferred from the sibling navigator and requirements 9.2].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record trust-boundary and model change on the web branch row, as the requirements list.
- [proposed] Add a background fork or side task to web and desktop, or restate S62.16 as CLI-only.
- [proposed] Update the brief: mobile branch and CLI /thread exist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | /fork, /branch (TUI) | `apps/cli/src/tui/tui_app.rs:6014` | Slash command in the full-screen view; calls branch_session_for_display. |
| command | /branch, /fork (line view) | `apps/cli/src/repl/slash_commands.rs:491` | Slash command in the line-based view. |
| service | branch_session_in | `apps/cli/src/repl/registry.rs:1353` | Checks persistence flag and empty session, persists, forks, renames the copy. |
| service | fork_managed_session / ManagedSession::forked_from | `apps/cli/src/platform/runtime/session_control.rs:540` | Writes the copied session file with ancestry. |
| command | agi session fork | `apps/cli/src/lib.rs:5686` | Fork at a turn with a name, refuses clobber without --force. |
| service | spawn_thread / threads_summary / gather_prompt | `apps/cli/src/background.rs:342` | Background fork: copy session, start headless run, list and gather. |
| command | /thread, /threads, /gather | `apps/cli/src/claude_parity.rs:142` | Routes the thread commands to background.rs. |
| command | /bg and agi background | `apps/cli/src/lib.rs:1708` | Detached background runs with supervisor, logs, stop, attach. |
| endpoint | thread/fork (app server) | `apps/cli/src/app_server/developer_host.rs:3076` | Fork a developer thread for VS Code, optionally through a message index. |
| command | agi-workforce.forkConversation | `apps/extension-vscode/src/core/commandSetup.ts:1452` | VS Code command asking for a name and resuming the copy. |
| service | localRuntimeClient.forkThread | `apps/extension-vscode/src/integrations/localRuntimeClient.ts:1679` | Sends thread/fork; needs forkAtMessage capability for message-level fork. |
| endpoint | POST/GET /api/chat/conversations/{id}/branches | `apps/web/app/api/chat/conversations/[id]/branches/route.ts` | Create and list branches with CSRF and rate limits. |
| service | forkConversation / listConversationBranchGroups | `apps/web/lib/services/conversation-branch-service.ts:194` | Transactional copy, caps, Free daily allowance check, idempotency. |
| table | conversation_branches, conversation_branch_messages | `apps/web/db/neon/0078_conversation_branching_runtime.sql` | Branch relation and source-to-copy message id map. |
| hook | useConversationBranches | `apps/web/features/chat/hooks/use-conversation-branches.ts` | Loads groups, creates a branch, blocks a second request, navigates. |
| component | MessageBubble branch controls + BranchNavigator | `apps/web/features/chat/components/messages/MessageBubble.tsx:3922` | Reply button, user menu item, sibling navigator. |
| component | ConversationTitleMenu 'Duplicate as branch' | `apps/web/features/chat/components/ConversationTitleMenu.tsx:206` | Whole-chat fork from the last message. |
| hook | useTauriMessageActions | `apps/desktop/src/features/chat/useTauriMessageActions.ts:134` | Desktop Tauri branch action, Local only. |
| endpoint | chat_branch_conversation (Tauri command) | `apps/desktop/src-tauri/src/sys/commands/chat/branching.rs:19` | Copies a Local SQLite chat up to a message. |
| store | chatMessageStore.forkConversation | `apps/mobile/stores/chat/chatMessageStore.ts:607` | Mobile Cloud or Local branch. |
| screen | Mobile chat message menu | `apps/mobile/src/features/chat/components/MessageBubble.tsx:1669` | 'Branch Conversation from Here' action. |
| service | forkManagedCloudConversationHistory | `apps/extension/src/features/cloud-bridge/conversationHistoryPull.ts:489` | Chrome window-ownership copy through the branch API. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: command handler checks persistence flag and messages, saves the current session, copies the session file. | device | apps/cli/src/repl/registry.rs:1366-1408 |
| CLI /thread: copies the session, then spawns a detached supervisor process that runs `agi --print --resume <copy>` with the instruction. | device | apps/cli/src/background.rs:120-135, :342-373 |
| The background run's model turn calls the model provider the session is set to (own key or Cloud). | outside service | apps/cli/src/background.rs:520-535 (child runs the same executable) [inferred for the provider call] |
| Web: browser sends POST with message id and request id plus bearer token and CSRF header. | device | apps/web/features/chat/hooks/use-conversation-branches.ts:105-118 |
| Web server checks the Free daily allowance, opens a transaction, locks the source, copies messages up to the fork point, writes branch rows and the id map, then schedules artifact indexing. | our servers | apps/web/lib/services/conversation-branch-service.ts:194-479 |
| Desktop Tauri: invoke chat_branch_conversation; SQLite copy. | device | apps/desktop/src-tauri/src/sys/commands/chat/branching.rs:19-42 |
| Mobile Local: copy messages into a new local conversation; Mobile Cloud: call the branch API then optionally patch title/model. | device and our servers | apps/mobile/stores/chat/chatMessageStore.ts:629-700 |
| VS Code: request thread/fork to the local AGI CLI app server, which copies the session file and truncates at the message. | device | apps/extension-vscode/src/integrations/localRuntimeClient.ts:1690; apps/cli/src/app_server/developer_host.rs:3112-3150 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI session copy (messages, ancestry, routing authority) | CLI config directory managed sessions | not synced by this feature | kept until the user deletes or archives it (apps/cli/src/platform/runtime/session_control.rs:722-735) |
| CLI background run record and log (run.json, output.log) | CLI config directory, background/<id>, private directory mode 0700 on Unix | no | `agi background remove` deletes (apps/cli/src/background.rs:70-95, apps/cli/src/lib.rs:1779) |
| Web branch conversation, copied messages, relation and id map | tables web_conversations, web_messages, conversation_branches, conversation_branch_messages | server is the source of truth for web, desktop Electron, mobile Cloud and Chrome | deleted source rows are not copied; deleted messages stay deleted (apps/web/lib/services/__tests__/conversation-branch-withdrawal.test.ts:81-126) |
| Desktop Tauri Local branch | local SQLite database | no | follows normal local chat deletion [unknown details] |
| Mobile Local branch | on-device chat store with parentConversationId and forkPointMessageId | no (Local) | follows normal local chat deletion [unknown details] |

**Models and providers.** The branch itself calls no model. It copies the source model name and route onto the new chat (apps/web/lib/services/conversation-branch-service.ts:312-319). The CLI /thread background run calls whichever model the copied session holds, through the same provider rules as a normal turn.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs sign-in (apps/web/features/chat/hooks/use-conversation-branches.ts:40-42). CLI, Tauri desktop Local and mobile Local branches need no account [inferred: no auth check in those paths]. Mobile Cloud needs the Cloud account. |
| Permissions | Web branch rows are scoped to the owning user in every query (apps/web/lib/services/conversation-branch-service.ts:70-80). The web POST requires a CSRF token and a rate limit (apps/web/app/api/chat/conversations/[id]/branches/route.ts:34-39). |
| Subscription | On the web the Free plan's daily allowance counts one new conversation and one message write per branch; at the cap the branch is refused unless it is a retry of an existing request (apps/web/lib/services/conversation-branch-service.ts:204-221). Paid plans: no branch-specific rule found. |
| Limits and metering | 50 branches per fork point and 100 fork points per conversation (apps/web/lib/services/conversation-branch-service.ts:49-50). CLI /thread: no cap found [unknown]. |
| Feature flags | CLI --no-session-persistence and --fork-session. VS Code needs the forkAtMessage capability from the CLI. No feature flag found for web. |
| Model compatibility | Not model dependent. The copy keeps the source model. |
| Provider restrictions | none found in the code for the branch itself. |
| Local mode | Branching a Local chat stays on the device (CLI files, Tauri SQLite, mobile on-device store). The Tauri branch action is shown only in Local; in Managed Cloud only read aloud is offered (apps/desktop/src/features/chat/useTauriMessageActions.ts:44-48). A CLI /thread run uses the copied session; whether it keeps Local limits is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows 'Creating branch…' and disables the control while a request runs; mobile uses a ref guard. | apps/web/features/chat/components/messages/MessageBubble.tsx:3929-3941; apps/mobile/app/(app)/chat/[id].tsx:1316-1319 |
| Empty | CLI warns 'Nothing to branch'; mobile Cloud throws 'There is no message to branch from yet.'; web hides the title-menu fork when there are no messages. | apps/cli/src/repl/registry.rs:1378; apps/mobile/stores/chat/chatMessageStore.ts:630; apps/web/features/chat/pages/WebChatPage.tsx:7418-7425 |
| Error | Web toast with server message; mobile alert; CLI error line. | apps/web/features/chat/hooks/use-conversation-branches.ts:149-150 |
| Retry / double submit | Same request id returns the same branch; Free cap replay returns the first branch. | apps/web/lib/services/conversation-branch-service.ts:204-221, :230-233 |
| Cap reached | Web refuses with 'This message already has the maximum number of branches' or '...maximum number of forks'. | apps/web/lib/services/conversation-branch-service.ts:280-283 |
| Offline | Web and mobile Cloud show the failure message. Not handled in the code beyond that. | apps/mobile/app/(app)/chat/[id].tsx:1330-1336 |
| Running turn | VS Code thread fork is refused while the turn runs. | apps/cli/src/app_server/developer_host.rs:3084-3091 |
| Cancel | Not handled in the code: no way to cancel a branch in flight was found. | apps/web/features/chat/hooks/use-conversation-branches.ts:105-153 |
| Background run lost | A run whose process is gone and past a 60 s launch grace shows 'ended without a result'. | apps/cli/src/background.rs:7, :48-57, :200-230 |
| Accessibility | Web icon button has aria-label; mobile menu item has a label. Other checks not done. | apps/web/features/chat/components/messages/MessageBubble.tsx:3930-3932 |
| Temporary chat | Mobile hides the branch action for temporary chats; the web copy keeps the temporary flag. | apps/mobile/app/(app)/chat/[id].tsx:2589; apps/web/lib/services/conversation-branch-service.ts:306-310 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/repl/registry.rs (module branch_tests, from line 1434)`: Privacy-flag refusal, empty-session message, store failure, new session id named in the reply.
- `apps/cli/src/tui/tui_app.rs:11444`: /branch resolves to /fork.
- `apps/cli/tests/developer_session_host.rs:87-130`: fork_thread through the app server host, new id, title, source.
- `apps/cli/src/background.rs (tests from line 811)`: Run states, supervisor, stop, lost run. No test for spawn_thread or gather_prompt found.
- `apps/web/lib/services/conversation-branch-service.test.ts`: Group mapping, owner scope, single transaction copy, temporary chat project, idempotent retry, Free daily cap and replay.
- `apps/web/lib/services/__tests__/conversation-branch-withdrawal.test.ts`: Deleted messages and attachments are not copied.
- `apps/web/app/api/chat/conversations/[id]/branches/route.test.ts`: Group listing, idempotent create, malformed ids, CSRF rejection.
- `apps/web/features/chat/components/__tests__/ConversationTitleMenu.test.tsx:133`: 'Duplicate as branch' calls onFork.
- `apps/desktop/src/features/chat/__tests__/useTauriMessageActions.test.tsx:117`: Branch into a new chat, paging, Managed Cloud shows only read aloud.
- `apps/desktop/src-tauri/src/sys/commands/chat/branching.rs (tests module)`: Rust branching in an in-memory database.
- `apps/mobile/__tests__/cloud-sync-wiring.test.ts:281`: Cloud branch through the server API, titled branch, parent and fork point recorded.
- `apps/extension-vscode/src/__tests__/openConversationCommand.test.ts:212`: Fork opens in the chat that asked.
- `apps/extension-vscode/src/__tests__/conversationTreeProvider.test.ts:321`: Fork routes to the owning runtime.

**Test scenarios**

- **CLI refuses to branch without persistence**
  1. Start the CLI with --no-session-persistence.
  2. Send one message.
  3. Type /fork.
  - Expected: Error says no session file exists to fork; no new session listed.
- **CLI branch keeps the original**
  1. Start a session, send two messages.
  2. Type /fork try-b.
  3. Run `agi session list`.
  - Expected: A new session named try-b exists; the original is still the active session id.
- **CLI thread and gather**
  1. In a saved session type /thread list the TODOs.
  2. Type /threads until it shows finished.
  3. Type /gather.
  - Expected: A prompt with the thread answer is sent to the main chat and the thread shows ', gathered'.
- **Web branch from a reply**
  1. Sign in, open a saved chat with 3 replies.
  2. Click Branch conversation from here on reply 2.
  3. Compare the two chats.
  - Expected: New chat '<title> (branch)' with messages up to reply 2; source has 3 replies; navigator shows 2 siblings.
- **Web double click**
  1. Click the branch button twice quickly.
  - Expected: One branch is created.
- **Mobile Local branch offline**
  1. In Local mode open a chat, use Branch Conversation from Here with the network off.
  - Expected: A copy opens with no server call.

**Where to look when it fails**

- CLI: error text 'Failed to fork managed session', 'Failed to persist current session before fork'; background logs via `agi background logs <id>`.
- Web: server errors 'Conversation not found', 'Fork-point message not found', 'Branch request id is already in use'; tables conversation_branches and conversation_branch_messages.
- Web console: '[useConversationBranches] Failed to load branch groups' (apps/web/features/chat/hooks/use-conversation-branches.ts:84).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/web/062-multi-agent-and-multi-model-interfaces.md)
- Desktop: [70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/desktop/062-multi-agent-and-multi-model-interfaces.md)
- Mobile: [70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/mobile/062-multi-agent-and-multi-model-interfaces.md)
- CLI: [70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/cli/062-multi-agent-and-multi-model-interfaces.md)
- VS Code: [70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **Brief marks web, desktop, mobile and VS Code inconsistently; mobile branch and CLI background fork exist in code.** Affects: Anyone planning from the brief.. Evidence: apps/mobile/stores/chat/chatMessageStore.ts:607; apps/cli/src/background.rs:342. Work needed: Correct the area brief statuses.
- **No background fork on web, desktop, mobile, VS Code, Chrome.** Affects: All apps except CLI.. Evidence: No code found outside apps/cli/src/background.rs.. Work needed: Decide scope, then build or mark CLI-only.
- **Branch metadata (trust boundary, provider change, redaction, consent time) is not stored.** Affects: Web, mobile Cloud.. Evidence: apps/web/lib/services/conversation-branch-service.ts:323-336 vs docs/product/requirements.md:696-703. Work needed: Add columns and write them on branch.
- **Desktop Tauri branching only in Local.** Affects: Tauri desktop Managed Cloud users.. Evidence: apps/desktop/src/features/chat/useTauriMessageActions.ts:44-48. Work needed: Route Cloud branches to the server API or rely on the Electron web app.
- **No test found for CLI spawn_thread and gather_prompt.** Affects: CLI.. Evidence: apps/cli/src/background.rs tests list. Work needed: Add tests for fork, parent link and gather.
- **Chrome has no branch control.** Affects: Chrome.. Evidence: Only window-ownership copy found.. Work needed: Add a control or leave out of scope.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- table:conversation_branches
- table:conversation_branch_messages
- table:web_conversations
- table:web_messages
- api:POST /api/chat/conversations/{id}/branches
- api:GET /api/chat/conversations/{id}/branches
- store:managed session files
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether a CLI /thread run keeps the parent's Local privacy limits (apps/cli/src/background.rs does not pass a privacy flag).
- Whether Tauri desktop is shipped to users (AGENTS.md says it is retained internal code).
- Local deletion and retention rules for Tauri and mobile Local branches.
- Whether the Chrome copy-on-second-window ever shows a branch label to the person.
- The VS Code in-chat menu path for message-level branch was only partly traced (ChatStateManager.ts:6068-6115).
