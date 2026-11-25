---
id: "F028-01"
type: "feature"
title: "Edit the generated source"
aliases: ["Edit source", "Editable code source", "Artifact source editor", "Edit artifact (desktop Tauri panel)", "S28.01", "S28.05", "S28.06", "S28.07", "saveSourceEdit", "ArtifactCodeEditor"]
area: "28 Code Canvas and application preview"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S28.01", "S28.05", "S28.06", "S28.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "mode:local", "mode:cloud", "file:apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx", "file:apps/web/features/chat/stores/artifacts-store.ts", "store:localStorage agi.artifact-draft", "store:mmkv artifact-draft", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-01 Edit the generated source

Lets a person open the source text of a generated artifact, change it and save the change as a new version. Web and the Tauri desktop panel have an editor, and mobile has a plain text box. Web adds highlighting and bracket help. Error markers and completion are not built. VS Code and Chrome do not edit in place.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.01](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2801), [S28.05](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2805), [S28.06](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2806), [S28.07](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2807).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Opens the text of a stored artifact (HTML, React, code, Markdown) in an editor. A save adds a new version to the artifact's history instead of overwriting the old one, so the person can step back. Unsaved text is kept on the device until saved or discarded.

**Why it exists.** A model's first draft is rarely final. Typing a small fix is faster and cheaper than asking the model again, and it needs no model call. The brief (S28.01) says generated code must open in an editable view where the change is kept.

**Who uses it.** People who generate pages, components or code in chat and want to tweak them by hand: developers, designers and makers.

**Problems it solves**

- Fixing a typo or a value without another model turn
- Losing typed edits after a reload or app close
- Overwriting a good version with a bad edit

**Use cases**

- On web, change a heading in a generated HTML page, press Save, and see the preview update as version N+1.
- On a phone, edit a code artifact in full screen, close the app mid-edit, reopen and get the kept edit back.
- In the Tauri desktop panel, press Edit artifact, change text, press Save edit.

## 2. User experience

**Where to find it**

- Web (also the public Electron Desktop, which shows the hosted web app, doc: AGENTS.md section 5): artifact side panel, More menu item 'Edit source' (ArtifactPreview.tsx:2317), after the Preview/Source toggle (aria-labels 'Preview' at ArtifactPreview.tsx:2600 and 'Source' at :2617).
- Desktop Tauri build (internal): shared artifact panel button 'Edit artifact' (packages/ui/unified-chat/src/components/ArtifactPanel.tsx:779).
- Mobile: full-screen artifact, More actions menu item 'Edit source' (apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1221).
- VS Code: tree 'Code: Open Artifact' opens a read-only document (apps/extension-vscode/src/features/artifacts/artifactActions.ts:104); 'Code: Save Artifact into Workspace' gives a normal editable file.
- Chrome side panel: 'Code' toggle shows source read-only (apps/extension/src/features/side-panel/artifactPanel.ts:865). CLI: prints or writes the source, no editor (apps/cli/src/lib.rs:3917).

**Before you start**

- The artifact is in the local store (web: isStoredArtifact) and the viewed version is the latest (ArtifactPreview.tsx:944, 1041).
- The artifact is text, not PDF, DOCX or image (ArtifactPreview.tsx:1041).
- Web: the panel variant, not the inline card.
- Mobile: not a generated-file artifact, latest version, non-empty content (ArtifactFullScreen.tsx:880).
- VS Code: signed in to AGI Cloud to see the tree (artifactsTree.ts:99).

**Screens and controls**

- Web: code editor (CodeMirror) with line numbers, 'Save' check button (aria-label 'Save artifact source', title 'Save as a new version', ArtifactPreview.tsx:2721), 'Cancel' (aria-label 'Discard artifact source edit'), status text 'Draft kept on this device' or 'Draft not kept' (ArtifactPreview.tsx:2733).
- Desktop Tauri: textarea (aria-label 'Edit artifact content', ArtifactPanel.tsx:859), buttons 'Save edit' and 'Discard edit'.
- Mobile: full-screen modal with 'Cancel', title, 'Save' (accessibility label 'Save as a new version'), and a multiline TextInput (accessibility label 'Artifact source', ArtifactFullScreen.tsx:2016).

