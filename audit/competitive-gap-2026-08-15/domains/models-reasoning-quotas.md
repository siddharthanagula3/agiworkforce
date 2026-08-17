# Models, reasoning controls, quotas, pricing & entitlements — 2026-08-15

Benchmarked against live-observed ChatGPT, Claude, Gemini, and Manus behavior captured
2026-08-15. Cross-referenced against the same-day prior audit at
`audit/parity-2026-08-15/gaps/domain-models.json` (7 items — Desktop-Tauri effort control,
org model policy, context-window visibility, fallback transparency, Ultra/Pro reasoning
metadata, retired-model migration notice, dead llama.cpp feature). None of those seven
overlap the pricing/quota/entitlement surfaces this pass covers, so almost everything below
is genuinely new territory rather than a re-verification of prior findings; where a real
connection exists it's called out explicitly.

## Method

For every one of the 28 benchmark claims I traced the concrete implementation: registry →
store → component → route → rendered UI, and captured file:line evidence for both what
exists and what's missing. I did not stop at "a component with a related name exists" —
several claims below hinge on a field or function that is fully built and even consumed
server-side, but never reaches the specific UI surface the benchmark claim is about
(`deprecation_date`, the training-data policy, the credit-transactions ledger).

---

## Strengths — where we are at or ahead of the benchmark

These matter because the brief specifically asked not to under-record them, and there are
real ones here.

