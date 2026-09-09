# Model routing and economics: the whole system, as built and as intended

Status: Current
Owner: Fable (architect), founder decides the gated items in §6
Last updated: 2026-09-06

The founder's direction on 2026-09-06, in one sentence: the user buys a model
at its official price in AGI Credits, the company buys the compute from
whichever host serves that model cheapest, and an enterprise's zero-retention
guarantee is never traded for that saving. This document reads every layer
that decides a request's model, route, price and bill, states what each does
today with the file that proves it, names the gaps against that direction, and
fixes the target design and the order of work. Nothing below is asserted
without a file; anything unverified is marked so.

Companion documents: `provider-routing.md` (the routing contract in prose),
`execution-plan-contract.md` (CPST and the staged rollout),
`../research/unit-economics-2026-09-05.md` (margin per usage profile),
`../decisions/2026-09-05-living-decision-model.md` (D-16 developer versus
provider, D-17 list price billing).

## 1. The thesis

1. **The user chooses intelligence; the product manages compute.** A user
   picks Auto or a model. Which host executes it, at what price, is the
   company's decision and the company's saving.
2. **Hard policy precedes economics.** Workspace model policy, commercial
   status, trust mode, harness reachability, lifecycle, zero data retention
   and required capabilities admit a route. Only then do health, credentials
   and cost rank the survivors. A cheaper route never widens admission.
3. **A price the ledger promises is a ceiling the route enforces.** A
   marketplace route is priced at a guaranteed ceiling (a minimum-discount
   request field, an OpenRouter `max_price`, a waterfall ceiling), never at an
   observed discount.
4. **Billing follows the model, cost follows the route.** The user is billed
   the model's official price on its own developer's route; the served route's
   price is the cost of goods on the same ledger event; the difference is the
   margin the operator dashboard reports.
5. **One unit for the user: AGI Credits, fifty to the dollar.** Dollars appear
   only where real money moves (plan price, invoices, top-up purchase).
6. **Nothing free is assumed commercial, and nothing "zero retention" is
   assumed.** Every free pool and every retention class is a sourced, dated
   record, and an unknown resolves to ineligible.

## 2. The pipeline as built

Each stage names its owner file. "Flag" means the behaviour exists and is off
by default.

