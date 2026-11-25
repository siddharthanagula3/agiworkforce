# Area 58. MCP and interactive extension products

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S58.01 MCP server list.
- Should: The user can see a list of the MCP servers configured for their account or workspace.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: packages/ui/ui/src/directory/DirectoryPanel.tsx:660; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:343; apps/web/app/api/connectors/custom/route.ts:55; apps/mobile/src/features/settings/cloud-connectors/index.tsx:757; apps/mobile/services/connectors.ts:61; apps/cli/src/lib.rs:1363; apps/cli/src/lib.rs:2485; apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:81

## S58.02 Add local server.
- Should: The user can register a local (stdio) MCP server that the product starts on their machine.
- Status: cli done, vscode missing
- Code: apps/cli/src/lib.rs:1338; apps/cli/src/lib.rs:2453

## S58.03 Add remote server.
- Should: The user can add a remote MCP server by URL (with optional credentials) and it becomes available to the assistant.
- Status: web done, desktop done, mobile done, cli done, vscode missing
- Code: packages/ui/ui/src/settings-modal/SettingsModal.tsx:486; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:699; apps/web/app/api/connectors/custom/route.ts:108; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:914; apps/desktop/src/api/cloudConnectors.ts:237; apps/mobile/src/features/settings/cloud-connectors/index.tsx:908; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:108; apps/mobile/services/connectors.ts:102

## S58.04 Server configuration editor.
- Should: The user can view and edit an existing MCP server's configuration (URL, transport, arguments).
- Status: cli done
- Code: apps/cli/src/lib.rs:1359; apps/cli/src/lib.rs:2505

## S58.05 Environment-variable configuration.
- Should: The user can set environment variables for an MCP server from the product.
- Status: cli done, vscode missing
- Code: apps/cli/src/lib.rs:1550; apps/cli/src/lib.rs:3215

## S58.06 Credential configuration.
- Should: The user can supply credentials (token or OAuth sign-in) for an MCP server and they are stored securely.
- Status: web done, desktop done, mobile done, cli done, vscode missing
- Code: packages/ui/ui/src/settings-modal/SettingsModal.tsx:732; packages/ui/ui/src/settings-modal/SettingsModal.tsx:750; apps/web/app/api/connectors/custom/route.ts:186; apps/web/app/api/connectors/oauth/start/route.ts:186; apps/web/lib/connectors/mcp-discovery.ts:183; apps/web/lib/user-connector-tools.ts:965; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:805; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:1023

## S58.07 Connection test.
- Should: The user can test the connection to an MCP server and see whether it succeeded.
- Status: web done, desktop done, cli done, vscode done
- Code: apps/web/app/api/connectors/custom/route.ts:130; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:96; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31; apps/cli/src/repl/registry.rs:1320; apps/cli/src/tui/tui_app.rs:5309; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:567; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:513

## S58.08 Tool discovery.
- Should: Connecting an MCP server discovers its tools and the user can see them.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:131; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:356; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:925; apps/cli/src/repl/registry.rs:1252; apps/cli/src/tui/tui_app.rs:3996; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:561

## S58.09 Resource discovery.
- Should: The product discovers an MCP server's resources and lets the user browse or attach them.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing
- Code: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:133; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:139; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31

## S58.10 Prompt discovery where supported.
- Should: Where a server offers prompts, the product lists them and lets the user run one.
- Status: web done, desktop done, mobile missing, cli done, vscode missing
- Code: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:157; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:215; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:31; apps/cli/src/tui/tui_app.rs:402; apps/cli/src/tui/tui_app.rs:4087

## S58.11 Server capability inspector.
- Should: The user can inspect a server's capabilities (protocol, tools, resources, prompts, extensions).
- Status: web done, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:114; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:46; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786; apps/cli/src/repl/registry.rs:1489; apps/cli/src/repl/registry.rs:1516; apps/cli/src/app_server/surfaces.rs:659; apps/cli/src/mcp/mod.rs:784; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:590

