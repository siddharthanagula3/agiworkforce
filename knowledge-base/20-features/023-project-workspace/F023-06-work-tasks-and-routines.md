---
id: "F023-06"
type: "feature"
title: "Work tasks and routines"
aliases: ["Project work", "Work tab", "Start work", "Routines", "Scheduled tab", "Parallel threads", "/thread /threads /gather", "agi background"]
area: "23 Project workspace"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S23.14", "S23.15", "S23.36", "S23.37", "S23.38"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "api:GET /api/llm/v1/chat/completions/runs", "F023-03", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F023-06 Work tasks and routines

A project lists autonomous Work runs started in its chats and the schedules (routines) made for it. Web and mobile have both. The CLI runs parallel child threads with /thread, /threads and /gather and background runs. No app shows blocked child threads with reasons, and steering one thread is not applicable.

Area: [23. Project workspace](README.md). Requirement items: [S23.14](../../10-requirements/capabilities/023-project-workspace.md#s2314), [S23.15](../../10-requirements/capabilities/023-project-workspace.md#s2315), [S23.36](../../10-requirements/capabilities/023-project-workspace.md#s2336), [S23.37](../../10-requirements/capabilities/023-project-workspace.md#s2337), [S23.38](../../10-requirements/capabilities/023-project-workspace.md#s2338).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows a project's Work runs by state, lets people schedule routines in it, and on the CLI starts parallel child threads from one conversation and gathers their results (apps/cli/src/background.rs:342-440).

**Why it exists.** Brief items S23.14, S23.15, S23.36, S23.37, S23.38 (doc: knowledge-base/data/area-briefs/023-project-workspace.md).

**Who uses it.** Web, Desktop (hosted), Mobile and CLI users with a plan that includes Work.

**Problems it solves**

- Seeing what an autonomous task is doing
- Repeating a task on a schedule
- Splitting a job into parallel pieces

**Use cases**

- Start a task on the phone and check its state in the project Work tab.
- Create a daily routine in a project on the web.
- Run /thread 'check the tests' while continuing the main chat in the CLI.
- Run agi background to keep a task going after the terminal closes.

## 2. User experience

**Where to find it**

- Web: project tabs 'Work' and 'Scheduled' (apps/web/app/chat/projects/[id]/page.tsx:50-58).
- Mobile: project tabs 'Work' and 'Routines' for Cloud projects; Start work sheet (apps/mobile/app/(app)/projects/[id].tsx:219-228; apps/mobile/src/features/tasks/components/StartWorkSheet.tsx).
- CLI: slash commands /thread, /threads, /gather, /bg and command agi background (apps/cli/src/claude_parity.rs:140-150; lib.rs:910-915).
- VS Code and Chrome: not available.

**Before you start**

- Cloud project and a plan that includes AGI Work: mobile shows '<Work name> isn't included in your plan.' otherwise (apps/mobile/src/features/projects/components/ProjectWorkTab.tsx:37-39, 80-95).
- CLI threads: the conversation must be saved to the managed session store (background.rs:353-358).

**Screens and controls**

- Web Work list rows: run title, state label, date; empty 'No work yet' with 'Switch a chat in <project> to Work and its runs will be listed here.' (ProjectWorkPanel.tsx:84-110).
- Web Scheduled tab shows SchedulesPage scoped to the project (page.tsx:1356-1375).
- Mobile StartWorkSheet fields: 'Task objective', 'Task constraints', 'Task deliverable', button 'Start task' (StartWorkSheet.tsx:102-247).
- Mobile Routines tab opens the schedule create screen with projectId (ProjectRoutinesTab.tsx:29).

**Journey**

1. Open the project.
2. Web: switch a project chat to Work mode and send; or Mobile: Start work.
3. Open the Work tab to see runs and their states.
4. Open a run to go to its conversation.
5. Routines: open Scheduled or Routines, create a schedule for the project.
6. CLI: type /thread <instruction>, check /threads, then /gather.

**What the person sees and gets**

- State labels from agentTaskStateLabel (ProjectWorkPanel.tsx:150-155).
- CLI thread list: id, state, prompt; gathered flag (background.rs:395-405).
- CLI message when started: 'Started thread <id> on a copy of this conversation...' (background.rs:371-374).

**Settings**

- Schedules page tier checks use the subscription tier (page.tsx:1356-1366).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Work list fetches /api/llm/v1/chat/completions/runs with projectId and all states, limit 50 (ProjectWorkPanel.tsx:52-62).
- Mobile Work tab lists runs through the cloud run client and handles plan exclusion (ProjectWorkTab.tsx:43-60).
- Web Scheduled tab renders SchedulesPage with project scope (page.tsx:1356-1375).
- Mobile Routines tab lists schedules with the project id and links to create or edit (ProjectRoutinesTab.tsx:14-65).
- CLI /thread forks the conversation, starts a background print run with its own session id and parent link (background.rs:342-374, 251-300).
- CLI /threads lists thread state; /gather builds a prompt from finished threads and notes running ones (background.rs:387-460).

**Incomplete**

- Web Work panel has no retry button on error (ProjectWorkPanel.tsx:77-82).
- CLI threads are not tied to an account project; they are tied to a parent session (background.rs:62, 363-369).
- The CLI states are Running, Finished, Failed, Stopped, Lost; no Blocked state or reason (background.rs:37-43).

**Present but disconnected or switched off**

- None found.

**Not available**

- Work tasks listing on CLI and VS Code (brief: missing).
- Routines on CLI and VS Code.
- Overview of blocked child threads (S23.37): no code found on any app.
- Steering one thread (S23.38): not applicable per brief; CLI stop exists only for whole background runs (background state Stopped) [inferred].
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- Autonomous work tasks can be started in a project and the project lists their state. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.14)
- Scheduled routines can be created inside a project and are listed on it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.15)
- Where offered, one coordinating conversation splits work into parallel child threads and brings results back. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.36)
- A project or coordinating thread shows child threads and which are blocked and why. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.37)
- Thread-specific steering is not applicable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S23.38)

