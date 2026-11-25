---
id: "GAPS-AREA-108"
type: "gap-list"
title: "Gaps: Specialist workspaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 108. Specialist workspaces

75 open gaps that touch this area. Area page: [20-features/108-specialist-workspaces](../../20-features/108-specialist-workspaces/README.md).

## CMP-D38

**Research workbench and managed compute for remote jobs (Science app)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md), [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: No science workbench or remote job submission exists.
- Evidence: searched: Slurm, HPC, Modal, science in apps/web/features, apps/desktop/electron

## CMP-D58

**Claude Science: desktop research app with sandboxed code**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md), [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: No separate research app.
- Evidence: searched: science in apps, apps/web/features

## CMP-W100

**Shopping research buyer's guides and virtual try-on**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md), [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: Product comparison cards exist but no buyer's guide mode, try-on or saved favourites.
- Evidence: searched: buyer's guide, shopping research, try-on, reference photos in apps/web/features, app

## CMP-W162

**Rosalind Workbench for sequencing and bioinformatics research**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md), [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: No science workbench or sequencing viewers.
- Evidence: searched: FASTQ, RNA-seq in apps/web, packages/ui/unified-chat

## CMP-W95

**Healthcare and clinician clinical search**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md), [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: No clinical search workspace or medical-literature mode; Health is a personal space only.
- Evidence: searched: clinical, healthcare in apps/web/features/health, app

## GAP-AREA108-LW08

**Reproducible environments: the sandbox harness is spawned by name, and the template list is declared in code. The file header does not show a pinned version per template, so reproducibility is not established by this code.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-108
- Detail: Area 108. Specialist workspaces
- Evidence: apps/web/lib/e2b/templates.ts:1-20.

## GAP-AREA108-LW09

**Contract review, sales, support, HR and marketing are marked done, but the code read is skill files and the catalog. No runtime path showing these skills run to completion was checked.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-108
- Detail: Area 108. Specialist workspaces
- Evidence: .agents/skills/review-contract/SKILL.md:1-6; apps/web/lib/services/skill-catalog-service.ts:145-160.

## GAP-AREA108-LW10

**Privacy text says Health-space chats go only to providers recorded as not training on user data, and refuses others. The availability code read does not enforce this; the enforcement was not found in the lines read.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-108
- Detail: Area 108. Specialist workspaces
- Evidence: apps/web/app/privacy/page.tsx:1580-1585 (policy text); apps/web/lib/services/health-space-service.ts:23-29 (availability only).

## GAP-CAP-research-28

**Specialist research: science, clinical and shopping: Dedicated science, clinical and shopping research are not built per comparison.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md), [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Requirement items: S108.09, S108.10, S108.17, S108.20, S108.22
- Detail: Claude yes, ChatGPT yes; AGI not built

## GAP-F108-01-01

**Linking and bank chat tools are refused by the connector release state**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Detail: Affects: Web and Desktop, all users. Work needed: Owner steps (Plaid agreement, production access, compliance, legal review, env) then add bank-accounts to the released list or release connectors
- Evidence: connector-release.ts:14-30; connector-policy-gate.ts:147-154; user-connector-tools.ts:2478-2485

## GAP-F108-01-02

**Overview and items reads skip plan, region and release checks**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Detail: Affects: Web and Desktop users with already linked banks. Work needed: Apply the connector policy gate or document the intent
- Evidence: overview/route.ts:20-36; items/route.ts:14-22

## GAP-F108-01-03

**No rail or Settings entry for Finances**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Detail: Affects: Web and Desktop. Work needed: Add an entry once released
- Evidence: app-nav-items.ts:90-170 has no finance item

## GAP-F108-01-04

**Mobile has no finance view and linking is flagged off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Detail: Affects: Mobile. Work needed: Store declarations and a mobile finance screen, if wanted
- Evidence: v1FeatureFlags.ts:30; plaid-config.ts:15; docs: audit/registers/mobile-store-feature-justification.md (C9 row)

## GAP-F108-01-05

**Setup doc says re-linking replaces the old bank**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Detail: Affects: Engineers and testers. Work needed: Correct the doc
- Evidence: docs/development/connectors-setup.md:597-632 versus bank-accounts.ts:433-454

## GAP-F108-01-06

**Chrome extension has no finance feature**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Detail: Affects: Chrome. Work needed: Decide whether Chrome needs it
- Evidence: brief S108.01; no matches in apps/extension

## GAP-F108-01-NOTBUILT

**Bank accounts and spending dashboard: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Requirement items: S108.01, S108.02, S108.03
- Detail: Chrome: S108.01, S108.02, S108.03

## GAP-F108-01-PARTLY

**Bank accounts and spending dashboard: partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F108-01](../../20-features/108-specialist-workspaces/F108-01-bank-accounts-and-spending-dashboard.md)
- Requirement items: S108.01, S108.02, S108.03
- Detail: Web S108.01: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now | Web S108.02: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now | Web S108.03: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now | Desktop S108.01: owner:

