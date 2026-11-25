---
id: "PLAN-cli-018"
type: "test-plan"
title: "CLI · 18. Conversation-level controls"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "18"
---
# CLI · 18. Conversation-level controls

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S18.01 Automatic title.

- **Expected:** A new conversation gets a meaningful title automatically without the user naming it.
- **Code:** done. Evidence moved: apps/cli/src/sessions.rs:486; apps/cli/src/tui/tui_app.rs:3550 (quoted code not found in the file now)
- **Where to find it:** agi, then type /sessions (or /history). Each row shows the date, the message count and a title taken from the first message. (labels found in the code)
- **Steps:**
  1. Start agi and send a first message that has a clear topic, for example: Plan a birthday dinner for six people.
  2. Send one or two more messages in the same conversation.
  3. Type /sessions and press Enter.
  4. Look at the row for this conversation: it should show a title made from your first message (cut at 50 characters, with ... if longer), with no naming step from you.

## S18.02 Manual rename.

- **Expected:** The user can rename a conversation and the new title persists.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6027; apps/cli/src/tui/tui_app.rs:6026
- **Where to find it:** agi, then type /sessions, select a row and press r (the hint reads r rename), or type /rename <id> <new title>. (labels found in the code)
- **Steps:**
  1. Type /sessions and press Enter.
  2. Move to a conversation with the arrow keys and press r.
  3. Check what the prompt now shows (the code hands off a rename command with the session id filled in) and type the new title, then press Enter.
  4. Type /sessions again and check that the row shows the new title.
  5. Quit with agi and start it again, then type /sessions: the new title should still be there.

## S18.04 Archive and restore.

- **Expected:** A conversation can be archived (hidden, kept) and later restored.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1960; apps/cli/src/lib.rs:5777
- **Where to find it:** Terminal, outside the chat: agi session archive <session_id>, then agi session unarchive <session_id>. List with agi session list, and agi session list --archived. (labels found in the code)
- **Needs:** a test conversation with a session id
- **Steps:**
  1. Run agi session list and copy the session id of a test conversation.
  2. Run agi session archive <session_id>; read the line Archived '<session_id>'. and the Unarchive with: hint.
  3. Run agi session list: the conversation should be missing. Run agi session list --archived: it should be there.
  4. Run agi session unarchive <session_id>; read Unarchived '<session_id>'.
  5. Run agi session list again: the conversation should be back in the active list.

## S18.05 Delete.

- **Expected:** A conversation can be deleted, with confirmation, and it disappears everywhere.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1963; apps/cli/src/lib.rs:5792
- **Where to find it:** Terminal, outside the chat: agi session delete <session_id> (add --force or --yes to skip the prompt). (labels found in the code)
- **Needs:** a disposable test conversation
- **Steps:**
  1. Pick a test conversation and run agi session show <session_id> to read its transcript.
  2. Run agi session delete <session_id>.
  3. Read the prompt Permanently delete session '<session_id>'? This cannot be undone. Answer no first; read Aborted. Session '<session_id>' was not deleted.
  4. Run the delete again and confirm; read Deleted '<session_id>'.
  5. Run agi session list and agi session show <session_id>: the conversation should no longer appear.

## S18.06 Duplicate.

- **Expected:** A conversation can be duplicated into a new, independent conversation.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6014; apps/cli/src/tui/tui_app.rs:6015
- **Where to find it:** agi, then type /fork (alias /branch) in a conversation with a few messages. (labels found in the code)
- **Steps:**
  1. Have a conversation with at least two exchanges.
  2. Type /fork and press Enter and read the system message it shows.
  3. Type /sessions: a new row titled (fork) followed by the original title should appear.
  4. Open the new conversation and send a new message; then open the original and check it has no new message.

## S18.09 Change conversation mode.

- **Expected:** Within a conversation, the user can switch its working mode (e.g. chat vs agent/work/plan) and later turns follow it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7329; apps/cli/src/tui/tui_app.rs:5398
- **Where to find it:** agi, then press Shift+Tab in the chat; the Mode: label is shown above the input. Plan mode is also /plan. (labels found in the code)
- **Steps:**
  1. Start agi and read the Mode: label; it should read Default.
  2. Press Shift+Tab and read the new mode label (Plan, then Auto, then Bypass, then FullAuto, cycling).
  3. Set Plan, send a request that asks for a file change, and check that it is treated as a plan rather than an edit.
  4. Send a second request in the same conversation and check that it follows the mode you set.
  5. Compare the mode you set with the Mode: label each time.

## S18.10 Change privacy mode through an explicit flow.

- **Expected:** The user switches a conversation's privacy mode (e.g. temporary/incognito, local-only) through an explicit flow that explains the consequence.
- **Code:** done. Evidence moved: apps/cli/src/claude_parity.rs:226; apps/cli/src/tui/tui_app.rs:4142 (quoted code not found in the file now)
- **Where to find it:** agi, then type /privacy-settings to read the mode, and /privacy-mode local, byok or managed to switch (also /trust-boundary). (labels found in the code)
- **Needs:** a Local conversation; a signed-in account for Managed
- **Steps:**
  1. Type /privacy-settings and read the Privacy settings screen and the current mode.
  2. Type /privacy-mode managed in a Local conversation.
  3. Read Privacy mode was not changed. and the line that says Local -> Managed Cloud requires an explicit reviewable handoff.
  4. Read the hint to run /continue-with-cloud and check that it describes the preview and consent step before anything is sent.

