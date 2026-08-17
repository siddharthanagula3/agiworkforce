# AGI Workforce CLI

Status: Current
Owner role: CLI lead
Last updated: 2026-07-25
Kind: app
Criticality: high

## Purpose

> Beyond one model. Beyond one surface. AGI in your hands.

The terminal-native AI coding agent that doesn't surprise you.

```
$ agi
                    ┌──────────────────── ▮ in 1.2k · out 0 · $0.011 · ctx 4% ┐
 AGI Workforce v1.7.1 │ catalog-selected-model │ provider │ main │ 4% ctx
└─────────────────────────────────────────────────────────────────────────────┘
```

Multi-model. Cost-aware. Replayable. Built in Rust. The CLI for teams that
ship CI/CD with AI in the loop.

## Why?

Claude Code, OpenAI Codex CLI, OpenCode, and Gemini CLI are the four serious
competitors. We close gaps none of them close, and meet them on parity where
the ecosystem expects it.

| Feature                                          |     Claude Code      |    Codex CLI     |        OpenCode        |   Gemini CLI   |                  **AGI Workforce**                   |
| ------------------------------------------------ | :------------------: | :--------------: | :--------------------: | :------------: | :--------------------------------------------------: |
| Multi-provider in one session, mid-turn switch   |  ❌ Anthropic only   |  ❌ OpenAI only  | ✅ ~10 (Vercel AI SDK) | ❌ Google only |                  ✅ 15+ + `/model`                   |
| Always-on cost HUD top-right (tokens + $ + ctx%) | ⚠️ status line only  | ⚠️ /status card  |           ❌           |       ❌       |                          ✅                          |
| Machine-readable JSONL agent events for CI       | ⚠️ stream-json mode  | ⚠️ JSONL events  |           ❌           |       ❌       |   ✅ `--json-events` (typed, stable kind strings)    |
| Multi-model fallback chain                       |          ❌          |        ❌        |           ❌           |       ❌       |                    ✅ `-m a,b,c`                     |
| Session fork at specific turn with rename        |    ✅ resume only    |  ✅ basic fork   |           ✅           |       ❌       |             ✅ `--at-turn N --as <name>`             |
| Native Rust binary                               |          ✅          |        ✅        |         ❌ Bun         |       ❌       |                          ✅                          |
| OSS license                                      |      ❌ Closed       |  ✅ Apache-2.0   |         ✅ MIT         | ✅ Apache-2.0  |                    ❌ Proprietary                    |
| MCP support (transports)                         | stdio+SSE+HTTP+OAuth | stdio+HTTP+OAuth |  stdio+SSE+HTTP+OAuth  |    (varies)    |             stdio + SSE + HTTP (+OAuth)              |
| Hook events                                      |     ~19 (config)     |       ~10        |           ✓            |    (varies)    |                          32                          |
| Plan mode (model writes plan → user approves)    |          ✅          | ✅ `update_plan` |           ✓            |       ❌       | ⚠️ tool-allowlist toggle (real plan mode in Phase 1) |

## Install

```bash
cargo install --path apps/cli --bin agi
```

Then sign in with your provider:

```bash
agi login        # device-code OAuth or API key
agi auth-status  # confirm
```

`agi` is the primary command. `agiworkforce` remains available as a backward-compatible alias.

### Runtime requirement: sandbox backend

Sandboxed command execution shells out to an OS sandbox binary, and there is no
in-process fallback — the `linux-seccomp` Cargo feature is not compiled into
release builds and installs no filter on any exec path.

| Platform | Required binary           | Install                                                                                                            |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Linux    | `bwrap` (bubblewrap)      | `sudo apt install bubblewrap` · `sudo dnf install bubblewrap` · `sudo pacman -S bubblewrap` · `apk add bubblewrap` |
| macOS    | `sandbox-exec` (Seatbelt) | ships with macOS                                                                                                   |
| Windows  | none                      | sandboxed exec unsupported                                                                                         |

Without it, `run_command` refuses to execute and `agi doctor` reports
`sandbox.os` as a warning with the install command. `--no-sandbox` runs
unsandboxed and is the only supported way to proceed without the backend.

### Add a custom provider

Drop a `[providers.<name>]` block into `~/.agiworkforce/config.toml` to wire up
any OpenAI-compatible endpoint (OpenRouter, NVIDIA NIM, Groq, Together,
Fireworks, etc.):

```toml
[providers.openrouter]
base_url = "https://openrouter.ai/api/v1"
api_key_env = "OPENROUTER_API_KEY"

[providers.groq]
base_url = "https://api.groq.com/openai/v1"
api_key_env = "GROQ_API_KEY"
```

