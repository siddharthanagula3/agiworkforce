---
id: "F100-05"
type: "feature"
title: "Mobile store purchases (Apple and Google)"
aliases: ["Mobile receipt validation (S100.17)", "In-app purchase (IAP)", "native purchases", "store purchases", "Subscription screen", "MOBILE_IAP_ENABLED", "in_app_purchase kill switch"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.17"]
depends_on: ["F100-01", "F100-04", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-execution-boundaries", "table:mobile_iap_accounts", "table:subscriptions", "surface:mobile"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-05 Mobile store purchases (Apple and Google)

Lets the mobile app sell plans and credit top-ups through the Apple App Store and Google Play. The server checks each store receipt, records the grant and tells the store it was delivered. It is off in the current mobile build, and also off on the server unless a deployment switch is set.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.17](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10017).

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

**What it does.** Lists store products for an account, verifies a purchase receipt with Apple or Google, grants the matching plan or credits once, acknowledges the purchase with the store, and processes store renewal and refund notifications (apps/web/app/api/mobile/iap/catalog/route.ts; verify/route.ts; lib/server/mobile-iap-store-verification.ts).

**Why it exists.** Phone stores require their own billing for in-app digital sales, and the account must still have one plan across all apps (doc: docs/product/commercial.md, Subscription Ownership Across The Suite; S100.17).

**Who uses it.** People on iPhone or Android when selling is turned on; operations who configure store products.

**Problems it solves**

- Granting a plan for an unverified or reused receipt (receipt bound to one account, verify route test returns 403 for a receipt bound elsewhere, apps/web/app/api/mobile/iap/verify/__tests__/route.test.ts:245-255).
- A purchase left unacknowledged and auto-refunded by Google (verify/route.ts:28-51).
- Two billing owners for one account (catalog hides plans while another channel bills, catalog/route.ts:175-179).

**Use cases**

- A signed-in iPhone user buys a subscription in the app; the server verifies it and the plan appears on every app.
- A paying user buys a credit top-up in the app.
- After reinstalling, the user taps Restore purchases and unfinished purchases are processed.
- With selling off, the person sees a message that nothing was charged.

## 2. User experience

**Where to find it**

- Mobile: Settings, 'Subscription' screen (apps/mobile/src/features/settings/screenTitles.ts:2). With native purchases compiled in it shows 'App Store and Google Play billing', 'Usage top-ups', 'Restore purchases' and 'Help with a purchase' (apps/mobile/src/features/settings/cloud-billing/index.tsx:651-855).
- Mobile 'Compare plans' lists plans only when native purchases are compiled in (apps/mobile/src/features/settings/plans/index.tsx:57-100).
- Web, Desktop, CLI, VS Code, Chrome: not applicable; they do not sell through the stores.

**Before you start**

- Mobile app build with nativePurchases true in storePurchases.json (currently false).
- Server MOBILE_IAP_ENABLED true, product id maps set, and the in_app_purchase capability not switched off.
- Signed in with Cloud account; an account scheduled for deletion or one that withdrew store consent gets no products (catalog/route.ts:117-136).
- Top-ups are offered only to accounts that already hold a paid plan, in storefronts that sell top-ups (catalog/route.ts:143, 157).

**Screens and controls**

- 'Subscription' screen with 'Your plan', 'Current plan', 'Compare plans', 'Billing', 'Workspace administration' (cloud-billing/index.tsx:354-560).
- Purchase rows for plans and 'Usage top-ups' (line 752).
- 'Restore purchases' row (line 804-815).
- Info cards 'Purchases are not available right now', 'Native purchase needs attention', 'Purchase verified', 'A purchase that did not arrive' (lines 791, 817, 823, 868).

**Journey**

1. Open Settings > Subscription.
2. The app asks the server for the catalog with its platform and storefront.
3. Tap a product; the store sheet opens and the person pays.
4. The app sends the receipt token to the server.
5. The server verifies, grants, acknowledges and replies; the app finishes the transaction and shows 'Purchase verified'.
6. Other apps pick up the plan from the account.

**What the person sees and gets**

- 'Plans and credits cannot be bought in the app at the moment. Nothing was charged.' when unavailable (cloud-billing/index.tsx:795).
- Server reasons: 'Native purchases are not enabled for this deployment.', 'In-app purchases are temporarily switched off. Nothing was charged.' (mobile-iap-catalog.ts:132; catalog/route.ts:38-39).
- Verify errors: 'This store product is not registered for AGI.' and 'Open Billing again before verifying this purchase.' (verify/route.ts:66, 77).
- Restore outcomes nothing-to-restore, already-restored, store-unavailable (useMobileIap.ts:44-45).

**Settings**

- Server: MOBILE_IAP_ENABLED, MOBILE_IAP_APPLE_PRODUCT_IDS_JSON, MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON, MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON (mobile-iap-catalog.ts:40-45, 53-56).
- Build: apps/mobile/src/features/billing/storePurchases.json nativePurchases.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Catalog endpoint returns enabled false with a named reason when the deployment switch is off, no products are registered, the kill switch is on, deletion is scheduled, store consent was withdrawn, or another channel bills the plan (mobile-iap-catalog.ts:127-150; catalog/route.ts:59-186).
- Catalog also creates or reads a per-user app account token used to bind purchases (catalog/route.ts:159-169).
- Product id maps are validated: unknown keys, duplicate store ids and a missing Google base plan are errors (mobile-iap-catalog.ts:63-114).
- Verify validates the body, resolves the product, requires an existing app account token, verifies with the store, records the grant, then acknowledges Google purchases after the grant is committed; an acknowledgement failure is logged and the result is still returned (verify/route.ts:53-114).
- A purchase that was charged but cannot be granted files a refund request (apps/web/lib/services/mobile-iap-ledger-service.ts:319-368).
- Apple and Google renewal and refund notifications have their own routes (app/api/mobile/iap/apple-notifications/route.ts; google-notifications/route.ts).
- The mobile app has the purchase hook, restore flow and catalog parse tests (apps/mobile/src/features/billing/useMobileIap.ts; __tests__).

**Incomplete**

- Verify does not itself re-check the deployment switch or the kill switch; it resolves the product from the configured maps, so with the switch off no product resolves and the call is refused (verify/route.ts:65-66; mobile-iap-catalog.ts:127-157 resolveMobileIapProduct reads maps only). Whether a stale map would let a verify through while the catalog says off was not established.
- The brief lists a waitlist redemption requirement for the catalog; the catalog and verify routes do not read beta_redemptions and their tests assert they do not (catalog/__tests__/route.test.ts:156-159; verify/__tests__/route.test.ts:242-245).

**Present but disconnected or switched off**

- The mobile build flag nativePurchases is false: the app shows no purchase, upgrade, top-up or restore control and the store connection is not opened (apps/mobile/src/features/billing/storePurchases.json:2-10; nativePurchaseAvailability.ts:3; cloud-billing/index.tsx:351).
- MOBILE_IAP_ENABLED is off unless set to 1, true or yes (mobile-iap-catalog.ts:53-56).
- Docs confirm mobile v1 sells nothing in the app (doc: docs/product/commercial.md, Launch Posture and Paid Acquisition Gate).

**Not available**

- Store purchases on web, desktop, CLI, VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- Receipts from Apple and Google are validated server-side and grant the matching plan or credits. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.17)
- Mobile v1 sells nothing in the app; when store purchase is turned on it opens with no waitlist or access code. (source: doc: docs/product/commercial.md (Launch Posture, Paid Acquisition Gate))
- One billing owner per user; a store purchase is refused while another channel is still entitled. (source: doc: docs/product/commercial.md (Subscription Ownership Across The Suite))
- Selling also needs the server side described in the store products runbook. (source: doc: apps/mobile/src/features/billing/storePurchases.json readme; docs/runbooks/mobile-store-products.md)

