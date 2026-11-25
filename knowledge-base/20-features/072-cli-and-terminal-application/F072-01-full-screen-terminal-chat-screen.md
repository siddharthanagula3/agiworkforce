---
id: "F072-01"
type: "feature"
title: "Full-screen terminal chat screen"
aliases: ["Interactive terminal UI", "TUI", "full-screen chat", "tui_app", "S72.01", "S72.27 Theme selection", "S72.29 Terminal resize handling", "/theme", "classic REPL (the line mode used instead)"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.01", "S72.27", "S72.29"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "file:apps/cli/src/tui/tui_app.rs", "file:apps/cli/src/config.rs", "file:apps/cli/src/lib.rs", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "F072-02", "F072-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-01 Full-screen terminal chat screen

Typing `agi` in the AGI Workforce CLI opens a full-screen terminal chat on the alternate screen: header, transcript, composer and status bar, with pickers and dialogs drawn over it. The user can pick a colour theme, which is saved to the project config. Plain or screen-reader mode uses a line-based mode instead.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.01](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7201), [S72.27](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7227), [S72.29](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7229).

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

**What it does.** The CLI's main screen. It shows the conversation, takes typed prompts, starts agent turns, streams the reply and tool steps into the transcript, and draws overlays (command palette, model, effort and theme pickers, approval dialogs) on top of the same frame. It also holds the colour theme choice and redraws at whatever size the terminal has.

**Why it exists.** The requirements say the CLI must have an interactive TUI/REPL, slash commands, a model/mode selector and a tool-call trace (doc: docs/product/requirements.md:1157-1178). The brief states that running `agi` opens a full-screen UI with composer, transcript and overlays (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.01).

**Who uses it.** Developers who work in a terminal and want a chat-style agent in the folder they are working in.

**Problems it solves**

- Gives a terminal user a chat experience without leaving the shell.
- Lets approvals, pickers and dialogs appear in the same screen as the conversation.
- Lets people with light or dark terminals, or colour-vision needs, choose a readable theme.
- Keeps the conversation visible when the window is resized.

**Use cases**

- A developer runs `agi` in a repo, asks the agent to explain a failing test, and watches tool steps stream in.
- A user on a light terminal types `/theme` and picks a light theme, which is still there next launch in that project.
- A user shrinks and enlarges the terminal window during a long answer and the transcript is still on screen.

## 2. User experience

**Where to find it**

- surface:cli only. Run `agi` in a terminal (apps/cli/src/lib.rs:8290-8300). No other app has this screen; the brief gives a status only for the CLI (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.01).
- Start view shows the text `Welcome to AGI`, the version, a `Model` line, a `Folder` line, the hint `Choose Local, Your key, or Managed with /model.`, and `Recent activity` with `/resume for more` (apps/cli/src/tui/tui_app.rs:2748-2830).

**Before you start**

- A terminal that can enter raw mode and the alternate screen (apps/cli/src/tui/tui_app.rs:1957-1967).
- Not started with `--no-tui`, and not in plain mode (`--plain` or the AGI_PLAIN environment variable), because both send the user to the line-based REPL (apps/cli/src/lib.rs:8290-8300, apps/cli/src/output.rs:43-62).
- A model route that can run: Local server, own provider key, or a signed-in Cloud account. Whether the screen itself needs sign-in is unknown (see unknowns).

**Screens and controls**

- Four stacked areas: header, chat area, composer (grows with content), one-line status bar (apps/cli/src/tui/tui_app.rs:2003-2018).
- Enter sends; Shift+Enter, Alt+Enter or Ctrl+J insert a new line (apps/cli/src/tui/tui_app.rs:4081-4106, 4118-4124).
- `/` on an empty composer opens the command palette by default (apps/cli/src/keybindings.rs:48-57, apps/cli/src/tui/tui_app.rs:4132-4141).
- `/theme` opens the Theme picker with seven rows: Auto, Dark, Light, Ansi, High Contrast Dark, High Contrast Light, Colorblind (apps/cli/src/tui/widgets/theme_picker.rs:60-72).
- `/theme <name>` sets a theme directly. Accepted spellings include dark, light, ansi, high-contrast-dark, high-contrast-light, colorblind, auto, and solarized-dark/solarized-light which map to Dark/Light (apps/cli/src/tui/widgets/theme_picker.rs:85-100).
- Page Up / Page Down scroll the transcript; Ctrl+L redraws the whole screen without losing the conversation (apps/cli/src/tui/tui_app.rs:7872-7880).

