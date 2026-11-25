---
id: "PLAN-web-068"
type: "test-plan"
title: "Web · 68. Session continuity and remote-session product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "68"
---
# Web · 68. Session continuity and remote-session product

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S68.01 Shared session identifier across supported clients.

- **Expected:** One session identifier names the same coding session on every supported client.
- **Code:** done. Evidence present: apps/web/app/code/[sessionId]/page.tsx:16; apps/web/features/code/CloudCodePage.tsx:705
- **Where to find it:** no screen of its own. The session ID is only visible in the URL; no button shows it.
- **Needs:** a signed-in account and a second client
- **Steps:**
  1. Sign in, open Code and open a cloud session
  2. Copy the address from the address bar (it ends in the session ID)
  3. Open the same address in a second signed-in browser or client
  4. Compare the session title and transcript with the first client

## S68.02 Same conversation history.

- **Expected:** Opening the session on any client shows the same conversation history.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:828
- **Where to find it:** Code > open a session (address /code/<sessionId>), read the transcript (labels found in the code)
- **Needs:** a Free or paid account with an existing Code session
- **Steps:**
  1. Open a cloud session that already has turns
  2. Read the transcript from the first message down
  3. Open the same session on a second client and compare the transcript

## S68.03 Same active branch.

- **Expected:** Every client shows and works on the same active git branch for the session.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeChangesPanel.tsx:269; apps/web/features/code/components/CodeChangesPanel.tsx:342
- **Where to find it:** Code session page > Changes (header button) > branch line at the top of the panel (labels found in the code)
- **Needs:** a session linked to a repository
- **Steps:**
  1. Open a cloud session that is linked to a repository
  2. Click the Changes button in the session header
  3. Read the branch line at the top of the panel (base, arrow, working branch)
  4. Compare the working branch name on a second client

## S68.04 Same repository association.

- **Expected:** Every client associates the session with the same repository.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:2562; apps/web/features/code/code-surface.ts:696
- **Where to find it:** Code session page > header chip beside the session title (path not confirmed in the code; trust the screen)
- **Needs:** a session linked to a repository
- **Steps:**
  1. Open a cloud session linked to a repository
  2. Read the chip beside the title (environment, then a dot, then repository)
  3. Open the same session on a second client and compare the chip

## S68.06 Same model and instruction configuration.

- **Expected:** Every client runs the session with the same model and the same instruction files.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Gate in apps/web/lib/e2b/gate.ts only decides whether sandbox execution is enabled (AGI_E2B_EXECUTION and E2B_API_KEY); no visible model or instruction-file setting was found for each client.
- **Needs:** a paid account with Code sessions

## S68.08 Same pending approvals.

- **Expected:** An approval pending in the session shows on every attached client and can be answered from any of them.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code session page > transcript > Approval required card > Deny or Approve and continue (labels found in the code)
- **Needs:** a Code session that reaches an approval step (needs the sandbox gate switched on)
- **Steps:**
  1. Start a task in a cloud session that needs a tool approval
  2. Wait for the Approval required card in the transcript
  3. Read the approval reason and the command shown in the card
  4. Click Approve and continue or Deny
  5. Open the same session on a second client and check the card is answered there

## S68.09 Same tool activity.

- **Expected:** Tool activity of a running turn streams to every attached client.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** Code session page > send a task > transcript while the turn runs (labels found in the code)
- **Needs:** a Code session with a task that uses tools (sandbox gate switched on)
- **Steps:**
  1. Send a task in a Code session
  2. Watch the transcript while the task runs
  3. Note the tool steps as they appear
  4. Open the same session on a second client and compare the tool steps

## S68.11 Active-control attachment.

- **Expected:** A client attaches to a running session with full control: send turns, stop, approve.
- **Code:** done. Evidence moved: apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:128; apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:129; apps/web/features/code/CloudCodePage.tsx:124 (quoted code not found in the file now)
- **Where to find it:** Code session page > composer (send a turn) > Stop the task while running > Approval required card (labels found in the code)
- **Needs:** a Code session that is running a turn (sandbox gate switched on for approvals)
- **Steps:**
  1. Open a running cloud session
  2. Send a new turn from the composer
  3. Click Stop the task while the turn runs
  4. When an Approval required card appears, click Approve and continue or Deny
  5. Check the result on the same session in a second client

## S68.13 Transfer control between clients.

- **Expected:** The user hands control of a session from one client to another explicitly.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeChangesPanel.tsx:268; apps/web/features/code/code-surface.ts:505
- **Where to find it:** not found in the code. Searched apps/web/features/code/code-surface.ts and CodeChangesPanel.tsx for transfer and found no transfer-control text; the nearest is the Continue in VS Code link, which is not an explicit handoff.
- **Needs:** two clients on one session

## S68.15 Continue cloud execution from desktop.

- **Expected:** From the desktop app, the user continues a coding session that runs in the cloud.
- **Code:** partial. Evidence present: apps/web/lib/e2b/gate.ts:16
- **Known to be unfinished:** switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code
- **Where to find it:** not found in the code. Only help text exists (apps/web/features/code/code-surface.ts line 325 says a session can be continued in the desktop app); no button to continue a cloud session on Desktop was found, and the sandbox gate is unfinished.
- **Needs:** the Desktop app and a cloud session

