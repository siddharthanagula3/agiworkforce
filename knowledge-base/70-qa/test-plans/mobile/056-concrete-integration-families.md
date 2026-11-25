---
id: "PLAN-mobile-056"
type: "test-plan"
title: "Mobile · 56. Concrete integration families"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "56"
---
# Mobile · 56. Concrete integration families

44 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S56.01 Email search.

- **Expected:** With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the phone uses the same server connector path and in-app OAuth return as web
- **Where to find it:** Settings > Cloud > Connectors > Gmail > Connect, then Add to chat > Connectors (turn Gmail on) in a new chat (labels found in the code)
- **Needs:** a Google account; a cloud account that can use connectors
- **Steps:**
  1. Open Settings, tap the Cloud group, then tap Connectors.
  2. Tap Gmail, then tap Connect and finish the Google sign-in.
  3. Open a new chat, tap Add to chat, tap Connectors and turn Gmail on.
  4. Type: Find emails from [a sender you know] about [a subject you know].
  5. Compare: the reply lists matching messages from that mailbox, as Expected says.

## S56.02 Email reading.

- **Expected:** The assistant can open and read the full content of a specific email or thread from a connected mailbox.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the phone uses the same server connector path and in-app OAuth return as web
- **Where to find it:** Settings > Cloud > Connectors > Gmail > Connect, then Add to chat > Connectors (turn Gmail on) in a new chat (labels found in the code)
- **Needs:** a Google account; a cloud account that can use connectors
- **Steps:**
  1. Connect Gmail as in S56.01 (Settings, Cloud, Connectors, Gmail, Connect).
  2. Open a new chat, tap Add to chat, tap Connectors and turn Gmail on.
  3. Type: Open the email from [a sender] about [a subject] and tell me what it says.
  4. Compare: the reply shows the full text of that email or thread, not only a summary of the subject line.

## S56.03 Email drafting.

- **Expected:** The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the phone uses the same server connector path and in-app OAuth return as web
- **Where to find it:** Settings > Cloud > Connectors > Gmail > Connect, then Add to chat > Connectors (turn Gmail on) in a new chat (labels found in the code)
- **Needs:** a Google account with Gmail; a cloud account that can use connectors
- **Steps:**
  1. Connect Gmail and turn it on in a new chat (as in S56.01).
  2. Type: Draft a reply to [a sender] saying [a short message].
  3. Check the reply: it says a draft was created.
  4. Open Gmail in a browser or the Gmail app and look in Drafts for the new draft, as Expected says.

## S56.04 Email sending.

- **Expected:** The assistant can send an email from the connected account, after approval.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the phone uses the same server connector path and in-app OAuth return as web
- **Where to find it:** Settings > Cloud > Connectors > Gmail > Connect, then in a chat with Gmail on, the approval card when a send is requested (labels found in the code)
- **Needs:** a Google account with Gmail; a second mailbox you control to receive the test
- **Steps:**
  1. Connect Gmail and turn it on in a new chat (as in S56.01).
  2. Type: Send the draft to [a sender you control] with the subject [test subject].
  3. Look for the approval card that asks before the send runs.
  4. Compare: nothing is sent until you approve; after approval the reply confirms the send.

## S56.05 Email attachments.

- **Expected:** The assistant can read attachments on an email and attach files when composing.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: add the Gmail entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON (gmail.compose for send_draft); the phone uses the same server connector path and in-app OAuth return as web
- **Where to find it:** not found in the code. Gmail is reachable, but I did not find an attachment tool in the Gmail directory list I read (the first eight tool names only), so the attachment behaviour is not confirmed.
- **Needs:** a Google account with Gmail; a file to attach

## S56.07 Calendar search.

- **Expected:** The assistant can search the connected calendar for events by text or date range.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own calendar tool already works
- **Where to find it:** Settings > Cloud > Connectors > Google Calendar > Connect, then Add to chat > Connectors (turn Google Calendar on) in a new chat (labels found in the code)
- **Needs:** a Google account with Calendar; a cloud account that can use connectors
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Google Calendar, tap Connect.
  2. Finish the Google sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Google Calendar on.
  4. Type: What is on my calendar on [a date] with [a word in an event title]?
  5. Compare: the reply lists the matching events for that date or text.

## S56.08 Free/busy inspection.

