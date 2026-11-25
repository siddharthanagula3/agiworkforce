---
id: "PLAN-chrome-055"
type: "test-plan"
title: "Chrome · 55. Connector setup and account management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "55"
---
# Chrome · 55. Connector setup and account management

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S55.29 Source-provider attribution.

- **Expected:** Answers or steps that used a connector name the provider that supplied the data.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:844; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1051
- **Where to find it:** Side panel > Plus menu (+) > Connectors to connect an app (it opens the connector directory on the web). Then ask a question that uses the connected app, and read the step row under the answer. (labels found in the code)
- **Needs:** a connected connector (set up from Plus menu > Connectors); an outside account for that app
- **Steps:**
  1. Open the AGI side panel and sign in.
  2. Click the plus (+) button and choose Connectors, which opens the connector directory on the web; connect an app there, then return to the side panel.
  3. In the side panel, send a question that needs the connected app's data.
  4. Wait for the answer, then open or look at the activity steps shown with it.
  5. Look for a step that reads "Using <app name> connector" and confirm it names the app that supplied the data, as Expected says.
