---
id: "F022-10"
type: "feature"
title: "Study cards and quizzes"
aliases: ["Study set", "Flashcards", "Quiz", "Study document", "QuizView", "FlashcardsView", "StudyDocument", "StudyQuizView", "StudyFlashcardsView", "S22.34", "S22.35"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S22.34", "S22.35"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "file:packages/ui/unified-chat/src/lib/study-set.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-10 Study cards and quizzes

A study answer can include flip-style flashcards and an interactive quiz. Web shows them in the artifact panel with answer checking, hints, retake and print. Mobile shows them inline in chat and in the artifact viewer. The brief says missing everywhere, but the code builds both on web and mobile.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.34](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2234), [S22.35](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2235).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Reads quiz and flashcards blocks (JSON inside a quiz or flashcards fence) from a markdown document and shows them as an interactive quiz and flip cards. The quiz checks multiple-choice and short answers, shows hints and explanations, scores, and can ask the assistant to explain missed questions. (packages/ui/unified-chat/src/lib/study-set.ts:1-60,238-360; apps/web/features/chat/components/artifacts/study/QuizView.tsx; FlashcardsView.tsx)

**Why it exists.** Learners should practise inside the chat instead of reading a list of questions. (doc: area brief S22.34, S22.35)

**Who uses it.** Students and anyone studying a project's sources, on web and mobile.

**Problems it solves**

- Answers are hidden until the person answers (mobile: the set's source is never shown, StudyDocumentView.tsx:15-19).
- Wrong answers lead straight to an explanation request.
- Cards can be shuffled and reviewed again.

**Use cases**

- From a project, ask for a ten-question quiz and take it in the artifact panel.
- Ask for flashcards for new terms and flip through them on a phone.
- After a quiz press 'Explain what I missed'.
- Print a quiz or card set from the web panel.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): a markdown document artifact whose content has a quiz or flashcards block opens as a study document in the artifact panel (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1921-1929). It is not drawn inline in the chat bubble: no inline handler found in web chat messages.
- Mobile: inline in the chat reply and in the artifact viewer (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:1442-1447; artifact-viewers/ArtifactViewer.tsx:66).
- Web Projects: Studio prompts that ask for a quiz or flashcards (apps/web/features/projects/components/ProjectStudio.tsx:84-98); Study mode prompt text (apps/web/features/study/lib/study-session.ts:52-53).
- CLI, VS Code, Chrome: none found.

**Before you start**

- The document must contain a quiz or flashcards fence in the expected JSON shape; it is marked as an artifact with <!-- @artifact --> (study-session.ts:52).
- Edit and Print need an editable artifact and (for follow-ups) the side panel variant (ArtifactPreview.tsx:1926-1928).

**Screens and controls**

- Web quiz: question, option radio labels or a text answer, 'Show a hint'/'Show another hint', 'Check answer', next/finish, results 'You scored X of Y', 'Retake', 'Explain what I missed' or 'What should I study next?', 'Ask whether my wording also counts' (QuizView.tsx).
- Web flashcards: card button 'Show the back'/'Show the front', 'Previous card', 'Next card', 'Shuffle cards' (FlashcardsView.tsx).
- Study document: Edit quiz/Edit cards and Print buttons (StudyDocument.tsx:99-123).
- Mobile flashcards: 'Still learning', 'Got it', 'Previous card', 'Next card', 'Shuffle cards', 'Review N still learning' (StudyFlashcardsView.tsx:135-178). Mobile quiz: 'Retake', 'Explain what I missed' (StudyQuizView.tsx:126-129).

**Journey**

1. Ask for a quiz or flashcards.
2. Open the study document (web: artifact panel; mobile: inline).
3. Answer a question and check it, read the explanation; or flip a card.
4. Finish; read the score and missed answers.
5. Retake, or ask the assistant to explain what was missed.

**What the person sees and gets**

- Correct/wrong icons with labels 'Correct answer' and 'Your answer' (QuizView.tsx:164-167).
- Score heading and the list of missed questions with answers and explanations (QuizView.tsx:60-100).
- A set that cannot be read is not shown as interactive (StudyDocumentView.tsx:46-64).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Parsing and limits: up to 100 questions, 8 options, 300 cards, 2000 characters per text (study-set.ts:41-44).
- Web study document with quiz, flashcards, editors and print (StudyDocument.tsx; QuizView.tsx; FlashcardsView.tsx; StudySetEditors.tsx; study-print.ts).
- Short-answer grading with accepted alternatives (study-set.ts:238-244).
- Follow-up prompts built from missed answers (study-set.ts:329-360).
- Mobile study views inline and in the artifact viewer (StudyDocumentView.tsx, StudyQuizView.tsx, StudyFlashcardsView.tsx, MessageContentRenderer.tsx:1442).
- Prompts that produce study blocks exist for Projects Studio and Study mode (ProjectStudio.tsx:84-98; study-session.ts:52-53).

