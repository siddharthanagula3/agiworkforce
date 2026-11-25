---
id: "PLAN-mobile-039"
type: "test-plan"
title: "Mobile · 39. Memory product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "39"
---
# Mobile · 39. Memory product

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S39.02 Memory enable/disable control.

- **Expected:** A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories.
- **Code:** done. Evidence moved: apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:64; apps/mobile/app/(app)/profile/index.tsx:199; apps/mobile/stores/chat/chatExecutionStore.ts:1364 (quoted code not found in the file now); apps/mobile/services/cloudSettingsMapping.ts:133 (quoted code not found in the file now)
- **Where to find it:** Open menu > Settings > Assistant > Memory, then the switch labelled Memory at the top (labels found in the code)
- **Needs:** a saved memory first (see S39.10) to check the effect
- **Steps:**
  1. From the chat screen, tap Open menu, then tap Settings.
  2. Under Assistant, tap Memory.
  3. Look under MEMORY CONTROLS for the switch labelled Memory and turn it off.
  4. Read the line Memory is off, so new memories can't be added or imported. and the Turn on button that appears.
  5. Start a new chat and ask about a fact you saved earlier; the assistant should not use it while Memory is off.
  6. Turn Memory back on and check the saved facts are used again.

## S39.03 Separate past-chat-reference control.

- **Expected:** A control separate from the Memory switch decides whether the assistant may look up excerpts from other past chats.
- **Code:** done. Evidence moved: apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:82; apps/mobile/stores/chat/chatExecutionStore.ts:1369 (quoted code not found in the file now); apps/mobile/services/cloudSettingsMapping.ts:167
- **Where to find it:** Settings > Assistant > Memory, then the switch labelled Search and reference chats (labels found in the code)
- **Needs:** one older chat with a distinct topic
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Turn off the switch labelled Search and reference chats.
  3. Start a new chat and ask about something that was only in an older chat.
  4. Check the assistant does not bring in excerpts from other past chats.
  5. Turn the switch on and ask the same question again to compare.

## S39.04 Saved-Memory list.

- **Expected:** The user can open a list of every memory the assistant has saved about them.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:732; apps/mobile/app/(app)/profile/index.tsx:199; apps/mobile/src/features/memory/store.ts:143; apps/mobile/services/cloudSyncEngine.ts:594
- **Where to find it:** Settings > Assistant > Memory (the list below the controls) (labels found in the code)
- **Needs:** a few saved memories (add them with S39.10 first); with none, the screen shows No memories yet
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Scroll down past the switches and the rows Memory summary and Replaced memories.
  3. Read the count line under those rows, for example a number.
  4. Scroll the list and check each saved memory appears as a card.

## S39.05 Memory search.

- **Expected:** The user can search or filter their saved memories by text.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:643; apps/mobile/app/(app)/profile/index.tsx:199; apps/mobile/src/features/memory/store.ts:421
- **Where to find it:** Settings > Assistant > Memory, then the field Search memories... (labels found in the code)
- **Needs:** two or more saved memories with different words
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Tap the field with the placeholder Search memories....
  3. Type one word that appears in a saved memory.
  4. Check the list shows only matching memories.
  5. Tap the clear control on the field, then tap the chip Pinned to filter to pinned memories.

## S39.06 Topic grouping.

- **Expected:** Saved memories are grouped by topic (e.g. preferences, work, background) when the user reviews them.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:315; apps/mobile/app/(app)/settings/memory.tsx:315
- **Where to find it:** Settings > Assistant > Memory, with the chip All selected and the search field empty (labels found in the code)
- **Needs:** saved memories of several kinds (for example facts, preferences and decisions learned from chats)
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Make sure the chip All is selected and the search field is empty.
  3. Look for section headings between the memory cards.
  4. Compare the headings with the Expected topics.

## S39.09 Ongoing-work summary.

