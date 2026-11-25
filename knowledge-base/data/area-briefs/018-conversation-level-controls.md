# Area 18. Conversation-level controls

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S18.01 Automatic title.
- Should: A new conversation gets a meaningful title automatically without the user naming it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:165; apps/web/features/chat/pages/WebChatPage.tsx:3876; apps/mobile/app/(app)/(tabs)/chat.tsx:411; apps/mobile/src/features/chat/ChatsListScreen.tsx:86; apps/cli/src/sessions.rs:463; apps/cli/src/tui/tui_app.rs:3550; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2532; apps/extension-vscode/src/core/commandSetup.ts:1243

## S18.02 Manual rename.
- Should: The user can rename a conversation and the new title persists.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:142; packages/ui/ui/src/sidebar/SessionItem.tsx:322; apps/web/shared/components/layout/WebAppShell.tsx:307; apps/mobile/src/features/conversation-actions/useConversationActions.ts:116; apps/mobile/app/(app)/chat/[id].tsx:1195; apps/cli/src/tui/tui_app.rs:3574

## S18.03 Pin and unpin.
- Should: A conversation can be pinned so it stays at the top of the list, and unpinned.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/chat/conversations/[id]/route.ts:381; apps/web/app/api/chat/conversations/bulk/route.ts:73; apps/mobile/src/features/conversation-actions/useConversationActions.ts:124; apps/mobile/stores/chat/chatMessageStore.ts:530; apps/mobile/src/features/chat/ChatsListScreen.tsx:94

## S18.04 Archive and restore.
- Should: A conversation can be archived (hidden, kept) and later restored.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:352; apps/web/shared/components/layout/WebAppShell.tsx:322; apps/web/features/chat/components/ConversationTitleMenu.tsx:194; apps/mobile/services/cloudSyncEngine.ts:105; apps/cli/src/lib.rs:1255; apps/cli/src/lib.rs:2847; apps/extension-vscode/src/features/trees/sessionPickers.ts:126; apps/extension-vscode/src/features/trees/sessionPickers.ts:161

## S18.05 Delete.
- Should: A conversation can be deleted, with confirmation, and it disappears everywhere.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/chat/conversations/[id]/route.ts:468; apps/web/app/api/chat/conversations/[id]/restore/route.ts:26; apps/web/app/api/chat/conversations/bulk/route.ts:62; apps/mobile/src/features/conversation-actions/useConversationActions.ts:160; apps/cli/src/lib.rs:1259; apps/cli/src/lib.rs:2868; apps/extension-vscode/src/core/commandSetup.ts:1184; apps/extension-vscode/src/core/commandSetup.ts:1198

## S18.06 Duplicate.
- Should: A conversation can be duplicated into a new, independent conversation.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:184; apps/web/features/chat/pages/WebChatPage.tsx:5475; apps/cli/src/tui/tui_app.rs:3562; apps/extension-vscode/src/core/commandSetup.ts:1210; apps/extension-vscode/src/core/commandSetup.ts:1219

## S18.07 Move to Project.
- Should: An existing conversation can be moved into a Project.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/ui/src/sidebar/SessionItem.tsx:386; apps/web/shared/components/layout/WebAppShell.tsx:337; apps/web/features/chat/components/ConversationTitleMenu.tsx:146; apps/mobile/src/features/conversation-actions/useConversationActions.ts:263

## S18.08 Copy into Project.
- Should: A conversation can be copied into a Project while the original stays where it is.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S18.09 Change conversation mode.
- Should: Within a conversation, the user can switch its working mode (e.g. chat vs agent/work/plan) and later turns follow it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4570; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2237; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:921; apps/mobile/app/(app)/chat/[id].tsx:1879; apps/cli/src/tui/tui_app.rs:3314; apps/cli/src/tui/tui_app.rs:3173; apps/extension-vscode/src/core/commandSetup.ts:1684; apps/extension-vscode/src/core/commandSetup.ts:1965

## S18.10 Change privacy mode through an explicit flow.
- Should: The user switches a conversation's privacy mode (e.g. temporary/incognito, local-only) through an explicit flow that explains the consequence.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:356; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1413; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:21; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:8; apps/cli/src/claude_parity.rs:147; apps/cli/src/tui/tui_app.rs:4142; apps/extension/src/side_panel.ts:13382; apps/extension/src/side_panel.ts:6745

## S18.11 Conversation search.
- Should: The user can search within the open conversation's messages.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageSearch.tsx:88; apps/web/features/chat/components/messages/ChatMessageList.tsx:1358; apps/web/features/chat/components/messages/ChatMessageList.tsx:1894

## S18.12 Jump between search matches.
- Should: In-conversation search moves between matches (next/previous) and scrolls to each.
- Status: web done, desktop done
- Code: apps/web/features/chat/components/messages/MessageSearch.tsx:111; apps/web/features/chat/components/messages/ChatMessageList.tsx:1335

