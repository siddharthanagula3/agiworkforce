---
id: "PLAN-cli-006"
type: "test-plan"
title: "CLI · 6. Visual foundations and spacing conventions"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "6"
---
# CLI · 6. Visual foundations and spacing conventions

23 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S6.01 Semantic background colors.

- **Expected:** The surface paints page and panel backgrounds from named semantic background tokens, per theme, not per-component literals.
- **Code:** done. Evidence present: apps/cli/src/tui/terminal_palette.rs:52; apps/cli/src/tui/terminal_palette.rs:244
- **Where to find it:** Type /theme in the TUI, then pick Light and press Enter (labels found in the code)
- **Steps:**
  1. Start agi and type /theme, then press Enter.
  2. Press the down arrow until Light is highlighted; the screen previews it live.
  3. Press Enter to confirm Light.
  4. Compare the page background and panel backgrounds with the previous theme. Expected: the whole screen repaints from the named theme colours, not per component.

## S6.02 Surface and elevated-surface colors.

- **Expected:** Raised surfaces (cards, menus, popovers, dialogs) use a named elevated-surface token distinct from the page ground in each theme.
- **Code:** done. Evidence present: apps/cli/src/tui/terminal_palette.rs:210; apps/cli/src/tui/widgets/model_picker.rs:384; apps/cli/src/tui/widgets/approval_overlay.rs:572
- **Where to find it:** Type /theme; the popup titled Theme is the raised surface (labels found in the code)
- **Steps:**
  1. Start agi and type /theme, then press Enter.
  2. Look at the popup box titled Theme over the chat.
  3. Compare its background with the chat area behind it.
  4. Expected: the popup uses a raised surface colour that differs from the page ground.

## S6.03 Text and muted-text colors.

- **Expected:** Primary and muted text use named text tokens that meet 4.5:1 on every surface they land on, without opacity dilution.
- **Code:** done. Evidence present: apps/cli/src/tui/terminal_palette.rs:165; apps/cli/src/tui/markdown_renderer.rs:192
- **Where to find it:** no screen of its own. Text colours are named tokens in apps/cli/src/tui/terminal_palette.rs; contrast is not measured in the cited code paths.
- **Needs:** a model account that can answer, so a reply appears
- **Steps:**
  1. Type /theme, pick a theme with the arrow keys, and press Enter.
  2. Read a chat reply in that theme.
  3. Repeat for Dark, Light and High Contrast Light.
  4. Expected: primary and muted text stay readable on every background. A 4.5:1 ratio cannot be read by eye.

## S6.04 Border and divider colors.

- **Expected:** Borders and dividers use named border/rule tokens (subtle and strong) per theme.
- **Code:** done. Evidence present: apps/cli/src/tui/terminal_palette.rs:164; apps/cli/src/tui/markdown_renderer.rs:466
- **Where to find it:** Type /theme; the popup border and the table borders in a reply (labels found in the code)
- **Needs:** a model account that can answer (for the table step)
- **Steps:**
  1. Type /theme and press Enter.
  2. Look at the border of the Theme popup.
  3. Ask for a reply that contains a Markdown table and look at its border lines.
  4. Expected: borders use a named border colour per theme.

## S6.05 Accent and selection colors.

- **Expected:** Accent and selection colours have separate fill, text and on-fill roles that each meet contrast on the backgrounds they are drawn on.
- **Code:** done. Evidence present: apps/cli/src/tui/terminal_palette.rs:160; apps/cli/src/tui/markdown_renderer.rs:215
- **Where to find it:** Type /theme, then move the highlight with the arrow keys (labels found in the code)
- **Steps:**
  1. Type /theme and press Enter.
  2. Press the down arrow to move the highlight to another theme.
  3. Look at the highlighted row: it has a coloured fill with dark text.
  4. Look at the row marked as the current theme: its name is bold in the accent colour.
  5. Expected: fill, text and on-fill colours are separate roles and each is readable.

## S6.06 Success, warning, error, and information colors.

- **Expected:** Success, warning, error and info each have text and fill roles, and status text meets 4.5:1 on its background in both themes.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:51; apps/cli/src/tui/markdown_renderer.rs:619
- **Where to find it:** no screen of its own. The colour role used for this message was not checked in code; the success, warning, danger and info tokens are in apps/cli/src/tui/terminal_palette.rs.
- **Steps:**
  1. Type /theme nosuchtheme and press Enter.
  2. Read the message: Unknown theme with the list of available themes.
  3. Switch to Light with /theme light and compare the colour of the message.
  4. Expected: success, warning, error and info text each have their own colour and read clearly in both light and dark themes.

## S6.08 Heading scale.

