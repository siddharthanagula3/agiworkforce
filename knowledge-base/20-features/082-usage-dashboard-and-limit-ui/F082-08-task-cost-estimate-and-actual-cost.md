---
id: "F082-08"
type: "feature"
title: "Task cost estimate and actual cost"
aliases: ["Estimated task cost", "Actual task cost", "Credits settling", "Cost and usage", "Billed credits", "S82.22", "S82.23", "usage estimate"]
area: "82 Usage dashboard and limit UI"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S82.22", "S82.23"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "table:managed_usage_requests", "api:POST /api/usage/estimate", "api:GET /api/usage/turns/[requestId]", "F082-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F082-08 Task cost estimate and actual cost

Before and during a research run, web shows an approximate maximum credit cost worked out in the browser. After a turn or task is billed, web, mobile, CLI and VS Code show the real credits. A server estimate endpoint exists but nothing in the apps calls it.

Area: [82. Usage dashboard and limit UI](README.md). Requirement items: [S82.22](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8222), [S82.23](../../10-requirements/capabilities/082-usage-dashboard-and-limit-ui.md#s8223).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a rough upfront credit cost for a research run and a real, settled cost afterwards for a chat turn or an agent task.

**Why it exists.** Credits are consumed by usage; people want to know a run's size before it starts and what it cost afterwards. Briefs S82.22 and S82.23 ask for both.

**Who uses it.** Cloud users on web or hosted desktop (estimate and actual), mobile (task cost), CLI and VS Code (billed credits).

**Problems it solves**

- Surprise cost on a long research run
- Not knowing what a turn or task cost
- Confusing partial amounts before settlement

**Use cases**

- A user edits a research plan and reads 'Estimated cost: up to about N credits'.
- A user hovers a message and sees tokens plus credits.
- A user opens a finished task and sees Cost and usage.
- A CLI user sees '<credits> billed' after a turn.

## 2. User experience

**Where to find it**

- Web and hosted desktop: research plan card (apps/web/features/chat/components/research/ResearchCostEstimate.tsx:46), research activity count 'up to ~N' (ResearchActivity.tsx:396), message token badge with credits (apps/web/features/chat/components/tokens/TokenUsageDisplay.tsx:46), Tasks list cost (packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:755) and task detail section 'Cost and usage' (TaskDetailPanel.tsx:336).
- Mobile: task detail sheet row 'Cost' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:378).
- CLI: line after a turn, for example '<credits> billed' (apps/cli/src/usage_summary.rs:428-441, output.rs:833).
- VS Code: 'Billed:' line in the token usage view (apps/extension-vscode/src/data/tokenCounter.ts:149).

**Before you start**

- Cloud mode with a managed account. Local and own-key turns have no billed record (404 maps to no label, use-settled-turn-credits.ts:44).

**Screens and controls**

- Research plan: text 'Estimated cost: up to about N credits for up to R model rounds and S searches.' plus 'You have X available right now' or a warning that the run may stop early (ResearchCostEstimate.tsx:47-60).
- Fallback text 'A cost estimate is not available for this model. The run is metered as it goes.' (ResearchCostEstimate.tsx:38).
- Message badge: 'N tokens' plus credits, 'Credits settling' or 'Credits unavailable' (TokenUsageDisplay.tsx:24-33).
- Task detail: credits, tokens in/out, model calls; text for free-trial runs and for runs still settling (TaskDetailPanel.tsx:336-383).

**Journey**

1. Start a research run and edit the plan: read the estimate.
2. While the run is active, the activity header adds 'up to ~N'.
3. When the turn finishes, the message badge shows 'Credits settling' then the real credits.
4. Open the task in Tasks to see cost, tokens and calls.

**What the person sees and gets**