| Stage                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Where                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog and registry     | Hand-curated models with a developer, one default route and additional routes per host; harnesses that name a provider package or a gateway definition; gateways with env names, host, governance and an optional discount policy; provider governance (retention, training, cache billing); family slots that pin which generation of a family is live; lifecycle stages; the Auto policy. Compiled into one registry for TypeScript and a Rust mirror.                                                                                                                                | `packages/ai/model-registry/catalog/*.json`, `scripts/compile.mjs`, `generated/registry.json`, `crates/agiworkforce-model-registry`                                                                    |
| Task classification      | Regex, length, attachment and sticky-mode heuristics produce one of eleven task types with a confidence. The design names a model-backed fallback under 0.6 confidence; the web path calls only the local classifier.                                                                                                                                                                                                                                                                                                                                                                   | `packages/ai/routing/src/classify.ts`, `request-processor.ts` around line 2420                                                                                                                         |
| Lane                     | Tier normalises to free, pro, max, enterprise or byok (Basic folds into free, Team into pro). Each tier has a maximum profile and an allow-list of slots. Auto computes its profile per task: simple chat to economy; coding, reasoning, agentic and computer use to premium; everything else balanced, then clamps to the tier ceiling.                                                                                                                                                                                                                                                | `auto.ts` `resolveRoutingLane`, `catalog/routing-policies.json`                                                                                                                                        |
| Continuity               | A continuing conversation keeps its model when it is still eligible and affordable; escalation happens only on a failure signal (D-2026-09-05-06). The served route is remembered per conversation for prompt-cache affinity and may win over a cheaper route up to 1.25 times its cost.                                                                                                                                                                                                                                                                                                | `auto.ts` `rankRoutes`, `getServedRouteAffinity` in the request processor                                                                                                                              |
| Admission                | Per model: lifecycle, tier slot gate, US-only policy, capability, context. Per route: workspace policy on both the developer and the transport, commercial status (experimental routes never serve managed traffic), selectable and live, harness allow-list from the runtime profile, zero data retention (zero-retention routes, conditional routes whose harness honours the requirement per request, or an operator override set), required harness features. Routes without a credential are dropped when any credentialed route exists.                                           | `auto.ts` `routeAdmissionRejections`, `evaluateEligibility`                                                                                                                                            |
| Ranking                  | Healthy first, credentialed first, then the observed penalty (failure and latency bands, flag; unhonoured capability, always), then expected cents from the route's registry price sheet with a warm-cache discount for the affinity route, then the default route, then route id for determinism.                                                                                                                                                                                                                                                                                      | `auto.ts` `rankRoutes`, `routeExpectedCents`                                                                                                                                                           |
| Stages over the resolver | Task family: twelve structural families with quality floors that reorder the admitted slots cheapest-above-floor (flag). Free lane: a filter that may strand, admitting only pools with verified, unexpired, terms-checked, hard-stopping free capacity, ranked by headroom.                                                                                                                                                                                                                                                                                                            | `task-family-routing.ts`, `free-auto.ts`, `apps/web/lib/services/free-lane`, `apps/web/config/free-pools.json`                                                                                         |
| Failover plan            | Same-model routes on other providers first, then other slots, at most four; dispatchable routes ahead of parked ones. Canary and shadow slots (flag).                                                                                                                                                                                                                                                                                                                                                                                                                                   | `auto.ts` `buildProviderFallbacks`                                                                                                                                                                     |
| Reservation              | Estimate at the model's list price (D-17), check the rolling five-hour, weekly and flagship ceilings and the credit balance, reserve with an idempotency key. Plan allowances are converted from internal usage units at two units per cent.                                                                                                                                                                                                                                                                                                                                            | `request-processor.ts` around line 3190, `managed-usage-request-service.ts`, `apps/web/lib/server/managed-usage-policy.ts`                                                                             |
| Dispatch                 | Provider packages for first-party hosts; one declarative gateway adapter for OpenAI-compatible and Anthropic-compatible hosts, which sends the gateway's minimum-discount field on every request and validates the env base URL against the registry host. OpenRouter requests sort providers by price, carry the registry route price as `max_price`, deny data collection and set `zdr` for a zero-retention workspace, and pin the warm provider for cache affinity. Gateway routes are admitted and registered only when `AGI_ROUTING_GATEWAY_ROUTES=1` and both env names resolve. | `packages/ai/providers/factory/src/gateway.ts`, `packages/ai/providers/openrouter/src/provider-routing.ts`, `apps/web/lib/services/gateway-routing.ts`, `adapter-providers.ts`, `canonical-request.ts` |
| Runtime failover         | Rotate before the first byte on availability failures, rate limits, quota exhaustion and empty responses; never on billing exhaustion, safety or content blocks; a credential rejection skips that provider's other routes; a request carrying provider-native tool definitions rotates only within its provider. One reservation spans all attempts.                                                                                                                                                                                                                                   | `managed-failover.ts`                                                                                                                                                                                  |
| Health                   | Three breaker scopes (route, provider, credential) with a profile per credential class (API key, session token, local runtime); a shadow scope that ranking cannot read; capability health that records a route that stopped honouring tools; an unfunded credential parks its routes.                                                                                                                                                                                                                                                                                                  | `route-health-store.ts`, `breaker-profiles.ts`, `capability-health.ts`                                                                                                                                 |
| Settlement and ledger    | The served route's cost is measured (provider-reported when within the sanity band of the registry estimate, else estimated at the route price); the user is billed the model's list price; the ledger event carries both and the retail figure is the developer route price, so the value multiplier is real margin.                                                                                                                                                                                                                                                                   | `stream-transform.ts`, `response-builder.ts`, `managed-usage-request-service.ts`, `cogs-ledger-service.ts`, `llm-cost-calculator.ts`                                                                   |
| What the user sees       | Credit history, balance and top-ups in credits at fifty per dollar; a usage row labelled by the model, never the route. Plan usage as percentages of rolling windows.                                                                                                                                                                                                                                                                                                                                                                                                                   | `features/settings/sections/BillingSection.tsx`, `api/billing/credit-history/route.ts`, `UsageSection.tsx`                                                                                             |
| What the operator sees   | Route economics table (capabilities, free and production eligibility, zero retention, credential configured), route cache observability with actual versus retail cents, value multiplier, fallback count and latency percentiles, per route, model, user and tenant.                                                                                                                                                                                                                                                                                                                   | `features/admin/components/RouteEconomicsPanel.tsx`, `route-cache-observability-service.ts`                                                                                                            |
| Desktop and CLI          | A second resolver in Rust over the same compiled policy, with runtime profiles per surface and trust mode. Managed-cloud selections resolve to the cloud transport; BYOK and local selections resolve to the surface's own providers. A 1,412-case conformance fixture holds the two resolvers to the same answers for the cases the Rust side can compute.                                                                                                                                                                                                                             | `crates/agiworkforce-model-registry/src/lib.rs`, `apps/desktop/src-tauri/src/core/llm/llm_router.rs`, `apps/cli/src/model_catalog.rs`, `packages/ai/routing/src/__tests__/fixtures`                    |

