---
id: "PLAN-mobile-026"
type: "test-plan"
title: "Mobile · 26. Artifact container and panel"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "26"
---
# Mobile · 26. Artifact container and panel

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S26.01 Artifact launch card inside chat.

- **Expected:** An assistant reply that produces an artifact shows a card in the transcript; activating it opens that artifact.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:2807; apps/mobile/src/features/chat/components/MessageBubble.tsx:1388; apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:154 (quoted code not found in the file now)
- **Where to find it:** Chat > open a reply that writes an artifact > tap the card under that reply (it shows the artifact title and type in capitals) (labels found in the code)
- **Needs:** an account that can chat
- **Steps:**
  1. Sign in and open a chat.
  2. Ask the assistant for a small self-contained web page or a code file.
  3. Wait until the reply finishes and a card appears under it.
  4. Tap the card.
  5. Compare: a full-screen viewer opens with the same artifact (Expected: the card opens the artifact).

## S26.02 Artifact title.

- **Expected:** The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:153 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:310 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1240
- **Where to find it:** Chat > tap an artifact card > read the title at the top of the viewer (it reads 'title · TYPE') (labels found in the code)
- **Needs:** an artifact with a name and one without (for example a diagram or web page without a title)
- **Steps:**
  1. Open a chat with an artifact and tap its card.
  2. Read the bold title at the top left of the viewer.
  3. Read the title on the card in the chat.
  4. Check the fallback: an artifact with no name shows the kind name, for example 'Web page' or 'Diagram'.
  5. Compare with Expected: title shown on card and viewer, with a fallback.

## S26.03 Artifact type.

- **Expected:** The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:192 (quoted code not found in the file now); apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:221
- **Where to find it:** Chat > tap an artifact card > read the capital-letter type word in the viewer header; the card shows the same word under its title (labels found in the code)
- **Needs:** artifacts of two different kinds
- **Steps:**
  1. Open a chat with an artifact of a known kind (for example a chart or a document).
  2. Look at the small capital-letter word on the card, such as CHART or DOCUMENT.
  3. Tap the card and read the type after the middle dot in the viewer header.
  4. Compare with Expected: kind shown on card and in viewer.

## S26.04 Artifact status.

- **Expected:** The artifact shows its lifecycle state: being written, finished, stopped before it finished, or failed.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/StreamingArtifactCard.tsx:65
- **Where to find it:** Chat > send a request that makes an artifact > while the reply is still writing, the card shows 'Writing…'; a stopped or failed write shows 'Stopped' or 'Failed' on the card (labels found in the code)
- **Needs:** a model reply long enough to watch while it writes
- **Steps:**
  1. Send a request that asks for a long artifact.
  2. While the reply is still writing, look at the card for 'Writing…' under its title.
  3. Stop the reply before it finishes, if the app offers a stop control.
  4. Look at the card for 'Stopped' (title becomes 'Stopped artifact').
  5. Compare with Expected: being written, finished, stopped or failed each shown.

## S26.05 Open artifact.

- **Expected:** User can open an artifact from the chat or from an artifact list into a view that shows its content.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:154 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1388; apps/mobile/src/features/artifacts/index.tsx:166; apps/mobile/src/features/artifacts/index.tsx:312 (quoted code not found in the file now)
- **Where to find it:** Menu (side drawer) > Library > 'Artifacts' filter chip > tap an artifact; or in chat, tap an artifact card (labels found in the code)
- **Needs:** at least one saved artifact
- **Steps:**
  1. Open the side menu and tap 'Library'.
  2. Tap the 'Artifacts' filter chip.
  3. Tap an artifact to open it.
  4. Compare: its content shows in a view (Expected: open from chat or a list).

## S26.06 Close artifact without deleting it.

- **Expected:** Closing the artifact viewer hides it without deleting the artifact, which stays available to reopen.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1391; apps/mobile/src/features/chat/components/MessageBubble.tsx:1395
- **Where to find it:** Chat > tap an artifact card > tap the X (accessibility name 'Close') at the top right of the viewer (labels found in the code)
- **Steps:**
  1. Open an artifact from its card in chat.
  2. Tap the X icon at the top right of the viewer.
  3. Check the viewer closes and you are back in the conversation.
  4. Check the card is still under the reply.
  5. Compare with Expected: closing hides it and it stays available.

## S26.07 Reopen artifact.

- **Expected:** After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:154 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1388; apps/mobile/src/features/artifacts/store.ts:314
- **Where to find it:** Chat > tap the same artifact card again; or Menu > Library > 'Artifacts' > tap the artifact (labels found in the code)
- **Needs:** an account with a saved artifact; a way to restart the app
- **Steps:**
  1. Open an artifact, then close it with the X.
  2. Tap the same card again or open it from Library > Artifacts.
  3. Force-quit and reopen the app, then open the chat and tap the card.
  4. Compare: the same artifact opens (Expected: reopen after close and after reload).

