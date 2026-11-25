---
id: "REQ-AREA-072"
type: "requirements"
title: "Requirement items: CLI and terminal application"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 72. CLI and terminal application

37 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S72.01

**Interactive terminal UI.** Running `agi` in a terminal opens a full-screen interactive UI with a composer, transcript and overlays that sends turns to the agent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-01 Full-screen terminal chat screen](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)

## S72.02

**Linear accessible output mode.** A linear, screen-reader-friendly mode prints output line by line with no colour, spinners, rules or full-screen redraws.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-09 Plain and screen-reader output, no colour](../../20-features/072-cli-and-terminal-application/F072-09-plain-and-screen-reader-output-no-colour.md)

## S72.03

**Headless/noninteractive mode.** A prompt can run to completion without an interactive session (`agi exec` / `-p`) and the process exits.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-07 One-shot and scripted runs with output formats](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)

## S72.04

**Standard input support.** Prompt text can be supplied on standard input (`--stdin`, `-` or auto-detected when stdin is not a TTY).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-07 One-shot and scripted runs with output formats](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)

## S72.05

**Piped input.** Piped content (e.g. `git diff | agi "explain"`) is read and combined with the positional prompt and any --file context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-07 One-shot and scripted runs with output formats](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)

## S72.06

**Plain-text output.** A one-shot run can print the bare response text with no spinner, cost line or formatting (`--raw`, `--print`, `--output-format text`).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-07 One-shot and scripted runs with output formats](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)

## S72.07

**Structured JSON output.** A one-shot run can emit a single machine-readable JSON result (`--json` / `--output-format json`) with response, tokens, cost, duration and error state.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-07 One-shot and scripted runs with output formats](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)

## S72.08

**Streaming JSON events.** A one-shot run can stream NDJSON events (session start, user message, text deltas, tool lifecycle, final message, end/error) as they happen.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-07 One-shot and scripted runs with output formats](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)

## S72.09

**Exit-code contract.** Exit status distinguishes failure classes (1 generic, 65 data, 69 unavailable, 75 temporary, 76 too old, 77 not permitted, 78 configuration; 2 reserved for usage).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-08 Exit codes and CI automation](../../20-features/072-cli-and-terminal-application/F072-08-exit-codes-and-ci-automation.md)

## S72.10

**Authentication commands.** The CLI can sign in, sign out and show authentication status from the terminal (`agi login|logout|auth-status`, `/login`, `/logout`).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-10 Sign-in, settings, folders and environment](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)

## S72.11

**Session list.** The user can list saved sessions and pick one (`/history` picker in the TUI, `agi history`, `agi session list`).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-03 Saved sessions: list, resume, fork, export](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)

## S72.12

**Resume command.** The user can resume a previous session by picker, id or latest (`/resume`, `agi resume [id] [--cloud]`, `-c`).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-03 Saved sessions: list, resume, fork, export](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)

## S72.13

**Branch command.** The user can branch the current or a saved session into a new one (`/fork`, `/branch`, `agi fork`, `agi session fork --at-turn`).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-03 Saved sessions: list, resume, fork, export](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Competitor trace: CAP-editing-regeneration-and-branching-09, CAP-editing-regeneration-and-branching-17

## S72.14

**Model command.** The user can view and switch the model mid-session from the terminal (`/model` picker or `/model <id>`).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-04 Model, effort and permission controls](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)

## S72.15

**Effort command.** The user can set reasoning effort (low/medium/high/max) and it changes the next request.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-04 Model, effort and permission controls](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)

## S72.16

**Permission command.** The user can change the permission mode and allow/deny rules from the terminal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-04 Model, effort and permission controls](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)

## S72.17

**Context command.** A context command shows how much of the model context window the current conversation occupies.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-05 Context, usage and compaction](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)

## S72.18

**Usage command.** A usage command shows session tokens/cost and the account allowance from the shared usage ledger.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-05 Context, usage and compaction](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)

## S72.19

**Compact-context command.** A compact command summarises the conversation to free context, optionally with focus instructions, and reports before/after size.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-05 Context, usage and compaction](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)

## S72.20

**Tool/MCP commands.** The user can add, list, inspect, authenticate and remove MCP servers from the terminal and see connected tools.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-06 Tools, skills, plugins and background runs](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)

## S72.21

**Skill/Plugin commands.** The user can list/toggle skills and list/install/update plugins from the terminal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-06 Tools, skills, plugins and background runs](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)

## S72.22

**Repository/folder selection.** The user can point a run at another repository or add extra working folders (`-C/--repo`, `--add-dir`, `/add-dir`).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-10 Sign-in, settings, folders and environment](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)

## S72.23

**File mentions.** Typing @ in the composer opens a fuzzy file picker and the mentioned files are inlined as context when sent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-02 Keys, composer and @ file mentions](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)

## S72.24

**Prompt history.** Previous prompts can be recalled (Up arrow / history search) and persist across runs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-02 Keys, composer and @ file mentions](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)

## S72.25

**Keyboard shortcuts.** The TUI has global keyboard shortcuts, lists them with /keybindings, and lets users rebind them in config.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-02 Keys, composer and @ file mentions](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)

## S72.26

**Shell completion.** The CLI generates shell completion scripts for bash, zsh and fish.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-11 Install, update, diagnostics and shell completion](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)

## S72.27

**Theme selection.** The user can pick a terminal colour theme (picker or /theme <name>) and it applies and persists.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-01 Full-screen terminal chat screen](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)

## S72.28

**No-color mode.** Setting NO_COLOR (or --plain) removes colour from all terminal output, including the TUI.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-09 Plain and screen-reader output, no colour](../../20-features/072-cli-and-terminal-application/F072-09-plain-and-screen-reader-output-no-colour.md)

## S72.29

**Terminal resize handling.** Resizing the terminal re-lays out the TUI without losing the transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-01 Full-screen terminal chat screen](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)

## S72.30

**Remote-session attachment.** The terminal can attach to a session that lives elsewhere (another device, the cloud or a running remote agent) and continue it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-12 Remote session attachment](../../20-features/072-cli-and-terminal-application/F072-12-remote-session-attachment.md)

## S72.31

**Background-task management.** The user can list, inspect and stop background tasks (sub-agents or long-running commands) from the terminal.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-06 Tools, skills, plugins and background runs](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)

## S72.32

**Export transcript.** The user can export the conversation transcript (Markdown/JSON) to a file or clipboard.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-03 Saved sessions: list, resume, fork, export](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)

## S72.33

**Configuration-file support.** Settings are read from a global config file with per-project overrides and can be displayed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-10 Sign-in, settings, folders and environment](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)

## S72.34

**Environment-variable support.** Environment variables override configuration (model, provider, max tokens, API base, plain mode) and the override is shown.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-10 Sign-in, settings, folders and environment](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)

## S72.35

**Installer and updater.** The CLI can be installed via a published package/script and can check for and install updates itself.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI partial
- Feature: [F072-11 Install, update, diagnostics and shell completion](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Competitor trace: CAP-apps-and-install-10, CAP-apps-and-install-11

## S72.36

**Diagnostics command.** A diagnostics command checks the local setup and prints a human or JSON report.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-11 Install, update, diagnostics and shell completion](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)

## S72.37

**CI/scripting integration.** CI scripts can drive the CLI non-interactively with machine output, auto-approval policy, spend cap and meaningful exit codes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F072-08 Exit codes and CI automation](../../20-features/072-cli-and-terminal-application/F072-08-exit-codes-and-ci-automation.md)
