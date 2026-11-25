---
id: "F039-03"
type: "feature"
title: "Add a memory by hand or by asking"
aliases: ["Add Memory (S39.10)", "Explicit remember this (S39.11)", "Add a new fact", "Add memory", "Remember This", "save_memory tool", "Remember command"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S39.10", "S39.11"]
depends_on: ["SYS-memory-projects-and-context", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "F039-01", "F039-06", "api:POST /api/memory", "api:POST /api/memory/commands", "table:user_memories", "store:memory_facts", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-03 Add a memory by hand or by asking

A person adds a fact to memory by typing it into the Memory list, or by asking the assistant to remember it. The server checks the never-remember list and refuses credentials. A repeated fact is merged. A newer same-topic fact replaces an older one unless a higher-ranked one holds the topic.

Area: [39. Memory product](README.md). Requirement items: [S39.10](../../10-requirements/capabilities/039-memory-product.md#s3910), [S39.11](../../10-requirements/capabilities/039-memory-product.md#s3911).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the person direct control over what is saved: a typed fact through the list, or a Remember request in chat answered with a clear outcome (apps/web/app/api/memory/route.ts:85-160; apps/web/app/api/memory/commands/route.ts:20-95).

**Why it exists.** The brief requires typed facts and an explicit remember action with confirmation (S39.10, S39.11). Inspectable, user-controlled memory is a stated product requirement (doc: docs/product/requirements.md section 18).

**Who uses it.** Anyone with Memory on, on all six apps.

**Problems it solves**

- Important facts are saved at once instead of waiting for automatic learning.
- The person knows whether the save worked.
- Secrets and never-remember terms stay out.

**Use cases**

- Type: I am vegetarian in the Add a new fact box.
- Say in chat: Remember that my team uses pnpm.
- CLI: agi memory add I use tabs not spaces.
- VS Code: select text and run Code: Remember This.

## 2. User experience

**Where to find it**

- Web and public Desktop: Settings, Personalization, Memory, then the list with the Add a new fact box (packages/ui/unified-chat/src/components/MemoryEditor.tsx:431-457).
- In any chat on web, desktop, mobile and chrome: type a message such as Remember that ... (apps/web/features/chat/hooks/use-explicit-memory-commands.ts:16-20; apps/mobile/src/features/memory/services/memoryCommands.ts:99; apps/extension/src/side_panel.ts:9003).
- Mobile: Memory screen, Add memory button (apps/mobile/app/(app)/settings/memory.tsx:767).
- CLI: agi memory add <text> with optional --category and --project (apps/cli/src/lib.rs:1438-1448, 4287-4331).
- VS Code: Code: Add Memory Fact and Code: Remember This (apps/extension-vscode/package.json:494-501; commandSetup.ts:2056-2099).
- Chrome: Account menu, Memory, then the Add field (apps/extension/src/side_panel.ts:12074; apps/extension/src/features/side-panel/memorySheet.ts:62-77).

**Before you start**

- Memory must be on: the server refuses writes when it is off (managed-memory-context-service.ts:619-625); mobile Cloud shows Memory is off. Turn on Memory to add memories. (apps/mobile/src/features/memory/store.ts:66,172-175); VS Code asks Turn memory on (commandSetup.ts:251-264).
- Signed in for Cloud memory; VS Code asks to sign in (commandSetup.ts:2080-2085).
- Not a temporary chat for chat commands (apps/web/app/api/memory/commands/route.ts:41-52).

**Screens and controls**

- Web: text area Add a new fact and Add button; example placeholder Example: I prefer Python over JavaScript for data work. (MemoryEditor.tsx:431-457).
- Web chat: toast receipts such as Saved to memory., Already in memory, so nothing changed., Not saved: memory is off, or this is something memory does not keep. (use-explicit-memory-commands.ts:21-29).
- Mobile: add sheet with outcome messages; chat step shows the command result (memoryCommands.ts:224-252).
- CLI: output Remembered in your account, on every client. or Not remembered: <reason> (lib.rs:4317-4330).
- VS Code: input box with validation, then Saved to your account, on every client. or Not saved. <reasons> (commandSetup.ts:2062-2099).
- Chrome: add form, then status line spMemoryAdded or error (memorySheet.ts:225-235).

**Journey**

1. Choose where to add: list box, chat message, or command.
2. Type the fact or the Remember sentence.
3. Submit.
4. The server checks rules (below).
5. The person sees a saved, already known, kept-existing or refused message.
6. The fact appears in the list and later chats can use it.

**What the person sees and gets**

- Saved: list updates; new fact gets 201, a merged duplicate returns 200 with merged true (route.ts:163-190).
- Refused for a never-remember term: message Not saved. This memory contains "<term>", which you asked AGI never to remember. (apps/web/lib/services/memory-write-service.ts:25-27).
- Kept an older, higher-ranked fact: web error Kept ... instead, because it outranks the new fact. Unpin or edit it to change what is remembered. (packages/ui/unified-chat/src/stores/memoryStore.ts:295-303).
- Chat reply tells the outcome in one sentence from a note the server adds (apps/web/lib/services/memory-commands.ts:264-303).

**Settings**

- Never-remember list (settings.memory.excludedTerms).
- Memory switch (F039-01).
- Sensitive topics switch does not apply to typed or asked facts: user-requested writes skip it (managed-memory-context-service.ts:628-630).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/memory validates content (required, at most 20,000 characters), category length, expiry and project, checks the never-remember list, then writes through the shared path (apps/web/app/api/memory/route.ts:85-160; packages/contracts/types/src/memory-wire.ts:497-548).
- Credentials and special-category facts are always refused (managed-memory-context-service.ts:570-580).
- Duplicates are merged (keyed by normalised text) and a same-topic newer fact supersedes older ones unless a higher rank holds the topic (managed-memory-context-service.ts:760-870).
- Web chat posts explicit commands to /api/memory/commands; the server runs remember or forget and returns a status (apps/web/app/api/memory/commands/route.ts; apps/web/lib/services/memory-commands.ts:232-262).
- Server memory tool save_memory, search_memory, forget_memory exists (apps/web/lib/server/tools/memory-tools.ts:25-27); it is offered only on web, desktop, mobile and chrome streaming turns for tool-capable models when the message asks about memory (request-processor.ts:1111-1146).
- Mobile: Cloud adds go to the local cloud store and sync (store.ts:164-195); Local adds use writeLocalMemoryFact (localMemoryWriter.ts:25-75); chat commands run locally or through /api/memory/commands (memoryCommands.ts:194-252).
- CLI agi memory add, with --project to confine to the linked project (lib.rs:4287-4331).
- VS Code add and Remember This commands (commandSetup.ts:2056-2099).
- Chrome sheet add and chat command turn with a forget confirmation note (memorySheet.ts:225-235; side_panel.ts:9003-9073).

**Incomplete**

- In-chat remember on CLI and VS Code: no call to /api/memory/commands was found in the CLI source (search returned only the memory subcommand). The brief maps CLI remember to registry.rs:1490 and tui_app.rs:3792, which open instruction files, not account memory (apps/cli/src/repl/registry.rs:1933-2040). Behaviour for CLI chat Remember is unverified.
- Mobile Local mode has no never-remember list: the row appears only in Cloud (apps/mobile/app/(app)/settings/memory.tsx:569).
- Mobile Cloud adds are accepted locally first; how a server refusal during sync is shown was not established (apps/mobile/src/features/memory/store.ts:176-200; apps/web/app/api/memory/sync/route.ts:160-215).

**Present but disconnected or switched off**

- Memory tool is not offered unless the message matches a remember or recall pattern (request-processor.ts:1116-1121,1145).

**Not available**

- The Remember command is not offered through the memory tool on cli, vscode or api surfaces (AMBIENT_TOOL_SURFACES, request-processor.ts:1111-1114).

## 4. Required behaviour

**Established requirements**

- The user can type a new fact and save it to their memory, where later chats can use it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.10)
- From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.11)
- The user can stop sensitive information being remembered and credentials are refused automatically. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.29)
- Add, edit and delete memory are required features. (source: doc: docs/product/requirements.md section 18)
- Memory must never silently absorb Local-only sensitive data into synced or global memory. (source: doc: docs/product/requirements.md section 18)

