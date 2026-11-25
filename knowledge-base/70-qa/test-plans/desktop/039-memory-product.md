---
id: "PLAN-desktop-039"
type: "test-plan"
title: "Desktop · 39. Memory product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "39"
---
# Desktop · 39. Memory product

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S39.02 Memory enable/disable control.

- **Expected:** A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:317; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/lib/services/managed-memory-context-service.ts:274; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2903 (quoted code not found in the file now); apps/web/lib/services/managed-memory-context-service.ts:621
- **Where to find it:** Settings > Personalization > Persistent memory (switch) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and choose Personalization.
  2. Find the row Persistent memory with its switch.
  3. Turn the switch off, then open a new chat and ask about a fact you saved before.
  4. Compare: with the switch off the assistant should not use saved memories, and the switch should stay off after a reload.

## S39.03 Separate past-chat-reference control.

- **Expected:** A control separate from the Memory switch decides whether the assistant may look up excerpts from other past chats.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:408; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1223 (quoted code not found in the file now); apps/web/lib/services/managed-memory-context-service.ts:278
- **Where to find it:** Settings > Personalization > Search past chats (switch) (labels found in the code)
- **Needs:** a signed-in account with older chats
- **Steps:**
  1. Open Settings and choose Personalization.
  2. Find the row Search past chats and its switch.
  3. Turn it off, then in a new chat ask about something said in an older chat.
  4. Compare: the assistant should not pull excerpts from other chats while the switch is off.

## S39.04 Saved-Memory list.

- **Expected:** The user can open a list of every memory the assistant has saved about them.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/stores/memoryStore.ts:153 (quoted code not found in the file now); apps/web/app/api/memory/route.ts:87
- **Where to find it:** Settings > Personalization > Memory > Manage memories (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings and choose Personalization.
  2. Scroll to the Memory block and click Manage memories.
  3. Look at the list that opens below the Memory block.
  4. Compare: every saved memory should appear in the list.

## S39.05 Memory search.

- **Expected:** The user can search or filter their saved memories by text.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/MemoryEditor.tsx:480; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); packages/ui/unified-chat/src/components/MemoryEditor.tsx:131
- **Where to find it:** Settings > Personalization > Memory > Manage memories > Search memory box (labels found in the code)
- **Needs:** a signed-in account with several saved memories
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. Click the box that says Search memory.
  3. Type a word that appears in one saved memory.
  4. Compare: only the memories that contain that text should stay in the list.

## S39.06 Topic grouping.

- **Expected:** Saved memories are grouped by topic (e.g. preferences, work, background) when the user reviews them.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/MemoryEditor.tsx:32
- **Where to find it:** Settings > Personalization > Memory > Manage memories (group headings) (labels found in the code)
- **Needs:** a signed-in account with saved memories of different kinds
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. Look for group headings above the memory lists.
  3. Compare: memories should sit under headings such as Preferences, About you, Decisions, Context, Summaries, Skills, or Other.

## S39.09 Ongoing-work summary.

- **Expected:** The user can read a summary of the ongoing work or projects the assistant knows they are pursuing.
- **Code:** done. Evidence present: apps/web/lib/services/reflect-service.ts:97; apps/web/features/settings/sections/ReflectSection.tsx:293
- **Where to find it:** Settings > Reflect > Work in progress (labels found in the code)
- **Needs:** a signed-in account with memory on and ongoing chats
- **Steps:**
  1. Open Settings and choose Reflect.
  2. Wait for the recap to load, then scroll down.
  3. Look for a section titled Work in progress that lists chat titles with short descriptions.
  4. Compare: it should list the projects or ongoing work the assistant knows about.

## S39.10 Add Memory manually.