## 3. Where the money and the risk are today

Ranked by expected effect on margin and on the promises we make, each with
its evidence.

1. **The cheap routes are inert.** Every marketplace and gateway route
   (Cheaper Inference, Experiential Labs, DeepInfra, Together, Novita) ships
   `experimental_only`, which the resolver refuses for managed traffic, and the
   whole gateway path sits behind `AGI_ROUTING_GATEWAY_ROUTES`. The only saving
   live today is price-sorted OpenRouter dispatch and the cheaper first-party
   hosts (Alibaba Model Studio for DeepSeek and Kimi). The gate is by design:
   moving a route to `agi_direct` or `authorized_marketplace` asserts a
   commercial agreement. It is a founder action (§6), not engineering.
2. **The router's cost signal is a static sheet, not a measurement.** Ranking
   uses `route.pricing` from the registry. OpenRouter prices are synced by
   script; every other marketplace price was read by hand on a date. Cheaper
   Inference publishes discounts of 15 to 24 percent on the GPT-5.6 family and
   GPT-6 Astra against a registry minimum of 30 percent, so those routes are
   refused by the gateway on every request until supply qualifies. Experiential
   Labs is priced at the ceiling of its waterfall, so it never wins on price
   and only serves as failover. Neither is wrong, both are blind.
3. **Auto's biggest lever is a single policy line.** `autoProfileByTask` sends
   every coding, reasoning, agentic and computer-use request to the tier's
   premium profile. The unit economics doc measures this as the largest
   single margin lever (57 dollars a month on the automated profile). The
   task-family stage that would replace it with cheapest-above-a-quality-floor
   is built, tested and off, and its shadow mode (Stage 1) is not built because
   the decision is computed and dropped rather than recorded.
4. **Two units, one word.** Plan allowances are internal usage units at two
   per cent (200 to the dollar); top-ups and now the ledger display are credits
   at fifty to the dollar. Users never see the internal unit, so nothing is
   wrong on screen, but two engineers will eventually disagree about what "a
   unit" is. One name and one rate should survive.
5. **Two resolvers, one policy.** The Rust resolver already lacks budget and
   capability fields and two unavailable codes (OQ-1 in the execution plan
   contract). Every stage added on the TypeScript side (task family, free lane,
   observed health, canary) widens the gap. Desktop and CLI hand managed-cloud
   turns to the cloud transport anyway, so the Rust resolver decides only
   local and BYOK routes.
6. **Free capacity is all unverified.** All eight free-pool entries carry
   `verifiedAtMs: null`; six are Alibaba allocations whose console switch
   allows billing past the allowance. The free lane therefore admits nothing.
   The plan tier that most needs it (Free) runs on the paid budget system with
   a zero ceiling.
7. **Enterprise zero retention is correct but narrow.** A conditional-retention
   route is admitted only when its harness honours the requirement per
   request, which today is OpenRouter alone (`data_collection: deny` plus the
   strict `zdr` flag). Experiential Labs has an organisation-wide require-ZDR
   control the founder can turn on, after which its governance can move to
   zero retention; Cheaper Inference's own layer is zero retention but every
   upstream rung's policy applies per model and is unrecorded.
8. **Dormant design.** Observed health ranking, canary and shadow, task
   families, gateway routes and the free lane are all behind flags. That is
   the right way to land them, but a flag that is never turned on is a design
   that never shipped. Each needs an exit criterion and a date.
9. **The classifier is the weakest input.** Regex heuristics at a documented
   75 to 85 percent accuracy decide the task type that gates capabilities,
   harness features and the profile. The model-backed fallback the design
   names is not wired on the web path.

## 4. Target architecture

