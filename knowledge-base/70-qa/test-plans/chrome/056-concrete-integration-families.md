---
id: "PLAN-chrome-056"
type: "test-plan"
title: "Chrome · 56. Concrete integration families"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "56"
---
# Chrome · 56. Concrete integration families

44 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S56.01 Email search.

- **Expected:** With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:162; apps/web/lib/connectors/directory/sources/first-party.json:31; apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Gmail.
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Gmail card and approve the Google sign-in.
  3. Open the Chrome side panel and ask it to find emails from a named sender or about a subject.
  4. Check that matching messages are listed, as Expected says.

## S56.02 Email reading.

- **Expected:** The assistant can open and read the full content of a specific email or thread from a connected mailbox.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:162; apps/web/lib/connectors/directory/sources/first-party.json:32; apps/web/lib/connectors/oauth-scope-allowlist.ts:41 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Gmail.
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Gmail under Settings, then Connectors, as in S56.01.
  2. In the side panel, ask for the full content of one named email or thread.
  3. Check that the full body of that email is shown, as Expected says.

## S56.03 Email drafting.

- **Expected:** The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Known to be unfinished:** gmail.compose is now in the Gmail ceiling (7759c304c), so create_draft works once the owner adds the gmail CONNECTOR_OAUTH_PROVIDERS_JSON descriptor and client pair. Chrome chats use the same connectors through the account once connected in the web app, show each call as a step, and a send asks with its recipients named.
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Gmail under Settings, then Connectors.
  2. In the side panel, ask for a draft reply to a named email, or a new draft to a named address.
  3. Check the step shown for the draft call, then look for the draft in Gmail Drafts in the browser.

## S56.04 Email sending.

- **Expected:** The assistant can send an email from the connected account, after approval.
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Known to be unfinished:** 0bdcfd2f3 adds send_draft, a non-reversible external send that asks under every policy; it runs once the owner adds the gmail CONNECTOR_OAUTH_PROVIDERS_JSON descriptor and client pair with gmail.compose. Chrome chats use the same connectors through the account once connected in the web app, show each call as a step, and a send asks with its recipients named.
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Gmail under Settings, then Connectors.
  2. In the side panel, ask to send a drafted email to a named recipient.
  3. Check that a confirmation names the recipients before anything is sent, then confirm and check the reply.

## S56.05 Email attachments.

- **Expected:** The assistant can read attachments on an email and attach files when composing.
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Known to be unfinished:** read_attachments and create_draft_with_attachments (0bdcfd2f3, b1a59f084) run once the owner adds the gmail descriptor and client pair. Chrome chats use the same connectors through the account once connected in the web app, show each call as a step, and a send asks with its recipients named.
- **Where to find it:** Settings > Connectors > Gmail > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google) and a file to attach
- **Steps:**
  1. Connect Gmail under Settings, then Connectors.
  2. In the side panel, ask it to read the attachments of a named email.
  3. Then ask for a draft with a file attached and check the draft step in Gmail Drafts.

## S56.07 Calendar search.

- **Expected:** The assistant can search the connected calendar for events by text or date range.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:163; apps/web/lib/connectors/directory/sources/first-party.json:57; apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Calendar.
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Google Calendar card and approve the Google sign-in.
  3. In the side panel, ask for events on a named date or containing a word.
  4. Check that matching events are listed, as Expected says.

## S56.08 Free/busy inspection.

- **Expected:** The assistant can check free/busy time on the connected calendar to find open slots.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:163; apps/web/lib/connectors/directory/sources/first-party.json:58; apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Calendar.
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Calendar under Settings, then Connectors.
  2. In the side panel, ask when a named person or you are free on a named day.
  3. Check that the reply lists open slots, as Expected says.

## S56.09 Event creation.

