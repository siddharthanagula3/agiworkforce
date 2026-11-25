---
id: "PLAN-cli-066"
type: "test-plan"
title: "CLI · 66. Coding-workspace frontend"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "66"
---
# CLI · 66. Coding-workspace frontend

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S66.01 Repository picker.

- **Expected:** The user chooses which repository or folder a coding session works on before it starts.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:421; apps/cli/src/lib.rs:5894
- **Where to find it:** agi --repo <PATH> (short form: agi -C <PATH>), typed in the terminal before the session starts. There is no interactive repository picker in the code. (labels found in the code)
- **Steps:**
  1. In a terminal, run agi --help and read the first lines about the -C / --repo option.
  2. Run agi -C /path/to/another/repo from a different folder.
  3. Ask the agent which folder it is in, or type /status and read the Account/Mode lines.
  4. Compare: the session should work in the folder given to --repo, not the folder you started from.

## S66.03 Worktree picker.

- **Expected:** The user picks or creates a git worktree for a coding session so parallel work stays isolated.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:5942
- **Where to find it:** /worktree (also /wt) typed in the coding session; subcommands create, add, new, remove, rm, exit are handled in the same command. (labels found in the code)
- **Needs:** a git repository
- **Steps:**
  1. Open agi in a git repository and type /worktree.
  2. Read the list headed Git worktrees (N) with each branch and path.
  3. Type /worktree create <name> to make a new worktree (argument form taken from the handler, not tried).
  4. Type /worktree and check the new worktree appears in the list.

## S66.05 Coding-session list.

- **Expected:** The user sees a list of their coding sessions and can open one.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5997; apps/cli/src/tui/tui_app.rs:2672 (quoted code not found in the file now)
- **Where to find it:** /sessions (also /history, or /resume with no argument) typed in the coding session. (labels found in the code)
- **Needs:** a saved session
- **Steps:**
  1. Open agi and type /sessions.
  2. Read the list: each row shows an 8-character id, a date and time, a message count and the title.
  3. Pick one row and confirm to open it (the key for opening was not checked in code).
  4. Compare: the list should show your saved sessions, and the chosen one should open.

## S66.06 Coding-session title.

- **Expected:** Each coding session shows a readable title, and the user can rename it where the surface offers renaming.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6026; apps/cli/src/repl/registry.rs:1031
- **Where to find it:** /rename <id> <new title> typed in the coding session; the title shows in the /sessions list. (labels found in the code)
- **Needs:** a saved session
- **Steps:**
  1. Open /sessions and note a session id.
  2. Type /rename <id> <new title> with that id and a new name.
  3. Read the reply: it should say Renamed session with the id and the new title.
  4. Type /sessions again and check the new title is shown on that row.

## S66.07 Session status.

- **Expected:** Each coding session shows whether it is running, waiting for approval, idle, failed or closed.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5791; apps/cli/src/tui/tui_app.rs:3467
- **Where to find it:** The status line above the prompt shows Waiting for your approval while a tool approval is pending. No visible running, idle, failed or closed label was found in the code. (labels found in the code)
- **Needs:** a session that asks for a tool approval
- **Steps:**
  1. Open agi in a folder and send a request that needs a tool approval, such as a shell command.
  2. Watch the status line above the prompt while the approval box is open.
  3. Compare: it should say Waiting for your approval.
  4. Look at /sessions for any other status words; none were found in the code.

## S66.09 File search.

- **Expected:** The user searches the workspace for files by name from inside the coding surface.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/mention_popup.rs:1; apps/cli/src/mentions.rs:173
- **Where to find it:** Type @ in the message box to open the file picker, then type part of a file name. (labels found in the code)
- **Needs:** a project folder with files
- **Steps:**
  1. Open agi in a project folder.
  2. Type @ in the message box.
  3. Type part of a file name, such as the start of a file you know exists.
  4. Compare: a popup titled Files should list matching files, and Enter should put the chosen path in the message.

## S66.13 Selected-code context.

- **Expected:** The user selects code in the workspace and sends that selection to the agent as context.
- **Code:** done. Evidence present: apps/cli/src/mentions.rs:435
- **Where to find it:** Type @ followed by a file path and #L with a line range (for example @path/file.rs#L10-20) in the message box. (labels found in the code)
- **Needs:** a project folder with a file
- **Steps:**
  1. Open agi in a project folder.
  2. Type @ and a file path, then #L10-20 after it.
  3. Send a message such as explain this code.
  4. Compare: the agent should receive only the lines in that range as context.

## S66.15 Integrated terminal.

