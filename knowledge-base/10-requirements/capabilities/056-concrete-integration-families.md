---
id: "REQ-AREA-056"
type: "requirements"
title: "Requirement items: Concrete integration families"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 56. Concrete integration families

47 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S56.01

**Email search.** With an email account connected, the assistant can search the mailbox (e.g. by sender or subject) and return matching messages.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F056-01 Email (search, read, draft, attach, send)](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Competitor trace: CAP-connectors-apps-and-extensions-04, CAP-connectors-apps-and-extensions-05

## S56.02

**Email reading.** The assistant can open and read the full content of a specific email or thread from a connected mailbox.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI missing, VS Code done, Chrome partial
- Feature: [F056-01 Email (search, read, draft, attach, send)](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)

## S56.03

**Email drafting.** The assistant can create a draft email (new or reply) in the connected mailbox for the user to review.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F056-01 Email (search, read, draft, attach, send)](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Competitor trace: CAP-connectors-apps-and-extensions-04

## S56.04

**Email sending.** The assistant can send an email from the connected account, after approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code missing, Chrome partial
- Feature: [F056-01 Email (search, read, draft, attach, send)](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Competitor trace: CAP-connectors-apps-and-extensions-04

## S56.05

**Email attachments.** The assistant can read attachments on an email and attach files when composing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI missing, VS Code missing, Chrome partial
- Feature: [F056-01 Email (search, read, draft, attach, send)](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)

## S56.06

**Email labels and folders.** The assistant can list the mailbox labels/folders and file or relabel messages.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F056-01 Email (search, read, draft, attach, send)](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)

## S56.07

**Calendar search.** The assistant can search the connected calendar for events by text or date range.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F056-02 Calendar (search, free/busy, create, edit, invitations)](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Competitor trace: CAP-connectors-apps-and-extensions-04, CAP-connectors-apps-and-extensions-05

## S56.08

**Free/busy inspection.** The assistant can check free/busy time on the connected calendar to find open slots.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code missing, Chrome partial
- Feature: [F056-02 Calendar (search, free/busy, create, edit, invitations)](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)

## S56.09

**Event creation.** The assistant can create a calendar event on the connected calendar, after approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code missing, Chrome partial
- Feature: [F056-02 Calendar (search, free/busy, create, edit, invitations)](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Competitor trace: CAP-connectors-apps-and-extensions-04

## S56.10

**Event editing and cancellation.** The assistant can edit or cancel an existing calendar event.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code missing, Chrome partial
- Feature: [F056-02 Calendar (search, free/busy, create, edit, invitations)](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)

## S56.11

**Meeting invitations.** The assistant can send meeting invitations and respond to invitations on the connected calendar.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI missing, VS Code missing, Chrome partial
- Feature: [F056-02 Calendar (search, free/busy, create, edit, invitations)](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)

## S56.12

**Contacts and recipient lookup.** The assistant can look up people in the user's address book to find a recipient's email or details.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI missing, VS Code missing, Chrome partial
- Feature: [F056-03 Contacts lookup](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)

## S56.13

**Cloud-file search.** The assistant can search files in a connected cloud drive.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F056-04 Cloud files (search, download, create, edit, folders and sharing)](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Competitor trace: CAP-connectors-apps-and-extensions-04

## S56.14

**Cloud-file download.** The assistant can download/read the content of a file from a connected cloud drive.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F056-04 Cloud files (search, download, create, edit, folders and sharing)](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)

## S56.15

**Cloud-file creation.** The assistant can create a new file in a connected cloud drive, after approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F056-04 Cloud files (search, download, create, edit, folders and sharing)](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)

## S56.16

**Cloud-file editing.** The assistant can modify an existing file in a connected cloud drive.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F056-04 Cloud files (search, download, create, edit, folders and sharing)](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Competitor trace: CAP-connectors-apps-and-extensions-04

## S56.17

**Folder and sharing management.** The assistant can create folders and manage sharing (links, collaborators) in a connected cloud drive.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F056-04 Cloud files (search, download, create, edit, folders and sharing)](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Competitor trace: CAP-connectors-apps-and-extensions-05

## S56.18

**Document editing.** The assistant can edit a word-processing document (e.g. Google Docs or Word) in a connected account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F056-05 Documents, spreadsheets, presentations and design files](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)

## S56.19

**Spreadsheet editing.** The assistant can read and edit a spreadsheet in a connected account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F056-05 Documents, spreadsheets, presentations and design files](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)

## S56.20

**Presentation editing.** The assistant can edit a presentation (e.g. Slides/PowerPoint) in a connected account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F056-05 Documents, spreadsheets, presentations and design files](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)

## S56.21

**Team-message search.** The assistant can search messages in a connected team chat workspace (Slack/Teams).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code missing, Chrome partial
- Feature: [F056-06 Team chat and knowledge bases](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Competitor trace: CAP-connectors-apps-and-extensions-05

## S56.22

**Team-message drafting and posting.** The assistant can draft and post a message to a team chat channel, after approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, CLI done, VS Code done, Chrome unverified
- Feature: [F056-06 Team chat and knowledge bases](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)

## S56.23

**Knowledge-base search.** The assistant can search a connected knowledge base (e.g. Notion, Confluence).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F056-06 Team chat and knowledge bases](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)

