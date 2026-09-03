# Connector OAuth Scope Ceilings

Status: Current
Owner: Platform lead
Last updated: 2026-09-03
Purpose: the per-connector maximum set of OAuth scopes this platform may ever
request, and the enforcement point that drops anything above it. Companion to
`docs/security/agent-authority-and-connector-scopes.md`, which owns the wider
agent-authority matrix. That file stays the source of truth for what the agent
may do once a token exists; this file is only about how wide the token is.

## Read this first: no scope string is hardcoded in this repository

`apps/web/lib/connectors/catalog.ts` records `scopes: []` for every entry on
purpose. The `ConnectorScopeSource` type at the top of that file names the
reason: for a cloud connector the scopes are `operator-defined`, so the
repository does not know them and does not guess. There is nothing to reduce in
the catalog, because nothing is declared there.

The scopes a Managed Cloud user is actually asked to consent to come from an
operator-supplied descriptor in the `CONNECTOR_OAUTH_PROVIDERS_JSON` environment
variable, parsed by `apps/web/lib/connectors/oauth-registry.ts` and written onto
the authorization URL by `buildAuthorizationUrl` in the same file. So the only
place this repository can enforce minimality is where that descriptor is loaded.
That is what the ceiling table below does.

**Current state: no OAuth provider is configured in production.** Section 2 of
`docs/security/agent-authority-and-connector-scopes.md` records this as of
2026-08-05 and it still holds. The enforcement described here is therefore
inert against live traffic today. It exists so that the first operator who
configures a provider cannot quietly request more than this file permits.

## The four connector sources, and which one has scopes at all

Mirrors section 2 of `docs/security/agent-authority-and-connector-scopes.md`,
which cites `apps/web/lib/user-connector-tools.ts`.

| Source                               | Who decides the authority                                       | Scope ceiling applies?                              |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| GitHub App built-in                  | the App's installation permission set, configured on github.com | No. External, not declarable from code.             |
| Operator-mapped remote MCP servers   | the vendor's own MCP server plus `CONNECTOR_MCP_SERVERS_JSON`   | No. The vendor server decides what a token unlocks. |
| User's own custom remote MCP servers | the URL and bearer token the user supplies                      | No. The user holds the credential.                  |
| Platform-OAuth directory connectors  | the descriptor in `CONNECTOR_OAUTH_PROVIDERS_JSON`              | Yes. This is the enforced path.                     |

Two consequences worth stating plainly rather than implying otherwise:

- Most branded connectors in the catalog (Slack, Notion, HubSpot, Asana, Jira,
  Figma, Vercel, Stripe and the rest listed in
  `apps/web/lib/connectors/mcp-endpoints.ts`) reach the vendor's own hosted MCP
  server. This repository implements none of their tools, so it cannot map a
  scope to an API call the way a first-party integration could. The ceiling
  below still applies when such a connector is configured through the
  platform-OAuth path, but the vendor grants the capability, not this code.
- GitHub is a GitHub App, not an OAuth-scope-string flow. Its permission set
  lives in the App's settings on github.com and appears in no manifest, no
  `apps/web/lib/github-app.ts` constant, and no `scripts/github-app-env.mjs`
  value. `github` is reserved in the OAuth registry
  (`RESERVED_CONNECTOR_IDS` in `oauth-registry.ts`), so it can never be
  configured through this path.

## Enforcement

`apps/web/lib/connectors/oauth-scope-allowlist.ts` holds
`CONNECTOR_OAUTH_SCOPE_CEILINGS`, one entry per connector id.
`filterConnectorScopes(connectorId, requested)` splits an operator's requested
list into the scopes on the ceiling and the ones above it.

`loadConnectorOAuthRegistry()` in `oauth-registry.ts` calls it for every
descriptor it admits. Scopes above the ceiling are dropped from the provider
record before it enters the registry, so they never reach the `scope` parameter
of the authorization URL, and a warning naming the connector and the dropped
scopes goes to the logger. Loading never throws on an excessive scope: the
provider still loads, only narrower. A descriptor with no scopes, or with only
on-ceiling scopes, is unaffected.

An entry may instead be the marker `needs-vendor-specific-review`. That means
nobody has yet established a defensible minimum for that provider, so the
requested scopes pass through unchanged. This is a deliberate fail-open for the
unreviewed case, so that an unresearched provider is visibly unreviewed rather
than silently broken by an empty ceiling. Turning a marker into a real list is a
security improvement, and the test below stops a new OAuth connector from
skipping the decision entirely.

