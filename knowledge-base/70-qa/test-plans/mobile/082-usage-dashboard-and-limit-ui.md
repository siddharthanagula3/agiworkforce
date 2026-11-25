---
id: "PLAN-mobile-082"
type: "test-plan"
title: "Mobile · 82. Usage dashboard and limit UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "82"
---
# Mobile · 82. Usage dashboard and limit UI

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S82.01 Current plan.

- **Expected:** Every signed-in surface shows the account's current plan, read from the server.
- **Code:** done. Evidence moved: apps/web/app/api/me/route.ts:139 (quoted code not found in the file now)
- **Where to find it:** Side menu > Settings > Account > Subscription (row shows the plan name); on the Subscription screen, the "Current plan" row (labels found in the code)
- **Needs:** a signed-in cloud account
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Tap Account, then the Subscription row (switch to AGI Cloud mode first if the Cloud rows are hidden).
  3. Read the "Current plan" row on the Subscription screen.
  4. Compare the plan name with the account's plan. It shows "Not confirmed" or "Checking…" while the server check is pending.

## S82.02 Billing period.

- **Expected:** Users can see the current billing period: when it renews or ends.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-billing/index.tsx:318 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-usage/index.tsx:1236; apps/mobile/src/features/billing/store.ts:79
- **Where to find it:** Side menu > Settings > Account > Subscription > "Renews" row (or "Access ends" / "Trial ends") (labels found in the code)
- **Needs:** a paid account (the row is hidden on Free)
- **Steps:**
  1. Open the side menu, tap Settings, then Account, then Subscription.
  2. Find the row labelled Renews (or Access ends, or Trial ends) under Current plan.
  3. Compare the date on that row with the renewal or end date expected for the account.

## S82.03 Overall usage meter.

- **Expected:** An overall usage meter shows how much of the plan allowance is used.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:1236; apps/mobile/src/features/settings/cloud-usage/index.tsx:167; apps/mobile/services/usage.ts:89
- **Where to find it:** Settings > Cloud > Usage > "Plan usage" section: bars "Current session", "Weekly limits" and "This billing period" (labels found in the code)
- **Needs:** a paid account (a Free account sees only the "Free plan" screen with an Upgrade button)
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings.
  2. Tap the Usage row in the Cloud group.
  3. Under Plan usage, look at the bar labelled "This billing period" (the overall meter) and the "Current session" bar.
  4. Compare each bar's fill and percent with the plan allowance.

## S82.04 Per-model usage.

- **Expected:** Users can see usage broken down by model (at least the flagship-model cap and per-model spend).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:718; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Where your usage went" > "By model" list (labels found in the code)
- **Needs:** a paid account with usage in the period
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Scroll to the "Where your usage went" card.
  3. Read the "By model" list: each row shows a model name and its request and credit totals.
  4. Compare the rows with the models used in the account.

## S82.05 Per-feature usage.

- **Expected:** Users can see usage broken down by feature/product area (chat, work, research, code, browser).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:713; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Where your usage went" > "By product area" list (labels found in the code)
- **Needs:** a paid account with usage
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Scroll to "Where your usage went".
  3. Read the "By product area" list under the period rows.
  4. Compare the rows with the Chat, AGI Work, Deep Research, AGI Code and Browser areas.

## S82.06 Voice usage.

- **Expected:** Users can see their voice usage (minutes used against any voice allowance).
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-usage/index.tsx:348 (quoted code not found in the file now); apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "This month" card > "Voice" row (labels found in the code)
- **Needs:** a paid account with a voice allowance
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "This month" card.
  3. Read the "Voice" row: it shows minutes used of the monthly amount, or "no monthly cap".
  4. Compare with the voice minutes used in the period.

## S82.07 Image usage.

- **Expected:** Users can see their image-generation usage.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:561; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "This month" card > "Images" row (labels found in the code)
- **Needs:** a paid account that has generated images this period
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "This month" card.
  3. Read the "Images" row: image count and credits for the period.
  4. Compare with the images generated this period.

## S82.08 Video usage.

- **Expected:** Users can see their video-generation usage (seconds used against the allowance).
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-usage/index.tsx:348 (quoted code not found in the file now); apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "This month" card > "Video" row (labels found in the code)
- **Needs:** a paid account with a video allowance
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "This month" card.
  3. Read the "Video" row: seconds used of the monthly amount.
  4. Compare with the video seconds generated in the period.

