---
id: "F011-12"
type: "feature"
title: "Plain terminal output"
aliases: ["Plain terminal output", "Plain mode", "--plain", "AGI_PLAIN", "Screen reader mode", "--screen-reader", "AGI_SCREEN_READER", "NO_COLOR", "S11.28"]
area: "11 Accessibility and localization components"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S11.28"]
depends_on: ["SYS-shared-ui-and-design", "SYS-observability-and-operations", "surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/output.rs", "file:apps/cli/src/lib.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-12 Plain terminal output

The CLI has a plain mode for screen-reader users: no colour, no spinners, no rules, and the line-based REPL instead of the full-screen interface. It turns on with --plain, any non-empty AGI_PLAIN, or screen reader mode. NO_COLOR alone only removes colour. Screen reader mode adds speaker labels, numbered menus and a bell.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.28](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1128).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Switches the CLI to output that a screen reader can read line by line: no colour, one-time progress text instead of animated spinners, no decorative rules, and the classic REPL. A stronger screen reader mode labels lines you: and agi:.

**Why it exists.** An animated spinner repainting eight times a second is spoken eight times a second by a screen reader (comment in apps/cli/src/output.rs:30-36).

**Who uses it.** Screen-reader users, people who dislike colour, and scripts that want quiet output.

**Problems it solves**

- Spinner noise in screen readers.
- Box-drawing rules read aloud.
- Colour that the user cannot or does not want to see.

**Use cases**

- A blind developer sets AGI_PLAIN=1 in the shell profile.
- A user runs agi --screen-reader for a labelled transcript.
- A user sets NO_COLOR to drop colour but keep the full-screen interface.
- A user sets ui.screen_reader in the config file.

## 2. User experience

**Where to find it**

- CLI flag --plain (global) (apps/cli/src/lib.rs:436-440).
- CLI flag --screen-reader (global) (apps/cli/src/lib.rs:442-448).
- Environment variables AGI_PLAIN, AGI_SCREEN_READER and NO_COLOR (apps/cli/src/output.rs:56-60, :83-85, :99-101).
- Config file key ui.screen_reader (apps/cli/src/lib.rs:5943-5948).

**Before you start**

- The agi CLI installed.

**Screens and controls**

- Line-based prompt 'you: ' with a bell in screen reader mode, '> ' otherwise (apps/cli/src/output.rs:274-280).
- Numbered menus answered by typing a number (output.rs:340-350, :375-390).
- Assistant lines prefixed 'agi: ' and tool lines 'tool: <name> <detail>' (output.rs:398-408, :462-478).

**Journey**

1. Set AGI_PLAIN, pass --plain, or pass --screen-reader.
2. Start agi; the line-based REPL opens instead of the full-screen TUI.
3. Type a prompt at 'you: '.
4. Hear 'agi: ...' lines and 'tool: ...' lines; progress is announced once in text.
5. Answer questions by typing the menu number.

**What the person sees and gets**

- Progress text printed once to stderr, then silence (output.rs:263-270).
- Prompts with labels and a bell in screen reader mode.

**Settings**

- --plain, --screen-reader flags.
- AGI_PLAIN, AGI_SCREEN_READER, NO_COLOR environment variables (names only).
- ui.screen_reader and ui.reduced_motion in config (apps/cli/src/lib.rs:5946; apps/cli/src/tui/tui_app.rs:7123).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Plain output policy is set once at startup before anything prints: flag, AGI_PLAIN non-empty, or screen reader mode turn it on (apps/cli/src/lib.rs:5943-5951).
- In plain mode colour is forced off, the colour level reports None, and spinners become a single announcement line (apps/cli/src/output.rs:38-48, :89-95, :258-264).
- Plain mode selects the classic REPL instead of the TUI (apps/cli/src/lib.rs:8295).
- The TUI also reads plain mode to enable reduced motion (apps/cli/src/tui/tui_app.rs:7122-7124).
- NO_COLOR with any value turns colour off but does not enable plain mode (output.rs:30-34, :99-101); a test sets NO_COLOR and checks the level (output.rs:1700-1716).
- AGI_PLAIN empty means off, any non-empty means on (output.rs:56-60; test output.rs:1676-1695).
- Screen reader mode: labels on every transcript line, numbered menus, bell prompts, tool labels, only for the interactive REPL (output.rs:62-79, :274-280, :340-350, :398-408, :462-478; lib.rs:5980).
- TUI icons fall back to ASCII when NO_COLOR is set or TERM is dumb (apps/cli/src/tui/icons.rs:33-35).

**Incomplete**

