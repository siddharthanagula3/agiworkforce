---
id: "F026-04"
type: "feature"
title: "Preview, source view and read-only mode"
aliases: ["Preview / Source toggle", "Eye and Code toggle", "Edit source", "Direct edit", "Save as a new version", "Read-only artifact", "Ask for changes"]
area: "26 Artifact container and panel"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S26.14", "S26.15", "S26.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "surface:vscode", "surface:cli", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "F026-05", "file:packages/platform/artifacts/src/artifact-store.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F026-04 Preview, source view and read-only mode

Lets a person switch a renderable artifact between its preview and its source. On web, Desktop and mobile a person can edit the text and save it as a new version. Only the newest version of a stored artifact can be edited; older versions and file formats like PDF or images cannot. CLI, VS Code and Chrome are read-only.

Area: [26. Artifact container and panel](README.md). Requirement items: [S26.14](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2614), [S26.15](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2615), [S26.16](../../10-requirements/capabilities/026-artifact-container-and-panel.md#s2616).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers a Preview and Source toggle, an 'Edit source' action that saves a new version, and blocks editing where it would be unsafe (ArtifactPreview.tsx:1041-1042,2315-2322,2582-2621).

**Why it exists.** People want to look at the code behind a page and fix small things without asking the assistant again, while old versions must not be changed in place.

**Who uses it.** Anyone refining a generated page or document.

**Problems it solves**

- Read the source behind a preview
- Make a hand edit that is kept as a version
- Avoid editing binary content such as PDF or image data

**Use cases**

- Switch an HTML artifact to Source to copy a line
- Edit a heading in a Markdown document and save
- Open version 2 and see that Edit is not offered
- On the phone, edit source and tap Save

## 2. User experience

**Where to find it**

- Web and Desktop: Eye ('Preview') and Code ('Source') buttons at the left of the viewer header (ArtifactPreview.tsx:2582-2621); 'Edit source' in the more menu with test id artifact-edit-source (ArtifactPreview.tsx:2315-2322)
- Mobile: tabs 'Preview' and 'Source' (ArtifactFullScreen.tsx:1396-1415); 'Edit source' in the more menu (ArtifactFullScreen.tsx:1221); editor modal with 'Cancel' and 'Save' labelled 'Save as a new version' (ArtifactFullScreen.tsx:1937-2000)
- Chrome: Preview and Source buttons in the panel (artifactPanel.ts:513-520,735-740)
- VS Code: artifact opens in a read-only editor document (artifactActions.ts:89,130-135)
- CLI: prints content; no edit (lib.rs:3917-3965)

**Before you start**

- Renderable kind for the toggle (html, react, svg, mermaid, shared-rendered kinds or Markdown, ArtifactPreview.tsx:2583)
- For editing: a stored artifact on its latest version that is not PDF, DOCX or image (ArtifactPreview.tsx:1041-1042)

**Screens and controls**

- Preview / Source segmented toggle
- 'Edit source' menu item; document editor and code editor components (ArtifactDocumentEditor.tsx, ArtifactCodeEditor.tsx)
- Mobile 'Ask for changes' label (ArtifactFullScreen.tsx:147)
- Mobile 'Undo last change' and 'Redo change' (ArtifactFullScreen.tsx:145-146)
- Web undo and redo buttons with test ids artifact-undo and artifact-redo (ArtifactPreview.tsx:2890)

**Journey**

1. Open an artifact
2. Press Source to read it, Preview to run it
3. Choose 'Edit source' from the menu
4. Type; web stores a draft in browser storage as you type [inferred from writeStoredDraft use, ArtifactPreview.tsx:1186]
5. Save: a new version is written and the old version stays
6. Open an older version: no edit control is offered

**What the person sees and gets**

- New version number in the version chip
- Mobile 'Restored your unsaved edits to this artifact.' when a draft is recovered (ArtifactFullScreen.tsx:1991-2000)
- Confirm dialogs when discarding edits (ArtifactFullScreen.tsx:349-355)

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web toggle and edit gating by canEditSource (ArtifactPreview.tsx:1041-1042)
- Web save goes through upsertArtifact with new content, which makes a new version (ArtifactPreview.tsx:1153-1160; doc: docs/decisions/wire-or-cut.md:325)
- Web restore asks first and warns that unsaved edits are discarded (ArtifactPreview.tsx:1010-1036)
- Mobile edit, save, undo, redo and draft recovery (ArtifactFullScreen.tsx:850-940,1937-2000)
- Mobile edit only on the latest version of a stored artifact that is not a generated file (ArtifactFullScreen.tsx, canEditSource defined just before closeEditor, near line 890)
- Chrome and VS Code are read-only by construction (artifactPanel.ts:759-760; artifactActions.ts:89)

**Incomplete**

- Web has no 'read-only' label; read-only is shown only by the absence of edit controls (grep of the artifacts folder found no such wording)
- Shared copy / viewer read-only on web was not opened [unknown]
- Brief says mobile direct edit is missing; the code has it

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI direct edit: not found (lib.rs:3910-3965 only prints or writes a copy)
- VS Code edit: the content provider is read-only (artifactActions.ts:76-100)
- Chrome edit: not found in artifactPanel.ts

## 4. Required behaviour

**Established requirements**

- For a renderable artifact the user can switch between rendered preview and source (S26.14) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.14)
- The user can edit content directly and save it as a new version (S26.15) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.15)
- An artifact can be viewed read-only, for example an older version or a shared copy (S26.16) (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S26.16)
- Failed edits preserve the previous version and the user's draft (source: doc: docs/product/experience-contract.md:782)