## S82.09 Research usage.

- **Expected:** Users can see how much of their usage went to research (Deep Research).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:713; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Where your usage went" > "By product area" > "Deep Research" row (labels found in the code)
- **Needs:** a paid account that has run Deep Research
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Scroll to "Where your usage went" and read "By product area".
  3. Find the row labelled Deep Research and read its request and credit totals.

## S82.10 Coding/work usage.

- **Expected:** Users can see how much of their usage went to coding and agentic work.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:713; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Where your usage went" > "By product area" > "AGI Work" and "AGI Code" rows (labels found in the code)
- **Needs:** a paid account that has used AGI Work or AGI Code
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Scroll to "Where your usage went" and read "By product area".
  3. Find the rows labelled AGI Work (agentic work) and AGI Code (coding).
  4. Compare their totals with the coding and agent runs made.

## S82.11 Storage usage.

- **Expected:** Users can see storage used against their plan storage limit.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-usage/index.tsx:403 (quoted code not found in the file now); apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "File storage" card (labels found in the code)
- **Needs:** a paid account with a storage limit
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Scroll to the "File storage" card.
  3. Read the "Used" row: used bytes of the plan limit, with a bar below it.
  4. Compare with the files uploaded or generated.

## S82.12 Active-job count.

- **Expected:** Users can see how many jobs/responses are running now, ideally against their plan's concurrent limit.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:567; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "This month" card > "Responses running now" row (labels found in the code)
- **Needs:** a paid account, and a response that is still running
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "This month" card.
  3. Read the "Responses running now" row: active responses of the concurrent limit, "at a time".
  4. Start a long response and compare the count.

## S82.13 Remaining credits.

- **Expected:** Users can see how many credits remain (plan windows and purchased balance).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:420; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Credit balances" card ("Included in your plan" row, with "left" amount) (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "Credit balances" card.
  3. Read "Included in your plan": credits left and the monthly total.
  4. Compare with the credits expected to remain.

## S82.14 Purchased versus included credits.

- **Expected:** Users can tell purchased credits apart from the plan's included allowance.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:431; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Credit balances" card > "Included in your plan" and "Purchased credits" rows (labels found in the code)
- **Needs:** a paid account in a build with native purchases; a purchased-credit account to see amounts
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "Credit balances" card.
  3. Read "Included in your plan" and "Purchased credits" side by side.
  4. Compare that the two rows are separate balances.

## S82.15 Promotional credits.

- **Expected:** Users can see promotional/bonus credits they were given, how much remains and when they lapse.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:430; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Credit balances" card > "Bonus credits" row (labels found in the code)
- **Needs:** an account that has bonus credits (referral or promotion); native-purchase build
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "Credit balances" card.
  3. Read the "Bonus credits" row: remaining amount and its "Next expiry" line, or "None".
  4. Compare with a promotion or referral credit the account received.

## S82.16 Credit-expiry information.

- **Expected:** Users can see when each kind of credit expires (plan allowance reset, purchased balance lifetime, bonus lapse).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:388; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Credit balances" card ("Next expiry" and purchase expiry lines) and "This month" card ("Resets …" note) (labels found in the code)
- **Needs:** an account with bonus or purchased credits
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Find the "Credit balances" card and read the detail under "Bonus credits" ("Next expiry …") and "Purchased credits".
  3. Read the "Resets" note on the "This month" card and the "Resets" card if present.
  4. Compare the dates with each credit's lapse date.

## S82.17 Reset countdown.

- **Expected:** Each usage window shows how long until it resets.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-usage/index.tsx:300 (quoted code not found in the file now); apps/mobile/services/usage.ts:89
- **Where to find it:** Settings > Cloud > Usage > "Plan usage" section: a "Resets in …" line under each bar ("Current session", "Weekly limits", "This billing period") (labels found in the code)
- **Needs:** a paid account with active windows
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Under Plan usage, read the small line under each bar that starts "Resets in".
  3. Wait a few minutes or compare with the clock and check the countdown moves.

## S82.18 Daily/weekly/monthly history.

