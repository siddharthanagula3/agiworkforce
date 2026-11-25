---
id: "GAPS-AREA-058"
type: "gap-list"
title: "Gaps: MCP and interactive extension products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 58. MCP and interactive extension products

95 open gaps that touch this area. Area page: [20-features/058-mcp-and-interactive-extension-products](../../20-features/058-mcp-and-interactive-extension-products/README.md).

## CMP-C292

**Add an MCP server from JSON**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: agi mcp add takes flags only; there is no JSON form.
- Evidence: apps/cli/src/lib.rs:2122

## CMP-C294

**Admin-provided MCP servers**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Admins can restrict servers but not push their own to users.
- Evidence: searched: managedMcpServers in apps/cli/src/cloud, features/hooks/managed.rs

## CMP-C304

**Import MCP servers from Claude Desktop**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: agi migrate claude reads Claude Code; no Claude Desktop config import.
- Evidence: searched: claude_desktop_config in apps/cli/src

## CMP-C331

**Packaged MCP bundles (.mcpb) in plugins**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: Plugins declare stdio command servers only; bundles are not unpacked.
- Evidence: searched: mcpb, dxt in apps/cli/src; apps/cli/src/features/plugins/plugins.rs:132

## CMP-C346

**Pre-approve project MCP servers in settings**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: Project servers always ask and re-ask when the launch changes; no setting skips the prompt. Deliberate safety rule.
- Evidence: apps/cli/src/mcp/consent.rs:1062

## CMP-CP144

**Project MCP server approval and reset**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: No reset-choices command found Each project server needs approval pinned to its exact launch and files; no reset-choices command found.
- Evidence: apps/cli/src/mcp/consent.rs:1

## CMP-CP186

**Admin allow and deny lists for MCP servers**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: No deny list or command matching Workspace admin can switch MCP off or limit it to listed servers and hosts, enforced at start; no deny list or command matching.
- Evidence: apps/cli/src/cloud/workspace_policy.rs:414; apps/cli/src/claude_parity.rs:2320

## CMP-CP189

**MCP OAuth scopes, preset client and callback port**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: No CIMD and no per-login scope flag OAuth config accepts scope, client ID, secret and redirect URI, and falls back to dynamic registration; no CIMD and no per-login scope flag.
- Evidence: apps/cli/src/mcp/mod.rs:79; crates/agiworkforce-mcp/src/config.rs:12

## CMP-D88

**Desktop extensions (.mcpb) directory and install**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: No extension package format, directory or custom install exists.
- Evidence: searched: mcpb, dxt, Extension Developer in apps/desktop, apps/web/features

## CMP-DP93

**Plugin install scope: you, a repository or local**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: There is no per-repository scope Plugins install per user or are set per workspace group by an admin; there is no per-repository scope.
- Evidence: apps/web/features/workspace-console/components/WorkspacePlugins.tsx

## CMP-DP94

**Reload plugins, skills and MCP servers mid-session**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: It is a repair button in the plugin screen, no There is a reload: when an enabled plugin's skills did not load, the directory shows 'Reload skills' (apps/web/features/directory/constants.ts:172-174; action built at apps/web/features/directory/hooks/useDirectoryAdapter.ts:1783-1789, run: loadSkills). It is a repair button in the plugin screen, no
- Evidence: searched: reload-plugins, reloadPlugins in apps/web, packages/ui

## CMP-V49

**Install plugins for me, for a repository or for one folder**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: The editor installs a plugin only into the user scope; there is no project or local scope choice.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:279-300

## CMP-V51

**Plugin options dialog with masked secrets**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: Installing a plugin asks only for its source and pin; there is no options dialog for plugin settings.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:279-300; searched: userConfig in apps/cli/src

## CMP-VP51

**Skills from user, project, nested and plugin folders**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: There is no admin-managed or account-synced location Skills load from user, project and plugin locations and the list shows each scope; there is no admin-managed or account-synced location.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:217-247