## S18.15 Jump to latest.

- **Expected:** After scrolling up, one control returns the view to the latest message.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4162
- **Where to find it:** agi, then in the chat press Ctrl-End (also listed as Jump to the latest output in the keyboard help). (labels found in the code)
- **Needs:** a conversation long enough to scroll
- **Steps:**
  1. Send a request that produces a long answer.
  2. Scroll up with PageUp until the start of the answer is visible.
  3. Press Ctrl-End (or End when the input is empty).
  4. Check that the view returns to the newest message at the bottom.

## S18.18 Conversation export.

- **Expected:** The whole conversation can be exported to a file (e.g. Markdown, PDF, JSON).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6037; apps/cli/src/tui/tui_app.rs:6033
- **Where to find it:** agi, then type /export, followed by a file name, for example /export conversation.md, /export json conversation.json or /export answer answer.md. (labels found in the code)
- **Steps:**
  1. Have a conversation with several messages.
  2. Type /export conversation.md and press Enter.
  3. Read the message Exported the conversation to <path>. and open the file to check that it holds the whole conversation.
  4. Type the same /export command again and read the message that says the file already exists and nothing was written.

## S18.21 Conversation details inspector.

- **Expected:** A conversation details view shows its metadata (created/updated, model, message count, id, project).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3406 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:5791
- **Where to find it:** agi, then type /status. (labels found in the code)
- **Steps:**
  1. Have a conversation with several messages.
  2. Type /status and press Enter.
  3. Read the Model, Mode, Turns and Tokens lines.
  4. Type /sessions and read the row for this conversation: date and message count are shown.

## S18.22 Context and source inspector.

- **Expected:** The user can inspect what context and sources the conversation is using (files, instructions, memory, token budget).
- **Code:** done. Evidence present: apps/cli/src/agent/history.rs:22
- **Where to find it:** agi, then type /context (or /ctx). (labels found in the code)
- **Steps:**
  1. Have a conversation with several turns and a file or two in context.
  2. Type /context and press Enter.
  3. Read the Context: bar with its percentage and token count, then the In context: breakdown.
  4. Compare the breakdown with the expected items (files, instructions, memory, token budget).

## S18.23 Usage summary.

- **Expected:** The conversation shows a usage summary (tokens/cost) for the conversation as a whole.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6498; apps/cli/src/tui/tui_app.rs:6505
- **Where to find it:** agi, then type /usage. (labels found in the code)
- **Steps:**
  1. Have a conversation with several turns.
  2. Type /usage and press Enter.
  3. Read Input tokens, Output tokens and the cache lines.
  4. Read the Session estimate line and compare it with the conversation so far.

## S18.24 Conversation-level instructions.

- **Expected:** The user can set instructions that apply only to this conversation.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:237
- **Where to find it:** not found in the code. No conversation-only instructions control was found. The cited apps/cli/src/lib.rs:237 is the --system-prompt startup flag for a whole run. Searched instruction in tui_app.rs, claude_parity.rs, repl/slash_commands.rs and repl/registry.rs; /output-style <name> --session is a style, not instructions.

## S18.25 Conversation-level enabled tools.

- **Expected:** Tool enablement (web search, code, etc.) can be set for this conversation and persists across its turns.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:390
- **Where to find it:** not found in the code. Only the startup flag --allowedTools (apps/cli/src/lib.rs:390) and /tools (list, a tool name, log, retry in apps/cli/src/claude_parity.rs) were found. No per-conversation enable or disable control was found.

## S18.27 Active tasks associated with the conversation.

- **Expected:** The conversation shows the active tasks/runs started from it and their status.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** agi, then type /thread with a short task, then /tasks (alias /task). (labels found in the code)
- **Steps:**
  1. Type /thread followed by a short task, for example: /thread summarise the README in this folder.
  2. Type /tasks and press Enter.
  3. Read the list of tasks and their status for the task you started.
  4. Wait for it to finish, type /tasks again and compare the status with the Expected.

## S18.28 Continuation on another device.

- **Expected:** A conversation started on one device can be continued on another.
- **Code:** done. Evidence moved: apps/cli/src/cloud/mod.rs:241; apps/cli/src/claude_parity.rs:141 (quoted code not found in the file now)
- **Where to find it:** agi, then type /continue-elsewhere (add open to open it in the browser). (labels found in the code)
- **Needs:** a signed-in account, a Managed privacy conversation, and a second device or browser
- **Steps:**
  1. Sign in with agi login and use a conversation in Managed privacy mode.
  2. Type /continue-elsewhere and read the link and the words Continue it on the web.
  3. Type /continue-elsewhere open to open it in the browser, or open the web or desktop app chat list on another device.
  4. Find the same conversation there and send a message; check that it appears in this conversation.
