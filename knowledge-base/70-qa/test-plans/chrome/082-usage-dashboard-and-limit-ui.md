---
id: "PLAN-chrome-082"
type: "test-plan"
title: "Chrome · 82. Usage dashboard and limit UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "82"
---
# Chrome · 82. Usage dashboard and limit UI

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S82.01 Current plan.

- **Expected:** Every signed-in surface shows the account's current plan, read from the server.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8325 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:352; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:269
- **Where to find it:** More > account header at the top of the menu (the plan name sits beside the account name) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in to the AGI Chrome side panel with an account that has a plan.
  2. Click the More button.
  3. Look at the account header at the top of the menu: the plan name should appear beside your name or email, and match the plan on your account page.

## S82.02 Billing period.

- **Expected:** Users can see the current billing period: when it renews or ends.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13443; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:269
- **Where to find it:** not found in the code. No renewal or end date text was found in apps/extension. The only period wording is the bucket label 'This billing period' (packages/contracts/types/src/usage-vocabulary.ts) and the reset countdown. Searched apps/extension/src and apps/extension/_locales for renew, billing period, period end and ends on.
- **Needs:** a paid account

## S82.03 Overall usage meter.

- **Expected:** An overall usage meter shows how much of the plan allowance is used.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13443; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:269
- **Where to find it:** More > Usage row (shown only on paid plans, not on Free) (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in with a paid account and wait for the side panel to load.
  2. Click the More button.
  3. Look at the row labelled Usage: it has a thin bar and a percentage such as 40%.
  4. Compare the percentage with the usage shown on the web usage page after you click Usage.

## S82.04 Per-model usage.

- **Expected:** Users can see usage broken down by model (at least the flagship-model cap and per-model spend).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8567 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No per-model usage breakdown was found in apps/extension. The only model-specific wording is the 'most capable models' weekly bucket in the usage banner. Clicking More > Usage opens the web page /settings/usage, which is outside this code folder.
- **Needs:** a paid account

## S82.13 Remaining credits.

- **Expected:** Users can see how many credits remain (plan windows and purchased balance).
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/usageWindows.ts:97
- **Where to find it:** not found in the code. Remaining credit figures are computed in apps/extension/src/features/side-panel/usageWindows.ts (UsageWindowView.detail, PurchasedCreditsView.balance), but no element renders them. Searched apps/extension/src for detail, balance and credits rendering.
- **Needs:** a paid account

## S82.14 Purchased versus included credits.

- **Expected:** Users can tell purchased credits apart from the plan's included allowance.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/usageWindows.ts:97
- **Where to find it:** Composer usage banner (appears above the composer when every plan window is spent and purchased credits are on) (labels found in the code)
- **Needs:** a paid account with purchased credits and overage on, with the plan limit spent
- **Steps:**
  1. Sign in with a paid account that has purchased credits with overage enabled, and use up the plan limit.
  2. Send a message.
  3. Look at the banner above the composer: it should say that the plan limit is reached and that purchased credits are covering usage.

## S82.17 Reset countdown.

- **Expected:** Each usage window shows how long until it resets.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/usageWindows.ts:97
- **Where to find it:** Composer usage banner or the blocked composer message (shown only for a window that is near or at its limit) (labels found in the code)
- **Needs:** a paid account near or at a usage limit
- **Steps:**
  1. Sign in with a paid account whose usage window is at least 75% used, or use up a window.
  2. Look at the banner above the composer or the message shown when sending is blocked.
  3. Find the text ending in a reset time such as 'Resets in 3 hr 20 min' or 'Resets in 2 days'.
  4. Compare the countdown with the time until the window resets on the web usage page.

## S82.24 Budget warning.

- **Expected:** Users are warned before they hit a usage limit.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:838
- **Where to find it:** Composer usage banner (appears on a paid plan when a usage window has 25% or less left) (labels found in the code)
- **Needs:** a paid account near a usage limit
- **Steps:**
  1. Sign in with a paid account whose usage window is at least 75% used.
  2. Look at the banner above the composer.
  3. Check that it states how much of the limit is used and offers a button such as Add credits or Manage usage.

## S82.25 Budget-reached state.

- **Expected:** When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/freeTrialClient.ts:872 (quoted code not found in the file now)
- **Where to find it:** Composer, after you send a message when the usage limit has been reached (Managed Cloud chat gate) (labels found in the code)
- **Needs:** an account at its usage limit (a paid account or a Free account)
- **Steps:**
  1. Sign in with an account that has used its whole limit and has no purchased credits to spend.
  2. Click in the composer and try to send a message.
  3. Look at the blocked message: it should name the limit and when it resets, and show a button such as Add credits, Upgrade or Manage usage.

## S82.26 Alternative eligible model suggestion.

- **Expected:** When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13455
- **Where to find it:** Failed reply in the chat, when the error is quota_exceeded or plan_required: the Switch model button (labels found in the code)
- **Needs:** an account whose plan or limit blocks the selected model
- **Steps:**
  1. Sign in with an account whose plan or limit blocks the model currently selected.
  2. Send a message on that model.
  3. When the reply fails, look for the Switch model button under the failed reply.
  4. Click Switch model and check that the model menu offers models this account can use.

## S82.27 Wait-until-reset option.

- **Expected:** At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:854
- **Where to find it:** not found in the code. No wait or wait-until-reset control was found. The blocked message shows the reset time, the recovery button is Add credits, Upgrade or Manage usage, and the side panel refreshes itself at the reset time. Searched apps/extension/src and _locales for wait and reset wording.
- **Needs:** an account at its usage limit