## CMP-VP52

**Admin allowlist of approved MCP servers**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Stdio servers have no matcher and are refused when a list is active A workspace admin can turn MCP off or allow listed hosts only; stdio servers have no matcher and are refused when a list is active.
- Evidence: apps/cli/src/cloud/workspace_policy.rs:414-440

## CMP-VP54

**MCP server controls: required, timeouts, tool allow and deny lists**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: A server cannot be marked required and per-server timeouts and tool allow or deny lists are not exposed The editor can turn a server off and on, but a server cannot be marked required and per-server timeouts and tool allow or deny lists are not exposed; only a global call timeout exists.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:752,800; apps/cli/src/mcp/mod.rs:1454

## CMP-W208

**Add a custom connector (remote MCP server)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Switched off: the Add custom connector wizard is shown only when connectors are released; plan caps exist (Free 0, Basic 5, Pro 25).
- Evidence: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1281; packages/contracts/types/src/billing-catalog.ts:657

## CMP-W233

**Custom connector sign-in choices (always, on demand, none) and client registration**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Switched off with the wizard; the form has a bearer token and OAuth client fields, not the three-way sign-in or registration choice.
- Evidence: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1282; searched: DCR, CIMD in apps/web features/connectors

## CMP-W235

**Developer mode for building and testing custom connectors**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-10](../../20-features/058-mcp-and-interactive-extension-products/F058-10-developer-debugging-console.md)
- Detail: No developer mode; custom connectors are added by URL and workspace admins publish servers.
- Evidence: searched: developer mode, developerMode in apps/web/features/connectors, features/settings

## CMP-W243

**Open and pin an interactive connector from navigation**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: There is no connector page to open or pin; only chats and projects pin to the sidebar.
- Evidence: searched: pinConnector, pinned connector, connectorPage in apps/web, packages/ui

## CMP-W247

**Reach private-network MCP servers through a secure tunnel**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-11](../../20-features/055-connector-setup-and-account-management/F055-11-private-network-connectors.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F098-07](../../20-features/098-integration-and-extensibility-components/F098-07-connector-search-index-and-private-network-bridge.md)
- Detail: Custom connectors must be public HTTPS servers; no tunnel exists.
- Evidence: searched: mcp tunnel, secure tunnel in apps/web/lib/connectors, features

## CMP-W264

**Workspace connections: admins authorize shared app accounts once**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Admins can approve connectors and plugins, but there is no shared workspace account that members use.
- Evidence: apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx; searched: workspace connection, shared account in apps/web

## CMP-WP163

**Admin-held shared connections members use without signing in**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: There is no per-role choice between individual and managed sign-in An admin can publish a workspace MCP server whose credentials members never see; there is no per-role choice between individual and managed sign-in.
- Evidence: apps/web/features/workspace-console/components/WorkspaceMcpServers.tsx:225-241

## CMP-WP167

**Interactive connector apps inside a chat (MCP Apps UI)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: No fullscreen or picture-in-picture mode MCP app UIs render in a sandboxed card inside the answer; no fullscreen or picture-in-picture mode; needs a paid plan and a released connector.
- Evidence: apps/web/features/chat/components/messages/cards/McpAppCard.tsx:5; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48

## CMP-WP172

**Admin switches for who may use, upload, share and publish plugins and skills**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No separate upload, share or publish rights One workspace switch each for skills and plugins plus allow and block lists; no separate upload, share or publish rights.
- Evidence: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:40-64; WorkspaceConnectorPolicy.tsx:147-236

## CMP-WP174

**Connector tool permissions per role with conflict warnings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Roles and groups carry no connector rules Workspace tool rules set allow, ask or deny per connector tool for everyone; roles and groups carry no connector rules.
- Evidence: packages/contracts/cloud-contracts/src/connectors.ts:692-698; apps/web/lib/services/connector-policy-service.ts:43-62

