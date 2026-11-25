---
id: "GAPS-AREA-098"
type: "gap-list"
title: "Gaps: Integration and extensibility components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 98. Integration and extensibility components

97 open gaps that touch this area. Area page: [20-features/098-integration-and-extensibility-components](../../20-features/098-integration-and-extensibility-components/README.md).

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

## CMP-CP193

**Plugins and plugin marketplaces**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Marketplace installs do not reach the CLI: agi marketplace get only records the install on the account and says it is l… Local plugins work, but marketplace installs do not reach the CLI: agi marketplace get only records the install on the account and says it is listed on the web and desktop apps (apps/cli/src/lib.rs:7558-7571,5077-5083). No code loads the plugin hooks, commands, agents or MCP servers of an account in
- Evidence: apps/cli/src/lib.rs:2013 (PluginSubcommand); apps/cli/src/tui/tui_app.rs:6226-6233

## CMP-CP212

**Marketplace sources beyond GitHub**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No local-path or hosted-JSON marketplaces marketplace add takes a public GitHub repository; plugins install from a path or git URL; no local-path or hosted-JSON marketplaces.
- Evidence: apps/cli/src/lib.rs:2336

## CMP-DP91

**Curated role plugin packs and single-app plugins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No curated role packs were found The directory lists plugins and connectors; no curated role packs were found.
- Evidence: apps/web/features/directory/constants.ts

## CMP-MP66