- **Expected:** The user can read a summary of the ongoing work or projects the assistant knows they are pursuing.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/reflect.tsx:488
- **Where to find it:** Settings > Cloud > Reflect (Cloud mode only), then the section Work in progress (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with some Cloud chats
- **Steps:**
  1. Sign in to AGI Cloud and switch to Cloud mode.
  2. Open Settings and find the section Cloud.
  3. Tap Reflect.
  4. Look for the heading Work in progress and read the ongoing projects listed under it.

## S39.10 Add Memory manually.

- **Expected:** The user can type a new fact and save it to their memory, where later chats can use it.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:767; apps/mobile/app/(app)/profile/index.tsx:199; apps/mobile/src/features/memory/store.ts:190; apps/mobile/services/cloudSyncEngine.ts:624
- **Where to find it:** Settings > Assistant > Memory, then the round + button Add memory at the bottom right (labels found in the code)
- **Needs:** Memory turned on
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory. Memory must be on.
  2. Tap the round button labelled Add memory at the bottom right.
  3. Type a fact in the field What should AGI remember? for example I prefer metric units.
  4. Tap Save.
  5. Check the new card appears in the list with the line Added by you.
  6. Start a new chat and ask a question the fact would answer, then compare with Expected.

## S39.11 Explicit “remember this” action.

- **Expected:** From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.
- **Code:** done. Evidence present: apps/mobile/src/features/memory/services/memoryCommands.ts:224; apps/mobile/src/features/memory/services/memoryCommands.ts:209
- **Where to find it:** Chat tab: type Remember that ... in the message box and send (labels found in the code)
- **Needs:** Memory turned on
- **Steps:**
  1. Make sure Memory is on (Settings > Assistant > Memory).
  2. Open the chat tab and type Remember that I like short answers.
  3. Send the message.
  4. Look for the status line Saved to memory: followed by the fact.
  5. Open Settings > Assistant > Memory and check the fact is in the list.

## S39.12 Automatic Memory update.

- **Expected:** After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).
- **Code:** done. Evidence present: apps/mobile/src/features/memory/components/MemoryControlsCard.tsx:86; apps/mobile/src/features/memory/services/consolidation.ts:74; apps/mobile/src/features/memory/services/consolidation.ts:176
- **Where to find it:** Settings > Assistant > Memory, then the switch labelled Generate memory from chat history (labels found in the code)
- **Needs:** Memory and the generate switch on; a normal chat
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Turn on Memory and turn on the switch Generate memory from chat history.
  3. In a normal chat (not temporary) say a lasting fact, for example I work as a nurse in Leeds.
  4. Wait for the reply to finish, then go back to Settings > Assistant > Memory.
  5. Check a new card appears with the line Learned from a chat, or Learned from the chat title.

## S39.13 Edit Memory.

- **Expected:** The user can change the text of a saved memory and the corrected text is what later chats use.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/settings/memory.tsx:222 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:199; apps/mobile/src/features/memory/store.ts:192 (quoted code not found in the file now)
- **Where to find it:** Settings > Assistant > Memory, then the pencil button Edit memory on a card (labels found in the code)
- **Needs:** a saved memory
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Tap the pencil button labelled Edit memory on a card.
  3. Change the text in the field labelled Memory content.
  4. Tap Update.
  5. Check the card shows the new text and the line Edited, then ask a chat question that uses it.

## S39.14 Delete individual Memory.

- **Expected:** The user can delete one saved memory so the assistant stops using it.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:425; apps/mobile/app/(app)/profile/index.tsx:199; apps/mobile/src/features/memory/store.ts:302
- **Where to find it:** Settings > Assistant > Memory, swipe a card to the left and tap the red trash button (labels found in the code)
- **Needs:** a saved memory
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Swipe a memory card to the left to show the red trash button labelled Delete memory.
  3. Tap it and read the alert Delete memory?
  4. Tap Delete.
  5. Check the card is gone and the count has gone down by one.

## S39.15 Delete all Memory.

- **Expected:** One action deletes every saved memory, after a confirmation, and afterwards none remain.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:367; apps/mobile/src/features/memory/store.ts:340
- **Where to find it:** Settings > Assistant > Memory, then the red row Reset memory (labels found in the code)
- **Needs:** some saved memories
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Tap the red row Reset memory.
  3. Read the alert Reset memory? and tap Cancel first; check nothing was removed.
  4. Tap Reset memory again in the alert.
  5. Check the list says No memories yet and the count is zero.

## S39.16 Prioritize Memory.

