---
id: "PLAN-cli-012"
type: "test-plan"
title: "CLI · 12. New-chat experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "12"
---
# CLI · 12. New-chat experience

15 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S12.01 Empty conversation canvas.

- **Expected:** Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1442 (quoted code not found in the file now); apps/cli/src/lib.rs:8321
- **Where to find it:** Run "agi" in a folder; the first screen shows "Welcome to AGI" with an empty chat area and the composer. Type "/new" ("Start a new conversation") to get a fresh empty chat. (labels found in the code)
- **Steps:**
  1. Open a terminal, go to any folder, and type "agi" then press Enter.
  2. Look at the first screen: it shows "Welcome to AGI", the Model and Folder rows, and no earlier messages.
  3. Check that the composer is ready for typing below the start content.
  4. Type "/new" and press Enter, then confirm the conversation area is empty again.

## S12.03 Neutral greeting when personalization is disabled.

- **Expected:** When personalization is off (or no name is known), the new-chat greeting is neutral and shows no personal details.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:2773; apps/cli/src/tui/tui_app.rs:1448 (quoted code not found in the file now); apps/cli/src/lib.rs:8321
- **Where to find it:** Run "agi" (start screen shows "Welcome to AGI"); personal-name setting is under "/personalize". (labels found in the code)
- **Steps:**
  1. Type "agi" in a terminal and look at the first screen: the code shows "Welcome to AGI", Model and Folder rows and no name line.
  2. Type "/personalize" to see how replies address you and check that no personal detail appears on the new-chat screen.
  3. Compare with Expected: the greeting should be neutral with no personal details.

## S12.06 Recent Project shortcuts.

- **Expected:** The new-chat screen offers shortcuts to the user's recent projects that open the project or start a chat in it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3634
- **Where to find it:** "agi projects recent" in a terminal lists recent folders; no recent-project shortcut was found on the new-chat screen. (labels found in the code)
- **Needs:** a folder you have worked in before
- **Steps:**
  1. Type "agi projects recent" in a terminal and press Enter.
  2. Read the list of folders it prints (default limit 10).
  3. Compare with Expected: the code only lists folders for "agi -C"; it does not open a project or start a chat from the new-chat screen.

## S12.07 Recent-file suggestions.

- **Expected:** When starting a chat the user is offered their recently used files to attach in one step.
- **Code:** done. Evidence moved: apps/cli/src/mentions.rs:78 (quoted code not found in the file now); apps/cli/src/mentions.rs:32
- **Where to find it:** In the composer, type "@" to open the file picker; recently changed files are listed first. (path not confirmed in the code; trust the screen)
- **Needs:** a folder with recently edited files
- **Steps:**
  1. Start "agi" in a git folder where you changed a few files recently.
  2. Type "@" in the composer.
  3. Look at the picker: the most recently modified files should appear at the top.
  4. Compare with Expected: the code ranks by file modification time, not by files you used in chat, so a file you only read will not move up.

## S12.10 Search entry.

- **Expected:** From the new-chat screen the user can explicitly start a web search for the next message.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6418; apps/cli/src/repl/slash_commands.rs:352; apps/cli/src/app_server/surfaces.rs:1537; apps/cli/src/models/streaming.rs:535; apps/cli/src/models/streaming.rs:779; apps/cli/src/agent/chat.rs:838
- **Where to find it:** Type "/search <question>" in the composer and press Enter. (labels found in the code)
- **Steps:**
  1. Start "agi" and type "/search" followed by a question, for example "/search latest release notes".
  2. Press Enter to send.
  3. Look for the answer to be based on a web search (the code sets a flag so only the next message searches).
  4. Compare with Expected: the search should apply to that one message only.

## S12.12 Image-creation entry.

- **Expected:** From the new-chat screen the user can enter an image-creation mode whose send generates an image.
- **Code:** done. Evidence moved: crates/agiworkforce-command-registry/src/lib.rs:491; apps/cli/src/tui/tui_app.rs:4676 (quoted code not found in the file now); apps/cli/src/lib.rs:8321
- **Where to find it:** Type "/image <prompt>" in the composer and press Enter (alias "/imagine"). (labels found in the code)
- **Steps:**
  1. Start "agi" and type "/image a red bicycle" then press Enter.
  2. Wait for the generated image to appear, shown as an image chip.
  3. Type "/image open" to open the last generated image.
  4. Compare with Expected: the code has no image-creation mode; it is a one-shot command, so check whether the send generates an image as described.

## S12.14 Voice entry.

