---
id: "PLAN-vscode-056"
type: "test-plan"
title: "VS Code · 56. Concrete integration families"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "56"
---
# VS Code · 56. Concrete integration families

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S56.01 Email search.

- **Expected:** With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Gmail > Ask with it, then type a search request (labels found in the code)
- **Needs:** an outside account (Google) with Gmail connected on the web
- **Steps:**
  1. Sign in to the extension and open the AGI sidebar chat.
  2. In the Connected apps group, click the Ask with it row for Gmail (it is listed only when Gmail is connected on the web).
  3. Type: find emails from a sender you know, and send.
  4. Compare the reply with Expected: matching messages from that sender are listed.

## S56.02 Email reading.

- **Expected:** The assistant can open and read the full content of a specific email or thread from a connected mailbox.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Gmail > Ask with it, then type a read request (labels found in the code)
- **Needs:** an outside account (Google) with Gmail connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the Gmail row under Connected apps.
  3. Type: open the latest email from a named sender and show the full text.
  4. Compare the reply with Expected: the full body of that email is shown, not only a summary line.

## S56.03 Email drafting.

- **Expected:** The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Gmail > Ask with it, then type a draft request (labels found in the code)
- **Needs:** an outside account (Google) with Gmail connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the Gmail row under Connected apps.
  3. Type: draft a reply to the latest email from a named sender, and do not send it.
  4. Open Gmail in a browser and check the Drafts folder for the new draft, comparing with Expected.

## S56.07 Calendar search.

- **Expected:** The assistant can search the connected calendar for events by text or date range.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Google Calendar > Ask with it, then type a calendar request (labels found in the code)
- **Needs:** an outside account (Google) with Google Calendar connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the Google Calendar row under Connected apps.
  3. Type: what events do I have next Tuesday, or search for the word standup.
  4. Compare the reply with the calendar in Google Calendar, using Expected as the test.

## S56.13 Cloud-file search.

- **Expected:** The assistant can search files in a connected cloud drive.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > OneDrive or Google Drive > Ask with it, then type a file search request (labels found in the code)
- **Needs:** an outside account (Google or Microsoft) with a cloud drive connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on a cloud drive row under Connected apps (OneDrive or Google Drive).
  3. Type: find files named with a word you know in that drive.
  4. Compare the reply with Expected: matching files from the drive are listed.

## S56.14 Cloud-file download.

- **Expected:** The assistant can download/read the content of a file from a connected cloud drive.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > OneDrive or Google Drive > Ask with it, then type a read request (labels found in the code)
- **Needs:** an outside account (Google or Microsoft) with a cloud drive connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on a cloud drive row under Connected apps.
  3. Type: open the file named with a word you know and show its text.
  4. Compare the reply with Expected: the text of that file is shown.

## S56.15 Cloud-file creation.

- **Expected:** The assistant can create a new file in a connected cloud drive, after approval.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > OneDrive or Google Drive > Ask with it, then type a create request (labels found in the code)
- **Needs:** an outside account (Google or Microsoft) with a cloud drive connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on a cloud drive row under Connected apps.
  3. Type: create a new text file named with a test word in that drive.
  4. When the approval prompt appears in the chat, read it and choose approve or deny; then check the drive for the new file against Expected.

## S56.16 Cloud-file editing.

- **Expected:** The assistant can modify an existing file in a connected cloud drive.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > OneDrive or Google Drive > Ask with it, then type an edit request (labels found in the code)
- **Needs:** an outside account (Google or Microsoft) with a cloud drive connected on the web, and a file you can safely change
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on a cloud drive row under Connected apps.
  3. Type: add one line that says a test word to a file you created in that drive.
  4. When the approval prompt appears, read it and choose approve or deny.
  5. Open the file in the drive and check the new line against Expected.

## S56.17 Folder and sharing management.

- **Expected:** The assistant can create folders and manage sharing (links, collaborators) in a connected cloud drive.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** not found in the code. Searched connector-scopes.ts and connectors.ts for folder or sharing scopes; only drive.file creation and OneDrive app-folder scopes were found, with no sharing or collaborator scope.
- **Needs:** a cloud drive connected on the web

## S56.22 Team-message drafting and posting.

- **Expected:** The assistant can draft and post a message to a team chat channel, after approval.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Slack > Ask with it, then type a posting request (labels found in the code)
- **Needs:** an outside account (Slack) with Slack connected on the web and a test channel
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the Slack row under Connected apps (Slack must be connected on the web).
  3. Type: draft a short status message for a named channel and post it.
  4. When the approval prompt appears, read the channel name and text, then approve or deny.
  5. Open the Slack channel and compare the posted message with Expected.

