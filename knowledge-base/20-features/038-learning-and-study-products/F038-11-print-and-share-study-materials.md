---
id: "F038-11"
type: "feature"
title: "Print and share study materials"
aliases: ["Print and share study materials (S38.34)", "Print", "study-print", "Answer key"]
area: "38 Learning and study products"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.34"]
depends_on: ["surface:web", "surface:desktop", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-security-and-privacy", "F038-07", "F038-12", "file:apps/web/features/chat/components/artifacts/study/study-print.ts", "test:apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-11 Print and share study materials

On web (and the Electron desktop, which shows web) a quiz or flashcard set has a 'Print' button that opens the print dialog with a clean sheet: quiz with answer key, or cards in two columns. Sharing is not built for study sets. Mobile, CLI, VS Code and Chrome have no print.

Area: [38. Learning and study products](README.md). Requirement items: [S38.34](../../10-requirements/capabilities/038-learning-and-study-products.md#s3834).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Prints a study quiz or flashcard set from the browser through a hidden sandboxed frame (apps/web/features/chat/components/artifacts/study/study-print.ts:56-71). A quiz prints questions, blanks for written answers and an 'Answer key' page; cards print as a table (study-print.ts:20-54).

**Why it exists.** Learners and teachers want paper copies and offline study; the brief says materials (quizzes, cards, guides) can be printed or shared (S38.34).

**Who uses it.** Students, tutors and teachers.

**Problems it solves**

- On-screen decks are not usable away from a device.
- Teachers need a quiz without showing the answers beside the questions.

**Use cases**

- Print a ten-question quiz with an answer key on a separate page.
- Print a card table to cut into cards.
- Save as PDF from the print dialog [inferred from standard browser print].

## 2. User experience

**Where to find it**

- Web: under each quiz or flashcard deck in a chat answer or the artifact panel, a 'Print' button (apps/web/features/chat/components/artifacts/study/StudyDocument.tsx:113-124).
- Desktop: shows the hosted web app (doc: AGENTS.md section 5); whether the Electron window allows the print dialog was not checked: unknown.
- Mobile, CLI, VS Code, Chrome: no print or share control for study sets found.

**Before you start**

- A readable quiz or flashcard block in the answer.

**Screens and controls**

- 'Print' button with a printer icon (StudyDocument.tsx:113-124). Hidden while editing (line 99).

**Journey**

1. 1. Open the chat answer with the quiz or deck.
2. 2. Tap 'Print'.
3. 3. The browser print dialog opens with the sheet.
4. 4. Print or save as PDF.

**What the person sees and gets**

- The browser print preview; no in-app message on success or on a blocked print.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- quizPrintHtml: title, numbered questions, lettered options (A to H) or a blank line, then 'Answer key' with explanations (study-print.ts:20-46).
- flashcardsPrintHtml: two-column table of front and back (study-print.ts:48-54).
- HTML escaping of all text (study-print.ts:3-9).
- Hidden iframe with sandbox 'allow-same-origin allow-modals', no scripts, removed after 1 second (study-print.ts:56-71).

**Incomplete**

- Print covers only quizzes and flashcards, not study guides or learning overviews, which are ordinary Markdown (StudyDocument.tsx:45-47 shows prose through MarkdownContent with no print).

**Present but disconnected or switched off**

- none found

**Not available**

- Sharing a study set (link, export, send) on any app: no code found.
- Print on mobile, CLI, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- Study materials (quizzes, cards, guides) can be printed or shared. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.34)

**Acceptance criteria**

1. 'Print' opens the print dialog with the set's title.
2. A quiz sheet shows questions without answers and a separate 'Answer key' section.
3. Cards print as a two-column table with front and back.
4. Special characters like < and & print as text, not markup.
5. The print frame has no script permission.
6. Sharing, when built, gives the recipient the set without the sender's private chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Guides should be printable too, since the Should line names them [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A share action that creates a link or file to the set only, with a consent step.
- [proposed] Mobile share sheet export as text or PDF.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | quizPrintHtml | `apps/web/features/chat/components/artifacts/study/study-print.ts` | Quiz sheet and answer key |
| service | flashcardsPrintHtml | `apps/web/features/chat/components/artifacts/study/study-print.ts` | Card table sheet |
| service | printHtml | `apps/web/features/chat/components/artifacts/study/study-print.ts` | Sandboxed iframe print |
| component | StudyDocument Print button | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Calls printHtml (lines 113-124) |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Mounts StudyDocument |
| service | study-set parser | `packages/ui/unified-chat/src/lib/study-set.ts` | Quiz and Flashcard types printed |
| test | StudyDocument.test | `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx` | Print HTML and iframe sandbox |
| component | StudyDocumentView (mobile) | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyDocumentView.tsx` | Mobile study view with no print or share control |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Tap Print: the parsed set is turned into an HTML string. | device | StudyDocument.tsx:117-119; study-print.ts:20-54 |
| A hidden iframe loads the HTML as srcdoc and calls print(). | device | study-print.ts:56-71 |
| The browser or Electron print system handles the output. | device | [inferred] standard browser print |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated print HTML | Temporary iframe, removed after about 1 second | No | Deleted by the page; paper or PDF copies are the user's |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for printing |
| Permissions | Visible even on read-only artifact versions (StudyDocument.test.tsx:181-185). |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | Runs fully on the device; needs no server or subscription. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Popup or print blocked | not handled in the code; no message | study-print.ts:65-70 |
| Frame never loads | The frame stays in the page until reload [inferred]; removal only happens in onload | study-print.ts:65-70 |
| Quiz with options beyond H | Options are capped at 8 by the parser, so letters suffice | study-set.ts:42; study-print.ts:11 |
| Unreadable set | No Print button; shows 'could not be read' | StudyDocument.tsx:50-56 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx`: Quiz print includes 'Answer key' and 'B. Mitochondrion'; cards print as table cells; iframe sandbox allows modals, not scripts; Print present on read-only

**Test scenarios**

- **Print a quiz**
  1. Open a quiz on web
  2. Tap Print
  - Expected: Dialog shows questions, then 'Answer key' on a new page.
- **Print cards**
  1. Open a deck, Print
  - Expected: Two-column table.
- **Markup characters**
  1. Use a card whose front contains <b>x</b>
  - Expected: Printed as literal text.
- **No print on mobile**
  1. Open a deck on the phone app
  - Expected: No print or share control.

**Where to look when it fails**

- Check for a leftover hidden iframe in the page
- Browser console for print errors

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)

## 10. Gaps and dependencies

- **No sharing of study sets** Affects: All apps. Evidence: No share code in the study folders. Work needed: Define share model, consent and recipient view
- **No print on mobile, CLI, VS Code, Chrome** Affects: Those apps. Evidence: No print code outside study-print.ts. Work needed: Native share or print path
- **Guides are not printable through this path** Affects: Web learners. Evidence: StudyDocument.tsx:45-47. Work needed: Print for Markdown prose or reuse the document export
- **Electron desktop print not verified** Affects: Desktop. Evidence: Not checked. Work needed: Run in Electron and record
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-security-and-privacy
- F038-07
- F038-12
- file:apps/web/features/chat/components/artifacts/study/study-print.ts
- test:apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx

## Unknown

- Whether the Electron desktop opens the print dialog from the hidden frame.
- Whether artifact-level sharing elsewhere in the product could carry a study set.
- Whether guides are meant to use a different print path.
