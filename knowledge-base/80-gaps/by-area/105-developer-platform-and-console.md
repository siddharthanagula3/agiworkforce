---
id: "GAPS-AREA-105"
type: "gap-list"
title: "Gaps: Developer platform and console"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 105. Developer platform and console

66 open gaps that touch this area. Area page: [20-features/105-developer-platform-and-console](../../20-features/105-developer-platform-and-console/README.md).

## GAP-F105-01-01

**No organization creation although the brief and the Should line say organization and projects.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-01](../../20-features/105-developer-platform-and-console/F105-01-projects-with-monthly-credit-limits.md)
- Detail: Affects: Web and Desktop developers.. Work needed: Decide whether organizations are in scope; then add them or edit the brief.
- Evidence: doc: area brief S105.01; developer_projects has no organization column (0321 migration).

## GAP-F105-01-02

**Project update has no audit event; archive audits keys but not the project.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-01](../../20-features/105-developer-platform-and-console/F105-01-projects-with-monthly-credit-limits.md)
- Detail: Affects: Web and Desktop, security review.. Work needed: Add audit events.
- Evidence: projects/[projectId]/route.ts:44-93.

## GAP-F105-01-03

**Cap enforced on two gateway routes only; other key-authenticated routes unchecked.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-01](../../20-features/105-developer-platform-and-console/F105-01-projects-with-monthly-credit-limits.md)
- Detail: Affects: Any developer relying on the cap.. Work needed: List every route a key can bill and confirm each calls the refusal.
- Evidence: auth-gate.ts:290-293; audio transcriptions route.ts:302.

## GAP-F105-01-04

**No navigation entry to /developers found in the web app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-01](../../20-features/105-developer-platform-and-console/F105-01-projects-with-monthly-credit-limits.md)
- Detail: Affects: Web discoverability.. Work needed: Confirm and add an entry if absent.
- Evidence: Only links found are in apps/web/app/api-docs/page.tsx:194, 254.

## GAP-F105-01-05

**Desktop behaviour not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-01](../../20-features/105-developer-platform-and-console/F105-01-projects-with-monthly-credit-limits.md)
- Detail: Affects: Desktop.. Work needed: Open the Electron app and check /developers.
- Evidence: Brief says done; desktop code not opened.

## GAP-F105-02-01

**Revoke does not require step-up while creation does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-02](../../20-features/105-developer-platform-and-console/F105-02-api-keys.md)
- Detail: Affects: Web, Desktop, CLI users' account security.. Work needed: Decide the rule and add the check or document it.
- Evidence: api-keys/route.ts:111-117 vs [keyId]/route.ts:16-67.

## GAP-F105-02-02

**No in-card rotate or edit; rotate is support-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-02](../../20-features/105-developer-platform-and-console/F105-02-api-keys.md)
- Detail: Affects: Developers rotating leaked keys.. Work needed: Add rotate to the card and CLI.
- Evidence: regenerate-api-key.ts:38-40; no UI call found.

## GAP-F105-02-03

**Wording Delete versus Revoke.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-02](../../20-features/105-developer-platform-and-console/F105-02-api-keys.md)
- Detail: Affects: Web users.. Work needed: Pick one word.
- Evidence: ApiKeys.tsx:284, 734.

## GAP-F105-02-04

**Never-expiring keys allowed although a maximum lifetime setting exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-02](../../20-features/105-developer-platform-and-console/F105-02-api-keys.md)
- Detail: Affects: Security posture.. Work needed: Decide policy.
- Evidence: key-expiry.test.ts line 170; api-key-service.ts:25-47.

## GAP-F105-02-05

**Desktop not opened; mobile and extensions have no key management.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-02](../../20-features/105-developer-platform-and-console/F105-02-api-keys.md)
- Detail: Affects: Desktop verification.. Work needed: Verify Desktop; confirm others are out of scope.
- Evidence: Brief says done for desktop only.

## GAP-F105-03-01

