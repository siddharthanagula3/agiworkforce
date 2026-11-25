---
id: "PLAN-vscode-039"
type: "test-plan"
title: "VS Code · 39. Memory product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "39"
---
# VS Code · 39. Memory product

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S39.02 Memory enable/disable control.

- **Expected:** A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:2037; apps/extension-vscode/src/memory/memoryStore.ts:54; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2649 (quoted code not found in the file now)
- **Where to find it:** Code: Open Settings > Instructions & editor > Memory > Use saved memory facts (switch) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Open Settings", press Enter.
  2. Click "Instructions &amp; editor" in the left list (it shows as Instructions & editor).
  3. In the Memory card, switch "Use saved memory facts" off.
  4. Press Cmd+Shift+P, run "Code: Add Memory Fact", type a fact, press Enter.
  5. Compare: a dialog says "Memory is off, so saved facts are not sent with any turn." and no fact is saved, as Expected says.

## S39.04 Saved-Memory list.

- **Expected:** The user can open a list of every memory the assistant has saved about them.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1809 (quoted code not found in the file now); apps/extension-vscode/src/memory/memoryTreeProvider.ts:195; apps/extension-vscode/src/memory/accountMemoryStore.ts:195
- **Where to find it:** Command Palette > Code: Memory > List & remove facts (labels found in the code)
- **Needs:** a signed-in AGI Cloud account with saved facts
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Memory", press Enter.
  2. Click "List & remove facts".
  3. Compare: every saved fact appears in the list, under its topic heading.

## S39.05 Memory search.

- **Expected:** The user can search or filter their saved memories by text.
- **Code:** done. Evidence present: apps/extension-vscode/src/memory/memoryTreeProvider.ts:69; apps/extension-vscode/src/features/surfaces/treeQuickPick.ts:85
- **Where to find it:** Command Palette > Code: Memory > List & remove facts, then the search box at the top of the list (labels found in the code)
- **Needs:** a signed-in account with at least two saved facts
- **Steps:**
  1. Open "Code: Memory" > "List & remove facts".
  2. Type a word that appears in one saved fact.
  3. Compare: only matching facts stay in the list. Delete the text to see all facts again.

## S39.06 Topic grouping.

- **Expected:** Saved memories are grouped by topic (e.g. preferences, work, background) when the user reviews them.
- **Code:** done. Evidence present: apps/extension-vscode/src/memory/memoryTreeProvider.ts:39; apps/extension-vscode/src/memory/memoryTreeProvider.ts:208
- **Where to find it:** Command Palette > Code: Memory > List & remove facts (topic headings in the list) (labels found in the code)
- **Needs:** a signed-in account with facts in at least two topics
- **Steps:**
  1. Open "Code: Memory" > "List & remove facts".
  2. Look for topic headings with a count, such as "Preferences", "Decisions", "Facts", "Context", "Summaries" or "Skills".
  3. Compare: each fact sits under the topic it was saved with. Topics with no facts do not appear.

## S39.10 Add Memory manually.

- **Expected:** The user can type a new fact and save it to their memory, where later chats can use it.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2068
- **Where to find it:** Command Palette > Code: Add Memory Fact (also Code: Memory > Add a memory fact) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Add Memory Fact", press Enter.
  2. Type "I prefer Python over JavaScript for data work." and press Enter.
  3. Read the message "Saved to your account, on every client."
  4. Open "Code: Memory" > "List & remove facts" and find the new fact.
  5. Compare with Expected: ask a chat question that the fact would answer.

## S39.11 Explicit “remember this” action.

