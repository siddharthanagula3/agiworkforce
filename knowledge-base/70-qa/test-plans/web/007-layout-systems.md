---
id: "PLAN-web-007"
type: "test-plan"
title: "Web · 7. Layout systems"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "7"
---
# Web · 7. Layout systems

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S7.01 Centered new-chat layout.

- **Expected:** An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7637; apps/web/features/chat/pages/WebChatPage.tsx:5653 (quoted code not found in the file now); apps/web/app/chat/page.tsx:16
- **Earlier check in the running app:** PASS: E092 [PASS; New-chat layout and visible composer at tested mobile width]: 390×844 CSS viewport: chat composer fits, no horizontal document overflow (scrollWidth 390), hamburger opens drawer and Projects navigation closes it. Projects lists QA project with three conversations. Evidence mobile-chat.png and mobile-projects.png. Desktop browser emulation only.
- **Where to find it:** Sidebar or command palette > New chat, then look at the empty start screen (labels found in the code)
- **Steps:**
  1. Sign in and select New chat from the sidebar, or open the command palette and choose New chat.
  2. Look at the empty chat before typing anything.
  3. Check that the greeting and the composer sit in the middle of the area, with no empty transcript above them.
  4. Widen and narrow the window and check the start view stays centred.

## S7.02 Reading-width conversation layout.

- **Expected:** Message text is constrained to a readable column width that stays centred when the window is wide.
- **Code:** done. Evidence present: apps/web/app/globals.css:842; apps/web/features/chat/components/messages/MessageBubble.tsx:2595; apps/web/app/chat/page.tsx:16
- **Where to find it:** no screen of its own. Width rule is in apps/web/app/globals.css and apps/web/features/chat/components/messages/MessageBubble.tsx; the exact max width value was not read.
- **Needs:** a conversation with long messages
- **Steps:**
  1. Open a conversation that has long assistant replies.
  2. Make the window very wide.
  3. Check that the message text stays in a centred column of limited width rather than running edge to edge.

## S7.03 Full-width data-analysis layout.

- **Expected:** Data work (tables, charts, spreadsheets) can be viewed in a layout that uses the full window width instead of the reading column.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:91; packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:170; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:801
- **Where to find it:** not found in the code. Found the table components in packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx and MarkdownContent.tsx, but found no control that switches to a full-width data layout. Searched for full-width and data-view toggles in the chat folders.
- **Needs:** a conversation with a wide table

## S7.04 Conversation plus artifact split view.

- **Expected:** An artifact opens in its own pane beside the conversation so both are visible and usable at once.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5831 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:686; apps/web/features/chat/pages/WebChatPage.tsx:1226
- **Where to find it:** not found in the code. The artifact panel code exists (ArtifactsPanel.tsx), but the control that opens an artifact beside the conversation was not traced to a visible label.
- **Needs:** a conversation that produces an artifact

## S7.05 Conversation plus source-inspector split view.

- **Expected:** Sources behind an answer open in an inspector pane beside the conversation, so the reader can check a source without leaving the transcript.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7872; apps/web/features/chat/components/research/ResearchPanel.tsx:407; apps/web/features/chat/pages/WebChatPage.tsx:1224
- **Where to find it:** not found in the code. ResearchPanel.tsx has a Sources heading and empty state, but the control that opens the inspector beside the conversation was not found.
- **Needs:** a conversation with sources

## S7.07 Conversation plus code workspace.

- **Expected:** A coding session shows the conversation alongside the code workspace (changes, diffs, terminal or editor) in one view.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:2646; apps/web/features/code/CloudCodePage.tsx:2886; apps/web/features/chat/pages/WebChatPage.tsx:7140
- **Where to find it:** not found in the code. The code workspace panels (CodeChangesPanel and the draft terminal or side panel) exist in apps/web/features/code/CloudCodePage.tsx, but the entry path from the chat screen was not confirmed.
- **Needs:** a Free or paid account with a code session

## S7.08 Multi-session tiled layout.