**No standalone create-principal control; principals appear only through keys.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-03](../../20-features/105-developer-platform-and-console/F105-03-service-accounts-workspace-admin.md)
- Detail: Affects: Workspace admins on web and Desktop.. Work needed: Decide if a separate create is wanted.
- Evidence: service-principals/route.ts exports GET and PATCH only; admin-api-keys/route.ts:225-232.

## GAP-F105-03-02

**Revoke audit event lacks the principal reference.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-03](../../20-features/105-developer-platform-and-console/F105-03-service-accounts-workspace-admin.md)
- Detail: Affects: Audit review.. Work needed: Add subjectRef.
- Evidence: admin-api-keys/route.ts:279-292 vs 180.

## GAP-F105-03-03

**Brief says disable or revoke; revoke is per key on a different page from the principal card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-03](../../20-features/105-developer-platform-and-console/F105-03-service-accounts-workspace-admin.md)
- Detail: Affects: Admin workflow.. Work needed: Cross-link or co-locate.
- Evidence: workspace/audit/page.tsx:23 vs workspace/identity/page.tsx.

## GAP-F105-03-04

**Desktop and other apps not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-03](../../20-features/105-developer-platform-and-console/F105-03-service-accounts-workspace-admin.md)
- Detail: Affects: Desktop.. Work needed: Verify in Electron.
- Evidence: Brief says done for desktop; not opened.

## GAP-F105-04-01

**CLI ignores deprecation_date and capabilities returned by the gateway.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-04](../../20-features/105-developer-platform-and-console/F105-04-model-list-and-deprecation-notices.md)
- Detail: Affects: CLI users.. Work needed: Add fields and show the date.
- Evidence: gateway_models.rs:24-35.

## GAP-F105-04-02

**The rule that removes a model from the list at its date was not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-04](../../20-features/105-developer-platform-and-console/F105-04-model-list-and-deprecation-notices.md)
- Detail: Affects: Developers relying on the doc text.. Work needed: Trace buildCatalogueEntries and add a test.
- Evidence: api-docs/page.tsx:350-355 text; model-retirements.ts filters deprecated models out of the ledger only.

## GAP-F105-04-03

**No proactive notice beyond static pages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-04](../../20-features/105-developer-platform-and-console/F105-04-model-list-and-deprecation-notices.md)
- Detail: Affects: Developers on web and Desktop.. Work needed: Decide the notice channel.
- Evidence: No email or in-app notice code found.

## GAP-F105-04-04

**Desktop and mobile parity unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-04](../../20-features/105-developer-platform-and-console/F105-04-model-list-and-deprecation-notices.md)
- Detail: Affects: Desktop.. Work needed: Verify in Electron.
- Evidence: Brief says Desktop done; not opened.

## GAP-F105-05-01

**Brief marks S105.05 and S105.06 missing for web and desktop but web code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-05](../../20-features/105-developer-platform-and-console/F105-05-try-a-request-in-the-browser.md)
- Detail: Affects: Planning and verification.. Work needed: Update the brief after a Desktop check.
- Evidence: doc: area brief S105.05; RequestPlayground.tsx:151.

## GAP-F105-05-02

**One message only, curl only, no cancel or timeout.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-05](../../20-features/105-developer-platform-and-console/F105-05-try-a-request-in-the-browser.md)
- Detail: Affects: Web users.. Work needed: Add multi-turn, stop control and more snippet languages.
- Evidence: RequestPlayground.tsx:103-130, 175-223.

## GAP-F105-05-03

**Does not exercise key-based auth, scopes or project caps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-05](../../20-features/105-developer-platform-and-console/F105-05-try-a-request-in-the-browser.md)
- Detail: Affects: Developers testing keys.. Work needed: Offer an option to send with a pasted key.
- Evidence: Session auth at RequestPlayground.tsx:181.

## GAP-F105-05-04

**No component test for send, error and copy flows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-05](../../20-features/105-developer-platform-and-console/F105-05-try-a-request-in-the-browser.md)
- Detail: Affects: Regression safety.. Work needed: Add tests.
- Evidence: Only request-playground-tools.test.ts found in features/developers/__tests__.

