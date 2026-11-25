---
id: "PLAN-web-039"
type: "test-plan"
title: "Web · 39. Memory product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "39"
---
# Web · 39. Memory product

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S39.02 Memory enable/disable control.

- **Expected:** A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:317; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/lib/services/managed-memory-context-service.ts:274; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2903 (quoted code not found in the file now); apps/web/lib/services/managed-memory-context-service.ts:621
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Persistent memory (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, open Settings, then click Personalization.
  2. Find the row "Persistent memory" and note the switch next to it.
  3. Turn the switch off, then start a new chat and say a fact you know is saved.
  4. Check the reply does not use the saved fact, and turn the switch back on.

## S39.03 Separate past-chat-reference control.

- **Expected:** A control separate from the Memory switch decides whether the assistant may look up excerpts from other past chats.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:408; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1223 (quoted code not found in the file now); apps/web/lib/services/managed-memory-context-service.ts:278
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Search past chats (labels found in the code)
- **Needs:** a signed-in account with older chats
- **Steps:**
  1. Open Settings, then Personalization.
  2. Find the row "Search past chats" and its switch.
  3. Turn it off, then ask a question that refers to an older chat.
  4. Check the reply does not quote excerpts from your other chats; turn it back on.

## S39.04 Saved-Memory list.

- **Expected:** The user can open a list of every memory the assistant has saved about them.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/stores/memoryStore.ts:153 (quoted code not found in the file now); apps/web/app/api/memory/route.ts:87
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Manage memories (labels found in the code)
- **Needs:** a signed-in account with saved memories (the button is disabled when there are none)
- **Steps:**
  1. Open Settings, then Personalization.
  2. Click the "Manage memories" button under the memory counts line.
  3. The page scrolls to the memory list headed by the "Memory facts" list.
  4. Compare the list with the saved count shown as "saved memories" above it.

## S39.05 Memory search.

- **Expected:** The user can search or filter their saved memories by text.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/MemoryEditor.tsx:480; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); packages/ui/unified-chat/src/components/MemoryEditor.tsx:131
- **Where to find it:** Settings > Personalization > Manage memories > Search memory (labels found in the code)
- **Needs:** a signed-in account with several saved memories
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Click the box with the placeholder "Search memory".
  3. Type a word from one saved memory.
  4. Check only memories containing that word remain in the list.

## S39.06 Topic grouping.

- **Expected:** Saved memories are grouped by topic (e.g. preferences, work, background) when the user reviews them.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/MemoryEditor.tsx:32
- **Where to find it:** Settings > Personalization > Manage memories (labels found in the code)
- **Needs:** a signed-in account with saved memories of different kinds
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Look at the group headings in the memory list.
  3. Compare the headings with the topics in Expected: Preferences, About you, Decisions, Context, Summaries, Skills, Other.

## S39.09 Ongoing-work summary.

- **Expected:** The user can read a summary of the ongoing work or projects the assistant knows they are pursuing.
- **Code:** done. Evidence present: apps/web/lib/services/reflect-service.ts:97; apps/web/features/settings/sections/ReflectSection.tsx:293
- **Where to find it:** Settings > Reflect > Work in progress (labels found in the code)
- **Needs:** a signed-in account with chats about ongoing work
- **Steps:**
  1. Open Settings, then click Reflect.
  2. Look for the section headed "Work in progress".
  3. Compare the listed items with the projects or work you are pursuing in your chats.

## S39.10 Add Memory manually.

