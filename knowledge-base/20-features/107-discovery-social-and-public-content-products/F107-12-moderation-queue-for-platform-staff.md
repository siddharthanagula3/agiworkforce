---
id: "F107-12"
type: "feature"
title: "Moderation queue for platform staff"
aliases: ["Content report queue", "Rights notices queue", "Copyright notice queue", "Public content takedown", "Trust and safety queue", "Operator dashboard content tab", "Admin console"]
area: "107 Discovery, social, and public-content products"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.23"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "table:content_reports", "table:copyright_notices", "table:shared_sessions", "table:published_artifacts", "api:GET /api/admin/content-reports", "api:POST /api/admin/copyright-notices", "api:POST /api/admin/takedown", "F107-09", "F107-07", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-12 Moderation queue for platform staff

Platform staff review content reports and rights notices in admin screens, record a decision with a note, and unpublish a shared chat or published artifact through a separate takedown action. Every decision writes an audit event. Only platform admins can use it.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.23](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10723).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives operators three tools: a content report queue (Content report queue panel in /admin), a rights-notice queue ('Rights notices' in the /operator content tab), and a takedown panel ('Public content takedown') (apps/web/features/admin/pages/AdminConsolePage.tsx:303; apps/web/features/admin/pages/OperatorDashboardPage.tsx:501-503).

**Why it exists.** Brief S107.23: platform staff review reported public content, decide on it and take it down. Reports need a state and a reviewer, not just a log (apps/web/db/neon/0124_content_report_triage.sql header).

**Who uses it.** Platform administrators only.

**Problems it solves**

- Reports do not sit unread forever.
- An anonymous allegation cannot by itself unpublish someone's content.
- Every removal leaves an audit entry.

**Use cases**

- Claim a harmful-content report and mark it actioned with a note.
- Reject a rights notice.
- Unpublish a shared chat named in a copyright notice.
- Record a notice as unpublished when the copy is already gone.

## 2. User experience

**Where to find it**

- Web: /admin page, section 'Content report queue' (title id content-report-queue-title) (AdminConsolePage.tsx:303; ContentReportQueuePanel.tsx:162-168).
- Web: /operator, tab 'content': 'Rights notices' and 'Public content takedown' (OperatorDashboardPage.tsx:501-503).
- Desktop: shows the hosted web app, so the same screens apply if the admin routes are reachable in its window [inferred; not verified].
- Mobile and CLI: not applicable.

**Before you start**

- Account whose id is on the platform-admin list (environment variable named by PLATFORM_ADMIN_ENV_VAR); others are redirected from /admin to / and get not-found on /admin/plugins (apps/web/app/admin/page.tsx:17-24).

**Screens and controls**

- Report queue: view select Open or Resolved, Refresh, counts 'Awaiting review', 'In review', 'Past SLA', 'Actioned', row buttons Claim, Actioned, Dismissed, reviewer note (ContentReportQueuePanel.tsx:20-24, 150-190).
- Rights notices: toggles 'Waiting' and 'Decided', 'Decision note', buttons 'Unpublish', 'Reject', 'Counter-notice received', 'Show more', Retry (CopyrightNoticeQueuePanel.tsx:166-300).
- Takedown: 'Public link or token', 'Look up', 'Reason, recorded on the audit entry', 'Unpublish' (ContentTakedownPanel.tsx:100-170).

**Journey**

1. Open the console as an admin.
2. Pick a report or notice and read it.
3. Write a note (required to action or dismiss a report; required for every notice decision).
4. Choose the decision and confirm.
5. For Unpublish on a notice: confirm; the takedown route deletes the published copy and the decision is recorded.
6. If nothing is published any more (404), a second dialog 'Record <ref> as unpublished?' records the notice without removing anything.

**What the person sees and gets**

- Status line such as '<ref> is marked unpublished.' (CopyrightNoticeQueuePanel.tsx:109).
- Report line 'Report <id> marked <status>.' (ContentReportQueuePanel.tsx:92-93).
- Takedown result with title and owner id and audit note (ContentTakedownPanel.tsx:172-180).
- Overdue badge 'Past SLA' after 24 hours (content-report-triage.ts:28-30; panel).

