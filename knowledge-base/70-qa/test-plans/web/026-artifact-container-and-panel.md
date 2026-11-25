---
id: "PLAN-web-026"
type: "test-plan"
title: "Web · 26. Artifact container and panel"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "26"
---
# Web · 26. Artifact container and panel

32 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S26.01 Artifact launch card inside chat.

- **Expected:** An assistant reply that produces an artifact shows a card in the transcript; activating it opens that artifact.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3207; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:28; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:235 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a document or an HTML page > in the assistant's reply click the card's "Open" button (labels found in the code)
- **Needs:** a chat that produces an artifact
- **Steps:**
  1. Sign in and start a new chat.
  2. Ask for a short HTML page or a document so the reply produces an artifact.
  3. Find the card in the reply that shows the artifact title and the type.
  4. Click the card's "Open" button.
  5. Look: the artifact opens in the panel and shows the content, as Expected.

## S26.02 Artifact title.

- **Expected:** The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1399; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:297 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:160
- **Where to find it:** Chat > open an artifact > read the title at the top of the viewer header (labels found in the code)
- **Needs:** a chat that produces an artifact
- **Steps:**
  1. Ask for an artifact and click its card's "Open" button.
  2. Read the title shown at the top of the viewer.
  3. Find the same title on the card in the reply.
  4. Make a second artifact with no title if the model gives one; check that the fallback shows "Untitled" in the list.

## S26.03 Artifact type.

- **Expected:** The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:37 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:306 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1247 (quoted code not found in the file now)
- **Where to find it:** Chat > open an artifact > read the grey line under the title in the viewer, and the line under the title on the card (labels found in the code)
- **Needs:** a chat that produces an artifact
- **Steps:**
  1. Ask for an HTML page, then a document, in separate replies.
  2. Click "Open" on each card.
  3. Read the grey line under each title: it shows the kind, for example "HTML" or "MD".
  4. Compare the kind shown with the artifact that was made.

## S26.04 Artifact status.

- **Expected:** The artifact shows its lifecycle state: being written, finished, stopped before it finished, or failed.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/StreamingArtifactView.tsx:49; apps/web/features/chat/hooks/use-streaming-artifact.ts:77; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2969
- **Where to find it:** Chat > ask for a long artifact > watch the status text in the panel while it is written; the stopped state appears as a notice in the viewer (labels found in the code)
- **Needs:** a chat that produces a long artifact, and a way to stop the reply
- **Steps:**
  1. Ask for a long document or page and watch the Artifacts panel while the reply is still running.
  2. Read the status text: it shows "Writing…" while content arrives.
  3. Stop the reply (the stop control in the composer) while it is still writing.
  4. Open that artifact and read the notice that says it was saved from a partial response.
  5. Note: I did not find visible words for a finished or a failed state, so compare with Expected and report what you see.

## S26.05 Open artifact.

- **Expected:** User can open an artifact from the chat or from an artifact list into a view that shows its content.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:235 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:28; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:840
- **Where to find it:** Chat > click the card's "Open" button, or click the Artifacts icon button (aria label "Open artifacts panel") then pick the artifact tab (labels found in the code)
- **Needs:** a chat that produces an artifact
- **Steps:**
  1. In a chat with an artifact, click the card's "Open" button.
  2. Check that the viewer shows the artifact content.
  3. Close the panel, click the Artifacts icon button (aria label "Open artifacts panel"), then click the artifact's tab.
  4. Look: the same content is shown.

## S26.06 Close artifact without deleting it.

- **Expected:** Closing the artifact viewer hides it without deleting the artifact, which stays available to reopen.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2953; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:845; apps/web/features/chat/stores/artifacts-store.ts:819
- **Where to find it:** Artifacts panel > click the X button (aria label "Close artifacts panel") or the X in the viewer header (aria label "Close artifact viewer") (labels found in the code)
- **Needs:** a chat that produces an artifact
- **Steps:**
  1. Open an artifact so the Artifacts panel shows it.
  2. Click the X button labelled "Close artifact viewer" in the viewer header.
  3. Look: the viewer hides.
  4. Click the Artifacts icon button (aria label "Open artifacts panel") and check that the artifact is still listed as a tab or card.

## S26.07 Reopen artifact.

