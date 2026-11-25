---
id: "GAPS-AREA-056"
type: "gap-list"
title: "Gaps: Concrete integration families"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 56. Concrete integration families

106 open gaps that touch this area. Area page: [20-features/056-concrete-integration-families](../../20-features/056-concrete-integration-families/README.md).

## CMP-DP91

**Curated role plugin packs and single-app plugins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No curated role packs were found The directory lists plugins and connectors; no curated role packs were found.
- Evidence: apps/web/features/directory/constants.ts

## CMP-M105

**Finances: link bank accounts and ask about money**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Bank linking through Plaid is built but switched off in v1 (FEATURES.bankLinking false), so no Finances view or bank connector is offered.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/index.tsx:669; apps/mobile/lib/v1FeatureFlags.ts (bankLinking: false); apps/mobile/src/features/settings/cloud-connectors/LinkedBanks.tsx

## CMP-M106

**Health Connect data on Android (Claude and ChatGPT)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: No Health Connect or Apple Health access on either platform.
- Evidence: searched: HealthKit, Health Connect, apple health, medical records in apps/mobile/src, apps/mobile/app, apps/mobile/package.json, apps/mobile/app.config.js

## CMP-M127

**Manage linked finance accounts: sign in again and unlink**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Unlink and reconnect code sits behind the switched-off bank linking flag.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx:1160

## CMP-W210

**Connect a GitHub Enterprise host**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: GitHub sign-in and repository access work against github.com only.
- Evidence: searched: enterprise, ghes, api_url in apps/web/app/api/github, apps/web/lib/github*

## CMP-W211

**Connect Gmail, Google Drive and Google Calendar**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: Switched off: connectors are "coming soon"; only airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry and todoist are released.
- Evidence: packages/contracts/types/src/connector-release.ts:16; apps/web/features/connectors/lib/connector-release-lock.ts:23

## CMP-W212

**Connect Microsoft 365 apps (Outlook, OneDrive, SharePoint)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: Switched off: the Microsoft Graph connector exists but is not in the released list.
- Evidence: apps/web/lib/connectors/microsoft-graph.ts:512; packages/contracts/types/src/connector-release.ts:16

## CMP-W215

**Outlook shared and delegated mailboxes and calendars**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: No shared or delegated mailbox support, and the Microsoft connector is switched off.
- Evidence: searched: shared mailbox, delegated in apps/web/lib/connectors

## CMP-W216

**Personal Finance: balances and spending from linked banks**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: A read-only Finances page exists but has no sidebar link and its bank connector is switched off.
- Evidence: apps/web/shared/components/layout/app-nav-items.ts:39; apps/web/features/finance/components/FinanceDashboard.tsx:103

## CMP-W218

**Teams meeting transcripts and recording metadata**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: No tool reads meeting transcripts.
- Evidence: searched: transcript, meeting in apps/web/lib/connectors/microsoft-graph.ts

## CMP-W226

**Connect a Microsoft account as a guest of another tenant**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: No tenant ID or guest option exists; the Microsoft 365 connector itself is switched off.
- Evidence: searched: tenant id, guest account in apps/web/lib/connectors, features/connectors; apps/web/lib/connectors/catalog.ts:181

## CMP-W227

**Connect a personal Microsoft account (Outlook.com, OneDrive)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Only the work Microsoft 365 connector is catalogued and it is switched off; no personal-account connector exists.
- Evidence: searched: outlook.com, hotmail, consumers in apps/web/lib/connectors; apps/web/lib/connectors/catalog.ts:181

## CMP-W230

**Connect GitLab to read and change projects, merge requests and pipelines**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: GitLab is in the connector catalog but is not in the released list, so Connect is off.
- Evidence: apps/web/lib/connectors/catalog.ts:224

## CMP-W237

**Financial services plugin with built-in market data**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: No built-in financial data sources or finance onboarding.
- Evidence: searched: sec filings, edgar, quartr in apps/web/lib, features

## CMP-W239

