# Duplication audit: Tasks vs Schedules vs Work Sessions

Axis: overlapping async-work surfaces (`/tasks`, `/chat/schedules`, AGI Work composer
mode, `WorkSessionPanel`, `packages/ui/unified-chat/.../tasks/`, desktop
`ScheduledTasksPanel`, mobile schedules).

Repo: `/Users/siddhartha/Desktop/agiworkforce`, branch `compliance/dpdp`.
Method: static trace (glob → grep importers → read source), no dev-server check was
needed because every claim below is settled by import graphs and DB migrations, not
by runtime behavior.

## Answer to the object-model question

**A "task," a "schedule run," and an "AGI Work session" are three genuinely different
backend objects on web — not one concept under three names.** They are legible as
separate _capabilities_ (their UI copy is honest about the split) but not legible as
separate _lists_: nothing links a schedule to a task, or a task to the schedule that
might have spawned it, because a scheduled run structurally cannot become a task.

| Concept                              | Backend object                                 | Table(s)                                                   | Created by                                                                | Execution engine                                                                                                       | Visible in                                                                                                    |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Task** (`/tasks`)                  | `CloudAgentRun`                                | `cloud_agent_runs`, `cloud_agent_events`                   | Any chat turn sent in `chat`, `agiwork`, or `research` work mode          | Full durable agent harness: tools, approvals, multi-step journal, cancellable                                          | `/tasks` (web), Desktop "Tasks" (managed mode)                                                                |
| **Schedule run** (`/chat/schedules`) | `ManagedCloudScheduleRun`                      | `scheduled_tasks`, `scheduled_task_runs`                   | A recurring `ScheduleTask` definition firing on cron/interval             | Single capped LLM completion, no tools, no approvals, no journal (`apps/web/lib/services/scheduled-agent-executor.ts`) | `/chat/schedules` (web), Desktop "Scheduled" (managed mode), mobile Schedules screen                          |
| **AGI Work session** (in-chat)       | Not a stored object — a client-side projection | none (derived)                                             | The composer's `workMode: 'agiwork'` toggle, live while a Task is running | N/A — reads the same Task's SSE deltas                                                                                 | `WorkSessionPanel` inside the open conversation only                                                          |
| **Desktop local "agent task"**       | `AgentTaskStore` goal (device-owned)           | Tauri-local, not `cloud_agent_runs`                        | Local/BYOK "Create" tab in `AgentTaskPanel`                               | Device agent runtime (`src-tauri/src/features/tasks`)                                                                  | Desktop "Tasks" (**local** mode only — different component than the managed one)                              |
| **Desktop local "scheduled job"**    | `ScheduledTask` (Zustand `schedulerStore`)     | Tauri-local (`scheduler_*_job` IPC), not `scheduled_tasks` | Local/BYOK schedule created via `CreateTaskModal`                         | Rust `core/scheduler` (`proactive.rs`, `nlp_parser.rs`)                                                                | Desktop "Scheduled" **and** the "Scheduled" tab inside Desktop "Tasks" — both, simultaneously (see Finding 1) |

Two structural facts drive the "is this confusing" verdict:

1. **A schedule can never produce a Task.** `executeScheduledAgent`
   (`apps/web/lib/services/scheduled-agent-executor.ts:49-90`) calls the provider
   adapter directly and writes to `scheduled_task_runs`; it never touches
   `cloud_agent_runs`. So the Tasks page's own empty-state copy — "Runs from AGI
   Work, Research, and long tool sessions show up here"
   (`packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:411`) — sets an
   expectation ("your automated work shows up here") that a scheduled run
   deliberately does not meet. The product already discloses the capability gap
   honestly in the Schedule form itself ("Web search, tools, research, files, and
   media generation are not available in this surface,"
   `apps/web/features/schedules/components/ScheduleForm.tsx:110-113`), so this is not
   a hidden bug — but the two lists still have zero cross-links in either direction
   (`grep` for `schedule`/`Schedule` inside the Tasks components and for
   `/tasks`/`cloud_agent_run` inside the Schedules components both return nothing).
2. **The web primary nav lists them as two unrelated top-level destinations**, not
   one "automations" hub with a real-tasks/templates split the way the benchmark
   describes competitors doing. This was fixed _today_, in the uncommitted working
   tree: `apps/web/shared/components/layout/app-nav-items.ts` is a brand-new file
   whose own header comment explains the rail used to be two hand-maintained arrays
   (`WebChatPage` vs `WebAppShell`) that drifted so badly that **Tasks was completely
   unreachable** ("`/chat` rendered 6 entries and `/chat/library` rendered 7"). That
   specific bug is now fixed — both `Tasks` and `Schedules` are live, separate rail
   items (`app-nav-items.ts:138-152`) — but the fix consolidated _navigation_, not the
   underlying _object model_, so the two-list structure the founder is asking about
   is real and is now (correctly) fully reachable rather than accidentally hidden.

