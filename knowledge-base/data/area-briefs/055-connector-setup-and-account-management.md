# Area 55. Connector setup and account management

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S55.01 Connector directory.
- Should: A signed-in user can browse a catalogue of connectors they could add, with each entry's name, publisher and state.
- Status: web done, desktop done, mobile done, cli missing
- Code: packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/features/settings/components/WebSettingsModal.tsx:226; apps/web/features/directory/services/connectors-directory.ts:367; apps/web/app/api/connectors/directory/route.ts:115; apps/mobile/src/features/settings/cloud-connectors/index.tsx:44; apps/mobile/services/connectors.ts:165

## S55.02 Connector search.
- Should: Typing in a connector search box narrows the catalogue by name, publisher, tools or description.
- Status: web done, desktop done, mobile done, cli missing
- Code: packages/ui/ui/src/directory/DirectoryToolbar.tsx:87; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/features/directory/services/connectors-directory.ts:367; apps/web/app/api/connectors/directory/route.ts:55; apps/mobile/src/features/settings/cloud-connectors/index.tsx:1037; apps/mobile/src/features/settings/cloud-connectors/index.tsx:750

## S55.03 Connector categories.
- Should: The catalogue can be filtered by category (e.g. Productivity, Developer, Communication).
- Status: web done, desktop done, mobile done, cli missing
- Code: packages/ui/ui/src/directory/DirectoryPanel.tsx:613; apps/web/features/directory/services/connectors-directory.ts:251; apps/web/app/api/connectors/directory/route.ts:69; apps/mobile/src/features/settings/cloud-connectors/index.tsx:740; apps/mobile/src/features/settings/cloud-connectors/index.tsx:750

## S55.04 Connector detail page.
- Should: Selecting a connector opens a detail page with its description, publisher, sign-in requirement, tools and links.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:211; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/features/directory/services/connectors-directory.ts:790; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:816; apps/mobile/app/(app)/connectors/[id].tsx:9; apps/cli/src/lib.rs:4108

## S55.05 Supported-operation list.
- Should: The connector page lists the operations/tools the connector exposes (before or after connecting).
- Status: web done, desktop done, mobile missing, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:347; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:48; apps/cli/src/repl/registry.rs:1252; apps/cli/src/tui/tui_app.rs:3996

## S55.06 Read/write capability explanation.
- Should: Before connecting, the user sees in plain language what the connector can read and what it can change.
- Status: web done, desktop done, mobile missing, cli missing, vscode done
- Code: apps/web/features/connectors/components/ConnectorScopeList.tsx:49; apps/web/features/connectors/components/ConnectorScopeList.tsx:30; apps/extension-vscode/src/features/connectors/connectorPresentation.ts:56

## S55.07 Connect action.
- Should: A Connect action on a connector starts its real authorization or credential flow.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:530; apps/web/app/api/connectors/route.ts:530; apps/mobile/src/features/settings/cloud-connectors/index.tsx:517; apps/mobile/src/features/settings/cloud-connectors/index.tsx:676; apps/mobile/services/connectors.ts:69; packages/client/client-runtime/src/connectors/runtime.ts:264; apps/cli/src/lib.rs:1337

## S55.08 OAuth authorization.
- Should: Connecting an OAuth provider opens the provider consent page and stores the returned grant.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:292; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:530; apps/web/app/api/connectors/oauth/start/route.ts:261; apps/web/app/api/connectors/oauth/callback/route.ts:153; apps/mobile/src/features/settings/cloud-connectors/index.tsx:517; apps/mobile/src/features/settings/cloud-connectors/index.tsx:676; apps/mobile/services/connectors.ts:69; packages/client/client-runtime/src/connectors/runtime.ts:264

## S55.09 API-key authorization.
- Should: A connector that needs an API key offers a form to enter it, stores it encrypted, and connects.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:773; apps/web/app/api/connectors/[connectorId]/credentials/route.ts:183; packages/ui/ui/src/settings-modal/SettingsModal.tsx:645; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1172; apps/mobile/services/connectors.ts:218; apps/cli/src/lib.rs:1553; apps/cli/src/lib.rs:3226

## S55.10 Service-account authorization.
- Should: A connector can be authorized with a service account (a non-personal credential) and it is shown as such.
- Status: not applicable anywhere

## S55.11 Organization-managed authorization.
- Should: An organization admin authorizes a connector once and members use it without holding the credential.
- Status: web done, desktop done
- Code: apps/web/app/workspace/sharing/page.tsx:16; apps/web/features/settings/sections/OrganizationSharingSection.tsx:543; apps/web/features/settings/hooks/use-settings-queries.ts:1852; apps/web/app/api/settings/organization/shared/connectors/[connectorId]/route.ts:43; apps/web/lib/user-connector-tools.ts:1540

## S55.12 Multiple accounts per connector.
- Should: The user can connect more than one account for the same connector and keep both.
- Status: not applicable anywhere

## S55.13 Account display name.
- Should: Each connected account shows a human-readable name.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing
- Code: apps/web/lib/connectors/accounts.ts:134; apps/web/lib/connectors/oauth-client.ts:158; apps/web/lib/connectors/mcp-discovery.ts:365

## S55.14 Account identity and domain.
- Should: A connected account shows which identity (email/login) and domain/workspace it belongs to.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing
- Code: apps/web/lib/connectors/accounts.ts:134

## S55.15 Default-account selection.
- Should: With several accounts for one connector, the user picks which is used by default.
- Status: not applicable anywhere

