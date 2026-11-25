---
id: "F083-04"
type: "feature"
title: "Tax, billing address and tax ID"
aliases: ["Tax and total price (S83.06)", "Billing address (S83.11)", "Tax identifier (S83.12)", "VAT/GST number", "Stripe Tax", "Tax is calculated at checkout"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.06", "S83.11", "S83.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:POST /api/checkout", "api:POST /api/billing/top-up", "api:POST /api/upgrade/preview", "api:GET /api/billing/invoices", "file:apps/web/lib/billing/tax-policy.ts", "file:packages/contracts/types/src/billing-catalog.ts", "F083-02", "F083-03", "SYS-security-and-privacy", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-04 Tax, billing address and tax ID

Tax is worked out by the payment provider from the buyer's location. US-dollar prices exclude tax and tax is added at checkout; INR prices include GST. Checkout requires a full billing address and offers a business tax ID. Mid-cycle upgrades show a Tax row. The product keeps no address or tax ID itself.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.06](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8306), [S83.11](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8311), [S83.12](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8312).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Makes sure a buyer sees tax and a total before paying, can type a full billing address and, for business, a VAT/GST number that lands on invoices.

**Why it exists.** Before paying the user sees tax and the total (S83.06); users can enter a billing address (S83.11); business buyers can enter a tax identifier on invoices (S83.12). Without tax ID collection a business buyer may be charged VAT they should not pay.

**Who uses it.** Every buyer on web and Desktop; business buyers use the tax ID field.

**Problems it solves**

- Wrong tax for the buyer's place.
- EU/UK/AU business buyers charged VAT instead of reverse charge.
- Invoices lacking a buyer address.
- Keeping regulated address and tax data out of our database.

**Use cases**

- A US buyer sees tax added on the hosted page.
- An Indian buyer sees a price that already includes GST.
- A German company enters its VAT number at checkout.
- A user upgrading mid-cycle sees the Tax row before confirming.

## 2. User experience

**Where to find it**

- Hosted payment page opened from /pricing or /upgrade/<plan> (apps/web/app/api/checkout/route.ts:523).
- Order details on /upgrade/<plan> and the upgrade dialog, row 'Tax' (apps/web/features/billing/components/UpgradeOrderPanel.tsx:414; UpgradeConfirmDialog.tsx:335-340).
- Credit top-up payment page, same address and tax ID fields (apps/web/app/api/billing/top-up/route.ts:250).
- Card view on pricing shows 'plus tax' or an included-tax label (apps/web/features/billing/lib/localized-pricing.ts:97-105).
- Mobile: store shows its own price and tax when purchases are on; off in the shipped build.

**Before you start**

- A buyer who has started checkout (F083-02) or an upgrade preview (F083-03).

**Screens and controls**

- Hosted page: full billing address (required), business tax ID option, terms-of-service tick box (checkout/route.ts:517-523; lib/billing/tax-policy.ts:98-112). The exact visible labels are drawn by the payment provider and were not read: unknown.
- First-purchase order screen text: 'Tax is calculated at checkout.' (UpgradeOrderPanel.tsx:391).
- Waitlist price line: '<price> + tax' (UpgradeOrderPanel.tsx:350).
- Upgrade order rows: line items, 'Subtotal', 'Discount', 'Tax', 'Total', 'Total due today' (UpgradeOrderPanel.tsx:392-440).

**Journey**

1. Choose a plan and start checkout, or open the upgrade order screen.
2. On the hosted page type the full billing address; tick the business option and enter the tax number if buying for a company.
3. The page shows tax and the total; pay.
4. For a mid-cycle upgrade the order screen shows Tax and Total due today before you confirm.
5. Later invoices carry the address and tax ID; read them in Billing.

**What the person sees and gets**

- Tax and total on the hosted page and in the order details.
- Invoices list in Settings, Billing read from the provider (apps/web/lib/services/billing-invoice-service.ts).
- If tax calculation fails the webhook logs 'TAX NOT COLLECTED' for top-ups and continues (apps/web/app/api/stripe-webhook/lib/db.ts:315-328).

**Settings**

- Tax registrations live in the payment provider's account, not in code (apps/web/lib/billing/tax-policy.ts:19-35).
- Currency tax terms in BILLING_CURRENCY_TERMS (packages/contracts/types/src/billing-catalog.ts:1139-1170).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Checkout sessions set automatic tax on, tax ID collection on, and billing address collection required (apps/web/lib/billing/tax-policy.ts:98-112; apps/web/app/api/checkout/route.ts:523).
- For an existing customer the session also sets customer_update address and name to auto so the typed address is saved for the next renewal; the route always has a customer by then (tax-policy.ts:107-109; route.ts:373-389).
- USD prices are tax-exclusive and INR prices tax-inclusive; checkout opens only for a Stripe price whose tax behaviour matches the currency (tax-policy.ts:133-135; apps/web/lib/server/localized-pricing-service.ts:60-76).
- No country list in code; Stripe Tax decides (tax-policy.ts:19-35).
- The product never stores address or tax ID; the webhook is tested not to write them (tax-policy.ts:37-47,77-80; apps/web/app/api/stripe-webhook/lib/__tests__/checkout-tax.test.ts).
- Mid-cycle preview sums tax per proration line (apps/web/app/api/upgrade/preview/route.ts:124-141).
- Top-ups use the same tax parameters (apps/web/app/api/billing/top-up/route.ts:250).
- First-purchase screen says 'Tax is calculated at checkout.' (UpgradeOrderPanel.tsx:391).

**Incomplete**

- Editing the saved address or tax ID later happens only if the provider's billing portal is configured to allow it; that setting is not in the repository (unknown).

**Present but disconnected or switched off**

- Mobile tax display: no tax code found in apps/mobile/src/features/billing/*.ts; the store shows tax when purchases are on, which is compiled off.

**Not available**

- In-app address or tax ID fields on any app; all collection is on the hosted page (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-27 around line 412).

## 4. Required behaviour

**Established requirements**

- Before paying, the user sees tax and the total price. (source: S83.06)
- Users can enter and update a billing address. (source: S83.11)
- Business buyers can enter a tax identifier applied to invoices. (source: S83.12)
- India prices include 18% GST; every other price excludes tax, added at checkout. (source: doc: docs/product/definition.md:318-320)
- Checkout shows and collects tax separately; the usage ledger receives only the pre-tax purchased balance. (source: doc: docs/product/definition.md:401-402)
- A plan billed on the web is managed on the web: mobile links out for card, address and tax ID. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-27))

**Acceptance criteria**

1. Hosted checkout requires a full billing address before paying.
2. Hosted checkout offers a tax ID field.
3. A USD price is shown without tax and the hosted total includes tax for a taxable location.
4. An INR price is shown as including GST and no extra tax is added on top.
5. Mid-cycle upgrade order details show a Tax row and a Total due today that includes it.
6. A return customer's typed address is on the Stripe customer for the next invoice.
7. Our database holds no address or tax ID after a purchase.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same address and tax ID rules apply to top-ups because the same builder is used [inferred from top-up/route.ts:250].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that INR checkout never adds tax on top.
- [proposed] Show a link to edit the billing address in Settings, Billing if the portal allows it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Tax policy | `apps/web/lib/billing/tax-policy.ts` | Checkout tax parameters, per-currency tax behaviour, session tax outcome. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Applies tax parameters to the session. |
| endpoint | POST /api/billing/top-up | `apps/web/app/api/billing/top-up/route.ts` | Same tax parameters for credit top-ups. |
| endpoint | POST /api/upgrade/preview | `apps/web/app/api/upgrade/preview/route.ts` | Per-line tax in the preview. |
| service | Localized pricing service | `apps/web/lib/server/localized-pricing-service.ts` | Checks Stripe price tax behaviour against currency. |
| config | Currency tax terms | `packages/contracts/types/src/billing-catalog.ts` | BILLING_CURRENCY_TERMS and included-tax label. |
| service | Localized price helpers | `apps/web/features/billing/lib/localized-pricing.ts` | localizedIncludedTax label for the page. |
| component | UpgradeOrderPanel | `apps/web/features/billing/components/UpgradeOrderPanel.tsx` | Tax rows and 'Tax is calculated at checkout.' |
| component | UpgradeConfirmDialog | `apps/web/features/billing/components/UpgradeConfirmDialog.tsx` | Tax row in dialog. |
| service | Invoice service | `apps/web/lib/services/billing-invoice-service.ts` | Reads invoices back from the provider. |
| endpoint | Stripe webhook db | `apps/web/app/api/stripe-webhook/lib/db.ts` | Logs tax outcome; never stores address or tax ID. |
| test | Tax policy test | `apps/web/lib/billing/tax-policy.test.ts` | Parameters and policy. |
| test | Checkout tax webhook test | `apps/web/app/api/stripe-webhook/lib/__tests__/checkout-tax.test.ts` | No address or tax ID persisted. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server builds the Checkout Session with automatic tax, tax ID collection, required full address and customer update. | our servers | apps/web/app/api/checkout/route.ts:523; apps/web/lib/billing/tax-policy.ts:98-112 |
| Buyer types address and tax ID on the hosted page; provider computes tax from the location. | outside service | apps/web/lib/billing/tax-policy.ts:19-35 |
| For upgrades the server asks the provider for an invoice preview and sums tax on proration lines. | outside service | apps/web/app/api/upgrade/preview/route.ts:124-141 |
| Webhook reads the session's tax outcome and logs only status, amount and tax ID types. | our servers | apps/web/lib/billing/tax-policy.ts:144-175; db.ts:315-328 |
| Settings, Billing reads invoices from the provider on demand. | outside service | apps/web/lib/billing/tax-policy.ts:37-47; apps/web/features/settings/sections/BillingSection.tsx:518-519 (GET /api/billing/invoices) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Billing address, business name, tax ID | Payment provider customer and invoice only | Not copied to our database | By the provider; our code keeps stripe_customer_id only (tax-policy.ts:37-47) |
| Tax amount and status of a session | Application log (status, amount, tax ID types) | No | Log retention unknown |

**Models and providers.** No AI model is involved. Tax comes from the payment provider's tax engine (apps/web/lib/billing/tax-policy.ts:70).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in buyer; the data entered belongs to the provider customer linked to the account. |
| Permissions | None found in the code beyond sign-in; Team billing roles are not read here. |
| Subscription | Applies to any paid purchase and top-up; no plan-specific rule found. |
| Limits and metering | None found in the code. |
| Feature flags | None found; Stripe Tax must be active on the account (tax-policy.ts:49-52). |
| Model compatibility | None found in the code. |
| Provider restrictions | Tax places are the provider account's registrations; elsewhere tax is zero and that is intended (tax-policy.ts:26-31). |
| Local mode | Not applicable: Local and own-key involve no purchase and no tax. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Buyer outside any registration | Zero tax calculated, treated as correct. | tax-policy.ts:28-31 |
| Stripe price tax behaviour mismatched | Price not checkoutReady; plan shows unavailable. | apps/web/lib/server/localized-pricing-service.ts:60-76,121-130 |
| Tax calculation fails on a completed top-up | Logged as 'TAX NOT COLLECTED'; grant continues. | apps/web/app/api/stripe-webhook/lib/db.ts:324-328 |
| Existing customer typing a new address | Saved to the customer through customer_update. | tax-policy.ts:60-62,107-109 |
| Stripe refuses session for tax setup | Buyer sees 'Invalid checkout configuration. Please contact support.' and the reason is logged. | route.ts:592-593; route.tax-errors.test.ts:143 |
| Mobile | not handled in the code (no tax text); store shows its own tax when purchases are on. | apps/mobile/src/features/billing/*.ts has no tax code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/billing/tax-policy.test.ts`: Tax parameter builder and currency terms.
- `apps/web/app/api/stripe-webhook/lib/__tests__/checkout-tax.test.ts`: Webhook never persists address or tax ID.
- `apps/web/app/api/checkout/route.tax-errors.test.ts`: Logging of Stripe refusals about tax.
- `apps/web/features/billing/lib/__tests__/localized-included-tax.test.ts`: Included-tax label.
- `apps/web/lib/server/__tests__/localized-pricing-service.test.ts`: Tax behaviour match for checkout readiness.
- `apps/web/features/billing/components/UpgradeOrderPanel.test.tsx`: Order panel rows including tax.

**Test scenarios**

- **US buyer tax**
  1. Start checkout for Premium from a US test location.
  2. Enter a taxable address.
  - Expected: Hosted page shows tax on top of the USD price; total includes it.
- **India inclusive price**
  1. Open /pricing with an Indian country header.
  2. Start checkout.
  - Expected: Price labelled as including GST; hosted total equals the shown price.
- **Business tax ID**
  1. On hosted checkout tick the business option and enter a valid EU VAT number.
  - Expected: Reverse charge or zero rate applies; invoice shows the number.
- **Upgrade tax row**
  1. Open /upgrade/<plan> with a paid plan.
  - Expected: Tax row and Total due today shown before confirm.
- **No data kept**
  1. Complete a purchase.
  2. Inspect profiles and subscriptions rows.
  - Expected: Only Stripe ids; no address or tax ID.

**Where to look when it fails**

- Log 'TAX NOT COLLECTED: Stripe did not calculate tax for a completed credit top-up' (db.ts:325).
- Server log 'Stripe rejected checkout session creation' with error param (route.ts:576).
- Stripe dashboard Tax settings (outside repo).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **The brief says billing address and tax ID can be updated; the code opens the provider portal, but what the portal allows is a provider setting not visible here.** Affects: Web, Desktop. Evidence: apps/web/app/api/portal/route.ts:326-343 (portal session created without a configuration id). Work needed: Check the portal configuration and record it.
- **Mobile has no tax display in the shipped build.** Affects: Mobile. Evidence: storePurchases.json nativePurchases false. Work needed: None until store purchase is switched on.
- **No test shows the hosted page asking for the full address and tax ID in a live session.** Affects: Web, Desktop. Evidence: Tests assert parameters only (apps/web/lib/billing/tax-policy.test.ts). Work needed: Run a test-mode checkout and record it.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:POST /api/checkout
- api:POST /api/billing/top-up
- api:POST /api/upgrade/preview
- api:GET /api/billing/invoices
- file:apps/web/lib/billing/tax-policy.ts
- file:packages/contracts/types/src/billing-catalog.ts
- F083-02
- F083-03
- SYS-security-and-privacy
- SYS-data-model-and-migrations

## Unknown

- Which countries Stripe Tax is registered in (provider setting).
- Exact labels on the hosted page (drawn by the provider).
- Whether the billing portal allows editing address and tax ID.
- How the Desktop browser handoff shows the address page (provider page; not read).
- Log retention for tax outcomes.
