---
id: "PLAN-cli-068"
type: "test-plan"
title: "CLI · 68. Session continuity and remote-session product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "68"
---
# CLI · 68. Session continuity and remote-session product

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S68.01 Shared session identifier across supported clients.

- **Expected:** One session identifier names the same coding session on every supported client.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1163; apps/cli/src/cloud/code_sessions.rs:76; apps/cli/src/cloud/code_sessions.rs:83; apps/cli/src/cloud/code_sessions.rs:193
- **Where to find it:** Type /status in the full-screen agi (the same session id is named there); in a second terminal type agi resume <id> (labels found in the code)
- **Needs:** a second terminal on this machine; for the cloud part, a signed-in AGI account
- **Steps:**
  1. Start agi in a folder, send one message so the session is saved.
  2. Type /status and note the id on the "Session:" line.
  3. Open a second terminal in the same folder and run agi resume <that id>.
  4. Compare: the second terminal opens the same session id you noted.

## S68.02 Same conversation history.

- **Expected:** Opening the session on any client shows the same conversation history.
- **Code:** done. Evidence moved: apps/cli/src/cloud/code_sessions.rs:295; apps/cli/src/lib.rs:2060 (quoted code not found in the file now)
- **Where to find it:** agi resume <id> in a second terminal; for cloud sessions, agi code show <id> (labels found in the code)
- **Needs:** a second terminal; for the cloud part, a cloud Code session from agi code start
- **Steps:**
  1. Start agi, send a message or two, then type /export and note the last exchange.
  2. Open a second terminal and run agi resume <id> for the same session.
  3. Compare the conversation shown there with the one from /export.
  4. For a cloud session run agi code show <id> and compare its turns.

## S68.03 Same active branch.

- **Expected:** Every client shows and works on the same active git branch for the session.
- **Code:** done. Evidence present: apps/cli/src/cloud/code_sessions.rs:273; apps/cli/src/cloud/code_sessions.rs:276; apps/cli/src/agent/mod.rs:2246
- **Where to find it:** Type /status in agi; for cloud sessions, agi code show <id> (labels found in the code)
- **Needs:** a git checkout; a cloud Code session for the cloud part
- **Steps:**
  1. Start agi in a git checkout on a branch and type /status.
  2. Note the "Branch:" line.
  3. For a cloud session run agi code list, then agi code show <id>.
  4. Compare the branch shown with the branch the session works on (the "Works on:" line).

## S68.04 Same repository association.

- **Expected:** Every client associates the session with the same repository.
- **Code:** done. Evidence present: apps/cli/src/cloud/code_sessions.rs:224; apps/cli/src/cloud/code_sessions.rs:273
- **Where to find it:** agi code list (then agi code show <id>) (labels found in the code)
- **Needs:** a signed-in AGI account with at least one cloud Code session
- **Steps:**
  1. Run agi code list in a terminal and note the repository shown for each session.
  2. Run agi code show <id> for one session.
  3. Compare the "Works on:" line with the repository you expect.

## S68.05 Same worktree association.

- **Expected:** Every client associates the session with the same git worktree.
- **Code:** done. Evidence present: apps/cli/src/agent/mod.rs:2258
- **Where to find it:** Type /status in agi; /worktree or /wt to change worktree (labels found in the code)
- **Needs:** a git worktree and a second terminal
- **Steps:**
  1. Start agi from a git worktree folder and type /status.
  2. Note the "Worktree:" line.
  3. Open another terminal in a different folder and resume the same session with agi resume <id>.
  4. Type /status there and compare its "Worktree:" line; a warning shows if the terminal is in another folder.

## S68.06 Same model and instruction configuration.

