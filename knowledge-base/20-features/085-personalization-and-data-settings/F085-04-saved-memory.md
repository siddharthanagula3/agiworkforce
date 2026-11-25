---
id: "F085-04"
type: "feature"
title: "Saved memory"
aliases: ["Saved memory (S85.05)", "Project memory preferences (S85.07)", "Import memory (S85.22)", "Persistent memory", "Memory settings", "agi memory", "Code: Memory", "Use memories from outside this project", "Never remember"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S85.05", "S85.07", "S85.22"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "SYS-authorization-and-workspaces", "table:user_memories", "table:user_settings", "api:POST /api/memory/import", "F085-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-04 Saved memory

The assistant keeps short facts about the person and adds the relevant ones to later chats. The person can view, add, edit, delete, export, switch off, exclude terms, choose per project whether account memory applies, and import from another assistant. Temporary chats do not use memory. Coverage differs by app.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.05](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8505), [S85.07](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8507), [S85.22](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8522).

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

**What it does.** Stores memories per account (or per project or device), selects up to 30 and 8000 characters for each turn, and gives controls to manage them (apps/web/lib/services/managed-memory-context-service.ts:67-71; apps/web/lib/services/turn-context-service.ts:124-127).

**Why it exists.** Continuity across chats, as in Claude and ChatGPT memory (doc: docs/product/requirements.md:754-766).

**Who uses it.** Anyone using Cloud chat on Web, Desktop, Mobile, CLI, VS Code and Chrome; Mobile Local users with device-only memory.

**Problems it solves**

- Repeating facts about oneself.
- Unwanted memories: delete, exclude, reset.
- Moving over from another assistant.

**Use cases**

- Add 'I use metric units' and see it used next chat.
- Switch memory off for a month and keep the stored facts.
- Make a project use only its own memories.
- Import a list exported from another assistant.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Memory (apps/web/features/settings/sections/MemorySection.tsx:231-250).
- Mobile: Settings > Assistant > Memory, screen title 'Cloud Memory' or 'Memory' (apps/mobile/app/(app)/settings/memory.tsx:709); import from the Import memories button (line 720).
- CLI: agi memory list, add, edit, forget, pin, unpin, export, on, off, status, never, import (apps/cli/src/lib.rs:1435-1500).
- VS Code: 'Code: Memory' and related commands (apps/extension-vscode/package.json:479-509).
- Chrome: Memory sheet in the side panel with a link 'Memory settings on the web' (apps/extension/src/features/side-panel/memorySheet.ts:34,80).
- Project: Project settings dialog 'Memory' checkbox (ProjectSettingsDialog.tsx:382-398).

**Before you start**

- Signed in for account memory. Memory must be switched on; a workspace policy can turn it off for members (MemorySection.tsx:253-265).

**Screens and controls**

- Web: switch 'Persistent memory'; 'Save memories from chats'; 'Search past chats'; 'Include sensitive topics in memory'; 'Allow memory generation from tool-assisted chats'; 'Import memory from other AI providers' with 'Start import'; buttons 'Export memories', 'Manage memories', 'Clear all memories'; 'Where a memory applies'; exclusions; replaced memories (MemorySection.tsx:317-480).
- Web import dialog 'Import memory from other AI providers': paste or upload text, preview items, select, commit (ImportMemoryDialog.tsx:333).
- Mobile: switches 'Memory', 'Search and reference chats', 'Generate memory from chat history', 'Include sensitive topics in memory'; rows 'Memory summary', 'Replaced memories', 'Never remember' (cloud only), 'Reset memory'; 'Add memory'; sources ChatGPT, Claude, Gemini, Copilot, Other (MemoryControlsCard.tsx:64-94; memory.tsx:558-575; memoryImport.ts:19).
- Project dialog: checkbox 'Use memories from outside this project'.

**Journey**

1. Turn on Persistent memory.
2. Chat; the assistant may save facts ('Save memories from chats') or you add one in Manage memories.
3. Next Cloud chat: relevant memories are selected and sent.
4. To import: Start import, paste export text, review the preview (duplicates flagged), choose items, import, read counts.
5. To exclude a project from account memory: untick the project checkbox and save.

