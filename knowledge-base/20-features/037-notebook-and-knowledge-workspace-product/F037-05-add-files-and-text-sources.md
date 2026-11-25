---
id: "F037-05"
type: "feature"
title: "Add files and text sources"
aliases: ["Add sources", "Add files", "Upload", "Text input", "Add text", "Written note", "Knowledge files", "Add file (CLI)", "Notes.md", "S37.06 Add files", "S37.11 Add written note"]
area: "37 Notebook and knowledge-workspace product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S37.06", "S37.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "plan:free", "plan:basic", "plan:pro", "plan:max", "plan:team", "api:POST /api/uploads/presign", "api:POST /api/projects/{id}/knowledge-files", "table:project_knowledge_files", "store:project-store", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "F037-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F037-05 Add files and text sources

A person adds files (PDF, Office, text, images) or a typed note to a project as sources. Each file is checked, stored, read for text and indexed so the project's chats can use it. Web, Desktop, Mobile and CLI can add; the limit is 40 files and the plan's size and storage limits.

Area: [37. Notebook and knowledge-workspace product](README.md). Requirement items: [S37.06](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3706), [S37.11](../../10-requirements/capabilities/037-notebook-and-knowledge-workspace-product.md#s3711).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Uploads a file or a typed note to the project's knowledge, extracts its text, stores the bytes, and starts indexing so chats can search it (apps/web/lib/server/project-knowledge-files.ts:299-492).

**Why it exists.** Answers should come from the person's own documents, not only from the model's general knowledge. [inferred]

**Who uses it.** Project owners and editors.

**Problems it solves**

- Getting documents into a standing workspace once, not into every chat.
- Keeping a short note beside the files.
- Replacing a file by uploading a new version with the same name (old version is superseded).

**Use cases**

- Upload a PDF report on web and ask questions about page 12.
- Type a short brief with 'Text input' on web or 'Add text' on mobile.
- Run agi projects add-file Launch ./spec.pdf.
- Re-upload a changed spreadsheet with the same name to update it.

## 2. User experience

**Where to find it**

- Web: project Sources tab, button '+ Add sources', dialog 'Add sources' with a drop area 'Drag sources here', buttons 'Upload' ('Files from your device'), 'Text input' ('Paste or type text'), 'Google Drive' (AddSourcesModal.tsx:197, 259-312). Notes editor 'Notes.md' on the Sources tab (ProjectNotes.tsx:12).
- Desktop: the same hosted web page (doc: AGENTS.md section 5).
- Mobile: Sources tab, buttons 'Add sources' (document picker) and 'Add text' (ProjectSourcesTab.tsx:717-737).
- CLI: 'agi projects add-file <project> <path> [--json]' (apps/cli/src/lib.rs:1327-1331).
- VS Code, Chrome: no add control found.

**Before you start**

- A project the person owns, or an edit grant on a shared project (project-knowledge-files.ts:203-233).
- Not archived: 'This project is archived. Unarchive it to add sources.' (project-knowledge-files.ts:234-236).
- A plan with enough file size and storage allowance.

**Screens and controls**

- Web modal: drop area, Upload, Text input, Google Drive (shows 'Coming soon'), Close. Text view: 'Title (optional)' (max 120 characters), 'Content', 'Back', 'Add text' / 'Saving...' (AddSourcesModal.tsx:231-313, 385-500).
- File picker accepts the shared allowed-attachment list (AddSourcesModal.tsx:318; packages/contracts/types/src/chat.ts:121-129).
- Mobile: system document picker limited to project source types; text editor with 'Text source title', 'Text source content', Cancel and Add (ProjectSourcesTab.tsx:538-541, 784-826).
- CLI: prints a receipt for the added file.

**Journey**

1. Open Sources and press '+ Add sources' (or 'Add sources' on mobile).
2. Drop or pick a file, or choose Text input and type a title and content.
3. The app hashes the file, asks for an upload address, uploads the bytes, then registers the file with the project.
4. The server checks type, size, duplicates and limits, extracts text, stores the sealed copy and starts indexing.
5. The row appears with an indexing status; when it is ready the chats in the project can use it.

**What the person sees and gets**

- Web progress by file name; toast notices from the server (for example a withheld scan notice); modal error 'Could not add this source.' or a specific message (AddSourcesModal.tsx:88, 121; SourcesPanel.tsx:176-190).
- Server refusals: 'This project already has the maximum of 40 knowledge files. Remove a file before adding another.', 'This file is already in the project as ''<name>''.', archived message (project-knowledge-files.ts:235, 247-262).
- Unreadable file summary: 'Not readable: text is not extracted from images, so only this file name reaches the model.' or the no-text variant (project-knowledge-files.ts:164-169).
- Mobile alerts 'Some sources were not added', 'Text was not added' (ProjectSourcesTab.tsx:594, 644).
- CLI receipt line and optional JSON.

**Settings**

- Allowed types and per-file maximum come from the shared attachment policy (packages/contracts/types/src/attachment-policy.json:1-25).
- Plan limits for file size and storage (billing-catalog.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: upload by picker or drag and drop, text input saved as a .txt file named from the title (default 'Text note'), progress, preview, Notes.md editor (AddSourcesModal.tsx:111-125; SourcesPanel.tsx:298-304; ProjectNotes.tsx:12).
- Server: POST /api/projects/[id]/knowledge-files validates metadata, checks owner or editor, archive state, the 40-file limit, duplicate checksum, plan size and storage, inspects content, extracts text, seals the object, inserts a versioned row and dispatches indexing (project-knowledge-files.ts:187-492; route.ts:68-106).
- Mobile: file picker upload with hashing, presigned upload and register; 'Add text' writes a temporary .txt and uploads it; Local mode keeps metadata and the file URI on the device (ProjectSourcesTab.tsx:538-650; store.ts:217-340, 546-571).
- CLI: add-file hashes, presigns, uploads and registers with source surface 'cli' (apps/cli/src/cloud/knowledge.rs:12-15, 89-150; lib.rs:3800-3820). The brief says CLI missing; the code is wired.

**Incomplete**

- Web accepts only the first file when several are dropped or chosen (AddSourcesModal.tsx:97-100, 104-107).
- Images are stored but no text is extracted; only the name reaches the model (project-knowledge-files.ts:164-169).
- Mobile 'Add sources' picker uses the same allowed types but images must also pass the attachment validation (store.ts:243-246).
- Brief marks mobile written notes missing; code has 'Add text' (ProjectSourcesTab.tsx:607-650, 737).

**Present but disconnected or switched off**

- Google Drive button is disabled (see F037-06).
- /api/uploads/local-project-knowledge works only in development (route.ts:48).

**Not available**

- VS Code and Chrome: no add control (VS Code scoped out by D-2026-09-28-25; Chrome by D-2026-09-28-23, doc: docs/decisions/2026-09-27-founder-decisions.md).
- Audio files: not in the allowed types (packages/contracts/types/src/attachment-policy.json:3-9, no audio entry).

## 4. Required behaviour

**Established requirements**

- The user can add files (PDF, docs, text) to a notebook as sources and they are indexed for its chats. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.06)
- The user can write or paste a note and add it to the notebook as a source. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S37.11)
- A project holds at most 40 active files; replacing a file with the same name is allowed at the limit. (source: packages/contracts/types/src/suite-contracts.ts:502; apps/web/lib/server/project-knowledge-files.ts:238-250)
- A file already in the project (same checksum) is refused with its name. (source: apps/web/lib/server/project-knowledge-files.ts:252-262)
- Files over the plan's size limit or beyond storage are refused. (source: apps/web/lib/server/project-knowledge-files.ts:264-268)
- Archived projects cannot receive sources. (source: apps/web/lib/server/project-knowledge-files.ts:234-236)
- Content that fails inspection is rejected and purged, and a moderation event is recorded. (source: apps/web/lib/server/project-knowledge-files.ts:330-358)

