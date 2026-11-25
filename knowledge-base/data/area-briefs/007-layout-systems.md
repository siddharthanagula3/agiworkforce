# Area 7. Layout systems

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S7.01 Centered new-chat layout.
- Should: An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5650; apps/web/features/chat/pages/WebChatPage.tsx:5653; apps/web/app/chat/page.tsx:13; apps/mobile/app/(app)/(tabs)/chat.tsx:817; apps/mobile/src/features/chat/components/ChatEmptyState.tsx:55; apps/mobile/app/(app)/chat/[id].tsx:1285; apps/cli/src/tui/tui_app.rs:1982; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1643

## S7.02 Reading-width conversation layout.
- Should: Message text is constrained to a readable column width that stays centred when the window is wide.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/app/globals.css:888; apps/web/features/chat/components/messages/MessageBubble.tsx:1795; apps/web/app/chat/page.tsx:13; apps/mobile/src/shared/layout/contentColumn.ts:3; apps/mobile/src/features/chat/components/MessageList.tsx:90; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:520; apps/extension/src/side_panel.ts:5254; apps/extension/src/side_panel.ts:5218

## S7.03 Full-width data-analysis layout.
- Should: Data work (tables, charts, spreadsheets) can be viewed in a layout that uses the full window width instead of the reading column.
- Status: web done, desktop done, chrome unverified
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:101; packages/ui/unified-chat/src/components/markdown/MarkdownTable.tsx:180; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:459

## S7.04 Conversation plus artifact split view.
- Should: An artifact opens in its own pane beside the conversation so both are visible and usable at once.
- Status: web done, desktop done, vscode done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5831; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:461; apps/web/features/chat/pages/WebChatPage.tsx:959; apps/extension-vscode/src/features/artifacts/artifactActions.ts:100; apps/extension-vscode/src/core/commandSetup.ts:2292

## S7.05 Conversation plus source-inspector split view.
- Should: Sources behind an answer open in an inspector pane beside the conversation, so the reader can check a source without leaving the transcript.
- Status: web done, desktop done, cli missing, vscode missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5831; apps/web/features/chat/components/research/ResearchPanel.tsx:346; apps/web/features/chat/pages/WebChatPage.tsx:957

## S7.06 Conversation plus browser split view.
- Should: A live web page is shown beside the conversation, so the user can watch or use the page while chatting about it.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome done
- Code: apps/extension/manifest.json:78; apps/extension/src/side_panel.ts:5400; apps/extension/src/background.ts:1302

## S7.07 Conversation plus code workspace.
- Should: A coding session shows the conversation alongside the code workspace (changes, diffs, terminal or editor) in one view.
- Status: web done, desktop done, cli done, vscode done
- Code: apps/web/features/code/CloudCodePage.tsx:1108; apps/web/features/code/CloudCodePage.tsx:1223; apps/web/features/chat/pages/WebChatPage.tsx:5275; apps/cli/src/tui/tui_app.rs:1808; apps/cli/src/tui/tui_app.rs:4386; apps/cli/src/tui/tui_app.rs:6773; apps/extension-vscode/src/core/chatSetup.ts:60; apps/extension-vscode/src/core/commandSetup.ts:950

## S7.08 Multi-session tiled layout.
- Should: Two or more live sessions are visible side by side in one window, each independently usable.
- Status: web done, desktop done, vscode done
- Code: apps/web/features/code/components/CodeRail.tsx:310; apps/web/features/code/CloudCodePage.tsx:872; apps/web/features/code/CloudCodePage.tsx:889; apps/web/features/code/CloudCodePage.tsx:1046; apps/web/features/code/CloudCodePage.tsx:1347; apps/web/features/code/hooks/use-code-panes.ts:86; apps/web/features/code/hooks/use-code-panes.ts:93; apps/web/features/code/hooks/use-code-panes.ts:105

## S7.09 Stacked-session layout.
- Should: Several live sessions can be stacked one above another in one window, each independently usable.
- Status: web done, desktop done, vscode done
- Code: apps/web/features/code/components/CodeRail.tsx:310; apps/web/features/code/CloudCodePage.tsx:872; apps/web/features/code/CloudCodePage.tsx:889; apps/web/features/code/CloudCodePage.tsx:1046; apps/web/features/code/CloudCodePage.tsx:1347; apps/web/features/code/hooks/use-code-panes.ts:86; apps/web/features/code/hooks/use-code-panes.ts:93; apps/web/features/code/hooks/use-code-panes.ts:105

## S7.10 Resizable left sidebar.
- Should: The user can drag (or keyboard-adjust) the width of the left navigation sidebar.
- Status: web missing, desktop missing, mobile missing