Custom names that collide with a pre-registered provider (`anthropic`,
`openai`, `google`, `ollama`, `xai`, `deepseek`, `perplexity`, `qwen`,
`moonshot`, `zhipu`, `lmstudio`, `mistral`, `openrouter`, `nvidia`) are
ignored — the native handler always wins.

## The four differentiators

### 1. Live Cost HUD

Top-right of the TUI shows running tokens-in / out / cache / `$` and context %.
Color-shifts grey → orange (≥70 % ctx) → red (≥90 % ctx). Pricing comes from
the shared `models.json` catalog — never hardcoded.

```bash
agi        # interactive TUI; HUD lives top-right
```

### 2. Typed JSON event stream

Every lifecycle event becomes one JSONL object on stdout — `Spawning`,
`ReadyForPrompt`, `RunningTool`, `ToolResult`, `MessageDelta`, `TurnUsage`,
`FallbackTriggered`, `Finished`, `Error`. Every error carries a stable
machine-readable `kind` (`api_rate_limit`, `auth_expired`, `network`, …) and
a runbook hint.

```bash
agi exec --json-events "explain main.rs" | jq '.[]'
```

### 3. Multi-model fallback chain

Pass a comma-separated `-m` to wire a fallback. If the primary returns 429,
network, 5xx, or stream-disconnect, the next model takes over — provider
auto-switched, banner flashed, JSON event emitted.

```bash
agi -m "<primary-model>,<fallback-model>,<local-model>" "refactor main.rs"
```

Pair with `--demo` to see the rotation fire deterministically:

```bash
agi --demo --json-events exec -m "<primary-model>,<fallback-model>" "hi"
# → {"event":"fallback_triggered","from":"<primary-model>","to":"<fallback-model>","reason":"api_rate_limit"}
```

### 4. Session replay / fork

Every session is persisted under `~/.agiworkforce/managed_sessions/`.
List, inspect, and fork from any turn:

```bash
agi session list
agi session show <id>
agi session fork <id> --at-turn 2 --as refactor-alt
agi --resume refactor-alt
```

## Output styles

Three baked-in (`default`, `explanatory`, `learning`) plus user overrides
from `~/.agiworkforce/output-styles/<name>.md`:

```
/output-style                # list + show active
/output-style explanatory    # switch on the fly
```

When changed from the CLI, `output_style` and `privacy_mode` are persisted in
the project `.agiworkforce/config.toml` under `[ui]`, so the boundary and style
load automatically in later sessions for that repo.

## Slash commands (selected)

```
/cost           Show session cost summary
/output-style   Switch output style
/fallback       Show current fallback chain
/replay         How to fork from an earlier turn
/insights       JSONL event log for this session
/model <id>     Switch model
/status         Session info (model, tokens, mode)
/context        Context window usage
/doctor        Show local diagnostics inside the current session
/clear          Clear conversation, keep system prompt
/exit           Quit
```

Custom commands can be added as markdown files under `.agiworkforce/commands`
or `~/.agiworkforce/commands`. Nested files become namespaced commands, so
`.agiworkforce/commands/review/security.md` runs as `/review:security`.
Command bodies support `$ARGUMENTS` and `$1` through `$9`; imported Claude
commands under `~/.agiworkforce/prompts/claude` and compatibility
`.claude/commands` roots are also recognized.

Connected MCP servers that support prompts expose them as
`/mcp:<server>:<prompt>`. Arguments can be passed as `name=value` pairs; if a
prompt has one required argument, plain trailing text is assigned to it.

Agent definitions live in `.agiworkforce/agents/` and `~/.agiworkforce/agents/`.
Use `/agents`, `/agents show <name>`, `/agents create <name> [--global]`, and
`/agents validate` to manage them from either REPL or TUI mode.

Skills use progressive disclosure. Put either a flat markdown file in
`.agiworkforce/skills/` or the canonical `<skill-name>/SKILL.md` directory
layout there (global skills use `~/.agiworkforce/skills/`). The system prompt
receives metadata only; the model calls the read-only `Skill` tool to list or
load one exact installed skill, making activation visible in the tool stream.
Project skills remain consent-gated. Optional dependencies can be declared in
frontmatter without exposing secret values:

```markdown
---
name: release-check
description: Verify a release before publishing it
env_vars: [RELEASE_SIGNING_KEY]
tools: [read_file, run_command]
---
```

