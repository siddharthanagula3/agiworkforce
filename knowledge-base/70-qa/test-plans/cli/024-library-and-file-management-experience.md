---
id: "PLAN-cli-024"
type: "test-plan"
title: "CLI · 24. Library and file-management experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "24"
---
# CLI · 24. Library and file-management experience

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S24.04 Artifact view.

- **Expected:** A view lists the user's artifacts and opens each one.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3866; apps/cli/src/cloud/artifacts.rs:330
- **Where to find it:** Type agi artifacts list in the terminal (the list), then agi artifacts open <id> for each artifact; in the chat REPL, type /artifacts to list and /artifacts open <id> to open (labels found in the code)
- **Needs:** A signed-in AGI account (not Local mode) that has at least one artifact, and a Mac with a default web browser
- **Steps:**
  1. In a terminal, type agi artifacts list and press Return.
  2. Look for one block per artifact: an id, the title, and [type] on the first line, then a line starting with conversation and a date.
  3. Copy one id from the list.
  4. Type agi artifacts open <id> with that id, replacing <id>, and press Return.
  5. Look for your default web browser opening the artifact's published page, or the conversation it came from if it is not published.
  6. Compare with Expected: the list shows your artifacts and the open step opens the chosen one. Repeat with another id to check each one opens.
