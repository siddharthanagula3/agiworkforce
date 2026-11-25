---
id: "F083-01"
type: "feature"
title: "Compare plans and pick monthly or yearly"
aliases: ["Pricing page", "Plans page", "Compare plans", "Plan-comparison dialog (S83.01)", "Monthly/annual toggle (S83.02)", "Team billing cadence toggle", "Upgrade chooser (/upgrade)", "What your plan includes (mobile)", "Code: Compare Plans (VS Code command)"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.01", "S83.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli", "mode:cloud", "mode:local", "mode:own-key", "plan:free", "plan:basic", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:enterprise", "api:GET /api/pricing/localized", "api:GET /api/waitlist", "file:packages/contracts/types/src/billing-catalog.ts", "file:apps/web/lib/server/stripe-client.ts", "store:agi.billing.pendingCheckout", "F083-02", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-01 Compare plans and pick monthly or yearly

The public /pricing page on web (and in the Desktop window, which loads the hosted web app) shows every plan side by side with localized prices, a comparison table, and a Monthly/Annual switch for Team. Mobile shows a read-only plan screen. VS Code has a Compare Plans pick list. None of these sell on mobile, VS Code, CLI or Chrome.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.01](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8301), [S83.02](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8302).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows what each AGI Workforce plan costs and includes before a person chooses. On web it also lets the buyer pick monthly or yearly billing for Team and starts the buy flow from the plan button.

**Why it exists.** A buyer must see price, usage and features side by side and see tax and billing terms before paying (brief S83.01, S83.02). Prices must come from the shared plan catalog and from localized Stripe prices, not from numbers typed into screens (AGENTS.md section 4).

**Who uses it.** Visitors, Free users deciding to upgrade, paying users looking at a higher plan, and team buyers choosing seats and cadence.

**Problems it solves**

- Buyer cannot judge plans without a side-by-side view.
- Buyer in India sees prices that include GST while others see prices without tax; the page says which.
- A region without a configured price must not offer a button that fails later.
- Team buyers need a yearly option only where a yearly price is really configured.

**Use cases**

- A visitor opens /pricing, switches to the Business tab and compares Team seat prices monthly versus annual.
- A Free user clicks a paid plan button and is sent to sign in, then returns to /pricing.
- A Premium subscriber opens /upgrade from chat and sees the next plan up with what it adds.
- A VS Code user runs Code: Compare Plans to see what each plan adds and opens the web page.

## 2. User experience

**Where to find it**

- Web: /pricing (apps/web/app/pricing/page.tsx). Desktop (Electron): the same hosted page, because the public Desktop window loads the hosted web app (doc: AGENTS.md section 5; apps/desktop/electron/config.ts:17).
- Web chat: the upgrade dialog (apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx) and /upgrade (apps/web/app/upgrade/UpgradeChooser.tsx). Settings, Billing has a 'Compare plans' link to /pricing for paid plans and 'Upgrade plan' / 'Adjust plan' to /upgrade (apps/web/features/settings/sections/BillingSection.tsx:771,789).
- Mobile: Settings, 'Subscription' screen, row 'What your plan includes' opens the screen titled 'Your plan' (apps/mobile/src/features/settings/cloud-billing/index.tsx:392; apps/mobile/src/features/settings/plans/index.tsx:104). The row and screen titled 'Compare plans' exist only when native purchases are compiled in (cloud-billing/index.tsx:550).
- VS Code: command 'Code: Compare Plans' (apps/extension-vscode/package.json:523-525).
- Chrome: menu opens /pricing?from=chrome-extension (apps/extension/src/side_panel.ts:12083). CLI prints 'Compare plans at <url>' in usage messages (apps/cli/src/usage_summary.rs:201).

**Before you start**

- Viewing /pricing needs no sign-in. Buying needs sign-in; a signed-out click on a plan button goes to sign-in and returns to /pricing (apps/web/app/pricing/page.tsx:602-607).
- Mobile needs a signed-in cloud account; signed-out users see a sign-in prompt (cloud-billing/index.tsx:343-349).
- Mobile reads the plan only once chat is set to Cloud; otherwise it says 'Your plan is read from your account once chat is set to Cloud.' (cloud-billing/index.tsx:158-162).