- **Expected:** The assistant can check free/busy time on the connected calendar to find open slots.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own calendar tool already works
- **Where to find it:** Settings > Cloud > Connectors > Google Calendar > Connect, then Add to chat > Connectors (turn Google Calendar on) in a new chat (labels found in the code)
- **Needs:** a Google account with Calendar; a cloud account that can use connectors
- **Steps:**
  1. Connect Google Calendar and turn it on in a new chat (as in S56.07).
  2. Type: When am I free tomorrow between [a start time] and [an end time] for a 30 minute call?
  3. Compare: the reply names open slots that do not overlap your existing events.
  4. Check one slot against the Google Calendar app on a computer.

## S56.09 Event creation.

- **Expected:** The assistant can create a calendar event on the connected calendar, after approval.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own calendar tool already works
- **Where to find it:** Settings > Cloud > Connectors > Google Calendar > Connect, then a chat with Google Calendar on (approval card before the event is created) (labels found in the code)
- **Needs:** a Google account with Calendar; a cloud account that can use connectors
- **Steps:**
  1. Connect Google Calendar and turn it on in a new chat (as in S56.07).
  2. Type: Create an event called [a test title] on [a date] from [start] to [end].
  3. Look for the approval card and approve it.
  4. Compare: the event appears in Google Calendar with that title and time.

## S56.10 Event editing and cancellation.

- **Expected:** The assistant can edit or cancel an existing calendar event.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own calendar tool already works
- **Where to find it:** Settings > Cloud > Connectors > Google Calendar > Connect, then a chat with Google Calendar on (labels found in the code)
- **Needs:** a Google account with Calendar and an existing test event
- **Steps:**
  1. Connect Google Calendar and turn it on in a new chat (as in S56.07).
  2. Type: Move the [test event title] event to [a new time].
  3. Then type: Cancel the [test event title] event.
  4. Approve any approval card shown.
  5. Compare: Google Calendar shows the new time, then the event is removed.

## S56.11 Meeting invitations.

- **Expected:** The assistant can send meeting invitations and respond to invitations on the connected calendar.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the Google Calendar OAuth client and add the google-calendar entry to CONNECTOR_OAUTH_PROVIDERS_JSON; the phone's own calendar tool already works
- **Where to find it:** not found in the code. Google Calendar is reachable, but I did not find an invitation or RSVP tool in the directory tool list I read (first eight names); not confirmed.
- **Needs:** a Google account with Calendar

## S56.12 Contacts and recipient lookup.

- **Expected:** The assistant can look up people in the user's address book to find a recipient's email or details.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/index.tsx:53; apps/web/lib/connectors/directory/sources/first-party.json:69
- **Where to find it:** Settings > Cloud > Connectors > Google Contacts > Connect, then Add to chat > Connectors (turn Google Contacts on) in a new chat (labels found in the code)
- **Needs:** a Google account with Contacts
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Google Contacts, tap Connect.
  2. Finish the Google sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Google Contacts on.
  4. Type: What is the email address of [a name in your contacts]?
  5. Compare: the reply gives the email address shown in your Google contacts.

## S56.13 Cloud-file search.

- **Expected:** The assistant can search files in a connected cloud drive.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:164; apps/web/lib/connectors/directory/sources/first-party.json:10; apps/web/lib/connectors/oauth-scope-allowlist.ts:43 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:462
- **Where to find it:** Settings > Cloud > Connectors > Google Drive > Connect, then Add to chat > Connectors (turn Google Drive on) in a new chat (labels found in the code)
- **Needs:** a Google account with Drive
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Google Drive, tap Connect.
  2. Finish the Google sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Google Drive on.
  4. Type: Search my Drive for files named [a word in a file name you know].
  5. Compare: the reply lists the matching files from your Drive.

## S56.14 Cloud-file download.

- **Expected:** The assistant can download/read the content of a file from a connected cloud drive.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:441; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors > Google Drive > Connect, then Add to chat > Connectors (turn Google Drive on) in a new chat (labels found in the code)
- **Needs:** a Google account with Drive and a test file
- **Steps:**
  1. Connect Google Drive and turn it on in a new chat (as in S56.13).
  2. Type: Open the file [a file name you know] and summarize its content.
  3. Compare: the reply shows the file's text or a summary of it, as Expected says.

## S56.15 Cloud-file creation.

