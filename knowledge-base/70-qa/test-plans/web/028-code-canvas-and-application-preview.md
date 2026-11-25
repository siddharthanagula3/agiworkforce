---
id: "PLAN-web-028"
type: "test-plan"
title: "Web · 28. Code Canvas and application preview"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "28"
---
# Web · 28. Code Canvas and application preview

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S28.01 Editable code source.

- **Expected:** Generated code opens in an editable source view where the user can change it and keep the result.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1342 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1864 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:485 (quoted code not found in the file now)
- **Where to find it:** Artifacts panel > Source (icon button, title "Source") > edit the text > Save (title "Save as a new version") (labels found in the code)
- **Needs:** a text artifact (code, HTML or document); not PDF, DOCX or image
- **Steps:**
  1. Open a text artifact from the chat so it shows in the Artifacts panel.
  2. Click the Source button (title "Source").
  3. Change a line of the text in the editor.
  4. Click Save (title "Save as a new version"). The Save button only appears when the source can be edited.
  5. Look for a new version in the version controls, and check that the edited text is still there after you switch away and back.

## S28.10 HTML preview.

- **Expected:** HTML artifacts render as a live, interactive preview.
- **Code:** partial. Evidence present: apps/web/lib/artifact-sandbox.ts:159
- **Known to be unfinished:** switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact
- **Where to find it:** Artifacts panel > Preview (icon button, title "Preview") on an HTML artifact (labels found in the code)
- **Steps:**
  1. Generate an HTML artifact in the chat and open it in the Artifacts panel.
  2. Make sure the Preview button (title "Preview") is selected.
  3. Check that the page renders and responds to clicks and typing, as the page itself describes.

## S28.11 React or supported framework preview.

- **Expected:** React (or other supported framework) components render as a live preview.
- **Code:** partial. Evidence present: apps/web/lib/artifact-sandbox.ts:159
- **Known to be unfinished:** switch-on: redeploy infrastructure/sandbox (project agiworkforce-sandbox) so its index.html matches the repo, then set NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com and rebuild web (inlined at build, apps/web/lib/artifact-sandbox.ts:95); live-check an HTML and a React artifact
- **Where to find it:** Artifacts panel > Preview (icon button, title "Preview") on a React artifact (labels found in the code)
- **Steps:**
  1. Generate a React artifact in the chat and open it in the Artifacts panel.
  2. Make sure the Preview button (title "Preview") is selected.
  3. Check that the components render and respond to clicks, as the code describes.
  4. Compare with Expected: components render as a live preview.

## S28.16 Runtime-error overlay.

- **Expected:** Runtime errors in the preview appear as an overlay with a way to recover.
- **Code:** done. Evidence present: infrastructure/sandbox/index.html:920; infrastructure/sandbox/index.html:926
- **Where to find it:** no screen of its own. The error box (pre id error) is written by infrastructure/sandbox/index.html:374 and reportRenderError at infrastructure/sandbox/index.html:920; it shows only the message text, with no recovery control of its own. Recovery depends on Refresh preview (ArtifactPreview.tsx:3542).
- **Needs:** an artifact that throws at run time
- **Steps:**
  1. Open an artifact whose code throws an error when it runs (for example a React artifact that throws).
  2. Look in the preview area for the red-text message that starts with "Render error:" in a box.
  3. Note that the box has no button; the recovery control is Refresh preview (aria-label "Refresh preview").

## S28.18 Preview reload.

- **Expected:** The user can reload the preview.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3542; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1757
- **Where to find it:** Artifacts panel > Refresh preview (icon button, title "Refresh preview") (labels found in the code)
- **Steps:**
  1. Open an artifact that shows a preview.
  2. Click the Refresh preview button (circular arrow icon, title "Refresh preview").
  3. Look for the preview to reload and show its content again.

## S28.19 Restart runtime.

- **Expected:** The user can restart the app's runtime from a clean state.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3542; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1757
- **Where to find it:** not found in the code. No control labelled restart or reset was found in ArtifactPreview.tsx, ArtifactsPanel.tsx or the artifacts store. The nearest control is Refresh preview (ArtifactPreview.tsx:3542, which bumps refreshKey at ArtifactPreview.tsx:1757), but that is not a labelled restart. Searched apps/web/features/chat/components/artifacts, the artifacts store and packages/ui for Restart, Reload and restart.