**Screens and controls**

- Web /pricing: audience tabs 'Individual' and 'Team & Enterprise' with aria-pressed (page.tsx:1012-1026); one card per individual plan with price and feature summary; Team band with seat rows, a seat-count input labelled 'Seats' (id team-seat-count), and a 'Team billing cadence' group with buttons 'Monthly' and 'Annual' (page.tsx:1050-1077; locale: packages/ui/i18n/locales/en/pricing.json:28,112).
- Web: text 'save N% annually' next to 'billed yearly' or 'billed monthly' (page.tsx:1104-1110).
- Web: a scrollable comparison table (PlanComparisonTable) with groups such as Usage (page.tsx:1257-1266).
- Plan button states: 'Checking account…' (disabled), 'Current plan', 'Update payment', 'Switch to <plan>', 'Manage billing', 'Join the <plan> waitlist', 'Enter access code', or the plan's upgrade label (page.tsx:494-600).
- Mobile 'Your plan' screen: one card for the current plan with usage line, context window line and an 'Includes' list (plans/index.tsx:115-198).
- VS Code pick list titled '<product>, what each plan includes' with an item 'Compare prices and upgrade on Web' (apps/extension-vscode/src/features/account-auth/planComparison.ts:67-89).

**Journey**

1. Open /pricing. The page shows the Individual tab.
2. Read each plan card and the comparison table. Prices are localized to the buyer's country; INR prices show that GST is included.
3. Open the Team & Enterprise tab. Pick Monthly or Annual in the cadence group. The group appears only when a yearly Team price is ready for the region (page.tsx:1049-1051).
4. Set the seat count; the page shows per-seat prices and a total.
5. Click the plan button. Signed out: go to sign-in and come back. Signed in without paid plan: waitlist check, then checkout (see F083-02). Paid plan: Individual plans go to /upgrade/<plan>, Team opens the order dialog (see F083-03).

**What the person sees and gets**

- Notices at the top: 'Checkout is temporarily unavailable...' when the client flag is off (page.tsx:972-976); 'Loading checkout availability…' and 'Checkout availability could not be verified. Refresh this page to try again.' while localized prices load or fail (page.tsx:991-1000); '<Plan> checkout is not available in your region yet.' under a plan with no ready price (page.tsx:895-898).
- Toasts 'Checkout is temporarily unavailable. Please try again later.' and '<Plan> checkout is unavailable in your region.' guard the click handler (page.tsx:626-633).
- Paid plan with overdue payment: 'Your last payment didn't go through...' with a link to Billing (page.tsx:978-989).

**Settings**

- Client flag NEXT_PUBLIC_CHECKOUT_ENABLED (default on; 0, false or off turns it off) must equal the server flag STRIPE_CHECKOUT_ENABLED (apps/web/features/billing/lib/localized-pricing.ts:17-30).
- Stripe price ids per plan, interval and currency are configuration read by getConfiguredPriceId (apps/web/lib/server/localized-pricing-service.ts:109).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web /pricing renders Individual and Team plans from the shared catalog and localized prices (apps/web/app/pricing/page.tsx:339-348,719-750; apps/web/lib/billing/pricing-page-matches-catalog.test.ts exists to pin it).
- Localized prices come from GET /api/pricing/localized, keyed by the x-vercel-ip-country header, cached 5 minutes with 1 hour stale-while-revalidate (apps/web/app/api/pricing/localized/route.ts:10-21).
- A price entry is checkoutReady only when the Stripe price exists, its amount equals the catalog amount and its tax behaviour matches the currency (apps/web/lib/server/localized-pricing-service.ts:121-130).
- The annual toggle shows only when the yearly Team price is checkoutReady (apps/web/features/billing/lib/localized-pricing.ts:119-128; page.tsx:377-380).
- The saving percent is computed as round((1 - yearly/12/monthly) x 100) from catalog prices (page.tsx:151-154).
- Individual plans always use monthly: selectedInterval returns monthly unless the plan is per seat (page.tsx:446-448). Docs agree: Basic, Premium, Max and Ultra are billed monthly only, Team monthly or yearly (doc: docs/product/definition.md:313).
- While account state is unknown the plan button reads 'Checking account…' and is disabled (page.tsx:494-500).
- Signed-out click sends the user to sign-in with return to /pricing or to the Team anchor with seats kept (page.tsx:602-607).
- Desktop (Electron) shows this same page (doc: AGENTS.md section 5).
- VS Code Compare Plans lists plans from the shared catalog and opens /pricing?from=vscode-extension-plans (apps/extension-vscode/src/core/commandSetup.ts:2175-2181; planComparison.ts:67-89).

