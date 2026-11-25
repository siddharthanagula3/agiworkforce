---
id: "F039-10"
type: "feature"
title: "Import and export memories"
aliases: ["Import memory from other AI providers", "Start import", "Export memories", "Export Local Data", "Export Cloud data", "agi memory import", "agi memory export", "Import JSON", "Export Markdown", "S39.21", "S39.22"]
area: "39 Memory product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S39.21", "S39.22"]
depends_on: ["SYS-memory-projects-and-context", "SYS-api-and-contracts", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage", "surface:web", "surface:mobile", "surface:desktop", "surface:cli", "mode:cloud", "mode:local", "table:user_memories", "api:POST /api/memory/import", "api:GET /api/memory/export", "api:GET /api/user/export", "F039-12", "F039-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F039-10 Import and export memories

People can bring memories in from another assistant or a file and download theirs. Web has a paste-or-upload dialog with a preview; mobile has a similar screen. Desktop Tauri imports and exports device JSON. CLI imports and exports from the terminal, but its import shows no preview. VS Code and Chrome have neither.

Area: [39. Memory product](README.md). Requirement items: [S39.21](../../10-requirements/capabilities/039-memory-product.md#s3921), [S39.22](../../10-requirements/capabilities/039-memory-product.md#s3922).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Import turns a pasted reply or an uploaded text or JSON file into candidate memories, shows them for review, drops duplicates and saves the chosen ones. Export writes the person's saved memories into a file they can keep.

**Why it exists.** People moving from another assistant should not start from zero, and they should be able to take their data out. docs/product/requirements.md:1513-1522 asks for an import with a prompt for the other provider, paste or upload, parsed candidates, dedupe, edit before saving and approve.

**Who uses it.** People switching from another assistant; people backing up or auditing their memories; support staff.

**Problems it solves**

- Rebuilding memory by hand.
- No copy of what AGI holds about the person.
- Duplicate or unsafe facts entering memory in bulk.

**Use cases**

- On web, copy the prompt, send it to another assistant, paste its list, preview, tick the items to keep and import.
- On web, press Export memories to download a dated JSON file.
- In the CLI run agi memory import notes.md --source ChatGPT.
- On the desktop Tauri build, export Markdown for reading and JSON for backup, then import the JSON on another device.

## 2. User experience

**Where to find it**

- Web: Settings, Memory, row 'Import memory from other AI providers' with button 'Start import' (apps/web/features/settings/sections/MemorySection.tsx:453); button 'Export memories' (MemorySection.tsx:352).
- Web account-wide: the account data export includes a memories section (apps/web/app/api/user/export/route.ts:408,2948).
- Mobile: Settings, Memory, import icon opens the memory-import screen with a Preview button (apps/mobile/app/(app)/settings/memory.tsx:714; memory-import.tsx:499). Memory export is part of Settings, Data Controls: 'Export Local Data' (device memory facts) and 'Export Cloud data' (account export) (apps/mobile/src/features/settings/data-controls/index.tsx:433,601).
- Desktop Tauri local Memory tab: 'Export Markdown', 'Export JSON', 'Import JSON' (apps/desktop/src/features/settings/tabs/Memory.tsx:250,293). They are shown only for the device scope (Memory.tsx:233,265). The Cloud scope tab has none; the Electron desktop shows the web app (doc: AGENTS.md section 5) [inferred].
- CLI: agi memory import <file> [--source], agi memory export [--out file] (apps/cli/src/lib.rs:1435,4244,4269).
- VS Code and Chrome: no import or export found.

**Before you start**

- Signed in for web, mobile Cloud, CLI.
- Memory switched on: mobile shows the import control only when memory is on (memory.tsx:712).
- CLI needs a Managed (Cloud) session; Local and BYOK are refused with a message (apps/cli/src/lib.rs account_privacy_mode comment).

**Screens and controls**

- Web dialog 'Import memory from other AI providers': copyable prompt for the other assistant, source choice (ChatGPT, Claude, Gemini, Copilot, Other) and custom name, paste box, file upload accepting .txt and .json (ImportMemoryDialog.tsx:33-37,333).
- Preview list with select-all and per-item checkboxes, then commit.
- Mobile: source options, text box 'Memories to import', 'Choose a text or JSON file', Preview button, then select and import.
- Desktop Tauri: three buttons listed above.
- CLI flags: --source (default Other), --out.

**Journey**

1. 1. Open the import control.
2. 2. Copy the prompt, send it to the other assistant (web), and paste its reply or choose a file.
3. 3. Press Preview; the server parses lines or a JSON array, removes repeats and marks duplicates of existing memories.
4. 4. Tick the items to keep (web and mobile).
5. 5. Confirm; the server refuses never-remember matches and policy-blocked items and saves the rest with source imported:<name>.
6. 6. A result line says how many were imported, skipped as duplicates, blocked or excluded.
7. Export: press Export memories; the browser downloads memories-<date>.json.

**What the person sees and gets**

- 'Imported N memories from <source>.' on web (ImportMemoryDialog.tsx:295).
- File errors: 'That file is too large to import.', 'Could not read that file.' (ImportMemoryDialog.tsx:163,177); preview error 'Could not read that text.'.
- Export busy label 'Exporting…' and failure 'Your memories could not be exported. Try again.' (MemorySection.tsx:37,352).
- CLI: 'Imported N memories. Skipped N duplicates; N were refused by your memory policy and N matched never-remember terms.' (lib.rs import branch).
- Desktop Tauri: 'Imported N memories.' plus kept-unchanged and unreadable counts (Memory.tsx importMemories).

**Settings**

- Never remember list and workspace policy affect what an import keeps (apps/web/app/api/memory/import/route.ts:107-140).
- Memory on/off.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web import has two modes: dry-run returns parsed candidates with duplicate flags, commit saves the chosen items (apps/web/app/api/memory/import/route.ts:55,107).
- Parser accepts a JSON array of strings or objects with text or content, or plain lines with bullets; limits 200,000 characters and 500 items (packages/contracts/types/src/memory-import.ts:3-4,82).
- Commit filters never-remember matches, applies write policy, deduplicates by a workspace-aware key and stores source imported:<slug> (import/route.ts:107-140; apps/web/lib/memory/import-store.ts:63-66).
- Export returns active memories of the active workspace as JSON with id, content, category, source, pin, project, expiry and dates, up to 50,000, as an attachment (apps/web/app/api/memory/export/route.ts:17,98).
- Mobile Cloud mode uses the same import endpoint in chunks of the import limit and then syncs (apps/mobile/src/features/memory/store.ts:425-460); mobile Local mode writes on the device through the local writer, which refuses credentials (store.ts after line 460; localMemoryWriter.ts:25).
- Desktop Tauri device scope exports JSON or Markdown and imports a JSON backup (apps/desktop/src/stores/memoryStore.ts:120-137).
- CLI imports and exports through the same account endpoints (apps/cli/src/cloud/mod.rs:810; lib.rs:4244).

**Incomplete**

- CLI import previews on the server but does not show the list: it removes duplicates and commits all the rest, so the person cannot approve items first (apps/cli/src/cloud/mod.rs:816-845).
- Export is JSON only on web and CLI; only desktop Tauri offers Markdown (Memory.tsx:250).
- Mobile has no memory-only export: memory leaves through the whole local export or the whole Cloud account export (data-controls/index.tsx:433,601; apps/mobile/services/dsarExport.ts:283).
- The web preview lets the person pick items; whether the text of an item can be edited before saving was not confirmed in the dialog code read.
- Desktop Tauri import takes only the app's own JSON backup, not another assistant's text (stores/memoryStore.ts:124).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Import and export in VS Code and Chrome: no code found.
- Desktop Tauri Cloud-scope import and export: not in the Cloud tab (Memory.tsx:233,265 gate on local scope).

## 4. Required behaviour

**Established requirements**

- The user can bring memories from a file or another assistant into their memory, preview them, and later chats use them. (source: brief S39.21 Should)
- The user can download saved memories in a readable file. (source: brief S39.22 Should)
- Memory import provides a prompt for the other provider, a paste or upload screen, parsed candidates, dedupe, edit before save and approve-all. (source: docs/product/requirements.md:1515-1522)
- Every memory entry exposes export. (source: docs/product/experience-contract.md:28)
- Import and export failures show an error to the person. (source: brief people line (not fully verified))

**Acceptance criteria**

1. Pasting a bulleted list on web and pressing Preview lists each line once with duplicates of existing memories marked.
2. Committing only ticked items saves only those items with source imported:<name>.
3. Items containing a never-remember term or credential-like text are not saved, and the result counts them.
4. Repeating the same import saves nothing new.
5. Export downloads a JSON file that the import accepts back fact for fact.
6. Export covers only the active workspace and active memories.
7. A file over the size limit shows 'That file is too large to import.'.
8. The CLI reports counts after import and refuses to overwrite an existing export file.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should show candidates before saving to meet 'preview them' [inferred from the requirement and cloud/mod.rs:816-845].
- Readable file may be read as Markdown or JSON; the leaders' export format is not recorded here [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add --dry-run to agi memory import that prints candidates and asks to confirm.
- [proposed] Offer Markdown export on web and CLI.
- [proposed] Add a memory-only export to mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/memory/import | `apps/web/app/api/memory/import/route.ts` | dry-run preview and commit |
| service | persistImportedMemories | `apps/web/lib/memory/import-store.ts` | Inserts with workspace-aware dedupe key |
| schema | memory-import parser | `packages/contracts/types/src/memory-import.ts` | Parses text or JSON, limits, source naming |
| component | ImportMemoryDialog | `apps/web/features/settings/components/ImportMemoryDialog.tsx` | Web compose, preview, done steps |
| component | MemorySection import and export controls | `apps/web/features/settings/sections/MemorySection.tsx` | Start import and Export memories buttons |
| endpoint | GET /api/memory/export | `apps/web/app/api/memory/export/route.ts` | JSON attachment of active memories |
| service | cloud-memory-controller exportMemories | `apps/web/features/memory/cloud-memory-controller.ts` | Fetches export with workspace header |
| endpoint | GET /api/user/export (memories section) | `apps/web/app/api/user/export/route.ts` | Account data export including memories |
| screen | Mobile memory-import | `apps/mobile/app/(app)/settings/memory-import.tsx` | Mobile import screen with preview |
| store | mobile memory store bulkInsert | `apps/mobile/src/features/memory/store.ts` | Cloud commit in chunks or local writes |
| service | mobile dsarExport | `apps/mobile/services/dsarExport.ts` | Local export including memory facts |
| service | mobile cloudDataExport | `apps/mobile/services/cloudDataExport.ts` | Calls /api/user/export |
| component | Desktop Tauri MemoryTab | `apps/desktop/src/features/settings/tabs/Memory.tsx` | Local Export Markdown, Export JSON, Import JSON |
| store | desktop memoryStore | `apps/desktop/src/stores/memoryStore.ts` | exportBackup, exportMarkdown, importBackup |
| command | agi memory import / export | `apps/cli/src/lib.rs` | CLI commands |
| service | import_memories | `apps/cli/src/cloud/mod.rs` | CLI dry-run then commit in batches of 500 |
| table | user_memories (import_key, source) | `apps/web/lib/memory/import-store.ts` | Imported rows |
| service | partitionMemoryWrites | `apps/web/lib/services/memory-write-service.ts` | Never-remember filter for imports |
| test | export.test | `apps/web/app/api/memory/__tests__/export.test.ts` | Export route tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person pastes text or picks a file; the browser reads the file locally (size checked). | device | apps/web/features/settings/components/ImportMemoryDialog.tsx:163-177 |
| Preview request (mode dry-run) is sent; server parses, dedupes inside the text and marks duplicates of existing memories in the active workspace. | our servers | apps/web/app/api/memory/import/route.ts:55-90 |
| Person ticks items and commits. | device | ImportMemoryDialog.tsx:238-283 |
| Server removes never-remember matches, applies write policy per item, inserts the rest, and returns counts. | our servers | import/route.ts:107-150; import-store.ts:63 |
| Export: the server reads active memories in batches by id and returns one JSON file. | our servers | apps/web/app/api/memory/export/route.ts:55-98 |
| Desktop Tauri and mobile Local import or export use only device storage. | device | apps/desktop/src/stores/memoryStore.ts:124; apps/mobile/src/features/memory/store.ts:425 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Imported memories | table user_memories (Cloud); mobile SQLite memory_facts (Local); desktop Tauri device store (Local) | Cloud rows sync to every client; Local rows do not leave the device | Like any memory: tombstone on delete, or Delete-all |
| Exported file | Downloaded to the person's device; not kept by AGI | No | Person's responsibility; Cache-Control no-store (export/route.ts:98) |
| Pasted import text | Sent to the server for parsing; the preview response is not stored by the code read | No | unknown whether request bodies are logged |

**Models and providers.** No model is used by import or export; parsing is rule-based (packages/contracts/types/src/memory-import.ts:82). The web dialog gives a prompt to run in another assistant, which is outside AGI (ImportMemoryDialog.tsx:37).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for Cloud import and export; none for mobile Local or desktop Tauri device import and export. |
| Permissions | Writes follow workspace policy and the person's memory switch (import/route.ts:107-140). Export reads only the caller's own active rows (export/route.ts:55). |
| Subscription | none found in the code. |
| Limits and metering | 200,000 characters and 500 items per import (memory-import.ts:3-4); export refuses above 50,000 memories with a message (export/route.ts:17); rate limit bucket chat-conversation on import and chat-conversation-read on export. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. Imported text from another provider is treated as untrusted candidate facts only. |
| Local mode | Mobile Local mode and desktop Tauri device scope import and export with no account and no payment. CLI refuses Local and BYOK for account memory commands. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Too large file or text | Error naming the limit | ImportMemoryDialog.tsx:163; memory-import.ts:82-85 |
| Read error | 'Could not read that file.' | ImportMemoryDialog.tsx:177 |
| Preview failure | 'Could not read that text.' and the person can retry | ImportMemoryDialog.tsx:221 |
| Commit in progress | Dialog cannot be closed by Escape or outside click | ImportMemoryDialog.tsx:325-330 |
| Empty or all duplicates | CLI prints 'Nothing new to import'; web shows duplicates marked | apps/cli/src/lib.rs import branch; import/route.ts:90 |
| Account switch during import (mobile) | Operation is checked against the account epoch and stopped | apps/mobile/src/features/memory/store.ts:425-450 assertMemoryImportOperationCurrent |
| Local write failure midway (mobile) | Throws an uncertain-outcome message | store.ts local branch; MEMORY_IMPORT_UNCERTAIN_MESSAGE |
| Export over 50,000 memories | Refused with a message to delete some | export/route.ts:80-90 |
| Export file exists (CLI) | Refuses to overwrite; error names the path | apps/cli/src/lib.rs:4244 area (create_new) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/memory/__tests__/export.test.ts`: Downloadable JSON of active memories, caller and workspace only, paging by id, and that the file reads back through import
- `apps/web/lib/memory/__tests__/import-store.test.ts`: Import store behaviour (file exists; titles not read)
- `packages/contracts/types/src/__tests__/memory-import.test.ts`: Import parser (file exists; titles not read)
- `apps/web/db/neon/memory-import-workspace-unique-key-migration.test.ts`: Migration of the workspace import key
- `apps/mobile/__tests__/memory-import-preview.test.ts`: Mobile preview
- `apps/mobile/__tests__/memory-import-commit.test.ts`: Mobile commit
- `apps/mobile/__tests__/MemoryImportLifecycle.test.tsx`: Mobile import screen lifecycle
- `apps/web/app/api/memory/__tests__/exclusion-enforcement.test.ts`: Drops excluded items on import and reports the count (test title at line 138)

**Test scenarios**

- **Web paste and preview**
  1. Settings, Memory, Start import.
  2. Choose ChatGPT, paste three bullet lines, one already saved.
  3. Press Preview.
  - Expected: Three items listed; the saved one marked duplicate.
- **Commit subset**
  1. Untick one item and import.
  - Expected: Result 'Imported 2 memories from ChatGPT.'; the third is not saved.
- **Never remember during import**
  1. Add the term 'home address' to Never remember.
  2. Import a list with a line containing it.
  - Expected: That line is not saved and is counted as excluded.
- **Round trip**
  1. Export memories.
  2. Delete all memories.
  3. Import the exported file.
  - Expected: Facts return (categories and pins are not restored by the text import; check).
- **CLI import without preview**
  1. Run agi memory import file.md --source Other.
  - Expected: Counts are printed; no list is shown first (gap).
- **Desktop Tauri backup**
  1. Local Memory tab, Export JSON, then Import JSON on a clean profile.
  - Expected: Imported N memories message.

**Where to look when it fails**

- Server log 'Failed to import memories' and '[memory-export] read failed'.
- Validation errors 'Pasted or uploaded memory text is required', 'mode must be "dry-run" or "commit"'.
- Table user_memories where source starts with imported:.
- Desktop console '[memoryStore] failed to import memories'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/039-memory-product.md](../../70-qa/test-plans/web/039-memory-product.md)
- Desktop: [70-qa/test-plans/desktop/039-memory-product.md](../../70-qa/test-plans/desktop/039-memory-product.md)
- Mobile: [70-qa/test-plans/mobile/039-memory-product.md](../../70-qa/test-plans/mobile/039-memory-product.md)
- CLI: [70-qa/test-plans/cli/039-memory-product.md](../../70-qa/test-plans/cli/039-memory-product.md)

## 10. Gaps and dependencies

- **CLI import shows no preview** Affects: CLI users. Evidence: apps/cli/src/cloud/mod.rs:816-845. Work needed: Print candidates and confirm, or add a dry-run option
- **No import or export in VS Code and Chrome** Affects: VS Code and Chrome users. Evidence: No code found. Work needed: Decide whether to add or point to web
- **No memory-only export on mobile** Affects: Mobile users. Evidence: data-controls/index.tsx:433,601. Work needed: Add Export memories to the Memory screen
- **Desktop Tauri Cloud scope lacks import and export** Affects: Desktop Tauri Cloud-mode users. Evidence: Memory.tsx:233,265. Work needed: Show the controls in the Cloud tab or confirm Electron covers it
- **Export is JSON only on web and CLI** Affects: People wanting a readable file. Evidence: export/route.ts:48. Work needed: Add a Markdown option
- **Edit before save not confirmed in the web preview** Affects: Web importers. Evidence: docs/product/requirements.md:1521 versus the dialog code read. Work needed: Confirm and add if missing
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-api-and-contracts
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage
- surface:web
- surface:mobile
- surface:desktop
- surface:cli
- mode:cloud
- mode:local
- table:user_memories
- api:POST /api/memory/import
- api:GET /api/memory/export
- api:GET /api/user/export
- F039-12
- F039-09

## Unknown

- Whether the web preview lets the person edit item text.
- Whether the Electron desktop shows web import and export (inferred only).
- Whether request bodies of pasted text are logged.
- Whether the round trip restores category and pin (import keeps text only per import-store.ts:63).
- No tests were run.
