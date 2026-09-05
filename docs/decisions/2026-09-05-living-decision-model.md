# Living decision model

Status: Active
Owner: Fable (architect) with the founder
Last updated: 2026-09-05

Every major product or architecture decision is recorded here in one shape: question, evidence,
current implementation, options, decision, why, tradeoff, reversibility, revisit trigger. Early
entries are not permanent truth; the revisit trigger says what evidence reopens them. New entries
go at the top. Model names are omitted by rule; families and slots only.

## D-2026-09-05-10 Tool support loss is learned, not edited

- Question: how the system learns that a model stopped honouring tool calls, and who acts on it.
- Evidence: the system map (docs/architecture/system-map-2026-09-05.md) found the capability flag
  is compile time only, the liveness probe sends no tools, and the governor's withdrawal lasts one
  turn and is never written back; the day's sandbox incident showed a per turn signal exists.
- Current implementation: static capability in the catalog; per turn withdrawal in the tool turn
  governor; route health store tracks errors and latency, not capabilities.
- Options: a catalog edit cadence driven by support tickets; a durable per route capability
  observation in the route health store fed by the governor and ranked by the resolver; a periodic
  probe that sends a trivial tool.
- Decision: the durable observation, with the probe as a cheap second signal; the catalog keeps the
  declared capability and gains an observed field the registry never overwrites by hand.
- Why: routing already ranks by observed health; capability is the same shape of fact.
- Tradeoff: one more state written on the request path; a noisy model can be demoted by its own
  users' prompts, so the threshold is per route per hour, not per call.
- Reversibility: high; the ranking input is optional and defaults to the declared flag.
- Revisit trigger: a vendor publishes machine readable capability status per model.

## D-2026-09-05-09 Model selector shape

- Question: how hundreds of models feel simple on the composer while power users keep control.
- Evidence: both leaders show a few models with an effort or mode control and no catalogue; the
  coding tool the founder pointed at groups a catalogue by provider behind favourites and search;
  the gateway sync added 349 entries in one day and broke every flat rendering it touched; the unit
  economics doc shows two paid tiers buy budget, not a wider model list, which the picker must say.
- Current implementation: a flat list with search, an effort row and capability glyphs; the switch
  dialog was removed in 0c2b851c7; Auto keeps the conversation's model (D-06).
- Options: modes over models only; a provider grouped catalogue as the primary picker; Auto first
  with a short curated list and the catalogue behind a disclosure grouped by provider with search
  and favourites, tier ceilings named inline.
- Decision: the third; every layer reads the registry (family slots for the curated list, provider
  groups for the disclosure, tier ceilings from the billing catalog), so adding a hundred models
  changes the disclosure's contents and nothing on the composer face. Supersedes the deferral in
  D-03; the earlier grouped picker brief is reshaped to this before any UI work starts.
- Why: it is what the evidence and the founder's stated preference both point at, and it is the
  only shape that survives catalog growth without a design change.
- Tradeoff: two clicks to reach a specific synced model; favourites and search make that one.
- Reversibility: medium; the composer face contract is small, the disclosure is a component.
- Revisit trigger: picker open rate and depth telemetry after two weeks of use, or a leader
  shipping a catalogue on the composer face.

## D-2026-09-05-08 Free inference from user connected accounts

- Question: should users connect their own free provider capacity, and how simply.
- Evidence: the OmniRoute clone aggregates about 1.5B free tokens a month across 38 pools for a
  single user proxy, but sixteen of its providers forbid proxying or third party access and several
  are consumer scrapes (docs/research/omniroute-learnings-2026-09-05.md); our terms workbook
  (docs/research/free-inference-tos-workbook-2026-09-01.md) found one clean company pool candidate.
- Current implementation: free lane with a hard terms gate (packages/ai/routing/src/free-auto.ts);
  BYOK on desktop and CLI only; no web key custody by design.
- Options: company pool only; bring your own account with client held keys; web key custody.
- Decision: pending Stage 1 market research on OAuth and account linking mechanisms; the company pool
  keeps the hard terms gate regardless; consumer scrapes and rate limit evasion are out.
- Why: the value is real for users but only under the user's own agreement with the provider.
- Tradeoff: fewer free tokens than a permissive proxy; no exposure to terms breaches.
- Reversibility: high; the lane is a router stage plus a settings surface.
- Revisit trigger: a provider publishes an OAuth or account linking path for third party clients.

## D-2026-09-05-07 Native search gap and grounding cost

