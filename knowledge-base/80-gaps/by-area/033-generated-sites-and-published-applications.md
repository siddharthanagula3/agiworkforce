---
id: "GAPS-AREA-033"
type: "gap-list"
title: "Gaps: Generated Sites and published applications"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 33. Generated Sites and published applications

92 open gaps that touch this area. Area page: [20-features/033-generated-sites-and-published-applications](../../20-features/033-generated-sites-and-published-applications/README.md).

## CMP-CP48

**Publish the agent's own work as a private interactive page**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: The agent cannot publish a file from the session agi artifacts publish shares an artifact already in the account; the agent cannot publish a file from the session.
- Evidence: apps/cli/src/lib.rs:1399-1408; cloud/artifacts.rs:451-497

## CMP-V27

**Agent publishes a page or file to the cloud as an artifact**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-08](../../20-features/028-code-canvas-and-application-preview/F028-08-download-and-export.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: The editor lists, opens and saves published artifacts but the agent cannot publish one from a session.
- Evidence: apps/extension-vscode/src/features/artifacts/artifactsClient.ts:33 (list only); searched: publish artifact tool in apps/cli/src/

## CMP-W117

**Apps made in chat can call the AI themselves (AI-powered artifacts)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Switched off: AGI_ARTIFACT_AI_ENABLED defaults to 0 until a security review passes, so in-app AI calls answer "not available yet".
- Evidence: apps/web/lib/validate-env.ts:1716; apps/web/lib/artifact-ai.ts:3

## CMP-W129

**Sites: a token so a script can call a sign-in-protected site**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: A protected site can only be opened by a signed-in, permitted person; there is no service token.
- Evidence: searched: bypass token, siteToken, bearer in apps/web/features/sites, apps/web/lib/services/published-site-viewer-service.ts

## CMP-W130

**Sites: private tunnels to internal services and deploy an existing local project**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Sites are built from chat; no tunnel to private services and no import of an existing project.
- Evidence: searched: tunnel, hosting.json in apps/web/features/sites, lib

## CMP-W131

**Sites: schedules that refresh a published site**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: A schedule cannot update a published site; sites change only when edited in chat.
- Evidence: searched: site schedule in apps/web/features/sites and features/schedules

## CMP-W132

**Sites: usage analytics (visitors and page views)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: A published site shows no visitor or page view counts.
- Evidence: searched: views, visitors, pageViews in apps/web/features/sites

## CMP-WP110

**Sites: a relational database and file storage per site**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: There is no relational database and no file storage for visitor uploads Published apps get key-value storage only, capped at 20 MB per scope and 4 MB per value; there is no relational database and no file storage for visitor uploads.
- Evidence: packages/contracts/cloud-contracts/src/artifact-runtime.ts:11; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:31

## CMP-WP111

**Sites: remix a coworker's published site**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Not Missing: a site's link is /shared-artifact/{token} (apps/web/lib/services/published-artifact-service.ts:294 Not Missing: a site's link is /shared-artifact/{token} (apps/web/lib/services/published-artifact-service.ts:294; apps/web/app/api/artifacts/publish/route.ts:116), and that page's header has 'Save a copy to my chats' (apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:144,220-230), which
- Evidence: searched: remix in apps/web/features/sites and app/shared-artifact (remix only in Library images)

## CMP-WP112

**Sites: save a version without deploying, then restore**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: There is no save-then-deploy step Published sites keep versions that can be restored, but there is no save-then-deploy step.
- Evidence: apps/web/features/sites/components/SiteSettingsTab.tsx:319-360

## CMP-WP84

**Largest single file in chat**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F014-11](../../20-features/014-attachment-intake-components/F014-11-limits-duplicates-and-refusals.md), [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Paid plans take 500 MiB; Free and Basic take 25 MiB Paid plans take 500 MiB; Free and Basic take 25 MiB.
- Evidence: packages/contracts/cloud-contracts/src/chat-attachment-policy.json:2,66-67; types/src/billing-catalog.ts:548-577,617

## CMP-WP95

**Admin controls for Sites: use, publish publicly, invite outside visitors**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: There is no separate switch for building sites or for outside visitors One workspace switch turns public links off; there is no separate switch for building sites or for outside visitors.
- Evidence: packages/contracts/types/src/enterprise/index.ts:92-99,192; workspace-controls.ts:38-52

## CMP-WP96

**Artifact storage that apps keep between visits**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Published apps get personal and shared key-value storage capped at 20 MB per scope and 4 MB per value Published apps get personal and shared key-value storage capped at 20 MB per scope and 4 MB per value.
- Evidence: packages/contracts/cloud-contracts/src/artifact-runtime.ts:11; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:31

## CMP-XP5

**Artifacts and published pages from the panel**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F026-01](../../20-features/026-artifact-container-and-panel/F026-01-artifact-cards-in-chat-opening-closing-reopening.md), [F026-03](../../20-features/026-artifact-container-and-panel/F026-03-viewer-layout-docked-panel-resize-full-screen-deta.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Detail: Artifact cards show source with a preview and copy or download; running one fully happens on the web Artifact cards show source with a preview and copy or download; running one fully happens on the web.
- Evidence: apps/extension/src/features/side-panel/artifactPanel.ts:671; locale spArtifactSourceNoteWeb

## GAP-AREA033-LW05

**The per-app AI call cap is in a migration whose header says NOT YET APPLIED, but the code already calls the function it defines. If the migration is not applied, that call path fails for any app run with an app subject.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-033
- Detail: Area 33. Generated Sites and published applications
- Evidence: apps/web/db/neon/0391_artifact_runtime_usage_cap.sql:4; apps/web/lib/services/managed-usage-request-service.ts:804

## GAP-AREA033-LW10

**The service comment says views are not counted, and there is no time limit on published pages. This matches analytics being missing, but it is a deliberate gap noted by the authors, not a fix.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-033
- Detail: Area 33. Generated Sites and published applications
- Evidence: apps/web/lib/services/published-artifact-service.ts:44-48

## GAP-CAP-artifacts-and-documents-15

**Publish an artifact to a link and choose who can open it: VS Code cannot publish; named-viewer access, custom domains, analytics missing; no human check of the publish flow.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F028-10](../../20-features/028-code-canvas-and-application-preview/F028-10-publish-a-preview-link.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Requirement items: S26.31, S26.32, S28.27, S33.10, S33.12, S33.24, S96.20, S96.23, S96.26
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-16

**Sites: build, host and manage websites and lightweight apps: Missing: usage analytics, recurring refresh, private tunnels, bypass token, custom domain, logs, build status. No human run.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md), [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md), [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md), [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md), [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md), [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Requirement items: S33.01, S33.04, S33.07, S33.10, S33.14, S33.19, S33.23, S33.25, S33.26, S33.27, S33.30
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-artifacts-and-documents-17

**Artifact storage and AI-powered artifacts: Briefs and comparison disagree with each other; app-level metering missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F028-07](../../20-features/028-code-canvas-and-application-preview/F028-07-ai-and-saved-data-inside-a-published-app.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-07](../../20-features/096-artifact-and-generated-application-components/F096-07-app-data-storage.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Requirement items: S28.22, S28.23, S33.20, S96.17, S96.24
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-artifacts-and-documents-26

**Plan limits and usage cost of generated files: Free account in W-15 got a plain chat with no message that Work is unavailable.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-10](../../20-features/026-artifact-container-and-panel/F026-10-connected-data-status-refresh-and-artifact-usage-n.md), [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md), [F096-09](../../20-features/096-artifact-and-generated-application-components/F096-09-publishing-to-a-hosted-link.md)
- Requirement items: S26.37, S33.19, S96.24
- Detail: Claude yes, ChatGPT yes; AGI unknown

## GAP-F033-01-01

**No description field for a published app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Detail: Affects: All apps. Work needed: Add a description column, schema field and UI if the product wants S33.02.
- Evidence: published-artifact-service.ts:154-167; route.ts:33-40

## GAP-F033-01-02

**Brief status table disagrees with code on CLI (n/a versus a working publish command) and chrome/vscode wording**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Detail: Affects: Documentation. Work needed: Update the brief.
- Evidence: apps/cli/src/lib.rs:1399-1408; brief S33.04

## GAP-F033-01-03

**Image, PDF and other artifact types cannot be published**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Detail: Affects: Web, mobile, CLI. Work needed: Add safe renderers before widening the kind list.
- Evidence: publishArtifactClient.ts:22-52; artifacts.rs:44

## GAP-F033-01-04

**Stale module comment says mobile injects no publisher**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Detail: Affects: Engineers. Work needed: Correct the comment.
- Evidence: packages/platform/artifacts/src/artifacts.ts:66-72 versus artifactPublishing.ts:60

## GAP-F033-01-05

**No publish on VS Code or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Detail: Affects: VS Code, Chrome users. Work needed: None for VS Code (decided); Chrome needs a product decision.
- Evidence: No code found; decision doc for VS Code

## GAP-F033-01-06

**No TTL or view accounting**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Detail: Affects: All. Work needed: Founder-approved expiry and analytics.
- Evidence: published-artifact-service.ts:44-47

## GAP-F033-01-NOTBUILT

**Publish an artifact from chat: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Requirement items: S33.04
- Detail: VS Code: S33.04; Chrome: S33.04

## GAP-F033-01-PARTLY

**Publish an artifact from chat: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-01](../../20-features/033-generated-sites-and-published-applications/F033-01-publish-an-artifact-from-chat.md)
- Requirement items: S33.04

