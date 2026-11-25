---
id: "AREA-072"
type: "area"
title: "CLI and terminal application"
features: ["F072-01", "F072-02", "F072-03", "F072-04", "F072-05", "F072-06", "F072-07", "F072-08", "F072-09", "F072-10", "F072-11", "F072-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 72. CLI and terminal application

The CLI is the `agi` command in a terminal. It gives a person an AI coding and task agent that works on the files in a folder, with a full-screen chat screen or a plain line mode. It can also run one prompt and exit, which lets scripts and CI use it, and it can resume, fork, and export saved sessions. It matters because the same agent can run on the user's own machine, on the user's own provider key, or on the managed cloud service.

**Who uses it.** Every terminal user who installs the binary, because local and own-key runs need no account (apps/cli/src/usage_summary.rs:343-356 says account usage needs `agi login`). Cloud features need a signed-in account: account usage, cloud session attach, and `--auto` model routing (apps/cli/src/lib.rs:478 says `--auto` applies only to managed-cloud sessions). Scripts and CI jobs use the one-shot and exit-code features (apps/cli/src/lib.rs:5122 area, the `exec` and `-p` paths). People who need a screen reader use plain or screen-reader mode (apps/cli/src/lib.rs:442-448). Developers change this area. The code does not show a paid-plan gate on most commands in this area; that is listed under not_sure.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F072-01](F072-01-full-screen-terminal-chat-screen.md) | Full-screen terminal chat screen | n/a | n/a | n/a | built | n/a | n/a |
| [F072-02](F072-02-keys-composer-and-file-mentions.md) | Keys, composer and @ file mentions | n/a | n/a | n/a | built | n/a | n/a |
| [F072-03](F072-03-saved-sessions-list-resume-fork-export.md) | Saved sessions: list, resume, fork, export | n/a | n/a | n/a | built | n/a | n/a |
| [F072-04](F072-04-model-effort-and-permission-controls.md) | Model, effort and permission controls | n/a | n/a | n/a | built | n/a | n/a |
| [F072-05](F072-05-context-usage-and-compaction.md) | Context, usage and compaction | n/a | n/a | n/a | built | n/a | n/a |
| [F072-06](F072-06-tools-skills-plugins-and-background-runs.md) | Tools, skills, plugins and background runs | n/a | n/a | n/a | built | n/a | n/a |
| [F072-07](F072-07-one-shot-and-scripted-runs-with-output-formats.md) | One-shot and scripted runs with output formats | n/a | n/a | n/a | built | n/a | n/a |
| [F072-08](F072-08-exit-codes-and-ci-automation.md) | Exit codes and CI automation | n/a | n/a | n/a | built | n/a | n/a |
| [F072-09](F072-09-plain-and-screen-reader-output-no-colour.md) | Plain and screen-reader output, no colour | n/a | n/a | n/a | built | n/a | n/a |
| [F072-10](F072-10-sign-in-settings-folders-and-environment.md) | Sign-in, settings, folders and environment | n/a | n/a | n/a | built | n/a | n/a |
| [F072-11](F072-11-install-update-diagnostics-and-shell-completion.md) | Install, update, diagnostics and shell completion | n/a | n/a | n/a | partly | n/a | n/a |
| [F072-12](F072-12-remote-session-attachment.md) | Remote session attachment | n/a | n/a | n/a | built | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/072-cli-and-terminal-application.md](../../10-requirements/capabilities/072-cli-and-terminal-application.md).

## How this area works in the code

