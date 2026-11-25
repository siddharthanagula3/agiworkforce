---
id: "PLAN-cli-072"
type: "test-plan"
title: "CLI · 72. CLI and terminal application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "72"
---
# CLI · 72. CLI and terminal application

37 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S72.01 Interactive terminal UI.

- **Expected:** Running `agi` in a terminal opens a full-screen interactive UI with a composer, transcript and overlays that sends turns to the agent.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:8321; apps/cli/src/tui/tui_app.rs:4508 (quoted code not found in the file now)
- **Where to find it:** Type agi in a terminal with no arguments, then the start screen line "Type / for commands" (labels found in the code)
- **Needs:** a signed-in AGI account (agi login) or a saved provider key
- **Steps:**
  1. Open Terminal, go to any project folder and type agi, then press Enter.
  2. Look for a full-screen screen with a composer at the bottom and the start hint line that says "for commands".
  3. Type a short question such as "say hello" and press Enter.
  4. Look for your message and an answer in the transcript above the composer, and compare with Expected.

## S72.02 Linear accessible output mode.

- **Expected:** A linear, screen-reader-friendly mode prints output line by line with no colour, spinners, rules or full-screen redraws.
- **Code:** done. Evidence present: apps/cli/src/lib.rs (text found, layout changed); apps/cli/src/lib.rs:8295; apps/cli/src/output.rs:44
- **Where to find it:** agi --plain exec "<your question>" in a terminal (--plain is the flag; AGI_SCREEN_READER is an environment variable with no screen control) (labels found in the code)
- **Needs:** a signed-in AGI account or a provider key
- **Steps:**
  1. In Terminal, type agi --plain exec "say hello in one line" and press Enter.
  2. Look for plain text only: no colour, no spinner, no horizontal rules and no full-screen redraw.
  3. Compare the lines printed with the ones that appear one after another in order.

## S72.03 Headless/noninteractive mode.

- **Expected:** A prompt can run to completion without an interactive session (`agi exec` / `-p`) and the process exits.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:765; apps/cli/src/lib.rs:1844
- **Where to find it:** agi exec "<your prompt>" in a terminal (alias agi e) (labels found in the code)
- **Needs:** a signed-in AGI account or a provider key
- **Steps:**
  1. In Terminal, type agi exec "say hello in one word" and press Enter.
  2. Look for the answer printed and the shell prompt returning on its own, with no full-screen UI.
  3. Type echo $? and press Enter; expect 0 after a successful run.

## S72.04 Standard input support.

- **Expected:** Prompt text can be supplied on standard input (`--stdin`, `-` or auto-detected when stdin is not a TTY).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:240; apps/cli/src/lib.rs:7982
- **Where to find it:** echo "<your prompt>" | agi --stdin in a terminal, or echo "<your prompt>" | agi - (labels found in the code)
- **Needs:** a signed-in AGI account or a provider key
- **Steps:**
  1. In Terminal, type echo "say hello in one word" | agi --stdin and press Enter.
  2. Look for the answer printed and the shell prompt returning.
  3. Compare with Expected: the prompt text came from stdin, not from the command line.

## S72.05 Piped input.

- **Expected:** Piped content (e.g. `git diff | agi "explain"`) is read and combined with the positional prompt and any --file context.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:240; apps/cli/src/lib.rs:8669; apps/cli/src/lib.rs:8513
- **Where to find it:** git diff | agi "explain this diff" in a git folder with an uncommitted change (labels found in the code)
- **Needs:** a git project with an uncommitted change, and a signed-in AGI account
- **Steps:**
  1. Make a small change to a tracked file in a git project.
  2. In Terminal, type git diff | agi "explain this diff" and press Enter.
  3. Look for an answer that talks about the change you made, and that the prompt text and the diff were both used.
  4. Optionally run agi -f <a file> "summarize" and check the answer uses that file.

## S72.06 Plain-text output.

- **Expected:** A one-shot run can print the bare response text with no spinner, cost line or formatting (`--raw`, `--print`, `--output-format text`).
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:248; apps/cli/src/lib.rs:5280 (quoted code not found in the file now)
- **Where to find it:** agi --raw "<your prompt>" in a terminal (also agi --print or agi --output-format text) (labels found in the code)
- **Needs:** a signed-in AGI account or a provider key
- **Steps:**
  1. In Terminal, type agi --raw "say hello in one word" and press Enter.
  2. Look for only the answer text: no spinner, no cost line and no formatting.
  3. Compare with Expected.

