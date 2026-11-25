---
id: "PLAN-vscode-083"
type: "test-plan"
title: "VS Code · 83. Billing and subscription screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "83"
---
# VS Code · 83. Billing and subscription screens

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S83.14 Payment failure.

- **Expected:** When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2338; apps/extension-vscode/src/utils/api.ts:1544
- **Where to find it:** Command Palette > Code: Account & Usage, then the row "subscription:" with a warning icon (under the plan name) (labels found in the code)
- **Needs:** a paid AGI Cloud account whose subscription is not active (a failed payment cannot be produced on demand from the tester's side)
- **Steps:**
  1. Sign in to AGI Cloud from the Command Palette with Code: Sign In to AGI Cloud, using an account whose paid subscription is not active.
  2. Open the Command Palette and run Code: Account & Usage.
  3. Look for a row that starts with the plan name and "subscription:" and a warning icon, with the description "Paid Cloud capabilities are paused until billing is resolved".
  4. Look for the row "Manage billing & subscription"; when the subscription needs attention its description reads "Restore paid Cloud access on Web", which is the fix path.
  5. Compare with Expected: the failure is shown clearly and the way to fix it is shown.

## S83.23 Scheduled cancellation.

- **Expected:** A scheduled (end-of-period) cancellation is shown with its date.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2418
- **Where to find it:** Command Palette > Code: Account & Usage, then the "AGI Cloud account" section rows (organization row with the plan, and "Manage billing & subscription") (labels found in the code)
- **Needs:** a paid AGI Cloud account with a scheduled end-of-period cancellation (the tester cannot create this on demand; the account must already be in that state)
- **Steps:**
  1. Sign in to AGI Cloud with an account that has a paid plan with a scheduled cancellation at period end.
  2. Open the Command Palette and run Code: Account & Usage.
  3. Look in the "AGI Cloud account" section for the organization row: its description reads "<plan name> plan · ends <date>" and its detail reads "Access remains active through <date>, then the plan ends".
  4. Look at the "Manage billing & subscription" row: its description reads "Access ends <date>; review or resume the plan on Web" when the end date is known.
  5. Compare with Expected: the cancellation is shown with its end date.
