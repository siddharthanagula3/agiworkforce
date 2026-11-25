---
id: "GAPS-AREA-054"
type: "gap-list"
title: "Gaps: Plugin marketplace and customization"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 54. Plugin marketplace and customization

100 open gaps that touch this area. Area page: [20-features/054-plugin-marketplace-and-customization](../../20-features/054-plugin-marketplace-and-customization/README.md).

## CMP-CP193

**Plugins and plugin marketplaces**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Marketplace installs do not reach the CLI: agi marketplace get only records the install on the account and says it is l… Local plugins work, but marketplace installs do not reach the CLI: agi marketplace get only records the install on the account and says it is listed on the web and desktop apps (apps/cli/src/lib.rs:7558-7571,5077-5083). No code loads the plugin hooks, commands, agents or MCP servers of an account in
- Evidence: apps/cli/src/lib.rs:2013 (PluginSubcommand); apps/cli/src/tui/tui_app.rs:6226-6233

## CMP-CP212

**Marketplace sources beyond GitHub**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No local-path or hosted-JSON marketplaces marketplace add takes a public GitHub repository; plugins install from a path or git URL; no local-path or hosted-JSON marketplaces.
- Evidence: apps/cli/src/lib.rs:2336

## CMP-DP91

**Curated role plugin packs and single-app plugins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F056-07](../../20-features/056-concrete-integration-families/F056-07-tickets-issues-boards-and-crm-records.md), [F056-10](../../20-features/056-concrete-integration-families/F056-10-personal-data-bank-health-and-device-notes.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No curated role packs were found The directory lists plugins and connectors; no curated role packs were found.
- Evidence: apps/web/features/directory/constants.ts

## CMP-VP49

**Add, refresh and remove plugin marketplaces**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Marketplaces are managed only with the agi marketplace commands in a terminal Marketplaces are managed only with the agi marketplace commands in a terminal; the editor Plugins view installs from a Git URL or folder.
- Evidence: apps/cli/src/lib.rs:7470-7480; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:344-372

## CMP-VP56

**Plugins and plugin marketplaces**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Ours installs only from a Git URL or folder with a sha256 pin, toggles and removes (apps/extension-vscode/src/features/… Claude's /plugins dialog has Plugins and Marketplaces tabs, three install scopes, an options form and uninstall choices (claude-code/docs_en_vs-code.md.md, Manage plugins). Ours installs only from a Git URL or folder with a sha256 pin, toggles and removes (apps/extension-vscode/src/features/surfaces
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:337-400

## CMP-W259

**Sync a plugin marketplace from GitLab**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: Plugin marketplaces accept GitHub repository URLs only.
- Evidence: apps/web/lib/services/plugin-marketplace-service.ts:66-67

## CMP-WP170

**Add a plugin marketplace (curated sources or a GitHub repository)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: There is no GitHub account picker Add marketplace offers Browse AGI sources and a repository URL with branch; there is no GitHub account picker.
- Evidence: packages/ui/ui/src/directory/constants.ts:228; packages/ui/ui/src/directory/constants.ts:233

## CMP-WP172

**Admin switches for who may use, upload, share and publish plugins and skills**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F055-04](../../20-features/055-connector-setup-and-account-management/F055-04-organization-shared-connectors.md), [F058-07](../../20-features/058-mcp-and-interactive-extension-products/F058-07-organization-approved-server-catalog.md), [F098-01](../../20-features/098-integration-and-extensibility-components/F098-01-connect-a-service-account.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No separate upload, share or publish rights One workspace switch each for skills and plugins plus allow and block lists; no separate upload, share or publish rights.
- Evidence: apps/web/features/workspace-console/components/WorkspaceFeatureControls.tsx:40-64; WorkspaceConnectorPolicy.tsx:147-236

## CMP-WP179

**Developer portal: submit a plugin, track review, see usage**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: There are no usage analytics for the author Plugin submissions have pending, approved, rejected and suspended states with scan findings; there are no usage analytics for the author.
- Evidence: apps/web/lib/services/plugin-submission-service.ts:21-40; apps/web/features/directory/services/plugins-directory.ts:528

## CMP-WP192

**Security scan of uploaded skills and plugins**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No pass, warn or fail scan of uploaded skills was found Plugins get a scan with a review verdict that a user must acknowledge and an admin moderation queue; no pass, warn or fail scan of uploaded skills was found.
- Evidence: apps/web/app/api/plugins/[id]/scan/route.ts:25; apps/web/features/workspace-console/components/WorkspacePlugins.tsx:465; apps/web/features/admin/pages/PluginModerationPage.tsx:886

## CMP-WP195

**Submit a plugin to the vendor directory and directory safety policy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No published listing policy page was found Plugins have a submission and moderation queue, but no published listing policy page was found.
- Evidence: apps/web/features/admin/pages/PluginModerationPage.tsx; searched: directory policy in apps/web/app

## CMP-X17

**Plugins entry in the + menu**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Detail: No plugins menu; searched: plugin in apps/extension/src.
- Evidence: searched: plugin in apps/extension/src

## GAP-AREA054-LW03

**The customize route calls the request-token check without the user id, while the install route passes it. This may be intended, but it is inconsistent.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-054
- Detail: Area 54. Plugin marketplace and customization
- Evidence: apps/web/app/api/plugins/customize/route.ts:24 versus apps/web/app/api/plugins/installations/route.ts:45

## GAP-AREA054-LW05

**Featured and recommended plugins are missing. The only featured flag in the directory code belongs to connectors, not plugins.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-054
- Detail: Area 54. Plugin marketplace and customization
- Evidence: apps/web/features/directory/services/connectors-directory.ts:601-621

## GAP-AREA054-LW06

**The scan route only reads a scan result (GET). The code that starts a scan was not traced in this pass.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-054
- Detail: Area 54. Plugin marketplace and customization
- Evidence: apps/web/app/api/plugins/[id]/scan/route.ts (handleGet)

## GAP-CAP-connectors-apps-and-extensions-22

**Security scan of skills and plugins: Comparison marks plugin scan partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.32, S98.28
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-23

**Plugins: bundles of skills, connectors and commands: Conflict: surface-feature-matrix says mobile plugins absent (canUsePlugins false) while comparison cites mobile plugin screens. Chrome and VS Code install missing; many CLI author tools missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md), [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md), [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md), [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md), [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.02, S54.12, S54.13, S54.14, S54.15, S54.16, S54.17, S54.19, S54.21, S54.22, S54.24, S54.25, S54.26, S54.29, S54.33, S98.17, S98.18, S98.19, S98.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-24

**Plugin marketplaces and admin distribution: GitLab sync, installation approval request, featured and recommended plugins missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md), [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md), [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md), [F098-08](../../20-features/098-integration-and-extensibility-components/F098-08-find-and-install-plugins.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.05, S54.06, S54.07, S54.30, S98.25, S98.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-connectors-apps-and-extensions-30

**Publisher submission and directory safety policy: No report-plugin or publisher analytics; no public policy text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md), [F098-09](../../20-features/098-integration-and-extensibility-components/F098-09-plugin-trust-and-organization-rollout.md)
- Requirement items: S54.36, S54.37, S54.38, S98.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F054-01-01

**No unified Customize destination on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)
- Detail: Affects: CLI, VS Code and Chrome users. Work needed: Decide whether a unified entry is wanted on terminal surfaces; build it or record the decision.
- Evidence: apps/extension-vscode/package.json:753-781; apps/cli/src/tui/widgets/screen_renderers.rs:519-572