1. **Process start.** The binary's main calls the library entry, which builds a multi-thread async runtime and runs the main routine. Special subcommands are handled before the runtime starts. (`apps/cli/src/main.rs:1-3`, `apps/cli/src/lib.rs:8797-8806`)
2. **Parse the command line.** Clap reads all flags into one struct: prompt, --stdin, --raw, --output-format, --plain, --screen-reader, -C, --add-dir, --max-budget-usd, --auto, and so on. Subcommands live in a second enum. (`apps/cli/src/lib.rs:227-242`, `apps/cli/src/lib.rs:280-290`, `apps/cli/src/lib.rs:421-421`, `apps/cli/src/lib.rs:439-448`, `apps/cli/src/lib.rs:478-491`, `apps/cli/src/lib.rs:764-770`)
3. **Set the output mode.** Plain mode turns on from the flag, from AGI_PLAIN, or from screen-reader mode. The choice is stored in a global flag that every print call reads. (`apps/cli/src/lib.rs:5943-5951`, `apps/cli/src/output.rs:43-59`)
4. **Load settings.** If the folder is trusted, the merged loader reads the global and project config files. If not, only the global file is read. Environment overrides are applied after the file. (`apps/cli/src/lib.rs:6185-6189`, `apps/cli/src/config.rs:496-498`, `apps/cli/src/config.rs:525-545`, `apps/cli/src/config.rs:1634-1670`)
5. **Pick the front end.** A one-shot prompt (exec, -p, a prompt argument, or piped input) runs and exits. Plain mode or --no-tui runs the line REPL. Otherwise the full-screen screen opens. (`apps/cli/src/lib.rs:574-592`, `apps/cli/src/lib.rs:8117`, `apps/cli/src/lib.rs:8295-8300`, `apps/cli/src/tui/tui_app.rs:6882-6900`)
6. **Read input and slash commands.** Each key or paste event goes through the key handler. A line that starts with `/` goes to the slash-command handler; other text is sent as a turn after @ mentions are expanded. (`apps/cli/src/tui/tui_app.rs:1556-1557`, `apps/cli/src/tui/tui_app.rs:7283-7290`, `apps/cli/src/tui/tui_app.rs:3877-3900`, `apps/cli/src/tui/tui_app.rs:5536-5553`, `apps/cli/src/tui/tui_app.rs:4541-4550`)
7. **Send the turn to the chosen provider path.** The session sends the turn to the local, own-key or managed-cloud route chosen by the config and the model. Cloud calls go to the account API base, which is https://agiworkforce.com/api by default. (`apps/cli/src/auth.rs:1020`, `apps/cli/src/models/streaming.rs:484`, `apps/cli/src/usage_summary.rs:358-366`)
8. **Save the session and prompt.** Session records go under the config folder. Each prompt is appended to history.txt. (`apps/cli/src/sessions.rs:205-235`, `apps/cli/src/tui/prompt_history.rs:15-18`, `apps/cli/src/tui/prompt_history.rs:46-56`)
9. **Write the result and exit.** One-shot modes print text, a pretty JSON object, or stream events to stdout. A failure exits with the code for its class. Errors print to stderr. (`apps/cli/src/lib.rs:9415-9431`, `apps/cli/src/lib.rs:9455-9460`, `apps/cli/src/lib.rs:8550-8553`, `apps/cli/src/lib.rs:8829-8845`, `apps/cli/src/errors.rs:262-280`)

## Files to know

| File | Role |
|---|---|
| `apps/cli/src/lib.rs` | Flag definitions (Cli struct), subcommand enum (Command), one-shot runs, JSON and stream output, exit-code mapping, and top-level dispatch. |
| `apps/cli/src/tui/tui_app.rs` | Full-screen chat screen: event loop, key handling, slash-command dispatch (handle_slash), overlays, and status bar. |
| `apps/cli/src/repl/registry.rs` | Line-mode slash commands and the display helpers for sessions, export, permissions and tasks, shared with the screen. |
| `apps/cli/src/config.rs` | Global and project config layers, trust and consent gates, environment overrides, and project-level writes such as /effort and /theme. |
| `apps/cli/src/errors.rs` | Maps each error to an exit class and the exit code; builds the JSON error object. |
| `apps/cli/src/output.rs` | Global plain-output flag, colour level detection, and the shared print helpers. |
| `apps/cli/src/keybindings.rs` | Default global key chords and the rules for user rebinding under [ui.keybindings]. |
| `apps/cli/src/sessions.rs` | Saved session store under the config folder (managed_sessions and metadata folders). |
| `apps/cli/src/usage_summary.rs` | Account usage fetch from /api/usage and the local-only messages for BYOK and signed-out runs. |
| `apps/cli/src/update_check.rs` | Newest-release check against /api/releases/cli/latest and the install-by-script path. |
| `apps/web/public/install.sh` | Installer script with the release public key pinned in it; checks the signed checksum manifest. |
| `apps/cli/src/cloud/code_teleport.rs` | Checks out a cloud session's branch in the local repository for `agi resume --teleport`. |

## What is stored

