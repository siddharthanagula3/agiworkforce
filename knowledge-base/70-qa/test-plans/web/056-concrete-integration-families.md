---
id: "PLAN-web-056"
type: "test-plan"
title: "Web · 56. Concrete integration families"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "56"
---
# Web · 56. Concrete integration families

44 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S56.01 Email search.

- **Expected:** With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Settings > Connectors > Browse connectors > Gmail, then ask in chat to search mail (labels found in the code)
- **Needs:** an outside account (Google) with Gmail; the Gmail OAuth client must be set up by the owner first
- **Steps:**
  1. Open Settings and choose Connectors.
  2. Click Browse connectors and find Gmail.
  3. Connect Gmail with a test Google account and approve access.
  4. In a new chat type: search my email for a message from a named sender.
  5. Look for matching messages in the reply, and compare with Expected.

## S56.02 Email reading.

- **Expected:** The assistant can open and read the full content of a specific email or thread from a connected mailbox.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Settings > Connectors > Browse connectors > Gmail, then ask in chat to open a specific email (labels found in the code)
- **Needs:** an outside account (Google) with Gmail; owner must set up the Gmail OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Gmail.
  2. Connect Gmail with a test Google account.
  3. In a new chat type: open the latest email from a named sender and show the full text.
  4. Check the reply shows the full message body and the thread, and compare with Expected.

## S56.03 Email drafting.

- **Expected:** The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Settings > Connectors > Browse connectors > Gmail, then ask in chat to draft an email (labels found in the code)
- **Needs:** an outside account (Google) with Gmail; owner must set up the Gmail OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Gmail.
  2. Connect Gmail with a test Google account.
  3. In a new chat type: draft a reply to the latest email from a named sender.
  4. Open the Gmail account and check a draft exists, and compare with Expected.

## S56.04 Email sending.

- **Expected:** The assistant can send an email from the connected account, after approval.
- **Code:** partial. Evidence present: apps/web/lib/connectors/gmail-actions.ts:30
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place; also complete Google sensitive-scope verification for gmail.send
- **Where to find it:** Settings > Connectors > Browse connectors > Gmail, then ask in chat to send an email and approve it (labels found in the code)
- **Needs:** an outside account (Google) with Gmail; owner must set up the Gmail OAuth client and Google sensitive-scope verification for gmail.send
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Gmail.
  2. Connect Gmail with a test Google account.
  3. In a new chat type: send a short test email to a test address.
  4. When asked, approve the send, then check the Sent folder and compare with Expected.

## S56.05 Email attachments.

- **Expected:** The assistant can read attachments on an email and attach files when composing.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Settings > Connectors > Browse connectors > Gmail, then ask in chat about an attachment (labels found in the code)
- **Needs:** an outside account (Google) with Gmail and an email that has an attachment; owner must set up the Gmail OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Gmail.
  2. Connect Gmail with a test Google account.
  3. In a new chat type: list the attachments on the latest email from a named sender.
  4. Check the reply names the attachment, and compare with Expected.

## S56.07 Calendar search.

- **Expected:** The assistant can search the connected calendar for events by text or date range.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Browse connectors > Google Calendar, then ask in chat to search events (labels found in the code)
- **Needs:** an outside account (Google) with Google Calendar; owner must add the google-calendar OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Calendar.
  2. Connect Google Calendar with a test Google account.
  3. In a new chat type: find my events next week that mention a named topic.
  4. Check the reply lists matching events with dates, and compare with Expected.

## S56.08 Free/busy inspection.

- **Expected:** The assistant can check free/busy time on the connected calendar to find open slots.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Browse connectors > Google Calendar, then ask in chat for free time (labels found in the code)
- **Needs:** an outside account (Google) with Google Calendar; owner must add the google-calendar OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Calendar.
  2. Connect Google Calendar with a test account.
  3. In a new chat type: find a free one-hour slot tomorrow afternoon.
  4. Check the reply names open times from the calendar, and compare with Expected.

## S56.09 Event creation.

