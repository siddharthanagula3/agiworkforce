---
id: "F102-02"
type: "feature"
title: "Durable agent runs and deep research"
aliases: ["Durable agent runtime", "Cloud agent turn workflow", "cloud-agent-turn", "Research worker runtime", "Deep Research", "Research", "Agent run reaper", "S102.05", "S102.06"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.05", "S102.06"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "F102-01", "surface:web", "surface:desktop", "mode:cloud", "plan:pro", "plan:max", "plan:max_15x", "table:cloud_agent_runs", "file:apps/web/lib/workflows/cloud-agent-workflow.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-02 Durable agent runs and deep research

Agent turns that use tools or AGI Work, and approved deep-research runs, start as durable Workflow runs so they can outlive the browser request. A reaper cron ends runs whose worker vanished. If the durable path fails, the turn degrades to a request-scoped stream. Deep Research needs Premium or above.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.05](../../10-requirements/capabilities/102-runtime-inventory.md#s10205), [S102.06](../../10-requirements/capabilities/102-runtime-inventory.md#s10206).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs long Cloud agent turns as durable workflows. The run is journaled, can be followed again, can be cancelled, can wait for a sleeping desktop, and is cleaned up by a reaper if its worker is lost. Deep Research is a bounded loop of plan, search, fetch and report.

**Why it exists.** A normal HTTP request dies when the tab closes. Agent and research turns take minutes and cost money, so they must survive disconnects, settle usage exactly once, and never leave a run stuck forever.

**Who uses it.** Paid users running tool turns, AGI Work or Deep Research on the web or any client that starts a Cloud agent turn; operators who watch the reaper.

**Problems it solves**

- Turns lost when the browser closes.
- Runs stuck in a working state that block a conversation.
- Device-based steps when the desktop is asleep.
- Paying for a turn nobody sees.

**Use cases**

- A Premium user turns on Research for a question, closes the tab, and returns to a finished cited report.
- A user starts an AGI Work task and stops it from the chat; the server records the cancellation and the run ends.
- A run whose worker crashed is ended with a plain message by the reaper within about 18 minutes.
- A task that needs the user's desktop waits up to 60 minutes for it to wake, then continues without device tools.

## 2. User experience

**Where to find it**

- Web chat composer: the attachment menu item labelled 'Research' toggles deep research (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:839-846), shown only when the model supports research.
- Research status chip labelled 'Deep research: <state>' (packages/ui/unified-chat/src/components/ResearchStatusChip.tsx:100).
- Saved reports gallery: 'Deep Research runs save their report here when they finish' (apps/web/features/chat/components/research/ResearchPanel.tsx:300).
- Desktop: the same hosted web app. Other apps: unknown.

**Before you start**

- Signed-in account.
- For Deep Research: plan tier pro (shown as Premium), max, max_15x (Ultra), team, team_premium or enterprise (packages/contracts/types/src/billing-catalog.ts:341, :355). Free and Basic are refused with plan_upgrade_required, HTTP 403 (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1503-1523).
- For AGI Work: the same PRO_TIERS list (billing-catalog.ts:354) and the Work capability switch must be on (apps/web/lib/workflows/start-cloud-agent-workflow.ts:~75-92).

**Screens and controls**

- Research toggle in the attachment menu; plan card where the user picks sources and clarifying answers (apps/web/features/chat/utils/research-plan.ts).
- Stop control on the composer (the send button becomes stop, ChatInput.tsx:1024 comment).
- Research report view and reports gallery (apps/web/features/chat/components/research/).

**Journey**

1. 1. The user sends a tool turn, an AGI Work task or a Research turn.
2. 2. The server creates a run row and tries to start the durable workflow (route.ts:946-990).
3. 3. The first stream frame must arrive within a budget or the durable start is cancelled and the turn runs request-scoped (route.ts:967-980).
4. 4. The workflow loops: wait for a device if needed, run one invocation, repeat until terminal, settle the work plan, close the stream (cloud-agent-workflow.ts:69-100).
5. 5. The user may close the tab; the run keeps going and its events are kept in the run journal.
6. 6. The user may stop the run: POST to the run route marks cancellation; the workflow notices it.
7. 7. The final answer or report appears; a stuck run is ended by the reaper.

**What the person sees and gets**

- Streamed events including research plan, status, gaps and sources.
- Header X-AGI-Tool-Loop: durable and X-AGI-Workflow-Run-Id on durable turns (route.ts:983-984).
- Messages when a run ends abnormally: 'This turn did not finish: the run working on it ended before it could report back.' or 'You stopped this turn, and the run working on it ended before it could report back.' (cloud-agent-run-reaper.ts:~37-40).
- Upgrade message: 'Deep Research is available on <plans> plans. Upgrade your plan to use it.' (request-processor.ts:1514).

**Settings**

- Research source choices on the plan card: web, files, connectors (research-sources).
- Server: AGI_DURABLE_INITIAL_TURNS, AGI_DB_LOW_POWER (cron skip).
- Tool approval mode query parameter approval_mode (route.ts doc comment ~lines 183-186).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Durable start: start(cloudAgentWorkflow) with a 10 s world-call deadline, then the run is attached to the workflow run id; if attach fails the workflow is cancelled (apps/web/lib/workflows/start-cloud-agent-workflow.ts:116-200, deadline-policy.ts:40).
- Queue name 'cloud-agent-turn' is used as a trace attribute for the enqueue span (start-cloud-agent-workflow.ts:63) [the code shows it as a name label; whether Workflow exposes a separate queue by that name was not verified].
- Workflow loop with device wait budget 60 minutes then device tools withdrawn (cloud-agent-workflow.ts:14-16, :19-66) and failure handling that marks the run failed, settles the work plan and closes the stream (cloud-agent-workflow.ts:92-100).
- Per-step limits: invocation limit 800 s, step limit 210 s (apps/web/lib/deadline-policy.ts:16, :18); research hand-off after half a step (line 34).
- Degrade to request-scoped when kill switch is on, no reservation exists, the workflow fails to start, the stream stalls or the transport is cooling down (start-cloud-agent-workflow.ts:~236-262; runCloudAgentTurn :264).
- Resume paths (approve, resume-input, tool-result) use runCloudAgentTurn (apps/web/app/api/llm/v1/chat/completions/approve/route.ts:560).
- Cancellation: POST /api/llm/v1/chat/completions/runs/[runId] records a cancellation request, finishes parked runs directly, records the stopped turn and an audit event (runs/[runId]/route.ts:68-110, cloud-agent-run-service.ts:1174, :3120). Client polls up to 30 times at 1 s to confirm (apps/web/features/chat/lib/cancel-cloud-run.ts:1-20).
- Reaper cron: every 15 minutes at :10,:25,:40,:55 (vercel.json:70-72); ends runs in worker-held states older than 800 s + 300 s lease, in batches of 200, up to 25 batches or 240 s, and cancels the workflow runs (cloud-agent-run-reaper.ts:13-22, :90-140; app/api/cron/reap-agent-runs/route.ts:23).
- Deep research loop: defaults 6 iterations, 12 searches, 3 parallel tool calls; 8 fetches total and 3 per round; plan up to 6 queries and 3 questions (research-loop.ts:178-232); fetch step near line 2767; report cost settled by job 'research.settle-report-cost' (job-handlers.ts:~360).
- Approved research runs go durable (route.ts:634-690); first-time research runs go through the request-scoped research stream with the heartbeat (route.ts:786).

**Incomplete**

- The brief says deep research runs in a background worker that outlives the request; in code a research run is detachable only when it is an approved research resume (approvedResearchRun, route.ts:634-639). Other research turns stream request-scoped (route.ts:786).
- Per-app differences are not recorded in the brief.

**Present but disconnected or switched off**

- Durable transport is off when AGI_DURABLE_INITIAL_TURNS is 0/false/off (durable-initial-turns.ts:6-14).
- When AGI_DB_LOW_POWER is 1, the reaper cron is skipped after minute 15 of each hour (apps/web/lib/server/cron-low-power.ts:3-17).

**Not available**

- Deep Research for Free and Basic plans (billing-catalog.ts:341, :355).
- Reaper has no route test file (apps/web/app/api/cron/reap-agent-runs contains only route.ts); the service has one (cloud-agent-run-reaper.test.ts).

## 4. Required behaviour

**Established requirements**

- Agent runs execute as durable workflows that survive the request and are reaped when stuck. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.05)
- Deep research runs in a background worker that outlives the chat request. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.06)
- Deep Research is a Premium-and-above capability; AGI Work likewise. (source: (packages/contracts/types/src/billing-catalog.ts:354-355))
- The durable transport degrades, it does not fail, when unavailable; authorization gates run before a transport is chosen. (source: (apps/web/lib/workflows/start-cloud-agent-workflow.ts:~214-229 doc comment))

