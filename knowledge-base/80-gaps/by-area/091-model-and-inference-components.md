---
id: "GAPS-AREA-091"
type: "gap-list"
title: "Gaps: Model and inference components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 91. Model and inference components

44 open gaps that touch this area. Area page: [20-features/091-model-and-inference-components](../../20-features/091-model-and-inference-components/README.md).

## CMP-MP27

**Context window size shown for the plan or model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F076-01](../../20-features/076-model-capability-registry/F076-01-text-chat-input-and-output.md), [F076-02](../../20-features/076-model-capability-registry/F076-02-picture-and-document-input.md), [F076-04](../../20-features/076-model-capability-registry/F076-04-tool-calls-and-multi-step-tool-use.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F079-03](../../20-features/079-routing-and-model-neutral-orchestration/F079-03-understanding-the-request.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Detail: The picker shows no per-model size Plans page shows plan context window; the picker shows no per-model size.
- Evidence: apps/mobile/src/features/settings/plans/index.tsx:71-74

## CMP-V46

**Offer a cheaper model near a usage limit**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Detail: The panel shows context use and a limit error with a recovery link, but never offers a cheaper model before the limit.
- Evidence: apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:133; searched: 90%, nearLimit in apps/extension-vscode/src

## CMP-W90

**Show or hide older models**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md), [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Detail: The picker offers current catalog models only and labels retiring ones; there is no older-model switch.
- Evidence: apps/web/features/models/lib/model-presentation.ts:44-54

## GAP-AREA091-LW02

**Mobile Cloud Code session screen uses the same resolver, so the same replacement happens there.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-091
- Detail: Area 91. Model and inference components
- Evidence: apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:244

## GAP-AREA091-LW03

**Resolver's final fallback returns the plan's default chat model without checking that it can run agents. The candidate list is filtered for tool support, but the fallback is not.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-091
- Detail: Area 91. Model and inference components
- Evidence: packages/contracts/types/src/cloud-code-agent-model.ts:25-34

## GAP-AREA091-LW04

**Batch and deferred inference coordinator is missing (S91.30). A search of the chat endpoint, routing and provider code found no such coordinator; the batch-named code that exists is for other features.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-091
- Detail: Area 91. Model and inference components
- Evidence: apps/web/app/api/llm/v1/chat/completions (no coordinator found); apps/web/lib/services/free-lane/runtime-state-service.ts:360 and apps/web/app/api/cron/sweep-chat-file-intakes/route.ts:43 are unrelated batch code

## GAP-CAP-editing-regeneration-and-branching-07

**Retry a failed send or failed answer in place: Defects seen on web: Retry re-ran turn 1 instead of the failed turn; limit denial shows a raw 'Error:' line with no upgrade path; reload mid-answer shows a misleading banner.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-06](../../20-features/016-user-message-components/F016-06-resend-retry.md), [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F017-09](../../20-features/017-assistant-message-components/F017-09-stopped-failed-and-refused-answers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Requirement items: S16.15, S16.16, S17.20, S17.40, S91.26
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-11

**Stop generation: Web defects seen: false 'Free limit reached' banner after Stop; empty 'Writing response' row stays; an 'Agent run failed' notification after Stop; a stopped answer returns longer after reload; cloud task Stop adds 'model failed' text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F013-02](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md), [F019-05](../../20-features/019-streaming-and-response-presentation-states/F019-05-how-a-turn-ends-completed-partly-done-stopped.md), [F091-04](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md), [F092-03](../../20-features/092-tool-calling-and-agent-loop-components/F092-03-running-tools-in-a-turn.md)
- Requirement items: S13.07, S19.17, S19.18, S91.24, S92.20
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-15

