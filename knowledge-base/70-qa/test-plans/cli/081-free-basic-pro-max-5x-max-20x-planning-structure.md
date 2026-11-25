---
id: "PLAN-cli-081"
type: "test-plan"
title: "CLI · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "81"
---
# CLI · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S81.09 Separate feature-access differences.

- **Expected:** Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.
- **Code:** done. Evidence present: packages/contracts/types/src/billing-catalog.ts:402; apps/cli/src/plans.rs:198; apps/extension-vscode/src/features/account-auth/planComparison.ts:42
- **Where to find it:** Type "agi plans" in a terminal (prints the plan table). Inside chat, type "/usage" for account usage. (labels found in the code)
- **Needs:** A Free account and a paid account (to compare "Adds over" lines from a different current plan). Without sign-in only "Includes:" lines appear.
- **Steps:**
  1. Sign in with agi login, then run agi plans in a terminal.
  2. Read the first line: "Plans, with credits per 5 hours / week / month".
  3. Find the line for your plan marked "(your plan)" and the lines under the other plans that start with "Adds over" (or "Includes:" when not signed in).
  4. Compare the feature lists between plans. Expected: each higher plan lists features it adds over the current plan. The server-side enforcement is not visible from the CLI; check it by trying a blocked feature if one is available.

## S81.14 Separate generation settings.

- **Expected:** Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:627
- **Where to find it:** Type "/model" in the chat (the model picker opens). Use Tab or the left and right arrows on the "Effort:" bar. (labels found in the code)
- **Needs:** A signed-in paid account, and a Free or lower-plan account to see the "needs" tags.
- **Steps:**
  1. Start agi and type /model in the chat.
  2. Highlight a model that supports reasoning. Look for the bar "Thinking: on" with "Effort: ◀ Medium ▶   Tab/←→" under the list.
  3. Press Tab or the arrow keys to change the effort. Expected: the effort level changes and the choice is shown.
  4. Highlight a model your plan cannot use. Look for the row tag "needs" followed by the plan name. The server-side clamp of requests is not visible here.

## S81.15 Separate per-model caps.

- **Expected:** Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Type "agi usage" in a terminal, or "/usage" in the chat. Look for the "Account usage" block. (labels found in the code)
- **Needs:** A Max or Ultra account. The flagship line appears only when the server reports a flagship window. Reaching the cap needs heavy use of a flagship model.
- **Steps:**
  1. Sign in with a Max or Ultra account, then run agi usage.
  2. Find the "Flagship weekly" line under "Account usage" (shows "X of Y credits used, Z left" with a reset time).
  3. Use flagship models until the cap is reached, or check the limit message the CLI shows when the server returns the flagship limit code.
  4. Compare the number shown with the cap for your plan on agi plans. Expected: the flagship cap is shown to the user and blocks use once reached.

## S81.25 Grace-period behavior.

- **Expected:** When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:639
- **Where to find it:** Type "agi usage" in a terminal, or "/usage" in the chat. Look under "Account usage" for the "Subscription:" line. (labels found in the code)
- **Needs:** A paid account whose renewal has failed (hard to set up for a tester; a seeded account on the server is needed). Other states: "paused" shows "Resume it at", and ended shows "Choose a plan at".
- **Steps:**
  1. Use an account whose renewal payment failed (status past_due, unpaid or incomplete) and run agi usage.
  2. Read the "Subscription:" line and the message "Your last payment did not go through, so this subscription is ...".
  3. Read the next line "Update your payment method in Settings > Billing: ..." and open that link.
  4. Expected: the message says the account is on Free until the payment is settled, and says which features and purchased credits are paused. The CLI shows no length for a grace window.

## S81.27 Cross-platform entitlement sharing.

- **Expected:** One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.
- **Code:** done. Evidence moved: apps/cli/src/usage_summary.rs:232 (quoted code not found in the file now); apps/cli/src/usage_summary.rs:358
- **Where to find it:** Type "/status" in the chat for the plan name from the local cache. Type "agi usage" in a terminal for the plan the server reports (line "Plan:" under "Account usage"). (labels found in the code)
- **Needs:** A signed-in account, plus a second surface (web or another app) signed in to the same account.
- **Steps:**
  1. Sign in to the CLI with an account that has a plan on the web or another app.
  2. Type /status in the chat and read "signed in, ... plan".
  3. Run agi usage in a terminal and read the "Plan:" line.
  4. Open the same account on the web or another app and compare the plan name. Expected: all surfaces show the same plan, and the server enforces limits on each.

## S81.28 Plan-specific feature explanations.

- **Expected:** Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).
- **Code:** done. Evidence present: packages/contracts/types/src/billing-catalog.ts:402; apps/cli/src/plans.rs:240
- **Where to find it:** Type "agi plans" in a terminal (the command is described as "Show what each plan includes and its credits per window"). (labels found in the code)
- **Needs:** A signed-in account; a Free or lower-plan account shows the most "needs" tags.
- **Steps:**
  1. Sign in, then run agi plans.
  2. Find your plan marked "(your plan)" and read its "Includes:" line.
  3. Read the "Adds over" line under each higher plan to see what it adds over your plan.
  4. Type /model in the chat and find a model tagged "needs" with a plan name. Expected: the blocked feature points to the plan that unlocks it.
