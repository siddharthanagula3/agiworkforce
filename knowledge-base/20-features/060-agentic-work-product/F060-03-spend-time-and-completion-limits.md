---
id: "F060-03"
type: "feature"
title: "Spend, time and completion limits"
aliases: ["Spend, time and completion limits", "/budget", "--max-budget-usd", "Spend cap", "Time budget", "Completion condition", "Step limit"]
area: "60 Agentic work product"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S60.10", "S60.11", "S60.12"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-observability-and-operations", "SYS-execution-boundaries", "F060-01", "F060-04", "surface:cli", "mode:cloud", "mode:local", "file:crates/agiworkforce-agent-core/src/engine.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-03 Spend, time and completion limits

No person-facing spend cap, time limit or completion condition exists for AGI Work on any app. Only the CLI local agent has a per-turn spend cap (/budget and --max-budget-usd). The Cloud run is bounded by fixed system limits (100 steps, 120 tool calls, a 4-minute invocation clock with automatic continuation) that the person cannot set.

Area: [60. Agentic work product](README.md). Requirement items: [S60.10](../../10-requirements/capabilities/060-agentic-work-product.md#s6010), [S60.11](../../10-requirements/capabilities/060-agentic-work-product.md#s6011), [S60.12](../../10-requirements/capabilities/060-agentic-work-product.md#s6012).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Intended: let the person cap what a task may spend and how long it may run, and name when it counts as finished. Today: the CLI stops a turn at a credit cap; the Cloud run stops at built-in limits.

**Why it exists.** Agent runs can loop and spend credits. A cap, a clock and a definition of done keep cost and quality predictable. (doc: docs/product/requirements.md:768-780 requires approval for cloud spend or usage-credit actions.)

**Who uses it.** CLI users for the cap; every Work user is protected by the system limits without choosing them.

**Problems it solves**

- Runaway cost on a long agent turn (CLI).
- A run that never stops: system step, tool and time limits end or checkpoint it.

**Use cases**

- In the CLI type /budget 20 to stop each turn at 20 credits.
- Run the CLI one-shot with --max-budget-usd 1.5 so the run stops with a budget_exhausted status.
- A Cloud Work run that reaches 100 steps stops with a clear error.

## 2. User experience

**Where to find it**

- CLI: slash command /budget <credits>, /budget off, /budget alone (apps/cli/src/claude_parity.rs:1429-1456) and flag --max-budget-usd (apps/cli/src/lib.rs:489-491).
- Web, desktop, mobile, VS Code, Chrome: no control for spend cap, time budget or completion condition was found in the Work composer, the New task sheet, the Tasks page or the extension code read.

**Before you start**

- CLI: a running CLI session.

**Screens and controls**

- CLI /budget text messages: 'Each turn stops once it has spent N credits. /budget off removes the cap.', 'No spend cap for this session. /budget <credits> sets one per turn.', 'Spend cap removed.', 'Usage: /budget <credits> | /budget off'.

**Journey**

1. CLI: type /budget 20. The session stores the cap in dollars (credits times the credit rate).
2. Run a turn. After each model response the engine compares the cumulative cost to the cap and stops the loop when it is reached (crates/agiworkforce-agent-core/src/engine.rs:79-90, 281-291).
3. Cloud Work: nothing to set; the run ends or checkpoints at system limits.

**What the person sees and gets**

- CLI: a BudgetExceeded turn event; one-shot JSON mode reports status reason budget_exhausted (flag help text, lib.rs:489-490).
- Cloud: error 'Agent stopped after reaching the 100-step execution limit.' code max_agent_steps_reached (tool-loop.ts:7963-7973); error code agent_time_budget_reached when an invocation clock ends without a continuation hook (tool-loop.ts:6760-6772); row 'Stopped after N tool calls' at the tool cap (tool-turn-governor.ts:78-88).

**Settings**

- CLI --max-budget-usd, /budget, --max-turns and effort presets (low: at most 3 turns; high: 50; max: 100, lib.rs:508-520).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI /budget and --max-budget-usd set session.max_budget_usd (claude_parity.rs:1429-1456; lib.rs:6323). The shared engine checks the cap after the first response and after every continuation and stops (engine.rs:79-90, 281-291). Engine test file exists: crates/agiworkforce-agent-core/tests/turn_loop.rs.
- Cloud system limits: 100 steps (packages/contracts/cloud-contracts/src/tool-call-limits.ts:4), 120 tool calls per Work turn (apps/web/app/api/llm/v1/chat/completions/lib/tool-turn-governor.ts:17), 10 web searches and 15 URL fetches per Work turn (web-search-tool.ts:57; url-fetch-tool.ts:31), and a per-invocation clock of 240 seconds (apps/web/lib/deadline-policy.ts:1-6).
- At the per-invocation clock a durable run writes a checkpoint and the workflow continues with a fresh clock (tool-loop.ts:6739-6760; apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts:730). A pause request also checkpoints at a step boundary (tool-loop.ts:6702-6733).
- Workspace spend limit: a request or resume is refused with 402 insufficient_quota when the funding organisation's budget is spent (apps/web/lib/managed-compute-gate.ts:511-542; used in approve/route.ts:195).

**Incomplete**

- The CLI help text says the flag stops the session at total spend, but the engine compares the turn cost, and /budget says per turn (flag text lib.rs:489-490 versus engine.rs:79-90, claude_parity.rs:1435). [inferred mismatch]
- The CLI cap applies to the local agent loop. Whether it applies to Cloud Code sessions started with `agi code start`: unknown.
- Total run duration across invocations has no cap found; the workflow invocation limit constant is 800,000 ms (deadline-policy.ts) but total cap: unknown.

**Present but disconnected or switched off**

- tool-loop.ts has a step-budget checkpoint that pauses a run at its step limit and resumes only when a decision raises the limit (tool-loop.ts:696-717, 7910-7960), but no caller passes onStepBudgetCheckpoint (search finds it only in tool-loop.ts), so the run ends with max_agent_steps_reached instead.

**Not available**

- User-set spend cap on web, desktop, mobile, VS Code and Chrome for Work runs.
- User-set time budget on every app.
- Completion condition on every app. At end of turn the plan marks every non-terminal step completed regardless of what was achieved (tool-loop.ts:5217-5227). [inferred risk]

## 4. Required behaviour

**Established requirements**

- The user can cap how much a task may spend, and the run stops at the cap. Brief: CLI done only. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.10)
- The user can set how long a task may run, and the run stops when time is up. Brief: missing everywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.11)
- The user can state an explicit completion condition that the agent checks before it finishes. Brief: missing everywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.12)
- Rate limits are configuration, not constants; scale uses bounded resources and graceful degradation. (source: doc: AGENTS.md section 8)
- Cloud spend or usage-credit actions need approval prompts. (source: doc: docs/product/requirements.md:768-780)