1. **Consistent usage-reset vocabulary across every surface — the exact bug ChatGPT has
   (mqp-10), fixed.** `packages/contracts/types/src/usage-vocabulary.ts:96-120`
   (`formatUsageResetIn`) and `:78-80` (`managedUsageBucketLabel`) are imported by
   `apps/web/features/settings/sections/UsageSection.tsx`, `apps/web/features/chat/components/messages/ChatMessageList.tsx`,
   `apps/mobile/src/features/settings/cloud-usage/index.tsx`, and
   `apps/extension/src/side_panel.ts`. The benchmark corpus explicitly dings ChatGPT for
   showing two different reset-time precisions ("Resets Aug 20, 2026 1:50 AM" vs. "resets
   Thursday") for the same quota on two surfaces. Our shared vocabulary function is a
   structural fix to exactly that failure mode, and `UsageSection.tsx:106-111` pairs the
   relative phrase with the absolute instant on the same line rather than picking one.

2. **Four-bucket usage breakdown beats Gemini's two-meter disclosure (mqp-11) and partially
   answers Claude's per-model quota bar (mqp-09).** `UsageSection.tsx:231-258` renders
   session / weekly / weekly-flagship / period bars, each with its own percentage, remaining
   amount, and reset time — not Gemini's flat daily/weekly pair. The `flagshipWeekly` bucket
   (`usage?.flagship_weekly_usage_percentage`, line 137) specifically tracks premium-model
   burn separately from the aggregate, which is the same instinct behind Claude's dedicated
   "Fable" bar, just scoped to a model class rather than one named model (see Gap G3).

3. **Overage/top-up credits are available to every individual paid plan, not gated to
   Business/Enterprise like ChatGPT's mechanism (mqp-02).** `apps/web/app/api/billing/overage/route.ts:37-53`
   computes `available_cents` as `least(remaining balance, purchased top-up allocation)` for
   any account with an active subscription row — Basic/Pro/Max included, not just Team. The
   git history (`f063962c7`, `e15df56e3`) shows this was purpose-built in the two commits
   immediately before this audit so a Max-15x subscriber with nothing higher to upgrade to
   still has recourse. This is a broader mechanism than what ChatGPT discloses.

4. **In-app tier gating for models is real and granular, not just a pricing-page table.**
   `apps/web/features/chat/components/Composer/ComposerFooter.tsx:180-208` (`modelLock`)
   combines availability (`coming_soon`/`unavailable`), tier (`isModelSelectableForTier`),
   and per-model environment gates into one decision consumed by every call site
   (`partitionModels`, lines 245-300), rendering locked rows with inline upgrade affordances.
   The tier matrix itself (`packages/contracts/types/src/models.json` `tierAllowedModels`:
   `economy`/`pro_additions`/`flagship_additions`) is real, populated, and load-bearing — it
   just isn't surfaced on the marketing pricing page (Gap G1).

5. **Full per-model reasoning-effort control, catalog-driven (mqp-03, table stakes, all four
   products converge on this).** `ComposerFooter.tsx:82-129` derives effort chips, the
   thinking on/off switch, and the default effort per model from `models.json`'s `reasoning`
   block, so a model only shows the effort marks it actually accepts — this is the fix
   documented in `docs/research/reasoning-effort-capability-matrix-2026-07-10.md` for the
   "xhigh/max always shown even when unsupported" bug. We meet this table-stakes claim
   cleanly.

6. **Team seat price is an exact match to both ChatGPT Business and Claude Team's entry seat
   (mqp-16).** `packages/contracts/types/src/billing-catalog.ts:227-249`: $25/seat/month
   monthly, $240/seat/year ($20/mo equivalent annual) — identical cadence and price to both
   benchmarked products' entry team tier.

7. **A real intermediate paid tier under the flagship price (mqp-13's structural shape),
   already shipped.** Free ($0) → Basic ($7/mo, `billing-catalog.ts:197-202`) → Pro ($20/mo)
   → Max 5x/15x ($100/$200) is structurally the same idea as ChatGPT's Free/Go($8)/Plus($20)/Pro
   ladder — an accessible paid tier between free and the $20 flagship. This is already built,
   not a gap.

8. **We do not replicate the two dark patterns the benchmark corpus itself flags.** ChatGPT's
   $8 "Go" tier is ad-supported (mqp-14) and its flagship "$100/mo" tier hides the 20x price
   behind a 5x-anchored headline (mqp-15). We do neither: no plan carries an ads disclosure,
   and Max 5x ($100) and Max 15x ($200) are two fully, separately priced plan cards
   (`apps/web/app/pricing/page.tsx:1037-1115`), not one price band with an undisclosed
   higher option. See "Not worth copying" below.

9. **Actual training-data policy is categorically stronger than either benchmarked product's
   individual-tier opt-out.** `apps/web/app/privacy/page.tsx:109,371-373`: "AGI does not use
   customer conversation content to train AGI-owned models" — unconditionally, not an
   opt-out toggle scoped to certain tiers. The gap here (G7) is that this is never
   merchandised on the pricing comparison table, not that the underlying policy is weak.

---

## Gaps

### G1 — No per-model tier-access matrix on the pricing page (mqp-01)

**Benchmark.** ChatGPT's pricing page lists five named models with per-tier access badges
(—/Limited/✓/Expanded/Unlimited) in a real comparison table.

**Our state — PARTIAL.** The underlying data and enforcement are real and already covered in
Strength #4: `tierAllowedModels` in `models.json` and `modelLock()` in `ComposerFooter.tsx`
gate individual named models per tier inside the product. But the marketing `/pricing` page
(`apps/web/app/pricing/page.tsx:518-620`, the `compareRows` array) never reads this data —
`usageCapacity` per plan is a hand-written relative string (`"5x Basic usage"`,
`compareBasicUsage: "Base paid usage"` from `packages/ui/i18n/locales/en/pricing.json:163-171`),
never a named model. A prospective buyer comparing plans on the marketing page cannot see
which of our 34 catalog models (`models.json`, 34 entries) they'd actually get at each tier;
they'd have to sign up and open the composer to find out.

**Why this isn't a straight clone recommendation.** ChatGPT ships 5 models total; we ship 34
across many providers, re-verified roughly weekly per the catalog's own `verificationLog`
entries. A literal 34-row picker-style matrix on the marketing page would be noisy and stale
within days. The fix that fits our shape is a data-driven "models included" disclosure driven
by `tierAllowedModels` (e.g., grouped by provider/class) rather than a hardcoded table.

**Severity:** P2. **Effort:** M. **Prior audit:** NEW.

---

### G2 — Deprecation date exists in the schema but is never shown as a countdown in the picker (mqp-08)

**Benchmark.** ChatGPT's model picker itself shows "o3 — Leaving on August 26" inline.

**Our state — BUILT_NOT_WIRED.** `packages/contracts/types/src/model-catalog.ts:553-554`
defines `deprecation_date?: string | null` and it's populated on real records (e.g.
`models.json:1640`, `gpt-4o-mini-tts`). But the only consumer is
`apps/web/shared/stores/model-store.ts:94-109` (`isCurrentModel`), which uses it purely as a
future on/off gate: `if (retiresAt <= Date.now()) return false` — the model simply vanishes
from the picker the instant the date passes. I grepped `deprecation_date`/`deprecationDate`
across all of `apps/web` and `apps/mobile`/`apps/desktop` are not this domain's remit; the
only non-store hit is a comment. Nothing renders the future date as visible text anywhere in
`ComposerFooter.tsx` (confirmed: no `deprecation` string appears in that file). A user picks
a model today with a scheduled future retirement and gets zero warning before it silently
disappears from their picker on the deadline — the exact "features vanishing... with no
communicated timeline" failure mode the prior audit (`MODELS-006`, retired-model migration
notice) flags for a related but distinct case (conversation hydration, not the picker).