## GAP-F054-01-02

**Product documents say mobile and VS Code have no plugin support, but code exists on both.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)
- Detail: Affects: Anyone reading docs or planning work. Work needed: Regenerate or correct the matrix; fix the hard-coded mobile:false, cli:false, vscode:false in the managed-plugins descriptor (packages/contracts/types/src/capabilities.ts:305-307) if those surfaces are meant to count.
- Evidence: docs/product/surface-feature-matrix.md:376-378 versus apps/mobile/src/features/plugins/PluginsScreen.tsx and apps/extension-vscode/src/features/surfaces/accountMarketplace.ts

## GAP-F054-01-03

**Chrome extension has no skills, connectors or plugins area.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)
- Detail: Affects: Chrome users. Work needed: Product decision, then a surface in the side panel.
- Evidence: apps/extension/src (only cloud-bridge/skillsClient.ts mentions skills)

## GAP-F054-01-04

**CLI Discover tab text implies the public directory can be searched.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)
- Detail: Affects: CLI users. Work needed: Change the text or add public-directory search.
- Evidence: apps/cli/src/tui/widgets/screen_renderers.rs:525 versus apps/cli/src/cloud/marketplaces.rs:145-153

## GAP-F054-01-05

**Empty and failure states of Customize were not exercised by any test I read for the Skills and Connectors tabs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)
- Detail: Affects: Web and Desktop. Work needed: Add tests or confirm existing ones.
- Evidence: not traced

