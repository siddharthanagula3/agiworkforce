---
id: "PLAN-cli-059"
type: "test-plan"
title: "CLI · 59. Approvals and human-in-the-loop UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "59"
---
# CLI · 59. Approvals and human-in-the-loop UI

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S59.01 One-action approval.

- **Expected:** When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:81 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi, then ask the agent to create a file; the approval prompt (Tool Approval) appears in the chat (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Start agi in an empty test folder.
  2. Type: create a file named notes.txt with one line of text.
  3. At the approval prompt press y (Yes).
  4. Check the file is created and the agent carries on with its reply. Try again and press n instead: the file is not created and the agent carries on.

## S59.02 Batch approval.

- **Expected:** The user can approve or deny several pending tool calls of a run in one action.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:94; apps/cli/src/tui/widgets/approval_overlay.rs:767; apps/cli/src/tui/approval_broker.rs:401; apps/cli/src/tui/approval_broker.rs:196; apps/cli/src/tui/tui_app.rs:8416
- **Where to find it:** agi, then ask for several file changes in one request; the approval prompt has Allow All and Deny All (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Type: create three files named a.txt, b.txt and c.txt, each with one line.
  2. At the first approval prompt press t (Allow All), or press d (Deny All) on a second try.
  3. Check the remaining file requests in that turn are approved, or refused, without more prompts.

## S59.03 Per-session approval.

- **Expected:** The user can allow a tool for the rest of the current session so it stops asking until the session ends.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:81 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi, then at an approval prompt press s (Allow Session) (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Type: create a file named s1.txt with one line.
  2. At the approval prompt press s (Allow Session).
  3. Type: create a file named s2.txt with one line.
  4. Check no prompt appears for the second file this session. Restart agi and check it asks again.

## S59.04 Per-application permission.

- **Expected:** The user can set allow/ask/deny per connected app (and per tool within it), and the runtime enforces it.
- **Code:** done. Evidence present: apps/cli/src/agent/tools.rs:77; apps/cli/src/platform/policy/engine.rs:350; apps/cli/src/platform/policy/engine.rs:327
- **Where to find it:** not found in the code. No per-app allow, ask or deny screen was found. MCP tool rules (mcp__<server>__<tool>) are read from a policy.toml file (apps/cli/src/platform/policy/engine.rs lines 357 and 456-464); the in-app /permissions controls cover command prefixes and domain rules only.

## S59.05 Per-folder permission.

- **Expected:** The agent can touch only folders the user granted, and the user grants or revokes each folder.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5891
- **Where to find it:** agi, then type /add-dir <folder> and /remove-dir <folder> in the chat (labels found in the code)
- **Needs:** two test folders, one to grant and one not granted
- **Steps:**
  1. Type /add-dir alone to list the folders the agent may change.
  2. Type /add-dir <path of a test folder> and read the reply.
  3. Ask the agent to create a file in that folder and check it does.
  4. Type /remove-dir <same path>, then ask again and check the agent no longer changes that folder.

## S59.06 Per-domain permission.

- **Expected:** The user can allow or block specific websites/domains the agent may act on or fetch, and it is enforced.
- **Code:** done. Evidence moved: apps/cli/src/permissions.rs:180; apps/cli/src/permissions.rs:135; apps/cli/src/features/exec/tools/mod.rs:1349; apps/cli/src/features/exec/tools/web/mod.rs:225; apps/cli/src/features/exec/tools/mod.rs:2274; apps/cli/src/repl/registry.rs:642 (quoted code not found in the file now)
- **Where to find it:** agi, then type /permissions deny domain:example.com in the chat (labels found in the code)
- **Needs:** an internet connection
- **Steps:**
  1. Type /permissions deny domain:example.com and read the reply.
  2. Ask the agent to fetch https://example.com.
  3. Check the fetch is refused and no page content comes back.
  4. Type /permissions remove deny domain:example.com to undo, then ask again and check the fetch is allowed or asked for.

## S59.07 Persistent permission settings.

- **Expected:** Permission choices (policy and per-tool rules) persist across sessions and devices until changed.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3638 (quoted code not found in the file now); apps/cli/src/permissions.rs:619
- **Where to find it:** agi, then type /permissions allow <command prefix> in the chat; check later with agi approvals list in a terminal (labels found in the code)
- **Steps:**
  1. In the chat type /permissions allow ls.
  2. Quit agi, then in a terminal run agi approvals list.
  3. Start agi again and type /permissions; check the rule is still listed under Allow.
  4. Check the rule shows in the list from agi approvals list.

## S59.08 Permission-mode selector.

- **Expected:** The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:63; apps/cli/src/permissions.rs:307
- **Where to find it:** agi, then press Shift+Tab to cycle the permission modes (labels found in the code)
- **Steps:**
  1. Start agi and read the mode badge in the status bar.
  2. Press Shift+Tab once and read the banner and the badge.
  3. Keep pressing Shift+Tab through Plan and Auto, then back to Default.
  4. Check the badge shows the mode you just chose each time.

## S59.09 Read-only mode.

- **Expected:** The user can switch the agent into a read-only mode in which write, send and execute tools are refused.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:63; apps/cli/src/permissions.rs:307
- **Where to find it:** agi, then press Shift+Tab until the badge says Plan (labels found in the code)
- **Steps:**
  1. Start agi and press Shift+Tab until the badge says Plan.
  2. Read the banner: it says read-only tools only, no file edits.
  3. Type: create a file named p.txt.
  4. Check no file is written and the agent offers a plan instead.

## S59.10 Ask-before-writing mode.

- **Expected:** A mode lets reads run automatically but stops and asks before any write, send or execute action.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:63; apps/cli/src/features/exec/tools/mod.rs:500
- **Where to find it:** agi, in the Default mode (the badge says Default when agi starts) (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Start agi and check the badge says Default.
  2. Type: list the files in this folder. It should run without a prompt.
  3. Type: create a file named ask.txt with one line.
  4. Check an approval prompt appears before the file is written.

## S59.11 Automatic low-risk approval mode.

- **Expected:** A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:63; apps/cli/src/features/exec/tools/mod.rs:500
- **Where to find it:** agi, then press Shift+Tab until the badge says Auto (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Press Shift+Tab until the badge says Auto.
  2. Read the banner: file edits, read-only tools and commands the safety classifier clears run; everything else asks.
  3. Type: list the files in this folder. It should run without a prompt.
  4. Type: create a file named auto.txt. Check whether it asks before writing.

## S59.12 Approval summary.

- **Expected:** An approval request shows a plain summary of what the tool will do and why it needs approval.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:1616; apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi, then ask for a change that needs approval and read the top of the Tool Approval prompt (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Type: create a file named summary.txt with one line.
  2. At the approval prompt read the first line, which names the tool and the target.
  3. Read the lines under it that show what the change does.
  4. Compare with Expected: the summary says what will happen.

## S59.13 Exact recipients.

- **Expected:** Before a send is approved, the approval names exactly who will receive it.
- **Code:** done. Evidence present: apps/cli/src/approval_details.rs:97; apps/cli/src/agent/tools.rs:151; apps/cli/src/models/managed_approvals.rs:137
- **Where to find it:** not found in the code. A recipients line is built from tool arguments (apps/cli/src/approval_details.rs line 97). The only send tool found in the CLI is send_message for agent teams (apps/cli/src/agent/tools.rs line 10); connector approvals are in apps/cli/src/models/managed_approvals.rs. No send prompt was confirmed in the UI.
- **Needs:** a connected app that can send a message

## S59.14 Exact destination.

- **Expected:** Before an outbound action is approved, the approval shows the exact destination (URL, host or target).
- **Code:** done. Evidence moved: apps/cli/src/features/exec/tools/mod.rs:1532; apps/cli/src/features/exec/tools/mod.rs:708 (quoted code not found in the file now)
- **Where to find it:** agi, then ask the agent to fetch a web page; the approval prompt shows the destination (labels found in the code)
- **Needs:** an internet connection, and a site not already allowed (a prompt appears only then)
- **Steps:**
  1. Type: fetch https://example.com and summarize it.
  2. At the approval prompt read the destination and address lines.
  3. Check the host and full address match what you typed.

## S59.15 Exact amount or purchase.

- **Expected:** Before a payment or purchase is approved, the approval shows the exact amount and what is bought.
- **Code:** done. Evidence present: apps/cli/src/approval_details.rs:99; apps/cli/src/approval_details.rs:100; apps/cli/src/agent/tools.rs:151
- **Where to find it:** not found in the code. No payment or purchase tool was found in apps/cli. Amount and What is bought lines are built from tool arguments in apps/cli/src/approval_details.rs lines 99-100, but no prompt that uses them was confirmed.

## S59.16 Exact command.

- **Expected:** Before a command runs, the approval shows the exact command line (and where it will run).
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:241; apps/cli/src/features/exec/tools/bash/mod.rs:619
- **Where to find it:** agi, then ask the agent to run a shell command; the approval prompt shows the command line (labels found in the code)
- **Needs:** a working AI sign-in or provider
- **Steps:**
  1. Type: run the command ls -la in this folder.
  2. At the approval prompt read the command line under Allow this command?.
  3. Check the command matches what you asked for.
  4. Press n to refuse; the command should not run.

## S59.17 Exact files or records affected.

- **Expected:** Before a write, the approval shows exactly which files or records will change.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:13 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi, then ask the agent to change a file; the approval prompt names the file (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Type: create a file named records.txt with the line one.
  2. Type: change the word one to two in records.txt.
  3. At the approval prompt read the file path under the prompt line.
  4. Check the path shown is the file that will change.

## S59.18 Proposed-diff preview.

- **Expected:** Before a file edit is approved, the user sees the proposed diff.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:12 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1616
- **Where to find it:** agi, then ask the agent to edit a file that already has lines; the approval shows the change (labels found in the code)
- **Needs:** a working AI sign-in or provider
- **Steps:**
  1. Create a test file with several lines first.
  2. Type: change the second line of that file to a new sentence.
  3. At the approval prompt read the lines with + and - in the preview.
  4. Scroll with the arrow keys or PgDn until the end is shown, then press y.

## S59.19 Allow action.

- **Expected:** The user can allow a pending action and it then runs.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:81 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi, then at an approval prompt press y (Yes) (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Type: create a file named allow.txt with one line.
  2. At the approval prompt press y.
  3. Check allow.txt is created and the chat shows the result.

## S59.20 Deny action.

- **Expected:** The user can deny a pending action; it does not run and the model is told it was denied.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:81 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi, then at an approval prompt press n (No) (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Type: create a file named deny.txt with one line.
  2. At the approval prompt press n.
  3. Check deny.txt is not created and the agent carries on with its reply.

## S59.22 Ask for an alternative.

- **Expected:** Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/approval_overlay.rs:317; apps/cli/src/tui/widgets/approval_overlay.rs:367; apps/cli/src/tui/approval_broker.rs:365; apps/cli/src/features/exec/tools/mod.rs:287; apps/cli/src/agent/chat.rs:3316
- **Where to find it:** agi, then at an approval prompt press Tab, type a note and press Enter (labels found in the code)
- **Needs:** a working AI sign-in or provider, and an empty test folder
- **Steps:**
  1. Type: create a file named alt.txt.
  2. At the approval prompt press Tab and type: write it to alt-two.txt instead.
  3. Press Enter to answer with the note.
  4. Check the agent follows the note and writes alt-two.txt instead of alt.txt.

## S59.23 Approval expiration.

- **Expected:** A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:38; apps/cli/src/tui/tui_app.rs:8391; apps/cli/src/tui/tui_app.rs:8396
- **Where to find it:** agi, then leave an approval prompt unanswered for 10 minutes (labels found in the code)
- **Needs:** about 10 minutes of waiting and a pending approval
- **Steps:**
  1. Type: create a file named late.txt.
  2. Press no key at the approval prompt for 10 minutes.
  3. Check the chat shows: The approval for ... expired after 10 minutes without an answer, so it did not run.
  4. Check late.txt was not created.

## S59.24 Approval history.

- **Expected:** The user can review a history of past approval requests and their decisions.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/mod.rs:1880; apps/cli/src/lib.rs:5507
- **Where to find it:** a terminal, then agi approvals history (labels found in the code)
- **Steps:**
  1. In agi, approve one request and deny another.
  2. Quit agi and run agi approvals history.
  3. Check the newest decision is listed first and says approved or denied.
  4. Run agi approvals history --limit 1 and check one row is shown.

## S59.25 Revoke saved permission.

- **Expected:** The user can revoke a saved "always allow" (or folder/site grant) so the action asks again.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3638 (quoted code not found in the file now); apps/cli/src/permissions.rs:674
- **Where to find it:** agi, then type /permissions remove allow <command prefix> in the chat (labels found in the code)
- **Needs:** a saved rule to remove
- **Steps:**
  1. Type /permissions allow ls to save a rule.
  2. Type /permissions remove allow ls.
  3. Ask the agent to run ls and check it asks again.
  4. For a folder, type /remove-dir <folder>; for a site, type /permissions remove deny domain:<host>.

## S59.26 Approval from another device.

- **Expected:** An approval raised on one device can be answered from another signed-in device, and the first device sees the result.
- **Code:** done. Evidence present: apps/cli/src/cloud/code_sessions.rs:125; apps/cli/src/lib.rs:2985
- **Where to find it:** a terminal, then agi code approvals for cloud Code sessions; the phone path is Remote Control (labels found in the code)
- **Needs:** two signed-in devices and a cloud Code session paused on an approval
- **Steps:**
  1. Start a cloud Code session that pauses for an approval.
  2. In a terminal run agi code approvals and note the handle.
  3. On a second signed-in device answer the approval, or run agi code approve <handle> in a terminal.
  4. Check the first device shows the result: the chat shows Allowed on your phone or Denied on your phone for a phone answer.

## S59.28 Stronger confirmation for sensitive operations.

- **Expected:** Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/bash/mod.rs:687; apps/cli/src/features/exec/tools/mod.rs:879
- **Where to find it:** agi (start the app), then type a chat request that makes the agent run a shell command, such as "run sudo ls", and look at the approval prompt that opens (buttons: Yes, No, Allow Session, Always allow, Deny All, Allow All) (labels found in the code)
- **Needs:** a Free account or a paid account (no sign-in noted in code); a request that makes the agent run a shell command
- **Steps:**
  1. Start the app by typing agi in the terminal and wait for the chat prompt.
  2. Type a request that makes the agent run a shell command that needs approval, for example: run sudo ls.
  3. When the Tool Approval prompt opens, look at the buttons: a request that needs explicit decision hides Allow Session, and a command with no saved rule hides Always allow.
  4. Look for the danger wording on the command line (DANGEROUS:) and compare with Expected: a stronger warning, no permanent allow, and the agent asks again next time.

## S59.30 Resume after user intervention.

- **Expected:** After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:81 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi (start the app), then type a chat request that needs approval, such as "create a file named test.txt", then at the Tool Approval prompt choose Yes and watch the chat (labels found in the code)
- **Needs:** none beyond a request that triggers an approval prompt
- **Steps:**
  1. Start the app by typing agi and send a request that makes the agent change a file or run a command.
  2. When the Tool Approval prompt opens, press y (Yes) or select Yes with the arrow keys and press Enter.
  3. Watch the chat: the same tool row should run and the agent should continue the same reply without a new prompt.
  4. Compare with Expected: the run continues from where it stopped, with no need to send the request again.

## S59.31 Action receipt and outcome display.

- **Expected:** After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** agi (start the app), then type a chat request that needs approval, answer the Tool Approval prompt (Yes, No or Deny All), and read the transcript row for the tool (labels found in the code)
- **Needs:** none beyond a request that triggers an approval prompt
- **Steps:**
  1. Start the app by typing agi and send a request that triggers an approval, for example: create a file named test.txt.
  2. At the Tool Approval prompt choose Yes, then choose a second request and choose No.
  3. Look at the tool row in the transcript: a run tool shows its completed state, and a denied call shows the text it did not run.
  4. Compare with Expected: the transcript shows what was decided and what happened (ran, result, or denied).
