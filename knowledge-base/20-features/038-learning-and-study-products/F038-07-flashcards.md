---
id: "F038-07"
type: "feature"
title: "Flashcards"
aliases: ["Flashcards", "Flashcard set", "~~~flashcards block", "FlashcardsView", "StudyFlashcardsView", "Flashcards tile in Project Studio", "Flashcard generation (S38.22)", "Flashcard editing (S38.23)", "Flip-card interaction (S38.24)", "Known/practice classification (S38.25)", "Shuffle (S38.26)"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.22", "S38.23", "S38.24", "S38.25", "S38.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "F038-08", "F038-11", "file:packages/ui/unified-chat/src/lib/study-set.ts", "file:apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx", "file:apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-07 Flashcards

Flashcards turn a model answer into a set of cards the learner flips, marks 'Got it' or 'Still learning', shuffles and reviews again. Web (and the Electron desktop that shows web) can also edit and print a set. Mobile shows and flips it. The area brief calls every item missing; the code shows it built on web and mobile.

Area: [38. Learning and study products](README.md). Requirement items: [S38.22](../../10-requirements/capabilities/038-learning-and-study-products.md#s3822), [S38.23](../../10-requirements/capabilities/038-learning-and-study-products.md#s3823), [S38.24](../../10-requirements/capabilities/038-learning-and-study-products.md#s3824), [S38.25](../../10-requirements/capabilities/038-learning-and-study-products.md#s3825), [S38.26](../../10-requirements/capabilities/038-learning-and-study-products.md#s3826).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** When the model writes a ~~~flashcards block of JSON (title, cards with front and back) inside a document artifact, the app shows an interactive deck instead of code: tap a card to flip it, mark it 'Got it' or 'Still learning', shuffle, and re-run only the cards still being learned (apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx:17-137). On web the set can also be edited and printed (StudyDocument.tsx:99-125).

**Why it exists.** Memorising terms is a core study task and ChatGPT and Claude style study tools offer card decks [inferred from the product context and the brief's Should lines S38.22 to S38.26]. A plain list of terms in chat is hard to practise from.

**Who uses it.** Students and self-learners using Study mode or a project's Studio, and anyone who asks the model for flashcards.

**Problems it solves**

- A list of terms in chat cannot be self-tested; the deck hides the back until the learner flips the card.
- The learner can focus on weak cards with 'Review N still learning'.
- A model-written set with a typo can be fixed by hand on web without asking the model again.

**Use cases**

- A learner in Study mode asks for flashcards on the Krebs cycle, flips through them and marks which ones they know.
- A learner opens a project with course notes, picks the Flashcards tile in Project Studio and gets twenty cards built from the sources (apps/web/features/projects/components/ProjectStudio.tsx:87-93).
- A teacher on web edits two wrong cards and prints the set as a two-column sheet.

## 2. User experience

**Where to find it**

- Web: there is no Flashcards page. A deck appears in a chat answer or in the artifact panel when the answer holds a ~~~flashcards block (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1921-1930). Ways to ask for one: Study page 'Study' at /chat/study, whose mode text tells the model it may write flashcards (apps/web/features/study/lib/study-session.ts:53), or the 'Flashcards' tile in Project Studio on a project page (ProjectStudio.tsx:87-93).
- Desktop (Electron, the public desktop): shows the hosted web app, so the same as web (doc: AGENTS.md section 5; apps/desktop/electron/__tests__/windowRegistry.test.ts:42 lists /chat/study). The retained Tauri desktop source (apps/desktop/src) has no flashcard or study code found by search.
- Mobile: deck shows inline in a chat answer or in the artifact viewer (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1447; apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx:63-72). Ask via the Study screen (apps/mobile/app/(app)/study.tsx) or a project notebook output (apps/mobile/src/features/notebook/ProjectNotebookScreen.tsx:7-9).
- CLI, VS Code extension, Chrome extension: no flashcard viewer found; a ~~~flashcards block would not be drawn as a deck there [inferred: no match for the study-set module outside web and mobile].

**Before you start**

- Signed-in account and a chat turn that returns a ~~~flashcards block; the model must follow the prompt format. Nothing else is required to flip, mark or shuffle, which run in the browser or app (FlashcardsView.tsx:17-30).
- To edit on web: the artifact must be a stored artifact, its latest version, in the panel view, and the set must be 'lossless' (ArtifactPreview.tsx:1041-1042; StudyDocument.tsx:57,101).

**Screens and controls**

- Web deck: header with the set title (or 'Flashcards') and 'Card N of M · K known'; a card button labelled 'Show the back' or 'Show the front'; 'Previous card' and 'Next card' arrow buttons; after a flip, 'Still learning' and 'Got it'; 'Shuffle cards'; 'Review N still learning' once some cards are known (FlashcardsView.tsx:55-135).
- Web document controls under each set: 'Edit cards' (only when editable) and 'Print' (StudyDocument.tsx:99-125).
- Web editor: 'Set title', 'Card N front', 'Card N back', 'Remove card N', 'Add card', 'Cancel', 'Save' (StudySetEditors.tsx:296-358, 25-36).
- Mobile deck: same labels 'Previous card', 'Next card', 'Still learning', 'Got it', 'Shuffle cards', 'Review N still learning' and a progress line (apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx:84-184). No edit or print on mobile.

**Journey**

1. 1. The learner asks for flashcards (Study session, Project Studio tile, or a plain chat request).
2. 2. The model replies with a document whose ~~~flashcards block holds JSON.
3. 3. The app finds the block, parses it and draws the deck with the front face up.
4. 4. The learner taps the card to see the back.
5. 5. The learner taps 'Got it' or 'Still learning'; the app moves to the next card and shows the known count.
6. 6. At any time the learner taps 'Shuffle cards', or 'Review N still learning' to loop only the unknown cards.
7. 7. On web the learner may tap 'Edit cards', fix text, add or remove cards, and 'Save'; or tap 'Print'.

**What the person sees and gets**

- 'Card N of M · K known' counter (FlashcardsView.tsx:54-58).
- If the JSON cannot be read: web shows 'This flashcard set could not be read.' (StudyDocument.tsx:50-56); mobile shows 'Writing the flashcard set' while streaming and 'This flashcard set could not be read.' after (StudyDocumentView.tsx:50-59).
- If part of a set is beyond the limits: 'Part of this flashcard set is beyond what can be shown or edited here, so editing is off to keep the original intact.' (StudyDocument.tsx:93-98).
- Print opens the browser print dialog with a two-column sheet (study-print.ts:48-71).

**Settings**

- None found in the code. The study mode, level and 'Course material' choices on the Study page change the prompt, not the deck (apps/web/features/study/components/StudyPage.tsx:201-268).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: parse, flip, Got it / Still learning, shuffle, review-still-learning (FlashcardsView.tsx:17-137), covered by a test (apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx:128-141).
- Web: edit and save back into the document, add card, card limit, text limit (StudySetEditors.tsx:280-358; StudyDocument.test.tsx:162-180, 332-358).
- Web: print as a two-column table from a sandboxed frame (study-print.ts:48-71; StudyDocument.test.tsx:187-203).
- Mobile: parse, flip, mark, shuffle, review (StudyFlashcardsView.tsx:32-186; apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx:277-317).
- Generation by prompt: Study mode instruction (study-session.ts:53), Project Studio tile on web (ProjectStudio.tsx:87-93).
- Parser accepts front/back, term/definition or question/answer keys; strips a model-written 'Card 1 of 5' counter from the title (packages/ui/unified-chat/src/lib/study-set.ts:114-129; packages/platform/artifacts/src/artifact-derivation.ts:356-358).
- Title and one-line summary of a set in the mobile artifacts list without showing answers (apps/mobile/src/features/chat/components/artifact-viewers/study/studyContent.ts:54-84).

**Incomplete**

- Known and still-learning marks live only in component state, so they reset when the view is remounted or the page reloads (FlashcardsView.tsx:22-24 uses useState only; no store or API call found).
- Editing is web only, and only in the panel on a stored latest version (ArtifactPreview.tsx:1041-1042).
- Print is web only (no print code found in apps/mobile).
- Project Studio on mobile and in the shared contract asks for a one-card-at-a-time chat flow, not a ~~~flashcards block, so mobile gets a deck only if the model chooses the block (packages/contracts/cloud-contracts/src/project-studio.ts:94-99 versus ProjectStudio.tsx:87-93).
- Shuffle is not seeded or persisted and 'Shuffle cards' resets position to card 1 (FlashcardsView.tsx:108-116).

**Present but disconnected or switched off**

- Tauri desktop source (apps/desktop/src) has no flashcard code found; the public Electron desktop uses the web app instead (doc: AGENTS.md section 5).

**Not available**

- CLI, VS Code extension and Chrome extension: no deck viewer found.
- Spaced repetition scheduling, card images, import or export of decks: no code found.
- Mobile editing and printing.

## 4. Required behaviour

**Established requirements**

- The product generates flashcards on a topic or from material. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.22)
- The user can edit flashcards. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.23)
- Flashcards flip between front and back. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.24)
- The learner marks cards as known or needing practice. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.25)
- Cards or questions can be shuffled. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.26)
- The model-generated set is capped at 300 cards and each text at 2,000 characters. (source: packages/ui/unified-chat/src/lib/study-set.ts:43-44)

