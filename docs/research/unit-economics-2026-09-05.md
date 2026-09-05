# Unit economics per user profile

Status: Current
Owner: Fable (architect)
Last updated: 2026-09-05

Model families and routing tiers only below, no model ids or display names,
per AGENTS.md 10. The script this doc reports on is
`scripts/research/unit-economics-2026-09-05.mjs`; run it directly for the
full per-profile breakdown, this doc quotes its summary and one worked
example.

## Part 1: what the implementation does today

**Plans and prices.** `packages/contracts/types/src/billing-catalog.ts` is
the single source for plan tiers, prices, product limits and capability
gates. Five self-serve paid tiers exist: Basic $7/month, Pro $20/month, Max
$100/month, Max 15x $200/month, and per-seat Team at $25/month ($20 seat
Standard on the competitor side is a different product, see Part 3). Free and
Enterprise are $0 and contract-priced respectively. `BILLING_PLAN_PRODUCT_LIMITS`
sets non-cost ceilings per tier: project count, connector count, concurrent
turns, sandbox count and sandbox TTL, scheduled tasks.

**Model access is a separate ceiling from price.** The router
(`packages/ai/routing/src/auto.ts`) normalizes every plan tier to one of
`free`, `pro`, `max`, `enterprise`, `byok` before it looks up which routing
slots and which of the three router profiles (economy, balanced, premium) a
request may use. That normalization maps `basic` to the `free` bucket and
`team` to the `pro` bucket. The practical effect: a Basic subscriber has the
same model ceiling as a Free user (economy profile, the same handful of
low-cost slots), and a Team seat has the same model ceiling as Pro. Basic and
Team's paid advantage is a larger rolling cost budget and higher product
limits, not access to better models. Max and Max 15x share one `max` bucket
too, so a Max 15x subscriber pays 2x for a larger rolling budget and higher
concurrency limits, not a wider model list.

Per request, the router picks a task type (simple chat, coding, reasoning,
research, agentic, computer-use, creative writing, multimodal, image
generation), looks up that task's preferred slot list for the profile the
tier allows, and takes the first slot on that list the tier's allow-list also
contains. `autoProfileByTask` biases simple chat toward the cheapest
(economy) profile and coding, reasoning, agentic and computer-use tasks
toward the most capable (premium) profile the tier permits; every other task
type defaults to the balanced profile. `image_generation` requires Pro or
above; `video_generation` requires Max 15x or Enterprise; `agi_work`
(agentic and computer-use tasks) requires Pro or above. These gates live in
`BILLING_PLAN_CAPABILITY_TIERS`, not in the router.

**Usage is metered and capped in real dollars, not raw tokens.** A managed
chat request goes through `reserveManagedUsageRequest` in
`apps/web/lib/services/managed-usage-request-service.ts`, which calls a
Postgres reservation function with three simultaneous cost ceilings in
cents: a rolling 5-hour cap, a rolling weekly cap, and a weekly cap on
premium ("flagship") usage set to 30% of the weekly cap. Those ceilings come
from `apps/web/lib/server/managed-usage-policy.ts`, which converts a plan's
declared "usage unit" allowance (`apps/web/lib/billing/managed-usage-caps.ts`)
into ledger cents at a fixed rate of 2 units per cent. Free's allowance
converts to a $0 ceiling under this function by explicit check, because Free
traffic does not run through this paid-budget system at all (see below). A
request that would cross a ceiling is declined before any provider is
called, with a distinct reason code per ceiling
(`rolling_five_hour_limit_reached`, `rolling_weekly_limit_reached`,
`flagship_weekly_limit_reached`, `insufficient_credits`) that the client maps
to upgrade, top-up, wait, or contact-support actions
(`packages/contracts/types/src/billing-catalog.ts` `classifyManagedQuotaErrorCode`).
Actual settlement happens after the provider responds
(`finalizeManagedUsageRequest`), and every settled request also writes a COGS
ledger row.

**The enforced monthly COGS ceiling this produces per plan**, computed the
same way the reservation function computes it: Basic $2.00, Pro $10.00, Max
$50.00, Max 15x $150.00. This is a hard stop independent of which models a
user's traffic happens to route to.

**Free tier runs on a separate lane, not the paid budget system.**
`apps/web/lib/services/free-lane/stage.ts` resolves an `auto-economy`
selection against a small set of subsidized or free-pool routes
(`apps/web/lib/server/free-pools`), ranks live candidates by a runtime
health/availability state, and returns `free_capacity_unavailable` with a
`Retry-After` header when nothing is currently servable, recovering to
upgrade or BYOK. Free traffic is priced far below the paid tiers' floor by
construction: the free-lane's preferred slots are the cheapest economy-profile
routes in the registry.

