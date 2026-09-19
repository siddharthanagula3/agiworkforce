# Provider Capability Matrix

Status: Current
Owner: Provider/platform
Last updated: 2026-09-19

This matrix is the product contract for routing and UI labels. It records what AGI may claim in Local/BYOK/Managed modes. Provider SDK details can change; surfaces must read capability metadata instead of hardcoding provider assumptions.

Legend: `Yes` means AGI may expose the capability when provider credentials and model metadata allow it. `Partial` means model/endpoint-specific. `Managed only` means the capability must stay behind explicit Managed consent. `No claim` means AGI must not market or imply it without a provider/account contract.

| Route class                            | Responses           | Chat Completions | Reasoning      | Tools   | Native tools | Vision         | Files            | Structured output | Server state | ZDR compatibility                                                                                   |
| -------------------------------------- | ------------------- | ---------------- | -------------- | ------- | ------------ | -------------- | ---------------- | ----------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| OpenAI native                          | Yes                 | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Yes               | Partial      | No claim unless the account contract says so; Local/BYOK defaults keep `store: false`.              |
| Anthropic native                       | No                  | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Yes               | Partial      | No claim unless the account contract says so; prompt-cache and retention settings must be explicit. |
| Google native                          | No                  | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Partial           | Partial      | No claim unless the account contract says so.                                                       |
| xAI native                             | No                  | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Partial           | No           | No claim unless the account contract says so.                                                       |
| OpenAI-compatible providers            | No                  | Yes              | Partial        | Partial | No           | Partial        | No               | Partial           | No           | No claim; strip unsupported Responses/native parameters.                                            |
| Vercel AI Gateway or AGI-managed proxy | Depends on upstream | Yes              | Partial        | Partial | Partial      | Partial        | Partial          | Partial           | Managed only | Managed only; never default for Local or strict BYOK.                                               |
| Local Ollama/LMStudio                  | No                  | Yes              | Model-specific | Partial | No           | Model-specific | Local files only | Partial           | Local only   | Local privacy boundary, not provider ZDR.                                                           |

The harness wiring behind these rules is generated into
[`docs/generated/provider-capability-matrix.md`](../generated/provider-capability-matrix.md).
Routing policy, privacy claims and the ZDR position stay here as prose; they
are not derivable from the catalog.

## Enforcement Rules

- Local and BYOK routes must default to no provider-side storage unless a user explicitly enables a provider feature that requires it.
- OpenAI native routes should prefer Responses only when capability metadata says the model and endpoint support it and privacy defaults are proven by tests.
- OpenAI-compatible providers must use Chat Completions-style payloads unless their metadata explicitly says otherwise.
- Native provider tools must be modeled separately from AGI tools so UI copy can say which system executes the action.
- File upload, generated-file, and Code Interpreter-style features must attach `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` metadata before surfacing in Web/Desktop/Mobile.
- OpenAI Code Interpreter container-file citations are adapted in `@agiworkforce/providers-openai` only after caller-supplied file materialization provides URI, byte count, checksum, privacy mode, provider mode, storage scope, owner, and source context.
- Surfaces show capability labels from shared metadata; they do not infer capabilities from model-name substrings.

## Model identity and serving routes

The whole pipeline, its gaps and the target design are recorded in
[`routing-and-economics-2026-09-06.md`](routing-and-economics-2026-09-06.md);
this section is the contract it builds on.

A canonical model (`models.curation.json`) has one developer, resolved from
`catalog/developers.json`, and one or more serving routes compiled from
`model-routes.json`, `harnesses.json` and `gateways.json`. The developer answers
who trained the model; the route answers where a request executes, at what
price sheet, under which commercial status, data retention and cache class. A
host that serves other developers' models (Groq, OpenRouter, Cheaper Inference,
DeepInfra, Together, Novita, NVIDIA NIM) is never a developer, and Alibaba
Model Studio is the provider that serves Qwen alongside third-party models.

Routing order is fixed: workspace policy, commercial status, trust mode,
harness reachability, lifecycle stage, zero data retention and required
capabilities admit a route; only then do health, credentials and expected cost
rank the survivors. An explicit selection rotates through same-model routes
before any substitution; Auto may change both model and route. Managed traffic
admits models at lifecycle stage `registered` or later; a discovered upstream
model stays internal.

Prices, discounts, quotas and expiries are route metadata: a gateway discount
policy prices its routes at list minus the guaranteed minimum, a promotional
allocation is a quota pool with an expiry in `apps/web/config/free-pools.json`,
and an exhausted allocation is a routing event (`quota_exhausted`), never a
credential failure. The operator Routes tab renders all of it; the chat picker
shows the model, its developer and the routes that can serve it now.