**Acceptance criteria**

1. Typing a new fact in the web list adds it and the list shows it.
2. Typing the same fact twice leaves one memory.
3. Typing a fact containing a never-remember term shows the Not saved message and adds nothing.
4. Saying Remember that I use pnpm in a chat saves it and the reply states the outcome.
5. Saying a Remember sentence in a temporary chat saves nothing.
6. An empty or whitespace-only fact is refused with Content is required.
7. A text with a password or key is refused on every app.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Edits to a fact do not trigger merge or supersede, only admission checks [inferred from apps/web/app/api/memory/[id]/route.ts:100-135 vs writeConsolidatedMemory use in route.ts:151].
- Pinned facts win topic conflicts, so a typed fact may be kept out with the overruled outcome [inferred from managed-memory-context-service.ts:687-690, 813].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make CLI and VS Code chat Remember sentences call /api/memory/commands so the answer is the same on every app.
- [proposed] Add a never-remember list to mobile Local mode.
- [proposed] Show the server refusal reason when a mobile Cloud add is refused during sync.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/memory | `apps/web/app/api/memory/route.ts` | Create a memory: validation, exclusions, write. |
| endpoint | POST /api/memory/commands | `apps/web/app/api/memory/commands/route.ts` | Run explicit remember or forget from a chat message. |
| service | runMemoryCommand | `apps/web/lib/services/memory-commands.ts` | Applies the same gate and exclusion list for explicit commands; returns turn status. |
| service | parseExplicitMemoryCommand | `packages/ai/agent-core/src/memory.ts` | Recognises Remember and Forget sentences, ignores questions. |
| service | assertMemoryWriteAllowed | `apps/web/lib/services/memory-write-service.ts` | Refuses a write containing a never-remember term; read failure refuses the write. |
| service | writeConsolidatedMemory | `apps/web/lib/services/managed-memory-context-service.ts` | Merge, supersede and insert. |
| service | memory tools | `apps/web/lib/server/tools/memory-tools.ts` | save_memory, search_memory, forget_memory tool definitions and executors. |
| hook | useExplicitMemoryCommands | `apps/web/features/chat/hooks/use-explicit-memory-commands.ts` | Web client for explicit commands with receipts and delete confirmation. |
| store | memoryStore add | `packages/ui/unified-chat/src/stores/memoryStore.ts` | Optimistic add with rollback, keeper message, merge handling. |
| component | MemoryEditor | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Add a new fact form. |
| schema | readManagedMemoryCreateRequest | `packages/contracts/types/src/memory-wire.ts` | Shared create-request contract used by web API, VS Code and Chrome. |
| store | mobile memory store | `apps/mobile/src/features/memory/store.ts` | addMemory for Cloud and Local scope. |
| service | memoryCommands (mobile) | `apps/mobile/src/features/memory/services/memoryCommands.ts` | Parses commands and answers locally or via the server. |
| command | agi memory add | `apps/cli/src/lib.rs` | CLI add with category and project options. |
| command | agi-workforce.memory.create / rememberSelection | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code add commands. |
| component | memory sheet | `apps/extension/src/features/side-panel/memorySheet.ts` | Chrome add form. |
| integration | runChatMemoryCommand | `apps/extension/src/side_panel.ts` | Chrome chat remember and forget turn. |
| table | user_memories | `apps/web/db/neon/0010_memory.sql` | Base table; later migrations add pinned, lifecycle, provenance. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person submits a fact in the list. | device | packages/ui/unified-chat/src/stores/memoryStore.ts:260-290 |
| Client shows the fact as pending, fetches a CSRF token, posts to /api/memory. | device and our servers | memoryStore.ts:108-135, 186-200 |
| Server checks rate limit and CSRF, reads the body with the shared contract, resolves the project, runs the never-remember check. | our servers | apps/web/app/api/memory/route.ts:86-148 |
| Admission: credentials refused; temporary chat refused; workspace and user switches checked; trust mode must be managed. | our servers | managed-memory-context-service.ts:570-665 |
| One SQL statement merges a duplicate, finds same-topic rivals, inserts, and supersedes lower-ranked rivals. | our servers | managed-memory-context-service.ts:760-870 |
| Chat command path: client posts the message to /api/memory/commands; server parses, applies the same gates and answers; the next chat turn carries a note so the reply states the outcome. | device and our servers | apps/web/app/api/memory/commands/route.ts:20-95; request-processor.ts:6240 |
| Mobile Local add writes SQLite on the device after refusing credentials. | device | localMemoryWriter.ts:25-75 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory row (content, category, source web/mobile/desktop/auto/cli/vscode/chrome, pinned, project, expiry) | table:user_memories | Yes, all Cloud surfaces | Until deleted; deleted rows keep id and blank text |
| Mobile Cloud pending entry | store: cloud memory store on the device, then /api/memory/sync | Yes after sync | Kept until synced or deleted |
| Mobile Local fact | store:memory_facts | No | Until deleted |

