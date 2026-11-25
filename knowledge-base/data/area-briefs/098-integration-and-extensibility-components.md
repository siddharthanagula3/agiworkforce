# Area 98. Integration and extensibility components

29 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S98.01 Connector registry.
- Should: A server-side registry defines every connector: id, auth scheme, endpoint, risk class and release state.
- Status: platform done
- Code: apps/web/lib/connectors/catalog.ts:152; apps/web/lib/connectors/mcp-endpoints.ts:10; apps/web/app/api/connectors/directory/route.ts:115

## S98.02 Connected-account store.
- Should: A store keeps each user's connected accounts and grants per connector.
- Status: platform done
- Code: apps/web/db/neon/0097_connector_oauth_broker.sql:92; apps/web/db/neon/0253_connector_accounts.sql:30; apps/web/lib/connectors/oauth-store.ts:286

## S98.03 OAuth callback service.
- Should: An OAuth callback service validates state, exchanges the code and stores the grant.
- Status: platform done
- Code: apps/web/app/api/connectors/oauth/callback/route.ts:153; apps/web/lib/connectors/oauth-store.ts:117

## S98.04 Token vault.
- Should: Connector tokens and credentials are stored encrypted and decrypted only for use.
- Status: platform done
- Code: apps/web/lib/custom-connector-crypto.ts:72; apps/web/lib/connectors/oauth-store.ts:297; apps/web/lib/custom-connector-crypto.ts:87

## S98.05 Token refresh coordinator.
- Should: A coordinator refreshes expiring tokens once, even when several requests need the token at the same time.
- Status: platform done
- Code: apps/web/lib/connectors/oauth-store.ts:510; apps/web/lib/connectors/oauth-access.ts:115

## S98.06 Scope/consent manager.
- Should: Requested scopes are capped per provider and a wider scope set forces fresh consent.
- Status: platform done
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:250; apps/web/lib/connectors/scopes-escalation.ts:48

## S98.07 Provider-specific connector adapters.
- Should: Provider-specific adapters implement connector behaviour for each supported provider.
- Status: platform partial
- Code: apps/web/lib/connectors/microsoft-graph.ts:297; apps/web/lib/connectors/microsoft-graph.ts:406; apps/web/lib/connectors/microsoft-graph.ts:444; apps/web/lib/connectors/microsoft-graph.ts:505; apps/web/lib/connectors/microsoft-graph.ts:543; apps/web/lib/connectors/microsoft-graph.ts:639; apps/web/lib/connectors/microsoft-graph.ts:798; apps/web/lib/user-connector-tools.ts:2413
- Unfinished: platform: partials/mcp-web c2d16c71d: a built-in Microsoft Graph v1.0 adapter serves Outlook (search and read mail, list events, send mail, create events), OneDrive and SharePoint (search, read documents as text through the pre-authenticated download link) and Teams (read chats, list teams and channels); send_mail and create_event are external sends, so they ask under every policy. Stays off until the owner registers an Entra app and adds the outlook, onedrive, sharepoint and teams descriptors with CONNECTOR_OAUTH_<ID>_CLIENT_ID/_CLIENT_SECRET (setup guide). Saving drafts to Outlook needs Mail

## S98.08 Connector search/index worker.
- Should: A background worker syncs and indexes connector content so it can be searched.
- Status: platform missing

## S98.09 External webhook receiver.
- Should: Signed webhooks from external providers are received, verified and routed.
- Status: platform done
- Code: apps/web/app/api/github/webhook/route.ts:63; apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:46

## S98.10 Connector health monitor.
- Should: A health monitor tracks each connection's state (healthy, needs reauth, failing).
- Status: platform done
- Code: apps/web/lib/connectors/health.ts:303; apps/web/app/api/connectors/health/route.ts:21

## S98.11 Multi-account selection.
- Should: When several accounts exist for a connector, the runtime selects the right one per task.
- Status: platform done

## S98.12 MCP client runtime.
- Should: An MCP client runtime connects to servers and lists and calls their tools, resources and prompts.
- Status: platform done
- Code: crates/agiworkforce-mcp/src/client.rs:286; crates/agiworkforce-mcp/src/client.rs:149; crates/agiworkforce-mcp/src/client.rs:190; crates/agiworkforce-mcp/src/oauth/flow.rs:432; crates/agiworkforce-mcp/src/oauth/flow.rs:987; crates/agiworkforce-mcp/src/config.rs:124; crates/agiworkforce-mcp/src/cache.rs:30; crates/agiworkforce-mcp/src/cache.rs:74

