# CLI Command Surface

Last reviewed: 2026-11-11.

This document records the AGI Workforce CLI command/help surface from existing source files. It is a drift artifact, not a product spec. If behavior changes, update the source first, then update this document and the focused drift tests.

## Sources

- Process CLI: `apps/cli/src/lib.rs` (`Cli`, `Command`, and nested subcommands).
- Shared builtin slash registry: `crates/agiworkforce-command-registry/src/lib.rs`, composed with skills and custom commands in `apps/cli/src/command_registry.rs`.
- Classic line REPL slash handler/help: `apps/cli/src/repl/slash_commands.rs`.
- TUI slash handler/help: `apps/cli/src/tui/tui_app.rs`.
- Shared fallback for registry commands without a surface-specific implementation: `apps/cli/src/claude_parity.rs`.

## Process CLI

The process CLI is Clap-driven. Top-level flags include model/provider selection, output mode, session resume/fork, permission mode, MCP config loading, extra working directories, agent selection, JSON event streaming, budget cap, and system-prompt inspection.

Top-level subcommands currently declared in `apps/cli/src/lib.rs`:

| Command          | Alias         | Purpose                                                                                 |
| ---------------- | ------------- | --------------------------------------------------------------------------------------- |
| `exec`           | `e`           | Run non-interactively.                                                                  |
| `review`         | -             | Non-interactive code review.                                                            |
| `apply`          | `a`           | Apply latest diff as a git patch.                                                       |
| `sandbox`        | -             | Run commands inside a sandbox.                                                          |
| `update`         | -             | Compare this build against the newest CLI release; `--install` swaps it.                |
| `mcp`            | -             | Manage the global MCP server registry.                                                  |
| `hooks`          | -             | Manage the hooks the agent fires.                                                       |
| `triggers`       | -             | List daemon triggers or narrow which events start one.                                  |
| `mcp-server`     | -             | Run as an MCP stdio server.                                                             |
| `completion`     | `completions` | Generate shell completion scripts.                                                      |
| `licenses`       | -             | Print the open-source notices for the crates this tool includes.                        |
| `app-server`     | -             | Run app server for IDE integration.                                                     |
| `remote-control` | `rc`          | Let the mobile app list, start, follow and steer sessions here.                         |
| `acp`            | -             | Serve the Agent Client Protocol on stdio.                                               |
| `background`     | `bg`          | Run a prompt in the background; nested `start`, `list`, `logs`, `stop`, `rm`, `attach`. |
| `resume`         | -             | Continue a previous session, from this device or the account.                           |
| `fork`           | -             | Fork a previous session.                                                                |
| `session`        | -             | Inspect or branch sessions (replay).                                                    |
| `models`         | -             | Manage and inspect model configuration.                                                 |
| `plugin`         | -             | Manage plugins.                                                                         |
| `features`       | -             | Inspect feature flags.                                                                  |
| `approvals`      | -             | Manage command and file-operation approvals.                                            |
| `execpolicy`     | -             | Show execution policy rules.                                                            |
| `ecosystem`      | -             | Scan for ecosystem tools and import MCP configs.                                        |
| `migrate`        | -             | Migrate settings from another coding CLI.                                               |
| `history`        | -             | Browse session history, on this device and in the account.                              |
| `sync`           | -             | Sync dotfiles and settings across devices.                                              |
| `login`          | -             | Sign in to the account, or store a provider API key.                                    |
| `logout`         | -             | Log out of AGI cloud.                                                                   |
| `auth-status`    | -             | Show authentication status for all configured providers.                                |
| `library`        | -             | Browse generated images and videos, uploaded and generated files.                       |
| `shares`         | -             | List shared conversation links, or revoke one.                                          |
| `connectors`     | -             | List the account's connectors, or disconnect one.                                       |
| `export-data`    | -             | Request an account data export, or download the ready one.                              |
| `doctor`         | -             | Run local preflight diagnostics.                                                        |
| `marketplace`    | -             | Browse and install marketplace plugins.                                                 |
| `init`           | -             | Initialize the `~/.agiworkforce/` directory and project registration.                   |
| `onboarding`     | -             | Run the first-run onboarding wizard again.                                              |
| `usage`          | -             | Show the account's managed allowance.                                                   |
| `plans`          | -             | Show what each plan includes and its credits per window.                                |
| `keys`           | -             | List or revoke the account's API keys.                                                  |
| `invite`         | -             | Print your referral link.                                                               |
| `schedules`      | -             | Manage the account's scheduled agent tasks in AGI cloud.                                |
| `projects`       | -             | Browse and create the account's projects.                                               |
| `artifacts`      | -             | Browse, read and publish the account's artifacts.                                       |
| `memory`         | -             | Read and write the memory the account shares across clients.                            |
| `code`           | -             | Start, list, show or open cloud Code sessions.                                          |
| `devices`        | -             | List the devices signed in to the account.                                              |
| `image`          | -             | Generate an image with the account and save it to a file.                               |

