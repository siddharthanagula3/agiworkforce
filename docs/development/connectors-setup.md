# Connector setup

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-27

What a deployment must hold before each connector in the directory can be
connected from the browser, with the exact environment variable names. Values
never appear here or anywhere in the repository; production values live in the
protected Vercel project environment, local values in `apps/web/.env.local`.

`GET /api/connectors` returns a `setup` map naming, per curated connector, the
variables still missing on the running deployment. The directory shows
"Needs setup" for exactly those ids. When the map entry disappears the
connector is connectable.

## How a directory entry connects

| `connectable` mode | What the browser does                                                                                                           | What the deployment needs                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `connect`, open    | `POST /api/connectors` lists the server's tools and saves a custom connector row                                                | Nothing                                                                      |
| `connect`, OAuth   | `POST /api/connectors` answers 409 with `oauthStartPath`; the start route runs discovery and the authorization steps below      | `CONNECTOR_OAUTH_REDIRECT_BASE_URL`, `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` |
| `api-key-form`     | `GET /api/connectors/<id>/credentials` says which header the key travels in; `POST` tests the MCP tools list call before saving | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY`                                      |
| `needs-setup`      | Nothing; the entry names the missing variables                                                                                  | See the checklist below                                                      |
| `desktop-and-cli`  | Nothing on the web                                                                                                              | Not applicable                                                               |

Registry entries are keyed by their registry name (for example
`ch.cowork24/booking`). A directory OAuth grant is stored under that name and
its chat tools are offered under a derived `dir-` server id, so tool names
stay valid for every model provider.

## Custom connectors added by URL

A custom connector carries either a bearer token or nothing. When its server
answers the add probe with an authorization challenge, or publishes protected
resource metadata, the row is saved with `sign_in_required` and the browser
starts `GET /api/connectors/oauth/start?connectorId=custom-<short_id>` at once.
The start route authorizes it like a directory server (steps below), and the
grant is stored in `connector_oauth_grants` under `custom-<short_id>`; a row
without a token sends that grant's access token and refreshes it like any
discovered grant.

Under Advanced settings the user may give the OAuth Client ID and Client Secret
of a client they registered at the server, for servers that accept neither a
client metadata document nor dynamic registration, as Claude's custom
connectors allow (https://support.claude.com/en/articles/11175166). That client
is kept on the row (the secret sealed under the `oauth-client-secret` purpose)
and is used for that row's authorization, callback and refresh instead of the
deployment's own identity. The form shows the redirect URI to register, which
is `<origin>/api/connectors/oauth/callback` as below. A client and a bearer
token cannot be given together. Removing the connector disconnects its grant.
The columns come from migration 0313, which must be applied before this code
is deployed, because the connector list reads `sign_in_required`.

## Variables every OAuth connector shares

| Name                                    | Production                                                     | Local                                                                                       |
| --------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `CONNECTOR_OAUTH_REDIRECT_BASE_URL`     | The public HTTPS origin, for example `https://app.example.com` | `http://localhost:3100` is accepted outside production; falls back to `NEXT_PUBLIC_APP_URL` |
| `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex characters, required                                    | Optional; a throwaway key is generated per process when unset                               |
| `CONNECTOR_OAUTH_PROVIDERS_JSON`        | Descriptor list for pre-registered OAuth apps (non-secret)     | Same shape                                                                                  |
| `CONNECTOR_OAUTH_<ID>_CLIENT_ID`        | Client id for one descriptor                                   | Same                                                                                        |
| `CONNECTOR_OAUTH_<ID>_CLIENT_SECRET`    | Client secret for one descriptor                               | Same                                                                                        |

`<ID>` is the connector id upper-cased with `-` replaced by `_`, so
`google-calendar` reads `CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_ID`. A
descriptor whose pair is missing is treated as absent, never advertised.

Four URLs derive from `CONNECTOR_OAUTH_REDIRECT_BASE_URL`:

- Redirect URI: `<origin>/api/connectors/oauth/callback`
  (`CONNECTOR_OAUTH_CALLBACK_PATH` in `packages/contracts/cloud-contracts`).
  Register it verbatim at every vendor console.
- Web client metadata document, the hosted app's client id at servers that
  accept one by URL: `<origin>/.well-known/oauth-client-metadata`. It lists only
  the redirect URI above and declares `application_type` `web`.
- Native client metadata documents, one per app so each consent screen names
  it: `<origin>/.well-known/oauth-client-metadata/cli` ("AGI Workforce CLI")
  and `<origin>/.well-known/oauth-client-metadata/desktop` ("AGI Workforce
  Desktop"). Each lists the loopback redirects `http://127.0.0.1/callback` and
  `http://localhost/callback`, which a server must accept on any port, and
  declares `application_type` `native`. Keeping loopback redirects out of the
  web document means no local process can present itself as the hosted app.