**Incomplete**

- Web shows study sets only for markdown documents in the artifact panel; a bare quiz fence in a chat bubble was not found to render as a quiz on web. Whether the web chat opens such answers automatically as artifacts is unknown.
- Follow-up from the quiz works only in the panel variant (ArtifactPreview.tsx:1926-1928).

**Present but disconnected or switched off**

- Brief says S22.34 and S22.35 are 'missing' on every app; the code contradicts it on web, desktop (hosted web) and mobile.

**Not available**

- CLI, VS Code, Chrome: no study views found (searched apps/cli/src, apps/extension/src, apps/extension-vscode/src for quiz and flashcard).

## 4. Required behaviour

**Established requirements**

- Study answers can render as flip-style flashcards in the chat. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.34)
- Quiz answers render as an interactive quiz with answer checking. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.35)
- A document that contains quiz or flashcard blocks is shown as a study document. (source: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1921-1923)
- Quiz checking and follow-up use shared study-set code. (source: packages/ui/unified-chat/src/lib/study-set.ts:1-4,238-360)

**Acceptance criteria**

1. A markdown artifact with a valid quiz block shows an interactive quiz, not the JSON, on web.
2. Selecting an option and pressing Check answer marks it correct or wrong and shows the explanation.
3. Hints appear one at a time up to the set limit.
4. The result screen shows the score and missed questions, and Retake resets answers.
5. A flashcards block shows cards that flip and can be shuffled; mobile has Got it and Still learning.
6. A block with invalid JSON is not shown as an interactive set.
7. Mobile shows a quiz inline in a chat reply.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Study answers should also work inline on web chat, because the brief asks for 'in the chat'. [inferred from S22.34]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Render quiz and flashcards fences inline in the web chat bubble using the same components.
- [proposed] Update the brief to built for web/mobile and add a text fallback for CLI, VS Code and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | study-set | `packages/ui/unified-chat/src/lib/study-set.ts` | Parses, serializes, grades, segments and builds follow-up prompts. |
| component | StudyDocument | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Web study document with edit and print. |
| component | QuizView | `apps/web/features/chat/components/artifacts/study/QuizView.tsx` | Web interactive quiz. |
| component | FlashcardsView | `apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx` | Web flip cards. |
| component | StudySetEditors | `apps/web/features/chat/components/artifacts/study/StudySetEditors.tsx` | Quiz and cards editors. |
| service | study-print | `apps/web/features/chat/components/artifacts/study/study-print.ts` | Print HTML for quiz and cards. |
| component | ArtifactPreview (study branch) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Chooses StudyDocument when hasStudyBlocks (line 1922). |
| component | StudyDocumentView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyDocumentView.tsx` | Mobile study document. |
| component | StudyQuizView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx` | Mobile quiz. |
| component | StudyFlashcardsView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx` | Mobile flip cards with Got it / Still learning. |
| service | studyContent | `apps/mobile/src/features/chat/components/artifact-viewers/study/studyContent.ts` | Detects study fences and documents on mobile. |
| component | MessageContentRenderer (study branch) | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Inline study view in chat (line 1442). |
| service | artifact-derivation counters | `packages/platform/artifacts/src/artifact-derivation.ts` | Study-set titles and counter stripping (lines 343-370). |
| config | study-session prompts | `apps/web/features/study/lib/study-session.ts` | Tells the model the quiz and flashcards block formats. |
| component | ProjectStudio prompts | `apps/web/features/projects/components/ProjectStudio.tsx` | One-click quiz and flashcard requests from project sources. |
| test | study sessions migration test | `apps/web/db/neon/study-sessions-migration.test.ts` | Test of the study sessions migration; the table name was not read: unknown. |
| test | study-set.test.ts | `packages/ui/unified-chat/src/lib/study-set.test.ts` | Parsing and grading tests. |
| test | StudyDocument.test.tsx | `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx` | Web study document tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model writes a markdown artifact holding a quiz or flashcards fence with JSON. | our servers | Prompt text in apps/web/features/study/lib/study-session.ts:52-53; stream path as other chat. Local and own-key paths: unknown. |
| The app splits the markdown into prose and study segments and parses the JSON. | device | study-set.ts:259-294 |
| The person answers; checking and scoring run in the view without a network call. | device | QuizView.tsx:38-60 |
| A follow-up button sends a built prompt back to the chat as a new message. | device and our servers | onAsk prop in ArtifactPreview.tsx:1926; buildQuizFollowUp study-set.ts:329 |
| Edited sets are saved as a new artifact version. | device and our servers | StudyDocument onSave = saveArtifactContent (ArtifactPreview.tsx:1925); server path not traced: unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Quiz and card definitions | In the artifact content (markdown) | With the artifact on web; mobile storage unknown | With the artifact and its versions |
| Answers, score, still-learning marks | Component state only | No | Lost on leaving the view (QuizView.tsx:27-30 state) |

**Models and providers.** The model must follow the JSON format. Any model can do so; nothing ties it to a provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs sign-in for chat. Study mode and Projects are web features (apps/web/features/study, apps/web/features/projects). |
| Permissions | Edit needs permission to edit the artifact (canEditSource, ArtifactPreview.tsx:1925). |
| Subscription | none found in the code for the study views; whether Study mode or Projects Studio is plan-gated was not checked: unknown. |
| Limits and metering | Parse limits 100 questions, 8 options, 300 cards, 2000 characters per text (study-set.ts:41-44). |
| Feature flags | none found in the code |
| Model compatibility | Any model that can produce the JSON blocks. |
| Provider restrictions | none found in the code |
| Local mode | Grading and flipping run on the device, so a Local reply containing a study block would work. [inferred] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid or unreadable set | Not rendered as an interactive set; mobile shows a notice or a writing placeholder while streaming. | StudyDocumentView.tsx:46-64 |
| Streaming on mobile | The last study segment is treated as still being written. | StudyDocumentView.tsx:34-37,50 |
| Hints | Hint button shows a count and appears only while hints remain. | QuizView.tsx hint control (label 'Show a hint'/'Show another hint') |
| Finish | Results view with retake and follow-up. | QuizView.tsx:58-100 |
| Accessibility | Labels such as 'Show the back', 'Previous card', 'Shuffle cards', quiz sections labelled with the title. | FlashcardsView.tsx; QuizView.tsx:122 |
| Offline | Checking and flipping need no network; the follow-up needs the chat. [inferred] No explicit offline handling found. | searched QuizView.tsx and FlashcardsView.tsx for network calls; none found |
| Print | Opens a print view built from the set. | StudyDocument.tsx:118-123 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/lib/study-set.test.ts`: Parsing, grading, segments
- `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx`: Web study document
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx`: Mobile study document
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyForms.test.tsx`: Mobile quiz and card forms
- `apps/mobile/src/features/artifacts/__tests__/ArtifactStudyTitle.test.tsx`: Study artifact titles
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/ArtifactViewer.test.tsx`: Artifact viewer including study content
- `apps/web/features/study/lib/study-session.test.ts`: Study session prompt rules

**Test scenarios**

- **Take a quiz on web**
  1. Open a project with sources and use the Studio quiz action.
  2. Open the quiz artifact.
  3. Pick an option, press Check answer, finish, read the score.
  - Expected: Correct and wrong marks, explanations, 'You scored X of Y'.
- **Retake and explain**
  1. On the result screen press Retake, then finish with a miss and press 'Explain what I missed'.
  - Expected: Answers reset; a follow-up message is sent to the chat.
- **Flip cards on mobile**
  1. Ask for flashcards on mobile.
  2. Tap a card, press Got it, shuffle.
  - Expected: Card flips; progress and Review N still learning update.
- **Broken block**
  1. Use a quiz block with invalid JSON.
  - Expected: No interactive quiz; fallback text or notice.
- **Other apps**
  1. Ask for a quiz in CLI, VS Code and Chrome.
  - Expected: Text or code output only (not built).

**Where to look when it fails**

- Check that the artifact content contains a quiz or flashcards fence; hasStudyBlocks decides the study view (study-set.ts:292).
- Study sessions migration test: apps/web/db/neon/study-sessions-migration.test.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **Brief says missing, code says built on web and mobile; the brief needs correction.** Affects: Brief accuracy. Evidence: ArtifactPreview.tsx:1922; StudyDocumentView.tsx. Work needed: Update the brief and live-check.
- **Web shows study sets in the artifact panel, not inline in the chat bubble.** Affects: Web, desktop. Evidence: no quiz handling under apps/web/features/chat/components/messages. Work needed: Inline the study components in the chat message renderer.
- **No study views on CLI, VS Code, Chrome.** Affects: CLI, VS Code, Chrome. Evidence: no quiz code in those apps. Work needed: Add at least a readable text rendering of the set.
- **Progress is not saved.** Affects: Web, mobile. Evidence: component state only. Work needed: Decide whether to store scores.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- file:packages/ui/unified-chat/src/lib/study-set.ts

## Unknown

- Whether Study mode or Projects Studio is limited by plan.
- Which table holds study sessions (only a migration test was seen).
- Whether the web chat opens study answers as artifacts automatically.
- How mobile stores study artifacts offline.
- Whether desktop's Tauri code has its own study view (public desktop shows the hosted web app).
