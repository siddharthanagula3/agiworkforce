---
id: "PLAN-vscode-003"
type: "test-plan"
title: "VS Code · 3. Authentication and onboarding screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "3"
---
# VS Code · 3. Authentication and onboarding screens

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S3.01 Sign-in screen.

- **Expected:** The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1221; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:132 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Sign In to AGI Cloud (also the Sign in button in the Settings panel) (labels found in the code)
- **Needs:** a browser and an AGI account (or a way to create one)
- **Steps:**
  1. Press Cmd+Shift+P, type "Sign In to AGI Cloud" and press Enter.
  2. Finish the approval in the browser page that opens, then return to VS Code.
  3. Look at the AGI panel: the signed-in account state should show, as Expected says.

## S3.02 Create-account screen.

- **Expected:** A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.
- **Code:** done. Evidence present: apps/web/features/auth/authRoutes.ts:47; apps/web/features/auth/authRoutes.ts:32; apps/web/features/auth/authRoutes.ts:80
- **Where to find it:** Command Palette > Code: Sign In to AGI Cloud, then the browser page > Create account (labels found in the code)
- **Needs:** a browser and an email address or a supported provider account; not signed in to AGI Cloud
- **Steps:**
  1. Sign out of AGI Cloud in VS Code if signed in, then press Cmd+Shift+P and run "Code: Sign In to AGI Cloud".
  2. In the browser page that opens, look for the "Create account" link beside the sign-in link.
  3. Click "Create account" and check that a sign-up page opens, as Expected says.

## S3.25 Memory setup.

- **Expected:** During setup the user is told about memory and chooses whether and how it is used, with the choice changeable later.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:878
- **Where to find it:** Command Palette > Code: Memory (or Get started with AGI Code walkthrough > Decide what AGI remembers > Open Memory) (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Memory" and press Enter.
  2. Read the memory choice shown, then run "Code: Turn Memory On or Off" from the palette to choose whether memory is used.
  3. Run "Code: Turn Memory On or Off" again to change the choice and check the memory state changes, as Expected says.

## S3.31 Mobile device pairing.

- **Expected:** A phone can be paired with the desktop app by QR or short code, and the pairing is bound to the signed-in account.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/remote-control/index.ts:156; apps/extension-vscode/src/features/remote-control/remoteControlService.ts:173 (quoted code not found in the file now)
- **Where to find it:** Command Palette > Code: Remote Control, then the Pair a phone button (labels found in the code)
- **Needs:** a phone with the AGI Mobile app, and an AGI account signed in on both
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Remote Control" and press Enter.
  2. In the panel titled "Remote Control", click "Pair a phone".
  3. On the phone, open the AGI Mobile app and pair with the desktop by scanning the Pairing QR code shown (or typing the pairing code).
  4. Check the panel changes to connected for that phone, and that the pairing code expires in a few minutes, as Expected says.

## S3.35 First-conversation introduction.

- **Expected:** New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:816; apps/extension-vscode/src/core/commandSetup.ts:1221
- **Where to find it:** Command Palette > Code: Show Getting Started (first-run setup screen in the AGI sidebar) (labels found in the code)
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Show Getting Started" and press Enter.
  2. Read the first screen "Work with your code", then click Next to move through the steps.
  3. On the last step click the button shown there ("Open chat" with no runtime, otherwise "Done").
  4. Check that you land on a first chat, as Expected says.

## S3.36 Resumable onboarding checklist.

- **Expected:** New users get a checklist of setup steps whose progress is saved, so they can leave and resume it later.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:816; apps/extension-vscode/package.json:829; apps/extension-vscode/src/core/commandSetup.ts:1221
- **Where to find it:** Get started with AGI Code (VS Code walkthrough), and Code: Show Getting Started for the first-run steps (labels found in the code)
- **Steps:**
  1. Open the walkthrough "Get started with AGI Code" from VS Code's Welcome or Get Started page.
  2. Complete one step, such as "Decide what AGI remembers" by clicking its Open Memory link, then close VS Code.
  3. Reopen VS Code and the walkthrough, and check the completed step is still ticked, as Expected says.
  4. Optionally, run "Code: Show Getting Started" and click Next once, then close and reopen the window to see whether the screen restarts at its first step.

## S3.37 Guest experience and guest-to-account conversion.

- **Expected:** Without an account the user can try the product (guest/local use), and later sign up with their guest work carried over or still available.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2035; apps/extension-vscode/src/core/commandSetup.ts:1221; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:132 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Searched apps/extension-vscode/src for guest, sign-up, and carry-over wording and found no guest mode or guest-to-account conversion. Only partial evidence: without sign-in, Local and provider BYOK models are shown as usable ('On this device'), and locked cloud models ask for a sign-in or provider key.
- **Needs:** a Free account or no account
