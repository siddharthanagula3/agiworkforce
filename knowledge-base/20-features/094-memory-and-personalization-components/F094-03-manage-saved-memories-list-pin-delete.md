---
id: "F094-03"
type: "feature"
title: "Manage saved memories (list, pin, delete)"
aliases: ["Manage memories", "Memory list, pin, delete", "Memory topic store (S94.03)", "Memory prioritization (S94.09)", "Memory deletion (S94.11)", "Settings > Memory", "Manage memories button", "Cloud Memory (Mobile)", "Replaced memories", "Forget everything"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.03", "S94.09", "S94.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "table:user_memories", "api:GET /api/memory", "api:PUT /api/memory/[id]", "api:DELETE /api/memory/[id]", "api:POST /api/memory/[id]/restore", "api:GET /api/memory/sync", "file:packages/ui/unified-chat/src/components/MemoryEditor.tsx", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "SYS-authorization-and-workspaces", "SYS-memory-projects-and-context"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-03 Manage saved memories (list, pin, delete)

The person sees every saved memory with its topic, source and update date, can add, edit, pin and delete memories, and can delete all of them. Pinned memories come first and win conflicts. A deleted memory leaves only an empty marker so other devices drop it, and it disappears from replies at once.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.03](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9403), [S94.09](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9409), [S94.11](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9411).

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

**What it does.** Lets the person inspect and control account memory: list, add, edit, pin or unpin, delete one or all, restore a replaced memory (apps/web/app/api/memory/route.ts:41,107,192; apps/web/app/api/memory/[id]/route.ts:76,152; apps/web/app/api/memory/[id]/restore/route.ts:20).

**Why it exists.** Memory must be inspectable and editable, with deletion and user controls on every entry (doc: docs/product/experience-contract.md:28-31,558).

**Who uses it.** Any signed-in person using memory.

**Problems it solves**

- A wrong or unwanted fact can be removed.
- Important facts can be kept first when space is limited.
- Deleted facts cannot leak back through other devices.

**Use cases**

- Open Settings > Memory, pin 'I am allergic to peanuts' so it is always read first.
- Delete a memory learned from a chat by mistake.
- Use 'Forget everything' before handing the account to someone else.

## 2. User experience

**Where to find it**

