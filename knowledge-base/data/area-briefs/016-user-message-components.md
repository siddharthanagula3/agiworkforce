# Area 16. User-message components

22 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S16.01 User identity/avatar.
- Should: The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:1977; apps/web/features/chat/components/messages/MessageBubble.tsx:1982; apps/web/features/chat/components/messages/ChatMessageList.tsx:759; apps/mobile/src/features/chat/components/MessageBubble.tsx:672; apps/mobile/src/features/chat/components/MessageBubble.tsx:706; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/mobile/app/(app)/chat/[id].tsx:1434; apps/cli/src/tui/tui_app.rs:1500

## S16.02 Message text.
- Should: The text the user sent is shown in their message in the transcript.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; apps/web/lib/hooks/useChatStream.ts:3277; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/MessageBubble.tsx:659; apps/mobile/stores/chat/chatExecutionStore.ts:1211

## S16.03 Attachment group.
- Should: Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2162; apps/web/features/chat/components/messages/MessageBubble.tsx:2224; apps/web/features/chat/components/messages/ChatMessageList.tsx:566; apps/web/lib/hooks/useChatStream.ts:3282; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13

## S16.04 Source and context chips.
- Should: A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2500; apps/web/features/chat/components/messages/MessageContextChips.tsx:17; apps/web/lib/hooks/useChatStream.ts:3434; apps/web/features/chat/lib/mcp-context-summary.ts:6; apps/mobile/src/features/chat/components/MessageBubble.tsx:1079; apps/cli/src/tui/tui_app.rs:3341; apps/cli/src/tui/tui_app.rs:6148; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4220

## S16.05 Timestamp.
- Should: Each user message exposes when it was sent (inline or on demand).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3027; apps/web/features/chat/components/messages/ChatMessageList.tsx:642; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/extension/src/features/side-panel/bubbles.ts:250; apps/extension/src/side_panel.ts:4836

## S16.06 Edited-message indicator.
- Should: A user message that was edited after sending is visibly marked as edited.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:913; apps/web/features/chat/components/messages/MessageBubble.tsx:3024; apps/web/features/chat/components/messages/VariantPager.tsx:25

## S16.07 Copy action.
- Should: A sent user message offers a Copy action that puts its text on the clipboard.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2832; apps/web/features/chat/components/messages/MessageBubble.tsx:1592; apps/web/features/chat/components/messages/MessageBubble.tsx:1632; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/MessageBubble.tsx:528

## S16.08 Edit action.
- Should: A sent user message can be edited in place and resubmitted, producing a new reply.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2814; apps/web/features/chat/components/messages/MessageBubble.tsx:2006; apps/web/features/chat/pages/WebChatPage.tsx:4360; apps/web/features/chat/pages/WebChatPage.tsx:4315; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13

## S16.09 Resend action.
- Should: A sent user message can be re-sent unchanged from the message itself to get a fresh reply.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3037; apps/web/features/chat/components/messages/MessageBubble.tsx:3046; apps/web/features/chat/pages/WebChatPage.tsx:4801; apps/web/features/chat/components/messages/ChatMessageList.tsx:1057; apps/mobile/src/features/chat/components/MessageBubble.tsx:847; apps/cli/src/tui/tui_app.rs:2726; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3966; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3423

## S16.10 Branch-from-message action.
- Should: From a chosen user message the user can start a new branch conversation that contains the thread up to that message.
- Status: web done, desktop done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3074; apps/web/features/chat/hooks/use-conversation-branches.ts:103; apps/web/app/api/chat/conversations/[id]/branches/route.ts:52; apps/web/app/api/chat/conversations/[id]/branches/route.ts:67; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13

## S16.11 Message-version navigation.
- Should: When a user message has several revisions the user can page between them (n of m) and the thread follows the chosen revision.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:875; apps/web/features/chat/components/messages/VariantPager.tsx:44; apps/web/features/chat/components/messages/VariantPager.tsx:69; apps/web/features/chat/pages/WebChatPage.tsx:1593; apps/web/features/chat/lib/message-variants-gate.ts:49; apps/mobile/src/features/chat/components/MessageBubble.tsx:1680
- Unfinished: web: ['ui'] | desktop: ['ui']

