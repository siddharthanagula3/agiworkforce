---
id: "PLAN-desktop-068"
type: "test-plan"
title: "Desktop · 68. Session continuity and remote-session product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "68"
---
# Desktop · 68. Session continuity and remote-session product

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S68.01 Shared session identifier across supported clients.

- **Expected:** One session identifier names the same coding session on every supported client.
- **Code:** done. Evidence present: packages/contracts/types/src/product-routes.ts:21; apps/web/app/code/[sessionId]/page.tsx:16; apps/desktop/electron/runtime/developerSessionService.ts:2586
- **Where to find it:** Sidebar > Code > Cloud sessions > open a session (labels found in the code)
- **Needs:** an account that has a cloud session, and the Desktop app
- **Steps:**
  1. Sign in, then click Code in the sidebar.
  2. Click a session under Cloud sessions.
  3. Note the session title and the address, which ends in /code/ and an ID.
  4. Open the Desktop app, go to Code, and open the same session.
  5. Compare the title and ID with the Expected line.

## S68.02 Same conversation history.

- **Expected:** Opening the session on any client shows the same conversation history.
- **Code:** done. Evidence present: packages/contracts/types/src/product-routes.ts:21; apps/web/features/code/CloudCodePage.tsx:828; apps/desktop/electron/runtime/developerSessionService.ts:2586
- **Where to find it:** Sidebar > Code > Cloud sessions > open a session (labels found in the code)
- **Needs:** an account with a cloud session that has several messages, and the Desktop app
- **Steps:**
  1. Sign in, click Code in the sidebar, and click a session under Cloud sessions.
  2. Scroll the conversation and note the last message.
  3. Open the same session in the Desktop app's Code view.
  4. Compare the conversation history and the last message with the Expected line.

## S68.03 Same active branch.

- **Expected:** Every client shows and works on the same active git branch for the session.
- **Code:** done. Evidence present: packages/contracts/types/src/product-routes.ts:21; apps/web/features/code/components/CodeChangesPanel.tsx:269; apps/web/features/code/components/LocalSessionsSection.tsx:128
- **Where to find it:** Sidebar > Code > open a session > Changes (labels found in the code)
- **Needs:** a session linked to a git repository, and a second client
- **Steps:**
  1. Click Code in the sidebar and open a session that has a repository.
  2. Click the Changes button in the session header.
  3. Read the branch shown next to the git branch icon (base, arrow, working branch).
  4. Open the same session in the other client and check the same branch name appears.
  5. Compare the branch with the Expected line.

## S68.04 Same repository association.

- **Expected:** Every client associates the session with the same repository.
- **Code:** done. Evidence present: packages/contracts/types/src/product-routes.ts:21; apps/web/features/code/CloudCodePage.tsx:2562; apps/web/features/code/components/LocalSessionsSection.tsx:291
- **Where to find it:** Sidebar > Code > open a session > header chip (labels found in the code)
- **Needs:** a cloud session with a repository, and a second client
- **Steps:**
  1. Click Code in the sidebar and open a cloud session.
  2. Read the small chip in the session header: network setting, then a dot and the repository name.
  3. Open the same session in the other client and read the chip.
  4. Compare the repository name on both clients with the Expected line.

## S68.06 Same model and instruction configuration.

- **Expected:** Every client runs the session with the same model and the same instruction files.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** no screen of its own. No code found for sharing instruction files across clients. The E2B gate cited in the plan is about sandbox provisioning, not model or instruction settings.
- **Needs:** an account that can see the Model for this agent dropdown, and a second client
- **Steps:**
  1. Click Code in the sidebar, then New, and look at the composer.
  2. Check the Model for this agent dropdown, shown only when models are offered.
  3. Open the same session in the other client and compare the model shown.

## S68.13 Transfer control between clients.