**Journey**

1. Open the artifact from the chat so the side panel (web) or full screen (mobile) shows it.
2. Open the Source view or choose 'Edit source' from the More menu.
3. Type changes. The editor loads lazily on web (ArtifactPreview.tsx:377) and shows a loading spinner meanwhile.
4. Each keystroke keeps a draft on the device (web localStorage key agi.artifact-draft:<id>, mobile device storage).
5. Press Save. The text is stored as a new version and the draft is deleted (ArtifactPreview.tsx:1124).
6. Or press Cancel to discard. Mobile asks 'Discard your edits?' first when something changed (ArtifactFullScreen.tsx:349).

**What the person sees and gets**

- Web toast 'Restored your unsaved edits to this artifact' when a kept draft is found (ArtifactPreview.tsx:1090).
- Mobile note 'Restored your unsaved edits to this artifact.' and 'A newer version arrived while you were editing.' (ArtifactFullScreen.tsx:1991-2020); a 'Save over the newer version?' prompt on save (ArtifactFullScreen.tsx:356).
- New version appears in the version stepper.

**Settings**

- None found in the code for the editor itself. The editor language comes from the artifact's language or type (ArtifactPreview.tsx:3334).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: CodeMirror editor with line numbers, undo history, bracket matching, indent on input, syntax colours, tab indent, line wrap, and language grammars loaded on demand by name (apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx:1-30, 112-130, 170-190). So S28.05 is built on web although the brief says missing.
- Web: save writes through upsertArtifact, the same store path that Restore uses, with new content and a new timestamp, so history keeps the earlier text (ArtifactPreview.tsx:1124-1140, artifacts-store.ts:733, :976).
- Web: drafts survive reload in localStorage and are restored on open (ArtifactPreview.tsx:395-425, 1084-1091).
- Mobile: source editing exists (TextInput, Save, Cancel, kept draft, stale-version warning) although the brief says missing (ArtifactFullScreen.tsx:880-975, 2016; apps/mobile/src/features/artifacts/artifactDrafts.ts:1-60).
- Desktop Tauri build: textarea edit is shown because TauriRuntime provides updateArtifact (packages/ui/unified-chat/src/components/ChatInterface.tsx:1081; apps/desktop/src/runtime/TauriRuntime.ts:1550).
- VS Code: read-only open plus save into the workspace (artifactActions.ts:104, 163).

**Incomplete**

- Mobile editor is a plain text box: no syntax colours, indentation help or bracket help in the edit mode (ArtifactFullScreen.tsx:2016-2040).
- Desktop Tauri editor is a plain textarea (ArtifactPanel.tsx:859).
- Web editor language grammar is chosen by the artifact language string; if no grammar matches the text stays plain (ArtifactCodeEditor.tsx:170-190).

**Present but disconnected or switched off**

- Web inline (non-panel) variant has no source editing: canEditSource requires variant 'panel' (ArtifactPreview.tsx:1041).

**Not available**

- Syntax diagnostics (S28.06) and code completion (S28.07): no lint or autocomplete import in ArtifactCodeEditor.tsx on web, none in the mobile or shared editors.
- Chrome side panel: no editing, source is a read-only pre block (artifactPanel.ts:745-749).
- CLI: no editor (apps/cli/src/lib.rs:3917).
- VS Code in-extension editing of an artifact: not built, the document is read-only (artifactActions.ts:104-135).

## 4. Required behaviour

**Established requirements**

