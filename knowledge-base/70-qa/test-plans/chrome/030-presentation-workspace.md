---
id: "PLAN-chrome-030"
type: "test-plan"
title: "Chrome · 30. Presentation workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "30"
---
# Chrome · 30. Presentation workspace

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S30.28 Export to PPTX.

- **Expected:** The user can download the deck as a .pptx file.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/generatedFiles.ts:274; apps/extension/src/features/side-panel/bubbles.ts:730
- **Where to find it:** Side panel chat > ask for a presentation to be made > under the answer, the "Files from this answer" list > the Download icon button on the .pptx file card (tooltip "Download $FILE$") (labels found in the code)
- **Needs:** a request that makes a .pptx file; the app must produce one, which the extension code does not do itself
- **Steps:**
  1. Sign in to the AGI Chrome side panel and open a new chat.
  2. Ask the assistant to make a presentation (a deck) and wait for the answer to finish.
  3. Look under the answer for the "Files from this answer" list and find the card for the .pptx file.
  4. Click the Download icon button on that card (its tooltip reads "Download <file name>").
  5. Check that the browser saves a .pptx file with the deck's name and that the status line under the card does not show a failure message.