- Global settings (config.toml): model, provider, theme, effort, UI and keybinding settings, update checks: config.toml in ~/.agiworkforce, or in AGIWORKFORCE_HOME (apps/cli/src/config.rs:480-492)
- Project settings (.agiworkforce/config.toml): project defaults written by /effort and /theme: Repository folder, .agiworkforce/config.toml (apps/cli/src/config.rs:531-533; apps/cli/src/config.rs:1144, 1263)
- Prompt history, one line per prompt: history.txt in the config folder (apps/cli/src/tui/prompt_history.rs:15-18)
- Saved sessions and their metadata: managed_sessions and managed_session_metadata folders in the config folder (apps/cli/src/sessions.rs:205-235, 50; apps/cli/src/platform/runtime/session_control.rs)
- Sign-in credentials and provider API keys: OS keychain on macOS and Windows; owner-only auth.json in the config folder on Linux (apps/cli/src/secure_store.rs:1-21; apps/cli/src/auth.rs:89)
- Cached plan tier and plan model list: cache/tier.toml and plan-models.toml in the config folder (apps/cli/src/tier_cache.rs:50, 441)
- MCP server registry: ~/.agiworkforce/mcp.json (apps/cli/src/lib.rs:827-828 help text)
- Plugin settings: plugin-settings.json, under the features/plugins settings module (apps/cli/src/features/plugins/settings.rs:13)
- Background run record and log: run.json and output.log, written by the background module (apps/cli/src/background.rs:6-7); the exact folder was not traced
- Exported transcript files: A path chosen by the user, resolved from the workspace root (apps/cli/src/repl/registry.rs, export_conversation_to_file)
- Git worktrees for sessions run with --worktree: .agiworkforce/worktrees in the repository (apps/cli/src/platform/runtime/worktree.rs:98)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **--plain flag and AGI_PLAIN environment variable**: Turns on plain output and the line REPL instead of the full-screen screen; no colour, spinners or rules. (apps/cli/src/lib.rs:439-440, 5949-5951, 8295; apps/cli/src/output.rs:56-59)
- **--screen-reader flag, AGI_SCREEN_READER, ui.screen_reader in config**: Plain output with labelled lines, typed menu answers and a bell for input. (apps/cli/src/lib.rs:442-448, 5943-5947; apps/cli/src/output.rs:82-87; apps/cli/src/config.rs:1668-1672)
- **--no-tui flag**: Runs the line REPL instead of the full-screen screen. (apps/cli/src/lib.rs:364, 8295)
- **NO_COLOR environment variable**: Sets colour level to none in one function; the TUI icon set switches to ASCII. (apps/cli/src/output.rs:99-100 (colour level); apps/cli/src/tui/icons.rs:34)
- **TERM=dumb**: Uses ASCII icons. (apps/cli/src/tui/icons.rs:34)
- **AGIWORKFORCE_HOME**: Moves the config folder; must be an absolute path. (apps/cli/src/config.rs:481, 1701-1713)
- **AGIWORKFORCE_MODEL, AGIWORKFORCE_PROVIDER, AGIWORKFORCE_MAX_TOKENS**: Override the default model, provider and token limit. (apps/cli/src/config.rs:1637-1660)
- **AGIWORKFORCE_API_BASE**: Changes the account API base for cloud calls; shown by /config. (apps/cli/src/auth.rs:1020; apps/cli/src/config.rs:1662-1666; apps/cli/src/models/streaming.rs:484; apps/cli/src/remote_control/mod.rs:163)
- **AGIWORKFORCE_JWT**: Supplies the account token directly; checked before the auth store. (apps/cli/src/tier_cache.rs (load_jwt, around line 950))
- **AGIWORKFORCE_NO_KEYRING**: Stores credentials in owner-only files instead of the OS keychain. (apps/cli/src/secure_store.rs:14-21)
- **Project trust and managed policy allow_project_config**: Decides whether the project config file is read at all. (apps/cli/src/lib.rs:6185-6189; apps/cli/src/config.rs:826-844)
- **Consent gate for non-loopback provider URLs in a project file**: A project file cannot send prompts to a remote provider URL until the user consents. (apps/cli/src/config.rs:684-700)
- **--auto flag**: Automatic model routing; conflicts with --model and --provider; managed-cloud only. (apps/cli/src/lib.rs:474-478)
- **--max-budget-usd flag**: Stops a run when spend passes the limit. (apps/cli/src/lib.rs:489-491; apps/cli/src/lib.rs:9244-9250)
- **--mode flag (default, plan, auto, bypassPermissions, dontAsk)**: Sets the approval mode for the run. (apps/cli/src/cli_options.rs:12-25)
- **AGI_TEAM environment variable and --team flag**: Turns team mode on. (apps/cli/src/lib.rs:342, 8291-8292)
- **updates.check_on_startup config value**: Turns the startup update check on or off. (apps/cli/src/update_check.rs:131; apps/cli/src/config.rs:3696-3723)
- **ui.keybindings table in config.toml**: Rebinds the global keys; invalid or duplicate bindings are refused. (apps/cli/src/keybindings.rs:1-6, 191-236)
- **Managed-cloud usage gate (BYOK accounts)**: BYOK accounts see a local-only usage note instead of account usage. (apps/cli/src/usage_summary.rs:343-356)

## Shared between apps