## GAP-F108-02-01

**Budgets are not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-02](../../20-features/108-specialist-workspaces/F108-02-budgets-net-worth-credit-and-financial-document-ex.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Design, table, endpoints, screen, tests
- Evidence: brief S108.04

## GAP-F108-02-02

**Net worth is not built and the linked products cannot supply loans or investments**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-02](../../20-features/108-specialist-workspaces/F108-02-budgets-net-worth-credit-and-financial-document-ex.md)
- Detail: Affects: All apps. Work needed: Extend Plaid products or accept transactions-only accounts; legal review
- Evidence: brief S108.05; bank-accounts.ts:41

## GAP-F108-02-03

**Financial document explanation is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-02](../../20-features/108-specialist-workspaces/F108-02-budgets-net-worth-credit-and-financial-document-ex.md)
- Detail: Affects: All apps. Work needed: Flow design and extraction method
- Evidence: brief S108.06

## GAP-F108-02-04

**Credit report and score are not built and no vendor exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-02](../../20-features/108-specialist-workspaces/F108-02-budgets-net-worth-credit-and-financial-document-ex.md)
- Detail: Affects: All apps. Work needed: Vendor decision, legal review, build
- Evidence: briefs S108.07, S108.08; no decision doc

## GAP-F108-02-NOTBUILT

**Budgets, net worth, credit and financial document explanation (not built): not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F108-02](../../20-features/108-specialist-workspaces/F108-02-budgets-net-worth-credit-and-financial-document-ex.md)
- Requirement items: S108.04, S108.05, S108.06, S108.07, S108.08
- Detail: Web: S108.04, S108.05, S108.06, S108.07, S108.08; Desktop: S108.04, S108.05, S108.06, S108.07, S108.08; Mobile: S108.04, S108.05, S108.06, S108.07, S108.08; Chrome: S108.04, S108.05, S108.06, S108.07, S108.08

## GAP-F108-03-01

**No specialist workspaces: finance, company, legal and science share one generic run with no domain sources or presets**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Decide if presets are wanted; add source presets and domain evaluation
- Evidence: No domain code found; brief code pointers hit unrelated directory entries

## GAP-F108-03-02

**Chrome has no Deep Research**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md)
- Detail: Affects: Chrome. Work needed: Product decision
- Evidence: docs/product/surface-feature-matrix.md:63

## GAP-F108-03-03

**Mobile lacks the source selection that web has**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md)
- Detail: Affects: Mobile. Work needed: Add source choices on mobile
- Evidence: audit/partial/035-research-workspace.md S35.05 lists mobile missing

## GAP-F108-03-04

**Web composer Local or own-key behaviour for research is not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md)
- Detail: Affects: Web, Desktop. Work needed: Read the web appMode gating and record it
- Evidence: not examined

## GAP-F108-03-05

**Connector-based specialist sources are blocked by the release state**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md)
- Detail: Affects: All. Work needed: Release the needed connectors
- Evidence: connector-release.ts:14-30

## GAP-F108-03-NOTBUILT

