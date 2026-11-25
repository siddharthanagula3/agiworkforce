---
id: "PLAN-cli-056"
type: "test-plan"
title: "CLI · 56. Concrete integration families"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "56"
---
# CLI · 56. Concrete integration families

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S56.01 Email search.

- **Expected:** With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No mailbox-search control found in the CLI. Gmail appears only as a schedule trigger source (agi schedules triggers add --source gmail), and the search operation is not in CLI code.

## S56.03 Email drafting.

- **Expected:** The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No email draft control found in the CLI; only the generic connector approval text in apps/cli/src/claude_parity.rs was found.

## S56.04 Email sending.

- **Expected:** The assistant can send an email from the connected account, after approval.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No email send control found in the CLI; only the generic connector approval text in apps/cli/src/claude_parity.rs was found.

## S56.07 Calendar search.

- **Expected:** The assistant can search the connected calendar for events by text or date range.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No calendar search control found in the CLI; Google Calendar appears only as a schedule trigger source.

## S56.08 Free/busy inspection.

- **Expected:** The assistant can check free/busy time on the connected calendar to find open slots.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No free/busy control found in the CLI; Google Calendar appears only as a schedule trigger source.

## S56.09 Event creation.

- **Expected:** The assistant can create a calendar event on the connected calendar, after approval.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No calendar event creation control found in the CLI; Google Calendar appears only as a schedule trigger source.

## S56.10 Event editing and cancellation.

- **Expected:** The assistant can edit or cancel an existing calendar event.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No calendar edit or cancel control found in the CLI; Google Calendar appears only as a schedule trigger source.

## S56.13 Cloud-file search.

- **Expected:** The assistant can search files in a connected cloud drive.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** agi, then /connectors, then a chat request about Google Drive (labels found in the code)
- **Needs:** a Managed Cloud session signed in, with Google Drive connected at https://agiworkforce.com/connectors
- **Steps:**
  1. Connect Google Drive at https://agiworkforce.com/connectors in a browser.
  2. In a terminal run agi, then type /connectors.
  3. Read the block that starts Your account's connectors; it should say connected connectors are offered to this session.
  4. Type a request such as: find a Google Drive file whose name contains a word you know.
  5. Compare the file names the assistant returns with what Google Drive shows.

## S56.14 Cloud-file download.

- **Expected:** The assistant can download/read the content of a file from a connected cloud drive.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** agi, then /connectors, then a chat request about Google Drive (labels found in the code)
- **Needs:** a Managed Cloud session signed in, with Google Drive connected at https://agiworkforce.com/connectors
- **Steps:**
  1. Connect Google Drive at https://agiworkforce.com/connectors in a browser.
  2. In a terminal run agi, then type /connectors.
  3. Read the block that starts Your account's connectors; it should say connected connectors are offered to this session.
  4. Type a request such as: read the text of one named Google Drive file.
  5. Compare the text the assistant shows with the file in Google Drive.

## S56.15 Cloud-file creation.

- **Expected:** The assistant can create a new file in a connected cloud drive, after approval.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** agi, then /connectors, then a chat request about Google Drive (labels found in the code)
- **Needs:** a Managed Cloud session signed in, with Google Drive connected at https://agiworkforce.com/connectors
- **Steps:**
  1. Connect Google Drive at https://agiworkforce.com/connectors in a browser.
  2. In a terminal run agi, then type /connectors.
  3. Type a request such as: create a new Google Drive file with a name you choose and one line of text.
  4. When the approval prompt appears, read it and approve the call.
  5. Compare the new file in Google Drive with what the assistant reported.

## S56.16 Cloud-file editing.

- **Expected:** The assistant can modify an existing file in a connected cloud drive.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** agi, then /connectors, then a chat request about Google Drive (labels found in the code)
- **Needs:** a Managed Cloud session signed in, with Google Drive connected at https://agiworkforce.com/connectors
- **Steps:**
  1. Connect Google Drive at https://agiworkforce.com/connectors in a browser.
  2. In a terminal run agi, then type /connectors.
  3. Type a request such as: add one line to a named Google Drive file you own.
  4. When the approval prompt appears, read it and approve the call.
  5. Compare the file in Google Drive with what the assistant reported.

## S56.18 Document editing.

- **Expected:** The assistant can edit a word-processing document (e.g. Google Docs or Word) in a connected account.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No Google Docs or Word editing control found in the CLI; no document connector is named in CLI code.

## S56.21 Team-message search.

- **Expected:** The assistant can search messages in a connected team chat workspace (Slack/Teams).
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** agi, then /connectors, then a chat request about Slack (labels found in the code)
- **Needs:** a Managed Cloud session signed in, with Slack connected at https://agiworkforce.com/connectors
- **Steps:**
  1. Connect Slack at https://agiworkforce.com/connectors in a browser.
  2. In a terminal run agi, then type /connectors.
  3. Read the block that starts Your account's connectors; it should say connected connectors are offered to this session.
  4. Type a request such as: find Slack messages that mention a word you know.
  5. Compare the messages the assistant returns with what Slack shows.

