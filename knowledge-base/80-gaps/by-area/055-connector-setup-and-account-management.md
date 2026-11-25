---
id: "GAPS-AREA-055"
type: "gap-list"
title: "Gaps: Connector setup and account management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 55. Connector setup and account management

98 open gaps that touch this area. Area page: [20-features/055-connector-setup-and-account-management](../../20-features/055-connector-setup-and-account-management/README.md).

## CMP-C294

**Admin-provided MCP servers**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Admins can restrict servers but not push their own to users.
- Evidence: searched: managedMcpServers in apps/cli/src/cloud, features/hooks/managed.rs

## CMP-CP186

**Admin allow and deny lists for MCP servers**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: No deny list or command matching Workspace admin can switch MCP off or limit it to listed servers and hosts, enforced at start; no deny list or command matching.
- Evidence: apps/cli/src/cloud/workspace_policy.rs:414; apps/cli/src/claude_parity.rs:2320

## CMP-M131

**Per-connected-account permission override with reset to Default**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Connector details show granted scopes read-only; no per-account permission.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:900

## CMP-MP61

**Per-tool permission for a connector: Allow, Ask or Block**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: No separate read-only versus low-risk levels Each tool has Allow, Ask or Block; no separate read-only versus low-risk levels.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:91; :222

## CMP-MP63

**Approval card: Deny, Allow once, Allow for chat, Always allow, plus low-risk**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: No low-risk level Card offers Allow once, Allow for this chat, Always allow and Deny; no low-risk level.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:23; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:151

## CMP-MP65

**Confirmation before connected apps book or buy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md)
- Detail: No booking or buying connectors to confirm Tool approval cards show what is at stake before an action; no booking or buying connectors to confirm.
- Evidence: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:209

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

## CMP-VP52

**Admin allowlist of approved MCP servers**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Stdio servers have no matcher and are refused when a list is active A workspace admin can turn MCP off or allow listed hosts only; stdio servers have no matcher and are refused when a list is active.
- Evidence: apps/cli/src/cloud/workspace_policy.rs:414-440

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

## CMP-W245

**Per-account permission override with reset to Default**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md)
- Detail: Tool permissions are saved per user, connector and tool, not per connected account.
- Evidence: apps/web/app/api/connectors/permissions/route.ts:42-60

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

## CMP-WP162

**Account-wide default for tool approvals (ask, read-only, low-risk)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md)
- Detail: Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals Tool approvals default is Ask before every action, Run read-only actions without asking, or Skip approvals; one setting for all chats and Work.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:61; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1895

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

## CMP-WP172

**Admin switches for who may use, upload, share and publish plugins and skills**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No separate upload, share or publish rights One workspace switch each for skills and plugins plus allow and block lists; no separate upload, share or publish rights.
- Evidence: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:40-64; WorkspaceConnectorPolicy.tsx:147-236

## CMP-WP173

**Allow all actions for one plugin (elevated risk)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Detail: There is no one-click allow-all per connector A tool can be set to Allow, and the account default can be Skip approvals; there is no one-click allow-all per connector.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:71; searched: Allow all actions in features/connectors

## CMP-WP174

