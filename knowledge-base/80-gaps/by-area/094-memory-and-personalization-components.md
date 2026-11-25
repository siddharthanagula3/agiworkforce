---
id: "GAPS-AREA-094"
type: "gap-list"
title: "Gaps: Memory and personalization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 94. Memory and personalization components

71 open gaps that touch this area. Area page: [20-features/094-memory-and-personalization-components](../../20-features/094-memory-and-personalization-components/README.md).

## CMP-M166

**Export memories**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F039-10](../../20-features/039-memory-product/F039-10-import-and-export-memories.md), [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Detail: No memory export; only import and delete exist.
- Evidence: searched: export memory in apps/mobile/app/(app)/settings, apps/mobile/src/features/memory

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

## CMP-W281

**Memory capacity by plan and automatic clean-up of stale memories**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md), [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md), [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md), [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Saved facts have no stated capacity by plan and nothing prunes or merges stale facts; the list only pages 1,000 at a time.
- Evidence: apps/web/app/api/memory/sync/route.ts:29; searched: memory limit, maxMemories, MAX_MEMOR in apps/web/lib/memory, apps/web/features/memory, packages/contracts/types/src/billing-catalog.ts

## CMP-W284

**Reference my writing style and record history**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md), [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Detail: No writing-style capture or record-history setting.
- Evidence: searched: writing style, record history in apps/web features, lib

## CMP-W285

**Restore earlier versions of memory and prioritize items**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-06](../../20-features/039-memory-product/F039-06-pin-correct-stale-facts-and-settle-conflicts.md), [F039-11](../../20-features/039-memory-product/F039-11-capacity-display.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md), [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md), [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Memory items can be edited and deleted but there is no version history or restore.
- Evidence: searched: memory version, restore, prioritize in apps/web/features/memory, settings

## CMP-WP208

**Memory on by default, built from your chats**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-01](../../20-features/039-memory-product/F039-01-turn-memory-on-or-off.md), [F039-02](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Memory is an opt-in switch that starts off; once on, facts are saved from chats and grouped by category Memory is an opt-in switch that starts off; once on, facts are saved from chats and grouped by category.
- Evidence: apps/web/features/settings/hooks/use-capabilities-preferences.ts:62; apps/web/features/settings/sections/MemorySection.tsx:320

## CMP-WP213

**Tell the assistant what to change or remove in memory**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F039-03](../../20-features/039-memory-product/F039-03-add-a-memory-by-hand-or-by-asking.md), [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Detail: The Memory pane has no such composer Saying remember or forget in chat saves or deletes memories and shows a receipt; the Memory pane has no such composer.
- Evidence: apps/web/features/chat/hooks/use-explicit-memory-commands.ts:26; searched: Tell .* what to change in features/settings

## GAP-AREA094-LW06

**The agent-specific memory is not built, but the write path already accepts an agent id and records it in provenance, with no store reading it. This is a half-built hook.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-094
- Detail: Area 94. Memory and personalization components
- Evidence: apps/web/lib/services/managed-memory-context-service.ts:476-505, 1343-1376

## GAP-AREA094-LW08

**The writing-style item: the only writing-style code is a four-option composer tone stored on the device. It is not a generated profile, so the 'platform missing' status is right but the name is easy to confuse.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-094
- Detail: Area 94. Memory and personalization components
- Evidence: packages/ui/unified-chat/src/lib/writingStyle.ts:1-30

## GAP-CAP-memory-and-personalization-01

**Automatic memory from chats: Memory is off by default on web, but Claude and ChatGPT start with it on (comparison row WP208 is Partial). A tester saw 'please remember this' save nothing until the switch was found.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-02](../../20-features/039-memory-product/F039-02-automatic-saving-after-chats.md), [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Requirement items: S39.12, S94.01
- Detail: Claude yes, ChatGPT yes; AGI built

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

## GAP-CAP-memory-and-personalization-22

**Custom and learned writing style: No connected-source learning, no summary, none on mobile, CLI, VS Code or Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F040-08](../../20-features/040-instructions-preferences-and-personal-style/F040-08-learn-style-from-writing-samples.md), [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Requirement items: S40.20, S40.21, S40.22, S94.16
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-memory-and-personalization-27

**Recap of recent activity (Reflect and year-end recap): No CLI, VS Code or Chrome recap beyond CLI session recap, which is missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F039-07](../../20-features/039-memory-product/F039-07-summaries-of-what-the-assistant-knows.md), [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Requirement items: S39.09, S94.21
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-F094-01-01

**Contradiction handling covers only name, residence, employer, role and origin.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Affects: All Cloud users; other changed facts duplicate.. Work needed: Broaden topics or add model-judged conflicts; add tests per topic.
- Evidence: packages/ai/agent-core/src/memory.ts:612-619

## GAP-F094-01-02

**Provenance omits model, provider route and prompt version that the migration comment describes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Affects: Audit and 'why did it remember this' views on every app.. Work needed: Pass those values into memoryProvenance and add a test.
- Evidence: apps/web/lib/services/managed-memory-context-service.ts:494-505; apps/web/db/neon/0285_user_memories_provenance.sql:40

## GAP-F094-01-03

**Web Local and own-key turns have no on-device learning; only Mobile Local and the CLI do.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Affects: Web and Desktop users on local or own-key models.. Work needed: Decide the product answer for the three-mode rule and add an on-device store on Web/Desktop if wanted.
- Evidence: apps/web/lib/services/managed-memory-context-service.ts:654-662

## GAP-F094-01-04

**No visible confirmation when a memory is learned.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Affects: All apps.. Work needed: Optional UI note with undo.
- Evidence: apps/web/lib/services/managed-auto-memory-service.ts:128-137 logs only

## GAP-F094-01-05

**Brief marks S94.01 to S94.08 'platform done' but gives no per-app status; per-app depth for Desktop (Tauri), VS Code, Chrome learning is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Affects: Desktop, VS Code, Chrome.. Work needed: Read each app's turn path and record whether learning happens server-side for its Managed turns.
- Evidence: doc: knowledge-base/data/area-briefs/094-memory-and-personalization-components.md

## GAP-F094-01-06

**Migration 0285 header says 'NOT YET APPLIED : draft only'; whether production has it is not recorded in files read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-01](../../20-features/094-memory-and-personalization-components/F094-01-learn-facts-from-chats.md)
- Detail: Affects: Provenance writes in any environment missing the columns.. Work needed: Check the migration ledger with pnpm db:migrate -- status.
- Evidence: apps/web/db/neon/0285_user_memories_provenance.sql:3

