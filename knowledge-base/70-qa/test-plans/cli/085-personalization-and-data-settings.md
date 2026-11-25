---
id: "PLAN-cli-085"
type: "test-plan"
title: "CLI · 85. Personalization and data settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "85"
---
# CLI · 85. Personalization and data settings

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S85.02 Custom instructions.

- **Expected:** The user can write custom instructions on the surface and they are applied to that surface's chats until changed or switched off.
- **Code:** done. Evidence present: apps/cli/src/compaction.rs:241; apps/cli/src/init.rs:86
- **Where to find it:** Terminal: run "agi init", then open ~/.agiworkforce/instructions.md in a text editor. Account-level custom instructions are not in the CLI: "/personalize show" prints a web link to Settings > General. (labels found in the code)
- **Steps:**
  1. In Terminal, run "agi init" (it creates ~/.agiworkforce/instructions.md if it is missing).
  2. Open ~/.agiworkforce/instructions.md and add a line under the heading, for example "Always answer in one sentence." Save the file.
  3. Run "agi", ask a simple question, and check that the reply follows the line.
  4. Remove the line, save, start a new chat, ask the same question, and check the reply no longer follows it.

## S85.03 Communication style.

- **Expected:** The user can choose how the assistant communicates (tone, length, formatting) on the surface and replies follow it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3334 (quoted code not found in the file now); apps/cli/src/agent/mod.rs:1828
- **Where to find it:** In an agi session, type "/personalize show", then "/personalize set style concise" (other fields: length, formatting, warmth, enthusiasm, headings, emoji). (labels found in the code)
- **Needs:** a signed-in AGI account (Managed Cloud mode)
- **Steps:**
  1. Start "agi" and type "/personalize show"; look for the line "Response style" with the value not set.
  2. Type "/personalize set style concise"; look for "Response style set to concise."
  3. Type "/personalize set length shorter"; look for "Length set to shorter."
  4. Ask a question such as "What is a closure?" and compare the reply's tone, length and formatting with Expected.

## S85.05 Saved Memory.

- **Expected:** The user can see, add, edit and delete saved memories on the surface and turn memory on or off, and saved memories are used in that surface's chats.
- **Code:** done. Evidence moved: apps/cli/src/cloud/personalization.rs:274 (quoted code not found in the file now); apps/cli/src/lib.rs:2943
- **Where to find it:** Terminal: "agi memory" with the subcommands list, add, edit, forget, on, off, status ("agi memory list" shows saved memories). (labels found in the code)
- **Needs:** a signed-in AGI account (Managed Cloud mode)
- **Steps:**
  1. Run "agi memory status"; look for "Memory is on:" or "Memory is off:".
  2. Run "agi memory add Prefers short answers", then "agi memory list"; look for the new memory in the list.
  3. Run "agi memory edit <id or text> Prefers detailed answers", then "agi memory list" to see the new text.
  4. Run "agi memory forget <id or text>", then "agi memory list"; the memory should be gone.
  5. Run "agi memory off", start a chat, and compare with Expected: memories should not be used while memory is off.

## S85.11 Activity-history preference.

- **Expected:** The user can choose whether their chats are kept in history (and synced to the account) or not saved.
- **Code:** done. Evidence present: apps/cli/src/config.rs:1528; apps/cli/src/lib.rs:6073
- **Where to find it:** In an agi session, type "/config set history false" (alias: "/config set keep-history false"). Check with "/config get history" and "agi --config". (labels found in the code)
- **Steps:**
  1. Type "/config get history"; look for "history = true" or "Unknown or unset key: 'history'" if it was never set.
  2. Type "/config set history false"; look for "history = false (saved)".
  3. Start a new chat, send one message, quit, then run "agi history" in Terminal and check whether the new chat is listed.
  4. Run "agi --config"; look for "Keep session history: false" and compare with Expected.

## S85.14 Diagnostic-sharing choice.

