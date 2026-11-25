---
id: "PLAN-web-081"
type: "test-plan"
title: "Web · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "81"
---
# Web · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S81.01 Versioned plan catalog.

- **Expected:** One plan catalog with a version number drives pricing and checkout, and each subscription records the catalog version it was sold under.
- **Code:** done. Evidence present: apps/web/lib/services/entitlement-resolution.ts:305; apps/web/app/api/stripe-webhook/lib/db.ts:835
- **Where to find it:** no screen of its own. The version number is not visible in the code paths I read, so only the prices can be checked from the UI.
- **Needs:** a paid account, to see a subscription's plan and price
- **Steps:**
  1. Sign in and open Settings > Billing (or the account menu's Upgrade > Compare plans)
  2. Note the plan name and price shown for the current plan
  3. Compare them with the prices in Compare plans
  4. The catalog version number and the version recorded on a subscription are not shown in the UI; mark that part as not visible

## S81.02 Free-plan feature bundle.

- **Expected:** The Free plan has a defined bundle (capabilities and limits) that is shown to users and enforced server-side.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1170 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:179; packages/contracts/types/src/billing-catalog.ts:343; apps/web/app/api/media/image/generate/route.ts:223 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu in the sidebar footer and click Upgrade
  2. Find the Compare plans heading in the dialog
  3. Read the Free column: capabilities and limits listed for Free
  4. Compare the Free column with Expected: the plan's bundle is shown and matches the limits enforced

## S81.03 Basic-plan feature bundle.

- **Expected:** The Basic plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:785 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:185; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now); apps/web/lib/rate-limit.ts:1366
- **Where to find it:** Account menu > Upgrade > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the Basic column in Compare plans and read its price and limits
  3. Check the Get Basic button is shown with the Basic price
  4. Compare with Expected: priced bundle shown on pricing and in-app

## S81.04 Pro-plan feature bundle.

- **Expected:** The Pro plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:793 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:191; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:224 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the Pro column in Compare plans
  3. Read its price, limits and feature rows
  4. Compare with Expected: priced bundle shown in pricing and in-app

## S81.05 Max 5x feature bundle.

- **Expected:** The Max 5x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:811 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:197; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the Max column in Compare plans
  3. Read the price, usage multiplier line and limits
  4. Compare with Expected: priced bundle shown in pricing and in-app

## S81.06 Max 15x feature bundle.

- **Expected:** The Max 15x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:818 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:203; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the Max 15x column in Compare plans
  3. Read the price, limits and the Get Max 15x style button
  4. Compare with Expected: priced bundle shown in pricing and in-app

## S81.07 Explicit definition of the baseline behind “5x” and “15x.”

- **Expected:** Pricing states what "1x" means: the baseline plan behind 5x/15x and its concrete allowance.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:741 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:774 (quoted code not found in the file now); packages/contracts/types/src/managed-usage-limits.ts:158
- **Where to find it:** Account menu > Upgrade > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Read the usage line under the Max plans: it reads like a multiple of a baseline plan
  3. Find the baseline plan named in that line
  4. Compare with Expected: pricing states what 1x means and its concrete allowance

## S81.08 Explicit identification of the allowance being multiplied.

- **Expected:** Plan copy names exactly which allowance a multiplier scales (e.g. managed-usage credits per 5-hour, weekly and monthly window).
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:741 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:774 (quoted code not found in the file now); packages/contracts/types/src/managed-usage-limits.ts:179
- **Where to find it:** Settings > Usage (labels found in the code)
- **Needs:** a paid account, to see plan-scaled limits
- **Steps:**
  1. Open Settings and click Usage
  2. Read the bars: the 5-hour and weekly limit bars and the reset line
  3. Find the sentence about 5-hour and weekly limits
  4. Compare with Expected: the copy names which allowance a multiplier scales

## S81.09 Separate feature-access differences.

- **Expected:** Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:139 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Scroll the Compare plans table through its feature rows
  3. Compare a Free column cell with a Pro column cell for a feature such as Cloud API access
  4. Compare with Expected: plans differ in feature access and the rows are listed

## S81.11 Separate storage limits.