- **Expected:** The user runs shell commands in a terminal attached to the coding session and sees their output.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7383; apps/cli/src/repl/mod.rs:970
- **Where to find it:** Type ! followed by a shell command in the message box, such as !ls. (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open agi in a project folder.
  2. Type !ls and press Enter.
  3. Read the output that appears in the conversation above the prompt.
  4. Compare: the command output should appear in the session.

## S66.17 Command-history view.

- **Expected:** The user can review the commands run in the session with their output and exit status.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/tui/tui_app.rs:1516 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched for command history and exit status labels in apps/cli. Found only the /history session picker (which is not a command history) and tool timings in the transcript. No view that lists commands with their exit status was found.
- **Needs:** a session with run commands

## S66.18 Diff viewer.

- **Expected:** The user views a line-level diff of the changes the agent made.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6582; apps/cli/src/tui/tui_app.rs:6641
- **Where to find it:** /diff-review typed in the coding session (a line-level view opens for changed files). (labels found in the code)
- **Needs:** a git repository with changed files
- **Steps:**
  1. In a git repository with changes, open agi and type /diff-review.
  2. Read the list of changed files gathered from git status.
  3. Move to a file with the arrow keys and read its line-level diff.
  4. Compare: the diff should show the lines the agent changed.

## S66.19 File-change summary.

- **Expected:** The user sees a summary of which files the session created, modified or deleted.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5913; apps/cli/src/platform/runtime/git.rs:434
- **Where to find it:** /diff typed in the coding session (prints a summary of changed files). (labels found in the code)
- **Needs:** a git repository with changed files
- **Steps:**
  1. In a git repository with changes, open agi and type /diff.
  2. Read the summary of changed files it prints.
  3. Compare: the summary should list the files that the session changed.
  4. Check whether created and deleted files are marked as such in the summary.

## S66.21 Hunk acceptance/rejection.

- **Expected:** The user accepts or rejects individual hunks of an agent change.
- **Code:** done. Evidence present: apps/cli/src/diff_model.rs:154; apps/cli/src/tui/widgets/diff_review.rs:355; apps/cli/src/tui/tui_app.rs:1298
- **Where to find it:** /diff-review, then press y, n or s on each file or hunk shown. (labels found in the code)
- **Needs:** a git repository with agent changes
- **Steps:**
  1. Type /diff-review in a repository with agent changes.
  2. Select a change and press y to approve it, n to reject it, or s to skip it.
  3. Read the label that appears: [y] Approved, [n] Rejected or [s] Skipped.
  4. Compare: the decision should be recorded for that change; reject should remove it from the working tree.

## S66.22 Checkpoint list.

- **Expected:** The user sees a list of checkpoints (saved states of code and conversation) for the session.
- **Code:** done. Evidence present: apps/cli/src/agent/history.rs:99; apps/cli/src/tui/tui_app.rs:4401; apps/cli/src/repl/registry.rs:1178
- **Where to find it:** /rewind typed with no argument in the coding session opens the checkpoint list. (labels found in the code)
- **Needs:** a session with at least one prompt sent
- **Steps:**
  1. Send a prompt to the agent so a checkpoint is made.
  2. Type /rewind with no other words.
  3. Read the list of checkpoints.
  4. Compare: each prompt should show as a checkpoint; with none yet, the message says no checkpoints yet.

## S66.23 Restore checkpoint.

- **Expected:** The user restores the session's code and conversation to an earlier checkpoint.
- **Code:** done. Evidence moved: apps/cli/src/agent/history.rs:132; apps/cli/src/agent/checkpoints.rs:184 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:2659 (quoted code not found in the file now); apps/cli/src/tui/widgets/checkpoint_picker.rs:159; apps/cli/src/tui/tui_app.rs:4430
- **Where to find it:** /rewind, pick a checkpoint, then choose Restore code and conversation (or Restore conversation, or Restore code). (labels found in the code)
- **Needs:** a git repository and at least two prompts
- **Steps:**
  1. Send two prompts in a repository so two checkpoints exist.
  2. Type /rewind and pick the first checkpoint.
  3. Choose Restore code and conversation.
  4. Compare: the files and the conversation should go back to that checkpoint, and the screen should say what was restored.

## S66.24 Plan mode.

- **Expected:** The user switches the agent into a plan mode where it proposes a plan and makes no edits until approved.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5674; apps/cli/src/tui/tui_app.rs:3173 (quoted code not found in the file now)
- **Where to find it:** /plan in the coding session, or press Shift+Tab until the mode shows Plan. (labels found in the code)
- **Steps:**
  1. Open agi and type /plan.
  2. Look at the mode badge in the status bar: it should say Plan.
  3. Ask for a change to a file and check the agent proposes a plan without editing.
  4. Type /plan accept to approve the plan, then compare that edits are now allowed.

## S66.25 Edit/agent mode.

- **Expected:** The user chooses a mode in which the agent may edit files and run tools on its own (edit/agent mode) versus asking first.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7321; apps/cli/src/tui/tui_app.rs:5401
- **Where to find it:** Shift+Tab until the mode shows Auto (the edit mode). (labels found in the code)
- **Steps:**
  1. Open agi and press Shift+Tab until the mode badge says Auto.
  2. Read the mode description: file edits run, and everything else asks.
  3. Ask the agent to edit a file.
  4. Compare: the edit should run without asking, while a command should still ask.

## S66.26 Permission-mode control.

- **Expected:** The user sets how much the agent must ask before acting (ask every time / auto-approve safe / autonomous), and the running session honours it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7321; apps/cli/src/tui/tui_app.rs:3173 (quoted code not found in the file now)
- **Where to find it:** Shift+Tab (Cycle permission mode) in the coding session. (labels found in the code)
- **Needs:** none (Bypass and FullAuto appear only if the session was started with them allowed)
- **Steps:**
  1. Open agi and read the mode badge (Default at start).
  2. Press Shift+Tab to step through the modes: Default, Plan, Auto, Bypass, FullAuto.
  3. Ask for a file edit or a command in Default and check it asks first.
  4. Compare: in Auto, edits run; in Bypass or FullAuto, prompts are skipped, so no approval box appears.

## S66.27 Context-usage indicator.

- **Expected:** The workspace shows how much of the model's context window the session has used.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3522; apps/cli/src/tui/tui_app.rs:3422 (quoted code not found in the file now)
- **Where to find it:** /status (or /context, /ctx) typed in the coding session; the status bar also has a ctx indicator. (labels found in the code)
- **Steps:**
  1. Open agi and send a few messages.
  2. Type /status.
  3. Read the line that starts with Context:.
  4. Compare: the percentage should grow as the conversation gets longer.

## S66.28 Usage/cost indicator.

- **Expected:** The coding surface shows how much plan usage or money the user has spent.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1358 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:5707
- **Where to find it:** /cost typed in the coding session (also /usage). (labels found in the code)
- **Needs:** a session with at least one message
- **Steps:**
  1. Send a message to the agent.
  2. Type /cost.
  3. Read the Turns line and the cost line that follows.
  4. Compare: turns and money spent should match what you sent; /usage shows plan usage.

## S66.29 Background task list.

- **Expected:** The user sees a list of the session's background tasks (long commands, spawned jobs) and their state.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** /tasks typed in the coding session (also /tasks show <id>, /tasks stop <id>). (labels found in the code)
- **Needs:** a background task
- **Steps:**
  1. Start a long background task, for example with /bg or /background.
  2. Type /tasks.
  3. Read the list of tasks and their state.
  4. Type /tasks show <id> for one task and compare with Expected.

## S66.30 Subagent panel.

- **Expected:** The user sees the subagents the session spawned, what each is doing and its result.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** /agents typed in the coding session, then the Running tab. (labels found in the code)
- **Needs:** a session that starts subagents
- **Steps:**
  1. Start a task that uses subagents.
  2. Type /agents.
  3. Press the Right arrow to switch to the Running tab.
  4. Compare: the tab should list the running subagents under Running subagents.

## S66.39 Session recap.

- **Expected:** The user gets a recap of what the session did: goal, decisions, files touched, checks run, next steps.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:300; apps/cli/src/claude_parity.rs:1946
- **Where to find it:** /recap typed in the coding session. (labels found in the code)
- **Needs:** a session with some work done
- **Steps:**
  1. Do some work in a session, such as an edit and a command.
  2. Type /recap.
  3. Wait for the answer.
  4. Compare: the recap should cover goals, decisions, files changed, checks run and next steps.

## S66.41 Continue in another client.

- **Expected:** The user moves an ongoing coding session to another client (terminal, editor, desktop, phone) and continues it there.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:916; apps/cli/src/tui/tui_app.rs:4345
- **Where to find it:** /desktop (or /app) to continue in the desktop app; /continue-with-cloud to move it to the cloud; agi resume in the terminal to pick it up again. (labels found in the code)
- **Needs:** the desktop app installed, or a signed-in account for the cloud
- **Steps:**
  1. In the coding session, type /desktop and open the desktop app.
  2. Check the session continues there with the same history.
  3. Or type /continue-with-cloud and read the reply.
  4. Compare: the session should continue in the other client and the message should say it continued in another app.