- **Expected:** Two or more live sessions are visible side by side in one window, each independently usable.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeRail.tsx:530; apps/web/features/code/CloudCodePage.tsx:1800; apps/web/features/code/CloudCodePage.tsx:1853; apps/web/features/code/CloudCodePage.tsx:2423; apps/web/features/code/CloudCodePage.tsx:2914; apps/web/features/code/hooks/use-code-panes.ts:86; apps/web/features/code/hooks/use-code-panes.ts:93; apps/web/features/code/hooks/use-code-panes.ts:105; apps/web/features/code/components/CodePanes.tsx:25; apps/web/features/code/components/CodePanes.tsx:60
- **Where to find it:** Code session list: Cmd-click (Ctrl-click) a second session, then use the pane button Place panes side by side (labels found in the code)
- **Needs:** two code sessions
- **Steps:**
  1. Open the code page with at least two sessions in the session list.
  2. Click one session, then Cmd-click (or Ctrl-click) a second session to open it in a second pane.
  3. Click the button labelled Place panes side by side if the panes are stacked.
  4. Use each pane: type in one, then the other, and check both stay live and usable.

## S7.09 Stacked-session layout.

- **Expected:** Several live sessions can be stacked one above another in one window, each independently usable.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeRail.tsx:530; apps/web/features/code/CloudCodePage.tsx:1800; apps/web/features/code/CloudCodePage.tsx:1853; apps/web/features/code/CloudCodePage.tsx:2423; apps/web/features/code/CloudCodePage.tsx:2914; apps/web/features/code/hooks/use-code-panes.ts:86; apps/web/features/code/hooks/use-code-panes.ts:93; apps/web/features/code/hooks/use-code-panes.ts:105; apps/web/features/code/components/CodePanes.tsx:25; apps/web/features/code/hooks/use-code-panes.ts:128; apps/web/features/code/CloudCodePage.module.css:2639; apps/web/features/code/CloudCodePage.module.css:2652
- **Where to find it:** Code session list: Cmd-click (Ctrl-click) several sessions, then use the pane button Stack panes (labels found in the code)
- **Needs:** two or more code sessions
- **Steps:**
  1. Open the code page with at least two sessions in the session list.
  2. Cmd-click (or Ctrl-click) a second and a third session to open them as panes.
  3. Click the button labelled Stack panes to place them one above another.
  4. Check each stacked session is live and usable on its own.

## S7.11 Resizable right inspector.

- **Expected:** The right-hand inspector pane can be resized by drag or keyboard, and the conversation reflows.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:690; apps/web/features/chat/components/research/ResearchPanel.tsx:340 (quoted code not found in the file now); apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:627 (quoted code not found in the file now)
- **Where to find it:** Open the artifacts panel or the research panel, then drag its left edge labelled Resize artifacts panel or Resize research panel (labels found in the code)
- **Needs:** an artifact or research panel open
- **Steps:**
  1. Open an artifact or a research panel beside the conversation.
  2. Drag the thin handle on the panel edge labelled Resize artifacts panel (or Resize research panel).
  3. Release, then check the conversation column gets narrower or wider.
  4. Click the handle, press the Left or Right arrow key, and check the panel width changes.

## S7.12 Collapsible secondary navigation.

- **Expected:** Secondary navigation (conversation list, menus) can be collapsed out of the way and reopened.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7228; apps/web/features/chat/pages/WebChatPage.tsx:4789; apps/web/shared/stores/layout-store.ts:114
- **Where to find it:** Sidebar > Collapse sidebar (or Toggle sidebar); on narrow screens, Open navigation (labels found in the code)
- **Steps:**
  1. Sign in and look at the left sidebar.
  2. Use the control labelled Collapse sidebar to hide it.
  3. Check the conversation area widens and the sidebar is gone.
  4. Use the control labelled Toggle sidebar or Open navigation to bring it back.

## S7.15 Full-screen editor.

- **Expected:** An editor (prompt, document or source) can take over the whole screen for focused editing and return to the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5901; apps/web/features/chat/components/Composer/ComposerInput.tsx:66; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4669
- **Where to find it:** Chat composer > Expand message input (labels found in the code)
- **Steps:**
  1. Type a long prompt in the message box.
  2. Click the button labelled Expand message input.
  3. Check the editor gets taller so you can edit more text at once.
  4. Click the same button again (its label changes when expanded) and check the editor returns to its normal height.

## S7.16 Full-screen report reader.

- **Expected:** A long report (e.g. a research report) can be read in a full-screen reading view.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportView.tsx:376 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchReportView.tsx:699; apps/desktop/src/features/research/DeepResearchPage.tsx:181
- **Where to find it:** Research report > Full screen (exit with Exit full screen) (labels found in the code)
- **Needs:** a research report
- **Steps:**
  1. Open a research report in the chat.
  2. Click the button titled Full screen.
  3. Read the report in the full-screen view and check it fills the window.
  4. Click Exit full screen to return to the chat.