- **Expected:** Every client runs the session with the same model and the same instruction files.
- **Code:** done. Evidence present: apps/cli/src/agent/mod.rs:768; apps/cli/src/app_server/developer_host.rs:1263; apps/cli/src/app_server/developer_host.rs:1948; apps/cli/src/lib.rs:2615
- **Where to find it:** Type /model in agi and /memory in agi (labels found in the code)
- **Needs:** a second terminal resuming the same session
- **Steps:**
  1. Start agi and type /model; note the model shown.
  2. Type /memory and note the instruction files it lists.
  3. Repeat in a second terminal with agi resume <id>.
  4. Compare the model and instruction files from both terminals.

## S68.07 Same task plan and checkpoints.

- **Expected:** Every client shows the same task plan and the same checkpoints for the session.
- **Code:** done. Evidence moved: apps/cli/src/agent/mod.rs:1590 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:3661; apps/cli/src/app_server/developer_host.rs:3701; apps/cli/src/app_server/developer_host.rs:3065; apps/cli/src/app_server/developer_host.rs:7279
- **Where to find it:** Type /plan show in agi, and /rewind for checkpoints (labels found in the code)
- **Needs:** a second terminal resuming the same session
- **Steps:**
  1. Start agi and ask for a multi-step task so a plan appears.
  2. Type /plan show and note the plan steps.
  3. Type /rewind and note the checkpoint list.
  4. Repeat in a second terminal with agi resume <id> and compare the plan and checkpoints.

## S68.08 Same pending approvals.

- **Expected:** An approval pending in the session shows on every attached client and can be answered from any of them.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6398; apps/cli/src/tui/tui_app.rs:4781; apps/cli/src/tui/remote_host.rs:301; apps/cli/src/tui/remote_host.rs:535; apps/cli/src/tui/tui_app.rs:1661
- **Where to find it:** Local: the "Waiting for your approval" prompt in agi. Cloud: agi code approvals, then agi code approve <handle> or agi code reject <handle> (labels found in the code)
- **Needs:** a session that asks for an approval; for the cloud part, a cloud Code session waiting on one
- **Steps:**
  1. Start a task in agi that needs a tool approval, and wait for "Waiting for your approval".
  2. Open a second terminal with agi resume <id> and check whether the same approval shows there.
  3. For a cloud session, run agi code approvals and note the handle.
  4. Answer with agi code approve <handle> and check the session shows it answered.

## S68.09 Same tool activity.

- **Expected:** Tool activity of a running turn streams to every attached client.
- **Code:** done. Evidence moved: apps/cli/src/tui/remote_host.rs:118 (quoted code not found in the file now); apps/cli/src/tui/remote_host.rs:261; apps/cli/src/tui/tui_app.rs:8197; apps/cli/src/tui/tui_app.rs:422
- **Where to find it:** Type /remote-control in agi (the full-screen interface), with AGI Mobile connected (labels found in the code)
- **Needs:** AGI Mobile signed in to the same account
- **Steps:**
  1. Start agi in full-screen mode and type /remote-control.
  2. Connect AGI Mobile to the same account and open the same session.
  3. Start a task that runs tools and watch the tool activity in agi.
  4. Compare with the tool activity shown in AGI Mobile.

## S68.12 Execution-owner indicator.

- **Expected:** Every client shows which client currently owns execution of the session.
- **Code:** done. Evidence moved: apps/cli/src/agent/mod.rs:2222; apps/cli/src/agent/mod.rs:2364; apps/cli/src/platform/runtime/writer_lease.rs:114; apps/cli/src/agent/mod.rs:1706 (quoted code not found in the file now)
- **Where to find it:** Type /status in agi; or /control in agi (labels found in the code)
- **Needs:** a second terminal resuming the same session
- **Steps:**
  1. Start agi on a saved session and type /status.
  2. Note the "Writing:" line that names the client that owns execution.
  3. Type /control and read its status text.
  4. Run agi resume <id> in a second terminal and compare the "Writing:" line in both.

## S68.13 Transfer control between clients.

