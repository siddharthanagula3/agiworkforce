---
id: "PLAN-mobile-085"
type: "test-plan"
title: "Mobile · 85. Personalization and data settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "85"
---
# Mobile · 85. Personalization and data settings

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S85.01 Profile details.

- **Expected:** The user can view and edit their account profile (name, photo, email) on the surface, and the change is saved to the account.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:426; apps/mobile/src/features/settings/index.tsx:375
- **Where to find it:** Settings > Account > Email (Cloud mode, signed in). Photo: the badge "Change profile photo" on the top Settings card. Local name: Settings > Assistant > Personalization > Full Name (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and Cloud mode; a photo to choose
- **Steps:**
  1. Sign in and switch the mode toggle at the top of Settings to Cloud.
  2. Open Settings > Account > Email. Tap the name under the avatar (accessible name "Edit display name"), type a new name and tap Save.
  3. Back on the top Settings card, tap the photo badge ("Change profile photo") and choose a picture.
  4. Check the name and photo on the top Settings card and on the Email screen match your change. Tap the Email row and check it starts an email-change flow, not a direct save.

## S85.02 Custom instructions.

- **Expected:** The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/personalization.tsx:1; apps/mobile/src/features/settings/personalization/index.tsx:566; apps/mobile/services/cloudSettingsMapping.ts:141; apps/web/lib/server/user-identity.ts:250; apps/mobile/stores/chat/chatExecutionStore.ts:2815
- **Where to find it:** Settings > Assistant > Personalization > Custom Instructions (labels found in the code)
- **Needs:** none (Local mode works; Cloud needs a signed-in account)
- **Steps:**
  1. Open Settings > Assistant > Personalization.
  2. Tap the field "Custom Instructions" and type a rule, for example "Answer in one short paragraph".
  3. Tap Save at the top right.
  4. Start a new chat, ask a question, and check the reply follows the rule. Clear the field, tap Save, and check the next reply no longer follows it.

## S85.03 Communication style.

- **Expected:** The user can choose how the assistant communicates (tone, length, formatting) on the surface and replies follow it.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/personalization/index.tsx:637; apps/mobile/services/cloudSettingsMapping.ts:143; apps/web/lib/server/user-identity.ts:271; apps/mobile/stores/chat/chatExecutionStore.ts:2815
- **Where to find it:** Settings > Assistant > Personalization > Style Preset, Response Length, Technical Level, Response Language (labels found in the code)
- **Steps:**
  1. Open Settings > Assistant > Personalization.
  2. Change "Style Preset" and "Response Length", and "Technical Level" if you want.
  3. Tap Save at the top right.
  4. Start a new chat, ask the same question twice with different settings, and compare the tone, length and formatting with Expected.

## S85.05 Saved Memory.

- **Expected:** The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:125; apps/mobile/services/preferences.ts:81
- **Where to find it:** Settings > Assistant > Memory (labels found in the code)
- **Steps:**
  1. Open Settings > Assistant > Memory.
  2. Turn the "Memory" switch on. Tap the control whose accessible name is "Add memory" and type a fact, then save it.
  3. Start a new chat and ask something that uses that fact; check the reply uses it.
  4. Edit or delete the memory from the list, turn "Memory" off, ask again, and compare with Expected.

## S85.06 Past-chat reference.

- **Expected:** The user can let the assistant search or reference their other chats when answering, and switch it off; temporary chats are never referenced.
- **Code:** done. Evidence present: apps/mobile/services/cloudSettingsMapping.ts:250; apps/mobile/services/cloudSettingsMapping.ts:167
- **Where to find it:** Settings > Assistant > Memory > Search and reference chats (labels found in the code)
- **Needs:** at least one earlier chat with known content
- **Steps:**
  1. Open Settings > Assistant > Memory.
  2. Turn on "Search and reference chats".
  3. In a new chat, ask about a topic from an older chat and check the reply refers to it.
  4. Turn "Search and reference chats" off, ask again, and compare. Check a Temporary Chat is not referenced.

## S85.11 Activity-history preference.

- **Expected:** The user can choose whether their chats are kept in history (and synced to the account) or not saved.
- **Code:** done. Evidence present: apps/web/app/api/search/route.ts:324; apps/web/app/api/search/route.ts:375; apps/web/lib/services/retrieval-search-service.ts:270; apps/web/lib/hooks/useConversations.ts:648; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:80; apps/web/lib/server/persist-free-offering-user.ts:33; apps/web/shared/components/CommandPalette/CommandPalette.tsx:122; apps/web/app/api/projects/route.ts:110; apps/web/app/api/projects/[id]/route.ts:63
- **Where to find it:** Settings > Device > General > Temporary Chat (labels found in the code)
- **Steps:**
  1. Open Settings > Device > General.
  2. Turn "Temporary Chat" on, then start a new chat and send a message.
  3. Open the chat list and check the chat is not saved there.
  4. Turn "Temporary Chat" off, send another message and check that chat is saved.

## S85.12 Training/improvement choice.

- **Expected:** The user can choose whether their content may be used to train or improve models.
- **Code:** done. Evidence gone: apps/mobile/src/features/settings/cloud-privacy/ProviderTrainingOptOutGroup.tsx:41 (file no longer exists); apps/mobile/src/features/settings/cloud-privacy/index.tsx:162 (quoted code not found in the file now)
- **Owner decision is open on this item.**
- **Where to find it:** Settings > Assistant > Privacy (Cloud mode, signed in), section "Model training" (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and Cloud mode
- **Steps:**
  1. Switch to Cloud mode and make sure you are signed in.
  2. Open Settings > Assistant > Privacy and scroll to the section "Model training".
  3. Check the row "Only use models that do not train on your chats" and the "Use my chats" and "Use my voice" rows under the improvement heading.
  4. Turn a row on or off and check it saves and stays after reopening the screen. Compare with Expected.

## S85.16 Temporary-chat preferences.

- **Expected:** The user can make new chats temporary by default (not saved, not used for memory) and the preference is honoured.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:4416; apps/web/lib/server/persist-free-offering-user.ts:33
- **Where to find it:** Settings > Device > General > Temporary Chat (labels found in the code)
- **Steps:**
  1. Open Settings > Device > General and turn "Temporary Chat" on.
  2. Start a new chat and send a message, then check it is not in the chat list.
  3. Ask in that chat what you remember about the user and check no saved memory is used.
  4. Turn "Temporary Chat" off and compare the next new chat.

## S85.17 Archived-chat management.

- **Expected:** The user can list archived chats, restore them, and delete them.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/archived-chats.tsx:128 (quoted code not found in the file now); apps/mobile/src/features/archived-chats/service.ts:69 (quoted code not found in the file now)
- **Where to find it:** Settings > Cloud > Archived Chats (Cloud mode, signed in) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least two archived chats
- **Steps:**
  1. Switch to Cloud mode and sign in.
  2. Open Settings > Cloud > Archived Chats.
  3. Tap "Restore" on one chat, then open the chat list (refresh if needed) and check it is back.
  4. Tap "Delete" on another archived chat and confirm "Delete this chat?". Check it leaves the list.

## S85.18 Delete all chats.

- **Expected:** One action deletes every chat in the user's history (active and archived) after confirmation, and the copy states truthfully whether they can be restored.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/data-controls/index.tsx:189 (quoted code not found in the file now); apps/mobile/src/features/archived-chats/service.ts:27 (quoted code not found in the file now)
- **Where to find it:** Settings > Data Controls > Chat history > Delete all chats (cloud), or Settings > Data Controls > Local chats > Delete all chats (this device) (labels found in the code)
- **Needs:** a test account with several chats, some archived
- **Steps:**
  1. Open Settings > Data Controls.
  2. Under "Chat history", tap "Delete all chats". Read the alert "Delete all chats?" and check it says archived chats are included and that the cloud copy says restorable on the web for 30 days.
  3. Confirm through the second prompt ("Are you absolutely sure?" then "Yes, delete all chats").
  4. Check the chat list and Archived Chats are empty. Use a test account only.

## S85.19 Shared-link management.

- **Expected:** The user can list the chat links (and published pages) they have shared and revoke any of them.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/shared-links.tsx:82 (quoted code not found in the file now); apps/mobile/src/features/shared-links/service.ts:43 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Shared Links (Cloud mode, signed in) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with at least one shared chat
- **Steps:**
  1. Switch to Cloud mode and sign in.
  2. Open Settings > Account > Shared Links and check the list of shared links.
  3. Tap "Revoke" on one link and confirm "Revoke this link?" > "Revoke".
  4. Check the link now shows as revoked or gone, and that opening it no longer works.

## S85.20 Data export.

- **Expected:** The user can download a copy of their account data (chats, memory, files, settings) from the surface.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-account/index.tsx:916; apps/mobile/src/features/settings/cloud-account/index.tsx:510; apps/mobile/services/cloudDataExport.ts:28 (quoted code not found in the file now)
- **Where to find it:** Settings > Data Controls > Local data > Export Local Data (this device), or Settings > Data Controls > AGI Cloud account > Export Cloud data (cloud) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account for the cloud export
- **Steps:**
  1. Open Settings > Data Controls and tap "Export Local Data". Wait until "Exporting…" finishes.
  2. Save or share the file it offers and open it.
  3. For cloud, go to Settings > Data Controls > AGI Cloud account > Export Cloud data, tap "Export Cloud Data" and save the file.
  4. Open the file and check it holds chats, memory, files and settings, as in Expected.

## S85.22 Import Memory.

- **Expected:** The user can import memories exported from another assistant and they become saved memories.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/memory.tsx:348; apps/mobile/app/(app)/settings/memory-import.tsx:128 (quoted code not found in the file now)
- **Where to find it:** Settings > Assistant > Memory > upload icon (accessible name "Import memories", shown only when Memory is on) (labels found in the code)
- **Needs:** a text or JSON file with memories from another assistant
- **Steps:**
  1. Open Settings > Assistant > Memory with Memory on.
  2. Tap the upload control (accessible name "Import memories").
  3. Choose a text or JSON file, or paste text, then tap "Preview" and select the memories.
  4. Tap the import button ("Import N memories") and check the memories appear in the Memory list.

## S85.23 Clear local storage.

- **Expected:** The user can wipe the data the app keeps on this device (local chats, cache, settings) from within the app.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/storage.tsx:173 (quoted code not found in the file now); apps/mobile/app/(app)/settings/storage.tsx:528; apps/mobile/services/dsarExport.ts:447
- **Where to find it:** Settings > Device > Storage > Delete everything ("Clear cache" is separate) (labels found in the code)
- **Needs:** a test device with local data
- **Steps:**
  1. Open Settings > Device > Storage.
  2. Tap "Delete everything" and read the confirmation, which lists conversations, memory, settings and downloaded models.
  3. Confirm only on a test device. Check that the chats, memory and settings are gone after the wipe.
  4. Use "Clear cache" separately and check it only removes temporary files.

## S85.26 Delete account.

- **Expected:** The user can delete their account (and its data) from the surface after an explicit confirmation.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-account/index.tsx:182 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-account/index.tsx:1003
- **Where to find it:** Settings > Data Controls > AGI Cloud account > Delete account (signed in), then the Delete Account row (labels found in the code)
- **Needs:** a signed-in test AGI Cloud account
- **Steps:**
  1. Sign in and open Settings > Data Controls.
  2. Tap "Delete account" under "AGI Cloud account". On the next screen tap "Delete Account" under "Your AGI Cloud data".
  3. Read the "Delete Account" confirmation (scheduled deletion, sign in to cancel before the deadline, export first) and tap Cancel to stop.
  4. Check the result. Do not confirm on a real account.