**Deep research workspaces (finance, company, legal, science): not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F108-03](../../20-features/108-specialist-workspaces/F108-03-deep-research-workspaces-finance-company-legal-sci.md)
- Requirement items: S108.09, S108.10, S108.17, S108.20
- Detail: Chrome: S108.09, S108.10, S108.17, S108.20

## GAP-F108-04-01

**Filing and transcript analysis is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-04](../../20-features/108-specialist-workspaces/F108-04-financial-filings-analysis-and-source-library-not.md)
- Detail: Affects: All apps. Work needed: Source choice, fetch tool, analysis flow, tests
- Evidence: brief S108.11

## GAP-F108-04-02

**Source library with tags and BibTeX export is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-04](../../20-features/108-specialist-workspaces/F108-04-financial-filings-analysis-and-source-library-not.md)
- Detail: Affects: All apps. Work needed: Table, endpoints, screens, export
- Evidence: brief S108.21

## GAP-F108-04-NOTBUILT

**Financial filings analysis and source library (not built): not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F108-04](../../20-features/108-specialist-workspaces/F108-04-financial-filings-analysis-and-source-library-not.md)
- Requirement items: S108.11, S108.21
- Detail: Web: S108.11, S108.21; Desktop: S108.11, S108.21; Mobile: S108.11, S108.21; Chrome: S108.11, S108.21

## GAP-F108-05-01

**HealthEx cannot be connected: unreleased and unconfigured**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-05](../../20-features/108-specialist-workspaces/F108-05-health-record-workspace-health-space-healthex.md)
- Detail: Affects: Web and Desktop, all users. Work needed: Owner steps (agreement, legal sign-off, client registration, env) and add healthex to the released list
- Evidence: connector-release.ts:16-30; health-space-service.ts:26; brief S108.12

## GAP-F108-05-02

**No records browser**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-05](../../20-features/108-specialist-workspaces/F108-05-health-record-workspace-health-space-healthex.md)
- Detail: Affects: Web and Desktop. Work needed: Design and build a records view if 'browse' is required
- Evidence: HealthSpaceLanding.tsx:62 redirects to a plain project

## GAP-F108-05-03

**No Health on mobile or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-05](../../20-features/108-specialist-workspaces/F108-05-health-record-workspace-health-space-healthex.md)
- Detail: Affects: Mobile, Chrome. Work needed: Decision on store declarations and scope
- Evidence: brief S108.12; no code found

## GAP-F108-05-04

**The setup doc says the connector variable pair is enough; code also needs a descriptor in the providers variable**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-05](../../20-features/108-specialist-workspaces/F108-05-health-record-workspace-health-space-healthex.md)
- Detail: Affects: Operators. Work needed: None if the doc is read in full; confirm during setup
- Evidence: oauth-registry.ts:101-139; docs/development/connectors-setup.md:564-596 describes both

## GAP-F108-05-05

**Health e2e route coverage is missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-05](../../20-features/108-specialist-workspaces/F108-05-health-record-workspace-health-space-healthex.md)
- Detail: Affects: Testers. Work needed: Add a Health route spec
- Evidence: signed-in-page-routes.spec.ts has finance but no health entry in lines 1-110

## GAP-F108-05-NOTBUILT

**Health-record workspace (Health space, HealthEx): not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F108-05](../../20-features/108-specialist-workspaces/F108-05-health-record-workspace-health-space-healthex.md)
- Requirement items: S108.12
- Detail: Mobile: S108.12; Chrome: S108.12

## GAP-F108-05-PARTLY

**Health-record workspace (Health space, HealthEx): partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F108-05](../../20-features/108-specialist-workspaces/F108-05-health-record-workspace-health-space-healthex.md)
- Requirement items: S108.12
- Detail: Web S108.12: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off | Desktop S108.12: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off

## GAP-F108-06-01

**Health timeline is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-06](../../20-features/108-specialist-workspaces/F108-06-health-features-not-built-timeline-lab-explanation.md)
- Detail: Affects: All apps. Work needed: Design and build on read tools after F108-05 opens
- Evidence: brief S108.13

## GAP-F108-06-02

