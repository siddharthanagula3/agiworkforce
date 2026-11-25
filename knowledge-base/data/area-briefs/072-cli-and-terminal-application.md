# Area 72. CLI and terminal application

37 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S72.01 Interactive terminal UI.
- Should: Running `agi` in a terminal opens a full-screen interactive UI with a composer, transcript and overlays that sends turns to the agent.
- Status: cli done
- Code: apps/cli/src/lib.rs:4609; apps/cli/src/tui/tui_app.rs:4508

## S72.02 Linear accessible output mode.
- Should: A linear, screen-reader-friendly mode prints output line by line with no colour, spinners, rules or full-screen redraws.
- Status: cli done
- Code: apps/cli/src/lib.rs:3181; apps/cli/src/lib.rs:4828; apps/cli/src/output.rs:43

## S72.03 Headless/noninteractive mode.
- Should: A prompt can run to completion without an interactive session (`agi exec` / `-p`) and the process exits.
- Status: cli done
- Code: apps/cli/src/lib.rs:727; apps/cli/src/lib.rs:3119

## S72.04 Standard input support.
- Should: Prompt text can be supplied on standard input (`--stdin`, `-` or auto-detected when stdin is not a TTY).
- Status: cli done
- Code: apps/cli/src/lib.rs:248; apps/cli/src/lib.rs:4256

## S72.05 Piped input.
- Should: Piped content (e.g. `git diff | agi "explain"`) is read and combined with the positional prompt and any --file context.
- Status: cli done
- Code: apps/cli/src/lib.rs:248; apps/cli/src/lib.rs:4256; apps/cli/src/lib.rs:4784

## S72.06 Plain-text output.
- Should: A one-shot run can print the bare response text with no spinner, cost line or formatting (`--raw`, `--print`, `--output-format text`).
- Status: cli done
- Code: apps/cli/src/lib.rs:257; apps/cli/src/lib.rs:5280

## S72.07 Structured JSON output.
- Should: A one-shot run can emit a single machine-readable JSON result (`--json` / `--output-format json`) with response, tokens, cost, duration and error state.
- Status: cli done
- Code: apps/cli/src/lib.rs:286; apps/cli/src/lib.rs:5241; apps/cli/src/lib.rs:561

## S72.08 Streaming JSON events.
- Should: A one-shot run can stream NDJSON events (session start, user message, text deltas, tool lifecycle, final message, end/error) as they happen.
- Status: cli done
- Code: apps/cli/src/lib.rs:518; apps/cli/src/lib.rs:5141

## S72.09 Exit-code contract.
- Should: Exit status distinguishes failure classes (1 generic, 65 data, 69 unavailable, 75 temporary, 76 too old, 77 not permitted, 78 configuration; 2 reserved for usage).
- Status: cli done
- Code: apps/cli/src/main.rs:2; apps/cli/src/lib.rs:5043; apps/cli/src/lib.rs:5062; apps/cli/src/lib.rs:5071

## S72.10 Authentication commands.
- Should: The CLI can sign in, sign out and show authentication status from the terminal (`agi login|logout|auth-status`, `/login`, `/logout`).
- Status: cli done
- Code: apps/cli/src/lib.rs:892; apps/cli/src/lib.rs:3937

## S72.11 Session list.
- Should: The user can list saved sessions and pick one (`/history` picker in the TUI, `agi history`, `agi session list`).
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3545; apps/cli/src/tui/tui_app.rs:2672; apps/cli/src/lib.rs:3864

## S72.12 Resume command.
- Should: The user can resume a previous session by picker, id or latest (`/resume`, `agi resume [id] [--cloud]`, `-c`).
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3550; apps/cli/src/tui/tui_app.rs:2708; apps/cli/src/lib.rs:3372

## S72.13 Branch command.
- Should: The user can branch the current or a saved session into a new one (`/fork`, `/branch`, `agi fork`, `agi session fork --at-turn`).
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3562; apps/cli/src/repl/registry.rs:932; apps/cli/src/lib.rs:2754

## S72.14 Model command.
- Should: The user can view and switch the model mid-session from the terminal (`/model` picker or `/model <id>`).
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3259; apps/cli/src/tui/tui_app.rs:2976

## S72.15 Effort command.
- Should: The user can set reasoning effort (low/medium/high/max) and it changes the next request.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3871; apps/cli/src/tui/tui_app.rs:5028

## S72.16 Permission command.
- Should: The user can change the permission mode and allow/deny rules from the terminal.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:2398; apps/cli/src/lib.rs:1203; apps/cli/src/lib.rs:2597

## S72.17 Context command.
- Should: A context command shows how much of the model context window the current conversation occupies.
- Status: cli done
- Code: apps/cli/src/compaction.rs:67; apps/cli/src/tui/tui_app.rs:3487; apps/cli/src/repl/slash_commands.rs:225

## S72.18 Usage command.
- Should: A usage command shows session tokens/cost and the account allowance from the shared usage ledger.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3897; apps/cli/src/usage_summary.rs:210; apps/cli/src/lib.rs:4049

## S72.19 Compact-context command.
- Should: A compact command summarises the conversation to free context, optionally with focus instructions, and reports before/after size.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3543; apps/cli/src/tui/tui_app.rs:4724