- Question: why a run looped searches and where the Google spend came from.
- Evidence: the lead's live run searched 21 times in one turn; the provider had no per turn search
  cap while another provider carried one; tool carrying requests pinned failover to a capped
  provider; grounding is billed per request beyond a monthly pool (ledger 2026-09-05).
- Current implementation: cap from AGI_NATIVE_SEARCH_MAX_USES, stateless search rotates off a capped
  provider, monthly pool counter with priced overflow, one same provider retry, sourced pricing file
  for both search backends (commits 09b1e2f80, 3bb332c19, 9ad957bd0, ea9cc2c4c, e5c0959af).
- Options: leave uncapped; cap per turn; route all search through one backend.
- Decision: cap per turn, pool then the cheaper backend, price every search call in COGS.
- Why: unbounded native search is the only path to dollars at current token volumes.
- Tradeoff: a hard cap can stop a legitimate long research turn; research mode keeps its own limit.
- Reversibility: high; env backed numbers.
- Revisit trigger: provider pricing changes or the pool count proves too low in production.

## D-2026-09-05-06 Auto stays on the conversation's model

- Question: should Auto reroute every message or keep the conversation's model.
- Evidence: the resolver had a tested continuity gate that the web path never fed
  (request-processor.model-continuity.test.ts); a switch resets the provider prompt cache and
  rebills the prefix; leaders route per message or per request without a continuity promise.
- Current implementation: web passes the conversation's model and task type each turn, escalation
  only on a failure signal, a structured log on any pinned switch (3914c1d54, 949b55fb8); desktop Rust
  wiring pending.
- Decision: pinned by default, escalate one rung on failure, never sideways or down.
- Why: cache continuity is money and consistency; quality moves only up.
- Tradeoff: a conversation that started on a small model stays there until something fails.
- Reversibility: high; a router input.
- Revisit trigger: measured cache hit data shows pinning is not the cheaper choice for a task family.

## D-2026-09-05-05 Registry onboarding of gateway catalogs

- Question: how new models and gateways enter the system without app code.
- Evidence: 428 models fetched from a gateway's public endpoint, 79 excluded by the retired and stale
  family deny set, 349 kept, merged additively at compile time; gateways.json plus a factory adapter
  covers OpenAI and Anthropic compatible endpoints (137874204, 5fbce2ad6, ed108d8e6).
- Decision: script owned synced catalogs merged under curated entries; gateways declared in data;
  the integrity guard's deny set applies at sync time.
- Tradeoff: heuristic quality and speed fields on synced entries until evaluated.
- Reversibility: high.
- Revisit trigger: the registry schema gains evaluation driven promotion.

## D-2026-09-05-04 Sign in and sign up shape

- Question: what the auth pages should look like.
- Evidence: measured ChatGPT auth pages (providers first as 52px pills, 32px heading, one switch
  line, muted footer); Claude leads with a provider button and a code step.
- Decision: our own components on the identity port's client hooks, provider catalogue in
  client-runtime, same design on web and the desktop shell (a62853607, 95b3244d3, 9031a173c).
- Reversibility: medium (vendor hooks isolated in one adapter file).
- Revisit trigger: a second identity provider lands.

## D-2026-09-05-03 Model selector

- Question: how hundreds of models should feel simple while power users keep control.
- Evidence: pending Stage 1 market research; the lead observed both leaders expose few models with
  effort or mode controls, a coding tool exposes a provider grouped catalogue with favourites and
  model cards; ours lists models flat with a switch dialog (removed in 0c2b851c7).
- Current implementation: flat list with search, effort row and capability glyphs.
- Options: modes over models; provider grouped catalogue behind an advanced view; intent first with
  Auto and a small curated set, catalogue behind a disclosure.
- Decision: deferred until the market and economics docs land; the earlier grouped picker brief is
  a candidate, not a plan.
- Revisit trigger: Stage 2 synthesis.

## D-2026-09-05-02 Review gate for visible UI

- Decision: no visible UI commits before the lead's screenshot review; briefs carry the gate first
  and tie commits to an approval message (two breaches today, corrected post hoc).
- Revisit trigger: none.

## D-2026-09-05-01 Guards run against the worktree

- Question: why clean pushes fail.
- Evidence: nine push attempts today failed on other agents' in flight files (untracked docs in a non
  tier folder, an unwired module, a root capture folder, a package without its registrations).
- Decision: push at quiet points; briefs name the registrations a new package or doc needs; consider
  a tracked only mode for the worktree scanning guards.
- Revisit trigger: the tracked only mode lands or pushes keep failing on WIP.