## GAP-F033-02-01

**No view counts or audit of visits**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Detail: Affects: Owners (S33.27). Work needed: Design analytics and privacy review.
- Evidence: published-artifact-service.ts:44-47

## GAP-F033-02-02

**No expiry for links**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Detail: Affects: Owners and visitors. Work needed: Founder-approved TTL.
- Evidence: published-artifact-service.ts:44-47

## GAP-F033-02-03

**The brief marks chrome unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Detail: Affects: Chrome. Work needed: Mark absent or decide a feature.
- Evidence: No publish or page code in apps/extension

## GAP-F033-02-04

**No custom domain**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Detail: Affects: Owners. Work needed: Product decision and build.
- Evidence: No code found; brief S33.14 missing

## GAP-F033-02-05

**A draft claimed share-view rate limiting applies to the public page; not found in the page code read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Detail: Affects: Abuse resistance. Work needed: Confirm whether an edge limit exists.
- Evidence: page.tsx has no withRateLimit call

## GAP-F033-02-NOTBUILT

**Share link and public page: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Requirement items: S33.07, S33.10
- Detail: VS Code: S33.07; Chrome: S33.07, S33.10

## GAP-F033-02-PARTLY

**Share link and public page: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-02](../../20-features/033-generated-sites-and-published-applications/F033-02-share-link-and-public-page.md)
- Requirement items: S33.07, S33.10

