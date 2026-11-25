---
id: "F100-01"
type: "feature"
title: "Plans, prices and what a plan allows"
aliases: ["Plan catalog (S100.01)", "Price catalog (S100.02)", "Entitlement resolver (S100.03)", "BILLING_PLAN_PRICING", "EntitlementBundle", "resolveEntitlementBundle", "plan tier", "sellability"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.01", "S100.02", "S100.03"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "table:subscriptions", "file:packages/contracts/types/src/billing-catalog.ts", "file:apps/web/lib/services/entitlement-resolution.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-01 Plans, prices and what a plan allows

One shared catalog names every plan (Local Mode, Local Mode + BYOK, Free, Basic, Premium, Max, Ultra, Team, Team Premium, Enterprise), how it is sold, and its price. One server resolver then answers what an account may use right now. Checkout, usage limits and every app read these two sources.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.01](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10001), [S100.02](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10002), [S100.03](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10003).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Defines each plan tier, its label, its USD and INR price and interval, whether it can be bought self-serve, by seat upgrade, by contract, or not at all, and the catalog version a subscription was sold under (packages/contracts/types/src/billing-catalog.ts:166-231; packages/contracts/types/src/billing-plan-catalog.ts:18-29). A server resolver combines the account's own subscription row, a workspace seat and the payment status into one answer: plan, entitled yes or no, source, and a denial reason (apps/web/lib/services/entitlement-resolution.ts:211-228, 384-413).

**Why it exists.** So that checkout, pricing pages, usage limits and every app agree on what a plan is and what an account holds. A subscriber keeps the catalog version they bought under, so a later reprice is visible and never silent (billing-plan-catalog.ts:12-18; doc: docs/product/commercial.md section Grandfathered Plans And Catalog Versions).

**Who uses it.** Every server enforcement point (chat gate, quota checks, checkout), the web pricing and billing screens, and indirectly every app that shows a plan. Engineers and testers use it as the single source for 'what does this plan allow'.

**Problems it solves**

- Two services computing two different answers about the same user (the resolver says every entitlement question resolves in one place, entitlement-resolution.ts:213-216).
- A reprice silently changing what an existing customer agreed to (plan_catalog_version kept per subscription, billing-plan-catalog.ts:12-18).
- Hard-coded plan names and prices in each client (clients import the catalog from @agiworkforce/types, apps/web/app/billing/UpgradeWelcome.tsx:6).

**Use cases**

- A visitor compares plans on the pricing page, then starts checkout for one.
- A team member with no subscription of their own gets the workspace plan through a seat (entitlement-resolution.ts:376-413).
- A person whose card failed is served as Free with a billing notice header instead of being locked out (apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:343-352).
- A withdrawn plan sends a new buyer to its successor while an existing subscriber keeps the plan they bought (billing-plan-catalog.ts:31-35, 94-110).

## 2. User experience

**Where to find it**

- Web: pricing page at /pricing (apps/web/app/pricing/page.tsx:969, 915), upgrade chooser at /upgrade (apps/web/app/upgrade/UpgradeChooser.tsx:96), and Settings > Billing (apps/web/features/settings/sections/BillingSection.tsx:650).
- Desktop (Electron): shows the hosted web app, so the same web screens; Stripe pages open in the system browser (apps/web/features/billing/services/stripe-payments.ts:46-57).
- Mobile: Settings 'Subscription' screen shows the current plan and 'Compare plans'; with the build flag off it shows no purchase control (apps/mobile/src/features/settings/screenTitles.ts:2; apps/mobile/src/features/settings/cloud-billing/index.tsx:351-360, 550).
- CLI: /pricing and /upgrade print or open the web pricing URL (apps/cli/src/claude_parity.rs:219, 785-797).
- Chrome extension: menu entries open /pricing in a tab (apps/extension/src/side_panel.ts:12083, 14139).
- VS Code extension: no plan screen found in this read; usage-limit errors carry the plan message (apps/extension-vscode/src/utils/api.ts:875-882). A plan or purchase entry is unknown.

**Before you start**

- A signed-in account to see the account's own plan; the catalog itself is public data on the pricing page.
- To buy a paid plan: the paid-upgrade gate must allow the account (see F100-04).