**What the person sees and gets**

- Count line '<n> saved memories' or 'Cloud memories are not loaded.' (MemorySection.tsx:339-345).
- Import result: inserted, skipped duplicate, blocked by policy, excluded by never-remember counts (memory/import/route.ts:150-167; CLI prints the same, lib.rs:4276-4290).
- Mobile notice 'Memory is off, so new memories can't be added or imported.' with a Turn on button (memory.tsx:590-600).
- Memory citations on replies [inferred from memoryCitations in turn-context-service.ts:225-230].

**Settings**

- Capabilities group: memory, generateFromHistory, searchPastChats, includeSensitiveTopics, allowToolAssistedGeneration (managed-memory-context-service.ts:258-280).
- Project flag uses_global_memory (projects/[id]/route.ts:186).
- VS Code setting agiWorkforce.memory.enabled (package.json:1332).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Selection: memory is included only when the policy is on, the chat is not temporary, and the surface asks for it (the api surface needs an explicit true) (turn-context-service.ts:70-75,124-127).
- Policy fails closed: memory counts as on only if stored capabilities.memory is exactly true; a workspace policy can disable it (managed-memory-context-service.ts:240-280).
- Project scope: loads uses_global_memory for the person's own project; default true (managed-memory-context-service.ts:1264-1279).
- A failing context source is skipped with a warning and the turn continues (turn-context-service.ts:190-196, 'A context source failed to load; the turn continues without it').
- Import route: CSRF, rate limit, dry run by default, commit with up to 500 items, duplicate check inside the active workspace, write admission and never-remember exclusion (apps/web/app/api/memory/import/route.ts:55-190; packages/contracts/types/src/memory-import.ts:4).
- Web memory management UI with export, clear all, exclusions, conflicts (MemorySection.tsx:317-480).
- Mobile keeps Local memory on the device and Cloud memory in the account, with its own import preview parsing Local text on the device (apps/mobile/src/features/memory/services/memoryImport.ts:31-60; apps/mobile/__tests__/memory-import-preview.test.ts:47).
- CLI manages account memory and the memory-off switch binds every session on the machine, but Local and BYOK sessions inject no account memory (apps/cli/src/agent/mod.rs:186-196; apps/cli/src/cloud/mod.rs:1024-1050).
- VS Code syncs account memory through /api/memory/sync and /api/memory (apps/extension-vscode/src/memory/accountMemoryClient.ts:16-19) with add, edit, delete and toggle commands (commandSetup.ts:2037-2130).
- Chrome add, edit, delete through background handlers (memorySheet.ts:154,189,228).
- Web or Desktop chats with an on-device model fetch account memory from /api/memory/local-context (local-personal-context.ts:137; memory/local-context/route.ts:20-31).

**Incomplete**

- Project memory choice exists only on web and desktop (brief; mobile, CLI, VS Code, Chrome missing). CLI can add a memory tied to the linked project with --project (lib.rs:1445-1449).
- Import exists on web, desktop, mobile and CLI; missing on VS Code and Chrome (brief).
- CLI import commits all non-duplicate items without showing the preview (cloud/mod.rs:810-850).
- Chrome and VS Code memory on/off: VS Code toggles a local editor setting (commandSetup.ts:2037-2050); a Chrome on/off switch was not found.

**Present but disconnected or switched off**

- Workspace policy can disable memory for members; web shows WORKSPACE_MEMORY_OFF_NOTICE and disables toggles (MemorySection.tsx:253-265; test MemorySection.test.tsx:112-120).

**Not available**

- Reset of all personalization in one action (S85.25).
- Chrome and VS Code import (brief).
- Mobile, CLI, VS Code, Chrome project memory choice (brief).

## 4. Required behaviour

**Established requirements**

