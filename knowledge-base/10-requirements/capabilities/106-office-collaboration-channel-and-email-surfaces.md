---
id: "REQ-AREA-106"
type: "requirements"
title: "Requirement items: Office, collaboration-channel, and email surfaces"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 106. Office, collaboration-channel, and email surfaces

25 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S106.01

**Assistant inside Word.** An assistant pane runs inside Word and can read and change the open document through the host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-01 Office add-in assistant pane (Word, Excel, PowerPoint, Outlook)](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-01-office-add-in-assistant-pane-word-excel-powerpoint.md)

## S106.02

**Assistant inside Excel.** An assistant pane runs inside Excel and can read and change the open document through the host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-01 Office add-in assistant pane (Word, Excel, PowerPoint, Outlook)](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-01-office-add-in-assistant-pane-word-excel-powerpoint.md)

## S106.03

**Assistant inside PowerPoint.** An assistant pane runs inside PowerPoint and can read and change the open document through the host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-01 Office add-in assistant pane (Word, Excel, PowerPoint, Outlook)](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-01-office-add-in-assistant-pane-word-excel-powerpoint.md)

## S106.04

**Assistant inside Outlook.** An assistant pane runs inside Outlook and can read and change the open message through the host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-01 Office add-in assistant pane (Word, Excel, PowerPoint, Outlook)](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-01-office-add-in-assistant-pane-word-excel-powerpoint.md)

## S106.05

**Assistant inside Google Docs.** An assistant pane runs inside Google Docs and can read and change the open document through the host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-02 Google Docs, Sheets and Slides assistant](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-02-google-docs-sheets-and-slides-assistant.md)

## S106.06

**Assistant inside Google Sheets.** An assistant pane runs inside Google Sheets and can read and change the open document through the host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-02 Google Docs, Sheets and Slides assistant](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-02-google-docs-sheets-and-slides-assistant.md)

## S106.07

**Assistant inside Google Slides.** An assistant pane runs inside Google Slides and can read and change the open document through the host.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-02 Google Docs, Sheets and Slides assistant](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-02-google-docs-sheets-and-slides-assistant.md)

## S106.08

**Host-document selection context.** The in-host assistant sees what the user has selected in the host document (text, cells, slide objects) as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-03 Selection, tracked edits, protected ranges and cross-file references in host documents](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-03-selection-tracked-edits-protected-ranges-and-cross.md)

## S106.09

**Native tracked edits.** Edits the assistant makes to a host document appear as native tracked changes or suggestions the user can accept or reject.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Chrome missing
- Feature: [F106-03 Selection, tracked edits, protected ranges and cross-file references in host documents](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-03-selection-tracked-edits-protected-ranges-and-cross.md)

## S106.10

**Protected-range awareness.** The in-host assistant knows which ranges, sheets or sections are protected or locked and does not try to change them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Chrome missing
- Feature: [F106-03 Selection, tracked edits, protected ranges and cross-file references in host documents](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-03-selection-tracked-edits-protected-ranges-and-cross.md)

## S106.11

**Cross-document references.** From inside one host document the assistant can pull in or cite another document from the same host (another file, sheet or deck).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Chrome missing
- Feature: [F106-03 Selection, tracked edits, protected ranges and cross-file references in host documents](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-03-selection-tracked-edits-protected-ranges-and-cross.md)

## S106.12

**Shared conversation context across supported host applications.** One assistant conversation carries across the supported host apps (for example, started in Word and continued in Excel) with its context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-04 Handoff between host apps and the standalone app](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-04-handoff-between-host-apps-and-the-standalone-app.md)
- Competitor trace: CAP-sharing-and-collaboration-28

## S106.13

**Slack direct-message assistant.** A user can DM the product's Slack bot and gets the assistant's reply in that DM.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial
- Feature: [F106-05 Slack direct-message assistant](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-05-slack-direct-message-assistant.md)

## S106.14

**Slack channel agent.** An agent listens in a Slack channel and acts (and reports back) when channel messages or events arrive.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial
- Feature: [F106-06 Slack channel agent and mention-to-task](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)

## S106.15

**Teams assistant.** Users can talk to the assistant inside Microsoft Teams (bot or app) and get answers there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-09 Microsoft Teams assistant](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-09-microsoft-teams-assistant.md)

## S106.16

**Mention-to-task handoff.** Mentioning the assistant in a channel message turns that message into a task the agent runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial
- Feature: [F106-06 Slack channel agent and mention-to-task](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)

## S106.17

**Email-to-task address.** Each user or workspace gets an email address; mail sent to it creates a task for the agent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-10 Email-to-agent](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)

## S106.18

**Forward-email-to-agent workflow.** A user forwards an email to the agent and the agent acts on that email.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-10 Email-to-agent](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)

## S106.19

**Task replies within an email thread.** When a task came from email, the agent posts progress or results as replies in that same email thread.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-10 Email-to-agent](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-10-email-to-agent.md)

## S106.20

**Channel-based approvals.** When an agent needs approval, the request appears in a channel (Slack, Teams or email) and can be approved there.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-07 Per-channel controls and approvals in Slack](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)

## S106.21

**Agent identity distinct from a human account.** In channels and connected tools the agent acts under its own identity (bot or service account), clearly distinct from the human user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial
- Feature: [F106-06 Slack channel agent and mention-to-task](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-06-slack-channel-agent-and-mention-to-task.md)

## S106.22

**Channel-specific permissions.** Admins or users can set what the agent may do per channel (which channels it may read, post in or act on).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-07 Per-channel controls and approvals in Slack](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-07-per-channel-controls-and-approvals-in-slack.md)

## S106.23

**Conversation-to-session mapping.** Each channel conversation or thread maps to one persistent agent session, so follow-ups in the thread continue it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing
- Feature: [F106-08 Thread continuity](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-08-thread-continuity.md)

## S106.24

**Results mirrored into the main application.** Work the agent does from a channel or host shows up in the main app (run history, results) for review.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F106-11 Results in the main app](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-11-results-in-the-main-app.md)

## S106.25

**Native-host and standalone-app handoff.** A session started in a host add-in can be opened in the standalone app (and back) with its context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Chrome missing
- Feature: [F106-04 Handoff between host apps and the standalone app](../../20-features/106-office-collaboration-channel-and-email-surfaces/F106-04-handoff-between-host-apps-and-the-standalone-app.md)