- **Expected:** The assistant can create a calendar event on the connected calendar, after approval.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:163; apps/web/lib/connectors/directory/sources/first-party.json:59; apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Calendar.
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Calendar under Settings, then Connectors.
  2. In the side panel, ask it to create an event with a title, a time and a length.
  3. Check the confirmation that appears before the event is created, approve it, then open Google Calendar in the browser to see the event.

## S56.10 Event editing and cancellation.

- **Expected:** The assistant can edit or cancel an existing calendar event.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:163; apps/web/lib/connectors/directory/sources/first-party.json:60; apps/web/lib/connectors/directory/sources/first-party.json:61; apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Calendar.
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google) and an existing event
- **Steps:**
  1. Connect Google Calendar under Settings, then Connectors.
  2. In the side panel, ask to move or cancel a named existing event.
  3. Check the approval step, approve it, then check the event in Google Calendar in the browser.

## S56.11 Meeting invitations.

- **Expected:** The assistant can send meeting invitations and respond to invitations on the connected calendar.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:163; apps/web/lib/connectors/directory/sources/first-party.json:59; apps/web/lib/connectors/directory/sources/first-party.json:62; apps/web/lib/connectors/oauth-scope-allowlist.ts:42 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Calendar.
- **Where to find it:** Settings > Connectors > Google Calendar > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Calendar under Settings, then Connectors.
  2. In the side panel, ask it to invite a named person to a meeting, or to accept an invitation.
  3. Check the approval step names the invitee, approve it, then check the invitation in Google Calendar.

## S56.12 Contacts and recipient lookup.

- **Expected:** The assistant can look up people in the user's address book to find a recipient's email or details.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/catalog.ts:156 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:72; apps/web/lib/connectors/oauth-scope-allowlist.ts:46 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:746
- **Known to be unfinished:** partials/mcp-web 4ce42bb0b: Google Contacts connects read-only to Google's People API MCP server (https://people.googleapis.com/mcp/v1, Developer Preview, page updated 2026-09-18) with contacts.readonly and directory.readonly, and its search_contacts, search_directory_people and get_user_profile tools are declared reads. It turns on when the owner enables the People API and People MCP API in the Google Cloud project and adds the google-contacts CONNECTOR_OAUTH_PROVIDERS_JSON descriptor with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET. Extension chats read it through the same account once it is connected in the web app.
- **Where to find it:** Settings > Connectors > Google Contacts > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Google Contacts card and approve the Google sign-in.
  3. In the side panel, ask for the email address of a named person in your contacts.
  4. Check that the matching contact and address are shown, as Expected says.

## S56.13 Cloud-file search.

- **Expected:** The assistant can search files in a connected cloud drive.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:164; apps/web/lib/connectors/directory/sources/first-party.json:10; apps/web/lib/connectors/oauth-scope-allowlist.ts:43 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:462
- **Where to find it:** Settings > Connectors > Google Drive > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Google Drive card and approve the Google sign-in.
  3. In the side panel, ask it to find files whose name contains a word.
  4. Check that matching files are listed, as Expected says.

## S56.14 Cloud-file download.

- **Expected:** The assistant can download/read the content of a file from a connected cloud drive.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:441; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Box > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Box)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Box card and approve the Box sign-in.
  3. In the side panel, ask it to read the content of a named file in Box.
  4. Check that the file text appears in the reply, as Expected says.

## S56.15 Cloud-file creation.

- **Expected:** The assistant can create a new file in a connected cloud drive, after approval.
- **Code:** partial. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:164; apps/web/lib/connectors/directory/sources/first-party.json:16; apps/web/lib/connectors/oauth-scope-allowlist.ts:43 (quoted code not found in the file now)
- **Known to be unfinished:** Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Drive.
- **Where to find it:** Settings > Connectors > Google Drive > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Google)
- **Steps:**
  1. Connect Google Drive under Settings, then Connectors.
  2. In the side panel, ask it to create a new file with a name and some text.
  3. Approve the step when it asks, then open Google Drive in the browser and look for the new file.

## S56.16 Cloud-file editing.