**Connector tool permissions per role with conflict warnings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F092-05](../../20-features/092-tool-calling-and-agent-loop-components/F092-05-approvals-and-pauses.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: Roles and groups carry no connector rules Workspace tool rules set allow, ask or deny per connector tool for everyone; roles and groups carry no connector rules.
- Evidence: packages/contracts/cloud-contracts/src/connectors.ts:692-698; apps/web/lib/services/connector-policy-service.ts:43-62

## CMP-WP188

**More than one account per connector**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Detail: The connector page shows one connected account and no add-another button Grants are stored per account key, but the connector page shows one connected account and no add-another button.
- Evidence: apps/web/lib/connectors/accounts.ts:2; apps/web/features/connectors/components/ConnectorAccountSummary.tsx:27

## GAP-AREA055-LW04

**Multiple accounts are marked not applicable, but the storage layer keys grants by account and lists accounts per connector. The connector list keeps only the first grant per connector, so a second account would not show in the list.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-055
- Detail: Area 55. Connector setup and account management
- Evidence: apps/web/lib/connectors/oauth-store.ts:90 and :613; apps/web/app/api/connectors/route.ts:274-276

## GAP-AREA055-LW05

**Read-only mode (S55.26) is marked done on web, but the permissions panel shows Read-only tools only as a category grouping with per-tool Allow/Ask/Deny. No single read-only switch was seen in the lines read.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-055
- Detail: Area 55. Connector setup and account management
- Evidence: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:56, :74-88, :266-273

## GAP-AREA055-LW06

**Reconnect (S55.20) is marked partial with a pending live check. Code exists on web and desktop shared UI; the live check was not run in this read-only review.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-055
- Detail: Area 55. Connector setup and account management
- Evidence: packages/ui/ui/src/directory/ConnectorDetailView.tsx:305-313; packages/ui/ui/src/settings-modal/SettingsModal.tsx:238-244

## GAP-AREA055-LW07

**Data-retention explanation (S55.28) is marked done on web. Only three of the six consent points were read and none named a retention period.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-055
- Detail: Area 55. Connector setup and account management
- Evidence: packages/contracts/cloud-contracts/src/connector-trust-copy.ts:8-20

## GAP-CAP-connectors-apps-and-extensions-01

**Connector directory with search, categories and detail: Comparison marks web Partial. Persistent 'directory is still being indexed' banner and empty Connected tab text seen in the browser (6-defects). Add menu has one item that repeats Browse.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md), [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md)
- Requirement items: S55.01, S55.02, S55.03, S55.04, S55.05, S98.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-03

**Connect an outside app with the user's own sign-in: Gmail, Drive, Calendar, Microsoft 365 and GitHub are gated or unconfigured (GitHub App missing on the test machine). Reconnect shown as partial on web and desktop. Owner-signed vendor items pending.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Requirement items: S55.07, S55.08, S55.09, S55.17, S55.18, S55.20, S55.22, S55.23, S98.03, S98.04, S98.05, S98.06
- Detail: Claude yes, ChatGPT yes; AGI partly built

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

## GAP-CAP-connectors-apps-and-extensions-11

**Approval and per-tool permission for connector actions: No 'allow all for one plugin' on web, no per-account override with reset, mobile approval card partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md), [F057-10](../../20-features/057-tool-catalog-and-invocation-experience/F057-10-agents-questions-and-approvals.md), [F057-12](../../20-features/057-tool-catalog-and-invocation-experience/F057-12-tool-call-records-cards-details-errors-and-receipt.md)
- Requirement items: S55.27, S57.27, S57.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

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

## GAP-F055-01-01

**All connectors except 13 are coming soon because the release state constant is coming_soon.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Detail: Affects: Web, Desktop, Mobile users. Work needed: Owner decision to change the release state; then verify live per connector.
- Evidence: packages/contracts/types/src/connector-release.ts:14-30

## GAP-F055-01-02

**Directory API reads no session while the brief says signed-in only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Detail: Affects: Security reviewers; public visitors. Work needed: Decide whether public directory data is intended (a public page exists) and record it.
- Evidence: apps/web/app/api/connectors/directory/route.ts:115-157

## GAP-F055-01-03

**No catalogue on CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Detail: Affects: CLI and VS Code users. Work needed: Add a catalogue or document that these apps hand off to the web.
- Evidence: apps/cli/src/lib.rs:1275-1284; connectorsTree.ts:123-135

## GAP-F055-01-04

**Brief names a Developer category; code has Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Detail: Affects: Testers following the brief. Work needed: Correct the brief wording.
- Evidence: packages/contracts/cloud-contracts/src/connector-directory.ts:19-31

## GAP-F055-01-05

**Failed connected-state call is silent on Web (empty sets).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Detail: Affects: Web and Desktop users. Work needed: Surface an error or retry.
- Evidence: connectors-directory.ts:889-897

## GAP-F055-01-NOTBUILT

**Browse the connector catalogue: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F055-01](../../20-features/055-connector-setup-and-account-management/F055-01-browse-the-connector-catalogue.md)
- Requirement items: S55.01, S55.02, S55.03
- Detail: CLI: S55.01, S55.02, S55.03

