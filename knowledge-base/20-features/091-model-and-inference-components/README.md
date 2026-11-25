---
id: "AREA-091"
type: "area"
title: "Model and inference components"
features: ["F091-01", "F091-02", "F091-03", "F091-04", "F091-05", "F091-06", "F091-07", "F091-08", "F091-09", "F091-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 91. Model and inference components

This area is the server side that turns a chat, agent or coding request into a call to one AI model. It picks the model and the route to it, sends the request in each provider's own format, handles slow, failed or overloaded calls, and records what happened. A person gets answers from the right model without knowing which provider served them, and the account is charged for usage that is measured here.

**Who uses it.** Every signed-in user who sends a chat or agent turn reaches this code, on whatever plan they have. Some parts apply only to some plans: model access is checked against the plan tier, and free-tier turns take a separate path. Operators see cache, cost and rollout numbers in admin views. Developers change the catalog, adapters and routing. The brief does not say which parts are limited to paid plans beyond those checks.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F091-01](F091-01-model-catalog-providers-and-lifecycle.md) | Model catalog, providers and lifecycle | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-02](F091-02-automatic-and-chosen-model-routing.md) | Automatic and chosen model routing | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-03](F091-03-provider-calls-and-request-translation.md) | Provider calls and request translation | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-04](F091-04-streaming-cancellation-and-time-limits.md) | Streaming, cancellation and time limits | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-05](F091-05-retries-fallback-and-provider-errors.md) | Retries, fallback and provider errors | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-06](F091-06-context-fitting-and-token-counting.md) | Context fitting and token counting | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-07](F091-07-usage-cost-and-telemetry.md) | Usage, cost and telemetry | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-08](F091-08-prompt-versions-and-prompt-caching.md) | Prompt versions and prompt caching | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-09](F091-09-model-evaluation-and-rollout-gate.md) | Model evaluation and rollout gate | n/a | n/a | n/a | n/a | n/a | n/a |
| [F091-10](F091-10-batch-and-deferred-inference.md) | Batch and deferred inference | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/091-model-and-inference-components.md](../../10-requirements/capabilities/091-model-and-inference-components.md).

## How this area works in the code

