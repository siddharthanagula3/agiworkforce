---
id: "F038-05"
type: "feature"
title: "Practice questions and answer feedback"
aliases: ["Practice questions", "Quiz", "Answer feedback", "Per-question feedback", "Answer explanations", "Check answer", "S38.14, S38.19, S38.20"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.14", "S38.19", "S38.20"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "F038-04", "F038-06", "file:packages/ui/unified-chat/src/lib/study-set.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-05 Practice questions and answer feedback

Study mode asks the model to write practice questions as an interactive quiz block. The quiz viewer on web and mobile shows one question at a time, grades the answer in code, shows an explanation, offers progressive hints, a score and a follow-up question to the tutor. The written feedback in chat comes from the model.

Area: [38. Learning and study products](README.md). Requirement items: [S38.14](../../10-requirements/capabilities/038-learning-and-study-products.md#s3814), [S38.19](../../10-requirements/capabilities/038-learning-and-study-products.md#s3819), [S38.20](../../10-requirements/capabilities/038-learning-and-study-products.md#s3820).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** The instruction tells the model to write a markdown artifact holding a ~~~quiz JSON block (study-session.ts:43). The viewer parses it (packages/ui/unified-chat/src/lib/study-set.ts:100-112) and shows 'Question n of N', 'Check answer', 'Correct.' or 'Not quite. The answer is ...', and the explanation (apps/web/features/chat/components/artifacts/study/QuizView.tsx:119-281).

**Why it exists.** Practice with instant feedback is the core of studying; a viewer gives it without waiting for the model each time.

**Who uses it.** Learners in study chats on web, Electron desktop and mobile Cloud; any chat where a quiz block appears.

**Problems it solves**

- Practice questions as plain text with no marking
- Waiting for the model to grade each answer

**Use cases**

- Ask 'quiz me on the Krebs cycle' and answer 10 questions with feedback.
- Get the wrong ones explained by the tutor from the results screen.
- Disagree with a short-answer mark and ask whether the wording also counts.

## 2. User experience

**Where to find it**

- Web: quiz appears in the artifact panel for a study document (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1916-1930).
- Mobile: inside message content and the full-screen artifact viewer (apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:63; ArtifactFullScreen.tsx:1702).
- Desktop: the web viewer via hosted app [inferred].
- CLI, VS Code, Chrome: no quiz viewer found; the model may still ask questions in text.

**Before you start**

- A reply containing a quiz block (asked for by the study instruction or by the user).

**Screens and controls**

- Radio options or a 'Type your answer' box; 'Check answer'; 'Show a hint' / 'Show another hint (n/m)'; 'Next question'; 'See results'; 'Retake'; 'Explain what I missed' / 'What should I study next?'; 'Ask whether my wording also counts'; 'Print' (QuizView.tsx; StudyDocument.tsx:113-124).

**Journey**

1. In a study chat ask for practice questions.
2. Open the quiz artifact.
3. Pick or type an answer, optionally show hints.
4. Press Check answer; read Correct/Not quite and the explanation.
5. Press Next question until See results.
6. Read 'You scored X of N'; press 'Explain what I missed' to send the missed questions to the tutor.

**What the person sees and gets**

- Per-question: green or red state, correct answer text, explanation (QuizView.tsx:221-242).
- Totals: 'n correct so far' and the results screen listing missed questions with answers and explanations (QuizView.tsx:61-110).
- Tutor follow-up as a normal chat message.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Instruction asks for a quiz block with multiple_choice and short_answer questions, answer, explanation and hints (study-session.ts:43).
- Parser accepts multiple choice (2-8 options) and short answer, up to 100 questions (study-set.ts:41-42,64-112).
- Web viewer: one question at a time, hints, grading, explanation, results, retake, follow-up (QuizView.tsx).
- Short-answer grading in code: lower case, accents stripped, punctuation and articles ignored, matched against answer and accept list (study-set.ts:226-244).
- Mobile viewer with the same flow (apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx:42-331).
- Follow-up prompts are built in code (study-set.ts:329-359) and sent via onAsk, on web only from the artifact panel variant (ArtifactPreview.tsx:1927).

**Incomplete**

- Scores and answers are not saved: state is in React state only; Retake resets it (QuizView.tsx:29-59).
- If the model writes invalid JSON the viewer says 'This quiz could not be read.' (StudyDocument.tsx:50-56).
- Feedback beyond the written explanation comes from the model when asked.
- Outside the artifact panel on web, a quiz in a plain message: not traced.

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI, VS Code, Chrome: no viewer found.
- Saved results or history: none found.

## 4. Required behaviour

**Established requirements**

- The learner gets practice questions on the topic (S38.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.14)
- Each answer comes with an explanation (S38.19). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.19)
- Each question gets feedback on whether and why the answer was right (S38.20). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.20)

**Acceptance criteria**