**Acceptance criteria**

1. Uploading a PDF to a project adds a row that moves from indexing to indexed and the chat can quote it.
2. Uploading the same file twice is refused the second time with its name.
3. With 40 files, uploading a 41st with a new name is refused; uploading a file with an existing name replaces it.
4. On the free plan a file over the plan's size limit is refused with an upgrade message.
5. Text input with an empty body disables 'Add text'; with an empty title the source is named 'Text note'.
6. An archived project refuses an upload with the Unarchive message.
7. On mobile 'Add text' with a title 'Brief' creates 'Brief.txt'.
8. CLI add-file on a missing path fails with a read error and adds nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Text notes are ordinary text files, so they show in the Sources list with a text icon and count toward the 40-file limit [inferred from SourcesPanel.tsx:298-304].
- Replaced files keep older versions superseded, not shown (superseded_at) [inferred from SQL].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Accept several files at once on web.
- [proposed] Explain on the row that images are not read for text.
- [proposed] Show the 40-file counter and storage meter in the add dialog.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AddSourcesModal | `apps/web/features/projects/components/AddSourcesModal.tsx` | Web add dialog: upload, text input, Drive button. |
| component | SourcesPanel upload handlers | `apps/web/features/projects/components/SourcesPanel.tsx` | handleUpload, handleUploadText (298-304), progress and refresh. |
| component | ProjectNotes | `apps/web/features/projects/components/ProjectNotes.tsx` | Notes.md editor that saves as a source. |
| service | project-knowledge-upload | `apps/web/features/projects/services/project-knowledge-upload.ts` | Web upload through the shared knowledge client. |
| endpoint | POST /api/uploads/presign | `apps/web/app/api/uploads/presign/route.ts` | Issues the upload address for kind 'knowledge-file'. |
| endpoint | PUT /api/uploads/knowledge-file/put | `apps/web/app/api/uploads/knowledge-file/put` | Upload target for knowledge files (folder exists; contents not opened). |
| endpoint | POST /api/projects/[id]/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Registers the uploaded file. |
| service | project-knowledge-files | `apps/web/lib/server/project-knowledge-files.ts` | Capacity check, extraction, sealing, insert, indexing dispatch. |
| service | project-knowledge-extraction | `apps/web/lib/server/project-knowledge-extraction.ts` | Text extraction and content inspection. |
| service | attachment-allowance | `apps/web/lib/server/attachment-allowance.ts` | Plan size refusal for knowledge files. |
| service | file-storage | `apps/web/lib/server/file-storage.ts` | Storage allowance and meter. |
| config | attachment policy | `packages/contracts/types/src/attachment-policy.json` | Allowed types and maximum size. |
| config | MAX_PROJECT_KNOWLEDGE_FILES | `packages/contracts/types/src/suite-contracts.ts` | The 40 file limit (line 502). |
| component | ProjectSourcesTab | `apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx` | Mobile add files and add text. |
| store | cloudProjectSources | `apps/mobile/src/features/projects/store.ts` | Mobile presign, upload, register and remove for cloud projects (line 217+). |
| command | agi projects add-file | `apps/cli/src/lib.rs` | Subcommand (1327-1331) and handler (3800-3820). |
| service | CLI knowledge add_file | `apps/cli/src/cloud/knowledge.rs` | Hash, presign, upload, register. |
| table | project_knowledge_files | `apps/web/lib/server/project-knowledge-files.ts` | Insert with version and supersede (lines 388-433). |
| job | retrieval index workflow | `apps/web/lib/workflows/start-retrieval-index-workflow.ts` | Indexing job dispatched after registration (dispatchKnowledgeIndexing, lines 106-124). |
| job | file-processing.purge-upload-object | `apps/web/lib/server/project-knowledge-files.ts` | Queued retry that deletes an uploaded object (lines 126-155). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App checks the file type and size against the shared attachment rules, and computes a SHA-256 checksum. | device | store.ts:243-250 (mobile); cli knowledge.rs:100-110 |
| App asks POST /api/uploads/presign for an upload address (kind 'knowledge-file', project id, name, type, size, checksum). | our servers | apps/web/app/api/uploads/presign/route.ts:39-52; store.ts:254-269 |
| App uploads the bytes directly to object storage using the address. | outside service | store.ts:277-318 (uploadAsync PUT); cli knowledge.rs:115-130 |
| App registers the file with POST /api/projects/[id]/knowledge-files. | our servers | knowledge-files/route.ts:68-106 |
| Server checks access, archive state, 40-file limit, duplicate checksum, plan size and storage. | our servers | project-knowledge-files.ts:187-270 |
| Server reads the stored bytes, inspects content, extracts text (a scan may need a vision call, metered and billed to the plan), seals the object under a new key. | our servers | project-knowledge-files.ts:307-383 |
| Server inserts the row as the next version of that file name, marks the older version superseded, records anchors and any outside-origin reference, deletes the upload key. | our servers | project-knowledge-files.ts:385-479 |
| Server dispatches an indexing workflow; embeddings come from a managed provider route and are metered. | our servers | project-knowledge-files.ts:482; retrieval-embedding-service.ts:204-234 |
| Mobile Local mode skips all server steps and stores the source (name, type, size, file URI) in the project on the device. | device | store.ts:546-571 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| File bytes (sealed copy) | Object storage, key from sealProjectKnowledgeObject | Server-held; every app reads through the route | Removed on delete and project purge (apps/web/app/api/projects/[id]/__tests__/delete-purges-knowledge-files.test.ts exists) |
| File row, extracted text, anchors, checksum, version | table project_knowledge_files | Yes for account projects | Old versions are superseded; rows retired on delete |
| Moderation event for blocked content | Moderation log through recordModerationEvent | No | Not established |
| Mobile Local source | store:project-store (file stays at its device URI) | No | Removed with the source |