- **Expected:** The user can type a new fact and save it to their memory, where later chats can use it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/stores/memoryStore.ts:260; packages/ui/unified-chat/src/stores/memoryStore.ts:459
- **Where to find it:** Settings > Personalization > Memory > Manage memories > Add a new fact (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. Click the box under the label Add a new fact and type a fact, for example I prefer Python over JavaScript for data work.
  3. Click Add.
  4. Compare: the new fact should appear in the list, and a new chat should be able to use it.

## S39.11 Explicit “remember this” action.

- **Expected:** From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1248 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3133 (quoted code not found in the file now)
- **Where to find it:** Any chat > composer > type Remember that ... and send (labels found in the code)
- **Needs:** a signed-in account with Persistent memory on
- **Steps:**
  1. Open a new chat.
  2. Type Remember that I prefer short answers and send.
  3. Look at the reply for a note that the fact was saved.
  4. Open Settings > Personalization > Memory > Manage memories and check the new fact is listed.

## S39.12 Automatic Memory update.

- **Expected:** After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:274 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392; apps/web/lib/services/managed-auto-memory-service.ts:120; apps/web/lib/services/managed-memory-context-service.ts:1412
- **Where to find it:** Settings > Personalization > Save memories from chats (switch) (labels found in the code)
- **Needs:** a signed-in account, Persistent memory on
- **Steps:**
  1. Open Settings, Personalization, and make sure Persistent memory is on.
  2. Turn on Save memories from chats.
  3. Chat for a few turns and state a lasting detail, for example I work as a nurse in Denver.
  4. Open Manage memories and compare: the new durable fact should appear without you asking.

## S39.13 Edit Memory.

- **Expected:** The user can change the text of a saved memory and the corrected text is what later chats use.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/stores/memoryStore.ts:319
- **Where to find it:** Settings > Personalization > Memory > Manage memories > click a memory's text (labels found in the code)
- **Needs:** a signed-in account with a saved memory
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. Click the text of a saved memory to edit it.
  3. Change the text, then click Save.
  4. Compare: the new text should show in the list, and later chats should use the corrected text.

## S39.14 Delete individual Memory.

- **Expected:** The user can delete one saved memory so the assistant stops using it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/stores/memoryStore.ts:364
- **Where to find it:** Settings > Personalization > Memory > Manage memories > Delete memory fact (icon) (labels found in the code)
- **Needs:** a signed-in account with at least two saved memories
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. On one memory, click the trash icon labelled Delete memory fact.
  3. In the dialog titled Delete this memory?, click Delete memory.
  4. Compare: that one memory should leave the list and the others should stay.

## S39.15 Delete all Memory.

- **Expected:** One action deletes every saved memory, after a confirmation, and afterwards none remain.
- **Code:** done. Evidence present: apps/web/app/api/memory/route.ts:192; packages/ui/unified-chat/src/stores/memoryStore.ts:385; apps/web/features/settings/sections/MemorySection.tsx:183
- **Where to find it:** Settings > Personalization > Memory > Clear all memories (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings and choose Personalization.
  2. In the Memory block click Clear all memories.
  3. In the dialog titled Delete all memory facts?, read the warning, then click Forget everything.
  4. Compare: the count line should show no saved memories and the Manage memories list should be empty.

## S39.16 Prioritize Memory.

- **Expected:** The user can mark a memory as important (pin) so it is kept and preferred over others.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/MemoryEditor.tsx:346; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/memory/[id]/route.ts:126; apps/web/lib/services/managed-memory-context-service.ts:1183
- **Where to find it:** Settings > Personalization > Memory > Manage memories > Pin memory (icon) (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. On one memory, click the pin icon labelled Pin memory.
  3. Compare: the icon should change to Unpin memory and the memory should be shown as pinned.
  4. Check that a pinned memory is kept when another memory is replaced (see Settings > Personalization > Memory > When memories disagree).

## S39.17 Memory source/provenance.

- **Expected:** Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/MemoryEditor.tsx:566; apps/web/app/api/memory/route.ts:69
- **Where to find it:** Settings > Personalization > Memory > Manage memories (line under each memory) (labels found in the code)
- **Needs:** a signed-in account with memories from different sources (typed, imported, learned)
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. Read the small grey line under each memory.
  3. Compare: it should say Added by you, Imported, or Learned from a chat with the chat title as a link.

## S39.18 Last-updated information.

- **Expected:** Each saved memory shows when it was last added or changed.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/MemoryEditor.tsx:307 (quoted code not found in the file now); apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/app/api/memory/route.ts:102
- **Where to find it:** Settings > Personalization > Memory > Manage memories (grey line under each memory) (labels found in the code)
- **Needs:** a signed-in account with a saved memory
- **Steps:**
  1. Open Settings, Personalization, then click Manage memories.
  2. Read the grey line under a memory.
  3. Edit that memory, then read the line again.
  4. Compare: the Updated date should show the date of the change.

## S39.19 Correction of stale information.

- **Expected:** When the user states a newer fact that contradicts a stored memory, the outdated memory stops being used without a manual edit.
- **Code:** done. Evidence present: apps/web/app/api/memory/route.ts:152; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392; apps/web/lib/services/managed-memory-context-service.ts:848; apps/web/lib/services/managed-memory-context-service.ts:820
- **Where to find it:** no screen of its own. The rule is applied by the server, so there is no button for it. The Replaced line may take a page reload to appear.
- **Needs:** a signed-in account with Persistent memory on
- **Steps:**
  1. Save a memory by typing I live in Austin in Manage memories > Add a new fact.
  2. In a new chat say I moved to Denver and send.
  3. Open Settings > Personalization > Memory > When memories disagree and look for a line Replaced: I live in Austin.
  4. Compare: in a later chat asking where you live, the reply should use Denver and not Austin.

## S39.20 Conflicting-Memory resolution.

- **Expected:** When two memories disagree, a stated rule decides which one the assistant uses, and the user can see or settle the conflict.
- **Code:** done. Evidence present: apps/web/app/api/memory/conflicts/route.ts:27; apps/web/app/api/memory/[id]/restore/route.ts:20; apps/web/features/settings/components/MemoryConflicts.tsx:20; apps/web/features/settings/sections/MemorySection.tsx:518
- **Where to find it:** Settings > Personalization > Memory > When memories disagree (below the memory list) (labels found in the code)
- **Needs:** a signed-in account with two memories that disagree
- **Steps:**
  1. Open Settings, Personalization, and scroll down to the Memory block.
  2. Find the section titled When memories disagree.
  3. Read the rule line: Pinned wins, then ones you added, then the newest.
  4. If a Replaced line is listed, click Use the replaced one instead and compare which memory the assistant uses next.

## S39.21 Memory import.

- **Expected:** The user can bring memories from a file or another assistant into their memory, preview them, and later chats use them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:449; apps/web/features/settings/components/WebSettingsModal.tsx:206 (quoted code not found in the file now); apps/web/features/settings/components/ImportMemoryDialog.tsx:32; apps/web/app/api/memory/import/route.ts:144; apps/web/lib/memory/import-store.ts:47 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Memory > Import memory from other AI providers > Start import (labels found in the code)
- **Needs:** a text or export file of memories from another assistant
- **Steps:**
  1. Open Settings, Personalization, and scroll to the row Import memory from other AI providers.
  2. Click Start import.
  3. In the dialog, choose Paste memories or Upload file, add the text or a file, then click Preview.
  4. Tick the memories you want, click Import N selected, and compare: the memories should appear in Manage memories and later chats should use them.

## S39.22 Memory export.

- **Expected:** The user can download their saved memories in a readable file.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:199 (quoted code not found in the file now); apps/web/app/api/user/export/route.ts:2944
- **Where to find it:** Settings > Personalization > Memory > Export memories (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Open Settings, Personalization, and find the Memory block.
  2. Click Export memories.
  3. Open the downloaded file in a text editor or Preview.
  4. Compare: it should list the saved memories in readable form.

## S39.24 Project-scoped Memory.

- **Expected:** Memories can be confined to one project, are used only in that project, and the user can tell which memories are project-only.
- **Code:** done. Evidence moved: apps/web/features/projects/components/ProjectMemoryPanel.tsx:17 (quoted code not found in the file now); apps/web/features/projects/components/ProjectSettingsDialog.tsx:404; apps/web/app/api/memory/route.ts:153 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Projects > open a project > Project settings > Memory (labels found in the code)
- **Needs:** a project you own
- **Steps:**
  1. Open a project you own from Projects in the sidebar.
  2. Open Project settings from the project's menu.
  3. In the Memory section, read Use memories from outside this project and untick it to make project memory project-only.
  4. Add a memory with Add a memory only this project uses, then open a chat in that project and a chat outside it and compare.

## S39.26 Organization knowledge distinct from personal Memory.

- **Expected:** Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:28 (quoted code not found in the file now); apps/web/features/settings/sections/MemorySection.tsx:477; apps/web/app/workspace/sharing/page.tsx:17; apps/web/features/settings/sections/OrganizationSharingSection.tsx:178 (quoted code not found in the file now); apps/web/app/api/memory/route.ts:75; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1208 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Memory > Where a memory applies (Account, Workspace, Project); workspace on/off is in Workspace > Policy > Memory (labels found in the code)
- **Needs:** a workspace the account belongs to, with a second personal chat
- **Steps:**
  1. Open Settings, Personalization, and find the block titled Where a memory applies.
  2. Read the three rows: Account, Workspace, Project.
  3. Open a workspace chat and a personal chat, ask what you know about the user, and compare that work memories do not appear in personal chats.

## S39.27 Memory-used indication.

- **Expected:** When saved memory or past chats shaped a reply, the reply shows it (and which memories), so the user can tell remembered facts from invented ones.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchPanel.tsx:161; apps/web/features/chat/components/messages/MessageBubble.tsx:3854; apps/web/lib/services/turn-context-service.ts:216; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5408 (quoted code not found in the file now); apps/web/lib/chat-project-sources.ts:57; apps/web/app/api/models/free-quota/completions/route.ts:690 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:2030; apps/web/lib/hooks/useChatStream.ts:2702
- **Where to find it:** Chat > a reply that used saved memory: the note under the reply, or the Memory section in the Research panel (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Save a memory, such as I work as a nurse, then open a new chat.
  2. Ask a question that depends on it, such as what do you know about my job.
  3. Read the note under the reply for This answer came from your saved memories, not the web.
  4. Compare: the note should appear only when memory shaped the reply.

## S39.28 Temporary-chat exclusions.

- **Expected:** In a temporary chat nothing is read from or saved to memory, and the temporary chat is never used later as past-chat context.
- **Code:** done. Evidence present: apps/web/db/neon/0339_temporary_chat_media_jobs.sql:19; apps/web/app/api/cron/purge-temporary-chats/route.ts:71; apps/web/app/api/cron/purge-temporary-chats/route.ts:96; apps/web/lib/server/media-job-history.ts:100
- **Where to find it:** File > New Temporary Chat (desktop), or the composer's plus menu > Temporary chat (labels found in the code)
- **Needs:** a signed-in account with saved memories
- **Steps:**
  1. Start a temporary chat with File > New Temporary Chat, or from the composer choose Temporary chat.
  2. Read the composer note: Temporary chats never read or save memory.
  3. Ask what you know about me, and compare: no saved memories should be used.
  4. Afterward open Settings > Personalization > Memory > Manage memories and check that nothing from the temporary chat was added.

## S39.29 Sensitive-Memory controls.

- **Expected:** The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.
- **Code:** done. Evidence present: apps/web/features/settings/components/MemoryExclusions.tsx:184; apps/web/features/settings/components/MemoryExclusions.tsx:328; apps/web/features/settings/sections/MemorySection.tsx:497; apps/web/lib/services/memory-write-service.ts:44; apps/web/lib/services/managed-memory-context-service.ts:1389; apps/web/lib/services/managed-memory-context-service.ts:577
- **Where to find it:** Settings > Personalization > Memory > Never remember (and the switch Include sensitive topics in memory) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, Personalization, and find the block titled Never remember.
  2. Type a term such as my home address in the box labelled Term to never remember and click Add.
  3. Ask the assistant in a new chat to remember a term that matches, then check Manage memories.
  4. Compare: the term should not be saved. Also check the switch Include sensitive topics in memory is off by default.

## S39.30 Memory reset independent from chat deletion.

- **Expected:** The user can reset all memory without deleting chats, and deleting chats does not silently wipe (or silently keep) memory.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/MemorySection.tsx:92 (quoted code not found in the file now); apps/web/features/settings/sections/PrivacySection.tsx:323 (quoted code not found in the file now)
- **Where to find it:** Settings > Personalization > Memory > Clear all memories (memory only). Chat deletion is in Settings > Privacy > Delete all chats in this workspace. (labels found in the code)
- **Needs:** a signed-in account with saved memories and chats
- **Steps:**
  1. Open Settings, Personalization, and click Clear all memories, then Forget everything. Check that the chats list is unchanged.
  2. Open Settings > Privacy and find Delete all chats in this workspace, but do not confirm it unless you mean to.
  3. Compare: deleting chats should not clear the memory list, and clearing memory should not delete chats.

## S39.31 Cross-model personalization.

- **Expected:** Saved memory and personalization apply the same way whichever model the user picks.
- **Code:** done. Evidence moved: apps/web/app/api/memory/local-context/route.ts:22; apps/web/lib/services/turn-context-service.ts:419; apps/web/features/chat/lib/local-personal-context.ts:137; apps/web/features/chat/pages/WebChatPage.tsx:2041; apps/web/lib/hooks/useChatStream.ts:4479; apps/web/features/chat/components/messages/MessageBubble.tsx:4137; apps/web/app/api/models/free-quota/completions/route.ts:610 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. No control exists for this; the effect is applied in the server and client context code (apps/web/lib/services/turn-context-service.ts, apps/web/features/chat/lib/local-personal-context.ts, apps/web/lib/hooks/useChatStream.ts), which attaches the same personal context block to every model request. The visible label for the answer-level indicator is in apps/web/features/chat/components/messages/MessageBubble.tsx: 'Answered without your instructions and memory: they could not be loaded onto this device.' This appears only when the context could not be loaded in local mode. I did not verify the rendered result per model.
- **Needs:** a Free account or a paid account, with at least one saved memory, and two models available in the picker
- **Steps:**
  1. Open a chat, pick one model from the model picker, and ask "What do you know about me?" or ask for a reply that uses a saved memory.
  2. Switch to a different model in the same chat or a new chat and repeat the same question.
  3. Compare the two replies: the saved memory and personalization should be used the same way with either model.

## S39.32 Cross-surface Memory continuity.

- **Expected:** A memory saved on one client appears and is used on every other client signed in to the same account.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/stores/memoryStore.ts:153 (quoted code not found in the file now); packages/ui/unified-chat/src/stores/memoryStore.ts:260
- **Where to find it:** no screen of its own. Cross-client sync is in the memory store (packages/ui/unified-chat/src/stores/memoryStore.ts), which saves to the server through apps/web/app/api/memory/route.ts; the visible sync status text is shown only when the store is in the 'synced' state, and the 'Settings' item is in the account menu (apps/web/shared/components/layout/AccountMenuItems.tsx). I could not find a separate control for this, so the path to Memory is through Settings > Personalization. I did not verify the cross-device behaviour at runtime.
- **Needs:** a second client signed in to the same account (for example a second browser or the phone app); a single account is enough
- **Steps:**
  1. On a computer, sign in to the same account and add a memory in Settings > Personalization > Memory (the Memory section under Personalization).
  2. On a phone or a second browser, sign in to the same account and open Settings > Personalization > Memory.
  3. Check that the memory added on the first client is listed on the second client, and that a new chat on the second client uses it.
  4. Look for the line 'Synced to your account, available on every device you sign into.' under the memory list on the first client.