- **Expected:** Headings use one defined heading scale (named levels pairing size, weight and line-height) applied across the surface.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:214; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own. A terminal has no font size or line-height, so the scale is colour, weight and underline only.
- **Needs:** a model account that can answer
- **Steps:**
  1. Ask agi for a reply that contains a level 1 and a level 2 heading (for example, a short Markdown outline).
  2. Compare level 1 (accent colour, bold, underlined) with level 2 (accent colour, bold).
  3. Expected: each heading level has a fixed style that repeats across replies.

## S6.10 Caption and metadata scale.

- **Expected:** Captions and metadata use a named small-text role no smaller than 12px that keeps AA contrast.
- **Code:** done. Evidence present: apps/cli/src/tui/terminal_palette.rs:165; apps/cli/src/tui/tui_app.rs:369
- **Where to find it:** no screen of its own. A terminal does not set a font size, so the 12px rule cannot be checked from the code; only the muted colour role was found.
- **Needs:** a model account that can answer and a tool action
- **Steps:**
  1. Ask agi to run a simple tool action so a tool row appears.
  2. Look at the summary text under the tool row.
  3. Expected: metadata uses the muted text colour, at a size no smaller than 12px.

## S6.11 Monospace typography.

- **Expected:** Code and technical text use a declared monospace family and size distinct from body text.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:197; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own. The CLI does not declare a monospace font family; the terminal's own font applies to all text. Not verified beyond the cited code.
- **Needs:** a model account that can answer
- **Steps:**
  1. Ask agi for a reply that includes a short code block.
  2. Compare the code lines with the normal paragraph text.
  3. Expected: code is set apart by its frame and colours, using monospace text from the terminal.

## S6.13 Paragraph spacing.

- **Expected:** Rendered paragraphs in responses are separated by a defined vertical gap set in one rule.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:584
- **Where to find it:** no screen of its own.
- **Needs:** a model account that can answer
- **Steps:**
  1. Ask agi for a reply with two or three separate paragraphs.
  2. Look at the blank line between paragraphs.
  3. Expected: the gap between paragraphs is the same everywhere.

## S6.14 List indentation.

- **Expected:** Lists in rendered content use a defined indentation (and nesting step).
- **Code:** done. Evidence moved: apps/cli/src/tui/markdown_renderer.rs:157 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own. The indent rule is in apps/cli/src/tui/markdown_renderer.rs near line 306, not at the cited line 157, which has moved.
- **Needs:** a model account that can answer
- **Steps:**
  1. Ask agi for a reply with a bulleted list that has a nested sub-list.
  2. Look at the bullet indent for the first level and the nested level.
  3. Expected: each nesting level indents by the same step.

## S6.15 Code-block padding.

- **Expected:** Code blocks have defined internal padding set in one shared rule.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:612; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own.
- **Needs:** a model account that can answer
- **Steps:**
  1. Ask agi for a reply with a short code block.
  2. Look at the frame above the code and the left bar beside each code line.
  3. Expected: the code block has the same internal padding every time.

## S6.16 Table-cell padding.

- **Expected:** Table cells (in rendered content and data tables) have defined, consistent padding.
- **Code:** done. Evidence moved: apps/cli/src/tui/markdown_renderer.rs:300 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own. The cited line 300 no longer holds table code; table layout is near apps/cli/src/tui/markdown_renderer.rs lines 462 to 470.
- **Needs:** a model account that can answer
- **Steps:**
  1. Ask agi for a reply that contains a table with several columns.
  2. Look at the spacing inside each cell.
  3. Expected: cells have the same padding in every column.

## S6.17 Conversation-turn spacing.

- **Expected:** Consecutive conversation turns are separated by one defined vertical spacing value.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:463; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own. The cited code (tui_app.rs around line 463) adds a blank line before a tool row unless it follows another tool row; it does not set a separate turn gap.
- **Needs:** a model account that can answer and a tool action
- **Steps:**
  1. Send two or three messages that each run a tool action.
  2. Look at the blank line before each tool row.
  3. Expected: the gap between turns uses one spacing value.

## S6.19 Composer internal padding.

- **Expected:** The composer has defined internal padding around the input and its controls.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3107; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own. The continuation indent is set by the prompt width in apps/cli/src/tui/tui_app.rs (render_input).
- **Steps:**
  1. Start agi and type a long line that wraps to a second row.
  2. Look at the wrapped row: it should line up after the prompt character.
  3. Expected: the input and its prompt have a defined inner padding.

## S6.20 Page-edge gutters.