**Screens and controls**

- Pricing page: one card per plan with its label from the catalog (apps/web/app/pricing/page.tsx:915); Team has a monthly or yearly cadence toggle, because only Team and Team Premium have yearly prices (billing-catalog.ts:200-216; doc: docs/decisions/2026-09-27-founder-decisions.md).
- Upgrade page headed 'Upgrade' with 'Usage this period' and a recommended plan (apps/web/app/upgrade/UpgradeChooser.tsx:96, 131, 196).
- Order panel: 'Order details', 'Payment method', and a 'Subscribe to <plan>' button (apps/web/features/billing/components/UpgradeOrderPanel.tsx:320, 508, 584).
- Enterprise is contract priced and has no self-serve price (billing-catalog.ts:226-230).

**Journey**

1. Open the pricing page and read the plan cards.
2. Choose a plan; the catalog says whether it is self-serve, seat upgrade, contract only or free (billing-plan-catalog.ts:61-67).
3. If self-serve, continue to the order panel and checkout (see F100-04). If contract only, the buyer is sent to sales: checkout answers 'is no longer sold self-serve. Contact sales to buy it.' (apps/web/app/api/checkout/route.ts:219-225).
4. After purchase the resolver reads the new subscription and every app sees the new plan.

**What the person sees and gets**

- Plan label and monthly price on the confirmation screen, with renewal or trial end (apps/web/app/billing/UpgradeWelcome.tsx:65-75, 96-110).
- A notice for yearly Pro subscribers that nothing changes for them (billing-plan-catalog.ts:56-59).
- For a lapsed paid plan the API still serves the turn as Free and sets header X-AGI-Billing-Notice with the subscription status (auth-gate.ts:68, 343-352).

**Settings**

- Plan data has no per-user setting; it is code in the shared package plus Stripe price ids read from environment variables named STRIPE_PRICE_* (apps/web/lib/pricing.ts:54-110).
- Regional price display depends on the country header and the Stripe price currency options (apps/web/lib/server/localized-pricing-service.ts:97-138; apps/web/app/api/checkout/route.ts:230-231).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Catalog of ten tiers (local-only, byok, free, basic, pro, max, max_15x, team, team_premium, enterprise) with labels Local Mode, Local Mode + BYOK, Free, Basic, Premium, Max, Ultra, Team, Team Premium, Enterprise (billing-catalog.ts:5-14, 166-231).
- Sellability is computed per plan: withdrawn, contract_only, seat_upgrade, self_serve or free_of_charge (billing-plan-catalog.ts:61-67). Catalog version is 4 (billing-plan-catalog.ts:18).
- Pro yearly billing is withdrawn for new sales as of 2026-09-27 and existing yearly subscribers are grandfathered (billing-plan-catalog.ts:43-59).
- Legacy tier names hobby and pro_plus fold into basic and max (billing-catalog.ts:1029-1041).
- Stripe price ids are mapped from plan, interval and currency to named environment variables for USD and INR (apps/web/lib/pricing.ts:54-110); other currencies are derived from the Stripe price's currency options (apps/web/lib/server/localized-pricing-service.ts:97-138).
- Checkout opens for a price only when the Stripe amount equals the published amount and the tax behavior matches the currency; otherwise it stays closed with a warning (localized-pricing-service.ts:140-180).
- If the Stripe price lookup fails, the page serves the catalog USD price and checkout stays closed (localized-pricing-service.ts:43-59).
- Resolver precedence: own entitled paid row, then a workspace seat, then the user's own lapsed or free row, then none (entitlement-resolution.ts:376-413). A seat counts only if the seat rank is within licensed seats and the owner's subscription is entitled (entitlement-resolution.ts:104-120).
- A user with no subscription row at all resolves as Free, entitled false, denial entitlement_missing; a lapsed or unpaid row resolves as Free with denial payment_required (entitlement-resolution.ts:289-302, 304-321).
- Every denial is recorded as a capability denial event (entitlement-resolution.ts:273-279).
- Plan resolution for a subscriber uses the catalog version they were sold under (apps/web/lib/services/plan-catalog-service.ts:70).

**Incomplete**

