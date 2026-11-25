---
id: "PLAN-desktop-056"
type: "test-plan"
title: "Desktop · 56. Concrete integration families"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "56"
---
# Desktop · 56. Concrete integration families

44 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S56.01 Email search.

- **Expected:** With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Gmail card and sign in with Google.
  3. Go back to the chat and type: Find my emails from a sender you know.
  4. Compare the listed messages with the sender and subject shown in Gmail.

## S56.02 Email reading.

- **Expected:** The assistant can open and read the full content of a specific email or thread from a connected mailbox.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Gmail as in S56.01.
  2. Open a message in Gmail and note its subject and body.
  3. In the chat type: Open my latest email from that sender and give me the full text.
  4. Compare the full body in the chat with the body in Gmail.

## S56.03 Email drafting.

- **Expected:** The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Gmail as in S56.01.
  2. In the chat type: Draft a reply to my latest email from that sender.
  3. Read the draft the assistant shows in the chat.
  4. Open Gmail Drafts and check the draft exists and was not sent.

## S56.04 Email sending.

- **Expected:** The assistant can send an email from the connected account, after approval.
- **Code:** partial. Evidence present: apps/web/lib/connectors/gmail-actions.ts:30
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place; also complete Google sensitive-scope verification for gmail.send
- **Where to find it:** Chat > ask to send a Gmail draft > Allow once on the approval card (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Gmail and make a draft as in S56.03.
  2. In the chat type: Send that draft to my second address.
  3. On the approval card that appears, click Allow once.
  4. Check Gmail Sent and confirm the email arrived after the click, not before.

## S56.05 Email attachments.

- **Expected:** The assistant can read attachments on an email and attach files when composing.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place
- **Where to find it:** Chat > use the attach control in the message box, then ask for a draft with the file (labels found in the code)
- **Needs:** an outside account (Google), a file to upload
- **Steps:**
  1. Connect Gmail as in S56.01.
  2. Attach a small file to the message box and send it.
  3. Type: Make a draft to my second address with this file attached.
  4. Open Gmail Drafts and check the attachment is on the draft.

## S56.07 Calendar search.

- **Expected:** The assistant can search the connected calendar for events by text or date range.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Google Calendar card and sign in with Google.
  3. In the chat type: What events do I have next week with the word review in the title?
  4. Compare the events listed with the Google Calendar view for next week.

## S56.08 Free/busy inspection.

- **Expected:** The assistant can check free/busy time on the connected calendar to find open slots.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Calendar as in S56.07.
  2. In the chat type: When am I free on a day next week between 2 and 5 pm?
  3. Read the open slots the assistant gives.
  4. Compare them with the busy blocks in Google Calendar for that day.

## S56.09 Event creation.

- **Expected:** The assistant can create a calendar event on the connected calendar, after approval.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Calendar as in S56.07.
  2. In the chat type: Add a 30 minute meeting called Planning on a day next week at 3 pm.
  3. On the approval card, click Allow once.
  4. Open Google Calendar and check the Planning event is at the time asked.

## S56.10 Event editing and cancellation.

- **Expected:** The assistant can edit or cancel an existing calendar event.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Calendar as in S56.07.
  2. In the chat type: Move my Planning meeting to 4 pm.
  3. On the approval card, click Allow once.
  4. Open Google Calendar and check the event moved; then ask to cancel it and check it is gone.

## S56.11 Meeting invitations.

- **Expected:** The assistant can send meeting invitations and respond to invitations on the connected calendar.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Google), a second address you can read
- **Steps:**
  1. Connect Google Calendar as in S56.07.
  2. In the chat type: Invite a second address to the Planning meeting.
  3. On the approval card, click Allow once.
  4. Check the second address received the invitation in its mailbox.

## S56.12 Contacts and recipient lookup.

- **Expected:** The assistant can look up people in the user's address book to find a recipient's email or details.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:44 (quoted code not found in the file now)
- **Known to be unfinished:** owner: enable the People API and People MCP API in Google Cloud and add the google-contacts entry with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET
- **Where to find it:** Settings > Connectors > Google Contacts > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Google Contacts card and sign in with Google.
  3. In the chat type: What is the email address for a person in my contacts?
  4. Compare the address with the one shown in Google Contacts.

## S56.13 Cloud-file search.

