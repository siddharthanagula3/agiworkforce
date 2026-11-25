---
id: "PLAN-vscode-059"
type: "test-plan"
title: "VS Code · 59. Approvals and human-in-the-loop UI"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "59"
---
# VS Code · 59. Approvals and human-in-the-loop UI

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S59.01 One-action approval.

- **Expected:** When a single tool call needs approval, the user can approve or deny that one call and the run continues accordingly.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel (activity bar) > chat > "Approval needed" card > "Approve" once or "Deny" (labels found in the code)
- **Needs:** An AGI account signed in, and a request that triggers a tool approval (Ask mode).
- **Steps:**
  1. Open the AGI Code panel from the activity bar.
  2. Click the "Mode and reasoning effort" button and pick Mode > Ask.
  3. Send a request that edits a file, for example "add a comment to README".
  4. On the "Approval needed" card, click the "Approve once" button, or "Deny" to refuse.
  5. Look at the card: it shows the decision and the run continues or stops, as Expected says.

## S59.02 Batch approval.

- **Expected:** The user can approve or deny several pending tool calls of a run in one action.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:24; apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:38
- **Where to find it:** Command Palette > "Code: Show Cloud Tasks" > click a task row with the check icon (tooltip "Approve this run") (labels found in the code)
- **Needs:** Signed in to AGI Cloud, and a cloud task waiting on several pending tool calls.
- **Steps:**
  1. Sign in with "Code: Sign In to AGI Cloud".
  2. Start a cloud task that is waiting for approval with several tool calls.
  3. Run "Code: Show Cloud Tasks" from the Command Palette and pick the waiting task.
  4. Hover the row action with the check icon, tooltip "Approve this run", and click it.
  5. In the dialog read "Let this task run" with all tool names, then click "Approve and continue". Look for the info message that says the task continues.

## S59.03 Per-session approval.

- **Expected:** The user can allow a tool for the rest of the current session so it stops asking until the session ends.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2879 (quoted code not found in the file now)
- **Where to find it:** AGI Code panel > "Approval needed" card > "Approve <tool name> for session" button (labels found in the code)
- **Needs:** An AGI account signed in, and a request that triggers a tool approval.
- **Steps:**
  1. Open AGI Code and set Mode to Ask ("Mode and reasoning effort" > Mode > Ask).
  2. Send a request that makes the same tool ask for approval.
  3. On the card, click the "Approve ... for session" button (it names the tool).
  4. Send a second request that uses the same tool.
  5. Look: no new "Approval needed" card should appear for that tool until the session ends.

## S59.04 Per-application permission.

- **Expected:** The user can set allow/ask/deny per connected app (and per tool within it), and the runtime enforces it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1263; apps/cli/src/app_server/surfaces.rs:1382
- **Where to find it:** Command Palette > "Code: Permissions" > "Add a rule" > "MCP server or tool" (labels found in the code)
- **Needs:** An MCP server connected to the agent.
- **Steps:**
  1. Run "Code: Permissions" from the Command Palette.
  2. Click "Add a rule".
  3. Pick "MCP server or tool" and type the server name, or server/tool, for example github or github/create_issue.
  4. Pick "Always allowed", "Asks first" or "Blocked".
  5. Look: the rule appears under "Rules for every session" with its decision. Then ask the agent to use that app and check it follows the rule.

## S59.05 Per-folder permission.

- **Expected:** The agent can touch only folders the user granted, and the user grants or revokes each folder.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1288; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1316
- **Where to find it:** Command Palette > "Code: Permissions" > "Trusted folders" section (labels found in the code)
- **Needs:** At least one trusted folder already granted.
- **Steps:**
  1. Run "Code: Permissions" from the Command Palette.
  2. Look under "Trusted folders" for folder rows with the text "The agent may read, edit and run commands here".
  3. Hover a folder row and click the trash icon, tooltip "Stop trusting".
  4. In the modal dialog, click "Stop Trusting".
  5. Look: the folder disappears from the list, and the next action in that folder asks again.

## S59.06 Per-domain permission.

- **Expected:** The user can allow or block specific websites/domains the agent may act on or fetch, and it is enforced.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1263; apps/cli/src/app_server/surfaces.rs:1407
- **Where to find it:** Command Palette > "Code: Permissions" > "Add a rule" > "Website" (labels found in the code)
- **Needs:** A request that makes the agent reach a website.
- **Steps:**
  1. Run "Code: Permissions" from the Command Palette.
  2. Click "Add a rule" and pick "Website".
  3. Type a host, for example example.com or *.example.com.
  4. Pick "Always allowed", "Asks first" or "Blocked".
  5. Look: the rule appears in the list. Then ask the agent to fetch that site and check it follows the rule.

