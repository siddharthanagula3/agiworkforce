# Area 41. Temporary and private experiences

20 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S41.01 Temporary-chat entry.
- Should: The user can start a temporary chat (or make new chats temporary by default) from the chat surface.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359; apps/web/features/settings/sections/PrivacySection.tsx:736; apps/web/features/settings/components/WebSettingsModal.tsx:199; apps/web/features/chat/pages/WebChatPage.tsx:2005; apps/mobile/app/(app)/(tabs)/chat.tsx:805; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:28; apps/mobile/stores/chat/chatMessageStore.ts:1383

## S41.02 Visible temporary-mode banner.
- Should: While a chat is temporary, a visible indicator says so for as long as the chat is open.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5435; apps/web/features/chat/pages/WebChatPage.tsx:5420; apps/web/features/chat/pages/WebChatPage.tsx:1658; apps/mobile/app/(app)/(tabs)/chat.tsx:805; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:28; apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:40; apps/mobile/app/(app)/chat/[id].tsx:1428; apps/mobile/stores/chat/chatMessageStore.ts:1383

## S41.03 History-persistence explanation.
- Should: The product explains accurately what is and is not kept from a temporary chat, and the explanation matches what happens.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/temporary-chat-policy.ts:17; apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:40; apps/mobile/app/(app)/chat/[id].tsx:1428; apps/mobile/src/features/chat/utils/conversationMode.ts:34; apps/mobile/stores/chat/chatMessageStore.ts:1158

## S41.04 Memory-read choice where offered.
- Should: Where offered, the user can choose whether a temporary chat may read saved memory, and the choice is honoured.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4530; apps/mobile/stores/chat/chatExecutionStore.ts:1410; apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:9

## S41.05 Memory-write exclusion.
- Should: Nothing from a temporary chat is saved to memory.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:366; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2754; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1284; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2600; apps/mobile/stores/chat/chatExecutionStore.ts:2223

## S41.06 Custom-instruction choice.
- Should: The user can choose whether custom instructions apply in a temporary chat.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5597; apps/web/lib/hooks/useChatStream.ts:3722; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:440; apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:14; apps/mobile/stores/chat/chatExecutionStore.ts:2253

## S41.07 Plugin availability in temporary mode.
- Should: The user can tell which plugins/connectors work in a temporary chat and how they behave there.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359; apps/web/lib/temporary-chat-policy.ts:14; apps/web/app/api/llm/v1/chat/completions/route.ts:721

## S41.08 File-retention explanation.
- Should: The product explains what happens to files attached in a temporary chat and for how long they are kept.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:366; apps/web/features/settings/sections/PrivacySection.tsx:736; apps/web/features/settings/sections/PrivacySection.tsx:739; apps/web/app/api/cron/purge-temporary-chats/route.ts:43; apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:9; apps/mobile/src/features/chat/upload/uploadAttachment.ts:36; apps/mobile/src/features/chat/components/ChatInput.tsx:499

## S41.09 Generated-output saving choice.
- Should: In a temporary chat the user can choose to keep a generated output (image, file) even though the chat is not saved.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/server/media-assets.ts:251; apps/web/lib/server/video-generation-jobs.ts:373; apps/web/app/api/media/video/generate/route.ts:146

## S41.10 Save temporary conversation explicitly.
- Should: The user can explicitly save a temporary conversation, and everything in it is then kept.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:733; apps/web/app/api/chat/conversations/[id]/keep/route.ts:101

## S41.11 Temporary-to-normal conversion review.
- Should: Before a temporary chat becomes a normal one, the user sees what will be kept and confirms.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:3954

## S41.12 Incognito search.
- Should: The user can run searches that are not saved to their history.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S41.13 Private browser session.
- Should: The agent can browse in a private session that keeps no cookies or history afterward.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S41.14 Local-only conversation.
- Should: The user can keep conversations only on their device, never uploaded to the account.
- Status: mobile done, cli done, vscode done, chrome done
- Code: apps/mobile/src/features/settings/cloud-privacy/index.tsx:38; apps/mobile/stores/chat/chatMessageStore.ts:1158; apps/mobile/src/features/chat/store/appModeStore.ts:15; apps/mobile/src/features/chat/utils/conversationMode.ts:34; apps/cli/src/tui/tui_app.rs:3550; apps/cli/src/sessions.rs:531; apps/cli/src/sessions.rs:228; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1271

## S41.15 Local-only file collection.
- Should: The user can keep a collection of files on the device that chats can use without uploading them.
- Status: web missing, desktop missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:238; apps/cli/src/claude_parity.rs:338; apps/cli/src/claude_parity.rs:244

## S41.16 Local-only Memory.
- Should: The user can keep memory only on the device, never stored in the account.
- Status: web missing, desktop missing, mobile done, cli done, vscode missing, chrome missing
- Code: apps/mobile/app/(app)/settings/memory-summary.tsx:44; apps/mobile/storage/memory.ts:20; apps/mobile/src/features/chat/store/appModeStore.ts:15; apps/mobile/src/features/memory/services/consolidation.ts:30; apps/cli/src/tui/tui_app.rs:3914; apps/cli/src/memory_pipeline.rs:253; apps/cli/src/memory_pipeline.rs:475

## S41.17 Clear local data.
- Should: One action clears all data the app keeps on this device.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/app/(app)/settings/storage.tsx:172; apps/mobile/app/(app)/settings/storage.tsx:194

## S41.18 Separate history, training, and retention controls.
- Should: History, model training and data retention each have their own clearly separate control or statement.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/PrivacySection.tsx:743; apps/web/features/settings/sections/PrivacySection.tsx:481; apps/web/features/settings/sections/PrivacySection.tsx:495; apps/mobile/src/features/settings/cloud-privacy/index.tsx:18; apps/mobile/src/features/settings/cloud-privacy/index.tsx:27; apps/cli/src/claude_parity.rs:413; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1369; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1377

## S41.19 Privacy-setting education.
- Should: The product explains, in context, what each privacy setting does.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/lib/temporary-chat-policy.ts:17; apps/web/features/settings/sections/PrivacySection.tsx:738; apps/mobile/src/features/settings/cloud-privacy/index.tsx:38; apps/mobile/src/features/settings/index.tsx:572; apps/mobile/src/features/chat/utils/conversationMode.ts:34; apps/cli/src/claude_parity.rs:146; apps/cli/src/claude_parity.rs:325; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1361

## S41.20 Per-feature processing-location disclosure.
- Should: For each feature the product says where the data is processed (on device, AGI cloud, a named provider).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/PrivacySection.tsx:88; apps/web/features/settings/sections/PrivacySection.tsx:495; apps/mobile/src/features/settings/cloud-privacy/index.tsx:33; apps/mobile/src/features/settings/cloud-privacy/index.tsx:123; apps/cli/src/claude_parity.rs:325; apps/cli/src/claude_parity.rs:146; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1361; apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1369