These documents need HTTPS, so a localhost build registers dynamically instead.

The GitHub App uses its own callback: `<origin>/api/github/oauth/callback`.

## How a connection is authorized

This follows the MCP 2026-07-28 authorization specification:

1. A pre-registered app (a descriptor below with its client pair) is used when
   one exists for the connector.
2. Otherwise the server's protected resource metadata names its authorization
   server. When that server advertises `client_id_metadata_document_supported`,
   the web client metadata document is the client id.
3. Otherwise the deployment registers dynamically, sending `application_type`
   `web` (`native` for a localhost build). Registrations are stored per issuer in
   `mcp_oauth_clients`, never reused with another authorization server, and made
   again when a server moves to a different one.
4. PKCE with `S256` is always used. A discovered server whose authorization
   server metadata omits `S256` from `code_challenge_methods_supported`, or
   publishes no metadata at all, is refused; so is a pre-registered app whose
   server publishes metadata without it. A descriptor may declare
   `codeChallengeMethodsSupported` for an authorization server that supports
   `S256` but omits the field from its metadata, as Microsoft Entra does; the
   declaration is read only when the field is absent, never over a list that
   leaves `S256` out.
5. The `resource` parameter names the MCP server in the authorization, token and
   refresh requests. A descriptor may set `resourceIndicator` to `false` for an
   authorization server that rejects the parameter, as Microsoft Entra's v2
   endpoints do; the token's audience then comes from its scopes.
6. The callback compares any `iss` it receives with the issuer recorded when the
   flow started, and rejects the response, error responses included, when they
   differ or when the server promises `iss` and omits it.
7. A token refresh is single-flight per grant across instances: the refreshing
   caller holds a row lock on the grant, and every other caller waits for it and
   uses the rotated token instead of presenting the refresh token again.

Descriptor fields, validated by `apps/web/lib/connectors/oauth-registry.ts`:
`connectorId`, `displayName`, `issuer`, `authorizationUrl`, `tokenUrl`,
`revocationUrl`, `mcpUrl`, `transport`, `scopes`, `tokenAuthMethod`,
`authorizationParams`, `codeChallengeMethodsSupported`, `resourceIndicator`,
`mcpHeaders`, `enabled`. `mcpHeaders` names at most four `X-MCP-*` option
headers sent with every call to the MCP server beside the grant's
`Authorization`, which it cannot replace. `issuer` names the authorization server the app was registered with:
when the server's protected resource metadata no longer lists it, and lists no
authorization server whose own metadata declares it, the connector is refused
rather than sending the pair to a different server, and the callback checks
`iss` against it. The second clause covers Microsoft's `organizations`
authority, whose metadata declares the `{tenantid}` template as its issuer. Without `issuer` the issuer is
taken from the server's metadata when that metadata's token endpoint is
`tokenUrl`. `authorizationParams` may not override `resource` or any other
parameter the broker sets. Scopes above the ceiling in
`apps/web/lib/connectors/oauth-scope-allowlist.ts` are dropped at load time and
`pnpm check:connector-scopes` guards the ceiling itself.

## Founder checklist, first-party connectors

Every row: create the app at the console, register the redirect URI above, then
set the named variables in production and locally.

### GitHub (GitHub App)

- Console: https://github.com/settings/apps, New GitHub App.
- Callback URL: `<origin>/api/github/oauth/callback`. Turn on "Request user
  authorization (OAuth) during installation" so an installation can be tied to
  the signed-in account.
- Permissions the three declared tools need: pull requests read and write,
  issues read and write, contents read. Add checks read so a Cloud Code
  session can show the CI status of the pull request it opened.
- Generate a private key and base64-encode the PEM file for
  `GITHUB_APP_PRIVATE_KEY_BASE64`.
- Variables: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`,
  `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
  `GITHUB_TOKEN_ENCRYPTION_KEY` (64 hex), `GITHUB_WEBHOOK_SECRET`.
- No scope allowlist applies; the App's own permission set is the ceiling.

### Gmail, Google Drive, Google Calendar (one Google Cloud project)

- Console: https://console.cloud.google.com/apis/credentials, OAuth client ID
  of type Web application. Configure the OAuth consent screen and enable the
  Gmail, Drive and Calendar APIs in the same project.
- Redirect URI: `<origin>/api/connectors/oauth/callback`.
- Descriptor values: `authorizationUrl`
  `https://accounts.google.com/o/oauth2/v2/auth`, `tokenUrl`
  `https://oauth2.googleapis.com/token`, `revocationUrl`
  `https://oauth2.googleapis.com/revoke`, `authorizationParams`
  `{"access_type":"offline","prompt":"consent"}` so a refresh token is issued.
