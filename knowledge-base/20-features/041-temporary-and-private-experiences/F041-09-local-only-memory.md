---
id: "F041-09"
type: "feature"
title: "Local-only memory"
aliases: ["Local-only Memory", "On-device memory", "memory_facts", "raw_memories.md", "Memory summary", "S41.16"]
area: "41 Temporary and private experiences"
available_on: ["mobile", "cli"]
implementation: {web: "missing", desktop: "missing", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.16"]
depends_on: ["surface:mobile", "surface:cli", "surface:vscode", "surface:web", "surface:desktop", "surface:chrome", "mode:local", "mode:cloud", "table:memory_facts", "store:sqlite", "SYS-memory-projects-and-context", "SYS-local-inference", "SYS-sync-and-continuity", "SYS-security-and-privacy", "F041-08", "F041-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-09 Local-only memory

Memory kept only on the device. Mobile stores facts in a local table named memory_facts and shows 'On-device memory' in Local Mode. The CLI keeps memory as markdown files under its config folder, split by trust boundary, with the Local file raw_memories.md. Web, Desktop, VS Code and Chrome have no local-only memory.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.16](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4116).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Remembers facts and preferences for later chats without putting them in the AGI account. Mobile in Local Mode saves typed or learned facts in a device database. The CLI extracts a summary after each session and merges summaries into a memory file per trust boundary.

**Why it exists.** Memory must never silently absorb Local-only data into synced memory (doc: docs/product/requirements.md section 18 text on memory). Local, own key and Cloud memory stay separate.

**Who uses it.** Mobile Local Mode users and CLI developers who want continuity without cloud storage.

**Problems it solves**

- Personal facts are not uploaded to the account.
- Local memory is not mixed into BYOK or Managed prompts in the CLI.

**Use cases**

- Tell Mobile Local Mode your preferences and see them grouped under Memory summary.
- CLI remembers project conventions across sessions without leaving the machine.
- Review what is stored with /memory and /memories.
- Turn memory off or reset it.

## 2. User experience

**Where to find it**

- Mobile: Settings, Memory (row 'Memory'), then 'Memory summary'; in Local Mode the card reads 'On-device memory' (apps/mobile/app/(app)/settings/memory.tsx:558; apps/mobile/app/(app)/settings/memory-summary.tsx:46). Also 'Reset memory' and 'Never remember' rows.
- CLI: /memory (alias /mem) shows memory; /memories opens 'Memory settings' (auto memory, decay days, max facts) (apps/cli/src/tui/tui_app.rs:6330; apps/cli/src/tui/tui_app.rs:6518).
- VS Code: settings card 'Where your data goes' says Memory lives in the AGI Cloud account; button 'Memory' opens the memory tree. This is not local-only.
- Web, Desktop, Chrome: no local-only memory.

**Before you start**

- Mobile: memory switched on in local settings; otherwise the summary says 'Memory is off, so none of these are used in new chats.'
- CLI: auto memory on (default on).

**Screens and controls**

- Mobile Memory summary screen: sections of grouped facts, footer 'Generated from N memories on <date>. Source: memories saved on this device.' (apps/mobile/app/(app)/settings/memory-summary.tsx:140).
- CLI /memories overlay: toggle auto memory, decay threshold days, max facts, stored fact count.

**Journey**

1. Mobile: stay in Local Mode; tell the assistant a fact or add one in Settings, Memory; open Memory summary to see it grouped.
2. CLI: finish a session; a summary is written; on a later start the summaries merge into raw_memories.md; the next Local session carries it.
3. Person edits settings with /memories and saves.

**What the person sees and gets**

- Mobile empty state: 'Nothing learned yet' / 'Saved memories are grouped here.' (apps/mobile/app/(app)/settings/memory-summary.tsx:78).
- Mobile off banner: 'Memory is off, so none of these are used in new chats.'
- CLI system message 'Memory settings (arrows navigate, Enter toggle, Esc close)'.

**Settings**

- Mobile local memory switch (useLocalSettingsStore.memoryEnabled) separate from the Cloud one (useCloudSettingsStore.memoryEnabled) (apps/mobile/app/(app)/settings/memory-summary.tsx:35).
- CLI memories/settings.json: auto-memory, decay_threshold_days (default 30), max_facts (default 500) (apps/cli/src/memory_pipeline.rs:73).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile Local: facts inserted and read from the memory_facts table; no sync marking on the local path (apps/mobile/storage/memory.ts:34; apps/mobile/src/features/memory/store.ts:143).
- Mobile Cloud mode instead reads the cloud memory store and marks changes for sync, so the two are separate (apps/mobile/src/features/memory/store.ts:135).
- Mobile writer refuses prohibited categories and, for learned facts, sensitive topics (apps/mobile/src/features/memory/services/localMemoryWriter.ts:29).
- Memory summary groups facts for display only and reads local or cloud source by mode (apps/mobile/app/(app)/settings/memory-summary.tsx:46).
- Mobile wipe deletes memory_facts and memory_vectors (apps/mobile/services/dsarExport.ts:438; apps/mobile/services/dsarExport.ts:448).
- CLI summary extraction: a Local session writes its summary on the device with a no-network fallback labelled 'on-device fallback (local privacy: no network)' (apps/cli/src/memory_pipeline.rs:388).
- CLI merges summaries per boundary: Local into raw_memories.md, own key into byok_memories.md, Managed into managed_memories.md; a BYOK or Managed prompt carries only its own file, a Local prompt carries all three (apps/cli/src/memory_pipeline.rs:40).
- CLI prunes summaries older than the decay setting, default 30 days (apps/cli/src/memory_pipeline.rs:627).

**Incomplete**

- The 30-day pruning removes session summaries, not the merged raw_memories.md file; whether old facts leave the merged file depends on the next merge [inferred] (apps/cli/src/memory_pipeline.rs:627).
- Mobile Local memory settings page text is separate per mode; whether a Local fact can ever be uploaded by other paths (data export, handoff) was not traced.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Web: no local-only memory; memory and past-chat search are stored in Cloud (apps/web/features/settings/sections/PrivacySection.tsx:107 area text).
- Desktop: not available in the public Electron app (hosted web).
- VS Code: memory is stated to live in the AGI Cloud account (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1608).
- Chrome: no memory feature found for local-only; not available.

## 4. Required behaviour

**Established requirements**

- The user can keep memory only on the device, never stored in the account (done on Mobile and CLI; missing on Web, Desktop, VS Code, Chrome). (source: brief S41.16)
- Memory must never silently absorb Local-only sensitive data into synced or global memory. (source: doc: docs/product/requirements.md section on memory)
- Each memory entry needs scope, provenance, update time, user controls, deletion, export and incognito exclusion. (source: doc: docs/product/experience-contract.md)

**Acceptance criteria**

1. Mobile in Local Mode: a saved fact appears in memory_facts and the summary reads 'On-device memory'.
2. Mobile Local fact does not trigger any request to the AGI memory API.
3. Mobile 'Reset memory' empties the list; full wipe removes memory_facts and memory_vectors.
4. Mobile summary grouping stores nothing new.
5. CLI Local session writes a summary with origin local and no network call.
6. A CLI own-key or Managed session prompt does not contain Local file content.
7. Summaries older than the decay setting are removed on consolidation.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The VS Code claim that memory lives in the account is correct for that app's current design, so VS Code cannot be local-only without new work. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the memory file path and size in CLI /memories.
- [proposed] Add a Mobile control to export local memory only.
- [proposed] Offer local-only memory on VS Code by reading CLI Local memory.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | memory_facts | `apps/mobile/storage/memory.ts` | Mobile on-device table of facts (id, fact, pinned, source, supersede columns). |
| service | memory storage functions | `apps/mobile/storage/memory.ts` | insertMemoryFact, listMemoryFacts, supersede and delete helpers. |
| store | useMemoryStore | `apps/mobile/src/features/memory/store.ts` | Mobile memory state; branches local vs cloud by mode. |
| service | writeLocalMemoryFact | `apps/mobile/src/features/memory/services/localMemoryWriter.ts` | Local write with refusal rules, dedupe and conflict handling. |
| service | consolidation | `apps/mobile/src/features/memory/services/consolidation.ts` | Groups facts by topic and extracts candidates; display grouping. |
| screen | MemorySummaryScreen | `apps/mobile/app/(app)/settings/memory-summary.tsx` | Shows grouped facts and the On-device memory or Cloud account memory label. |
| screen | Memory settings | `apps/mobile/app/(app)/settings/memory.tsx` | Rows 'Memory summary', 'Replaced memories', 'Never remember', 'Reset memory'. |
| store | useLocalSettingsStore / useCloudSettingsStore | `apps/mobile/stores/settings/localSettingsStore.ts` | Separate memory-enabled switches per mode (cloud store at apps/mobile/stores/settings/cloudSettingsStore.ts). |
| store | useChatAppModeStore | `apps/mobile/src/features/chat/store/appModeStore.ts` | Decides which memory source is shown. |
| service | cloudSyncEngine markMemoryForSync | `apps/mobile/services/cloudSyncEngine.ts` | Cloud-only memory sync marker, not used on the local path. |
| service | MemoryPipeline | `apps/cli/src/memory_pipeline.rs` | CLI summary extraction, consolidation per boundary, pruning and prompt integration. |
| config | memories/settings.json | `apps/cli/src/memory_pipeline.rs` | CLI memory settings file read by load_memory_settings (line 79). |
| command | /memory and /memories | `apps/cli/src/tui/tui_app.rs` | CLI commands for viewing and configuring memory. |
| service | MemoryManager | `apps/cli/src/memory.rs` | CLI instruction and rule files per boundary (e.g. CLAUDE.md for Local at line 52). |
| service | session prompt composition | `apps/cli/src/agent/mod.rs` | Composes the system prompt with memory for the session's privacy mode (line 209). |
| component | VS Code data-flow card | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | States that memory lives in the AGI Cloud account. |
| service | wipeAllLocalData | `apps/mobile/services/dsarExport.ts` | Deletes memory_facts and memory_vectors on full wipe. |
| test | memory-summary test | `apps/mobile/__tests__/memory-summary.test.ts` | Covers grouping and empty-store behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile Local: a fact is checked against refusal rules, de-duplicated and inserted into memory_facts. | device | apps/mobile/src/features/memory/services/localMemoryWriter.ts:29; apps/mobile/storage/memory.ts:34 |
| Mobile Local: facts are loaded from the table (limit 500) for the Memory screens and for the prompt in Local chats. | device | apps/mobile/src/features/memory/store.ts:143; apps/mobile/stores/chat/chatExecutionStore.ts:2816 |
| Mobile Cloud mode: the server assembles context, and memory changes are marked for sync. | our servers | apps/mobile/stores/chat/chatExecutionStore.ts:2800; apps/mobile/src/features/memory/store.ts:191 |
| CLI: at session end a summary is written to memories/session_summaries/<id>.md; Local sessions use the deterministic on-device fallback. | device | apps/cli/src/memory_pipeline.rs:343 |
| CLI: on startup (at most hourly) summaries merge per boundary; a Local summary always merges on the device. | device | apps/cli/src/memory_pipeline.rs:458 |
| CLI: Own-key or Managed summaries are merged through the session's own off-device route only. | outside service | apps/cli/src/memory_pipeline.rs:450 |
| CLI: summaries older than the decay setting are deleted. | device | apps/cli/src/memory_pipeline.rs:627 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Mobile memory facts | table:memory_facts (on-device SQLite) | No in Local Mode; Cloud memory uses a separate store and sync | Until deleted, reset or wiped (apps/mobile/services/dsarExport.ts:438). |
| Mobile memory vectors | table:memory_vectors (on-device) | No | Deleted by the wipe (apps/mobile/services/dsarExport.ts:448). |
| CLI session summaries | ~/.agiworkforce/memories/session_summaries/<session>.md (or under AGIWORKFORCE_HOME) | No sync found for Local origin | Pruned after decay days, default 30 (apps/cli/src/memory_pipeline.rs:66). |
| CLI merged Local memory | memories/raw_memories.md, per project under memories/projects/<key>/ | No | Rewritten on each merge with a max-facts cap (default 500). |
| CLI memory settings | memories/settings.json | No | Kept until edited. |

**Models and providers.** Mobile Local memory is used only with the on-device model path. CLI Local uses no model for extraction (raw fallback); own-key or Managed sessions extract through that session's own provider, so memory text goes to that provider (apps/cli/src/memory_pipeline.rs:370).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile Local and CLI Local memory need no account. Mobile Cloud memory needs sign-in ('Sign in to manage Cloud memories') (apps/mobile/src/features/memory/store.ts:61). |
| Permissions | none found in the code beyond file permissions of the config folder (created owner-only per apps/cli/src/config.rs comment). |
| Subscription | none found in the code for Local memory. |
| Limits and metering | Mobile lists 500 facts per load and 5,000 known facts for de-duplication (apps/mobile/src/features/memory/services/localMemoryWriter.ts:14). CLI max facts default 500; decay default 30 days; extraction input capped at 20,000 characters; model call timeout 30 seconds (apps/cli/src/memory_pipeline.rs:62). |
| Feature flags | Mobile memoryEnabled per mode; CLI auto-memory setting. |
| Model compatibility | none found in the code for local memory itself. |
| Provider restrictions | CLI off-device merging only through the session's own boundary route. |
| Local mode | Memory is stored only on the device and never uploaded; Local CLI sessions make no network call for memory. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Mobile loading | 'Loading memories…' with 'Reading stored memories.' | apps/mobile/app/(app)/settings/memory-summary.tsx:78 |
| Mobile empty | 'Nothing learned yet'. | apps/mobile/app/(app)/settings/memory-summary.tsx:78 |
| Mobile load error | Store error 'Could not load memories. Try again.' | apps/mobile/src/features/memory/store.ts:151 |
| Mobile memory off | Warning panel says none are used in new chats. | apps/mobile/app/(app)/settings/memory-summary.tsx:58 |
| Mobile sensitive or prohibited text | Write returns 'refused' with the category. | apps/mobile/src/features/memory/services/localMemoryWriter.ts:29 |
| CLI extraction fails or times out | Falls back to raw message text; errors never block the agent loop. | apps/cli/src/memory_pipeline.rs:370; apps/cli/src/memory_pipeline.rs:21 |
| CLI summary already exists | Skipped. | apps/cli/src/memory_pipeline.rs:355 |
| Offline | Mobile Local memory needs no network; CLI Local needs none. Cloud memory offline behaviour not traced. | apps/mobile/src/features/memory/store.ts:143 |
| Accessibility | Memory summary section titles are headers (accessibilityRole header). | apps/mobile/app/(app)/settings/memory-summary.tsx:96 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/memory-summary.test.ts`: Grouping, dedupe, empty store and freshness.
- `apps/mobile/__tests__/memory-consolidation.test.ts`: Consolidation of memory candidates (name-based).
- `apps/mobile/__tests__/cloud-memory-sync.test.ts`: Cloud memory sync, the counterpart that must not carry Local facts.
- `apps/mobile/__tests__/local-data-wipe-order.test.ts`: Full wipe steps and order.
- `apps/cli/src/memory_pipeline.rs`: Inline tests: Local summary written without a provider call, per-boundary files, Local memory reaches only Local sessions, pruning.
- `apps/mobile/__tests__/memory-command-outcomes.test.ts`: Memory command outcomes (name-based).

**Test scenarios**

- **Mobile local fact**
  1. Local Mode; open Settings, Memory; add a fact; open Memory summary.
  - Expected: Label 'On-device memory'; the fact is listed; footer says memories saved on this device.
- **Mobile no upload**
  1. Add a fact in Local Mode with the network monitored.
  - Expected: No request to the memory API.
- **Mobile switch to Cloud**
  1. Sign in; switch to Cloud; open Memory summary.
  - Expected: Label 'Cloud account memory'; Local facts not listed.
- **CLI Local summary**
  1. Run a Local session; exit; look in ~/.agiworkforce/memories.
  - Expected: A summary file with origin local; no network call.
- **CLI boundary isolation**
  1. Run an own-key session after a Local one; inspect the session prompt memory block.
  - Expected: Only own-key memory tag appears.
- **CLI pruning**
  1. Set decay days to a small number; age a summary file; start the CLI.
  - Expected: The aged summary is removed.

**Where to look when it fails**

- Mobile: table memory_facts; store error 'Could not load memories. Try again.'
- CLI: files under memories/; stderr lines from the memory pipeline.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)
- CLI: [70-qa/test-plans/cli/041-temporary-and-private-experiences.md](../../70-qa/test-plans/cli/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **No local-only memory on Web, Desktop, VS Code, Chrome** Affects: Web, Desktop, VS Code, Chrome. Evidence: brief S41.16; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1608. Work needed: Decide per app; at least state account memory clearly (VS Code already does).
- **CLI pruning removes summaries, not merged facts, so 'older than 30 days are pruned' is partly true** Affects: CLI users reading the draft claim. Evidence: apps/cli/src/memory_pipeline.rs:627. Work needed: Clarify copy or prune merged file facts by age.
- **No tested guarantee that a Mobile Local fact never reaches Cloud paths such as the explicit chat copy or export** Affects: Mobile. Evidence: apps/mobile/src/features/settings/data-controls/index.tsx:182 says memory stays on device; no dedicated test found. Work needed: Add a test that the explicit copy sends no memory.
- Not built on: Web, Desktop, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:mobile
- surface:cli
- surface:vscode
- surface:web
- surface:desktop
- surface:chrome
- mode:local
- mode:cloud
- table:memory_facts
- store:sqlite
- SYS-memory-projects-and-context
- SYS-local-inference
- SYS-sync-and-continuity
- SYS-security-and-privacy
- F041-08
- F041-10

## Unknown

- How Mobile builds the Local-mode prompt memory block in detail (only the call site was seen).
- Whether the CLI merged file ever drops old facts by age.
- Whether Chrome or Desktop keep any device-only memory (not searched in depth).
- Where CLI /memory reads files for display (repl::memory_for_display not opened).