## S7.17 Full-screen media viewer.

- **Expected:** An image or video in the conversation can be opened in a full-screen viewer and dismissed back to the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3187; apps/web/features/chat/components/ImageLightbox.tsx:105; apps/web/features/chat/components/ImageLightbox.tsx:26
- **Where to find it:** Chat > click an image in a message to open it in the viewer; close it from the chat (labels found in the code)
- **Needs:** a conversation with an image
- **Steps:**
  1. Ask for an image, or open a conversation that already has one.
  2. Click the image in the message.
  3. Check the image opens in a full-screen viewer over the chat, with a Download image button.
  4. Close the viewer and check you are back at the same place in the chat.

## S7.20 Persistent bottom composer.

- **Expected:** The composer stays anchored at the bottom of the chat while the transcript scrolls above it.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5759 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4881; apps/web/features/chat/pages/WebChatPage.tsx:7716
- **Earlier check in the running app:** PASS: E092 [PASS; New-chat layout and visible composer at tested mobile width]: 390×844 CSS viewport: chat composer fits, no horizontal document overflow (scrollWidth 390), hamburger opens drawer and Projects navigation closes it. Projects lists QA project with three conversations. Evidence mobile-chat.png and mobile-projects.png. Desktop browser emulation only.
- **Where to find it:** no screen of its own. Layout is in apps/web/features/chat/pages/WebChatPage.tsx and ChatComposerNew.tsx.
- **Needs:** a long conversation
- **Steps:**
  1. Open a long conversation.
  2. Scroll the transcript up and down.
  3. Check the composer stays fixed at the bottom while the messages scroll above it.

## S7.21 Composer expansion for long prompts.

- **Expected:** The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2461; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:665
- **Where to find it:** Chat composer > type a long prompt > Expand message input (labels found in the code)
- **Steps:**
  1. Click the message box and type a long prompt over several lines.
  2. Check the box grows taller as you type, up to a maximum height.
  3. Click Expand message input to make the editor taller still.
  4. Check the text stays readable and the send button stays usable.

## S7.22 Scrollable transcript independent from side panels.

- **Expected:** The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7716; apps/web/features/chat/components/messages/ChatMessageList.tsx:2111; apps/web/features/chat/pages/WebChatPage.tsx:5831 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Scroll regions are set in apps/web/features/chat/pages/WebChatPage.tsx and apps/web/features/chat/components/messages/ChatMessageList.tsx.
- **Needs:** a long conversation and an open side panel
- **Steps:**
  1. Open a long conversation and open a side panel such as the artifacts panel.
  2. Scroll only the transcript and check the header, side panel and composer stay where they are.
  3. Scroll the side panel and check the transcript does not move.

## S7.23 Sticky artifact toolbar.

- **Expected:** The artifact toolbar (copy, download, view toggles, close) stays visible while the artifact content scrolls.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1194 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1787
- **Where to find it:** Open an artifact > the viewer toolbar with Close artifact viewer; scroll the artifact body (labels found in the code)
- **Needs:** an artifact
- **Steps:**
  1. Open an artifact so its viewer shows.
  2. Scroll the artifact content down.
  3. Check the toolbar (download, view and close controls) stays visible at the top.
  4. Click Close artifact viewer to close it.

## S7.24 Sticky table headers.

- **Expected:** Table headers stay pinned while a long table scrolls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:584
- **Where to find it:** no screen of its own. The sticky header class is in packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx.
- **Needs:** a conversation with a long table
- **Steps:**
  1. Open a message with a long table, such as a table in a report.
  2. Scroll the page or the table down.
  3. Check the table header row stays pinned at the top.

## S7.25 Responsive panel stacking.

- **Expected:** On narrow windows, side panels stop sitting beside the conversation and stack over it (overlay or sheet), then return beside it when wide.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:460 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:652; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:617 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The overlay switch is in ArtifactsPanel.tsx and WorkSessionPanel.tsx; the exact width breakpoint was not read.
- **Needs:** an open side panel and a window that can be resized
- **Steps:**
  1. Open the artifacts panel beside the conversation.
  2. Make the window narrow, about a phone width.
  3. Check the panel appears over the conversation as an overlay or sheet.
  4. Widen the window and check the panel returns beside the conversation.

