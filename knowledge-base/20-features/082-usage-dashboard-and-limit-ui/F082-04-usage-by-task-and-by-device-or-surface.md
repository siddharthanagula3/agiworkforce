---
id: "F082-04"
type: "feature"
title: "Usage by task and by device or surface"
aliases: ["Usage by task", "Per-task cost", "Cost and usage (task panel)", "Billed this session", "Billed turn", "Usage by device or surface", "S82.20", "S82.21", "S82.23 (related)"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S82.20", "S82.21"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "api:GET /api/usage/turns/{requestId}", "table:cloud_agent_runs", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "F082-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-04 Usage by task and by device or surface

Shows what each agent run or work task cost once it settles: credits, tokens and model calls, on web, desktop and mobile. The CLI and VS Code show billed credits per turn or session instead. Usage by device or surface is not built on any app or in the API.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.20](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8220), [S82.21](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8221).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores settled usage on each cloud agent run and shows it in the Tasks list and task detail (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:336-385), and in the mobile run sheet (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:376-392).

**Why it exists.** Long agent runs can use many credits. A person needs to see what one run cost. The brief requires usage per task and, where useful, by device or surface (doc: knowledge-base/data/area-briefs/082-usage-dashboard-and-limit-ui.md, S82.20 and S82.21).

**Who uses it.** People who run Work, Research or code tasks in the cloud and want to judge each task's cost.

**Problems it solves**

- No link between a task and its credits.
- A cost shown as zero while the task is still running. The panel says costs settle later (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:378-380).
- Charging language for a free-trial run. The panel says it was metered against the free trial allowance (same file:350-353).

**Use cases**

- Web: open Tasks, pick a task, read 'Cost and usage'.
- Mobile: open a cloud run and read 'Cost' and 'Usage' rows.
- CLI: after a turn, read '<credits> billed' (apps/cli/src/usage_summary.rs:428-441).
- VS Code: open the account menu and read 'Billed this session' (apps/extension-vscode/src/core/commandSetup.ts:2287).

## 2. User experience

**Where to find it**

- Web and hosted Desktop: Tasks page list rows show cost after the model and time; the detail panel has the section 'Cost and usage' (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:752-758; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:336-385, 728).
- Mobile: cloud run detail sheet, rows 'Cost' and 'Usage' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:376-392).
- CLI: line after a turn and in the report (apps/cli/src/output.rs:834-838; apps/cli/src/tui/tui_app.rs:8696-8699).
- VS Code: account quick pick rows 'Rough session estimate' and 'Billed this session' (apps/extension-vscode/src/core/commandSetup.ts:2283-2288).
- Chrome: not found.

**Before you start**

- A cloud agent run that has settled at least one billed step.
- CLI and VS Code: Cloud mode with a stored AGI credential (apps/cli/src/usage_summary.rs:343-357).

**Screens and controls**

- Web Tasks list row cost text, with test id task-cost-<id>, shown only when a cost exists (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:752-758).
- Task detail section with credits, tokens in and out, reasoning tokens, model calls (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:348-372).

**Journey**

1. Start a task and let it run.
2. Open Tasks and select the task.
3. Read 'Cost and usage'. While running it says what has settled so far.
4. After it finishes, read the final credits and tokens.
5. On a free trial run, read the free trial message instead of credits.

**What the person sees and gets**

- Cost as formatted credits (formatTaskCost) in large text.
- '<n> in · <n> out · <n> reasoning · <n> model calls'.
- 'This is what has settled so far. The total grows while the task keeps working.' for live tasks.
- 'Cost and token usage are recorded when this task settles.' or 'No settled cost was recorded for this task.' when none.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- recordCloudAgentRunSettledUsage writes one usage entry per billing key into cloud_agent_runs.settled_usage, with provider calls, tokens and cost in cents (apps/web/lib/services/cloud-agent-run-service.ts:605-614, 1137-1170).
- mapSettledUsage sums the entries and returns a null cost when no entry was charged (apps/web/lib/services/cloud-agent-run-service.ts:616-640).
- The writer is called from the managed agent stream and workflow settlement (apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts; apps/web/lib/workflows/steps/settle-workflow-invocation.ts).
- Shared task UI shows cost in the list and detail (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:752-758; TaskDetailPanel.tsx:336-385). The same package is used by web and desktop (doc: AGENTS.md section 5).
- Mobile shows Cost and Usage rows (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:376-392).
- CLI polls /api/usage/turns/<id> up to four times and prints billed credits or 'not settled yet' (apps/cli/src/usage_summary.rs:376-441).
- VS Code settles queued billing and shows billed credits for the session (apps/extension-vscode/src/core/commandSetup.ts:2205-2210, 2287).

**Incomplete**

