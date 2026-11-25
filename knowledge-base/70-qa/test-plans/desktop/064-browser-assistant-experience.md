---
id: "PLAN-desktop-064"
type: "test-plan"
title: "Desktop · 64. Browser-assistant experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "64"
---
# Desktop · 64. Browser-assistant experience

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S64.01 Current-page context.

- **Expected:** The assistant reads the page open in the user's browser and answers with it as context.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1164; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:131; apps/desktop/electron/runtime/dispatcher.ts:2152
- **Where to find it:** Chat composer > the + button (aria-label "More composer options") > Use the browser > Read the page (labels found in the code)
- **Needs:** A paired Chrome browser with the AGI extension and a page open in Chrome
- **Steps:**
  1. Sign in, open a chat, and pair Chrome with the AGI extension if it is not paired yet.
  2. Open a web page in Chrome and keep it as the active tab.
  3. Click the + button in the message box, then click Use the browser.
  4. Click Read the page and read the address, title and text shown in the Recent activity area and the transcript box.
  5. Compare the shown title and address with the page open in Chrome.

## S64.02 Selected-text context.

- **Expected:** Text the user highlights on a web page reaches the assistant as context for a question.
- **Code:** done. Evidence present: apps/desktop/electron/browser/bridgeServer.ts:724; apps/desktop/electron/main.ts:501
- **Where to find it:** Chrome: highlight text on an approved site > right-click the selection > Explain this, or open the AGI side panel > + > Add selected text (labels found in the code)
- **Needs:** Chrome with the AGI extension and an approved site
- **Steps:**
  1. In Chrome, open a site the user has approved in the AGI extension.
  2. Select a sentence or paragraph of text on the page.
  3. Right-click the selection and click Explain this.
  4. Or open the AGI side panel, click its + button and click Add selected text.
  5. Look in the AGI chat for the selected text sent as context and the question asked about it.

## S64.05 Page summary.

- **Expected:** One action summarizes the page the user is viewing.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:265; apps/web/features/desktop-host/lib/device-steps.ts:220
- **Where to find it:** not found in the code. No button named Summarize was found; the closest is Read the page in Use the browser, whose description mentions summarizing, and the summary request is typed in chat.
- **Needs:** A paired Chrome browser with a page open

## S64.06 Question about page.

- **Expected:** The user asks a free-form question and the answer uses the current page's content.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1164; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:131; apps/desktop/electron/runtime/dispatcher.ts:2152
- **Where to find it:** Chat composer > the + button (aria-label "More composer options") > Use the browser > Read the page, then type the question in the chat box (labels found in the code)
- **Needs:** A paired Chrome browser with the AGI extension and a page open in Chrome
- **Steps:**
  1. Pair Chrome with the AGI extension and open a page in Chrome.
  2. Click the + button in the message box, then click Use the browser.
  3. Click Read the page to load the current page.
  4. Type a question about the page in the chat box and send it.
  5. Check that the answer uses facts from the page that is open in Chrome.

## S64.10 Open URL.

- **Expected:** The assistant opens a web address in the browser for the user.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:269; apps/desktop/electron/runtime/dispatcher.ts:2633
- **Where to find it:** Chat composer > the + button (aria-label "More composer options") > Use the browser > Open a page (labels found in the code)
- **Needs:** A paired Chrome browser with the AGI extension
- **Steps:**
  1. Click the + button in the message box, then click Use the browser.
  2. Choose Open a page.
  3. Type https://example.com in the field labelled Address.
  4. Send the action with the dialog's action button.
  5. Look in Chrome for the new address opened in the active tab.

## S64.11 Back/forward/reload.

- **Expected:** The assistant can go back, go forward or reload the page it is working on.
- **Code:** partial. Evidence present: apps/desktop/electron/browser/commandGate.ts:265; apps/desktop/electron/browserPane.ts:354
- **Known to be unfinished:** The assistant can go back and forward in a paired browser tab, and the built-in pane has back, forward and reload controls; the assistant has no reload command for the page it is working on.
- **Where to find it:** Browser panel of a coding session (aria-label "Browser") > Back, Forward or Reload (labels found in the code)
- **Needs:** Desktop app with a coding session and a Browser panel
- **Steps:**
  1. Open a coding session that shows the Browser panel and load two pages in it.
  2. Click Back and check that the previous page loads.
  3. Click Forward and check that the next page loads again.
  4. Click Reload and check that the current page reloads.
  5. Check that Back and Forward are greyed out when there is no history.