## S68.17 Bring cloud results back to local workspace.

- **Expected:** Results of cloud work come back into the user's local workspace.
- **Code:** done. Evidence present: apps/web/features/code/components/CodeChangesPanel.tsx:268; apps/web/features/code/components/CodeChangesPanel.tsx:509; apps/web/features/code/code-surface.ts:505
- **Where to find it:** Code session page > Changes (header button) > Create pull request, or Continue in VS Code (labels found in the code)
- **Needs:** a session linked to a repository with changes
- **Steps:**
  1. Open a cloud session that has changed files
  2. Click the Changes button in the session header
  3. Review the changed files and click Create pull request, or click Continue in VS Code
  4. Check the pull request or the editor shows the cloud results

## S68.19 Remote-machine discovery.

- **Expected:** The user sees which of their machines are available to run sessions.
- **Code:** done. Evidence present: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:93; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:334
- **Where to find it:** Your computer (link named 'Your computer') > /code/computer > section Computers on your account (labels found in the code)
- **Needs:** a Desktop app linked to the account
- **Steps:**
  1. Sign in and open the Your computer link, or type /code/computer in the address bar
  2. Read the heading and the Computers on your account list
  3. Check each computer shows its name and presence (online, asleep or offline)

## S68.20 Remote-machine card.

- **Expected:** Each remote machine appears as a card with its name, platform and status.
- **Code:** done. Evidence present: apps/web/features/settings/components/LinkedDevicesPanel.tsx:50; apps/web/features/settings/components/LinkedDevicesPanel.tsx:107
- **Where to find it:** Settings > Account > Linked devices (labels found in the code)
- **Needs:** a linked device on the account
- **Steps:**
  1. Open Settings and choose Account
  2. Scroll to Linked devices
  3. Read each device row for its name, platform, surface and status (Online, Sleeping or Offline)

## S68.21 Host capabilities.

- **Expected:** Each machine advertises what it can host (local models, browser, MCP, computer use, code sessions).
- **Code:** done. Evidence moved: apps/desktop/electron/runtime/dispatcher.ts:678 (quoted code not found in the file now)
- **Where to find it:** Settings > Account > Linked devices > capability names under a device (labels found in the code)
- **Needs:** a linked device that reports capabilities
- **Steps:**
  1. Open Settings, then Account, then Linked devices
  2. Read the capability names under a device (Browser, Computer use, Local models, Local MCP, Remote Control)
  3. Compare the list with what that machine runs

## S68.22 Device pairing.

- **Expected:** The user pairs a phone or another client with a machine so it can reach that machine's sessions.
- **Code:** partial. Evidence present: apps/web/app/api/pair/claim/route.ts:69
- **Known to be unfinished:** live-check after the website deploy: open /code/computer on web and in Electron and pair a phone or browser; claim returns 200 (not 503 'Pairing is not configured') and the device shows online
- **Where to find it:** /code/computer > Pairing link field > Connect (paste the link copied in the Desktop app) (labels found in the code)
- **Needs:** the Desktop app on a computer and a browser
- **Steps:**
  1. Open /code/computer in a signed-in browser
  2. In the Desktop app, copy the pairing link for a browser (the page text says: Settings, Capabilities, Remote Control, Pair a phone, then Copy link for a browser)
  3. Paste the link into the field labelled Pairing link
  4. Click Connect and read the status
  5. Check the computer shows as connected

## S68.23 Pairing revocation.

- **Expected:** The user revokes a pairing from either side and it stops working at once.
- **Code:** done. Evidence present: apps/web/app/api/pair/initiate/route.ts:94; apps/web/app/api/pair/claim/route.ts:21; services/signaling-server/src/index.ts:981
- **Where to find it:** /code/computer > Disconnect (confirm Disconnect from your computer?) ; or Settings > Account > Linked devices > Unlink (labels found in the code)
- **Needs:** a paired computer
- **Steps:**
  1. Pair a computer as in S68.22 and open /code/computer
  2. Click Disconnect and read the confirm dialog
  3. Confirm and check the page shows the connection has ended
  4. Try to send a task again and check it stops working
  5. Or open Settings > Account > Linked devices and click Unlink, then confirm

## S68.25 Device-offline explanation.

- **Expected:** When the remote machine is offline, the client says so and explains what that means.
- **Code:** done. Evidence present: apps/web/features/settings/components/LinkedDevicesPanel.tsx:52; apps/web/features/settings/components/LinkedDevicesPanel.tsx:107
- **Where to find it:** /code/computer > message below Connecting (shown when the computer goes offline) (labels found in the code)
- **Needs:** a paired computer that you can take offline
- **Steps:**
  1. Pair with a computer and open /code/computer
  2. Quit the Desktop app or put the computer to sleep
  3. Read the message on the page
  4. Open Settings > Account > Linked devices and read the presence label for that device