## GAP-F033-03-01

**No password protection**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Detail: Affects: Owners wanting a shared secret. Work needed: Product decision; if wanted, design hashed password gate.
- Evidence: No password code in published services, routes or page; brief S33.13

## GAP-F033-03-02

**CLI cannot manage invited people**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Detail: Affects: CLI users. Work needed: Add invited audience and viewer commands.
- Evidence: apps/cli/src/cloud/artifacts.rs:560-566

## GAP-F033-03-03

**Mobile Site screen changes audience without a confirm**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Detail: Affects: Mobile users. Work needed: Add the same consequence dialog as the artifact screen.
- Evidence: SiteDetailScreen.tsx:321-345

## GAP-F033-03-04

**Brief says named viewers missing on web and mobile but code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Detail: Affects: Documentation. Work needed: Update the brief status.
- Evidence: SiteViewersEditor.tsx; PublishedArtifactViewers.tsx

## GAP-F033-03-05

**No VS Code or Chrome audience controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Detail: Affects: Those apps. Work needed: None for VS Code (decided); Chrome unknown.
- Evidence: No code found

## GAP-F033-03-06

**Invite emails are not sent by the product as far as read**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Detail: Affects: Invited viewers. Work needed: Decide whether to notify invited people.
- Evidence: No mail send in viewers route or service

## GAP-F033-03-NOTBUILT

**Who can open a published app: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Requirement items: S33.11, S33.12, S33.13
- Detail: Web: S33.11; Desktop: S33.11; CLI: S33.11, S33.13; VS Code: S33.11, S33.12, S33.13; Chrome: S33.11, S33.12, S33.13

## GAP-F033-03-PARTLY

**Who can open a published app: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-03](../../20-features/033-generated-sites-and-published-applications/F033-03-who-can-open-a-published-app.md)
- Requirement items: S33.12, S33.13

## GAP-F033-04-01