Nested subcommand groups are owned by their modules. This artifact only tracks the top-level process shape.

## Shared Slash Registry

The shared builtin slash registry is the advertised builtin slash surface for command palette/help composition. It currently contains 104 builtin commands:

`/model`, `/plan`, `/fast`, `/compact`, `/clear`, `/review`, `/diff`, `/copy`, `/continue-elsewhere`, `/thread`, `/threads`, `/gather`, `/background`, `/table`, `/links`, `/init`, `/new`, `/resume`, `/fork`, `/rename`, `/save`, `/history`, `/export`, `/rewind`, `/mcp`, `/skills`, `/agents`, `/route`, `/control`, `/team`, `/permissions`, `/hooks`, `/chrome`, `/ide`, `/plugin`, `/status`, `/cost`, `/usage`, `/sandbox`, `/doctor`, `/recap`, `/release-notes`, `/keybindings`, `/output-style`, `/fallback`, `/replay`, `/insights`, `/context`, `/continue`, `/budget`, `/tools`, `/personalize`, `/tasks`, `/config`, `/models`, `/memory`, `/btw`, `/voice`, `/image`, `/search`, `/create-skill`, `/save-skill`, `/save-routine`, `/schedule`, `/theme`, `/login`, `/logout`, `/feedback`, `/help`, `/exit`, `/advisor`, `/team-onboarding`, `/terminal-setup`, `/reload-plugins`, `/extra-usage`, `/remote-env`, `/remote-control`, `/add-dir`, `/remove-dir`, `/desktop`, `/effort`, `/files`, `/install-github-app`, `/mobile`, `/passes`, `/pr-comments`, `/autofix-pr`, `/auto-mode-setup`, `/privacy-settings`, `/privacy-mode`, `/continue-with-byok`, `/continue-with-cloud`, `/rate-limit-options`, `/security-review`, `/stats`, `/statusline`, `/tag`, `/think-back`, `/ultrareview`, `/upgrade`, `/vim`, `/debug`, `/tui`, `/powerup`.

Aliases are `/m`, `/bg`, `/sessions`, `/branch`, `/teams`, `/perms`, `/approvals`, `/plugins`, `/marketplace`, `/market`, `/diagnose`, `/health`, `/changelog`, `/keys`, `/ctx`, `/task`, `/providers`, `/mem`, `/v`, `/imagine`, `/routines`, `/bug`, `/h`, `/?`, `/quit`, `/q`, `/onboarding`, `/shell-setup`, `/pricing`, `/rc`, `/app`, `/ios`, `/android`, `/trust-boundary`, `/fork-byok`, `/byok`, `/fork-cloud`, `/managed-cloud`.

## Classic REPL Slash Commands

The classic line REPL (`--no-tui`) has a direct match-based handler. Beyond the shared registry it handles REPL-only commands: `/a2a`, `/approve`, `/artifacts`, `/auth`, `/batch`, `/delete`, `/eco`, `/ecosystem`, `/import`, `/load`, `/migrate`, `/raw`, `/setup`, `/subagents`, `/sync`, `/trust`, `/untrust`, `/workflow`, `/workflows`, `/worktree` and `/wt`.

`/permissions` accepts tab names for display and command-prefix management operations: `/permissions allow <command-prefix>`, `/permissions deny <command-prefix>`, `/permissions session <command-prefix>`, `/permissions remove <allow|deny|session> <command-prefix>`, and `/permissions reset`.

REPL help is generated from the registry by `print_help()`. Coverage is enforced by `registered_builtin_commands_have_repl_runtime_coverage`.

## TUI Slash Commands

The TUI (`TuiApp`) advertises the shared registry through help and popup composition, then dispatches by matching canonical registry names in `handle_slash`. It has two coverage layers:

- Direct match arms for TUI-native behavior and overlays.
- Shared Claude-parity fallback via `claude_parity::handle_shared_command` for registry commands that do not need a TUI-only implementation (`claude_parity::shared_runtime_command_names`).

Coverage is enforced by `registered_builtin_commands_have_tui_runtime_coverage`: a new shared builtin must be handled by a direct TUI arm, an exact alias arm, or the shared parity fallback.

## Drift Rules

- Do not add a shared builtin slash command without deciding whether each UI path handles it.
- If a shared builtin is intentionally registry-only or pending UI work, document it in this file and the test allowlist.
- Do not use command/help parity work to edit tool catalog or security files.
- Do not claim reference parity from registry shape alone; parity requires handler behavior, help text, availability, non-interactive behavior, and tests.