- `mcpUrl` per connector, from `apps/web/lib/connectors/directory/sources/first-party.json`:
  Gmail `https://gmailmcp.googleapis.com/mcp/v1`, Drive
  `https://drivemcp.googleapis.com/mcp/v1`, Calendar
  `https://calendarmcp.googleapis.com/mcp/v1`.
- Scopes the allowlist permits (each prefixed `https://www.googleapis.com/auth/`
  unless bare): `openid`, `profile`, `email`, `userinfo.email`,
  `userinfo.profile`, then per connector Gmail `gmail.readonly`, `gmail.compose`
  (drafts), `gmail.send`;
  Drive `drive.file`, `drive.readonly` (whole-Drive search, as Claude and
  ChatGPT; `drive.metadata.readonly` stays allowed for older grants); Calendar `calendar.readonly`,
  `calendar.events`. AGI adds two Gmail tools beside Google's server, both
  calling the Gmail API with the same grant: `send_draft` sends a draft the
  user has seen (`drafts.send`, which needs `gmail.compose`) and
  `read_attachments` reads a message's attachments as text
  (`messages.attachments.get`, which needs `gmail.readonly`), and
  `create_draft_with_attachments` builds a draft with up to five of the
  account's own files attached (`drafts.create`, which needs `gmail.compose`).
  Their declared metadata in `tool-metadata.ts` makes `read_attachments` a
  read, `create_draft_with_attachments` a write into the user's own mailbox,
  and `send_draft` a non-reversible external send, so it asks under every
  approval policy.
  The full-mailbox,
  full-drive and full-calendar scopes are
  forbidden and dropped. `gmail.modify`, which Gmail's label tools need, is left
  out like Microsoft's `Mail.ReadWrite`; admitting it is an owner decision.
- Variables: `CONNECTOR_OAUTH_GMAIL_CLIENT_ID`,
  `CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET`, `CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_ID`,
  `CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET`,
  `CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_ID`,
  `CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET`. One Google client may serve
  all three descriptors; the names stay separate.

### Google Contacts (`google-contacts`, hosted, read-only)

Looks people up so the assistant can find a recipient's address, as ChatGPT's
Google Contacts connector does (D-2026-09-28-08). Google hosts the People API
MCP server at `https://people.googleapis.com/mcp/v1` with three read tools,
`get_user_profile`, `search_contacts` and `search_directory_people`
(https://developers.google.com/workspace/guides/configure-mcp-servers, read
2026-09-28, a Workspace Developer Preview).

- Same Google Cloud project and OAuth client as above. Enable the People API and
  the People MCP API.
- Descriptor values: the Google `authorizationUrl`, `tokenUrl`, `revocationUrl`
  and `authorizationParams` above, `mcpUrl`
  `https://people.googleapis.com/mcp/v1`.
- Scopes the allowlist permits: the identity scopes above, `contacts.readonly`
  and `directory.readonly`. The contacts write scope is not admitted.
- The three tools are declared reads in `CONNECTOR_TOOL_METADATA`, so they run
  under the read-only and autonomous approval policies without asking.
- Variables: `CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID`,
  `CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_SECRET`.

### GitHub MCP server (`github-mcp`, hosted, pre-registered)