## GAP-F054-01-NOTBUILT

**Customize area and tabs: not built on Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, Chrome
- Features: [F054-01](../../20-features/054-plugin-marketplace-and-customization/F054-01-customize-area-and-tabs.md)
- Requirement items: S54.01, S54.02, S54.03
- Detail: Mobile: S54.01, S54.02; CLI: S54.01; Chrome: S54.01, S54.02, S54.03

## GAP-F054-02-01

**Web does not use the server sort, offset or verified filter; there is no sort control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Detail: Affects: Web and Desktop users. Work needed: Add UI controls or remove unused server options.
- Evidence: apps/web/features/directory/services/plugins-directory.ts:149, 219-254

## GAP-F054-02-02

**CLI search and browse cover only marketplaces on the account; public marketplace search from the CLI is unverified or missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Detail: Affects: CLI users. Work needed: Add a public-catalogue search command or document the limit.
- Evidence: apps/cli/src/cloud/marketplaces.rs:145-153

## GAP-F054-02-03

**Categories are free text from entries; no curated role or use-case list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Detail: Affects: All browsing users. Work needed: Define a category taxonomy in the registry and map imported entries.
- Evidence: apps/web/features/plugins/server/directory/query.ts:48-65

## GAP-F054-02-04

**The public catalogue depends on an outside public directory and a third-party marketplace repository; terms of that use were not found in the files I read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Detail: Affects: Product and legal owners. Work needed: Confirm permission and fallback if the outside source changes or disappears.
- Evidence: apps/web/features/plugins/server/directory/constants.ts:1-17

## GAP-F054-02-05

**No plugin browsing on Chrome; VS Code has no filters.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Detail: Affects: Chrome and VS Code users. Work needed: Product decision.
- Evidence: apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:83-107

## GAP-F054-02-NOTBUILT

**Browse and search the marketplace: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Requirement items: S54.05, S54.08, S54.09
- Detail: CLI: S54.09; Chrome: S54.05, S54.08, S54.09

## GAP-F054-02-PARTLY

**Browse and search the marketplace: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F054-02](../../20-features/054-plugin-marketplace-and-customization/F054-02-browse-and-search-the-marketplace.md)
- Requirement items: S54.05, S54.08

## GAP-F054-03-01

**Mobile cannot add a marketplace (hidden by flag).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Detail: Affects: Mobile users. Work needed: Decide: enable the form or delete it.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:32; apps/mobile/src/features/plugins/PluginSourcesScreen.tsx:267

## GAP-F054-03-02

**Web dialog lacks the optional name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Detail: Affects: Web and Desktop users. Work needed: Add the field or drop the option.
- Evidence: packages/ui/ui/src/directory/constants.ts:226-236

## GAP-F054-03-03

**No visible per-user cap on sources and no per-source size cap found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Detail: Affects: Server load. Work needed: Confirm limits in fetchMarketplaceManifest or add caps.
- Evidence: apps/web/lib/services/plugin-marketplace-service.ts:839-907

