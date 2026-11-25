---
id: "PLAN-desktop-081"
type: "test-plan"
title: "Desktop · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "81"
---
# Desktop · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S81.01 Versioned plan catalog.

- **Expected:** One plan catalog with a version number drives pricing and checkout, and each subscription records the catalog version it was sold under.
- **Code:** done. Evidence present: apps/web/lib/services/entitlement-resolution.ts:305; apps/web/app/api/stripe-webhook/lib/db.ts:835
- **Where to find it:** no screen of its own. The recorded catalog version has no visible screen. The resolver is apps/web/lib/services/entitlement-resolution.ts.
- **Steps:**
  1. Open the Pricing page at /pricing (the Pricing link in the marketing header, or Compare plans on Settings > Billing for a Free account).
  2. Read the monthly prices on the Basic, Premium, Max and Ultra cards.
  3. Compare with Expected: prices should come from the one billing catalog. No screen I found shows the catalog version a subscription was sold under.

## S81.02 Free-plan feature bundle.

- **Expected:** The Free plan has a defined bundle (capabilities and limits) that is shown to users and enforced server-side.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1170 (quoted code not found in the file now); apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:79 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:223 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage (Free account) and the Pricing page > Compare plans, Free column (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account.
  2. Open Settings > Usage and read the card "Upgrade for higher capacity" (a Free account sees only the Upgrade button, no meters).
  3. Open the Pricing page at /pricing and scroll to "Compare plans".
  4. Read the Free column and compare it with Expected: the Free bundle should be listed, and the same limits should be what the app enforces.

## S81.03 Basic-plan feature bundle.

- **Expected:** The Basic plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:785 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:185; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now); apps/web/lib/rate-limit.ts:1366
- **Where to find it:** Pricing page > Basic card (monthly $7) (labels found in the code)
- **Needs:** none to read; a Basic account to test enforcement
- **Steps:**
  1. Open the Pricing page at /pricing.
  2. Find the Basic card (title "Basic", price $7 a month).
  3. Read its feature line "2 chats at once and up to 50 connector tools" and open Compare plans to read the Basic column.
  4. Compare with Expected: the Basic bundle should be shown and match what a Basic account can use.

## S81.04 Pro-plan feature bundle.

- **Expected:** The Pro plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:793 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:191; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:224 (quoted code not found in the file now)
- **Where to find it:** Pricing page > Premium card (monthly $20) (labels found in the code)
- **Needs:** none to read; a Premium account to test enforcement
- **Steps:**
  1. Open the Pricing page at /pricing.
  2. Find the Premium card (title "Premium", price $20 a month).
  3. Read its feature line "3 chats at once and up to 150 connector tools" and the Compare plans column.
  4. Compare with Expected: the Premium bundle should be shown and match what a Premium account can use.

## S81.05 Max 5x feature bundle.

- **Expected:** The Max 5x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:811 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:197; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now)
- **Where to find it:** Pricing page > Max card (monthly $100) (labels found in the code)
- **Needs:** none to read; a Max account to test enforcement
- **Steps:**
  1. Open the Pricing page at /pricing.
  2. Find the Max card (title "Max", price $100 a month).
  3. Read its feature line "8 chats at once and up to 300 connector tools" and its usage sentence.
  4. Compare with Expected: the Max bundle should be shown and match what a Max account can use.

## S81.06 Max 15x feature bundle.

- **Expected:** The Max 15x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:818 (quoted code not found in the file now); packages/contracts/types/src/billing-catalog.ts:203; packages/contracts/types/src/billing-catalog.ts:343; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92 (quoted code not found in the file now)
- **Where to find it:** Pricing page > Ultra card (monthly $200) (labels found in the code)
- **Needs:** none to read; an Ultra account to test enforcement
- **Steps:**
  1. Open the Pricing page at /pricing.
  2. Find the Ultra card (title "Ultra", price $200 a month).
  3. Read its feature line "12 chats at once and up to 500 connector tools" and its usage sentence.
  4. Compare with Expected: the Ultra bundle should be shown and match what an Ultra account can use.

## S81.07 Explicit definition of the baseline behind “5x” and “15x.”

