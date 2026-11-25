---
id: "F038-01"
type: "feature"
title: "Start a study session"
aliases: ["Study", "Study mode", "Study and learn (mobile label)", "Start studying", "study session", "Output style: study (CLI, VS Code)", "S38.01-S38.04"]
area: "38 Learning and study products"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.01", "S38.02", "S38.03", "S38.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "table:study_sessions", "api:GET /api/study/sessions", "api:POST /api/study/sessions", "api:DELETE /api/study/sessions", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "SYS-execution-boundaries", "F038-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-01 Start a study session

Study mode turns one chat into a tutoring session. On web (and so the Electron desktop) and mobile Cloud mode, the person names a subject, picks Learn it, Practise it or Revise it, and picks a level. The server then adds teaching instructions to every model turn in that chat. CLI and VS Code only offer a prompt-only 'study' output style.

Area: [38. Learning and study products](README.md). Requirement items: [S38.01](../../10-requirements/capabilities/038-learning-and-study-products.md#s3801), [S38.02](../../10-requirements/capabilities/038-learning-and-study-products.md#s3802), [S38.03](../../10-requirements/capabilities/038-learning-and-study-products.md#s3803), [S38.04](../../10-requirements/capabilities/038-learning-and-study-products.md#s3804).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen failing |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates a conversation titled '<mode label>: <subject>', records a study_sessions row (topic, mode, level), and from then on the chat service adds a study instruction to the system prompt of each turn while the session is open (apps/web/features/study/components/StudyPage.tsx:103-126; apps/web/features/study/server/study-session-store.ts:86-101; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6562-6569). The person can leave and resume study mode, list past sessions and delete one (StudyPage.tsx:128-165).

**Why it exists.** So a learner gets a tutor that teaches in small steps instead of a normal assistant that hands over finished answers. Study mode is a mode of a normal chat, not a separate engine: the conversation, messages, model and billing stay as they are (doc: apps/web/db/neon/0247_study_sessions.sql header).

**Who uses it.** Students and self-learners on web, Electron desktop and mobile Cloud mode; developers who pick the study output style in CLI or VS Code.

**Problems it solves**

- Chats that answer instead of teach
- Having to retype 'teach me step by step' each turn
- Finding earlier study chats again (Your sessions list)
- Turning tutoring off without losing the chat

**Use cases**

- A student opens Study, types 'eigenvalues', picks Learn it and New to it, and is taught one idea at a time.
- A learner picks Practise it for 'German dative case' and is quizzed one question at a time.
- A user leaves study mode in a chat to ask a normal question, then turns it back on.
- A CLI user sets output-style to study to get guided hints in the terminal.

## 2. User experience

**Where to find it**

- Web: sidebar item 'Study' at /chat/study (apps/web/shared/components/layout/app-nav-items.ts:143-148; apps/web/app/chat/study/page.tsx:1-18). The item is marked hideable (app-nav-items.ts:149).
- Desktop (Electron): shows the hosted web app, so the same page [inferred from AGENTS.md section 5 (doc: AGENTS.md)]; the Electron window registry test treats /chat/study as a section, not a conversation (apps/desktop/electron/__tests__/windowRegistry.test.ts:42).
- Mobile: in Cloud mode only, the Add-to-chat sheet row 'Study and learn' opens the screen titled 'Study and learn' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1255-1262; apps/mobile/src/features/study/StudyScreen.tsx:207).
- CLI: /output-style or config key output-style, value 'study' (apps/cli/src/output_styles.rs:55-60; apps/cli/src/claude_parity.rs:182; apps/cli/src/config.rs:1543).
- VS Code: output style 'Study' in the sidebar output-style picker (apps/extension-vscode/src/features/sidebar-webview/outputStyles.ts:21).
- Chrome extension: nothing found (grep of apps/extension for 'study' returned no files).

**Before you start**

- Web: signed-in account; the session routes use a user-scoped database connection (apps/web/app/api/study/sessions/route.ts:54).
- Mobile: Cloud mode; Local mode shows 'Study runs in AGI Cloud' with a 'Switch to Cloud mode' button (StudyScreen.tsx:175-202).
- CLI and VS Code: none beyond the normal sign-in or key for the chat itself.

**Screens and controls**

