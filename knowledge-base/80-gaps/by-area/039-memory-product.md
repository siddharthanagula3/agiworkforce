---
id: "GAPS-AREA-039"
type: "gap-list"
title: "Gaps: Memory product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 39. Memory product

108 open gaps that touch this area. Area page: [20-features/039-memory-product](../../20-features/039-memory-product/README.md).

## CMP-C401

**Choose the auto memory folder (autoMemoryDirectory)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: The memory location is fixed under the config root; no key moves it.
- Evidence: apps/cli/src/config.rs:133-251 (UiConfig and DefaultConfig fields hold no such key); apps/cli/src/memory_pipeline.rs:5

## CMP-C409

**Subagents with their own persistent memory**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Subagents do not keep memory between runs.
- Evidence: searched: agent memory, memory scope in apps/cli/src/agents.rs

## CMP-CP261

**Auto memory on or off (autoMemoryEnabled, CLAUDE_CODE_DISABLE_AUTO_MEMORY)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: No switch was found that stops the local session-summary and consolidation pass agi memory on, off and status switch account memory through the cloud personalization setting. No switch was found that stops the local session-summary and consolidation pass.
- Evidence: apps/cli/src/lib.rs:4221-4229 (cloud::personalization::memory_switch); apps/cli/src/memory_pipeline.rs:1-9; searched: enabled, memory_enabled in memory_pipeline.rs and memory.rs, no hit

## CMP-CP265

**Slash command /dream (consolidate auto memory on demand)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: No command runs that pass on demand Memories are merged and pruned automatically at startup, at most hourly; no command runs that pass on demand.
- Evidence: apps/cli/src/memory_pipeline.rs:1-9; searched: "/dream" in apps/cli/src, no hit

## CMP-M166

