---
id: "F038-02"
type: "feature"
title: "Course material for the session"
aliases: ["Course material", "From project: <name>", "study project link", "S38.05"]
area: "38 Learning and study products"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S38.05"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "table:web_conversations", "api:POST /api/chat/conversations", "SYS-memory-projects-and-context", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "F038-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F038-02 Course material for the session

On the web Study page, if the person has projects, a 'Course material' menu lets them start the study chat inside a project. The chat service then loads that project's context and knowledge files into the model turn, and the study instruction tells the tutor to teach from it. The page itself uploads nothing.

Area: [38. Learning and study products](README.md). Requirement items: [S38.05](../../10-requirements/capabilities/038-learning-and-study-products.md#s3805).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates the study chat with a projectId so the chat belongs to the chosen project (StudyPage.tsx:109-111). On each turn the chat service loads project context for that conversation and adds its blocks and citations (request-processor.ts:3862-3881).

**Why it exists.** So a student can teach from their own notes, syllabus or slides, kept in a project, instead of from the model's general knowledge.

**Who uses it.** Web (and Electron desktop) learners who already have a project with files. Mobile has no such menu.

**Problems it solves**

- Tutor ignores the learner's own course
- Re-attaching files each time

**Use cases**

- A student keeps lecture slides in a project 'Bio 101' and starts a Revise it session from it.
- A teacher keeps a syllabus in a project and studies against it.

## 2. User experience

**Where to find it**

- Web: Study page, 'Course material' menu, shown only when at least one project exists (StudyPage.tsx:245).
- Desktop: same page via hosted web [inferred].
- Mobile, CLI, VS Code, Chrome: not found (StudyScreen.tsx has no project field).

**Before you start**

- A project already created (projects come from useChatProjectStore; who loads the store is not traced).
- Files or notes added to that project elsewhere (app/chat/projects).

**Screens and controls**

- 'Course material' select with 'None' and 'From project: <name>' options (StudyPage.tsx:250-263).
- Helper text 'Add notes, a syllabus or slides to a project, and the session teaches from them.' (StudyPage.tsx:264-266).

**Journey**

1. Add notes or slides to a project (outside Study).
2. Open Study, type the subject.
3. Pick 'From project: <name>' in Course material.
4. Press Start studying; the chat opens inside the project.
5. Ask questions; replies teach from the project material.

**What the person sees and gets**

- No confirmation that material was read on the Study page.
- The chat may show project sources as citations (projectSources built from rendered.citations, request-processor.ts:3880-3881); how they display was not traced.

**Settings**

- None on the Study page. Project contents are managed in the Projects area.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Menu appears only when projects.length > 0 (StudyPage.tsx:245).
- projectId is passed to POST /api/chat/conversations (StudyPage.tsx:57; apps/web/app/api/chat/conversations/route.ts:230-242 validates ownership).
- Chat service loads project context (instructions, knowledge files) and fits it to a size limit (request-processor.ts:3862-3881).
- Study instruction tells the model to teach from attached or project material and say where each point comes from (study-session.ts:48).

**Incomplete**

- No upload on the Study page; the person must use Projects (StudyPage.tsx has no file input).
- If the project is archived or deleted the turn fails with 'project_context_unavailable' (request-processor.ts:3862-3870 region) and Study shows no special handling.
- Size cap on project context (MAX_PROJECT_CONTEXT_CHARS) may drop material; effect on long courses not traced.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile: no course-material menu (StudyScreen.tsx:207-298).
- CLI, VS Code, Chrome: nothing found.

## 4. Required behaviour

**Established requirements**

- The user can give course material (notes, syllabus, slides) for the tutor to teach from (S38.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S38.05)
- Project context in a chat is limited to the owner's own live project; an unavailable project blocks the turn. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3862-3870)

**Acceptance criteria**

1. With no projects, the Course material menu is absent.
2. With a project, choosing it and starting creates a chat whose project_id is that project.
3. A reply in that chat cites or refers to the project's material.
4. Choosing None creates a chat with no project.
5. Choosing an archived project shows an error rather than a silent ordinary chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Material added after the session starts is picked up on later turns because context loads each turn [inferred from loadProjectContext per turn].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Allow attaching files directly on the Study page.
- [proposed] Offer the same menu on mobile.
- [proposed] Show on the Study page how many files the project holds.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | StudyPage course menu | `apps/web/features/study/components/StudyPage.tsx` | Menu and projectId passing. |
| store | useChatProjectStore | `packages/ui/unified-chat (imported at StudyPage.tsx:5)` | Provides the projects list; loader not traced. |
| endpoint | api:POST /api/chat/conversations | `apps/web/app/api/chat/conversations/route.ts` | Creates the chat with project_id after ownership check. |
| service | loadProjectContext | `apps/web/lib/services/project-context-service.ts` | Loads project instructions and knowledge files. |
| service | request-processor project block | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Renders project blocks and citations into the turn (lines 3862-3881). |
| other | TEACHING_PRACTICES | `apps/web/features/study/lib/study-session.ts` | Instruction line 'teach from that material and say where in it each point comes from'. |
| table | table:web_conversations | `apps/web/app/api/chat/conversations/route.ts` | Holds project_id for the chat. |
| screen | Projects page | `apps/web/app/chat/projects/[id]/page.tsx` | Where material is added. |
| test | StudyPage.material.test | `apps/web/features/study/components/StudyPage.material.test.tsx` | Project passed to createConversation. |
| service | createConversationForStudy | `apps/web/features/study/components/StudyPage.tsx` | Fetch with CSRF headers including projectId. |
| test | StudyPage.test | `apps/web/features/study/components/StudyPage.test.tsx` | General page tests. |
| service | readActiveStudyInstruction | `apps/web/features/study/server/study-session-store.ts` | Study instruction that sits beside the project block. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a project and presses Start; the browser creates a conversation with projectId. | device and our servers | StudyPage.tsx:49-58,109-111 |
| Server checks the project belongs to the user and workspace and stores project_id on the chat. | our servers | apps/web/app/api/chat/conversations/route.ts:230-294 |
| On each turn the service loads project context (instructions, knowledge files) for the chat's project. | our servers | request-processor.ts:3862-3881 |
| Study instruction (developer layer) and project block (project layer) are ordered into the system prompt. | our servers | request-processor.ts:2121-2127 |
| Model replies using that text. | outside service | provider not traced |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Link chat to project (project_id) | web_conversations | Server side, visible to all apps on the account | With the conversation; project deletion handling not traced. |
| Project files and notes | Project knowledge storage (not traced) | Server | Managed in Projects. |

**Models and providers.** Material is text in the prompt, so any model sees it; very long material is cut to a character limit (MAX_PROJECT_CONTEXT_CHARS, request-processor.ts:3880). Whether non-text files are readable depends on project file extraction, not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web account. |
| Permissions | Project must belong to the user and active workspace (route.ts:234-242). |
| Subscription | none found in the code on the Study page; project knowledge file limits by plan were not traced. |
| Limits and metering | Project context is trimmed to MAX_PROJECT_CONTEXT_CHARS (request-processor.ts:3880); more not traced. |
| Feature flags | none found in the code. |
| Model compatibility | Any model; larger context models see more [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Web has no Local mode. Mobile Local mode cannot start Study at all (StudyScreen.tsx:175-202). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No projects | Menu hidden. | StudyPage.tsx:245 |
| Project archived or deleted at turn time | Turn answers 409 project_context_unavailable; Study page has no special handling. | request-processor.ts:3862-3870 |
| Project unknown to server at start | Conversation creation fails, page shows 'The study conversation could not be created.' | route.ts:234-242; StudyPage.tsx:66 |
| Empty project (no files) | not handled in the code on the Study page; chat proceeds with project instructions only [inferred]. | request-processor.ts:3878 |
| Offline/retry | not handled in the code beyond the error message. | StudyPage.tsx:122-125 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/study/components/StudyPage.material.test.tsx`: Selecting a project passes projectId to chat creation; instruction mentions source material.
- `apps/web/features/study/components/StudyPage.test.tsx`: Page start flow without a project.

**Test scenarios**

- **Menu hidden without projects**
  1. Use an account with no projects.
  2. Open /chat/study.
  - Expected: No 'Course material' control.
- **Teach from project**
  1. Create a project with a short notes file containing a unique term.
  2. Start a Learn it session from it.
  3. Ask 'what do my notes say about <term>'.
  - Expected: Reply uses the note and says where it came from.
- **Archived project**
  1. Start a session from a project.
  2. Archive the project.
  3. Send a message.
  - Expected: Error about the project being unavailable.
- **None option**
  1. Select None, start.
  - Expected: Chat has no project.

**Where to look when it fails**

- Error code project_context_unavailable (409).
- web_conversations.project_id for the chat.
- Project context load logs in project-context-service (not read).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/038-learning-and-study-products.md](../../70-qa/test-plans/web/038-learning-and-study-products.md)
- Desktop: [70-qa/test-plans/desktop/038-learning-and-study-products.md](../../70-qa/test-plans/desktop/038-learning-and-study-products.md)

## 10. Gaps and dependencies

- **Brief says S38.05 missing on every app; web wiring exists but no direct material upload and not verified end to end.** Affects: Web, Desktop. Evidence: StudyPage.tsx:245-267. Work needed: Run the scenarios; fix brief.
- **No menu on mobile, CLI, VS Code, Chrome.** Affects: those apps. Evidence: StudyScreen.tsx. Work needed: Add project choice on mobile.
- **Archived-project failure is not explained on the Study page.** Affects: Web. Evidence: request-processor.ts:3862-3870. Work needed: Message that points back to the project.
- **Context cap may cut long course material without telling the learner.** Affects: Web. Evidence: request-processor.ts:3880. Work needed: Show truncation.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- table:web_conversations
- api:POST /api/chat/conversations
- SYS-memory-projects-and-context
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- F038-01

## Unknown

- How the project store is populated on the Study page.
- Which file types the project loader can read.
- Value of MAX_PROJECT_CONTEXT_CHARS.
- Whether project knowledge limits depend on plan.
- Whether citations show in the chat UI for study turns.
