# Mobile store products: App Store and Google Play setup

Status: Draft. Nothing below has been exercised against a real App Store Connect or Play Console account; the code paths are covered by unit tests only.
Owner: Founder / billing operator
Last updated: 2026-10-12

This runbook creates the in-app purchase products the mobile app sells, connects
both stores' server notifications, and sets the server configuration that turns
purchases on. Every product id, price and setting the server reads is listed
here once. `apps/mobile/__tests__/storekit-configuration.test.ts` fails if the
ids in the two JSON blocks below, the StoreKit test file, or the catalog prices
drift apart.

Whether a signed-in account can buy is decided by the server on every request,
in `apps/web/app/api/mobile/iap/catalog/route.ts`. Nothing in the app build
decides it. Opening purchases to everyone is a server change (section 7) and
needs no new build, provided the build that is in the stores was reviewed with
in-app purchases declared (section 6).

## 1. What is sold

Prices are the monthly prices in `packages/contracts/types/src/billing-catalog.ts`,
read through `packages/contracts/types/src/mobile-iap.ts`. The store charges its
own localized price in each storefront; the app shows only the store's string.

| Logical key                    | Buyer-facing name | Price (USD) | Kind                       |
| ------------------------------ | ----------------- | ----------- | -------------------------- |
| `subscription_basic_monthly`   | AGI Basic         | 7.00 / mo   | auto-renewing subscription |
| `subscription_pro_monthly`     | AGI Pro           | 20.00 / mo  | auto-renewing subscription |
| `subscription_max_monthly`     | AGI Max 5x        | 100.00 / mo | auto-renewing subscription |
| `subscription_max_15x_monthly` | AGI Max 20x       | 200.00 / mo | auto-renewing subscription |
| `top_up_10`                    | 500 credits       | 10.00       | consumable                 |
| `top_up_20`                    | 1,000 credits     | 20.00       | consumable                 |
| `top_up_50`                    | 2,500 credits     | 50.00       | consumable                 |
| `top_up_100`                   | 5,000 credits     | 100.00      | consumable                 |

The 200 USD plan is named Max 20x everywhere a person reads it. `max_15x` is an
internal id only and must not appear in a store display name or description.

A top-up is sold only to an account that already holds an active paid plan; the
catalog leaves top-ups out for everyone else and the ledger refuses one bought
without a plan.

## 2. App Store Connect

App: bundle id `com.agiworkforce.app`.

### 2.1 Subscription group

Create one subscription group, reference name **AGI Workforce Plans**. All four
subscriptions go in this one group. That is what makes a second purchase a plan
change instead of a second subscription: Apple allows one active subscription
per group, applies an upgrade at once with a prorated refund, and applies a
downgrade at the next renewal.

Order the levels from most to least:

| Level | Product id                                | Reference name      | Duration | Price (USD) |
| ----- | ----------------------------------------- | ------------------- | -------- | ----------- |
| 1     | `com.agiworkforce.app.sub.max20x.monthly` | AGI Max 20x Monthly | 1 month  | 200.00      |
| 2     | `com.agiworkforce.app.sub.max.monthly`    | AGI Max 5x Monthly  | 1 month  | 100.00      |
| 3     | `com.agiworkforce.app.sub.pro.monthly`    | AGI Pro Monthly     | 1 month  | 20.00       |
| 4     | `com.agiworkforce.app.sub.basic.monthly`  | AGI Basic Monthly   | 1 month  | 7.00        |

For each: Family Sharing off (the server refuses a family-shared transaction),
no introductory offer, display name as in section 1.

### 2.2 Consumables

| Product id                          | Reference name     | Price (USD) |
| ----------------------------------- | ------------------ | ----------- |
| `com.agiworkforce.app.topup.usd10`  | AGI Top-up 10 USD  | 10.00       |
| `com.agiworkforce.app.topup.usd20`  | AGI Top-up 20 USD  | 20.00       |
| `com.agiworkforce.app.topup.usd50`  | AGI Top-up 50 USD  | 50.00       |
| `com.agiworkforce.app.topup.usd100` | AGI Top-up 100 USD | 100.00      |

Type Consumable. Purchased credits must not expire (App Store Review Guideline
3.1.1).

### 2.3 Billing grace period

