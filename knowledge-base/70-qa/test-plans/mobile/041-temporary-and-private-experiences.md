---
id: "PLAN-mobile-041"
type: "test-plan"
title: "Mobile · 41. Temporary and private experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "41"
---
# Mobile · 41. Temporary and private experiences

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S41.01 Temporary-chat entry.

- **Expected:** The user can start a temporary chat (or make new chats temporary by default) from the chat surface.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:1255; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:28 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:1974
- **Where to find it:** Chat screen (new chat) > top-right "Temporary" control (eye-off icon) > "Turn on temporary chat?" > Turn on (labels found in the code)
- **Steps:**
  1. Open the chat screen with no conversation selected.
  2. Tap the eye-off icon at the top right of the header.
  3. Read the alert "Turn on temporary chat?" and tap Turn on.
  4. Look for the "Temporary" label with a purple background in the header; compare with Expected.

## S41.02 Visible temporary-mode banner.

- **Expected:** While a chat is temporary, a visible indicator says so for as long as the chat is open.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:1255; apps/mobile/src/features/chat/components/TemporaryChatToggle.tsx:28 (quoted code not found in the file now); apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:40 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:2481; apps/mobile/stores/chat/chatMessageStore.ts:1974
- **Where to find it:** Chat screen > top-right "Temporary" control > Turn on, then open a chat thread: the explainer banner appears under the header (labels found in the code)
- **Steps:**
  1. Turn on temporary chat from the header control on the new chat screen.
  2. Send a message, then open that chat so the chat thread screen shows.
  3. Look at the purple strip under the header with the explainer text.
  4. Leave the chat and return to it; check whether the header "Temporary" label stays while the chat is open.

## S41.03 History-persistence explanation.

- **Expected:** The product explains accurately what is and is not kept from a temporary chat, and the explanation matches what happens.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:40 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:2481; apps/mobile/src/features/chat/utils/conversationMode.ts:37; apps/mobile/stores/chat/chatMessageStore.ts:1737
- **Where to find it:** Chat screen > top-right "Temporary" control > read the alert text "Turn on temporary chat?"; in a chat thread, tap "Learn more" in the banner (labels found in the code)
- **Needs:** a Free or paid account; the cloud text appears in Cloud mode, the local text in Local mode
- **Steps:**
  1. Tap the eye-off control on the new chat screen to open the "Turn on temporary chat?" alert.
  2. Read the explanation text in the alert.
  3. Turn on temporary chat, open a chat thread, and read the banner text.
  4. Tap "Learn more" and check the Privacy screen that opens against the banner text.

## S41.04 Memory-read choice where offered.

- **Expected:** Where offered, the user can choose whether a temporary chat may read saved memory, and the choice is honoured.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:1410 (quoted code not found in the file now); apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:9 (quoted code not found in the file now)
- **Where to find it:** Chat thread with temporary chat on > banner under header > "Personalized" switch (Cloud mode only) (labels found in the code)
- **Needs:** a signed-in account in Cloud mode; a Free account may not show the switch
- **Steps:**
  1. In Cloud mode, turn on temporary chat and open a chat thread so the banner shows.
  2. Look at the line under the explainer: "Personalized" or "Unpersonalized" with a switch.
  3. Switch it, then send a message in the temporary chat.
  4. Compare the reply with Expected: the switch controls profile, instructions and response style, not memory.

## S41.05 Memory-write exclusion.

- **Expected:** Nothing from a temporary chat is saved to memory.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatExecutionStore.ts:3384
- **Where to find it:** no screen of its own.
- **Needs:** a Free or paid account
- **Steps:**
  1. Open Settings > Memory and note the count shown under the list.
  2. Turn on temporary chat, send a message that states a personal fact, and wait for the reply.
  3. Go back to Settings > Memory and compare the count with the one you noted.
  4. Open "Memory summary" and check that the new fact is not listed.

## S41.06 Custom-instruction choice.

- **Expected:** The user can choose whether custom instructions apply in a temporary chat.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:17; apps/mobile/stores/chat/chatExecutionStore.ts:3454
- **Where to find it:** Chat thread with temporary chat on > banner under header > "Personalized" switch (Cloud mode only) (labels found in the code)
- **Needs:** a signed-in account in Cloud mode and saved custom instructions
- **Steps:**
  1. In Cloud mode, turn on temporary chat and open a chat thread.
  2. Set the banner switch to "Unpersonalized".
  3. Ask a question that depends on your saved instructions or profile.
  4. Compare the answer with Expected: it should ignore custom instructions while the switch is off.

## S41.08 File-retention explanation.

- **Expected:** The product explains what happens to files attached in a temporary chat and for how long they are kept.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/TemporaryChatBanner.tsx:9 (quoted code not found in the file now); apps/mobile/src/features/chat/upload/uploadAttachment.ts:86; apps/mobile/src/features/chat/components/ChatInput.tsx:499 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > Chat privacy (footnote under the retention group); temporary-chat banner in a chat thread (labels found in the code)
- **Needs:** a file to upload; a Free or paid account
- **Steps:**
  1. Turn on temporary chat, open a chat thread and read the banner text.
  2. Go to Settings > Privacy > Chat privacy.
  3. Read the footnote under the group with "Shared links" and "Archived chats" (Cloud mode) and "Delete all chats".
  4. Attach a file in a temporary chat and compare what the app says about how long it is kept with Expected.

