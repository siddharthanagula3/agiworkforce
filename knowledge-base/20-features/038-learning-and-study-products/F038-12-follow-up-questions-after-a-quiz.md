---
id: "F038-12"
type: "feature"
title: "Follow-up questions after a quiz"
aliases: ["Source-based follow-up after completing a quiz (S38.35)", "Explain what I missed", "What should I study next?", "Ask whether my wording also counts", "Quiz follow-up", "buildQuizFollowUp"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.35"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "F038-07", "F038-08", "F038-11", "file:packages/ui/unified-chat/src/lib/study-set.ts", "table:study_sessions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-12 Follow-up questions after a quiz

After the last question of a quiz, the results screen offers 'Explain what I missed' (or 'What should I study next?') which sends a message to the chat with the score and each missed question. This works on web (panel view) and mobile. It asks the model to use the source material; it does not retrieve sources itself.

Area: [38. Learning and study products](README.md). Requirement items: [S38.35](../../10-requirements/capabilities/038-learning-and-study-products.md#s3835).

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

**What it does.** On the results screen the learner can send a prepared follow-up: the quiz title, score, and each missed question with the answer given, asking the model to explain using 'the source material we have been working from' and say where each answer comes from (packages/ui/unified-chat/src/lib/study-set.ts:329-355). A second button on a wrong short answer asks the model whether the wording also counts (study-set.ts:357-359).

**Why it exists.** A score alone does not teach. The brief says the learner can follow up with questions grounded in the source (S38.35).

**Who uses it.** Learners finishing a quiz, especially from a project with course notes.

**Problems it solves**

- The learner no longer has to retype missed questions.
- Strict short-answer grading can wrongly mark a valid answer; the learner can ask the model.

**Use cases**

- After 7 of 10, tap 'Explain what I missed' and get explanations with source pointers.
- After a perfect score tap 'What should I study next?'.
- On a marked-wrong short answer tap 'Ask whether my wording also counts'.

## 2. User experience

**Where to find it**

- Web: results card after 'See results' in a quiz shown in the artifact panel; no follow-up button when the quiz is shown inline in a message because onAsk is passed only for the panel variant (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1928).
- Desktop: hosted web app (doc: AGENTS.md section 5).
- Mobile: results in StudyQuizView (apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx:127-131) when the chat can send a follow-up (MessageContentRenderer.tsx:1461-1463 style prop onAsk from onFollowUp).
- CLI, VS Code, Chrome: no quiz viewer found.

**Before you start**

- A quiz block in the answer; the host must be able to send a message (onAsk provided) or no follow-up control shows (apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx:218).

**Screens and controls**

- Results: heading 'You scored N of M', missed questions with 'Answer:' and explanation, buttons 'Retake' and 'Explain what I missed' or 'What should I study next?' (QuizView.tsx:61-110).
- During a quiz: 'Check answer', 'Show a hint' / 'Show another hint', 'Next question', 'See results' (QuizView.tsx:208-277).
- Wrong short answer: 'Ask whether my wording also counts' (QuizView.tsx:243-251).

**Journey**

1. 1. Answer each question with 'Check answer'; see 'Correct.' or 'Not quite. The answer is ...' and the explanation.
2. 2. After the last question tap 'See results'.
3. 3. Read the score and missed list.
4. 4. Tap 'Explain what I missed'.
5. 5. The app sends the prepared message into the conversation; the model replies in chat.

**What the person sees and gets**

- Score text, missed list, and a new chat message with the learner's score and missed questions (study-set.ts:329-355).
- If sending is not possible, onAsk returns false; what the learner sees then was not checked: unknown (the web prop type is boolean, ArtifactPreview.tsx:274).

**Settings**

- none found in the code. 'Course material' on the Study page (a project) and attaching sources decide what material exists (StudyPage.tsx:245-267).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: quiz one question at a time, hints, grading of choice and short answers, explanations, results, retake, follow-up buttons (QuizView.tsx:28-283), tested (StudyDocument.test.tsx:76-108,205-215).
- Mobile: same flow with 'Explain what I missed', 'What should I study next?' and 'Ask whether my wording also counts' (StudyQuizView.tsx:127-131,303-309; StudyDocumentView.test.tsx:197-240).
- Prompt asks for the study session's sources: 'teach from that material and say where in it each point comes from' (study-session.ts:54) and the follow-up text asks for source pointers (study-set.ts:342-345).
- Quiz generation from project sources with explanations that name the source (apps/web/features/projects/components/ProjectStudio.tsx:79-85).

**Incomplete**

- Grounding is by prompt words only; the follow-up does not attach or retrieve any source text itself, so it depends on the project or earlier chat context the model already has (study-set.ts:342-345).
- On web the button shows only in the panel, not inline (ArtifactPreview.tsx:1928).
- Quiz results are not stored; a reload loses score (QuizView.tsx:29-31).

**Present but disconnected or switched off**

- Web inline quiz in a message has no follow-up (onAsk omitted for non-panel variant).

**Not available**

- Follow-up in the CLI, VS Code, Chrome (no quiz viewer).
- A stored 'quiz completed' event or a retrieval step that quotes sources.

## 4. Required behaviour

**Established requirements**

- After a quiz, the learner can follow up with questions grounded in the source material. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.35)
- Each answer comes with an explanation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.19)
- Each question gets feedback on whether and why the answer was right. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.20)
- Multiple-choice and short-answer questions are limited to 100 questions per quiz, 8 options and 2,000 characters per text. (source: packages/ui/unified-chat/src/lib/study-set.ts:41-44)

