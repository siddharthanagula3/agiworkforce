# CLI Command Surface

Last reviewed: 2026-05-19.

This document records the AGI Workforce CLI command/help surface from existing source files. It is a drift artifact, not a product spec. If behavior changes, update the source first, then update this document and the focused drift tests.

## Sources

- Process CLI: `apps/cli/src/lib.rs` (`Cli`, `Command`, and nested subcommands).
- Shared builtin slash registry: `crates/agiworkforce-command-registry/src/lib.rs`.
- Classic line REPL slash handler/help: `apps/cli/src/repl/slash_commands.rs`.
- Legacy TUI shared-registry slash handler/help: `apps/cli/src/tui/tui_app.rs`.
- Modern TUI command enum/handler: `apps/cli/src/tui/slash_command.rs` and `apps/cli/src/tui/chatwidget.rs`.
- Reference exploration notes: `tasks/research/src-02-commands.md` and `tasks/research/deep/cmd1-commands-all.md`.

## Process CLI

The process CLI is Clap-driven. Top-level flags include model/provider selection, output mode, session resume/fork, permission mode, MCP config loading, extra working directories, agent selection, JSON event streaming, budget cap, and system-prompt inspection.

Top-level subcommands currently declared in `apps/cli/src/lib.rs`:

| Command       | Alias | Purpose                             |
| ------------- | ----: | ----------------------------------- |
| `exec`        |   `e` | Run non-interactively.              |
| `review`      |     - | Non-interactive code review.        |
| `apply`       |   `a` | Apply latest diff as a git patch.   |
| `sandbox`     |     - | Run commands inside a sandbox.      |
| `mcp-server`  |     - | Run as an MCP stdio server.         |
| `app-server`  |     - | Run app server for IDE integration. |
| `resume`      |     - | Continue a previous session.        |
| `fork`        |     - | Fork a previous session.            |
| `session`     |     - | Inspect or branch sessions.         |
| `cloud`       |     - | Cloud task operations.              |
| `mcp`         |     - | MCP server management.              |
| `hooks`       |     - | Hook configuration.                 |
| `features`    |     - | Feature inspection/configuration.   |
| `execpolicy`  |     - | Execution policy management.        |
| `cost`        |     - | Cost ledger inspection.             |
| `auth`        |     - | OAuth/BYOK auth operations.         |
| `login`       |     - | Log in to a provider.               |
| `logout`      |     - | Log out.                            |
| `auth-status` |     - | Show auth state.                    |
| `plugin`      |     - | Plugin management.                  |
| `init`        |     - | Initialize project instructions.    |
| `onboarding`  |     - | Run onboarding.                     |
| `daemon`      |     - | Daemon/trigger mode.                |
| `ecosystem`   |     - | Ecosystem scan/import/show.         |
| `sync`        |     - | Dotfile/settings sync.              |
| `a2a`         |     - | Agent-to-agent operations.          |
| `models`      |     - | Model catalog operations.           |

Nested subcommand groups are owned by their modules. This artifact only tracks the top-level process shape.

## Shared Slash Registry

The shared builtin slash registry is the advertised builtin slash surface for command palette/help composition. It currently contains 58 builtin commands:

`/model`, `/plan`, `/fast`, `/compact`, `/clear`, `/review`, `/diff`, `/copy`, `/init`, `/new`, `/resume`, `/fork`, `/rename`, `/save`, `/history`, `/export`, `/rewind`, `/mcp`, `/skills`, `/agents`, `/permissions`, `/hooks`, `/chrome`, `/ide`, `/plugin`, `/tasks`, `/status`, `/cost`, `/usage`, `/sandbox`, `/doctor`, `/recap`, `/release-notes`, `/keybindings`, `/output-style`, `/fallback`, `/replay`, `/insights`, `/context`, `/config`, `/models`, `/memory`, `/btw`, `/voice`, `/theme`, `/login`, `/logout`, `/feedback`, `/help`, `/exit`, `/focus`, `/background`, `/advisor`, `/team-onboarding`, `/terminal-setup`, `/reload-plugins`, `/extra-usage`, `/remote-env`.

