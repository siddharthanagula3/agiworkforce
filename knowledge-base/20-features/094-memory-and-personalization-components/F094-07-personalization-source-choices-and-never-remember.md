---
id: "F094-07"
type: "feature"
title: "Personalization source choices and never-remember rules"
aliases: ["Never remember", "Where memories come from", "Suppress: Automatically captured from chats", "MemoryExclusions", "memory exclusions", "excludedTerms", "suppressedSources", "Temporary chat", "incognito", "Exit incognito", "Use incognito", "personalization source selection", "sensitive-data exclusion rules", "temporary-conversation exclusions"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.17", "S94.19", "S94.20"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud", "mode:local", "table:user_memories", "table:user_settings", "table:web_conversations", "api:GET /api/settings/preferences", "api:POST /api/memory", "api:POST /api/memory/sync", "api:POST /api/memory/import", "api:GET /api/search", "api:GET /api/memory/local-context", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "F094-08", "F094-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-07 Personalization source choices and never-remember rules

Account memory has three guards. A person can switch off whole sources of memory (auto-captured, web, desktop, mobile). They can list words memory must never keep. A temporary chat is kept out of memory, past-chat recall, search and history. The server enforces all three. Web and mobile show the controls.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.17](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9417), [S94.19](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9419), [S94.20](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9420).

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

**What it does.** Lets a person decide what the account memory may contain and what it may use in replies. (1) Source choices: a suppressed source stays saved but is left out of answers (apps/web/features/settings/components/MemoryExclusions.tsx:295). (2) A never-remember list: a new memory containing a listed term is refused on write (apps/web/lib/services/memory-write-service.ts:44). (3) Credential, payment and similar patterns are refused on write whatever the list says (apps/web/lib/services/managed-memory-context-service.ts:570). (4) A temporary chat is excluded from learning, recall, search and history.

