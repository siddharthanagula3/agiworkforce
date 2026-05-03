# AGI Workforce CLI

The terminal-native AI coding agent that doesn't surprise you.

```
$ agiworkforce
                    ┌──────────────────── ▮ in 1.2k · out 0 · $0.011 · ctx 4% ┐
 AGI Workforce v1.0.0 │ claude-sonnet-4-6 │ anthropic │  main │ 4% ctx
└─────────────────────────────────────────────────────────────────────────────┘
```

Multi-model. Cost-aware. Replayable. Built in Rust. The CLI for teams that
ship CI/CD with AI in the loop.

## Why?

Claude Code, OpenAI Codex CLI, OpenCode, and Gemini CLI are the four serious
competitors. We close gaps none of them close, and meet them on parity where
the ecosystem expects it.

| Feature                                        |     Claude Code      |    Codex CLI     |        OpenCode        |   Gemini CLI   |                  **AGI Workforce**                   |
| ---------------------------------------------- | :------------------: | :--------------: | :--------------------: | :------------: | :--------------------------------------------------: |
| Multi-provider in one session, mid-turn switch |  ❌ Anthropic only   |  ❌ OpenAI only  | ✅ ~10 (Vercel AI SDK) | ❌ Google only |                   ✅ 8 + `/model`                    |
| Live cost HUD (tokens + $ + ctx %)             |          ❌          |        ❌        |           ❌           |       ❌       |                          ✅                          |
| Machine-readable agent events for CI           |          ❌          |        ❌        |           ❌           |       ❌       |                  ✅ `--json-events`                  |
| Multi-model fallback chain                     |          ❌          |        ❌        |           ❌           |       ❌       |                    ✅ `-m a,b,c`                     |
| Session fork from any turn                     |    ✅ resume only    |  ✅ basic fork   |           ✅           |       ❌       |                   ✅ `--at-turn N`                   |
| Native Rust binary                             |          ✅          |        ✅        |         ❌ Bun         |       ❌       |                          ✅                          |
| OSS license                                    |      ❌ Closed       |  ✅ Apache-2.0   |         ✅ MIT         | ✅ Apache-2.0  |                    ✅ Apache-2.0                     |
| MCP support (transports)                       | stdio+SSE+HTTP+OAuth | stdio+HTTP+OAuth |  stdio+SSE+HTTP+OAuth  |    (varies)    |          stdio (SSE/HTTP/OAuth in Phase 1)           |
| Hook events                                    |          27          |        6         |           ✓            |    (varies)    |                          23                          |
| Plan mode (model writes plan → user approves)  |          ✅          | ✅ `update_plan` |           ✓            |       ❌       | ⚠️ tool-allowlist toggle (real plan mode in Phase 1) |

## Install

```bash
cargo install --path apps/cli --bin agiworkforce
```

Then sign in with your provider:

```bash
agiworkforce login        # device-code OAuth or API key
agiworkforce auth-status  # confirm
```

## The four differentiators

### 1. Live Cost HUD

Top-right of the TUI shows running tokens-in / out / cache / `$` and context %.
Color-shifts grey → orange (≥70 % ctx) → red (≥90 % ctx). Pricing comes from
`models.json` (era-correct: GPT-5.4, Claude 4.6, Gemini 3.1, Grok 4) — never
hardcoded.

```bash
agiworkforce        # interactive TUI; HUD lives top-right
```

### 2. Typed JSON event stream

Every lifecycle event becomes one JSONL object on stdout — `Spawning`,
`ReadyForPrompt`, `RunningTool`, `ToolResult`, `MessageDelta`, `TurnUsage`,
`FallbackTriggered`, `Finished`, `Error`. Every error carries a stable
machine-readable `kind` (`api_rate_limit`, `auth_expired`, `network`, …) and
a runbook hint.

```bash
agiworkforce exec --json-events "explain main.rs" | jq '.[]'
```

### 3. Multi-model fallback chain

Pass a comma-separated `-m` to wire a fallback. If the primary returns 429,
network, 5xx, or stream-disconnect, the next model takes over — provider
auto-switched, banner flashed, JSON event emitted.