The pipeline in §2 is the right shape. The target changes what feeds it and
what it optimises, not its order.

### 4.1 One price model

- **Customer price** is the model's official price: the price sheet on its
  own developer's route (`LLMCostCalculator.calculateListCost`). It is what the
  reservation estimates, what settlement bills, and what the picker and usage
  screens show, in credits.
- **Route price** is what a host bills us, recorded on every route as a
  ceiling with a source and a date, and enforced per request wherever the host
  offers a control (`min_discount_percent`, `max_price`, a pinned waterfall).
- **Margin** is customer price minus route price on the settled event, already
  reported as the value multiplier. The operator dashboard adds the margin per
  route, per model and per tenant as a first-class column.
- **Credits** are the only user-facing unit, fifty to the dollar. The internal
  usage unit is renamed so no code or document can call both "units", and the
  plan allowance is expressed in credits in the billing catalog.

### 4.2 Route economics as data, refreshed, never typed

- A nightly sync per marketplace writes observed price sheets with
  `verifiedOn` into the catalog the way the OpenRouter sync does: Cheaper
  Inference from its keyless `/public/models`, Experiential Labs from its
  keyless `/api/models` and `/api/models/<slug>` waterfalls. The sync is a
  proposal the compiler checks; it never lowers a ceiling below what the host
  guarantees.
- A gateway's discount policy becomes per route where the host's supply
  differs per model: the minimum percent a route requests is the largest value
  the observed history sustains, and the compiler keeps the list price beside
  it. A route whose observed discount sits under the gateway minimum is
  compiled `parked` with the reason, not left to 503 in production.
- A waterfall gateway (Experiential Labs) is pinned to its cheapest
  platform-funded rung through its waterfall API and priced at that rung. The
  ceiling note records the rung; failover to the next rung is the gateway's
  job, and our route price stays a ceiling because the pinned rung is the
  cheapest.
- The pricing-drift check runs in CI against the synced sheets, and a route
  whose registry price falls under a host's live price is flagged before it
  can refuse traffic.

### 4.3 Ranking objective

Admission is unchanged and stays first. Among admitted routes of a model the
objective is **expected cost to the company for this request**, which is
already the sort key, made honest by §4.2 and extended in three ways:

- **Cache-aware.** The warm-route discount stays; add the route's cache read
  price and the request's known cache-hit history per conversation so a route
  with a cold cache is not ranked as if it were warm.
- **Measured.** Observed health ranking turns on by default once the store has
  two weeks of samples; failure and latency bands already exist. A route's
  measured time-to-first-token joins the tie-break at equal cost.
- **Bounded by quality.** For Auto, the task-family floor (Stage 2) replaces
  the premium-by-task default: the cheapest slot above the family's floor
  wins, escalation is one rung on a failure signal, never sideways. The
  `autoProfileByTask` line stays only as the ceiling for tiers below the floor.

### 4.4 Auto

- **Classification.** Keep the structural task-family classifier as the
  decisive input for floors, and wire the model-backed fallback for the
  prose task type under 0.6 confidence on a cheap, zero-retention route, with
  the result cached per conversation. Record both labels on every settled
  request so CPST joins on one taxonomy.
- **Stage 1 shadow, then Stage 2 live.** Record the task-family decision
  (family, reason code, ordering, ladder) on the settled request; run shadow
  for two weeks; enable live routing family by family behind the gates the
  execution plan contract names, low-risk verifiable families first.
- **Continuity.** Unchanged: pinned by default, escalate on failure, cache
  affinity at up to 1.25 times the cheapest route.
- **Free plan.** The free lane serves Free and Basic only after at least one
  pool is verified with a hard stop; until then Free stays on the paid budget
  with a zero ceiling and an honest upgrade message.

### 4.5 Enterprise and zero data retention

- Admission stays the gate: a route serves a zero-retention workspace only if
  its retention class is zero, or its harness enforces the requirement per
  request, or the operator override names its provider. Cost never enters
  this decision.
- Every gateway records retention at two layers, its own and the upstream
  rung's, and a marketplace route inherits the stricter of the two. Cheaper
  Inference upstream rungs and Experiential Labs waterfall rungs are recorded
  per model from their catalogs' `zero_data_retention` flags, so a workspace
  that requires zero retention can still reach a cheaper host when every rung
  is zero retention.