**Export memories**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md), [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Detail: No memory export; only import and delete exist.
- Evidence: searched: export memory in apps/mobile/app/(app)/settings, apps/mobile/src/features/memory

## CMP-MP84

**Edit the memory summary by text or highlight**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: Our Memory summary page is read-only Our Memory summary page is read-only; entries are edited from the memory list.
- Evidence: apps/mobile/app/(app)/settings/memory-summary.tsx:66-108

## CMP-MP85

**Switch memory off for one chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md), [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: No per-chat memory switch in Add to chat No per-chat memory switch in Add to chat; Temporary chat keeps one chat out of memory.
- Evidence: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:204; :742

## CMP-MP86

**Year-end recap of themes and stats**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md), [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Detail: A Reflect recap of ongoing work exists, not a yearly stats recap A Reflect recap of ongoing work exists, not a yearly stats recap.
- Evidence: apps/mobile/app/(app)/settings/reflect.tsx:21-36

## CMP-V66

**Agent writes its own memory notes across sessions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: In the editor, memory is saved only on request (Remember this); the agent does not write notes on its own.
- Evidence: apps/extension-vscode/src/memory/memoryStore.ts; searched: auto memory in apps/extension-vscode/src

## CMP-W281

**Memory capacity by plan and automatic clean-up of stale memories**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md), [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md), [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md), [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Saved facts have no stated capacity by plan and nothing prunes or merges stale facts; the list only pages 1,000 at a time.
- Evidence: apps/web/app/api/memory/sync/route.ts:29; searched: memory limit, maxMemories, MAX_MEMOR in apps/web/lib/memory, apps/web/features/memory, packages/contracts/types/src/billing-catalog.ts

## CMP-W283

**Organization instructions that apply to every member**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Detail: Workspaces have no shared instruction text applied to all members chats.
- Evidence: searched: organization instructions, orgInstructions in apps/web, packages/contracts

## CMP-W285

**Restore earlier versions of memory and prioritize items**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md), [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md), [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md), [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Memory items can be edited and deleted but there is no version history or restore.
- Evidence: searched: memory version, restore, prioritize in apps/web/features/memory, settings

## CMP-W288

**Workspace owner turns memory off for all members**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Detail: Workspace feature switches do not include memory, so an admin cannot disable it workspace-wide.
- Evidence: packages/contracts/types/src/enterprise/workspace-controls.ts:3-17

## CMP-WP208

**Memory on by default, built from your chats**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md), [F039-02](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Memory is an opt-in switch that starts off; once on, facts are saved from chats and grouped by category Memory is an opt-in switch that starts off; once on, facts are saved from chats and grouped by category.
- Evidence: apps/web/features/settings/hooks/use-capabilities-preferences.ts:62; apps/web/features/settings/sections/MemorySection.tsx:320

## CMP-WP211

**Memory summary you edit by text or highlight, with Delete and turn off**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: The summary card is read-only with a refresh The summary card is read-only with a refresh; changes are made by editing or deleting individual memories.
- Evidence: apps/web/features/settings/components/MemorySummaryCard.tsx:66-135

## CMP-WP213

**Tell the assistant what to change or remove in memory**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md), [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Detail: The Memory pane has no such composer Saying remember or forget in chat saves or deletes memories and shows a receipt; the Memory pane has no such composer.
- Evidence: apps/web/features/chat/hooks/use-explicit-memory-commands.ts:26; searched: Tell .* what to change in features/settings

## GAP-AREA039-LW01

**Never-remember matching is a plain lowercase substring test with a 3-character minimum, with no word boundary. A short term matches inside other words (for example a 3-letter term inside a longer word), so an unrelated memory can be refused.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-039
- Detail: Area 39. Memory product
- Evidence: apps/web/lib/services/managed-memory-context-service.ts:353-360 (matchedMemoryExclusion), :70 (MIN_MEMORY_EXCLUSION_LENGTH is at :284 area)

## GAP-AREA039-LW02

**Mobile's sensitive-topic check runs only for facts with source 'learned'. A fact the person types as a memory is not checked for sensitive topics (only prohibited categories are checked), which is looser than the server path.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-039
- Detail: Area 39. Memory product
- Evidence: apps/mobile/src/features/memory/services/localMemoryWriter.ts (writeLocalMemoryFact, the refusedTopic check)

## GAP-AREA039-LW04

**The memory list route uses the same rate-limit bucket as chat conversations ('chat-conversation').**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-039
- Detail: Area 39. Memory product
- Evidence: apps/web/app/api/memory/route.ts:42, 111, 196, 111 (all memory handlers)

## GAP-CAP-memory-and-personalization-01

**Automatic memory from chats: Memory is off by default on web, but Claude and ChatGPT start with it on (comparison row WP208 is Partial). A tester saw 'please remember this' save nothing until the switch was found.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-02](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Requirement items: S39.12, S94.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-memory-and-personalization-02

**Memory master switch and default: No Chrome switch. No first-run memory onboarding on any app (S39.01 missing on all six). The 'Save memories from chats' switch looks on while the master switch is off and cannot be changed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Requirement items: S39.01, S39.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-03

**Pause and reset memory: No reset on CLI or Chrome. Whether pause is a distinct state from off was not established.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-05](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Requirement items: S39.15, S39.30
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-04

**View, search, edit, pin and delete saved memories: Small per-app holes: search on CLI and Chrome, pin on VS Code and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md), [F039-04](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md), [F039-05](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md), [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md), [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)
- Requirement items: S39.04, S39.05, S39.06, S39.10, S39.13, S39.14, S39.16, S94.03
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-memory-and-personalization-05

