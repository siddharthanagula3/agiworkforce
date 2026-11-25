---
id: "AREA-060"
type: "area"
title: "Agentic work product"
features: ["F060-01", "F060-02", "F060-03", "F060-04", "F060-05", "F060-06", "F060-07", "F060-08", "F060-09", "F060-10", "F060-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 60. Agentic work product

A person describes a goal in plain words, and a managed agent runs it as a task in the background, with a plan, visible steps, and a result they can open, change, pause, or stop. The point is to get finished work (a report, a file, a set of actions) instead of a single chat reply. Because the task runs on the server, it can continue when the person closes the app, and the person can follow it from another device.

**Who uses it.** Only users whose plan grants the agi_work capability and whose account has the canUseAgiWork switch on. The handshake removes canUseAgiWork when no agentic model is in the catalog or when the plan lacks agi_work (apps/web/lib/services/capability-handshake-service.ts:101, :121). Which plans grant agi_work was not established. Admins and developers were not seen as a separate group in this area. The Tasks list shows only runs made in agiwork mode (apps/web/app/api/llm/v1/chat/completions/runs/route.ts:67).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F060-01](F060-01-start-a-task-from-a-goal.md) | Start a task from a goal | built | built | built | partly | no | partly |
| [F060-02](F060-02-choose-sources-tools-place-model-and-effort.md) | Choose sources, tools, place, model and effort | partly | built | partly | no | no | partly |
| [F060-03](F060-03-spend-time-and-completion-limits.md) | Spend, time and completion limits | no | no | no | partly | no | no |
| [F060-04](F060-04-review-the-plan-before-it-acts.md) | Review the plan before it acts | built | built | built | built | no | built |
| [F060-05](F060-05-follow-progress.md) | Follow progress | partly | partly | partly | partly | partly | partly |
| [F060-06](F060-06-answer-questions-and-approvals.md) | Answer questions and approvals | built | built | built | built | partly | partly |
| [F060-07](F060-07-steer-pause-resume-and-stop.md) | Steer, pause, resume and stop | built | built | partly | partly | partly | partly |
| [F060-08](F060-08-retry-restart-and-duplicate.md) | Retry, restart and duplicate | built | built | partly | partly | no | no |
| [F060-09](F060-09-save-a-task-as-a-routine-or-a-skill.md) | Save a task as a routine or a skill | partly | partly | partly | partly | no | no |
| [F060-10](F060-10-results-deliverables-and-partial-outcome.md) | Results, deliverables and partial outcome | built | built | built | partly | built | partly |
| [F060-11](F060-11-task-list-history-sharing-and-handoff.md) | Task list, history, sharing and handoff | built | built | partly | partly | partly | partly |

Requirement items for this area: [10-requirements/capabilities/060-agentic-work-product.md](../../10-requirements/capabilities/060-agentic-work-product.md).

## How this area works in the code