**Healthcare plugins (clinical references, records, public data, prescribing)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: A lab-results skill and Health records exist; no clinical-reference, EHR, public-data or prescribing connectors.
- Evidence: searched: pubmed, rxnorm, epic, openfda in apps/web/lib, features

## CMP-W242

**OneNote notes: find, summarize, create and update**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: No OneNote connector or tool.
- Evidence: searched: onenote in apps/web/lib, features, packages

## CMP-W248

**Salesforce plugin with sales skills**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Sales skills ship (pipeline-review, deal-review, prospecting) but Salesforce is not a released connector.
- Evidence: apps/web/lib/connectors/catalog.ts:195

## CMP-W258

**Sync a GitHub repository into a project**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F023-03](../../20-features/023-project-workspace/F023-03-project-chats-files-sources-notes-and-artifacts-co.md), [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: Projects take uploads and Google Drive files only; GitHub repositories attach to cloud code sessions, not project knowledge.
- Evidence: searched: github in apps/web/features/projects, apps/web/app/api/projects

## CMP-WP164

**Connect GitHub from chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F055-03](../../20-features/055-connector-setup-and-account-management/F055-03-connect-with-sign-in-or-api-key.md), [F055-05](../../20-features/055-connector-setup-and-account-management/F055-05-account-name-identity-and-granted-permissions.md), [F055-06](../../20-features/055-connector-setup-and-account-management/F055-06-connection-health-test-and-reconnect.md), [F055-07](../../20-features/055-connector-setup-and-account-management/F055-07-disconnect-and-revoke.md), [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-02](../../20-features/098-integration-and-extensibility-components/F098-02-keep-connections-working.md)
- Detail: As a chat connector it is not in the released list GitHub works through the Code page and its GitHub App; as a chat connector it is not in the released list.
- Evidence: apps/web/features/code/code-surface.ts:31; packages/contracts/types/src/connector-release.ts:16

## CMP-WP166

**Health: records and health chats kept apart**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Connecting records is blocked because that connector is not released A Health space appears only for US personal accounts when the health connector is set up, but connecting records is blocked because that connector is not released.
- Evidence: apps/web/lib/services/health-space-service.ts:27; apps/web/lib/connectors/finish-authorization.ts:65

## CMP-WP177

**Data analysis plugin with dashboards**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: No warehouse access, so dashboards run on uploaded files only A bundled data-analysis skill and artifacts exist; no warehouse access, so dashboards run on uploaded files only.
- Evidence: .agents/skills/data-analysis; skills-lock.json (audience product)

## CMP-WP186

**Legal plugins (document management, case research, community skills)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: No document-management or case-research connectors Contract review and NDA triage skills ship; no document-management or case-research connectors.
- Evidence: skills-lock.json: review-contract, triage-nda (audience product)

## CMP-WP187

**Microsoft Teams actions (send messages, create chats and channels, Planner tasks)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Nothing sends a message or creates a chat The Teams connector tools only list chats, read chat messages, list teams and list channels; nothing sends a message or creates a chat.
- Evidence: apps/web/lib/connectors/microsoft-graph.ts:643-723

## GAP-CAP-connectors-apps-and-extensions-04

**Google Workspace connectors: Not released. Ledger email and calendar rows are partial on web, desktop and mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Requirement items: S56.01, S56.03, S56.04, S56.07, S56.09, S56.13, S56.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-05