## GAP-F054-03-04

**Error status for non-GitHub address is 422 while the brief and the route copy imply a simple refusal.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Detail: Affects: API clients. Work needed: Align the status and message.
- Evidence: apps/web/app/api/plugins/marketplaces/route.ts:46-56

## GAP-F054-03-05

**Chrome extension has no marketplace support.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Detail: Affects: Chrome users. Work needed: Product decision.
- Evidence: apps/extension/src

## GAP-F054-03-06

**CLI add, sources, remove do not check the plan capability the other marketplace commands check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Detail: Affects: CLI users on plans that deny the marketplace. Work needed: Confirm intent and align.
- Evidence: apps/cli/src/lib.rs:7499-7527 versus 7529-7560

## GAP-F054-03-NOTBUILT

**Add a git repository as a marketplace: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F054-03](../../20-features/054-plugin-marketplace-and-customization/F054-03-add-a-git-repository-as-a-marketplace.md)
- Requirement items: S54.07
- Detail: Chrome: S54.07

## GAP-F054-04-01

**No installation approval request flow.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Detail: Affects: Members and admins on all six apps. Work needed: Design request record, admin queue, notification and audit; build UI on web and mobile.
- Evidence: No matching code in apps/web/features/plugins, apps/web/features/directory, apps/web/lib/services/organization-plugin-service.ts, apps/mobile/src/features/plugins

## GAP-F054-04-02

**No assignment to named members; only organization-wide and group settings.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Detail: Affects: Admins. Work needed: Decide if needed; add member overrides or document group-of-one.
- Evidence: apps/web/lib/services/organization-plugin-service.ts:306-350

## GAP-F054-04-03

**Admin management only on web (and Desktop through the web page).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Detail: Affects: Admins on mobile, CLI, VS Code. Work needed: Product decision.
- Evidence: WorkspacePlugins.tsx is the only admin UI

## GAP-F054-04-04

**Workspace plugins cannot depend on other plugins.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Detail: Affects: Admins publishing bundles. Work needed: Allow dependencies or document.
- Evidence: apps/web/app/api/settings/organization/plugins/route.ts:37-38

## GAP-F054-04-05

**CLI and VS Code do not show workspace plugins.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Detail: Affects: Developers in a workspace. Work needed: Add read-only listing.
- Evidence: apps/cli/src and apps/extension-vscode/src: no organization plugin calls found

## GAP-F054-04-NOTBUILT

**Organization private marketplace and admin assignment: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F054-04](../../20-features/054-plugin-marketplace-and-customization/F054-04-organization-private-marketplace-and-admin-assignm.md)
- Requirement items: S54.06, S54.30, S54.31
- Detail: Web: S54.31; Desktop: S54.31; CLI: S54.06, S54.30, S54.31; VS Code: S54.06, S54.30, S54.31; Chrome: S54.06, S54.30, S54.31

## GAP-F054-05-01

**No editorial featured plugins.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-05](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)
- Detail: Affects: All six apps. Work needed: Add field, admin control, UI shelf.
- Evidence: no featured field found in plugin code; apps/web/features/directory/services/connectors-directory.ts:621 only for connectors

## GAP-F054-05-02

**Recommended exists only on mobile and CLI with different rules; web and Desktop have none.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-05](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)
- Detail: Affects: Web and Desktop users; consistency. Work needed: Share one rule in a package and show it on web.
- Evidence: apps/mobile/src/features/plugins/pluginsModel.ts:163; apps/cli/src/cloud/marketplaces.rs:196

## GAP-F054-05-03

**The brief and docs say missing on all apps, while code has derived versions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-05](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)
- Detail: Affects: Planning. Work needed: Update the brief status to partial.
- Evidence: apps/mobile/src/features/plugins/PluginsScreen.tsx:786-808

## GAP-F054-05-04

