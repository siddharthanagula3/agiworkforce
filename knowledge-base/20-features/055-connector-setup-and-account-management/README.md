---
id: "AREA-055"
type: "area"
title: "Connector setup and account management"
features: ["F055-01", "F055-02", "F055-03", "F055-04", "F055-05", "F055-06", "F055-07", "F055-08", "F055-09", "F055-10", "F055-11", "F055-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 55. Connector setup and account management

Connectors let the assistant read and act in outside services such as Gmail, Google Drive, Linear or Notion. This area is where a person browses the connector catalogue, reads what a connector can read and change, connects it (sign-in or API key), checks that it still works, reconnects it when access expires, and disconnects it. It matters because the assistant can only use a connector that the person has connected, and every write it makes depends on the approval settings chosen here.

**Who uses it.** Signed-in users on web, desktop (which shows the same hosted web settings), mobile, the VS Code extension and the CLI. Workspace admins use the organization-shared connector settings (apps/web/app/workspace/sharing/page.tsx:10-20) to authorize a connector once for members. Plan tiers limit tool counts (apps/web/app/api/connectors/[connectorId]/credentials/route.ts:190, assertConnectorToolCapacity). Connectors are gated by a release state: by default only a short list of connector IDs is released (see switches), so most catalogue entries cannot be connected yet.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F055-01](F055-01-browse-the-connector-catalogue.md) | Browse the connector catalogue | built | built | built | no | n/a | n/a |
| [F055-02](F055-02-connector-detail-page.md) | Connector detail page | built | built | partly | partly | partly | n/a |
| [F055-03](F055-03-connect-with-sign-in-or-api-key.md) | Connect with sign-in or API key | built | built | built | built | n/a | n/a |
| [F055-04](F055-04-organization-shared-connectors.md) | Organization-shared connectors | built | built | n/a | n/a | n/a | n/a |
| [F055-05](F055-05-account-name-identity-and-granted-permissions.md) | Account name, identity and granted permissions | built | built | partly | no | partly | n/a |
| [F055-06](F055-06-connection-health-test-and-reconnect.md) | Connection health, test and reconnect | partly | partly | partly | built | partly | n/a |
| [F055-07](F055-07-disconnect-and-revoke.md) | Disconnect and revoke | built | built | built | built | n/a | n/a |
| [F055-08](F055-08-tool-permissions-and-write-approval.md) | Tool permissions and write approval | built | built | built | partly | n/a | n/a |
| [F055-09](F055-09-folder-or-repository-limits.md) | Folder or repository limits | built | built | no | no | n/a | n/a |
| [F055-10](F055-10-missing-permission-request-and-source-attribution.md) | Missing-permission request and source attribution | built | built | n/a | built | n/a | built |
| [F055-11](F055-11-private-network-connectors.md) | Private-network connectors | no | no | no | built | n/a | no |
| [F055-12](F055-12-not-built-or-not-applicable.md) | Not built or not applicable | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/055-connector-setup-and-account-management.md](../../10-requirements/capabilities/055-connector-setup-and-account-management.md).

## How this area works in the code