**Microsoft 365 connectors: Gated Coming soon; many sub-features missing per comparison.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md), [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md), [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md), [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Requirement items: S56.01, S56.07, S56.17, S56.21
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-06

**GitHub and developer-tool connectors: GitHub Enterprise host, GitLab, repo sync into projects missing; OAuth redirect setup missing on test deployment.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Requirement items: S56.25, S56.26, S56.31, S56.32, S56.33
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-29

**Partner and role plugin packs: Role packs for sales, finance, healthcare missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Requirement items: S56.28, S56.29, S56.46, S56.47
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-32

**Health and bank account connections: Awaiting owner vendor agreement and legal check.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Requirement items: S56.46, S56.47
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F056-01-01

**Gmail and Outlook are not released, so email cannot be used on any app today.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Detail: Affects: All six apps, all users. Work needed: Owner decision to release the ids; finish Google verification and Microsoft app registration first.
- Evidence: packages/contracts/types/src/connector-release.ts:14-30

## GAP-F056-01-02

**Operator setup (descriptor, client pair, Google verification, security assessment) is not evidenced as done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Detail: Affects: Web, desktop, mobile, chrome, CLI, VS Code. Work needed: Owner completes setup, then a live journey is recorded.
- Evidence: docs/runbooks/connector-oauth-apps.md (Google section)

## GAP-F056-01-03

**No live verification of any mail journey is recorded in the repository.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Detail: Affects: All. Work needed: Run the real consent, read and draft journeys on the review build.
- Evidence: docs/development/connectors-setup.md (Gmail public-release gate); no recorded run found

## GAP-F056-01-04

**Brief per-app statuses (CLI 'reading missing', VS Code 'send missing') do not match code, which gives CLI and VS Code the same server tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Detail: Affects: CLI, VS Code. Work needed: Re-audit the brief or add a CLI/VS Code surface test.
- Evidence: apps/cli/src/claude_parity.rs:2772-2774; apps/cli/src/app_server/developer_host.rs:4557

## GAP-F056-01-05

**Outlook cannot draft or read attachments; the assistant can only send directly (with approval).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Detail: Affects: Outlook users on all apps. Work needed: Owner decision on Mail.ReadWrite and new adapter tools.
- Evidence: docs/development/connectors-setup.md (Outlook section); microsoft-graph.ts tool list

## GAP-F056-01-06

**Label tools are offered but unusable because gmail.modify is not admitted.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Detail: Affects: Gmail users. Work needed: Hide the tools or admit the scope by owner decision.
- Evidence: first-party.json:59-70; connector-scopes.ts:41

## GAP-F056-01-07

**No guarantee the assistant offers to connect a mailbox when none is connected.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Detail: Affects: All apps. Work needed: Check the connect suggestion path (mobile NewChatConnectorSuggestions) on every app.
- Evidence: user-connector-tools.ts:2536-2540

## GAP-F056-01-NOTBUILT

**Email (search, read, draft, attach, send): not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Requirement items: S56.02, S56.04, S56.05
- Detail: CLI: S56.02, S56.05; VS Code: S56.04, S56.05

## GAP-F056-01-PARTLY

**Email (search, read, draft, attach, send): partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-01](../../20-features/056-concrete-integration-families/F056-01-email-search-read-draft-attach-send.md)
- Requirement items: S56.01, S56.02, S56.03, S56.04, S56.05
- Detail: Web S56.01: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | Web S56.02: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | Web S56.03: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbooks/connector-oauth-apps.md; code (tools and scope ceiling) is in place | Web S56.04: owner: create the Google Gmail OAuth client, add the gmail entry to CONNECTOR_OAUTH_PROVIDERS_JSON and set its client id and secret in Vercel, per docs/runbook

## GAP-F056-02-01

**Calendar is not released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Detail: Affects: All apps. Work needed: Owner release decision after verification.
- Evidence: connector-release.ts:14-30

## GAP-F056-02-02

**Calendar read tools ask for approval because no metadata is declared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Detail: Affects: All apps. Work needed: Declare reads and writes for each Google Calendar tool and add tests.
- Evidence: tool-metadata.ts:863-883

## GAP-F056-02-03

**No evidence the Google Calendar OAuth client and descriptor exist in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Detail: Affects: All. Work needed: Owner setup.
- Evidence: docs/runbooks/connector-oauth-apps.md

## GAP-F056-02-04

**Outlook lacks free/busy, edit, cancel and invitation responses.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Detail: Affects: Outlook users. Work needed: Extend the adapter.
- Evidence: catalog.ts:179-181

## GAP-F056-02-05

**Brief per-app statuses (cli done, vscode missing) cannot be reproduced from code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Detail: Affects: CLI, VS Code. Work needed: Re-audit.
- Evidence: claude_parity.rs:2772-2774

## GAP-F056-02-06