**No description for a published app**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Detail: Affects: All apps. Work needed: Add field end to end (S33.02).
- Evidence: published-artifact-service.ts:154-167

## GAP-F033-04-02

**Brief says mobile dashboard missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: apps/mobile/src/features/sites/SitesScreen.tsx exists

## GAP-F033-04-03

**CLI cannot rename**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Detail: Affects: CLI users. Work needed: Add rename command if parity is wanted.
- Evidence: apps/cli/src/lib.rs:1359-1430

## GAP-F033-04-04

**No state such as build or deploy status**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Detail: Affects: All apps. Work needed: Not needed for a static publish; decide.
- Evidence: Brief S33.06 missing; no code

## GAP-F033-04-05

**VS Code and Chrome have no list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Detail: Affects: Those apps. Work needed: Decision.
- Evidence: No code found

## GAP-F033-04-06

**Desktop (Electron) has no own list; it shows the web page**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Detail: Affects: Desktop. Work needed: None if the web page is reachable in the desktop window; not verified.
- Evidence: AGENTS.md section 5

## GAP-F033-04-NOTBUILT

**Your published apps list: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Requirement items: S33.01, S33.02
- Detail: VS Code: S33.02; Chrome: S33.01, S33.02

## GAP-F033-04-PARTLY

**Your published apps list: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-04](../../20-features/033-generated-sites-and-published-applications/F033-04-your-published-apps-list.md)
- Requirement items: S33.02

## GAP-F033-05-01

**No Trash or undo for unpublished pages**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Detail: Affects: Owners who unpublish by mistake. Work needed: Product decision on a recently deleted holding period.
- Evidence: published-artifact-service.ts:563-579 hard delete

## GAP-F033-05-02

**No audit event seen for unpublish**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Detail: Affects: Operations. Work needed: Add an audit event if wanted.
- Evidence: handleUnpublish (token route.ts:58-80) has no recordAuditEvent call, while publish and viewers changes do

## GAP-F033-05-03

**Mobile 'Unpublish' and 'Delete site and its data' look different but erase the same data**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Detail: Affects: Mobile users. Work needed: Clarify copy or merge the two actions.
- Evidence: SiteDetailScreen.tsx:170-200

## GAP-F033-05-04

**VS Code and Chrome have no unpublish**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Detail: Affects: Those apps. Work needed: Decision.
- Evidence: No code found

## GAP-F033-05-05

**Brief says mobile unpublish missing but controls exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: PublishedArtifactControls.tsx:117-143; SiteDetailScreen.tsx:445-460

## GAP-F033-05-NOTBUILT

**Unpublish and delete: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F033-05](../../20-features/033-generated-sites-and-published-applications/F033-05-unpublish-and-delete.md)
- Requirement items: S33.24, S33.30
- Detail: VS Code: S33.24, S33.30; Chrome: S33.24, S33.30

## GAP-F033-06-01

**CLI has no version list or restore**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Detail: Affects: CLI users. Work needed: Add commands against the existing routes.
- Evidence: apps/cli/src/lib.rs:1359-1430 has no such command

## GAP-F033-06-02

**Two different 'restore' meanings share similar labels (local artifact versus published page)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Detail: Affects: Web and mobile users. Work needed: Clarify copy, for example 'Restore this edit' versus 'Put live'.
- Evidence: ArtifactPreview.tsx:1008-1036 versus SiteSettingsTab.tsx:280-326

## GAP-F033-06-03

**Server restore has no confirm dialog**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Detail: Affects: Web Sites and mobile users. Work needed: Add a consequence dialog; it changes the public page at once.
- Evidence: SiteSettingsTab.tsx:280-326; SiteDetailScreen.tsx:386-400

## GAP-F033-06-04

**No retention or pruning for versions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Detail: Affects: Storage. Work needed: Founder-approved retention.
- Evidence: No limit found in recordPublishedVersion

## GAP-F033-06-05

**Brief says mobile restore is local only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Detail: Affects: Documentation. Work needed: Update brief; mobile Site screen restores the live page.
- Evidence: mobile service.ts:196-212 posts to the server

## GAP-F033-06-06

**The platform module comment says earlier published revisions are not addressable**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Detail: Affects: Engineers. Work needed: Correct the comment.
- Evidence: packages/platform/artifacts/src/artifacts.ts:60-63 versus the versions routes