## S59.07 Persistent permission settings.

- **Expected:** Permission choices (policy and per-tool rules) persist across sessions and devices until changed.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:511
- **Where to find it:** Command Palette > "Code: Permissions" (rules list) (labels found in the code)
- **Needs:** Nothing beyond an AGI account; a second device to check the cross-device part.
- **Steps:**
  1. Add a rule with "Code: Permissions" > "Add a rule" (see S59.06).
  2. Close the list and run "Code: Permissions" again.
  3. Look: the rule is still listed with its decision.
  4. Start a new chat or session and check the rule still shows.
  5. Check whether it also shows on another signed-in device, as Expected says.

## S59.08 Permission-mode selector.

- **Expected:** The user can pick a permission mode (ask every time / auto for low risk / skip approvals) that governs how every tool runs.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:497
- **Where to find it:** AGI Code panel > "Mode and reasoning effort" button > Mode group, or Command Palette > "Code: Choose Agent Mode" (labels found in the code)
- **Needs:** An AGI account signed in.
- **Steps:**
  1. Open AGI Code and click the "Mode and reasoning effort" button.
  2. In the Mode group, pick Plan, Ask, Auto or Bypass permissions.
  3. Or run "Code: Choose Agent Mode" from the Command Palette and pick a mode.
  4. Look: the button label changes to the chosen mode, and the next tool action follows that mode.

## S59.09 Read-only mode.

- **Expected:** The user can switch the agent into a read-only mode in which write, send and execute tools are refused.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:497
- **Where to find it:** not found in the code. No read-only mode that refuses write, send and execute tools was found. The closest is Plan, described as "Generate a plan; no edits until approved" (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts), which does not say sends or commands are refused.

## S59.10 Ask-before-writing mode.

- **Expected:** A mode lets reads run automatically but stops and asks before any write, send or execute action.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:497
- **Where to find it:** AGI Code panel > "Mode and reasoning effort" button > Mode > Ask (labels found in the code)
- **Needs:** An AGI account signed in.
- **Steps:**
  1. Open AGI Code and click the "Mode and reasoning effort" button.
  2. Pick Mode > Ask.
  3. Send a request that reads a file and then edits it.
  4. Look: the read runs without a card, and the edit stops at an "Approval needed" card.

## S59.11 Automatic low-risk approval mode.

- **Expected:** A mode auto-approves low-risk actions (reads, searches) while riskier actions still ask.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549 (quoted code not found in the file now); apps/cli/src/app_server/surfaces.rs:497
- **Where to find it:** AGI Code panel > "Mode and reasoning effort" button > Mode > Auto (labels found in the code)
- **Needs:** An AGI account signed in.
- **Steps:**
  1. Open AGI Code and click the "Mode and reasoning effort" button.
  2. Pick Mode > Auto.
  3. Send a request that reads files and makes an ordinary edit.
  4. Look: ordinary edits and safe commands run without a card, while other commands show an "Approval needed" card.

## S59.12 Approval summary.

- **Expected:** An approval request shows a plain summary of what the tool will do and why it needs approval.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6765; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel > "Approval needed" card (summary line and risk words) (labels found in the code)
- **Needs:** An AGI account signed in, and a request that triggers a tool approval.
- **Steps:**
  1. Trigger an approval in Ask mode (see S59.01).
  2. Read the card title "Approval needed" and the summary line under it.
  3. Read the risk word, such as "Low risk", "Medium risk" or "High risk", and whether it says "Can be undone" or "Cannot be undone".
  4. Look: the summary says what the tool will do; check whether it also says why approval is needed.

## S59.13 Exact recipients.

- **Expected:** Before a send is approved, the approval names exactly who will receive it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7101; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7106
- **Where to find it:** AGI Code panel > "Approval needed" card for a send action > "Sends to:" row (labels found in the code)
- **Needs:** A send-type connector tool and a request that uses it.
- **Steps:**
  1. Ask AGI to send a message in a tool that has a recipient, such as an email or chat connector, in Ask mode.
  2. Wait for the "Approval needed" card.
  3. Look for the row "Sends to:" and check it names the exact recipients.

## S59.14 Exact destination.

- **Expected:** Before an outbound action is approved, the approval shows the exact destination (URL, host or target).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6770; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel > "Approval needed" card (summary and detail text) (labels found in the code)
- **Needs:** A request that makes an outbound call.
- **Steps:**
  1. Trigger an outbound action in Ask mode, such as a fetch to a web address.
  2. Wait for the "Approval needed" card.
  3. Look for the exact URL or host in the summary or the detail block.
  4. Check it matches the destination the agent will use.