- **Expected:** The user can mark a memory as important (pin) so it is kept and preferred over others.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:342; apps/mobile/app/(app)/profile/index.tsx:199; apps/mobile/src/features/memory/store.ts:373; apps/mobile/src/features/memory/store.ts:615
- **Where to find it:** Settings > Assistant > Memory, then the pin button Pin memory on a card (labels found in the code)
- **Needs:** two or more saved memories
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Tap the pin button labelled Pin memory on a card.
  3. Check the card shows the badge Pinned.
  4. Tap the chip Pinned to see only pinned memories.
  5. Compare with Expected: pinned memories are kept at the top and win a conflict.

## S39.17 Memory source/provenance.

- **Expected:** Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).
- **Code:** done. Evidence present: apps/mobile/src/features/settings/components/MemoryItem.tsx:55
- **Where to find it:** Settings > Assistant > Memory, read the small line under each memory card (labels found in the code)
- **Needs:** a memory added by hand, an import, and a chat-learned memory
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Add a memory yourself (S39.10) and read the line under it: Added by you.
  3. Import memories (S39.21) and check the line says Imported.
  4. Find a card learned from a chat and check it says Learned from followed by the chat title.

## S39.18 Last-updated information.

- **Expected:** Each saved memory shows when it was last added or changed.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/components/MemoryItem.tsx:48
- **Where to find it:** Settings > Assistant > Memory, read the time line on each memory card (labels found in the code)
- **Needs:** a memory you can add and edit
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory.
  2. Add a memory (S39.10) and read the time line, which starts with Added.
  3. Wait a minute, then edit the memory (S39.13).
  4. Check the line now starts with Edited and shows a time such as 2m ago.

## S39.19 Correction of stale information.

- **Expected:** When the user states a newer fact that contradicts a stored memory, the outdated memory stops being used without a manual edit.
- **Code:** done. Evidence present: apps/mobile/src/features/memory/services/localMemoryWriter.ts:25
- **Where to find it:** no screen of its own. The rule runs automatically on the same topic; the code does not show a control for it.
- **Needs:** Memory on; a Free or paid account is not needed
- **Steps:**
  1. Add a memory such as I live in Paris (S39.10).
  2. In a chat, say a newer fact on the same topic, for example I now live in London.
  3. Open Settings > Assistant > Memory and check the Paris memory is no longer in the main list.
  4. Open Replaced memories and check the Paris memory is listed there.
  5. Start a chat and ask where you live; the answer should use London.

## S39.20 Conflicting-Memory resolution.

- **Expected:** When two memories disagree, a stated rule decides which one the assistant uses, and the user can see or settle the conflict.
- **Code:** done. Evidence present: apps/mobile/src/features/memory/services/localMemoryWriter.ts:25; apps/mobile/app/(app)/settings/memory-conflicts.tsx:72
- **Where to find it:** Settings > Assistant > Memory > Replaced memories (labels found in the code)
- **Needs:** two conflicting memories
- **Steps:**
  1. Create two memories on the same topic (see S39.19).
  2. Open Settings > Assistant > Memory > Replaced memories.
  3. Read the heading When memories disagree and the rule text.
  4. Tap Use the replaced one instead on the entry to settle it.
  5. Check the list now uses the replaced memory and a chat answer follows it.

## S39.21 Memory import.

- **Expected:** The user can bring memories from a file or another assistant into their memory, preview them, and later chats use them.
- **Code:** done. Evidence present: apps/mobile/src/features/memory/store.ts:348; apps/mobile/app/(app)/settings/memory-import.tsx:396
- **Where to find it:** Settings > Assistant > Memory, then the upload button labelled Import memories at the top right (labels found in the code)
- **Needs:** a text or JSON file, or some pasted lines
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory. Memory must be on.
  2. Tap the upload button Import memories at the top right.
  3. Pick a source under From (ChatGPT, Claude, Gemini, Copilot or Other).
  4. Paste lines into the box or tap Choose a text or JSON file, then tap Preview.
  5. Select the items, tap the import button, and check the message Added N memories.

## S39.22 Memory export.