App Store Connect, the app, Subscriptions, Billing Grace Period: turn it on.
With it on, a failed renewal arrives as `DID_FAIL_TO_RENEW` with subtype
`GRACE_PERIOD` and the server keeps the plan until the date Apple names. With
it off, a failed renewal suspends the plan at once.

### 2.4 Server notifications

App Information, App Store Server Notifications, Version 2:

- Production Server URL: `https://agiworkforce.com/api/mobile/iap/apple-notifications`
- Sandbox Server URL: the same path on the staging deployment. A deployment
  accepts the sandbox channel only when its own `APPLE_APP_STORE_ENVIRONMENT` is
  `sandbox`, or when `APPLE_APP_STORE_SANDBOX_NOTIFICATIONS_ENABLED` is `true`.
  Point it at production, with that setting on, only while an allowed review
  or tester account (section 4.1) needs its sandbox renewals and expiry
  followed there. A sandbox notice can only move a receipt that was itself
  granted as a test purchase.

The route verifies Apple's signature chain against the root certificates in
`APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON`; no shared secret is configured.

### 2.5 Local testing without App Store Connect

`apps/mobile/store-listing/ios/AGIWorkforce.storekit` is a StoreKit
configuration with the same four subscriptions in one group and the same four
consumables. The iOS project is generated by prebuild and is not tracked, so
attach the file by hand after a local prebuild: in Xcode, Product, Scheme, Edit
Scheme, Run, Options, StoreKit Configuration, choose this file. Transactions
made this way are signed by Xcode, not Apple, and the server refuses them; use
them to exercise the app's purchase, Ask to Buy, and plan-change screens.
End-to-end verification needs an App Store sandbox tester and either a server
whose `APPLE_APP_STORE_ENVIRONMENT` is `sandbox`, or production with the
tester's AGI account allowed as in section 4.1.

## 3. Google Play Console

App: package `com.agiworkforce.app`.

### 3.1 Subscriptions

Create four subscription products, each with one auto-renewing base plan whose
id is `monthly`, billing period one month. Four products and not one product
with four base plans: Play allows only the charge-full-price and
without-proration replacement modes when switching base plans inside one
subscription, and the app relies on charge-prorated-price for an upgrade and
deferred for a downgrade.

| Product id    | Base plan id | Name        | Price (USD) |
| ------------- | ------------ | ----------- | ----------- |
| `agi_basic`   | `monthly`    | AGI Basic   | 7.00        |
| `agi_pro`     | `monthly`    | AGI Pro     | 20.00       |
| `agi_max`     | `monthly`    | AGI Max 5x  | 100.00      |
| `agi_max_20x` | `monthly`    | AGI Max 20x | 200.00      |

Product ids cannot be changed or reused once created, and a base plan id cannot
be changed once the base plan is activated. On each base plan set a grace
period and leave account hold on; leave resubscribe on. Do not add a second
base plan or a prepaid plan to these products without first adding it to
`MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON`: the server refuses a purchase whose base
plan is not the configured one.

### 3.2 One-time products

| Product id      | Name          | Price (USD) |
| --------------- | ------------- | ----------- |
| `agi_topup_10`  | 500 credits   | 10.00       |
| `agi_topup_20`  | 1,000 credits | 20.00       |
| `agi_topup_50`  | 2,500 credits | 50.00       |
| `agi_topup_100` | 5,000 credits | 100.00      |

Consumable, quantity one. The server refuses any other quantity.

### 3.3 Service account for the Play Developer API

Create a Google Cloud service account, enable the Google Play Android Developer
API in its project, and invite its email in Play Console, Users and
permissions, with these app permissions:

- View financial data, orders, and cancellation survey responses. Needed to read
  a purchase.
- Manage orders and subscriptions. Needed to acknowledge a purchase. This one is
  taken from the API reference for the acknowledge methods and has not been
  confirmed against a live console.