## S59.15 Exact amount or purchase.

- **Expected:** Before a payment or purchase is approved, the approval shows the exact amount and what is bought.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7101; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7110
- **Where to find it:** AGI Code panel > "Approval needed" card for a purchase > "Amount:" and "For:" rows (labels found in the code)
- **Needs:** A purchase-type connector tool and a request that uses it.
- **Steps:**
  1. Ask AGI to make a purchase or payment through a connector, in Ask mode.
  2. Wait for the "Approval needed" card.
  3. Look for the "Amount:" row with the value and currency, and the "For:" row with the item.
  4. Check they match what the purchase will buy.

## S59.16 Exact command.

- **Expected:** Before a command runs, the approval shows the exact command line (and where it will run).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6770; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel > "Approval needed" card for a command > detail box under the summary (labels found in the code)
- **Needs:** A request that runs a shell command.
- **Steps:**
  1. Ask AGI to run a shell command in Ask mode, such as npm test.
  2. Wait for the "Approval needed" card.
  3. Read the detail box under the summary.
  4. Look: it shows the exact command line. Check whether it also shows where it runs.

## S59.17 Exact files or records affected.

- **Expected:** Before a write, the approval shows exactly which files or records will change.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6770; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel > "Approval needed" card for a file write > summary and detail, plus "Review change" (labels found in the code)
- **Needs:** A request that edits files.
- **Steps:**
  1. Ask AGI to edit a file in Ask mode.
  2. Wait for the "Approval needed" card.
  3. Read the summary and the detail box for the files named.
  4. Look: check the exact files that will change match the request.

## S59.18 Proposed-diff preview.

- **Expected:** Before a file edit is approved, the user sees the proposed diff.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:9160; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel > "Approval needed" card for a file edit > "Review change" button (labels found in the code)
- **Needs:** A file-edit request that produces a proposed change.
- **Steps:**
  1. Ask AGI to edit a file in Ask mode.
  2. On the "Approval needed" card, click "Review change".
  3. Look: the proposed file opens in a VS Code diff editor.
  4. Edit or revert part of it, then approve, and check the file is written with your version.

## S59.19 Allow action.

- **Expected:** The user can allow a pending action and it then runs.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel > "Approval needed" card > "Approve once" (labels found in the code)
- **Needs:** An AGI account signed in, and a request that triggers a tool approval.
- **Steps:**
  1. Trigger an approval in Ask mode.
  2. Click "Approve once" on the card.
  3. Look: the card shows the outcome as allowed, and the action runs and its result appears in the transcript.

## S59.20 Deny action.

- **Expected:** The user can deny a pending action; it does not run and the model is told it was denied.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** AGI Code panel > "Approval needed" card > "Deny" (labels found in the code)
- **Needs:** An AGI account signed in, and a request that triggers a tool approval.
- **Steps:**
  1. Trigger an approval in Ask mode.
  2. Click "Deny" on the card.
  3. Look: the card shows "Denied.", the action does not run, and the transcript continues.
  4. Check the agent's next message reflects the refusal.

## S59.22 Ask for an alternative.

- **Expected:** Instead of just denying, the user can tell the agent what to do instead, and the agent continues with that guidance.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7238; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1054 (quoted code not found in the file now)
- **Where to find it:** AGI Code panel > "Approval needed" card > text box at the bottom (labels found in the code)
- **Needs:** An AGI account signed in, and a request that triggers a tool approval.
- **Steps:**
  1. Trigger an approval in Ask mode.
  2. Click the text box at the bottom of the card, labelled "Or deny and tell AGI what to do instead, then press Enter".
  3. Type guidance, for example "use a different file", and press Enter.
  4. Look: the card shows Denied, and the agent continues with your guidance in the next message.

## S59.23 Approval expiration.

- **Expected:** A pending approval expires after a set time, the UI shows it expired, and the action cannot run from it.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1873 (quoted code not found in the file now); apps/cli/src/app_server/developer_host.rs:6968
- **Where to find it:** no screen of its own. The 10-minute timer is set in apps/cli/src/app_server/developer_host.rs (APPROVAL_TIMEOUT_SECONDS = 600). Whether a timeout reaches this card as the expired text was not confirmed.
- **Needs:** A card left unanswered for the full wait.
- **Steps:**
  1. Trigger an approval in Ask mode and leave the card unanswered.
  2. Wait about 10 minutes.
  3. Look: the card should show that the turn ended before it was answered, and the action should not run.

## S59.24 Approval history.