**Fallback to another model at a limit or outage: VS Code does not offer a cheaper model near a limit (V46). Seen: Stop shows a misleading model failed message (W-18).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-12](../../20-features/015-model-selector-interface/F015-12-switch-safety-fallback-and-substitution-notices.md), [F079-04](../../20-features/079-routing-and-model-neutral-orchestration/F079-04-pick-a-model-yourself-and-locks.md), [F079-07](../../20-features/079-routing-and-model-neutral-orchestration/F079-07-health-fallback-and-switch-offers.md), [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Requirement items: S15.33, S79.16, S79.20, S91.22
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-model-selection-21

**Model retirement and replacement notices: No retiring notice on mobile, VS Code, Chrome. No older-model toggle (W90).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-08](../../20-features/015-model-selector-interface/F015-08-speed-status-and-plan-labels.md), [F076-13](../../20-features/076-model-capability-registry/F076-13-regions-data-retention-routes-and-model-lifecycle.md), [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Requirement items: S15.20, S76.37, S91.05, S91.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-model-selection-23

**Context window shown per model: Comparison row notes the cited picker is not in web chat; mobile shows plan window only. No long-context variant pick (D15).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F015-07](../../20-features/015-model-selector-interface/F015-07-capability-and-cost-badges.md), [F076-07](../../20-features/076-model-capability-registry/F076-07-context-window-and-output-limits.md), [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Requirement items: S15.15, S76.28, S76.29, S91.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F091-01-01

**Replacement of a retired model is only shown as text on Mobile; no successor is applied, and web and extensions show none that I found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Detail: Affects: Web, Chrome extension, VS Code users with old chats on a retired model.. Work needed: Decide the rule (notice, user-confirmed switch, or refusal) and share one helper across surfaces.
- Evidence: apps/mobile/src/features/model-picker/retirement.ts:30; no web consumer found by grep in apps/web/app and apps/web/lib

## GAP-F091-01-02

**Brief citations for S91.01 and S91.05 point at old line numbers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Detail: Affects: Anyone following the brief.. Work needed: Refresh the brief.
- Evidence: packages/contracts/types/src/model-catalog.ts:1121, :1427

## GAP-F091-01-03

**No evidence that the CLI reads the compiled catalog.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-01](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Detail: Affects: CLI.. Work needed: Read apps/cli model code and record it.
- Evidence: apps/cli not searched for models.json

## GAP-F091-02-01

**Cloud Code clients swap a chosen model that lacks tools, with no notice, though the brief marks exact selection done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-02](../../20-features/091-model-and-inference-components/F091-02-automatic-and-chosen-model-routing.md)
- Detail: Affects: Web, Mobile, VS Code Cloud Code users.. Work needed: Refuse or show a notice; keep one decision in the shared resolver.
- Evidence: packages/contracts/types/src/cloud-code-agent-model.ts:17-24; apps/web/features/code/CloudCodePage.tsx:464

## GAP-F091-02-02

**Client-side resolvers on Mobile and Chrome enable Auto fallback on capability mismatch.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-02](../../20-features/091-model-and-inference-components/F091-02-automatic-and-chosen-model-routing.md)
- Detail: Affects: Mobile, Chrome extension.. Work needed: Confirm whether the resolved model is sent; if so set the flag false for explicit choices.
- Evidence: apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:94; apps/extension/src/features/cloud-bridge/managedChatRouting.ts:55

## GAP-F091-02-03

**Unknown model name is answered as a route-unavailable 422, not a validation error as the draft said.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-02](../../20-features/091-model-and-inference-components/F091-02-automatic-and-chosen-model-routing.md)
- Detail: Affects: API users, all apps.. Work needed: Decide whether to add a 400 validation message for unknown names.
- Evidence: request-processor.ts:4975

## GAP-F091-02-04

**Explicit-selection fallback plan has no route cap.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-02](../../20-features/091-model-and-inference-components/F091-02-automatic-and-chosen-model-routing.md)
- Detail: Affects: All apps on managed cloud.. Work needed: Apply the same cap as Auto or document why not.
- Evidence: packages/ai/routing/src/auto.ts:1506-1513

## GAP-F091-03-01

