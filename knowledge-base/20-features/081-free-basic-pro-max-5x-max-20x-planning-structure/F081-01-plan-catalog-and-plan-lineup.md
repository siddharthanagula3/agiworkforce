---
id: "F081-01"
type: "feature"
title: "Plan catalog and plan lineup"
aliases: ["Plan catalog", "Billing catalog", "BILLING_PLAN_PRICING", "Plan lineup", "Versioned plan catalog (S81.01)", "Free/Basic/Pro/Max 5x/Max 20x planning structure (area name)", "Stored ids: free, basic, pro (shown as Premium), max (shown as Max), max_15x (shown as Ultra), team, team_premium, enterprise", "Brief names 'Pro', 'Max 5x', 'Max 15x', 'Max 20x' for the stored ids pro, max, max_15x"]
area: "81 Free / Basic / Pro / Max 5x / Max 20x planning structure"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S81.01", "S81.02", "S81.03", "S81.04", "S81.05", "S81.06", "S81.22", "S81.28"]
depends_on: ["SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "F081-02", "F081-03", "F081-04", "F081-06", "table:subscriptions", "table:token_credits", "api:POST /api/checkout", "api:GET /api/pricing/localized"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F081-01 Plan catalog and plan lineup

One shared list in packages/contracts/types defines every AGI plan: its stored id, public label, price, seat rule and which feature it adds. Web pricing, checkout, mobile, CLI and VS Code read it. Each paid subscription records the catalog version it was sold under so a later change does not silently rewrite it.

Area: [81. Free / Basic / Pro / Max 5x / Max 20x planning structure](README.md). Requirement items: [S81.01](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8101), [S81.02](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8102), [S81.03](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8103), [S81.04](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8104), [S81.05](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8105), [S81.06](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8106), [S81.22](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8122), [S81.28](../../10-requirements/capabilities/081-free-basic-pro-max-5x-max-20x-planning-structure.md#s8128).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Defines the plan lineup (Free, Basic, Premium, Max, Ultra, Team, Team Premium, Enterprise, plus the no-charge Local and own-key tiers) with label, monthly price in USD and INR, yearly price for seat plans, and whether a plan is per seat or contract priced (packages/contracts/types/src/billing-catalog.ts:166). A second file adds a catalog version number, a sellability class and withdrawal rules (packages/contracts/types/src/billing-plan-catalog.ts:18,39,69). Checkout, the Stripe webhook and entitlement resolution use it.

**Why it exists.** So that price, label and plan rules are written once and every app and server check agrees. The version number lets a later price or allowance change reach new buyers while existing buyers keep what they bought (doc: docs/product/commercial.md, section 'Grandfathered Plans And Catalog Versions').

**Who uses it.** Every signed-in person who views plans or pays; the web checkout and Stripe webhook; engineers who add or reprice a plan; testers checking that pricing copy matches the catalog.

**Problems it solves**

- Prices and labels drifting between web, mobile, CLI and VS Code
- A reprice rewriting what an existing subscriber bought
- Old stored plan spellings (hobby, pro_plus) breaking clients
- Selling a plan that has been withdrawn

**Use cases**

- A visitor compares plan columns on the web pricing page and sees each price and label
- A buyer starts checkout for Premium; the session metadata carries the current catalog version and the webhook stores it on the subscription
- A CLI user runs the plans command and sees every plan label with its credits and added features
- An old row with the tier spelling 'hobby' is read as Basic

## 2. User experience

**Where to find it**

- Web: Pricing page at /pricing, titled 'Pricing', with an Individual and a Business toggle and a comparison table (apps/web/app/pricing/page.tsx:269,792)
- Web: Upgrade page at /upgrade, heading 'Upgrade' (apps/web/app/upgrade/UpgradeChooser.tsx:43,99)
- Desktop (public Electron app): shows the hosted web app, so the same pricing and upgrade pages (apps/desktop/electron/config.ts:17,64; apps/desktop/electron/main.ts:1065)
- Desktop (internal Tauri build only, not the public window): modal titled 'Plans & Pricing' (apps/desktop/src/features/pricing/PlansModal.tsx:50)
- Mobile: Settings > 'Subscription' screen, row 'What your plan includes', then the plans screen titled 'Your plan' (or 'Compare plans' when store purchases are on) (apps/mobile/src/features/settings/cloud-billing/index.tsx:392; apps/mobile/src/features/settings/plans/index.tsx:99)
- CLI: command 'plans' ('Show what each plan includes and its credits per window') (apps/cli/src/lib.rs:1059; apps/cli/src/plans.rs:198)
- VS Code: command 'Code: Compare Plans' (apps/extension-vscode/package.json:524; apps/extension-vscode/src/core/commandSetup.ts:2175)
- Chrome: no plan list; the More menu entry 'Upgrade plan' opens the web pricing page (apps/extension/src/side_panel.ts:12083; apps/extension/_locales/en/messages.json:4505)

**Before you start**

- Web pricing page can be read without an account; the plan marked 'Current plan' needs sign-in (apps/web/app/pricing/page.tsx:494)
- Mobile, CLI, VS Code and Chrome need a signed-in AGI account to show the plan they hold
- Mobile reads the plan only when chat is set to Cloud (apps/mobile/src/features/billing/store.ts:73)

**Screens and controls**

- Web: plan cards for Free, Basic, Premium, Max, Ultra with price, one-line body and feature list; Business tab shows Team (seat count box, Standard and Premium seats, Monthly/Annual toggle) and Enterprise ('Contact sales') (apps/web/app/pricing/page.tsx:716,1070)
- Web comparison table groups: usage, models, research, projects, tools, admin (apps/web/app/pricing/page.tsx:793)
- Mobile plans screen: one card per plan with usage line, context line and 'Includes' or 'Adds over <current plan>' list; no prices (apps/mobile/src/features/settings/plans/index.tsx:77,150)
- CLI: text rows 'Plan (your plan): credits ...' and 'Includes:' or 'Adds over <plan>:' (apps/cli/src/plans.rs:198)
- VS Code: quick pick of plans plus 'Compare prices and upgrade on Web' (apps/extension-vscode/src/features/account-auth/planComparison.ts:67,71)

**Journey**

1. Open the plans view on the app (see where to find it)
2. The app loads the catalog it was built with; web also loads regional prices from /api/pricing/localized (apps/web/app/api/pricing/localized/route.ts:9)
3. Read each plan's price, label and what it adds over the plan below
4. To buy, web goes to checkout or the confirm dialog (see F081-06); CLI, VS Code and Chrome open the web pricing page; mobile shows only the held plan while store purchases are off

**What the person sees and gets**

- Web button states: 'Checking account…', 'Current plan', 'Update payment' when overdue (apps/web/app/pricing/page.tsx:494-530)
- Web notice when checkout is switched off: CHECKOUT_DISABLED_NOTICE (apps/web/app/pricing/page.tsx:972)
- Web note when a plan is not sold in the person's region (apps/web/app/pricing/page.tsx:476, renderRegionNotice)
- Mobile text 'We couldn't read your plan just now. Your subscription has not changed.' when the plan check fails (apps/mobile/src/features/settings/plans/index.tsx:108)

**Settings**

- Web display currency follows the visitor's country header via the localized pricing endpoint (apps/web/app/api/pricing/localized/route.ts:10)
- Env flag STRIPE_CHECKOUT_ENABLED (server) must equal NEXT_PUBLIC_CHECKOUT_ENABLED (page); both default to on (apps/web/app/api/checkout/route.ts:58; apps/web/features/billing/lib/localized-pricing.ts:20-30)
- Mobile build file storePurchases.json key nativePurchases decides whether plans are listed (apps/mobile/src/features/billing/storePurchases.json:2)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Catalog defines 10 tiers with labels and prices: Free $0; Basic $7; Premium $20; Max $100; Ultra $200 (INR 399/1999/9999/19999); Team $25 per seat monthly or $240 yearly; Team Premium $125 monthly or $1200 yearly; Enterprise contract-priced (packages/contracts/types/src/billing-catalog.ts:166-232)
- Individual plans have a monthly price only; only seat plans have a yearly price (billing-catalog.ts:166-232; doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01)
- Catalog version is 4 (packages/contracts/types/src/billing-plan-catalog.ts:18). Checkout puts it in session metadata (apps/web/app/api/checkout/route.ts:463); the webhook stores it at purchase and keeps it on renewal while the price is unchanged (apps/web/app/api/stripe-webhook/lib/db.ts:811,1117,1348); column added by migration 0300 (apps/web/db/neon/0300_plan_catalog_version.sql:26)
- Unknown or old tier spellings: hobby reads as Basic, pro_plus as Max, anything else as Free for display and entitlement (billing-catalog.ts:1029-1043)
- A buyer asking for a withdrawn plan is sent to its successor; a contract-only plan is refused self-serve (billing-plan-catalog.ts:94; apps/web/app/api/checkout/route.ts:220-226)
- Yearly Premium was withdrawn on 2026-09-27 and is grandfathered with a notice (billing-plan-catalog.ts:43,56)
- Web pricing, upgrade chooser, mobile plans, CLI plans and VS Code compare all read the shared catalog (apps/web/features/billing/lib/plan-card-copy.ts:37; apps/mobile/src/features/settings/plans/index.tsx:3; apps/cli/src/plans.rs:15; apps/extension-vscode/src/features/account-auth/planComparison.ts:2)

**Incomplete**

- The allowance table is the same object for catalog versions 1 to 4, so no subscription is actually held to different allowances yet (packages/contracts/types/src/managed-usage-limits.ts:89-96; test: managed-usage-limits.test.ts:62-65)
- WITHDRAWN_BILLING_PLANS is empty, so plan-level grandfathering and successor routing have never been exercised with data (billing-plan-catalog.ts:39)
- The internal Tauri desktop plan cards hardcode their own bullets, for example 'One Cloud project' for Free, while the catalog gives Free 5 projects (apps/desktop/src/features/pricing/PlanCard.tsx:39; billing-catalog.ts:580-600)
- Web pricing labels every app except Web 'Coming soon' (apps/web/lib/surface-status.ts:6)

**Present but disconnected or switched off**

- Mobile plan lineup and prices are not shown: with nativePurchases false the plans screen lists only the held plan (apps/mobile/src/features/settings/plans/index.tsx:99-100; apps/mobile/src/features/billing/storePurchases.json:2)
- Mobile FEATURES.billing is false (apps/mobile/lib/v1FeatureFlags.ts:6)
- Connectors are marked coming soon, so plan lists hide or label them (packages/contracts/types/src/connector-release.ts:14; apps/web/features/billing/lib/plan-capability-release.ts:47-60)
- New paid upgrades are staged behind a waitlist or access code unless AGI_BILLING_WAITLIST_OPEN=1 or the run-time gate is open (apps/web/lib/server/billing-waitlist-access.ts:28-40; doc: docs/product/commercial.md line 24)

**Not available**

- Chrome has no in-extension plan comparison; it opens the web page (apps/extension/src/side_panel.ts:12083)
- No self-serve purchase of Enterprise (billing-plan-catalog.ts:94; checkout route.ts:223)

## 4. Required behaviour

**Established requirements**

- One plan catalog with a version number drives pricing and checkout, and each subscription records the version it was sold under. (source: S81.01 (brief))
- Free, Basic, Pro, Max 5x and Max 15x each have a defined, priced bundle shown on pricing and in-app and enforced from the catalog. (source: S81.02 to S81.06 (brief))
- Subscribers on a retired plan or price keep what they bought; new buyers are sent to the successor. (source: S81.22 (brief); doc: docs/product/commercial.md 'Grandfathered Plans And Catalog Versions')
- Each plan explains what it adds over the current plan and why a blocked feature needs a given plan. (source: S81.28 (brief))
- Individual plans are billed monthly only; Team keeps monthly and yearly; yearly Premium is withdrawn but existing yearly subscribers keep their price. (source: doc: docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01)
- Moving a subscriber off the catalog version they bought needs 30 days' notice, takes effect only at renewal and states the right to cancel first. (source: doc: docs/product/commercial.md 'Grandfathered Plans And Catalog Versions')
- Public plan names and prices are owned by billing-catalog.ts; display-name changes keep stored identifiers. (source: doc: docs/product/commercial.md 'Plan Presentation And Usage Windows')

**Acceptance criteria**

1. Every price and label on web pricing, the upgrade chooser, mobile plans, CLI plans and VS Code compare equals the catalog value for that plan id
2. A new Premium purchase writes subscriptions.plan_catalog_version equal to the catalog version at checkout
3. A renewal on the same Stripe price keeps the stored version; a renewal on a different price writes the current version
4. A subscription row with tier spelling 'hobby' is shown and gated as Basic; an unknown spelling is shown as Free
5. A checkout request for Enterprise is refused with the message that it is no longer sold self-serve
6. Individual plan cards show no yearly price or Annual toggle; only Team shows one

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A plan added to the catalog should appear on web pricing without editing the page, because plan-catalog-service builds offers from the catalog (apps/web/lib/services/plan-catalog-service.ts:61-85) [inferred]
- When the allowance table first differs between versions, each subscription must read the table of its stored version, which the reservation path is wired to do through token_credits.plan_catalog_version (apps/web/db/neon/0300_plan_catalog_version.sql header) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Replace hardcoded Tauri plan-card bullets with the shared catalog copy, or remove the card set if the Tauri build stays internal
- [proposed] Add a test that fails when a new catalog version is added without a distinct entry in MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION when allowances changed
- [proposed] Give the mobile plans screen a read-only price line from the catalog so the plan lineup reads the same on all apps

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | BILLING_PLAN_PRICING and plan helpers | `packages/contracts/types/src/billing-catalog.ts` | Plan ids, labels, USD/INR prices, per-seat and contract flags, ladder, aliases, normalizer (lines 5-232, 1029-1043) |
| config | BILLING_PLAN_CATALOG_VERSION and sellability | `packages/contracts/types/src/billing-plan-catalog.ts` | Version 4, withdrawn plans and intervals, successor routing, grandfather helpers |
| config | MANAGED_USAGE_LIMITS_BY_CATALOG_VERSION | `packages/contracts/types/src/managed-usage-limits.ts` | Per-version allowance lookup (lines 89-115); versions 1 to 4 map to one table |
| service | plan-catalog-service | `apps/web/lib/services/plan-catalog-service.ts` | catalogOffer, resolveCheckoutPlan, resolveSubscriberPlan, catalogVersionSold, catalogVersionAtRenewal |
| service | entitlement-resolution | `apps/web/lib/services/entitlement-resolution.ts` | Builds the entitlement bundle with plan and sold-under version (buildBundle line 283) |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Resolves purchasable plan, picks regional Stripe price, stamps plan_catalog_version in metadata (lines 220-231, 463) |
| integration | Stripe webhook subscription writer | `apps/web/app/api/stripe-webhook/lib/db.ts` | Stores and keeps plan_catalog_version at purchase and renewal (lines 811, 1117, 1348) |
| schema | Migration 0300 plan_catalog_version | `apps/web/db/neon/0300_plan_catalog_version.sql` | Adds the column to subscriptions and token_credits and backfills version 1 |
| table | subscriptions | `apps/web/db/neon/0300_plan_catalog_version.sql` | Holds plan_tier and plan_catalog_version per subscription |
| table | token_credits | `apps/web/db/neon/0300_plan_catalog_version.sql` | Holds the catalog version each credit period was allocated under |
| endpoint | GET /api/pricing/localized | `apps/web/app/api/pricing/localized/route.ts` | Regional price list by country header, cached 300 s |
| screen | PricingPage | `apps/web/app/pricing/page.tsx` | Plan cards, Team seat picker, comparison table, CTA states |
| service | plan-card-copy | `apps/web/features/billing/lib/plan-card-copy.ts` | Card bullets, usage comparison lines, seat rows, CTA labels |
| service | plan-display | `apps/web/features/billing/lib/plan-display.ts` | Plan display model and upgrade/downgrade change summary |
| screen | UpgradeChooser | `apps/web/app/upgrade/UpgradeChooser.tsx` | Next-plan card and secondary plans from a blocked feature |
| service | plan-capability-release | `apps/web/features/billing/lib/plan-capability-release.ts` | Hides or labels capabilities not yet released (coming soon) |
| screen | Mobile PlansScreen | `apps/mobile/src/features/settings/plans/index.tsx` | Mobile plan list or held plan only |
| screen | Mobile CloudBillingScreen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Subscription screen, current plan, link to plans |
| config | storePurchases.json | `apps/mobile/src/features/billing/storePurchases.json` | Build-time switch for store purchases |
| command | CLI plans | `apps/cli/src/plans.rs` | Prints plans from an embedded copy of managed-usage-limits.ts and a Rust capability table |
| command | agi-workforce.comparePlans | `apps/extension-vscode/src/features/account-auth/planComparison.ts` | VS Code plan comparison quick pick |
| screen | Tauri PlansModal and PlanCard | `apps/desktop/src/features/pricing/PlansModal.tsx` | Internal Tauri plan modal with its own hardcoded copy (PlanCard.tsx:22) |
| config | Electron cloud shell origin | `apps/desktop/electron/config.ts` | Public desktop window loads the hosted web app |
| test | billing catalog tests | `packages/contracts/types/src/__tests__/billing-catalog.test.ts` | Prices, ladder, limits, fail-closed behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app renders plans from the catalog compiled into it (web, mobile, VS Code, Chrome via shared package; CLI via embedded text of the allowance file and a Rust capability table). | device | apps/cli/src/plans.rs:15,91; apps/mobile/src/features/settings/plans/index.tsx:3; apps/web/app/pricing/page.tsx:156 |
| Web asks for regional prices and which plans can be checked out in the person's country. | our servers | apps/web/app/api/pricing/localized/route.ts:9-18 |
| A buyer starts checkout; the server resolves the purchasable plan, picks the regional Stripe price and sends the current catalog version in session metadata. | our servers | apps/web/app/api/checkout/route.ts:220-231,463 |
| Stripe hosts payment and sends events to our webhook. | outside service | apps/web/app/api/stripe-webhook/lib/db.ts:811 |
| The webhook writes subscriptions.plan_catalog_version at purchase, keeps it on a same-price renewal and replaces it when the price changes. | our servers | apps/web/app/api/stripe-webhook/lib/db.ts:811,1117-1140; apps/web/lib/services/plan-catalog-service.ts:93-103 |
| On every request the entitlement bundle carries the plan and the version it was sold under. | our servers | apps/web/lib/services/entitlement-resolution.ts:283-320 |
| Clients learn the plan from the account endpoint (mobile calls /api/me?surface=mobile) and cache it. | device and our servers | apps/mobile/src/features/billing/store.ts:79-110; apps/web/app/api/me/route.ts:317 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| plan_tier and plan_catalog_version per subscription | table subscriptions | Written by the Stripe webhook; read by every surface through the account endpoint | Kept with the subscription row; column is NULL for old rows meaning current catalog (apps/web/db/neon/0300_plan_catalog_version.sql) |
| Catalog version of each credit period | table token_credits | Server only | Per period; the next period records the version again |
| Cached plan on the phone | mobile device store tier-store (MMKV) | Refreshed from /api/me when chat is in Cloud | Cleared on sign-out by clearAccountEntitlements (apps/mobile/src/features/billing/store.ts:149,112-135) |

**Models and providers.** The plan catalog itself names no model or provider. Which models a plan may use is a separate rule in the model catalog (packages/contracts/types/src/model-catalog.ts:2216); see F081-03 and SYS-model-catalog-and-routing. Stripe is the payment service (outside service).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing the web pricing page needs no account. A current-plan marker and any purchase need a signed-in account. Mobile, CLI, VS Code and Chrome show the held plan only after sign-in. |
| Permissions | Buying a plan changes the account's own subscription. Team seat purchase needs the buyer to become the workspace owner. Admin-only pricing edits: none found in the code; the catalog is a source file. |
| Subscription | Not applicable to reading the catalog. Self-serve paid tiers: Basic, Premium, Max, Ultra, Team (billing-catalog.ts:23). Enterprise is contract only. |
| Limits and metering | The catalog holds no metering itself; allowances are in managed-usage-limits.ts (see F081-02) and product limits in billing-catalog.ts (see F081-03). Seat count must be between 2 and 999,999 (billing-catalog.ts:157-158). |
| Feature flags | STRIPE_CHECKOUT_ENABLED and NEXT_PUBLIC_CHECKOUT_ENABLED (checkout on/off); AGI_BILLING_WAITLIST_OPEN (forces paid upgrades open); MOBILE_IAP_ENABLED (server side of mobile store sales); mobile FEATURES.billing and storePurchases.json nativePurchases. Production values unknown. |
| Model compatibility | None found in the code for the catalog itself; the catalog is model agnostic. |
| Provider restrictions | Payment via Stripe on web; Apple and Google stores on mobile when switched on (apps/web/lib/server/mobile-iap-catalog.ts:53-56). No model-provider restriction in the catalog. |
| Local mode | The catalog carries 'local-only' and 'byok' tiers at price 0 with no managed usage (billing-catalog.ts:166-181; managed-usage-limits.ts:31-34). In Local mode the mobile app does not read the plan at all (apps/mobile/src/features/billing/store.ts:73); the CLI plans command reads only the local cache and needs no network (apps/cli/src/plans.rs:240-248). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web button 'Checking account…' while auth loads; mobile shows 'Checking your plan…' | apps/web/app/pricing/page.tsx:494-500; apps/mobile/src/features/settings/cloud-billing/index.tsx:159-165 |
| Plan read fails | Mobile says 'We couldn't read your plan just now. Your subscription has not changed.' and offers 'Try again'; cached tier is kept | apps/mobile/src/features/settings/plans/index.tsx:108; apps/mobile/src/features/billing/store.ts:117-121 |
| Checkout switched off | Web shows a notice and disables paid plan buttons | apps/web/app/pricing/page.tsx:972-976,355 |
| Plan not sold in region | Web shows a region notice under the plan | apps/web/app/pricing/page.tsx:476-482 (renderRegionNotice) |
| Unknown tier value | Display and entitlement fall back to Free; the limit getters return nothing (fail closed) for a non-catalog string | packages/contracts/types/src/billing-catalog.ts:1035-1043,741-745 |
| Withdrawn plan requested | Buyer is sent to the successor, or refused if none | packages/contracts/types/src/billing-plan-catalog.ts:94-105 |
| Offline | Mobile keeps the cached plan; web page not handled in the code for offline pricing beyond error notice (CHECKOUT_AVAILABILITY_ERROR_NOTICE) | apps/mobile/src/features/billing/store.ts:149-168; apps/web/app/pricing/page.tsx:60-66 |
| Accessibility | Mobile plan cards are one accessible element with a spoken summary; web audience toggle uses aria-pressed | apps/mobile/src/features/settings/plans/index.tsx:118-132; apps/web/app/pricing/page.tsx:1023-1050 |
| App differences | Web shows prices; mobile, CLI and VS Code show usage and features only; Chrome shows nothing and links out | apps/mobile/src/features/settings/plans/index.tsx:150-199; apps/cli/src/plans.rs:198-236; apps/extension/src/side_panel.ts:12083 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`: Ultra stored id and label, Team per seat, Enterprise contract-priced, monthly-only individual plans, INR prices, capability tiers, fail-closed unknown tiers, product limits (test titles read)
- `packages/contracts/types/src/__tests__/billing-plan-catalog.test.ts`: Catalog covers every plan, version stamping, sellability, no withdrawn plan today, yearly Premium withdrawn, grandfather notice, purchasable and grandfathered resolution (test titles read)
- `packages/contracts/types/src/__tests__/plan-tier-conformance.test.ts`: Cross-app agreement of plan answers; CLI copies are registered with it (apps/cli/src/plans.rs:456); contents not read
- `apps/web/lib/services/__tests__/plan-catalog-service.test.ts`: Plan catalog service behaviour; contents not read
- `apps/web/lib/billing/pricing-page-matches-catalog.test.ts`: Pricing page against catalog; contents not read
- `apps/web/app/pricing/page.test.tsx`: Pricing page rendering; contents not read
- `apps/web/features/billing/lib/plan-card-copy.test.ts`: Card copy; contents not read
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Mobile billing screens with store purchases off; references the plans screen; contents not read
- `apps/extension-vscode/src/__tests__/planComparison.test.ts`: VS Code plan comparison rows; contents not read
- `apps/cli/src/plans.rs`: Inline Rust tests: plan order and labels, credits per plan, 'Adds over' lines, BYOK shows no marked plan (lines 273-505)
- `apps/desktop/src/features/pricing/PlansModal.test.tsx`: Internal Tauri plans modal; contents not read

**Test scenarios**

- **Price and label parity**
  1. Open /pricing as a signed-out visitor
  2. Read each individual card price and label
  3. Compare with run of the CLI plans command and VS Code Compare Plans
  - Expected: Labels read Free, Basic, Premium, Max, Ultra; web prices equal the catalog ($7, $20, $100, $200); CLI and VS Code list the same labels in the same order
- **Catalog version stamped**
  1. Complete a test-mode Premium checkout on a non-production deployment
  2. Read subscriptions.plan_catalog_version for the user
  - Expected: Value equals BILLING_PLAN_CATALOG_VERSION (4); a renewal on the same price leaves it unchanged
- **Old tier spelling**
  1. Set a test subscription plan_tier to hobby
  2. Open the account endpoint and the pricing page
  - Expected: Plan shows as Basic with Basic limits
- **Mobile with store purchases off**
  1. Sign in to a build with nativePurchases false
  2. Open Settings > Subscription > What your plan includes
  - Expected: Title 'Your plan'; only the held plan is listed; no price or buy control
- **Enterprise self-serve refused**
  1. POST /api/checkout with plan enterprise while signed in
  - Expected: Validation error that the plan is no longer sold self-serve and to contact sales

**Where to look when it fails**

- Server log and error text 'is no longer sold self-serve' (apps/web/app/api/checkout/route.ts:223)
- subscriptions.plan_catalog_version and token_credits.plan_catalog_version rows
- Stripe webhook handler logs around apps/web/app/api/stripe-webhook/lib/db.ts:1117-1140
- GET /api/me plan.effective_tier and plan.tier fields (apps/web/app/api/me/route.ts:317)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/web/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Desktop: [70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/desktop/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Mobile: [70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/mobile/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- CLI: [70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/cli/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- VS Code: [70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/vscode/081-free-basic-pro-max-5x-max-20x-planning-structure.md)
- Chrome: [70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md](../../70-qa/test-plans/chrome/081-free-basic-pro-max-5x-max-20x-planning-structure.md)

## 10. Gaps and dependencies

- **Grandfathering of allowances is machinery without data: every catalog version reads the same allowance table, and no plan has been withdrawn** Affects: Existing subscribers when a future reprice or allowance change ships; web, desktop, mobile, CLI, VS Code, Chrome. Evidence: packages/contracts/types/src/managed-usage-limits.ts:89-96; packages/contracts/types/src/billing-plan-catalog.ts:39; test managed-usage-limits.test.ts:62-65. Work needed: When allowances change, add a distinct table for the new version and keep the old one; add a test that an old-version subscription still reads the old table
- **Brief says 'Pro' and 'Max 5x/Max 20x/Max 15x'; the stored ids are pro, max, max_15x and the public labels are Premium, Max, Ultra, so the same plan has three names** Affects: Testers, support and engineers reading code, brief and docs. Evidence: packages/contracts/types/src/billing-catalog.ts:166-232; apps/cli/src/plans.rs:288 (test name still says max_20x). Work needed: Pick one naming list in the knowledge base and rename stale test titles
- **Mobile shows no plan lineup or price while store purchases are off** Affects: Mobile users on Free who want to compare plans. Evidence: apps/mobile/src/features/settings/plans/index.tsx:99-100; apps/mobile/src/features/billing/storePurchases.json:2. Work needed: Owner decision on whether read-only plan comparison should show on mobile before purchases open
- **Internal Tauri plan cards use hardcoded bullets that disagree with the catalog (Free 'One Cloud project' vs 5 projects)** Affects: Internal Tauri desktop build. Evidence: apps/desktop/src/features/pricing/PlanCard.tsx:39; packages/contracts/types/src/billing-catalog.ts:580-600. Work needed: Derive bullets from the catalog or retire the modal
- **Chrome has no plan comparison and its pricing copy is unverified** Affects: Chrome users. Evidence: apps/extension/src/side_panel.ts:12083; brief S81.07/S81.28 'unverified'. Work needed: Decide whether a link-out is enough; verify the copy in the side panel
- **Docs say downgrade is not a code path, but the code schedules downgrades** Affects: Readers of docs/product/commercial.md. Evidence: docs/product/commercial.md section 'Plan Change, Proration, And Subscription State Transitions' vs apps/web/app/api/billing/downgrade-preview/route.ts:60-120. Work needed: Update commercial.md (code wins)

**Depends on**

- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- F081-02
- F081-03
- F081-04
- F081-06
- table:subscriptions
- table:token_credits
- api:POST /api/checkout
- api:GET /api/pricing/localized

## Unknown

- Whether the production Stripe account has a price for every plan and region (apps/web/app/api/checkout/route.ts:231 refuses when none)
- Production values of the checkout, waitlist and mobile store flags
- Whether the Tauri desktop build ships to anyone
- Contents of the tests listed as 'contents not read'