- **Expected:** The user hands control of a session from one client to another explicitly.
- **Code:** done. Evidence present: apps/web/features/code/components/LocalSessionPanel.tsx:1622; apps/web/features/code/components/LocalSessionPanel.tsx:1633; apps/web/features/code/components/LocalSessionPanel.tsx:1626; apps/web/features/code/code-surface.ts:523; apps/extension-vscode/src/features/context-handoff/index.ts:292; apps/extension-vscode/src/features/context-handoff/developerSessionLink.ts:30
- **Where to find it:** Sidebar > Code > open a local session > Session actions (the ... button) > Continue in VS Code or the terminal (labels found in the code)
- **Needs:** the Desktop app with a local session; VS Code is optional for the link
- **Steps:**
  1. Open the Desktop app, click Code, and open a local session.
  2. Click the Session actions button (...) in the header.
  3. Click Continue in VS Code or the terminal.
  4. Look for the Continue in VS Code link and the text To continue in the terminal, run this in the same folder:, with a command below it.
  5. Compare with the Expected line: the hand-off is explicit.

## S68.14 Continue local execution from mobile.

- **Expected:** From the phone, the user continues a coding session that runs on their local machine.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2659; apps/web/features/desktop-host/components/RemoteControlSection.tsx:67
- **Where to find it:** not found in the code. Desktop side is in Settings > Capabilities > Remote Control (apps/web/features/desktop-host/components/RemoteControlSection.tsx), but I found no phone-side screen for continuing local execution in apps/desktop; the dispatcher line cited is a generic remote control start.
- **Needs:** a phone with the mobile app and the Desktop app

## S68.15 Continue cloud execution from desktop.

- **Expected:** From the desktop app, the user continues a coding session that runs in the cloud.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Cloud execution depends on the E2B provisioning gate (apps/web/lib/e2b/gate.ts, e2bProvisioningReady). I could not find a desktop control that continues a cloud session from the local app beyond the shared Code page.
- **Needs:** a paid account, and cloud execution enabled on the server

## S68.17 Bring cloud results back to local workspace.

- **Expected:** Results of cloud work come back into the user's local workspace.
- **Code:** done. Evidence present: apps/desktop/electron/windowPolicy.ts:85
- **Where to find it:** not found in the code. Searched apps/web/features/code and apps/desktop/electron for return-to-local wording. apps/desktop/electron/windowPolicy.ts:85 only opens external links. The closest control is Apply to local (apps/web/features/code/local-code.ts:1610), which applies a local worktree, not cloud results.
- **Needs:** a cloud session that produced results, and a local folder

## S68.19 Remote-machine discovery.

- **Expected:** The user sees which of their machines are available to run sessions.
- **Code:** done. Evidence present: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:93; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:334
- **Where to find it:** Sidebar > Your computer (labels found in the code)
- **Needs:** a web browser and a Desktop app linked to the same account
- **Steps:**
  1. Sign in on a web browser (not the Desktop app, which hides this item).
  2. Click Your computer in the Code sidebar.
  3. Look for the heading Computers on your account and a list of computers.

## S68.20 Remote-machine card.

- **Expected:** Each remote machine appears as a card with its name, platform and status.
- **Code:** done. Evidence present: apps/web/features/settings/components/LinkedDevicesPanel.tsx:50; apps/web/features/settings/components/LinkedDevicesPanel.tsx:107
- **Where to find it:** Settings > Account > Linked devices (labels found in the code)
- **Needs:** a Desktop app linked to the account
- **Steps:**
  1. Click Settings, then Account.
  2. Scroll to Linked devices.
  3. Find a row for a Desktop app device and read its name, the surface label and its status.

## S68.21 Host capabilities.

- **Expected:** Each machine advertises what it can host (local models, browser, MCP, computer use, code sessions).
- **Code:** done. Evidence moved: apps/desktop/electron/runtime/dispatcher.ts:678 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Linked devices (labels found in the code)
- **Needs:** a linked device with capabilities
- **Steps:**
  1. Click Settings, then Account, and scroll to Linked devices.
  2. Find a device row and read its Can use line.
  3. Compare the listed items (Browser, Computer use, Local models, Local MCP, Remote Control) with the Expected line.

## S68.22 Device pairing.

