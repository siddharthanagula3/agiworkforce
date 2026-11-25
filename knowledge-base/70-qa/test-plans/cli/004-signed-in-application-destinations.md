---
id: "PLAN-cli-004"
type: "test-plan"
title: "CLI · 4. Signed-in application destinations"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "4"
---
# CLI · 4. Signed-in application destinations

22 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S4.01 New-chat home.

- **Expected:** Signed-in user lands on (or opens) an empty new-chat screen with a ready composer from which a new conversation starts.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1447 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:5840
- **Where to find it:** agi (opens the app after sign-in), then type /new (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Run agi in a terminal and sign in.
  2. Look at the first screen: it should show the input box ready to type in.
  3. Type /new and press Enter.
  4. Check the screen is a fresh empty conversation with a ready input box, compared with Expected.

## S4.02 Existing conversation.

- **Expected:** Opening a past conversation (from the list or a link) shows its transcript and lets the user continue it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6002; apps/cli/src/tui/tui_app.rs:4345
- **Where to find it:** agi, then type /resume (or /sessions) and press Enter (labels found in the code)
- **Needs:** a signed-in account with at least one past conversation
- **Steps:**
  1. In the app, type /resume and press Enter.
  2. In the session list that opens, move to a past conversation and press Enter.
  3. Check that its earlier messages are shown.
  4. Type a new message and send it to confirm the conversation continues.

## S4.03 Conversation search.

- **Expected:** A search destination where the user types a keyword, gets past conversations matching titles or message text, and opens one.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:260; apps/cli/src/lib.rs:7851; apps/cli/src/sessions.rs:918
- **Where to find it:** agi --search "<keyword>" (from a terminal), or in the app type /sessions search <keyword> (labels found in the code)
- **Needs:** a signed-in account with past conversations
- **Steps:**
  1. In a terminal run agi --search "<a word from an old chat>".
  2. Check that past conversations with that word in their title or messages are listed.
  3. Optionally, in the app type /sessions search <a word> and press Enter.
  4. Open one result and compare with Expected.

## S4.04 Archived conversations.

- **Expected:** A destination lists the user's archived conversations and lets them open, restore or delete them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:5588
- **Where to find it:** agi session list --archived (terminal); restore with agi session unarchive <id>; delete with agi session delete <id> (labels found in the code)
- **Needs:** a signed-in account with an archived conversation
- **Steps:**
  1. Run agi session list --archived in a terminal.
  2. Check that archived conversations are listed.
  3. Run agi session unarchive <id> with an id from the list, then run agi session list to confirm it left the archived list.
  4. Run agi session delete <id> and read the confirmation prompt before answering.

## S4.06 Projects index.

- **Expected:** A Projects destination lists the user's projects and lets them open or create one.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1288; apps/cli/src/lib.rs:3673
- **Where to find it:** agi projects list (terminal); create with agi projects create <name> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Run agi projects list.
  2. Check that the account's projects are listed.
  3. Run agi projects create "Test project" and then run agi projects list again.
  4. Check the new project appears.

## S4.07 Project overview.

- **Expected:** Opening a project shows its home: name, description/instructions summary, and entry points to its chats and files.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3687; apps/cli/src/cloud/mod.rs:525
- **Where to find it:** agi projects show <project name or id> (terminal) (labels found in the code)
- **Needs:** a signed-in account with a project
- **Steps:**
  1. Run agi projects list and pick a project name.
  2. Run agi projects show "<project name>".
  3. Check the output shows the name, description, instructions, knowledge files and conversation count.
  4. Note whether it offers links to the project's chats and files, compared with Expected.

## S4.10 Project instructions.

- **Expected:** A place to view and edit a project's instructions, which then apply to chats in that project.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1951; apps/cli/src/memory.rs:30; apps/cli/src/tui/tui_app.rs:6330
- **Where to find it:** agi projects edit <project name or id> --instructions "<text>" (terminal); view with agi projects show <project> (labels found in the code)
- **Needs:** a signed-in account with a project
- **Steps:**
  1. Run agi projects show "<project name>" and note the current instructions.
  2. Run agi projects edit "<project name>" --instructions "Answer in short bullet points".
  3. Run agi projects show "<project name>" again.
  4. Check the new instructions are shown, compared with Expected.

## S4.12 Project Memory.

- **Expected:** A project memory view shows what has been remembered for that project, with scope controls, separately from account memory.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:1951; apps/cli/src/memory.rs:230; apps/cli/src/tui/tui_app.rs:6330
- **Where to find it:** agi memory add --project "<text>" (terminal); list account memories with agi memory list (labels found in the code)
- **Needs:** a signed-in account with a project
- **Steps:**
  1. Link a folder to a project with agi projects link "<project name>" from that folder.
  2. Run agi memory add --project "Test memory for this project".
  3. Run agi memory list.
  4. Check whether the project memory is shown separately from account memory, compared with Expected.

## S4.17 Scheduled-task manager.

- **Expected:** A scheduled-task manager lists the user's schedules with cadence/status and lets them create, edit, pause/resume, run now and delete.
- **Code:** done. Evidence present: apps/cli/src/schedules.rs:302; apps/cli/src/schedules.rs:316; apps/cli/src/schedules.rs:330; apps/cli/src/lib.rs:4436
- **Where to find it:** agi schedules list (terminal); create with agi schedules create, change with agi schedules edit, pause/resume/run/delete with the matching subcommands (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Run agi schedules list and read the status and cadence columns.
  2. Run agi schedules create with a name, a cron expression such as "0 9 * * *", and a prompt (see agi schedules create --help for flags).
  3. Run agi schedules pause <name>, then agi schedules resume <name>.
  4. Run agi schedules run <name>, then agi schedules delete <name> and read the prompt before confirming.
  5. Compare each step with Expected.

## S4.18 Routine details.

- **Expected:** Opening one routine/schedule shows its configuration (prompt, cadence, next run) and its run history.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1592; apps/cli/src/lib.rs:4502
- **Where to find it:** agi schedules runs <id or name> (terminal) (labels found in the code)
- **Needs:** a signed-in account with a schedule that has run
- **Steps:**
  1. Run agi schedules list to get a schedule id or name.
  2. Run agi schedules runs "<name>".
  3. Check the run history is listed.
  4. Check that the schedule's prompt, cadence and next run are visible, compared with Expected.

## S4.19 Coding-session home.

- **Expected:** A coding home lists the user's coding sessions and starts a new one on a repository or runtime.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1447 (quoted code not found in the file now); apps/cli/src/lib.rs:8321; apps/cli/src/tui/tui_app.rs:6002
- **Where to find it:** agi code list (terminal); start one with agi code start "<task>" inside a GitHub checkout (labels found in the code)
- **Needs:** a signed-in account and a GitHub checkout
- **Steps:**
  1. Run agi code list in a terminal.
  2. Check the cloud coding sessions are listed.
  3. Inside a GitHub checkout, run agi code start "Add a README line" and answer the review prompt.
  4. Run agi code list again and check the new session appears.

## S4.20 Coding-session workspace.

- **Expected:** A coding-session workspace shows the session transcript, file changes/diffs and a composer to steer the next turn.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1447 (quoted code not found in the file now); apps/cli/src/lib.rs:8321
- **Where to find it:** agi code show <session id> (terminal); open in browser with agi code open <session id> (labels found in the code)
- **Needs:** a signed-in account with a cloud Code session
- **Steps:**
  1. Run agi code list and copy a session id.
  2. Run agi code show <session id>.
  3. Check the transcript of each turn is shown.
  4. Look for file changes or diffs and a box to send the next instruction; compare with Expected.

## S4.23 Library.

- **Expected:** A Library destination lists everything the account produced or uploaded (files, images, videos, documents, artifacts) with filters and open/download actions.
- **Code:** done. Evidence present: apps/cli/src/cloud/library.rs:87; apps/cli/src/lib.rs:7296
- **Where to find it:** agi library (terminal); filter with agi library --kind image and agi library --search <text> (labels found in the code)
- **Needs:** a signed-in account with library items
- **Steps:**
  1. Run agi library.
  2. Check the list shows generated and uploaded images, videos and files.
  3. Run agi library --kind image and check only images are listed.
  4. Run agi library show <id> or agi library download <id> for one item and check it opens or saves.

## S4.25 Artifact gallery.

- **Expected:** An artifact gallery lists the user's generated artifacts and opens any of them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1360; apps/cli/src/lib.rs:3861; apps/cli/src/tui/tui_app.rs:5615
- **Where to find it:** agi artifacts list (terminal); also the in-app /artifacts (labels found in the code)
- **Needs:** a signed-in account with artifacts
- **Steps:**
  1. Run agi artifacts list.
  2. Check the artifacts are listed newest first.
  3. Run agi artifacts show <id> to print one, or agi artifacts open <id> to open it in the browser.
  4. Compare with Expected.

## S4.27 Image studio.

- **Expected:** A dedicated image studio where the user writes a prompt, picks style/size options, generates images and sees results/history in one place.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:938 (quoted code not found in the file now); apps/cli/src/lib.rs:3467; apps/cli/src/tui/tui_app.rs:5576
- **Where to find it:** In the app, type /image <prompt> (flags such as --aspect 16:9 come before the prompt); also agi image "<prompt>" in a terminal (labels found in the code)
- **Needs:** a signed-in paid or allowed account
- **Steps:**
  1. In the app, type /image --aspect 16:9 a red bicycle on a beach and press Enter.
  2. Watch for the generated image to appear, and press Esc to stop if needed.
  3. Type /image last to see the settings the last image used.
  4. Run agi library and check the image is in the account library.

## S4.33 Custom-assistant manager.

- **Expected:** A signed-in destination lists the user's custom assistants (GPT/Gem-style) and lets them open, create, edit and delete them.
- **Code:** done. Evidence present: apps/cli/src/agents.rs:635; apps/cli/src/agents.rs:1147; apps/cli/src/agents.rs:1165; apps/cli/src/agents.rs:1188
- **Where to find it:** In the app, type /agents (then /agents show <name>, /agents new <name>, /agents delete <name> --yes) (labels found in the code)
- **Steps:**
  1. In the app, type /agents and press Enter to list agents.
  2. Type /agents new my-helper and check a new agent is created.
  3. Type /agents show my-helper to view it.
  4. Type /agents delete my-helper --yes and check it is removed.

## S4.35 Skills manager.

- **Expected:** A skills manager lists installed and available skills and lets the user install, enable/disable, author and remove them.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6199; apps/cli/src/tui/tui_app.rs:6540; apps/cli/src/tui/tui_app.rs:731 (quoted code not found in the file now)
- **Where to find it:** In the app, type /skills (list), /skills import <path>, /skills-toggle; author with /create-skill (labels found in the code)
- **Needs:** a folder with a SKILL.md file to import
- **Steps:**
  1. In the app, type /skills and press Enter to list installed skills.
  2. Type /skills-toggle and turn one skill off, then back on.
  3. Type /skills import <path to a SKILL.md folder> to install one.
  4. Type /skills remove <name> to remove a skill and compare the list with Expected.

## S4.36 Plugins manager.

- **Expected:** A plugins manager lists installed and available plugins and lets the user install, configure, update and remove them.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:7645; apps/cli/src/tui/tui_app.rs:6292
- **Where to find it:** In the app, type /plugins; also agi plugin list and agi marketplace browse in a terminal (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. In the app, type /plugins and press Enter.
  2. Look at the installed and available tabs.
  3. In a terminal run agi marketplace browse, then agi plugin list.
  4. Use agi plugin disable <name> and agi plugin enable <name> and check the list changes.

## S4.38 Model catalog.

- **Expected:** A model catalog lists the models the user can reach with capabilities/context/price and lets them pick one or set a default.
- **Code:** done. Evidence present: apps/cli/src/repl/slash_commands.rs:214; apps/cli/src/provider.rs:184; apps/cli/src/lib.rs:6764
- **Where to find it:** In the app, type /models (list) or /model (picker); in a terminal run agi models list and agi models set <model> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. In the app, type /models and press Enter to see the model list with its flags.
  2. Type /model and choose a model from the picker.
  3. In a terminal run agi models list.
  4. Run agi models set <model name> and check the default changes.

## S4.39 Usage dashboard.

- **Expected:** A usage dashboard shows current usage against plan limits per window (session/weekly/credits), reset times and recent usage history.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:4049 (quoted code not found in the file now); apps/cli/src/usage_summary.rs:358
- **Where to find it:** In the app, type /usage; in a terminal run agi usage and agi plans (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. In the app, type /usage and press Enter.
  2. Check the token totals, cost and per-model breakdown.
  3. In a terminal run agi usage.
  4. Check the account allowance against the plan limits and reset times, compared with Expected.

## S4.41 Personal settings.

- **Expected:** A personal settings destination lets the signed-in user view and change their own preferences (profile, appearance, personalization, notifications) and saves them.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5887; apps/cli/src/repl/registry.rs:2304
- **Where to find it:** In the app, type /personalize, /config, or /memories (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. In the app, type /personalize and answer the prompts such as What to call you.
  2. Type /config show and check the saved values.
  3. Type /memories and check the auto-memory setting can be changed.
  4. Restart the app and check the values are kept.

## S4.44 Help and feedback.

- **Expected:** A help-and-feedback destination links to help/docs/status and lets the user send product feedback or a bug report from inside the product.
- **Code:** done. Evidence present: apps/cli/src/cloud/feedback.rs:65; apps/cli/src/claude_parity.rs:202; apps/cli/src/tui/tui_app.rs:7800
- **Where to find it:** In the app, type /help; to send feedback type /feedback <text> or /bug <text> (labels found in the code)
- **Needs:** a signed-in account and network access
- **Steps:**
  1. In the app, type /help and press Enter to see the command list.
  2. Type /feedback I would like a dark theme and press Enter.
  3. Check the app confirms the feedback was sent.
  4. Compare the help output with Expected for links to docs and status.