## S7.11 Resizable right inspector.
- Should: The right-hand inspector pane can be resized by drag or keyboard, and the conversation reflows.
- Status: web done, desktop done
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:426; apps/web/features/chat/components/research/ResearchPanel.tsx:340; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:627

## S7.12 Collapsible secondary navigation.
- Should: Secondary navigation (conversation list, menus) can be collapsed out of the way and reopened.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5351; apps/web/features/chat/pages/WebChatPage.tsx:3686; apps/web/shared/stores/layout-store.ts:128; apps/mobile/app/(app)/chat/[id].tsx:1307; apps/mobile/app/(app)/chat/[id].tsx:924; apps/mobile/src/features/shell/drawerGestures.ts:39; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2196; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2242

## S7.13 Dockable panels.
- Should: Panels can be moved to a different edge or region of the window (docked) and stay there.
- Status: web missing, desktop missing, vscode done
- Code: apps/extension-vscode/src/core/chatSetup.ts:60; apps/extension-vscode/package.json:786; apps/extension-vscode/src/core/commandSetup.ts:950

## S7.14 Detachable desktop panels.
- Should: A panel of the desktop app can be torn off into its own OS window and used there.
- Status: desktop done, vscode done
- Code: apps/desktop/electron/windowPolicy.ts:187; apps/desktop/electron/windowPolicy.ts:208; apps/web/features/desktop-host/lib/panel-windows.ts:56; apps/web/features/desktop-host/lib/panel-windows.ts:109; apps/web/features/desktop-host/components/PanelWindow.tsx:14; apps/web/features/desktop-host/components/PanelWindow.tsx:30; apps/web/features/desktop-host/hooks/use-detachable-panels.ts:31; apps/web/features/chat/pages/WebChatPage.tsx:1021

## S7.15 Full-screen editor.
- Should: An editor (prompt, document or source) can take over the whole screen for focused editing and return to the chat.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4477; apps/web/features/chat/components/Composer/ComposerInput.tsx:73; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3652; apps/mobile/src/features/chat/components/ChatInput.tsx:969; apps/mobile/src/features/chat/components/ChatInput.tsx:1251; apps/mobile/src/features/chat/components/ChatInput.tsx:1258; apps/cli/src/tui/tui_app.rs:4839; apps/cli/src/tui/composer_edits.rs:140

## S7.16 Full-screen report reader.
- Should: A long report (e.g. a research report) can be read in a full-screen reading view.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:376; apps/web/features/chat/components/research/ResearchReportView.tsx:798; apps/desktop/src/features/research/DeepResearchPage.tsx:178; apps/mobile/src/features/research/ReportsScreen.tsx:290; apps/mobile/src/features/research/ReportsScreen.tsx:123; apps/mobile/src/features/drawer/components/DrawerContent.tsx:346; apps/mobile/src/features/research/ReportsScreen.tsx:125

## S7.17 Full-screen media viewer.
- Should: An image or video in the conversation can be opened in a full-screen viewer and dismissed back to the chat.
- Status: web done, desktop done, mobile done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2311; apps/web/features/chat/components/ImageLightbox.tsx:101; apps/web/features/chat/components/ImageLightbox.tsx:25; apps/mobile/src/features/chat/components/MessageBubble.tsx:1214; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:144; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:29; apps/extension/src/features/side-panel/mediaViewer.ts:7; apps/extension/src/features/side-panel/mediaViewer.ts:51

## S7.18 Floating companion window.
- Should: A small always-on-top companion window can float over other apps or pages and be summoned without switching to the main app.
- Status: desktop done, chrome done
- Code: apps/desktop/electron/quickAsk.ts:16; apps/desktop/electron/quickAsk.ts:35; apps/desktop/electron/main.ts:1123; apps/extension/src/inPagePanel/setup.ts:64; apps/extension/src/features/content/in-page-panel/panel.ts:4; apps/extension/src/inPagePanel/setup.ts:53

## S7.19 Compact companion mode.
- Should: A compact companion mode shows a reduced chat UI (no sidebar or side panels) sized for quick questions.
- Status: desktop done, chrome done
- Code: apps/desktop/electron/quickAsk.ts:54; apps/desktop/electron/quickAsk.ts:6; apps/desktop/electron/quickAsk.ts:98; apps/extension/src/features/content/in-page-panel/panel.ts:4; apps/extension/src/inPagePanel/setup.ts:60

## S7.20 Persistent bottom composer.
- Should: The composer stays anchored at the bottom of the chat while the transcript scrolls above it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5759; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3645; apps/web/features/chat/pages/WebChatPage.tsx:5708; apps/mobile/app/(app)/chat/[id].tsx:1502; apps/mobile/app/(app)/chat/[id].tsx:1434; apps/mobile/app/(app)/chat/[id].tsx:1285; apps/cli/src/tui/tui_app.rs:1173; apps/cli/src/tui/tui_app.rs:1182

