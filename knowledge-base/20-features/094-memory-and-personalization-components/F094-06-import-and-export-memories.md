---
id: "F094-06"
type: "feature"
title: "Import and export memories"
aliases: ["Memory import/export (S94.12)", "Import memory from other AI providers", "Export memories", "memories-<date>.json", "/api/memory/import", "/api/memory/export", "Start import"]
area: "94 Memory and personalization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S94.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local", "table:user_memories", "api:POST /api/memory/import", "api:GET /api/memory/export", "api:GET /api/user/export", "file:packages/contracts/types/src/memory-import.ts", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "F094-01", "F094-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F094-06 Import and export memories

The person can download all saved memories as a JSON file, and can bring in memories from another assistant by pasting or uploading text, previewing the items, choosing which to import and committing. Duplicates are skipped and blocked items are reported. A full account data export also lists memories.

Area: [94. Memory and personalization components](README.md). Requirement items: [S94.12](../../10-requirements/capabilities/094-memory-and-personalization-components.md#s9412).

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

**What it does.** Exports active memories of the current workspace as memories-<date>.json and imports a list of memories from text in bulk (apps/web/app/api/memory/export/route.ts:52-107; apps/web/app/api/memory/import/route.ts:55-176).

**Why it exists.** Privacy settings must include import memory from other AI providers and data export (doc: docs/product/definition.md:283); every memory entry needs export (doc: docs/product/experience-contract.md:558).

**Who uses it.** People switching from another assistant, or taking a copy of their data.

**Problems it solves**

- No need to retype what another assistant knows.
- The person owns a portable copy of their memories.
- Imports cannot sneak in blocked content.

**Use cases**

- Copy the provided prompt, run it in another assistant, paste the answer into the dialog and import selected items.
- Export before deleting all memories.
- Download the full account export for a data request.

## 2. User experience

**Where to find it**

- Web (and Desktop's hosted web app): Settings > Memory > button 'Export memories'; row 'Import memory from other AI providers' with button 'Start import' (apps/web/features/settings/sections/MemorySection.tsx:352,444-455).
- Mobile: Settings > Memory > import screen (apps/mobile/app/(app)/settings/memory-import.tsx).
- Account export: the user data export includes a 'memories' section (apps/web/app/api/user/export/route.ts:2936-2948).
- Chrome, VS Code, CLI: no import or export UI found.

**Before you start**

- Signed in with Cloud memory loaded; Export is disabled when the list is empty or not synced (apps/web/features/settings/sections/MemorySection.tsx:344,349).
- Import needs the cloud memory controller; the button is disabled otherwise (apps/web/features/settings/sections/MemorySection.tsx:449).

**Screens and controls**

- Dialog 'Import memory from other AI providers' with source presets ChatGPT, Claude, Gemini, Copilot, Other; 'Copy prompt'; 'Custom source name'; 'Upload a memory export file'; list 'Memories to import' with 'Select all' / 'Deselect all' (apps/web/features/settings/components/ImportMemoryDialog.tsx:34,333,355,404,427,476,493).

**Journey**

1. Open Settings > Memory > 'Start import'.
2. Pick the source, copy the prompt, run it in the other assistant.
3. Paste the reply or upload the file; the dialog previews parsed items and marks duplicates.
4. Deselect what you do not want and press import; the dialog reports counts.
5. For export, press 'Export memories'; the browser saves memories-YYYY-MM-DD.json.

**What the person sees and gets**

- Import commit response counts: inserted, skipped duplicates, blocked, excluded by the never-remember list (apps/web/app/api/memory/import/route.ts:107-150).
- Errors: 'That file is too large to import.', 'Could not read that file.', 'Could not read that text.', 'Could not confirm the import. Check your saved memories before trying again.', 'Your memories could not be exported. Try again.' (apps/web/features/settings/components/ImportMemoryDialog.tsx:163,177,222,276; apps/web/features/settings/sections/MemorySection.tsx:37).
- Export file: JSON array of memory records with id, content, category, source, pinned, projectId, projectName, expiresAt, timestamps (apps/web/app/api/memory/export/route.ts:35-47).

**Settings**

- Never remember list and sensitive-topic switch also apply to import.
- Source name shown on imported memories ('Imported').

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Import dry-run (default mode): needs non-empty text, parses it, rejects text over 200,000 chars, marks items already present in the same workspace, returns up to 500 items with a truncation flag (apps/web/app/api/memory/import/route.ts:55-85; packages/contracts/types/src/memory-import.ts:3-4,82-106).
- Import commit: 1 to 500 non-empty strings; each is checked against the never-remember list, then the write policies (eligibility gate with userRequested true), then inserted with an import key; duplicate keys per user, source and workspace are skipped (apps/web/app/api/memory/import/route.ts:90-150; apps/web/lib/memory/import-store.ts:33-75).
- Imported source value is 'imported:<name>' with a name up to 60 chars (packages/contracts/types/src/memory-import.ts:6-8).
- Export: GET, rate limit, active workspace rows in batches of 1,000, ordered by id, capped at 50,000 with a 'Delete some and try again' error, no-store, attachment filename memories-<date>.json (apps/web/app/api/memory/export/route.ts:14-107).
- Account data export lists memories across workspaces with is_deleted (apps/web/app/api/user/export/route.ts:408-416,2938-2948).
- Mobile local import writes facts with source 'imported' (apps/mobile/src/features/memory/store.ts:465).

**Incomplete**

- Import does not merge near-duplicates or supersede conflicts at write time; only exact import-key dedupe happens, and the daily job tidies later (apps/web/lib/memory/import-store.ts:56-71; apps/web/app/api/cron/expire-memories/route.ts).
- Imported rows are written with no project id and rely on the database column default for the workspace (apps/web/lib/memory/import-store.ts:56-61) [inferred global scope and scoped-db default].

**Present but disconnected or switched off**

- Import has no per-item expiry from the person; expiry comes only from workspace retention (apps/web/app/api/memory/import/route.ts:132).

**Not available**

- Import and export on Chrome extension, VS Code and CLI: not found in the files read.
- Export of device-local Mobile memory as a file: not located.

## 4. Required behaviour

**Established requirements**

- Memories can be imported and exported in bulk. (source: S94.12)
- Privacy settings include import memory from other AI providers and data export. (source: doc: docs/product/definition.md:283)
- Each memory entry needs export and deletion. (source: doc: docs/product/experience-contract.md:558)

**Acceptance criteria**

1. 'Export memories' downloads memories-<date>.json containing only active memories of the current workspace.
2. With more than 50,000 memories export fails with a message asking the person to delete some.
3. Import preview marks items already saved; commit skips them and reports counts.
4. An item with a credential or a never-remember term is not saved and is counted.
5. Importing the same text twice inserts nothing the second time.
6. More than 500 items in one commit is refused; text over 200,000 characters is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Export should omit tombstones; it does (active predicate) while the account export does not [inferred from apps/web/app/api/memory/export/route.ts:68 and apps/web/app/api/user/export/route.ts:2940].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer import and export in Mobile Cloud and Local with the same file format.
- [proposed] Run duplicate and topic consolidation on import commit.
- [proposed] Add an optional expiry choice to import.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/memory/import | `apps/web/app/api/memory/import/route.ts` | Dry-run preview and commit |
| endpoint | GET /api/memory/export | `apps/web/app/api/memory/export/route.ts` | JSON download |
| endpoint | GET /api/user/export | `apps/web/app/api/user/export/route.ts` | Account export with a memories section |
| service | import-store | `apps/web/lib/memory/import-store.ts` | persistImportedMemories with import-key conflict skip |
| schema | memory-import contract | `packages/contracts/types/src/memory-import.ts` | Parsing, limits, preview, source naming |
| service | memory-write-service | `apps/web/lib/services/memory-write-service.ts` | partitionMemoryWrites against never-remember terms |
| service | memoryWriteAdmission | `apps/web/lib/services/managed-memory-context-service.ts` | Eligibility gate per item |
| component | ImportMemoryDialog | `apps/web/features/settings/components/ImportMemoryDialog.tsx` | Import dialog |
| component | MemorySection | `apps/web/features/settings/sections/MemorySection.tsx` | Export button and Start import row |
| store | cloud-memory-controller exportMemories | `apps/web/features/memory/cloud-memory-controller.ts` | Fetches /api/memory/export |
| table | user_memories | `apps/web/db/neon/0409_memory_import_workspace_unique_key.sql` | import_key unique per user, source, workspace |
| screen | mobile memory-import | `apps/mobile/app/(app)/settings/memory-import.tsx` | Mobile import screen |
| service | mobile memoryImport | `apps/mobile/src/features/memory/services/memoryImport.ts` | Parse and import on the phone |
| test | import-store test | `apps/web/lib/memory/__tests__/import-store.test.ts` | Import persistence |
| test | export route test | `apps/web/app/api/memory/__tests__/export.test.ts` | Export route |
| test | memory-import contract test | `packages/contracts/types/src/__tests__/memory-import.test.ts` | Parser and limits |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The dialog posts the pasted or uploaded text to POST /api/memory/import with mode dry-run. | device and our servers | apps/web/features/settings/components/ImportMemoryDialog.tsx:163-222; apps/web/app/api/memory/import/route.ts:55 |
| The server parses items, loads the active workspace keys and returns the preview. | our servers | apps/web/app/api/memory/import/route.ts:45-85 |
| The person selects items and the dialog posts mode commit with the strings. | device | apps/web/features/settings/components/ImportMemoryDialog.tsx:241-276 |
| The server removes items matching never-remember terms, applies the write policies per item, then inserts with ON CONFLICT DO NOTHING on the import key. | our servers | apps/web/app/api/memory/import/route.ts:107-150; apps/web/lib/memory/import-store.ts:56-71 |
| Export streams rows by id in batches of 1,000 and returns one JSON array as a download. | our servers | apps/web/app/api/memory/export/route.ts:52-107 |
| The browser saves the blob under the server filename. | device | apps/web/features/settings/sections/MemorySection.tsx:64-77 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Imported memory rows (source 'imported:<name>', import_key) | table user_memories | Yes via /api/memory/sync | Until deleted; deletion clears the import key (apps/web/lib/services/managed-memory-context-service.ts:391-392) |
| Pasted import text | Browser memory during the dialog and the request; not stored as such | No | Not retained by the route [inferred; request body is not persisted in the code read] |
| Exported JSON | The person's downloads folder | No | Under the person's control; Cache-Control no-store |

**Models and providers.** None. Import parsing and export are deterministic code. The prompt the person copies is run by them in another assistant outside AGI Workforce.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in; user-scoped database. |
| Permissions | Workspace memory policy applies per item through the eligibility gate (apps/web/app/api/memory/import/route.ts:122-141). |
| Subscription | none found in the code for import or export. |
| Limits and metering | Import text 200,000 chars; 500 items per commit; item up to 20,000 chars; source name 60 chars; export cap 50,000; batch 1,000; rate limit 'chat-conversation' for import and 'chat-conversation-read' for export (packages/contracts/types/src/memory-import.ts:3-6; apps/web/app/api/memory/export/route.ts:14-18,53). |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Web import and export work only on Cloud account memory; the Settings text says device-local memories are not shown or uploaded (apps/web/features/settings/sections/MemorySection.tsx:241-243). Mobile Local import writes to the on-device store (apps/mobile/src/features/memory/store.ts:465). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Button text 'Exporting…' with aria-busy. | apps/web/features/settings/sections/MemorySection.tsx:344-352 |
| Empty | Export disabled with no memories; dry-run without text returns a validation error 'Pasted or uploaded memory text is required'. | apps/web/features/settings/sections/MemorySection.tsx:344; apps/web/app/api/memory/import/route.ts:56-58 |
| Too large | Import text over the limit returns a validation error; export over 50,000 returns payload-too-large with a user-safe message. | apps/web/app/api/memory/import/route.ts:65-70; apps/web/app/api/memory/export/route.ts:88-96 |
| Error | Export read errors become 'Failed to export memories'; import persistence errors become 'Failed to import memories'; the dialog tells the person to check saved memories. | apps/web/app/api/memory/export/route.ts:82-84; apps/web/app/api/memory/import/route.ts:143-146 |
| Retry | A repeated commit is safe because exact duplicates are skipped by import key. | apps/web/lib/memory/import-store.ts:56-71 |
| Partial block | Blocked and excluded items are counted, not silently saved. | apps/web/app/api/memory/import/route.ts:132-150 |
| Accessibility | Select-all toggle and each item checkbox have aria-labels; copy status is announced ('Prompt copied'). | apps/web/features/settings/components/ImportMemoryDialog.tsx:365,476,505 |
| Offline | Not handled in the code beyond the error messages. | apps/web/features/settings/components/ImportMemoryDialog.tsx:276 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/memory-import.test.ts`: Import parser and limits (by file name)
- `apps/web/lib/memory/__tests__/import-store.test.ts`: Import persistence (by file name)
- `apps/web/app/api/memory/__tests__/export.test.ts`: Export route (by file name)
- `apps/web/db/neon/memory-import-workspace-unique-key-migration.test.ts`: Workspace-scoped import key migration (by file name)
- `apps/web/features/settings/components/__tests__/ImportMemoryDialog.deselect.test.tsx`: Deselect behaviour (by file name)
- `apps/web/features/settings/components/__tests__/ImportMemoryDialog.excluded.test.tsx`: Excluded items (by file name)
- `apps/web/features/settings/components/__tests__/ImportMemoryDialog.prompt.test.tsx`: Prompt copy (by file name)
- `apps/web/app/api/memory/__tests__/exclusion-enforcement.test.ts`: Exclusion enforcement, may include import (by file name)

**Test scenarios**

- **Import and repeat**
  1. Paste three lines of facts in the dialog.
  2. Select all and import.
  3. Paste the same text again and import.
  - Expected: First: 3 inserted. Second: 0 inserted, 3 skipped duplicates.
- **Blocked content**
  1. Add 'my password is hunter2-style secret' and a never-remember term to the pasted list.
  2. Import.
  - Expected: Those items are counted as blocked or excluded and do not appear in the list.
- **Export**
  1. Press 'Export memories'.
  2. Open the downloaded file.
  - Expected: File name memories-<date>.json; JSON array of active memories only.
- **Limits**
  1. Paste more than 200,000 characters.
  2. Post a commit with 501 items.
  - Expected: Both refused with validation messages.
- **Account export**
  1. Request the full account data export.
  - Expected: A 'memories' section lists rows including is_deleted flags.

**Where to look when it fails**

- Log '[memory-export] read failed' and 'Failed to import memories'.
- Response fields insertedCount, skippedDuplicateCount, blockedCount, excludedCount on commit.
- Table user_memories: source like 'imported:%' and import_key.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Import and export exist on Web (and Desktop hosted web) and Mobile only; Chrome, VS Code and CLI have none found.** Affects: Chrome, VS Code, CLI users.. Evidence: memory UIs in implementation_map of F094-03. Work needed: Decide whether the Web page is the single home and say so, or add commands.
- **Import does not apply near-duplicate merge or topic supersede at write.** Affects: People importing overlapping lists.. Evidence: apps/web/lib/memory/import-store.ts:56-71. Work needed: Call writeConsolidatedMemory per item or rely on the daily job.
- **Account export includes tombstones and omits pinned and expiry.** Affects: Data export users.. Evidence: apps/web/app/api/user/export/route.ts:408-416,2938-2948. Work needed: Align the account export fields with the memory export.
- **Export is one in-memory JSON array up to 50,000 records.** Affects: Very large accounts.. Evidence: apps/web/app/api/memory/export/route.ts:62-107. Work needed: Stream or paginate if limits are raised.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local
- table:user_memories
- api:POST /api/memory/import
- api:GET /api/memory/export
- api:GET /api/user/export
- file:packages/contracts/types/src/memory-import.ts
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- F094-01
- F094-03

## Unknown

- How Mobile exports memory, if at all.
- Contents of the tests listed by file name.
- Whether the account export is reachable from Settings and how.
- The accepted text formats in parseImportedMemoryText (format field values not read).