`apps/web/lib/connectors/__tests__/oauth-registry.scope-allowlist.test.ts` pins
all of this: it asserts an over-ceiling scope is dropped and an on-ceiling one
survives, that the authorization URL carries only the survivors, that every
`oauth2` connector in the catalog has an entry, and that no enforced ceiling
admits a known unrestricted scope such as `admin`, `full`,
`https://mail.google.com/`, the bare Google `drive` or `calendar` scopes,
`Files.ReadWrite.All`, or `Sites.FullControl.All`. Removing the enforcement or
widening a ceiling to include one of those fails CI.

## Ceiling table

"Covers" describes what the scope buys at the provider. For a connector whose
tools are served by the vendor's hosted MCP server, the honest answer is that
the vendor's server decides, and the column says so.

| Connector id       | Provider                      | Requested-scope ceiling                                                                                                                                                            | What it covers                                                                                                                                                            |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gmail`            | Google                        | `gmail.readonly`, `gmail.send`, `userinfo.email`, `userinfo.profile`, `openid`                                                                                                     | Read mail and send mail. Excludes `gmail.modify` and `mail.google.com`, which permit delete.                                                                              |
| `google-calendar`  | Google                        | `calendar.readonly`, `calendar.events`, identity scopes                                                                                                                            | Read calendars, create and edit events. Excludes the bare `calendar` scope.                                                                                               |
| `google-drive`     | Google                        | `drive.file`, `drive.metadata.readonly`, identity scopes                                                                                                                           | Files the app itself created or the user picked, plus metadata. Excludes full `drive`.                                                                                    |
| `google-sheets`    | Google                        | `spreadsheets.readonly`, `spreadsheets`, `drive.file`, identity scopes                                                                                                             | Read and write sheets the user grants. Sheets has no narrower write scope.                                                                                                |
| `google-analytics` | Google                        | `analytics.readonly`, identity scopes                                                                                                                                              | Report reads only. Excludes `analytics` and `analytics.edit`.                                                                                                             |
| `youtube`          | Google                        | `youtube.readonly`, `yt-analytics.readonly`, identity scopes                                                                                                                       | Channel and analytics reads. Excludes `youtube` (full manage) and `youtubepartner`.                                                                                       |
| `bigquery`         | Google                        | `bigquery.readonly`, `devstorage.read_only`, identity scopes                                                                                                                       | Query and read datasets. Excludes the write `bigquery` scope and `cloud-platform`.                                                                                        |
| `gcp`              | Google                        | `cloud-platform.read-only`, identity scopes                                                                                                                                        | Read project resources. Excludes the mutating `cloud-platform` scope.                                                                                                     |
| `outlook`          | Microsoft Graph               | `User.Read`, `Mail.Read`, `Mail.Send`, `offline_access`                                                                                                                            | Read and send mail. Excludes `Mail.ReadWrite` and any `.All` variant.                                                                                                     |
| `onedrive`         | Microsoft Graph               | `User.Read`, `Files.Read`, `Files.ReadWrite.AppFolder`, `offline_access`                                                                                                           | Read files, write only inside the app folder. Excludes `Files.ReadWrite.All`.                                                                                             |
| `teams`            | Microsoft Graph               | `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `Chat.Read`, `ChatMessage.Send`, `offline_access`                                                                      | List teams and channels, read chat, post a message. Excludes directory and group writes.                                                                                  |
| `sharepoint`       | Microsoft Graph               | `User.Read`, `Sites.Read.All`, `offline_access`                                                                                                                                    | Read site content. Excludes `Sites.ReadWrite.All` and `Sites.FullControl.All`.                                                                                            |
| `azure`            | Azure Resource Manager        | `https://management.azure.com/user_impersonation`, `offline_access`, OIDC                                                                                                          | ARM exposes no narrower delegated scope. Least privilege here is RBAC on the principal, not the scope string.                                                             |
| `slack`            | Slack                         | `channels:read`, `channels:history`, `groups:read`, `chat:write`, `users:read`, `users:read.email`, `team:read`, `files:read`                                                      | List and read channels, post a message, resolve users. Excludes every `admin.*` scope.                                                                                    |
| `notion`           | Notion                        | none                                                                                                                                                                               | Notion's OAuth takes no `scope` parameter. Capabilities are set on the integration in Notion. Any requested scope is dropped.                                             |
| `intercom`         | Intercom                      | none                                                                                                                                                                               | Permissions are set per app in Intercom's developer hub, not by a `scope` parameter.                                                                                      |
| `mailchimp`        | Mailchimp                     | none                                                                                                                                                                               | Mailchimp OAuth2 issues a single full-access token with no scope parameter. Treat the connector itself as the grant.                                                      |
| `basecamp`         | Basecamp                      | none                                                                                                                                                                               | Basecamp has no named scopes; the token inherits the user's own permissions.                                                                                              |
| `evernote`         | Evernote                      | none                                                                                                                                                                               | Permission level is fixed on the API key, not requested per authorization.                                                                                                |
| `linear`           | Linear                        | `read`, `write`, `issues:create`, `comments:create`, `app:assignable`, `app:mentionable`                                                                                           | Read and edit issues and comments. Excludes `admin`.                                                                                                                      |
| `jira`             | Atlassian                     | `read:me`, `read:jira-user`, `read:jira-work`, `write:jira-work`, `offline_access`                                                                                                 | Read and edit issues. Excludes every `manage:` and `admin:` configuration scope.                                                                                          |
| `confluence`       | Atlassian                     | `read:me`, `read:confluence-space.summary`, `read:confluence-content.all`, `write:confluence-content`, `offline_access`                                                            | Read spaces and pages, write page content. Excludes configuration management.                                                                                             |
| `asana`            | Asana                         | `tasks:read`, `tasks:write`, `projects:read`, `sections:read`, `stories:read`, `stories:write`, `teams:read`, `users:read`, `workspaces:read`, OIDC                                | Granular task and project access. Excludes the legacy `default` scope, which is full account access.                                                                      |
| `zoom`             | Zoom                          | `user:read:user`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:write:meeting`, `cloud_recording:read:list_user_recordings`                                       | Granular scopes only (Zoom's post-2024 format). Excludes every `account:` and admin scope.                                                                                |
| `hubspot`          | HubSpot                       | `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.deals.write`                              | CRM object access. Excludes `automation`, `content`, and every schema or settings write.                                                                                  |
| `salesforce`       | Salesforce                    | `api`, `id`, `refresh_token`, OIDC                                                                                                                                                 | REST API as the consenting user. Excludes `full` and `web`.                                                                                                               |
| `calendly`         | Calendly                      | needs vendor-specific review                                                                                                                                                       | Calendly grants nothing by default to a new app and requires scopes to be named, but the current scope catalog was not verified. Passes through unchanged until reviewed. |
| `adobe`            | Adobe IMS                     | needs vendor-specific review                                                                                                                                                       | The scope set depends on which Adobe product API the connector targets, and this repository does not say. Passes through unchanged until reviewed.                        |
| `shopify`          | Shopify                       | `read_products`, `read_orders`, `read_customers`, `read_inventory`, `write_products`                                                                                               | Catalog and order reads plus product writes. Excludes `write_orders`, `read_all_orders`, `write_customers`.                                                               |
| `linkedin`         | LinkedIn                      | `w_member_social`, OIDC                                                                                                                                                            | Member identity and posting as the member. Excludes organization admin and ads scopes.                                                                                    |
| `twitter`          | X                             | `tweet.read`, `tweet.write`, `users.read`, `offline_access`                                                                                                                        | Read and post. Excludes all `dm.*`, `block.write`, and moderation scopes.                                                                                                 |
| `discord`          | Discord                       | `identify`, `guilds`, `guilds.members.read`                                                                                                                                        | Identity and guild membership reads. Excludes `bot`, `webhook.incoming`, `guilds.join`.                                                                                   |
| `gitlab`           | GitLab                        | `read_user`, `read_api`, `read_repository`, OIDC                                                                                                                                   | Read-only API and repository access. Excludes `api`, `write_repository`, `sudo`, `admin_mode`.                                                                            |
| `bitbucket`        | Bitbucket                     | `account`, `repository`, `pullrequest`, `issue`                                                                                                                                    | Read repositories, pull requests, issues. Excludes every `:admin`, `:delete`, `:write` variant.                                                                           |
| `pipedrive`        | Pipedrive                     | `base`, `deals:read`, `contacts:read`, `activities:read`, `users:read`, `search`                                                                                                   | Read-only CRM. Excludes every `:full` scope and `admin`.                                                                                                                  |
| `figma`            | Figma                         | `current_user:read`, `files:read`, `projects:read`, `file_comments:write`, `file_dev_resources:read`                                                                               | Read files and projects, leave comments. Excludes `file_variables:write`, `webhooks:write`, `org:activity_log_read`.                                                      |
| `canva`            | Canva                         | `profile:read`, `design:meta:read`, `design:content:read`, `design:content:write`, `asset:read`, `asset:write`, `folder:read`                                                      | Read and write designs and assets. Excludes every `permission` scope and `app:write`. Canva does not imply read from write, so both are listed where both are needed.     |
| `quickbooks`       | Intuit                        | `com.intuit.quickbooks.accounting`, OIDC                                                                                                                                           | Accounting API. Excludes `com.intuit.quickbooks.payment`, which moves money.                                                                                              |
| `xero`             | Xero                          | `accounting.settings.read`, `accounting.contacts.read`, `accounting.transactions.read`, `accounting.reports.read`, `offline_access`, OIDC                                          | Read-only accounting. Excludes every write scope, `payroll.*`, `files`, and attachments.                                                                                  |
| `paypal`           | PayPal                        | `openid`, `email`, `https://uri.paypal.com/services/reporting/search/read`                                                                                                         | Transaction search only. Excludes payment capture, payouts, and subscription writes.                                                                                      |
| `dropbox`          | Dropbox                       | `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`                                                                                            | Read and write file content. Excludes `files.permanent_delete`, `sharing.write`, team scopes.                                                                             |
| `box`              | Box                           | `root_readonly`, `item_preview`, `item_download`, `item_upload`                                                                                                                    | Read and upload items. Excludes `root_readwrite` and every enterprise or user management scope.                                                                           |
| `instagram`        | Meta                          | `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `pages_show_list`                                                                                     | Profile and media reads, insights, publishing. Excludes `business_management` and `ads_management`.                                                                       |
| `facebook`         | Meta                          | `public_profile`, `email`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`                                                                                        | Page reads and posting. Excludes `business_management` and `ads_management`.                                                                                              |
| `epic-fhir`        | Epic (SMART on FHIR)          | `openid`, `fhirUser`, `launch/patient`, `offline_access`, and `patient/` read scopes for Patient, Observation, Condition, MedicationRequest, AllergyIntolerance, DocumentReference | Patient-context reads for the consenting patient only. Excludes every `user/` and `system/` scope and every `.write`.                                                     |
| `cerner`           | Oracle Health (SMART on FHIR) | same set as `epic-fhir`                                                                                                                                                            | Same rationale. Excludes every `user/` and `system/` scope and every `.write`.                                                                                            |