**Models and providers.** Manual add uses no model. The memory tool path needs a tool-capable model; the server adds a note to the turn so any model can report the outcome (memory-commands.ts:264-303). See SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for Cloud; none for mobile Local. |
| Permissions | Workspace policy and user switch; project must belong to the user and workspace (route.ts:128-142). |
| Subscription | none found in the code opened. |
| Limits and metering | Content up to 20,000 characters on the API (memory-wire.ts:1,497-506), 500 through the memory tool (memory-tools.ts:35); rate limit bucket chat-conversation (route.ts:89). |
| Feature flags | none found. |
| Model compatibility | Typed adds are model independent. Tool-based remember needs tool support and a streaming turn (request-processor.ts:1131-1142). |
| Provider restrictions | none found in the code opened. |
| Local mode | Mobile Local adds stay on the device with credential refusal only (localMemoryWriter.ts:25-75). Server memory never accepts Local or own-key content (managed-memory-context-service.ts:646-660). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty input | Refused: Content is required. | memory-wire.ts:497-500 |
| Too long | Refused with a character limit message. | memory-wire.ts:501-506 |
| Never-remember match | HTTP 400 validation error with the term; the exclusions read failing refuses the write. | memory-write-service.ts:41-60 |
| Credential or special-category fact | Refused with 403. | managed-memory-context-service.ts:570-580; route.ts:164-167 |
| Rolled back add | The pending row is removed and the error is raised. | memoryStore.ts:274-281 |
| Outranked | New fact not kept; message names the keeper. | memoryStore.ts:290-303 |
| Confirmation unknown | Status failed: the app says it is not known whether anything saved. | use-explicit-memory-commands.ts:17-18; memory-commands.ts:286-287 |
| Project missing | 404 Project not found. | route.ts:141 |
| Signed out | VS Code and Chrome show a sign-in message. | commandSetup.ts:2080-2085; memorySheet.ts:105 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/memory.test.ts`: Memory API (name only; contents not opened)
- `apps/web/app/api/memory/__tests__/exclusion-enforcement.test.ts`: Never-remember enforcement (name only)
- `apps/web/app/api/memory/commands/route.test.ts`: Memory commands route (name only)
- `apps/web/lib/services/__tests__/memory-commands.test.ts`: Command service (name only)
- `apps/web/lib/services/__tests__/memory-command-gate.test.ts`: Command gate (name only)
- `apps/web/features/chat/hooks/useExplicitMemoryCommands.test.tsx`: Web command hook (name only)
- `apps/web/lib/server/tools/memory-tools.test.ts`: Memory tools (name only)
- `packages/ui/unified-chat/src/stores/__tests__/memoryStore.test.ts`: Shared store (name only)
- `apps/mobile/__tests__/memory-command-outcomes.test.ts`: Mobile command outcomes (name only)
- `apps/mobile/__tests__/AddMemorySheetSaveOutcome.test.tsx`: Mobile add sheet outcome (name only)
- `apps/extension-vscode/src/__tests__/accountMemoryStore.test.ts`: VS Code account store (name only)
- `apps/extension/__tests__/chat-memory-command-owner.test.ts`: Chrome command owner (name only)

**Test scenarios**

- **Type a fact**
  1. Memory on.
  2. Settings, Personalization, Memory, type I am vegetarian, press Add.
  - Expected: Fact listed, source shows typed or web.
- **Duplicate**
  1. Add the same fact again with different capitals.
  - Expected: One entry remains.
- **Never remember**
  1. Add the term cabbage to Never remember.
  2. Add the fact I hate cabbage.
  - Expected: Not saved message naming the term.
- **Remember in chat**
  1. Say: Remember that I deploy on Fridays.
  2. Read the reply, then open Memory.
  - Expected: Reply says it was saved; fact listed.
- **Credential**
  1. Add: my password is hunter2.
  - Expected: Refused; nothing listed.
- **Topic replacement**
  1. Add: I live in Paris.
  2. Add: I live in Berlin.
  - Expected: Only Berlin is listed; Paris appears under replaced memories.

**Where to look when it fails**

- Log [memory-commands] explicit remember (memory-commands.ts:245).
- Log Failed to create memory (route.ts:164).
- Error HTTP 403 with code FORBIDDEN for refusals (memory-write-service.ts:29-33).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)
- VS Code: [70-qa/test-plans/vscode/039-memory-product.md](../../70-qa/test-plans/vscode/039-memory-product.md)
- Chrome: [70-qa/test-plans/chrome/039-memory-product.md](../../70-qa/test-plans/chrome/039-memory-product.md)

## 10. Gaps and dependencies

- **CLI and VS Code chat Remember sentences not shown to reach the account.** Affects: CLI, VS Code. Evidence: No /api/memory/commands call found in apps/cli/src; registry.rs:1933-2040 writes instruction files. Work needed: Verify live; wire or document.
- **No never-remember list in mobile Local mode.** Affects: Mobile Local. Evidence: memory.tsx:569; localMemoryWriter.ts:25-75. Work needed: Add exclusions locally or record a decision.
- **Refusal feedback after mobile Cloud sync not established.** Affects: Mobile Cloud. Evidence: store.ts:176-200; sync/route.ts:206-212. Work needed: Trace the rejected response into the UI.
- **Brief code pointers for CLI and Chrome remember lines are stale.** Affects: Documentation. Evidence: side_panel.ts lines 10613 and 10647 in the brief are unrelated code. Work needed: Refresh the brief.

**Depends on**

- SYS-memory-projects-and-context
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- F039-01
- F039-06
- api:POST /api/memory
- api:POST /api/memory/commands
- table:user_memories
- store:memory_facts
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Whether CLI chat accepts Remember sentences into account memory.
- How mobile Cloud shows a server refusal at sync time.
- Whether Free plan accounts may add memories.
- Contents of the existing test files (only names were seen).
