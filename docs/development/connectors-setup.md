# Connector setup

Status: Current
Owner: Repository maintainers
Last updated: 2026-09-05

What a deployment must hold before each connector in the directory can be
connected from the browser, with the exact environment variable names. Values
never appear here or anywhere in the repository; production values live in the
protected Vercel project environment, local values in `apps/web/.env.local`.

`GET /api/connectors` returns a `setup` map naming, per curated connector, the
variables still missing on the running deployment. The directory shows
"Needs setup" for exactly those ids. When the map entry disappears the
connector is connectable.

## How a directory entry connects

| `connectable` mode | What the browser does                                                                                                    | What the deployment needs                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `connect`, open    | `POST /api/connectors` lists the server's tools and saves a custom connector row                                         | Nothing                                                                      |
| `connect`, OAuth   | `POST /api/connectors` answers 409 with `oauthStartPath`; the start route runs discovery and dynamic client registration | `CONNECTOR_OAUTH_REDIRECT_BASE_URL`, `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` |
| `api-key-form`     | `GET /api/connectors/<id>/credentials` says which header the key travels in; `POST` tests `tools/list` before saving     | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY`                                      |
| `needs-setup`      | Nothing; the entry names the missing variables                                                                           | See the checklist below                                                      |
| `desktop-and-cli`  | Nothing on the web                                                                                                       | Not applicable                                                               |

Registry entries are keyed by their registry name (for example
`ch.cowork24/booking`). A directory OAuth grant is stored under that name and
its chat tools are offered under a derived `dir-` server id, so tool names
stay valid for every model provider.

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

Two URLs derive from `CONNECTOR_OAUTH_REDIRECT_BASE_URL` and must be registered
verbatim at every vendor console:

- Redirect URI: `<origin>/api/connectors/oauth/callback`
  (`CONNECTOR_OAUTH_CALLBACK_PATH` in `packages/contracts/cloud-contracts`).
- Client metadata document, used by servers that accept a client id by URL:
  `<origin>/.well-known/oauth-client-metadata`. This one needs HTTPS, so a
  localhost build registers dynamically instead.

The GitHub App uses its own callback: `<origin>/api/github/oauth/callback`.

Descriptor fields, validated by `apps/web/lib/connectors/oauth-registry.ts`:
`connectorId`, `displayName`, `authorizationUrl`, `tokenUrl`, `revocationUrl`,
`mcpUrl`, `transport`, `scopes`, `usePkce`, `tokenAuthMethod`,
`authorizationParams`, `enabled`. Scopes above the ceiling in
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
  issues read and write, contents read.
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
  `userinfo.profile`, then per connector Gmail `gmail.readonly`, `gmail.send`;
  Drive `drive.file`, `drive.metadata.readonly`; Calendar `calendar.readonly`,
  `calendar.events`. The full-mailbox, full-drive and full-calendar scopes are
  forbidden and dropped.
- Variables: `CONNECTOR_OAUTH_GMAIL_CLIENT_ID`,
  `CONNECTOR_OAUTH_GMAIL_CLIENT_SECRET`, `CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_ID`,
  `CONNECTOR_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET`,
  `CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_ID`,
  `CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET`. One Google client may serve
  all three descriptors; the names stay separate.

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

### Vendors whose official server needs a pre-registered client

These ids are marked `preregistered` in `apps/web/lib/connectors/mcp-endpoints.ts`
and stay "Needs setup" until a descriptor and its pair exist. Take
`authorizationUrl` and `tokenUrl` from the vendor's current OAuth
documentation; the console is where the pair is issued.

| Connector id | Console                                           | Scopes permitted by the allowlist                                                                                                                                           | Variables                                                                          |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `slack`      | https://api.slack.com/apps                        | `channels:read`, `channels:history`, `groups:read`, `chat:write`, `users:read`, `users:read.email`, `team:read`, `files:read`                                               | `CONNECTOR_OAUTH_SLACK_CLIENT_ID`, `CONNECTOR_OAUTH_SLACK_CLIENT_SECRET`           |
| `jira`       | https://developer.atlassian.com/console/myapps/   | `offline_access`, `read:me`, `read:jira-user`, `read:jira-work`, `write:jira-work`                                                                                          | `CONNECTOR_OAUTH_JIRA_CLIENT_ID`, `CONNECTOR_OAUTH_JIRA_CLIENT_SECRET`             |
| `confluence` | https://developer.atlassian.com/console/myapps/   | `offline_access`, `read:me`, `read:confluence-space.summary`, `read:confluence-content.all`, `write:confluence-content`                                                     | `CONNECTOR_OAUTH_CONFLUENCE_CLIENT_ID`, `CONNECTOR_OAUTH_CONFLUENCE_CLIENT_SECRET` |
| `asana`      | https://app.asana.com/0/my-apps                   | `openid`, `profile`, `email`, `tasks:read`, `tasks:write`, `projects:read`, `sections:read`, `stories:read`, `stories:write`, `teams:read`, `users:read`, `workspaces:read` | `CONNECTOR_OAUTH_ASANA_CLIENT_ID`, `CONNECTOR_OAUTH_ASANA_CLIENT_SECRET`           |
| `box`        | https://app.box.com/developers/console            | `root_readonly`, `item_preview`, `item_download`, `item_upload`                                                                                                             | `CONNECTOR_OAUTH_BOX_CLIENT_ID`, `CONNECTOR_OAUTH_BOX_CLIENT_SECRET`               |
| `dropbox`    | https://www.dropbox.com/developers/apps           | `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`                                                                                     | `CONNECTOR_OAUTH_DROPBOX_CLIENT_ID`, `CONNECTOR_OAUTH_DROPBOX_CLIENT_SECRET`       |
| `figma`      | https://www.figma.com/developers/apps             | `current_user:read`, `files:read`, `projects:read`, `file_comments:write`, `file_dev_resources:read`                                                                        | `CONNECTOR_OAUTH_FIGMA_CLIENT_ID`, `CONNECTOR_OAUTH_FIGMA_CLIENT_SECRET`           |
| `hubspot`    | HubSpot developer account, Apps                   | `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.deals.write`                       | `CONNECTOR_OAUTH_HUBSPOT_CLIENT_ID`, `CONNECTOR_OAUTH_HUBSPOT_CLIENT_SECRET`       |
| `intercom`   | Intercom app, Developer Hub                       | None; Intercom has no scope parameter                                                                                                                                       | `CONNECTOR_OAUTH_INTERCOM_CLIENT_ID`, `CONNECTOR_OAUTH_INTERCOM_CLIENT_SECRET`     |
| `pagerduty`  | PagerDuty web app, Integrations, App Registration | No ceiling recorded; descriptor scopes pass through                                                                                                                         | `CONNECTOR_OAUTH_PAGERDUTY_CLIENT_ID`, `CONNECTOR_OAUTH_PAGERDUTY_CLIENT_SECRET`   |
| `square`     | https://developer.squareup.com/apps               | No ceiling recorded; descriptor scopes pass through                                                                                                                         | `CONNECTOR_OAUTH_SQUARE_CLIENT_ID`, `CONNECTOR_OAUTH_SQUARE_CLIENT_SECRET`         |
| `vercel`     | https://vercel.com/dashboard/integrations/console | No ceiling recorded; descriptor scopes pass through                                                                                                                         | `CONNECTOR_OAUTH_VERCEL_CLIENT_ID`, `CONNECTOR_OAUTH_VERCEL_CLIENT_SECRET`         |

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
