---
id: "PLAN-vscode-068"
type: "test-plan"
title: "VS Code · 68. Session continuity and remote-session product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "68"
---
# VS Code · 68. Session continuity and remote-session product

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S68.01 Shared session identifier across supported clients.

- **Expected:** One session identifier names the same coding session on every supported client.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:340
- **Where to find it:** no screen of its own. The Code line cites ChatStateManager.ts:340, which now holds the sendMessage type, not the identifier logic; the session identifier itself has no visible text.
- **Needs:** a second client signed in to the same account
- **Steps:**
  1. Click the Sessions icon in the sidebar header and note the session title on the Local tab.
  2. Open the same session on the second client and compare the title and row shown with Expected.

## S68.02 Same conversation history.

- **Expected:** Opening the session on any client shows the same conversation history.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1365
- **Where to find it:** Sessions icon in the sidebar header > Local tab > click a session row (labels found in the code)
- **Needs:** a second client (VS Code, CLI or desktop) signed in to the same account and the same workspace
- **Steps:**
  1. Click the Sessions icon (tooltip Sessions) in the sidebar header.
  2. Make sure the Local tab is selected, then click a session row.
  3. Compare the conversation history shown with the history on the second client, as Expected.

## S68.03 Same active branch.

- **Expected:** Every client shows and works on the same active git branch for the session.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2488
- **Where to find it:** Sessions icon in the sidebar header > Cloud tab > look at the branch line under a session row (labels found in the code)
- **Needs:** a cloud session that has a working branch, and a second client on the same account
- **Steps:**
  1. Click the Sessions icon in the sidebar header.
  2. Click the Cloud tab.
  3. Read the branch text under a session row (shown only when the session has a working branch).
  4. Compare the branch with the branch the same session shows on the second client.

## S68.04 Same repository association.

- **Expected:** Every client associates the session with the same repository.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2574
- **Where to find it:** Command palette > Code: Continue in the Cloud > type a goal > review dialog line Repository: (labels found in the code)
- **Needs:** a folder with a GitHub git remote and a pushed branch
- **Steps:**
  1. Open a folder whose git remote is on GitHub, with its branch pushed.
  2. Open the Command Palette and run Code: Continue in the Cloud.
  3. Type a goal and press Enter.
  4. Read the Repository: line in the review dialog and compare it with the repository on the other client, then click Cancel.

## S68.05 Same worktree association.

- **Expected:** Every client associates the session with the same git worktree.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts:14 (quoted code not found in the file now); apps/extension-vscode/src/features/surfaces/sessionWorktrees.ts:48 (quoted code not found in the file now)
- **Where to find it:** Command palette > Code: Session Worktrees (labels found in the code)
- **Needs:** a git repository with at least one session worktree
- **Steps:**
  1. Open the Command Palette and run Code: Session Worktrees.
  2. Read the list of worktrees and the branch named for each one.
  3. Compare the worktree a session is tied to with the worktree shown on the second client.

## S68.06 Same model and instruction configuration.

- **Expected:** Every client runs the session with the same model and the same instruction files.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2625; apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:280
- **Where to find it:** no screen of its own. No screen was found that shows the instruction files a session uses.
- **Needs:** a folder with a GitHub git remote and a pushed branch
- **Steps:**
  1. Run Code: Continue in the Cloud, type a goal and press Enter.
  2. Read the Model: line in the review dialog and compare it with the model shown on the second client.
  3. Click Cancel.

## S68.07 Same task plan and checkpoints.

- **Expected:** Every client shows the same task plan and the same checkpoints for the session.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1907 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6095 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3705
- **Where to find it:** Command palette > Code: Checkpoints (labels found in the code)
- **Needs:** a session that already has at least one prompt
- **Steps:**
  1. Open a chat with some turns in it.
  2. Open the Command Palette and run Code: Checkpoints.
  3. Read the checkpoints listed for the session, and the Checkpoints item in the chat menu if it shows.
  4. Compare the checkpoints with those on the second client.

