---
id: "GAPS-AREA-038"
type: "gap-list"
title: "Gaps: Learning and study products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 38. Learning and study products

67 open gaps that touch this area. Area page: [20-features/038-learning-and-study-products](../../20-features/038-learning-and-study-products/README.md).

## GAP-AREA038-LW03

**Migration 0247 says NOT YET APPLIED, but the store and the route read and write public.study_sessions. If the migration is not applied in an environment, study calls there would fail.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-038
- Detail: Area 38. Learning and study products
- Evidence: apps/web/db/neon/0247_study_sessions.sql:4; apps/web/features/study/server/study-session-store.ts:46-54, 86-98

## GAP-AREA038-LW05

**Plan gate is registered as managed_chat, but the study route handlers shown do not check it. Enforcement is not confirmed.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-038
- Detail: Area 38. Learning and study products
- Evidence: packages/contracts/types/src/interaction-modes.json:394-397; apps/web/app/api/study/sessions/route.ts:57-104

## GAP-AREA038-LW06

**Starting a session creates the chat first, then writes the study row. If the second call fails, a chat with no study row is left behind, and the error says the session could not be started.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-038
- Detail: Area 38. Learning and study products
- Evidence: apps/web/features/study/components/StudyPage.tsx:107-124

## GAP-AREA038-LW10

**Diagnostic quiz, progress dashboard, weak topics, and stories have no code in this area.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-038
- Detail: Area 38. Learning and study products
- Evidence: Not found in apps/web/features/study or the study routes.

## GAP-F038-01-01

**Brief marks mobile S38.01-S38.04, CLI S38.02-04 and VS Code as missing/partial; code shows mobile Cloud built, VS Code and CLI style-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-01](../../20-features/038-learning-and-study-products/F038-01-start-a-study-session.md)
- Detail: Affects: Testers and planners using the brief. Work needed: Correct the brief rows.
- Evidence: apps/mobile/src/features/study/StudyScreen.tsx; outputStyles.ts:21

## GAP-F038-01-02

**CLI and VS Code have no subject, mode or level setup or session history.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-01](../../20-features/038-learning-and-study-products/F038-01-start-a-study-session.md)
- Detail: Affects: CLI, VS Code. Work needed: Design a session concept or accept style-only.
- Evidence: output_styles.rs:55-60

## GAP-F038-01-03

**Mobile Local mode cannot study.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-01](../../20-features/038-learning-and-study-products/F038-01-start-a-study-session.md)
- Detail: Affects: Mobile Local users (free of subscription by requirement). Work needed: Product decision and on-device path; study_sessions needs the server today.
- Evidence: StudyScreen.tsx:175-202

## GAP-F038-01-04

**No Chrome extension entry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-01](../../20-features/038-learning-and-study-products/F038-01-start-a-study-session.md)
- Detail: Affects: Chrome. Work needed: Decide if needed.
- Evidence: no matches in apps/extension

## GAP-F038-01-05

**Migration 0247 states not applied; web e2e text may be stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-01](../../20-features/038-learning-and-study-products/F038-01-start-a-study-session.md)
- Detail: Affects: All server-backed apps. Work needed: Confirm applied state per environment; fix e2e.
- Evidence: 0247_study_sessions.sql:4; e2e/study-and-invoices.spec.ts:16

## GAP-F038-01-NOTBUILT

**Start a study session: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F038-01](../../20-features/038-learning-and-study-products/F038-01-start-a-study-session.md)
- Requirement items: S38.01, S38.02, S38.03, S38.04
- Detail: CLI: S38.02, S38.03, S38.04; Chrome: S38.01, S38.02, S38.03, S38.04

## GAP-F038-02-01

**Brief says S38.05 missing on every app; web wiring exists but no direct material upload and not verified end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-02](../../20-features/038-learning-and-study-products/F038-02-course-material-for-the-session.md)
- Detail: Affects: Web, Desktop. Work needed: Run the scenarios; fix brief.
- Evidence: StudyPage.tsx:245-267

## GAP-F038-02-02

**No menu on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-02](../../20-features/038-learning-and-study-products/F038-02-course-material-for-the-session.md)
- Detail: Affects: those apps. Work needed: Add project choice on mobile.
- Evidence: StudyScreen.tsx

## GAP-F038-02-03