- The mobile row shows tokens as a plain sum with no credits-per-call breakdown (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:391).
- CLI and VS Code show per-turn or per-session cost, not per task (apps/cli/src/usage_summary.rs:401-441; apps/extension-vscode/src/core/commandSetup.ts:2287).
- The brief cites TasksPage.tsx:591 and CloudRunDetailSheet.tsx:179-185 for cost. Those lines are other code. The cost lines are the ones listed above.

**Present but disconnected or switched off**

- none found.

**Not available**

- Usage by device or surface: no grouping by device or surface exists in the history service (apps/web/lib/services/account-usage-history-service.ts:104-250) or the history type. The brief records it missing on web, desktop, mobile and API (doc: knowledge-base/data/area-briefs/082-usage-dashboard-and-limit-ui.md, S82.21).
- Chrome shows no per-task cost (no file found).

## 4. Required behaviour

**Established requirements**

- Users can see usage per task (agent run or work session). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S82.20)
- Where useful, users can see usage broken down by device or surface. Status is missing everywhere. (source: S82.21 (same brief))
- After a task finishes, the user sees what it actually cost. (source: S82.23 (same brief))
- A live run shows pending cost, not a false zero. A free-trial run shows no invented charge. (source: packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.cost.test.tsx:77-88)

**Acceptance criteria**

1. A settled run shows credits in the Tasks list and the detail panel.
2. A running task says cost is recorded when it settles, or shows the settled-so-far figure with the growing-total note.
3. A free-trial run shows the free trial message and no price.
4. Mobile run sheet shows Cost and Usage rows for a run with usage and none for a run without.
5. CLI prints '<n> credits billed' after a settled turn and a 'not settled yet' note otherwise.
6. No app presents a per-device or per-surface table.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Cost in cents on the run is rounded from the ledger, so it may differ slightly from the history total [inferred from costCents integer in apps/web/lib/services/cloud-agent-run-service.ts:605-612].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record the surface (web, desktop, mobile, CLI, IDE, extension) in the usage attribution json and add a 'By app' breakdown to the history API.
- [proposed] Add a per-task total to CLI and VS Code run lists.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | cloud_agent_runs.settled_usage | `apps/web/lib/services/cloud-agent-run-service.ts` | Json map of billing key to settled usage entry (lines 1163-1169). |
| service | recordCloudAgentRunSettledUsage | `apps/web/lib/services/cloud-agent-run-service.ts` | Writes one entry per billing idempotency key. |
| service | mapSettledUsage | `apps/web/lib/services/cloud-agent-run-service.ts` | Sums entries into run.usage. |
| service | managed-agent-stream | `apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts` | Caller that records settled usage. |
| service | settle-workflow-invocation | `apps/web/lib/workflows/steps/settle-workflow-invocation.ts` | Caller for workflow runs. |
| component | TasksPage | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | List row cost text. |
| component | TaskCostSection | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Detail 'Cost and usage' block. |
| component | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Mobile Cost and Usage rows. |
| service | mobile tasks service | `apps/mobile/src/features/tasks/service.ts` | Fetches cloud runs for the sheet. |
| endpoint | GET /api/usage/turns/{requestId} | `apps/web/app/api/usage/turns/[requestId]/route.ts` | Per-turn settled cost (service readManagedUsageTurnCost at account-usage-history-service.ts:331-349). |
| service | fetch_turn_settlement, billed_turn | `apps/cli/src/usage_summary.rs` | CLI per-turn billed credits. |
| other | output billed line | `apps/cli/src/output.rs` | Prints the billed line after a turn (line 834). |
| other | tokenCounter and settleQueuedBilling | `apps/extension-vscode/src/data/tokenCounter.ts` | VS Code session counters and billed credits. |
| service | VS Code turn cost read | `apps/extension-vscode/src/utils/api.ts` | Reads /api/usage/turns/<id> (line 1193). |
| test | TasksPage.cost.test | `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.cost.test.tsx` | Cost shown in list and detail. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A managed agent run makes billed provider calls. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts |
| When a step settles, the server writes a usage entry (calls, tokens, cost in cents, time) into settled_usage under the billing key. | our servers | apps/web/lib/services/cloud-agent-run-service.ts:1137-1170 |
| The app loads the run list or one run; the server maps settled_usage to run.usage. | our servers | apps/web/lib/services/cloud-agent-run-service.ts:616-640, 673-684 |
| The Tasks page or mobile sheet renders cost and tokens. | device | packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:336-385 |
| CLI asks the server for each turn's settlement and prints the result. | device and our servers | apps/cli/src/usage_summary.rs:376-441 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Settled usage per run | Server table cloud_agent_runs, column settled_usage. | Server is the source. Apps read it. | Kept with the run. Retention unknown. |
| CLI session estimate | In memory in the CLI session cost ledger (priced locally, not billed). | No. | Ends with the session. |

