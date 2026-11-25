---
id: "PLAN-mobile-068"
type: "test-plan"
title: "Mobile · 68. Session continuity and remote-session product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "68"
---
# Mobile · 68. Session continuity and remote-session product

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S68.01 Shared session identifier across supported clients.

- **Expected:** One session identifier names the same coding session on every supported client.
- **Code:** done. Evidence moved: apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:583; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:204; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6 (quoted code not found in the file now)
- **Where to find it:** AGI Code > Sessions list (tap a session row) (labels found in the code)
- **Needs:** a second client signed in to the same account, with at least one cloud session
- **Steps:**
  1. Sign in on the phone, open the side menu and tap "AGI Code".
  2. Note the title and repository of one session in the "Sessions" list.
  3. On a second client (web app or desktop app) signed in to the same account, find the session with the same title.
  4. Compare: both clients should show the same session with the same title and repository, not a copy.

## S68.02 Same conversation history.

- **Expected:** Opening the session on any client shows the same conversation history.
- **Code:** done. Evidence moved: apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:583; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:204; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6 (quoted code not found in the file now)
- **Where to find it:** AGI Code > tap a session row (labels found in the code)
- **Needs:** a second client signed in to the same account, with a session that has several turns
- **Steps:**
  1. Open AGI Code and tap a session.
  2. Scroll the transcript up to the oldest turn.
  3. On the second client, open the same session.
  4. Compare the turns: both should show the same conversation history.

## S68.03 Same active branch.

- **Expected:** Every client shows and works on the same active git branch for the session.
- **Code:** done. Evidence moved: apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:583; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:204; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6 (quoted code not found in the file now)
- **Where to find it:** AGI Code > tap a session > small line under the session title, then the Changes button (labels found in the code)
- **Needs:** a second client signed in to the same account, with a session that has a working branch
- **Steps:**
  1. Open AGI Code and tap a session.
  2. Read the small line under the session title, which shows the workspace (repository and branch).
  3. Tap the "Changes" button in the session header (git-branch icon) to open the changes sheet.
  4. Compare the branch with the branch shown on the second client for the same session.

## S68.04 Same repository association.

- **Expected:** Every client associates the session with the same repository.
- **Code:** done. Evidence moved: apps/mobile/src/features/cloud-code/CloudCodeSessionsScreen.tsx:583; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:204; apps/mobile/app/(app)/cloud-code/[sessionId].tsx:6 (quoted code not found in the file now)
- **Where to find it:** AGI Code > View and sort sessions button > Group by repository (labels found in the code)
- **Needs:** a second client signed in to the same account, with a session linked to a repository
- **Steps:**
  1. Open AGI Code.
  2. Tap the sort button at the top right (its label starts with "View and sort sessions").
  3. Tick "Group by repository".
  4. Check that the list is split into sections named by repository, and that the session sits under the same repository as on the second client.

## S68.06 Same model and instruction configuration.

- **Expected:** Every client runs the session with the same model and the same instruction files.
- **Code:** done. Evidence moved: apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:127; apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:323 (quoted code not found in the file now)
- **Where to find it:** AGI Code > tap a session > Task options and usage (labels found in the code)
- **Needs:** a second client signed in to the same account, with a cloud session
- **Steps:**
  1. Open a session in AGI Code.
  2. Read the line under the message box that shows the model name and, when known, the context percentage.
  3. Tap "Task options and usage" and read the "Task options" sheet (Mode and Usage).
  4. Compare the model with the second client for the same session.

## S68.08 Same pending approvals.

- **Expected:** An approval pending in the session shows on every attached client and can be answered from any of them.
- **Code:** done. Evidence present: apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:127; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts (text found, layout changed); apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:536
- **Where to find it:** AGI Code > open a session that is waiting for approval (labels found in the code)
- **Needs:** a second client signed in to the same account, and a task that asks for an approval
- **Steps:**
  1. Start a task on the second client (desktop or web) that needs a tool approval.
  2. On the phone, open AGI Code and that session.
  3. Look for the "Approval required" card in the session with its approve and reject buttons.
  4. Tap approve on the phone and check that the approval card clears on the second client.

## S68.09 Same tool activity.

- **Expected:** Tool activity of a running turn streams to every attached client.
- **Code:** done. Evidence moved: apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:323 (quoted code not found in the file now)
- **Where to find it:** AGI Code > open a session > type in the message box and send (labels found in the code)
- **Needs:** a second client signed in to the same account, and a task that runs tools
- **Steps:**
  1. Open the same session on the phone and on a second client, side by side.
  2. On the phone, type a task in the box that says "Describe a task or ask a question" and send it.
  3. Watch the "Working" row on the phone and on the second client.
  4. Look for tool activity lines such as "Ran a command" on both clients.

## S68.11 Active-control attachment.

- **Expected:** A client attaches to a running session with full control: send turns, stop, approve.
- **Code:** done. Evidence present: apps/mobile/src/features/cloud-code/useCloudCodeSession.ts (text found, layout changed)
- **Where to find it:** AGI Code > open a running session > Stop the task (labels found in the code)
- **Needs:** a second client signed in to the same account, and a task that is still running
- **Steps:**
  1. Send a task that runs for a while.
  2. Open the same session on the phone while it is running.
  3. Check that the composer shows the "Stop the task" control, and that a pending approval can be answered from the phone.
  4. Tap "Stop the task" and watch the label change to "Stopping the task"; check the second client shows the same change.

## S68.14 Continue local execution from mobile.