## GAP-F033-06-NOTBUILT

**Version history and rollback: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Requirement items: S33.09, S33.23
- Detail: CLI: S33.09, S33.23; VS Code: S33.09, S33.23; Chrome: S33.09, S33.23

## GAP-F033-06-PARTLY

**Version history and rollback: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-06](../../20-features/033-generated-sites-and-published-applications/F033-06-version-history-and-rollback.md)
- Requirement items: S33.23

## GAP-F033-07-01

**Duplicate exists only on web (and desktop through web).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome users.. Work needed: Add a duplicate action per app on top of a shared server-side copy.
- Evidence: forkArtifact is referenced only in web files; brief S33.25 mobile, CLI, VS Code missing.

## GAP-F033-07-02

**The copy is held in the browser store, with no server-side record found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Detail: Affects: Anyone who signs in on another device or app.. Work needed: Decide whether copies sync; persist through the artifacts API if so.
- Evidence: artifacts-store.ts:929-952 has no network call.

## GAP-F033-07-03

**The brief's VS Code evidence points at the wrong lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Detail: Affects: Testers and engineers using the brief.. Work needed: Correct the brief citations.
- Evidence: package.json:593 and commandSetup.ts:2297 do not hold a download command; the real one is package.json:713.

## GAP-F033-07-04

**No test covers the VS Code save command or the CLI show handler end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Detail: Affects: VS Code and CLI.. Work needed: Add tests for saveArtifactToWorkspace and the show --out handler.
- Evidence: artifactsView.test.ts has no save case; artifacts.rs tests cover only path helpers.

## GAP-F033-07-05

**Download source is not a project download for multi-file apps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Detail: Affects: Users who want a whole site.. Work needed: Define a multi-file artifact and a zip export.
- Evidence: All download handlers write one file (ArtifactPreview.tsx:1381-1413).

## GAP-F033-07-NOTBUILT

**Copy, duplicate and download source: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Requirement items: S33.25
- Detail: Mobile: S33.25; CLI: S33.25; VS Code: S33.25

## GAP-F033-07-PARTLY

**Copy, duplicate and download source: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-07](../../20-features/033-generated-sites-and-published-applications/F033-07-copy-duplicate-and-download-source.md)
- Requirement items: S33.25, S33.26

## GAP-F033-08-01

**The whole feature is off by default and not yet released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Detail: Affects: All viewers and owners on web.. Work needed: Independent review sign-off, counsel approval of the consent line, then set the switch.
- Evidence: docs/security/security.md:1271-1273; audit/decisions/founder-actions.md:43-48.

## GAP-F033-08-02

**No owner-facing control or display of the per-app allowance or usage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Detail: Affects: Owners (S33.19).. Work needed: Show per-app usage and limits in the published apps list.
- Evidence: No UI found in the code read; limits appear only as refusals.

## GAP-F033-08-03

**Unavailable on desktop shared frame, Chrome, mobile, CLI and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Detail: Affects: Those apps.. Work needed: Decide whether those surfaces should run published apps; if so, add a safe bridge.
- Evidence: docs/security/security.md:1256-1258; brief S33.20.

## GAP-F033-08-04

**No Local or own-key route for app AI calls.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Detail: Affects: Local-mode and own-key users.. Work needed: Define an explicit consented route per trust boundary.
- Evidence: artifact-completion.ts:187-196 platform-key only.

## GAP-F033-08-05

**Stale migration header says not applied while a founder note says applied in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Detail: Affects: Engineers deciding whether the cap is live.. Work needed: Verify applied state and fix the stale text.
- Evidence: 0391 header vs founder-actions.md:47.

## GAP-F033-08-NOTBUILT

**AI calls from inside an app: not built on Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Requirement items: S33.19, S33.20
- Detail: Desktop: S33.20; Mobile: S33.20; CLI: S33.20; VS Code: S33.20, S33.19; Chrome: S33.20, S33.19

## GAP-F033-08-PARTLY

**AI calls from inside an app: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-08](../../20-features/033-generated-sites-and-published-applications/F033-08-ai-calls-from-inside-an-app.md)
- Requirement items: S33.19

## GAP-F033-09-01

