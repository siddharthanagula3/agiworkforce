---
id: "F071-11"
type: "feature"
title: "Buying plans and credits in the store"
aliases: ["In-app purchase", "Store purchases", "Restore purchases", "Subscription screen", "Billing", "expo-iap", "NATIVE_PURCHASES_AVAILABLE", "nativePurchases"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.31"]
depends_on: ["surface:mobile", "mode:cloud", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "api:GET /api/mobile/iap/catalog", "api:POST /api/mobile/iap/verify", "api:POST /api/mobile/iap/apple-notifications", "api:POST /api/mobile/iap/google-notifications", "table:mobile_iap_accounts", "file:apps/mobile/src/features/billing/storePurchases.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-11 Buying plans and credits in the store

The code to buy a plan or credits through the App Store or Google Play and to restore purchases is built on the phone and server, but it is switched off. A build-time value makes the purchase hook inert, so the Subscription screen only shows the plan, and the store listing says version 1 sells nothing.

Area: [71. Mobile application](README.md). Requirement items: [S71.31](../../10-requirements/capabilities/071-mobile-application.md#s7131).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a Cloud user buy a subscription or a credit top-up through the platform store, confirm it with the server, acknowledge it to the store, refresh the plan, and restore earlier purchases (apps/mobile/src/features/billing/useMobileIap.ts:195-300).

**Why it exists.** The brief requires App Store and Google Play purchase and restore (doc: knowledge-base/data/area-briefs/071-mobile-application.md S71.31). Store rules require in-app purchase for digital goods sold in the app.

**Who uses it.** Cloud users upgrading from the phone. In this build nobody can.

**Problems it solves**

- One subscription system gets purchases from the stores (SYS-subscriptions-entitlements-and-usage).
- Restoring purchases on a new device.

**Use cases**

- Buy a plan on iPhone (not reachable now).
- Buy credits (not reachable now).
- Restore purchases after reinstall (not reachable now).
- See the plan and 'Managed on the web' billing line (reachable).

## 2. User experience

**Where to find it**

- Mobile: Settings, Subscription (route /(app)/settings/cloud-billing); drawer upgrade row also points to it (apps/mobile/src/features/settings/index.tsx:643; apps/mobile/src/features/drawer/components/DrawerContent.tsx:915). Title 'Subscription' (doc: apps/mobile/store-listing/REVIEWER-NOTES-IOS.md:253-262).

**Before you start**

- Signed in; otherwise the screen shows the account-required view (apps/mobile/src/features/settings/cloud-billing/index.tsx:343-349).
- For a purchase: a build with nativePurchases true, the server flag on, and products approved (apps/mobile/src/features/billing/storePurchases.json; docs/runbooks/mobile-store-products.md:240, 509).

**Screens and controls**

- Current build: rows 'Current plan', 'Try again', 'Renews' or 'Access ends' or 'Trial ends', 'Billing' (text only), 'What your plan includes', 'Usage', 'Help with your plan' (apps/mobile/src/features/settings/cloud-billing/index.tsx:351-418).
- Purchase build (not shipped): plan and top-up lists, Restore, auto-renewal terms (apps/mobile/src/features/settings/cloud-billing/index.tsx:67-71, 102-117, 420-).

**Journey**

1. Current: open Subscription and read the plan.
2. Switched-on design: choose a product, the store sheet appears, the app verifies the purchase with the server, acknowledges to the store, and refreshes the plan (apps/mobile/src/features/billing/useMobileIap.ts:195-300).

**What the person sees and gets**

- Restore messages 'No purchases to restore', 'Purchases already restored', 'Restore purchases needs the store' (apps/mobile/src/features/settings/cloud-billing/index.tsx:102-117).
- Purchase errors such as 'The store has not confirmed this purchase yet. AGI will confirm it again.' (useMobileIap.ts:246-250).

**Settings**

- Build value nativePurchases in apps/mobile/src/features/billing/storePurchases.json.
- Server MOBILE_IAP_ENABLED, MOBILE_IAP_APPLE_PRODUCT_IDS_JSON, MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON, MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON (apps/web/lib/server/mobile-iap-catalog.ts:42-60) (names only).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Subscription screen shows plan, renewal, billing line, plan features and usage when purchases are off (apps/mobile/src/features/settings/cloud-billing/index.tsx:351-418).
- Purchase, verification, acknowledgement and restore code exists, including pending approvals, account-epoch checks and replay protection by token (apps/mobile/src/features/billing/useMobileIap.ts:195-300).
- Server routes for catalog, verify and store notifications exist (apps/web/app/api/mobile/iap/catalog/route.ts; apps/web/app/api/mobile/iap/verify/route.ts; apps/web/app/api/mobile/iap/apple-notifications/route.ts; apps/web/app/api/mobile/iap/google-notifications/route.ts).
- The Android manifest drops the Play Billing permission when purchases are off (apps/mobile/app.config.js:313-316).

**Incomplete**

- The brief's story that no screen mounts the hook is not correct: the Subscription screen calls useMobileIap, but the exported hook is the inert version when nativePurchases is false (apps/mobile/src/features/settings/cloud-billing/index.tsx:133-135; apps/mobile/src/features/billing/useMobileIap.ts:726-727; apps/mobile/src/features/billing/storePurchases.json).
- The server products and store listings are not ready; the runbook lists the switch-on steps (docs/runbooks/mobile-store-products.md:240, 509).

**Present but disconnected or switched off**

- storePurchases.json nativePurchases is false, so purchase, upgrade, top-up and restore controls are not shown and no store connection opens (apps/mobile/src/features/billing/storePurchases.json; apps/mobile/src/features/billing/nativePurchaseAvailability.ts:1-3; doc: apps/mobile/store-listing/REVIEWER-NOTES-IOS.md:228-251).
- FEATURES.billing false: fetchPortalSessionUrl throws and the billing portal path is hidden (apps/mobile/lib/v1FeatureFlags.ts:6; apps/mobile/src/features/billing/service.ts:7-9).
- Server catalog returns nothing unless MOBILE_IAP_ENABLED is on (apps/web/lib/server/mobile-iap-catalog.ts:53-56).

**Not available**

- Selling anything on any surface before 1 January 2027 (doc: apps/mobile/store-listing/REVIEWER-NOTES-IOS.md:42).
- Other apps: n/a.

## 4. Required behaviour

**Established requirements**

- The user can buy a plan or credits through the App Store or Google Play and restore purchases. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.31)
- Switch-on needs FEATURES.billing and MOBILE_IAP_ENABLED with products live; the brief says the code is built. (source: S71.31 Unfinished note)
- Version 1 is free and sells nothing; no purchase, upgrade, top-up or restore control shows. (source: doc: apps/mobile/store-listing/REVIEWER-NOTES-IOS.md:42, 241-246)
- Every subscription capability connects to one AGI Subscription system. (source: task brief product requirements)

**Acceptance criteria**

1. In the shipped build, Settings, Subscription shows no purchase, upgrade, top-up or restore control.
2. The app makes no call to /api/mobile/iap/* in that build.
3. With nativePurchases true and the server flag on, the catalog lists products and a purchase verifies, acknowledges and updates the plan.
4. Replaying a purchase token does not credit twice.
5. Restore reports one of the three outcomes.
6. A paid plan managed elsewhere shows who manages it and offers no purchase.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The build-time value and the brief's FEATURES.billing step are two switches; both must be considered at switch-on [inferred from storePurchases.json and v1FeatureFlags.ts:6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update brief S71.31 to name storePurchases.json as the controlling switch.
- [proposed] Keep a test that fails if the binary exposes a purchase control while nativePurchases is false.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | storePurchases.json | `apps/mobile/src/features/billing/storePurchases.json` | Build-time switch for purchases. |
| config | nativePurchaseAvailability | `apps/mobile/src/features/billing/nativePurchaseAvailability.ts` | Exports NATIVE_PURCHASES_AVAILABLE. |
| hook | useMobileIap | `apps/mobile/src/features/billing/useMobileIap.ts` | Store or inert implementation (line 726). |
| service | mobileIapService | `apps/mobile/src/features/billing/mobileIapService.ts` | Catalog and verify calls. |
| service | billing service | `apps/mobile/src/features/billing/service.ts` | Portal session, gated by FEATURES.billing. |
| store | Tier store | `apps/mobile/src/features/billing/store.ts` | Plan, billing source, capabilities. |
| screen | Subscription screen | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Plan view and the switched-off purchase view. |
| screen | Plans screen | `apps/mobile/src/features/settings/plans/index.tsx` | What your plan includes. |
| config | Feature flag | `apps/mobile/lib/v1FeatureFlags.ts` | billing false (line 6). |
| config | App config | `apps/mobile/app.config.js` | Reads nativePurchases; drops billing permission (lines 16, 313-316). |
| service | Catalog on server | `apps/web/lib/server/mobile-iap-catalog.ts` | Product ids from env, enabled state. |
| endpoint | Catalog route | `apps/web/app/api/mobile/iap/catalog/route.ts` | GET catalog. |
| endpoint | Verify route | `apps/web/app/api/mobile/iap/verify/route.ts` | Verifies a purchase; reads mobile_iap_accounts (line 71). |
| endpoint | Apple notifications | `apps/web/app/api/mobile/iap/apple-notifications/route.ts` | Store server notifications. |
| endpoint | Google notifications | `apps/web/app/api/mobile/iap/google-notifications/route.ts` | Store server notifications. |
| service | Store purchase domain | `apps/web/lib/server/payments/store-purchase.ts` | Applies a verified purchase. |
| service | Store verification | `apps/web/lib/server/mobile-iap-store-verification.ts` | Asks the stores to verify. |
| table | mobile_iap_accounts | `apps/web/app/api/mobile/iap/verify/route.ts` | Account link read during verify (line 71). |
| other | Operations runbook | `docs/runbooks/mobile-store-products.md` | Switch-on steps. |
| other | Reviewer notes | `apps/mobile/store-listing/REVIEWER-NOTES-IOS.md` | States that version 1 sells nothing (lines 42, 228-262). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens Subscription; plan is read from the account. | device and our servers | apps/mobile/src/features/settings/cloud-billing/index.tsx:136-160 |
| Purchases off: the inert hook returns an unavailable state and no store connection opens. | device | apps/mobile/src/features/billing/useMobileIap.ts:715-727 |
| Switched on (design): the app loads the catalog and store prices from the store and starts the store purchase. | outside service | apps/mobile/src/features/billing/useMobileIap.ts; apps/mobile/src/features/billing/mobileIapService.ts |
| The app sends productId and purchase token to the verify route; the server checks with Apple or Google and records it. | our servers | apps/mobile/src/features/billing/useMobileIap.ts:236-247; apps/web/app/api/mobile/iap/verify/route.ts; apps/web/lib/server/mobile-iap-store-verification.ts |
| The app acknowledges or consumes the purchase with the store, then refreshes the plan. | outside service | apps/mobile/src/features/billing/useMobileIap.ts:195-213, 251-275 |
| Store server notifications update renewals and cancellations. | our servers | apps/web/app/api/mobile/iap/apple-notifications/route.ts; apps/web/app/api/mobile/iap/google-notifications/route.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Purchase token and product id | Server ledger (idempotency key) | Sent to server once | unknown |
| Plan and billing source | Server entitlement data; cached in the phone tier store | Read on demand | unknown |
| Awaiting-approval marker | Phone (apps/mobile/src/features/billing/awaitingApproval.ts) | No | Cleared on settle |

**Models and providers.** No model is involved. The outside services are Apple and Google stores. Paid plans control which models Cloud allows (SYS-subscriptions-entitlements-and-usage).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Cloud account, Cloud mode active for the purchase hook (apps/mobile/src/features/settings/cloud-billing/index.tsx:133-135). |
| Permissions | Android Play Billing permission is removed while purchases are off (apps/mobile/app.config.js:313-316). Age checks gate purchase (useMobileIap.ts imports canPurchase). |
| Subscription | A purchase would create or change the AGI Subscription plan (SYS-subscriptions-entitlements-and-usage). Currently nothing can be bought. |
| Limits and metering | none found in the code for the purchase flow itself; plan limits live in the subscription system. |
| Feature flags | storePurchases.json nativePurchases false; FEATURES.billing false; server MOBILE_IAP_ENABLED (apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:53). |
| Model compatibility | none found in the code. |
| Provider restrictions | Store products come from Apple or Google only; product ids are environment settings (apps/web/lib/server/mobile-iap-catalog.ts:42-45). |
| Local mode | Not available: purchases are Cloud account actions; Local mode needs no payment. Plan views need Cloud mode (apps/mobile/src/features/settings/cloud-billing/index.tsx:355-357). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | Account required view with a sign-in button. | apps/mobile/src/features/settings/cloud-billing/index.tsx:343-349 |
| Plan unconfirmed | 'Plan not confirmed' and a 'Try again' row. | cloud-billing/index.tsx:360-366 |
| Pending store payment or family approval | Marked awaiting approval, no error shown for a keyed product. | useMobileIap.ts:222-228 |
| Account changes mid-purchase | Result is dropped. | useMobileIap.ts:241-244, 257 |
| Store not confirmed | 'The store has not confirmed this purchase yet. AGI will confirm it again.' | useMobileIap.ts:246-250 |
| Plan refresh slow | 'Purchase confirmed. Your updated plan is taking longer to load.' | useMobileIap.ts:262-270 |
| Plan managed elsewhere | Billing row names where it is managed. | cloud-billing/index.tsx:376-392 |
| Offline | not handled in the code on this screen beyond the plan check message | apps/mobile/src/features/settings/cloud-billing/index.tsx:136-160 (plan check message only) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: The no-purchases screen (by name)
- `apps/mobile/__tests__/MobileIap.test.tsx`: Purchase hook
- `apps/mobile/__tests__/CloudBillingPage.test.tsx`: Subscription screen
- `apps/mobile/src/features/billing/__tests__/MobileIapPurchaseFlow.test.tsx`: Purchase flow
- `apps/mobile/src/features/billing/__tests__/MobileIapAcknowledgement.test.tsx`: Acknowledgement
- `apps/web/lib/server/mobile-iap-catalog.test.ts`: Catalog rules
- `apps/web/app/api/mobile/iap/verify/__tests__`: Verify route (folder; files not listed)
- `apps/web/app/api/mobile/iap/catalog/__tests__`: Catalog route (folder)

**Test scenarios**

- **Shipped build shows no purchase control**
  1. Sign in on the shipped build.
  2. Open Settings, Subscription.
  - Expected: Plan rows only; no purchase, upgrade, top-up or restore.
- **No store calls**
  1. Watch network traffic while opening Subscription.
  - Expected: No call to /api/mobile/iap/*.
- **Server flag off**
  1. Call GET /api/mobile/iap/catalog on a deployment without the flag.
  - Expected: Empty products with a reason.
- **Switch-on rehearsal**
  1. Build with nativePurchases true in a test track.
  2. Configure test products.
  3. Buy, then reinstall and restore.
  - Expected: Verify succeeds once, plan updates, restore reports an outcome.

**Where to look when it fails**

- Server event 'store_purchase_not_acknowledged' (apps/web/app/api/mobile/iap/verify/route.ts:43).
- Table mobile_iap_accounts.
- Error 'billing: cloud billing not available in v1' (apps/mobile/src/features/billing/service.ts:9).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **The brief names FEATURES.billing and MOBILE_IAP_ENABLED as the switch but omits the build-time storePurchases.json value, which really decides whether the purchase UI exists.** Affects: Owner doing the switch-on. Evidence: apps/mobile/src/features/billing/storePurchases.json; area brief S71.31. Work needed: Update the brief and runbook cross-reference.
- **The brief says no screen mounts the hook; the Subscription screen does.** Affects: Documentation. Evidence: apps/mobile/src/features/settings/cloud-billing/index.tsx:133. Work needed: Correct the brief.
- **Purchases are untested against live stores in this repository record.** Affects: Future paid users on iOS and Android. Evidence: No run record found. Work needed: Live validation with approved products.
- **Mobile status 'partial' with sales postponed to 2027.** Affects: Owner. Evidence: apps/mobile/store-listing/REVIEWER-NOTES-IOS.md:42. Work needed: Owner decision on timing.

**Depends on**

- surface:mobile
- mode:cloud
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- api:GET /api/mobile/iap/catalog
- api:POST /api/mobile/iap/verify
- api:POST /api/mobile/iap/apple-notifications
- api:POST /api/mobile/iap/google-notifications
- table:mobile_iap_accounts
- file:apps/mobile/src/features/billing/storePurchases.json

## Unknown

- Whether store products exist in App Store Connect or Play Console (not checkable from code).
- Server retention of purchase records.
- Exact lines of the switched-on purchase screen layout beyond the ones cited.
- Whether other apps will show store purchases (n/a for now).
- Tests were not read line by line.