**Settings**

- Report review time target: 24 hours (CONTENT_REPORT_SLA_HOURS) (apps/web/lib/server/content-report-triage.ts:28).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET and POST /api/admin/content-reports: list queue and counts; review with status received, in_review, actioned or dismissed; note required for actioned and dismissed; audit security event (apps/web/app/api/admin/content-reports/route.ts:56-125).
- GET and POST /api/admin/copyright-notices: list with cursor and status filter; set disposition actioned, rejected or counter_notified with a note of 1 to 1,000 characters; audit event (apps/web/app/api/admin/copyright-notices/route.ts:28-109).
- GET and POST /api/admin/takedown: look up a token or URL; write a required audit event first, then delete the row from shared_sessions or published_artifacts (apps/web/app/api/admin/takedown/route.ts:46-130).
- Owner routes stay owner-only; takedown is a separate admin path (takedown/route.ts:20-27).
- All routes use CSRF for writes, a rate limit of 10 per minute and requirePlatformAdmin (route files above; rate-limit.ts:414-416).
- Panel: when takedown returns 404, a separate confirmation records the notice without removal (CopyrightNoticeQueuePanel.tsx:132-157).

**Incomplete**

- Takedown audit is required before delete, but the notice disposition and the takedown are two separate calls from the panel: if the takedown succeeds and the disposition write fails, the notice stays 'waiting' (CopyrightNoticeQueuePanel.tsx:126-163) [inferred].
- The harmful-content report queue has no link from a report to its content: the panel only points to the takedown control and asks staff to paste the share link (ContentReportQueuePanel.tsx:132-142).
- The draft says the 'reviewed' status for reports; the real statuses are in_review, actioned, dismissed.
- Takedown deletes the row, so it cannot be restored from the console (ContentTakedownPanel.tsx:74-80).

**Present but disconnected or switched off**

- Desktop admin screens: no desktop-specific code found; availability depends on the hosted app window (unknown).

**Not available**

- Mobile, CLI, VS Code, Chrome: not applicable.
- Notifying the reporter of the decision: none found (reviewer note is not returned to the reporter, 0124 migration comment).

## 4. Required behaviour

**Established requirements**

- Platform staff review reported public content in a dashboard, decide on it and take content down. (source: brief S107.23)
- Only platform admins can read the queues or change decisions; each decision is audited; unpublishing is a separate operator-only action; the owner's own unpublish route stays owner-only. (source: apps/web/app/api/admin/takedown/route.ts:20-27; content-reports/route.ts:56-125)
- A destructive action asks first and names the consequence. (source: AGENTS.md section 9 (doc); ContentTakedownPanel.tsx:74-80)

**Acceptance criteria**

1. A non-admin gets a refusal on all three admin routes and is redirected from /admin.
2. Resolving a content report as actioned or dismissed with an empty note is refused.
3. Each decision on a report, notice or takedown creates an admin_action security event.
4. Unpublish on a notice deletes the share or artifact, so /share/<token> shows unavailable.
5. With the copy already gone, the panel offers 'Record as unpublished' and removes nothing.
6. Rights notices page across 'Waiting' and 'Decided' filters, and 'Show more' loads the next page.
7. A report older than 24 hours still open shows Past SLA.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The 'Past SLA' counts come from the same 24-hour constant [inferred].

**Proposed improvements** (suggestions, not requirements)

