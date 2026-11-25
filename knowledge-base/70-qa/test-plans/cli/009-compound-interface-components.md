---
id: "PLAN-cli-009"
type: "test-plan"
title: "CLI · 9. Compound interface components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "9"
---
# CLI · 9. Compound interface components

20 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S9.01 Searchable resource picker.

- **Expected:** A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4129; apps/cli/src/tui/tui_app.rs:4602; apps/cli/src/tui/widgets/mention_popup.rs:38
- **Where to find it:** Type @ in the message box (the Files list opens) (labels found in the code)
- **Needs:** a folder with files in it
- **Steps:**
  1. In the message box, type @ and wait for the Files list to open.
  2. Type a few letters of a file name and watch the list narrow.
  3. Press Enter to insert the chosen file into the message, or Esc to cancel.
  4. Compare: the list narrows as you type. It lists workspace files only; no projects, models or skills appear in this list.

## S9.02 Model picker.

- **Expected:** A control lists the available models and switches the conversation to the one the user picks.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/model_picker.rs:552; apps/cli/src/tui/widgets/model_picker.rs:786; apps/cli/src/tui/tui_app.rs:2035
- **Where to find it:** Type /model and press Enter (opens the Models box) (labels found in the code)
- **Steps:**
  1. In the message box, type /model and press Enter.
  2. Use the up and down arrows to choose a model.
  3. Press Enter to switch to it; a line reading Model changed to appears in the chat.
  4. Compare: the conversation now uses the chosen model. Tab or the left and right arrows change the effort level.

## S9.04 Connected-account picker.

- **Expected:** When a connector has more than one linked account, the user can pick which account a task or chat uses.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. No account picker found. Searched apps/cli/src for account picker, select account, linked account and account_id; the only hit was an account check in apps/cli/src/app_server/cloud_workspaces.rs.
- **Needs:** a connector with more than one linked account

## S9.06 Project picker.

- **Expected:** The user can pick one of their projects so the chat or task runs in that project.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1322; apps/cli/src/lib.rs:1866 (quoted code not found in the file now)
- **Where to find it:** Terminal: agi projects list, then agi projects link <project> (labels found in the code)
- **Needs:** a signed-in AGI account with at least one project
- **Steps:**
  1. In a terminal, type agi projects list and press Enter to see your account's projects.
  2. Change into the folder you want, then type agi projects link <project name or id>.
  3. Compare: the command reports the link. The project is typed by name or id; no list selection was found.

## S9.07 Repository picker.

- **Expected:** The user can choose which code repository a coding session works in, from a list or by URL/path.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:421; apps/cli/src/lib.rs:5894
- **Where to find it:** Terminal: agi -C <PATH> (or agi --repo <PATH>) (labels found in the code)
- **Needs:** a code repository folder on this computer
- **Steps:**
  1. In a terminal, type agi -C followed by the path of a code repository, then press Enter to start a session.
  2. Ask the agent which folder it is working in, or check the session header.
  3. Compare: the session works in the folder you typed. Only a folder path is accepted; no list or URL choice was found.

## S9.10 Permission-scope picker.

- **Expected:** When granting access (an API key, tool approvals or site automation), the user chooses how far the permission reaches: which capabilities, or once versus always.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:91; apps/cli/src/tui/widgets/approval_overlay.rs:366 (quoted code not found in the file now)
- **Where to find it:** Tool Approval box, shown when the agent asks to run a tool (labels found in the code)
- **Needs:** a task that asks for a tool approval
- **Steps:**
  1. Start a task that asks to run a command, such as a shell command.
  2. When the Tool Approval box appears, press the right arrow to move through Yes, No, Allow Session and Always allow.
  3. Read the description under the selected button.
  4. Compare: Yes runs it once, Allow Session lasts until the session ends, and Always allow saves a permanent rule.

## S9.12 Recurrence editor.