- detect_color_level has no caller outside output.rs, so the colour level it computes is not used elsewhere (search in apps/cli/src found none) [inferred: colour is controlled through the colored crate override instead].
- Whether the full-screen TUI colours honour NO_COLOR is not shown in the code; only icons do (apps/cli/src/tui/icons.rs:33-35).
- The doc comment on screen_reader_requested_by_environment says it follows AGI_PLAIN but it reads AGI_SCREEN_READER, which can mislead (output.rs:81-85).

**Present but disconnected or switched off**

- The screen reader label mode is only on for the interactive REPL; scripted modes keep stdout free of labels by design (output.rs:62-66; lib.rs:5974-5980).

**Not available**

- Other apps have no plain-mode equivalent (brief S11.28 lists CLI only).

## 4. Required behaviour

**Established requirements**

- The CLI offers a plain output mode for screen readers (no colour, spinners or redraws) and honours NO_COLOR everywhere. CLI done. (source: brief S11.28)
- Plain mode removes colour, animation and redraws, not just colour; NO_COLOR alone turns off colour but is not plain mode; any non-empty AGI_PLAIN turns plain mode on. (source: apps/cli/src/output.rs:30-36, :56-60 (code comments and tests))
- With reduced motion on, looping and travelling animation stops or is replaced (CLI done). (source: brief S11.14)
- Keyboard, screen reader, focus, reduced motion and contrast are verified for core flows. (source: doc: docs/product/experience-contract.md:750, check W23)

**Acceptance criteria**

1. agi --plain starts the line-based REPL with no ANSI colour in output.
2. AGI_PLAIN=1 does the same; AGI_PLAIN='' does not.
3. With plain mode on, a long operation prints its progress message once and no spinner frames.
4. NO_COLOR=1 alone removes colour but the full-screen interface still opens.
5. agi --screen-reader prefixes the prompt with 'you: ' and assistant lines with 'agi: '.
6. In screen reader mode a yes or no question shows a numbered menu Yes 1, No 2 and accepts the number.
7. A one-shot prompt run (agi -p) keeps stdout free of labels.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Screen reader mode implies plain mode because the plain flag is computed with the OR of the screen reader value (lib.rs:5949-5951) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Confirm that TUI colours honour NO_COLOR when plain is off, with a test.
- [proposed] Fix the doc comment on screen_reader_requested_by_environment.
- [proposed] Document the three switches in the CLI help text.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | set_plain_output / plain_output | `apps/cli/src/output.rs` | Process-wide plain policy and colour override |
| service | plain_output_requested_by_environment | `apps/cli/src/output.rs` | Reads AGI_PLAIN, any non-empty value |
| service | detect_color_level | `apps/cli/src/output.rs` | None when plain or NO_COLOR is set; otherwise depth by environment |
| service | create_spinner / announced_once | `apps/cli/src/output.rs` | Hidden spinner and one-line announcement in plain mode |
| service | screen reader labels and prompts | `apps/cli/src/output.rs` | you:, agi:, tool: labels and bell |
| service | choose_option / confirm | `apps/cli/src/output.rs` | Numbered menus in screen reader mode |
| command | --plain and --screen-reader flags | `apps/cli/src/lib.rs` | Global arguments |
| config | ui.screen_reader config key | `apps/cli/src/lib.rs` | Config-file switch read at startup |
| service | startup policy publication | `apps/cli/src/lib.rs` | Computes plain and screen reader state before output |
| service | REPL versus TUI choice | `apps/cli/src/lib.rs` | Plain mode runs the classic REPL |
| component | TUI motion switch | `apps/cli/src/tui/tui_app.rs` | Plain mode or ui.reduced_motion sets reduced motion |
| service | TUI icons ASCII fallback | `apps/cli/src/tui/icons.rs` | ASCII glyphs when NO_COLOR or dumb terminal |
| service | terminal_style | `apps/cli/src/terminal_style.rs` | Styled text helpers using the colored crate |
| test | output.rs inline tests | `apps/cli/src/output.rs` | Plain suppresses colour, animation and rules; AGI_PLAIN rules; NO_COLOR; screen reader labels and menus |
| test | lib.rs inline test | `apps/cli/src/lib.rs` | --screen-reader flag parses before or after a subcommand |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At startup the CLI reads the flags, the environment and the config file. | device | apps/cli/src/lib.rs:5943-5951 |
| It publishes the plain policy and, for the colored crate, forces colour off. | device | apps/cli/src/output.rs:38-48 |
| Interactive launches choose the REPL when plain is on. | device | apps/cli/src/lib.rs:8295 |
| Every spinner call returns a hidden bar after printing its message once. | device | apps/cli/src/output.rs:244-247, :263-270 |
| Assistant text is labelled line by line in screen reader mode before being written. | device | apps/cli/src/output.rs:462-478 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plain and screen reader state | Process memory (atomic booleans) | no | Lives for the process; config key ui.screen_reader is stored in the user's config file |

