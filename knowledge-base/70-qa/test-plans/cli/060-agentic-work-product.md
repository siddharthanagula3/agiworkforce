---
id: "PLAN-cli-060"
type: "test-plan"
title: "CLI · 60. Agentic work product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "60"
---
# CLI · 60. Agentic work product

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S60.01 Work-task composer.

- **Expected:** The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3867; apps/cli/src/tui/tui_app.rs:4092; apps/cli/src/tui/tui_app.rs:8270
- **Where to find it:** agi code start "<task>" (type in a terminal), or agi code --help to see it (labels found in the code)
- **Needs:** a signed-in AGI account and a GitHub checkout
- **Steps:**
  1. Run agi code --help and find the start line.
  2. Run agi code start "Summarize the README in this folder" (add -y to skip the review prompt).
  3. Read the review text shown before the cloud session starts.
  4. Check the line 'Working on it in the cloud with' and the link it prints, then compare with Expected.

## S60.02 Task title.

- **Expected:** Each work task shows a readable title in the task list, and the user can set or change it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6026; apps/cli/src/lib.rs:300; apps/cli/src/repl/registry.rs:1031
- **Where to find it:** /rename <title> (typed in the chat), then /history to see the list (labels found in the code)
- **Steps:**
  1. Start the agi chat screen.
  2. Type /rename Quarterly report and press Enter.
  3. Type /history and press Enter.
  4. Check that the session shows the new title, compared with Expected.

## S60.03 Objective.

- **Expected:** The user states the objective of the task, and the objective is stored with the run and shown back.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4092; apps/cli/src/tui/tui_app.rs:8270
- **Where to find it:** agi code start "<task>", then agi code show <id> (labels found in the code)
- **Needs:** a signed-in AGI account and a GitHub checkout
- **Steps:**
  1. Run agi code start "Fix the typo in docs/intro.md" -y and note the session id it prints.
  2. Run agi code show <id>.
  3. Check that the task text is shown back as what the session should do.
  4. Compare with Expected.

## S60.05 Source selection.

- **Expected:** While composing a task the user can choose which sources it may use (project, files, connectors).
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/mention_popup.rs:17; apps/cli/src/mentions.rs:315
- **Where to find it:** Type @ in the message box, then look at the list headed Files (labels found in the code)
- **Steps:**
  1. Start the agi chat screen.
  2. Type @ in the message box.
  3. Look at the popup and type a few letters of a file name to narrow it.
  4. Check the list shows project files, compared with Expected.

## S60.06 Tool selection.

- **Expected:** The user can choose which tools the task may use before it runs.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:390; apps/cli/src/lib.rs:6296
- **Where to find it:** /tools to view the tools; choose at start with agi --allowedTools <names> (labels found in the code)
- **Steps:**
  1. Type /tools and press Enter.
  2. Read the list titled Tools the model can call in this session.
  3. Quit and start again with agi --allowedTools <names> using one tool name.
  4. Type /tools again and check only that tool is listed, compared with Expected.

## S60.08 Model/profile selection.

- **Expected:** The user can pick the model (or profile) the task runs on, and the run records it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5553; apps/cli/src/tui/tui_app.rs:3267 (quoted code not found in the file now)
- **Where to find it:** /model (typed in the chat), then pick a model (labels found in the code)
- **Steps:**
  1. Type /model and press Enter.
  2. Pick a model from the list.
  3. Send a short message.
  4. Compare the model shown in the status line with Expected.

## S60.09 Effort selection.

- **Expected:** The user can set reasoning effort for the task and it is sent with the run.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6452; apps/cli/src/tui/tui_app.rs:6431
- **Where to find it:** /effort (typed in the chat), then pick a level (labels found in the code)
- **Steps:**
  1. Type /effort and press Enter.
  2. Pick a level such as high from the list.
  3. Check the message Effort set to ... and the effort: label in the status line.
  4. Send a short message and compare with Expected.

## S60.10 Spend budget.

