---
id: "PLAN-cli-028"
type: "test-plan"
title: "CLI · 28. Code Canvas and application preview"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "28"
---
# CLI · 28. Code Canvas and application preview

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S28.24 Download source.

- **Expected:** The user can download the app's source code.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1375; apps/cli/src/lib.rs:3958
- **Where to find it:** Type agi artifacts show <id> --out <path> in the terminal (a directory path takes the artifact's own name). Run agi artifacts list first to get the id. (some labels not found in the code; trust the screen)
- **Needs:** a signed-in account with at least one artifact
- **Steps:**
  1. Run agi artifacts list and copy the id of a generated artifact.
  2. Run agi artifacts show <id> --out ~/Desktop/ (use an existing folder).
  3. Look at the path printed on screen and open that file. It should hold the artifact's content, which is the generated code.
  4. Compare with Expected: the user can download the code. Note that the command downloads one artifact's content, not the whole app, and the word Download does not appear anywhere.

## S28.26 Open in coding workspace.

- **Expected:** Generated code can be opened in a real coding workspace to keep developing it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1375; apps/cli/src/lib.rs:3958
- **Where to find it:** not found in the code. Searched apps/cli/src for coding workspace, Open in, canvas, code canvas and workspace. No artifact action opens a coding workspace. The closest is agi artifacts show <id> --out <path> --open, which opens the file in the computer's default app, not a coding workspace. The phrase coding workspace appears only in the desktop folder consent text (apps/cli/src/lib.rs:861 and apps/cli/src/app_server/account_host.rs:69).
- **Needs:** unknown

## S28.27 Publish preview.

- **Expected:** The user can publish the app to a shareable preview link.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1399; apps/cli/src/cloud/artifacts.rs:451
- **Where to find it:** Type agi artifacts publish <id> in the terminal. Add --audience workspace to share only with the workspace (default is public). Run agi artifacts list first to get the id. (labels found in the code)
- **Needs:** a signed-in account with an artifact of a publishable kind; a Free account can be tried first
- **Steps:**
  1. Run agi artifacts list and copy the id of an artifact of a publishable kind (html, react, svg, mermaid, markdown, text or code).
  2. Run agi artifacts publish <id>.
  3. Read the printed line that starts Published and copy the link it shows.
  4. Open the link in a private browser window and compare with Expected: the app should open at a shareable link. The CLI calls it a shareable URL, not a preview link.