## S64.15 Form filling.

- **Expected:** The assistant fills in a web form on the user's behalf.
- **Code:** done. Evidence present: packages/contracts/local-runtime/src/device-steps.ts:277; apps/web/lib/device-steps/device-tools.ts:422; apps/desktop/electron/browser/browserSteps.ts:134
- **Where to find it:** Chat composer > the + button (aria-label "More composer options") > Use the browser > Type (labels found in the code)
- **Needs:** A paired Chrome browser and a page with a form
- **Steps:**
  1. Pair Chrome and open a page with a form in Chrome.
  2. Click the + button in the message box, then click Use the browser.
  3. Click Read the page and note a field selector from the text shown.
  4. Choose Type, enter the CSS selector in the field labelled CSS selector and the value in Text, then send.
  5. Look in Chrome to see the text typed into that field.

## S64.18 Visible action timeline.

- **Expected:** Each browser action the assistant takes is listed for the user as it happens.
- **Code:** done. Evidence present: apps/desktop/electron/browser/bridgeServer.ts:1153; apps/desktop/electron/browser/bridgeServer.ts:1177; apps/desktop/electron/runtime/dispatcher.ts:2635; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:422
- **Where to find it:** Chat composer > the + button (aria-label "More composer options") > Use the browser > Recent activity (labels found in the code)
- **Needs:** A paired Chrome browser with the AGI extension
- **Steps:**
  1. Pair Chrome, then open Use the browser from the + button.
  2. Run Read the page or Open a page.
  3. Look at the Recent activity list in the dialog.
  4. Check that the new entry shows the command name and its status: running, then done or failed.

## S64.26 Download review.

- **Expected:** Files the assistant downloads are approved and listed so the user can review them.
- **Code:** done. Evidence present: apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:451; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:470; apps/desktop/electron/browser/browserSteps.ts:134
- **Where to find it:** Chat composer > the + button (aria-label "More composer options") > Use the browser > Download a file > Downloads section (labels found in the code)
- **Needs:** A paired Chrome browser and a file address to download
- **Steps:**
  1. Pair Chrome, open Use the browser, and choose Download a file.
  2. Type the address of a file in the field labelled Address and send it.
  3. Look for the Downloads section listing the downloaded file name.
  4. Click Open Downloads folder and check the file is there.

## S64.30 Clear website data.

- **Expected:** The user can clear the cookies and site data the assistant's browser holds.
- **Code:** done. Evidence present: apps/desktop/electron/browserPane.ts:423; apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:39; apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:103
- **Where to find it:** Settings > Browser > Clear browsing data > Clear (labels found in the code)
- **Needs:** Desktop app (the section is hidden on the web)
- **Steps:**
  1. In the Desktop app, open Settings and go to the Browser section.
  2. Click Clear browsing data.
  3. Read the confirmation titled Clear browsing data? and click Clear.
  4. Look for the message Browsing data cleared.
  5. Open a site that needed sign-in in the browser pane and check that you are signed out.

## S64.32 Browser-task result summary.

- **Expected:** When a browser task ends the assistant reports what it did and what still needs the user.
- **Code:** done. Evidence present: apps/web/features/desktop-host/lib/device-steps.ts:226; apps/web/features/desktop-host/components/BrowserToolsDialog.tsx:422
- **Where to find it:** Chat composer > the + button (aria-label "More composer options") > Use the browser > run an action > result text above Recent activity (labels found in the code)
- **Needs:** A paired Chrome browser with the AGI extension
- **Steps:**
  1. Pair Chrome, open Use the browser, and run an action such as Read the page.
  2. Read the result text shown above Recent activity.
  3. Read the Recent activity entries for the outcome: done, or failed with a message.
  4. If an action fails, look for the message That browser action did not run.