- The withdrawn-plan table is empty, so withdrawn sellability and successor routing have no live data yet (billing-plan-catalog.ts:36-41).
- Plan visibility per surface lists only web, desktop and mobile; there is no entry for CLI, VS Code or Chrome (billing-catalog.ts:233-246). Whether that is deliberate is unknown.
- Only USD and INR have configured Stripe price ids; any other currency depends on currency options set in Stripe, which this read could not inspect (pricing.ts:54-110).

**Present but disconnected or switched off**

- Paid purchase of any plan is gated for accounts that are not already paying (see F100-04); the catalog is shown but purchase is not open to everyone (apps/web/lib/server/billing-waitlist-access.ts:33-54; doc: docs/product/commercial.md section Paid Acquisition Gate).

**Not available**

- Enterprise has no self-serve price or checkout (billing-catalog.ts:226-230; checkout/route.ts:219-225).
- CLI, VS Code and Chrome show no plan comparison screen of their own; they open the web pricing page (claude_parity.rs:785-797; side_panel.ts:12083). VS Code entry unknown.

## 4. Required behaviour

**Established requirements**

- A single plan catalog defines each plan's tier, capabilities and limits and is what checkout and enforcement read. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.01)
- A price catalog maps each plan, interval and currency to a real charged price that pricing and checkout use. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.02)
- One service resolves what an account is entitled to (plan, seat, grace) and every enforcement point asks it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.03)
- A subscription keeps the catalog version it was sold under; moving a subscriber off it needs at least 30 days notice, takes effect at renewal, and states the right to cancel first. (source: doc: docs/product/commercial.md (Grandfathered Plans And Catalog Versions))
- One user has one billing owner (Stripe, Apple or Google) and one effective entitlement across all surfaces. (source: doc: docs/product/commercial.md (Subscription Ownership Across The Suite))
- Public plan names and prices are owned by billing-catalog.ts; display-name changes keep stored plan identifiers. (source: doc: docs/product/commercial.md (Plan Presentation And Usage Windows))

**Acceptance criteria**

