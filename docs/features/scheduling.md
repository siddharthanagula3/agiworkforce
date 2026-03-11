# Feature: Scheduling
> Lets users define automated jobs that run on cron schedules or fixed intervals, dispatching one of six action types (AGI tasks, shell commands, workflows, notifications, webhooks, scripts) through a 30-second background Rust polling loop.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `components/Scheduler/SchedulerPanel.tsx` — main panel with filter tabs and job cards; `JobCreationDialog.tsx` — create/edit with cron builder; `ScheduledTasksPanel.tsx` — alternate task-oriented view; `ScheduledTaskCard.tsx`; `CreateTaskModal.tsx`; `TaskScheduleInput.tsx` |
| Stores | `stores/schedulerStore.ts` — single consolidated store (merged from former `scheduledTaskStore` + `schedulerStore`); Zustand v5 + Persist v1 |
| Hooks | `hooks/useScheduler.ts` — primary hook; wraps store, maps wire types, initializes event listeners |
| Rust Commands | `sys/commands/scheduler.rs` — all 11 Tauri command handlers + `ProactiveScheduler` + `SchedulerState` with background loop |
| Rust Core | `core/scheduler/types.rs` — `ScheduledJob`, `JobSchedule`, `JobAction` (6 variants), `JobInterval`; `nlp_parser.rs` — NLP text → `ParsedSchedule`; `proactive.rs` — `ProactiveScheduler` backed by `tokio-cron-scheduler` |
| Event Channels | `scheduler:agi-task`, `scheduler:workflow-execute`, `scheduler:notification` (see Known Gaps #7 for missing lifecycle events) |
| Web API Routes | `apps/web/app/api/schedules/route.ts` — GET/POST; `[id]/route.ts` — GET/PATCH/DELETE; `[id]/runs/route.ts` — GET |
| Database | In-memory `HashMap<String, ScheduledJob>` (RwLock). History: in-memory `Vec<JobExecutionRecord>` capped at 500. No SQLite persistence. |

## Data Flow

1. **User opens Scheduler** — `SchedulerPanel` mounts, `useScheduler` calls `invoke('scheduler_list_jobs')` → Rust reads `RwLock<HashMap>` → returns `Vec<ScheduledJob>`.

2. **User creates job** — `JobCreationDialog` collects name, action type, action fields, schedule (presets or custom cron builder). Validates 5-part cron client-side.

3. **Job creation IPC** — `invoke('scheduler_add_job', { name, schedule, actionType, actionData })`.

4. **Rust `scheduler_add_job`** — Converts interval names (`hourly` → `"0 0 * * * *"`), parses `actionType` (case/hyphen-insensitive), validates cron via `cron::Schedule::from_str`, calculates `next_run`. Inserts into HashMap. Returns UUID.

5. **Background polling loop** — Started at `lib.rs:531` via `SchedulerState::start_background_loop()`. Wakes every **30 seconds**, finds jobs where `status == Active && next_run <= now`, calls `dispatch_job_action()`.

6. **`dispatch_job_action()`** matches on action type:
   - `ShellCommand` → `tokio::process::Command::new("sh").args(["-c", command])`
   - `AgiTask` → emits `scheduler:agi-task` Tauri event (frontend picks up)
   - `Workflow` → emits `scheduler:workflow-execute` event
   - `Notification` → emits `scheduler:notification` event
   - `Webhook` → `reqwest::Client::post(url).json(payload).timeout(30s).send()`
   - `Script` → `sh -c` / `cmd /C` pattern

7. **History** — `JobExecutionRecord` pushed (capped 500). `mark_job_run()` updates `last_run`, `run_count`, recalculates `next_run`. Auto-moves to `Failed` after 3 consecutive failures.

8. **Run Now** — `invoke('scheduler_run_job_now', { id })` → dispatches immediately, records history.

9. **Real-time events** — `useScheduler` expects lifecycle event listeners but the Rust backend does **not** emit `scheduler:job_executed`, `scheduler:job_added`, `scheduler:job_removed`, `scheduler:job_updated`, or `scheduler:error`. Only action-dispatch events (`scheduler:agi-task`, `scheduler:workflow-execute`, `scheduler:notification`) are emitted.

## Two Competing Type Hierarchies

**Command-layer** (`sys/commands/scheduler.rs`): `SchedulerActionType` enum (6 variants), flat `ScheduledJob` with cron string, `ProactiveScheduler` using `RwLock<HashMap>`. **This is what Tauri commands actually use.**

**Core-layer** (`core/scheduler/`): Richer `JobSchedule` enum (Cron/Interval/OneShot), `JobAction` enum (6 different variants), builder pattern, `tokio-cron-scheduler` backend. **NOT used by Tauri commands — only tests.** Migration plan documented at `scheduler.rs:1-17`.

## NLP Parser (unused from commands)

`core/scheduler/nlp_parser.rs` parses natural language → `ParsedSchedule`:
- `"in 5 minutes"` → `Interval(Duration)`
- `"tomorrow at 9am"` → `Once(DateTime)`
- `"every Monday at 9am"` → `Cron`
- `"every morning"` → `Cron` (8am)

The frontend `JobCreationDialog` uses a cron builder UI, not the NLP parser.

## Component Tree

```
SchedulerPanel
├── Header (Calendar icon, title, count, Refresh, "New Job" button)
├── Tabs (All / Active / Paused / Failed with counts)
│   └── ScrollArea
│       ├── Error banner | Loading skeleton | Empty state
│       └── [sorted JobCard list]
│           └── JobCard
│               ├── Action icon + name + status Badge
│               ├── Cron expression (monospace)
│               ├── Stats: next_run, last_run, run_count, failure_count
│               └── DropdownMenu → Run Now / Edit / Pause|Resume / Delete
└── JobCreationDialog
    ├── Name + Description
    ├── Action Type Select (6 options) + dynamic config fields
    ├── Schedule: Presets (minute/hourly/daily/weekly/monthly/custom) + cron builder
    └── Cancel / Create button
```

## IPC Contracts

| Frontend Call | Rust Handler | Params (camelCase) | Returns |
|---|---|---|---|
| `invoke('scheduler_add_job', ...)` | `scheduler_add_job` | `name, schedule (string or {cronExpression}), actionType?, actionData?` | `String` (UUID) |
| `invoke('scheduler_remove_job', ...)` | `scheduler_remove_job` | `jobId? or id?` | `bool` |
| `invoke('scheduler_list_jobs')` | `scheduler_list_jobs` | none | `Vec<ScheduledJob>` |
| `invoke('scheduler_pause_job', ...)` | `scheduler_pause_job` | `jobId? or id?` | `bool` |
| `invoke('scheduler_resume_job', ...)` | `scheduler_resume_job` | `jobId? or id?` | `bool` |
| `invoke('scheduler_toggle_job', ...)` | `scheduler_toggle_job` | `id` | `bool` |
| `invoke('scheduler_run_job_now', ...)` | `scheduler_run_job_now` | `id` | `bool` |
| `invoke('scheduler_get_history', ...)` | `scheduler_get_history` | `jobId?` | `Vec<JobExecutionRecord>` |
| `invoke('scheduler_update_job', ...)` | `scheduler_update_job` | `id, updates: { name?, description?, schedule?, status? }` | `bool` |
| `invoke('scheduler_get_job', ...)` | `scheduler_get_job` | `jobId? or id?` | `Option<ScheduledJob>` |
| `invoke('scheduler_get_next_runs', ...)` | `scheduler_get_next_runs` | `limit?` | `Vec<NextRunEntry>` |

**Wire format note:** Rust uses `serde(rename_all = "camelCase")` but TypeScript `ScheduledJob` interface uses snake_case. `mapStoreJobToScheduledJob` adapter in `useScheduler.ts` handles mapping.

## Dependencies

- **Requires**: `chrono`, `cron` crate, `uuid`, `reqwest` (webhooks), `tokio::process::Command` (shell), `tauri::Emitter`
- **Required by**: Chat/agent system consumes `scheduler:agi-task`, workflow engine consumes `scheduler:workflow-execute`, notification system consumes `scheduler:notification`

## Known Gaps

1. **Type hierarchy mismatch**: Command-layer `ProactiveScheduler` incompatible with core-layer. Migration plan documented but not implemented.
2. **NLP parser unused**: Well-tested `nlp_parser.rs` not called from any Tauri command.
3. **In-memory only**: Jobs lost on app restart. No SQLite persistence.
4. **History in-memory**: Capped at 500, lost on restart.
5. **Wire format mismatch**: Rust camelCase vs TypeScript snake_case requires adapter.
6. **30s polling granularity**: Jobs can fire up to ~30s late.
7. **No lifecycle event emission**: The Rust backend does not emit any of the lifecycle events (`scheduler:job_executed`, `scheduler:job_added`, `scheduler:job_removed`, `scheduler:job_updated`, `scheduler:error`) that the frontend `useScheduler` hook expects to listen for. Only action-dispatch events (`scheduler:agi-task`, `scheduler:workflow-execute`, `scheduler:notification`) are emitted. Frontend only learns of state changes via polling `listJobs()`.

## Design Decisions

- **Merged store**: Eliminated `scheduledTaskStore`/`schedulerStore` split that caused duplicate Tauri calls and race conditions.
- **Dual param support**: Commands accept both `job_id` and `id` for frontend/test compatibility.
- **Action dispatch via Tauri events**: AGI tasks, workflows, notifications dispatched as events (not direct calls) to keep scheduler decoupled from agent/workflow engines.
- **Client-side cron validation**: Prevents round-trips for invalid input.
- **Preset system**: 5 named presets + custom builder keeps raw cron hidden from casual users.