**Tell the assistant to remember, change or forget: Web handles 'change' and 'remove' only partly. The save confirmation read 'already saved' on a first save, with a stray space.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md), [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Requirement items: S39.11, S94.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-06

**Turn memory off for one chat: The ledger marks CLI and VS Code missing and the Chrome status is unclear between ledger and comparison; mobile per-chat switch is Partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md), [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Requirement items: S39.28, S94.20
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-memory-and-personalization-07

**Temporary or incognito chat: CLI and VS Code are missing in the ledger. Not exercised by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md), [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Requirement items: S39.28, S94.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-memory-and-personalization-08

**Project-scoped memory: The ledger and the comparison disagree for mobile. VS Code and Chrome have no project memory.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md), [F040-05](../../20-features/040-instructions-preferences-and-personal-style/F040-05-standing-custom-instructions-and-project-instructi.md), [F094-05](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Requirement items: S39.24, S40.30, S94.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-09

**Reference past chats: No past-chat switch on CLI, VS Code or Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md), [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Requirement items: S39.03, S94.22
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-10

**Memory sources shown under replies: The ledger says mobile is missing; the comparison says Same. Not settled. Not on CLI, VS Code or Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md), [F094-08](../../20-features/094-memory-and-personalization-components/F094-08-attribution-of-replies-to-memories-and-past-chats.md)
- Requirement items: S39.27, S94.18
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-11

**Editable memory summary: The decision says web and desktop show no summary, but code has a summary card. The decision text and the code disagree. ChatGPT now has an editable summary, which postdates the decision.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Requirement items: S39.07, S39.08
- Detail: Claude no, ChatGPT yes; AGI off by decision

## GAP-CAP-memory-and-personalization-13

**Sensitive-topic controls and never-remembered data: None known in code. Not exercised by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md), [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Requirement items: S39.29, S94.17, S94.19
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-memory-and-personalization-14

**Import memory from another assistant: No VS Code or Chrome import. Not run by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md), [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Requirement items: S39.21, S94.07, S94.12
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-memory-and-personalization-15

**Export memory: The ledger and comparison disagree for mobile. No VS Code or Chrome export.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md), [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Requirement items: S39.22, S94.12
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-memory-and-personalization-16

**Memory capacity, automatic clean-up, search and version restore: No capacity display, plan limit, or version restore on web, desktop or mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md), [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md), [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md), [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Requirement items: S39.19, S39.20, S39.23, S94.07, S94.08, S94.09, S94.10, S94.15
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-17

**Memory shared with cloud agent work and dots: No per-agent memory store.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md), [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Requirement items: S39.25, S94.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-20

**Organization-wide instructions and memory admin controls: No org-wide instructions or owner memory switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Requirement items: S39.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-24

**Coding agent auto memory and memory commands: No auto-memory folder choice, subagent memory or /dream consolidation (partial). VS Code agent does not write its own notes.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Requirement items: S39.32
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-27

**Recap of recent activity (Reflect and year-end recap): No CLI, VS Code or Chrome recap beyond CLI session recap, which is missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md), [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Requirement items: S39.09, S94.21
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-memory-and-personalization-29

**Same personalization with every model, and Local mode separation: Not shown in code reading whether the person is told, or consents, when account memory is fed to a local model on desktop. The mobile cross-model status is blank in the ledger.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Requirement items: S39.31, S39.32
- Detail: Claude no, ChatGPT no; AGI partly built

## GAP-F039-01-01

**No Memory introduction or first-run flow on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Detail: Affects: All new users, all six apps. Work needed: Founder decision, then a short explainer or a link from the first memory-related moment.
- Evidence: Brief S39.01 all missing; docs/decisions/2026-09-27-founder-decisions.md:130 says no memory step at sign-up

## GAP-F039-01-02

**Chrome has no Memory switch or past-chat switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Detail: Affects: Chrome users. Work needed: Add a switch or a link to web settings; the server already honours the account switch for chrome turns [inferred from request-processor.ts:2392-2406 not excluding chrome].
- Evidence: Brief S39.02/S39.03 chrome missing; no switch in memorySheet.ts

## GAP-F039-01-03

**VS Code switch does not change the account switch and its label says account memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Detail: Affects: VS Code users. Work needed: Relabel or write the account setting.
- Evidence: commandSetup.ts:1955,2037-2054

## GAP-F039-01-04

**CLI and VS Code lack a past-chat switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Detail: Affects: CLI, VS Code. Work needed: Add the switch or document the decision.
- Evidence: Brief S39.03; lib.rs:1435-1486

## GAP-F039-01-05

**Tauri desktop tab lacks a past-chat switch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Detail: Affects: Internal Tauri desktop. Work needed: Confirm whether the Tauri build is still shipped; add or retire.
- Evidence: Memory.tsx has no past-chat control

## GAP-F039-01-NOTBUILT

**Turn Memory on or off: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md)
- Requirement items: S39.01, S39.02, S39.03
- Detail: Web: S39.01; Desktop: S39.01; Mobile: S39.01; CLI: S39.01, S39.03; VS Code: S39.01, S39.03; Chrome: S39.01, S39.02, S39.03

