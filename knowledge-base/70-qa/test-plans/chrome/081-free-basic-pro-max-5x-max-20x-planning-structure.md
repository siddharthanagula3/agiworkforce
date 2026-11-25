---
id: "PLAN-chrome-081"
type: "test-plan"
title: "Chrome · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "81"
---
# Chrome · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S81.07 Explicit definition of the baseline behind “5x” and “15x.”

- **Expected:** Pricing states what "1x" means: the baseline plan behind 5x/15x and its concrete allowance.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Settings > Billing > Upgrade plan (on a Free account; a paid account shows Adjust plan). The sentence sits under the Recommended card on the Upgrade page. (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in to the web app on a Free account and open Settings, then Billing.
  2. Click Upgrade plan. The Upgrade page opens.
  3. Read the Recommended card and the line under its price, for example 'N x more usage than Premium'.
  4. Check that the line names a baseline plan (Basic, Premium or Max) to compare against. Compare with Expected, which asks that pricing says what the baseline is and its allowance.

## S81.08 Explicit identification of the allowance being multiplied.

- **Expected:** Plan copy names exactly which allowance a multiplier scales (e.g. managed-usage credits per 5-hour, weekly and monthly window).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Settings > Billing > Upgrade plan, then the line under the Recommended card. Usage windows are at Settings > Usage. (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. Sign in on a Free account, open Settings, then Billing, then click Upgrade plan.
  2. Under the Recommended card, read the multiplier sentence.
  3. Check whether it names 'per session' and 'weekly' windows. Those are the allowance windows the multiplier scales.
  4. Open Settings > Usage and compare the window names there: Current session and This week. Compare with Expected, which asks that the copy names the allowance being multiplied.

## S81.09 Separate feature-access differences.

- **Expected:** Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** More (menu button) > Upgrade plan. It opens the web pricing page; scroll to Compare plans. (labels found in the code)
- **Needs:** a Free account
- **Steps:**
  1. In the Chrome side panel, sign in and click the More button at the top right.
  2. Click Upgrade plan. The pricing page opens in a new tab.
  3. Scroll to the Compare plans heading and read the rows that differ between plans.
  4. Compare the rows with the gated items in the side panel. For example, a gated effort option shows 'Available on <plan> and higher plans'. Compare with Expected, which asks that the differences are listed.

## S81.14 Separate generation settings.

- **Expected:** Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:308
- **Where to find it:** Chat composer > model button (shows the model name and an effort badge) > Effort section of the menu. (labels found in the code)
- **Needs:** a Free account (to see gated options) and a paid account (to see unlocked ones)
- **Steps:**
  1. In the Chrome side panel, sign in and open a chat.
  2. Click the model button in the composer. The model menu opens.
  3. Look for the Effort heading and its options. Options not on the plan show a plan badge and the text 'Available on <plan> and higher plans'.
  4. Pick a model that the plan does not allow, or try to pick an unlocked option. Compare with Expected, which asks that gated options show and the request is clamped to the plan.

## S81.18 Trial entitlements.

- **Expected:** A plan can be granted as a time-limited trial that is shown as a trial and ends (reverts or bills) when its period is over.
- **Code:** done. Evidence present: apps/web/lib/services/code-trial-expiry.ts:36; apps/web/app/api/cron/expire-code-trials/route.ts:16
- **Where to find it:** Settings > Billing, on an account that is on a trial. The trial notice shows at the top of the plan section. (some labels not found in the code; trust the screen)
- **Needs:** a trial account (the app does not show how a trial is started; not verified)
- **Steps:**
  1. Sign in to the web app on an account that is currently trialing and open Settings, then Billing.
  2. Read the trial notice: 'Your N-day free trial of <plan>' and 'ends on <date>'.
  3. Check the notice says the trial will not become a paid plan and that the account moves to Free after it ends.
  4. After the end date (or on a test account with an ended trial), open Settings > Billing again and confirm the plan shows Free. Compare with Expected.

## S81.25 Grace-period behavior.

- **Expected:** When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13434; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:269
- **Where to find it:** Settings > Billing on a paid account whose renewal failed. In the side panel, the composer shows the same account state. (labels found in the code)
- **Needs:** a paid account with a failed renewal (past_due), for example a Stripe test account
- **Steps:**
  1. Sign in with a paid account whose last renewal failed (a past-due test account), open Settings, then Billing.
  2. Read the notice: 'Your last <plan> payment didn't go through, so the plan is past due.'
  3. Read the next paragraph about no grace period and what stays. Click Update payment method to see the fix path.
  4. In the Chrome side panel, check the composer message 'Update billing to restore Managed Cloud chat.' with a Manage billing button. Compare with Expected, which asks for a defined grace rule and a message on what access remains.

## S81.27 Cross-platform entitlement sharing.

- **Expected:** One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8325 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:269
- **Where to find it:** Chrome side panel > More (menu button) > account header (plan name). Compare with the web app at Settings > Billing. (labels found in the code)
- **Needs:** a paid account, and the same account signed in on the web app
- **Steps:**
  1. Sign in to the Chrome side panel with account X and open More.
  2. Read the plan name under the account name at the top of the menu.
  3. On a paid account, also read the Usage row and its percentage. Free accounts do not show it.
  4. Sign in to the web app with the same account X, open Settings > Billing and Settings > Usage, and compare the plan name and usage with the side panel. Compare with Expected, which asks that both surfaces show the same plan.

## S81.28 Plan-specific feature explanations.

- **Expected:** Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Settings > Billing > Upgrade plan on a Free or lower plan account. The Recommended card lists what changes. Blocked items in the side panel name the plan needed. (labels found in the code)
- **Needs:** a Free account (a top plan has no next tier, so no Recommended card)
- **Steps:**
  1. Sign in to the web app on a Free account, open Settings, then Billing, and click Upgrade plan.
  2. Read the Recommended card. Under 'What changes', check the features the next plan adds over the current one.
  3. In the Chrome side panel, open a model or effort option that is locked. Read 'Available on <plan> and higher plans' or the locked-model text naming the plan.
  4. Compare with Expected: each plan explains what it adds, and a blocked feature names the plan it needs.