**Severity:** P2 (real trust gap, cheap to close since the field is already populated and
plumbed to the client). **Effort:** S. **Prior audit:** NEW (adjacent to `MODELS-006`, which
covers a different consumer of the same underlying deprecation lifecycle — the fix should
probably land in `ComposerFooter.tsx`'s row renderer and reuse `MODELS-006`'s eventual banner
component).

---

### G3 — Usage buckets are model-class-scoped, not per-named-model like Claude's "Fable" bar (mqp-09)

**Our state — PARTIAL.** As documented in Strength #2, `flagship_weekly_usage_percentage`
(`UsageSection.tsx:137-139,243-252`) buckets the whole flagship model _class_ into one meter.
Claude's benchmark behavior is one dedicated bar per specific model. We do not have a
per-model-id breakdown anywhere in the usage summary contract
(`useManagedUsageSummary.ts` — grepped for a `perModel`/`byModel` field, none found). This is
a real but minor gap: our four-bucket breakdown is already more informative than Gemini's
two meters, just coarser than Claude's most granular case.

**Severity:** P3 (single-product Claude differentiator, we already beat the majority).
**Effort:** M (would need model-scoped usage rows in the accounting service, not just a UI
change). **Prior audit:** NEW.

---

### G4 — Credit balance and top-up exist; the per-task debit ledger a user can inspect does not (mqp-12)

**Our state — PARTIAL.** We have real spendable-credit infrastructure:
`apps/web/lib/services/credit-service.ts` writes to a `credit_transactions` table on every
deduction/settlement (lines 447-456), and `BillingSection.tsx:901-952` shows the account's
current spendable balance with an opt-in overage toggle. But there is no user-facing
transaction history. I grepped every API route under `apps/web/app/api` for
`credit_transactions`: it is read only by `stripe-webhook` internals and by the full-account
`/api/user/export` GDPR-style export (`apps/web/app/api/user/export/route.ts`) — not by any
route a live UI screen calls. `apps/web/app/api/llm/v1/credits/balance/route.ts` is the only
credits-facing endpoint and it returns an aggregate balance only, no line items. Manus's
"Credits history" ledger — one row per past task with its own debit amount, scaled by that
task's real cost — has no equivalent surface here. A user who wants to know "what did that
last agent run actually cost me" cannot find out without requesting a full data export.

**Severity:** P2 (real-money transparency, and the underlying data already exists — this is
close to a pure UI+route gap, not new accounting work). **Effort:** M. **Prior audit:** NEW.

---

### G5 — No named higher-usage seat SKU within the Team plan (mqp-17)

**Our state — MISSING.** `billing-catalog.ts`'s Team entry (lines 227-249) is a single flat
$25/seat SKU; `isPerSeatBillingPlan`/`normalizePurchasableSeats` (lines 142,167) only ever
reason about one uniform seat type. There is no equivalent of Claude's named "Premium seat"
($100/seat/mo, 5x usage) that an admin could mix with standard seats in the same org.

**Severity:** P3 (single-product Claude differentiator). **Effort:** L (new seat-type
dimension through checkout, member management, and usage accounting). **Prior audit:** NEW.

---

### G6 — No self-serve Enterprise checkout path (mqp-18)

**Our state — MISSING**, and matches ChatGPT's pattern rather than Claude's. Our Enterprise
card (`pricing/page.tsx:856-887`) is `Contact sales` only — `contactSalesCta` links to
`/contact-sales`, no `Create plan` self-serve alternative exists anywhere in the pricing
flow. This is a single-product Claude differentiator, not a majority-convergence claim (only
Claude does this among the four benchmarked products), so it is not table stakes, but it is a
real, verifiable capability difference.

**Severity:** P3. **Effort:** L. **Prior audit:** NEW.

---

### G7 — Pricing comparison table has no training-data-use disclosure row (mqp-19, table stakes)

**Our state — PARTIAL** (policy present and favorable; disclosure surface missing). The
`compareRows` table in `pricing/page.tsx` (columns enumerated at lines 1143-1157: Plan,
Price, Billing, Managed usage, Projects, Custom MCP, Skills & connectors, AGI Work, Images,
Video, Managed API, Developer surfaces, Team controls, Best for) has no training-data-use
row at all, on any tier. Both ChatGPT and Claude's pricing pages carry this row explicitly
(individual tiers: "opt-out available"; business tiers: categorical "No"). Our actual policy
— "AGI does not use customer conversation content to train AGI-owned models," unconditionally,
per `privacy/page.tsx:109,371-373` — is stronger than either benchmarked product's
opt-out-based individual tier, but a prospective buyer scanning the comparison table the way
they would on chatgpt.com/pricing or claude.com/pricing will not see it, because there is no
row to see. This is flagged table stakes in the benchmark (`mqp-19`) precisely because buyers
expect to find this row on a comparison table; its absence here reads as silence on a
question we'd actually answer well if asked directly.