## GAP-F105-06-01

**Evaluation loop runs in the browser; tab close stops it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-06](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)
- Detail: Affects: Web and Desktop developers running large sets.. Work needed: Server-side runner or resumable run.
- Evidence: PromptEvaluations.tsx:293-360.

## GAP-F105-06-02

**Saved console prompts cannot be called by API, chat or CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-06](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)
- Detail: Affects: All developer surfaces.. Work needed: Define an invoke path or document the limitation.
- Evidence: No invoking route or command found.

## GAP-F105-06-03

**Brief status for versions, datasets, runs and results is missing while the web code exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-06](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)
- Detail: Affects: Planning.. Work needed: Update the brief.
- Evidence: doc: area brief S105.13 to S105.16; PromptsPanel.tsx and PromptEvaluations.tsx.

## GAP-F105-06-04

**Migration 0408 marked not applied but required by code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-06](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)
- Detail: Affects: Run start and result recording in any environment lacking it.. Work needed: Confirm applied state per environment through the migration tool.
- Evidence: 0408 header lines 3-4; developer-prompt-service.ts:384-410.

## GAP-F105-06-05

**No prompt versions in the CLI and no cross-app template store.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-06](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)
- Detail: Affects: CLI and Desktop.. Work needed: Decide a shared template owner.
- Evidence: doc: area brief S105.13 cli missing.

## GAP-F105-06-06

**Two template syntaxes: {{input}} on web custom commands, $ARGUMENTS in CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-06](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)
- Detail: Affects: Users moving between apps.. Work needed: Pick one or translate.
- Evidence: CustomCommandsSettings.tsx:27; custom_commands.rs:104.

## GAP-F105-06-NOTBUILT

**Prompt templates, versions and test cases: not built on Web, Desktop, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI
- Features: [F105-06](../../20-features/105-developer-platform-and-console/F105-06-prompt-templates-versions-and-test-cases.md)
- Requirement items: S105.13, S105.14, S105.15, S105.16
- Detail: Web: S105.13, S105.14, S105.15, S105.16; Desktop: S105.13, S105.14, S105.15, S105.16; CLI: S105.13

## GAP-F105-07-01

**No tool-call or streaming event detail in request logs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-07](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)
- Detail: Affects: Web developers. Work needed: Decide what the gateway may record without storing prompts, add fields and render them.
- Evidence: developer-console.ts:12-30 has no such field; brief S105.08 and S105.07

## GAP-F105-07-02

**Logs have no filter, search, export, per-key view or time range.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-07](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)
- Detail: Affects: Web developers with many requests. Work needed: Add query parameters to the route and controls to the card.
- Evidence: RequestLogsPanel.tsx:109-206

## GAP-F105-07-03

**Brief status for S105.17 is stale and desktop status is unverifiable.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-07](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)
- Detail: Affects: Planning and testers. Work needed: Update the brief and run the card in the Electron desktop to confirm.
- Evidence: Brief line 74-76 says missing; code mounts the card; desktop shows hosted web (doc: AGENTS.md section 5)

## GAP-F105-07-04

**No usage-by-model view inside the console.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-07](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)
- Detail: Affects: Web developers. Work needed: Embed or link the By model table.
- Evidence: DeveloperConsolePage.tsx:42-46 only links to Usage

## GAP-F105-07-05

**No log retention or deletion rule found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-07](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)
- Detail: Affects: Privacy review. Work needed: Establish retention for managed_usage_requests and state it on the card.
- Evidence: Not found in files read

## GAP-F105-07-06

**CLI, VS Code and Chrome have no request-log view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-07](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)
- Detail: Affects: Developers on those apps. Work needed: Decide whether they need one; the CLI has usage totals only.
- Evidence: No match in apps/extension, apps/extension-vscode for api/developers

## GAP-F105-07-NOTBUILT

