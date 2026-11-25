---
id: "PLAN-desktop-058"
type: "test-plan"
title: "Desktop · 58. MCP and interactive extension products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "58"
---
# Desktop · 58. MCP and interactive extension products

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S58.01 MCP server list.

- **Expected:** The user can see a list of the MCP servers configured for their account or workspace.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/DirectoryPanel.tsx:955; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:343 (quoted code not found in the file now); apps/web/app/api/connectors/custom/route.ts:68
- **Where to find it:** Settings > Connectors (the list shows the section heading "Your custom connectors" and the Installed and Popular sections). Also: Workspace console > MCP servers, which lists "Published MCP servers". (labels found in the code)
- **Needs:** a Free or paid account; a workspace admin account for the workspace MCP list
- **Steps:**
  1. Sign in, open Settings, and click Connectors.
  2. Look for the "Your custom connectors" section and the other connector sections in the list.
  3. Compare with Expected: the list shows the servers configured for the account.
  4. For a workspace view, open the workspace console, click MCP servers, and look at the "Published MCP servers" list.

## S58.03 Add remote server.

- **Expected:** The user can add a remote MCP server by URL (with optional credentials) and it becomes available to the assistant.
- **Code:** done. Evidence present: apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:979; apps/desktop/src/api/cloudConnectors.ts:242
- **Where to find it:** Settings > Connectors > Add > Add custom connector (labels found in the code)
- **Needs:** a remote MCP server URL
- **Steps:**
  1. Sign in, open Settings, and click Connectors.
  2. Click Add, then click Add custom connector.
  3. Type the server address in the field labelled Connector URL, and fill the name if asked.
  4. Click Add.
  5. Compare with Expected: the new server appears under "Your custom connectors" and can be used in chat.

## S58.06 Credential configuration.

- **Expected:** The user can supply credentials (token or OAuth sign-in) for an MCP server and they are stored securely.
- **Code:** done. Evidence present: apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:1088; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:897; apps/desktop/src/services/desktopCloudConnectorInstall.ts:9; apps/desktop/src/api/cloudConnectors.ts:107
- **Where to find it:** Settings > Connectors > Add > Add custom connector (token or OAuth client fields); for an API-key connector, Settings > Connectors > [connector] > Test and save (labels found in the code)
- **Needs:** a token or an OAuth client from the server owner; a sign-in window is opened for OAuth
- **Steps:**
  1. Open Settings > Connectors and click Add > Add custom connector.
  2. Enter the server URL, then fill the token or the OAuth Client ID and Secret fields if the form shows them (Advanced settings in the desktop app).
  3. Click Test and save for an API-key connector, or follow the sign-in window for OAuth.
  4. Compare with Expected: the connector shows as connected, and the secret is not shown again in the form.

## S58.07 Connection test.

- **Expected:** The user can test the connection to an MCP server and see whether it succeeded.
- **Code:** done. Evidence moved: apps/web/app/api/connectors/custom/route.ts:130 (quoted code not found in the file now); apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:179; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [connector] > Test and save (labels found in the code)
- **Needs:** a key or token for the server, or an OAuth sign-in
- **Steps:**
  1. Open Settings > Connectors and click the connector you want to check.
  2. Enter its key or token and click Test and save.
  3. Wait while the button shows Testing the key.
  4. Compare with Expected: a success message starting with "Connected." appears, or an error explains why the test failed.

## S58.08 Tool discovery.

- **Expected:** Connecting an MCP server discovers its tools and the user can see them.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx (text found, layout changed); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [connected connector] > Tools (labels found in the code)
- **Needs:** a connected MCP server that has tools
- **Steps:**
  1. Open Settings > Connectors and click a connector that is connected.
  2. Scroll to the capabilities panel and find the section titled Tools.
  3. Compare with Expected: the connector's tools are listed.
  4. If the list is empty, look for the discovery error text instead.

## S58.09 Resource discovery.

