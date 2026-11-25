---
id: "COMP-memory-and-personalization"
type: "competitor-trace"
title: "Memory and personalization"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Memory and personalization: competitors to requirements

Both Claude and ChatGPT ship automatic memory, memory controls, custom instructions, and style settings. ChatGPT also has an editable memory summary, memory Sources, tone and trait sliders, and Mac activity memory. Claude has topics, import and export, and a monthly recap. AGI Workforce covers most memory basics in code. Its gaps are goals, units, writing-style learning, memory-used display on mobile and CLI, and capacity limits. Only Free web memory has been seen working by a person.

**How the products divide this topic.** Claude (chat product, support.claude.com): memory topics, per-project memory, past-chat search, incognito, import and export, a monthly recap, and account-wide Instructions. Memory is on by default for Free, Pro, Max and Ultra; on Team and Enterprise the owner controls it. Claude Code (code.claude.com): separate tool with CLAUDE.md files, auto memory, /memory, rules, output styles, and subagent memory. ChatGPT (help.openai.com, chatgpt.com/pricing): saved memories, chat-history reference, memory summary, Sources, personality presets and trait sliders, and custom instructions of 1,500 characters on Free and Go and 5,000 on paid plans. Codex (learn.chatgpt.com): separate coding tool with local memories (off by default), a global AGENTS.md, and /memories. Computer History on macOS links Codex and ChatGPT, and dots share memory with ChatGPT. Plan and region limits: ChatGPT memory is limited on Free, standard on Go, and expanded on Plus and Pro (chatgpt.com/pricing); chat-history reference is off by default in the EEA, UK, Switzerland, Norway, Iceland and Liechtenstein; Computer History is Pro, Business and Enterprise only; Reflect is beta. Review date 2026-11-22. The catalogue shows no Claude chat feature for styles or tones; Claude's output styles appear only for Claude Code.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-memory-and-personalization-01](#cap-memory-and-personalization-01) | Automatic memory from chats | yes | yes | built | seen working by a person |
| [CAP-memory-and-personalization-02](#cap-memory-and-personalization-02) | Memory master switch and default | yes | yes | partly built | seen working by a person |
| [CAP-memory-and-personalization-03](#cap-memory-and-personalization-03) | Pause and reset memory | yes | yes | partly built | seen working by a person |
| [CAP-memory-and-personalization-04](#cap-memory-and-personalization-04) | View, search, edit, pin and delete saved memories | yes | yes | built | seen working by a person |
| [CAP-memory-and-personalization-05](#cap-memory-and-personalization-05) | Tell the assistant to remember, change or forget | yes | yes | partly built | seen working by a person |
| [CAP-memory-and-personalization-06](#cap-memory-and-personalization-06) | Turn memory off for one chat | yes | partly | partly built | code inspected only |
| [CAP-memory-and-personalization-07](#cap-memory-and-personalization-07) | Temporary or incognito chat | yes | yes | built | code inspected only |
| [CAP-memory-and-personalization-08](#cap-memory-and-personalization-08) | Project-scoped memory | yes | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-09](#cap-memory-and-personalization-09) | Reference past chats | yes | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-10](#cap-memory-and-personalization-10) | Memory sources shown under replies | partly | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-11](#cap-memory-and-personalization-11) | Editable memory summary | no | yes | off by decision | not verified |
| [CAP-memory-and-personalization-12](#cap-memory-and-personalization-12) | Don't mention this again and mark a source not relevant | unknown | yes | not built | not verified |
| [CAP-memory-and-personalization-13](#cap-memory-and-personalization-13) | Sensitive-topic controls and never-remembered data | yes | partly | built | code inspected only |
| [CAP-memory-and-personalization-14](#cap-memory-and-personalization-14) | Import memory from another assistant | yes | unknown | partly built | code inspected only |
| [CAP-memory-and-personalization-15](#cap-memory-and-personalization-15) | Export memory | yes | unknown | partly built | code inspected only |
| [CAP-memory-and-personalization-16](#cap-memory-and-personalization-16) | Memory capacity, automatic clean-up, search and version restore | unknown | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-17](#cap-memory-and-personalization-17) | Memory shared with cloud agent work and dots | yes | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-18](#cap-memory-and-personalization-18) | Global custom instructions | yes | yes | built | code inspected only |
| [CAP-memory-and-personalization-19](#cap-memory-and-personalization-19) | Project instructions | yes | partly | partly built | code inspected only |
| [CAP-memory-and-personalization-20](#cap-memory-and-personalization-20) | Organization-wide instructions and memory admin controls | yes | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-21](#cap-memory-and-personalization-21) | Base style, tone presets and trait sliders | unknown | yes | built | code inspected only |
| [CAP-memory-and-personalization-22](#cap-memory-and-personalization-22) | Custom and learned writing style | unknown | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-23](#cap-memory-and-personalization-23) | Instruction files for coding agents | yes | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-24](#cap-memory-and-personalization-24) | Coding agent auto memory and memory commands | yes | yes | partly built | code inspected only |
| [CAP-memory-and-personalization-25](#cap-memory-and-personalization-25) | Output styles for coding sessions | yes | partly | partly built | code inspected only |
| [CAP-memory-and-personalization-26](#cap-memory-and-personalization-26) | Activity memory from computer use (Computer History) | no | yes | not built | not verified |
| [CAP-memory-and-personalization-27](#cap-memory-and-personalization-27) | Recap of recent activity (Reflect and year-end recap) | yes | partly | partly built | code inspected only |
| [CAP-memory-and-personalization-28](#cap-memory-and-personalization-28) | Memory using connected-app data, web search and domain memories | partly | yes | not built | not verified |
| [CAP-memory-and-personalization-29](#cap-memory-and-personalization-29) | Same personalization with every model, and Local mode separation | no | no | partly built | code inspected only |

## CAP-memory-and-personalization-01 Automatic memory from chats

The assistant saves durable facts from ordinary chats without being asked, and uses them in later chats.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Claude saves memory as individual topics while you chat, or when told to remember something; on by default for Free, Pro, Max and Ultra. Plans: Free, Pro, Max, Ultra; Team and Enterprise owner-controlled. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 4, 2026: memory updates itself to reduce stale or contradictory facts; Plus and Pro have twice the capacity. Plans: Free, Go, Plus, Pro (capacity differs). Apps: web, ios, android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): Memory is limited on Free, included on Go, expanded on Plus and Pro. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-02; docs/product/requirements.md section 18). Automatic memory extraction runs on the cheapest reliable utility model, is metered under the one AGI Subscription, and skips temporary chats and Memory-off sessions. Every app must save to and read from the same account memory in Cloud mode.

**With different models, providers and the one subscription.** Extraction goes through the neutral routing layer, so the chat model does not matter and the stored memory is the same for every model. Extraction usage counts against the subscription. In Local mode, memory stays on the device and is never copied to the account (D-2026-09-28-02).

**Current implementation, as this trace read it on 2026-11-24: built.** Done in code on web, desktop, mobile, CLI, VS Code and Chrome; the Chrome toggle is missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.12, S94.01
- Comparison list ids: WP208
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1278`; `apps/web/lib/services/managed-auto-memory-service.ts:110`; `apps/mobile/src/features/memory/services/consolidation.ts:25`

**Gap.** Memory is off by default on web, but Claude and ChatGPT start with it on (comparison row WP208 is Partial). A tester saw 'please remember this' save nothing until the switch was found.

**Acceptance criteria**

1. With memory on, state a durable fact in a chat; a new chat later uses it.
2. With memory off, nothing is saved and the app says how to turn memory on.
3. Repeat the check with two different chat models; the saved memory and its use are the same.
4. Extraction usage appears in the subscription usage record.

**Verification: seen working by a person.** scorecards/web.csv W-12 free (pass): memory saved from chat, recalled in a new chat, deleted, not recalled after. W-12 subscribed (partial): the recall check could not run because chat answers failed on a lapsed billing period.

## CAP-memory-and-personalization-02 Memory master switch and default

One switch turns memory on or off for the account; off means nothing is read or saved.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Turning off Generate memory from chats offers Pause or Reset; on by default for Free, Pro, Max and Ultra. Plans: all plans; org default differs on Team and Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8590148-memory-in-chatgpt](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): Memory controls in Settings, Personalization: Memory, Reference saved memories, Reference chat history, Memory summary; they vary by plan, region and platform. Plans: varies by plan and region. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 18 ('Disable memory')). A visible Memory switch must exist on every app that offers memory. When it is off, the assistant neither reads nor saves memory and says so. The default (on or off) is the owner's call.

**With different models, providers and the one subscription.** The switch is stored on the account and applies to every model and provider. It applies the same on Free and paid plans. In Local mode it controls the on-device memory only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done in code on web, desktop, mobile, CLI and VS Code. Missing in Chrome. Off by default on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.01, S39.02
- Comparison list ids: WP208
- Code: `apps/web/features/settings/sections/MemorySection.tsx:184`; `apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:42`; `apps/web/lib/services/managed-memory-context-service.ts:203`

**Gap.** No Chrome switch. No first-run memory onboarding on any app (S39.01 missing on all six). The 'Save memories from chats' switch looks on while the master switch is off and cannot be changed.

**Acceptance criteria**

1. Turn memory off; ask the assistant to remember a fact; it declines and points to the setting, and nothing is saved.
2. Turn memory on in web settings; the mobile app shows the same state after sync.
3. With memory off, the chat-history option does not look switched on.

**Verification: seen working by a person.** scorecards/web.csv W-12 free: off by default, a clear 'memory is off' message, then it worked when on. web-problems-seen-in-browser.csv W-12 subscribed: two cosmetic or minor problems (default off; locked 'Save memories from chats' looks on).

## CAP-memory-and-personalization-03 Pause and reset memory

Pause keeps saved memory but stops using and adding to it. Reset deletes all of it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Pause keeps memory but stops use and saving; Reset permanently deletes all memories including project memory. Plans: all plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 12, 2026: three-dot menu offers Delete and turn off memory without deleting chats. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9 (irreversible actions name the consequence)). Pause, and a reset that names what is lost, must exist and must work without deleting chats. Deleting chats must not silently change memory.

**With different models, providers and the one subscription.** Account-level action; model-independent. Reset removes cloud memory only; Local memory is reset separately on the device and the screen must say which one.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Reset done on web, desktop, mobile and VS Code. Missing on CLI and Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.15, S39.30
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/MemorySection.tsx:78`; `apps/web/features/settings/sections/MemorySection.tsx:92`; `apps/mobile/app/(app)/settings/memory.tsx:455`

**Gap.** No reset on CLI or Chrome. Whether pause is a distinct state from off was not established.

**Acceptance criteria**

1. Pause memory; saved items remain but are not used or added.
2. Delete all memory shows a confirmation that says it cannot be undone; afterwards 0 items remain.
3. Delete all chats; memory is unchanged and the screen says so.

**Verification: seen working by a person.** scorecards/web.csv W-12: single-item delete dialog seen working ('It cannot be restored'). Delete all and pause were not exercised.

## CAP-memory-and-personalization-04 View, search, edit, pin and delete saved memories

A list of saved memories, grouped by topic, that the person can search, edit, pin and delete.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Settings > Your Claude > Manage lists memory as Topics that can be opened, edited with the pencil or deleted. Plans: all plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Oct 15, 2025: users can search and sort memories, prioritize or deprioritize items and restore prior versions. Plans: Plus, Pro (web). Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 18; docs/product/definition.md line 200). A memory list must allow view, add, edit and delete on every app. Memory is shown as editable topics.

**With different models, providers and the one subscription.** Same list for any model. Free users get the same view, edit and delete controls; limits come from the one quota system. Local memory is listed separately and labeled on-device.

**Current implementation, as this trace read it on 2026-11-24: built.** Done in code on all six apps for list, add, edit and delete. Search is missing on CLI and Chrome; pin is missing on VS Code and Chrome; topic grouping is missing on Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.04, S39.05, S39.06, S39.10, S39.13, S39.14, S39.16, S94.03
- Comparison list ids: none matched
- Code: `packages/ui/unified-chat/src/components/MemoryEditor.tsx:211`; `packages/ui/unified-chat/src/stores/memoryStore.ts:232`; `apps/web/app/api/memory/route.ts:76`; `apps/mobile/app/(app)/settings/memory.tsx:406`

**Gap.** Small per-app holes: search on CLI and Chrome, pin on VS Code and Chrome.

**Acceptance criteria**

1. Add a memory by hand; it appears with 'Added by you' and an updated date.
2. Edit its text; a new chat uses the corrected text.
3. Delete it after confirming; 0 saved memories show and a new chat does not recall it.
4. Search finds a memory by a word in it.

**Verification: seen working by a person.** scorecards/web.csv W-12 free: add, reload, delete and empty state seen. Edit and search not exercised.

## CAP-memory-and-personalization-05 Tell the assistant to remember, change or forget

The person says 'remember this' or 'forget that' in chat and the assistant saves, changes or removes the memory and confirms.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Users can tell Claude in chat what to remember, change or forget. Plans: all plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb-Apr 2024: users say remember or forget in chat or via settings, view what it remembers, and turn it off. Plans: all. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md section 18). Explicit remember and forget commands in chat must work and show a confirmation, on every chat surface.

**With different models, providers and the one subscription.** The command handler runs in the AGI harness, not in the model, so it works the same with any model. In Local mode it writes to on-device memory.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Remember is done on all six apps. Change and remove by message is Partial on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.11, S94.02
- Comparison list ids: WP213
- Code: `apps/web/features/chat/hooks/use-explicit-memory-commands.ts:26`; `apps/web/lib/services/memory-commands.ts:165`; `apps/mobile/src/features/memory/services/memoryCommands.ts:166`

**Gap.** Web handles 'change' and 'remove' only partly. The save confirmation read 'already saved' on a first save, with a stray space.

**Acceptance criteria**

1. Say 'remember X'; the assistant confirms and Settings shows X.
2. Say 'forget X'; Settings no longer shows X.
3. With memory off, the reply says memory is off and where to turn it on.

**Verification: seen working by a person.** scorecards/web.csv W-12 free; one cosmetic defect (wording and stray space) in web-problems-seen-in-browser.csv.

## CAP-memory-and-personalization-06 Turn memory off for one chat

Before the first message, the person chooses that this chat neither reads nor writes memory.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Before the first message, plus menu > Memory switches it off for that chat or task; the chat stays in history. Plans: all plans. Apps: web, desktop, ios, android.
- **ChatGPT, Codex: partly**
  - [https://learn.chatgpt.com/docs/customization/memories.md](https://learn.chatgpt.com/docs/customization/memories.md): In the desktop app and Codex TUI, /memories chooses whether the current chat can use existing memories and feed future ones. Apps: desktop, cli.
  - [https://help.openai.com/en/articles/8590148-memory-in-chatgpt](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): A temporary chat can pick whether it uses memories, custom instructions and plugins before it starts. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 172 and docs/product/requirements.md section 9.6 (temporary chats neither read nor write memory)). Per-chat memory control must exist: a plus-menu switch that saves in history, plus a temporary chat that neither reads nor writes memory.

**With different models, providers and the one subscription.** Applies to every model and provider. The choice is fixed once the chat starts.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Temporary-chat exclusion done on web, desktop and mobile; missing on CLI, VS Code, Chrome in the ledger (comparison shows Chrome temporary chat as Better). Per-chat plus-menu switch is Same on web, Partial on mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.28, S94.20
- Comparison list ids: MP85
- Code: `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1320`; `apps/mobile/stores/chat/chatExecutionStore.ts:2223`; `apps/web/app/api/search/route.ts:256`

**Gap.** The ledger marks CLI and VS Code missing and the Chrome status is unclear between ledger and comparison; mobile per-chat switch is Partial.

**Acceptance criteria**

1. Start a chat with memory off; a stated fact is not saved.
2. A temporary chat never appears in memory, past-chat recall or search.
3. The setting cannot be changed after the first message.

**Verification: code inspected only.** Not exercised in any scorecard row.

## CAP-memory-and-personalization-07 Temporary or incognito chat

A chat that is not kept in history and is neither written to nor read from memory.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): Ghost icon starts a temporary chat not saved to history, memory, training or recap; cannot be converted or reopened; not available inside projects. Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8590148-memory-in-chatgpt](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): No memories are created in a temporary chat; saving converts it to a regular chat. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 9.6 and definition.md line 172). Temporary chats neither read nor write memory and are never used as past-chat context.

**With different models, providers and the one subscription.** The same for every model and provider. Temporary chats still count against subscription usage.

**Current implementation, as this trace read it on 2026-11-24: built.** Done in code on web, desktop and mobile. Chrome temporary chat is marked Better in the comparison. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.28, S94.20
- Comparison list ids: none matched
- Code: `apps/web/app/api/cron/purge-temporary-chats/route.ts:87`; `apps/web/lib/services/retrieval-search-service.ts:234`

**Gap.** CLI and VS Code are missing in the ledger. Not exercised by a person.

**Acceptance criteria**

1. State a fact in a temporary chat; it is absent from memory.
2. Ask in a regular chat about the temporary chat's content; the assistant cannot recall it.
3. The temporary chat does not appear in search.

**Verification: code inspected only.** No scorecard row covers it.

## CAP-memory-and-personalization-08 Project-scoped memory

A project keeps its own memory, used there and not in other projects, with an option to use or isolate account memory.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects): Each project has its own memory used with account memory but not other projects; Use account memory off isolates it. Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, ios.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Per-project setting: project-only blocks personal memories and cross-project chat reference; changes take hours; no list of project memories. Plans: All; Enterprise/Edu contained. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 18 ('Project memory boundary'); definition.md line 171). Project memory must stay inside its project, and the person must be able to tell which memories are project-only.

**With different models, providers and the one subscription.** Scope is resolved by the platform before the model is called, so any model sees the same scoped memory. Local mode keeps its own memory.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop and CLI. Missing on mobile, VS Code and Chrome in the ledger (comparison says Same on mobile). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.24, S40.30, S94.13
- Comparison list ids: none matched
- Code: `apps/web/features/projects/components/ProjectMemoryPanel.tsx:17`; `apps/web/features/projects/components/ProjectSettingsDialog.tsx:274`; `apps/cli/src/memory.rs:61`

**Gap.** The ledger and the comparison disagree for mobile. VS Code and Chrome have no project memory.

**Acceptance criteria**

1. A memory saved in project A is not used in project B.
2. With the account-memory option off, the project uses only its own memory.
3. The memory list marks which items are project-only.

**Verification: code inspected only.** No scorecard row covers projects.

## CAP-memory-and-personalization-09 Reference past chats

The assistant can search or draw on earlier conversations, with a switch separate from saved memory, and shows which chats it used.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Claude searches earlier conversations on request, shows citations to source chats, and a Search and reference chats switch turns it off. Plans: All paid plans at first (Aug 2025); memory on all plans by Mar 2026. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jan 15, 2026: Plus and Pro retrieve specifics from past chats and show the chats used as sources; in the EEA, UK and some other regions it is off until enabled. Plans: Plus, Pro; lighter on Free. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 172; requirements.md section 18). A chat-history reference switch separate from the Memory switch must exist, and replies must be able to cite the chats used.

**With different models, providers and the one subscription.** Retrieval is done by AGI, so every model gets the same excerpts. Excerpts are sent to the chosen provider like any context, so the provider label must be visible. Local chats do not search cloud chats unless the person forks with consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop and mobile. Missing on CLI, VS Code and Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.03, S94.22
- Comparison list ids: none matched
- Code: `apps/web/features/settings/sections/MemorySection.tsx:285`; `apps/web/lib/services/past-chat-context-service.ts:593`; `apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:61`

**Gap.** No past-chat switch on CLI, VS Code or Chrome.

**Acceptance criteria**

1. With the switch on, ask about an earlier chat; the reply cites it.
2. With the switch off, the same question gets no past-chat content.
3. Deleting the source chat removes it from later recall.

**Verification: code inspected only.** Not exercised in any scorecard row.

## CAP-memory-and-personalization-10 Memory sources shown under replies

A reply shows which memories, past chats, instructions or files shaped it, with options to correct or delete.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): When Claude uses an earlier chat it shows citations linking to the source chats and offers deletion of specific conversations. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): May 5, 2026: Sources shows memories, past chats and custom instructions that shaped a reply, with correct, delete or not-relevant actions; hidden from shared chats. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; ledger S39.27). When memory or past chats shaped a reply, the reply shows it and which items, so remembered facts can be told from invented ones.

**With different models, providers and the one subscription.** Attribution is recorded by the AGI harness per turn, so it works for any model. Shared chats must not expose it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web and desktop. Missing on mobile, CLI, VS Code and Chrome (mobile comparison row says Same). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.27, S94.18
- Comparison list ids: none matched
- Code: `apps/web/features/chat/components/messages/CitationPastChats.tsx:27`; `apps/web/lib/services/turn-context-service.ts:177`; `apps/mobile/src/features/memory/services/memoryCitations.ts`

**Gap.** The ledger says mobile is missing; the comparison says Same. Not settled. Not on CLI, VS Code or Chrome.

**Acceptance criteria**

1. After a reply that used a memory, a control lists the memory used.
2. The control lets the person delete or mark the item.
3. A shared link of the chat does not show the sources.

**Verification: code inspected only.** Not exercised by a person.

## CAP-memory-and-personalization-11 Editable memory summary

A readable summary of what the assistant knows, which the person edits by text or highlight, with options to delete and turn off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Memory is listed as Topics; a legacy 24-hour synthesised summary survives only in a few orgs. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8590148-memory-in-chatgpt](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): View and correct a high-level summary by editing or highlighting text; Don't mention this again reduces use without deleting. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 12, 2026: edit the summary via text box or highlight; web now, mobile soon. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-17). Whether to show a generated profile summary is an owner call. The owner decided on 2026-09-28 that mobile adds none, because Claude shows none.

**With different models, providers and the one subscription.** A summary is generated by a model, so it costs usage and must be metered under the subscription. Local mode would generate on-device.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Mobile: off by decision. Web has a MemorySummaryCard (Partial). Ledger S39.07 says missing on web and desktop. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.07, S39.08
- Comparison list ids: MP84, WP211
- Code: `apps/web/features/settings/components/MemorySummaryCard.tsx:1`

**Gap.** The decision says web and desktop show no summary, but code has a summary card. The decision text and the code disagree. ChatGPT now has an editable summary, which postdates the decision.

**Acceptance criteria**

1. If kept: the summary opens, edits by text, and a later chat uses the edit.
2. If dropped: no summary UI appears on any app.
3. Either way, the docs and the code state the same answer.

**Verification: not verified.** No person has opened the card.

## CAP-memory-and-personalization-12 Don't mention this again and mark a source not relevant

The person tells the assistant to stop using one memory or one source without deleting it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8590148-memory-in-chatgpt](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): Don't mention this again reduces use without deleting the source; Sources let users mark relevance. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Proposed: let the person suppress one memory or source without deleting it.

**With different models, providers and the one subscription.** Suppression is applied before context is built, so it is model-independent.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web (W279) and mobile (M165). Other apps unknown. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M165, W279
- Code: `comparison-web.csv W279 notes a search found no match in apps/web.` (not found)

**Gap.** Not built.

**Acceptance criteria**

1. Mark a memory 'not relevant'; the next reply no longer uses it but the memory stays listed.
2. The mark can be undone.

**Verification: not verified.** Code search by comparison file only.

## CAP-memory-and-personalization-13 Sensitive-topic controls and never-remembered data

Sensitive topics are not saved unless the person opts in, and some data classes are never saved.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Health, politics and religion are not saved by default; an opt-in saves them. Government ID numbers, criminal history, financial account numbers and immigration status are never saved. Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001222-finances-in-chatgpt](https://help.openai.com/en/articles/20001222-finances-in-chatgpt): A separate financial memory type for goals, loans and assets; temporary chats create no finance memories. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 18 (last line)). Credentials and special-category data are refused automatically, and the person can list terms never to remember. Local-only sensitive data must never enter synced memory.

**With different models, providers and the one subscription.** Exclusion rules run in AGI before and after any model, so no provider can bypass them.

**Current implementation, as this trace read it on 2026-11-24: built.** Done in code on all six apps. The 'include sensitive topics' opt-in switch exists on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.29, S94.17, S94.19
- Comparison list ids: none matched
- Code: `apps/web/features/settings/components/MemoryExclusions.tsx:135`; `packages/contracts/context/src/memory-content-policy.ts:110`; `apps/web/lib/services/memory-write-service.ts:34`

**Gap.** None known in code. Not exercised by a person.

**Acceptance criteria**

1. Say 'remember my password is ...'; it is refused.
2. Add a never-remember term; a chat containing it saves nothing.
3. A sensitive topic is not saved until the opt-in is on.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-14 Import memory from another assistant

The person gives the assistant an export prompt to run elsewhere, pastes the result, and reviews candidate memories.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude): Settings > Your Claude > Start import gives an export prompt; paste the result and Add to memory; Claude may drop non-work details. Plans: All plans (beta). Apps: web, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 18). Import must show instructions for the other provider, a paste or upload screen, parsed candidates, dedupe, edit before save, and approve all.

**With different models, providers and the one subscription.** Parsing is metered like any model call and routed by the neutral layer. Imported memory is Cloud memory; it does not enter Local memory.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop, mobile and CLI. Missing on VS Code and Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.21, S94.07, S94.12
- Comparison list ids: none matched
- Code: `apps/web/features/settings/components/ImportMemoryDialog.tsx:19`; `apps/web/app/api/memory/import/route.ts:134`; `apps/mobile/app/(app)/settings/memory-import.tsx:206`

**Gap.** No VS Code or Chrome import. Not run by a person.

**Acceptance criteria**

1. Paste a sample export; candidates appear with duplicates merged.
2. Edit one candidate, approve, and a new chat uses it.
3. Cancel before approving; nothing is saved.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-15 Export memory

The person downloads saved memories as a readable file.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude](https://support.claude.com/en/articles/12123587-import-and-export-your-memory-from-claude): Memory can be viewed in Manage or exported by asking Claude to write out its memories verbatim. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; ledger S39.22). A person can download their memories in a readable file. Account data export includes memory.

**With different models, providers and the one subscription.** A file export needs no model. Local memory export is a separate on-device file.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop, mobile and CLI. Missing on VS Code and Chrome. Mobile comparison row M166 says missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.22, S94.12
- Comparison list ids: M166
- Code: `apps/web/app/api/user/export/route.ts:2096`; `apps/cli/src/lib.rs:2592`; `apps/mobile/services/dsarExport.ts:284`

**Gap.** The ledger and comparison disagree for mobile. No VS Code or Chrome export.

**Acceptance criteria**

1. Export; the file lists every saved memory with its text.
2. Import the exported file into a fresh account; the same memories appear.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-16 Memory capacity, automatic clean-up, search and version restore

Memory has a limit by plan, stale or conflicting items are cleaned up automatically, and earlier versions can be restored.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Oct 15, 2025: relevance-based prioritization avoids memory full; users can restore prior versions. Jun 4, 2026: Plus and Pro have twice the capacity. Plans: Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: AGENTS.md sections 4 and 8; docs/product/commercial.md; ledger S39.23). Where memory has a limit, show how much is used and which items fall outside it. Limits come from the one quota system, not constants.

**With different models, providers and the one subscription.** Capacity is a plan entitlement read from the shared quota system, the same on every app. Local memory has no plan cap.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Capacity display done on CLI only. Conflict resolution done on web, desktop, mobile and Chrome. Version restore missing on web (W285). Capacity-by-plan missing on web (W281). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.19, S39.20, S39.23, S94.07, S94.08, S94.09, S94.10, S94.15
- Comparison list ids: W281, W285
- Code: `apps/cli/src/memory_pipeline.rs:115`; `apps/web/app/api/memory/conflicts/route.ts:26`; `apps/web/app/api/cron/expire-memories/route.ts:12`

**Gap.** No capacity display, plan limit, or version restore on web, desktop or mobile.

**Acceptance criteria**

1. A plan with a cap shows used and total memory.
2. Two contradicting facts: the newer one is used and the older stops being used.
3. An older version of an edited memory can be restored.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-17 Memory shared with cloud agent work and dots

Memory flows between chat and long-running agent tasks, and agents may keep their own notes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Memory flows between chat and cloud Cowork tasks; local Cowork sessions do not use memory. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/dots/tasks-and-memory.md](https://learn.chatgpt.com/docs/dots/tasks-and-memory.md): A dot starts from relevant ChatGPT memory and keeps its own notes, separate from saved memory. Plans: Pro (Dot); rolling out. Apps: web, ios, android, desktop.
  - [https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs): Individual dot memories cannot be viewed or edited, only deleted by deleting the dot. Apps: desktop.

**AGI requirement** (inferred; source: competitor parity; ledger S39.25). Scheduled and agent tasks use account memory only when memory is on. Agent-specific memory, if built, must be separate from personal memory and reviewable.

**With different models, providers and the one subscription.** Agents run in the AGI harness on any provider; their memory use is metered under the subscription. Local sessions use only on-device memory.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Memory shared with cloud agent work is Same on web. Agent-specific memory is missing on all six apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.25, S94.14
- Comparison list ids: none matched
- Code: `apps/web/lib/services/scheduled-agent-executor.ts:423`; `apps/web/lib/slack/slack-assistant-turn.ts:181`

**Gap.** No per-agent memory store.

**Acceptance criteria**

1. A scheduled agent uses account memory when memory is on and none when off.
2. If per-agent memory is built, the user can review it and it is never merged into personal memory.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-18 Global custom instructions

Standing instructions that apply to every new chat, with an on/off switch and a size limit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features): Settings > Your Claude lets users write general instructions applied to every conversation. Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8096356-chatgpt-custom-instructions](https://help.openai.com/en/articles/8096356-chatgpt-custom-instructions): Free-text preferences applied immediately to all chats; Enable customization toggle; 1,500 characters on Free and Go, 5,000 on paid plans. Plans: all; limit differs by plan. Apps: web, desktop, ios, android.

**AGI requirement** (inferred; source: competitor parity; ledger S40.16). Standing instructions apply to every chat on every app and can be switched off without being deleted. Any length limit comes from the plan entitlement.

**With different models, providers and the one subscription.** The text is added to the prompt by the AGI harness for any model. It is sent to the chosen provider, so the provider label matters. In Local mode it stays on the device.

**Current implementation, as this trace read it on 2026-11-24: built.** Done in code on all six apps. Web limit is a fixed 2000 characters, not by plan. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S40.16
- Comparison list ids: WP207, WP210
- Code: `apps/web/features/settings/sections/PersonalizationSection.tsx:74`; `apps/web/lib/server/user-identity.ts:205`; `apps/mobile/src/features/settings/personalization/index.tsx:369`

**Gap.** Limit is a code constant, not read from plan config (AGENTS.md section 4). Mobile length-by-plan is missing (M162).

**Acceptance criteria**

1. Save instructions; a new chat follows them with any model.
2. Switch them off; a new chat ignores them but the text is kept.
3. Over-limit text is rejected with the limit shown.

**Verification: code inspected only.** Not exercised in any scorecard row.

## CAP-memory-and-personalization-19 Project instructions

A project has its own standing instructions for every chat in it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude, Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): A standing brief sent to every new thread, up to 16,000 characters, set in Project settings > Memory (Claude Code Projects). Plans: Pro, Max, Ultra.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Projects have their own memory setting; project-only memory blocks outside memories. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md line 171 (projects group instructions)). A project can carry its own instructions that apply to every chat in it. For each project the person chooses which personal preferences apply.

**With different models, providers and the one subscription.** Same for any model. Counted under the one subscription like any context.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Done on web, desktop, mobile, CLI and VS Code; missing on Chrome. Selective sharing missing on mobile, CLI, VS Code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S40.17, S40.30
- Comparison list ids: none matched
- Code: `apps/web/features/projects/components/ProjectSettingsDialog.tsx:222`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2751`

**Gap.** No Chrome project instructions; selective sharing missing off web and desktop.

**Acceptance criteria**

1. Set project instructions; a chat in the project follows them and a chat outside does not.
2. Turn off personal preferences for the project; they stop applying there.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-20 Organization-wide instructions and memory admin controls

A workspace owner sets instructions for all members or turns memory off for the workspace.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14546867-set-organization-instructions](https://support.claude.com/en/articles/14546867-set-organization-instructions): A member's own instructions fill gaps that organization instructions do not cover; contradictions resolve in favor of the organization. Plans: Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Owners toggle memory in Organization settings > Capabilities; HIPAA and government orgs differ. Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9295112-memory-faq-business-version](https://help.openai.com/en/articles/9295112-memory-faq-business-version): Owners can turn memory and personalization off for the workspace, which deletes existing member memories. Plans: Business, Enterprise. Apps: web.

**AGI requirement** (proposed; source: competitor parity; ledger S39.26). Proposed: owners control memory and org instructions; work memory never appears in personal chats and the reverse.

**With different models, providers and the one subscription.** Workspace policy applies across models. Admin controls follow the entitlement, not a separate plan system.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Org versus personal memory separation done on all six apps. Org instructions (W283) and workspace memory off for all members (W288) are missing on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.26
- Comparison list ids: W283, W288
- Code: `apps/web/features/settings/sections/MemorySection.tsx:28`; `packages/contracts/types/src/enterprise/workspace-controls.ts:3`

**Gap.** No org-wide instructions or owner memory switch.

**Acceptance criteria**

1. Owner turns memory off; members' chats neither read nor save memory.
2. Org instructions apply to every member and win over personal text on conflict.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-21 Base style, tone presets and trait sliders

The person picks how replies sound (preset styles) and nudges traits such as warmth, enthusiasm, lists and emoji.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features): Skills adjust tone and format and apply your writing patterns (the catalogue shows no chat tone presets for Claude). Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11899719-customizing-your-chatgpt-personality](https://help.openai.com/en/articles/11899719-customizing-your-chatgpt-personality): Base style and tone picks how ChatGPT sounds; applies to all chats and does not change capabilities or safety rules; seven presets. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/20001038-characteristics-in-chatgpt](https://help.openai.com/en/articles/20001038-characteristics-in-chatgpt): Warmth, enthusiasm, headers and lists, and emoji can each be nudged up or down. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (ChatGPT only); ledger S40.05 to S40.14, S40.19). Style and tone choices apply to every chat, never change capabilities or safety rules, and can be overridden for one chat. Whether to match ChatGPT's preset list is an owner call.

**With different models, providers and the one subscription.** Implemented as AGI prompt text, so it works with any model and provider. Saved memory or instructions may override a preset, so the order must be stated.

**Current implementation, as this trace read it on 2026-11-24: built.** Style presets, warmth, enthusiasm, lists, emoji, formality, depth and language are done in code on all six apps. Preset list is Partial on web; length preference is missing on CLI, VS Code and Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S40.05, S40.06, S40.07, S40.08, S40.09, S40.10, S40.11, S40.12, S40.13, S40.14, S40.19, S40.23, S40.26
- Comparison list ids: WP209
- Code: `apps/web/features/chat/components/Composer/StyleSelector.tsx:29`; `apps/web/features/settings/sections/PersonalizationSection.tsx:39`; `packages/contracts/types/src/response-style-preferences.ts:104`; `apps/mobile/src/features/settings/personalization/index.tsx:400`

**Gap.** Style reset missing on VS Code and Chrome. Goals and interests (S40.04) and units and formatting (S40.15) are missing on all six apps.

**Acceptance criteria**

1. Pick a preset; replies change tone, and the same preset works under two different models.
2. A per-chat override leaves the saved default unchanged.
3. Reset returns every style setting to default.
4. A style change does not alter tool or safety behaviour.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-22 Custom and learned writing style

The assistant matches the person's own voice from samples or from connected writing sources, and can show or turn off what it learned.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/personalize.md](https://learn.chatgpt.com/docs/personalize.md): Writing style in Work uses your writing from connected email, messaging or document apps; Settings > Personalization > Writing > Reference my writing style turns it off. Apps: web, desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Proposed: writing-style samples are supported; learning from connected sources is an owner call and needs consent, a visible source, and an off switch.

**With different models, providers and the one subscription.** Style profile building is a model call metered under the subscription. Connected-source reads must follow connector permissions and never feed Local mode.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Style samples done on web and desktop. Connected source setup, learned-style summary and the profile generator are missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S40.20, S40.21, S40.22, S94.16
- Comparison list ids: W284
- Code: `apps/web/features/chat/components/Composer/StyleSelector.tsx:370`; `apps/web/features/chat/stores/style-store.ts:202`

**Gap.** No connected-source learning, no summary, none on mobile, CLI, VS Code or Chrome.

**Acceptance criteria**

1. Add a writing sample; a draft matches its voice.
2. If connected-source learning is built, the person sees what was read, can delete it and can turn it off.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-23 Instruction files for coding agents

Plain files (CLAUDE.md, AGENTS.md, rules) loaded into coding sessions, scoped by user, project, folder or path.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/memory.md](https://code.claude.com/docs/en/memory.md): CLAUDE.md loads from user, project, local and managed scopes; subdirectory files load on demand; .claude/rules supports path-scoped rules; AGENTS.md is read when no CLAUDE.md exists. Apps: cli, ide.
  - [https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts](https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts): Merged from the home CLAUDE.md, repo-root file and on-demand subdirectory files. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/personalize.md](https://learn.chatgpt.com/docs/personalize.md): In Codex, custom instructions live in a global AGENTS.md; projects or repos can add their own. Apps: cli, desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md line 493 (CLI needs parity pass)). CLI and VS Code read AGENTS.md and CLAUDE.md with the nearest file winning, and /init drafts one from the repo.

**With different models, providers and the one subscription.** Files are read by the AGI harness, so any model sees the same rules. They are plain local files and are not uploaded unless the person sends them to a provider.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code read both files (Same). /init is Partial. Local personal file, org file, rules path scoping, and instruction-load hook are missing on CLI. Desktop /init is Missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S40.28
- Comparison list ids: C407, C408, C655, CP91, CP92, D54, DP82
- Code: `apps/cli/src/claude_parity.rs:929`; `apps/cli/src/ecosystem.rs:567`; `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1371`

**Gap.** Missing local personal file, org-managed file and load hook on CLI; desktop /init; web and mobile show no effective-instructions view (S40.28).

**Acceptance criteria**

1. A rule in AGENTS.md changes agent behaviour in a new CLI session with any model.
2. A deeper-folder file overrides the parent for files in that folder.
3. The settings view shows which files are in effect.

**Verification: code inspected only.** Not exercised by a person.

## CAP-memory-and-personalization-24 Coding agent auto memory and memory commands

A coding agent saves its own notes across sessions and lets the person browse and edit them with /memory.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/memory.md](https://code.claude.com/docs/en/memory.md): Auto memory is on by default in local sessions, stored per repository with a MEMORY.md index; toggle and browse in /memory; subagents can keep their own memory. Apps: cli, ide.
  - [https://code.claude.com/docs/en/vs-code.md](https://code.claude.com/docs/en/vs-code.md): VS Code: auto memory toggle and a memory browser to view, edit and delete. Apps: vscode.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/customization/memories.md](https://learn.chatgpt.com/docs/customization/memories.md): Codex turns eligible prior chats into local memory files, off by default, with redaction of secrets; separate from ChatGPT account memory; /memories is the per-chat control. Apps: cli, desktop.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md line 493). A coding agent can save notes across sessions, and the person can toggle, browse and delete them. Local notes stay on the device.

**With different models, providers and the one subscription.** Notes are written by the AGI harness for any model. They live locally and are not synced to account memory unless the person chooses.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI Same for auto memory and /memory. VS Code memory browser Same; agent-written notes Missing (V66). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.32
- Comparison list ids: C401, C409, CP261, CP265, V66
- Code: `apps/cli/src/memory.rs:61`; `apps/cli/src/memory_pipeline.rs:115`; `apps/extension-vscode/src/memory/memoryTreeProvider.ts:37`

**Gap.** No auto-memory folder choice, subagent memory or /dream consolidation (partial). VS Code agent does not write its own notes.

**Acceptance criteria**

1. Correct the agent once; a new session in the same repo applies the correction.
2. Turn auto memory off; nothing is written.
3. Delete a note in the browser; it is not recalled.

**Verification: code inspected only.** No CLI or VS Code scorecard row on this topic in the files read.

## CAP-memory-and-personalization-25 Output styles for coding sessions

Named styles that change how a coding agent explains and formats, including custom ones as files.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/output-styles.md](https://code.claude.com/docs/en/output-styles.md): Built-in concise and explanatory styles plus custom style files with frontmatter options. Apps: cli, vscode.
  - [https://support.claude.com/en/articles/14554000-claude-code-power-user-tips](https://support.claude.com/en/articles/14554000-claude-code-power-user-tips): Explanatory and Learning styles set in /config; custom styles are possible. Apps: cli.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/config-file/config-basic.md](https://learn.chatgpt.com/docs/config-file/config-basic.md): A personality setting of none drops built-in personality instructions; the /personality command is removed. Apps: cli.

**AGI requirement** (inferred; source: competitor parity (Claude Code); ledger S40.24 to S40.27). CLI and VS Code offer style choices for coding output, including custom ones.

**With different models, providers and the one subscription.** Style text is added by the harness for any model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI Same. VS Code output styles Missing (V68, V82). Desktop is Partial (DP123). Mobile cannot create custom styles. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S40.24, S40.25, S40.27
- Comparison list ids: CP206, CP330, DP123, V68, V82
- Code: `apps/cli/src/output_styles.rs:62`; `apps/cli/src/output_styles.rs:178`

**Gap.** VS Code has no output styles menu; custom style creation missing on mobile, VS Code and Chrome.

**Acceptance criteria**

1. Pick a style in the CLI; the next reply follows it.
2. Create a custom style file; it appears in the picker.
3. The learning style quizzes or teaches rather than just answering.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-26 Activity memory from computer use (Computer History)

An opt-in Mac feature that records interaction events from chosen apps and sites into memories and a timeline.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - no page found in the saved documentation
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/customization/computer-history.md](https://learn.chatgpt.com/docs/customization/computer-history.md): Turns activity across allowed apps and sites into summaries and a timeline ChatGPT and Codex can reference; uses interaction events and accessibility text, no screenshots or audio. Plans: Pro, Business, Enterprise. Apps: desktop (macOS).
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Off by default, requires Memories and an admin grant; pause, choose apps and delete items. Plans: Enterprise, Edu. Apps: desktop.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only); AGENTS.md section 6). Whether to build activity memory is an owner call. If built, it must be opt-in, on-device by default, and never feed cloud memory without consent.

**With different models, providers and the one subscription.** Captured events are on the device; sending them to a provider is a cross-boundary step that needs consent and a provider label.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on desktop (D32, D99, D119, D130). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D119, D130, D32, D99
- Code: `comparison-desktop.csv rows D32, D99, D119, D130 mark Missing.` (not found)

**Gap.** Not built.

**Acceptance criteria**

1. Off by default; the person chooses apps, pauses, inspects and deletes items.
2. No screenshots or audio are stored.

**Verification: not verified.** Comparison rows only.

## CAP-memory-and-personalization-27 Recap of recent activity (Reflect and year-end recap)

A recap page built from memory: topics, most active day, patterns, and a year-end recap.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15672559-see-your-monthly-recap](https://support.claude.com/en/articles/15672559-see-your-monthly-recap): Beta monthly recap with headline, most active day, peak hour, total chats, daily chart, topics and skill cards; ranges include this month and year. Plans: Free, Pro, Max, Ultra (beta). Apps: web, desktop.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Dec 22, 2025: optional year-end recap; needs Memory and Reference Chat History on; limited regions; not Business, Enterprise, Edu. Plans: Free, Go, Plus, Pro (limited). Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; ledger S39.09, S94.21). A recap needs memory on, and an off state hides it.

**With different models, providers and the one subscription.** Built from account data by the platform; any model summarizes it, and the cost is metered. Local mode has no recap unless built on-device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Ongoing-work summary done on web, desktop and mobile. Year-end recap Partial on mobile. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.09, S94.21
- Comparison list ids: MP86
- Code: `apps/web/lib/services/reflect-service.ts:97`; `apps/web/features/settings/sections/ReflectSection.tsx:319`; `apps/mobile/app/(app)/settings/reflect.tsx:452`

**Gap.** No CLI, VS Code or Chrome recap beyond CLI session recap, which is missing.

**Acceptance criteria**

1. With memory on, the recap lists topics and a most-active day.
2. With memory off, the recap is hidden or says why.

**Verification: code inspected only.** No scorecard row.

## CAP-memory-and-personalization-28 Memory using connected-app data, web search and domain memories

Memory draws on connected apps, sharpens web-search queries, and keeps special types such as finance or health.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps](https://support.claude.com/en/articles/11869619-use-claude-with-ios-apps): Apple Health data is read-only and not saved to memory unless sensitive topics are on. Apps: ios.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): With Memory on, information accessed from apps may be remembered unless the source restricts it, and can inform web search queries.
  - [https://help.openai.com/en/articles/8590148-memory-in-chatgpt](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): With Memory on, details like location or diet can refine search queries. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/20001222-finances-in-chatgpt](https://help.openai.com/en/articles/20001222-finances-in-chatgpt): Dedicated financial memories, deletable from the Finances page. Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT); docs/product/requirements.md section 18). Owner call whether to remember connector data. Any such memory needs a per-connector choice, and connector data must never reach Local memory.

**With different models, providers and the one subscription.** Connector reads follow the connector's permissions and go through the AGI harness for any model.

**Current implementation, as this trace read it on 2026-11-24: not built.** Missing on web (W282, W280) and mobile (M168). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M168, W278, W280, W282
- Code: `comparison-web.csv rows W278, W280, W282 mark Missing.` (not found)

**Gap.** Not built.

**Acceptance criteria**

1. Per-connector setting decides whether connector data can enter memory.
2. A finance chat creates no memory unless the person opts in.

**Verification: not verified.** Comparison rows only.

## CAP-memory-and-personalization-29 Same personalization with every model, and Local mode separation

Saved memory, instructions and style behave the same whichever model or provider is chosen, and on-device and account memory stay separate.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/12738598-adapt-to-new-model-personas-after-deprecations](https://support.claude.com/en/articles/12738598-adapt-to-new-model-personas-after-deprecations): Advises using memory, past chat search and projects to carry style across model changes (one model family only).
- **ChatGPT: no**
  - [https://help.openai.com/en/articles/8554407-gpts-in-chatgpt](https://help.openai.com/en/articles/8554407-gpts-in-chatgpt): GPT chats start fresh without saved memory, custom instructions or past conversations. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-02; AGENTS.md section 6; ledger S39.31). Memory and personalization apply the same way whichever model or provider is chosen. Local mode keeps its memory on the device and Cloud mode uses account memory; one is never copied into the other.

**With different models, providers and the one subscription.** Personal context is added by the AGI harness before the provider call. Cloud memory sent to an outside provider is labeled; Local chats never send it silently. Metering follows the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Cross-model done on web, desktop, CLI, VS Code and Chrome; mobile is blank in the ledger. Web has a local-context route that returns account memory for local-model turns. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S39.31, S39.32
- Comparison list ids: none matched
- Code: `apps/web/app/api/memory/local-context/route.ts:22`; `apps/web/features/chat/lib/local-personal-context.ts:34`; `apps/mobile/src/features/memory/services/personalContext.ts:36`

**Gap.** Not shown in code reading whether the person is told, or consents, when account memory is fed to a local model on desktop. The mobile cross-model status is blank in the ledger.

**Acceptance criteria**

1. Ask the same memory-dependent question under two models; both use the memory.
2. In Local mode, a fact saved on the device does not appear in account memory, and the reverse.
3. If account memory is used in a Local chat, a visible label and consent step say so.

**Verification: code inspected only.** W-12 recall checked on one model only (free account).

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Memory default: the owner has not said whether web memory should start on (as Claude and ChatGPT do for most plans) or stay off. The web app starts off, and a tester hit this.
- Memory summary: decision D-2026-09-28-17 says no generated profile summary, but web has a summary card and ChatGPT now ships an editable summary. Keep, remove, or extend it?
- Whether to match ChatGPT-only features: not-relevant marks, memory version restore, financial memories, connected-app memory, writing style learned from connected sources, and Computer History activity memory.
- Whether to match Claude-only features: monthly recap beta on all apps, sensitive-topic opt-in wording, and memory shared with agent tasks.
- Whether Local-mode turns on desktop may use account memory, and what consent and label they need.
- Whether instruction length limits vary by plan, as ChatGPT's do (1,500 versus 5,000 characters).
- Whether per-agent memory is built, and if so who can view it (ChatGPT dots allow no view or edit).
- Whether to add org-wide instructions and an owner switch for memory.

## Could not establish

- How Claude chat handles custom styles or tone presets: the catalogue has no such Claude chat feature, so has is unknown, not no.
- Whether ChatGPT offers memory import or export: the catalogue shows none, so unknown.
- Claude memory capacity or limits: the catalogue gives none.
- Whether the ledger or comparison is right for mobile on memory-used display, memory export and project memory: they disagree and the code was not re-read line by line.
- Any person-verified result for memory on desktop, mobile, CLI, VS Code or Chrome: only web W-12 exists, and the subscribed recall check could not run on a lapsed billing period.
- Whether any app asks consent before account memory is sent to a local model.
- Whether the Pause state differs from Off in AGI code.
- Which comparison rows with blank list_id match which ledger items: blank-id rows are cited by feature name only in the evidence.