## S26.10 Full-screen artifact.

- **Expected:** The user can expand any open artifact to fill the screen and return from it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1281; apps/mobile/src/features/chat/components/MessageBubble.tsx:1388
- **Where to find it:** Chat > tap an artifact card; the viewer opens over the whole screen and closes with the X (labels found in the code)
- **Steps:**
  1. Tap an artifact card in chat.
  2. Check the viewer fills the whole screen.
  3. Tap the X to return to the conversation.
  4. Compare with Expected: the artifact can be expanded to full screen and returned from.

## S26.12 Multiple-artifact switching.

- **Expected:** When a conversation has several artifacts, the user can switch between them without leaving the viewer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:3206; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1537
- **Where to find it:** Chat > a reply or conversation with two or more artifacts > tap one artifact card > use the row of artifact titles under the viewer header to switch (path not confirmed in the code; trust the screen)
- **Needs:** a conversation with two or more artifacts
- **Steps:**
  1. Open a conversation with at least two artifacts.
  2. Tap one artifact card to open the viewer.
  3. Look for the row of artifact titles under the header.
  4. Tap another title in the row.
  5. Compare: the viewer shows that artifact without closing (Expected: switch without leaving the viewer).

## S26.14 Source/preview toggle.

- **Expected:** For a renderable artifact the user can switch between the rendered preview and its source.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:353 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:638 (quoted code not found in the file now); apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:20 (quoted code not found in the file now)
- **Where to find it:** Chat > tap an artifact card > tap 'Preview' or 'Source' in the tab row under the viewer header (shown only for artifacts that can be previewed) (labels found in the code)
- **Needs:** a previewable artifact (for example an HTML page)
- **Steps:**
  1. Open an HTML or diagram artifact from its card.
  2. Tap 'Source' and read the code.
  3. Tap 'Preview' and read the rendered view.
  4. Compare with Expected: switch between the rendered preview and the source.

## S26.16 Read-only mode.

- **Expected:** An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1901; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:152 (quoted code not found in the file now)
- **Where to find it:** Chat > tap an artifact with two or more versions > tap 'Previous version' to an older version > tap the More artifact actions button and look for 'Edit source' (labels found in the code)
- **Needs:** an artifact with two or more versions (made by editing it first)
- **Steps:**
  1. Open an artifact that has at least two versions.
  2. Step back to an older version with the left arrow next to 'Version N of M'.
  3. Tap the More artifact actions button (three dots).
  4. Check that 'Edit source' is not listed for the older version.
  5. Compare with Expected: the older version is viewable without changing it.

## S26.20 Version selector.

- **Expected:** The viewer shows which version of the artifact is displayed and lets the user pick any other version directly.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1443; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1929
- **Where to find it:** Chat > tap an artifact with two or more versions > tap the 'Version N of M' button under the viewer header to open 'Version history' (labels found in the code)
- **Needs:** an artifact with two or more versions
- **Steps:**
  1. Open an artifact with more than one version.
  2. Read the 'Version N of M' control under the header.
  3. Tap it to open the 'Version history' sheet.
  4. Tap a version row to show that version.
  5. Compare: the viewer shows the chosen version and its number (Expected: see and pick any version).

## S26.21 Previous/next version.

- **Expected:** The user can step to the previous and next version of an artifact and see which version is shown.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1449; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1486; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:392 (quoted code not found in the file now)
- **Where to find it:** Chat > tap an artifact with two or more versions > use the left and right arrows beside 'Version N of M' under the viewer header (labels found in the code)
- **Needs:** an artifact with two or more versions
- **Steps:**
  1. Open an artifact with at least three versions.
  2. Tap the left arrow ('Previous version') and check the version number changes.
  3. Tap the right arrow ('Next version').
  4. Check the arrows are dimmed at the first and last version.
  5. Compare with Expected: step to previous and next and see which version is shown.

## S26.23 Restore version.

- **Expected:** The user can restore an earlier version so it becomes the current one, without losing the versions in between.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:811; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1521
- **Where to find it:** Chat > tap an artifact with two or more versions > step to an older version > tap 'Restore' in the version row under the viewer header (labels found in the code)
- **Needs:** an artifact with two or more versions
- **Steps:**
  1. Open an artifact with at least two versions.
  2. Step back to an older version with the left arrow.
  3. Tap 'Restore' (accessibility label 'Restore version N').
  4. Check the viewer now shows the restored content as the newest version.
  5. Open 'Version history' and check the versions in between are still listed.