**No recorded live run of any calendar journey.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Detail: Affects: All. Work needed: Record a run on a review build.
- Evidence: none found

## GAP-F056-02-NOTBUILT

**Calendar (search, free/busy, create, edit, invitations): not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Requirement items: S56.08, S56.09, S56.10, S56.11
- Detail: CLI: S56.11; VS Code: S56.08, S56.09, S56.10, S56.11

## GAP-F056-02-PARTLY

**Calendar (search, free/busy, create, edit, invitations): partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-02](../../20-features/056-concrete-integration-families/F056-02-calendar-search-free-busy-create-edit-invitations.md)
- Requirement items: S56.07, S56.08, S56.09, S56.10, S56.11
- Detail: Web S56.07: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | Web S56.08: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | Web S56.09: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/directory/sources/first-party.json | Web S56.10: owner: create the Google Calendar OAuth client and add the google-calendar entry with its client pair to CONNECTOR_OAUTH_PROVIDERS_JSON in Vercel; tools are declared in lib/connectors/direc

## GAP-F056-03-01

**Not released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-03](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)
- Detail: Affects: All apps. Work needed: Owner release decision.
- Evidence: connector-release.ts:14-30

## GAP-F056-03-02

**Brief cites mobile index.tsx:44 as listing Contacts; that line is an import.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-03](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)
- Detail: Affects: Mobile status 'done'. Work needed: Correct brief; verify mobile row appears.
- Evidence: apps/mobile/src/features/settings/cloud-connectors/index.tsx:44

## GAP-F056-03-03

**People MCP is a Developer Preview and may not be usable in public apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-03](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)
- Detail: Affects: All. Work needed: Owner checks preview eligibility.
- Evidence: docs/development/connectors-setup.md

## GAP-F056-03-04

**No evidence of descriptor and client in production, and no live run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-03](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)
- Detail: Affects: All. Work needed: Setup and recorded run.
- Evidence: none found

## GAP-F056-03-05

**CLI and VS Code brief 'missing' unverified against shared server tool list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-03](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)
- Detail: Affects: CLI, VS Code. Work needed: Re-audit.
- Evidence: claude_parity.rs:2772-2774

## GAP-F056-03-NOTBUILT

**Contacts lookup: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F056-03](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)
- Requirement items: S56.12
- Detail: CLI: S56.12; VS Code: S56.12

## GAP-F056-03-PARTLY

**Contacts lookup: partly built on Web, Desktop, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F056-03](../../20-features/056-concrete-integration-families/F056-03-contacts-lookup.md)
- Requirement items: S56.12
- Detail: Web S56.12: owner: enable the People API and People MCP API in Google Cloud and add the google-contacts entry with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET | Desktop S56.12: owner: enable the People API and People MCP API in Google Cloud and add the google-contacts entry with CONNECTOR_OAUTH_GOOGLE_CONTACTS_CLIENT_ID and _CLIENT_SECRET | Chrome S56.12: partials/mcp-web 4ce42bb0b: Google Contacts connects read-only to Google's People API MCP server (https://people.googleapis.com/mcp/v1, Developer Preview, page updated 2026-09-18) with contacts.readonly and directory.readonly, and its search_contacts, search_directory_people and get_user_profile tools are declared reads. It turns on when the owner enables the People API and People MCP API in the Google Cloud project and adds the google-contacts CONNECTOR_OAUTH_PROVIDERS_JSON descriptor with CONNECTOR_OAUTH_GOOGLE_CONTAC

## GAP-F056-04-01

**Drive is not released and routes refuse.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Detail: Affects: All apps. Work needed: Release decision.
- Evidence: connector-capability.ts:27-29; connector-release.ts:14-30

## GAP-F056-04-02

**No tool edits files, creates folders or manages sharing on Google Drive.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Detail: Affects: All apps (brief S56.16, S56.17 'done'). Work needed: Add tools or accept scope limits; fix brief.
- Evidence: first-party.json:3-15

## GAP-F056-04-03

