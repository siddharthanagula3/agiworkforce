---
id: "F038-06"
type: "feature"
title: "Quiz question types and quiz editing"
aliases: ["Quiz question types", "Quiz editor", "Edit quiz", "multiple choice", "short answer", "S38.15-S38.18, S38.21"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.15", "S38.16", "S38.17", "S38.18", "S38.21"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "file:packages/ui/unified-chat/src/lib/study-set.ts", "F038-05", "F038-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-06 Quiz question types and quiz editing

Quizzes support two question types: multiple choice (2 to 8 options, one correct) and short answer (typed, graded against an answer and accepted variants). On web the learner can edit a quiz in place and save it back into the chat artifact. Multiple-select and fill-in-the-blank are not supported. Mobile can answer but not edit.

Area: [38. Learning and study products](README.md). Requirement items: [S38.15](../../10-requirements/capabilities/038-learning-and-study-products.md#s3815), [S38.16](../../10-requirements/capabilities/038-learning-and-study-products.md#s3816), [S38.17](../../10-requirements/capabilities/038-learning-and-study-products.md#s3817), [S38.18](../../10-requirements/capabilities/038-learning-and-study-products.md#s3818), [S38.21](../../10-requirements/capabilities/038-learning-and-study-products.md#s3821).

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

**What it does.** Defines the quiz data (kind multiple_choice or short_answer) and offers an editor on web to change title, question text, options, correct option, answer, explanation, add or remove questions (study-set.ts:6-28; apps/web/features/chat/components/artifacts/study/StudySetEditors.tsx:94-278).

**Why it exists.** Models write imperfect questions; learners and teachers need to fix or extend them and keep a trusted set.

**Who uses it.** Learners and teachers on web and Electron desktop (editing); web and mobile learners (answering).

**Problems it solves**

- Wrong answer keys
- Missing questions
- Questions the learner wants reworded

**Use cases**

- Remove a bad question and add a short-answer one.
- Fix the correct option marked wrongly by the model.
- Answer a mixed quiz with choices and typed answers.

## 2. User experience

**Where to find it**

- Web: quiz artifact panel, button 'Edit quiz' beside 'Print' (StudyDocument.tsx:99-124); editor titled 'Edit quiz' (StudySetEditors.tsx:113).
- Mobile: answering only; no edit control found (StudyDocumentView.tsx has no edit handler).
- Desktop: web via hosted app [inferred].
- CLI, VS Code, Chrome: none.

**Before you start**

- A readable quiz; editing needs an editable (not read-only) artifact and a quiz the editor can hold without loss (StudyDocument.tsx:57,101).

**Screens and controls**

- Editor: 'Quiz title', per-question 'Question n · Multiple choice/Short answer', 'Remove question n', option text boxes, 'Option n is correct', 'Add option', 'Correct answer' for short answer, 'Explanation', buttons '+ Multiple choice' and '+ Short answer', 'Cancel', 'Save' (StudySetEditors.tsx).

**Journey**

1. Open a quiz in the artifact panel.
2. Press 'Edit quiz'.
3. Change text, options, mark the correct option, add or remove questions.
4. Press Save; the quiz block in the document is rewritten.
5. Quiz view reloads with the new questions.

**What the person sees and gets**

- Status line: 'Every question needs its text, filled-in options and a correct answer before it can be saved. A quiz holds up to 100 questions and each text up to 2000 characters.' while incomplete (StudySetEditors.tsx:271-276).
- If the quiz is too large to edit safely: 'Part of this quiz is beyond what can be shown or edited here, so editing is off to keep the original intact.' (StudyDocument.tsx:93-98).

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Multiple choice: needs 2+ non-blank options and a valid answer index, up to 8 options (study-set.ts:71-87).
- Short answer: answer required, up to 10 accepted variants, forgiving match (study-set.ts:88-97,238-244).
- Both types answered in web and mobile viewers.
- Web editor with add and remove of questions and options, save disabled until complete (StudySetEditors.tsx:271-276).
- Save rewrites the block in the document via replaceStudyBlock and serializeQuiz (StudyDocument.tsx:59-69; study-set.ts:193-220,296-314).
- Editing is refused when parsing would lose data (studySourceIsLossless, study-set.ts:170-191).
- Print with answer key (study-print.ts).

**Incomplete**

- No way to change a question's type in the editor; the person adds a new one of either type (StudySetEditors.tsx:240-262).
- Hints are not editable in the editor [inferred: no hints field seen in grep of editor labels].

**Present but disconnected or switched off**

- nothing found

**Not available**

- Multiple-select (S38.16) and fill-in-the-blank (S38.18): no type in study-set.ts:6-24.
- Mobile editing: none found.
- CLI, VS Code, Chrome: none.

## 4. Required behaviour

**Established requirements**

- Multiple-choice questions can be answered by choosing an option (S38.15). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.15)
- Multiple-select questions accept several options (S38.16). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.16)
- Short-answer questions accept typed answers and are graded (S38.17). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.17)
- Fill-in-the-blank questions are offered and graded (S38.18). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.18)
- The user can edit a generated quiz (S38.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.21)
- An edit must not silently lose original content. (source: apps/web/features/chat/components/artifacts/study/StudyDocument.tsx:93-98)

**Acceptance criteria**

