---
id: "F039-12"
type: "feature"
title: "Privacy rules, temporary chats and where memory applies"
aliases: ["Never remember", "Exclusions", "Sensitive-memory controls", "Temporary chat", "Memory used", "Memory · N", "Manage memory", "Include sensitive topics in memory", "Cross-model personalization", "Cross-surface continuity", "S39.27", "S39.28", "S39.29", "S39.31", "S39.32"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S39.27", "S39.28", "S39.29", "S39.31", "S39.32"]
depends_on: ["SYS-security-and-privacy", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-sync-and-continuity", "SYS-execution-boundaries", "SYS-local-inference", "SYS-authorization-and-workspaces", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:local", "mode:own-key", "mode:cloud", "table:user_memories", "table:user_settings", "table:web_conversations", "api:POST /api/memory", "api:POST /api/memory/sync", "api:GET /api/memory/local-context", "F039-09", "F039-10"]
basis: "code inspection"
second_reader: "7 of 12 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-12 Privacy rules, temporary chats and where memory applies

Rules for what memory may hold and use. People list terms to never remember; credentials and other prohibited facts are refused for every source; sensitive topics need opt-in for automatic saves. Temporary chats neither read nor save memory. Web and mobile show which memories a reply used. The server applies one memory context to every model.

Area: [39. Memory product](README.md). Requirement items: [S39.27](../../10-requirements/capabilities/039-memory-product.md#s3927), [S39.28](../../10-requirements/capabilities/039-memory-product.md#s3928), [S39.29](../../10-requirements/capabilities/039-memory-product.md#s3929), [S39.31](../../10-requirements/capabilities/039-memory-product.md#s3931), [S39.32](../../10-requirements/capabilities/039-memory-product.md#s3932).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Enforces privacy rules on memory: a never-remember list of terms, automatic refusal of credential-like and other prohibited facts, an opt-in for sensitive topics, temporary chats that skip memory completely, a 'Memory · N' indication on replies that used memory, and the same memory for every model and every signed-in client.

**Why it exists.** People must be able to stop sensitive information being remembered and see when memory shaped a reply. Brief S39.27 to S39.32 and docs/product/requirements.md:765 require temporary chats to neither update nor reference memory.

**Who uses it.** Every person who uses memory; privacy-minded people; workspace admins relying on policy; testers.

**Problems it solves**

- Passwords, payment details or identifiers ending up in memory.
- Private topics being remembered without consent.
- Not knowing whether an answer came from memory.
- Memory working on one model or app and not another.

**Use cases**

- Add 'home address' to Never remember; a later attempt to save a fact containing it is refused with a message naming the term.
- Start a temporary chat and tell the assistant a fact; it is not saved and no memory is read.
- Open a reply's 'Memory · 3' control to see which saved facts were used.
- Save a fact in the CLI and see it on web and in VS Code.

## 2. User experience

**Where to find it**

- Web: Settings, Memory, group 'Never remember' with input 'Term to never remember' and a group 'Where memories come from' with 'Suppress: <source>' boxes (apps/web/features/settings/components/MemoryExclusions.tsx:162,184,295).
- Web: switches 'Save memories from chats', 'Search past chats', 'Include sensitive topics in memory' (apps/web/features/settings/sections/MemorySection.tsx:395,408,419).
- Web temporary chat: the composer menu entry for memory is disabled with 'Temporary chats never read or save memory.' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6137).
- Web memory used: on an assistant reply, the Sources panel section 'Memory · N' with 'Manage memory' (apps/web/features/chat/components/research/ResearchPanel.tsx:156-191).
- Mobile: Settings, Memory, row 'Never remember' (apps/mobile/app/(app)/settings/memory.tsx:569) with screen 'Never remember' (memory-exclusions.tsx:161); Settings, General, switch 'Temporary Chat' (apps/mobile/src/features/settings/general/index.tsx:149) and a banner; reply chip 'Memory · N' (apps/mobile/src/features/chat/components/MemoryUsedChip.tsx:13).
- CLI: agi memory never [--add term] [--remove term] (apps/cli/src/lib.rs:1435,4237); agi --no-memory for a process (lib.rs:6691).
- VS Code: memory quick pick entry 'Never remember…' (apps/extension-vscode/src/core/commandSetup.ts:1961).
- Desktop Tauri: no never-remember list found in apps/desktop/src (grep for exclusion terms found no memory UI). Electron shows the web app (doc: AGENTS.md section 5) [inferred]. Desktop Tauri does have a Memory settings tab (apps/desktop/src/features/settings/tabs/Memory.tsx) and a Local-mode temporary chat: an incognito conversation that is not stored, with memory skipped by the native runtime; the switch works only on an empty chat (apps/desktop/src/features/chat/useTemporaryChat.ts:1-15).
- Chrome: no never-remember list found; a temporary chat mode exists (apps/extension/src/side_panel.ts:914,8902).

**Before you start**

- Signed in for the never-remember list (stored in the account).
- Memory on for memory to be read or saved.
- For automatic saving of sensitive topics: the opt-in switch.

**Screens and controls**

- Add term box (minimum 3 characters, maximum 50 terms; the 100-character cap is a web input limit only, maxLength={100} at MemoryExclusions.tsx:186, and the server does not enforce it); remove buttons 'Stop excluding <term>' (MemoryExclusions.tsx:135,184,268).
- Source suppression checkboxes: kept saved but out of answers.
- Memory used chip or panel with list of facts and 'Manage memory'.
- Temporary chat switch or composer toggle; mobile banner offers Personalized or Unpersonalized (TemporaryChatBanner.tsx:17-18). The banner says Unpersonalized also leaves out profile, instructions and response style (TemporaryChatBanner.tsx:19-20).

**Journey**

1. 1. Open Settings, Memory, Never remember and add a term.
2. 2. Any later save (typed, imported, auto-saved or spoken 'remember') whose text contains the term is refused.
3. 3. Credentials and other prohibited facts are refused with a reason for every source.
4. 4. Start a temporary chat: memory is neither read nor saved.
5. 5. In a normal chat, if memory shaped a reply, open Memory · N to see which facts.
6. 6. Pick any model; the same memory is used.

**What the person sees and gets**

- Refusal text: 'Not saved. This memory contains "<term>", which you asked AGI never to remember.' (apps/web/lib/services/memory-write-service.ts:24).
- Sensitive-topic refusal explaining Remember that ... or the opt-in switch (packages/contracts/context/src/memory-content-policy.ts:580).
- Temporary chat reply: 'This is a temporary chat, so it neither reads nor saves Memory.' (apps/web/lib/server/tools/memory-tools.ts:121).
- Banner text on mobile: 'Won't appear in history or use memory, and is normally deleted after 30 days.' (Cloud) and a Local version (TemporaryChatBanner.tsx:11-15).
- CLI: 'Not remembered: <reason>' and import counts of excluded items.

**Settings**

- Never remember list and source suppression (user settings memory namespace).
- Include sensitive topics in memory.
- Memory and Search past chats switches.
- Mobile: Temporary Chat and temporaryChatPersonalized.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Exclusions are stored in user settings (memory.excludedTerms), normalized to lower case, at least 3 characters, at most 50 (apps/web/lib/services/managed-memory-context-service.ts:283-300). The server sets no maximum term length; the 100-character cap is only the web input's maxLength (MemoryExclusions.tsx:186), so the CLI and VS Code can write longer terms (managed-memory-context-service.ts:289-298).
- Typed saves, edits, sync pushes, imports, explicit remember commands and automatic saves all check the list; a read failure refuses the write (apps/web/lib/services/memory-write-service.ts:39,44; apps/web/app/api/memory/route.ts:148; apps/web/app/api/memory/sync/route.ts:170; apps/web/app/api/memory/import/route.ts:107; apps/web/lib/services/memory-commands.ts:114; managed-memory-context-service.ts:1372).
- Prohibited categories are credential, payment_instrument, government_identifier, biometric, precise_location, criminal_history and immigration_status, and are refused for every source (packages/contracts/context/src/memory-content-policy.ts:1-9; managed-memory-context-service.ts:570).
- Sensitive topics (health, ethnic origin, religion, politics, sexual orientation, gender identity, union membership) are refused for automatic saves unless the person opts in or explicitly asks (memory-content-policy.ts:13-21; managed-memory-context-service.ts:603-640).
- A temporary conversation gets a disabled memory policy and no memory or past-chat read; past-chat search excludes temporary chats (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4126; apps/web/lib/services/turn-context-service.ts:124-131; apps/web/lib/services/past-chat-context-service.ts:256). Memory tools refuse in temporary chats (memory-tools.ts:121).
- A temporary chat may still ask to forget, never to remember (memory-commands.ts:71).
- Server sends memory citations with the reply; web shows 'Memory · N' and mobile a 'Memory · N' chip (request-processor.ts:6889; ResearchPanel.tsx:156; MemoryUsedChip.tsx:13; chatExecutionStore.ts:3459).
- Memory is loaded by user, workspace, project and source filters only, with no model input, so every model gets the same context (managed-memory-context-service.ts:1128). Local-model turns on web and desktop prefetch the same account context (apps/web/app/api/memory/local-context/route.ts; apps/web/lib/hooks/useChatStream.ts:4479).
- Memory crosses clients through /api/memory and /api/memory/sync (apps/web/app/api/memory/sync/route.ts:393; apps/cli/src/cloud/memory.rs:15; apps/extension/src/features/cloud-bridge/memoryClient.ts:43; apps/extension-vscode/src/memory/accountMemoryClient.ts).
- Mobile temporary chat reads no memory and skips memory commands and capture (apps/mobile/stores/chat/chatExecutionStore.ts:2797,2962).
- Desktop Tauri has a Local-mode temporary chat: an incognito conversation never written to SQLite, with memory skipped by the native runtime; the switch works only on an empty chat (apps/desktop/src/features/chat/useTemporaryChat.ts:1-15). Desktop Tauri also has a Memory settings tab (apps/desktop/src/features/settings/tabs/Memory.tsx).
- On mobile, a temporary-chat request with personalization === false forces memory_enabled = false on the server (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523); the mobile store sends personalization from temporaryChatPersonalized (apps/mobile/stores/chat/chatExecutionStore.ts:3453,5216).

**Incomplete**

- Never-remember is account-level: mobile Local writes always refuse prohibited categories (credential-like and others) for every source, but refuse sensitive topics only for learned (automatic) saves unless the person opted in, and do not check the term list (apps/mobile/src/features/memory/services/localMemoryWriter.ts:30-39; excludedTerms appears only in memory-exclusions.tsx).
- Temporary chat in CLI, VS Code and Chrome: CLI offers --no-memory and --no-session-persistence flags (lib.rs:6691) but no temporary chat; Chrome has a temporary chat mode whose server-side memory effect depends on the server marking the conversation temporary [inferred from request-processor.ts:4081,4126; side_panel.ts:1095]; VS Code none found.
- The brief lists the memory-used indication as missing on mobile, but mobile has it (MemoryUsedChip.tsx); CLI, VS Code, Chrome and desktop Tauri have none found.
- Mobile temporary chat 'Personalized' option sets personalization true or false; the server turns memory off when personalization is false (request-processor.ts:3523), and the banner says Unpersonalized also leaves out profile, instructions and response style (TemporaryChatBanner.tsx:19-20). What 'Personalized' adds in a temporary chat beyond instructions is not further traced.

**Present but disconnected or switched off**

- Model-based extraction of automatic memories is switched by the environment setting AGI_MODEL_MEMORY_EXTRACTION and only runs when the turn text was kept (apps/web/lib/services/managed-auto-memory-service.ts:36-58; docs/decisions/2026-09-15-founder-decisions.md:53-58).

**Not available**

- Never-remember list UI in desktop Tauri and Chrome.
- Memory-used indication in CLI, VS Code, Chrome and desktop Tauri.
- A way to see why a particular fact was refused after the fact: not found.

## 4. Required behaviour

**Established requirements**

- The user can stop sensitive information being remembered (never-remember terms or categories) and sensitive facts such as credentials are refused automatically. (source: brief S39.29 Should)
- In a temporary chat nothing is read from or saved to memory, and the chat is never used later as past-chat context. (source: brief S39.28 Should)
- When saved memory or past chats shaped a reply, the reply shows it and which memories. (source: brief S39.27 Should)
- Saved memory and personalization apply the same way whichever model the user picks. (source: brief S39.31 Should)
- A memory saved on one client appears and is used on every other client signed in to the same account. (source: brief S39.32 Should)
- Temporary chats must not update or reference memory unless the user explicitly changes that behavior. (source: docs/product/requirements.md:765)
- Mobile keeps Local and Cloud memory separate; one is never copied into the other. (source: docs/decisions/2026-09-27-founder-decisions.md:159)
- Temporary chats, Memory-off sessions, API and zero-data-retention traffic stay excluded from automatic extraction. (source: docs/decisions/2026-09-15-founder-decisions.md:53-58)
- Sensitive categories require explicit controls. (source: docs/product/experience-contract.md:28-31)

**Acceptance criteria**

1. Adding 'home address' to Never remember then saving 'my home address is X' by typing, import, remember command and auto-save all refuse with the term named.
2. A fact that looks like a password or card number is refused in every app that writes memory.
3. A health-related fact is not auto-saved unless 'Include sensitive topics in memory' is on; saying 'Remember that ...' saves it.
4. In a temporary chat on web and mobile, no memory is read, no fact is saved, and the chat is not found by past-chat search.
5. A normal reply that used memory shows 'Memory · N' listing the facts on web and mobile.
6. The same prompt on two different models gets the same memory context.
7. A fact added in the CLI shows in web Settings, Memory and in VS Code after sync.
8. Exclusion terms shorter than 3 characters are rejected with a message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Never-remember should also apply to mobile Local memory to meet 'stop sensitive info being remembered' there [inferred from the account-level list and the local writer].
- The Chrome temporary chat probably excludes memory through the server's temporary conversation check [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Apply the term list in the mobile Local writer using a device copy of the list.
- [proposed] Show the memory-used indication in the CLI and in VS Code chat.
- [proposed] Add a never-remember screen to desktop Tauri and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | memory-write-service | `apps/web/lib/services/memory-write-service.ts` | Never-remember checks and refusal message |
| service | memory eligibility gate | `apps/web/lib/services/managed-memory-context-service.ts` | Content refusal, temporary chat, sensitive topics, workspace and trust mode |
| schema | memory-content-policy | `packages/contracts/context/src/memory-content-policy.ts` | Prohibited categories and sensitive topics |
| component | MemoryExclusions | `apps/web/features/settings/components/MemoryExclusions.tsx` | Web Never remember and source suppression |
| component | MemorySection toggles | `apps/web/features/settings/sections/MemorySection.tsx` | Memory switches including sensitive topics |
| service | resolveInteractiveTurnContext | `apps/web/lib/services/turn-context-service.ts` | Skips memory and past chats for temporary chats; builds citations |
| service | past-chat-context-service | `apps/web/lib/services/past-chat-context-service.ts` | Excludes temporary conversations from recall |
| service | memory-commands | `apps/web/lib/services/memory-commands.ts` | Explicit remember and forget with the same gate |
| service | memory-tools | `apps/web/lib/server/tools/memory-tools.ts` | Model memory tools refuse in temporary chats |
| service | managed-auto-memory-service | `apps/web/lib/services/managed-auto-memory-service.ts` | Automatic saving after a turn |
| component | ResearchPanel MemorySources | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Web Memory · N panel |
| component | MemoryUsedChip | `apps/mobile/src/features/chat/components/MemoryUsedChip.tsx` | Mobile used-memory chip and sheet |
| component | TemporaryChatBanner | `apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx` | Mobile temporary chat explainer |
| store | chatExecutionStore memory gating | `apps/mobile/stores/chat/chatExecutionStore.ts` | Skips memory reads and commands in temporary chats |
| service | localMemoryWriter | `apps/mobile/src/features/memory/services/localMemoryWriter.ts` | Mobile Local refusal of credentials and other prohibited facts, and of sensitive topics for learned saves |
| screen | memory-exclusions (mobile) | `apps/mobile/app/(app)/settings/memory-exclusions.tsx` | Mobile Never remember screen |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Account memory for local-model turns |
| service | CLI never_remember | `apps/cli/src/cloud/personalization.rs` | agi memory never |
| component | VS Code memoryExclusions | `apps/extension-vscode/src/memory/memoryExclusions.ts` | Quick pick to manage excluded terms |
| service | Chrome memoryClient | `apps/extension/src/features/cloud-bridge/memoryClient.ts` | Account memory calls for the side panel |
| job | purge-temporary-chats cron | `apps/web/app/api/cron/purge-temporary-chats/route.ts` | Deletes expired temporary chats |
| table | user_settings (memory namespace) | `apps/web/lib/services/managed-memory-context-service.ts` | excludedTerms and suppressedSources |
| table | web_conversations.is_temporary | `apps/web/lib/services/past-chat-context-service.ts` | Marks temporary chats |
| other | desktop useTemporaryChat | `apps/desktop/src/features/chat/useTemporaryChat.ts` | Desktop Tauri Local-mode temporary chat (incognito, not stored, memory skipped by native runtime) |
| screen | desktop Memory settings tab | `apps/desktop/src/features/settings/tabs/Memory.tsx` | Desktop Tauri Memory settings tab |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person adds a term; the client saves it in the account's memory settings namespace. | device and our servers | apps/web/features/settings/components/MemoryExclusions.tsx:100-150 |
| Any memory write reaches the server, which loads the list (failing closed on error), then runs the content and policy gate. | our servers | apps/web/lib/services/memory-write-service.ts:39-60; managed-memory-context-service.ts:570-660 |
| For a chat turn the server checks if the conversation is temporary; if so it uses a disabled memory policy and loads no memory or past chats. | our servers | request-processor.ts:4126; turn-context-service.ts:124-131 |
| Otherwise it loads memories filtered by user, workspace, project and suppressed sources, ranks them against the question, takes up to 30, and places them in the prompt fenced as untrusted data. | our servers | managed-memory-context-service.ts:1128-1215,1281 |
| The model provider receives the prompt; the reply stream carries memory citations back to the app. | outside service | request-processor.ts:6889 |
| The app shows 'Memory · N' from the citations. | device | ResearchPanel.tsx:156; MemoryUsedChip.tsx:13 |
| After the turn, automatic saving extracts facts, applies the exclusions and the eligibility gate and writes rows. | our servers | managed-memory-context-service.ts:1343-1385; managed-auto-memory-service.ts:36 |
| Other clients pull the new rows by delta sync. | device and our servers | apps/web/app/api/memory/sync/route.ts:73; apps/cli/src/cloud/memory.rs:15 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Never-remember terms and suppressed sources | table user_settings, settings.memory | Read by every client of the account | Until the person removes them; existing memories containing a term are not deleted (MemoryExclusions.tsx:162 copy) |
| Memories and citations | table user_memories; citations travel in the reply metadata and are stored on the assistant message | Yes across clients | Deleted memories keep a text-less tombstone (managed-memory-context-service.ts:391) |
| Temporary chats | web_conversations with is_temporary true | Not shown in history | Purged by a scheduled job, which the route's delete queries target at web_conversations flagged temporary after RETENTION_DAYS = 30 (purge-temporary-chats/route.ts:24,44-83); mobile banner says normally deleted after 30 days (TemporaryChatBanner.tsx:11-12) |
| Mobile Local memory | Device SQLite memory_facts | No (decision D-2026-09-28-02) | Cleared by the person or by data deletion (apps/mobile/services/dsarExport.ts) |

**Models and providers.** Memory is added by the server for every model and provider and no model identifier enters the query (managed-memory-context-service.ts:1128). Auto-extraction may use a utility model route when the environment flag is on and the turn is not zero-data-retention (managed-auto-memory-service.ts:36-58). On Local-model turns on web and desktop the device asks for account memory and injects it itself (useChatStream.ts:4479); in own-key and Local modes content outside Managed storage is never saved to user_memories (trust_mode_outside_managed_storage, managed-memory-context-service.ts:540,654).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for the term list and for Cloud memory. Mobile Local memory needs none. |
| Permissions | Workspace policy can close memory entirely (managed-memory-context-service.ts:115). The person controls their own switches. |
| Subscription | none found in the code for these rules. |
| Limits and metering | At least 3 characters per term and at most 50 terms per account (the 100-character cap is a web input limit only; the server does not enforce it: MemoryExclusions.tsx:186, managed-memory-context-service.ts:283-298); 30 memories and 8,000 characters per prompt; at most 5 automatic memories per turn (managed-memory-context-service.ts:67-72 MAX_AUTO_MEMORIES_PER_TURN); mobile reads up to 5 local facts per turn (chatExecutionStore.ts retrieveMemoryContext(content, 5)) only when memory reads are enabled and the app, not the server, assembles the context (chatExecutionStore.ts:2798-2803); in Cloud mode the server builds the context. |
| Feature flags | AGI_MODEL_MEMORY_EXTRACTION for model-based auto extraction; user switches memory, generateFromHistory, searchPastChats, includeSensitiveTopics, allowToolAssistedGeneration (readUserMemoryCapabilities, managed-memory-context-service.ts:258). |
| Model compatibility | Same for every model; no capability check was found. Tool-assisted memory generation has its own switch. |
| Provider restrictions | Memory is not saved from turns in own-key or Local trust modes (managed-memory-context-service.ts:654). Content tied to Google user data is excluded from memory reads (managed-memory-context-service.ts:1170 memoryFreeOfGoogleUserDataSql). |
| Local mode | Mobile Local mode keeps memory on the device, always refuses credential-like and other prohibited facts, refuses sensitive topics only for learned (automatic) saves unless the person opted in (explicit saves of sensitive topics go through), skips memory in temporary chats, and has no never-remember term check (localMemoryWriter.ts:30-39). CLI Local sessions do not receive account memory; only Managed sessions do (apps/cli/src/cloud/memory.rs:1-7). Desktop Tauri has a Local-mode temporary chat that skips memory (apps/desktop/src/features/chat/useTemporaryChat.ts:1-15). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Exclusion list unreadable | Write refused: 'Could not read your never remember list, so nothing was saved.' | memory-write-service.ts:39-41 |
| Term too short or list full | Messages 'Enter at least 3 characters...' and 'You can store up to 50 exclusions.' | MemoryExclusions.tsx:135,144 |
| Term longer than 100 characters | The web input stops at 100 characters; the server enforces no maximum, so the CLI and VS Code can write longer terms | MemoryExclusions.tsx:186; managed-memory-context-service.ts:289-298 |
| Existing memory contains a new term | Stays until deleted | MemoryExclusions.tsx:162 copy |
| Temporary chat and forget | Forget allowed, remember refused | memory-commands.ts:71 |
| Memory off | Nothing read, nothing saved; existing memories stay | MemorySection.tsx:60 MEMORY_DISABLED_CONTRACT; managed-memory-context-service.ts:1140 |
| Context source fails to load | Turn continues without it and logs a warning | turn-context-service.ts:170-180 |
| Offline | Web local-model turns keep cached personal context if refresh fails | apps/web/features/chat/lib/local-personal-context.ts (catch comment 'An offline refresh must not expire still-owned personal context') |
| Memory citations with more facts than listed | Panel says 'And N more' | ResearchPanel.tsx:156-185 |
| Accessibility | Mobile chip has a spoken label naming the count; web section has aria-label Memory | MemoryUsedChip.tsx; ResearchPanel.tsx:159 |
| Mobile temporary chat set to Unpersonalized | personalization false forces memory off on the server; the banner says profile, instructions and response style are also left out | request-processor.ts:3523; chatExecutionStore.ts:3453,5216; TemporaryChatBanner.tsx:19-20 |
| Desktop Tauri temporary chat | Local-mode incognito conversation, not written to SQLite, memory skipped by the native runtime; switch works only on an empty chat | apps/desktop/src/features/chat/useTemporaryChat.ts:1-15 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/memory/__tests__/exclusion-enforcement.test.ts`: Refuses excluded content on create and on edit, still saves clean content, leaves pin toggles alone, drops excluded items in bulk
- `apps/web/lib/services/__tests__/memory-exclusions.test.ts`: Never-remember term logic (file exists; titles not read)
- `apps/web/lib/services/__tests__/memory-eligibility-gate.test.ts`: Eligibility gate (file exists; titles not read)
- `packages/contracts/context/src/__tests__/memory-content-policy.test.ts`: Prohibited and sensitive content rules
- `packages/contracts/context/src/__tests__/memory-content-policy.redos.test.ts`: Rule patterns resistant to slow-match input
- `apps/web/lib/services/__tests__/memory-commands.test.ts`: Explicit remember and forget
- `apps/web/lib/__tests__/temporary-chat-policy.test.ts`: Temporary chat policy
- `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx`: Composer in temporary chat
- `apps/web/features/settings/components/__tests__/MemoryExclusions.sources.test.tsx`: Source suppression controls
- `apps/web/features/chat/components/messages/MessageBubble.sources.test.tsx`: Memory sources on message bubble
- `apps/mobile/__tests__/MemoryExclusionsScreen.test.tsx`: Mobile Never remember screen
- `apps/mobile/__tests__/TemporaryChatBanner.test.tsx`: Mobile banner
- `apps/mobile/src/features/chat/components/__tests__/MemoryUsedChip.test.tsx`: Mobile used-memory chip
- `apps/web/app/api/cron/purge-temporary-chats/route.test.ts`: Purge job for temporary chats
- `apps/web/app/api/memory/__tests__/workspace-lifecycle.test.ts`: Sync and write refusal when workspace memory is off

**Test scenarios**

- **Never remember term**
  1. Settings, Memory, Never remember, add 'home address'.
  2. Type a memory 'my home address is 5 Elm Street'.
  - Expected: Not saved; message names the term.
- **Credential refusal**
  1. Tell the assistant to remember a password-like string in a normal chat, then use the Add memory box with the same text.
  - Expected: Both refused as a credential; nothing listed.
- **Temporary chat**
  1. Start a temporary chat on web.
  2. Say 'Remember that I like tea'.
  3. Ask 'what do I like' in the same chat and then in a normal chat.
  - Expected: Nothing is saved; no memory is used; Memory is not offered in the composer.
- **Memory used indication**
  1. Save 'I work in logistics'.
  2. In a normal chat ask for career advice.
  3. Open the reply's Memory · N.
  - Expected: The saved fact is listed; Manage memory opens Settings, Memory. Repeat on mobile for the chip.
- **Same memory on two models**
  1. Pick one model and ask 'what do you know about me'.
  2. Pick another model and repeat.
  - Expected: Both answers draw on the same saved facts.
- **Cross-surface**
  1. agi memory add 'prefers metric units'.
  2. Open web Settings, Memory and VS Code memory tree.
  - Expected: The fact appears in both.
- **Mobile Local never-remember (expected failure)**
  1. Add a term in Never remember in Cloud mode.
  2. Switch to Local mode and save a fact containing it.
  - Expected: Likely saved, because the Local writer has no term check; record the result.
- **Desktop Tauri temporary chat**
  1. In Local mode on desktop Tauri, switch on temporary chat in an empty chat.
  2. Tell the assistant a fact to remember.
  - Expected: The conversation is not stored and the native runtime skips memory (apps/desktop/src/features/chat/useTemporaryChat.ts:1-15); not run.

**Where to look when it fails**

- Refusal codes in the gate: prohibited_content_category, temporary_chat, user_memory_disabled, sensitive_topic_not_opted_in, organization_memory_disabled, source_class_cannot_generate_memory, trust_mode_outside_managed_storage (managed-memory-context-service.ts:533-541).
- Log 'Memory exclusion read failed; refusing the write'; 'Managed memory load failed; continuing without account memory'.
- Span memory.context.load attributes retrieval.skipped memory_disabled and retrieval.result_count.
- Tables user_settings (memory namespace), user_memories, web_conversations.is_temporary.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)
- VS Code: [70-qa/test-plans/vscode/039-memory-product.md](../../70-qa/test-plans/vscode/039-memory-product.md)
- Chrome: [70-qa/test-plans/chrome/039-memory-product.md](../../70-qa/test-plans/chrome/039-memory-product.md)

## 10. Gaps and dependencies

- **Mobile Local mode ignores the never-remember terms** Affects: Mobile Local users. Evidence: localMemoryWriter.ts:30-39; excludedTerms only in memory-exclusions.tsx. Work needed: Keep a device copy of the list and check it in the local writer
- **No never-remember UI in desktop Tauri and Chrome** Affects: Desktop Tauri and Chrome users. Evidence: No exclusion code in apps/desktop/src or apps/extension/src. Work needed: Add the control or link to web
- **No temporary-chat exclusion in CLI and VS Code; Chrome unverified** Affects: CLI, VS Code, Chrome users. Evidence: Only --no-memory in CLI (lib.rs:6691). Work needed: Add a temporary mode or verify and document Chrome
- **Memory-used indication missing in CLI, VS Code, Chrome and desktop Tauri** Affects: Those apps. Evidence: Grep for memoryCitations found only web and mobile code. Work needed: Render citations from the reply metadata
- **Brief says mobile lacks the memory-used indication** Affects: Brief readers. Evidence: MemoryUsedChip.tsx:13. Work needed: Correct the brief
- **Brief says all six apps have never-remember with refusal; UI exists on four apps and enforcement is server-side** Affects: Status reporting. Evidence: see where to find it. Work needed: Regrade
- **Exclusion check on existing memories does not remove them** Affects: All users. Evidence: MemoryExclusions.tsx:162 copy. Work needed: Offer to review existing matches

**Depends on**

- SYS-security-and-privacy
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-sync-and-continuity
- SYS-execution-boundaries
- SYS-local-inference
- SYS-authorization-and-workspaces
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:local
- mode:own-key
- mode:cloud
- table:user_memories
- table:user_settings
- table:web_conversations
- api:POST /api/memory
- api:POST /api/memory/sync
- api:GET /api/memory/local-context
- F039-09
- F039-10

## Unknown

- Whether the Chrome temporary chat reaches the server as a temporary conversation for memory purposes (inferred only).
- Whether the Electron desktop shows web never-remember and memory-used UI (inferred from AGENTS.md).
- What the mobile Personalized option adds in a temporary chat beyond instructions (the server memory-off effect and the banner's Unpersonalized exclusions are traced).
- Whether CLI sessions record any memory when --no-session-persistence is set (not traced).
- Which provider serves automatic extraction in production.
- Titles of memory-exclusions.test.ts and memory-eligibility-gate.test.ts were not read.
- No tests were run.

## Second reader's check

A second reader checked 12 statements of this page against the code: 7 correct, 4 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Limits: 50 terms of 3 to 100 characters; 30 memories and 8,000 characters per prompt; at most 5 automatic memories per turn; mobile reads 5 facts per local turn" The code shows: MAX_MEMORIES=30, MAX_TOTAL_MEMORY_CHARS=8000 and MAX_AUTO_MEMORIES_PER_TURN=5 are right (lines 67-72). The 50 and 3 limits are right. The 100-character limit exists only as maxLength={100} on the web input; the server normalizer sets no maximum length. Mobile retrieveMemoryContext(content, 5) is right, but it runs only when memory reads are enabled and !serverAssemblesContext. In Cloud mode the server builds the context instead. (managed-memory-context-service.ts:67-72,283-298; MemoryExclusions.tsx:186; chatExecutionStore.ts:2798-2803). **Corrected:** Terms must be at least 3 characters, with at most 50 per account. The 100-character cap is a web input limit only and the server does not enforce it. Mobile reads up to 5 local facts per turn only when the app, not the server, assembles the context.
- **Partly wrong (section 6/7):** "Local mode: mobile Local refuses credentials and sensitive topics and has no never-remember term check; CLI Local sessions get no account memory, only Managed ones" The code shows: localMemoryWriter always refuses prohibited categories. It refuses sensitive topics only when source==='learned' and includeSensitiveTopics!==true, so explicit saves of sensitive topics go through. It has no term check, and excludedTerms is used only in memory-exclusions.tsx. The CLI header says only a Managed session's prompt carries account memory, which is right. (apps/mobile/src/features/memory/services/localMemoryWriter.ts:30-39; apps/cli/src/cloud/memory.rs:1-7). **Corrected:** Mobile Local refuses credential-like and other prohibited facts for every source. It refuses sensitive topics only for learned (automatic) saves unless the person opted in. It does not check the never-remember list.
- **Partly wrong (section 2/3/10):** "Desktop Tauri: no never-remember list found; temporary-chat coverage lists only web, mobile and Chrome" The code shows: No exclusion UI exists in apps/desktop/src. Desktop does have a Local-mode temporary chat: useTemporaryChatControl creates an incognito conversation that is never written to SQLite, and its comment says the native runtime skips memory for it. The page never mentions it, and acceptance criterion 4 covers only web and mobile. A Memory settings tab also exists (features/settings/tabs/Memory.tsx) and is not described. (apps/desktop/src/features/chat/useTemporaryChat.ts:1-15). **Corrected:** Add: desktop Tauri has a Local-mode temporary chat (incognito conversation, not stored, memory skipped by the native runtime, switch works only on an empty chat). It has no never-remember list.
- **Partly wrong (section 6/8):** "Temporary chats are purged by a scheduled job; mobile banner says normally deleted after 30 days (purge-temporary-chats/route.ts:30; TemporaryChatBanner.tsx:12)" The code shows: The banner text is right (TemporaryChatBanner.tsx:11-12). In the purge route, RETENTION_DAYS = 30 is at line 24, and line 30 is the GET handler's start. The queries I read (lines 45, 98, 105) filter candidate and job tables by created_at. I did not trace a delete of web_conversations with is_temporary, so the purge claim is not confirmed by the lines read. (apps/web/app/api/cron/purge-temporary-chats/route.ts:24,30,45,98; TemporaryChatBanner.tsx:11-12). **Corrected:** Cite route.ts:24 for the 30-day RETENTION_DAYS constant, and confirm that the job deletes web_conversations rows with is_temporary before stating it.

**Facts the page missed**

- Mobile Personalized or Unpersonalized in a temporary chat: the page lists it as not traced. A request with personalization === false forces memory_enabled = false (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3523). The mobile store sends personalization from temporaryChatPersonalized (apps/mobile/stores/chat/chatExecutionStore.ts:3453,5216). The banner says Unpersonalized also leaves out profile, instructions and response style (apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:19-20).
- Desktop Tauri has a Local-mode temporary chat (apps/desktop/src/features/chat/useTemporaryChat.ts:1-15) and a Memory settings tab (apps/desktop/src/features/settings/tabs/Memory.tsx). The page describes neither.
- The server-side never-remember term check has no length cap. The 100-character limit exists only on the web input (apps/web/features/settings/components/MemoryExclusions.tsx:186). normalizeMemoryExclusions (apps/web/lib/services/managed-memory-context-service.ts:289-298) enforces only the 3-character minimum and the 50-term maximum, so the CLI and VS Code can write longer terms.