- Estimate wording above.
- 'Credits settling' while the server has not settled the turn (use-settled-turn-credits.ts:49-53).
- 'This is what has settled so far. The total grows while the task keeps working.' for live tasks (TaskDetailPanel.tsx:370).
- 'No settled cost was recorded for this task.' when none (TaskDetailPanel.tsx:379).

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Research estimate is computed in the browser from the selected model's catalog price and a fixed typical token profile per round plus a per-search price (apps/web/lib/billing/credit-estimates.ts:22-24, 76-89). Shown in the editable plan (ResearchPlan.tsx:321) and in the activity header (ResearchActivity.tsx:282-396).
- Settled turn cost: GET /api/usage/turns/[requestId] returns pending or settled with credits (apps/web/app/api/usage/turns/[requestId]/route.ts:56; apps/web/lib/services/account-usage-history-service.ts:329-349). Web polls up to 5 times, 2 seconds apart (use-settled-turn-credits.ts:5-6).
- Task cost from settled usage per run in cloud-agent-run-service (apps/web/lib/services/cloud-agent-run-service.ts:616-633), shown in the shared task components and the mobile sheet.
- CLI polls turn settlement (usage_summary.rs:385-399) and prints billed credits; VS Code polls up to four times (apps/extension-vscode/src/utils/api.ts:1185-1203).

**Incomplete**

- POST /api/usage/estimate exists with tests but no app code calls it: it is listed in the routes-without-callers test (apps/web/__tests__/api/routes-without-callers.test.ts:155) and a repo search for the path found only docs, tests and the registry.
- The browser estimate uses fixed average token counts, not the user's actual prompt (credit-estimates.ts:22), so it is only a rough ceiling; the server endpoint instead counts prompt tokens (estimate/route.ts:86-98).
- Estimate covers research runs only; no estimate is shown for an ordinary chat turn or agent task in the code searched.

**Present but disconnected or switched off**

- api:POST /api/usage/estimate (no caller found).

**Not available**

- Mobile: no pre-run cost estimate, by decision (doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-28-27).
- CLI, VS Code and Chrome: no estimate before a run found in the code searched. Chrome: no actual cost display found (brief status n/a).

## 4. Required behaviour

**Established requirements**

- Before or while a task runs the user sees an estimate of cost. (source: S82.22 (brief))
- After a task finishes the user sees what it actually cost. (source: S82.23 (brief))
- The estimate endpoint refuses a model with no per-token price and returns a minimum and maximum credit range. (source: apps/web/app/api/usage/estimate/route.ts:77-81, 97-106)
- An unsettled turn shows no cost figure; it is reported as pending. (source: apps/web/lib/services/account-usage-history-service.ts:339-341)
- A pre-run cost estimate is not built on mobile. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-27))

**Acceptance criteria**