**Reserved free-turn credential applied in the Anthropic builder only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-03](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)
- Detail: Affects: Promoted free turns on other providers.. Work needed: Confirm promoted turns only run on that provider, or generalise the helper.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:66-74 versus :76-130

## GAP-F091-03-02

**No per-provider table of document, image and strict-schema support was found for providers other than Anthropic.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-03](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)
- Detail: Affects: Engineers and testers.. Work needed: Read each translate file and record support.
- Evidence: packages/ai/providers/anthropic/src/translate.ts:102-135 only read

## GAP-F091-03-03

**Own-key calls through the server path are not shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-03](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)
- Detail: Affects: Own key mode users.. Work needed: Find the own-key call path per app.
- Evidence: provider-adapter-service.ts:117-126 reads only deployment keys

## GAP-F091-04-01

**The half-time warning promised by the first draft is never raised.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-04](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md)
- Detail: Affects: Operators; all apps.. Work needed: Pass hooks from adapters or remove the option.
- Evidence: packages/ai/provider-runtime/src/watchdog.ts:13-20; no caller passes hooks

## GAP-F091-04-02

**No evidence the workers-ai adapter has an idle watchdog.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-04](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md)
- Detail: Affects: Routes on that provider if used.. Work needed: Check the adapter and add the watchdog.
- Evidence: grep found no withStreamIdleWatchdog in packages/ai/providers/workers-ai/src

## GAP-F091-04-03

**Brief's cancellation citation (route.ts:521) is wrong.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-04](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md)
- Detail: Affects: Readers.. Work needed: Update brief to stream-transform.ts:939 and provider-deadlines.ts:86.
- Evidence: route.ts:521-560 is secret handling

## GAP-F091-05-01

**The 10-retry rule in the brief is not on the live chat path; withRetry has no production caller.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Detail: Affects: Operators and testers expecting 10 retries.. Work needed: Wire it, delete it, or correct the brief and the product statement.
- Evidence: packages/ai/provider-runtime/src/retry.ts:9, :77; grep found no non-test caller

## GAP-F091-05-02

**Explicit-model fallback plan is not capped at 4 routes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Detail: Affects: Pinned model requests.. Work needed: Add a cap or document it.
- Evidence: packages/ai/routing/src/auto.ts:1506-1513 versus :1620

## GAP-F091-05-03

**Brief cites request-processor.ts:1665 for route health; that line is a type field, the writes are in route.ts and runtime-state-service.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-05](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Detail: Affects: Readers.. Work needed: Update brief.
- Evidence: request-processor.ts:1640-1670

## GAP-F091-06-01

**Oversized protected instructions are sent whole with a warning, not reported to the person or refused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Detail: Affects: Cloud chats on all apps.. Work needed: Decide refuse or alert operators; add a test for the user-visible result.
- Evidence: context-window.ts:237-245

## GAP-F091-06-02

**Dense-script floor is only applied to the latest user message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Detail: Affects: CJK users with long history.. Work needed: Apply to all messages or document why not.
- Evidence: context-window.ts:102-120

## GAP-F091-06-03

**Token counts are an estimate from a character ratio.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Detail: Affects: Accuracy near the window limit, all apps.. Work needed: Measure estimator error per provider against real usage numbers.
- Evidence: packages/ai/routing/src/classify.ts:113-125

## GAP-F091-06-04

**Estimator and budget helper live in a web composer file but are used by the server.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-06](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Detail: Affects: Maintainers.. Work needed: Move to a shared package.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:7-11

## GAP-F091-07-01

**CPST outcome never reports success and verifier result is always skipped.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-07](../../20-features/091-model-and-inference-components/F091-07-usage-cost-and-telemetry.md)
- Detail: Affects: Operators on web Cloud. Work needed: Add a success signal and a verifier seam.
- Evidence: apps/web/lib/cpst-telemetry.ts:35-42

## GAP-F091-07-02

