---
id: "PLAN-cli-041"
type: "test-plan"
title: "CLI · 41. Temporary and private experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "41"
---
# CLI · 41. Temporary and private experiences

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S41.14 Local-only conversation.

- **Expected:** The user can keep conversations only on their device, never uploaded to the account.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6002; apps/cli/src/sessions.rs:555; apps/cli/src/sessions.rs:237
- **Where to find it:** agi, then type /privacy-mode local, then /privacy-settings (labels found in the code)
- **Steps:**
  1. Open a terminal in any folder and run: agi
  2. Type /privacy-mode local and press Enter
  3. Type /privacy-settings and press Enter
  4. Look for the line "Active mode: local" and the History line that says Local and BYOK sessions stay on this computer, and compare with Expected

## S41.15 Local-only file collection.

- **Expected:** The user can keep a collection of files on the device that chats can use without uploading them.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:332; apps/cli/src/claude_parity.rs:457; apps/cli/src/claude_parity.rs:347
- **Where to find it:** agi, then type /files, or /files <path> to attach a file, or /add-dir <directory> for a folder (labels found in the code)
- **Needs:** a text file on this Mac
- **Steps:**
  1. Run: agi
  2. Type /files and press Enter to see the current list of files
  3. Type /files followed by the path of a text file on this Mac, then press Enter
  4. Type /privacy-settings and press Enter, then compare the "Local file access" and "Attached files" lines with Expected

## S41.16 Local-only Memory.

- **Expected:** The user can keep memory only on the device, never stored in the account.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6518; apps/cli/src/memory_pipeline.rs:11; apps/cli/src/memory_pipeline.rs:475 (quoted code not found in the file now)
- **Where to find it:** agi, then type /memories (TUI screen titled Memory Settings) (labels found in the code)
- **Steps:**
  1. Run: agi
  2. Type /memories and press Enter
  3. Look at the Memory Settings box with the lines Auto-memory, Decay threshold and Max facts; Enter toggles the highlighted line
  4. Look for any line on this screen that says where memory is stored; none is shown, so compare with Expected

## S41.18 Separate history, training, and retention controls.

- **Expected:** History, model training and data retention each have their own clearly separate control or statement.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:464
- **Where to find it:** agi, then type /privacy-settings (statement lines, not toggles) (labels found in the code)
- **Steps:**
  1. Run: agi
  2. Type /privacy-settings and press Enter
  3. Find the three separate lines starting History:, Model training: and Retention:
  4. Compare: each topic has its own line, as Expected says

## S41.19 Privacy-setting education.

- **Expected:** The product explains, in context, what each privacy setting does.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:224; apps/cli/src/claude_parity.rs:456; apps/cli/src/claude_parity.rs:449
- **Where to find it:** agi, then type /privacy-settings (or /privacy-mode with no words) (labels found in the code)
- **Steps:**
  1. Run: agi
  2. Type /privacy-settings and press Enter
  3. Read the Active mode line, which has a description in brackets, and the lines after it
  4. Type /privacy-mode cloud or another mode name that is not local while in local mode, press Enter, and read the explanation that begins Privacy mode was not changed; compare with Expected

## S41.20 Per-feature processing-location disclosure.

- **Expected:** For each feature the product says where the data is processed (on device, AGI cloud, a named provider).
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:459; apps/cli/src/claude_parity.rs:224; apps/cli/src/claude_parity.rs:453
- **Where to find it:** agi, then type /privacy-settings; the TUI start screen also shows the mode word (labels found in the code)
- **Steps:**
  1. Run: agi and look at the start screen line for the mode: on-device & private in Local mode, billed by your provider in BYOK, AGI cloud subscription in Managed
  2. Type /privacy-settings and press Enter
  3. Look at the lines Telemetry: CLI-local unless managed cloud features are enabled, Sync: opt-in with agi sync and Provider route
  4. Compare: each route or service is named; per-feature storage places are not listed on this screen