## GAP-F055-02-01

**Brief marks Mobile operation list, read/write note and retention as missing but the code has them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)
- Detail: Affects: Testers using the brief. Work needed: Update the brief; live check on a device.
- Evidence: ConnectorDetailScreen.tsx:1176-1315

## GAP-F055-02-02

**Retention is explained only as one consent point, not per connector or with a duration.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)
- Detail: Affects: All apps. Work needed: Owner decision on whether per-connector retention text is needed.
- Evidence: connector-trust-copy.ts:29-33

## GAP-F055-02-03

**VS Code and CLI have no detail page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)
- Detail: Affects: VS Code, CLI users. Work needed: Link to the web detail page or add a view.
- Evidence: connectorPresentation.ts:62-70

## GAP-F055-02-04

**Brief says only three of six consent points were reviewed; code has six.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)
- Detail: Affects: Documentation. Work needed: Review the remaining three against leader wording.
- Evidence: connector-trust-copy.ts:8-34

## GAP-F055-02-NOTBUILT

**Connector detail page: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F055-02](../../20-features/055-connector-setup-and-account-management/F055-02-connector-detail-page.md)
- Requirement items: S55.05, S55.06, S55.28
- Detail: Mobile: S55.05, S55.06, S55.28; CLI: S55.06, S55.28; VS Code: S55.28

## GAP-F055-03-01

**Connect is refused for all but 13 connectors by the release constant, so most of the flow cannot be used in the current build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Detail: Affects: All apps. Work needed: Owner decision to release; per connector live checks.
- Evidence: connector-release.ts:14-30; connector-policy-gate.ts:146-153

## GAP-F055-03-02

**CLI does not run cloud connector authorization; it prints a link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Detail: Affects: CLI users. Work needed: Device sign-in flow or update the brief.
- Evidence: cloud/connectors.rs:169-176

## GAP-F055-03-03

**501 device-local connectors say 'connect from the CLI' but no CLI path for them was found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Detail: Affects: Web users of local connectors. Work needed: Verify or reword.
- Evidence: route.ts:585-595

## GAP-F055-03-04

**Cancel inside Electron's external browser is not detected; list reloads only on focus.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Detail: Affects: Desktop users. Work needed: Optional pending-state hint.
- Evidence: open-connector-authorization.ts:44

## GAP-F055-03-05

**Brief says live checks were not run; no record exists of a live OAuth run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md)
- Detail: Affects: All. Work needed: Run the live scenarios above.
- Evidence: area brief S55.20 unfinished note; no test report found

## GAP-F055-04-01

**Share is refused while the whole-connector release state is coming_soon, even for the 13 selectively released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md)
- Detail: Affects: Admins on Web and Desktop. Work needed: Decide whether selective release should allow sharing.
- Evidence: [connectorId]/route.ts:48; connector-capability.ts:28-30

## GAP-F055-04-02

**OAuth-based connectors cannot be shared; only custom or key rows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md)
- Detail: Affects: Admins wanting to share a Google or Notion sign-in. Work needed: Design an org-level OAuth grant or document the limit.
- Evidence: org-shared-connector-service.ts:128-137

## GAP-F055-04-03

**No member-side listing found in the member's own Connectors screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md)
- Detail: Affects: Members. Work needed: Verify live; add a row if absent.
- Evidence: not found in useConnectorsSettingsAdapter.tsx

## GAP-F055-04-04

**Brief marks Mobile, CLI, VS Code as not applicable; no sharing there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md)
- Detail: Affects: Those apps. Work needed: None unless the owner wants parity.
- Evidence: area brief S55.11

## GAP-F055-05-01

**Domain or workspace is not shown (S55.14).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Show the domain from the email or accept the owner decision to show only what sign-in returns.
- Evidence: ConnectorAccountSummary.tsx:16-19

## GAP-F055-05-02

**Granted list may show requested scopes when the provider returns none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)
- Detail: Affects: All apps with OAuth. Work needed: Label as requested or fetch actual grants.
- Evidence: oauth-client.ts:157

## GAP-F055-05-03