## S98.13 MCP server host.
- Should: The product can run as an MCP server that exposes its own tools to other clients.
- Status: platform done
- Code: apps/cli/src/app_server.rs:50; apps/cli/src/app_server.rs:111; apps/cli/src/app_server.rs:134; apps/cli/src/app_server.rs:165; apps/cli/src/app_server.rs:219; apps/cli/src/app_server.rs:224; apps/cli/src/lib.rs:813

## S98.14 MCP gateway/proxy.
- Should: A server-side gateway proxies MCP operations for a user, applying auth and permissions.
- Status: platform done
- Code: apps/web/app/api/connectors/[connectorId]/mcp/route.ts:69; apps/web/lib/user-connector-tools.ts:2079

## S98.15 Private-network bridge.
- Should: A bridge lets cloud connectors reach services on a customer's private network.
- Status: platform missing

## S98.16 Interactive-app host bridge.
- Should: A host bridge renders MCP App resources in a sandbox and relays calls between widget and server.
- Status: platform done
- Code: apps/web/features/chat/components/messages/cards/McpAppCard.tsx:139; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:241; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2147

## S98.17 Plugin registry.
- Should: A plugin registry lists available plugins with versions and metadata.
- Status: platform done
- Code: apps/web/db/neon/0096_plugin_registry.sql:33; apps/web/lib/services/plugin-registry-service.ts:201; apps/web/app/api/plugins/route.ts:8

## S98.18 Plugin package validator.
- Should: Plugin packages are validated (manifest, integrity, signature) before they can be installed.
- Status: platform done
- Code: apps/web/lib/services/plugin-marketplace-service.ts:114; apps/web/lib/services/plugin-marketplace-service.ts:779

## S98.19 Plugin dependency resolver.
- Should: Installing a plugin resolves and installs the plugins it depends on.
- Status: platform done
- Code: apps/web/app/api/plugins/authored/route.ts:144; apps/web/app/api/plugins/uploads/route.ts:57

## S98.20 Plugin installer/updater.
- Should: Plugins can be installed, updated to a newer version and uninstalled.
- Status: platform done
- Code: apps/web/lib/services/plugin-installation-service.ts:148; apps/web/lib/services/plugin-lifecycle.ts:603; apps/web/app/api/plugins/updates/route.ts:82

## S98.21 Skill registry.
- Should: A skill registry lists the skills available to a user, including plugin-provided ones.
- Status: platform done
- Code: apps/web/lib/services/skill-catalog-service.ts:222; apps/web/app/api/skills/route.ts:31

## S98.22 Skill resource loader.
- Should: A skill's bundled files (scripts, references, assets) can be loaded when the skill is used.
- Status: platform done
- Code: apps/web/app/api/skills/[name]/files/[...path]/route.ts:54; apps/web/app/api/skills/[name]/files/[...path]/route.ts:65

## S98.23 Hook dispatcher.
- Should: A hook dispatcher runs configured hooks at lifecycle events and applies their outcome.
- Status: platform done
- Code: apps/cli/src/features/hooks/hooks.rs:1155; apps/cli/src/agent/chat.rs:260

## S98.24 Command registry.
- Should: A command registry merges built-in, skill, plugin and custom commands for the command surface.
- Status: platform done
- Code: apps/cli/src/command_registry.rs:56; apps/cli/src/command_registry.rs:90

## S98.25 Marketplace catalog service.
- Should: A marketplace service registers plugin catalogs and keeps them refreshed.
- Status: platform done
- Code: apps/web/db/neon/0159_plugin_marketplace_sources.sql:22; apps/web/app/api/plugins/marketplaces/route.ts:76; apps/web/lib/services/plugin-marketplace-service.ts:480

## S98.26 Publisher identity service.
- Should: Publishers have verified identities and installs check a package came from its publisher.
- Status: not applicable anywhere

## S98.27 Organization distribution service.
- Should: An organization can distribute approved extensions (servers, plugins, skills) to its members.
- Status: platform done
- Code: apps/web/features/plugins/server/directory/archive.ts:496; apps/web/app/api/settings/organization/plugins/route.ts:87; apps/web/lib/services/organization-plugin-service.ts:416; apps/web/features/plugins/server/directory/installed-skills.ts:105

## S98.28 Package scanning.
- Should: Extension packages are scanned for dangerous content and blocked or flagged before install.
- Status: platform done
- Code: apps/web/lib/services/plugin-marketplace-service.ts:215; apps/web/lib/services/plugin-marketplace-service.ts:271; apps/web/db/neon/0232_plugin_package_signing_and_permission_review.sql:89

## S98.29 Extension evaluation service.
- Should: Extensions are evaluated (quality/safety runs) before or after publication.
- Status: platform done
- Code: apps/web/lib/services/organization-plugin-service.ts:227; apps/web/lib/services/plugin-submission-service.ts:196; apps/web/lib/services/user-skill-service.ts:123