1. In an editable research plan the estimate text appears with rounds, searches and available credits.
2. For a model with no published price, the fallback text appears instead of a number.
3. If the estimate is above available credits, a warning says the run may stop before it finishes.
4. A completed Cloud turn shows 'Credits settling' then a credit amount on the message badge.
5. A turn with no managed record shows no credit label.
6. Task detail shows credits, tokens and model calls for a settled task and a 'so far' note for a live one.
7. POST /api/usage/estimate with a priced model returns object usage.estimate with credits.min <= credits.max; an unpriced model returns a validation error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Estimates should be labelled approximate; the research text says 'up to about' [inferred from ResearchCostEstimate.tsx:47].
- If the estimate endpoint stays unused it should be removed or wired [inferred from AGENTS.md section 9 on dead code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Call the estimate endpoint from the composer for long or tool-heavy turns, or delete it.
- [proposed] Show actual cost per turn on mobile chat if the owner wants it (not decided).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | credit-estimates | `apps/web/lib/billing/credit-estimates.ts` | estimateResearchCredits, typical token profiles, price per million tokens |
| component | ResearchCostEstimate | `apps/web/features/chat/components/research/ResearchCostEstimate.tsx` | Estimate text and available-credit warning in the research plan |
| component | ResearchActivity | `apps/web/features/chat/components/research/ResearchActivity.tsx` | Passes estimate props and shows 'up to ~N' while active; shows final research credits when done |
| component | ResearchPlan | `apps/web/features/chat/components/research/ResearchPlan.tsx` | Renders the estimate when the plan is editable (line 321) |
| endpoint | POST /api/usage/estimate | `apps/web/app/api/usage/estimate/route.ts` | Server estimate range from catalog price and token count; no caller |
| endpoint | GET /api/usage/turns/[requestId] | `apps/web/app/api/usage/turns/[requestId]/route.ts` | Returns pending or settled credits for one request id |
| service | readManagedUsageTurnCost | `apps/web/lib/services/account-usage-history-service.ts` | Reads status and actual_cost_microusd by idempotency key |
| hook | useSettledTurnCredits | `apps/web/features/chat/lib/use-settled-turn-credits.ts` | Polls the turn endpoint 5 times, 2 s apart |
| component | TokenUsageDisplay | `apps/web/features/chat/components/tokens/TokenUsageDisplay.tsx` | Message badge with tokens and credits |
| component | TaskDetailPanel / TasksPage | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | Task Cost and usage section; list cost in TasksPage.tsx:755 |
| service | cloud-agent-run-service mapSettledUsage | `apps/web/lib/services/cloud-agent-run-service.ts` | Builds run usage (cost cents, tokens, calls) from settled_usage |
| screen | CloudRunDetailSheet | `apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx` | Mobile Cost and Usage rows |
| command | billed_turn / render_billed_turn | `apps/cli/src/usage_summary.rs` | Poll settlement and render 'billed' text; printed by output.rs:833 |
| service | fetchBilledCredits | `apps/extension-vscode/src/utils/api.ts` | VS Code settlement polling |
| service | TokenCounter billed line | `apps/extension-vscode/src/data/tokenCounter.ts` | Shows Billed credits in the token view |
| test | estimate route test | `apps/web/app/api/usage/estimate/route.test.ts` | Endpoint behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Research plan renders; browser computes the estimate from the selected model's catalog price, rounds and searches. No network call. | device | apps/web/features/chat/components/research/ResearchCostEstimate.tsx:27-30; credit-estimates.ts:76-89 |
| Available credits come from the managed usage summary hook. | device and our servers | ResearchCostEstimate.tsx:26 |
| A managed turn is billed by the server: the usage record is reserved and settled; actual_cost_microusd is written when the turn completes. | our servers | apps/web/lib/services/managed-usage-request-service.ts:1296 area; account-usage-history-service.ts:331-349 |
| The client asks GET /api/usage/turns/<request id> up to 5 times until status is settled. | device and our servers | use-settled-turn-credits.ts:35-58 |
| CLI and VS Code do the same poll with short delays and print or show the credits. | device and our servers | usage_summary.rs:385-399; api.ts:1185-1203 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Settled cost per request | table:managed_usage_requests (actual_cost_microusd, status) | Server only; read by clients | unknown |
| Task settled usage | cloud agent run row column settled_usage (table name not established here) | Server; shown on all apps with Tasks | unknown |

**Models and providers.** The estimate uses the selected model's catalog price from the model catalog (SYS-model-catalog-and-routing). A model without a published per-token price gets no estimate. Actual cost is whatever the managed route billed; provider and model identity come from the stored request.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Estimate endpoint and turn cost endpoint accept an API key with scope usage:read (estimate/route.ts:53; turns route:41). |
| Permissions | Own rows only (turn lookup by user id and idempotency key). |
| Subscription | Free accounts: task detail says a free-trial run was metered against the allowance, not charged (TaskDetailPanel.tsx:350-353). Free usage screens show no credit figures per the owner's rule (memory: Free usage = Upgrade only), tested in UsageSection tests. |
| Limits and metering | Turn polling is bounded to 5 attempts (web) or 4 (VS Code). Endpoints use the credits-balance rate limit (estimate and turns routes). |
| Feature flags | None found in the code. |
| Model compatibility | Estimate requires a model with a published per-token price (estimate/route.ts:77-81; ResearchCostEstimate.tsx:34-42). |
| Provider restrictions | None found in the code. |
| Local mode | No Cloud billing, so no estimate-vs-actual in Local mode. A turn without a managed request returns 404 and the badge shows no credit label (use-settled-turn-credits.ts:44-47). CLI billed_turn returns nothing when not in managed mode (usage_summary.rs:405-407). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Estimate unavailable | Fallback text for unpriced model or no rounds. | ResearchCostEstimate.tsx:34-42 |
| Estimate above balance | Warning that the run may stop before finishing. | ResearchCostEstimate.tsx:52-56 |
| Turn pending | 'Credits settling' while polling; after 5 tries it stays 'pending' with that label. | use-settled-turn-credits.ts:49-53; TokenUsageDisplay.tsx:26-29 |
| Settle read error | 'Credits unavailable'. | TokenUsageDisplay.tsx:30-31; use-settled-turn-credits.ts:59 |
| No managed request (Local/own key) | No label. | use-settled-turn-credits.ts:44-47 |
| CLI partial | 'billed so far, N not settled yet' or 'billed credits are not available yet, run agi usage later'. | usage_summary.rs:428-441 |
| Live task | Shows settled so far with a growing note. | TaskDetailPanel.tsx:370-374 |
| Cancel | Hook aborts polling on unmount. | use-settled-turn-credits.ts:62 |
| Offline or timeout | Shows 'Credits unavailable'; no retry button. Not handled further in the code. | use-settled-turn-credits.ts:58-60 |
| Accessibility | Task cost section has aria-label 'Task cost and usage'. Other labels: not checked. | TaskDetailPanel.tsx:342 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/usage/estimate/route.test.ts`: Estimate endpoint
- `apps/web/app/api/usage/turns/[requestId]/route.test.ts`: Turn settlement endpoint
- `apps/cli/src/usage_summary.rs`: In-file tests, for example 'a settled turn states the credits it was billed' (line 1302) and 'a turn with no managed request reports no bill' (line 1328)
- `apps/extension-vscode/src/__tests__/tokenCounter.test.ts`: Token counter and billing line (content not read in detail)
- `packages/ui/unified-chat/src/components/tasks/__tests__/TaskDetailPanel.dialog.test.tsx`: Task detail panel (cost section coverage not verified)

**Test scenarios**

- **Research estimate**
  1. Start a research run with a priced model.
  2. Open the editable plan.
  - Expected: Estimate text with rounds and searches. With a low balance, the warning line appears.
- **Unpriced model**
  1. Select a model with no published token price and start research.
  - Expected: Fallback text, no number.
- **Settled badge**
  1. Send a Cloud chat turn.
  2. Watch the message badge.
  - Expected: 'Credits settling' then credits, within about 10 seconds.
- **Task cost**
  1. Finish a cloud task.
  2. Open it on web and on mobile.
  - Expected: Same credit cost on both.
- **Estimate endpoint**
  1. POST /api/usage/estimate with model and messages using an API key with usage:read.
  - Expected: JSON with credits.min and credits.max; unpriced model gives a validation error.

**Where to look when it fails**

- 'Failed to read the settled cost of a turn' (turns route).
- Table managed_usage_requests status and actual_cost_microusd.
- Routes-without-callers test lists the unused estimate route.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/web/082-usage-dashboard-and-limit-ui.md)
- Desktop: [70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/desktop/082-usage-dashboard-and-limit-ui.md)
- Mobile: [70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/mobile/082-usage-dashboard-and-limit-ui.md)
- CLI: [70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/cli/082-usage-dashboard-and-limit-ui.md)
- VS Code: [70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md](../../70-qa/test-plans/vscode/082-usage-dashboard-and-limit-ui.md)

## 10. Gaps and dependencies

- **The estimate endpoint has no caller in any app.** Affects: All apps. Evidence: apps/web/__tests__/api/routes-without-callers.test.ts:155. Work needed: Wire it to the composer or remove it.
- **No estimate for ordinary chat turns or tasks, only research runs.** Affects: Web, desktop. Evidence: Only ResearchCostEstimate and ResearchActivity use estimateResearchCredits (repo search). Work needed: Decide scope; reuse the endpoint.
- **Brief says the estimate is built on desktop and the API only and cites ChatComposerNew.tsx:4936; that line is an unrelated status panel, not an estimate.** Affects: Documentation. Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4915-4925. Work needed: Correct the brief.
- **No retry control when the settled credit lookup fails.** Affects: Web. Evidence: use-settled-turn-credits.ts:58-60. Work needed: Add a retry or longer poll.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- table:managed_usage_requests
- api:POST /api/usage/estimate
- api:GET /api/usage/turns/[requestId]
- F082-07

## Unknown

- Whether mobile chat shows a per-turn billed amount (a mobile search matched billing terms in MessageBubble but it was not opened).
- Table that holds settled_usage for cloud agent runs.
- Test coverage for ResearchCostEstimate, useSettledTurnCredits and TokenUsageDisplay: no test file found by name search.
- Whether Chrome ever shows a cost (brief says n/a).