## S41.14 Local-only conversation.

- **Expected:** The user can keep conversations only on their device, never uploaded to the account.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-privacy/index.tsx:38 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:1737; apps/mobile/src/features/chat/store/appModeStore.ts:62; apps/mobile/src/features/chat/utils/conversationMode.ts:37
- **Where to find it:** Side menu (drawer) or Settings > top segmented control "Local" / "Cloud" > choose Local (labels found in the code)
- **Needs:** none for Local mode; a signed-in account to compare with Cloud
- **Steps:**
  1. Open the side menu from the top left of the chat screen, or open Settings.
  2. Tap the "Local" segment of the Local / Cloud control.
  3. Start a new chat, send a message, and check that it is kept on this device.
  4. Open Settings > Privacy and read "Local chats stay on this device unless you sync them." and compare with Expected.

## S41.16 Local-only Memory.

- **Expected:** The user can keep memory only on the device, never stored in the account.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/memory-summary.tsx:44 (quoted code not found in the file now); apps/mobile/storage/memory.ts:39; apps/mobile/src/features/chat/store/appModeStore.ts:62; apps/mobile/src/features/memory/services/consolidation.ts:73
- **Where to find it:** Settings > Memory > Local segment (Local / Cloud) > Memory summary, which says "Stored on this device only." (labels found in the code)
- **Steps:**
  1. Switch to Local mode with the Local / Cloud control.
  2. Open Settings > Memory.
  3. Read the scope line under the list; expect "Stored on this device only."
  4. Open "Memory summary" and read the info card: "On-device memory".

## S41.17 Clear local data.

- **Expected:** One action clears all data the app keeps on this device.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/storage.tsx:172 (quoted code not found in the file now); apps/mobile/app/(app)/settings/storage.tsx:194 (quoted code not found in the file now)
- **Where to find it:** Settings > Storage > scroll to "Danger Zone" > "Delete everything" (labels found in the code)
- **Needs:** a throwaway install or test account; this is destructive
- **Steps:**
  1. Open Settings > Storage and scroll to the bottom.
  2. Tap "Delete everything" under "Danger Zone".
  3. Read the alert "Delete all local data?", then tap "Delete Everything" and read the second alert.
  4. Compare the result with Expected: the app should wipe local data, sign out and return to onboarding.

## S41.18 Separate history, training, and retention controls.

- **Expected:** History, model training and data retention each have their own clearly separate control or statement.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-privacy/index.tsx:32; apps/mobile/src/features/settings/cloud-privacy/index.tsx:43
- **Where to find it:** Settings > Privacy: "Model training", "Telemetry off by default", "Data retention" card; "Chat privacy" > "Temporary Chat" and "Delete all chats" (labels found in the code)
- **Needs:** a signed-in account in Cloud mode for the training controls; "Data retention" card only in Cloud mode
- **Steps:**
  1. Open Settings > Privacy and read the three cards under "Our approach to privacy".
  2. Open Settings > Privacy > Chat privacy and see "Temporary Chat" as its own switch.
  3. Back on Settings > Privacy, scroll to "AGI Cloud privacy controls" in Cloud mode.
  4. Check that training choices ("Use my chats", "Use my voice") are listed apart from history and retention, and compare with Expected.

## S41.19 Privacy-setting education.

- **Expected:** The product explains, in context, what each privacy setting does.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-privacy/index.tsx:38 (quoted code not found in the file now); apps/mobile/src/features/settings/index.tsx:572 (quoted code not found in the file now); apps/mobile/src/features/chat/utils/conversationMode.ts:37
- **Where to find it:** Settings > Privacy: each card under "Our approach to privacy" has its own explanation line; "Chat privacy" > "Temporary Chat" footnote (labels found in the code)
- **Needs:** none for the Privacy cards; a signed-in Cloud account for the personalization switch
- **Steps:**
  1. Open Settings > Privacy and read the body text under "Model training", "Telemetry off by default" and "Data retention".
  2. Open Settings > Privacy > Chat privacy and read the footnote under "Temporary Chat".
  3. Turn on temporary chat, open a chat thread and read the "Personalized" hint.
  4. Compare each explanation with what the switch or setting does, against Expected.

## S41.20 Per-feature processing-location disclosure.

- **Expected:** For each feature the product says where the data is processed (on device, AGI cloud, a named provider).
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-privacy/index.tsx:33 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-privacy/index.tsx:123 (quoted code not found in the file now)
- **Where to find it:** Settings > Privacy > "Data use & access" > scroll to "Where each feature processes your data" (labels found in the code)
- **Steps:**
  1. Open Settings > Privacy and tap "Data use & access".
  2. Scroll to "Where each feature processes your data".
  3. Read each feature row, starting with "Chat in Local Mode" and "Chat in AGI Cloud".
  4. Compare the listed place (on this device, AGI Cloud, or the named provider) with Expected.