**Journey**

1. 1. User runs `agi` in a project folder.
2. 2. The CLI loads config, builds the session, starts MCP connection, managed-model discovery and local-model discovery in the background, then enters raw mode and the alternate screen (apps/cli/src/tui/tui_app.rs:7021-7118).
3. 3. The start view appears with model, mode, folder and recent sessions (apps/cli/src/tui/tui_app.rs:2748-2830).
4. 4. User types a message and presses Enter; the composer clears and a turn starts (apps/cli/src/tui/tui_app.rs:4081-4094).
5. 5. The live frame redraws every 50 ms with streamed text, spinner and tool steps; the composer keeps accepting typed text to queue (apps/cli/src/tui/tui_app.rs:2060-2078, apps/cli/src/tui/motion.rs:4).
6. 6. When the turn ends the reply stays in the transcript.
7. 7. User types `/theme`, picks a row with the arrow keys and Enter; the whole screen recolours on the next frame and a system line says `Theme set to <name>, saved in <path>.` (apps/cli/src/tui/tui_app.rs:5250-5280, 5232-5247).
8. 8. User exits (Ctrl+D twice, or /exit); the terminal is restored, the session is saved, and a session cost line prints (apps/cli/src/tui/tui_app.rs:7150-7215).

**What the person sees and gets**

- System messages in the transcript for results and failures, for example `Model switch failed: ...` (apps/cli/src/tui/tui_app.rs:5553-5573).
- Out-of-band notices (for example MCP connect errors) are pushed into the transcript as system messages (apps/cli/src/tui/tui_app.rs:7228-7244).
- A status-bar notice for short messages such as `press ctrl+d again to quit` (apps/cli/src/tui/tui_app.rs:3956-3968).
- On exit the CLI prints session tokens and cost (apps/cli/src/tui/tui_app.rs:7203-7210).

**Settings**

- `[ui] theme` in config.toml, one of auto | dark | light | ansi | high-contrast-dark | high-contrast-light | colorblind (apps/cli/src/config.rs:142-146).
- `[ui] reduced_motion` and plain mode reduce animation (apps/cli/src/tui/tui_app.rs:7110-7113).
- `--no-tui` and `--plain` choose the line-based mode (apps/cli/src/lib.rs:8290-8300).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The full-screen screen exists and is the default interactive mode (apps/cli/src/lib.rs:8290-8300, apps/cli/src/tui/tui_app.rs:6882).
- Layout is header, chat, composer and status bar, recomputed from the frame size on every draw (apps/cli/src/tui/tui_app.rs:1991-2018).
- The event loop polls every 50 ms, handles key and paste events, and redraws at the end of every iteration, so a resize event wakes the poll and the next draw uses the new size [inferred from the loop at apps/cli/src/tui/tui_app.rs:7283-7295 and 7903; this was not run].
- A unit test draws a live conversation at four sizes and checks the transcript text is still there and the welcome text is not (apps/cli/src/tui/tui_app.rs:11638-11660).
- Empty state: a start view with model, mode label (`Local`, `Your key` or `Managed`), folder and recent sessions (apps/cli/src/tui/tui_app.rs:2748-2830).
- Waiting state: spinner tick, `… working, Esc or Ctrl-C to cancel · type to queue a message` hint, and queued-message count (apps/cli/src/tui/tui_app.rs:2064-2078).
- Theme: picker, direct `/theme <name>`, apply to the palette, and save to the project config; startup reads the saved theme and falls back to Dark if it does not parse (apps/cli/src/tui/tui_app.rs:5250-5280, 6372-6392, 650-657, apps/cli/src/config.rs:1263-1266).
- Terminal is restored on panic and on termination signals (apps/cli/src/tui/tui_app.rs:1905-1950).

