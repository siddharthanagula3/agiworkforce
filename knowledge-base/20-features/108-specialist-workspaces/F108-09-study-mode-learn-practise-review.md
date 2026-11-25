---
id: "F108-09"
type: "feature"
title: "Study mode (learn, practise, review)"
aliases: ["Study", "Study mode", "Study and learn (mobile label)", "Learn it / Practise it / Revise it", "Education workspace (S108.23)", "Curriculum and lesson generation (S108.24)", "study_sessions"]
area: "108 Specialist workspaces"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S108.23", "S108.24"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "table:study_sessions", "table:web_conversations", "api:GET /api/study/sessions", "api:POST /api/study/sessions", "api:DELETE /api/study/sessions", "file:packages/contracts/types/src/study.ts"]
basis: "code inspection"
second_reader: "9 of 12 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F108-09 Study mode (learn, practise, review)

Study turns a chat into a tutoring session on one topic. The person picks a topic, a way (Learn it, Practise it, Revise it) and a level, optionally course material from a project and a starting study plan. The server then adds teaching instructions to every turn. Web and desktop (hosted) have a Study page; mobile has Study and learn, Cloud mode only.

Area: [108. Specialist workspaces](README.md). Requirement items: [S108.23](../../10-requirements/capabilities/108-specialist-workspaces.md#s10823), [S108.24](../../10-requirements/capabilities/108-specialist-workspaces.md#s10824).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Marks a conversation as a study session and injects a teaching instruction (one idea at a time, hints, worked examples, quizzes and flashcards as artifacts) into each model turn while the session is open (apps/web/features/study/server/study-session-store.ts:86-99, :114-141; apps/web/features/study/lib/study-session.ts:47-68).

**Why it exists.** Brief S108.23 asks for an education workspace for teachers and learners (classes, assignments, guided study) and S108.24 for curriculum and lesson generation as structured output (doc: knowledge-base/data/area-briefs/108-specialist-workspaces.md). The migration says Study is a way of working through a subject, not a second kind of chat (apps/web/db/neon/0247_study_sessions.sql header).

**Who uses it.** Learners; the shipped flow is learner-side. No teacher, class or assignment feature was found.

**Problems it solves**

- Chat answers dump a whole topic; Study makes the model teach one idea, check understanding, and wait (study-session.ts:22-26).
- Practice without a quiz tool: quizzes and flashcards come out as artifacts the app renders (study-session.ts:47-56; apps/web/features/chat/components/artifacts/study/QuizView.tsx, FlashcardsView.tsx).
- Finding a session again: sessions are listed and resumable (StudyPage.tsx:128-146).

**Use cases**

- Learn eigenvalues from scratch with a worked example and a check question.
- Practise German dative case with short exercises corrected one by one.
- Revise a unit using attached course notes from a project and a personal study plan.

## 2. User experience

**Where to find it**

- Web (and desktop via the hosted web app): left navigation item 'Study' to /chat/study (apps/web/shared/components/layout/app-nav-items.ts:144-150; hideable) and a 'Study' row in the composer plus-menu (ComposerPlusMenu.tsx:188, :873). Page heading 'Study'.
- Mobile: composer add sheet row 'Study and learn', shown only in Cloud mode (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:584-588, :1256-1261); screen titled 'Study and learn' (apps/mobile/src/features/study/StudyScreen.tsx:177, :207); route apps/mobile/app/(app)/study.tsx hidden from the drawer (_layout.tsx:105).
- Chrome, CLI, VS Code: not available (brief; doc: docs/product/surface-feature-matrix.md:64, :289).

**Before you start**

- Signed in on web; on mobile the app must be in Cloud mode, else the screen says 'Study runs in AGI Cloud' with 'Switch to Cloud mode' (StudyScreen.tsx:177-197).
- The conversation must be a live, non-temporary chat of the caller in the active workspace (study-session-store.ts:125-133).

**Screens and controls**

- Web Study page: 'What are you studying?' text box (max 200 characters), 'How' radio group with 'Learn it', 'Practise it', 'Revise it', 'Where you are with it' select with 'New to it', 'Some background', 'Know it well', 'Course material' select (only if projects exist), checkbox 'Start with a personal study plan', button 'Start studying', list 'Your sessions' with 'Leave study mode' and a resume control (StudyPage.tsx:103-146, :248, :285-289, :339-344; packages/contracts/types/src/study.ts:7, :19-35).
- In a study chat: indicator 'Studying: <topic> · <mode>' and button 'Leave study mode' with note 'Turns off tutoring for this chat. The chat and its messages stay.' (StudyModeIndicator.tsx:8-9, :36-60).
- Mobile: topic field (label 'What do you want to study?'), mode and level choices, 'Start studying', history with retry (StudyScreen.tsx:218, :239-269, :314-317).

**Journey**

1. Open Study.
2. Type a topic, choose how and level, optionally pick course material and tick the study plan box.
3. Press Start studying; the app creates a conversation titled from topic and mode, then registers the study session on it (StudyPage.tsx:103-126).
4. If the plan box was ticked a plan request is placed in the chat draft (studyPlanRequest: order, time per part, checks, ask time per week) (study-session.ts:115-121).
5. Chat with the model; each turn carries the study instruction.
6. Quizzes and flashcards appear as artifact blocks the person can answer.
7. Press Leave study mode to end tutoring; the chat stays. Resume from 'Your sessions'.

**What the person sees and gets**

- Spinner 'Starting the study session' and error alerts such as 'The study session could not be started.' (StudyPage.tsx:121-124).
- 'Nothing yet. Subjects you study show up here.' for an empty history; 'Your study history could not be loaded.' on failure (StudyPage.tsx:93-99).
- Quiz and flashcard artifacts; study set print helper (study-print.ts).

**Settings**

- Course material comes from the person's projects (StudyPage.tsx:248).
- Account instruction and project instruction still apply: study instruction is a 'developer' layer ordered with project and personalized layers (request-processor.ts:2111-2125).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- API: GET list or by conversationId, POST start (strict schema: conversationId uuid, topic 1-200 chars, mode, level), DELETE end (apps/web/app/api/study/sessions/route.ts:28-35, :50-114).
- Store: start upserts on conversation_id and re-opens an ended session; ends set ended_at; list joins live conversations in the active workspace (study-session-store.ts:46-62, :114-158).
- Server injects the instruction in the managed chat request and in the free-quota turn path (request-processor.ts:3820; apps/web/lib/server/free-quota-turn.ts:1074). The instruction is read only when the request carries a conversation_id; with none, studyInstruction is null (request-processor.ts:3987).
- Web page and in-chat indicator (StudyPage.tsx; StudyModeIndicator.tsx).
- Mobile screen with Cloud gating, history and retry (StudyScreen.tsx).

**Incomplete**

- Teacher, classes, assignments (part of S108.23) were searched in the study feature files and mobile screen and none were found; only learner flow exists.
- Curriculum and lesson-plan output (S108.24) has no dedicated generator; it relies on the prompt text and plan request (study-session.ts:47-56, :115-121). Brief cites connector directory lines for it (vendor-directory.json:1028, :1728), not verified here.

**Present but disconnected or switched off**

- composeStudyPrompt, the function that ranks the study instruction against account instruction and current request, has no production caller; only its own test and the feature index use it (grep over apps and packages: apps/web/features/study/index.ts:16 and study-session.test.ts). The live path uses composeStudyInstruction placed in the 'developer' layer (request-processor.ts:2111-2122).
- Migration 0247 header still says 'NOT YET APPLIED : draft only' (0247_study_sessions.sql:4), but it is a stale comment. The table is a hard dependency of the live chat read (request-processor.ts:3820) and later numbered migrations (0248 to 0259) exist after it in the append-only chain, so production use implies it is applied. Confirm with pnpm db:migrate -- status.

**Not available**

- Chrome, CLI, VS Code.
- Desktop-specific code: none; relies on hosted web (doc: AGENTS.md §5). The surface matrix lists desktop and mobile as absent (docs/product/surface-feature-matrix.md:64, :285-286); that conflicts with code for mobile (apps/mobile/src/features/study exists) and is a documentation error by AGENTS.md §2.

## 4. Required behaviour

**Established requirements**

- S108.23 Should: an education workspace for teachers and learners (classes, assignments, guided study). Brief status: web done, desktop done, mobile missing, Chrome missing. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.23)
- S108.24 Should: curricula and lesson plans (objectives, activities, materials) generated as structured output. Brief status as S108.23. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S108.23, S108.24)
- Starting a session needs a topic, mode and level validated by a strict schema. (source: apps/web/app/api/study/sessions/route.ts:28-35)
- One conversation holds one study session; a second start reopens it with the new topic. (source: apps/web/features/study/server/study-session-store.ts:105-113, :134-139)
- Ending Study keeps the chat; nothing a user wrote is thrown away. (source: apps/web/db/neon/0247_study_sessions.sql header; study-session-store.ts:146)
- Precedence of instructions is decided by the shared resolver, not by Study. (source: apps/web/features/study/lib/study-session.ts:78-88 (comment) [but see disconnected])

