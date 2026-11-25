---
id: "PLAN-web-085"
type: "test-plan"
title: "Web · 85. Personalization and data settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "85"
---
# Web · 85. Personalization and data settings

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S85.01 Profile details.

- **Expected:** The user can view and edit their account profile (name, photo, email) on the surface, and the change is saved to the account.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:242; apps/web/app/settings/_lib/preferences-client.ts:284; apps/web/app/api/me/route.ts:441
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Account menu (your name at the bottom of the sidebar) > Settings > General > Profile. Email: Settings > Account > Email > Change email address (labels found in the code)
- **Needs:** a Free or paid account; an image file to upload; a mailbox that can receive the email change code
- **Steps:**
  1. Open the account menu at the bottom of the sidebar and click Settings.
  2. In General, under Profile, click the Full name field and change the name.
  3. Click Upload photo (or Change photo) and choose a PNG, JPEG, GIF, WebP or HEIC image.
  4. Click Save profile and wait for Saved.
  5. Reload the page and check the name and photo are still there.
  6. For email: open Settings > Account, click the Email row, then Change email address, and follow the code steps. Check the new address shows on the Account page.

## S85.02 Custom instructions.

- **Expected:** The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.
- **Code:** done. Evidence moved: apps/web/app/api/models/free-quota/completions/route.ts:595 (quoted code not found in the file now); apps/web/lib/services/turn-context-service.ts:338; apps/web/features/models/lib/free-offering-request.ts:69 (quoted code not found in the file now); apps/web/features/chat/components/Composer/FreeQuotaModelSection.tsx:118 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Instructions for AGI (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Open Settings from the account menu and click Personalization.
  2. Scroll to the Instructions for AGI box and type an instruction, for example a reply language.
  3. Wait for the save status to show Saved, then reload the page to confirm the text stayed.
  4. Start a new chat, send a question, and compare the reply with the instruction.
  5. Go back, switch the instructions off, ask again, and compare the reply.

## S85.03 Communication style.

- **Expected:** The user can choose how the assistant communicates (tone, length, formatting) on the surface and replies follow it.
- **Code:** done. Evidence moved: apps/web/lib/services/turn-context-service.ts:338; apps/web/lib/server/user-identity.ts:250; apps/web/app/api/models/free-quota/completions/route.ts:595 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E008 [UI_ONLY; visible UI]: Settings opens with populated profile, custom instructions, theme, accent, motion, language, model, effort, font and sidebar preferences. Save/persistence and inference effects not exercised.
- **Where to find it:** Settings > Personalization > Style and tone (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Open Settings from the account menu and click Personalization.
  2. Under Style and tone, change Response style (for example to Concise).
  3. Change Response length or Preferred formatting if you want.
  4. Start a new chat and send the same question.
  5. Compare the reply length, tone and formatting with the choice you made.

## S85.04 Writing-style personalization.

- **Expected:** The user can give the assistant a sample of their own writing (or a named custom style) and replies imitate that writing style.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/StyleSelector.tsx:155; apps/web/features/chat/components/Composer/StyleSelector.tsx:347; apps/web/features/chat/stores/style-store.ts:378; apps/web/lib/hooks/useChatStream.ts:4534; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4969 (quoted code not found in the file now)
- **Where to find it:** Chat composer (under the message box) > Style > Create Custom Style (labels found in the code)
- **Steps:**
  1. Open a new chat and click Style in the composer footer.
  2. Click Create Custom Style.
  3. Type a name, and in Writing sample paste a sample of your own writing; the instruction box fills automatically if left empty.
  4. Click Save.
  5. Select the new custom style, send a question, and compare the reply with your sample's tone and sentence structure.

## S85.05 Saved Memory.

- **Expected:** The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.
- **Code:** done. Evidence moved: apps/web/lib/services/turn-context-service.ts:338; apps/web/app/api/models/free-quota/completions/route.ts:606 (quoted code not found in the file now); apps/web/features/models/lib/free-offering-request.ts:69 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Persistent memory (labels found in the code)
- **Needs:** a Free or paid account; memory is off by default
- **Steps:**
  1. Open Settings from the account menu and click Personalization.
  2. Find the Persistent memory switch and turn it on.
  3. Add a fact in the Add a new fact field (placeholder starts with Example:) and save it.
  4. Check the fact appears in the memory list; then use Edit memory or Delete memory on it to change or remove it.
  5. Turn the Persistent memory switch off and check the list and the behaviour in a new chat.

## S85.06 Past-chat reference.

- **Expected:** The user can let the assistant search or reference their other chats when answering, and switch it off; temporary chats are never referenced.
- **Code:** done. Evidence moved: apps/web/lib/services/turn-context-service.ts:338; apps/web/app/api/models/free-quota/completions/route.ts:606 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Search past chats (labels found in the code)
- **Needs:** a Free or paid account with at least one earlier chat on a known topic
- **Steps:**
  1. Open Settings from the account menu and click Personalization.
  2. Turn on the Search past chats switch.
  3. Start a new chat (not temporary) and ask about a topic from an earlier chat.
  4. Check whether the reply refers to the earlier chat.
  5. Turn Search past chats off, ask again in a new chat, and compare; then start a temporary chat and check it does not refer to other chats.

## S85.07 Project Memory preferences.

- **Expected:** The user can choose, per project, whether project chats also use account-wide memories or only that project's memories.
- **Code:** done. Evidence present: apps/web/app/chat/projects/[id]/page.tsx:1369; apps/web/features/projects/components/ProjectSettingsDialog.tsx:393; apps/web/features/projects/components/ProjectSettingsDialog.tsx:78; apps/web/app/api/projects/[id]/route.ts:186; apps/web/lib/services/managed-memory-context-service.ts:1270
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Projects > open a project > Project options (the ... button) > Project settings > Memory (labels found in the code)
- **Needs:** a project and some saved memories on the account
- **Steps:**
  1. Click Projects in the sidebar and open a project.
  2. Click Project options at the top of the project.
  3. Click Project settings.
  4. Under Memory, tick or untick Use memories from outside this project and read the line under it.
  5. Save the dialog, then ask a question in a chat in that project and compare with the choice.

## S85.11 Activity-history preference.

- **Expected:** The user can choose whether their chats are kept in history (and synced to the account) or not saved.
- **Code:** done. Evidence present: apps/web/app/api/search/route.ts:324; apps/web/app/api/search/route.ts:375; apps/web/lib/services/retrieval-search-service.ts:270; apps/web/lib/hooks/useConversations.ts:648; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:80; apps/web/lib/server/persist-free-offering-user.ts:33; apps/web/shared/components/CommandPalette/CommandPalette.tsx:122; apps/web/app/api/projects/route.ts:110; apps/web/app/api/projects/[id]/route.ts:63
- **Where to find it:** not found in the code. Searched the settings sections and components for chat history, keep, save and history wording; no control that chooses whether chats are kept in history and synced was found. The nearest controls are Start new chats as temporary (S85.16) and the composer temporary-chat option, which is not the same choice.

## S85.12 Training/improvement choice.

- **Expected:** The user can choose whether their content may be used to train or improve models.
- **Code:** done. Evidence moved: apps/web/lib/server/side-call-training-policy.ts:31 (quoted code not found in the file now); apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:153 (quoted code not found in the file now); apps/web/lib/services/model-memory-extraction.ts:105 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4696
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Privacy > Help improve models (heading) > Use my chats (labels found in the code)
- **Steps:**
  1. Open Settings from the account menu and click Privacy.
  2. Scroll to the heading that starts with Help improve and ends with models, and read the note under it.
  3. Turn Use my chats on, then off, and read the description under it.
  4. Turn Use my voice on or off if you want, then reload the page.
  5. Compare the switch states after reload with what you set; the note says both are off and nothing is used for this today.

## S85.14 Diagnostic-sharing choice.

- **Expected:** The user can choose whether crash reports and diagnostics are sent, and the choice is honoured.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:51 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:211 (quoted code not found in the file now); apps/web/lib/sentry-shared.ts:94
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed.
- **Where to find it:** Settings > Privacy > Share crash and error reports (labels found in the code)
- **Steps:**
  1. Open Settings from the account menu and click Privacy.
  2. Find the Share crash and error reports switch and turn it off.
  3. Reload the page and check the switch stays off.
  4. Turn it on again and reload; check the switch shows on.
  5. Compare the switch with its description: error reports, with sensitive fields removed.

## S85.16 Temporary-chat preferences.

- **Expected:** The user can make new chats temporary by default (not saved, not used for memory) and the preference is honoured.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:4416; apps/web/lib/server/persist-free-offering-user.ts:33
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed.
- **Where to find it:** Settings > Privacy > Start new chats as temporary (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Open Settings from the account menu and click Privacy.
  2. Turn on Start new chats as temporary.
  3. Close Settings, click New chat and send a message.
  4. Check the chat is not listed in the sidebar history or in search after you leave it.
  5. Turn the switch off, start a new chat and check it is saved normally.

## S85.17 Archived-chat management.

- **Expected:** The user can list archived chats, restore them, and delete them.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now); apps/web/features/settings/sections/ArchivedChatsSection.tsx:110 (quoted code not found in the file now); apps/web/features/settings/services/conversation-data-service.ts:131 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed. | E012 [PASS; empty-state interaction]: Archived manager opens and settles to its empty state; restore behavior needs a test archived chat. | E094 [PASS; archive and restore workflow]: Archived synthetic Browser QA, Chat and rendering from menu; appeared in Archived chats. Restore returned named success status and list became empty. No user conversation deleted.
- **Where to find it:** Settings > Privacy > Archived chats > Manage (labels found in the code)
- **Needs:** a test account with a disposable archived chat
- **Steps:**
  1. Archive one test chat from the sidebar.
  2. Open Settings > Privacy and click Manage next to Archived chats.
  3. Find the test chat in the list and click Restore; check it returns to the sidebar.
  4. Archive it again, click Delete, confirm Delete chat, and check it moves to Recently deleted.
  5. Compare the list with the copy: restored chats return to the sidebar, deleted ones stay in Recently deleted for 30 days.

## S85.18 Delete all chats.

- **Expected:** One action deletes every chat in the user's history (active and archived) after confirmation, and the copy states truthfully whether they can be restored.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:303 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:668 (quoted code not found in the file now); apps/web/features/settings/services/conversation-data-service.ts:181 (quoted code not found in the file now); apps/web/app/api/chat/conversations/bulk/route.ts (text found, layout changed)
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed.
- **Where to find it:** Settings > Privacy > Delete all chats in this workspace > Delete all (labels found in the code)
- **Needs:** a disposable test account only; this deletes every chat
- **Steps:**
  1. Open Settings from the account menu and click Privacy.
  2. Find Delete all chats in this workspace and click Delete all.
  3. Read the dialog title and copy, which say whether chats can be restored from Recently deleted within 30 days.
  4. Click Cancel unless you are on a disposable test account.
  5. If you confirm on a test account, check the sidebar and the archived list are empty afterwards.

## S85.19 Shared-link management.

- **Expected:** The user can list the chat links (and published pages) they have shared and revoke any of them.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:289; apps/web/features/settings/sections/SharedLinksSection.tsx:82 (quoted code not found in the file now); apps/web/features/settings/services/conversation-data-service.ts:194 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed.
- **Where to find it:** Settings > Privacy > Shared links > Manage (labels found in the code)
- **Needs:** a test chat that has a shared link
- **Steps:**
  1. Open Settings from the account menu and click Privacy.
  2. Click Manage next to Shared links.
  3. Find a test shared link and click Revoke.
  4. Read the dialog Revoke this public link? and click Revoke link.
  5. Check the link is gone from the list and that the shared page no longer opens.

## S85.20 Data export.

- **Expected:** The user can download a copy of their account data (chats, memory, files, settings) from the surface.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed.
- **Where to find it:** Settings > Privacy > Export data (labels found in the code)
- **Needs:** none; the export can take a while
- **Steps:**
  1. Open Settings from the account menu and click Privacy.
  2. Find Export data and click it.
  3. Wait while the status shows Preparing, then click Download your export.
  4. Open the downloaded file.
  5. Check it contains chats, memory, files and settings as described in Expected.

## S85.22 Import Memory.

- **Expected:** The user can import memories exported from another assistant and they become saved memories.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:205 (quoted code not found in the file now); apps/web/features/settings/components/ImportMemoryDialog.tsx:84 (quoted code not found in the file now); apps/web/app/api/memory/import/route.ts:192
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Memory > Import memory from other AI providers > Start import (labels found in the code)
- **Needs:** a memory export file or pasted text from another assistant
- **Steps:**
  1. Open Settings from the account menu and click Personalization.
  2. Scroll to Import memory from other AI providers and click Start import.
  3. Choose a source (ChatGPT, Claude, Gemini, Copilot or Other), then choose Paste memories or Upload file and add the export.
  4. Click Import to add the selected memories.
  5. Check the message Imported N memories from the source and find the new entries in the memory list.

## S85.26 Delete account.

- **Expected:** The user can delete their account (and its data) from the surface after an explicit confirmation.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:186 (quoted code not found in the file now); apps/web/features/settings/sections/AccountSection.tsx:545; apps/web/features/settings/hooks/use-settings-queries.ts:436 (quoted code not found in the file now); apps/web/app/api/user/delete-account/route.ts:617
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed. | E014 [UI_ONLY; visible UI]: Account view displays provider sessions and account actions. No sign-out, revocation, key creation or deletion performed.
- **Where to find it:** Settings > Account > Delete account (labels found in the code)
- **Needs:** a disposable test account only
- **Steps:**
  1. Open Settings from the account menu and click Account.
  2. Click Delete account and read the dialog Delete your account?.
  3. Type DELETE in the confirmation box.
  4. Click Schedule deletion only on a disposable test account.
  5. Check the Account deletion scheduled row and use Cancel deletion to undo it.