**Incomplete**

- The loop has no explicit resize handler: any non-key, non-paste event is ignored and the redraw comes from the loop itself (apps/cli/src/tui/tui_app.rs:7283-7290). No test sends a real resize event; the only resize test draws into a test buffer.
- `/theme <alias>` for the solarized spellings silently sets Dark or Light, not a solarized theme (apps/cli/src/tui/widgets/theme_picker.rs:93-94).

**Present but disconnected or switched off**

- Plain or screen-reader mode does not open this screen; the line-based REPL runs instead (apps/cli/src/lib.rs:8290-8300).
- The area brief lists `S72.28 No-color mode` as a separate item that includes the TUI; this page only covers the theme choice and not NO_COLOR handling.

**Not available**

- surface:web, surface:desktop, surface:mobile, surface:vscode, surface:chrome: no equivalent screen; those apps have their own UIs (brief status n/a).
- No theme file or custom theme: only the seven built-in choices (apps/cli/src/tui/widgets/theme_picker.rs:60-72).

## 4. Required behaviour

**Established requirements**

- Running `agi` in a terminal opens a full-screen interactive UI with a composer, transcript and overlays that sends turns to the agent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.01)
- The user can pick a terminal colour theme (picker or /theme <name>) and it applies and persists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.27)
- Resizing the terminal re-lays out the TUI without losing the transcript. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.29)
- The CLI must include the `agi` command, an interactive TUI/REPL, slash commands, a model/mode selector, approval modes and a tool call trace, and must stay local/workspace scoped unless the user hands off explicitly. (source: doc: docs/product/requirements.md:1157-1180)

**Acceptance criteria**