- **Expected:** The user can cap how much a task may spend, and the run stops at the cap.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:1429
- **Where to find it:** /budget <credits> (typed in the chat), for example /budget 5 (labels found in the code)
- **Needs:** a paid account with credits
- **Steps:**
  1. Type /budget 5 and press Enter.
  2. Check the reply Each turn now stops once it has spent 5 credits.
  3. Send a task that costs more than the cap.
  4. Check that the turn stops at the cap, compared with Expected.

## S60.13 Reviewable task plan.

- **Expected:** Before the agent acts, the user sees its plan and can approve, edit or reject it.
- **Code:** done. Evidence present: apps/cli/src/app_server/developer_host.rs:5845; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8743
- **Where to find it:** /plan to enter plan mode, then /plan show and /plan accept or /plan reject <feedback> (labels found in the code)
- **Steps:**
  1. Type /plan and press Enter.
  2. Send a task so the model writes a plan with update_plan.
  3. Type /plan show and read the steps.
  4. Type /plan accept, or /plan reject Use a smaller scope, and check the reply, compared with Expected.

## S60.14 Step list.

- **Expected:** The task view lists its steps with an accurate per-step status.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5615
- **Where to find it:** /plan show (typed in the chat) after the model writes a plan (labels found in the code)
- **Steps:**
  1. Send a task that makes the model write a multi-step plan.
  2. Type /plan show and press Enter.
  3. Read the numbered steps shown under Plan.
  4. Check the line with steps outstanding, compared with Expected.

## S60.16 Running-step indicator.

- **Expected:** While a task runs, the view marks which step is currently executing.
- **Code:** done. Evidence moved: apps/cli/src/tui/transcript_cell.rs:4; apps/cli/src/tui/tui_app.rs:5123 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:8270
- **Where to find it:** Message box: send a task, then watch the transcript while it runs (labels found in the code)
- **Steps:**
  1. Send a task that uses several tools.
  2. Watch the footer while it works.
  3. Look for the tool rows in the transcript marked as running.
  4. Compare the running row with Expected.

## S60.17 Parallel-work indicator.

- **Expected:** When the agent works on several things at once, the view shows the parallel work.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2993
- **Where to find it:** Send a task that makes the model run several tools or subagents at once, then look under the transcript (labels found in the code)
- **Steps:**
  1. Send a task that asks for several independent checks at once.
  2. While it runs, look below the transcript for the line with the symbol and working at once.
  3. Read the count and whether it says tools or subagents.
  4. Compare with Expected.

## S60.18 Clarification request.

- **Expected:** The agent can pause a task to ask the user a clarifying question and continue with the answer.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/question_overlay.rs:181; apps/cli/src/tui/tui_app.rs:1729; apps/cli/src/tui/tui_app.rs:5933 (quoted code not found in the file now)
- **Where to find it:** Send a task that makes the agent call ask_user; the overlay Question from the agent opens (labels found in the code)
- **Steps:**
  1. Send a task such as: ask me which of two file names to use before you create anything.
  2. Wait for the overlay titled Question from the agent.
  3. Pick one choice, or choose Type your own answer and type a reply.
  4. Check the agent continues with your answer, compared with Expected.

## S60.19 Approval request.

- **Expected:** When the agent needs permission for an action, the task pauses and the user can approve or deny it.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:548; apps/cli/src/tui/approval_broker.rs:23
- **Where to find it:** Start with agi --permission-mode approve, send an action that changes a file, then the Tool Approval box opens (labels found in the code)
- **Needs:** a test folder that you can delete
- **Steps:**
  1. Start agi --permission-mode approve in a test folder.
  2. Send: create a file named test.txt that contains the word hi.
  3. When the Tool Approval box opens, read the buttons.
  4. Press No, then check that test.txt was not created, compared with Expected.

## S60.20 Task steering.

- **Expected:** The user can redirect a running task with new guidance without starting over.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:4613; apps/cli/src/tui/tui_app.rs:5599 (quoted code not found in the file now)
- **Where to find it:** Message box: type a new message while the agent is still working, then press Enter (labels found in the code)
- **Steps:**
  1. Send a task that takes some time.
  2. While it works, type new guidance and press Enter.
  3. Check the footer says the message is queued.
  4. Check the task is not restarted when the current turn finishes, compared with Expected.

