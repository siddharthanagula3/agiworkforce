---
id: "PLAN-vscode-036"
type: "test-plan"
title: "VS Code · 36. Sources and grounding interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "36"
---
# VS Code · 36. Sources and grounding interface

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S36.04 Source URL or resource identifier.

- **Expected:** Each cited source exposes its URL or resource identifier and can be opened.
- **Code:** done. Evidence present: apps/extension-vscode/src/integrations/localRuntimeClient.ts:1217; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755
- **Where to find it:** Chat panel > turn on Browse the web for current sources > send a question that needs current facts > under the answer, click the "{count} sources" line to expand it (shows as "1 source" or "2 sources") (labels found in the code)
- **Needs:** a signed-in account with web search available on the current route
- **Steps:**
  1. Sign in and open the AGI chat panel in the editor sidebar.
  2. Turn on the attachment option "Browse the web for current sources" in the composer.
  3. Type a question that needs current facts, for example a recent news question, and send it.
  4. When the answer finishes, click the "{count} sources" line under the answer to expand the list.
  5. Hover over each source link to see its full URL in the tooltip, then check that each source shows a title, a hostname and an opening link.
  6. Compare with Expected: each source shows its URL or resource identifier and can be opened.