1. Every tier in the catalog has a label, a sellability value and the current catalog version, and listPlanCatalog returns all ten.
2. A new buyer asking for a contract-only or seat-upgrade tier gets no purchasable plan; a withdrawn tier maps to its successor.
3. An account with no subscription row resolves as Free, entitled false, denial entitlement_missing; an account with a lapsed paid row resolves as Free with denial payment_required.
4. A workspace member with no own paid row inherits the workspace plan only while the owner's subscription is entitled and the member's seat rank is within licensed seats.
5. Asking with includeSeats false returns only the user's own plan.
6. When Stripe cannot return a price, the pricing page shows the catalog USD price and the checkout call for that price is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The catalog is meant to be the only place plan prices and labels are written, so a client that restates them is a defect [inferred from AGENTS.md section 4 and the shared import pattern].
- Local and own-key use needs no entitlement; the plans local-only and byok exist at price 0 only as labels [inferred from billing-catalog.ts:167-177 and checkout/route.ts:178-182].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add CLI, VS Code and Chrome to the plan surface list, or document why they are excluded.
- [proposed] Publish the current plan and catalog version in one read endpoint so each app can show it without a local copy.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | BILLING_PLAN_PRICING | `packages/contracts/types/src/billing-catalog.ts` | Plan tiers, labels, USD and INR prices, per-seat and contract flags (lines 166-231). |
| config | PLAN_SURFACE_VISIBILITY | `packages/contracts/types/src/billing-catalog.ts` | Which of web, desktop and mobile may select each plan (lines 233-253). |
| config | BILLING_PLAN_PRODUCT_LIMITS | `packages/contracts/types/src/billing-catalog.ts` | Per-plan product limits including concurrent turns (line 580). |
| service | plan catalog entries and sellability | `packages/contracts/types/src/billing-plan-catalog.ts` | Catalog version, sellability, withdrawn plans and intervals, successor resolution, spend cap helpers. |
| service | plan-catalog-service | `apps/web/lib/services/plan-catalog-service.ts` | catalogOffer, resolveCheckoutPlan and resolveSubscriberPlan (lines 52, 61, 70). |
| service | entitlement-resolution | `apps/web/lib/services/entitlement-resolution.ts` | resolveEntitlementBundle, seat lookup, usageAllowanceSubject (lines 384, 133-167, 241). |
| service | localized-pricing-service | `apps/web/lib/server/localized-pricing-service.ts` | Localized prices and checkout price selection from Stripe prices. |
| config | STRIPE_PRICE_POINTS | `apps/web/lib/pricing.ts` | Maps plan, interval and currency to the environment variable holding the Stripe price id (line 54). |
| service | regional-pricing | `apps/web/lib/regional-pricing.ts` | Country to currency and localized price resolution (lines 53, 61). |
| screen | Pricing page | `apps/web/app/pricing/page.tsx` | Public plan cards, Team cadence toggle, comparison and FAQ. |
| screen | UpgradeChooser | `apps/web/app/upgrade/UpgradeChooser.tsx` | Signed-in plan chooser headed 'Upgrade'. |
| component | UpgradeOrderPanel | `apps/web/features/billing/components/UpgradeOrderPanel.tsx` | Order details, tax note, payment method and Subscribe button. |
| screen | UpgradeWelcome | `apps/web/app/billing/UpgradeWelcome.tsx` | Shows the activated plan with its catalog label and price. |
| service | billing-waitlist-access | `apps/web/lib/server/billing-waitlist-access.ts` | Decides whether an account may start a paid purchase. |
| table | subscriptions | apps/web/db/neon/0300_subscription_plan_catalog_version.sql (not found) (not found) | Stores plan_tier, status, stripe ids and plan_catalog_version per user (column added in migration 0300 per doc: docs/product/commercial.md). |
| table | organizations / organization_members | `apps/web/lib/services/entitlement-resolution.ts` | Seat lookup reads billing_plan_tier, licensed_seats and membership order (lines 62-93). |
| service | auth-gate (chat) | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Calls resolveEffectiveSubscription and serves a lapsed plan as Free (lines 264, 343-352). |
| command | CLI /pricing and /upgrade | `apps/cli/src/claude_parity.rs` | Prints or opens the web pricing URL (lines 219, 785-797). |
| screen | Mobile Subscription screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Current plan and compare plans on mobile (lines 351-360, 550). |
| screen | Mobile plans comparison | `apps/mobile/src/features/settings/plans/index.tsx` | Lists compared plans only when native purchases are compiled in (lines 57-100). |
| component | Chrome side panel menu | `apps/extension/src/side_panel.ts` | Opens /pricing from the menu (line 12083). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A person opens the pricing page; the page reads plan labels and prices from the shared catalog in the web bundle. | device | apps/web/app/pricing/page.tsx:915; packages/contracts/types/src/billing-catalog.ts:166-231 |
| For localized prices the server maps the country to a currency, looks up the Stripe price (cached ten minutes) and marks the price checkout-ready only if amount and tax behavior match. | our servers | apps/web/lib/server/localized-pricing-service.ts:40-68, 97-138 |
| Stripe returns the price and its currency options. | outside service | apps/web/lib/server/localized-pricing-service.ts:52 |
| On any gated request the server resolves the entitlement: own subscription row, then workspace seat, then free or none, and builds one bundle with plan, status, entitled and denial reason. | our servers | apps/web/lib/services/entitlement-resolution.ts:384-413, 283-321 |
| The chat gate calls the resolver and, for a lapsed paid plan, serves the turn as Free with a billing notice header. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:264, 343-352 |
| The app reads the plan from the account and shows it. | device and our servers | apps/web/app/billing/UpgradeWelcome.tsx:54-75 (reads useBillingStore subscription) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Subscription row: plan tier, status, period, Stripe ids, plan_catalog_version | table subscriptions in the Neon database | Read by every app through the account API; one row per user | Written by the Stripe webhook and mobile store ledger; deletion handled by account erasure (apps/web/lib/server/account-erasure.ts, not read in detail); retention unknown |
| Price cache of Stripe prices | in-memory map on the server instance | No, per instance | Expires after ten minutes (localized-pricing-service.ts:40-41) |
| Capability denial event for each denied entitlement | observability layer (apps/web/lib/observability/denials.ts, imported at entitlement-resolution.ts:17) | unknown | unknown |