Its JSON key is the value of `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Only
`client_email` and `private_key` are read.

### 3.4 Real-time developer notifications

1. In the same Google Cloud project create a Pub/Sub topic, for example
   `play-rtdn`.
2. On the topic, add the principal
   `google-play-developer-notifications@system.gserviceaccount.com` with the role
   Pub/Sub Publisher.
3. Create a second service account that only signs push deliveries, for example
   `play-rtdn-push`. Its email is the value of
   `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL`.
4. Create a push subscription on the topic:
   - Endpoint: `https://agiworkforce.com/api/mobile/iap/google-notifications`
   - Enable authentication, service account from step 3.
   - Audience: a fixed string of your choosing, for example the endpoint URL.
     The same string is the value of `GOOGLE_PLAY_PUBSUB_AUDIENCE`.
   - Acknowledgement deadline 60 seconds, retry policy exponential backoff.
5. Play Console, Monetize, Monetization setup, Real-time developer
   notifications: enter the topic as `projects/<project-id>/topics/play-rtdn`
   and choose **Get all notifications for subscriptions and one-time products**.
   The narrower option drops one-time product events. Voided purchases arrive
   under both options and are how a Play refund of a top-up takes its credits
   back.
6. Send a test notification from that page. The route answers it with status
   `test` and changes nothing.

## 4. Server configuration

Set these on the web deployment. Every name is read under `apps/web`.

`MOBILE_IAP_APPLE_PRODUCT_IDS_JSON`

```json
{
  "subscription_basic_monthly": "com.agiworkforce.app.sub.basic.monthly",
  "subscription_pro_monthly": "com.agiworkforce.app.sub.pro.monthly",
  "subscription_max_monthly": "com.agiworkforce.app.sub.max.monthly",
  "subscription_max_15x_monthly": "com.agiworkforce.app.sub.max20x.monthly",
  "top_up_10": "com.agiworkforce.app.topup.usd10",
  "top_up_20": "com.agiworkforce.app.topup.usd20",
  "top_up_50": "com.agiworkforce.app.topup.usd50",
  "top_up_100": "com.agiworkforce.app.topup.usd100"
}
```

`MOBILE_IAP_GOOGLE_PRODUCT_IDS_JSON`

```json
{
  "subscription_basic_monthly": { "productId": "agi_basic", "basePlanId": "monthly" },
  "subscription_pro_monthly": { "productId": "agi_pro", "basePlanId": "monthly" },
  "subscription_max_monthly": { "productId": "agi_max", "basePlanId": "monthly" },
  "subscription_max_15x_monthly": { "productId": "agi_max_20x", "basePlanId": "monthly" },
  "top_up_10": "agi_topup_10",
  "top_up_20": "agi_topup_20",
  "top_up_50": "agi_topup_50",
  "top_up_100": "agi_topup_100"
}
```

A Google Play subscription entry must be an object naming its base plan; a bare
string is refused when the catalog is read, with an error naming the key. An optional `"offerId"` selects a
discounted offer on that base plan; without it the app buys the base plan
itself. An App Store entry is always a bare string.