**Acceptance criteria**

1. Web: an HTML artifact has Preview and Source buttons and each switches the view
2. Web: 'Edit source' then save creates version N+1; version N is still in the history
3. Web: viewing an older version offers no edit action
4. Web: PDF, DOCX and image artifacts have no Edit source item
5. Mobile: 'Edit source' then 'Save as a new version' adds a version
6. Mobile: cancelling an edit with changes asks before discarding
7. CLI, VS Code and Chrome offer no way to change the stored artifact

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A shared or published copy must not expose edit controls [inferred from the requirement; web edit requires isStoredArtifact, ArtifactPreview.tsx:618]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show an explicit 'Read-only' label with the reason (older version, not yours)

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Toggle, canEditSource, saveArtifactContent, menu |
| component | ArtifactCodeEditor | `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx` | Source editor |
| component | ArtifactDocumentEditor | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | Document editor |
| component | DocumentFormattingToolbar | `apps/web/features/chat/components/artifacts/DocumentFormattingToolbar.tsx` | Toolbar for document editing |
| store | upsertArtifact | `apps/web/features/chat/stores/artifacts-store.ts` | Content-keyed write that appends a version |
| store | shared artifact engine | `packages/platform/artifacts/src/artifact-store.ts` | Appends the version (lines 96-115) |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile toggle, edit modal, undo and redo |
| store | saveArtifactEdit (mobile) | `apps/mobile/src/features/artifacts/store.ts` | Persists a mobile edit [inferred from selector at ArtifactFullScreen.tsx:567] |
| other | artifactDrafts | `apps/mobile/src/features/artifacts/artifactDrafts.ts` | Mobile draft storage |
| component | SafeArtifactPreview | `apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx` | Mobile preview |
| component | artifactPanel (Chrome) | `apps/extension/src/features/side-panel/artifactPanel.ts` | Preview and Source in side panel |
| service | ArtifactContentProvider | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | Read-only text content provider (line 89) |
| test | ArtifactPreview.edit.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx` | Edit tests |
| test | ArtifactPreview.draftRetention.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx` | Draft tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Toggle changes a local view flag; preview is built from the shown version's content | device | ArtifactPreview.tsx:2582-2621 |
| Edit keeps a draft; save calls upsertArtifact with the new text | device | ArtifactPreview.tsx:1153-1160 |
| The shared engine appends a version and the sync later pushes it to the account | device and our servers | artifact-store.ts:96-115; use-artifact-cloud-sync.ts:21-22 |
| If the server already holds a newer copy, a conflict notice offers 'Keep my edit' or 'Keep theirs' | our servers | ArtifactsPanel.tsx:806-834 |
| Mobile saves into the device store and queues a cloud push when signed in | device and our servers | store.ts:340-352 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Edited content and new version | Browser 'agi-artifacts-store' (web); device 'artifact-store' (mobile) | Yes for Cloud-scoped web artifacts and signed-in mobile (artifacts-store.ts:1054-1068; store.ts:340-352) | Mobile keeps 20 versions (store.ts:45) |
| Unsaved draft | Browser draft storage (ArtifactPreview.tsx:1186) and mobile artifactDrafts | No | Discarded on cancel or after restore confirm (ArtifactPreview.tsx:1022-1026) |

