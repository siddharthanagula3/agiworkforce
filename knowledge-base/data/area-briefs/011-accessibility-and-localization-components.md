# Area 11. Accessibility and localization components

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S11.01 Accessible control labels.
- Should: Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does.
- Status: web unverified, desktop unverified, mobile done, vscode done, chrome unverified
- Code: apps/mobile/app/(app)/notifications/index.tsx:93; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:165; apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts:90; apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts:94; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4653; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:44

## S11.02 Semantic heading hierarchy.
- Should: Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:106; packages/ui/unified-chat/src/components/ConversationHeader.tsx:75; apps/mobile/src/features/settings/common.tsx:46; apps/mobile/src/features/settings/capabilities/index.tsx:264; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2591; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5166; apps/extension/src/features/side-panel/schedulesSection.ts:283; apps/extension/src/side_panel.ts:10919

## S11.03 Keyboard navigation.
- Should: Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/useMenuKeyboard.ts:17; packages/ui/ui/src/sidebar/Menu.tsx:113; apps/web/shared/components/CommandPalette/CommandPaletteProvider.tsx:16; apps/cli/src/tui/tui_app.rs:2449; apps/cli/src/keybindings.rs:39; apps/cli/src/tui/tui_app.rs:2451; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4092; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4033

## S11.04 Visible focus indicators.
- Should: The focused control always shows a clearly visible focus indicator when navigating by keyboard.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:1277; apps/web/app/globals.css:1278; apps/web/app/layout.tsx:5; apps/cli/src/tui/widgets/command_popup.rs:157; apps/cli/src/tui/widgets/command_popup.rs:201; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:458; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:97; apps/extension/src/side_panel.ts:1056

## S11.05 Focus management across dialogs.
- Should: Opening a dialog moves focus into it, Tab stays inside it, and Escape closes it.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/useDialogKeyboard.ts:29; apps/web/app/gallery/GalleryClient.tsx:565; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:172; apps/mobile/__tests__/modal-accessibility-semantics.test.ts:9; apps/mobile/src/features/companion/components/CompanionDemoWalkthrough.tsx:171; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2690; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2792; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2268

## S11.06 Focus restoration after panel closure.
- Should: Closing a dialog, menu or panel returns focus to the control that opened it.
- Status: web done, desktop done, mobile unverified, vscode done, chrome done
- Code: packages/ui/ui/src/primitives/useDialogKeyboard.ts:60; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4102; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4033; apps/extension/src/side_panel.ts:5767; apps/extension/__tests__/side-panel-a11y.test.ts:101; apps/extension/src/side_panel.ts:9046

## S11.07 Screen-reader announcements for completed events.
- Should: When something finishes (a reply, a tool step, a save, a connection), a screen reader hears a short announcement without moving focus.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1891; apps/web/features/chat/components/messages/ChatMessageList.tsx:1029; apps/web/app/AppRuntimeMounts.tsx:21; apps/mobile/src/features/chat/components/MessageList.tsx:93; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2327; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2366; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2590; apps/extension/src/side_panel.ts:8680

## S11.08 Non-spammy streaming announcements.
- Should: A streaming reply is announced calmly (in word-bounded chunks or once when done), never token by token and never twice.
- Status: web done, desktop done, mobile missing, vscode unverified, chrome unverified
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:1071; packages/ui/unified-chat/src/components/markdown/StreamAnnouncer.tsx:83; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2366; apps/extension/src/side_panel.ts:8680

## S11.09 Accessible tool and approval status.
- Should: Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:942; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:943; apps/web/features/chat/components/messages/ChatMessageList.tsx:1037; packages/ui/unified-chat/src/components/ToolCallCard.tsx:473; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:165; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:296; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4641; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4676

## S11.10 Touch equivalents for hover interactions.
- Should: Anything revealed on hover is also reachable by touch (always visible on touch screens or shown on tap).
- Status: web done, desktop done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2933; packages/ui/unified-chat/src/components/MessageBubble.tsx:618; apps/extension/src/side_panel.ts:1433; apps/extension/src/side_panel.ts:1434; apps/extension/src/side_panel.ts:4298

## S11.11 Alternatives to drag-only operations.
- Should: Every drag operation (drop files, resize, reorder) has a non-drag alternative such as a button, menu or arrow keys.
- Status: web done, desktop done, vscode done
- Code: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3651; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:207; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4982; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5491

## S11.12 Text resizing.
- Should: Text scales with the user's text-size setting (browser, OS or app) up to at least 200% without being cut off.
- Status: web done, desktop done, mobile done, chrome unverified
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1186; apps/web/shared/components/AppearancePreferences.tsx:8; apps/mobile/src/features/settings/index.tsx:191; apps/mobile/src/features/chat/ChatsListScreen.tsx:476

## S11.13 Browser-zoom reflow.
- Should: At high browser zoom (400%) the layout reflows to one column with no horizontal scrolling.
- Status: web done, desktop done, chrome unverified
- Code: apps/web/shared/components/layout/app-shell-layout.ts:24; apps/web/shared/components/layout/WebAppShell.tsx:190; apps/web/shared/components/layout/WebAppShell.tsx:691

## S11.14 Reduced motion.
- Should: With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/globals.css:1935; apps/web/shared/components/AppearancePreferences.tsx:45; apps/web/features/settings/sections/GeneralSection.tsx:1091; apps/mobile/src/ui/theme/useReduceMotion.ts:22; apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx:19; apps/mobile/src/ui/theme/__tests__/accessibilityPreferenceCoverage.test.ts:78; apps/cli/src/lib.rs:4887; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2055