**Models and providers.** Cost comes from the model and provider used by the run, priced by the server rate card. The panel only shows the amount and the token counts. Local runs do not write settled usage because they are not billed.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with access to the run (runs are filtered by user id in the write query, apps/web/lib/services/cloud-agent-run-service.ts:1165-1167). |
| Permissions | A user sees only their own runs. |
| Subscription | Any plan with cloud runs. Free-trial runs store a null cost and show the free-trial message (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:350-353). |
| Limits and metering | Settled amounts feed the same ledger as the meters. This feature only displays them. |
| Feature flags | none found in the code. |
| Model compatibility | Any model that ran in the managed run. |
| Provider restrictions | none found in the code. |
| Local mode | No per-task billed cost in Local mode. CLI shows only the local session estimate, labelled 'priced locally, not the billed figure' (apps/cli/src/usage_summary.rs:874-882). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Live task | Shows settled-so-far with a growing-total note, or 'recorded when this task settles'. | packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:338, 369-381 |
| No usage recorded | 'No settled cost was recorded for this task.' | packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:378-380 |
| Free trial run | Message in place of a price; list hides the cost. | packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:350-353; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:752 |
| Loading, error, empty list | Spinner 'Loading your work history…', alert with Retry, empty state text. | packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:570-607 |
| CLI turn not settled | 'billed credits are not available yet, run `agi usage` later' or 'N not settled yet'. | apps/cli/src/usage_summary.rs:428-441 |
| Settlement read fails | CLI counts the turn as unavailable and stops polling it. | apps/cli/src/usage_summary.rs:392-398 |
| Duplicate settle | The same billing key overwrites its own entry, so totals do not double. | apps/web/lib/services/cloud-agent-run-service.ts:1163-1164 |
| Offline | not handled in the code beyond load errors. | searched packages/ui/unified-chat/src/components/tasks/TasksPage.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.cost.test.tsx`: Settled run priced in list and detail, live run shows pending, free-trial run not priced.
- `apps/mobile/src/features/tasks/__tests__/CloudRunDetailSheetOutput.test.tsx`: Run sheet output (cost rows not confirmed by name).
- `apps/web/app/api/usage/turns/[requestId]/route.test.ts`: Per-turn settlement route.
- `apps/cli/src/usage_summary.rs`: Inline tests (turn settlement cases not individually verified).
- `apps/extension-vscode/src/__tests__/accountUsageCommands.test.ts`: VS Code account usage commands (contents not opened).

**Test scenarios**

- **Settled run**
  1. Run a cloud task to completion.
  2. Open Tasks and the task.
  - Expected: Credits in the list row and in 'Cost and usage', with token counts.
- **Live run**
  1. Start a long task.
  2. Open its detail panel while it runs.
  - Expected: Settled-so-far credits or the 'recorded when this task settles' text, never zero as a final.
- **Free trial run**
  1. Use a Free account to run a task.
  - Expected: Free trial message and no price in list.
- **Mobile run sheet**
  1. Open a finished cloud run on mobile.
  - Expected: Cost and Usage rows appear.
- **CLI billed turn**
  1. Run a managed turn in the CLI.
  2. Wait for the billed line.
  - Expected: '<n> credits billed' or 'not settled yet' with a hint to run usage later.
- **No device breakdown**
  1. Open Usage and history on every app.
  - Expected: No per-device or per-surface table appears.

**Where to look when it fails**

- Inspect cloud_agent_runs.settled_usage for the run.
- CLI 'usage API returned HTTP <n>' on settlement failures.
- Zod parse failure in mapSettledUsage returns no usage (apps/web/lib/services/cloud-agent-run-service.ts:618).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)
- CLI: [70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md)
- VS Code: [70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **Per-device and per-surface usage is not built.** Affects: All apps and the API. Evidence: apps/web/lib/services/account-usage-history-service.ts:104-250 groups by workload, model, project only.. Work needed: Record a surface in usage attribution, aggregate it, return it, render it (see proposals).
- **CLI and VS Code show per-turn or per-session cost, not per task.** Affects: CLI and VS Code. Evidence: apps/cli/src/usage_summary.rs:401-441; apps/extension-vscode/src/core/commandSetup.ts:2287. Work needed: Decide whether task-level cost is required there.
- **Brief code references for task cost point at the wrong lines.** Affects: Documentation. Evidence: TasksPage.tsx:591 and CloudRunDetailSheet.tsx:179-185 are not cost code.. Work needed: Update the brief to lines 752-758, 336-385 and 376-392.
- **Chrome has no per-task cost.** Affects: Chrome. Evidence: no file found. Work needed: Confirm and mark not applicable or build.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- api:GET /api/usage/turns/{requestId}
- table:cloud_agent_runs
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- F082-02

## Unknown

- Retention of cloud_agent_runs rows.
- Whether the desktop Tasks page is the same shared component in the Electron window (inferred from the hosted-app rule).
- Whether Chrome shows any per-task cost.
- What CloudRunDetailSheetOutput.test.tsx asserts about cost (file not opened).
- What accountUsageCommands.test.ts asserts.