- **Expected:** From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2056
- **Where to find it:** Editor: select text, right-click it, choose "Code: Remember This" (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a file open in the editor
- **Steps:**
  1. Open any file and select a sentence.
  2. Right-click the selection and click "Code: Remember This".
  3. Compare: the "Add Memory Fact" box opens with the selected text filled in. Press Enter.
  4. Read the message "Saved to your account, on every client."

## S39.12 Automatic Memory update.

- **Expected:** After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:1719
- **Where to find it:** no screen of its own. The save is done by the server and the AGI CLI after a turn. The VS Code code has no control for it, and which turns qualify, and whether CLI on-device memory reaches this list, were not confirmed.
- **Needs:** a signed-in AGI Cloud account with Memory on
- **Steps:**
  1. Have a normal chat that states a lasting preference, such as "I usually write tests in pytest."
  2. Wait for the reply to finish.
  3. Open "Code: Memory" > "List & remove facts".
  4. Compare: a new fact from that chat is listed, as Expected says.

## S39.13 Edit Memory.

- **Expected:** The user can change the text of a saved memory and the corrected text is what later chats use.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2107
- **Where to find it:** Command Palette > Code: Memory > List & remove facts, then the edit button on a fact row (labels found in the code)
- **Needs:** a signed-in account with at least one saved fact
- **Steps:**
  1. Open "Code: Memory" > "List & remove facts".
  2. Hover a fact and click the pencil button "Edit this fact".
  3. Change the text and press Enter.
  4. Read the message "Updated in your account, on every client."
  5. Compare: reopen the list and check the new text is shown; then ask a chat question the fact should change.

## S39.14 Delete individual Memory.

- **Expected:** The user can delete one saved memory so the assistant stops using it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1935 (quoted code not found in the file now); apps/extension-vscode/src/memory/accountMemoryStore.ts:246
- **Where to find it:** Command Palette > Code: Memory > List & remove facts, then the trash button on a fact row (labels found in the code)
- **Needs:** a signed-in account with at least one saved fact
- **Steps:**
  1. Open "Code: Memory" > "List & remove facts".
  2. Hover a fact and click the trash button "Delete this fact".
  3. Read the dialog and click "Delete".
  4. Read the message "Deleted from your account, on every client."
  5. Compare: the fact is gone from the list.

## S39.15 Delete all Memory.

- **Expected:** One action deletes every saved memory, after a confirmation, and afterwards none remain.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:2015; apps/extension-vscode/src/memory/accountMemoryStore.ts:262; apps/extension-vscode/src/memory/accountMemoryClient.ts:195
- **Where to find it:** Command Palette > Code: Memory > Clear account memory (labels found in the code)
- **Needs:** a signed-in account with saved facts
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Memory", press Enter.
  2. Click "Clear account memory".
  3. Read the dialog ("Delete all N memory facts from your Cloud account?") and click "Forget everything".
  4. Read the message "All memory facts deleted from your account."
  5. Compare: open "List & remove facts" and check no facts remain.

## S39.17 Memory source/provenance.

- **Expected:** Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).
- **Code:** done. Evidence present: apps/extension-vscode/src/memory/memoryTreeProvider.ts:30; apps/extension-vscode/src/memory/memoryTreeProvider.ts:69
- **Where to find it:** Command Palette > Code: Memory > List & remove facts, then the detail line under a fact (labels found in the code)
- **Needs:** a signed-in account with facts from more than one source (a typed fact and a chat-saved fact)
- **Steps:**
  1. Open "Code: Memory" > "List & remove facts".
  2. Hover a fact (or read its detail line) to see where it came from.
  3. Compare: facts typed in VS Code show "Saved from VS Code"; facts from a chat show "Saved from the conversation" with its title; facts with no recorded source show "Source not recorded".

## S39.18 Last-updated information.

- **Expected:** Each saved memory shows when it was last added or changed.
- **Code:** done. Evidence moved: apps/extension-vscode/src/memory/memoryTreeProvider.ts:66; apps/extension-vscode/src/core/commandSetup.ts:1809 (quoted code not found in the file now); apps/extension-vscode/src/memory/accountMemoryStore.ts:195
- **Where to find it:** Command Palette > Code: Memory > List & remove facts, then hover a fact (labels found in the code)
- **Needs:** a signed-in account with at least one saved fact
- **Steps:**
  1. Open "Code: Memory" > "List & remove facts".
  2. Hover a fact and read the "Created:" line.
  3. Edit that fact with the pencil button "Edit this fact" and save.
  4. Reopen the list and hover the same fact.
  5. Compare: an "Updated:" line now appears under "Created:".