- **Expected:** From the phone, the user continues a coding session that runs on their local machine.
- **Code:** done. Evidence moved: apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:74 (quoted code not found in the file now); apps/mobile/src/features/companion/remote-code/service.ts:42
- **Where to find it:** not found in the code. The remote screens (companion index and companion code thread) show "Remote" as unavailable in this build, because FEATURES.companion is false in apps/mobile/lib/v1FeatureFlags.ts. The computer session list in AGI Code (useComputerCodeSessions) was not traced to a visible control that continues a local session.
- **Needs:** a paired desktop computer with its sessions running locally

## S68.19 Remote-machine discovery.

- **Expected:** The user sees which of their machines are available to run sessions.
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/AccountComputersCard.tsx:90; apps/mobile/src/features/device-registry/computers.ts:26
- **Where to find it:** not found in the code. The "Devices" heading (CodeDevicesSection.tsx) and the "Your computers" card (AccountComputersCard.tsx) both return nothing while FEATURES.companion is false in apps/mobile/lib/v1FeatureFlags.ts, so they are not visible in this build.
- **Needs:** a paired desktop, CLI or VS Code client on the same account

## S68.20 Remote-machine card.

- **Expected:** Each remote machine appears as a card with its name, platform and status.
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/AccountComputersCard.tsx:90
- **Where to find it:** not found in the code. The card is titled "Your computers" and shows presence as Online, Asleep or Offline (PRESENCE_LABELS in AccountComputersCard.tsx), but it is hidden while FEATURES.companion is false in apps/mobile/lib/v1FeatureFlags.ts.
- **Needs:** a paired desktop, CLI or VS Code client on the same account

## S68.21 Host capabilities.

- **Expected:** Each machine advertises what it can host (local models, browser, MCP, computer use, code sessions).
- **Code:** done. Evidence present: apps/mobile/src/features/companion/components/AccountComputersCard.tsx:52
- **Where to find it:** not found in the code. Capability names are Remote control, Browser, Computer use, Local models and Local MCP (CAPABILITY_LABELS in AccountComputersCard.tsx). The card is hidden while FEATURES.companion is false in apps/mobile/lib/v1FeatureFlags.ts.
- **Needs:** a paired desktop with its capabilities set

## S68.22 Device pairing.

- **Expected:** The user pairs a phone or another client with a machine so it can reach that machine's sessions.
- **Code:** done. Evidence present: apps/mobile/app/(app)/companion/index.tsx:278
- **Where to find it:** not found in the code. Pairing controls exist ("Add device" in packages/contracts/types/src/pairing.ts, "Pair with Desktop" and "Scan QR Code" in ConnectionStateViews.tsx), but all are hidden while FEATURES.companion is false in apps/mobile/lib/v1FeatureFlags.ts.
- **Needs:** a computer with AGI Desktop open, and a phone with camera access for the QR code

## S68.23 Pairing revocation.

- **Expected:** The user revokes a pairing from either side and it stops working at once.
- **Code:** done. Evidence present: apps/mobile/stores/connectionStore.ts:1345; apps/mobile/app/(app)/companion/index.tsx:159
- **Where to find it:** not found in the code. The phone side is the "Disconnect" button in DesktopInfoCard.tsx with a confirmation alert in companion/index.tsx, but both are hidden while FEATURES.companion is false. The desktop side was not checked.
- **Needs:** a paired desktop and a phone that is paired with it

## S68.25 Device-offline explanation.

- **Expected:** When the remote machine is offline, the client says so and explains what that means.
- **Code:** done. Evidence present: apps/mobile/app/(app)/companion/code/[threadId].tsx:19
- **Where to find it:** not found in the code. The text "is offline" and the explanation about remote access stopping are in companion/code/[threadId].tsx, but that screen shows "Remote" as unavailable while FEATURES.companion is false in apps/mobile/lib/v1FeatureFlags.ts.
- **Needs:** a paired desktop that can be put to sleep or closed

## S68.26 Resume after reconnect.

- **Expected:** After a dropped connection, the client reconnects and resumes the same session state.
- **Code:** done. Evidence present: apps/mobile/app/(app)/companion/code/[threadId].tsx:30; apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:162
- **Where to find it:** no screen of its own. This covers only the cloud session reloading when the app returns to the front (AppState listener in useCloudCodeSession.ts). The desktop reconnect screen ("Reconnecting to" in companion/code/[threadId].tsx) is hidden while FEATURES.companion is false.
- **Needs:** a second client signed in to the same account, and a running session
- **Steps:**
  1. Open AGI Code and tap a session.
  2. Switch away from AGI Mobile or lock the phone for a short while, and start a new turn on the second client for the same session.
  3. Come back to AGI Mobile without reopening the session.
  4. Check that the session shows the new turns and state.

## S68.30 Cross-client activity notifications.

- **Expected:** Activity in a session (approval needed, turn done, failure) notifies the user on their other clients.
- **Code:** done. Evidence present: apps/web/app/api/code/local-sessions/activity/route.ts:27; apps/mobile/services/notifications.ts:525
- **Where to find it:** AGI Work > Open notification settings > Task and approval updates (labels found in the code)
- **Needs:** a second client signed in to the same account, push notifications allowed for AGI Mobile on the phone
- **Steps:**
  1. Sign in on the phone, open the side menu and tap "AGI Work".
  2. Tap "Open notification settings" and check that "Task and approval updates" is on. Its description reads "Approval requests and finished or failed tasks".
  3. On a second client, start a cloud session task that needs approval or finishes.
  4. Check the phone shows a notification titled "Approval needed", "Agent run finished" or "Agent run failed".
