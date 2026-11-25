---
id: "PLAN-cli-007"
type: "test-plan"
title: "CLI · 7. Layout systems"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "7"
---
# CLI · 7. Layout systems

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S7.01 Centered new-chat layout.

- **Expected:** An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3038
- **Where to find it:** Type agi in a terminal and press Enter (the app opens its chat when run with no arguments) (labels found in the code)
- **Steps:**
  1. Open Terminal and type agi, then press Enter.
  2. Wait for the start view: the line Welcome to AGI with the version and the model line.
  3. Check that the start view sits in the middle of the chat area, not at the top, with empty space above and below it.
  4. Check that the composer at the bottom shows Message AGI...  / for commands, and that no earlier messages are shown above.

## S7.07 Conversation plus code workspace.

- **Expected:** A coding session shows the conversation alongside the code workspace (changes, diffs, terminal or editor) in one view.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:348; apps/cli/src/tui/tui_app.rs:5820; apps/cli/src/tui/tui_app.rs:8577
- **Where to find it:** Type agi in a terminal in a git folder with uncommitted changes, then type /diff panel and press Enter (labels found in the code)
- **Needs:** a git project with uncommitted changes, phone width does not apply; window at least 90 columns wide
- **Steps:**
  1. Open Terminal in a git project that has uncommitted file changes, type agi and press Enter.
  2. Make the window at least 90 columns wide.
  3. Type /diff panel in the composer and press Enter.
  4. Check that a second pane opens to the right of the chat and lists the changes since the last commit, with added lines in green and removed lines in red.
  5. Type /diff panel again and press Enter to close the pane.

## S7.15 Full-screen editor.

- **Expected:** An editor (prompt, document or source) can take over the whole screen for focused editing and return to the chat.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7193; apps/cli/src/tui/composer_edits.rs:140
- **Where to find it:** Type agi in a terminal, type text in the composer, then press Ctrl+E (Ctrl+G also works) (labels found in the code)
- **Needs:** none; a terminal editor such as vi is used if VISUAL or EDITOR is not set
- **Steps:**
  1. Type agi and press Enter, then type a few lines of text in the composer (Ctrl+J adds a new line).
  2. Press Ctrl+E.
  3. Check that the terminal hands over to an external editor (the one in VISUAL or EDITOR, otherwise vi) with your draft in it.
  4. Edit the text, save and quit the editor.
  5. Check that the chat comes back with the edited text in the composer.

## S7.20 Persistent bottom composer.

- **Expected:** The composer stays anchored at the bottom of the chat while the transcript scrolls above it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2008; apps/cli/src/tui/tui_app.rs:2016
- **Where to find it:** Type agi in a terminal, send several messages, then press PageUp in the chat (labels found in the code)
- **Steps:**
  1. Type agi and press Enter.
  2. Send a few messages (type text and press Enter) until the chat is longer than the screen.
  3. Press PageUp.
  4. Check that the messages above scroll into view while the bordered input box at the bottom stays where it is.
  5. Press PageDown until the newest message is back in view.

## S7.21 Composer expansion for long prompts.

- **Expected:** The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:1994; apps/cli/src/tui/tui_app.rs:2008
- **Where to find it:** Type agi in a terminal, then type a long prompt in the composer (labels found in the code)
- **Steps:**
  1. Type agi and press Enter.
  2. Type a long sentence until it passes the width of the box, or press Ctrl+J between lines.
  3. Check that the input box above the status bar grows taller as the text wraps onto more rows.
  4. Keep typing and check that the box stops growing at 8 text rows.

## S7.22 Scrollable transcript independent from side panels.

- **Expected:** The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1621 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:2007
- **Where to find it:** Type agi in a terminal, send several messages, then press PageUp (Up arrow also scrolls when the composer is empty) (labels found in the code)
- **Needs:** a git project with uncommitted changes and a window at least 90 columns wide for the side-pane check; otherwise none
- **Steps:**
  1. Type agi and press Enter, then send messages until the chat is longer than the screen.
  2. Optionally open the side pane: in a wide window (at least 90 columns) in a git project with changes, type /diff panel and press Enter.
  3. Press PageUp and check that only the chat text moves.
  4. Check that the side pane, the header and the composer stay in place while the chat scrolls.
  5. Press PageDown to return to the newest messages.
