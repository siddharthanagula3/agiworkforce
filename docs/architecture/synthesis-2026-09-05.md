# Stage 2 synthesis, 2026-09-05

Status: Current
Owner: Fable (architect)
Last updated: 2026-09-05

What the three Stage 1 documents say when read together, and the risk maps
the founder asked for. Inputs, each verified today: the system map
(`docs/architecture/system-map-2026-09-05.md`), the market baseline
(`docs/research/market-current-state-2026-09-05.md`), the unit economics
model (`docs/research/unit-economics-2026-09-05.md` and
`scripts/research/unit-economics-2026-09-05.mjs`), the P0 capability
classification (`docs/research/p0-capability-classification-2026-09-05.md`),
the ship readiness audit (`docs/research/surface-ship-readiness-2026-09-05.md`)
and the lead's own walkthrough of both leaders, held outside the repository.
Model families and routing tiers only; no model ids or display names.

## Current architecture map, in one paragraph

Six surfaces sit on one contract layer and none holds a vendor, model or
region literal. The seams that exist are real and guarded: identity, key
value, object storage and the database sit behind ports with one or two
adapters each; the model catalog compiles to one generated file that both the
TypeScript and the Rust sides embed; routing is a pure resolver whose inputs
are registry shaped; provider adapters share a factory and a declarative
gateway builder; the desktop privileged seam is checked both ways. The seams
that do not exist are equally clear: billing calls the payment SDK from six
call sites with no port, durable workflows import the engine at each call
site, MCP is two independent stacks, the boundary guard's vendor adapter list
is an array inside the script rather than configuration, the streaming wire
shape is owned by one file and its tests rather than a contract package, and
the gateway definition file is a worked example that production route
selection never reads.

## Current product map

Against the capabilities both leaders ship, today's state after the day's
commits:

| Band    | Capabilities                                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS    | memory and personalization, connectors and MCP directory, enterprise administration surfaces, sign in and sign up                                                      |
| POLISH  | multimodal composer, projects, sharing, settings (density and copy fixes in review)                                                                                    |
| PARTIAL | chat history and search, streaming and rich rendering, files and viewer, web search and research, artifacts, work mode, voice, cross device continuity, model controls |
| BROKEN  | code execution for a user whose sandbox quota leaked (governor and reclaim fixes committed, release on completion in flight), stop and failure recovery                |

The two BROKEN rows are reliability, not capability: the sandbox existed and
the stop path existed, both failed under real use. Everything in PARTIAL is a
gap of shape, not of substance: the primitive exists and the leaders' form of
it does not.

## Competitor and common capability map

What both leaders now treat as baseline, from the market doc and the
walkthrough:

- The first paid tier bundles a coding agent, unlimited projects and an
  unattended work agent. Free tiers include search, memory, file creation
  with code execution, skills and connectors.
- Usage is two concurrent windows, a rolling five hour session and a weekly
  cap, shown as progress bars with reset times, with a purchasable top up.
  Our reservation system already enforces the same two windows plus a
  premium share; what differs is the presentation.
- Model choice is few models plus an effort or mode control. Neither leader
  shows a catalogue; a coding tool that does groups by provider behind
  favourites and search.
- Every gateway ships cross provider fallback and retry on its free tier.
  Free API tiers withhold caching and, for one vendor, the training opt out.
- Enterprise pricing converges on a seat plus consumption at API rates, with
  SSO, SCIM, audit logs, residency in named regions and a compliance API.
- Autonomous work mode differs structurally between the leaders: one rewrites
  the whole home shell, the other keeps the shell and adds a composer control
  and a right dock. Our AGI Work sits between them.

Where we are ahead by design rather than by execution: provider and model
neutrality, a bring your own key lane on desktop, the CLI and the extensions,
a route receipt that names the served model, and an explainable route preview
that the leaders do not expose at all.

## Portability risks

Ranked by the cost of the day a vendor disappears, highest first.

1. Billing has no port. A payment vendor change touches the webhook,
   checkout, upgrade, portal and enterprise billing services. Mitigation is a
   thin port over customer, subscription, checkout session and webhook
   verification, adopted by the six call sites; the client factory already
   exists as the single construction point.
2. Durable workflows import the engine at each call site. Three workflow
   files would be rewritten, not reconfigured. Mitigation is a small step and
   sleep interface the three files call, with the engine behind it.
3. The cheaper route seam is unexercised. The gateway definition builder and
   the catalog sync exist, but production route selection reads the live
   provider package. Until one gateway definition serves real traffic behind
   a flag, the one day swap target is a claim.