- **Expected:** The assistant can search files in a connected cloud drive.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:164; apps/web/lib/connectors/directory/sources/first-party.json:10; apps/web/lib/connectors/oauth-scope-allowlist.ts:43 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:462
- **Where to find it:** Settings > Connectors > Google Drive > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Google Drive card and sign in with Google.
  3. In the chat type: Find my Drive files with a word from a file name you know.
  4. Compare the files listed with the results in Google Drive search.

## S56.14 Cloud-file download.

- **Expected:** The assistant can download/read the content of a file from a connected cloud drive.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:441; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Google Drive > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Drive as in S56.13.
  2. In the chat type: Read the file named [a file name you know] from Google Drive and summarise it.
  3. Read the summary the assistant gives.
  4. Open the file in Google Drive and check the summary matches its content.

## S56.15 Cloud-file creation.

- **Expected:** The assistant can create a new file in a connected cloud drive, after approval.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:43 (quoted code not found in the file now)
- **Known to be unfinished:** owner: add the google-drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON; create_file and drive.file are in place
- **Where to find it:** Settings > Connectors > Google Drive > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Drive as in S56.13.
  2. In the chat type: Create a new Google Drive document called Test notes with one line of text.
  3. On the approval card, click Allow once.
  4. Open Google Drive and check the new file exists with that name and text.

## S56.16 Cloud-file editing.

- **Expected:** The assistant can modify an existing file in a connected cloud drive.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:459; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Google Drive > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Drive as in S56.13.
  2. In the chat type: Add the line Reviewed at the end of the Test notes file in Google Drive.
  3. On the approval card, click Allow once.
  4. Open the file in Google Drive and check the new line is at the end.

## S56.17 Folder and sharing management.

- **Expected:** The assistant can create folders and manage sharing (links, collaborators) in a connected cloud drive.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. The ledger gives no code location. A search of apps/web/lib/connectors found create_folder only in first-party.json, with no visible folder or sharing control tied to a card.
- **Needs:** an outside account (Google)

## S56.18 Document editing.

- **Expected:** The assistant can edit a word-processing document (e.g. Google Docs or Word) in a connected account.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Connectors > Google Drive > Connect (or Microsoft 365), then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Google or Microsoft)
- **Steps:**
  1. Connect Google Drive or Microsoft 365 as in S56.13.
  2. In the chat type: Add a new paragraph Status done to the end of my document named [a document name you know].
  3. On the approval card, click Allow once.
  4. Open the document and check the new paragraph is at the end.

## S56.19 Spreadsheet editing.

- **Expected:** The assistant can read and edit a spreadsheet in a connected account.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:174; apps/web/lib/connectors/oauth-scope-allowlist.ts:44 (quoted code not found in the file now); apps/web/lib/connectors/catalog.ts:212; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Google Drive > Connect (or Microsoft 365), then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Google or Microsoft)
- **Steps:**
  1. Connect Google Drive or Microsoft 365 as in S56.13.
  2. In the chat type: In my spreadsheet named [a sheet name you know], set cell A1 to Total.
  3. On the approval card, click Allow once.
  4. Open the sheet and check cell A1 shows Total.

## S56.20 Presentation editing.

- **Expected:** The assistant can edit a presentation (e.g. Slides/PowerPoint) in a connected account.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:243; apps/web/lib/connectors/directory/sources/first-party.json:216; apps/web/lib/connectors/oauth-scope-allowlist.ts:164 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Microsoft 365 > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Microsoft)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Microsoft 365 card and sign in.
  3. In the chat type: Add a slide titled Agenda to my presentation named [a deck name you know].
  4. On the approval card, click Allow once, then open the deck and check the new slide.

## S56.21 Team-message search.

- **Expected:** The assistant can search messages in a connected team chat workspace (Slack/Teams).
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:90 (quoted code not found in the file now)
- **Known to be unfinished:** owner: register the Slack connector app with the search:read.* scopes and add the slack entry with its client pair (Teams has no verified hosted MCP server and stays out of scope)
- **Where to find it:** Settings > Connectors > Slack > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Slack)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Slack card and sign in to Slack.
  3. In the chat type: Search Slack for messages that mention a word you used recently.
  4. Compare the results with a Slack search for the same word.

## S56.22 Team-message drafting and posting.