```bash
agiworkforce -m claude-opus-4-6,gpt-5.4,llama3.1:8b "refactor main.rs"
```

Pair with `--demo` to see the rotation fire deterministically:

```bash
agiworkforce --demo --json-events exec -m claude-sonnet-4-6,gpt-5.4 "hi"
# → {"event":"fallback_triggered","from":"claude-sonnet-4-6","to":"gpt-5.4","reason":"api_rate_limit"}
```

### 4. Session replay / fork

Every session is persisted under `~/.agiworkforce/managed_sessions/`.
List, inspect, and fork from any turn:

```bash
agiworkforce session list
agiworkforce session show <id>
agiworkforce session fork <id> --at-turn 2 --as refactor-alt
agiworkforce --resume refactor-alt
```

## Output styles

Three baked-in (`default`, `explanatory`, `learning`) plus user overrides
from `~/.agiworkforce/output-styles/<name>.md`:

```
/output-style                # list + show active
/output-style explanatory    # switch on the fly
```

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
/clear          Clear conversation, keep system prompt
/exit           Quit
```

## Demo flow (90 seconds)

```
agiworkforce --demo --json-events exec \
  -m claude-sonnet-4-6,gpt-5.4 "refactor main.rs"
# 1. spawning + ready_for_prompt events
# 2. demo synthesizes 429
# 3. ↘ Falling back: claude-sonnet-4-6 → gpt-5.4 (api_rate_limit)
# 4. fallback_triggered JSON event
# 5. fresh model answers
# 6. turn_usage + finished events

agiworkforce session list
agiworkforce session fork <id> --at-turn 0 --as refactor-alt
```

## Subcommands

```
agiworkforce help
```

Lists all 22 subcommands: `exec`, `review`, `apply`, `sandbox`, `mcp-server`,
`app-server`, `resume`, `fork`, `session`, `history`, `login`, `logout`,
`auth-status`, `init`, `onboarding`, `features`, `execpolicy`, plus
deferred-to-Phase-2 surfaces (`cloud`, `plugin`, `sync`, `marketplace`,
`ecosystem`) currently dispatched to gated stubs — these surfaces will be
wired or removed per `~/.claude/plans/cli-competitive-floor.md` Sprint A2.

## Architecture

- Pure Rust workspace (12 utility crates + `apps/cli` + `apps/desktop/src-tauri`).
  `cargo build --release -p agiworkforce-cli` produces a 5.7 MB binary.
- TUI: ratatui + crossterm. 192 source files; 125 TUI files (~155 K LOC incl.
  snapshot tests). 2,161 `#[test]` / `#[tokio::test]` cases.
- Sandboxing: Linux (bubblewrap), macOS (Seatbelt) shipped; Windows + Linux
  Landlock are enum stubs (Phase 2).
- MCP: stdio transport shipped today; SSE + Streamable HTTP + OAuth coming in
  Phase 1 per the floor plan.
- Hooks: 23 events shipped (`apps/cli/src/hooks.rs`); Claude-Code-aligned
  vocabulary coming in Phase 1.
- 8 providers wired with mid-conversation switch: Anthropic, OpenAI, Google,
  Ollama, Mistral, XAI, DeepSeek, Copilot. (Web/desktop platform = 25.)
- Models loaded from `models.json` (no hardcoded model IDs anywhere).

## Roadmap

- **Phase 0 (Sprint A, in progress)** — Decommission dead modules, license
  Apache-2.0, ship real `init`. See `~/.claude/plans/cli-competitive-floor.md`.
- **Phase 1 (Sprint B)** — MCP SSE + HTTP + OAuth, real plan mode (`update_plan`
  model tool), hook event renaming for Claude Code interop, plugin manifest
  discovery (`.agiworkforce-plugin/`, `.claude-plugin/`, `.codex-plugin/`).
- **Phase 2 (after B)** — Routing strategy resurrection (the differentiator),
  LMStudio integration, hot reload, `--from-pr`, OS keychain (sprint1-vault-rewire),
  Linux Landlock + Windows sandbox, OpenTelemetry minimal.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](../../NOTICE).