**Acceptance criteria**

1. A Premium user's tool turn returns header X-AGI-Tool-Loop: durable and an X-AGI-Workflow-Run-Id.
2. Closing the tab during a durable run does not stop it; the run can be read by GET runs/[runId] afterward.
3. POST to runs/[runId] returns 202 and the run reaches a terminal state; the UI confirms within 30 seconds or reports not stopped.
4. A Free or Basic user sending research:true receives HTTP 403 with code plan_upgrade_required.
5. A run in a worker-held state with no update for over 1100 seconds is set to failed (or cancelled if a cancel was requested) by the reaper and gets an explanatory message.
6. With the kill switch set, the same turn runs request-scoped and logs the kill-switch warning.
7. If the device is asleep the run reports waiting, and after 60 minutes continues without device tools.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plain chat turns without tools are not detachable by design (route.ts:~880-935 enters the durable block only when the tool loop should run or the turn is AGI Work) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make first-time Deep Research runs detachable as the brief states, or change the brief to match the code.
- [proposed] Add a route test for the reaper cron.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | startCloudAgentWorkflowExecution / runCloudAgentTurn | `apps/web/lib/workflows/start-cloud-agent-workflow.ts` | Starts the durable run and degrades to inline (lines 116, 264, 372). |
| job | cloudAgentWorkflow | `apps/web/lib/workflows/cloud-agent-workflow.ts` | Workflow loop: device wait, invocation, settle, close stream (line 69). |
| job | executeCloudAgentWorkflowInvocation | `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts` | One bounded invocation step (line 534); research hand-off at line 644. |
| service | settle-workflow-invocation | `apps/web/lib/workflows/steps/settle-workflow-invocation.ts` | Settles usage for an invocation. |
| service | fail-cloud-agent-workflow | `apps/web/lib/workflows/steps/fail-cloud-agent-workflow.ts` | Marks a failed run. |
| config | durable-initial-turns | `apps/web/lib/workflows/durable-initial-turns.ts` | Kill switch AGI_DURABLE_INITIAL_TURNS. |
| config | deadline-policy | `apps/web/lib/deadline-policy.ts` | Invocation, step, hand-off and world-call time limits (lines 16-40). |
| service | durable stream helpers | `apps/web/lib/workflows/durable-stream-liveness.ts` | Claims a live stream and detects a cooling-down transport. |
| service | cloud-agent-run-service | `apps/web/lib/services/cloud-agent-run-service.ts` | Run state, cancellation (line 1174), human-held cancel (line 3120). |
| service | cloud-agent-run-reaper | `apps/web/lib/services/cloud-agent-run-reaper.ts` | Ends orphaned runs (line 90). |
| job | reap-agent-runs cron | `apps/web/app/api/cron/reap-agent-runs/route.ts` | Cron entry; scheduled in vercel.json:70. |
| endpoint | GET/POST /api/llm/v1/chat/completions/runs/[runId] | `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts` | Read the run journal; request cancellation (lines 111-112). |
| service | research-loop | `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Plan, search, fetch, report loop and its limits (lines 178-232). |
| service | getResearchPlanRefusal | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Refuses research on plans without the capability (line 1503). |
| config | billing plan capabilities | `packages/contracts/types/src/billing-catalog.ts` | deep_research and agi_work tier lists (lines 341, 354-355). |
| table | cloud_agent_runs | `apps/web/lib/services/cloud-agent-run-reaper.ts` | Run rows; the reaper updates state here (line ~104). |
| component | AttachmentMenu Research item | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | The 'Research' toggle (line 839). |
| component | ResearchStatusChip | `packages/ui/unified-chat/src/components/ResearchStatusChip.tsx` | Shows research state. |
| service | cancelCloudRunAndConfirm | `apps/web/features/chat/lib/cancel-cloud-run.ts` | Client stop with 1 s polling. |
| config | cron low power | `apps/web/lib/server/cron-low-power.ts` | AGI_DB_LOW_POWER skip. |
| job | cloud-code-turn workflow | `apps/web/lib/workflows/cloud-code-turn-workflow.ts` | A second durable workflow for cloud code turns, with its own reaper cron (vercel.json:58). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The route classifies the turn and creates a run row. | our servers | (route.ts:~899-905 beginCloudAgentRun) |
| The server starts the workflow with a 10 s deadline and attaches the run to the workflow run id. | our servers | (start-cloud-agent-workflow.ts:~140-175) |
| The workflow runtime (Vercel Workflow) executes steps and keeps durable state. | outside service | (start-cloud-agent-workflow.ts:4 imports start from 'workflow/api') |
| Each invocation calls the model provider through the tool loop, using tools, connectors and optionally the user's device. | outside service | (steps/execute-cloud-agent-invocation.ts:534) |
| If a device step is needed the workflow waits for the desktop (up to 60 minutes). | device and our servers | (cloud-agent-workflow.ts:14-66) |
| The result is settled; the work plan is settled; the stream is closed. | our servers | (cloud-agent-workflow.ts:80-90) |
| The reaper cron ends runs with no update beyond the age limit and cancels their workflow runs. | our servers | (cloud-agent-run-reaper.ts:90-140) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Run row and event journal | Neon table cloud_agent_runs (and event rows) | Server data; followable from any surface | unknown |
| Research report and sources | server; saved reports gallery | Yes, across chats | unknown |
| Usage reservation and settlement | managed usage tables | Server only | unknown |

**Models and providers.** The workflow rehydrates the processed request and calls the same provider adapters as chat (start-cloud-agent-workflow.ts imports ADAPTER_PROVIDERS, createFailoverPlan). Failover may switch the serving model; settlement prices by the serving model (route.ts:~598-602 comment). Research and agent models must support tools or research (request-processor.ts:60).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. |
| Permissions | Tool approvals default to manual; auto only when requested; connector permissions and workspace policy gates run before a transport is chosen (start-cloud-agent-workflow.ts doc comment). |
| Subscription | Deep Research and AGI Work need pro, max, max_15x, team, team_premium or enterprise (billing-catalog.ts:341, :354-355). Label for pro is Premium and for max_15x is Ultra (billing-catalog.ts:193-205). |
| Limits and metering | Each durable turn carries a managed or free reservation across the workflow boundary (start-cloud-agent-workflow.ts doc comment AGI-126); research bounds listed above; reaper age 1100 s. |
| Feature flags | AGI_DURABLE_INITIAL_TURNS; AGI_DB_LOW_POWER; the Work capability switch (canUseAgiWork, apps/web/lib/feature-flags/kill-switches.ts:31). |
| Model compatibility | Research requires a model that supports research (request-processor.ts:60 modelSupportsResearch); tool turns need tool-capable models. |
| Provider restrictions | Providers in the adapter table only. |
| Local mode | Not applicable: durable runs are Cloud only. Local and own-key do not enter this workflow (request-processor.ts:4876). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Durable start fails | Logs an error and serves the turn request-scoped with the same wire. | (route.ts:1000-1030) |
| Stream stalls before first event | The workflow is cancelled before the inline turn starts to avoid running twice. | (route.ts:967-980) |
| Cancel while parked on a person | The server completes the stop itself. | (runs/[runId]/route.ts:68-90) |
| Cancel confirmation timeout | Client stops polling after 30 attempts and reports not terminal. | (cancel-cloud-run.ts:1-20) |
| Device asleep | Waits up to 60 minutes, then removes device tools and continues. | (cloud-agent-workflow.ts:14-16, :19-45) |
| Worker lost | Reaper marks failed or cancelled and posts an explanatory message. | (cloud-agent-run-reaper.ts:90-140) |
| Reaper budget exceeded | Report says remaining: true; next cron continues. | (cloud-agent-run-reaper.ts:100-104) |
| Reaper error | HTTP 500 'Cloud agent run reaper failed'. | (reap-agent-runs/route.ts:28-31) |
| Offline client | The run keeps going; the client can re-read the journal with ?after=<sequence>. | (runs/[runId]/route.ts:45-65) |
| Accessibility | unknown | not read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/workflows/start-cloud-agent-workflow.test.ts`: Durable start and degrade reasons.
- `apps/web/lib/workflows/cloud-agent-workflow.device-clearance.test.ts`: Device wait and withdrawal.
- `apps/web/lib/workflows/cloud-agent-workflow.settle.test.ts`: Settlement.
- `apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts`: Stream liveness.
- `apps/web/lib/workflows/durable-initial-turns.test.ts`: Kill switch.
- `apps/web/lib/workflows/__tests__/durable-stream-bounds.test.ts`: Stream bounds.
- `apps/web/lib/services/cloud-agent-run-reaper.test.ts`: Reaper service.
- `apps/web/app/api/cron/cron-registration.test.ts`: Every cron route is registered in vercel.json once.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-loop.query-rewrites.test.ts`: Research query rewrites.
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__/research-sources.test.ts`: Research sources.
- `apps/web/features/chat/utils/research-plan.test.ts`: Research plan card logic.

