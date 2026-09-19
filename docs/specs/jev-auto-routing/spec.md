# Jev-assisted Auto model selection

Status: Proposed architecture; no product implementation or rollout
Owner: Provider/platform owner, with Managed inference and billing owners
Last updated: 2026-09-19

## Outcome

When a user selects Auto, assess the request's semantic requirements with Jev
through Vercel AI Gateway, then let the existing registry-backed router select
the answering model and serving route. Measure whether this improves completed
task quality or cost at acceptable latency. No improvement is claimed yet.

The architecture and interfaces are in [plan.md](plan.md); the implementation
sequence is in [tasks.md](tasks.md). This proposal extends the
[provider routing contract](../../architecture/provider-routing.md) and the
[ExecutionPlan and CPST design](../../architecture/execution-plan-contract.md).
It does not make their unimplemented parts prerequisites for every first slice.

## Scope

The first integration belongs in the Managed chat request processor. Initially,
only explicitly targeted Managed web Auto traffic is eligible. Other clients
that use the same backend can be included through the existing surface rollout
controls after validation. They must not run another evaluator themselves.

Local, on-device, and strict BYOK routing retain their current paths. A hosted
assessment is a data transfer even when its answer is only logged. Managed
eligibility also requires permission to send the selected data to the evaluator's
actual model developer and serving transport under the workspace's restrictions.

Explicit model selections bypass semantic routing. Auto aliases that express an
economy, balanced, or premium preference retain that preference and their tier
ceiling. The initial design changes neither subscriptions nor customer billing.

Excluded from this slice: skill selection, retrieval reranking, enabling tools,
judging task completion, autonomous action authorization, local evaluator
inference, and replacing the Rust router. The developer helper
`scripts/jev-decide.mjs` remains a separate coding-agent workflow.

## Verified starting point

Inspected on 2026-09-19. Links name current owners; proposed symbols in the plan
do not exist yet.

| Concern            | Current implementation                                                                                                                                                                                             | Consequence for this design                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Semantic baseline  | [classify.ts](../../../packages/ai/routing/src/classify.ts) returns `RoutingTaskType` and heuristic confidence                                                                                                     | Jev can improve interpretation; heuristic confidence is not a calibrated trigger         |
| Structural family  | [task-family.ts](../../../packages/ai/routing/src/task-family.ts) derives `TaskFamily` from modes, tools, attachments and lengths                                                                                  | Keep this taxonomy distinct from the semantic task type                                  |
| Selection          | [auto.ts](../../../packages/ai/routing/src/auto.ts) implements admission, profile selection, ordering, continuity and fallbacks                                                                                    | Keep one resolver and its existing hard constraints                                      |
| Quality floor      | [task-family-routing.ts](../../../packages/ai/routing/src/task-family-routing.ts) applies curated floors and cost ordering                                                                                         | A difficulty judgment cannot silently lower a curated floor                              |
| Managed assembly   | [request-processor.ts](../../../apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts) assembles classification, tool intent, policy, budget, health and free-lane results                             | Insert assessment after data-sharing policy is known and before final model selection    |
| Provider interface | [provider-adapter.ts](../../../packages/contracts/types/src/provider-adapter.ts) exposes chat streaming; Gateway also separately exports embeddings                                                                | Evaluation needs its own typed interface and Gateway transport                           |
| Trace              | [routing-trace.ts](../../../packages/ai/routing/src/routing-trace.ts) and [trace service](../../../apps/web/lib/services/model-rollout/routing-decision-trace-service.ts) persist decisions and transport outcomes | Extend the trace; there is no semantic-assessment record today                           |
| Cost               | [COGS ledger](../../../apps/web/lib/services/cogs-ledger-service.ts) has idempotent source references and microUSD columns, but its writer rounds provider cents before conversion                                 | Extend its input/write path to preserve sub-cent evaluator costs, including failed turns |
| Quality evidence   | [tools/evals](../../../tools/evals/README.md) grades downstream outputs and measures usage                                                                                                                         | Extend this harness with semantic routing cases and paired route experiments             |

Older execution-plan rollout notes are not evidence of today's flag defaults.
The task-family stage is currently enabled unless disabled; decision traces and
generator shadow dispatch exist. Semantic routing is new and starts **off**.
The current trace's transport outcome is not a verified task-success label.

## Required behavior

1. Preserve a complete baseline routing input before applying semantic results.
   With the feature off, produce the existing decision without a Jev call.
2. Use a fixed, admitted evaluator route resolved from the registry. Never invoke
   Auto recursively to choose the evaluator.
