---
id: "PLAN-desktop-028"
type: "test-plan"
title: "Desktop · 28. Code Canvas and application preview"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "28"
---
# Desktop · 28. Code Canvas and application preview

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S28.01 Editable code source.

- **Expected:** Generated code opens in an editable source view where the user can change it and keep the result.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1342 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485 (quoted code not found in the file now)
- **Where to find it:** Artifact panel > Source (tab) > More artifact actions > Edit source (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a chat and ask for a short code file, for example a Python script, so a code artifact opens in the side panel.
  2. Click the Source tab (icon with title Source) in the artifact header.
  3. Click More artifact actions, then Edit source.
  4. Change a line in the code editor, then click Save (title Save as a new version).
  5. Compare: the edited code stays, and the version counter shows a new version (for example v2/2).

## S28.10 HTML preview.

- **Expected:** HTML artifacts render as a live, interactive preview.
- **Code:** partial. Evidence present: apps/web/lib/artifact-sandbox.ts:159
- **Known to be unfinished:** switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact
- **Where to find it:** Chat > open an HTML artifact in the side panel > Preview (eye icon) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and start a new chat.
  2. Ask for a single-page web page in HTML, such as a page with a button and a text box.
  3. Open the artifact from the chat so it shows in the side panel.
  4. Make sure the Preview (eye icon) is selected in the artifact header.
  5. Click the button or type in the text box on the page; compare: the page is live and responds.

## S28.11 React or supported framework preview.

- **Expected:** React (or other supported framework) components render as a live preview.
- **Code:** partial. Evidence present: apps/web/lib/artifact-sandbox.ts:159
- **Known to be unfinished:** switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact
- **Where to find it:** Chat > open a React artifact in the side panel > Preview (eye icon) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and start a new chat.
  2. Ask for a React component, such as a counter with two buttons.
  3. Open the artifact in the side panel and make sure Preview (eye icon) is selected.
  4. Click the buttons; compare: the component renders live and its state changes.

## S28.16 Runtime-error overlay.

- **Expected:** Runtime errors in the preview appear as an overlay with a way to recover.
- **Code:** done. Evidence present: infrastructure/sandbox/index.html:926; apps/web/features/chat/components/SandboxedIframe.tsx:268; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3235
- **Where to find it:** Chat > open an HTML artifact that throws an error > Preview > error message in the panel (labels found in the code)
- **Steps:**
  1. Ask for an HTML page whose script calls a function that does not exist as soon as it loads.
  2. Open the artifact in the side panel with Preview selected.
  3. Look for the message This artifact couldn't be rendered. with a detail line under it.
  4. Click Retry to reload, or View source to open the code; compare: a way to recover is shown.

## S28.18 Preview reload.

- **Expected:** The user can reload the preview.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3542; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1757
- **Where to find it:** Artifact panel > More artifact actions > Refresh preview (labels found in the code)
- **Steps:**
  1. Open an HTML or React artifact in the side panel with Preview selected.
  2. Click More artifact actions.
  3. Click Refresh preview.
  4. Compare: the preview reloads and shows the same content again, with any error message cleared.

## S28.19 Restart runtime.

- **Expected:** The user can restart the app's runtime from a clean state.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3542; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1757
- **Where to find it:** not found in the code. No control named Restart or a restart of the runtime was found. I searched Restart and restart in apps/web/features/chat/components/artifacts, apps/web/app/chat/live-artifacts and apps/desktop/src. Closest are Refresh preview (ArtifactPreview.tsx, which only bumps a refresh key) and Refresh data (apps/web/app/chat/live-artifacts/LiveArtifactControls.tsx, which reloads connected-app data, not the runtime).

## S28.24 Download source.

- **Expected:** The user can download the app's source code.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3497; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1381
- **Where to find it:** Artifact panel > Download artifact (button) > Download source (.<language>) (labels found in the code)
- **Steps:**
  1. Open a code artifact, such as a Python script, in the side panel.
  2. Click the Download artifact button (download icon) in the header.
  3. If a menu opens, click Download source (.<extension>), where the extension matches the artifact language.
  4. Open the saved file and compare: it holds the same code as the artifact.

## S28.25 Export project archive.

- **Expected:** The user can export a whole multi-file project as an archive (e.g. zip).
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:745; apps/web/features/chat/utils/downloadArtifacts.ts:163
- **Where to find it:** Chat > Artifacts (button, title Artifacts) > Download all (labels found in the code)
- **Needs:** two or more artifacts in one account
- **Steps:**
  1. Create at least two artifacts in a chat, such as a code file and an HTML page.
  2. Click the Artifacts button to open the artifacts panel.
  3. Click Download all (title Download all artifacts as zip).
  4. Open the downloaded artifacts.zip and compare: it contains the artifacts from the panel.

## S28.27 Publish preview.

- **Expected:** The user can publish the app to a shareable preview link.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88
- **Where to find it:** Artifact panel > Publish (button) or More artifact actions > Publish (labels found in the code)
- **Needs:** a signed-in account; a private window for the last step
- **Steps:**
  1. Open a finished HTML or document artifact in the side panel.
  2. Click Publish (on a narrow panel use More artifact actions, then Publish).
  3. If a dialog asks about sharing, read it and confirm; the audience choice includes Anyone with the link.
  4. Look for the message Published · link copied to clipboard, then open the link in a private window.
  5. Compare: the shared artifact opens without signing in.

## S28.30 Rollback.

- **Expected:** The user can roll the app back to an earlier version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1294 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:976
- **Where to find it:** Artifact panel > Version history (version counter, for example v2/2) > Restore (labels found in the code)
- **Needs:** an artifact with two or more versions
- **Steps:**
  1. Open an artifact that has at least two versions, for example after one Save in Edit source.
  2. Click the version counter button (title Version history).
  3. In the version list, click Restore on an earlier version.
  4. Click Restore in the confirmation dialog titled Restore version N?.
  5. Compare: the content goes back to the earlier version and the counter shows one more version.
