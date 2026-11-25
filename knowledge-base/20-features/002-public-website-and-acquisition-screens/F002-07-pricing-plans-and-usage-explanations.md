---
id: "F002-07"
type: "feature"
title: "Pricing, plans and usage explanations"
aliases: ["Pricing page", "/pricing", "Plans and pricing", "Plan comparison table", "Team seats pricing", "Usage and credits explanation", "Paid upgrade waitlist (the gate in front of checkout)", "S2.22", "S2.23", "S2.25", "S2.26"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen failing", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.22", "S2.23", "S2.25", "S2.26"]
depends_on: ["surface:web", "mode:cloud", "plan:free", "plan:basic", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:enterprise", "file:packages/contracts/types/src/billing-catalog.ts", "file:apps/web/app/pricing/page.tsx", "api:POST /api/checkout", "api:GET /api/pricing/localized", "table:subscriptions", "table:beta_redemptions", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "SYS-shared-ui-and-design", "F002-08", "F002-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-07 Pricing, plans and usage explanations

The public /pricing page on the web app lists Free, Basic, Premium, Max and Ultra for individuals and Team (per seat) plus Enterprise for businesses, with a comparison table and usage notes. A signed-in visitor can start Stripe checkout, but new paid purchases are gated behind an upgrade waitlist or access code until the operator opens upgrades.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.22](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s222), [S2.23](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s223), [S2.25](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s225), [S2.26](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s226).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | seen failing |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows what each plan costs and includes, explains how managed (Cloud) usage works in weekly and monthly allowances, links to the credits help article, and lets a visitor start a paid purchase, choose Team seat counts, join the upgrade waitlist, or enter an access code (apps/web/app/pricing/page.tsx:269-1328).

**Why it exists.** Acquisition and honesty: visitors must see real prices and limits before paying, and the page must say that Local and own-key use are free and do not draw on Cloud usage (packages/ui/i18n/locales/en/pricing.json:237). The sales gate is a founder decision (doc: docs/product/commercial.md, Paid Acquisition Gate).

**Who uses it.** Prospective individual buyers, team buyers choosing seats, existing subscribers changing plan, and support or sales staff pointing to plan facts.

**Problems it solves**

- Visitor cannot tell which plan fits or what usage limits mean
- Team buyer needs per-seat pricing and a seat picker
- Operator needs to open or close paid purchasing without a deployment (apps/web/lib/server/billing-waitlist-access.ts:28-45)
- Price must show in the visitor's currency where one is sold (apps/web/app/api/pricing/localized/route.ts:9)

**Use cases**

- A signed-out visitor compares Premium and Max in the table, clicks the plan button and is sent to sign-up with a return to /pricing (apps/web/app/pricing/page.tsx:601-608).
- A team lead opens the Team and Enterprise view, sets 5 seats and 1 Premium seat and sees the total before starting checkout (page.tsx:1048-1203).
- A signed-in Free user whose account is not yet admitted sees plan buttons that join the waitlist, or enter an access code (page.tsx:566-597).
- A subscriber on an individual plan clicks a higher plan and is sent to /upgrade/<plan> (page.tsx:650-653).

## 2. User experience

**Where to find it**

- Web: /pricing, linked as Pricing in the footer Product column (apps/web/features/marketing/components/system/nav.ts:165-173). Header nav group wiring for Pricing was not opened: unknown.
- Desktop: the public Desktop shows the hosted web app (doc: AGENTS.md section 5), so /pricing is reachable there through the web app [inferred]; not opened.
- Mobile: no pricing or purchase screen; Mobile v1 sells nothing in the app (doc: docs/product/commercial.md, Paid Acquisition Gate).
- CLI, VS Code, Chrome: none found in the code for this feature.

**Before you start**

- None to read the page. Starting checkout needs a signed-in account (page.tsx:601-608).
- Paid purchase also needs upgrade access: upgrades open, or the account has redeemed an access code (apps/web/lib/server/billing-waitlist-access.ts:42-54).

**Screens and controls**

