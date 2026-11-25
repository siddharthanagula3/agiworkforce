---
id: "AREA-038"
type: "area"
title: "Learning and study products"
features: ["F038-01", "F038-02", "F038-03", "F038-04", "F038-05", "F038-06", "F038-07", "F038-08", "F038-09", "F038-10", "F038-11", "F038-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 38. Learning and study products

Study mode lets a person pick a subject, say how they want to learn it and how far they already got, and then have the assistant teach it in a chat that keeps to that method. It asks one question at a time, gives hints before answers, and can offer a study plan. The session is a normal chat conversation with a small extra record that marks it as a study session, so the person can find it again, leave the mode, or resume it.

**Who uses it.** Signed-in users. The API routes require a logged-in user and use the user-scoped database (apps/web/app/api/study/sessions/route.ts:57-104). The interaction registry lists the study entitlement as managed_chat and trust mode as managed only (packages/contracts/types/src/interaction-modes.json:381-420), so Study mode is a Cloud feature, not a Local or own-key one. The code read here does not show the entitlement being checked in the study route, so the plan gate is not confirmed. Workspace admins, developers and paid-plan-only rules: not found in this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F038-01](F038-01-start-a-study-session.md) | Start a study session | built | built | partly | partly | partly | no |
| [F038-02](F038-02-course-material-for-the-session.md) | Course material for the session | partly | partly | no | no | no | no |
| [F038-03](F038-03-study-plan-and-diagnostic.md) | Study plan and diagnostic | partly | partly | no | no | no | no |
| [F038-04](F038-04-guided-teaching-style.md) | Guided teaching style | partly | partly | partly | partly | partly | no |
| [F038-05](F038-05-practice-questions-and-answer-feedback.md) | Practice questions and answer feedback | built | built | built | no | no | no |
| [F038-06](F038-06-quiz-question-types-and-quiz-editing.md) | Quiz question types and quiz editing | built | built | partly | no | no | no |
| [F038-07](F038-07-flashcards.md) | Flashcards | built | built | partly | no | no | no |
| [F038-08](F038-08-progress-and-weak-topics.md) | Progress and weak topics | partly | partly | partly | no | no | no |
| [F038-09](F038-09-spoken-explanation-and-language-exercises.md) | Spoken explanation and language exercises | partly | partly | partly | partly | no | no |
| [F038-10](F038-10-narrated-and-illustrated-stories.md) | Narrated and illustrated stories | no | no | no | no | no | no |
| [F038-11](F038-11-print-and-share-study-materials.md) | Print and share study materials | partly | partly | no | no | no | no |
| [F038-12](F038-12-follow-up-questions-after-a-quiz.md) | Follow-up questions after a quiz | partly | partly | built | no | no | no |

Requirement items for this area: [10-requirements/capabilities/038-learning-and-study-products.md](../../10-requirements/capabilities/038-learning-and-study-products.md).

## How this area works in the code

