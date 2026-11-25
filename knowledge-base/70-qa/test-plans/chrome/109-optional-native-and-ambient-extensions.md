---
id: "PLAN-chrome-109"
type: "test-plan"
title: "Chrome · 109. Optional native and ambient extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "109"
---
# Chrome · 109. Optional native and ambient extensions

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S109.05 Compact floating assistant.

- **Expected:** A compact assistant floats over other content (other apps or pages) and can take a prompt without opening the full app.
- **Code:** done. Evidence moved: apps/extension/src/inPagePanel/setup.ts:48; apps/extension/src/features/content/in-page-panel/panel.ts:160 (quoted code not found in the file now); apps/extension/src/background.ts:6060
- **Where to find it:** Side panel > More menu > Extension settings > Options > Page assistant overlay (the More menu's trigger label was not found in the code, so the tester may need to look for the menu icon in the side panel; the Options page nav item is "Options"). The floating launcher then appears on approved http and https web pages. (labels found in the code)
- **Needs:** a signed-in account and an approved web page; the panel's answers come from the cloud assistant, so the tester needs a network connection
- **Steps:**
  1. Sign in to the extension and approve a normal web page (http or https) in the approved-sites list, as the Options page describes.
  2. In the side panel, open the More menu, choose "Extension settings", then click "Options" in the left nav and confirm the "Page assistant overlay" toggle is on (it is on by default).
  3. Open the approved web page in a Chrome tab and look for the round "Open AGI" launcher on the right side of the page; hovering it shows the tooltip "Ask AGI".
  4. Click the launcher, type a question in the panel's prompt box, and click Send. Look for the answer in the panel on top of the page, and compare with Expected: a compact assistant floats over the page and takes a prompt without opening the full app.
  5. Note: the code adds the launcher only on http and https pages, so it does not float over other apps.

## S109.09 Screenshot-to-chat shortcut.

- **Expected:** A shortcut captures the screen and attaches it to an AGI chat.
- **Code:** done. Evidence present: apps/extension/manifest.json:69; apps/desktop/electron/browser/bridgeServer.ts:720; apps/desktop/electron/main.ts:501
- **Where to find it:** Keyboard shortcut in Chrome (default on Mac: Command+Shift+Y), labelled "Send a screenshot of the page to Desktop" at chrome://extensions/shortcuts. Inside the app: Options > Shortcuts, where the row is labelled "Send page screenshot to Desktop". (labels found in the code)
- **Needs:** the AGI Desktop app running and paired with the extension, and a web page on an approved site
- **Steps:**
  1. Install and open the AGI Desktop app and make sure the extension shows it as connected (paired).
  2. Open a normal web page on an approved site in Chrome and make it the active tab.
  3. Press Command+Shift+Y (or the shortcut shown in Options > Shortcuts > "Send page screenshot to Desktop"; use the Configure button to change it in Chrome).
  4. Look for the Chrome notification "Page sent to Desktop" with the text "A screenshot of the current page is waiting in Desktop."; then open the AGI Desktop app and check that the screenshot is in a chat, comparing with Expected: a shortcut captures the screen and attaches it to an AGI chat.
  5. If Desktop is not connected, the notification is the undelivered message instead, and nothing is captured.