- **Expected:** Users can review usage history by day, week and month.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-usage/index.tsx:182; apps/mobile/app/(app)/settings/cloud-usage.tsx:1
- **Where to find it:** Settings > Cloud > Usage > "Where your usage went" > segmented buttons "Days", "Weeks", "Months" (labels found in the code)
- **Needs:** a paid account with usage history
- **Steps:**
  1. Switch to AGI Cloud mode, then open Settings and tap Usage in the Cloud group.
  2. Scroll to "Where your usage went".
  3. Tap Days, then Weeks, then Months.
  4. Compare that the period rows change to daily, weekly and monthly totals.

## S82.20 Usage by task.

- **Expected:** Users can see usage per task (agent run / work session).
- **Code:** done. Evidence moved: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:390; apps/mobile/src/features/tasks/service.ts:29 (quoted code not found in the file now)
- **Where to find it:** Side menu > AGI Work > open a finished task > details sheet with "Cost" and "Usage" rows (labels found in the code)
- **Needs:** a cloud account with at least one agent run that reported usage
- **Steps:**
  1. Open the side menu and tap AGI Work.
  2. Tap a task run in the list to open its details sheet.
  3. Read the "Cost" row and the "Usage" row (calls and tokens) in the metadata area.
  4. Compare with the task's work done.

## S82.23 Actual task cost.

- **Expected:** After a task finishes, the user sees what it actually cost.
- **Code:** done. Evidence present: apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:378; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:382
- **Where to find it:** Side menu > AGI Work > open a task run > "Cost" row in the details sheet (labels found in the code)
- **Needs:** a cloud account with a finished agent run
- **Steps:**
  1. Open the side menu, tap AGI Work, then tap a task run that has finished.
  2. Read the "Cost" row in the details sheet.
  3. Compare with the credits shown on the Usage screen for that period.

## S82.24 Budget warning.

- **Expected:** Users are warned before they hit a usage limit.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:2708; apps/mobile/src/features/chat/components/UsageLimitBanner.tsx:20 (quoted code not found in the file now)
- **Where to find it:** Chat screen > warning banner above the message box (e.g. "You're close to the Free limit for now" or "You have used … of …") (labels found in the code)
- **Needs:** a cloud account near a usage limit
- **Steps:**
  1. Sign in to AGI Cloud on an account near a usage limit, then open any chat.
  2. Look above the message box for the usage banner with a gauge icon.
  3. Read the headline and the reset line under it.
  4. Compare with the usage on the Usage screen: the banner appears when a window has 25% or less left.

## S82.25 Budget-reached state.

- **Expected:** When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2852; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:128; apps/mobile/app/(app)/chat/[id].tsx:699
- **Where to find it:** Chat screen > send a message at the limit > bottom sheet titled "Choose a plan", "Upgrade to …" or "Update billing", with the reset line (labels found in the code)
- **Needs:** an account at a usage limit (or a Free account after its allowance is used)
- **Steps:**
  1. On an account at its limit, open a chat and send a message.
  2. A bottom sheet opens: read its title and the body explaining which feature is blocked.
  3. Read the reset line ("Resets in …") under the body, if shown.
  4. Compare with the limit that was reached.

## S82.26 Alternative eligible model suggestion.

- **Expected:** When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:358; apps/mobile/app/(app)/chat/[id].tsx:2860
- **Where to find it:** Chat screen > send at the limit > bottom sheet > "Choose a standard model" button (labels found in the code)
- **Needs:** an account at a limit where the server suggests a standard model
- **Steps:**
  1. On an account at its limit, open a chat and send a message.
  2. In the sheet that opens, look for the "Choose a standard model" button.
  3. Tap it and check that the model picker offers another model the plan can use.

## S82.27 Wait-until-reset option.

- **Expected:** At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2858; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:323
- **Where to find it:** Chat screen > usage banner ("Notify me when it resets") and the send-time bottom sheet (reset line "Resets in …") (labels found in the code)
- **Needs:** an account at or near a limit; a phone that allows notifications for the reminder
- **Steps:**
  1. On an account at its limit, open a chat and send a message, or look at the banner above the message box.
  2. Read the recovery copy and the reset line: the banner or sheet shows when usage comes back.
  3. Tap "Notify me when it resets" if it appears and check the confirmation "We’ll notify you".