- **Expected:** The assistant can modify an existing file in a connected cloud drive.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:255; apps/web/lib/connectors/directory/sources/first-party.json:459; apps/web/lib/connectors/oauth-scope-allowlist.ts:189 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Box > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Box) and a test file
- **Steps:**
  1. Connect Box under Settings, then Connectors.
  2. In the side panel, ask it to change the text of a named file in Box.
  3. Approve the step, then open the file in Box in the browser and check the change.

## S56.17 Folder and sharing management.

- **Expected:** The assistant can create folders and manage sharing (links, collaborators) in a connected cloud drive.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Where to find it:** Settings > Connectors > Box > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Box)
- **Steps:**
  1. Connect Box under Settings, then Connectors.
  2. In the side panel, ask it to create a new folder with a name.
  3. Check the step shown, then look for the folder in Box in the browser.
  4. Sharing (links, collaborators) has no tool found in the directory entry; check the reply says so if asked.

## S56.18 Document editing.

- **Expected:** The assistant can edit a word-processing document (e.g. Google Docs or Word) in a connected account.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Connectors > Notion > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Notion)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Notion card and approve the sign-in.
  3. In the side panel, ask it to change the text of a named Notion page.
  4. Check the step shown, then open the page in Notion in the browser and compare.

## S56.19 Spreadsheet editing.

- **Expected:** The assistant can read and edit a spreadsheet in a connected account.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:174; apps/web/lib/connectors/oauth-scope-allowlist.ts:44 (quoted code not found in the file now); apps/web/lib/connectors/catalog.ts:212; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors, then find the Google Sheets card and click Connect (labels found in the code)
- **Needs:** an outside account (Google) and a test spreadsheet
- **Steps:**
  1. Open Settings, then Connectors.
  2. Look for the Google Sheets card and click Connect; approve the Google sign-in.
  3. In the side panel, ask it to read a named range of a sheet, then to change one cell.
  4. Check the reply and the change in Google Sheets in the browser.

## S56.20 Presentation editing.

- **Expected:** The assistant can edit a presentation (e.g. Slides/PowerPoint) in a connected account.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:243; apps/web/lib/connectors/directory/sources/first-party.json:216; apps/web/lib/connectors/oauth-scope-allowlist.ts:164 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors > Canva > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Canva)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Canva card and approve the sign-in.
  3. In the side panel, ask it to list or change the text of a named Canva design.
  4. Check the step shown, then open the design in Canva in the browser.

## S56.21 Team-message search.

- **Expected:** The assistant can search messages in a connected team chat workspace (Slack/Teams).
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Known to be unfinished:** Slack's search:read scopes are admitted (693fe31f9); the owner must register the Slack app with them and add its descriptor; Teams has no Microsoft-hosted MCP server that could be verified. Chrome chats use the same connectors through the account once connected in the web app, show each call as a step, and a send asks with its recipients named.
- **Where to find it:** Settings > Connectors > Slack > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Slack)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Slack card and approve the Slack sign-in.
  3. In the side panel, ask for messages that contain a word in a named channel.
  4. Check that matching Slack messages are listed, as Expected says.

## S56.22 Team-message drafting and posting.

- **Expected:** The assistant can draft and post a message to a team chat channel, after approval.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The ledger gives no code location. One search of apps/web/lib/connectors, apps/web/lib/user-connector-tools.ts and apps/extension/src for a post-to-channel tool found none.
- **Needs:** an external service (team chat)

## S56.23 Knowledge-base search.

- **Expected:** The assistant can search a connected knowledge base (e.g. Notion, Confluence).
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:100; apps/web/lib/connectors/mcp-endpoints.ts:13; apps/web/lib/connectors/directory/sources/first-party.json:154
- **Where to find it:** Settings > Connectors > Notion > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Notion)
- **Steps:**
  1. Connect Notion under Settings, then Connectors.
  2. In the side panel, ask it to search Notion for a named topic.
  3. Check that matching Notion pages are listed, as Expected says.