- Experiential Labs moves to `zero_retention` only after the founder turns on
  the organisation-wide require-ZDR control and the record is re-verified;
  the OpenRouter `zdr` flag is already sent.
- Enterprise contracts bill at API rates on consumption (the observed leader
  shape); the margin on those tenants is the same list-minus-route margin,
  reported per tenant.

### 4.6 One resolver

TypeScript is canonical for every managed-cloud decision; desktop and CLI
already hand managed turns to the cloud transport. The Rust resolver keeps
local and BYOK routing, where none of the live inputs (health, quota, credit,
policy) exist, and stays held to the conformance fixture for the static cases.
No new stage is added to Rust; OQ-1 closes with that split recorded.

### 4.7 Flags become defaults on a schedule

| Flag                            | Exit criterion                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AGI_ROUTING_GATEWAY_ROUTES`    | Founder confirms terms for one gateway; its routes flip to `agi_direct`; one week of settled rows |
| `AGI_ROUTING_OBSERVED_HEALTH`   | Two weeks of route health samples with no capability regression                                   |
| `AGI_ROUTING_TASK_FAMILY_STAGE` | Stage 1 shadow recorded for two weeks with zero trust-boundary disagreements                      |
| `AGI_ROUTING_CANARY`            | A slot declares a canary and the shadow scope shows parity on CPST                                |

## 5. Order of work

Each item ends with the verification that proves it, and none reaches a
managed user before its founder gate in §6 where one applies.

| Order | Work                                                                                                                                                                                                                                                                                                                                                                  | Proof                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| P0    | Landed 2026-09-06: list-price billing with route cost as provider cost; credits on every user-facing amount; usage rows labelled by model; OpenRouter price sort, `max_price` and `zdr`; Experiential Labs and Cheaper Inference routes; Vercel AI Gateway as a managed marketplace with per-request zero retention; Cloudflare Workers AI as an `agi_direct` gateway | Registry, routing and web suites green; web typecheck clean                                       |
| P1    | Record the task-family decision on the settled request and persist the classifier's two labels; add margin per route, model and tenant to the operator dashboard from the existing retail and actual cents                                                                                                                                                            | Rows carry the fields at a measured non-null rate; the dashboard column matches the ledger        |
| P2    | Marketplace price syncs (Cheaper Inference, Experiential Labs) with dated ceilings; per-route discount minimums; a parked state for routes whose observed discount is under the minimum; CI drift check against the synced sheets                                                                                                                                     | A sync run changes only ceilings; the drift check fails on a fabricated rise                      |
| P3    | Rename the internal usage unit and express plan allowances in credits in the billing catalog; one formatter shared by web and mobile                                                                                                                                                                                                                                  | Grep finds one unit name; the billing screen and the mobile top-up card agree                     |
| P4    | Two-layer retention on gateway routes from the hosts' per-model flags; Experiential Labs waterfall pin on the company organisation once funded                                                                                                                                                                                                                        | A zero-retention workspace admits a gateway route only when every recorded rung is zero retention |
| P5    | Wire the model-backed classifier fallback on a zero-retention economy route; Stage 1 shadow for task families; observed health on by default after its window                                                                                                                                                                                                         | Shadow agreement report; CPST baseline per family                                                 |
| P6    | Stage 2 live routing for low-risk families; retire the premium-by-task default where a floor exists                                                                                                                                                                                                                                                                   | Gates in the execution plan contract hold over a full window                                      |

## 6. Founder decisions and actions this depends on

- Confirm commercial terms and fund one account at a time, in the order the
  price data supports: Cheaper Inference (guaranteed discount, zero-retention
  own layer), Experiential Labs (zero markup, waterfall pin, require-ZDR
  control), then DeepInfra, Together, Novita. Each flips its routes to
  `agi_direct` or `authorized_marketplace`.
- Set the Cheaper Inference minimum discount per route or accept a lower
  gateway minimum; today's 30 percent parks the OpenAI and Gemini families.
- Turn on require-ZDR for the company organisation at Experiential Labs before
  any enterprise workspace may reach it.
- Turn on "free quota only" per Alibaba model and record the terms review, or
  the free lane stays empty.
- Confirm the credit unit stays at fifty to the dollar and that plan
  allowances may be restated in credits.
- Decide whether enterprise consumption billing is at list or at a contracted
  discount to list; the ledger supports either, the decision log records
  neither.
