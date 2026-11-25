---
id: "GAPS-AREA-088"
type: "gap-list"
title: "Gaps: Support, trust, and policy product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 88. Support, trust, and policy product

81 open gaps that touch this area. Area page: [20-features/088-support-trust-and-policy-product](../../20-features/088-support-trust-and-policy-product/README.md).

## CMP-CP283

**One switch to disable all non-essential traffic**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: There is no single switch that also stops update checks Analytics and crash reports have separate toggles; there is no single switch that also stops update checks.
- Evidence: apps/cli/src/config.rs:1473-1477

## CMP-CP293

**Telemetry and error-report opt-outs**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: No DO_NOT_TRACK or one switch that stops all background network calls config.toml has telemetry.crash_reports (off by default) and product_analytics (on by default); no DO_NOT_TRACK or one switch that stops all background network calls.
- Evidence: apps/cli/src/config.rs:82-100

## CMP-WP242

**US state privacy law disclosures**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Detail: No state-by-state consumer disclosure list was found California is covered in the data processing addendum (service provider under the CCPA); no state-by-state consumer disclosure list was found.
- Evidence: apps/web/app/dpa/page.tsx:434-436,522; searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: california, ccpa, state privacy

## GAP-AREA088-LW02

**Known-issue display (S88.09) has no code in any app. A search for 'known issue' across web, desktop, mobile, CLI, VS Code and Chrome found nothing.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-088
- Detail: Area 88. Support, trust, and policy product
- Evidence: apps/web (no file found)

## GAP-AREA088-LW05

**A notice response that fails the schema check is ignored with no log or message, so the notices quietly disappear.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-088
- Detail: Area 88. Support, trust, and policy product
- Evidence: apps/web/shared/components/ServiceNotices.tsx (readServiceNotices, the 'if (!parsed.success) return []' branch)

## GAP-CAP-privacy-and-data-controls-13

**Export your data: Chrome has no export; completeness against inventory not verified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-09](../../20-features/085-personalization-and-data-settings/F085-09-data-export-and-history-import.md), [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Requirement items: S85.20, S88.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-16

**Privacy rights requests and personal-data removal: No removal-from-outputs request for non-users; state-by-state disclosures partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Requirement items: S88.16, S88.27
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-privacy-and-data-controls-29

**Diagnostics and telemetry opt-outs: CLI analytics default on; no DO_NOT_TRACK support.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F085-10](../../20-features/085-personalization-and-data-settings/F085-10-privacy-choices-training-crash-reports-feedback.md), [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Requirement items: S85.14, S88.07
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-recovery-and-errors-14

**Status page and incident notices: No incident or maintenance notice on Mobile, CLI, VS Code, Chrome; no known-issue display on any app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Requirement items: S88.09, S88.10, S88.11, S88.12
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-F088-01-01

**Brief says mobile contextual links are missing, but code has them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-01](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)
- Detail: Affects: Documentation accuracy for mobile. Work needed: Update the brief status; decide whether the list of 18 article ids covers every screen that needs one.
- Evidence: apps/mobile/src/features/support/HelpArticleLink.tsx:43; brief S88.01 'mobile missing'

## GAP-F088-01-02

**No help search on mobile, CLI, VS Code or Chrome; they link to the web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-01](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Product decision: accept web-only search or build search.
- Evidence: apps/extension/src/options.ts:2028-2062; apps/extension-vscode/src/features/help/helpMenu.ts:19-29

## GAP-F088-01-03

**Mobile About row opens a fixed address instead of the shared opener.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-01](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)
- Detail: Affects: Mobile. Work needed: Route through openWebContentPage.
- Evidence: apps/mobile/app/(app)/about.tsx:275

## GAP-F088-01-04

**No offline help.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-01](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)
- Detail: Affects: All apps. Work needed: Unknown whether required.
- Evidence: help is hosted pages only

## GAP-F088-01-NOTBUILT

**Help centre and help links: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F088-01](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)
- Requirement items: S88.01, S88.02
- Detail: CLI: S88.01, S88.02

## GAP-F088-01-PARTLY

**Help centre and help links: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F088-01](../../20-features/088-support-trust-and-policy-product/F088-01-help-centre-and-help-links.md)
- Requirement items: S88.02

## GAP-F088-02-01