**Connectors page for linking outside apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md), [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Free plan cannot connect any Settings, Connectors (and Customize) lists connected and available apps with search and category filters; Free plan cannot connect any.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/index.tsx:834; apps/mobile/app/(app)/connectors/index.tsx:3; packages/contracts/types/src/billing-catalog.ts:351

## CMP-MP70

**Use several accounts of the same app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: No Add another account control was found A connector detail page lists the accounts linked to it, but no Add another account control was found.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:85; apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:18; searched: another account, add account in apps/mobile/src/features/settings/cloud-connectors/

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

## CMP-VP49

**Add, refresh and remove plugin marketplaces**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Marketplaces are managed only with the agi marketplace commands in a terminal Marketplaces are managed only with the agi marketplace commands in a terminal; the editor Plugins view installs from a Git URL or folder.
- Evidence: apps/cli/src/lib.rs:7470-7480; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:344-372

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

## CMP-VP56

**Plugins and plugin marketplaces**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Ours installs only from a Git URL or folder with a sha256 pin, toggles and removes (apps/extension-vscode/src/features/… Claude's /plugins dialog has Plugins and Marketplaces tabs, three install scopes, an options form and uninstall choices (claude-code/docs_en_vs-code.md.md, Manage plugins). Ours installs only from a Git URL or folder with a sha256 pin, toggles and removes (apps/extension-vscode/src/features/surfaces
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:337-400

## CMP-W208

**Add a custom connector (remote MCP server)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Switched off: the Add custom connector wizard is shown only when connectors are released; plan caps exist (Free 0, Basic 5, Pro 25).
- Evidence: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1281; packages/contracts/types/src/billing-catalog.ts:657

## CMP-W211

**Connect Gmail, Google Drive and Google Calendar**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: Switched off: connectors are "coming soon"; only airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry and todoist are released.
- Evidence: packages/contracts/types/src/connector-release.ts:16; apps/web/features/connectors/lib/connector-release-lock.ts:23

## CMP-W212

**Connect Microsoft 365 apps (Outlook, OneDrive, SharePoint)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: Switched off: the Microsoft Graph connector exists but is not in the released list.
- Evidence: apps/web/lib/connectors/microsoft-graph.ts:512; packages/contracts/types/src/connector-release.ts:16

## CMP-W233

**Custom connector sign-in choices (always, on demand, none) and client registration**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Switched off with the wizard; the form has a bearer token and OAuth client fields, not the three-way sign-in or registration choice.
- Evidence: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:1282; searched: DCR, CIMD in apps/web features/connectors

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

## CMP-W259

**Sync a plugin marketplace from GitLab**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Plugin marketplaces accept GitHub repository URLs only.
- Evidence: apps/web/lib/services/plugin-marketplace-service.ts:66-67

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

## CMP-WP164

**Connect GitHub from chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: As a chat connector it is not in the released list GitHub works through the Code page and its GitHub App; as a chat connector it is not in the released list.
- Evidence: apps/web/features/code/code-surface.ts:31; packages/contracts/types/src/connector-release.ts:16

## CMP-WP165

**Connectors directory: browse, search, categories, tool list and trust notice**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md), [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: A directory from the MCP registry and first-party list browses with categories, tools and a trust notice, but Connect i… A directory from the MCP registry and first-party list browses with categories, tools and a trust notice, but Connect is off for all except 13 apps.
- Evidence: packages/contracts/types/src/connector-release.ts:14; packages/ui/ui/src/directory/constants.ts:270

## CMP-WP167

**Interactive connector apps inside a chat (MCP Apps UI)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: No fullscreen or picture-in-picture mode MCP app UIs render in a sandboxed card inside the answer; no fullscreen or picture-in-picture mode; needs a paid plan and a released connector.
- Evidence: apps/web/features/chat/components/messages/cards/McpAppCard.tsx:5; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48

## CMP-WP170

**Add a plugin marketplace (curated sources or a GitHub repository)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: There is no GitHub account picker Add marketplace offers Browse AGI sources and a repository URL with branch; there is no GitHub account picker.
- Evidence: packages/ui/ui/src/directory/constants.ts:228; packages/ui/ui/src/directory/constants.ts:233

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

## CMP-WP179

**Developer portal: submit a plugin, track review, see usage**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: There are no usage analytics for the author Plugin submissions have pending, approved, rejected and suspended states with scan findings; there are no usage analytics for the author.
- Evidence: apps/web/lib/services/plugin-submission-service.ts:21-40; apps/web/features/directory/services/plugins-directory.ts:528

## CMP-WP180

**Directory status messages (plan, admin approval, workspace setup, desktop only, disabled)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: The directory shows no per-app labels for plan, admin approval or disabled Workspace connector policy blocks calls on the server, but the directory shows no per-app labels for plan, admin approval or disabled.
- Evidence: apps/web/lib/services/connector-policy-gate.ts:86; searched: admin approval, disabled by in apps/web/features/connectors

## CMP-WP184

**Interactive connector display modes (inline, side panel, full screen)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: No side panel or full-screen mode is offered Connector apps render only as an inline card; no side panel or full-screen mode is offered.
- Evidence: apps/web/features/chat/components/messages/cards/McpAppCard.tsx:276-277

## CMP-WP188

**More than one account per connector**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: The connector page shows one connected account and no add-another button Grants are stored per account key, but the connector page shows one connected account and no add-another button.
- Evidence: apps/web/lib/connectors/accounts.ts:2; apps/web/features/connectors/components/ConnectorAccountSummary.tsx:27

## CMP-WP192

**Security scan of uploaded skills and plugins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No pass, warn or fail scan of uploaded skills was found Plugins get a scan with a review verdict that a user must acknowledge and an admin moderation queue; no pass, warn or fail scan of uploaded skills was found.
- Evidence: apps/web/app/api/plugins/[id]/scan/route.ts:25; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:465; apps/web/features/admin/pages/PluginModerationPage.tsx:886

## CMP-WP195

**Submit a plugin to the vendor directory and directory safety policy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No published listing policy page was found Plugins have a submission and moderation queue, but no published listing policy page was found.
- Evidence: apps/web/features/admin/pages/PluginModerationPage.tsx; searched: directory policy in apps/web/app

## CMP-X17

**Plugins entry in the + menu**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No plugins menu; searched: plugin in apps/extension/src.
- Evidence: searched: plugin in apps/extension/src

## GAP-AREA098-LW06

**The token refresh de-duplication is an in-memory map, so it only merges requests inside one server process. Across processes the database lock is the only guard.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-098
- Detail: Area 98. Integration and extensibility components
- Evidence: apps/web/lib/connectors/oauth-access.ts:37, 173-188

## GAP-CAP-connectors-apps-and-extensions-01

**Connector directory with search, categories and detail: Comparison marks web Partial. Persistent 'directory is still being indexed' banner and empty Connected tab text seen in the browser (6-defects). Add menu has one item that repeats Browse.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md), [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Requirement items: S55.01, S55.02, S55.03, S55.04, S55.05, S98.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-02

**Plan, release and admin gating of connectors: Release state is coming_soon, so only 13 ids can connect. Comparison WP180 lacks admin-approval and desktop-only messages. Notion detail leaks an environment variable name to the user.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Requirement items: S98.01
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-03

**Connect an outside app with the user's own sign-in: Gmail, Drive, Calendar, Microsoft 365 and GitHub are gated or unconfigured (GitHub App missing on the test machine). Reconnect shown as partial on web and desktop. Owner-signed vendor items pending.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Requirement items: S55.07, S55.08, S55.09, S55.17, S55.18, S55.20, S55.22, S55.23, S98.03, S98.04, S98.05, S98.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-07

**Custom connectors through a remote MCP server: Comparison marks web Missing for custom connector flow in the released product; edit means remove and re-add (owner decision). VS Code add-server missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F058-04](../../20-features/058-mcp-and-interactive-extension-products/F058-04-test-a-connection-and-read-health-and-logs.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Requirement items: S58.01, S58.03, S58.06, S58.07, S58.08, S58.12, S98.12
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

## GAP-CAP-connectors-apps-and-extensions-13

**More than one account per connector: Owner decision (one account per connector) conflicts with experience-contract.md and with ChatGPT documentation; per-task account choice missing everywhere.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Requirement items: S55.12, S55.15, S55.16, S98.11
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-14

**Interactive connector apps inside chat: Side panel and sidebar pinning missing; ledger and comparison disagree on mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-08](../../20-features/058-mcp-and-interactive-extension-products/F058-08-interactive-mcp-app-panels-in-chat.md), [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Requirement items: S58.17, S58.18, S58.19, S58.20, S58.21, S58.22, S58.23, S98.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-22

**Security scan of skills and plugins: Comparison marks plugin scan partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.32, S98.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-23

**Plugins: bundles of skills, connectors and commands: Conflict: surface-feature-matrix says mobile plugins absent (canUsePlugins false) while comparison cites mobile plugin screens. Chrome and VS Code install missing; many CLI author tools missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.02, S54.12, S54.13, S54.14, S54.15, S54.16, S54.17, S54.19, S54.21, S54.22, S54.24, S54.25, S54.26, S54.29, S54.33, S98.17, S98.18, S98.19, S98.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-24

**Plugin marketplaces and admin distribution: GitLab sync, installation approval request, featured and recommended plugins missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.05, S54.06, S54.07, S54.30, S98.25, S98.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-26

**Coding-tool MCP, plugin and skill configuration (CLI, VS Code): CLI missing: add from JSON, scoped plugin sessions, deny lists, MCP output limits, plugin authoring commands; VS Code missing install scopes and options dialog.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F058-01](../../20-features/058-mcp-and-interactive-extension-products/F058-01-see-your-servers-and-their-tools.md), [F058-02](../../20-features/058-mcp-and-interactive-extension-products/F058-02-add-a-server-remote-or-local.md), [F058-03](../../20-features/058-mcp-and-interactive-extension-products/F058-03-configure-a-server.md), [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md), [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Requirement items: S58.01, S58.02, S58.04, S58.05, S58.14, S98.21, S98.22, S98.23, S98.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-30

**Publisher submission and directory safety policy: No report-plugin or publisher analytics; no public policy text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.36, S54.37, S54.38, S98.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F098-01-01

**Second account of a service cannot be created: no code passes an account key into the pending record or the grant write.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Affects: All apps that connect services; people with a work and a personal account.. Work needed: Carry account key, label and scope through start, pending and upsert; add a test that two accounts survive; correct the brief status of S98.11.
- Evidence: oauth/start/route.ts:353-370 and mcp-discovery.ts:242 call createPendingAuthorization with no account fields; finish-authorization.ts:171-185 passes only accountLabel; accounts.ts:5-9 maps an empty key to 'default'.

## GAP-F098-01-02

**No way to choose the default account or an account per task.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Affects: Web, Mobile, CLI, VS Code, Desktop.. Work needed: Add account argument to access resolution and tool calls, plus a set-default API and control.
- Evidence: oauth-access.ts:84-97 has no account argument; no set-default route or control found.

## GAP-F098-01-03

**Forced fresh consent on wider scopes is advisory only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Affects: People with an existing grant when a connector widens its scopes.. Work needed: Call it on use of a stored grant, or document that the consent screen is the enforcement.
- Evidence: grantRequiresReconsent has no non-test caller (scopes-escalation.ts:48-55); start route only adds a status (oauth/start/route.ts:381-386).

## GAP-F098-01-04

**Most connectors are switched off by the release gate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Affects: All apps; only 13 ids work for connect.. Work needed: Owner decision to release more ids; per-connector vendor app registration.
- Evidence: connector-release.ts:14-34; docs/runbooks/connector-oauth-apps.md.

## GAP-F098-01-05

**Chrome extension has no connector client found; mobile and Desktop labels unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Affects: Chrome extension.. Work needed: Confirm and, if required, build parity per docs/product.
- Evidence: search in apps/extension found no connector client.

## GAP-F098-02-01

**Brief wording for health states does not match code states.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: Affects: Testers and clients reading the brief.. Work needed: Update the brief or expose combined state.
- Evidence: health.ts:42 versus area brief S98.10.

## GAP-F098-02-02

**No active probe; a silent dead connector shows 'unknown' until used.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: Affects: All apps showing connector state.. Work needed: Decide whether a scheduled check is wanted.
- Evidence: health.ts:28-32.

## GAP-F098-02-03

**The ceiling and circuit are keyed by connector id, not by account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: Affects: People with several accounts once multi-account works.. Work needed: Add account to the log and gate if multi-account ships.
- Evidence: health.ts:232 filters by connectorId only.

## GAP-F098-03-01

**Microsoft adapter cannot run in production: ids are not released and owner setup is open.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-03](../../20-features/098-integration-and-extensibility-components/F098-03-use-a-connected-service-in-chat.md)
- Detail: Affects: All apps for Outlook, OneDrive, SharePoint, Teams users.. Work needed: Owner registers the Entra app, sets settings, releases ids, then live-tests.
- Evidence: connector-release.ts:17-34; .env.example:413-417.

## GAP-F098-03-02

**Approval for external_send under every policy is a brief statement, not proven here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-03](../../20-features/098-integration-and-extensibility-components/F098-03-use-a-connected-service-in-chat.md)
- Detail: Affects: Anyone sending mail through the adapter.. Work needed: Trace and test the approval path.
- Evidence: tool-metadata.ts:827-846 only classifies; approval prompt code not read.