## S72.07 Structured JSON output.

- **Expected:** A one-shot run can emit a single machine-readable JSON result (`--json` / `--output-format json`) with response, tokens, cost, duration and error state.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:280; apps/cli/src/lib.rs:9416; apps/cli/src/lib.rs:613
- **Where to find it:** agi exec --json "<your prompt>" in a terminal (or agi --output-format json "<your prompt>") (labels found in the code)
- **Needs:** a signed-in AGI account or a provider key
- **Steps:**
  1. In Terminal, type agi exec --json "say hello in one word" and press Enter.
  2. Look for one JSON object printed on its own.
  3. Check the object has the answer and fields for tokens, cost, duration and error state, and compare with Expected.

## S72.08 Streaming JSON events.

- **Expected:** A one-shot run can stream NDJSON events (session start, user message, text deltas, tool lifecycle, final message, end/error) as they happen.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:563; apps/cli/src/lib.rs:9300
- **Where to find it:** agi --output-format stream-json "<your prompt>" in a terminal (labels found in the code)
- **Needs:** a signed-in AGI account or a provider key
- **Steps:**
  1. In Terminal, type agi --output-format stream-json "say hello in one word" and press Enter.
  2. Look for one JSON event per line appearing while the answer is being produced.
  3. Compare the events with Expected: session start, user message, text, tool events, final message and end or error.

## S72.09 Exit-code contract.

- **Expected:** Exit status distinguishes failure classes (1 generic, 65 data, 69 unavailable, 75 temporary, 76 too old, 77 not permitted, 78 configuration; 2 reserved for usage).
- **Code:** done. Evidence present: apps/cli/src/main.rs:2; apps/cli/src/lib.rs:8797; apps/cli/src/lib.rs:8829; apps/cli/src/lib.rs:8838
- **Where to find it:** no screen of its own. The mapping is in the code (exit code per error class); the exact code for each situation was not run.
- **Needs:** a signed-out state (agi logout) and a terminal
- **Steps:**
  1. Run agi exec "hello" while signed out and with no provider key.
  2. Type echo $? and press Enter.
  3. Compare the number with Expected: 77 for not permitted, or 78 for a configuration problem.

## S72.10 Authentication commands.

- **Expected:** The CLI can sign in, sign out and show authentication status from the terminal (`agi login|logout|auth-status`, `/login`, `/logout`).
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:892 (quoted code not found in the file now); apps/cli/src/lib.rs:7270
- **Where to find it:** agi login, agi logout, agi auth-status in a terminal; /login, /logout and /status in the TUI (labels found in the code)
- **Needs:** an AGI account; the browser sign-in step needs a web browser
- **Steps:**
  1. In Terminal, type agi auth-status and press Enter; note the account line.
  2. Type agi login and follow the browser sign-in prompt, then run agi auth-status again.
  3. Type agi logout and press Enter, then agi auth-status; expect a signed-out line.
  4. Compare with Expected.

## S72.11 Session list.

- **Expected:** The user can list saved sessions and pick one (`/history` picker in the TUI, `agi history`, `agi session list`).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5997; apps/cli/src/tui/tui_app.rs:4304; apps/cli/src/lib.rs:7209
- **Where to find it:** /history in the TUI (picker titled Sessions); agi history in a terminal (labels found in the code)
- **Needs:** at least one earlier session on this device
- **Steps:**
  1. Run one prompt in agi so a session exists, then exit with Ctrl+D twice.
  2. Start agi again and type /history, then press Enter.
  3. Look for the picker titled Sessions listing saved sessions; use the arrow keys to move and press Esc to close.
  4. In a second Terminal window, type agi history and press Enter; compare the list with the picker.

## S72.12 Resume command.

- **Expected:** The user can resume a previous session by picker, id or latest (`/resume`, `agi resume [id] [--cloud]`, `-c`).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:6002; apps/cli/src/tui/tui_app.rs:2708 (quoted code not found in the file now); apps/cli/src/lib.rs:3372 (quoted code not found in the file now)
- **Where to find it:** /resume in the TUI; agi resume in a terminal; agi -c for the newest session in this folder (labels found in the code)
- **Needs:** at least one earlier session
- **Steps:**
  1. Start agi and type /resume, then press Enter.
  2. In the Sessions picker, use the arrow keys to choose a session and press Enter.
  3. Look for a notice that says Resumed session with the message count, and the earlier messages in the transcript.
  4. Compare with Expected.

