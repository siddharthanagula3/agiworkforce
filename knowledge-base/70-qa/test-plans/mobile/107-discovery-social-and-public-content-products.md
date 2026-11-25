---
id: "PLAN-mobile-107"
type: "test-plan"
title: "Mobile · 107. Discovery, social, and public-content products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "107"
---
# Mobile · 107. Discovery, social, and public-content products

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S107.15 Content reporting.

- **Expected:** A viewer can report a public page or an AI answer as harmful or infringing, and the report reaches the operators.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1128 (quoted code not found in the file now); apps/mobile/services/contentReport.ts:140 (quoted code not found in the file now); apps/web/app/api/mobile/content-report/route.ts:95
- **Where to find it:** Chat: open a conversation > long-press the AI answer > Report… > choose a reason > Save report. Public page: Sites (drawer entry, shown as "Sites") > Shared with you > More options for <site name> > Report > choose a reason > Save report. (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account; an AI answer in a chat; for the Sites path, a site shared with you by a second account and an outside account is not needed
- **Steps:**
  1. Sign in, open a conversation that has an AI answer (not one still streaming).
  2. Long-press the AI answer to open its action menu.
  3. Tap "Report…" in the menu.
  4. Tap a reason such as "Harmful or dangerous" (there is no infringement option; "Other" is the closest), then tap "Save report".
  5. Read the result screen: "Report submitted for review" means it reached the server. "Send this report to AGI?" or "Report saved on this device" means it was kept on the phone; tap "Send" if shown.
  6. For a public page: open Sites, switch to "Shared with you", tap "More options for <name>", tap "Report", then repeat the reason and "Save report" steps and compare the result screen with Expected.
