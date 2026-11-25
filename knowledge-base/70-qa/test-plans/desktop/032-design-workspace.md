---
id: "PLAN-desktop-032"
type: "test-plan"
title: "Desktop · 32. Design workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "32"
---
# Desktop · 32. Design workspace

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S32.31 Export to HTML.

- **Expected:** The user can export the design as a standalone HTML file.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2388; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:745 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:5834 (quoted code not found in the file now)
- **Where to find it:** Chat > open an artifact from the chat (the artifact card opens the artifacts panel) > Download (download icon, tooltip "Download") > Download as HTML (labels found in the code)
- **Needs:** a chat artifact (the app must have made one)
- **Steps:**
  1. In a chat, ask for a single-page web design, for example "make a one-page landing page", and wait for the artifact card to appear.
  2. Click the artifact card so the artifact opens in the artifacts panel.
  3. Click the download icon in the artifact's top bar (tooltip "Download").
  4. Click "Download as HTML" in the menu.
  5. Open the saved .html file in a browser with no internet connection and check that the design shows on its own, matching the preview in the app.

## S32.33 Export to image or archive.

- **Expected:** The user can export the design as an image file or as a downloadable archive.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:745; apps/web/features/chat/utils/downloadArtifacts.ts:108; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2385; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1888
- **Where to find it:** Artifacts panel > Download all (zip archive, shown only when the panel holds two or more artifacts); for a single image artifact, the download icon labelled "Download image"; for a diagram, the download menu item "Download as SVG" (labels found in the code)
- **Needs:** two or more artifacts in one chat, and for the image check an image artifact
- **Steps:**
  1. Make two or more artifacts in one chat, for example two designs or a design and a diagram.
  2. Open the artifacts panel and click "Download all" (title "Download all artifacts as zip").
  3. Wait for the toast "Artifact download ready" and open the downloaded zip to check that each artifact is inside as a file.
  4. For an image artifact, click the download icon (tooltip "Download") to save the image file.
  5. For a diagram, open the download icon menu and click "Download as SVG"; open the .svg file and compare with the preview.

## S32.34 Version comparison and restoration.

- **Expected:** The user can compare two versions of a design and restore an earlier one.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:994; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3211; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:53; apps/web/features/chat/components/artifacts/ArtifactChangesView.tsx:103; packages/ui/design-tokens/src/foundation.css:232; apps/web/shared/components/__tests__/theme-contrast.test.ts:385
- **Where to find it:** Artifacts panel > open an artifact with two or more versions > More (the "..." icon at the top right of the artifact) > Show changes; then the version counter in the artifact header > Restore (labels found in the code)
- **Needs:** a chat artifact with at least two versions
- **Steps:**
  1. Ask the chat to change the same design once, so the artifact has two versions.
  2. Open that artifact and click the "More" icon at the top right of its top bar, then click "Show changes".
  3. Read the summary line (it starts "Since version") and the added and removed marks, and compare with Expected.
  4. Click the version counter in the header (it shows v and two numbers, for example v1/2), then click "Restore" on the older version.
  5. Click "Restore" in the dialog titled "Restore version N?" and check that the older content shows and a new latest version appears in the list.
