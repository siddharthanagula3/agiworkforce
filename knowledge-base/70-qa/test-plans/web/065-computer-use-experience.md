---
id: "PLAN-web-065"
type: "test-plan"
title: "Web · 65. Computer-use experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "65"
---
# Web · 65. Computer-use experience

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S65.27 Device-offline state.

- **Expected:** When the target computer is offline the product says so and waits or stops clearly.
- **Code:** done. Evidence present: apps/web/lib/workflows/cloud-agent-workflow.ts:27; apps/web/lib/workflows/cloud-agent-workflow.ts:38; apps/web/lib/device-steps/device-clearance-step.ts:136
- **Where to find it:** Sidebar > Your computer (Code page). Offline shows as "offline" next to the computer name, and once connected a lost link shows "Your computer went offline. This page reconnects when it is back." (some labels not found in the code; trust the screen)
- **Needs:** a Free or paid account with Desktop paired on a Mac, and the ability to quit Desktop on that Mac
- **Steps:**
  1. Sign in on the web app and open the sidebar item "Your computer".
  2. Look at the "Computers on your account" list. Each computer shows its state after a dot: "online", "asleep" or "offline".
  3. Connect a paired computer, then quit Desktop on that computer or turn it off.
  4. Wait for the page to update. Look for the message "Your computer went offline. This page reconnects when it is back." and compare with Expected (the product says it is offline and waits).

## S65.29 Remote access to a permitted local computer.

- **Expected:** From another device the user directs work on their own permitted computer.
- **Code:** done. Evidence moved: apps/web/app/code/computer/page.tsx:10; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:93; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:181; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:219 (quoted code not found in the file now); apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:367 (quoted code not found in the file now); apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:61; apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:183; apps/web/features/remote-dispatch/lib/remote-dispatch-client.ts:155 (quoted code not found in the file now); apps/web/features/remote-dispatch/lib/dispatch-envelope.ts:65; apps/web/features/remote-dispatch/lib/dispatch-envelope.ts:146; apps/web/features/desktop-host/components/RemoteControlSection.tsx:143; apps/web/features/code/components/CodeRail.tsx:277 (quoted code not found in the file now); apps/web/proxy.ts:34
- **Where to find it:** On the Mac, Desktop > Settings > Capabilities > Remote Control > Pair a phone > Copy link for a browser. Then in the browser, sidebar > Your computer > Pairing link > Connect > Task box > Send to computer. (labels found in the code)
- **Needs:** a paid account (Remote Control comes with paid plans), Desktop on a Mac with Remote Control on, and a second device or browser signed in to the same account
- **Steps:**
  1. On the Mac, open Desktop and go to Settings, Capabilities, Remote Control, Pair a phone, and copy the link for a browser.
  2. In a different browser or device, sign in and open the sidebar item "Your computer".
  3. Paste the link into the field "Paste the link copied on your computer" and click "Connect". Wait until the page shows "Connected to" the computer name.
  4. Type a task in the box "Describe what AGI should do on your computer" and click "Send to computer".
  5. Look at the Tasks list: the new task should appear with a status label (for example queued or running) and the computer should begin work, as Expected says.
