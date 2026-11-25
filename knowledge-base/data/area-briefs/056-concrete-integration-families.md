# Area 56. Concrete integration families

47 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S56.01 Email search.
- Should: With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:41; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | desktop: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | mobile: owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the pho

## S56.02 Email reading.
- Should: The assistant can open and read the full content of a specific email or thread from a connected mailbox.
- Status: web partial, desktop partial, mobile partial, cli missing, vscode done, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:41; apps/web/lib/connectors/oauth-registry.ts:21; apps/cli/src/models/streaming.rs:588; apps/cli/src/models/managed_approvals.rs:135; apps/cli/src/agent/chat.rs:950; apps/cli/src/app_server/developer_host.rs:3066; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2956; apps/extension/src/features/side-panel/bubbles.ts:388
- Unfinished: web: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | desktop: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | mobile: owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the pho

## S56.03 Email drafting.
- Should: The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:41; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | desktop: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | mobile: owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the pho

## S56.04 Email sending.
- Should: The assistant can send an email from the connected account, after approval.
- Status: web partial, desktop partial, mobile partial, cli done, vscode missing, chrome partial
- Code: apps/web/lib/connectors/gmail-actions.ts:21; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place; also complete Google sensitive-scope verification for gmail.send | desktop: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place; also complete Google sensitive-scope verification for gmail

## S56.05 Email attachments.
- Should: The assistant can read attachments on an email and attach files when composing.
- Status: web partial, desktop partial, mobile partial, cli missing, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:41; apps/web/lib/connectors/oauth-registry.ts:21; apps/web/app/api/llm/v1/chat/completions/route.ts:818; apps/extension/src/features/side-panel/bubbles.ts:932
- Unfinished: web: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | desktop: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | mobile: owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the pho

## S56.06 Email labels and folders.
- Should: The assistant can list the mailbox labels/folders and file or relabel messages.
- Status: not applicable anywhere

## S56.07 Calendar search.
- Should: The assistant can search the connected calendar for events by text or date range.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:42; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | desktop: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | mobile: owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own cale

## S56.08 Free/busy inspection.
- Should: The assistant can check free/busy time on the connected calendar to find open slots.
- Status: web partial, desktop partial, mobile partial, cli done, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:42; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | desktop: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | mobile: owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own cale

## S56.09 Event creation.
- Should: The assistant can create a calendar event on the connected calendar, after approval.
- Status: web partial, desktop partial, mobile partial, cli done, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:42; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | desktop: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | mobile: owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own cale

## S56.10 Event editing and cancellation.
- Should: The assistant can edit or cancel an existing calendar event.
- Status: web partial, desktop partial, mobile partial, cli done, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:42; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | desktop: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | mobile: owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own cale

## S56.11 Meeting invitations.
- Should: The assistant can send meeting invitations and respond to invitations on the connected calendar.
- Status: web partial, desktop partial, mobile partial, cli missing, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:42; apps/web/lib/connectors/oauth-registry.ts:21; apps/extension/src/features/side-panel/bubbles.ts:388; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:55; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/connectors/catalog.ts:154; apps/web/lib/connectors/directory/sources/first-party.json:59; apps/web/lib/connectors/directory/sources/first-party.json:62
- Unfinished: web: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | desktop: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | mobile: owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own cale

## S56.12 Contacts and recipient lookup.
- Should: The assistant can look up people in the user's address book to find a recipient's email or details.
- Status: web partial, desktop partial, mobile done, cli missing, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:44; apps/mobile/src/features/settings/cloud-connectors/index.tsx:44; apps/web/lib/connectors/directory/sources/first-party.json:69; apps/web/lib/connectors/catalog.ts:156; apps/web/lib/connectors/directory/sources/first-party.json:72; apps/web/lib/connectors/oauth-scope-allowlist.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:321
- Unfinished: web: owner: enable the People API and People MCP API in Google Cloud and add the google-contacts entry with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET | desktop: owner: enable the People API and People MCP API in Google Cloud and add the google-contacts entry with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET | chrome: partials/mcp-web 4ce42bb0b: Google Contacts connects read-only to Google's People API MCP server (https://people.googleapis.com/mcp/v1, Developer Preview, page updated 2026-09-18) with contacts.readonly and directory.readonly, and its search_cont

## S56.13 Cloud-file search.
- Should: The assistant can search files in a connected cloud drive.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:155; apps/web/lib/connectors/directory/sources/first-party.json:10; apps/web/lib/connectors/oauth-scope-allowlist.ts:43; apps/web/lib/connectors/directory/sources/first-party.json:450