- Generated code opens in an editable source view where the user can change it and keep the result (S28.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.01)
- The code editor is language-aware: syntax highlighting, indentation, brackets (S28.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.05)
- The code editor shows syntax errors and diagnostics inline (S28.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.06)
- The code editor offers completion where the product offers it (S28.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.07)
- Artifacts, files and published apps have separate object models; the artifact viewer is a first-class surface. (source: doc: docs/product/experience-contract.md)
- A user cannot lose work silently: an agent never destroys user data; code gets a checkpoint, and an action a user cannot undo asks first naming the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. On web, open an HTML artifact, choose Edit source, change one character, press Save: version count goes up by one and the earlier version is still selectable.
2. Edit, then reload the page without saving: the edit comes back with the toast 'Restored your unsaved edits to this artifact'.
3. Open an older version: no edit control is offered; Restore creates a new latest version first.
4. Open a PDF, DOCX or image artifact: no edit control is offered.
5. On mobile, edit, close the app, reopen: the edit returns with the 'Restored' note; Cancel with changes asks 'Discard your edits?'.
6. In the web editor, typing an opening bracket in a JavaScript artifact shows bracket matching and keyword colours.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every surface that can show an artifact should be able to edit it or say why not [inferred from S28.01 requiring edit on all apps].
- Saving an empty text on mobile is refused by design (handleSaveEdit requires non-empty trimmed text, ArtifactFullScreen.tsx:957) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a lint and completion extension to the web editor and show the same editor on desktop Tauri and mobile.
- [proposed] Update the brief rows for S28.01 mobile and S28.05 web, which the code contradicts.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactPreview (panel variant) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Owns Source/Preview tabs, canEditSource, draft sessions, saveSourceEdit, endSourceEdit, More menu items |
| component | ArtifactCodeEditor | `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx` | CodeMirror editor: highlighting, brackets, history, language loading, aria-label |
| other | separateGluedStatements | `apps/web/features/chat/components/artifacts/statement-lines.ts` | Repairs statements the editor text glued on one line before reporting a change |
| store | artifacts-store (upsertArtifact, restoreArtifactVersion) | `apps/web/features/chat/stores/artifacts-store.ts` | Content-keyed version history that a save appends to |
| store | localStorage draft key agi.artifact-draft:<artifact id> | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Keeps unsaved text across reloads (read/write/remove helpers at lines 395-425) |
| component | ArtifactFullScreen (mobile) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Mobile edit modal, canEditSource, handleStartEdit, handleSaveEdit, stale-version prompt |
| store | artifactDrafts (mobile) | `apps/mobile/src/features/artifacts/artifactDrafts.ts` | Keeps unsaved edits in device storage under key artifact-draft:v1:<scope>:<id>, scoped to local or cloud owner |
| component | ArtifactPanel (shared) | `packages/ui/unified-chat/src/components/ArtifactPanel.tsx` | Textarea edit mode with Save edit and Discard edit; used by the Tauri desktop |
| service | TauriRuntime.updateArtifact | `apps/desktop/src/runtime/TauriRuntime.ts` | Desktop Tauri persistence of an edited artifact |
| component | ChatInterface handleSaveArtifactEdit | `packages/ui/unified-chat/src/components/ChatInterface.tsx` | Passes onSaveEdit to the panel only when the runtime can update artifacts |
| command | openArtifactReadOnly / saveArtifactToWorkspace | `apps/extension-vscode/src/features/artifacts/artifactActions.ts` | VS Code read-only open and save into workspace |
| component | ArtifactsTreeProvider | `apps/extension-vscode/src/features/artifacts/artifactsTree.ts` | VS Code sidebar list of cloud artifacts |
| component | artifactPanel (Chrome) | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome side panel read-only source view |
| command | agi artifacts get | `apps/cli/src/lib.rs` | CLI prints an artifact or writes it to a file (handle_artifacts_command, line 3850) |
| test | ArtifactPreview.edit.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx` | Save as new version, cancel, no edit for unstored or older version |
| test | ArtifactPreview.draftRetention.test | `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx` | Draft ownership and recovery |
| test | ArtifactFullScreen.drafts.test | `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.drafts.test.tsx` | Mobile kept edit, stale warning, discard |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Edit source; the panel starts a draft session and shows the editor (web loads the editor chunk on demand). | device | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:377, 1096-1110 |
| Each change updates the draft and writes it to browser storage (web) or device storage (mobile). | device | ArtifactPreview.tsx:395-425; apps/mobile/src/features/artifacts/artifactDrafts.ts:1-60 |
| Save calls upsertArtifact with the new content, so the shared store appends a version and deletes the draft. | device | ArtifactPreview.tsx:1124-1140; artifacts-store.ts:733 |
| Whether the new version reaches our servers is decided by the artifact sync layer, not by the editor. Not read in detail here. | device and our servers | unknown: sync path not opened; see register row WEB-ARTIFACT-SYNC-BASELINE-OWNERSHIP-01 in audit/registers/known-flaws.md:45 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Unsaved source text | Web: browser localStorage key agi.artifact-draft:<id>. Mobile: MMKV key artifact-draft:v1:<scope>:<id>. Desktop Tauri textarea: component state only. | No. Device only. | Deleted on Save or Cancel; kept after close until then. Web storage can fail; the panel then shows 'Draft not kept' (ArtifactPreview.tsx:2733). |
| Saved artifact versions | Shared artifacts store (browser persisted store on web); cloud copy depends on sync | unknown for the edit itself; depends on sync layer | Version history keeps earlier text; restore appends rather than deletes. |

**Models and providers.** No model or provider takes part in typing and saving. Editing never calls a model [inferred from the save path calling only the store].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile editing of a stored artifact needs no extra check in the editor code. VS Code listing needs AGI Cloud sign-in (artifactsTree.ts:99-110). Mobile drafts are scoped to the local or cloud owner (artifactDrafts.ts:17-22). |
| Permissions | none found in the code for the editor beyond the latest-version and text-type rules. |
| Subscription | none found in the code: no plan, entitlement or usage check near canEditSource (ArtifactPreview.tsx:1041) or ArtifactFullScreen.tsx:880. |
| Limits and metering | none found in the code for editing. No usage is counted for a manual save. |
| Feature flags | none found in the code for editing. |
| Model compatibility | Not applicable: no model is used. |
| Provider restrictions | Not applicable. |
| Local mode | Editing works with no network and no paid plan because it only touches the local store and device storage. Mobile local-scope artifacts keep drafts under scope 'local' (artifactDrafts.ts:17-19). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Editor loading (web) | A spinner labelled 'Loading the preview' shows until the lazy editor loads. | ArtifactPreview.tsx:365-375 |
| Older version viewed | No edit control; the person must restore first. | ArtifactPreview.tsx:944, 1041; ArtifactPreview.edit.test.tsx:113 |
| Browser storage blocked | Reads and writes are wrapped in try/catch; status shows 'Draft not kept'. | ArtifactPreview.tsx:395-425, 2733 |
| Newer version arrives mid-edit (mobile) | Shows 'A newer version arrived while you were editing.' and asks before saving over it. | ArtifactFullScreen.tsx:356, 2003-2012 |
| Empty or unchanged save | Web stores only when text differs from the stored content; mobile ignores empty text. | ArtifactPreview.tsx:1137; ArtifactFullScreen.tsx:957 |
| Accessibility | Editor content has aria-label 'Artifact source' on web and mobile; spellcheck off. Screen-reader behaviour of CodeMirror itself was not verified. | ArtifactCodeEditor.tsx:120; ArtifactFullScreen.tsx:2023 |
| Save failure on desktop Tauri | The shared panel shows a dismissible save error ('Dismiss save error'). | packages/ui/unified-chat/src/components/ArtifactPanel.tsx:496-510, 1097 |
| Offline | not handled in the code for the editor; local save needs no network. | ArtifactPreview.tsx:1124-1140 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx`: Save creates a new content-keyed version; Cancel leaves the store alone; no edit for unstored or older version
- `apps/web/features/chat/components/artifacts/ArtifactPreview.draftRetention.test.tsx`: Draft owner separation, recovery, failed-write status
- `apps/web/features/chat/components/artifacts/ArtifactCodeEditor.externalSync.test.tsx`: External value replacement without echo; real edits reported once
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.drafts.test.tsx`: Kept edit restored, stale warning, forget on save or discard, discard prompt
- `apps/mobile/src/features/chat/components/__tests__/ArtifactFullScreen.initialEdit.test.tsx`: Opening straight into edit mode
- `apps/mobile/src/features/artifacts/__tests__/artifactDrafts.test.ts`: Draft storage by scope

**Test scenarios**

- **Save becomes a new version (web)**
  1. Open an HTML artifact in the side panel
  2. More menu, Edit source
  3. Change text, press Save
  - Expected: Version stepper shows one more version; earlier version still viewable; draft key removed from localStorage.
- **Reload keeps the draft (web)**
  1. Start an edit and type
  2. Reload the page
  3. Open the same artifact
  - Expected: Editor opens with the typed text and toast 'Restored your unsaved edits to this artifact'.
- **Older version cannot be edited**
  1. Step back one version
  2. Open More menu
  - Expected: No 'Edit source'; 'Restore version N' is offered.
- **Mobile kept edit**
  1. Edit a code artifact
  2. Kill the app
  3. Reopen the artifact
  - Expected: Editor opens with the text and the 'Restored your unsaved edits' note.
- **Highlighting and brackets (web)**
  1. Edit a JavaScript artifact
  2. Type '(' and a keyword
  - Expected: Keyword colour and bracket matching appear; no error markers appear (diagnostics absent).

**Where to look when it fails**

- Browser console on web for storage errors; toast 'Draft not kept'.
- localStorage keys starting agi.artifact-draft: in the browser.
- Mobile: MMKV keys starting artifact-draft:v1:.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)
- Desktop: [70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md)
- Mobile: [70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/mobile/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **Syntax diagnostics and completion are absent in every editor** Affects: Web, Desktop, Mobile. Evidence: apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx imports no lint or autocomplete; brief S28.06 and S28.07. Work needed: Add lint and completion extensions per language and an equivalent on mobile; decide scope for the Tauri textarea.
- **Brief says mobile editing (S28.01) and web language-aware editing (S28.05) are missing; the code has both** Affects: Documentation, planning. Evidence: ArtifactFullScreen.tsx:880-1221, 2016; ArtifactCodeEditor.tsx:1-30. Work needed: Correct the brief and the audit ledger rows.
- **Mobile and Tauri desktop editors are plain text with no highlighting or indentation** Affects: Mobile, Desktop Tauri. Evidence: ArtifactFullScreen.tsx:2016; ArtifactPanel.tsx:859. Work needed: Reuse a language-aware editor or build a mobile one.
- **Chrome and VS Code cannot edit an artifact in place** Affects: Chrome, VS Code. Evidence: artifactPanel.ts:745-749; artifactActions.ts:104-135. Work needed: Decide whether to add in-place editing or accept hand-off to web or workspace.
- **Whether an edited version syncs to the cloud copy is not shown** Affects: Web, Mobile. Evidence: audit/registers/known-flaws.md:45, 102. Work needed: Trace the sync path and document it.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- mode:local
- mode:cloud
- file:apps/web/features/chat/components/artifacts/ArtifactCodeEditor.tsx
- file:apps/web/features/chat/stores/artifacts-store.ts
- store:localStorage agi.artifact-draft
- store:mmkv artifact-draft
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-shared-ui-and-design

## Unknown

- Whether an edited version is uploaded to the cloud store and when (sync path not opened).
- Whether CodeMirror's accessibility behaviour passes a screen-reader check.
- Whether the public Electron Desktop adds anything beyond the hosted web editor.
- Chrome editing status: no editor found, so treated as not built.