**COGS ledger.** `apps/web/lib/services/cogs-ledger-service.ts` is the
system of record for what was actually spent versus what was billed, split
by capability (chat, image, video, transcription, embedding, computer_use,
sandbox, tool) and unit basis (token, image, second, minute, request), with
adjustment rows for Stripe fees, refunds, chargebacks and discounts, and
token-class dimensions that isolate cache-read savings and cache-write
premiums from base spend. `recordSettledProviderCost` is the one entry point
every capability's cost path calls; chat calls it from
`finalizeManagedUsageRequest`, and each tool cost module below calls it
directly.

**Chat token pricing.** `apps/web/lib/services/llm-cost-calculator.ts`
resolves a route's price from, in order: a runtime override, the registry
route's own declared price (including a long-context input-tier threshold
where one is declared), the model's catalog metadata, the provider's default
price, or an unpriced-model fallback. The fallback is gated by
`AGI_PRICING_UNPRICED_POLICY`: `refuse` (default) throws rather than bill a
guessed price, `warn` bills a flat $1/$4 per million input/output tokens and
logs a counter. Cache pricing follows the same resolution; a route with no
declared cache-read or cache-write price is billed at, respectively, the
base input price and 1.25x (5-minute write) or 2x (1-hour write) the base
input price.

**Tool costs are all sourced, dated, per-call config, not estimates
embedded in a prompt.** Google grounded search bills $14 per 1,000 calls
beyond a 5,000/month free pool (current tier) or $35 per 1,000 (previous,
lower-volume tier for models outside the active registry), from
`apps/web/lib/web-search/web-search-pricing.json`, fetched 2026-09-05 from
the vendor's own pricing page. The Perplexity fallback search bills $5 per
1,000 calls, same file, same fetch date, and fires on every successful call
regardless of whether the turn used the result, because Perplexity bills
that way. Places search bills $35 per 1,000 calls
(`apps/web/lib/places/places-config.ts`, sourced 2026-09-05, Google's Text
Search Enterprise SKU). Every one of these three modules accepts a runtime
env override and logs and refuses an invalid override rather than silently
falling back to the published rate.

**Sandbox and browser compute.** `apps/web/lib/e2b/compute-metering.ts`
meters e2b sandbox seconds against the registry-declared compute price
($0.000014 per vCPU-second, `packages/ai/model-registry/catalog/provider-compute-pricing.json`,
verified 2026-09-04), defaulting to 2 vCPUs when a session does not declare
its own size. A misconfigured or missing rate logs an error and bills
nothing rather than guessing, and separately tracks how many seconds went
unbilled that way. Computer-use (browser) sessions run inside the same
sandbox infrastructure, so browser minutes bill through this same path, on
top of the driving model's own token cost for the computer-use task type.

**Image and video generation.** Image cost resolves per provider: Google's
image models carry a declared per-image cost in the catalog; OpenAI's do
not, so the image route falls back to a declared per-quality estimate in
`apps/web/app/api/media/image/generate/route.ts`. Video cost resolves from a
registry route price expressed as USD per second, by output resolution, on
the model the `video_generation` slot names. Both paths write to the COGS
ledger with `actualCostCents: 0` recorded up front and the real estimate
attached separately, then settle for real once the job completes.

**Credits, overflow and top-ups.** A subscription can enable overage; when
enabled, a request that would exceed the rolling caps can still be served
against `token_credits` headroom, capped at what the user has top-up'd.
`packages/contracts/types/src/billing-topups.ts` sells top-up credit at
exactly cost: $1 of top-up buys $1 of ledger-cent budget (50 usage units),
between $10 and $100 per purchase. There is no markup on overage by design;
the margin on overage-covered usage is whatever margin the underlying tokens
already carry, not an additional one.

**Rate limiting.** `apps/web/lib/rate-limit.ts` is a generic per-endpoint
Upstash-backed sliding-window limiter (used for auth, API-key management,
downloads and similar), fails closed in production if Redis credentials are
absent, and exposes a non-production-only scale knob for load testing. It is
not itself the mechanism that caps chat spend; that is the rolling-cost
reservation system above.

**Usage UI.** Settings' Usage section and the sidebar usage meter share one
hook (`useManagedUsageSummary`). Percentages are computed from the same
worst-of-several-windows logic as the server-side warning header, colored by
a shared severity ladder (warning at 90%, critical at 95%), and render an
explicit "Unavailable" state rather than defaulting an unreadable percentage
to zero used, which would otherwise show a false full allowance.