## S11.15 Captions.
- Should: Spoken audio (voice conversations) can be shown as live captions.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146; apps/web/features/chat/components/Voice/VoiceCaptions.tsx:26; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:76; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:169; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:85; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S11.16 Transcripts.
- Should: A voice conversation leaves a readable text transcript kept with the chat.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:4978; apps/web/features/chat/pages/WebChatPage.tsx:5002; apps/web/features/chat/pages/WebChatPage.tsx:5009; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:169; apps/mobile/stores/chat/chatMessageStore.ts:680; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S11.17 Chart descriptions.
- Should: A chart comes with a text description (title, what is plotted, key values) that assistive tech can read.
- Status: web done, desktop done
- Code: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:169; packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts:130; packages/ui/unified-chat/src/components/artifact-components/__tests__/ChartArtifact.test.tsx:35

## S11.18 Data-table alternatives for charts.
- Should: A chart can be viewed as a data table (or its data read in order) as an alternative to the graphic.
- Status: web missing, desktop missing

## S11.19 Right-to-left layouts.
- Should: In a right-to-left language the whole layout mirrors correctly (direction set and spacing uses logical start/end).
- Status: web done, desktop done, mobile done, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:290; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:345; packages/ui/ui/src/primitives/DropdownMenu.tsx:143; packages/ui/ui/src/primitives/SearchInput.tsx:25; apps/mobile/src/i18n/index.ts:21; apps/mobile/src/i18n/index.ts:51; apps/mobile/app/_layout.tsx:261; apps/mobile/src/features/settings/general/index.tsx:26

## S11.20 Mixed-direction text handling.
- Should: Messages mixing left-to-right and right-to-left text render each paragraph in its own direction (e.g. dir="auto").
- Status: web done, desktop done, mobile unverified, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerInput.tsx:134; apps/web/features/chat/components/messages/MessageBubble.tsx:2026; apps/web/app/i18n/index.ts:78

## S11.21 Input-method composition support.
- Should: Typing with an input method (Japanese, Chinese, Korean) never sends the message when Enter confirms a composition.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3471; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3520; packages/ui/unified-chat/src/composer-editor/ime-composition.ts:10; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4290; apps/mobile/src/features/chat/components/ChatInput.tsx:1068; apps/mobile/src/features/chat/components/ChatInput.tsx:1067; apps/mobile/src/features/chat/components/ChatInput.tsx:1211; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4403

## S11.22 Locale-aware dates and numbers.
- Should: Dates, times and numbers are formatted for the user's locale rather than a fixed US format.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: apps/web/features/settings/components/LinkedDevicesPanel.tsx:67; apps/web/features/chat/components/Composer/ComposerFooter.tsx:388; apps/web/features/settings/components/Settings/PasskeysPanel.tsx:13; apps/mobile/src/features/settings/cloud-usage/index.tsx:144; apps/mobile/src/features/settings/plans/index.tsx:26; apps/extension-vscode/src/features/account-auth/accountPresentation.ts:10; apps/extension-vscode/src/features/artifacts/artifactPresentation.ts:83; apps/extension-vscode/src/core/commandSetup.ts:398

## S11.23 Currency formatting.
- Should: Prices and money amounts show the right currency symbol and the user's number format.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/contracts/types/src/money-format.ts:23; packages/contracts/types/src/money-format.ts:1; apps/web/app/billing/invoices/InvoiceList.tsx:25; apps/web/features/billing/components/BillingPaymentHistory.tsx:142; apps/web/app/pricing/page.tsx:137; apps/web/app/pricing/page.tsx:385; apps/desktop/src/features/pricing/DesktopUpgradeConfirmDialog.tsx:139; apps/desktop/src/features/pricing/PlanCard.tsx:68

## S11.24 Pluralization.
- Should: Counted phrases follow each language's plural rules rather than an English "s" suffix.
- Status: web done, desktop done, mobile done, vscode done, chrome done
- Code: packages/ui/unified-chat/src/lib/compactToolSummary.ts:33; apps/web/features/chat/components/messages/ToolTimeline.tsx:367; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2862; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:267; apps/web/features/schedules/components/ScheduleCard.tsx:112; apps/web/features/settings/sections/PrivacySection.tsx:343; apps/web/features/projects/components/ProjectSettingsDialog.tsx:130; packages/ui/i18n/locales/ar/chat.json:599

## S11.25 Translated error messages.
- Should: Error messages appear in the user's chosen language.
- Status: web done, desktop done, mobile missing, cli missing, vscode done, chrome done
- Code: packages/ui/ui/src/lib/network-error.ts:11; apps/web/features/chat/lib/turn-error-notice.ts:172; apps/desktop/src/constants/errorMessages.ts:47; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:359; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:64; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2673; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2773; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3646

## S11.26 Platform-specific shortcut notation.
- Should: Shortcut hints use the platform's notation (⌘ on Apple, Ctrl elsewhere).
- Status: web done, desktop done, vscode done
- Code: packages/ui/ui/src/platformKeys.ts:31; apps/web/shared/components/layout/AccountMenuItems.tsx:99; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3561

## S11.27 Long-label and translated-copy layouts.
- Should: Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.
- Status: web unverified, desktop unverified, mobile unverified, cli done, vscode unverified, chrome done
- Code: apps/cli/src/tui/tui_app.rs:2044; apps/cli/src/tui/tui_app.rs:2029; apps/extension/src/side_panel.ts:5941; apps/extension/src/side_panel.ts:1232

## S11.28 Accessible terminal output mode.
- Should: The CLI offers a plain output mode for screen readers (no colour, spinners or redraws) and honours NO_COLOR everywhere.
- Status: cli done
- Code: apps/cli/src/lib.rs:4887; apps/cli/src/output.rs:43