## S55.16 Per-task account selection.
- Should: For a given task or message the user (or agent) can choose which connected account to use.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S55.17 Granted-scope display.
- Should: After connecting, the user can see which scopes/permissions were actually granted.
- Status: web done, desktop done, mobile done, cli missing, vscode done
- Code: apps/web/features/connectors/components/ConnectorScopeList.tsx:73; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:934; apps/extension-vscode/src/core/commandSetup.ts:2307; apps/extension-vscode/src/features/connectors/connectorPresentation.ts:52; apps/extension-vscode/src/features/connectors/connectorsClient.ts:31

## S55.18 Connection health.
- Should: Each connector shows whether it is healthy, needs reauthorization or is not responding.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:844; apps/web/app/api/connectors/health/route.ts:21; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:513; apps/web/app/api/connectors/route.ts:282; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:768; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:865; apps/cli/src/tui/tui_app.rs:4021; apps/extension-vscode/src/core/commandSetup.ts:2307

## S55.19 Last synchronization time.
- Should: Each connection shows when it last synchronized or was last used.
- Status: not applicable anywhere

## S55.20 Reconnect/reauthorize.
- Should: An expired or revoked connection offers a Reconnect action that re-runs authorization.
- Status: web partial, desktop partial, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:293; apps/mobile/src/features/settings/cloud-connectors/index.tsx:430; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:318; apps/cli/src/lib.rs:1337; apps/cli/src/lib.rs:2542
- Unfinished: web: live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card | desktop: live-check: with a revoked or expired OAuth grant (e.g. Google Drive), open Connectors on web and in Electron: Reconnect shows beside Disconnect and re-runs OAuth, settings and tool permissions persist, and chat shows the agi_reconnect card

## S55.21 Test connection.
- Should: The user can run an on-demand check that a connection works and see the result.
- Status: web done, desktop done, mobile missing, cli done, vscode missing
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:786; apps/web/features/connectors/components/ConnectorCapabilitiesPanel.tsx:96; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:48; apps/cli/src/repl/registry.rs:1320; apps/cli/src/tui/tui_app.rs:5309

## S55.22 Disconnect.
- Should: The user can disconnect a connector and it stops being available to the assistant.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:295; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:640; apps/web/app/api/connectors/route.ts:684; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:588; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:352; apps/mobile/services/connectors.ts:79; apps/cli/src/lib.rs:1337; apps/cli/src/lib.rs:2571

## S55.23 Revoke permission.
- Should: Revoking removes the stored grant and asks the provider to revoke the token.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/ui/src/directory/ConnectorDetailView.tsx:295; apps/web/app/api/connectors/route.ts:684; apps/web/lib/connectors/oauth-access.ts:193; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:588; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:352; crates/agiworkforce-mcp/src/oauth/flow.rs:711; apps/cli/src/mcp/mod.rs:730; apps/cli/src/lib.rs:4254

## S55.24 Sync-source selection.
- Should: For a syncing connector, the user chooses which sources (mailboxes, drives, channels) are synced/indexed.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S55.25 Folder or repository selection.
- Should: The user limits a connector to chosen folders or repositories.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/app/api/connectors/route.ts:522; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:530; apps/mobile/src/features/settings/cloud-connectors/index.tsx:676

## S55.26 Read-only mode.
- Should: A connector can be set to read-only so its write operations are blocked.
- Status: web done, desktop done, cli missing
- Code: apps/web/features/connectors/components/ToolPermissionsPanel.tsx:57; apps/web/features/connectors/components/ToolPermissionsPanel.tsx:236; apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:90

## S55.27 Write-action settings.
- Should: The user controls whether a connector's write actions run automatically, need approval, or are blocked.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/connectors/components/ConnectorConsentSummary.tsx:5; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:481; apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:98; apps/cli/src/agent/tools.rs:77; apps/cli/src/platform/policy/engine.rs:350; apps/cli/src/platform/policy/engine.rs:327

## S55.28 Data-retention explanation.
- Should: At connect time the product explains what connector data it stores and for how long.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing
- Code: apps/web/features/connectors/components/ConnectorConsentSummary.tsx:23

## S55.29 Source-provider attribution.
- Should: Answers or steps that used a connector name the provider that supplied the data.
- Status: web done, desktop done, cli done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; apps/web/features/connectors/lib/mcp-tool-name.ts:35; apps/cli/src/agent/tools.rs:138; apps/cli/src/agent/tools.rs:134; apps/cli/src/mcp/mod.rs:228; apps/extension/src/features/side-panel/bubbles.ts:388; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:826

## S55.30 Missing-scope request.
- Should: When a task needs a scope the grant lacks, the product asks the user to grant that permission.
- Status: web done, desktop done, cli done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:466; packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx:15; apps/web/app/api/connectors/oauth/start/route.ts:261; crates/agiworkforce-mcp/src/transport/http.rs:269; crates/agiworkforce-mcp/src/error.rs:50; apps/cli/src/mcp/mod.rs:669; apps/cli/src/mcp/mod.rs:1589; apps/cli/src/mcp/oauth_store.rs:244

## S55.31 Organization approval flow.
- Should: A member can request a connector and an organization admin approves or denies it.
- Status: not applicable anywhere

## S55.32 Private-network setup where offered.
- Should: Where offered, a connector can reach services on a private network through a supported setup.
- Status: web missing, desktop missing, mobile missing, cli done, chrome missing
- Code: apps/cli/src/lib.rs:1337; apps/cli/src/mcp/registry.rs:261