- **Expected:** Pricing states what "1x" means: the baseline plan behind 5x/15x and its concrete allowance.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:741 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:774 (quoted code not found in the file now); packages/contracts/types/src/managed-usage-limits.ts:158
- **Where to find it:** Pricing page > usage sentence on the Max card and the Ultra card (labels found in the code)
- **Steps:**
  1. Open the Pricing page at /pricing.
  2. Read the usage sentence on the Max card and on the Ultra card.
  3. Read the Premium card to see what it is measured against.
  4. Compare with Expected: the page should say what 1x means. Code shows no separate 1x plan: each multiplier names its baseline (Max and Ultra against Premium, Premium against Basic). Code computes Max as 5x Premium on every window, and Ultra as 10x Premium on weekly and monthly with no five-hour cap, so Ultra will not read 15x.

## S81.08 Explicit identification of the allowance being multiplied.

- **Expected:** Plan copy names exactly which allowance a multiplier scales (e.g. managed-usage credits per 5-hour, weekly and monthly window).
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:741 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:774 (quoted code not found in the file now); packages/contracts/types/src/managed-usage-limits.ts:179
- **Where to find it:** Pricing page > usage sentence on the Max card, and Settings > Usage > Plan usage limits (labels found in the code)
- **Needs:** a paid account for Settings > Usage bars (a Free account sees the Upgrade card)
- **Steps:**
  1. Open the Pricing page at /pricing and read the usage sentence on the Max card.
  2. Open Settings > Usage and find the card "Plan usage limits".
  3. Read which bars appear: "Current session", "This week" and "Most capable models".
  4. Compare with Expected: the multiplier should name the allowance it scales (session, weekly or monthly).

## S81.09 Separate feature-access differences.

- **Expected:** Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:139 (quoted code not found in the file now)
- **Where to find it:** Pricing page > Compare plans (labels found in the code)
- **Needs:** a Free or Basic account for the gate test
- **Steps:**
  1. Open the Pricing page at /pricing and scroll to "Compare plans".
  2. Read the capability rows (for example "Cloud API access") across Free, Basic, Premium, Max and Ultra.
  3. Compare with Expected: each plan's feature differences should be listed.
  4. Test one gate: on a Free or Basic account open Settings > Account > API keys and see whether the plan gate appears.

## S81.11 Separate storage limits.

- **Expected:** Each plan has its own storage limit, stated to users and enforced when files are added.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Projects > open a project > Project settings > Files (labels found in the code)
- **Needs:** a Free account and a file larger than the remaining storage
- **Steps:**
  1. Sign in with a Free account and open Projects from the sidebar, then open a project.
  2. Open Project settings and scroll to the "Files" heading.
  3. Read the storage line "X of Y storage" if it appears.
  4. Upload a file larger than the remaining space and read the error: "accounts include ... of file storage, shared by your Library and project sources".
  5. Compare with Expected: the limit shown should match the plan's storage limit.

## S81.12 Separate context limits.

- **Expected:** Each plan has its own context-size limit, stated to users and enforced per request.
- **Code:** done. Evidence moved: packages/contracts/types/src/model-catalog.ts:3077; apps/web/app/pricing/page.tsx:229 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:140 (quoted code not found in the file now)
- **Where to find it:** Pricing page > Compare plans > Context window row (labels found in the code)
- **Steps:**
  1. Open the Pricing page at /pricing and scroll to "Compare plans".
  2. Read the "Context window" row across the plans, for example "Up to N tokens".
  3. Compare with Expected: each plan should show its own context size.

## S81.13 Separate concurrency limits.

- **Expected:** Each plan has its own limit on simultaneous responses, stated to users and enforced per turn.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1258 (quoted code not found in the file now); apps/web/lib/rate-limit.ts:1372; apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:39
- **Where to find it:** Pricing page card line ("chats at once") and sending chats at the same time (labels found in the code)
- **Needs:** a Basic account and three chats
- **Steps:**
  1. Open the Pricing page at /pricing and read the "chats at once" line on the Basic and Premium cards.
  2. On a Basic account, start responses in three chats at the same time.
  3. Look for the refusal "Your plan allows ... response at a time" on the third chat.
  4. Compare with Expected: the limit should match the card line and be enforced per turn.

