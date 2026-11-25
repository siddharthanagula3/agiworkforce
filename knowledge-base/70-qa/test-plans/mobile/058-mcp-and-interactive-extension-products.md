---
id: "PLAN-mobile-058"
type: "test-plan"
title: "Mobile · 58. MCP and interactive extension products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "58"
---
# Mobile · 58. MCP and interactive extension products

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S58.01 MCP server list.

- **Expected:** The user can see a list of the MCP servers configured for their account or workspace.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:757 (quoted code not found in the file now); apps/mobile/services/connectors.ts:61 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with Connectors access (tier-dependent) and at least one connector or custom MCP server added
- **Steps:**
  1. Open Settings and tap Cloud, then tap Connectors.
  2. Wait for the connector list to load (a loading label may show first).
  3. Look at the filter chips (All, Connected, Custom) and the connector rows; each row shows a status such as Connected or Not connected.
  4. Compare with Expected: your configured MCP servers (custom ones show under the Custom filter) should appear in this list.

## S58.03 Add remote server.

- **Expected:** The user can add a remote MCP server by URL (with optional credentials) and it becomes available to the assistant.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/index.tsx:981; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:109; apps/mobile/services/connectors.ts:183
- **Where to find it:** Settings > Cloud > Connectors > Add custom MCP (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with Connectors access, and a remote MCP server HTTPS URL to test with
- **Steps:**
  1. Open Settings, tap Cloud, then tap Connectors.
  2. Scroll to the bottom of the list and tap Add custom MCP.
  3. In the Add custom MCP connector sheet, type a Name, type an https:// Connector URL, and optionally an Auth token, then tap Add.
  4. Look for the new server in the connector list (filter Custom) with a status; compare with Expected. Tool use in chat is at the + sheet under Connectors (apps/mobile/src/features/chat/components/AddToChatSheet.tsx), not confirmed on device.

## S58.06 Credential configuration.

- **Expected:** The user can supply credentials (token or OAuth sign-in) for an MCP server and they are stored securely.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/index.tsx:981; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:109; apps/mobile/services/connectors.ts:183
- **Where to find it:** Settings > Cloud > Connectors > Add custom MCP (Auth token field); for a listed connector, Settings > Cloud > Connectors > [connector name] > Connect (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with Connectors access, and a valid token or API key or an outside account to sign in to
- **Steps:**
  1. For a custom server: open Settings, tap Cloud, tap Connectors, tap Add custom MCP.
  2. Type the URL and fill the Auth token (optional) field; the field hides the text as you type.
  3. Tap Add, then open the new server and check that it shows as connected.
  4. For a listed connector: open it from the Connectors list and tap Connect. For an API-key connector, enter the key in the sheet and tap Test and save; for an account sign-in connector, follow the sign-in step that opens. Compare with Expected: the token or key is accepted and the connector shows as connected, with no key shown back.

## S58.08 Tool discovery.

- **Expected:** Connecting an MCP server discovers its tools and the user can see them.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:388; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1030
- **Where to find it:** Settings > Cloud > Connectors > [a connected connector] > Tool permissions (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with Connectors access and a connected MCP server or connector
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, and tap a connector that is Connected.
  2. Scroll down to the Tool permissions heading.
  3. Wait for Loading tools to finish; if it fails, tap Retry loading tools.
  4. Look at the groups Read-only tools and Write and delete tools and the tool names under them. Compare with Expected: the connector's tools are listed.

## S58.12 Server health and logs.

- **Expected:** Each server shows its health and the user can read recent logs or call history.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1164
- **Where to find it:** Settings > Cloud > Connectors > [a connected connector] > Connection health (then Recent calls below it) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with Connectors access, a connected connector, and ideally a few tool calls made in chat first
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, and tap a connected connector.
  2. Scroll to the Connection health card and read its state and summary line.
  3. Tap Check again to refresh the health reading.
  4. Scroll to the Recent calls section and read the rows (outcomes Worked, Failed or Blocked here). Compare with Expected: health and recent call history are visible for this server.