**Acceptance criteria**

1. A Work run started in a project chat appears in that project's Work list with its state.
2. A run whose chat is moved to another project leaves the list (ProjectWorkPanel.tsx comment on conversation scope).
3. A plan without Work shows the not-included message on mobile.
4. A schedule made from the project appears in its Scheduled or Routines tab.
5. /thread starts a run; /threads shows it; /gather returns finished answers.
6. Work list error shows a message; empty shows 'No work yet'.
7. Stopped or failed threads are reported with a reason pointer to agent background logs.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A blocked-thread overview needs a Blocked state and reason that the CLI run model lacks [inferred from background.rs:37-43].
- Mobile routines exist so the brief mobile routines missing is outdated [inferred from ProjectRoutinesTab.tsx].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add retry to the web Work panel.
- [proposed] Add a Blocked state with reason to child threads and show it in /threads.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ProjectWorkPanel | `apps/web/features/projects/components/ProjectWorkPanel.tsx` | Web Work list. |
| endpoint | GET /api/llm/v1/chat/completions/runs | `apps/web/app/api/llm/v1/chat/completions/runs` | Run list consumed by Work panels [inferred from fetch path]. |
| component | SchedulesPage | `apps/web/features/schedules/components/SchedulesPage.tsx` | Schedules with project scope. |
| screen | Web project page Scheduled tab | `apps/web/app/chat/projects/[id]/page.tsx` | Hosts Work and Scheduled. |
| component | ProjectWorkTab | `apps/mobile/src/features/projects/components/ProjectWorkTab.tsx` | Mobile Work list. |
| component | StartWorkSheet | `apps/mobile/src/features/tasks/components/StartWorkSheet.tsx` | Start a task. |
| component | ProjectRoutinesTab | `apps/mobile/src/features/projects/components/ProjectRoutinesTab.tsx` | Mobile routines for the project. |
| store | useScheduleStore | `apps/mobile/src/features/schedules` | Schedules fetch used by routines tab. |
| service | createMobileCloudAgentRunClient | apps/mobile/services/streaming (not found) (not found) | Run listing client. |
| service | background runs | `apps/cli/src/background.rs` | start, spawn_thread, threads_summary, gather_prompt. |
| command | slash commands thread, threads, gather, bg | `apps/cli/src/claude_parity.rs` | Command routing (lines 140-150). |
| command | agi background | `apps/cli/src/lib.rs` | Background subcommands (line 910). |
| schema | CloudAgentRun and AgentTaskState | `packages/contracts/cloud-contracts` | Run shapes used by web and mobile. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Work tab asks the server for runs filtered by project id and states. | our servers | apps/web/features/projects/components/ProjectWorkPanel.tsx:52-62 |
| The server runs Work tasks with a managed model; the run row keeps state and conversation id. | our servers | [inferred] runs route path; model execution not traced |
| A schedule is created in the schedules page with the project scope and is stored on the account. | our servers | apps/web/app/chat/projects/[id]/page.tsx:1356-1375 |
| CLI /thread saves the session, forks it, and starts a detached supervisor process that runs agi --print. | device | apps/cli/src/background.rs:251-300, 342-374 |
| The child thread calls the configured model provider like any CLI turn. | outside service | [inferred] child runs the same agent as a print session |
| /gather reads finished sessions and builds a prompt with their last answers. | device | background.rs:409-445 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run rows with state, conversation id, project id | Account server (runs route) | Yes | Not traced |
| Schedules | Account server; mobile store fetchSchedules | Yes | By the user on the schedules page |
| Background runs and logs | CLI state directory (background.rs:73-120) | No | Not traced |