## S68.08 Same pending approvals.

- **Expected:** An approval pending in the session shows on every attached client and can be answered from any of them.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:280; apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:256
- **Where to find it:** Sessions icon in the sidebar header > Cloud tab > click a session row > Approval required (labels found in the code)
- **Needs:** a cloud session with a pending approval, and a second client on the same account
- **Steps:**
  1. Click the Sessions icon in the sidebar header and click the Cloud tab.
  2. Click a cloud session that is waiting for an approval.
  3. Read the Approval required section at the top of the list (items show Approve and continue or Reject).
  4. Answer it here, then check the second client shows the answer.

## S68.09 Same tool activity.

- **Expected:** Tool activity of a running turn streams to every attached client.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:179
- **Where to find it:** no screen of its own. No separate view of tool activity was found in this app.
- **Needs:** a cloud session that is running a turn, and a second client on the same account
- **Steps:**
  1. Start a turn in a cloud session from one client.
  2. Open the same session on the second client and watch the progress notice that reads Working while the turn runs.

## S68.13 Transfer control between clients.

- **Expected:** The user hands control of a session from one client to another explicitly.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:303; apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:107; apps/extension-vscode/src/extension.ts:246
- **Where to find it:** Sessions icon in the sidebar header > Cloud tab > click a session row > Continue here (labels found in the code)
- **Needs:** a cloud session on the same account
- **Steps:**
  1. Click the Sessions icon in the sidebar header and click the Cloud tab.
  2. Click a cloud session row.
  3. In the list, click Continue here and confirm the review dialog.
  4. Check the chat in this window now shows the session's conversation, and that the handoff is explicit.

## S68.14 Continue local execution from mobile.

- **Expected:** From the phone, the user continues a coding session that runs on their local machine.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/remote-control/remoteControlService.ts:400; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:403; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:404
- **Where to find it:** Command palette > Code: Remote Control > Pair a phone; then on the phone, Pair with Desktop (labels found in the code)
- **Needs:** a phone with the Mobile app signed in to the same account, a folder open in VS Code, a trusted workspace
- **Steps:**
  1. Sign in to AGI in VS Code and open a folder, trusting the workspace.
  2. Run Code: Remote Control from the Command Palette and click Pair a phone.
  3. On the phone, open the Mobile app, choose Pair with Desktop and scan the code.
  4. On the phone, open a local session from this folder and send a message, then check it runs on this computer.

## S68.16 Move work to cloud through an explicit handoff.

- **Expected:** The user explicitly hands a local session over to cloud execution, seeing what moves.
- **Code:** partial. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6432; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1817; apps/extension-vscode/src/extension.ts:246
- **Known to be unfinished:** Continue in the Cloud now also sits in the Sessions sheet header on the Cloud tab (044fdca03). Session creation needs AGI_E2B_EXECUTION on in production.
- **Where to find it:** Sessions icon in the sidebar header > Cloud tab > Continue in the cloud icon in the sheet header (labels found in the code)
- **Needs:** a folder with a GitHub git remote and a pushed branch, and a signed-in AGI account
- **Steps:**
  1. Click the Sessions icon in the sidebar header and click the Cloud tab.
  2. Click the Continue in the cloud icon (tooltip Continue in the cloud) in the sheet header.
  3. Type a goal, read the review dialog, and click Continue in the cloud to start, or Cancel to stop.
  4. Check the cloud session appears on the Cloud tab with the goal as its title.

## S68.17 Bring cloud results back to local workspace.

- **Expected:** Results of cloud work come back into the user's local workspace.
- **Code:** done. Evidence present: packages/contracts/types/src/cloud-task-handoff-uri.ts:54; packages/contracts/types/src/cloud-task-handoff-uri.ts:78; apps/extension-vscode/src/features/context-handoff/index.ts:87; apps/extension-vscode/src/features/context-handoff/index.ts:329
- **Where to find it:** Sessions icon in the sidebar header > Cloud tab > click a session row > Bring the branch in (labels found in the code)
- **Needs:** a cloud session with a working branch on a GitHub repository, and a local folder with that repository open
- **Steps:**
  1. Click the Sessions icon in the sidebar header and click the Cloud tab.
  2. Click a cloud session that has a working branch.
  3. Click Bring the branch in in the list.
  4. If the folder has uncommitted files, read the list of files at stake and decide; then check the branch from the cloud session is checked out locally.