## GAP-F094-02-01

**Forget in a temporary chat is allowed by the server but not offered by Web or Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Detail: Affects: Web and Mobile users in temporary chats.. Work needed: Decide the rule and align code and comment.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:2628-2630; apps/mobile/stores/chat/chatExecutionStore.ts:2961; apps/web/lib/services/memory-commands.ts:73-74

## GAP-F094-02-02

**Web Local-model turns skip commands, so a 'remember' does nothing for the account memory and gives no receipt.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Detail: Affects: Web and Desktop users with local models.. Work needed: Either route the command to account memory (managed storage with consent) or show a notice.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:2628-2630

## GAP-F094-02-03

**Remember cannot set an expiry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Detail: Affects: All apps.. Work needed: Parse 'for N days' and pass expiresAt.
- Evidence: apps/web/lib/services/memory-commands.ts:122-141

## GAP-F094-02-04

**Mobile Local commands skip the never-remember list and sensitive-topic checks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Detail: Affects: Mobile Local users.. Work needed: Apply the on-device exclusion list.
- Evidence: apps/mobile/src/features/memory/services/memoryCommands.ts:98-111

## GAP-F094-02-05

**Command UIs for CLI, VS Code and Desktop (Tauri) not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-02](../../20-features/094-memory-and-personalization-components/F094-02-explicit-remember-and-forget-commands.md)
- Detail: Affects: CLI, VS Code, Desktop Tauri.. Work needed: Read those apps and record status.
- Evidence: not found in files read

## GAP-F094-03-01

**No expiry control in any memory UI read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)
- Detail: Affects: All apps.. Work needed: Add an expiry field and clear action.
- Evidence: packages/ui/unified-chat/src/components/MemoryEditor.tsx; apps/web/app/api/memory/route.ts:121-124

## GAP-F094-03-02

**Chrome extension has no pin; VS Code and CLI pin not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)
- Detail: Affects: Chrome, VS Code, CLI.. Work needed: Add pin or document the exception.
- Evidence: apps/extension/src/features/cloud-bridge/memoryClient.ts:19-26

## GAP-F094-03-03

**Account export includes tombstone rows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)
- Detail: Affects: People exporting account data.. Work needed: Filter is_deleted rows or label them.
- Evidence: apps/web/app/api/user/export/route.ts:2938-2948

## GAP-F094-03-04

**Per-app UI depth for Desktop Tauri, VS Code and CLI was not read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-03](../../20-features/094-memory-and-personalization-components/F094-03-manage-saved-memories-list-pin-delete.md)
- Detail: Affects: Those apps.. Work needed: Read and record.
- Evidence: files listed in implementation_map

## GAP-F094-04-01

**No UI to set an expiry; remember command cannot set one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Affects: All apps.. Work needed: Add UI and command phrasing.
- Evidence: apps/web/lib/services/memory-commands.ts:122-141

## GAP-F094-04-02