**Lab explanation is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-06](../../20-features/108-specialist-workspaces/F108-06-health-features-not-built-timeline-lab-explanation.md)
- Detail: Affects: All apps. Work needed: Structured extraction and view
- Evidence: brief S108.14

## GAP-F108-06-03

**Wearable import is not built and mobile policy text says HealthKit was removed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-06](../../20-features/108-specialist-workspaces/F108-06-health-features-not-built-timeline-lab-explanation.md)
- Detail: Affects: Mobile mainly. Work needed: Product and store-policy decision first
- Evidence: brief S108.15; mobile/legal/page.tsx:327-329

## GAP-F108-06-04

**Appointment preparation is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-06](../../20-features/108-specialist-workspaces/F108-06-health-features-not-built-timeline-lab-explanation.md)
- Detail: Affects: All apps. Work needed: Flow design
- Evidence: brief S108.16

## GAP-F108-06-NOTBUILT

**Health features not built (timeline, lab explanation, wearables, appointment prep): not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F108-06](../../20-features/108-specialist-workspaces/F108-06-health-features-not-built-timeline-lab-explanation.md)
- Requirement items: S108.13, S108.14, S108.15, S108.16
- Detail: Web: S108.13, S108.14, S108.15, S108.16; Desktop: S108.13, S108.14, S108.15, S108.16; Mobile: S108.13, S108.14, S108.15, S108.16; Chrome: S108.13, S108.14, S108.15, S108.16

## GAP-F108-07-01

**No matter or client record store.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-07](../../20-features/108-specialist-workspaces/F108-07-contract-review-and-legal-matters.md)
- Detail: Affects: All four apps; legal users.. Work needed: Design a matter entity (table, API, screens) and link chats, files and reviews.
- Evidence: audit/missing/108-specialist-workspaces.md:67-73; no matter code found

## GAP-F108-07-02

**Playbook has no product input path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-07](../../20-features/108-specialist-workspaces/F108-07-contract-review-and-legal-matters.md)
- Detail: Affects: Web, desktop, mobile, Chrome.. Work needed: Decide where the playbook lives (project or account) and feed it to the skill.
- Evidence: SKILL.md:49 names legal.local.md; no reader in apps or packages

## GAP-F108-07-03

**Bundled skills are hidden in two pickers.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-07](../../20-features/108-specialist-workspaces/F108-07-contract-review-and-legal-matters.md)
- Detail: Affects: Chrome and the web plus-menu.. Work needed: Confirm intent; if unintended, show installed bundled skills.
- Evidence: skillsClient.ts:36-43; ComposerPlusMenu.tsx:1248-1251

## GAP-F108-07-04

**Brief status 'done' for mobile and Chrome is not verified by any test of this skill there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-07](../../20-features/108-specialist-workspaces/F108-07-contract-review-and-legal-matters.md)
- Detail: Affects: Mobile, Chrome.. Work needed: Run the Mobile and Chrome scenarios above.
- Evidence: No contract-specific test found

## GAP-F108-07-NOTBUILT

**Contract review and legal matters: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F108-07](../../20-features/108-specialist-workspaces/F108-07-contract-review-and-legal-matters.md)
- Requirement items: S108.18
- Detail: Web: S108.18; Desktop: S108.18; Mobile: S108.18; Chrome: S108.18

## GAP-F108-08-01

**No environment pinning or version capture.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: Affects: Web and desktop users expecting reproducible results.. Work needed: Record image version and installed packages per run; allow re-run against the same.
- Evidence: No package-version capture found in notebook-runs.ts or templates.ts

## GAP-F108-08-02

**Notebook document not persisted.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: Affects: Web and desktop.. Work needed: Persist cells and outputs with the session.
- Evidence: No storage call found in features/notebook services

## GAP-F108-08-03

**Migration 0254 and 0247 headers say not applied.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: Affects: Provenance in production.. Work needed: Confirm applied state with the migration status command.
- Evidence: 0254_notebook_runs.sql:4

## GAP-F108-08-04

**No run-history reader.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: Affects: All apps.. Work needed: Add a read route and view.
- Evidence: Notebook routes list only execute, run-all, files