## GAP-F098-03-03

**No per-task account selection.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-03](../../20-features/098-integration-and-extensibility-components/F098-03-use-a-connected-service-in-chat.md)
- Detail: Affects: Multi-account users.. Work needed: See F098-01 gaps.
- Evidence: oauth-access.ts:84-97.

## GAP-F098-03-04

**Mobile, CLI, VS Code and Chrome behaviour for connector tools is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-03](../../20-features/098-integration-and-extensibility-components/F098-03-use-a-connected-service-in-chat.md)
- Detail: Affects: Those apps.. Work needed: Drive each app against a released connector.
- Evidence: Only client code for connect and reconnect found.

## GAP-F098-04-01

**Rust MCP client lacks prompt list and get.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Affects: CLI and Tauri desktop.. Work needed: Add the methods or narrow the brief.
- Evidence: client.rs:151-223 has no prompt method; brief S98.12 says prompts.

## GAP-F098-04-02

**Interactive apps work only on web chat; mobile shows text, other apps unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Affects: Mobile, Tauri desktop, VS Code, Chrome.. Work needed: Decide per-app behaviour and test.
- Evidence: mobile McpAppCard.tsx:1-40; search of other apps found no card.

## GAP-F098-04-03

**Brief reference for S98.16 points at stale code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Affects: Testers.. Work needed: Update the brief.
- Evidence: tool-loop.ts:2147 is stream parsing; card built at 2968-3000.