**Acceptance criteria**

1. With the build flag false, the Subscription screen shows the plan without any purchase or restore control.
2. With MOBILE_IAP_ENABLED unset, GET /api/mobile/iap/catalog returns enabled false with 'Native purchases are not enabled for this deployment.'
3. With the kill switch on, the catalog returns enabled false with 'In-app purchases are temporarily switched off. Nothing was charged.'
4. POST verify with a product not in the maps returns 400 'This store product is not registered for AGI.'
5. POST verify before any catalog call returns 409 'Open Billing again before verifying this purchase.'
6. A receipt bound to another account is refused with 403.
7. A valid Google subscription purchase is granted, then acknowledged; if acknowledgement fails the response still returns with storeAcknowledged false.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The mobile app must still acknowledge a purchase when the server could not, which is why the server returns storeAcknowledged [inferred from verify/route.ts:28-30 comment].
- Because the catalog route opens the app account token and the verify route requires it, the catalog call is the required first step [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Have the verify route check the same switches as the catalog so the two cannot disagree.
- [proposed] Record the brief's stale waitlist note as removed.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/mobile/iap/catalog | `apps/web/app/api/mobile/iap/catalog/route.ts` | Products and app account token for the platform. |
| endpoint | POST /api/mobile/iap/verify | `apps/web/app/api/mobile/iap/verify/route.ts` | Verifies and grants a purchase. |
| endpoint | POST /api/mobile/iap/apple-notifications | `apps/web/app/api/mobile/iap/apple-notifications/route.ts` | Apple server notifications. |
| endpoint | POST /api/mobile/iap/google-notifications | `apps/web/app/api/mobile/iap/google-notifications/route.ts` | Google real-time notifications. |
| config | mobile-iap-catalog | `apps/web/lib/server/mobile-iap-catalog.ts` | Switch, product id maps, replacement modes (lines 53, 63, 127, 152, 159). |
| service | mobile-iap-store-verification | `apps/web/lib/server/mobile-iap-store-verification.ts` | Apple and Google verification and Google acknowledgement (lines 289, 487, 599, 631). |
| service | mobile-iap-ledger-service | `apps/web/lib/services/mobile-iap-ledger-service.ts` | recordVerifiedMobileIapPurchase, consent, paid-plan check (line 319). |
| service | mobile-iap-notification-service | `apps/web/lib/services/mobile-iap-notification-service.ts` | Applies store lifecycle notifications. |
| service | mobile-iap-lifecycle | `apps/web/lib/server/mobile-iap-lifecycle.ts` | Store subscription state rules. |
| service | subscription-owner-handoff | `apps/web/lib/server/subscription-owner-handoff.ts` | Decides whether a channel may take over billing ownership. |
| config | MOBILE_IAP_PRODUCT_DEFINITIONS | `packages/contracts/types/src/mobile-iap.ts` | Logical product keys, kinds and plan tiers shared by server and app. |
| table | mobile_iap_accounts | `apps/web/db/neon/0112_mobile_native_iap.sql` | Per-user app_account_token (read at verify/route.ts:69-75). |
| table | mobile_app_transactions | `apps/web/lib/services/mobile-iap-ledger-service.ts` | Store transaction records read by the catalog (catalog test line 143). |
| table | subscriptions | `apps/web/db/neon/0046_mobile_iap_subscription_columns.sql` | apple_original_transaction_id and google_purchase_token columns. |
| config | storePurchases.json | `apps/mobile/src/features/billing/storePurchases.json` | Build-time switch nativePurchases (false). |
| config | NATIVE_PURCHASES_AVAILABLE | `apps/mobile/src/features/billing/nativePurchaseAvailability.ts` | Reads the switch for screens (line 3). |
| hook | useMobileIap | `apps/mobile/src/features/billing/useMobileIap.ts` | Catalog, purchase, restore and finish-transaction flow (lines 253, 546, 593, 630). |
| service | mobileIapService | `apps/mobile/src/features/billing/mobileIapService.ts` | Calls the catalog and verify endpoints (lines 171, 181). |
| screen | Subscription screen (cloud-billing) | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Plan, purchases, restore and help. |
| screen | Plans comparison | `apps/mobile/src/features/settings/plans/index.tsx` | Compare plans, gated on the build switch. |
| service | capability kill switch | `apps/web/lib/feature-flags/capability-gate.ts` | readKillSwitchGate for in_app_purchase (catalog/route.ts:60-71). |
| other | store products runbook | `docs/runbooks/mobile-store-products.md` | How the store side is set up (named by storePurchases.json readme). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The Subscription screen asks the server for the catalog with platform and storefront. | device and our servers | apps/mobile/src/features/billing/mobileIapService.ts:171; catalog/route.ts:41-59 |
| The server decides if selling is enabled, checks the kill switch, deletion and consent state, and the subscription owner, and creates the app account token. | our servers | catalog/route.ts:59-186 |
| The person pays in the store's own sheet. | outside service | useMobileIap.ts:546, 593 (requestPurchase) |
| The app posts platform, product id and purchase token to verify. | device and our servers | mobileIapService.ts:181; verify/route.ts:20-26 |
| The server verifies the receipt with Apple or Google, checking it is for this account's token. | outside service | mobile-iap-store-verification.ts:289-336, 487-599 |
| The server records the grant (plan or credits), or files a refund request if it was charged but cannot be granted. | our servers | verify/route.ts:86-91; mobile-iap-ledger-service.ts:319-368 |
| The server acknowledges a Google purchase, writes an audit event and returns the result; the app finishes the transaction. | our servers | verify/route.ts:92-113; useMobileIap.ts:199-203 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| App account token per user | table mobile_iap_accounts | Server only; the token is sent to the app for the store call | Account erasure manifest includes mobile tables (apps/web/lib/server/account-erasure.ts and deletion-manifest.ts reference mobile_app_transactions); exact handling unknown |
| Store identifiers on the subscription (apple_original_transaction_id, google_purchase_token) | table subscriptions | Server only | unknown |
| Hash of the purchase token | server ledger (hashMobileIapPurchaseToken, mobile-iap-store-verification.ts:116) | Server only | unknown |
| Audit event mobile_purchase_verified | audit store | Server only | unknown |

**Models and providers.** No model or model provider takes part. The stores (Apple, Google) are the payment providers and the verification calls go to them. The granted plan later decides models and limits (see F100-01).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account (requireCurrentUserId, verify/route.ts:57; catalog/route.ts:47). |
| Permissions | The caller buys for their own account only; receipts are bound to one account through the app account token. |
| Subscription | Subscriptions are offered only when no other channel is billing the plan; top-ups only when the account holds a paid plan and the storefront sells top-ups (catalog/route.ts:143-157, 175-180). |
| Limits and metering | Rate limit keys mobile-iap-catalog and mobile-iap-verify (rate-limit.ts:162; catalog/route.ts:44; verify/route.ts:54). Purchased credits then follow the credit ledger rules (F100-03). |
| Feature flags | MOBILE_IAP_ENABLED, product id JSON variables, the in_app_purchase capability kill switch, and the build-time nativePurchases value. |
| Model compatibility | none found in the code. |
| Provider restrictions | Apple for iOS and Google Play for Android; Google subscriptions need a base plan id (mobile-iap-catalog.ts:95-100). |
| Local mode | Local inference on mobile needs no purchase. The Subscription screen and its purchases need a Cloud account sign-in (cloud-billing/index.tsx:343-349); local use is not gated by this feature [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Selling off in build | Screen shows the plan and 'Billing' rows only. | cloud-billing/index.tsx:351-360 |
| Selling off on server | Catalog enabled false with the reason. | mobile-iap-catalog.ts:127-134 |
| Kill switch on | Catalog enabled false, products empty. | catalog/route.ts:71-80 |
| Account scheduled for deletion | enabled false with the deletion reason. | catalog/route.ts:117-126 |
| Store consent withdrawn | enabled false with the consent reason. | catalog/route.ts:127-136 |
| Another channel bills the plan | Subscription products hidden, a reason is returned. | catalog/route.ts:144-147, 175-181 |
| Store acknowledgement fails | Logged as store_purchase_not_acknowledged; response still returns with storeAcknowledged false; the app acknowledges again. | verify/route.ts:37-50 |
| Charged but cannot be granted | A refund request is filed and the error is rethrown. | mobile-iap-ledger-service.ts:329-366 |
| Restore with nothing to restore | Outcome nothing-to-restore. | useMobileIap.ts:455-458 |
| Offline | not handled in the code read; the hook sets 'Native purchases are unavailable right now. Please try again shortly.' for store errors (useMobileIap.ts:377). | apps/mobile/src/features/billing/useMobileIap.ts:377 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/mobile/iap/catalog/__tests__/route.test.ts`: Catalog route; includes a check that beta_redemptions is not queried (line 156) and a case where the deployment is not enabled.
- `apps/web/app/api/mobile/iap/verify/__tests__/route.test.ts`: Verify route; includes a receipt bound to another account returning 403 and no beta_redemptions query.
- `apps/web/app/api/mobile/iap/apple-notifications/__tests__/route.test.ts`: By file name: Apple notifications. Contents not read.
- `apps/web/app/api/mobile/iap/google-notifications/__tests__/route.test.ts`: By file name: Google notifications. Contents not read.
- `apps/web/lib/server/mobile-iap-catalog.test.ts`: By file name: the product maps and switch. Contents not read.
- `apps/web/lib/server/mobile-iap-store-verification.test.ts`: By file name: store verification. Contents not read.
- `apps/web/lib/services/mobile-iap-ledger-service.test.ts`: By file name: grants and refund filing. Contents not read.
- `apps/web/lib/server/mobile-iap-lifecycle.test.ts`: By file name: lifecycle rules. Contents not read.
- `apps/mobile/src/features/billing/__tests__/MobileIapPurchaseFlow.test.tsx`: By file name: the purchase flow. Contents not read.
- `apps/mobile/src/features/billing/__tests__/MobileIapAcknowledgement.test.tsx`: By file name: acknowledgement. Contents not read.
- `packages/contracts/types/src/__tests__/mobile-iap.test.ts`: By file name: shared product definitions. Contents not read.

**Test scenarios**

- **Everything off**
  1. Use the current mobile build and a server without MOBILE_IAP_ENABLED.
  2. Open Settings > Subscription.
  - Expected: No purchase or restore control; the plan and billing rows are shown.
- **Server off, call the API**
  1. With MOBILE_IAP_ENABLED unset, call GET /api/mobile/iap/catalog?platform=ios with a valid session.
  - Expected: enabled false, empty products, reason 'Native purchases are not enabled for this deployment.'
- **Kill switch**
  1. Enable the server, register products, then turn the in_app_purchase kill switch on.
  2. Call the catalog.
  - Expected: enabled false with 'In-app purchases are temporarily switched off. Nothing was charged.'
- **Verify before catalog**
  1. For a fresh account, post a verify request for a registered product.
  - Expected: 409 'Open Billing again before verifying this purchase.'
- **Sandbox subscription purchase**
  1. Build with nativePurchases true in a test build, enable the server, buy in the store sandbox.
  2. Watch the verify call and the account's plan on web.
  - Expected: Plan granted once; Google purchase acknowledged; the web account shows the plan.
- **Plan owned by Stripe**
  1. Use an account with a live Stripe subscription and call the catalog from mobile.
  - Expected: Subscription products are hidden with a reason naming where the plan is billed.

**Where to look when it fails**

- Log events store_purchase_not_acknowledged and store_purchase_charged_not_granted.
- Audit event mobile_purchase_verified.
- Tables mobile_iap_accounts, subscriptions, mobile_app_transactions; response field unavailableReason.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief says the catalog needs an upgrade-waitlist redemption. The code and its tests say it does not.** Affects: Testers and planners relying on the brief. Evidence: apps/web/app/api/mobile/iap/catalog/__tests__/route.test.ts:156-159; verify/__tests__/route.test.ts:242-245; docs/product/commercial.md (Paid Acquisition Gate). Work needed: Remove the stale note from the brief.
- **There are three independent switches (build flag, deployment variable, kill switch) and verify checks none of the last two directly.** Affects: surface:mobile. Evidence: storePurchases.json:2; mobile-iap-catalog.ts:53-56; catalog/route.ts:71-80; verify/route.ts:53-114. Work needed: Decide whether verify must refuse when the catalog is off, and add a test.
- **Selling is switched off, so the whole flow is unverified against the real stores.** Affects: surface:mobile. Evidence: storePurchases.json:2; docs/product/commercial.md (Launch Posture). Work needed: Run the sandbox scenarios on both stores before turning it on.
- **The brief points the verify route at line 50 and the catalog at 83; the files differ (verify handler 53-114, catalog handler 41-187).** Affects: Engineers following the brief. Evidence: verify/route.ts:53; catalog/route.ts:41. Work needed: Refresh the brief pointers.

**Depends on**

- F100-01
- F100-04
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-execution-boundaries
- table:mobile_iap_accounts
- table:subscriptions
- surface:mobile

## Unknown

- Whether the live store products and credentials exist and work (no file records a store run).
- Whether verify would grant a purchase while the catalog reports off if product maps remain configured.
- Retention of purchase token hashes and mobile transaction rows.
- How a store top-up refund in some storefronts is handled beyond the test names (the verify test mentions a Japan top-up with a refund request).
- The exact keys in MOBILE_IAP_PRODUCT_DEFINITIONS.
- Which storefronts sell top-ups (mobileIapStorefrontSellsTopUps was not read).
