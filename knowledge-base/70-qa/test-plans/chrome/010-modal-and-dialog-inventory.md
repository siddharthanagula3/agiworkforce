---
id: "PLAN-chrome-010"
type: "test-plan"
title: "Chrome · 10. Modal and dialog inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "10"
---
# Chrome · 10. Modal and dialog inventory

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S10.01 Create Project.

- **Expected:** A create-project dialog (or command) asks for a name and creates the project in the account.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension/src for "Create project", "New project" and "Project name" and found no create-project dialog; src/features/side-panel/activeProject.ts exists but I did not examine it.
- **Needs:** live-web

## S10.06 Delete confirmation.

- **Expected:** Deleting asks for confirmation that names the item before anything is removed.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6756 (quoted code not found in the file now); apps/extension/src/side_panel.ts:12661
- **Where to find it:** Side panel > chat list > More actions > Delete chat (some labels not found in the code; trust the screen)
- **Needs:** a chat to delete (a Free account is enough)
- **Steps:**
  1. Open the side panel and find a chat in the chat list.
  2. Click the "More actions" button on that chat's row.
  3. Click "Delete chat".
  4. Look for the confirmation "Delete this chat from this device? It cannot be recovered." (or the account wording if the chat is saved to your AGI account) and check that nothing is removed until you confirm.

## S10.07 Permanent-delete confirmation.

- **Expected:** An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:12399; apps/extension/_locales/en/messages.json:296; apps/extension/src/side_panel.ts:12661
- **Where to find it:** Scheduled task > Delete (labels found in the code)
- **Needs:** a scheduled task to delete
- **Steps:**
  1. Open the scheduled task you want to remove.
  2. Click "Delete".
  3. Read the confirmation: "Delete $NAME$ and its run history? This cannot be undone." with the task's name in place of $NAME$.
  4. Check that the task is still there until you confirm the deletion.

## S10.10 Share artifact.

- **Expected:** An artifact share dialog publishes it to a link, lets the user copy it and choose who can open it, and can take it down.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No artifact share dialog found. Only chat sharing exists ("More actions" > "Share" > "Create link", src/side_panel.ts), which has no take-down control in the strings I read.
- **Needs:** live-web

## S10.11 Publish generated application.

- **Expected:** A publish dialog puts a generated app or page on a live URL and hands back the link.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension/src for "publish"; hits were background publish helpers only, and no publish dialog or live-URL hand-back was found.
- **Needs:** live-web

## S10.17 Upload from device.

- **Expected:** Choosing upload opens the device file chooser and the picked files attach to the message.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:10269
- **Where to find it:** Add attachment > Upload from device (labels found in the code)
- **Needs:** a file to upload and a signed-in AGI account (without sign-in the app says "Sign in to AGI Cloud to upload files.")
- **Steps:**
  1. Click the "Add attachment" button beside the message box.
  2. Click "Upload from device".
  3. Pick a file in the device file chooser.
  4. Look for the picked file to appear as an attachment on the message before you send it.

## S10.28 Usage-limit notice.

- **Expected:** When a usage limit is reached, the user sees which limit, when it resets, and what they can do.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/usageWindows.ts:42; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:981
- **Where to find it:** Message box > send a message after the usage limit is reached (labels found in the code)
- **Needs:** an account that has reached its usage limit
- **Steps:**
  1. Use an account that has used up its Managed Cloud usage.
  2. Type a message and try to send it.
  3. Read the notice "Your Managed Cloud usage limit has been reached."
  4. Check for the buttons "Manage usage", "Add credits" or "Contact support", and check whether the notice shows which limit and when it resets.

## S10.34 Microphone permission explanation.

- **Expected:** Before or when the microphone is first needed, the product explains why it wants it and what to do if access is refused.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/voice.ts:27 (quoted code not found in the file now)
- **Where to find it:** Microphone button > Before you dictate > Continue (labels found in the code)
- **Needs:** a microphone, and the first-time dictation notice not yet acknowledged
- **Steps:**
  1. Click the microphone button in the message box.
  2. Read the notice "Before you dictate" and its explanation of the microphone and Chrome's speech service.
  3. Click "Continue" (or the decline button) and watch for Chrome's microphone prompt.
  4. If you block access, click the microphone again and look for "Microphone access is blocked. Allow the microphone for AGI in Chrome site settings, then try again."

## S10.36 Computer-control permission.

- **Expected:** Before the assistant first controls the computer or browser, a dialog says what it will be able to do and the user grants or refuses it.
- **Code:** done. Evidence present: apps/extension/src/options.ts:1389; apps/extension/src/features/computer-use/browserControlConsent.ts:152; apps/extension/src/features/computer-use/browserControlConsent.ts:179
- **Where to find it:** Options > Approved sites > add a site > Grant full browser control (labels found in the code)
- **Needs:** a website to approve (http or https)
- **Steps:**
  1. Open the AGI extension options page.
  2. Add a site under "Approved sites" and click the site's option to turn on browser control.
  3. Read the explanation text, then click "Grant full browser control".
  4. Accept Chrome's site-access prompt and check that the site now shows "browser control granted".

## S10.38 Tool-action approval.

- **Expected:** When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:489 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1260
- **Where to find it:** Side panel > computer-use task on an approved site > card "Approve action:" (labels found in the code)
- **Needs:** an approved site with browser control granted and a task that performs a browser action
- **Steps:**
  1. Start a computer-use task on a site you have approved and granted browser control.
  2. Wait for the card titled "Approve action:" followed by the tool name.
  3. Read the description shown on the card.
  4. Click "Allow", "Allow for this task" or "Skip" and check that only that one call is decided.

## S10.39 Sensitive-data transfer approval.

- **Expected:** Before private or sensitive data is sent to an outside destination, the user is asked to approve that transfer and told what goes where.
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/approvalPolicy.ts:359; apps/extension/src/features/computer-use/approvalPolicy.ts:387; apps/extension/src/features/side-panel/computerUsePanel.ts:891
- **Where to find it:** Side panel > computer-use task that uploads a file > card "Approve file upload" (labels found in the code)
- **Needs:** an approved site and a file to upload
- **Steps:**
  1. Start a computer-use task on an approved site that needs to upload a file.
  2. Wait for the card titled "Approve file upload" with a preview of the file.
  3. Read the description and the file preview on the card.
  4. Click "Allow" or "Skip" and check that the file is sent only after you allow it.

## S10.46 Diagnostic-sharing consent.

- **Expected:** Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).
- **Code:** done. Evidence present: apps/extension/src/features/options/data-handling-section.ts:185; apps/extension/src/features/observability/errorReporting.ts:26
- **Where to find it:** Options > Share crash reports (labels found in the code)
- **Steps:**
  1. Open the AGI extension options page.
  2. Find the data-handling section that holds the "Share crash reports" toggle.
  3. Read the description: "Crash reports stay off. Nothing is sent when an unhandled error occurs." (off) or the text about what is sent (on).
  4. Switch the toggle on and off and check the description changes to match.