**Acceptance criteria**

1. CLI: /budget 5 makes the session report a 5-credit cap, and a turn that passes the cap stops with a BudgetExceeded event and runs no further tools.
2. CLI: /budget off removes the cap and prints 'Spend cap removed.'; /budget abc prints the usage line.
3. Cloud: a Work run that reaches the step limit ends with code max_agent_steps_reached and its plan steps do not all show Done. [inferred expected]
4. Cloud: a run that hits the invocation clock continues in a new invocation without losing messages.
5. A person-set cap, time limit and completion condition exist on Cloud Work before this feature can be called done (currently none).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's CLI 'done' covers only the local agent per-turn cap, not a per-task cap on a Cloud run. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Spend limit' and 'Stop after' field to the Work scope fields and send them with the goal; enforce them in the tool loop beside the existing step and time checks.
- [proposed] Add a 'Done when' field; have the agent check it and report unmet conditions instead of marking all steps Done.
- [proposed] Wire onStepBudgetCheckpoint so a step-limit stop becomes a resumable pause.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | handle_budget | `apps/cli/src/claude_parity.rs` | /budget command (lines 1429-1456). |
| config | --max-budget-usd | `apps/cli/src/lib.rs` | One-shot flag stored in session.max_budget_usd (lines 489-491, 6323, 9194). |
| service | Turn loop budget guard | `crates/agiworkforce-agent-core/src/engine.rs` | Stops tool dispatch when cumulative cost reaches the cap (lines 79-90, 281-291). |
| test | turn_loop tests | `crates/agiworkforce-agent-core/tests/turn_loop.rs` | Engine test that builds TurnParams with max_budget_usd (line 329); assertions not read. |
| config | Tool call limits | `packages/contracts/cloud-contracts/src/tool-call-limits.ts` | DEFAULT_CHAT_TOOL_MAX_STEPS 10 and DEFAULT_WORK_TOOL_MAX_STEPS 100 (lines 3-4). |
| config | Tool turn governor caps | `apps/web/app/api/llm/v1/chat/completions/lib/tool-turn-governor.ts` | AGI_WORK_TURN_TOOL_CALL_CAP 120 and the stop messages (lines 16-17, 70-88). |
| config | Deadline policy | `apps/web/lib/deadline-policy.ts` | Function limit 300 s, teardown reserve 60 s, tool loop budget 240 s, tool call deadline 120 s (lines 1-10). |
| service | resolveToolLoopPolicy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Chooses max steps and max duration per turn (lines 891-907). |
| service | Invocation and pause checkpoints | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Time budget check, invocation checkpoint, pause checkpoint (lines 6702-6772). |
| service | Step budget checkpoint (unwired) | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Pause at step limit awaiting a raised budget (lines 696-717, 7910-7960). |
| service | execute-cloud-agent-invocation | `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts` | Passes onInvocationCheckpoint and onPauseCheckpoint to the loop (lines 730-741). |
| config | Web search and fetch caps per Work turn | `apps/web/lib/web-search/web-search-tool.ts` | WEB_SEARCH_MAX_CALLS_PER_AGI_WORK_TURN 10 (line 57); fetch cap 15 in apps/web/lib/url-fetch/url-fetch-tool.ts:31. |
| service | buildSpendLimitGateResponse | `apps/web/lib/managed-compute-gate.ts` | Workspace budget gate returning 402 (lines 511-542). |
| service | Usage lease | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | 86,400 second usage lease for Work turns (lines 1526-1536). |
| component | WorkUsageCard | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Shows the usage-limit state in Work mode (lines 5080-5110). |
| service | flushTerminal plan completion | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Marks plan steps complete at the end of the turn (lines 5210-5227). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: the person sets a cap; the agent loop computes cumulative cost from token usage after each completion and stops tool dispatch at the cap. | device | claude_parity.rs:1429-1456; engine.rs:79-90, 281-291 |
| Cloud: the tool loop counts steps, tool calls and elapsed time; at the invocation clock it writes a checkpoint and the workflow continues; at 100 steps it ends the run with an error. | our servers | tool-loop.ts:891-907, 6739-6772, 7963-7973 |
| Before a resume or approval the server checks the workspace budget and may answer 402. | our servers | approve/route.ts:195; managed-compute-gate.ts:511-542 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| CLI spend cap | In memory of the CLI session (session.max_budget_usd) | No | Lost when the session ends unless set again; persistence: unknown |
| Run checkpoints at invocation or pause | Cloud run checkpoints via the workflow (execute-cloud-agent-invocation.ts:730-741) | Yes, server side | Not traced |

