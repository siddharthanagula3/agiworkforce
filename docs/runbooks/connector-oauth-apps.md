# Connector OAuth apps

Status: Current
Owner: Founder
Last updated: 2026-09-29

What the owner registers with each vendor so that AGI Workforce connectors sign
in the way Claude and ChatGPT connectors do. Most connectors need nothing from
you. This runbook covers only the ones that do, in the order to start them.

## Why most connectors need nothing

A connector signs in to a vendor's MCP server with one of three methods. The
MCP specification (revision 2026-07-28) and ChatGPT rank them in this order:

1. **Client ID Metadata Document.** Our identity is a URL we host. The vendor
   reads it and trusts it; nobody registers anything. We publish one per app,
   so the vendor's consent screen names the app that is asking:
   - web: `https://agiworkforce.com/.well-known/oauth-client-metadata`
   - CLI: `https://agiworkforce.com/.well-known/oauth-client-metadata/cli`
   - desktop app: `https://agiworkforce.com/.well-known/oauth-client-metadata/desktop`
2. **Dynamic Client Registration.** Our app registers itself with the vendor
   at connect time. Deprecated by the specification, still widely supported.
3. **Pre-registered client.** You create an OAuth app in the vendor's console
   and give us its client ID and secret. This is the only case below.

A probe of every vendor MCP server we list, made on 2026-09-27 with
unauthenticated public requests only, found:

| Result                                        | Servers |
| --------------------------------------------- | ------: |
| Accepts our metadata document                 |      57 |
| Registers itself (dynamic registration only)  |     153 |
| No sign-in at all                             |      26 |
| **Needs a pre-registered OAuth app from you** |  **37** |
| No public MCP server                          |     148 |
| Unreachable (mostly firewall blocks)          |      12 |