Apps/cli is one Rust package, `agiworkforce-cli`, which builds the `agi` and `agiworkforce` binaries (apps/cli/Cargo.toml). It depends on these shared crates under crates/: agiworkforce-agent-core, agiworkforce-app-server, agiworkforce-llm, agiworkforce-model-registry, agiworkforce-mcp, agiworkforce-protocol, agiworkforce-sandbox-policy, agiworkforce-execpolicy, agiworkforce-command-registry, agiworkforce-utils-image, agiworkforce-worktree (apps/cli/Cargo.toml). The app-server module (`agi app-server`, apps/cli/src/lib.rs:860) is the same surface that IDE integrations use, so changes there reach other apps. Everything in apps/cli/src (the screen, line REPL, slash commands, config, sessions, exit codes) is CLI-only. The installer (apps/web/public/install.sh) and the surface status (apps/web/lib/surface-status.ts) live in the web app. The account API the CLI calls is served from the web app under /api (apps/cli/src/auth.rs:1020). Other apps do not run this code.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- NO_COLOR does not remove colour from the full-screen screen. The brief says it does. The colour function that reads NO_COLOR has no caller outside its own tests, and the screen opens unless plain mode is on, so NO_COLOR alone changes only the icon set. (apps/cli/src/output.rs:91-108 (function at :95, no caller outside tests); apps/cli/src/lib.rs:5949-5951 and :8295 (plain mode is the only switch that opens the line REPL); apps/cli/src/tui/icons.rs:34)
- /export has no clipboard path. The brief says export goes to a file or the clipboard. With no path, the text is shown in the chat only. (apps/cli/src/tui/tui_app.rs:6033-6043)
- Ctrl+R reverse history search is documented but not in the full-screen screen. The screen supports Up and Down only. The brief's item says `Up arrow / history search`. (apps/cli/src/command_registry.rs:281-282; apps/cli/src/repl/mod.rs:1070; apps/cli/src/tui/tui_app.rs:4179-4200)
- A failed run in JSON output mode prints the error JSON to stderr, and stdout stays empty. The brief says the one JSON result carries the error state. (apps/cli/src/lib.rs:9455-9460)
- Interrupt exits with code 130, which is outside the documented exit contract (1, 65, 69, 75, 76, 77, 78). (apps/cli/src/lib.rs:8633-8637)
- Several brief line citations point at unrelated code. Examples: lib.rs:3181 is the cloud model chooser (the brief cites it for linear output); lib.rs:4784 is the models-set command (cited for piped input); tui_app.rs:3545 is inside the status bar (cited for /history); config.rs:339 is an update check helper (cited for config file support). The brief's citations were not reliable for locating code. (apps/cli/src/lib.rs:3175-3181; apps/cli/src/lib.rs:4781-4784; apps/cli/src/tui/tui_app.rs:3467-3545; apps/cli/src/config.rs:332-339)
- /effort also saves the level as the project default, not only for the next request. The brief describes only the next request. (apps/cli/src/tui/tui_app.rs:6452-6470)
- Stale dead-code allowances. load_merged and load_project_config carry #[allow(dead_code)], but load_merged is called at runtime from the main run path. The annotation hides nothing. (apps/cli/src/config.rs:526-527 and :688-689; apps/cli/src/lib.rs:6186)
- sessions::open_db is a name for a folder-based store, not a database. It creates folders and JSON files under the config folder. (apps/cli/src/sessions.rs:205-235)

## Not established

- Nothing was built, run or tested. Every statement comes from reading the code.
- Whether the colour crate the CLI uses also reads NO_COLOR on its own. Not checked.
- Whether resizing the full-screen screen re-lays out correctly in a real terminal. The main loop ignores resize events and relies on a redraw each frame; not run.
- Whether the empty state and waiting state of each picker match the brief. Not traced in full.
- Whether paid plans gate the model picker, `--auto`, cloud sessions and background runs. The code shows the managed-cloud routing tier and the BYOK usage note, but not a full plan gate for each command.
- Whether the installer and update path work end to end. The public key is pinned in install.sh, but the release secret and the first published release are not visible in the code. The brief marks the CLI partial, and surface-status.ts shows Coming soon.
- Where background run files live on disk (apps/cli/src/background.rs was not traced for its folder).
- Whether the cost ledger is saved to disk or lives only in memory for the session.
- Whether the mobile remote-control host (`agi remote-control`) works end to end; only its dispatch was read (apps/cli/src/lib.rs:6659-6679).
- Whether prompt history is redacted before it is written to history.txt. Not checked.
- Which slash commands the full-screen screen and the line REPL share, and which differ. Only the main ones were compared.
- The brief's line numbers were largely wrong, so every citation in this report was checked by reading the file. Items from the brief that were not checked: S72.05 piped input details beyond stdin handling, S72.27 theme persistence beyond the write call, and S72.31 background stop behaviour.