GitHub's official remote server, separate from the GitHub App integration above,
which keeps the `github` id and its three declared tools. GitHub's server needs
a client the host registers itself
(https://github.com/github/github-mcp-server).

- Console: https://github.com/settings/apps/new, a GitHub App. Callback URL
  `<origin>/api/connectors/oauth/callback`. Turn on "Expire user authorization
  tokens" so the app issues refresh tokens.
- Repository permissions for the server's default toolsets plus Actions:
  Metadata read, Contents read and write, Issues read and write, Pull requests
  read and write, Actions read. A GitHub App's permissions are its ceiling; it
  ignores the `scope` parameter.
- The remote server enables only its default toolsets unless the request names
  others, by path (`/x/<toolset>`, one at a time) or by the `X-MCP-Toolsets`
  header (a comma-separated list), so the descriptor's `mcpHeaders` names the
  five default toolsets and `actions`, which reads workflow runs and job logs
  (https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md).
  `/x/all` is not used: it would exceed the per-account connector tool cap.
- Descriptor, from the server's own metadata (fetched 2026-09-27):

  ```json
  {
    "connectorId": "github-mcp",
    "displayName": "GitHub MCP",
    "issuer": "https://github.com/login/oauth",
    "authorizationUrl": "https://github.com/login/oauth/authorize",
    "tokenUrl": "https://github.com/login/oauth/access_token",
    "mcpUrl": "https://api.githubcopilot.com/mcp/",
    "transport": "streamable-http",
    "scopes": ["offline_access"],
    "mcpHeaders": {
      "X-MCP-Toolsets": "context,repos,issues,pull_requests,users,actions"
    }
  }
  ```

- Variables: `CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID`,
  `CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_SECRET`.

### Microsoft 365 (`microsoft-365`, Microsoft MCP Server for Enterprise)

Read-only Microsoft Entra directory queries (users, groups, devices, licenses)
through `https://mcp.svc.cloud.microsoft/enterprise`, not mail or files
(https://learn.microsoft.com/en-us/graph/mcp-server/overview).

- Console: https://entra.microsoft.com, App registrations, New registration,
  "Accounts in any organizational directory" (multitenant), Web redirect URI
  `<origin>/api/connectors/oauth/callback`, then a client secret.
- API permissions: Microsoft MCP Server for Enterprise
  (`e8c77dc2-69b3-43f4-bc51-3213c9d915b4`), delegated `MCP.User.Read.All`,
  `MCP.Group.Read.All`, `MCP.GroupMember.Read.All`, `MCP.Device.Read.All`,
  `MCP.Organization.Read.All`. Each customer tenant must first provision the
  server once (`Grant-EntraBetaMCPServerPermission`) and an administrator must
  consent to these scopes
  (https://learn.microsoft.com/en-us/graph/mcp-server/get-started).
- Descriptor, from the server's own metadata (fetched 2026-09-27). Entra's
  metadata omits `code_challenge_methods_supported` and its v2 endpoints refuse
  the `resource` parameter, hence the last two fields:

  ```json
  {
    "connectorId": "microsoft-365",
    "displayName": "Microsoft 365",
    "issuer": "https://login.microsoftonline.com/{tenantid}/v2.0",
    "authorizationUrl": "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    "tokenUrl": "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    "mcpUrl": "https://mcp.svc.cloud.microsoft/enterprise",
    "transport": "streamable-http",
    "scopes": [
      "openid",
      "profile",
      "email",
      "offline_access",
      "api://e8c77dc2-69b3-43f4-bc51-3213c9d915b4/MCP.User.Read.All",
      "api://e8c77dc2-69b3-43f4-bc51-3213c9d915b4/MCP.Group.Read.All",
      "api://e8c77dc2-69b3-43f4-bc51-3213c9d915b4/MCP.GroupMember.Read.All",
      "api://e8c77dc2-69b3-43f4-bc51-3213c9d915b4/MCP.Device.Read.All",
      "api://e8c77dc2-69b3-43f4-bc51-3213c9d915b4/MCP.Organization.Read.All"
    ],
    "codeChallengeMethodsSupported": ["S256"],
    "resourceIndicator": false
  }
  ```

- Variables: `CONNECTOR_OAUTH_MICROSOFT_365_CLIENT_ID`,
  `CONNECTOR_OAUTH_MICROSOFT_365_CLIENT_SECRET`.

### Outlook, OneDrive, SharePoint and Teams (built-in Microsoft Graph adapter)

Microsoft hosts no MCP server for mail, files or chat, so these four connectors
call Microsoft Graph v1.0 directly through the adapter in
`apps/web/lib/connectors/microsoft-graph.ts` (S98.07). They stay unavailable
until the owner registers an Entra app and adds the descriptors.

- Console: https://entra.microsoft.com, App registrations, New registration,
  "Accounts in any organizational directory and personal Microsoft accounts",
  Web redirect URI `<origin>/api/connectors/oauth/callback`, then a client
  secret. One app can serve all four descriptors; the variable names stay
  separate.
- Descriptor for each connector id: `authorizationUrl`
  `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`, `tokenUrl`
  `https://login.microsoftonline.com/common/oauth2/v2.0/token`, `mcpUrl`
  `https://graph.microsoft.com/v1.0` (the API base the adapter calls; no MCP
  connection is made to it), `resourceIndicator` `false` (Entra v2 refuses the
  `resource` parameter), and `scopes` of `openid`, `profile`, `email`,
  `offline_access` plus these delegated Graph permissions, each prefixed
  `https://graph.microsoft.com/`:
  - `outlook`: `User.Read`, `Mail.Read`, `Mail.Send`, `Calendars.ReadWrite`.
    Tools `search_mail`, `read_mail`, `list_events`, `send_mail`,
    `create_event`.
  - `onedrive`: `User.Read`, `Files.Read`. Tools `search_files`, `read_file`.
  - `sharepoint`: `User.Read`, `Sites.Read.All`, which most tenants require an
    administrator to consent to. Tools `search_sites`, `search_files`,
    `read_file`.
  - `teams`: `User.Read`, `Chat.Read`, `Team.ReadBasic.All`,
    `Channel.ReadBasic.All`, work or school accounts only. Tools `list_chats`,
    `read_chat_messages`, `list_teams`, `list_channels`.
- Approvals: every read is declared a read of content other people can write,
  and results are fenced as untrusted data. `send_mail` and `create_event` are
  declared external sends, because Outlook mails an invitation to every
  attendee, so both ask under every approval policy. The message is written in
  the conversation and shown in that approval; saving a draft to Outlook needs
  `Mail.ReadWrite`, which also lets an app change and delete mail, so the
  ceiling leaves it out as it leaves out Gmail's `gmail.modify`, and admitting
  it is an owner decision. Teams channel messages need
  `ChannelMessage.Read.All`, which the ceiling does not admit, so the adapter
  lists channels and reads chats.
- Files: `read_file` reads the item's `@microsoft.graph.downloadUrl`, a
  pre-authenticated link that takes no token
  (https://learn.microsoft.com/en-us/graph/api/driveitem-get-content), so the
  token never reaches the download host. It refuses folders and files over
  10 MB and reads PDF, Word, Excel, PowerPoint and plain text.
- Variables: `CONNECTOR_OAUTH_OUTLOOK_CLIENT_ID`,
  `CONNECTOR_OAUTH_OUTLOOK_CLIENT_SECRET`, `CONNECTOR_OAUTH_ONEDRIVE_CLIENT_ID`,
  `CONNECTOR_OAUTH_ONEDRIVE_CLIENT_SECRET`,
  `CONNECTOR_OAUTH_SHAREPOINT_CLIENT_ID`,
  `CONNECTOR_OAUTH_SHAREPOINT_CLIENT_SECRET`, `CONNECTOR_OAUTH_TEAMS_CLIENT_ID`,
  `CONNECTOR_OAUTH_TEAMS_CLIENT_SECRET`.

### BigQuery

Google hosts a BigQuery MCP server at `https://bigquery.googleapis.com/mcp`
(https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp). Its protected
resource metadata, read on 2026-09-27, names `https://accounts.google.com/` as
the authorization server and `https://www.googleapis.com/auth/bigquery` as the
only supported scope, which views and manages all BigQuery data. The ceiling
admits `bigquery.readonly` and `devstorage.read_only` only, so a `bigquery`
descriptor pointing at that server cannot be granted the scope the server
asks for. Admitting the manage scope is an owner decision, like `gmail.modify`
and Box's `root_readwrite`.

Snowflake and Databricks host MCP servers per account, so there is no single
endpoint to pin; a user adds one by URL as a custom connector, as in Claude
(support.claude.com/en/articles/11175166, read 2026-09-28). Connecting the
Snowflake or Databricks card opens the custom connector form with the vendor's
name, its URL format, a link to its documentation and the OAuth fields open
(`apps/web/lib/connectors/account-url-connectors.ts`), and a URL on either
vendor's hosts is refused unless its path is that vendor's MCP path. Neither
vendor registers clients dynamically, so the user signs in with an OAuth client
their administrator created at the vendor, with this deployment's redirect URI,
or with a personal access token as the bearer token. Neither page says whether
the server publishes MCP authorization metadata, which the custom connector
sign-in needs, so the OAuth path is unverified until tried against a real
account. Snowflake-managed servers (GA) live at
`https://<account_url>/api/v2/databases/<db>/schemas/<schema>/mcp-servers/<name>`
and use Snowflake OAuth or a programmatic access token
(https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp).
Databricks managed servers (Public Preview, page updated 2026-09-21) live on
the workspace host, for example `https://<workspace-hostname>/api/2.0/mcp/sql`,
with a scope per server
(https://docs.databricks.com/aws/en/generative-ai/mcp/managed-mcp and
/agents/mcp-tools/connect-clients).

### Notion

- Self-service: `https://mcp.notion.com/mcp` accepts a client by metadata URL
  or dynamic registration, so production needs only the shared variables above.
- Optional pre-registered app, if Notion's console is preferred:
  https://www.notion.so/my-integrations, public integration, redirect URI as
  above. Descriptor `authorizationUrl` `https://api.notion.com/v1/oauth/authorize`,
  `tokenUrl` `https://api.notion.com/v1/oauth/token`, `tokenAuthMethod`
  `client_secret_basic`, `authorizationParams` `{"owner":"user"}`.
- Scopes: none; Notion has no scope parameter and the allowlist records that.
- Variables, optional: `CONNECTOR_OAUTH_NOTION_CLIENT_ID`,
  `CONNECTOR_OAUTH_NOTION_CLIENT_SECRET`.

### Linear

- Self-service: `https://mcp.linear.app/mcp`, same as Notion.
- Optional pre-registered app: https://linear.app/settings/api, OAuth
  applications. Descriptor `authorizationUrl` `https://linear.app/oauth/authorize`,
  `tokenUrl` `https://api.linear.app/oauth/token`.
- Scopes permitted: `read`, `write`, `issues:create`, `comments:create`,
  `app:assignable`, `app:mentionable`.
- Variables, optional: `CONNECTOR_OAUTH_LINEAR_CLIENT_ID`,
  `CONNECTOR_OAUTH_LINEAR_CLIENT_SECRET`.

### Jira and Confluence (Atlassian Rovo MCP server)

- Self-service: both ids use `https://mcp.atlassian.com/v2/mcp`, whose
  authorization server accepts a client by metadata URL, so production needs
  only the shared variables above. The v1 SSE endpoint they used before served
  the same product and is being retired
  (https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/).
- Scopes permitted: Jira `offline_access`, `read:me`,
  `read:jira:agent-interface`, `write:jira:agent-interface`,
  `search:jira:agent-interface`; Confluence the same with `confluence` in place
  of `jira`.

### Cloudflare

- Self-service: `https://mcp.cloudflare.com/mcp`, Cloudflare's API server, which
  covers the Workers Bindings server's scope and accepts a client by metadata URL
  (https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/).

### Airtable

- Self-service: `https://mcp.airtable.com/mcp`, same as Notion.
- Optional pre-registered integration: https://airtable.com/create/oauth.
  Descriptor `authorizationUrl` `https://airtable.com/oauth2/v1/authorize`,
  `tokenUrl` `https://airtable.com/oauth2/v1/token`.
- Scopes: no ceiling is recorded for Airtable, so the descriptor's scopes pass
  through unchanged; keep them to the data and schema read scopes the tools
  need.
- Variables, optional: `CONNECTOR_OAUTH_AIRTABLE_CLIENT_ID`,
  `CONNECTOR_OAUTH_AIRTABLE_CLIENT_SECRET`.

### HealthEx (`healthex`, health records, owner-gated)

Connects a member's own health records the way Claude's HealthEx connector does
(D-2026-09-28-08). HealthEx hosts the MCP server at `https://api.healthex.io/mcp`
and its authorization server at `https://api.healthex.io`
(https://docs.healthex.io/api-documentation/mcp-server/oauth-flow and
`/.well-known/oauth-authorization-server`, read 2026-09-28): dynamic client
registration, PKCE with S256, public or confidential clients, scopes
`patient/*.read` and `offline_access`.

- Stays unavailable until the owner configures it, deliberately: HealthEx is not
  in `MCP_ENDPOINTS`, so no member can connect it by self-registration. Before
  adding the descriptor, sign HealthEx's agreement and have a lawyer confirm
  whether the FTC Health Breach Notification Rule applies.
- Register the client once at `https://api.healthex.io/oauth/register` with the
  redirect URI `<origin>/api/connectors/oauth/callback`, then add the descriptor:
  `authorizationUrl` `https://api.healthex.io/oauth/authorize`, `tokenUrl`
  `https://api.healthex.io/oauth/token`, `revocationUrl`
  `https://api.healthex.io/oauth/revoke`, `mcpUrl` `https://api.healthex.io/mcp`,
  `scopes` `["patient/*.read","offline_access"]`, and `tokenAuthMethod` `none`
  for a public client.
- What the product enforces, from `apps/web/lib/connectors/sensitive-data-connectors.ts`:
  a member can start the connection only from the United States; only the tools
  declared as reads in `CONNECTOR_TOOL_METADATA` reach the model, so
  `update_records` and the deprecated tools do not; the sign-in window is 30
  minutes because identity verification takes longer than ten; `save_memory` is
  refused for the rest of any turn in which a health tool returned data, the
  memory extractor only ever reads the member's own message, and nothing is used
  for training. Disconnecting revokes the grant at HealthEx and erases the
  stored tokens.
- Variables: `CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID`, and
  `CONNECTOR_OAUTH_HEALTHEX_CLIENT_SECRET` only for a confidential client.

### Bank accounts (`bank-accounts`, Plaid, owner-gated)

Connects a member's own bank accounts read-only, the way ChatGPT's personal
finance experience does through Plaid (D-2026-09-28-08). There is no MCP
server: the web app opens Plaid Link, exchanges the public token server-side
(`/api/connectors/bank-accounts/link` and `/exchange`) and answers two tools
itself from `apps/web/lib/connectors/bank-accounts.ts`, following Plaid's API
reference (https://plaid.com/docs/api/, https://plaid.com/docs/link/web/, read
2026-09-28).

- Stays unavailable until the owner configures it, deliberately. Before setting
  the variables in production, sign Plaid's agreement, request production
  access for the `transactions` product, complete the application and company
  details in the Plaid Dashboard compliance center that OAuth banks require
  (https://plaid.com/docs/link/oauth/), and have a lawyer confirm whether the
  GLBA Safeguards Rule applies. `PLAID_ENV=sandbox` works with Plaid's test
  institutions and costs nothing.
- No redirect URI is registered, so an OAuth bank opens in a pop-up, which
  Plaid supports on desktop and mobile web. An in-app browser that blocks
  pop-ups cannot reach those banks.
- `get_account_balances` calls `/accounts/balance/get`, which fetches a live
  balance from the bank and is billed per call by Plaid. `get_transactions`
  calls `/transactions/get`, at most 500 per call. Neither can move money, and
  the Link token requests the `transactions` product for United States
  institutions only.
- What the product enforces: a member can link an account only from the United
  States; results are fenced as untrusted data; `save_memory` is refused for
  the rest of any turn in which a bank tool returned data, and nothing is used
  for training. Disconnecting, or erasing the account, calls `/item/remove`,
  which ends Plaid's access and its billing for the item, and erases the stored
  access token. Linking again replaces the previous item and removes it.
- The Content Security Policy admits Plaid Link's script, frame and API origin
  only while `PLAID_ENV` is set.
- Variables: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (`sandbox` or
  `production`). Set all three or none; a partial set fails production boot.

### Vendors whose official server needs a pre-registered client

These ids are marked `preregistered` in `apps/web/lib/connectors/mcp-endpoints.ts`
and stay "Needs setup" until a descriptor and its pair exist. Take
`authorizationUrl` and `tokenUrl` from the vendor's current OAuth
documentation; the console is where the pair is issued.

| Connector id | Console                                           | Scopes permitted by the allowlist                                                                                                                                                                                | Variables                                                                        |
| ------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `slack`      | https://api.slack.com/apps                        | `channels:read`, `channels:history`, `groups:read`, `chat:write`, `users:read`, `users:read.email`, `team:read`, `files:read`, `search:read.public`, `search:read.private`, `search:read.im`, `search:read.mpim` | `CONNECTOR_OAUTH_SLACK_CLIENT_ID`, `CONNECTOR_OAUTH_SLACK_CLIENT_SECRET`         |
| `asana`      | https://app.asana.com/0/my-apps, an MCP app       | `openid`, `profile`, `email`, `tasks:read`, `tasks:write`, `projects:read`, `sections:read`, `stories:read`, `stories:write`, `teams:read`, `users:read`, `workspaces:read`                                      | `CONNECTOR_OAUTH_ASANA_CLIENT_ID`, `CONNECTOR_OAUTH_ASANA_CLIENT_SECRET`         |
| `box`        | https://app.box.com/developers/console            | `root_readonly`, `item_preview`, `item_download`, `item_upload`                                                                                                                                                  | `CONNECTOR_OAUTH_BOX_CLIENT_ID`, `CONNECTOR_OAUTH_BOX_CLIENT_SECRET`             |
| `docusign`   | https://admin.docusign.com/apps-and-keys          | `signature`, `adm_store_unified_repo_read`, `aow_manage`                                                                                                                                                         | `CONNECTOR_OAUTH_DOCUSIGN_CLIENT_ID`, `CONNECTOR_OAUTH_DOCUSIGN_CLIENT_SECRET`   |
| `dropbox`    | https://www.dropbox.com/developers/apps           | `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`                                                                                                                          | `CONNECTOR_OAUTH_DROPBOX_CLIENT_ID`, `CONNECTOR_OAUTH_DROPBOX_CLIENT_SECRET`     |
| `figma`      | https://www.figma.com/developers/apps             | `current_user:read`, `files:read`, `projects:read`, `file_comments:write`, `file_dev_resources:read`                                                                                                             | `CONNECTOR_OAUTH_FIGMA_CLIENT_ID`, `CONNECTOR_OAUTH_FIGMA_CLIENT_SECRET`         |
| `hubspot`    | HubSpot developer account, Apps                   | `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.deals.write`                                                            | `CONNECTOR_OAUTH_HUBSPOT_CLIENT_ID`, `CONNECTOR_OAUTH_HUBSPOT_CLIENT_SECRET`     |
| `intercom`   | Intercom app, Developer Hub                       | None; Intercom has no scope parameter                                                                                                                                                                            | `CONNECTOR_OAUTH_INTERCOM_CLIENT_ID`, `CONNECTOR_OAUTH_INTERCOM_CLIENT_SECRET`   |
| `pagerduty`  | PagerDuty web app, Integrations, App Registration | No ceiling recorded; descriptor scopes pass through                                                                                                                                                              | `CONNECTOR_OAUTH_PAGERDUTY_CLIENT_ID`, `CONNECTOR_OAUTH_PAGERDUTY_CLIENT_SECRET` |
| `square`     | https://developer.squareup.com/apps               | No ceiling recorded; descriptor scopes pass through                                                                                                                                                              | `CONNECTOR_OAUTH_SQUARE_CLIENT_ID`, `CONNECTOR_OAUTH_SQUARE_CLIENT_SECRET`       |
| `vercel`     | https://vercel.com/dashboard/integrations/console | No ceiling recorded; descriptor scopes pass through                                                                                                                                                              | `CONNECTOR_OAUTH_VERCEL_CLIENT_ID`, `CONNECTOR_OAUTH_VERCEL_CLIENT_SECRET`       |

`slack` admits the user-token message search scopes that Slack lists for
`assistant.search.context` (https://docs.slack.dev/reference/methods/assistant.search.context).
`box` admits `root_readonly` and `item_upload` only: its folder and shared-link
tools need `root_readwrite`, which reads and writes every file in the account
(https://developer.box.com/guides/api-calls/permissions-and-errors/scopes/), so
it stays out like the full-Drive scope; admitting it is an owner decision.

`docusign` uses Docusign's production server `https://mcp.docusign.com/mcp`,
the endpoint Claude's Docusign connector lists (https://claude.com/connectors/docusign);
the demo environment is `https://mcp-d.docusign.com/mcp`
(https://developers.docusign.com/platform/mcp-server/). Its authorization server
publishes no registration endpoint and accepts only the confidential
authorization code grant, so the pair is an app's integration key and secret
from Apps and Keys, with our redirect URL added there. The descriptor takes
`authorizationUrl` `https://account.docusign.com/oauth/auth`, `tokenUrl`
`https://account.docusign.com/oauth/token`, `issuer`
`https://account.docusign.com` and `tokenAuthMethod` `client_secret_basic`.
Docusign refuses the whole grant when the account lacks one requested product,
so request only the scopes the accounts are entitled to, `signature` alone for
eSignature. The CLM `spring_read` and `spring_write` scopes the server also lists
stay out of the ceiling because no Docusign MCP tool uses them.

`asana` uses `https://mcp.asana.com/v2/mcp`; Asana shut the v1 SSE server down on
2026-08-05 and its v2 server takes no dynamic registration
(https://developers.asana.com/docs/integrating-with-asanas-mcp-server).

#### Six vendors that advertise registration and refuse it

The servers of `asana`, `dropbox`, `figma`, `intercom`, `square` and `vercel`
publish a `registration_endpoint`, but a live registration attempt on
2026-08-14 was refused by every one of them, so they stay pre-registered rather
than being switched to dynamic registration from their metadata:

| Connector id | Refusal on 2026-08-14                                                        | What the owner does                                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asana`      | 400 `invalid_redirect_uri`                                                   | Create an MCP app in the Asana developer console with our redirect URI (https://developers.asana.com/docs/integrating-with-asanas-mcp-server)                                                                                |
| `dropbox`    | 403 `registration_not_supported`, "Only pre-registered MCP trusted partners" | Register a Dropbox app with our redirect URI (https://www.dropbox.com/developers/apps), or ask Dropbox Support to add this client to dynamic registration (https://help.dropbox.com/integrations/connect-dropbox-mcp-server) |
| `figma`      | 403                                                                          | Join the waitlist for new MCP clients; only clients in Figma's MCP Catalog can connect (https://developers.figma.com/docs/figma-mcp-server/)                                                                                 |
| `intercom`   | 400 `invalid_redirect_uri`, "not in the allowlist"                           | Ask Intercom developer support to allowlist our redirect URI (https://developers.intercom.com/docs/guides/mcp); the server also accepts an Intercom access token                                                             |
| `square`     | 400 `invalid_redirect_uri`, "domain not in allowlist"                        | Request an allowlist addition in the Square developer forum's MCP category (https://developer.squareup.com/forums/c/mcp/14)                                                                                                  |
| `vercel`     | 400 `invalid_redirect_uri`                                                   | Ask Vercel to review and approve this client; Vercel MCP accepts only approved clients (https://vercel.com/docs/agent-resources/vercel-mcp)                                                                                  |

## Verifying a deployment

1. `GET /api/connectors` while signed in: the `setup` map should be empty for
   every connector that is meant to work, and `available` should list it.
2. Open the directory: the entry shows Connect, not Needs setup.
3. Connect once and open the entry: its tool list comes from the live server.
4. `cd apps/web && AGI_TEST_LIVE=1 npx vitest run lib/connectors/__tests__/directory-connect.live.test.ts`
   exercises one open server, one dynamic-registration OAuth server and one
   API-key server from the registry against the network. Without the flag the
   file is skipped and the recorded-fixture tests beside it run instead.

Related code: `apps/web/lib/connectors/oauth-setup.ts` builds the `setup`
map, `apps/web/lib/connectors/directory/connectable.ts` decides the mode, and
`apps/web/lib/connectors/mcp-directory-targets.ts` resolves registry entries
to a remote.
