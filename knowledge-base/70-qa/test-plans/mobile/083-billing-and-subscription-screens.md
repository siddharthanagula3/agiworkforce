---
id: "PLAN-mobile-083"
type: "test-plan"
title: "Mobile · 83. Billing and subscription screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "83"
---
# Mobile · 83. Billing and subscription screens

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S83.01 Plan-comparison dialog.

- **Expected:** A plan-comparison view/dialog lets the user compare plans (price, usage, features) before choosing.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:550; apps/mobile/src/features/settings/plans/index.tsx:95
- **Where to find it:** Settings > Account > Subscription > What your plan includes (labels found in the code)
- **Needs:** a signed-in account in Cloud mode
- **Steps:**
  1. Sign in, open the sidebar and tap Settings.
  2. In the Account section, tap Subscription.
  3. Tap What your plan includes.
  4. Look at the card and its Includes list, and compare with Expected: only the signed-in plan is shown, not a side-by-side comparison of all plans.

## S83.03 Upgrade checkout.

- **Expected:** A signed-in user can start and complete a paid upgrade checkout.
- **Code:** partial. Evidence present: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:54
- **Known to be unfinished:** switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built
- **Owner decision is open on this item.**
- **Where to find it:** not found in the code. Checkout controls exist in apps/mobile/src/features/settings/cloud-billing/index.tsx but are drawn only when nativePurchases is true in storePurchases.json, and FEATURES.billing is false in apps/mobile/lib/v1FeatureFlags.ts, so no checkout can be reached in this build.
- **Needs:** a signed-in account and a build with purchases switched on

## S83.05 Proration explanation.

- **Expected:** Upgrades explain proration: credit for unused time, the charge today and when the next renewal happens.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:435 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No proration text exists in apps/mobile (searched for prorat, pro-rat and unused time); the only unused-time wording is in apps/mobile/src/features/settings/cloud-account/deleteAccountConfirmation.ts, so the item's code line is stale.

## S83.06 Tax and total-price display.

- **Expected:** Before paying, the user sees tax and the total price.
- **Code:** partial. Evidence present: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:54
- **Known to be unfinished:** switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built
- **Where to find it:** not found in the code. No tax or total-price text exists in apps/mobile (searched for tax); the only price line, The store shows the exact charge before you approve., is drawn only with purchases switched on.

## S83.08 Trial terms.

- **Expected:** When a plan starts as a trial, the user sees the trial terms: length, end date, what is charged after and how to cancel.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:349 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Subscription (labels found in the code)
- **Needs:** an account on a free trial
- **Steps:**
  1. Sign in with an account on a free trial.
  2. Open Settings, then Account, then Subscription.
  3. Read the row Trial ends and note its date.
  4. Compare with Expected: only the end date is shown; the trial length and the charge after the trial are not shown on this screen in this build.

## S83.13 Purchase confirmation.

- **Expected:** After paying, the user sees a confirmation of what was bought and that it is active.
- **Code:** partial. Evidence present: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:54
- **Known to be unfinished:** switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built
- **Where to find it:** not found in the code. The Purchase verified confirmation in apps/mobile/src/features/settings/cloud-billing/index.tsx is drawn only when nativePurchases is true, so no paid-purchase confirmation can be reached in this build.
- **Needs:** a build with purchases switched on

## S83.14 Payment failure.

- **Expected:** When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:167; apps/mobile/src/features/settings/cloud-billing/index.tsx:324; apps/mobile/src/features/billing/store.ts:79
- **Where to find it:** Settings > Account > Subscription (labels found in the code)
- **Needs:** an account with a failed payment
- **Steps:**
  1. Sign in with an account whose payment has failed (past due or similar).
  2. Open Settings, then Account, then Subscription.
  3. Read the summary under Your plan and the row Current plan.
  4. Tap Help with your plan and compare with Expected: no payment-failure message or fix link is shown on this screen in this build, and Help with your plan opens Support.

## S83.23 Scheduled cancellation.

- **Expected:** A scheduled (end-of-period) cancellation is shown with its date.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:318 (quoted code not found in the file now); apps/mobile/src/features/billing/store.ts:79
- **Where to find it:** Settings > Account > Subscription (labels found in the code)
- **Needs:** an account with a scheduled cancellation
- **Steps:**
  1. Sign in with an account whose paid plan is set to end at the period end.
  2. Open Settings, then Account, then Subscription.
  3. Find the row Access ends and read its date.
  4. Compare with Expected: the date is shown; the cancellation itself is made on the web or in the store, not on this screen.

## S83.24 End-of-term access explanation.

- **Expected:** After cancelling, the user is told what they keep until the end of the term and what happens after.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:347 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Subscription (labels found in the code)
- **Needs:** an account that has cancelled to end of term
- **Steps:**
  1. Sign in with an account that has cancelled to end of term.
  2. Open Settings, then Account, then Subscription.
  3. Read the summary under Your plan and the row Access ends.
  4. Compare with Expected: the end date is shown, but the screen does not say what you keep or what happens after.

## S83.25 Mobile purchase restoration.

- **Expected:** On mobile, users can restore store purchases (re-send receipts) without being charged again.
- **Code:** partial. Evidence present: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:54
- **Known to be unfinished:** switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built
- **Where to find it:** not found in the code. The Restore purchases row in apps/mobile/src/features/settings/cloud-billing/index.tsx is drawn only when nativePurchases is true, so it is not reachable in this build.
- **Needs:** a build with purchases switched on

## S83.26 Store-managed subscription instructions.

- **Expected:** Users whose subscription is billed by Apple or Google are told to manage it in that store, with a link.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:301; apps/mobile/src/features/billing/subscriptionSource.ts:45
- **Where to find it:** Settings > Account > Subscription (labels found in the code)
- **Needs:** an account billed by Apple or Google
- **Steps:**
  1. Sign in with an account billed by Apple or Google.
  2. Open Settings, then Account, then Subscription.
  3. Find the row Billing and read its value Managed where you subscribed.
  4. Compare with Expected: the value names no store and there is no link; the store manage link is drawn only when purchases are switched on.

## S83.27 Duplicate-subscription warning.

- **Expected:** Before a purchase that would double-bill, the user is warned (existing subscription elsewhere).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:301; apps/mobile/src/features/billing/subscriptionSource.ts:60
- **Where to find it:** not found in the code. The Subscription managed elsewhere alert in apps/mobile/src/features/settings/cloud-billing/index.tsx opens only from an upgrade row, which is drawn only when nativePurchases is true, so no duplicate-subscription warning can be reached in this build.
- **Needs:** a build with purchases switched on

## S83.29 Seat assignment.

- **Expected:** Admins can assign seats to members and see seats used vs licensed.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/workspace.tsx:342
- **Where to find it:** Settings > Account > Workspace > Seats and invitations (labels found in the code)
- **Needs:** an admin account in a team workspace
- **Steps:**
  1. Sign in as an admin of a team workspace.
  2. Open Settings, then Account, then Workspace.
  3. Find the section Seats and invitations and read the row Seats, for example 'X of Y used'.
  4. Tap Invite by email, enter an address, and tap Send invitation.
  5. Compare with Expected: the Seats count changes and the pending invitation is shown as holding a seat.