## S58.12 Server health and logs.
- Should: Each server shows its health and the user can read recent logs or call history.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:844; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:247; apps/web/app/api/connectors/calls/route.ts:25; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1121; apps/cli/src/repl/registry.rs:1489; apps/cli/src/mcp/mod.rs:788; apps/cli/src/app_server/surfaces.rs:659; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:37

## S58.13 Enable/disable server.
- Should: The user can disable a configured server without removing it, and re-enable it.
- Status: web done, desktop done, mobile missing, cli done, vscode missing
- Code: apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx:155; apps/web/app/api/settings/organization/mcp/route.ts:254; apps/cli/src/repl/registry.rs:1303; apps/cli/src/tui/tui_app.rs:5309

## S58.14 Per-Project server configuration.
- Should: MCP servers can be configured per project so they load only in that project.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done
- Code: apps/cli/src/tui/tui_app.rs:3619; apps/cli/src/mcp/mod.rs:1074; apps/cli/src/mcp/mod.rs:544; apps/extension-vscode/src/features/surfaces/surfaceMenu.ts:81; apps/extension-vscode/src/integrations/localRuntimeClient.ts:1050; apps/extension-vscode/src/integrations/localRuntimeClient.ts:314

## S58.15 Organization-approved server catalog.
- Should: An organization admin maintains a catalog of approved MCP servers that members can use.
- Status: web done, desktop done
- Code: apps/web/app/workspace/mcp/page.tsx:16; apps/web/features/workspace-console/components/WorkspaceMcpServers.tsx:34; apps/web/app/api/settings/organization/mcp/route.ts:132

## S58.16 Private-network connector route.
- Should: Where offered, an MCP server on a private network can be reached through a supported route.
- Status: web missing, desktop missing, mobile missing, cli done, chrome missing
- Code: apps/cli/src/lib.rs:1337; apps/cli/src/mcp/registry.rs:261

## S58.17 Interactive MCP app panel.
- Should: A tool result that ships an MCP App renders as an interactive panel inside the chat.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:301

## S58.18 Embedded app initialization.
- Should: The host initializes the embedded app with the standard handshake before it runs.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:139; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:261

## S58.19 Host-to-widget state.
- Should: The host passes the tool input, result and host context (theme, display mode) to the widget.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:221; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:145

## S58.20 Widget-to-host actions.
- Should: The widget can call server tools and read resources through the host, with approval for tool calls.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:154; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:320

## S58.21 Widget resizing.
- Should: The widget can request a new height and the host resizes it within limits.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:215

## S58.22 Widget authentication.
- Should: The widget acts as the signed-in user without handling credentials itself.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:54; apps/web/app/api/connectors/[connectorId]/mcp/route.ts:69

## S58.23 Viewer-specific authorization.
- Should: An app's payload and actions are authorized for the viewing user only.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2159; apps/web/app/api/mcp-apps/payload/[payloadId]/route.ts:25; apps/web/lib/connectors/mcp-state-store.ts:88

## S58.24 Site-provided tools such as WebMCP as a distinct category.
- Should: Tools a website provides (e.g. WebMCP) appear to the assistant as their own category, distinct from connectors.
- Status: cli missing, chrome done
- Code: apps/extension/src/background.ts:4325; apps/extension/src/features/computer-use/agentLoop.ts:527

## S58.25 Tool availability changing with site state.
- Should: When the page state changes, the set of site-provided tools available to the assistant updates.
- Status: cli missing, chrome done
- Code: apps/extension/src/features/computer-use/agentLoop.ts:636; apps/extension/src/background.ts:4326

## S58.26 Extension debugging console.
- Should: Extension developers get a console to watch MCP traffic and debug their server.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S58.27 Developer-mode connection flow.
- Should: A developer can connect an in-development server (e.g. localhost) through a developer-mode flow.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/mcp/registry.rs:349; apps/cli/src/lib.rs:1338

## S58.28 Schema/version compatibility diagnostics.
- Should: The product reports protocol/schema version mismatches or partial compatibility for a server.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing
- Code: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:114; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:234; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:75
