---
id: "F060-09"
type: "feature"
title: "Save a task as a routine or a skill"
aliases: ["Save a task as a routine or a skill", "Save as routine (S60.27)", "Save as Skill (S60.28)", "Make it a routine", "Learned skills"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S60.27", "S60.28"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "mode:cloud", "mode:local", "file:apps/web/features/schedules/lib/schedule-form.ts", "file:apps/cli/src/skill_learner.rs", "store:agi-tasks-layout", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-subscriptions-entitlements-and-usage", "F060-11", "F060-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-09 Save a task as a routine or a skill

A finished Work task can become a routine: web and mobile open a prefilled schedule form from the task's goal. Saving a task as a skill by user action is not found on any app; the CLI instead learns skills on its own after repeated tool patterns. Desktop (Tauri), VS Code and Chrome have no routine control.

Area: [60. Agentic work product](README.md). Requirement items: [S60.27](../../10-requirements/capabilities/060-agentic-work-product.md#s6027), [S60.28](../../10-requirements/capabilities/060-agentic-work-product.md#s6028).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** On web, 'Save as routine' opens the Schedules page with the task's goal, constraints and deliverable as the prompt. On mobile, 'Make it a routine' opens the new-schedule screen with the task's prompt and model. The CLI writes learned skill files by itself after it sees the same tool pattern in several sessions.

**Why it exists.** A job done once is often wanted weekly. Re-creating it as a schedule by hand loses the exact wording.

**Who uses it.** People who repeat a task; CLI users who want repeated procedures captured.

**Problems it solves**

- Retyping a goal into a schedule form.
- Remembering the original constraints.
- Capturing a repeated tool procedure without writing a skill file by hand.

**Use cases**

- Turn a finished 'watch competitor prices' task into a weekly schedule.
- On a phone, tap 'Make it a routine' on a completed task.
- Use the CLI for several similar jobs and find a learned skill saved under the config folder.

## 2. User experience

**Where to find it**

- Web /tasks: detail panel, Goal box, button 'Save as routine' (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:582-597); destination is the Schedules page (apps/web/features/tasks/components/TasksPage.tsx:72-74).
- Desktop (public Electron app): the hosted web app, same button (doc: AGENTS.md section 5).
- Desktop (Tauri): no button, the transport has no saveAsRoutine (apps/desktop/src/features/tasks/DesktopTasks.tsx:16-41).
- Mobile: task detail sheet, button 'Make it a routine' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:627-634).
- CLI: no command; learned skills appear in the skills list after the post-turn analysis (apps/cli/src/agent/chat.rs:1557-1592; apps/cli/src/skills.rs:694).
- VS Code and Chrome: none found.

**Before you start**

- Web: a finished (not live) Work task whose journal has a Goal entry (TaskDetailPanel.tsx:567).
- Mobile: task state completed, ready_for_review or partial, with a non-empty conversation preview (apps/mobile/src/features/tasks/runPresentation.ts:370-382).
- Schedules on the account; the schedules page waits for billing to load and takes the plan tier (apps/web/features/schedules/components/SchedulesPageWithProjects.tsx:41-62). Which plans may create schedules: unknown.
- CLI learned skills: at least 5 tool calls in the session and the same tool pattern in 3 or more sessions in the last 30 days (apps/cli/src/skill_learner.rs:20-33,73-106).

**Screens and controls**

- Web button label 'Save as routine' with a calendar icon.
- Mobile button 'Make it a routine' with the hint 'Opens a new schedule that runs this task's prompt on a timer'.
- Schedule form prefilled with the prompt; the person still has to choose timing and save (inferred, SchedulesPage not opened).

**Journey**

1. 1. Open a finished Work task.
2. 2. Press 'Save as routine' (web) or 'Make it a routine' (mobile).
3. 3. The Schedules form opens with the prompt filled in.
4. 4. Choose when it runs and save it on the Schedules page.
5. 5. CLI skills: nothing to press; after enough repeated sessions a message 'Learned skill: <name> (confidence: N%)' appears.

**What the person sees and gets**

- Web: navigation to /chat/schedules?fromPrompt=<prompt> (apps/web/features/tasks/components/TasksPage.test.tsx:95-105).
- Mobile: navigation to /(app)/schedules/create with prompt and model params (CloudTasksScreen.tsx:644-653).
- CLI: line 'auto Learned skill: <name> (confidence: N%)' unless quiet (agent/chat.rs:1583-1590).

**Settings**

- CLI learned skills folder: the learned subfolder under the CLI config directory (skill_learner.rs:48).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: onSaveAsRoutine is passed to the detail panel when the transport has saveAsRoutine and the run is an agiwork run; the web transport implements it by pushing the Schedules URL with the prompt from routinePromptFromGoal (goal, then 'Constraints:' and 'Deliverable:' lines) (TasksPage.tsx:668-670,963-967 in packages/ui; apps/web/features/tasks/components/TasksPage.tsx:72-74; apps/web/features/schedules/lib/schedule-form.ts:196-204).
- Web Schedules page reads the fromPrompt query as draftPrompt (apps/web/features/schedules/components/SchedulesPageWithProjects.tsx:37,53).
- Mobile: routineDraftFromRun yields {prompt, model} only for completed, ready_for_review and partial runs with a preview (runPresentation.ts:370-382); handleMakeRoutine closes the sheet and routes to schedules/create (CloudTasksScreen.tsx:644-653).
- CLI: after each turn it counts tool uses, analyses the session, and saves a skill file when a pattern recurs; the file is loaded with user skills (agent/chat.rs:1557-1592; skill_learner.rs:62-175; skills.rs:694-697).
- CLI separately can create schedules by command ('agi schedules create' with a prompt, timezone and model) (apps/cli/src/lib.rs:1516-1535,4384).

**Incomplete**

- Web drops the tools-off choices when building the routine prompt (schedule-form.ts:196-204).
- Mobile builds the routine prompt from the conversation preview, which the contract caps at 200 characters, so a long goal is cut (packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:78,207-214; taskActions.test.ts:39 shows rerun avoids the preview for this reason).
- CLI skill learning passes was_successful as true without checking the outcome (agent/chat.rs:1575-1579).

**Present but disconnected or switched off**

- Tauri desktop transport defines no saveAsRoutine, so the button is hidden there (DesktopTasks.tsx:16-41; TasksPage.tsx:668 in packages/ui).

**Not available**

- Save as Skill from a task by user action: not found on web, desktop, mobile, CLI, VS Code or Chrome.
- Save as routine: not found on VS Code, Chrome or the CLI (CLI has schedule creation but not from a task).
- The brief cites claude_parity.rs:255 and :767 for save as skill; those lines are the managed-cloud fork draft and an install-app message, not skill saving.

## 4. Required behaviour

**Established requirements**

- From a task the user can save it as a routine or schedule that reruns it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.27)
- From a finished task the user can save its procedure as a reusable Skill. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.28)
- Routines and schedules are part of the intended surfaces where the host supports them. (source: doc: docs/product/experience-contract.md:278)

