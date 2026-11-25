---
id: "PLAN-web-041"
type: "test-plan"
title: "Web · 41. Temporary and private experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "41"
---
# Web · 41. Temporary and private experiences

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S41.01 Temporary-chat entry.

- **Expected:** The user can start a temporary chat (or make new chats temporary by default) from the chat surface.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:717; apps/web/features/settings/components/WebSettingsModal.tsx:199 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:2666
- **Earlier check in the running app:** PARTIAL: Temporary entry and inference work, but the completed temporary chat is discoverable in global history search. | E103 [PASS; mode entry and visible disclosure]: Temporary chat menu entry opens a visible temporary-mode banner. Disclosure says history and memory skipped. Persistence and retention enforcement not yet established. | E105 [PARTIAL; mode enters and generates, but history exclusion fails]: After completed temporary chat, New chat then global Search TEMP_QA_8402 returned 3 results: the conversation title, user message, and assistant response. E103/E104 display the promise that temporary chat stays out of history. Search demonstrates discoverability; database retention and memory writes were not inspected.
- **Where to find it:** The + button under the message box > Temporary chat. Or Settings > Privacy > Start new chats as temporary (sets the default for new chats). (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the + button under the message box and click Temporary chat.
  3. Look for the Temporary chat banner in the top bar and the line Stays out of your history, search, memory and Library.
  4. Compare with Expected: a temporary chat can be started from the chat surface.

## S41.02 Visible temporary-mode banner.

- **Expected:** While a chat is temporary, a visible indicator says so for as long as the chat is open.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7358; apps/web/features/chat/pages/WebChatPage.tsx:7349; apps/web/features/chat/pages/WebChatPage.tsx:2211
- **Earlier check in the running app:** PASS: E103 [PASS; mode entry and visible disclosure]: Temporary chat menu entry opens a visible temporary-mode banner. Disclosure says history and memory skipped. Persistence and retention enforcement not yet established. | E104 [PASS; temporary status retained after completion]: Temporary request returned exact TEMP_QA_8402_OK. Conversation URL 20c45353-c2e3-4606-a039-692504921dcf and temporary status visible. This establishes inference in temporary mode, not retention enforcement.
- **Where to find it:** Start a chat with the + button > Temporary chat. The label Temporary chat sits in the top bar of the chat, and hovering it shows the retention note. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Start a temporary chat as in S41.01.
  2. Send a message and wait for the reply.
  3. Check that the label Temporary chat stays in the top bar while the chat is open, with the Personalized or Unpersonalized switch beside it.
  4. Compare with Expected: the banner stays visible for as long as the chat is open.

## S41.03 History-persistence explanation.

- **Expected:** The product explains accurately what is and is not kept from a temporary chat, and the explanation matches what happens.
- **Code:** done. Evidence present: apps/web/lib/temporary-chat-policy.ts:22
- **Earlier check in the running app:** FAIL: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed. | E103 [UI_ONLY; history explanation only]: Temporary chat menu entry opens a visible temporary-mode banner. Disclosure says history and memory skipped. Persistence and retention enforcement not yet established. | E105 [FAIL; visible history behavior contradicts disclosure]: After completed temporary chat, New chat then global Search TEMP_QA_8402 returned 3 results: the conversation title, user message, and assistant response. E103/E104 display the promise that temporary chat stays out of history. Search demonstrates discoverability; database retention and memory writes were not inspected.
- **Where to find it:** Chat top bar: hover the Temporary chat label. Also Settings > Privacy > How we protect your data. (labels found in the code)
- **Needs:** a signed-in account; a second search after the chat is finished
- **Steps:**
  1. Start a temporary chat and hover the Temporary chat label in the top bar.
  2. Read the text shown: Won't be saved to your history and skips memory for this turn.
  3. Open Settings > Privacy and expand How we protect your data.
  4. Send a temporary chat, then search the history for a word from it and compare with Expected.

## S41.04 Memory-read choice where offered.

- **Expected:** Where offered, the user can choose whether a temporary chat may read saved memory, and the choice is honoured.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6133
- **Where to find it:** not found in the code. The code disables the + menu Memory row in a temporary chat (memoryDisabled when isIncognito) and says memory is never read, so no choice is offered; I searched ChatComposerNew.tsx for memory handling and found no per-chat read choice.
- **Needs:** a signed-in account with Memory on

## S41.05 Memory-write exclusion.

- **Expected:** Nothing from a temporary chat is saved to memory.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:504; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2754 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1193; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3919
- **Where to find it:** no screen of its own. A tester cannot see the memory store directly from the UI in the code I read, so this can only be compared through the note.
- **Needs:** a signed-in account with Memory on
- **Steps:**
  1. Start a temporary chat and hover the Temporary chat label.
  2. Read the text Won't be saved to your history and skips memory for this turn.
  3. Compare with Expected: nothing from the temporary chat should appear in memory.

## S41.06 Custom-instruction choice.

- **Expected:** The user can choose whether custom instructions apply in a temporary chat.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7368; apps/web/lib/hooks/useChatStream.ts:836; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:713
- **Where to find it:** Chat top bar > Personalized / Unpersonalized switch, shown only in a temporary chat. (labels found in the code)
- **Needs:** a signed-in account with custom instructions set
- **Steps:**
  1. Start a temporary chat.
  2. Look at the switch in the top bar, which reads Personalized by default.
  3. Click it and read the title hint: Personalized uses your profile, instructions and response style.
  4. Send a message and compare the reply with Expected: custom instructions apply only when Personalized is on.

## S41.07 Plugin availability in temporary mode.

- **Expected:** The user can tell which plugins/connectors work in a temporary chat and how they behave there.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359 (quoted code not found in the file now); apps/web/lib/temporary-chat-policy.ts:25; apps/web/app/api/llm/v1/chat/completions/route.ts:721 (quoted code not found in the file now)
- **Where to find it:** The + button under the message box > Plugins, while a temporary chat is open. (labels found in the code)
- **Needs:** a signed-in account; a connector connected
- **Steps:**
  1. Start a temporary chat.
  2. Click the + button under the message box and open Plugins.
  3. Read the note under the Temporary chat row: Won't be saved to your history or show up in search, and skips memory.
  4. Compare with Expected: the note should say how a connector behaves in a temporary chat, such as asking before each call.

## S41.08 File-retention explanation.

- **Expected:** The product explains what happens to files attached in a temporary chat and for how long they are kept.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:504; apps/web/features/settings/sections/PrivacySection.tsx:717; apps/web/features/settings/sections/PrivacySection.tsx:739 (quoted code not found in the file now); apps/web/app/api/cron/purge-temporary-chats/route.ts:43 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed.
- **Where to find it:** The + button under the message box > the file attach row while a temporary chat is open. Also Settings > Privacy > How we protect your data. (labels found in the code)
- **Needs:** a file to upload; a signed-in account
- **Steps:**
  1. Start a temporary chat and click the + button.
  2. Hover or read the attach row note: Kept out of your Library and deleted with this temporary chat.
  3. Open Settings > Privacy > How we protect your data and read: A temporary chat and its attachments are removed after 30 days.
  4. Compare with Expected: the note should match what happens to an attached file.

## S41.09 Generated-output saving choice.

- **Expected:** In a temporary chat the user can choose to keep a generated output (image, file) even though the chat is not saved.
- **Code:** done. Evidence present: apps/web/lib/server/media-assets.ts:143; apps/web/lib/server/video-generation-jobs.ts:371; apps/web/app/api/media/video/generate/route.ts:172
- **Where to find it:** not found in the code. I searched apps/web/lib/server/media-assets.ts and apps/web/app/api/media/video/generate/route.ts; they set a temporary_chat flag but I found no visible keep or save control for generated output.
- **Needs:** a signed-in account and an image or video generated in a temporary chat

## S41.10 Save temporary conversation explicitly.

- **Expected:** The user can explicitly save a temporary conversation, and everything in it is then kept.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:905; apps/web/app/api/chat/conversations/[id]/keep/route.ts:45
- **Where to find it:** The + button under the message box > Temporary chat (switch it off) > Save chat in the dialog. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a temporary chat with a few messages.
  2. Click the + button and click Temporary chat to turn it off.
  3. In the dialog Save this chat?, click Save chat.
  4. Open the chat from the sidebar history and check the messages are there, and compare with Expected: everything is kept.

## S41.11 Temporary-to-normal conversion review.

- **Expected:** Before a temporary chat becomes a normal one, the user sees what will be kept and confirms.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:4989
- **Where to find it:** The + button under the message box > Temporary chat (switch it off), then read the dialog Save this chat?. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a temporary chat with messages.
  2. Click the + button and click Temporary chat to turn it off.
  3. Read the dialog text: the number of messages, and any files, will be kept in your history.
  4. Click Save chat, or close the dialog to cancel, and compare with Expected: the user sees what is kept before confirming.

## S41.18 Separate history, training, and retention controls.

- **Expected:** History, model training and data retention each have their own clearly separate control or statement.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:743 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:481 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:519
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed.
- **Where to find it:** Settings > Privacy (Start new chats as temporary, How we protect your data, How we use your data, and the Only use models that do not train on your chats switch). (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings > Privacy.
  2. Find the switch Start new chats as temporary and read its line: Not saved to history or search, and deleted after 30 days.
  3. Expand How we protect your data and How we use your data.
  4. Compare with Expected: history, model training and retention each have a separate control or statement.

## S41.19 Privacy-setting education.

- **Expected:** The product explains, in context, what each privacy setting does.
- **Code:** done. Evidence moved: apps/web/lib/temporary-chat-policy.ts:29; apps/web/features/settings/sections/PrivacySection.tsx:738 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy: the short line under each switch, such as Start new chats as temporary, and the expandable sections. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings > Privacy.
  2. Read the grey line under Start new chats as temporary: Not saved to history or search, and deleted after 30 days. Project chats are saved.
  3. Read the grey line under Privacy requests and expand How we protect your data.
  4. Compare with Expected: each setting explains what it does in place.

## S41.20 Per-feature processing-location disclosure.

- **Expected:** For each feature the product says where the data is processed (on device, AGI cloud, a named provider).
- **Code:** done. Evidence present: apps/web/features/settings/sections/PrivacySection.tsx:117; apps/web/features/settings/sections/PrivacySection.tsx:526
- **Where to find it:** Settings > Privacy > Where each feature processes your data. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings > Privacy.
  2. Expand Where each feature processes your data.
  3. Read the rows, for example Chat: Cloud, then the AI provider that serves the model you chose.
  4. Compare with Expected: each feature names where its data is processed.