- **Expected:** The user can type a new fact and save it to their memory, where later chats can use it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/stores/memoryStore.ts:260; packages/ui/unified-chat/src/stores/memoryStore.ts:459
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Manage memories > Add a new fact (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Click the box with the placeholder "Example: I prefer Python over JavaScript for data work."
  3. Type a fact, then click the "Add" button.
  4. Check the new fact appears in the memory list with "Added by you", then start a chat and check it is used.

## S39.11 Explicit “remember this” action.

- **Expected:** From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1248 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3133 (quoted code not found in the file now)
- **Where to find it:** Chat composer > type "Remember that" followed by the fact (labels found in the code)
- **Needs:** a signed-in account with Persistent memory on
- **Steps:**
  1. In a chat, type "Remember that" followed by a fact, such as a preference, and send.
  2. Read the assistant reply for a confirmation that it was saved.
  3. Open Settings > Personalization > Manage memories and look for the fact.

## S39.12 Automatic Memory update.

- **Expected:** After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:274 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392; apps/web/lib/services/managed-auto-memory-service.ts:120; apps/web/lib/services/managed-memory-context-service.ts:1412
- **Where to find it:** Settings > Personalization > Save memories from chats (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Confirm "Persistent memory" and "Save memories from chats" are on.
  3. Have an ordinary chat that states a lasting fact about you, such as your job.
  4. Open Manage memories and check the fact was added without you asking.

## S39.13 Edit Memory.

- **Expected:** The user can change the text of a saved memory and the corrected text is what later chats use.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/stores/memoryStore.ts:319
- **Where to find it:** Settings > Personalization > Manage memories > click a memory's text (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Click the text of a saved memory; it opens for editing.
  3. Change the wording and save it.
  4. Start a new chat and check the reply uses the corrected wording.

## S39.14 Delete individual Memory.

- **Expected:** The user can delete one saved memory so the assistant stops using it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/stores/memoryStore.ts:364
- **Where to find it:** Settings > Personalization > Manage memories > Delete memory fact (trash icon) (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Hover a memory and click its trash icon (accessible name "Delete memory fact").
  3. In the dialog "Delete this memory?", click "Delete memory".
  4. Check the memory is gone from the list.

## S39.15 Delete all Memory.

- **Expected:** One action deletes every saved memory, after a confirmation, and afterwards none remain.
- **Code:** done. Evidence present: apps/web/app/api/memory/route.ts:192; packages/ui/unified-chat/src/stores/memoryStore.ts:385; apps/web/features/settings/sections/MemorySection.tsx:183
- **Where to find it:** Settings > Personalization > Clear all memories (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, then Personalization.
  2. Click "Clear all memories".
  3. In the dialog "Delete all memory facts?", read the text, then click "Forget everything".
  4. Check the saved count now shows no saved memories and the Manage memories list is empty.

## S39.16 Prioritize Memory.

- **Expected:** The user can mark a memory as important (pin) so it is kept and preferred over others.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/MemoryEditor.tsx:346; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/memory/[id]/route.ts:126; apps/web/lib/services/managed-memory-context-service.ts:1183
- **Where to find it:** Settings > Personalization > Manage memories > Pin memory (pin icon) (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Click the pin icon (accessible name "Pin memory") on a memory.
  3. Check the icon changes to the unpin icon ("Unpin memory") and the memory is marked as pinned.
  4. Compare with Expected: a pinned memory is kept and preferred.

## S39.17 Memory source/provenance.

- **Expected:** Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/MemoryEditor.tsx:566; apps/web/app/api/memory/route.ts:69
- **Where to find it:** Settings > Personalization > Manage memories > source line under each memory (labels found in the code)
- **Needs:** a signed-in account with saved memories from more than one source
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Read the small line under each memory.
  3. Compare the lines with Expected: "Added by you", "Learned from a chat" (with a link to the chat), or "Imported".

## S39.18 Last-updated information.

- **Expected:** Each saved memory shows when it was last added or changed.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/MemoryEditor.tsx:307 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/memory/route.ts:102
- **Where to find it:** Settings > Personalization > Manage memories > date text under each memory (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, then Personalization, then click "Manage memories".
  2. Read the small line under a memory that ends with "Updated" and a date.
  3. Edit that memory, then check the date changes to today.

## S39.19 Correction of stale information.

- **Expected:** When the user states a newer fact that contradicts a stored memory, the outdated memory stops being used without a manual edit.
- **Code:** done. Evidence present: apps/web/app/api/memory/route.ts:152; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392; apps/web/lib/services/managed-memory-context-service.ts:848; apps/web/lib/services/managed-memory-context-service.ts:820
- **Where to find it:** no screen of its own. Effect visibility is inferred from the Replaced memories list; the code does not show a direct notice in the chat, so compare with the list.
- **Needs:** a signed-in account with a saved memory to contradict
- **Steps:**
  1. In a chat, state a newer fact that contradicts a saved memory, such as a new employer.
  2. Open Settings > Personalization and look for the older fact under "Replaced memories".

## S39.20 Conflicting-Memory resolution.

- **Expected:** When two memories disagree, a stated rule decides which one the assistant uses, and the user can see or settle the conflict.
- **Code:** done. Evidence present: apps/web/app/api/memory/conflicts/route.ts:27; apps/web/app/api/memory/[id]/restore/route.ts:20; apps/web/features/settings/components/MemoryConflicts.tsx:20; apps/web/features/settings/sections/MemorySection.tsx:518
- **Where to find it:** Settings > Personalization > Replaced memories > Use the replaced one instead (labels found in the code)
- **Needs:** a signed-in account with two conflicting memories
- **Steps:**
  1. Open Settings, then Personalization.
  2. Find the list labelled "Replaced memories" (it appears only when memories conflict).
  3. Read the rule line: "Pinned wins, then ones you added, then the newest."
  4. Click "Use the replaced one instead" on an entry and check it returns to the active memories.

## S39.21 Memory import.

- **Expected:** The user can bring memories from a file or another assistant into their memory, preview them, and later chats use them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:449; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/features/settings/components/ImportMemoryDialog.tsx:32; apps/web/app/api/memory/import/route.ts:144; apps/web/lib/memory/import-store.ts:47 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Import memory from other AI providers > Start import (labels found in the code)
- **Needs:** a file to upload, or a memory export from another assistant
- **Steps:**
  1. Open Settings, then Personalization.
  2. Click "Start import" on the row "Import memory from other AI providers".
  3. In the dialog, upload a memory export file or pick items, then preview them.
  4. Confirm the import and check the imported memories appear in Manage memories with "Imported".

## S39.22 Memory export.

- **Expected:** The user can download their saved memories in a readable file.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:199 (quoted code not found in the file now); apps/web/app/api/user/export/route.ts:2944
- **Where to find it:** Settings > Personalization > Export memories (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, then Personalization.
  2. Click "Export memories" (it is disabled when there are no memories).
  3. Open the file that downloads and read it.
  4. Compare its contents with the list in Manage memories.

## S39.24 Project-scoped Memory.

- **Expected:** Memories can be confined to one project, are used only in that project, and the user can tell which memories are project-only.
- **Code:** done. Evidence moved: apps/web/features/projects/components/ProjectMemoryPanel.tsx:17 (quoted code not found in the file now); apps/web/features/projects/components/ProjectSettingsDialog.tsx:404; apps/web/app/api/memory/route.ts:153 (quoted code not found in the file now)
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Sidebar > project row menu > Project settings > Add a memory only this project uses (labels found in the code)
- **Needs:** a signed-in account with at least two projects
- **Steps:**
  1. In the sidebar, open the menu of a project and choose Project settings (the dialog title is "Project settings").
  2. Find the memory list in the dialog and the box labelled "Add a memory only this project uses".
  3. Add a memory there, then open a chat in a different project and check it is not used.
  4. Check the global memory list in Settings > Personalization shows the project memory with "Only in" and the project name.

## S39.26 Organization knowledge distinct from personal Memory.

- **Expected:** Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:28 (quoted code not found in the file now); apps/web/features/settings/sections/MemorySection.tsx:477; apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:178 (quoted code not found in the file now); apps/web/app/api/memory/route.ts:75; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1208 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Where a memory applies; and the workspace page titled Sharing (labels found in the code)
- **Needs:** a workspace (organization) account
- **Steps:**
  1. Open Settings, then Personalization, and read "Where a memory applies".
  2. Open the workspace page titled "Sharing" (apps/web/app/workspace/sharing/page.tsx).
  3. Check work and workspace memories are listed apart from personal memories and that a personal chat does not show workspace memories.

## S39.27 Memory-used indication.

- **Expected:** When saved memory or past chats shaped a reply, the reply shows it (and which memories), so the user can tell remembered facts from invented ones.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchPanel.tsx:161; apps/web/features/chat/components/messages/MessageBubble.tsx:3854; apps/web/lib/services/turn-context-service.ts:216; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5408 (quoted code not found in the file now); apps/web/lib/chat-project-sources.ts:57; apps/web/app/api/models/free-quota/completions/route.ts:690 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:2030; apps/web/lib/hooks/useChatStream.ts:2702
- **Where to find it:** Chat reply > Show sources (sources button) > Memory section (labels found in the code)
- **Needs:** a signed-in account with saved memories and a chat that uses them
- **Steps:**
  1. Send a question that a saved memory should shape, then wait for the reply.
  2. Click the "Show sources" button under the reply.
  3. In the panel, look for the section headed "Memory" with a count and the memory excerpts used.
  4. Compare with the reply: a reply that came only from saved memories shows the note "This answer came from your saved memories, not the web."

## S39.28 Temporary-chat exclusions.

- **Expected:** In a temporary chat nothing is read from or saved to memory, and the temporary chat is never used later as past-chat context.
- **Code:** done. Evidence present: apps/web/db/neon/0339_temporary_chat_media_jobs.sql:19; apps/web/app/api/cron/purge-temporary-chats/route.ts:71; apps/web/app/api/cron/purge-temporary-chats/route.ts:96; apps/web/lib/server/media-job-history.ts:100
- **Where to find it:** Chat composer > Temporary chat (header shows "Temporary chat") (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Turn on "Temporary chat" in the chat composer and send a message containing a new fact about you.
  2. Check the header shows "Temporary chat".
  3. Open Settings > Personalization > Manage memories and confirm the fact is not in the list.
  4. Start a later normal chat and check it does not refer to the temporary chat.

## S39.29 Sensitive-Memory controls.

- **Expected:** The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.
- **Code:** done. Evidence present: apps/web/features/settings/components/MemoryExclusions.tsx:184; apps/web/features/settings/components/MemoryExclusions.tsx:328; apps/web/features/settings/sections/MemorySection.tsx:497; apps/web/lib/services/memory-write-service.ts:44; apps/web/lib/services/managed-memory-context-service.ts:1389; apps/web/lib/services/managed-memory-context-service.ts:577
- **Earlier check in the running app:** UI_ONLY: E015 [UI_ONLY; visible UI]: Memory panel exposes saved count, import/add controls, source exclusions and account/workspace/project scope explanations. Persistent memory is currently off; it was not enabled or changed.
- **Where to find it:** Settings > Personalization > Never remember (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Personalization.
  2. Find the section headed "Never remember".
  3. Type a term in the box labelled "Term to never remember" and click "Add".
  4. Ask the assistant to remember a fact with that term and check it is not saved; a credential should also be refused.

## S39.30 Memory reset independent from chat deletion.

- **Expected:** The user can reset all memory without deleting chats, and deleting chats does not silently wipe (or silently keep) memory.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:92 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:323 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Clear all memories (labels found in the code)
- **Needs:** a signed-in account with saved memories and chats
- **Steps:**
  1. Open Settings, then Personalization, then click "Clear all memories".
  2. Read the dialog text, which says "Your chats are not deleted."
  3. Confirm with "Forget everything".
  4. Check the memory count is zero and your chats are still listed in the sidebar.

## S39.31 Cross-model personalization.

- **Expected:** Saved memory and personalization apply the same way whichever model the user picks.
- **Code:** done. Evidence moved: apps/web/app/api/memory/local-context/route.ts:22; apps/web/lib/services/turn-context-service.ts:419; apps/web/features/chat/lib/local-personal-context.ts:137; apps/web/features/chat/pages/WebChatPage.tsx:2041; apps/web/lib/hooks/useChatStream.ts:4479; apps/web/features/chat/components/messages/MessageBubble.tsx:4137; apps/web/app/api/models/free-quota/completions/route.ts:610 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The model picker's visible label was not found in the web code, so the tester must find it on the composer. The Settings entry point is only confirmed as the word 'Settings' in packages/ui/unified-chat/src/components/CommandPalette.tsx:96, not as a web sidebar button.
- **Needs:** a Free account or a paid account with Memory turned on, and at least two models available to pick
- **Steps:**
  1. Open Settings, then Personalization, and scroll to the Memory section. Note one saved fact, for example a preferred name or a work detail.
  2. Start a new chat with the first model in the model picker and ask a question that needs that fact, such as "what do you know about my work?".
  3. Start another new chat, switch to a different model in the model picker, and ask the same question.
  4. Compare the two answers: both should use the same saved fact, and Memory should be unchanged between the two chats.

## S39.32 Cross-surface Memory continuity.

- **Expected:** A memory saved on one client appears and is used on every other client signed in to the same account.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/stores/memoryStore.ts:153 (quoted code not found in the file now); packages/ui/unified-chat/src/stores/memoryStore.ts:260
- **Where to find it:** no screen of its own. The store in packages/ui/unified-chat/src/stores/memoryStore.ts persists facts locally as well as syncing them to the server, so a memory saved on one client only shows on another after the sync completes; device-local memories do not sync. The code audit did not confirm which Memory list on client B holds a server-synced fact.
- **Needs:** two clients (web plus desktop, mobile or the extension) signed in to the same account; a Free account or a paid account with Memory on
- **Steps:**
  1. On client A (the web app), open Settings, then Personalization, and add a memory with a unique phrase such as "test fact 39-32".
  2. Sign in to the same account on client B (desktop, mobile or the extension) and open its Memory list in Settings.
  3. Check whether the phrase from step 1 appears on client B. Then ask a chat question on client B that depends on that fact.
  4. Compare with Expected: the memory should appear and be used on every signed-in client.