**Incomplete**

- Mobile ships with native purchases off, so the screen is titled 'Your plan' and lists only the current plan, not a comparison (apps/mobile/src/features/settings/plans/index.tsx:100-108; apps/mobile/src/features/billing/storePurchases.json). The brief marks mobile 'done' (S83.01).
- CLI and Chrome have no comparison screen; they link to /pricing (apps/cli/src/usage_summary.rs:201; apps/extension/src/side_panel.ts:12083).

**Present but disconnected or switched off**

- Mobile full comparison (all plans, 'Compare plans' row and title, 'What each plan includes') is compiled off while storePurchases.json has nativePurchases false (plans/index.tsx:100-108; cloud-billing/index.tsx:351,550).
- apps/desktop/src/features/pricing/PlansModal.tsx belongs to the retained Tauri build and does not reach the Electron window (doc: AGENTS.md section 5).
- Web upgrades are gated by a waitlist or access code for accounts without a paid plan, so the plan button reads 'Join the <plan> waitlist' (apps/web/app/pricing/page.tsx:594-598; doc: docs/product/commercial.md:56-72).

**Not available**

- Yearly billing for Basic, Premium, Max and Ultra on every app (doc: docs/product/definition.md:313).
- A comparison screen inside CLI and Chrome.

## 4. Required behaviour

**Established requirements**

- A plan-comparison view lets the user compare price, usage and features before choosing. (source: S83.01)
- A monthly/annual toggle changes displayed prices and the cadence charged. (source: S83.02)
- Prices and the comparison table come from the shared catalog and localized prices, not hardcoded numbers. (source: doc: AGENTS.md section 4)
- Only Team is sold yearly; Basic, Premium, Max and Ultra are monthly only. (source: doc: docs/product/definition.md:313)
- India prices include 18% GST; every other price excludes tax, which is added at checkout. (source: doc: docs/product/definition.md:318-320)
- Local and own-key use are free and first-class; paid plans apply to Cloud. (source: doc: docs/product/definition.md:100)

**Acceptance criteria**