- **Expected:** After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:865; apps/web/features/chat/pages/WebChatPage.tsx:5956; apps/web/features/chat/stores/artifacts-store.ts:591
- **Where to find it:** Chat > click the Artifacts icon button (aria label "Open artifacts panel") or the card's "Open" button (labels found in the code)
- **Needs:** a chat that produces an artifact
- **Steps:**
  1. Open an artifact, then close the panel as in S26.06.
  2. Click the Artifacts icon button (aria label "Open artifacts panel"), or go back to the chat and click the card's "Open" button.
  3. Look: the same artifact opens.
  4. Reload the page, then open the Artifacts panel again and check the artifact is still there.

## S26.08 Docked side panel.

- **Expected:** The artifact opens in a panel docked beside the conversation, so both are visible at once.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5834 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:686; apps/web/features/chat/pages/WebChatPage.tsx:1201
- **Where to find it:** Chat in a wide window > open an artifact > the "Artifacts" panel docks on the right of the conversation (labels found in the code)
- **Needs:** a desktop-width window
- **Steps:**
  1. Use a window wider than 639 px (the mobile overlay starts at 639 px or less).
  2. Open an artifact from its card.
  3. Look: the conversation and the Artifacts panel are both visible side by side.
  4. Scroll the conversation and check the panel stays open.

## S26.09 Resizable panel.

- **Expected:** The user can change the width of the docked artifact panel (pointer drag or keyboard), and the width is kept.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:468 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:407 (quoted code not found in the file now); packages/ui/unified-chat/src/stores/uiStore.ts:9
- **Where to find it:** Artifacts panel (docked) > drag the thin handle labelled "Resize artifacts panel" or focus it and press the Left or Right arrow key (labels found in the code)
- **Needs:** a desktop-width window and a mouse or keyboard
- **Steps:**
  1. Open an artifact so the docked panel is visible.
  2. Drag the edge of the panel by its resize handle, or click the handle and press the Left or Right arrow key.
  3. Look: the panel gets wider or narrower and the conversation resizes to match.
  4. Close the panel, open it again, and check the width is kept.

## S26.10 Full-screen artifact.

- **Expected:** The user can expand any open artifact to fill the screen and return from it.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2939; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2939
- **Where to find it:** Artifact viewer header > click the button labelled "Enter fullscreen" (title "Expand") > click it again labelled "Exit fullscreen" (labels found in the code)
- **Needs:** a chat that produces an artifact
- **Steps:**
  1. Open an artifact in the viewer.
  2. Hover the header button titled "Expand" to see its tooltip.
  3. Click it: the artifact fills the screen.
  4. Click the "Exit fullscreen" button to return.

## S26.11 Detached artifact window where supported.

- **Expected:** Where the platform allows it, the artifact can be popped out into its own window or tab that shows the rendered artifact.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:439; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1744
- **Where to find it:** Artifact viewer > click "More artifact actions" > click "Open in new tab" (labels found in the code)
- **Needs:** a chat that produces an HTML or other renderable artifact
- **Steps:**
  1. Open a renderable artifact such as an HTML page.
  2. Click the "More artifact actions" button (three dots).
  3. Click "Open in new tab".
  4. Look: a new browser tab opens and shows the rendered artifact.

## S26.12 Multiple-artifact switching.

- **Expected:** When a conversation has several artifacts, the user can switch between them without leaving the viewer.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:782; apps/web/features/chat/stores/artifacts-store.ts:803; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:388
- **Where to find it:** Chat with two or more artifacts > open the Artifacts panel > click a different artifact tab by its title (some labels not found in the code; trust the screen)
- **Needs:** a chat with two artifacts
- **Steps:**
  1. Make a conversation that produces at least two artifacts.
  2. Open the Artifacts panel from the Artifacts icon button.
  3. Click the tab for the second artifact by its title.
  4. Look: the viewer changes to the second artifact without closing the panel.
  5. Click the first tab and check it switches back.

## S26.13 Artifact tabs.

