---
id: "PLAN-web-082"
type: "test-plan"
title: "Web · 82. Usage dashboard and limit UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "82"
---
# Web · 82. Usage dashboard and limit UI

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S82.01 Current plan.

- **Expected:** Every signed-in surface shows the account's current plan, read from the server.
- **Code:** done. Evidence moved: apps/web/app/api/me/route.ts:139 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E002 [PASS; interaction]: Expand control reveals dated history groups, conversation links and Free plan. | E010 [PASS; interaction]: Billing shows current Free plan, credit-history and invoice areas. No paid invoice, purchase or payment flow exercised.
- **Where to find it:** Settings > Billing (top plan card) (labels found in the code)
- **Needs:** none (works on a Free account)
- **Steps:**
  1. Sign in and click the Settings command: open the command palette and choose Settings, or use the Settings entry in the app menu.
  2. In the settings list, click Billing.
  3. Look at the plan card at the top: it shows Free plan, or the plan name followed by the word plan.
  4. Compare the name with the plan on the Usage page and the account you expect.

## S82.02 Billing period.

- **Expected:** Users can see the current billing period: when it renews or ends.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/BillingSection.tsx:757 (quoted code not found in the file now); apps/web/features/settings/sections/UsageSection.tsx:1396; apps/web/features/settings/sections/UsageSection.tsx:343; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Billing (plan card and rows below it) (labels found in the code)
- **Needs:** a paid account (the row shows only when a subscription has a period end)
- **Steps:**
  1. Open Settings and click Billing.
  2. Look for a row labelled Renews on, Ends on, Current period ends or Trial ends on.
  3. Read the date shown beside that row.
  4. Compare the date with the renewal or end date you expect.

## S82.03 Overall usage meter.

- **Expected:** An overall usage meter shows how much of the plan allowance is used.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1359; apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/web/lib/services/managed-usage-summary-service.ts:123 (quoted code not found in the file now)
- **Earlier check in the running app:** BLOCKED: E009 [BLOCKED; account limitation]: Usage view opens but only offers paid-plan waitlist text; no usage meter, breakdown or report is available in this Free account.
- **Where to find it:** Settings > Usage > Plan usage limits (bars) (labels found in the code)
- **Needs:** a paid account (a Free account sees only Upgrade for higher capacity)
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled Plan usage limits.
  3. Look at the bars: Current session, This week, Most capable models (when shown) and This billing period.
  4. Compare the bar fill and the percent with what you expect from the plan allowance.

## S82.04 Per-model usage.

- **Expected:** Users can see usage broken down by model (at least the flagship-model cap and per-model spend).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1140; apps/web/features/settings/sections/UsageSection.tsx:1383; apps/web/features/settings/sections/UsageSection.tsx:216 (quoted code not found in the file now); apps/web/lib/services/account-usage-history-service.ts:104 (quoted code not found in the file now)
- **Earlier check in the running app:** BLOCKED: E009 [BLOCKED; account limitation]: Usage view opens but only offers paid-plan waitlist text; no usage meter, breakdown or report is available in this Free account.
- **Where to find it:** Settings > Usage > Where your usage went > By model (labels found in the code)
- **Needs:** a paid account (the history card is hidden on Free)
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to the card titled Where your usage went.
  3. Look at the table captioned By model.
  4. Compare the per-model rows with the usage you made in each model.

## S82.05 Per-feature usage.

- **Expected:** Users can see usage broken down by feature/product area (chat, work, research, code, browser).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1140; apps/web/features/settings/sections/UsageSection.tsx:216 (quoted code not found in the file now); apps/web/lib/services/account-usage-history-service.ts:85 (quoted code not found in the file now)
- **Earlier check in the running app:** BLOCKED: E009 [BLOCKED; account limitation]: Usage view opens but only offers paid-plan waitlist text; no usage meter, breakdown or report is available in this Free account.
- **Where to find it:** Settings > Usage > Where your usage went > By product area (labels found in the code)
- **Needs:** a paid account with some settled usage
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went and find the table captioned By product area.
  3. Read the rows labelled Chat, AGI Work, Deep Research, AGI Code and Browser.
  4. Compare the amounts with the activity you did in each area.

## S82.06 Voice usage.