## GAP-F108-08-05

**Mobile and Chrome absent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Detail: Affects: Mobile, Chrome.. Work needed: Decide whether they open the web notebook or get their own view.
- Evidence: Brief; no notebook code in those apps

## GAP-F108-08-NOTBUILT

**Reproducible research environments (code and notebooks): not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F108-08](../../20-features/108-specialist-workspaces/F108-08-reproducible-research-environments-code-and-notebo.md)
- Requirement items: S108.22
- Detail: Mobile: S108.22; Chrome: S108.22

## GAP-F108-09-01

**No classes, assignments or teacher view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-09](../../20-features/108-specialist-workspaces/F108-09-study-mode-learn-practise-review.md)
- Detail: Affects: Teachers on web and desktop.. Work needed: Define the education data model and screens.
- Evidence: Searched features/study and StudyScreen; none found

## GAP-F108-09-02

**No structured curriculum or lesson-plan output.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-09](../../20-features/108-specialist-workspaces/F108-09-study-mode-learn-practise-review.md)
- Detail: Affects: Web, desktop.. Work needed: Add an artifact type with objectives, activities, materials.
- Evidence: Only prompt text and a plan request (study-session.ts:47-56, :115-121)

## GAP-F108-09-03

**composeStudyPrompt is unused in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-09](../../20-features/108-specialist-workspaces/F108-09-study-mode-learn-practise-review.md)
- Detail: Affects: Instruction precedence when account instruction and study text conflict.. Work needed: Wire it or remove it.
- Evidence: Only study-session.test.ts and index.ts reference it

## GAP-F108-09-04

**Brief says mobile missing; code has a mobile screen. Surface matrix says desktop and mobile absent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-09](../../20-features/108-specialist-workspaces/F108-09-study-mode-learn-practise-review.md)
- Detail: Affects: Documentation readers.. Work needed: Correct brief and matrix.
- Evidence: apps/mobile/src/features/study/StudyScreen.tsx; docs/product/surface-feature-matrix.md:285-286

## GAP-F108-09-05

**Chrome absent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-09](../../20-features/108-specialist-workspaces/F108-09-study-mode-learn-practise-review.md)
- Detail: Affects: Chrome.. Work needed: Decide scope.
- Evidence: Brief

## GAP-F108-09-NOTBUILT

**Study mode (learn, practise, review): not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F108-09](../../20-features/108-specialist-workspaces/F108-09-study-mode-learn-practise-review.md)
- Requirement items: S108.23, S108.24
- Detail: Chrome: S108.23, S108.24

## GAP-F108-10-01

**No end-to-end test per workflow skill with and without connectors.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-10](../../20-features/108-specialist-workspaces/F108-10-sales-support-hr-and-marketing-workflows.md)
- Detail: Affects: All apps.. Work needed: Add scripted runs against a test connector.
- Evidence: Tests found cover catalog and offer logic only

## GAP-F108-10-02

**Brief marks marketing missing on mobile and Chrome and sales missing on Chrome, but the catalog is shared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-10](../../20-features/108-specialist-workspaces/F108-10-sales-support-hr-and-marketing-workflows.md)
- Detail: Affects: Mobile, Chrome.. Work needed: Verify and correct the brief.
- Evidence: request-processor.ts:1073 excludes only vscode, cli, api

## GAP-F108-10-03

**Chrome and web plus-menu pickers hide bundled skills.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-10](../../20-features/108-specialist-workspaces/F108-10-sales-support-hr-and-marketing-workflows.md)
- Detail: Affects: Chrome, web.. Work needed: Add a path to bundled skills in Chrome.
- Evidence: skillsClient.ts:36-43; ComposerPlusMenu.tsx:1248-1251

## GAP-F108-10-04

**Connector availability for CRM, helpdesk and applicant tools not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-10](../../20-features/108-specialist-workspaces/F108-10-sales-support-hr-and-marketing-workflows.md)
- Detail: Affects: All apps.. Work needed: List which connectors each skill names and check they exist.
- Evidence: Not opened

## GAP-F108-10-NOTBUILT