- **Expected:** The assistant can create a new file in a connected cloud drive, after approval.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: add the Google Drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON
- **Where to find it:** Settings > Cloud > Connectors > Google Drive > Connect, then Add to chat > Connectors (turn Google Drive on) in a new chat (labels found in the code)
- **Needs:** a Google account with Drive
- **Steps:**
  1. Connect Google Drive and turn it on in a new chat (as in S56.13).
  2. Type: Create a new file called [a test name] with the text [a short line].
  3. Approve the approval card if it appears.
  4. Compare: the new file appears in your Google Drive.

## S56.16 Cloud-file editing.

- **Expected:** The assistant can modify an existing file in a connected cloud drive.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:459; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors > Google Drive > Connect, then Add to chat > Connectors (turn Google Drive on) in a new chat (labels found in the code)
- **Needs:** a Google account with Drive and a test file
- **Steps:**
  1. Connect Google Drive and turn it on in a new chat (as in S56.13).
  2. Type: Change the text in [a test file name] so that it says [new text].
  3. Approve the approval card if it appears.
  4. Compare: the file in Google Drive shows the new text.

## S56.17 Folder and sharing management.

- **Expected:** The assistant can create folders and manage sharing (links, collaborators) in a connected cloud drive.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Settings > Cloud > Connectors > Box > Connect, then Add to chat > Connectors (turn Box on) in a new chat (labels found in the code)
- **Needs:** a Box account
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Box, tap Connect.
  2. Finish the Box sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Box on.
  4. Type: Create a folder named [a test name] in [a folder you know].
  5. Compare: the folder appears in Box. Sharing settings are not confirmed by the tool list I read.

## S56.18 Document editing.

- **Expected:** The assistant can edit a word-processing document (e.g. Google Docs or Word) in a connected account.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Cloud > Connectors > Microsoft 365 > Connect, then Add to chat > Connectors (turn Microsoft 365 on) in a new chat (labels found in the code)
- **Needs:** a Microsoft account with Word
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Microsoft 365, tap Connect.
  2. Finish the Microsoft sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Microsoft 365 on.
  4. Type: In my Word document [a file name], change [a sentence] to [new text].
  5. Compare: the document in Microsoft 365 shows the new text.

## S56.19 Spreadsheet editing.

- **Expected:** The assistant can read and edit a spreadsheet in a connected account.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:174; apps/web/lib/connectors/oauth-scope-allowlist.ts:44 (quoted code not found in the file now); apps/web/lib/connectors/catalog.ts:212; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** not found in the code. I found no Google Sheets or Excel-specific entry; Microsoft 365 lists only generic Graph tools and Airtable lists no tool names. Not confirmed.
- **Needs:** a spreadsheet account

## S56.20 Presentation editing.

- **Expected:** The assistant can edit a presentation (e.g. Slides/PowerPoint) in a connected account.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:243; apps/web/lib/connectors/directory/sources/first-party.json:216; apps/web/lib/connectors/oauth-scope-allowlist.ts:164 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No Slides or PowerPoint entry found; Canva lists read_design and edit_design, which are design tools, not presentations. Not confirmed.
- **Needs:** a presentation account

## S56.21 Team-message search.

- **Expected:** The assistant can search messages in a connected team chat workspace (Slack/Teams).
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: register the Slack connector app with search:read.* scopes and add its entry; Teams stays out of scope (no verified hosted MCP server)
- **Where to find it:** Settings > Cloud > Connectors > Slack > Connect, then Add to chat > Connectors (turn Slack on) in a new chat (labels found in the code)
- **Needs:** a Slack workspace and account
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Slack, tap Connect.
  2. Finish the Slack sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Slack on.
  4. Type: Search Slack for messages about [a word you know].
  5. Compare: the reply lists matching messages from your workspace.

## S56.22 Team-message drafting and posting.

- **Expected:** The assistant can draft and post a message to a team chat channel, after approval.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. A Slack entry exists, but the directory lists no post or draft tool for it and the ledger gave no code location. Not confirmed.
- **Needs:** a Slack workspace; an outside account

## S56.23 Knowledge-base search.

