---
id: "F063-02"
type: "feature"
title: "Create a routine (from a prompt, from a chat turn, from a share link)"
aliases: ["Create a routine", "New task (web button)", "Create Schedule (mobile)", "New schedule (Chrome)", "Run this on a schedule", "Quick schedule (mobile)", "/save-routine, /schedule, /routines (CLI)", "agi schedules create", "create_schedule tool", "Share link copy (fromShare)", "S63.02 S63.03 S63.04 S63.05"]
area: "63 Routines, schedules, and triggers"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S63.02", "S63.03", "S63.04", "S63.05"]
depends_on: ["F063-03", "F063-04", "F063-01", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "surface:vscode", "mode:cloud", "table:scheduled_tasks", "api:POST /api/schedules", "api:PUT /api/schedules/{id}", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F063-02 Create a routine (from a prompt, from a chat turn, from a share link)

Makes a saved scheduled task: a name, an optional description and a prompt, plus timing and options. A person can start blank, from a template, from a chat answer (web, Chrome, CLI), from a finished cloud task (mobile), from an agent, from a shared link (web), or by asking the chat assistant. Runs execute in AGI Cloud.

Area: [63. Routines, schedules, and triggers](README.md). Requirement items: [S63.02](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6302), [S63.03](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6303), [S63.04](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6304), [S63.05](../../10-requirements/capabilities/063-routines-schedules-and-triggers.md#s6305).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores an agent task with a prompt that AGI Cloud runs later or on events. The server validates the input, checks the plan limit and saves one scheduled_tasks row (apps/web/app/api/schedules/route.ts:96-132; apps/web/lib/services/schedule-service.ts:994-1053).

**Why it exists.** The product contract lists schedules, run history and pause/resume/delete as required for recurring work (doc: docs/product/requirements.md:1570-1590).

**Who uses it.** Signed-in people on a paid plan who want unattended work, and developers using the CLI or API.

**Problems it solves**

- Repeating the same ask by hand
- Turning a good answer into a repeatable job in one step
- Making a task from a plain sentence on a phone

**Use cases**

- Web: open a good answer's message menu and choose 'Run this on a schedule'
- Mobile: type 'every weekday at 9am summarise my news' in the quick-schedule box
- CLI: agi schedules create --name x --schedule '0 9 * * 1-5' --prompt '...'
- Web: open a shared link and save a copy

## 2. User experience

**Where to find it**

- Web and public Electron Desktop (hosted web app): /chat/schedules, button 'New task' (or 'New task in this project' inside a project). Split menu: 'Create from scratch', 'Start from a template' (SchedulesPage.tsx:1007-1050). Chat answer menu: 'Run this on a schedule' (apps/web/features/chat/components/messages/MessageBubble.tsx:4050-4053).
- Web agents: link /chat/schedules?agent=<id> from the agent pages (apps/web/features/agents/components/AgentManagePanel.tsx:128).
- Web share link: /chat/schedules?fromShare=<token> opens a filled form (SchedulesPageWithProjects.tsx:14, 36; SchedulesPage.tsx:703-727).
- Tauri desktop (Managed mode): Schedules panel, create modal with 'Save' (DesktopCloudSchedules.tsx:628-660).
- Mobile: Scheduled screen, plus icon 'Create schedule', quick-schedule box at the bottom (QuickSchedule.tsx), screen titled 'New Schedule' / 'Edit Schedule' (create.tsx:315). Cloud task run sheet: 'Make it a routine' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:629).
- CLI: slash commands /save-routine, /schedule, /routines (apps/cli/src/claude_parity.rs:321-327); commands agi schedules create and edit (apps/cli/src/lib.rs:1514-1572).
- Chrome: Schedules section 'New schedule'; chat history menu action opens the options page with a draft (apps/extension/src/side_panel.ts:13121-13127; apps/extension/src/options.ts:2142-2148).
- VS Code: no create form; 'Code: Open Schedules on Web' (apps/extension-vscode/package.json:612).

**Before you start**

- Signed-in AGI account
- A plan that allows at least one scheduled task and room under its limit
- Workspace policy that allows 'schedules'
- Mobile: Cloud mode; CLI: Managed (Cloud) session; Tauri: Managed mode

**Screens and controls**

- Web form labels: 'Schedule Name', 'Description', 'Task Instructions', 'Model', 'Run as agent', 'Frequency' (ScheduleForm.tsx:173-293); 'Active After Save' switch (line 801)
- Mobile form: 'Schedule Name', 'Prompt', note 'Schedules use saved prompt text only', model chip, 'Create Schedule' / 'Save Changes', 'Delete Schedule' (ScheduleForm.tsx:228-359)
- Chrome form: Name, Description (optional), Instructions, Repeat, Model, Time zone, buttons 'Create schedule', 'Save changes', 'Cancel' (messages.json spSchedules keys)
- CLI flags --name --schedule --prompt --timezone --model --description --paused --json (lib.rs:1514-1545)

**Journey**

1. Choose a start: blank, template, chat answer, agent link, shared link, or a plain sentence
2. Type or review the name and prompt (and description)
3. Pick model, repeat and time zone (F063-03, F063-04)
4. Press save
5. Server validates and stores it; the list shows the new routine with its next run

**What the person sees and gets**

- Web: row appears; field errors under inputs; plan-limit message with upgrade link (route.ts:41-60)
- Chrome: status 'Created <name>. It runs in the cloud even when this browser is closed.'
- CLI: prints the created schedule (lib.rs:4384-4412)
- Mobile quick box: parsed preview before creating; refuses sub-daily requests (QuickSchedule.tsx:211-260; policy.ts:50-60)

**Settings**

- Notification switches under 'Routine notifications' in the web form (ScheduleForm.tsx:696-710)
- Workspace policy for secrets in prompts (prompt-secret-policy.ts)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/schedules: rate limit, CSRF, plan tier, zero-limit refusal first, workspace feature gate, secret policy, then a per-user advisory lock and quota check inside one transaction, then insert; answers 201 (apps/web/app/api/schedules/route.ts:96-132).
- Validation: name required up to 500, prompt required up to 10,000, description up to 2,000, unknown fields refused (schedule-service.ts:606-700).
- Edit through PUT /api/schedules/{id} and enable/disable through PATCH (apps/web/app/api/schedules/[id]/route.ts:64-120).
- Web create from a chat answer: menu item opens the form with the user's preceding prompt filled; nothing is created yet (schedule-from-turn.ts:20-47; ChatMessageList.tsx:1450-1462).
- Web share link opens a filled copy with project and agent cleared (apps/web/features/schedules/lib/schedule-form.ts:181-187).
- A chat model can create a schedule with the create_schedule tool for once/daily/weekly/monthly (apps/web/lib/server/tools/schedule-tool.ts:1-110; tool-loop.ts:2482).
- CLI creates a 'custom' (cron) schedule and edits name, description, prompt, model, cron and time zone (apps/cli/src/schedules.rs:89-115, 480-505).
- Mobile 'Make it a routine' from a finished cloud task opens the create screen with the prompt (CloudTasksScreen.tsx:645-653).
- Chrome creates once/daily/weekly/monthly with model and time zone, edits name/description/prompt, and can start from a chat entry (schedulesSection.ts:727-775, 711-725, 1207).

**Incomplete**

- CLI /save-routine only sends a prompt asking the assistant to call cron_create; it is not a separate API (claude_parity.rs:901-908).
- CLI edit works but the brief marks CLI edit missing (brief S63.26 versus apps/cli/src/lib.rs:1553-1572).
- Chrome edit saves name, description and prompt only; timing cannot be edited (schedulesSection.ts:1207).
- Mobile 'create from a chat answer' not found; only from a cloud task run.
- Secret-in-prompt refusal applies only when the workspace is set to block secrets; 'warn' and 'redact' save (apps/web/app/api/schedules/__tests__/route.secret-handling.test.ts:81-108).

**Present but disconnected or switched off**

- Gmail/Calendar related prompts cannot use connectors while connectors are 'coming soon' (connector-release.ts:14).

**Not available**

- VS Code create/edit form.
- CLI: sources, connectors, agent, description-less templates; only cron timing.
- Duplicate routine: missing everywhere (brief S63.28).
- Mobile: create from a share link not found.

## 4. Required behaviour

**Established requirements**

- User writes a prompt and a saved routine is created from it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.02)
- One action turns a finished task or chat turn into a routine. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.03)
- A routine has a user-set name and optional description, both editable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.04)
- A multi-line editor writes and later edits the instructions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S63.05)
- Name up to 500, prompt up to 10,000, description up to 2,000; unknown fields refused. (source: apps/web/lib/services/schedule-service.ts:606-700)
- Creation checks the plan quota inside a per-user lock so two quick saves cannot exceed the limit; a limit of 0 answers 403 with code schedules_not_in_plan. (source: apps/web/app/api/schedules/route.ts:41, 107-132)
- Required recurring work concepts: run history, pause/resume/delete, notification. (source: doc: docs/product/requirements.md:1583-1590)
- Create, edit, pause, resume, run now and delete use the displayed time zone and one recurrence policy; one occurrence creates at most one run. (source: doc: docs/product/experience-contract.md:790)

