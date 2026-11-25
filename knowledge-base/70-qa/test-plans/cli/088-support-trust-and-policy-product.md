---
id: "PLAN-cli-088"
type: "test-plan"
title: "CLI · 88. Support, trust, and policy product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "88"
---
# CLI · 88. Support, trust, and policy product

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S88.04 Report-a-bug flow.

- **Expected:** A user can report a bug from the product, with enough context (build, platform) for support to act.
- **Code:** done. Evidence present: apps/cli/src/cloud/feedback.rs:65; apps/cli/src/claude_parity.rs:202; apps/cli/src/tui/tui_app.rs:7800
- **Where to find it:** In the chat, type /bug and press Enter (usage text), then type /bug <description> (for example /bug the diff view hangs on large files) (labels found in the code)
- **Needs:** an account that can reach the AGI server (the report is posted to the server)
- **Steps:**
  1. Start the CLI with agi and wait for the chat prompt.
  2. Type /bug alone and press Enter; read the usage text that appears.
  3. Type /bug the diff view hangs on large files and press Enter.
  4. Look for the line Bug report sent to the AGI Workforce team. Thank you. Compare with Expected: the usage text says the report carries the CLI version and platform.

## S88.05 Product feedback.

- **Expected:** Users can send general product feedback from inside the product and it is stored for the team.
- **Code:** done. Evidence present: apps/cli/src/cloud/feedback.rs:65; apps/cli/src/claude_parity.rs:202; apps/cli/src/tui/tui_app.rs:7800
- **Where to find it:** In the chat, type /feedback <message> and press Enter (labels found in the code)
- **Needs:** an account that can reach the AGI server
- **Steps:**
  1. Start agi and wait for the chat prompt.
  2. Type /feedback and press Enter; read the usage text.
  3. Type /feedback I would like a dark theme and press Enter.
  4. Look for the line Feedback sent to the AGI Workforce team. Thank you. Compare with Expected.

## S88.06 Feature request.

- **Expected:** Users can submit a feature request from inside the product and it is stored for the team.
- **Code:** done. Evidence present: apps/cli/src/cloud/feedback.rs:65; apps/cli/src/claude_parity.rs:202; apps/cli/src/tui/tui_app.rs:7800
- **Where to find it:** In the chat, type /feedback feature <request> and press Enter (labels found in the code)
- **Needs:** an account that can reach the AGI server
- **Steps:**
  1. Start agi and wait for the chat prompt.
  2. Type /feedback feature add a dark theme and press Enter.
  3. Look for the line Feature request sent to the AGI Workforce team. Thank you. Compare with Expected.

## S88.07 User-reviewable diagnostic bundle.

- **Expected:** A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.
- **Code:** done. Evidence moved: apps/cli/src/diagnostics_bundle.rs:58 (quoted code not found in the file now); apps/cli/src/lib.rs:7475
- **Where to find it:** In a terminal, run agi doctor --export (labels found in the code)
- **Needs:** a signed-in account (the export is posted to the AGI server)
- **Steps:**
  1. Run agi doctor --export in the folder where you want the file.
  2. Read the printed summary above the Wrote line.
  3. Find the Wrote <file>.json line; open that JSON file and check it holds only what the printed report lists.
  4. Compare with Expected: the file is written, but the CLI has no prompt to share it; the user attaches it to support by hand.

## S88.08 Request/error identifier.

- **Expected:** When a request fails, the user sees a reference id they can quote to support.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:1057; apps/cli/src/errors.rs:989
- **Where to find it:** In the chat, send a message whose request fails; the error text shows a line that starts with Reference: (labels found in the code)
- **Needs:** a way to make a request fail, such as an expired sign-in or a model that rejects the request
- **Steps:**
  1. Start agi and send a message that makes the provider return an error (the code does not name a fixed trigger).
  2. Read the error text under the failed turn.
  3. Look for a line Reference: <id>. Compare with Expected: the id is shown only when the failure carries one.

## S88.13 Release-update education.

- **Expected:** After an update, users learn what changed (what's new, release notes) from inside the product.
- **Code:** done. Evidence moved: apps/cli/src/update_check.rs:90; apps/cli/src/tui/tui_app.rs:4935 (quoted code not found in the file now)
- **Where to find it:** Start agi after an update and read the start screen for What's new; or in the chat type /changelog (labels found in the code)
- **Needs:** an older CLI build than the latest release, so a newer release is available
- **Steps:**
  1. Run an older build of agi, then update to a newer release (or use a build older than the latest release).
  2. Start agi and read the start screen for the What's new line and the Release notes: link.
  3. In the chat, type /changelog and press Enter.
  4. Compare with Expected: the release notes are shown from inside the product.

## S88.14 Model-retirement notice.

- **Expected:** Users are warned before a model they use is retired and told what replaces it when it is.
- **Code:** done. Evidence present: apps/cli/src/provider.rs:224; apps/cli/src/tui/widgets/model_picker.rs:438
- **Where to find it:** In a terminal, type agi models list; in the chat, type /model and move to a model (labels found in the code)
- **Needs:** none; a deprecated model appears only when the catalog has one, which a tester cannot choose
- **Steps:**
  1. Type agi models list and press Enter.
  2. Find any model marked with ! and read its line deprecated, leaves the catalog <date> if one shows.
  3. In the chat, type /model and press Enter; move to a model and read the detail line under the list (deprecated, leaves <date>).
  4. Compare with Expected: a warning before retirement is shown, but no replacement model name is shown in these places.

## S88.15 Feature-migration assistant.

- **Expected:** An assistant helps users move their data and settings from another product or a replaced feature, with a preview before changes.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:959; apps/cli/src/lib.rs:7170; apps/cli/src/ecosystem.rs:561
- **Where to find it:** In a terminal, run agi migrate --dry-run, then agi migrate (labels found in the code)
- **Needs:** a Claude Code setup in ~/.claude (for example an mcp.json file) to import from
- **Steps:**
  1. Run agi migrate --dry-run and read the output that starts with Claude Code migration dry run.
  2. Check the MCP line (added, already present) and the Source line in the preview.
  3. Run agi migrate (without --dry-run) and read Claude Code migration complete.
  4. Compare with Expected: the preview comes before any change is written.
