---
id: "PLAN-vscode-055"
type: "test-plan"
title: "VS Code · 55. Connector setup and account management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "55"
---
# VS Code · 55. Connector setup and account management

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S55.06 Read/write capability explanation.

- **Expected:** Before connecting, the user sees in plain language what the connector can read and what it can change.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/connectors/connectorPresentation.ts:51
- **Where to find it:** Sidebar "More" button (icon only, tooltip "More") > Connectors, then select a connector row. Or Command Palette > Code: Show Connectors. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account; a connector that is listed but not connected yet (its scopes must come from the server)
- **Steps:**
  1. Sign in to AGI Cloud in the AGI sidebar. Connectors need a signed-in account.
  2. Click the "More" icon at the top of the AGI sidebar.
  3. Click "Connectors" in the menu. A list opens titled "Code, Connectors".
  4. Hover over a connector row, or select it, and read the detail text. Look for the lines "Can make changes: ..." and "Can read only: ...", plus the line "Connecting and disconnecting happen in the browser, not in VS Code."
  5. Compare with Expected: before connecting, the read and change lines should say in plain words what the connector can read and change.

## S55.17 Granted-scope display.

- **Expected:** After connecting, the user can see which scopes/permissions were actually granted.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2665; apps/extension-vscode/src/features/connectors/connectorPresentation.ts:62; apps/extension-vscode/src/features/connectors/connectorsClient.ts:33
- **Where to find it:** Sidebar "More" button (icon only, tooltip "More") > Connectors, then select a connected connector row. Or Command Palette > Code: Show Connectors. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one connector connected on the web app; a connector that has scopes
- **Steps:**
  1. Sign in to AGI Cloud and connect a connector on the web app first (Connectors are set up on the web, not in VS Code).
  2. Click the "More" icon at the top of the AGI sidebar, then click "Connectors".
  3. Hover over or select the connector row. Read the detail text after the connector name.
  4. Look for "Can make changes: ...", "Can read only: ..." and "Other access: ...", which list the scope names the server returned.
  5. Compare with Expected: the scopes shown should be the ones granted on the account, and they should match what the web app shows.

## S55.18 Connection health.

- **Expected:** Each connector shows whether it is healthy, needs reauthorization or is not responding.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2665; apps/extension-vscode/src/features/connectors/connectorPresentation.ts:11; apps/extension-vscode/src/features/connectors/connectorPresentation.ts:40; apps/extension-vscode/src/features/connectors/connectorsClient.ts:33
- **Where to find it:** Sidebar "More" button (icon only, tooltip "More") > Connectors. Each connector row shows its health in the row description, after the connector name. (labels found in the code)
- **Needs:** a signed-in AGI Cloud account; a connector in a "needs reauthorization" or "not responding" state to see those states (they come from the server and are hard to make on demand)
- **Steps:**
  1. Sign in to AGI Cloud with at least one connector connected on the web app.
  2. Click the "More" icon at the top of the AGI sidebar, then click "Connectors".
  3. Read the description on each connector row. The first words are the health state, such as "Connected", "Needs reauthorization", "Not responding", "Not connected", "Not configured here" or "Not available on the web app".
  4. To refresh, click the refresh control in the list title (tooltip "Refresh connectors") and read the rows again.
  5. Compare with Expected: each connector should show whether it is healthy, needs reauthorization or is not responding.
