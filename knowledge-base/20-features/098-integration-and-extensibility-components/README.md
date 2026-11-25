---
id: "AREA-098"
type: "area"
title: "Integration and extensibility components"
features: ["F098-01", "F098-02", "F098-03", "F098-04", "F098-05", "F098-06", "F098-07", "F098-08", "F098-09", "F098-10", "F098-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 98. Integration and extensibility components

This area lets a person connect outside services (mail, calendars, files, chat, tickets, and similar tools) and lets the assistant use them with the person's permission. It also covers MCP (a standard way for AI tools to talk to outside servers), add-on packages called plugins, skills (bundles of instructions and files), and hooks (commands that run at set moments). Together these let the product grow without changing its core code. The brief's status is "platform" only, so these parts are judged on the server and runtime side, not on each app's screens.

**Who uses it.** Signed-in people connect their own accounts (per-user OAuth grants, see apps/web/lib/connectors/oauth-store.ts). Workspace admins distribute approved plugins, skills and servers to members (apps/web/lib/services/organization-plugin-service.ts, apps/web/app/api/settings/organization/plugins/route.ts). Developers author plugins and skills (apps/web/app/api/plugins/authored/route.ts, apps/web/app/api/plugins/uploads/route.ts) and write hook files (~/.agiworkforce/hooks.json, apps/cli/src/features/hooks/hooks.rs:3). Outside providers send signed webhooks in. Other AI clients connect to this product as an MCP server (apps/cli/src/app_server.rs:132). Plan gates were not found in the files read, so who may connect by plan is unknown.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F098-01](F098-01-connect-a-service-account.md) | Connect a service account | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-02](F098-02-keep-connections-working.md) | Keep connections working | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-03](F098-03-use-a-connected-service-in-chat.md) | Use a connected service in chat | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-04](F098-04-connect-mcp-servers-and-show-their-interactive-app.md) | Connect MCP servers and show their interactive apps | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-05](F098-05-let-other-tools-use-this-product.md) | Let other tools use this product | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-06](F098-06-receive-events-from-outside-services.md) | Receive events from outside services | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-07](F098-07-connector-search-index-and-private-network-bridge.md) | Connector search index and private network bridge (not built) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-08](F098-08-find-and-install-plugins.md) | Find and install plugins | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-09](F098-09-plugin-trust-and-organization-rollout.md) | Plugin trust and organization rollout | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-10](F098-10-skills-and-commands.md) | Skills and commands | n/a | n/a | n/a | n/a | n/a | n/a |
| [F098-11](F098-11-automation-hooks.md) | Automation hooks | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/098-integration-and-extensibility-components.md](../../10-requirements/capabilities/098-integration-and-extensibility-components.md).

## How this area works in the code