## S72.20 Tool/MCP commands.
- Should: The user can add, list, inspect, authenticate and remove MCP servers from the terminal and see connected tools.
- Status: cli done
- Code: apps/cli/src/lib.rs:785; apps/cli/src/lib.rs:2448; apps/cli/src/tui/tui_app.rs:3596

## S72.21 Skill/Plugin commands.
- Should: The user can list/toggle skills and list/install/update plugins from the terminal.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3687; apps/cli/src/tui/tui_app.rs:3932; apps/cli/src/lib.rs:3613; apps/cli/src/lib.rs:3986

## S72.22 Repository/folder selection.
- Should: The user can point a run at another repository or add extra working folders (`-C/--repo`, `--add-dir`, `/add-dir`).
- Status: cli done
- Code: apps/cli/src/lib.rs:413; apps/cli/src/lib.rs:2977; apps/cli/src/claude_parity.rs:144

## S72.23 File mentions.
- Should: Typing @ in the composer opens a fuzzy file picker and the mentioned files are inlined as context when sent.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:2508; apps/cli/src/tui/tui_app.rs:2800

## S72.24 Prompt history.
- Should: Previous prompts can be recalled (Up arrow / history search) and persist across runs.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:2595; apps/cli/src/tui/tui_app.rs:4653; apps/cli/src/tui/prompt_history.rs:43

## S72.25 Keyboard shortcuts.
- Should: The TUI has global keyboard shortcuts, lists them with /keybindings, and lets users rebind them in config.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:4078; apps/cli/src/tui/tui_app.rs:2398; apps/cli/src/keybindings.rs:1

## S72.26 Shell completion.
- Should: The CLI generates shell completion scripts for bash, zsh and fish.
- Status: cli done
- Code: apps/cli/src/lib.rs:804; apps/cli/src/lib.rs:3549

## S72.27 Theme selection.
- Should: The user can pick a terminal colour theme (picker or /theme <name>) and it applies and persists.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3818; apps/cli/src/tui/tui_app.rs:3826

## S72.28 No-color mode.
- Should: Setting NO_COLOR (or --plain) removes colour from all terminal output, including the TUI.
- Status: cli done
- Code: apps/cli/src/output.rs:43; apps/cli/src/lib.rs:3181

## S72.29 Terminal resize handling.
- Should: Resizing the terminal re-lays out the TUI without losing the transcript.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:4833; apps/cli/src/tui/tui_app.rs:4508; apps/cli/src/tui/tui_app.rs:6961

## S72.30 Remote-session attachment.
- Should: The terminal can attach to a session that lives elsewhere (another device, the cloud or a running remote agent) and continue it.
- Status: cli done
- Code: apps/cli/src/cloud/code_teleport.rs:69; apps/cli/src/lib.rs:2120; apps/cli/src/lib.rs:868

## S72.31 Background-task management.
- Should: The user can list, inspect and stop background tasks (sub-agents or long-running commands) from the terminal.
- Status: cli done
- Code: apps/cli/src/repl/registry.rs:419; apps/cli/src/repl/registry.rs:445; apps/cli/src/tui/tui_app.rs:4806; apps/cli/src/repl/slash_commands.rs:220

## S72.32 Export transcript.
- Should: The user can export the conversation transcript (Markdown/JSON) to a file or clipboard.
- Status: cli done
- Code: apps/cli/src/repl/registry.rs:375; apps/cli/src/repl/registry.rs:388; apps/cli/src/tui/tui_app.rs:3645; apps/cli/src/repl/registry.rs:408

## S72.33 Configuration-file support.
- Should: Settings are read from a global config file with per-project overrides and can be displayed.
- Status: cli done
- Code: apps/cli/src/tui/tui_app.rs:3486; apps/cli/src/config.rs:339; apps/cli/src/config.rs:361

## S72.34 Environment-variable support.
- Should: Environment variables override configuration (model, provider, max tokens, API base, plain mode) and the override is shown.
- Status: cli done
- Code: apps/cli/src/config.rs:1163; apps/cli/src/config.rs:1166; apps/cli/src/config.rs:863

## S72.35 Installer and updater.
- Should: The CLI can be installed via a published package/script and can check for and install updates itself.
- Status: cli partial
- Code: apps/web/public/install.sh:139; apps/cli/src/update_check.rs:221
- Unfinished: cli: Owner only: set AGI_CLI_RELEASE_SIGNING_KEY, publish the first signed release, then mark the CLI available (surface-status.ts:7).

## S72.36 Diagnostics command.
- Should: A diagnostics command checks the local setup and prints a human or JSON report.
- Status: cli done
- Code: apps/cli/src/lib.rs:901; apps/cli/src/doctor.rs:50

## S72.37 CI/scripting integration.
- Should: CI scripts can drive the CLI non-interactively with machine output, auto-approval policy, spend cap and meaningful exit codes.
- Status: cli done
- Code: apps/cli/src/lib.rs:477; apps/cli/src/lib.rs:386; apps/cli/src/lib.rs:5122; apps/cli/src/lib.rs:4826