## S56.23 Knowledge-base search.

- **Expected:** The assistant can search a connected knowledge base (e.g. Notion, Confluence).
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Notion or Confluence > Ask with it, then type a search request (labels found in the code)
- **Needs:** an outside account (Notion or Atlassian) with the knowledge base connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on a Notion or Confluence row under Connected apps.
  3. Type: search the knowledge base for a page title you know.
  4. Compare the reply with Expected: matching pages from that workspace are listed.

## S56.26 Issue status updates.

- **Expected:** The assistant can update an issue's status or fields in a connected tracker.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Jira > Ask with it, then type an issue update request (labels found in the code)
- **Needs:** an outside account (Atlassian or Linear) with a tracker connected on the web and a test issue
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the Jira row under Connected apps (or Linear, if connected).
  3. Type: move a named test issue to In Progress, or change its priority.
  4. When the approval prompt appears, read it and approve or deny.
  5. Open the issue in Jira and compare its status or field with Expected.

## S56.28 CRM account/contact lookup.

- **Expected:** The assistant can look up CRM accounts and contacts in a connected CRM.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > HubSpot > Ask with it, then type a lookup request (labels found in the code)
- **Needs:** an outside account (HubSpot or Salesforce) with the CRM connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the HubSpot row under Connected apps (Salesforce is the other CRM connector).
  3. Type: find the contact or account for a company name you know.
  4. Compare the reply with the CRM record and Expected.

## S56.31 Repository search.

- **Expected:** The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8797; apps/extension-vscode/src/integrations/localRuntimeClient.ts:950 (quoted code not found in the file now)
- **Where to find it:** Code: Show Connectors (Command Palette) for hosted repos; for the local checkout, sidebar chat > type a code question (labels found in the code)
- **Needs:** a folder open in VS Code; a GitHub account connected on the web for hosted search
- **Steps:**
  1. Open a folder that has a project in it, then open the AGI sidebar chat.
  2. Type a question about the code, for example: where is a function name you know defined.
  3. For a hosted repository, click Ask with it on the GitHub row under Connected apps (GitHub must be connected on the web).
  4. Compare the reply with the file and line in the editor, using Expected as the test.

## S56.32 Pull-request workflows.

- **Expected:** The assistant can read a pull request, review it and post review comments on the hosted repository.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > GitHub > Ask with it, then type a pull request request (labels found in the code)
- **Needs:** an outside account (GitHub) with GitHub connected on the web and a test pull request
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the GitHub row under Connected apps (GitHub must be connected on the web).
  3. Type: review pull request number N in a named repository and list the review comments.
  4. When the approval prompt appears for posting comments, read it and approve or deny.
  5. Open the pull request on GitHub and compare the comments with Expected.

## S56.35 Design-to-code references.

- **Expected:** The assistant can pull design-to-code references (code context, dev resources) from a connected design file.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > Figma > Ask with it, then paste a Figma link (labels found in the code)
- **Needs:** an outside account (Figma) with Figma connected on the web and a design file
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the Figma row under Connected apps (Figma must be connected on the web).
  3. Paste a link to a Figma frame and ask for the code references for it.
  4. Compare the reply with the design file in Figma, using Expected as the test.

## S56.36 Database querying.

- **Expected:** The assistant can run queries against a connected database.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** not found in the code. Searched the connector catalog, display names and scopes: only a read-only BigQuery query scope and a Snowflake MCP entry added by URL were found; no general database connector was confirmed as a chat tool.
- **Needs:** a database connector connected on the web or a database added by URL

## S56.46 Health-record connections.

- **Expected:** The assistant can read the user's health records through a connected provider account.
- **Code:** done. Evidence moved: apps/cli/src/models/streaming.rs:1035; apps/cli/src/models/managed_approvals.rs:132; apps/cli/src/agent/chat.rs:1451; apps/cli/src/app_server/developer_host.rs:3066 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709
- **Where to find it:** Sidebar chat start screen > Connected apps > HealthEx > Ask with it, then type a records request (labels found in the code)
- **Needs:** an outside health provider account in the United States, with HealthEx connected on the web
- **Steps:**
  1. Open the AGI sidebar chat.
  2. Click Ask with it on the HealthEx row under Connected apps (HealthEx must be connected on the web).
  3. Type: list my recent lab results from my care provider.
  4. Compare the reply with the records in the provider's portal, using Expected as the test.