## S56.24 Wiki/page editing.

- **Expected:** The assistant can create or edit wiki/knowledge-base pages in a connected workspace.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:166; apps/web/lib/connectors/directory/sources/first-party.json:104; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Notion > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Notion)
- **Steps:**
  1. Connect Notion under Settings, then Connectors.
  2. In the side panel, ask it to create a new page with a title and text in a named place.
  3. Check the step shown, then open the new page in Notion in the browser.

## S56.25 Issue and task creation.

- **Expected:** The assistant can create an issue or task in a connected tracker, after approval.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:184; apps/web/lib/connectors/directory/sources/first-party.json:142; apps/web/lib/connectors/oauth-scope-allowlist.ts:112 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/first-party.json:187
- **Where to find it:** Settings > Connectors > Jira > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Jira)
- **Steps:**
  1. Open Settings, then Connectors.
  2. Click Connect on the Jira card and approve the Atlassian sign-in.
  3. In the side panel, ask it to create an issue with a title in a named project; approve when asked.
  4. Check the new issue in Jira in the browser.

## S56.26 Issue status updates.

- **Expected:** The assistant can update an issue's status or fields in a connected tracker.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:188; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Settings > Connectors > Linear > Connect, then ask in the side panel chat (labels found in the code)
- **Needs:** an outside account (Linear)
- **Steps:**
  1. Connect Linear under Settings, then Connectors.
  2. In the side panel, ask it to change the status of a named issue to a named state.
  3. Check the step shown, then look at the issue status in Linear in the browser.

## S56.27 Project-management boards.

- **Expected:** The assistant can view and work with project boards in a connected project-management tool.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:192; apps/web/lib/connectors/directory/sources/first-party.json:189; apps/web/lib/connectors/oauth-scope-allowlist.ts:120 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Chrome side panel > plus menu > Connectors (opens the web Connectors page) > Asana > Connect (labels found in the code)
- **Needs:** an outside account (Asana) and the connector enabled by the owner
- **Steps:**
  1. Open the AGI Chrome side panel and click the plus button, then click Connectors.
  2. On the Connectors page, find the Asana card and click Connect.
  3. Sign in to Asana in the window that opens and approve access.
  4. Back in the side panel, ask: show the boards in my Asana project.
  5. Compare the reply with Expected: it should list the project boards from the connected Asana account, shown as steps.

## S56.28 CRM account/contact lookup.

- **Expected:** The assistant can look up CRM accounts and contacts in a connected CRM.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:167; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Chrome side panel > plus menu > Connectors > HubSpot > Connect (labels found in the code)
- **Needs:** an outside account (HubSpot)
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Find the HubSpot card and click Connect.
  3. Sign in to HubSpot and approve access.
  4. In the side panel, ask: find the HubSpot contact for a named person.
  5. Compare with Expected: the reply should show the account or contact details from HubSpot.

## S56.29 CRM opportunity updates.

- **Expected:** The assistant can update CRM opportunities/deals, after approval.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:194; apps/web/lib/connectors/directory/sources/first-party.json:168; apps/web/lib/connectors/oauth-scope-allowlist.ts:139 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Chrome side panel > plus menu > Connectors > HubSpot > Connect (labels found in the code)
- **Needs:** a paid account and an outside account (HubSpot)
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Connect the HubSpot card and sign in.
  3. In the side panel, ask the assistant to move a named deal to a new stage.
  4. Expect a confirmation step that names the deal before anything changes; approve or cancel it.
  5. Compare with Expected: the deal should change only after approval.

## S56.30 Support-ticket workflows.

- **Expected:** The assistant can search, read and act on support tickets in a connected help desk.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:197; apps/web/lib/connectors/directory/sources/first-party.json:259; apps/web/lib/connectors/directory/sources/first-party.json:270; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Chrome side panel > plus menu > Connectors > Intercom > Connect (labels found in the code)
- **Needs:** an outside account (Intercom)
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Find the Intercom card and click Connect.
  3. Sign in to Intercom and approve access.
  4. In the side panel, ask: find open support tickets about billing.
  5. Compare with Expected: the reply should list matching tickets from Intercom.

