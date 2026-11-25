---
id: "F062-10"
type: "feature"
title: "Synthesis, agreement and unique findings"
aliases: ["Synthesis answer", "Agreement and disagreement display", "Unique findings per model", "Council (competitor name)", "S62.21", "S62.22", "S62.23"]
area: "62 Multi-agent and multi-model interfaces"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S62.21", "S62.22", "S62.23"]
depends_on: ["F062-09", "F062-11", "surface:web", "surface:mobile", "surface:cli", "SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-inference-providers"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-10 Synthesis, agreement and unique findings

Not built for model comparison. No app combines parallel model answers into one answer, marks where models agree or differ, or lists findings unique to each model. The only related code is the CLI /gather command, which merges background thread results, and a mobile Faster badge that compares time, not content.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.21](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6221), [S62.22](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6222), [S62.23](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6223).

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

**What it does.** Would take the answers from a multi-model comparison and produce one combined answer, mark agreement and disagreement, and list what each model found alone.

**Why it exists.** Brief items S62.21, S62.22, S62.23. A competitor announced a multi-model Council; guidance says to assess a comparison and synthesis experience without assuming consensus proves truth (doc: docs/product/competitive-guidance.md:199).

**Who uses it.** Would serve people using compare (web, mobile) who want a verdict, and developers combining parallel CLI threads.

**Problems it solves**

- Reading several long answers to find what matches and what differs.
- Seeing the single useful finding one model had alone.

**Use cases**

- After comparing three models, get one merged answer.
- See a list of points all models agreed on.
- See what only one model mentioned.

## 2. User experience

**Where to find it**

- Not available on any app for model comparison (no code found).
- Related CLI only: /gather after /thread (apps/cli/src/claude_parity.rs:150-153).

**Before you start**

- For /gather: a saved CLI session with finished threads.

**Screens and controls**

- None for model comparison. Compare panels show answers separately (apps/web/features/models/components/CompareAnswersPage.tsx:371-484).
- Mobile shows a 'Faster' badge and 'tie' label that compare time only (apps/mobile/src/features/compare/index.tsx:589-600, :719-728).

**Journey**

1. Current: run a comparison and read each panel yourself.
2. CLI related: /thread several tasks, /threads to watch, /gather sends one prompt asking the model to reconcile conflicts and give one combined answer (apps/cli/src/background.rs:455-465).

**What the person sees and gets**

- Web panels: timing line and finish notes only.
- Mobile: time to first token, approximate tokens, total time, Faster badge.

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI /gather builds a prompt from finished thread answers and instructs the model to reconcile conflicts and give one combined answer. This synthesizes threads of one conversation, not model comparison (apps/cli/src/background.rs:409-466).
- Mobile determineWinner compares duration only and awards 'Faster' (apps/mobile/src/features/compare/index.tsx:728-738).

**Incomplete**

- The /gather synthesis is a prompt to the session's own model; there is no agreement or unique-findings view [inferred from the prompt text].

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Synthesized answer, agreement/disagreement display and unique findings on web, desktop, mobile, CLI, VS Code and Chrome. No synthesis step was found in the web hook or the mobile screen (apps/web/features/models/lib/use-compare-answers.ts; apps/mobile/src/features/compare/index.tsx).

## 4. Required behaviour

**Established requirements**

- After parallel answers, the product produces one synthesized answer. (source: S62.21)
- The comparison highlights where models agree and disagree. (source: S62.22)
- The comparison lists findings unique to each model. (source: S62.23)
- Assess a comparison and synthesis experience without assuming consensus proves truth. (source: doc: docs/product/competitive-guidance.md:199)

**Acceptance criteria**