## S72.13 Branch command.

- **Expected:** The user can branch the current or a saved session into a new one (`/fork`, `/branch`, `agi fork`, `agi session fork --at-turn`).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6014; apps/cli/src/repl/registry.rs:1353; apps/cli/src/lib.rs:5691
- **Where to find it:** /fork or /branch in the TUI; agi fork <session id> in a terminal (labels found in the code)
- **Needs:** an existing conversation with at least one message
- **Steps:**
  1. In a session with at least one exchange, type /fork and press Enter.
  2. Look for a new session created from this one, with the earlier messages copied in.
  3. Type /history and press Enter to see both sessions listed.

## S72.14 Model command.

- **Expected:** The user can view and switch the model mid-session from the terminal (`/model` picker or `/model <id>`).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5558; apps/cli/src/tui/tui_app.rs:5059
- **Where to find it:** /model in the TUI (opens the model picker); /model <id> to set it directly (labels found in the code)
- **Needs:** a signed-in AGI account with more than one model available
- **Steps:**
  1. Start agi and type /model, then press Enter.
  2. Use the arrow keys to choose another model and press Enter.
  3. Look for the banner Model changed to followed by the model name.
  4. Send a short prompt and compare with Expected.

## S72.15 Effort command.

- **Expected:** The user can set reasoning effort (low/medium/high/max) and it changes the next request.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6452; apps/cli/src/tui/tui_app.rs:6431
- **Where to find it:** /effort in the TUI (opens the picker titled Effort); /effort low, /effort med, /effort high from the composer (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Start agi and type /effort, then press Enter.
  2. Look for the picker titled Effort; use the arrow keys or Tab to choose low, medium, high or max, then press Enter.
  3. Look for the notice Effort set to followed by the chosen level.
  4. Send a short prompt and compare with Expected.

## S72.16 Permission command.

- **Expected:** The user can change the permission mode and allow/deny rules from the terminal.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2721; apps/cli/src/lib.rs:1890; apps/cli/src/lib.rs:5418
- **Where to find it:** /permissions in the TUI (aliases /perms, /approvals); Shift+Tab to cycle the permission mode (labels found in the code)
- **Steps:**
  1. Start agi and type /permissions, then press Enter.
  2. Look for the line Permissions: followed by Recently denied, Allow, Ask, Deny and Workspace.
  3. Press Shift+Tab and watch the mode change.
  4. Compare with Expected.

## S72.17 Context command.

- **Expected:** A context command shows how much of the model context window the current conversation occupies.
- **Code:** done. Evidence present: apps/cli/src/compaction.rs:69; apps/cli/src/tui/tui_app.rs:5820; apps/cli/src/repl/slash_commands.rs:278
- **Where to find it:** /context (or /ctx) in the TUI (labels found in the code)
- **Needs:** a conversation with several messages
- **Steps:**
  1. In a conversation with several messages, type /context and press Enter.
  2. Look for a report of how full the context window is.
  3. If the conversation is near full, look for the notice Context is N% full.
  4. Compare with Expected.

## S72.18 Usage command.

- **Expected:** A usage command shows session tokens/cost and the account allowance from the shared usage ledger.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3897 (quoted code not found in the file now); apps/cli/src/usage_summary.rs:210 (quoted code not found in the file now); apps/cli/src/lib.rs:7680
- **Where to find it:** /usage in the TUI (opens the Usage panel) (labels found in the code)
- **Needs:** a signed-in AGI account
- **Steps:**
  1. Start agi and type /usage, then press Enter.
  2. Look for the panel titled Usage showing session tokens and cost and the account allowance.
  3. Press Esc to close the panel (it says Esc to close).
  4. Compare with Expected.

## S72.19 Compact-context command.

- **Expected:** A compact command summarises the conversation to free context, optionally with focus instructions, and reports before/after size.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5995; apps/cli/src/tui/tui_app.rs:7757
- **Where to find it:** /compact [focus words] in the TUI (labels found in the code)
- **Needs:** a long conversation
- **Steps:**
  1. In a long conversation, type /compact and press Enter; or type /compact keep the database decisions and press Enter.
  2. Look for the summary step finish and a report of the size before and after.
  3. Compare with Expected.

## S72.20 Tool/MCP commands.

- **Expected:** The user can add, list, inspect, authenticate and remove MCP servers from the terminal and see connected tools.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:827; apps/cli/src/lib.rs:5096; apps/cli/src/tui/tui_app.rs:3596 (quoted code not found in the file now)
- **Where to find it:** agi mcp list and agi mcp add <name> in a terminal; /mcp in the TUI (labels found in the code)
- **Needs:** an MCP server to add, or none to list
- **Steps:**
  1. In a terminal, type agi mcp list and press Enter; note the servers shown.
  2. Type /mcp in the TUI and press Enter; look for the connected servers and tools.
  3. Compare with Expected. Add, inspect, authenticate and remove were not run.

## S72.21 Skill/Plugin commands.

- **Expected:** The user can list/toggle skills and list/install/update plugins from the terminal.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:718; apps/cli/src/tui/tui_app.rs:6540; apps/cli/src/lib.rs:6766; apps/cli/src/lib.rs:3986 (quoted code not found in the file now)
- **Where to find it:** /skills and /plugins in the TUI; agi plugin in a terminal (labels found in the code)
- **Needs:** none to list; a plugin to install or update
- **Steps:**
  1. Start agi and type /skills, then press Enter; look for the skills list with on and off toggles.
  2. Type /plugins and press Enter; look for the plugins list.
  3. In a terminal type agi plugin and press Enter; compare the list with the TUI.

## S72.22 Repository/folder selection.

- **Expected:** The user can point a run at another repository or add extra working folders (`-C/--repo`, `--add-dir`, `/add-dir`).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:421; apps/cli/src/lib.rs:5971; apps/cli/src/claude_parity.rs:221
- **Where to find it:** agi -C <folder> "<prompt>" in a terminal; agi --add-dir <folder> "<prompt>"; /add-dir <folder> in the REPL (labels found in the code)
- **Needs:** two folders on this Mac
- **Steps:**
  1. In a terminal, type agi -C ~/some/other/folder and press Enter, then ask what folder it is in.
  2. Type agi --add-dir <another folder> "list the files in it" and press Enter.
  3. Compare the answer with the folder named.

## S72.23 File mentions.

- **Expected:** Typing @ in the composer opens a fuzzy file picker and the mentioned files are inlined as context when sent.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4130; apps/cli/src/tui/tui_app.rs:4544
- **Where to find it:** Type @ in the composer of the TUI (opens the Files popup) (labels found in the code)
- **Needs:** a project folder with files
- **Steps:**
  1. Start agi in a project folder.
  2. Type @ at the start of a word and look for the popup headed Files.
  3. Type part of a file name to filter it, press Enter to pick it, then send a question about the file.
  4. Check the answer uses the content of the chosen file.

## S72.24 Prompt history.

- **Expected:** Previous prompts can be recalled (Up arrow / history search) and persist across runs.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:2595 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:7384; apps/cli/src/tui/prompt_history.rs:52
- **Where to find it:** Up and Down arrows in the TUI composer; history persists across runs (labels found in the code)
- **Steps:**
  1. Start agi, type a prompt such as hello one and press Enter, then exit with Ctrl+D twice.
  2. Start agi again and press the Up arrow in the empty composer.
  3. Look for hello one appearing in the composer.
  4. Compare with Expected.

## S72.25 Keyboard shortcuts.

- **Expected:** The TUI has global keyboard shortcuts, lists them with /keybindings, and lets users rebind them in config.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6704; apps/cli/src/tui/tui_app.rs:2717; apps/cli/src/keybindings.rs:3
- **Where to find it:** /keys or /keybindings in the TUI; config in the file ~/.agiworkforce/config.toml under [ui.keybindings] (labels found in the code)
- **Needs:** none; a config file to rebind
- **Steps:**
  1. Start agi and type /keys, then press Enter.
  2. Look for the heading Keybindings and the list of actions with their keys.
  3. Compare with the bindings in ~/.agiworkforce/config.toml under [ui.keybindings] (rebinding is done there).
  4. Compare with Expected.

## S72.26 Shell completion.

- **Expected:** The CLI generates shell completion scripts for bash, zsh and fish.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:850; apps/cli/src/lib.rs:6632
- **Where to find it:** Terminal: agi completion bash (also zsh or fish) (labels found in the code)
- **Steps:**
  1. Open a terminal and type `agi completion bash`, then press Enter.
  2. Look for a printed bash completion script for the agi command (a function and a complete line for agi).
  3. Repeat with `agi completion zsh` and `agi completion fish`.
  4. Compare: each shell prints its own script with no error, as Expected says.

## S72.27 Theme selection.

- **Expected:** The user can pick a terminal colour theme (picker or /theme <name>) and it applies and persists.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6375; apps/cli/src/tui/tui_app.rs:5268
- **Where to find it:** Terminal: agi, then type /theme and press Enter (labels found in the code)
- **Steps:**
  1. Type `agi` and press Enter to open the full-screen app.
  2. Type `/theme` and press Enter to open the theme picker.
  3. Press Down or j to move to another row (for example High Contrast Dark), then press Enter.
  4. Look for the message `Theme set to <name>, saved in <path>.` and for the screen colours changing. Quit and run `agi` again to check the theme is kept. Compare with Expected.

## S72.28 No-color mode.

- **Expected:** Setting NO_COLOR (or --plain) removes colour from all terminal output, including the TUI.
- **Code:** done. Evidence present: apps/cli/src/output.rs:44; apps/cli/src/lib.rs (text found, layout changed)
- **Where to find it:** Terminal: agi --plain (or NO_COLOR=1 agi) (labels found in the code)
- **Steps:**
  1. Type `agi --plain` and press Enter.
  2. Type a short question and look for plain text with no coloured words, no spinner and no box rules.
  3. Optionally type `NO_COLOR=1 agi` and press Enter, then check the colours in the full-screen app.

## S72.29 Terminal resize handling.

- **Expected:** Resizing the terminal re-lays out the TUI without losing the transcript.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:7193; apps/cli/src/tui/tui_app.rs:4508 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:11638
- **Where to find it:** no screen of its own. Resizing is handled by the terminal redraw; no control exists. The matching regression test name is in apps/cli/src/tui/tui_app.rs but is not a visible word, so it is not used as a label.
- **Steps:**
  1. Type `agi` and press Enter, then send one short question so the transcript has text.
  2. Drag a corner of the terminal window to make it narrower, then wider.
  3. Look for the transcript still showing the same messages, with the text re-wrapped to the new width. Compare with Expected.

## S72.30 Remote-session attachment.

- **Expected:** The terminal can attach to a session that lives elsewhere (another device, the cloud or a running remote agent) and continue it.
- **Code:** done. Evidence present: apps/cli/src/cloud/code_teleport.rs:134; apps/cli/src/lib.rs:2645; apps/cli/src/lib.rs:926
- **Where to find it:** Terminal: agi resume --teleport (picker), agi resume --teleport <id>, or agi resume <id> --cloud (labels found in the code)
- **Needs:** a cloud Code session on your AGI account whose repository is on GitHub; for --teleport, a local checkout of that repository
- **Steps:**
  1. In a checkout of the GitHub repository a cloud session used, type `agi resume --teleport` and press Enter, then pick a session.
  2. Or type `agi resume <id> --cloud` with an id from your account.
  3. Look for the message `Checked out` or `Updated` with the branch name and remote, then the session history shown in the app.
  4. Compare with Expected: the session continues from its cloud history.

## S72.31 Background-task management.

- **Expected:** The user can list, inspect and stop background tasks (sub-agents or long-running commands) from the terminal.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:484; apps/cli/src/repl/registry.rs:550; apps/cli/src/tui/tui_app.rs:7733; apps/cli/src/repl/slash_commands.rs:268
- **Where to find it:** Terminal: agi background list (also logs <id>, stop <id>); in the app: type /tasks and press Enter (labels found in the code)
- **Needs:** none for background runs; for /tasks stop, a task that is running in the session (for example a sub-agent)
- **Steps:**
  1. Type `agi background start "<a short prompt>"` and press Enter to start a background run.
  2. Type `agi background list` and press Enter; find the run id.
  3. Type `agi background logs <id>` to see its output, then `agi background stop <id>` to stop it.
  4. In the app, type `/tasks` and press Enter to list this session's tasks; compare the list and stop state with Expected.

## S72.32 Export transcript.

- **Expected:** The user can export the conversation transcript (Markdown/JSON) to a file or clipboard.
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:440; apps/cli/src/repl/registry.rs:453; apps/cli/src/tui/tui_app.rs:6034; apps/cli/src/repl/registry.rs:473
- **Where to find it:** In the app: type /export and press Enter, or /export <file name> and press Enter (labels found in the code)
- **Needs:** a conversation with at least one message
- **Steps:**
  1. Have a conversation with at least one message.
  2. Type `/export` and press Enter; look for the Markdown transcript shown on screen.
  3. Type `/export transcript.md` and press Enter; look for `Exported the conversation to <path>.`
  4. Type the same command again; look for the refusal that the file already exists. Compare with Expected.

## S72.33 Configuration-file support.

- **Expected:** Settings are read from a global config file with per-project overrides and can be displayed.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3486 (quoted code not found in the file now); apps/cli/src/config.rs:339 (quoted code not found in the file now); apps/cli/src/config.rs:527
- **Where to find it:** Terminal: agi --config, or in the app: /config (labels found in the code)
- **Needs:** a project config file in .agiworkforce/ (optional, for the override check)
- **Steps:**
  1. In a project folder that has a .agiworkforce/config.toml file, type `agi --config` and press Enter.
  2. Look for the `Sources:` section with the global path and the project path.
  3. Compare the values shown with the config.toml files on disk.
  4. Type `/config` in the app and compare the same values.

## S72.34 Environment-variable support.

- **Expected:** Environment variables override configuration (model, provider, max tokens, API base, plain mode) and the override is shown.
- **Code:** done. Evidence present: apps/cli/src/config.rs:1665; apps/cli/src/config.rs:1668; apps/cli/src/config.rs:1314
- **Where to find it:** Terminal: AGIWORKFORCE_MODEL=<model id> agi --config (or AGI_PLAIN=1 agi --config) (labels found in the code)
- **Needs:** none; a model id you can use for the model check
- **Steps:**
  1. Type `agi --config` with no extra variables and press Enter; note the `Env:` line says none.
  2. Type `AGI_PLAIN=1 agi --config` and press Enter; look for AGI_PLAIN listed on the `Env:` line.
  3. Type `AGIWORKFORCE_MODEL=<a model id from /model> agi --config` and press Enter; look for the model value and AGIWORKFORCE_MODEL on the `Env:` line.
  4. Compare with Expected: the override is shown.

## S72.35 Installer and updater.

- **Expected:** The CLI can be installed via a published package/script and can check for and install updates itself.
- **Code:** partial. Evidence moved: apps/web/public/install.sh:162; apps/cli/src/update_check.rs:221 (quoted code not found in the file now)
- **Known to be unfinished:** Owner only: set AGI_CLI_RELEASE_SIGNING_KEY, publish the first signed release, then mark the CLI available (surface-status.ts:7).
- **Where to find it:** Terminal: curl -fsSL https://agiworkforce.com/install.sh | bash, then agi update --check (labels found in the code)
- **Needs:** none; the install step does not finish until the owner publishes a signed release
- **Steps:**
  1. Run `curl -fsSL https://agiworkforce.com/install.sh | bash` in a terminal and press Enter.
  2. Read the installer output: it currently stops with a message that no signed release is published.
  3. Run `agi update --check` and press Enter.
  4. Look for the comparison of the running version with the newest published release, as Expected says.

## S72.36 Diagnostics command.

- **Expected:** A diagnostics command checks the local setup and prints a human or JSON report.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1039; apps/cli/src/doctor.rs:50
- **Where to find it:** Terminal: agi doctor (also agi doctor --json, agi doctor --export) (labels found in the code)
- **Steps:**
  1. Type `agi doctor` and press Enter.
  2. Read the list of checks and their status words.
  3. Type `agi doctor --json` and press Enter; look for one JSON report.
  4. Type `agi doctor --export` and press Enter; note the file it says it wrote and check it is marked as redacted. Compare with Expected.

## S72.37 CI/scripting integration.

- **Expected:** CI scripts can drive the CLI non-interactively with machine output, auto-approval policy, spend cap and meaningful exit codes.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:491; apps/cli/src/lib.rs:387; apps/cli/src/lib.rs:9283; apps/cli/src/lib.rs:4826 (quoted code not found in the file now)
- **Where to find it:** Terminal: agi exec with --output-format json, --json-events, --max-budget-usd and --mode (labels found in the code)
- **Needs:** a signed-in account that can run a prompt
- **Steps:**
  1. Type `agi exec --output-format json "say hello"` and press Enter; look for one JSON result on the screen with no spinner.
  2. Type `agi exec --json-events --max-budget-usd 0.01 "<a longer task>"` and press Enter; look for NDJSON events and a status_update with reason budget_exhausted.
  3. Type `echo $?` and press Enter; look for a non-zero exit code when the run stops.
  4. Use `--mode` to set the permission policy and check the run does not ask for input. Compare with Expected.
