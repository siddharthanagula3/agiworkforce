---
id: "PLAN-chrome-024"
type: "test-plan"
title: "Chrome · 24. Library and file-management experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "24"
---
# Chrome · 24. Library and file-management experience

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S24.04 Artifact view.

- **Expected:** A view lists the user's artifacts and opens each one.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** Side panel header > Outputs button (shows a count) > Open on a row (labels found in the code)
- **Needs:** a signed-in account, and a chat that has produced at least one artifact; live-web (the preview needs the artifact sandbox origin)
- **Steps:**
  1. Sign in, open the side panel, and open a chat that has produced an artifact (the Outputs button is hidden when a chat has no outputs).
  2. Look at the header: the Outputs button shows a count. Click it.
  3. In the Outputs list, check that each artifact appears as a row with its title and a short meta line.
  4. Click Open on an artifact row. The Artifact panel opens for that artifact, showing its title.
  5. Click Open on another row and check that the panel switches to that artifact. Compare with Expected: a view lists the artifacts and opens each one.