- **Expected:** The assistant can create a calendar event on the connected calendar, after approval.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Browse connectors > Google Calendar, then ask in chat to create an event (labels found in the code)
- **Needs:** an outside account (Google) with Google Calendar; owner must add the google-calendar OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Calendar.
  2. Connect Google Calendar with a test account.
  3. In a new chat type: create a 30 minute event tomorrow at 10 am called Test sync.
  4. Approve when asked, then open Google Calendar and compare with Expected.

## S56.10 Event editing and cancellation.

- **Expected:** The assistant can edit or cancel an existing calendar event.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Browse connectors > Google Calendar, then ask in chat to edit or cancel an event (labels found in the code)
- **Needs:** an outside account (Google) with Google Calendar and an existing test event; owner must add the google-calendar OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Calendar.
  2. Connect Google Calendar with a test account.
  3. In a new chat type: move the Test sync event to 11 am, or cancel it.
  4. Approve when asked, then check the event in Google Calendar, and compare with Expected.

## S56.11 Meeting invitations.

- **Expected:** The assistant can send meeting invitations and respond to invitations on the connected calendar.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Browse connectors > Google Calendar, then ask in chat to invite someone (labels found in the code)
- **Needs:** an outside account (Google) with Google Calendar and a second test address; owner must add the google-calendar OAuth client first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Calendar.
  2. Connect Google Calendar with a test account.
  3. In a new chat type: invite a test address to the Test sync event.
  4. Approve when asked, then check the invitation in the test address inbox, and compare with Expected.

## S56.12 Contacts and recipient lookup.

- **Expected:** The assistant can look up people in the user's address book to find a recipient's email or details.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:44 (quoted code not found in the file now)
- **Known to be unfinished:** owner: enable the People API and People MCP API in Google Cloud and add the google-contacts entry with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET
- **Where to find it:** Settings > Connectors > Browse connectors > Google Contacts, then ask in chat for a person's email (labels found in the code)
- **Needs:** an outside account (Google) with saved contacts; owner must enable the People API and add the google-contacts client pair first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Contacts.
  2. Connect Google Contacts with a test account.
  3. In a new chat type: what is the email address of a named contact in my address book?
  4. Check the reply gives the address stored in Contacts, and compare with Expected.

## S56.13 Cloud-file search.

- **Expected:** The assistant can search files in a connected cloud drive.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:164; apps/web/lib/connectors/directory/sources/first-party.json:10; apps/web/lib/connectors/oauth-scope-allowlist.ts:43 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:462
- **Where to find it:** Settings > Connectors > Browse connectors > Google Drive, then ask in chat to search files (labels found in the code)
- **Needs:** an outside account (Google) with Google Drive files
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Drive.
  2. Connect Google Drive with a test account.
  3. In a new chat type: find files in my Drive with a name that contains a test word.
  4. Check the reply lists matching files, and compare with Expected.

## S56.14 Cloud-file download.

- **Expected:** The assistant can download/read the content of a file from a connected cloud drive.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:441; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Browse connectors > Google Drive, then ask in chat to read a file (labels found in the code)
- **Needs:** an outside account (Google) with a test file in Drive
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Drive.
  2. Connect Google Drive with a test account.
  3. In a new chat type: read the text of the file named Test notes in my Drive.
  4. Check the reply shows the file content, and compare with Expected.

## S56.15 Cloud-file creation.

- **Expected:** The assistant can create a new file in a connected cloud drive, after approval.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:43 (quoted code not found in the file now)
- **Known to be unfinished:** owner: add the google-drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON; create_file and drive.file are in place
- **Where to find it:** Settings > Connectors > Browse connectors > Google Drive, then ask in chat to create a file (labels found in the code)
- **Needs:** an outside account (Google) with Google Drive; owner must add the google-drive entry and client pair first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Drive.
  2. Connect Google Drive with a test account.
  3. In a new chat type: create a new document called Test file in my Drive.
  4. Approve when asked, then check Google Drive and compare with Expected.