**Acceptance criteria**

1. POST with a blank topic, an unknown mode or level, or extra fields is refused.
2. POST on a conversation the caller cannot see, a deleted one or a temporary one answers 404 'Conversation not found'.
3. DELETE with no running session answers 404 'No study session is running on that conversation.'
4. After start, the next chat turn in that conversation carries the study instruction; after Leave study mode it does not.
5. GET ?conversationId= returns the one session or an empty list; a non-uuid value is refused.
6. A mobile user in Local mode sees 'Study runs in AGI Cloud' and no start control.
7. A deleted chat's session disappears from 'Your sessions' and returns if the chat is restored (study-session-store.test.ts:60, :95).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The study instruction should apply the same way when a person brings their own key; where it is injected for non-managed routes is unknown [inferred].
- Teacher and class features need new data (classes, assignments) [inferred from S108.23].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Wire composeStudyPrompt into the live path or delete it.
- [proposed] Add a lesson-plan and curriculum artifact type with fields for objectives, activities and materials.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Study page route | `apps/web/app/chat/study/page.tsx` | Mounts StudyPage in the web shell; page title 'Study'. |
| component | StudyPage | `apps/web/features/study/components/StudyPage.tsx` | Start form, history, leave and resume, delete. |
| component | StudyModeIndicator | `apps/web/features/study/components/StudyModeIndicator.tsx` | In-chat banner and Leave study mode button. |
| hook | use-conversation-study-session | `apps/web/features/study/hooks/use-conversation-study-session.ts` | Reads, leaves and resumes the session for a conversation. |
| service | study-api | `apps/web/features/study/services/study-api.ts` | Browser client for /api/study/sessions. |
| endpoint | /api/study/sessions | `apps/web/app/api/study/sessions/route.ts` | GET, POST, DELETE, OPTIONS. |
| service | study-session-store | `apps/web/features/study/server/study-session-store.ts` | SQL for list, read, start, end and active-instruction lookup. |
| service | study-session prompts | `apps/web/features/study/lib/study-session.ts` | Teaching text, composeStudyInstruction, composeStudyPrompt, studyPlanRequest. |
| schema | study contracts | `packages/contracts/types/src/study.ts` | Modes, levels, labels, topic limit shared by web and mobile. |
| table | study_sessions | `apps/web/db/neon/0247_study_sessions.sql` | One row per conversation; row-level security. |
| service | chat request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Reads active instruction (:3820; only when the request has a conversation_id, :3987) and orders it in the preamble (:2111-2125). |
| service | free-quota turn | `apps/web/lib/server/free-quota-turn.ts` | Also reads the study instruction (:1074). |
| component | Study artifacts | `apps/web/features/chat/components/artifacts/study/QuizView.tsx` | Renders quiz blocks (with FlashcardsView.tsx and StudyDocument.tsx beside it). |
| config | nav items | `apps/web/shared/components/layout/app-nav-items.ts` | 'Study' navigation entry (:144-150). |
| component | ComposerPlusMenu Study row | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Link to /chat/study (:873). |
| screen | Mobile StudyScreen | `apps/mobile/src/features/study/StudyScreen.tsx` | Start form and history in Cloud mode. |
| service | Mobile study service | `apps/mobile/src/features/study/service.ts` | Calls /api/study/sessions with schema checks. |
| component | Mobile StudyModeBanner | `apps/mobile/src/features/study/StudyModeBanner.tsx` | In-chat banner with leave/resume (tests at Study.test.tsx:226-265). |
| test | study route test | `apps/web/app/api/study/sessions/__tests__/route.test.ts` | API validation and 404 cases. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the form and presses Start studying; the app creates a conversation through the chat conversations endpoint. | device and our servers | StudyPage.tsx:49-70, :103-110 |
| App posts the session; the server inserts or reopens one row per conversation after checking ownership, workspace, not deleted, not temporary. | our servers | route.ts:75-98; study-session-store.ts:114-141 |
| App opens the chat; a ticked plan box leaves a plan request in the draft. | device | StudyPage.tsx:111-121 |
| On each chat turn the server reads the open session and builds the study instruction into the system preamble. The read happens only when the request carries a conversation_id; otherwise studyInstruction is null. | our servers | request-processor.ts:3820, :3987, :2111-2125 |
| The chosen model replies, writing quiz or flashcards blocks as artifacts. | outside service | study-session.ts:47-56; model call path [inferred] |
| Leave study mode sets ended_at. | our servers | study-session-store.ts:147-158 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Study session (topic, mode, level, started_at, ended_at) | table study_sessions, cascade-deleted with the conversation | Server-side, read by web and mobile | Removed when the conversation is deleted; hidden while the conversation is in deleted state (study-session-store.ts:53-60) |
| Conversation and messages | web_conversations and web_messages | Yes | Normal chat rules |

