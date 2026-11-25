---
id: "F094-02"
type: "feature"
title: "Explicit remember and forget commands"
aliases: ["remember and forget commands", "explicit memory commands", "Explicit Memory write handler (S94.02)", "memory_command", "/api/memory/commands", "save_memory / forget_memory tools", "useExplicitMemoryCommands"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "mode:local", "api:POST /api/memory/commands", "table:user_memories", "file:packages/ai/agent-core/src/memory.ts", "file:apps/web/lib/services/memory-commands.ts", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-api-and-contracts", "F094-01", "F094-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-02 Explicit remember and forget commands

The person types 'remember that ...' or 'forget ...' in chat. The app sends the sentence to the memory command route, which saves or searches the memory, and the person sees a short receipt. A forget always shows what would be deleted and waits for a confirmation. The assistant is told the outcome so it does not claim more.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.02](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9402).

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

**What it does.** Gives the person a direct, reliable way to add or remove a memory by talking, with an honest receipt, instead of hoping passive learning notices (packages/ai/agent-core/src/memory.ts:122-131 comment).

**Why it exists.** An explicit ask should get policy checks, a clear answer and a way to undo or confirm, which silent extraction does not give (packages/ai/agent-core/src/memory.ts:122-131). Unrecoverable deletion must ask first (doc: AGENTS.md section 9).

**Who uses it.** Any signed-in person chatting in Cloud mode on Web (and Desktop, which shows the web app), Mobile (own flow), and the Chrome extension client.

**Problems it solves**

- Passive learning misses or refuses facts; a command is deterministic.
- There was no chat path to delete a memory before this.
- The assistant could claim 'I forgot that' when nothing was deleted; the outcome note prevents it.

**Use cases**

- 'Remember that I use TypeScript.' The memory is saved and a toast says 'Saved to memory: ...'.
- 'Forget my old address.' A dialog lists the matching memories; the person confirms and they are deleted.
- 'Remember my card number is ...' is refused with the reason.

## 2. User experience

**Where to find it**

- Web chat composer (WebChatPage) and the Desktop window showing the hosted web app (apps/web/features/chat/pages/WebChatPage.tsx:2628-2640).
- Mobile chat: runs as a status step on the assistant message, with its own Alert dialog (apps/mobile/src/features/memory/services/memoryCommands.ts:224-270).
- Chrome extension: runAccountMemoryCommand client exists (apps/extension/src/features/cloud-bridge/memoryClient.ts:156). Where it is called: not read.

**Before you start**

- Cloud mode and a signed-in session with the cloud memory controller ready; otherwise the toast 'Cloud memory is unavailable until your account and workspace are ready. This command was not sent to memory.' appears (apps/web/features/chat/hooks/use-explicit-memory-commands.ts:121-128).
- Not a temporary chat and not a local-model turn on Web (apps/web/features/chat/pages/WebChatPage.tsx:2628-2630).
- Memory on for a remember to be stored (refusal reason memory_disabled otherwise) (apps/web/lib/services/memory-commands.ts:81-88).

**Screens and controls**

- The chat composer only. No special button.
- Confirmation dialog titled 'Forget this memory?' or 'Forget N memories?' with button 'Forget' (apps/web/features/chat/hooks/use-explicit-memory-commands.ts:176-186).
- Mobile Alert 'Forget this memory?' with 'Cancel' and 'Forget' (apps/mobile/src/features/memory/services/memoryCommands.ts:209-221).

**Journey**

1. Type 'remember that I am vegetarian' or 'forget my old address' and send.
2. The hook tests the text for the words remember, forget or memory and posts it to /api/memory/commands.
3. For remember: a toast shows the server message, for example 'Saved to memory: ...'.
4. For forget: the server finds matches; the dialog lists them and says chats stop using them and it cannot be restored.
5. Choose 'Forget' to send the request again with confirmed=true; the toast confirms the deletion. Cancel keeps everything.
6. The chat message itself still goes to the model with a note of the outcome so the assistant answers in one sentence.

