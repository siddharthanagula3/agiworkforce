---
id: "PLAN-mobile-030"
type: "test-plan"
title: "Mobile · 30. Presentation workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "30"
---
# Mobile · 30. Presentation workspace

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S30.28 Export to PPTX.

- **Expected:** The user can download the deck as a .pptx file.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts:81; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:692; apps/mobile/services/fileCreation.ts:280
- **Where to find it:** Chat > open a generated .pptx file card (the artifact opens full screen) > Download icon in the top bar (accessibility label "Download artifact") (labels found in the code)
- **Needs:** a signed-in account and a chat that has produced a .pptx file (a deck the server created); a phone or simulator to see the share sheet
- **Steps:**
  1. Sign in and open a chat that has produced a PowerPoint file (a generated .pptx). Open its card so it opens full screen.
  2. Tap the download icon in the top bar (labelled "Download artifact" for screen readers).
  3. The app downloads the file and opens the share sheet with the file. Check that the file is a .pptx and that it opens as a presentation.