**Acceptance criteria**

1. On web, a finished Work task shows 'Save as routine'; pressing it opens Schedules with the prompt containing goal, constraints and deliverable.
2. The button is hidden while the task is live.
3. On mobile 'Make it a routine' appears only for completed, ready-for-review or partial tasks that have a prompt.
4. Nothing is created until the person saves the schedule.
5. A user action to save a task as a skill exists on at least one app, or the requirement is changed.
6. CLI learned skills appear only after 3 matching sessions and are limited to 50.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The routine should run the same prompt in Work mode; whether the schedule runner starts Work mode is unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass the full goal (not the 200-character preview) and tools-off choices on mobile and web.
- [proposed] Add 'Save as skill' to the task detail that writes a skill from the journal, with review before saving, on web first.
- [proposed] Add the routine button to the Tauri desktop transport using its cloud schedules panel.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | 'Save as routine' button and goal parsing. |
| screen | TasksPage (shared) | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Transport interface saveAsRoutine (line 199) and wiring (668, 963). |
| hook | web tasks transport | `apps/web/features/tasks/components/TasksPage.tsx` | saveAsRoutine pushes the Schedules URL. |
| service | routinePromptFromGoal | `apps/web/features/schedules/lib/schedule-form.ts` | Builds the routine prompt text. |
| service | scheduleFromPromptHref | `apps/web/features/schedules/components/schedule-from-turn.ts` | Builds /chat/schedules?fromPrompt=... |
| screen | SchedulesPageWithProjects | `apps/web/features/schedules/components/SchedulesPageWithProjects.tsx` | Reads fromPrompt and hands draftPrompt to the form. |
| service | mobile routine draft | `apps/mobile/src/features/tasks/runPresentation.ts` | routineDraftFromRun. |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | handleMakeRoutine navigation. |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | 'Make it a routine' button. |
| service | SkillLearner | `apps/cli/src/skill_learner.rs` | Detects repeated tool patterns and writes learned skill files. |
| hook | post-turn skill learning | `apps/cli/src/agent/chat.rs` | Calls analyze_session and save_skill after each turn. |
| service | CLI skills loader | `apps/cli/src/skills.rs` | Loads the learned folder with user skills. |
| command | agi schedules create | `apps/cli/src/lib.rs` | Create a schedule from a prompt on the command line. |
| component | DesktopTasks | `apps/desktop/src/features/tasks/DesktopTasks.tsx` | Tauri transport without saveAsRoutine. |
| test | web TasksPage test | `apps/web/features/tasks/components/TasksPage.test.tsx` | Save as routine opens Schedules with the goal. |
| test | mobile routineDraft test | `apps/mobile/src/features/tasks/__tests__/routineDraft.test.ts` | Draft only for settled runs with a prompt. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses the button; the page reconstructs the goal from the journal's Goal entry (web) or reads the run's preview and model (mobile). | device | TaskDetailPanel.tsx:588-593; runPresentation.ts:377-382 |
| The app navigates to the schedule form with the prompt in the URL (web) or route params (mobile). | device | schedule-from-turn.ts:21-23; CloudTasksScreen.tsx:647-652 |
| The person finishes and saves the schedule; the schedule is stored by the schedules service (outside this feature). | our servers | Schedules page not opened; see SYS-agents-tools-and-automation |
| CLI: after a turn, tool counts are analysed against the last 30 days of local session records and a skill markdown file is written to the learned skills folder. | device | agent/chat.rs:1557-1592; skill_learner.rs:62-175,237-286 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt text in the Schedules URL (web) | browser address bar and history | No | Browser history; the goal text is therefore visible in URLs |
| Schedule record | schedules service (table not opened) | Yes | unknown |
| Learned skill file | CLI config directory, skills/learned/<name>.md | No sync found | Kept up to 50, oldest pruned (skill_learner.rs:419-455) |