- **Expected:** The assistant can search a connected knowledge base (e.g. Notion, Confluence).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:100; apps/web/lib/connectors/mcp-endpoints.ts:13; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Cloud > Connectors > Notion > Connect (or Confluence), then Add to chat > Connectors in a new chat (labels found in the code)
- **Needs:** a Notion or Confluence account
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Notion, tap Connect.
  2. Finish the Notion sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Notion on.
  4. Type: Search Notion for pages about [a topic you know].
  5. Compare: the reply lists matching pages from your Notion workspace.

## S56.24 Wiki/page editing.

- **Expected:** The assistant can create or edit wiki/knowledge-base pages in a connected workspace.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors > Notion > Connect, then Add to chat > Connectors (turn Notion on) in a new chat (labels found in the code)
- **Needs:** a Notion account with a test page
- **Steps:**
  1. Connect Notion and turn it on in a new chat (as in S56.23).
  2. Type: Create a page called [a test title] with the text [a short line].
  3. Or type: Update the page [a test title] to add [a line].
  4. Compare: the page in Notion shows the new page or change.

## S56.25 Issue and task creation.

- **Expected:** The assistant can create an issue or task in a connected tracker, after approval.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:184; apps/web/lib/connectors/directory/sources/first-party.json:142; apps/web/lib/connectors/oauth-scope-allowlist.ts:112 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:187
- **Where to find it:** Settings > Cloud > Connectors > Jira > Connect, then Add to chat > Connectors (turn Jira on) in a new chat (labels found in the code)
- **Needs:** a Jira account with a test project
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Jira, tap Connect.
  2. Finish the Atlassian sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Jira on.
  4. Type: Create a Jira issue in [a project you know] titled [a test title].
  5. Approve the approval card if it appears.
  6. Compare: the issue appears in Jira with that title.

## S56.26 Issue status updates.

- **Expected:** The assistant can update an issue's status or fields in a connected tracker.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:188; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors > Asana > Connect, then Add to chat > Connectors (turn Asana on) in a new chat (labels found in the code)
- **Needs:** an Asana account with a test task
- **Steps:**
  1. Open Settings, tap Cloud, tap Connectors, tap Asana, tap Connect.
  2. Finish the Asana sign-in, then open a new chat.
  3. Tap Add to chat, tap Connectors and turn Asana on.
  4. Type: Mark the task [a test task name] as complete.
  5. Compare: the task in Asana shows the new status.

## S56.27 Project-management boards.

- **Expected:** The assistant can view and work with project boards in a connected project-management tool.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:189; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors, then search or scroll to Asana and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (Asana)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Asana in the bottom search bar, or scroll the list, and tap Asana.
  3. Tap Connect and finish the Asana sign-in in the in-app browser.
  4. In a new chat ask: Show my Asana project boards. Compare with Expected: the assistant can view and work with the boards.

## S56.28 CRM account/contact lookup.

- **Expected:** The assistant can look up CRM accounts and contacts in a connected CRM.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:167; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors, then search or scroll to HubSpot and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (HubSpot)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type HubSpot in the search bar, tap HubSpot, then tap Connect and sign in.
  3. In a new chat ask: Find the HubSpot contact or account named [a name you choose].
  4. Compare with Expected: the assistant returns matching accounts or contacts from HubSpot.

## S56.29 CRM opportunity updates.

- **Expected:** The assistant can update CRM opportunities/deals, after approval.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:168; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors, then HubSpot (connect it first), with Action approvals on the same screen (labels found in the code)
- **Needs:** Cloud access, an outside account (HubSpot)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors, and check that HubSpot is connected.
  2. Look at the Action approvals row on the Connectors screen and read its setting.
  3. In a new chat ask the assistant to change the stage of one HubSpot deal.
  4. Compare with Expected: the assistant asks for your approval before it updates the deal.

## S56.30 Support-ticket workflows.

- **Expected:** The assistant can search, read and act on support tickets in a connected help desk.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:197; apps/web/lib/connectors/directory/sources/first-party.json:259; apps/web/lib/connectors/directory/sources/first-party.json:270; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors, then search for Intercom and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (Intercom)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Intercom in the search bar and tap Intercom, then tap Connect and sign in.
  3. In a new chat ask: Find my open support tickets.
  4. Compare with Expected: the assistant lists tickets from the help desk and can act on one when you ask.

## S56.31 Repository search.

