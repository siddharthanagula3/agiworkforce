---
id: "PLAN-desktop-065"
type: "test-plan"
title: "Desktop · 65. Computer-use experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "65"
---
# Desktop · 65. Computer-use experience

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S65.01 Computer-access setup.

- **Expected:** The user turns computer use on in a guided setup that grants the needed permissions.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/ComputerUseSettings.tsx:221; apps/web/features/desktop-host/components/ComputerUseSettings.tsx:71 (quoted code not found in the file now); apps/desktop/electron/runtime/computerUseSession.ts:380; apps/desktop/electron/runtime/dispatcher.ts:2610
- **Where to find it:** Settings… (app menu) > Desktop app > Computer use > Any app (labels found in the code)
- **Needs:** a Mac with the Desktop app (Electron host); no guided wizard found
- **Steps:**
  1. Open Settings… from the app menu.
  2. Under Desktop app, click Computer use.
  3. Turn on the switch labelled Any app.
  4. Look for the rows Accessibility and Screen Recording with Open System Settings buttons and compare with Expected: the permissions are shown and linked, but no step-by-step wizard was found in the code.

## S65.02 Operating-system permission explanation.

- **Expected:** The product explains which operating-system permissions computer use needs and how to grant them.
- **Code:** done. Evidence moved: apps/web/lib/hooks/useChatStream.ts:1230 (quoted code not found in the file now); apps/desktop/electron/runtime/computerUseService.ts:245; apps/desktop/electron/runtime/dispatcher.ts:1084
- **Where to find it:** Settings… (app menu) > Desktop app > Computer use (with Any app on) > Accessibility and Screen Recording rows (labels found in the code)
- **Needs:** a Mac with the Desktop app
- **Steps:**
  1. Open Settings… and go to Desktop app > Computer use.
  2. Turn on Any app.
  3. Read the Accessibility and Screen Recording rows: each shows what it is for and a status such as Not asked yet or Allowed.
  4. Where the status needs action, click Open System Settings for that row and compare with Expected: each permission has a purpose line.

## S65.03 Application allowlist.

- **Expected:** The user lists which applications the agent may control.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/applicationControl.ts:112; apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:190
- **Where to find it:** Settings… (app menu) > Desktop app > Computer use > Allowed apps (labels found in the code)
- **Needs:** a Mac with the Desktop app and one installed app to test with
- **Steps:**
  1. Open Settings… and go to Desktop app > Computer use, with Any app on.
  2. Ask AGI in chat to work in an app, for example TextEdit, while Computer use is on.
  3. When the permission dialog appears, choose the allow option it offers (Deny is the refuse button).
  4. Go back to Computer use and look under Allowed apps for that app; each row offers Remove, and an empty list reads None yet.

## S65.04 Application blocklist.

- **Expected:** The user lists applications the agent must never control.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/applicationControl.ts:115; apps/desktop/electron/runtime/dispatcher.ts:1273
- **Where to find it:** Settings… (app menu) > Desktop app > Computer use > Refused apps > Add app (labels found in the code)
- **Needs:** a Mac with the Desktop app and an installed app to refuse
- **Steps:**
  1. Open Settings… and go to Desktop app > Computer use.
  2. Under Refused apps, click Add app (only shown when the Desktop can refuse apps).
  3. Type in Search apps and pick an app in Installed apps.
  4. Check that the app now appears under Refused apps, then ask AGI in chat to control it and compare with Expected: it should not run.

## S65.06 Monitor selection.

- **Expected:** On a multi-monitor setup computer use can target a chosen display.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2555; apps/desktop/electron/runtime/computerUseService.ts:280; apps/web/features/desktop-host/lib/device-steps.ts:427
- **Where to find it:** no screen of its own. The display choice is a tool parameter the agent sends, not a control in the UI; the id must come from a previous screenshot listing.
- **Needs:** a Mac with two displays and a computer-use task
- **Steps:**
  1. On a Mac with two displays, with Computer use on, ask AGI in chat to take a screenshot, then ask it to look at the second display.
  2. Open the activity under the reply and check the step reads Looked at display 2 (the number is passed by the agent).
  3. Compare with Expected: the screenshot should come from the chosen display.

## S65.07 Screen preview.

- **Expected:** The user sees what the agent sees on screen as it works.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:431; apps/web/lib/hooks/useChatStream.ts:1230 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:2555
- **Where to find it:** Chat, under the reply: activity step cards with a screenshot (labels found in the code)
- **Needs:** a Desktop app with computer use on and an app to act in
- **Steps:**
  1. With Computer use on (Settings… > Desktop app > Computer use > Any app), send a chat request that makes AGI click or look at the screen.
  2. While it runs, open the activity shown under the reply.
  3. Look for each screen step card with a picture of the screen and the caption Screen after: followed by the action.
  4. Compare with Expected: the picture should match what the agent saw.

