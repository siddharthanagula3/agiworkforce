---
id: "PLAN-mobile-081"
type: "test-plan"
title: "Mobile · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "81"
---
# Mobile · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S81.02 Free-plan feature bundle.

- **Expected:** The Free plan has a defined bundle (capabilities and limits) that is shown to users and enforced server-side.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:51 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-billing/index.tsx:327 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:71 (quoted code not found in the file now)
- **Where to find it:** Settings > Subscription > What your plan includes (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and make sure chat is set to Cloud.
  2. Open Settings and tap Subscription.
  3. Tap What your plan includes.
  4. Look for the Includes heading and the line A usage allowance, free models only, and compare with Expected.

## S81.03 Basic-plan feature bundle.

- **Expected:** The Basic plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/plans/index.tsx:95; apps/mobile/src/features/settings/cloud-billing/index.tsx:550
- **Where to find it:** Settings > Subscription > What your plan includes (labels found in the code)
- **Needs:** a Basic account
- **Steps:**
  1. Sign in with a Basic account and make sure chat is set to Cloud.
  2. Open Settings and tap Subscription.
  3. Tap What your plan includes.
  4. Look for the Includes list and the usage line, and compare with Expected.

## S81.04 Pro-plan feature bundle.

- **Expected:** The Pro plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/plans/index.tsx:95; apps/mobile/src/features/settings/cloud-billing/index.tsx:550
- **Where to find it:** Settings > Subscription > What your plan includes (labels found in the code)
- **Needs:** a Premium account
- **Steps:**
  1. Sign in with a Premium account and make sure chat is set to Cloud.
  2. Open Settings and tap Subscription.
  3. Tap What your plan includes.
  4. Look for the Premium heading and its Includes list, and compare with Expected.

## S81.05 Max 5x feature bundle.

- **Expected:** The Max 5x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/plans/index.tsx:95; apps/mobile/src/features/settings/cloud-billing/index.tsx:550
- **Where to find it:** not found in the code. No Max 5x tier exists in the code; the only Max tier is labelled Max (packages/contracts/types/src/billing-catalog.ts). I searched for 5x in packages/contracts/types/src, apps/mobile/src and apps/web/lib.

## S81.06 Max 15x feature bundle.

- **Expected:** The Max 15x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/plans/index.tsx:95; apps/mobile/src/features/settings/cloud-billing/index.tsx:550
- **Where to find it:** Settings > Subscription > What your plan includes (labels found in the code)
- **Needs:** an Ultra account
- **Steps:**
  1. Sign in with an Ultra account and make sure chat is set to Cloud.
  2. Open Settings and tap Subscription.
  3. Tap What your plan includes.
  4. Look for the Ultra heading and its Includes list, and compare with Expected.

## S81.09 Separate feature-access differences.

- **Expected:** Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/plans/index.tsx:77; apps/mobile/src/features/settings/plans/index.tsx:70 (quoted code not found in the file now); apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:199; packages/contracts/types/src/billing-catalog.ts:402
- **Where to find it:** Settings > Subscription > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and make sure chat is set to Cloud.
  2. Open Settings and tap Subscription.
  3. Tap Compare plans and read the Includes list.
  4. Trigger a gated feature in chat if one is available, then look for the sheet Not included in your plan and compare with Expected.

## S81.14 Separate generation settings.

- **Expected:** Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.
- **Code:** done. Evidence moved: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:660; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:58 (quoted code not found in the file now)
- **Where to find it:** Chat > Model button (shows Model: and the model name) > model picker (labels found in the code)
- **Needs:** a Free account and a paid account to compare
- **Steps:**
  1. Open a chat with chat set to Cloud.
  2. Tap the model button; its label starts with Model: and the hint is Opens the model picker.
  3. Pick a model that supports effort and look for the effort labels such as Balanced, Deep and Maximum.
  4. Tap a locked model on a Free account and look for the See plans alert, and compare with Expected.

## S81.15 Separate per-model caps.

- **Expected:** Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Settings > Subscription > Usage > Weekly limits (labels found in the code)
- **Needs:** a Cloud account; reaching the cap needs heavy use
- **Steps:**
  1. Sign in with a Cloud account and open Settings > Subscription.
  2. Tap Usage.
  3. Look under Weekly limits for the sub-bucket Most capable models, which appears only when the account has a flagship weekly reset.
  4. Compare the percentage and reset time with Expected.

## S81.23 Upgrade effective time.

- **Expected:** An upgrade takes effect at a stated time (immediately), with the charge and the new renewal date shown before confirming.
- **Code:** partial. Evidence present: apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:54
- **Known to be unfinished:** switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built
- **Where to find it:** Settings > Subscription > Upgrade plan (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and open Settings > Subscription.
  2. Look at the Upgrade plan row.
  3. Note that the row shows Unavailable in the app and cannot be pressed.
  4. Compare with Expected: no charge or renewal date is shown before confirming, because purchases are off.

## S81.25 Grace-period behavior.

- **Expected:** When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-billing/index.tsx:167; apps/mobile/src/features/billing/store.ts:79
- **Where to find it:** Settings > Subscription (status card), and the Update billing paywall (labels found in the code)
- **Needs:** a test account with a failed renewal
- **Steps:**
  1. Use a test account whose renewal failed (past due).
  2. Open Settings > Subscription and read the status card line that says the subscription is past due.
  3. Trigger a paid feature and look for the Update billing button in the paywall.
  4. Compare with Expected: check what access remains and how to fix it.

## S81.27 Cross-platform entitlement sharing.

- **Expected:** One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:298 (quoted code not found in the file now); apps/mobile/src/features/billing/store.ts:79; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:71 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The per-surface gate is enforced by the web gateway and was not checked here; the web comparison page was not located in this pass.
- **Needs:** a second surface signed in to the same account
- **Steps:**
  1. Sign in with the same account on the phone app and on the web or desktop app.
  2. On the phone, open Settings > Subscription and read the card Your plan, usage, and payment details.
  3. On the other surface, open its billing or subscription page.
  4. Compare the plan name on both surfaces with Expected.

## S81.28 Plan-specific feature explanations.

- **Expected:** Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/plans/index.tsx:77; apps/mobile/src/features/settings/plans/index.tsx:31 (quoted code not found in the file now); apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:199
- **Where to find it:** Settings > Subscription > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and open Settings > Subscription.
  2. Read the card In-app purchases are not available yet, which says Compare plans shows what each plan adds.
  3. Tap Compare plans and read the Includes list for the plan.
  4. Compare with Expected: each plan should explain what it adds over the current plan.