- Title and a two-button group: the individual audience button and the business audience button (Team and Enterprise) (page.tsx:1006-1031).
- Individual cards: Free, Basic, Premium, Max, Ultra, each with price per month, body text, one action button and a feature list; Ultra carries an asterisk footnote about the missing five-hour cap (page.tsx:880-960).
- Free card button is a link to sign-in or home (page.tsx:926-929).
- Team band: Monthly / Annual toggle (shown only when yearly checkout is ready), Standard and Premium seat rows, seat count number input, Premium seat count input, running total, Team button, 'Contact sales' link (page.tsx:1048-1206).
- Enterprise card: Custom price and Contact sales link to /contact-sales (page.tsx:1213-1226).
- Plan button states: Checking account, Update payment, Current plan, Manage billing, a switch-to-plan button, Join <plan> waitlist, Enter access code (page.tsx:494-600).
- Comparison table with groups Usage, Models, Research, Projects, Tools, Admin; footnote on Local and BYOK; link to the FAQ (page.tsx:1251-1296).
- Dialogs: UpgradeConfirmDialog (Team change), UpgradeWaitlistDialog, DowngradeReviewDialog (page.tsx:1300-1325).

**Journey**

1. Open /pricing; the individual plans show first.
2. Optionally switch to the Team and Enterprise view; a #pricing-team-title hash with ?seats=N opens it with N seats (page.tsx:304-326).
3. For Team, set seats and Premium seats and, if offered, switch Monthly/Annual.
4. Press the plan button. Signed out: go to sign-up and return to /pricing (page.tsx:601-608).
5. Signed in and not admitted: the waitlist dialog opens (page.tsx:624-630).
6. Signed in and admitted: a toast says redirecting to checkout and the browser is handed to the Stripe checkout page (page.tsx:673-700; apps/web/features/billing/services/stripe-payments.ts:208-232). The redirect step itself was not opened [inferred].
7. After payment Stripe returns to /billing?success=true (apps/web/app/api/checkout/route.ts:501); cancel returns to /pricing (route.ts:502).
8. An existing Stripe subscriber upgrading a plan goes to /upgrade/<plan>, or confirms a Team change in a dialog, then the page polls up to 6 times, 1 second apart, for the plan to change (page.tsx:167-168, 650-662).

**What the person sees and gets**

- Notice 'Checkout is temporarily unavailable...' when the web flag is off (apps/web/features/billing/lib/localized-pricing.ts:32-33).
- Notices for loading or failed checkout availability, and a region notice per plan (localized-pricing.ts:34-40; page.tsx:960-995).
- Alert for a failed payment with a link to Billing (page.tsx:978-987).
- Toasts: 'Checkout is temporarily unavailable. Please try again later.', region unavailable, 'Your plan has been upgraded.' (page.tsx:632-640, 1303).
- Server message 'Paid-plan checkout is not available yet. Local and BYOK are free.' (apps/web/app/api/checkout/route.ts:178-181).
- A 403 with 'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.' (billing-waitlist-access.ts:20-21, 56-66).

**Settings**

- Settings > Billing handles payment method, portal and plan changes after purchase (page.tsx:980-985, route links). Not opened in detail.
- Operator switches: NEXT_PUBLIC_CHECKOUT_ENABLED, STRIPE_CHECKOUT_ENABLED, STRIPE_SECRET_KEY, flag billing.upgrades_open, AGI_BILLING_WAITLIST_OPEN (names only).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- All plan prices, labels, seat limits and surface visibility come from the shared billing catalog: Free $0, Basic $7, Premium $20, Max $100, Ultra $200 per month, Team $25 per seat monthly or $240 yearly, Team Premium seat $125 or $1200, Enterprise contract-priced (packages/contracts/types/src/billing-catalog.ts:166-231; MIN_PURCHASABLE_SEATS=2 at :157).
- Individual plans are sold monthly only; only Team has a yearly option, and the toggle appears only when yearly checkout is ready (page.tsx:1051; apps/web/features/billing/lib/localized-pricing.ts:119). Checkout rejects a yearly interval for a plan that does not sell it (apps/web/lib/validations/checkout.ts:30-36).
- Localized prices come from GET /api/pricing/localized using the trusted country header, cached 300 seconds (apps/web/app/api/pricing/localized/route.ts:9-20).
- Comparison table cells are computed from catalog functions (canUseBillingPlanCapability, getBillingPlanProductLimits, canAccessModelForSubscriptionTier) and show 'coming soon' for unreleased capabilities (page.tsx:140-215, 745-868).
- Usage note: weekly and monthly allowances, Ultra has no five-hour cap, no fixed message count, and a flagship-model share (apps/web/features/billing/lib/plan-card-copy.ts:366-374; page.tsx:1242). Credits, running out, keep-going switch, concurrency and the free lane are explained in the public help article (apps/web/content/support/usage-and-credits.md:9-53).
- POST /api/checkout is what the buttons call (apps/web/features/billing/services/stripe-payments.ts:222). It checks CSRF (route.ts:173), the checkout flag and secret key (route.ts:178), a rate limit (route.ts:184), plan-change rules (route.ts:189), trusted-country price (route.ts:231), upgrade access (route.ts:298-309), billing-owner policy (route.ts:312), live-subscription conflicts, trial rules, then creates a Stripe Checkout session requiring terms acceptance and allowing promotion codes (route.ts:517-522) and records a checkout_started audit event.
- The route supports Team seats and Premium seats as two line items (route.ts:244-266) and the page offers a real per-seat checkout (test: apps/web/app/pricing/page.test.tsx 'offers Team as a real per-seat checkout instead of a sales hand-off').

