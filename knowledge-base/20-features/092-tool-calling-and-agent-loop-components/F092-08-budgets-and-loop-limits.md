---
id: "F092-08"
type: "feature"
title: "Budgets and loop limits"
aliases: ["Budgets and loop limits", "Per-task budget manager", "cloud_agent_run_budgets", "run budget envelope", "S92.28", "tool_loop refusal", "run_cost_cap", "run_tool_call_cap", "run_time_cap"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.28"]
depends_on: ["surface:web", "mode:cloud", "table:cloud_agent_run_budgets", "table:cloud_agent_execution_operations", "table:cloud_agent_runs", "F092-07", "F092-10", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-08 Budgets and loop limits

A Cloud agent run gets a limit set: 20 dollars of model spend, 500 tool calls and 6 hours of wall clock. Before each durable model or tool call the server checks these, and stops the run when one is passed or when the same tool call would be made a fifth time in a row. The stopping cap is recorded.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.28](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9228).

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

**What it does.** Creates one budget row per Managed Cloud run and checks it before each durable operation. It refuses on time, tool-call count, repeated identical tool call, or spend, and writes the refusal code on the row. (apps/web/lib/services/cloud-agent-budget.ts:23-34, 234-287; apps/web/db/neon/0258_cloud_agent_run_budgets.sql:35-70)

**Why it exists.** The cloud runtime metered a run only after it settled, so a loop or runaway spend showed up only on the invoice. The CLI engine already had a spend cap and a loop stop. (apps/web/db/neon/0258_cloud_agent_run_budgets.sql:3-10)

**Who uses it.** Every person running a Cloud agent turn gets it automatically; engineers read the refusal code when a run stops. No setting for the person was found.

**Problems it solves**

- A run that loops on one tool is stopped on the fifth identical call (apps/web/lib/services/cloud-agent-budget.ts:19, 265-272).
- A run cannot spend without end: provider calls are refused once observed spend reaches the cap (cloud-agent-budget.ts:275-284).
- A run cannot go on for days: refused after 6 hours (cloud-agent-budget.ts:251-256).
- The reason survives the process: the first refusal code is stored (cloud-agent-budget.ts:161-175).

**Use cases**

- An agent keeps calling the same search with the same input; on the fifth try the run stops with a message.
- A research run reaches its spend cap and stops before the next model call.
- A run left waiting for hours is refused its next step after 6 hours of wall clock.
- Support reads refusal_code to explain why a run ended.

## 2. User experience

**Where to find it**

- No screen or control. The person sees only the stop message in the run's result. Where the message appears on each app: not verified.

**Before you start**

- A Cloud agent run on the durable workflow. Inline (request-scoped) fallback runs are not checked: the check lives in executeCloudAgentOperation, which is called only from workflow code (apps/web/lib/workflows/cloud-agent-operation-executor.ts:262; search of apps/web for callers found workflow files only).

**Screens and controls**

- None found. The cap values are not editable by the person.

**Journey**

1. 1. A run starts and works normally.
2. 2. Before each model call or tool call, the server claims the operation, then checks the budget (cloud-agent-operation-executor.ts:253-262).
3. 3. If a cap is passed, the operation is marked failed with the refusal, a warning is logged, and a fatal error ends the step (cloud-agent-operation-executor.ts:263-282).
4. 4. The workflow's failure step writes an error event, a failed task state and a stop event (apps/web/lib/workflows/steps/fail-cloud-agent-workflow.ts:55-75).
5. 5. The person sees a failed run with an error message.

**What the person sees and gets**

- Spend: 'This run reached its spend limit of <credits>, so AGI stopped before spending more.' (cloud-agent-budget.ts:281)
- Tool calls: 'This run reached its limit of 500 tool calls, so AGI stopped instead of running another one.' (cloud-agent-budget.ts:262)
- Time: 'This run reached its time limit of <minutes> minutes, so AGI stopped instead of starting another step.' (cloud-agent-budget.ts:254)
- Loop: 'AGI was about to make the same tool call for the 5th time in a row, so this run was stopped instead of looping.' (cloud-agent-budget.ts:270)
- Whether this exact text reaches the person: the failure step maps the error through a provider error classifier, so it is not established (fail-cloud-agent-workflow.ts:34-39).

**Settings**

- Defaults are constants: 20 dollars, 500 calls, 6 hours (cloud-agent-budget.ts:23-27). No setting or flag found. Loop threshold 5 mirrors the CLI engine, checked by a test (cloud-agent-budget.ts:14-19).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Budget row created on first use with the defaults, including for older runs (apps/web/lib/services/cloud-agent-budget.ts:121-147).
- Checks run in order: time, then for tool calls the count and repeat loop, then for model calls the spend (cloud-agent-budget.ts:251-284).
- Spend is measured from recorded provider usage for the run, priced by its provider and model (cloud-agent-budget.ts:177-195).
- The refusal is recorded once (first wins) and the operation is failed with it (cloud-agent-budget.ts:165-175; cloud-agent-operation-executor.ts:263-282).
- A replay of an already-claimed step returns its receipt and is not refused (cloud-agent-operation-executor.ts:259-262).
- Table checks keep the numbers valid and tie a budget to its owner (apps/web/db/neon/0258_cloud_agent_run_budgets.sql:35-70).

**Incomplete**

- The code does not reserve the spend up front. It reads spend so far and refuses only when the cap is already reached, so one provider call can overshoot (cloud-agent-budget.ts:275-284). The brief's wording 'reserved up front' is therefore not what the code does.
- The table allows subagent refusal codes (depth, fan-out, attempt) and has parent and depth columns, but the service accepts only four codes and has no subagent logic (apps/web/db/neon/0258_cloud_agent_run_budgets.sql:49-52 vs apps/web/lib/services/cloud-agent-budget.ts:29-34).
- No code outside the budget service reads refusal_code or the codes (search of apps/web app, lib, features found none), so the UI cannot show the cap by name.

**Present but disconnected or switched off**

- Scheduled unattended runs do not go through this check: scheduled-agent-executor.ts calls the tool loop directly and does not use executeCloudAgentOperation (apps/web/lib/services/scheduled-agent-executor.ts:595-640).
- Request-scoped fallback turns are not budgeted (see prerequisites).

**Not available**

- CLI: uses its own cost cap and loop stop (apps/cli/src/cost_ledger.rs; crates/agiworkforce-agent-core/src/runaway.rs:14), not this table.
- Desktop, Mobile, Chrome, VS Code: no budget logic of their own found; they follow the hosted run.

## 4. Required behaviour

**Established requirements**

- Defaults per run: spend 20 dollars (stored as micro-dollars), 500 tool calls, 6 hours wall clock. (source: brief S92.28 (apps/web/lib/services/cloud-agent-budget.ts:23-27))
- The same call made 5 times in a row stops the run. (source: brief S92.28 (cloud-agent-budget.ts:19))
- The spend check happens before each provider operation. (source: brief S92.28 (cloud-agent-budget.ts:275))
- Each refusal is recorded with its code. (source: brief S92.28 (cloud-agent-budget.ts:165))
- A refused operation returns a stop message and the run ends. (source: brief S92.28 (cloud-agent-operation-executor.ts:282))
- The brief's Should line says each run has a budget reserved up front and enforced before every operation; the code enforces but does not reserve. (source: brief S92.28 vs apps/web/lib/services/cloud-agent-budget.ts:275-284)

**Acceptance criteria**

1. A new run gets a budget row with 20,000,000 micro-dollars, 500 tool calls and 21,600,000 ms.
2. The fifth identical tool call in a row (same fingerprint) is refused with code tool_loop; a different call at the same count is allowed.
3. The 501st tool call is refused with code run_tool_call_cap.
4. A provider call after observed spend reaches the cap is refused with code run_cost_cap.
5. Any operation after 6 hours is refused with code run_time_cap.
6. Only the first refusal code is kept on the row.
7. A refused operation shows as failed in cloud_agent_execution_operations and the run ends in failed state.
8. A replayed completed operation is returned and not refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The person should be told which cap stopped the run, in words, on every app [inferred from the message texts written for it].
- Scheduled and inline runs should have the same caps [inferred from the stated purpose: one envelope for the runtime].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Put the refusal code on the error event so each app can show a clear title and a link to what to do next.
- [proposed] Apply the check to inline fallback and scheduled runs.
- [proposed] Reserve an estimate before a provider call, or document that overshoot by one call is accepted.
- [proposed] Let a plan or the person set the cap.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | authorizeCloudAgentOperation | `apps/web/lib/services/cloud-agent-budget.ts` | Checks time, tool count, repeat loop and spend; returns allowed or refusal (line 234). |
| config | CLOUD_AGENT_RUN_BUDGET_DEFAULTS | `apps/web/lib/services/cloud-agent-budget.ts` | 20 dollars in micro-dollars, 500 tool calls, 6 hours (lines 23-27). |
| config | CLOUD_AGENT_LOOP_REPEAT_THRESHOLD | `apps/web/lib/services/cloud-agent-budget.ts` | Value 5, mirrors the CLI engine (line 19). |
| service | ensureCloudAgentRunBudget | `apps/web/lib/services/cloud-agent-budget.ts` | Creates or reads the run's budget row (line 121). |
| service | recordCloudAgentBudgetRefusal | `apps/web/lib/services/cloud-agent-budget.ts` | Stores the first refusal code and time (line 165). |
| service | spentMicrousd / operationCounters | `apps/web/lib/services/cloud-agent-budget.ts` | Reads spend and tool-call counters (lines 177-227). |
| table | cloud_agent_run_budgets | `apps/web/db/neon/0258_cloud_agent_run_budgets.sql` | Per-run caps, subagent tree columns, refusal code; row level security. |
| table | cloud_agent_execution_operations | `apps/web/db/neon/0063_cloud_agent_execution_operations.sql` | Source of tool-call count and input hashes for loop detection. |
| service | executeCloudAgentOperation | `apps/web/lib/workflows/cloud-agent-operation-executor.ts` | Calls the authorization for each newly acquired operation (lines 262-282). |
| service | getCloudAgentRunUsage | `apps/web/lib/services/cloud-agent-execution-service.ts` | Observed provider usage of the run (line 721). |
| service | calculateObservedProviderUsageCostDollars | `apps/web/lib/services/managed-usage-accounting-service.ts` | Prices observed usage for the spend check. |
| service | failCloudAgentWorkflow | `apps/web/lib/workflows/steps/fail-cloud-agent-workflow.ts` | Ends the run with an error event after the refusal. |
| other | runaway.rs loop constant | `crates/agiworkforce-agent-core/src/runaway.rs` | CLI engine loop threshold 5 that the web value must match (line 14). |
| other | CLI cost ledger | `apps/cli/src/cost_ledger.rs` | CLI session spend cap, separate from this feature. |
| test | cloud-agent-budget.test.ts | `apps/web/lib/services/cloud-agent-budget.test.ts` | Unit tests for each cap and the CLI match. |
| test | cloud-agent-workflow.budget.test.ts | `apps/web/lib/workflows/cloud-agent-workflow.budget.test.ts` | Executor-level tests of refusals. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The workflow wraps a model or tool call in executeCloudAgentOperation and claims the operation | our servers | apps/web/lib/workflows/cloud-agent-operation-executor.ts:238-260 |
| For a newly acquired operation, the budget row is read or created and checked | our servers | apps/web/lib/workflows/cloud-agent-operation-executor.ts:262; apps/web/lib/services/cloud-agent-budget.ts:245-248 |
| Tool-call count and last four input hashes are read from the operations table (current operation excluded) | our servers | apps/web/lib/services/cloud-agent-budget.ts:204-227 |
| For model calls, run usage is read and priced for the run's provider and model | our servers | apps/web/lib/services/cloud-agent-budget.ts:177-195, 277-279 |
| On refusal: refusal code written, operation failed, warning logged, fatal error thrown | our servers | apps/web/lib/services/cloud-agent-budget.ts:289-297; cloud-agent-operation-executor.ts:263-282 |
| Workflow failure step writes error, failed state and stop events | our servers | apps/web/lib/workflows/steps/fail-cloud-agent-workflow.ts:55-75 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Budget row (caps, start time, refusal code and time) | table cloud_agent_run_budgets | Server only | Deleted with the run (cascade) (apps/web/db/neon/0258_cloud_agent_run_budgets.sql:53-56) |
| Failed operation receipt with refusal error | cloud_agent_execution_operations.error | Server only | Cascade from the run |

**Models and providers.** The spend check prices usage using the run's own provider and model fields, so it follows whichever model served the run (apps/web/lib/services/cloud-agent-budget.ts:181-194). If the model is rotated by failover mid-run, the pricing basis is the run row's recorded provider and model: effect not verified.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; budgets are tied to the run's user by foreign keys (apps/web/db/neon/0258_cloud_agent_run_budgets.sql:53-58). |
| Permissions | Row level security: a user sees only their own budgets (0258:90-97). |
| Subscription | The same caps apply to every plan; no plan-specific value found (apps/web/lib/services/cloud-agent-budget.ts:23-27). |
| Limits and metering | 20 dollars, 500 tool calls, 6 hours, 5 repeats. Spend measured from observed provider usage, shown in credits in the message (cloud-agent-budget.ts:103-105). This cap is separate from plan quotas. |
| Feature flags | None found. |
| Model compatibility | Applies to any model on a durable run; pricing needs the run's provider and model to be priceable: not verified. |
| Provider restrictions | None found. |
| Local mode | Not applicable: the feature belongs to the hosted run. The CLI and Local use their own cost ledger (apps/cli/src/cost_ledger.rs). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| New run | Defaults row created lazily on first operation | apps/web/lib/services/cloud-agent-budget.ts:121-147 |
| Race on creation | On conflict the existing row is read | cloud-agent-budget.ts:128-146 |
| Run older than the table | Gets the default budget on its next operation | cloud-agent-budget.ts:116-120 |
| Two caps hit | First refusal code is kept | cloud-agent-budget.ts:161-175 |
| Replay of a claimed operation | Not refused; returns the receipt | cloud-agent-operation-executor.ts:259-262 |
| Spend overshoot | One call can pass the cap before the next check stops it | cloud-agent-budget.ts:275-284 |
| Retry | A refusal is a fatal error, so the workflow does not retry it | cloud-agent-operation-executor.ts:282 |
| Offline, accessibility, per-app display | not handled in the code read; display of the stop message per app unknown | search for the codes outside the service found nothing |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/cloud-agent-budget.test.ts`: Default envelope creation, in-envelope allow, loop refusal at the threshold, differing call allowed, tool-call cap, spend cap, wall-clock cap, match with the CLI loop constant.
- `apps/web/lib/workflows/cloud-agent-workflow.budget.test.ts`: Executor refuses a provider call after spend and records code run_cost_cap; refuses the repeated tool call with a fatal error; lets differing calls through.

**Test scenarios**

- **Repeat loop**
  1. Run an agent task whose tool returns nothing useful and the model repeats the same call
  2. Watch the run
  - Expected: On the fifth identical call the run stops; refusal_code is tool_loop.
- **Tool-call cap**
  1. Set max_tool_calls to a small number on a test run row
  2. Run a task needing more calls
  - Expected: Run stops with run_tool_call_cap and the message about its limit.
- **Spend cap**
  1. Set max_cost_microusd low on a test run
  2. Run a long task
  - Expected: Next model call is refused with run_cost_cap.
- **Time cap**
  1. Set started_at back by more than the limit
  2. Trigger a step
  - Expected: Refused with run_time_cap.
- **What the person sees**
  1. Trigger any refusal on web and read the on-screen message
  - Expected: Record whether the exact sentence shows or a generic failure text; today this is unknown.
- **Fallback path**
  1. Set AGI_DURABLE_INITIAL_TURNS=off
  2. Run the repeat-loop task
  - Expected: Record whether the cap applies; code suggests it does not.

**Where to look when it fails**

- Log '[cloud-agent] run budget refused an operation' with code (apps/web/lib/workflows/cloud-agent-operation-executor.ts:278).
- Table cloud_agent_run_budgets: refusal_code, refused_at.
- Error name CloudAgentBudgetRefusal on cloud_agent_execution_operations.error.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No up-front reservation; check happens only before each model call against spend so far.** Affects: Cloud runs on web and other apps. Evidence: apps/web/lib/services/cloud-agent-budget.ts:275-284. Work needed: Decide: reserve an estimate, or accept and document overshoot; fix the brief.
- **Inline fallback and scheduled runs are not under the budget.** Affects: Web turns that fall back; scheduled runs. Evidence: apps/web/lib/services/scheduled-agent-executor.ts:595-640; callers of executeCloudAgentOperation are workflow files only. Work needed: Call the authorization in those paths or document why not.
- **The refusal code is not carried to the UI and the message path through the failure classifier is unverified.** Affects: Every app showing a Cloud run. Evidence: apps/web/lib/workflows/steps/fail-cloud-agent-workflow.ts:34-39; no consumer of the codes outside the service. Work needed: Pass the code and message in the error event; test on each app.
- **Table supports subagent caps that no code applies.** Affects: Future subagents. Evidence: apps/web/db/neon/0258_cloud_agent_run_budgets.sql:49-52. Work needed: Either build the subagent coordinator or remove unused columns.
- **Caps are fixed constants; no per-plan or per-person value.** Affects: All plans. Evidence: apps/web/lib/services/cloud-agent-budget.ts:23-27. Work needed: Product decision.

**Depends on**

- surface:web
- mode:cloud
- table:cloud_agent_run_budgets
- table:cloud_agent_execution_operations
- table:cloud_agent_runs
- F092-07
- F092-10
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-data-model-and-migrations

## Unknown

- Whether the exact refusal sentence reaches the person on each app.
- Whether inline fallback runs are capped anywhere else.
- How the spend check prices a run whose serving model changed by failover.
- Whether the product intends the same caps for every plan.
- Whether the 'reserved up front' wording in the brief is a requirement to build or a wording error.
