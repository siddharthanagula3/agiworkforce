---
id: "F088-03"
type: "feature"
title: "Bug reports and diagnostic bundle"
aliases: ["Report a bug", "Report-a-bug flow (S88.04)", "Diagnostic bundle (S88.07)", "Review diagnostics", "Download diagnostics", "Export Diagnostics", "Copy Diagnostics", "agi doctor --export"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S88.04", "S88.07"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:POST /api/support/diagnostics", "api:POST /api/support/tickets", "table:support_tickets", "SYS-security-and-privacy", "SYS-observability-and-operations", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-03 Bug reports and diagnostic bundle

People can send a bug report, and can produce a diagnostic bundle (build, platform, language, time zone, recent errors) that our server redacts. On web the bundle can be reviewed and downloaded before sending. Mobile asks first with a confirm dialog. CLI, VS Code and Chrome save a redacted file to attach to support.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.04](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8804), [S88.07](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8807).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collects technical context on the device, posts it to /api/support/diagnostics (or inside a ticket) where the server validates and redacts it, and returns a summary and file name the user can read, download or share (apps/web/app/api/support/diagnostics/route.ts:18-45).

**Why it exists.** Support needs build and platform context to act, and users need to see what leaves the device (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md, S88.04 and S88.07).

**Who uses it.** Any signed-in user reporting a fault; support staff reading the stored bundle.

**Problems it solves**

- Bug reports without build or platform details.
- Secrets inside recent error text: the server is the only redactor (apps/web/lib/support/diagnostics/export.ts:6-10, apps/web/lib/support/diagnostics/schema.ts:10-17).
- Query strings or share tokens in a page path are cut (apps/web/lib/support/diagnostics/schema.ts:20-27).

**Use cases**

- Web user clicks 'Review diagnostics' before raising a ticket.
- Phone user opens Settings, 'Export Diagnostics' and shares the file by the system share sheet.
- CLI user runs the doctor command with the export option and attaches the file.
- VS Code user picks 'Export diagnostics' in the Help menu.

## 2. User experience

**Where to find it**

- Web: Settings, Help, raise a ticket form: 'Review diagnostics' / 'Refresh diagnostics' and 'Download diagnostics' (apps/web/features/support/components/SupportTicketsPanel.tsx:179-198). Public /support page section 'Found something broken?' with 'Email a bug report' and 'Raise a ticket' (apps/web/app/support/page.tsx:96-119). Settings, Help link 'Report a bug' to /support#bugs (apps/web/features/settings/sections/HelpSection.tsx:43-48).
- Desktop: Help menu, Troubleshooting, 'Copy Diagnostics' (copies local JSON to the clipboard) and 'Open Logs' (apps/desktop/electron/appMenu.ts:565-569, apps/desktop/electron/main.ts:1628-1639). The web panel is also reachable in the app window [inferred].
- Mobile: Settings, Support section, 'Export Diagnostics' with hint 'Asks before sharing a diagnostics summary' (apps/mobile/src/features/settings/index.tsx:894-899); 'Report App Issue' with type 'Bug Report' (apps/mobile/src/features/feedback/index.tsx:31-35); ticket form switch 'Attach diagnostics'.
- CLI: the doctor command with its export option writes a JSON file in the current directory (apps/cli/src/lib.rs:7475-7494).
- VS Code: Help quick pick '$(bug) Export diagnostics' (apps/extension-vscode/src/features/help/helpMenu.ts:38-42).
- Chrome: Options, Help, 'Export diagnostics' with button 'Export' (apps/extension/src/options.ts:2071-2125).

**Before you start**

- Web, mobile, VS Code, Chrome: signed in (the export route needs auth: apps/web/app/api/support/diagnostics/route.ts:19; Chrome shows 'Sign in first, the bundle is redacted on the server.' apps/extension/src/options.ts:2095).
- CLI: a signed-in Cloud-capable account; CloudClient::connect refuses Local and own-key modes (apps/cli/src/cloud/client.rs:49-54; apps/cli/src/diagnostics_bundle.rs:68-69).

**Screens and controls**