## Duplication findings

### Finding 1 — Desktop Local mode shows "my scheduled tasks" via two independently-coded components reading the same store

**What**: the exact same list of local/BYOK scheduled jobs, rendered by two separate
component trees, reachable from two separate places in the desktop nav.

- `apps/desktop/src/features/v3/AgiWorkScheduled.tsx` — mounted at the top-level
  Sidebar "Scheduled" nav item (`Sidebar.tsx:163`, `268: scheduled: 'work-scheduled'`,
  `DesktopShellV3.tsx:713 setActivePanel('scheduled')`,
  `DesktopShellV3.tsx:879-880`). Reads `useSchedulerStore` directly
  (`AgiWorkScheduled.tsx:59-63`) and renders its own hand-built rows with an iOS-style
  toggle switch (`AgiWorkScheduled.tsx:15-35`).
- `apps/desktop/src/features/scheduler/ScheduledTasksPanel.tsx` — mounted as the
  "scheduled" tab **inside** `AgentTaskPanel`
  (`apps/desktop/src/features/agi/AgentTaskPanel.tsx:7`), which is itself the
  top-level Sidebar "Tasks" destination in Local mode
  (`Sidebar.tsx:162`, `DesktopShellV3.tsx:658-661 setActivePanel('agent-tasks')`,
  `DesktopShellV3.tsx:843-848 <DesktopAgentTasks />`, where
  `DesktopAgentTasks` is `AgentTaskPanel` under an alias,
  `DesktopShellV3.tsx:31-35`). Reads the **same** `useSchedulerStore`
  (`ScheduledTasksPanel.tsx:44-47`) and renders its own separate `ScheduledTaskCard`
  rows (`ScheduledTasksPanel.tsx:179`).

Both call the same `CreateTaskModal` to create a task
(`AgiWorkScheduled.tsx:6,168`; `ScheduledTasksPanel.tsx:9,186`) — so the _write_ path
is shared — but the _list_ is built twice.

- **Live copy**: both. A Local-mode user who clicks the top-level "Scheduled" nav
  item sees `AgiWorkScheduled`'s rows; the same user clicking "Tasks" → "Scheduled"
  tab sees `ScheduledTasksPanel`'s rows for the identical underlying data.
