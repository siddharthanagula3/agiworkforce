---
id: "PLAN-desktop-082"
type: "test-plan"
title: "Desktop · 82. Usage dashboard and limit UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "82"
---
# Desktop · 82. Usage dashboard and limit UI

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S82.01 Current plan.

- **Expected:** Every signed-in surface shows the account's current plan, read from the server.
- **Code:** done. Evidence moved: apps/web/app/api/me/route.ts:139 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched the Billing and Usage settings for a plan-name row; did not find one. The /api/me route named in Code was not located in this pass.
- **Needs:** a signed-in account

## S82.02 Billing period.

- **Expected:** Users can see the current billing period: when it renews or ends.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:757 (quoted code not found in the file now); apps/web/features/settings/sections/UsageSection.tsx:1396; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Billing (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open Settings from the app menu.
  2. Click Billing in the settings list.
  3. Look for the row that starts with Renews on, Ends on, Trial ends on or Current period ends, and compare with Expected.

## S82.03 Overall usage meter.

- **Expected:** An overall usage meter shows how much of the plan allowance is used.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:1359; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Usage > Plan usage limits (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open Settings and click Usage in the settings list.
  2. Find the card titled Plan usage limits.
  3. Look at the bars labelled Current session, This week and This billing period, and check each shows how much is used.
  4. Compare with Expected.

## S82.04 Per-model usage.

- **Expected:** Users can see usage broken down by model (at least the flagship-model cap and per-model spend).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1140; apps/web/features/settings/sections/UsageSection.tsx:1383; apps/web/features/settings/sections/UsageSection.tsx:216 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By model (labels found in the code)
- **Needs:** a paid account with some settled usage
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to the card titled Where your usage went.
  3. Find the table captioned By model and check each model row shows a request count and credits.
  4. Compare with Expected.

## S82.05 Per-feature usage.

- **Expected:** Users can see usage broken down by feature/product area (chat, work, research, code, browser).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1140; apps/web/features/settings/sections/UsageSection.tsx:216 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By product area (labels found in the code)
- **Needs:** a paid account with some settled usage
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went.
  3. Find the table captioned By product area and check it lists Chat, AGI Work, Deep Research, AGI Code and Browser.
  4. Compare with Expected.

## S82.06 Voice usage.

- **Expected:** Users can see their voice usage (minutes used against any voice allowance).
- **Code:** done. Evidence moved: apps/web/app/api/usage/limits/route.ts:109; apps/web/features/settings/sections/UsageSection.tsx:107 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Plan usage limits > Voice (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open Settings and click Usage.
  2. In the Plan usage limits card, find the row labelled Voice.
  3. Read the line that says About N minutes of voice left at today's price, or No voice left until a limit above resets.
  4. Compare with Expected.

## S82.07 Image usage.

- **Expected:** Users can see their image-generation usage.
- **Code:** done. Evidence moved: apps/web/app/api/usage/limits/route.ts:109; apps/web/features/settings/sections/UsageSection.tsx:257 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > This month > Images (labels found in the code)
- **Needs:** a paid account that has generated images this month
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled This month.
  3. Look for the row labelled Images, which appears only when there were image requests this month.
  4. Compare with Expected.

## S82.08 Video usage.

- **Expected:** Users can see their video-generation usage (seconds used against the allowance).
- **Code:** done. Evidence moved: apps/web/app/api/usage/limits/route.ts:109; apps/web/features/settings/sections/UsageSection.tsx:108 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No video usage row was found on the Usage page. Searched UsageSection.tsx for Video; only a video_seconds key in a counts mapping and a VideoCostEstimate in the composer were found.
- **Needs:** a paid account

## S82.09 Research usage.

- **Expected:** Users can see how much of their usage went to research (Deep Research).
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6163; apps/web/lib/services/account-usage-history-service.ts:77 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By product area > Deep Research (labels found in the code)
- **Needs:** a paid account that has run Deep Research
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went and check the By product area table.
  3. Find the row Deep Research.
  4. Compare its credits and request count with Expected.

## S82.10 Coding/work usage.

- **Expected:** Users can see how much of their usage went to coding and agentic work.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1140; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:756; apps/web/features/settings/sections/UsageSection.tsx:216 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By product area > AGI Code and AGI Work (labels found in the code)
- **Needs:** a paid account that has used coding or work mode
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went and open the By product area table.
  3. Find the rows AGI Code and AGI Work.
  4. Compare with Expected.

## S82.11 Storage usage.

- **Expected:** Users can see storage used against their plan storage limit.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No storage row was found on the Usage page. Searched UsageSection.tsx; only a knowledge-files route in apps/web/app/api/projects was found, which is not a settings screen.
- **Needs:** a paid account

## S82.12 Active-job count.

- **Expected:** Users can see how many jobs/responses are running now, ideally against their plan's concurrent limit.
- **Code:** done. Evidence present: apps/web/lib/rate-limit.ts:1445; apps/web/features/settings/sections/UsageSection.tsx:815
- **Where to find it:** Settings > Usage (labels found in the code)
- **Needs:** a paid account with a response running
- **Steps:**
  1. Open Settings and click Usage.
  2. Look for the line labelled Responses running now.
  3. Read the value shown as N of M at a time.
  4. Compare with Expected.

## S82.13 Remaining credits.

- **Expected:** Users can see how many credits remain (plan windows and purchased balance).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:343; apps/web/features/settings/sections/UsageSection.tsx:498 (quoted code not found in the file now); apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Usage > Credit balances (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled Credit balances.
  3. Read the rows Bonus credits and Purchased credits.
  4. Compare with Expected.

## S82.14 Purchased versus included credits.

- **Expected:** Users can tell purchased credits apart from the plan's included allowance.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:498 (quoted code not found in the file now); apps/web/features/settings/sections/UsageSection.tsx:1249; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Usage > Credit balances (labels found in the code)
- **Needs:** a paid account that has bought credits
- **Steps:**
  1. Open Settings and click Usage.
  2. In Credit balances, read the Purchased credits row and the Bonus credits row.
  3. Read the sentence starting Past a plan limit, bonus credits go first.
  4. In Plan usage limits, check the included allowance bars, then compare with Expected.

## S82.15 Promotional credits.

- **Expected:** Users can see promotional/bonus credits they were given, how much remains and when they lapse.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:370; apps/web/lib/services/bonus-credit-service.ts:70
- **Where to find it:** Settings > Usage > Credit balances > Bonus credits (labels found in the code)
- **Needs:** a Free or paid account that has received a promotional or referral credit
- **Steps:**
  1. Open Settings and click Usage.
  2. In Credit balances, find the row Bonus credits.
  3. Read the amount and the line Next expiry with its date, or the note about referrals and promotions if there are none.
  4. Compare with Expected.

## S82.16 Credit-expiry information.

- **Expected:** Users can see when each kind of credit expires (plan allowance reset, purchased balance lifetime, bonus lapse).
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:370; apps/web/features/settings/sections/UsageSection.tsx:388; apps/web/lib/services/managed-usage-summary-service.ts:202
- **Where to find it:** Settings > Usage > Credit balances (labels found in the code)
- **Needs:** a paid account with bonus or purchased credits
- **Steps:**
  1. Open Settings and click Usage.
  2. In Credit balances, read the detail line under Bonus credits, which shows Next expiry with a date.
  3. Read the detail line under Purchased credits.
  4. Compare with Expected.

## S82.17 Reset countdown.

- **Expected:** Each usage window shows how long until it resets.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:343; apps/web/features/settings/sections/UsageSection.tsx:1359; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Usage > Plan usage limits (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open Settings and click Usage.
  2. In Plan usage limits, read the detail under Current session or This week.
  3. Look for the Resets at or reset-in text next to each bar.
  4. Compare with Expected.

## S82.18 Daily/weekly/monthly history.

- **Expected:** Users can review usage history by day, week and month.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:121; apps/web/features/settings/sections/UsageSection.tsx:1070
- **Where to find it:** Settings > Usage > Where your usage went (labels found in the code)
- **Needs:** a paid account with some settled usage
- **Steps:**
  1. Open Settings and click Usage.
  2. In Where your usage went, find the segmented control with Days, Weeks and Months.
  3. Click Weeks, then Months, and watch the history table change.
  4. Compare with Expected.

## S82.19 Usage by Project.

- **Expected:** Users can see usage broken down by project.
- **Code:** done. Evidence moved: apps/web/lib/services/account-usage-history-service.ts:164; apps/web/features/settings/sections/UsageSection.tsx:220 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By project (labels found in the code)
- **Needs:** a paid account with usage inside a project
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went.
  3. Find the table captioned By project.
  4. Compare with Expected.

## S82.20 Usage by task.

- **Expected:** Users can see usage per task (agent run / work session).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:756; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:342; apps/web/lib/services/cloud-agent-run-service.ts:621
- **Where to find it:** Sidebar > Tasks > open a task > Cost and usage (labels found in the code)
- **Needs:** a paid account that has run a task
- **Steps:**
  1. Click Tasks in the sidebar.
  2. Open any task from the list.
  3. Find the section titled Cost and usage in the task panel.
  4. Read the cost and token line, and compare with Expected.

## S82.22 Estimated task cost.

- **Expected:** Before or while a task runs, the user sees an estimate of what it will cost.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6705; apps/web/features/chat/components/research/ResearchActivity.tsx:396
- **Where to find it:** Chat composer > Deep Research > send a research request > Research activity (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Choose Deep Research in the composer, type a question and do not send yet, or send it.
  2. Look in the research activity panel for the line that starts with up to ~ and shows credits.
  3. Compare the estimate with Expected.

## S82.23 Actual task cost.

- **Expected:** After a task finishes, the user sees what it actually cost.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:756; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:342; apps/web/lib/services/cloud-agent-run-service.ts:621
- **Where to find it:** Sidebar > Tasks > open a finished task > Cost and usage (labels found in the code)
- **Needs:** a paid account with a finished task
- **Steps:**
  1. Click Tasks in the sidebar.
  2. Open a task that has finished.
  3. Find Cost and usage and read the cost line and the tokens line.
  4. Compare with Expected.

## S82.24 Budget warning.

- **Expected:** Users are warned before they hit a usage limit.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:1847
- **Where to find it:** Chat > composer area > usage warning banner (some labels not found in the code; trust the screen)
- **Needs:** an account near a usage limit
- **Steps:**
  1. Use an account that is close to a plan limit and open a chat.
  2. Look above the composer for the usage warning banner.
  3. Read the headline and compare with Expected.
  4. Click Try later to dismiss, or Get more usage to upgrade.

## S82.25 Budget-reached state.

- **Expected:** When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.
- **Code:** done. Evidence moved: apps/web/features/chat/components/InlinePaywallCard.tsx:386 (quoted code not found in the file now); apps/web/lib/services/managed-usage-request-service.ts:424
- **Where to find it:** Chat > send a message after a limit is reached > paywall card in the chat (labels found in the code)
- **Needs:** an account at a usage limit
- **Steps:**
  1. Use an account that has reached a limit and send a chat message.
  2. Look for the card in the chat that says a limit was reached.
  3. Read the headline and the buttons, such as Buy credits or Upgrade.
  4. Compare with Expected.

## S82.26 Alternative eligible model suggestion.

- **Expected:** When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:709; apps/web/features/chat/pages/WebChatPage.tsx:2182
- **Where to find it:** Chat > send a message after a limit is reached > paywall card > Switch to [model name] (labels found in the code)
- **Needs:** an account blocked from one model
- **Steps:**
  1. Use an account that is blocked from the chosen model and send a message.
  2. Look in the paywall card for a button starting Switch to followed by a model name.
  3. Click it and check the chat now uses that model.
  4. Compare with Expected.

## S82.27 Wait-until-reset option.

- **Expected:** At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.
- **Code:** done. Evidence present: apps/web/features/chat/components/InlinePaywallCard.tsx:476; apps/web/features/chat/components/InlinePaywallCard.tsx:345; packages/contracts/types/src/billing-catalog.ts:942
- **Where to find it:** Chat > send a message while the plan's usage is used up, then read the blocked card (labels found in the code)
- **Needs:** a Free account or an account at a usage limit
- **Steps:**
  1. Sign in with an account whose plan usage is used up (or wait for the limit to be hit in a chat).
  2. Send a message in the chat composer.
  3. Read the blocked card that appears in the chat message list.
  4. Look for the sentence 'Upgrade or wait for the reset.' and any reset time shown under the headline; compare with Expected (wait option plus reset time, alongside paying).

## S82.29 Extra-usage purchase.

- **Expected:** Users can buy extra usage (credits) when they run out, from where they hit the limit.
- **Code:** done. Evidence present: apps/web/features/chat/lib/quotaPaywallSlot.ts:76; apps/web/features/chat/components/InlinePaywallCard.tsx:187; apps/web/app/api/billing/top-up/route.ts:156; apps/web/features/settings/sections/BillingSection.tsx:1183
- **Where to find it:** Chat > send a message at a limit > blocked card > 'Buy credits' (labels found in the code)
- **Needs:** a paid account that can buy credits, at a usage limit
- **Steps:**
  1. Reach a usage limit in chat with an account that can buy credits.
  2. Read the blocked card and find the button 'Buy credits'.
  3. Click 'Buy credits' and note the page or dialog that opens.
  4. Compare with Expected: the purchase starts from where the limit was hit.

## S82.30 Auto-reload settings.

- **Expected:** Users can turn on automatic credit reload (top up when the balance falls below a threshold) and configure it.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:1186; apps/web/features/billing/components/AutoReloadPanel.tsx:185; apps/web/app/api/billing/auto-reload/route.ts:116; apps/web/lib/services/auto-reload-service.ts:1013
- **Where to find it:** Settings > Billing > 'Auto-reload' panel (labels found in the code)
- **Needs:** a paid account with card billing (Stripe)
- **Steps:**
  1. Open Settings and go to the Billing section.
  2. Scroll to the panel titled 'Auto-reload'.
  3. Turn auto-reload on, set the threshold and save; a dialog titled 'Turn on auto-reload?' appears first.
  4. Compare with Expected: the balance threshold and reload amount can be set and saved.

## S82.31 Spending cap.

- **Expected:** An owner can set a spending cap that stops managed usage once reached.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190; apps/web/lib/services/managed-usage-request-service.ts:399
- **Where to find it:** Workspace console > usage analytics > 'Monthly spend limit' card (labels found in the code)
- **Needs:** an owner account in a workspace
- **Steps:**
  1. Sign in as the owner of a workspace and open the workspace console (nav title 'Workspace').
  2. Open the usage analytics view that holds the card.
  3. Find the card titled 'Monthly spend limit'.
  4. Set a monthly cap and pick the enforcement option 'Block' (other option 'Notify'), then save.
  5. Compare with Expected: once the cap is reached, managed usage stops.

## S82.32 Download usage report.

- **Expected:** Users can download a usage report (e.g. CSV).
- **Code:** done. Evidence present: apps/web/app/api/usage/export/route.ts:91; apps/web/features/settings/sections/UsageSection.tsx:1178
- **Where to find it:** Settings > Usage > 'Download CSV' (labels found in the code)
- **Steps:**
  1. Open Settings and go to the Usage section.
  2. Scroll to the buttons under the history chart.
  3. Click 'Download CSV' and wait for the file to save.
  4. Open the CSV and compare with Expected: a usage report file is downloaded.

## S82.33 Billing discrepancy report.

- **Expected:** Users can report a billing or usage discrepancy and have it tracked.
- **Code:** done. Evidence present: apps/web/app/api/usage/discrepancy/route.ts:197; apps/web/features/settings/sections/UsageSection.tsx:933
- **Where to find it:** Settings > Usage > 'Report a billing problem' (labels found in the code)
- **Steps:**
  1. Open Settings and go to the Usage section.
  2. Scroll to the buttons under the history chart and click 'Report a billing problem'.
  3. Fill in the message and the period, then submit.
  4. Compare with Expected: the report is sent and a confirmation or tracking result appears.
