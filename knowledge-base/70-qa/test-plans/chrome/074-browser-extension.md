---
id: "PLAN-chrome-074"
type: "test-plan"
title: "Chrome · 74. Browser extension"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "74"
---
# Chrome · 74. Browser extension

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S74.01 Toolbar action.

- **Expected:** Clicking the extension's toolbar button (or its shortcut) opens the assistant.
- **Code:** done. Evidence moved: apps/extension/manifest.json:51 (quoted code not found in the file now); apps/extension/src/background.ts:806 (quoted code not found in the file now)
- **Where to find it:** Chrome toolbar > AGI Extension icon (click it). Shortcut: Command+Shift+K, listed as "Open AGI side panel" at chrome://extensions/shortcuts (labels found in the code)
- **Steps:**
  1. Open Chrome on a normal web page, not a Chrome page.
  2. Click the AGI Extension icon in the Chrome toolbar (hover shows the name "AGI Extension").
  3. Or press Command+Shift+K.
  4. Look for the AGI assistant to open beside the page. Compare with Expected: clicking the button or the shortcut opens the assistant.

## S74.03 Side panel.

- **Expected:** A side panel hosts the assistant beside the page.
- **Code:** done. Evidence moved: apps/extension/manifest.json:84; apps/extension/src/side_panel.ts:4802 (quoted code not found in the file now)
- **Where to find it:** Chrome toolbar > AGI Extension icon, then the side panel that opens beside the page, with the tab labelled "Chat" (labels found in the code)
- **Steps:**
  1. Open a normal web page.
  2. Click the AGI Extension icon in the Chrome toolbar.
  3. Look at the panel that opens on the side of the same Chrome window.
  4. Check that the assistant (tabs "Chat" and "Computer Use") is shown beside the page. Compare with Expected.

## S74.04 Selection context menu.

- **Expected:** Right-clicking selected text offers assistant actions.
- **Code:** done. Evidence present: apps/extension/src/background.ts:7455; apps/extension/src/background.ts:7608
- **Where to find it:** Select some text on a web page > right-click the selection > "Explain this", "Translate this" or "Ask AGI about "%s"" (Chrome shows the selected words in place of %s) (some labels not found in the code; trust the screen)
- **Steps:**
  1. Open a normal web page and select a sentence with the mouse.
  2. Right-click the selected text.
  3. Look for the entries "Ask AGI about" (the selected words in quotes), "Explain this" and "Translate this".
  4. Compare with Expected: the menu offers assistant actions for the selection.

## S74.05 Ask about selected text.