## GAP-F039-02-01

**No visible confirmation or undo when a chat saved a learned fact.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-02](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md)
- Detail: Affects: All apps. Work needed: Design a lightweight notice if wanted.
- Evidence: No notice found in the code opened

## GAP-F039-02-02

**Auto-save on CLI, VS Code and Chrome is inferred, not confirmed in those apps' code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-02](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Verify with a live turn per surface.
- Evidence: Brief marks done; server gate only excludes api

## GAP-F039-02-03

**Contradiction handling covers only five topics.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-02](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md)
- Detail: Affects: All apps. Work needed: Extend topics or use model judgement.
- Evidence: packages/ai/agent-core/src/memory.ts:612-619

## GAP-F039-03-01

**CLI and VS Code chat Remember sentences not shown to reach the account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md)
- Detail: Affects: CLI, VS Code. Work needed: Verify live; wire or document.
- Evidence: No /api/memory/commands call found in apps/cli/src; registry.rs:1933-2040 writes instruction files

## GAP-F039-03-02

**No never-remember list in mobile Local mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md)
- Detail: Affects: Mobile Local. Work needed: Add exclusions locally or record a decision.
- Evidence: memory.tsx:569; localMemoryWriter.ts:25-75

## GAP-F039-03-03

**Refusal feedback after mobile Cloud sync not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md)
- Detail: Affects: Mobile Cloud. Work needed: Trace the rejected response into the UI.
- Evidence: store.ts:176-200; sync/route.ts:206-212

## GAP-F039-03-04

**Brief code pointers for CLI and Chrome remember lines are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: side_panel.ts lines 10613 and 10647 in the brief are unrelated code

## GAP-F039-04-01

**No search on CLI or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-04](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Detail: Affects: CLI, Chrome. Work needed: Add search.
- Evidence: Brief S39.05; lib.rs:1435-1486; memorySheet.ts

## GAP-F039-04-02

**No grouping on Chrome; Chrome shows one page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-04](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Detail: Affects: Chrome. Work needed: Group and page.
- Evidence: memorySheet.ts:195-221

## GAP-F039-04-03

**Chrome updated-time display not shown in code found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-04](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Detail: Affects: Chrome. Work needed: Confirm or add.
- Evidence: memorySheet.ts:111-125

## GAP-F039-04-04

**Project-only badge not shown on mobile or VS Code in the code I opened.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-04](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Detail: Affects: Mobile, VS Code. Work needed: Show the project label when project memories are listed.
- Evidence: Brief S39.24 mobile and vscode missing

## GAP-F039-04-NOTBUILT

**Review the Saved Memory list: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F039-04](../../20-features/039-memory-product/F039-04-review-the-saved-memory-list.md)
- Requirement items: S39.05, S39.06
- Detail: CLI: S39.05; Chrome: S39.05, S39.06

## GAP-F039-05-01