Claude and ChatGPT do the same thing for the big providers: Claude's Google
Workspace, Microsoft 365 and GitHub connectors run on OAuth apps Anthropic owns
and had verified, and each customer only approves that app
([Google Workspace connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors),
[Microsoft 365 security guide](https://support.claude.com/en/articles/12684923-microsoft-365-connector-security-guide),
[GitHub integration](https://support.claude.com/en/articles/10167454-use-the-github-integration)).
Registering our own apps once, and getting them verified, is what makes a
customer's connect button a single click.

## Values every vendor console asks for

| Field                   | Value                                                    |
| ----------------------- | -------------------------------------------------------- |
| App name                | AGI Workforce                                            |
| Redirect URI (callback) | `https://agiworkforce.com/api/connectors/oauth/callback` |
| Homepage                | `https://agiworkforce.com`                               |
| Privacy policy          | `https://agiworkforce.com/privacy`                       |
| Terms of service        | `https://agiworkforce.com/terms`                         |
| Support email           | an address on agiworkforce.com that you read             |
| Logo                    | square PNG, at least 120 x 120 px, under 1 MB            |

Register only the web redirect URI. A pre-registered app has a client secret,
and a secret cannot live inside a desktop app or CLI, so those apps reach these
vendors through the connection made on the web account. Vendors that register
themselves work from every app with nothing to add.

## Where the credentials go

In Vercel, open the web project, then Settings, then Environment Variables,
choose **Production**, and add (names only here; never paste a value into chat,
a commit or a ticket):

- `CONNECTOR_OAUTH_PROVIDERS_JSON`: the non-secret descriptor listing each
  pre-registered connector. The exact entries are in the section
  "Descriptor entries" at the end of this runbook.
- For each connector, `CONNECTOR_OAUTH_<ID>_CLIENT_ID` and
  `CONNECTOR_OAUTH_<ID>_CLIENT_SECRET`, where `<ID>` is the connector id upper
  cased with `-` replaced by `_`. For example, `google-calendar` needs
  `CONNECTOR_OAUTH_GOOGLE_CALENDAR_CLIENT_ID`.
- `CONNECTOR_OAUTH_REDIRECT_BASE_URL` only if the callback must live on an
  origin other than `NEXT_PUBLIC_APP_URL`; leave it unset for
  `https://agiworkforce.com`.

A connector whose ID or secret is missing is treated as absent rather than
shown and broken. Redeploy after adding variables.

## Order of work

| Vendor    | Connectors                                     | Lead time                                                                    | Start    |
| --------- | ---------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Google    | Gmail, Google Calendar, Google Drive, BigQuery | weeks (verification, then an annual security assessment for Gmail and Drive) | first    |
| Microsoft | Microsoft 365                                  | days (partner program verification), then minutes                            | second   |
| Slack     | Slack                                          | minutes for the app; weeks if you list it in the Slack Marketplace           | third    |
| GitHub    | GitHub                                         | minutes                                                                      | any time |
| HubSpot   | HubSpot                                        | minutes                                                                      | any time |
| Box       | Box                                            | minutes                                                                      | any time |
| PagerDuty | PagerDuty                                      | minutes                                                                      | any time |

## 1. Google: Gmail, Google Calendar, Google Drive, BigQuery

One Google Cloud project and one OAuth client serve all four connectors.

1. **Verify the domain.** In [Google Search Console](https://search.google.com/search-console),
   add `agiworkforce.com` as a domain property and verify it with the DNS
   record it gives you. Google only accepts homepage, privacy and terms URLs on
   a verified domain.
2. **Create the project.** In the [Cloud Console](https://console.cloud.google.com/projectcreate),
   create a project named `AGI Workforce Connectors`, signed in with the same
   Google account.
3. **Enable the APIs.** In APIs and Services, Library, enable the Gmail API,
   Google Calendar API, Google Drive API, People API and BigQuery API. Then
   follow each MCP server's setup page, which says what else the project needs
   for that server:
   [Gmail](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server),
   [Calendar](https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server),
   [Drive](https://developers.google.com/workspace/drive/api/guides/configure-mcp-server),
   [People](https://developers.google.com/workspace/guides/configure-mcp-servers),
   [BigQuery](https://cloud.google.com/bigquery/docs/use-bigquery-mcp).
4. **Branding.** In Google Auth Platform, Branding
   ([guide](https://support.google.com/cloud/answer/10311615)): user type
   **External**, app name, support email, logo, the homepage, privacy and terms
   URLs from the table above, authorized domain `agiworkforce.com`, and a
   developer contact email. Choose **Verify branding**; it usually completes
   in minutes and must finish before scope verification.
5. **Scopes.** In Data access, add exactly the scopes our connectors request:

   | Connector       | Scopes (all prefixed `https://www.googleapis.com/auth/` except OpenID) |
   | --------------- | ---------------------------------------------------------------------- |
   | all five        | `openid`, `profile`, `email`, `userinfo.email`, `userinfo.profile`     |
   | Gmail           | `gmail.readonly`, `gmail.compose`, `gmail.send`                        |
   | Google Calendar | `calendar.readonly`, `calendar.events`                                 |
   | Google Drive    | `drive.file`, `drive.readonly`                                         |
   | Google Contacts | `contacts.readonly`, `directory.readonly`                              |
   | BigQuery        | `bigquery.readonly`, `devstorage.read_only`                            |

   The console labels each scope non-sensitive, sensitive or restricted when
   you add it; trust its label over this page. Expect `gmail.readonly`,
   `gmail.compose` and `drive.readonly` to be restricted, and the Calendar and
   `gmail.send` scopes to be sensitive.

6. **Create the OAuth client.** In Clients, create an OAuth client of type
   **Web application**, named `AGI Workforce web`, with the authorized redirect
   URI `https://agiworkforce.com/api/connectors/oauth/callback`. Copy the
   client ID and secret straight into the Vercel variables for `gmail`,
   `google-calendar`, `google-drive`, `google-contacts` and `bigquery` (the
   same pair in all five).
7. **Publish and verify.** In Audience, move the app from Testing to **In
   production**, then submit verification
   ([requirements](https://support.google.com/cloud/answer/13464321)). Google
   asks for:
   - a demonstration video, in English, showing the whole consent screen and
     each feature that uses a sensitive or restricted scope;
   - a justification of each scope as the narrowest that works;
   - confirmation that the data never goes to advertising platforms, data
     brokers or resellers.
     Answers for the verification form (edit only if a feature changes):
   - **Data use:** the assistant reads, drafts and sends mail, reads and
     creates calendar events, finds Drive files and contacts, and runs read-only
     BigQuery queries, only when the signed-in user asks in a chat or a routine
     they set up. Data is used only to answer that request, is not used to
     train models, and is never sold or shared with advertisers, data brokers or
     resellers. Tokens are encrypted at rest and revoked on disconnect.
   - `gmail.readonly`: search and read the user's messages and attachments to
     answer questions about their mail.
   - `gmail.compose`: create drafts, with attachments, that the user reviews.
   - `gmail.send`: send a draft after the user approves that specific send.
   - `calendar.readonly`: read events and free/busy to answer scheduling
     questions. `calendar.events`: create or change an event the user asked for.
   - `drive.readonly`: search and read the user's Drive files to answer questions
     about them, as Claude and ChatGPT do. `drive.file`: create or update files
     the user asks for, and open files they pick.
   - `contacts.readonly`, `directory.readonly`: look up a recipient's address.
   - Leave the BigQuery scopes out of this submission. Google's hosted
     BigQuery server accepts only the full `bigquery` scope, which our ceiling
     refuses, so the `bigquery` connector stays off until that is decided (see
     `docs/development/connectors-setup.md`, BigQuery).
   - The privacy policy must state that Google user data is used under the
     Google API Services User Data Policy, including the Limited Use
     requirements, before you submit. It is published at `/privacy#s-google`.
   - **Deploy step, after migration 0344 applies:** mark the conversations
     that already hold Google user data. Dry run first, then apply; it walks
     conversations in batches of 1,000, each its own short transaction, and a
     second run changes nothing. If it stops, rerun with the `--after` id it
     printed.

     ```bash
     NEON_DATABASE_URL=... node scripts/backfill-google-user-data-mark.mjs
     NEON_DATABASE_URL=... node scripts/backfill-google-user-data-mark.mjs --apply
     ```

   - **Deploy step:** set `SOFT_DELETED_RESOURCE_PURGE_ENABLED=true` so deleted
     chats and projects are purged 30 days after deletion, as `/privacy` states.
   - **Demo video:** record it on the live site after the keys are deployed,
     with the app in Testing and your account as a test user: the consent
     screen with the client ID visible in the address bar, then one request per
     connector that exercises each scope above, including a Gmail send approval.

8. **Security assessment.** Restricted scopes (Gmail read, Drive metadata)
   also need Google's annual security assessment, run by an approved
   third-party assessor ([overview](https://support.google.com/cloud/answer/13465431)).
   Tiers and assessor pricing are published outside Google's help pages; get a
   quote before you commit. Until the app is verified, Google shows users an
   "unverified app" warning and caps the app at 100 test users.

9. **Gmail triggers.** A routine that starts when mail arrives needs Gmail to
   push a notification to us through Pub/Sub, in the same project:
   1. In Pub/Sub, create a topic (for example `gmail-triggers`). Its full name,
      `projects/<project-id>/topics/gmail-triggers`, is the value of
      `GMAIL_PUBSUB_TOPIC`.
   2. On the topic, grant **Pub/Sub Publisher** to
      `gmail-api-push@system.gserviceaccount.com`, so Gmail can publish to it.
   3. Create a service account for the push (for example
      `gmail-push@<project-id>.iam.gserviceaccount.com`); its email is the value
      of `GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`.
   4. Create a **push** subscription on the topic with endpoint
      `https://agiworkforce.com/api/webhooks/gmail`, authentication enabled with
      that service account, and the audience set to the same endpoint URL; the
      audience is the value of `GMAIL_PUBSUB_AUDIENCE`.
   5. Add the three variables in Vercel Production. Until all three are set and
      migration 0307 is applied, Gmail triggers stay unverified and show why.

Drive searches the whole Drive, as Claude and ChatGPT do, so it asks for the
restricted `drive.readonly` scope with `drive.file`, the two scopes Google's
Drive MCP server documents. Google may reassess when a restricted scope is added
after an assessment, so add it before the first submission.

## 2. Microsoft 365

1. **Partner program.** Enroll the company in the
   [Microsoft AI Cloud Partner Program](https://partner.microsoft.com) and
   complete its business verification. Use a work account on
   `agiworkforce.com`; publisher verification refuses personal Microsoft
   accounts and `onmicrosoft.com` domains.
2. **Register the app.** In the [Entra admin center](https://entra.microsoft.com),
   App registrations, New registration: name `AGI Workforce`, supported
   account types **Accounts in any organizational directory (multitenant)**,
   redirect URI platform **Web** with
   `https://agiworkforce.com/api/connectors/oauth/callback`.
3. **Secret.** Certificates and secrets, New client secret, with the longest
   expiry offered. Put a renewal reminder in your calendar a month before it
   expires; an expired secret breaks every Microsoft connection at once.
4. **Permissions.** API permissions, Microsoft Graph, **Delegated**: the
   scopes the Microsoft 365 MCP server documents
   ([overview](https://learn.microsoft.com/en-us/graph/mcp-server/overview)),
   which the descriptor section lists once confirmed. Entra marks which ones
   need a customer admin's consent.
5. **Publisher verification.** Branding and properties: set the publisher
   domain to `agiworkforce.com`, then add your partner program ID under
   Publisher verification
   ([guide](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)).
   This is close to mandatory: since November 2020, Microsoft blocks users in
   other tenants from consenting to unverified multitenant apps that ask for
   more than basic sign-in.
6. Copy the Application (client) ID and the secret into the
   `microsoft-365` Vercel variables.

## 3. Slack

1. At [api.slack.com/apps](https://api.slack.com/apps), Create New App, From
   scratch, in your own workspace.
2. OAuth and Permissions: add the redirect URL
   `https://agiworkforce.com/api/connectors/oauth/callback` (Slack requires
   HTTPS and an exact match).
3. Scopes: add `channels:read`, `channels:history`, `groups:read`,
   `chat:write`, `users:read`, `users:read.email`, `team:read` and
   `files:read` under the token type the
   [Slack MCP server guide](https://docs.slack.dev/ai/slack-mcp-server/)
   specifies. Slack's MCP server does not support dynamic registration, which
   is why this app is needed.
4. Turn on token rotation.
5. Manage Distribution: **Activate public distribution**, so workspaces other
   than yours can connect. Listing in the Slack Marketplace is optional and
   goes through Slack's review
   ([distribution](https://docs.slack.dev/app-management/distribution)).
6. Basic Information: copy the client ID and client secret into the `slack`
   Vercel variables.

### The AGI Workforce app in Slack

The same Slack app is also the assistant people message in Slack, the way
Claude in Slack is one Claude app: installed once per Slack workspace from
Settings > Slack, each person links their own account, and it answers direct
messages and mentions in the thread as the app. Add to the app above:

1. App Home: turn on the Messages Tab and allow users to send messages from it,
   or nobody can direct message the app.
2. OAuth and Permissions: add the redirect URL
   `https://agiworkforce.com/api/slack/oauth/callback`, and the bot token
   scopes `app_mentions:read`, `channels:history`, `chat:write`,
   `groups:history`, `im:history`, `reactions:write` and `users:read`. Leave
   organization-wide installation off; the app is installed one workspace at a
   time.
3. Event Subscriptions: turn them on with the request URL
   `https://agiworkforce.com/api/webhooks/slack`, and subscribe to the bot
   events `app_mention`, `message.im`, `app_uninstalled` and
   `tokens_revoked`. Routines that fire on other Slack events, such as
   `message.channels` or `reaction_added`, need those events subscribed too.
4. Basic Information: copy the signing secret into `SLACK_SIGNING_SECRET` and
   the client ID and client secret into `SLACK_APP_CLIENT_ID` and
   `SLACK_APP_CLIENT_SECRET`. Until all three are set, Settings > Slack says the
   app is not set up and nothing is answered.

## 4. GitHub

GitHub recommends a GitHub App over an OAuth App for new integrations: users
pick which repositories to grant, permissions are fine-grained, and tokens
expire. Anthropic's GitHub integration is a GitHub App.

1. [github.com/settings/apps](https://github.com/settings/apps), New GitHub
   App (create it under a GitHub organization for the company if you have one).
2. Callback URL: `https://agiworkforce.com/api/connectors/oauth/callback`.
   Tick **Expire user authorization tokens**.
3. Webhook: untick Active.
4. Permissions: the repository and account permissions the
   [GitHub MCP server](https://github.com/github/github-mcp-server) tools need,
   read-only first, which the descriptor section lists once confirmed.
5. Where can this app be installed: **Any account**.
6. Generate a client secret and copy the client ID and secret into the
   `github` Vercel variables.

## 5. HubSpot

1. In HubSpot, open [MCP auth apps](https://app.hubspot.com/l/mcp-auth-apps/)
   (Development, MCP Connectors, Create MCP connector), as HubSpot's
   [MCP guide](https://developers.hubspot.com/mcp) describes.
2. Redirect URL: `https://agiworkforce.com/api/connectors/oauth/callback`.
3. Scopes: `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`,
   `crm.objects.companies.read`, `crm.objects.deals.read`,
   `crm.objects.deals.write`.
4. Copy the client ID and secret into the `hubspot` Vercel variables.

## 6. Box

1. Follow Box's [remote MCP server guide](https://developer.box.com/guides/box-mcp/remote/);
   Box issues the credentials from the Integration Credentials section of the
   Admin Console when the Box MCP server is configured.
2. Redirect URL: `https://agiworkforce.com/api/connectors/oauth/callback`.
3. Scopes: `root_readonly`, `item_preview`, `item_download`, `item_upload`.
4. Copy the client ID and secret into the `box` Vercel variables.

## 7. PagerDuty

1. In PagerDuty, register an app with scoped OAuth 2.0, following PagerDuty's
   [remote MCP server documentation](https://developer.pagerduty.com/docs/mcp-tooling-remote-server).
2. Redirect URL: `https://agiworkforce.com/api/connectors/oauth/callback`.
3. Scopes: read-only incident and service scopes first; our scope list for
   PagerDuty is still under review and the descriptor section will name it.
4. Copy the client ID and secret into the `pagerduty` Vercel variables.

## 8. Docusign

1. In Docusign Apps and Keys (https://admin.docusign.com/apps-and-keys), add an
   app, copy its integration key, and add a secret, following Docusign's
   [MCP server guide](https://developers.docusign.com/platform/mcp-server/).
2. Redirect URL: `https://agiworkforce.com/api/connectors/oauth/callback`.
3. Scopes: `signature`, plus `adm_store_unified_repo_read` and `aow_manage` only
   if the accounts have Navigator and Maestro; Docusign refuses the whole grant
   otherwise.
4. Copy the integration key and secret into the `docusign` Vercel variables.

## Vendors you can skip for now

29 more servers in the directory need a pre-registered app. None is wired into
the product, and several are partner endpoints built for another assistant that
may refuse other apps. Register one only when customers ask for it: Bigdata.com, Boltz,
Clarivate CompuMark, Clerk, Cognito Forms, Coursera, D&B Risk Analytics, Diffit,
DoorDash, Everlaw, Insider One, Instacart, Lattice, Order by Cash App, Paytm,
Resy, Shopify, Solve Intelligence, Spotify, Thumbtack, Uber Eats, Webex
Meetings, Wrike and Xero.

## Check each connection

After each vendor's variables are in Production and the app is redeployed:

1. Sign in to AGI Workforce with a test account, open Settings, Connectors,
   and connect the vendor.
2. The consent screen must show the name **AGI Workforce** and your logo, and
   list only the scopes above.
3. Run one read-only request through the connector in a chat.
4. The connector's capability inspector shows the negotiated MCP protocol
   version.
5. Disconnect it and confirm the vendor's own "connected apps" page no longer
   lists AGI Workforce.

## Local desktop app (Tauri) sign-in apps

The local desktop app signs in to GitHub, Google and Microsoft itself, on a
loopback address, with apps you register once. Notion, Jira and Confluence use
the vendors' own MCP servers and need nothing from you. Slack and Figma are not
offered in the local app, because neither accepts a loopback sign-in.

1. **GitHub:** create an OAuth App with the callback
   `http://127.0.0.1/callback`; GitHub accepts any loopback port. Keep the
   client secret.
2. **Google:** in the same Google Cloud project, create an OAuth client of
   type **Desktop app**. It uses a loopback address and PKCE, so there is no
   redirect to register.
3. **Microsoft:** create an Entra app registration with the **Mobile and
   desktop applications** platform and no secret. The portal refuses an http
   loopback address, so add `http://127.0.0.1/oauth/callback` through the
   manifest's `replyUrlsWithType`.
4. Add these to the secrets the desktop release workflow reads, so release
   builds carry them: `AGI_GITHUB_OAUTH_CLIENT_ID`,
   `AGI_GITHUB_OAUTH_CLIENT_SECRET`, `AGI_GOOGLE_OAUTH_CLIENT_ID`,
   `AGI_GOOGLE_OAUTH_CLIENT_SECRET` and `AGI_MICROSOFT_OAUTH_CLIENT_ID`.
   `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` override the GitHub pair at
   run time.

## Descriptor entries

Every pre-registered connector needs one entry in `CONNECTOR_OAUTH_PROVIDERS_JSON`
plus the `CONNECTOR_OAUTH_<ID>_CLIENT_ID` and `CONNECTOR_OAUTH_<ID>_CLIENT_SECRET`
pair. The fields, and the exact endpoints and scopes for each vendor, are in
[`docs/development/connectors-setup.md`](../development/connectors-setup.md).

- First-party descriptors: `gmail`, `google-drive`, `google-calendar`,
  `google-contacts`, `github-mcp` and `microsoft-365`. `notion`, `linear` and `airtable` are
  optional, because those servers register themselves.
- Pre-registered directory connectors: `asana`, `box`, `docusign`, `dropbox`,
  `figma`, `hubspot`, `intercom`, `pagerduty`, `slack`, `square` and `vercel`.
- Microsoft 365 also needs the tenant provisioned and admin consent granted.

## Vendors that advertise registration and refuse it

A real registration attempt on 2026-08-14 was refused by these six. Each needs
one step from you before its connector can sign in:

- **Asana:** create an MCP app in the Asana developer console with our redirect
  URL. The v1 server shut down on 2026-08-05; the connector uses v2.
- **Dropbox:** register a Dropbox app, or ask Dropbox support to allow dynamic
  registration for us.
- **Figma:** join Figma's MCP client waitlist or catalog.
- **Intercom:** ask Intercom developer support to allowlist our redirect URL.
- **Square:** request the redirect allowlist in the MCP category of Square's
  developer forum.
- **Vercel:** ask Vercel to approve our client.
