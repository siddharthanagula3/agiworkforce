---
id: "PLAN-desktop-026"
type: "test-plan"
title: "Desktop · 26. Artifact container and panel"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "26"
---
# Desktop · 26. Artifact container and panel

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S26.01 Artifact launch card inside chat.

- **Expected:** An assistant reply that produces an artifact shows a card in the transcript; activating it opens that artifact.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3207; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:28; apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:235 (quoted code not found in the file now)
- **Where to find it:** Chat > send a prompt that asks for a document or an HTML page > the card in the assistant reply > "Open artifact" (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Sign in and open Chat.
  2. Ask for a short document or a small HTML page, for example "write a one-page HTML landing page".
  3. Wait for the reply. A card for the artifact appears under the reply.
  4. Click the card, or its "Open artifact" button.
  5. Compare: the artifact opens in the viewer with its content.

## S26.02 Artifact title.

- **Expected:** The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1399; apps/web/features/chat/stores/artifacts-store.ts:160
- **Where to find it:** Chat > open an artifact card > read the title at the top of the viewer header (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Ask Chat for an artifact, then wait for the card.
  2. Read the title on the card.
  3. Click the card to open the viewer.
  4. Compare: the viewer header shows the same title.
  5. For the fallback, open an artifact with no title and look for "Untitled" in the header.

## S26.03 Artifact type.

- **Expected:** The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:306 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:37 (quoted code not found in the file now)
- **Where to find it:** Chat > open an artifact card > the muted line under the viewer title (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Ask Chat for an HTML page, a document and a spreadsheet, in three replies.
  2. Open each artifact card in turn.
  3. Look at the muted line under the title in the viewer header.
  4. Compare: the kind shows as a label such as "HTML", or as an extension label such as "CSV" or "MD".
  5. Look at the card: its type label is taken from the same source.

## S26.04 Artifact status.

- **Expected:** The artifact shows its lifecycle state: being written, finished, stopped before it finished, or failed.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/StreamingArtifactView.tsx:49; apps/web/features/chat/hooks/use-streaming-artifact.ts:77
- **Where to find it:** Chat > ask for an artifact > watch the card and viewer while the reply is still streaming > "Writing…" (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Ask for a long document so the reply takes time.
  2. While the reply is still arriving, look at the artifact card or viewer.
  3. Compare: the state shows "Writing…".
  4. Wait until the reply ends and check the state changes away from "Writing…".
  5. Stop the reply part way (Stop control) and look for the interrupted notice in the viewer.

## S26.05 Open artifact.

- **Expected:** User can open an artifact from the chat or from an artifact list into a view that shows its content.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:235 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx:28
- **Where to find it:** Chat > an assistant reply with an artifact card > "Open artifact" (labels found in the code)
- **Needs:** a conversation with an artifact
- **Steps:**
  1. Open a conversation that has an artifact card.
  2. Click the card or its "Open artifact" control.
  3. Compare: the viewer opens and shows the artifact content.
  4. Open the "Artifacts" panel from the "Artifacts" button and open an artifact from the list.
  5. Compare: the same content shows in the viewer.

## S26.06 Close artifact without deleting it.

- **Expected:** Closing the artifact viewer hides it without deleting the artifact, which stays available to reopen.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2953; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:845
- **Where to find it:** Chat > open an artifact > top-right X "Close artifact viewer" (labels found in the code)
- **Needs:** a conversation with an artifact
- **Steps:**
  1. Open an artifact in the viewer.
  2. Click the X button at the top right of the viewer, labelled "Close artifact viewer".
  3. Compare: the viewer hides.
  4. Click the "Artifacts" button or the artifact card again.
  5. Compare: the same artifact is still listed and opens again.

## S26.07 Reopen artifact.

- **Expected:** After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:865; apps/web/features/chat/pages/WebChatPage.tsx:5956
- **Where to find it:** Chat > "Artifacts" button (panel toggle) or the artifact card in the reply > "Open artifact" (labels found in the code)
- **Needs:** a conversation with an artifact
- **Steps:**
  1. Open an artifact, then close the viewer with "Close artifact viewer".
  2. Click the "Artifacts" button (tooltip "Artifacts") to open the panel.
  3. Pick the same artifact again.
  4. Reload the page with the browser reload, then open the conversation again.
  5. Compare: the artifact opens again after the reload.

## S26.08 Docked side panel.

- **Expected:** The artifact opens in a panel docked beside the conversation, so both are visible at once.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5834 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:1201
- **Where to find it:** Chat > open an artifact (card "Open artifact" or the "Artifacts" button) > the panel appears to the right of the conversation (labels found in the code)
- **Needs:** a wide window (desktop layout)
- **Steps:**
  1. Ask for an artifact on a wide window, then click "Open artifact" on its card.
  2. Look at the screen.
  3. Compare: the conversation stays visible on the left and the artifact panel is docked on the right.
  4. Click "Close artifacts panel" to hide it and check the conversation fills the window again.

## S26.09 Resizable panel.

- **Expected:** The user can change the width of the docked artifact panel (pointer drag or keyboard), and the width is kept.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:468 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:407 (quoted code not found in the file now)
- **Where to find it:** Chat > docked artifact panel > the left edge handle "Resize artifacts panel" (labels found in the code)
- **Needs:** a wide window (desktop layout)
- **Steps:**
  1. Open an artifact so the docked panel shows.
  2. Drag the thin handle on the panel's left edge left or right with the mouse.
  3. Compare: the panel gets wider or narrower.
  4. Click the handle, then press the Left or Right arrow keys.
  5. Close the panel, open it again, and compare the width.

## S26.10 Full-screen artifact.

- **Expected:** The user can expand any open artifact to fill the screen and return from it.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2939; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2939
- **Where to find it:** Chat > open an artifact > header button "Expand" (labels found in the code)
- **Needs:** an artifact open in the viewer
- **Steps:**
  1. Open an artifact in the docked panel.
  2. Click the expand icon in the viewer header, tooltip "Expand".
  3. Compare: the artifact fills the screen.
  4. Click the same control, now "Exit fullscreen", to return.
  5. Compare: the layout returns to the docked panel.

## S26.11 Detached artifact window where supported.

- **Expected:** Where the platform allows it, the artifact can be popped out into its own window or tab that shows the rendered artifact.
- **Code:** done. Evidence present: apps/desktop/electron/windowPolicy.ts:252; apps/desktop/electron/windowPolicy.ts:330; apps/desktop/electron/windowPolicy.ts:292
- **Where to find it:** Chat > open an HTML or SVG artifact > More artifact actions > "Open in new tab" (labels found in the code)
- **Needs:** an HTML or SVG artifact
- **Steps:**
  1. Ask for an HTML page artifact and open it.
  2. Click the "More artifact actions" button (the three-dot button).
  3. Click "Open in new tab".
  4. Compare: a new window or tab opens showing the rendered page.
  5. In the Electron desktop app, check the new window shows the rendered artifact.

## S26.12 Multiple-artifact switching.

- **Expected:** When a conversation has several artifacts, the user can switch between them without leaving the viewer.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:782; apps/web/features/chat/stores/artifacts-store.ts:803
- **Where to find it:** Chat > a conversation with two or more artifacts > the "Artifacts" panel > click another artifact (labels found in the code)
- **Needs:** a conversation with two artifacts
- **Steps:**
  1. Ask Chat for two artifacts in one conversation (for example a document and an HTML page).
  2. Open the "Artifacts" panel.
  3. Click the first artifact, then click the second.
  4. Compare: the viewer switches to the second artifact without closing the panel.
  5. Use the tabs or the list to switch back to the first.

## S26.13 Artifact tabs.

- **Expected:** The open artifacts of a conversation are shown as tabs in the viewer, one per artifact, including one being written.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:61; apps/web/features/chat/stores/artifacts-store.ts:872
- **Where to find it:** Chat > a conversation with two or more artifacts > the tab row above the viewer (each tab shows its title) (labels found in the code)
- **Needs:** a conversation with two or more artifacts
- **Steps:**
  1. Ask Chat for two or more artifacts in one conversation.
  2. Open the "Artifacts" panel.
  3. Look for a tab per artifact in the top row. Each tab shows the artifact's title.
  4. Ask for another artifact while the first is still writing.
  5. Compare: the one being written also appears as a tab.

## S26.14 Source/preview toggle.

- **Expected:** For a renderable artifact the user can switch between the rendered preview and its source.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2600; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2260
- **Where to find it:** Chat > open an HTML, React or SVG artifact > the two icon buttons "Preview" and "Source" in the viewer header (labels found in the code)
- **Needs:** an HTML, React or SVG artifact
- **Steps:**
  1. Open an HTML page artifact in the viewer.
  2. Click the icon button labelled "Preview".
  3. Compare: the rendered page shows.
  4. Click the icon button labelled "Source".
  5. Compare: the code of the artifact shows.

## S26.15 Direct-edit mode.

- **Expected:** The user can edit an artifact's content directly in the viewer and save it as a new version.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1341 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1124
- **Where to find it:** Chat > open a document or code artifact (latest version) > header "Edit" button, or More artifact actions > "Edit source" (labels found in the code)
- **Needs:** a Free account or a paid account, an artifact written in chat
- **Steps:**
  1. Open the latest version of a document or code artifact.
  2. Click "Edit" in the viewer header (or More artifact actions > "Edit source").
  3. Type a change in the text.
  4. Click "Save" (tooltip "Save as a new version").
  5. Compare: a new version is created, and the version chip shows one more version.

## S26.16 Read-only mode.

- **Expected:** An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1041; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1873 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The rule is in ArtifactPreview.tsx (canEditSource: panel variant, stored, latest version, not PDF, DOCX or image). Shared-copy read-only was not traced.
- **Needs:** an artifact with at least two versions
- **Steps:**
  1. Open an artifact that has at least two versions.
  2. Use "Previous version" to move to an older version.
  3. Compare: the "Edit" button is not shown and the content cannot be changed there.
  4. Open a PDF or image artifact and check that no "Edit" button appears.

## S26.20 Version selector.

- **Expected:** The viewer shows which version of the artifact is displayed and lets the user pick any other version directly.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactVersionHistory.tsx:76; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2981
- **Where to find it:** Chat > open an artifact with edits > the version chip in the muted line under the title > "Version history" (labels found in the code)
- **Needs:** an artifact with several versions (edit it first)
- **Steps:**
  1. Open an artifact that has been edited so it has several versions.
  2. Read the chip, for example showing "Version N of M" in the header.
  3. Click it, or the "Version history" control.
  4. Pick another "Version N" from the list.
  5. Compare: the viewer shows that version and the chip number changes.

## S26.21 Previous/next version.

- **Expected:** The user can step to the previous and next version of an artifact and see which version is shown.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2652; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:844
- **Where to find it:** Chat > open an artifact with several versions > "Previous version" and "Next version" arrow buttons beside the version chip (labels found in the code)
- **Needs:** an artifact with several versions (edit it first)
- **Steps:**
  1. Open an artifact with at least two versions.
  2. Click "Previous version".
  3. Compare: the viewer shows the earlier version and the chip number goes down by one.
  4. Click "Next version" to step forward.
  5. Compare: the chip returns to the later version.

## S26.23 Restore version.

- **Expected:** The user can restore an earlier version so it becomes the current one, without losing the versions in between.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1294 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:976
- **Where to find it:** Chat > open an older version (Previous version) > More artifact actions > "Restore version" with the number, then confirm "Restore" (labels found in the code)
- **Needs:** an artifact with several versions (edit it first)
- **Steps:**
  1. Open an artifact with several versions and step back with "Previous version".
  2. Click "More artifact actions", then the item that starts with "Restore version" and shows the number.
  3. In the dialog, confirm with "Restore".
  4. Compare: that version becomes the current one.
  5. Open "Version history" and check the versions in between are still listed.

## S26.24 Duplicate artifact.

- **Expected:** The user can duplicate an artifact into an independent copy that can change without touching the original.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1475 (quoted code not found in the file now); apps/web/features/chat/stores/artifacts-store.ts:929
- **Where to find it:** Chat > open an artifact in the panel > More artifact actions > "Duplicate" (labels found in the code)
- **Needs:** a stored artifact in the panel
- **Steps:**
  1. Open an artifact in the docked panel.
  2. Click "More artifact actions" and choose "Duplicate".
  3. Compare: the toast "Duplicated. Edits here no longer touch the original." appears.
  4. Edit the copy, then open the original.
  5. Compare: the original is unchanged.

## S26.26 Save to Library.

- **Expected:** The user can save an artifact into their Library so it lives with their other files outside the chat.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1443; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1815 (quoted code not found in the file now); apps/web/app/api/library/route.ts:234; apps/web/app/api/library/route.ts:277
- **Where to find it:** Chat > open a text or code artifact > More artifact actions > "Save to Library" (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Open an artifact that is not an image, PDF or Word file.
  2. Click "More artifact actions" and choose "Save to Library".
  3. Compare: the toast "Saved to your Library" appears.
  4. Open Library from the app's navigation (the Library page is at /chat/library).
  5. Compare: the artifact is listed in the Library.

## S26.27 Associate with Project.

- **Expected:** From the artifact viewer the user can attach the artifact to a chosen project, and it then shows up in that project.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1528 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:358
- **Where to find it:** Chat > open an artifact > More artifact actions > group "Save to project" > pick the project name (labels found in the code)
- **Needs:** a paid account or a Free account with a project
- **Steps:**
  1. Make sure you have at least one project (Chat > Projects).
  2. Open an artifact and click "More artifact actions".
  3. Find the group "Save to project" and click a project name.
  4. Compare: the artifact is added as a source of that project.
  5. Open that project and check the file is listed.

## S26.28 Continue from another chat.

- **Expected:** The user can take an existing artifact into a different (e.g. new) chat and keep working on it there.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1443; apps/web/features/library/lib/library-chat-handoff.ts:56
- **Where to find it:** not found in the code. Searched the artifact viewer, artifacts panel and apps/web/features/library for a continue, handoff or new-chat control on an artifact; found only stageLibraryItemForNewChat in apps/web/features/library/lib/library-chat-handoff.ts used by the Library view, and no label that matches an artifact taking a new chat.
- **Needs:** a Free account or a paid account

## S26.29 Export menu.

- **Expected:** The artifact viewer offers a menu of export formats and each choice saves a file in that format.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2789; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1381
- **Where to find it:** Chat > open an artifact > header "Download" button > pick a format such as "Download as HTML" (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Open an artifact in the viewer.
  2. Click the "Download" button in the header.
  3. Look at the menu of formats: for example "Download as HTML", "Download as Markdown", "Download source" and, for a document, "Download as Word (.docx)" or "Download as PDF".
  4. Pick one, then check the file saved to the downloads folder opens in that format.
  5. For a CSV-type artifact, check "Download as CSV" is shown.

## S26.30 Copy content.

- **Expected:** A copy control puts the artifact's own content on the clipboard and confirms it.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2900; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1213
- **Where to find it:** Chat > open an artifact > header "Copy" button (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Open an artifact in the viewer.
  2. Click the "Copy" button in the header.
  3. Compare: the button changes to "Copied" to confirm.
  4. Paste into a text editor.
  5. Compare: the pasted text is the artifact's own content.

## S26.31 Share controls.

- **Expected:** The user can publish an artifact to a link, copy/share the link, choose who can open it, and take it down.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:2924; apps/web/features/chat/components/artifacts/publishArtifactClient.ts:88
- **Where to find it:** Open an artifact in the chat artifact viewer > click the Publish button (globe icon) in the viewer header, or open the More menu > Publish. After publishing, the bar under the header shows the link, a Copy link button, and a Who can open this menu. To take a link down: Settings > Shared links > Published artifacts > Unpublish artifact. (labels found in the code)
- **Needs:** a signed-in account and an artifact that can be published (not a file type that is blocked from publishing); a second workspace member if testing Everyone in this workspace
- **Steps:**
  1. Send a message that makes an artifact, then open it from the chat card so the viewer opens.
  2. Click the globe Publish button in the viewer header (or More menu > Publish) and wait for the Published message.
  3. Click Copy link in the bar that appears under the header and check that a Link copied message shows.
  4. Open the Who can open this menu and check the three choices: Anyone with the link, Everyone in this workspace, Only people you invite.
  5. Open Settings > Shared links > Published artifacts, click Unpublish on the artifact, then click Unpublish artifact in the confirm dialog, and check the row is gone and the link stops working.

## S26.32 Public/private state.

- **Expected:** Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/publishArtifactClient.ts:132; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:520; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:375 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:3007; apps/web/app/api/artifacts/publish/route.ts:450 (quoted code not found in the file now)
- **Where to find it:** Settings > Shared links > Published artifacts. Each row shows its audience label. The same audience choice also appears in the artifact viewer under Who can open this after publishing. (labels found in the code)
- **Needs:** a signed-in account with at least one published artifact; a workspace for the Everyone in this workspace choice
- **Steps:**
  1. Publish an artifact (see S26.31) so that it has a link.
  2. Open Settings > Shared links and find the Published artifacts list.
  3. Check the audience text on the artifact row: Anyone with the link, Everyone in this workspace or Only people you invite.
  4. Open the same artifact in the viewer and check that the Who can open this menu shows the same choice.
  5. Compare with Expected: each place shows the same visibility state.

## S26.35 Runtime error panel.

- **Expected:** When an artifact fails while rendering or running, the viewer replaces it with an error panel that explains the failure and offers source/retry.
- **Code:** done. Evidence present: infrastructure/sandbox/index.html:920; infrastructure/sandbox/index.html:926
- **Where to find it:** Open an artifact that fails when it runs (for example an HTML artifact whose script throws an error) in the artifact viewer. The viewer replaces the preview with an error panel with the buttons View source and Retry. (labels found in the code)
- **Needs:** an artifact that fails to render (you must make one in the chat)
- **Steps:**
  1. Ask the chat for an HTML artifact whose script throws an error on load, such as one that calls an undefined function.
  2. Open the artifact in the viewer and wait for the preview to load.
  3. Look for the error panel: the title says it could not be rendered, with the error text below it.
  4. Click View source and check that the code tab opens.
  5. Go back, click Retry, and check that the error panel shows again or the preview renders.

## S26.36 Dependency-loading state.

- **Expected:** While an artifact's runtime or libraries load, the viewer shows a loading state, and a failed load is reported.
- **Code:** done. Evidence present: infrastructure/sandbox/index.html:700; infrastructure/sandbox/index.html:920
- **Where to find it:** Open a React artifact in the artifact viewer. While the runtime loads, the preview shows the text Loading React… and a spinner with the label Loading the preview. (labels found in the code)
- **Needs:** a React artifact; a network blocker or an offline setting to see a failed load
- **Steps:**
  1. Ask the chat for a React component artifact.
  2. Open it in the viewer and look right away for the spinner and the text Loading React….
  3. Wait until the component appears, and check the loading text is gone.
  4. To see a failed load, the tester must block the React script address with a network blocker; without that, the failure cannot be produced by a normal user step.
  5. Compare with Expected: loading is shown, and a failed load shows an error with the message The React runtime could not be loaded from.

## S26.38 Open originating session.

- **Expected:** From an artifact seen outside its chat (gallery, list, library), the user can jump to the conversation that produced it.
- **Code:** done. Evidence present: apps/web/app/gallery/GalleryClient.tsx:836; apps/web/app/gallery/GalleryClient.tsx:933
- **Where to find it:** Gallery (public route /gallery): click an artifact card to open its drawer, then click Open chat. The Open chat link appears only when the artifact has a source conversation. (labels found in the code)
- **Needs:** a signed-in account and a gallery artifact that came from a conversation
- **Steps:**
  1. Open the gallery at the /gallery page.
  2. Click an artifact card to open its drawer.
  3. Look for the Open chat link in the drawer header area.
  4. Click Open chat and check that the conversation that made the artifact opens.
  5. Compare with Expected: the user lands in the originating chat.

## S26.39 Live updates from ongoing work.

- **Expected:** While a reply or run is still producing an artifact, the artifact view updates live as content arrives.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:838; apps/web/features/chat/hooks/use-streaming-artifact.ts:102
- **Where to find it:** Chat: send a message that asks for an artifact (for example an HTML page). The artifact panel opens while the reply is still writing, shows the status Writing… and the title Generating artifact, and the code updates as it arrives. (labels found in the code)
- **Needs:** a signed-in account that can send chat messages
- **Steps:**
  1. Type a request such as Make a one-page HTML landing page and send it.
  2. Watch the artifact panel open while the reply is still being written.
  3. Check the status text Writing… next to the artifact title.
  4. Watch the code body scroll and grow line by line.
  5. Compare with Expected: the artifact view updates live until the reply is finished, then the status changes.
