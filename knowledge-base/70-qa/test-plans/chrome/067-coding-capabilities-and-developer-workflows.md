---
id: "PLAN-chrome-067"
type: "test-plan"
title: "Chrome · 67. Coding capabilities and developer workflows"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "67"
---
# Chrome · 67. Coding capabilities and developer workflows

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S67.16 Inspect browser behavior.

- **Expected:** The agent opens the app in a browser and inspects how it behaves (navigate, click, read, screenshot).
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1102; apps/extension/src/features/computer-use/agentLoop.ts:965
- **Where to find it:** Side panel > Computer Use tab > Task box > Start (labels found in the code)
- **Needs:** A signed-in AGI Cloud account and a site you can approve for browser control.
- **Steps:**
  1. Sign in to AGI Cloud from the extension drawer, then open the side panel and click the Computer Use tab.
  2. If the site is not approved yet, click "Allow browser control on" followed by the site name, and accept Chrome's site-access prompt.
  3. In the Task box, type a task that makes the agent visit the open page, click something, read text and take a screenshot, for example: "Open this page, click the first link, read the heading and take a screenshot".
  4. Click Start.
  5. Compare with Expected: the agent navigates, clicks, reads the page and shows screenshots in the run's progress. Open "Assistant steps" to see each action.

## S67.17 Inspect console errors.

- **Expected:** The agent reads the browser console errors of the app under test.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1102; apps/extension/src/features/computer-use/agentLoop.ts:965; apps/extension/src/features/browser-tools/consoleCapture.ts:6
- **Where to find it:** Side panel > Computer Use tab > Task box > Start > Assistant steps (labels found in the code)
- **Needs:** A signed-in AGI Cloud account, an approved site, and a page that produces console errors.
- **Steps:**
  1. Follow the first three steps of S67.16 on a page that logs errors to the browser console (a page with a known script error is best).
  2. In the Task box, type: "Check the browser console for errors and tell me what they say".
  3. Click Start and wait for the run to finish.
  4. Open "Assistant steps" and look for the step "Read page console".
  5. Compare with Expected: the step is present and the reply lists the console errors the page shows.

## S67.18 Inspect network failures.

- **Expected:** The agent inspects failed network requests of the app under test.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/computerUsePanel.ts:1102; apps/extension/src/features/computer-use/agentLoop.ts:986
- **Where to find it:** Side panel > Computer Use tab > Task box > Start > Assistant steps (labels found in the code)
- **Needs:** A signed-in AGI Cloud account, an approved site, and a page that makes failing requests.
- **Steps:**
  1. Follow the first three steps of S67.16 on a page that makes requests which fail, such as a page with a broken image or a missing API call.
  2. In the Task box, type: "Check the page for failed network requests and tell me which ones failed".
  3. Click Start and wait for the run to finish.
  4. Open "Assistant steps" and look for the step "Read page network".
  5. Compare with Expected: the step is present and the reply lists the failed requests with their status codes.
