---
id: "PLAN-desktop-007"
type: "test-plan"
title: "Desktop · 7. Layout systems"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "7"
---
# Desktop · 7. Layout systems

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S7.01 Centered new-chat layout.

- **Expected:** An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7637; apps/web/features/chat/pages/WebChatPage.tsx:5653 (quoted code not found in the file now); apps/web/app/chat/page.tsx:16
- **Where to find it:** Open a new chat (first screen after sign-in) > centre of the window shows the greeting 'Good morning' (or afternoon/evening) and the message box (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open a new, empty chat.
  2. Look at the centre of the window: the greeting and the message box should sit in the middle.
  3. Confirm there is no empty transcript area above the message box.

## S7.02 Reading-width conversation layout.

- **Expected:** Message text is constrained to a readable column width that stays centred when the window is wide.
- **Code:** done. Evidence present: apps/web/app/globals.css:842; apps/web/features/chat/components/messages/MessageBubble.tsx:2595; apps/web/app/chat/page.tsx:16
- **Where to find it:** no screen of its own. Layout rule in apps/web/app/globals.css and apps/web/features/chat/components/messages/MessageBubble.tsx.
- **Steps:**
  1. Ask a question that gets a long text answer.
  2. Make the window wide.
  3. Check that the answer text stays in a centred column of readable width instead of running across the full window.

## S7.03 Full-width data-analysis layout.

- **Expected:** Data work (tables, charts, spreadsheets) can be viewed in a layout that uses the full window width instead of the reading column.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:91; packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:170; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:801
- **Where to find it:** A table in a chat answer > hover the table > 'Expand table' button (labels found in the code)
- **Needs:** a chat answer that contains a table
- **Steps:**
  1. Ask for an answer that contains a wide table (for example a comparison table).
  2. Hover over the table and click 'Expand table'.
  3. Check that the expanded table uses the full window width and closes with 'Close expanded table'.

## S7.04 Conversation plus artifact split view.

- **Expected:** An artifact opens in its own pane beside the conversation so both are visible and usable at once.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5831 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:686; apps/web/features/chat/pages/WebChatPage.tsx:1226
- **Where to find it:** Chat with an artifact > 'Artifacts' button (title 'Artifacts') to open the artifacts panel beside the conversation (labels found in the code)
- **Needs:** a chat that has created an artifact
- **Steps:**
  1. Ask for a document or code file so that an artifact is created.
  2. Click the 'Artifacts' button or the artifact card.
  3. Check that the artifact opens in a pane beside the conversation and that you can scroll and type in both.

## S7.05 Conversation plus source-inspector split view.

- **Expected:** Sources behind an answer open in an inspector pane beside the conversation, so the reader can check a source without leaving the transcript.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7872; apps/web/features/chat/components/research/ResearchPanel.tsx:407; apps/web/features/chat/pages/WebChatPage.tsx:1224
- **Where to find it:** Research panel > tab group 'Research views' > 'Sources' tab (labels found in the code)
- **Needs:** a research answer with sources
- **Steps:**
  1. Run a research question that produces cited sources.
  2. Open the research panel beside the conversation.
  3. Select the 'Sources' tab and check that sources are listed beside the transcript, which stays visible.

## S7.07 Conversation plus code workspace.

- **Expected:** A coding session shows the conversation alongside the code workspace (changes, diffs, terminal or editor) in one view.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:2646; apps/web/features/code/CloudCodePage.tsx:2886; apps/web/features/chat/pages/WebChatPage.tsx:7140
- **Where to find it:** Top toggle 'Code' (the code surface) > open a coding session > chat with the code workspace (changes, terminal) (labels found in the code)
- **Needs:** a coding session that has changes or a terminal
- **Steps:**
  1. Open a coding session from the 'Code' view.
  2. Open the changes view (button next to the terminal icon in the session header).
  3. Check that the conversation and the code workspace (changes, diffs, terminal) are visible together.

## S7.08 Multi-session tiled layout.

- **Expected:** Two or more live sessions are visible side by side in one window, each independently usable.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeRail.tsx:530; apps/web/features/code/CloudCodePage.tsx:1800; apps/web/features/code/CloudCodePage.tsx:1853; apps/web/features/code/CloudCodePage.tsx:2423; apps/web/features/code/CloudCodePage.tsx:2914; apps/web/features/code/hooks/use-code-panes.ts:86; apps/web/features/code/hooks/use-code-panes.ts:93; apps/web/features/code/hooks/use-code-panes.ts:105; apps/web/features/code/components/CodePanes.tsx:25; apps/web/features/code/components/CodePanes.tsx:60
- **Where to find it:** Code > a coding session with two or more live sessions open > 'Stack panes' or 'Place panes side by side' button in the pane header (labels found in the code)
- **Needs:** two live coding sessions
- **Steps:**
  1. Open two or more coding sessions.
  2. Check that they appear side by side in the pane area.
  3. Click the layout button and check that each session remains usable (type, scroll) in its own pane.

## S7.09 Stacked-session layout.

- **Expected:** Several live sessions can be stacked one above another in one window, each independently usable.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeRail.tsx:530; apps/web/features/code/CloudCodePage.tsx:1800; apps/web/features/code/CloudCodePage.tsx:1853; apps/web/features/code/CloudCodePage.tsx:2423; apps/web/features/code/CloudCodePage.tsx:2914; apps/web/features/code/hooks/use-code-panes.ts:86; apps/web/features/code/hooks/use-code-panes.ts:93; apps/web/features/code/hooks/use-code-panes.ts:105; apps/web/features/code/components/CodePanes.tsx:25; apps/web/features/code/hooks/use-code-panes.ts:128; apps/web/features/code/CloudCodePage.module.css:2639; apps/web/features/code/CloudCodePage.module.css:2652
- **Where to find it:** Code > two or more live sessions open > 'Stack panes' button in the pane header (labels found in the code)
- **Needs:** two live coding sessions
- **Steps:**
  1. Open two or more coding sessions so that the panes appear.
  2. Click 'Stack panes'.
  3. Check that the sessions are one above the other and each can still be used.

## S7.11 Resizable right inspector.

- **Expected:** The right-hand inspector pane can be resized by drag or keyboard, and the conversation reflows.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:690; apps/web/features/chat/components/research/ResearchPanel.tsx:340 (quoted code not found in the file now); apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:627 (quoted code not found in the file now)
- **Where to find it:** Chat > 'Artifacts' panel open > drag the left edge (separator 'Resize artifacts panel') (labels found in the code)
- **Needs:** an artifact to open the panel
- **Steps:**
  1. Open the artifacts panel beside a conversation.
  2. Drag the left edge of the panel, or click the edge and press the Left or Right arrow key.
  3. Check that the panel width changes and the conversation reflows.

## S7.12 Collapsible secondary navigation.

- **Expected:** Secondary navigation (conversation list, menus) can be collapsed out of the way and reopened.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7228; apps/web/features/chat/pages/WebChatPage.tsx:4789; apps/web/shared/stores/layout-store.ts:114
- **Where to find it:** Sidebar toggle button 'Collapse sidebar' (it reads 'Expand sidebar' when closed); keyboard Command+B on Mac or Ctrl+B elsewhere (labels found in the code)
- **Steps:**
  1. Sign in and look at the left sidebar.
  2. Click the 'Collapse sidebar' button, or press Command+B.
  3. Check that the sidebar folds away; click 'Expand sidebar' to bring it back and confirm it reopens.

## S7.14 Detachable desktop panels.

- **Expected:** A panel of the desktop app can be torn off into its own OS window and used there.
- **Code:** done. Evidence present: apps/desktop/electron/windowPolicy.ts:320; apps/desktop/electron/windowPolicy.ts:341; apps/web/features/desktop-host/lib/panel-windows.ts:56; apps/web/features/desktop-host/lib/panel-windows.ts:109; apps/web/features/desktop-host/components/PanelWindow.tsx:14; apps/web/features/desktop-host/components/PanelWindow.tsx:30; apps/web/features/desktop-host/hooks/use-detachable-panels.ts:31; apps/web/features/chat/pages/WebChatPage.tsx:1169; apps/web/features/chat/pages/WebChatPage.tsx:7855; apps/web/features/chat/pages/WebChatPage.tsx:7883; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1089; apps/web/features/chat/components/research/ResearchPanel.tsx:454; packages/ui/ui/src/primitives/DropdownMenu.tsx:130; apps/web/features/chat/components/research/ResearchReportView.tsx:708
- **Where to find it:** Research panel or Details (work) panel header > button 'Open <panel name> in a new window'; to return, 'Move <panel name> back to the main window' (labels found in the code)
- **Needs:** the desktop app and a research or task panel
- **Steps:**
  1. In the desktop app, open a research answer or a task panel.
  2. Click the button 'Open <panel name> in a new window' in the panel header.
  3. Check that the panel opens in its own window and can be used there; then click 'Move <panel name> back to the main window' to return it.

## S7.15 Full-screen editor.

- **Expected:** An editor (prompt, document or source) can take over the whole screen for focused editing and return to the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5901; apps/web/features/chat/components/Composer/ComposerInput.tsx:66; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4669
- **Where to find it:** Message box > 'Expand message input' button at its top-right corner; Escape returns it to normal size (labels found in the code)
- **Steps:**
  1. Type a long prompt into the message box.
  2. Click the 'Expand message input' button in the top-right corner of the box.
  3. Check that the box becomes taller for editing, then press Escape or click the button again to return to the chat.

## S7.16 Full-screen report reader.

- **Expected:** A long report (e.g. a research report) can be read in a full-screen reading view.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportView.tsx:376 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchReportView.tsx:699; apps/desktop/src/features/research/DeepResearchPage.tsx:181
- **Where to find it:** Research report > 'Read report full screen' button (title 'Full screen'); 'Exit full screen' returns (labels found in the code)
- **Needs:** a research report
- **Steps:**
  1. Open a research report from a deep research answer.
  2. Click 'Read report full screen'.
  3. Read the report in the full-screen view, then click 'Exit full screen' to return to the chat.

## S7.17 Full-screen media viewer.

- **Expected:** An image or video in the conversation can be opened in a full-screen viewer and dismissed back to the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3187; apps/web/features/chat/components/ImageLightbox.tsx:105; apps/web/features/chat/components/ImageLightbox.tsx:26
- **Where to find it:** Chat > an image in a message > click it to open the 'Image preview' viewer; 'Close preview' dismisses it (labels found in the code)
- **Needs:** a chat with an image attachment or image in a reply
- **Steps:**
  1. Send or open a message that contains an image.
  2. Click the image to open it.
  3. Use 'Zoom in' or 'Zoom out', then click 'Close preview' and check that you are back at the chat.

## S7.18 Floating companion window.

- **Expected:** A small always-on-top companion window can float over other apps or pages and be summoned without switching to the main app.
- **Code:** done. Evidence moved: apps/desktop/electron/quickAsk.ts:63; apps/desktop/electron/quickAsk.ts:76; apps/desktop/electron/main.ts:1123 (quoted code not found in the file now)
- **Where to find it:** Desktop app menu bar > 'Quick Ask' (or the Quick Ask shortcut) (labels found in the code)
- **Needs:** the desktop app
- **Steps:**
  1. Click 'Quick Ask' in the menu bar, or press the Quick Ask shortcut.
  2. Switch to another app and check the small Quick Ask window stays on top of it.
  3. Press the shortcut again to hide it.

## S7.19 Compact companion mode.

- **Expected:** A compact companion mode shows a reduced chat UI (no sidebar or side panels) sized for quick questions.
- **Code:** done. Evidence moved: apps/desktop/electron/quickAsk.ts:54 (quoted code not found in the file now); apps/desktop/electron/quickAsk.ts:6; apps/desktop/electron/quickAsk.ts:98 (quoted code not found in the file now)
- **Where to find it:** Desktop app menu bar > 'Quick Ask' opens the small companion panel (route /quick-ask) (labels found in the code)
- **Needs:** the desktop app
- **Steps:**
  1. Click 'Quick Ask' in the menu bar.
  2. Check that the small panel opens without the full sidebar or side panels.
  3. Ask a quick question and check the answer fits the small window.

## S7.20 Persistent bottom composer.

- **Expected:** The composer stays anchored at the bottom of the chat while the transcript scrolls above it.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5759 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4881; apps/web/features/chat/pages/WebChatPage.tsx:7716
- **Where to find it:** no screen of its own. Layout rule in apps/web/features/chat/pages/WebChatPage.tsx and apps/web/features/chat/components/Composer/ChatComposerNew.tsx.
- **Needs:** a long conversation
- **Steps:**
  1. Open a chat with many messages.
  2. Scroll the transcript up and down.
  3. Check that the message box stays at the bottom of the window while the messages scroll above it.

## S7.21 Composer expansion for long prompts.

- **Expected:** The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2461; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:665
- **Where to find it:** Message box > type a long prompt > 'Expand message input' button appears at the top-right corner (labels found in the code)
- **Steps:**
  1. Click the message box and type or paste a long prompt that wraps onto several lines.
  2. Check that the box grows taller as you type.
  3. Click 'Expand message input' to make it larger, then click it again to shrink it.

## S7.22 Scrollable transcript independent from side panels.

- **Expected:** The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7716; apps/web/features/chat/components/messages/ChatMessageList.tsx:2111; apps/web/features/chat/pages/WebChatPage.tsx:5831 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The 'Scroll to bottom' button appears when the transcript is scrolled up; it is not part of the layout rule itself.
- **Needs:** a long conversation; optionally an open side panel
- **Steps:**
  1. Open a long chat and scroll the transcript.
  2. Check that the side panel, the header and the message box do not move.
  3. Scroll a side panel (if open) and check that the transcript does not move.

## S7.23 Sticky artifact toolbar.

- **Expected:** The artifact toolbar (copy, download, view toggles, close) stays visible while the artifact content scrolls.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1194 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1787
- **Where to find it:** no screen of its own. No sticky class was found in the artifacts folder, so the toolbar pinning was not confirmed in the code.
- **Needs:** a long artifact
- **Steps:**
  1. Open a long artifact in the artifacts panel.
  2. Scroll the artifact content down.
  3. Check that the toolbar buttons ('Preview', 'Source', 'Version history') stay visible at the top.

## S7.24 Sticky table headers.

- **Expected:** Table headers stay pinned while a long table scrolls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:584
- **Where to find it:** no screen of its own. Sticky header class found in packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx.
- **Needs:** a long table in a chat answer
- **Steps:**
  1. Ask for an answer with a long table (many rows).
  2. Scroll the table or the transcript so the top of the table leaves the screen.
  3. Check that the table header row stays pinned at the top while the rows scroll.

## S7.25 Responsive panel stacking.

- **Expected:** On narrow windows, side panels stop sitting beside the conversation and stack over it (overlay or sheet), then return beside it when wide.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:460 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:652; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:617 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Overlay mode is set by the layout value in the code; the exact width threshold was not read.
- **Needs:** phone width or a narrow window
- **Steps:**
  1. Open the artifacts panel beside a conversation.
  2. Make the window narrow.
  3. Check that the panel moves over the conversation as an overlay and returns beside it when the window is wide again.

## S7.29 Minimum and maximum panel widths.

- **Expected:** Resizable or responsive panels enforce minimum and maximum widths so neither the panel nor the conversation collapses.
- **Code:** done. Evidence present: apps/desktop/electron/shellWindowStore.ts:44; apps/desktop/electron/main.ts:1098
- **Where to find it:** no screen of its own. Limits are MIN_SIDE_PANEL_WIDTH and MAX_SIDE_PANEL_WIDTH; the desktop window minimum is set in apps/desktop/electron/main.ts.
- **Steps:**
  1. Open the artifacts panel.
  2. Drag the 'Resize artifacts panel' handle as far left as it goes, then as far right as it goes.
  3. Check that the panel stops at a minimum and a maximum width and the conversation keeps a usable width.

## S7.30 Layout restoration between visits.

- **Expected:** Layout choices the user made (sidebar collapsed, panel widths, open panels) come back on the next visit.
- **Code:** done. Evidence present: apps/web/features/desktop-host/hooks/use-shell-layout.ts:28; apps/web/features/desktop-host/hooks/use-shell-layout.ts:49; apps/web/features/chat/pages/WebChatPage.tsx:7228
- **Where to find it:** no screen of its own. Stored in apps/web/shared/stores/layout-store.ts and apps/web/features/desktop-host/hooks/use-shell-layout.ts.
- **Steps:**
  1. Click 'Collapse sidebar' and resize the artifacts panel.
  2. Close the app or reload the page, then open it again.
  3. Check that the sidebar is still collapsed and the panel is still the width you set.

## S7.31 Window-size and monitor-change restoration.

- **Expected:** The desktop window reopens at its last size and position, and stays on screen when the monitor arrangement changes.
- **Code:** done. Evidence present: apps/desktop/electron/main.ts:1091; apps/desktop/electron/main.ts:967; apps/desktop/electron/main.ts:1010
- **Where to find it:** no screen of its own. Restore logic is in apps/desktop/electron/main.ts.
- **Needs:** the desktop app; a second monitor for the monitor part
- **Steps:**
  1. In the desktop app, resize and move the window.
  2. Quit the app and open it again.
  3. Check that the window opens at the same size and position; with a second monitor, unplug it and check the window is still on screen.

## S7.32 Print-specific layouts.

- **Expected:** Printing a conversation or report produces a print-specific layout: no app chrome, the whole content, paper-friendly colours and sensible page breaks.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:2110; apps/web/app/globals.css:1882
- **Where to find it:** Open a conversation that has messages > Conversation options (icon button in the chat header) > Print (labels found in the code)
- **Needs:** a conversation that has messages; a printer or Save as PDF in the print dialog
- **Steps:**
  1. Sign in and open a conversation that already has messages.
  2. Click the Conversation options button in the top header of the chat. It is an icon button with no visible text, so look for the button labelled Conversation options.
  3. Click Print in the menu.
  4. The system print dialog opens. In the preview, check that the sidebar, top bar, toolbar and message box are gone, and that the whole conversation is shown.
  5. Check that the page is white with dark text, and that long messages break across pages without splitting a sentence mid-line.