**CLI and Chrome cannot delete all or reset memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-05](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Detail: Affects: CLI, Chrome. Work needed: Add a confirmed reset on both.
- Evidence: Brief S39.15 and S39.30; lib.rs:1435-1486; memorySheet.ts

## GAP-F039-05-02

**The interface does not say that deleting a chat leaves its learned memories.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-05](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Detail: Affects: All apps. Work needed: Add a message or an option when deleting a chat.
- Evidence: No chat deletion code touches user_memories; brief S39.30 requires no silent keep

## GAP-F039-05-03

**Delete one always reports success.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-05](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Detail: Affects: Web, API clients. Work needed: Return 404 when no row changed.
- Evidence: route [id]:150-170

## GAP-F039-05-04

**Edited text may duplicate another fact without merge.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-05](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Detail: Affects: All apps. Work needed: Run the duplicate check on edit.
- Evidence: route [id]:100-135

## GAP-F039-05-NOTBUILT

**Edit, delete and reset memory: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F039-05](../../20-features/039-memory-product/F039-05-edit-delete-and-reset-memory.md)
- Requirement items: S39.15, S39.30
- Detail: CLI: S39.15, S39.30; Chrome: S39.15, S39.30

## GAP-F039-06-01

**Only five topics are detected as contradictions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Detail: Affects: All apps. Work needed: Broaden or use a model judgement with the same replaced list.
- Evidence: packages/ai/agent-core/src/memory.ts:612-619

## GAP-F039-06-02

**Chrome conflict and stale-correction view not found despite the brief saying done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Detail: Affects: Chrome. Work needed: Verify live; add a view or correct the brief.
- Evidence: memorySheet.ts and memoryClient.ts contain no conflict code; brief code pointers are stale

## GAP-F039-06-03

**No pin on VS Code and Chrome; no replaced list on CLI, VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Detail: Affects: VS Code, Chrome, CLI. Work needed: Add controls.
- Evidence: Brief S39.16, S39.19, S39.20; package.json:479-510

## GAP-F039-06-04

**Edit does not re-check conflicts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Detail: Affects: All apps. Work needed: Run the write path on edit.
- Evidence: route [id]:100-135

## GAP-F039-06-05

**Unconnected consolidation sweep.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Detail: Affects: Server. Work needed: Decide: schedule or delete.
- Evidence: consolidateMemories defined at managed-memory-context-service.ts:1054, no caller found

## GAP-F039-06-NOTBUILT

**Pin, correct stale facts and settle conflicts: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md)
- Requirement items: S39.16, S39.19, S39.20
- Detail: CLI: S39.19, S39.20; VS Code: S39.16, S39.19, S39.20; Chrome: S39.16, S39.19, S39.20

## GAP-F039-07-01

**No profile or preference summary on desktop (Tauri), mobile (Cloud mode), CLI, VS Code and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome users. Work needed: Decide per app (mobile has a standing decision against it); add a card reusing the endpoint where wanted
- Evidence: Grep of apps/desktop/src, apps/mobile, apps/cli, apps/extension-vscode, apps/extension found /api/memory/summary only in web code

## GAP-F039-07-02

**Ongoing work is derived from chats, not memories**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: Affects: Brief item S39.09 and testers reading it. Work needed: Correct the brief wording or change the source
- Evidence: reflect-service.ts:104,277

## GAP-F039-07-03

**Desktop Tauri Reflect shows no Work in progress list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: Affects: Desktop (Tauri build) users. Work needed: Render recap.ongoingWork as web does
- Evidence: apps/desktop/src/features/settings/cloud/CloudReflectSection.tsx

## GAP-F039-07-04

**Docs say web shows no summary**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: Affects: Anyone reading the decision record. Work needed: Update the decision text and the brief
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:294 versus MemorySummaryCard.tsx

## GAP-F039-07-05

**Mobile footer says Generated though nothing is generated by a model**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: Affects: Mobile users. Work needed: Reword
- Evidence: memory-summary.tsx footer text

## GAP-F039-07-06

**Free-plan access to summary writes is unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Detail: Affects: Free users on web. Work needed: Trace admission for the Free plan and record it
- Evidence: route.ts:79 and admitManagedCloudRoute outcome not traced

## GAP-F039-07-NOTBUILT

**Summaries of what the assistant knows: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md)
- Requirement items: S39.07, S39.08, S39.09
- Detail: Web: S39.07, S39.08; Desktop: S39.07, S39.08; Mobile: S39.08; CLI: S39.07, S39.08, S39.09; VS Code: S39.07, S39.08, S39.09; Chrome: S39.07, S39.08, S39.09