**Archived-project failure is not explained on the Study page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-02](../../20-features/038-learning-and-study-products/F038-02-course-material-for-the-session.md)
- Detail: Affects: Web. Work needed: Message that points back to the project.
- Evidence: request-processor.ts:3862-3870

## GAP-F038-02-04

**Context cap may cut long course material without telling the learner.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-02](../../20-features/038-learning-and-study-products/F038-02-course-material-for-the-session.md)
- Detail: Affects: Web. Work needed: Show truncation.
- Evidence: request-processor.ts:3880

## GAP-F038-02-NOTBUILT

**Course material for the session: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F038-02](../../20-features/038-learning-and-study-products/F038-02-course-material-for-the-session.md)
- Requirement items: S38.05
- Detail: Mobile: S38.05; CLI: S38.05; VS Code: S38.05; Chrome: S38.05

## GAP-F038-03-01

**No diagnostic quiz.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-03](../../20-features/038-learning-and-study-products/F038-03-study-plan-and-diagnostic.md)
- Detail: Affects: All apps. Work needed: Design and build; reuse QuizView.
- Evidence: no code found

## GAP-F038-03-02

**Plan is not stored or tracked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-03](../../20-features/038-learning-and-study-products/F038-03-study-plan-and-diagnostic.md)
- Detail: Affects: All apps. Work needed: Decide on a plan artifact.
- Evidence: no plan table or store

## GAP-F038-03-03

**Plan option missing on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-03](../../20-features/038-learning-and-study-products/F038-03-study-plan-and-diagnostic.md)
- Detail: Affects: those apps. Work needed: Add checkbox on mobile.
- Evidence: StudyScreen.tsx

## GAP-F038-03-04

**Brief says S38.07 missing on web but a draft path exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-03](../../20-features/038-learning-and-study-products/F038-03-study-plan-and-diagnostic.md)
- Detail: Affects: Planners. Work needed: Update brief to partial.
- Evidence: StudyPage.tsx:113-120

## GAP-F038-03-NOTBUILT

**Study plan and diagnostic: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F038-03](../../20-features/038-learning-and-study-products/F038-03-study-plan-and-diagnostic.md)
- Requirement items: S38.06, S38.07
- Detail: Mobile: S38.06, S38.07; CLI: S38.06, S38.07; VS Code: S38.06, S38.07; Chrome: S38.06, S38.07

## GAP-F038-04-01

**Teaching is only prompt text; no lesson sequence, hint counter or progress state.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-04](../../20-features/038-learning-and-study-products/F038-04-guided-teaching-style.md)
- Detail: Affects: All apps. Work needed: Decide if a real engine is wanted.
- Evidence: study-session.ts; no extra tables

## GAP-F038-04-02

**CLI and VS Code text differs from the web instruction.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-04](../../20-features/038-learning-and-study-products/F038-04-guided-teaching-style.md)
- Detail: Affects: CLI, VS Code. Work needed: Share one source.
- Evidence: study.md vs study-session.ts

## GAP-F038-04-03

**Brief says S38.08-S38.13 missing on every app; the prompt path exists on web, desktop and mobile Cloud.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-04](../../20-features/038-learning-and-study-products/F038-04-guided-teaching-style.md)
- Detail: Affects: Planners. Work needed: Update brief; verify by transcripts.
- Evidence: study-session.ts:38-47

## GAP-F038-04-04

**composeStudyPrompt unused in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-04](../../20-features/038-learning-and-study-products/F038-04-guided-teaching-style.md)
- Detail: Affects: Maintainers. Work needed: Use or remove.
- Evidence: grep

## GAP-F038-04-05

**No test proves a model follows the rules.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-04](../../20-features/038-learning-and-study-products/F038-04-guided-teaching-style.md)
- Detail: Affects: All. Work needed: Add recorded transcript evals.
- Evidence: tests only check text

## GAP-F038-04-NOTBUILT

**Guided teaching style: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F038-04](../../20-features/038-learning-and-study-products/F038-04-guided-teaching-style.md)
- Requirement items: S38.08, S38.09, S38.10, S38.11, S38.12, S38.13
- Detail: Chrome: S38.08, S38.09, S38.10, S38.11, S38.12, S38.13

## GAP-F038-05-01

**Brief marks S38.14, S38.19, S38.20 missing on all apps; web and mobile viewers exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-05](../../20-features/038-learning-and-study-products/F038-05-practice-questions-and-answer-feedback.md)
- Detail: Affects: Planners. Work needed: Update brief; verify on devices.
- Evidence: QuizView.tsx; StudyQuizView.tsx

