---
id: "PLAN-cli-105"
type: "test-plan"
title: "CLI · 105. Developer platform and console"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "105"
---
# CLI · 105. Developer platform and console

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S105.04 Model catalog.

- **Expected:** Developers can browse the models their key can call, with capabilities and context size.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1862; apps/cli/src/lib.rs:4751
- **Where to find it:** Terminal > agi models list (add --json for the JSON form) (labels found in the code)
- **Needs:** an account or API key that can call models
- **Steps:**
  1. Open a terminal and sign in to the CLI with an account or key that can call models (agi login).
  2. Type agi models list and press Return.
  3. Read each model line: it shows the context window and the max output size.
  4. Type agi models list --json and look for supports_tools, supports_vision and supports_reasoning on each model.
  5. Compare with Expected: the models your key can call, with capabilities and context size.

## S105.12 Prompt templates.

- **Expected:** Developers can save reusable prompt templates (with arguments) and invoke them.
- **Code:** done. Evidence moved: apps/cli/src/command_registry.rs:27; apps/cli/src/tui/tui_app.rs:4082 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No in-app command to save a prompt template was found; saved prompts are markdown files under ~/.agiworkforce/prompts/claude (apps/cli/src/custom_commands.rs:6) offered as /prompts:<name> (apps/cli/src/command_registry.rs:33), and the loader that feeds them to the registry and any argument substitution for them were not found, so searched apps/cli for save, prompt template, and prompts.

## S105.18 Usage and cost dashboards.

- **Expected:** Developers can see usage and cost over time, broken down by model.
- **Code:** done. Evidence present: apps/cli/src/usage_summary.rs:776; apps/cli/src/usage_summary.rs:785
- **Where to find it:** Terminal > agi usage (in the chat, /cost shows session credit usage by model) (labels found in the code)
- **Needs:** a managed account, signed in
- **Steps:**
  1. Sign in with a managed account (not a local-only or BYOK setup).
  2. Type agi usage and press Return.
  3. Read the line that starts Usage history, and the By model: list under it.
  4. Look at the Week of or month lines under the history to see usage over time.
  5. Compare with Expected: usage and cost over time, broken down by model.

## S105.20 Budget controls.

- **Expected:** An owner can set a spend cap that the API enforces.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:491; apps/cli/src/lib.rs:9283
- **Where to find it:** Chat > type /budget <credits> (for example /budget 500), or agi --max-budget-usd <USD> on the top-level command (labels found in the code)
- **Steps:**
  1. Start the CLI with agi and open a chat.
  2. Type /budget 500 and press Return, then read the reply about stopping each turn after 500 credits.
  3. Type /budget alone and check that it shows the cap.
  4. Type /budget off and check that the reply says the spend cap was removed.
  5. Compare with Expected: an owner sets a spend cap that the API enforces. The /budget cap is set by the user per turn in the CLI.

## S105.28 Developer support.

- **Expected:** Developers have a support channel (tickets or contact) reachable from the product.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** not found in the code. No support ticket or contact channel found; searched apps/cli for support, contact, help and feedback. The closest is agi doctor --export, whose help text says 'Write a redacted diagnostics file to review and attach to a support request.' (apps/cli/src/lib.rs:1044), which is a file, not a channel.

## S105.29 Custom app/Plugin testing.

- **Expected:** A developer can load an unpublished custom plugin into their own account to try it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2020; apps/cli/src/lib.rs:6766
- **Where to find it:** Terminal > agi plugin install <folder> --integrity sha256:<hex> (get the hash from agi plugin digest <folder>) (labels found in the code)
- **Needs:** a plugin folder on disk
- **Steps:**
  1. Pick an unpublished plugin folder on disk.
  2. Type agi plugin digest <folder> and copy the sha256:<hex> value it prints.
  3. Type agi plugin install <folder> --integrity sha256:<hex> and press Return.
  4. Type agi plugin list and look for the plugin name in the installed list.
  5. Compare with Expected: the unpublished plugin loads into your own account so you can try it.