## S60.22 Resume.

- **Expected:** The user can resume a paused or stopped task from where it left off.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6002; apps/cli/src/lib.rs:3372 (quoted code not found in the file now)
- **Where to find it:** /resume (typed in the chat), then Enter on a session in the list (labels found in the code)
- **Needs:** a saved chat session
- **Steps:**
  1. Type /resume and press Enter.
  2. Use the arrow keys to choose a session.
  3. Press Enter to resume it.
  4. Check that the earlier messages appear and the reply says Resumed session, compared with Expected.

## S60.23 Cancel.

- **Expected:** The user can stop a running task and the run is cancelled on the server.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5123 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:5133 (quoted code not found in the file now)
- **Where to find it:** While the agent works, press Esc or Ctrl-C in the message box (labels found in the code)
- **Steps:**
  1. Send a task that takes some time.
  2. While it works, look at the footer that says Esc or Ctrl-C to cancel.
  3. Press Esc.
  4. Check that the run stops and the transcript says it was stopped, compared with Expected.

## S60.26 Duplicate task.

- **Expected:** The user can duplicate a task into a new editable task.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6014; apps/cli/src/repl/registry.rs:1353
- **Where to find it:** /branch or /fork (typed in the chat) (labels found in the code)
- **Steps:**
  1. Have a chat with a few messages.
  2. Type /branch and press Enter.
  3. Read the reply Branched conversation ... Resume with: agi --session <id>.
  4. Open the new session and edit a message, compared with Expected.

## S60.28 Save as Skill.

- **Expected:** From a finished task the user can save its procedure as a reusable Skill.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:319; apps/cli/src/claude_parity.rs:891
- **Where to find it:** Type /save-skill <name> (typed in the chat) after a finished task (labels found in the code)
- **Needs:** a finished task in the chat
- **Steps:**
  1. Finish a short task in the chat.
  2. Type /save-skill release-notes and press Enter.
  3. Let the agent finish writing the skill.
  4. Check that .agiworkforce/skills/release-notes/SKILL.md exists in the folder, compared with Expected.

## S60.29 Results summary.

- **Expected:** When a task ends the user sees a summary of the result.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4092; apps/cli/src/claude_parity.rs:300
- **Where to find it:** not found in the code. No summary panel shown when a task ends was found. The final reply in the transcript is what the agent writes. /recap sends a prompt that asks the model for a recap. Searched for summary, result and recap in apps/cli/src.

## S60.30 Generated deliverables.

- **Expected:** Files the task produced are listed and can be opened or downloaded.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5902; apps/cli/src/tui/tui_app.rs:8270
- **Where to find it:** not found in the code. No list of files a task produced, with open or download, was found. /artifacts lists account artifacts and /diff shows workspace changes. Searched for deliverable, output file and artifact in apps/cli/src.

## S60.32 Task history.

- **Expected:** The user can browse past tasks with their state and open any of them.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5997; apps/cli/src/tui/tui_app.rs:4304
- **Where to find it:** agi code list --status all, then agi code show <id} (labels found in the code)
- **Needs:** a signed-in AGI account with past cloud sessions
- **Steps:**
  1. Run agi code list --status all.
  2. Read each session with its state in brackets.
  3. Run agi code show <id> for one session.
  4. Compare with Expected. For local chats, type /history instead.

## S60.34 Cross-device task continuation.

- **Expected:** A task started on one device can be followed and acted on from another device.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:829 (quoted code not found in the file now); apps/cli/src/lib.rs:3372 (quoted code not found in the file now)
- **Where to find it:** agi code list, then agi resume --teleport <id> in a GitHub checkout, or agi code open <id> in the browser (labels found in the code)
- **Needs:** two devices signed in to the same AGI account, and a GitHub checkout on the second device
- **Steps:**
  1. Start a cloud task on one device with agi code start "<task>".
  2. On a second device, run agi code list.
  3. Run agi code open <id> to follow it in the browser, or agi resume --teleport <id> in the same checkout.
  4. Compare the state on both devices with Expected.