**Request logs and usage: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F105-07](../../20-features/105-developer-platform-and-console/F105-07-request-logs-and-usage.md)
- Requirement items: S105.17
- Detail: Web: S105.17; Desktop: S105.17

## GAP-F105-08-01

**The workspace cap fails open and is eventual, so it is not a hard ceiling.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-08](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)
- Detail: Affects: Workspace owners on Team and Enterprise. Work needed: Decide whether a fail-closed or tighter mode is wanted and say it in the card (it already states the lag).
- Evidence: managed-compute-gate.ts:494-499, :517-524

## GAP-F105-08-02

**The Rate limits card shows no live remaining count.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-08](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)
- Detail: Affects: Web developers. Work needed: Show the last seen headers or poll a lightweight endpoint.
- Evidence: RateLimitsPanel.tsx:39-53

## GAP-F105-08-03

**Limits shown are base values; plan scaling on other routes was not checked against the card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-08](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)
- Detail: Affects: Developers on higher plans. Work needed: Verify each listed endpoint's real bucket and tier.
- Evidence: rate-limit-summary.ts:21; rate-limit.ts:961-966

## GAP-F105-08-04

**Workspace cap is limited to Team and Enterprise; a single owner on Pro or Max has only the personal limit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-08](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)
- Detail: Affects: Individual API developers. Work needed: Confirm that is intended.
- Evidence: billing-catalog.ts:362; UsageSection.tsx:694-711

## GAP-F105-08-05

**Where the personal monthly limit is enforced was not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-08](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)
- Detail: Affects: Personal API spend. Work needed: Read migration 0378 and the gateway path and document it.
- Evidence: Only reads found in apps/web/lib/services/spend-limit-service.ts:305-366; DB function in 0378 migration not read

## GAP-F105-08-06

**The CLI budget has no account-wide meaning and is per session only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-08](../../20-features/105-developer-platform-and-console/F105-08-rate-limits-and-budget-caps.md)
- Detail: Affects: CLI users. Work needed: none required; state it in the CLI help.
- Evidence: apps/cli/src/lib.rs:489-492

## GAP-F105-09-01

**No secret rotation or re-reveal.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-09](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)
- Detail: Affects: Web developers who lose the secret. Work needed: Add rotate action with confirmation.
- Evidence: webhook-route-schemas.ts:34-43; dialog text 'cannot be recovered' WebhooksPanel.tsx:285-288

## GAP-F105-09-02

**Delivery log shows only the latest 50 and has no filter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-09](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)
- Detail: Affects: Developers with busy endpoints. Work needed: Paging and status filter.
- Evidence: developer-webhook-service.ts:245-259

## GAP-F105-09-03

**Management routes are not in the OpenAPI bundle and docs name only the console.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-09](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)
- Detail: Affects: Developers wanting to automate setup. Work needed: Decide whether to publish them.
- Evidence: openapi.json has 30 paths, none for developers

## GAP-F105-09-04

**Many webhook tests were only seen by name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-09](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)
- Detail: Affects: Test planning. Work needed: Read them and record what they cover.
- Evidence: files listed above

## GAP-F105-09-05

**Delivery retention beyond cascade deletion is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-09](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)
- Detail: Affects: Privacy review. Work needed: Establish and state it.
- Evidence: Not found

## GAP-F105-09-06

**Brief has no CLI or extension entries for webhooks; none exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-09](../../20-features/105-developer-platform-and-console/F105-09-webhooks.md)
- Detail: Affects: CLI users. Work needed: None unless required.
- Evidence: grep of apps/cli, apps/extension found no webhook console call

## GAP-F105-10-01

**Bundle does not cover the developer-console routes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-10](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)
- Detail: Affects: Developers. Work needed: Add or declare them session-only.
- Evidence: openapi.json has no /developers or /plugins paths

## GAP-F105-10-02

**CLI support is partial: feedback and diagnostics exist, no ticket path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-10](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)
- Detail: Affects: CLI users. Work needed: Verify behaviour, then decide on a ticket link.
- Evidence: claude_parity.rs:194-212; lib.rs:7474-7490

