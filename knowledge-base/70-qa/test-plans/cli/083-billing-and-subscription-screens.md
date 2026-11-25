---
id: "PLAN-cli-083"
type: "test-plan"
title: "CLI · 83. Billing and subscription screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "83"
---
# CLI · 83. Billing and subscription screens

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S83.14 Payment failure.

- **Expected:** When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:639
- **Where to find it:** Type /usage in the agi session (REPL or TUI). The 'Account usage' block lists 'Subscription: <status>' and, when the status is past_due, unpaid or incomplete, a payment-failed warning with a Settings > Billing link. (labels found in the code)
- **Needs:** A signed-in managed account whose subscription status is past_due, unpaid or incomplete. Getting that status is not described in the code; a Free or local/BYOK session never shows this text.
- **Steps:**
  1. Sign in to a managed (cloud) account with agi login, then start the agi session.
  2. Type /usage and press Enter.
  3. Look under the 'Account usage' heading for a line 'Subscription: past due' (or unpaid or incomplete).
  4. Check that the line 'Your last payment did not go through, so this subscription is past due...' appears.
  5. Check that 'Update your payment method in Settings > Billing:' is followed by a link to the billing page.
  6. Compare with Expected: the user is told clearly and shown how to fix it.