- **Expected:** The user can download their saved memories in a readable file.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/data-controls/index.tsx:43 (quoted code not found in the file now); apps/mobile/app/(app)/profile/index.tsx:209; apps/mobile/services/dsarExport.ts:284 (quoted code not found in the file now); apps/mobile/src/features/settings/cloud-account/index.tsx:510; apps/mobile/services/cloudDataExport.ts:28 (quoted code not found in the file now)
- **Where to find it:** Settings > Assistant > Data Controls > Local data > Export Local Data (labels found in the code)
- **Needs:** some saved memories; a way to open a .json file
- **Steps:**
  1. Open Settings, tap Assistant, then tap Data Controls.
  2. Under Local data, tap Export Local Data.
  3. Wait for the progress to finish and choose a place in the share sheet.
  4. Open the saved file agi_data_export.json and find the memory_facts list.
  5. Compare the saved memories with the list in Settings > Assistant > Memory.

## S39.26 Organization knowledge distinct from personal Memory.

- **Expected:** Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:72; apps/mobile/app/(app)/settings/memory.tsx:282
- **Where to find it:** Settings > Assistant > Memory, read the scope line under the count (labels found in the code)
- **Needs:** an AGI Cloud account in a workspace, with a workspace memory and a personal chat
- **Steps:**
  1. Sign in to AGI Cloud with a workspace and switch to Cloud mode.
  2. Open Settings, tap Assistant, then tap Memory; the title says Cloud Memory.
  3. Read the scope line under the count: Personal memories. Workspace memories stay in their workspace., or the workspace name line.
  4. Start a personal chat and ask about a workspace memory; it should not appear.
  5. Compare with Expected.

## S39.28 Temporary-chat exclusions.

- **Expected:** In a temporary chat nothing is read from or saved to memory, and the temporary chat is never used later as past-chat context.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:3384; apps/mobile/stores/chat/chatExecutionStore.ts:1250 (quoted code not found in the file now)
- **Where to find it:** Chat tab: the eye-off button for temporary chat; or Settings > Device > General > Temporary Chat (labels found in the code)
- **Needs:** Memory on, with one saved memory
- **Steps:**
  1. Open the chat tab and tap the eye-off temporary chat control, or turn on the switch Temporary Chat in Settings > Device > General.
  2. Read the explainer text about temporary chats.
  3. Send Remember that I like tea and ask a question about a saved memory.
  4. Go to Settings > Assistant > Memory and check the new fact was not saved.
  5. Start a normal chat and check the temporary chat content is not used as past-chat context.

## S39.29 Sensitive-Memory controls.

- **Expected:** The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.
- **Code:** done. Evidence present: apps/mobile/src/features/memory/services/localMemoryWriter.ts:32; apps/mobile/src/features/memory/services/memoryCommands.ts:109
- **Where to find it:** Settings > Assistant > Memory, then the switch Include sensitive topics in memory; in Cloud mode also Never remember (labels found in the code)
- **Needs:** Memory on; use a fake test value only, never a real credential; Never remember needs Cloud mode
- **Steps:**
  1. Open Settings, tap Assistant, then tap Memory. Memory must be on for the switch to work.
  2. Read the switch Include sensitive topics in memory and leave it off to stop sensitive topics being learned from chats.
  3. In Cloud mode, tap Never remember, type a term in Term to never remember, and tap Add term.
  4. In the chat tab, send Remember that my password is a fake test value; the reply should say Memory never stores ... so I left that out.
  5. Compare with Expected.

## S39.30 Memory reset independent from chat deletion.

- **Expected:** The user can reset all memory without deleting chats, and deleting chats does not silently wipe (or silently keep) memory.
- **Code:** done. Evidence present: apps/mobile/app/(app)/settings/memory.tsx:572; apps/mobile/src/features/memory/store.ts:340
- **Where to find it:** Settings > Assistant > Data Controls > Local data > Local chats > Delete all local chats (and separately Settings > Assistant > Memory > Reset memory) (labels found in the code)
- **Needs:** some chats and some memories; this removes data, so use a test account
- **Steps:**
  1. Note how many memories are in Settings > Assistant > Memory.
  2. Open Settings, tap Assistant, then tap Data Controls and find Delete all local chats under Local chats.
  3. Read the alert Delete all local chats? (it says memory stays), tap Cancel, then tap the button again and confirm.
  4. Go back to Settings > Assistant > Memory and check the memories are still there.
  5. Tap Reset memory on that screen, confirm, and check the chats in the chat tab are still there.