- **Expected:** Users can see their voice usage (minutes used against any voice allowance).
- **Code:** done. Evidence moved: apps/web/app/api/usage/limits/route.ts:109; apps/web/features/settings/sections/UsageSection.tsx:107 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > This month (row Voice) and Plan usage limits (row Voice) (labels found in the code)
- **Needs:** a paid account with voice use
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled This month and look for the row labelled Voice.
  3. Read the minutes used and any monthly cap text beside it.
  4. Also find the Voice line in Plan usage limits and compare the estimate of minutes left.

## S82.07 Image usage.

- **Expected:** Users can see their image-generation usage.
- **Code:** done. Evidence moved: apps/web/app/api/usage/limits/route.ts:109; apps/web/features/settings/sections/UsageSection.tsx:257 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > This month (row Images) (labels found in the code)
- **Needs:** a paid account that has made at least one image request
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled This month.
  3. Look for the row labelled Images, which shows the image count and credits.
  4. Compare the count with the images you generated.

## S82.08 Video usage.

- **Expected:** Users can see their video-generation usage (seconds used against the allowance).
- **Code:** done. Evidence moved: apps/web/app/api/usage/limits/route.ts:109; apps/web/features/settings/sections/UsageSection.tsx:108 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > This month (row Video) (labels found in the code)
- **Needs:** a paid account with a video allowance and some video use
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled This month.
  3. Look for the row labelled Video, which shows seconds used.
  4. Compare the seconds with the video you generated.

## S82.09 Research usage.

- **Expected:** Users can see how much of their usage went to research (Deep Research).
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6163; apps/web/lib/services/account-usage-history-service.ts:77 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By product area (row Deep Research) (labels found in the code)
- **Needs:** a paid account that has run Deep Research
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went and open the By product area table.
  3. Find the row labelled Deep Research.
  4. Compare its credits and requests with the Deep Research runs you made.

## S82.10 Coding/work usage.

- **Expected:** Users can see how much of their usage went to coding and agentic work.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:1140; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:756; apps/web/features/settings/sections/UsageSection.tsx:216 (quoted code not found in the file now); apps/web/lib/services/account-usage-history-service.ts:85 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By product area (rows AGI Code and AGI Work) (labels found in the code)
- **Needs:** a paid account that has used AGI Code or AGI Work
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went and open the By product area table.
  3. Find the rows labelled AGI Code and AGI Work.
  4. Compare them with the coding and agent work you did.

## S82.11 Storage usage.

- **Expected:** Users can see storage used against their plan storage limit.
- **Code:** done. Evidence moved: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Library (heading line) (labels found in the code)
- **Needs:** a file to upload (to see storage move)
- **Steps:**
  1. Click Library in the sidebar.
  2. Read the line under the Library heading.
  3. It shows the file storage used against the storage limit, or the used amount alone when no limit is known.
  4. Compare the numbers with the files you uploaded.

## S82.12 Active-job count.

- **Expected:** Users can see how many jobs/responses are running now, ideally against their plan's concurrent limit.
- **Code:** done. Evidence present: apps/web/lib/rate-limit.ts:1445; apps/web/features/settings/sections/UsageSection.tsx:815
- **Where to find it:** Settings > Usage > Plan usage limits (row Responses running now) (labels found in the code)
- **Needs:** a paid account; a running response helps show a non-zero count
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled Plan usage limits.
  3. Look for the row labelled Responses running now.
  4. Start a long response in chat and refresh the Usage page to see the count change.

## S82.13 Remaining credits.

