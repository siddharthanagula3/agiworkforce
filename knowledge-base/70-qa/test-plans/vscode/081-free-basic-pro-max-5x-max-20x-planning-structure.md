---
id: "PLAN-vscode-081"
type: "test-plan"
title: "VS Code · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "81"
---
# VS Code · 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S81.07 Explicit definition of the baseline behind “5x” and “15x.”

- **Expected:** Pricing states what "1x" means: the baseline plan behind 5x/15x and its concrete allowance.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/account-auth/planComparison.ts:35; packages/contracts/types/src/managed-usage-limits.ts:197
- **Where to find it:** Command Palette > Code: Compare Plans (labels found in the code)
- **Needs:** a signed-in account (the list also opens signed out)
- **Steps:**
  1. Press Cmd+Shift+P, type "Compare Plans" and choose "Code: Compare Plans".
  2. Read the list. Each row shows the plan name, a usage line, and an Includes or Adds over line.
  3. Find the usage line on the paid plans. Look for "Same usage as <plan>" or "<n>x more usage than <plan>" and check that the baseline plan is named.
  4. Compare with Expected: a plan that is the baseline for 5x/15x should be named with its concrete allowance. The Free row says "A usage allowance, free models only".

## S81.08 Explicit identification of the allowance being multiplied.

- **Expected:** Plan copy names exactly which allowance a multiplier scales (e.g. managed-usage credits per 5-hour, weekly and monthly window).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/account-auth/planComparison.ts:37 (quoted code not found in the file now); packages/contracts/types/src/managed-usage-limits.ts:197
- **Where to find it:** Command Palette > Code: Compare Plans (labels found in the code)
- **Needs:** a signed-in paid account is best to see the usage rows
- **Steps:**
  1. Press Cmd+Shift+P, type "Compare Plans" and choose "Code: Compare Plans".
  2. Read the usage line of a paid plan, for example "<n>x more usage per session and <m>x more weekly usage than <plan>".
  3. Open Code: Account & Usage (Cmd+Shift+P) and read the usage rows "Current session" and "This week" for the windows.
  4. Compare with Expected: the copy should name which allowance is multiplied, the current session window and the weekly window. No monthly window was found in the code.

## S81.09 Separate feature-access differences.

- **Expected:** Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.
- **Code:** done. Evidence present: packages/contracts/types/src/billing-catalog.ts:402; apps/extension-vscode/src/features/account-auth/planComparison.ts:42
- **Where to find it:** Command Palette > Code: Compare Plans (labels found in the code)
- **Needs:** a signed-in account, ideally on a plan other than the top one, so that the "Adds over" line appears
- **Steps:**
  1. Press Cmd+Shift+P, type "Compare Plans" and choose "Code: Compare Plans".
  2. Read the detail line under each plan: "Includes: ...", "Adds over <plan>: ..." or "No features beyond <plan>".
  3. Compare the feature lists between two plans and check that they differ in features as well as usage.
  4. Compare with Expected: each difference should be listed. The server-side enforcement of each gate is not visible from the extension and needs the web app or a live test.

## S81.14 Separate generation settings.

- **Expected:** Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Command Palette > Code: Open Actions > Model > Effort: <level> (labels found in the code)
- **Needs:** a Free account and a paid account, to compare which options are gated
- **Steps:**
  1. Press Cmd+Shift+P, type "Open Actions" and choose "Code: Open Actions".
  2. Under the "Model" separator, read the "Effort: <level>" row. Its description reads "Set reasoning effort (low / medium / high / max)".
  3. Choose "Switch model…" and see which models are listed.
  4. Compare with Expected: the Effort and model choice should be shown as gated options for some plans. The code does not show a plan gate on these rows, and the server-side clamp of each request is not visible from the UI.

## S81.15 Separate per-model caps.

- **Expected:** Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Command Palette > Code: Account & Usage > "Most capable models" row (labels found in the code)
- **Needs:** a paid account with a flagship weekly allowance; the cap-used message needs the allowance used up
- **Steps:**
  1. Press Cmd+Shift+P, type "Account & Usage" and choose "Code: Account & Usage".
  2. Find the row labelled "Most capable models" with its usage and reset time.
  3. Compare its description and limit with the weekly row "This week".
  4. Compare with Expected: the flagship weekly cap should be shown separately and, when used up, the blocked-request message should appear. The row is shown only when the account has a flagship allowance.

## S81.25 Grace-period behavior.

- **Expected:** When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2338; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Command Palette > Code: Account & Usage > "<plan> subscription: <status>" warning row (labels found in the code)
- **Needs:** a paid account with a subscription that needs attention (for example a failed renewal), which the tester may not be able to create
- **Steps:**
  1. Press Cmd+Shift+P, type "Account & Usage" and choose "Code: Account & Usage".
  2. Look for a warning row "<plan> subscription: <status>" with the description "Paid Cloud capabilities are paused until billing is resolved".
  3. Read the "Manage billing & subscription" row and its description.
  4. Compare with Expected: a failed renewal should show what access remains and how to fix it. The extension shows only that paid capabilities are paused; no grace-period rule or grace length was found for paid plans.

## S81.27 Cross-platform entitlement sharing.

- **Expected:** One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2305; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** no screen of its own. The extension reads the server plan through /api/usage (apps/extension-vscode/src/utils/api.ts); the sharing itself is inner behaviour seen only as matching values.
- **Needs:** the same account signed in on two surfaces (VS Code and the web)
- **Steps:**
  1. Sign in to the VS Code extension with an account that has a paid plan.
  2. Open Command Palette > Code: Account & Usage and note the "Plan: <name>" description on the "Cloud usage" or "Cloud quota" row.
  3. Sign in to the same account on the web, and open its usage page.
  4. Compare with Expected: both surfaces should show the same plan and usage. The per-surface server enforcement is not visible from the UI.

## S81.28 Plan-specific feature explanations.

- **Expected:** Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).
- **Code:** done. Evidence present: packages/contracts/types/src/billing-catalog.ts:402; apps/extension-vscode/src/features/account-auth/planComparison.ts:42
- **Where to find it:** Command Palette > Code: Compare Plans, then the "Adds over" detail of each plan (labels found in the code)
- **Needs:** a signed-in account on a plan below the top plan
- **Steps:**
  1. Press Cmd+Shift+P, type "Compare Plans" and choose "Code: Compare Plans".
  2. Read the detail line of each plan. Plans above your plan show "Adds over <your plan>: <features>", and your plan shows its own features.
  3. Open Code: Open Actions and find "Upgrade for higher capacity" (or run Code: Upgrade Your Plan) to see the upgrade prompt.
  4. Compare with Expected: each plan should explain what it adds, and a blocked feature should say which plan it needs. The blocked-feature wording is in the server copy, not the extension.
