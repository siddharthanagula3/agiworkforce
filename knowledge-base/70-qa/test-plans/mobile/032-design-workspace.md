---
id: "PLAN-mobile-032"
type: "test-plan"
title: "Mobile · 32. Design workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "32"
---
# Mobile · 32. Design workspace

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S32.31 Export to HTML.

- **Expected:** The user can export the design as a standalone HTML file.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/artifactExport.ts:100 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1339
- **Where to find it:** Open an HTML artifact from the chat (tap its card to open the full-screen view), then tap the Download artifact icon (down-arrow) in the top bar. The app shares the file directly; there is no choice sheet for an HTML artifact. (labels found in the code)
- **Needs:** an HTML artifact in a chat (a web page made by Claude); a phone or simulator with a share sheet
- **Steps:**
  1. In a chat, ask Claude to make a single-page web page so an HTML artifact appears as a card.
  2. Tap the artifact card to open the full-screen artifact view.
  3. Tap the Download artifact icon (down-arrow, top bar).
  4. Look at the share sheet that opens. It should offer one file ending in .html (the code names it 'HTML file', built from the file extension). Compare with Expected: a standalone HTML file.

## S32.34 Version comparison and restoration.

- **Expected:** The user can compare two versions of a design and restore an earlier one.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1502; apps/mobile/src/features/chat/components/ArtifactChangesView.tsx:4; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:1521
- **Where to find it:** Open an artifact that has 2 or more versions (from a chat card or Library > Artifacts filter). Tap Show changes under the version bar to compare with the previous version. Tap the version button (Version N of M) to open Version history, then tap Restore on an older version. Restore is also offered under the version bar when viewing an older version. (labels found in the code)
- **Needs:** an artifact with 2 or more versions (make one by editing it); no paid plan is shown in the code for this feature
- **Steps:**
  1. Make a second version: open an artifact and use More artifact actions > Edit source (or Ask for changes), save a change so the version bar shows v2/2.
  2. Tap Show changes under the version bar and compare the changed lines with the previous version.
  3. Tap the version button (Version N of M) to open the Version history sheet.
  4. Tap Restore on version 1 in that sheet, or go back to version 1 with the previous arrow and tap Restore under the version bar.
  5. Look at the artifact text. It should match version 1 again. Compare with Expected: an earlier version is restored.