**Mobile test name says featured but the screen says Popular.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-05](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)
- Detail: Affects: Test readers. Work needed: Rename the test.
- Evidence: apps/mobile/src/features/plugins/__tests__/PluginsScreens.test.tsx:230

## GAP-F054-05-05

**Popular relies on install counts that may be zero for external marketplace entries.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-05](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)
- Detail: Affects: Quality of the shelf. Work needed: Verify counts for marketplace entries.
- Evidence: apps/web/features/plugins/server/directory/query.ts:77-79

## GAP-F054-05-NOTBUILT

**Featured, recommended and categories: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F054-05](../../20-features/054-plugin-marketplace-and-customization/F054-05-featured-recommended-and-categories.md)
- Requirement items: S54.10, S54.11
- Detail: VS Code: S54.10, S54.11; Chrome: S54.10, S54.11

## GAP-F054-06-01

**VS Code shows only skills for installed plugins; no publisher, agents, commands, hooks or works-with.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Detail: Affects: VS Code users. Work needed: Add the detail rows from the CLI plugin info output.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:495-500

## GAP-F054-06-02

**Brief says mobile detail missing; code has it. Product matrix also says absent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Detail: Affects: Planning. Work needed: Update brief and matrix.
- Evidence: apps/mobile/src/features/plugins/PluginDetailScreen.tsx; docs/product/surface-feature-matrix.md:376

## GAP-F054-06-03

**CLI info lists counts for commands and agents, not names.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Detail: Affects: CLI users. Work needed: Print names.
- Evidence: apps/cli/src/features/plugins/plugins.rs:480-488

## GAP-F054-06-04

**Works-with vocabulary is Web, CLI, Cowork from an outside source, not AGI's six surfaces.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Detail: Affects: All users reading 'Works with'. Work needed: Map to AGI surfaces.
- Evidence: apps/web/features/directory/constants.ts:150-154; apps/web/features/plugins/server/directory/constants.ts:76-84

## GAP-F054-06-05

**No plugin detail on Chrome; no detail for public-directory plugins in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Detail: Affects: Chrome and CLI users. Work needed: Product decision.
- Evidence: apps/extension/src; apps/cli/src/lib.rs:6810

## GAP-F054-06-06

**Whether bundled hooks truly run after a CLI install was not traced end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Detail: Affects: Plugin authors. Work needed: Trace and add a test.
- Evidence: apps/cli/src/features/hooks/hooks.rs not read in detail

## GAP-F054-06-NOTBUILT

**Plugin detail: what it includes and what it needs: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F054-06](../../20-features/054-plugin-marketplace-and-customization/F054-06-plugin-detail-what-it-includes-and-what-it-needs.md)
- Requirement items: S54.12, S54.13, S54.14, S54.15, S54.16, S54.17, S54.18, S54.20
- Detail: CLI: S54.13, S54.20; VS Code: S54.12, S54.13, S54.15, S54.16, S54.17, S54.18, S54.20; Chrome: S54.12, S54.13, S54.14, S54.15, S54.16, S54.17, S54.20

## GAP-F054-07-01

**The brief says CLI permissions and scan are 'not in the brief'; the code shows no permission list or scan result in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Detail: Affects: CLI users installing plugins that run hooks and servers. Work needed: Decide the CLI contract and, if wanted, print declared permissions and a scan verdict at install.
- Evidence: apps/cli/src/features/plugins/plugins.rs:533 is the only permission wording

## GAP-F054-07-02

**The brief and docs/product/surface-feature-matrix.md:376 record mobile plugins as missing; mobile has install, permissions, scan, compatibility, update and remove screens.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Detail: Affects: Anyone reading the brief as truth for mobile. Work needed: Correct the brief and matrix; verify the mobile screens on a device.
- Evidence: apps/mobile/src/features/plugins/PluginDetailScreen.tsx:369,453,459; apps/mobile/src/features/customize/CustomizeScreen.tsx:44

## GAP-F054-07-03