- The user can see, add, edit and delete saved memories, turn memory on or off, and memories are used in that surface's chats. (source: S85.05 Should (brief))
- The user can choose per project whether project chats also use account-wide memories or only the project's. (source: S85.07 Should (brief))
- The user can import memories exported from another assistant and they become saved memories. (source: S85.22 Should (brief))
- Memory add, edit, pin, exclude, pause, delete and import persist and affect the next applicable turn; project-only facts stay in their project; temporary chats neither read nor write memory. (source: doc: docs/product/experience-contract.md:779)
- Each memory entry needs scope, provenance, update time, user controls, deletion, export and incognito exclusion. (source: doc: docs/product/experience-contract.md:558)
- Temporary chats must not update or reference memory unless the user explicitly changes that behaviour. (source: doc: docs/product/requirements.md:765-766)

**Acceptance criteria**

1. With memory on, a saved fact appears in the next non-temporary Cloud chat's memory block.
2. With memory off, no memory block is sent and stored facts remain.
3. In a temporary chat no memory is read or written.
4. A dry-run import writes nothing; commit writes selected items with imported source and reports counts.
5. Items matching a never-remember term are excluded and counted.
6. A project with 'Use memories from outside this project' off sees only that project's memories.
7. A workspace that disallows memory disables the toggles and sends no memory.
8. CLI 'agi memory off' stops memory in Local and BYOK sessions on the same machine.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Default is off for the server: absent stored value reads as off (managed-memory-context-service.ts:274).
- [inferred] The mobile cloud project memory choice applies on the server for chats created from mobile since the server reads the project flag.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a project memory choice to the other apps.
- [proposed] Show a preview step in the CLI import.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | turn context resolution | `apps/web/lib/services/turn-context-service.ts` | Chooses memory, past chats and project context per turn (lines 70-260). |
| service | managed memory context service | `apps/web/lib/services/managed-memory-context-service.ts` | Policy, scope, loader, prompt formatting, cleanup batches. |
| endpoint | POST /api/memory/import | `apps/web/app/api/memory/import/route.ts` | Dry run and commit. |
| endpoint | /api/memory and /api/memory/commands and /api/memory/sync | `apps/web/app/api/memory` | List, command and sync endpoints used by apps (route files under this folder; only tests and client paths were read). |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Account block for on-device chats. |
| endpoint | PATCH /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Saves uses_global_memory (line 186). |
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Web memory settings. |
| component | ImportMemoryDialog | `apps/web/features/settings/components/ImportMemoryDialog.tsx` | Web import steps. |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Project memory checkbox (lines 78,382-398). |
| table | user_memories | `apps/web/app/api/memory/import/route.ts` | Memory rows (import dedupes against it, line 43). |
| table | user_settings | `apps/web/lib/services/managed-memory-context-service.ts` | capabilities group with the switches (line 262). |
| job | expire-memories cron | `apps/web/app/api/cron/expire-memories` | Named memory expiry job; contents not opened. |
| screen | Mobile memory screen | `apps/mobile/app/(app)/settings/memory.tsx` | List, add, reset, links. |
| screen | Mobile memory import | `apps/mobile/app/(app)/settings/memory-import.tsx` | Import UI. |
| store | mobile memory store | `apps/mobile/src/features/memory/store.ts` | Local and Cloud entries, import commit. |
| service | mobile personal context | `apps/mobile/src/features/memory/services/personalContext.ts` | Local memory block, 50 facts, 8000 characters. |
| command | agi memory | `apps/cli/src/lib.rs` | MemorySubcommand and handlers (lines 1435, 4200-4340). |
| service | CLI cloud memory | `apps/cli/src/cloud/mod.rs` | Cache, import and forget (lines 94-130,810-880). |
| command | VS Code memory commands | `apps/extension-vscode/src/core/commandSetup.ts` | agi-workforce.memory.* (lines 1949-2130). |
| service | VS Code account memory client | `apps/extension-vscode/src/memory/accountMemoryClient.ts` | Sync and list. |
| component | Chrome memory sheet | `apps/extension/src/features/side-panel/memorySheet.ts` | Add, edit, delete. |
| service | Chrome memory client | `apps/extension/src/features/cloud-bridge/memoryClient.ts` | Paths and parsing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person adds or edits a memory in an app; the app writes it to the account (or device in Mobile Local). | device and our servers | CLI cloud/mod.rs:855-880; mobile memory/store.ts:1-45; Chrome memorySheet.ts:154-228 |
| On a Cloud chat turn the server reads the policy and the project scope, loads candidate memories (up to 500) and selects up to 30 within 8000 characters. | our servers | managed-memory-context-service.ts:67-71,240-281,1264-1279; turn-context-service.ts:124-190 |
| The memory block is added to the model request; failure to load a source skips it. | our servers | turn-context-service.ts:190-196,225-250 |
| Mobile Local retrieves up to 5 matching local facts on the device and adds them in a fenced block. | device | chatExecutionStore.ts:2797-2822; personalContext.ts:14-34 |
| Import: client posts a dry run; server parses, flags duplicates and returns items; client posts selected items; server checks never-remember terms and policy then inserts. | our servers | apps/web/app/api/memory/import/route.ts:55-190 |
| Mobile Local import parses on the device and writes locally with no upload. | device | memory-import-preview.test.ts:47; memory-import-commit.test.ts:70 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cloud memories (content, category, source, pinned, expiry, project) | table user_memories | Yes across apps by /api/memory/sync and reads | Deleted by the person; deleted rows clear text (test deletion-clears-text); expiry up to 3650 days (managed-memory-context-service.ts:409); duplicate and stale cleanup batches exist (line 930+) |
| Memory switches and exclusions | user_settings groups capabilities and memory | Yes | Until changed |
| Mobile Local memory | on-device storage (apps/mobile/storage/memory.ts) | No | Until deleted; 'Reset memory' deletes all and says it cannot be undone |
| CLI memory cache | CLI config directory memory cache file | Refreshed from the account | Removed on cache reset (cloud/mod.rs:128) |