**Sales, support, HR and marketing workflows: not built on Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, Chrome
- Features: [F108-10](../../20-features/108-specialist-workspaces/F108-10-sales-support-hr-and-marketing-workflows.md)
- Requirement items: S108.26, S108.29
- Detail: Mobile: S108.29; Chrome: S108.26, S108.29

## GAP-F108-11-01

**No booking or reservation tool; only guidance to connect one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-11](../../20-features/108-specialist-workspaces/F108-11-shopping-comparisons-and-travel-planning.md)
- Detail: Affects: All apps; S108.33 'make reservations'.. Work needed: Confirm which connectors can book and test the flow.
- Evidence: itinerary-tool.ts:217-220

## GAP-F108-11-02

**Brief says shopping is missing on mobile but code declares and renders it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-11](../../20-features/108-specialist-workspaces/F108-11-shopping-comparisons-and-travel-planning.md)
- Detail: Affects: Documentation.. Work needed: Run on a device and correct the brief.
- Evidence: clarifyCard.ts:7-18; chatExecutionStore.ts:3442; mobile ProductComparisonCard.tsx

## GAP-F108-11-03

**No direct unit test for itinerary-tool.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-11](../../20-features/108-specialist-workspaces/F108-11-shopping-comparisons-and-travel-planning.md)
- Detail: Affects: Web, mobile, Chrome.. Work needed: Add tests for fitting, unresolved stops, billing refusal.
- Evidence: No itinerary test file in apps/web/lib/places

## GAP-F108-11-04

**Depends on a single places provider and key.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-11](../../20-features/108-specialist-workspaces/F108-11-shopping-comparisons-and-travel-planning.md)
- Detail: Affects: All apps.. Work needed: Add a second provider or a clear unavailable message.
- Evidence: places-config.ts:7

## GAP-F108-11-NOTBUILT

**Shopping comparisons and travel planning: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F108-11](../../20-features/108-specialist-workspaces/F108-11-shopping-comparisons-and-travel-planning.md)
- Requirement items: S108.31
- Detail: Mobile: S108.31

## GAP-F108-12-01

**Business operations workspace not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-12](../../20-features/108-specialist-workspaces/F108-12-items-with-no-code-found-business-operations-cad-v.md)
- Detail: Affects: All four apps.. Work needed: Define scope, data sources and the view.
- Evidence: audit/missing/108-specialist-workspaces.md:81-87

## GAP-F108-12-02

**CAD workflows not built; Onshape and SolidWorks absent from the directory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-12](../../20-features/108-specialist-workspaces/F108-12-items-with-no-code-found-business-operations-cad-v.md)
- Detail: Affects: All four apps.. Work needed: Add connectors or MCP entries and skills; test with real accounts.
- Evidence: vendor-directory.json has no Onshape or SolidWorks entry; Autodesk entry at :603-621

## GAP-F108-12-03

**Virtual try-on not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-12](../../20-features/108-specialist-workspaces/F108-12-items-with-no-code-found-business-operations-cad-v.md)
- Detail: Affects: All four apps.. Work needed: Pick an image-generation route, consent, and privacy handling.
- Evidence: No code found

## GAP-F108-12-04

**Customer-service voice agent not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F108-12](../../20-features/108-specialist-workspaces/F108-12-items-with-no-code-found-business-operations-cad-v.md)
- Detail: Affects: All four apps.. Work needed: Build through the voice-agent builder area.
- Evidence: audit/missing/051-voice-agent-builder-and-telephony-extensions.md:11-16

## GAP-F108-12-NOTBUILT

**Items with no code found (business operations, CAD, virtual try-on, voice agents): not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F108-12](../../20-features/108-specialist-workspaces/F108-12-items-with-no-code-found-business-operations-cad-v.md)
- Requirement items: S108.25, S108.30, S108.32, S108.35
- Detail: Web: S108.25, S108.30, S108.32, S108.35; Desktop: S108.25, S108.30, S108.32, S108.35; Mobile: S108.25, S108.30, S108.32, S108.35; Chrome: S108.25, S108.30, S108.32, S108.35