**No operator screen; removal and notice handling are API only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-09](../../20-features/033-generated-sites-and-published-applications/F033-09-report-and-moderation.md)
- Detail: Affects: Operators.. Work needed: Build an operator console or document the runbook.
- Evidence: No page under apps/web for takedown found; routes under api/admin only.

## GAP-F033-09-02

**Takedown is a permanent delete with no publisher notice or archive found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-09](../../20-features/033-generated-sites-and-published-applications/F033-09-report-and-moderation.md)
- Detail: Affects: Publishers, appeals.. Work needed: Archive then delete, and notify the publisher.
- Evidence: takedown/route.ts:99-108.

## GAP-F033-09-03

**Moderation covers publish and restore, and was not seen on audience changes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-09](../../20-features/033-generated-sites-and-published-applications/F033-09-report-and-moderation.md)
- Detail: Affects: Owners changing visibility of already published pages.. Work needed: Confirm and, if needed, re-check on visibility change.
- Evidence: Only two callers of preparePublishedArtifactPublication.

## GAP-F033-09-04

**Report options are rights-holder oriented; no general abuse type such as spam or harm.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-09](../../20-features/033-generated-sites-and-published-applications/F033-09-report-and-moderation.md)
- Detail: Affects: Visitors.. Work needed: Decide whether to add abuse categories.
- Evidence: CONTENT_NOTICE_TYPES copyright, trademark, impersonation (copyright-notices.ts:7).

## GAP-F033-09-05

**Brief says the link placement was unconfirmed; code confirms it, but no end-to-end check on desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-09](../../20-features/033-generated-sites-and-published-applications/F033-09-report-and-moderation.md)
- Detail: Affects: Desktop.. Work needed: Drive the Electron app and confirm the footer.
- Evidence: page.tsx:95.

## GAP-F033-10-01

**No site templates (S33.03).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Affects: All six apps.. Work needed: Add an HTML app template kind and a picker.
- Evidence: Templates exist only for document_template and deck_template (LibraryDialogs.tsx:46).

## GAP-F033-10-02

**No source workspace, build status, logs (S33.05, S33.06, S33.21).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Affects: All apps.. Work needed: Needs a build and run model first.
- Evidence: Published pages have no build step in the publish route.

## GAP-F033-10-03

**No production stage or promotion (S33.08, S33.22).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Affects: All apps.. Work needed: Add a stage column and promote action.
- Evidence: One live row per artifact id (knowledge-base gap file line 228).

## GAP-F033-10-04

**No custom domain or verification (S33.14, S33.15).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Affects: All apps.. Work needed: Domain model, DNS check and a host integration.
- Evidence: No domain code found.

## GAP-F033-10-05

**No environment variables, connected-service settings, or database setup (S33.16 to S33.18).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Affects: All apps.. Work needed: Secret storage per app with consent, and a database design.
- Evidence: Only the key-value store exists.

## GAP-F033-10-06

**No analytics (S33.27).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Detail: Affects: Owners on all apps.. Work needed: Privacy-reviewed view counting.
- Evidence: No view-count table or code found.

## GAP-F033-10-NOTBUILT

**Not yet built: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Requirement items: S33.03, S33.05, S33.06, S33.08, S33.14, S33.15, S33.16, S33.17, S33.18, S33.21, S33.22, S33.27
- Detail: Web: S33.03, S33.06, S33.14, S33.15, S33.16, S33.17, S33.18, S33.21, S33.22, S33.27; Desktop: S33.03, S33.06, S33.14, S33.15, S33.16, S33.17, S33.18, S33.21, S33.22, S33.27; Mobile: S33.03, S33.06, S33.14, S33.15, S33.16, S33.17, S33.18, S33.21, S33.22, S33.27; CLI: S33.03, S33.06, S33.14, S33.15, S33.16, S33.17, S33.18, S33.21, S33.22, S33.27; VS Code: S33.03, S33.06, S33.08, S33.14, S33.15, S33.16, S33.17, S33.18, S33.21, S33.22, S33.27; Chrome: S33.03, S33.05, S33.06, S33.08, S33.14, S33.15, S33.16, S33.17, S33.18, S33.21, S33.22, S33.27

## GAP-F033-10-PARTLY

**Not yet built: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F033-10](../../20-features/033-generated-sites-and-published-applications/F033-10-not-yet-built.md)
- Requirement items: S33.05, S33.08