1. Running `agi` in a real terminal shows the start view with a `Welcome to AGI` line, model, folder and an input box.
2. Typing a message and pressing Enter shows the user message, then the reply and tool steps in the transcript.
3. Resizing the window between a narrow and a wide size keeps all earlier messages visible and the composer usable.
4. `/theme` opens a picker with seven rows; choosing one recolours the screen and prints a line naming the file it was saved in.
5. After picking a theme, quit and run `agi` again in the same folder: the theme is still applied.
6. `agi --no-tui` or `AGI_PLAIN=1 agi` does not open the full-screen screen.
7. After Ctrl+C or a crash path the terminal is back to normal (no raw mode, no alternate screen).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Theme and layout work on any terminal that supports raw mode and the alternate screen; terminals without them fall back to the line mode or fail at startup [inferred; no fallback was found in setup_terminal, apps/cli/src/tui/tui_app.rs:1957-1967].
- The saved theme is per project, not per user, because it writes the project config [inferred from apps/cli/src/config.rs:1162-1195].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that feeds a real resize event to the event loop, not only a draw at several sizes.
- [proposed] Also save the theme to the user config when no project config exists, so a theme chosen in one folder is not lost in another.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | run_cli (TUI vs REPL choice) | `apps/cli/src/lib.rs` | Chooses the full-screen screen by default and the line REPL for --no-tui or plain mode (lib.rs:8290-8300). |
| screen | tui::tui_app::run | `apps/cli/src/tui/tui_app.rs` | Builds the session, starts background discovery, sets up the terminal, runs the loop, and does exit work (tui_app.rs:6882-7215). |
| service | run_event_loop | `apps/cli/src/tui/tui_app.rs` | Poll, key/paste dispatch, queued prompts, notices, redraw (tui_app.rs:7186-7905). |
| screen | draw_app_frame / render | `apps/cli/src/tui/tui_app.rs` | Layout and drawing of header, chat, composer, status bar and picker overlays (tui_app.rs:1982-2050). |
| screen | start view (Welcome to AGI) | `apps/cli/src/tui/tui_app.rs` | Empty-state text with model, mode label, folder and recent activity (tui_app.rs:2748-2830). |
| service | setup_terminal / restore_terminal | `apps/cli/src/tui/tui_app.rs` | Raw mode, alternate screen, bracketed paste, panic and signal restore (tui_app.rs:1905-1975). |
| component | ThemePicker and ThemeChoice | `apps/cli/src/tui/widgets/theme_picker.rs` | Seven theme rows, name parsing, slug, Auto resolution (theme_picker.rs:48-130). |
| service | handle_theme_picker_key / theme_set_message | `apps/cli/src/tui/tui_app.rs` | Applies and persists a picked theme and reports the saved path or the failure (tui_app.rs:5232-5280). |
| command | /theme slash handler | `apps/cli/src/tui/tui_app.rs` | Opens the picker or sets a theme by name (tui_app.rs:6372-6392). |
| service | terminal_palette | `apps/cli/src/tui/terminal_palette.rs` | Semantic colour tokens re-routed by set_active_theme. |
| config | CliConfig ui.theme and persist_theme_project | `apps/cli/src/config.rs` | Stores the theme slug and writes it to the project config (config.rs:142-146, 1116-1141, 1263-1266). |
| config | update_project_config | `apps/cli/src/config.rs` | Writes .agiworkforce/config.toml in the project (config.rs:1162-1195). |
| config | plain output and screen reader flags | `apps/cli/src/output.rs` | Decides plain mode and screen-reader mode (output.rs:28-80). |
| service | StartPanel | `apps/cli/src/tui/tui_app.rs` | Reads recent sessions on a plain thread for the start view (tui_app.rs:2240-2290). |
| component | motion (frame interval, reduced motion) | `apps/cli/src/tui/motion.rs` | 50 ms frame interval and reduced-motion switch (motion.rs:4). |
| test | the_transcript_survives_a_resize | `apps/cli/src/tui/tui_app.rs` | Draws a conversation at four sizes (tui_app.rs:11638-11660). |
| test | theme picker tests | `apps/cli/src/tui/widgets/theme_picker.rs` | Slug round trip and picker snapshot (theme_picker.rs:390-421). |
| test | header and footer snapshots | `apps/cli/src/tui/snapshots` | Header and footer at widths 40, 80 and 120. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User runs `agi`. The CLI parses arguments, loads merged config, decides TUI vs REPL. | device | apps/cli/src/lib.rs:8290-8300 |
| The session is built and the saved or resumed conversation is loaded; SessionStart hooks run. | device | apps/cli/src/tui/tui_app.rs:6931-7065 |
| In the background: MCP servers connect (stdio ones on the device, remote ones to outside services), a managed-model roster is requested, and local servers (Ollama, LM Studio) are probed with a 2.5 s timeout. | device and our servers | apps/cli/src/tui/tui_app.rs:7021-7108 |
| Terminal enters raw mode and the alternate screen; the first frame is drawn. | device | apps/cli/src/tui/tui_app.rs:1957-1967, 7193 |
| Each loop pass: poll 50 ms, read a key or paste, update state, redraw. | device | apps/cli/src/tui/tui_app.rs:7283-7295, 7903 |
| Enter sends the text; slash commands are handled locally, other text starts an agent turn on the session's model route (Local server on the device, own key to the provider, or Cloud through our servers). | device and our servers | apps/cli/src/tui/tui_app.rs:7410-7480, 8225-8245 |
| Picking a theme sets the active palette and writes `theme` into the project config file. | device | apps/cli/src/tui/tui_app.rs:5250-5280, apps/cli/src/config.rs:1263-1266 |
| On exit the screen is restored, the session file saved, memory summarised, the session pushed to the account if the session is Managed, and a cost line printed. | device and our servers | apps/cli/src/tui/tui_app.rs:7150-7215, apps/cli/src/agent/mod.rs:2749-2760 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Theme slug | .agiworkforce/config.toml in the project folder under [ui] theme (apps/cli/src/config.rs:1116-1141, 1162-1195) | No sync found in the code | Stays until the file is edited; no delete action. |
| Conversation transcript | Managed session files under the CLI config folder (apps/cli/src/sessions.rs:1-30) | Pushed to the account only for Managed sessions (apps/cli/src/agent/mod.rs:2749-2760) | Kept until the user deletes the session (see F072-03). |
| Screen state (scroll, overlays) | Process memory only | No | Gone when the process ends. |