## CMP-WP184

**Interactive connector display modes (inline, side panel, full screen)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: No side panel or full-screen mode is offered Connector apps render only as an inline card; no side panel or full-screen mode is offered.
- Evidence: apps/web/features/chat/components/messages/cards/McpAppCard.tsx:276-277

## GAP-AREA058-LW04

**The custom server route omits the organization ID and its comment says the policy gate then skips policy for personal accounts. If that is so for workspace members, allowCustomConnectors could be bypassed. Not confirmed, because the gate was not opened.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-058
- Detail: Area 58. MCP and interactive extension products
- Evidence: apps/web/app/api/connectors/custom/route.ts:97-112

## GAP-CAP-connectors-apps-and-extensions-07

**Custom connectors through a remote MCP server: Comparison marks web Missing for custom connector flow in the released product; edit means remove and re-add (owner decision). VS Code add-server missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Requirement items: S58.01, S58.03, S58.06, S58.07, S58.08, S58.12, S98.12
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-08

**Custom connector sign-in choices: No sign-in-timing choice (now, when needed, none) in the web form.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Requirement items: S55.09, S58.06
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-09

**Reach private-network MCP servers: No tunnel or published egress range feature.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-11](../../20-features/055-connector-setup-and-account-management/F055-11-private-network-connectors.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F098-07](../../20-features/098-integration-and-extensibility-components/F098-07-connector-search-index-and-private-network-bridge.md)
- Requirement items: S55.32, S58.16, S98.15
- Detail: Claude partly, ChatGPT yes; AGI not built

## GAP-CAP-connectors-apps-and-extensions-12

**Admin controls over connectors and MCP servers: Comparison marks admin-provided MCP servers in CLI and workspace connection W264 missing; no approval-request flow by member (owner declined).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Requirement items: S55.11, S58.15, S98.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-14

**Interactive connector apps inside chat: Side panel and sidebar pinning missing; ledger and comparison disagree on mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Requirement items: S58.17, S58.18, S58.19, S58.20, S58.21, S58.22, S58.23, S98.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-17

**Local MCP servers and desktop extensions: Desktop extension directory and .mcpb install missing; whether VS Code dials servers itself is unverified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Requirement items: S58.02, S58.05, S58.14
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-26

**Coding-tool MCP, plugin and skill configuration (CLI, VS Code): CLI missing: add from JSON, scoped plugin sessions, deny lists, MCP output limits, plugin authoring commands; VS Code missing install scopes and options dialog.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Requirement items: S58.01, S58.02, S58.04, S58.05, S58.14, S98.21, S98.22, S98.23, S98.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-33

**Developer mode and Apps SDK for building connectors: No developer-mode flow or debugging console.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-10](../../20-features/058-mcp-and-interactive-extension-products/F058-10-developer-debugging-console.md)
- Requirement items: S58.26, S58.27, S58.28
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-F058-01-01

**Custom connector list works but add and inspect are refused while release state is coming_soon, so the web feature is dark for custom servers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Detail: Affects: Web, Desktop (hosted web), mobile users. Work needed: Product decision to release; no code change except the constant. Unknown who decides.
- Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/lib/user-connector-tools.ts:2083; apps/web/app/api/connectors/custom/route.test.ts:350-370

## GAP-F058-01-02

**Mobile does not show protocol, transport, resources, prompts, apps or compatibility notices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Detail: Affects: Mobile users. Work needed: Add an inspector section using the catalog already fetched.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:492,1123 (only catalog.tools used); brief S58.11, S58.28

## GAP-F058-01-03

**CLI and VS Code show no compatibility diagnostics (supported versions, deprecated transport, rejected tools).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Detail: Affects: CLI and VS Code users. Work needed: Extend inspect report with the same facts the web route returns.
- Evidence: apps/cli/src/repl/registry.rs:1714-1760; apps/extension-vscode/src/features/surfaces/mcpServerDetails.ts:31-63; brief S58.28