**Drive search and read ask for approval since no metadata is declared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Detail: Affects: All apps. Work needed: Declare metadata.
- Evidence: tool-metadata.ts:863-883

## GAP-F056-04-04

**Dropbox and Box need pre-registered clients and are not released; Box folders and sharing need a scope that is refused.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Detail: Affects: Dropbox and Box users. Work needed: Owner setup and decisions.
- Evidence: mcp-endpoints.ts:118-126; docs/development/connectors-setup.md

## GAP-F056-04-05

**OneDrive and SharePoint are read-only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Detail: Affects: Microsoft users. Work needed: New adapter tools.
- Evidence: catalog.ts:187-188

## GAP-F056-04-06

**No live run recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Detail: Affects: All. Work needed: Run on a review build.
- Evidence: none found

## GAP-F056-04-NOTBUILT

**Cloud files (search, download, create, edit, folders and sharing): not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Requirement items: S56.17
- Detail: CLI: S56.17

## GAP-F056-04-PARTLY

**Cloud files (search, download, create, edit, folders and sharing): partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-04](../../20-features/056-concrete-integration-families/F056-04-cloud-files-search-download-create-edit-folders-an.md)
- Requirement items: S56.15
- Detail: Web S56.15: owner: add the google-drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON; create_file and drive.file are in place | Desktop S56.15: owner: add the google-drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON; create_file and drive.file are in place | Mobile S56.15: owner: add the Google Drive entry and client pair to CONNECTOR_OAUTH_PROVIDERS_JSON | Chrome S56.15: Available only when the operator adds a CONNECTOR_OAUTH_PROVIDERS_JSON entry for Google Drive.

## GAP-F056-05-01

**No Google Docs, Sheets or Slides editing connector exists, and no Word editing beyond file read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-05](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)
- Detail: Affects: All apps. Work needed: Decide and build.
- Evidence: catalog.ts:174; first-party.json

## GAP-F056-05-02

**Figma not released and not set up.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-05](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)
- Detail: Affects: All apps. Work needed: Owner setup and release.
- Evidence: connector-release.ts:16-30; mcp-endpoints.ts:96-100

## GAP-F056-05-03

**Design tools ask for approval because no metadata is declared.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-05](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)
- Detail: Affects: All apps. Work needed: Declare reads.
- Evidence: tool-metadata.ts:863-883

## GAP-F056-05-04

**Brief 'done' for web, desktop, mobile, Chrome is not supported.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-05](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)
- Detail: Affects: Brief accuracy. Work needed: Re-audit and correct.
- Evidence: first-party.json; catalog.ts

## GAP-F056-05-05

**CLI and VS Code design-to-code 'done' unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-05](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)
- Detail: Affects: CLI, VS Code. Work needed: Verify.
- Evidence: claude_parity.rs:2772

## GAP-F056-05-NOTBUILT

**Documents, spreadsheets, presentations and design files: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F056-05](../../20-features/056-concrete-integration-families/F056-05-documents-spreadsheets-presentations-and-design-fi.md)
- Requirement items: S56.18, S56.19, S56.20, S56.34
- Detail: CLI: S56.19, S56.20, S56.34; VS Code: S56.18, S56.19, S56.20, S56.34

## GAP-F056-06-01

**Slack and Teams not released; Slack not set up.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Affects: All apps. Work needed: Owner setup and release.
- Evidence: connector-release.ts:16-30; mcp-endpoints.ts:113-117

## GAP-F056-06-02

**No tool metadata for Slack, Notion, Confluence, so searches ask.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Affects: All apps. Work needed: Declare metadata.
- Evidence: tool-metadata.ts:863-883

## GAP-F056-06-03

**Slack posting tool name and behaviour unknown from the repository.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Affects: Slack users. Work needed: Inspect Slack's tool list at run time and declare posts as external sends.
- Evidence: first-party.json Slack entry

## GAP-F056-06-04

**Teams cannot search or post.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Affects: Teams users. Work needed: Out of scope per brief; confirm.
- Evidence: catalog.ts:183-186

## GAP-F056-06-05