- **Expected:** The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the GitHub App (Actions read) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID/_SECRET; GitLab has no pinned server
- **Where to find it:** Settings > Cloud > Connectors, then search for GitHub MCP and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (GitHub)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type GitHub in the search bar and tap GitHub MCP, then tap Connect.
  3. In a new chat ask: Search the code in my repository for the word [a word you choose].
  4. Compare with Expected: the assistant returns code matches from the connected repository.

## S56.32 Pull-request workflows.

- **Expected:** The assistant can read a pull request, review it and post review comments on the hosted repository.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:168; apps/web/lib/user-connector-tools.ts:303; apps/web/lib/user-connector-tools.ts:343
- **Where to find it:** Settings > Cloud > Connectors, then GitHub MCP (labels found in the code)
- **Needs:** Cloud access, an outside account (GitHub), a pull request you can review
- **Steps:**
  1. Open Settings, then Cloud, then Connectors, and connect GitHub MCP.
  2. In a new chat paste a pull request link from your GitHub repository and ask: Review this pull request.
  3. Ask the assistant to post a review comment on it.
  4. Compare with Expected: the assistant reads the pull request and can post comments on the hosted repository.

## S56.33 CI status and logs.

- **Expected:** The assistant can report CI pipeline status and show build logs from a connected CI provider.
- **Code:** partial. Evidence present: apps/web/lib/connectors/oauth-registry.ts:22
- **Known to be unfinished:** owner: create the GitHub App (Actions read) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID/_SECRET; GitLab has no pinned server
- **Where to find it:** not found in the code. No visible CI listing found in apps/web/lib/connectors/directory/sources or apps/mobile/src. CircleCI appears only as an ID in apps/web/lib/connectors/catalog.ts. The plan says CI reads depend on the unfinished GitHub App setup.
- **Needs:** Cloud access, an outside account (a CI provider)

## S56.34 Design-file inspection.

- **Expected:** The assistant can inspect a design file (frames, components, metadata) from a connected design tool.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/directory/sources/first-party.json:123; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Connectors, then search for Figma and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (Figma), a Figma file link
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Figma in the search bar, tap Figma, then tap Connect and sign in.
  3. In a new chat ask: Describe the frames and components in my Figma file [paste its link].
  4. Compare with Expected: the assistant names the frames, components and file details it finds.

## S56.35 Design-to-code references.

- **Expected:** The assistant can pull design-to-code references (code context, dev resources) from a connected design file.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors, then Figma (connect it first) (labels found in the code)
- **Needs:** Cloud access, an outside account (Figma), a Figma file link
- **Steps:**
  1. Open Settings, then Cloud, then Connectors, and confirm Figma is connected.
  2. In a new chat paste a Figma file link and ask: Give me the code references and dev resources for this file.
  3. Compare with Expected: the assistant returns code context and dev resource details from that file.

## S56.36 Database querying.

- **Expected:** The assistant can run queries against a connected database.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/index.tsx:53; apps/web/lib/connectors/directory/sources/first-party.json:568
- **Where to find it:** Settings > Cloud > Connectors, then Neon or Supabase (labels found in the code)
- **Needs:** Cloud access, an outside account (Neon)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Neon in the search bar, tap Neon, then tap Connect and sign in.
  3. In a new chat ask: List the tables in my Neon database.
  4. Compare with Expected: the assistant lists tables and can run a query you approve.

## S56.38 Dashboard creation.

- **Expected:** The assistant can create a dashboard in a connected analytics/BI tool.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** Settings > Cloud > Connectors, then search for Metabase and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (Metabase)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Metabase in the search bar, tap Metabase, then tap Connect and sign in.
  3. In a new chat ask: Create a dashboard in Metabase for my sales table.
  4. Compare with Expected: the assistant creates a dashboard in Metabase.

## S56.39 Deployment management.

- **Expected:** The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:249; apps/mobile/services/streaming.ts:402; apps/mobile/services/streaming.ts:334; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:219; apps/web/lib/connectors/directory/sources/first-party.json:386; apps/web/lib/connectors/directory/sources/first-party.json:391; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Cloud > Connectors, then Vercel (labels found in the code)
- **Needs:** Cloud access, an outside account (Vercel)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Vercel in the search bar, tap Vercel, then tap Connect and sign in.
  3. In a new chat ask: List my latest Vercel deployments.
  4. Compare with Expected: the assistant lists deployments and can inspect or deploy one when you ask.