**Severity:** P2 (table stakes, majority convergence, and the fix is a one-line addition to
an already-favorable fact). **Effort:** S. **Prior audit:** NEW.

---

### G8 — No published per-model API pricing, cache-tier rates, service tiers, or batch discount (mqp-20/21/22/23/28)

**Our state — MISSING.** `apps/web/app/api-docs/page.tsx` (74 lines, read in full) is the
entire developer-facing API documentation surface: a curl quick-start and a link to
`/openapi.json`. It contains zero pricing information of any kind — no per-model token
rates, no cache-write/cache-hit tiers (even though `apps/web/lib/prompt-cache-helper.ts` and
`apps/web/lib/cost-tracker.ts` already compute cache economics server-side for billing), no
named service tier (`service_tier` request parameter) with an SLA, no batch-submission
discount mode, and no session-hour billing line item for the managed-agent (`agi_work`)
capability. There are also no "Learn more"-style links out to deeper docs at all — this is
below even ChatGPT's consumer-help-article bar (mqp-20), let alone Claude's
platform.claude.com-grade worked examples.

**Context.** Our managed API (`/api/llm/v1/*`, gated on `managed_api` capability,
`billing-catalog.ts:322,342`) is architecturally a routing gateway over many providers, not a
single first-party model — so a literal Claude-style `service_tier` parameter or per-model
cache-write-rate table doesn't map 1:1 onto our product. The realistic, valuable version of
this gap is simpler: publish what we already meter internally (cache savings, per-request
cost) as a real pricing reference page, and disclose whether/how batch or async submission is
supported.

**Severity:** P3 (single-product Claude developer-platform features; our API product is
currently thin enough that this is polish, not a blocking gap). **Effort:** M. **Prior
audit:** NEW.

---

### G9 — No dedicated education-institution plan (mqp-24)

**Our state — MISSING.** Grepped `apps/web/app` for `education`/`Edu`/`nonprofit`/`teachers`
— no route, no plan card, no billing-catalog entry. Both ChatGPT (Edu + free-for-teachers)
and Claude (Education plan card) have this; majority convergence.

**Severity:** P2 (majority convergence). **Effort:** L (new plan tier, checkout, and likely a
verification flow for institutional status). **Prior audit:** NEW.

---

### G10 — No disclosed nonprofit discount (mqp-25)

**Our state — MISSING.** No nonprofit program, discount percentage, or FAQ entry found
anywhere under `apps/web/app` or the pricing i18n bundle. Single-product ChatGPT
differentiator.

**Severity:** P3. **Effort:** S-M (mostly a policy decision + FAQ copy, not new
infrastructure, if a percentage discount is applied at the Stripe coupon layer). **Prior
audit:** NEW.

---

### G11 — In-app paywall shows the upgrade tier's name but never its price (mqp-26)

**Our state — PARTIAL**, and cheap to close. `apps/web/features/chat/components/InlinePaywallCard.tsx:201-202,234-239`
builds every CTA string from `getBillingPlanPricing(requiredTier).label` — e.g. "Upgrade to
Pro" — but the same `getBillingPlanPricing()` call already returns `monthlyPriceUsd`
(`billing-catalog.ts:95,122-123`); the component simply never reads that field into the
string. Gemini's benchmark behavior is showing the exact price in a live, logged-in upsell
("Get 5x more usage with AI Ultra — $99.99/month"). We have the exact same data one property
access away and don't use it.

**Severity:** P3 (single-product Gemini differentiator, but genuinely a one-line fix given
the data is already in scope at the call site). **Effort:** S. **Prior audit:** NEW.

---

### G12 — Enterprise pricing copy calls a shipped capability "roadmap" (adjacent to mqp-27)