- Web: checkbox 'Attach diagnostics', two buttons, a preformatted block labelled 'Diagnostics that would be attached' showing the summary (apps/web/features/support/components/SupportTicketsPanel.tsx:205-211).
- Mobile dialog: title 'Share diagnostics?', body 'Sends app, device and error details to AGI Workforce, never your messages, files or passwords.', buttons Cancel and Continue; then the system share sheet 'Share your AGI diagnostics' and an alert 'Diagnostics exported' (apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:16-31,57-61, apps/mobile/src/features/settings/index.tsx:597-613).
- CLI: prints the summary and 'Wrote <path>. Read it before you attach it to a support request' (apps/cli/src/lib.rs:7486-7492).

**Journey**

1. Web: 1 open the ticket form; 2 press 'Review diagnostics'; 3 read the summary; 4 optionally 'Download diagnostics'; 5 raise the ticket (the reviewed bundle is sent).
2. Mobile: 1 tap 'Export Diagnostics'; 2 read the dialog; 3 Continue; 4 the app posts the bundle and gets the redacted one; 5 share sheet opens; 6 temporary file is deleted.
3. CLI: 1 run the doctor command with export; 2 read the printed summary; 3 open the written file; 4 attach it to a ticket or email.

**What the person sees and gets**

- Web: summary text; error 'The diagnostics could not be prepared.' on failure (apps/web/features/support/components/SupportTicketsPanel.tsx:91, apps/web/features/support/lib/ticket-client.ts:103,109).
- Mobile: 'Diagnostics exported' with the summary; failure alert 'Diagnostics export failed' / 'Could not prepare the diagnostics bundle. Try again.' (apps/mobile/src/features/settings/index.tsx:604-609).
- File name pattern agi-diagnostics-<surface>-<timestamp>.json (apps/web/lib/support/diagnostics/export.ts:19-22).

**Settings**

- Attach-diagnostics checkbox or switch, default on (apps/web/features/support/components/SupportTicketsPanel.tsx:80, apps/mobile/src/features/support/SupportTicketsScreen.tsx:66).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: collectDiagnostics reads user agent, language, time zone, window size, online flag and page path; keeps last 10 recorded events (apps/web/lib/support/diagnostics/collect.ts:47-66, packages/contracts/cloud-contracts/src/support.ts:299).
- Server export route: auth, anti-forgery, rate limit, schema check, redaction, build id and environment filled in by the server; refuses a bundle that fails validation (apps/web/app/api/support/diagnostics/route.ts:19-43, apps/web/lib/support/diagnostics/schema.ts:42-59).
- Ticket route: same normalisation, but a bundle that fails validation is dropped and the ticket is still opened (apps/web/app/api/support/tickets/route.ts:68-74).
- Mobile feedback route: also normalises a bundle and drops it if invalid (apps/web/app/api/mobile/feedback/route.ts:52-58).
- Mobile: confirm then share, temporary file deleted after sharing (apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:34-65).
- CLI: export posts the doctor report (failed or warned checks only, redacted) and writes the file (apps/cli/src/diagnostics_bundle.rs:62-125, apps/cli/src/lib.rs:7475-7494).
- VS Code and Chrome: build the bundle and post to the same route (apps/extension-vscode/src/features/diagnostics/index.ts:77-109, apps/extension/src/features/diagnostics/index.ts).

**Incomplete**

- Review is optional: on web the checkbox defaults on and an unreviewed bundle is collected and sent at submit (apps/web/features/support/lib/ticket-client.ts:122-124). Mobile ticket form sends the bundle with the switch on and no preview (apps/mobile/src/features/support/service.ts:102-104). The brief wants the user to see what is collected before sharing.
- Mobile 'Report App Issue' sends no diagnostics bundle even though the route accepts one; it sends a small client context (apps/mobile/src/features/feedback/index.tsx:116-121).
- Mobile and CLI collectors leave online, time zone (CLI) and viewport empty (apps/mobile/src/features/settings/diagnostics/diagnosticsBundle.ts:92, apps/cli/src/diagnostics_bundle.rs:118-120).
- Chrome: brief marks the bug-report item S88.04 'unverified'; only export and a link to /support were found (apps/extension/src/options.ts:2040-2125).