**Expired rows stay as tombstones forever.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Affects: Storage size.. Work needed: Decide a purge age after sync clients have seen the tombstone.
- Evidence: apps/web/lib/services/managed-memory-context-service.ts:391-392

## GAP-F094-04-03

**Local stores (Mobile Local, CLI files) have no expiry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Affects: Mobile Local, CLI.. Work needed: Decide whether Local memory should expire.
- Evidence: apps/mobile/storage/memory.ts:1-60 has no expiry column

## GAP-F094-04-04

**Cron schedule time 03:05 UTC is not documented against production enablement.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-04](../../20-features/094-memory-and-personalization-components/F094-04-expiry-and-background-upkeep.md)
- Detail: Affects: Operations.. Work needed: Confirm in the deployment.
- Evidence: vercel.json:106-107

## GAP-F094-05-01

**Ranking is lexical only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-05](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Detail: Affects: All Cloud users; paraphrases miss.. Work needed: Evaluate embedding ranking using the shadow hook.
- Evidence: apps/web/lib/services/managed-memory-context-service.ts:1091-1126

## GAP-F094-05-02

**Own-key (BYOK) account-memory rule not established; Local-to-BYOK consent rule applies.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-05](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Detail: Affects: Web, Desktop own-key users.. Work needed: Trace how an own-key turn reaches the chat route and whether memory is added.
- Evidence: doc: AGENTS.md section 6

## GAP-F094-05-03

**Web local-model turns receive account memory through a network fetch; no offline fallback.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-05](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Detail: Affects: Web and Desktop users on local models.. Work needed: Decide on offline cache or a device store.
- Evidence: apps/web/app/api/memory/local-context/route.ts:12-28

## GAP-F094-05-04

**Brief code references for request-processor are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-05](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Detail: Affects: Documentation.. Work needed: Update the brief.
- Evidence: knowledge-base/data/area-briefs/094-memory-and-personalization-components.md S94.05 cites request-processor.ts:2904

## GAP-F094-05-05

**Web display of memory citations not located.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-05](../../20-features/094-memory-and-personalization-components/F094-05-use-memories-in-replies-retrieval-ranking-scope.md)
- Detail: Affects: Web.. Work needed: Check where the header is read.
- Evidence: packages/contracts/types/src/memory-wire.ts:9-10

## GAP-F094-06-01

**Import and export exist on Web (and Desktop hosted web) and Mobile only; Chrome, VS Code and CLI have none found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Detail: Affects: Chrome, VS Code, CLI users.. Work needed: Decide whether the Web page is the single home and say so, or add commands.
- Evidence: memory UIs in implementation_map of F094-03

## GAP-F094-06-02

**Import does not apply near-duplicate merge or topic supersede at write.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Detail: Affects: People importing overlapping lists.. Work needed: Call writeConsolidatedMemory per item or rely on the daily job.
- Evidence: apps/web/lib/memory/import-store.ts:56-71

## GAP-F094-06-03

**Account export includes tombstones and omits pinned and expiry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Detail: Affects: Data export users.. Work needed: Align the account export fields with the memory export.
- Evidence: apps/web/app/api/user/export/route.ts:408-416,2938-2948

## GAP-F094-06-04

**Export is one in-memory JSON array up to 50,000 records.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-06](../../20-features/094-memory-and-personalization-components/F094-06-import-and-export-memories.md)
- Detail: Affects: Very large accounts.. Work needed: Stream or paginate if limits are raised.
- Evidence: apps/web/app/api/memory/export/route.ts:62-107

## GAP-F094-07-01

**Scheduled runs and the Slack assistant ignore suppressed sources**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: Affects: Anyone who suppresses a source and also uses schedules or Slack answers (web account, any app that creates schedules). Work needed: Load suppressed sources and pass them to both loaders; add tests.
- Evidence: apps/web/lib/services/scheduled-agent-executor.ts:431-436; apps/web/lib/slack/slack-assistant-turn.ts:189-194 pass no suppressedSources

## GAP-F094-07-02

**No never-remember or source controls on the desktop and Chrome apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: Affects: Desktop and Chrome users. Work needed: Add the controls or decide the web link is enough; record the decision.
- Evidence: no matches for excludedTerms or suppressedSources in apps/desktop/src or apps/extension/src

## GAP-F094-07-03

**VS Code and CLI cannot set suppressed sources, and VS Code does not check term length**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: Affects: VS Code and CLI users. Work needed: Add source switches; validate length client side.
- Evidence: apps/extension-vscode/src/memory/memoryExclusions.ts:62-77; apps/cli/src/cloud/personalization.rs:330-362

## GAP-F094-07-04