## S56.16 Cloud-file editing.

- **Expected:** The assistant can modify an existing file in a connected cloud drive.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:459; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Browse connectors > Google Drive, then ask in chat to change a file (labels found in the code)
- **Needs:** an outside account (Google) with an editable test file
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Google Drive.
  2. Connect Google Drive with a test account.
  3. In a new chat type: add a line Reviewed to the file Test file in my Drive.
  4. Approve when asked, then open the file in Drive and compare with Expected.

## S56.17 Folder and sharing management.

- **Expected:** The assistant can create folders and manage sharing (links, collaborators) in a connected cloud drive.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. Ledger gives no code location. Searched apps/web lib, features and app for create_folder and sharing terms; the only hit is create_folder in apps/web/lib/connectors/directory/sources/first-party.json:448, which sits inside the Box entry, but no sharing-management control was found.
- **Needs:** a connected cloud drive account

## S56.18 Document editing.

- **Expected:** The assistant can edit a word-processing document (e.g. Google Docs or Word) in a connected account.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Connectors > Browse connectors > Notion, then ask in chat to edit a page (labels found in the code)
- **Needs:** an outside account (Notion) with a test page
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Notion.
  2. Connect Notion with a test account.
  3. In a new chat type: add a line Reviewed today to my Notion page named Test page.
  4. Open the page in Notion and compare with Expected.

## S56.19 Spreadsheet editing.

- **Expected:** The assistant can read and edit a spreadsheet in a connected account.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:174; apps/web/lib/connectors/oauth-scope-allowlist.ts:44 (quoted code not found in the file now); apps/web/lib/connectors/catalog.ts:212; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Browse connectors, then ask in chat to edit a spreadsheet (labels found in the code)
- **Needs:** an outside account (Google) with a test spreadsheet
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors.
  2. Find the Google Sheets connector and connect a test account.
  3. In a new chat type: set cell A1 of my test sheet to Reviewed.
  4. Open the sheet and compare with Expected.

## S56.20 Presentation editing.

- **Expected:** The assistant can edit a presentation (e.g. Slides/PowerPoint) in a connected account.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:243; apps/web/lib/connectors/directory/sources/first-party.json:216; apps/web/lib/connectors/oauth-scope-allowlist.ts:164 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Browse connectors > Canva, then ask in chat to edit a presentation (labels found in the code)
- **Needs:** an outside account (Canva) with a test design
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Canva.
  2. Connect Canva with a test account.
  3. In a new chat type: change the title on my test design to Reviewed.
  4. Open the design and compare with Expected.

## S56.21 Team-message search.

- **Expected:** The assistant can search messages in a connected team chat workspace (Slack/Teams).
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:90 (quoted code not found in the file now)
- **Known to be unfinished:** owner: register the Slack connector app with the search:read.* scopes and add the slack entry with its client pair (Teams has no verified hosted MCP server and stays out of scope)
- **Where to find it:** Settings > Connectors > Browse connectors > Slack, then ask in chat to search messages (labels found in the code)
- **Needs:** an outside account (Slack) in a test workspace; owner must register the Slack app with search:read scopes first
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Slack.
  2. Connect Slack with a test workspace account.
  3. In a new chat type: find Slack messages that mention a test word.
  4. Check the reply lists matching messages with channels, and compare with Expected.

## S56.22 Team-message drafting and posting.

- **Expected:** The assistant can draft and post a message to a team chat channel, after approval.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Ledger gives no code location. Searched apps/web lib, features and app for post_message, send_message and posting terms, with no match outside tests.
- **Needs:** a connected team chat workspace

## S56.23 Knowledge-base search.

- **Expected:** The assistant can search a connected knowledge base (e.g. Notion, Confluence).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:100; apps/web/lib/connectors/mcp-endpoints.ts:13; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Connectors > Browse connectors > Notion, then ask in chat to search pages (labels found in the code)
- **Needs:** an outside account (Notion) with a test page
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Notion.
  2. Connect Notion with a test account.
  3. In a new chat type: find my Notion pages about a test topic.
  4. Check the reply lists matching pages with titles, and compare with Expected.

