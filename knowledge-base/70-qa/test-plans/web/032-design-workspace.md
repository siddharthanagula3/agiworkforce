---
id: "PLAN-web-032"
type: "test-plan"
title: "Web · 32. Design workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "32"
---
# Web · 32. Design workspace

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S32.31 Export to HTML.

- **Expected:** The user can export the design as a standalone HTML file.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2388; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:5834 (quoted code not found in the file now)
- **Where to find it:** Open an artifact in the artifacts panel (title "Artifacts") > Download artifact (title "Download") > Download as HTML (labels found in the code)
- **Needs:** a Free account or a paid account, and a chat with an HTML artifact
- **Steps:**
  1. Sign in and open a chat that has an HTML artifact (ask AGI to make a web page if none exists).
  2. Open the artifacts panel from the "Artifacts" button and select the artifact so its preview opens.
  3. Click the download button (tooltip "Download", aria-label "Download artifact") in the preview header.
  4. Click "Download as HTML" in the menu.
  5. Open the downloaded file in a browser and compare it with Expected: a standalone HTML file of the design.

## S32.33 Export to image or archive.

- **Expected:** The user can export the design as an image file or as a downloadable archive.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:745; apps/web/features/chat/utils/downloadArtifacts.ts:108; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2385; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1888; apps/web/features/chat/pages/WebChatPage.tsx:5834 (quoted code not found in the file now)
- **Where to find it:** Artifacts panel (title "Artifacts") > Download all (aria-label "Download all artifacts as zip") (labels found in the code)
- **Needs:** a Free account or a paid account, and a chat with two or more artifacts
- **Steps:**
  1. Sign in and open a chat that has two or more artifacts.
  2. Open the artifacts panel from the "Artifacts" button.
  3. Click "Download all" in the panel header (the button only shows when the panel holds more than one artifact).
  4. Wait for the toast "Artifact download ready" and open the zip file from Downloads.
  5. Compare with Expected: the zip holds the artifacts as files. For an image artifact, open its preview and click the header button with aria-label "Download image" to export the image instead.

## S32.34 Version comparison and restoration.

- **Expected:** The user can compare two versions of a design and restore an earlier one.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:994; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3211; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:53; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:103; packages/ui/design-tokens/src/foundation.css:232; apps/web/shared/components/__tests__/theme-contrast.test.ts:385
- **Where to find it:** Open an artifact with more than one version > Previous version (aria-label "Previous version") or the version counter "Version N of M" (Version history) > More artifact actions > Show changes or Restore version (labels found in the code)
- **Needs:** a Free account or a paid account, and an artifact with at least two versions
- **Steps:**
  1. Sign in and open an artifact that has been edited at least once (two or more versions).
  2. Click "Previous version" in the preview header to show an earlier version.
  3. Click "More artifact actions" and choose "Show changes" to compare it with the version before it; check the summary line and the highlighted text.
  4. To restore, click "More artifact actions" and choose "Restore version N", then click "Restore" in the dialog "Restore version N?".
  5. Compare with Expected: the earlier version is shown again as the newest version, and the version counter increases.
