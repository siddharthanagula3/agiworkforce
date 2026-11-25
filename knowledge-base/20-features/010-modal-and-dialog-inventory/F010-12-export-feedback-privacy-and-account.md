---
id: "F010-12"
type: "feature"
title: "Export, feedback, privacy and account"
aliases: ["Export options", "Report content", "Feedback submission", "Diagnostic-sharing consent", "Data-export request", "Account-deletion request", "Delete account", "Report this response", "S10.43 to S10.48"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S10.43", "S10.44", "S10.45", "S10.46", "S10.47", "S10.48"]
depends_on: ["SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-observability-and-operations", "SYS-subscriptions-entitlements-and-usage", "F010-09", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:POST /api/content-report", "api:POST /api/feedback", "api:POST /api/user/export", "api:DELETE /api/user/delete-account", "table:profiles", "table:feedback"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-12 Export, feedback, privacy and account

Lets people export a chat, report an answer, send feedback, choose whether crash or diagnostic data is shared, request a copy of their account data, and delete the account. Deletion is scheduled with a cancellation deadline and needs an identity check. Web report is a one-click flag with no reason prompt. Chrome offers only data-handling notes.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.43](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1043), [S10.44](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1044), [S10.45](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1045), [S10.46](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1046), [S10.47](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1047), [S10.48](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1048).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives people control and recourse: take their data out, flag harmful output, tell the team what went wrong, decide what leaves the device for diagnostics, and leave the product.

**Why it exists.** Privacy and safety expectations and legal duties require export and deletion. Reports and feedback keep the product safe and improving.

**Who uses it.** Any signed-in person; deletion and data export are account owner actions.

**Problems it solves**

- Keeping a copy of a conversation
- Flagging harmful or wrong answers
- Reporting bugs from inside the app
- Unwanted crash reporting
- Leaving the service

**Use cases**

- Export a chat as Markdown or PDF
- Report a response as harmful
- Send feedback with a screenshot
- Request an account data export and download it
- Schedule account deletion and cancel before the deadline

## 2. User experience

**Where to find it**

- Web and Electron Desktop: chat title menu 'Export…' (apps/web/features/chat/components/ConversationTitleMenu.tsx:178); message menu 'Report this response' (apps/web/features/chat/components/messages/MessageBubble.tsx:4072); account menu feedback item (apps/web/shared/components/layout/AccountMenuItems.tsx:105); Settings, Privacy (crash reports, 'Export data'); Settings, Account (delete)
- Mobile: conversation export sheet, report flag button, Settings feedback, diagnostics export, cloud account screen (apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:38, apps/mobile/src/features/settings/cloud-account/index.tsx:454)
- CLI: `/export`, `agi export-data`, feedback command, config telemetry keys (apps/cli/src/repl/registry.rs:441, apps/cli/src/lib.rs:7413, apps/cli/src/cloud/feedback.rs:53)
- VS Code: settings 'Share usage events' (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1963)
- Chrome: options page 'Privacy and data handling' notes (apps/extension/src/features/options/data-handling-section.ts:150)
- Retained Tauri desktop settings: typed DELETE (apps/desktop/src/features/settings/tabs/Account/CloudAccountControls.tsx:519)

**Before you start**

- Signed in for report, feedback, data export and deletion
- Deletion: no live paid plan that blocks it, and not the sole owner of a workspace (apps/web/app/api/user/delete-account/route.ts:436, :446)

**Screens and controls**

- Export dialog 'Export Chat History' with formats Markdown, PDF, Word Document, HTML, JSON (apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:178, :47)
- Mobile export options PDF, Print, Text, Markdown, Copy All Messages (apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:47)
- Mobile report categories: Harmful or dangerous, Inaccurate or misleading, Offensive or hateful, Misinformation, Privacy concern, Other (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:23)
- Privacy toggle 'Share crash and error reports' (apps/web/features/settings/sections/PrivacySection.tsx:54)
- Data export row: 'Export data', 'Download your export' (apps/web/features/settings/components/DataExportRow.tsx:301, :366)
- Delete dialog 'Delete your account?' with a field to type DELETE (apps/web/features/settings/sections/AccountSection.tsx:961)

**Journey**

1. Export: open Export, choose a format, the file is saved
2. Report: open the message menu and choose Report this response (web) or pick a category (mobile)
3. Feedback: open from the account menu, type, send
4. Diagnostics: turn the toggle on or off, or confirm sharing when asked
5. Data export: choose Export data, wait, then Download your export
6. Deletion: read what is deleted, type DELETE, confirm identity, see 'Account deletion scheduled' with the cancellation deadline, choose Continue to sign out

**What the person sees and gets**

- Web report toast 'Reported. Thank you: our trust and safety team will review it.' (apps/web/features/chat/components/messages/MessageBubble.tsx:1189)
- Mobile report outcomes: 'Your report was sent to the AGI safety team for review.' or saved on device (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:42)
- CLI feedback: 'Feedback sent to the AGI Workforce team. Thank you.' (apps/cli/src/cloud/feedback.rs:80)
- Mobile diagnostics prompt 'Share diagnostics?' (apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:15)
- Deletion success states the deadline and how to cancel (apps/web/features/settings/sections/AccountSection.tsx:940)

**Settings**

- Settings, Privacy toggles: crash reports, keep out of provider training, model improvement choices (apps/web/features/settings/sections/PrivacySection.tsx:54, :66)
- CLI config telemetry.crash-reports and product-analytics (apps/cli/src/config.rs:1473)
- VS Code telemetryEnabled

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web export dialog with five formats (apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:35)
- Mobile export sheet, CLI /export writes a file in a chosen format and path (apps/cli/src/repl/registry.rs:441)
- Web report posts to /api/content-report with an idempotent report id, which shares the mobile intake handler (apps/web/features/chat/components/messages/MessageBubble.tsx:1174, apps/web/app/api/content-report/route.ts:14)
- Mobile report keeps a stored copy and queues upload if offline (apps/mobile/src/features/chat/components/ReportFlagButton.tsx:42)
- Feedback: web dialog posts to /api/feedback with metadata and optional screenshot; the route inserts into public.feedback (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166, apps/web/app/api/feedback/route.ts:37); CLI submit (apps/cli/src/cloud/feedback.rs:53)
- Diagnostics: web telemetry consent stored locally and opt-out latched (apps/web/lib/sentry-shared.ts:63, :81); CLI crash reports off by default and never in Local or own-key privacy modes (apps/cli/src/config.rs:84, apps/cli/src/crash_reports.rs:35, :270); mobile asks before sharing (apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:20)
- Data export: web row requests and downloads archives; GET and POST on /api/user/export; archive routes (apps/web/app/api/user/export/route.ts:3456, :3458); mobile and CLI download (apps/mobile/services/cloudDataExport.ts:49, apps/cli/src/lib.rs:7413)
- Deletion: server checks plan, sole ownership and step-up, then schedules deletion 24 hours ahead and can reverse the renewal stop on failure (apps/web/app/api/user/delete-account/route.ts:402, :446, :463, :481); web dialog explains and requires typed DELETE (apps/web/features/settings/sections/AccountSection.tsx:961)

**Incomplete**

- Web report has no reason chooser: category is fixed to 'harmful' and the note is empty (apps/web/features/chat/components/messages/MessageBubble.tsx:1182)
- Mobile deletion confirms with a native alert and the identity check, not a typed phrase (apps/mobile/src/features/settings/cloud-account/deleteAccountConfirmation.ts:13)
- Chrome shows data-handling disclosures but no crash or diagnostics choice was found (apps/extension/src/features/privacy/dataHandling.ts:17)
- CLI product analytics defaults on, crash reports off (apps/cli/src/config.rs:89)
- Deletion is scheduled, not immediate; the brief says 'then signed out' (apps/web/app/api/user/delete-account/route.ts:481)

**Present but disconnected or switched off**

- none found

**Not available**

- Export on VS Code and Chrome; report on CLI, VS Code, Chrome; account deletion on CLI and Chrome; data export on Chrome; feedback on Chrome: none found

## 4. Required behaviour

**Established requirements**

- Export creates the file in the chosen format. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.43)
- Report sends the flag and the reason to moderation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.44)
- Diagnostics: tell the user what is included, and honour the preference. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.46)
- Data export is delivered as a download. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.47)
- Deletion explains what is deleted and requires explicit confirmation; a plan that blocks deletion is shown as a blocker. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.48)
- Permanent removal happens only from an explicit user action that names what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Export in each offered format yields a readable file
2. Report on web records a row visible to moderation and shows a confirmation
3. Reporting twice does not double-file
4. Feedback sends and the text appears in the feedback table
5. With crash reports off nothing is sent; turning it on is explicit
6. Request a data export, wait, download it
7. Deleting with an active paid plan shows the blocker and deletes nothing
8. Deleting without a fresh identity check returns 403 and schedules nothing
9. After scheduling, sign back in and cancel within the deadline

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Brief 'type the confirmation' applies to web and retained desktop code, not mobile [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a reason picker to the web report
- [proposed] Add a Chrome diagnostics choice or state that none exists
- [proposed] Show the cancellation deadline on mobile at the confirm step

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | EnhancedExportDialog | `apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx` | Format chooser for chat export |
| service | conversation-export | `apps/web/features/chat/services/conversation-export.ts` | Builds export content |
| component | ConversationExportSheet | `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx` | Mobile export options |
| command | CLI /export | `apps/cli/src/repl/registry.rs` | Writes export to a file |
| component | MessageBubble report item | `apps/web/features/chat/components/messages/MessageBubble.tsx` | One-click report |
| endpoint | POST /api/content-report | `apps/web/app/api/content-report/route.ts` | Alias of the mobile report intake |
| schema | content reports migrations | `apps/web/db/neon/0093_content_reports.sql` | Report storage, triage and row security in 0124 and 0172 |
| component | ReportFlagButton | `apps/mobile/src/features/chat/components/ReportFlagButton.tsx` | Mobile report sheet |
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Feedback form |
| endpoint | POST /api/feedback | `apps/web/app/api/feedback/route.ts` | Inserts into the feedback table |
| service | CLI feedback | `apps/cli/src/cloud/feedback.rs` | Sends bug, feature or feedback |
| component | PrivacySection | `apps/web/features/settings/sections/PrivacySection.tsx` | Telemetry and model-improvement toggles |
| service | sentry-shared | `apps/web/lib/sentry-shared.ts` | Consent storage and opt-out latch |
| service | CLI crash_reports | `apps/cli/src/crash_reports.rs` | reporting_enabled rule |
| service | mobile shareDiagnostics | `apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts` | Consent alert and share |
| component | DataExportRow | `apps/web/features/settings/components/DataExportRow.tsx` | Request and download export |
| endpoint | /api/user/export and archives | `apps/web/app/api/user/export/route.ts` | Data export request and download |
| service | mobile cloudDataExport | `apps/mobile/services/cloudDataExport.ts` | Fetch and share export |
| component | AccountSection delete dialog | `apps/web/features/settings/sections/AccountSection.tsx` | Typed confirmation and scheduled message |
| endpoint | DELETE /api/user/delete-account | `apps/web/app/api/user/delete-account/route.ts` | Plan, ownership, step-up checks and scheduling |
| table | profiles | `apps/web/app/api/user/delete-account/route.ts` | deletion_requested_at and deletion_scheduled_for columns |
| screen | mobile cloud account | `apps/mobile/src/features/settings/cloud-account/index.tsx` | Mobile export and delete |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Export builds the file from the loaded conversation on the device and saves or shares it | device | apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:111 |
| Report posts the message id, category and excerpt to the server | our servers | apps/web/features/chat/components/messages/MessageBubble.tsx:1174 |
| Feedback posts subject, message, metadata and optional screenshot | our servers | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166 |
| Diagnostics: web and CLI send only if consent is on; mobile sends after a confirm prompt to a share sheet | device and our servers | apps/web/lib/sentry-shared.ts:81, apps/cli/src/crash_reports.rs:35, apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:34 |
| Data export is built by the server and downloaded via archive links | our servers | apps/web/app/api/user/export/route.ts:3458 |
| Deletion checks the plan, workspace ownership and step-up, sets deletion dates on the profile | our servers | apps/web/app/api/user/delete-account/route.ts:402, :463, :487 |
| Client signs out after the person chooses Continue | device | apps/web/features/settings/sections/AccountSection.tsx:371 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Content report (message id, category, excerpt, note) | Report table created in migration 0093 (apps/web/db/neon/0093_content_reports.sql) | Server only | unknown |
| Feedback row and optional screenshot | table:feedback (apps/web/app/api/feedback/route.ts:37) | Server only | Screenshot cleanup helper exists (apps/web/app/api/feedback/route.ts:14) |
| Telemetry consent | store:localStorage key agi.privacy.shareTelemetry (apps/web/lib/sentry-shared.ts:63) | Also saved as an account preference [inferred from PrivacySection] | Until changed |
| Deletion schedule | table:profiles deletion_requested_at, deletion_scheduled_for (apps/web/app/api/user/delete-account/route.ts:488) | Server | Erasure after the deadline; legal holds kept (apps/web/features/settings/sections/AccountSection.tsx:900) |

**Models and providers.** No model is used. Reports of model answers are stored with the message id; which model answered is not recorded by this path [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Export of a chat works with the conversation on screen. Report, feedback (web, CLI), data export and deletion need a signed-in cloud account. |
| Permissions | Deletion needs a fresh identity check (account.delete step-up) and no sole ownership of a workspace (apps/web/app/api/user/delete-account/route.ts:446, :463). |
| Subscription | A live paid plan blocks deletion unless the web renewal can be stopped; refusal text is shown (apps/web/app/api/user/delete-account/route.ts:436). Store-bought plans must be cancelled in the store (apps/web/features/settings/sections/AccountSection.tsx:972). |
| Limits and metering | Rate limits on deletion status ('account-deletion-status', route.ts:320). CLI feedback message cap (apps/cli/src/cloud/feedback.rs:55). |
| Feature flags | CLI env override for crash reports; VS Code setting telemetryEnabled. |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Chat export and diagnostics sharing are on-device. CLI crash reports are disabled in Local and own-key privacy modes (apps/cli/src/crash_reports.rs:42, :270). Cloud-only: report, feedback, data export, deletion. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Report sending | Menu item disabled and reads 'Reporting…', then 'Reported' | apps/web/features/chat/components/messages/MessageBubble.tsx:4064 |
| Report failed | Toast 'Could not send the report. Please try again.' and state returns to idle | apps/web/features/chat/components/messages/MessageBubble.tsx:1191 |
| Mobile offline report | Queued for upload | apps/mobile/src/features/chat/components/ReportFlagButton.tsx:44 |
| Export preparing | 'Preparing…' then download link with expiry; expired link asks for a new export | apps/web/features/settings/components/DataExportRow.tsx:301, :386 |
| Partial export (mobile) | Shows a partial export description | apps/mobile/services/cloudDataExport.ts:56 |
| Deletion blocked or failed | Error messages say 'nothing was deleted'; renewal stop is reversed on failure | apps/web/app/api/user/delete-account/route.ts:531, :544 |
| Deletion already scheduled | Returns the existing deadline | apps/web/app/api/user/delete-account/route.ts:553 |
| Accessibility | Delete dialog uses an alert dialog with labelled input; not further assessed | apps/web/features/settings/sections/AccountSection.tsx:961 (label htmlFor account-delete-confirm-input) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/dialogs/EnhancedExportDialog.test.tsx`: Inferred from name: export dialog
- `apps/mobile/__tests__/ConversationExportSheet.test.tsx`: Inferred from name: mobile export sheet
- `apps/web/app/api/content-report/__tests__/route.test.ts`: Inferred from name: report route
- `apps/mobile/__tests__/ReportFlagButton.test.tsx`: Inferred from name: mobile report button
- `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.test.tsx`: Inferred from name: feedback dialog
- `apps/web/app/api/feedback/route.test.ts`: Inferred from name: feedback route
- `apps/web/features/settings/components/__tests__/DataExportRow.test.tsx`: Inferred from name: data export row
- `apps/web/app/api/user/delete-account/__tests__/route.test.ts`: Inferred from name: deletion route
- `apps/web/features/settings/sections/__tests__/PrivacySection.account-deletion.test.tsx`: Inferred from name: deletion in privacy section
- `apps/mobile/__tests__/cloud-data-export.test.ts`: Inferred from name: mobile data export
- `apps/mobile/__tests__/FeedbackScreen.test.tsx`: Inferred from name: mobile feedback

**Test scenarios**

- **Export a chat**
  1. Open a chat
  2. Choose Export, pick Markdown
  3. Open the file
  - Expected: File holds the messages in order with role labels
- **Report a response**
  1. Open the message menu
  2. Choose Report this response
  - Expected: Toast confirms; second try shows Reported; row appears for moderators
- **Diagnostics off**
  1. Turn off crash reports
  2. Trigger an error
  3. Watch network
  - Expected: No report is sent
- **Data export**
  1. Settings, Privacy, Export data
  2. Wait
  3. Download
  - Expected: Archive downloads; expired link prompts a new request
- **Delete blocked then allowed**
  1. With an active paid plan try deleting
  2. Then with a free plan type DELETE and complete the identity check
  - Expected: First shows the blocker and deletes nothing; second schedules deletion with a deadline and signs out on Continue
- **Cancel deletion**
  1. Sign back in before the deadline
  2. Settings, Account, Cancel deletion
  - Expected: Account stays

**Where to look when it fails**

- Log 'Account deletion refused while a paid subscription is active' (apps/web/app/api/user/delete-account/route.ts:441)
- Log 'Account deletion refused while the account is the sole owner of a workspace' (route.ts:452)
- API 409 reason sole_organization_owner
- Table profiles deletion_scheduled_for

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- VS Code: [70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **Web report has no reason selection** Affects: Web, Electron. Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:1182. Work needed: Add a category and note dialog like mobile
- **Export, report, deletion missing on several apps** Affects: VS Code, Chrome, CLI as listed. Evidence: none found. Work needed: Decide per surface
- **Chrome has no diagnostics choice** Affects: Chrome. Evidence: apps/extension/src/features/privacy/dataHandling.ts:17. Work needed: Add a choice or document that none is collected
- **CLI product analytics defaults on** Affects: CLI. Evidence: apps/cli/src/config.rs:89. Work needed: Confirm against 'sends nothing when off' and default policy
- **Mobile deletion has no typed confirmation** Affects: Mobile. Evidence: apps/mobile/src/features/settings/cloud-account/deleteAccountConfirmation.ts:13. Work needed: Decide if the alert plus identity check is enough

**Depends on**

- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-observability-and-operations
- SYS-subscriptions-entitlements-and-usage
- F010-09
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:POST /api/content-report
- api:POST /api/feedback
- api:POST /api/user/export
- api:DELETE /api/user/delete-account
- table:profiles
- table:feedback

## Unknown

- Name of the table behind migration 0093 and retention of reports
- How reports reach moderators beyond the admin route listing
- Whether VS Code feedback and export exist (brief says feedback done; not opened)
- Mobile deletion text beyond the first lines read
- Exact erasure steps after the deadline (apps/web/lib/server/account-erasure.ts not opened)
- Whether Tauri desktop settings are shipped