**Test scenarios**

- **Close the tab during a run**
  1. As a Premium user start an AGI Work task.
  2. Note the run id from the X-AGI-Workflow-Run-Id header.
  3. Close the tab for 2 minutes.
  4. GET /api/llm/v1/chat/completions/runs/<id>.
  - Expected: State is working or completed and events continue to grow.
- **Stop a run**
  1. Start a long run.
  2. Press stop.
  3. Watch the run state.
  - Expected: POST returns 202; state becomes cancelled within 30 s; a stopped assistant turn is saved.
- **Free refusal**
  1. As a Free user send a chat request with research true.
  - Expected: HTTP 403, code plan_upgrade_required, required_plans list.
- **Reaper**
  1. On a test database set a worker-held run's updated_at back by 20 minutes.
  2. Call the reap-agent-runs cron with the cron secret.
  - Expected: Response reaped 1; row failed; explanatory message stored.
- **Kill switch**
  1. Set AGI_DURABLE_INITIAL_TURNS=off.
  2. Send a tool turn.
  - Expected: Turn runs inline; warn log about the kill switch.

**Where to look when it fails**

- Logs: 'Durable agent transport unavailable; running this turn request-scoped', 'Durable initial agent turn could not start', 'Reaped cloud agent runs whose invocation had ended', 'Cloud agent run reaper failed'.
- Error class: CloudAgentWorkflowUncertainStartError.
- Table: cloud_agent_runs (state, cancellation_requested_at, workflow_run_id).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief says deep research outlives the request; only approved research resumes are durable in code.** Affects: Web and any client starting first-time research.. Evidence: (route.ts:634-690 vs :786). Work needed: Decide: detach every research run, or correct the brief.
- **'cloud-agent-turn' is only a span label; no separate queue was verified.** Affects: Documentation accuracy.. Evidence: (start-cloud-agent-workflow.ts:63). Work needed: Confirm Workflow platform queue naming.
- **No route test for the reaper cron.** Affects: Operators.. Evidence: (apps/web/app/api/cron/reap-agent-runs has only route.ts). Work needed: Add a route test.
- **Per-app behaviour (mobile, CLI, VS Code, Chrome) for cloud agent runs is not recorded.** Affects: Those apps.. Evidence: (brief gives platform status only). Work needed: Survey each client.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- F102-01
- surface:web
- surface:desktop
- mode:cloud
- plan:pro
- plan:max
- plan:max_15x
- table:cloud_agent_runs
- file:apps/web/lib/workflows/cloud-agent-workflow.ts

## Unknown

- Whether Workflow exposes a queue called cloud-agent-turn.
- Retention of run journals and research reports.
- Which non-web apps start Cloud agent turns (Chrome extension uses a cloud agent client; others not checked).
- Visible stop-control label.
- Brief lines execute-cloud-agent-invocation.ts:403 and settle-workflow-invocation.ts:207 were not opened.