**Our state — PRESENT_WORSE.** This isn't one of the 28 claims verbatim, but it's directly
relevant to mqp-27 (accurate disclosure of what a tier does and doesn't include) and is a
genuine, reproducible inaccuracy I found while checking that claim.

The Enterprise card's fourth feature line
(`packages/ui/i18n/locales/en/pricing.json:110`, rendered at `pricing/page.tsx:873-876`)
reads: **"SSO, audit, and data retention (roadmap, scoped with your team)"** — describing SSO
as not-yet-built. But `apps/web/features/admin/pages/AdminConsolePage.tsx:71-78` documents
the actual state as **"Implemented — entitlement-gated"**: "First-party SSO sign-in
(`lib/server/sso/clerk-enterprise-connections.ts`, `/api/admin/sso`) and SCIM provisioning
(`/api/scim/v2`) are implemented and gated on the `enterprise_controls` capability." The same
file's `ADMIN_CONTROLS` inventory (lines 130-145) lists live routes for both Directory sync
(SCIM 2.0) and Enterprise SSO with real service endpoints, reachable from
`/settings/team` and `/admin/directory-sync`.

This is the inverse of a fake-availability badge — we're _undermarketing_ a real capability,
which is arguably worse for an Enterprise sale: a prospective buyer reading the pricing page
sees "roadmap" for the exact control (SSO) that is often the actual gating decision for
whether they can buy at all, and may not ask further or may go find out from a competitor's
page that already claims it plainly. Separately, our comparison table's admin/security
disclosure is far coarser than ChatGPT's dedicated Security & Administration section (mqp-27):
we have one boolean `Team controls: Yes/No` column (`pricing/page.tsx:175`,
`canUseBillingPlanCapability(plan, 'team_admin')`) rather than itemized SSO/SCIM/RBAC/IP
allowlisting/audit-log rows the way ChatGPT's table breaks it out.

**Severity:** P2 (stale/inaccurate marketing copy on a real, currently-under-construction sale
motion; CLAUDE.md explicitly treats "stale... labels" as a bug to fix immediately when
reproducible — this is reproducible by reading both files side by side). **Effort:** S (copy
fix) to M (if also itemizing the compare-table security rows). **Prior audit:** NEW.

---

## Not worth copying

- **ChatGPT's ad-supported paid tier (mqp-14).** Disclosing "may include ads" on an $8/month
  subscription is a trust-eroding pattern, not a feature to match. We already don't do this
  on Basic ($7/mo) — keep it that way.
- **Hiding the top usage multiplier's exact price behind a "From $100/month" headline
  (mqp-15).** Both ChatGPT Pro and Claude Max do this for their 20x tier. We already publish
  both Max 5x ($100) and Max 15x ($200) as separately, fully priced cards. Don't regress to
  a "from" price with an undisclosed ceiling.
- **ChatGPT's silent "Higher intelligence" auto-escalation toggle (mqp-07).** It overrides a
  user's manual model/effort choice for "complex" questions with, per the benchmark's own
  finding, no after-the-fact UI disclosure of whether a given response was escalated. We do
  not have an equivalent, and should not add one without solving disclosure first — this is
  the same principle behind our own already-filed fallback-transparency gap
  (`MODELS-004` in the prior audit: `managed-failover.ts` computes a `fallbackReason` that
  never reaches the streaming UI). If we ever build an auto-escalation feature, it should
  ship with the disclosure ChatGPT's version lacks, not copy the silent version.
- **Two different reset-time precisions for the same quota on two surfaces (mqp-10's
  ChatGPT bug).** Already covered in Strengths — we have the shared-vocabulary fix; don't let
  a future surface (e.g., a new mobile screen) bypass `formatUsageResetIn`/`managedUsageBucketLabel`
  and reintroduce this.

## Notes on claims not filed as gaps

- **mqp-04 (sticky account-wide effort default)** — `apps/web/shared/stores/thinking-store.ts:41-105`
  persists effort/enabled state via `zustand/persist` to `localStorage` under
  `agi-thinking-store`. This is sticky _within a browser_ across every new conversation
  (matching the spirit of the claim) but is device-local, not server-synced across devices
  the way an account-wide setting implies. Table stakes: false, single-product convergence —
  not filed as a formal gap, but worth knowing if cross-device parity ever becomes a goal.
- **mqp-05, mqp-06** (surface-specific effort vocabulary drift, independent Voice-mode model
  dial) are ChatGPT-specific surface quirks (a Work-mode composer and a Voice settings
  screen) that don't have a clean structural analog to check against in this codebase within
  this pass's scope — Voice is covered by the separate voice-media domain in the prior audit,
  and we have no equivalent "Work mode" surface with its own effort vocabulary to diverge.
- **mqp-23 (session-hour billing for managed agents)** is folded into G8 rather than filed
  separately — same underlying gap (nothing on any pricing/docs surface discloses wall-clock
  compute billing for the `agi_work` capability), same fix location.