1. **1. The person opens a connector and presses Connect or Reconnect.** The shared detail view decides which primary action to show. A reconnect state shows Reconnect and a reconnect message; otherwise a connect or open action is shown. (`packages/ui/ui/src/directory/ConnectorDetailView.tsx:264-313`, `packages/ui/ui/src/directory/ConnectorDetailView.tsx:339-341`, `packages/ui/ui/src/directory/constants.ts:263-264`)
2. **2. The web app loads the catalogue and the person's connections.** The settings adapter fetches the managed connectors list and the directory in parallel. The list API merges connections from custom servers, GitHub, OAuth grants and the directory, and adds a health marker from recent calls. (`apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:513-520`, `apps/web/app/api/connectors/route.ts:233-340`, `apps/web/app/api/connectors/directory/route.ts:115`)
3. **3. The connect request is checked by policy and routed by connector type.** POST /api/connectors checks CSRF, rate limit, the workspace access gate and the connector policy. It then routes: device-only connectors are refused on web, GitHub uses its own install flow, regional and account-URL connectors are refused or sent to custom setup, bank accounts go to Plaid, and OAuth connectors return an oauthStartPath with a 409 that tells the client to start sign-in. (`apps/web/app/api/connectors/route.ts:530-581`, `apps/web/app/api/connectors/route.ts:583-592`, `apps/web/app/api/connectors/route.ts:690-722`)
4. **4. Sign-in start builds the provider request.** The OAuth start route checks token storage (503 if unavailable), runs the workspace access and connector policy again, reads existing accounts, detects scope widening (scopes above the reviewed list are dropped and re-consent is requested), then builds the provider's authorization request. (`apps/web/app/api/connectors/oauth/start/route.ts:240-280`, `apps/web/app/api/connectors/oauth/start/route.ts:310-325`)
5. **5. The provider returns to the callback.** The callback checks the state value; a malformed state returns invalid_state. It then calls the shared finish step, which exchanges the code and stores the grant, and redirects back to Connectors with a status. (`apps/web/app/api/connectors/oauth/callback/route.ts:43-52`, `apps/web/app/api/connectors/oauth/callback/route.ts:66-79`, `apps/web/lib/connectors/finish-authorization.ts:65`)
6. **6. The token is exchanged and the account label is read.** The OAuth client exchanges the code for tokens and takes a display label from the identity token's email, preferred username or UPN claim. (`apps/web/lib/connectors/oauth-client.ts:158`, `apps/web/lib/connectors/accounts.ts:14-31`)
7. **7. The grant is stored.** Grants are written to the connector OAuth tables with an account key ('default' for every grant written before multiple accounts). Listing reads accounts by connector and user. (`apps/web/lib/connectors/oauth-store.ts:67`, `apps/web/lib/connectors/oauth-store.ts:302`, `apps/web/lib/connectors/oauth-store.ts:613`, `apps/web/lib/connectors/accounts.ts:1-9`)
8. **8. Disconnect and revoke.** DELETE removes the connector's stored grant (and custom connector rows and tool permissions) and asks the provider to revoke the token. The result is reported as revoked, nothing to revoke, or not revoked with a manage link. (`apps/web/app/api/connectors/route.ts:880-906`, `apps/web/app/api/connectors/route.ts:807`, `apps/web/lib/connectors/oauth-access.ts:285-299`, `apps/web/lib/connectors/oauth-access.ts:185-193`)
9. **9. Health, test and tool permissions at call time.** The health endpoint returns each connector's health state. The capability catalogue for one connector lists its tools with read-only flag and risk tier. The credentials route probes an API-key connector before saving it and maps failures to 502 messages. Per-tool levels Allow, Ask and Deny are set in the permissions panel. (`apps/web/app/api/connectors/health/route.ts:17-30`, `apps/web/lib/connectors/health.ts:42`, `apps/web/app/api/connectors/[connectorId]/capabilities/route.ts:48-95`, `apps/web/app/api/connectors/[connectorId]/credentials/route.ts:175-190`, `apps/web/features/connectors/components/ToolPermissionsPanel.tsx:74-101`)

## Files to know