## GAP-F039-08-01

**CLI ignores a project's opt-out from global memory**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Detail: Affects: CLI users in projects set to project-only. Work needed: Carry uses_global_memory in the CLI project cache and filter
- Evidence: apps/cli/src/cloud/memory.rs:199; no uses_global reference in apps/cli/src

## GAP-F039-08-02

**No agent-specific memory in any app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Detail: Affects: All apps; users of custom agents. Work needed: Product decision and data model (scope column or table) before building
- Evidence: No code found (S39.25 brief status missing in all six apps)

## GAP-F039-08-03

**Project memory missing in VS Code and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Add project id to the memory clients or document as not planned
- Evidence: No code found in apps/extension-vscode/src/memory or apps/extension/src/features/side-panel/memorySheet.ts

## GAP-F039-08-04

**Mobile list lacks a visible project badge**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Detail: Affects: Mobile users. Work needed: Add a visible label
- Evidence: MemoryItem.tsx:66 is an accessibility string only

## GAP-F039-08-05

**Brief says mobile project memory is missing but code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Detail: Affects: Brief readers. Work needed: Correct the brief
- Evidence: ProjectSettingsScreen.tsx:234

## GAP-F039-08-06

**Desktop Tauri folder memory is a different concept from account project memory**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Detail: Affects: Desktop Tauri users. Work needed: Name the two clearly or unify
- Evidence: ProjectMemorySection.tsx:124-130

## GAP-F039-08-NOTBUILT

**Project-scoped and agent-scoped memory: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F039-08](../../20-features/039-memory-product/F039-08-project-scoped-and-agent-scoped-memory.md)
- Requirement items: S39.24, S39.25
- Detail: Web: S39.25; Desktop: S39.25; CLI: S39.25; VS Code: S39.24, S39.25; Chrome: S39.24, S39.25

## GAP-F039-09-01

**No scope label in desktop Tauri Memory tab or Chrome memory sheet**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Detail: Affects: Desktop Tauri and Chrome users in a workspace. Work needed: Read the active workspace and show it, as VS Code does
- Evidence: Zero matches for workspace, organization, personal in the three files named above

## GAP-F039-09-02

**Brief cites the workspace sharing page and a mobile workspace tab, neither of which holds memory scoping**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Detail: Affects: Brief readers and testers. Work needed: Correct the brief
- Evidence: apps/web/app/workspace/sharing/page.tsx; memory.tsx:72

## GAP-F039-09-03

**CLI memory cache workspace isolation unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Detail: Affects: CLI users who switch workspace. Work needed: Read the cache logic and add a test
- Evidence: apps/cli/src/cloud/memory.rs

## GAP-F039-09-04

**Import relies on a database default for organization_id**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Detail: Affects: All importers. Work needed: Name the column or test the default under import
- Evidence: apps/web/lib/memory/import-store.ts:63

## GAP-F039-09-05

**Brief marks desktop, CLI, VS Code and Chrome done; labels exist only on web, mobile, CLI and VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-09](../../20-features/039-memory-product/F039-09-work-and-organization-knowledge-kept-apart.md)
- Detail: Affects: Status reporting. Work needed: Re-grade after label work
- Evidence: see above

## GAP-F039-10-01

**CLI import shows no preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Detail: Affects: CLI users. Work needed: Print candidates and confirm, or add a dry-run option
- Evidence: apps/cli/src/cloud/mod.rs:816-845

## GAP-F039-10-02

**No import or export in VS Code and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Decide whether to add or point to web
- Evidence: No code found

## GAP-F039-10-03

**No memory-only export on mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Detail: Affects: Mobile users. Work needed: Add Export memories to the Memory screen
- Evidence: data-controls/index.tsx:433,601

## GAP-F039-10-04

**Desktop Tauri Cloud scope lacks import and export**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Detail: Affects: Desktop Tauri Cloud-mode users. Work needed: Show the controls in the Cloud tab or confirm Electron covers it
- Evidence: Memory.tsx:233,265

