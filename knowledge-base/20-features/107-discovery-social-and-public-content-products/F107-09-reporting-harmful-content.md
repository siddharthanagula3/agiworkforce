---
id: "F107-09"
type: "feature"
title: "Reporting harmful content"
aliases: ["Report this response", "Content report", "GenAI content report", "Report sheet", "Flag button", "Report infringement or impersonation (separate copyright form)"]
area: "107 Discovery, social, and public-content products"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S107.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local", "table:content_reports", "api:POST /api/mobile/content-report", "api:POST /api/content-report", "store:mmkv", "F107-12", "SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F107-09 Reporting harmful content

People can report an AI answer or a shared item. On web, a menu item sends a report at once with category harmful. On mobile, a sheet lets the person choose a category and add a note; the report is sent to our servers, kept on the device if sending fails, and can also be emailed.

Area: [107. Discovery, social, and public-content products](README.md). Requirement items: [S107.15](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md#s10715).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collects reports of harmful, inaccurate, offensive, misinformation, privacy or other content into one server table, content_reports, with a client ID so a repeat send does not create a second row (apps/web/app/api/mobile/content-report/route.ts:38-124; apps/web/db/neon/0093_content_reports.sql).

**Why it exists.** Brief S107.15: a viewer can report a public page or AI answer and the report reaches operators. The database note says the Google Play generative-AI policy requires an in-app flag whose reports reach the operator (apps/web/db/neon/0093_content_reports.sql:1-12).

**Who uses it.** Any reader of an AI answer on web, desktop (hosted web) or mobile; the report is read by platform staff (F107-12).

**Problems it solves**

- Harmful AI output can be flagged.
- A report made offline or in Local mode is not lost.
- Rights claims have a separate path so they are not mixed in.

**Use cases**

- A web user flags an answer from the message menu.
- A mobile user picks 'Privacy concern' and adds a note.
- A mobile user flags a chat shared with them in a workspace.
- A rights holder uses the footer link on a share page to file a notice.

## 2. User experience

**Where to find it**

- Web (and desktop, which shows the hosted web app [inferred]): message more-menu on an AI answer, item 'Report this response' (apps/web/features/chat/components/messages/MessageBubble.tsx:4062-4073).
- Mobile: flag button labelled 'Report' under assistant turns and in the Library viewer; opens a sheet titled 'Report this response' or 'Report this item' / 'Report this <image or video>' (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:105-127).
- Mobile shared items: Shared with you, row more-button, 'Report' (SharedWithYouScreen.tsx:243-248).
- Web share page footer: 'Report infringement or impersonation' goes to /copyright/report (ReportContentLink.tsx:15-20).
- CLI, VS Code, Chrome: nothing found.

**Before you start**

- Web: browser able to send the request; no sign-in required by the server (route.ts:73).
- Mobile: none; works with no account (route header comment).

**Screens and controls**

- Web menu item with states 'Report this response', 'Reporting…', 'Reported' (MessageBubble.tsx:4066-4072).
- Mobile sheet: six categories 'Harmful or dangerous', 'Inaccurate or misleading', 'Offensive or hateful', 'Misinformation', 'Privacy concern', 'Other'; optional note; optional email to support; 'Send' for a stored report (ReportFlagButton.tsx:42-49, 279-292).

**Journey**

1. Web: open the menu on an answer, choose Report this response; a success toast appears.
2. Mobile: tap Report, choose a category, optionally write a note, submit.
3. Mobile: the sheet tells the true outcome: submitted, saved on device, queued, or email opened.
4. If saved only on device, press Send to consent to upload.

**What the person sees and gets**

- Web success toast: 'Reported. Thank you: our trust and safety team will review it.' Failure toast: 'Could not send the report. Please try again.' (MessageBubble.tsx:1188-1192).
- Mobile texts: 'Your report was sent to the AGI safety team for review.', 'Saved on this device. Nothing was sent.', 'Saved on this device. It sends as soon as it can.' (ReportFlagButton.tsx:53-68).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Intake route POST /api/mobile/content-report with alias POST /api/content-report; validates category, 500-character excerpt, 2,000-character note; inserts with on conflict do nothing on the client id (route.ts:38-110; apps/web/app/api/content-report/route.ts).
- Rate limit 20 per hour (apps/web/lib/rate-limit.ts:152-154).
- User id optional (route.ts:73).
- Report subject kinds (chat message, research report, artifact, image, video, shared item, voice turn, task run, schedule run, compare answer, translation, code reply) (packages/contracts/cloud-contracts/src/content-reports.ts:8-21).
- Mobile: saves to device first, posts to server, optional mailto, queue with consent, flush on reconnect (apps/mobile/services/contentReport.ts:140-300).
- Mobile Local mode: egress guard refuses our-cloud requests, so the report stays on the device until the user consents to one send (contentReport.ts:14-30).

**Incomplete**

- Web report sends fixed category harmful, empty note, and has no category choice or note field (MessageBubble.tsx:1180-1183).
- Web has no offline queue: failure means retry by hand (MessageBubble.tsx:1190-1193).
- Web share page has no report-harmful control, only the rights notice link (page.tsx:117-121).
- The draft says mobile reports are 'kept on the device and handed to the mail app'; code shows server submission is the primary path and email is optional (contentReport.ts:3-14).

**Present but disconnected or switched off**

- none found

**Not available**

- CLI, VS Code extension, Chrome extension: no report control found (search of apps/cli, apps/extension-vscode and apps/extension for report terms returned nothing relevant).
- Desktop-specific report code: none found; relies on the hosted web app [inferred].

## 4. Required behaviour

**Established requirements**

- A viewer can report a public page or an AI answer as harmful or infringing, and the report reaches the operators. (source: brief S107.15)
- Each report has a client id so a repeat send does not create a second row; user id optional; fixed categories; excerpt 500; note 2,000; rate limit. (source: apps/web/app/api/mobile/content-report/route.ts:38-110)
- A report that never left the phone must never read as submitted. (source: apps/mobile/services/contentReport.ts:21-24)

**Acceptance criteria**

1. Choosing Report this response on web creates one content_reports row with category harmful and metadata.source web.
2. Sending the same reportId twice creates one row.
3. A category outside the six is refused with a bad-request error.
4. Mobile with the network off: the sheet says saved on this device and nothing was sent.
5. After the user presses Send and the network returns, the report is delivered once.
6. A signed-out report is accepted with a null user id.
7. The 21st report in an hour from one caller is refused by the rate limit.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Source is derived from the path: a path starting /api/mobile/ is recorded as mobile, else web (route.ts:75) [inferred note on how to read data].

**Proposed improvements** (suggestions, not requirements)

- Add category and note choice to the web menu item [proposed].
- Add a Report control to the web share viewer for harmful content [proposed].
- Add report entry points to CLI, VS Code and Chrome or mark them not applicable [proposed].

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble report item | `apps/web/features/chat/components/messages/MessageBubble.tsx` | reportMessage handler and menu item (lines 1160-1195, 4062-4073). |
| endpoint | POST /api/mobile/content-report | `apps/web/app/api/mobile/content-report/route.ts` | Validates and stores reports. |
| endpoint | POST /api/content-report | `apps/web/app/api/content-report/route.ts` | Alias re-exporting the same handler for web. |
| table | content_reports | `apps/web/db/neon/0093_content_reports.sql` | Report table with unique client_report_id. |
| schema | content_reports triage columns | `apps/web/db/neon/0124_content_report_triage.sql` | Adds status, reviewer, note and reviewed time. |
| schema | content_reports row security | `apps/web/db/neon/0172_content_reports_row_level_security.sql` | Row-level security for the table (contents not opened). |
| schema | content-reports contract | `packages/contracts/cloud-contracts/src/content-reports.ts` | Subject kinds and id limit shared by apps and server. |
| service | contentReport service | `apps/mobile/services/contentReport.ts` | Device store, server submit, mailto, queue, flush. |
| component | ReportFlagButton / ReportSheet | `apps/mobile/src/features/chat/components/ReportFlagButton.tsx` | Mobile flag button and category sheet. |
| component | SharedItemSafetyActions | `apps/mobile/src/features/shared-with-you/SharedItemSafetyActions.tsx` | Report pill for shared items. |
| config | egressGuard | `apps/mobile/lib/egressGuard.ts` | Defines CONTENT_REPORT_PATH and the consented-report exception in Local mode. |
| config | rate limit mobile-content-report | `apps/web/lib/rate-limit.ts` | 20 per hour. |
| component | ReportContentLink | `apps/web/app/copyright/report/ReportContentLink.tsx` | Rights-notice link on share pages (separate path). |
| store | MMKV content-reports:v1 | `apps/mobile/services/contentReport.ts` | Device copy, max 100 non-queued reports. |
| test | content-report route tests | `apps/web/app/api/mobile/content-report/__tests__/route.test.ts` | Intake route tests. |
| test | ReportFlagButton tests | `apps/mobile/__tests__/ReportFlagButton.test.tsx` | Mobile sheet tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: browser posts JSON with a random reportId, message id, conversation id, category harmful, 500-character excerpt. | device and our servers | MessageBubble.tsx:1174-1186 |
| Mobile: report is written to device storage first. | device | contentReport.ts:222-229 |
| Mobile posts the same body through the api client; in Local mode the egress guard blocks it unless the user consented to that report. | device and our servers | contentReport.ts:170-186; apps/mobile/lib/egressGuard.ts:136, 197 |
| Server checks CSRF, rate limit, schema, reads optional auth, inserts the row. | our servers | route.ts:63-110 |
| Optional: the mobile app opens the device mail app with a prefilled message to support; the user must press send there. | device | contentReport.ts:127-166 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Report row: category, excerpt, note, ids, metadata (source, asset, shared item, subject) | table content_reports | Server only | Kept as moderation evidence; table is kept out of account erasure on purpose (apps/web/db/neon/0124_content_report_triage.sql header) |
| Mobile copy of each report | store:mmkv key content-reports:v1 | No | Up to 100 history items; queued ones kept; clearContentReports deletes (contentReport.ts:97-120) |

**Models and providers.** No model is called. The reported excerpt is stored as text. The report does not depend on which provider produced the answer.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required on web or mobile; user id stored when signed in (route.ts:73). |
| Permissions | none found in the code beyond CSRF and rate limit. |
| Subscription | none found in the code |
| Limits and metering | 20 reports per hour; category fixed; excerpt 500; note 2,000; subject id 200 (route.ts:38-60; rate-limit.ts:152-154). |
| Feature flags | none found in the code |
| Model compatibility | Any answer can be reported; not model-specific. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode: the server post is blocked by the egress guard, so the report is saved on the device; the user may then consent to send that one report (contentReport.ts:14-30, 255-275). Web has no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Sending | Web menu item shows 'Reporting…' and is disabled. | MessageBubble.tsx:4062-4072 |
| Success | Web toast; mobile 'Report submitted for review'. | MessageBubble.tsx:1188-1189; ReportFlagButton.tsx:64 |
| Error | Web error toast and the item returns to idle; mobile shows send failure and offers email. | MessageBubble.tsx:1190-1193; ReportFlagButton.tsx:203-207 |
| Retry or duplicate | Same client id does nothing new on the server. | route.ts:93 |
| Offline | Mobile queues consented reports and flushes on reconnect; web: not handled in the code. | contentReport.ts:297-330 |
| Device storage full | Mobile sheet says the report could not be saved and to free up space. | ReportFlagButton.tsx:193 |
| Accessibility | Mobile flag button has an accessibility label; web menu item is a normal menu item. | ReportFlagButton.tsx:122 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/mobile/content-report/__tests__/route.test.ts`: Mobile intake route.
- `apps/web/app/api/content-report/__tests__/route.test.ts`: Web alias route.
- `apps/mobile/__tests__/coverage-wave2-content-report.test.ts`: Mobile content-report service.
- `apps/mobile/__tests__/ReportFlagButton.test.tsx`: Report flag button and sheet.
- `apps/mobile/__tests__/ReportSheetDismiss.test.tsx`: Sheet dismissal.
- `apps/mobile/__tests__/ReportSheetInsets.test.tsx`: Sheet safe-area insets.
- `apps/mobile/__tests__/egress-guard.test.ts`: Egress guard including the report path.
- `apps/web/app/copyright/report/__tests__/ReportEntryPoints.test.tsx`: Rights-notice link from share and artifact pages.

**Test scenarios**

- **Web report**
  1. Open a chat with an AI answer.
  2. Open its menu and choose Report this response.
  - Expected: Success toast; one row in content_reports with category harmful.
- **Duplicate send**
  1. POST the same reportId twice.
  - Expected: One row; both calls succeed.
- **Mobile offline**
  1. Turn the network off.
  2. Report an answer with category Other.
  - Expected: Sheet says saved on this device, nothing sent; Send then queues it; on reconnect it arrives.
- **Signed-out report**
  1. Post without a session.
  - Expected: Accepted, user_id null.
- **Bad payload**
  1. Post category 'spam' or a 3,000-character note.
  - Expected: Bad-request error.
- **Rights notice link**
  1. Open a share page; click the footer link.
  - Expected: Opens /copyright/report with the share URL filled in.

**Where to look when it fails**

- Log line 'Failed to store content report' (route.ts:112).
- Table content_reports, columns status and client_report_id.
- Mobile device key content-reports:v1.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/web/107-discovery-social-and-public-content-products.md)
- Desktop: [70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/desktop/107-discovery-social-and-public-content-products.md)
- Mobile: [70-qa/test-plans/mobile/107-discovery-social-and-public-content-products.md](../../70-qa/test-plans/mobile/107-discovery-social-and-public-content-products.md)

## 10. Gaps and dependencies

- **Web cannot choose a category or add a note.** Affects: Web and desktop users. Evidence: MessageBubble.tsx:1180-1183. Work needed: Add a small dialog.
- **No harmful-content report on public share pages.** Affects: Web readers. Evidence: page.tsx:117-121. Work needed: Add a report control posting subject kind shared-item.
- **CLI, VS Code and Chrome have no report control.** Affects: Those apps. Evidence: brief S107.15. Work needed: Add or mark not applicable.
- **No feedback to the reporter after review.** Affects: All reporters. Evidence: reviewer note never returned automatically (0124 migration comment). Work needed: Product decision.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local
- table:content_reports
- api:POST /api/mobile/content-report
- api:POST /api/content-report
- store:mmkv
- F107-12
- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-api-and-contracts

## Unknown

- Whether CSRF is enforced for mobile bearer requests inside requireCsrfToken (not opened).
- What the 0172 row-security migration permits (not opened).
- Whether desktop runs the same MessageBubble menu unchanged.
- Whether CLI, VS Code and Chrome have any other report route (searches found none).
