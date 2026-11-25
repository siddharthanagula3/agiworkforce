---
id: "F062-11"
type: "feature"
title: "Comparison sources, cost, rerun and save"
aliases: ["Combined-source inspection", "Comparison-cost estimate", "Rerun one participant", "Save comparison", "Chat with <model> button", "S62.24", "S62.25", "S62.27", "S62.28"]
area: "62 Multi-agent and multi-model interfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S62.24", "S62.25", "S62.27", "S62.28"]
depends_on: ["F062-09", "F062-10", "surface:web", "surface:mobile", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-11 Comparison sources, cost, rerun and save

Sources, cost estimate, per-panel rerun and saved comparisons are not built on any app. Web compare keeps results only in page memory, says answers count as plan messages and are not saved, and offers 'Chat with <model>' to continue one model in a normal chat. Mobile has no cost, rerun or save control.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.24](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6224), [S62.25](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6225), [S62.27](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6227), [S62.28](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6228).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person inspect the sources all compared models used, see an estimated cost before running, rerun a single model, and save a comparison to reopen later.

**Why it exists.** Brief items S62.24 (sources), S62.25 (cost estimate), S62.27 (rerun one), S62.28 (save). Inference cost is a first-class design constraint (doc: AGENTS.md section 7).

**Who uses it.** People using model compare on web and mobile.

**Problems it solves**

- Not knowing what a comparison will cost.
- Losing a comparison on reload.
- Rerunning all models because one failed.

**Use cases**

- See that three models will each count as a message before sending.
- Rerun the one panel that errored.
- Save a comparison and reopen it tomorrow.

## 2. User experience

**Where to find it**

- Web /models/compare: the hint under the prompt and the 'Chat with <model>' and 'Copy the answer from <model>' buttons on each finished panel (apps/web/features/models/components/CompareAnswersPage.tsx:333-336, :455-480).
- Mobile Compare Models: per-answer 'Report this answer' flag and stats only (apps/mobile/src/features/compare/index.tsx:589-640).
- No sources, cost estimate, rerun or save control on any app.

**Before you start**

- Same as F062-09.

**Screens and controls**

- Web hint: 'Each answer counts as a message on your plan. Not saved to chats; memory stays off.' plus the concurrency note when the plan limit is below the number of slots.
- Web footer per panel: timing text, copy icon, 'Chat with <model>'.
- Mobile: ttft, approximate tokens, total time chips.

**Journey**

1. Run a comparison (F062-09).
2. Read the hint to learn it is a plan message and is not saved.
3. Optionally press 'Chat with <model>' to open /chat with that model selected, or copy the text.
4. Reload or leave: the comparison is gone.

**What the person sees and gets**

- Toasts 'Answer copied' / 'Could not copy the answer' (web).
- No cost figure shown anywhere in compare.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web states the plan-message cost and that nothing is saved (apps/web/features/models/components/CompareAnswersPage.tsx:333-336).
- Web 'Chat with <model>' records the model as recent, selects it and routes to /chat; the prompt is not carried over (apps/web/features/models/components/CompareAnswersPage.tsx:203-210).
- Web copy answer button (apps/web/features/models/components/CompareAnswersPage.tsx:408-440).
- Mobile per-answer report flow (apps/mobile/src/features/compare/index.tsx:606-626).
- The comparison is kept only in React state; unmounting aborts requests (apps/web/features/models/lib/use-compare-answers.ts:168-169).

**Incomplete**

- Web shows plan-message language but no number or dollar estimate.
- Web: 'Chat with <model>' does not carry the compared prompt or answer into the chat [inferred from chatWith code].

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Combined sources view: compare requests turn tools and web search off (tool_choice none), so no sources are produced (apps/web/features/models/lib/compare-answer-stream.ts:146-150).
- Cost estimate before sending on any app.
- Per-panel rerun on web or mobile (resend the prompt for all).
- Saved comparison list on any app; no storage or route found.
- CLI cost: advisor and thread usage are in the cost ledger, but there is no pre-run estimate for compare (apps/cli/src/platform/runtime/advisor.rs:222).

## 4. Required behaviour

**Established requirements**

- The user can inspect the combined sources all participants used. (source: S62.24)
- Before running a comparison the user sees its estimated cost. (source: S62.25)
- The user can rerun a single participant without rerunning the whole comparison. (source: S62.27)
- The user can save a comparison and reopen it later. (source: S62.28)
- Inference cost is a first-class design constraint. (source: doc: AGENTS.md section 7)
- Rates and quotas are configuration, not constants. (source: doc: AGENTS.md section 8)

**Acceptance criteria**