## Part 2: the model

`scripts/research/unit-economics-2026-09-05.mjs` computes monthly COGS for
nine usage profiles. It reads every price it uses (chat token rates by
routing slot, image and video per-unit rates, search and sandbox tool
rates, plan prices, capability gates, and the enforced COGS ceiling per
plan) from the files described in Part 1; nothing is typed by hand. It
reproduces the router's own tier-normalization and profile-clamping logic
against the live policy tables in `packages/ai/model-registry/generated/registry.json`,
so the slot each task type resolves to is the router's actual admitted
choice for that plan tier, not a hand-picked model. Usage quantities (turns,
tokens, tool calls per profile) are this script's own documented
assumptions, since no profile like this is metered yet; each carries its
reasoning inline and prints with the report.

Two comparisons are built into every profile: the dollar cost of the same
traffic with 0% cache reuse (caching's savings), and the dollar cost of the
same traffic if every task were forced to the tier's maximum profile instead
of the router's task-aware mix (routing's savings, i.e. the value of sending
simple chat to a cheap model instead of the flagship).

One worked example, quoted verbatim from the script's output:

```
## Coding heavy (max, $100/month)

Assumption: Agentic multi-step coding; large repo context reused across a
session drives cache hit rate up, and agent-loop retries push retry share up.

Turns/month: 900, avg input tokens: 6000, avg output tokens: 1100, cache hit
share: 70.0%, cache write share: 15.0%

| Component | Monthly cost |
| --- | --- |
| chat: coding (flagship_coding) | $25.03 |
| chat: agentic (flagship_general) | $5.72 |
| chat: reasoning (reasoning_balanced) | $0.26 |
| retries + gateway overhead (12%) | $3.72 |
| web search (grounded, beyond free pool) | $0.21 |
| sandbox compute minutes | $0.71 |
| Total COGS | $35.65 |

Plan price: $100.00 | Margin: $64.35 (64.4%)
Prompt caching saves: $13.87/month versus no caching
Router savings: $0.00/month versus forcing every task to the tier's maximum profile
Candidate price points: $80.00 -> margin $44.35 (55.4%) | $120.00 -> margin $84.35 (70.3%)
Enforced monthly COGS ceiling on max: $50.00; this profile reaches 71.3% of it
```

("Coding heavy" already sits at its tier's maximum profile for every task in
its mix, hence $0 router savings; the profiles with a lighter task mix show
non-zero router savings, see below.)

Summary across all nine profiles, quoted verbatim from the script's final
table:

| Profile              | Plan    | Price   | Total COGS | Margin  | Margin % | % of enforced ceiling |
| -------------------- | ------- | ------- | ---------- | ------- | -------- | --------------------- |
| Light                | basic   | $7.00   | $0.02      | $6.98   | 99.7%    | 1.1%                  |
| Normal               | pro     | $20.00  | $1.25      | $18.75  | 93.7%    | 12.5%                 |
| Power                | max     | $100.00 | $15.57     | $84.43  | 84.4%    | 31.1%                 |
| Research heavy       | pro     | $20.00  | $7.02      | $12.98  | 64.9%    | 70.2%                 |
| Coding heavy         | max     | $100.00 | $35.65     | $64.35  | 64.4%    | 71.3%                 |
| Desktop agent heavy  | max_15x | $200.00 | $58.22     | $141.78 | 70.9%    | 38.8%                 |
| Multimodal heavy     | max_15x | $200.00 | $80.84     | $119.16 | 59.6%    | 53.9%                 |
| 95th percentile      | max_15x | $200.00 | $66.21     | $133.79 | 66.9%    | 44.1%                 |
| Automated or abusive | max_15x | $200.00 | $112.63    | $87.37  | 43.7%    | 75.1%                 |

Enforced monthly COGS ceilings by plan (same source): Basic $2.00, Pro
$10.00, Max $50.00, Max 15x $150.00.

Prompt caching and router-mix savings, quoted from the per-profile output,
for the profiles where they are largest: Coding heavy caching saves
$13.87/month; Desktop agent heavy caching saves $18.41/month; Automated or
abusive router-mix saves $57.05/month (its task mix is 30% coding, which
`autoProfileByTask` always routes to the premium profile regardless of how
undifferentiated the traffic is).

## Part 3: competitor evidence

Sourced from `docs/research/market-current-state-2026-09-05.md` (fetched and
dated 2026-09-05; ChatGPT figures are graded Inference there because
openai.com returned HTTP 403 to every fetch this session, Claude figures are
graded Observed from a live fetch of claude.com/pricing).

