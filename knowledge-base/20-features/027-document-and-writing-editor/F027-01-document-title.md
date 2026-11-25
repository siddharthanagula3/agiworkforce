---
id: "F027-01"
type: "feature"
title: "Document title"
aliases: ["Artifact name", "Artifact title", "Rename", "Untitled artifact", "Document name"]
area: "27 Document and writing editor"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S27.01"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "file:apps/web/features/chat/stores/artifacts-store.ts", "file:packages/ui/unified-chat/src/lib/answer-document.ts", "api:POST /api/chat/sync", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F027-01 Document title

Every document shows a name on its chat card and at the top of its viewer. A document with no name gets a fallback: 'Untitled' on web, a kind-based name on mobile, 'Untitled artifact' in the CLI list. On web only, the person can click the name to rename it.

Area: [27. Document and writing editor](README.md). Requirement items: [S27.01](../../10-requirements/capabilities/027-document-and-writing-editor.md#s2701).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows the document's name on its card in the chat and in the viewer header, supplies a fallback when there is no name, and on web lets the person rename a stored document. Names are trimmed, runs of whitespace are collapsed to one space, and the result is cut to 200 characters (packages/ui/unified-chat/src/lib/answer-document.ts:2,7).

**Why it exists.** The person must know which document they are looking at, especially when a chat holds several. Rename lets them label a document without making a new version.

**Who uses it.** Anyone who receives or edits a generated document in AGI Workforce on web, mobile, the CLI artifact list and the VS Code artifact tree.

**Problems it solves**

- Several documents in one chat look the same without a name.
- A document with no title would show an empty header.
- A generated name can be wrong or too long; rename fixes it on web.

**Use cases**

- Read the title on the card in a chat to pick the right document.
- Open the document on web and rename it from the header.
- List cloud artifacts in the CLI and see 'Untitled artifact' for unnamed ones.
- See a kind-based name such as a document type on a mobile card when the stored title is generic.

## 2. User experience

**Where to find it**

- Web: title on the artifact card (ArtifactCard.tsx:105,134) and at the top of the artifact side panel (ArtifactPreview.tsx:2631). Rename is also offered from the More menu per ArtifactPreview.rename.test.tsx:55 (test name only; menu code not opened).
- Mobile: card title (InlineArtifactCard.tsx:223,287) and full-screen header text in the form '<title> · <type label>' (ArtifactFullScreen.tsx:1275).
- CLI: the artifact list prints display_title (apps/cli/src/lib.rs:3933,3941,4012).
- VS Code: the artifacts tree label (artifactsTree.ts:37).
- Chrome: the side-panel artifact card title falls back to a localized 'untitled' string (artifactPanel.ts:345). Desktop: no artifact code found under apps/desktop; the public Desktop shows the hosted web app (AGENTS.md section 5).

**Before you start**

- A document exists in the chat. Web rename also needs the artifact to be stored in the artifacts store (canRename = isStoredArtifact, ArtifactPreview.tsx:2631).

**Screens and controls**

- Web: a button whose label reads '<title>. Rename' (ArtifactTitleField.tsx:84). Clicking it swaps in a text box labelled 'Artifact name' limited to 200 characters (ArtifactTitleField.tsx:60-62).
- Mobile: title is display only; no rename control found in ArtifactFullScreen.tsx.

**Journey**

1. Web: open the document from its card.
2. Click the title in the panel header.
3. Type a new name.
4. Press Enter, or click away, to save; press Escape to cancel (ArtifactTitleField.tsx:36-57, 64).
5. A toast 'That name could not be saved' appears if the store refuses (ArtifactPreview.tsx:2634-2636).

**What the person sees and gets**

- The title updates at once on the card and header.
- Rename does not add a version (test: ArtifactPreview.rename.test.tsx:39, by name).
- An empty or unchanged name is ignored without an error (ArtifactTitleField.tsx:38-39; artifacts-store.ts:956-959).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web card and viewer show artifactTitle(), which trims and falls back to 'Untitled' (ArtifactLabels.tsx:16,50).
- Web rename: normalizes, rejects empty, updates title on the artifact and its current version (artifacts-store.ts:955-974).
- Web rename field handles Enter, Escape, blur and IME composition (ArtifactTitleField.tsx:36-57).
- Mobile stored title falls back to a kind title (artifactTitle.ts:69-72; store.ts:787) and study sets use their own title (ArtifactFullScreen.tsx:1266-1274).
- CLI display_title trims and falls back to 'Untitled artifact' (apps/cli/src/cloud/artifacts.rs:72-77).
- VS Code artifactTitle falls back to 'Untitled <type>' (artifactPresentation.ts:78-80).

**Incomplete**

- Chrome: the side panel shows a title but whether it is the full viewer is not established; brief says unverified (doc: knowledge-base/data/area-briefs/027-document-and-writing-editor.md S27.01).

**Present but disconnected or switched off**

- Web local rename is kept on the device and wins over the cloud copy only while newer (artifacts-store.ts:143-147, _renamedHereIds). Whether rename reaches the server as a title change depends on the push path; push item building was not read.

**Not available**

- Mobile: no rename control found.
- CLI and VS Code: no rename command found in the files read.
- Desktop: no artifact title code in apps/desktop; relies on the hosted web app.

## 4. Required behaviour

**Established requirements**

- A document shows its title in its card and viewer, falling back to a default when it has none. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S27.01)
- Titles are trimmed, whitespace runs are collapsed and the title is cut to a maximum length (200). (source: packages/ui/unified-chat/src/lib/answer-document.ts:2,7)
- Rename is refused for an empty title. (source: apps/web/features/chat/stores/artifacts-store.ts:956-957)