1. **Request enters the chat endpoint and takes a slot.** The chat endpoint admits the turn through a concurrency slot, then runs the turn body. The slot is released on every exit path. (`apps/web/app/api/llm/v1/chat/completions/route.ts:390-409`)
2. **Access and model check.** The agent route checks managed compute access and then whether the model is on the plan. Cloud Code agent turns pick their model with the agent-model resolver. (`apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:150-170`, `packages/contracts/types/src/cloud-code-agent-model.ts:17-34`)
3. **Turn setup and capability switches.** Connector and capability switches are read per turn. Operator kill switches and the account's policy decide what the product overview lists as on or off. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2268-2276`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2284-2309`)
4. **Usage reservation marked before the provider call.** Managed usage is marked as started before any provider or tool call. If marking fails, the reservation is refunded and the turn stops. (`apps/web/app/api/llm/v1/chat/completions/route.ts:526-545`)
5. **Adapter chosen and credential resolved.** A factory builds the adapter for the chosen provider, with cache settings for that provider. A free-trial promotion can supply its own credential. Server keys come from environment variables; base URLs are checked against an allow-list. (`apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:66-74`, `apps/web/lib/services/provider-adapter-service.ts:117-141`)
6. **Stream started and first chunk checked.** The first chunk is read before streaming to the person. An error there is mapped and thrown; metadata such as request ID and model is put on the span. (`apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:132-201`)
7. **Idle watchdog and first-token deadline.** The stream is wrapped in an idle watchdog that stops after 90 seconds of silence. The first token must arrive before a deadline set from the turn's time left. (`packages/ai/provider-runtime/src/watchdog.ts:1`, `packages/ai/provider-runtime/src/watchdog.ts:24-60`, `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:45-70`)
8. **Failure: retry, fallback or give up, then record outcome.** Retries use exponential backoff from 500 ms to 32 s. A fallback re-targets the same messages to another model; the auto-router builds up to 4 fallback routes. Outcomes are recorded for route health. Failed usage is refunded. (`packages/ai/provider-runtime/src/retry.ts:9-13`, `packages/ai/provider-runtime/src/retry.ts:77-100`, `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:330-384`, `packages/ai/routing/src/auto.ts:1575-1621`, `apps/web/app/api/llm/v1/chat/completions/route.ts:363-388`)
9. **Context fitted before send.** Before a request goes out, content is measured and trimmed. Policy system messages and the latest user message are protected from cutting. (`apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:37-95`)
10. **Benchmarks and alerts on a schedule.** A scheduled job reads cohort metrics for a time window, writes benchmark rows, detects cost and quality alerts, and de-duplicates alerts through a key-value store. (`apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:60-77`, `apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:205-245`, `apps/web/app/api/cron/evaluate-model-rollout/route.ts:60-100`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | Chat endpoint: admits turns through a concurrency slot, runs the turn body, marks usage before the provider call, records route outcomes. |
| `apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts` | Builds the provider adapter per provider, sets prompt-cache settings, checks the first stream chunk and maps errors. |
| `apps/web/lib/services/provider-adapter-service.ts` | Resolves server-side provider keys and base URLs from environment values and builds the adapter. |
| `packages/ai/routing/src/auto.ts` | Auto routing: builds the fallback plan (max 4 routes) and checks price and eligibility. |
| `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` | Re-targets a turn to a fallback model and builds the failover attempt view. |
| `packages/ai/provider-runtime/src/retry.ts` | Retry loop with backoff, overload limit and fallback decision. |
| `packages/ai/provider-runtime/src/watchdog.ts` | Stream idle watchdog (90 s default, warning at half). |
| `packages/contracts/types/src/cloud-code-agent-model.ts` | Chooses the model for cloud coding agent turns; this is where a selected model can be replaced. |
| `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts` | Context budget: protects policy and latest user messages from trimming, reports overflow. |
| `apps/web/lib/services/model-rollout/rollout-evaluation-service.ts` | Writes rollout benchmark rows and raises cost and quality alerts with de-duplication. |

## What is stored

- Rollout benchmark rows (model, lifecycle stage, slot, cohort, window, sample count, failure rate, latency p50/p95, cost per request): Database table public.model_rollout_benchmarks (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:226-236)
- Alert de-duplication claim keys with a time-to-live: Key-value store via getKeyValueStore (apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:60-70)
- Routing decision traces, purged after expiry: Purged by purgeExpiredRoutingTraces called from apps/web/app/api/cron/evaluate-model-rollout/route.ts (store not read)
- Managed usage reservation and provider-started mark: Managed usage billing store, written through markManagedUsageProviderStarted (apps/web/app/api/llm/v1/chat/completions/route.ts:529-534); store not read
- Provider keys and base URLs: Deployment environment variables read through getOptionalEnv (apps/web/lib/services/provider-adapter-service.ts:117-131); not stored by this code
- Prompt definitions and versions: In code: apps/web/lib/prompts/prompt-registry.ts (resolvePrompt)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Plan model access**: A model not in the plan is refused with model_not_available; agent turns check the same rule. (apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:169-170; packages/contracts/types/src/cloud-code-agent-model.ts:32)
- **Managed compute access gate**: Blocks cloud turns for accounts that lack access, before any model call. (apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:156-166)
- **Operator kill switch**: Turns off product capabilities per flag subject; unreadable state lists capabilities as shipped. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2292-2305)
- **Temporary chat flag**: A temporary chat is not saved and does not reach prompt caching. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2340-2341)
- **Provider key and base URL environment values**: Choose which key a provider call uses and where it goes; a bad base URL is ignored. (apps/web/lib/services/provider-adapter-service.ts:117-141)
- **Prompt canary traffic fraction**: Share of requests that get a staged prompt version. (apps/web/lib/prompts/prompt-registry.ts (rolloutVersion, around line 70-75))
- **Rollout evaluation window**: Time window used by the scheduled evaluation. (apps/web/app/api/cron/evaluate-model-rollout/route.ts:85 (resolveRolloutEvaluationConfig))
- **Cron authorisation**: Only authorised scheduled calls run the rollout evaluation; others get 401. (apps/web/app/api/cron/evaluate-model-rollout/route.ts:80)
- **Cloud Code agent routing slot**: Fixed routing slot used to pick the coding model for agent turns. (packages/contracts/types/src/cloud-code-agent-model.ts:11)
- **Stream idle timeout**: Stream stops after this many ms of silence (default 90 000). (packages/ai/provider-runtime/src/watchdog.ts:1, 28)
- **Retry limits**: Maximum retries, overload retries, base delay and backoff cap. (packages/ai/provider-runtime/src/retry.ts:9-13)
- **Fallback limits**: Maximum fallback routes (4) and same-model fallbacks before a model is substituted (2). (packages/ai/routing/src/auto.ts:757, 764)
- **Anthropic-style prompt cache config**: Turns prompt caching on or off and sets its retention for one provider. (apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:67, 102)