**No live verification recorded for Notion or Confluence though released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Affects: All apps. Work needed: Record a run.
- Evidence: none found

## GAP-F056-06-06

**Brief per-app statuses cannot be reproduced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Detail: Affects: CLI, VS Code. Work needed: Re-audit.
- Evidence: claude_parity.rs:2772-2774

## GAP-F056-06-NOTBUILT

**Team chat and knowledge bases: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Requirement items: S56.21, S56.23, S56.24
- Detail: CLI: S56.23; VS Code: S56.21, S56.24

## GAP-F056-06-PARTLY

**Team chat and knowledge bases: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-06](../../20-features/056-concrete-integration-families/F056-06-team-chat-and-knowledge-bases.md)
- Requirement items: S56.21, S56.22
- Detail: Web S56.21: owner: register the Slack connector app with the search:read.* scopes and add the slack entry with its client pair (Teams has no verified hosted MCP server and stays out of scope) | Desktop S56.21: owner: register the Slack connector app with the search:read.* scopes and add the slack entry with its client pair (Teams has no verified hosted MCP server and stays out of scope) | Mobile S56.21: owner: register the Slack connector app with search:read.* scopes and add its entry; Teams stays out of scope (no verified hosted MCP server) | Chrome S56.21: Slack's search:read scopes are admitted (693fe31f9); the owner must register the Slack app with them and add its descriptor; Teams has no Microsoft-hosted MCP server that could be verified. Chrome chats use the same connectors through the account once connected in the web app, show each call as a step, and a send asks with its recip

## GAP-F056-07-01

**Lookups ask for approval on vendor tools; the brief says lookups run without approval.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Detail: Affects: All apps; Jira, Linear, Monday, ClickUp, Airtable, Todoist today; HubSpot and Intercom after release.. Work needed: Declare read metadata for named vendor tools or add a vetted read-only classification.
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:876-882, :1066-1083

## GAP-F056-07-02

**CRM and help-desk connectors are not released, so the 'done' status in the brief is not reachable by a user.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome, CLI, VS Code.. Work needed: Owner completes vendor client setup, then release the ids; live-check each.
- Evidence: packages/contracts/types/src/connector-release.ts:14-30

## GAP-F056-07-03

**Salesforce, Zendesk and Freshdesk have no connectable endpoint.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Detail: Affects: All apps.. Work needed: Pin a vendor MCP endpoint or accept custom connectors for them.
- Evidence: apps/web/lib/connectors/catalog.ts:195,240-241; apps/web/lib/connectors/oauth-setup.ts:155-162

## GAP-F056-07-04

**No end-to-end test for create, update or lookup on any released tracker.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Detail: Affects: Quality on all apps.. Work needed: Add contract tests with a fake MCP server.
- Evidence: No such test found in apps/web tests searched.

## GAP-F056-07-05

**CLI and VS Code have no tracker, board or CRM tooling of their own.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Detail: Affects: CLI and VS Code users.. Work needed: Decide if reaching them through the Cloud turn is enough; document it.
- Evidence: apps/cli/src/cloud/connectors.rs (list and disconnect only); apps/extension-vscode/src/features/connectors/

## GAP-F056-07-NOTBUILT

**Tickets, issues, boards and CRM records: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md)
- Requirement items: S56.25, S56.26, S56.27, S56.28, S56.29, S56.30
- Detail: CLI: S56.25, S56.26, S56.27, S56.28, S56.29, S56.30; VS Code: S56.25, S56.26, S56.27, S56.28, S56.29, S56.30

## GAP-F056-08-01

**Hosted repository search and CI status/logs have no declared tools and no released connector.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome.. Work needed: Owner creates the GitHub App with Actions read and sets the github-mcp client; release the id; declare read metadata.
- Evidence: first-party.json github-mcp entry lists no tools; connector-release.ts:16-30 omits github-mcp

## GAP-F056-08-02

**VS Code has no CI status or deployment command.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: Affects: VS Code users.. Work needed: Add commands through gh or document the Cloud turn path.
- Evidence: No CI or deploy code found in apps/extension-vscode/src.