## S56.31 Repository search.

- **Expected:** The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Known to be unfinished:** GitHub hosted MCP (search_code) is pinned as github-mcp and connects once the owner adds its descriptor and CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID/_CLIENT_SECRET; GitLab has no pinned server. Chrome chats use the same connectors through the account once connected in the web app, show each call as a step, and a send asks with its recipients named.
- **Where to find it:** not found in the code. The github connector key exists in apps/web/lib/connectors/catalog.ts, but no visible card name for GitHub was found in apps/web/lib/connectors/directory/sources/first-party.json, so the exact path was not confirmed. The plan says the hosted GitHub server connects only after the owner adds its descriptor.
- **Needs:** a GitHub account and the owner's GitHub connector setup
- **Steps:**
  1. Open the Connectors page from the side panel plus menu.
  2. Look for a GitHub card and click Connect.
  3. In the side panel, ask: search this repository for the function named X.
  4. Compare with Expected: matching code results should be shown.

## S56.32 Pull-request workflows.

- **Expected:** The assistant can read a pull request, review it and post review comments on the hosted repository.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:168; apps/web/lib/user-connector-tools.ts:303; apps/web/lib/user-connector-tools.ts:343
- **Where to find it:** not found in the code. Code shows github and user-connector-tools tools for pull requests (apps/web/lib/user-connector-tools.ts:303, 343), but no visible GitHub card name was found in the directory sources to cite.
- **Needs:** a GitHub account with a repository
- **Steps:**
  1. Open the Connectors page from the side panel plus menu.
  2. Connect GitHub if a card is shown for it.
  3. In the side panel, ask the assistant to read and review a named pull request.
  4. Compare with Expected: the reply should show the PR content, and any review comment should be sent only after approval.

## S56.33 CI status and logs.

- **Expected:** The assistant can report CI pipeline status and show build logs from a connected CI provider.
- **Code:** partial. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/extension/src/features/side-panel/bubbles.ts:1062
- **Known to be unfinished:** The github-mcp descriptor with the actions toolset (list_workflow_runs, get_job_logs) works once the owner adds it, a GitHub App with Actions read, and CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID/_CLIENT_SECRET. Chrome chats use the same connectors through the account once connected in the web app, show each call as a step, and a send asks with its recipients named.
- **Where to find it:** not found in the code. The plan says the GitHub Actions toolset works only after the owner adds the GitHub descriptor and client; no visible card name was found in code.
- **Needs:** a connected CI account and repository
- **Steps:**
  1. Open the Connectors page from the side panel plus menu.
  2. Connect the CI provider if a card is shown for it.
  3. In the side panel, ask: what is the status of the latest workflow run on this repository?
  4. Compare with Expected: the status and, when asked, the build log should be shown.

## S56.34 Design-file inspection.

- **Expected:** The assistant can inspect a design file (frames, components, metadata) from a connected design tool.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/directory/sources/first-party.json:123; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now)
- **Where to find it:** Chrome side panel > plus menu > Connectors > Figma > Connect (labels found in the code)
- **Needs:** an outside account (Figma)
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Find the Figma card and click Connect.
  3. Sign in to Figma and approve access.
  4. In the side panel, ask: list the frames in a named Figma file.
  5. Compare with Expected: the frames and components of the file should be listed.

## S56.35 Design-to-code references.

- **Expected:** The assistant can pull design-to-code references (code context, dev resources) from a connected design file.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:242; apps/web/lib/connectors/directory/sources/first-party.json:121; apps/web/lib/connectors/oauth-scope-allowlist.ts:157 (quoted code not found in the file now); apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Chrome side panel > plus menu > Connectors > Figma > Connect (labels found in the code)
- **Needs:** an outside account (Figma) and a Figma file with a component
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Connect the Figma card and sign in.
  3. In the side panel, ask: give me the code references for the selected component in a named Figma file.
  4. Compare with Expected: code context and dev resources should be listed.