## S56.14 Cloud-file download.
- Should: The assistant can download/read the content of a file from a connected cloud drive.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:232; apps/web/lib/connectors/directory/sources/first-party.json:429; apps/web/lib/connectors/oauth-scope-allowlist.ts:189; apps/web/lib/connectors/mcp-endpoints.ts:111

## S56.15 Cloud-file creation.
- Should: The assistant can create a new file in a connected cloud drive, after approval.
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:43; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: add the google-drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON; create_file and drive.file are in place | desktop: owner: add the google-drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON; create_file and drive.file are in place | mobile: owner: add the Google Drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON | chrome: Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Drive.

## S56.16 Cloud-file editing.
- Should: The assistant can modify an existing file in a connected cloud drive.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:232; apps/web/lib/connectors/directory/sources/first-party.json:447; apps/web/lib/connectors/oauth-scope-allowlist.ts:189; apps/web/lib/connectors/mcp-endpoints.ts:111

## S56.17 Folder and sharing management.
- Should: The assistant can create folders and manage sharing (links, collaborators) in a connected cloud drive.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/cli/src/models/streaming.rs:588; apps/cli/src/models/managed_approvals.rs:135; apps/cli/src/agent/chat.rs:950; apps/cli/src/app_server/developer_host.rs:3066; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2956; apps/web/app/api/llm/v1/chat/completions/route.ts:818; apps/extension/src/features/side-panel/bubbles.ts:932

## S56.18 Document editing.
- Should: The assistant can edit a word-processing document (e.g. Google Docs or Word) in a connected account.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/directory/sources/first-party.json:92; apps/web/lib/connectors/directory/sources/first-party.json:142; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:85; apps/mobile/services/streaming.ts:167

## S56.19 Spreadsheet editing.
- Should: The assistant can read and edit a spreadsheet in a connected account.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:163; apps/web/lib/connectors/oauth-scope-allowlist.ts:44; apps/web/lib/connectors/catalog.ts:190; apps/web/lib/connectors/mcp-endpoints.ts:13

## S56.20 Presentation editing.
- Should: The assistant can edit a presentation (e.g. Slides/PowerPoint) in a connected account.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:224; apps/web/lib/connectors/directory/sources/first-party.json:204; apps/web/lib/connectors/oauth-scope-allowlist.ts:164; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:85

## S56.21 Team-message search.
- Should: The assistant can search messages in a connected team chat workspace (Slack/Teams).
- Status: web partial, desktop partial, mobile partial, cli done, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:90; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: register the Slack connector app with the search:read.* scopes and add the slack entry with its client pair (Teams has no verified hosted MCP server and stays out of scope) | desktop: owner: register the Slack connector app with the search:read.* scopes and add the slack entry with its client pair (Teams has no verified hosted MCP server and stays out of scope) | mobile: owner: register the Slack connector app with search:read.* scopes and add its entry; Teams stays out of scope (no verified hosted MCP server) | chrome: Slack's search:read scopes are admitted (693fe31f9); the owner

## S56.22 Team-message drafting and posting.
- Should: The assistant can draft and post a message to a team chat channel, after approval.
- Status: web unverified, desktop unverified, mobile unverified, cli done, vscode done, chrome unverified
- Code: crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575; apps/cli/src/agent/chat.rs:969; apps/cli/src/models/streaming.rs:588

## S56.23 Knowledge-base search.
- Should: The assistant can search a connected knowledge base (e.g. Notion, Confluence).
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:156; apps/web/lib/connectors/directory/sources/first-party.json:88; apps/web/lib/connectors/mcp-endpoints.ts:37; apps/web/lib/connectors/directory/sources/first-party.json:142

## S56.24 Wiki/page editing.
- Should: The assistant can create or edit wiki/knowledge-base pages in a connected workspace.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:156; apps/web/lib/connectors/directory/sources/first-party.json:92; apps/web/lib/connectors/mcp-endpoints.ts:37; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:85

## S56.25 Issue and task creation.
- Should: The assistant can create an issue or task in a connected tracker, after approval.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:167; apps/web/lib/connectors/directory/sources/first-party.json:130; apps/web/lib/connectors/oauth-scope-allowlist.ts:112; apps/web/lib/connectors/directory/sources/first-party.json:175

## S56.26 Issue status updates.
- Should: The assistant can update an issue's status or fields in a connected tracker.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:170; apps/web/lib/connectors/directory/sources/first-party.json:176; apps/web/lib/connectors/oauth-scope-allowlist.ts:120; apps/web/lib/connectors/mcp-endpoints.ts:105