Connector ids not in this table have no reviewed ceiling and are not filtered.
That includes every `api-key`, `pat`, `connection-string`, and `device-local`
entry in the catalog, none of which use an OAuth scope parameter at all.

## Desktop native scopes

`apps/desktop` requests real, hardcoded OAuth scopes against Google directly,
using the user's own OAuth client. The ceilings above are the web enforcement
point and have no effect on the desktop client, so this table is a second,
separate record of what the desktop app actually requests.

| Connector       | File                                                                                 | Scopes requested                                                     |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Gmail           | `apps/desktop/src-tauri/src/features/communications/gmail_oauth.rs` L46-49, L122-127 | `gmail.readonly`, `gmail.send`, `userinfo.email`, `userinfo.profile` |
| Google Calendar | `apps/desktop/src-tauri/src/features/calendar/google_calendar.rs` L15-17, L34-37     | `calendar.readonly`, `calendar.events`                               |

As of 2026-09-03 this replaced a wider request. The Gmail client had also
requested `gmail.modify`, which permits deleting and relabeling mail, but the
desktop code only ever calls `users.getProfile`, `users.watch`,
`users.history.list` and `users.stop`, all of which `gmail.readonly` alone
authorizes. The calendar client had also requested the unrestricted
`auth/calendar` scope, but the desktop code only ever calls `calendarList.list`
and the events endpoints, which `calendar.readonly` plus `calendar.events`
together authorize without granting calendar deletion or sharing changes.
Neither client makes a message-send or event-delete call through any other
scope; sending mail goes through a separate IMAP/SMTP path in
`apps/desktop/src-tauri/src/sys/commands/email.rs` that does not use Google
OAuth at all.

`docs/security/agent-authority-and-connector-scopes.md` section 3 and gap 2
still describe the old, wider request as current. That file was out of scope
for this change and needs a follow-up edit to match.