## S65.09 Current-application indicator.

- **Expected:** The product shows which application the agent is currently working in.
- **Code:** done. Evidence moved: apps/desktop/electron/native/macos/agi-input.swift:217 (quoted code not found in the file now); apps/desktop/electron/runtime/computerUseService.ts:379; apps/desktop/electron/runtime/computerUseSteps.ts:135; apps/web/features/desktop-host/lib/device-steps.ts:84
- **Where to find it:** not found in the code. Searched ComputerUseSettings.tsx and ComputerUseControlBar.tsx: they show the phase text but no app name. The app name is only in step text (In front: <app>) in apps/web/features/desktop-host/lib/device-steps.ts, which the model reads. No on-screen app label found.
- **Needs:** a Mac with the Desktop app

## S65.10 Current-window indicator.

- **Expected:** The product shows which window the agent is currently working in.
- **Code:** done. Evidence moved: apps/desktop/electron/native/macos/agi-input.swift:217 (quoted code not found in the file now); apps/web/features/desktop-host/lib/device-steps.ts:84; apps/web/features/desktop-host/lib/device-steps.ts:290
- **Where to find it:** not found in the code. Searched ComputerUseSettings.tsx, ComputerUseControlBar.tsx and the step text in device-steps.ts: no window label is shown to the user. The window is read natively in apps/desktop/electron/native/macos/agi-input.swift, but no UI text using it was found.
- **Needs:** a Mac with the Desktop app

## S65.11 Clipboard permission.

- **Expected:** Clipboard access by the agent needs its own permission.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/computerUseSteps.ts:58
- **Where to find it:** Chat (computer use on): ask AGI to copy or paste with the keyboard; then Settings… > Capabilities > Local access > Permissions (labels found in the code)
- **Needs:** a Desktop app with computer use on
- **Steps:**
  1. Turn on Computer use (Settings… > Desktop app > Computer use > Any app).
  2. In chat, ask AGI to paste text into an app with Command+V.
  3. When the dialog appears, read its reason about the clipboard and choose Deny or allow.
  4. Open Settings… > Capabilities > Local access > Permissions and look for Read the clipboard; compare with Expected: it needs its own answer.

## S65.12 Local-folder permission.

- **Expected:** The user grants the agent specific local folders and can revoke them.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/CapabilitiesSection.tsx:213; apps/web/features/desktop-host/components/LocalAccessSection.tsx:447; apps/desktop/electron/runtime/dispatcher.ts:759 (quoted code not found in the file now)
- **Where to find it:** Settings… (app menu) > Capabilities > Local access > Folders > Add a folder (labels found in the code)
- **Needs:** a Mac with the Desktop app and a test folder
- **Steps:**
  1. Open Settings… and click Capabilities, then find Local access.
  2. Under Folders, click Add a folder and choose a folder in the picker.
  3. Check the folder is listed under Folders.
  4. Click Remove on that folder, confirm Remove access in the dialog, and compare with Expected: the folder is no longer listed.

## S65.13 Application launch.

- **Expected:** The agent can open an application on the computer.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2593; apps/desktop/electron/runtime/applicationLaunch.ts:102
- **Where to find it:** Chat (computer use on): ask AGI to open an app, for example TextEdit (labels found in the code)
- **Needs:** a Desktop app and an installed app to open
- **Steps:**
  1. Turn on Settings… > Desktop app > Computer use > Any app.
  2. In chat, ask AGI to open TextEdit.
  3. Allow the permission prompt if one appears.
  4. Look for the TextEdit window opening on the Mac and compare with Expected.

## S65.14 Clicking and typing.

- **Expected:** The agent clicks and types on the computer's screen.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2565; apps/web/features/desktop-host/lib/device-steps.ts:427; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:431
- **Where to find it:** Chat (computer use on): send a request to click and type in an app, then the activity under the reply (labels found in the code)
- **Needs:** a Desktop app with computer use on and TextEdit
- **Steps:**
  1. Turn on Settings… > Desktop app > Computer use > Any app, and open TextEdit.
  2. In chat, ask AGI to click the New Document button and type a short word.
  3. Open the activity under the reply and look for the step lines Clicked at ... and Typed.
  4. Compare with Expected: the text should appear in the app.

## S65.15 Scrolling.

