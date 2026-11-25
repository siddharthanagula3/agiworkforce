---
id: "F072-09"
type: "feature"
title: "Plain and screen-reader output, no colour"
aliases: ["--plain", "AGI_PLAIN", "--screen-reader", "AGI_SCREEN_READER", "ui.screen_reader", "linear accessible output", "NO_COLOR", "no-color mode", "S72.02", "S72.28"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.02", "S72.28"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/output.rs", "file:apps/cli/src/lib.rs", "file:apps/cli/src/config.rs", "SYS-shared-ui-and-design", "F072-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-09 Plain and screen-reader output, no colour

The CLI (surface:cli only) has a plain mode and a screen-reader mode. Plain turns off colour, spinners and rules and uses the line-by-line prompt instead of the full-screen screen. Screen-reader mode also labels each line `you:`, `agi:` or `tool:`, uses numbered menus and rings a bell. NO_COLOR alone does not recolour the full-screen screen.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.02](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7202), [S72.28](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7228).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Publishes one global plain flag before anything prints and makes every output function read it (apps/cli/src/output.rs:41-59). Plain forces the line REPL (apps/cli/src/lib.rs:8295). Screen-reader mode adds labels, numbered menus and a bell in that REPL (apps/cli/src/output.rs:61-81, 278-300, 346-410).

**Why it exists.** A screen reader speaks one line at a time, so spinners and box-drawing rules are noise; logs and pipes also want no colour (apps/cli/src/output.rs:23-33 comment; doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.02).

**Who uses it.** Blind and low-vision developers, people who log terminal output, and anyone on a terminal that cannot draw the full-screen screen.

**Problems it solves**

- Animated spinners repainting while a screen reader speaks.
- Not knowing who is speaking in a transcript.
- Arrow-key menus a screen reader cannot use.
- Missing signal when the CLI waits for input.

**Use cases**

- `agi --screen-reader` for a daily session with a screen reader.
- `AGI_PLAIN=1 agi` in a CI log viewer.
- `ui.screen_reader = true` in config.toml so every launch is accessible.
- `NO_COLOR=1 agi "hi"` for colourless one-shot text.

## 2. User experience

**Where to find it**

- surface:cli: flags `--plain` and `--screen-reader` (global, so they work with subcommands; apps/cli/src/lib.rs:436-448); environment AGI_PLAIN, AGI_SCREEN_READER, NO_COLOR; config key `ui.screen_reader` (apps/cli/src/config.rs:163, 1470-1471, 1588-1589). Not on other apps.

**Before you start**

- Installed CLI.
- For labels: an interactive launch (no prompt, no --stdin) because labels are turned on only then (apps/cli/src/lib.rs:5974-5980).

**Screens and controls**

- Line REPL prompt: `you: ` with a bell in screen-reader mode, `> ` otherwise (apps/cli/src/output.rs:341-347).
- Assistant lines start with `agi: `; tool lines start with `tool: ` (apps/cli/src/output.rs:292-300, 399-410).
- Numbered menu and Yes/No menu answered by typing a digit (apps/cli/src/output.rs:304-340, 358-395).
- In plain mode a spinner prints its message once (apps/cli/src/output.rs:245-262).

**Journey**

1. 1. Start `agi --screen-reader` (or set the env var or config key).
2. 2. The CLI publishes plain mode, then labels (apps/cli/src/lib.rs:5943-5980).
3. 3. Plain mode picks the line REPL instead of the full-screen screen (apps/cli/src/lib.rs:8295).
4. 4. Type a message after `you:`; the reply prints with `agi:`; tools print `tool:` lines.
5. 5. When a choice is needed, type its number.

**What the person sees and gets**

- Bell character before the prompt (apps/cli/src/output.rs:56-58 constants).
- Words instead of glyphs where a glyph carried meaning (apps/cli/src/output.rs:23-27 doc).
- Banner shows `[no color]` when colour level is none (apps/cli/src/output.rs:906-912).

**Settings**

- ui.screen_reader (config.toml), AGI_PLAIN, AGI_SCREEN_READER (any non-empty value), NO_COLOR, ui.reduced_motion (apps/cli/src/tui/tui_app.rs:7122-7124); /config shows the env overrides (apps/cli/src/config.rs:1662-1670).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Plain turns on from --plain, AGI_PLAIN, or screen-reader mode (apps/cli/src/lib.rs:5943-5951) and clears colour via the colored crate override (apps/cli/src/output.rs:41-49).
- Plain mode uses the line REPL (apps/cli/src/lib.rs:8295).
- Screen-reader labels, numbered menus, bell and tool lines (apps/cli/src/output.rs:278-410).
- Spinner becomes a one-time message in plain mode (apps/cli/src/output.rs:245-262).
- Motion is reduced in the full-screen screen when plain (apps/cli/src/tui/tui_app.rs:7122-7124).
- detect_color_level returns None for plain or NO_COLOR and is used for the REPL banner label (apps/cli/src/output.rs:95-108, 906-912, called from apps/cli/src/repl/mod.rs:89).