1. After a two-model run, a control creates one synthesized answer that names the models it used.
2. Agreement and disagreement points are visible and each ties to the panels it came from.
3. Each model's unique points are listed under its name.
4. The synthesis step shows its model and cost before running.
5. A failed or stopped model is excluded and the synthesis says so.
6. The synthesis follows the plan's model and usage rules.
7. Local mode never sends comparison content off device.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The synthesizing model must be chosen from the catalog, not named in screen code (AGENTS.md section 4) [inferred].
- The synthesis is a further model call and counts as usage [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A 'Combine answers' button on each compare view that sends the answers to one model chosen by the router.
- [proposed] Label the output so it is not read as a fact check; consensus is not truth.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useCompareAnswers | `apps/web/features/models/lib/use-compare-answers.ts` | Holds answers; the place a synthesis step would read from. |
| component | CompareAnswersPage / AnswerPanel | `apps/web/features/models/components/CompareAnswersPage.tsx` | Shows separate answers; no combined view. |
| screen | Mobile CompareScreen | `apps/mobile/src/features/compare/index.tsx` | Two panels and the time-only verdict. |
| service | determineWinner | `apps/mobile/src/features/compare/index.tsx:728` | Time comparison only. |
| service | gather_prompt | `apps/cli/src/background.rs:409` | Related CLI merge of thread results into one prompt. |
| service | spawn_thread | `apps/cli/src/background.rs:342` | Creates the threads that /gather merges. |
| command | /gather | `apps/cli/src/claude_parity.rs:150` | Sends the combined prompt to the main chat. |
| service | streamCompareAnswer | `apps/web/features/models/lib/compare-answer-stream.ts` | Source of per-model text and finish reason. |
| service | mobile streamChat | `apps/mobile/services/streaming.ts:1046` | Source of per-model text on mobile. |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Endpoint a synthesis call would use. |
| test | CompareSpeedVerdict tests | `apps/mobile/__tests__/CompareSpeedVerdict.test.tsx` | Tests the time-only verdict. |
| config | Competitive guidance | `docs/product/competitive-guidance.md:199` | Reference for a multi-model Council. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No synthesis flow exists for model comparison. | device | No synthesis code in apps/web/features/models or apps/mobile/src/features/compare. |
| CLI /gather reads finished thread sessions and builds a prompt locally. | device | apps/cli/src/background.rs:409-466 |
| The built prompt goes to the main session's model like any user message. | outside service | claude_parity.rs:150-153 returns Prompt [model call per session route] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Thread answers used by /gather | managed session files; run.json marks gathered | no | kept until removed (apps/cli/src/background.rs:455-458) |

**Models and providers.** Not applicable for comparison synthesis. /gather uses the session's own model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for synthesis. |
| Permissions | none found in the code. |
| Subscription | none found in the code. Would follow the plan's models and usage rules [proposed]. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | not applicable. |
| Provider restrictions | none found in the code. |
| Local mode | No synthesis exists. /gather in a Local CLI session builds the prompt on device; the model call follows the session route. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No synthesis | Panels show answers separately; not handled in the code beyond that. | apps/web/features/models/components/CompareAnswersPage.tsx:339-362 |
| Mobile verdict with error or stop | No verdict when either answer failed or was stopped. | apps/mobile/src/features/compare/index.tsx:730-731 |
| /gather with running threads | Message says N thread(s) still running and none finished. | apps/cli/src/background.rs:441-447 |
| /gather with failed thread | Includes a line saying the thread failed and pointing to logs. | apps/cli/src/background.rs:426-432 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/CompareSpeedVerdict.test.tsx`: Time-only Faster verdict, tie, no verdict on error or stop.

**Test scenarios**

- **Confirm no synthesis control (web)**
  1. Run a two-model comparison on /models/compare.
  - Expected: No combined answer, no agreement view.
- **Confirm time-only verdict (mobile)**
  1. Run a comparison on mobile.
  - Expected: Faster badge reflects duration, not quality.
- **CLI gather**
  1. /thread two tasks, wait for both to finish, /gather.
  - Expected: One prompt with both answers and the reconcile instruction.
- **CLI gather with failure**
  1. Stop one thread, /gather.
  - Expected: The stopped thread is listed with its state.

**Where to look when it fails**

- Not applicable for comparison synthesis.
- CLI: `agi background logs <id>` for thread failures.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No synthesis, agreement or unique-findings view.** Affects: Web and mobile compare users; all other apps.. Evidence: No code found.. Work needed: Design and build a synthesis step, with model chosen from the catalog and usage counted.
- **Mobile 'Faster' badge may be read as a quality verdict.** Affects: Mobile.. Evidence: apps/mobile/src/features/compare/index.tsx:589-600. Work needed: Keep label as speed; do not imply quality.
- **No test for CLI /gather.** Affects: CLI.. Evidence: background.rs tests list.. Work needed: Add tests.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F062-09
- F062-11
- surface:web
- surface:mobile
- surface:cli
- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-inference-providers

## Unknown

- Whether any design for synthesis exists in docs/specs.
- Which model would synthesize and who pays.
- Whether Chrome or VS Code have multi-answer views to extend.
