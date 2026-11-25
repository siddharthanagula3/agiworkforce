---
id: "PLAN-cli-074"
type: "test-plan"
title: "CLI · 74. Browser extension"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "74"
---
# CLI · 74. Browser extension

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S74.19 Native-host connection status.

- **Expected:** The extension shows whether its desktop native host is connected and lets the user reconnect.
- **Code:** done. Evidence present: apps/cli/src/agent/mod.rs:1107
- **Where to find it:** Type "/chrome" in the AGI CLI (TUI or REPL). The bottom bar also shows "browser paired · /chrome", "browser not answering · /chrome" or "browser not paired · /chrome". (labels found in the code)
- **Needs:** none for the status; a Mac with AGI Desktop and the AGI Chrome extension to see a paired state
- **Steps:**
  1. Start the AGI CLI in a terminal on a Mac where AGI Desktop may or may not be running.
  2. Type /chrome and press Enter.
  3. Read the "Chrome integration" block. It says one of: "Paired. This session can read and act in the browser you are looking at.", "Paired, but the browser is not answering.", "AGI Desktop is running, but no browser is paired with it." or "Not available: AGI Desktop is not running."
  4. Follow the line the block gives for the state, for example "Start AGI Desktop, pair the extension, then run /chrome again." Run /chrome again and check that the state now matches.
  5. Compare with Expected: the status shows whether the native host is connected. There is no reconnect button in the CLI; the reconnect path is the instructions printed in the block.