**Incomplete**

- Whether each table cell matches what the server enforces is not established: cells derive from catalog functions, but the enforcement call sites were not opened. The brief says this was not checked.
- The Premium-seat input is hidden for accounts that already hold a paid plan; it points them to settings (page.tsx:1160-1175).
- Existing-subscriber Team changes use a dialog while individual changes go to /upgrade/<plan> (page.tsx:650-662).

**Present but disconnected or switched off**

- Paid purchase is closed by default for accounts without access: the gate returns 403 until the operator opens upgrades (flag billing.upgrades_open, forced open by AGI_BILLING_WAITLIST_OPEN=1) or the user redeemed a code (beta_redemptions) (apps/web/lib/server/billing-waitlist-access.ts:28-54; doc: docs/product/commercial.md).
- Both checkout flags default to on and turn off on 0, false or off (page: localized-pricing.ts:26-30; route.ts:58-62). They must be kept equal by hand (localized-pricing.ts:22-25).

**Not available**

- Desktop, mobile, CLI, VS Code and Chrome have no pricing page of their own (brief: n/a). Mobile has no purchase flow (doc: docs/product/commercial.md).
- Local Mode and Local Mode + BYOK are not columns or cards; they are named in a footnote as always free (en/pricing.json:237).

## 4. Required behaviour

**Established requirements**

- A public pricing page lists individual plans with prices and lets a visitor buy one; its plan copy matches enforcement. (source: brief S2.22)
- A public page shows Team per-seat pricing and lets a buyer choose seats and purchase. (source: brief S2.23)
- A plan-comparison table lists plans against features and each cell matches enforcement. (source: brief S2.25)
- Public pages explain how managed usage, allowances and credits work. (source: brief S2.26)
- Paid checkout code does not open paid purchasing; an access-code or waitlist decision comes before checkout, and clients do not fork the rule. (source: (doc: docs/product/commercial.md, Paid Acquisition Gate))
- Public plan names and prices are owned by billing-catalog.ts; changing the audience view does not change account, channel or entitlement; the top tier has no five-hour cap and the card footnote says that is not unlimited use. (source: (doc: docs/product/commercial.md, Plan Presentation And Usage Windows))
- Mobile v1 sells nothing in the app. (source: (doc: docs/product/commercial.md, Paid Acquisition Gate))

**Acceptance criteria**

