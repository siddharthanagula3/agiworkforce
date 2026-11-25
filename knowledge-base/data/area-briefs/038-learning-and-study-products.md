# Area 38. Learning and study products

35 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S38.01 Study-mode entry.
- Should: A Study entry point starts a tutoring session that changes how the model teaches.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/study/components/StudyPage.tsx:41; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892; apps/cli/src/output_styles.rs:55

## S38.02 Learning-goal setup.
- Should: The user states what they want to learn before a session starts.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/study/components/StudyPage.tsx:41; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892

## S38.03 Subject selection.
- Should: The user picks the subject to study.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/study/components/StudyPage.tsx:41; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892

## S38.04 Level or background selection.
- Should: The user sets their level or background and the tutor adapts to it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/study/components/StudyPage.tsx:41; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892

## S38.05 Course-material intake.
- Should: The user can give course material (notes, syllabus, slides) for the tutor to teach from.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.06 Initial diagnostic quiz.
- Should: A short diagnostic quiz gauges what the learner already knows.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.07 Personalized study plan.
- Should: The product builds a personalised study plan.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.08 Lesson sequence.
- Should: Learning proceeds through a sequence of lessons or steps.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/app-nav-items.ts:131; apps/web/features/study/lib/study-session.ts:47; apps/web/features/study/components/StudyPage.tsx:183; apps/web/features/study/components/StudyPage.tsx:87; apps/web/features/study/components/StudyPage.tsx:37; apps/web/app/api/chat/conversations/route.ts:175; apps/web/lib/csrf.ts:290
- Unfinished: web: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the page shows 'The study conversation could not be created'. Even with that fixed, no chat path reads study_sessions or sends the study instruction to the model, so the session would be an ordinary chat ('Learn it' mode only describes 'one idea at a time' as an instruction; there is no lesson structure). | desktop: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conve

## S38.09 Socratic question flow.
- Should: The tutor guides with questions instead of giving the answer.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/app-nav-items.ts:131; apps/web/features/study/lib/study-session.ts:62; apps/web/features/study/components/StudyPage.tsx:183; apps/web/features/study/components/StudyPage.tsx:87; apps/web/features/study/components/StudyPage.tsx:37; apps/web/app/api/chat/conversations/route.ts:175; apps/web/lib/csrf.ts:290
- Unfinished: web: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the page shows 'The study conversation could not be created'. Even with that fixed, no chat path reads study_sessions or sends the study instruction to the model, so the session would be an ordinary chat. | desktop: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the page shows 'The study conversation could not be created'. Even with that

## S38.10 Hint progression.
- Should: Hints are revealed progressively when the learner is stuck.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.11 Worked examples.
- Should: The tutor shows worked examples.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.12 Interactive explanations.
- Should: Explanations are interactive (the learner manipulates or explores them).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.13 Visual demonstrations.
- Should: Concepts are shown with visual demonstrations.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.14 Practice questions.
- Should: The learner gets practice questions on the topic.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/app-nav-items.ts:131; apps/web/features/study/lib/study-session.ts:49; apps/web/features/study/components/StudyPage.tsx:183; apps/web/features/study/components/StudyPage.tsx:87; apps/web/features/study/components/StudyPage.tsx:37; apps/web/app/api/chat/conversations/route.ts:175; apps/web/lib/csrf.ts:290
- Unfinished: web: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the page shows 'The study conversation could not be created'. Even with that fixed, no chat path reads study_sessions or sends the study instruction to the model, so the session would be an ordinary chat ('Practise it' is only an instruction to ask questions one at a time). | desktop: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the pag

## S38.15 Multiple-choice questions.
- Should: Multiple-choice questions can be answered by choosing an option.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.16 Multiple-select questions.
- Should: Multiple-select questions accept several options.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.17 Short-answer questions.
- Should: Short-answer questions accept typed answers and are graded.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.18 Fill-in-the-blank questions.
- Should: Fill-in-the-blank questions are offered and graded.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.19 Answer explanations.
- Should: Each answer comes with an explanation.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/app-nav-items.ts:131; apps/web/features/study/lib/study-session.ts:49; apps/web/features/study/components/StudyPage.tsx:183; apps/web/features/study/components/StudyPage.tsx:87; apps/web/features/study/components/StudyPage.tsx:37; apps/web/app/api/chat/conversations/route.ts:175; apps/web/lib/csrf.ts:290
- Unfinished: web: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the page shows 'The study conversation could not be created'. Even with that fixed, no chat path reads study_sessions or sends the study instruction to the model, so the session would be an ordinary chat (explanations exist only as wording in the 'Practise it' instruction). | desktop: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the pag

## S38.20 Per-question feedback.
- Should: Each question gets feedback on whether and why the answer was right.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/app-nav-items.ts:131; apps/web/features/study/lib/study-session.ts:49; apps/web/features/study/components/StudyPage.tsx:183; apps/web/features/study/components/StudyPage.tsx:87; apps/web/features/study/components/StudyPage.tsx:37; apps/web/app/api/chat/conversations/route.ts:175; apps/web/lib/csrf.ts:290
- Unfinished: web: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the page shows 'The study conversation could not be created'. Even with that fixed, no chat path reads study_sessions or sends the study instruction to the model, so the session would be an ordinary chat (feedback exists only as wording in the 'Practise it' instruction). | desktop: Start studying always fails: StudyPage creates the conversation with a bare fetch that sends no CSRF token, so /api/chat/conversations answers 403 and the page s

## S38.21 Quiz editing.
- Should: The user can edit a generated quiz.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.22 Flashcard generation.
- Should: The product generates flashcards on a topic or from material.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.23 Flashcard editing.
- Should: The user can edit flashcards.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.24 Flip-card interaction.
- Should: Flashcards flip between front and back.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.25 Known/practice classification.
- Should: The learner marks cards as known or needing practice.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.26 Shuffle.
- Should: Cards or questions can be shuffled.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.27 Progress dashboard.
- Should: A dashboard shows study progress over time.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.28 Weak-topic recommendations.
- Should: The product recommends weak topics to review.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.29 Spoken-explanation feedback.
- Should: The learner explains a concept aloud and gets feedback.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.30 Language-learning exercises.
- Should: Language-learning exercises are offered.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.31 Pronunciation practice.
- Should: The learner practises pronunciation and gets feedback.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.32 Narrated storybooks.
- Should: The product creates narrated storybooks.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.33 Illustrated stories.
- Should: The product creates illustrated stories.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.34 Print and share study materials.
- Should: Study materials (quizzes, cards, guides) can be printed or shared.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S38.35 Source-based follow-up after completing a quiz.
- Should: After a quiz, the learner can follow up with questions grounded in the source material.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