4. MCP lands twice. A protocol change is two implementations and two test
   suites; the desktop renderer and the privileged host already disagree on
   which stack they use. Mitigation is to pin the TypeScript stack to
   browser surfaces and the Rust stack to native, and to generate both from
   one conformance fixture as the model registry already does.
5. The boundary guard's vendor adapter ownership is an array in the script.
   A new SDK imported from anywhere passes. Mitigation is moving the array to
   a configuration file beside the other allowlists.
6. The streaming wire shape has no contract package. The extensions and
   mobile consume it by convention. Mitigation is one typed schema in the
   contracts package that the golden tests import.
7. The shared chat package is not shared with the extensions, so a composer
   or renderer improvement lands three times.
8. The key value store fails closed on quota, which turned every completion
   into a rate limit error in production once. The port is right; the outage
   policy needs a per environment default.

## Model management risks

1. Tool support loss is never learned. The catalog carries a compile time
   capability flag; the liveness probe sends no tools; the governor's
   withdrawal lasts one turn and is never written back. A model that quietly
   stops honouring tool calls degrades every session until a person edits
   the catalog. Mitigation is a durable per route capability observation in
   the route health store, fed by the governor's unavailability signal,
   ranked by the resolver the way health already is, and surfaced in the
   registry as an observed field distinct from the declared one.
2. Catalog growth outpaces the surfaces that render it. The gateway sync
   added three hundred and forty nine entries under the curated ones; the
   picker, the VS Code snapshots and the README count all broke or shifted
   within hours. A registry that grows must not be rendered flat anywhere.
3. The tier normalization folds an unknown or absent tier into the free
   bucket, and folds one paid tier into free and another into pro. A test
   pins this, but every new tier name is a hazard until it is mapped.
4. Pricing drift is checked against one gateway feed only. Vendor pages are
   the source of truth for the two curated policy pins; a second feed and a
   per vendor page check are cheap.
5. Implicit prompt caching never hits on the vendor whose spend tripped the
   monthly cap, because that vendor's minimum cacheable prefix is larger than
   our system prompt. Explicit caching costs cents and is queued; until it
   lands, every request on that vendor pays full input price.
6. The free lane is dormant and correctly so: one pool is terms clean, the
   rest need human review, and the lane strands rather than spends. Turning
   it on without the terms workbook signed is the one shortcut this plan
   forbids.

## Unit economics risks

The model says every profile is margin positive at published prices and the
enforced ceilings do their job. The risks are in what the model cannot see.

1. Concentration. Research heavy and coding heavy sit at seventy percent of
   their tier ceilings. If those patterns become the median, declines rise
   and retention pays for it. The lever is the premium share of the weekly
   cap and the router's habit of sending every coding labelled call to the
   premium profile regardless of traffic diversity.
2. Overage at cost. A top up dollar buys a dollar of budget with no margin.
   Leaders sell top ups as credits with plan multipliers. A small markup on
   top ups, disclosed, is the cheapest margin in the product.
3. Media dominates the heaviest profile. Image and video are the whole cost
   of the multimodal profile; the capability gates are the control and they
   live in the billing catalog, which is correct.
4. Unpriced storage. No per gigabyte unit price exists anywhere, so file
   heavy usage is invisible to the model.
5. Grounded search. The day's spend incident was search grounding requests,
   not tokens. The monthly pool, per turn cap and cheaper backend are in; the
   tool loop hooks that count and bill each grounded response are in flight.
6. Two paid tiers buy budget, not models. Basic shares the free ceiling and
   Team shares the pro ceiling. That is defensible only if the picker and the
   plan page say so.

## Enterprise risks

1. Residency is a comment in a migration. No region can be enforced for an
   organization, while both leaders list named regions. This is the largest
   enterprise gap and it is a data layer and object storage decision, not a
   frontend one.
2. No DLP or redaction exists. Leaders ship it at the enterprise tier.
3. Web server side tracing sends raw exception messages as span attributes;
   only the extension facing client scrubs. One scrub step at the span bridge
   closes it.
4. Admin surfaces are PASS by presence, not by exercise: the QA account has
   no workspace, so every admin console has only ever rendered its empty
   state. A workspace bearing test account is founder gated.
5. Migrations 0159 to 0174, live payment configuration, the key value quota
   decision and the single deploy are founder gated and sequenced in the
   readiness audit.
