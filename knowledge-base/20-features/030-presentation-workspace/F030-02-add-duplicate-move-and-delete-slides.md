---
id: "F030-02"
type: "feature"
title: "Add, duplicate, move and delete slides"
aliases: ["Slide menu", "Slide actions", "New slide after this", "Duplicate slide", "Move earlier / Move later", "Delete slide", "S30.03-S30.06"]
area: "30 Presentation workspace"
available_on: ["web", "mobile"]
implementation: {web: "built", desktop: "missing", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S30.03", "S30.04", "S30.05", "S30.06"]
depends_on: ["surface:web", "surface:mobile", "file:packages/ui/unified-chat/src/lib/deck-model.ts", "store:artifacts-store", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "F030-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F030-02 Add, duplicate, move and delete slides

Lets a person change the slide list of a deck: add a starter slide after the current one, duplicate it, move it earlier or later, or delete it. Web uses a 'Slide' menu in the toolbar; mobile uses a 'Slide N actions' sheet. Every change saves a new version of the deck.

Area: [30. Presentation workspace](README.md). Requirement items: [S30.03](../../10-requirements/capabilities/030-presentation-workspace.md#s3003), [S30.04](../../10-requirements/capabilities/030-presentation-workspace.md#s3004), [S30.05](../../10-requirements/capabilities/030-presentation-workspace.md#s3005), [S30.06](../../10-requirements/capabilities/030-presentation-workspace.md#s3006).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Adds, copies, reorders and removes slides in the stored Markdown deck, then selects the affected slide.

**Why it exists.** Briefs S30.03 to S30.06 require add, duplicate, delete and reorder so a deck can be shaped by hand without asking the assistant.

**Who uses it.** People editing a presentation on web or mobile.

**Problems it solves**

- Fixing slide order without regenerating the deck
- Reusing a slide as a starting point
- Removing a slide that is not wanted

**Use cases**

- Duplicate the pricing slide then edit the copy
- Move the summary slide earlier
- Delete an extra slide and later restore the previous version
- On a phone, add a new slide after slide 2

## 2. User experience

**Where to find it**

- Web: toolbar button 'Slide' (icon LayoutTemplate) opens a menu (PresentationWorkspace.tsx:497-503); items 'New slide after this', 'Duplicate slide', 'Move earlier', 'Move later', 'Delete slide' (lines 365-415)
- Mobile: button 'Slide N actions' opens an action sheet (iOS) or app sheet (Android) with 'Edit slide', 'New slide after this', 'Duplicate slide', 'Move earlier', 'Move later', 'Delete slide' (PresentationDeckView.tsx:65-108,211-256)
- Other apps: none found

**Before you start**

- Web: the version shown is the latest, the artifact is stored, and no source draft is open (ArtifactPreview.tsx:1955 editable prop; canEditSource at ~1000)
- Mobile: the viewer was given an onSave (PresentationDeckView.tsx:112; test 'offers no slide actions when the deck cannot be saved')

**Screens and controls**

- Web: menu items with icons; Move earlier disabled on slide 1; Move later disabled on last; Delete disabled with one slide (PresentationWorkspace.tsx:385-410)
- Mobile: only valid moves are listed; Delete is listed only with more than one slide; Delete asks 'Delete slide N?' with Cancel/Delete (PresentationDeckView.tsx:211-256)

**Journey**

1. Open a deck you may edit
2. Select the slide
3. Open 'Slide' menu (web) or the actions button (mobile)
4. Choose an action
5. The deck saves and the view moves to the new or moved slide

**What the person sees and gets**

- Web delete shows toast 'Slide deleted. Restore the previous version to bring it back.' (PresentationWorkspace.tsx:412)
- Mobile delete shows an alert 'You can bring it back by restoring the previous version.' (PresentationDeckView.tsx:240-243)
- A new version appears in artifact version history (store appends versions)

**Settings**

- None found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web add inserts '## New slide' with two bullets after the current slide and selects it (PresentationWorkspace.tsx:367-374; deck-model.ts:4)
- Web duplicate inserts a copy right after (376-384)
- Web move earlier/later swap with neighbour and follow the slide (385-404)
- Web delete removes the slide, selects the previous one, refuses to drop the last slide (deck-model.ts:54-57)
- Mobile has the same five actions plus a confirmation on delete and a platform-specific sheet
- Saves go through onSave; nothing is written when the serialized deck is unchanged (PresentationWorkspace.tsx:166-171; PresentationDeckView.tsx:199-209)

**Incomplete**

- Web delete has no confirmation; it only toasts afterwards, and the toast does not link to restore (PresentationWorkspace.tsx:405-413). AGENTS.md section 9 says unrecoverable user actions ask first; here it is recoverable by version restore [inferred]
- No drag-and-drop reorder in the rail
- No multi-select

**Present but disconnected or switched off**

- Restore is not in the Slide menu. It exists elsewhere: 'Restore version N' in the artifact 'more' menu when an older version is shown (ArtifactPreview.tsx:2340-2349) with a confirm dialog (1008-1030)

**Not available**

- Desktop, Chrome, VS Code, CLI: no slide list editing found

## 4. Required behaviour

**Established requirements**

- The user can add a slide to a deck. (source: brief S30.03)
- The user can duplicate a slide. (source: brief S30.04)
- The user can delete a slide. (source: brief S30.05)
- The user can reorder slides. (source: brief S30.06)
- An action a user cannot undo asks first and names the consequence; an agent never destroys data on its own. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. New slide on slide 2 of 3 produces 4 slides with the starter slide at position 3, selected
2. Duplicate makes position N+1 identical to N
3. Move earlier on slide 1 is disabled; Move later on the last is disabled
4. Delete is disabled when one slide is left; with several it removes only the current one
5. Each change creates a new version that can be restored
6. Mobile Delete asks before removing
7. Read-only (older) version shows no Slide menu

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Delete should ask first on web as it does on mobile [inferred from AGENTS.md section 9 and mobile behaviour]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put an 'Undo' action in the delete toast
- [proposed] Drag reorder in the web rail

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PresentationWorkspace slideItems | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.tsx` | Defines the five menu actions |
| component | DeckMenu | `apps/web/features/chat/components/artifacts/presentation/DeckMenu.tsx` | Accessible menu with keyboard support and disabled items |
| service | insertSlide / removeSlide / moveSlide | `packages/ui/unified-chat/src/lib/deck-model.ts` | Pure list operations |
| config | NEW_SLIDE_MARKDOWN | `packages/ui/unified-chat/src/lib/deck-model.ts` | Starter slide text |
| service | serializeDeck | `packages/ui/unified-chat/src/lib/deck-model.ts` | Writes slides joined by blank-line --- blank-line |
| hook | saveArtifactContent | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Writes new content to the artifact store as a new version (line 1153) |
| store | artifacts-store | `apps/web/features/chat/stores/artifacts-store.ts` | Holds artifacts and version history; persisted with zustand persist |
| component | requestRestore | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Confirm-and-restore of an older version (line 1008) |
| component | PresentationDeckView slide actions | `apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx` | Mobile action sheet, commit and delete alert |
| component | ActionMenuSheet / useActionMenu | apps/mobile/src/shared/hooks/useActionMenu (not found) (not found) | Android sheet for the actions (imported at lines 59-60) |
| component | ArtifactFullScreen handleDeckSave | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Passes onSave to the viewer (line 1698) |
| component | ArtifactViewer | `apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx` | Forwards onSave and handEdited |
| test | PresentationWorkspace.test | `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx` | Delete, duplicate, reorder and add tests (lines 172-215) |
| test | PresentationDeckView.test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx` | Slide actions tests (lines 353-680) |
| test | deck-model.test (shared) | `packages/ui/unified-chat/src/lib/deck-model.test.ts` | Add, replace, move, remove without losing last slide |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks an action; the deck document is edited in memory | device | PresentationWorkspace.tsx:365-415 |
| Deck is serialized and passed to onSave, which upserts the artifact with new content | device | PresentationWorkspace.tsx:166-171; ArtifactPreview.tsx:1153-1160 |
| The artifact store persists to browser storage; whether it then syncs to our servers is not traced | device | artifacts-store.ts:4,562 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Deck Markdown with the new slide order | Artifact store (web: persisted JSON in browser storage; mobile: its own save path via handleDeckSave) | unknown | Old versions are kept in versionsById so a delete can be restored |

**Models and providers.** None. These edits do not call a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for these actions |
| Permissions | Controls appear only when the shown version is the latest and editable (ArtifactPreview.tsx:1955; test 'offers no editing controls on a read-only version') |
| Subscription | none found in the code |
| Limits and metering | none found in the code (no slide count limit found) |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Works on the device with no network; nothing checks mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Only one slide | Delete disabled on web; not listed on mobile | PresentationWorkspace.tsx:409; PresentationDeckView.tsx:215 |
| Change produces identical text | No save | PresentationWorkspace.tsx:169; PresentationDeckView.tsx:203 |
| Viewing an old version | No edit controls | ArtifactPreview.tsx:1955-1957 |
| Delete confirmation | Mobile asks; web does not | PresentationDeckView.tsx:240; PresentationWorkspace.tsx:405 |
| Save failure, offline, retry | not handled in the code at this layer (local store write) | saveArtifactContent has no error path |
| Editing in progress | Slide menu is hidden while editing (editing toolbar replaces it) | PresentationWorkspace.tsx:~447-470 |
| Android vs iOS | iOS native action sheet; Android app sheet with destructive colour | PresentationDeckView.tsx:83-107 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/presentation/PresentationWorkspace.test.tsx`: Delete, duplicate, reorder; starter slide after current; read-only
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/PresentationDeckView.test.tsx`: Slide actions list, add, duplicate, move, confirm delete, never delete only slide, Android sheet
- `packages/ui/unified-chat/src/lib/deck-model.test.ts`: List operations

**Test scenarios**

- **Add slide**
  1. Open a 3-slide deck on slide 2
  2. Slide menu, New slide after this
  - Expected: 4 slides; slide 3 is '## New slide' with two bullets and is selected
- **Delete and restore**
  1. Delete slide 2
  2. Open more menu, view the earlier version, choose Restore version
  - Expected: Slide returns; restore adds a new latest version
- **Edge disabling**
  1. Go to slide 1, open menu
  2. Go to last slide, open menu
  - Expected: Move earlier disabled on 1; Move later disabled on last
- **Last slide protected**
  1. Reduce the deck to one slide
  2. Open menu
  - Expected: Delete slide disabled
- **Mobile delete**
  1. Open deck on phone, actions, Delete slide
  2. Cancel then repeat and confirm
  - Expected: Cancel keeps; Delete removes and selects previous

**Where to look when it fails**

- Check versionsById in the artifacts store for a new version after each action
- toast.error 'That name could not be saved' is for rename, not here
- Not run: no recorded results

**Hands-on test plans**

- Web: [70-qa/test-plans/web/030-presentation-workspace.md](../../70-qa/test-plans/web/030-presentation-workspace.md)
- Mobile: [70-qa/test-plans/mobile/030-presentation-workspace.md](../../70-qa/test-plans/mobile/030-presentation-workspace.md)

## 10. Gaps and dependencies

- **Web delete does not ask first** Affects: Web users. Evidence: PresentationWorkspace.tsx:405-413. Work needed: Use useConfirmAction per AGENTS.md section 9 or add undo
- **Delete toast says to restore but offers no control** Affects: Web users. Evidence: PresentationWorkspace.tsx:412; restore lives in ArtifactPreview.tsx:2340. Work needed: Add an action to the toast
- **No slide editing on Chrome, VS Code, CLI, Tauri desktop** Affects: those apps. Evidence: no code found. Work needed: Product decision
- **Mobile Delete message mentions restore; mobile restore path not traced** Affects: Mobile. Evidence: PresentationDeckView.tsx:241. Work needed: Verify a mobile restore control exists
- Not built on: Desktop, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- file:packages/ui/unified-chat/src/lib/deck-model.ts
- store:artifacts-store
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- F030-01

## Unknown

- Whether web artifact changes sync to the server database (not traced)
- Where mobile handleDeckSave stores and versions content (ArtifactFullScreen.tsx not read in full)
- Whether mobile has a restore-previous-version control
