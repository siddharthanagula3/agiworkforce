---
id: "F088-02"
type: "feature"
title: "Contact support and support tickets"
aliases: ["Contact support", "Your support tickets", "Raise a ticket", "Support tickets panel", "SupportTicketsPanel", "Contact Support (mobile)", "Get support"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S88.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "api:GET /api/support/tickets", "api:POST /api/support/tickets", "api:GET /api/support/tickets/[ticketId]", "api:PATCH /api/support/tickets/[ticketId]", "table:support_tickets", "table:support_ticket_replies", "table:support_ticket_escalations", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-02 Contact support and support tickets

A signed-in user raises a support ticket with a subject and message, can attach build diagnostics, and reads support's replies in a ticket thread. Web has it in Settings, Help. Mobile has a Support screen in Cloud mode. Desktop opens the public Support page. Priority comes from the organisation's contracted support tier.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.03](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8803).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Creates and lists support tickets for the signed-in user, shows the thread, lets the user reply or close, and tells the user whether the support team was emailed (staffNotified) (apps/web/app/api/support/tickets/route.ts:45-79, apps/web/features/support/components/SupportTicketsPanel.tsx:235-392).

**Why it exists.** The brief requires that a signed-in user can reach support, describe a problem and follow the replies (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md, S88.03).

**Who uses it.** Signed-in people with an account problem, and support staff who work the queue (staff routes exist under apps/web/app/api/support/staff).

**Problems it solves**

- Replies stay in one thread inside the product rather than only in email.
- Support sees build and platform context without asking.
- Paying organisations are ranked ahead in the queue (apps/web/lib/support/handoff/priority.ts:36-44).

**Use cases**

- A user writes 'Cannot export my data', sends it and later reads the staff reply.
- A user replies to a resolved ticket and it goes back in the queue (apps/web/lib/support/tickets/service.ts:196-229).
- A user closes a ticket after the issue is fixed.
- A user reports an accessibility barrier through the second button (apps/web/features/support/components/SupportTicketsPanel.tsx:580-586).

## 2. User experience

**Where to find it**

- Web: Settings, Help section shows 'Your support tickets' (apps/web/features/settings/sections/HelpSection.tsx:79, apps/web/features/support/components/SupportTicketsPanel.tsx:473-482). The public /support page has the button 'Raise a ticket' that goes to /settings/help (apps/web/app/support/page.tsx:110-112).
- Desktop: Help menu, '<Desktop product name> Support' opens the public /support page in the system browser (apps/desktop/electron/appMenu.ts:551, apps/desktop/electron/main.ts:2271-2273). The tickets panel itself is the web Settings, Help section shown in the app window [inferred].
- Mobile: About screen, Support card, 'Contact Support' (only when signed in and in Cloud mode) and 'Email Support' (apps/mobile/app/(app)/about.tsx:313-330); Billing screen row 'Help with your plan' (apps/mobile/src/features/settings/cloud-billing/index.tsx:413-416); an alert action 'Get help' on an incomplete data export (apps/mobile/src/features/settings/cloud-account/index.tsx:476-479).
- Web account menu: 'Email support' item (apps/web/shared/components/layout/AccountMenuItems.tsx:100-104).
- CLI, VS Code, Chrome: no ticket list. VS Code 'Contact support' and Chrome 'Contact support' open /support in the browser (apps/extension-vscode/src/features/help/helpMenu.ts:54-57, apps/extension/src/options.ts:2040-2045).

**Before you start**

- Signed in (route calls getClerkAuthUser) (apps/web/app/api/support/tickets/route.ts:26,46).
- A reply email: the token's email, or the account's confirmed primary email (apps/web/lib/auth/email-confirmation.ts:56-66).
- Mobile: Cloud mode, otherwise a blocked banner 'Support tickets are kept in your Cloud account.' (apps/mobile/src/features/support/SupportTicketsScreen.tsx:55-63).
- Web write calls carry an anti-forgery token (apps/web/features/support/lib/ticket-client.ts:59-60).

