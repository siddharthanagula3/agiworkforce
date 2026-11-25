# Area 91. Model and inference components

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S91.01 Model registry.
- Should: One compiled model registry is the source every surface and the server read for model facts.
- Status: platform done
- Code: packages/contracts/types/src/model-catalog.ts:1367; packages/ai/model-registry/scripts/compile.mjs:4

## S91.02 Provider registry.
- Should: A provider registry records each provider (display, defaults, governance, hosts).
- Status: platform done
- Code: packages/contracts/types/src/model-catalog.ts:1594; packages/contracts/types/src/model-catalog.ts:1632

## S91.03 Provider-route registry.
- Should: A provider-route registry records every model x provider route with harness, trust modes, retention, cache class and price.
- Status: platform done
- Code: packages/contracts/types/src/model-catalog.ts:89; packages/ai/routing/src/auto.ts:1363

## S91.04 Capability registry.
- Should: A capability registry records intrinsic and route-dependent capabilities per model.
- Status: platform done
- Code: packages/contracts/types/src/model-catalog.ts:124; packages/contracts/types/src/model-catalog.ts:130

## S91.05 Model alias resolution.
- Should: Model aliases resolve to canonical model ids everywhere.
- Status: platform done
- Code: packages/contracts/types/src/model-catalog.ts:1340

## S91.06 Model lifecycle management.
- Should: Model lifecycle (stage, deprecation, retirement, replacement) is managed and enforced.
- Status: platform done
- Code: packages/ai/model-registry/scripts/lifecycle-stages.mjs:27; packages/contracts/types/src/model-catalog.ts:1394; packages/ai/routing/src/auto.ts:1302

## S91.07 Inference request coordinator.
- Should: One coordinator admits, routes, meters and dispatches each inference request.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/route.ts:359; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2268

## S91.08 Provider adapter interface.
- Should: Providers implement a common adapter interface selected by a factory.
- Status: platform done
- Code: packages/contracts/types/src/provider-adapter.ts:577; apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:13

## S91.09 Provider credential broker.
- Should: A credential broker supplies each adapter with the right server credential per provider.
- Status: platform done
- Code: apps/web/lib/services/provider-adapter-service.ts:111

## S91.10 Request translation.
- Should: Canonical requests are translated into each provider wire format.
- Status: platform done
- Code: packages/ai/providers/anthropic/src/translate.ts:266; apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:122

## S91.11 Multimodal input translation.
- Should: Images and documents are translated into each provider multimodal format.
- Status: platform done
- Code: packages/ai/providers/anthropic/src/translate.ts:98; apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:450

## S91.12 Tool-schema translation.
- Should: Tool schemas are translated per provider (including strict-schema normalisation).
- Status: platform done
- Code: packages/ai/providers/anthropic/src/translate.ts:210; packages/ai/provider-protocol/src/openai-tool-schema.ts:9

## S91.13 Structured-output translation.
- Should: Structured-output requests are translated to each provider native structured-output feature.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:155; packages/ai/model-registry/catalog/harnesses.json:230; packages/ai/model-registry/catalog/harnesses.json:291; packages/ai/model-registry/catalog/harnesses.json:314; packages/ai/model-registry/catalog/model-routes.json:489; packages/ai/model-registry/scripts/compile.mjs:1159; packages/ai/model-registry/catalog/models.curation.json:343; packages/ai/model-registry/catalog/models.curation.json:349

## S91.14 Streaming normalization.
- Should: Provider streams are normalised into one stream-chunk format.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:835; packages/ai/provider-protocol/src/index.ts:19

## S91.15 Provider-error normalization.
- Should: Provider errors are normalised into classified upstream errors.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/adapter-errors.ts:85

## S91.16 Usage extraction.
- Should: Token usage (input, output, cache, reasoning) is extracted from each provider response.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/adapter-usage.ts:19

## S91.17 Token estimation/counting.
- Should: Tokens are estimated per model before a request is sent.
- Status: platform done
- Code: packages/ai/routing/src/classify.ts:75

## S91.18 Context-budget resolver.
- Should: A context-budget resolver decides what fits in the model window and what is trimmed or compacted.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:170

## S91.19 Model router.
- Should: A model router resolves Auto and explicit selections to a model and route.
- Status: platform done
- Code: packages/ai/routing/src/auto.ts:1592

## S91.20 Task classifier.
- Should: A task classifier labels each request for routing.
- Status: platform done
- Code: packages/ai/routing/src/classify.ts:99; packages/ai/routing/src/task-family.ts:173

## S91.21 Route health monitor.
- Should: Route health is observed and fed back into routing.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1665; packages/ai/routing/src/route-health-store.ts:46

## S91.22 Fallback coordinator.
- Should: A fallback coordinator plans and executes provider failover.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:347

## S91.23 Exact-selection enforcement.
- Should: An explicitly selected model is enforced end to end (never silently replaced).
- Status: platform done
- Code: apps/web/app/api/code/sessions/[sessionId]/agent/route.ts:169; apps/web/features/code/CloudCodePage.tsx:177; packages/contracts/types/src/cloud-code-agent-model.ts:17

## S91.24 Cancellation propagation.
- Should: Client cancellation is propagated to the provider call.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/route.ts:521

## S91.25 Request deadline management.
- Should: Requests carry first-token and stream deadlines.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:57; packages/ai/provider-runtime/src/watchdog.ts:26

## S91.26 Retry management.
- Should: Retries are managed with backoff, Retry-After ceilings and per-model same-route retry budgets.
- Status: platform done
- Code: packages/ai/provider-runtime/src/retry.ts:77; apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:430

## S91.27 Prompt/template registry.
- Should: Prompts are versioned in a registry and resolved by id and version.
- Status: platform done
- Code: apps/web/lib/prompts/prompt-registry.ts:75; apps/web/lib/prompts/prompt-manifest.ts:27

## S91.28 Prompt caching.
- Should: Prompt caching is applied where routes support it and suppressed for private turns.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1857; packages/ai/provider-protocol/src/anthropic-payload-policy.ts:103

## S91.29 Cache diagnostics.
- Should: Operators can see cache hit rates and cache token usage per route, model and tenant.
- Status: platform done
- Code: apps/web/lib/services/route-cache-observability-service.ts:133; apps/web/features/admin/components/OperatorCostsPanel.tsx:260

## S91.30 Batch/deferred inference coordinator.
- Should: A coordinator submits and tracks batch/deferred inference jobs.
- Status: platform missing

## S91.31 Inference telemetry.
- Should: Each inference emits telemetry (spans, usage, cost, route, latency, outcome).
- Status: platform done
- Code: apps/web/lib/observability/span.ts:76; apps/web/lib/cpst-telemetry.ts:52; apps/web/lib/services/model-rollout/routing-decision-trace-service.ts:44

## S91.32 Model evaluation service.
- Should: A model evaluation service scores models/cohorts and gates rollout.
- Status: platform done
- Code: apps/web/lib/services/model-rollout/rollout-evaluation-service.ts:217; apps/web/app/api/cron/evaluate-model-rollout/route.ts:72