**The brief says VS Code permissions are missing; the Cloud marketplace install dialog lists them, but local plugin installs show no permission list and no scan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Detail: Affects: VS Code users. Work needed: Show permissions and scan for local installs, or record the decision not to.
- Evidence: apps/extension-vscode/src/features/surfaces/accountMarketplace.ts:122; capabilityManagement.ts:340

## GAP-F054-07-04

**Missing-dependency repair is not an offer to install; dependencies install automatically at install time, and a later unmet dependency only gives an error message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Detail: Affects: Web, desktop and mobile users who turned off a dependency. Work needed: Add a repair row that turns on or reinstalls the dependency.
- Evidence: apps/web/app/api/plugins/installations/[id]/route.ts:61-68; useDirectoryAdapter.ts:1774-1812

## GAP-F054-07-05

**Directory (GitHub) plugins are installable without a recorded scan and show 'Not scanned'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Detail: Affects: Web and desktop users installing public directory plugins. Work needed: Decide whether to scan before install or label the risk in the install confirm.
- Evidence: apps/web/features/plugins/server/directory/install.ts (no scan call); plugin-marketplace-service.ts:1042-1062

## GAP-F054-07-06

**PATCH turn-on does not re-run the org policy gate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Detail: Affects: Orgs that block a plugin after members installed it. Work needed: Confirm intended behaviour; add the gate to turn-on if policy should apply.
- Evidence: apps/web/app/api/plugins/installations/[id]/route.ts:49-102 has no call to refusePluginInstall

## GAP-F054-07-07

**No Chrome extension support for any of this.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Detail: Affects: Chrome extension users. Work needed: Product decision on whether Chrome needs plugins.
- Evidence: no plugin reference under apps/extension/src

## GAP-F054-07-NOTBUILT

**Safety before install: permissions, scan, compatibility, dependencies: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F054-07](../../20-features/054-plugin-marketplace-and-customization/F054-07-safety-before-install-permissions-scan-compatibili.md)
- Requirement items: S54.19, S54.32, S54.33, S54.34
- Detail: CLI: S54.19, S54.32, S54.34; Chrome: S54.19, S54.32, S54.33, S54.34

## GAP-F054-08-01

**Brief says CLI settings are 'not in the brief'; they exist (agi plugin configure).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Detail: Affects: CLI documentation and tests. Work needed: Add the item to the brief and a test.
- Evidence: apps/cli/src/lib.rs:6993; apps/cli/src/installs.rs:502

## GAP-F054-08-02

**Brief says mobile install and configure are missing; mobile has install, permission alert and skill switches.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Detail: Affects: Mobile status reporting. Work needed: Correct the brief; verify on a device.
- Evidence: apps/mobile/src/features/plugins/usePluginActions.ts:65-84; PluginDetailScreen.tsx:353,549

## GAP-F054-08-03

**Brief says VS Code install is not listed; VS Code can install local plugins and Cloud marketplace entries.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Detail: Affects: VS Code status reporting. Work needed: Correct the brief.
- Evidence: capabilityManagement.ts:319; accountMarketplace.ts:20

## GAP-F054-08-04

**The draft said 'press connect for each bundled connection'; for bundled servers the plugin page hides Connect and shows no status.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Detail: Affects: Web and desktop users with plugins that ship their own servers. Work needed: Add a sign-in action or deep link for bundled servers on the plugin page.
- Evidence: PluginDetailView.tsx:593-600; plugins-directory.ts:1060-1072

## GAP-F054-08-05

**Registry packs do not register connectors on install.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Detail: Affects: Web, mobile users of built-in packs that bundle servers (if any do). Work needed: Check whether any built-in pack bundles servers; if so wire it.
- Evidence: installations/route.ts has no registerPluginConnectors call

## GAP-F054-08-06

**CLI and VS Code local installs do not apply org policy or Cloud entitlement.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Detail: Affects: Org admins. Work needed: Product decision; document the boundary.
- Evidence: apps/cli/src/installs.rs:85-125 uses only signature policy

## GAP-F054-08-07

**No Chrome install path.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Detail: Affects: Chrome users. Work needed: Product decision.
- Evidence: no plugin reference under apps/extension/src