1. **1. The catalog defines each service.** Each service has an id, auth scheme, scope source, risk class, release state and the surfaces it runs on. Services can be cloud-web or desktop-local. Services that are not built in declare no action list; the provider decides at connect time. (`apps/web/lib/connectors/catalog.ts:161`, `apps/web/lib/connectors/catalog.ts:105-137`, `apps/web/lib/connectors/mcp-endpoints.ts:10-16`, `apps/web/app/api/connectors/directory/route.ts:113-149`)
2. **2. The person starts a connection.** The server records an authorization in progress with a hashed state value, the account key and label, and an expiry. The person is sent to the service's sign-in page. (`apps/web/db/neon/0253_connector_accounts.sql:69-75`, `apps/web/lib/connectors/oauth-store.ts:125-139`)
3. **3. The callback checks state and finishes.** The callback reads the state from the URL, rejects a missing or malformed one, and checks it belongs to the person and the service. Then it exchanges the code and stores the grant. (`apps/web/app/api/connectors/oauth/callback/route.ts:28`, `apps/web/app/api/connectors/oauth/callback/route.ts:66-68`, `apps/web/lib/connectors/oauth-store.ts:111-123`)
4. **4. The grant is saved per account.** Tokens are written encrypted. A new account becomes the default only if no other live default exists. A re-authorization of the same account overwrites that account's row. (`apps/web/lib/connectors/oauth-store.ts:294-319`, `apps/web/lib/connectors/oauth-store.ts:280-292`)
5. **5. A token is read only when needed.** The grant is read with the account filter if one was given; otherwise the default account is used first. Tokens are decrypted only in this read. (`apps/web/lib/connectors/oauth-store.ts:494-514`, `apps/web/lib/connectors/oauth-store.ts:516-543`)
6. **6. Expiring tokens are refreshed once.** Concurrent callers for the same grant share one in-flight refresh inside the process. The refresh then runs under a database lock. A slow refresh returns a reauthorization result. (`apps/web/lib/connectors/oauth-access.ts:37`, `apps/web/lib/connectors/oauth-access.ts:136-149`, `apps/web/lib/connectors/oauth-access.ts:173-188`)
7. **7. Scope growth needs consent.** The app compares the scopes the person agreed to with the scopes the connector now asks for. Any added scope requires fresh consent. (`apps/web/lib/connectors/scopes-escalation.ts:19-40`, `apps/web/lib/connectors/scopes-escalation.ts:48-54`)
8. **8. A tool call goes through the gateway.** The gateway checks the person and the connector and proxies the MCP call. Built-in service adapters run the call. External sends ask the person first. (`apps/web/app/api/connectors/[connectorId]/mcp/route.ts:69`, `apps/web/lib/user-connector-tools.ts:2079`, `apps/web/lib/connectors/microsoft-graph.ts:410`, `apps/web/lib/connectors/microsoft-graph.ts:448`)
9. **9. Calls are logged and health is read.** Each call is written to a call log. Health and gate decisions are computed from the recent entries. (`apps/web/lib/connectors/health.ts:290-298`, `apps/web/lib/connectors/health.ts:300-323`)
10. **10. Inbound events are verified.** Signed events from outside services are checked against a secret before they are routed. Bad signatures get a 401. (`apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:63-82`, `apps/web/app/api/github/webhook/route.ts:71-78`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/connectors/catalog.ts` | Single list of every connector: auth scheme, risk class, surfaces, release state, and declared actions. |
| `apps/web/lib/connectors/oauth-store.ts` | Reads and writes connected accounts and grants, picks the default account, and decodes tokens. |
| `apps/web/app/api/connectors/oauth/callback/route.ts` | Receives the sign-in return, checks state, and finishes the connection. |
| `apps/web/lib/connectors/oauth-access.ts` | Hands out a usable access token, refreshing it once even under concurrent requests. |
| `apps/web/lib/connectors/scopes-escalation.ts` | Detects when a connector asks for wider scopes and forces fresh consent. |
| `apps/web/lib/connectors/health.ts` | Summarises recent calls into connection health and gate decisions. |
| `apps/web/lib/connectors/microsoft-graph.ts` | Built-in adapter for mail, calendar, files and chat; sends always ask first. |
| `apps/web/lib/custom-connector-crypto.ts` | Seals and opens custom connector credentials; supports older plain bearer rows. |
| `crates/agiworkforce-mcp/src/client.rs` | MCP client: connect, list and call tools, resources and prompts, and probe the server revision. |
| `apps/cli/src/app_server.rs` | Runs the product as an MCP server on stdio for other clients. |
| `apps/cli/src/features/hooks/hooks.rs` | Loads hooks.json and holds the hook rules, matchers and sandbox setting. |
| `apps/web/lib/services/plugin-marketplace-service.ts` | Plugin integrity checks (digest, signature) and package scanning before install. |

## What is stored

- Connected account grants: encrypted access and refresh tokens, granted scopes, expiry, account key, label, scope (personal/work/service) and default flag: Neon table public.connector_oauth_grants (apps/web/db/neon/0097_connector_oauth_broker.sql:92; 0253_connector_accounts.sql:30)
- In-flight sign-in authorizations: hashed state, account fields, expiry, consumed time: Neon table public.connector_oauth_authorizations (0097; 0253_connector_accounts.sql:72-75)
- Connector call log used for health and gates: Neon, read through the call-log helper in apps/web/lib/connectors/health.ts:305 (exact table not verified)
- Custom connector credentials, encrypted: Stored value sealed by apps/web/lib/custom-connector-crypto.ts:64-69; the column is not verified
- Plugin registry, marketplace sources, signing and permission review: Neon migrations 0096_plugin_registry.sql, 0159_plugin_marketplace_sources.sql, 0232_plugin_package_signing_and_permission_review.sql
- Hook rules and trigger file: ~/.agiworkforce/hooks.json (apps/cli/src/features/hooks/hooks.rs:3); triggers file at hooks.rs:710

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **CONNECTOR_OAUTH_PROVIDERS_JSON**: Adds operator-defined OAuth providers (URLs, transport, scopes) at runtime. (apps/web/.env.example:415; read by apps/web/lib/connectors/catalog.ts and mcp-oauth-provider.ts (named in rg match, line not opened))
- **CONNECTOR_OAUTH_<ID>_CLIENT_ID and CONNECTOR_OAUTH_<ID>_CLIENT_SECRET**: Turns on one provider; a partly configured provider is not usable. Microsoft Graph services stay off until these are set. (apps/web/.env.example:413-417; apps/web/lib/connectors/directory/connectable.ts:22-24 shows needs-setup when not set)
- **CONNECTOR_OAUTH_REDIRECT_BASE_URL**: Sets the redirect address for sign-in; without it the connect mode reads needs-setup. (apps/web/.env.example:423; apps/web/lib/connectors/directory/connectable.ts:24)
- **Token storage availability**: If token storage is not available, connectors show needs-setup and cannot connect. (apps/web/lib/connectors/directory/connectable.ts:22)
- **Hook sandbox for user hooks**: Runs user hooks in the sandbox by default; turning it off runs them in the session folder. A managed policy can force the sandbox. (apps/cli/src/features/hooks/hooks.rs:519-521)
- **Rate limits per route**: Limits directory reads, trigger webhooks and code-host webhooks. (apps/web/app/api/connectors/directory/route.ts:114; apps/web/app/api/webhooks/connectors/[triggerId]/route.ts:39; apps/web/app/api/github/webhook/route.ts:65)
- **Connector release state and surfaces**: Marks a connector as generally available, operator-enabled or desktop-only, and which surface it runs on. (apps/web/lib/connectors/catalog.ts:40, 100-101, 120, 136)
- **Separate sandbox origin for MCP apps**: Interactive MCP apps refuse to run in production without a separate sandbox origin. (apps/web/features/chat/components/messages/cards/McpAppCard.tsx:113-117)

## Shared between apps

Shared: the connector catalog imports @agiworkforce/cloud-contracts and @agiworkforce/client-runtime (apps/web/lib/connectors/catalog.ts:1-10), so the catalog's health and risk rules are shared with other packages. The MCP client is a Rust crate (crates/agiworkforce-mcp), separate from the web server. Desktop-local connectors (local-filesystem, terminal, browser-automation, screen-vision) are declared as device-only in the catalog and run on the device (catalog.ts:207-211). Whether the CLI and desktop both import the Rust MCP crate was not verified. Separate per app: the chat card for MCP apps is in the web chat UI (McpAppCard.tsx); the CLI command registry and hook dispatcher are CLI only.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says a connector search and index worker exists in status missing. Confirmed: no sync or index worker for connectors was found under apps/web/lib, apps/web/app or services (rg for connector sync and index names returned nothing). (apps/web/lib, apps/web/app, services (search, no file))
- Brief says a private-network bridge is missing. Confirmed: rg for private-network bridge found no connector bridge in apps/web, crates or apps/cli. Matches only in unrelated security and permission files. (crates/agiworkforce-mcp/src/security.rs; apps/cli/src/permissions.rs (unrelated matches))
- Brief points the hook dispatcher to chat.rs:260, but that line reads a tool call's raw arguments. It is not hook dispatch. The hook dispatch line was not located there. (apps/cli/src/agent/chat.rs:260-266; the brief's line is apps/cli/src/agent/chat.rs:260)
- Brief says every connector record includes an endpoint. The catalog record has no endpoint field. Endpoints come from a separate table, which in the part read covers only some services. Jira and Confluence share one endpoint. (apps/web/lib/connectors/catalog.ts:105-137 (no endpoint field); apps/web/lib/connectors/mcp-endpoints.ts:29-46 (same URL for confluence and jira))
- Health states in the brief (healthy, needs reauth, failing) could not be matched by name in health.ts. The test file uses needs-reauthorization. (apps/web/lib/connectors/health.ts:300-323; apps/web/lib/connectors/__tests__/shared-connector-runtime-parity.test.ts:23)
- The token refresh de-duplication is an in-memory map, so it only merges requests inside one server process. Across processes the database lock is the only guard. (apps/web/lib/connectors/oauth-access.ts:37, 173-188)

## Not established

- Plan gates: no plan check was found in the files read (callback, oauth-store, oauth-access, mcp route). Whether paid plans limit connectors or plugins is unknown.
- Health state names and how the UI shows them: not established.
- Empty, waiting and failure states in the UI for connect, plugin install and skills lists: not opened (only server routes and services were read).
- Per-app status: the brief gives platform status only, so per-app differences beyond the surface labels are unknown.
- Exact database table for the connector call log and custom connector credential storage column.
- The line numbers for oauth-scope-allowlist.ts:250, microsoft-graph.ts lines other than 410 and 448, user-connector-tools.ts:2413, plugin-installation-service.ts:148, plugin-lifecycle.ts:603, and skill-catalog-service.ts:222 were cited from the brief and not all opened.
- Whether the first-party services (GitHub, Outlook, OneDrive, Teams) have endpoint entries; the endpoint table was read only as far as posthog.
- Whether the connector routes and tools behave as the brief says end to end: this was a read-only code reading. No builds, tests, servers or localhost runs were done, so nothing was checked on localhost or one surface at a time as the relayed request asked.
- Attack-surface details such as scope allowlist contents were not reviewed.