- **Expected:** The assistant can draft and post a message to a team chat channel, after approval.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The Slack card description says it can send messages, but no posting tool name was confirmed in the code; the ledger gives no code location.
- **Needs:** an outside account (Slack)

## S56.23 Knowledge-base search.

- **Expected:** The assistant can search a connected knowledge base (e.g. Notion, Confluence).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:100; apps/web/lib/connectors/mcp-endpoints.ts:13; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Connectors > Notion > Connect, then ask in the chat (labels found in the code)
- **Needs:** an outside account (Notion)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Notion card and sign in to Notion.
  3. In the chat type: Search Notion for a topic you have a page about.
  4. Compare the pages listed with the pages in Notion search.

## S56.24 Wiki/page editing.

- **Expected:** The assistant can create or edit wiki/knowledge-base pages in a connected workspace.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Notion > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Notion)
- **Steps:**
  1. Connect Notion as in S56.23.
  2. In the chat type: Create a Notion page called Test page with one line of text Hello.
  3. On the approval card, click Allow once.
  4. Open Notion and check the Test page exists with that text.

## S56.25 Issue and task creation.

- **Expected:** The assistant can create an issue or task in a connected tracker, after approval.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:184; apps/web/lib/connectors/directory/sources/first-party.json:142; apps/web/lib/connectors/oauth-scope-allowlist.ts:112 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:187
- **Where to find it:** Settings > Connectors > Jira > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Jira)
- **Steps:**
  1. Press ⌘, to open Settings, then click Connectors.
  2. Click Connect on the Jira card and sign in to Jira.
  3. In the chat type: Create an issue in my project called Test issue.
  4. On the approval card, click Allow once, then open Jira and check the new issue.

## S56.26 Issue status updates.

- **Expected:** The assistant can update an issue's status or fields in a connected tracker.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:188; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Jira > Connect, then ask in the chat and approve (labels found in the code)
- **Needs:** an outside account (Jira)
- **Steps:**
  1. Connect Jira as in S56.25.
  2. In the chat type: Change the status of the Test issue to Done.
  3. On the approval card, click Allow once.
  4. Open Jira and check the issue status now reads Done.

## S56.27 Project-management boards.

- **Expected:** The assistant can view and work with project boards in a connected project-management tool.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:189; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Add > Browse connectors > Asana > Connect (labels found in the code)
- **Needs:** an outside account (Asana)
- **Steps:**
  1. Open Settings and click Connectors.
  2. Click Add, then click Browse connectors.
  3. Click Asana, click Connect, and sign in to your Asana account.
  4. Start a new chat and type: show my Asana projects and the tasks on one board.
  5. Compare with Expected: the chat lists the projects and board tasks from Asana.

## S56.28 CRM account/contact lookup.

- **Expected:** The assistant can look up CRM accounts and contacts in a connected CRM.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:167; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Add > Browse connectors > HubSpot > Connect (labels found in the code)
- **Needs:** an outside account (HubSpot) with at least one contact
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Click HubSpot, then Connect, and sign in to your HubSpot account.
  3. Start a new chat and type: find the HubSpot contact named [a name you know] and give me their email and company.
  4. Compare with Expected: the chat returns the contact's details from HubSpot.

## S56.29 CRM opportunity updates.

- **Expected:** The assistant can update CRM opportunities/deals, after approval.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:168; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Add > Browse connectors > HubSpot > Connect (labels found in the code)
- **Needs:** an outside account (HubSpot) with a deal
- **Steps:**
  1. Connect HubSpot as in S56.28.
  2. Start a new chat and type: change the stage of the deal [deal name] to Closed won.
  3. When the assistant asks for approval, read the request and approve it.
  4. Compare with Expected: the deal stage changes in HubSpot after approval, and not before.

## S56.30 Support-ticket workflows.

- **Expected:** The assistant can search, read and act on support tickets in a connected help desk.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:197; apps/web/lib/connectors/directory/sources/first-party.json:259; apps/web/lib/connectors/directory/sources/first-party.json:270; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Add > Browse connectors > Intercom > Connect (labels found in the code)
- **Needs:** an outside account (Intercom)
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Click Intercom, then Connect, and sign in to your Intercom workspace.
  3. Start a new chat and type: find the open conversations about billing and summarise the newest one.
  4. Compare with Expected: the chat lists the matching conversations and summarises one.

## S56.31 Repository search.