## GAP-F098-04-04

**Two client implementations (TypeScript and Rust) must stay in step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-04](../../20-features/098-integration-and-extensibility-components/F098-04-connect-mcp-servers-and-show-their-interactive-app.md)
- Detail: Affects: All apps using MCP.. Work needed: Shared conformance tests.
- Evidence: packages/tools/mcp and crates/agiworkforce-mcp are separate.

## GAP-F098-05-01

**Only one unit test; no process-level test.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-05](../../20-features/098-integration-and-extensibility-components/F098-05-let-other-tools-use-this-product.md)
- Detail: Affects: CLI users of mcp-server.. Work needed: Add a spawn-the-binary test.
- Evidence: apps/cli/tests/app_server_stdio.rs targets the developer session server, not this command.

## GAP-F098-05-02

**Behaviour of write and shell tools under a denying approval callback is undocumented.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-05](../../20-features/098-integration-and-extensibility-components/F098-05-let-other-tools-use-this-product.md)
- Detail: Affects: Clients that call write_file or run_command.. Work needed: Trace the executor and document or test.
- Evidence: app_server.rs:197-215.

## GAP-F098-05-03

**Server exposes no resources or prompts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-05](../../20-features/098-integration-and-extensibility-components/F098-05-let-other-tools-use-this-product.md)
- Detail: Affects: MCP clients expecting them.. Work needed: Decide if needed.
- Evidence: capabilities is tools only (app_server.rs:243).