## GAP-F056-08-03

**Deployment tools (Vercel) all ask, reads included.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: Affects: Cloud turns once released.. Work needed: Declare read metadata for list and inspect tools.
- Evidence: tool-metadata.ts:876-882

## GAP-F056-08-04

**CircleCI, GitLab, Bitbucket cannot be connected.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: Affects: All apps.. Work needed: Pin endpoints or leave out of scope as the brief states for GitLab.
- Evidence: apps/web/lib/connectors/catalog.ts; oauth-setup.ts:155-162

## GAP-F056-08-05

**No test found that runs the CLI review end to end against a fake gh.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Detail: Affects: CLI quality.. Work needed: Add a fake-gh test.
- Evidence: apps/cli/src/review.rs has no tests of run_gh found

## GAP-F056-08-NOTBUILT

**Code, pull requests, CI and deployments: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Requirement items: S56.33, S56.39
- Detail: VS Code: S56.33, S56.39

## GAP-F056-08-PARTLY

**Code, pull requests, CI and deployments: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-08](../../20-features/056-concrete-integration-families/F056-08-code-pull-requests-ci-and-deployments.md)
- Requirement items: S56.31, S56.33
- Detail: Web S56.31: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | Web S56.33: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | Desktop S56.31: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | Desktop S56.33: owner: create the GitHub App (Actions read for S56.33) and add the github-mcp entry with CONNECTOR_OAUTH_GITHUB_MCP_CLIENT_ID and _CLIENT_SECRET; github-mcp is pinned (GitLab has no pinned server) | Mobile S56.31: owner: create the GitHub App (Act

## GAP-F056-09-01

**No read-only guard for database queries.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-09](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)
- Detail: Affects: All apps using Cloud turns.. Work needed: Decide the rule (vendor role, tool annotation allow list, or SQL check) and implement it.
- Evidence: tool-metadata.ts:876-882 treats the tool as a write; no SQL check found.

## GAP-F056-09-02

**Custom and warehouse connectors are blocked by the release gate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-09](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome.. Work needed: Release state change or a selective rule for custom ids.
- Evidence: user-connector-tools.ts:2491-2493; connector-release.test.ts

## GAP-F056-09-03

**No live check of Snowflake or Databricks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-09](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)
- Detail: Affects: Quality.. Work needed: Owner live-check with real accounts.
- Evidence: brief S56.37 'Unfinished'

## GAP-F056-09-04

**No tests for account-URL rules.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-09](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)
- Detail: Affects: Quality.. Work needed: Add tests for host suffix and path patterns.
- Evidence: No test file references ACCOUNT_URL_CONNECTORS.

## GAP-F056-09-05

**No dashboard-creation capability is declared; the brief's CLI 'done' is not backed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-09](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)
- Detail: Affects: All apps.. Work needed: Identify a vendor tool, declare it, and test.
- Evidence: apps/cli/src/agent/chat.rs:956-975 is compaction.

## GAP-F056-09-NOTBUILT

**Databases, warehouses and dashboards: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F056-09](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)
- Requirement items: S56.36, S56.37, S56.38
- Detail: CLI: S56.36, S56.37, S56.38; VS Code: S56.36, S56.37, S56.38

## GAP-F056-09-PARTLY

**Databases, warehouses and dashboards: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-09](../../20-features/056-concrete-integration-families/F056-09-databases-warehouses-and-dashboards.md)
- Requirement items: S56.37, S56.38
- Detail: Web S56.37: live-check with the owner's warehouse accounts: add a Snowflake connector by account URL (OAuth client or PAT) and a Databricks one; sign-in completes and a query tool runs | Desktop S56.37: live-check with the owner's warehouse accounts: add a Snowflake connector by account URL (OAuth client or PAT) and a Databricks one; sign-in completes and a query tool runs | Chrome S56.37: partials/mcp-web 2e08cf2e6: Snowflake and Databricks are added by account URL, as custom connectors are in Claude (support.claude.com/en/articles/11175166, 2026-09-28): the cards open the custom connector form with the vendor's MCP URL format, documentation link and OAuth client fields, and a URL on either vendor's host must use that vendor's MCP path (docs.snowflake.com cortex-agents-mcp GA; docs.databricks.com managed-mcp Public Preview, updated 2026-09-21). Neither vendor supports dynamic client reg