- **Expected:** Users can see how many credits remain (plan windows and purchased balance).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:343; apps/web/features/settings/sections/UsageSection.tsx:498 (quoted code not found in the file now); apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/web/lib/services/managed-usage-summary-service.ts:68
- **Earlier check in the running app:** BLOCKED: E009 [BLOCKED; account limitation]: Usage view opens but only offers paid-plan waitlist text; no usage meter, breakdown or report is available in this Free account.
- **Where to find it:** Settings > Usage > Credit balances and Plan usage limits (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled Credit balances and read the rows Bonus credits and Purchased credits.
  3. Find the card titled Plan usage limits and read the bars.
  4. Compare the remaining amounts with the balance you expect.

## S82.14 Purchased versus included credits.

- **Expected:** Users can tell purchased credits apart from the plan's included allowance.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/UsageSection.tsx:498 (quoted code not found in the file now); apps/web/features/settings/sections/UsageSection.tsx:1249; apps/web/features/settings/sections/BillingSection.tsx:1246; apps/web/lib/hooks/useManagedUsageSummary.ts:73; apps/web/lib/services/managed-usage-summary-service.ts:68
- **Where to find it:** Settings > Usage > Credit balances (rows Purchased credits and Bonus credits) (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled Credit balances.
  3. Read the row Purchased credits (bought credits) and the row Bonus credits (promotional or referral credits).
  4. Compare the included monthly allowance in Plan usage limits with these two rows.

## S82.15 Promotional credits.

- **Expected:** Users can see promotional/bonus credits they were given, how much remains and when they lapse.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:370; apps/web/lib/services/bonus-credit-service.ts:70
- **Where to find it:** Settings > Usage > Credit balances (row Bonus credits) (labels found in the code)
- **Needs:** an account that has a promotional or referral credit
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled Credit balances.
  3. Read the row Bonus credits: the amount remaining and the line Next expiry with the date.
  4. Compare the amount and date with the promotional or referral credit you were given.

## S82.16 Credit-expiry information.

- **Expected:** Users can see when each kind of credit expires (plan allowance reset, purchased balance lifetime, bonus lapse).
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:370; apps/web/features/settings/sections/UsageSection.tsx:388; apps/web/lib/services/managed-usage-summary-service.ts:202
- **Where to find it:** Settings > Usage > Credit balances (Next expiry and Purchased credits don't expire) and the reset lines (labels found in the code)
- **Needs:** a paid account, and a bonus credit to see an expiry date
- **Steps:**
  1. Open Settings and click Usage.
  2. In Credit balances, read Next expiry under Bonus credits.
  3. Read the note under Purchased credits.
  4. In Plan usage limits, read the Resets in and reset date text on each bar.

## S82.17 Reset countdown.

- **Expected:** Each usage window shows how long until it resets.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:343; apps/web/features/settings/sections/UsageSection.tsx:1359; apps/web/lib/hooks/useManagedUsageSummary.ts:73
- **Where to find it:** Settings > Usage > Plan usage limits (reset text on each bar) (labels found in the code)
- **Needs:** a paid account with a bar that is not full
- **Steps:**
  1. Open Settings and click Usage.
  2. Find the card titled Plan usage limits.
  3. Read the reset text on a bar, such as Resets in followed by minutes or hours and a date.
  4. Wait a minute and check that the countdown moved.

## S82.18 Daily/weekly/monthly history.

- **Expected:** Users can review usage history by day, week and month.
- **Code:** done. Evidence present: apps/web/features/settings/sections/UsageSection.tsx:121; apps/web/features/settings/sections/UsageSection.tsx:1070
- **Earlier check in the running app:** BLOCKED: E009 [BLOCKED; account limitation]: Usage view opens but only offers paid-plan waitlist text; no usage meter, breakdown or report is available in this Free account.
- **Where to find it:** Settings > Usage > Where your usage went (Days, Weeks, Months) (labels found in the code)
- **Needs:** a paid account with settled usage
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went.
  3. Open the period choice and pick Days, Weeks or Months.
  4. Compare the rows with the period you picked and the UTC note under the heading.

## S82.19 Usage by Project.

- **Expected:** Users can see usage broken down by project.
- **Code:** done. Evidence moved: apps/web/lib/services/account-usage-history-service.ts:164; apps/web/features/settings/sections/UsageSection.tsx:220 (quoted code not found in the file now)
- **Where to find it:** Settings > Usage > Where your usage went > By project (labels found in the code)
- **Needs:** a paid account with settled usage in a project
- **Steps:**
  1. Open Settings and click Usage.
  2. Scroll to Where your usage went.
  3. Find the table captioned By project.
  4. Compare each project row with the work you did in that project.

## S82.20 Usage by task.

- **Expected:** Users can see usage per task (agent run / work session).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:756; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:342; apps/web/lib/services/cloud-agent-run-service.ts:621
- **Where to find it:** Work history (page title Work history, from the command palette) (labels found in the code)
- **Needs:** an account that has run at least one agent task
- **Steps:**
  1. Open the command palette and choose Work history.
  2. Pick an agent task from the list.
  3. Look at each row: a cost appears after the time when the run has a cost.
  4. Compare the cost with the Cost and usage section of the task.

## S82.22 Estimated task cost.

- **Expected:** Before or while a task runs, the user sees an estimate of what it will cost.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6705; apps/web/features/chat/components/research/ResearchActivity.tsx:396
- **Where to find it:** Chat composer > + menu > Deep Research (estimate appears in the research activity) (labels found in the code)
- **Needs:** a paid account (estimate shown for Deep Research); for video, switch to video mode to see the video cost estimate
- **Steps:**
  1. Open a new chat and click the + button in the composer.
  2. Choose Deep Research.
  3. Send a research question and look at the research activity for the text up to ~ with a credit amount.
  4. Compare that estimate with the actual cost in Work history.

## S82.23 Actual task cost.

- **Expected:** After a task finishes, the user sees what it actually cost.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:756; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:342; apps/web/lib/services/cloud-agent-run-service.ts:621
- **Where to find it:** Work history > open a task > Cost and usage (labels found in the code)
- **Needs:** an account with a finished agent task
- **Steps:**
  1. Open the command palette and choose Work history.
  2. Click a finished task.
  3. Find the section titled Cost and usage.
  4. Read the cost and the token and model call line, and compare with what you expect.

## S82.24 Budget warning.

- **Expected:** Users are warned before they hit a usage limit.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:1847
- **Where to find it:** Sidebar footer usage bar (above the mode pill) (labels found in the code)
- **Needs:** a paid account near a limit (the widget is hidden on Free)
- **Steps:**
  1. Look at the bottom of the sidebar for the thin usage bar.
  2. Hover it to see the title text, for example 80% of token budget used.
  3. Check the bar colour: it changes at 80% and 95%.
  4. Compare the percent with the Usage page bars.

## S82.25 Budget-reached state.

- **Expected:** When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.
- **Code:** done. Evidence moved: apps/web/features/chat/components/InlinePaywallCard.tsx:386 (quoted code not found in the file now); apps/web/lib/services/managed-usage-request-service.ts:424
- **Where to find it:** Chat composer, the banner above the text box after a limit is reached (labels found in the code)
- **Needs:** an account at a usage or free limit
- **Steps:**
  1. Open a chat and send messages until a limit is reached, or use an account already at its limit.
  2. Try to send a new message.
  3. Look at the warning banner above the composer: it names the limit and the reset time.
  4. Check that Notify me when it resets and the Upgrade or Use action are shown.

## S82.26 Alternative eligible model suggestion.

- **Expected:** When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:709; apps/web/features/chat/pages/WebChatPage.tsx:2182
- **Where to find it:** Chat composer banner at a limit > Switch to (or Use) an eligible model (labels found in the code)
- **Needs:** an account at a limit where another eligible model exists
- **Steps:**
  1. Reach the blocked state described in the item above.
  2. Look for a button in the banner or the inline paywall card that names another model, such as Switch to.
  3. Click it and confirm the model in the chat header or composer changes.
  4. Send a message and check that it is answered.

## S82.27 Wait-until-reset option.

- **Expected:** At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.
- **Code:** done. Evidence present: apps/web/features/chat/components/InlinePaywallCard.tsx:476; apps/web/features/chat/components/InlinePaywallCard.tsx:345; packages/contracts/types/src/billing-catalog.ts:942
- **Where to find it:** In chat, send a message after a free-plan capacity limit is hit, so the limit card appears. The card's "Try again" button stays disabled with a countdown ("Try again in ...") until the retry time passes. The reset line under the card's text shows when the limit resets. (labels found in the code)
- **Needs:** a Free account that can reach a limit, or a limit-state test account
- **Steps:**
  1. Reach a free-plan capacity limit in chat (or wait for a "No free capacity right now" card).
  2. Look at the card's main button: it reads "Try again" and is disabled with a countdown.
  3. Read the reset sentence under the card text, if one is shown.
  4. Look at the second button "Try later" and the "Upgrade to ..." button, and compare with the Expected: waiting for the reset is offered as an alternative to paying.

## S82.29 Extra-usage purchase.

- **Expected:** Users can buy extra usage (credits) when they run out, from where they hit the limit.
- **Code:** done. Evidence present: apps/web/features/chat/lib/quotaPaywallSlot.ts:76; apps/web/features/chat/components/InlinePaywallCard.tsx:187; apps/web/app/api/billing/top-up/route.ts:156; apps/web/features/settings/sections/BillingSection.tsx:1183
- **Where to find it:** Chat: at a limit, the limit card shows a "Buy credits" button when the account is a paid self-serve plan billed through Stripe, Apple or Google. Also Settings > Billing > "Buy credits" panel (the "Buy $..." button starts checkout). (labels found in the code)
- **Needs:** a paid account billed through Stripe, Apple or Google; a Free account sees only the upgrade paths
- **Steps:**
  1. Sign in to a paid self-serve account and reach a usage limit in chat (or open Settings > Billing).
  2. In the limit card, look for the "Buy credits" button.
  3. Or open Settings > Billing and find the "Buy credits" section, pick an amount, and read the "Buy $..." button.
  4. Compare with Expected: the user can buy extra usage from where they hit the limit. Stop before paying.

## S82.30 Auto-reload settings.

- **Expected:** Users can turn on automatic credit reload (top up when the balance falls below a threshold) and configure it.
- **Code:** done. Evidence present: apps/web/features/settings/sections/BillingSection.tsx:1186; apps/web/features/billing/components/AutoReloadPanel.tsx:185; apps/web/app/api/billing/auto-reload/route.ts:116; apps/web/lib/services/auto-reload-service.ts:1013
- **Where to find it:** Settings > Billing, then scroll to the "Auto-reload" section below the "Buy credits" panel. (labels found in the code)
- **Needs:** a paid account billed through Stripe with a saved card (the panel shows "Add a payment method" if no card is on file)
- **Steps:**
  1. Open Settings, then the "Billing" tab.
  2. Scroll to the "Auto-reload" heading.
  3. Turn on the switch next to it (a confirm dialog asks "Turn on auto-reload?").
  4. Set "When my balance falls below" and "Reload with", then press "Save auto-reload" and compare with Expected: you can turn on and configure automatic credit reload.

## S82.31 Spending cap.

- **Expected:** An owner can set a spending cap that stops managed usage once reached.
- **Code:** done. Evidence present: apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:190; apps/web/lib/services/spend-limit-service.ts:188; apps/web/lib/services/managed-usage-request-service.ts:399
- **Where to find it:** Workspace console > "Usage" (sidebar item under the workspace console, page title "Usage"), then the "Monthly spend limit" block at the top of the analytics. (labels found in the code)
- **Needs:** a workspace owner account
- **Steps:**
  1. Sign in as a workspace owner and open the workspace console.
  2. Click "Usage" in the console sidebar.
  3. Find the "Monthly spend limit" block.
  4. Set "Alert at" and the action ("Notify" or "Block"), then press "Set limit" (or "Update limit" if one exists).
  5. Compare with Expected: managed usage stops at the cap for "Block"; "Remove limit" removes the cap after a confirm dialog.

## S82.32 Download usage report.

- **Expected:** Users can download a usage report (e.g. CSV).
- **Code:** done. Evidence present: apps/web/app/api/usage/export/route.ts:91; apps/web/features/settings/sections/UsageSection.tsx:1178
- **Earlier check in the running app:** BLOCKED: E009 [BLOCKED; account limitation]: Usage view opens but only offers paid-plan waitlist text; no usage meter, breakdown or report is available in this Free account.
- **Where to find it:** Settings > Usage, then the "Download CSV" link under the usage history. (labels found in the code)
- **Needs:** a paid account with usage history (the Free account QA run showed only paid-plan waitlist text on Usage)
- **Steps:**
  1. Open Settings, then the "Usage" tab.
  2. Wait until the usage history has loaded.
  3. Click "Download CSV" below the history.
  4. Open the downloaded file and compare with Expected: a usage report file is saved.

## S82.33 Billing discrepancy report.

- **Expected:** Users can report a billing or usage discrepancy and have it tracked.
- **Code:** done. Evidence present: apps/web/app/api/usage/discrepancy/route.ts:197; apps/web/features/settings/sections/UsageSection.tsx:933
- **Where to find it:** Settings > Usage, then the "Report a billing problem" button under the usage history. (labels found in the code)
- **Needs:** a paid account with usage history (the Free account QA run showed only paid-plan waitlist text on Usage)
- **Steps:**
  1. Open Settings, then the "Usage" tab.
  2. Wait until the usage history has loaded.
  3. Click "Report a billing problem".
  4. Choose the period in the form, optionally add a note, and press "File report".
  5. Compare with Expected: a confirmation reads "Report filed as ..." with the usage record attached.