- Web Study page: heading 'Study'; 'What are you studying?' text box (200 characters, placeholder 'e.g. eigenvalues, the Krebs cycle, German dative case'); 'How' radio group with 'Learn it', 'Practise it', 'Revise it' and a one-line description each; 'Where you are with it' menu with 'New to it', 'Some background', 'Know it well'; button 'Start studying' (StudyPage.tsx:187-290).
- Web 'Your sessions' list: each row shows topic, mode and level, ' · running' while open, a 'Leave study mode' or 'Resume study mode' button and a delete (trash) button with a confirm dialog (StudyPage.tsx:301-365).
- In the chat, the Study mode indicator: 'Studying: <topic> · <mode>' with 'Leave study mode', or 'Study mode is off. This chat and its messages stay.' with 'Turn study mode back on' (apps/web/features/study/components/StudyModeIndicator.tsx:36-77), mounted by WebChatPage (apps/web/features/chat/pages/WebChatPage.tsx, found by search, not read).
- Mobile screen: sections TOPIC, HOW, YOUR LEVEL, button 'Start studying', RECENT list of up to 10 sessions, 'Try again' retry for history (StudyScreen.tsx:208-380). Mobile chat shows StudyModeBanner with 'Leave study mode' / 'Turn back on' (StudyModeBanner.tsx:93-103; apps/mobile/app/(app)/chat/[id].tsx:2520).

**Journey**

1. Open Study (web sidebar or mobile Add-to-chat sheet).
2. Type the subject; the button stays disabled while the trimmed text is empty (StudyPage.tsx:101,286).
3. Choose Learn it, Practise it or Revise it (default Learn it) and a level (default New to it) (StudyPage.tsx:79-80).
4. Press 'Start studying'. The form locks, the button reads 'Starting...' and a spinner shows (StudyPage.tsx:196,289-291).
5. The page creates the chat, records the session, then opens /chat/<id> (StudyPage.tsx:107-121).
6. In the chat, each reply follows the study instruction. The indicator offers 'Leave study mode'.
7. Later, return to Study to reopen, leave, resume or delete a session.

**What the person sees and gets**

- On web a red alert under the button shows the failure text from toUserMessage or the fallback 'The study session could not be started.' (StudyPage.tsx:122-124,294-298).
- History load failure shows 'Your study history could not be loaded.' (StudyPage.tsx:93); empty history shows 'Nothing yet. Subjects you study show up here.' (StudyPage.tsx:309-311).
- Mobile shows 'Your recent study sessions could not be loaded.' with 'Try again' (StudyScreen.tsx:305-334).

**Settings**

- Web sidebar item can be hidden (hideable) (app-nav-items.ts:149).
- CLI config key output-style (apps/cli/src/config.rs:1543).
- VS Code state key agiWorkforce.outputStyles stores the selected style (outputStyles.ts:25).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web page: topic, mode, level, start, history, leave, resume, delete (apps/web/features/study/components/StudyPage.tsx:71-368).
- Chat creation sends a CSRF token via addCsrfHeaders (StudyPage.tsx:56), so the brief's note that start always fails on a missing CSRF token no longer matches the code.
- Session API: GET list or by conversationId, POST start, DELETE end, with CSRF check on POST and DELETE, rate limit, zod validation and user-scoped DB (apps/web/app/api/study/sessions/route.ts:28-118).
- The chat service reads the open session and injects the study instruction as a 'developer' layer block in the managed system preamble (store:86-101; request-processor.ts:2107-2131,3820,6562-6569).
- Starting twice on one chat re-opens it with the new values rather than failing (study-session-store.ts:103-144).
- Mobile Cloud screen, banner, service and Add-to-chat entry (StudyScreen.tsx; StudyModeBanner.tsx; service.ts:27-63).
- CLI output style 'study' exists and is in the built-in list (output_styles.rs:55-60,99-105); VS Code output style 'Study' exists (outputStyles.ts:21).

**Incomplete**

- CLI and VS Code give a prompt-only style with no subject, mode or level fields and no session record (output_styles.rs:55-60; outputStyles.ts:21).
- Mobile start has no course-material menu and no study-plan checkbox (StudyScreen.tsx:207-298), and no 'Leave study mode' list on the screen (only on the chat banner).
- composeStudyPrompt (precedence-resolved prompt) is exported but only tests import it; production uses composeStudyInstruction (grep: apps/web/features/study/lib/study-session.ts:82; index.ts; study-session.test.ts).

**Present but disconnected or switched off**

- Migration 0247 header says 'NOT YET APPLIED : draft only' (apps/web/db/neon/0247_study_sessions.sql:4); the code reads study_sessions, so whether the table exists in each environment is unknown from the repo.

**Not available**

- Chrome extension: no Study entry found.
- Desktop Tauri build: no study files under apps/desktop/src (grep returned none); Electron shows the web page [inferred].
- Mobile Local mode: Study is refused with a switch-to-Cloud prompt (StudyScreen.tsx:175-202).
- Own-key (BYOK) turns: not traced; unknown whether the study instruction reaches a BYOK web turn.