**Incomplete**

- NO_COLOR alone does not change the full-screen screen's colours. In tui/ only icons.rs reads NO_COLOR, and only to choose ASCII glyphs (apps/cli/src/tui/icons.rs:33-36); no colour switch was found. S72.28 says NO_COLOR removes colour including the TUI (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md).
- The colored crate honours NO_COLOR for lines printed through it (the crate source, colored-3.1.1 control.rs:102-110, in the local cargo registry) [inferred as the effect on line output; the CLI does not test it].
- Labels apply only to interactive launches; a screen-reader flag on a one-shot or subcommand run gives plain output without labels (apps/cli/src/lib.rs:5974-5980).

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- No accessibility mode on the other apps from this feature; their own accessibility is outside this page.

## 4. Required behaviour

**Established requirements**

- A linear, screen-reader-friendly mode prints line by line with no colour, spinners, rules or full-screen redraws. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.02)
- Setting NO_COLOR (or --plain) removes colour from all terminal output, including the TUI. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.28)
- Screen-reader mode labels lines you: / agi:, answers numbered menus by typing the number, and rings a bell when input is needed. (source: apps/cli/src/lib.rs:436-448 flag documentation)
- Keyboard, screen reader, focus and reduced motion are verified before release. (source: docs/product/experience-contract.md:750)

**Acceptance criteria**

1. `agi --plain` opens the line prompt, not the full-screen screen.
2. `agi --screen-reader` prints `you:` before the prompt and `agi:` before each reply line.
3. A confirmation under --screen-reader is a numbered Yes/No menu answered with `1` or `2`.
4. `AGI_PLAIN=1` and `AGI_SCREEN_READER=1` each turn the mode on; `ui.screen_reader = true` does too.
5. `NO_COLOR=1 agi` shows no colour in the full-screen screen (currently fails).
6. stdout of `agi --raw` stays free of labels.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The full-screen screen should honour NO_COLOR as the brief says [inferred from S72.28].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the full-screen palette read NO_COLOR and fall back to default foreground.
- [proposed] Offer labels for one-shot runs only when asked, so stdout stays clean.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | set_plain_output / plain_output | `apps/cli/src/output.rs` | Global plain flag and colour override (41-59). |
| service | set_screen_reader / screen_reader | `apps/cli/src/output.rs` | Screen-reader flag, env detection (61-86). |
| service | detect_color_level | `apps/cli/src/output.rs` | Plain and NO_COLOR resolve to ColorLevel::None (95-120). |
| service | create_spinner | `apps/cli/src/output.rs` | Announce-once in plain mode (245-262). |
| service | label_assistant_lines / write_response_text | `apps/cli/src/output.rs` | `agi:` labelling (292-300, 470-490). |
| service | read_numbered_choice / choose_option / confirm | `apps/cli/src/output.rs` | Numbered menus and bell (304-395). |
| service | screen_reader_tool_line | `apps/cli/src/output.rs` | `tool:` lines (399-410). |
| service | print_banner | `apps/cli/src/output.rs` | Banner with [no color] label (906-920). |
| command | --plain / --screen-reader flags | `apps/cli/src/lib.rs` | Global flags (436-448). |
| service | plain and screen-reader setup in run_main | `apps/cli/src/lib.rs` | Resolves flag, env and config (5943-5981). |
| service | REPL selection | `apps/cli/src/lib.rs` | `cli.no_tui // plain_output()` picks the line REPL (8295). |
| config | ui.screen_reader | `apps/cli/src/config.rs` | Config key, merge, get and set (163, 965-967, 1358-1359, 1470-1471, 1588-1589). |
| config | env override recording | `apps/cli/src/config.rs` | AGI_PLAIN, AGI_SCREEN_READER shown by /config (1662-1670). |
| component | TUI icon fallback | `apps/cli/src/tui/icons.rs` | ASCII glyphs when NO_COLOR or TERM=dumb (33-36). |
| component | TUI reduced motion | `apps/cli/src/tui/tui_app.rs` | Reduced motion when plain or configured (7122-7124). |
| test | output.rs tests | `apps/cli/src/output.rs` | Plain, labels, numbered menus, env tests (1474-1680). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Read --screen-reader, AGI_SCREEN_READER and config ui.screen_reader; derive plain. | device | apps/cli/src/lib.rs:5943-5951 |
| Publish the flags before any output; clear or restore the colour override. | device | apps/cli/src/output.rs:41-49; apps/cli/src/lib.rs:5980 |
| Choose the line REPL over the full-screen screen. | device | apps/cli/src/lib.rs:8295 |
| Each print function checks the flags and adds labels, bell or announces once. | device | apps/cli/src/output.rs:245-410 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| ui.screen_reader setting | config.toml in the config folder | Not synced by this feature (sync of settings is a separate command) | Kept until edited |