1. On /pricing every plan card price equals the localized price for the visitor's country, and equals the catalog price when no localized price exists.
2. The Annual button appears only when the region has a ready yearly Team price; with none, only monthly pricing shows.
3. Switching to Annual shows the yearly per-seat price per month, the text 'billed yearly' and a saving percent computed from catalog prices.
4. Clicking a paid plan button while signed out lands on sign-in and, after sign-in, returns to /pricing (or the Team anchor with the same seat count).
5. While account state is loading, the plan button is disabled and reads 'Checking account…'.
6. A plan with no ready price in the region shows the region notice and a disabled button.
7. Individual plan buttons never start a yearly checkout.
8. Mobile in the shipped build shows only the user's own plan with no purchase control.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Desktop Electron window needs network access to show /pricing because it is hosted [inferred from AGENTS.md section 5].
- The Annual default for a buyer with no paid plan is a design choice: teamAnnual falls back to true when no paid plan exists (page.tsx:378-379).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the mobile 'Your plan' screen say why other plans are not listed, or show a read-only comparison even with purchases off, to match the brief's 'done' status.
- [proposed] Add an automated check that the English strings for the pricing keys used here exist in every shipped locale.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Pricing page | `apps/web/app/pricing/page.tsx` | Plan cards, Team band, cadence toggle, comparison table, plan button logic, notices. |
| hook | useLocalizedPricing | `apps/web/features/billing/hooks/use-localized-pricing.ts` | Loads localized prices and a loading/ready/error status. |
| service | Localized price helpers | `apps/web/features/billing/lib/localized-pricing.ts` | CHECKOUT_ENABLED flag, teamYearlyCheckoutReady, teamBillingInterval, planCheckoutReady, notices. |
| endpoint | GET /api/pricing/localized | `apps/web/app/api/pricing/localized/route.ts` | Returns the localized price catalog for the caller's country. |
| service | Localized pricing service | `apps/web/lib/server/localized-pricing-service.ts` | Reads Stripe prices, caches 10 minutes, sets checkoutReady. |
| service | Plan card copy | `apps/web/features/billing/lib/plan-card-copy.ts` | Feature lines, CTA labels, usage copy for cards. |
| config | Billing plan catalog | `packages/contracts/types/src/billing-catalog.ts` | Plan ids, labels, USD prices, intervals, currency tax terms. |
| component | PlanComparisonTable | `apps/web/features/marketing/components/pricing/PlanComparisonTable.tsx` | Renders the comparison grid. |
| component | UpgradePlanDialog | `apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx` | Chat dialog that compares plans and starts upgrade. |
| screen | Upgrade chooser | `apps/web/app/upgrade/UpgradeChooser.tsx` | Shows current plan, next plan, what changes, proration note. |
| screen | Mobile plans screen | `apps/mobile/src/features/settings/plans/index.tsx` | Read-only plan list; current plan only when purchases are off. |
| screen | Mobile subscription screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Entry rows to the plan screen; early return when purchases are off. |
| config | Mobile purchase switch | `apps/mobile/src/features/billing/storePurchases.json` | nativePurchases flag, currently false. |
| command | agi-workforce.comparePlans | `apps/extension-vscode/src/core/commandSetup.ts` | Runs the VS Code comparison and opens web pricing. |
| service | showPlanComparison | `apps/extension-vscode/src/features/account-auth/planComparison.ts` | Quick pick of plans. |
| config | Desktop host origin | `apps/desktop/electron/config.ts` | Origin of the hosted app the Electron window loads. |
| component | Tauri PlansModal | `apps/desktop/src/features/pricing/PlansModal.tsx` | Retained Tauri plan modal, not in the Electron window. |
| test | Pricing page tests | `apps/web/app/pricing/page.test.tsx` | Plan rendering, tabs, gating, Team cadence. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser loads /pricing and asks GET /api/pricing/localized for prices. | device and our servers | apps/web/features/billing/hooks/use-localized-pricing.ts:18; apps/web/app/api/pricing/localized/route.ts:10 |
| Server looks up each configured price, expands currency options and marks it checkoutReady only when amount and tax behaviour match. | outside service | apps/web/lib/server/localized-pricing-service.ts:35-55,97-130 (calls the Stripe API) |
| Page computes the cadence: Annual is offered only if the yearly Team price is ready; the default is Annual for buyers without a paid plan, else the cadence of the live subscription. | device | apps/web/app/pricing/page.tsx:359-381 |
| Page reads the buyer's plan and upgrade-access state to decide the button text and whether it is enabled. | device and our servers | apps/web/app/pricing/page.tsx:421-445 (GET /api/waitlist via useUpgradeWaitlistStatus) |
| On mobile, the plans screen reads the plan from the tier store and renders catalog text; no purchase call is made in the shipped build. | device | apps/mobile/src/features/settings/plans/index.tsx:96-115; apps/mobile/__tests__/NoPurchasesBilling.test.tsx:111 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Localized price catalog (per plan and interval: amount, currency, taxIncluded, checkoutReady) | Server memory cache for Stripe price lookups (10 minutes); HTTP cache at the edge (5 minutes) | Not synced; read per visit | Expires by time; nothing stored per user (apps/web/lib/server/localized-pricing-service.ts:44-45; route.ts:17) |
| Chosen cadence and seat count | Page state only; seat count survives sign-in through the URL query | No | Lost on reload unless in the URL (page.tsx:602-607) |