Important aliases include `/m`, `/sessions`, `/branch`, `/perms`, `/approvals`, `/plugins`, `/marketplace`, `/market`, `/diagnose`, `/health`, `/changelog`, `/keys`, `/ctx`, `/providers`, `/mem`, `/v`, `/bug`, `/h`, `/?`, `/quit`, `/q`, `/bg`, `/onboarding`, `/shell-setup`, and `/pricing`.

## Classic REPL Slash Commands

The classic line REPL (`--no-tui`) has a direct match-based handler. It supports the shared core plus REPL-specific commands that are not all present in the shared registry:

- Session and conversation: `/save`, `/load`, `/history`, `/delete`, `/export`, `/sessions`, `/rename`, `/import`, `/migrate`, `/compact`, `/rewind`, `/branch`, `/fork`.
- Agent/mode: `/model`, `/plan`, `/fast`, `/btw`, `/batch`, `/voice`, `/theme`.
- Configuration/info: `/providers`, `/setup`, `/permissions`, `/models`, `/skills`, `/hooks`, `/context`, `/status`, `/cost`, `/config`, `/auth`.
- Ecosystem: `/a2a`, `/ecosystem`, `/eco`, `/plugin`, `/plugins`, `/marketplace`, `/market`, `/sync`, `/onboarding`.
- Control/help: `/clear`, `/login`, `/logout`, `/help`, `/h`, `/?`, `/exit`, `/quit`, `/q`.

`/permissions` accepts tab names for display and command-prefix management operations: `/permissions allow <command-prefix>`, `/permissions deny <command-prefix>`, `/permissions session <command-prefix>`, `/permissions remove <allow|deny|session> <command-prefix>`, and `/permissions reset`.

REPL help is currently hand-written in `print_help()`. Any registry-driven help migration should preserve the REPL-only entries or explicitly demote them.

## TUI Slash Commands

There are two TUI command paths:

- Modern `ChatWidget` path: uses `SlashCommand` enum and handles every enum variant in `dispatch_command` / `dispatch_command_with_args`.
- Legacy `TuiApp` path: advertises the shared registry through help and popup composition, then dispatches by matching canonical registry names in `handle_slash`.

The legacy `TuiApp` path currently handles these shared-registry canonical commands:

`model`, `plan`, `fast`, `compact`, `clear`, `review`, `diff`, `copy`, `init`, `new`, `resume`, `fork`, `rename`, `save`, `history`, `export`, `rewind`, `mcp`, `skills`, `permissions`, `hooks`, `plugin`, `tasks`, `status`, `cost`, `usage`, `output-style`, `fallback`, `replay`, `insights`, `context`, `config`, `models`, `memory`, `btw`, `voice`, `theme`, `login`, `logout`, `feedback`, `help`, `exit`, `focus`, `background`, `advisor`, `team-onboarding`, `terminal-setup`, `reload-plugins`, `extra-usage`, `remote-env`.

Known explicitly advertised-but-unhandled shared registry commands in that path:

`agents`, `chrome`, `ide`, `sandbox`, `doctor`, `recap`, `release-notes`, `keybindings`.

These are allowed only because they are documented here and guarded by `shared_registry_tui_surface_is_classified`. A new shared builtin must either be handled in the TUI path or added to the explicit allowlist with a reason.

## Drift Rules

- Do not add a shared builtin slash command without deciding whether each UI path handles it.
- If a shared builtin is intentionally registry-only or pending UI work, document it in this file and the test allowlist.
- Do not use command/help parity work to edit tool catalog or security files.
- Do not claim reference parity from registry shape alone; parity requires handler behavior, help text, availability, non-interactive behavior, and tests.