**Desktop Support menu opens the public page, not the tickets list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-02](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)
- Detail: Affects: Desktop. Work needed: Decide whether the menu should open Settings, Help in the app.
- Evidence: apps/desktop/electron/main.ts:2271-2273; brief says 'desktop done'

## GAP-F088-02-02

**No CLI ticket path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-02](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)
- Detail: Affects: CLI. Work needed: Command or a documented link.
- Evidence: brief S88.03 cli missing

## GAP-F088-02-03

**Chrome extension ticket access not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-02](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)
- Detail: Affects: Chrome. Work needed: Decide scope.
- Evidence: apps/extension/src/options.ts:2040-2045 links only

## GAP-F088-02-04

**No live refresh of replies.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-02](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)
- Detail: Affects: Web, mobile. Work needed: Optional push or poll; also notification of replies (email exists).
- Evidence: no polling in apps/web/features/support/components/SupportTicketsPanel.tsx

## GAP-F088-02-05

**Support-tier priority only for contracted organisations; self-serve paid plans have no priority.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-02](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)
- Detail: Affects: Paid individuals. Work needed: Product decision on the AGI Subscription link to support priority.
- Evidence: apps/web/lib/support/handoff/priority.ts:79-88

## GAP-F088-02-NOTBUILT

**Contact support and support tickets: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F088-02](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)
- Requirement items: S88.03
- Detail: CLI: S88.03; Chrome: S88.03

## GAP-F088-02-PARTLY

**Contact support and support tickets: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F088-02](../../20-features/088-support-trust-and-policy-product/F088-02-contact-support-and-support-tickets.md)
- Requirement items: S88.03

## GAP-F088-03-01

**Review before sending is optional on web and absent as a preview on mobile ticket form.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: Affects: Web, mobile. Work needed: Require a preview step or show the summary after attach.
- Evidence: apps/web/features/support/lib/ticket-client.ts:122-124; apps/mobile/src/features/support/service.ts:102-104

## GAP-F088-03-02

**Brief puts the CLI export at lib.rs:5656; the code is at lib.rs:7475.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: Affects: Brief accuracy. Work needed: Fix the brief anchor.
- Evidence: apps/cli/src/lib.rs:7475

## GAP-F088-03-03

**Desktop has no redacted server export.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: Affects: Desktop. Work needed: Decide if Copy Diagnostics should use the server redactor.
- Evidence: apps/desktop/electron/main.ts:1628-1639

## GAP-F088-03-04

**Chrome bug-report flow unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: Affects: Chrome. Work needed: Verify or add a report form.
- Evidence: brief S88.04

## GAP-F088-03-05

**No diagnostics path for Local-only users with no account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Detail: Affects: Mobile and CLI Local. Work needed: Product decision: local file with on-device redaction or email instructions.
- Evidence: apps/cli/src/cloud/client.rs:49-54

## GAP-F088-03-PARTLY

**Bug reports and diagnostic bundle: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F088-03](../../20-features/088-support-trust-and-policy-product/F088-03-bug-reports-and-diagnostic-bundle.md)
- Requirement items: S88.04

## GAP-F088-04-01

**Brief flags the dialog mount as unfinished for web and desktop; code mounts it. Needs confirmation by a real run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-04](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)
- Detail: Affects: Web, desktop. Work needed: Drive the app and confirm the menu item opens the dialog.
- Evidence: apps/web/shared/components/layout/WebAppShell.tsx:619

## GAP-F088-04-02

**No feedback entry on the Chrome extension.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-04](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)
- Detail: Affects: Chrome. Work needed: Add an entry or decide to link to the web.
- Evidence: brief S88.05 chrome missing; no match in apps/extension/src

## GAP-F088-04-03

**Mobile Local and own-key send nothing to the team.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-04](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)
- Detail: Affects: Mobile users in Local mode. Work needed: State this on the screen or offer consented sending.
- Evidence: apps/mobile/src/features/feedback/index.tsx:105-112

## GAP-F088-04-04

**Feedback type is not a separate stored field on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-04](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)
- Detail: Affects: Team triage. Work needed: Add a type field.
- Evidence: apps/web/app/api/feedback/route.ts:116-119

## GAP-F088-04-05

**Report submissions share a 10 per hour limit key named mobile-feedback.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-04](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)
- Detail: Affects: Web users. Work needed: Confirm intended limit and rename the key.
- Evidence: apps/web/app/api/feedback/route.ts:348

## GAP-F088-04-06

