# CLI surface

> **Path:** `apps/cli/` · **Stack:** Rust monolith + Ratatui TUI · **Owner:** founder · **Status:** v1.1.6 shipped (latest), v1.0 shipped 2026-05-03. **Updated:** 2026-05-18.

## Mission

The Rust CLI is the **engine** — every other surface wraps it conceptually. It's also the only surface that ships every provider end-to-end on day one. Installable via Homebrew, npm wrapper, GitHub Releases (6 platforms), and curl install.sh.

## Status at HEAD

| Item                    | State                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Latest release          | ✅ v1.1.6 (per `git tag` 2026-05-18)                                                                  |
| First release           | ✅ v1.0.0 shipped 2026-05-03                                                                          |
| Homebrew formula        | ✅ `siddharthanagula3/tap/agiworkforce`                                                               |
| npm wrapper             | ✅ `@agiworkforce/cli` (NPM_TOKEN set)                                                                |
| Cargo install           | ✅ `cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli --bin agi` |
| Cargo check (workspace) | ✅ GREEN                                                                                              |
| Binary install path     | ✅ `~/.cargo/bin/agi` primary, `~/.cargo/bin/agiworkforce` compatibility alias                        |

## Verified codebase numbers (2026-05-17 audit)

- **288** `.rs` files in `apps/cli/src/` — was claimed 200 (understated 44%)
- **172,941** LOC in CLI src
- **24** subcommands (Exec, Review, Apply, Sandbox, McpServer, AppServer, Resume, Fork, Session, Cloud, Plugin, Features, Execpolicy, Ecosystem, History, Sync, Login, Logout, AuthStatus, Marketplace, Init, Onboarding, plus nested)
- **22** canonical hook events
- **12** named providers + **Custom** registry (=13 entries in `provider_from_name`)
- **1,320** cargo tests in `apps/cli` (was claimed 999 — understated 32%)
- **6.0 MB** arm64 binary

## Stack

