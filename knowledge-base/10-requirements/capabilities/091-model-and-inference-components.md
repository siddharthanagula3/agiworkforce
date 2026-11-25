---
id: "REQ-AREA-091"
type: "requirements"
title: "Requirement items: Model and inference components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 91. Model and inference components

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S91.01

**Model registry.** One compiled model registry is the source every surface and the server read for model facts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-01 Model catalog, providers and lifecycle](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)

## S91.02

**Provider registry.** A provider registry records each provider (display, defaults, governance, hosts).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-01 Model catalog, providers and lifecycle](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)

## S91.03

**Provider-route registry.** A provider-route registry records every model x provider route with harness, trust modes, retention, cache class and price.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-01 Model catalog, providers and lifecycle](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)

## S91.04

**Capability registry.** A capability registry records intrinsic and route-dependent capabilities per model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-01 Model catalog, providers and lifecycle](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)

## S91.05

**Model alias resolution.** Model aliases resolve to canonical model ids everywhere.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-01 Model catalog, providers and lifecycle](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Competitor trace: CAP-model-selection-21

## S91.06

**Model lifecycle management.** Model lifecycle (stage, deprecation, retirement, replacement) is managed and enforced.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-01 Model catalog, providers and lifecycle](../../20-features/091-model-and-inference-components/F091-01-model-catalog-providers-and-lifecycle.md)
- Competitor trace: CAP-model-selection-21

## S91.07

**Inference request coordinator.** One coordinator admits, routes, meters and dispatches each inference request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-03 Provider calls and request translation](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)

## S91.08

**Provider adapter interface.** Providers implement a common adapter interface selected by a factory.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-03 Provider calls and request translation](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)

## S91.09

**Provider credential broker.** A credential broker supplies each adapter with the right server credential per provider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-03 Provider calls and request translation](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)

## S91.10

**Request translation.** Canonical requests are translated into each provider wire format.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-03 Provider calls and request translation](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)

## S91.11

**Multimodal input translation.** Images and documents are translated into each provider multimodal format.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-03 Provider calls and request translation](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)

## S91.12

**Tool-schema translation.** Tool schemas are translated per provider (including strict-schema normalisation).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-03 Provider calls and request translation](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)

## S91.13

**Structured-output translation.** Structured-output requests are translated to each provider native structured-output feature.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-03 Provider calls and request translation](../../20-features/091-model-and-inference-components/F091-03-provider-calls-and-request-translation.md)

## S91.14

**Streaming normalization.** Provider streams are normalised into one stream-chunk format.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-04 Streaming, cancellation and time limits](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md)

## S91.15

**Provider-error normalization.** Provider errors are normalised into classified upstream errors.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-05 Retries, fallback and provider errors](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)

## S91.16

**Usage extraction.** Token usage (input, output, cache, reasoning) is extracted from each provider response.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-07 Usage, cost and telemetry](../../20-features/091-model-and-inference-components/F091-07-usage-cost-and-telemetry.md)

## S91.17

**Token estimation/counting.** Tokens are estimated per model before a request is sent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-06 Context fitting and token counting](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)

## S91.18

**Context-budget resolver.** A context-budget resolver decides what fits in the model window and what is trimmed or compacted.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-06 Context fitting and token counting](../../20-features/091-model-and-inference-components/F091-06-context-fitting-and-token-counting.md)
- Competitor trace: CAP-model-selection-23

## S91.19

**Model router.** A model router resolves Auto and explicit selections to a model and route.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-02 Automatic and chosen model routing](../../20-features/091-model-and-inference-components/F091-02-automatic-and-chosen-model-routing.md)

## S91.20

**Task classifier.** A task classifier labels each request for routing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-02 Automatic and chosen model routing](../../20-features/091-model-and-inference-components/F091-02-automatic-and-chosen-model-routing.md)

## S91.21

**Route health monitor.** Route health is observed and fed back into routing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-05 Retries, fallback and provider errors](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)

## S91.22

**Fallback coordinator.** A fallback coordinator plans and executes provider failover.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-05 Retries, fallback and provider errors](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Competitor trace: CAP-model-selection-15

## S91.23

**Exact-selection enforcement.** An explicitly selected model is enforced end to end (never silently replaced).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-02 Automatic and chosen model routing](../../20-features/091-model-and-inference-components/F091-02-automatic-and-chosen-model-routing.md)

## S91.24

**Cancellation propagation.** Client cancellation is propagated to the provider call.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-04 Streaming, cancellation and time limits](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md)
- Competitor trace: CAP-editing-regeneration-and-branching-11

## S91.25

**Request deadline management.** Requests carry first-token and stream deadlines.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-04 Streaming, cancellation and time limits](../../20-features/091-model-and-inference-components/F091-04-streaming-cancellation-and-time-limits.md)

## S91.26

**Retry management.** Retries are managed with backoff, Retry-After ceilings and per-model same-route retry budgets.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-05 Retries, fallback and provider errors](../../20-features/091-model-and-inference-components/F091-05-retries-fallback-and-provider-errors.md)
- Competitor trace: CAP-editing-regeneration-and-branching-07

## S91.27

**Prompt/template registry.** Prompts are versioned in a registry and resolved by id and version.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-08 Prompt versions and prompt caching](../../20-features/091-model-and-inference-components/F091-08-prompt-versions-and-prompt-caching.md)

## S91.28

**Prompt caching.** Prompt caching is applied where routes support it and suppressed for private turns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-08 Prompt versions and prompt caching](../../20-features/091-model-and-inference-components/F091-08-prompt-versions-and-prompt-caching.md)

## S91.29

**Cache diagnostics.** Operators can see cache hit rates and cache token usage per route, model and tenant.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-08 Prompt versions and prompt caching](../../20-features/091-model-and-inference-components/F091-08-prompt-versions-and-prompt-caching.md)

## S91.30

**Batch/deferred inference coordinator.** A coordinator submits and tracks batch/deferred inference jobs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-10 Batch and deferred inference](../../20-features/091-model-and-inference-components/F091-10-batch-and-deferred-inference.md)

## S91.31

**Inference telemetry.** Each inference emits telemetry (spans, usage, cost, route, latency, outcome).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-07 Usage, cost and telemetry](../../20-features/091-model-and-inference-components/F091-07-usage-cost-and-telemetry.md)

## S91.32

**Model evaluation service.** A model evaluation service scores models/cohorts and gates rollout.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F091-09 Model evaluation and rollout gate](../../20-features/091-model-and-inference-components/F091-09-model-evaluation-and-rollout-gate.md)