- **Expected:** From the new-chat screen the user can start a spoken (voice-mode) conversation.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** Type "/voice" in the composer (alias "/v") to start voice input or voice mode. (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Start "agi" and type "/voice" then press Enter.
  2. Speak into the microphone when prompted.
  3. Check that your speech is turned into text and a spoken conversation can run.
  4. Compare with Expected: the code's help text says "Toggle voice input", so confirm it starts a voice conversation rather than only input.

## S12.15 Agentic-work entry.

- **Expected:** From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1485 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:78; apps/cli/src/lib.rs:8321
- **Where to find it:** Type "/workflow <goal>" in the composer; "/bg <instruction>" and "/thread <instruction>" are related entries. (labels found in the code)
- **Steps:**
  1. Start "agi" and type "/workflow" to see the usage text.
  2. Type "/workflow <a goal>" and press Enter.
  3. Check that the goal is broken into steps and run as subagents.
  4. Compare with Expected: the code may refuse the workflow with a blocker message (workflow_blocker), which should be shown on screen.

## S12.16 Coding entry.

- **Expected:** From the new-chat surface the user can start a coding session (a repository/workspace-aware coding agent).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2773; apps/cli/src/lib.rs:8294
- **Where to find it:** Run "agi" inside a project folder (or "agi -C <folder>"); the start screen shows the Folder row. (labels found in the code)
- **Needs:** a code project folder
- **Steps:**
  1. Open a terminal, go to a code project folder, and type "agi".
  2. Look at the first screen for the "Folder" row showing this project path.
  3. Type a coding request, for example "list the files in this project".
  4. Compare with Expected: the agent should work on this repository.

## S12.17 Temporary-chat control.

- **Expected:** Before or during a new chat the user can switch it to a temporary chat that is not kept in history.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:433; apps/cli/src/cli_options.rs:226
- **Where to find it:** Launch with "agi --no-session-persistence" (flag only); no in-chat temporary switch was found. (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Type "agi --no-session-persistence" in a terminal and start a chat.
  2. Check whether the chat is kept in history afterwards (for example with "/history").
  3. Compare with Expected: the code only offers this as a launch flag for the whole run, not a switch before or during a chat.

## S12.18 Default-model display.

- **Expected:** The new-chat screen shows which model the next message will use before the user sends.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2784; apps/cli/src/tui/tui_app.rs:2461; apps/cli/src/lib.rs:8321
- **Where to find it:** Run "agi"; the first screen shows the Model row with the model name, and the status line shows it too. (labels found in the code)
- **Steps:**
  1. Type "agi" and look at the first screen's Model row.
  2. Read the model name shown next to it.
  3. Type "/model" to see the model list and compare the name with what the next message will use.
  4. Compare with Expected: the model name should be visible before you send a message.

## S12.20 Default-Project selection.

- **Expected:** Before sending, the user can pick the project a new chat will be created in.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1322; apps/cli/src/lib.rs:3821
- **Where to find it:** Type "agi projects link <project>" in the folder you want to use (no in-chat project picker was found). (labels found in the code)
- **Needs:** an account project
- **Steps:**
  1. In a terminal, go to the folder for the new chat.
  2. Type "agi projects link <project id or name>" and press Enter.
  3. Type "agi" and check the first screen for the Folder row and the linked project.
  4. Compare with Expected: the project should be chosen before sending; the code links a folder, not a chat, from the command line.

## S12.21 Mode explanation and examples.

- **Expected:** The new-chat screen explains the available modes and gives examples of what each is for.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1807 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1822 (quoted code not found in the file now)
- **Where to find it:** Press Shift+Tab on the chat screen to cycle modes; a banner shows each mode's explanation. (labels found in the code)
- **Steps:**
  1. Start "agi" and press Shift+Tab once.
  2. Read the banner that appears, which names the mode and explains it.
  3. Press Shift+Tab again to cycle through the other modes.
  4. Compare with Expected: each explanation should appear, but the code has no example text for each mode.

## S12.22 First-use feature education.

- **Expected:** First-time users are shown a short introduction to the product's key features before or at their first chat.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:6121; apps/cli/src/onboarding.rs:264
- **Where to find it:** First-run setup when "agi" is started for the first time (steps: welcome banner, trust this folder, choose auth, model, effort, permission mode). (path not confirmed in the code; trust the screen)
- **Needs:** a fresh install (first-run setup not yet done)
- **Steps:**
  1. Remove the setup marker or use a fresh install, then type "agi".
  2. Read the welcome banner and each setup step.
  3. Compare with Expected: the code shows setup choices only; no short feature introduction was found.

## S12.24 Guest limitations and sign-in conversion.

- **Expected:** A signed-out visitor can use the product within stated guest limits and is prompted to sign in to lift them.
- **Code:** done. Evidence moved: apps/cli/src/onboarding.rs:267; apps/cli/src/lib.rs:6121; apps/cli/src/onboarding.rs:420 (quoted code not found in the file now)
- **Where to find it:** First-run setup, choose "Skip for now" or "AGI cloud" (Sign in to get started, open to everyone). (labels found in the code)
- **Needs:** a fresh install and no account
- **Steps:**
  1. Start "agi" for the first time and continue to the auth choice.
  2. Choose "Skip for now" and start a chat.
  3. Check whether a sign-in prompt or limit message appears, and compare with Expected.
  4. Type "/login" to see the sign-in route.