## 4. Required behaviour

**Established requirements**

- A Study entry point starts a tutoring session that changes how the model teaches (S38.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.01)
- The user states what they want to learn before a session starts (S38.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.02)
- The user picks the subject (S38.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.03)
- The user sets their level or background and the tutor adapts (S38.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.04)
- Leaving study mode keeps the conversation readable in normal chat. (source: doc: apps/web/db/neon/0247_study_sessions.sql header 'Ended')
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing silently routes a Local chat to cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Start studying is disabled until the subject has non-blank text and is locked while starting.
2. After start, a new chat titled 'Learn it: <subject>' (or the chosen mode label) opens and GET /api/study/sessions?conversationId=<id> returns the session with the chosen mode and level.
3. A model turn in that chat carries the study instruction; after 'Leave study mode' the next turn does not.
4. Resume restores the same topic, mode and level.
5. A failure to create the chat or session shows a red message and leaves the form usable.
6. Mobile in Local mode shows 'Study runs in AGI Cloud' and starts nothing.
7. A subject longer than 200 characters is cut to 200.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The study instruction should reach every model the user picks because it is plain text in the system prompt [inferred from request-processor.ts:2107-2131].
- Desktop parity depends on the hosted web page being the same one [inferred from AGENTS.md section 5].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give CLI and VS Code a real session (subject, mode, level) rather than one fixed style, or mark them as 'style only' in the brief.
- [proposed] Update the brief: S38.01-S38.04 are built on mobile Cloud and the S38.08 'always fails' note is stale.
- [proposed] Decide whether Local mode on mobile may run Study with on-device models; the instruction is prompt text, so nothing in it requires our servers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | StudyPage | `apps/web/features/study/components/StudyPage.tsx` | Web form, history, leave, resume, delete. |
| screen | Study route | `apps/web/app/chat/study/page.tsx` | Next.js route /chat/study, noindex, wraps StudyPage in WebAppShell. |
| config | Sidebar item 'study' | `apps/web/shared/components/layout/app-nav-items.ts` | Nav entry labelled Study, hideable; /chat/study listed as chat section. |
| service | studyApi | `apps/web/features/study/services/study-api.ts` | Browser client for /api/study/sessions with CSRF headers. |
| endpoint | api:GET/POST/DELETE /api/study/sessions | `apps/web/app/api/study/sessions/route.ts` | List, start and end sessions; validates with zod; rate limit chat-conversation-list. |
| service | study-session-store | `apps/web/features/study/server/study-session-store.ts` | SQL for list, read, start (upsert), end, and readActiveStudyInstruction. |
| service | composeManagedSystemPreamble | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Puts the study instruction in the system prompt of each managed chat turn. |
| other | study-session lib | `apps/web/features/study/lib/study-session.ts` | Mode and level instruction text, composeStudyInstruction, composeStudyPrompt, plan request. |
| other | Shared study types | `packages/contracts/types/src/study.ts` | Modes, levels, labels, 200-character limit, title and sort helpers. |
| table | table:study_sessions | `apps/web/db/neon/0247_study_sessions.sql` | One row per conversation: topic, mode, level, started_at, ended_at; RLS by user. |
| component | StudyModeIndicator | `apps/web/features/study/components/StudyModeIndicator.tsx` | In-chat status and leave/resume control. |
| hook | useConversationStudySession | `apps/web/features/study/hooks/use-conversation-study-session.ts` | Loads, leaves and resumes the session for the open chat. |
| screen | StudyScreen | `apps/mobile/src/features/study/StudyScreen.tsx` | Mobile form (Cloud only) and recent sessions. |
| component | StudyModeBanner | `apps/mobile/src/features/study/StudyModeBanner.tsx` | Mobile in-chat leave/resume control. |
| service | mobile study service | `apps/mobile/src/features/study/service.ts` | zod-checked calls to /api/study/sessions. |
| component | AddToChatSheet entry | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | 'Study and learn' row, Cloud mode only. |
| config | CLI output style study | `apps/cli/src/output_styles.rs` | Built-in style that loads study.md. |
| other | study.md | `crates/agiworkforce-agent-core/assets/output_styles/study.md` | Prompt text shared by CLI and VS Code. |
| config | VS Code output styles | `apps/extension-vscode/src/features/sidebar-webview/outputStyles.ts` | Lists Study among output styles and sends it as instructions. |
| test | Web study tests | `apps/web/features/study/components/StudyPage.test.tsx` | Page behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the form and presses Start studying; the browser creates a conversation via POST /api/chat/conversations. | device and our servers | apps/web/features/study/components/StudyPage.tsx:49-69,109-111 |
| Browser POSTs /api/study/sessions; server validates, checks CSRF and rate limit, and inserts or updates the study_sessions row only for a live, non-temporary conversation the user owns in the active workspace. | our servers | apps/web/app/api/study/sessions/route.ts:75-98; study-session-store.ts:114-144 |
| Page navigates to /chat/<id>. The chat page reads the session and shows the indicator. | device and our servers | StudyPage.tsx:121; use-conversation-study-session.ts:36-52 |
| On each turn the chat completions service reads the open session in the same call that checks conversation ownership, builds the instruction text and adds it as a developer-layer block in the system preamble. | our servers | request-processor.ts:3802-3820,6562-6569; study-session-store.ts:86-101 |
| The chosen model produces the reply following the instruction. | outside service | The model call is made by the managed route; provider not traced in this pass (unknown which provider per turn). |
| Leave study mode sets ended_at; the next turn finds no open session and adds nothing. | our servers | study-session-store.ts:147-159; route.ts:100-114 |
| CLI and VS Code prepend the study.md text as an output style to the prompt locally; no session record exists. | device | output_styles.rs:55-60; outputStyles.ts:127-133 (instructions sent with the input) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Study session (topic, mode, level, started_at, ended_at) | table:study_sessions in the web database | Read by web, Electron and mobile through the same API | Deleted with its conversation (on delete cascade); leaving sets ended_at only; hidden while the chat is soft-deleted (study-session-store.ts:52-63; migration 0247). |
| The chat and its messages | web_conversations and web_messages | Same as any chat | Normal chat retention; delete asks for confirmation on web (StudyPage.tsx:148-165). |
| Selected output style (CLI, VS Code) | CLI config; VS Code global state key agiWorkforce.outputStyles | No sync found | Until changed. |