| Product        | Plan             | Price                      | Included usage shape                                                               | Overflow model                               |
| -------------- | ---------------- | -------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| ChatGPT        | Free             | $0                         | Restricted usage, not itemized in the fetched sources                              | n/a                                          |
| ChatGPT        | Plus             | $20/month                  | Not itemized (site returned HTTP 403)                                              | Unverified                                   |
| ChatGPT        | Pro              | $200/month                 | Not itemized (site returned HTTP 403)                                              | Unverified                                   |
| Claude         | Free             | $0                         | Includes web search, memory, file creation with code execution, skills, connectors | n/a                                          |
| Claude         | Pro              | $20/month ($17 annual)     | At least 5x Free's usage per rolling 5-hour session                                | Purchasable extra usage credits              |
| Claude         | Max              | $100/month                 | Choice of 5x or 20x Pro's usage                                                    | Purchasable extra usage credits              |
| Claude         | Team (seat)      | $25/month ($20 annual)     | Standard seat usage; Premium seat is $125/$100 at 5x Standard                      | Purchasable extra usage credits              |
| Claude         | Enterprise       | $20/seat + usage           | No fixed window; billed at API rates on consumption                                | n/a (consumption billing)                    |
| Cursor         | Pro / Pro+       | $20/month                  | Fixed included agent-request allowance, Pro+ at 3x Pro                             | Meters overage beyond the included allowance |
| GitHub Copilot | Pro / Pro+ / Max | $10 / $39 / $100 per month | $15 / $70 / $200 monthly credit allotment                                          | Meters overage beyond the credit allotment   |

Every paid competitor plan observed here uses the same shape this product
uses: a fixed included allowance (either a usage multiplier or a dollar
credit) plus a metered or purchasable overflow path, not unlimited usage at
a flat price.

## What the numbers say

**Usage concentration risk.** The heaviest legitimate-looking profiles
already sit close to their plan's enforced COGS ceiling under this script's
assumptions: Research heavy at 70% of Pro's $10 ceiling, Coding heavy at 71%
of Max's $50 ceiling, Automated or abusive at 75% of Max 15x's $150 ceiling.
A modestly heavier version of any of these three would be throttled by the
reservation system, not silently erode margin; the ceiling is doing its job.
The risk is concentration in adoption, not in per-user loss: if research- or
coding-heavy usage patterns become the median rather than the tail on their
tiers, the reservation system will generate a correspondingly higher rate of
`insufficient_credits` and rolling-window declines, which is a support and
retention cost this model does not price.

**No profile is unprofitable at published prices** under this script's
assumptions, including Automated or abusive (43.7% margin) and Multimodal
heavy (59.6% margin), the two lowest. Both stay margin-positive even at a
20% price cut in the script's candidate-price-point check (29.6% and 49.5%
respectively), so the published prices have real headroom against these
assumptions specifically; that headroom should not be read as headroom
against unmodeled costs (see gaps below).

**The levers that move margin most, in order:** capability gating on image
and video generation (Multimodal heavy's two media components are $80.10 of
its $80.84 total COGS, effectively all of it); prompt caching, worth
$14 to $18/month on the two most context-heavy profiles; and router profile
discipline on undifferentiated high-volume traffic, worth $57/month on the
Automated or abusive profile specifically, because `autoProfileByTask`
sends every coding-labeled call to the tier's premium profile regardless of
how repetitive or low-value that traffic actually is. Tightening that one
default for high-volume, low-diversity traffic is the single largest lever
this model finds.

**Basic and Team pay for budget and limits, not for a better model
ceiling.** The router's tier normalization gives Basic the same slot
allow-list and profile ceiling as Free, and gives Team the same allow-list
and ceiling as Pro. Neither of those is a defect this doc is proposing to
fix; it is a fact worth knowing before reasoning about either tier's margin
in isolation from Free or Pro.

**Overage is sold at cost.** A top-up dollar buys exactly a dollar of COGS
budget with no markup, so a heavy top-up user contributes zero incremental
margin beyond whatever margin their underlying token mix already carries.

**Gaps this model does not price**, stated rather than estimated: per-GB
file storage has no declared unit price anywhere in this repository, so
profiles that specify a storage quantity have it excluded from their total
rather than guessed. Video generation is priced only for the model the
`video_generation` slot currently names; if that slot's model changes to one
without a declared per-second rate, the video component of any profile
using it would need a new source before it could be modeled again.
