---
id: "PLAN-chrome-026"
type: "test-plan"
title: "Chrome · 26. Artifact container and panel"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "26"
---
# Chrome · 26. Artifact container and panel

30 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S26.02 Artifact title.

- **Expected:** The artifact's title is shown on its card and in the viewer, with a fallback when the artifact has none.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > reply with an artifact > artifact card under the reply (name line) > Open (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Sign in and open the side panel chat.
  2. Ask the chat for one HTML page or one code file and wait for the reply to finish.
  3. Look at the artifact card under the reply: its name line should show the artifact's title.
  4. Click Open on the card.
  5. Compare the heading at the top of the artifact panel with the card name; both should show the same title.

## S26.03 Artifact type.

- **Expected:** The artifact's kind (HTML, React, diagram, document, code, spreadsheet...) is shown on its card and in the viewer.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > reply with an artifact > artifact card under the reply (line under the name) (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Ask the chat for one HTML page and wait for the reply to finish.
  2. Look at the line under the card name: it should read 'Artifact · HTML'.
  3. Ask for a React component, then for a Mermaid diagram, and check the same line reads 'Artifact · React' and 'Artifact · Mermaid'.
  4. Ask for a code file or a document and compare the line with Expected.

## S26.05 Open artifact.

- **Expected:** User can open an artifact from the chat or from an artifact list into a view that shows its content.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > reply with an artifact > artifact card under the reply > Open (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Sign in, ask the chat for one HTML page and wait for the reply.
  2. Find the artifact card under the reply.
  3. Click Open on the card.
  4. Look: the artifact panel opens above the messages and shows the artifact's content.

## S26.06 Close artifact without deleting it.

- **Expected:** Closing the artifact viewer hides it without deleting the artifact, which stays available to reopen.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Artifact panel header > close icon button (tooltip 'Close artifact') (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Open an artifact with the card's Open button.
  2. Click the X icon at the top right of the panel, or press Escape.
  3. Look: the panel hides and the card under the reply still shows, with its button reading Open again.
  4. Click Open on the card to check the artifact is still there.

## S26.07 Reopen artifact.

- **Expected:** After closing, the user can reopen the same artifact later (from the chat, a toggle, or a list), including after a reload.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Artifact card under the reply > Open (after the panel is closed) (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Open an artifact, then close the panel with the X icon.
  2. Click Open on the same artifact card again.
  3. Look: the panel opens with the same title and content as before.
  4. Reload the side panel and check whether the card under the reply still opens the artifact.

## S26.08 Docked side panel.

- **Expected:** The artifact opens in a panel docked beside the conversation, so both are visible at once.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Artifact card under the reply > Open; the panel appears above the chat messages (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Ask for one HTML page and wait for the reply.
  2. Click Open on the artifact card.
  3. Look: the artifact panel takes the top part of the chat and the messages stay visible below it.
  4. Compare with Expected: both should be visible at once, side by side.

## S26.09 Resizable panel.

- **Expected:** The user can change the width of the docked artifact panel (pointer drag or keyboard), and the width is kept.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched artifactPanel.ts and side_panel.ts for resize, drag and width controls; none found, and the panel height is fixed at 55%.

## S26.10 Full-screen artifact.

- **Expected:** The user can expand any open artifact to fill the screen and return from it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched artifactPanel.ts and side_panel.ts for full-screen and expand controls; none found.

## S26.11 Detached artifact window where supported.

- **Expected:** Where the platform allows it, the artifact can be popped out into its own window or tab that shows the rendered artifact.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched for detach and pop-out controls; none found, and the 'Run ... in this chat on the web' button opens the whole chat in a browser tab, not the artifact alone.

## S26.12 Multiple-artifact switching.

- **Expected:** When a conversation has several artifacts, the user can switch between them without leaving the viewer.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel chat > reply with two or more artifacts > artifact cards under the reply > Open on the second card (labels found in the code)
- **Needs:** a signed-in account and a reply that makes two artifacts
- **Steps:**
  1. Ask the chat for two different artifacts in one reply and wait for the reply to finish.
  2. Click Open on the first artifact card.
  3. Click Open on the second artifact card.
  4. Look: the panel now shows the second artifact and the second card's button reads Hide, without closing the panel.

## S26.13 Artifact tabs.

- **Expected:** The open artifacts of a conversation are shown as tabs in the viewer, one per artifact, including one being written.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No tab strip was found in artifactPanel.ts; the viewer shows one artifact at a time and each artifact in a reply has its own card.

## S26.14 Source/preview toggle.

- **Expected:** For a renderable artifact the user can switch between the rendered preview and its source.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Artifact panel > Preview and Code buttons above the panel body (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an HTML artifact
- **Steps:**
  1. Ask for one HTML page, wait for the reply, and click Open on its card.
  2. Look: the Preview button is pressed and the rendered page shows.
  3. Click Code.
  4. Look: the artifact's source shows in a code block with Code pressed; click Preview to return.

## S26.15 Direct-edit mode.

- **Expected:** The user can edit an artifact's content directly in the viewer and save it as a new version.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched artifactPanel.ts and side_panel.ts for edit controls; the viewer offers only copy, download and Code view, with no edit mode found.

## S26.16 Read-only mode.

- **Expected:** An artifact can be viewed in a read-only state where its content cannot be changed (e.g. a viewer, an older version, or a shared copy).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** no screen of its own. The code has no edit state, so the viewer is always read-only, and no read-only state for older versions or shared copies was found.

## S26.20 Version selector.

- **Expected:** The viewer shows which version of the artifact is displayed and lets the user pick any other version directly.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched artifactPanel.ts and side_panel.ts for version controls; none found.

## S26.21 Previous/next version.

- **Expected:** The user can step to the previous and next version of an artifact and see which version is shown.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No previous or next version control was found in the artifact code.

## S26.23 Restore version.

- **Expected:** The user can restore an earlier version so it becomes the current one, without losing the versions in between.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No restore-version control was found in the artifact code.

## S26.24 Duplicate artifact.

- **Expected:** The user can duplicate an artifact into an independent copy that can change without touching the original.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No duplicate-artifact control was found in the artifact code.

## S26.26 Save to Library.

- **Expected:** The user can save an artifact into their Library so it lives with their other files outside the chat.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for a Save to Library control on artifacts; none found.

## S26.27 Associate with Project.

- **Expected:** From the artifact viewer the user can attach the artifact to a chosen project, and it then shows up in that project.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No artifact-to-project control was found; the chat has a project chip (sp-project-chip in side_panel.ts) that is not specific to artifacts.

## S26.28 Continue from another chat.

- **Expected:** The user can take an existing artifact into a different (e.g. new) chat and keep working on it there.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No continue-in-new-chat control was found; the 'Run ... in this chat on the web' button opens the same chat on the web, not a new one.

## S26.29 Export menu.

- **Expected:** The artifact viewer offers a menu of export formats and each choice saves a file in that format.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Artifact panel header > Download icon button (tooltip 'Download $FILE$') (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Open an artifact from its card.
  2. Click the Download icon in the panel header.
  3. Look: the status line under the header reads 'Saved' with the file name, and one file is saved in the artifact's own format.
  4. Compare with Expected: Expected says a menu of export formats, but no menu was found.

## S26.30 Copy content.

- **Expected:** A copy control puts the artifact's own content on the clipboard and confirms it.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Artifact panel header > Copy icon button (tooltip 'Copy the source of $TITLE$') (labels found in the code)
- **Needs:** a signed-in account and a reply that makes an artifact
- **Steps:**
  1. Open an artifact from its card.
  2. Click the Copy icon in the panel header.
  3. Look: the status line under the header reads 'Copied.'.
  4. Paste into a plain text field and compare with the text in the Code view.

## S26.31 Share controls.

- **Expected:** The user can publish an artifact to a link, copy/share the link, choose who can open it, and take it down.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No artifact publish, link, access or take-down control was found; chat-level sharing exists (createChromeShareLink in side_panel.ts) but is not artifact-specific.

## S26.32 Public/private state.

- **Expected:** Wherever an artifact is shown, the user can see whether it is private, published to anyone, or shared with the workspace.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No private, published or workspace state is shown on artifact cards or in the artifact panel.

## S26.35 Runtime error panel.

- **Expected:** When an artifact fails while rendering or running, the viewer replaces it with an error panel that explains the failure and offers source/retry.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel: an answer with an artifact card > Open > the panel's status line that reads "The preview could not start. Review the source or try again." > Code switch to see the source (labels found in the code)
- **Needs:** a signed-in account, and an artifact that fails to render (not something the tester can fully control)
- **Steps:**
  1. Sign in and open the AGI side panel in Chrome.
  2. Ask the assistant for a small web page (HTML) or another artifact that may fail to run. A deliberate script error is the reliable way to trigger it.
  3. Click Open on the artifact card in the answer.
  4. If the preview fails, read the status line under the panel header.
  5. Click Code to see the source.
  6. Compare with Expected: Expected asks for an error panel that explains the failure and offers source and retry. The code shows a status line plus the Preview/Code switch only, with no retry button.

## S26.36 Dependency-loading state.

- **Expected:** While an artifact's runtime or libraries load, the viewer shows a loading state, and a failed load is reported.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel: an answer with an artifact card > Open > the panel's status line "Starting the preview…"; if the preview never starts, the note "The live preview is not available right now, so the panel shows the source." (labels found in the code)
- **Needs:** a signed-in account; a way to block or slow the preview (for example a network block) to see the failure path
- **Steps:**
  1. Sign in and open the AGI side panel in Chrome.
  2. Ask the assistant for an HTML artifact, then wait for the reply to finish.
  3. Click Open on the artifact card.
  4. Look right after it opens for the status line "Starting the preview…".
  5. If the preview does not start, wait about 15 seconds. The panel should switch to the source with the note "The live preview is not available right now, so the panel shows the source."
  6. Compare with Expected: Expected asks for a loading state while libraries load and a reported failure. The code shows the status line and the timeout note, and has no separate library-loading indicator.

## S26.38 Open originating session.

- **Expected:** From an artifact seen outside its chat (gallery, list, library), the user can jump to the conversation that produced it.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/artifactsClient.ts:4
- **Where to find it:** Side panel: an answer with an artifact card > Open > the panel's external-link icon button (tooltip "Run $TITLE$ in this chat on the web") (labels found in the code)
- **Needs:** a signed-in account and a chat saved to the account (the button is hidden for Temporary chat or for chats not synced to the account)
- **Steps:**
  1. Sign in and open the AGI side panel in Chrome, in a normal chat (not a Temporary chat).
  2. Ask for an artifact so a card appears in the reply.
  3. Click Open on the artifact card.
  4. Hover the external-link icon button in the panel header to read its tooltip.
  5. Click that button. A new browser tab should open for the same chat on the web.
  6. Compare with Expected: Expected asks for a jump from a gallery, list or library. The extension has no such view; the jump exists only from the panel opened from a chat reply.

## S26.39 Live updates from ongoing work.

- **Expected:** While a reply or run is still producing an artifact, the artifact view updates live as content arrives.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel: an answer that is still writing > artifact card titled "Creating $TITLE$" > Open, then watch the source update (labels found in the code)
- **Needs:** a signed-in account and a reply long enough to stay in progress while the tester watches
- **Steps:**
  1. Sign in and open the AGI side panel in Chrome.
  2. Ask for a long artifact (for example a multi-section HTML page) and do not wait for the reply to finish.
  3. While the reply is still writing, look for the card titled "Creating $TITLE$".
  4. Click Open on that card and watch the source area for text appearing as the reply streams.
  5. Compare with Expected: Expected asks for the view to update live as content arrives. The code re-renders the panel when the artifact changes, and the preview only runs after streaming ends, so the panel shows source while it updates.

## S26.40 Mobile reader adaptation.

- **Expected:** On a phone-sized screen the artifact reader adapts (full-screen sheet, touch controls) instead of a cramped side panel.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for artifact readers, and checked artifactPanel.ts and side_panel.ts for media queries and phone, mobile or sheet layout terms. The extension is a Chrome side panel only, and no phone-sized artifact reader was found. The phone sheet in apps/extension/src/features/side-panel/phoneSheet.ts is for pairing a phone, not for reading artifacts.
- **Needs:** a phone-sized screen