## GAP-F039-10-05

**Export is JSON only on web and CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Detail: Affects: People wanting a readable file. Work needed: Add a Markdown option
- Evidence: export/route.ts:48

## GAP-F039-10-06

**Edit before save not confirmed in the web preview**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Detail: Affects: Web importers. Work needed: Confirm and add if missing
- Evidence: docs/product/requirements.md:1521 versus the dialog code read

## GAP-F039-10-NOTBUILT

**Import and export memories: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md)
- Requirement items: S39.21, S39.22
- Detail: VS Code: S39.21, S39.22; Chrome: S39.21, S39.22

## GAP-F039-11-01

**The person cannot see which memories fall outside the cap**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md)
- Detail: Affects: CLI users. Work needed: Keep or list the trimmed facts
- Evidence: memory_pipeline.rs:127-147 drops lines with no record

## GAP-F039-11-02

**Stored count and cap use different units**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md)
- Detail: Affects: CLI users with several projects. Work needed: Show per-file counts or cap the total
- Evidence: memory_pipeline.rs:149 versus :495

## GAP-F039-11-03

**Save key not shown in the hint**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md)
- Detail: Affects: CLI users. Work needed: Add S save to the hint
- Evidence: memories_settings.rs:122

## GAP-F039-11-04

**No capacity display in web, desktop, mobile, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md)
- Detail: Affects: All other apps. Work needed: Decide whether account memory needs a visible limit; show prompt-limit note
- Evidence: No code found; internal limits exist but are hidden

## GAP-F039-11-05

**Overlay only in terminal UI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md)
- Detail: Affects: Line REPL users. Work needed: Offer a command form
- Evidence: tui_app.rs:4510-4519

## GAP-F039-11-NOTBUILT

**Capacity display: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md)
- Requirement items: S39.23
- Detail: Web: S39.23; Desktop: S39.23; Mobile: S39.23; VS Code: S39.23; Chrome: S39.23

## GAP-F039-12-01

**Mobile Local mode ignores the never-remember terms**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Affects: Mobile Local users. Work needed: Keep a device copy of the list and check it in the local writer
- Evidence: localMemoryWriter.ts:25-35; excludedTerms only in memory-exclusions.tsx

## GAP-F039-12-02

**No never-remember UI in desktop Tauri and Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Affects: Desktop Tauri and Chrome users. Work needed: Add the control or link to web
- Evidence: No exclusion code in apps/desktop/src or apps/extension/src

## GAP-F039-12-03

**No temporary-chat exclusion in CLI and VS Code; Chrome unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Affects: CLI, VS Code, Chrome users. Work needed: Add a temporary mode or verify and document Chrome
- Evidence: Only --no-memory in CLI (lib.rs:6691)

## GAP-F039-12-04

**Memory-used indication missing in CLI, VS Code, Chrome and desktop Tauri**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Affects: Those apps. Work needed: Render citations from the reply metadata
- Evidence: Grep for memoryCitations found only web and mobile code

## GAP-F039-12-05

**Brief says mobile lacks the memory-used indication**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Affects: Brief readers. Work needed: Correct the brief
- Evidence: MemoryUsedChip.tsx:13

## GAP-F039-12-06

**Brief says all six apps have never-remember with refusal; UI exists on four apps and enforcement is server-side**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Affects: Status reporting. Work needed: Regrade
- Evidence: see where to find it

## GAP-F039-12-07

**Exclusion check on existing memories does not remove them**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Detail: Affects: All users. Work needed: Offer to review existing matches
- Evidence: MemoryExclusions.tsx:162 copy

## GAP-F039-12-NOTBUILT

**Privacy rules, temporary chats and where memory applies: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F039-12](../../20-features/039-memory-product/F039-12-privacy-rules-temporary-chats-and-where-memory-app.md)
- Requirement items: S39.27, S39.28
- Detail: Mobile: S39.27; CLI: S39.27, S39.28; VS Code: S39.27, S39.28; Chrome: S39.27, S39.28