## S56.24 Wiki/page editing.

- **Expected:** The assistant can create or edit wiki/knowledge-base pages in a connected workspace.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Browse connectors > Notion, then ask in chat to create a page (labels found in the code)
- **Needs:** an outside account (Notion) with a test workspace
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Notion.
  2. Connect Notion with a test account.
  3. In a new chat type: create a Notion page called Test wiki under my test workspace.
  4. Approve when asked, then open Notion and compare with Expected.

## S56.25 Issue and task creation.

- **Expected:** The assistant can create an issue or task in a connected tracker, after approval.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:184; apps/web/lib/connectors/directory/sources/first-party.json:142; apps/web/lib/connectors/oauth-scope-allowlist.ts:112 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:187
- **Where to find it:** Settings > Connectors > Browse connectors > Jira, then ask in chat to create an issue (labels found in the code)
- **Needs:** an outside account (Jira or Atlassian) with a test project; approval is required
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Jira.
  2. Connect Jira with a test account.
  3. In a new chat type: create a Jira issue called Test issue in my test project.
  4. Approve when asked, then open Jira and compare with Expected.

## S56.26 Issue status updates.

- **Expected:** The assistant can update an issue's status or fields in a connected tracker.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:188; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Browse connectors > Asana, then ask in chat to change an issue status (labels found in the code)
- **Needs:** an outside account (Asana) with a test task; approval is required
- **Steps:**
  1. Open Settings, choose Connectors, click Browse connectors and find Asana.
  2. Connect Asana with a test account.
  3. In a new chat type: mark the Test task in my test project as complete.
  4. Approve when asked, then open Asana and compare with Expected.

## S56.27 Project-management boards.

- **Expected:** The assistant can view and work with project boards in a connected project-management tool.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:189; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Linear > Connect (labels found in the code)
- **Needs:** a Linear account (an outside account); a signed-in Free or paid account (not checked)
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click Linear, then click Connect and finish the Linear sign-in.
  3. Start a new chat and type: Show the open issues on my Linear board.
  4. Check that the reply lists issues from your Linear board, as Expected says.

## S56.28 CRM account/contact lookup.

- **Expected:** The assistant can look up CRM accounts and contacts in a connected CRM.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:167; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > HubSpot > Connect (labels found in the code)
- **Needs:** a HubSpot account (an outside account)
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click HubSpot, then click Connect and finish the HubSpot sign-in.
  3. Start a new chat and type: Find the HubSpot contact for a named person and their company.
  4. Check that the reply shows the contact and account details from HubSpot, as Expected says.

## S56.29 CRM opportunity updates.

- **Expected:** The assistant can update CRM opportunities/deals, after approval.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:168; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > HubSpot > Connect (labels found in the code)
- **Needs:** a HubSpot account with a deal you can change (an outside account)
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click HubSpot, then click Connect and finish the HubSpot sign-in.
  3. Start a new chat and type: Move the deal for a named account to the next stage, and show me the change.
  4. Check that the reply asks you to approve the change first and then shows the updated deal, as Expected says.

## S56.30 Support-ticket workflows.

- **Expected:** The assistant can search, read and act on support tickets in a connected help desk.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:197; apps/web/lib/connectors/directory/sources/first-party.json:259; apps/web/lib/connectors/directory/sources/first-party.json:270; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Intercom > Connect (labels found in the code)
- **Needs:** an Intercom account (an outside account)
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click Intercom, then click Connect and finish the Intercom sign-in.
  3. Start a new chat and type: Find open support conversations about billing.
  4. Check that the reply lists matching support conversations from Intercom, as Expected says.

## S56.31 Repository search.

- **Expected:** The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:181 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server)
- **Where to find it:** Settings > Connectors > GitHub MCP > Connect (labels found in the code)
- **Needs:** a GitHub account with access to a repository; the owner's GitHub App setup
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click GitHub MCP, then click Connect and finish the GitHub sign-in.
  3. Start a new chat and type: Search my repository for the function named loadSettings.
  4. Check that the reply lists matching files and lines from the hosted repository, as Expected says.