- **Expected:** The user can choose whether crash reports and diagnostics are sent, and the choice is honoured.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5887; apps/cli/src/config.rs:1473
- **Where to find it:** In an agi session, type "/config set crash-reports true" (or false) and "/config set product-analytics false". Read back with "/config get crash-reports". (labels found in the code)
- **Needs:** none to change the setting; a Managed Cloud account for reports to be sent
- **Steps:**
  1. Type "/config get crash-reports"; look for "crash-reports = false", the default.
  2. Type "/config set crash-reports true"; look for "crash-reports = true (saved)".
  3. Type "/config get crash-reports" again and confirm the value is true; then set it back to false.
  4. Type "/config set product-analytics false" and check with "/config get product-analytics"; compare with Expected.

## S85.16 Temporary-chat preferences.

- **Expected:** The user can make new chats temporary by default (not saved, not used for memory) and the preference is honoured.
- **Code:** done. Evidence present: apps/cli/src/config.rs:1528; apps/cli/src/lib.rs:6073
- **Where to find it:** not found in the code. Searched apps/cli/src for temporary, incognito and temp-chat controls: found only help text about temporary chats in apps/cli/src/claude_parity.rs and the per-run --no-session-persistence flag, with no by-default setting; the nearest control is "/config set history false" (S85.11), which does not mention memory.

## S85.17 Archived-chat management.

- **Expected:** The user can list archived chats, restore them, and delete them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:5588
- **Where to find it:** Terminal: "agi session list", "agi session list --archived", "agi session archive <id>", "agi session unarchive <id>", "agi session delete <id>". (labels found in the code)
- **Needs:** a saved session on this computer
- **Steps:**
  1. Run "agi session list" and note the id of one session.
  2. Run "agi session archive <id>", then "agi session list"; the session should no longer appear in the active list.
  3. Run "agi session list --archived"; look for "Archived sessions (agi session unarchive <id> restores one):" with the session in it.
  4. Run "agi session unarchive <id>"; look for "Unarchived" and check the session is back in "agi session list".
  5. Run "agi session delete <id>" and answer the confirmation; compare with Expected (the help text says it is permanent).

## S85.19 Shared-link management.

- **Expected:** The user can list the chat links (and published pages) they have shared and revoke any of them.
- **Code:** done. Evidence moved: apps/cli/src/cloud/shares.rs:29 (quoted code not found in the file now); apps/cli/src/cloud/shares.rs:35; apps/cli/src/lib.rs:7349
- **Where to find it:** Terminal: "agi shares" to list links and "agi shares revoke <token>" to turn one off. (labels found in the code)
- **Needs:** a signed-in AGI account with at least one shared chat link
- **Steps:**
  1. Run "agi shares"; look for "Shared conversation links" and the token of each link.
  2. Run "agi shares revoke <token>" and answer the confirmation (or add -y).
  3. Run "agi shares" again; the revoked link should be gone.
  4. Open the revoked link's address in a private browser window and check it no longer opens.

## S85.20 Data export.

- **Expected:** The user can download a copy of their account data (chats, memory, files, settings) from the surface.
- **Code:** done. Evidence present: apps/cli/src/cloud/data_export.rs:52; apps/cli/src/cloud/client.rs:990
- **Where to find it:** Terminal: "agi export-data" (optionally "agi export-data --out <folder>"). (labels found in the code)
- **Needs:** a signed-in AGI account; the export can take a while to prepare
- **Steps:**
  1. Run "agi export-data"; the first run requests the export and reports that it is being prepared.
  2. Wait, then run "agi export-data" again; look for "Your export is ready. Run `agi export-data` again to download it."
  3. Run "agi export-data" once more; look for "Saved" followed by the file path.
  4. Open the saved file and check it holds chats, memory, files and settings, comparing with Expected.

## S85.22 Import Memory.

- **Expected:** The user can import memories exported from another assistant and they become saved memories.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:4269; apps/cli/src/cloud/mod.rs:810
- **Where to find it:** Terminal: "agi memory import <file>" with an optional "--source <name>" (the default source is Other). (labels found in the code)
- **Needs:** a signed-in AGI account and a text or markdown file with memories
- **Steps:**
  1. Create a plain text file of memories in your own words, for example memories.txt on the Desktop.
  2. Run "agi memory import ~/Desktop/memories.txt --source "Other assistant""; look for the line that starts "Imported" and reports the count.
  3. Run "agi memory list" and find the imported memories.
  4. Run the same import command again; look for "Nothing new to import: every memory in that file is already in your account."