**Models and providers.** None. This feature changes presentation only and is the same for every model and provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | Command-line flags --plain and --screen-reader; environment variables AGI_PLAIN, AGI_SCREEN_READER, NO_COLOR; config key ui.screen_reader. |
| Model compatibility | Model independent. |
| Provider restrictions | none found in the code. |
| Local mode | Works the same in Local mode; no network is involved. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| AGI_PLAIN set but empty | Treated as off | output.rs:56-60; test at output.rs:1676-1695 |
| NO_COLOR only | No colour, but spinners and TUI remain | output.rs:30-34, :99-101 |
| Non-interactive run (prompt, stdin, subcommand) | Screen reader labels are off; plain still applies | lib.rs:5974-5980 |
| Question with no terminal | confirm returns false | output.rs:366-371 |
| Menu with no input left | Cancelled | output.rs test a_numbered_menu_with_no_input_left_is_cancelled (~line 1672) |
| Protocol stdout (app-server, MCP server) | Text goes to stderr so stdout stays JSON-RPC | output.rs:452-461, :478-484 |
| Terminal text with escape sequences | Sanitised before print | output.rs:263-270 (sanitize_terminal_text) |
| Offline, timeout, retry | not handled in the code by this feature; it only changes presentation | apps/cli/src/output.rs:30-110 contains no network code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/output.rs`: Inline tests: plain suppresses colour, animation and rules; AGI_PLAIN empty and non-empty; NO_COLOR; screen reader labels, tool line, prompt, numbered menus, confirm
- `apps/cli/src/lib.rs`: Inline test: --screen-reader parses before or after a subcommand (line ~10073)
- `apps/cli/tests/terminal_escape_diagnostics.rs`: Terminal escape handling in diagnostics (header not opened)

**Test scenarios**

- **Plain flag**
  1. Run agi --plain in a terminal
  2. Send a prompt
  - Expected: Line REPL, no colour codes, no spinner frames, a single 'Thinking' style line
- **AGI_PLAIN env**
  1. Export AGI_PLAIN=1, start agi
  2. Unset it, export AGI_PLAIN='' and start again
  - Expected: Plain first time; full-screen TUI second time
- **NO_COLOR only**
  1. Export NO_COLOR=1, start agi
  - Expected: No colour; TUI still opens; icons switch to ASCII
- **Screen reader mode**
  1. Run agi --screen-reader
  2. Trigger a permission question
  - Expected: 'you: ' prompt with bell, 'agi: ' lines, numbered Yes/No menu
- **Scripted run**
  1. Run agi -p 'hello' --screen-reader | cat
  - Expected: stdout has no 'agi:' labels

**Where to look when it fails**

- Output text for ANSI escape codes (pipe through a viewer)
- The startup path in apps/cli/src/lib.rs:5943-5981
- Tests in apps/cli/src/output.rs (names contain plain_mode, screen_reader)

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/011-accessibility-and-localization-components.md](../../70-qa/test-plans/cli/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **The code does not show that the full-screen TUI colours honour NO_COLOR; only icons do** Affects: CLI users who set only NO_COLOR. Evidence: apps/cli/src/tui/icons.rs:33-35; no other NO_COLOR use outside output.rs. Work needed: Verify in a terminal and add a test
- **detect_color_level is not called outside its module** Affects: Maintainers. Evidence: search of apps/cli/src found no external caller. Work needed: Remove or wire it
- **Misleading comment on the screen reader environment function** Affects: Maintainers. Evidence: apps/cli/src/output.rs:81-85. Work needed: Correct the comment
- **Brief cites apps/cli/src/lib.rs:4887, which holds model-listing code, not plain mode** Affects: Engineers using the brief. Evidence: apps/cli/src/lib.rs:4870-4905; plain code at lib.rs:5943-5951. Work needed: Refresh the citation
- **A prior audit register recorded that the CLI TUI ignored --plain; current code sets reduced motion from plain mode** Affects: Audit accuracy. Evidence: audit/doc-corrections/contradictions-register.md S6.31 row; apps/cli/src/tui/tui_app.rs:7122-7124. Work needed: Update the register

**Depends on**

- SYS-shared-ui-and-design
- SYS-observability-and-operations
- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/output.rs
- file:apps/cli/src/lib.rs

## Unknown

- Whether TUI colours respect NO_COLOR.
- Whether the config file key ui.screen_reader is documented for users (no document found).
- Whether every subcommand prints through the plain-aware sinks (only a sample was read).
- Whether Windows terminals behave the same under plain mode.