## S56.36 Database querying.

- **Expected:** The assistant can run queries against a connected database.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/first-party.json:571; apps/web/lib/connectors/directory/sources/first-party.json:583
- **Where to find it:** Chrome side panel > plus menu > Connectors > Neon > Connect (labels found in the code)
- **Needs:** a connected Neon database
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Find the Neon card and click Connect.
  3. Enter or approve the database access the card asks for.
  4. In the side panel, ask: how many rows are in a named table?
  5. Compare with Expected: the query result from the connected database should be shown.

## S56.37 Warehouse analysis.

- **Expected:** The assistant can analyze data in a connected data warehouse.
- **Code:** partial. Evidence present: apps/web/lib/connectors/account-url-connectors.ts:12; apps/web/lib/connectors/account-url-connectors.ts:21; apps/web/app/api/connectors/route.ts:658; apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:795; packages/ui/ui/src/settings-modal/SettingsModal.tsx:551; apps/web/lib/connectors/custom-connector-creation.ts:75
- **Known to be unfinished:** partials/mcp-web 2e08cf2e6: Snowflake and Databricks are added by account URL, as custom connectors are in Claude (support.claude.com/en/articles/11175166, 2026-09-28): the cards open the custom connector form with the vendor's MCP URL format, documentation link and OAuth client fields, and a URL on either vendor's host must use that vendor's MCP path (docs.snowflake.com cortex-agents-mcp GA; docs.databricks.com managed-mcp Public Preview, updated 2026-09-21). Neither vendor supports dynamic client registration, so the user brings an OAuth client or a personal access token. Still owed: a run against a real Snowflake and Databricks account, since neither page says whether the server publishes the MCP authorization metadata the OAuth sign-in needs. BigQuery stays unpinned by decision.
- **Where to find it:** Connectors page (open from the Chrome side panel plus menu > Connectors) > add Snowflake or Databricks by account URL (labels found in the code)
- **Needs:** a Snowflake or Databricks account and an OAuth client or access token
- **Steps:**
  1. Open the Connectors page from the side panel plus menu.
  2. Click the Snowflake card, which opens the custom connector form.
  3. Enter the account MCP URL and OAuth client or access token the form asks for, then save.
  4. In the side panel, ask a question about a table in the warehouse.
  5. Compare with Expected: the answer should be drawn from the warehouse data.

## S56.38 Dashboard creation.

- **Expected:** The assistant can create a dashboard in a connected analytics/BI tool.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The plan gives no code location for dashboard creation and no visible card was searched for.
- **Needs:** an external analytics or BI account

## S56.39 Deployment management.

- **Expected:** The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:844; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/catalog.ts:219; apps/web/lib/connectors/directory/sources/first-party.json:386; apps/web/lib/connectors/directory/sources/first-party.json:391; apps/web/lib/connectors/mcp-endpoints.ts:13
- **Where to find it:** Chrome side panel > plus menu > Connectors > Vercel > Connect (labels found in the code)
- **Needs:** an outside account (Vercel)
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Find the Vercel card and click Connect.
  3. Sign in to Vercel and approve access.
  4. In the side panel, ask: list the recent deployments of a named project.
  5. Compare with Expected: the deployments and their status should be listed.

## S56.40 Licensed research retrieval.

- **Expected:** The assistant can retrieve content from licensed research sources through a connected account.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The plan gives no code location for licensed research retrieval; not searched further.
- **Needs:** a licensed research account

## S56.41 Shopping/product lookup.

- **Expected:** The assistant can look up products and prices through a connected shopping service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The plan gives no code location for shopping or product lookup; not searched further.
- **Needs:** an outside shopping account

## S56.42 Reservations and bookings.

- **Expected:** The assistant can search for and make reservations or bookings through a connected service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The plan gives no code location for reservations and bookings; not searched further.
- **Needs:** an outside booking account