**Models and providers.** No model is used for the direct edit. 'Ask for changes' and 'Request edits' send a prompt to the chat, which uses the active model (ArtifactFullScreen.tsx:328-331; ArtifactPreview.tsx:2095-2105).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Direct edit needs no sign-in on the device; account sync needs a signed-in session. |
| Permissions | Edit allowed only for a stored artifact on its latest version (ArtifactPreview.tsx:1041-1042; ArtifactFullScreen.tsx, canEditSource). |
| Subscription | none found in the code in the editing files opened |
| Limits and metering | Mobile 20 versions per artifact (store.ts:45); web 200 artifacts (artifacts-store.ts:30). No metering found. |
| Feature flags | none found |
| Model compatibility | Not applicable to direct edit. |
| Provider restrictions | none found |
| Local mode | Preview, source and direct edit work in Local mode on web and mobile; Local conversations are not pushed to the account (artifacts-store.ts:1054-1068). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Older version shown | No edit; restore is offered first | ArtifactPreview.tsx:1041,2343-2350 |
| Binary artifacts | No toggle for PDF and DOCX; no edit for PDF, DOCX or image | ArtifactPreview.tsx:2579-2582,1041-1042 |
| Unsaved edit and restore | Confirm dialog says unsaved edits are discarded | ArtifactPreview.tsx:1011-1021 |
| Server has a newer copy | Conflict banner with two choices; the losing text is kept as a version | ArtifactsPanel.tsx:806-834; artifacts-store.ts:277-313 |
| Stale draft on mobile | editIsStale flag when the artifact changed under the editor | ArtifactFullScreen.tsx, editIsStale defined near line 905 |
| Offline | Edits stay local and sync retries later | use-artifact-cloud-sync.ts:21-23 |
| Accessibility | Toggle buttons have labels Preview and Source; mobile tabs use role tab with selected state | ArtifactPreview.tsx:2599-2620; ArtifactFullScreen.tsx:1396-1415 |
| Shared copy | unknown: the shared artifact page was not opened | none; apps/web/app/shared-artifact was not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx`: Direct editing
- `apps/web/features/chat/components/artifacts/ArtifactPreview.editSteps.test.tsx`: Undo and redo of edit steps
- `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx`: Draft kept
- `apps/web/features/chat/components/artifacts/ArtifactPreview.openForEditing.test.tsx`: Opening an artifact in edit mode
- `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.externalSync.test.tsx`: Editor stays in step with external changes
- `apps/mobile/__tests__/SafeArtifactPreviewStates.test.tsx`: Mobile preview states
- `apps/mobile/__tests__/ArtifactsCode.test.tsx`: Mobile artifacts code view [inferred from name]

**Test scenarios**

- **Toggle**
  1. Open an HTML artifact
  2. Press Source
  3. Press Preview
  - Expected: Source text then rendered page
- **Edit and save**
  1. Choose Edit source on a Markdown artifact
  2. Change a word
  3. Save
  - Expected: Version count increases; previous version still opens
- **No edit on old version**
  1. Open version 1 of a 2-version artifact
  2. Open the more menu
  - Expected: No Edit source; Restore is offered
- **Binary**
  1. Open a PDF artifact
  - Expected: No Preview/Source toggle and no edit action
- **Read-only surfaces**
  1. Open an artifact in VS Code
  2. Try to type
  - Expected: The editor refuses edits

**Where to look when it fails**

- Draft storage key prefix ARTIFACT_DRAFT_STORAGE_PREFIX (ArtifactPreview.tsx:1024)
- Conflict notice test id artifact-conflict-notice (ArtifactsPanel.tsx:814)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/026-artifact-container-and-panel.md](../../70-qa/test-plans/web/026-artifact-container-and-panel.md)
- Desktop: [70-qa/test-plans/desktop/026-artifact-container-and-panel.md](../../70-qa/test-plans/desktop/026-artifact-container-and-panel.md)
- Mobile: [70-qa/test-plans/mobile/026-artifact-container-and-panel.md](../../70-qa/test-plans/mobile/026-artifact-container-and-panel.md)
- CLI: [70-qa/test-plans/cli/026-artifact-container-and-panel.md](../../70-qa/test-plans/cli/026-artifact-container-and-panel.md)
- VS Code: [70-qa/test-plans/vscode/026-artifact-container-and-panel.md](../../70-qa/test-plans/vscode/026-artifact-container-and-panel.md)
- Chrome: [70-qa/test-plans/chrome/026-artifact-container-and-panel.md](../../70-qa/test-plans/chrome/026-artifact-container-and-panel.md)

## 10. Gaps and dependencies

- **Brief says mobile direct edit missing; code has it** Affects: Mobile. Evidence: ArtifactFullScreen.tsx:897,1221,1937-2000. Work needed: Correct the brief
- **No visible 'Read-only' state or reason on web** Affects: Web, Desktop. Evidence: No such wording found in the artifacts folder. Work needed: Add a label if required
- **Shared-copy read-only state unverified** Affects: Web. Evidence: Shared viewer not opened. Work needed: Open apps/web/app/shared-artifact and check controls
- **Chrome, CLI, VS Code have no edit by design or omission** Affects: Chrome, CLI, VS Code. Evidence: artifactPanel.ts:759-760; artifactActions.ts:89. Work needed: Decide whether to add

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- surface:vscode
- surface:cli
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- F026-05
- file:packages/platform/artifacts/src/artifact-store.ts

## Unknown

- Read-only state of the shared artifact page and of Library copies
- Whether the Electron Desktop edit flow differs from web
- Exact mobile canEditSource line numbers (read through a range, not by number)
- Whether web edit drafts survive in Local mode after reload