- Link a report row straight to the takedown look-up with the share token prefilled [proposed].
- Make notice decision and takedown one server transaction [proposed].
- Tell the reporter the outcome [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | /api/admin/content-reports | `apps/web/app/api/admin/content-reports/route.ts` | Queue read and review. |
| service | content-report-triage | `apps/web/lib/server/content-report-triage.ts` | Statuses, SLA, queue read, counts, review. |
| endpoint | /api/admin/copyright-notices | `apps/web/app/api/admin/copyright-notices/route.ts` | Notice list and disposition. |
| service | copyright-notices | `apps/web/lib/server/copyright-notices.ts` | Notice records, list, disposition, cursor. |
| endpoint | /api/admin/takedown | `apps/web/app/api/admin/takedown/route.ts` | Look up and unpublish. |
| service | public-target | `apps/web/app/api/admin/takedown/lib/public-target.ts` | Normalises token or URL; finds shared session or published artifact. |
| endpoint | POST /api/copyright-notice | `apps/web/app/api/copyright-notice/route.ts` | Public intake that records a notice and removes nothing. |
| screen | Copyright report page | `apps/web/app/copyright/report/page.tsx` | Public notice form (with CopyrightNoticeForm.tsx). |
| component | ContentReportQueuePanel | `apps/web/features/admin/components/ContentReportQueuePanel.tsx` | Report queue UI. |
| component | CopyrightNoticeQueuePanel | `apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx` | Rights notices UI with confirmations. |
| component | ContentTakedownPanel | `apps/web/features/admin/components/ContentTakedownPanel.tsx` | Takedown look-up and unpublish UI. |
| screen | AdminConsolePage | `apps/web/features/admin/pages/AdminConsolePage.tsx` | Mounts the report queue. |
| screen | OperatorDashboardPage | `apps/web/features/admin/pages/OperatorDashboardPage.tsx` | Mounts notices and takedown on tab content. |
| screen | Admin page gate | `apps/web/app/admin/page.tsx` | Redirects non-platform-admins. |
| table | content_reports | `apps/web/db/neon/0124_content_report_triage.sql` | Triage columns. |
| table | copyright_notices | `apps/web/db/neon/0122_copyright_notices.sql` | Notices table (type column added in 0312). |
| table | shared_sessions | `apps/web/db/neon/0051_shared_sessions.sql` | Deleted by takedown for chats. |
| event | admin_action security event | `apps/web/lib/security-audit.ts` | Audit record written by each decision (imported by the routes). |
| config | admin-security rate limit | `apps/web/lib/rate-limit.ts` | 10 per minute. |
| test | takedown route test | `apps/web/app/api/admin/takedown/__tests__/route.test.ts` | Takedown tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Admin opens the panel; browser fetches the queue with a session token. | device and our servers | ContentReportQueuePanel.tsx:46-65 |
| Server checks admin identity, rate limit, reads rows. | our servers | content-reports/route.ts:56-70 |
| Admin writes a note and picks a decision; browser posts with a CSRF header. | device and our servers | ContentReportQueuePanel.tsx:76-97; CopyrightNoticeQueuePanel.tsx:55-61 |
| For Unpublish, panel posts takedown first; server writes a required audit event, then deletes the row. | our servers | takedown/route.ts:82-118 |
| Panel then posts the notice disposition; server updates the notice and writes an audit event. | our servers | copyright-notices/route.ts:82-104 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Report status, reviewer id, note, review time | table content_reports | Server only | Kept after resolution; reviewer id is plain text so reviewer deletion does not erase it (0124 header) |
| Notice status and disposition note | table copyright_notices | Server only | Kept; exact retention unknown |
| Audit event with reporter id, note or reason, token and owner id | security events (logSecurityEvent) | Server only | unknown |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in platform admin. |
| Permissions | requirePlatformAdmin on all three routes; org admin or owner role is not enough (apps/web/app/admin/page.tsx:17-24). |
| Subscription | none found in the code |
| Limits and metering | 10 admin security actions per minute; notice note up to 1,000 characters; takedown reason up to 1,000; report note up to 2,000; list limit parameter positive integer (route files). |
| Feature flags | Platform admin list is set by an environment variable (PLATFORM_ADMIN_ENV_VAR); value not recorded here. |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | Operator screens call our servers; they do not exist in a Local-only mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner 'Loading notices'; report counts show an ellipsis. | CopyrightNoticeQueuePanel.tsx:213-217; ContentReportQueuePanel.tsx:185 |
| Empty | 'No notice is waiting for a decision.' / 'No notice is decided yet.' | CopyrightNoticeQueuePanel.tsx:233-237 |
| Error and retry | Alert with Retry; report panel shows alert and Refresh. | CopyrightNoticeQueuePanel.tsx:218-232; ContentReportQueuePanel.tsx:166-180 |
| Missing note | 'Write a note first...' for notices; 'A reviewer note is required...' for reports. | CopyrightNoticeQueuePanel.tsx:166-172; ContentReportQueuePanel.tsx:77-80 |
| Already gone | 404 from takedown triggers the record-only confirmation. | CopyrightNoticeQueuePanel.tsx:132-157 |
| Stale loads | Report panel ignores responses from older requests. | ContentReportQueuePanel.tsx:46-65 |
| Offline, timeout | not handled in the code beyond generic load error | panels |
| Accessibility | Sections have labelled headings; status messages use role status or alert. | CopyrightNoticeQueuePanel.tsx:176, 205 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/admin/content-reports/__tests__/route.test.ts`: Report queue route.
- `apps/web/app/api/admin/copyright-notices/__tests__/route.test.ts`: Notice route.
- `apps/web/app/api/admin/takedown/__tests__/route.test.ts`: Takedown route.
- `apps/web/features/admin/components/ContentReportQueuePanel.test.tsx`: Report panel.
- `apps/web/features/admin/components/CopyrightNoticeQueuePanel.test.tsx`: Notice panel.
- `apps/web/features/admin/components/ContentTakedownPanel.test.tsx`: Takedown panel.
- `apps/web/lib/server/__tests__/content-report-triage.test.ts`: Triage service.
- `apps/web/__tests__/security/platform-admin-routes.test.ts`: Admin route gating (mentions content reports).
- `apps/web/db/neon/copyright-notices-migration.test.ts`: Notices migration.

**Test scenarios**

- **Non-admin refused**
  1. Call GET /api/admin/content-reports as an ordinary user.
  - Expected: Refused; /admin redirects to /.
- **Resolve a report**
  1. File a report (F107-09).
  2. Open the queue, claim, then mark actioned with a note.
  - Expected: Status actioned, reviewer id and time set, audit event written.
- **Empty note**
  1. Press Actioned with no note.
  - Expected: Refused with the note message.
- **Unpublish via notice**
  1. File a notice for a share link.
  2. Press Unpublish and confirm.
  - Expected: The share link stops resolving; notice shows Unpublished.
- **Already removed**
  1. Revoke the share as owner.
  2. Press Unpublish on its notice.
  - Expected: Record-only dialog; nothing is deleted.
- **Takedown look-up**
  1. Paste a full /share URL.
  - Expected: Kind, title, owner shown; invalid text refused.

**Where to look when it fails**

- Log lines 'Failed to read content report queue', 'Failed to record content report review', 'Admin takedown failed' (route files).
- Security events with details.action content_report_review, content_notice_disposition, public_content_takedown.
- Tables content_reports, copyright_notices, shared_sessions, published_artifacts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/web/107-discovery-social-and-public-content-products.md)
- Desktop: [70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md)

## 10. Gaps and dependencies

- **Notice decision and takedown are two calls, so a partial result can leave a notice undecided.** Affects: Operators. Evidence: CopyrightNoticeQueuePanel.tsx:126-163. Work needed: Make atomic or add recovery text.
- **Reports do not link to the reported content in the queue.** Affects: Operators. Evidence: ContentReportQueuePanel.tsx:132-142. Work needed: Prefill takedown from the subject.
- **No notice to the reporter.** Affects: Reporters. Evidence: 0124 migration comment. Work needed: Product decision.
- **Desktop availability of admin screens unverified.** Affects: Desktop operators. Evidence: no desktop code found. Work needed: Check in the running app.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- table:content_reports
- table:copyright_notices
- table:shared_sessions
- table:published_artifacts
- api:GET /api/admin/content-reports
- api:POST /api/admin/copyright-notices
- api:POST /api/admin/takedown
- F107-09
- F107-07
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-observability-and-operations

## Unknown

- Whether the Electron desktop window can reach /admin and /operator.
- Retention of copyright_notices rows and security events.
- Whether the takedown row deletion also covers copies cached elsewhere.
- Contents of the 0172 row-security migration and of setCopyrightNoticeDisposition's allowed transitions (not opened).
