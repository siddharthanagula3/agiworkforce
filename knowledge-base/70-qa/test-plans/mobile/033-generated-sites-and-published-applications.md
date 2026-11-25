---
id: "PLAN-mobile-033"
type: "test-plan"
title: "Mobile · 33. Generated Sites and published applications"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "33"
---
# Mobile · 33. Generated Sites and published applications

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S33.04 Prompt-based creation.

- **Expected:** The user creates a site by prompting the assistant, then hosts the result.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1324; apps/mobile/src/features/chat/services/artifactPublishing.ts:13 (quoted code not found in the file now)
- **Where to find it:** Chat > ask the assistant for a small web page > open the page it makes > tap the globe icon 'Publish artifact to a public link' in the top bar (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to AGI Cloud and make sure the app is in AGI Cloud mode (not Local).
  2. In the chat, ask the assistant to build a small one-page website.
  3. Open the page the assistant creates so the artifact screen appears.
  4. Tap the globe icon labelled 'Publish artifact to a public link'.
  5. Tap 'Publish' in the confirmation box.
  6. Compare: the globe icon turns green and a link appears under the page (Expected: the site is hosted).

## S33.07 Preview deployment.

- **Expected:** The site can be deployed to a shareable preview URL.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1324; apps/mobile/src/features/chat/services/artifactPublishing.ts:13 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No separate preview deployment was found. The only publish action creates a shared link (shareUrl in apps/mobile/src/features/chat/services/artifactPublishing.ts); 'Preview' in ArtifactFullScreen.tsx is an in-app view, not a shareable URL. Searched rg -i 'preview|deploy' in ArtifactFullScreen.tsx and artifactPublishing.ts, and rg -i 'deploy' across apps/mobile/src.
- **Needs:** a signed-in AGI Cloud account

## S33.10 Public URL.

- **Expected:** The published site is reachable at a public URL.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:605 (quoted code not found in the file now); apps/mobile/src/features/chat/services/artifactPublishing.ts:13 (quoted code not found in the file now)
- **Where to find it:** Artifact screen > globe icon 'Publish artifact to a public link' > 'Publish' > 'Open in Safari' (iPhone) or 'Open in browser' (Android) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open a page that was made by the assistant and tap the globe icon 'Publish artifact to a public link'.
  2. Tap 'Publish' in the confirmation box.
  3. Wait for the globe icon to turn green and for the 'Who can open this' section to appear below the page.
  4. Tap 'Open in Safari' (or 'Open in browser' on Android).
  5. Compare: the published site opens in the system browser at a public web address (Expected: a public URL).

## S33.23 Rollback.

- **Expected:** The owner can roll the live site back to an earlier version.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1517; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:756
- **Where to find it:** not found in the code. No control to roll a live published site back was found. The nearest control is 'Restore version N' with 'Version history' (ArtifactFullScreen.tsx and ArtifactVersionHistorySheet.tsx), but restoreArtifactVersion in apps/mobile/src/features/artifacts/store.ts only changes the local artifact and queues an artifact sync; it does not republish the live site. Searched rg -i 'rollback|roll back|rolled back' in apps/mobile/src and found only test comments.
- **Needs:** a signed-in AGI Cloud account

## S33.26 Download source.

- **Expected:** The owner can download the app's source.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/artifactExport.ts:100 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1339
- **Where to find it:** Artifact screen > download icon 'Download artifact' (top bar) (labels found in the code)
- **Steps:**
  1. Open a code page made by the assistant (for example an HTML page) so the artifact screen appears.
  2. Tap the download icon labelled 'Download artifact'.
  3. If a choice list titled 'Download' appears, pick the option that says 'The source exactly as written'; otherwise the system share sheet opens with the file.
  4. Compare: the share sheet offers a file with the page's source code (Expected: the owner downloads the source).'