- **Expected:** The product discovers an MCP server's resources and lets the user browse or attach them.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:227; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:233; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [connected connector] > Resources (labels found in the code)
- **Needs:** a connected MCP server that offers resources
- **Steps:**
  1. Open a connected connector in Settings > Connectors.
  2. Scroll to the section titled Resources.
  3. Click a listed resource to look at it.
  4. Compare with Expected: the server's resources are listed and can be opened.

## S58.10 Prompt discovery where supported.

- **Expected:** Where a server offers prompts, the product lists them and lets the user run one.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:251; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:345; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [connected connector] > Prompts (labels found in the code)
- **Needs:** a connected MCP server that offers prompts
- **Steps:**
  1. Open a connected connector that offers prompts.
  2. Scroll to the section titled Prompts.
  3. Look at the listed prompts, and at the Templates section if the server offers templates.
  4. Compare with Expected: the prompts appear and the user can pick one.

## S58.11 Server capability inspector.

- **Expected:** The user can inspect a server's capabilities (protocol, tools, resources, prompts, extensions).
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:114 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:83; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [connected connector] (labels found in the code)
- **Needs:** a connected MCP server
- **Steps:**
  1. Open a connected connector in Settings > Connectors.
  2. Read the capability panel: the Protocol row shows the MCP version, and the panel lists Tools, Resources, Templates and Prompts.
  3. Compare with Expected: protocol, tools, resources and prompts are all visible.
  4. Extensions were not found as a section.

## S58.12 Server health and logs.

- **Expected:** Each server shows its health and the user can read recent logs or call history.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1259; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:377; apps/web/app/api/connectors/calls/route.ts:26
- **Where to find it:** Settings > Connectors > Connector health; and Settings > Connectors > [connector] > Tool permissions > Recent calls (labels found in the code)
- **Needs:** a connected server that has been called for the log to show entries
- **Steps:**
  1. Open Settings > Connectors and look at the Connector health section.
  2. Read each connector's state: Responding, Degraded, Not responding or Not called yet.
  3. Click a connector, then click Tool permissions, and scroll to Recent calls.
  4. Compare with Expected: the health state and the recent call list (or an empty message) are shown.

## S58.13 Enable/disable server.

- **Expected:** The user can disable a configured server without removing it, and re-enable it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:166; apps/web/app/api/settings/organization/mcp/route.ts:257
- **Where to find it:** Chat > composer + menu > Connectors > toggle a connector row (labels found in the code)
- **Needs:** at least one connected connector
- **Steps:**
  1. Open a chat and click the + button in the composer (aria label More composer options).
  2. Click the Connectors row.
  3. Switch a connected connector's toggle off, then check it is off.
  4. Switch it back on and compare with Expected: the connector is disabled without being removed, and re-enabled.

## S58.15 Organization-approved server catalog.

- **Expected:** An organization admin maintains a catalog of approved MCP servers that members can use.
- **Code:** done. Evidence present: apps/web/app/workspace/mcp/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceMcpServers.tsx:34; apps/web/app/api/settings/organization/mcp/route.ts:131
- **Where to find it:** Workspace console > MCP servers (the approved list uses Publish to everyone, Unpublish and Retire for everyone) (labels found in the code)
- **Needs:** a workspace admin account and a second member account to see the result
- **Steps:**
  1. Sign in with a workspace admin account and open the workspace console.
  2. Click MCP servers.
  3. Click Publish to everyone on a server, then check the list shows Published to everyone.
  4. Compare with Expected: the approved list is visible to members; retiring asks for confirmation first.

## S58.17 Interactive MCP app panel.

- **Expected:** A tool result that ships an MCP App renders as an interactive panel inside the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:433
- **Where to find it:** Chat > a reply that shows a connected app card (it appears after the assistant uses an MCP tool that ships an app) (labels found in the code)
- **Needs:** a connected MCP server that ships an app UI
- **Steps:**
  1. Open a chat with a connected MCP server that ships an app and ask the assistant to use it.
  2. Look for the app card inside the reply.
  3. Compare with Expected: the app renders as an interactive panel in the chat.
  4. If it fails, read the error text.