## GAP-F098-06-01

**The GitHub log line for a failed signature logs the supplied signature value.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-06](../../20-features/098-integration-and-extensibility-components/F098-06-receive-events-from-outside-services.md)
- Detail: Affects: Operators reading logs.. Work needed: Review whether logging a rejected signature is acceptable.
- Evidence: github route.ts:76-78 passes { signature } to logger.warn.

## GAP-F098-06-02

**Rate limits are per IP and fail open.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-06](../../20-features/098-integration-and-extensibility-components/F098-06-receive-events-from-outside-services.md)
- Detail: Affects: Senders sharing an IP; availability under limiter failure.. Work needed: Decide per-trigger limits; the signature check still gates the request.
- Evidence: rate-limit.ts:464-478.

## GAP-F098-06-03

**Plan or entitlement rule for event triggers not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-06](../../20-features/098-integration-and-extensibility-components/F098-06-receive-events-from-outside-services.md)
- Detail: Affects: Free users creating signed webhook triggers.. Work needed: Read trigger-service plan checks and document.
- Evidence: connector route.ts has no plan check; trigger-service not read for plan rules.

## GAP-F098-06-04

**No evidence a human has run end to end signed deliveries.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-06](../../20-features/098-integration-and-extensibility-components/F098-06-receive-events-from-outside-services.md)
- Detail: Affects: All.. Work needed: Run the scenarios against a test deployment.
- Evidence: only code tests found; no recorded run.

## GAP-F098-07-01

**No background sync and search index for connector content**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-07](../../20-features/098-integration-and-extensibility-components/F098-07-connector-search-index-and-private-network-bridge.md)
- Detail: Affects: All users of connectors on web, desktop, mobile, VS Code. Work needed: Decide scope and storage, build the worker as a scheduled job, add per-user isolation, deletion on disconnect, and a search entry point; add tests.
- Evidence: doc: knowledge-base/data/area-briefs/098-integration-and-extensibility-components.md S98.08 'platform missing'

## GAP-F098-07-02

**No private-network bridge**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-07](../../20-features/098-integration-and-extensibility-components/F098-07-connector-search-index-and-private-network-bridge.md)
- Detail: Affects: Organizations whose tool servers are not on the public internet. Work needed: Design an outbound tunnel or customer-side relay, an admin policy, audit events, and keep the public-host rule for all other connectors.
- Evidence: doc: knowledge-base/data/area-briefs/098-integration-and-extensibility-components.md S98.15 'platform missing'; SSRF block at apps/web/lib/user-connector-tools.ts:643

## GAP-F098-07-03

**No product document explains who needs these or whether the leaders ship them**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-07](../../20-features/098-integration-and-extensibility-components/F098-07-connector-search-index-and-private-network-bridge.md)
- Detail: Affects: Product planning. Work needed: Check the leaders' current documentation (AGENTS.md section 10) and record a decision.
- Evidence: search of docs/product and docs/decisions found no S98.08 or S98.15 text

## GAP-F098-08-01

**User-registered marketplaces are not refreshed automatically**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Detail: Affects: Web, CLI and every app showing account marketplaces. Work needed: Add a scheduled job with a budget and per-source backoff.
- Evidence: The only caller of refreshMarketplaceSource is the refresh route (apps/web/app/api/plugins/marketplaces/[id]/refresh/route.ts:36); S98.25 says 'keeps them refreshed'

## GAP-F098-08-02

**No plugin install on mobile, VS Code and Chrome, and desktop only opens the web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Detail: Affects: Desktop, mobile, VS Code, Chrome. Work needed: Decide per app whether to build it; the capability table already says true for mobile (capabilities.ts:120), which disagrees with the matrix.
- Evidence: doc: docs/product/surface-feature-matrix.md:372-381; CloudPluginsSection.tsx:38-41