## GAP-F054-08-NOTBUILT

**Install, configure and bundled connections: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F054-08](../../20-features/054-plugin-marketplace-and-customization/F054-08-install-configure-and-bundled-connections.md)
- Requirement items: S54.21, S54.22, S54.23
- Detail: CLI: S54.22; Chrome: S54.21, S54.22, S54.23

## GAP-F054-09-01

**Web Uninstall fires without a confirmation unless dependents exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Web and desktop-hosted users. Work needed: Wrap uninstall in useConfirmAction naming what is lost (skills, settings, connectors).
- Evidence: DirectoryPanel.tsx:549-551; DirectoryDetailHeader.tsx:137-147; AGENTS.md section 9

## GAP-F054-09-02

**Mobile turn-off does not offer 'turn off together'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Mobile users. Work needed: Catch PluginDependentsError and retry with withDependents after a confirm.
- Evidence: apps/mobile/src/features/plugins/usePluginActions.ts:86-102 versus web useDirectoryAdapter.ts:1860-1890

## GAP-F054-09-03

**Update and version choice exist for built-in packs only on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Users of directory and marketplace plugins. Work needed: Decide if directory plugins get versions; add an offer path.
- Evidence: useDirectoryAdapter.ts:1029-1041

## GAP-F054-09-04

**Pin is implicit; an admin rollback moves installs off the withdrawn version.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Users who chose a version. Work needed: Confirm intent; document or add an explicit pin.
- Evidence: plugin-lifecycle.ts:553-562

## GAP-F054-09-05

**Brief says mobile is missing for all four; mobile has enable, update, version switch and remove.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Status accuracy. Work needed: Correct the brief; verify on a device.
- Evidence: PluginDetailScreen.tsx:353,360,472-520

## GAP-F054-09-06

**Brief says VS Code has enable/disable only; it also has update and remove (user-installed plugins).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Status accuracy. Work needed: Correct the brief.
- Evidence: capabilityManagement.ts:497-516

## GAP-F054-09-07

**CLI disable and remove ignore dependents.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: CLI users with dependent plugins. Work needed: Add a dependents check or document it.
- Evidence: apps/cli/src/installs.rs:330-356,464-480

## GAP-F054-09-08

**Turn on, update and uninstall do not re-check org policy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Org admins. Work needed: Decide whether policy applies after install.
- Evidence: installations/[id]/route.ts:49-145

## GAP-F054-09-09

**The lifecycle action 'restore' has no route handler.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Detail: Affects: Platform admins. Work needed: Wire or remove the action.
- Evidence: plugin-lifecycle.ts:33 vs lifecycle/route.ts:31-64

## GAP-F054-09-NOTBUILT

**Turn off, update, pin, uninstall: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F054-09](../../20-features/054-plugin-marketplace-and-customization/F054-09-turn-off-update-pin-uninstall.md)
- Requirement items: S54.24, S54.25, S54.26, S54.29
- Detail: VS Code: S54.25, S54.26, S54.29; Chrome: S54.24, S54.25, S54.26, S54.29

## GAP-F054-10-01