- **Expected:** The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:181 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server)
- **Where to find it:** Settings > Connectors > Add > Browse connectors > GitHub MCP > Connect (labels found in the code)
- **Needs:** an outside account (GitHub) with a repository
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Click GitHub MCP, then Connect, and sign in to GitHub.
  3. Start a new chat and type: search my repository [repo name] for the word retry.
  4. Compare with Expected: the chat lists matching code with file paths from the repository.

## S56.32 Pull-request workflows.

- **Expected:** The assistant can read a pull request, review it and post review comments on the hosted repository.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:168; apps/web/lib/user-connector-tools.ts:303; apps/web/lib/user-connector-tools.ts:343
- **Where to find it:** Settings > Connectors > Add > Browse connectors > GitHub > Connect (labels found in the code)
- **Needs:** an outside account (GitHub) with an open pull request
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Find the GitHub entry, click it, then Connect, and sign in to GitHub.
  3. Start a new chat and type: review pull request #[number] in [repo] and list the main issues.
  4. Compare with Expected: the chat reads the pull request diff and summarises its issues.
  5. Ask it to post a review comment, approve the action when asked, then check the comment on GitHub.

## S56.33 CI status and logs.

- **Expected:** The assistant can report CI pipeline status and show build logs from a connected CI provider.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:181 (quoted code not found in the file now)
- **Known to be unfinished:** owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server)
- **Where to find it:** Settings > Connectors > Add > Browse connectors > GitHub MCP > Connect (labels found in the code)
- **Needs:** an outside account (GitHub) with a repository that has Actions runs
- **Steps:**
  1. Connect GitHub MCP as in S56.31.
  2. Start a new chat and type: what is the CI status of the latest run in [repo]? Show the failing build log if there is one.
  3. Compare with Expected: the chat reports the run status and shows log lines from the build.

## S56.34 Design-file inspection.

- **Expected:** The assistant can inspect a design file (frames, components, metadata) from a connected design tool.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/directory/sources/first-party.json:123; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Add > Browse connectors > Figma > Connect (labels found in the code)
- **Needs:** an outside account (Figma) and a Figma file link
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Click Figma, then Connect, and sign in to Figma.
  3. Start a new chat and paste a Figma file link, then type: describe the frames and components in this file.
  4. Compare with Expected: the chat lists the frames, components and file metadata.

## S56.35 Design-to-code references.

- **Expected:** The assistant can pull design-to-code references (code context, dev resources) from a connected design file.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Add > Browse connectors > Figma > Connect (labels found in the code)
- **Needs:** an outside account (Figma) and a Figma frame link
- **Steps:**
  1. Connect Figma as in S56.34.
  2. Start a new chat, paste a Figma link to a frame, then type: give me the code context for this frame.
  3. Compare with Expected: the chat returns code references or dev resources for the frame.

## S56.36 Database querying.

- **Expected:** The assistant can run queries against a connected database.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/first-party.json:571; apps/web/lib/connectors/directory/sources/first-party.json:583
- **Where to find it:** Settings > Connectors > Add > Browse connectors > Neon > Connect (labels found in the code)
- **Needs:** an outside account (Neon) with a project
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Click Neon, then Connect, and sign in to Neon.
  3. Start a new chat and type: list my Neon projects, then run SELECT 1 on one of them.
  4. Compare with Expected: the chat lists the projects and shows the query result.

## S56.37 Warehouse analysis.

- **Expected:** The assistant can analyze data in a connected data warehouse.
- **Code:** partial. Evidence present: apps/web/lib/connectors/account-url-connectors.ts:12
- **Known to be unfinished:** live-check with the owner's warehouse accounts: add a Snowflake connector by account URL (OAuth client or PAT) and a Databricks one; sign-in completes and a query tool runs
- **Where to find it:** Settings > Connectors > Add > Add custom connector (labels found in the code)
- **Needs:** a Snowflake or Databricks account and its MCP server URL
- **Steps:**
  1. Open Settings, click Connectors, then click Add.
  2. Click Add custom connector.
  3. Enter your Snowflake MCP server URL in the form, in the format https://<account>.snowflakecomputing.com/api/v2/databases/<database>/schemas/<schema>/mcp-servers/<server>, then sign in.
  4. Start a new chat and type: run a query on my warehouse for last month's total sales.
  5. Compare with Expected: the chat returns the query result from the warehouse.

## S56.38 Dashboard creation.