- **Expected:** The agent scrolls on the computer's screen.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2576; apps/web/features/desktop-host/lib/device-steps.ts:427; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:431
- **Where to find it:** Chat (computer use on): ask AGI to scroll in an app, then the activity under the reply (labels found in the code)
- **Needs:** a Desktop app with computer use on and a scrollable window
- **Steps:**
  1. Turn on Computer use and open a long page or document in an app.
  2. In chat, ask AGI to scroll down in that window.
  3. Open the activity under the reply and look for the step line Scrolled at ...
  4. Compare with Expected: the window should scroll.

## S65.16 Drag-and-drop actions.

- **Expected:** The agent drags and drops on the computer's screen.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/dispatcher.ts:2571; apps/web/features/desktop-host/lib/device-steps.ts:427; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:431
- **Where to find it:** Chat (computer use on): ask AGI to drag an item, then the activity under the reply (labels found in the code)
- **Needs:** a Desktop app with computer use on and a draggable item
- **Steps:**
  1. Turn on Computer use and open an app with a draggable item.
  2. In chat, ask AGI to drag the item to another place.
  3. Open the activity under the reply and look for the step line Dragged from ... to ...
  4. Compare with Expected: the item should move.

## S65.19 User-input arbitration.

- **Expected:** When the user moves the mouse or types, the agent yields rather than fighting for control.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/computerUseSession.ts:146; apps/desktop/electron/runtime/computerUseSession.ts:167
- **Where to find it:** no screen of its own. The bar's placement on screen was not verified in the code read.
- **Needs:** a Desktop app with computer use on
- **Steps:**
  1. Start a computer-use task in chat with Computer use on.
  2. While AGI is working, move the mouse or type.
  3. Look for the bar text Paused. You have the screen. with the hint It paused when you moved the pointer or typed.
  4. Compare with Expected: AGI should stop instead of fighting for the mouse. Then click Hand back to continue.

## S65.20 Emergency stop.

- **Expected:** One immediate control stops all computer control.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/computerUseSession.ts:126; apps/desktop/electron/runtime/computerUseSession.ts:335; apps/web/features/desktop-host/components/ComputerUseControlBar.tsx:55; apps/desktop/electron/appMenu.ts:197
- **Where to find it:** Press Escape while AGI is active, or File > Stop Computer Use (labels found in the code)
- **Needs:** a Desktop app with computer use on
- **Steps:**
  1. Start a computer-use task in chat with Computer use on.
  2. While AGI is working, press Escape, or open the File menu and click Stop Computer Use.
  3. Look for the Computer use bar to disappear, or the Stop button to turn off, and check the chat stops.
  4. Compare with Expected: all computer control should end at once.

## S65.21 Pause and takeover.

- **Expected:** The user pauses the agent and takes control of the computer.
- **Code:** done. Evidence moved: apps/desktop/electron/appMenu.ts:115 (quoted code not found in the file now); apps/desktop/electron/runtime/computerUseService.ts:177 (quoted code not found in the file now); apps/desktop/electron/runtime/dispatcher.ts:253 (quoted code not found in the file now)
- **Where to find it:** Computer use bar > Take over, or File > Take Over Screen Control (labels found in the code)
- **Needs:** a Desktop app with computer use on
- **Steps:**
  1. Start a computer-use task while AGI is active.
  2. Click Take over on the Computer use bar (or File > Take Over Screen Control).
  3. Look for the text Paused. You have the screen. and the button now reading Hand back.
  4. Compare with Expected: AGI should hold still while you use the mouse.

## S65.22 Return control.

- **Expected:** After taking over, the user hands control back and the agent continues.
- **Code:** done. Evidence present: apps/desktop/electron/runtime/computerUseSession.ts:269; apps/desktop/electron/runtime/computerUseSession.ts:366; apps/desktop/electron/runtime/computerUseSteps.ts:138
- **Where to find it:** Computer use bar > Hand back, or File > Hand Back Screen Control (some labels not found in the code; trust the screen)
- **Needs:** a Desktop app with a paused computer-use task
- **Steps:**
  1. While AGI is paused, click Hand back on the Computer use bar (or File > Hand Back Screen Control).
  2. If a dialog titled Hand the screen back? appears, click Hand back in it.
  3. Look for the bar to return to AGI is using your computer.
  4. Compare with Expected: AGI should continue the task.

## S65.23 Sensitive-action review.