**The brief and the draft say no plugin-creation assistant was found; one exists in chat on web and desktop surfaces.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-10](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Detail: Affects: Brief accuracy for S54.35. Work needed: Correct the brief; add a human verification of the card.
- Evidence: apps/web/lib/server/tools/plugin-draft-tool.ts:21-56; PluginDraftCard.tsx:29-30

## GAP-F054-10-02

**The brief cites only user-skill-authoring.ts for S54.27, S54.28 and S54.35, an 18-line switch file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-10](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Detail: Affects: Brief code pointers. Work needed: Point the items at customize.ts and the draft tool.
- Evidence: apps/web/lib/services/user-skill-authoring.ts:1-18

## GAP-F054-10-03

**The 409 does not mean 'not installed and on' as the message says.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-10](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Detail: Affects: API callers. Work needed: Enforce installed-and-on in the service or reword the message.
- Evidence: customize.ts:84-119; customize/route.ts:47-56

## GAP-F054-10-04

**Customize skips org plugin policy for the copy (pluginKeys empty).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-10](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Detail: Affects: Orgs that restrict plugins. Work needed: Decide whether a copy should be policy-checked.
- Evidence: customize/route.ts:39-42

## GAP-F054-10-05

**Mobile has no copy or edit, and its 'Customize' card name collides with web's action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-10](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Detail: Affects: Mobile users. Work needed: Product decision on mobile editing; rename the card.
- Evidence: PluginDetailScreen.tsx:549

## GAP-F054-10-06

**CLI and VS Code have no customize; the CLI omission is a recorded decision, VS Code has no recorded decision found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-10](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Detail: Affects: CLI and VS Code users. Work needed: Record a decision for VS Code or build it.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:462-468

## GAP-F054-10-NOTBUILT

**Customize a plugin (copy its skills): not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F054-10](../../20-features/054-plugin-marketplace-and-customization/F054-10-customize-a-plugin-copy-its-skills.md)
- Requirement items: S54.27, S54.28, S54.35
- Detail: Mobile: S54.27, S54.28, S54.35; CLI: S54.28, S54.35; VS Code: S54.27, S54.28, S54.35; Chrome: S54.27, S54.28, S54.35

## GAP-F054-11-01

**Reporting a plugin is missing on every app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: All users; moderation has no user signal. Work needed: Design and build a report action and queue.
- Evidence: brief S54.38; no report control in PluginDetailView.tsx

## GAP-F054-11-02

**Publisher analytics are missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: Publishers. Work needed: Define metrics and a publisher view.
- Evidence: brief S54.39; no analytics route found under apps/web/app/api/plugins

## GAP-F054-11-03

**Commercial procurement and paid plugins are missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: Publishers and buyers. Work needed: Product decision on paid plugins and procurement.
- Evidence: brief S54.40; no plugin route references plans or payment

## GAP-F054-11-04

**Brief mixes two status systems and says deprecate applies to listings; community submissions cannot be deprecated.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: Brief accuracy and admins. Work needed: Split the brief item; decide if submissions need deprecate.
- Evidence: plugin-packages.ts:196-200; plugin-lifecycle.ts:81-95

## GAP-F054-11-05

**Lifecycle API 'submit' has no admin button, and 'restore' has no route case.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: Admins. Work needed: Wire or remove.
- Evidence: plugin-lifecycle.ts:33; lifecycle/route.ts:31-64; PluginModerationPage.tsx:76-80

## GAP-F054-11-06

**Registry plugins have no publisher-facing submit path; only platform admins call the lifecycle API.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: Third-party publishers of registry packs. Work needed: Product decision.
- Evidence: lifecycle/route.ts:108,130 use requirePlatformAdmin

## GAP-F054-11-07

**No installation approval request (S54.31) for plugins blocked by policy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: Members of restrictive orgs. Work needed: Out of this feature; tracked separately.
- Evidence: brief S54.31

## GAP-F054-11-08

**Moderation exists only on web; desktop depends on the hosted page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Detail: Affects: Staff using other apps. Work needed: Likely acceptable; record the decision.
- Evidence: no moderation code in apps/mobile, apps/cli, apps/extension-vscode, apps/extension

## GAP-F054-11-NOTBUILT

**Publish, review and moderate: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F054-11](../../20-features/054-plugin-marketplace-and-customization/F054-11-publish-review-and-moderate.md)
- Requirement items: S54.36, S54.37, S54.38, S54.39, S54.40
- Detail: Web: S54.38, S54.39, S54.40; Desktop: S54.38, S54.39, S54.40; Mobile: S54.36, S54.37, S54.38, S54.39, S54.40; CLI: S54.36, S54.37, S54.38, S54.39, S54.40; VS Code: S54.36, S54.37, S54.38, S54.39, S54.40; Chrome: S54.36, S54.37, S54.38, S54.39, S54.40