- **Expected:** The assistant can create a dashboard in a connected analytics/BI tool.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched for Looker, Tableau, Metabase, Power BI and similar names in apps/web/lib/connectors, apps/web/features/connectors and packages/ui/ui/src/settings-modal: no dashboard tool connector found.
- **Needs:** an outside account (BI or analytics tool)

## S56.39 Deployment management.

- **Expected:** The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ToolTimeline.tsx:286; packages/ui/ui/src/settings-modal/SettingsModal.tsx:2250; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/user-connector-tools.ts:2536; apps/web/lib/connectors/catalog.ts:219; apps/web/lib/connectors/directory/sources/first-party.json:386; apps/web/lib/connectors/directory/sources/first-party.json:391; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Add > Browse connectors > Vercel > Connect (labels found in the code)
- **Needs:** an outside account (Vercel) with a project
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Click Vercel, then Connect, and sign in to Vercel.
  3. Start a new chat and type: list my latest Vercel deployments and show the status of each.
  4. Compare with Expected: the chat lists deployments with their status and can show one deployment's details.

## S56.40 Licensed research retrieval.

- **Expected:** The assistant can retrieve content from licensed research sources through a connected account.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched for JSTOR, PubMed, Lexis and Westlaw in apps/web/lib/connectors and apps/web/features/connectors. PubMed appears only in apps/web/lib/connectors/directory/display-name.ts and categorize.ts, which is not a licensed source. No licensed research connector found.
- **Needs:** an outside account (licensed research source)

## S56.41 Shopping/product lookup.

- **Expected:** The assistant can look up products and prices through a connected shopping service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched for Shopify, Amazon, Instacart, Spotify and OpenTable. Shopify is listed (apps/web/lib/connectors/catalog.ts) as a store service, not a product price lookup. No price-lookup connector found.
- **Needs:** an outside shopping account

## S56.42 Reservations and bookings.

- **Expected:** The assistant can search for and make reservations or bookings through a connected service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched for booking, OpenTable and Resy. Only meeting-booking text in apps/web/features/connectors/data/connectors.ts (Calendly-style) was found, which is not reservations. No reservation connector found.
- **Needs:** an outside booking account

## S56.43 Media playback.

- **Expected:** The assistant can control media playback (play, pause, queue) in a connected media service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. Searched for Spotify, Apple Music and media playback names in the connector code. No media connector found.
- **Needs:** an outside media account

## S56.46 Health-record connections.

- **Expected:** The assistant can read the user's health records through a connected provider account.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:234 (quoted code not found in the file now)
- **Known to be unfinished:** owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off
- **Where to find it:** Settings > Connectors > Add > Browse connectors > HealthEx (beta) (labels found in the code)
- **Needs:** an outside health provider account in the United States
- **Steps:**
  1. Open Settings, click Connectors, click Add, then click Browse connectors.
  2. Look for HealthEx (beta) in the list and open it.
  3. Compare with Expected: the entry should show a read-only health records connection, if it is shown at all.

## S56.47 Financial-account connections.

- **Expected:** The assistant can read balances and transactions from a connected financial account.
- **Code:** partial. Evidence present: apps/web/lib/connectors/bank-accounts.ts:396; apps/web/lib/connectors/bank-accounts.ts:414; apps/web/features/finance/components/LinkedBanks.tsx:31; apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx:17; apps/web/lib/connectors/bank-accounts.ts:226
- **Known to be unfinished:** code complete (partials/mobile-features deeb0742ae): Hosted Link from the phone, several banks per account (migration 0349_bank_account_items), per-bank removal and per-account include switches on web and mobile, Hosted Link ownership hardening. Left: owner Plaid steps (agreement, production transactions, compliance, PLAID_CLIENT_ID/SECRET/ENV), migration apply, device check of the auth session
- **Where to find it:** Finances (address /chat/finance) > Connect a bank account (labels found in the code)
- **Needs:** a US bank account; the ledger says Plaid production steps are still open
- **Steps:**
  1. Type /chat/finance in the browser address bar, since no sidebar entry for Finances was found.
  2. Click Connect a bank account. It opens Settings > Connectors.
  3. Connect a US bank through the Plaid window and finish the sign-in.
  4. Look at Linked banks: the bank name appears with a Remove bank button. Compare balances and transactions with Expected.