1. A multiple-choice question marks only the chosen option correct or wrong after checking.
2. A short-answer answer differing by capitals, accents or 'the' is accepted.
3. Edit quiz opens an editor with the same questions.
4. Save is disabled while a question lacks text, options or correct answer.
5. After Save the quiz shows the edited questions and the chat artifact content changes.
6. Adding questions stops at 100.
7. A quiz that cannot be held losslessly shows no Edit button and a notice.
8. Multiple-select and fill-in-the-blank questions are absent (current limit).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Fill-in-the-blank can be mimicked as short answer today [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add multiple_select and fill_in_blank kinds to study-set.ts, both viewers and the editor.
- [proposed] Add mobile editing.
- [proposed] Allow hint editing.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | study-set types and parser | `packages/ui/unified-chat/src/lib/study-set.ts` | Question kinds, limits, parse, serialize, lossless check, grade. |
| component | QuizEditor | `apps/web/features/chat/components/artifacts/study/StudySetEditors.tsx` | Web quiz editor. |
| component | StudyDocument | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Edit button, save into document. |
| component | ArtifactPreview save | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Passes editable and saveArtifactContent (lines 1923-1928). |
| component | QuizView | `apps/web/features/chat/components/artifacts/study/QuizView.tsx` | Answering both types. |
| component | StudyQuizView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx` | Mobile answering. |
| other | studyContent | `apps/mobile/src/features/chat/components/artifact-viewers/study/studyContent.ts` | Mobile detection and summary. |
| other | study-print | `apps/web/features/chat/components/artifacts/study/study-print.ts` | Printable quiz and key. |
| other | Quiz format instruction | `apps/web/features/study/lib/study-session.ts` | Tells the model to use multiple_choice and short_answer. |
| test | StudyDocument.test | `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx` | Edit, round trip, limits. |
| test | study-set.test | `packages/ui/unified-chat/src/lib/study-set.test.ts` | Parser tests. |
| test | mobile StudyDocumentView.test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx` | Mobile document. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Quiz JSON in the artifact is parsed into typed questions. | device | StudyDocument.tsx:48; study-set.ts:100-112 |
| Edit opens the editor on a copy of the quiz. | device | StudySetEditors.tsx:94-111 |
| Save serializes the quiz and replaces the block in the artifact text; the artifact save goes through the chat's normal artifact save. | device and our servers | StudyDocument.tsx:59-69; ArtifactPreview.tsx:1923-1928 (server save path not traced) |
| Answers are graded in the viewer. | device | QuizView.tsx:42-50 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Quiz JSON (title, questions) | Artifact or message content in the chat | With the chat | With the chat; earlier version handling not traced. |

**Models and providers.** No model is used for editing or grading. The 'Ask whether my wording also counts' button sends a question to the chat model (study-set.ts:357-359).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Editing saves into the signed-in chat artifact. |
| Permissions | Editing is on only when the artifact is editable; a read-only version hides it (StudyDocument.test.tsx 'hides editing on a read-only version'). |
| Subscription | none found in the code. |
| Limits and metering | 100 questions, 8 options, 10 accepted answers, 5 hints, 2000 characters per text (study-set.ts:41-46). |
| Feature flags | none found in the code. |
| Model compatibility | Any model [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Parsing, answering and editing run on the device; saving relies on how the chat stores artifacts (not traced for Local mode). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Lossy quiz | Edit hidden; notice explains. | StudyDocument.tsx:57,93-101 |
| Incomplete edit | Save disabled with a status message. | StudySetEditors.tsx:271-276 |
| Question limit | Add buttons disabled at 100. | StudySetEditors.tsx:240-262 |
| Blank option in numeric answer | Answer index read against original positions; question dropped if it points at a blank. | study-set.ts:71-86 |
| Cancel | Cancel closes the editor without saving. | StudyDocument.tsx:76 |
| Save failure or conflict | not handled in the code here (delegated to saveArtifactContent, not read). | ArtifactPreview.tsx:1925 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx`: Editing a quiz and saving, round trips, option removal keeps the answer, limits, read-only.
- `packages/ui/unified-chat/src/lib/study-set.test.ts`: Parsing, serialization helpers, follow-ups.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx`: Mobile rendering.

**Test scenarios**

- **Edit and save**
  1. Open a quiz on web.
  2. Edit quiz, change the correct option, Save.
  - Expected: Quiz view marks the new option correct.
- **Incomplete**
  1. Clear an option text.
  - Expected: Save disabled with the status message.
- **Short answer variants**
  1. Add a short-answer question with answer 'mitochondria'.
  2. Answer 'The Mitochondria'.
  - Expected: Correct.
- **Unsupported type**
  1. Ask the model for a multiple-select quiz.
  - Expected: Question is shown as multiple choice or dropped (current limit).
- **Mobile edit**
  1. Open a quiz on mobile.
  - Expected: No edit control (confirms gap).

**Where to look when it fails**

- parseQuiz returning null.
- studySourceIsLossless false means Edit is hidden.
- Artifact save errors in ArtifactPreview saveArtifactContent.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No multiple-select or fill-in-the-blank.** Affects: All apps. Evidence: study-set.ts:6-24. Work needed: New kinds, grading, editor, instruction.
- **No editing on mobile.** Affects: Mobile. Evidence: StudyDocumentView.tsx. Work needed: Mobile editor.
- **Brief marks S38.15, S38.17, S38.21 missing everywhere; web built, mobile answer-only.** Affects: Planners. Evidence: StudySetEditors.tsx. Work needed: Update brief.
- **Hint editing not available in the editor.** Affects: Web. Evidence: editor labels list no hints field. Work needed: Add field.
- **Short-answer grading is string match only.** Affects: All. Evidence: study-set.ts:238. Work needed: Optional model check.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- file:packages/ui/unified-chat/src/lib/study-set.ts
- F038-05
- F038-04

## Unknown

- How saveArtifactContent stores versions and handles conflicts.
- What StudyForms.test.tsx covers.
- Whether mobile has any quiz edit path outside the files read.
- Whether Electron desktop allows editing.