- **Expected:** The user asks about the text they selected and gets an answer in the extension.
- **Code:** done. Evidence moved: apps/extension/src/background.ts:7455; apps/extension/src/background.ts:7608; apps/extension/src/side_panel.ts:10950 (quoted code not found in the file now)
- **Where to find it:** Select text on a web page > right-click the selection > "Ask AGI about "%s"" (the selected words fill the template) (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in AGI account for an answer from the assistant (not verified in code)
- **Steps:**
  1. Select a short phrase on a web page.
  2. Right-click the selection and choose the "Ask AGI about" entry.
  3. Wait for the side panel to open.
  4. Look for the assistant to use the selected text in its answer. Compare with Expected.

## S74.06 Ask about current page.

- **Expected:** The user asks a question about the current page from the extension.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:6544; apps/extension/src/side_panel.ts:10565; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:461
- **Where to find it:** Right-click an empty area of a web page > "Ask AGI about this page". Or in the side panel: "Add attachment" (+) > "Add the browser page", then type a question (labels found in the code)
- **Needs:** a signed-in AGI account for chat (not verified in code)
- **Steps:**
  1. Open a normal web page with some text on it.
  2. Right-click an empty area (not on a link or selected text) and choose "Ask AGI about this page".
  3. Or open the side panel, click the "+" button labelled "Add attachment", then choose "Add the browser page".
  4. Type a question about the page and send it. Look for an answer about that page's content. Compare with Expected.

## S74.07 Summarize current page.

- **Expected:** One action summarizes the current page.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6869 (quoted code not found in the file now); apps/extension/src/side_panel.ts:4556 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10565
- **Where to find it:** Right-click an empty area of a web page > "Summarize this page". Or type "/" in the side panel message box and choose "/summarize" (labels found in the code)
- **Needs:** a signed-in AGI account for chat (not verified in code)
- **Steps:**
  1. Open a normal web page with readable text.
  2. Right-click an empty area and choose "Summarize this page".
  3. Or open the side panel, type / in the message box and pick /summarize.
  4. Look for one summary of the page in the chat. Compare with Expected.

## S74.08 Ask about a video.

- **Expected:** The user asks about a video on the page and the answer uses its content.
- **Code:** done. Evidence present: apps/extension/src/features/content/in-page-panel/pageActions.ts:67; apps/extension/src/features/content/in-page-panel/youtubeTranscript.ts:290
- **Where to find it:** Open a YouTube video page (youtube.com/watch) > "Open AGI" button on the page > "Summarize video" (labels found in the code)
- **Needs:** a YouTube video page with captions, the page assistant overlay turned on, and the site approved (approval gating not traced)
- **Steps:**
  1. Turn on "Page assistant overlay" in the extension's Extension settings first, then open a YouTube video that has captions.
  2. Click the "Open AGI" round button on the page (its tooltip reads "Ask AGI").
  3. Click "Summarize video" in the panel.
  4. Look for a summary that uses the video's transcript. Compare with Expected.

## S74.11 Multiple side conversations.

- **Expected:** The user keeps several separate conversations in the extension and switches between them.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6357 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6852 (quoted code not found in the file now)
- **Where to find it:** Chat tab: "New chat" button (pen icon) to start a second chat; "Recent chats" button (clock icon) to switch between chats (labels found in the code)
- **Needs:** a signed-in AGI account (saved chats are not verified without sign-in)
- **Steps:**
  1. Send a message in the chat.
  2. Click the "New chat" icon at the top of the side panel.
  3. Send a different message in the new chat.
  4. Click "Recent chats" (clock icon) and open the first chat. Look that the first chat's messages come back separately. Compare with Expected.

## S74.12 Page-context chips.

- **Expected:** Attached page context shows as a visible chip the user can see and remove.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8121 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8174 (quoted code not found in the file now)
- **Where to find it:** Chat tab: "+" (Add attachment) > "Add the browser page". The chip shows above the message box with "Snapshot · $HOST$" and a remove button (labels found in the code)
- **Needs:** a normal web page (not a Chrome page)
- **Steps:**
  1. Open a normal web page.
  2. In the side panel click "+" (Add attachment) and choose "Add the browser page".
  3. Look above the message box for a chip showing "Snapshot · " and the site name.
  4. Click the "×" button on the chip (labelled "Remove" plus the page name) and see the chip disappear. Compare with Expected.

## S74.13 Explicit site-access request.

- **Expected:** Before reading a site, the extension asks Chrome for that site's access explicitly.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7640 (quoted code not found in the file now); apps/extension/src/features/options/site-allowlist.ts:93
- **Where to find it:** Chat tab: "+" (Add attachment) > "Add the browser page" on a site not yet approved. A card titled "AGI needs access to $HOST$" appears in the chat with "Allow for this task" and "Decline" (labels found in the code)
- **Needs:** a normal website that is not yet approved
- **Steps:**
  1. Make sure the site is not in your approved sites (Extension settings > Permissions > Blocked sites / approved list).
  2. Open that site in a tab and make it the active tab.
  3. In the side panel click "+" and choose "Add the browser page".
  4. Look for the card "AGI needs access to" with the site name and the buttons "Allow for this task" and "Decline". Compare with Expected: access is asked for explicitly before reading.

## S74.14 Per-site permission settings.

- **Expected:** The user reviews and changes which sites the extension may use and how.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7578 (quoted code not found in the file now); apps/extension/src/features/options/site-permission-policy.ts:236 (quoted code not found in the file now); apps/extension/src/features/site-policy/store.ts:27
- **Where to find it:** More ("⋮" button, labelled "More") > "Extension settings" (opens the Permissions page) > "Browser control" dropdown, "Blocked sites" list and the approved-sites list (labels found in the code)
- **Steps:**
  1. In the side panel click the "More" button (⋮) at the top right.
  2. Click "Extension settings".
  3. On the Permissions section, change the "Browser control" dropdown (Auto, Ask first, Full access) and read its text.
  4. Scroll to "Blocked sites" and the approved-sites list, remove or add a site, then reload the page to see the change. Compare with Expected.

## S74.15 Agent action indicator.

- **Expected:** While the agent acts, the extension clearly shows it is acting.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1270; apps/extension/src/side_panel.ts:13786
- **Where to find it:** While a browser task runs: the page shows a "Browser task controls" dock with "Stop" and "Take over", and a pointer moves over the page; the side panel's "Computer Use" tab shows the run (labels found in the code)
- **Needs:** an approved site and a signed-in AGI account
- **Steps:**
  1. Approve a site and start a browser task from the "Computer Use" tab (see S74.16).
  2. Watch the page while the task runs.
  3. Look for the "Browser task controls" dock on the page and the pointer moving over it.
  4. Look at the "Computer Use" tab for the active run and the page name. Compare with Expected.

## S74.16 Browser-control mode.

- **Expected:** The user switches the extension into a mode where it controls the browser for a goal they give.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/computerUsePanel.ts:1605; apps/extension/src/background.ts:4087 (quoted code not found in the file now)
- **Where to find it:** Side panel: "Computer Use" tab > "Task" box > "Start". Mode is chosen in the dropdown with the label "How should AGI act in your browser?" (Auto, Ask first, Full access) (labels found in the code)
- **Needs:** a signed-in AGI account and an approved site (without sign-in the panel shows "Sign in required")
- **Steps:**
  1. Open an approved site in the active tab.
  2. Click the "Computer Use" tab.
  3. Type a goal in the "Task" box and check the line that says "Works on" with the site name.
  4. Click "Start" and watch the status. Compare with Expected: AGI takes control of the browser for the goal.

## S74.17 Stop/takeover control.

- **Expected:** A visible control stops the agent or lets the user take over.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1224; apps/extension/src/features/computer-use/agentLoop.ts:186
- **Where to find it:** "Computer Use" tab during a run: "Stop" and "Take over" buttons; "Continue" appears after Take over (labels found in the code)
- **Needs:** an approved site and a running browser task
- **Steps:**
  1. Start a browser task (see S74.16).
  2. Click "Take over" and read the message that AGI is paused. Use the page yourself.
  3. Click "Continue" to hand the page back, or click "Stop" to end the run.
  4. Look for the run to stop and the status to show "Stopping…" then end. Compare with Expected.

## S74.18 Desktop-app pairing.

- **Expected:** The extension pairs with the desktop app.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7228 (quoted code not found in the file now); apps/extension/src/features/native-bridge/pairing.ts:1
- **Where to find it:** More (⋮) > "Extension settings" > "Account" tab > "Desktop app" section > "Pair with Desktop" (labels found in the code)
- **Needs:** the AGI Desktop app running on this Mac
- **Steps:**
  1. Open the AGI Desktop app on this Mac and leave it open.
  2. In the side panel click "More" (⋮) > "Extension settings".
  3. Choose the "Account" section and find "Desktop app".
  4. Click "Pair with Desktop", type the code shown in the Desktop app into the field and click "Confirm Code". Compare with Expected: the status changes to "Paired".

## S74.19 Native-host connection status.

- **Expected:** The extension shows whether its desktop native host is connected and lets the user reconnect.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5068 (quoted code not found in the file now); apps/extension/src/side_panel.ts:15647; apps/extension/src/background.ts:5112
- **Where to find it:** Side panel, above the message box: notice "Desktop tools are optional and currently disconnected." with a "Reconnect" button. Pairing state is in Extension settings > Account > "Desktop app" (labels found in the code)
- **Needs:** the AGI Desktop app, and a way to stop it
- **Steps:**
  1. Make sure the Desktop app is not running (or is not paired).
  2. Open the side panel and look above the message box for the notice "Desktop tools are optional and currently disconnected."
  3. Click "Reconnect" and watch the notice.
  4. Start the Desktop app and click "Reconnect" again; the notice should disappear. Compare with Expected.

## S74.21 Voice entry where supported.

- **Expected:** The user dictates a message by voice where the browser supports it.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:14102; apps/extension/src/features/side-panel/voice.ts:136
- **Where to find it:** Side panel: the microphone button "Voice input" next to the message box. First use shows "Before you dictate" with "Not now" and "Continue" (labels found in the code)
- **Needs:** a microphone and a Chrome build with speech recognition (on an unsupported browser the button is disabled and shows "Voice input is not supported in this browser")
- **Steps:**
  1. Open the side panel and click the microphone button labelled "Voice input".
  2. Read the notice and click "Continue".
  3. Allow the microphone when Chrome asks.
  4. Speak a sentence and look for the words to appear in the message box. Compare with Expected.

## S74.25 Unsupported-page explanation.

- **Expected:** On pages the extension cannot use it says why.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:13677; apps/extension/src/side_panel.ts:6424
- **Where to find it:** Open a Chrome page the extension cannot read (for example chrome://extensions or the Chrome Web Store) > side panel shows "Page access unavailable" with a "Retry" button. "Add attachment" > "Add the browser page" is disabled there (labels found in the code)
- **Steps:**
  1. Open a tab with chrome://extensions in the address bar.
  2. Click the AGI Extension toolbar icon to open the side panel.
  3. Read the notice "Page access unavailable" and its explanation.
  4. Click "+" (Add attachment) and hover "Add the browser page" to see "Page context is unavailable on this browser page". Compare with Expected.

## S74.28 Recovery after background-worker suspension.

- **Expected:** After Chrome suspends the background worker, chats and agent runs recover or report clearly.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:6912; apps/extension/src/side_panel.ts:1665; apps/extension/src/features/side-panel/computerUsePanel.ts:1410
- **Where to find it:** no screen of its own. Chrome decides when to suspend the background worker, so the tester cannot force it; the steps only show the recovery messages the code shows when the panel reopens.
- **Needs:** none (Chrome's own suspension of the background worker cannot be forced from the UI)
- **Steps:**
  1. Start a browser task on an approved site (see S74.16).
  2. Close the side panel and open it again with the AGI Extension toolbar icon.
  3. Look at the "Computer Use" tab: the message "A browser-control run started before this panel was reopened is still active. Use Stop to end it." should show, or "Browser task status is unavailable." if status cannot be read.
  4. Look for "Reconnecting…" in a chat while the connection is lost. Compare with Expected.