**Models and providers.** Cost is computed from token usage and the model's price table (CLI cost_ledger; server getRoutePricing import in tool-loop.ts). A pricier model reaches a cap sooner. No model identifiers are written here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI cap: works signed out or in. Cloud limits: signed-in Work account. |
| Permissions | None found in the code for setting the CLI cap. |
| Subscription | Cloud limits are the same for every plan in the constants read (100, 120). Per-plan differences: none found in the code. Usage windows (five-hour, weekly, monthly credits) limit total spend per plan (apps/cli/src/plans.rs:1-40 reads the managed usage limits contract). |
| Limits and metering | Managed credits; Work turn lease 86,400 s; workspace budget gate; system step, tool and time limits as listed. |
| Feature flags | None found for the cap. Kill switch canUseAgiWork gates Work entirely. |
| Model compatibility | Cap works with any model that reports usage; models without price data: unknown. |
| Provider restrictions | None found in the code. |
| Local mode | The CLI cap applies to local-model turns only if cost is non-zero; cost for local inference: unknown. Cloud limits do not apply to Local mode because Work does not run there. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Cap reached on the first response | Pending tool calls are cleared before any tool side effect or further provider request. | engine.rs:73-90 |
| Invalid /budget value | Prints 'Usage: /budget <credits> / /budget off'; zero, negative or non-finite are refused. | claude_parity.rs:1445-1455 |
| Invocation clock reached | Durable runs checkpoint and continue; without a hook the run ends with agent_time_budget_reached (retryable). | tool-loop.ts:6739-6772 |
| Step limit reached | Run ends with max_agent_steps_reached, not retryable, stopped short as partial. | tool-loop.ts:7963-7973 |
| Tool cap reached | No more tools; the model is told to answer from what it has. | tool-turn-governor.ts:78-88 |
| Workspace budget spent | 402 insufficient_quota before any credit is reserved. | approve/route.ts:193-196; managed-compute-gate.ts:525-541 |
| Spend gate read fails | Spend gate failure is treated as ungoverned (request allowed), logged. | managed-compute-gate.ts:520-523 |
| Offline, retry, accessibility for the CLI cap | Not handled in the code read. | not handled in the code read (handle_budget in claude_parity.rs:1429-1456 has no offline or retry branch) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/__tests__/deadline-policy.test.ts`: Deadline constants (contents not opened).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.deadline.test.ts`: Tool loop deadline behaviour (contents not opened).
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-turn-governor.capability.test.ts`: Governor capability (contents not opened).
- `crates/agiworkforce-agent-core/tests/turn_loop.rs`: Engine turn loop including TurnParams with a budget argument (line 329).
- `apps/cli/src/lib.rs`: Inline tests max_budget_usd_flag_parses (lines 10791-10794) and a flag parse assertion at 10925.

**Test scenarios**

- **CLI per-turn cap**
  1. Open the CLI TUI.
  2. Type /budget 1.
  3. Ask for a long multi-tool task.
  - Expected: The turn stops once about 1 credit is spent and reports the budget event; /budget shows the cap.
- **One-shot budget flag**
  1. Run the CLI one-shot with --max-budget-usd 0.01 and JSON events.
  - Expected: A status update with reason budget_exhausted.
- **Cloud step limit**
  1. Start a Work run with a goal that needs many steps (staging account).
  2. Let it run to the limit.
  - Expected: Error max_agent_steps_reached; check whether plan steps still show Done (suspected wrong).
- **Absence check**
  1. Open the Work composer, New task sheet, Tasks page and extension panels.
  2. Look for spend, time or completion fields.
  - Expected: None present.

**Where to look when it fails**

- Log '[tool-loop] max steps reached without terminal stop' and '[tool-loop] invocation time budget reached without terminal stop' (tool-loop.ts:6740-6742, 7966).
- Error codes max_agent_steps_reached, agent_time_budget_reached, insufficient_quota.
- Log '[spend-limit] request refused by workspace budget' (managed-compute-gate.ts:527-530).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **No person-set spend cap, time budget or completion condition for Cloud Work.** Affects: Web, desktop, mobile, Chrome Work users. Evidence: Search of the composer, sheet, Tasks page and request schema finds no such field (request-processor.ts:795-801). Work needed: Design fields, contract change, enforcement in tool-loop, UI on all surfaces.
- **CLI cap is per turn on the local agent, while the brief wants a per-task cap on any task; flag help says session.** Affects: CLI users. Evidence: engine.rs:79-90; lib.rs:489-490; claude_parity.rs:1435. Work needed: Align text and behaviour; decide scope.
- **Step-limit pause is built but not connected.** Affects: Cloud Work users hitting 100 steps. Evidence: onStepBudgetCheckpoint only in tool-loop.ts:846,7910,7947. Work needed: Provide the hook and a UI decision that raises maxSteps.
- **Plan steps are marked completed at the end of a turn regardless of outcome.** Affects: All Work surfaces. Evidence: tool-loop.ts:5217-5227. Work needed: Tie completion to a checked condition.
- **VS Code is listed as missing in the brief and the code agrees; CLI status in the brief is correct only for the local agent.** Affects: Reporting. Evidence: No budget fields found in apps/extension-vscode/src. Work needed: Keep the brief precise.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-observability-and-operations
- SYS-execution-boundaries
- F060-01
- F060-04
- surface:cli
- mode:cloud
- mode:local
- file:crates/agiworkforce-agent-core/src/engine.rs

## Unknown

- Whether the CLI cap is persisted between sessions.
- Whether the cap applies to Cloud Code sessions from `agi code start`.
- Total cap on a durable run across invocations.
- Cost accounting for local models in the CLI.
- Whether any per-plan difference exists for step limits.
