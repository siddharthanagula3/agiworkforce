---
id: "PLAN-web-030"
type: "test-plan"
title: "Web · 30. Presentation workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "30"
---
# Web · 30. Presentation workspace

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S30.28 Export to PPTX.

- **Expected:** The user can download the deck as a .pptx file.
- **Code:** done. Evidence moved: apps/web/lib/services/managed-office-file-service.ts:162 (quoted code not found in the file now)
- **Where to find it:** Chat (first screen after sign-in) > composer "Add attachments and tools" (plus icon) > Output > Presentation, then send a message asking for a slide deck (labels found in the code)
- **Needs:** a Free or paid account on a model where Office file creation is allowed (the Output row is disabled otherwise)
- **Steps:**
  1. Sign in and open a new chat on a model that supports Office file creation.
  2. Click the plus icon in the composer (its accessible name is "Add attachments and tools").
  3. Click "Output", then click "Presentation" so it is checked.
  4. Type a short request such as "Make a 3-slide deck about our launch plan" and send it.
  5. When the reply shows a generated file card, click "Download" on the card (or open the preview and click "Download").
  6. Open the downloaded file in PowerPoint or Keynote and compare with Expected: it should be a .pptx file.