**Present but disconnected or switched off**

- Web recordDiagnosticEvent exists as a ring buffer; what calls it was not traced (apps/web/lib/support/diagnostics/collect.ts:34-37).

**Not available**

- Desktop has no server-redacted export; 'Copy Diagnostics' copies a local summary only (apps/desktop/electron/main.ts:1628-1639).
- CLI export in Local or own-key mode: refused by the cloud client (apps/cli/src/cloud/client.rs:49-54).

## 4. Required behaviour

**Established requirements**

- A user can report a bug with enough context (build, platform) for support to act. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.04)
- A user can produce a diagnostic bundle, see what it contains and choose to share it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.07)
- The server validates the bundle again and removes secrets before storing it. (source: apps/web/lib/support/diagnostics/schema.ts:42-59)
- A bundle that fails validation is dropped but the ticket is still opened. (source: apps/web/app/api/support/tickets/route.ts:68-74)
- Failure message 'The diagnostics could not be prepared.' (source: apps/web/features/support/components/SupportTicketsPanel.tsx:91)

**Acceptance criteria**

1. Pressing 'Review diagnostics' shows a summary and enables 'Download diagnostics'.
2. The downloaded file name starts with 'agi-diagnostics-web-'.
3. A secret placed in a recent event message is masked in the response from POST /api/support/diagnostics.
4. A page path with a query string comes back without the query string.
5. A bundle with the wrong shape to the export route is refused; the same bundle in a ticket still creates the ticket without diagnostics.
6. On mobile, Cancel in the dialog sends nothing.
7. The CLI prints the summary and the written path, and the file holds only the listed fields.
8. A signed-out user in Chrome sees 'Sign in first...'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The server release id and deploy environment come from server values, never the client [inferred from apps/web/lib/support/diagnostics/schema.ts:34-38 and collect.ts:54-56].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Always show the redacted summary before a ticket or report is sent on web and mobile, not only on request.
- [proposed] Let mobile 'Report App Issue' attach the same bundle behind its own preview.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | collectDiagnostics | `apps/web/lib/support/diagnostics/collect.ts` | Browser-side collector and event ring buffer. |
| service | normalizeDiagnostics | `apps/web/lib/support/diagnostics/schema.ts` | Validate, redact, clamp, trim path, fill server facts. |
| service | buildDiagnosticsExport | `apps/web/lib/support/diagnostics/export.ts` | Summary and file name. |
| endpoint | POST /api/support/diagnostics | `apps/web/app/api/support/diagnostics/route.ts` | Redacting export route used by every app. |
| schema | supportDiagnosticsSchema | `packages/contracts/cloud-contracts/src/support.ts` | Bundle shape and limits (10 events, 500 characters per message). |
| component | SupportTicketsPanel | `apps/web/features/support/components/SupportTicketsPanel.tsx` | Review and download controls. |
| service | web ticket client | `apps/web/features/support/lib/ticket-client.ts` | reviewSupportDiagnostics, openSupportTicket. |
| endpoint | POST /api/support/tickets | `apps/web/app/api/support/tickets/route.ts` | Stores diagnostics with the ticket. |
| table | support_tickets.diagnostics | `apps/web/db/neon/0222_support_priority_and_diagnostics.sql` | jsonb column for the bundle. |
| endpoint | POST /api/mobile/feedback | `apps/web/app/api/mobile/feedback/route.ts` | Accepts an optional bundle with mobile feedback. |
| service | mobile diagnostics bundle | `apps/mobile/src/features/settings/diagnostics/diagnosticsBundle.ts` | Collect and export. |
| service | mobile shareDiagnostics | `apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts` | Confirm dialog, temp file, share sheet. |
| screen | mobile Settings | `apps/mobile/src/features/settings/index.tsx` | 'Export Diagnostics' row and handler. |
| service | CLI diagnostics_bundle | `apps/cli/src/diagnostics_bundle.rs` | Converts the doctor report and posts it. |
| command | CLI doctor export | `apps/cli/src/lib.rs` | Writes the exported file (line 7475). |
| service | VS Code diagnostics | `apps/extension-vscode/src/features/diagnostics/index.ts` | Collect and post. |
| command | VS Code exportDiagnostics | `apps/extension-vscode/src/core/commandSetup.ts` | Command registered at line 1504. |
| service | Chrome diagnostics | `apps/extension/src/features/diagnostics/index.ts` | Collect and post. |
| screen | Chrome options Help | `apps/extension/src/options.ts` | 'Export diagnostics' row. |
| command | Desktop copyDiagnostics | `apps/desktop/electron/main.ts` | Copies a local session summary to the clipboard. |
| service | redactSecrets | apps/web/lib/redaction.ts (not found) (not found) | One of two redaction passes applied to event messages. |
| test | diagnostics route test | `apps/web/app/api/support/diagnostics/__tests__/route.test.ts` | Route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app collects the bundle from its own runtime (browser, native, Rust, editor). | device | apps/web/lib/support/diagnostics/collect.ts:47-66; apps/mobile/src/features/settings/diagnostics/diagnosticsBundle.ts:69-97 |
| For review or export, the app posts it to /api/support/diagnostics; the server checks auth, anti-forgery (bearer exempt), rate limit 'support-tickets-write', schema. | our servers | apps/web/app/api/support/diagnostics/route.ts:19-30 |
| Server redacts event messages with two pattern sets, clamps them to 500 characters, cuts the page path and sets build id and environment. | our servers | apps/web/lib/support/diagnostics/schema.ts:10-59 |
| Server returns the bundle, a text summary and a file name; the app shows or saves it. | our servers | apps/web/lib/support/diagnostics/export.ts:24-30 |
| When attached to a ticket, the normalised bundle is stored with the ticket. | our servers | apps/web/app/api/support/tickets/route.ts:68-74 |
| Mobile writes a temporary file, opens the share sheet, deletes the file. | device | apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:44-65 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Diagnostic bundle (surface, version, platform, language, time zone, window size, online flag, page path without query, conversation id, up to 10 recent events) | Returned to the device; inside support_tickets.diagnostics when attached; inside feedback metadata for mobile reports | Not synced; server-held when attached | Retention unknown; mobile temp file deleted after share; CLI file stays where written |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account on web, mobile, VS Code, Chrome (route auth: apps/web/app/api/support/diagnostics/route.ts:19). CLI needs an account in Cloud mode. |
| Permissions | Anti-forgery token on web; bearer token on other apps. |
| Subscription | None found in the code. |
| Limits and metering | Shares the 'support-tickets-write' limit of 20 per hour per user (apps/web/app/api/support/diagnostics/route.ts:24). Bundle: 10 events, 500 characters each. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local mode: export still calls our server through apiFetch, so it needs a signed-in account and network (apps/mobile/src/features/settings/diagnostics/diagnosticsBundle.ts:106-110); behaviour when signed out in Local mode is not shown in the files read, so unknown. CLI Local and own-key: refused (apps/cli/src/cloud/client.rs:49-54). Desktop 'Copy Diagnostics' works with no server. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Collect failure | Panel shows 'The diagnostics could not be prepared.' | apps/web/features/support/components/SupportTicketsPanel.tsx:91 |
| Cancel on mobile | Dialog resolves false; nothing is sent. | apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:26-29 |
| Sharing unavailable | Error 'Sharing is not available on this device.' then the generic failure alert; temp file removed. | apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:54-65 |
| Invalid bundle | Export route refuses; ticket and mobile feedback routes drop it. | apps/web/app/api/support/diagnostics/route.ts:38-40; apps/web/app/api/support/tickets/route.ts:68-74 |
| Offline (Chrome) | 'No diagnostics file was saved. Check your connection and export again.' | apps/extension/src/options.ts:2107-2109 |
| Signed out (Chrome) | 'Sign in first, the bundle is redacted on the server.' | apps/extension/src/options.ts:2095 |
| Accessibility | Review text block has an aria-label; Chrome status uses role status. | apps/web/features/support/components/SupportTicketsPanel.tsx:206; apps/extension/src/options.ts:2082 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/support/diagnostics/__tests__/route.test.ts`: Schema-valid output per surface, secret redaction, build facts override and query stripping, invalid bundle refused, unauthenticated refused.
- `apps/web/lib/support/diagnostics/__tests__/schema.test.ts`: Schema.
- `apps/web/lib/support/diagnostics/__tests__/surface-contract.test.ts`: Per-surface contract.
- `apps/mobile/src/features/settings/diagnostics/__tests__/diagnosticsBundle.test.ts`: Mobile bundle.
- `apps/extension/__tests__/diagnostics-bundle.test.ts`: Chrome bundle.
- `apps/extension-vscode/src/__tests__/diagnostics-bundle.test.ts`: VS Code bundle.
- `apps/cli/src/diagnostics_bundle.rs`: Inline Rust unit tests for the report conversion (tests module at line 127).

**Test scenarios**

- **Review before ticket**
  1. Open the web ticket form.
  2. Press 'Review diagnostics'.
  3. Download.
  - Expected: Summary block and a JSON file named agi-diagnostics-web-...
- **Secret redaction**
  1. POST a bundle whose event message contains a token-like string to /api/support/diagnostics.
  - Expected: The token is masked in the response.
- **Mobile consent**
  1. Tap 'Export Diagnostics'.
  2. Choose Cancel.
  - Expected: No network call, no share sheet.
- **CLI export**
  1. Sign in to Cloud mode.
  2. Run the doctor export.
  - Expected: Summary printed, JSON written to the current directory, only non-passing checks listed.
- **CLI Local mode**
  1. Run in Local mode.
  2. Run the export.
  - Expected: Message that nothing is sent to the cloud account in this mode.

**Where to look when it fails**

- Error 'Diagnostics are redacted on the server, so nothing was exported (<status>).' from mobile, VS Code (apps/mobile/src/features/settings/diagnostics/diagnosticsBundle.ts:113).
- Validation error 'Invalid diagnostics bundle' from the route.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)
- CLI: [70-qa/test-plans/cli/088-support-trust-and-policy-product.md](../../70-qa/test-plans/cli/088-support-trust-and-policy-product.md)
- VS Code: [70-qa/test-plans/vscode/088-support-trust-and-policy-product.md](../../70-qa/test-plans/vscode/088-support-trust-and-policy-product.md)
- Chrome: [70-qa/test-plans/chrome/088-support-trust-and-policy-product.md](../../70-qa/test-plans/chrome/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Review before sending is optional on web and absent as a preview on mobile ticket form.** Affects: Web, mobile. Evidence: apps/web/features/support/lib/ticket-client.ts:122-124; apps/mobile/src/features/support/service.ts:102-104. Work needed: Require a preview step or show the summary after attach.
- **Brief puts the CLI export at lib.rs:5656; the code is at lib.rs:7475.** Affects: Brief accuracy. Evidence: apps/cli/src/lib.rs:7475. Work needed: Fix the brief anchor.
- **Desktop has no redacted server export.** Affects: Desktop. Evidence: apps/desktop/electron/main.ts:1628-1639. Work needed: Decide if Copy Diagnostics should use the server redactor.
- **Chrome bug-report flow unverified.** Affects: Chrome. Evidence: brief S88.04. Work needed: Verify or add a report form.
- **No diagnostics path for Local-only users with no account.** Affects: Mobile and CLI Local. Evidence: apps/cli/src/cloud/client.rs:49-54. Work needed: Product decision: local file with on-device redaction or email instructions.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:POST /api/support/diagnostics
- api:POST /api/support/tickets
- table:support_tickets
- SYS-security-and-privacy
- SYS-observability-and-operations
- SYS-authentication-and-identity

## Unknown

- What desktopDiagnostics() contains (service file read only at its export).
- What calls recordDiagnosticEvent in production code.
- Retention of stored bundles.
- Whether mobile Local mode with no sign-in gives a usable failure message.
- Chrome and desktop bug-report forms: not found.