## S18.13 Conversation outline.
- Should: A long conversation offers an outline (list of turns/headings) to see its structure.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S18.14 Jump to a turn.
- Should: The user can jump directly to a chosen earlier turn in the conversation.
- Status: mobile missing, cli missing, vscode missing, chrome missing

## S18.15 Jump to latest.
- Should: After scrolling up, one control returns the view to the latest message.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/ChatMessageList.tsx:340; apps/web/features/chat/components/messages/ChatMessageList.tsx:1396; apps/mobile/src/features/chat/components/MessageList.tsx:170; apps/mobile/src/features/chat/components/MessageList.tsx:75; apps/cli/src/tui/tui_app.rs:2719

## S18.16 Scroll-position restoration.
- Should: Leaving and returning to a conversation restores the previous scroll position.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S18.17 Branch-tree navigation.
- Should: A conversation with branches lets the user see and switch between branches.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:1813; apps/web/features/chat/pages/WebChatPage.tsx:5737; apps/mobile/src/features/chat/components/MessageBubble.tsx:2009

## S18.18 Conversation export.
- Should: The whole conversation can be exported to a file (e.g. Markdown, PDF, JSON).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/ConversationTitleMenu.tsx:178; apps/web/features/chat/pages/WebChatPage.tsx:5851; apps/mobile/app/(app)/chat/[id].tsx:1599; apps/mobile/app/(app)/chat/[id].tsx:1189; apps/cli/src/tui/tui_app.rs:3581

## S18.19 Conversation sharing.
- Should: The user can share a conversation (e.g. a read-only link) from the conversation.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5535; apps/web/features/chat/components/share/ShareConversationDialog.tsx:288; apps/web/features/chat/hooks/use-share-conversation.ts:177; apps/mobile/app/(app)/chat/[id].tsx:1535

## S18.20 Shared-link management.
- Should: The user can see and revoke links they have shared.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/share/ShareConversationDialog.tsx:262; apps/web/features/chat/hooks/use-share-conversation.ts:212; apps/mobile/app/(app)/settings/shared-links.tsx:48; apps/mobile/app/(app)/settings/shared-links.tsx:92; apps/mobile/src/features/shared-links/service.ts:43; apps/mobile/src/features/settings/index.tsx:443

## S18.21 Conversation details inspector.
- Should: A conversation details view shows its metadata (created/updated, model, message count, id, project).
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5361; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:739; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:545; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:194; apps/cli/src/tui/tui_app.rs:3406; apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:59

## S18.22 Context and source inspector.
- Should: The user can inspect what context and sources the conversation is using (files, instructions, memory, token budget).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:737; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:664; apps/web/features/chat/pages/WebChatPage.tsx:5361; apps/mobile/app/(app)/chat/[id].tsx:1554; apps/cli/src/agent/history.rs:21; apps/extension-vscode/src/features/trees/contextPanelProvider.ts:119; apps/extension-vscode/src/core/chatSetup.ts:66; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5077

## S18.23 Usage summary.
- Should: The conversation shows a usage summary (tokens/cost) for the conversation as a whole.
- Status: web missing, desktop missing, mobile missing, cli done, vscode done, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:3897; apps/cli/src/tui/tui_app.rs:3899; apps/extension-vscode/src/data/tokenCounter.ts:119; apps/extension-vscode/src/data/tokenCounter.ts:15

## S18.24 Conversation-level instructions.
- Should: The user can set instructions that apply only to this conversation.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/lib.rs:258

## S18.25 Conversation-level enabled tools.
- Should: Tool enablement (web search, code, etc.) can be set for this conversation and persists across its turns.
- Status: web done, desktop done, cli done, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:1443; apps/web/features/chat/pages/WebChatPage.tsx:1455; apps/cli/src/lib.rs:405

## S18.26 Conversation-level connected accounts.
- Should: The user can choose which connected accounts/connectors this conversation may use.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:830; apps/web/features/chat/pages/WebChatPage.tsx:2072
- Unfinished: web: ['ui'] | desktop: ['ui']

## S18.27 Active tasks associated with the conversation.
- Should: The conversation shows the active tasks/runs started from it and their status.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:295; apps/web/features/chat/pages/WebChatPage.tsx:5816; apps/web/features/chat/pages/WebChatPage.tsx:5104; apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419

## S18.28 Continuation on another device.
- Should: A conversation started on one device can be continued on another.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:160; packages/ui/ui/src/sidebar/SessionItem.tsx:245; apps/mobile/stores/chat/chatExecutionStore.ts:640; apps/mobile/src/features/chat/ChatsListScreen.tsx:330; apps/cli/src/cloud/mod.rs:178; apps/cli/src/claude_parity.rs:141; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:166; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:316