## GAP-F058-01-04

**The brief says the capability inspector is done on desktop, but the Tauri desktop's cloud connector list has no inspector; only the hosted web app inside Electron has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Detail: Affects: Tauri desktop (internal build). Work needed: Clarify which desktop the brief means; fix the brief.
- Evidence: search of apps/desktop/src found no ConnectorCapabilitiesPanel; doc: AGENTS.md section 5

## GAP-F058-01-05

**Brief code references for the CLI (apps/cli/src/lib.rs:1363, :2485) point at unrelated code now; current MCP list code is at lib.rs:5149.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Detail: Affects: Anyone using the brief. Work needed: Refresh the brief.
- Evidence: apps/cli/src/lib.rs:1325-1375 is project/archive code

## GAP-F058-01-06

**No place shows the plan's connector cap.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Detail: Affects: All cloud surfaces. Work needed: Design and add a cap indicator.
- Evidence: apps/web/lib/services/free-plan-entitlements.ts:69-82 holds the text only in errors

## GAP-F058-01-NOTBUILT

**See your servers and their tools: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md)
- Requirement items: S58.11, S58.28
- Detail: Mobile: S58.11, S58.28; CLI: S58.28; VS Code: S58.28

## GAP-F058-02-01

**Cloud add is switched off by release state, so web, Desktop and mobile users cannot add a server today.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Detail: Affects: Web, Desktop (hosted), mobile. Work needed: Release decision.
- Evidence: packages/contracts/types/src/connector-release.ts:14; apps/web/app/api/connectors/custom/route.test.ts:350-370

## GAP-F058-02-02

**Brief says VS Code add is missing; the code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Detail: Affects: Brief accuracy; VS Code users have the feature. Work needed: Update the brief and the status.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:566-668

## GAP-F058-02-03

**No private-network or tunnel route exists for cloud users; brief marks CLI done but the CLI only accepts direct http addresses and no distinct route was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Detail: Affects: Web, Desktop, mobile, Chrome; CLI claim. Work needed: Define the supported route, then build it, or correct the brief.
- Evidence: apps/web/lib/mcp-url-validation.ts:6-28; apps/cli/src/mcp/registry.rs:358-370

## GAP-F058-02-04

**No developer-mode flow found as a distinct flow.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Detail: Affects: Developers on all apps. Work needed: Define the flow or correct the brief.
- Evidence: no match for 'developer mode' in apps/cli/src/mcp or apps/cli/src/lib.rs

## GAP-F058-02-05

**Web and mobile cannot add request headers or environment variables.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Detail: Affects: Web, mobile. Work needed: Design fields; store encrypted.
- Evidence: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1062-1075; apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:109

## GAP-F058-02-06

**Chrome extension has no add flow (brief: private-network route missing).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Detail: Affects: Chrome. Work needed: Decide whether Chrome needs one.
- Evidence: no MCP code found in apps/extension

## GAP-F058-02-NOTBUILT

**Add a server (remote or local): not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Requirement items: S58.16, S58.27
- Detail: Web: S58.16, S58.27; Desktop: S58.16, S58.27; Mobile: S58.16, S58.27; Chrome: S58.16, S58.27

## GAP-F058-02-PARTLY

**Add a server (remote or local): partly built on Web**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web
- Features: [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md)
- Requirement items: S58.03
- Detail: Web S58.03: The settings adapter exposes the custom server wizard only when the general connector release switch is on. Verify the entitlement and authorization flow before releasing it.

## GAP-F058-03-01

**No way to edit an existing cloud server's address or token; delete and re-add is the only path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: Affects: Web, Desktop (hosted), mobile. Work needed: Add an update route and UI.
- Evidence: apps/web/app/api/connectors/custom/route.ts:226-228 (GET, POST, DELETE only)

## GAP-F058-03-02