**Models and providers.** Text extraction is code, not a model, for most types. A scanned document with no text layer is read with a vision call that is metered to the plan and is withheld when the account opted out of training or the file came from Google data (project-knowledge-files.ts:316-326, 157-162). Indexing uses an embedding route from managed providers (retrieval-embedding-service.ts:215-220). Own-key mode: none found in the code. In mobile Local mode the on-device model later reads the source text (chatExecutionStore.ts:2755-2770).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required for account projects (web session, CLI Cloud mode, mobile Cloud mode). Mobile Local mode needs none. |
| Permissions | Owner or editor may add; viewers cannot; archived projects refuse (project-knowledge-files.ts:203-236). |
| Subscription | Per-file size limit by plan (attachmentSizeRefusal, project-knowledge-files.ts:266) and storage cap by plan: free 500 MiB, basic 4 GiB, pro 20 GiB, max 50 GiB, team 25 GiB (billing-catalog.ts:564, 619, 636, 655, 693). |
| Limits and metering | 40 files per project; storage meter returned by the list route; scan transcription and embeddings are metered managed compute (project-knowledge-files.ts:319-326; retrieval-embedding-service.ts:225-234). |
| Feature flags | Connector release constant 'coming_soon' disables Google Drive only (connector-release.ts:14). |
| Model compatibility | Image sources are stored without text; the model only gets the file name (project-knowledge-files.ts:164-169). |
| Provider restrictions | Embedding and scan reading use managed providers; the no-training filter applies for opted-out accounts (retrieval-embedding-service.ts:215-220). |
| Local mode | Mobile Local mode: sources stay on the phone and are read into the prompt by the on-device model, up to a character budget (services/attachmentContext.ts:68-90; chatExecutionStore.ts:2755-2770). No upload, no index. Other apps have no Local mode for sources. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Uploading | Web shows progress by file name; mobile 'Uploading <name>, <percent>%' with a 'Cancel adding sources' control. | SourcesPanel.tsx:313-345; ProjectSourcesTab.tsx:111-112, 248 |
| Cancel (mobile) | Abort stops the transfer and reports a cancelled error. | store.ts:104-110, 330-340 |
| Duplicate | Refused with the existing file name. | project-knowledge-files.ts:260-262 |
| Over file limit | Conflict message unless the name replaces an existing file. | project-knowledge-files.ts:246-250 |
| Content rejected | Validation error, object purged, moderation event. | project-knowledge-files.ts:330-359 |
| File changed during safety check | 'The uploaded file changed during its safety check. Upload it again.' | project-knowledge-files.ts:380-382 |
| No text found | File is stored; its summary says only the name reaches the model. | project-knowledge-files.ts:164-169 |
| Indexing fails | Row shows 'Not indexed' or 'Keyword search only' with 'Retry indexing'. | KnowledgeIndexStatus.tsx:29-33; KnowledgeFilesPanel.tsx:107-139 |
| Retry on a failed delete of the upload object | A purge job is queued; a critical log line appears if even queuing fails. | project-knowledge-files.ts:136-153 |
| Multiple files dropped | Only the first file is used. | AddSourcesModal.tsx:97-100 |
| Account switch (mobile) | The upload is cancelled when the account changes. | store.ts:228-237 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/route.test.ts`: Register route (file name).
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/content-inspection.test.ts`: Content inspection and rejection (file name).
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/route.extraction-state.test.ts`: Extraction states (file name).
- `apps/web/app/api/projects/[id]/knowledge-files/__tests__/storage-meter-matches-cap.test.ts`: Storage meter against cap (file name).
- `apps/web/features/projects/components/AddSourcesModal.test.tsx`: Add sources modal (file name).
- `apps/web/features/projects/services/project-knowledge-upload.test.ts`: Web upload service (file name).
- `apps/web/features/projects/__tests__/project-knowledge-upload-boundary.test.ts`: Upload boundary rules (file name).
- `apps/web/app/chat/projects/[id]/page.notes-draft.test.tsx`: Notes draft on the project page (file name).
- `apps/mobile/src/features/projects/__tests__/project-sources-cloud.test.ts`: Mobile cloud source upload (file name).
- `apps/web/e2e/project-knowledge-retrieval.spec.ts`: Browser test of retrieval from a long file (describe title).

**Test scenarios**

- **Add a PDF**
  1. Open Sources, press '+ Add sources', Upload a PDF.
  2. Wait for indexing.
  3. Ask about a fact in the PDF.
  - Expected: Row appears, becomes indexed, answer quotes it.
- **Duplicate**
  1. Upload a.pdf twice.
  - Expected: Second try is refused: 'This file is already in the project as ...'.
- **Limit**
  1. Fill a project with 40 files.
  2. Add a 41st with a new name; then add one with an existing name.
  - Expected: First refused with the maximum message; second replaces.
- **Written note**
  1. Choose Text input, leave title empty, type text, press 'Add text'.
  - Expected: A source named 'Text note' appears (stored as a .txt file).
- **Plan size**
  1. On a free account upload a file larger than the plan limit.
  - Expected: Refused with the plan size message.
- **CLI add-file**
  1. Run 'agi projects add-file Launch ./notes.md'.
  - Expected: Receipt printed; file visible in web Sources.

**Where to look when it fails**

- Logs: '[knowledge-files] rejected a project source that failed content inspection', '[knowledge-files] indexing was not dispatched', 'Failed to create knowledge file', 'Failed to extract project knowledge file' (project-knowledge-files.ts:340, 122, 477, 361).
- Table project_knowledge_files and the retrieval index state.
- Mobile console warning '[projectStore] orphaned knowledge upload cleanup failed' (store.ts:203).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/web/037-notebook-and-knowledge-workspace-product.md)
- Desktop: [70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/desktop/037-notebook-and-knowledge-workspace-product.md)
- Mobile: [70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/mobile/037-notebook-and-knowledge-workspace-product.md)
- CLI: [70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md](../../70-qa/test-plans/cli/037-notebook-and-knowledge-workspace-product.md)

## 10. Gaps and dependencies

- **Web ignores all but the first dropped or chosen file.** Affects: Web and Desktop. Evidence: AddSourcesModal.tsx:97-107. Work needed: Accept a list and upload in sequence with per-file results.
- **Images are accepted but never read for text.** Affects: All apps. Evidence: project-knowledge-files.ts:164-169. Work needed: Either read images with a vision step or say so before upload.
- **Brief says CLI add-file and mobile written notes are missing; code has both.** Affects: Audit accuracy. Evidence: lib.rs:3800-3820; ProjectSourcesTab.tsx:607-650. Work needed: Update the brief and test both.
- **No VS Code or Chrome add control.** Affects: VS Code and Chrome. Evidence: No code found. Work needed: None required by decisions D-2026-09-28-23 and -25.
- **The text note is a .txt upload, so the title is stripped of punctuation and a title with only symbols becomes 'text-note'.** Affects: Web. Evidence: SourcesPanel.tsx:298-300. Work needed: Keep the typed title as the display name.
- **Mobile Local-mode sources have no size or count limit seen in the code, only a prompt character budget.** Affects: Mobile Local mode. Evidence: store.ts:546-571; attachmentContext.ts:68-90. Work needed: Confirm and test limits for Local mode.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- plan:free
- plan:basic
- plan:pro
- plan:max
- plan:team
- api:POST /api/uploads/presign
- api:POST /api/projects/{id}/knowledge-files
- table:project_knowledge_files
- store:project-store
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- F037-04

## Unknown

- Per-plan file size values were not read (attachmentSizeRefusal body not opened).
- Contents of the PUT target at /api/uploads/knowledge-file/put.
- Whether a text note on web is shown with its typed title or the sanitized file name.
- How long moderation events are kept.
- Whether mobile Local-mode sources have any size limit beyond the prompt budget.