**Message limit differs by app (10,000, 10,000, 2,000).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-04](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)
- Detail: Affects: Mobile. Work needed: Align or document.
- Evidence: apps/web/app/api/mobile/feedback/route.ts:33

## GAP-F088-04-NOTBUILT

**Product feedback and feature requests: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F088-04](../../20-features/088-support-trust-and-policy-product/F088-04-product-feedback-and-feature-requests.md)
- Requirement items: S88.05, S88.06
- Detail: Chrome: S88.05, S88.06

## GAP-F088-05-01

**Chrome display of the id not found; brief says done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-05](../../20-features/088-support-trust-and-policy-product/F088-05-reference-ids-for-failed-requests.md)
- Detail: Affects: Chrome. Work needed: Confirm or build display.
- Evidence: no 'Reference' string in apps/extension/src (grep)

## GAP-F088-05-02

**Desktop and public API only verified by inference.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-05](../../20-features/088-support-trust-and-policy-product/F088-05-reference-ids-for-failed-requests.md)
- Detail: Affects: Desktop, API. Work needed: Run the desktop app to confirm.
- Evidence: brief S88.08

## GAP-F088-05-03

**Local-mode failures have no reference story.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-05](../../20-features/088-support-trust-and-policy-product/F088-05-reference-ids-for-failed-requests.md)
- Detail: Affects: Mobile, desktop, CLI in Local mode. Work needed: Decide whether a local error id is needed.
- Evidence: no code found

## GAP-F088-06-01

**No known-issues list in any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Detail: Affects: All apps. Work needed: Define a content source, a page and in-app entry.
- Evidence: brief S88.09; no code found

## GAP-F088-06-02

**No in-app incident or maintenance notices on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Read /api/status/notices in each app.
- Evidence: brief S88.10-12; only links in apps/mobile/app/(app)/about.tsx:279-283 and apps/extension-vscode/src/features/help/helpMenu.ts:31-35

## GAP-F088-06-03

**Brief says mobile and VS Code status missing; both link to the status page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Detail: Affects: Documentation accuracy. Work needed: Update the brief.
- Evidence: same files

## GAP-F088-06-04

**Brief cites the composer footer for a status link; line 406 is the model picker. The 'Status' link is in the chat turn notice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Detail: Affects: Documentation accuracy. Work needed: Fix the anchor.
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:6897

## GAP-F088-06-05

**Incident notices do not cover model providers or inference.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Detail: Affects: All chat users. Work needed: Decide whether provider status belongs in notices.
- Evidence: apps/web/app/status/page.tsx:51-53,236-243

## GAP-F088-06-06

**Desktop notices not confirmed by a run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Detail: Affects: Desktop. Work needed: Drive the desktop app.
- Evidence: inference only

## GAP-F088-06-NOTBUILT

**Service status, incidents and maintenance notices: not built on Web, Desktop, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, Chrome
- Features: [F088-06](../../20-features/088-support-trust-and-policy-product/F088-06-service-status-incidents-and-maintenance-notices.md)
- Requirement items: S88.09, S88.10, S88.11, S88.12
- Detail: Web: S88.09; Desktop: S88.09; CLI: S88.09, S88.10, S88.11, S88.12; Chrome: S88.09, S88.10, S88.11, S88.12

## GAP-F088-07-01

**Web retired-chat card names the default model, not the recorded replacement.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Detail: Affects: Web and the Desktop window. Work needed: Resolve to the catalog replacement before the default and keep the card text.
- Evidence: apps/web/shared/stores/model-store.ts:266-270 versus apps/mobile/src/features/model-picker/retirement.ts:30-42

## GAP-F088-07-02

**The brief marks mobile release and retirement notices as missing, but code exists and is mounted.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Detail: Affects: Knowledge base accuracy. Work needed: Correct the brief status; verify on a device.
- Evidence: apps/mobile/app/(app)/_layout.tsx:13; apps/mobile/app/(app)/chat/[id].tsx:1362

## GAP-F088-07-03

**CLI ecosystem import has no preview.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Detail: Affects: CLI users. Work needed: Add dry-run and a preview before writing, as migrate has.
- Evidence: apps/cli/src/lib.rs:7116-7123

## GAP-F088-07-04

**CLI model picker has no 30-day window, and the brief cites lines that do not show this logic.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Detail: Affects: CLI users. Work needed: Decide whether to match the 30-day rule.
- Evidence: apps/cli/src/tui/widgets/model_picker.rs:462-464