- **Expected:** The user hands control of a session from one client to another explicitly.
- **Code:** done. Evidence present: apps/cli/src/agent/mod.rs:2384; apps/cli/src/agent/mod.rs:2394; apps/cli/src/claude_parity.rs:190
- **Where to find it:** Type /control release or /control take in agi (labels found in the code)
- **Needs:** a second terminal writing the same session
- **Steps:**
  1. Start agi on a session that another terminal is writing.
  2. Type /control and read who is writing it.
  3. Type /control take in this terminal.
  4. Check the reply "This terminal now writes session" and check the other terminal's status says it stopped writing.

## S68.16 Move work to cloud through an explicit handoff.

- **Expected:** The user explicitly hands a local session over to cloud execution, seeing what moves.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1166; apps/cli/src/lib.rs:3270; apps/cli/src/lib.rs:2229 (quoted code not found in the file now); apps/cli/src/cloud/code_handoff.rs:435; apps/cli/src/cloud/code_handoff.rs:484; apps/cli/src/cloud/code_handoff.rs:563
- **Where to find it:** agi code handoff (in a git checkout); or agi code start "<task>" (labels found in the code)
- **Needs:** a GitHub checkout with a pushed branch, a signed-in account and a local session
- **Steps:**
  1. In a GitHub checkout with a pushed branch, run agi code handoff.
  2. Read the review text shown before the prompt.
  3. At "Hand this session to the cloud?" answer n to cancel, or y to hand it over.
  4. Check the output: the session appears in agi code list.

## S68.18 File/environment transfer review.

- **Expected:** Before a transfer, the user reviews which files, context and environment will move.
- **Code:** done. Evidence present: apps/cli/src/cloud/code_handoff.rs:209; apps/cli/src/cloud/code_handoff.rs:318; apps/cli/src/cloud/code_handoff.rs:412; apps/cli/src/lib.rs:3288; apps/cli/src/lib.rs:3232
- **Where to find it:** agi code handoff (read the review before answering the prompt) (labels found in the code)
- **Needs:** a GitHub checkout with a pushed branch and a signed-in account
- **Steps:**
  1. Run agi code handoff without --yes in a GitHub checkout.
  2. Read the section "What moves to the cloud".
  3. Read the section "What stays on this machine" and the "Access:" line.
  4. At "Hand this session to the cloud?" answer n to stop without a transfer.

## S68.21 Host capabilities.

- **Expected:** Each machine advertises what it can host (local models, browser, MCP, computer use, code sessions).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3452; apps/cli/src/cloud/devices.rs:50; apps/cli/src/cloud/devices.rs:81
- **Where to find it:** agi devices (add --json for JSON) (labels found in the code)
- **Needs:** a signed-in AGI account with at least one device
- **Steps:**
  1. Run agi devices in a terminal.
  2. Read the "Your devices" list and each line's "can host" part.
  3. Compare with the devices you signed in on (local models, browser, MCP, computer use, remote control).
  4. Check that a device which reports nothing shows "reports nothing it can host".

## S68.26 Resume after reconnect.

- **Expected:** After a dropped connection, the client reconnects and resumes the same session state.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:916
- **Where to find it:** Type /remote-control in agi, then watch the status line for "Remote Control: reconnecting" (labels found in the code)
- **Needs:** a way to drop the network connection, and AGI Mobile connected
- **Steps:**
  1. Start agi in full-screen mode, connect Remote Control with /remote-control.
  2. Turn off the network for a short time, then turn it back on.
  3. Watch the status line for "Remote Control: reconnecting".
  4. Check the session continues with the same conversation after reconnecting.

## S68.27 Session export.

- **Expected:** The user exports a coding session (transcript and context) to a file from any client.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5921; apps/cli/src/repl/registry.rs:440
- **Where to find it:** Type /export in agi (add a path such as /export json ~/Desktop/session.json to write a file) (labels found in the code)
- **Steps:**
  1. Start agi, send a message, and type /export to see the transcript shown on screen.
  2. Type /export json followed by a file path ending in .json, for example ~/Desktop/session.json.
  3. Open the file and check it holds the transcript.
  4. Note that a relative path is saved under the workspace folder.
