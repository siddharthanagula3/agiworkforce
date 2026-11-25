---
id: "PLAN-chrome-028"
type: "test-plan"
title: "Chrome · 28. Code Canvas and application preview"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "28"
---
# Chrome · 28. Code Canvas and application preview

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S28.01 Editable code source.

- **Expected:** Generated code opens in an editable source view where the user can change it and keep the result.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > answer with an artifact card > click the card > Code (labels found in the code)
- **Needs:** a chat that makes an HTML or React artifact
- **Steps:**
  1. Ask the chat for a small HTML page or a React component so it creates an artifact card.
  2. Click the artifact card to open the artifact panel.
  3. Click Code.
  4. Try to type or change text in the code box, then close and reopen the panel and check whether the change was kept, and compare with Expected.

## S28.02 Multi-file project tree.

- **Expected:** A multi-file project is shown as a browsable file tree.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Each artifact is a single file shown in one panel; no file tree was found. Searched apps/extension/src for tree, file tree and project in the side panel and artifact code.

## S28.09 Source/preview split view.

- **Expected:** Source and preview can be shown side by side.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The artifact panel has Preview and Code buttons that switch one view at a time (artifactPanel.ts selectView); no side-by-side split view was found.
- **Needs:** a chat that makes an HTML or React artifact

## S28.10 HTML preview.

- **Expected:** HTML artifacts render as a live, interactive preview.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > answer with an HTML artifact card > click the card > Preview (labels found in the code)
- **Needs:** a chat that makes an HTML artifact
- **Steps:**
  1. Ask the chat for a single HTML page with a button, for example a small counter.
  2. Click the artifact card to open the artifact panel.
  3. Check that the Preview button is pressed and the page appears.
  4. Click the page's button and check that the page responds live, and compare with Expected.

## S28.11 React or supported framework preview.

- **Expected:** React (or other supported framework) components render as a live preview.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > answer with a React artifact card > click the card > Preview (labels found in the code)
- **Needs:** a chat that makes a React artifact
- **Steps:**
  1. Ask the chat for a small React component, for example a button that changes a number.
  2. Click the artifact card to open the artifact panel.
  3. Check that the Preview button is pressed and the component renders.
  4. Click the component's button and check that it responds, and compare with Expected.

## S28.16 Runtime-error overlay.

- **Expected:** Runtime errors in the preview appear as an overlay with a way to recover.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > answer with an HTML or React artifact card > click the card > Preview (labels found in the code)
- **Needs:** a chat that makes an artifact that fails to render
- **Steps:**
  1. Open an HTML or React artifact that fails when it runs (an artifact whose code throws an error on load).
  2. Click the artifact card and look under the Preview and Code buttons for the message "The preview could not start. Review the source or try again."
  3. Click Code to review the source and recover.
  4. Compare with Expected: an overlay with a way to recover.

## S28.18 Preview reload.

- **Expected:** The user can reload the preview.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > answer with an HTML or React artifact card > click the card > Code, then Preview (labels found in the code)
- **Needs:** a chat that makes an HTML or React artifact
- **Steps:**
  1. Open a previewable artifact in the artifact panel with Preview showing.
  2. Click Code.
  3. Click Preview.
  4. Check that the page is rebuilt from its start, and compare with Expected.

## S28.19 Restart runtime.

- **Expected:** The user can restart the app's runtime from a clean state.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No restart control for the preview runtime was found. Searched apps/extension/src for restart, reload and runtime controls; only the message about AI and saved data for published apps was found.

## S28.24 Download source.

- **Expected:** The user can download the app's source code.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > answer with an artifact card > Download icon labelled "Download $FILE$" (also in the panel header after clicking the card) (labels found in the code)
- **Needs:** a chat that makes an artifact
- **Steps:**
  1. Ask the chat for a small HTML page or a React component so it creates an artifact card.
  2. Hover the download icon on the card and read its tooltip.
  3. Click the download icon and check for the status text "Saved" followed by the file name.
  4. Open the saved file and compare its code with Expected.

## S28.25 Export project archive.

- **Expected:** The user can export a whole multi-file project as an archive (e.g. zip).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Only single-file download of one artifact was found (artifactDownload in artifactPanel.ts). Searched apps/extension/src for zip, archive and export.

## S28.27 Publish preview.

- **Expected:** The user can publish the app to a shareable preview link.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No publish-to-preview control was found. The only web action is "Run $TITLE$ in this chat on the web", which opens the chat in the browser, not a shareable preview link.

## S28.28 Publish production version.

- **Expected:** The user can publish a separate production version (stable URL or domain) distinct from previews.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No in-app production publish control was found. Searched apps/extension for publish; the only match is the Chrome Web Store release script, which is not an app control.

## S28.30 Rollback.

- **Expected:** The user can roll the app back to an earlier version.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No rollback or version-restore control for artifacts was found. Searched apps/extension/src for rollback, roll back, restore and version in artifact code.