## S56.43 Media playback.

- **Expected:** The assistant can control media playback (play, pause, queue) in a connected media service.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. The plan gives no code location for media playback; not searched further.
- **Needs:** an outside media service account

## S56.46 Health-record connections.

- **Expected:** The assistant can read the user's health records through a connected provider account.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/catalog.ts:253 (quoted code not found in the file now); apps/web/lib/connectors/oauth-scope-allowlist.ts:229 (quoted code not found in the file now); apps/web/lib/connectors/sensitive-data-connectors.ts:35; apps/web/lib/connectors/sensitive-data-connectors.ts:54; apps/web/lib/user-connector-tools.ts:2565; apps/web/app/api/connectors/oauth/start/route.ts:243; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2535
- **Known to be unfinished:** partials/mcp-web 5ab7fcf59: health records connect through HealthEx's MCP server (https://api.healthex.io/mcp, OAuth metadata, DCR and PKCE, docs.healthex.io read 2026-09-28), as in Claude. Opt-in, only declared read tools reach the model, connecting is refused outside the United States, the sign-in window is 30 minutes, save_memory is refused for the rest of a turn that read health data, and disconnect revokes at HealthEx and erases the tokens. It stays unavailable until the owner signs HealthEx's agreement, has a lawyer confirm whether the FTC Health Breach Notification Rule applies, registers a client at https://api.healthex.io/oauth/register and adds the healthex descriptor with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID (and _CLIENT_SECRET only for a confidential client).
- **Where to find it:** Chrome side panel > plus menu > Connectors > Healthcare (category filter) > HealthEx > Connect (labels found in the code)
- **Needs:** a United States location and an outside HealthEx account
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Choose the Healthcare category on the Connectors page.
  3. Click Connect on the HealthEx card if it is shown; the card connects only from the United States.
  4. Sign in at HealthEx within 30 minutes and approve access.
  5. In the side panel, ask about a recent visit in the connected health record.
  6. Compare with Expected: the assistant should read the record only after connection and say when it cannot connect.

## S56.47 Financial-account connections.

- **Expected:** The assistant can read balances and transactions from a connected financial account.
- **Code:** partial. Evidence present: apps/web/lib/connectors/bank-accounts.ts:167; apps/web/lib/connectors/bank-accounts.ts:433; apps/web/lib/connectors/bank-accounts.ts:693; apps/web/lib/connectors/bank-accounts.ts:759; apps/web/app/api/connectors/route.ts:683; apps/web/features/connectors/lib/plaid-link.ts:135; apps/web/lib/user-connector-tools.ts:2484; apps/web/lib/connectors/oauth-access.ts:449
- **Known to be unfinished:** partials/mcp-web ca04fbda2 and 0bd9bccf0: Bank accounts connect through Plaid Link (plaid.com/docs/link/web and /docs/api, read 2026-09-28), as in ChatGPT's personal finance experience: live balances from /accounts/balance/get and transactions from /transactions/get as declared read tools, transactions product only, United States banks only, results fenced, save_memory refused for the rest of a turn that read bank data, and /item/remove on every disconnect and on account erasure. It stays unavailable until the owner signs Plaid's agreement, gets production access for transactions, completes the Dashboard compliance center details OAuth banks need, has a lawyer confirm whether the GLBA Safeguards Rule applies, and sets PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV. Extension chats read it once it is connected in the web app.
- **Where to find it:** Chrome side panel > plus menu > Connectors > Bank accounts > Connect (labels found in the code)
- **Needs:** a United States bank account, and Plaid set up by the owner
- **Steps:**
  1. Open the side panel, click the plus button, then click Connectors.
  2. Find the Bank accounts card and click Connect.
  3. Complete the Plaid Link flow with a United States bank and sign in.
  4. In the side panel, ask: what are my account balances?
  5. Compare with Expected: the balances and recent transactions should match the bank account.
