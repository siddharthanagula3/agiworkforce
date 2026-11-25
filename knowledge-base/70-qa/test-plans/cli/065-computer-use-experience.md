---
id: "PLAN-cli-065"
type: "test-plan"
title: "CLI · 65. Computer-use experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "65"
---
# CLI · 65. Computer-use experience

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S65.12 Local-folder permission.

- **Expected:** The user grants the agent specific local folders and can revoke them.
- **Code:** done. Evidence present: apps/cli/src/agent/mod.rs:1331; apps/cli/src/claude_parity.rs:372; apps/cli/src/claude_parity.rs:222; crates/agiworkforce-command-registry/src/lib.rs:619
- **Where to find it:** Start the app with agi, then type /add-dir <folder> at the prompt (for example /add-dir ~/Desktop/some-folder). To see the list, type /add-dir with no folder. To revoke, type /remove-dir <folder>. The same grant can also be made at launch with agi --add-dir <folder>. (labels found in the code)
- **Needs:** a folder on this Mac to add and remove
- **Steps:**
  1. Open a terminal, run agi, and wait for the prompt.
  2. Type /add-dir ~/Desktop/some-folder (use a real folder on this Mac) and press Return. Look for a line starting with 'added:' that shows the folder path and whether instructions were found.
  3. Type /add-dir alone and press Return. Look for the heading 'Added directories the agent may read and change:' with the folder listed under it.
  4. Type /remove-dir ~/Desktop/some-folder and press Return. Look for 'removed:' followed by 'the agent can no longer reach it'.
  5. Type /add-dir alone again. Compare with Expected: the folder should be gone from the list after the revoke.