**Models and providers.** No AI model or inference provider takes part. Prices and tax terms come from the payment service (Stripe) through apps/web/lib/server/stripe-client.ts. Which models a plan allows is shown as usage text only and is owned by SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing needs no account. Buying needs a signed-in account (apps/web/app/pricing/page.tsx:602). Mobile needs a signed-in cloud account (apps/mobile/src/features/settings/cloud-billing/index.tsx:343-349). |
| Permissions | None found in the code for viewing. Team purchase needs no role check on this page; workspace roles are in SYS-authorization-and-workspaces. |
| Subscription | The page reads the account's plan and status from the billing store to label buttons (page.tsx:365-372). A user on a store-billed or organization-managed plan gets a link to the owner of billing instead of a buy button (page.tsx:535-545,573-584). |
| Limits and metering | None found in the code for viewing prices. Usage allowances are shown as text from the shared catalog (apps/web/features/billing/lib/plan-card-copy.ts). |
| Feature flags | NEXT_PUBLIC_CHECKOUT_ENABLED (client) and STRIPE_CHECKOUT_ENABLED (server) must agree (apps/web/features/billing/lib/localized-pricing.ts:20-24). AGI_BILLING_WAITLIST_OPEN forces paid upgrades open (apps/web/lib/server/billing-waitlist-access.ts:28-30). Mobile: storePurchases.json nativePurchases and FEATURES.billing (apps/mobile/lib/v1FeatureFlags.ts:8). |
| Model compatibility | None found in the code; plan text lists capabilities, not model names, from the shared catalog. |
| Provider restrictions | Prices exist only where a Stripe price is configured for the buyer's currency; otherwise the plan shows as unavailable in that region (page.tsx:895-898). |
| Local mode | Local and own-key use need no plan and no payment. The pricing page footnote names Local and own-key as free (apps/web/app/pricing/page.tsx:1272-1278). Server checkout refuses with 'Paid-plan checkout is not available yet. Local and BYOK are free.' only when checkout is switched off (apps/web/app/api/checkout/route.ts:178-182). Mobile says the plan is read once chat is set to Cloud (cloud-billing/index.tsx:158-162). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Account still loading | Plan button shows 'Checking account…' and is disabled; purchase controls do not flash before identity is known. | apps/web/app/pricing/page.tsx:494-500; test apps/web/app/pricing/page.test.tsx:409 |
| Localized prices loading or failed | A status or alert line explains it; plan buttons stay disabled for signed-in non-subscribers. | apps/web/app/pricing/page.tsx:436-441,991-1000 |
| Plan without ready price in region | Notice under the plan and disabled button; a click handler also toasts the region message. | apps/web/app/pricing/page.tsx:455-458,895-898,630-633 |
| Checkout switched off | Page shows the checkout-disabled notice and disables paid buttons. | apps/web/app/pricing/page.tsx:972-976,441 |
| Yearly Team price not ready | The cadence group is hidden and the interval stays monthly. | apps/web/features/billing/lib/localized-pricing.ts:119-128 |
| Signed out | Plan button sends to sign-in and back. | apps/web/app/pricing/page.tsx:602-607; apps/web/e2e/checkout.spec.ts:8 |
| Subscription billed by a store or an organization | Button becomes a link naming who owns billing. | apps/web/app/pricing/page.tsx:535-545 |
| Mobile plan not confirmed | Says 'We couldn't read your plan just now. Your subscription has not changed.' and offers Try again. | apps/mobile/src/features/settings/plans/index.tsx:108-111; cloud-billing/index.tsx:158-162 |
| Accessibility | Tabs and cadence buttons use aria-pressed; cadence has a group label; table sits in a focusable labelled region. | apps/web/app/pricing/page.tsx:1012-1026,1050-1052,1257-1262 |
| Offline | not handled in the code beyond the loading/error notice for prices. | apps/web/app/pricing/page.tsx:991-1000 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/pricing/page.test.tsx`: Plans from catalog, tabs, Team seats and cadence, waitlist and checkout button behaviour, no flash before identity.
- `apps/web/lib/billing/pricing-page-matches-catalog.test.ts`: Pricing page agrees with the catalog.
- `apps/web/app/pricing/__tests__/pricing-locale-claims.test.ts`: Locale claims on the pricing page.
- `apps/web/app/api/pricing/localized/route.test.ts`: Localized pricing endpoint.
- `apps/web/lib/server/__tests__/localized-pricing-service.test.ts`: Price readiness and tax-behaviour matching.
- `apps/web/app/upgrade/UpgradeChooser.test.tsx`: Recommended plan, price, renewal wording on /upgrade.
- `apps/web/e2e/pricing-public.spec.ts`: Layout, contrast and billing toggle at several viewports.
- `apps/web/e2e/checkout.spec.ts`: Signed-out paid click goes to sign-up and returns to pricing.
- `apps/web/features/marketing/components/pricing/PlanComparisonTable.test.tsx`: Comparison table rendering.
- `apps/extension-vscode/src/__tests__/planComparison.test.ts`: VS Code plan rows in catalog order.
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Mobile ships with purchases off and shows the plan without a buy control.

**Test scenarios**

- **Annual toggle appears only with a ready yearly price**
  1. Open /pricing as a visitor in a region with a yearly Team price.
  2. Open the Team & Enterprise tab.
  3. Switch Monthly and Annual.
  4. Repeat with the yearly Team price unset.
  - Expected: With the price: Annual shows per-seat price per month, 'billed yearly' and a saving percent. Without it: no cadence group and monthly pricing only.
- **Signed-out purchase returns to pricing**
  1. Sign out.
  2. Open /pricing, set 3 Team seats, click the Team button.
  3. Sign in.
  - Expected: You land on /pricing with 3 seats at the Team anchor.
- **Region without a price**
  1. Use a country whose price for a plan has no ready Stripe price.
  2. Open /pricing signed in with no paid plan.
  - Expected: A notice 'checkout is not available in your region yet' shows and the button is disabled.
- **Mobile shipped build**
  1. Sign in on the phone build, set chat to Cloud.
  2. Open Settings, Subscription, 'What your plan includes'.
  - Expected: Screen 'Your plan' shows only the current plan; no price and no buy or compare control.
- **VS Code comparison**
  1. Run Code: Compare Plans.
  2. Choose 'Compare prices and upgrade on Web'.
  - Expected: Browser opens /pricing?from=vscode-extension-plans.

**Where to look when it fails**

- Server log warning '[localized-pricing] Stripe price lookup failed ... checkout stays closed for this price' (apps/web/lib/server/localized-pricing-service.ts:49).
- Browser network call to /api/pricing/localized and its checkoutReady fields.
- Env mismatch between NEXT_PUBLIC_CHECKOUT_ENABLED and STRIPE_CHECKOUT_ENABLED.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **Mobile 'compare plans' is a single-plan screen in the shipped build.** Affects: Mobile users (all plans). Evidence: apps/mobile/src/features/settings/plans/index.tsx:100-108; apps/mobile/src/features/billing/storePurchases.json. Work needed: Decide whether purchases-off mobile should list other plans read-only, or change the brief status to partial.
- **CLI, VS Code and Chrome only link to the web comparison; VS Code has its own pick list without prices.** Affects: CLI, Chrome users. Evidence: apps/cli/src/usage_summary.rs:201; apps/extension/src/side_panel.ts:12083. Work needed: None required by the brief (n/a); record as link-out.
- **Two flags (client and server) must be kept equal by hand.** Affects: Web and Desktop. Evidence: apps/web/features/billing/lib/localized-pricing.ts:20-24. Work needed: A guard or a single source for both flags [proposed].
- **Desktop 'done' depends on the hosted page; no test records the Electron window showing /pricing.** Affects: Desktop. Evidence: no Electron test found for /pricing in apps/desktop/electron/__tests__ (not exhaustively searched). Work needed: Drive the Electron window to /pricing and record the result.
- **The brief says checkout-off is explained by a toast; the page also shows a visible notice and disables the button, so the toast is only a backup.** Affects: Web, Desktop. Evidence: apps/web/app/pricing/page.tsx:441,626,972-976. Work needed: Update the brief wording.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli
- mode:cloud
- mode:local
- mode:own-key
- plan:free
- plan:basic
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:enterprise
- api:GET /api/pricing/localized
- api:GET /api/waitlist
- file:packages/contracts/types/src/billing-catalog.ts
- file:apps/web/lib/server/stripe-client.ts
- store:agi.billing.pendingCheckout
- F083-02
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-execution-boundaries

## Unknown

- Whether the yearly Team price is configured in production Stripe (environment values are not in the repository).
- Exact English text of keys such as basicCta, proCta, teamCta (not opened).
- Whether the chat upgrade dialog's onUpgrade callback sends users to /pricing or /upgrade (callback owner not read).
- Whether the Electron window was ever run on /pricing; no record found.
- The pricing numbers shown in a given region depend on Stripe prices not visible here.