- **Expected:** The user pairs a phone or another client with a machine so it can reach that machine's sessions.
- **Code:** partial. Evidence present: apps/web/app/api/pair/claim/route.ts:69
- **Known to be unfinished:** live-check after the website deploy: open /code/computer on web and in Electron and pair a phone or browser; claim returns 200 (not 503 'Pairing is not configured') and the device shows online
- **Where to find it:** Settings > Capabilities > Remote Control > Pair a phone (labels found in the code)
- **Needs:** a paid plan, and a phone or second browser
- **Steps:**
  1. Click Settings, then Capabilities, and scroll to Remote Control.
  2. Click Pair a phone.
  3. Look for the pairing QR code and the Pairing code.
  4. Pair the phone or a second browser, then check Settings > Account > Linked devices shows it.
  5. Compare with the Expected line.

## S68.23 Pairing revocation.

- **Expected:** The user revokes a pairing from either side and it stops working at once.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/RemoteControlSection.tsx:76
- **Where to find it:** Settings > Capabilities > Remote Control > Disconnect phone (labels found in the code)
- **Needs:** a paired phone, and a paid plan
- **Steps:**
  1. With a paired phone shown, click Settings, Capabilities, Remote Control.
  2. Click Disconnect phone and read the confirmation dialog.
  3. Click Disconnect phone in the dialog.
  4. Check the phone stops working, and see Settings > Account > Linked devices, where the device row has an Unlink device button.

## S68.24 Start a session in an allowed remote folder.

- **Expected:** From another client, the user starts a new session on a remote machine inside a folder that machine allows.
- **Code:** partial. Evidence present: apps/desktop/electron/remote/remoteControlService.ts:257; apps/desktop/electron/remote/remoteControlService.ts:73
- **Known to be unfinished:** The computer accepts a start-session request for a folder it has approved; the screen on the other client that sends it is not verified, and Remote Control is hidden in the first mobile release.
- **Where to find it:** not found in the code. Approved folders are under Settings > Capabilities > Local access > Folders > Add a folder (apps/web/features/desktop-host/components/LocalAccessSection.tsx), but I found no screen on another client that starts a session; the plan says that screen is unverified and Remote Control is hidden in mobile v1.
- **Needs:** a second client signed in to the account and a folder approved on the computer

## S68.25 Device-offline explanation.

- **Expected:** When the remote machine is offline, the client says so and explains what that means.
- **Code:** done. Evidence present: apps/web/features/settings/components/LinkedDevicesPanel.tsx:52; apps/web/features/settings/components/LinkedDevicesPanel.tsx:107
- **Where to find it:** Sidebar > Your computer (labels found in the code)
- **Needs:** a linked computer that is offline or asleep
- **Steps:**
  1. In a web browser, click Your computer in the Code sidebar.
  2. Open a computer that is offline or asleep, and read its status after its name.
  3. Read the message: Your computer went offline. This page reconnects when it is back.
  4. Compare with the Expected line.

## S68.26 Resume after reconnect.

- **Expected:** After a dropped connection, the client reconnects and resumes the same session state.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/RemoteControlSection.tsx:253
- **Where to find it:** Settings > Capabilities > Remote Control (labels found in the code)
- **Needs:** a paired phone and a paid plan
- **Steps:**
  1. With a phone paired, click Settings, Capabilities, Remote Control.
  2. Turn off the phone's network for a moment.
  3. Look for the message Connection lost. Reconnecting so your phone can pick up where it left off.
  4. Turn the network back on and look for Connected to followed by the phone name.

## S68.30 Cross-client activity notifications.

- **Expected:** Activity in a session (approval needed, turn done, failure) notifies the user on their other clients.
- **Code:** done. Evidence gone: apps/desktop/electron/runtime/codeSessionActivity.ts:52 (file no longer exists); apps/desktop/electron/main.ts:1336
- **Where to find it:** Settings > Notifications > Agent run updates (labels found in the code)
- **Needs:** two clients on the same account, and a session that needs approval
- **Steps:**
  1. Click Settings, then Notifications.
  2. Find Agent run updates and read its line: Completions, failures and approval requests. This browser only.
  3. Start an approval or a failing run in a session on another client.
  4. Check whether this client shows a notification.