## S7.26 Mobile bottom-sheet adaptation.

- **Expected:** On phone-sized screens, menus and pickers open as bottom sheets instead of desktop popovers.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1799; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1815; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:1069
- **Where to find it:** Composer footer model picker at phone width (a menu or picker opens as a bottom drawer) (path not confirmed in the code; trust the screen)
- **Needs:** phone width
- **Steps:**
  1. Open the app on a phone-sized window or a phone.
  2. Tap the model picker in the chat composer footer.
  3. Check it opens as a bottom sheet that slides up, not a small desktop popover.
  4. Close it by swiping down or tapping outside, and check it returns to the chat.

## S7.27 Tablet two-column adaptation.

- **Expected:** On tablet widths the app shows two columns (navigation plus content) instead of the phone single column.
- **Code:** done. Evidence present: apps/web/shared/components/layout/app-shell-layout.ts:32; apps/web/features/chat/pages/WebChatPage.tsx:7224
- **Where to find it:** no screen of its own. Breakpoint is in apps/web/shared/components/layout/app-shell-layout.ts and apps/web/features/chat/pages/WebChatPage.tsx.
- **Needs:** a tablet-width window or an iPad
- **Steps:**
  1. Open the app in a window about tablet width (around 768 to 1024 px).
  2. Check navigation and content show as two columns side by side.
  3. Compare with a phone-width window, which shows a single column.

## S7.28 Safe-area and virtual-keyboard accommodation.

- **Expected:** Content and the composer stay clear of notches/home indicators, and the layout adjusts when the on-screen keyboard opens.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4881; apps/web/app/globals.css:1362; apps/web/app/layout.tsx:57
- **Where to find it:** no screen of its own. Safe-area rules are in apps/web/features/chat/components/Composer/ChatComposerNew.tsx, apps/web/app/globals.css and apps/web/app/layout.tsx.
- **Needs:** a phone with a notch or home indicator
- **Steps:**
  1. On a phone, open a chat and check the composer is not under the home indicator.
  2. Tap the message box so the on-screen keyboard opens.
  3. Check the composer moves up above the keyboard and the transcript stays usable.

## S7.29 Minimum and maximum panel widths.

- **Expected:** Resizable or responsive panels enforce minimum and maximum widths so neither the panel nor the conversation collapses.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/stores/uiStore.ts:6; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:473 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:686
- **Where to find it:** no screen of its own. The limits are 280 and 900 in packages/ui/unified-chat/src/stores/uiStore.ts.
- **Needs:** an open side panel
- **Steps:**
  1. Open the artifacts panel or research panel.
  2. Drag its edge as far left as it goes, then check the panel stops at its minimum width.
  3. Drag it as far right as it goes, then check the panel stops at its maximum width and the conversation keeps some width.

## S7.30 Layout restoration between visits.

- **Expected:** Layout choices the user made (sidebar collapsed, panel widths, open panels) come back on the next visit.
- **Code:** done. Evidence moved: apps/web/shared/stores/layout-store.ts:114; packages/ui/unified-chat/src/stores/uiStore.ts:81; apps/web/features/chat/pages/WebChatPage.tsx:7228; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:468 (quoted code not found in the file now); apps/web/app/chat/page.tsx:16
- **Where to find it:** no screen of its own. Only the sidebar state is persisted under the agi-ui-store key in packages/ui/unified-chat/src/stores/uiStore.ts; panel widths and open panels were not confirmed as persisted.
- **Steps:**
  1. Collapse the sidebar using Collapse sidebar.
  2. Resize a side panel and open another one.
  3. Reload the page or close and reopen the browser tab.
  4. Check the sidebar is still collapsed and the panel width and open panels are as you left them.

## S7.32 Print-specific layouts.

- **Expected:** Printing a conversation or report produces a print-specific layout: no app chrome, the whole content, paper-friendly colours and sensible page breaks.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:2110; apps/web/app/globals.css:1882
- **Where to find it:** Conversation title menu > Print (labels found in the code)
- **Needs:** a conversation with messages
- **Steps:**
  1. Open a conversation with a few messages.
  2. Open the conversation's title menu and choose Print.
  3. In the print preview, check there is no sidebar or header, the whole transcript is included, and the colours suit paper.
  4. Check the page breaks fall between messages.