| Setting                                         | Value                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `MOBILE_IAP_ENABLED`                            | `true` once both maps above are set and the products are approved              |
| `MOBILE_IAP_GOOGLE_REPLACEMENT_MODES_JSON`      | optional; default `{"upgrade":"charge-prorated-price","downgrade":"deferred"}` |
| `APPLE_APP_STORE_BUNDLE_ID`                     | `com.agiworkforce.app`                                                         |
| `APPLE_APP_STORE_APP_ID`                        | the numeric Apple ID of the app, from App Information                          |
| `APPLE_APP_STORE_ENVIRONMENT`                   | `production` on production, `sandbox` on staging                               |
| `APPLE_APP_STORE_ROOT_CA_CERTS_BASE64_JSON`     | JSON array of Apple root CA certificates, each base64 DER                      |
| `APPLE_APP_STORE_SANDBOX_NOTIFICATIONS_ENABLED` | unset on production, except as section 2.4 describes                           |
| `GOOGLE_PLAY_PACKAGE_NAME`                      | `com.agiworkforce.app`                                                         |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`              | the key from 3.3                                                               |
| `GOOGLE_PLAY_PUBSUB_AUDIENCE`                   | the audience from 3.4 step 4                                                   |
| `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL`      | the email from 3.4 step 3                                                      |

### 4.1 Store review and tester purchases on production

App Review buys in Apple's sandbox, and a Play license tester's purchase is a
test purchase; both reach the production server and neither is charged. Apple's
own guidance is to accept both environments on one server so nothing has to be
switched while the app is in review ("Validating receipts with the App Store",
developer.apple.com). Production therefore verifies a sandbox-signed App Store
transaction against Apple's sandbox chain after the production chain refuses
it, and reads Play's `testPurchase` marker.

A test purchase is granted only to an account the operator has named. Nobody is
named by default, and every failure to read the allowance refuses the purchase.
The allowance is a user override on the feature flag
`billing.store_test_purchases`, read by
`apps/web/lib/feature-flags/store-test-purchase-gate.ts`, and it takes effect
without a deployment:

1. Operator dashboard, Flags, **Store test purchases**: enter the AGI user id of
   the review or tester account and choose **Allow test purchases**. Nothing has
   to exist first. The first use creates the flag with variants `on` and `off`
   and default `off`, then adds the override (`setFlagOverride` in
   `apps/web/lib/feature-flags/flag-admin-service.ts`). The flag then appears in
   the Flags table with that override under it.
2. Leave the flag's default `off` and give it no rules: only an override that
   names a user admits anyone, so a default, a rule or a workspace override of
   `on` admits nobody.
3. Do this for the account whose credentials are in App Store Connect's and
   Play Console's review fields **before submitting the build**.
4. When review or testing ends, open the flag's **Overrides** in the Flags table
   and remove the account. The override has no expiry of its own.

Any other account that makes a test purchase is refused with "This purchase was
made in the store's test environment, which this account is not set up to use.
Nothing was charged." On Android the purchase is left unacknowledged, so Play
cancels it.

A granted test purchase is recorded with `environment = 'sandbox'` in
`mobile_iap_transactions`. It records no store commission, and a test top-up's
credit entry carries `charged_cents: 0` and `store_environment: 'sandbox'`, so
it adds nothing to top-up revenue. While its plan is active the account still
counts as one subscription in the operator economics summary, which counts
subscription rows; that is the review account and nobody else. Sandbox
subscriptions renew every few minutes and end on their own; once the override
is removed their renewals are ignored and the plan lapses.

## 5. What the server does with each store event

Entitlement is the `subscriptions` row: `active` grants the plan, `past_due` and
`paused` keep the plan on record but grant nothing, `canceled` returns the
account to Free. The mapping lives in `apps/web/lib/server/mobile-iap-lifecycle.ts`
and is applied by `apps/web/lib/services/mobile-iap-notification-service.ts`.

| Event                                                             | Result                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| First purchase, resubscribe, renewal, billing recovery            | active to the new paid-through date; usage allocated for it       |
| Upgrade                                                           | new plan active at once; usage carried into the new period        |
| Downgrade scheduled for renewal                                   | current plan stays; the lower plan starts when the store renews   |
| Auto-renew turned off, or cancelled in the store                  | active until the paid-through date, marked as ending              |
| Failed renewal inside a grace period                              | active until the grace end the store names; no new usage          |
| Failed renewal with no grace, grace ended, Play account hold      | `past_due`; restored by the recovery event                        |
| Play pause                                                        | `paused`; restored when Play resumes it                           |
| Expiry, including billing retry that ran out                      | Free                                                              |
| Refund or revocation of the current period                        | Free                                                              |
| Refund of a top-up, Play voided purchase of a top-up              | the credits are taken back once, by the refunded fraction         |
| Apple refund reversed                                             | subscription reinstated if still paid through; top-up re-credited |
| Purchase completed with the app closed (Ask to Buy, slow payment) | granted from the notification alone                               |
| Any notice about a purchase the subscription is no longer on      | recorded and ignored; the live plan is not touched                |
| Auto-renew or plan choice changed during grace or billing retry   | ignored; access follows the grace and retry notices               |
| A charge the ledger cannot grant                                  | a pending refund request for the operator (below)                 |
| A renewal or recovery charge for a plan another purchase now owns | plan untouched; a pending refund request, once per transaction    |
| A paid purchase that names no account, or one that is gone        | nothing granted; a high-severity security log entry (below)       |

Every notification is recorded by its store id before it changes anything, so a
redelivery is a no-op. A Google Play purchase is acknowledged by the server
after the grant is committed, on both the app's verify call and the
notification, because Play refunds a subscription nobody acknowledges within
three days. An App Store notice that describes a period the subscription has
already moved past is recorded and ignored. The auto-renew choice is taken only
from the newest event on both stores: Apple's signature time, and the
`eventTimeMillis` of a Play notification, because two Play deliveries handled at
once can finish in the opposite order to the state they read (migration `0361`).

The app's verify call and the store's notice name a paid period the same way
(`storePeriodStart` in `apps/web/lib/services/mobile-iap-ledger-service.ts`),
so the period is allocated once whichever arrives first. A Play plan change that
keeps the billing date reports the moment of the change as its start; the
period keeps the start already recorded for that paid-through date.

A store event moves only the subscription it owns. The `subscriptions` row
records one owner: an App Store original transaction id, a Google Play purchase
token, or a Stripe subscription. A grace, hold, pause, expiry, refund or
revocation for any other purchase is marked stale. That covers the Play token an
upgrade, downgrade or resubscription replaced, whose expiry Play still reports,
and a purchase on the other store. A purchase that is active at its store may
take the row only when no other live purchase holds it. That holds within one
store too: a plan bought with a second Apple ID, or a Play token that does not
replace the recorded one, is refused while the first is still paid, and filed
for refund as below. The catalog cannot prevent it, because the server never
learns which store account a device is signed in to.

The catalog does not offer a plan while Stripe or the other store still bills
the account, and the Billing screen says why. A charge can still arrive that
the ledger refuses, for example a plan bought on a second device in that
window, or a top-up a family organiser approved after the plan lapsed. Each one
is filed once in `billing_refund_requests` as `pending` and `needs_review`, with
charge id `mobile_iap:<platform>:<store transaction id>`, and appears in the
operator's refund queue. So does a renewal or recovery charge that arrives for a
plan another purchase has since taken over: the store kept billing a
subscription the account no longer uses. A store transaction is filed once and
never again, whatever was decided about it, so a replayed notice cannot reopen a
request the operator closed.

The queue shows **Record App Store refund** or **Record Google Play refund** on
these in place of the Stripe refund button. Refund a Play order from Play
Console, Order management. Apple issues App Store refunds itself: send the
customer to reportaproblem.apple.com. Once the store shows the refund, record
it: the request closes as refunded for the listed amount with no Stripe refund,
and the customer is told the store returned the money (migration `0362`).
Decline it instead, with a note, when no refund is due. A request whose purchase
is later granted, because the conflicting plan ended and the customer restored
the purchase, closes on its own as declined with the note "This purchase was
added to the account after the request was filed, so no refund is due." An
unacknowledged Play purchase is also refunded by Play on its own after three
days.

A paid, non-test purchase that the server cannot give to any account is never
granted and never silently dropped. It has no account to file a refund request
under, so it is written to the security audit log as `suspicious_activity`,
severity `high`, with `details.action` = `store_purchase_unattributed`, the
platform, the store transaction id, the product and one reason: `no_account_token`
(bought outside the app, so the store names no AGI account), `unknown_account`
(the account was deleted) or `not_grantable` (refused without reaching the
refund queue). Find them in the operator dashboard's security events, or with
`select * from security_audit_logs where details->>'action' =
'store_purchase_unattributed'`. Look the transaction up in App Store Connect or
Play Console, Order management, and refund it there. The store is answered only
after that record is written, so it retries until it is.

The app consumes a Play top-up after the server grants it. One the server
acknowledged while the app was closed is consumed the next time Billing opens,
so the same top-up can be bought again.

### 5.1 A parent or guardian withdraws consent

Texas SB 2420, Utah and Louisiana let a parent or guardian withdraw consent for
a child's use of the app. Apple reports it with the App Store Server
Notifications V2 type `RESCIND_CONSENT`, documented at
developer.apple.com/documentation/appstoreservernotifications/notificationtype.
It names the install through `appData.signedAppTransactionInfo`, never an AGI
account, and it reaches the server only through the URLs in section 2.4, so set
both the production and the sandbox Server URL before the first App Store
submission.

To find the account, the iOS app sends Apple's signed app transaction to
`POST /api/mobile/age-assurance/app-transaction` after Cloud sign-in, once per
account on each install. The server verifies Apple's signature and the bundle
id, never a raw id from the app, and records the install against the account in
`mobile_app_transactions`. One install can serve several accounts.

On `RESCIND_CONSENT` the server records the withdrawal in
`mobile_app_consent_rescissions` by its notification id, so a redelivery
answers `duplicate` and changes nothing. Every account recorded for that
install loses its App Store plan at once (Free, and the Apple receipt marked
`revoked`), and the route answers `consent_rescinded`. An install no account has
registered yet answers `unknown_app_transaction`; the withdrawal is still kept,
and an account that registers that install later loses its App Store plan then.
From then on the ledger refuses every store purchase and renewal for those
accounts, on both stores, and files a charged one for refund as above. Apple
keeps billing a subscription until it is cancelled at Apple; send the family to
reportaproblem.apple.com. Apple sends no notice when consent is given again, so
lifting the refusal is a support decision made in the database.

Migration `0377` must be applied before the deploy that ships this, or every
`RESCIND_CONSENT` notice and every purchase verification fails.

Google Play has no consent-withdrawal notification or API. Withdrawn approvals
appear only as install ids in Play Console, Age signals, **Revoked app
approvals**, as a CSV. Download it weekly and handle each install by hand.

## 6. What the store submission has to match

`apps/mobile/store-listing/LISTING-METADATA-IOS.json` and
`apps/mobile/store-listing/LISTING-METADATA-ANDROID.json` declare in-app
purchases, and the two reviewer notes describe the purchase screens. Before
submitting a build:

- App Store Connect: attach all eight in-app purchases to the app version, with
  a review screenshot for each.
- Give App Review and Play review a signed-in test account (email and password;
  Clerk production has Device Trust off so sign-in needs no one-time code).
- `apps/mobile/src/features/release-state/mobileReleaseState.json` records both
  stores as unpublished. While a store is unpublished the app does not name it
  and shows no link to its subscription settings, so a store subscriber is told
  only that the plan renews in the store it was bought from. For the build that
  ships to a store, set that store's status to published together with the
  listing id, listing URL and subscription management URL of the live listing.
  This file is compiled into the app, so it is the one billing value that does
  need a build. Its evidence text still describes a listing with no purchases
  and should be rewritten in the same change.

## 7. Opening purchases

1. Complete sections 2 to 4 and submit the build (section 6). Apply migrations
   `0361` and `0362` with `pnpm db:migrate -- apply --target <env>` before the
   code that needs them is deployed: without `0361` every subscription notice
   fails, and without `0362` a Play pause notice fails and a store refund cannot
   be recorded.
2. Set `MOBILE_IAP_ENABLED` to `true`. Every signed-in mobile account can now
   buy: store purchases have no waitlist or access code (App Review 3.1.1 bans
   app-run unlock mechanisms). The web upgrade waitlist is separate and owned by
   `apps/web/lib/server/billing-waitlist-access.ts`.
3. Credit top-ups are not sold in Japan storefronts (3.1.1: purchased credits may
   not expire; `PURCHASED_CREDIT_EXPIRY_RULES` expires JP credits). The catalog
   omits them for a JP storefront and the ledger refuses a JP top-up grant; also
   remove Japan from each top-up's availability in App Store Connect and Play
   Console.
4. To stop new purchases at any time, turn off the `in_app_purchase` kill switch
   or set `MOBILE_IAP_ENABLED` to `false`. Existing subscribers keep their
   plans, and purchases already made still verify and restore.

## 8. Verification that needs real accounts

None of this has been run. Do each on staging with store testers before
production, then repeat the first item on production with an allowed account
(section 4.1) and once with an account that is not allowed:

- Buy each plan and each top-up on iOS and Android; confirm the plan or credits
  arrive and the store shows the purchase as finished or acknowledged.
- Kill the app after paying and before it returns; confirm the notification
  grants the purchase and, on Android, acknowledges it.
- Upgrade and downgrade in both stores; confirm an upgrade is immediate and a
  downgrade waits for renewal, and that the Billing screen says so.
- Ask to Buy on iOS with a child account; approve from the organiser's device
  with the app closed.
- A pending payment on Android with a slow test card; approve and decline.
- Let a renewal fail (sandbox "always declines" card on Android; billing retry
  in the App Store sandbox) and confirm grace, hold, recovery and expiry.
- Refund a subscription and a top-up from each console; reverse an Apple refund.
- Restore purchases on a second device signed in to the same AGI account, and
  confirm a different AGI account cannot claim the same receipt.