- **Expected:** The open artifacts of a conversation are shown as tabs in the viewer, one per artifact, including one being written.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:61; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:777; apps/web/features/chat/stores/artifacts-store.ts:872
- **Where to find it:** Artifacts panel > tab row at the top (one tab per artifact); the artifact being written shows a pulsing dot in its tab (labels found in the code)
- **Needs:** a chat where an artifact is being written
- **Steps:**
  1. Start a reply that writes an artifact.
  2. Look at the tab row at the top of the Artifacts panel while it is written.
  3. Look: the artifact being written has its own tab with a pulsing dot.
  4. When it finishes, check it is still one tab, not two.

## S26.14 Source/preview toggle.

- **Expected:** For a renderable artifact the user can switch between the rendered preview and its source.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2600; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2260; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3610
- **Where to find it:** Artifact viewer header > the eye icon labelled "Preview" and the code icon labelled "Source" (labels found in the code)
- **Needs:** a chat that produces a renderable artifact
- **Steps:**
  1. Open an HTML or other renderable artifact.
  2. Click the eye icon labelled "Preview": the rendered page shows.
  3. Click the code icon labelled "Source": the source code shows.
  4. Look: the same artifact is shown in both modes.

## S26.15 Direct-edit mode.

- **Expected:** The user can edit an artifact's content directly in the viewer and save it as a new version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1341 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1124; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1863 (quoted code not found in the file now)
- **Where to find it:** Artifact viewer > click the "Edit" button (for a document) or "More artifact actions" > "Edit source" (for code) > change the text > click "Save" (title "Save as a new version") (labels found in the code)
- **Needs:** a chat that produces an editable artifact
- **Steps:**
  1. Open an editable artifact such as a document.
  2. Click the "Edit" button in the header.
  3. Change some text in the editor.
  4. Click the button titled "Save as a new version".
  5. Look: a new version appears in the version chip (v2/…) and the new text shows.

## S26.16 Read-only mode.

- **Expected:** An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1041; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1873 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. I read the read-only logic but did not confirm the exact hiding condition; check it against the older version behaviour before trusting this step.
- **Needs:** an artifact with at least two versions
- **Steps:**
  1. Open an artifact that has at least two versions.
  2. Click the "Previous version" arrow to go to an older version.
  3. Look: the Edit button and the Save controls are not shown for the older version.

## S26.20 Version selector.

- **Expected:** The viewer shows which version of the artifact is displayed and lets the user pick any other version directly.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:76; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2981
- **Where to find it:** Artifact viewer > click the version chip "v2/3" under the title (its tooltip is "Version history") > choose another version in the list (labels found in the code)
- **Needs:** an artifact with several versions
- **Steps:**
  1. Open an artifact with several versions.
  2. Look at the chip under the title: it shows the current version as "v N/M".
  3. Click the "Version history" chip.
  4. Click another version in the list.
  5. Look: the viewer shows that version and the chip number changes.

## S26.21 Previous/next version.

- **Expected:** The user can step to the previous and next version of an artifact and see which version is shown.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2652; apps/web/features/chat/stores/artifacts-store.ts:878; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:844
- **Where to find it:** Artifact viewer > the left arrow "Previous version" and right arrow "Next version" on either side of the "v N/M" chip under the title (labels found in the code)
- **Needs:** an artifact with several versions
- **Steps:**
  1. Open an artifact with several versions.
  2. Click the "Previous version" arrow: an older version shows.
  3. Read the "v N/M" number to see which version is shown.
  4. Click the "Next version" arrow to step forward again.

## S26.23 Restore version.

- **Expected:** The user can restore an earlier version so it becomes the current one, without losing the versions in between.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1294 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:976
- **Where to find it:** Artifact viewer > click the "Version history" chip under the title > click "Restore" beside an earlier version > confirm "Restore" (labels found in the code)
- **Needs:** an artifact with at least three versions
- **Steps:**
  1. Open an artifact with at least three versions.
  2. Click the "Version history" chip and pick an earlier version.
  3. Click "Restore" for that version, then confirm in the dialog that asks "Restore version N?".
  4. Look: the restored version is now the current one.
  5. Open the version history again and check the newer versions are still listed.

## S26.24 Duplicate artifact.

