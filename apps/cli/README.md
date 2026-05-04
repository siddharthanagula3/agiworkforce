# AGI Workforce CLI

> Beyond one model. Beyond one surface. AGI in your hands.

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
| Multi-provider in one session, mid-turn switch |  ❌ Anthropic only   |  ❌ OpenAI only  | ✅ ~10 (Vercel AI SDK) | ❌ Google only |                  ✅ 10+ + `/model`                   |
| Live cost HUD (tokens + $ + ctx %)             |          ❌          |        ❌        |           ❌           |       ❌       |                          ✅                          |
| Machine-readable agent events for CI           |          ❌          |        ❌        |           ❌           |       ❌       |                  ✅ `--json-events`                  |
| Multi-model fallback chain                     |          ❌          |        ❌        |           ❌           |       ❌       |                    ✅ `-m a,b,c`                     |
| Session fork from any turn                     |    ✅ resume only    |  ✅ basic fork   |           ✅           |       ❌       |                   ✅ `--at-turn N`                   |
| Native Rust binary                             |          ✅          |        ✅        |         ❌ Bun         |       ❌       |                          ✅                          |
| OSS license                                    |      ❌ Closed       |  ✅ Apache-2.0   |         ✅ MIT         | ✅ Apache-2.0  |                    ❌ Proprietary                    |
| MCP support (transports)                       | stdio+SSE+HTTP+OAuth | stdio+HTTP+OAuth |  stdio+SSE+HTTP+OAuth  |    (varies)    |             stdio + SSE + HTTP (+OAuth)              |
| Hook events                                    |          27          |        6         |           ✓            |    (varies)    |                          19                          |
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
`moonshot`, `zhipu`, `lmstudio`) are ignored — the native handler always wins.

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
- TUI: ratatui + crossterm. 195 source files; 125 TUI files (~155 K LOC incl.
  snapshot tests). 914+ `#[test]` / `#[tokio::test]` cases.
- Sandboxing: Linux (bubblewrap), macOS (Seatbelt) shipped; Windows + Linux
  Landlock are enum stubs (Phase 2).
- MCP: 3 transports shipped (stdio, SSE, Streamable HTTP with optional OAuth).
- Hooks: 19 events shipped (`apps/cli/src/hooks.rs`); aligned with the Sprint
  B5 canonical vocabulary (Claude Code aliases like `BeforeToolUse` map to
  canonical `PreToolUse`).
- 10+ providers via OpenAI-compatible adapter, with mid-conversation switch:
  Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu,
  Ollama (local + cloud), LM Studio, plus user-defined endpoints (OpenRouter,
  NVIDIA NIM, Groq, Together, Fireworks, etc.) registered through
  `~/.agiworkforce/config.toml`. (Web/desktop platform = 25.)
- Models loaded from `models.json` (no hardcoded model IDs anywhere).

## Roadmap

- **Phase 0 (Sprint A, complete)** — Decommissioned dead modules, shipped real
  `init`. See `~/.claude/plans/cli-competitive-floor.md`.
- **Phase 1 (Sprint B, complete)** — MCP SSE + HTTP + OAuth, plugin manifest
  discovery (`.agiworkforce-plugin/`, `.claude-plugin/`, `.codex-plugin/`),
  hook event vocabulary canonicalized to 19 events, OpenAI-compatible adapter
  for 10+ providers + user-defined custom endpoints.
- **Phase 2 (next)** — Routing strategy resurrection (the differentiator),
  hot reload, `--from-pr`, OS keychain (sprint1-vault-rewire), Linux Landlock +
  Windows sandbox, OpenTelemetry minimal.

## License

Proprietary. AGI Workforce CLI is part of the AGI Workforce platform; the
whole platform is proprietary, not open source. See the root `NOTICE` for
third-party attribution.