**Models and providers.** Work and routine runs use a managed model chosen by the run, not by the project; the project default model applies to new chats only (WebChatPage.tsx:2127-2143). CLI threads use whichever provider the parent session uses [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile: signed in. CLI threads: local, no account needed for the thread itself. |
| Permissions | Work list uses the user's token; shared project read access not traced. |
| Subscription | Mobile hides Work when the plan lacks the agi_work capability (ProjectWorkTab.tsx:37-39). Web composer downgrades Work mode for plans without AGI Work (page.tsx:236-240 comment). Schedules depend on the subscription tier (page.tsx:1356). |
| Limits and metering | Work list limit 50 on web (ProjectWorkPanel.tsx:53). Run metering: unknown here. |
| Feature flags | None found. |
| Model compatibility | Not traced. |
| Provider restrictions | Work runs in Cloud use managed routes; CLI threads follow the CLI provider. |
| Local mode | Web: not available. Mobile Work tab and Routines show only on Cloud projects (mobile [id].tsx:307, 542). CLI threads work without the account for the child run itself [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web 'Loading work...'; mobile spinner 'Loading work'. | ProjectWorkPanel.tsx:77-82; ProjectWorkTab.tsx:114-117 |
| Error | Web shows the message, no retry; mobile shows message with 'Try again'. | ProjectWorkPanel.tsx:84-90; ProjectWorkTab.tsx:119-148 |
| Empty | 'No work yet'. | ProjectWorkPanel.tsx:92-110 |
| Plan without Work | Mobile not-included message. | ProjectWorkTab.tsx:80-95 |
| Thread lost | State Lost when the process is gone after a launch grace period. | background.rs:233-243 |
| Thread unsaved conversation | Message that the conversation is not being saved. | background.rs:353-358 |
| Run without conversation | Row disabled. | ProjectWorkPanel.tsx:128-130 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/projects/__tests__/ProjectWorkTab.test.tsx`: Mobile Work tab.
- `apps/mobile/src/features/projects/__tests__/ProjectArtifactsRoutines.test.tsx`: Mobile artifacts and routines tabs (by name).
- `apps/cli/src/background.rs`: Inline tests of background runs (not opened; only module exists).
- `apps/web/app/chat/projects/[id]/page.test.tsx`: Web project page (by name).

**Test scenarios**

- **Work list**
  1. Switch a project chat to Work and send
  2. Open the Work tab
  - Expected: Run listed with state and date.
- **No Work plan**
  1. Use a plan without Work on mobile
  2. Open Work tab
  - Expected: Not-included message.
- **Routine in project**
  1. Open Scheduled or Routines
  2. Create a schedule
  - Expected: Listed on the project.
- **CLI threads**
  1. /thread run tests
  2. /threads
  3. /gather
  - Expected: Thread runs; list shows state; gather returns the answer.
- **Blocked thread**
  1. Look for a blocked view
  - Expected: None exists; record as gap.

**Where to look when it fails**

- Web error text 'Could not load this project's work'.
- CLI agi background logs <id> (background.rs gather text).
- Run state labels and the runs route.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/023-project-workspace.md](../../70-qa/test-plans/web/023-project-workspace.md)
- Desktop: [70-qa/test-plans/desktop/023-project-workspace.md](../../70-qa/test-plans/desktop/023-project-workspace.md)
- Mobile: [70-qa/test-plans/mobile/023-project-workspace.md](../../70-qa/test-plans/mobile/023-project-workspace.md)
- CLI: [70-qa/test-plans/cli/023-project-workspace.md](../../70-qa/test-plans/cli/023-project-workspace.md)

## 10. Gaps and dependencies

- **No overview of blocked child threads and reasons.** Affects: All apps. Evidence: background.rs:37-43; brief S23.37. Work needed: Define blocked state and show it.
- **No Work list or routines on CLI and VS Code.** Affects: CLI, VS Code. Evidence: Brief S23.14, S23.15. Work needed: Add listing or mark not applicable.
- **Web Work panel has no retry.** Affects: Web. Evidence: ProjectWorkPanel.tsx:84-90. Work needed: Add retry.
- **Brief says mobile routines missing but tab exists.** Affects: Documentation. Evidence: ProjectRoutinesTab.tsx. Work needed: Update brief.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- api:GET /api/llm/v1/chat/completions/runs
- F023-03
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing

## Unknown

- Runs route handler path and its metering (only the consumer was read).
- Whether CLI inline background tests exist and what they cover.
- Whether child threads on CLI can be filed under an account project.
- How shared project readers see the Work list.