1. Before sending, a cost estimate for the chosen models appears and matches the plan's metering.
2. After a run, a rerun control on one panel re-requests only that model and keeps the others.
3. A saved comparison appears in a list and reopens with the same prompt and answers after reload.
4. Sources, when produced, are shown merged and attributed to each model.
5. Leaving and returning to the page does not lose a saved comparison.
6. Deleting a saved comparison removes it and asks first (AGENTS.md section 9).
7. Local mode never uploads a saved comparison.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A saved comparison is user data and needs an owner, retention rule and sync decision [inferred from SYS-sync-and-continuity].
- Estimate depends on token pricing from the model catalog, not hardcoded values [inferred from AGENTS.md section 4].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store compare runs in a table scoped to the user, with an 'Archive' action rather than hard delete.
- [proposed] Add 'Retry this model' on failed panels first, as it is the smallest change.
- [proposed] Turn on search for compare only when the plan allows and show merged sources.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CompareAnswersPage hint text | `apps/web/features/models/components/CompareAnswersPage.tsx:333` | States cost-as-message and not-saved. |
| component | AnswerPanel (copy, Chat with) | `apps/web/features/models/components/CompareAnswersPage.tsx:332` | Per-panel footer actions. |
| hook | useCompareAnswers | `apps/web/features/models/lib/use-compare-answers.ts` | In-memory run state; where rerun or save would hook in. |
| service | streamCompareAnswer request body | `apps/web/features/models/lib/compare-answer-stream.ts:140` | tool_choice none, memory off, connectors off. |
| service | chatWith | `apps/web/features/models/components/CompareAnswersPage.tsx:203` | Opens /chat with the model. |
| screen | Mobile CompareScreen | `apps/mobile/src/features/compare/index.tsx` | State in memory; reset on account or plan change. |
| component | Mobile ResponsePanel stats + report | `apps/mobile/src/features/compare/index.tsx:560` | ttft, tokens, duration, report flag. |
| service | mobile streamChat request body | `apps/mobile/src/features/compare/index.tsx:277` | tool_choice none, memory_enabled false, connector tools off. |
| service | getPlanMaxConcurrentTurns / billing catalog | `packages/contracts/types/src/billing-catalog.ts:792` | Plan limit data a cost or concurrency note reads. |
| endpoint | GET /api/models/catalogue | `apps/web/app/api/models/catalogue/route.ts` | Would provide model price data [inferred, price fields not checked]. |
| service | cost_ledger::record_side_request | `apps/cli/src/cost_ledger.rs` | CLI side-request cost recording, nearest cost code. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Each answer is one managed turn counted by the plan. |
| test | Mobile compare tests | `apps/mobile/__tests__/CompareAnswerReport.test.tsx` | Report control. |
| service | createManagedChatIdempotencyKey purpose 'compare' | `apps/web/features/models/lib/compare-answer-stream.ts:122` | Idempotency per answer request. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The user sends a prompt; each model request goes to the managed completions endpoint with no tools. | our servers | apps/web/features/models/lib/compare-answer-stream.ts:128-152 |
| Answers stream into React state; nothing is written to storage. | device | apps/web/features/models/lib/use-compare-answers.ts:67-110 |
| 'Chat with <model>' sets the selected model in a client store and navigates to /chat. | device | apps/web/features/models/components/CompareAnswersPage.tsx:203-210 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt, answers, timings | React state only | no | lost on leaving or reloading |
| Usage of each answer | server usage accounting [details unknown] | server | unknown |

**Models and providers.** Whichever catalogue models were chosen. Search and tools are off, so sources cannot exist today.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same as F062-09. |
| Permissions | none found in the code. |
| Subscription | Each answer counts as a message on the plan (apps/web/features/models/components/CompareAnswersPage.tsx:333). |
| Limits and metering | Concurrency by plan; no estimate shown. |
| Feature flags | none found in the code. |
| Model compatibility | Text only. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local: compare refused, so nothing to save or estimate. No local saved comparison exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Reload or navigate away | Comparison lost; requests aborted on unmount. | apps/web/features/models/lib/use-compare-answers.ts:168-169 |
| Failed model | Panel shows error; user must send again for all models. | apps/web/features/models/lib/use-compare-answers.ts:150-160 |
| Copy failure | Toast 'Could not copy the answer'. | apps/web/features/models/components/CompareAnswersPage.tsx:331-335 |
| Offline / retry / cancel | Cancel is Stop; retry per panel not handled in the code. | apps/web/features/models/lib/use-compare-answers.ts:73-85 |
| Accessibility | Buttons have labels naming the model. | apps/web/features/models/components/CompareAnswersPage.tsx:415-420 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/CompareAnswerReport.test.tsx`: Report control on finished answers.
- `apps/mobile/__tests__/CompareAccountIsolation.test.tsx`: Results cleared when account or plan changes (no saving).
- `apps/web/features/models/lib/compare-answer-stream.test.ts`: Stream parsing only.

**Test scenarios**

- **Not saved on reload**
  1. Run a web comparison.
  2. Reload /models/compare.
  - Expected: Panels are gone; the hint still says answers are not saved.
- **Chat with a model**
  1. Finish a comparison.
  2. Press 'Chat with <model>'.
  - Expected: /chat opens with that model selected; compared prompt is not in the chat.
- **No sources**
  1. Ask a question needing current facts in compare.
  - Expected: No source list appears in any panel.
- **No estimate**
  1. Open compare, pick three models, type a prompt.
  - Expected: Only the hint text; no cost figure.
- **No rerun**
  1. Cause one model to fail.
  2. Look for a rerun button on that panel.
  - Expected: No such button.

**Where to look when it fails**

- Network tab for one POST per model.
- Hint text constant in CompareAnswersPage.tsx.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No combined sources.** Affects: Web, mobile and all other apps.. Evidence: Tools off in compare requests.. Work needed: Decide whether compare may use search; add a merged sources panel.
- **No cost estimate.** Affects: Web, mobile.. Evidence: Only hint text exists.. Work needed: Compute estimate from catalogue prices and plan metering.
- **No per-panel rerun.** Affects: Web, mobile.. Evidence: useCompareAnswers has start and stop only.. Work needed: Add rerun(index) to the hook.
- **No saved comparisons.** Affects: All apps.. Evidence: State only in memory.. Work needed: Add storage, list and delete with confirmation; define Local versus Cloud sync.
- **'Chat with' drops the prompt.** Affects: Web.. Evidence: chatWith only selects a model.. Work needed: Optionally seed the new chat with the prompt.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F062-09
- F062-10
- surface:web
- surface:mobile
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-files-artifacts-and-storage

## Unknown

- Whether the managed route records compare answers in usage history.
- Which catalogue fields hold prices usable for an estimate.
- Whether tool_choice none could be relaxed for sources without breaking the plan rules.
- Where saved comparisons would live (web tables or device) and whether they sync.