**CLI shows no account or scopes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)
- Detail: Affects: CLI. Work needed: Add fields to the list output.
- Evidence: cloud/connectors.rs:176-215

## GAP-F055-05-04

**Brief out of date for Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)
- Detail: Affects: Testers. Work needed: Update brief.
- Evidence: mobile ConnectorAccountSummary.tsx

## GAP-F055-05-05

**Code keeps multi-account storage while the decision is one account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)
- Detail: Affects: Design clarity. Work needed: Confirm intended or remove.
- Evidence: oauth-store.ts:300-340

## GAP-F055-05-NOTBUILT

**Account name, identity and granted permissions: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md)
- Requirement items: S55.13, S55.14, S55.17
- Detail: Mobile: S55.13, S55.14; CLI: S55.13, S55.14, S55.17; VS Code: S55.13, S55.14

## GAP-F055-06-01

**No live check of Reconnect on Web and Electron is recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Detail: Affects: Web, Desktop. Work needed: Run the Reconnect scenario with a real expired grant and record it.
- Evidence: area brief S55.20 unfinished note

## GAP-F055-06-02

**After a dropped grant the connector disappears from the connected list so Reconnect may not show; settings persistence unproven.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Trace tool permission rows on revoke; consider keeping a needs-reconnect row.
- Evidence: oauth-store.ts:595-603,715-760; oauth-access.ts:215-267

## GAP-F055-06-03

**No on-demand Test on Web or VS Code; health is passive.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Detail: Affects: Web, Desktop, VS Code. Work needed: Add a test call or document the substitute (capabilities panel, key form).
- Evidence: health.ts:20-24

## GAP-F055-06-04

**CLI health text mismatch ('healthy' vs server 'connected').**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Detail: Affects: CLI. Work needed: Match the server vocabulary and add a test.
- Evidence: cloud/connectors.rs:201-205; connector-vocabulary.ts:4-11

## GAP-F055-06-05

**Mobile Check again re-reads data, it does not probe; mobile test is declined by decision.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Detail: Affects: Mobile. Work needed: None, or rename the button.
- Evidence: ConnectorTrustSections.tsx; founder decisions:441-446

## GAP-F055-06-06

**VS Code cannot reconnect.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Detail: Affects: VS Code. Work needed: Add a command that opens the web reconnect page.
- Evidence: connectorPresentation.ts:68-69

## GAP-F055-06-NOTBUILT

**Connection health, test and reconnect: not built on Mobile, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Requirement items: S55.21
- Detail: Mobile: S55.21; VS Code: S55.21

## GAP-F055-06-PARTLY

**Connection health, test and reconnect: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md)
- Requirement items: S55.20
- Detail: Web S55.20: live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card | Desktop S55.20: live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card

## GAP-F055-07-01

**Web and Desktop (Electron) Disconnect fires without a confirmation naming the consequence.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md)
- Detail: Affects: Web and Desktop Electron users. Work needed: Wrap remove in useConfirmAction with destructive copy and update the test.
- Evidence: packages/ui/ui/src/directory/DirectoryPanel.tsx:549; packages/ui/ui/src/directory/__tests__/DirectoryPanel.test.tsx:659-673; AGENTS.md section 9

## GAP-F055-07-02

**The API result cannot distinguish revoked from nothing-to-revoke.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md)
- Detail: Affects: All clients. Work needed: Add a vendorRevocation field to the response contract and show it.
- Evidence: apps/web/lib/connectors/oauth-access.ts:476-490; DisconnectResponse carries only vendorNotice

## GAP-F055-07-03

**Internal Tauri disconnect does not ask the provider to revoke (in the code read).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md)
- Detail: Affects: Internal Tauri desktop build. Work needed: Confirm the intent; add revocation or document that it is local only.
- Evidence: apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1521-1612

## GAP-F055-07-04

**agi mcp logout and remove have no confirmation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md)
- Detail: Affects: CLI users. Work needed: Decide whether token removal needs the shared destructive prompt.
- Evidence: apps/cli/src/lib.rs:5368-5395

## GAP-F055-07-05

