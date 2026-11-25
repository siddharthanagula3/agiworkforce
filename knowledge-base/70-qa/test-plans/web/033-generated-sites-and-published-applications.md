---
id: "PLAN-web-033"
type: "test-plan"
title: "Web · 33. Generated Sites and published applications"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "33"
---
# Web · 33. Generated Sites and published applications

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S33.01 Generated-site dashboard.

- **Expected:** A dashboard lists the user's generated/published sites with their state and actions.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:38; apps/web/features/settings/sections/PublishedArtifactsSection.tsx:137 (quoted code not found in the file now); apps/web/features/settings/sections/PublishedArtifactsSection.tsx:584; apps/web/features/settings/services/conversation-data-service.ts:224 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Sites (labels found in the code)
- **Needs:** a published site (see S33.04)
- **Steps:**
  1. Click Sites in the sidebar.
  2. Look at the list: one card per published site, with its name, its link, a visibility label and a More actions (⋯) button.
  3. Click the ⋯ button on a card and check it offers Rename, Sharing and Unpublish.
  4. Compare with Expected: the list shows each site's state and its actions.

## S33.04 Prompt-based creation.

- **Expected:** The user creates a site by prompting the assistant, then hosts the result.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42; apps/web/lib/services/published-artifact-service.ts:62
- **Where to find it:** Sidebar > Sites > Create (labels found in the code)
- **Needs:** a chat that runs on the cloud (not Local or BYOK); the Web panel refuses cloud publishing for Local, BYOK or unknown origins
- **Steps:**
  1. Click Sites in the sidebar, then click Create.
  2. In the chat, ask AGI to build a small app or page, for example: build a page with a button that counts clicks. Wait for the artifact to appear in the side panel.
  3. Click Publish in the artifact panel. If the panel is narrow, open the More (⋯) button and choose Publish.
  4. Compare with Expected: the assistant built the app from your prompt, and a link now appears above the panel with a Copy link button.

## S33.07 Preview deployment.

- **Expected:** The site can be deployed to a shareable preview URL.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42; apps/web/app/shared-artifact/[token]/page.tsx:32
- **Where to find it:** not found in the code. No separate preview deployment or preview URL found; searched 'preview URL', 'preview link' and 'preview deployment' in apps/web/features/chat/components/artifacts, apps/web/features/sites, apps/web/app/shared-artifact and apps/web/lib/services/published-artifact-service.ts. The Publish link (S33.10) is the nearest match.

## S33.10 Public URL.

- **Expected:** The published site is reachable at a public URL.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/app/api/artifacts/publish/route.ts:42; apps/web/app/shared-artifact/[token]/page.tsx:32; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:322
- **Where to find it:** Sidebar > Sites > open a site > Settings > URL > Copy link (labels found in the code)
- **Needs:** a published site (see S33.04) and a private browser window
- **Steps:**
  1. Click Sites in the sidebar and click the name of a published site.
  2. Open the Settings tab and find the URL section.
  3. Click Copy link, then open a private browser window (not signed in) and paste the link.
  4. Compare with Expected: the published site opens at its public address without signing in.

## S33.12 Workspace-only access.

- **Expected:** The owner can restrict a site to members of their workspace.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/app/api/artifacts/publish/[token]/route.ts:106 (quoted code not found in the file now); apps/web/app/shared-artifact/[token]/page.tsx:31 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Sites > ⋯ on a site card > Sharing > Your workspace (labels found in the code)
- **Needs:** a workspace; a second member account is needed to check that members can open it
- **Steps:**
  1. Click Sites in the sidebar.
  2. On a site card, click the ⋯ button, then Sharing.
  3. Choose Your workspace. If you belong to no workspace the option is greyed out with the text 'Join or create a workspace to share with its members only.'
  4. Compare with Expected: with a workspace, the site is saved as workspace-only; open its link from a signed-out private window and check it does not open for a visitor outside the workspace.

## S33.20 Model-call allowance for generated apps.

- **Expected:** Generated apps get an allowance of model calls through the product.
- **Code:** done. Evidence moved: apps/web/lib/services/artifact-runtime-service.ts:682; apps/web/lib/services/artifact-runtime-service.ts:698; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:124 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The allowance is checked on the server per request (managed usage reservation in artifact-runtime-service.ts) and has no screen; the message is the failure text for an unavailable model route, not an allowance counter.
- **Steps:**
  1. Open the public link of a published app that uses AI in a window.
  2. Use the app's AI action.
  3. Compare with Expected: the app answers. If no model is available for the request, the message 'No model on your plan can answer this app right now.' appears instead.

## S33.23 Rollback.