## S56.24

**Wiki/page editing.** The assistant can create or edit wiki/knowledge-base pages in a connected workspace.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F056-06 Team chat and knowledge bases](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)

## S56.25

**Issue and task creation.** The assistant can create an issue or task in a connected tracker, after approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F056-07 Tickets, issues, boards and CRM records](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Competitor trace: CAP-connectors-apps-and-extensions-06

## S56.26

**Issue status updates.** The assistant can update an issue's status or fields in a connected tracker.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F056-07 Tickets, issues, boards and CRM records](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Competitor trace: CAP-connectors-apps-and-extensions-06

## S56.27

**Project-management boards.** The assistant can view and work with project boards in a connected project-management tool.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F056-07 Tickets, issues, boards and CRM records](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)

## S56.28

**CRM account/contact lookup.** The assistant can look up CRM accounts and contacts in a connected CRM.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F056-07 Tickets, issues, boards and CRM records](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Competitor trace: CAP-connectors-apps-and-extensions-29

## S56.29

**CRM opportunity updates.** The assistant can update CRM opportunities/deals, after approval.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F056-07 Tickets, issues, boards and CRM records](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Competitor trace: CAP-connectors-apps-and-extensions-29

## S56.30

**Support-ticket workflows.** The assistant can search, read and act on support tickets in a connected help desk.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F056-07 Tickets, issues, boards and CRM records](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)

## S56.31

**Repository search.** The assistant can search code across a connected repository (hosted, or the local checkout on coding surfaces).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code done, Chrome partial
- Feature: [F056-08 Code, pull requests, CI and deployments](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Competitor trace: CAP-connectors-apps-and-extensions-06

## S56.32

**Pull-request workflows.** The assistant can read a pull request, review it and post review comments on the hosted repository.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F056-08 Code, pull requests, CI and deployments](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Competitor trace: CAP-connectors-apps-and-extensions-06

## S56.33

**CI status and logs.** The assistant can report CI pipeline status and show build logs from a connected CI provider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code missing, Chrome partial
- Feature: [F056-08 Code, pull requests, CI and deployments](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Competitor trace: CAP-connectors-apps-and-extensions-06

## S56.34

**Design-file inspection.** The assistant can inspect a design file (frames, components, metadata) from a connected design tool.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome done
- Feature: [F056-05 Documents, spreadsheets, presentations and design files](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)

## S56.35

**Design-to-code references.** The assistant can pull design-to-code references (code context, dev resources) from a connected design file.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F056-05 Documents, spreadsheets, presentations and design files](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)

## S56.36

**Database querying.** The assistant can run queries against a connected database.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F056-09 Databases, warehouses and dashboards](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)

## S56.37

**Warehouse analysis.** The assistant can analyze data in a connected data warehouse.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, CLI missing, VS Code missing, Chrome partial
- Feature: [F056-09 Databases, warehouses and dashboards](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)

## S56.38

**Dashboard creation.** The assistant can create a dashboard in a connected analytics/BI tool.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, CLI done, VS Code missing, Chrome unverified
- Feature: [F056-09 Databases, warehouses and dashboards](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)

## S56.39

**Deployment management.** The assistant can view and manage deployments (list, inspect, deploy) in a connected hosting provider.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F056-08 Code, pull requests, CI and deployments](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)

## S56.40

**Licensed research retrieval.** The assistant can retrieve content from licensed research sources through a connected account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, CLI missing, VS Code missing, Chrome unverified
- Feature: [F056-11 Consumer services not built yet](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)

## S56.41

**Shopping/product lookup.** The assistant can look up products and prices through a connected shopping service.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, CLI missing, VS Code missing, Chrome unverified
- Feature: [F056-11 Consumer services not built yet](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)

## S56.42

**Reservations and bookings.** The assistant can search for and make reservations or bookings through a connected service.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, CLI missing, VS Code missing, Chrome unverified
- Feature: [F056-11 Consumer services not built yet](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)

## S56.43

**Media playback.** The assistant can control media playback (play, pause, queue) in a connected media service.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile unverified, CLI missing, VS Code missing, Chrome unverified
- Feature: [F056-11 Consumer services not built yet](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)

## S56.44

**Native messaging applications.** The assistant can read or send messages in native messaging apps (iMessage, SMS, WhatsApp, Telegram) on the user's behalf.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F056-11 Consumer services not built yet](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)

## S56.45

**Local notes and calendars.** The assistant can read and add to the notes and calendars stored on the user's own device.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile done, CLI missing, VS Code missing
- Feature: [F056-10 Personal data: bank, health and device notes](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)

## S56.46

**Health-record connections.** The assistant can read the user's health records through a connected provider account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI missing, VS Code done, Chrome partial
- Feature: [F056-10 Personal data: bank, health and device notes](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Competitor trace: CAP-connectors-apps-and-extensions-29, CAP-connectors-apps-and-extensions-32

## S56.47

**Financial-account connections.** The assistant can read balances and transactions from a connected financial account.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile partial, CLI done, VS Code missing, Chrome partial
- Feature: [F056-10 Personal data: bank, health and device notes](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Competitor trace: CAP-connectors-apps-and-extensions-29, CAP-connectors-apps-and-extensions-32