**Models and providers.** The web routine carries no model; the mobile draft carries the run's model so the schedule can start with it (runPresentation.ts:381). Learned skills use no model: detection is heuristic, no LLM call (skill_learner.rs:7-9). Routing: SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile need a signed-in account. CLI skill learning works without an account (reads local session records). |
| Permissions | none found in the code for the button itself; creating the schedule is governed by the Schedules feature. |
| Subscription | Schedules page is held until billing loads and receives the plan tier (SchedulesPageWithProjects.tsx:38-62); which tiers may create schedules is not established here. |
| Limits and metering | Learned skills: up to 50, pattern in 3 or more sessions, 5 or more tool calls, 30-day window (skill_learner.rs:20-33). Schedule limits: unknown. |
| Feature flags | Mobile FEATURES.schedules and FEATURES.cloudTasks both true (apps/mobile/lib/v1FeatureFlags.ts:10,14). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Saving as a routine needs the cloud task list, hidden in local privacy mode on desktop. The CLI skill learner runs on local session data with no payment or sign-in. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Task live | Button hidden. | TaskDetailPanel.tsx:567; TasksPage.agiwork.test.tsx:166 |
| No goal entry in the journal | The Goal box, and so the button, is not shown. | TaskDetailPanel.tsx:550 |
| Non-Work run | onSaveAsRoutine is not passed. | TasksPage.tsx:668-670 |
| Mobile run with no preview or still working | Button not offered. | runPresentation.ts:378-380; routineDraft.test.ts:29 |
| Billing not loaded | Schedules page shows an entitlement loading skeleton. | SchedulesPageWithProjects.tsx:41-46 |
| CLI pattern saved before | No duplicate; skill file exists check. | skill_learner.rs:108-113 |
| Accessibility | Mobile button has an accessibility hint; web button has visible text. | CloudRunDetailSheet.tsx:631 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/tasks/components/TasksPage.test.tsx`: Save as routine navigates to Schedules with the combined prompt.
- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.agiwork.test.tsx`: Save as routine passes the reconstructed goal to the host (line 132).
- `apps/mobile/src/features/tasks/__tests__/routineDraft.test.ts`: Draft from a completed run; nothing for a working run or no prompt.
- `apps/cli/src/skill_learner.rs`: Inline tests: signatures, skill naming, too few calls, save and escaping, pruning.
- `apps/cli/src/skills.rs`: Inline test that saved learned skills load (line 1722).