## GAP-F056-10-01

**No device notes tool.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Affects: Mobile (and all other apps).. Work needed: Decide scope; build or drop 'notes' from S56.45.
- Evidence: packages/contracts/types/src/phone-steps.ts:5-10

## GAP-F056-10-02

**Bank accounts is built but unreleased and hidden on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Affects: All apps.. Work needed: Owner Plaid steps, legal review, release id, flip bankLinking and remove mobile exclusion.
- Evidence: connector-release.ts:16-30; v1FeatureFlags.ts:30; plaid-config.ts:15

## GAP-F056-10-03

**Health is switched off and unconfigured; brief statuses 'mobile health done' and 'vscode health done' have no matching code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Affects: All apps.. Work needed: Correct the brief; owner decision on enabling.
- Evidence: sensitive-data-connectors.ts; apps/mobile/src/features/settings/cloud-connectors/index.tsx has no health code

## GAP-F056-10-04

**Phone steps not available on Desktop, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Affects: Those apps.. Work needed: Decide if needed; Desktop local calendar would need its own host.
- Evidence: apps/web/features/desktop-host/lib/device-steps.ts:432

## GAP-F056-10-05

**Brief cites migration 0349 for bank items; the file is 0350.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Detail: Affects: Docs and audit.. Work needed: Correct the brief reference.
- Evidence: apps/web/db/neon/0350_bank_account_items.sql

## GAP-F056-10-NOTBUILT

**Personal data: bank, health and device notes: not built on Desktop, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI, VS Code
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Requirement items: S56.45, S56.46, S56.47
- Detail: Desktop: S56.45; CLI: S56.45, S56.46, S56.47; VS Code: S56.45, S56.46, S56.47

## GAP-F056-10-PARTLY

**Personal data: bank, health and device notes: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md)
- Requirement items: S56.46, S56.47
- Detail: Web S56.46: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off | Web S56.47: code complete (partials/mobile-features deeb0742ae): Hosted Link from the phone, several banks per account (migration 0349_bank_account_items), per-bank removal and per-account include switches on web and mobile, Hosted Link ownership hardening. Left: owner Plaid steps (agreement, production transactions, compliance, PLAID_CLIENT_ID/SECRET/ENV), migration apply, device check of the auth session | Desktop S56.46: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health

## GAP-F056-11-01

**No connector for research, shopping, bookings, media or messaging.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-11](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)
- Detail: Affects: All apps.. Work needed: Design, approval rules and build per family; owner decision on scope.
- Evidence: No code found; catalog entries lack endpoints (catalog.ts:226-228).

## GAP-F056-11-02

**The brief marks web, desktop, mobile and Chrome as partial or unverified while the code shows only directory listings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-11](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)
- Detail: Affects: Audit accuracy.. Work needed: Correct the status.
- Evidence: vendor-directory.json entries have no AGI tool code.

## GAP-F056-11-03

**No native messaging integration of any kind.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F056-11](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)
- Detail: Affects: All apps.. Work needed: Decide if in scope; messaging needs per-app OS integration and strict consent.
- Evidence: Search for iMessage found only unrelated names.

## GAP-F056-11-NOTBUILT

**Consumer services not built yet: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F056-11](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)
- Requirement items: S56.40, S56.41, S56.42, S56.43, S56.44
- Detail: Web: S56.44; Desktop: S56.44; CLI: S56.40, S56.41, S56.42, S56.43, S56.44; VS Code: S56.40, S56.41, S56.42, S56.43, S56.44; Chrome: S56.44

## GAP-F056-11-PARTLY

**Consumer services not built yet: partly built on Web, Desktop, Mobile, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F056-11](../../20-features/056-concrete-integration-families/F056-11-consumer-services-not-built-yet.md)
- Requirement items: S56.40, S56.41, S56.42, S56.43