- **Expected:** Sensitive actions (payments, passwords, sending) require the user's review before the agent does them.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:743; apps/web/lib/device-steps/device-tools.ts:53; apps/desktop/electron/runtime/computerUseSteps.ts:84; apps/desktop/electron/runtime/computerUseSteps.ts:81
- **Where to find it:** Chat (computer use on): ask AGI to type into a password field or send a message (labels found in the code)
- **Needs:** a Desktop app with computer use on and a test app
- **Steps:**
  1. Turn on Computer use and open a test app with a password field or a message box.
  2. In chat, ask AGI to type a password or send a short message.
  3. When the dialog titled Check this step appears, read the message that starts Desktop wants to.
  4. Click Deny and check the step does not run, then repeat and choose Allow once and compare with Expected.

## S65.25 Action outcome/receipt.

- **Expected:** Each action leaves a record of what was done and whether it worked.
- **Code:** done. Evidence moved: apps/web/lib/hooks/useChatStream.ts:1230 (quoted code not found in the file now); packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:431; apps/desktop/electron/runtime/dispatcher.ts:2555
- **Where to find it:** Chat, activity under the reply: the step lines (labels found in the code)
- **Needs:** a Desktop app with computer use on
- **Steps:**
  1. Run a computer-use task in chat with Computer use on.
  2. Open the activity under the reply.
  3. Look for one line per action, such as Clicked, Scrolled at or Looked at the screen, and any error line.
  4. Compare with Expected: each action should be recorded and show whether it worked.

## S65.26 Unsupported-application explanation.

- **Expected:** When an application cannot be controlled the product says why.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/computer-use.ts:58; apps/web/features/desktop-host/lib/device-steps.ts:84
- **Where to find it:** Chat (computer use on): ask AGI to control Finder or System Settings (labels found in the code)
- **Needs:** a Desktop app with computer use on
- **Steps:**
  1. Turn on Computer use with Any app.
  2. In chat, ask AGI to control Finder or System Settings.
  3. When the permission dialog appears, read the reason text about what the app can reach.
  4. Compare with Expected: the product should say why it cannot or should not control that app.

## S65.27 Device-offline state.

- **Expected:** When the target computer is offline the product says so and waits or stops clearly.
- **Code:** done. Evidence present: apps/web/lib/workflows/cloud-agent-workflow.ts:27; apps/web/lib/workflows/cloud-agent-workflow.ts:38; apps/web/lib/device-steps/device-clearance-step.ts:136
- **Where to find it:** not found in the code. Found the wait notice Waiting for <computer> to come online in apps/web/lib/device-steps/device-clearance-step.ts and the wait limit in apps/web/lib/workflows/cloud-agent-workflow.ts, but did not find the screen that shows it. Searched those files only.
- **Needs:** a cloud task with a linked computer that is offline

## S65.28 Permission-revoked state.

- **Expected:** When a permission is revoked the agent stops and the user is told how to restore it.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx:190; apps/desktop/electron/runtime/dispatcher.ts:470 (quoted code not found in the file now); apps/desktop/electron/runtime/permissionManager.ts:299
- **Where to find it:** Settings… (app menu) > Desktop app > Computer use > Allowed apps > Remove (labels found in the code)
- **Needs:** a Desktop app with an app already allowed
- **Steps:**
  1. Open Settings… and go to Desktop app > Computer use.
  2. Under Allowed apps, click Remove on an app.
  3. Ask AGI in chat to control that app again.
  4. Compare with Expected: AGI should stop and say how to allow it again, with Ask again or the permission prompt.

## S65.29 Remote access to a permitted local computer.

- **Expected:** From another device the user directs work on their own permitted computer.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/hooks/use-dispatch-task-runner.ts:196 (quoted code not found in the file now); apps/web/features/desktop-host/hooks/use-dispatch-task-runner.ts:210; apps/web/features/desktop-host/hooks/use-dispatch-task-runner.ts:307; apps/web/features/desktop-host/hooks/use-dispatch-task-runner.ts:280 (quoted code not found in the file now); apps/web/features/desktop-host/components/DesktopHostMount.tsx:35 (quoted code not found in the file now); apps/desktop/electron/runtime/devicePrompts.ts:11; apps/desktop/electron/runtime/dispatcher.ts:2663
- **Where to find it:** Settings… (app menu) > Capabilities > Remote Control > Pair a phone, then Copy link for a browser (labels found in the code)
- **Needs:** a paid plan, a second device, and the Desktop app
- **Steps:**
  1. In the Desktop app, open Settings… > Capabilities > Remote Control and click Pair a phone.
  2. Click Copy link for a browser.
  3. On another device, open that link, paste it in the box on the page, and send a task.
  4. Compare with Expected: the task should run on your own Mac.