## S81.14 Separate generation settings.

- **Expected:** Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1314; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1840
- **Where to find it:** Chat composer footer > Reasoning effort control (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and open a chat.
  2. In the composer footer, click the control labelled "Reasoning effort".
  3. Look for locked effort levels marked "Upgrade" and the link "What each plan includes".
  4. Open the model picker and look for locked models showing "<plan> and above".
  5. Compare with Expected: gated options should be shown and blocked by plan.

## S81.15 Separate per-model caps.

- **Expected:** Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:1383; apps/web/lib/services/managed-usage-request-service.ts:454
- **Where to find it:** Settings > Usage > Plan usage limits > Most capable models (labels found in the code)
- **Needs:** a paid account (the bar appears only when the plan has a flagship weekly cap)
- **Steps:**
  1. Sign in with a paid account and open Settings > Usage.
  2. Find the card "Plan usage limits".
  3. Read the bar "Most capable models" and its reset time.
  4. Compare with Expected: the flagship cap should show and be enforced on admission.

## S81.16 Shared versus dedicated usage pools.

- **Expected:** The plan structure states whether usage is pooled across members or dedicated per seat, and the ledger follows that choice.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:1021 (quoted code not found in the file now); apps/web/lib/services/entitlement-resolution.ts:169
- **Known to be unfinished:** ['handler']
- **Owner decision is open on this item.**
- **Where to find it:** Pricing page > Business audience > Team Premium card ("Higher usage than a Standard seat") (labels found in the code)
- **Needs:** none to read
- **Steps:**
  1. Open the Pricing page at /pricing.
  2. Switch to the business audience and find the Team Premium card.
  3. Read "Higher usage than a Standard seat" and the per-seat usage text ("for every seat").
  4. Compare with Expected: the page should say whether usage is pooled or per seat. It reads per seat.

## S81.17 Monthly and annual billing choices.

- **Expected:** Users can choose monthly or annual billing where a plan offers both, with the annual saving shown and checkout charging the chosen cadence.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:882 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:1056; apps/web/app/pricing/page.tsx:493 (quoted code not found in the file now); apps/web/app/pricing/page.tsx:690
- **Where to find it:** Pricing page > Team card > Monthly / Annual toggle (labels found in the code)
- **Needs:** none to read; do not complete checkout
- **Steps:**
  1. Open the Pricing page at /pricing and switch to the business audience.
  2. On the Team card, find the cadence group "Team billing cadence" with "Monthly" and "Annual".
  3. Click "Annual" and read "save N% annually" and the new per-seat price.
  4. Open checkout only to read the charge, and stop before paying.
  5. Compare with Expected: the saving and the billing cadence should match. Individual plans offer monthly only.

## S81.18 Trial entitlements.

- **Expected:** A plan can be granted as a time-limited trial that is shown as a trial and ends (reverts or bills) when its period is over.
- **Code:** done. Evidence moved: apps/web/app/api/checkout/route.ts:73; apps/web/app/api/checkout/route.ts:439; apps/web/lib/services/code-trial-expiry.ts:36; apps/web/features/settings/sections/BillingSection.tsx:544 (quoted code not found in the file now)
- **Where to find it:** Settings > Billing (status "Free trial" and "Trial ends on") (labels found in the code)
- **Needs:** an account with an active trial
- **Steps:**
  1. Sign in with an account that has a trial (granted through a referral).
  2. Open Settings > Billing.
  3. Read the status "Free trial" and the row "Trial ends on".
  4. Compare with Expected: the trial should be shown as a trial and end on that date.

## S81.19 Promotional entitlements.

- **Expected:** Promotional entitlements (promo codes, bonus credits, invite grants) exist, are applied to the account and are visible to the user.
- **Code:** done. Evidence present: apps/web/app/api/checkout/route.ts:522; apps/web/app/api/upgrade/route.ts:266; apps/web/features/billing/components/UpgradePromotionCode.tsx:37; apps/web/features/settings/sections/BillingSection.tsx:111; apps/web/features/admin/services/operator-metrics.ts:421
- **Where to find it:** Account menu > Upgrade > choose a plan > Promotion code field; and Settings > Usage > Credit balances > Bonus credits (labels found in the code)
- **Needs:** a paid-eligible account and a promotion code
- **Steps:**
  1. Open the account menu and click "Upgrade". Choose a plan.
  2. In the upgrade confirm step, find the field labelled "Promotion code" (shown only when an amount is due).
  3. Enter a valid promotion code and read the discount line.
  4. Open Settings > Usage and read "Bonus credits" under "Credit balances".
  5. Compare with Expected: the promotion should apply to the account and be visible.

## S81.20 Purchased credit balances.

- **Expected:** Users can buy credit top-ups that form a separate purchased balance, which carries over and is shown apart from the plan allowance.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:454; apps/web/features/settings/sections/BillingSection.tsx:1183; apps/web/app/api/billing/top-up/route.ts:156; apps/web/app/api/billing/top-up/route.ts:170; apps/web/features/settings/sections/UsageSection.tsx:388
- **Where to find it:** Settings > Billing > "Buy credits" panel, then Settings > Usage > Credit balances > Purchased credits (labels found in the code)
- **Needs:** a Free or paid account; a payment method to complete a purchase
- **Steps:**
  1. Open Settings > Billing and scroll to the credit pack panel.
  2. Choose a pack or type an amount in "Other amount".
  3. Click "Buy credits" and stop at checkout (do not pay unless intended).
  4. After a completed purchase, open Settings > Usage and read "Purchased credits" apart from the plan allowance.
  5. Compare with Expected: the purchased balance should carry over and show separately.

## S81.21 Optional overage.

- **Expected:** Users can opt in to spending purchased credits past a plan limit (overage), off by default, and overage use is accounted separately from the plan windows.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:1233; apps/web/app/api/billing/overage/route.ts:99; apps/web/db/neon/0281_managed_usage_overage_classification.sql:7
- **Where to find it:** Settings > Billing > "Keep going after a usage limit" switch (labels found in the code)
- **Needs:** a paid account with purchased credits
- **Steps:**
  1. Sign in with a paid account billed through Stripe, Apple or Google, and open Settings > Billing.
  2. Find the switch "Keep going after a usage limit" (off by default).
  3. Read the text: "Spend your credits when a usage limit stops you" with the available credit amount, or "Buy credits above to use this."
  4. Turn the switch on and check that it stays on after a reload.
  5. Compare with Expected: overage should be opt-in and accounted separately from the plan windows.

## S81.22 Grandfathered plan versions.

- **Expected:** Subscribers on a retired plan or price keep what they bought (price, plan and allowances) while new buyers are sent to the successor.
- **Code:** done. Evidence present: packages/contracts/types/src/managed-usage-limits.ts:107; apps/web/app/api/stripe-webhook/lib/db.ts:838
- **Where to find it:** no screen of its own. No retired-plan screen found. Version tables in packages/contracts/types/src/managed-usage-limits.ts currently map every version to the same limits, so no difference is visible today.
- **Needs:** a subscriber on a retired plan (not available in a normal test account)

## S81.23 Upgrade effective time.

- **Expected:** An upgrade takes effect at a stated time (immediately), with the charge and the new renewal date shown before confirming.
- **Code:** done. Evidence moved: apps/web/app/upgrade/UpgradeChooser.tsx:99 (quoted code not found in the file now); apps/web/features/billing/components/UpgradeConfirmDialog.tsx:280; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:339 (quoted code not found in the file now); apps/web/features/billing/components/UpgradeOrderPanel.tsx:491
- **Where to find it:** Settings > Billing > "Adjust plan" (or "Upgrade plan" on Free), then choose a higher plan and the "Upgrade to {planLabel}" dialog (labels found in the code)
- **Needs:** a paid or Free account; do not confirm the charge
- **Steps:**
  1. Open Settings > Billing and click "Adjust plan" (or "Upgrade plan" on a Free account).
  2. Choose a higher plan.
  3. In the dialog "Upgrade to {planLabel}", read the line "You'll be charged ... today. After that, ... renews at ..." and the "Plan summary".
  4. Compare with Expected: the charge, the new renewal date and the effective time should be shown before confirming. Do not click "Confirm" unless you intend to pay.

## S81.24 Downgrade effective time.

- **Expected:** A downgrade takes effect at a stated time (e.g. end of period), shown to the user before they confirm, with access kept until then.
- **Code:** done. Evidence present: apps/web/features/billing/components/DowngradeReviewDialog.tsx:167
- **Where to find it:** Settings > Billing > "Switch to a smaller plan" (labels found in the code)
- **Needs:** a paid Stripe account with a smaller plan available
- **Steps:**
  1. Sign in with a paid account billed through Stripe and open Settings > Billing.
  2. Click "Switch to a smaller plan" (shown only when no downgrade is already scheduled).
  3. Read the dialog: the smaller plan starts "at the end of your current billing period" with the date, and "nothing is charged today".
  4. Compare with Expected: the effective time and access kept until then should match. Close the dialog without confirming unless you intend it.

## S81.25 Grace-period behavior.

- **Expected:** When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.
- **Code:** done. Evidence present: apps/web/features/billing/components/BillingPlanNotices.tsx:152
- **Where to find it:** Settings > Billing (notice after a failed renewal) (labels found in the code)
- **Needs:** an account with a failed renewal
- **Steps:**
  1. Use an account whose last renewal payment failed (a test setup you own), and open Settings > Billing.
  2. Read the notice "Your last ... payment didn't go through, so the plan is past due" or "unpaid".
  3. Read the sentence "Self-serve plans have no grace period" and the action "Update payment method".
  4. Compare with Expected: the access that remains and the fix should be stated. Code states no grace period.

## S81.26 API/programmatic use treated explicitly.

- **Expected:** Programmatic/API use is an explicit plan capability: which plans include it, what it consumes, and API calls are gated by it.
- **Code:** done. Evidence moved: apps/web/app/pricing/page.tsx:214 (quoted code not found in the file now); apps/web/lib/free-chat-surface-policy.ts:97
- **Where to find it:** Settings > Account > "API keys"; Pricing page > Compare plans > "Cloud API access" (labels found in the code)
- **Needs:** a Free account and a Premium or higher account
- **Steps:**
  1. Sign in with a Free account, open Settings > Account and find "API keys".
  2. Try to create a key and read the upgrade message (plan gate).
  3. Sign in with a Premium or higher account and repeat; a key can now be created.
  4. Open the Pricing page at /pricing and read the "Cloud API access" row in Compare plans.
  5. Compare with Expected: API use should be a plan capability and be blocked without it.

## S81.27 Cross-platform entitlement sharing.

- **Expected:** One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:671 (quoted code not found in the file now); apps/web/lib/free-chat-surface-policy.ts:81
- **Where to find it:** no screen of its own. The server-side per-surface enforcement is inner behaviour with no control of its own; the tester can only see it by comparing the plan shown on two surfaces. The desktop app shows the hosted web app, so the Billing pane is the same screen there. The surface mapping is in apps/web/lib/free-chat-surface-policy.ts (web, mobile, desktop and chrome map to managed_chat), and the quoted code at BillingSection.tsx:671 has moved, so the exact line was not confirmed.
- **Needs:** a paid account and a Free account, both signed in on the web and the desktop app
- **Steps:**
  1. Sign in to the web app and the AGI Desktop app with the same account.
  2. Open Settings, then click Billing in the left list.
  3. Note the plan name and the Billing page heading on the web.
  4. Repeat on the desktop app and compare: the same plan should show on both.
  5. Optionally, try a paid-only chat option on each surface and compare whether it is allowed the same way.

## S81.28 Plan-specific feature explanations.

- **Expected:** Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).
- **Code:** done. Evidence moved: apps/web/app/upgrade/UpgradeChooser.tsx:213; apps/web/features/billing/lib/plan-display.ts:36 (quoted code not found in the file now); apps/web/app/api/media/image/generate/route.ts:223 (quoted code not found in the file now)
- **Where to find it:** Chat composer > Upgrade (the badge on a locked option) > Upgrade page (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in with a Free account and open a chat.
  2. Click the Upgrade label on a locked option in the chat composer.
  3. On the Upgrade page, look for the Recommended card and the What changes list under it.
  4. Read the Or jump ahead links for the other plans and check that each plan explains what it adds over the current plan.
  5. Compare with Expected: each plan should say what it adds and why the blocked feature needs it.
