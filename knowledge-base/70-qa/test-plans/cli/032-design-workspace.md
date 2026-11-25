---
id: "PLAN-cli-032"
type: "test-plan"
title: "CLI · 32. Design workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "32"
---
# CLI · 32. Design workspace

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S32.31 Export to HTML.

- **Expected:** The user can export the design as a standalone HTML file.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1371; apps/cli/src/cloud/artifacts.rs:238; apps/cli/src/lib.rs:3958
- **Where to find it:** agi artifacts list, then agi artifacts show <id> --out <path> (labels found in the code)
- **Needs:** a signed-in account that has an html artifact
- **Steps:**
  1. Type `agi artifacts list` and copy the id of an artifact whose type is html.
  2. Type `agi artifacts show <id> --out ~/Desktop/exported-design.html` with that id.
  3. Read the printed path, then open that file in a web browser.
  4. Compare with Expected: the design should be saved as a standalone .html file that displays on its own. Note that the plan says 'design' but the command works on any artifact; an html artifact is the one that becomes .html.