## GAP-F038-05-02

**Results are not saved.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-05](../../20-features/038-learning-and-study-products/F038-05-practice-questions-and-answer-feedback.md)
- Detail: Affects: All. Work needed: Persist results.
- Evidence: QuizView.tsx:29-59

## GAP-F038-05-03

**No quiz viewer on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-05](../../20-features/038-learning-and-study-products/F038-05-practice-questions-and-answer-feedback.md)
- Detail: Affects: those apps. Work needed: Decide scope.
- Evidence: no files found

## GAP-F038-05-04

**No grading for free-text beyond string match; meaning-based checks need the model button.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-05](../../20-features/038-learning-and-study-products/F038-05-practice-questions-and-answer-feedback.md)
- Detail: Affects: Learners. Work needed: Optional model grading.
- Evidence: study-set.ts:238-244

## GAP-F038-05-05

**Quiz in desktop Tauri not present.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-05](../../20-features/038-learning-and-study-products/F038-05-practice-questions-and-answer-feedback.md)
- Detail: Affects: Tauri build. Work needed: None if Electron is the public desktop.
- Evidence: no study files in apps/desktop/src

## GAP-F038-05-NOTBUILT

**Practice questions and answer feedback: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F038-05](../../20-features/038-learning-and-study-products/F038-05-practice-questions-and-answer-feedback.md)
- Requirement items: S38.14, S38.19, S38.20
- Detail: CLI: S38.14, S38.19, S38.20; VS Code: S38.14, S38.19, S38.20; Chrome: S38.14, S38.19, S38.20

## GAP-F038-06-01

**No multiple-select or fill-in-the-blank.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-06](../../20-features/038-learning-and-study-products/F038-06-quiz-question-types-and-quiz-editing.md)
- Detail: Affects: All apps. Work needed: New kinds, grading, editor, instruction.
- Evidence: study-set.ts:6-24

## GAP-F038-06-02

**No editing on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-06](../../20-features/038-learning-and-study-products/F038-06-quiz-question-types-and-quiz-editing.md)
- Detail: Affects: Mobile. Work needed: Mobile editor.
- Evidence: StudyDocumentView.tsx

## GAP-F038-06-03

**Brief marks S38.15, S38.17, S38.21 missing everywhere; web built, mobile answer-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-06](../../20-features/038-learning-and-study-products/F038-06-quiz-question-types-and-quiz-editing.md)
- Detail: Affects: Planners. Work needed: Update brief.
- Evidence: StudySetEditors.tsx

## GAP-F038-06-04

**Hint editing not available in the editor.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-06](../../20-features/038-learning-and-study-products/F038-06-quiz-question-types-and-quiz-editing.md)
- Detail: Affects: Web. Work needed: Add field.
- Evidence: editor labels list no hints field

## GAP-F038-06-05

**Short-answer grading is string match only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-06](../../20-features/038-learning-and-study-products/F038-06-quiz-question-types-and-quiz-editing.md)
- Detail: Affects: All. Work needed: Optional model check.
- Evidence: study-set.ts:238

## GAP-F038-06-NOTBUILT

**Quiz question types and quiz editing: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F038-06](../../20-features/038-learning-and-study-products/F038-06-quiz-question-types-and-quiz-editing.md)
- Requirement items: S38.15, S38.16, S38.17, S38.18, S38.21
- Detail: CLI: S38.15, S38.16, S38.17, S38.18, S38.21; VS Code: S38.15, S38.16, S38.17, S38.18, S38.21; Chrome: S38.15, S38.16, S38.17, S38.18, S38.21

## GAP-F038-07-01

**Progress marks are not saved**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-07](../../20-features/038-learning-and-study-products/F038-07-flashcards.md)
- Detail: Affects: Learners on web, desktop and mobile. Work needed: Persist per-set marks, then show them in F038-08
- Evidence: FlashcardsView.tsx:22-24; StudyFlashcardsView.tsx:37

## GAP-F038-07-02

**No edit or print on mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-07](../../20-features/038-learning-and-study-products/F038-07-flashcards.md)
- Detail: Affects: Mobile learners. Work needed: Add editor and share or print path, or record view-only as intended
- Evidence: No edit or print code under apps/mobile/src/features/chat/components/artifact-viewers/study/

