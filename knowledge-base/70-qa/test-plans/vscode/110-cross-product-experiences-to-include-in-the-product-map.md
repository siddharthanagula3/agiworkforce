---
id: "PLAN-vscode-110"
type: "test-plan"
title: "VS Code · 110. Cross-product experiences to include in the product map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "110"
---
# VS Code · 110. Cross-product experiences to include in the product map

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S110.10 Email thread → agent task.

- **Expected:** The user turns an email thread (forwarded, addressed, or picked from a connected mailbox) into an agent task that reads the thread and runs as a tracked task.
- **Code:** partial. Evidence present: apps/extension-vscode/src/integrations/localRuntimeClient.ts:1880
- **Known to be unfinished:** Inherits CLI limits (operator-gated Gmail, no email intake command); fix belongs to c-cli.
- **Where to find it:** not found in the code. The cited line apps/extension-vscode/src/integrations/localRuntimeClient.ts:1880 is writer hand-off code (releaseWriter, takeOverWriter), not email. Searched apps/extension-vscode/src for gmail, email, mailbox and forwarded and found no email intake, matching the plan's 'not written yet'.

## S110.20 Desktop session → IDE continuation.

- **Expected:** A coding session started in the desktop app is listed in VS Code for the same folder and the user opens it and continues it in the IDE.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1718; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2913; apps/extension-vscode/src/core/commandSetup.ts:587
- **Where to find it:** AGI Code panel > Sessions button in the panel header > Local tab > the row whose label reads Desktop (labels found in the code)
- **Needs:** a session started in the desktop app in the same folder
- **Steps:**
  1. Start a coding session in the desktop app for a folder, then open the same folder in VS Code.
  2. Click the AGI Code icon in the activity bar, then click the Sessions button in the panel header.
  3. On the Local tab, find the row labelled Desktop and click it.
  4. Look: the earlier messages of the desktop session load in the chat, and you can send a new message that continues it.

## S110.21 Mobile request → authorized local-host execution.

- **Expected:** From the phone the user sends a new request that runs on their paired computer under that computer's approvals, and sees the result on the phone.
- **Code:** done. Evidence present: packages/platform/utils/src/remoteControl/codeRemoteController.ts:867; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:404; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:418
- **Where to find it:** Command Palette > Code: Remote Control, then the Remote Control panel shows the pairing code; on the phone, the Mobile app > Pair with Desktop (labels found in the code)
- **Needs:** a phone with the Mobile app, signed in to the same account
- **Steps:**
  1. In VS Code open the Command Palette and run Code: Remote Control.
  2. Read the Remote Control panel: it shows a pairing QR code and a Pairing code.
  3. On the phone, open the Mobile app, choose Pair with Desktop, and scan the code.
  4. When the warning box asks to allow the phone, click Allow this phone.
  5. From the phone send a new request, then check that the approval prompts appear on this computer and the result shows on the phone.

## S110.22 Local work → explicit cloud handoff.

- **Expected:** The user explicitly hands a local coding session (history, repo state, pending work) to cloud execution and it continues in a cloud session.
- **Code:** partial. Evidence present: apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:93; docs/decisions/2026-09-27-founder-decisions.md:391
- **Known to be unfinished:** Met at parity with claude --cloud (new session from the pushed branch, D-2026-09-28-25); needs AGI_E2B_EXECUTION=1.
- **Where to find it:** Command Palette > Code: Continue in the Cloud, or the chat command /cloud, or Sessions > Cloud tab > Continue in the cloud button (labels found in the code)
- **Needs:** a signed-in account, a folder on a pushed GitHub branch, and AGI_E2B_EXECUTION=1 (per the plan)
- **Steps:**
  1. Open a folder whose git remote is on GitHub and check out a branch that has been pushed to GitHub.
  2. Open the AGI Code panel and run Code: Continue in the Cloud from the Command Palette, or type /cloud in the chat.
  3. If the warning appears, read it: it asks you to check out a branch, push the branch, or open a GitHub folder.
  4. Otherwise a cloud session opens; check that it names the repository and branch of this folder.

## S110.23 Cloud result → local repository application.

- **Expected:** A cloud coding session's result (diff, branch or files) is brought into the user's local checkout from a product control, with review before applying.
- **Code:** partial. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:272
- **Known to be unfinished:** Bring the branch in pulls a cloud session's branch after review; needs AGI_E2B_EXECUTION=1.
- **Where to find it:** AGI Code panel > Sessions button > Cloud tab > click the cloud session row > Bring the branch in (or Command Palette > Code: Open AGI Code Session) (labels found in the code)
- **Needs:** a signed-in account, a cloud session with a working branch, and AGI_E2B_EXECUTION=1 (per the plan)
- **Steps:**
  1. Run a cloud coding session that works on a branch of a GitHub repository open in this window.
  2. Click Sessions in the AGI Code panel header, then the Cloud tab, then click that session's row.
  3. In the list that opens, choose the item labelled Bring the branch in; its description shows the branch name.
  4. Look: the folder moves to that branch only after you choose it, and the checkout guard runs before it changes.

## S110.24 Existing notebook → main assistant context.

- **Expected:** From the main chat, the user brings an existing notebook (project) into the conversation so its instructions and sources ground the answers.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5122; apps/cli/src/agent/chat.rs:875
- **Where to find it:** Command Palette > Code: Show Projects > click a project > Use in this chat (labels found in the code)
- **Needs:** a signed-in account and a project with instructions or files
- **Steps:**
  1. Sign in and open Code: Show Projects from the Command Palette.
  2. Click a project that has instructions or files, then choose Use in this chat in the list that opens.
  3. Send a message in the AGI Code chat that the project's instructions cover.
  4. Look: the reply follows the project's instructions, and the project is shown as in use; choosing Used in this chat again stops using it.

## S110.26 Usage exhaustion → alternative eligible path.

- **Expected:** When the user runs out of usage, the product offers an eligible alternative (named eligible model, reset wait, or purchase) that the user can take in one step and continue.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:399; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:499; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4545; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:382; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1920
- **Where to find it:** AGI Code panel > chat: send a message when the account is at its usage limit > error card under the reply (labels found in the code)
- **Needs:** an account that has used up its usage allowance
- **Steps:**
  1. Use up the usage allowance on the account, then send a message in the AGI Code chat.
  2. Read the error card: it says that you have reached a usage limit and when it resets, or how long to wait.
  3. If the card shows Continue with {model}, click it and check that the reply continues on that model in the same turn.
  4. Otherwise click Add credits, Compare plans or See your usage, which open a web page; or run Code: Upgrade Your Plan from the Command Palette.

## S110.27 Disconnected integration → reconnect and resume.

- **Expected:** When a connected integration expires mid-task, the user is prompted to reconnect and the interrupted turn or run continues from where it stopped once reauthorized.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5291; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4604; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2408; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2426
- **Where to find it:** AGI Code panel > chat: a card appears in the chat that says {server} needs you to sign in again > click Sign in and continue (labels found in the code)
- **Needs:** an MCP server that needs a sign-in, a way to expire that sign-in, and an outside account
- **Steps:**
  1. Connect an MCP server that uses a sign-in, then ask for a task that needs it.
  2. Let that server's sign-in expire while the task is running.
  3. When the card appears, click Sign in and continue and finish the sign-in in the browser.
  4. Look: the card changes to Signed in to {server}. AGI is continuing., and the interrupted turn resumes with a continue message.
