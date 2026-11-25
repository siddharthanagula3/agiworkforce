---
id: "F100-11"
type: "feature"
title: "Support cases"
aliases: ["Support cases", "Support tickets", "Raise a ticket", "Your support tickets", "Help and Support", "S100.27 Support-case integration"]
area: "100 Commercial and administrative components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S100.27"]
depends_on: ["SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "table:support_tickets", "F100-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F100-11 Support cases

Lets a signed-in person open a support ticket, see their tickets and read and answer the thread. Priority comes from the contracted support tier. Staff see a queue, reply (the customer gets an email) and can escalate. Web has a tickets panel in Help settings and mobile has Support screens in Cloud mode. Other apps link out.

Area: [100. Commercial and administrative components](README.md). Requirement items: [S100.27](../../10-requirements/capabilities/100-commercial-and-administrative-components.md#s10027).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** POST /api/support/tickets creates a ticket with the person's reply email, message, optional diagnostics and optional live-handoff id; GET lists the person's tickets; GET and PATCH on a ticket read the thread, add a reply or close it (apps/web/app/api/support/tickets/route.ts:28-80; apps/web/app/api/support/tickets/[ticketId]/route.ts). Staff list, read, reply and escalate through staff routes (apps/web/app/api/support/staff/tickets/route.ts; apps/web/app/api/support/tickets/[ticketId]/escalate/route.ts).

**Why it exists.** So a person with a problem has a durable channel to a human, with account context and a thread. The brief says cases are created with account context, routed to staff and threaded with replies (doc: knowledge-base/data/area-briefs/100-commercial-and-administrative-components.md S100.27).

**Who uses it.** Signed-in customers; support staff who are platform admins; on-call engineers paged for urgent escalations.

**Problems it solves**

- A bug report reaches staff with redacted diagnostics.
- Enterprise customers are not queued behind free visitors.
- Customers get an email when staff reply.
- A resolved ticket reopens when the customer answers.

**Use cases**

- A user on web opens Settings, Help, fills 'What happened' and presses 'Raise ticket'.
- A mobile user in Cloud mode raises a ticket from Support.
- A staff member replies and marks the ticket resolved.
- A staff member escalates an urgent ticket to engineering with a summary.

## 2. User experience

**Where to find it**

- Web: Settings, Help section hosts the tickets panel titled 'Your support tickets' (apps/web/features/settings/sections/HelpSection.tsx:14, 79; apps/web/features/support/components/SupportTicketsPanel.tsx:473-476).
- Mobile: Support screen titled 'Support' with 'New ticket', 'Raise a ticket', 'Raise ticket', 'Show older tickets', and a 'Ticket' screen (apps/mobile/src/features/support/SupportTicketsScreen.tsx:46-274; apps/mobile/src/features/support/SupportTicketScreen.tsx:47).
- Desktop: a 'Contact support' link to /support with the text 'Reach a person about your account.' (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:171).
- CLI, VS Code, Chrome: no ticket client found.
- Staff: staff ticket API under /api/support/staff/tickets (apps/web/app/api/support/staff/tickets/route.ts); no staff screen was read.

**Before you start**

- Signed in (apps/web/app/api/support/tickets/route.ts:28-31).
- A confirmed reply email on the account, else the ticket is refused with messages such as 'Confirm your email address first...' (apps/web/lib/auth/email-confirmation.ts:17-23).
- Mobile: Cloud mode and sign-in; Local or own-key mode shows a prompt to switch to Cloud (apps/mobile/src/features/support/SupportTicketsScreen.tsx:46-62).

**Screens and controls**

- Web form: subject, 'What happened', a diagnostics checkbox, 'Review diagnostics' or 'Refresh diagnostics', 'Raise ticket' (apps/web/features/support/components/SupportTicketsPanel.tsx:139-220).
- Ticket thread: reply box and 'Send reply', a close action with confirm label 'Close ticket' (apps/web/features/support/components/SupportTicketsPanel.tsx:47, 343-369).
- List: 'Show older tickets' (apps/web/features/support/components/SupportTicketsPanel.tsx:568).
- Accessibility barrier subject constant for accessibility reports (apps/web/features/support/components/SupportTicketsPanel.tsx:65).

**Journey**

1. Person opens Help (web) or Support (mobile).
2. Writes subject and message; optionally reviews diagnostics to attach.
3. Presses 'Raise ticket'; the client posts with a CSRF token.
4. Server checks sign-in, CSRF, rate limit and the reply email, resolves priority, stores the ticket and emails the support team.
5. The list shows the new ticket; opening it shows replies.
6. Staff reply; the customer gets an email with 'Re: <subject>' and sees the reply in the thread.
7. Customer can reply or close; a reply on a resolved ticket reopens it as in progress.

**What the person sees and gets**

- Response includes the ticket and staffNotified flag (apps/web/app/api/support/tickets/route.ts:72-75).
- Email to the customer: 'Support replied to your ticket "<subject>":' (apps/web/lib/support/tickets/service.ts, emailStaffReply).
- Mobile states: 'Loading your tickets', 'No tickets yet', 'Your tickets could not be loaded' (apps/mobile/src/features/support/SupportTicketsScreen.tsx:239-252).
- Panel states: spinner 'Reading your tickets' (apps/web/features/support/components/SupportTicketsPanel.tsx:507).

**Settings**

- Limits: subject 200 characters, message 8,000, 50 tickets per page (packages/contracts/cloud-contracts/src/support.ts:370-372).
- Support tier to priority map (apps/web/lib/support/handoff/priority.ts:28-40).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create with CSRF, rate limits support-tickets-write, reply email check, diagnostics normalising (apps/web/app/api/support/tickets/route.ts:48-75).
- List with rate limit support-tickets-read and offset paging (apps/web/app/api/support/tickets/route.ts:28-46; apps/web/lib/support/tickets/service.ts, listTicketsPage).
- Priority resolution from the contracted support tier (apps/web/lib/support/tickets/service.ts, openTicket; apps/web/lib/support/handoff/priority.ts:65).
- Support team email on open; failure to email is logged and the ticket is still saved with staffNotified false (apps/web/lib/support/tickets/service.ts, notifySupportTeam).
- Staff reply with email to the customer using idempotency key support-ticket-reply-<reply id> (apps/web/lib/support/tickets/service.ts, emailStaffReply).
- Customer reply and close; resolved reopens on reply (apps/web/lib/support/tickets/service.ts, replyToTicket and moveTicket).
- Escalation to engineering with paging for urgent severities (apps/web/lib/support/tickets/service.ts, escalateTicket).
- Web panel and mobile screens.

**Incomplete**

- Brief line references (service.ts:131-140, 140-160) point near the code but the functions are named openTicket and emailStaffReply; the brief's '~140-160' is approximate.

**Present but disconnected or switched off**

- none found

**Not available**

- Ticket screens on CLI, VS Code and Chrome: none found.
- Desktop opens the web support page; no native ticket list found.
- A staff web screen for the queue: not read.

## 4. Required behaviour

**Established requirements**

- Support cases are created with account context, routed to staff and threaded with replies. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S100.27)
- Create needs a CSRF token, rate limit and a reply email; priority comes from the contracted support tier. (source: apps/web/app/api/support/tickets/route.ts:44-60)
- Staff replies email the customer with an idempotency key per reply. (source: apps/web/lib/support/tickets/service.ts)
- Support and accessibility copy must be accessible. (source: AGENTS.md section 9 (no dead controls, no silent failures))

**Acceptance criteria**

1. A signed-in person with a confirmed email can raise a ticket; without a confirmed email the request is refused with a plain message.
2. A write without a CSRF token is refused.
3. A ticket from an account with a contracted support tier gets the mapped priority; an account with no contract gets normal.
4. If the team email fails the ticket still exists and staffNotified is false.
5. A staff reply sends exactly one customer email even if retried (same idempotency key).
6. A customer reply on a resolved ticket sets it to in progress; a reply on a closed ticket is refused.
7. On mobile, Local mode shows a prompt to use Cloud instead of calling the account.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Diagnostics are dropped, not the ticket, when they fail validation, because the route comment says so (apps/web/app/api/support/tickets/route.ts:60-66).
- [inferred] A person can only read their own tickets because every read passes the user id (apps/web/lib/support/tickets/service.ts, readTicket).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a CLI command 'agi support' or a hand-off link.
- [proposed] Write an audit event when staff read or reply to a customer ticket.
- [proposed] Show ticket status badges on desktop through the same endpoints.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | /api/support/tickets | `apps/web/app/api/support/tickets/route.ts` | List and create tickets. |
| endpoint | /api/support/tickets/[ticketId] | `apps/web/app/api/support/tickets/[ticketId]/route.ts` | Read thread, reply, close. |
| endpoint | /api/support/tickets/[ticketId]/escalate | `apps/web/app/api/support/tickets/[ticketId]/escalate/route.ts` | Staff escalation. |
| endpoint | /api/support/staff/tickets | `apps/web/app/api/support/staff/tickets/route.ts` | Staff queue (platform admin). |
| service | tickets service | `apps/web/lib/support/tickets/service.ts` | Open, list, read, reply, move, staff reply, escalate. |
| service | tickets store | `apps/web/lib/support/tickets/store.ts` | Database reads and writes. |
| service | priority | `apps/web/lib/support/handoff/priority.ts` | Support tier to priority. |
| service | escalation-email | `apps/web/lib/support/handoff/escalation-email.ts` | Emails to team and customer. |
| service | email-confirmation | `apps/web/lib/auth/email-confirmation.ts` | requireReplyEmail. |
| schema | diagnostics schema | `apps/web/lib/support/diagnostics/schema.ts` | Normalise and redact diagnostics. |
| config | support contracts | `packages/contracts/cloud-contracts/src/support.ts` | Request and response schemas, limits, statuses. |
| component | SupportTicketsPanel | `apps/web/features/support/components/SupportTicketsPanel.tsx` | Web ticket list, form and thread. |
| service | ticket-client | `apps/web/features/support/lib/ticket-client.ts` | Web client for the ticket API. |
| screen | HelpSection | `apps/web/features/settings/sections/HelpSection.tsx` | Hosts the panel. |
| screen | SupportTicketsScreen | `apps/mobile/src/features/support/SupportTicketsScreen.tsx` | Mobile list and form. |
| screen | SupportTicketScreen | `apps/mobile/src/features/support/SupportTicketScreen.tsx` | Mobile thread. |
| service | mobile support service | `apps/mobile/src/features/support/service.ts` | Mobile calls to the ticket API. |
| table | support_tickets, support_ticket_replies | `apps/web/db/neon/0024_support_tickets.sql` | Tickets and replies. |
| table | support_ticket_escalations | `apps/web/db/neon/0242_support_ticket_escalations.sql` | Escalations. |
| component | Desktop Contact support link | `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` | Links to the web support page. |
| service | handoff service | `apps/web/lib/support/handoff/handoff-service.ts` | Live handoff that can lead to a ticket. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client collects subject, message and optional diagnostics and posts with CSRF. | device | apps/web/features/support/lib/ticket-client.ts; apps/mobile/src/features/support/service.ts:9-10 |
| Server authenticates, rate limits, validates, confirms the reply email. | our servers | apps/web/app/api/support/tickets/route.ts:48-62 |
| Server resolves priority from the contract support tier and stores the ticket. | our servers | apps/web/lib/support/tickets/service.ts (openTicket); apps/web/lib/support/handoff/priority.ts:65 |
| Server emails the support team through the email provider. | outside service | apps/web/lib/support/handoff/escalation-email.ts; apps/web/lib/support/handoff/resend-client.ts |
| Staff reply is stored, then the customer is emailed with an idempotency key, then status moves. | our servers | apps/web/lib/support/tickets/service.ts (replyToTicketAsStaff) |
| Escalation of p0 or p1 pages on-call through the incident notifier. | outside service | apps/web/lib/support/tickets/service.ts (escalateTicket, notifyIncident) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Ticket subject, message, name, email, priority, support tier, diagnostics, handoff id | table support_tickets | Server only; apps read through the API | Unknown; account erasure handling not read |
| Replies | table support_ticket_replies | Server only | Unknown |
| Escalations | table support_ticket_escalations | Server only | Unknown |
| Redacted text | Message text is passed through transcript redaction before saving (apps/web/lib/support/tickets/service.ts, clamp) | n/a | n/a |

**Models and providers.** No model or inference provider takes part in ticket creation. A separate support assistant exists (apps/web/lib/support/agent) and is a different feature. An email provider client sends mail (apps/web/lib/support/handoff/resend-client.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account with a confirmed reply email (apps/web/app/api/support/tickets/route.ts:28, 62). |
| Permissions | Staff routes require platform admin (apps/web/app/api/support/staff/tickets/route.ts:5). Customers see only their own tickets (apps/web/lib/support/tickets/service.ts, readTicket). |
| Subscription | No plan gate found for raising a ticket. Priority rises with the contracted support tier (apps/web/lib/support/handoff/priority.ts:28-40). |
| Limits and metering | Rate limits support-tickets-read and support-tickets-write per user; subject 200, message 8,000, 50 per page (packages/contracts/cloud-contracts/src/support.ts:370-372). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | An email provider is required for notifications; failure is tolerated (apps/web/lib/support/tickets/service.ts, notifySupportTeam). |
| Local mode | Tickets need the account. Mobile in Local or own-key mode shows a prompt to switch to Cloud and does not call the account (apps/mobile/src/features/support/SupportTicketsScreen.tsx:55-62). Web and desktop Local behaviour not read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Mobile 'Loading your tickets'; web spinner 'Reading your tickets'. | apps/mobile/src/features/support/SupportTicketsScreen.tsx:248; apps/web/features/support/components/SupportTicketsPanel.tsx:507 |
| Empty | Mobile 'No tickets yet'. | apps/mobile/src/features/support/SupportTicketsScreen.tsx:252 |
| Error | Mobile 'Your tickets could not be loaded'; older tickets 'could not be loaded'. | apps/mobile/src/features/support/SupportTicketsScreen.tsx:239, 274 |
| Team email failed | Ticket kept, staffNotified false, error logged. | apps/web/lib/support/tickets/service.ts (notifySupportTeam) |
| Closed ticket reply | TicketClosedError. | apps/web/lib/support/tickets/service.ts (replyToTicket) |
| Status changed under us | InvalidTicketTransitionError rather than retry. | apps/web/lib/support/tickets/service.ts (moveTicket) |
| Diagnostics invalid | Dropped, ticket still created. | apps/web/app/api/support/tickets/route.ts:60-66 |
| No mail app on mobile | A no-mail-app alert hook exists. | apps/mobile/src/features/support/useNoMailAppAlert.ts |
| Offline | not handled in the code beyond the error states above | apps/mobile/src/features/support/SupportTicketsScreen.tsx |
| Accessibility | Web has an accessibility-barrier subject; form labels exist. | apps/web/features/support/components/SupportTicketsPanel.tsx:65, 139-160 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/support/tickets/__tests__/routes.test.ts`: Ticket routes.
- `apps/web/lib/support/tickets/__tests__/service.test.ts`: Ticket service.
- `apps/web/lib/support/tickets/__tests__/escalation.test.ts`: Escalation.
- `apps/web/lib/support/tickets/__tests__/staff-path.test.ts`: Staff queue and reply path.
- `apps/web/features/support/components/__tests__/SupportTicketsPanel.test.tsx`: Web panel.
- `apps/web/db/neon/support-ticket-escalations-migration.test.ts`: Escalation migration.
- `apps/mobile/src/features/support/__tests__/HelpArticleLink.test.tsx`: Help article link only, not tickets.

**Test scenarios**

- **Raise and read**
  1. Sign in with a confirmed email.
  2. Open Settings, Help, fill the form, press 'Raise ticket'.
  - Expected: Ticket appears in 'Your support tickets' with status open.
- **Priority from contract**
  1. Use an account whose workspace has support tier enterprise; raise a ticket.
  - Expected: Priority is high; with no contract it is normal.
- **Staff reply email**
  1. As staff reply to the ticket twice with the same retry.
  - Expected: One customer email; thread shows the reply.
- **Reopen**
  1. Resolve the ticket as staff; reply as the customer.
  - Expected: Ticket status becomes in progress.
- **Mobile Local mode**
  1. On mobile in Local mode open Support.
  - Expected: A prompt to switch to Cloud; no ticket request is sent.

**Where to look when it fails**

- Log lines '[support-ticket] opened', '[support-ticket] support team was not emailed about a new ticket', '[support-ticket] customer was not emailed a staff reply', '[support-ticket] escalated to engineering' (apps/web/lib/support/tickets/service.ts).
- Errors TicketNotFoundError, TicketClosedError, InvalidTicketTransitionError.
- Tables support_tickets, support_ticket_replies, support_ticket_escalations.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No ticket creation or list on CLI, VS Code or Chrome; desktop links to the web.** Affects: Desktop, CLI, VS Code, Chrome.. Evidence: No client code found; apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:171.. Work needed: Decide whether to add native clients.
- **Ticket actions write no audit event.** Affects: Admins and compliance.. Evidence: No recordAuditEvent in apps/web/lib/support/tickets/service.ts or apps/web/app/api/support/tickets/route.ts.. Work needed: Audit staff reads and replies.
- **Mobile test coverage covers a help link only.** Affects: Mobile.. Evidence: apps/mobile/src/features/support/__tests__ has one file.. Work needed: Add tests for the screens.
- **Data retention for tickets is not established.** Affects: Privacy.. Evidence: Not found in files read.. Work needed: Document retention and erasure.

**Depends on**

- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- table:support_tickets
- F100-10

## Unknown

- Ticket and reply retention and erasure rules.
- Whether the desktop /support link opens the ticket panel.
- Whether any staff screen exists beyond the staff API.
- How the mobile service attaches diagnostics.