1. **Person opens the Study page and starts a session.** The page takes the subject, mode, level, optional project and optional plan tick. Start is blocked until the subject is non-empty. The page first creates a chat conversation, then records a study session for it. (`apps/web/features/study/components/StudyPage.tsx:49-69`, `apps/web/features/study/components/StudyPage.tsx:103-126`, `apps/web/features/study/components/StudyPage.tsx:182-280`)
2. **Conversation is created with a CSRF header.** The page calls the chat conversations endpoint with a CSRF token header. The server checks the token before creating the chat (requireCsrfToken). The study code sends the same header on its own start call. (`apps/web/features/study/components/StudyPage.tsx:53-58`, `apps/web/app/api/chat/conversations/route.ts:196-197`, `apps/web/lib/csrf.ts:218-241`)
3. **Study record is written to the server.** The client calls /api/study/sessions with POST. The route checks CSRF and a rate limit, validates the body with a schema (topic 1-200 characters, mode and level enums), and writes one row for the conversation. A conversation can have only one study row (unique conversation_id in the migration). (`apps/web/features/study/services/study-api.ts:16`, `apps/web/features/study/services/study-api.ts:42-50`, `apps/web/app/api/study/sessions/route.ts:31-33`, `apps/web/app/api/study/sessions/route.ts:75-89`, `apps/web/features/study/server/study-session-store.ts:46-54`, `apps/web/db/neon/0247_study_sessions.sql:33-40`)
4. **Teaching instruction is composed.** The study code builds the teaching text from the subject, mode, level, a fixed rule (no answer before the learner tries) and a list of teaching practices. The account's own instruction and the current request are passed through the same precedence resolver, so the study text can lose a conflict. (`apps/web/features/study/lib/study-session.ts:28-70`, `apps/web/features/study/lib/study-session.ts:89-113`)
5. **Person chats; the server reads the active study row.** When a chat message is sent, the server looks up the conversation and, in the same step, reads the active study row (ended_at is null). If one exists, the instruction is added as a developer-layer message. The free-usage path does the same. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2111-2122`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3802-3816`, `apps/web/features/study/server/study-session-store.ts:86-98`, `apps/web/lib/server/free-quota-turn.ts:1061-1075`)
6. **Leave or resume the mode.** Leave calls DELETE on the same route, which sets ended_at. The conversation and its messages stay. Resume calls POST again on the same conversation, which the code expects to reactivate the mode. The chat page shows an indicator with a leave or resume button. (`apps/web/features/study/services/study-api.ts:51-59`, `apps/web/app/api/study/sessions/route.ts:96-104`, `apps/web/features/study/components/StudyModeIndicator.tsx:1-30`, `apps/web/features/chat/pages/WebChatPage.tsx:2213-2216`)
7. **Delete a session.** Delete on the Study page asks for confirmation through the shared confirm dialog, then deletes the whole chat conversation. The session row goes with it through the foreign key. (`apps/web/features/study/components/StudyPage.tsx:148-165`, `apps/web/db/neon/0247_study_sessions.sql:33-40`)
8. **Quiz and flashcard blocks are drawn by viewers.** The model is asked to write quiz and flashcard blocks. Shared types and limits define their shape. Web and mobile have viewer components for them. The viewers were not read in this pass. (`apps/web/features/study/lib/study-session.ts:52-53`, `packages/ui/unified-chat/src/lib/study-set.ts:1-44`, `apps/web/features/chat/components/artifacts/study/QuizView.tsx`, `apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/study/components/StudyPage.tsx` | Study page: subject, mode, level, project, plan tick, start, session list, leave, resume, delete. |
| `apps/web/features/study/lib/study-session.ts` | Teaching text per mode and level, prompt composition with precedence, plan request text, labels. |
| `apps/web/features/study/services/study-api.ts` | Browser client for /api/study/sessions (list, start, end, look up by conversation). |
| `apps/web/app/api/study/sessions/route.ts` | Server GET, POST, DELETE for study sessions, with CSRF and rate limits. |
| `apps/web/features/study/server/study-session-store.ts` | Database reads and writes for study rows, and the active instruction lookup used by chat. |
| `apps/web/db/neon/0247_study_sessions.sql` | Table definition and row-level security. Header says NOT YET APPLIED. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Chat request path that adds the study instruction to the model request. |
| `packages/contracts/types/src/study.ts` | Shared modes, levels, labels, topic limit and session type used by web and mobile. |
| `packages/contracts/types/src/interaction-modes.json` | Registry entry for the Study mode: route, entitlement, trust mode, offline and resume rules. |
| `apps/mobile/src/features/study/service.ts` | Mobile client for the same study API. |
| `crates/agiworkforce-agent-core/assets/output_styles/study.md` | Study output style text used by the CLI and VS Code. |

## What is stored

- Study session row: id, user id, conversation id (unique), topic (1-200 chars), mode, level, started_at, ended_at (null while active).: Database table public.study_sessions, defined in apps/web/db/neon/0247_study_sessions.sql:33-40. Row-level security by user (lines 51-58). The migration file says NOT YET APPLIED (line 4), so presence in a given environment is unverified.
- The chat conversation and its messages.: web_conversations and web_messages (not read in this pass; named in the migration header).
- Draft plan request text before send.: Chat draft store via setDraftContent (apps/web/features/study/components/StudyPage.tsx:113-120). Persistence of the draft was not traced.
- Deletion and export coverage.: Listed in apps/web/lib/services/deletion-manifest.ts:89, apps/web/lib/server/account-erasure.ts:175, apps/web/app/api/user/export/route.ts:2211-2214, and packages/contracts/types/src/domain-registry.json:341.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Study entitlement (plan gate)**: Registry says managed_chat entitlement. Enforcement in the study route was not seen. (packages/contracts/types/src/interaction-modes.json:381-420)
- **Feature maturity**: Registry marks the study feature as general_availability with no rollout flag. (packages/contracts/types/src/feature-registry.json:346-352)
- **Topic length limit**: 200 characters max, enforced in the page, the client and the server schema. (packages/contracts/types/src/study.ts:7; apps/web/app/api/study/sessions/route.ts:31)
- **Rate limits**: Study route uses a chat-conversation-list limit on GET, POST and DELETE. Conversation create uses a chat-conversation limit. (apps/web/app/api/study/sessions/route.ts (rate-limit calls in each handler); apps/web/app/api/chat/conversations/route.ts:196-200)
- **Course material menu**: Shown only when the person has at least one project. (apps/web/features/study/components/StudyPage.tsx:245)
- **Study nav entry**: Shows the Study item in the web sidebar. (apps/web/shared/components/layout/app-nav-items.ts:143-148)
- **Mobile Study screen**: Hidden from the drawer (not in the main menu). (apps/mobile/app/(app)/_layout.tsx:105)

## Shared between apps

[{"what":"Modes, levels, labels, topic limit, session type, title builder, sort and active check.","where":"packages/contracts/types/src/study.ts (used by web via @agiworkforce/types, and by mobile)."},{"what":"Teaching prompt and precedence resolver.","where":"Web-only: apps/web/features/study/lib/study-session.ts. The CLI and VS Code use a separate study.md text (crates/agiworkforce-agent-core/assets/output_styles/study.md), which is not the same as the web prompt."},{"what":"Quiz and flashcard data shapes and limits.","where":"packages/ui/unified-chat/src/lib/study-set.ts, shared across apps that use unified-chat."},{"what":"Interaction registry entry.","where":"packages/contracts/types/src/interaction-modes.json (shared contract)."},{"what":"Separate per app: the Study page (web), the mobile StudyScreen and service, the CLI output style code, and the VS Code output style list."}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says the start path always fails for lack of a CSRF token. The page sends the CSRF header (addCsrfHeaders). The conversation route and the study route both require it. Runtime failure was not reproduced (nothing was run). (apps/web/features/study/components/StudyPage.tsx:53-58; apps/web/app/api/chat/conversations/route.ts:196-197; apps/web/app/api/study/sessions/route.ts:76-77)
- Brief says no chat path reads study rows or sends the study instruction. The chat path does read them and inserts the instruction as a developer message. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2122, 3802-3816; apps/web/lib/server/free-quota-turn.ts:1074)
- Migration 0247 says NOT YET APPLIED, but the store and the route read and write public.study_sessions. If the migration is not applied in an environment, study calls there would fail. (apps/web/db/neon/0247_study_sessions.sql:4; apps/web/features/study/server/study-session-store.ts:46-54, 86-98)
- Several brief code references point at the wrong place. request-processor.ts:2892 is a model-tier access check, not study code. app-nav-items.ts:131 is the Sites/Health entry; Study is at lines 143-148. csrf.ts:290 is past the end of the 244-line file. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892; apps/web/shared/components/layout/app-nav-items.ts:131; apps/web/lib/csrf.ts)
- Plan gate is registered as managed_chat, but the study route handlers shown do not check it. Enforcement is not confirmed. (packages/contracts/types/src/interaction-modes.json:394-397; apps/web/app/api/study/sessions/route.ts:57-104)
- Starting a session creates the chat first, then writes the study row. If the second call fails, a chat with no study row is left behind, and the error says the session could not be started. (apps/web/features/study/components/StudyPage.tsx:107-124)
- Brief says mobile and VS Code have no study features. Code exists: mobile has StudyScreen and a study service; VS Code has a Study output style. (apps/mobile/src/features/study/service.ts; apps/mobile/src/features/study/StudyScreen.tsx; apps/extension-vscode/src/features/sidebar-webview/outputStyles.ts:21)
- Brief marks quiz, flashcard and print items as missing everywhere. Viewer and print files exist on web and mobile. Their status is probably partial, but I did not read them. (apps/web/features/chat/components/artifacts/study/QuizView.tsx; apps/web/features/chat/components/artifacts/study/FlashcardsView.tsx; apps/web/features/chat/components/artifacts/study/study-print.ts; apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx)
- Study teaching behaviour (lessons, hints, Socratic flow, worked examples) is prompt text only. The brief's Should items are not enforced by any state or code path. (apps/web/features/study/lib/study-session.ts:28-57)
- Diagnostic quiz, progress dashboard, weak topics, and stories have no code in this area. (Not found in apps/web/features/study or the study routes.)

## Not established

- Whether migration 0247 has been applied in production or any other environment. The header says it is not.
- Whether the plan gate (managed_chat) is enforced anywhere in the request path. Not traced past the study route.
- Runtime behaviour of the start, leave and resume calls. Nothing was run, as the task was read-only.
- What addCsrfHeaders does when the token fetch fails (apps/web/lib/client/csrf.ts was only partly read).
- Quiz, flashcard, editing, print and mobile viewer behaviour. Files were found by search but not opened.
- Mobile StudyScreen behaviour and whether it is reachable (the drawer entry is hidden at _layout.tsx:105).
- Desktop behaviour: brief says done, but the desktop host code was not read.
- Chrome extension: no study code found in the search. Not confirmed by reading the extension folder.
- How the project material is passed to the model (the chat path was not traced past the study instruction).
- How a Local or own-key chat could use Study mode: the registry says managed only, so probably not, but not tested.
- Localhost testing: not done. This pass was read-only, so no build, test or server was run.