**Acceptance criteria**

1. A reply containing a valid ~~~flashcards block shows a deck with the first front face up and 'Card 1 of N · 0 known', and never shows the JSON.
2. Tapping the card shows the back; tapping again shows the front.
3. After a flip, 'Got it' raises the known count by one and moves to the next card; 'Still learning' leaves it unchanged.
4. 'Shuffle cards' reorders cards, returns to card 1 and shows the front.
5. 'Review N still learning' shows only unknown cards.
6. On web, 'Edit cards' then changing a back and 'Save' updates the stored artifact; Save is disabled while any card side is empty.
7. A set of 301 cards shows only 300 and turns editing off.
8. Print on web opens the print dialog with a title and a two-column table.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Marks should survive a re-render of the same chat message at least within a session [inferred: a progress counter that resets is surprising].
- Because the same brief items are marked missing on all apps, the brief status is stale for web, desktop (via web) and mobile and should be refreshed [inferred from code present].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store known/still-learning marks per set so progress survives reload and can feed F038-08.
- [proposed] Add edit and print on mobile, or an explicit decision that mobile is view only.
- [proposed] Give CLI, VS Code and Chrome a plain-text fallback that lists cards.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | FlashcardsView | `apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx` | Web deck: flip, mark, shuffle, review still learning |
| component | StudyDocument | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Splits a document into prose and study blocks, shows Edit and Print |
| component | FlashcardsEditor | `apps/web/features/chat/components/artifacts/study/StudySetEditors.tsx` | Web editor for title and cards, with limits and Save gate |
| service | flashcardsPrintHtml / printHtml | `apps/web/features/chat/components/artifacts/study/study-print.ts` | Builds printable table and prints through a sandboxed iframe |
| component | ArtifactPreview (renderMarkdownPreview) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Chooses StudyDocument when hasStudyBlocks is true; passes editable and onAsk |
| service | study-set parser and serializer | `packages/ui/unified-chat/src/lib/study-set.ts` | parseFlashcards, serializeFlashcards, studySegments, replaceStudyBlock, studySourceIsLossless, MAX_CARDS |
| service | artifact title derivation for study sets | `packages/platform/artifacts/src/artifact-derivation.ts` | Recognises quiz and flashcards fences, strips counters from titles |
| component | StudyFlashcardsView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx` | Mobile deck |
| component | StudyDocumentView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyDocumentView.tsx` | Mobile document with inline decks and 'could not be read' states |
| service | studyContent helpers | `apps/mobile/src/features/chat/components/artifact-viewers/study/studyContent.ts` | studyFenceContent, studyArtifactContent, studySummary, studyTitle |
| component | MessageContentRenderer (study fence branch) | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Draws StudyDocumentView for a study fence in a message |
| component | ArtifactViewer (study kind) | `apps/mobile/src/features/chat/components/artifact-viewers/ArtifactViewer.tsx` | Opens a study artifact from the gallery |
| config | Study prompt practices | `apps/web/features/study/lib/study-session.ts` | Tells the model to write a ~~~flashcards block (line 53) |
| config | Project Studio flashcards tile (web) | `apps/web/features/projects/components/ProjectStudio.tsx` | Prompt asking for twenty cards as a ~~~flashcards block |
| config | Project Studio outputs (shared) | `packages/contracts/cloud-contracts/src/project-studio.ts` | Chat-turn flashcards prompt used by mobile notebook |
| test | StudyDocument.test | `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx` | Web flip, edit, print, limits |
| test | StudyDocumentView.test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx` | Mobile deck behaviour |
| test | study-set.test | `packages/ui/unified-chat/src/lib/study-set.test.ts` | Counter stripping, block parsing and rewrite |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Learner asks for cards; the message goes through the normal chat turn, with the study instruction added if a study session is open on that conversation. | device and our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3802-3830,3926 |
| A model produces text that holds a ~~~flashcards JSON block. | outside service | [inferred] the model provider is chosen by the chat pipeline; see SYS-chat-turn-pipeline |
| The app splits the text into prose and study blocks and parses the JSON. | device | packages/ui/unified-chat/src/lib/study-set.ts:114-129,259-290 |
| Deck draws; flip, mark, shuffle and review change React state only. | device | apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx:22-52 |
| Edit and Save rewrite the block in the artifact text and call onSave, which stores a new artifact version. | device and our servers | StudyDocument.tsx:59-69; ArtifactPreview.tsx:1925 (saveArtifactContent); the storage call itself was not opened: unknown |
| Print builds HTML and prints it from a hidden sandboxed iframe in the browser. | device | study-print.ts:56-71 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Card text (the ~~~flashcards JSON inside the message or artifact) | With the chat message and, if saved, the artifact record | As part of the chat or artifact (SYS-sync-and-continuity); details unknown | Follows the message or artifact; no card-specific deletion found |
| Known and still-learning marks, shuffle order | In memory of the viewer only | No | Lost when the view is closed or reloaded |

**Models and providers.** Any model in any mode can write the block if it follows the prompt; no model or provider is named in the flashcard code. Viewing, flipping and printing use no model. Quality depends on the model keeping to the JSON format [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing a deck needs no extra account step beyond seeing the chat. Study sessions and Project Studio need sign-in because they use authenticated APIs (apps/web/app/api/study/sessions/route.ts:61-72). |
| Permissions | Editing needs a stored artifact the user can edit, the latest version, in the panel (ArtifactPreview.tsx:1041-1042). No role check beyond that found. |
| Subscription | No flashcard-specific entitlement found in the viewer, editor or print code. Cost comes from the chat turn that writes the cards, which follows SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | 300 cards per set, 2,000 characters per text field (study-set.ts:43-44). Chat turn usage is metered by the normal pipeline [inferred]. |
| Feature flags | none found in the code |
| Model compatibility | None named. Any model that writes valid JSON in the block works [inferred]. |
| Provider restrictions | none found in the code |
| Local mode | The viewer, flip, mark, shuffle and (web) print run on the device and need no server. Whether a local model on mobile or desktop can write the block is unknown; the Study session record is stored on our servers, so a Local-only chat has no study session [inferred]. Marked unknown: not checked in the local inference code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Set cannot be parsed or is empty | Web: 'This flashcard set could not be read.' Mobile: same text; while streaming 'Writing the flashcard set'. | StudyDocument.tsx:50-56; StudyDocumentView.tsx:50-59 |
| More than 300 cards or text longer than 2,000 characters | Extra is dropped on display, and Edit is hidden with an explanatory line so the original is not damaged. | study-set.ts:119-121,166-191; StudyDocument.tsx:93-98 |
| Last card marked | Stays on the last card face up front; no completion screen. | FlashcardsView.tsx:41-43 |
| Empty edit field | Save disabled with a status message. | StudySetEditors.tsx:82-93,351-355 |
| Read-only artifact version | No 'Edit cards'; 'Print' still present. | StudyDocument.test.tsx:181-185 |
| Accessibility | Card is a button with aria-label and live text; mobile card has accessibilityLabel and hint. | FlashcardsView.tsx:61-74; StudyFlashcardsView.tsx:99-104 |
| Offline or reconnect | Deck works offline once the message is shown [inferred]; saving an edit offline is not handled in the files read. | not handled in the code read |
| Loading or timeout | Not handled in the code for the deck itself; no network call in the viewer. | FlashcardsView.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx`: Reads blocks, flip and mark, review still learning, edit and add card, read-only version, print HTML and iframe sandbox, 300-card and text limits
- `packages/ui/unified-chat/src/lib/study-set.test.ts`: Counter stripped from titles, tilde and backtick fence handling, rewrite in place
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx`: Mobile flip, mark, previous/next, review, shuffle, 'writing' and 'could not be read' states
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyForms.test.tsx`: Flashcards shown inline with backs hidden, artifact list entries open the study view
- `apps/mobile/src/features/artifacts/__tests__/ArtifactStudyTitle.test.tsx`: Study set title and fallback 'Study set' in the gallery