**Models and providers.** No model or provider takes part; the mode only changes how text is printed.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code; the mode is free of plan checks. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code besides the user flags above. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully offline and with a Local model; nothing leaves the device because of this feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Non-interactive run with --screen-reader | Plain output, no labels (stdout kept clean). | apps/cli/src/lib.rs:5974-5980; apps/cli/src/output.rs:61-67 doc |
| Menu input is not a number | The menu asks again; Enter picks the default; no input left cancels. | test names apps/cli/src/output.rs:1570, 1672 |
| Yes/No with no terminal | Answers no. | apps/cli/src/output.rs:366-370 |
| NO_COLOR with the full-screen screen | Colour unchanged; icons become ASCII. | apps/cli/src/tui/icons.rs:33-36 |
| TERM=dumb | ASCII glyph fallback in the full-screen screen. | apps/cli/src/tui/icons.rs:33-36 |
| Terminal resize / redraw | Not applicable in the line REPL; full-screen screen handles resize elsewhere (F072 other features). | unknown here |
| Loading / offline / retry | not handled in the code for this feature specifically. | n/a |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/output.rs`: Plain suppresses colour, animation and rules; assistant labels skip blank lines; prompt is `you:` with bell only in screen-reader mode; env can request each mode; numbered menus, tool label, yes/no menu (tests at 1474-1680).
- `apps/cli/src/config.rs`: screen_reader is a ui key that reads, writes and merges (test at 1985).

**Test scenarios**

- **Plain launch**
  1. Run `agi --plain`.
  - Expected: Line prompt, no spinner frames, no ANSI colour codes in the output.
- **Screen-reader labels**
  1. Run `agi --screen-reader`, type `hello`.
  - Expected: Prompt `you: `, reply lines begin `agi: `.
- **Numbered approval**
  1. Under --screen-reader trigger a tool that needs approval, type `1`.
  - Expected: The menu lists numbered options; the bell sounds; the choice applies.
- **NO_COLOR in one-shot**
  1. Run `NO_COLOR=1 agi "hi" | cat -v`.
  - Expected: No escape codes in lines printed through the CLI's colour layer.
- **NO_COLOR in the full-screen screen**
  1. Run `NO_COLOR=1 agi` in a terminal.
  - Expected: Expected no colour; the code suggests colour remains (a gap). Record what you see.
- **Config key**
  1. Set `ui.screen_reader = true` in config.toml; run `agi`.
  - Expected: Screen-reader mode starts; `/config` lists it.

**Where to look when it fails**

- `/config` or `agi --config` shows env overrides (apps/cli/src/config.rs:1662-1670).
- Banner `[no color]` label (apps/cli/src/output.rs:906-912).

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **NO_COLOR alone does not remove colour in the full-screen screen.** Affects: surface:cli users who set NO_COLOR. Evidence: apps/cli/src/tui/icons.rs:33-36 is the only tui read; no other NO_COLOR use under apps/cli/src/tui. Work needed: Read NO_COLOR in the palette code.
- **Screen-reader labels do not apply to one-shot or subcommand runs.** Affects: surface:cli screen-reader users running subcommands. Evidence: apps/cli/src/lib.rs:5974-5980. Work needed: Decide whether subcommand output needs labels; document the rule.
- **No end-to-end test that plain mode starts the line REPL.** Affects: surface:cli. Evidence: no test found for apps/cli/src/lib.rs:8295. Work needed: Add a binary test.
- **No evidence a real screen reader was used to verify the mode.** Affects: surface:cli. Evidence: no test or doc records it. Work needed: Run a manual pass with a screen reader and record it.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/output.rs
- file:apps/cli/src/lib.rs
- file:apps/cli/src/config.rs
- SYS-shared-ui-and-design
- F072-10

## Unknown

- Whether the full-screen screen is usable with a screen reader (not claimed).
- Whether any other output (for example the ratatui screen) reads TERM or NO_COLOR outside the files searched.
- Behaviour of `colored` with CLICOLOR variables on this CLI's output: the crate was read, the CLI behaviour was not run.
