---
id: "F088-09"
type: "feature"
title: "Reports and appeals (content, copyright, safety refusal, suspension)"
aliases: ["Report this response", "Report issue", "Report an incorrect refusal", "Content report", "ReportFlagButton", "Copyright notice", "/copyright/report", "Impersonation report", "Appeal this suspension", "Suspension appeal", "/appeal", "Content-reporting flow (S88.18)", "Copyright reporting (S88.19)", "Safety-warning appeal (S88.20)", "Account-suspension appeal (S88.21)"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S88.18", "S88.19", "S88.20", "S88.21"]
depends_on: ["SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "surface:web", "surface:mobile", "table:content_reports", "table:copyright_notices", "table:support_tickets"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-09 Reports and appeals (content, copyright, safety refusal, suspension)

Four ways to push back. A person can report a harmful answer, report copyright, trademark or impersonation on shared content, appeal an answer refused for safety, or appeal an account suspension. Each goes to a stored queue or a support ticket. A copyright notice never takes content down by itself.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.18](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8818), [S88.19](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8819), [S88.20](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8820), [S88.21](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8821).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores reports in content_reports and copyright_notices, stores safety-refusal appeals as feedback, and turns suspension appeals into support tickets that the user can follow. (apps/web/app/api/mobile/content-report/route.ts:95; apps/web/app/api/copyright-notice/route.ts:213; apps/web/app/api/feedback/route.ts:37; apps/web/lib/support/tickets/appeals.ts:42-67)

**Why it exists.** Store policy for generated content needs an in-app report mechanism (stated in the mobile service header); the product publishes shared pages and needs a notice route; people refused or suspended need a human review. (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:3-6; doc: docs/decisions/wire-or-cut.md:359-361)

**Who uses it.** Chat users, rights holders and impersonated people (no account needed), refused users, suspended account owners, and trust and safety staff. (apps/web/app/api/copyright-notice/route.ts:31-35)

**Problems it solves**

- Web had no way to report a harmful answer.
- Rights holders had no notice route.
- A refusal complaint had no path.
- A suspended user could not reach anyone.

**Use cases**

- Web: message actions menu, "Report this response". (apps/web/features/chat/components/messages/MessageBubble.tsx:4072)
- Web: refusal notice button "Report issue", dialog "Report an incorrect refusal". (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:239; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:251)
- Web: /copyright/report notice form with a typed-name signature. (apps/web/app/copyright/report/CopyrightNoticeForm.tsx:444)
- Web: /appeal or the suspended notice; mobile sign-in error button "Appeal this suspension". (apps/web/features/auth/SuspensionAppeal.tsx:186; apps/mobile/src/features/auth/components/MobileSignIn.tsx:739)

## 2. User experience

**Where to find it**

- Web and Desktop window: assistant message actions menu item "Report this response" (shows "Reporting…" then "Reported"). (apps/web/features/chat/components/messages/MessageBubble.tsx:4072)
- Web and Desktop window: under a refused last answer, "The model declined to finish this response for safety reasons." with "Report issue" and "Retry". (apps/web/features/chat/components/messages/ChatMessageList.tsx:1971-1974; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:239)
- Web and Desktop window: /copyright/report (also reachable from /copyright). (apps/web/app/copyright/report/page.tsx:60-79)
- Web and Desktop window: /appeal and the suspended-account notice titled "This account is suspended" with button text "Appeal this suspension". (apps/web/lib/auth/account-status.ts:39; apps/web/features/auth/AccountAccessNotice.tsx:35)
- Mobile: flag button labelled "Report" under assistant turns; refusal banner secondary action "Report" (accessible name "Report this refusal as incorrect"). (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:127; apps/mobile/src/features/chat/components/MessageBubble.tsx:2946)
- Mobile: on the sign-in error for a suspended account, a button "Appeal this suspension" opens the web /appeal page in the in-app browser; there is no native appeal form. (apps/mobile/src/features/auth/components/MobileSignIn.tsx:735-751; apps/mobile/src/features/auth/components/authErrorMessage.ts:6-8)
- CLI, VS Code, Chrome: missing per brief.

**Before you start**

- Content report: no sign-in required. (apps/web/app/api/mobile/content-report/route.ts:12-17)
- Copyright notice: no account; the URL must be a shared conversation or published artifact on this site. (apps/web/app/api/copyright-notice/route.ts:196-209)
- Safety appeal on web: message id and finish reason are required. (apps/web/app/api/feedback/route.ts:187-203)
- Suspension appeal: signed in as a suspended account, or the suspended account's email when signed out. (apps/web/app/api/support/appeal/route.ts:45-107)

**Screens and controls**

- Web report is one click: no reason picker; category is fixed to harmful and the note is empty. (apps/web/features/chat/components/messages/MessageBubble.tsx:1170-1185)
- Mobile report sheet: six categories (Harmful or dangerous, Inaccurate or misleading, Offensive or hateful, Misinformation, Privacy concern, Other), note box, "Send" or "Save report", "Email this report to support". (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:42-48)
- Copyright form: type (copyright, trademark, impersonation), content URL, name, email, phone and address (required unless impersonation), rights holder, work description, statements, typed-name signature. (apps/web/app/api/copyright-notice/route.ts:39-66)
- Appeal form: signed-out email field labelled "Email address of the suspended account"; message label "Why should the suspension be lifted?" (or "Add to your appeal"); button "Submit appeal" or "Send". (apps/web/features/auth/SuspensionAppeal.tsx:133-186)

**Journey**

1. Report: open the message menu, choose Report this response, see toast "Reported. Thank you: our trust and safety team will review it." (apps/web/features/chat/components/messages/MessageBubble.tsx:1189)
2. Safety appeal: click Report issue, describe why it should have been allowed, send, see "Thanks, your report was recorded." (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:269)
3. Copyright: fill the form, submit, read the reference starting IP- and the note that nothing has been removed yet. (apps/web/app/api/copyright-notice/route.ts:88-93; apps/web/app/copyright/report/CopyrightNoticeForm.tsx:218)
4. Suspension signed in: open the notice, read thread "Reference <id> · <status>", add messages. (apps/web/features/auth/SuspensionAppeal.tsx:46-52)
5. Suspension signed out: enter email and message; see "If that address belongs to a suspended account, your appeal is recorded and a receipt with its reference is on its way there." (apps/web/features/auth/SuspensionAppeal.tsx:104-109)

**What the person sees and gets**

- Content report API returns success true. (apps/web/app/api/mobile/content-report/route.ts:122)
- Copyright API returns reference, noticeType, kind, operatorNotified. (apps/web/app/api/copyright-notice/route.ts:241-246)
- Mobile shows outcome text such as "Your report was sent to the AGI safety team for review." or "Saved on this device. Nothing was sent." (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:55-60)

**Settings**

- none found in the code for user settings.
- Bot challenge endpoint registration for the signed-out appeal. (apps/web/lib/security/bot-challenge-routes.ts:12)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web alias route re-exports the mobile handler so web and mobile share one schema, rate limit and idempotency key. (apps/web/app/api/content-report/route.ts:1-14; doc: docs/decisions/wire-or-cut.md:361)
- Report insert is idempotent on the client report id and records source web or mobile plus asset, shared item and subject. (apps/web/app/api/mobile/content-report/route.ts:90-118)
- Copyright route validates, resolves the URL to a published target, records the notice, writes a high-severity security event, emails operators and states that nothing is unpublished. (apps/web/app/api/copyright-notice/route.ts:189-246)
- Notice types copyright, trademark, impersonation are stored in notice_type. (apps/web/db/neon/0312_content_notice_type.sql:15-19)
- Safety appeal posts to /api/feedback with context safety_refusal and stores it in public.feedback. (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166-183; apps/web/app/api/feedback/route.ts:37-38)
- Suspension appeal: GET returns the latest appeal thread; POST files one; signed-out path needs a human check and runs after the response. (apps/web/app/api/support/appeal/route.ts:36-108)
- A signed-out appeal always answers 202 received, whether or not an account matched. (apps/web/app/api/support/appeal/route.ts:89-108; apps/web/lib/support/tickets/appeals.ts:78-86)
- Signed-out appeal sends a receipt email to the account address; staff replies are emailed to the ticket owner. (apps/web/lib/support/tickets/appeals.ts:88-100; apps/web/lib/support/tickets/service.ts:129-137)
- Staff are emailed when a new ticket opens. (apps/web/lib/support/tickets/service.ts:109-127)
- Mobile report sheet with offline copy, queue and consent. (apps/mobile/services/contentReport.ts:1-35)
- Mobile refusal Report opens the feedback screen with the safety appeal context. (apps/mobile/src/features/chat/components/MessageBubble.tsx:2946-2953; apps/mobile/src/features/feedback/index.tsx:67)
- Admin routes list content reports and copyright notices. (apps/web/app/api/admin/content-reports/route.ts; apps/web/app/api/admin/copyright-notices/route.ts)

**Incomplete**

- Web report has no reason choice or note; every web report is category harmful. (apps/web/features/chat/components/messages/MessageBubble.tsx:1182)
- Copyright and impersonation reports cover only shared conversations and published artifacts, not chat text or uploaded files. (apps/web/app/api/copyright-notice/route.ts:196-209)
- Takedown is a separate admin action; no automatic action. (apps/web/app/api/copyright-notice/route.ts:28-37)

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- CLI, VS Code and Chrome for all four. (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md)
- Mobile native suspension appeal form (link-out only). (apps/mobile/src/features/auth/components/MobileSignIn.tsx:735-751)
- Mobile copyright report: no link found in the files read. unknown

## 4. Required behaviour

**Established requirements**

- A user can report a harmful or problematic response from where it appears, and it reaches moderation. (source: S88.18 brief Should line)
- Anyone can report copyright infringement or impersonation in hosted content and get a reference. (source: S88.19 brief Should line)
- When a response is refused for safety, the user can appeal or report it from that notice. (source: S88.20 brief Should line)
- A suspended user is told why and can appeal from where they are blocked, with a way to follow it. (source: S88.21 brief Should line)
- Web report is an alias of the mobile route with one handler. (source: doc: docs/decisions/wire-or-cut.md:361)
- Notices never remove content; removal is the admin takedown route. (source: apps/web/app/api/copyright-notice/route.ts:28-33)

**Acceptance criteria**

1. Posting a web report creates a content_reports row with metadata source web.
2. Posting the same reportId twice creates one row.
3. A copyright notice for a URL that resolves to nothing returns not found and stores nothing.
4. A copyright notice returns a reference starting IP- and the target stays published.
5. A signed-in suspended user's appeal creates one ticket with the appeal subject; a second message appends to it while open.
6. A signed-out appeal returns 202 for a matching and a non-matching email alike.
7. Safety appeal without message id or finish reason is rejected.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web users should be able to choose a reason and add a note, as mobile users can. [inferred]
- Mobile should have a native appeal. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a reason list and note to the web report.
- [proposed] Add a native mobile appeal thread.
- [proposed] Link copyright reporting from mobile shared items.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble report action | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Web Report this response. |
| endpoint | POST /api/content-report | `apps/web/app/api/content-report/route.ts` | Alias of the mobile handler. |
| endpoint | POST /api/mobile/content-report | `apps/web/app/api/mobile/content-report/route.ts` | Validates and inserts reports. |
| table | content_reports | `apps/web/db/neon/0093_content_reports.sql` | Report store; later triage and RLS migrations 0124 and 0172. |
| component | ReportFlagButton | `apps/mobile/src/features/chat/components/ReportFlagButton.tsx` | Mobile report sheet. |
| service | contentReport | `apps/mobile/services/contentReport.ts` | Device copy, upload, queue, mail hand-off. |
| component | ChatMessageList refusal notice | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Shows the refusal card with Report issue. |
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Safety-appeal variant of the feedback dialog. |
| endpoint | POST /api/feedback | `apps/web/app/api/feedback/route.ts` | Stores safety refusal appeals in public.feedback. |
| endpoint | POST /api/mobile/feedback | `apps/web/app/api/mobile/feedback/route.ts` | Mobile feedback with safety_refusal context. |
| screen | mobile feedback screen | `apps/mobile/src/features/feedback/index.tsx` | Receives the appeal parameters. |
| screen | Copyright report page and form | `apps/web/app/copyright/report/CopyrightNoticeForm.tsx` | Notice form. |
| endpoint | POST /api/copyright-notice | `apps/web/app/api/copyright-notice/route.ts` | Intake, record, alert. |
| table | copyright_notices | `apps/web/db/neon/0122_copyright_notices.sql` | Notice store; notice_type added by 0312. |
| service | copyright-notices | `apps/web/lib/server/copyright-notices.ts` | recordCopyrightNotice and types. |
| endpoint | /api/support/appeal | `apps/web/app/api/support/appeal/route.ts` | Read and file suspension appeals. |
| service | appeals | `apps/web/lib/support/tickets/appeals.ts` | Suspended-profile lookup, ticket open or append, receipt email. |
| service | tickets service | `apps/web/lib/support/tickets/service.ts` | openTicket, staff notification, staff reply email. |
| component | SuspensionAppeal | `apps/web/features/auth/SuspensionAppeal.tsx` | Appeal form and thread. |
| screen | Appeal page | `apps/web/app/appeal/page.tsx` | Signed-out appeal page. |
| component | MobileSignIn appeal button | `apps/mobile/src/features/auth/components/MobileSignIn.tsx` | Opens the web appeal page. |
| table | support_tickets | `apps/web/db/neon/0024_support_tickets.sql` | Appeal tickets and replies. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web posts the report with a CSRF token and generated report id. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:1174-1186 |
| Server checks CSRF and the mobile-content-report rate limit, validates, inserts or ignores a duplicate. | our servers | apps/web/app/api/mobile/content-report/route.ts:77-118 |
| Mobile saves the report on the device first, then tries the server; offline or Local mode keeps it on the device and asks consent before one send. | device and our servers | apps/mobile/services/contentReport.ts:1-35 |
| Copyright intake resolves the URL, records the notice, logs a security event, emails operators. | our servers | apps/web/app/api/copyright-notice/route.ts:189-246 |
| Operator and appeal receipt emails go through the email provider. | outside service | apps/web/app/api/copyright-notice/route.ts:20-21; apps/web/lib/support/tickets/appeals.ts:88-100 |
| Signed-in appeal opens or appends to a ticket with the appeal subject and emails staff. | our servers | apps/web/lib/support/tickets/appeals.ts:42-76; apps/web/lib/support/tickets/service.ts:158-178 |
| Signed-out appeal passes a bot challenge, then files after the response is sent. | our servers | apps/web/app/api/support/appeal/route.ts:80-99 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Content report: ids, category, excerpt (500 chars), note (2000), metadata, optional user id | Table content_reports (apps/web/app/api/mobile/content-report/route.ts:95-105) | Server; mobile also keeps a device copy | Retention unknown |
| Mobile report copy | Device key content-reports:v1, capped at 100 non-queued (apps/mobile/services/contentReport.ts:92-95) | Uploaded when accepted | clearContentReports removes it |
| Copyright notice with reporter name, email, target kind and token, owner id, statement | Table copyright_notices (apps/web/app/api/copyright-notice/route.ts:213-224) | Server only | Retention unknown |
| Safety appeal text and context | Table feedback (apps/web/app/api/feedback/route.ts:37-38) | Server only | Retention unknown |
| Appeal ticket and replies | Tables support_tickets and support_ticket_replies (apps/web/db/neon/0024_support_tickets.sql:9) | Server; user reads through the thread | Retention unknown |

**Models and providers.** No model or provider is used to decide any report or appeal; a person reviews them. (apps/web/features/auth/SuspensionAppeal.tsx:178) The refusal that triggers the appeal comes from the chat turn and carries a finish reason (SYS-chat-turn-pipeline). (apps/web/features/chat/components/messages/ChatMessageList.tsx:1396-1403)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Content report, copyright notice and signed-out appeal need no account; signed-in appeal needs a suspended account. (apps/web/app/api/mobile/content-report/route.ts:12-17; apps/web/app/api/support/appeal/route.ts:28-34) |
| Permissions | Suspended callers are read by a special lookup that accepts suspended users; staff read tickets through staff routes. (apps/web/app/api/support/appeal/route.ts:21-26) |
| Subscription | none found in the code. |
| Limits and metering | Rate limits: mobile-content-report, waitlist (copyright), feedback, support-tickets-write, support-tickets-read, support-handoff-create. Note limits: 2000 characters, excerpt 500. (apps/web/app/api/mobile/content-report/route.ts:55-57; apps/web/app/api/copyright-notice/route.ts:85; apps/web/app/api/feedback/route.ts:385; apps/web/app/api/support/appeal/route.ts:51-54) |
| Feature flags | none found in the code. |
| Model compatibility | Safety appeal works for a refusal or content-filter finish reason on any model. (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:20-34) |
| Provider restrictions | none found in the code. |
| Local mode | Mobile: reporting works in Local mode by saving on the device; sending needs a per-report consent because the egress guard refuses our servers. (apps/mobile/services/contentReport.ts:14-22) Web and the other apps: no Local-mode rule found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Report sending | Menu item shows "Reporting…" and is disabled; failure resets to idle with toast "Could not send the report. Please try again." | apps/web/features/chat/components/messages/MessageBubble.tsx:1190-1193; apps/web/features/chat/components/messages/MessageBubble.tsx:4069-4072 |
| Duplicate report | Ignored by the unique client report id. | apps/web/app/api/mobile/content-report/route.ts:106 |
| Storage fails | 500 "Failed to submit content report". | apps/web/app/api/mobile/content-report/route.ts:119-122 |
| Copyright URL not ours | 400 "That is not a shared conversation or published artifact URL from this site". | apps/web/app/api/copyright-notice/route.ts:196-201 |
| Copyright target gone | 404 "Nothing is published at that URL any more". | apps/web/app/api/copyright-notice/route.ts:204-209 |
| Operator email undeliverable | Notice is kept; operatorNotified false; page tells the sender to email the IP contact. | apps/web/app/api/copyright-notice/route.ts:160-186; apps/web/app/copyright/report/CopyrightNoticeForm.tsx:228 |
| Suspended account has no email | Validation error "This account has no email address support can reply to." | apps/web/app/api/support/appeal/route.ts:73-78 |
| Signed-out without email | Validation error asking for the suspended account's email. | apps/web/app/api/support/appeal/route.ts:84-86 |
| Appeal load fails | Alert text from the error or "Your appeal could not be loaded." | apps/web/features/auth/SuspensionAppeal.tsx:75-80 |
| Appeal open | Form becomes "Add to your appeal" and appends to the open ticket. | apps/web/lib/support/tickets/appeals.ts:42-56 |
| Mobile offline report | Stored on device, queued for upload after consent, flushed when connectivity returns. | apps/mobile/services/contentReport.ts:280-330 |
| Accessibility | Appeal errors use role alert; mobile controls carry accessibility labels. | apps/web/features/auth/SuspensionAppeal.tsx:174-176; apps/mobile/src/features/chat/components/ReportFlagButton.tsx:122 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/mobile/content-report/__tests__/route.test.ts`: Signed-in and anonymous reports, web source, idempotency, invalid category, asset, shared item, subject, size limits.
- `apps/web/app/api/content-report/__tests__/route.test.ts`: The alias route.
- `apps/web/lib/server/copyright-notices.test.ts`: Recording copyright notices.
- `apps/web/db/neon/copyright-notices-migration.test.ts`: The copyright notices migrations.
- `apps/web/lib/support/tickets/__tests__/appeals.test.ts`: Latest appeal found by subject; none when never raised.
- `apps/web/__tests__/security/account-enumeration.test.ts`: Mentions the appeal route in the enumeration check.
- `apps/web/features/admin/components/ContentReportQueuePanel.test.tsx`: Admin queue for content reports.
- `apps/web/lib/server/__tests__/content-report-triage.test.ts`: Report triage.

**Test scenarios**

- **Report a response**
  1. Open a chat
  2. Message menu, Report this response
  3. Query content_reports
  - Expected: Toast shown; one row, source web, category harmful.
- **Safety appeal**
  1. Trigger a refusal
  2. Click Report issue
  3. Send text
  - Expected: Dialog title Report an incorrect refusal; feedback row with safety_refusal context.
- **Copyright notice**
  1. Publish an artifact
  2. Open /copyright/report with its URL
  3. Fill, tick statements, sign, submit
  - Expected: Reference IP-...; copyright_notices row; artifact still public.
- **Signed-out appeal**
  1. Sign out
  2. Open /appeal
  3. Enter a suspended account's email and text
  4. Submit
  - Expected: Status message shown; ticket created; receipt email; same message for a random email.
- **Signed-in appeal follow-up**
  1. Sign in as a suspended user
  2. Submit appeal
  3. Have staff reply
  - Expected: Thread shows the reply with Support label; email sent to the user.
- **Mobile offline report**
  1. Turn on Local mode or airplane mode
  2. Report a message
  3. Agree to send later
  4. Go online
  - Expected: Device copy kept, text says nothing was sent, then queued and sent.

**Where to look when it fails**

- Logs: "Failed to store content report", "[support-appeal] a signed-out appeal could not be filed", "[support-appeal] appellant was not emailed a receipt", event copyright_notice_alert_undeliverable. (apps/web/app/api/mobile/content-report/route.ts:119; apps/web/app/api/support/appeal/route.ts:96; apps/web/lib/support/tickets/appeals.ts:95-98; apps/web/app/api/copyright-notice/route.ts:176)
- Audit event types support_appeal_submitted and content_notice. (apps/web/app/api/support/appeal/route.ts:63; apps/web/app/api/copyright-notice/route.ts:226)
- Tables content_reports, copyright_notices, feedback, support_tickets.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Web report has no reason or note.** Affects: Web and the Desktop window. Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:1182. Work needed: Add a small reason step; keep one-click default.
- **Brief says mobile suspension appeal is missing, yet a link-out exists.** Affects: Mobile; knowledge base. Evidence: apps/mobile/src/features/auth/components/MobileSignIn.tsx:735-751. Work needed: Correct the brief; decide if a native thread is needed.
- **Signed-in appeal sends no receipt email to the user; only the signed-out path does. The first draft said both.** Affects: Signed-in suspended users. Evidence: apps/web/lib/support/tickets/appeals.ts:69-99. Work needed: Decide if a receipt is wanted; staff replies are emailed regardless.
- **Copyright and impersonation cover shared and published URLs only.** Affects: Rights holders about other content. Evidence: apps/web/app/api/copyright-notice/route.ts:196-209. Work needed: Product decision on other content.
- **No route test for /api/support/appeal and no test for the copyright route found.** Affects: Quality. Evidence: apps/web/app/api/support/appeal contains only route.ts; search of test files. Work needed: Add route tests.
- **CLI, VS Code and Chrome have none of the four.** Affects: Those apps. Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md. Work needed: Decide scope.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- surface:web
- surface:mobile
- table:content_reports
- table:copyright_notices
- table:support_tickets

## Unknown

- Who moderates the queues and the time targets.
- Retention of reports, notices and appeal tickets.
- Where the mobile feedback route stores a safety appeal (route read only to its schema).
- Whether mobile links to the copyright report page.
- How Desktop handles the suspended notice in its window (inferred from hosted web).
