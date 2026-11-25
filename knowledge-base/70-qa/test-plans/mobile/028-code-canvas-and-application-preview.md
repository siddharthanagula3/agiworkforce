---
id: "PLAN-mobile-028"
type: "test-plan"
title: "Mobile · 28. Code Canvas and application preview"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "28"
---
# Mobile · 28. Code Canvas and application preview

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S28.10 HTML preview.

- **Expected:** HTML artifacts render as a live, interactive preview.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:280; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:202
- **Where to find it:** Chat > tap an HTML artifact card (opens the full-screen artifact view) > tab "Preview" (labels found in the code)
- **Needs:** an HTML artifact in a chat (ask the assistant to make a small HTML page with a button if none exists)
- **Steps:**
  1. Sign in and open a chat that has an HTML artifact (a page the assistant made as an artifact).
  2. Tap the HTML artifact card in the chat to open the full-screen artifact view.
  3. Make sure the "Preview" tab is selected at the top (the other tab is "Source").
  4. Look for a live, interactive page: buttons and links should respond when tapped, and the page should show its content, not the raw HTML text. Compare with Expected.

## S28.16 Runtime-error overlay.

- **Expected:** Runtime errors in the preview appear as an overlay with a way to recover.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:69 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1718
- **Where to find it:** Chat > tap an HTML artifact card > tab "Preview" > error box with "Retry" and "View source" buttons (labels found in the code)
- **Needs:** an HTML artifact that throws a JavaScript error (ask the assistant to make one on purpose)
- **Steps:**
  1. Open a chat and ask the assistant for an HTML artifact that throws a JavaScript error on load (for example a script line that calls an undefined function).
  2. Tap the HTML artifact card to open it full screen, with the "Preview" tab selected.
  3. Look for the error box with the text "This preview stopped with an error." and the error message under it.
  4. Tap "Retry" to run the preview again, or "View source" to switch to the Source tab. Compare with Expected.

## S28.24 Download source.

- **Expected:** The user can download the app's source code.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1339; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:228 (quoted code not found in the file now)
- **Where to find it:** Chat > tap an HTML artifact card > header icon "Download artifact" (down-arrow icon) > share sheet or "Download" choices (labels found in the code)
- **Needs:** an HTML artifact in a chat
- **Steps:**
  1. Open an HTML artifact full screen (tap its card in the chat).
  2. Tap the download icon in the top header, labelled "Download artifact".
  3. If a choice list titled "Download" appears, pick the option that names the source file (for HTML it should be a source option, not PDF). If the system share sheet opens directly, that is the source file.
  4. Save or open the shared file and check that it contains the same HTML code as the Source tab. Compare with Expected.

## S28.27 Publish preview.

- **Expected:** The user can publish the app to a shareable preview link.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1324; apps/mobile/src/features/chat/services/artifactPublishing.ts:13 (quoted code not found in the file now)
- **Where to find it:** Chat > "Cloud" mode (top mode toggle) > tap an HTML artifact card > header icon "Publish artifact to a public link" (globe icon) > alert "Publish to a public link?" > "Publish" (labels found in the code)
- **Needs:** a signed-in AGI Cloud account in Cloud mode (a Local-only device shows "Switch to AGI Cloud to publish"; a signed-out one shows "Sign in to AGI Cloud to publish")
- **Steps:**
  1. Make sure the mode toggle at the top of the chat shows "Cloud" (not "Local"), and that you are signed in to AGI Cloud.
  2. Open an HTML artifact full screen and tap the globe icon in the header, labelled "Publish artifact to a public link".
  3. In the alert "Publish to a public link?", tap "Publish".
  4. Look for the link box with the link text (shown with "Copy publication link" and "Share publication link" buttons) and the hint "Private. Only you can open it until you publish it." before publishing. Open the link in a browser and compare with Expected.