## S7.21 Composer expansion for long prompts.
- Should: The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2019; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:552; apps/mobile/src/features/chat/components/ChatInput.tsx:969; apps/mobile/src/features/chat/components/ChatInput.tsx:1059; apps/cli/src/tui/tui_app.rs:1164; apps/cli/src/tui/tui_app.rs:1174; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3544; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2492

## S7.22 Scrollable transcript independent from side panels.
- Should: The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5708; apps/web/features/chat/components/messages/ChatMessageList.tsx:1913; apps/web/features/chat/pages/WebChatPage.tsx:5831; apps/mobile/src/features/chat/components/MessageList.tsx:68; apps/cli/src/tui/tui_app.rs:1621; apps/cli/src/tui/tui_app.rs:1173; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:465; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3544

## S7.23 Sticky artifact toolbar.
- Should: The artifact toolbar (copy, download, view toggles, close) stays visible while the artifact content scrolls.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1194; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:938; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:340; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:690; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:127

## S7.24 Sticky table headers.
- Should: Table headers stay pinned while a long table scrolls.
- Status: web done, desktop done, mobile missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:435

## S7.25 Responsive panel stacking.
- Should: On narrow windows, side panels stop sitting beside the conversation and stack over it (overlay or sheet), then return beside it when wide.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:460; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:403; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:617; apps/mobile/app/(app)/_layout.tsx:25; apps/mobile/src/features/shell/drawerGestures.ts:36; apps/mobile/src/shared/hooks/useResponsiveLayout.ts:23

## S7.26 Mobile bottom-sheet adaptation.
- Should: On phone-sized screens, menus and pickers open as bottom sheets instead of desktop popovers.
- Status: web done, mobile done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1546; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1560; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:617; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:3; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:3; apps/mobile/app/(app)/chat/[id].tsx:597

## S7.27 Tablet two-column adaptation.
- Should: On tablet widths the app shows two columns (navigation plus content) instead of the phone single column.
- Status: web done, mobile done
- Code: apps/web/shared/components/layout/app-shell-layout.ts:32; apps/web/features/chat/pages/WebChatPage.tsx:5347; apps/mobile/app/(app)/_layout.tsx:15; apps/mobile/src/features/shell/drawerGestures.ts:36

## S7.28 Safe-area and virtual-keyboard accommodation.
- Should: Content and the composer stay clear of notches/home indicators, and the layout adjusts when the on-screen keyboard opens.
- Status: web done, mobile done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3645; apps/web/app/globals.css:1416; apps/web/app/layout.tsx:50; apps/mobile/app/(app)/chat/[id].tsx:1277; apps/mobile/app/(app)/chat/[id].tsx:1286; apps/mobile/app/(app)/chat/[id].tsx:884

## S7.29 Minimum and maximum panel widths.
- Should: Resizable or responsive panels enforce minimum and maximum widths so neither the panel nor the conversation collapses.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: packages/ui/unified-chat/src/stores/uiStore.ts:6; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:473; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:461; apps/desktop/electron/shellWindowStore.ts:44; apps/desktop/electron/main.ts:889; apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3; apps/mobile/src/shared/hooks/useResponsiveLayout.ts:26; apps/mobile/app/(app)/_layout.tsx:27

## S7.30 Layout restoration between visits.
- Should: Layout choices the user made (sidebar collapsed, panel widths, open panels) come back on the next visit.
- Status: web done, desktop done, vscode done
- Code: apps/web/shared/stores/layout-store.ts:127; packages/ui/unified-chat/src/stores/uiStore.ts:77; apps/web/features/chat/pages/WebChatPage.tsx:5351; apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:468; apps/web/app/chat/page.tsx:13; apps/web/features/desktop-host/hooks/use-shell-layout.ts:25; apps/web/features/desktop-host/hooks/use-shell-layout.ts:49; apps/extension-vscode/src/providers/chatEditorPanel.ts:78

## S7.31 Window-size and monitor-change restoration.
- Should: The desktop window reopens at its last size and position, and stays on screen when the monitor arrangement changes.
- Status: desktop done
- Code: apps/desktop/electron/main.ts:881; apps/desktop/electron/main.ts:748; apps/desktop/electron/main.ts:790

## S7.32 Print-specific layouts.
- Should: Printing a conversation or report produces a print-specific layout: no app chrome, the whole content, paper-friendly colours and sensible page breaks.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1954; apps/web/app/globals.css:1886; apps/mobile/services/fileCreation.ts:523; apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:51; apps/mobile/services/exportMarkdownHtml.ts:46
