# AGI Workforce CLI

The terminal-native AI coding agent that doesn't surprise you.

```
$ agiworkforce
                    ┌──────────────────── ▮ in 1.2k · out 0 · $0.011 · ctx 4% ┐
 AGI Workforce v0.1.0 │ claude-sonnet-4-6 │ anthropic │  main │ 4% ctx
└─────────────────────────────────────────────────────────────────────────────┘
```

Multi-model. Cost-aware. Replayable. Built in Rust. The CLI for teams that
ship CI/CD with AI in the loop.

## Why?

Claude Code and OpenAI Codex CLI dominate mindshare, but they leave four big
gaps on the table. We close all four:

| Feature                              | Claude Code | Codex CLI | **AGI Workforce**  |
| ------------------------------------ | :---------: | :-------: | :----------------: |
| Live cost HUD (tokens + $ + ctx %)   |     ❌      |    ❌     |         ✅         |
| Machine-readable agent events for CI |     ❌      |    ❌     | ✅ `--json-events` |
| Multi-model fallback chain           |     ❌      |    ❌     |   ✅ `-m a,b,c`    |
| Session replay / fork from any turn  |     ❌      |    ❌     | ✅ `session fork`  |

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
`models.json` (era-correct: GPT-5.4, Claude 4.7, Gemini 3.1, Grok 4) — never
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

Lists all 19 subcommands: `exec`, `review`, `apply`, `sandbox`, `mcp-server`,
`app-server`, `resume`, `fork`, `session`, `cloud`, `plugin`, `features`,
`execpolicy`, `ecosystem`, `history`, `sync`, `login`, `logout`,
`auth-status`, `marketplace`, `init`, `onboarding`.

## Architecture

- Pure Rust workspace (~95 crates), `cargo build -p agiworkforce-cli` in <10 s.
- TUI: ratatui + crossterm. ~1.8 k LOC entry point + 100+ supporting modules.
- Sandboxing: Linux (bubblewrap), macOS (Seatbelt), Windows (Win32 sandbox).
- MCP server + client baked in.
- Models loaded from `crates/agiworkforce-models-manager/models.json`
  (no hardcoded model IDs anywhere).

## License

Proprietary. © AGI Automation LLC.
