---
id: "AREA-056"
type: "area"
title: "Concrete integration families"
features: ["F056-01", "F056-02", "F056-03", "F056-04", "F056-05", "F056-06", "F056-07", "F056-08", "F056-09", "F056-10", "F056-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 56. Concrete integration families

This area lets the assistant work inside the apps a person already uses: search and read email, draft or send mail, look at calendars, edit cloud files, post to team chat, update tickets and CRM records, and read bank or health data. Writes (sending, creating events, posting) are meant to wait for the user's approval. It matters because it moves real work out of the chat window and into the user's own accounts. In the code as it stands, most of these connectors are switched off by a release gate, so the brief's "done" and "partial" statuses are not reachable for most users yet (see things_that_look_wrong).

**Who uses it.** Signed-in users who connect an outside account (web/connector code takes a userId and an organization id: apps/web/lib/user-connector-tools.ts:2268-2285). Workspace admins can limit tool approvals through organization policy (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:1-25). Operators (the people who run the servers) add each connector's OAuth client through CONNECTOR_OAUTH_PROVIDERS_JSON (apps/web/lib/connectors/oauth-registry.ts:22). Paid-plan limits: not established from the code read.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F056-01](F056-01-email-search-read-draft-attach-send.md) | Email (search, read, draft, attach, send) | partly | partly | partly | partly | partly | partly |
| [F056-02](F056-02-calendar-search-free-busy-create-edit-invitations.md) | Calendar (search, free/busy, create, edit, invitations) | partly | partly | partly | partly | partly | partly |
| [F056-03](F056-03-contacts-lookup.md) | Contacts lookup | partly | partly | built | no | no | partly |
| [F056-04](F056-04-cloud-files-search-download-create-edit-folders-an.md) | Cloud files (search, download, create, edit, folders and sharing) | partly | partly | partly | partly | built | partly |
| [F056-05](F056-05-documents-spreadsheets-presentations-and-design-fi.md) | Documents, spreadsheets, presentations and design files | built | built | built | partly | partly | built |
| [F056-06](F056-06-team-chat-and-knowledge-bases.md) | Team chat and knowledge bases | partly | partly | partly | partly | partly | partly |
| [F056-07](F056-07-tickets-issues-boards-and-crm-records.md) | Tickets, issues, boards and CRM records | built | built | built | no | no | built |
| [F056-08](F056-08-code-pull-requests-ci-and-deployments.md) | Code, pull requests, CI and deployments | partly | partly | partly | built | partly | partly |
| [F056-09](F056-09-databases-warehouses-and-dashboards.md) | Databases, warehouses and dashboards | partly | partly | partly | no | no | partly |
| [F056-10](F056-10-personal-data-bank-health-and-device-notes.md) | Personal data: bank, health and device notes | partly | partly | partly | no | no | partly |
| [F056-11](F056-11-consumer-services-not-built-yet.md) | Consumer services not built yet | partly | partly | partly | no | no | partly |

Requirement items for this area: [10-requirements/capabilities/056-concrete-integration-families.md](../../10-requirements/capabilities/056-concrete-integration-families.md).

## How this area works in the code

1. **Operator sets up each connector's OAuth client.** The server reads CONNECTOR_OAUTH_PROVIDERS_JSON, validates each provider entry (HTTPS URLs, scopes, an enabled flag that defaults to true), and reads the client id and secret from CONNECTOR_OAUTH_<ID>_CLIENT_ID and _CLIENT_SECRET. (`apps/web/lib/connectors/oauth-registry.ts:22`, `apps/web/lib/connectors/oauth-registry.ts:85`, `apps/web/lib/connectors/oauth-registry.ts:111`)
2. **Connector is declared in the catalog and directory.** Each connector has a capability record (Gmail, Calendar, Drive, Contacts, Slack, GitHub-MCP, Outlook, HealthEx and others) and a directory entry with its hosted server address (Gmail's server is listed there). (`apps/web/lib/connectors/catalog.ts:153-156`, `apps/web/lib/connectors/catalog.ts:274`, `apps/web/lib/connectors/directory/sources/first-party.json:24-27`)
3. **Release gate decides whether the connector may be used.** A single constant sets the whole family to coming soon. Only a short list of connectors is released by name. A connector outside that list is refused before any MCP connection is opened. (`packages/contracts/types/src/connector-release.ts:14`, `packages/contracts/types/src/connector-release.ts:16-31`, `packages/contracts/types/src/connector-release.ts:52`, `apps/web/lib/user-connector-tools.ts:2276`)
4. **OAuth scopes are capped by a per-connector ceiling.** Requested scopes are filtered to the connector's allowed list; scopes outside it are dropped and reported. Connectors whose ceiling is still under review get no filter. (`packages/contracts/cloud-contracts/src/connector-scopes.ts:41-46`, `apps/web/lib/connectors/oauth-scope-allowlist.ts:24`)
5. **A request-scoped MCP client is opened.** For an allowed connector, the server opens a client to the connector's hosted MCP server for this one request, runs the operation, and closes it before returning. Discovery is also checked against the user's policy first. (`apps/web/lib/user-connector-tools.ts:2268-2285`)
6. **Gmail-specific tools are declared in code.** The Gmail actions (read attachments, create draft with attachments, send draft) are defined as tools with qualified names. The draft tool says the draft is not sent until the user has seen it and send_draft is called. (`apps/web/lib/connectors/gmail-actions.ts:28`, `apps/web/lib/connectors/gmail-actions.ts:73`, `apps/web/lib/connectors/gmail-actions.ts:90-96`)
7. **Approval decides whether a write runs.** Tool approval is decided by the user's policy and the organization's policy. The chat route also accepts an approval_mode=auto query that skips prompts. Each approval is recorded as a pause in the run. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:1-25`, `apps/web/app/api/llm/v1/chat/completions/route.ts:182`, `apps/cli/src/models/managed_approvals.rs:50`, `apps/cli/src/models/managed_approvals.rs:132`)
8. **Model tool call is streamed back to the app.** The LLM crate turns the model's tool calls into a tool handoff that the desktop and CLI show to the user. The tool result is returned to the model; I did not trace the full return path. (`crates/agiworkforce-llm/src/stream.rs:925-935`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/connectors/oauth-registry.ts` | Validates the operator's OAuth provider list and resolves client ids and secrets per connector. |
| `packages/contracts/types/src/connector-release.ts` | Holds the release state (currently coming soon) and the short list of released connector ids; the gate for every connector. |
| `packages/contracts/cloud-contracts/src/connector-scopes.ts` | Per-connector scope ceilings (what each connector is allowed to request). |
| `apps/web/lib/connectors/oauth-scope-allowlist.ts` | Filters requested OAuth scopes against the ceiling and reports dropped ones. |
| `apps/web/lib/user-connector-tools.ts` | Opens the per-request MCP client for a connected connector and applies the release and discovery checks. |
| `apps/web/lib/connectors/catalog.ts` | Capability records for each connector (actions, surfaces, risk class). |
| `apps/web/lib/connectors/gmail-actions.ts` | Gmail-specific tool definitions: attachments, drafts, send_draft. |
| `apps/web/lib/connectors/directory/sources/first-party.json` | Directory entries with hosted server addresses (for example the Gmail MCP URL) and tool lists. |
| `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | Decides whether a tool call runs without asking, using user and organization policy. |
| `apps/cli/src/models/managed_approvals.rs` | CLI side of approvals: records the pause when a tool needs approval and prompts the user. |
| `apps/web/lib/connectors/bank-accounts.ts` | Bank link records (Plaid items) and the carry-over from an older single bank link. |

## What is stored

- Bank link per bank item: Plaid item id, encrypted access token, institution name: Database table public.bank_account_items (apps/web/lib/connectors/bank-accounts.ts:362, :316)
- Connector OAuth client id and secret for each connector: Server environment variables CONNECTOR_OAUTH_<ID>_CLIENT_ID and _CLIENT_SECRET, read in apps/web/lib/connectors/oauth-registry.ts:111
- Provider list (URLs, scopes, enabled flag): Server environment variable CONNECTOR_OAUTH_PROVIDERS_JSON (apps/web/lib/connectors/oauth-registry.ts:22)
- Pending tool approvals in the CLI run: Held in the CLI run's memory by ManagedApprovalPause (apps/cli/src/models/managed_approvals.rs:43); persistence not checked
- Connector user tokens and their storage: Not established: resolveConnectorAccessToken in apps/web/lib/connectors/oauth-access.ts was not opened

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Connector release state**: When not released, every connector outside the short list is refused before use. Currently set to coming soon, so only the listed connectors work. (packages/contracts/types/src/connector-release.ts:14 (state), :16-31 (released list), :52 (check); read at apps/web/lib/user-connector-tools.ts:2083 and :2276)
- **Connector provider list**: Adds a connector (URLs, scopes); an entry with enabled false is off. (CONNECTOR_OAUTH_PROVIDERS_JSON read at apps/web/lib/connectors/oauth-registry.ts:22; enabled flag at :85)
- **Client id and secret per connector**: Without both, the connector's sign-in cannot complete. (CONNECTOR_OAUTH_<ID>_CLIENT_ID / _CLIENT_SECRET via apps/web/lib/connectors/oauth-registry.ts:111)
- **Redirect base and public app URL**: Where OAuth returns after sign-in. (CONNECTOR_OAUTH_REDIRECT_BASE_URL at apps/web/lib/connectors/oauth-registry.ts:23; NEXT_PUBLIC_APP_URL at :24)
- **Scope ceilings**: Scopes outside the list are dropped before sign-in; connectors marked review pending get no filter. (packages/contracts/cloud-contracts/src/connector-scopes.ts:1 and :41-46; applied at apps/web/lib/connectors/oauth-scope-allowlist.ts:24)
- **Approval mode**: approval_mode=auto skips tool approval prompts on the chat route. (apps/web/app/api/llm/v1/chat/completions/route.ts:182)
- **Organization and user approval policy**: Decides which tools run without asking. (apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts:1-25)
- **Custom account-URL connectors**: Lets the user add Snowflake or Databricks by account URL, with fixed URL patterns. (apps/web/lib/connectors/account-url-connectors.ts:10-31)
- **Bank and health provider settings**: Plaid and HealthEx are off until owner steps are done (brief). (Plaid environment values named in the brief only; HealthEx client id CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID (brief). Not read in code.)

## Shared between apps

[{"name":"Connector release gate, scope ceilings and cloud contracts","shared":"Yes: packages/contracts/types and packages/contracts/cloud-contracts, used by the web server and other surfaces."},{"name":"Connector catalog and OAuth registry","shared":"Server-side shared code in apps/web/lib/connectors; the web server is the one owner. Mobile reads the start path through contracts."},{"name":"Chat UI and settings modal","shared":"packages/ui/ui/src/settings-modal/SettingsModal.tsx and the tool timeline are shared UI; web, desktop and Chrome use them."},{"name":"LLM stream crate","shared":"crates/agiworkforce-llm is a Rust crate shared by desktop and CLI."},{"name":"Per-app code","shared":"Separate: mobile (apps/mobile/src/features/settings/cloud-connectors, LinkedBanks.tsx, AgentActivityTimeline.tsx), CLI (apps/cli/src/models/managed_approvals.rs, apps/cli/src/models/streaming.rs), VS Code (apps/extension-vscode/...), Chrome (apps/extension/src/features/side-panel/bubbles.ts), web finance (apps/web/features/finance/components/LinkedBanks.tsx)."}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The release state is coming soon and the released list does not include gmail, google-calendar, google-drive, google-contacts, slack, github-mcp, outlook, or healthex. The gate refuses any connector outside the list. The brief marks many of these as partial or done, so those statuses are not reachable as written. The coming-soon text also names Gmail, Google Drive and Calendar. (packages/contracts/types/src/connector-release.ts:14, :16-31, :43-44; apps/web/lib/user-connector-tools.ts:2083, :2276)
- Brief statuses for cloud files (S56.13 to S56.20) say done on every app, but the Google Drive entry is not released and the brief itself says create needs the Drive entry to be added. (packages/contracts/types/src/connector-release.ts:16-31; brief S56.15)
- Brief cites apps/web/app/api/llm/v1/chat/completions/route.ts:735 for connector tool execution, but that line is in the research-agent branch. The mapping from item to tool path is not confirmed. (apps/web/app/api/llm/v1/chat/completions/route.ts:735)
- Gmail send is in the scope ceiling but the brief says Google sensitive-scope verification is still pending. Code and release status do not show that the send is blocked until verification completes. (packages/contracts/cloud-contracts/src/connector-scopes.ts:41)

## Not established

- Whether any other module overrides CONNECTOR_RELEASE_STATE at run time (only the constant and the released list were read).
- Where connector OAuth tokens are stored (resolveConnectorAccessToken in apps/web/lib/connectors/oauth-access.ts was not opened).
- Whether gmail.send and other writes always ask for approval, or whether an organization policy can auto-approve them (tool-metadata and policy internals not fully read).
- Which plans (Free, paid, Cloud) can use each connector; no plan gate was found in the files read.
- The full route from model tool call to tool result on web, desktop and VS Code (only the LLM stream handoff at crates/agiworkforce-llm/src/stream.rs:925-935 was read).
- The brief's per-app statuses were taken from the brief, not verified in the mobile, VS Code or Chrome code, which was not opened.
- Plaid and HealthEx settings: only the brief names their environment values.
- Whether the CLI approval prompt persists anything to disk (only the in-memory struct was read).
- No builds, tests or servers were run, per the read-only rule.