1. A study chat can produce a quiz that opens as an interactive quiz.
2. Check answer is disabled until an option is chosen or text typed.
3. A correct answer shows 'Correct.'; a wrong one shows 'Not quite. The answer is <x>.'
4. The explanation shows when the quiz has one.
5. Hints appear one at a time and disappear after checking.
6. Results show score and missed questions.
7. 'Explain what I missed' sends a chat message listing missed questions.
8. Invalid quiz JSON shows 'could not be read' rather than crashing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Quizzes made without study mode use the same viewer [inferred from the parser being content-based].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Save quiz results so Progress can use them (S38.27, S38.28).
- [proposed] Add a quiz viewer to VS Code and CLI or state they are text only.
- [proposed] Guard model JSON with a repair step.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | QuizView (web) | `apps/web/features/chat/components/artifacts/study/QuizView.tsx` | Interactive quiz. |
| component | StudyDocument (web) | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Splits a document into markdown, quiz and card segments. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Chooses StudyDocument when study blocks exist (line 1916). |
| other | study-set | `packages/ui/unified-chat/src/lib/study-set.ts` | Parse, grade, follow-up prompts, block segmentation. |
| component | StudyQuizView (mobile) | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx` | Mobile quiz. |
| component | StudyDocumentView (mobile) | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyDocumentView.tsx` | Mobile document with quiz and cards. |
| other | studyContent | `apps/mobile/src/features/chat/components/artifact-viewers/study/studyContent.ts` | Detects study fences and artifacts. |
| component | MessageContentRenderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Renders study fences in messages. |
| component | ArtifactFullScreen | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Full-screen study viewer. |
| other | TEACHING_PRACTICES quiz line | `apps/web/features/study/lib/study-session.ts` | Tells the model the quiz format. |
| other | studyPrint | `apps/web/features/chat/components/artifacts/study/study-print.ts` | Print sheet with answer key. |
| test | StudyDocument.test | `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx` | Quiz flow tests. |
| test | study-set.test | `packages/ui/unified-chat/src/lib/study-set.test.ts` | Parser and prompt tests. |
| test | StudyDocumentView.test / StudyForms.test | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx` | Mobile viewer tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Learner asks for questions; the model, under the study instruction, writes a markdown artifact with a quiz block. | outside service | study-session.ts:43 |
| The app detects study blocks and renders the viewer. | device | ArtifactPreview.tsx:1916; studyContent.ts:25-39 |
| Answers are graded in the viewer; nothing is sent to a server. | device | QuizView.tsx:42-50; study-set.ts:238-244 |
| Pressing a follow-up button sends a prompt to the tutor as a new chat message. | our servers | QuizView.tsx:101; ArtifactPreview.tsx:1927 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Quiz JSON | Chat message / artifact content | With the chat | With the chat or artifact. |
| Answers, score, hints used | Component state in the device only | No | Lost on leaving or Retake. |

**Models and providers.** The model writes the questions, so quality and JSON validity depend on the model. Grading and feedback display need no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing a quiz in a chat needs the chat; grading runs on the device. |
| Permissions | Same as chat. |
| Subscription | none found in the code for the viewer; creating the quiz is an ordinary chat turn. |
| Limits and metering | Up to 100 questions, 8 options, 2000 characters per text (study-set.ts:41-46). |
| Feature flags | none found in the code. |
| Model compatibility | Any model that can output the JSON format [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Grading works offline once a quiz exists. Creating one in mobile Local mode is a normal chat, not Study mode (Study refused in Local mode). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unreadable quiz | 'This quiz could not be read.' | StudyDocument.tsx:50-56 |
| No hints | Hint button hidden. | QuizView.tsx:190 |
| Blank answer | Check answer disabled. | QuizView.tsx:52-53 |
| All correct | 'Every answer was right.' and 'What should I study next?' | QuizView.tsx:90,105 |
| Accessibility | Fieldset legend, sr-only hint labels, icons with aria-label, role=status feedback. | QuizView.tsx:132-170,202,222 |
| Offline/timeout/retry | not handled in the code for the viewer (local only); follow-up send uses normal chat. | QuizView.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx`: Quiz one at a time, hints, feedback, counter, grading, read-only.
- `packages/ui/unified-chat/src/lib/study-set.test.ts`: Follow-up prompts, titles, block segmentation.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx`: Mobile study document.
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyForms.test.tsx`: Mobile quiz form (file exists; contents not read).

**Test scenarios**

- **Right and wrong**
  1. Open a quiz.
  2. Pick the correct option, check.
  3. Next; pick wrong, check.
  - Expected: Correct. then Not quite. The answer is ... with explanation.
- **Short answer wording**
  1. Type the answer with different capitals and a leading 'the'.
  - Expected: Marked correct.
- **Hints**
  1. Use 'Show a hint' until exhausted.
  - Expected: Count n/m rises; button disappears at m.
- **Follow-up**
  1. Finish with a miss.
  2. Press Explain what I missed.
  - Expected: A chat message listing the missed question and what was answered.
- **Bad JSON**
  1. Have the model emit broken quiz JSON.
  - Expected: 'could not be read' message.

**Where to look when it fails**

- parseQuiz returns null for bad JSON.
- Check the block fence is ~~~quiz or ```quiz.
- Mobile: viewerKind returns 'study' (viewerKind.ts:40).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Brief marks S38.14, S38.19, S38.20 missing on all apps; web and mobile viewers exist.** Affects: Planners. Evidence: QuizView.tsx; StudyQuizView.tsx. Work needed: Update brief; verify on devices.
- **Results are not saved.** Affects: All. Evidence: QuizView.tsx:29-59. Work needed: Persist results.
- **No quiz viewer on CLI, VS Code, Chrome.** Affects: those apps. Evidence: no files found. Work needed: Decide scope.
- **No grading for free-text beyond string match; meaning-based checks need the model button.** Affects: Learners. Evidence: study-set.ts:238-244. Work needed: Optional model grading.
- **Quiz in desktop Tauri not present.** Affects: Tauri build. Evidence: no study files in apps/desktop/src. Work needed: None if Electron is the public desktop.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- F038-04
- F038-06
- file:packages/ui/unified-chat/src/lib/study-set.ts

## Unknown

- Whether quizzes render inline in web message bubbles, not only in the artifact panel.
- What StudyForms.test.tsx asserts (not read).
- How often models produce valid quiz JSON.
- Whether the Electron desktop uses the same viewer.