**Brief line citations for CLI (lib.rs:2571, 4254, 1337) and mobile (352, 588) no longer point at disconnect code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief citations.
- Evidence: apps/cli/src/lib.rs:2573 is confirm_destructive; mobile disconnect is at line 666

## GAP-F055-08-01

**No single read-only control; the brief expects a connector-level read-only mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)
- Detail: Affects: Web, Desktop, Mobile, CLI. Work needed: Add a named read-only state backed by Deny on the write group.
- Evidence: ToolPermissionsPanel.tsx:56-57, 262-285; brief S55.26

## GAP-F055-08-02

**CLI has no read-only grouping or read-only mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)
- Detail: Affects: CLI. Work needed: Add a group rule or document the gap.
- Evidence: apps/cli/src/lib.rs:2126-2200 (only per-server or per-tool rules)

## GAP-F055-08-03

**Mobile has no group controls, no reset-all and no confirmation on reset; label differs (Block).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)
- Detail: Affects: Mobile. Work needed: Match web behaviour.
- Evidence: ConnectorDetailScreen.tsx:91-98, 1086-1156

## GAP-F055-08-04

**Classification of read tools depends on static metadata, so unknown connector tools appear as write tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)
- Detail: Affects: Custom and new connectors. Work needed: Use server-provided hints as a tightening-only input or document it.
- Evidence: apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:93-94; tool-metadata.ts:876

## GAP-F055-08-05

**Brief and draft line citations for the mobile settings (98, 481) and CLI policy (327, 350) do not match the behaviour described.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)
- Detail: Affects: Documentation. Work needed: Refresh citations.
- Evidence: engine.rs:327-350 are rule helpers; mobile lines 91-98 are the option list

## GAP-F055-08-NOTBUILT

**Tool permissions and write approval: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F055-08](../../20-features/055-connector-setup-and-account-management/F055-08-tool-permissions-and-write-approval.md)
- Requirement items: S55.26
- Detail: CLI: S55.26

## GAP-F055-09-01

**No folder or repository chooser exists in connector settings on Web, Desktop or Mobile, although the brief marks them done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-09](../../20-features/055-connector-setup-and-account-management/F055-09-folder-or-repository-limits.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Decide the intended control, build it or correct the brief to partial.
- Evidence: brief cites route.ts:522, adapter:530 and mobile index.tsx:676, which are connect code; searches in apps/web/features/connectors and apps/mobile cloud-connectors found no chooser

## GAP-F055-09-02

**Selection cannot be changed in the product after connecting; it needs the provider.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-09](../../20-features/055-connector-setup-and-account-management/F055-09-folder-or-repository-limits.md)
- Detail: Affects: GitHub users. Work needed: Document or add a direct manage link on the connector detail.
- Evidence: code-surface.ts:295 link to GitHub

## GAP-F055-09-03

**CLI has no limit for account connectors.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-09](../../20-features/055-connector-setup-and-account-management/F055-09-folder-or-repository-limits.md)
- Detail: Affects: CLI. Work needed: Not needed until account connectors are usable from the CLI.
- Evidence: apps/cli/src/lib.rs:7377-7408 only lists and disconnects

## GAP-F055-09-04

**Google picker and connector limits are separate ideas but share one picker route name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-09](../../20-features/055-connector-setup-and-account-management/F055-09-folder-or-repository-limits.md)
- Detail: Affects: Google Drive users. Work needed: Document the difference.
- Evidence: picker route returns a token; caller is Projects

## GAP-F055-09-NOTBUILT

**Folder or repository limits: not built on Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI
- Features: [F055-09](../../20-features/055-connector-setup-and-account-management/F055-09-folder-or-repository-limits.md)
- Requirement items: S55.25
- Detail: Mobile: S55.25; CLI: S55.25

## GAP-F055-10-01

**The challenged scope may not reach the authorize request.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-10](../../20-features/055-connector-setup-and-account-management/F055-10-missing-permission-request-and-source-attribution.md)
- Detail: Affects: Web and Mobile Cloud connectors. Work needed: Verify with a test; pass the challenged scope through the ceiling filter.
- Evidence: apps/web/app/api/connectors/oauth/start/route.ts:316-380 builds from provider scopes; user-connector-tools.ts:1599 passes only to the card