- **Verdict**: `REDUNDANT_COLLAPSE`.
- **Drift risk**: a status/label/toggle fix applied to `ScheduledTaskCard` (e.g. a
  bug in how a paused job is displayed) will not reach `AgiWorkScheduled`'s inline
  row markup, and vice versa — they are two hand-written renderers over one store,
  so they can (and given the codebase's history, likely already do to some degree)
  disagree on what "active" looks like.
- **Recommendation**: pick one as canonical (`ScheduledTasksPanel` + `ScheduledTaskCard`
  looks like the more complete component — it supports edit, not just toggle/delete)
  and have the top-level "Scheduled" nav route render it directly instead of
  `AgiWorkScheduled`'s parallel markup. This also removes the confusing appearance of
  "Scheduled" as both its own nav destination and a sub-tab of "Tasks."

### Finding 2 — Desktop "legacy job-based" scheduler is dead code, confirmed by its own comment and zero live importers

**What**: `apps/desktop/src/features/scheduler/SchedulerPanel.tsx`,
`JobCreationDialog.tsx`, and the `useScheduler` hook they depend on.

- `apps/desktop/src/features/scheduler/index.ts:7-15` labels the two halves of the
  directory itself: `// Task-based system (actively used)` for
  `ScheduledTasksPanel`/`ScheduledTaskCard`/`CreateTaskModal`/`TaskScheduleInput`,
  vs. `// Legacy job-based system (kept for backwards compatibility)` for
  `SchedulerPanel`/`JobCreationDialog`.
- Verified: nothing outside `features/scheduler/` imports `SchedulerPanel` or
  `JobCreationDialog`, and nothing imports the barrel `index.ts` file at all —
  every live consumer imports `ScheduledTasksPanel`/`CreateTaskModal` directly by
  path (`grep -rln "SchedulerPanel\b|JobCreationDialog\b"` outside the directory:
  no hits; `grep -rln "from '@/features/scheduler'"` anywhere: no hits). The
  `useScheduler` hook is imported only by these two dead files.
- **Live copy**: none. Dead.
- **Verdict**: `DEAD_FORK`.
- **Drift risk**: none currently (it's inert), but it is a maintenance/confusion
  trap — a future contributor grepping for "scheduler panel" lands on the wrong
  component 50% of the time, and the comment marking it "legacy... kept for
  backwards compatibility" is doing no actual compatibility work since nothing
  calls it.
- **Recommendation**: delete `SchedulerPanel.tsx`, `JobCreationDialog.tsx`, and the
  `useScheduler` hook once a quick check confirms no Tauri IPC command
  (`scheduler_*_job`) is uniquely wired only for their benefit.

### Finding 3 — Desktop `BackgroundTasksPanel` / `BackgroundTaskIndicator` are unreachable

**What**: `apps/desktop/src/features/background-tasks/BackgroundTasksPanel.tsx` and
`BackgroundTaskIndicator.tsx`, a fourth "list of tasks with status/progress/cancel"
UI, backed by `useBackgroundTasks` / `BackgroundTask` in `stores/chat/agentStore.ts`.

- Verified: `grep -rln "BackgroundTasksPanel|BackgroundTaskIndicator"` across
  `apps/desktop/src` outside their own directory returns nothing — no nav entry, no
  panel switch case, no toolbar mount anywhere.
- **Live copy**: none. Dead.
- **Verdict**: `DEAD_FORK`.
- **Drift risk**: none currently; same category of confusion risk as Finding 2 — a
  fourth "tasks" concept (`BackgroundTask`) exists in the type system with no UI
  surface, alongside the three that _are_ wired up (`CloudAgentRun`,
  `AgentTaskStore` goal, `ScheduledTask`).
- **Recommendation**: confirm whether `BackgroundTask`/`agentStore` still has a
  live producer (something pushes into it even if nothing renders it); if not,
  remove the whole vertical. If it does still get written to, that's a
  half-wired feature per the repo's own "finish what you start" rule and belongs
  in `PLAN.md`/`known-flaws.md`, not silently sitting as dead UI.

### Finding 4 — `WorkSessionPanel` (in-chat) and `TaskDetailPanel` (`/tasks`) are two independent renderers of the same run, fed by two different pipelines

**What**: both components exist to answer "what is this AGI Work run doing right
now" for the _same_ `CloudAgentRun`, and both consume the same underlying
`AgentActivityEntry`/`AgentActivityState` shape produced by the shared reducer
`applyAgentActivityEvent` (`packages/client/client-runtime/src/agentActivity.ts`).
That reducer itself is properly shared — `packages/ui/unified-chat/src/hooks/useChat.ts`
uses it to build `message.metadata.agentActivity` while a turn streams, and
`packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:56-61`
(`projectTaskJournal`) uses the identical reducer to replay the durable journal read
from `GET /api/llm/.../runs/:id`. That much is `DELIBERATE` reuse.

What is **not** shared is the step from "activity entries" to "UI rows":

- `apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:150-158`
  (`progressFromActivity`) hand-maps each entry kind to a row, with a fallback
  branch (`WorkSessionPanel.tsx:258-274`) for a **legacy** `message.metadata.tools`
  shape that predates `agentActivity` — a code path `TaskDetailPanel` has no
  equivalent of, because it only ever reads the canonical durable journal.
- `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:85-118`
  (`progressStatus`, `ProgressRow`) independently re-implements the same
  entry-kind → label/status/tone mapping, with its own tone-to-color table
  (`TASK_TONE_BADGE_CLASS` in `task-display.ts`) that is separate from
  `WorkSessionPanel`'s inline Tailwind class logic
  (`WorkSessionPanel.tsx:100-107`).
- A concrete, observable difference: `WorkSessionPanel` falls back to
  `humanizeToolName(entry.name)` when `entry.summary` is empty
  (`progressFromActivity`, `WorkSessionPanel.tsx:154`); `TaskDetailPanel` uses
  `entry.summary || entry.name` with no humanizing pass (`TaskDetailPanel.tsx:95`).
  The same tool call can render a machine-cased name in one surface and a
  humanized label in the other.
- The two are also fed on different cadences: `WorkSessionPanel` updates
  synchronously as SSE deltas arrive for the open conversation; `TaskDetailPanel`
  polls the REST journal every 4s (`TASK_JOURNAL_POLL_INTERVAL_MS`,
  `TasksPage.tsx:73`). A user watching the live chat and a second tab open on
  `/tasks` for the same run can legitimately see different progress at the same
  instant, which is expected given the poll interval, but there's no shared
  "single source of render truth" that would make that gap easy to reason about.
- **Live copy**: both, simultaneously, for the same run — one is used while the
  chat tab that started the run is open, the other whenever `/tasks` is open
  (either the same run mid-flight, or any past run).
- **Verdict**: `DRIFT`.
- **Drift risk**: a change to how a `tool` or `progress` entry should be
  labeled/toned (a real, recurring kind of fix in an agent-activity UI) has to be
  applied in both `progressFromActivity` and `ProgressRow`/`progressStatus`, or the
  two surfaces silently disagree about the same event.
- **Recommendation**: extract one shared `entry → { label, detail, status, tone }`
  mapping function (it can live next to `applyAgentActivityEvent` in
  `client-runtime`, since that's already the shared dependency both sides pull
  from) and have both `WorkSessionPanel` and `TaskDetailPanel` call it instead of
  maintaining parallel switch statements.

### Finding 5 — Tasks and Schedules are a deliberate backend split presented as two unrelated lists, not the "one automation list" pattern the benchmark found in competitors

**What**: `/tasks` (`cloud_agent_runs`, full tool-using agent harness) and
`/chat/schedules` (`scheduled_tasks`/`scheduled_task_runs`, single-shot capped text
completion) are genuinely different capabilities — the Schedule form is honest about
what it can't do (`ScheduleForm.tsx:110-113`). This is not code duplication and
nothing here should be collapsed at the implementation level.

- **Live copy**: both — both are real, separately reachable primary-nav
  destinations (`app-nav-items.ts:138-152`), each backed by its own working
  end-to-end system.
- **Verdict**: `DELIBERATE` (the backend split is justified by real capability
  differences), **but** flagged because the _presentation_ doesn't match it: the
  benchmark's finding is that competitors put both under one list with an
  instances/templates (or "runs"/"scheduled") split inside a single surface, with
  cross-links between an automation's definition and its run history. Here:
  - There is no link from a Task back to "the schedule that created this" (schedules
    cannot create Tasks at all, per the object-model section above), and no link
    from a Schedule's run history to a Task, because a schedule's execution is
    never a Task.
  - A user cannot schedule an AGI Work run (with tools/approvals) at all — only a
    plain-text single completion — so "Schedules" is not "Tasks, but recurring";
    it's a materially weaker, unrelated feature that happens to sit next to Tasks
    in the nav and share the word "task" internally (`ScheduleTask` naming, DB
    column `scheduled_tasks`).
- **Drift risk**: not a code-drift risk (there's no shared implementation to
  diverge) — a _product-legibility_ risk. A user's mental model from any
  competitor ("one place for my automated work") is violated by two silently
  disconnected systems that use overlapping vocabulary (`Task`, `ScheduleTask`,
  `AgentTaskStore`, `ScheduledTask` are four distinct types across this audit).
- **Recommendation**: this is a product decision, not a cleanup — either (a) make
  the disconnect legible by cross-linking (a Task detail panel shows "part of
  schedule X" when applicable, once schedules can produce Tasks; a Schedule's run
  row links to its Task if one exists), or (b) extend the schedule execution
  path to optionally run the full agent harness and record a `cloud_agent_run`,
  at which point unifying the two lists into one surface with an
  Active/Scheduled/History split becomes possible. Either way, do not merge the
  UI without first deciding whether scheduled execution should gain tool access —
  that's a scope/billing decision, not a refactor.

## What was verified live vs by static trace

Everything above was settled by import-graph tracing and reading the DB migrations
directly (`cloud_agent_runs` vs `scheduled_tasks`/`scheduled_task_runs` have no
foreign key or shared row between them — confirmed in
`apps/web/db/neon/0061_cloud_agent_runs.sql` and `0057_durable_scheduling.sql`/
`0009_scheduling.sql`). The dev server was not needed for these findings since
reachability is fully determined by `grep` for importers and by the panel-switch
logic in `DesktopShellV3.tsx`, which is unambiguous. Not independently verified:
whether the desktop "legacy job" Tauri IPC commands (`scheduler_update_job`, etc.)
still have live Rust-side handlers with no other caller — if they don't, Finding 2's
cleanup should also drop the corresponding `#[tauri::command]` functions; that Rust
side was not traced in this pass.

## Not covered / out of scope for this pass

- Mobile has no `/tasks`-equivalent screen at all (no `CloudAgentRun` viewer) —
  only Schedules. That's an asymmetry with web/desktop, not a duplication, so it's
  noted here rather than filed as a `duplicates` finding.
- CLI/VS Code have no async-task or schedule surface found in this pass; not
  investigated further since the founder's question and the stated axis were
  scoped to web/desktop/mobile.
