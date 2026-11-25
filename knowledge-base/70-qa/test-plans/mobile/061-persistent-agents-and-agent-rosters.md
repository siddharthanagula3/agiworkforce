---
id: "PLAN-mobile-061"
type: "test-plan"
title: "Mobile · 61. Persistent agents and agent rosters"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "61"
---
# Mobile · 61. Persistent agents and agent rosters

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S61.18 Human escalation.

- **Expected:** An agent can escalate a decision to the user and wait for the answer.
- **Code:** done. Evidence present: apps/web/lib/services/agent-notification-service.ts:94; apps/mobile/app/(app)/tasks.tsx:8
- **Where to find it:** Drawer (side menu) > AGI Work > open the task card that says "Waiting for connector input" > the sheet shows "<connector name> needs your input" with a "Send answer" button (labels found in the code)
- **Needs:** a Cloud-unlocked account and a running task that has paused to ask a connector for input (hard to trigger on demand; the agent must ask a question through a connector)
- **Steps:**
  1. Sign in and switch to AGI Cloud mode, then open the side menu.
  2. Tap "AGI Work". The list shows Cloud task cards.
  3. Find a task whose card says "Waiting for connector input" and tap it to open the task sheet.
  4. In the sheet, find the form headed "<connector name> needs your input" (or "Needs your input" when the connector has no name). Fill in the fields.
  5. Tap "Send answer" (or "Decline" or "Cancel" to refuse). Check that the note "Sent. The reply continues once every request in it is answered." appears and the task moves on, matching Expected: the agent asks, waits, and continues after the answer.