**Models and providers.** The screen itself is model-agnostic. The header and start view show the current model and the trust label Local, Your key or Managed taken from the session provider (apps/cli/src/tui/tui_app.rs:2760-2790). Which provider answers is decided by the session route; see F072-04 and SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No sign-in is needed to draw the screen itself [inferred]. Cloud turns need a signed-in account (apps/cli/src/cloud/client.rs:375-379). Whether launch with no account and no key stops early was not traced. |
| Permissions | Shell commands typed with a leading `!` run only in a trusted folder (apps/cli/src/tui/tui_app.rs:7385-7392). Tool approvals follow the permission mode (see F072-04). |
| Subscription | None for the screen. In Cloud mode the models available depend on the plan tier (apps/cli/src/model_catalog.rs:938-970). |
| Limits and metering | None found in the code for the screen itself. Turn usage in Cloud mode is metered by the server (see F072-05). |
| Feature flags | `--no-tui`, `--plain`, AGI_PLAIN, `[ui] reduced_motion`, `[ui] screen_reader` (apps/cli/src/lib.rs:8290-8300, apps/cli/src/output.rs:28-80, apps/cli/src/config.rs:163). |
| Model compatibility | Any model the session can route to. Local models discovered on the machine appear with unknown window size (apps/cli/src/tui/tui_app.rs:3384-3408). |
| Provider restrictions | None for the screen. Provider boundaries apply to what a turn may do (SYS-execution-boundaries). |
| Local mode | The screen works the same. The start view labels it `Local · on-device & private` (apps/cli/src/tui/tui_app.rs:2755-2760). In Local mode remote MCP servers are dropped and nothing is sent to the AGI account (apps/cli/src/mcp/mod.rs:2376-2391, apps/cli/src/cloud/client.rs:361-373). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty (no messages) | Start view with welcome, model, folder and recent activity or `No recent activity`. | apps/cli/src/tui/tui_app.rs:2748-2830 |
| Waiting for a reply | Spinner and hint; the composer still takes text, Enter queues it, Esc or Ctrl-C cancels. | apps/cli/src/tui/tui_app.rs:2064-2078 |
| Resize | Layout is recomputed on the next draw. Not run; one test covers drawing at four sizes. | apps/cli/src/tui/tui_app.rs:7903, 11638-11660 |
| Theme save failure | Theme still applies for the session; the message says it could not be saved and why. | apps/cli/src/tui/tui_app.rs:5232-5247 |
| Unknown theme name | System message `Unknown theme: '<arg>'. Available: ...`. | apps/cli/src/tui/tui_app.rs:6384-6389 |
| Error from an action | Shown as a system message in the transcript. | apps/cli/src/tui/tui_app.rs:5553-5573 |
| Terminal crash or kill signal | Terminal state is restored by panic and signal hooks. | apps/cli/src/tui/tui_app.rs:1905-1950 |
| Screen reader or plain mode | Line-based mode runs instead of the TUI. | apps/cli/src/lib.rs:8290-8300 |
| Offline | Not handled by the screen itself; failures from a turn show as error or system messages. Local models keep working. Not traced further. | apps/cli/src/tui/tui_app.rs:5553-5573 |
| Light terminal with Auto theme | Auto becomes Light on a light background and Dark otherwise. | apps/cli/src/tui/widgets/theme_picker.rs:111-117 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/tui/tui_app.rs`: Inline tests: the_transcript_survives_a_resize (line 11638), header and footer snapshots at widths 40, 80, 120, welcome text version check (line 13368), picker overlays do not let the transcript bleed through (line ~11630).
- `apps/cli/src/tui/widgets/theme_picker.rs`: Every theme slug round-trips through from_arg; slugs are the documented spellings; picker snapshot (lines 390-421).
- `apps/cli/src/tui/snapshots`: Stored snapshots for header and footer at three widths.
- `apps/cli/src/tui/widgets/snapshots`: Stored snapshots of picker and approval overlays.
- `apps/cli/src/config.rs`: Config tests including a theme file read (around line 3600) and config directory resolution.

**Test scenarios**

- **Open and send**
  1. Run `agi` in a repo with a working model route.
  2. Type `say hello` and press Enter.
  - Expected: Start view shows first; after Enter a user line and a streamed reply appear in the transcript.
- **Resize keeps the transcript**
  1. Send two messages.
  2. Shrink the window to about 60 columns, then widen it to 180.
  - Expected: Both messages stay visible at every size, the composer stays usable, nothing falls back to the welcome text.
- **Theme persists**
  1. Type `/theme`, choose High Contrast Dark.
  2. Read .agiworkforce/config.toml.
  3. Quit and run `agi` again in the same folder.
  - Expected: A `Theme set to High Contrast Dark, saved in <path>.` line appears, the file holds `theme = "high-contrast-dark"` under [ui], and the next launch uses it.
- **Bad theme name**
  1. Type `/theme neon`.
  - Expected: `Unknown theme: 'neon'. Available: auto | dark | light | ...` and no change.
- **Plain mode**
  1. Run `AGI_PLAIN=1 agi`.
  - Expected: No full-screen screen; line-based prompt, no colour.
- **Terminal restore**
  1. Run `agi`, press Ctrl+D twice.
  - Expected: Shell prompt returns normally with typed text echoing, and a session cost line prints.

**Where to look when it fails**

- System lines in the transcript starting `MCP config/connect error:` (apps/cli/src/tui/tui_app.rs:7036).
- tracing log lines `managed model discovery unavailable during TUI startup` (apps/cli/src/tui/tui_app.rs:7058).
- `agi doctor` prints a setup report (apps/cli/src/doctor.rs).
- Check .agiworkforce/config.toml for the saved theme.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **No test sends a real resize event; the brief marks resize as done but the proof is a draw into a test buffer.** Affects: surface:cli users who resize while a turn is streaming.. Evidence: apps/cli/src/tui/tui_app.rs:7283-7290 and 11638-11660. Work needed: Add a loop-level test or a recorded terminal test with a resize event, including during a streamed turn.
- **Theme is saved to the project config, so it is not remembered in other folders, and a new `.agiworkforce` folder is created in whatever directory the user is in.** Affects: surface:cli users who work in many folders.. Evidence: apps/cli/src/config.rs:1162-1195. Work needed: Decide whether theme belongs in user config; save there when there is no project config.
- **The solarized spellings are accepted but only map to Dark and Light.** Affects: surface:cli users who type /theme solarized-dark.. Evidence: apps/cli/src/tui/widgets/theme_picker.rs:93-94. Work needed: Either add real themes or reject the names.
- **Plain and screen-reader users never get this screen; they get the line mode, which has a different command set (for example it has Ctrl+R search).** Affects: surface:cli users who need plain mode.. Evidence: apps/cli/src/lib.rs:8290-8300, apps/cli/src/command_registry.rs:281-282. Work needed: Confirm parity between the two modes and record the differences in docs.
- **The decision log says the TUI /background command was cut, but the code has it again as a durable hand-off.** Affects: Engineers reading docs/decisions/wire-or-cut.md.. Evidence: docs/decisions/wire-or-cut.md:55, apps/cli/src/tui/tui_app.rs:5960. Work needed: Update the decision row to match the current code.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- file:apps/cli/src/tui/tui_app.rs
- file:apps/cli/src/config.rs
- file:apps/cli/src/lib.rs
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- F072-02
- F072-04

## Unknown

- Whether launching with no account, no key and no local server stops with a message before the screen opens; not traced.
- Whether terminals that cannot enter the alternate screen get a fallback; no fallback seen in setup_terminal.
- Behaviour of the screen on Windows terminals; the code has Windows signal hooks (tui_app.rs:1905-1950) but no run was made.
- Relationship of the CLI colour tokens to the shared design system (SYS-shared-ui-and-design).