## S56.32 Pull-request workflows.

- **Expected:** The assistant can read a pull request, review it and post review comments on the hosted repository.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:168; apps/web/lib/user-connector-tools.ts:303; apps/web/lib/user-connector-tools.ts:343
- **Where to find it:** Settings > Connectors > GitHub MCP > Connect (labels found in the code)
- **Needs:** a GitHub account with a pull request you can open; the owner's GitHub App setup
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click GitHub MCP, then click Connect and finish the GitHub sign-in.
  3. Start a new chat and type: Read pull request 1 in a repository you can access and summarise it.
  4. Check that the reply summarises that pull request, and that it asks you before it posts any review comment, as Expected says.

## S56.33 CI status and logs.

- **Expected:** The assistant can report CI pipeline status and show build logs from a connected CI provider.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:181 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server)
- **Where to find it:** Settings > Connectors > GitHub MCP > Connect (labels found in the code)
- **Needs:** a GitHub account with a repository that runs Actions
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click GitHub MCP, then click Connect and finish the GitHub sign-in.
  3. Start a new chat and type: What is the CI status of the latest run on my main branch? Show me the log for any failed step.
  4. Check that the reply gives the run status and the failed step's log, as Expected says.

## S56.34 Design-file inspection.

- **Expected:** The assistant can inspect a design file (frames, components, metadata) from a connected design tool.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/directory/sources/first-party.json:123; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Figma > Connect (labels found in the code)
- **Needs:** a Figma account with a design file (an outside account)
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click Figma, then click Connect and finish the Figma sign-in.
  3. Start a new chat and type: List the frames and components in my Figma file named Landing page.
  4. Check that the reply lists the frames and components from that Figma file, as Expected says.

## S56.35 Design-to-code references.

- **Expected:** The assistant can pull design-to-code references (code context, dev resources) from a connected design file.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Figma > Connect (labels found in the code)
- **Needs:** a Figma account with a design file (an outside account)
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click Figma, then click Connect and finish the Figma sign-in.
  3. Start a new chat and type: Give me the code references for the button in my Figma file named Landing page.
  4. Check that the reply gives code context or dev resources taken from that design file, as Expected says.

## S56.36 Database querying.

- **Expected:** The assistant can run queries against a connected database.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/first-party.json:571; apps/web/lib/connectors/directory/sources/first-party.json:583
- **Where to find it:** Settings > Connectors > Neon > Connect (labels found in the code)
- **Needs:** a Neon or Supabase account with a database
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click Neon (or Supabase), then click Connect and finish the sign-in.
  3. Start a new chat and type: Run a query that counts the rows in the users table of my database.
  4. Check that the reply shows the count returned by the database, as Expected says.

## S56.37 Warehouse analysis.

- **Expected:** The assistant can analyze data in a connected data warehouse.
- **Code:** partial. Evidence present: apps/web/lib/connectors/account-url-connectors.ts:12
- **Known to be unfinished:** live-check with the owner's warehouse accounts: add a Snowflake connector by account URL (OAuth client or PAT) and a Databricks one; sign-in completes and a query tool runs
- **Where to find it:** Settings > Connectors > Add custom connector (labels found in the code)
- **Needs:** a Snowflake or Databricks account and its MCP server address
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click Add custom connector.
  3. Enter your Snowflake or Databricks MCP server address in the form shown (the placeholder shows the format), then finish the sign-in.
  4. Start a new chat and type: Run a query on my warehouse for last month's totals. Check that the reply returns results from the warehouse, as Expected says.

## S56.38 Dashboard creation.

- **Expected:** The assistant can create a dashboard in a connected analytics/BI tool.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched the connector directory and catalog (apps/web/lib/connectors) for dashboard, Looker, Metabase, Tableau and Power BI. No BI connector was found. Amplitude (vendor-directory.json) mentions charts and dashboards but is not confirmed as the intended connector.
- **Needs:** an analytics or BI account (external service)