## GAP-F098-08-03

**Uninstall deletes the row without a recorded undo and the confirmation UI was not opened**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Detail: Affects: Web users. Work needed: Check the web remove control uses the confirm surface naming what stops working.
- Evidence: plugin-installation-service.ts:434-445; AGENTS.md section 9 on irreversible actions

## GAP-F098-08-04

**Migration 0232 may not be applied**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md)
- Detail: Affects: All installs. Work needed: Confirm applied state with 'pnpm db:migrate -- status' per environment.
- Evidence: 0232 header 'NOT YET APPLIED : draft only'

## GAP-F098-09-01

**No publisher identity record or check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Affects: All plugin installers and reviewers. Work needed: Write the review procedure as a runbook, store reviewer and date on each approval, and decide whether any identity proof is required.
- Evidence: Brief S98.26 not applicable; decision doc says review covers it; registry entries only carry a publisher name and a signature (plugin-registry-service.ts:170-175)

## GAP-F098-09-02

**Marketplace entries have no signature and files inside them may not be scanned**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Affects: Web and CLI users installing from account marketplaces. Work needed: Scan the plugin files at install, or document that the manifest scan is the whole gate and the permission review is the main control.
- Evidence: plugin-marketplace-service.ts:757-775,855-860

## GAP-F098-09-03

**Artifact digest not passed to the integrity check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Affects: Registry installs and updates. Work needed: Pass the fetched artifact digest wherever an artifact is downloaded.
- Evidence: plugin-installation-service.ts:311; plugin-lifecycle.ts:707

## GAP-F098-09-04

**No quality or safety evaluation run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Affects: Plugin quality for everyone. Work needed: Decide what a run means (sample prompts, cost per run, which model) and build it, or amend the requirement.
- Evidence: S98.29 sites are scan and human review only (organization-plugin-service.ts:214; plugin-submission-service.ts:169; user-skill-service.ts:122)

## GAP-F098-09-05

**Migration 0232 may be unapplied**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Affects: All installs. Work needed: Confirm applied state.
- Evidence: 0232 header line 4

## GAP-F098-10-01

**CLI custom-prompt merge is never fed in production**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md)
- Detail: Affects: CLI. Work needed: Delete the dead branch or feed saved prompts.
- Evidence: apps/cli/src/tui/tui_app.rs:718; apps/cli/src/app_server/surfaces.rs:651 pass &[]

## GAP-F098-10-02

**No skills in VS Code and no command registry outside the CLI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md)
- Detail: Affects: VS Code, web, desktop, mobile, Chrome. Work needed: Decide parity; the server route is reusable.
- Evidence: doc: docs/product/surface-feature-matrix.md:77

## GAP-F098-10-03

**Empty, loading and error screens for skills not verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md)
- Detail: Affects: Web, desktop, mobile, Chrome. Work needed: Drive each app and record the states.
- Evidence: Only routes and clients were read

## GAP-F098-10-04

**Plan rules for skills unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-10](../../20-features/098-integration-and-extensibility-components/F098-10-skills-and-commands.md)
- Detail: Affects: Subscription accuracy. Work needed: Read the capability evaluator and tier policy and record which plans deny skills.
- Evidence: capabilities.ts lists true; tier layer not read

## GAP-F098-11-01

**BeforeModelResolve and BeforePromptBuild results are ignored**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: Affects: CLI hook authors. Work needed: Apply the outputs with a boundary guard, or remove the claim from comments and docs.
- Evidence: chat.rs:1404-1436 drops results; hooks.rs:1168-1262 has no model field

## GAP-F098-11-02

**Hooks silently unavailable on other apps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: Affects: Desktop, VS Code, web users expecting hooks. Work needed: State this in product docs for each surface.
- Evidence: Not found outside apps/cli; decision doc

## GAP-F098-11-03

**Policy-unknown skip is a warning only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: Affects: Signed-in CLI users offline. Work needed: Offer a retry or cached last-known policy.
- Evidence: workspace_policy.rs:752-780

## GAP-F098-11-04

**Brief evidence lines are stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F098-11](../../20-features/098-integration-and-extensibility-components/F098-11-automation-hooks.md)
- Detail: Affects: Maintainers. Work needed: Refresh the brief's code references.
- Evidence: hooks.rs:1155 and chat.rs:260 do not hold dispatch code
