---
id: "F083-10"
type: "feature"
title: "Store-billed plans, duplicate-subscription warning and purchase restore"
aliases: ["Billed through", "Billing owner", "Store-billed plans", "Manage in the App Store", "Manage on Google Play", "Subscription managed elsewhere", "Duplicate subscription warning", "Restore purchases", "S83.25", "S83.26", "S83.27"]
area: "83 Billing and subscription screens"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S83.25", "S83.26", "S83.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:POST /api/checkout", "api:POST /api/upgrade", "api:POST /api/mobile/iap/verify", "api:GET /api/mobile/iap/catalog", "table:subscriptions", "store:useTierStore", "file:apps/mobile/src/features/billing/storePurchases.json", "file:apps/web/lib/server/subscription-billing-owner.ts", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F083-10 Store-billed plans, duplicate-subscription warning and purchase restore

Stops a person paying twice and tells them where a plan is billed. Web and Desktop (hosted web app) show 'Billed through' and a store manage link; checkout answers 409 if another channel already bills. Mobile has the warning alert and a Restore purchases row, but both are compiled off in the shipped build.

Area: [83. Billing and subscription screens](README.md). Requirement items: [S83.25](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8325), [S83.26](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8326), [S83.27](../../10-requirements/capabilities/083-billing-and-subscription-screens.md#s8327).

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

**What it does.** Works out the one billing owner of a subscription (web payment provider, Apple, Google, organization or unverified) and uses it to block second purchases, label the plan and link to the right management page. Mobile can re-check store purchases with a Restore control. (apps/web/lib/server/subscription-billing-owner.ts:42-87; apps/web/features/settings/sections/BillingSection.tsx:818-820,877-884)

**Why it exists.** One user has one subscriptions row and exactly one billing owner; a second channel must not create a second bill (doc: docs/product/commercial.md:75-99).

**Who uses it.** Subscribers who bought on the web, Apple or Google; people who reinstall the mobile app; support staff who handle double charges.

**Problems it solves**

- Paying through two channels for one plan.
- Not knowing where to cancel.
- A purchase that did not arrive after reinstall.

**Use cases**

- An Apple-billed user opens Settings, Billing on the web and sees 'Billed through' Apple and 'Manage in the App Store'.
- A user tries web checkout while already billed by Google and gets a 409 naming the owner.
- On mobile (when purchases are on) the user taps 'Restore purchases' after reinstalling.
- A mobile user taps Upgrade on a web-billed plan and reads 'Subscription managed elsewhere'.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Billing: row 'Billed through' and the link 'Manage in the App Store' or 'Manage on Google Play' (BillingSection.tsx:818-820,877-884).
- Mobile (full screen only): alert 'Subscription managed elsewhere'; row 'Restore purchases' with the value 'Subscriptions and unfinished purchases'; text 'A purchase that did not arrive' (apps/mobile/src/features/settings/cloud-billing/index.tsx:300-305,803-871).
- Mobile (shipped reduced screen): row 'Billing' with values such as 'Managed on the web' or 'Managed where you subscribed' (index.tsx:378-390).

**Before you start**

- Signed in with a plan whose subscription source is apple, google, stripe or manual.
- Restore needs a build with native purchases on, store connection, Cloud mode and a signed-in account (apps/mobile/src/features/billing/useMobileIap.ts:630-637; storePurchases.json:2).
- The server must enable the store catalog via MOBILE_IAP_ENABLED and product id settings (apps/web/lib/server/mobile-iap-catalog.ts:53-56).

**Screens and controls**

- Web: 'Billed through' row; store link buttons; copy for blocked plan change: 'Change or cancel this subscription with Apple before starting web billing.' (Google equivalent) (BillingSection.tsx:431-450).
- Mobile alert text: 'This subscription is billed through <source>; manage it there to avoid paying twice.' with buttons OK and the manage action (cloud-billing/index.tsx:300-305).
- Mobile restore outcomes: 'No purchases to restore', 'Purchases already restored', 'Restore purchases needs the store' (index.tsx:102-117).
- Mobile text: 'Restore purchases re-checks it with the store and never charges you again.' (index.tsx:869).

**Journey**

1. 1. Open Settings, Billing (web) and read 'Billed through'.
2. 2. If store billed, click 'Manage in the App Store' or 'Manage on Google Play'; the store page opens in a new tab.
3. 3. On web, trying to start checkout while another owner is live is refused with the owner named.
4. 4. On mobile with purchases on: tap Upgrade; if billed elsewhere the alert appears with a manage action.
5. 5. After reinstall tap 'Restore purchases'; the app re-checks the store and shows one of the three outcomes.

**What the person sees and gets**

- Checkout 409 messages: 'This subscription is billed by Apple. Manage or cancel it with Apple before starting web billing.' (Google, organization and unverified variants) (subscription-billing-owner.ts:121-160).
- 409 for a live provider subscription: 'This account already has an active subscription with our payment provider. Open Billing to manage it, or contact support if your plan is not showing yet.' (apps/web/app/api/checkout/route.ts:70-71).
- Mobile portal error title 'Billing managed elsewhere' on a 409 (index.tsx:76).

**Settings**

- storePurchases.json nativePurchases; server flag MOBILE_IAP_ENABLED; product id environment variables MOBILE_IAP_APPLE_PRODUCT_IDS_JSON and MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON (configuration names only).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Billing owner resolution: stripe, apple, google, manual, none or unverified; more than one owner id or a malformed provider id gives unverified, which blocks changes (apps/web/lib/server/subscription-billing-owner.ts:42-65,70-87).
- Policy flags canOpenStripePortal, canApplyStripeUpgrade, canStartStripeCheckout (subscription-billing-owner.ts:102-113); checkout returns 409 through stripeBillingOwnershipMessage (apps/web/app/api/checkout/route.ts:332-334).
- Checkout also refuses when the provider already bills a live subscription for the stored customer (route.ts:376-415).
- A store row past its paid-through date plus a 3-day grace is treated as expired so web checkout can start (subscription-billing-owner.ts:30,92-112).
- Web and Desktop Settings show owner label, store links and the owner-specific blocked-change copy (BillingSection.tsx:413-450,877-884).
- Mobile owner guard and alert code (apps/mobile/src/features/billing/subscriptionSource.ts:41-72; cloud-billing/index.tsx:287-305).
- Mobile restore code: outcomes nothing-to-restore, already-restored, store-unavailable (useMobileIap.ts:44-45,630-650).

**Incomplete**

- Mobile restore in the shipped build: code complete but not reachable (see disconnected).
- Whether restore also re-sends pending receipts for a user who is not in Cloud mode: restore requires a cloud account epoch (useMobileIap.ts:631-637).

**Present but disconnected or switched off**

- Mobile Restore purchases row, the 'Subscription managed elsewhere' alert on Upgrade, 'Manage in <store>' rows and 'View invoices' are in the full screen, which is returned only when NATIVE_PURCHASES_AVAILABLE is true; the value read from storePurchases.json is false (apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3; storePurchases.json:2; cloud-billing/index.tsx:351). The test 'ships with purchases switched off' confirms (apps/mobile/__tests__/NoPurchasesBilling.test.tsx:106).
- The brief says the switch is FEATURES.billing; the code uses FEATURES.billing only for the portal row (cloud-billing/index.tsx:199; apps/mobile/lib/v1FeatureFlags.ts:6) and for a service that throws in v1 (apps/mobile/src/features/billing/service.ts:9). The actual purchase switch is storePurchases.json (doc: docs/product/commercial.md:66-70).

**Not available**

- Store-billed management on CLI, VS Code and Chrome beyond a label: VS Code shows 'Apple App Store' or 'Google Play' as owner text (apps/extension-vscode/src/features/account-auth/accountPresentation.ts:24-38); no manage link seen.
- Web restore control: not applicable.

## 4. Required behaviour

**Established requirements**

- On mobile, users can restore store purchases without being charged again. (source: S83.25)
- Users billed by Apple or Google are told to manage it in that store, with a link. (source: S83.26)
- Before a purchase that would double-bill, the user is warned. (source: S83.27)
- One subscriptions row has exactly one billing owner; while the recorded owner is entitled the second channel loses; the new purchase takes ownership only once the old owner is no longer entitled. (source: doc: docs/product/commercial.md:75-99)
- Mobile v1 sells nothing in the app; when store purchase is turned on it opens with no waitlist or access code. (source: doc: docs/product/commercial.md:66-70)
- Mixed or unreadable ids are 'unverified' and block changes. (source: apps/web/lib/server/subscription-billing-owner.ts:48,129-131)

**Acceptance criteria**

1. A row with a valid web subscription id resolves to stripe; with only an Apple id to apple; with only a Google token to google.
2. A row with two owner ids or a malformed web id resolves to unverified and checkout returns 409 with the unverified message.
3. Web checkout for an Apple-billed active user returns 409 naming Apple.
4. Web checkout when the provider already bills a live subscription for the customer returns 409.
5. Settings, Billing shows 'Billed through' and the store manage link for Apple or Google plans.
6. On a mobile build with native purchases on, Restore with no store purchases shows 'No purchases to restore' and never charges.
7. On the shipped mobile build no Restore row is shown.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Organization appears as 'manual' in the source and as 'organization' only in the separate billing owner value (subscription-billing-owner.ts:90-98) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the same owner explanation in CLI, VS Code and Chrome when they gate on a plan owned by a store.
- [proposed] Correct the brief's switch-on instruction to the real flag.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | subscription-billing-owner | `apps/web/lib/server/subscription-billing-owner.ts` | Resolves the billing owner and the policy flags; messages for refused actions. |
| endpoint | POST /api/checkout | `apps/web/app/api/checkout/route.ts` | Applies owner policy and live-subscription check; returns 409. |
| endpoint | POST /api/upgrade | `apps/web/app/api/upgrade/route.ts` | Refuses an active store-owned plan before any provider call (tested at route.seats.test.ts:235). |
| config | store-subscription-management | `apps/web/lib/billing/store-subscription-management.ts` | Store names and subscription management URLs. |
| component | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | 'Billed through' row, store links and blocked-change copy. |
| service | subscription-owner-presentation | `apps/web/features/billing/lib/subscription-owner-presentation.ts` | Owner plan-change message helpers used by UpgradeChooser. |
| service | subscription-owner-handoff | `apps/web/lib/server/subscription-owner-handoff.ts` | Precedence and migration between channels (named in doc: docs/product/commercial.md:85). |
| service | mobile-iap-ledger-service | `apps/web/lib/services/mobile-iap-ledger-service.ts` | Records store purchases and refuses a conflicting one (lines 377,436). |
| endpoint | POST /api/mobile/iap/verify | `apps/web/app/api/mobile/iap/verify/route.ts` | Verifies a store receipt (used by purchase and restore flows) [inferred from folder and mobile service names]. |
| endpoint | GET /api/mobile/iap/catalog | `apps/web/app/api/mobile/iap/catalog/route.ts` | Returns the catalog gated by MOBILE_IAP_ENABLED. |
| config | mobile-iap-catalog | `apps/web/lib/server/mobile-iap-catalog.ts` | Reads MOBILE_IAP_ENABLED and product id maps. |
| endpoint | Apple and Google notification routes | `apps/web/app/api/mobile/iap/apple-notifications/route.ts` | Store renewal notifications; skip a row that also holds a web subscription id (doc: docs/product/commercial.md:82-84). |
| service | subscriptionSource guard | `apps/mobile/src/features/billing/subscriptionSource.ts` | getSubscriptionOwnerGuard and billingManagementTarget. |
| hook | useMobileIap | `apps/mobile/src/features/billing/useMobileIap.ts` | Purchase, restore and outcome state. |
| service | mobileIapService | `apps/mobile/src/features/billing/mobileIapService.ts` | Store connection helpers and storefront read. |
| config | storePurchases.json | `apps/mobile/src/features/billing/storePurchases.json` | The single switch for native purchases. |
| config | nativePurchaseAvailability | `apps/mobile/src/features/billing/nativePurchaseAvailability.ts` | Exports NATIVE_PURCHASES_AVAILABLE. |
| screen | Mobile plan screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Alert, Restore row, reduced versus full screen. |
| config | webBillingLinks | `apps/mobile/src/features/billing/webBillingLinks.ts` | Allows web billing links only on the US App Store storefront. |
| table | subscriptions | `apps/web/app/api/checkout/route.ts` | Columns stripe_subscription_id, apple_original_transaction_id, google_purchase_token decide the owner. |
| test | subscription-billing-owner test | `apps/web/lib/server/subscription-billing-owner.test.ts` | Owner policy cases. |
| test | NoPurchasesBilling test | `apps/mobile/__tests__/NoPurchasesBilling.test.tsx` | Shipped build behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server reads the user's subscriptions row and resolves the billing owner from the three id columns. | our servers | apps/web/app/api/checkout/route.ts:308-312; subscription-billing-owner.ts:42-65 |
| Checkout refuses with 409 when the owner policy does not allow starting checkout, or when the provider already bills a live subscription. | our servers | checkout/route.ts:332-334,376-415 |
| The web Settings page reads the same source from the account and shows the label and store links. | device | BillingSection.tsx:410-420 |
| Mobile asks the store (native library, an outside service) for available purchases on the device; with a token it sends them to our verify route; outcomes are set on the device. | device and our servers | apps/mobile/src/features/billing/useMobileIap.ts:439-463,630-650 |
| The server verifies the receipt with Apple or Google (outside services) and records it, refusing a purchase that conflicts with an entitled owner. | our servers | apps/web/lib/services/mobile-iap-ledger-service.ts:377,436; doc: docs/product/commercial.md:88-96 |
| Store renewal notifications arrive from Apple or Google and update the row unless it also holds a web subscription id. | outside service | doc: docs/product/commercial.md:82-84 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Billing owner ids (web subscription id, Apple original transaction id, Google purchase token) | table:subscriptions | Server side; clients read the derived source via /api/me | The losing channel's ids are cleared when ownership changes (doc: docs/product/commercial.md:95-96) |
| Mobile cached billing source and status | store:useTierStore persisted on the device | Refreshed from GET /api/me?surface=mobile in Cloud mode | Cleared by clearAccountEntitlements |

**Models and providers.** No model is called. Apple and Google store billing and the web payment provider are outside services and are not folders under packages/ai/providers.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on every surface; mobile restore needs a cloud account epoch (useMobileIap.ts:631). |
| Permissions | Own subscription only. Organization plans: administrators manage (BillingSection.tsx:440). |
| Subscription | Applies to paid plans; the free web upgrade path has an additional waitlist gate (see F083-11 gaps) (billing-waitlist-access.ts:42-66). |
| Limits and metering | Store renewal grace is 3 days (subscription-billing-owner.ts:30). No usage metering for this feature. |
| Feature flags | nativePurchases in storePurchases.json (false); MOBILE_IAP_ENABLED server flag; AGI_BILLING_WAITLIST_OPEN for web first purchases (billing-waitlist-access.ts:29-31). |
| Model compatibility | None found in the code. |
| Provider restrictions | Web links to purchase are allowed on iOS only for the US App Store storefront; Google Play allows none (apps/mobile/src/features/billing/webBillingLinks.ts:6-9). |
| Local mode | Local inference is free and needs no subscription. On Mobile the plan source is read only in Cloud mode (store.ts:73), so the owner guard works from cached data in Local mode; restore returns 'store-unavailable' without a cloud account (useMobileIap.ts:631-637). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unverified ownership | All billing actions are refused with 'Billing ownership could not be verified. No billing change was started; refresh your account or contact support.' | subscription-billing-owner.ts:125-127 |
| Ended store subscription | Web checkout may start; portal message says there is no portal for an ended store subscription. | subscription-billing-owner.ts:131-148; test apps/web/features/settings/sections/__tests__/BillingSection.test.tsx:453 |
| Nothing to restore | Outcome 'No purchases to restore'. | useMobileIap.ts:455-457; cloud-billing/index.tsx:103-106 |
| Already restored | Outcome 'Purchases already restored'. | useMobileIap.ts:457-459 |
| Store not connected | Outcome 'Restore purchases needs the store'; test keeps the row tappable. | useMobileIap.ts:634-636; apps/mobile/__tests__/CloudBillingPage.test.tsx:822 |
| Purchase waiting for store approval | Asks before a second request to avoid a double charge. | cloud-billing/index.tsx:270-283 |
| Provider customer id not in the provider account | A fresh customer is created and the stale link dropped. | checkout/route.ts:386-394 |
| Offline | not handled in the code beyond store-unavailable and portal error alerts. | cloud-billing/index.tsx:319-337 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/subscription-billing-owner.test.ts`: Terminal organization entitlement may start checkout (62); legacy store row after grace may start (69); free row is not a managed plan (84); past-due web plan must recover before upgrade (93).
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: Names the owner and keeps portal for web plans (162); Apple plan goes to Apple (172); Google plan and receipts message (208); web plans offered again after store plan ends (453); no Compare plans when another store owns it (747).
- `apps/web/app/api/checkout/route.test.ts`: Checkout route; individual cases not read.
- `apps/web/app/api/upgrade/route.seats.test.ts`: Refuses an active store-owned plan before any provider call (line 235).
- `apps/mobile/__tests__/CloudBillingPage.test.tsx`: Blocks web-owned plan changes and links to the management surface (441); store subscription blocked (516); Restore purchases tappable without store (822); does not sell a second subscription (883); uninstall warning (548).
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: 'ships with purchases switched off' (106); never connects to the store or calls purchase routes (111).
- `apps/mobile/src/features/billing/__tests__/MobileIapPurchaseFlow.test.tsx`: Purchase flow; restore cases not confirmed.

**Test scenarios**

- **Duplicate purchase refused**
  1. Seed a subscriptions row with an Apple original transaction id and status active.
  2. POST /api/checkout for a paid plan.
  - Expected: 409 with the Apple message; no checkout session.
- **Live provider subscription**
  1. Use an account whose stored customer has a live subscription at the provider.
  2. POST /api/checkout.
  - Expected: 409 with 'This account already has an active subscription with our payment provider...'.
- **Store link on web**
  1. Open Settings, Billing as a Google-billed user.
  - Expected: 'Billed through' shows Google Play; link 'Manage on Google Play' opens the Play subscriptions page.
- **Unverified ids**
  1. Seed a row with both a Stripe id and an Apple id.
  2. Open Settings, Billing and try checkout.
  - Expected: Ownership message 'Billing ownership could not be verified...'.
- **Mobile shipped build**
  1. Open the plan screen on the production flag value.
  - Expected: No Restore row and no purchase rows; 'Billing' row text only.
- **Mobile restore (flag on test build)**
  1. Build with nativePurchases true, store sandbox account with no purchases, tap Restore purchases.
  - Expected: 'No purchases to restore' and no charge.

**Where to look when it fails**

- Log 'Refusing checkout: Stripe is already billing a subscription for this customer' with stripeStatus and storedPlanTier (checkout/route.ts:399-408).
- Mobile restore outcomes in the screen; error text from useMobileIap.
- Table subscriptions id columns; mobile IAP ledger rows (names unknown).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/083-billing-and-subscription-screens.md](../../70-qa/test-plans/web/083-billing-and-subscription-screens.md)
- Desktop: [70-qa/test-plans/desktop/083-billing-and-subscription-screens.md](../../70-qa/test-plans/desktop/083-billing-and-subscription-screens.md)
- Mobile: [70-qa/test-plans/mobile/083-billing-and-subscription-screens.md](../../70-qa/test-plans/mobile/083-billing-and-subscription-screens.md)

## 10. Gaps and dependencies

- **Restore purchases and the duplicate warning alert are not visible on the shipped mobile build.** Affects: Mobile. Evidence: apps/mobile/src/features/billing/storePurchases.json:2; cloud-billing/index.tsx:351. Work needed: Owner switches nativePurchases on with a new store build and review, and the server sets MOBILE_IAP_ENABLED with live products (doc: docs/product/commercial.md:66-70).
- **The brief's switch-on instruction names FEATURES.billing, which is not the purchase switch.** Affects: Documentation, release team. Evidence: apps/mobile/lib/v1FeatureFlags.ts:6; cloud-billing/index.tsx:199; storePurchases.json:2. Work needed: Correct S83.03, S83.06, S83.13 and S83.25 notes.
- **Mobile shows the owner for a web-billed plan without a link unless storefront rules allow.** Affects: Mobile non-US users. Evidence: apps/mobile/src/features/billing/webBillingLinks.ts:6-9. Work needed: None required; it is a store rule. Keep wording clear.
- **VS Code, CLI and Chrome do not explain store ownership or offer the store link.** Affects: CLI, VS Code, Chrome. Evidence: No store management URL use found in those apps' billing code searched. Work needed: Decide if a one-line owner message is needed.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:POST /api/checkout
- api:POST /api/upgrade
- api:POST /api/mobile/iap/verify
- api:GET /api/mobile/iap/catalog
- table:subscriptions
- store:useTierStore
- file:apps/mobile/src/features/billing/storePurchases.json
- file:apps/web/lib/server/subscription-billing-owner.ts
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-data-model-and-migrations

## Unknown

- Exact behaviour of POST /api/mobile/iap/verify on restore was not opened.
- Names of the mobile IAP ledger tables.
- Whether Desktop users on a store-billed plan are shown anything different: Desktop is the hosted web app, none found.
- Whether the Apple or Google manage links are localized.
- Whether all mobile restore tests pass: no run record found.
