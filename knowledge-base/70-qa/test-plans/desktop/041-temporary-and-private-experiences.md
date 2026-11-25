---
id: "PLAN-desktop-041"
type: "test-plan"
title: "Desktop · 41. Temporary and private experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "41"
---
# Desktop · 41. Temporary and private experiences

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S41.01 Temporary-chat entry.

- **Expected:** The user can start a temporary chat (or make new chats temporary by default) from the chat surface.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:717; apps/web/features/settings/components/WebSettingsModal.tsx:199 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:2666
- **Where to find it:** Composer > + menu > Use incognito (desktop: File > New Temporary Chat) (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Click the + button in the message box (its own label was not checked in the code).
  3. Click Use incognito. The row changes to Exit incognito.
  4. Send one message, then look at the top header for Temporary chat with an eye icon. Compare with Expected: the user can start a temporary chat from the chat surface.

## S41.02 Visible temporary-mode banner.

- **Expected:** While a chat is temporary, a visible indicator says so for as long as the chat is open.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7358; apps/web/features/chat/pages/WebChatPage.tsx:7349; apps/web/features/chat/pages/WebChatPage.tsx:2211
- **Where to find it:** Top header of a temporary chat: Temporary chat (labels found in the code)
- **Steps:**
  1. Start a temporary chat (Use incognito in the + menu).
  2. With no messages yet, look at the header: Temporary chat with an eye icon, then the note Won't be saved to your history and skips memory for this turn.
  3. Send a message and open a second chat; the header shows Temporary chat only, with no note.
  4. Return to the temporary chat and check the banner is still there. Compare with Expected: it stays visible while the chat is open.

## S41.03 History-persistence explanation.

- **Expected:** The product explains accurately what is and is not kept from a temporary chat, and the explanation matches what happens.
- **Code:** done. Evidence present: apps/web/lib/temporary-chat-policy.ts:22
- **Where to find it:** Hover over the Use incognito row in the + menu, or Settings > Privacy > Start new chats as temporary (labels found in the code)
- **Steps:**
  1. Open the + menu in a new chat and hover over Use incognito.
  2. Read the line under the row: Stays out of your history, search, memory and Library.
  3. Open Settings > Privacy and read the description under Start new chats as temporary: Not saved to history or search, and deleted after 30 days.
  4. Compare with Expected: the explanation should match what happens to the chat.

## S41.04 Memory-read choice where offered.

- **Expected:** Where offered, the user can choose whether a temporary chat may read saved memory, and the choice is honoured.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6133
- **Where to find it:** no screen of its own. The code offers no per-chat choice to let a temporary chat read memory. Expected says where offered, so this may not apply.
- **Steps:**
  1. Start a temporary chat and open the + menu.
  2. Look at the memory item: it is greyed out, not switchable.
  3. Hover over it to see Temporary chats never read or save memory.
  4. Compare with Expected: no choice is offered in the code, so memory is never read in a temporary chat.

## S41.05 Memory-write exclusion.

- **Expected:** Nothing from a temporary chat is saved to memory.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359 (quoted code not found in the file now); apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:504; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2754 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1193; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3919
- **Where to find it:** no screen of its own. The code path that skips memory writes was found, but the exact Settings memory screen was not traced.
- **Needs:** a Free or paid account with Memory turned on
- **Steps:**
  1. Start a temporary chat and tell the assistant a personal fact to remember.
  2. Open Settings and look at the memory section for new saved items.
  3. Compare with Expected: nothing from the temporary chat should be saved to memory.

## S41.06 Custom-instruction choice.

- **Expected:** The user can choose whether custom instructions apply in a temporary chat.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7368; apps/web/lib/hooks/useChatStream.ts:836; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:713
- **Where to find it:** Top header of a temporary chat: the Personalized switch (labels found in the code)
- **Steps:**
  1. Start a temporary chat.
  2. Find the switch in the header labelled Personalized (it is the switch beside Temporary chat).
  3. Hover it to read Personalized uses your profile, instructions and response style.
  4. Click it: the word changes to Unpersonalized. Compare with Expected: custom instructions should apply or not as the switch says.

## S41.07 Plugin availability in temporary mode.

- **Expected:** The user can tell which plugins/connectors work in a temporary chat and how they behave there.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:359 (quoted code not found in the file now); apps/web/lib/temporary-chat-policy.ts:25; apps/web/app/api/llm/v1/chat/completions/route.ts:721 (quoted code not found in the file now)
- **Where to find it:** Hover over the Use incognito row in the + menu (the retention note) (labels found in the code)
- **Needs:** a connector set up in the account
- **Steps:**
  1. Open the + menu in a new chat.
  2. Hover over Use incognito and read the hover text.
  3. Look for the clause: a connector asks before every call even where you saved Always allow, and a connector call still reaches that service.
  4. Compare with Expected: the user should be able to tell which connectors work in a temporary chat and how.

## S41.08 File-retention explanation.

- **Expected:** The product explains what happens to files attached in a temporary chat and for how long they are kept.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:504; apps/web/features/settings/sections/PrivacySection.tsx:717; apps/web/features/settings/sections/PrivacySection.tsx:739 (quoted code not found in the file now); apps/web/app/api/cron/purge-temporary-chats/route.ts:43 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > How we protect your data (retention paragraph); also the attach note in the + menu (labels found in the code)
- **Steps:**
  1. Open Settings > Privacy.
  2. Expand How we protect your data.
  3. Read the paragraph: A temporary chat and its attachments are removed after 30 days.
  4. Open the + menu in a temporary chat and hover over an attach row; compare with Expected: the note should say what happens to files.

## S41.09 Generated-output saving choice.

- **Expected:** In a temporary chat the user can choose to keep a generated output (image, file) even though the chat is not saved.
- **Code:** done. Evidence present: apps/web/lib/server/media-assets.ts:143; apps/web/lib/server/video-generation-jobs.ts:371; apps/web/app/api/media/video/generate/route.ts:172
- **Where to find it:** not found in the code. The code keeps generated media for a temporary chat in media-assets.ts, video-generation-jobs.ts and the video route, but no control for a user to choose to keep the output was found in the chat UI. Searched the chat and library folders for save and keep wording without a match.
- **Needs:** a temporary chat that makes an image or video

## S41.10 Save temporary conversation explicitly.

- **Expected:** The user can explicitly save a temporary conversation, and everything in it is then kept.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:905; apps/web/app/api/chat/conversations/[id]/keep/route.ts:45
- **Where to find it:** Composer > + menu > Exit incognito, then the Save this chat? dialog > Save chat (only when the chat has messages) (labels found in the code)
- **Needs:** a temporary chat with at least one message
- **Steps:**
  1. Start a temporary chat and send a message.
  2. Open the + menu and click Exit incognito.
  3. In the dialog Save this chat?, read the list of what will be kept, then click Save chat.
  4. Look for the toast Chat saved to your history. and open the chat in the sidebar. Compare with Expected: everything in it is kept.

## S41.11 Temporary-to-normal conversion review.

- **Expected:** Before a temporary chat becomes a normal one, the user sees what will be kept and confirms.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:4989
- **Where to find it:** Composer > + menu > Exit incognito, then the Save this chat? dialog (before confirming) (labels found in the code)
- **Needs:** a temporary chat with messages
- **Steps:**
  1. Start a temporary chat with a few messages and attach a file if you can.
  2. Open the + menu and click Exit incognito.
  3. Read the dialog Save this chat?: it says how many messages and any files will be kept in your history.
  4. Click Cancel or the close control to check nothing changed, then repeat and click Save chat. Compare with Expected: the user sees what is kept and confirms first.

## S41.18 Separate history, training, and retention controls.

- **Expected:** History, model training and data retention each have their own clearly separate control or statement.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:743 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:481 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:519
- **Where to find it:** Settings > Privacy: Start new chats as temporary, Only use models that do not train on your chats, How we protect your data (labels found in the code)
- **Steps:**
  1. Open Settings > Privacy.
  2. Read Start new chats as temporary with its switch and its description.
  3. Read the switch Only use models that do not train on your chats under the heading Model improvement.
  4. Expand How we protect your data and read the retention paragraph. Compare with Expected: history, training and retention each have their own control or statement.

## S41.19 Privacy-setting education.

- **Expected:** The product explains, in context, what each privacy setting does.
- **Code:** done. Evidence moved: apps/web/lib/temporary-chat-policy.ts:29; apps/web/features/settings/sections/PrivacySection.tsx:738 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy: the one-line description under each switch (labels found in the code)
- **Steps:**
  1. Open Settings > Privacy.
  2. Read the description under Start new chats as temporary.
  3. Read the description under each model improvement switch, including Only use models that do not train on your chats.
  4. Compare with Expected: each setting should say in context what it does.

## S41.20 Per-feature processing-location disclosure.

- **Expected:** For each feature the product says where the data is processed (on device, AGI cloud, a named provider).
- **Code:** done. Evidence present: apps/web/features/settings/sections/PrivacySection.tsx:117; apps/web/features/settings/sections/PrivacySection.tsx:526
- **Where to find it:** Settings > Privacy > Where each feature processes your data (labels found in the code)
- **Steps:**
  1. Open Settings > Privacy.
  2. Expand Where each feature processes your data.
  3. Read the rows: Chat, Files you attach, Memory and past-chat search, Web search and Deep Research, Image and video generation, Dictation, Voice mode, Read aloud, Connectors.
  4. Compare with Expected: each row names the place the data is processed, such as Cloud or a named provider.