## S56.39 Deployment management.

- **Expected:** The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:219; apps/web/lib/connectors/directory/sources/first-party.json:386; apps/web/lib/connectors/directory/sources/first-party.json:391; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Vercel > Connect (labels found in the code)
- **Needs:** a Vercel account (an outside account)
- **Steps:**
  1. Open your account menu, choose Settings, then click Connectors.
  2. Click Vercel, then click Connect and finish the Vercel sign-in.
  3. Start a new chat and type: List my latest Vercel deployments and their status.
  4. Check that the reply lists the deployments with their status, as Expected says.

## S56.40 Licensed research retrieval.

- **Expected:** The assistant can retrieve content from licensed research sources through a connected account.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched the vendor directory names for research, licensed, journal and similar terms. Candidates were FactSet Research Systems (vendor-directory.json) and Midpage Legal Research, but neither was confirmed as licensed research retrieval. No code was found for this item.
- **Needs:** a licensed research account (external service)

## S56.41 Shopping/product lookup.

- **Expected:** The assistant can look up products and prices through a connected shopping service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched the vendor directory and catalog for shopping and product terms. Shopify is listed (apps/web/lib/connectors/catalog.ts and vendor-directory.json), but it is a store platform, not confirmed as a shopping or price lookup service.
- **Needs:** a shopping account (external service)

## S56.42 Reservations and bookings.

- **Expected:** The assistant can search for and make reservations or bookings through a connected service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Booking.com is listed in apps/web/lib/connectors/directory/sources/vendor-directory.json, but I did not confirm that the assistant can search or make bookings through it, or that it can be connected from the UI.
- **Needs:** a booking account (external service)

## S56.43 Media playback.

- **Expected:** The assistant can control media playback (play, pause, queue) in a connected media service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched the connector directory and catalog for Spotify, Apple Music and playback terms. Nothing matched.
- **Needs:** a media service account (external service)

## S56.46 Health-record connections.

- **Expected:** The assistant can read the user's health records through a connected provider account.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:234 (quoted code not found in the file now)
- **Known to be unfinished:** owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off
- **Where to find it:** not found in the code. HealthEx (beta) is listed in apps/web/lib/connectors/directory/sources/vendor-directory.json and apps/web/lib/connectors/catalog.ts, with a US-only rule in sensitive-data-connectors.ts. I did not confirm whether it appears in the UI. The plan says the owner keeps Health off.
- **Needs:** an outside health provider account and identity checks (owner decision pending)

## S56.47 Financial-account connections.

- **Expected:** The assistant can read balances and transactions from a connected financial account.
- **Code:** partial. Evidence present: apps/web/lib/connectors/bank-accounts.ts:396; apps/web/lib/connectors/bank-accounts.ts:414; apps/web/features/finance/components/LinkedBanks.tsx:31; apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx:17; apps/web/lib/connectors/bank-accounts.ts:226
- **Known to be unfinished:** code complete (partials/mobile-features deeb0742ae): Hosted Link from the phone, several banks per account (migration 0349_bank_account_items), per-bank removal and per-account include switches on web and mobile, Hosted Link ownership hardening. Left: owner Plaid steps (agreement, production transactions, compliance, PLAID_CLIENT_ID/SECRET/ENV), migration apply, device check of the auth session
- **Where to find it:** Finance page (web address /chat/finance) > Connect a bank account > Linked banks (labels found in the code)
- **Needs:** a bank login that the bank provider accepts; the plan says owner Plaid steps are still pending
- **Steps:**
  1. Open the Finance page at /chat/finance (the sidebar entry was not located in the code).
  2. Click Connect a bank account and finish the bank sign-in.
  3. Look at the Linked banks list: the bank appears by name, and Remove bank is available for each one.
  4. Check that the balances and transactions for that bank appear on the Finance page, as Expected says.