**Acceptance criteria**

1. A web document with no title shows 'Untitled' on its card and in the panel.
2. Typing ' My plan ' and pressing Enter saves 'My plan'.
3. A 300-character name is saved as its first 200 characters.
4. Clearing the name and pressing Enter keeps the old name.
5. Escape leaves the old name.
6. A mobile card for an unnamed document shows a document-kind title, not a blank.
7. The CLI artifact list shows 'Untitled artifact' for an entry with a blank title.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Mobile and Chrome should offer rename like web, because the brief lists the item for every app; the brief itself says nothing about rename on those apps.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a rename control to mobile full screen using normalizeArtifactTitle from the shared package.
- [proposed] Use one fallback word across apps instead of 'Untitled', a kind title and 'Untitled artifact'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactTitleField | `apps/web/features/chat/components/artifacts/ArtifactTitleField.tsx` | Title button and rename text box on web. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Hosts the title field and calls renameArtifact (line 2631). |
| component | ArtifactCard | `apps/web/features/chat/components/artifacts/ArtifactCard.tsx` | Card in the chat that shows the title. |
| component | InlineArtifactCards | `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx` | Renders up to 3 cards per message, '+N more' for the rest. |
| other | artifactTitle / UNTITLED_ARTIFACT_TITLE | `apps/web/features/chat/components/artifacts/ArtifactLabels.tsx` | Web fallback 'Untitled' (lines 16, 50). |
| store | renameArtifact | `apps/web/features/chat/stores/artifacts-store.ts` | Validates and applies a rename (line 955). |
| service | normalizeArtifactTitle | `packages/ui/unified-chat/src/lib/answer-document.ts` | Shared trim, collapse and 200-character cut. |
| component | InlineArtifactCard (mobile) | `apps/mobile/src/features/chat/components/InlineArtifactCard.tsx` | Mobile card title (line 223). |
| component | ArtifactFullScreen (mobile) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Header title (line 1266). |
| service | artifactKindTitle / storedArtifactTitle | `apps/mobile/src/features/artifacts/artifactTitle.ts` | Kind-based fallback title on mobile. |
| store | useArtifactStore | `apps/mobile/src/features/artifacts/store.ts` | Applies the fallback when storing (line 787). |
| service | ArtifactIndexEntry::display_title | `apps/cli/src/cloud/artifacts.rs` | CLI fallback 'Untitled artifact'. |
| command | artifacts list output | `apps/cli/src/lib.rs` | Prints display_title (lines 3933, 3941, 4012). |
| service | artifactTitle (VS Code) | `apps/extension-vscode/src/features/artifacts/artifactPresentation.ts` | Tree label fallback. |
| component | side panel artifact title | `apps/extension/src/features/side-panel/artifactPanel.ts` | Chrome title fallback (line 345). |
| test | rename tests | `apps/web/features/chat/components/artifacts/ArtifactPreview.rename.test.tsx` | Covers rename on web. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web person clicks the title; the text box opens with the current name selected. | device | ArtifactTitleField.tsx:31-34 |
| On Enter or blur the name is normalized and passed to renameArtifact. | device | ArtifactTitleField.tsx:36-42; artifacts-store.ts:955 |
| The store updates the artifact and its current version, marks it renamed here, and saves to browser storage under 'agi-artifacts-store'. | device | artifacts-store.ts:960-974, 591 |
| For signed-in people the sync hook later pushes changed artifacts to the server (about 2 seconds after a local change, otherwise every 30 seconds). | device and our servers | use-artifact-cloud-sync.ts:18-19, 105-109; artifact-cloud-sync.ts:114 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Artifact title | Browser storage key 'agi-artifacts-store' on web (artifacts-store.ts:591); mobile store with device storage (store.ts); server table web_artifacts for synced artifacts (app/api/chat/sync/route.ts:165) | Web and mobile push through the chat sync API for signed-in people; conversations with Local-mode turns or temporary chats are not pushed (artifacts-store.ts:1056-1067). | Kept until the artifact is removed; deletion rules not read. |

