---
id: "F039-04"
type: "feature"
title: "Review the Saved Memory list"
aliases: ["Saved Memory list (S39.04)", "Memory search (S39.05)", "Topic grouping (S39.06)", "Memory provenance (S39.17)", "Last updated (S39.18)", "Manage memories", "Cloud Memory screen", "Memory tree view"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S39.04", "S39.05", "S39.06", "S39.17", "S39.18"]
depends_on: ["SYS-memory-projects-and-context", "SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "F039-01", "api:GET /api/memory", "table:user_memories", "store:memory_facts", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-04 Review the Saved Memory list

The person opens a list of every saved memory, grouped by topic, with where each fact came from and when it last changed. Web, Mobile and VS Code can search. The CLI lists in groups without search. Chrome shows a plain list with a source label.

Area: [39. Memory product](README.md). Requirement items: [S39.04](../../10-requirements/capabilities/039-memory-product.md#s3904), [S39.05](../../10-requirements/capabilities/039-memory-product.md#s3905), [S39.06](../../10-requirements/capabilities/039-memory-product.md#s3906), [S39.17](../../10-requirements/capabilities/039-memory-product.md#s3917), [S39.18](../../10-requirements/capabilities/039-memory-product.md#s3918).

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

**What it does.** Shows what the assistant has saved, so the person can inspect and trust it. Each item shows text, topic group, origin, project if project-only, source chat title, and last-updated time on the apps that support them (packages/ui/unified-chat/src/components/MemoryEditor.tsx:17-47, 300-325; apps/web/app/api/memory/route.ts:58-100).

**Why it exists.** Inspectable memories with read, search and provenance controls are a product requirement (doc: docs/product/competitive-guidance.md:313-320; doc: docs/product/requirements.md section 18).

**Who uses it.** Anyone who wants to review or clean up memory.

**Problems it solves**

- Opaque personalization
- Not knowing why the assistant said something
- Finding one fact among many

**Use cases**

- Search the list for coffee on web.
- Open mobile Memory and scan the Preferences group.
- Run agi memory list to see everything in the terminal.
- Open the VS Code Memory tree to find a fact learned in a chat.

## 2. User experience

**Where to find it**

- Web and public Desktop: Settings, Personalization, Memory; the Manage memories button scrolls to the list (apps/web/features/settings/sections/MemorySection.tsx:360; anchor memory-editor).
- Mobile: Profile, Memory (profile/index.tsx:199), screen title Cloud Memory or Memory (memory.tsx:709).
- CLI: agi memory list (apps/cli/src/lib.rs:4101).
- VS Code: Code: Memory, then List & remove facts; Memory tree view (commandSetup.ts:1992-1996; apps/extension-vscode/src/memory/memoryTreeProvider.ts).
- Chrome: account menu, Memory (side_panel.ts:12074; memorySheet.ts:54).

**Before you start**

- Signed in for Cloud lists. The list shows saved rows even when Memory is off (list query has no policy check, apps/web/app/api/memory/route.ts:44-80; MemorySection.tsx:61).
- Mobile Local mode lists the device's own facts without sign-in (store.ts:119-150).

**Screens and controls**

- Web: search box Search memory (MemoryEditor.tsx:480), groups Preferences, About you, Decisions, Context, Summaries, Skills, Other (MemoryEditor.tsx:17-47), item badge Only in <project> (315), origin and updated label, Reload memories on error (422), count line n saved memories (MemorySection.tsx:338-345).
- Mobile: search field Search memories... (memory.tsx:643), topic chips (678), MemoryItem with origin and time (apps/mobile/src/features/settings/components/MemoryItem.tsx:47,54), count line, workspace scope line (memory.tsx:~600).
- CLI: groups by category or General; each line: pin mark, id, [origin, project scope, updated date], text, and learned in 'title' with a resume command (lib.rs:4130-4168).
- VS Code: category folders Preferences, Facts, Decisions, Context, Summaries, Skills with counts and a provenance tooltip such as Saved from the conversation ... in <app> (memoryTreeProvider.ts:15-70); banner when memory is off (213).
- Chrome: simple list, source line From chat <title> or Chrome, status and More memories are in your web settings. (memorySheet.ts:36-41,195-221).

**Journey**

1. Open the Memory view on your app.
2. Wait for the list to load.
3. Optionally type in search or open a group.
4. Read the origin and date under each fact.
5. Open the source chat from the link where offered.

**What the person sees and gets**

- Loading, count, empty and error texts (see states).
- Web link from a learned fact to its chat via conversationHref (MemorySection.tsx:74-75).

**Settings**

- Page size default 50 and maximum 100 for GET /api/memory (apps/web/app/api/memory/route.ts:44-52; packages/contracts/types/src/memory-wire.ts:3).
- Memory off does not hide the list (MemorySection.tsx:61).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/memory returns the list paged: limit default 50, capped at the contract maximum, offset capped at 10,000, hasMore via an extra row (route.ts:44-100).
- Order: pinned first, then most recently updated (route.ts:76).
- Expired, deleted and superseded rows are excluded; only the current workspace's rows are returned (managed-memory-context-service.ts:375-386; route.ts:74-75).
- Each row includes category, source, pinned, project id and name, source chat id and title, expiry and timestamps; the chat title is hidden when the chat is deleted or temporary (route.ts:58-72,84-99).
- Web shared editor loads all pages, searches, groups, shows origin and updated time and the project badge (memoryStore.ts:166-184; MemoryEditor.tsx:32-47,300-325,480).
- Mobile cloud list is sorted pinned first then newest and filtered by search; Local list reads up to 500 SQLite facts (store.ts:119-160).
- CLI list with groups and provenance (lib.rs:4101-4170).
- VS Code tree with groups, provenance, and a search quick pick (memoryTreeProvider.ts; search wiring cited by the brief at treeQuickPick.ts:72, not opened by me).
- Chrome list with cache and signed-out state (memorySheet.ts:195-221; memoryClient.ts:ACCOUNT_MEMORY_CACHE_KEY).

**Incomplete**

- CLI has no search (brief S39.05; lib.rs:1435-1486 has no search option).
- Chrome has no search and no grouping (memorySheet.ts, whole file).
- Chrome shows only the first page and refers to web settings for more (memorySheet.ts:219).
- The Chrome list does not display a last-updated time in the code I searched; the data carries updatedAt (memoryClient.ts type AccountMemory) but memorySheet.ts rendering lines 111-125 did not show it. Brief marks it done; unverified.
- Web groups use only the six fixed topics plus Other; a stored category outside them falls to Other (MemoryEditor.tsx:32-47).

**Present but disconnected or switched off**

- The memory summary endpoint GET /api/memory/summary and cards exist (apps/web/app/api/memory/summary/route.ts) but belong to other brief items (S39.07-S39.09), not this list.

**Not available**

- Search in CLI and Chrome; grouping in Chrome; project badge on mobile and VS Code is not established.

## 4. Required behaviour

**Established requirements**

- The user can open a list of every memory the assistant has saved about them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S39.04)
- The user can search or filter saved memories by text. (source: S39.05)
- Saved memories are grouped by topic when reviewed. (source: S39.06)
- Each memory shows where it came from (typed, imported or learned from a named conversation). (source: S39.17)
- Each memory shows when it was last added or changed. (source: S39.18)
- Inspectable memories with read, search and source-provenance controls. (source: doc: docs/product/competitive-guidance.md:314)

**Acceptance criteria**

1. After adding three facts, all three appear in the list with no refresh needed.
2. Typing part of a fact in search shows only matching facts on web, mobile and VS Code.
3. Facts appear under their topic group.
4. A learned fact shows the chat title it came from, or no title if the chat was deleted.
5. A project-only fact on web shows Only in <project name>.
6. Pinned facts are listed first.
7. Deleted, replaced or expired facts are not listed.
8. With more than 50 facts the web list loads all pages.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- List results exclude other workspaces so work and personal never mix [inferred from workspaceMemoryPredicate, route.ts:75].
- Text search on web is client-side over loaded facts [inferred from state use in MemoryEditor.tsx:116].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add search to the CLI (for example agi memory list --search).
- [proposed] Add grouping and a last-updated time to the Chrome sheet, or link its Manage entry (spMemoryManage) more prominently.
- [proposed] Show the project badge on mobile and VS Code if project memories are shown there.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/memory | `apps/web/app/api/memory/route.ts` | Paged, scoped, ordered list with provenance joins. |
| endpoint | GET /api/memory/[id] | `apps/web/app/api/memory/[id]/route.ts` | Fetch one memory. |
| service | activeMemoryPredicate / workspaceMemoryPredicate | `apps/web/lib/services/managed-memory-context-service.ts` | Hide deleted, superseded and expired rows; scope to workspace. |
| component | MemoryEditor | `packages/ui/unified-chat/src/components/MemoryEditor.tsx` | Shared list with search, groups, provenance, updated label. |
| store | memoryStore | `packages/ui/unified-chat/src/stores/memoryStore.ts` | Loads all pages; persists a client copy under key agi-memory-store-v1. |
| hook | useCloudMemory / controller | `apps/web/features/memory/cloud-memory-controller.ts` | Web cloud memory controller feeding the editor adapter. |
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Hosts the editor and counts. |
| screen | Memory screen | `apps/mobile/app/(app)/settings/memory.tsx` | Mobile list, search, topic chips. |
| component | MemoryItem | `apps/mobile/src/features/settings/components/MemoryItem.tsx` | Mobile row with origin and time. |
| service | groupMemoryFactsByTopic | `apps/mobile/src/features/memory/services/consolidation.ts` | Mobile topic grouping. |
| store | mobile memory store | `apps/mobile/src/features/memory/store.ts` | Fetch, filter and sort. |
| command | agi memory list | `apps/cli/src/lib.rs` | CLI grouped list. |
| component | memoryTreeProvider | `apps/extension-vscode/src/memory/memoryTreeProvider.ts` | VS Code tree with category folders and provenance. |
| service | accountMemoryStore | `apps/extension-vscode/src/memory/accountMemoryStore.ts` | VS Code account memory cache and sync. |
| component | memorySheet | `apps/extension/src/features/side-panel/memorySheet.ts` | Chrome list sheet. |
| service | memoryClient | `apps/extension/src/features/cloud-bridge/memoryClient.ts` | Chrome account memory client and cache. |
| event | LIST_MEMORIES message | `apps/extension/src/background.ts` | Chrome background handler for the list (line 6078). |
| table | user_memories | `apps/web/db/neon/0285_user_memories_provenance.sql` | Provenance columns. |
| store | memory_facts | `apps/mobile/storage/memory.ts` | Mobile Local SQLite table access. |
| test | MemoryEditor tests | `packages/ui/unified-chat/src/components/__tests__/MemoryEditor.search.test.tsx` | Search test file. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The editor mounts and asks the store to hydrate from the server. | device | MemoryEditor.tsx:97-110; memoryStore.ts:406-430 |
| Store fetches pages of /api/memory until hasMore is false. | device and our servers | memoryStore.ts:166-184 |
| Server runs one query joining projects and chats under row-level user scope and returns the page. | our servers | route.ts:36-100 |
| Client groups facts and renders origin and time; search filters in memory. | device | MemoryEditor.tsx:32-47,300-325,480 |
| Mobile Cloud reads its synced local copy (kept current by sync); Local reads SQLite. | device | mobile store.ts:119-150 |
| CLI refreshes its cache from /api/memory/sync before printing. | device and our servers | lib.rs:4101-4108; cloud/memory.rs:15 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The list view (no new data) | Rows in table:user_memories; web client copy in browser storage key agi-memory-store-v1 (memoryStore.ts persist block); CLI cache cloud/memory.json (cloud/memory.rs:4); Chrome cache key agi_account_memory_cache | Yes, read from the account | Caches are replaced on refresh; logout resets the web store (memoryStore.ts:resetOnLogout) |

**Models and providers.** No model is used to list or search. Topic names come from a fixed classifier stored on each fact (classifyMemoryCategory, packages/ai/agent-core/src/memory.ts:636).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for Cloud; none for mobile Local. |
| Permissions | Rows scoped to the user and active workspace (route.ts:74-75). |
| Subscription | none found in the code opened. |
| Limits and metering | Page size 50 default, 100 maximum, offset cap 10,000; chat-conversation rate limit (route.ts:34-52). |
| Feature flags | none found. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found. |
| Local mode | Mobile Local lists on-device facts only, no network. Other apps list Cloud memory only; web states that device-local and offline memories are separate and not shown (MemorySection.tsx: description under the Memory heading, line ~236). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile shows Loading...; web shows syncing text; Chrome shows spMemoryLoading. | memory.tsx:~605; MemoryEditor.tsx:syncStatusLabel; memorySheet.ts:257 |
| Empty | Web: No cloud memory facts yet. Add one above...; CLI: Your AGI account holds no memories; Chrome: AGI has not saved anything about you yet. | MemoryEditor.tsx:~516-520; lib.rs:4113-4116; memorySheet.ts:214 |
| Error | Web Reload memories; mobile Could not load memories. Try again.; Chrome shows the server error text. | MemoryEditor.tsx:422; store.ts:154-158; memorySheet.ts:204-209 |
| Signed out | Chrome and VS Code say to sign in; mobile Cloud shows Sign in to manage Cloud memories. | memorySheet.ts:105,206; store.ts:SIGN_IN_REQUIRED_MESSAGE |
| Offline | Chrome can show cached list (fromCache); CLI uses its cache; web not handled in the code opened. | background.ts:6090-6096; cloud/memory.rs:4 |
| Memory off | Mobile dims the list and says saved memories are not used; web keeps the list. | memory.tsx:626-631 |
| Accessibility | VS Code tree items carry accessibility labels; web edit buttons carry aria-labels. | memoryTreeProvider.ts:48-52; MemoryEditor.tsx:300 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/__tests__/MemoryEditor.search.test.tsx`: Search in the editor (name only; contents not opened)
- `packages/ui/unified-chat/src/components/__tests__/MemoryEditor.updated.test.tsx`: Updated label (name only)
- `packages/ui/unified-chat/src/components/__tests__/MemoryEditor.content.test.tsx`: Editor content (name only)
- `apps/web/features/settings/sections/__tests__/MemoryProjectAttribution.test.tsx`: Project attribution (name only)
- `apps/web/features/memory/__tests__/cloud-memory-controller.test.ts`: Web controller (name only)
- `apps/web/__tests__/api/memory.test.ts`: API (name only)
- `apps/mobile/__tests__/MemoryScreenList.test.tsx`: Mobile list (name only)
- `apps/extension-vscode/src/__tests__/memoryTreeProvider.test.ts`: VS Code tree (name only)
- `apps/extension/__tests__/memory-sheet.test.ts`: Chrome sheet (name only)

**Test scenarios**

- **Search**
  1. Add facts about coffee and about cats.
  2. Type coffee in Search memory.
  - Expected: Only the coffee fact remains.
- **Paging**
  1. Create more than 100 memories.
  2. Open web list.
  - Expected: All load; the page API returns at most 100 per call with hasMore.
- **Provenance**
  1. Let a chat learn a fact, open the list.
  2. Delete the chat, reopen.
  - Expected: Origin shows the chat title first, then no title after the chat is deleted.
- **Project badge**
  1. Add a memory in a project.
  2. Open web list.
  - Expected: Badge Only in <project>.
- **CLI list**
  1. Run agi memory list.
  - Expected: Facts grouped by topic with origin and update date.
- **Chrome list**
  1. Open Memory from the account menu in Chrome.
  - Expected: List with source labels; More memories are in your web settings. when over one page.

**Where to look when it fails**

- Log Failed to fetch memories (route.ts:62).
- Web status text Cloud memories are not loaded. (MemorySection.tsx:338).
- Table user_memories filters: is_deleted, superseded_by, expires_at.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)
- VS Code: [70-qa/test-plans/vscode/039-memory-product.md](../../70-qa/test-plans/vscode/039-memory-product.md)
- Chrome: [70-qa/test-plans/chrome/039-memory-product.md](../../70-qa/test-plans/chrome/039-memory-product.md)

## 10. Gaps and dependencies

- **No search on CLI or Chrome.** Affects: CLI, Chrome. Evidence: Brief S39.05; lib.rs:1435-1486; memorySheet.ts. Work needed: Add search.
- **No grouping on Chrome; Chrome shows one page.** Affects: Chrome. Evidence: memorySheet.ts:195-221. Work needed: Group and page.
- **Chrome updated-time display not shown in code found.** Affects: Chrome. Evidence: memorySheet.ts:111-125. Work needed: Confirm or add.
- **Project-only badge not shown on mobile or VS Code in the code I opened.** Affects: Mobile, VS Code. Evidence: Brief S39.24 mobile and vscode missing. Work needed: Show the project label when project memories are listed.

**Depends on**

- SYS-memory-projects-and-context
- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- F039-01
- api:GET /api/memory
- table:user_memories
- store:memory_facts
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Whether the VS Code search quick pick exists as described (file treeQuickPick.ts not opened).
- Whether Chrome shows a last-updated time.
- Web behaviour when offline.
- Whether the Tauri desktop list shows the same fields (its tab uses an adapter, Memory.tsx:219, details not opened).