**Screens and controls**

- Web panel: title 'Your support tickets', ticket buttons with status chips (Open, In progress, Resolved, Closed), 'Show older tickets', 'Raise a ticket', 'Report an accessibility barrier'.
- Form: 'Subject', 'What happened' with a character counter, a checkbox 'Attach diagnostics: your build, platform and the last few errors this browser recorded. Nothing you were working on is sent.', buttons 'Review diagnostics', 'Download diagnostics', 'Raise ticket', 'Cancel' (apps/web/features/support/components/SupportTicketsPanel.tsx:137-231).
- Thread: 'Back to your tickets', status meaning text, replies labelled 'Support' or 'You', 'Reply' field, 'Send reply', 'Close ticket' with confirmation 'Close this ticket?' (apps/web/features/support/components/SupportTicketsPanel.tsx:46-49,283-389).
- Mobile: screen 'Support' with 'Raise a ticket', fields 'Subject' and 'What happened', switch 'Attach diagnostics', buttons 'Cancel' and 'Raise ticket'; screen 'Ticket' with 'Send reply' and 'Close ticket' (apps/mobile/src/features/support/SupportTicketsScreen.tsx:181-230, apps/mobile/src/features/support/SupportTicketScreen.tsx:165-215).

**Journey**

1. 1. Open Settings, Help (web) or About, Contact Support (mobile).
2. 2. Choose 'Raise a ticket'.
3. 3. Type a subject and a description; leave 'Attach diagnostics' on or off.
4. 4. Press 'Raise ticket'.
5. 5. The thread opens with the notice that the team was emailed, or a warning that the email was not sent and a fallback address.
6. 6. Come back later, open the ticket, read replies marked 'Support' and send a reply, or close the ticket.

**What the person sees and gets**

- 'Ticket raised, and the support team has been emailed about it.' or 'Ticket raised and saved, but the email that tells the support team about it was not sent...' (apps/web/features/support/components/SupportTicketsPanel.tsx:43-44).
- Status text per ticket (TICKET_STATUS_MEANING) and priority shown on the web thread (apps/web/features/support/components/SupportTicketsPanel.tsx:294-298).
- Replies from staff are also emailed to the customer (apps/web/lib/support/tickets/service.ts:129-151).

**Settings**

- Diagnostics attach checkbox (web) and switch (mobile), default on.
- No other setting.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: list, open, create, reply, close, paging (50 per page) (apps/web/app/api/support/tickets/route.ts, apps/web/app/api/support/tickets/[ticketId]/route.ts:45-90, packages/contracts/cloud-contracts/src/support.ts:370-372).
- Server: create needs sign-in, anti-forgery token, rate limit 'support-tickets-write', valid body, and a reply email before the ticket is opened (apps/web/app/api/support/tickets/route.ts:46-59).
- Server: priority resolved from the contracted support tier (apps/web/lib/support/tickets/service.ts:159, apps/web/lib/support/handoff/priority.ts:60-98).
- Server: response carries staffNotified; the team is emailed and failures are logged (apps/web/lib/support/tickets/service.ts:109-127).
- Server: reply on a resolved ticket reopens it to 'in_progress'; closed ticket refuses replies (apps/web/lib/support/tickets/service.ts:196-229).
- Mobile: list and ticket screens, create, reply, close, paging, Cloud-only guard (apps/mobile/src/features/support/SupportTicketsScreen.tsx, SupportTicketScreen.tsx, service.ts:77-132).
- Desktop: Help, Support opens the public page (apps/desktop/electron/main.ts:2271-2273).

**Incomplete**

- Staff reply path, escalation and on-call paging exist server-side (apps/web/lib/support/tickets/service.ts:239-310); staff UI not reviewed.
- Empty and loading states exist on web ('You have not raised a ticket yet...', 'Reading your tickets...') (apps/web/features/support/components/SupportTicketsPanel.tsx:508-528).

**Present but disconnected or switched off**