**Models and providers.** Memory text is added to the request for whatever model the turn uses. No provider-specific behaviour was found. Memory extraction from chats uses a model call (apps/web/lib/services/model-memory-extraction.ts named in the brief; not opened).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Account for Cloud memory; Mobile Local needs no account. |
| Permissions | Per user; a workspace policy can disable memory for members; imports respect the workspace the person is in. |
| Subscription | No plan check found in the memory policy functions or the import route; entitlement elsewhere is unknown. |
| Limits and metering | Import: 500 items per commit, text size limit from the shared contract, rate limit key chat-conversation (route.ts:177). Turn: 30 memories, 1000 characters each, 8000 total. |
| Feature flags | Stored switches in capabilities; VS Code agiWorkforce.memory.enabled default true; per-folder opt-out agiWorkforce.optOut.memory (package.json:1332-1340). |
| Model compatibility | Not model-specific in code. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local: memory stays on the device and is never uploaded. Web or Desktop on-device model chats still fetch account memory from the server (needs sign-in). CLI Local and BYOK sessions inject no account memory but obey the memory-off switch. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cloud memory not loaded | Web shows 'Cloud memories are not loaded.'; editor unavailable text 'Cloud memory is unavailable until your account and workspace are ready.' | MemorySection.tsx:339,500-504 |
| Save failure | Alert with Retry; the Memory panel does not show a failed disable as saved. | MemorySection.tsx:266-300; doc: docs/product/experience-contract.md:792 |
| Memory off on mobile | Notice with Turn on; adds and imports blocked. | memory.tsx:590-600 |
| Import too large or all duplicates | Validation error; CLI prints 'Nothing new to import'. | memory/import/route.ts:55-70; lib.rs:4277 |
| Temporary chat | Memory not read. | turn-context-service.ts:124-127 |
| Reset memory | Destructive alert naming scope, 'cannot be undone'; incomplete deletion shows a warning with Try again. | memory.tsx:363-395 |
| Account switch mid-action | Mobile import and edit check scope epoch. | memoryImportOperation.ts used in memoryImport.ts:21-24 |
| Offline | CLI keeps working from its cache for the off switch; other apps show errors; an offline write queue was not found. | apps/cli/src/cloud/mod.rs:1010-1022 (cache read in any mode); no offline queue found in the memory files searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/managed-memory-context-service.test.ts`: Memory from Google-data conversations never injected, user-owned only, fails closed, sensitive topics, org policy.
- `apps/web/app/api/memory/import/__tests__/route.test.ts`: Dry run flags duplicates, writes nothing, requires text, commit persists with provenance.
- `apps/web/features/settings/sections/MemorySection.test.tsx`: Workspace-off notice, disabled toggles, scope explanation, owner preferences loading.
- `apps/web/app/api/memory/local-context/__tests__/route.test.ts`: Rate limit, UUID check, 401, scoped context.
- `apps/web/app/api/memory/__tests__/exclusion-enforcement.test.ts`: Never-remember exclusions (title only).
- `apps/web/app/api/memory/__tests__/withdrawn-project-scope.test.ts`: Project scope behaviour (title only).
- `apps/mobile/__tests__/memory-import-preview.test.ts`: Local parse on device, server dry run for Cloud, no Local text sent after switching to Cloud.
- `apps/mobile/__tests__/memory-import-commit.test.ts`: Local commit without upload, failure and cancel handling, Cloud epoch.
- `apps/cli/src/cloud/mod.rs`: In-file tests: memory off read from cache, Local session injects none, cache owner isolation (lines 1010-1075).
- `apps/extension/__tests__/memory-sheet.test.ts`: List with source, confirm before delete, add and edit via background.
- `apps/extension-vscode/src/__tests__/memoryControls.test.ts`: VS Code memory controls (title only).

**Test scenarios**

- **Memory is used**
  1. Add a memory 'I use metric units'
  2. Ask a question needing units in a new chat
  - Expected: Reply uses metric and shows a memory citation.
- **Temporary chat**
  1. Start a temporary chat
  2. Ask what the assistant remembers
  - Expected: No account memory is used.
- **Project only**
  1. Untick 'Use memories from outside this project' and save
  2. Ask in the project about an account-wide memory
  - Expected: Not known in the project.
- **Import**
  1. Start import with a list of five lines, two already saved
  2. Review preview, commit
  - Expected: Three inserted, two skipped as duplicates.
- **CLI Local**
  1. agi memory on, then start a Local session
  2. Ask about a saved memory
  - Expected: Not used in Local; agi memory off stops local memory too.

**Where to look when it fails**

- Log 'A context source failed to load; the turn continues without it'.
- Log 'Failed to import memories' (import route).
- Tables user_memories, user_settings.
- Response fields insertedCount, skippedDuplicateCount, blockedCount, excludedCount.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- CLI: [70-qa/test-plans/cli/085-personalization-and-data-settings.md](../../70-qa/test-plans/cli/085-personalization-and-data-settings.md)
- VS Code: [70-qa/test-plans/vscode/085-personalization-and-data-settings.md](../../70-qa/test-plans/vscode/085-personalization-and-data-settings.md)
- Chrome: [70-qa/test-plans/chrome/085-personalization-and-data-settings.md](../../70-qa/test-plans/chrome/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **Project memory choice missing on Mobile, CLI, VS Code, Chrome.** Affects: Those apps. Evidence: S85.07 brief. Work needed: Add control or document web-only.
- **Import missing on VS Code and Chrome.** Affects: VS Code, Chrome. Evidence: S85.22 brief. Work needed: Add or link to web.
- **CLI import has no preview step.** Affects: CLI. Evidence: cloud/mod.rs:810-850. Work needed: Show the dry-run result and ask before commit.
- **Chrome has no found on/off switch for memory.** Affects: Chrome. Evidence: memorySheet.ts and memory-bridge.ts show add/edit/delete only. Work needed: Verify and add.
- **VS Code memory switch is a local editor setting, not the account switch.** Affects: VS Code. Evidence: commandSetup.ts:2037-2050. Work needed: Clarify or align.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- SYS-authorization-and-workspaces
- table:user_memories
- table:user_settings
- api:POST /api/memory/import
- F085-05

## Unknown

- Plan entitlements for memory (not found in files read).
- Contents of the /api/memory list, commands and sync route files.
- How memory facts are extracted from chats (model-memory-extraction.ts not opened).
- The default stored value for new accounts (policy reads absent as off; the web UI default was not traced).
- Mobile on-device memory storage engine.
- Whether Chrome has any memory on/off or import control.
- What the expire-memories cron removes.