## Shared between apps

Shared: the model catalog and contract types (packages/contracts/types/src, including cloud-code-agent-model.ts, which the web, mobile and VS Code code all import); routing (packages/ai/routing); provider runtime (packages/ai/provider-runtime: retry, watchdog); provider protocol (packages/ai/provider-protocol). The server chat endpoint under apps/web/app/api/llm is the one place provider calls are made, so every app reaches inference through it. Separate per app: the UI that chooses and sends the model (web Cloud Code page apps/web/features/code/CloudCodePage.tsx, mobile apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx, VS Code apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts). The brief lists server items only.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Selected model is silently replaced for Cloud Code agent turns, which the brief's S91.23 says must never happen. The resolver returns a different model when the selected one has no tool support, and the web page sends that resolved model to the agent endpoint. (packages/contracts/types/src/cloud-code-agent-model.ts:21-34; apps/web/features/code/CloudCodePage.tsx:464-466 and 956)
- Mobile Cloud Code session screen uses the same resolver, so the same replacement happens there. (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:244)
- Resolver's final fallback returns the plan's default chat model without checking that it can run agents. The candidate list is filtered for tool support, but the fallback is not. (packages/contracts/types/src/cloud-code-agent-model.ts:25-34)
- Batch and deferred inference coordinator is missing (S91.30). A search of the chat endpoint, routing and provider code found no such coordinator; the batch-named code that exists is for other features. (apps/web/app/api/llm/v1/chat/completions (no coordinator found); apps/web/lib/services/free-lane/runtime-state-service.ts:360 and apps/web/app/api/cron/sweep-chat-file-intakes/route.ts:43 are unrelated batch code)

## Not established

- Local and own-key paths: the brief covers Cloud only; I did not establish how Local or own-key turns reach these modules.
- Client model picker code (how Auto and explicit choices are stored and shown): not read.
- Catalog files named in the brief (model-catalog.ts lines 89, 124, 130, 1340, 1367, 1394, 1594, 1632; compile.mjs; lifecycle-stages.mjs) were not opened, so the statements about the catalog are from the brief, not from the code I read.
- Retry-After ceiling and per-model same-route retry budget (S91.26): I saw the retry constants and loop but not the Retry-After handling.
- Route health store (packages/ai/routing/src/route-health-store.ts) and how its data feeds routing: not read.
- Telemetry Should (spans, usage, cost, route, latency, outcome) was checked only by the brief's paths; I did not open span.ts, cpst-telemetry.ts or the routing trace service.
- Cache diagnostics panel (OperatorCostsPanel.tsx) and its data: not read.
- Whether the user sees a notice when a model is replaced in the cloud agent flow (CloudCodePage.tsx around line 2818): not established.
- Where the usage numbers reach a person's plan meter: outside this brief.
- Temporary-chat behaviour beyond the flag at request-processor.ts:2340: not traced.
- No builds, tests, servers or installs were run; this is code reading only, so no localhost or single-surface testing was done.