**Test scenarios**

- **Flip and mark on web**
  1. Open a chat where the model replied with a flashcards block
  2. Tap the card
  3. Tap 'Got it'
  4. Tap the next card, flip it, tap 'Still learning'
  5. Tap 'Review 1 still learning'
  - Expected: Counter shows '1 known'; review shows only the card marked still learning.
- **Edit and save**
  1. Open the stored artifact in the panel
  2. Tap 'Edit cards'
  3. Clear one back field
  4. Observe Save
  5. Fill it, tap Save
  - Expected: Save is disabled while the field is empty; after Save the deck shows the new text and a new version exists.
- **Print**
  1. Tap 'Print' under a deck
  2. Check the preview
  - Expected: Title and a two-column table of fronts and backs; no script runs.
- **Mobile deck**
  1. On a phone open a chat with a flashcards answer
  2. Tap the card, 'Got it', 'Shuffle cards'
  - Expected: Backs are hidden until flipped; shuffle returns to card 1 face up.
- **Bad JSON**
  1. Ask the model for a block with invalid JSON, or paste one
  - Expected: 'This flashcard set could not be read.' and no crash.
- **Unsupported app**
  1. Ask for flashcards in the CLI, VS Code or Chrome extension
  - Expected: Observe how the block is shown; expected to be raw text (unverified).

