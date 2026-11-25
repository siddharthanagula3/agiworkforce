---
id: "PLAN-desktop-033"
type: "test-plan"
title: "Desktop · 33. Generated Sites and published applications"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "33"
---
# Desktop · 33. Generated Sites and published applications

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S33.01 Generated-site dashboard.

- **Expected:** A dashboard lists the user's generated/published sites with their state and actions.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:38; apps/web/features/settings/sections/PublishedArtifactsSection.tsx:137 (quoted code not found in the file now); apps/web/features/settings/sections/PublishedArtifactsSection.tsx:584; apps/web/features/settings/services/conversation-data-service.ts:224 (quoted code not found in the file now)
- **Where to find it:** Settings > Shared links > Published artifacts (labels found in the code)
- **Needs:** a signed-in account with at least one published artifact
- **Steps:**
  1. Sign in, open Settings and choose Shared links.
  2. Scroll below the shared conversation links to the Published artifacts heading.
  3. Look at each row: title, audience (Anyone with the link, Everyone in this workspace or Only people you invite), kind, size, Published date.
  4. Check the row buttons Open, History and Unpublish, and the empty text No published artifacts when there are none.

## S33.04 Prompt-based creation.

- **Expected:** The user creates a site by prompting the assistant, then hosts the result.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Chat > ask the assistant for a web page or app > artifact panel > Publish (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, open a new chat and type a prompt asking the assistant to build a small web page.
  2. Wait for the artifact panel to show the generated page.
  3. Click Publish in the artifact panel.
  4. Look for the toast Published · link copied to clipboard, and confirm the page is now hosted at a link.

## S33.07 Preview deployment.

- **Expected:** The site can be deployed to a shareable preview URL.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42; apps/web/app/shared-artifact/[token]/page.tsx:32
- **Where to find it:** Chat > artifact panel > Publish (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open an artifact that the assistant created in a chat.
  2. Click Publish in the artifact panel.
  3. Wait for the toast and copy the link from the bar below if the clipboard was not used.
  4. Open the link in a new private window and compare with Expected.

## S33.10 Public URL.

- **Expected:** The published site is reachable at a public URL.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/app/api/artifacts/publish/route.ts:42; apps/web/app/shared-artifact/[token]/page.tsx:32; apps/web/app/shared-artifact/[token]/PublishedArtifactView.tsx:322
- **Where to find it:** Chat > artifact panel > Publish, then Settings > Shared links > Published artifacts > Open (labels found in the code)
- **Needs:** a signed-in account and a private browser window
- **Steps:**
  1. Publish an artifact from the artifact panel.
  2. Copy the link from the toast or from the bar below.
  3. Open the link in a new private window with no sign-in.
  4. Compare the page you see with Expected; also check that Settings > Shared links > Published artifacts lists it with Open.

## S33.12 Workspace-only access.

- **Expected:** The owner can restrict a site to members of their workspace.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/app/api/artifacts/publish/[token]/route.ts:106 (quoted code not found in the file now); apps/web/app/shared-artifact/[token]/page.tsx:31 (quoted code not found in the file now)
- **Where to find it:** Chat > artifact panel > Publish > audience menu > Everyone in this workspace (labels found in the code)
- **Needs:** a workspace with a second member account
- **Steps:**
  1. Open a published artifact in the artifact panel and open its audience menu (the select next to Publish).
  2. Choose Everyone in this workspace.
  3. Open the link in a private window with no sign-in and check that it does not open.
  4. Sign in as a second member of the same workspace and open the link to compare with Expected.

## S33.23 Rollback.

- **Expected:** The owner can roll the live site back to an earlier version.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2652; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1235; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Settings > Shared links > Published artifacts > History > Put live (labels found in the code)
- **Needs:** a published artifact with at least two published versions
- **Steps:**
  1. Publish an artifact, edit it in chat and publish again so it has two versions.
  2. Open Settings > Shared links, find the artifact under Published artifacts and click History.
  3. Pick an earlier version and click Put live.
  4. Open the public link and look for the earlier content, and for the text Version N of ... is live again.

## S33.24 Unpublish.

- **Expected:** The owner can take the site offline (unpublish).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:100 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/[token]/route.ts:72
- **Where to find it:** Settings > Shared links > Published artifacts > Unpublish (labels found in the code)
- **Needs:** a published artifact
- **Steps:**
  1. Open Settings > Shared links and find the artifact under Published artifacts.
  2. Click Unpublish on its row.
  3. In the dialog Unpublish this artifact?, read the warning and click Unpublish artifact to confirm, or Cancel to stop.
  4. Open the public link and check that it no longer works, and that the row disappears or shows the notice Unpublished.

## S33.25 Duplicate/fork.

- **Expected:** The owner can duplicate/fork an app to keep working on a copy.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1476 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2509
- **Where to find it:** Chat > artifact panel > menu > Duplicate (labels found in the code)
- **Steps:**
  1. Open an artifact in the artifact panel.
  2. Open the artifact's menu and click Duplicate.
  3. Look for the toast Duplicated. Edits here no longer touch the original.
  4. Edit the copy and check that the original artifact is unchanged.

## S33.26 Download source.

- **Expected:** The owner can download the app's source.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2392; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1408
- **Where to find it:** Chat > artifact panel > Download > Download source (labels found in the code)
- **Steps:**
  1. Open an artifact in the artifact panel.
  2. Click Download.
  3. Choose Download source (.html) or the extension that matches the artifact language.
  4. Open the saved file and compare its content with the artifact source.

## S33.28 Abuse reporting.

- **Expected:** A visitor can report an abusive published site.
- **Code:** done. Evidence moved: apps/web/app/shared-artifact/[token]/page.tsx:95; apps/web/app/copyright/report/ReportContentLink.tsx:16 (quoted code not found in the file now); apps/web/app/api/admin/takedown/route.ts:23
- **Where to find it:** Open a published link (Settings > Shared links > Published artifacts > Open) > scroll to the bottom > Report infringement or impersonation (labels found in the code)
- **Needs:** a published link opened in a browser
- **Steps:**
  1. Open a published artifact link in a browser window.
  2. Scroll to the bottom of the page.
  3. Click Report infringement or impersonation.
  4. Check that the copyright report form opens for this page.

## S33.29 Content moderation.

- **Expected:** Published sites are subject to content moderation (review/takedown).
- **Code:** done. Evidence moved: apps/web/app/api/artifacts/publish/route.ts:65 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/route.ts:220 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/route.ts:372 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The moderation check and its refusal message were found in the server routes (apps/web/app/api/artifacts/publish/route.ts), but no exact error text was confirmed, so the tester may not be able to trigger it.
- **Steps:**
  1. Publish an artifact from the artifact panel.
  2. If the server refuses the publication, look for an error message instead of the success toast Published.
  3. Compare with Expected: a site that is refused or taken down should not stay public.

## S33.30 Deletion of app and associated data.

- **Expected:** Deleting an app removes it and its associated data.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PublishedArtifactsSection.tsx:100 (quoted code not found in the file now); apps/web/app/api/artifacts/publish/[token]/route.ts:72; apps/web/db/neon/0257_file_versions_and_lineage.sql:56; apps/web/app/api/chat/conversations/[id]/route.ts:545
- **Where to find it:** Settings > Shared links > Published artifacts > Unpublish > Unpublish artifact (labels found in the code)
- **Needs:** a published artifact with saved visitor data, if you want to see that data removed
- **Steps:**
  1. Open Settings > Shared links and find the artifact under Published artifacts.
  2. Click Unpublish and read the dialog text about the data the site saved for its visitors.
  3. Click Unpublish artifact to confirm.
  4. Check that the row is gone and the public link no longer works.