- **Expected:** Each plan has its own storage limit, stated to users and enforced when files are added.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (storage line), then Projects > a project's knowledge files (labels found in the code)
- **Needs:** a Free account and a Pro or higher account to compare
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Read the storage wording in the plan columns (for example the phrase of storage)
  3. Go to a project and try to add a knowledge file
  4. Compare with Expected: each plan's storage limit is stated and enforced when files are added

## S81.12 Separate context limits.

- **Expected:** Each plan has its own context-size limit, stated to users and enforced per request.
- **Code:** done. Evidence moved: packages/contracts/types/src/model-catalog.ts:3077; apps/web/app/pricing/page.tsx:229 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:140 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (context row) (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the context row in Compare plans
  3. Read the line Up to a number of tokens for each plan
  4. Compare with Expected: each plan states its own context limit

## S81.13 Separate concurrency limits.

- **Expected:** Each plan has its own limit on simultaneous responses, stated to users and enforced per turn.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1258 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:311 (quoted code not found in the file now); apps/web/lib/rate-limit.ts:1372; apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:39
- **Where to find it:** Account menu > Upgrade > Compare plans (concurrency line) (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the line about chats at once in the Max 15x copy
  3. Compare the number of simultaneous chats per plan
  4. Compare with Expected: each plan states its own simultaneous-response limit

## S81.14 Separate generation settings.

- **Expected:** Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1314; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1840; packages/contracts/types/src/model-catalog.ts:2618
- **Where to find it:** Composer footer > Reasoning (effort chips in the model menu) (labels found in the code)
- **Needs:** a Free account and a paid account to compare
- **Steps:**
  1. Sign in and open a new chat
  2. In the composer footer, open the model or Reasoning control
  3. Look at the effort marks offered for the chosen model
  4. Click a gated effort mark and look for the Upgrade label, then compare with Expected

## S81.15 Separate per-model caps.

- **Expected:** Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1383; apps/web/lib/services/managed-usage-request-service.ts:454; apps/web/lib/server/managed-usage-policy.ts:16 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:710 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage (flagship weekly bar) (labels found in the code)
- **Needs:** a paid account, since the flagship bar shows only when the plan has one
- **Steps:**
  1. Open Settings and click Usage
  2. Find the separate weekly bar for the most capable models
  3. Read its percent and reset time
  4. Compare with Expected: a model-class cap is shown to the user

## S81.16 Shared versus dedicated usage pools.

- **Expected:** The plan structure states whether usage is pooled across members or dedicated per seat, and the ledger follows that choice.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1021 (quoted code not found in the file now); apps/web/lib/services/entitlement-resolution.ts:169; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190
- **Known to be unfinished:** ['handler']
- **Owner decision is open on this item.**
- **Where to find it:** not found in the code. I did not find any visible word saying whether usage is pooled or dedicated. The owner decision is recorded as open in the plan file, so it may not be shown.
- **Needs:** a Team account, with a second member in the same workspace

## S81.17 Monthly and annual billing choices.

- **Expected:** Users can choose monthly or annual billing where a plan offers both, with the annual saving shown and checkout charging the chosen cadence.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:882 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:1056; apps/web/app/pricing/page.tsx:493 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:690
- **Where to find it:** Account menu > Upgrade > Compare plans, then the Monthly and Annual toggle (Team section) (labels found in the code)
- **Needs:** a Free account to see the toggle; checkout needs a plan that offers both cadences
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the Monthly and Annual buttons for the Team billing cadence
  3. Click Annual and read the saving and billed-yearly text
  4. Click Monthly and compare the price change with Expected

## S81.18 Trial entitlements.

- **Expected:** A plan can be granted as a time-limited trial that is shown as a trial and ends (reverts or bills) when its period is over.
- **Code:** done. Evidence moved: apps/web/app/api/checkout/route.ts:73; apps/web/app/api/checkout/route.ts:439; apps/web/lib/services/code-trial-expiry.ts:36; apps/web/features/settings/sections/BillingSection.tsx:544 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing (plan row shows Free trial and Trial ends on) (labels found in the code)
- **Needs:** a trial account granted by the owner
- **Steps:**
  1. Sign in with an account that has a granted trial and open Settings > Billing
  2. Read the plan status: Free trial
  3. Read the date row labelled Trial ends on
  4. Compare with Expected: the trial is shown as a trial and the end date is visible

## S81.19 Promotional entitlements.

- **Expected:** Promotional entitlements (promo codes, bonus credits, invite grants) exist, are applied to the account and are visible to the user.
- **Code:** done. Evidence present: apps/web/app/api/checkout/route.ts:522; apps/web/app/api/upgrade/route.ts:266; apps/web/features/billing/components/UpgradePromotionCode.tsx:37; apps/web/features/settings/sections/BillingSection.tsx:111; apps/web/features/admin/services/operator-metrics.ts:421
- **Where to find it:** Account menu > Upgrade > pick a plan > promotion code field > Apply (labels found in the code)
- **Needs:** a Free account and a valid promotion code
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Pick a plan so the checkout panel opens
  3. Type a promotion code into the promotion field and click Apply
  4. Read the applied discount line and compare with Expected

## S81.20 Purchased credit balances.

- **Expected:** Users can buy credit top-ups that form a separate purchased balance, which carries over and is shown apart from the plan allowance.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:454; apps/web/features/settings/sections/BillingSection.tsx:1183; apps/web/app/api/billing/top-up/route.ts:156; apps/web/app/api/billing/top-up/route.ts:170; apps/web/features/settings/sections/UsageSection.tsx:388
- **Where to find it:** Settings > Usage > Buy credits (labels found in the code)
- **Needs:** a paid account, because the top-up flow may be limited by plan
- **Steps:**
  1. Open Settings and click Usage
  2. Click Buy credits
  3. Choose a credit pack or enter an amount, and read the quote before paying
  4. Compare with Expected: purchased credits appear as a separate balance from the plan allowance

## S81.21 Optional overage.

- **Expected:** Users can opt in to spending purchased credits past a plan limit (overage), off by default, and overage use is accounted separately from the plan windows.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:1233; apps/web/app/api/billing/overage/route.ts:99; apps/web/db/neon/0281_managed_usage_overage_classification.sql:7
- **Where to find it:** Settings > Billing > Keep going after a usage limit (switch) (labels found in the code)
- **Needs:** a paid account with purchased credits
- **Steps:**
  1. Open Settings and click Billing
  2. Scroll to the section Keep going after a usage limit
  3. Confirm the switch is off by default and read the sentence Spend your credits when a usage limit stops you
  4. Turn the switch on and check the available credits line, then compare with Expected

## S81.22 Grandfathered plan versions.

- **Expected:** Subscribers on a retired plan or price keep what they bought (price, plan and allowances) while new buyers are sent to the successor.
- **Code:** done. Evidence present: packages/contracts/types/src/managed-usage-limits.ts:107; apps/web/app/api/stripe-webhook/lib/db.ts:838
- **Where to find it:** no screen of its own. The grandfather rule is applied on the server; there is no screen that names it.
- **Needs:** an account on a retired plan or price, which a new QA account will not have
- **Steps:**
  1. Sign in with an account on a retired plan, if one exists
  2. Open Settings > Billing and read the plan and price
  3. Compare with the current price on Compare plans, and confirm the old price stays

## S81.23 Upgrade effective time.

- **Expected:** An upgrade takes effect at a stated time (immediately), with the charge and the new renewal date shown before confirming.
- **Code:** done. Evidence moved: apps/web/app/upgrade/UpgradeChooser.tsx:99 (quoted code not found in the file now); apps/web/features/billing/components/UpgradeConfirmDialog.tsx:280; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:339 (quoted code not found in the file now); apps/web/features/billing/components/UpgradeOrderPanel.tsx:491
- **Where to find it:** Account menu > Upgrade > pick a paid plan > Upgrade (confirm dialog) (labels found in the code)
- **Needs:** a Free account; do not finish the purchase without the owner
- **Steps:**
  1. Open the account menu, click Upgrade and pick a paid plan
  2. Click the Upgrade button to open the confirm dialog
  3. Read the first charge or Renews line and the price before confirming
  4. Stop before any final confirm button, and compare with Expected: the time it takes effect and the renewal date are shown

## S81.24 Downgrade effective time.

- **Expected:** A downgrade takes effect at a stated time (e.g. end of period), shown to the user before they confirm, with access kept until then.
- **Code:** done. Evidence present: apps/web/features/billing/components/DowngradeReviewDialog.tsx:167
- **Where to find it:** Settings > Billing > Switch to a smaller plan (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account and open Settings > Billing
  2. Start a plan change to a smaller plan
  3. Read the dialog title Switch to a smaller plan or Switch to a plan name
  4. Read the sentence that says the new plan starts at the end of the current billing period and nothing is charged today; compare with Expected

## S81.25 Grace-period behavior.

- **Expected:** When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPlanNotices.tsx:152
- **Where to find it:** Settings > Billing (notice shown after a failed renewal) (labels found in the code)
- **Needs:** a paid account with a failed renewal, which needs the owner's test setup
- **Steps:**
  1. Use a paid account whose renewal payment failed (needs the owner's test setup)
  2. Open Settings > Billing and read the notice that says the last payment did not go through
  3. Read the line about grace and the Update payment method button
  4. Compare with Expected: the grace rule and the access that remains are stated

## S81.26 API/programmatic use treated explicitly.

- **Expected:** Programmatic/API use is an explicit plan capability: which plans include it, what it consumes, and API calls are gated by it.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:214 (quoted code not found in the file now); apps/web/lib/free-chat-surface-policy.ts:97; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:82 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade > Compare plans (Cloud API access row) (labels found in the code)
- **Needs:** a Free account and a Pro account to compare
- **Steps:**
  1. Open the account menu and click Upgrade
  2. Find the row Cloud API access in Compare plans
  3. Read which plans show it as included and which show it as not included
  4. Compare with Expected: API use is a plan capability and API calls are gated by it

## S81.27 Cross-platform entitlement sharing.

- **Expected:** One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:671 (quoted code not found in the file now); apps/web/lib/services/entitlement-resolution.ts:384; apps/web/lib/free-chat-surface-policy.ts:81
- **Where to find it:** no screen of its own. The entitlement is resolved server-side in apps/web/lib/services/entitlement-resolution.ts and the per-surface policy is in apps/web/lib/free-chat-surface-policy.ts; both are inner logic. The line numbers cited in the plan (BillingSection.tsx:671) are stale: the quoted text is not in the file now. The Billing label is shown on the Settings screen in both apps, so the check uses the Billing screen only as a visible comparison point; I did not confirm that the desktop and mobile apps expose the same Billing label.
- **Needs:** a paid account, plus a second signed-in surface for the same account
- **Steps:**
  1. Sign in to the AGI web app with an account that has a paid plan.
  2. Open Settings > Billing and note the plan name shown in the plan line.
  3. Sign in to the same account on another surface (for example the desktop app or the mobile app).
  4. Open the same Billing screen on that surface and compare the plan name and the features it allows with the web app. Expected: the same plan on both.

## S81.28 Plan-specific feature explanations.

- **Expected:** Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1170 (quoted code not found in the file now); apps/web/app/upgrade/UpgradeChooser.tsx:213; apps/web/features/billing/lib/plan-display.ts:36 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:920; apps/web/app/api/media/image/generate/route.ts:223 (quoted code not found in the file now)
- **Where to find it:** Account menu > Upgrade (opens /upgrade, which shows each plan with a "What changes" list). Settings > Billing also has "Compare plans" and "Upgrade plan" (or "Adjust plan" for a paid plan) buttons that lead to the same plan pages. (labels found in the code)
- **Needs:** a Free account (a paid account would see Adjust plan instead of Upgrade plan)
- **Steps:**
  1. Sign in with a Free account and open the account menu.
  2. Click Upgrade.
  3. On the upgrade page, read the plan card marked Recommended and its "What changes" list. Each item should say what that plan adds over the current plan.
  4. Click the Continue with button on a plan card and check that its page explains that plan's own features. Expected: each plan explains what it adds and what blocked features need it.