**Where to look when it fails**

- Search for the string 'could not be read' in the UI to confirm a parse failure.
- Check the raw message text for a ~~~flashcards fence and valid JSON.
- Edit gate: confirm artifact is stored, latest, panel variant (ArtifactPreview.tsx:1041).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Progress marks are not saved** Affects: Learners on web, desktop and mobile. Evidence: FlashcardsView.tsx:22-24; StudyFlashcardsView.tsx:37. Work needed: Persist per-set marks, then show them in F038-08
- **No edit or print on mobile** Affects: Mobile learners. Evidence: No edit or print code under apps/mobile/src/features/chat/components/artifact-viewers/study/. Work needed: Add editor and share or print path, or record view-only as intended
- **No deck viewer in CLI, VS Code, Chrome** Affects: Users of those three apps. Evidence: No study-set import outside web and mobile. Work needed: Add rendering or a text fallback
- **Mobile Project Studio flashcards prompt asks for a card-by-card chat, not a deck block** Affects: Mobile learners using the notebook. Evidence: project-studio.ts:94-99 versus ProjectStudio.tsx:87-93. Work needed: Align the prompts to one format
- **The area brief lists all six apps as missing** Affects: Anyone reading the brief. Evidence: S38.22 to S38.26 versus the code above. Work needed: Refresh the ledger statuses
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- F038-08
- F038-11
- file:packages/ui/unified-chat/src/lib/study-set.ts
- file:apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx
- file:apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx

## Unknown

- How a saved edit is stored and whether it syncs across devices (saveArtifactContent was not opened).
- Whether a local model on mobile or desktop writes valid flashcard blocks.
- How CLI, VS Code and Chrome display a flashcards block (no code found; not run).
- Whether marks are intended to persist (no spec found).