## S58.18 Embedded app initialization.

- **Expected:** The host initializes the embedded app with the standard handshake before it runs.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:268; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:371
- **Where to find it:** no screen of its own. The handshake is not visible; only the success or failure of the card is.
- **Needs:** a connected MCP app
- **Steps:**
  1. Open a chat reply that shows an app card.
  2. Wait for the app to load and show its content.
  3. If the handshake fails, the card shows the error MCP App failed to load instead.

## S58.19 Host-to-widget state.

- **Expected:** The host passes the tool input, result and host context (theme, display mode) to the widget.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:221 (quoted code not found in the file now); apps/web/features/chat/components/messages/cards/McpAppCard.tsx:274
- **Where to find it:** no screen of its own. Theme and display mode were not confirmed visually.
- **Needs:** a connected MCP app
- **Steps:**
  1. Open a chat reply that shows an app card that uses a tool result.
  2. Check that the app shows the data from that tool result.
  3. When it asks to run a tool, read the sentence This App wants to run followed by the tool name.

## S58.20 Widget-to-host actions.

- **Expected:** The widget can call server tools and read resources through the host, with approval for tool calls.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:283; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:455
- **Where to find it:** Chat > app card > approval prompt (This App wants to run [tool name]) > Allow once or Deny (labels found in the code)
- **Needs:** a connected MCP app that asks for a tool call
- **Steps:**
  1. Open a chat with a connected app card that asks to run a tool.
  2. Read the message This App wants to run followed by the tool name.
  3. Click Allow once to approve that one call, or Deny to refuse it.
  4. Compare with Expected: the approved call runs through the host, and a denied call is refused.

## S58.21 Widget resizing.

- **Expected:** The widget can request a new height and the host resizes it within limits.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:329
- **Where to find it:** no screen of its own. The size limits were not confirmed on screen.
- **Needs:** a connected MCP app that asks to resize
- **Steps:**
  1. Open a chat reply that shows an app card that changes size.
  2. Watch the card height change as the app loads or its content changes.
  3. Check that the card stays within a limit and does not take over the whole chat.

## S58.22 Widget authentication.

- **Expected:** The widget acts as the signed-in user without handling credentials itself.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:54 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/mcp/route.ts:69 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Credentials are handled by the server route apps/web/app/api/connectors/[connectorId]/mcp/route.ts, not by the card.
- **Needs:** a signed-in account and a connected MCP app
- **Steps:**
  1. Open a chat reply that shows an app card that calls a server tool.
  2. Use the app and check that it does not ask for a password or token.
  3. Compare with Expected: the actions run as the signed-in user.

## S58.23 Viewer-specific authorization.

- **Expected:** An app's payload and actions are authorized for the viewing user only.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts:24; apps/web/lib/connectors/mcp-state-store.ts:78
- **Where to find it:** no screen of its own. The payload route is apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts; the viewer check was not traced fully.
- **Needs:** a second account in the same workspace
- **Steps:**
  1. Sign in as user A and open a chat with an app card; note what it shows.
  2. Sign in as user B (a second account) and open the same app payload.
  3. Compare with Expected: user B does not see or act on user A's payload.

## S58.28 Schema/version compatibility diagnostics.

- **Expected:** The product reports protocol/schema version mismatches or partial compatibility for a server.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:114 (quoted code not found in the file now); apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:365; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:117
- **Where to find it:** Settings > Connectors > [connected connector] > the Protocol row in the capabilities panel (labels found in the code)
- **Needs:** a connected MCP server that has a version or schema mismatch, if one is available
- **Steps:**
  1. Open a connected connector in Settings > Connectors.
  2. Read the Protocol row and the MCP version it shows.
  3. Look for any rejected tools with a reason in the capability panel.
  4. Compare with Expected: a version or partial compatibility problem is reported for the server.