**Acceptance criteria**

1. Finishing a quiz shows 'You scored N of M'.
2. With misses, 'Explain what I missed' sends a message listing each missed question and the answer given.
3. With no misses, 'What should I study next?' sends a message asking for next topics.
4. The sent message asks for source pointers.
5. A wrong short answer shows 'Ask whether my wording also counts' and sends the recheck question.
6. If the surface cannot send, no follow-up buttons appear.
7. In a project with notes, the reply cites those notes (model behaviour; tester judges).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web inline quizzes should offer the same follow-up as the panel [inferred from mobile parity].
- A true grounded follow-up needs source retrieval attached to the turn [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Attach the project's source snippets for the missed questions to the follow-up turn.
- [proposed] Save quiz results so follow-ups and progress (F038-08) can use them.
- [proposed] Show the follow-up inline on web as well.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | QuizView | `apps/web/features/chat/components/artifacts/study/QuizView.tsx` | Web quiz with results and follow-up buttons |
| component | StudyDocument | `apps/web/features/chat/components/artifacts/study/StudyDocument.tsx` | Passes onAsk to QuizView (line 80) |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Supplies onAsk from onRequestEdits only in the panel (line 1928) |
| service | buildQuizFollowUp, shortAnswerRecheckPrompt, gradeShortAnswer | `packages/ui/unified-chat/src/lib/study-set.ts` | Builds the follow-up text and grades typed answers |
| component | StudyQuizView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx` | Mobile quiz and follow-up |
| component | StudyDocumentView | `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyDocumentView.tsx` | Passes onAsk to the mobile quiz |
| component | MessageContentRenderer | `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` | Maps onFollowUp to onAsk (line 1461-1463) |
| config | Study prompt practices | `apps/web/features/study/lib/study-session.ts` | Quiz format (line 52) and material grounding (line 54) |
| config | Project Studio quiz tile | `apps/web/features/projects/components/ProjectStudio.tsx` | Generates a quiz from project sources with source-naming explanations |
| config | Project Studio quiz output (shared) | `packages/contracts/cloud-contracts/src/project-studio.ts` | Chat-turn quiz prompt used by mobile notebook |
| service | chat completions request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Sends the follow-up as a normal turn with the study instruction |
| service | title counter stripping | `packages/platform/artifacts/src/artifact-derivation.ts` | withoutQuizCounter for quiz titles (line 351-354) |
| test | StudyDocument.test | `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx` | Web quiz, follow-up and grading |
| test | study-set.test | `packages/ui/unified-chat/src/lib/study-set.test.ts` | Follow-up text builders |
| test | StudyDocumentView.test (mobile) | `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx` | Mobile follow-up present or absent |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Learner answers; the answer is graded on the device (choice index or normalised text match). | device | QuizView.tsx:42-50; study-set.ts:226-244 |
| Results screen counts misses and builds the follow-up text. | device | QuizView.tsx:61-62; study-set.ts:329-355 |
| Tap sends the text into the conversation through onAsk. | device | QuizView.tsx:97-107; ArtifactPreview.tsx:1928 |
| The chat turn runs on the server, with the study instruction and project context if any. | our servers | request-processor.ts:3802-3830,3926 |
| The model replies using whatever sources are in context. | outside service | [inferred] model provider per SYS-chat-turn-pipeline |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Answers, score, hints used | Component state only | No | Lost on close or reload; Retake clears it (QuizView.tsx:55-59) |
| Follow-up message and reply | Chat history | With the conversation | As chat history |

**Models and providers.** Grading uses no model. The explanation and any source pointing come from whichever model answers the turn; no model is named in the code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Quiz grading needs none beyond viewing; the follow-up is a chat message so needs a signed-in chat. |
| Permissions | none found in the code beyond chat access |
| Subscription | No quiz-specific rule found. The follow-up is a normal metered chat turn [inferred]. |
| Limits and metering | 100 questions, 8 options, 5 hints, 10 accepted answers per question, 2,000 characters per text (study-set.ts:41-46). |
| Feature flags | none found in the code |
| Model compatibility | Any chat model [inferred]; source grounding quality varies by model. |
| Provider restrictions | none found in the code |
| Local mode | Quiz play and grading run on the device. The follow-up works only if the host chat can send to a model; with a local model the reply would not see project sources unless the context is present: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Host cannot send | Follow-up buttons not shown | QuizView.tsx:97; StudyDocumentView.test.tsx:218 |
| Nothing missed | 'Every answer was right.' and button 'What should I study next?' | QuizView.tsx:89-105 |
| Unanswered questions | Counted as not correct on results; follow-up lists only submitted wrong ones | QuizView.tsx:62; study-set.ts:330-333 |
| Retake | Clears all answers and hints | QuizView.tsx:55-59 |
| Accessibility | Fieldset legend, radio inputs, status region for feedback, 'Hint N' for screen readers, 44px targets | QuizView.tsx:131-136,152-160,202,222 |
| Quiz still streaming | Mobile shows 'Writing the quiz' | StudyDocumentView.tsx:50-58 |
| Offline or sending fails | not handled in the code read | onAsk returns a boolean only (ArtifactPreview.tsx:274) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/study/StudyDocument.test.tsx`: Quiz run with hints and explanations, short-answer grading, one position counter, 'What should I study next' after a perfect score
- `packages/ui/unified-chat/src/lib/study-set.test.ts`: Follow-up lists missed questions with the answer given; next-step text; recheck text
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyDocumentView.test.tsx`: Mobile hints, grading, results, follow-up and no follow-up when it cannot send
- `apps/mobile/src/features/chat/components/artifact-viewers/__tests__/StudyForms.test.tsx`: Quiz inline without source or answer
- `apps/web/features/study/components/StudyPage.material.test.tsx`: Course material choice on the Study page (details not read)

**Test scenarios**

- **Miss and follow up**
  1. Take a 3-question quiz in the web panel
  2. Answer one wrong
  3. See results
  4. Tap 'Explain what I missed'
  - Expected: A message with the score and the missed question and your answer is sent; the reply explains.
- **Perfect score**
  1. Answer all right
  2. Tap 'What should I study next?'
  - Expected: Message asks what to study from the same material.
- **Grounded in project**
  1. Open a project with notes
  2. Make a quiz from Project Studio
  3. Miss one
  4. Follow up
  - Expected: Reply names where in the notes the answer is (tester judges).
- **Inline on web**
  1. Take a quiz shown inline in a message
  - Expected: Observe whether follow-up buttons appear (code says not).
- **Mobile**
  1. Take a quiz on the phone
  2. Finish
  - Expected: Follow-up button sends into the same chat.
- **Short-answer wording**
  1. Type a valid synonym
  2. Tap 'Ask whether my wording also counts'
  - Expected: A recheck question goes to the chat.

**Where to look when it fails**

- Message text beginning 'I finished the quiz'
- Absence of buttons: check that onAsk/onFollowUp is wired
- Chat turn errors in the normal chat pipeline logs

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Follow-up is not truly source-grounded** Affects: Learners on all apps. Evidence: study-set.ts:342-345 asks in words only; no retrieval attached. Work needed: Attach source passages or citations to the turn
- **No follow-up for inline quizzes on web** Affects: Web and desktop learners. Evidence: ArtifactPreview.tsx:1928 limits onAsk to the panel. Work needed: Pass onAsk for inline too
- **Quiz results not stored** Affects: All learners. Evidence: QuizView.tsx:29-31. Work needed: Store results to support progress and later follow-up
- **No quiz viewer on CLI, VS Code, Chrome** Affects: Those apps. Evidence: No study-set use outside web and mobile. Work needed: Viewer or text fallback
- **Area brief says missing** Affects: Planning. Evidence: S38.35 versus the code. Work needed: Update ledger to partial
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- F038-07
- F038-08
- F038-11
- file:packages/ui/unified-chat/src/lib/study-set.ts
- table:study_sessions

## Unknown

- What the learner sees when onAsk returns false.
- Whether the mobile project-notebook quiz prompt produces a quiz block (the shared prompt asks one question at a time in chat, project-studio.ts:90-93).
- Whether a local model on mobile or desktop sees project sources in a follow-up.
- Contents of StudyPage.material.test.tsx.