6. Compliance claims stay evidence backed: SOC 2 and ISO in progress are
   not SOC 2 and ISO; HIPAA is unsupported by decision.

## UX and model selector risks

1. A flat list cannot survive the catalog. Three hundred and forty nine
   synced entries plus the curated set in one list is the failure both
   leaders avoided by not showing a catalogue at all.
2. The founder's preference and the evidence agree on the shape: Auto first,
   a short curated list, the catalogue behind a disclosure grouped by
   provider with search and favourites, an effort control on the face. The
   registry drives every layer, so adding a hundred models changes the
   disclosure's contents and nothing on the composer face.
3. Continuity must be visible. Auto now stays on the conversation's model
   and escalates only on failure; the receipt should say when it moved and
   why, or users will read a silent switch as a bug.
4. Switching is silent on both leaders; the confirmation dialog is gone.
   Served by transparency stays in the hover receipt, not in a modal.
5. The plan page and the picker must show tier ceilings in the same words,
   or the two paid tiers that buy budget only will read as broken.

## Desktop opportunity map

The desktop product is the Electron cloud shell with the Tauri Rust layer as
the capability substrate. Verified live today: the global voice chord, the
tray presets and rebinding, sign in against the same account as the web.
The Rust layer already holds OS level automation with tiered safety and
confirmation, local SQLite, local model serving and the privileged command
seam checked both ways.

Where the desktop can lead rather than follow:

1. Voice as a system wide surface. The leaders' dictation is a composer
   feature; the desktop chord already works anywhere. A cleaned transcript
   (filler removed, formatting applied, a personal dictionary), the shape the
   best dictation products ship, is a model task the registry can route
   without binding to a vendor. Permissions (input monitoring, accessibility)
   need a first run explanation, because the failure mode is silent.
2. Computer use by hierarchy, not by vision first. Connectors and MCP where
   an API exists, browser DOM through the extension, accessibility tree
   through the Rust layer, screenshots last. The computer use task type
   already exists in routing; model choice is a capability lookup, never a
   name. The market doc records that the strongest vendor tool is generally
   available only on its own API and one cloud, so the hierarchy is also the
   portability strategy.
3. Unattended work with a dock. The leaders' work agents run parallel steps
   and show every tool call in a right dock. AGI Work has approvals and a
   dock; the clarifying question card and the step timeline are the gap.
4. Local models as a first class lane. Local inference is free, private and
   already wired in the platform package; the leaders cannot offer it.
   Surfacing it as a lane in the same picker is a differentiator that costs
   no inference.
5. Release plumbing is the blocker, not features: signing and notarization
   secrets are founder gated, the Windows pipeline is engineering gated, and
   the shell has no auto update feed by design. None of the four items above
   ships to a user until the first is in place.

## The smallest set of high leverage gaps

In order, each one measurable:

1. Reliability of the chat run: sandbox release and reaping, stop and
   failure recovery, grounded search accounting. Measure: zero leaked
   sandboxes for the QA user after a day of runs; a stopped turn keeps its
   partial text; every grounded response appears in the cost ledger.
2. Durable tool support observation in the route health store. Measure: a
   route whose tool calls fail three times in an hour ranks below a healthy
   route for the next request in another session.
3. The selector shape above, driven by the registry. Measure: the composer
   face renders the same controls with a catalog twice the current size; the
   catalogue disclosure lists every synced entry grouped by provider.
4. One gateway definition serving real traffic behind a flag. Measure: a
   cheaper route for an existing model goes live with a registry change and
   no frontend change.
5. A billing port over the six call sites. Measure: a second adapter passes
   the webhook and checkout tests.
6. Explicit prompt caching on the vendor whose implicit cache never hits.
   Measure: cache read units greater than zero in the ledger for that vendor.
7. Top up markup and tier ceiling copy on the plan page and the picker.
   Measure: the two texts name the same ceilings.
8. Scrubbing at the web span bridge and the boundary guard array moved to
   configuration. Measure: the two guards that exist for the extension
   client also cover web.
9. Residency as a data layer decision: a per organization region column,
   honoured by the database and object storage factories. Measure: an
   organization pinned to one region never reads or writes another.
10. Desktop release plumbing, then the four desktop items in the order above.

## Decisions taken today from this synthesis

Recorded in `docs/decisions/2026-09-05-living-decision-model.md` as D-09
(model selector shape, derived from evidence, supersedes the deferral in
D-03) and D-10 (durable capability observation is the answer to tool
support loss, not a catalog edit cadence).
