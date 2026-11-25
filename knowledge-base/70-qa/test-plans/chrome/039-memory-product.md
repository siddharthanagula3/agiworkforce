---
id: "PLAN-chrome-039"
type: "test-plan"
title: "Chrome · 39. Memory product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "39"
---
# Chrome · 39. Memory product

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S39.04 Saved-Memory list.

- **Expected:** The user can open a list of every memory the assistant has saved about them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10450 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10520 (quoted code not found in the file now); apps/extension/src/background/memory-bridge.ts:127 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:139
- **Where to find it:** More (⋮) > Memory (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in to the AGI Chrome side panel with an account.
  2. Click the More button (⋮) at the top right of the side panel.
  3. Click Memory in the menu.
  4. Look for the sheet titled Memory listing every saved memory. With none saved, it shows "AGI has not saved anything about you yet."

## S39.10 Add Memory manually.

- **Expected:** The user can type a new fact and save it to their memory, where later chats can use it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7928 (quoted code not found in the file now); apps/extension/src/background.ts:3853 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:176
- **Where to find it:** More (⋮) > Memory > Add something for AGI to remember (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) and then Memory.
  2. Click the field "Add something for AGI to remember" and type a fact, for example "I prefer short answers".
  3. Click Add.
  4. Look for the status "Memory saved." and the new item in the list. Then open a new chat and ask something the fact should affect.

## S39.11 Explicit “remember this” action.

- **Expected:** From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:9003; apps/extension/src/features/cloud-bridge/memoryClient.ts:156; apps/extension/src/side_panel.ts:9044; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1601
- **Where to find it:** Chat composer > type "Remember that ..." and send (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a chat in the side panel.
  2. Type "Remember that I prefer short answers" in the message box and send it.
  3. Look for the notice above the message box. It shows the reply from memory.
  4. Click More (⋮) > Memory and check the fact is in the list.

## S39.12 Automatic Memory update.

- **Expected:** After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2404; apps/web/lib/services/managed-auto-memory-service.ts:120
- **Where to find it:** Settings (web) > Personalization > Save memories from chats (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) > Settings. The web settings open in a browser tab.
  2. Click Personalization in the settings menu.
  3. Find the toggle "Save memories from chats" and check it is on. Persistent memory must also be on.
  4. Chat normally about a lasting detail without saying "remember", wait, then click More (⋮) > Memory in the side panel and check whether a new item appeared.

## S39.13 Edit Memory.

- **Expected:** The user can change the text of a saved memory and the corrected text is what later chats use.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7815 (quoted code not found in the file now); apps/extension/src/background.ts:3862 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:184; apps/web/app/api/memory/[id]/route.ts:121
- **Where to find it:** More (⋮) > Memory > Edit (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) > Memory.
  2. Click Edit beside a saved memory, change its text in the box, then click Save.
  3. Look for the status "Memory updated." and the new text in the row.
  4. Open a new chat and ask something the corrected text should answer.

## S39.14 Delete individual Memory.

- **Expected:** The user can delete one saved memory so the assistant stops using it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7790 (quoted code not found in the file now); apps/extension/src/background.ts:3875 (quoted code not found in the file now); apps/web/app/api/memory/[id]/route.ts:148 (quoted code not found in the file now)
- **Where to find it:** More (⋮) > Memory > Delete > Delete (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) > Memory.
  2. Click Delete beside a saved memory.
  3. Read the question "Delete this memory? AGI stops using it in every app, and it cannot be recovered." and click the Delete button in it.
  4. Look for "Memory deleted." and the row gone from the list. Then ask a chat something only that memory answered.

## S39.17 Memory source/provenance.

- **Expected:** Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10319 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10330 (quoted code not found in the file now)
- **Where to find it:** More (⋮) > Memory (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) > Memory.
  2. Read the small line under each memory.
  3. A memory saved from a chat shows "From a chat: <chat title>"; one saved in Chrome shows "Saved in Chrome".
  4. Compare with a memory you added on the web, which shows no source line here.

## S39.18 Last-updated information.

- **Expected:** Each saved memory shows when it was last added or changed.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7768 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:132; apps/web/app/api/memory/route.ts:102
- **Where to find it:** not found in the code. The side panel memory sheet does not show a date. The client maps updatedAt at apps/extension/src/features/cloud-bridge/memoryClient.ts line 69, but apps/extension/src/features/side-panel/memorySheet.ts never displays it. Searched apps/extension/src/features/side-panel/memorySheet.ts and apps/web/features/settings (MemorySection, MemoryExclusions, MemoryConflicts) for updatedAt, Updated and last-updated text; none rendered.
- **Needs:** a signed-in account

## S39.19 Correction of stale information.

- **Expected:** When the user states a newer fact that contradicts a stored memory, the outdated memory stops being used without a manual edit.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2392; apps/web/lib/services/managed-memory-context-service.ts:848; apps/web/lib/services/managed-memory-context-service.ts:820
- **Where to find it:** no screen of its own. The override is applied on the server; the extension has no control for it.
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) > Memory and add "My favourite colour is blue".
  2. Open a chat and say "Actually my favourite colour is green".
  3. Open a new chat and ask "What is my favourite colour?".
  4. Look for the answer green, not blue, with no manual edit in the Memory list.

## S39.20 Conflicting-Memory resolution.

- **Expected:** When two memories disagree, a stated rule decides which one the assistant uses, and the user can see or settle the conflict.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10613 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10647 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:202 (quoted code not found in the file now)
- **Where to find it:** Settings (web) > Personalization > Replaced memories (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) > Memory and add two facts that disagree, for example "I live in Boston" and then "I live in Denver".
  2. Click More (⋮) > Settings, then Personalization in the web settings.
  3. Scroll to the replaced memories area and read "Pinned wins, then ones you added, then the newest. Replaced memories stay here."
  4. Click "Use the replaced one instead" to settle the conflict, then check the chosen fact in a new chat.

## S39.26 Organization knowledge distinct from personal Memory.

- **Expected:** Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10687 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:298 (quoted code not found in the file now)
- **Where to find it:** Settings (web) > Personalization > Memory scope text: Account, Workspace, Project (labels found in the code)
- **Needs:** a workspace account and a personal account
- **Steps:**
  1. Sign in to a workspace account.
  2. Click More (⋮) > Settings, then Personalization.
  3. Read the scope descriptions "Stays in that workspace. Work and personal memories never mix." under Workspace.
  4. Click More (⋮) > Memory in the side panel and check whether any workspace memory appears alongside personal ones.

## S39.29 Sensitive-Memory controls.

- **Expected:** The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10539 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10576 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:240 (quoted code not found in the file now)
- **Where to find it:** Settings (web) > Personalization > Term to never remember; Include sensitive topics in memory (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Click More (⋮) > Settings, then Personalization.
  2. Click the field with the placeholder "e.g. my home address" and type a term, then press Enter.
  3. Turn the toggle "Include sensitive topics in memory" off.
  4. In a chat, type "Remember that my home address is 12 Oak St", then check More (⋮) > Memory and confirm nothing about it was saved.

## S39.31 Cross-model personalization.

- **Expected:** Saved memory and personalization apply the same way whichever model the user picks.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:487; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2904 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The model menu label is not a fixed string in the side panel code, so the tester has to find it on screen.
- **Needs:** a signed-in account and two models
- **Steps:**
  1. Click More (⋮) > Memory and add "My name is Sam".
  2. Open a chat, choose one model from the model menu, and ask "What is my name?".
  3. Choose a different model in the same menu and ask again.
  4. Look for "Sam" in both answers.

## S39.32 Cross-surface Memory continuity.

- **Expected:** A memory saved on one client appears and is used on every other client signed in to the same account.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10520 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:139; apps/extension/src/background/memory-bridge.ts:127 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Cross-client sync is server-side; the side panel does not show the other clients.
- **Needs:** a second client signed in to the same account (web or phone)
- **Steps:**
  1. In the side panel, click More (⋮) > Memory and add "I work in tax law" with Add.
  2. Open the web app with the same account, click Settings then Personalization, and look for the memory.
  3. Or use the web link "Memory settings on the web" from the Memory sheet to confirm it is listed.
  4. Open a chat on the other client and check the fact is used.
