---
id: "F038-08"
type: "feature"
title: "Progress and weak topics"
aliases: ["Progress dashboard (S38.27)", "Weak-topic recommendations (S38.28)", "Study history list", "Your sessions"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.27", "S38.28"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "api:GET /api/study/sessions", "api:POST /api/study/sessions", "api:DELETE /api/study/sessions", "table:study_sessions", "SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "F038-07", "F038-12"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-08 Progress and weak topics

A study progress dashboard and weak-topic suggestions are not built on any app. The nearest thing is the 'Your sessions' list on the web Study page, which shows topic, mode, level and 'running', with no scores or dates. Quiz scores exist only on screen during one quiz.

Area: [38. Learning and study products](README.md). Requirement items: [S38.27](../../10-requirements/capabilities/038-learning-and-study-products.md#s3827), [S38.28](../../10-requirements/capabilities/038-learning-and-study-products.md#s3828).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Intended: show how a learner is doing over time and suggest topics to revisit. Today only a list of sessions exists (apps/web/features/study/components/StudyPage.tsx:301-364).

**Why it exists.** Learners need to see what they covered and where they are weak; the brief states both as Should items (S38.27, S38.28).

**Who uses it.** Students and self-learners.

**Problems it solves**

- Without it a learner cannot see progress across sessions or quizzes.
- Without it a learner must remember which topics went badly.

**Use cases**

- A learner opens Study and sees quiz scores per topic over the past month [proposed].
- After three missed questions on one concept the app suggests reviewing it [proposed].
- A learner resumes an ended session from the list (works today).

## 2. User experience

**Where to find it**

- Web and desktop (hosted web): 'Study' in the navigation at /chat/study, section 'Your sessions' (apps/web/features/study/components/StudyPage.tsx:301-304; apps/web/e2e/nav-verification.spec.ts:33).
- Mobile: the Study screen lists sessions after loading (apps/mobile/src/features/study/StudyScreen.tsx, not read in full; imports listStudySessions at line 23). Rows and labels there: unknown.
- CLI: only an output style named study (apps/cli/src/output_styles.rs:55). VS Code and Chrome: nothing found.

**Before you start**

- Signed in; at least one study session started.

**Screens and controls**

- Each web row shows the topic, then 'Mode · Level' and ' · running' for open sessions; buttons 'Leave study mode' (open) or 'Resume study mode' (ended) and a delete icon 'Delete conversation' (StudyPage.tsx:314-361).

**Journey**

1. 1. Open Study.
2. 2. Read the list of sessions, running ones first.
3. 3. Tap a row to open that conversation, or use the row buttons.
4. 4. There is no step that shows progress or weak topics.

**What the person sees and gets**

- Empty state: 'Nothing yet. Subjects you study show up here.' (StudyPage.tsx:309-311).
- Load failure: 'Your study history could not be loaded.' (StudyPage.tsx:93).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Session list with active and past sessions on web (StudyPage.tsx:167-168,314-361) and an API that lists them (apps/web/app/api/study/sessions/route.ts:47-67).
- Per-quiz score shown at the end of a quiz, held in state only (apps/web/features/chat/components/artifacts/study/QuizView.tsx:35,69-71).

**Incomplete**

- The sessions table stores topic, mode, level, start and end only; no score or topic-level result column was found (apps/web/db/neon/0247_study_sessions.sql:33-47).

**Present but disconnected or switched off**

- Quiz follow-up text contains the score but is just a chat message, not stored as progress (packages/ui/unified-chat/src/lib/study-set.ts:329-355).

**Not available**

- Progress dashboard on all six apps.
- Weak-topic recommendations on all six apps.

## 4. Required behaviour

**Established requirements**

- A dashboard shows study progress over time. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.27)
- The product recommends weak topics to review. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.28)

**Acceptance criteria**

