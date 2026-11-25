---
id: "PLAN-cli-109"
type: "test-plan"
title: "CLI · 109. Optional native and ambient extensions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "109"
---
# CLI · 109. Optional native and ambient extensions

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S109.22 Local runtime health.

- **Expected:** The app shows whether the local model runtime is running and healthy, with errors when it is not.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1868; apps/cli/src/lib.rs:4768; apps/cli/src/local_models.rs:383
- **Where to find it:** Terminal: type "agi models status" (the same check runs with "agi models scan"; add --json for JSON output) (labels found in the code)
- **Needs:** a terminal with the AGI CLI installed; optional: a local model server such as Ollama to see a running state
- **Steps:**
  1. Open a terminal and type: agi models status, then press Return.
  2. Read the first line of output, which should be "Local model servers".
  3. Look at each provider line: it shows the provider name, "running" or "not running", and the base URL.
  4. If a provider shows "not running", check for the indented "error:" line under it and the models list ("models: none discovered" when nothing is found).
  5. Start a local model server (such as Ollama), run agi models status again, and confirm the line changes to "running" and lists its models.