**Successful non-stream trace outcome has no latency or cost.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-07](../../20-features/091-model-and-inference-components/F091-07-usage-cost-and-telemetry.md)
- Detail: Affects: Rollout evaluation (cost and latency alerts) for non-stream turns. Work needed: Pass ttft, duration and cost to persistRoutingDecisionOutcome.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:266

## GAP-F091-07-03

**Pending trace state is per-process memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-07](../../20-features/091-model-and-inference-components/F091-07-usage-cost-and-telemetry.md)
- Detail: Affects: Multi-instance web deployments. Work needed: Make completion not depend on process memory.
- Evidence: apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:98

## GAP-F091-07-04

**Telemetry for Local and own-key modes and the five non-web apps is not part of this feature as found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-07](../../20-features/091-model-and-inference-components/F091-07-usage-cost-and-telemetry.md)
- Detail: Affects: Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Establish what each app records and where.
- Evidence: Not read

## GAP-F091-08-01

**Traffic-fraction prompt rollout has no production caller.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-08](../../20-features/091-model-and-inference-components/F091-08-prompt-versions-and-prompt-caching.md)
- Detail: Affects: Operators on web. Work needed: Wire release-ledger canary records into resolvePrompt options, or remove the unused path.
- Evidence: apps/web/lib/prompts/prompt-registry.ts:37-47 vs no non-test caller

## GAP-F091-08-02

**Cache diagnostics are only in the admin Costs tab, last 24 hours by default.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-08](../../20-features/091-model-and-inference-components/F091-08-prompt-versions-and-prompt-caching.md)
- Detail: Affects: Operators. Work needed: Optional longer windows and per-prompt-stamp view.
- Evidence: apps/web/lib/services/route-cache-observability-service.ts:6

## GAP-F091-08-03

**Cache behaviour on non-web apps and Local mode not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-08](../../20-features/091-model-and-inference-components/F091-08-prompt-versions-and-prompt-caching.md)
- Detail: Affects: Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Read each app's request builder.
- Evidence: Not read

## GAP-F091-09-01

**No automatic gate: results only alert a human.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-09](../../20-features/091-model-and-inference-components/F091-09-model-evaluation-and-rollout-gate.md)
- Detail: Affects: Operators; any rollout. Work needed: Decide whether the brief's 'gates rollout' requires an enforced block, then connect promotion tooling.
- Evidence: apps/web/app/api/cron/evaluate-model-rollout/route.ts:126

## GAP-F091-09-02

**Quality is failure rate only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-09](../../20-features/091-model-and-inference-components/F091-09-model-evaluation-and-rollout-gate.md)
- Detail: Affects: Operators. Work needed: Add answer-quality evidence.
- Evidence: apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:111

## GAP-F091-09-03

**Benchmark rows have no purge in the code read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-09](../../20-features/091-model-and-inference-components/F091-09-model-evaluation-and-rollout-gate.md)
- Detail: Affects: Database size. Work needed: Confirm retention and add if needed.
- Evidence: purge function only targets routing traces (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:243)

## GAP-F091-09-04

**Latency for non-stream successes is not recorded on traces, so p50 uses duration or ttft only when set.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-09](../../20-features/091-model-and-inference-components/F091-09-model-evaluation-and-rollout-gate.md)
- Detail: Affects: Latency alerts. Work needed: Record latency on those outcomes.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts:266

## GAP-F091-10-01

**The whole coordinator is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-10](../../20-features/091-model-and-inference-components/F091-10-batch-and-deferred-inference.md)
- Detail: Affects: All six apps and all modes. Work needed: Owner decision, a product spec under docs/specs, jobs table, adapter methods, metering and a UI or API.
- Evidence: S91.30 status 'platform missing'

## GAP-F091-10-02

**The catalog has no batch-price field.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F091-10](../../20-features/091-model-and-inference-components/F091-10-batch-and-deferred-inference.md)
- Detail: Affects: Cost accounting for any future batch. Work needed: Add a field and regenerate the catalog.
- Evidence: packages/ai/model-registry/catalog/models.curation.json:135 note