- **Expected:** Pages use defined page-edge gutters that step with viewport width.
- **Code:** done. Evidence present: apps/cli/src/tui/markdown_renderer.rs:191; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** no screen of its own. A test in apps/cli/src/tui/tui_app.rs checks the left gutter; no rule that steps the gutter with width was found.
- **Needs:** a model account that can answer
- **Steps:**
  1. Make the terminal window narrow.
  2. Ask for a reply with a long line of text, or send a long message.
  3. Look at the left edge of the wrapped rows.
  4. Expected: the text keeps a left margin and does not touch the terminal edge.

## S6.23 Dialog padding.

- **Expected:** Dialogs and sheets share one defined inner padding.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/theme_picker.rs:292; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** Type /theme; the popup has one inner padding (labels found in the code)
- **Steps:**
  1. Type /theme and press Enter.
  2. Look at the gap between the popup border and its first row, and between the border and the preview text.
  3. Compare the padding on the left and right sides.

## S6.30 Motion durations and easing.

- **Expected:** Animations and transitions use named durations and easing curves.
- **Code:** done. Evidence present: apps/cli/src/tui/motion.rs:4; apps/cli/src/tui/shimmer.rs:32
- **Where to find it:** no screen of its own. No easing curves were found; the sweep is linear and time-based.
- **Needs:** a model account that can answer
- **Steps:**
  1. Send a message that makes agi work for a few seconds.
  2. Watch the spinner beside the status text, which turns through frames.
  3. Watch the highlight that moves across the status text.
  4. Expected: the motion uses fixed durations (a frame every 50 ms, a sweep every 2 seconds).

## S6.31 Reduced-motion alternatives.

- **Expected:** When the user asks for reduced motion (OS setting or in-app), looping and travelling animation stops or is replaced with a gentle equivalent.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:6225
- **Where to find it:** Type /config set reduced-motion true in the TUI, then /config show (labels found in the code)
- **Needs:** a model account that can answer, so the spinner shows
- **Steps:**
  1. Type /config set reduced-motion true and press Enter.
  2. Send a message that makes agi work, and watch the spinner: it shows a still dot instead of turning frames.
  3. Watch the status text: the moving highlight should stop.
  4. Type /config show and check the line Reduced motion: true.

## S6.32 Light, dark, and system themes.

- **Expected:** The user can use light, dark, or follow-the-system appearance, and the whole surface (including code) follows it.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/theme_picker.rs:125; apps/cli/src/tui/terminal_palette.rs:481; apps/cli/src/config.rs:953; apps/cli/src/tui/markdown_renderer.rs:36
- **Where to find it:** Type /theme and pick Auto, Dark or Light (labels found in the code)
- **Needs:** none (a model account for the code block step)
- **Steps:**
  1. Type /theme and press Enter.
  2. Move to Auto (described as Match the terminal background) and press Enter.
  3. Move to Light and press Enter.
  4. Look at the whole screen, including a code block in a reply: all of it should follow the chosen theme.

## S6.33 High-contrast treatment.

- **Expected:** A high-contrast treatment exists (OS setting and/or in-app) that strengthens text, borders and focus.
- **Code:** done. Evidence present: apps/cli/src/tui/terminal_palette.rs:88; apps/cli/src/tui/terminal_palette.rs:102; apps/cli/src/tui/widgets/theme_picker.rs:67
- **Where to find it:** Type /theme and pick High Contrast Dark or High Contrast Light (labels found in the code)
- **Steps:**
  1. Type /theme and press Enter.
  2. Move to High Contrast Dark and press Enter.
  3. Compare the text, the popup border and the highlighted row with the Dark theme.
  4. Expected: text, borders and focus look stronger than in Dark.

## S6.34 Selected, focused, hovered, pressed, and disabled states.

- **Expected:** Interactive controls show distinct selected, focused, hovered, pressed and disabled states.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/theme_picker.rs:332; apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** Type /theme, then move with the arrow keys (labels found in the code)
- **Steps:**
  1. Type /theme and press Enter.
  2. Press the down arrow: the row under the cursor gets an accent fill with dark bold text.
  3. Look at the current theme: its name is bold in the accent colour, while the other rows are plain.
  4. Expected: selected, focused and active rows look different; hovered, pressed and disabled states are not present in a terminal.

## S6.35 Brand assets and application icons.

- **Expected:** The surface ships its brand mark and application icons at the sizes the platform needs.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1378 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1662
- **Where to find it:** not found in the code. Searched apps/cli for icon, logo, banner and brand files; only assets/THIRD_PARTY_NOTICES.txt exists. Cited tui_app.rs line 1378 no longer holds the quoted code. App icons exist only under apps/desktop/src-tauri/icons, which belongs to the desktop app, not the CLI.
