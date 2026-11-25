---
id: "F067-09"
type: "feature"
title: "Bounded goal loops"
aliases: ["Bounded goal/completion loops (S67.36)", "max turns", "--max-turns", "maxTurns", "turn step limit", "Cloud turn budget", "max budget"]
area: "67 Coding capabilities and developer workflows"
available_on: ["web", "cli"]
implementation: {web: "partial", desktop: "n/a", mobile: "missing", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S67.36"]
depends_on: ["surface:cli", "surface:desktop", "surface:web", "surface:mobile", "mode:local", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "file:crates/agiworkforce-agent-core/src/engine.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-09 Bounded goal loops

The brief wants a goal plus a turn or time bound, with the agent looping until done or the bound hits. No goal command was found. What exists is a per-turn cap on tool steps (CLI default 25, settable), an optional dollar cap on the CLI, a step and 13 minute cap on Cloud turns, and a maxTurns option the Desktop and local panel pass to the CLI.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.36](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6736).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stops an agent's run from going on forever by capping tool-use steps, and in Cloud also time. The CLI engine loops over tool batches up to effective_max (crates/agiworkforce-agent-core/src/engine.rs:90) and stops on a cancel, a runaway repeat, or a budget cap (engine.rs:76-90, 281-290).

**Why it exists.** The brief: 'The user sets a goal and a bound (turns/time) and the agent loops until done or the bound is hit' (brief S67.36).

**Who uses it.** Developers running long coding tasks on CLI, Desktop local sessions, Web Cloud sessions.

**Problems it solves**

- A run that never ends and spends money.
- A model that repeats the same tool call (runaway tracker, engine.rs:104-115).
- A Cloud turn that outlives the request budget.

**Use cases**

- Run the CLI with --max-turns 10 for a small task.
- Set --max-budget-usd to cap spend.
- A Cloud session turn stops with reason max_steps or timeout and the person continues.
- A Desktop session passes maxTurns to the CLI on a turn.

## 2. User experience

**Where to find it**

- CLI: flag --max-turns N and --max-budget-usd (apps/cli/src/lib.rs:313-315, 491-492).
- Desktop and Local-mode web: the turn start accepts maxTurns when the CLI reports that capability (apps/web/features/code/hooks/use-local-session.ts:47, 420; apps/desktop/electron/runtime/developerSessionService.ts:1359). A visible control that sets it was not found in apps/web/features/code components (search for maxTurns found only the hook).
- Web Cloud: bounds are fixed by the service (apps/web/lib/services/cloud-code-agent-loop.ts:52-53; apps/web/lib/deadline-policy.ts:42).
- Mobile: no goal or bound control found; the brief says done as remote view (doc: brief S67.36).
- A goal command or composer field was not found in any app.

**Before you start**

- CLI: none beyond a session.
- Cloud: Managed Code switches on and an entitled plan (apps/web/lib/services/cloud-code-session-open.ts:44-52).

**Screens and controls**

- CLI flags above.
- Local turn controls: Stop and queue/steer placeholders in the composer (apps/web/features/code/local-code.ts:260-263).

**Journey**

1. Start a CLI session with --max-turns N.
2. The agent runs tool batches, each counted as an iteration.
3. At N iterations the loop ends and the turn returns what it has.
4. In Cloud the loop returns stopReason 'max_steps' or 'timeout' and the session can be continued with a new message.

**What the person sees and gets**

- CLI emits an IterationStarted event with iteration and max (engine.rs:118-122).
- Cloud returns stop reasons: done, max_steps, timeout, cancelled, error, denied, awaiting_approval (cloud-code-agent-loop.ts:71-72).
- A message that tells the person the bound was hit: not found for the CLI (unknown).

**Settings**

- --max-turns, --max-budget-usd (CLI).
- Agent definition file keys max_turns / maxTurns for subagents (apps/cli/src/agents.rs:1487-1491).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI turn loop bound by effective_max = max_turns or 25 (apps/cli/src/agent/chat.rs:1447; crates/agiworkforce-agent-core/src/runaway.rs:11).
- Dollar budget guard stops before and after tool batches (engine.rs:76-90, 281-290).
- App-server turn start validates maxTurns (at least 1) and passes it on (apps/cli/src/app_server/developer_host.rs:6710-6718).
- Desktop forwards maxTurns to the CLI (apps/desktop/electron/runtime/developerSessionService.ts:3294).
- Cloud agent turn bound by steps and a 13 minute budget with a stop reason (cloud-code-agent-loop.ts:52-53, 393-396, 645).

**Incomplete**

- No goal object: no field holds 'the goal' and no check of 'done' beyond the model stopping tool calls [inferred from the engine loop ending when there are no tool calls, engine.rs:98-100].
- No time bound for the CLI; only steps and dollars.
- The web local panel passes maxTurns if given but no control sets it (hook only).

**Present but disconnected or switched off**

- Cloud loop needs the managed Code switches (cloud-code-session-open.ts:44-52).

**Not available**

- A /goal command or goal composer: searched apps/cli/src for goal and found only /workflow (subagent.rs:1235) and think-back text.
- Desktop is listed n/a in the brief; Desktop code does pass maxTurns.

## 4. Required behaviour

**Established requirements**

- The user sets a goal and a bound (turns or time); the agent loops until done or the bound is hit. (source: brief S67.36)
- Cloud code requires the cloud switch. (source: apps/web/lib/services/cloud-code-session-open.ts:44-52)

**Acceptance criteria**

1. CLI with --max-turns 2 stops after two tool iterations.
2. CLI with --max-turns 0 through the app server is refused with 'maxTurns must be at least 1'.
3. A budget cap stops a turn and reports BudgetExceeded.
4. A Cloud turn that reaches the step cap returns stop reason max_steps.
5. A Cloud turn past the time budget returns timeout.
6. A person's stop request ends the loop before the next batch.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The person should be told in plain words when a bound ends the turn, and offered 'continue'.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a goal field with a bound to the composer on all coding apps.
- [proposed] Add a time bound for local sessions.
- [proposed] Show 'Stopped at N steps' in the transcript.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | run_turn loop | `crates/agiworkforce-agent-core/src/engine.rs` | Iteration loop, cancel, runaway and budget guards. |
| config | MAX_AGENTIC_ITERATIONS (25) | `crates/agiworkforce-agent-core/src/runaway.rs` | Default cap. |
| service | TurnParams effective_max | `apps/cli/src/agent/chat.rs` | Passes max_turns or the default (line 1447). |
| command | --max-turns, --max-budget-usd | `apps/cli/src/lib.rs` | CLI flags. |
| service | validated_max_turns | `apps/cli/src/app_server/developer_host.rs` | Validates the app-server maxTurns. |
| service | developer turn start | `apps/desktop/electron/runtime/developerSessionService.ts` | Forwards maxTurns (line 3294) and reports the capability (1359). |
| hook | useLocalSession | `apps/web/features/code/hooks/use-local-session.ts` | Passes maxTurns when set (line 420). |
| service | runCloudCodeAgentTurn | `apps/web/lib/services/cloud-code-agent-loop.ts` | Cloud loop with maxSteps and maxDurationMs. |
| config | CLOUD_CODE_TURN_BUDGET_MS | `apps/web/lib/deadline-policy.ts` | 13 minute Cloud turn budget. |
| endpoint | POST /api/code/sessions/{sessionId}/agent | `apps/web/app/api/code/sessions/[sessionId]/agent/route.ts` | Cloud agent turn endpoint. |
| endpoint | POST /api/code/sessions/{sessionId}/agent/cancel | `apps/web/app/api/code/sessions/[sessionId]/agent/cancel/route.ts` | Stop a Cloud turn. |
| service | remote code controller | `packages/platform/utils/src/remoteControl/codeRemoteController.ts` | Mobile remote view and dispatch task actions. |
| test | turn_loop tests | `crates/agiworkforce-agent-core/tests/turn_loop.rs` | Tests of effective_max and budget. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person starts a turn with an optional bound. | device | apps/cli/src/lib.rs:313-315; apps/web/features/code/hooks/use-local-session.ts:420 |
| The CLI engine counts iterations, runs tools and stops at the cap. | device | crates/agiworkforce-agent-core/src/engine.rs:90-135 |
| Each iteration calls the chosen model: a local model on the device, the person's own provider, or AGI Cloud. | outside service | crates/agiworkforce-agent-core/src/engine.rs host.on_event and continuation calls; provider depends on the session route (SYS-chat-turn-pipeline). For a local model the call stays on the device. |
| Cloud: the server loop runs steps in the managed sandbox until done, step cap or 13 minutes. | our servers | apps/web/lib/services/cloud-code-agent-loop.ts:387-396, 645 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Turn steps and usage | CLI session store on device; Cloud tables cloud_code_agent_turns and cloud_code_agent_steps | Cloud rows are server only | unknown |

**Models and providers.** The bound is independent of the model. The loop calls whichever model the session route selects (SYS-chat-turn-pipeline). Cost cap uses the cost ledger (engine.rs:76-90).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI: not required for the loop itself. Cloud: signed-in account. |
| Permissions | Tool approvals still apply per step. |
| Subscription | Cloud needs managed Code (cloud-code-session-open.ts:44-52 and entitlement at line 148). CLI local use: none found in the code. |
| Limits and metering | 25 steps default; Cloud step cap CLOUD_CODE_DEFAULT_TURN_STEPS (value not read); 13 minutes (deadline-policy.ts:42). |
| Feature flags | Managed Code switches for Cloud. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | The step cap and budget cap run on the device and need no subscription. Time bound: not available for Local. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cancel | Loop breaks at the top of the next iteration. | engine.rs:91-96 |
| No tool calls | Loop ends; turn is done. | engine.rs:98-100 |
| Repeated identical tool calls | Asks to continue; two strikes auto-stop across turns. | engine.rs:104-115; chat.rs:1437-1444 |
| Budget reached | BudgetExceeded event and stop. | engine.rs:79-86, 281-290 |
| Step cap reached (CLI) | Loop ends; what the person is told: unknown. | engine.rs:90 (no message found) |
| Cloud step cap or timeout | Stop reason max_steps or timeout returned. | cloud-code-agent-loop.ts:71-72, 645 |
| Awaiting approval (Cloud) | Turn pauses. | cloud-code-agent-loop.ts:71-72 |
| Offline | not handled in the code at the loop level. | searched crates/agiworkforce-agent-core/src/engine.rs and cloud-code-agent-loop.ts for offline handling; none |
| Mobile | Remote view of a desktop session; no bound control found, only stop and queue. | apps/mobile/src/features/companion/components/CodeSessionView.tsx:377-395 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `crates/agiworkforce-agent-core/tests/turn_loop.rs`: Turn loop with effective_max and optional budget.
- `apps/web/lib/services/__tests__/cloud-code-agent-loop.test.ts`: Cloud loop including the time-budget path.
- `apps/web/features/code/hooks/use-local-session.test.ts`: maxTurns is passed on a turn start (line 237-243).
- `apps/cli/src/agent/mod.rs`: In-file test that max_turns defaults to none (test_max_turns_default_none).

**Test scenarios**

- **CLI cap**
  1. Run the CLI with --max-turns 1 on a task needing several tool calls.
  - Expected: Loop ends after one iteration.
- **Invalid bound**
  1. Send turn/start with maxTurns 0 to the app server.
  - Expected: Invalid request 'maxTurns must be at least 1'.
- **Budget**
  1. Run with --max-budget-usd 0.01.
  - Expected: BudgetExceeded stops the turn.
- **Cloud timeout**
  1. Run a Cloud turn that exceeds 13 minutes.
  - Expected: stopReason timeout; session can continue.
- **Stop**
  1. Press Stop in a long turn.
  - Expected: Loop breaks before the next batch.

**Where to look when it fails**

- Engine events IterationStarted and BudgetExceeded.
- Cloud stop reasons in the agent route response.
- table:cloud_code_agent_turns.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/web/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **No goal-and-bound feature as written in the brief** Affects: All apps. Evidence: No goal command found; brief S67.36. Work needed: Define a goal object, the check for done, the bound options, and the UI.
- **No visible control for maxTurns in the local panel** Affects: Desktop, Web local. Evidence: maxTurns only in use-local-session.ts. Work needed: Add a control or remove the unused option.
- **No time bound outside Cloud** Affects: CLI, Desktop. Evidence: engine.rs has steps and dollars only. Work needed: Add a wall-clock bound.
- **No message that a cap ended the turn (CLI)** Affects: CLI, Desktop. Evidence: not found in engine.rs. Work needed: Emit a notice and offer continue.
- **Brief citations do not locate the feature** Affects: Documentation. Evidence: apps/cli/src/lib.rs:313 is the max-turns flag; apps/cli/src/agent/chat.rs:946 is in emit_turn_notice/compaction code. Work needed: Correct the brief.
- **Mobile 'done' is not backed by a control** Affects: Mobile. Evidence: CodeSessionView.tsx has stop/queue/steer only. Work needed: Verify or correct.
- Not built on: Mobile (from the capability ledger).

**Depends on**

- surface:cli
- surface:desktop
- surface:web
- surface:mobile
- mode:local
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- file:crates/agiworkforce-agent-core/src/engine.rs

## Unknown

- What the CLI or Desktop shows when the step cap ends a turn.
- The numeric value of CLOUD_CODE_DEFAULT_TURN_STEPS.
- Whether Mobile or any app has a goal field.
- Whether Desktop surfaces maxTurns in a UI outside the files searched.
- Metering of Cloud loop steps.
