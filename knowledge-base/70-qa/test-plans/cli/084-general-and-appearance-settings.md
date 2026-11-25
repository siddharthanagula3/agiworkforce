---
id: "PLAN-cli-084"
type: "test-plan"
title: "CLI · 84. General and appearance settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "84"
---
# CLI · 84. General and appearance settings

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S84.03 Theme.

- **Expected:** The user can choose light, dark or system theme and it applies and persists.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5232; apps/cli/src/tui/tui_app.rs:5268; apps/cli/src/tui/tui_app.rs:6386
- **Where to find it:** Type /theme and press Enter in the agi terminal app, then pick Auto, Dark, Light or another row (labels found in the code)
- **Steps:**
  1. Open a terminal in the project folder, run agi and wait for the main screen.
  2. Type /theme and press Enter. A Theme picker opens.
  3. Move to Light with the arrow keys and press Enter.
  4. Check that the screen recolours and a System line reads 'Theme set to Light, saved in ...'.
  5. Quit agi, run agi again in the same folder and check the theme is still Light.

## S84.07 Reduced motion.

- **Expected:** The user can reduce animation (in-app setting or honouring the OS reduce-motion preference).
- **Code:** done. Evidence present: apps/cli/src/output.rs:50; apps/cli/src/output.rs:41
- **Where to find it:** Type /config set reduced-motion true in the agi terminal app (undo with false); check with /config show (labels found in the code)
- **Needs:** a prompt that can be sent, so the busy spinner shows
- **Steps:**
  1. Run agi in the project folder and wait for the main screen.
  2. Type /config set reduced-motion true and press Enter. Read the reply: reduced-motion = true (saved).
  3. Type /config show and press Enter. Look for the line 'Reduced motion: true'.
  4. Send any short prompt so the app is busy. The spinner should stay as a still dot instead of turning.
  5. Type /config set reduced-motion false to turn it back off and check the spinner animates again.

## S84.10 Default model.

- **Expected:** The user can set a default model that new conversations start with.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1881; apps/cli/src/lib.rs:4778
- **Where to find it:** In a terminal outside the app, run agi models set <model-id>; the in-app model picker is /model (labels found in the code)
- **Steps:**
  1. In a terminal, run agi models list to see catalog model IDs.
  2. Run agi models set <one model ID from that list>.
  3. Read the reply: Default model set to <model> (<provider>).
  4. Start a new agi session in the same folder with agi and check the model shown matches the one you set (use /model to view it).
  5. Compare with Expected: new conversations start with the chosen default model.

## S84.11 Default effort.

- **Expected:** The user can set a default reasoning effort used for new turns.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6469; apps/cli/src/config.rs:1144
- **Where to find it:** Type /effort high (or /effort with no argument to open the effort picker) in the agi terminal app (labels found in the code)
- **Steps:**
  1. Run agi in the project folder and wait for the main screen.
  2. Type /effort and press Enter. An effort picker opens; choose a level and press Enter.
  3. Or type /effort high and press Enter.
  4. Read the reply: it says the effort was set and 'and saved as this project's default'.
  5. Quit agi, start agi again in the same folder and check /effort shows the level you chose.

## S84.12 Default mode.

- **Expected:** The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:5553; apps/cli/src/onboarding.rs:673
- **Where to find it:** In a terminal outside the app, run agi approvals mode auto (view with agi approvals mode); in-app view is /permissions (labels found in the code)
- **Steps:**
  1. In a terminal, run agi approvals mode to see the default mode new sessions start in.
  2. Run agi approvals mode auto.
  3. Read the reply: New sessions start in acceptEdits. (the saved name for auto)
  4. Start a new agi session in the same folder and type /permissions to see the current mode.
  5. Compare with Expected: a new conversation starts in the chosen mode.

## S84.15 Keyboard shortcuts.

- **Expected:** Settings let the user view and customise (disable or rebind) keyboard shortcuts.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6704; apps/cli/src/keybindings.rs:122
- **Where to find it:** Type /keybindings (or /keys) in the agi terminal app to view; customise by editing the [ui.keybindings] table in config.toml (labels found in the code)
- **Needs:** access to the config.toml file to edit it
- **Steps:**
  1. Run agi in the project folder and wait for the main screen.
  2. Type /keybindings and press Enter. Read the Keybindings list with each key and its action.
  3. To rebind, add a line under [ui.keybindings] in config.toml, for example open_palette = "ctrl+p", or run /config set ui.keybindings.open_palette ctrl+p.
  4. Quit agi, start it again and type /keybindings.
  5. Compare the shown key for that action with the new value.