- **Expected:** The user can review a history of past approval requests and their decisions.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/permissions/approvalHistory.ts:33
- **Where to find it:** Command Palette > "Code: Show Approval History" (labels found in the code)
- **Needs:** Signed in to AGI Cloud, with some past approvals.
- **Steps:**
  1. Sign in with "Code: Sign In to AGI Cloud".
  2. Run "Code: Show Approval History" from the Command Palette.
  3. Look: a list titled "Code, Approval history" shows past approvals with "Approved" or "Denied" and a time.
  4. Pick a row with a conversation to open it in the browser.

## S59.26 Approval from another device.

- **Expected:** An approval raised on one device can be answered from another signed-in device, and the first device sees the result.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:38; apps/extension-vscode/src/features/cloud-tasks/cloudRunApproval.ts:32
- **Where to find it:** Command Palette > "Code: Show Cloud Tasks" > task row with the check icon (tooltip "Approve this run") (labels found in the code)
- **Needs:** Two devices signed in to AGI Cloud on the same account, and a cloud task waiting for approval.
- **Steps:**
  1. On device A, start a cloud task that waits for approval.
  2. On device B, signed in to the same account, run "Code: Show Cloud Tasks" and pick the waiting task.
  3. Click the row icon with tooltip "Approve this run" or "Reject this run".
  4. On device A, run "Code: Show Cloud Tasks" again and look: the task shows its new state.
  5. If device B already answered, the message reads that another device already answered this one.

## S59.27 Approval via notification.

- **Expected:** When an approval is needed the user is notified and can approve or deny directly from the notification.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:43
- **Where to find it:** VS Code notification when an approval is needed (buttons "Allow once", "Deny", "Open chat") (labels found in the code)
- **Needs:** Two apps open (VS Code and another), and an AGI account signed in.
- **Steps:**
  1. Set Mode to Ask in AGI Code.
  2. Switch to another app so the VS Code window is not focused.
  3. Send a request that needs approval.
  4. Look for the VS Code notification "Code: ..." with the summary and the buttons "Allow once" and "Deny". Click "Allow once" and check the action runs.

## S59.28 Stronger confirmation for sensitive operations.

- **Expected:** Sensitive or irreversible actions get a stronger confirmation than routine ones (warning, no permanent allow, re-ask).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/permissions/agentModeConsent.ts:16; apps/extension-vscode/src/features/permissions/agentModeConsent.ts:132
- **Where to find it:** Chat panel > a request that makes the agent do something irreversible (for example delete a file or send a message) > the approval card shows "Cannot be undone" and has no "Approve for session" button (labels found in the code)
- **Needs:** a signed-in account and a workspace folder open in VS Code
- **Steps:**
  1. Sign in, open a workspace folder, and open the AGI chat panel.
  2. Send a request that asks the agent to delete a file or send a message, which cannot be undone.
  3. When the approval card appears, look for the line "Cannot be undone" on the card.
  4. Check the card's buttons: "Approve once" and "Deny" should be there, and "Approve for session" should be missing.
  5. Compare with Expected: the warning is shown and no permanent allow is offered.

## S59.30 Resume after user intervention.

- **Expected:** After the user intervenes (approves, answers a question, or hands control back), the same run resumes where it stopped.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7033; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** Chat panel > a request that needs approval > click "Approve once" on the approval card > the same reply continues (labels found in the code)
- **Needs:** a signed-in account and a workspace folder open in VS Code
- **Steps:**
  1. Sign in, open a workspace folder, and open the AGI chat panel.
  2. Send a request that makes the agent run a command or edit a file, so an approval card appears.
  3. Click the "Approve once" button on the approval card.
  4. Watch the same reply: the tool runs and the agent carries on in that turn without you sending a new message.
  5. Compare with Expected: the same run resumes where it stopped.

## S59.31 Action receipt and outcome display.

- **Expected:** After an approval decision the transcript shows what was decided and what happened (ran, result, or denied).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7039; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3398
- **Where to find it:** Chat panel > approval card > click "Approve once" or "Deny" or "Abort turn" > the card shows the decision ("Allowed once.", "Denied.", or "Turn aborted.") and the tool result follows (labels found in the code)
- **Needs:** a signed-in account and a workspace folder open in VS Code
- **Steps:**
  1. Sign in, open a workspace folder, and open the AGI chat panel.
  2. Send a request that makes the agent edit a file, so an approval card appears with a diff.
  3. Click "Approve once" and look at the card: it should show "Allowed once." under the decision.
  4. Look at the tool entry below it for the result of the action, or for "Open diff" for a file edit.
  5. Repeat with "Deny" and check the card shows "Denied." and the tool does not run.
  6. Compare with Expected: the transcript shows what was decided and what happened.