The loader refuses activation while a declared environment variable or tool is
missing. Skill content is treated as untrusted reference guidance and cannot
override system, privacy, approval, or tool-safety policy.

## Demo flow (90 seconds)

```
agi --demo --json-events exec \
  -m "<primary-model>,<fallback-model>" "refactor main.rs"
# 1. spawning + ready_for_prompt events
# 2. demo synthesizes 429
# 3. ↘ Falling back: <primary-model> → <fallback-model> (api_rate_limit)
# 4. fallback_triggered JSON event
# 5. fresh model answers
# 6. turn_usage + finished events

agi session list
agi session fork <id> --at-turn 0 --as refactor-alt
```

## Subcommands

```
agi help
```

Lists subcommands including `exec`, `review`, `apply`, `sandbox`, `mcp-server`,
`app-server`, `resume`, `fork`, `session`, `history`, `login`, `logout`,
`auth-status`, `doctor`, `init`, `onboarding`, `features`, `execpolicy`,
`models`, `plugin`, `sync`, `marketplace`, and `ecosystem`. Managed-cloud
models use the normal model/session path after the explicit privacy handoff;
there is no separate cloud-task command.

Managed Cloud on CLI is a Pro, Max 5x, Max 15x, Team, or Enterprise benefit.
The signed-in account keeps its exact purchased tier label; Auto routing maps
Team to the Pro roster and Max 15x to the Max roster. Free, Basic, expired, and
unpaid accounts fail closed on this developer surface. Billing, Team
administration, connector setup, and Enterprise sales live in the Web control
plane so every AGI client consumes one account and policy source.

```bash
agi doctor
agi doctor --json
```

## Architecture

- `agi app-server` is the canonical local developer-session runtime used by
  AGI for VS Code and future Cowork clients. Both the default stdio transport
  and authenticated WebSocket transport run the same typed thread/turn
  protocol and full agent engine; the CLI owns persistence, tool/MCP execution,
  streaming, approval round-trips, cancellation, model resolution, and
  workspace isolation while clients own presentation and context selection.
  WebSocket mode requires `--auth-token` or `AGI_APP_SERVER_TOKEN`; auth tokens
  are never printed.
- CLI and VS Code sessions share `~/.agiworkforce/managed_sessions/`; they do
  not join Web/Mobile/Desktop Cloud chat sync. App-server reads never expose
  the internal system prompt, and cross-workspace read/fork/archive operations
  fail closed.
- MCP discovery starts asynchronously so a stalled project MCP server cannot
  freeze thread creation. Clients receive `mcp/loading`, `mcp/ready`, or
  `mcp/unavailable` status notifications for that local thread.
- Rust workspace with shared protocol, model-registry, sandbox, MCP, and runtime
  crates used by `apps/cli` and the Tauri backend. Build the primary binary with
  `cargo build --release -p agiworkforce-cli --bin agi`.
- TUI: ratatui + crossterm. The live module set is locked in
  `apps/cli/AGENTS.md` and guarded by the repository module-reachability check.
- Sandboxing: Linux (bubblewrap), macOS (Seatbelt) shipped; Windows + Linux
  Landlock are enum stubs (Phase 2).
- MCP: 3 transports shipped (stdio, SSE, Streamable HTTP with optional OAuth).
- Hooks: 32 events shipped (`apps/cli/src/features/hooks/hooks.rs`); aligned
  with the Sprint B5 canonical vocabulary (Claude Code aliases like
  `BeforeToolUse` map to canonical `PreToolUse`).
- Catalog-driven provider routes through AGI-owned adapters and user-defined
  endpoints registered through `~/.agiworkforce/config.toml`.
- Models loaded from `models.json` (no hardcoded model IDs anywhere).

## Roadmap

- **Phase 0 (Sprint A, complete)** — Decommissioned dead modules, shipped real
  `init`.
- **Phase 1 (Sprint B, complete)** — MCP SSE + HTTP + OAuth, plugin manifest
  discovery (`.agiworkforce-plugin/`, `.claude-plugin/`, `.codex-plugin/`),
  hook event vocabulary canonicalized (now 32 events), provider adapter
  support, and user-defined custom endpoints.
- **Phase 2 (next)** — Routing strategy resurrection (the differentiator),
  hot reload, `--from-pr`, OS keychain (sprint1-vault-rewire), Linux Landlock +
  Windows sandbox, OpenTelemetry minimal.

## License

Proprietary. AGI Workforce CLI is part of the AGI Workforce platform; the
whole platform is proprietary, not open source. See the root `NOTICE` for
third-party attribution.