## GAP-F038-07-03

**No deck viewer in CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-07](../../20-features/038-learning-and-study-products/F038-07-flashcards.md)
- Detail: Affects: Users of those three apps. Work needed: Add rendering or a text fallback
- Evidence: No study-set import outside web and mobile

## GAP-F038-07-04

**Mobile Project Studio flashcards prompt asks for a card-by-card chat, not a deck block**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-07](../../20-features/038-learning-and-study-products/F038-07-flashcards.md)
- Detail: Affects: Mobile learners using the notebook. Work needed: Align the prompts to one format
- Evidence: project-studio.ts:94-99 versus ProjectStudio.tsx:87-93

## GAP-F038-07-05

**The area brief lists all six apps as missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-07](../../20-features/038-learning-and-study-products/F038-07-flashcards.md)
- Detail: Affects: Anyone reading the brief. Work needed: Refresh the ledger statuses
- Evidence: S38.22 to S38.26 versus the code above

## GAP-F038-07-NOTBUILT

**Flashcards: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F038-07](../../20-features/038-learning-and-study-products/F038-07-flashcards.md)
- Requirement items: S38.22, S38.23, S38.24, S38.25, S38.26
- Detail: CLI: S38.22, S38.23, S38.24, S38.25, S38.26; VS Code: S38.22, S38.23, S38.24, S38.25, S38.26; Chrome: S38.22, S38.23, S38.24, S38.25, S38.26

## GAP-F038-08-01

**No progress dashboard**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-08](../../20-features/038-learning-and-study-products/F038-08-progress-and-weak-topics.md)
- Detail: Affects: All learners on all six apps. Work needed: Define results data, store it, build a view
- Evidence: Only a session list exists (StudyPage.tsx:301-364)

## GAP-F038-08-02

**No weak-topic suggestions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-08](../../20-features/038-learning-and-study-products/F038-08-progress-and-weak-topics.md)
- Detail: Affects: All learners. Work needed: Derive from stored misses and show them
- Evidence: No code found

## GAP-F038-08-03

**No place to store scores**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-08](../../20-features/038-learning-and-study-products/F038-08-progress-and-weak-topics.md)
- Detail: Affects: Backend. Work needed: New numbered migration, never edit the applied one (doc: AGENTS.md section 5)
- Evidence: 0247_study_sessions.sql:33-47

## GAP-F038-08-NOTBUILT

**Progress and weak topics: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F038-08](../../20-features/038-learning-and-study-products/F038-08-progress-and-weak-topics.md)
- Requirement items: S38.27, S38.28
- Detail: CLI: S38.27, S38.28; VS Code: S38.27, S38.28; Chrome: S38.27, S38.28

## GAP-F038-09-01

**No speech input or feedback in study**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-09](../../20-features/038-learning-and-study-products/F038-09-spoken-explanation-and-language-exercises.md)
- Detail: Affects: All apps. Work needed: Connect study chat to the voice path and define feedback
- Evidence: No code found; study-session.ts:55 is prompt text

## GAP-F038-09-02

**Language exercises are not structured**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-09](../../20-features/038-learning-and-study-products/F038-09-spoken-explanation-and-language-exercises.md)
- Detail: Affects: Language learners. Work needed: Interactive exercise block types
- Evidence: study-session.ts:56

## GAP-F038-09-03

**No pronunciation practice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-09](../../20-features/038-learning-and-study-products/F038-09-spoken-explanation-and-language-exercises.md)
- Detail: Affects: All learners. Work needed: Speech scoring route and UI
- Evidence: search found none

## GAP-F038-09-04

**Instruction only reaches the model through the web pipeline**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-09](../../20-features/038-learning-and-study-products/F038-09-spoken-explanation-and-language-exercises.md)
- Detail: Affects: Mobile Local mode and CLI. Work needed: Verify and, if needed, add the instruction on those paths
- Evidence: request-processor.ts:3802-3830 is in the web API; mobile local path not checked

## GAP-F038-09-NOTBUILT

**Spoken explanation and language exercises: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F038-09](../../20-features/038-learning-and-study-products/F038-09-spoken-explanation-and-language-exercises.md)
- Requirement items: S38.29, S38.30, S38.31
- Detail: VS Code: S38.29, S38.30, S38.31; Chrome: S38.29, S38.30, S38.31

