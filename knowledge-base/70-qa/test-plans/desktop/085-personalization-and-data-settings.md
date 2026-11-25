---
id: "PLAN-desktop-085"
type: "test-plan"
title: "Desktop · 85. Personalization and data settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "85"
---
# Desktop · 85. Personalization and data settings

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S85.01 Profile details.

- **Expected:** The user can view and edit their account profile (name, photo, email) on the surface, and the change is saved to the account.
- **Code:** done. Evidence present: apps/web/features/settings/components/WebSettingsModal.tsx:262; apps/web/features/settings/sections/GeneralSection.tsx:242; apps/web/app/settings/_lib/preferences-client.ts:284; apps/web/app/api/me/route.ts:441
- **Where to find it:** Settings > General > Full name (email is under Settings > Account) (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Sign in, press ⌘, or open Settings, and click General.
  2. In the Full name box, change the name and click Save profile.
  3. Wait for the word Saved, then reload the page.
  4. Check the new name is still shown. Open Account and check the email row is there, then compare with Expected (name, photo, email).

## S85.02 Custom instructions.

- **Expected:** The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.
- **Code:** done. Evidence moved: apps/web/app/api/models/free-quota/completions/route.ts:595 (quoted code not found in the file now); apps/web/lib/services/turn-context-service.ts:338; apps/web/features/models/lib/free-offering-request.ts:69 (quoted code not found in the file now); apps/web/features/chat/components/Composer/FreeQuotaModelSection.tsx:118 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Instructions for AGI (labels found in the code)
- **Steps:**
  1. Open Settings and click Personalization.
  2. Scroll to the heading Instructions for AGI and type text in the box under it (a counter shows the character limit).
  3. Make sure the switch beside Apply instructions for AGI is on.
  4. Start a new chat, send a message, and check the reply follows the instruction.
  5. Turn the switch off, send another message, and check the instruction no longer applies.

## S85.03 Communication style.

- **Expected:** The user can choose how the assistant communicates (tone, length, formatting) on the surface and replies follow it.
- **Code:** done. Evidence moved: apps/web/lib/services/turn-context-service.ts:338; apps/web/lib/server/user-identity.ts:250; apps/web/app/api/models/free-quota/completions/route.ts:595 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Style and tone (Response style, Response length, Characteristics) (labels found in the code)
- **Steps:**
  1. Open Settings and click Personalization.
  2. Under the heading Style and tone, open Response style and pick a value; then open Response length and pick a value.
  3. Under Characteristics, change Warmth or Headers and lists if you want.
  4. Start a new chat, send the same question, and compare the reply's tone, length and formatting with the choices.
  5. Click Reset response style to undo the changes and check the reply changes back.

## S85.04 Writing-style personalization.

- **Expected:** The user can give the assistant a sample of their own writing (or a named custom style) and replies imitate that writing style.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/StyleSelector.tsx:155; apps/web/features/chat/stores/style-store.ts:378; apps/web/lib/hooks/useChatStream.ts:4534
- **Where to find it:** Chat composer > Response style > Create Custom Style (labels found in the code)
- **Needs:** a sample of your own writing
- **Steps:**
  1. Open a chat and click the Response style control in the message box.
  2. Click Create Custom Style.
  3. Enter a name, paste a sample of your own writing, and add an instruction, then save.
  4. Select the new style, send a message, and compare the reply with your sample's style.
  5. Open the same menu and check the style is still listed, and that Edit and Delete work for it.

## S85.05 Saved Memory.

- **Expected:** The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.
- **Code:** done. Evidence moved: apps/web/lib/services/turn-context-service.ts:338; apps/web/app/api/models/free-quota/completions/route.ts:606 (quoted code not found in the file now); apps/web/features/models/lib/free-offering-request.ts:69 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Persistent memory (labels found in the code)
- **Steps:**
  1. Open Settings and click Personalization.
  2. Under Memory, check the switch labelled Persistent memory.
  3. In the memory editor, type in the box labelled Add a new fact and add a fact; use the Search memory box to find it.
  4. Edit a fact, then delete one and confirm in the dialog Delete this memory? (button Delete memory).
  5. Turn Persistent memory off, start a chat, and check the saved facts are not used; compare with Expected.

## S85.06 Past-chat reference.

- **Expected:** The user can let the assistant search or reference their other chats when answering, and switch it off; temporary chats are never referenced.
- **Code:** done. Evidence moved: apps/web/lib/services/turn-context-service.ts:338; apps/web/app/api/models/free-quota/completions/route.ts:606 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Search past chats (labels found in the code)
- **Needs:** at least one earlier saved chat
- **Steps:**
  1. Open Settings and click Personalization.
  2. Under Memory, find the switch labelled Search past chats and turn it on.
  3. Start a chat, ask about something you discussed in an earlier chat, and check the reply uses it.
  4. Turn Search past chats off, ask the same question in a new chat, and check the earlier chat is no longer used.
  5. Start a temporary chat and check it is not used for references; compare with Expected.

## S85.07 Project Memory preferences.

- **Expected:** The user can choose, per project, whether project chats also use account-wide memories or only that project's memories.
- **Code:** done. Evidence present: apps/web/features/projects/components/ProjectSettingsDialog.tsx:393; apps/web/features/projects/components/ProjectSettingsDialog.tsx:78; apps/web/app/api/projects/[id]/route.ts:186; apps/web/lib/services/managed-memory-context-service.ts:1270
- **Where to find it:** Projects > open a project > project settings > Memory > Use memories from outside this project (labels found in the code)
- **Needs:** a project you own
- **Steps:**
  1. Click Projects in the sidebar and open a project.
  2. Open the project's settings dialog.
  3. Under Memory, tick or untick Use memories from outside this project.
  4. Click save in the dialog, then start a chat inside the project.
  5. Compare: ticked means account memories are used too; unticked means only this project's memories.

## S85.10 Browsing-context preference.

- **Expected:** The user controls which websites or browser the assistant may read or act in, and can revoke that access.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:92; apps/desktop/electron/runtime/dispatcher.ts:3131
- **Where to find it:** Settings > Capabilities > Chrome (labels found in the code)
- **Needs:** the Desktop app on a Mac and Chrome with the extension installed
- **Steps:**
  1. Open Settings and click Capabilities.
  2. Find the Chrome section and read its status (Install extension, Paired and answering, or Paired, not answering right now).
  3. Click Unpair this browser? and confirm in the dialog.
  4. Check the status changes to not paired.
  5. Per-site permission is set inside the Chrome extension, not here; compare with Expected.

## S85.11 Activity-history preference.

- **Expected:** The user can choose whether their chats are kept in history (and synced to the account) or not saved.
- **Code:** done. Evidence present: apps/web/app/api/search/route.ts:324; apps/web/app/api/search/route.ts:375; apps/web/lib/services/retrieval-search-service.ts:270; apps/web/lib/hooks/useConversations.ts:648; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:80; apps/web/lib/server/persist-free-offering-user.ts:33; apps/web/shared/components/CommandPalette/CommandPalette.tsx:122; apps/web/app/api/projects/route.ts:110; apps/web/app/api/projects/[id]/route.ts:63
- **Where to find it:** not found in the code. Searched apps/web/features/settings and the composer for chat history, Save chat history, keep chats and history toggles; found no control. Closest is Start new chats as temporary in Settings > Privacy.

## S85.12 Training/improvement choice.

- **Expected:** The user can choose whether their content may be used to train or improve models.
- **Code:** done. Evidence moved: apps/web/lib/server/side-call-training-policy.ts:31 (quoted code not found in the file now); apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:153 (quoted code not found in the file now); apps/web/lib/services/model-memory-extraction.ts:105 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4696
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Privacy > Help improve AGI models > Use my chats and Use my voice (labels found in the code)
- **Steps:**
  1. Open Settings and click Privacy.
  2. Scroll to the section headed Help improve (product name) models.
  3. Read the note under the toggles, then check the switches Use my chats and Use my voice are off by default.
  4. Turn one on, reload, and check it stays on; turn it off again.
  5. Also check Only use models that do not train on your chats, under the Privacy list; compare with Expected.

## S85.14 Diagnostic-sharing choice.

- **Expected:** The user can choose whether crash reports and diagnostics are sent, and the choice is honoured.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:51 (quoted code not found in the file now); apps/web/lib/sentry-shared.ts:94
- **Where to find it:** Settings > Privacy > Share crash and error reports (labels found in the code)
- **Steps:**
  1. Open Settings and click Privacy.
  2. Find the switch labelled Share crash and error reports, which is off by default.
  3. Turn it on, reload the page, and check it stays on; then turn it off and reload.
  4. Compare the switch with its saved state; the code that reads it is in apps/web/lib/sentry-shared.ts and was not run.

## S85.16 Temporary-chat preferences.

- **Expected:** The user can make new chats temporary by default (not saved, not used for memory) and the preference is honoured.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:4416; apps/web/lib/server/persist-free-offering-user.ts:33
- **Where to find it:** Settings > Privacy > Start new chats as temporary (labels found in the code)
- **Steps:**
  1. Open Settings and click Privacy.
  2. Turn on the switch Start new chats as temporary.
  3. Click New chat, send a message, and check the chat is marked temporary.
  4. Check the chat is not in the sidebar history after the reply.
  5. Turn the switch off and start a new chat; compare with Expected.

## S85.17 Archived-chat management.

- **Expected:** The user can list archived chats, restore them, and delete them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/ArchivedChatsSection.tsx:110 (quoted code not found in the file now); apps/web/features/settings/services/conversation-data-service.ts:131 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > Archived chats > Manage (labels found in the code)
- **Needs:** at least one archived chat (archive one from the sidebar first)
- **Steps:**
  1. Open Settings, click Privacy, and find Archived chats; click Manage.
  2. Read the list under Archived chats; each chat row offers Restore.
  3. Click Restore on one chat and check it returns to the sidebar.
  4. Archive another chat, open Delete all archived or delete one chat, read the dialog, and confirm.
  5. Check the chat moves to Recently deleted for 30 days.

## S85.18 Delete all chats.

- **Expected:** One action deletes every chat in the user's history (active and archived) after confirmation, and the copy states truthfully whether they can be restored.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/PrivacySection.tsx:303 (quoted code not found in the file now); apps/web/features/settings/services/conversation-data-service.ts:181 (quoted code not found in the file now); apps/web/app/api/chat/conversations/bulk/route.ts (text found, layout changed)
- **Where to find it:** Settings > Privacy > Delete all chats in this workspace > Delete all (labels found in the code)
- **Needs:** a test account with several chats (destructive)
- **Steps:**
  1. Open Settings and click Privacy.
  2. Scroll to the row Delete all chats in this workspace and click Delete all.
  3. Read the dialog and its confirm button Delete all chats; check it says chats can be restored from Recently deleted within 30 days.
  4. Cancel first and check nothing changed; then, only with a test account, confirm and check the list is empty.

## S85.19 Shared-link management.

- **Expected:** The user can list the chat links (and published pages) they have shared and revoke any of them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/SharedLinksSection.tsx:82 (quoted code not found in the file now); apps/web/features/settings/services/conversation-data-service.ts:194 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > Shared links > Manage, then Revoke (labels found in the code)
- **Needs:** an account with a shared chat link (create one from a chat first)
- **Steps:**
  1. Open Settings, click Privacy, find Shared links and click Manage.
  2. Read the list under Shared links, which shows the title and Anyone with the link or Workspace only.
  3. Click Revoke on one link, read the dialog Revoke this public link?, and click Revoke link.
  4. Open the old link in a private window and check it no longer opens; the list should drop the row.

## S85.20 Data export.

- **Expected:** The user can download a copy of their account data (chats, memory, files, settings) from the surface.
- **Code:** done. Evidence present: apps/web/features/settings/sections/PrivacySection.tsx:817; apps/web/features/settings/components/DataExportRow.tsx:9
- **Where to find it:** Settings > Privacy > Export data (labels found in the code)
- **Needs:** an account with some chats or memories
- **Steps:**
  1. Open Settings and click Privacy.
  2. Click Export data and wait for the label Preparing to finish.
  3. When Download your export appears, click it to save the archive.
  4. Open the archive and check it holds chats, memory, files and settings; compare with Expected.

## S85.22 Import Memory.

- **Expected:** The user can import memories exported from another assistant and they become saved memories.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:205 (quoted code not found in the file now); apps/web/features/settings/components/ImportMemoryDialog.tsx:84 (quoted code not found in the file now); apps/web/app/api/memory/import/route.ts:192
- **Where to find it:** Settings > Personalization > Memory > Import memory from other AI providers > Start import (labels found in the code)
- **Needs:** a memory export file from another assistant
- **Steps:**
  1. Open Settings and click Personalization.
  2. Under Memory, click Start import next to Import memory from other AI providers.
  3. In the dialog, upload a memory export file (Upload a memory export file), then select the memories to import.
  4. Confirm the import and check the new memories appear in the memory list (Memory facts).
  5. Compare with Expected; the final confirm button label was not read in the code.

## S85.26 Delete account.

- **Expected:** The user can delete their account (and its data) from the surface after an explicit confirmation.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/AccountSection.tsx:545; apps/web/features/settings/hooks/use-settings-queries.ts:436 (quoted code not found in the file now); apps/web/app/api/user/delete-account/route.ts:617
- **Where to find it:** Settings > Account > Delete account (labels found in the code)
- **Needs:** a disposable test account (scheduling deletion cannot be undone before the deadline)
- **Steps:**
  1. Open Settings and click Account.
  2. Scroll to the row Delete account and click it.
  3. Read the dialog Delete your account?; it says deletion is scheduled and can be cancelled before the deadline.
  4. Type DELETE in the box, then click Schedule deletion only on a disposable account; otherwise cancel.
  5. Compare with Expected: an explicit confirmation is required before scheduling.