| Item          | Choice                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------- |
| Language      | Rust 1.94.0 (pinned in `apps/desktop/src-tauri/rust-toolchain.toml`, applies workspace-wide) |
| TUI framework | Ratatui (125 files / ~155K LOC of TUI)                                                       |
| Async runtime | Tokio                                                                                        |
| HTTP client   | reqwest                                                                                      |
| Provider SDKs | Custom OpenAI-compatible HTTP client; no vendor SDKs in CLI (TS packages wrap vendor SDKs)   |
| MCP           | stdio transport only (HTTP transport via api-gateway)                                        |
| Sandbox       | macOS Seatbelt + Linux bwrap (Windows + Landlock are stubs — V5 §17 risk #10)                |
| Distribution  | Homebrew + npm + curl install.sh + GitHub Releases (6 platforms) + Cargo                     |

## File layout

```
apps/cli/
├── src/                            288 .rs files / 172.9K LOC
│   ├── main.rs                     entry; Command enum with 24 variants (lines 38-54 declare modules)
│   ├── lib.rs                      pub mod declarations; line 43 had `pub mod subagent_v2;` REMOVED 2026-05-17 (file archived)
│   ├── models.rs                   ⚠ provider_from_name match (lines 287-310): 12 named + 1 Custom
│   ├── hooks.rs                    ⚠ 22 canonical hook events (lines 179-200)
│   ├── tools.rs                    tool registry
│   ├── sandbox.rs                  ⚠ macOS Seatbelt + Linux bwrap ship; Windows + Landlock are silent fallthrough — V5 §17 risk #10 says HARD-REFUSE
│   ├── master_password.rs          Stronghold vault (769 LOC, 22 crypto tests)
│   ├── tui/                        125 files / ~155K LOC Ratatui
│   ├── agent/                      subagent.rs is the live impl (subagent_v2.rs archived)
│   ├── repl/                       interactive mode
│   ├── plugin/                     PHASE2 marketplace
│   ├── ecosystem/                  mcp scan + import
│   ├── policy/                     PHASE2 Gemini-style declarative TOML tool-rule eval (no external callers; PHASE2 gated)
│   ├── cloud.rs                    Cloud subcommand (actively wired in lib.rs:1174-1186)
│   ├── sync.rs                     Config sync (called from repl/mod.rs:255,270)
│   ├── marketplace.rs              PHASE2
│   ├── a2a_ws.rs                   PHASE2 WS transport
│   ├── project_registry.rs         actively wired (onboarding.rs:5)
│   ├── project_scope.rs            actively wired (onboarding.rs:6, tui/resume_picker.rs:9)
│   └── ...
├── npm/                            npm wrapper package
├── Cargo.toml                      workspace member
└── target/release/agi              6.0 MB primary binary; agiworkforce alias also builds

apps/cli/archive/                   N/A — archived modules moved to _archive/2026-05-17-cleanup/apps/cli/src/
                                    (subagent_v2.rs + tools.rs.bak + safety.rs.bak)
```

## 24 subcommands

```
Exec          one-shot LLM call from command line
Review        code review tool
Apply         apply-patch operations
Sandbox       sandbox testing
McpServer     run as MCP server (stdio)
AppServer     run as app-server (subagent_v2 era; subagent.rs is the live impl)
Resume        resume prior session
Fork          fork session at a turn
Session       list / show / branch / delete sessions
Cloud         cloud subcommand
Plugin        plugin management
Features      feature flag interrogation
Execpolicy    execution policy interrogation
Ecosystem     ecosystem scan + import MCP servers
History       conversation history
Sync          config sync
Login         OAuth login
Logout        OAuth logout
AuthStatus    auth status
Marketplace   PHASE2 marketplace
Init          repo init
Onboarding    interactive onboarding
```

Plus nested subcommands in Session, Cloud, Plugin, Ecosystem, Sync, Marketplace.

## 12 named providers + Custom

Per `apps/cli/src/models.rs:287-310`:

```
Anthropic      Claude models
OpenAI         GPT models
Google         Gemini models
Ollama (Local) local network
Ollama (Cloud) hosted
xAI            Grok models
DeepSeek       V4-Flash, V4-Pro (after 2026-05-31 alias-redirect)
Perplexity     Sonar models
Qwen           DashScope international
Moonshot       Kimi K2.6
Zhipu          GLM models
LMStudio       local network
Mistral        Codestral 2508 (CLI provider_from_name shows dropped 2026-05-03 comment — but still routes via OpenAI-compatible)
Custom         User-defined [providers.*] config blocks
```

**Drift caveat**: Mistral is "dropped" in CLI `models.rs:310` comment but still in `models.json` providers list. Reconcile in W7.

## 22 canonical hook events

Per `apps/cli/src/hooks.rs:179-200`:

`SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `AfterMessage`, `PlanModeChanged`, `PreCompact`, `PostCompact`, `BeforeModelResolve`, `BeforePromptBuild`, `ToolResultPersist`, `SubagentStart`, `SubagentStop`, `PermissionRequest`, `Notification`, `Stop`, `CronTriggered`, `WebhookReceived`, `FileChanged`, `DaemonStarted`, `DaemonStopped`.

## Build + test commands

```bash
# Fast type check
cargo check --workspace

# Release build
cargo build --release -p agiworkforce-cli

# Run
cargo run -p agiworkforce-cli --bin agi -- exec "Hello"
~/.cargo/bin/agi --help

# Test (1,320 tests)
cargo test -p agiworkforce-cli

# All workspace tests
cargo test --workspace --lib

# Lint
cargo clippy --workspace --lib -- -D warnings -D unsafe-code

# Single test by name substring
cargo test -p agiworkforce-cli <test_name_substring>

# Exact test path
cargo test -p agiworkforce-cli --lib <module>::tests::<name> -- --exact
```

## Release process

Tag `v-cli-X.Y.Z` triggers `.github/workflows/release-cli.yml`:

1. Builds 6 platform binaries (darwin x64/arm64, linux x64/arm64, windows x64/arm64)
2. Uploads to GitHub Releases
3. Updates Homebrew formula via `scripts/update-homebrew-tap.sh` (taps `siddharthanagula3/homebrew-tap`)
4. Publishes npm wrapper `@agiworkforce/cli` (requires `NPM_TOKEN` secret)
5. Updates `install.sh` for curl-pipe install

Latest: v1.1.6 per `git tag | sort -V | tail -1`. Total tags: 21.

## Install paths (all live)

```bash
# Homebrew
brew install siddharthanagula3/tap/agiworkforce

# curl pipe
curl -fsSL https://raw.githubusercontent.com/siddharthanagula3/agiworkforce/main/scripts/install.sh | bash

# Cargo from git
cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli --bin agi

# npm wrapper
npm install -g @agiworkforce/cli

# Direct GitHub Release download
gh release download v-cli-1.1.6 --repo siddharthanagula3/agiworkforce
```

## Current open work (Wave 6 + cleanup)

1. **V5 §17 risk #10** — Windows + Linux-no-bwrap sandbox HARD-REFUSE (no silent fallthrough). Currently `sandbox.rs:159` silently falls through.
2. **V5 §17 risk #13** — 2,409 `unwrap()/expect()` calls in CLI + Desktop Rust. Refactor hot paths to `?` with context.
3. **Reconcile Mistral provider** — comment says dropped, but `models.json` and `Provider` union type still include it. Pick one.
4. **PHASE2 modules (no external callers)** — `policy/`, `a2a_ws.rs`, `marketplace.rs` — keep scaffold or archive at Sprint B close.
5. **Test count audit** — 1,320 per latest verification (up from 999). Reconcile MEMORY claim that said 999.

## Gotchas

- **`provider_from_name` is the SSOT for CLI provider list** at `apps/cli/src/models.rs:287-310`. Comments inside this match block win over `models.json` for CLI behavior.
- **`subagent_v2.rs` was archived 2026-05-17.** The live implementation is `subagent.rs`. Don't reintroduce v2 without explicit decision.
- **Plan mode**: legacy `plan_mode` was DELETED at `tools.rs:193`. Only `update_plan` remains. Don't reintroduce.
- **MCP transport**: stdio only in CLI. HTTP MCP via `services/api-gateway`.
- **Sandbox silent fallthrough** is a P0 to fix per V5 §17 risk #10.
- **Latest test count**: 1,320 (verified 2026-05-17). Older docs say 999 — outdated.
- **`FAST_STATUS_MODEL` hardcoded** at `tui/chatwidget.rs:344` violates V5 §10 lock #1 (no hardcoded model IDs). W6 fix.
- **Ghost model `claude-opus-4-6-mini`** at `tui/chatwidget.rs:412` + `tui/bottom_pane/list_selection_view.rs:1415,1497`. W6 fix.

## Current References

- [docs/current/product-suite.md](../current/product-suite.md) - six-surface product role and CLI sync boundary.
- [docs/current/technical-architecture.md](../current/technical-architecture.md) - runtime, provider, and reusable-crate ownership.
- [docs/current/agent-and-repo-operability.md](../current/agent-and-repo-operability.md) - current docs and agent workflow rules.
- [docs/engineering/naming-conventions.md](../engineering/naming-conventions.md) - `agi` primary command and `agiworkforce` compatibility alias lock.
- [docs/decisions/CURRENT_DECISIONS.md](../decisions/CURRENT_DECISIONS.md) - no hardcoded model IDs, no silent routing, and current trust-boundary rules.
- Historical PRD and layout details live in `docs/archive/2026-05-21-docs-consolidation/`.

## Memory references

- `memory/audits/cli-competitive-2026-05-03.md` — competitive audit vs Codex / Claude Code / OpenCode
- `memory/reference/patterns/cli-benchmarks.md` — sizing comparisons
- `memory/reference/patterns/release-pipeline.md` — 5-platform binary + install.sh + Homebrew + npm

## Operational owner

Founder. Homebrew tap, GitHub Releases, npm `@agiworkforce/cli` all under founder's accounts.