**Models and providers.** The catalog and resolver do not choose a model or provider. They decide the plan that later routing and limits read. The payment provider is Stripe for web and the app stores for mobile (doc: docs/product/commercial.md, Subscription Ownership). Model catalog and routing belong to SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading the catalog needs no account. Resolving an entitlement needs a user id from sign-in (entitlement-resolution.ts:384-389). |
| Permissions | Seat entitlement is resolved on a privileged connection scoped by the membership predicate, because row-level security hides the owner's row from a member (entitlement-resolution.ts:57-61). Workspace roles beyond membership: none found in this resolver. |
| Subscription | This feature defines the subscription rules. Entitled statuses are decided by isEntitledSubscriptionStatus and isEntitledSubscriptionStatusForTier from @agiworkforce/types (entitlement-resolution.ts:6-8, 339-350); their exact status lists were not read here. |
| Limits and metering | none found in the code for the catalog itself; limits that read the plan are covered in F100-02 and F100-03. |
| Feature flags | Paid purchase is gated by the billing-upgrades-open flag and AGI_BILLING_WAITLIST_OPEN (billing-waitlist-access.ts:28-40; apps/web/lib/feature-flags/billing-upgrade-gate.ts:15-38). STRIPE_CHECKOUT_ENABLED can switch checkout off (checkout/route.ts:58-62). |
| Model compatibility | none found in the code: the catalog does not list models. Model access by plan is handled elsewhere (see SYS-model-catalog-and-routing). |
| Provider restrictions | Plan prices are tied to Stripe price ids; app-store plans use store product ids from environment variables (see F100-05). |
| Local mode | The plans local-only (Local Mode) and byok (Local Mode + BYOK) exist at price 0 with unlimited product limits (billing-catalog.ts:167-177; BILLING_PLAN_PRODUCT_LIMITS local-only and byok entries at billing-catalog.ts:583-615). Checkout says 'Local and BYOK are free' (checkout/route.ts:178-182). Whether a local-mode turn ever calls the resolver is unknown; see SYS-local-inference. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No subscription row | Resolved as Free, entitled false, denial entitlement_missing. | apps/web/lib/services/entitlement-resolution.ts:289-302 |
| Lapsed or unpaid paid row | Plan becomes Free, entitled false, denial payment_required; chat serves the turn as Free with a billing notice header. | entitlement-resolution.ts:304-321; auth-gate.ts:343-352 |
| Seat lookup fails | Logs and falls back to the member's own row; with throwOnSeatLookupError set and a real membership it throws instead. | entitlement-resolution.ts:401-408 |
| Enterprise collection state unreadable | Entitlement is unavailable: the resolver rethrows (strict); the chat gate instead decides without it and treats the workspace as not read-only. | entitlement-resolution.ts:324-337; auth-gate.ts:40-50 |
| Enterprise billing past the read-only threshold | Chat refuses with billing_read_only (403). | auth-gate.ts:300-324 |
| Stripe price missing or mismatched | Price shown from catalog, checkout closed with a warning. | localized-pricing-service.ts:43-59, 163-177 |
| Offline or loading on the app | not handled in the code of the catalog; screens show 'Checking your plan…' on /upgrade (UpgradeChooser.tsx:110). | apps/web/app/upgrade/UpgradeChooser.tsx:110 |
| App differences | Mobile shows no purchase or comparison pricing when native purchases are not compiled in. | apps/mobile/src/features/settings/plans/index.tsx:57-100 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`: By file name: the plan catalog data. Contents not read.
- `packages/contracts/types/src/__tests__/billing-plan-catalog.test.ts`: By file name: sellability, withdrawal and spend cap helpers. Contents not read.
- `apps/web/lib/services/__tests__/plan-catalog-service.test.ts`: By file name: catalog offers and subscriber resolution. Contents not read.
- `apps/web/lib/services/__tests__/entitlement-resolution.characterization.test.ts`: By file name: current entitlement behaviour. Contents not read.
- `apps/web/lib/server/__tests__/localized-pricing-service.test.ts`: By file name: localized price and checkout readiness. Contents not read.
- `apps/web/lib/__tests__/pricing.test.ts`: By file name: Stripe price id mapping. Contents not read.
- `apps/web/lib/__tests__/regional-pricing.test.ts`: By file name: country to currency pricing. Contents not read.
- `apps/web/app/pricing/page.test.tsx`: By file name: pricing page render. Contents not read.

**Test scenarios**

- **Resolve a user with no subscription**
  1. Call resolveEntitlementBundle for a user with no row in subscriptions.
  2. Read plan, entitled and denialReason.
  - Expected: Plan free, entitled false, denialReason entitlement_missing.
- **Resolve a lapsed paid user**
  1. Set a user's subscription to a paid tier with an unpaid status.
  2. Call resolveEntitlementBundle.
  3. Send a chat turn with that user's token.
  - Expected: Bundle shows plan free and denial payment_required; the chat turn is served as Free with header X-AGI-Billing-Notice naming the status.
- **Seat inheritance**
  1. Create a Team workspace owner with an entitled subscription and licensed seats.
  2. Add a member who has no own paid row.
  3. Resolve the member's entitlement, once with includeSeats true and once false.
  - Expected: With seats the member gets the seat plan and source seat; without seats the member's own free or none result.
- **Stripe price lookup failure**
  1. Point a plan's price id environment variable at a price Stripe does not have.
  2. Open /pricing and attempt checkout for that plan.
  - Expected: Pricing shows the catalog USD price; checkout is refused with 'Checkout pricing is not configured'.
- **Contract plan is not self-serve**
  1. Post to /api/checkout with plan enterprise while signed in.
  - Expected: Validation error that the plan is no longer sold self-serve.

**Where to look when it fails**

- Log 'Seat entitlement lookup failed; falling back to no seat' and 'Enterprise collection state read failed; entitlement unavailable' (entitlement-resolution.ts:331-335, 405).
- Log '[localized-pricing] Stripe price lookup failed' (localized-pricing-service.ts:54).
- Table subscriptions columns plan_tier, status, plan_catalog_version; header X-AGI-Billing-Notice on chat responses.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief says an account with no live paid subscription resolves with entitlement_missing. Only an account with no subscription row does; a lapsed paid row gives payment_required.** Affects: Testers and any client that maps denial reasons.. Evidence: apps/web/lib/services/entitlement-resolution.ts:289-302, 320. Work needed: Correct the brief wording; make clients handle both reasons.
- **Surface visibility has no entry for CLI, VS Code or Chrome.** Affects: surface:cli, surface:vscode, surface:chrome. Evidence: packages/contracts/types/src/billing-catalog.ts:233-246. Work needed: Decide whether plan selection on those apps is intentionally web-only, then record it or extend the type.
- **Only USD and INR have configured price ids; the brief expects every currency a plan is sold in.** Affects: Buyers outside the US and India. Evidence: apps/web/lib/pricing.ts:54-110; localized-pricing-service.ts:113. Work needed: Confirm in Stripe which currency options exist; add a check that fails when a sold currency has no matching option.
- **Withdrawn-plan handling has no live data, so it has only been exercised by code paths and tests, not by a real withdrawal.** Affects: Future plan changes. Evidence: billing-plan-catalog.ts:36-41. Work needed: Run a staged withdrawal scenario before relying on it.
- **Paid purchase is open only to accounts that pass the acquisition gate, so the catalog's self_serve plans are not purchasable by everyone.** Affects: All new paying customers on web. Evidence: billing-waitlist-access.ts:33-54; doc: docs/product/commercial.md (Paid Acquisition Gate). Work needed: None until the owner opens upgrades; the flag already exists.

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- table:subscriptions
- file:packages/contracts/types/src/billing-catalog.ts
- file:apps/web/lib/services/entitlement-resolution.ts

## Unknown

- Whether any client other than the web bundle restates plan prices or labels.
- Which Stripe currency options exist beyond USD and INR in the live account.
- Whether a local-mode turn ever calls the resolver (see SYS-local-inference).
- The exact status lists inside isEntitledSubscriptionStatus and isEntitledSubscriptionStatusForTier.
- Whether VS Code has any plan or purchase entry.
- How long capability denial events are kept.