## S56.22 Team-message drafting and posting.

- **Expected:** The assistant can draft and post a message to a team chat channel, after approval.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** agi, then /connectors, then a chat request about Slack (labels found in the code)
- **Needs:** a Managed Cloud session signed in, with Slack connected and a test channel
- **Steps:**
  1. Connect Slack at https://agiworkforce.com/connectors in a browser.
  2. In a terminal run agi, then type /connectors.
  3. Type a request such as: draft a Slack message to a test channel saying a short phrase.
  4. When the approval prompt appears, read it and approve the call.
  5. Compare the posted message in Slack with the draft shown in the chat.

## S56.24 Wiki/page editing.

- **Expected:** The assistant can create or edit wiki/knowledge-base pages in a connected workspace.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** agi, then /connectors, then a chat request about Notion (labels found in the code)
- **Needs:** a Managed Cloud session signed in, with Notion connected at https://agiworkforce.com/connectors
- **Steps:**
  1. Connect Notion at https://agiworkforce.com/connectors in a browser.
  2. In a terminal run agi, then type /connectors.
  3. Type a request such as: create a Notion page with a title you choose and one line of text.
  4. When the approval prompt appears, read it and approve the call.
  5. Compare the new page in Notion with what the assistant reported.

## S56.26 Issue status updates.

- **Expected:** The assistant can update an issue's status or fields in a connected tracker.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No issue-tracker control found in the CLI; Linear appears only in test fixtures.

## S56.28 CRM account/contact lookup.

- **Expected:** The assistant can look up CRM accounts and contacts in a connected CRM.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No CRM lookup control found in the CLI.

## S56.29 CRM opportunity updates.

- **Expected:** The assistant can update CRM opportunities/deals, after approval.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No CRM opportunity update control found in the CLI.

## S56.31 Repository search.

- **Expected:** The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/dir_ops/mod.rs:139; apps/cli/src/features/exec/tools/dir_ops/mod.rs:114
- **Where to find it:** agi, then a chat request to search the code in the project folder (labels found in the code)
- **Needs:** a project folder with code on this Mac
- **Steps:**
  1. Open a terminal in a project folder that contains code and run agi.
  2. Type: find every place the word logout appears in this project (use a word your project has).
  3. Watch for the tool line that reads Search(<word>, <path>).
  4. Read the matching lines the assistant shows, with file names and line numbers.
  5. Compare the results with a search you run yourself in that folder.

## S56.32 Pull-request workflows.

- **Expected:** The assistant can read a pull request, review it and post review comments on the hosted repository.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:788; apps/cli/src/review.rs:227; apps/cli/src/review.rs:174; apps/cli/src/review.rs:104; apps/cli/src/claude_parity.rs:1983
- **Where to find it:** agi review --pr <number>, then agi review --pr <number> --post (labels found in the code)
- **Needs:** a GitHub pull request you can comment on, and the GitHub CLI (gh) signed in
- **Steps:**
  1. Sign in to the GitHub CLI (gh) with an account that can see a test pull request.
  2. In a terminal run agi review --pr <number> and read the review printed.
  3. Run agi review --pr <number> --post on the same test pull request.
  4. Open the pull request on GitHub.
  5. Compare the new review comment on GitHub with the printed review.

## S56.33 CI status and logs.

- **Expected:** The assistant can report CI pipeline status and show build logs from a connected CI provider.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No CI status or build-log command found in apps/cli/src/lib.rs or the CLI code (searched for CI, pipeline, build log and gh run terms).

## S56.35 Design-to-code references.

- **Expected:** The assistant can pull design-to-code references (code context, dev resources) from a connected design file.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No Figma or design-file control found in the CLI.

## S56.38 Dashboard creation.

- **Expected:** The assistant can create a dashboard in a connected analytics/BI tool.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No analytics or BI dashboard control found in the CLI.

## S56.39 Deployment management.

- **Expected:** The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No deployment list, inspect or deploy command found in apps/cli/src/lib.rs or the CLI code.

## S56.47 Financial-account connections.

- **Expected:** The assistant can read balances and transactions from a connected financial account.
- **Code:** done. Evidence moved: crates/agiworkforce-llm/src/stream.rs:1043; crates/agiworkforce-llm/src/stream.rs:843; apps/cli/src/models/managed_approvals.rs:50; apps/cli/src/models/managed_approvals.rs:139; apps/cli/src/models/streaming.rs:1034; apps/cli/src/models/streaming.rs:1045; apps/cli/src/agent/chat.rs:969 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No bank or financial account control found in the CLI.