- The desktop menu does not open the ticket list directly; it opens the public support page (apps/desktop/electron/main.ts:2271-2273).

**Not available**

- CLI: no ticket commands found (brief: cli missing).
- VS Code: no ticket list (brief: n/a).
- Chrome: no ticket list found in apps/extension/src (brief: not verified).
- Mobile Local mode: tickets blocked (apps/mobile/src/features/support/SupportTicketsScreen.tsx:55-63).

## 4. Required behaviour

**Established requirements**

- A signed-in user can reach support from the product, describe a problem and follow the replies. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.03)
- Creating a ticket needs a signed-in user, a valid anti-forgery token and a reply email. (source: apps/web/app/api/support/tickets/route.ts:46-59)
- Read and write calls are rate limited ('support-tickets-read' 120 per hour, 'support-tickets-write' 20 per hour; both fail closed). (source: apps/web/lib/rate-limit.ts:816-825)
- Unknown or unmapped support tiers queue as 'normal', and a database failure queues as 'normal'. (source: apps/web/lib/support/handoff/priority.ts:48-56,96-99)

**Acceptance criteria**

1. A signed-out request to POST /api/support/tickets is refused.
2. A request without a valid anti-forgery token is refused and nothing is written.
3. A body with no message is refused with a validation error.
4. A new ticket returns HTTP 201 with ticket and staffNotified.
5. A user can never read another user's ticket (404).
6. A reply to a closed ticket returns the 'This ticket is closed. Raise a new one...' message.
7. A reply to a resolved ticket sets it to In progress.
8. The 21st create in an hour from one user is rate limited.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Replies should show without a page reload loop; the web panel only refreshes on open or after the user's own action (no polling found) [inferred from apps/web/features/support/components/SupportTicketsPanel.tsx:394-470].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the desktop Support menu item open the ticket panel in the app window.
- [proposed] Add a CLI 'tickets' command or a link from the CLI to /support.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/support/tickets | `apps/web/app/api/support/tickets/route.ts` | List and create tickets. |
| endpoint | GET/PATCH /api/support/tickets/[ticketId] | `apps/web/app/api/support/tickets/[ticketId]/route.ts` | Read thread, reply or close. |
| service | Ticket service | `apps/web/lib/support/tickets/service.ts` | openTicket, listTicketsPage, readTicket, replyToTicket, moveTicket, escalateTicket. |
| service | Ticket store | `apps/web/lib/support/tickets/store.ts` | SQL over support_tickets, support_ticket_replies, support_ticket_escalations. |
| service | Support priority | `apps/web/lib/support/handoff/priority.ts` | Maps contracted support tier to urgent/high/normal/low. |
| service | Reply email requirement | `apps/web/lib/auth/email-confirmation.ts` | requireReplyEmail. |
| schema | Support contracts | `packages/contracts/cloud-contracts/src/support.ts` | Paths, request schemas, limits, status labels. |
| table | support_tickets | `apps/web/db/neon/0024_support_tickets.sql` | Ticket rows; diagnostics, support_tier, handoff_session_id added by 0222. |
| table | support_ticket_replies | `apps/web/db/neon/0024_support_tickets.sql` | Thread replies. |
| table | support_ticket_escalations | `apps/web/lib/support/tickets/store.ts` | Escalation rows (SQL at line 216). |
| config | Rate limits support-tickets-read/write | `apps/web/lib/rate-limit.ts` | 120 per hour and 20 per hour. |
| component | SupportTicketsPanel | `apps/web/features/support/components/SupportTicketsPanel.tsx` | Web list, form, thread. |
| service | Web ticket client | `apps/web/features/support/lib/ticket-client.ts` | fetch wrappers with anti-forgery headers. |
| component | HelpSection | `apps/web/features/settings/sections/HelpSection.tsx` | Mounts the panel. |
| screen | Support page | `apps/web/app/support/page.tsx` | Public support channels and 'Raise a ticket' button. |
| command | Desktop openSupport | `apps/desktop/electron/main.ts` | Opens /support externally. |
| screen | Mobile SupportTicketsScreen | `apps/mobile/src/features/support/SupportTicketsScreen.tsx` | List and create. |
| screen | Mobile SupportTicketScreen | `apps/mobile/src/features/support/SupportTicketScreen.tsx` | Thread, reply, close. |
| service | Mobile support service | `apps/mobile/src/features/support/service.ts` | API calls and response parsing. |
| test | tickets routes test | `apps/web/app/api/support/tickets/__tests__/routes.test.ts` | Route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User fills the form; web adds an anti-forgery header, mobile sends its bearer token. | device | apps/web/features/support/lib/ticket-client.ts:53-61, apps/mobile/src/features/support/service.ts:99 |
| Server authenticates, checks anti-forgery (bearer tokens that validate skip it), applies the write rate limit and validates the body. | our servers | apps/web/app/api/support/tickets/route.ts:46-57, apps/web/lib/csrf.ts:190-207 |
| Server requires a reply email, resolves priority from the organisation support contract, redacts and clamps text, inserts the ticket. | our servers | apps/web/app/api/support/tickets/route.ts:59, apps/web/lib/support/tickets/service.ts:159-176 |
| Server emails the support team and returns staffNotified true or false. | outside service | apps/web/lib/support/tickets/service.ts:109-127 (email sender provider is unknown) |
| Client opens the new thread; later reads call GET and show replies. | device and our servers | apps/web/features/support/components/SupportTicketsPanel.tsx:516-521 |
| A staff reply is stored and emailed to the customer. | our servers | apps/web/lib/support/tickets/service.ts:129-151 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Ticket subject, message, reply email, priority, support tier, optional diagnostics | table support_tickets (Neon Postgres) | Server-held; clients read it back through the API | Carried by account export and erasure path (apps/web/db/neon/0222_support_priority_and_diagnostics.sql:97-99 comment); retention period unknown |
| Replies | table support_ticket_replies | Same | Unknown |