**The server does not validate the memory preference namespace on save and has no maximum term length**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: Affects: All clients that save terms. Work needed: Validate on save and cap term length.
- Evidence: apps/web/app/api/settings/preferences/route.ts:27-35 accepts any record; managed-memory-context-service.ts:286-297

## GAP-F094-07-05

**Existing memories containing a new term stay in use**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: Affects: Web and mobile users who add a term later. Work needed: Decide whether to filter on read or offer a cleanup; this may be intended.
- Evidence: MemoryExclusions.tsx:165; managed-memory-context-service.ts:1170-1183

## GAP-F094-07-06

**Temporary conversation rows live up to 30 days while the copy says nothing is kept**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: Affects: Web and mobile Cloud users. Work needed: Confirm what the row and its files contain and align the copy or the retention.
- Evidence: apps/web/app/api/cron/purge-temporary-chats/route.ts:23; apps/web/lib/temporary-chat-policy.ts:50-51

## GAP-F094-07-07

**Whether account lists apply to on-device (Local mode) memory is unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-07](../../20-features/094-memory-and-personalization-components/F094-07-personalization-source-choices-and-never-remember.md)
- Detail: Affects: Mobile and desktop Local mode. Work needed: Read the on-device memory write path and state the rule.
- Evidence: mobile row hidden outside Cloud mode (memory.tsx:568); no desktop code found

## GAP-F094-08-01

**Server does not persist memory citations with the assistant turn**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-08](../../20-features/094-memory-and-personalization-components/F094-08-attribution-of-replies-to-memories-and-past-chats.md)
- Detail: Affects: Any client that disconnects before saving; desktop and extensions have no display at all. Work needed: Add the field to server-side persistence or correct the brief.
- Evidence: assistant-turn-persistence.ts:300-340 has no memory field; brief item S94.18 claims storage there

## GAP-F094-08-02

**No display on desktop, CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-08](../../20-features/094-memory-and-personalization-components/F094-08-attribution-of-replies-to-memories-and-past-chats.md)
- Detail: Affects: Those surfaces. Work needed: Build the display or record why not.
- Evidence: no memoryCitations in their source

## GAP-F094-08-03

**Citation means 'was in the prompt', not 'was used in the answer'**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-08](../../20-features/094-memory-and-personalization-components/F094-08-attribution-of-replies-to-memories-and-past-chats.md)
- Detail: Affects: All users reading the list. Work needed: Word the label accordingly or add a usage signal.
- Evidence: turn-context-service.ts:213-218

## GAP-F094-09-01

**The brief's 'day, week' ranges do not exist; ranges start at 30 days**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Detail: Affects: Web, desktop, mobile Reflect users. Work needed: Update the brief or add shorter ranges.
- Evidence: packages/contracts/cloud-contracts/src/conversations.ts:104

## GAP-F094-09-02

**Suppressed sources and relevance ranking are not applied to scheduled-run memory**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Detail: Affects: Schedule users on any app. Work needed: Pass suppressed sources and a query.
- Evidence: scheduled-agent-executor.ts:431-436

## GAP-F094-09-03

**Desktop schedule form has no 'Recent chats'; mobile has no source picker**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Detail: Affects: Desktop and mobile schedule creators. Work needed: Add the control or document web-only.
- Evidence: DesktopScheduleAccessFields.tsx:30-38; no 'sources' in apps/mobile/src/features/schedules components

## GAP-F094-09-04

**Reflect is not on CLI, VS Code or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Detail: Affects: Those users. Work needed: Decide whether needed.
- Evidence: no code found

## GAP-F094-09-05

**Reflect gate uses the memory switch although the recap reads chats, not memories**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-09](../../20-features/094-memory-and-personalization-components/F094-09-personal-recap-and-scheduled-run-context.md)
- Detail: Affects: People who want a recap without memory. Work needed: Confirm this is a product decision; the copy already tells the person.
- Evidence: reflect-service.ts:65-72

## GAP-F094-10-01

**No agent-specific memory store**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Detail: Affects: Custom-agent and scheduled-agent users on every app. Work needed: Design a scoped store, read path, UI and rules (F094-07 applies).
- Evidence: brief S94.14; persistManagedAutoMemoryFacts caller passes no agentId (managed-auto-memory-service.ts:120-128); no agent filter in loadManagedMemoryContext

## GAP-F094-10-02

**No writing-style profile generator**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Detail: Affects: All users. Work needed: Decide the product, consent and deletion model first, then build.
- Evidence: brief S94.16; only a fixed picker exists

## GAP-F094-10-03

**Style choice is device-only, not an account setting**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F094-10](../../20-features/094-memory-and-personalization-components/F094-10-agent-specific-memory-and-writing-style-profile-no.md)
- Detail: Affects: People who use more than one device. Work needed: Store in account preferences if it should follow the person.
- Evidence: writingStyle.ts:31-37