Billing follows the model, cost follows the route. A managed settlement debits
the model's official price, the sheet on its own developer's route
(`LLMCostCalculator.calculateListCost`), and records the served route's price
as provider cost on the same ledger event, so a cheaper host is the company's
saving, never a change in what the user pays. Users see credits, fifty per
dollar, and a usage row is labelled by the model, not the route. On OpenRouter
a managed request sorts providers by price and carries the registry route's
price as `max_price`; a zero-retention workspace also sets `zdr`, and a route
whose retention is conditional is refused for that workspace unless its harness
honours the requirement per request.

## Cost-aware Auto (task-family stage)

Auto resolves a family floor before it resolves a price. `classifyTaskFamily`
labels the request from structural signals only, the family's `qualityFloor` in
`routing-policies.json` partitions the already-admitted slot set into the
candidates that meet the floor and the rest, and only the first group is
reordered. Ordering is by the expected cost of the route each slot's model
would actually dispatch on, so a model whose only routes lack an available
credential carries no price and sinks behind every priced candidate instead of
leading on a price nothing can charge. The authored order breaks ties and
orders anything the floor cannot classify, and the result is always a
permutation of the admitted set, never a narrowing of it.

Difficulty still lifts the floor. Reasoning, coding, agentic, computer-use and
long-context families keep their `balanced` or `premium` minimum band; simple
chat and web-grounded answers may sit on `economy`. A family that authors no
band inherits the band of its own first authored slot. Continuity survives the
stage while the conversation's current model still meets the floor and costs no
more than `CONTINUITY_COST_RATIO_LIMIT` times the cheapest floor-meeting
candidate; past that the cheaper leader takes the turn. A model the user named
explicitly is untouched by all of this.

`AGI_ROUTING_TASK_FAMILY_STAGE` is a kill switch, not a launch switch. Unset
runs the stage; `0`, `false` or `off` restores the authored order everywhere in
one edit. Each resolution carries the decision inputs on
`taskFamilyDecision`: the family, the floor band, every candidate with its
route and expected microUSD, and the slot and route that were taken.

## Proposed semantic assessment for Auto

The [Jev Auto routing proposal](../specs/jev-auto-routing/spec.md) describes a
Managed evaluation step that supplies task requirements to this router. Its
[architecture](../specs/jev-auto-routing/plan.md) preserves deterministic
admission, registry ownership and explicit selections, and defines the Gateway
evaluation transport, cost accounting and rollout evidence. This is a design
proposal; the product does not currently call Jev for model selection.

## Rollout: observed health, region, canary, shadow and the decision trace

Every rollout stage is on by default and withdrawn by a kill switch, because a
stage whose inputs are absent is already a no-op: a route nothing has been
observed about carries no penalty, a slot that declares no canary serves its
promoted model, and a slot that declares no shadow mirrors nothing.
`AGI_ROUTING_OBSERVED_HEALTH`, `AGI_ROUTING_CANARY` and `AGI_ROUTING_SHADOW` are
the operator switches, and the `routing.observed_health`, `routing.canary` and
`routing.shadow` feature flags are the same switches without a deploy.

Observed health now reaches the serving path with the capability the request
actually carries. `capabilitiesInUse` is derived from the turn, tools or a
structured response format, the capability-health store is read for the routes
the first pass named, and only a recorded loss triggers a second resolution, so
a turn with no tools and a fleet with no recorded loss costs nothing.

Region is an admission input, not a ranking one. `region` is the residency
region this deployment processes in, read from the catalog's own governance
record for managed cloud, and a route whose transport publishes a region list
without it is refused. A transport that publishes nothing is admitted: an
unpublished region is an evidence gap rather than a known violation, and the
caller that must be strict about that gap says so with `excludedRouteHosts`.

Canary membership is the request-id hash against the slot's `trafficFraction`
unless a `routing.canary.<slot>` flag exists, in which case that flag's
targeting and percentage ramp decide the cohort. The shadow half runs after the
served answer: the mirrored request is metered as platform cost, recorded under
the shadow scope, capped per slot per day, and its answer is discarded.

Every decision is persisted as a structured trace in `routing_decision_traces`
(0212), completed with the turn's outcome, latency and cost, and deleted on a
bounded window. The hourly `/api/cron/evaluate-model-rollout` compares each
canary and shadow cohort with the promoted model serving the same slot in the
same window, records the result in `model_rollout_benchmarks` per lifecycle
stage, and pages on call through `pageOnCall` when the candidate is worse on
quality, latency or cost.
