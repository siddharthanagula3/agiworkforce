---
id: "F039-05"
type: "feature"
title: "Edit, delete and reset memory"
aliases: ["Edit Memory (S39.13)", "Delete individual Memory (S39.14)", "Delete all Memory (S39.15)", "Memory reset independent from chat deletion (S39.30)", "Clear all memories", "Forget everything", "Reset memory", "Reset memories", "forget command"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S39.13", "S39.14", "S39.15", "S39.30"]
depends_on: ["SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-api-and-contracts", "F039-04", "F039-03", "api:PUT /api/memory/[id]", "api:DELETE /api/memory/[id]", "api:DELETE /api/memory", "table:user_memories", "store:memory_facts", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-05 Edit, delete and reset memory

The person can change the text of a memory, delete one, delete all of them after a confirmation, or reset memory without touching chats. Deleting a memory keeps an empty row so other devices learn of it. Deleting chats does not touch memory.

Area: [39. Memory product](README.md). Requirement items: [S39.13](../../10-requirements/capabilities/039-memory-product.md#s3913), [S39.14](../../10-requirements/capabilities/039-memory-product.md#s3914), [S39.15](../../10-requirements/capabilities/039-memory-product.md#s3915), [S39.30](../../10-requirements/capabilities/039-memory-product.md#s3930).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person correct or remove saved facts, individually or all at once, separately from chat history (apps/web/app/api/memory/[id]/route.ts:78-170; apps/web/app/api/memory/route.ts:168-205).

**Why it exists.** Add, edit and delete memory are required features, and correction and deletion must propagate to future sessions (doc: docs/product/requirements.md section 18; doc: docs/product/competitive-guidance.md:317).

**Who uses it.** Anyone who wants to fix or erase what the assistant knows.

**Problems it solves**

- Wrong facts keep being used.
- The person wants a clean start without losing chats.
- Removed facts must disappear from other devices.

**Use cases**

- Change I live in Paris to I live in Rome.
- Delete one outdated preference.
- Press Clear all memories before sharing the account.
- Say Forget my address in chat and confirm.

## 2. User experience

**Where to find it**

- Web and public Desktop: Settings, Personalization, Memory. Edit: click the fact text. Delete: trash icon on a fact. All: Clear all memories button (MemoryEditor.tsx:262-300,364-375; MemorySection.tsx:371).
- Mobile: Memory screen, tap a fact to edit, delete from its row, Reset memory row (memory.tsx:436,572).
- CLI: agi memory edit <id|text> <new text>; agi memory forget <id|text> (lib.rs:4173,4332).
- VS Code: Code: Edit Memory Fact, Code: Delete Memory Fact, and Clear account memory in the Code: Memory menu (commandSetup.ts:2101,2130,1998-2026).
- Chrome: Edit and Delete buttons on each item; delete asks for confirmation (memorySheet.ts:111-190).
- Chat: say Forget ... (agent-core memory.ts:139-145).

**Before you start**

- Signed in for Cloud memory.
- For edit and delete of one fact, the fact must not still be pending save (memoryStore.ts:319-325,364-370).

**Screens and controls**

- Web edit: text area with Save and Cancel; limited to 20,000 characters (MemoryEditor.tsx:262-290).
- Web delete one: confirm dialog titled Delete this memory? with button Delete memory (MemoryEditor.tsx:364-367).
- Web delete all: dialog Delete all memory facts? with a count and the text Your chats are not deleted.; confirm label Forget everything, destructive (MemorySection.tsx:205-217).
- Mobile: alert Delete memory? (memory.tsx:436) and Reset memory? saying it permanently deletes every memory and that chats are not deleted (memory.tsx:366-378).
- VS Code: modal warning with count and button Forget everything (commandSetup.ts:2016-2022).
- Chrome: confirmation text and Keep or Delete buttons (memorySheet.ts:164-190).

**Journey**

1. Open the memory list.
2. Choose a fact and Edit, Delete, or choose Clear all or Reset.
3. Confirm when asked.
4. The fact disappears from the list; other devices drop it at next sync.
5. Later chats no longer use it.

**What the person sees and gets**

- Web: failure text The deletion could not be confirmed. Check your saved memories before trying again. (MemorySection.tsx:34-35).
- Mobile: if reset fails a card says Deletion didn't finish. Some memories may still be saved. with Try again (MemoryControlsCard.tsx:30,100-140).
- VS Code: All memory forgotten or a message listing what was kept (commandSetup.ts:2024-2026).
- Chat forget: confirmation request listing matching memories before deletion (side_panel.ts:9044; use-explicit-memory-commands.ts:25).

**Settings**

- None specific. Memory off does not delete anything (MemorySection.tsx:61).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Edit: PUT /api/memory/[id] trims text, rejects never-remember terms and ineligible text, updates the row and updated_at; only live, unexpired rows in the person's workspace (apps/web/app/api/memory/[id]/route.ts:78-135).
- Delete one: DELETE /api/memory/[id] soft-deletes by blanking text, category and import key (route [id]:138-165; managed-memory-context-service.ts:391-392); a database trigger also blanks text on any deleted row (apps/web/db/neon/0355_user_memories_purge_deleted_text.sql:1-30).
- Delete all: DELETE /api/memory marks every live memory in the current workspace deleted, including project-only ones, and returns the count (apps/web/app/api/memory/route.ts:168-205).
- Web store removes optimistically and restores the fact if the server call fails (memoryStore.ts:364-383).
- Chat forget: matching memories (at least 3 characters, at most 25 matches) are shown for confirmation before deletion; ids only are logged (apps/web/lib/services/memory-commands.ts:60-64; commands/route.ts:76-90).
- Mobile edit, delete and reset for Cloud and Local; Cloud reset calls DELETE /api/memory (store.ts:251-340).
- CLI edit and forget by id or exact text (lib.rs:4173-4223,4332-4345).
- VS Code edit, delete, clear all with confirmation (commandSetup.ts:1998-2026,2101-2160).
- Chrome edit and delete with confirmation (memorySheet.ts:111-190).
- Deleting chats does not run any memory deletion: no chat deletion code references user_memories in apps/web/app or lib outside memory, export, erasure and workspace files (search of app and lib). Account deletion does include user_memories (apps/web/lib/services/deletion-manifest.ts:93).

**Incomplete**

- DELETE /api/memory/[id] does not check that a row matched; it always answers success (route [id]:150-170).
- Edit does not re-run merge or conflict handling, so editing a fact into a duplicate of another is not merged [inferred from route [id]:100-135].
- Whether the interface tells the person that deleting chats leaves memory in place: not found; the dialog only says chats are not deleted by clearing memory.
- Edited text on mobile Cloud reaches the server through sync; refusal at sync is not shown in code I opened.

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI: no delete-all or reset subcommand (lib.rs:1435-1486).
- Chrome: no delete-all or reset (memorySheet.ts).
- Tauri desktop Memory tab offers Reset memories, a separate local path with integer ids (apps/desktop/src/features/settings/tabs/Memory.tsx:217-230).

## 4. Required behaviour

**Established requirements**

- The user can change the text of a saved memory and the corrected text is what later chats use. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.13)
- The user can delete one saved memory so the assistant stops using it. (source: S39.14)
- One action deletes every saved memory, after a confirmation, and afterwards none remain. (source: S39.15)
- The user can reset all memory without deleting chats, and deleting chats does not silently wipe (or silently keep) memory. (source: S39.30)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)
- Propagate corrections and removals through retrieval and future sessions. (source: doc: docs/product/competitive-guidance.md:317)

**Acceptance criteria**

1. After editing a fact, the list and the next chat use the new text.
2. After deleting one fact, it is gone from the list and from a second device after sync.
3. Clear all memories asks first, shows the count and says chats are not deleted.
4. After Clear all, the list is empty and the saved-count reads zero.
5. Deleting a chat leaves memories in place and the learned fact stays in the list.
6. Reset on mobile Local deletes only on-device facts; Cloud reset deletes only account facts.
7. A failed delete shows an error and the fact is still listed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Deleted rows are kept as empty tombstones so sync clients delete their copy [inferred from the comment on DELETED_MEMORY_ASSIGNMENTS, managed-memory-context-service.ts:388-391].
- Whether keeping memory after chat deletion is intended or a gap depends on the Should line, which asks that it is not silent [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Tell the person when they delete a chat that learned facts remain, with a link to Memory.
- [proposed] Add agi memory reset with confirmation to the CLI and a reset action to Chrome.
- [proposed] Make delete-one return 404 when nothing matched.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | PUT /api/memory/[id] | `apps/web/app/api/memory/[id]/route.ts` | Edit text, pin and expiry. |
| endpoint | DELETE /api/memory/[id] | `apps/web/app/api/memory/[id]/route.ts` | Soft delete one memory. |
| endpoint | DELETE /api/memory | `apps/web/app/api/memory/route.ts` | Soft delete all memories in the workspace. |
| service | DELETED_MEMORY_ASSIGNMENTS | `apps/web/lib/services/managed-memory-context-service.ts` | SQL assignment that marks deleted and blanks text. |
| table | purge_deleted_memory_text trigger | `apps/web/db/neon/0355_user_memories_purge_deleted_text.sql` | Database guarantee that deleted rows hold no text. |
| service | memory forget command | `apps/web/lib/services/memory-commands.ts` | Forget with confirmation and match limits. |
| store | memoryStore update/remove/clear | `packages/ui/unified-chat/src/stores/memoryStore.ts` | Optimistic edit, delete and clear with rollback. |
| component | MemoryEditor | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Edit and delete controls with confirmations. |
| component | MemorySection clear all | `apps/web/features/settings/sections/MemorySection.tsx` | Clear all memories with count and Forget everything confirmation. |
| store | mobile updateMemory/deleteMemory/resetMemories | `apps/mobile/src/features/memory/store.ts` | Mobile edit, delete, reset for both scopes. |
| screen | Memory screen reset and delete alerts | `apps/mobile/app/(app)/settings/memory.tsx` | Mobile confirmations. |
| command | agi memory edit / forget | `apps/cli/src/lib.rs` | CLI edit and delete. |
| command | memory.edit / memory.delete / clear | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code edit, delete and clear. |
| service | accountMemoryStore.clear | `apps/extension-vscode/src/memory/accountMemoryStore.ts` | VS Code clear all through the sync API (line 260). |
| component | memorySheet edit/delete | `apps/extension/src/features/side-panel/memorySheet.ts` | Chrome edit and delete. |
| endpoint | POST /api/memory/sync | `apps/web/app/api/memory/sync/route.ts` | Push edits and delete tombstones from CLI, mobile and VS Code. |
| service | account erasure | `apps/web/lib/server/account-erasure.ts` | Removes memory with the account (listed in deletion-manifest.ts:93). |
| test | deletion-clears-text test | `apps/web/app/api/memory/__tests__/deletion-clears-text.test.ts` | Test file on deletion blanking. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person confirms an action in the app. | device | MemoryEditor.tsx:364-375; MemorySection.tsx:205-225 |
| Store applies the change at once, then calls the API with a CSRF token. | device and our servers | memoryStore.ts:319-383 |
| Server checks rate limit and CSRF, then runs one update scoped to user and workspace. | our servers | route [id]:78-165; route.ts:168-205 |
| A failure rolls the client change back and shows an error. | device | memoryStore.ts:335-340,376-382 |
| Other devices receive the tombstone through the sync pull and drop the fact. | device and our servers | apps/web/app/api/memory/sync/route.ts:41-100; cloud/memory.rs:153-177 |
| Mobile Cloud reset: server delete, then local copies are removed or tombstoned and a sync starts. | device and our servers | apps/mobile/src/features/memory/store.ts:340-362 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Deleted memory tombstone (id, is_deleted, empty content) | table:user_memories | Yes, so other devices learn of it | Row stays; text and import key removed (managed-memory-context-service.ts:391-392) |
| Edited text | table:user_memories content, updated_at | Yes | Replaces the old text; no history of the old text found |
| Mobile Local facts | store:memory_facts | No | Reset deletes them (deleteAllMemoryFacts, store.ts:354) |

**Models and providers.** No model is involved. Forget by chat command uses text matching, not a model (memory-commands.ts:60-64).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; none for mobile Local. |
| Permissions | Only the owner's rows in the active workspace are touched (route [id]:155-160). |
| Subscription | none found in the code opened. |
| Limits and metering | Rate limit chat-conversation; forget matches capped at 25 and subject at least 3 characters (memory-commands.ts:60-64). |
| Feature flags | none found. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found. |
| Local mode | Mobile Local deletes only on-device facts and says so in the alert (memory.tsx:366-378). No other app has a Local memory delete path established here; the Tauri tab has Reset memories for device memories (Memory.tsx:217-230). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Delete confirmed but request fails | Web restores the fact and raises the error; clear-all failure shows The deletion could not be confirmed. | memoryStore.ts:376-382; MemorySection.tsx:223 |
| Fact still pending | Edit, pin and delete are ignored while a fact is still being saved. | memoryStore.ts:322,347,367 |
| Fact not found or already deleted | Edit returns 404 Memory not found; delete returns success without a check. | route [id]:130-133, 150-170 |
| Edited text on the never-remember list | Edit refused. | route [id]:108-111 |
| Reset partially fails (mobile) | Deletion warning card with Try again. | MemoryControlsCard.tsx:100-140 |
| Change cannot be confirmed (web) | Editor shows A change could not be confirmed and blocks further change until reload. | MemoryEditor.tsx:408-415 |
| Chat deleted | Memory remains; the list hides the chat title because the join requires the chat to exist. | route.ts:66-72 |
| Offline | Mobile Cloud queues changes for sync; web not handled in the code opened. | store.ts:301-330 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/memory/__tests__/deletion-clears-text.test.ts`: Deleted memory text is cleared (name only; contents not opened)
- `apps/web/app/api/memory/__tests__/workspace-lifecycle.test.ts`: Workspace lifecycle (name only)
- `apps/web/__tests__/api/memory.test.ts`: Memory API (name only)
- `packages/ui/unified-chat/src/stores/__tests__/memoryStore.test.ts`: Store edit, delete, clear (name only)
- `packages/ui/unified-chat/src/components/__tests__/MemoryEditor.error.test.tsx`: Editor error states (name only)
- `apps/mobile/__tests__/MemoryScreenDeletionWarning.test.tsx`: Mobile deletion warning (name only)
- `apps/extension-vscode/src/__tests__/accountMemoryStore.test.ts`: VS Code store (name only)
- `apps/extension/__tests__/memory-sheet.test.ts`: Chrome sheet (name only)
- `apps/web/lib/services/__tests__/memory-lifecycle.test.ts`: Memory lifecycle (name only)

**Test scenarios**

- **Edit**
  1. Click a fact on web, change the text, Save.
  2. Ask a question that depends on it.
  - Expected: New text is listed and used.
- **Delete one**
  1. Delete a fact and confirm.
  2. Open the same account on mobile and sync.
  - Expected: Gone on both.
- **Clear all**
  1. Press Clear all memories.
  2. Read the dialog, press Forget everything.
  - Expected: Dialog shows the count and says chats are not deleted; list empty after.
- **Chats survive reset**
  1. Reset memory.
  2. Open chat history.
  - Expected: All chats remain.
- **Chat deletion keeps memory**
  1. Let a chat learn a fact.
  2. Delete that chat.
  3. Open Memory.
  - Expected: The fact is still listed, without a chat title.
- **Failure**
  1. Block network and delete a fact.
  - Expected: Fact reappears and an error is shown.

**Where to look when it fails**

- Log Failed to delete memory / Failed to delete memories (route [id]:166; route.ts:196).
- Log [memory-commands] explicit forget deleted memories with ids only (commands/route.ts:76-90).
- Row state in table:user_memories: is_deleted true and content empty.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)
- VS Code: [70-qa/test-plans/vscode/039-memory-product.md](../../70-qa/test-plans/vscode/039-memory-product.md)
- Chrome: [70-qa/test-plans/chrome/039-memory-product.md](../../70-qa/test-plans/chrome/039-memory-product.md)

## 10. Gaps and dependencies

- **CLI and Chrome cannot delete all or reset memory.** Affects: CLI, Chrome. Evidence: Brief S39.15 and S39.30; lib.rs:1435-1486; memorySheet.ts. Work needed: Add a confirmed reset on both.
- **The interface does not say that deleting a chat leaves its learned memories.** Affects: All apps. Evidence: No chat deletion code touches user_memories; brief S39.30 requires no silent keep. Work needed: Add a message or an option when deleting a chat.
- **Delete one always reports success.** Affects: Web, API clients. Evidence: route [id]:150-170. Work needed: Return 404 when no row changed.
- **Edited text may duplicate another fact without merge.** Affects: All apps. Evidence: route [id]:100-135. Work needed: Run the duplicate check on edit.

**Depends on**

- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-api-and-contracts
- F039-04
- F039-03
- api:PUT /api/memory/[id]
- api:DELETE /api/memory/[id]
- api:DELETE /api/memory
- table:user_memories
- store:memory_facts
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Whether any chat-deletion path elsewhere (cron, mobile) touches memory.
- Whether the web UI tells the person memory remains after deleting a chat.
- How long tombstones are kept.
- Behaviour of delete-all with project memories on mobile Cloud beyond the shared DELETE call.