## GAP-F038-10-01

**Feature absent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-10](../../20-features/038-learning-and-study-products/F038-10-narrated-and-illustrated-stories.md)
- Detail: Affects: All apps. Work needed: Product decision, then design, speech and image routes, artifact block, viewer on each app
- Evidence: Search of apps, packages and crates found no story code

## GAP-F038-10-02

**No spec**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-10](../../20-features/038-learning-and-study-products/F038-10-narrated-and-illustrated-stories.md)
- Detail: Affects: Planning. Work needed: Write a spec before building
- Evidence: No document under docs/specs found for it in this pass; not searched exhaustively

## GAP-F038-10-NOTBUILT

**Narrated and illustrated stories: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F038-10](../../20-features/038-learning-and-study-products/F038-10-narrated-and-illustrated-stories.md)
- Requirement items: S38.32, S38.33
- Detail: Web: S38.32, S38.33; Desktop: S38.32, S38.33; Mobile: S38.32, S38.33; CLI: S38.32, S38.33; VS Code: S38.32, S38.33; Chrome: S38.32, S38.33

## GAP-F038-11-01

**No sharing of study sets**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-11](../../20-features/038-learning-and-study-products/F038-11-print-and-share-study-materials.md)
- Detail: Affects: All apps. Work needed: Define share model, consent and recipient view
- Evidence: No share code in the study folders

## GAP-F038-11-02

**No print on mobile, CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-11](../../20-features/038-learning-and-study-products/F038-11-print-and-share-study-materials.md)
- Detail: Affects: Those apps. Work needed: Native share or print path
- Evidence: No print code outside study-print.ts

## GAP-F038-11-03

**Guides are not printable through this path**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-11](../../20-features/038-learning-and-study-products/F038-11-print-and-share-study-materials.md)
- Detail: Affects: Web learners. Work needed: Print for Markdown prose or reuse the document export
- Evidence: StudyDocument.tsx:45-47

## GAP-F038-11-04

**Electron desktop print not verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-11](../../20-features/038-learning-and-study-products/F038-11-print-and-share-study-materials.md)
- Detail: Affects: Desktop. Work needed: Run in Electron and record
- Evidence: Not checked

## GAP-F038-11-NOTBUILT

**Print and share study materials: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F038-11](../../20-features/038-learning-and-study-products/F038-11-print-and-share-study-materials.md)
- Requirement items: S38.34
- Detail: Mobile: S38.34; CLI: S38.34; VS Code: S38.34; Chrome: S38.34

## GAP-F038-12-01

**Follow-up is not truly source-grounded**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-12](../../20-features/038-learning-and-study-products/F038-12-follow-up-questions-after-a-quiz.md)
- Detail: Affects: Learners on all apps. Work needed: Attach source passages or citations to the turn
- Evidence: study-set.ts:342-345 asks in words only; no retrieval attached

## GAP-F038-12-02

**No follow-up for inline quizzes on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-12](../../20-features/038-learning-and-study-products/F038-12-follow-up-questions-after-a-quiz.md)
- Detail: Affects: Web and desktop learners. Work needed: Pass onAsk for inline too
- Evidence: ArtifactPreview.tsx:1928 limits onAsk to the panel

## GAP-F038-12-03

**Quiz results not stored**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-12](../../20-features/038-learning-and-study-products/F038-12-follow-up-questions-after-a-quiz.md)
- Detail: Affects: All learners. Work needed: Store results to support progress and later follow-up
- Evidence: QuizView.tsx:29-31

## GAP-F038-12-04

**No quiz viewer on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-12](../../20-features/038-learning-and-study-products/F038-12-follow-up-questions-after-a-quiz.md)
- Detail: Affects: Those apps. Work needed: Viewer or text fallback
- Evidence: No study-set use outside web and mobile

## GAP-F038-12-05

**Area brief says missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F038-12](../../20-features/038-learning-and-study-products/F038-12-follow-up-questions-after-a-quiz.md)
- Detail: Affects: Planning. Work needed: Update ledger to partial
- Evidence: S38.35 versus the code

## GAP-F038-12-NOTBUILT

**Follow-up questions after a quiz: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F038-12](../../20-features/038-learning-and-study-products/F038-12-follow-up-questions-after-a-quiz.md)
- Requirement items: S38.35
- Detail: CLI: S38.35; VS Code: S38.35; Chrome: S38.35