- **Expected:** When creating a scheduled task, the user sets how it repeats (once, daily, weekly, monthly or a custom rule) and the schedule runs on that cadence.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1520; apps/cli/src/lib.rs:4404
- **Where to find it:** Terminal: agi schedules create --name <name> --schedule "<cron>" --prompt <text> (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. In a terminal, type agi schedules create --name test --schedule "0 9 * * *" --prompt "say hello" and press Enter.
  2. Read the schedule summary the command prints.
  3. Compare: the schedule runs on the cron cadence you typed. The only recurrence input is a 5-field cron expression.

## S9.15 Data table.

- **Expected:** Tabular data is shown in a table with column headers that the user can sort (and scroll) to inspect the rows.
- **Code:** done. Evidence present: apps/cli/src/markdown.rs:475; apps/cli/src/claude_parity.rs:795; apps/cli/src/tui/tui_app.rs:5871
- **Where to find it:** Type /models and press Enter in the message box (labels found in the code)
- **Steps:**
  1. In the message box, type /models and press Enter.
  2. Read the table of models and its column headers.
  3. Compare: the table has headers. No sort control was found in the code, so check that sorting is missing.

## S9.17 Media gallery.

- **Expected:** The user can browse their images and videos as a gallery and open one in a larger viewer.
- **Code:** done. Evidence present: apps/cli/src/cloud/library.rs:87; apps/cli/src/lib.rs:7336
- **Where to find it:** Terminal: agi library --kind image (lists your items) (labels found in the code)
- **Needs:** a signed-in AGI account with images in its Library
- **Steps:**
  1. In a terminal, type agi library --kind image and press Enter to list your images.
  2. Type agi library download <id> to save one file, using an id from the list.
  3. Compare: the list shows your images. No gallery or larger viewer was found; show prints text only.

## S9.19 Timeline.

- **Expected:** The steps of a run are shown in time order, each with its state and (where known) how long it took.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:334; apps/cli/src/tui/tui_app.rs:7945
- **Where to find it:** Chat transcript while the agent runs tools (labels found in the code)
- **Steps:**
  1. Send a message that makes the agent run several tools, such as reading files.
  2. Watch the tool rows appear in the chat in order.
  3. Compare: each row shows a state glyph and turns to the check mark when done. Per-step time was not found; only the spinner shows elapsed time for the whole turn.

## S9.23 Multi-step setup wizard.

- **Expected:** A guided setup runs as ordered steps that collect the user's choices (name, model, sign-in) and saves them when it finishes.
- **Code:** done. Evidence present: apps/cli/src/onboarding.rs:795; apps/cli/src/onboarding.rs:812; apps/cli/src/onboarding.rs:1006; apps/cli/src/lib.rs:6121
- **Where to find it:** First launch: run agi in a terminal before setup is complete (labels found in the code)
- **Needs:** a first launch, or a machine where setup is not complete
- **Steps:**
  1. Run agi in an interactive terminal on a setup that has not been completed.
  2. Read the Welcome banner, then Trust This Directory, then the auth list (Skip for now is the last choice).
  3. Choose Select Model and then Select Reasoning Level, and press Enter at the end.
  4. Compare: setup completes and a Setup completed marker is written. No name step was found.

## S9.26 Version-history panel.

- **Expected:** A panel lists a resource's saved versions (when, what) and lets the user open or restore one.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4401; apps/cli/src/tui/widgets/checkpoint_picker.rs:49; apps/cli/src/repl/registry.rs:1178
- **Where to find it:** Type /rewind and press Enter in the message box (opens the Rewind box) (labels found in the code)
- **Needs:** a chat with at least one prompt sent
- **Steps:**
  1. Send at least one prompt, then type /rewind and press Enter.
  2. Use the up and down arrows to choose a prompt, then press Enter.
  3. Choose Restore code and conversation, Restore conversation or Restore code, then compare what came back.

## S9.27 Diff viewer.

- **Expected:** Changes to a file are shown as a diff (added and removed lines marked) that the user can read before accepting.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6582; apps/cli/src/tui/tui_app.rs:6663; apps/cli/src/tui/widgets/diff_review.rs:652
- **Where to find it:** Type /diff-review and press Enter in the message box (in a repository with changes) (labels found in the code)
- **Needs:** a repository with uncommitted changes
- **Steps:**
  1. In a repository with uncommitted changes, type /diff-review and press Enter.
  2. Use the up and down arrows to move between files, and Page Up or Page Down to scroll the diff.
  3. Press y, n or s for each file, then Enter to finish.
  4. Compare: added and removed lines are marked in the Diff Review box before you decide.

## S9.29 Usage meter.

- **Expected:** A meter shows how much of the plan allowance is used (per window) with the reset time, readable by assistive tech.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:675; apps/cli/src/usage_summary.rs:527; apps/cli/src/tui/tui_app.rs:6498
- **Where to find it:** Type /usage in the message box, or run agi usage in a terminal (labels found in the code)
- **Needs:** a signed-in AGI account (other accounts see an Unavailable line)
- **Steps:**
  1. In the message box, type /usage and press Enter.
  2. Look under Account usage for the lines 5-hour window, Weekly and Monthly.
  3. Compare: each line shows the percent used and when it resets. The output is text lines; no graphic bar was found.

## S9.30 Credit-balance card.

- **Expected:** The user sees their purchased credit balance in one place, next to a way to add credits.
- **Code:** done. Evidence moved: apps/cli/src/usage_summary.rs:586; apps/cli/src/usage_summary.rs:319 (quoted code not found in the file now)
- **Where to find it:** Type /usage in the message box, or run agi usage in a terminal (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. In the message box, type /usage and press Enter.
  2. Find the Purchased credits line under Account usage.
  3. Find the Add credits line below it.
  4. Compare: the balance and an add-credits link are shown together. If the server reports no credits, the line reads Credits: not reported by this server.

## S9.31 Permission summary.

- **Expected:** One view states in plain language what the assistant or a connected app is allowed to do (scopes, autonomy, allowed sites or tools).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6127
- **Where to find it:** Type /permissions and press Enter in the message box (labels found in the code)
- **Steps:**
  1. In the message box, type /permissions and press Enter.
  2. Read the Permissions: header and the rules listed under it.
  3. Type /permissions allow or /permissions ask to view one scope.
  4. Compare: the rules are shown for allow, ask, deny and session. The output is a rule list; no plain-language summary was found.

## S9.32 Approval card.

- **Expected:** When an action needs consent, an inline card names the action and offers approve and deny, and the choice resumes or stops the run.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:749; apps/cli/src/tui/tui_app.rs:1616
- **Where to find it:** Tool Approval box, shown when a task needs consent (labels found in the code)
- **Needs:** a task that needs approval
- **Steps:**
  1. Start a task that runs a shell command that is not already allowed.
  2. Read the Tool Approval box to see the action it names.
  3. Move with the left and right arrows to Yes or No, then press Enter.
  4. Compare: Yes lets the run continue; No skips that call and the agent carries on, as its description says.

## S9.33 Integration connection card.

- **Expected:** Each integration shows a card with its connection state (connected, expired, not connected) and the action to connect or disconnect.
- **Code:** done. Evidence moved: apps/cli/src/cloud/connectors.rs:176; apps/cli/src/cloud/connectors.rs:120 (quoted code not found in the file now); apps/cli/src/lib.rs:7377; apps/cli/src/tui/tui_app.rs:6099
- **Where to find it:** Terminal: agi connectors (lists connectors and their state) (labels found in the code)
- **Needs:** a signed-in AGI account (connectors help: /connectors in chat shows policy text)
- **Steps:**
  1. In a terminal, type agi connectors and press Enter.
  2. Read the line for each connector: connected since a date, or needs reconnecting with a link.
  3. Type agi connectors disconnect <connector> to remove one (it asks first).
  4. Compare: the state shown matches connected, needs reconnecting, or Available to connect. No separate expired label was found.

## S9.35 Task-progress card.

- **Expected:** A running task shows a card with its current state and progress (steps done, latest action) that updates while it runs.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3013; apps/cli/src/tui/tui_app.rs:3015; apps/cli/src/tui/tui_app.rs:1557 (quoted code not found in the file now)
- **Where to find it:** Chat, the spinner line while a task runs (labels found in the code)
- **Steps:**
  1. Send a prompt that takes a while, such as one that runs several tools.
  2. Watch the spinner line: it shows the verb, the elapsed seconds, and still working after about 10 seconds.
  3. If an approval is needed, the line reads Waiting for your approval.
  4. Compare: the line updates while the task runs. No count of steps done was found.

## S9.38 Keyboard-command palette.

- **Expected:** A keyboard shortcut opens a searchable list of commands and destinations; typing filters it and Enter runs the choice.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4036; apps/cli/src/tui/tui_app.rs:4494; apps/cli/src/tui/widgets/command_popup.rs:87
- **Where to find it:** Ctrl+P (default) with the message box empty (labels found in the code)
- **Steps:**
  1. With the message box empty, press Ctrl+P.
  2. The Commands box opens. Type part of a command name, such as model.
  3. Use the arrows to pick, then press Enter.
  4. Compare: the list narrows as you type, and Enter runs the highlighted command.