- **Expected:** The user can duplicate an artifact into an independent copy that can change without touching the original.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1475 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:929
- **Where to find it:** Artifacts panel > open a saved artifact > click "More artifact actions" > click "Duplicate" (labels found in the code)
- **Needs:** a saved artifact in the Artifacts panel
- **Steps:**
  1. Open a saved artifact in the Artifacts panel (panel view, not the inline card).
  2. Click "More artifact actions" and click "Duplicate".
  3. Look: the toast says "Duplicated. Edits here no longer touch the original."
  4. Edit the copy, then open the original and check it did not change.

## S26.26 Save to Library.

- **Expected:** The user can save an artifact into their Library so it lives with their other files outside the chat.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1443; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1815 (quoted code not found in the file now); apps/web/app/api/library/route.ts:234; apps/web/app/api/library/route.ts:277
- **Where to find it:** Artifact viewer > click "More artifact actions" > click "Save to Library" (labels found in the code)
- **Needs:** a signed-in account with a Library
- **Steps:**
  1. Open a saved artifact that is not a generated file, image, PDF or Word document.
  2. Click "More artifact actions" and click "Save to Library".
  3. Look: the toast says "Saved to your Library".
  4. Open your Library and find the artifact there.

## S26.27 Associate with Project.

- **Expected:** From the artifact viewer the user can attach the artifact to a chosen project, and it then shows up in that project.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1528 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1473; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:358; apps/web/features/projects/services/project-knowledge-upload.ts:33 (quoted code not found in the file now)
- **Where to find it:** Artifact viewer > click "More artifact actions" > under the group "Save to project" click a project name > look for "In project" under the header (labels found in the code)
- **Needs:** a project in the account
- **Steps:**
  1. Make sure the account has at least one project.
  2. Open an artifact and click "More artifact actions".
  3. Under "Save to project", click a project name.
  4. Look: a bar with "In project" and the project link appears under the header.
  5. Open that project and check the artifact is listed.

## S26.28 Continue from another chat.

- **Expected:** The user can take an existing artifact into a different (e.g. new) chat and keep working on it there.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1443; apps/web/features/library/lib/library-chat-handoff.ts:56
- **Where to find it:** Library > open an artifact item > click "Add to chat" (labels found in the code)
- **Needs:** a saved artifact in the Library
- **Steps:**
  1. Open the Library and find a saved artifact item.
  2. Click "Add to chat".
  3. Look: a new chat opens with the item attached.
  4. Ask for a change to it and check the reply continues from that content.

## S26.29 Export menu.

- **Expected:** The artifact viewer offers a menu of export formats and each choice saves a file in that format.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2789; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1381
- **Where to find it:** Artifact viewer > click the download icon (title "Download") > choose a format such as "Download as Markdown" (labels found in the code)
- **Needs:** an artifact with several export formats
- **Steps:**
  1. Open an artifact that has more than one download format (for example a document).
  2. Click the download icon in the header.
  3. Look: a menu lists formats such as "Download as Markdown" or "Download as PDF".
  4. Pick one and check the file is saved in that format.

## S26.30 Copy content.

- **Expected:** A copy control puts the artifact's own content on the clipboard and confirms it.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2900; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1213
- **Where to find it:** Artifact viewer > click the copy icon labelled "Copy" (aria label "Copy artifact") in the header (labels found in the code)
- **Needs:** a text, code or document artifact
- **Steps:**
  1. Open a text, code or document artifact.
  2. Click the "Copy" button in the header.
  3. Look: the button changes to a check mark and the word "Copied".
  4. Paste into a text field and compare with the artifact content.

## S26.31 Share controls.

- **Expected:** The user can publish an artifact to a link, copy/share the link, choose who can open it, and take it down.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3056; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88; apps/web/app/api/artifacts/publish/route.ts:42
- **Where to find it:** Chat > open an artifact card > artifact viewer header: Publish, Copy link, Who can open this (labels found in the code)
- **Needs:** a signed-in account; a Free or paid account; a workspace is needed only for the 'Everyone in this workspace' option
- **Steps:**
  1. Sign in and open a chat that has an artifact, then click its card to open the viewer.
  2. Click the 'Publish' button in the viewer header (or 'Share' icon, title 'Share').
  3. Check the link bar appears with 'Copy link' and the 'Who can open this' dropdown; click 'Copy link' and look for 'Link copied'.
  4. Open the 'Who can open this' dropdown and pick another option; compare with Expected: choose who can open the link.