- Web (and Desktop's hosted web app): Settings > Memory; button 'Manage memories' scrolls to the editor (apps/web/features/settings/sections/MemorySection.tsx:201-203,356).
- Web projects: a project memory panel (apps/web/features/projects/components/ProjectMemoryPanel.tsx).
- Mobile: Settings > Memory / Cloud Memory with filters 'All' and 'Pinned', rows 'Memory summary', 'Replaced memories', 'Never remember', 'Reset memory' (apps/mobile/app/(app)/settings/memory.tsx:64,558-572,709).
- Desktop Tauri (internal): settings tab Memory using the same editor (apps/desktop/src/features/settings/tabs/Memory.tsx).
- Chrome extension: side-panel memory sheet to list, add, edit and delete (apps/extension/src/features/side-panel/memorySheet.ts:49-164).
- VS Code: memory tree view (apps/extension-vscode/src/memory/memoryTreeProvider.ts). Depth not read.
- CLI: TUI memories widget (apps/cli/src/tui/widgets/memories_settings.rs). Depth not read.

**Before you start**

- Signed in with a ready cloud workspace; otherwise the list says 'Cloud memories are not loaded.' (apps/web/features/settings/sections/MemorySection.tsx:337-339).
- Workspace allows memory for the toggles; otherwise 'Your workspace has memory off. An owner or admin can turn it on in Workspace → Policy.' (apps/web/features/settings/sections/MemorySection.tsx:39).

**Screens and controls**

- Count line '<n> saved memories'.
- Buttons 'Export memories' and 'Manage memories'.
- Per memory: edit by clicking the text (aria 'Edit memory: ...'), 'Pin memory' / 'Unpin memory' toggle, trash button 'Delete memory fact'.
- Add box 'Add a new fact' with placeholder 'Example: I prefer Python over JavaScript for data work.'; search box 'Search memory'.
- Groups by topic: 'Preferences', 'About you', 'Decisions', 'Summaries' (packages/ui/unified-chat/src/components/MemoryEditor.tsx:18-22).
- Delete dialog 'Delete this memory?' with 'Delete memory'; clear-all dialog 'Delete all memory facts?' with 'Forget everything' (packages/ui/unified-chat/src/components/MemoryEditor.tsx:364-367; apps/web/features/settings/sections/MemorySection.tsx:209-215).

**Journey**

1. Open Settings > Memory.
2. The list loads (50 per page by default) with pinned memories first.
3. Press the pin button on an entry; it moves to the top.
4. Press the trash button; the confirm dialog says the assistant stops using it and it cannot be restored; confirm.
5. The entry disappears at once; other devices drop it at next sync.
6. To remove everything use 'Forget everything' and confirm.

**What the person sees and gets**

- Sync status line: 'Saved to your Cloud account, available on every signed-in device.' or 'Couldn’t refresh your Cloud memory. The loaded list may be out of date. Device-local memory was not used.' (packages/ui/unified-chat/src/components/MemoryEditor.tsx:595-607).
- Error text 'Could not confirm the memory change. Check your saved memories before trying again.' and 'The deletion could not be confirmed. Check your saved memories before trying again.' (packages/ui/unified-chat/src/components/MemoryEditor.tsx:157; apps/web/features/settings/sections/MemorySection.tsx:35).
- Pinning unsupported on a source shows 'Pinning is not available for this memory source.' (packages/ui/unified-chat/src/components/MemoryEditor.tsx:469-472).

**Settings**

- Persistent memory switch (master).
- Never remember list (MemoryExclusions).
- Project setting 'uses global memory' decides whether a project reads account memories (apps/web/features/projects/components/ProjectSettingsDialog.tsx:78,387).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/memory lists active, unexpired, workspace-scoped rows ordered pinned first, then updated_at, then id; limit default 50, max 100; offset up to 10,000; hasMore; includes project name and source chat title (apps/web/app/api/memory/route.ts:41-105; packages/contracts/types/src/memory-wire.ts:3).
- POST /api/memory adds a memory (CSRF, rate limit, never-remember check, eligibility gate, merge/supersede, optional expiry and project) (apps/web/app/api/memory/route.ts:107-190).
- PUT /api/memory/[id] edits content, pin and expiry; content edits are re-checked by the gate (apps/web/app/api/memory/[id]/route.ts:76-150).
- DELETE /api/memory/[id] and DELETE /api/memory blank the text and mark deleted (apps/web/app/api/memory/[id]/route.ts:152-176; apps/web/app/api/memory/route.ts:192-215; apps/web/lib/services/managed-memory-context-service.ts:391-392).
- Every read path excludes deleted, superseded and expired rows (apps/web/lib/services/managed-memory-context-service.ts:375-381).
- Restore swaps a replaced memory back in and demotes the one that replaced it (apps/web/app/api/memory/[id]/restore/route.ts:20-84).
- Topics (category) are stored on the row and grouped in the UI (apps/web/app/api/memory/route.ts:127-134; packages/ui/unified-chat/src/components/MemoryEditor.tsx:18-22).
- Mobile manages local facts in SQLite and cloud entries in a persisted store with pin toggle and sync (apps/mobile/src/features/memory/store.ts:119,373; apps/mobile/stores/memory/cloudMemoryStore.ts:1-82).

**Incomplete**

- The Chrome extension record type has no pinned field and its sheet offers no pin (apps/extension/src/features/cloud-bridge/memoryClient.ts:19-26).
- The shared editor hides pinning when the adapter has no setPinned (packages/ui/unified-chat/src/components/MemoryEditor.tsx:469-472).

**Present but disconnected or switched off**

- Tombstone rows keep an empty text; the account data export still lists deleted rows with is_deleted true (apps/web/app/api/user/export/route.ts:408-416,2938-2948).

**Not available**

- No UI field to set or change an expiry date was found in the shared editor or Settings; expiry exists only in the API (packages/ui/unified-chat/src/components/MemoryEditor.tsx; apps/web/app/api/memory/route.ts:121-124).
- VS Code and CLI pin/edit depth: not read.

## 4. Required behaviour

**Established requirements**

- Memories are stored with a topic/category that later features can use. (source: S94.03)
- Pinned/important memories are preferred when context space is limited. (source: S94.09)
- Deleting a memory removes it from every read path immediately. (source: S94.11)
- Add, edit, pin, exclude, pause, delete and import persist and affect the next applicable turn. (source: doc: docs/product/experience-contract.md:779)
- Each memory entry needs scope, provenance, update time, user controls, deletion, export and incognito exclusion. (source: doc: docs/product/experience-contract.md:558)
- An agent never destroys user data on its own; permanent removal is from an explicit user action that names what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Settings > Memory lists pinned memories first, then newest updates; page size defaults to 50 and never exceeds 100.
2. Pin then reload: the pin persists and the entry is still first.
3. Delete one memory: it disappears from the list and the next chat reply cannot use it; the dialog names the consequence.
4. 'Forget everything' asks first and deletes all rows of the current workspace only.
5. A memory with a text that matches the never-remember list cannot be added or edited into place.
6. After delete, another signed-in device no longer shows it after sync.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Delete should show a pending state; the editor disables the button while a mutation is running [inferred from packages/ui/unified-chat/src/components/MemoryEditor.tsx:371-373].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an expiry control to the editor using the existing 3,650-day limit.
- [proposed] Add pin to the Chrome extension and verify VS Code and CLI parity.
- [proposed] Exclude tombstone rows from the account export.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST/DELETE /api/memory | `apps/web/app/api/memory/route.ts` | List, create, delete all |
| endpoint | GET/PUT/DELETE /api/memory/[id] | `apps/web/app/api/memory/[id]/route.ts` | Read, edit, pin, expire, delete one |
| endpoint | POST /api/memory/[id]/restore | `apps/web/app/api/memory/[id]/restore/route.ts` | Restore a replaced memory |
| endpoint | GET /api/memory/conflicts | `apps/web/app/api/memory/conflicts/route.ts` | Lists replaced memories for the conflicts view |
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Settings > Memory screen |
| component | MemoryEditor | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Shared list, add, edit, pin, delete UI |
| component | MemoryConflicts | `apps/web/features/settings/components/MemoryConflicts.tsx` | Replaced memories view |
| store | cloud-memory-controller | `apps/web/features/memory/cloud-memory-controller.ts` | Client controller for list, add, update, setPinned, remove, export |
| hook | useCloudMemory | `apps/web/features/memory/use-cloud-memory.ts` | Scoped controller by workspace owner |
| component | ProjectMemoryPanel | `apps/web/features/projects/components/ProjectMemoryPanel.tsx` | Project-scoped memory view |
| service | managed-memory-context-service | `apps/web/lib/services/managed-memory-context-service.ts` | Predicates, tombstone assignments, write path |
| schema | memory-wire | `packages/contracts/types/src/memory-wire.ts` | Request/response types, limits, parsers |
| table | user_memories | `apps/web/db/neon/0047_user_memories_pinned.sql` | pinned column; text blanked on delete via migration 0355 purge |
| screen | mobile memory settings | `apps/mobile/app/(app)/settings/memory.tsx` | Mobile list, filter, add, pin, reset |
| store | mobile memory store | `apps/mobile/src/features/memory/store.ts` | Local and cloud memory operations, togglePin |
| store | mobile cloudMemoryStore | `apps/mobile/stores/memory/cloudMemoryStore.ts` | Persisted cloud entries with tombstone handling |
| screen | Chrome memory sheet | `apps/extension/src/features/side-panel/memorySheet.ts` | Extension list, edit, delete |
| service | VS Code accountMemoryClient | `apps/extension-vscode/src/memory/accountMemoryClient.ts` | Account memory sync client with source 'vscode' |
| service | CLI cloud memory | `apps/cli/src/cloud/memory.rs` | Cached account memory, new/revise/delete push items |
| endpoint | /api/memory/sync | `apps/web/app/api/memory/sync/route.ts` | Delta sync including deletions |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Settings screen asks the cloud memory controller for the list; it calls GET /api/memory. | device and our servers | apps/web/features/memory/cloud-memory-controller.ts:379-400; apps/web/app/api/memory/route.ts:41 |
| Pin sends PUT /api/memory/{id} with {pinned}; the server updates the row and returns it; the controller swaps it into the list. | our servers | apps/web/features/memory/cloud-memory-controller.ts:379-388; apps/web/app/api/memory/[id]/route.ts:76-150 |
| Delete sends DELETE /api/memory/{id}; the server sets is_deleted, blanks content, category and import key. | our servers | apps/web/app/api/memory/[id]/route.ts:152-176; apps/web/lib/services/managed-memory-context-service.ts:391-392 |
| Other devices pull deltas where deleted or expired rows come back as is_deleted true and drop the entry. | device and our servers | apps/web/app/api/memory/sync/route.ts:55-60; apps/mobile/stores/memory/cloudMemoryStore.ts:56-62 |
| The next chat turn reads only active rows, so a deleted memory cannot be injected. | our servers | apps/web/lib/services/managed-memory-context-service.ts:1178-1186 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory rows (content, category, source, pinned, expiry, project) | table user_memories | Yes via /api/memory/sync; Mobile keeps a persisted cloud copy, CLI a cache file cloud/memory.json, Chrome a chrome.storage cache for 60 s | Delete keeps a tombstone with no text; no hard removal path found in the routes read |
| Mobile local facts | SQLite memory_facts | No (Local mode) | 'Reset memory' permanently deletes them after a warning (apps/mobile/app/(app)/settings/memory.tsx:376-380) |

**Models and providers.** None. Listing, pinning and deleting use no model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; user-scoped database; workspace-scoped predicate on every query (apps/web/lib/services/managed-memory-context-service.ts:383-385). |
| Permissions | Workspace policy can switch memory off, which disables the toggles; owners and admins turn it back on in Workspace > Policy (apps/web/features/settings/sections/MemorySection.tsx:39). |
| Subscription | none found in the code for list, pin and delete. |
| Limits and metering | Page size max 100 (packages/contracts/types/src/memory-wire.ts:3); offset max 10,000 (apps/web/app/api/memory/route.ts:50-52); content up to 20,000 chars; category up to 200 chars; rate limit bucket 'chat-conversation'. Injection is capped separately (F094-05). |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Web has no local memory list: the Settings text says device-local and offline memories are separate and not shown (apps/web/features/settings/sections/MemorySection.tsx:241-243). Mobile Local shows 'Stored on this device only.' and manages SQLite facts offline (apps/mobile/app/(app)/settings/memory.tsx:73). CLI Local reads files; VS Code legacy store is read-only (apps/extension-vscode/src/memory/memoryStore.ts:3-8). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Status line 'Loading memory from your Cloud account…'. | packages/ui/unified-chat/src/components/MemoryEditor.tsx:597 |
| Empty | 'No cloud memory facts yet. Add one above and it will be available to your Cloud conversations.'; Export and Manage buttons disabled. | packages/ui/unified-chat/src/components/MemoryEditor.tsx:515; apps/web/features/settings/sections/MemorySection.tsx:344,357 |
| Error | Messages 'Couldn’t refresh your Cloud memory...' and 'Cloud memory is unavailable.'; failed save shows retry 'Try again'. | packages/ui/unified-chat/src/components/MemoryEditor.tsx:601-604; apps/web/features/settings/sections/MemorySection.tsx:32-33 |
| Pending | Rows not yet saved show 'Not saved to your account. Delete it or add it again.' and controls are disabled while a mutation runs. | packages/ui/unified-chat/src/components/MemoryEditor.tsx:321-324,371-373 |
| Offline | Cloud memory shows the stale list with the error line; Mobile Local keeps working offline. | packages/ui/unified-chat/src/components/MemoryEditor.tsx:601; apps/mobile/app/(app)/settings/memory.tsx:73 |
| Concurrent edit | The controller applies a result only if the owner and workspace are still current. | apps/web/features/memory/cloud-memory-controller.ts:379-388 (uses current()) |
| Accessibility | Pin button has aria-pressed and aria-label; list has aria-labels; delete button label is the fixed text 'Delete memory fact'. | packages/ui/unified-chat/src/components/MemoryEditor.tsx:345-346,375 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/memory/__tests__/pinned-contract.test.ts`: Pinned contract (by file name)
- `apps/web/app/api/memory/__tests__/deletion-clears-text.test.ts`: Deleted memory text is cleared (by file name)
- `apps/web/db/neon/user-memories-purge-deleted-text-migration.test.ts`: Migration that purges deleted text (by file name)
- `apps/web/app/api/memory/__tests__/workspace-lifecycle.test.ts`: Workspace lifecycle (by file name)
- `apps/web/app/api/memory/[id]/restore/__tests__/route.test.ts`: Restore route (by file name)
- `apps/web/__tests__/api/memory.test.ts`: Memory API (by file name)
- `apps/web/features/memory/__tests__/cloud-memory-controller.test.ts`: Client controller (by file name)
- `apps/web/features/memory/__tests__/useCloudMemory.test.tsx`: Hook (by file name)
- `apps/web/features/settings/sections/__tests__/MemorySection.test.tsx`: Settings screen (by file name)
- `apps/web/lib/services/__tests__/memory-lifecycle.test.ts`: Deleted, superseded and expired rows excluded in SQL; workspace scoping
- `apps/mobile/__tests__/memory-command-outcomes.test.ts`: Mobile command outcomes (by file name)

**Test scenarios**

- **Pin ordering**
  1. Add three memories.
  2. Pin the oldest.
  3. Reload Settings > Memory.
  - Expected: Pinned first, then newest updated.
- **Delete everywhere**
  1. Create a memory on Web.
  2. Wait for Mobile Cloud to sync.
  3. Delete it on Web; sync Mobile; ask a question that used it.
  - Expected: Gone on both; the reply no longer uses it.
- **Delete all**
  1. Press 'Forget everything', read the dialog, confirm.
  - Expected: List empty; Export and Manage disabled; chats are not deleted.
- **Paging**
  1. Create more than 50 memories.
  2. Call GET /api/memory without a limit and with limit=500.
  - Expected: 50 rows with hasMore true; limit is capped at 100.

**Where to look when it fails**

- Logs 'Failed to fetch memories', 'Failed to delete memory', 'Failed to delete memories', 'Failed to create memory'.
- Table user_memories: is_deleted, content = '' for tombstones, pinned.
- Workspace header and organization_id predicate when a list looks empty.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No expiry control in any memory UI read.** Affects: All apps.. Evidence: packages/ui/unified-chat/src/components/MemoryEditor.tsx; apps/web/app/api/memory/route.ts:121-124. Work needed: Add an expiry field and clear action.
- **Chrome extension has no pin; VS Code and CLI pin not confirmed.** Affects: Chrome, VS Code, CLI.. Evidence: apps/extension/src/features/cloud-bridge/memoryClient.ts:19-26. Work needed: Add pin or document the exception.
- **Account export includes tombstone rows.** Affects: People exporting account data.. Evidence: apps/web/app/api/user/export/route.ts:2938-2948. Work needed: Filter is_deleted rows or label them.
- **Per-app UI depth for Desktop Tauri, VS Code and CLI was not read.** Affects: Those apps.. Evidence: files listed in implementation_map. Work needed: Read and record.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- table:user_memories
- api:GET /api/memory
- api:PUT /api/memory/[id]
- api:DELETE /api/memory/[id]
- api:POST /api/memory/[id]/restore
- api:GET /api/memory/sync
- file:packages/ui/unified-chat/src/components/MemoryEditor.tsx
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- SYS-authorization-and-workspaces
- SYS-memory-projects-and-context

## Unknown

- Desktop Tauri memory tab behaviour beyond its use of the shared editor.
- VS Code tree and CLI widget controls (pin, edit).
- Whether a hard purge of tombstones ever happens.
- Contents of the tests listed 'by file name'.
