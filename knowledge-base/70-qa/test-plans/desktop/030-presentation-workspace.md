---
id: "PLAN-desktop-030"
type: "test-plan"
title: "Desktop · 30. Presentation workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "30"
---
# Desktop · 30. Presentation workspace

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S30.28 Export to PPTX.

- **Expected:** The user can download the deck as a .pptx file.
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now)
- **Where to find it:** New chat > ask the assistant for a PowerPoint deck (for example "Make a 3-slide PowerPoint deck about our release plan") > on the generated file card under the reply, click Download (labels found in the code)
- **Needs:** a Free account or a paid account (plan gating for office file creation not confirmed in code)
- **Steps:**
  1. Click New chat (or press the command palette and choose New chat) to open an empty conversation.
  2. Type a request that asks for a PowerPoint presentation with a few slide titles and bullets, then send it.
  3. Wait for the reply to show a generated file card with a .pptx name.
  4. Click the Download button on that card (its tooltip-style label is Download generated file).
  5. Open the downloaded file in PowerPoint, Keynote or Preview and check it is a .pptx deck with the slide text you asked for. Compare with Expected: the user can download the deck as a .pptx file.