1. Every plan card and table price equals the catalog value for the visitor's currency, and Free shows no purchase.
2. With the checkout flag off, paid buttons are disabled and the unavailable notice shows; POST /api/checkout answers with the 'not available yet' message.
3. A signed-out press on a paid plan goes to sign-up and returns to /pricing; Team keeps its seat count in the return link.
4. A signed-in account without upgrade access never reaches Stripe: it gets the waitlist or access-code path and the API returns 403.
5. Team total equals Standard seats x seat price + Premium seats x Premium price for the chosen interval.
6. Individual plans offer no annual choice; Team shows Annual only when yearly checkout is ready.
7. The usage note and the credits article match enforced windows (to be confirmed against server limits).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A table cell that says 'included' should be backed by the same capability check the server uses [inferred from the brief's 'each cell matches enforcement'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that compares every table cell with the server-side entitlement check.
- [proposed] Derive the public and server checkout flags from one setting so they cannot diverge.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | PricingPage | `apps/web/app/pricing/page.tsx` | Client page: cards, Team seat picker, comparison table, plan actions, dialogs. |
| config | Pricing layout and metadata | `apps/web/app/pricing/layout.tsx` | Page title, description and query provider. |
| config | BILLING_PLAN_PRICING and plan helpers | `packages/contracts/types/src/billing-catalog.ts` | Canonical plans, prices, seat limits, surface visibility, plan predicates. |
| service | plan-card-copy | `apps/web/features/billing/lib/plan-card-copy.ts` | Card bodies, feature lists, usage comparison and usage explainer text. |
| service | localized-pricing helpers | `apps/web/features/billing/lib/localized-pricing.ts` | NEXT_PUBLIC_CHECKOUT_ENABLED flag, notices, localized amounts, checkout readiness. |
| endpoint | GET /api/pricing/localized | `apps/web/app/api/pricing/localized/route.ts` | Per-country price catalog, cached 300 s. |
| service | stripe-payments client | `apps/web/features/billing/services/stripe-payments.ts` | upgradeTo*Plan functions that POST /api/checkout with an idempotency key; portal and upgrade calls. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Gates, validates and creates the Stripe Checkout session. |
| schema | CheckoutRequestSchema | `apps/web/lib/validations/checkout.ts` | Plan, interval, seat and Premium seat rules. |
| service | billing-waitlist-access | `apps/web/lib/server/billing-waitlist-access.ts` | Upgrade-access decision, 403 response, forced-open env switch. |
| config | billing.upgrades_open flag | `apps/web/lib/feature-flags/billing-upgrades.ts` | Run-time flag key for opening paid upgrades. |
| component | UpgradeWaitlistDialog / UpgradeConfirmDialog / DowngradeReviewDialog | `apps/web/features/billing/components` | Imported by the page (page.tsx:88-93); internals not opened. |
| other | usage-and-credits article | `apps/web/content/support/usage-and-credits.md` | Public help article on usage, credits and limits. |
| config | pricing copy strings | `packages/ui/i18n/locales/en/pricing.json` | All pricing page text, including the Local/BYOK footnote. |
| table | subscriptions | `apps/web/db/neon/0003_subscriptions.sql` | Read by checkout for the existing plan and billing owner (route.ts:279-292). |
| table | beta_redemptions | `apps/web/lib/server/billing-waitlist-access.ts` | Rows here mean an access code was redeemed (query at :46-50). |
| test | pricing page tests | `apps/web/app/pricing/page.test.tsx` | Component tests for the page. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser loads /pricing and renders prices from the catalog; localized prices are fetched. | device and our servers | apps/web/app/pricing/page.tsx:269-300; apps/web/app/api/pricing/localized/route.ts:9 |
| Page reads the signed-in account, billing and upgrade-access status to choose each button. | device and our servers | apps/web/app/pricing/page.tsx:271-276, 429-433 |
| Press a paid plan: unauthenticated goes to sign-up; unadmitted opens the waitlist dialog; admitted calls POST /api/checkout. | device | apps/web/app/pricing/page.tsx:601-700 |
| Server verifies CSRF, flag, key, rate limit, plan-change rules, price, upgrade access, billing owner and existing Stripe state. | our servers | apps/web/app/api/checkout/route.ts:173-330 |
| Server creates or reuses a Stripe customer, expires older open checkout sessions and creates a new Stripe Checkout session. | outside service | apps/web/app/api/checkout/route.ts:330-540 |
| Server records a checkout_started audit event and returns the Stripe URL. | our servers | apps/web/app/api/checkout/route.ts:540-560 |
| Payment happens on Stripe; the subscription webhook later writes the plan. The page polls for the change. | outside service | apps/web/app/pricing/page.tsx:277-290 (comment says /api/upgrade returns before the webhook writes plan_tier); webhook handler apps/web/app/api/stripe-webhook not opened |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Stripe customer id on the profile | profiles.stripe_customer_id | Server database; not device-synced | unknown (retention not opened) |
| Checkout started audit event | security audit log via recordAuditEvent | server only | append-only audit trail per apps/web/app/privacy/page.tsx survivors table; exact retention unknown |
| Checkout idempotency key and attempt id | Stripe session metadata | Stripe | Stripe retention (not our setting) |

**Models and providers.** No AI model takes part. Payment provider is Stripe. Plan copy lists which model tiers a plan admits using catalog functions (page.tsx:215-245); the page does not choose or call models.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Viewing needs none. Checkout needs a signed-in account (page.tsx:601-608; route.ts:171 getUserScopedDb). |
| Permissions | Checkout is user-scoped; an existing non-Stripe billing owner (store purchase) is refused with a conflict (route.ts:312-314). |
| Subscription | This feature sells the AGI Subscription plans. Plan set from billing-catalog.ts:166-231. New paid purchase needs upgrade access (billing-waitlist-access.ts:42-54). |
| Limits and metering | Seats 2 to 999999 (billing-catalog.ts:157-158). Checkout rate-limited under the 'checkout' bucket (route.ts:184); API deadline BILLING_API_ROUTE_DEADLINE_MS. The page documents weekly and monthly allowances; metering itself is not in this feature. |
| Feature flags | NEXT_PUBLIC_CHECKOUT_ENABLED (page), STRIPE_CHECKOUT_ENABLED and STRIPE_SECRET_KEY (route), billing.upgrades_open flag, AGI_BILLING_WAITLIST_OPEN, trial and referral rules (route.ts:360-380). |
| Model compatibility | The table lists model tiers by the minimum plan; no model names are fixed in this page (built from getAllowedModelsForTier, page.tsx:215-225). |
| Provider restrictions | Stripe checkout; prices exist per currency and region, otherwise the plan shows 'not available in your region yet' (localized-pricing.ts:34-40). Team Premium seats must use the same currency (route.ts:246-251). |
| Local mode | Local mode has no purchase and needs no plan; the page says Local Mode and Local Mode + BYOK are always free and not part of the table (en/pricing.json:237). The page is a web page, so it does not run on a device in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading account | Plan buttons show 'Checking account…' and are disabled until the auth store is initialised. | apps/web/app/pricing/page.tsx:494-501 |
| Checkout flag off | Notice shown and paid buttons disabled; server refuses with the 'not available yet' message. | page.tsx:436-441, 973-976; route.ts:178-181 |
| Price list loading or failed | Loading or error notice; signed-in non-subscribers cannot press paid buttons unless on the waitlist path. | page.tsx:988-995, 436-441 |
| Region has no price | Per-plan region notice and error toast; server returns 'Checkout pricing is not configured...'. | page.tsx:640-643; route.ts:233-237 |
| Payment overdue | Buttons become 'Update payment' links to Settings > Billing. | page.tsx:503-509, 978-987 |
| Double press | Buttons are disabled while a plan is pending; the server also uses an idempotency key and expires older open sessions. | page.tsx:436-437; route.ts:454-480 |
| Already has a live Stripe subscription | Server refuses with a conflict message pointing to Billing. | route.ts:393-410 |
| Network failure on checkout | Error toast via toUserMessage; no automatic retry. Server maps Stripe connection errors to a retry message. | page.tsx:690-699; route.ts:589-606 |
| Accessibility | Toggle buttons use aria-pressed, the table has a labelled scroll region, status notices use role=status or alert. | page.tsx:1006-1031, 1251-1262 |
| Offline | not handled in the code on this page beyond fetch errors. | apps/web/app/pricing/page.tsx (searched; no offline handling found) |
| Translation | Page uses the pricing i18n namespace; a test requires every key in every supported language. | apps/web/app/pricing/pricingCorpusCoverage.test.ts:1-30 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/pricing/page.test.tsx`: Plan cards from the catalog, audience switch, Team per-seat checkout and seat totals, waitlist versus direct checkout, double press, billing notices.
- `apps/web/__tests__/api/checkout.test.ts`: POST /api/checkout: 401, body validation, session creation, enterprise rejection, Max 20x plan, trusted-country currency, tax collection, annual rejection for monthly-only plans, no portal bypass for subscribers.
- `apps/web/app/pricing/pricingCorpusCoverage.test.ts`: Every pricing translation key exists in every language with the same placeholders.
- `apps/web/app/api/pricing/localized/route.test.ts`: Country header use and the US fallback.
- `apps/web/features/billing/lib/plan-card-copy.test.ts`: Project count and storage wording for plan cards.
- `apps/web/e2e/checkout.spec.ts`: Signed-out paid CTA goes to sign-up and returns; anonymous caller cannot create a session.
- `apps/web/e2e/pricing-public.spec.ts`: Layout, contrast, pinned plan headers and Standard/Premium seat rows at set viewports.

**Test scenarios**

- **Gate holds for an unadmitted account**
  1. Sign in as a Free account without an access code and with billing.upgrades_open off.
  2. Open /pricing and press Premium.
  3. Call POST /api/checkout directly with a valid CSRF token.
  - Expected: UI offers waitlist or access code; the API answers 403 with the 'opening in stages' message; no Stripe session exists.
- **Flag off**
  1. Set NEXT_PUBLIC_CHECKOUT_ENABLED and STRIPE_CHECKOUT_ENABLED to 0.
  2. Open /pricing.
  - Expected: Unavailable notice, disabled paid buttons; API returns 'Paid-plan checkout is not available yet. Local and BYOK are free.'
- **Team seats and total**
  1. Open /pricing#pricing-team-title?seats=5.
  2. Set 1 Premium seat; toggle Annual if shown.
  - Expected: Seat picker shows 5; total equals 4 Standard plus 1 Premium for the interval; Premium input is capped at the seat count.
- **Table matches catalog**
  1. Open the individual view.
  2. Compare every row for Basic and Ultra with billing-catalog limits and the server's enforced limits.
  - Expected: Each cell agrees; any mismatch is a defect (this check has not been run).
- **Region without a price**
  1. Request from a country without a price entry.
  2. Press a plan.
  - Expected: Region notice, error toast, no checkout.

**Where to look when it fails**

- Server log lines 'Refusing checkout: Stripe is already billing a subscription', 'Failed to verify existing subscription', 'Stripe rejected checkout session creation' (apps/web/app/api/checkout/route.ts).
- Audit event checkout_started in the security audit trail.
- Tables: subscriptions, profiles (stripe_customer_id), beta_redemptions.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **Brief and draft cite pricing/page.tsx:1355 for usage copy, but the file has 1328 lines; the copy is built at page.tsx:1242 and plan-card-copy.ts:366.** Affects: Engineers and testers following the brief (web). Evidence: apps/web/app/pricing/page.tsx:1242; apps/web/features/billing/lib/plan-card-copy.ts:366. Work needed: Update the brief's code references.
- **The first draft said monthly and yearly switching applies to the page; in code only Team has the Annual choice.** Affects: Testers (web). Evidence: apps/web/app/pricing/page.tsx:1051; apps/web/lib/validations/checkout.ts:30-36. Work needed: Correct the use text and test plans.
- **Test title says 'keeps Team sales-assisted until seat and organization provisioning is wired', yet the route and page support per-seat Team checkout. The test posts no seats, so it fails on the seat-required rule, not on a sales hand-off.** Affects: Test readers (web). Evidence: apps/web/__tests__/api/checkout.test.ts:180-191; apps/web/lib/validations/checkout.ts:40-46. Work needed: Rename the test and add a Team case with seats.
- **Plan copy versus enforcement is unverified.** Affects: Buyers on all plans (web). Evidence: brief S2.22 and S2.25 'not checked'; cells derive from catalog functions at page.tsx:745-868. Work needed: Trace each table row to its server enforcement call and add an automated comparison.
- **Release-note copy names old plan labels (Pro, Max 5x, Max 20x) while the catalog labels are Premium, Max and Ultra.** Affects: Visitors reading /release-notes (web). Evidence: apps/web/lib/changelog-entries.ts:14; packages/contracts/types/src/billing-catalog.ts:193-205. Work needed: Decide whether history keeps old names, and note the rename.
- **Two checkout flags are set by hand and can diverge.** Affects: Operators (web). Evidence: apps/web/features/billing/lib/localized-pricing.ts:20-25. Work needed: Use one source or add a deploy check.
- **No paid acquisition for new buyers until the operator opens upgrades; for most visitors the page ends at a waitlist.** Affects: Prospective buyers (web). Evidence: apps/web/lib/server/billing-waitlist-access.ts:42-54; doc: docs/product/commercial.md. Work needed: Operator decision; no code change.

**Depends on**

- surface:web
- mode:cloud
- plan:free
- plan:basic
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:enterprise
- file:packages/contracts/types/src/billing-catalog.ts
- file:apps/web/app/pricing/page.tsx
- api:POST /api/checkout
- api:GET /api/pricing/localized
- table:subscriptions
- table:beta_redemptions
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- SYS-shared-ui-and-design
- F002-08
- F002-10

## Unknown

- Whether each comparison cell matches server enforcement.
- What happens after Stripe returns the URL on the client (redirect code not opened).
- Header navigation entry for Pricing (only the footer entry was confirmed).
- Exact retention of checkout audit events.
- What UpgradeWaitlistDialog stores and where (not opened).
- Whether Desktop shows /pricing inside its window.