**Acceptance criteria**

1. POST with name, prompt, recurrence and timezone on a Basic account returns 201 and the row lists with a next run
2. A 501-character name returns a validation error and saves nothing
3. Two parallel creates on a plan with one slot left save exactly one
4. A Free account gets 403 with code schedules_not_in_plan and an upgrade link
5. An unknown JSON field returns a validation error naming it
6. Editing the prompt through PUT changes it on every app
7. From a chat answer, the web form opens with the prompt and creates nothing until Save

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Mobile should also offer 'create from a chat answer' since the brief marks it missing and web has it [inferred].
- Chrome should allow timing edits [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add create-from-turn to mobile and VS Code.
- [proposed] Let CLI create non-cron cadences and set sources and agent.
- [proposed] Make the secret policy decision visible to the person when a prompt is redacted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/schedules (and GET list) | `apps/web/app/api/schedules/route.ts` | Create and list; plan limit, CSRF, gates, transaction |
| endpoint | PUT, PATCH, DELETE, GET /api/schedules/{id} | `apps/web/app/api/schedules/[id]/route.ts` | Edit, enable/disable, delete, read |
| service | validateScheduleInput, createSchedule, updateSchedule | `apps/web/lib/services/schedule-service.ts` | Validation and insert (lines 681, 994, 1102) |
| service | assertScheduleQuota | `apps/web/lib/services/schedule-service.ts` | Plan limit check (line 877) |
| service | refuseBlockedSchedulePrompt | `apps/web/app/api/schedules/prompt-secret-policy.ts` | Secret policy on create and edit |
| table | scheduled_tasks | `apps/web/db/neon/0009_scheduling.sql` | Stores the routine |
| component | ScheduleForm | `apps/web/features/schedules/components/ScheduleForm.tsx` | Web create/edit form |
| component | SchedulesPage (submit, draft effects) | `apps/web/features/schedules/components/SchedulesPage.tsx` | Create, edit, from prompt, from agent, from share (lines 500-520, 703-727, 925-950) |
| hook | schedule-from-turn | `apps/web/features/schedules/components/schedule-from-turn.ts` | fromPrompt link and promptBeforeReply |
| component | Run this on a schedule menu item | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Chat entry point (line 4050) |
| service | scheduleShareToDraft | `apps/web/features/schedules/lib/schedule-form.ts` | Share snapshot to draft (line 181) |
| service | create_schedule tool | `apps/web/lib/server/tools/schedule-tool.ts` | Chat tool that creates a schedule |
| service | desktopCloudSchedules | `apps/desktop/src/services/desktopCloudSchedules.ts` | Tauri client for the same API |
| component | DesktopCloudSchedules | `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx` | Tauri panel and create modal |
| screen | create.tsx and index.tsx | `apps/mobile/app/(app)/schedules/create.tsx` | Mobile create/edit screen |
| component | QuickSchedule | `apps/mobile/src/features/schedules/components/QuickSchedule.tsx` | Plain-sentence create box |
| service | createSchedule (mobile) | `apps/mobile/src/features/schedules/service.ts` | POST /api/schedules (line 119) |
| command | agi schedules create/edit | `apps/cli/src/lib.rs` | CLI commands (lines 1514-1572, 4384-4470) |
| service | cron_create_request, schedule_patch | `apps/cli/src/schedules.rs` | CLI request bodies (lines 89, 480) |
| command | /save-routine, /schedule | `apps/cli/src/claude_parity.rs` | Slash commands (lines 321-327, 901) |
| component | buildSchedulesSection | `apps/extension/src/features/side-panel/schedulesSection.ts` | Chrome form (line 430) |
| service | stageScheduleDraft / takeScheduleDraft | `apps/extension/src/features/side-panel/schedulesSection.ts` | Draft from a chat via session storage (lines 389-399) |
| service | scheduleShareSnapshot, saveScheduleShare | `apps/web/lib/services/schedule-share-service.ts` | Share snapshots |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the form or a draft is seeded (template, chat, agent, share link, Chrome session storage). | device | SchedulesPage.tsx:443-455, 925-950; schedulesSection.ts:389-399 |
| Client sends POST /api/schedules with the body (mobile and CLI via bearer token). | device and our servers | apps/mobile/src/features/schedules/service.ts:119; apps/cli/src/schedules.rs:212 |
| Server rate limits, checks CSRF, resolves the plan, refuses a 0-limit plan, applies workspace gate and secret policy. | our servers | apps/web/app/api/schedules/route.ts:96-122 |
| Transaction takes a per-user lock, re-checks the quota, validates input, checks project and agent ownership, inserts the row. | our servers | route.ts:124-132; schedule-service.ts:994-1053 |
| Row returned with next execution time; the sweep (every 15 minutes) or events will run it later. | our servers | vercel.json:50-51; schedule-service.ts:1341 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Routine: name, description, prompt, model, timing, limits, metadata (sources, connectors, notifications), project id, agent id | table scheduled_tasks in the managed database | Yes, one server record read by every app | Deleted by DELETE (refused while a run is in progress); runs cascade (0009_scheduling.sql:36) |
| Share snapshot | table scheduled_task_shares | Via link token | Stopped by 'Stop sharing' (SchedulesPage.tsx:670-690) |
| Chrome draft | chrome.storage.session key agi_schedule_draft | No | Removed when read (schedulesSection.ts:393-399) |

**Models and providers.** No model runs at creation, except when a chat model calls the create_schedule tool. The stored model is validated against the catalog and plan (schedule-service.ts:559-577).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account on every app (apps/cli/src/schedules.rs:57-62; apps/extension-vscode/src/features/schedules/scheduleClient.ts:21-26). |
| Permissions | Workspace 'schedules' policy on create (route.ts:114); owner must be an allowed account to run unattended (schedule-service.ts:1341 claim SQL). |
| Subscription | Plan limit on scheduled tasks: local-only 0, own-key 0, Free 0, Basic 3, Premium 5, Max 15, Ultra 25, Team 10, Team Premium 15, Enterprise unlimited (billing-catalog.ts:572-723). A lapsed paid plan is held to the Free allowance (apps/web/__tests__/api/schedules.test.ts:135). |
| Limits and metering | Limit counted per user across workspaces (schedule-service.ts:868-900). Rate limits via withRateLimit (route.ts:99). Per-routine credit cap is F063-03/F063-06 scope. |
| Feature flags | Mobile FEATURES.schedules (v1FeatureFlags.ts:14). |
| Model compatibility | Model must be Auto or a catalog model eligible for the plan (schedule-service.ts:559-577). |
| Provider restrictions | Server-side routing only. No own-key path found: own-key plan limit is 0. |
| Local mode | Not available. Mobile Local mode shows the Cloud gate; CLI Local and own-key sessions are refused before any request (apps/cli/src/schedules.rs:800 test, cloud/client.rs:368); Tauri panel is Managed only. Separate on-device 'local routines' exist on the Electron Desktop (see F063-04 and unknowns). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Plan has 0 scheduled tasks | 403 schedules_not_in_plan before any other check; UI shows 'Upgrade plan' | route.ts:41-60, 107-113 |
| Plan at its ceiling | 403 schedule_limit_reached | route.ts:42, schedule-service.ts:893-900 |
| Two quick saves | Second sees the first count under the advisory lock | route.ts:126 |
| Unsaved edits closed | Web asks to discard a changed draft | SchedulesPage.tsx discardConfirmOpen |
| Models fail to load (Chrome) | Create stays disabled; Retry button | schedulesSection.ts:575-620; apps/extension/__tests__/schedule-create-controls.test.ts:112-131 |
| Chat turn is streaming or temporary chat | Menu item hidden | MessageBubble.tsx:4049; ChatMessageList.tsx:1450 |
| Shared link gone | Toast 'That shared schedule is no longer available.' | SchedulesPage.tsx:720-725 |
| Offline | Not handled specially; request error shown | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/schedules.test.ts`: List with bounds, 401, create after auth and CSRF, lapsed Pro held to Free allowance, refusal past plan ceiling, zero-limit message ahead of workspace gate, paid ceiling versus no-schedule plan
- `apps/web/lib/services/schedule-service.test.ts`: Create against canonical columns, rejects bad model for plan, project ownership, invalid timezone and cron, unknown fields, unknown recurrence, past one-time, edit rules, quota across workspaces
- `apps/web/app/api/schedules/__tests__/route.secret-handling.test.ts`: Create and edit refused when workspace blocks secrets; saved unchanged in warn and redact
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.scheduleFromTurn.test.tsx`: Menu item hands the finished answer to the schedule flow; absent where scheduling is unavailable or while streaming
- `apps/web/features/schedules/components/SchedulesPage.test.tsx`: Prefilled dialog from a chat prompt, from an agent link, hidden agent choice with no agents
- `apps/web/lib/server/tools/schedule-tool.test.ts`: create_schedule tool (case titles not read)
- `apps/mobile/__tests__/ScheduleCreateScreen.test.tsx`: Mobile create screen (case titles not read)
- `apps/mobile/__tests__/QuickScheduleTimingProblem.test.tsx`: Quick schedule timing problems (title-level)
- `apps/extension/__tests__/schedule-create-controls.test.ts`: One-time task with model and zone-aware instant, DST edge times, model outside catalog rejected, creation disabled while models load, Retry control
- `apps/cli/src/schedules.rs`: Inline Rust tests: cron request fields, paused request with model, Local/own-key refused before any request
- `apps/cli/src/claude_parity.rs`: Inline test schedule_walks_through_routines_and_event_triggers (line 4074)

**Test scenarios**

- **Create and read back**
  1. Sign in on Basic
  2. POST /api/schedules with name, prompt, recurrence daily, timeOfDay 09:00, timezone
  3. GET /api/schedules
  - Expected: 201 then the schedule appears with nextExecutionAt in the future
- **Quota race**
  1. On Basic with 2 routines send two parallel creates
  - Expected: One 201, one 403 schedule_limit_reached
- **Free refusal**
  1. Sign in on Free and POST a valid body
  - Expected: 403 with code schedules_not_in_plan; no row saved
- **Chat answer to routine**
  1. On web, finish a chat answer on Basic
  2. Open its menu and choose 'Run this on a schedule'
  - Expected: Scheduled page opens with the form filled; no routine until Save
- **CLI create refused in Local**
  1. Run agi schedules create in a Local-mode session
  - Expected: Error saying the session is not Managed; no HTTP request
- **Secret blocked**
  1. Set the workspace to block secrets
  2. Create with an API key in the prompt
  - Expected: Request refused and nothing saved

**Where to look when it fails**

- Server logs for 'schedules' route errors; error names ScheduleLimitError, ScheduleValidationError
- Table scheduled_tasks row count per user versus plan limit
- CLI: ScheduleError::NotManaged text

**Hands-on test plans**

- Web: [70-qa/test-plans/web/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/web/063-routines-schedules-and-triggers.md)
- Desktop: [70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/desktop/063-routines-schedules-and-triggers.md)
- Mobile: [70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/mobile/063-routines-schedules-and-triggers.md)
- CLI: [70-qa/test-plans/cli/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/cli/063-routines-schedules-and-triggers.md)
- Chrome: [70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md](../../70-qa/test-plans/chrome/063-routines-schedules-and-triggers.md)

## 10. Gaps and dependencies

- **Brief says CLI edit is missing; code has agi schedules edit** Affects: Brief accuracy (CLI). Evidence: apps/cli/src/lib.rs:1553-1572, 4436-4470. Work needed: Correct brief S63.26 for CLI
- **Brief says mobile has no create-from-task; code has 'Make it a routine' from a cloud task** Affects: Brief accuracy (mobile). Evidence: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:629. Work needed: Correct brief S63.03; add create from a chat answer
- **Brief says Chrome has no create-from-task; code stages a draft from a chat entry** Affects: Brief accuracy (Chrome). Evidence: apps/extension/src/side_panel.ts:13121-13127. Work needed: Correct brief S63.03 for Chrome
- **CLI can only create cron routines with no sources, connectors or agent** Affects: CLI users. Evidence: apps/cli/src/schedules.rs:73-115. Work needed: Extend create flags or document the limit
- **Chrome edit cannot change timing** Affects: Chrome users. Evidence: schedulesSection.ts:1207. Work needed: Add timing fields to Chrome edit
- **VS Code has no create** Affects: VS Code users. Evidence: apps/extension-vscode/package.json:602-637. Work needed: Product decision
- **Duplicate routine missing everywhere** Affects: All apps. Evidence: Brief S63.28. Work needed: Build one action
- **Brief says mobile S63.03 missing but also names 'prompt editor done'; 'create from share link' not found on mobile or Tauri** Affects: Mobile, Tauri users. Evidence: No fromShare handling outside apps/web/features/schedules. Work needed: Confirm Tauri share flow and add mobile open-link flow
- Not built on: VS Code (from the capability ledger).

**Depends on**

- F063-03
- F063-04
- F063-01
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- surface:vscode
- mode:cloud
- table:scheduled_tasks
- api:POST /api/schedules
- api:PUT /api/schedules/{id}
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline

## Unknown

- Whether the Tauri panel opens share links: DesktopCloudSchedules.tsx has Share buttons (line 1283) but a fromShare entry was not found.
- Which workspace setting value is the default for secret handling.
- Whether the CLI cron_create tool reads the model setting: it passes None for model and description (apps/cli/src/features/exec/tools/task_registry/mod.rs:46-47).
- Exact titles of cases in schedule-tool.test.ts and ScheduleCreateScreen.test.tsx.