- **Expected:** The owner can roll the live site back to an earlier version.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2652; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1235; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Sidebar > Sites > site name > Settings > Versions > Restore (labels found in the code)
- **Needs:** a published site with at least two publishes (republish it once after S33.04)
- **Steps:**
  1. Click Sites in the sidebar and click the name of a site that has been published more than once.
  2. Open the Settings tab and scroll to the Versions section.
  3. Click Restore on an older version (not the one marked Live).
  4. Compare with Expected: the restored version is now marked Live and is the newest entry; the section says restoring republishes it as the newest.

## S33.24 Unpublish.

- **Expected:** The owner can take the site offline (unpublish).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:100 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/[token]/route.ts:72
- **Where to find it:** Sidebar > Sites > ⋯ on a site card > Unpublish (labels found in the code)
- **Needs:** a test site you can unpublish; this cannot be undone
- **Steps:**
  1. Click Sites in the sidebar.
  2. On a test site card, click the ⋯ button, then Unpublish.
  3. Read the confirmation dialog, which names the site and says the link stops working; click Unpublish to confirm or Cancel to stop.
  4. Compare with Expected: a toast says the site was unpublished and the link no longer works; open the old link in a private window to check it is unavailable.

## S33.25 Duplicate/fork.

- **Expected:** The owner can duplicate/fork an app to keep working on a copy.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1476 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2509
- **Where to find it:** Chat > open an artifact in the side panel > More (⋯) > Duplicate (labels found in the code)
- **Needs:** a chat with an artifact
- **Steps:**
  1. Open a chat that has an artifact and open the artifact in the side panel.
  2. Click the More (⋯) button in the panel.
  3. Click Duplicate.
  4. Compare with Expected: a toast says 'Duplicated. Edits here no longer touch the original.' Edit the copy and open the original to check it did not change.

## S33.26 Download source.

- **Expected:** The owner can download the app's source.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2392; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1408
- **Where to find it:** Chat > open a text artifact in the side panel > Download > Download source (labels found in the code)
- **Needs:** a text or code artifact
- **Steps:**
  1. Open a text or code artifact in the side panel.
  2. Click the Download icon in the panel.
  3. Click Download source (.<language>), for example .py or .html.
  4. Compare with Expected: a file with the raw source downloads; open it in a text editor to check it matches the artifact.

## S33.28 Abuse reporting.

- **Expected:** A visitor can report an abusive published site.
- **Code:** done. Evidence moved: apps/web/app/shared-artifact/[token]/page.tsx:95; apps/web/app/copyright/report/ReportContentLink.tsx:16 (quoted code not found in the file now); apps/web/app/api/admin/takedown/route.ts:23
- **Where to find it:** Open a published site's public link > scroll to the bottom > Report infringement or impersonation (labels found in the code)
- **Steps:**
  1. Copy a published site's link from Sites (Settings > URL > Copy link) and open it in a window.
  2. Scroll to the bottom of the page.
  3. Click Report infringement or impersonation.
  4. Compare with Expected: the report page titled 'Report infringing or impersonating content' opens with the published page's address filled in.

## S33.29 Content moderation.

- **Expected:** Published sites are subject to content moderation (review/takedown).
- **Code:** done. Evidence moved: apps/web/app/api/artifacts/publish/route.ts:65 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/route.ts:220 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/route.ts:372 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The rename path that reaches this check was not traced end to end; the refusal text is confirmed in the route, and review and takedown for a published page are operator-side only.
- **Needs:** a test site; do not use real or offensive content beyond what the policy check needs
- **Steps:**
  1. Click Sites in the sidebar, then on a site card click the ⋯ button and Rename.
  2. Type a name that breaks the usage policy and save.
  3. Compare with Expected: the save is refused with 'This name cannot be used because it violates the AGI Workforce usage policy.' Other content moderation (review and takedown) has no screen for the visitor.

## S33.30 Deletion of app and associated data.

- **Expected:** Deleting an app removes it and its associated data.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:100 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/[token]/route.ts:72; apps/web/db/neon/0257_file_versions_and_lineage.sql:56; apps/web/app/api/chat/conversations/[id]/route.ts:545
- **Where to find it:** Sidebar > Sites > ⋯ on a site card > Unpublish (labels found in the code)
- **Needs:** a test site you can unpublish; this cannot be undone
- **Steps:**
  1. Click Sites in the sidebar and click a test site's name, then open the Data tab and note the Shared data and Personal data lists.
  2. Go back, click the ⋯ button on the card, then Unpublish, and confirm.
  3. Compare with Expected: the link stops working for everyone and the confirmation said visitor data is deleted; check the old link is unavailable.
