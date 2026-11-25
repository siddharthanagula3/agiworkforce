---
id: "F038-04"
type: "feature"
title: "Guided teaching style"
aliases: ["Study instruction", "teaching style", "tutor prompt", "Socratic flow", "Learn it / Practise it / Revise it", "S38.08-S38.13"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.08", "S38.09", "S38.10", "S38.11", "S38.12", "S38.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "table:study_sessions", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "F038-01", "F038-05", "F038-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-04 Guided teaching style

The tutor's behaviour is text added to the model's system prompt: a way of working (learn, practise, revise), a level, a rule not to give an answer before the learner tries, and teaching practices (outline, one hint at a time, worked examples, visuals, interactive explanations). It is a prompt, not a lesson engine. CLI and VS Code use a shorter style text.

Area: [38. Learning and study products](README.md). Requirement items: [S38.08](../../10-requirements/capabilities/038-learning-and-study-products.md#s3808), [S38.09](../../10-requirements/capabilities/038-learning-and-study-products.md#s3809), [S38.10](../../10-requirements/capabilities/038-learning-and-study-products.md#s3810), [S38.11](../../10-requirements/capabilities/038-learning-and-study-products.md#s3811), [S38.12](../../10-requirements/capabilities/038-learning-and-study-products.md#s3812), [S38.13](../../10-requirements/capabilities/038-learning-and-study-products.md#s3813).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** composeStudyInstruction joins: the subject, a mode paragraph, a level paragraph, the no-answer-before-attempt rule and a block of teaching practices (apps/web/features/study/lib/study-session.ts:19-79). The chat service adds it to every turn while the session is open.

**Why it exists.** To make the tutor guide with questions, hints and examples instead of dumping answers, without building a separate lesson system.

**Who uses it.** Learners in a web, desktop or mobile Cloud study chat; CLI and VS Code users who choose the study output style.

**Problems it solves**

- Answers given before the learner tries
- Whole subject dumped at once
- No hints
- No visual or interactive explanation

**Use cases**

- Learn it: one idea, one check question, then move on.
- Practise it: one question at a time, says exactly where a wrong answer went wrong.
- Revise it: asks what the learner remembers first.
- Stuck learner gets hints, each more specific.

## 2. User experience

**Where to find it**

- Web, Electron desktop, mobile Cloud: choose the way of working and level on the Study screen (F038-01); the style applies inside the chat.
- CLI: output style 'study' (description 'Teaches step by step with questions instead of finished answers.') (output_styles.rs:55-60).
- VS Code: output style 'Study' (outputStyles.ts:21).
- Chrome: none.

**Before you start**

- An open study session (web, mobile) or a selected output style (CLI, VS Code).

**Screens and controls**

- Mode radio buttons and level menu on the start screen; the 'Leave study mode' control in chat stops the instruction (StudyModeIndicator.tsx).

**Journey**

1. Start a session with a mode and level.
2. Chat: the tutor opens with a numbered outline and says which step it is on.
3. Answer questions in the message box; ask for a hint when stuck.
4. The tutor shows a worked example then gives a similar problem, may draw a diagram or build an HTML explanation, and may ask you to explain back in your words.
5. Leave study mode to get ordinary replies.

**What the person sees and gets**

- Chat replies in the taught style; quizzes and flashcards as artifacts (see F038-05, F038-06). The learner never sees the instruction text; the page keeps it off screen (test: StudyPage.test.tsx 'keeps the tutoring instruction off the screen').

**Settings**

- Mode and level per session; none for the strength of the style.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mode text: learn is one idea at a time with a check question; practice asks one question at a time and says where a wrong answer went wrong; review starts from what the learner remembers (study-session.ts:19-26).
- Level text for beginner, intermediate, expert (study-session.ts:28-33).
- Rule: do not give the answer until the user has attempted it (study-session.ts:35-36).
- Practices: numbered outline; one hint at a time, each more specific; worked example then similar problem; diagram or HTML interactive explanation; quiz and flashcards formats; teach from attached material; ask for explain-back typed or spoken with feedback; language exercises (study-session.ts:38-47).
- The text reaches the model as a developer-layer block (request-processor.ts:2121-2127).
- Study text is ranked so a current user request and account instructions are resolved by the shared precedence helper in tests; production path uses layers, not composeStudyPrompt (study-session.test.ts:75-125).
- CLI and VS Code load study.md, a shorter text (study.md).

**Incomplete**

- No lesson list, step tracker or hint counter is stored; all behaviour depends on the model following text (study-session.ts; no table beyond study_sessions).
- Spoken explanation is only 'typed or spoken with the microphone' in the instruction; capturing speech is Voice, not Study [inferred].
- CLI and VS Code text lacks the hint-order, outline and quiz format rules (study.md).

**Present but disconnected or switched off**

- composeStudyPrompt (precedence-aware) is unused in production code (grep).

**Not available**

- Chrome: none.
- Own-key path: unknown.
- Mobile Local mode: not offered.

## 4. Required behaviour

**Established requirements**

- Learning proceeds through a sequence of lessons or steps (S38.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.08)
- The tutor guides with questions instead of giving the answer (S38.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.09)
- Hints are revealed progressively when stuck (S38.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.10)
- The tutor shows worked examples (S38.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.11)
- Explanations are interactive (S38.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.12)
- Concepts are shown with visual demonstrations (S38.13). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.13)
- Instruction precedence is decided in one shared place. (source: apps/web/features/study/lib/study-session.ts:84-90 comment)

**Acceptance criteria**

1. In Learn it the first reply introduces one idea and asks one question.
2. In Practise it the tutor asks one question and waits before judging.
3. Asking the answer straight away still gets an attempt request first.
4. A stuck learner gets a first hint, then a more specific one.
5. A method is followed by a worked example and a similar task.
6. A visual topic yields a diagram or an HTML artifact with controls.
7. After Leave study mode the replies are no longer tutored.
8. The instruction text contains topic, mode, level, rule and practices (unit test).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Model compliance varies by model, so criteria need transcript checks [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Track step and hint counts so the outline is real progress.
- [proposed] Share one text between web and CLI/VS Code so they cannot drift.
- [proposed] Use composeStudyPrompt in production or delete it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | composeStudyInstruction | `apps/web/features/study/lib/study-session.ts` | Builds the full instruction. |
| other | MODE_INSTRUCTIONS / LEVEL_INSTRUCTIONS / TEACHING_PRACTICES | `apps/web/features/study/lib/study-session.ts` | The actual teaching rules. |
| service | readActiveStudyInstruction | `apps/web/features/study/server/study-session-store.ts` | Reads open session and returns instruction or null. |
| service | composeManagedSystemPreamble | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Orders the study block with system, project and personal blocks. |
| other | orderInstructionBlocks / precedence | `apps/web/lib/context/precedence.ts` | Shared instruction layer ordering and conflict resolver. |
| other | study.md | `crates/agiworkforce-agent-core/assets/output_styles/study.md` | CLI and VS Code study style text. |
| config | CLI built-in styles | `apps/cli/src/output_styles.rs` | Registers 'study'. |
| config | VS Code styles | `apps/extension-vscode/src/features/sidebar-webview/outputStyles.ts` | Registers 'Study' and sends instructions. |
| component | StudyModeIndicator | `apps/web/features/study/components/StudyModeIndicator.tsx` | Turns the instruction off or on. |
| component | StudyModeBanner | `apps/mobile/src/features/study/StudyModeBanner.tsx` | Same on mobile. |
| other | Study types and labels | `packages/contracts/types/src/study.ts` | Mode and level vocabulary. |
| test | study-session.test | `apps/web/features/study/lib/study-session.test.ts` | Instruction content tests. |
| test | StudyPage.material.test | `apps/web/features/study/components/StudyPage.material.test.tsx` | Checks the teaching practices appear in the text. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server reads topic, mode, level of the open session for the conversation. | our servers | study-session-store.ts:86-101 |
| It builds the instruction string. | our servers | study-session.ts:73-79 |
| It is placed as a 'developer' layer block ahead of project and personal blocks in the stable part of the system prompt. | our servers | request-processor.ts:2121-2127 |
| The model replies in the taught style. | outside service | provider not traced |
| CLI and VS Code: the style text is added to the prompt on the device before sending. | device | output_styles.rs:55-60; outputStyles.ts:127-133 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Instruction text | Not stored; rebuilt each turn from study_sessions | n/a | n/a |
| Mode, level, topic | table:study_sessions | Server | With the conversation. |

**Models and providers.** No model is named. Provider-neutral text; effect varies by model. Being in the stable block helps prompt caching [inferred from the cache boundary code at request-processor.ts:2113-2131].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for web and mobile. |
| Permissions | Session owner only. |
| Subscription | none found in the code for the instruction; longer prompts add input tokens to normal usage [inferred]. |
| Limits and metering | none found in the code specific to the teaching text. |
| Feature flags | none found in the code. |
| Model compatibility | Text only; all models [inferred]. Interactive HTML explanations need an HTML artifact path in the chat. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode cannot start a study session. CLI/VS Code style is device-side text and works with whichever provider the tool uses [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Session ended | No instruction added. | study-session-store.ts:94-96 (ended_at is null) |
| Invalid stored values | Returns null, no instruction. | study-session-store.ts:98-99 |
| Learner asks for the answer | Left to the model; rule says not before an attempt. | study-session.ts:35-36 |
| Account instruction conflicts | In production, layered ordering; conflict helper tested only. | request-processor.ts:2121-2127; study-session.test.ts:87-110 |
| Teaching failure states (no progress, wrong answers recorded) | not handled in the code. | no step or hint store |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/study/lib/study-session.test.ts`: Instruction content, hold-back rule, practice behaviour, precedence helper.
- `apps/web/features/study/components/StudyPage.material.test.tsx`: Presence of hints, worked example, visuals, quiz, flashcards, outline, explain-back, language lines.
- `apps/web/features/study/server/study-session-store.test.ts`: Session reading used for the instruction (store scoping).
- `apps/cli/src/output_styles.rs`: Study style listed in built-ins.

**Test scenarios**

- **Learn it**
  1. Start Learn it, 'binary search', New to it.
  2. Read the first reply.
  - Expected: Numbered outline; one idea; one check question.
- **Hint ladder**
  1. Practise it; answer wrongly twice; type 'I am stuck'.
  - Expected: One hint, then a more specific one before the answer.
- **Worked example**
  1. Ask for a method.
  - Expected: One worked example then a similar problem.
- **Leave study mode**
  1. Leave study mode; ask the same question.
  - Expected: A direct answer.
- **CLI**
  1. Set output-style study; ask a problem.
  - Expected: Guiding question or hint rather than full solution.

**Where to look when it fails**

- Check readActiveStudyInstruction output for the chat.
- Inspect the system prompt composed in request-processor.ts (preamble).
- study_sessions.ended_at null.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- CLI: [70-qa/test-plans/cli/038-learning-and-study-products.md](../../70-qa/test-plans/cli/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile, VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Teaching is only prompt text; no lesson sequence, hint counter or progress state.** Affects: All apps. Evidence: study-session.ts; no extra tables. Work needed: Decide if a real engine is wanted.
- **CLI and VS Code text differs from the web instruction.** Affects: CLI, VS Code. Evidence: study.md vs study-session.ts. Work needed: Share one source.
- **Brief says S38.08-S38.13 missing on every app; the prompt path exists on web, desktop and mobile Cloud.** Affects: Planners. Evidence: study-session.ts:38-47. Work needed: Update brief; verify by transcripts.
- **composeStudyPrompt unused in production.** Affects: Maintainers. Evidence: grep. Work needed: Use or remove.
- **No test proves a model follows the rules.** Affects: All. Evidence: tests only check text. Work needed: Add recorded transcript evals.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- table:study_sessions
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- F038-01
- F038-05
- F038-06

## Unknown

- Whether models actually follow the rules (no eval record found).
- Whether the own-key path adds the study text.
- How HTML artifact explanations are rendered per app.
- Whether Electron desktop adds anything.