**Web, desktop and mobile have no per-project scope.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: Affects: Those apps. Work needed: Design a project binding for connectors.
- Evidence: brief S58.14; no project field in custom route

## GAP-F058-03-03

**Brief says VS Code lacks credentials; the code supports sign-in (login) but not editing of env or token.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: Affects: VS Code. Work needed: Update brief; decide on env editor.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:853

## GAP-F058-03-04

**CLI env and headers stored in a plain file, not the OS credential store.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: Affects: CLI and VS Code users. Work needed: Decide if secrets should go to the credential store.
- Evidence: apps/cli/src/installs.rs:42-64

## GAP-F058-03-05

**Tauri Configuration tab is a toggle view, not an editor.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Detail: Affects: Tauri desktop. Work needed: Add editing or rename.
- Evidence: apps/desktop/src/features/mcp/MCPConfigEditor.tsx:100-190

## GAP-F058-03-NOTBUILT

**Configure a server: not built on Web, Desktop, Mobile, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code
- Features: [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md)
- Requirement items: S58.05, S58.06, S58.14
- Detail: Web: S58.14; Desktop: S58.14; Mobile: S58.14; VS Code: S58.05, S58.06

## GAP-F058-04-01

**No explicit test button on web or mobile; only discovery and health.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md)
- Detail: Affects: Web, mobile. Work needed: Add a button and a one-line result.
- Evidence: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:179

## GAP-F058-04-02

**Call history only exists for calls the assistant made; a new server has no history, and there is no cloud log of server output.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md)
- Detail: Affects: Web, mobile developers. Work needed: Decide whether to capture probe results or server logs.
- Evidence: apps/web/lib/services/connector-call-log-service.ts:56

## GAP-F058-04-03

**Retention of connector_call_events is not set in the code read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md)
- Detail: Affects: Privacy and cost. Work needed: Confirm or define retention.
- Evidence: no delete or retention found in connector-call-log-service.ts

## GAP-F058-04-04

**Mobile test is listed done in the brief S58.12 but S58.07 has no mobile status; no mobile test button found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md)
- Detail: Affects: Mobile. Work needed: Clarify requirement.
- Evidence: brief S58.07 status line

## GAP-F058-05-01

**Mobile has no on/off control though the route is shared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-05](../../20-features/058-mcp-and-interactive-extension-products/F058-05-turn-a-server-on-or-off.md)
- Detail: Affects: Mobile users. Work needed: Add switch using CONNECTOR_ACCOUNT_STATE_PATH.
- Evidence: brief S58.13; no switch in apps/mobile/src/features/settings/cloud-connectors screens read

## GAP-F058-05-02

**Brief says VS Code is missing; code has a switch for user-scope servers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-05](../../20-features/058-mcp-and-interactive-extension-products/F058-05-turn-a-server-on-or-off.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief.
- Evidence: apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:2536

## GAP-F058-05-03

**Brief cites the organization MCP route as the toggle save path; that route is a different feature (workspace publish).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-05](../../20-features/058-mcp-and-interactive-extension-products/F058-05-turn-a-server-on-or-off.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief.
- Evidence: apps/web/app/api/settings/organization/mcp/route.ts:235-270

## GAP-F058-05-04

**The exact place where chat omits disabled connectors was not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-05](../../20-features/058-mcp-and-interactive-extension-products/F058-05-turn-a-server-on-or-off.md)
- Detail: Affects: Verification. Work needed: Trace in tool-loop and add a test.
- Evidence: readDisabledConnectorIds imported in the route only

## GAP-F058-05-NOTBUILT

**Turn a server on or off: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F058-05](../../20-features/058-mcp-and-interactive-extension-products/F058-05-turn-a-server-on-or-off.md)
- Requirement items: S58.13
- Detail: Mobile: S58.13

## GAP-F058-06-01

**Mobile has no resource or prompt view or attach.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-06](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)
- Detail: Affects: Mobile. Work needed: Add UI and a way to attach to a mobile turn.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:492 (tools only); brief S58.09-S58.10