**What the person sees and gets**

- Toast text comes from the server message first, else from fixed receipts: 'Saved to memory.', 'Already in memory, so nothing changed.', 'Not saved: a pinned memory on the same topic takes priority.', 'Not saved: memory is off, or this is something memory does not keep.', 'Deleted the matching memories.', 'No saved memory matched, so nothing was deleted.', 'Waiting for your confirmation before anything is deleted.' (apps/web/features/chat/hooks/use-explicit-memory-commands.ts:25-33,105-113).
- Success toasts for stored, already_known, forgotten; neutral toast for others (apps/web/features/chat/hooks/use-explicit-memory-commands.ts:34,105-113).
- Failure toast 'Memory did not answer, so it is unknown whether anything was saved or deleted. Check Memory in Settings.' (apps/web/features/chat/hooks/use-explicit-memory-commands.ts:23).

**Settings**

- Same switches as F094-01: Persistent memory, Include sensitive topics, never-remember list (Settings > Memory > 'Never remember').
- Workspace memory policy.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Parsing: remember patterns ('remember that X', 'remember: X', 'remember this: X', 'remember X') and forget patterns ('forget about X', 'forget that X', 'stop remembering X', 'delete my memory about X', 'forget my X'); questions starting with do, does, did, can, what, why ... are not commands; subject 2-120 chars (packages/ai/agent-core/src/memory.ts:132-212).
- Server route: CSRF, rate limit 'chat-conversation', body validated, conversation temporary flag read from the database not from the caller (apps/web/app/api/memory/commands/route.ts:19-52).
- Remember goes through the same eligibility gate plus the never-remember list; sensitive facts are allowed when the person asked (userRequested) but prohibited categories are not (apps/web/lib/services/memory-commands.ts:95-120; apps/web/lib/services/managed-memory-context-service.ts:570-668).
- Forget: ILIKE search of visible memories (min 3 chars, max 25 matches, scoped to the chat's project visibility), then every forget with at least one match returns confirmation_required until confirmed=true (apps/web/lib/services/memory-commands.ts:60-64,157-176; packages/ai/agent-core/src/memory.ts:340-388).
- Delete is a tombstone with blanked text; the route logs only memory ids (apps/web/app/api/memory/commands/route.ts:68-80; apps/web/lib/services/managed-memory-context-service.ts:391).
- The chat request carries memory_command so the model gets a one-sentence outcome note on web, desktop and mobile surfaces (apps/web/lib/services/memory-commands.ts:36,292-303; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6239-6242).
- Model-callable tools save_memory, search_memory, forget_memory are added when the user asks about memory, on streamed, tool-capable, non-temporary chats (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1116-1152; apps/web/lib/server/tools/memory-tools.ts:19-23).
- Mobile Local mode runs the same handlers against the on-device store; Cloud mode posts to the server route (apps/mobile/src/features/memory/services/memoryCommands.ts:180-200).

**Incomplete**

- The forget search is a plain substring match on the subject (and extracted phrasing); it does not understand meaning, so 'forget my job' finds only text containing those words (apps/web/lib/services/memory-commands.ts:66-68,157-176).
- A remember command cannot carry an expiry; the store port passes no expiresAt (apps/web/lib/services/memory-commands.ts:122-141).

**Present but disconnected or switched off**

- Web hook is skipped in temporary chats and for local-model turns, although the server allows a forget in a temporary chat (apps/web/features/chat/pages/WebChatPage.tsx:2628-2630; apps/web/lib/services/memory-commands.ts:73-74).
- Mobile skips commands in temporary chats (apps/mobile/stores/chat/chatExecutionStore.ts:2961).

**Not available**

- CLI and VS Code chat commands for remember/forget through this route: not found in files read; VS Code has a chat participant that reads memory but command handling was not located.
- No undo for a deleted memory by design (confirmation text says it cannot be restored).

## 4. Required behaviour

**Established requirements**

- A handler performs explicit remember/forget commands and reports the result. (source: S94.02)
- An action a user cannot undo asks first and the question names the consequence. (source: doc: AGENTS.md section 9)
- Add, edit, pin, exclude, pause, delete and import persist and affect the next applicable turn. (source: doc: docs/product/experience-contract.md:779)
- Temporary chats neither read nor write memory. (source: doc: docs/product/definition.md:172-173)

**Acceptance criteria**

1. 'Remember that I am vegetarian' on Web shows a success toast and a new memory appears in Settings > Memory.
2. 'Do you remember my name?' is not treated as a command.
3. 'Forget my address' with one match opens a dialog naming that memory; Cancel deletes nothing; Forget deletes it and a toast says 'Deleted the matching memories.' (or the server message).
4. A forget with no match says nothing was deleted.
5. If the memory route fails, the toast says it is unknown whether anything changed and nothing is shown as saved.
6. A remember that hits a pinned memory on the same topic says it was not saved.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A forget confirmation should also appear for a single match, because the handler asks whenever matches exist [inferred from packages/ai/agent-core/src/memory.ts:352-358]; the first draft said 'more than one'.
- Commands should work in temporary chats for forget, as the server comment says [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show forget in temporary chats on Web and Mobile, since the server allows it.
- [proposed] Let a remember carry 'for 30 days' as an expiry using the existing expiresAt rules.
- [proposed] Use meaning-based matching for forget with the confirmation list as the safety net.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useExplicitMemoryCommands | `apps/web/features/chat/hooks/use-explicit-memory-commands.ts` | Posts command, shows toast and forget confirmation dialog |
| screen | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Calls the hook before sending and passes memoryCommand with the chat request |
| endpoint | POST /api/memory/commands | `apps/web/app/api/memory/commands/route.ts` | Route: CSRF, rate limit, temporary flag lookup, run command |
| service | memory-commands | `apps/web/lib/services/memory-commands.ts` | Ports (eligibility, store, find, remove), source labelling, turn outcome note |
| service | explicit handlers | `packages/ai/agent-core/src/memory.ts` | parseExplicitMemoryCommand, explicitRememberHandler, explicitForgetHandler, messages |
| schema | memory-wire command types | `packages/contracts/types/src/memory-wire.ts` | Command request/response types and statuses; 4,000-char message cap |
| service | request-processor memory_command | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Accepts memory_command, adds the outcome note, adds memory tools |
| service | memory-tools | `apps/web/lib/server/tools/memory-tools.ts` | save_memory, search_memory, forget_memory model tools |
| service | mobile memoryCommands | `apps/mobile/src/features/memory/services/memoryCommands.ts` | Local and cloud command flow with Alert confirmation |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Calls answerMemoryCommand per sent message |
| service | extension memoryClient | `apps/extension/src/features/cloud-bridge/memoryClient.ts` | runAccountMemoryCommand client for the Chrome extension |
| service | memory-write-service | `apps/web/lib/services/memory-write-service.ts` | Never-remember refusal message |
| table | user_memories | `apps/web/db/neon/0010_memory.sql` | Rows written or tombstoned |
| test | memory-commands tests | `apps/web/lib/services/__tests__/memory-commands.test.ts` | Server command behaviour |
| test | hook tests | `apps/web/features/chat/hooks/useExplicitMemoryCommands.test.tsx` | Hook behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The composer calls runExplicitMemoryCommand with the message and the current conversation and project ids. The hook returns early unless the text contains remember, forget or memory words. | device | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:18,118-120 |
| POST /api/memory/commands with CSRF and rate limit; the server reads the conversation's temporary flag and health-space project from the database. | our servers | apps/web/app/api/memory/commands/route.ts:19-52 |
| parseExplicitMemoryCommand finds the first command sentence; remember runs checkEligibility then store; forget runs find then (if confirmed) remove. | our servers | apps/web/lib/services/memory-commands.ts:232-267 |
| The response carries status, message, requiresConfirmation and matches; the hook shows a toast or the confirmation dialog, and a confirmed forget is posted again with confirmed=true. | device | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:160-205 |
| The chat message is sent to the chat route with memory_command {kind,status}; the server adds a note so the model reports the real outcome in one sentence. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6239-6242; apps/web/lib/services/memory-commands.ts:292-303 |
| Mobile Local mode: the same handlers run against SQLite on the phone, with no server call. | device | apps/mobile/src/features/memory/services/memoryCommands.ts:180-200 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| New or merged memory row (source = surface label, user_requested true) | table user_memories | Yes via /api/memory/sync | Until deleted or expired |
| Deleted memory | same row, tombstone with text blanked | Tombstone syncs so other devices drop it | Text is not retained; the log keeps ids only (apps/web/app/api/memory/commands/route.ts:68-80) |
| Command text | Also the chat message in the conversation, as with any message | As chat sync | With the chat |

**Models and providers.** The command itself uses no model. The chat model only receives a note about the outcome. Model-called tools need a tool-capable model on a streamed turn (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1123-1152). No model identifiers are written here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in; the route uses the user-scoped database (apps/web/app/api/memory/commands/route.ts:35). |
| Permissions | Workspace memory policy can refuse (organization_memory_disabled maps to memory_disabled) (apps/web/lib/services/memory-commands.ts:81-88). |
| Subscription | none found in the code for this path. |
| Limits and metering | Message up to 4,000 chars (packages/contracts/types/src/memory-wire.ts:4); subject 2-120 chars; forget search min 3 chars and 25 matches (apps/web/lib/services/memory-commands.ts:60-64); rate limit bucket 'chat-conversation' (apps/web/app/api/memory/commands/route.ts:23). |
| Feature flags | none found in the code for this path. |
| Model compatibility | Works with any model; the outcome note is plain text. |
| Provider restrictions | none found in the code for this path. |
| Local mode | Web: the hook is skipped on local-model turns (apps/web/features/chat/pages/WebChatPage.tsx:2628-2630), so typing 'remember ...' does nothing special on Web Local. Mobile Local: runs on-device against SQLite, refuses prohibited categories, no never-remember list check and no sensitive-topic check (apps/mobile/src/features/memory/services/memoryCommands.ts:98-111). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | The hook awaits the post; the send waits for the report before attaching it. A visible spinner: not handled in the code. | apps/web/features/chat/pages/WebChatPage.tsx:2718 |
| Empty | 'No saved memory matched, so nothing was deleted.' is shown. | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:30 |
| Error | Failure toast with unknown-outcome wording and report status 'failed', which the model note describes as unknown. | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:139-144; apps/web/lib/services/memory-commands.ts:283-286 |
| Cancel | Dialog cancel retires the confirmation; nothing is deleted. Starting another command retires the previous dialog. | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:187-192,133-135 |
| Account switch / stale | Each command carries a request authority; results are dropped if the session or workspace changed. | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:117-138 |
| Offline | A network failure takes the error path; no queue or retry in the hook. | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:139-144 |
| Mobile partial forget | If local deletion stops partway, the message names what was forgotten and how many may remain. | apps/mobile/src/features/memory/services/memoryCommands.ts:82-87 |
| Accessibility | Confirmation uses the shared useConfirmAction dialog. Screen-reader behaviour not tested here. | apps/web/features/chat/hooks/use-explicit-memory-commands.ts:176 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/memory-commands.test.ts`: Surface label, no-command fallthrough, stored, overruled by pinned, sensitive when asked, workspace off, never-remember refusal, forget needs confirmation, deletion keeps no text, project visibility, no match, short subject, caller scoping, unknown-outcome note
- `apps/web/lib/services/__tests__/memory-command-gate.test.ts`: Command gate (by file name)
- `apps/web/app/api/memory/commands/route.test.ts`: Command route (by file name)
- `apps/web/features/chat/hooks/useExplicitMemoryCommands.test.tsx`: Hook (by file name)
- `apps/web/features/chat/hooks/useExplicitMemoryCommands.authority.test.tsx`: Request authority handling (by file name)
- `packages/ai/agent-core/src/__tests__/memory.test.ts`: Command parsing, questions not commands, handlers say stored/already/overruled/never claims a save, forget confirms and reports
- `apps/mobile/__tests__/memory-command-outcomes.test.ts`: Mobile outcomes (by file name)
- `apps/web/lib/services/memory-commands.consolidation.live.test.ts`: A live test file; whether it runs in CI is unknown

**Test scenarios**

- **Remember and see it**
  1. Cloud chat, memory on.
  2. Send 'remember that I use TypeScript'.
  3. Open Settings > Memory.
  - Expected: Toast with the saved fact; one memory 'I use TypeScript' with source 'web'.
- **Forget with confirmation**
  1. Send 'forget TypeScript'.
  2. In the dialog press Cancel; check the list.
  3. Repeat and press Forget.
  - Expected: Cancel keeps it; Forget deletes it and the list no longer shows it.
- **Pinned wins**
  1. Pin 'User lives in Oslo'.
  2. Send 'remember that I live in Rome'.
  - Expected: Receipt says not saved because a pinned memory on the same topic takes priority.
- **Route down**
  1. Block /api/memory/commands in the network panel.
  2. Send 'remember that I like tea'.
  - Expected: Failure toast with unknown-outcome wording; nothing marked saved.
- **Temporary chat**
  1. Open a temporary chat and send 'forget TypeScript'.
  - Expected: No dialog on Web (hook skipped); the text is sent to the model as plain chat.

**Where to look when it fails**

- Log '[memory-commands] explicit remember' and '[memory-commands] explicit forget' with status.
- Log '[memory-commands] explicit forget deleted memories' with memory ids.
- Table user_memories: tombstone rows with is_deleted true and empty content.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Forget in a temporary chat is allowed by the server but not offered by Web or Mobile.** Affects: Web and Mobile users in temporary chats.. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:2628-2630; apps/mobile/stores/chat/chatExecutionStore.ts:2961; apps/web/lib/services/memory-commands.ts:73-74. Work needed: Decide the rule and align code and comment.
- **Web Local-model turns skip commands, so a 'remember' does nothing for the account memory and gives no receipt.** Affects: Web and Desktop users with local models.. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:2628-2630. Work needed: Either route the command to account memory (managed storage with consent) or show a notice.
- **Remember cannot set an expiry.** Affects: All apps.. Evidence: apps/web/lib/services/memory-commands.ts:122-141. Work needed: Parse 'for N days' and pass expiresAt.
- **Mobile Local commands skip the never-remember list and sensitive-topic checks.** Affects: Mobile Local users.. Evidence: apps/mobile/src/features/memory/services/memoryCommands.ts:98-111. Work needed: Apply the on-device exclusion list.
- **Command UIs for CLI, VS Code and Desktop (Tauri) not established.** Affects: CLI, VS Code, Desktop Tauri.. Evidence: not found in files read. Work needed: Read those apps and record status.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- mode:local
- api:POST /api/memory/commands
- table:user_memories
- file:packages/ai/agent-core/src/memory.ts
- file:apps/web/lib/services/memory-commands.ts
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-api-and-contracts
- F094-01
- F094-03

## Unknown

- Where the Chrome extension calls runAccountMemoryCommand.
- Whether CLI and VS Code route remember or forget typed in chat.
- Whether the live consolidation test runs anywhere.
- Screen-reader behaviour of the forget dialog.