## GAP-F055-10-02

**Chrome and VS Code have no connect card; Chrome shows the provider only on input forms.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-10](../../20-features/055-connector-setup-and-account-management/F055-10-missing-permission-request-and-source-attribution.md)
- Detail: Affects: Chrome, VS Code. Work needed: Decide scope for extensions; document.
- Evidence: apps/extension/src/features/side-panel/connectorInputForm.ts:68

## GAP-F055-10-03

**No single place states which providers supplied an answer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-10](../../20-features/055-connector-setup-and-account-management/F055-10-missing-permission-request-and-source-attribution.md)
- Detail: Affects: All chat surfaces. Work needed: Add an answer-level attribution if required.
- Evidence: label per step only (mcp-tool-name.ts:44)

## GAP-F055-10-04

**Brief marks Mobile n/a but a card exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-10](../../20-features/055-connector-setup-and-account-management/F055-10-missing-permission-request-and-source-attribution.md)
- Detail: Affects: Documentation. Work needed: Correct the brief.
- Evidence: apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx

## GAP-F055-11-01

**No supported private-network bridge for cloud connectors.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-11](../../20-features/055-connector-setup-and-account-management/F055-11-private-network-connectors.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Decide whether to build a device-side bridge or keep the refusal.
- Evidence: apps/web/lib/mcp-url-validation.ts:5-26

## GAP-F055-11-02

**CLI does not validate remote MCP URLs by default, so any address, including cloud metadata addresses, is reachable from the device.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-11](../../20-features/055-connector-setup-and-account-management/F055-11-private-network-connectors.md)
- Detail: Affects: CLI users. Work needed: Confirm this is intended; consider a warning when the host is not public.
- Evidence: crates/agiworkforce-mcp/src/config.rs:99-100, 192

## GAP-F055-11-03

**Brief citations for the CLI do not point at private-network code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-11](../../20-features/055-connector-setup-and-account-management/F055-11-private-network-connectors.md)
- Detail: Affects: Documentation. Work needed: Refresh to mod.rs:141-150 and security.rs.
- Evidence: apps/cli/src/lib.rs:1337, apps/cli/src/mcp/registry.rs:261

## GAP-F055-11-NOTBUILT

**Private-network connectors: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F055-11](../../20-features/055-connector-setup-and-account-management/F055-11-private-network-connectors.md)
- Requirement items: S55.32
- Detail: Web: S55.32; Desktop: S55.32; Mobile: S55.32; Chrome: S55.32

## GAP-F055-12-01

**Product requires multiple connected identities; connect path stores one account per connector.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Detail: Affects: All Cloud surfaces. Work needed: Pass account keys at authorization, add selection UI, scope disconnect and tool calls.
- Evidence: docs/product/experience-contract.md:36-38; apps/web/lib/connectors/finish-authorization.ts:184

## GAP-F055-12-02

**Storage layer exists but is disconnected from any control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Detail: Affects: Engineering. Work needed: Wire or remove.
- Evidence: migration 0253; no route supplies an account key

## GAP-F055-12-03

**No per-task account choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Detail: Affects: All apps. Work needed: Design after multi-account.
- Evidence: brief S55.16

## GAP-F055-12-04

**No organization approval request flow.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Detail: Affects: Team and enterprise members. Work needed: Define the workflow with admins.
- Evidence: searched apps/web connectors and settings organization routes

## GAP-F055-12-05

**Brief marks mobile account display as missing, but mobile shows account rows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Detail: Affects: Documentation. Work needed: Correct brief items S55.13 and S55.14.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx:28-60

## GAP-F055-12-NOTBUILT

**Not built or not applicable: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F055-12](../../20-features/055-connector-setup-and-account-management/F055-12-not-built-or-not-applicable.md)
- Requirement items: S55.16, S55.24
- Detail: Web: S55.16, S55.24; Desktop: S55.16, S55.24; Mobile: S55.16, S55.24; CLI: S55.16, S55.24; VS Code: S55.16, S55.24; Chrome: S55.16, S55.24
