---
id: "F027-06"
type: "feature"
title: "Markdown source, saving and undo"
aliases: ["Edit source", "Save artifact source", "Save as a new version", "Draft kept on this device", "Autosave indicator", "Undo last change", "Redo change", "S27.03", "S27.27", "S27.28"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S27.03", "S27.27", "S27.28"]
depends_on: ["surface:web", "surface:mobile", "surface:desktop", "mode:local", "mode:cloud", "F027-03", "F027-01", "file:apps/web/features/chat/stores/artifacts-store.ts", "api:GET /api/chat/sync", "api:POST /api/chat/sync", "table:web_artifacts", "table:web_artifact_versions", "store:agi-artifacts-store", "SYS-sync-and-continuity", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-06 Markdown source, saving and undo

People edit a document's Markdown text and save it as a new version. Nothing saves on each keystroke; an unsaved draft is kept on the device and web shows 'Draft kept on this device'. Checklist ticks save themselves after 4 seconds. Undo and Redo step through saved versions.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.03](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2703), [S27.27](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2727), [S27.28](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2728).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Edits the Markdown source of a document, keeps the unsaved draft on the device, saves a new version on request, and steps back and forward through saved versions.

**Why it exists.** Edits must not be lost if the page closes, and every save should keep earlier versions so changes can be undone.

**Who uses it.** Web and mobile users editing generated documents.

**Problems it solves**

- Losing work on reload.
- Overwriting a newer version by accident on mobile.
- Reverting an unwanted edit.

**Use cases**

- Fix a typo on web and Save.
- Close the tab mid edit and get the draft back.
- Tick checklist items and let them save.
- Undo the last saved change.

## 2. User experience

**Where to find it**

- Web: Edit button, More menu item 'Edit source', Source tab; Save and Cancel buttons appear in the header while editing (ArtifactPreview.tsx:2711-2748); Undo and Redo buttons in the header (2862-2890) and in the More menu.
- Mobile: More menu 'Edit source'; header with Cancel and Save (accessibility label 'Save as a new version') (ArtifactFullScreen.tsx:1221,1950-1990); Undo and Redo in More menu as 'Undo last change' and 'Redo change' (1235-1236).
- CLI, VS Code: no editing. Chrome: none found. Desktop: hosted web app (AGENTS.md section 5).

**Before you start**

- Web: panel view, stored artifact, latest version. Mobile: stored artifact, latest version, non-empty content, not a generated file (ArtifactFullScreen.tsx:880-884).

**Screens and controls**

- Web Save button (aria 'Save artifact source', tooltip 'Save as a new version'); status text 'Draft kept on this device' or 'Draft not kept'; Cancel (aria 'Discard artifact source edit', tooltip 'Discard changes').
- Web checklist note 'Checklist changes save as a new version when you pause.' (ArtifactPreview.tsx:315).
- Mobile text box 'Artifact source'; notices 'Restored your unsaved edits to this artifact.' and 'A newer version arrived while you were editing.'

**Journey**

1. Open the document and start editing.
2. Type; the draft is written to the device.
3. Click Save, or Cancel to drop.
4. On mobile, if a newer version arrived, confirm the save over it.
5. Use Undo or Redo to move across versions.

**What the person sees and gets**

- Web draft status text appears only on wide panels (class hidden below 30rem).
- Mobile success haptic after saving (ArtifactFullScreen.tsx:959).
- Web toast 'Restored your unsaved edits to this artifact' on reopening (ArtifactPreview.tsx:1089).
- Undoing keeps the undone text as a version (mobile test name ArtifactFullScreen.undo.test.tsx:108).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web draft is written to localStorage on every change; status 'saved' means kept, 'unsaved' means the write failed (ArtifactPreview.tsx:669-689,406-420).
- Web Save upserts the content as a new version and clears the draft (1123-1150).
- Web restores a kept draft on reopen (1085-1091).
- Web checklist ticks save after 4000 ms idle (396,1182-1185).
- Web Undo and Redo restore earlier versions as new versions and keep a redo trail (1040-1082).
- Mobile draft kept in device storage with base text, restored with a notice, stale warning, and confirm before saving over newer (artifactDrafts.ts; ArtifactFullScreen.tsx:897-975,349-362).
- Mobile Undo and Redo through versions (850-878).

**Incomplete**

- The web status shows whether the draft is kept on the device, not whether the document is saved to the cloud.
- Mobile has no on-screen save-state indicator beyond the restored and stale notices; the brief marks S27.27 missing there.

**Present but disconnected or switched off**

- Web per-keystroke saving to the document is deliberately not done; only the draft is kept.

**Not available**

- Autosave of text edits into a version on any app.
- Editing on CLI, VS Code, Chrome.
- Per-keystroke undo outside the visual editor's own history.

## 4. Required behaviour

**Established requirements**

- The user can switch a document to Markdown source mode, edit the text and save it back as a new version. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.03)
- While editing, the document saves automatically and shows its save state. (source: S27.27 (same brief); the code instead keeps a local draft and saves on request (ArtifactPreview.tsx:669-689))
- Undo and redo work while editing. (source: S27.28 (same brief))
- Saving over a version that changed elsewhere asks first (mobile). (source: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:349-362,963-966)

**Acceptance criteria**

1. Type in the web source editor, reload, reopen: the draft returns with a toast.
2. Click Save: version count rises by one and the draft key is removed.
3. Click Cancel: the store content is unchanged.
4. Tick a checklist box and wait 4 seconds: a new version is saved.
5. On mobile with a newer version present, Save shows an alert before saving.
6. Undo returns the previous version's text as a new latest version; Redo moves forward.
7. Undo is not offered for a single-version artifact.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief's wording 'autosave' differs from the code: the code keeps a draft but does not save a version without a click, except for checklist ticks.
- [inferred] Brief S27.03 'mobile missing' is out of date: mobile has source editing.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show 'Saved' and 'Saving' state tied to the cloud push.
- [proposed] Add a save-state line on mobile.
- [proposed] Show the draft status on narrow panels too.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Draft session, save, discard, undo, redo, checklist autosave (lines 395-425, 639-689, 1040-1185, 2711-2765, 2862-2890, 3290-3340). |
| component | ArtifactCodeEditor | `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx` | Source editor. |
| component | ArtifactDocumentEditor | `apps/web/features/chat/components/artifacts/ArtifactDocumentEditor.tsx` | Visual editor feeding the same draft. |
| store | useArtifactsStore (web) | `apps/web/features/chat/stores/artifacts-store.ts` | upsertArtifact, restoreArtifactVersion, persisted as 'agi-artifacts-store' (lines 733, 976, 591). |
| hook | useArtifactCloudSync | `apps/web/features/chat/hooks/use-artifact-cloud-sync.ts` | Pulls and pushes artifacts: 30 s interval, 2 s after local edit, backoff to 5 min. |
| service | artifact-cloud-sync | `apps/web/features/chat/services/artifact-cloud-sync.ts` | GET and POST /api/chat/sync calls. |
| endpoint | chat sync route | `apps/web/app/api/chat/sync/route.ts` | Server side pull and push of artifacts into web_artifacts and web_artifact_versions. |
| schema | artifact cloud sync migration | `apps/web/db/neon/0039_artifact_cloud_sync.sql` | Creates web_artifacts and web_artifact_versions. |
| service | toggleMarkdownTask | `packages/ui/unified-chat/src/components/markdown/taskList.ts` | Flips one checklist box in the text. |
| component | ArtifactVersionHistory | `apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx` | Version list with Restore. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile editing, drafts, stale confirm, undo and redo. |
| service | artifactDrafts | `apps/mobile/src/features/artifacts/artifactDrafts.ts` | Keep, read, discard drafts in device storage. |
| store | useArtifactStore (mobile) | `apps/mobile/src/features/artifacts/store.ts` | saveArtifactEdit, restoreArtifactVersion, pending cloud pushes (lines 328, 358). |
| component | ArtifactVersionHistorySheet | `apps/mobile/src/features/chat/components/ArtifactVersionHistorySheet.tsx` | Mobile version list. |
| test | web edit test | `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx` | Save and discard. |
| test | web draft retention test | `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx` | Draft and checklist timing. |
| test | web edit steps test | `apps/web/features/chat/components/artifacts/ArtifactPreview.editSteps.test.tsx` | Undo and redo through versions. |
| test | mobile drafts test | `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.drafts.test.tsx` | Mobile drafts. |
| test | mobile undo test | `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.undo.test.tsx` | Mobile undo and redo. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Start edit copies the current text into a draft session. | device | ArtifactPreview.tsx:2161-2163; ArtifactFullScreen.tsx:897-902 |
| Each change writes the draft to device storage (web localStorage key 'agi.artifact-draft:<id>'; mobile device storage key prefix 'artifact-draft:'). | device | ArtifactPreview.tsx:681-686,395; artifactDrafts.ts:6,45-60 |
| Save writes the text into the artifacts store as a new version and removes the draft. | device | ArtifactPreview.tsx:1123-1150; ArtifactFullScreen.tsx:954-964 |
| For signed-in people the store change is pushed to the server and other devices pull it; a version conflict returns the server copy. | device and our servers | use-artifact-cloud-sync.ts:105-109; artifact-cloud-sync.ts:114; artifacts-store.ts:895-910 |
| Undo and Redo restore an earlier version's text as a new version using a local trail. | device | ArtifactPreview.tsx:1060-1082 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Unsaved draft text | Web localStorage 'agi.artifact-draft:<id>'; mobile device storage keyed by account scope and artifact id | No | Deleted on Save, Cancel, or when identical to the saved text (artifactDrafts.ts:52-55). |
| Saved versions | Web localStorage 'agi-artifacts-store' and server tables web_artifacts and web_artifact_versions; mobile store | Yes for signed-in people, except chats with Local-mode turns or temporary chats on web (artifacts-store.ts:1056-1067) | Versions are appended, never replaced; restore adds a new one. |

**Models and providers.** No model or provider takes part in editing or saving. If the person asks the assistant to edit the document, that is a chat turn handled elsewhere (SYS-chat-turn-pipeline).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Editing and drafts need no account. Cloud sync needs a signed-in session (use-artifact-cloud-sync.ts:30-31); mobile drafts for cloud artifacts are tied to the account (artifactDrafts.ts:22-26). |
| Permissions | Edit only the latest version; the push route also requires authentication, CSRF check, rate limit and a sync gate (route.ts:546-554; gate rules not read). |
| Subscription | none found in the code for editing or saving. The push route checks a free daily allowance for new conversations and messages only (route.ts:576-582). |
| Limits and metering | Web keeps at most 200 retained artifacts (artifacts-store.ts:27); push batch up to 500 (line 28); browser storage quota failures degrade persistence (artifacts-store.ts:528-583). |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | Editing, drafts, saving versions and undo work on the device. Web artifacts in conversations that hold Local-mode turns are not pushed to the account (artifacts-store.ts:1063-1067). Mobile drafts for local artifacts are scoped 'local' (artifactDrafts.ts:17-19). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Browser storage blocked or full | Web shows 'Draft not kept'. | ArtifactPreview.tsx:684,2733 |
| Draft equals saved text | Web does not restore it; mobile removes it. | ArtifactPreview.tsx:1086-1087; artifactDrafts.ts:52-55 |
| Newer version arrives while editing (mobile) | Notice shown; Save asks first. | ArtifactFullScreen.tsx:886-887,963-966,2008-2015 |
| Discard with changes (mobile) | Alert 'Discard your edits?'. | ArtifactFullScreen.tsx:349-354 |
| Restoring an older version while a draft is open (web) | Confirmation warns that unsaved edits are discarded. | ArtifactPreview.tsx:1010-1019 |
| Empty text on mobile save | Not saved but editor closes. | ArtifactFullScreen.tsx:957-961 |
| Offline sync | Retry with backoff; online event triggers an immediate retry. | use-artifact-cloud-sync.ts:20,111,116 |
| Switching artifacts | Draft owner tokens reject callbacks from a previous artifact. | ArtifactPreview.tsx:625-638; draftRetention tests |
| Undo with only one version | Not offered. | ArtifactPreview.tsx:1056-1058 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx`: Save as a new content-keyed version, Cancel leaves the store, no edit for non-stored or older version.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx`: Draft ownership, failed-write status, rich editor callback, checklist four-second commit.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.editSteps.test.tsx`: Undo and redo through versions.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Restore behaviour (contents not opened).
- `apps/web/features/chat/services/artifact-cloud-sync.test.ts`: Artifact sync service (contents not opened).
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.drafts.test.tsx`: Restore after app close, stale warning, forget on save or discard, discard prompt.
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.undo.test.tsx`: Undo and redo through versions, redo dropped on new version.
- `apps/mobile/src/features/artifacts/__tests__/artifactDrafts.test.ts`: Draft storage (contents not opened).

**Test scenarios**

- **Draft survives reload (web)**
  1. Start editing source
  2. Type text
  3. Reload the page
  4. Reopen the document
  - Expected: Draft restored with a toast; status 'Draft kept on this device'.
- **Save creates a version**
  1. Edit and click Save
  2. Open version history
  - Expected: One more version; draft key removed from localStorage.
- **Checklist autosave**
  1. Tick a checklist box in the reader
  2. Wait over 4 seconds
  - Expected: New version saved; note 'Checklist changes save as a new version when you pause.' disappears.
- **Stale save (mobile)**
  1. Start editing
  2. Cause a newer version to arrive
  3. Tap Save
  - Expected: Alert says it changed while editing; confirming saves and the newer one stays in history.
- **Undo and redo**
  1. Save two edits
  2. Click Undo
  3. Click Redo
  - Expected: Text goes back then forward; history keeps every version.
- **Storage blocked**
  1. Block site storage
  2. Type in the editor
  - Expected: Status 'Draft not kept'.

**Where to look when it fails**

- localStorage keys 'agi.artifact-draft:' and 'agi-artifacts-store'.
- Console warning '[artifact-cloud-sync] sync failed; retry scheduled'.
- Logger error 'Artifact persistence disabled: browser storage quota exhausted' (artifacts-store.ts:583).
- Mobile warning '[artifactDrafts] Draft could not be kept:'.
- Tables web_artifacts and web_artifact_versions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- Mobile: [70-qa/test-plans/mobile/027-document-and-writing-editor.md](../../70-qa/test-plans/mobile/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No automatic save of text edits and no 'saving' or 'saved' state; status shows local draft only.** Affects: Web and Desktop (hosted web); mobile. Evidence: ArtifactPreview.tsx:2733; brief S27.27 expects saving and saved. Work needed: Decide whether to autosave versions and show cloud sync state.
- **Mobile has no save-state indicator.** Affects: Mobile. Evidence: Only notices at ArtifactFullScreen.tsx:1990-2015. Work needed: Add a state line.
- **Draft status text hidden on narrow web panels.** Affects: Web on narrow widths and phones. Evidence: ArtifactPreview.tsx:2729 (hidden below 30rem). Work needed: Show it at all widths.
- **No editing on CLI, VS Code, Chrome.** Affects: Those apps. Evidence: No edit code in artifact files read. Work needed: Decide scope.
- **Brief status for S27.03 mobile and S27.27 web are out of date or loosely worded.** Affects: Documentation. Evidence: ArtifactFullScreen.tsx:897-975. Work needed: Update the brief.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:desktop
- mode:local
- mode:cloud
- F027-03
- F027-01
- file:apps/web/features/chat/stores/artifacts-store.ts
- api:GET /api/chat/sync
- api:POST /api/chat/sync
- table:web_artifacts
- table:web_artifact_versions
- store:agi-artifacts-store
- SYS-sync-and-continuity
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-authentication-and-identity

## Unknown

- What buildChatSyncGateResponse refuses and for which plans (function not read).
- Whether Desktop behaves the same as web; not run.
- How the server resolves a version conflict beyond returning the server copy (route.ts conflict branch only partly read).
- Contents of ArtifactPreview.restore.test.tsx and artifact-cloud-sync.test.ts.