## S56.27 Project-management boards.
- Should: The assistant can view and work with project boards in a connected project-management tool.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:170; apps/web/lib/connectors/directory/sources/first-party.json:177; apps/web/lib/connectors/oauth-scope-allowlist.ts:120; apps/web/lib/connectors/mcp-endpoints.ts:80

## S56.28 CRM account/contact lookup.
- Should: The assistant can look up CRM accounts and contacts in a connected CRM.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:172; apps/web/lib/connectors/directory/sources/first-party.json:155; apps/web/lib/connectors/oauth-scope-allowlist.ts:139; apps/web/lib/connectors/mcp-endpoints.ts:135

## S56.29 CRM opportunity updates.
- Should: The assistant can update CRM opportunities/deals, after approval.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:172; apps/web/lib/connectors/directory/sources/first-party.json:156; apps/web/lib/connectors/oauth-scope-allowlist.ts:139; apps/web/lib/connectors/mcp-endpoints.ts:135

## S56.30 Support-ticket workflows.
- Should: The assistant can search, read and act on support tickets in a connected help desk.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:175; apps/web/lib/connectors/directory/sources/first-party.json:247; apps/web/lib/connectors/directory/sources/first-party.json:258; apps/web/lib/connectors/mcp-endpoints.ts:141

## S56.31 Repository search.
- Should: The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).
- Status: web partial, desktop partial, mobile partial, cli done, vscode done, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:181; apps/web/lib/connectors/oauth-registry.ts:21; apps/cli/src/features/exec/tools/dir_ops/mod.rs:91; apps/cli/src/features/exec/tools/dir_ops/mod.rs:66; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5648; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950; apps/web/app/api/llm/v1/chat/completions/route.ts:818; apps/extension/src/features/side-panel/bubbles.ts:932
- Unfinished: web: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | desktop: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | mobile: owner: create the GitHub App (Actions read) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID/_SECRET; GitLab has no pinned server | chrome: GitHub hosted MCP

## S56.32 Pull-request workflows.
- Should: The assistant can read a pull request, review it and post review comments on the hosted repository.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:158; apps/web/lib/user-connector-tools.ts:269; apps/web/lib/user-connector-tools.ts:309; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:85

## S56.33 CI status and logs.
- Should: The assistant can report CI pipeline status and show build logs from a connected CI provider.
- Status: web partial, desktop partial, mobile partial, cli done, vscode missing, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:181; apps/web/lib/connectors/oauth-registry.ts:21; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575
- Unfinished: web: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | desktop: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | mobile: owner: create the GitHub App (Actions read) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID/_SECRET; GitLab has no pinned server | chrome: The github-mcp des

## S56.34 Design-file inspection.
- Should: The assistant can inspect a design file (frames, components, metadata) from a connected design tool.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:223; apps/web/lib/connectors/directory/sources/first-party.json:109; apps/web/lib/connectors/directory/sources/first-party.json:111; apps/web/lib/connectors/oauth-scope-allowlist.ts:157

## S56.35 Design-to-code references.
- Should: The assistant can pull design-to-code references (code context, dev resources) from a connected design file.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:223; apps/web/lib/connectors/directory/sources/first-party.json:109; apps/web/lib/connectors/oauth-scope-allowlist.ts:157; apps/web/lib/connectors/mcp-endpoints.ts:129

## S56.36 Database querying.
- Should: The assistant can run queries against a connected database.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/lib/connectors/directory/sources/first-party.json:538; apps/web/lib/connectors/directory/sources/first-party.json:550; apps/mobile/src/features/settings/cloud-connectors/index.tsx:44; apps/web/lib/connectors/directory/sources/first-party.json:568; apps/cli/src/models/streaming.rs:588; apps/cli/src/models/managed_approvals.rs:135; apps/cli/src/agent/chat.rs:950; apps/cli/src/app_server/developer_host.rs:3066

## S56.37 Warehouse analysis.
- Should: The assistant can analyze data in a connected data warehouse.
- Status: web partial, desktop partial, cli missing, vscode missing, chrome partial
- Code: apps/web/lib/connectors/account-url-connectors.ts:12; apps/web/lib/connectors/account-url-connectors.ts:21; apps/web/app/api/connectors/route.ts:617; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:669; packages/ui/ui/src/settings-modal/SettingsModal.tsx:462; apps/web/lib/connectors/custom-connector-creation.ts:72
- Unfinished: web: live-check with the owner's warehouse accounts: add a Snowflake connector by account URL (OAuth client or PAT) and a Databricks one; sign-in completes and a query tool runs | desktop: live-check with the owner's warehouse accounts: add a Snowflake connector by account URL (OAuth client or PAT) and a Databricks one; sign-in completes and a query tool runs | chrome: partials/mcp-web 2e08cf2e6: Snowflake and Databricks are added by account URL, as custom connectors are in Claude (support.claude.com/en/articles/11175166, 2026-09-28): the cards open the custom connector form with the vendor's

