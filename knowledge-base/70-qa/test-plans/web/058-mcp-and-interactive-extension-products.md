---
id: "PLAN-web-058"
type: "test-plan"
title: "Web · 58. MCP and interactive extension products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "58"
---
# Web · 58. MCP and interactive extension products

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S58.01 MCP server list.

- **Expected:** The user can see a list of the MCP servers configured for their account or workspace.
- **Code:** done. Evidence moved: packages/ui/ui/src/directory/DirectoryPanel.tsx:955; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:343 (quoted code not found in the file now); apps/web/app/api/connectors/custom/route.ts:68
- **Where to find it:** Settings > Connectors (tabs All, Connected, Not connected) (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Sign in, open Settings, then open Connectors.
  2. Look at the connector list. Check the Connected tab.
  3. Compare with Expected: the connectors configured for the account appear in the list, and the Connected tab shows the ones linked to it.

## S58.03 Add remote server.

- **Expected:** The user can add a remote MCP server by URL (with optional credentials) and it becomes available to the assistant.
- **Code:** done. Evidence moved: packages/ui/ui/src/settings-modal/SettingsModal.tsx:600; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1062; apps/web/app/api/connectors/custom/route.ts:108 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Add > Add custom connector (labels found in the code)
- **Needs:** a remote MCP server URL
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Add, then Add custom connector.
  3. Type a name in My connector and a remote MCP server URL in Remote MCP server URL, then click Add connector.
  4. Look for the new server in the Connectors list, and ask the assistant to use one of its tools.

## S58.06 Credential configuration.

- **Expected:** The user can supply credentials (token or OAuth sign-in) for an MCP server and they are stored securely.
- **Code:** done. Evidence moved: packages/ui/ui/src/settings-modal/SettingsModal.tsx:836; packages/ui/ui/src/settings-modal/SettingsModal.tsx:854; apps/web/app/api/connectors/custom/route.ts:186 (quoted code not found in the file now); apps/web/app/api/connectors/oauth/start/route.ts:211; apps/web/lib/connectors/mcp-discovery.ts:188; apps/web/lib/user-connector-tools.ts:1040; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:805 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Add > Add custom connector > Advanced settings (labels found in the code)
- **Needs:** a remote MCP server that uses a token or OAuth
- **Steps:**
  1. Open Add custom connector as in S58.03.
  2. Fill the required fields. Look at the Bearer token field if it is shown.
  3. Click Advanced settings to show OAuth Client ID and OAuth Client Secret.
  4. Check the help text: Sent only to this MCP server and never shown again. Compare with Expected.

## S58.07 Connection test.

- **Expected:** The user can test the connection to an MCP server and see whether it succeeded.
- **Code:** done. Evidence moved: apps/web/app/api/connectors/custom/route.ts:130 (quoted code not found in the file now); apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:179; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No Test connection control was found. Discovery runs on connect and shows Retry discovery on failure (ConnectorCapabilitiesPanel.tsx). Searched for Test connection, Test and Connection in connectors features.
- **Needs:** a connected MCP server

## S58.08 Tool discovery.

- **Expected:** Connecting an MCP server discovers its tools and the user can see them.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx (text found, layout changed); apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [a connected connector] > Tools (labels found in the code)
- **Needs:** a connected MCP server
- **Steps:**
  1. Open Settings, then Connectors, then Connected.
  2. Click a connected connector.
  3. Look for the Tools group with its list of tool names.
  4. Compare with Expected: connecting shows the tools the server offers.

## S58.09 Resource discovery.

- **Expected:** The product discovers an MCP server's resources and lets the user browse or attach them.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:227; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:233; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [a connected connector] > Resources (labels found in the code)
- **Needs:** a connected MCP server that offers resources
- **Steps:**
  1. Open a connected connector as in S58.08.
  2. Look for the Resources group.
  3. Click a resource to attach it, then compare with Expected.

## S58.10 Prompt discovery where supported.

- **Expected:** Where a server offers prompts, the product lists them and lets the user run one.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:251; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:345; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [a connected connector] > Prompts (labels found in the code)
- **Needs:** a connected MCP server that offers prompts
- **Steps:**
  1. Open a connected connector as in S58.08.
  2. Look for the Prompts group.
  3. Click a prompt to run it, fill its arguments if asked, then compare with Expected.

## S58.11 Server capability inspector.

- **Expected:** The user can inspect a server's capabilities (protocol, tools, resources, prompts, extensions).
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:114 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:83; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > [a connected connector] > Compatibility (labels found in the code)
- **Needs:** a connected MCP server
- **Steps:**
  1. Open a connected connector as in S58.08.
  2. Read the Protocol line and the Tools, Resources and Prompts groups.
  3. Open the Compatibility section and compare with Expected.

## S58.12 Server health and logs.

- **Expected:** Each server shows its health and the user can read recent logs or call history.
- **Code:** done. Evidence present: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1259; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:377; apps/web/app/api/connectors/calls/route.ts:26
- **Where to find it:** Settings > Connectors > [a connected connector] > Recent calls (labels found in the code)
- **Needs:** a connected MCP server that has been used
- **Steps:**
  1. Open a connected connector as in S58.08.
  2. Find the Recent calls section at the bottom.
  3. Use a connector tool in chat, then reopen Recent calls and compare with Expected.

## S58.13 Enable/disable server.

- **Expected:** The user can disable a configured server without removing it, and re-enable it.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:166; apps/web/app/api/settings/organization/mcp/route.ts:257
- **Where to find it:** Composer + menu > Connectors > toggle the connector row (labels found in the code)
- **Needs:** a connected MCP server
- **Steps:**
  1. Open the + button in the message box.
  2. Click Connectors.
  3. Switch the connector row off, then on, and compare with Expected.

## S58.15 Organization-approved server catalog.

- **Expected:** An organization admin maintains a catalog of approved MCP servers that members can use.
- **Code:** done. Evidence present: apps/web/app/workspace/mcp/page.tsx:17; apps/web/features/workspace-console/components/WorkspaceMcpServers.tsx:34; apps/web/app/api/settings/organization/mcp/route.ts:131
- **Where to find it:** Workspace > Connectors > MCP servers (labels found in the code)
- **Needs:** a workspace admin account
- **Steps:**
  1. Sign in as a workspace admin and open Workspace administration.
  2. Click MCP servers under Connectors.
  3. Read the list under Published MCP servers and the states Published to everyone or Draft, not yet published.
  4. Click Publish to everyone or Unpublish and compare with Expected.

## S58.17 Interactive MCP app panel.

- **Expected:** A tool result that ships an MCP App renders as an interactive panel inside the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:433
- **Where to find it:** Chat > a message where a connected server's app tool runs (labels found in the code)
- **Needs:** a connected MCP server that ships an app
- **Steps:**
  1. Send a message that asks the assistant to use a connected server's app tool.
  2. Look for an interactive panel inside the reply.
  3. Compare with Expected: the app panel renders in the chat.

## S58.18 Embedded app initialization.

- **Expected:** The host initializes the embedded app with the standard handshake before it runs.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:268; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:371
- **Where to find it:** no screen of its own. Handshake happens inside the embedded app panel; its effect is seen only when the app panel loads in chat (S58.17).
- **Needs:** a connected MCP server that ships an app

## S58.19 Host-to-widget state.

- **Expected:** The host passes the tool input, result and host context (theme, display mode) to the widget.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:221 (quoted code not found in the file now); apps/web/features/chat/components/messages/cards/McpAppCard.tsx:274
- **Where to find it:** no screen of its own. Host passes input, result and theme to the widget; visible only as the panel showing its content (S58.17).
- **Needs:** a connected MCP server that ships an app

## S58.20 Widget-to-host actions.

- **Expected:** The widget can call server tools and read resources through the host, with approval for tool calls.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:283; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:455
- **Where to find it:** Chat > app panel > Allow once / Deny prompt (labels found in the code)
- **Needs:** a connected MCP server that ships an app and asks for an action
- **Steps:**
  1. Open an app panel in chat as in S58.17.
  2. When the app asks for a device or tool action, read the prompt.
  3. Click Allow once or Deny and compare with Expected.

## S58.21 Widget resizing.

- **Expected:** The widget can request a new height and the host resizes it within limits.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:329
- **Where to find it:** no screen of its own. Height changes show as the panel resizing inside the chat (S58.17).
- **Needs:** a connected MCP server that ships an app

## S58.22 Widget authentication.

- **Expected:** The widget acts as the signed-in user without handling credentials itself.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:54 (quoted code not found in the file now); apps/web/app/api/connectors/[connectorId]/mcp/route.ts:69 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Credentials are handled by the host; no control in the UI. Only the result of using the app is visible.
- **Needs:** a connected MCP server that ships an app

## S58.23 Viewer-specific authorization.

- **Expected:** An app's payload and actions are authorized for the viewing user only.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2983; apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts:24; apps/web/lib/connectors/mcp-state-store.ts:78
- **Where to find it:** no screen of its own. Authorization is enforced by the server; visible only as the app loading or refusing for a given account.
- **Needs:** two accounts, one that can see an app and one that cannot

## S58.28 Schema/version compatibility diagnostics.

- **Expected:** The product reports protocol/schema version mismatches or partial compatibility for a server.
- **Code:** done. Evidence moved: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:114 (quoted code not found in the file now); apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:365; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:117
- **Where to find it:** Settings > Connectors > [a connected connector] > Compatibility (labels found in the code)
- **Needs:** a connected MCP server with a partial or older protocol
- **Steps:**
  1. Open a connected connector as in S58.08.
  2. Open the Compatibility section.
  3. Read the Unavailable during discovery line if shown, and compare with Expected.
