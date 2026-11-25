---
id: "F102-07"
type: "feature"
title: "Command-line app"
aliases: ["Command-line app", "CLI", "agi", "agiworkforce (second binary name)", "interactive terminal screen / TUI", "classic REPL / line-based mode (--no-tui)", "one-shot mode", "headless mode", "print mode (--print)", "CLI interactive runtime (S102.18)", "CLI headless runtime (S102.19)"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.18", "S102.19"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-agents-tools-and-automation", "SYS-security-and-privacy", "mode:local", "mode:own-key", "mode:cloud", "surface:cli", "provider:ollama", "provider:lmstudio", "file:apps/cli/src/lib.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-07 Command-line app

The AGI command-line app. Started with no prompt in a terminal, it opens a full-screen interactive screen, or a plain line-based session when asked. Given a prompt, piped text or images, it answers once and exits, as plain text, raw text, JSON or streaming JSON lines, which suits scripts and CI.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.18](../../10-requirements/capabilities/102-runtime-inventory.md#s10218), [S102.19](../../10-requirements/capabilities/102-runtime-inventory.md#s10219).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The CLI (binary 'agi', plus a second binary 'agiworkforce') is a terminal coding agent. It has two ways to run. Interactive: a full-screen terminal screen (built with ratatui) or a classic line-based session. One-shot: it takes one prompt, runs the agent to the end of the turn, prints the result and exits (apps/cli/Cargo.toml:15-21, apps/cli/src/lib.rs:8143-8330).

**Why it exists.** Developers need the same agent in a terminal and in scripts. The product requirements list the CLI as the developer engine and terminal agent, with user command 'agi' (doc: docs/product/requirements.md:66, :82). The desktop and VS Code extension also reuse the CLI as their local runtime (apps/desktop/electron/runtime/dispatcher.ts:3235-3241, apps/extension-vscode/src/integrations/localRuntimeClient.ts:2573-2575).

**Who uses it.** Developers working in a terminal, people who script or automate with the agent, CI jobs, and people who use a screen reader (a dedicated screen-reader mode exists, apps/cli/src/lib.rs:440-447, apps/cli/src/output.rs:62-85).

**Problems it solves**

- Run the agent without a window or a mouse.
- Get a single answer from a script, with machine-readable output.
- Use the agent when the terminal cannot draw a full-screen interface (plain mode).
- Pipe a file or command output into a prompt.

**Use cases**

- Run 'agi' in a project folder and chat in the full-screen screen.
- Run 'agi "explain this error"' for one answer.
- Run 'git diff | agi - "review this"' in a script (stdin marker '-', lib.rs:8513-8545).
- Run 'agi --json "..."' or '--output-format stream-json' in CI and read the result with another program.

## 2. User experience

**Where to find it**

- CLI only: the 'agi' command in a terminal (apps/cli/Cargo.toml:15-17). 'agiworkforce' is a second binary (Cargo.toml:19-21) [inferred: src/bin/agiworkforce.rs not opened].
- No equivalent on Web, Desktop, Mobile, VS Code or Chrome. The Desktop and VS Code extension start the CLI in the background as a local runtime, and show their own screens.

**Before you start**

- The CLI is installed and a model route is usable: a signed-in AGI account (Cloud), a provider key (own key), or a local model server such as Ollama or LM Studio (apps/cli/src/local_models.rs:7-9). Which exact sign-in the CLI demands for each path was not established (see unknowns).
- For the full-screen screen: a terminal that can draw it. Plain mode is forced by --plain, AGI_PLAIN, --screen-reader, AGI_SCREEN_READER or config ui.screen_reader (lib.rs:5942-5951, output.rs:56-85).

**Screens and controls**

- Positional PROMPT argument: 'One-shot prompt (if omitted, starts interactive REPL)' (lib.rs:187-188).
- --no-tui: 'Disable full-screen TUI and use the classic line-based REPL instead' (lib.rs:362-364).
- --print: non-interactive, print the response and exit (lib.rs:293-294). --raw: raw text only (lib.rs:249-250). --json: output raw JSON response (lib.rs:211-212).
- --output-format text|json|stream-json (alias --output) (lib.rs:277-290, enum 559-565). --json-events: JSONL agent events on stdout (lib.rs:459-461); it conflicts with --output-format.
- --quiet, --model, --provider, --max-tokens, --max-turns, --effort low|medium|high|max, --max-budget-usd, --file (images and files), --session/--resume/--continue/--fork-session, --mode and --yes permission options, --agent, --team (lib.rs:187-460, 8143-8230).
- Full-screen screen: footer, transcript, composer, approval prompts (apps/cli/src/tui/*, snapshots in apps/cli/src/tui/snapshots). Exact visible labels were not enumerated.

**Journey**

1. Interactive: 1. Open a terminal in the project folder. 2. Run 'agi' with no prompt and with an attached terminal. 3. The CLI loads config, resolves the model and permissions (lib.rs:6038-8130). 4. With no prompt, no images and no piped input it goes to the interactive branch (lib.rs:8294-8330). 5. Full-screen screen opens (tui::run, tui_app.rs:6882), or the line REPL if --no-tui or plain mode (repl::run_repl, repl/mod.rs:49). 6. Type, approve tool use, read the streamed answer.
2. One-shot: 1. Run 'agi "prompt"', or pipe text, or pass --file images. 2. Piped stdin is read in full (lib.rs:8664-8671) and combined with the positional prompt as <stdin> context (lib.rs:8513-8545). 3. The CLI calls run_oneshot (lib.rs:8186, defined 9146). 4. The answer prints in the chosen output mode. 5. The process exits; the exit code comes from the error type (lib.rs:8797 run_to_exit_code, exit_code_for).

**What the person sees and gets**

- Text mode: formatted answer, plus cost/usage lines unless --quiet [inferred from lib.rs:9433-9448, 9536].
- JSON mode: one object with type 'result', model, response, input_tokens, output_tokens, via_subscription, cost, duration_ms, is_error and an optional incomplete cause (lib.rs:601-625).
- stream-json and --json-events: one JSON object per line (JSONL) (lib.rs:559-565, 10528-10586; apps/cli/tests/json_events_jsonl.rs).
- Errors: '--print requires a prompt argument.' and 'No input received from stdin.' both exit with code 1 (lib.rs:8215-8225). A session resume prints 'Resuming session ...' or 'Forked session ...' on stderr (lib.rs:8232-8262).

**Settings**

- Config file under ~/.agiworkforce (or AGIWORKFORCE_HOME) (config.rs:480-482).
- config ui.screen_reader, ui.privacy_mode (config.rs:467-473; lib.rs:5942-5947).
- Environment: AGI_PLAIN, AGI_SCREEN_READER, AGI_TEAM (output.rs:56-84; lib.rs:8290).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- No prompt, attached terminal: starts the full-screen screen unless --no-tui or plain mode (lib.rs:8294-8330).
- Line-based REPL exists and is the fallback and the screen-reader surface (repl/mod.rs:49; output.rs:62-85).
- One-shot path: prompt, stdin, '-' marker and images lead to run_oneshot (lib.rs:8143-8212, 8513-8545, 9146).
- Output modes text, raw, JSON, stream-JSON resolved in one function (lib.rs:574-595); canonical JSON result object (lib.rs:601-625).
- --json-events keeps stdout strict JSONL, including fallback turns (lib.rs:9236-9250; tests/json_events_jsonl.rs).
- Budget cap --max-budget-usd emits a budget-exhausted event when --json-events is on (lib.rs:9244-9250).
- --print with no prompt, and piped-but-empty stdin, both refuse with exit 1 instead of opening the REPL (lib.rs:8215-8225).

**Incomplete**

- The brief's code pointers are stale: lib.rs:4609 is the schedule-trigger 'add' handler and lib.rs:3115 is the code-session approvals renderer (lib.rs:4595-4625, 3100-3118). The real interactive entry is lib.rs:8294-8330 and the real one-shot entry is lib.rs:8186 into 9146. The earlier draft said the headless entry was not confirmed; it is confirmed here.

**Present but disconnected or switched off**

- --demo is a debug-build-only flag; a release binary does not accept it (lib.rs:~468-473, #[cfg(debug_assertions)]).

**Not available**

- Web, Desktop, Mobile, VS Code and Chrome have no terminal screen; the brief marks them n/a.

## 4. Required behaviour

**Established requirements**

- The CLI runs an interactive terminal runtime (TUI, with a REPL fallback). Platform status: done. (source: S102.18 (brief item))
- The CLI runs headless for one-shot or scripted use. Platform status: done. (source: S102.19 (brief item))
- Without a prompt, the CLI starts the interactive REPL or TUI; full-screen mode can be turned off. (source: S102.18 Should line; verified at apps/cli/src/lib.rs:187-188, 362-364, 8294-8330)
- The user-facing CLI command is 'agi'; the CLI is the developer engine and terminal agent. (source: doc: docs/product/requirements.md:66, :82)
- Local mode means no AGI account required, local storage by default, local files stay local. (source: doc: docs/product/requirements.md:476-486)

**Acceptance criteria**

1. Running 'agi' with no arguments in a terminal opens the full-screen screen; adding --no-tui opens the line-based REPL instead.
2. Setting AGI_PLAIN or --screen-reader forces the line-based REPL even without --no-tui.
3. 'agi "hello"' prints one answer and exits without opening a screen.
4. 'echo hi | agi' treats stdin as the prompt; 'agi --print' with no prompt exits 1 with the message '--print requires a prompt argument.'
5. 'agi --json "x"' prints one JSON object with the fields type, model, response, input_tokens, output_tokens, via_subscription, cost, duration_ms, is_error.
6. 'agi --output-format stream-json "x"' prints only valid JSON lines on stdout.
7. '--output-format' together with '--json-events' is rejected by the argument parser.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A script must be able to rely on exit code 0 for success and non-zero for failure [inferred from exit_code_for, lib.rs:8797].
- In one-shot mode no question may be asked at the terminal, so permissions must be decided by flags or policy [inferred from crate::tools::forbid_terminal_questions(), lib.rs:8166].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Correct the brief pointers for S102.18 and S102.19 to lib.rs:8294-8330 and lib.rs:8186/9146.
- [proposed] Add an automated test that proves a TTY with no prompt reaches tui::run and that --no-tui or AGI_PLAIN reaches run_repl.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Binary targets | `apps/cli/Cargo.toml` | Declares binaries 'agi' (src/main.rs) and 'agiworkforce' (src/bin/agiworkforce.rs); dependencies ratatui, crossterm, rustyline (lines 15-21, 66, 83-84). |
| command | Cli argument struct | `apps/cli/src/lib.rs` | Defines prompt, --no-tui, --print, --raw, --json, --output-format, --json-events, --effort, --max-budget-usd and subcommands (lines 175-470). |
| service | run_main / run_cli | `apps/cli/src/lib.rs` | Parses arguments, sets plain mode (5942-5951), reads stdin (7982-7983), chooses one-shot or interactive (8143-8330). |
| service | resolve_oneshot_output_mode | `apps/cli/src/lib.rs` | Maps --json, --raw, --print and --output-format to Text, RawText, JsonPretty or JsonLine (574-595). |
| service | build_final_prompt / read_piped_stdin | `apps/cli/src/lib.rs` | Combines positional prompt, stdin and file context into the one-shot prompt (8513-8545, 8664-8671). |
| service | run_oneshot | `apps/cli/src/lib.rs` | Headless entry: runs one agent turn and prints the result (9146+). |
| component | Full-screen terminal screen | `apps/cli/src/tui/tui_app.rs` | tui::run starts the ratatui screen (6882); widgets, composer, transcript, approvals in the same folder. |
| component | Line-based REPL | `apps/cli/src/repl/mod.rs` | run_repl (49) is the plain interactive session; slash commands in repl/slash_commands.rs. |
| service | Plain and screen-reader output | `apps/cli/src/output.rs` | set_plain_output, AGI_PLAIN and AGI_SCREEN_READER handling (41-85). |
| config | CliConfig | `apps/cli/src/config.rs` | Loads config and gives the account privacy mode, default Managed when unset (467-473). |
| service | PrivacyMode | `apps/cli/src/platform/runtime/session.rs` | Local, Byok, Managed boundary with plain labels 'Local', 'Your key', 'Managed' (255-290). |
| service | Local model discovery | `apps/cli/src/local_models.rs` | Probes Ollama (localhost:11434) and LM Studio (localhost:1234/v1) with a 2.5 s timeout (7-9). |
| service | Plan model cache | `apps/cli/src/tier_cache.rs` | Fetches the account's plan model list before a route is judged, only when signed in and admitted (509-525). |
| test | JSONL strictness test | `apps/cli/tests/json_events_jsonl.rs` | Every stdout line must be JSON under --json-events, including the fallback path. |
| test | Inline CLI tests | `apps/cli/src/lib.rs` | Argument parsing and output-mode tests in mod tests (from line 9559), e.g. 9773-9780, 10160, 10528-10586, 11021. |
| test | TUI snapshots | `apps/cli/src/tui/snapshots` | Footer snapshots at widths 40, 80, 120 and others used by tui_app.rs tests (8777+). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The program parses arguments and decides plain mode from --plain, AGI_PLAIN, --screen-reader, AGI_SCREEN_READER or config. | device | apps/cli/src/lib.rs:5942-5951; apps/cli/src/output.rs:41-85 |
| Piped stdin and --file contents are read and merged into a prompt; images are re-encoded for the model. | device | apps/cli/src/lib.rs:7982-7983, 8513-8545, 8664-8682 |
| If a prompt, images or --print exist, the one-shot path runs; otherwise the interactive branch runs (TUI, or REPL when --no-tui or plain). | device | apps/cli/src/lib.rs:8143-8212, 8294-8330 |
| A signed-in account's plan model list is fetched from AGI servers before a route is chosen, only when the privacy mode admits cloud. | our servers | apps/cli/src/tier_cache.rs:509-525 |
| The agent turn sends the prompt to the chosen route: AGI managed cloud, the user's own provider key, or a local model server on the same machine, depending on privacy mode. | device and our servers | apps/cli/src/platform/runtime/session.rs:255-290; apps/cli/src/local_models.rs:7-9 [inferred for the exact routing code, not read end to end] |
| Tool calls (shell, files) run on the device, inside the OS sandbox by default unless --no-sandbox. | device | apps/cli/src/lib.rs:~376-380 (--no-sandbox doc); brief S102.15 cites apps/cli/src/sandbox.rs:213 |
| The result is printed in the chosen format and the process exits with a code. | device | apps/cli/src/lib.rs:601-625, 8797 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Saved sessions (messages, managed session record) | On the device under the config directory (~/.agiworkforce by default) | Not by this feature; a cloud 'teleport' command can pull an account conversation into a local session (lib.rs:2624-2650) | Kept until the user deletes it; deletion rules not read (unknown) |
| Config file | ~/.agiworkforce/ or AGIWORKFORCE_HOME, directory mode 0700 | No | User-managed (config.rs:475-482) |
| One-shot result JSON / JSONL | Standard output only | No | Owned by the caller's pipe |

**Models and providers.** The CLI is model- and provider-agnostic: --model must match the shared catalog and --provider overrides (lib.rs:196-201). It talks to managed cloud, own-key providers and local servers (providers folders anthropic, openai, google, ollama, lmstudio and others under packages/ai/providers). Auto routing can choose the model per turn (lib.rs:8150-8168).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required for a local-server route [inferred: ensure_plan_models_cached returns early without a signed-in JWT, tier_cache.rs:509-525]. Cloud route needs sign-in; the exact check was not read (unknown). |
| Permissions | Tool use goes through permission modes (--mode, --yes, --dangerously-skip-permissions, --permission-mode); one-shot mode cannot ask questions at the terminal, so permissions come from flags or policy (lib.rs:8166, 8100-8125). A managed policy can hold a launch to stricter settings (held_to_managed_policy, lib.rs:8115). |
| Subscription | The JSON result carries via_subscription and cost, so the CLI knows whether a turn was covered by the subscription (lib.rs:601-625, 9433-9448). Per-plan rules for the CLI: unknown. |
| Limits and metering | --max-turns, --max-tokens, --effort presets (low: 3 turns and 2048 tokens; high: 50 turns and 16384; max: 100 and 32768) and --max-budget-usd (lib.rs:~304-310, 8143-8146, 9244). |
| Feature flags | --no-tui, --plain, --screen-reader, --team (or AGI_TEAM=1), --no-sandbox, --json-events. Feature flags from the server: none found in the code read. |
| Model compatibility | --model must match the shared model catalog (lib.rs:196-198). Tool use on a local model that cannot call tools should be hidden (doc: docs/product/requirements.md:299). |
| Provider restrictions | Privacy mode Byok sends context directly to the user's own key; Managed sends through AGI cloud; Local keeps everything on the device (session.rs:272-290). Some commands (advisor) refuse in Local mode (apps/cli/src/platform/runtime/advisor.rs:115-122). |
| Local mode | PrivacyMode::Local means no prompt, chat or file context should leave the device (session.rs:272-276). Local servers (Ollama, LM Studio) are probed on localhost (local_models.rs:7-9). The default privacy mode when unset is Managed, not Local (config.rs:467-473). Whether Local mode needs any sign-in: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No prompt, stdin is a pipe but empty | Prints 'No input received from stdin.' and exits 1; does not start the REPL. | apps/cli/src/lib.rs:8221-8225 |
| --print with no prompt | Prints '--print requires a prompt argument.' and exits 1. | apps/cli/src/lib.rs:8215-8219 |
| Images only, no text | Treated as a one-shot with an empty text turn so the model describes the image. | apps/cli/src/lib.rs:8143-8156 |
| Resume of a session with no messages | Warns 'session has no messages' and continues. | apps/cli/src/lib.rs:8232-8240 |
| Interrupted tool call in a resumed session | Tells the assistant the result is unknown and asks it to check before relying on it. | apps/cli/src/lib.rs:8268-8282 |
| Output closed early (broken pipe) | Handled; a test file exists named broken_pipe.rs [inferred: contents not read]. | apps/cli/src/broken_pipe.rs; apps/cli/tests/broken_pipe.rs |
| Screen reader or plain mode | Line-based output, every line labelled 'you:' or 'agi:', numbered menus, bell when input is needed. | apps/cli/src/lib.rs:440-447; apps/cli/src/output.rs:62-85 |
| Offline | Not handled in the code read for the TUI; local servers are probed with a 2.5 s timeout. Full offline behaviour: unknown. | apps/cli/src/local_models.rs:9 (timeout only); no other offline code read |
| Budget exhausted in one-shot | Emits a budget-exhausted event only with --json-events. | apps/cli/src/lib.rs:9244-9250 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/tests/json_events_jsonl.rs`: Run with --demo --json-events: every non-empty stdout line parses as JSON and a message_delta event exists (read header).
- `apps/cli/src/lib.rs (mod tests, from line 9559)`: Argument parsing including --no-tui (9773-9780), --json versus --output-format agreement (10160), output-format selection and stream-json envelopes (10528-10586), build_final_prompt (10510-10518), one-shot JSON incomplete cause (11021).
- `apps/cli/src/tui/tui_app.rs (mod tests, from line 8777)`: TUI behaviour and footer rendering [inferred]; snapshots in apps/cli/src/tui/snapshots.
- `apps/cli/tests/broken_pipe.rs`: Closed-pipe handling [inferred from file name].
- `apps/cli/tests/terminal_escape_diagnostics.rs`: Terminal escape handling in diagnostics [inferred from file name].
- `apps/cli/tests/normal_child_stdio.rs`: Child-process stdio behaviour [inferred from file name].

**Test scenarios**

- **Interactive start**
  1. In a terminal run 'agi' with no arguments.
  2. Then run 'agi --no-tui'.
  3. Then run 'AGI_PLAIN=1 agi'.
  - Expected: First opens the full-screen screen; the second and third open the line-based REPL.
- **One-shot text**
  1. Run 'agi "say hello"'.
  2. Check the exit code.
  - Expected: One answer prints, the process exits, code 0.
- **JSON result**
  1. Run 'agi --json "say hello"' and parse stdout.
  - Expected: One JSON object with type 'result' and the documented fields.
- **Stream JSON**
  1. Run 'agi --output-format stream-json "say hello" | jq -c .'
  - Expected: Every line parses; no plain text lines.
- **Stdin marker**
  1. Run 'echo "2+2" | agi - "answer"'.
  - Expected: The stdin text is sent inside <stdin> tags with the positional prompt.
- **Print without prompt**
  1. Run 'agi --print' with stdin from a terminal.
  - Expected: Message '--print requires a prompt argument.' and exit code 1.

**Where to look when it fails**

- Stderr lines 'Resuming session', 'No saved session in this project to continue', '--print requires a prompt argument.', 'No input received from stdin.'.
- --verbose and --debug flags enable tracing (init_tracing, lib.rs:~5935).
- apps/cli/src/crash_reports.rs and diagnostics_bundle.rs exist for failures [inferred from names].
- Exit code mapping: exit_code_for in apps/cli/src/lib.rs near 8797.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief code pointers for S102.18 and S102.19 point at unrelated code.** Affects: Engineers and testers using the brief; CLI.. Evidence: apps/cli/src/lib.rs:4595-4625 (schedule triggers) and 3100-3118 (code approvals) versus the real entries at 8294-8330 and 8186/9146.. Work needed: Update the brief pointers.
- **No test found that proves a TTY with no prompt reaches the full-screen screen and that --no-tui or plain mode reaches the REPL; the test at lib.rs:9773-9780 only checks parsing.** Affects: CLI interactive start.. Evidence: apps/cli/src/lib.rs:9773-9780; branch at 8294-8330.. Work needed: Add an integration test with a pseudo-terminal.
- **Sign-in and subscription rules for the CLI per route (Local, own key, Cloud) were not established.** Affects: CLI users; requirement that local inference is free of any subscription.. Evidence: tier_cache.rs:509-525 only shows a signed-in plan fetch; no gate read.. Work needed: Read the managed-request context and auth code; document per mode.
- **Default privacy mode is Managed when unset, while the product requires Local to be a distinct, explicit mode.** Affects: CLI users who expect Local by default.. Evidence: apps/cli/src/config.rs:467-473.. Work needed: Confirm this is intended and state it in the CLI help [proposed].

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- mode:local
- mode:own-key
- mode:cloud
- surface:cli
- provider:ollama
- provider:lmstudio
- file:apps/cli/src/lib.rs

## Unknown

- Whether the CLI needs a sign-in for Local and own-key routes, and the exact plan rules per route.
- How saved sessions are deleted or archived by the CLI.
- Full offline behaviour of the full-screen screen.
- Contents of the tests broken_pipe.rs, terminal_escape_diagnostics.rs and normal_child_stdio.rs (only names seen).
- Exact visible labels in the full-screen screen (not enumerated).