**Models and providers.** No model or inference provider takes part. The email sender used for notifications is not identified in the files read.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for every ticket route (apps/web/app/api/support/tickets/route.ts:26,46). Mobile also needs Cloud mode. |
| Permissions | A user reads and changes only their own tickets (getTicketForUser with user id, apps/web/lib/support/tickets/store.ts:155). Staff routes are separate (apps/web/app/api/support/staff). |
| Subscription | No plan gate. Queue priority comes from an organisation billing contract's support tier, not from a self-serve plan (apps/web/lib/support/handoff/priority.ts:79-88). Public support page says only Team and Enterprise carry a stated first-response target (apps/web/app/support/page.tsx:50). |
| Limits and metering | 20 writes and 120 reads per hour per user, both fail closed (apps/web/lib/rate-limit.ts:816-825). Subject 200 characters, message 8,000, 50 tickets per page (packages/contracts/cloud-contracts/src/support.ts:370-372). |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Not available in Local mode on mobile: the screen shows a banner asking to switch to Cloud (apps/mobile/src/features/support/SupportTicketsScreen.tsx:55-63). Mobile About hides 'Contact Support' unless signed in and in Cloud mode but keeps 'Email Support' (apps/mobile/app/(app)/about.tsx:313-330). Web has no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Reading your tickets...' or 'Opening that ticket...' with spinner. | apps/web/features/support/components/SupportTicketsPanel.tsx:505-511 |
| Empty list | 'You have not raised a ticket yet...' | apps/web/features/support/components/SupportTicketsPanel.tsx:525-529 |
| Load error | Alert with 'Try again'. | apps/web/features/support/components/SupportTicketsPanel.tsx:484-495 |
| Paging error | Separate message 'Your older tickets could not be loaded.' | apps/web/features/support/components/SupportTicketsPanel.tsx:435,555-559 |
| Validation failure | Server returns a validation error; the form shows 'That ticket was not raised.' or the server's own sentence. | apps/web/app/api/support/tickets/route.ts:55-57, apps/web/features/support/lib/ticket-client.ts:33-39 |
| Email missing or unconfirmed | Validation error before the ticket opens. | apps/web/lib/auth/email-confirmation.ts:56-66 |
| Support team not notified | Ticket kept; warning with fallback address. | apps/web/features/support/components/SupportTicketsPanel.tsx:44 |
| Closed ticket | No reply form; closing needs confirmation and cannot be undone. | apps/web/features/support/components/SupportTicketsPanel.tsx:46-49,340 |
| Signed out (mobile) | CloudAccountRequired prompt. | apps/mobile/src/features/support/SupportTicketsScreen.tsx:45-53 |
| Offline / timeout | Not handled in the code beyond the generic error messages. | No timeout or offline branch in apps/web/features/support/lib/ticket-client.ts:41-51 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/support/tickets/__tests__/routes.test.ts`: Own-ticket listing, paging, offset refusal, 201 with staffNotified, reply email rules, CSRF stop, validation, 404, closed ticket.
- `apps/web/lib/support/tickets/__tests__/service.test.ts`: Ticket service.
- `apps/web/lib/support/tickets/__tests__/escalation.test.ts`: Escalation.
- `apps/web/lib/support/handoff/__tests__/priority.test.ts`: Priority mapping.
- `apps/web/lib/support/tickets/__tests__/staff-path.test.ts`: Staff path.

**Test scenarios**

- **Raise and read a ticket**
  1. Sign in on web.
  2. Settings, Help, 'Raise a ticket'.
  3. Fill subject and message, press 'Raise ticket'.
  - Expected: Thread opens with the status 'Open' and a notice about the team email.
- **Reply reopens**
  1. Have staff mark a ticket Resolved.
  2. Reply as the user.
  - Expected: Status changes to In progress.
- **Missing email**
  1. Use an account with no confirmed primary email and a token with no email claim.
  2. Raise a ticket.
  - Expected: A validation message asks for an email; no ticket row is made.
- **Mobile Local mode**
  1. Switch the phone app to Local.
  2. Open About.
  - Expected: 'Contact Support' is hidden; 'Email Support' remains.
- **Rate limit**
  1. Create 21 tickets in an hour.
  - Expected: The 21st is refused.

**Where to look when it fails**

- Log lines '[support-ticket] opened', '[support-ticket] support team was not emailed about a new ticket', '[support-ticket] listed', '[support-ticket] read'.
- Tables support_tickets and support_ticket_replies.
- Response field staffNotified.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Desktop Support menu opens the public page, not the tickets list.** Affects: Desktop. Evidence: apps/desktop/electron/main.ts:2271-2273; brief says 'desktop done'. Work needed: Decide whether the menu should open Settings, Help in the app.
- **No CLI ticket path.** Affects: CLI. Evidence: brief S88.03 cli missing. Work needed: Command or a documented link.
- **Chrome extension ticket access not verified.** Affects: Chrome. Evidence: apps/extension/src/options.ts:2040-2045 links only. Work needed: Decide scope.
- **No live refresh of replies.** Affects: Web, mobile. Evidence: no polling in apps/web/features/support/components/SupportTicketsPanel.tsx. Work needed: Optional push or poll; also notification of replies (email exists).
- **Support-tier priority only for contracted organisations; self-serve paid plans have no priority.** Affects: Paid individuals. Evidence: apps/web/lib/support/handoff/priority.ts:79-88. Work needed: Product decision on the AGI Subscription link to support priority.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- api:GET /api/support/tickets
- api:POST /api/support/tickets
- api:GET /api/support/tickets/[ticketId]
- api:PATCH /api/support/tickets/[ticketId]
- table:support_tickets
- table:support_ticket_replies
- table:support_ticket_escalations
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Which email service sends the support-team and customer emails.
- Retention period of ticket rows.
- Whether the Chrome extension should open tickets.
- How staff work the queue in the UI (staff pages not reviewed).
- Whether the desktop app window has any entry that opens Settings, Help directly.