## S26.32 Public/private state.

- **Expected:** Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/publishArtifactClient.ts:132; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:520; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:375 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3007; apps/web/app/api/artifacts/publish/route.ts:450 (quoted code not found in the file now)
- **Where to find it:** Chat > open an artifact card > Publish > 'Who can open this' dropdown (labels found in the code)
- **Needs:** a signed-in account; a workspace member count is needed to show 'Everyone in this workspace'
- **Steps:**
  1. Open a published artifact in the viewer (click 'Publish' first if it is not yet published).
  2. Look at the link bar under the header for the 'Who can open this' dropdown and its current choice.
  3. Open the dropdown and compare the three choices with Expected: private, anyone with the link, or workspace.

## S26.35 Runtime error panel.

- **Expected:** When an artifact fails while rendering or running, the viewer replaces it with an error panel that explains the failure and offers source/retry.
- **Code:** done. Evidence present: infrastructure/sandbox/index.html:920; infrastructure/sandbox/index.html:926
- **Where to find it:** Chat > open an HTML or React artifact that fails when it runs > preview area shows the error text (labels found in the code)
- **Needs:** a Free or paid account; an artifact that fails at run time
- **Steps:**
  1. Open an artifact whose code throws an error when it runs.
  2. Look in the preview for the red-text block starting with 'Render error:'.
  3. Compare with Expected: the viewer shows an error panel that explains the failure and offers source or retry.

## S26.36 Dependency-loading state.

- **Expected:** While an artifact's runtime or libraries load, the viewer shows a loading state, and a failed load is reported.
- **Code:** done. Evidence present: infrastructure/sandbox/index.html:700; infrastructure/sandbox/index.html:920
- **Where to find it:** Chat > open a React artifact > preview area while the libraries load (labels found in the code)
- **Needs:** a Free or paid account; a slow or offline connection helps to see the state
- **Steps:**
  1. Open a React artifact in the viewer.
  2. Look at the preview area while it starts; the text 'Loading React…' shows until the runtime loads.
  3. Compare with Expected: loading state shown, and a failed load reported.

## S26.38 Open originating session.

- **Expected:** From an artifact seen outside its chat (gallery, list, library), the user can jump to the conversation that produced it.
- **Code:** done. Evidence present: apps/web/app/gallery/GalleryClient.tsx:836; apps/web/app/gallery/GalleryClient.tsx:933
- **Where to find it:** Gallery page (web address /gallery) > open an artifact card > Open chat (labels found in the code)
- **Needs:** a signed-in account with at least one artifact in the gallery
- **Steps:**
  1. Open the gallery page at /gallery.
  2. Click an artifact to open its drawer.
  3. Click the 'Open chat' link in the drawer.
  4. Compare with Expected: the chat that made the artifact opens.

## S26.39 Live updates from ongoing work.

- **Expected:** While a reply or run is still producing an artifact, the artifact view updates live as content arrives.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:838; apps/web/features/chat/hooks/use-streaming-artifact.ts:102; apps/web/features/chat/components/messages/MessageBubble.tsx:1512
- **Where to find it:** Chat > send a request that makes an artifact > click the artifact card while it is being written (labels found in the code)
- **Needs:** a Free or paid account; a model reply that produces an artifact
- **Steps:**
  1. Send a request that asks for an artifact, and click its card while the reply is still running.
  2. Watch the viewer header for the 'Writing…' label with a pulsing dot.
  3. Watch the content area for it to grow while the reply streams.
  4. Compare with Expected: content appears live until the reply ends.

## S26.40 Mobile reader adaptation.

- **Expected:** On a phone-sized screen the artifact reader adapts (full-screen sheet, touch controls) instead of a cramped side panel.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:448 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:273
- **Where to find it:** no screen of its own. The rule is a media query, (max-width: 639px), in apps/web/features/chat/stores/artifacts-store.ts; the effect is seen as an overlay. Touch controls were not verified in the code.
- **Needs:** phone width
- **Steps:**
  1. Open a chat with an artifact on a phone-sized browser window (640 px wide or less) or on a phone.
  2. Click the artifact card and check that the viewer covers the screen as an overlay, not a docked side panel.
  3. Compare with Expected: full-screen reader with touch controls.
