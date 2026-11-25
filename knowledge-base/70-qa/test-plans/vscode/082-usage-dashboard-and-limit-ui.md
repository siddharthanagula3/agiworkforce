---
id: "PLAN-vscode-082"
type: "test-plan"
title: "VS Code · 82. Usage dashboard and limit UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "82"
---
# VS Code · 82. Usage dashboard and limit UI

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S82.01 Current plan.

- **Expected:** Every signed-in surface shows the account's current plan, read from the server.
- **Code:** done. Evidence present: apps/extension-vscode/src/utils/api.ts:1296
- **Where to find it:** Command Palette > "Code: Open Settings" > "Usage & billing" (left list); the plan name is in the top card (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the Command Palette and run "Code: Open Settings".
  2. Click "Usage & billing" in the left list.
  3. Read the plan name in the top card and compare it with the plan on the AGI Cloud account page in the browser.

## S82.02 Billing period.

- **Expected:** Users can see the current billing period: when it renews or ends.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:885; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Command Palette > "Code: Open Settings" > "Usage & billing" > "Plan usage" row (reset date) (labels found in the code)
- **Needs:** a paid account (the Plan usage row is hidden on the Free plan)
- **Steps:**
  1. Run "Code: Open Settings" from the Command Palette.
  2. Click "Usage & billing".
  3. Look at the "Plan usage" row for the "resets" date.
  4. If the subscription is set to cancel, look for the cancellation date under the plan card.

## S82.03 Overall usage meter.

- **Expected:** An overall usage meter shows how much of the plan allowance is used.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4154; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:909; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Sidebar chat > usage meter bar at the top of the panel (cloud icon, bar, "Usage: " text); the same meter is in Settings > "Usage & billing" > "Plan usage" (labels found in the code)
- **Needs:** a Managed Cloud account (the bar is hidden for BYOK and unbounded routes)
- **Steps:**
  1. Open the AGI sidebar in the Activity Bar and sign in to a Managed Cloud account.
  2. Look for the thin usage bar with the cloud icon and the "Usage: " text.
  3. Click the "×" button to collapse it, then the small pill labelled "Usage" to show it again.
  4. Compare the bar fill with the percentage text in the Plan usage row in Settings.

## S82.04 Per-model usage.

- **Expected:** Users can see usage broken down by model (at least the flagship-model cap and per-model spend).
- **Code:** done. Evidence present: apps/extension-vscode/src/data/usagePresentation.ts:128
- **Where to find it:** Command Palette > "Code: Open Settings" > "Usage & billing" > "Usage history" > "By model" list (labels found in the code)
- **Needs:** a paid account with some settled usage
- **Steps:**
  1. Run "Code: Open Settings" from the Command Palette.
  2. Click "Usage & billing".
  3. Scroll to the "Usage history" heading and read the "By model" list.
  4. Compare the per-model rows with the flagship weekly window in the plan usage rows.

## S82.10 Coding/work usage.

- **Expected:** Users can see how much of their usage went to coding and agentic work.
- **Code:** done. Evidence present: apps/extension-vscode/src/data/usagePresentation.ts:125
- **Where to find it:** Command Palette > "Code: Open Settings" > "Usage & billing" > "Usage history" > "By product area" list (labels found in the code)
- **Needs:** a paid account with some settled usage
- **Steps:**
  1. Run "Code: Open Settings" from the Command Palette.
  2. Click "Usage & billing".
  3. Scroll to "Usage history" and read the "By product area" list.
  4. Look for a coding or agent work row and compare it with Expected.

## S82.13 Remaining credits.

- **Expected:** Users can see how many credits remain (plan windows and purchased balance).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:885; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:896; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Command Palette > "Code: Account & Usage" > quick pick row "Credits: ..."; the same row is in Settings > "Usage & billing" > "Credits" (labels found in the code)
- **Needs:** a paid account with a credit balance
- **Steps:**
  1. Run "Code: Account & Usage" from the Command Palette.
  2. Read the "$(credit-card) Credits: ..." row and the "plan usage" rows above it.
  3. Click "Usage & billing" in Settings (Code: Open Settings) and read the "Credits" row.
  4. Compare the balance with the plan windows listed.

## S82.14 Purchased versus included credits.

- **Expected:** Users can tell purchased credits apart from the plan's included allowance.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:896; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:885; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Settings > "Usage & billing" > "Credits" row (spendability line); the plan windows are shown in the separate "Plan usage" rows (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Run "Code: Open Settings" from the Command Palette and click "Usage & billing".
  2. Read the "Plan usage" rows (included allowance) and the "Credits" row (balance).
  3. Read the spendability line under Credits: "Buy credits to work past a limit", "Spent when a limit stops you" or "Off - enable in billing to spend".
  4. Compare what is listed as included with what is listed as credits.

## S82.17 Reset countdown.

- **Expected:** Each usage window shows how long until it resets.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:885; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:909; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Command Palette > "Code: Account & Usage" > plan usage row (description shows the reset); sidebar usage meter shows the reset after the usage text (labels found in the code)
- **Needs:** a paid account with a usage window that resets
- **Steps:**
  1. Run "Code: Account & Usage" from the Command Palette.
  2. Read the description on each "plan usage" row.
  3. Open the sidebar and read the reset text after the "Usage: " bar.
  4. Compare the time left with Expected. A row with no reset shows "No reset pending".

## S82.20 Usage by task.

- **Expected:** Users can see usage per task (agent run / work session).
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. Searched apps/extension-vscode/src for per-task, by-task, per-task usage and task cost; no per-task usage view was found. The only per-session figures are "Billed this session" and the usage history, which group by product area, model and period.
- **Needs:** a paid account with an agent run

## S82.23 Actual task cost.

- **Expected:** After a task finishes, the user sees what it actually cost.
- **Code:** done. Evidence present: apps/extension-vscode/src/data/tokenCounter.ts:272; apps/extension-vscode/src/utils/api.ts:1185
- **Where to find it:** Status bar (bottom of the window) after a chat turn ends: a message appears for about 10 seconds; or Command Palette > "Code: Show Token Breakdown" > "Billed this session" row (labels found in the code)
- **Needs:** a Managed Cloud account and a finished chat turn
- **Steps:**
  1. Send one chat message with a Managed Cloud account and wait for the reply to finish.
  2. Watch the bottom status bar for the message "Code: this turn was billed ..." (it stays about 10 seconds).
  3. If it says "so far" with a count of unsettled requests, wait a few seconds and check again.
  4. Run "Code: Show Token Breakdown" and read the "Billed this session" row.

## S82.24 Budget warning.

- **Expected:** Users are warned before they hit a usage limit.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4172; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:909; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Sidebar chat > usage meter bar; the bar changes colour as the remaining share drops, and an "Upgrade" button appears when the server asks for it (labels found in the code)
- **Needs:** a Managed Cloud account close to a limit
- **Steps:**
  1. Use a Managed Cloud account close to its limit (or ask a tester who has one).
  2. Open the sidebar and look at the usage bar's colour and fill.
  3. Look for the "Upgrade" button on the bar.
  4. Compare with Expected: the user should be warned before the limit is reached.

## S82.25 Budget-reached state.

- **Expected:** When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4166; apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:270; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Sidebar chat > send a message when the Managed Cloud quota is used up > warning popup at the bottom of VS Code with "Add credits", "Upgrade" or "View usage"; the bar shows "Managed Cloud quota exhausted" (labels found in the code)
- **Needs:** a Managed Cloud account at its limit
- **Steps:**
  1. Use a Managed Cloud account whose quota is used up.
  2. Send a chat message.
  3. Read the warning popup: its title, the limit message and the reset time.
  4. Read the buttons "Add credits", "Upgrade" and "View usage", and the sidebar bar text "Managed Cloud quota exhausted".

## S82.26 Alternative eligible model suggestion.

- **Expected:** When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:158
- **Where to find it:** Same warning popup as S82.25 > button "Use ${modelDisplayLabel(alternative)}" (shows the model name), offered only when the server suggests a standard model and one is eligible (labels found in the code)
- **Needs:** an account blocked on its model with an eligible alternative
- **Steps:**
  1. Use a Managed Cloud account blocked on the chosen model, where a cheaper eligible model exists.
  2. Send a chat message so the warning popup appears.
  3. Look for the button that starts with "Use " followed by a model name.
  4. Click it and check that the chat retries with that model.

## S82.27 Wait-until-reset option.

- **Expected:** At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4166; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:909; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Same warning popup as S82.25 > reset time at the end of the message; no wait button exists (labels found in the code)
- **Needs:** a Managed Cloud account at its limit
- **Steps:**
  1. Reach a limit as in S82.25.
  2. Read the popup message: the reset time is added after the limit text.
  3. Look at the buttons: "Add credits", "Upgrade", "View usage" (and "Use ..." if offered).
  4. Compare with Expected: the code offers no button to wait until reset.