3. Submit one bounded request with independent questions about semantic task
   type, reasoning demand, and whether the supplied context supports those
   judgments. Retain the complete distributions when provided.
4. Validate the response and apply a versioned, empirically selected confidence
   policy. Abstention, insufficient context, and errors preserve baseline Auto.
   They do not themselves mean that an economy model is adequate.
5. Preserve hard requirements from attachments, actual tool schemas, output
   format, context size, explicit work modes, workspace policy, trust mode,
   entitlements and budget. Jev cannot remove them or enable execution authority.
6. Resolve the answering model with existing policy, observed health and cache
   continuity. Recheck admission before dispatch. A semantic result cannot make
   an unavailable or forbidden route usable.
7. Honor cancellation, a total assessment deadline, bounded input and concurrency,
   and tenant/provider spend limits. Saturation skips optional assessment.
8. Meter all evaluator attempts. Keep raw messages, credentials, file contents
   and tool results out of routing telemetry by default.
9. In shadow mode, the alternative decision cannot change the served request,
   its tools, model label, customer charge, or conversation affinity.
10. Persist the actual served decision and semantic provenance so a rollout can
    be inspected and withdrawn independently of model-family canaries.

## Acceptance evidence

| Gate             | Evidence required                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Compatibility    | Feature-off and skipped requests reproduce baseline decisions; named-model paths make no evaluator call                             |
| Boundaries       | No forbidden Local/BYOK, region, retention, model-developer or transport egress; no widened tool or account permissions             |
| Decision quality | Held-out downstream task results compared with baseline Auto, including confident heuristic mistakes and short difficult requests   |
| Calibration      | Separate tuning and test sets; confidence and score policies evaluated for each affected workload and supported language            |
| Economics        | Total evaluator, generation, retry, escalation and cache-switch costs measured per successful task; unknown success remains unknown |
| Latency          | Added routing delay and end-to-end p50/p95 measured, including timeout and saturation fallback                                      |
| Operations       | Idempotent accounting, cancellation, concurrency bounds, trace completion races and rollback verified                               |

Numerical quality tolerances, latency budgets, sample sizes and confidence
cutoffs are unset until a baseline is measured. A versioned evaluation report
must declare them before a live canary; missing gate values cannot enable one.
Evaluate the three-question design against a task-type-only ablation.

## Decisions and uncertainties

- Task requirements feed the existing router. Direct selection among model IDs
  remains a later experiment requiring current, measured model comparison data.
- Assess eligible turns in a chosen cohort with deterministic skips. Do not use
  the local classifier's confidence alone to decide whether Jev is needed.
- Prefer request-scoped reuse over cross-turn semantic caching initially. A new
  instruction can invalidate the previous task assessment.
- Preserve current family floors initially. Cheaper routing for routine coding,
  for example, requires an evaluated policy change for that workload; a low
  reasoning score alone does not authorize a downgrade.

Jev assessed the architecture alternatives through the developer helper. It
selected requirements-to-router with confidence `0.67`, eligible-turn assessment
with deterministic skips with `0.81`, and the three-question scope with `0.36`.
The last choice was close to task-type-only, which is why it is an explicit
ablation. These are design judgments, not evidence of production effectiveness.

## External interface evidence

Checked 2026-09-19:

- [Vercel evaluation](https://vercel.com/docs/ai-gateway/modalities/evaluation)
  uses the evaluation interface for Choice, Score and Boolean questions;
  Gateway's chat-completions compatibility interface does not provide it.
- [Vercel's Jev announcement](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway)
  identifies the supporting SDK release and provider confidence metadata.
- [AI SDK evaluation](https://ai-sdk.dev/docs/ai-sdk-core/evaluation) specifies
  optional distributions, provider-specific confidence, cancellation and retries;
  the adapter must preserve these distinctions.
- [TypeSafe primitives](https://docs.typesafe.ai/primitives) and
  [confidence](https://docs.typesafe.ai/confidence) distinguish answer shape,
  uncertainty and application-specific thresholds. Questions sharing state
  cannot consume each other's answers.
- [TypeSafe model documentation](https://docs.typesafe.ai/models) and
  [Gateway's listing](https://vercel.com/ai-gateway/models/jev) are discovery
  evidence. Account availability, exact served revision, current route pricing,
  retention and residency still need authenticated route verification.

No authenticated Gateway evaluation or product routing benchmark was run for
this architecture. Provider limits and model identifiers belong in registry
curation, not in this specification.