**Models and providers.** The study instruction is plain system-prompt text, so it does not name or depend on any model. Which model answers is chosen by the chat service routing, not by Study (request-processor.ts:2107-2131). Provider per turn not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile need a signed-in account (user-scoped DB in route.ts:54). CLI and VS Code: none for the style itself. |
| Permissions | Each session is limited to its owner by row-level security and by user_id and organization checks in every query (0247_study_sessions.sql; study-session-store.ts:46-101). |
| Subscription | none found in the code: no plan check in StudyPage.tsx, the study route or the store. Chat turns follow the normal chat rules, which were not traced here. |
| Limits and metering | Topic max 200 characters (packages/contracts/types/src/study.ts:7); list returns up to 50 sessions (study-session-store.ts:49); route uses the 'chat-conversation-list' rate limit (route.ts:51,77). Study turns are ordinary chat turns for usage accounting [inferred; metering not traced]. |
| Feature flags | none found in the code for Study itself; the sidebar item is user-hideable (app-nav-items.ts:149). |
| Model compatibility | Any model that accepts a system prompt [inferred]; no model check in Study code. |
| Provider restrictions | none found in the code in the Study files; whether the preamble is applied on the own-key path is unknown. |
| Local mode | Mobile Local mode: Study is blocked with 'Study runs in AGI Cloud' (StudyScreen.tsx:175-202). Web has no Local mode. CLI and VS Code style works wherever the chat works because it is device-side prompt text [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Starting...' button and spinner on web; history spinner 'Loading your study history'; mobile LoadingIndicator. | StudyPage.tsx:289-291,307; StudyScreen.tsx:281,300 |
| Empty history | 'Nothing yet. Subjects you study show up here.' | StudyPage.tsx:309-311 |
| Error on start | Red alert; form re-enabled (setStarting(false)). | StudyPage.tsx:122-125 |
| Error loading history | Web shows message and empty list; mobile shows message and 'Try again'. | StudyPage.tsx:91-94; StudyScreen.tsx:305-334 |
| Leave reply lost | Hook re-reads the session and shows 'off' if it was saved. | use-conversation-study-session.ts:63-70 |
| Conversation not visible or temporary | POST answers 404 'Conversation not found'. | route.ts:94-96; study-session-store.ts:125-143 |
| Offline / timeout / cancel | not handled in the code beyond the generic error message; no cancel for an in-flight start. | StudyPage.tsx:103-126 |
| Accessibility | Radio group with aria-checked, role=alert on errors, min-h-11 touch targets, sr-only description on leave; mobile radio roles and labels. | StudyPage.tsx:203-212,295; StudyModeIndicator.tsx:73-77; StudyScreen.tsx:51-53 |
| Mobile Local mode | Switch-to-Cloud prompt instead of the form. | StudyScreen.tsx:175-202 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/study/components/StudyPage.test.tsx`: Form fields, disabled start, start flow, failure message, history order, leave, resume, delete confirm.
- `apps/web/features/study/components/StudyModeIndicator.test.tsx`: In-chat indicator, leave, resume, lost reply, chat switch.
- `apps/web/features/study/lib/study-session.test.ts`: Topic limits, title, instruction text, precedence helper.
- `apps/web/features/study/server/study-session-store.test.ts`: Scoping, soft-deleted chats, start refused on foreign, other-workspace, deleted or temporary chats.
- `apps/web/app/api/study/sessions/__tests__/route.test.ts`: List, by-conversation, start, 404, validation, end.
- `apps/web/db/neon/study-sessions-migration.test.ts`: Table constraints, RLS, cascade, down migration (reads the SQL file).
- `apps/mobile/src/features/study/__tests__/Study.test.tsx`: Mobile start, new-chat model, form reset, history retry, Local mode and signed-out prompts, banner.
- `apps/web/e2e/study-and-invoices.spec.ts`: Opens /chat/study; it looks for text 'study session is an ordinary conversation' which does not appear in StudyPage.tsx, so it may be out of date (unknown, not run).
- `apps/cli/src/output_styles.rs`: Unit test that the built-in list includes study.

**Test scenarios**

- **Start from web**
  1. Open /chat/study.
  2. Type 'Cell biology', keep Learn it and New to it.
  3. Press Start studying.
  - Expected: Chat 'Learn it: Cell biology' opens with 'Studying: Cell biology' indicator; first reply teaches one idea and asks one question.
- **Blank subject**
  1. Open /chat/study.
  2. Type spaces only.
  - Expected: Start studying stays disabled.
- **Leave and resume**
  1. In a study chat press 'Leave study mode'.
  2. Send a normal question.
  3. Press 'Turn study mode back on'.
  - Expected: Indicator shows off note, replies are normal, then tutoring returns with same topic.
- **Mobile Local mode**
  1. On mobile switch to Local mode.
  2. Open Study and learn from the sheet (if shown) or the /study route.
  - Expected: 'Study runs in AGI Cloud' with a switch button; no session is created.
- **Start failure**
  1. Block /api/study/sessions with a 500 in devtools.
  2. Press Start studying.
  - Expected: Red message under the button and the form is usable again.
- **CLI style**
  1. Run the CLI, set output-style study, ask 'teach me recursion'.
  - Expected: Reply asks what you already know and guides with questions.

**Where to look when it fails**

- Error text 'The study conversation could not be created.' (StudyPage.tsx:66) means chat creation failed.
- 404 'Conversation not found' from POST /api/study/sessions.
- Rows in table:study_sessions (ended_at null means open).
- If tutoring is missing on a turn, check readActiveStudyInstruction result and that conversation_id is sent with the chat request.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)
- CLI: [70-qa/test-plans/cli/038-learning-and-study-products.md](../../70-qa/test-plans/cli/038-learning-and-study-products.md)
- No hands-on plan yet for Mobile, VS Code: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **Brief marks mobile S38.01-S38.04, CLI S38.02-04 and VS Code as missing/partial; code shows mobile Cloud built, VS Code and CLI style-only.** Affects: Testers and planners using the brief. Evidence: apps/mobile/src/features/study/StudyScreen.tsx; outputStyles.ts:21. Work needed: Correct the brief rows.
- **CLI and VS Code have no subject, mode or level setup or session history.** Affects: CLI, VS Code. Evidence: output_styles.rs:55-60. Work needed: Design a session concept or accept style-only.
- **Mobile Local mode cannot study.** Affects: Mobile Local users (free of subscription by requirement). Evidence: StudyScreen.tsx:175-202. Work needed: Product decision and on-device path; study_sessions needs the server today.
- **No Chrome extension entry.** Affects: Chrome. Evidence: no matches in apps/extension. Work needed: Decide if needed.
- **Migration 0247 states not applied; web e2e text may be stale.** Affects: All server-backed apps. Evidence: 0247_study_sessions.sql:4; e2e/study-and-invoices.spec.ts:16. Work needed: Confirm applied state per environment; fix e2e.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- table:study_sessions
- api:GET /api/study/sessions
- api:POST /api/study/sessions
- api:DELETE /api/study/sessions
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- SYS-execution-boundaries
- F038-04

## Unknown

- Whether table study_sessions exists in production (migration header says not applied).
- Whether the study instruction applies to own-key web turns.
- Which provider answers a study turn.
- How mobile createConversation stores the chat (server or local) before the session POST.
- Whether Electron desktop shows the Study sidebar item exactly as web.
- Whether the web e2e spec passes.