**Test scenarios**

- **Web save as routine**
  1. Finish a Work task with constraints and a deliverable.
  2. Open it in /tasks, press 'Save as routine'.
  - Expected: Schedules opens with the prompt: goal, blank line, 'Constraints: ...', blank line, 'Deliverable: ...'; no schedule exists until saved.
- **Button absent on live task**
  1. Open a Running Work task.
  - Expected: No 'Save as routine'.
- **Mobile make a routine**
  1. Open a Completed task on the phone.
  2. Press 'Make it a routine'.
  - Expected: New schedule screen with the prompt and model prefilled.
- **Long goal on mobile**
  1. Finish a task with a goal over 200 characters.
  2. Press 'Make it a routine'.
  - Expected: Observe whether the prompt is cut at 200 characters (expected from the code).
- **CLI learned skill**
  1. Run the same five-tool workflow in three CLI sessions.
  2. Start a fourth and read the post-turn output; list skills.
  - Expected: A 'Learned skill' line appears and the skill file exists once.

**Where to look when it fails**

- CLI log text '[skill_learner] failed to save learned skill' and '[skill_learner] failed to load recent tool patterns'.
- Web: check the Schedules URL query fromPrompt.
- Mobile: route params prompt and model on /(app)/schedules/create.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **The brief says Save as routine is missing on every app; the code has it on web and mobile.** Affects: Documentation, web, mobile. Evidence: apps/web/features/tasks/components/TasksPage.tsx:72-74; CloudRunDetailSheet.tsx:627. Work needed: Update the brief rows S60.27.
- **Save as Skill by user action does not exist anywhere.** Affects: All apps. Evidence: No control found; CLI only auto-learns (agent/chat.rs:1557-1592). Work needed: Design and build 'Save as skill' from a finished task.
- **Routine prompt is incomplete: excluded tools dropped (web); 200-character preview (mobile).** Affects: Web, mobile. Evidence: schedule-form.ts:196-204; runPresentation.ts:379. Work needed: Build the routine from the full goal object.
- **No routine control on Tauri desktop, VS Code, Chrome, CLI.** Affects: Those apps. Evidence: DesktopTasks.tsx:16-41. Work needed: Add or record as not applicable.
- **CLI skill learning treats every session as successful and is not tied to a task the person chose.** Affects: CLI. Evidence: agent/chat.rs:1575-1579. Work needed: Use the real outcome and let the person confirm or reject a learned skill.
- **Goal text travels in a URL query on web.** Affects: Web. Evidence: schedule-from-turn.ts:21-23. Work needed: Consider handing the draft through state instead of the address.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- mode:cloud
- mode:local
- file:apps/web/features/schedules/lib/schedule-form.ts
- file:apps/cli/src/skill_learner.rs
- store:agi-tasks-layout
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-subscriptions-entitlements-and-usage
- F060-11
- F060-08

## Unknown

- Which plans may create schedules and how many.
- Whether a schedule created from a Work prompt runs in Work mode.
- The SchedulesPage form behaviour after receiving draftPrompt (file not opened).
- Whether VS Code's schedules feature folder can take a task prompt (not traced).
- Whether desktop Tauri should have the button (cloud schedules panel exists, DesktopShellV3.tsx:813).
- Where the CLI learned skills are surfaced to the person in the TUI besides the post-turn line.