**Models and providers.** The feature adds text to the system prompt; it works with whatever model the chat uses. Nothing model-specific was found in the feature files. Quiz and flashcard quality depends on the model following the artifact format.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; routes use getUserScopedDb (route.ts:54, :81, :106). |
| Permissions | Rows scoped by user and workspace for GET and POST; another account's conversation yields 404 without saying it exists (route.test.ts:117). DELETE (end session) scopes by user_id only, not by workspace (study-session-store.ts:152-158; route.ts:106), unlike GET and POST which also check organization. POST and DELETE also require a CSRF token (route.ts:76, :101). |
| Subscription | No entitlement check in the study routes. Chat turns follow normal plan rules. |
| Limits and metering | Rate limit bucket 'chat-conversation-list' on all three methods (route.ts:51, :78, :103). Topic max 200 characters. Study turns are normal metered chat turns. |
| Feature flags | none found in the code for the study routes. The nav item is hideable (app-nav-items.ts:150). |
| Model compatibility | No restriction found. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode cannot start Study: it shows 'Study runs in AGI Cloud' (StudyScreen.tsx:177-197; Study.test.tsx:206). Desktop Local inference with Study: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading history | Spinner 'Loading your study history'. | StudyPage.tsx:93-99 |
| Empty | 'Nothing yet. Subjects you study show up here.' | StudyPage.tsx (history section) |
| Start failure | Alert with message; button re-enabled. | StudyPage.tsx:121-124 |
| Start failure after conversation created | The start flow is not atomic: the conversation is created first and the session registered second. A failure in the second step leaves an orphan non-study chat. Mobile does the same. | StudyPage.tsx:107-110, :111; StudyScreen.tsx:160-167 |
| Chat request without conversation_id | No study instruction is injected (studyInstruction is null). | request-processor.ts:3987 |
| Retry history on mobile | 'Retry loading recent study sessions' button. | StudyScreen.tsx:314-317; Study.test.tsx:191 |
| Ended session | Chat stays; note 'Study mode is off. This chat and its messages stay.' | StudyModeIndicator.tsx:10 |
| Leave reply lost on mobile | Shows study mode as off. | Study.test.tsx:251 |
| Temporary or deleted chat | Start refused with Conversation not found. | study-session-store.ts:131-133 |
| Offline, timeout, cancel | not handled in the code beyond error messages | not handled in the code |
| Accessibility | Radio group with aria-checked, role alert for errors, 44px touch targets, status role for indicator. | StudyPage.tsx radio group; StudyModeIndicator.tsx:44 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/study/sessions/__tests__/route.test.ts`: List, by-conversation read, start, refuse bad input, 404 cases, end
- `apps/web/features/study/server/study-session-store.test.ts`: Scoping, deleted-chat hiding, writes refused on foreign, deleted or temporary chats
- `apps/web/features/study/lib/study-session.test.ts`: Instruction composition and composeStudyPrompt precedence
- `apps/web/features/study/components/StudyPage.test.tsx`: Page behaviour
- `apps/web/features/study/components/StudyPage.material.test.tsx`: Course material selection
- `apps/web/features/study/components/StudyModeIndicator.test.tsx`: In-chat indicator
- `apps/web/db/neon/study-sessions-migration.test.ts`: Migration 0247 shape
- `apps/web/e2e/study-and-invoices.spec.ts`: /chat/study opens with its explanation and start control
- `apps/mobile/src/features/study/__tests__/Study.test.tsx`: Start, Cloud gating, history retry, banner leave and resume

**Test scenarios**

- **Start and tutor**
  1. Open /chat/study.
  2. Enter 'eigenvalues', choose Learn it and New to it, press Start studying.
  3. Send 'begin'.
  - Expected: Chat opens with 'Studying: eigenvalues'; reply teaches one idea and asks one check question.
- **Plan first**
  1. Tick 'Start with a personal study plan' and start.
  - Expected: Draft contains the plan request; sending yields a plan.
- **Leave and resume**
  1. Press Leave study mode.
  2. Send a message.
  3. Resume from Your sessions.
  - Expected: After leaving, replies are normal; after resume, tutoring returns; messages kept.
- **Bad input**
  1. POST /api/study/sessions with mode 'quiz'.
  - Expected: Validation error; no row.
- **Mobile Local**
  1. Set the phone app to Local, open Study and learn.
  - Expected: 'Study runs in AGI Cloud' with Switch to Cloud mode.
- **Deleted chat**
  1. Delete a study chat.
  2. Open Your sessions.
  - Expected: Session gone; reappears if the chat is restored.

**Where to look when it fails**

- Error 'No study session is running on that conversation.' (DELETE) versus 'Conversation not found' (POST).
- Table study_sessions by conversation_id.
- Server read of readActiveStudyInstruction in request-processor.ts:3820 returns null when mode or level are invalid.
- Run pnpm db:migrate -- status to confirm migration 0247 is applied.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/108-specialist-workspaces.md](../../70-qa/test-plans/web/108-specialist-workspaces.md)
- Desktop: [70-qa/test-plans/desktop/108-specialist-workspaces.md](../../70-qa/test-plans/desktop/108-specialist-workspaces.md)
- Mobile: [70-qa/test-plans/mobile/108-specialist-workspaces.md](../../70-qa/test-plans/mobile/108-specialist-workspaces.md)

## 10. Gaps and dependencies

- **No classes, assignments or teacher view.** Affects: Teachers on web and desktop.. Evidence: Searched features/study and StudyScreen; none found. Work needed: Define the education data model and screens.
- **No structured curriculum or lesson-plan output.** Affects: Web, desktop.. Evidence: Only prompt text and a plan request (study-session.ts:47-56, :115-121). Work needed: Add an artifact type with objectives, activities, materials.
- **composeStudyPrompt is unused in production.** Affects: Instruction precedence when account instruction and study text conflict.. Evidence: Only study-session.test.ts and index.ts reference it. Work needed: Wire it or remove it.
- **Brief says mobile missing; code has a mobile screen. Surface matrix says desktop and mobile absent.** Affects: Documentation readers.. Evidence: apps/mobile/src/features/study/StudyScreen.tsx; docs/product/surface-feature-matrix.md:285-286. Work needed: Correct brief and matrix.
- **Chrome absent.** Affects: Chrome.. Evidence: Brief. Work needed: Decide scope.
- **Start flow is not atomic: the conversation is created before the session is registered, so a failed registration leaves an orphan non-study chat; the page has no handling for it.** Affects: Web and mobile users starting a session.. Evidence: StudyPage.tsx:107-111; StudyScreen.tsx:160-167. Work needed: Create both in one server call or clean up the conversation on failure.
- **DELETE (end session) scopes by user_id only, not by workspace, unlike GET and POST.** Affects: Users with several workspaces.. Evidence: study-session-store.ts:152-158; route.ts:106. Work needed: Decide whether ending should also check the active workspace.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- table:study_sessions
- table:web_conversations
- api:GET /api/study/sessions
- api:POST /api/study/sessions
- api:DELETE /api/study/sessions
- file:packages/contracts/types/src/study.ts

## Unknown

- Whether migration 0247 is applied in production (the header says not applied but the live chat path and later migrations imply it is; confirm with pnpm db:migrate -- status).
- Whether Study works with own-key and desktop Local inference; injection was found only in the managed paths.
- Whether classes or assignments exist anywhere outside the files searched.
- What the label of the resume button on the web page is (control at StudyPage.tsx:344, text not read).
- Whether any plan limits study use beyond normal chat.

## Second reader's check

A second reader checked 12 statements of this page against the code: 9 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Migration 0247 header says 'NOT YET APPLIED : draft only'; applied state unknown" The code shows: The header text is quoted correctly, but the migration chain is append-only and checksummed (AGENTS.md section 5). Migrations 0248 to 0259 and later sit after it, so 0247 cannot have been skipped where later ones were applied. The header is a stale comment. Also, ListMigrations shows study code is wired into the live chat path, which would fail without the table. (apps/web/db/neon/0247_study_sessions.sql:4; apps/web/db/neon listing 0248..0259; request-processor.ts:3820). **Corrected:** The 0247 header still says 'NOT YET APPLIED' but it is a stale comment. The table is a hard dependency of the live chat read, and later numbered migrations exist, so production use implies it is applied. Confirm with pnpm db:migrate -- status.
- **Wrong (section Status/frontmatter):** "Frontmatter says implementation mobile: "missing" and available_on web, desktop; the Status table says Mobile 'not built'" The code shows: A full mobile Study screen exists with Cloud gating, history and start, and it calls the same API. The page's own section 2, 3 and 8 describe it as built. So the frontmatter and Status table contradict the body. (apps/mobile/src/features/study/StudyScreen.tsx:115, :175-200; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:584-588). **Corrected:** Mobile: built (Cloud mode only), not seen by a person. available_on should include mobile.
- **Partly wrong (section 7):** "Account: Signed-in account; routes use getUserScopedDb (route.ts:51, :80)" The code shows: getUserScopedDb is at route.ts:54, :81 and :106; lines 51 and 78 are the rate-limit calls. The substance is right. (route.ts:54, :81, :106). **Corrected:** Routes use getUserScopedDb (route.ts:54, :81, :106).

**Facts the page missed**

- The study instruction is read only when the request carries a conversation_id; with none, studyInstruction is null (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3987). POST and DELETE also require a CSRF token (apps/web/app/api/study/sessions/route.ts:76, :101), which section 7 omits.
- The start flow is not atomic: the conversation is created first (StudyPage.tsx:107-110) and the session registered second (:111). A failure in the second step leaves an orphan non-study chat, and the page's edge-case table does not say so. Mobile does the same at StudyScreen.tsx:160-167.
- DELETE (end session) scopes by user_id only, not by workspace (study-session-store.ts:152-158; route.ts:106), unlike GET and POST which also check organization. Section 7 describes rows as scoped by user and workspace for all methods.