## GAP-F088-07-05

**Release banner has no test and new users never see a banner.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Detail: Affects: Web. Work needed: Add a component test for first visit, unseen and dismiss.
- Evidence: No test file contains agi-last-seen-release (search of apps and packages)

## GAP-F088-07-06

**No release notice, retirement notice or migration on VS Code; Chrome unestablished.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Detail: Affects: VS Code, Chrome extension. Work needed: Decide surface scope, then build or mark n/a.
- Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md

## GAP-F088-07-07

**Import covers memory text only; no settings or chat-history move for web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Detail: Affects: Users switching from another assistant. Work needed: Product decision on what else to import.
- Evidence: apps/web/app/api/memory/import/route.ts:55-75

## GAP-F088-07-NOTBUILT

**Release and model-retirement notices, and migration help: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F088-07](../../20-features/088-support-trust-and-policy-product/F088-07-release-and-model-retirement-notices-and-migration.md)
- Requirement items: S88.13, S88.14, S88.15
- Detail: VS Code: S88.13, S88.14, S88.15; Chrome: S88.13, S88.14, S88.15

## GAP-F088-08-01

**Nomination is selectable but India page says it is manual and has no field.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Detail: Affects: Web, Desktop window, India users. Work needed: Align the page or the form.
- Evidence: apps/web/app/privacy/requests/RightsRequestForm.tsx:30-31; apps/web/app/privacy/india/page.tsx:248

## GAP-F088-08-02

**No CLI route to file a request.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Detail: Affects: CLI users. Work needed: Add a command or documented link.
- Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md

## GAP-F088-08-03

**Regional notices are not shown by rule; they are static pages and a block.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Detail: Affects: All web users. Work needed: Decide if a conditional notice is needed beyond the block.
- Evidence: apps/web/proxy.ts:269-275; apps/web/app/legal/page.tsx:105

## GAP-F088-08-04

**EU representative is not appointed; the page says the obligation is live and unmet.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Detail: Affects: EU users, compliance. Work needed: Owner decision to appoint.
- Evidence: apps/web/app/legal/eu-representative/page.tsx:53

## GAP-F088-08-05

**Legal pages pending counsel review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Detail: Affects: India users. Work needed: Counsel review.
- Evidence: apps/web/app/privacy/requests/page.tsx:73

## GAP-F088-08-06

**Mobile has no native form and Desktop shows no banner, so cookie choices there rely on host handling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Detail: Affects: Mobile, Desktop. Work needed: Confirm Desktop's own analytics consent path.
- Evidence: apps/web/shared/components/CookieConsent.tsx:70

## GAP-F088-08-NOTBUILT

**Privacy requests, cookie choices and jurisdiction notices: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F088-08](../../20-features/088-support-trust-and-policy-product/F088-08-privacy-requests-cookie-choices-and-jurisdiction-n.md)
- Requirement items: S88.16
- Detail: CLI: S88.16

## GAP-F088-09-01

**Web report has no reason or note.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-09](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)
- Detail: Affects: Web and the Desktop window. Work needed: Add a small reason step; keep one-click default.
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:1182

## GAP-F088-09-02

**Brief says mobile suspension appeal is missing, yet a link-out exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-09](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)
- Detail: Affects: Mobile; knowledge base. Work needed: Correct the brief; decide if a native thread is needed.
- Evidence: apps/mobile/src/features/auth/components/MobileSignIn.tsx:735-751

## GAP-F088-09-03

**Signed-in appeal sends no receipt email to the user; only the signed-out path does. The first draft said both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-09](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)
- Detail: Affects: Signed-in suspended users. Work needed: Decide if a receipt is wanted; staff replies are emailed regardless.
- Evidence: apps/web/lib/support/tickets/appeals.ts:69-99

## GAP-F088-09-04

**Copyright and impersonation cover shared and published URLs only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-09](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)
- Detail: Affects: Rights holders about other content. Work needed: Product decision on other content.
- Evidence: apps/web/app/api/copyright-notice/route.ts:196-209

## GAP-F088-09-05

**No route test for /api/support/appeal and no test for the copyright route found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-09](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)
- Detail: Affects: Quality. Work needed: Add route tests.
- Evidence: apps/web/app/api/support/appeal contains only route.ts; search of test files

## GAP-F088-09-06