## S56.38 Dashboard creation.
- Should: The assistant can create a dashboard in a connected analytics/BI tool.
- Status: web unverified, desktop unverified, mobile unverified, cli done, vscode missing, chrome unverified
- Code: crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51; apps/cli/src/models/managed_approvals.rs:142; apps/cli/src/models/streaming.rs:571; apps/cli/src/models/streaming.rs:575; apps/cli/src/agent/chat.rs:969

## S56.39 Deployment management.
- Should: The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/ToolTimeline.tsx:280; packages/ui/ui/src/settings-modal/SettingsModal.tsx:1967; apps/web/app/api/llm/v1/chat/completions/route.ts:735; apps/web/lib/user-connector-tools.ts:2269; apps/web/lib/connectors/catalog.ts:197; apps/web/lib/connectors/directory/sources/first-party.json:374; apps/web/lib/connectors/directory/sources/first-party.json:379; apps/web/lib/connectors/mcp-endpoints.ts:171

## S56.40 Licensed research retrieval.
- Should: The assistant can retrieve content from licensed research sources through a connected account.
- Status: web unverified, desktop unverified, mobile unverified, cli missing, vscode missing, chrome unverified

## S56.41 Shopping/product lookup.
- Should: The assistant can look up products and prices through a connected shopping service.
- Status: web unverified, desktop unverified, mobile unverified, cli missing, vscode missing, chrome unverified

## S56.42 Reservations and bookings.
- Should: The assistant can search for and make reservations or bookings through a connected service.
- Status: web unverified, desktop unverified, mobile unverified, cli missing, vscode missing, chrome unverified

## S56.43 Media playback.
- Should: The assistant can control media playback (play, pause, queue) in a connected media service.
- Status: web unverified, desktop unverified, mobile unverified, cli missing, vscode missing, chrome unverified

## S56.44 Native messaging applications.
- Should: The assistant can read or send messages in native messaging apps (iMessage, SMS, WhatsApp, Telegram) on the user's behalf.
- Status: web missing, desktop missing, cli missing, vscode missing, chrome missing

## S56.45 Local notes and calendars.
- Should: The assistant can read and add to the notes and calendars stored on the user's own device.
- Status: desktop missing, mobile done, cli missing, vscode missing
- Code: apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts:254; apps/mobile/stores/chat/chatExecutionStore.ts:500

## S56.46 Health-record connections.
- Should: The assistant can read the user's health records through a connected provider account.
- Status: web partial, desktop partial, mobile done, cli missing, vscode done, chrome partial
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:234; apps/mobile/src/features/settings/cloud-connectors/index.tsx:44; apps/web/lib/connectors/directory/sources/vendor-directory.json:3463; apps/cli/src/models/streaming.rs:588; apps/cli/src/models/managed_approvals.rs:135; apps/cli/src/agent/chat.rs:950; apps/cli/src/app_server/developer_host.rs:3066; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2956
- Unfinished: web: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off | desktop: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off | chrome: partials/mcp-web 5ab7fcf59: health records connect through HealthEx's MCP server (https://api.healthex.io/

## S56.47 Financial-account connections.
- Should: The assistant can read balances and transactions from a connected financial account.
- Status: web partial, desktop partial, mobile partial, cli done, vscode missing, chrome partial
- Code: apps/web/lib/connectors/bank-accounts.ts:385; apps/web/lib/connectors/bank-accounts.ts:401; apps/web/features/finance/components/LinkedBanks.tsx:31; apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx:16; apps/web/lib/connectors/bank-accounts.ts:226; crates/agiworkforce-llm/src/stream.rs:931; crates/agiworkforce-llm/src/stream.rs:809; apps/cli/src/models/managed_approvals.rs:51
- Unfinished: web: code complete (partials/mobile-features deeb0742ae): Hosted Link from the phone, several banks per account (migration 0349_bank_account_items), per-bank removal and per-account include switches on web and mobile, Hosted Link ownership hardening. Left: owner Plaid steps (agreement, production transactions, compliance, PLAID_CLIENT_ID/SECRET/ENV), migration apply, device check of the auth session | desktop: code complete (partials/mobile-features deeb0742ae): Hosted Link from the phone, several banks per account (migration 0349_bank_account_items), per-bank removal and per-account include s