## GAP-F105-10-03

**Decision doc says json_schema is refused while docs and code enforce it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-10](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)
- Detail: Affects: Anyone reading the decision doc. Work needed: Update the decision doc.
- Evidence: docs/decisions/wire-or-cut.md section 2026-08-06 vs openapi.json:726

## GAP-F105-10-04

**Sample correctness is not tested by running them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-10](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)
- Detail: Affects: Developers. Work needed: Add a test that runs or lints each sample.
- Evidence: Tests check paths and claims only

## GAP-F105-10-05

**Desktop behaviour of these pages was not run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-10](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)
- Detail: Affects: Desktop users. Work needed: Open them in the desktop app.
- Evidence: Brief says done; no desktop code

## GAP-F105-10-PARTLY

**Docs, reference and support: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F105-10](../../20-features/105-developer-platform-and-console/F105-10-docs-reference-and-support.md)
- Requirement items: S105.28

## GAP-F105-11-01

**No CLI path to upload or submit to the account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-11](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)
- Detail: Affects: CLI developers. Work needed: Decide whether the CLI needs account upload; otherwise correct the brief.
- Evidence: No plugins/uploads or plugins/submissions in apps/cli/src; lib.rs:2017-2077 has only local install

## GAP-F105-11-02

**Brief cites project commands for CLI plugin support.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-11](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)
- Detail: Affects: Planning. Work needed: Fix the brief references.
- Evidence: lib.rs:1296 and 3613 are projects commands

## GAP-F105-11-03

**Plan requirement for upload and submit was not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-11](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)
- Detail: Affects: Pricing and tests. Work needed: Confirm and document.
- Evidence: No plan check in the routes read

## GAP-F105-11-04

**Retention of uploaded files and snapshots is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-11](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)
- Detail: Affects: Privacy review. Work needed: Establish and state it.
- Evidence: Not found

## GAP-F105-11-05

**Mobile has a Plugin sources screen although the brief says n/a.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-11](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief for mobile.
- Evidence: sourcesService.ts:98

## GAP-F105-11-06

**Desktop was not run; its status rests on the hosted web app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-11](../../20-features/105-developer-platform-and-console/F105-11-plugin-testing-and-publishing.md)
- Detail: Affects: Desktop users. Work needed: Run the upload in the desktop app.
- Evidence: doc: AGENTS.md section 5

## GAP-F105-12-01

**No streaming event inspector.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-12](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)
- Detail: Affects: Web and desktop developers. Work needed: Add streaming to the playground and an event pane.
- Evidence: RequestPlayground.tsx:114 stream false

## GAP-F105-12-02

**Tool-call inspector is partial: no results, no history.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-12](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)
- Detail: Affects: Web and desktop developers. Work needed: Add tool result turn and logging of calls with no prompt text.
- Evidence: RequestPlayground.tsx:95-101

## GAP-F105-12-03

**No structured-output schema editor although the gateway enforces schemas.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-12](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)
- Detail: Affects: Web and desktop developers. Work needed: Add an editor and checks against the server limits.
- Evidence: openapi.json:726; no control in features/developers

## GAP-F105-12-04

**No file upload and reuse for the gateway API.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-12](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)
- Detail: Affects: API developers. Work needed: Design a route, scope and storage with a trust review.
- Evidence: No files route in apps/web/app/api/llm/v1; api-docs page.tsx:321-324

## GAP-F105-12-05

**No retrieval collection manager.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-12](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)
- Detail: Affects: API developers. Work needed: Design and build, or cut from the brief.
- Evidence: No match for the terms searched

## GAP-F105-12-06

**The decision record says json_schema is refused; code and docs say it is enforced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F105-12](../../20-features/105-developer-platform-and-console/F105-12-inspectors-and-data-tools-not-built.md)
- Detail: Affects: Readers of the decision doc. Work needed: Update the decision doc.
- Evidence: docs/decisions/wire-or-cut.md (2026-08-06 section) vs openapi.json:726