## S56.40 Licensed research retrieval.

- **Expected:** The assistant can retrieve content from licensed research sources through a connected account.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. No licensed research listing found. Searched the connector directory and apps/mobile/src for JSTOR and Semantic Scholar; only PubMed appears in descriptive text in apps/web/lib/connectors/directory/sources/vendor-directory.json.
- **Needs:** Cloud access, an outside account (a research service)

## S56.41 Shopping/product lookup.

- **Expected:** The assistant can look up products and prices through a connected shopping service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** Settings > Cloud > Connectors, then search for Instacart and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (Instacart)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Instacart in the search bar, tap Instacart, then tap Connect and sign in.
  3. In a new chat ask: Find the price of [a product you choose] through Instacart.
  4. Compare with Expected: the assistant returns a product and price from the connected service.

## S56.42 Reservations and bookings.

- **Expected:** The assistant can search for and make reservations or bookings through a connected service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** Settings > Cloud > Connectors, then search for Resy and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (Resy)
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type Resy in the search bar, tap Resy, then tap Connect and sign in.
  3. In a new chat ask: Find a table for two tonight through Resy.
  4. Compare with Expected: the assistant searches availability and asks you to confirm before it books.

## S56.43 Media playback.

- **Expected:** The assistant can control media playback (play, pause, queue) in a connected media service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. No media playback listing found. Searched apps/web/lib and apps/mobile/src for Spotify and Apple Music with no connector match.
- **Needs:** Cloud access, an outside account (a media service)

## S56.45 Local notes and calendars.

- **Expected:** The assistant can read and add to the notes and calendars stored on the user's own device.
- **Code:** done. Evidence present: apps/mobile/src/features/integrations/services/phoneDeviceSteps.ts:259; apps/mobile/stores/chat/chatExecutionStore.ts:770
- **Where to find it:** Settings > Device > Device Integrations (labels found in the code)
- **Needs:** A phone with calendar access granted, phone width
- **Steps:**
  1. Open Settings, then the Device group, then Device Integrations.
  2. Read the Apple Calendar row and its status (Active, Inactive, Needs Permission or Unavailable).
  3. In a chat ask: What is on my calendar today?
  4. Compare with Expected: the assistant reads events from the calendar on this phone. Ask it to add a reminder and check it appears in the Reminders app.

## S56.46 Health-record connections.

- **Expected:** The assistant can read the user's health records through a connected provider account.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-connectors/index.tsx:53; apps/web/lib/connectors/directory/sources/vendor-directory.json:3423
- **Where to find it:** Settings > Cloud > Connectors, then search for HealthEx (beta) and tap it (labels found in the code)
- **Needs:** Cloud access, an outside account (HealthEx and a healthcare portal login), ID and biometrics for the identity check
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Type HealthEx in the search bar, tap HealthEx (beta), then tap Connect.
  3. Complete the identity check and connect your healthcare portal logins as the connector asks.
  4. In a new chat ask: Summarize my latest lab results. Compare with Expected: the assistant reads your records from the connected provider.

## S56.47 Financial-account connections.

- **Expected:** The assistant can read balances and transactions from a connected financial account.
- **Code:** partial. Evidence present: apps/web/lib/connectors/bank-accounts.ts:396; apps/web/lib/connectors/bank-accounts.ts:414; apps/web/features/finance/components/LinkedBanks.tsx:31; apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx:17; apps/web/lib/connectors/bank-accounts.ts:226
- **Known to be unfinished:** code complete (partials/mobile-features deeb0742ae): Hosted Link from the phone, several banks per account (migration 0349_bank_account_items), per-bank removal and per-account include switches on web and mobile, Hosted Link ownership hardening. Left: owner Plaid steps (agreement, production transactions, compliance, PLAID_CLIENT_ID/SECRET/ENV), migration apply, device check of the auth session
- **Where to find it:** Settings > Cloud > Connectors, then Link a bank account (labels found in the code)
- **Needs:** Cloud access, a US bank with online login, a Plaid-supported bank
- **Steps:**
  1. Open Settings, then Cloud, then Connectors (Cloud access needed).
  2. Tap Link a bank account and complete the Plaid link with your bank login.
  3. Check the Linked banks section: each account shows a switch to include or exclude it.
  4. Compare with Expected: balances and transactions from the linked account appear to the assistant when you ask for them.
