---
id: "PLAN-chrome-065"
type: "test-plan"
title: "Chrome · 65. Computer-use experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "65"
---
# Chrome · 65. Computer-use experience

11 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S65.01 Computer-access setup.

- **Expected:** The user turns computer use on in a guided setup that grants the needed permissions.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1580; apps/extension/src/features/side-panel/computerUsePanel.ts:1641; apps/extension/src/side_panel.ts:14011; apps/extension/src/side_panel.ts:13986
- **Where to find it:** Computer Use tab > setup card, after opening an ordinary website: the button "Allow browser control on <site>" (also under Extension settings > Permissions > Grant full browser control) (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account and an ordinary website open
- **Steps:**
  1. Sign in to AGI in the side panel and open an ordinary website (not a Chrome page or the Web Store).
  2. Click the "Computer Use" tab at the top of the side panel.
  3. Read the card: its headline is "This grants full DevTools-Protocol control" and its title is "Let AGI act on <site>".
  4. Click "Allow browser control on <site>" and accept Chrome's site-access prompt.
  5. Compare with Expected: the card should close and the line "Works on <site>" should appear under the task box.

## S65.07 Screen preview.

- **Expected:** The user sees what the agent sees on screen as it works.
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/agentLoop.ts:179; apps/extension/src/features/side-panel/computerUsePanel.ts:1837
- **Where to find it:** Computer Use tab > Assistant steps (screenshot entries appear as the task runs) (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account and an ordinary website open
- **Steps:**
  1. Open an ordinary website and sign in to AGI.
  2. Click the "Computer Use" tab, approve the site if asked, type a short task and click "Start".
  3. Click "Assistant steps" to open the step list if it is closed.
  4. Watch the steps appear while AGI works.
  5. Compare with Expected: screenshot steps should show a small picture of the page AGI sees at that moment.

## S65.08 Cursor/action visualization.

- **Expected:** The agent's pointer position or action target is shown visually as it acts.
- **Code:** done. Evidence moved: apps/extension/src/features/computer-use/agentLoop.ts:564; apps/extension/src/background.ts:6735; apps/extension/src/content.ts:1846 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The pointer and glow are injected into the page by the run overlay; they appear only while a run is active.
- **Needs:** a signed-in account and an approved ordinary website
- **Steps:**
  1. Start a task on an approved ordinary website from the Computer Use tab.
  2. Watch the page while AGI clicks or types.
  3. Compare with Expected: an arrow pointer should move to the place AGI acts, and the page should show a dock with the buttons "Stop" and "Take over" at the bottom.

## S65.18 Background application operation where supported.

- **Expected:** The agent can operate an application in the background without taking over the user's screen.
- **Code:** partial. Evidence present: apps/extension/src/features/computer-use/agentLoop.ts:1099; apps/extension/src/background.ts:4281
- **Known to be unfinished:** partials/privacy c46c84d983: switching tabs no longer cancels a run and steps no longer require the run tab to be active; the run enables CDP focus emulation. Live check (final pass): start a run, switch to another tab, and confirm Page.captureScreenshot and input keep working in the background tab.
- **Where to find it:** no screen of its own. The code is marked partial: the run keeps going after a tab switch, but the final live check for background screenshots and input was not confirmed.
- **Needs:** a signed-in account, an approved ordinary website and a second tab
- **Steps:**
  1. Start a task on an approved ordinary website from the Computer Use tab.
  2. Switch to a different tab in the same window while the task runs.
  3. Return to the Computer Use tab after a few seconds.
  4. Compare with Expected: Assistant steps should keep growing and the run should not show as cancelled.

## S65.19 User-input arbitration.

- **Expected:** When the user moves the mouse or types, the agent yields rather than fighting for control.
- **Code:** done. Evidence moved: apps/extension/src/content.ts:1747; apps/extension/src/background.ts:4466 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. The code hands the page to the person on a real click or key press only when AGI is not in the middle of an action, so the tester should try between steps.
- **Needs:** a signed-in account and an approved ordinary website
- **Steps:**
  1. Start a task on an approved ordinary website from the Computer Use tab.
  2. While AGI is still acting, click or type on the task page yourself.
  3. Compare with Expected: AGI should stop acting on the page and the notice above should appear in the side panel.

## S65.20 Emergency stop.

- **Expected:** One immediate control stops all computer control.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1222; apps/extension/src/features/side-panel/computerUsePanel.ts:1471
- **Where to find it:** Computer Use tab > Stop (also the "Stop" button in the dock on the web page) (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account and an approved ordinary website
- **Steps:**
  1. Start a task on an approved ordinary website from the Computer Use tab.
  2. While the task runs, click "Stop" in the Computer Use tab.
  3. Watch the button change to "Stopping…" and then the run end.
  4. Compare with Expected: the run should stop at once and the log should say "You stopped the run."

## S65.23 Sensitive-action review.

- **Expected:** Sensitive actions (payments, passwords, sending) require the user's review before the agent does them.
- **Code:** done. Evidence present: apps/extension/src/features/computer-use/approvalPolicy.ts:358; apps/extension/src/features/side-panel/computerUsePanel.ts:2064
- **Where to find it:** Computer Use tab > "How should AGI act in your browser?" menu set to "Ask first", then a card titled "Approve action: <tool>" with "Allow", "Allow for this task" and "Skip" (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account, an approved ordinary website and a site with a form
- **Steps:**
  1. Click the "Computer Use" tab and open the menu "How should AGI act in your browser?" and choose "Ask first".
  2. Start a task on an approved ordinary website that reaches a form or button that changes something.
  3. When the card "Approve action:" appears, read the description before choosing.
  4. Compare with Expected: AGI should wait for "Allow" or "Skip" before it acts.

## S65.24 Authentication handoff.

- **Expected:** When sign-in is required the agent hands off to the user and continues afterwards.
- **Code:** done. Evidence moved: apps/extension/src/features/computer-use/agentLoop.ts:1476; apps/extension/src/background.ts:4480 (quoted code not found in the file now)
- **Where to find it:** Computer Use tab > the "Sign in required" chip, then the "Take over" button; after signing in, click "Continue" (path not confirmed in the code; trust the screen)
- **Needs:** a site that requires sign-in and an outside account (Google) if the site uses one
- **Steps:**
  1. Start a task on an approved site that asks for sign-in (use the test account the team gives you).
  2. When AGI pauses for sign-in, read the reason in the side panel and sign in on the page yourself.
  3. Click "Continue" in the Computer Use tab to hand the page back.
  4. Compare with Expected: AGI should carry on with the task from the signed-in page.

## S65.25 Action outcome/receipt.

- **Expected:** Each action leaves a record of what was done and whether it worked.
- **Code:** done. Evidence moved: apps/extension/src/features/computer-use/agentLoop.ts:713 (quoted code not found in the file now); apps/extension/src/features/side-panel/computerUsePanel.ts:1883
- **Where to find it:** Computer Use tab > Assistant steps (each action line starts with "Completed", "Skipped", "Not verified" or "Result") (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account and an approved ordinary website
- **Steps:**
  1. Start a short task on an approved ordinary website from the Computer Use tab.
  2. Open "Assistant steps" when the run has finished.
  3. Click an action line to expand its detail.
  4. Compare with Expected: each action should have its own line that says what was done and whether it was verified.

## S65.26 Unsupported-application explanation.

- **Expected:** When an application cannot be controlled the product says why.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:6424; apps/extension/src/side_panel.ts:10565
- **Where to find it:** Computer Use tab > the line under the task box: "AGI cannot act on this page. Open an ordinary website." (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in and make the active tab a Chrome page such as the Chrome Web Store or chrome://extensions.
  2. Click the "Computer Use" tab.
  3. Read the line under the task box.
  4. Compare with Expected: the line should say AGI cannot act on this page and tell the person to open an ordinary website.

## S65.28 Permission-revoked state.

- **Expected:** When a permission is revoked the agent stops and the user is told how to restore it.
- **Code:** done. Evidence present: apps/extension/src/background.ts:4193; apps/extension/src/features/side-panel/computerUsePanel.ts:819
- **Where to find it:** More > Extension settings > Permissions > the × button next to the site (titled "Remove <site>"); then back in the Computer Use tab (path not confirmed in the code; trust the screen)
- **Needs:** a signed-in account and an approved ordinary website
- **Steps:**
  1. Start a task on an approved ordinary website so a run is active.
  2. Click "More" in the side panel, then "Extension settings", and find "Permissions".
  3. Click the × next to the site in the approved sites list.
  4. Return to the side panel and watch the run.
  5. Compare with Expected: the run should stop and the message should say access was withdrawn and to approve the site again in the Computer use tab.