**CLI, VS Code and Chrome have none of the four.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-09](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md

## GAP-F088-09-NOTBUILT

**Reports and appeals (content, copyright, safety refusal, suspension): not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F088-09](../../20-features/088-support-trust-and-policy-product/F088-09-reports-and-appeals-content-copyright-safety-refus.md)
- Requirement items: S88.18, S88.20, S88.21
- Detail: Mobile: S88.21; CLI: S88.18, S88.20, S88.21; VS Code: S88.18, S88.20, S88.21; Chrome: S88.18, S88.20, S88.21

## GAP-F088-10-01

**No SOC 2, ISO 27001 or third-party penetration test report; the trust page cannot hold evidence.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-10](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- Detail: Affects: Enterprise buyers on web and Desktop window. Work needed: Owner commissions the audits, then publishes reports.
- Evidence: apps/web/app/trust/page.tsx:93-112

## GAP-F088-10-02

**Subprocessor change log is prose and corrections, not dated structured entries.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-10](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- Detail: Affects: Customers watching changes. Work needed: Add dated structured entries.
- Evidence: apps/web/app/subprocessors/page.tsx:225-295

## GAP-F088-10-03

**No accessibility feedback on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-10](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- Detail: Affects: Those apps. Work needed: Add an entry point or link out.
- Evidence: doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md

## GAP-F088-10-04

**Accessibility reporting in product needs sign-in.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-10](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- Detail: Affects: Signed-out users. Work needed: Email route exists; consider a signed-out form.
- Evidence: apps/web/app/accessibility/page.tsx:115-117

## GAP-F088-10-05

**No SLA on security reports.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-10](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- Detail: Affects: Researchers. Work needed: Owner decision.
- Evidence: apps/web/app/security/page.tsx:645-648

## GAP-F088-10-NOTBUILT

**Security, accessibility and policy pages: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F088-10](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- Requirement items: S88.23
- Detail: Mobile: S88.23; CLI: S88.23; VS Code: S88.23; Chrome: S88.23

## GAP-F088-10-PARTLY

**Security, accessibility and policy pages: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F088-10](../../20-features/088-support-trust-and-policy-product/F088-10-security-accessibility-and-policy-pages.md)
- Requirement items: S88.26
- Detail: Web S88.26: owner: commission SOC 2, ISO 27001 and a third-party penetration test and publish the reports on the trust page | Desktop S88.26: owner: commission SOC 2, ISO 27001 and a third-party penetration test and publish the reports on the trust page

## GAP-F088-11-01

**No email or WhatsApp channel.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-11](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)
- Detail: Affects: Customers away from the web widget. Work needed: Inbound webhook, identity match, reuse of the answer pipeline, per-channel limits.
- Evidence: No inbound support channel code found (search of apps, packages and services)

## GAP-F088-11-02

**No multilingual answers; behaviour for other languages is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-11](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)
- Detail: Affects: Non-English customers. Work needed: Decide language scope, test the corpus and model.
- Evidence: No language handling in apps/web/lib/support/agent; prompt text not read

## GAP-F088-11-03

**No resolution, handoff or satisfaction analytics.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-11](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)
- Detail: Affects: Operators. Work needed: Outcome events, a table, a rating control, an operator view.
- Evidence: No code in lib/support, features/support or admin routes

## GAP-F088-11-04

**No content-gap report.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-11](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)
- Detail: Affects: Content owner. Work needed: Store no_relevant_source questions and review them.
- Evidence: No code found

## GAP-F088-11-05

**The widget is limited to help and support pages; the chat app has no entry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-11](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)
- Detail: Affects: Signed-in web users in chat. Work needed: Product decision.
- Evidence: apps/web/features/support/lib/route-visibility.ts:1

## GAP-F088-11-06

**The brief status says web missing while the assistant itself works for the in-scope parts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F088-11](../../20-features/088-support-trust-and-policy-product/F088-11-support-assistant-answers-email-and-whatsapp-langu.md)
- Detail: Affects: Knowledge base accuracy. Work needed: Split the brief into built assistant and missing extras.
- Evidence: apps/web/app/api/support/ask/route.ts:93

## GAP-F088-99-NOTBUILT

**Other items in Support, trust, and policy product: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F088-99](../../20-features/088-support-trust-and-policy-product/F088-99-other-items.md)
- Requirement items: S88.32
- Detail: CLI: S88.32
