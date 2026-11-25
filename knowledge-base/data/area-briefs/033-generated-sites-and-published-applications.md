# Area 33. Generated Sites and published applications

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S33.01 Generated-site dashboard.
- Should: A dashboard lists the user's generated/published sites with their state and actions.
- Status: web done, desktop done, mobile missing, cli done, chrome missing
- Code: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:51; apps/web/features/settings/sections/PublishedArtifactsSection.tsx:137; apps/web/features/settings/sections/PublishedArtifactsSection.tsx:212; apps/web/features/settings/services/conversation-data-service.ts:224; apps/cli/src/lib.rs:2267

## S33.02 Application name and description.
- Should: The user can set a name and description for a published app.
- Status: vscode missing, chrome unverified

## S33.03 Template-based creation.
- Should: The user can start a site from a template.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.04 Prompt-based creation.
- Should: The user creates a site by prompting the assistant, then hosts the result.
- Status: web done, desktop done, mobile done, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1562; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:89; apps/web/app/api/artifacts/publish/route.ts:182; apps/web/lib/services/published-artifact-service.ts:50; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:405; apps/mobile/src/features/chat/services/artifactPublishing.ts:13

## S33.05 Source-code workspace.
- Should: The site's source code can be browsed and edited in a workspace.
- Status: chrome unverified

## S33.06 Build status.
- Should: The user sees the build/deploy status of the site.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.07 Preview deployment.
- Should: The site can be deployed to a shareable preview URL.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1562; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:89; apps/web/app/api/artifacts/publish/route.ts:182; apps/web/app/shared-artifact/[token]/page.tsx:31; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:405; apps/mobile/src/features/chat/services/artifactPublishing.ts:13; apps/cli/src/lib.rs:1053; apps/cli/src/cloud/artifacts.rs:391

## S33.08 Production deployment.
- Should: The site can be deployed to a separate production URL/stage.
- Status: vscode missing, chrome unverified

## S33.09 Deployment history.
- Should: The user can see the history of deployments.
- Status: cli missing, vscode missing, chrome missing

## S33.10 Public URL.
- Should: The published site is reachable at a public URL.
- Status: web done, desktop done, mobile done, cli done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1562; apps/web/app/api/artifacts/publish/route.ts:182; apps/web/app/shared-artifact/[token]/page.tsx:31; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:97; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:605; apps/mobile/src/features/chat/services/artifactPublishing.ts:13; apps/cli/src/lib.rs:1053; apps/cli/src/cloud/artifacts.rs:391

## S33.11 Named-viewer access.
- Should: The owner can restrict a site to specific named viewers.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.12 Workspace-only access.
- Should: The owner can restrict a site to members of their workspace.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1705; apps/web/app/api/artifacts/publish/[token]/route.ts:106; apps/web/app/shared-artifact/[token]/page.tsx:31; apps/cli/src/lib.rs:2278

## S33.13 Password or authentication options where offered.
- Should: The owner can require a password or sign-in to view the site.
- Status: cli missing, vscode missing, chrome unverified

## S33.14 Custom domain setup.
- Should: The owner can attach a custom domain.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.15 Domain verification.
- Should: The product verifies ownership of a custom domain (DNS).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.16 Environment-variable management.
- Should: The owner can manage environment variables/secrets for the app.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.17 Connected-service configuration.
- Should: The owner can configure connected services the app uses.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.18 Application database setup.
- Should: The owner can set up a database for the app.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.19 Usage and hosting limits.
- Should: Usage and hosting limits are enforced and shown to the owner.
- Status: vscode missing, chrome unverified

## S33.20 Model-call allowance for generated apps.
- Should: Generated apps get an allowance of model calls through the product.
- Status: web done, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/services/artifact-runtime-service.ts:204; apps/web/lib/services/artifact-runtime-service.ts:228; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:124

## S33.21 Logs and error inspection.
- Should: The owner can inspect logs and runtime errors of the hosted app.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.22 Preview-to-production promotion.
- Should: A preview deployment can be promoted to production.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.23 Rollback.
- Should: The owner can roll the live site back to an earlier version.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1244; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:670; apps/web/app/api/artifacts/publish/route.ts:182; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:573; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:262

## S33.24 Unpublish.
- Should: The owner can take the site offline (unpublish).
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:100; apps/web/app/api/artifacts/publish/[token]/route.ts:47; apps/cli/src/lib.rs:1060; apps/cli/src/cloud/artifacts.rs:443

## S33.25 Duplicate/fork.
- Should: The owner can duplicate/fork an app to keep working on a copy.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1476; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1478

## S33.26 Download source.
- Should: The owner can download the app's source.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1455; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:756; apps/mobile/src/features/chat/utils/artifactExport.ts:100; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:562; apps/cli/src/lib.rs:1034; apps/cli/src/lib.rs:1942; apps/extension-vscode/package.json:593; apps/extension-vscode/src/core/commandSetup.ts:2297

## S33.27 App analytics.
- Should: The owner sees analytics (views/visitors) for the app.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S33.28 Abuse reporting.
- Should: A visitor can report an abusive published site.
- Status: web done, desktop done
- Code: apps/web/app/shared-artifact/[token]/page.tsx:72; apps/web/app/copyright/report/ReportContentLink.tsx:16; apps/web/app/api/admin/takedown/route.ts:17

## S33.29 Content moderation.
- Should: Published sites are subject to content moderation (review/takedown).
- Status: web done, desktop done
- Code: apps/web/app/api/artifacts/publish/route.ts:65; apps/web/app/api/artifacts/publish/route.ts:220; apps/web/app/api/artifacts/publish/route.ts:372

## S33.30 Deletion of app and associated data.
- Should: Deleting an app removes it and its associated data.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:100; apps/web/app/api/artifacts/publish/[token]/route.ts:47; apps/web/db/neon/0257_file_versions_and_lineage.sql:53; apps/web/app/api/chat/conversations/[id]/route.ts:474; apps/cli/src/lib.rs:1060; apps/cli/src/cloud/artifacts.rs:443