**Why it exists.** Memory is only trustworthy if people can bound it. Competing assistants offer memory controls and incognito chats; this feature gives AGI Workforce the same, with the rule kept on the server so every app obeys it. [inferred] (the project's AGENTS.md section 10 says the leaders are the reference, doc: AGENTS.md)

**Who uses it.** Any signed-in person who uses memory on the web, mobile (Cloud mode), VS Code or CLI, and anyone who starts a temporary chat. Workspace admins also gate memory as a whole (apps/web/lib/services/managed-memory-context-service.ts:640).

**Problems it solves**

- A person does not want a client name, address or health detail remembered.
- A person wants memories from one device or from automatic capture ignored without deleting them.
- A person wants a throwaway chat that leaves no trace in memory, search or history.
- Secrets and card numbers must never end up in stored memory.

**Use cases**

- Add 'my home address' to Never remember so that no later chat can save it.
- Tick 'Suppress: Automatically captured from chats' to answer only from memories the person saved by hand.
- Start a temporary chat to ask a private question; it is not saved to history and is skipped by memory and search.
- Run `memory never --add salary` in the CLI so the web and mobile apps also refuse memories that mention it.

## 2. User experience

**Where to find it**

- Web: Settings > Personalization, Memory block; the section renders <MemoryExclusions /> with headings 'Never remember' and 'Where memories come from' (apps/web/features/settings/sections/MemorySection.tsx:497; apps/web/features/settings/components/MemoryExclusions.tsx:162,295). A saved /settings/memory link opens Personalization (apps/web/features/settings/lib/web-settings-sections.ts:50).
- Mobile (Cloud mode only): Settings > Memory > 'Never remember' row, which opens a screen titled 'Never remember' (apps/mobile/app/(app)/settings/memory.tsx:568; apps/mobile/app/(app)/settings/memory-exclusions.tsx:161). The row is hidden when the app is not in Cloud mode (memory.tsx:568).
- VS Code: command 'agi-workforce.memory' quick pick item 'Never remember…' (apps/extension-vscode/src/core/commandSetup.ts:1961). Terms only; no source switches.
- CLI: `memory never [--add <term>] [--remove <term>]` (apps/cli/src/lib.rs:1484). Terms only.
- Temporary chat on web: composer menu item for temporary chat, labels 'Temporary chat', 'Use incognito', 'Exit incognito' (apps/web/lib/temporary-chat-policy.ts:1-5; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6137).
- Temporary chat on mobile: Settings chat privacy switch 'Temporary Chat' (apps/mobile/src/features/settings/cloud-privacy/ChatPrivacyScreen.tsx:39).
- Temporary chat on desktop: header switch, shown in Local mode only (apps/desktop/src/features/chat/useTemporaryChat.ts:50); Cloud mode reads a saved temporaryChat preference (apps/desktop/src/services/cloudChat.ts:229).
- Desktop and Chrome extension: no never-remember or source-suppression control found (search of apps/desktop/src and apps/extension/src for excludedTerms, suppressedSources and Never remember found nothing).

**Before you start**

- A signed-in AGI account; the lists are read and saved through the account preferences endpoint (apps/web/app/api/settings/preferences/route.ts:140).
- Memory switched on for the lists to matter: memory is on only when capabilities.memory is true (apps/web/lib/services/managed-memory-context-service.ts:255).
- On mobile, Cloud mode (apps/mobile/app/(app)/settings/memory.tsx:568).

**Screens and controls**

- Web 'Never remember': a text box (placeholder 'e.g. my home address', aria-label 'Term to never remember', max 100 characters), an 'Add' button, removable chips with aria-label 'Stop excluding <term>' (apps/web/features/settings/components/MemoryExclusions.tsx:200-213).
- Web 'Where memories come from': four checkboxes labelled 'Suppress: Automatically captured from chats', 'Suppress: Saved on the web app', 'Suppress: Saved on Desktop', 'Suppress: Saved on mobile' (MemoryExclusions.tsx:25-30,330).
- Mobile: same text box with 'Add' button, chips with 'Stop excluding <term>' buttons, and four switches under 'WHERE MEMORIES COME FROM'; a switch ON means the source is used (apps/mobile/app/(app)/settings/memory-exclusions.tsx:302-320).
- Limits shown to the person: at least 3 characters and at most 50 terms (MemoryExclusions.tsx:135-146).

**Journey**

1. Open Settings > Personalization (web) or Settings > Memory > Never remember (mobile).
2. Wait for the list to load; controls stay disabled until it has loaded and while a save runs (MemoryExclusions.tsx:62-63).
3. Type a term and press Enter or 'Add'; the term is trimmed and lower-cased, saved, and shown as a chip (MemoryExclusions.tsx:125-150).
4. Tick a 'Suppress' box (web) or turn a source switch off (mobile); the change is saved at once (MemoryExclusions.tsx:121-128).
5. Chat. On later turns the server leaves suppressed-source memories out of the reply context, and refuses to save a memory that contains a listed term.
6. To keep one chat out of memory, search and history, turn on temporary chat before the first message; the switch is only allowed on an empty chat (apps/desktop/src/features/chat/useTemporaryChat.ts:21-24).

**What the person sees and gets**

- Explanatory copy: 'New memories with these terms are discarded. Existing memories stay until you delete them.' and 'Suppressed sources stay saved but are kept out of answers.' (MemoryExclusions.tsx:165,297).
- Empty list: 'No exclusions yet. Everything the assistant learns is eligible to be remembered.' (MemoryExclusions.tsx:228).
- Refused write message: 'Not saved. This memory contains "<term>", which you asked AGI never to remember.' returned as HTTP 403 (apps/web/lib/services/memory-write-service.ts:25-33).
- Unreadable list message: 'Could not read your never remember list, so nothing was saved.' (memory-write-service.ts:41).
- Credential or card refusal: 'Memory never stores a password, key or token, so I left that out.' and the matching text for payment cards (packages/contracts/context/src/memory-content-policy.ts:553-565).
- Temporary chat copy on web: 'Stays out of your history, search, memory and Library.' (apps/web/lib/temporary-chat-policy.ts:42-43); composer memory control title 'Temporary chats never read or save memory.' (ChatComposerNew.tsx:6137).
- CLI prints 'Never remember anything mentioning (<n>): ...' and 'Not kept (too short, or the list is full): ...' (apps/cli/src/cloud/personalization.rs:355-376).

**Settings**

- Account preference namespace 'memory' with keys excludedTerms and suppressedSources (apps/web/lib/services/managed-memory-context-service.ts:299-351).
- Capabilities flags memory, generateFromHistory, allowToolAssistedGeneration, searchPastChats, includeSensitiveTopics (managed-memory-context-service.ts:255-281). Web labels: 'Save memories from chats', 'Search past chats', 'Include sensitive topics in memory' (apps/web/features/settings/sections/MemorySection.tsx:395-422).
- Per-chat memory toggle in the composer (ChatComposerNew.tsx:6133).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Terms list: normalised on read (trim, lower-case, minimum 3 characters, maximum 50, duplicates dropped) (apps/web/lib/services/managed-memory-context-service.ts:283-297).
- Suppressed sources are normalised to the known set mobile, desktop, web, auto (managed-memory-context-service.ts:317-333) and applied in the SQL read of memories as `coalesce(source,'web') <> all(...)` on every load (managed-memory-context-service.ts:1152-1177).
- The chat turn loads suppressed sources before building memory context, for any turn that includes memory (apps/web/lib/services/turn-context-service.ts:145-157). If memory context cannot be assembled the turn continues without memory (turn-context-service.ts:322-327; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4253-4262).
- Suppressed sources are also honoured by the model memory tools (apps/web/lib/server/tools/memory-tools.ts:203-220) and by live voice (apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts:275-283) and by the browser-local turn context endpoint (apps/web/app/api/memory/local-context/route.ts:25; turn-context-service.ts:419).
- Suppressing 'auto' also stops automatic capture: persistManagedAutoMemoryFacts returns zero inserts (managed-memory-context-service.ts:1372-1379).
- Never-remember list applied on every write path: manual create (apps/web/app/api/memory/route.ts:148), edit (apps/web/app/api/memory/[id]/route.ts:110), restore (apps/web/app/api/memory/[id]/restore/route.ts:40), bulk import (apps/web/app/api/memory/import/route.ts:116), device sync push (apps/web/app/api/memory/sync/route.ts:170), explicit remember commands and model tool saves (apps/web/lib/services/memory-commands.ts:112-123; memory-tools.ts:296-298), and automatic capture (managed-memory-context-service.ts:1371-1396).
- If the list cannot be read, single writes and batch writes are refused with an internal error and an error log (memory-write-service.ts:35-42). A sync push that only deletes is never blocked (memory/sync/route.ts:180-182).
- Credential, payment card, government identifier, biometric, precise location, criminal history and immigration status content is refused for every write through writeConsolidatedMemory, regardless of the list or of an explicit ask (managed-memory-context-service.ts:570-584,721-742; packages/contracts/context/src/memory-content-policy.ts:1-9). Sensitive topics (health, ethnicity, religion, politics, orientation, gender identity, union membership) are refused unless the person asks explicitly or turns on 'Include sensitive topics in memory' (managed-memory-context-service.ts:613-622).
- Temporary chat, server side: memory context is not loaded (turn-context-service.ts:121-124); automatic learning is off (request-processor.ts:2392-2404); the memory tool is not offered (request-processor.ts:1123-1146); past-chat recall is off (turn-context-service.ts:127-128); a temporary conversation is excluded from past-chat queries (apps/web/lib/services/past-chat-context-service.ts:256,345,523), from the search route (apps/web/app/api/search/route.ts:324,359,375), from the retrieval index (apps/web/lib/services/retrieval-search-service.ts:270,363), from memory sync origin links (apps/web/app/api/memory/sync/route.ts:72) and from the recap (apps/web/lib/services/reflect-service.ts:327).
- History: persisting a message into a temporary conversation is refused with 'Messages in a temporary chat are not saved.' (apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:80; apps/web/lib/temporary-chat-policy.ts:9); the assistant turn is not persisted server side (apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:253-257); the conversation list hides temporary conversations (apps/web/app/api/chat/conversations/route.ts:81).
- A purge job deletes temporary conversations older than 30 days unless a legal hold applies (apps/web/app/api/cron/purge-temporary-chats/route.ts:23,45; vercel.json:26).
- Mobile screen with load retry, save error and cloud-only visibility (apps/mobile/app/(app)/settings/memory-exclusions.tsx:75-110,237-249). VS Code and CLI edit the term list through the same preferences endpoint (apps/extension-vscode/src/memory/memoryExclusions.ts:77; apps/cli/src/cloud/personalization.rs:330-362).
- Desktop Local-mode temporary chat: never written to SQLite, and the native runtime skips memory for it (apps/desktop/src/features/chat/useTemporaryChat.ts:11-16; apps/desktop/src/runtime/TauriRuntime.ts:775-778).

**Incomplete**

- Scheduled runs and the Slack assistant build their memory loader without suppressed sources, so a suppressed source is still read there (apps/web/lib/services/scheduled-agent-executor.ts:431-436; apps/web/lib/slack/slack-assistant-turn.ts:189-194). The default passed is an empty list (managed-memory-context-service.ts:1152).
- The memory namespace is saved as free-form data; the server does not validate terms on save, only on read. A term shorter than 3 characters sent from VS Code is saved but silently dropped on read; VS Code does not check the length (apps/extension-vscode/src/memory/memoryExclusions.ts:62-66; managed-memory-context-service.ts:286-297). The 100-character term limit exists only in the web and mobile inputs (MemoryExclusions.tsx:197; memory-exclusions.tsx:23).
- The term match is a plain case-insensitive substring match, with no word boundary (managed-memory-context-service.ts:353-359).

**Present but disconnected or switched off**

- Existing memories that already contain a listed term are still read into replies; the list only filters new writes (copy at MemoryExclusions.tsx:165; no term filter in the read query at managed-memory-context-service.ts:1170-1183).

**Not available**

- Desktop app: no never-remember or suppress-source controls found.
- Chrome extension: no never-remember or suppress-source controls found.
- VS Code and CLI: no control for suppressed sources (apps/extension-vscode/src/memory/memoryExclusions.ts; apps/cli/src/cloud/personalization.rs).
- Mobile and desktop Local mode: the account lists are not shown (mobile hides the row outside Cloud mode, memory.tsx:568); whether on-device memory honours them is unknown.

## 4. Required behaviour

**Established requirements**

- Suppressed sources are read on every memory load, so a suppressed source is not used in replies; enforcement is in the read path. (source: S94.17 (brief), code apps/web/lib/services/managed-memory-context-service.ts:1152-1177)
- A memory whose text contains a never-remember term is refused on write with a message naming the term; an unreadable list refuses the write. (source: S94.19 (brief); apps/web/lib/services/memory-write-service.ts:25-42)
- Credential and payment-instrument patterns are refused on write regardless of the list. (source: S94.19 (brief); packages/contracts/context/src/memory-content-policy.ts:106-126)
- Temporary chats are excluded from past-chat queries, search, retrieval search, memory sync and the history save; the recap also excludes them. (source: S94.20 (brief); apps/web/lib/temporary-chat-policy.ts:13-21 (the policy comment lists which code keeps each clause))
- The project says its web apps follow the leaders' memory and incognito behaviour and that stricter rules win when sources disagree. (source: doc: AGENTS.md section 10 (competitor policy))

**Acceptance criteria**

1. With 'auto' suppressed, a memory saved by automatic capture is not in the model context of the next web chat turn, and no new automatic memory is stored.
2. With a term 'salary' listed, 'Remember that my salary is high' is refused and the reply names 'salary'; the same text through import and sync push is also rejected.
3. With the list unreadable (simulated read failure), a manual memory save fails with the 'nothing was saved' message and no row is created.
4. A memory text containing a card number or 'password is ...' is refused even when the never-remember list is empty.
5. In a temporary chat, nothing is added to memory, the conversation does not appear in the conversation list or in /api/search, and sending a message save to history returns the 'not saved' conflict.
6. Removing a term or un-suppressing a source takes effect on the next turn without restart.
7. Terms under 3 characters are rejected in the web and mobile UI with the 'Enter at least 3 characters' message; the 51st term is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same account lists should apply to every client that talks to account memory, because the list lives in account settings and the VS Code placeholder says 'on every client' (apps/extension-vscode/src/memory/memoryExclusions.ts:51). [inferred]
- Suppression should also apply to unattended runs, because the brief says the choice 'is enforced'. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass loadSuppressedMemorySources into scheduled runs and the Slack assistant loaders.
- [proposed] Validate the memory preference namespace on save (min and max length, count) so all clients get the same answer.
- [proposed] Add never-remember and source controls to the desktop Cloud-mode Memory tab and to the Chrome extension, or state why not.
- [proposed] Offer to review or delete existing memories that contain a newly added term.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MemoryExclusions | `apps/web/features/settings/components/MemoryExclusions.tsx` | Web settings UI for the term list and the four source checkboxes |
| screen | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Hosts MemoryExclusions beside the memory switches |
| screen | MemoryExclusionsScreen | `apps/mobile/app/(app)/settings/memory-exclusions.tsx` | Mobile 'Never remember' screen with terms and source switches |
| command | manageMemoryExclusions | `apps/extension-vscode/src/memory/memoryExclusions.ts` | VS Code quick pick to add or remove terms |
| command | never_remember | `apps/cli/src/cloud/personalization.rs` | CLI `memory never` term editing |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Reads exclusions and suppressed sources, filters memory reads, gates writes, automatic capture |
| service | memory-write-service | `apps/web/lib/services/memory-write-service.ts` | assertMemoryWriteAllowed and partitionMemoryWrites; refusal messages |
| service | memory-commands | `apps/web/lib/services/memory-commands.ts` | Explicit remember/forget commands check the list first |
| service | memory-tools | `apps/web/lib/server/tools/memory-tools.ts` | Model memory tools: suppressed sources on read, eligibility on save |
| service | turn-context-service | `apps/web/lib/services/turn-context-service.ts` | Chat-turn context: loads suppressed sources, leaves memory and recall out of temporary turns |
| config | memory-content-policy | `packages/contracts/context/src/memory-content-policy.ts` | Prohibited and sensitive content rules and their refusal messages |
| config | temporary-chat-policy | `apps/web/lib/temporary-chat-policy.ts` | Temporary chat labels, copy and the list of clauses the code keeps |
| endpoint | POST/PATCH /api/memory, /api/memory/[id], restore, import, sync | `apps/web/app/api/memory/route.ts` | Write routes that call the never-remember gate (also [id]/route.ts, [id]/restore/route.ts, import/route.ts, sync/route.ts) |
| endpoint | /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores the 'memory' namespace (excludedTerms, suppressedSources) |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Personal context for browser-local turns, with suppression applied |
| endpoint | GET /api/search | `apps/web/app/api/search/route.ts` | Search that filters out temporary conversations |
| service | retrieval-search-service | `apps/web/lib/services/retrieval-search-service.ts` | Retrieval index queries that skip temporary origins |
| service | past-chat-context-service | `apps/web/lib/services/past-chat-context-service.ts` | Past-chat recall queries with is_temporary filters |
| job | purge-temporary-chats | `apps/web/app/api/cron/purge-temporary-chats/route.ts` | Daily purge of temporary conversations older than 30 days |
| service | persist-message | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Refuses to save a message into a temporary conversation |
| hook | useTemporaryChatControl | `apps/desktop/src/features/chat/useTemporaryChat.ts` | Desktop Local-mode temporary chat switch |
| table | user_memories | `apps/web/db/neon/0010_memory.sql` | Stores memories with a source column that suppression filters on |
| table | user_settings | `apps/web/lib/services/managed-memory-context-service.ts` | Holds settings.memory (lists) and settings.capabilities (switches); read by SQL at lines 255-261 and 299-310 |
| table | web_conversations | `apps/web/db/neon/0050_temporary_chat_retention.sql` | is_temporary column and its purge index |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person edits the list or a source box in Settings; the app saves it as the 'memory' preference namespace. | device and our servers | apps/web/features/settings/components/MemoryExclusions.tsx:99-118; apps/web/app/api/settings/preferences/route.ts:192-222 |
| On a chat turn the server reads the memory switches, then (if memory is included) the suppressed sources and project scope, and builds memory context from user_memories excluding suppressed sources. | our servers | apps/web/lib/services/turn-context-service.ts:117-157; managed-memory-context-service.ts:1128-1195 |
| A temporary conversation skips memory and past-chat loading and writes no context manifest. | our servers | turn-context-service.ts:121-128,198 |
| After the turn, automatic capture extracts at most 5 candidate facts, drops those matching a listed term, applies content and policy checks and writes survivors with source 'auto'. | our servers | request-processor.ts:2408-2417; managed-memory-context-service.ts:1343-1439 |
| A manual, imported, synced or tool-saved memory passes the never-remember check, then writeConsolidatedMemory applies the content and policy gate before the row is stored. | our servers | apps/web/app/api/memory/route.ts:148-169; memory-write-service.ts:44-72; managed-memory-context-service.ts:742 |
| Search, past-chat recall, retrieval and the conversation list add is_temporary = false filters; saving a message to a temporary conversation is refused. | our servers | apps/web/app/api/search/route.ts:324; past-chat-context-service.ts:256; persist-message.ts:80 |
| A nightly job deletes temporary conversations older than 30 days unless held. | our servers | apps/web/app/api/cron/purge-temporary-chats/route.ts:23-45; vercel.json:26 |
| Desktop Local mode: a temporary chat is answered by the native runtime with a temporary history and never written to the local database. | device | apps/desktop/src/runtime/TauriRuntime.ts:775-778,1258-1262 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| excludedTerms and suppressedSources lists | user_settings.settings.memory in the account database | Held on the server; every client reads it from the preferences endpoint (apps/web/app/api/settings/preferences/route.ts:140-160) | Kept until the person edits it; no expiry found in the code |
| Memory rows with a source of web, desktop, mobile or auto | table user_memories | Yes, across devices through the memory sync endpoint (apps/web/app/api/memory/sync/route.ts) | Suppression does not delete rows (MemoryExclusions.tsx:297). Deleted rows keep a tombstone with empty text (managed-memory-context-service.ts:379-380) |
| Temporary conversation row | table web_conversations with is_temporary = true | Hidden from the list and search | Purged after 30 days (purge-temporary-chats/route.ts:23) |

**Models and providers.** No model or provider takes part in enforcing these rules; they run in plain database queries and pattern checks on our servers. The chosen model only sees the memories that passed them. Memory facts for automatic capture are extracted by pattern code (request-processor.ts:2415); whether a second, model-based extractor also runs is covered by a separate feature and is unknown here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account is needed; the lists live in account settings and are read with the signed-in user's scope (apps/web/lib/services/managed-memory-context-service.ts:299-310). VS Code says 'Sign in to AGI Cloud to choose what your memory never keeps.' (apps/extension-vscode/src/memory/memoryExclusions.ts:30). |
| Permissions | Workspace policy can turn memory off for members (managed-memory-context-service.ts:635-642). Rows are read through a user-scoped database connection (apps/web/app/api/memory/local-context/route.ts:21). |
| Subscription | none found in the code for the lists, the source switches or the temporary-chat rules. |
| Limits and metering | 50 terms, 3-character minimum (managed-memory-context-service.ts:283-284). The memory read returns at most 30 memories out of 500 candidates and about 8,000 characters (managed-memory-context-service.ts:67-71). The local-context route is rate limited under 'chat-conversation' (local-context/route.ts:14). Temporary chats are purged after 30 days (apps/web/lib/server/temporary-files/retention.ts:8). |
| Feature flags | none found in the code for the lists. Mobile row is shown only in Cloud mode (apps/mobile/app/(app)/settings/memory.tsx:568). |
| Model compatibility | none found in the code; enforcement does not depend on the model. |
| Provider restrictions | none found in the code. |
| Local mode | In Cloud mode the rules run on our servers. In mobile and desktop Local mode the account lists are not shown (mobile hides the row) and the account memory is not read, so the lists do not apply; whether the on-device memory has its own list is unknown. Desktop Local-mode temporary chat keeps nothing in the local database and the native runtime skips memory (apps/desktop/src/features/chat/useTemporaryChat.ts:11-16). Browser-local web turns fetch memory from /api/memory/local-context, which applies suppression and the temporary rule (apps/web/lib/services/turn-context-service.ts:419; packages/contracts/types/src/memory-wire.ts:197-211). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading the list (web) | Controls disabled until loaded; on failure the controls stay disabled and the error 'Could not load exclusions' shows. | apps/web/features/settings/components/MemoryExclusions.tsx:62-63,86-95 |
| Loading the list (mobile) | A loading indicator, then a 'Retry' button on failure. | apps/mobile/app/(app)/settings/memory-exclusions.tsx:75-110,237-249 |
| Empty list | Web shows 'No exclusions yet...'; mobile shows 'No exclusions yet.' | MemoryExclusions.tsx:228; memory-exclusions.tsx:257 |
| Save error | Web shows 'Could not save exclusions'; mobile keeps the typed term so the save can be tried again. | MemoryExclusions.tsx:116; apps/mobile/__tests__/MemoryExclusionsScreen.test.tsx (test 'keeps the typed term when the save fails') |
| Term too short, duplicate or list full | Short term: message 'Enter at least 3 characters'; duplicate: input cleared with no change; 51st term: 'You can store up to 50 exclusions.' | MemoryExclusions.tsx:131-146 |
| Account switched during editing (web) | Edits from a stale owner are ignored. | MemoryExclusions.tsx:98-106 |
| Exclusion list unreadable at write time | Write refused with an error and an error log; nothing saved. | apps/web/lib/services/memory-write-service.ts:35-42 |
| Suppressed source read fails during a chat turn | The turn continues without account memory and logs an error. | apps/web/lib/services/turn-context-service.ts:322-327 |
| Write refused because of a listed term | HTTP 403 body with the named term for the single-write routes; sync push returns a refused entry per id; import counts it. | memory-write-service.ts:29-33; apps/web/app/api/memory/sync/route.ts:171-175; apps/cli/src/lib.rs:4278 |
| Sync push that only deletes | Never blocked, so a device can obey a switch that was turned off. | apps/web/app/api/memory/sync/route.ts:180-182 |
| Temporary chat toggled mid-conversation (desktop) | The switch works only on an empty chat. | apps/desktop/src/features/chat/useTemporaryChat.ts:21-24 |
| Temporary chat in a project | Refused: 'A temporary chat cannot be part of a project...' | apps/web/lib/temporary-chat-policy.ts:56-57; apps/web/app/api/chat/conversations/route.ts:230 |
| Offline | not handled in the code for the settings screens beyond the generic load and save errors. | MemoryExclusions.tsx:86-95 |
| Accessibility | Web input and remove buttons have aria-labels; mobile buttons have accessibilityLabel and 44-point touch targets; error text uses role alert. | MemoryExclusions.tsx:199,236; memory-exclusions.tsx:200-201,225 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/memory-exclusions.test.ts`: Normalisation, bounds, matching, stored-list reads, malformed settings, suppressed-source filtering, auto-capture dropping a matching candidate
- `apps/web/features/settings/components/__tests__/MemoryExclusions.sources.test.tsx`: Web source checkboxes and saving with a pending load
- `apps/web/features/settings/sections/MemorySection.test.tsx`: Memory settings section
- `apps/mobile/__tests__/MemoryExclusionsScreen.test.tsx`: Mobile load failure and retry, adding a term, save failure, empty namespace
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.memory.test.ts`: Chat-turn memory behaviour including a suppressed 'auto' source
- `apps/web/lib/services/__tests__/project-scoped-memory.test.ts`: Project-scoped memory loads with suppressed sources
- `apps/web/lib/services/__tests__/managed-auto-memory-model-extraction.test.ts`: Automatic capture with 'auto' suppressed
- `apps/web/app/api/memory/import/__tests__/route.test.ts`: Bulk import gate
- `apps/web/app/api/memory/sync/__tests__/route.contract.test.ts`: Sync push contract
- `apps/web/__tests__/api/memory-sync-push.test.ts`: Sync push behaviour
- `apps/web/app/api/memory/[id]/restore/__tests__/route.test.ts`: Restore route calls the write gate
- `packages/contracts/context/src/__tests__/memory-content-policy.test.ts`: Prohibited and sensitive content rules
- `apps/web/app/api/chat/conversations/__tests__/temporary-conversation-read-paths.test.ts`: A temporary chat is left out of past-chat recall, project context and the recap
- `apps/web/app/api/chat/conversations/route.temporary-history.test.ts`: Temporary conversations in the history list
- `apps/web/lib/__tests__/temporary-chat-policy.test.ts`: Temporary chat policy copy and rules
- `apps/web/app/api/cron/purge-temporary-chats/route.test.ts`: Purge job
- `apps/web/lib/services/__tests__/retrieval-search-service.test.ts`: Retrieval queries (temporary origin filter among others)
- `apps/web/features/chat/components/Composer/ChatComposerNew.temporaryChat.test.tsx`: Composer temporary chat control
- `apps/cli/src/cloud/personalization.rs`: Inline CLI test that the never-remember list needs an account (line 404)

**Test scenarios**

- **Suppress automatic memories**
  1. On the web, turn on 'Save memories from chats' and say 'I love hiking' so an automatic memory appears.
  2. Tick 'Suppress: Automatically captured from chats'.
  3. Ask 'What do I like to do?' in a new chat.
  - Expected: The reply does not use the automatic memory; the memory is still listed in Settings; no new automatic memory is stored while the box is ticked.
- **Never-remember term refusal**
  1. Add 'home address' to Never remember.
  2. Type 'Remember that my home address is 5 Elm Street'.
  3. Try the same text through manual Add memory and import.
  - Expected: Each path refuses and names 'home address'; no row is created.
- **Credential pattern**
  1. With an empty list say 'Remember that my password is hunter22'.
  - Expected: Refused with 'Memory never stores a password, key or token'.
- **Temporary chat isolation**
  1. Start a temporary chat and send 'Remember that I like tea'.
  2. Open search and the conversation list.
  3. Check Memory settings.
  - Expected: No memory is added, the chat is not in the list or search, and a direct message save returns the 'not saved' conflict.
- **Unreadable list**
  1. In a test, make the user_settings read fail, then POST /api/memory.
  - Expected: Error 'Could not read your never remember list, so nothing was saved.'; nothing stored.
- **Scheduled run honours suppression (expected to fail today)**
  1. Suppress 'auto'.
  2. Create a schedule with 'Saved memories' ticked and run it.
  - Expected: Required: the run output uses no auto memories. Current code passes no suppressed sources, so an auto memory can appear (gap).

**Where to look when it fails**

- Log 'Memory exclusion read failed; refusing the write' (memory-write-service.ts:38).
- Log 'Managed memory load failed; continuing without account memory' and 'Turn context could not be assembled; continuing without account memory or past chats' (turn-context-service.ts:313,322).
- Span 'memory.context.load' attributes retrieval.result_count and retrieval.skipped (managed-memory-context-service.ts:1138-1147).
- HTTP 403 from the memory routes with the 'Not saved' message; 409 'Messages in a temporary chat are not saved.'
- Tables user_settings (settings.memory), user_memories.source, web_conversations.is_temporary.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Scheduled runs and the Slack assistant ignore suppressed sources** Affects: Anyone who suppresses a source and also uses schedules or Slack answers (web account, any app that creates schedules). Evidence: apps/web/lib/services/scheduled-agent-executor.ts:431-436; apps/web/lib/slack/slack-assistant-turn.ts:189-194 pass no suppressedSources. Work needed: Load suppressed sources and pass them to both loaders; add tests.
- **No never-remember or source controls on the desktop and Chrome apps** Affects: Desktop and Chrome users. Evidence: no matches for excludedTerms or suppressedSources in apps/desktop/src or apps/extension/src. Work needed: Add the controls or decide the web link is enough; record the decision.
- **VS Code and CLI cannot set suppressed sources, and VS Code does not check term length** Affects: VS Code and CLI users. Evidence: apps/extension-vscode/src/memory/memoryExclusions.ts:62-77; apps/cli/src/cloud/personalization.rs:330-362. Work needed: Add source switches; validate length client side.
- **The server does not validate the memory preference namespace on save and has no maximum term length** Affects: All clients that save terms. Evidence: apps/web/app/api/settings/preferences/route.ts:27-35 accepts any record; managed-memory-context-service.ts:286-297. Work needed: Validate on save and cap term length.
- **Existing memories containing a new term stay in use** Affects: Web and mobile users who add a term later. Evidence: MemoryExclusions.tsx:165; managed-memory-context-service.ts:1170-1183. Work needed: Decide whether to filter on read or offer a cleanup; this may be intended.
- **Temporary conversation rows live up to 30 days while the copy says nothing is kept** Affects: Web and mobile Cloud users. Evidence: apps/web/app/api/cron/purge-temporary-chats/route.ts:23; apps/web/lib/temporary-chat-policy.ts:50-51. Work needed: Confirm what the row and its files contain and align the copy or the retention.
- **Whether account lists apply to on-device (Local mode) memory is unknown** Affects: Mobile and desktop Local mode. Evidence: mobile row hidden outside Cloud mode (memory.tsx:568); no desktop code found. Work needed: Read the on-device memory write path and state the rule.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud
- mode:local
- table:user_memories
- table:user_settings
- table:web_conversations
- api:GET /api/settings/preferences
- api:POST /api/memory
- api:POST /api/memory/sync
- api:POST /api/memory/import
- api:GET /api/search
- api:GET /api/memory/local-context
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- F094-08
- F094-09

## Unknown

- Whether on-device memory in mobile and desktop Local mode has its own never-remember rules.
- Whether the Chrome extension writes account memory (and so whether the server rules reach it); not searched in depth.
- Whether the second (model-based) automatic extractor checks the list; only the pattern-based path was read in full.
- Whether migration 0285 (memory provenance) has been applied in every environment; its header says draft (apps/web/db/neon/0285_user_memories_provenance.sql:3).
- Whether any test covers the 'Could not read your never remember list' path; none found by name.