## S28.22 AI-backed app behavior through a brokered API.

- **Expected:** An app can call AI through a brokered product API instead of embedding keys.
- **Code:** done. Evidence moved: infrastructure/sandbox/index.html:313; apps/web/app/api/artifacts/runtime/[token]/complete/route.ts:170 (quoted code not found in the file now); apps/web/lib/services/artifact-runtime-service.ts:682
- **Where to find it:** no screen of its own. The brokered call is defined at infrastructure/sandbox/index.html:313 and served by apps/web/app/api/artifacts/runtime/[token]/complete/route.ts; the route's quoted line was not found, so the call path is confirmed by the sandbox file only.
- **Needs:** an app whose code calls agi.complete
- **Steps:**
  1. Open an app that calls agi.complete(...) in its code (the generated app itself makes the call).
  2. Click the button or control in the app that triggers the AI call.
  3. Look for the AI reply to appear inside the app; no separate control in the Artifacts panel shows this.

## S28.23 App-local storage or database configuration.

- **Expected:** An app can be given persistent local storage or a database, configured by the user.
- **Code:** done. Evidence present: infrastructure/sandbox/index.html:313; apps/web/app/api/artifacts/runtime/[token]/storage/route.ts:84; apps/web/lib/services/artifact-runtime-service.ts:208; apps/web/db/neon/0325_published_artifact_storage.sql:3
- **Where to find it:** no screen of its own. No user-facing control to configure storage or a database was found in the artifacts panel; the storage routes are apps/web/app/api/artifacts/runtime/[token]/storage/route.ts and apps/web/lib/services/artifact-runtime-service.ts:208. Whether the user can configure it was not confirmed.
- **Needs:** an app whose code uses storage
- **Steps:**
  1. Open an app whose code writes a value with storage.set(...).
  2. Reload the preview with Refresh preview (title "Refresh preview").
  3. Look for the value to still be there after the reload, which shows app-local storage works.

## S28.24 Download source.

- **Expected:** The user can download the app's source code.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3497; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1381
- **Where to find it:** Artifacts panel > Download artifact (title "Download") > Download source (.ext) (labels found in the code)
- **Steps:**
  1. Open a code or text artifact in the Artifacts panel.
  2. Click the Download button (title "Download", aria-label "Download artifact").
  3. Click Download source; the item text ends with the file extension, for example "Download source (.html)".
  4. Open the downloaded file and compare it with the code shown in the Source view.

## S28.25 Export project archive.

- **Expected:** The user can export a whole multi-file project as an archive (e.g. zip).
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:745; apps/web/features/chat/utils/downloadArtifacts.ts:163
- **Where to find it:** Artifacts panel > Download all (labels found in the code)
- **Needs:** two or more artifacts in one conversation
- **Steps:**
  1. Create a chat with two or more artifacts so the Artifacts panel shows them.
  2. Click the Download all button (title "Download all artifacts as zip").
  3. Wait for the toast "Preparing artifact download…" to finish.
  4. Open the downloaded artifacts.zip and check that each artifact is inside.

## S28.27 Publish preview.

- **Expected:** The user can publish the app to a shareable preview link.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Artifacts panel > Publish (globe button, aria-label "Publish artifact to a public link") (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open an artifact in the Artifacts panel and sign in if asked.
  2. Click the Publish button (globe icon, title "Publish"). Its label is visible only on wide panels.
  3. Choose an audience: "Anyone with the link", "Everyone in this workspace" or "Only people you invite".
  4. Wait for the toast "Published · link copied to clipboard" or "Published. Copy the link from the bar below."
  5. Open the link in a private window and compare the page with the artifact.

## S28.30 Rollback.

- **Expected:** The user can roll the app back to an earlier version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1294 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:976
- **Where to find it:** Artifacts panel > Version history (title "Version history") > Restore beside an older version (labels found in the code)
- **Needs:** an artifact with at least two versions
- **Steps:**
  1. Open an artifact that has more than one version.
  2. Click the version counter button (title "Version history") to open the list.
  3. Click Restore beside an older version, then Restore in the confirmation "Restore version N?".
  4. Check that the content matches the older version and that a new latest version was added.
