---
id: "PLAN-chrome-083"
type: "test-plan"
title: "Chrome · 83. Billing and subscription screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "83"
---
# Chrome · 83. Billing and subscription screens

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S83.14 Payment failure.

- **Expected:** When a payment fails, the user is told clearly (checkout or renewal) and shown how to fix it.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13434; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:269
- **Where to find it:** Side panel > chat composer gate (shown when the paid subscription is past due or otherwise not active) > Manage billing (labels found in the code)
- **Needs:** a paid account whose subscription is past due (a Free account cannot reach this)
- **Steps:**
  1. Sign in to the AGI side panel with an account whose paid subscription is past due (payment failed at renewal).
  2. Open the chat in the side panel and look at the composer area where the Managed Cloud gate appears.
  3. Read the message. It should say "Update billing to restore Managed Cloud chat." (for other non-active statuses it says "Your subscription is <status>. Update billing to restore Managed Cloud chat.").
  4. Click the "Manage billing" button.
  5. Check that a new browser tab opens on the billing settings page (/settings/billing) so the user can fix the payment, and that the message matches Expected.