1. **Turn on the mode and check the switch.** The composer sends the goal only when the agiwork mode is on and the account has canUseAgiWork. The server checks the same capability before it runs the turn. The kill switch maps canUseAgiWork to the 'work' subject. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4555-4570 (canUseAgiWork and workMode in composer state)`, `apps/web/lib/feature-flags/kill-switches.ts:31 and :40`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5218 (assertCapabilityAvailable WORK_CAPABILITY)`)
2. **Validate the goal.** The request carries agi_work_goal. It is parsed for goal, constraints, deliverable and excludedTools, with length limits and empty fields dropped. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:795 (agi_work_goal field)`, `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:27 (AgiWorkGoalSchema)`, `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:19 (excludable tools)`)
3. **Start the run (mobile path shown).** The mobile app builds the goal input, picks a cloud model, and starts a run. The run id is passed back so the app can follow it. (`apps/mobile/src/features/tasks/startWork.ts:33 (cloudWorkRunTitle)`, `apps/mobile/src/features/tasks/startWork.ts:44 (startCloudWorkRun)`)
4. **Run the agent loop and emit steps.** The server runs the agent turn. Steps, plan and progress are emitted as events. A clarify question can pause the run and resume it with the answer. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4789 (continuesTurn for resume and pause)`, `apps/web/lib/services/clarify-tool-service.ts:12 (CLARIFY_TOOL_NAME)`, `apps/web/lib/services/clarify-tool-service.ts:56 (turnWarrantsClarifyTool)`)
5. **Store run state and follow it.** Runs are rows in a server table. Listing filters by agiwork mode and active states. Follow-up reads the snapshot and its events by sequence number. (`apps/web/app/api/llm/v1/chat/completions/runs/route.ts:34 (DEFAULT_ACTIVE_STATES)`, `apps/web/app/api/llm/v1/chat/completions/runs/route.ts:98 (getUserScopedDb)`, `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:70-91 (GET snapshot; POST cancel)`)
6. **Pause, steer, resume or cancel.** Pause sets pause_requested_at only while the run is executor-held, else it returns 409. Steer queues a message on the run. Cancel marks a cancellation, and a human-held run is cancelled at once. Each write is CSRF-checked and audited. (`apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts:29-50 (handlePause)`, `apps/web/lib/services/cloud-agent-run-service.ts:2727-2744 (requestCloudAgentRunPause)`, `apps/web/lib/services/cloud-agent-run-service.ts:2798 (queueCloudAgentRunSteer)`, `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.ts:33-60 (withdraw)`, `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:81-84 (cancel)`)
7. **Resume a paused run.** A paused run is claimed by a lease, then re-run from its saved checkpoint. The lease is released when done or on error. (`apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:100-120 (releaseClaim, releaseReservation)`, `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:426 (POST)`)
8. **Show the result.** The shared Tasks page renders the list, detail panel, steer box and actions. Each app renders its own detail view. (`packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:631-633 (onPause, onResume, onCancel)`, `packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx:83 (steer box)`, `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:647 (results summary)`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Shared Tasks page: list, detail, pause, resume, cancel, save-as-routine wiring (lines 199, 631-633, 668-670). |
| `packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx` | Steer box: send guidance to a running task, resend or withdraw queued messages. |
| `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Task detail: results summary (647), partial outcome, files, share. |
| `apps/web/app/api/llm/v1/chat/completions/runs/route.ts` | List runs: active states (34), agiwork-only filter (67), search, project and conversation filters. |
| `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Run snapshot (GET) and cancel (POST). |
| `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts` | Pause a running task; 409 if it is waiting on the person or stopped. |
| `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts` | Resume a paused run from its checkpoint, with a lease so only one resume runs. |
| `apps/web/lib/services/cloud-agent-run-service.ts` | Server logic for pause, cancel, steer queue, withdraw and list (2727, 2798, 2878, 1174). |
| `apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts` | Goal schema, excluded tools and plan step statuses. |
| `apps/web/lib/services/clarify-tool-service.ts` | Clarifying-question tool: name, offer rules (56). |
| `apps/web/lib/feature-flags/kill-switches.ts` | Kill switch canUseAgiWork (31) that gates the whole area. |
| `apps/mobile/src/features/tasks/startWork.ts` | Mobile start: title (33), cloud model choice (25), start run (44). |
| `apps/cli/src/claude_parity.rs` | CLI /budget per-turn credit cap (1429-1448) and CLI parity commands. |

## What is stored

- Cloud task runs: state, pause_requested_at, cancellation_requested_at, user id, updated time: Server Postgres table public.cloud_agent_runs (apps/web/lib/services/cloud-agent-run-service.ts:2727-2744, 1174-1180)
- Queued steer messages on a run (pendingSteers, max count in contract): Server, attached to the run; contract in packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:180. Table name not traced.
- Paused-run checkpoint and its lease: Server (releaseCloudAgentPauseCheckpoint used in resume/route.ts). Table name not traced.
- Goal, constraints, deliverable, excluded tools of a task: Stored with the run on the server (agiwork-plan.ts schema). Exact column not traced.
- Stopped-run assistant turn for a cancelled run: Written by recordStoppedRunAssistantTurn (runs/[runId]/route.ts:86 import), a chat message on the server
- Per-session CLI spend cap in credits: CLI session memory (session.max_budget_usd, apps/cli/src/claude_parity.rs:1433-1448); not saved to disk in code seen
- Mobile cloud run list and detail: Mobile store (apps/mobile/src/features/tasks/store.ts, referenced by brief, not opened)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **canUseAgiWork (kill switch, subject 'work')**: Turns the whole AGI Work mode on or off; when off, starting an agiwork turn is refused. (apps/web/lib/feature-flags/kill-switches.ts:31, :40; checked at apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5218)
- **Capability handshake removal of canUseAgiWork**: Removes the capability when no agentic model exists in the catalog or the billing plan lacks agi_work. (apps/web/lib/services/capability-handshake-service.ts:101, :121, :182)
- **AGI_WORK_MODES filter**: Task list shows only agiwork runs; a conversation or request-id lookup is not filtered. (apps/web/app/api/llm/v1/chat/completions/runs/route.ts:67)
- **DEFAULT_ACTIVE_STATES**: Which states the task list shows by default when no state is given. (apps/web/app/api/llm/v1/chat/completions/runs/route.ts:34)
- **Plan limits AGIWORK_PLAN_MAX_STEPS, MAX_AGIWORK_GOAL_CHARS, MAX_AGIWORK_PLAN_STEP_CHARS**: Caps the number and length of plan steps and goal text. (apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:2-4 (imported from packages/contracts/cloud-contracts))
- **AGIWORK_EXCLUDABLE_TOOLS (web_search, code_execution)**: Which tools a person may exclude from an agiwork task. (apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:19)
- **Rate limit buckets agent-run-follow and llm-completion**: Limits how often run lists and snapshots, and pause, cancel, steer calls, are served. (runs/route.ts, runs/[runId]/route.ts, runs/[runId]/pause/route.ts, steer/[steerId]/route.ts (withRateLimit calls))
- **CLI /budget <credits> | off**: Sets or removes a per-turn spend cap for the CLI session. (apps/cli/src/claude_parity.rs:1429-1448)
- **CHAT_CODE_RUN_MAX_DURATION_SECONDS = 300**: A 300-second duration cap on code runs. This is not the task time budget. (packages/contracts/cloud-contracts/src/chat-code-runs.ts:6)

## Shared between apps

Shared: packages/ui/unified-chat (Tasks page, task detail, steer section, step timeline) is used by web and desktop, and the brief says it is shared with Chrome and VS Code. Shared server logic: apps/web/lib/services/cloud-agent-run-service.ts and the runs/* API routes, plus packages/contracts/cloud-contracts (schemas and limits). Separate per app: web composer (ChatComposerNew.tsx), mobile tasks feature (apps/mobile/src/features/tasks/*, startWork.ts, CloudTasksScreen.tsx), CLI terminal UI and parity commands (apps/cli/src/tui/tui_app.rs, apps/cli/src/claude_parity.rs), VS Code webview and cloud-tasks tree (apps/extension-vscode/src/features/cloud-tasks/*), desktop shell (apps/desktop/src/features/tasks/DesktopTasks.tsx). Each app reads the same server run records, so a task started on one device can be followed on another.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief cites apps/cli/src/claude_parity.rs:1005 as the spend budget, but that line is a table cell comparison helper (compare_cells/cell_number). The real budget handler is handle_budget at line 1429. The brief's citation is wrong. (apps/cli/src/claude_parity.rs:995-1015 vs :1429)
- Brief says CLI Save as Skill is at claude_parity.rs:255 and :767. Lines 252-258 are the Managed Cloud continuation draft, and lines 765-770 are the app/plugin install text. Neither is a Save as Skill path. (apps/cli/src/claude_parity.rs:252-258, :765-770)
- Brief says the objective field is at ChatComposerNew.tsx:2983. That region is the @-mention picker code that strips the query text, not the goal field. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2975-2990)
- The CLI spend cap is per turn (message: Each turn stops once it has spent N credits), but the brief says a task's run stops at the cap. A per-run spend cap was not found on the server path read. (apps/cli/src/claude_parity.rs:1433-1448)
- Pause accepts a request and records pause_requested_at, but the step-boundary stop it promises was not traced in the executor. Pause is only allowed in executor-held states. (apps/web/lib/services/cloud-agent-run-service.ts:2727-2744)
- Save as routine is wired only through an optional transport callback; no provider of saveAsRoutine was found, so the control may never show. (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:199, :668-670)

## Not established

- Which plans grant agi_work and whether free users can see the area (only the gate was read, not the plan table).
- The exact UI gestures in web, desktop, VS Code and Chrome: the steps listed are inferred from component names, not opened.
- Whether plan approval (S60.13) blocks the executor until the person answers; tool-loop.ts:4789 was a sandbox setup block, not the plan gate.
- Retry of a single failed step (S60.24): the plan review card is named but its retry handler was not opened.
- Table names for steers, pause checkpoints, goals and files; only public.cloud_agent_runs was seen in SQL.
- Whether a task's model and effort are stored on the run record (S60.08, S60.09).
- Chrome extension status for every item: no Chrome code was opened.
- Files and deliverables API (apps/web/app/api/files/[id]/route.ts) and sharing route were not opened; cited only from the brief.
- Mobile and CLI cross-device behaviour beyond the list and snapshot routes.
- Whether the time limit (S60.11) and completion condition (S60.12) exist in any app: searched for time-budget and completion-condition names and found none, but that search was not exhaustive.
- Dependency display (S60.15): no dependency field or UI was found in the task components searched, but the search was not exhaustive.
- Whether the steer queue, pause and cancel are executed by a worker that was not opened.
- Localhost testing was not part of this read-only task: nothing was built, run or tested, as the brief requires.
