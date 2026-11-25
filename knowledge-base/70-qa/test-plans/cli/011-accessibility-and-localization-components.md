---
id: "PLAN-cli-011"
type: "test-plan"
title: "CLI · 11. Accessibility and localization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "11"
---
# CLI · 11. Accessibility and localization components

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S11.03 Keyboard navigation.

- **Expected:** Everything can be reached and operated from the keyboard, including menus with arrow keys and Escape.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4036; apps/cli/src/keybindings.rs:42; apps/cli/src/tui/tui_app.rs:4038
- **Where to find it:** agi (full-screen screen), then type / with the input box empty (labels found in the code)
- **Steps:**
  1. Run agi in Terminal and wait for the input box.
  2. With the input box empty, type / . The command list opens.
  3. Press the Down arrow key a few times, then the Up arrow key. The highlighted row should move.
  4. Type a few letters to filter the list, then press Esc. The list should close and the input should be ready again.
  5. Compare with Expected: every step should work with the keyboard only.

## S11.04 Visible focus indicators.

- **Expected:** The focused control always shows a clearly visible focus indicator when navigating by keyboard.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/command_popup.rs:157; apps/cli/src/tui/widgets/command_popup.rs:201
- **Where to find it:** agi (full-screen screen), then type / with the input box empty (labels found in the code)
- **Steps:**
  1. Run agi and type / with the input box empty to open the command list.
  2. Press the Down arrow key once.
  3. Look for the marker ❯ at the start of the highlighted row. It should move to the new row.
  4. Compare with Expected: the focused row should be clearly visible, not just a faint change.

## S11.14 Reduced motion.

- **Expected:** With the OS or app reduced-motion preference on, looping and travelling animation stops or is replaced.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:6225
- **Where to find it:** agi (full-screen screen), then type /config set reduced-motion true, then /config to check (labels found in the code)
- **Steps:**
  1. Run agi and type /config set reduced-motion true, then press Enter.
  2. Type /config and press Enter. The output should show the line Reduced motion: true.
  3. Quit agi with Ctrl+D and start agi again, because the setting is read only at start.
  4. Send a message and watch the waiting spinner and the moving shine on text. With the setting on, the spinner should stay as one still dot and the shine should not sweep.
  5. Compare with Expected: looping and moving animation should stop or be replaced.

## S11.15 Captions.

- **Expected:** Spoken audio (voice conversations) can be shown as live captions.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. No live captions found. The closest feature is /voice, which shows the text only after each recording as You said:. Searched apps/cli/src for caption and transcript; the Code line's release-cli.yml reference no longer contains the quoted code.
- **Needs:** a microphone

## S11.16 Transcripts.

- **Expected:** A voice conversation leaves a readable text transcript kept with the chat.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi (full-screen screen), then type /voice and press Enter (labels found in the code)
- **Needs:** a microphone, and agreement to voice mode
- **Steps:**
  1. Run agi and type /voice, then press Enter.
  2. Read the agreement prompt and press Enter to agree.
  3. Press SPACE, speak a sentence, and follow the on-screen prompt to stop recording.
  4. Read the line You said: and press Enter to send it.
  5. Compare with Expected: the sent words should appear as a message in the chat, and can be read back later in that chat.

## S11.23 Currency formatting.

- **Expected:** Prices and money amounts show the right currency symbol and the user's number format.
- **Code:** done. Evidence present: apps/cli/src/output.rs:773
- **Where to find it:** Terminal: agi --cost (prints the pricing report); then inside agi: /cost (labels found in the code)
- **Needs:** a Free or paid account for the /cost step
- **Steps:**
  1. In Terminal, run agi --cost.
  2. Read the Input: and Output: lines. Each should show a dollar sign and /1M tokens.
  3. Start agi, send one short message, then type /cost and press Enter.
  4. Compare with Expected: session totals show Tokens: ... with the word credits, not a currency symbol, and large numbers should have comma grouping.

## S11.27 Long-label and translated-copy layouts.

- **Expected:** Long labels and longer translated strings wrap or truncate cleanly without overlapping or clipping controls.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3541; apps/cli/src/tui/tui_app.rs:3522
- **Where to find it:** no screen of its own. No translation files were found in apps/cli/src (a search for i18n, locales and translations matched only routing/classify.rs), so translated copy cannot be tested from the code.
- **Steps:**
  1. Run agi in a wide Terminal window and note the bottom status line.
  2. Slowly make the window narrower.
  3. Watch the keyboard hints drop out and the context meter change to catalog est. with a short bar, then to a bare percentage.
  4. Compare with Expected: no text should overlap or be cut through a control; the meter should keep its percentage.

## S11.28 Accessible terminal output mode.

- **Expected:** The CLI offers a plain output mode for screen readers (no colour, spinners or redraws) and honours NO_COLOR everywhere.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:6225; apps/cli/src/output.rs:44
- **Where to find it:** Terminal: agi --plain (or agi --screen-reader); NO_COLOR=1 agi --cost (some labels not found in the code; trust the screen)
- **Steps:**
  1. In Terminal, run agi --plain. The app should use the line-based screen, not the full-screen layout.
  2. Type a short message and check that there are no coloured words, no animated spinner frames and no redrawn screen.
  3. Quit, then run NO_COLOR=1 agi --cost and check that the pricing report has no colour.
  4. Compare with Expected: plain output has no colour, spinners or redraws, and NO_COLOR removes colour.