| File | Role |
|---|---|
| `packages/contracts/types/src/connector-release.ts` | Release gate. Sets the default state to coming_soon and lists the 13 connector IDs that are released selectively. |
| `apps/web/app/api/connectors/route.ts` | Main connector API: list (GET, line 233), connect (POST, line 530) and disconnect (DELETE, line 880). |
| `apps/web/app/api/connectors/oauth/start/route.ts` | Starts the provider sign-in, runs policy checks and scope-widening checks, and builds the consent request. |
| `apps/web/app/api/connectors/oauth/callback/route.ts` | Receives the provider redirect, checks state, and hands the code to the shared finish step. |
| `apps/web/lib/connectors/oauth-store.ts` | Stores and lists OAuth grants and accounts (tables connector_oauth_grants and connector_oauth_authorizations). |
| `apps/web/lib/connectors/oauth-access.ts` | Refreshes grants, marks expired or revoked ones as needing reauthorization, and revokes tokens at the provider. |
| `apps/web/lib/connectors/accounts.ts` | Account key normalisation and the readable account label taken from the sign-in token. |
| `packages/ui/ui/src/directory/ConnectorDetailView.tsx` | Shared detail page: primary action (Connect, Reconnect), operation list and read/write copy; used by web and desktop. |
| `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Web settings state: loads the catalogue and connections, and runs connect, disconnect, test and reconnect calls. |
| `apps/web/features/connectors/components/ToolPermissionsPanel.tsx` | Per-tool Allow, Ask and Deny, grouped into read-only and write categories, with reset to default. |
| `apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx` | Mobile connector detail, disconnect and write-action settings. |
| `apps/cli/src/lib.rs` | CLI connector commands (connect, API-key entry, disconnect, reconnect); Rust, separate from the web code. |

## What is stored

- OAuth grants (encrypted tokens, granted scopes, account key, reauthorization flag): Database tables public.connector_oauth_grants and public.connector_oauth_authorizations, through apps/web/lib/connectors/oauth-store.ts:67 and :302. Token encryption via apps/web/lib/custom-connector-crypto.ts (existence checked; cipher not read).
- Custom (self-entered MCP server) connector rows: Database, through apps/web/lib/connectors/mcp-custom-connections.ts (insertCustomConnector, deleteCustomConnectorRows).
- Per-tool permission levels: Database, cleared by clearConnectorToolPermissions in apps/web/lib/connectors/mcp-custom-connections.ts:403 (storage table not read).
- Recent connector call outcomes used for not-responding health: Database, read by apps/web/lib/services/connector-call-log-service.ts (imported at apps/web/app/api/connectors/route.ts:55; file not opened).
- Pending sign-in state: Database table connector_oauth_authorizations (apps/web/lib/connectors/oauth-store.ts:67).
- Browser storage, device storage: Not established in this review.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **CONNECTOR_RELEASE_STATE (default 'coming_soon')**: When not 'released', only the connector IDs in SELECTIVELY_RELEASED_CONNECTOR_IDS are usable: airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist. (packages/contracts/types/src/connector-release.ts:14 and :18-32; read by apps/web/lib/connectors/finish-authorization.ts:65, apps/web/lib/connectors/connector-capability.ts:76, apps/web/lib/user-connector-tools.ts:2083, :2276, :2451.)
- **Per-provider OAuth client ID and secret**: A provider's sign-in is offered only when its client ID and secret are set; otherwise the start route returns a not-configured message. (apps/web/lib/connectors/oauth-registry.ts:125-126; apps/web/lib/connectors/oauth-setup.ts:109-110.)
- **Inline OAuth provider list**: Provider configuration can be given as one environment value. (apps/web/lib/connectors/oauth-registry.ts:138.)
- **OAuth redirect base URL**: Sets where the provider sends the person back. A development-only branch exists. (apps/web/lib/connectors/oauth-registry.ts:215 and :223-224.)
- **Token storage availability**: Without it, connect and API-key entry are refused (503). (apps/web/app/api/connectors/route.ts:691; apps/web/app/api/connectors/oauth/start/route.ts:7; apps/web/app/api/connectors/[connectorId]/credentials/route.ts (uses the same check).)
- **Connector policy and workspace access gate**: Refuses connects an admin or plan policy blocks. (apps/web/app/api/connectors/route.ts:539 and :563-580; apps/web/app/api/connectors/oauth/start/route.ts:16-35.)
- **Sensitive-data region refusal**: Refuses certain connectors in some regions. (apps/web/app/api/connectors/route.ts:626; apps/web/app/api/connectors/oauth/start/route.ts:244.)
- **Operator-mapped connectors**: Connectors mapped by the operator skip the self-service OAuth branch. (apps/web/app/api/connectors/route.ts:555 and :690.)
- **Plan tool capacity**: Caps how many tools a connector may expose, by plan tier. (apps/web/app/api/connectors/[connectorId]/credentials/route.ts:190; apps/web/lib/connectors/mcp-custom-connections.ts:227 (assertConnectorToolCapacity).)
- **Default tool approval**: A critical tool or an unknown tool is forced to Ask even when set to Allow. (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:101 and :138.)
- **Rate limit bucket**: Limits how often connector API calls run. (apps/web/app/api/connectors/route.ts:119 and :536; apps/web/app/api/connectors/health/route.ts:15.)

## Shared between apps

[{"what":"Directory, connector detail view and settings modal UI","shared_or_separate":"Shared between web and desktop (packages/ui/ui/src/directory, packages/ui/ui/src/settings-modal)."},{"what":"Unified chat connector card","shared_or_separate":"Shared across surfaces (packages/ui/unified-chat/src/components/ConnectorConnectCard.tsx)."},{"what":"Connector contracts and consent copy","shared_or_separate":"Shared (packages/contracts/cloud-contracts, packages/contracts/types)."},{"what":"Connector client runtime","shared_or_separate":"Shared client code (packages/client/client-runtime/src/connectors/runtime.ts), used by the apps that call it."},{"what":"OAuth flow for Rust surfaces","shared_or_separate":"Shared Rust crate (crates/agiworkforce-mcp/src/oauth/flow.rs) used by the CLI."},{"what":"Web connector API and server logic","shared_or_separate":"Web only (apps/web/app/api/connectors, apps/web/lib/connectors); desktop calls the same web API."},{"what":"Mobile connector screens and service","shared_or_separate":"Separate per app (apps/mobile/src/features/settings/cloud-connectors, apps/mobile/services/connectors.ts)."},{"what":"CLI connector commands and TUI","shared_or_separate":"Separate per app (apps/cli/src/lib.rs, apps/cli/src/tui/tui_app.rs)."},{"what":"VS Code connector presentation and client","shared_or_separate":"Separate per app (apps/extension-vscode/src/features/connectors)."}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Connectors are gated: the release state defaults to coming_soon and only 13 IDs are released, enforced at connect finish and capability checks. The brief marks catalogue and connect as done without noting this gate. (packages/contracts/types/src/connector-release.ts:14-32; apps/web/lib/connectors/finish-authorization.ts:65)
- Brief citations that do not match the code: accounts.ts:134 does not exist (file has 31 lines); callback route:153 does not exist (file has 82 lines); route.ts:684 is inside the connect handler, not disconnect (disconnect is DELETE at :880). (apps/web/lib/connectors/accounts.ts; apps/web/app/api/connectors/oauth/callback/route.ts; apps/web/app/api/connectors/route.ts:684 and :880)
- The brief marks mobile account name and identity as missing, but a mobile account-rows component exists. (apps/mobile/src/features/settings/cloud-connectors/ConnectorAccountSummary.tsx)
- Multiple accounts are marked not applicable, but the storage layer keys grants by account and lists accounts per connector. The connector list keeps only the first grant per connector, so a second account would not show in the list. (apps/web/lib/connectors/oauth-store.ts:90 and :613; apps/web/app/api/connectors/route.ts:274-276)
- Read-only mode (S55.26) is marked done on web, but the permissions panel shows Read-only tools only as a category grouping with per-tool Allow/Ask/Deny. No single read-only switch was seen in the lines read. (apps/web/features/connectors/components/ToolPermissionsPanel.tsx:56, :74-88, :266-273)
- Reconnect (S55.20) is marked partial with a pending live check. Code exists on web and desktop shared UI; the live check was not run in this read-only review. (packages/ui/ui/src/directory/ConnectorDetailView.tsx:305-313; packages/ui/ui/src/settings-modal/SettingsModal.tsx:238-244)
- Data-retention explanation (S55.28) is marked done on web. Only three of the six consent points were read and none named a retention period. (packages/contracts/cloud-contracts/src/connector-trust-copy.ts:8-20)

## Not established

- No build, test, server or localhost run was done. The brief asked for localhost testing, but this task was read-only and forbade running anything. Nothing in this guide has been verified live.
- Whether the connect route itself refuses unreleased connectors. connectorReleased is called in finish-authorization.ts:65 and in user-connector-tools.ts, but the POST route was not traced for that check.
- The disconnect handler body (route.ts:880-906) and its helper disconnectConnectorOAuthGrant in apps/web/lib/connectors/oauth-access.ts were only partly read.
- Exact database schema, column names and encryption method for grants. Only the insert statements at oauth-store.ts:67 and :302 were seen.
- Browser storage or device storage use. Not searched.
- The desktop app: the brief says desktop shares web code. Whether the Electron build has its own connector wiring was not checked.
- CLI lines cited by the brief (lib.rs:1337, 1553, 2542, 2571, 3226, 4108, 4254; registry.rs:261; mod.rs:228, 669, 730) were not opened.
- Mobile service code and the mobile detail screen cited by the brief (ConnectorDetailScreen.tsx:98, 318, 352, 481, 588, 768, 816, 865, 1172) were only partly checked.
- Organization-shared route details (apps/web/app/api/settings/organization/shared/connectors/[connectorId]/route.ts) and OrganizationSharingSection.tsx were not read.
- The plan limits behind assertConnectorToolCapacity (mcp-custom-connections.ts:227) and the tiers they use were not read.
- Whether the VS Code extension and Chrome extension connector screens match the brief's status lines was not checked beyond connectorPresentation.ts:56.
- Mobile and VS Code gaps in the brief were taken from the brief, not verified in code.