## S39.26 Organization knowledge distinct from personal Memory.

- **Expected:** Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.
- **Code:** done. Evidence present: apps/extension-vscode/src/memory/accountMemoryClient.ts:198; apps/extension-vscode/src/memory/accountMemoryStore.ts:193; apps/extension-vscode/src/memory/accountMemoryStore.ts:375; apps/extension-vscode/src/memory/memoryTreeProvider.ts:106; apps/extension-vscode/src/memory/memoryTreeProvider.ts:211
- **Where to find it:** Command Palette > Code: Memory > List & remove facts, first row (labels found in the code)
- **Needs:** an AGI Cloud account that belongs to a workspace, with a personal account memory and a workspace memory to compare
- **Steps:**
  1. Open "Code: Memory" > "List & remove facts".
  2. Read the first row: "Personal memory" with "Read in your personal chats on every device", or "<workspace name> memory" with "Workspace memory, kept apart from your personal memory".
  3. Hover that row to read the separation text.
  4. Compare: workspace facts appear only in workspace chats, and personal facts only in personal chats.

## S39.29 Sensitive-Memory controls.

- **Expected:** The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.
- **Code:** done. Evidence present: apps/extension-vscode/src/memory/memoryExclusions.ts:22; apps/extension-vscode/src/memory/memoryExclusions.ts:77
- **Where to find it:** Command Palette > Code: Memory > Never remember…, then Add a term (labels found in the code)
- **Needs:** a signed-in AGI Cloud account and a test term
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Memory", press Enter.
  2. Click "Never remember…".
  3. Click "Add a term", type a client or project name, press Enter.
  4. Compare: the term appears under "Never remembered".
  5. Run "Code: Add Memory Fact" with a sentence containing that term and compare: it should be refused.

## S39.30 Memory reset independent from chat deletion.

- **Expected:** The user can reset all memory without deleting chats, and deleting chats does not silently wipe (or silently keep) memory.
- **Code:** done. Evidence present: apps/extension-vscode/src/memory/accountMemoryStore.ts:262; apps/extension-vscode/src/memory/accountMemoryClient.ts:195
- **Where to find it:** Command Palette > Code: Memory > Clear account memory (memory reset only) (labels found in the code)
- **Needs:** a signed-in account with saved facts and at least one chat
- **Steps:**
  1. Note the chats you have in the sidebar.
  2. Press Cmd+Shift+P, run "Code: Memory", click "Clear account memory", then "Forget everything".
  3. Compare: the chats are still listed, and "List & remove facts" shows no facts.

## S39.31 Cross-model personalization.

- **Expected:** Saved memory and personalization apply the same way whichever model the user picks.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2648 (quoted code not found in the file now); apps/extension-vscode/src/memory/memoryStore.ts:54; apps/extension-vscode/src/core/commandSetup.ts:1809 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Memory is added to every turn by the same code path; the model is not checked in it.
- **Needs:** a signed-in account with Memory on and a saved fact
- **Steps:**
  1. With Memory on and a fact saved (for example "I prefer Python over JavaScript for data work"), open the "AGI Code" chat and pick a model.
  2. Ask a question the fact answers, such as "What language should you use for my data scripts?"
  3. Switch to a different model in the chat and ask the same question again.
  4. Compare: both replies use the saved fact.

## S39.32 Cross-surface Memory continuity.

- **Expected:** A memory saved on one client appears and is used on every other client signed in to the same account.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:2096; apps/extension-vscode/src/memory/accountMemoryStore.ts:195; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2648 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The other clients' memory screens were not read, so where to look in them is unverified.
- **Needs:** a second client (web app, CLI or mobile) signed in to the same account
- **Steps:**
  1. In VS Code, run "Code: Add Memory Fact" and save a fact such as "I prefer Python over JavaScript for data work."
  2. Open the web app, the CLI or mobile on the same account and look for that fact.
  3. Compare: the fact appears there and is used in their chats, as Expected says.
  4. Edit or delete the fact in VS Code and check the other client again.