## S68.18 File/environment transfer review.

- **Expected:** Before a transfer, the user reviews which files, context and environment will move.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:126; apps/extension-vscode/src/core/commandSetup.ts:600
- **Where to find it:** Command palette > Code: Continue in the Cloud > type a goal > review dialog lines What moves and What stays here (labels found in the code)
- **Needs:** a folder with a GitHub git remote and a pushed branch
- **Steps:**
  1. Open a folder with a GitHub remote and a pushed branch, with some uncommitted changes if you want to see that line.
  2. Run Code: Continue in the Cloud and type a goal.
  3. Read the review dialog: Repository, Branch, Model, Network, What moves and What stays here.
  4. Click Cancel and check that nothing was started.

## S68.22 Device pairing.

- **Expected:** The user pairs a phone or another client with a machine so it can reach that machine's sessions.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/remote-control/remoteControlService.ts:154
- **Where to find it:** Command palette > Code: Remote Control > Pair a phone (labels found in the code)
- **Needs:** a phone with the Mobile app signed in to the same account
- **Steps:**
  1. Sign in to AGI in VS Code.
  2. Run Code: Remote Control from the Command Palette and click Pair a phone.
  3. Read the Pairing code and the QR code shown on the panel.
  4. On the phone, scan the code with Pair with Desktop, then check the panel shows Connected to, followed by the phone name.

## S68.23 Pairing revocation.

- **Expected:** The user revokes a pairing from either side and it stops working at once.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/remote-control/index.ts:208; packages/platform/utils/src/remoteControl/remoteControlHost.ts:701; packages/platform/utils/src/remoteControl/remoteControlHost.ts:588
- **Where to find it:** Command palette > Code: Remote Control > Disconnect phone (while connected); or Command Palette > Code: Stop Remote Control (labels found in the code)
- **Needs:** a phone that is paired and connected
- **Steps:**
  1. With a phone connected, run Code: Remote Control from the Command Palette.
  2. Click Disconnect phone and read the Disconnect dialog.
  3. Click Disconnect phone in the dialog.
  4. On the phone, try to follow or steer a session and check it no longer connects.

## S68.26 Resume after reconnect.

- **Expected:** After a dropped connection, the client reconnects and resumes the same session state.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3048; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3035; apps/cli/src/app_server/developer_host.rs:3943
- **Where to find it:** no screen of its own. The reconnect step is in the remote control service; resuming the same chat state is in ChatStateManager, which has no separate screen.
- **Needs:** a paired and connected phone, and a way to drop the network connection
- **Steps:**
  1. Pair and connect a phone with a session open.
  2. Turn Wi-Fi off on the Mac for a few seconds, then back on.
  3. Run Code: Remote Control and read the status: Connection lost, then Connected to the phone, and check the session on the phone shows the same history.

## S68.30 Cross-client activity notifications.

- **Expected:** Activity in a session (approval needed, turn done, failure) notifies the user on their other clients.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:31; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:149 (quoted code not found in the file now); apps/extension-vscode/src/providers/chatEditorPanel.ts:137 (quoted code not found in the file now)
- **Where to find it:** VS Code notification (shown when the VS Code window is not focused): Approval needed, with an Open chat button (labels found in the code)
- **Needs:** VS Code in the background and a session that can ask for approval
- **Steps:**
  1. Click another app so VS Code is not the focused window.
  2. Start or wait for an approval in a session that is active in this window.
  3. Watch for the notification Approval needed with the Open chat button.
  4. Click Open chat and check the session shows the item waiting for approval.