## GAP-F058-06-02

**CLI cannot browse or attach resources by the user; only the agent reads them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-06](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)
- Detail: Affects: CLI. Work needed: Add a command to list and attach.
- Evidence: apps/cli/src/agent/mod.rs:977; brief S58.09

## GAP-F058-06-03

**VS Code lists resources and prompts but cannot run or attach them; brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-06](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)
- Detail: Affects: VS Code. Work needed: Add run or attach actions; fix brief.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:679-718

## GAP-F058-06-04

**Tauri desktop has no resources or prompts UI; brief says done for desktop (true only for hosted web).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-06](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)
- Detail: Affects: Tauri desktop. Work needed: Clarify scope.
- Evidence: apps/desktop/src/features/mcp contains no resource or prompt component

## GAP-F058-06-05

**Resource templates cannot be selected on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-06](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)
- Detail: Affects: Web. Work needed: Let the user fill a URI template.
- Evidence: apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:322-326

## GAP-F058-06-06

**Custom server resources are unreachable while connectors are coming soon.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-06](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)
- Detail: Affects: Web, Desktop (hosted). Work needed: Release decision.
- Evidence: apps/web/lib/user-connector-tools.ts:2083

## GAP-F058-06-NOTBUILT

**Resources and prompts: not built on Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI
- Features: [F058-06](../../20-features/058-mcp-and-interactive-extension-products/F058-06-resources-and-prompts.md)
- Requirement items: S58.09, S58.10
- Detail: Mobile: S58.09, S58.10; CLI: S58.09

## GAP-F058-07-01

**Publishing is switched off by the global connector release state.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md)
- Detail: Affects: Admins on web and desktop; all members expecting new servers.. Work needed: Release connectors (owner decision) or give the catalog its own gate.
- Evidence: packages/contracts/types/src/connector-release.ts:12; route.ts:143

## GAP-F058-07-02

**The page does not send If-Match, so the revision rule protects only API callers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md)
- Detail: Affects: Admins using the web page and desktop window.. Work needed: Send the loaded revision and handle the conflict response.
- Evidence: WorkspaceMcpServers.tsx:70-83

## GAP-F058-07-03

**Does a workspace MCP change bump the revision counter? The route never appends to organization_policy_revisions, so two MCP edits may not conflict even with If-Match.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md)
- Detail: Affects: Admins editing at the same time.. Work needed: Confirm whether a trigger exists (none found in 0250, 0259, 0291) and add a revision row per change.
- Evidence: route.ts (no revision write); workspace-revision.ts:readWorkspaceRevision reads max(revision) of organization_policy_revisions only

## GAP-F058-07-04

**Un-retire via retired:false is accepted but does nothing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md)
- Detail: Affects: API callers; admins.. Work needed: Implement or remove the option.
- Evidence: org-mcp-servers.ts updateOrgMcpServer

## GAP-F058-07-05

**Published servers reach members with no credential, yet the publish error tells admins to connect once so the workspace holds a credential.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md)
- Detail: Affects: Servers that need authorization.. Work needed: Verify live and define a credential path.
- Evidence: route.ts:171-173; user-connector-tools.ts:1712

## GAP-F058-07-06

**The desktop (Tauri source) has no screen; only the hosted page in Electron.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md)
- Detail: Affects: Tauri desktop build.. Work needed: Confirm Tauri is out of scope.
- Evidence: apps/desktop/README.md; no match in apps/desktop/src

## GAP-F058-08-01

**Mobile has no interactive panel; the brief says missing and the code shows text only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Detail: Affects: Mobile users.. Work needed: Native webview host with the same bridge, or accept text-only and mark n/a.
- Evidence: apps/mobile/src/features/chat/components/cards/McpAppCard.tsx

## GAP-F058-08-02

