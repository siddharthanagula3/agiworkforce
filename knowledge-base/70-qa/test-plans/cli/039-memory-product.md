---
id: "PLAN-cli-039"
type: "test-plan"
title: "CLI · 39. Memory product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "39"
---
# CLI · 39. Memory product

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S39.02 Memory enable/disable control.

- **Expected:** A visible switch turns Memory on or off, and when off the assistant neither reads nor saves memories.
- **Code:** done. Evidence moved: apps/cli/src/agent/mod.rs:560 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:466 (quoted code not found in the file now)
- **Where to find it:** agi memory off, then agi memory on (check with agi memory status) (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Type agi memory status in a terminal and note the line it prints.
  2. Type agi memory off.
  3. Type agi memory status again.
  4. Compare the last line with Expected: it should say Memory is off, and nothing is carried from one conversation to the next.

## S39.04 Saved-Memory list.

- **Expected:** The user can open a list of every memory the assistant has saved about them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4098; apps/cli/src/lib.rs:7764; apps/cli/src/cloud/mod.rs:634
- **Where to find it:** agi memory list (labels found in the code)
- **Needs:** a signed-in AGI account with at least one memory (if none, the screen says so)
- **Steps:**
  1. Type agi memory list in a terminal.
  2. Read the header line that gives the number of memories and the workspace name.
  3. Compare the list with Expected: every saved memory should appear, with its text under its topic.

## S39.06 Topic grouping.

- **Expected:** Saved memories are grouped by topic (e.g. preferences, work, background) when the user reviews them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4119
- **Where to find it:** agi memory list (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Add two memories with different categories: type agi memory add --category Work <text>, then agi memory add --category Preferences <text>.
  2. Type agi memory list.
  3. Compare with Expected: each topic should appear as its own heading, with its memories under it.
  4. Memories with no category appear under the heading General.

## S39.10 Add Memory manually.

- **Expected:** The user can type a new fact and save it to their memory, where later chats can use it.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:4098; apps/cli/src/lib.rs:7764; apps/cli/src/lib.rs:2078 (quoted code not found in the file now); apps/cli/src/cloud/mod.rs:687
- **Where to find it:** agi memory add <text> (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Type agi memory add I prefer short answers with bullet points.
  2. Read the line printed back.
  3. Type agi memory list and find the new line.
  4. Compare with Expected: the new fact should be saved and listed.

## S39.11 Explicit “remember this” action.

- **Expected:** From inside a conversation the user can explicitly ask the assistant to remember something and gets confirmation it was saved.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6330; apps/cli/src/repl/registry.rs:1990; apps/cli/src/lib.rs:2078 (quoted code not found in the file now)
- **Where to find it:** In a chat with the assistant, type Remember that I prefer short answers, then answer the prompt Remember this in {tier} memory? (labels found in the code)
- **Needs:** a chat with the assistant and the ability to answer an approval prompt
- **Steps:**
  1. Start a chat and type: Remember that I prefer short answers.
  2. When the approval prompt appears, read its text.
  3. Approve it.
  4. Compare with Expected: a confirmation should appear that the item was remembered.

## S39.12 Automatic Memory update.

- **Expected:** After ordinary conversations the assistant automatically saves new durable facts to memory (when allowed).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6518; apps/cli/src/agent/mod.rs:2783; apps/cli/src/memory_pipeline.rs:343
- **Where to find it:** /memories (row Auto-memory, then row Max facts) (labels found in the code)
- **Needs:** a chat with the assistant, with Auto-memory set to ON
- **Steps:**
  1. Start the CLI chat and type /memories.
  2. Check that the row Auto-memory shows ON, and note the number in Max facts.
  3. Press Esc, have a normal conversation that states a lasting fact about you, then type /memories again.
  4. Compare with Expected: the stored count should go up, showing that a new fact was saved automatically.

## S39.13 Edit Memory.

- **Expected:** The user can change the text of a saved memory and the corrected text is what later chats use.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4173; apps/cli/src/cloud/mod.rs:726
- **Where to find it:** agi memory edit <id|text> <new text> (labels found in the code)
- **Needs:** a saved memory in the account
- **Steps:**
  1. Type agi memory list and copy the id of a memory.
  2. Type agi memory edit <id> <new text>.
  3. Read the line printed back.
  4. Type agi memory list again and compare with Expected: the memory should show the new text under the same id.

## S39.14 Delete individual Memory.

- **Expected:** The user can delete one saved memory so the assistant stops using it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4098; apps/cli/src/lib.rs:7764; apps/cli/src/lib.rs:4332; apps/cli/src/cloud/mod.rs:852
- **Where to find it:** agi memory forget <id|text> (labels found in the code)
- **Needs:** a saved memory in the account
- **Steps:**
  1. Type agi memory list and copy the id of a memory.
  2. Type agi memory forget <id>.
  3. Read the line printed back.
  4. Type agi memory list and compare with Expected: the memory should no longer be listed.

## S39.16 Prioritize Memory.

- **Expected:** The user can mark a memory as important (pin) so it is kept and preferred over others.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4201; apps/cli/src/cloud/mod.rs:726
- **Where to find it:** agi memory pin <id|text> and agi memory unpin <id|text> (labels found in the code)
- **Needs:** a saved memory in the account
- **Steps:**
  1. Type agi memory pin <id>.
  2. Read the line printed back.
  3. Type agi memory list and look for the star marker at the start of that memory's line.
  4. Compare with Expected: the memory should show as pinned, and the header should say pinned memories are used first.

## S39.17 Memory source/provenance.

- **Expected:** Each saved memory shows where it came from (typed by the user, imported, or learned from a named conversation).
- **Code:** done. Evidence present: apps/cli/src/cloud/memory.rs:59; apps/cli/src/lib.rs:4165
- **Where to find it:** agi memory list (labels found in the code)
- **Needs:** a signed-in AGI account; a memory learned from a named chat is needed for the learned-in line
- **Steps:**
  1. Type agi memory list.
  2. Read the bracket text after each memory id: it shows the origin (default web), the scope and the updated date.
  3. For a memory learned in a chat, read the line learned in '<chat title>' under it.
  4. Compare with Expected: the origin should show where it came from. The code shows only the origin label and the chat title, not the words typed by the user.

## S39.18 Last-updated information.

- **Expected:** Each saved memory shows when it was last added or changed.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4141
- **Where to find it:** agi memory list (labels found in the code)
- **Needs:** a signed-in AGI account with at least one memory
- **Steps:**
  1. Type agi memory list.
  2. Read the bracket text after each memory id: it ends with updated and a date (YYYY-MM-DD).
  3. Edit one memory with agi memory edit, then run agi memory list again.
  4. Compare with Expected: the updated date for that memory should be today.

## S39.21 Memory import.

- **Expected:** The user can bring memories from a file or another assistant into their memory, preview them, and later chats use them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4269; apps/cli/src/cloud/mod.rs:810
- **Where to find it:** agi memory import <file> [--source <name>] (labels found in the code)
- **Needs:** a text or markdown file with memories to import
- **Steps:**
  1. Create a plain text or markdown file with a few facts, one per line, in a folder outside the project.
  2. Type agi memory import <file> --source Other.
  3. Read the line printed back.
  4. Type agi memory list and compare with Expected: the new memories should be listed, and later chats should use them.

## S39.22 Memory export.

- **Expected:** The user can download their saved memories in a readable file.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4244
- **Where to find it:** agi memory export --out <new file> (labels found in the code)
- **Needs:** a signed-in AGI account with at least one memory
- **Steps:**
  1. Type agi memory export --out ~/Desktop/memories-export.json (the file must not exist yet).
  2. Read the line printed back.
  3. Open the file in a text editor.
  4. Compare with Expected: the file should contain every saved memory. It is JSON, not a formatted document.

## S39.23 Memory-capacity display where relevant.

- **Expected:** Where memory has a limit, the user can see how much of it is used and which memories fall outside it.
- **Code:** done. Evidence present: apps/cli/src/memory_pipeline.rs:149; apps/cli/src/tui/widgets/memories_settings.rs:53; apps/cli/src/tui/tui_app.rs:6532
- **Owner decision is open on this item.**
- **Where to find it:** /memories (row Max facts) (labels found in the code)
- **Needs:** a chat with the assistant
- **Steps:**
  1. Start the CLI chat and type /memories.
  2. Read the Max facts row: it shows how many are stored and the limit, for example [N of 500 stored].
  3. Press Esc.
  4. Compare with Expected: the screen shows the count and limit, but does not list which memories fall outside the limit.

## S39.24 Project-scoped Memory.

- **Expected:** Memories can be confined to one project, are used only in that project, and the user can tell which memories are project-only.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3791 (quoted code not found in the file now); apps/cli/src/repl/registry.rs:1952; apps/cli/src/repl/registry.rs:1986; apps/cli/src/memory.rs:87; apps/cli/src/agent/mod.rs:582 (quoted code not found in the file now)
- **Where to find it:** agi projects link <project>, then agi memory add --project <text>, then agi memory list (labels found in the code)
- **Needs:** a project in the account and a folder linked to it
- **Steps:**
  1. In a project folder, type agi projects link <project name>.
  2. Type agi memory add --project Our release uses staging first.
  3. Read the line printed back.
  4. Type agi memory list and look for the label this project on that memory.
  5. Compare with Expected: the memory should show as project-only and only that project's chats should use it.

## S39.26 Organization knowledge distinct from personal Memory.

- **Expected:** Organization or workspace knowledge is kept apart from personal memory: work memories never appear in personal chats and vice versa, and the user can tell which is which.
- **Code:** done. Evidence present: apps/cli/src/cloud/mod.rs:617; apps/cli/src/lib.rs:4090
- **Where to find it:** agi memory list (labels found in the code)
- **Needs:** a second workspace on the same account (the command to switch workspace was not found in the code)
- **Steps:**
  1. Type agi memory list and read the header: it names the workspace the memories belong to.
  2. If the account has a second workspace, switch to it and type agi memory list again.
  3. Compare with Expected: each workspace should show only its own memories, with its name in the header.

## S39.29 Sensitive-Memory controls.

- **Expected:** The user can stop sensitive information from being remembered (e.g. never-remember terms or categories), and sensitive facts such as credentials are refused automatically.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:4237; apps/cli/src/cloud/personalization.rs:296 (quoted code not found in the file now)
- **Where to find it:** agi memory never --add <term>, then agi memory never (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Type agi memory never --add salary.
  2. Read the line printed back: it lists the never-remember terms.
  3. Type agi memory add My salary is 90000, then read the refusal line.
  4. Compare with Expected: the sensitive fact should be refused with a Not remembered line.

## S39.31 Cross-model personalization.

- **Expected:** Saved memory and personalization apply the same way whichever model the user picks.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3791 (quoted code not found in the file now); apps/cli/src/agent/mod.rs:575 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Model-independence is enforced in the agent code path, which was not traced to a visible screen.
- **Needs:** a signed-in AGI account and access to two models
- **Steps:**
  1. Type agi memory add I prefer short answers.
  2. Start a chat, switch with /model to one model, and ask what the assistant knows about your answer style.
  3. Switch with /model to a different model, ask the same question.
  4. Compare with Expected: both models should use the same saved memory.

## S39.32 Cross-surface Memory continuity.

- **Expected:** A memory saved on one client appears and is used on every other client signed in to the same account.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:4321; apps/cli/src/cloud/mod.rs:322 (quoted code not found in the file now); apps/cli/src/agent/mod.rs:577 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. Sync is done by the account server; the CLI prints only the on-every-client line and does not show the other client.
- **Needs:** a second client signed in to the same account
- **Steps:**
  1. On this machine, type agi memory add I work on the billing team.
  2. On a second client signed in to the same account, look for the memory or ask the assistant about it.
  3. Compare with Expected: the memory should appear and be used there too.
