---
id: "PLAN-desktop-074"
type: "test-plan"
title: "Desktop · 74. Browser extension"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "74"
---
# Desktop · 74. Browser extension

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S74.18 Desktop-app pairing.

- **Expected:** The extension pairs with the desktop app.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:151; apps/desktop/electron/runtime/dispatcher.ts:3127
- **Where to find it:** Settings > Capabilities > Chrome. The Chrome section is shown only inside the Desktop app (it is hidden in a normal browser). Pairing starts in Chrome: open the extension side panel and choose Connect to Desktop; Desktop then opens a dialog on this Mac that shows the code. (labels found in the code)
- **Needs:** a Mac with the Desktop app, Chrome with the AGI extension installed, and a signed-in account
- **Steps:**
  1. Open the Desktop app on the Mac and sign in. Open the app menu, choose Settings…, then open the Capabilities tab.
  2. Scroll to the Chrome section. If it says Nothing has asked to pair yet, the Install extension button is shown; that is the path to the extension setup page.
  3. In Chrome, open the AGI extension side panel and choose Connect to Desktop. A dialog opens on the Mac showing a code.
  4. Type the code from the Desktop dialog into the Chrome side panel.
  5. Go back to Settings > Capabilities > Chrome and look for the line Paired and answering (with a fingerprint after a dot). Compare with Expected: the extension is paired with the Desktop app.

## S74.19 Native-host connection status.

- **Expected:** The extension shows whether its desktop native host is connected and lets the user reconnect.
- **Code:** done. Evidence moved: apps/web/features/desktop-host/components/BrowserPairingSection.tsx:151; apps/desktop/electron/browser/bridgeServer.ts:421 (quoted code not found in the file now)
- **Where to find it:** Settings > Capabilities > Chrome. The status line shows Paired and answering or Paired, not answering right now. The reconnect action is the button Register the browser host again. (labels found in the code)
- **Needs:** a Mac with the Desktop app and a paired Chrome extension (to see a connected state); a way to stop the connection, such as quitting Chrome, to see the not-answering state
- **Steps:**
  1. Open the Desktop app, open the app menu, choose Settings…, then the Capabilities tab.
  2. Scroll to the Chrome section and read the status line. It shows Paired and answering when the native host is connected, or Paired, not answering right now when it is not.
  3. If the line says Paired, not answering right now, or the text The browser host is not registered, so Chrome cannot reach this app. Register it again below. appears, click Register the browser host again.
  4. Wait for the spinner to finish. Compare with Expected: the status line changes to Paired and answering, and an error appears in red text only if registration fails.