## S16.12 Expand long message.
- Should: A long user message is shown collapsed with a control that expands it to full length.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2115; apps/web/features/chat/components/messages/MessageBubble.tsx:804; apps/web/features/chat/components/messages/MessageBubble.tsx:2041; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13

## S16.13 Collapse long message.
- Should: An expanded long user message can be collapsed again.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2115; apps/web/features/chat/components/messages/MessageBubble.tsx:804; apps/web/features/chat/components/messages/MessageBubble.tsx:2041; apps/web/features/chat/pages/WebChatPage.tsx:5717; apps/web/features/chat/components/messages/ChatMessageList.tsx:731; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13

## S16.14 Delivery-pending state.
- Should: While a user message is not yet accepted by the service, the message shows a pending/sending/queued state.
- Status: cli missing, vscode done, chrome missing
- Code: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4262

## S16.15 Delivery-failed state.
- Should: When a user message fails to deliver, the transcript shows a clear failed state for that turn.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/hooks/useChatStream.ts:4966; apps/web/lib/hooks/useChatStream.ts:4973; apps/web/lib/hooks/useChatStream.ts:5043; apps/mobile/app/(app)/chat/[id].tsx:1477; apps/mobile/src/features/chat/components/MessageBubble.tsx:1045; apps/mobile/stores/chat/chatExecutionStore.ts:2251; apps/mobile/app/(app)/chat/[id].tsx:1434; apps/mobile/src/features/chat/components/MessageList.tsx:92

## S16.16 Retry-send action.
- Should: A failed send offers Retry that re-sends the same turn (text and attachments) and replaces the failure with the new outcome.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome done
- Code: apps/web/lib/hooks/useChatStream.ts:4966; apps/web/lib/hooks/useChatStream.ts:4973; apps/web/lib/hooks/useChatStream.ts:5043; apps/mobile/app/(app)/chat/[id].tsx:1481; apps/mobile/stores/chat/chatExecutionStore.ts:2986; apps/mobile/app/(app)/chat/[id].tsx:1434; apps/mobile/src/features/chat/components/MessageList.tsx:92; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3346

## S16.17 Queued-message state.
- Should: A message sent while a reply is still running is shown as queued (not yet sent) until it goes out.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3733; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:286; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3343; apps/web/features/chat/pages/WebChatPage.tsx:5776; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:844; apps/mobile/src/features/chat/components/ChatInput.tsx:314

## S16.18 Draft versus submitted distinction.
- Should: Unsent composer text is kept as a draft per conversation, separate from sent messages, and a failed send returns to the composer as an unsent draft.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:565; apps/web/features/chat/hooks/use-conversation-draft-sync.ts:28; apps/web/features/chat/pages/WebChatPage.tsx:1495; apps/web/app/api/chat/conversations/[id]/route.ts:224; apps/web/features/chat/pages/WebChatPage.tsx:5776; apps/web/features/chat/components/WebChatRoot.tsx:22; apps/web/app/chat/page.tsx:13; apps/mobile/src/features/chat/components/ChatInput.tsx:349

## S16.19 Voice-transcript attribution.
- Should: A user message that came from speech is marked as a voice transcript (e.g. mic badge or "Transcribed").
- Status: web missing, desktop missing, mobile missing, cli done, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:3275

## S16.20 Imported-message attribution.
- Should: Messages brought in from elsewhere (another product, a shared link, another device) are marked with where they came from.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/sessions.rs:136; apps/cli/src/tui/tui_app.rs:513

## S16.21 Group-conversation author identity.
- Should: In a conversation with several human participants, each user message shows which person wrote it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S16.22 Message-level deep link.
- Should: A user can obtain and open a link that lands on one specific message in a conversation.
- Status: mobile missing, cli missing, vscode missing, chrome missing