## S26.29 Export menu.

- **Expected:** The artifact viewer offers a menu of export formats and each choice saves a file in that format.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1339; apps/mobile/src/features/chat/components/ArtifactExportSheet.tsx:95; apps/mobile/src/features/chat/utils/artifactExport.ts:81
- **Where to find it:** Chat > tap an artifact card > tap 'Download artifact' (download icon) in the top bar; if several formats exist, choose one in the 'Download as' sheet (labels found in the code)
- **Needs:** none; a way to view the saved file
- **Steps:**
  1. Open an artifact from its card.
  2. Tap the download icon in the top bar.
  3. If the 'Download as' sheet opens, tap a format such as Markdown, PDF, Plain text or Word.
  4. Save or share the file in the system sheet that opens.
  5. Compare: the file is in the chosen format (Expected: each choice saves that format).

## S26.30 Copy content.

- **Expected:** A copy control puts the artifact's own content on the clipboard and confirms it.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1366; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:643
- **Where to find it:** Chat > tap an artifact card > tap the copy icon ('Copy content') in the top bar, then paste elsewhere (labels found in the code)
- **Steps:**
  1. Open an artifact from its card.
  2. Tap the copy icon in the top bar.
  3. Check the icon changes to a check mark and the label reads 'Copied'.
  4. Paste into Notes or the chat box.
  5. Compare: the pasted text matches the artifact's content (Expected: a copy control puts that content on the clipboard and confirms).

## S26.32 Public/private state.

- **Expected:** Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/InlineArtifactCard.tsx:300; apps/mobile/src/features/artifacts/index.tsx:387; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1575
- **Where to find it:** Chat > an artifact card shows a small chip under its title: 'Published', 'Workspace' or 'Invited'; viewer shows 'Private. Only you can open it until you publish it.' in AGI Cloud mode (labels found in the code)
- **Needs:** an AGI Cloud account; a published or workspace-shared artifact; a private one for the private line
- **Steps:**
  1. Sign in to AGI Cloud and open an artifact that has been published or shared.
  2. Look at the small chip on its card in chat (and in Library > Artifacts).
  3. Open the artifact and check the publish area of the viewer.
  4. For a private artifact, check the line 'Private. Only you can open it until you publish it.'
  5. Compare with Expected: private, published, or workspace state is visible.

## S26.35 Runtime error panel.

- **Expected:** When an artifact fails while rendering or running, the viewer replaces it with an error panel that explains the failure and offers source/retry.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:69 (quoted code not found in the file now); apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:247; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:260; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1718
- **Where to find it:** Chat > open an HTML or React artifact that fails to render > the viewer shows 'This preview stopped with an error.' with 'Retry' and 'View source' (labels found in the code)
- **Needs:** an artifact that fails to render (made by asking the assistant for a broken page)
- **Steps:**
  1. Open an artifact whose page fails to run (for example an HTML page that throws an error on load).
  2. Read the error panel: 'This preview stopped with an error.'
  3. Tap 'View source' and check the source opens.
  4. Go back to Preview and tap 'Retry'.
  5. Compare with Expected: an error panel that explains the failure and offers source or retry.

## S26.39 Live updates from ongoing work.

- **Expected:** While a reply or run is still producing an artifact, the artifact view updates live as content arrives.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:2816; apps/mobile/src/features/chat/components/StreamingArtifactCard.tsx:114 (quoted code not found in the file now)
- **Where to find it:** Chat > send a request for an artifact > while the reply is writing, tap the card titled 'Generating artifact' (it shows 'Writing…') (labels found in the code)
- **Needs:** a reply that writes an artifact slowly enough to watch
- **Steps:**
  1. Send a request that asks for a long artifact such as a code file.
  2. While the card shows 'Writing…', tap the card.
  3. Watch the viewer as the content grows.
  4. Compare with Expected: the artifact view updates live while the reply writes.

## S26.40 Mobile reader adaptation.

- **Expected:** On a phone-sized screen the artifact reader adapts (full-screen sheet, touch controls) instead of a cramped side panel.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1281; apps/mobile/src/features/chat/components/MessageBubble.tsx:1388
- **Where to find it:** no screen of its own. This is a layout rule: the viewer is a full-screen Modal (overFullScreen, slide animation) in ArtifactFullScreen.tsx, so its effect is only seen on screen.
- **Needs:** phone width (the iPhone build or a phone-sized simulator)
- **Steps:**
  1. On a phone-sized screen, tap an artifact card in chat.
  2. Check the viewer covers the full screen with no side panel.
  3. Check the buttons in the top bar are large touch targets.
  4. Tap the X to return.
  5. Compare with Expected: full-screen reader with touch controls.