**Models and providers.** No model is involved in showing or renaming a title. The initial title comes from the model's output or from the first heading (documentTitleFromAnswer, answer-document.ts:14-27); which model made it is not part of this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Showing and renaming on web work without an account for local artifacts; cloud sync needs a signed-in session (use-artifact-cloud-sync.ts:30-31). |
| Permissions | None found in the code for rename beyond the artifact being stored on the device. |
| Subscription | none found in the code for title or rename. |
| Limits and metering | Title length 200 characters (answer-document.ts:2). The sync push route counts only new conversations and messages against the free daily allowance (route.ts:576-582); artifact edits are not counted there. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable; model-independent. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on the device. Artifacts in conversations that hold Local-mode turns stay off the account (artifacts-store.ts:1063-1067). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty title | Web shows 'Untitled'; mobile shows a kind title; CLI shows 'Untitled artifact'; VS Code shows 'Untitled <type>'. | ArtifactLabels.tsx:50; artifactTitle.ts:69; artifacts.rs:72; artifactPresentation.ts:79 |
| Rename to blank or same name | Ignored; no toast. | ArtifactTitleField.tsx:38-39 |
| Rename refused by store | Toast 'That name could not be saved'. | ArtifactPreview.tsx:2634 |
| Cancel | Escape closes the field and keeps the old name. | ArtifactTitleField.tsx:47-51 |
| Artifact not stored (not in store) | Title shows as plain text with no rename. | ArtifactTitleField.tsx:75-81 |
| Long title | Truncated with ellipsis on screen; input capped at 200. | ArtifactTitleField.tsx:61,77 |
| Offline or sync error | Rename is already saved on the device; sync retries with backoff up to 5 minutes. | use-artifact-cloud-sync.ts:20,82-90 |
| Screen reader | Title button has a label '<title>. Rename'; input labelled 'Artifact name'. | ArtifactTitleField.tsx:64,84 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactPreview.rename.test.tsx`: Rename without a new version, rename from the More menu, Escape, blank name, local rename winning over cloud copy (by test names).
- `apps/web/features/chat/components/artifacts/ArtifactPreview.card.test.tsx`: Card behaviour (file name only; contents not opened).
- `apps/web/features/chat/components/artifacts/InlineArtifactCards.test.tsx`: Inline cards (file name only; contents not opened).
- `apps/mobile/src/features/artifacts/__tests__/artifactKindFallbackTitle.test.ts`: Mobile kind-based fallback title (by name).
- `apps/mobile/src/features/artifacts/__tests__/ArtifactStudyTitle.test.tsx`: Study-set titles (by name).
- `apps/cli/src/cloud/artifacts.rs`: Inline test asserts display_title is 'Untitled artifact' (line 789).

**Test scenarios**

- **Rename on web**
  1. Open a document in the panel
  2. Click the title
  3. Enter ' Q3 plan '
  4. Press Enter
  - Expected: Title reads 'Q3 plan' on the header and the card; version count unchanged.
- **Blank rename**
  1. Click the title
  2. Clear it
  3. Press Enter
  - Expected: Old title stays; no error.
- **Fallback on mobile**
  1. Open a chat with a document that has no stored title
  2. Look at the card and full-screen header
  - Expected: A kind-based title, not an empty line.
- **CLI fallback**
  1. Have a cloud artifact with no title
  2. Run the artifacts list command
  - Expected: Row shows 'Untitled artifact'.
- **Rename survives sync**
  1. Rename on web while signed in
  2. Wait about 30 seconds
  3. Reload
  - Expected: New title persists and is not overwritten by the older cloud copy.

**Where to look when it fails**

- Browser console warning '[artifact-cloud-sync] sync failed; retry scheduled' (use-artifact-cloud-sync.ts:84).
- Table web_artifacts column title for the stored value.
- Toast 'That name could not be saved'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/027-document-and-writing-editor.md](../../70-qa/test-plans/web/027-document-and-writing-editor.md)
- Desktop: [70-qa/test-plans/desktop/027-document-and-writing-editor.md](../../70-qa/test-plans/desktop/027-document-and-writing-editor.md)
- Mobile: [70-qa/test-plans/mobile/027-document-and-writing-editor.md](../../70-qa/test-plans/mobile/027-document-and-writing-editor.md)
- CLI: [70-qa/test-plans/cli/027-document-and-writing-editor.md](../../70-qa/test-plans/cli/027-document-and-writing-editor.md)
- VS Code: [70-qa/test-plans/vscode/027-document-and-writing-editor.md](../../70-qa/test-plans/vscode/027-document-and-writing-editor.md)
- Chrome: [70-qa/test-plans/chrome/027-document-and-writing-editor.md](../../70-qa/test-plans/chrome/027-document-and-writing-editor.md)

## 10. Gaps and dependencies

- **No rename on mobile, CLI, VS Code or Chrome.** Affects: Mobile, CLI, VS Code and Chrome users. Evidence: No rename code found in the files read for these apps.. Work needed: Decide whether rename is required on each app; if so add a control that calls the shared normalizer.
- **Fallback wording differs by app.** Affects: All apps. Evidence: ArtifactLabels.tsx:16; artifacts.rs:76; artifactPresentation.ts:79. Work needed: Choose one fallback rule and share it.
- **Desktop and Chrome behaviour not verified.** Affects: Desktop, Chrome. Evidence: No desktop artifact code in apps/desktop; brief marks Chrome unverified.. Work needed: Run the app and record what the title shows.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- file:apps/web/features/chat/stores/artifacts-store.ts
- file:packages/ui/unified-chat/src/lib/answer-document.ts
- api:POST /api/chat/sync
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- SYS-shared-ui-and-design

## Unknown

- Whether Chrome side panel shows a title inside a full viewer.
- Whether rename pushes a title-only change to the server (push item builder not read).
- How the Desktop app shows artifact titles (code not found in apps/desktop).