1. Completing a quiz creates a stored result with the topic, score and date.
2. The dashboard lists results over time for the signed-in user only.
3. A topic with repeated misses appears in a 'review' suggestion.
4. Deleting a study conversation removes or detaches its results as the product rule says.
5. An empty dashboard shows an empty state, not an error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Results are personal data and must be private per user and covered by data export and deletion [inferred from AGENTS.md section 6; the export route already includes study_sessions, apps/web/app/api/user/export/route.ts:2211-2217].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a results table keyed by study session, filled when a quiz or deck finishes.
- [proposed] Derive weak topics from missed questions rather than ask the model each time.
- [proposed] Show the dashboard only for signed-in Cloud users, and say so for Local.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | StudyPage | `apps/web/features/study/components/StudyPage.tsx` | Web Study page with start form and sessions list |
| service | studyApi | `apps/web/features/study/services/study-api.ts` | Web client for the sessions API (list, start, end) |
| endpoint | /api/study/sessions | `apps/web/app/api/study/sessions/route.ts` | GET list or one, POST start, DELETE end |
| service | study-session-store | `apps/web/features/study/server/study-session-store.ts` | SQL for list, start, end, read active instruction |
| table | study_sessions | `apps/web/db/neon/0247_study_sessions.sql` | One row per conversation with topic, mode, level, started_at, ended_at; row level security |
| schema | StudySession type and helpers | `packages/contracts/types/src/study.ts` | Shared type, sort by startedAt, labels |
| screen | StudyScreen (mobile) | `apps/mobile/src/features/study/StudyScreen.tsx` | Mobile Study entry and session list |
| service | mobile study service | `apps/mobile/src/features/study/service.ts` | Mobile client for /api/study/sessions |
| component | QuizView score | `apps/web/features/chat/components/artifacts/study/QuizView.tsx` | The only score today, in memory |
| service | user data export | `apps/web/app/api/user/export/route.ts` | Exports study_sessions rows |
| test | StudyPage.test | `apps/web/features/study/components/StudyPage.test.tsx` | List, empty state, history load error |
| test | study-session-store.test | `apps/web/features/study/server/study-session-store.test.ts` | Store SQL behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Study page loads sessions with GET /api/study/sessions. | device and our servers | StudyPage.tsx:88-99; route.ts:47-67 |
| Server reads the caller's rows under row-level security and returns them. | our servers | route.ts:55-66; 0247_study_sessions.sql:51-58 |
| Page sorts newest first and splits active and past. | device | StudyPage.tsx:90,167-168 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Study session rows (topic, mode, level, start and end time) | table study_sessions (our database) | Read from the server by each app | Exported with user data; deleting the conversation is offered in the list (StudyPage.tsx:148-165); cascade behaviour of the table not opened: unknown |

**Models and providers.** No model takes part in listing sessions. A future weak-topic feature might use one [proposed].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the API uses the user-scoped database (route.ts:55). |
| Permissions | Rows limited to the owner by row level security (0247_study_sessions.sql:54-58). |
| Subscription | none found in the code for the study sessions API; only a rate-limit bucket 'chat-conversation-list' (route.ts:48). |
| Limits and metering | Rate limit only; topic up to 200 characters (packages/contracts/types/src/study.ts:7). |
| Feature flags | none found in the code |
| Model compatibility | not applicable today |
| Provider restrictions | none found in the code |
| Local mode | The list needs our servers, so a Local-only user would see no sessions [inferred]; not checked in code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading your study history' | StudyPage.tsx:306-307 |
| Empty | 'Nothing yet. Subjects you study show up here.' | StudyPage.tsx:308-311 |
| Load error | List set empty and message 'Your study history could not be loaded.' | StudyPage.tsx:88-95 |
| Progress or weak topics | not handled in the code | no code found |
| Offline or retry | not handled in the code beyond the error message | StudyPage.tsx:91-94 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/study/components/StudyPage.test.tsx`: Empty state, newest-first list, error on failed history load
- `apps/web/app/api/study/sessions/__tests__/route.test.ts`: Sessions API
- `apps/web/features/study/server/study-session-store.test.ts`: Store queries
- `apps/web/db/neon/study-sessions-migration.test.ts`: Migration of study_sessions
- `apps/mobile/src/features/study/__tests__/Study.test.tsx`: Mobile Study screen (details not read)

**Test scenarios**

- **Empty history**
  1. Sign in with a new account
  2. Open /chat/study
  - Expected: Empty-state sentence, no error.
- **Session order**
  1. Start two sessions
  2. Leave one
  3. Open the list
  - Expected: Running session first; each row shows mode and level.
- **No progress shown**
  1. Finish a quiz
  2. Open Study
  - Expected: No score or weak-topic text appears (confirms the gap).
- **API isolation**
  1. Call GET /api/study/sessions as user A and user B
  - Expected: Each sees only their rows.

**Where to look when it fails**

- API errors from /api/study/sessions
- table study_sessions and its policy study_sessions_owner
- UI text 'Your study history could not be loaded.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **No progress dashboard** Affects: All learners on all six apps. Evidence: Only a session list exists (StudyPage.tsx:301-364). Work needed: Define results data, store it, build a view
- **No weak-topic suggestions** Affects: All learners. Evidence: No code found. Work needed: Derive from stored misses and show them
- **No place to store scores** Affects: Backend. Evidence: 0247_study_sessions.sql:33-47. Work needed: New numbered migration, never edit the applied one (doc: AGENTS.md section 5)
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- api:GET /api/study/sessions
- api:POST /api/study/sessions
- api:DELETE /api/study/sessions
- table:study_sessions
- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- F038-07
- F038-12

## Unknown

- Contents of the mobile Study screen rows (file only partly read).
- Whether any score is stored elsewhere (no match found by search, but not exhaustive).
- Cascade behaviour on conversation delete (migration body not read in full).