**VS Code and Chrome do not render the card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: Decide scope; show the card fallback text.
- Evidence: no match under apps/extension-vscode/src or apps/extension/src for mcp-app card code

## GAP-F058-08-03

**Theme changes after load are not forwarded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Detail: Affects: Web and desktop users.. Work needed: Send host-context changes.
- Evidence: McpAppCard.tsx:273-275

## GAP-F058-08-04

**RLS migration 0173 is a draft; store uses the privileged connection.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Detail: Affects: All web users (defence in depth).. Work needed: Confirm apply state and move the store to the user-scoped database.
- Evidence: 0173 header; mcp-state-store.ts:48

## GAP-F058-08-05

**No retry control after an error.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Detail: Affects: Web and desktop users.. Work needed: Add retry.
- Evidence: McpAppCard.tsx:412-417

## GAP-F058-08-06

**Release state 'coming soon' may hide connector-based apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Detail: Affects: All users.. Work needed: Verify live.
- Evidence: connector-release.ts:12

## GAP-F058-08-NOTBUILT

**Interactive MCP App panels in chat: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md)
- Requirement items: S58.17, S58.18, S58.19, S58.20, S58.21, S58.22, S58.23
- Detail: Mobile: S58.17, S58.18, S58.19, S58.20, S58.21, S58.22, S58.23; VS Code: S58.17, S58.18, S58.19, S58.20, S58.21, S58.22, S58.23; Chrome: S58.17, S58.18, S58.19, S58.20, S58.21, S58.22, S58.23

## GAP-F058-09-01

**Late-published tools on a page that started with none are not reported.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-09](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)
- Detail: Affects: Chrome extension users.. Work needed: Start watching even when the initial list is empty.
- Evidence: apps/extension/src/webmcp.ts:581

## GAP-F058-09-02

**No UI or consumer of WEBMCP_TOOLS_CHANGED found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-09](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)
- Detail: Affects: Chrome users.. Work needed: Show the list or remove the message.
- Evidence: background.ts:2294; no listener in apps/extension/src

## GAP-F058-09-03

**The native-host message webmcp_tools_update has no receiver in this repository.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-09](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)
- Detail: Affects: Chrome with native host.. Work needed: Find or add the receiver.
- Evidence: background.ts:2257

## GAP-F058-09-04

**CLI has no site tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-09](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)
- Detail: Affects: CLI users.. Work needed: Confirm it is out of scope.
- Evidence: no match under apps/cli/src

## GAP-F058-09-05

**Brief code references are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-09](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)
- Detail: Affects: Documentation.. Work needed: Update the brief.
- Evidence: brief S58.24-S58.25

## GAP-F058-09-NOTBUILT

**Site-provided tools in the browser extension: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F058-09](../../20-features/058-mcp-and-interactive-extension-products/F058-09-site-provided-tools-in-the-browser-extension.md)
- Requirement items: S58.24, S58.25
- Detail: CLI: S58.24, S58.25

## GAP-F058-10-01

**The whole feature is missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-10](../../20-features/058-mcp-and-interactive-extension-products/F058-10-developer-debugging-console.md)
- Detail: Affects: Server developers on web, desktop, mobile, VS Code and Chrome.. Work needed: Product decision per app, then design: scope, redaction, owner-only access, retention.
- Evidence: S58.26 in the brief; no code found

## GAP-F058-10-02

**No decision records exist for apps other than the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F058-10](../../20-features/058-mcp-and-interactive-extension-products/F058-10-developer-debugging-console.md)
- Detail: Affects: Planning.. Work needed: Record keep or cut decisions.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md covers the CLI only

## GAP-F058-10-NOTBUILT

**Developer debugging console: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F058-10](../../20-features/058-mcp-and-interactive-extension-products/F058-10-developer-debugging-console.md)
- Requirement items: S58.26
- Detail: Web: S58.26; Desktop: S58.26; Mobile: S58.26; VS Code: S58.26; Chrome: S58.26
