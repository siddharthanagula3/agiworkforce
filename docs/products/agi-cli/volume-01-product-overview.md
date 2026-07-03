# AGI CLI — Volume 01 — Product Overview

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/cli/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/cli.md`, `docs/cli/COMMAND_SURFACE.md`, and real repo paths: `apps/cli/src/agent/mod.rs`, `apps/cli/Cargo.toml`, `crates/agiworkforce-app-server/src/lib.rs`, `packages/types/src/models.json`.

## Overview & stance

This volume is the top-level product brief for **AGI CLI** — the pure-Rust, Ratatui-driven terminal developer surface of AGI Workforce. It sets vision, personas, goals, competitive posture, architecture, and risk framing that later CLI volumes detail. AGI is **six user surfaces + one internal AGI Runtime layer**; the CLI is one surface, not the runtime.

The CLI ships all **three trust modes** — **Local**, **BYOK**, **Managed Cloud** — end to end. Trust boundaries are load-bearing, not cosmetic: a `PrivacyMode` enum (`Local`/`Byok`/`Managed`) and `validate_privacy_boundary` in `apps/cli/src/agent/mod.rs` **block** a Local session from silently routing to a non-local provider. Sessions are **workspace/session-scoped**; any handoff to Managed-Cloud app chat is explicit and redacted, never automatic.

## Vision

Make the terminal the most trustworthy place to run an agentic coding loop across any model, on the user's own trust terms — local-first, key-optional, never surprising. 🔭 Planned (north-star; individual capabilities labeled below).

## Mission

Give developers a fast, scriptable, provider-agnostic coding agent that runs Local by default, forks to BYOK only with explicit consent, and reaches Managed Cloud when the user opts in — with visible provider labels and cost at every turn. ✅ Built (core loop + privacy modes in `apps/cli/src/agent/mod.rs`; multi-provider client per `apps/cli/Cargo.toml`).

## Product goals

- **G1 — Trust-mode integrity:** Local sessions never leak to BYOK/Cloud without an explicit, reviewable fork. ✅ Built (`validate_privacy_boundary`, `arm_byok_handoff`/`consume_byok_handoff` in `apps/cli/src/agent/mod.rs`).
- **G2 — Multi-provider parity:** one CLI drives 12 named providers + user-defined `Custom` blocks. 🟡 Partial (provider match in `apps/cli/src/models/mod.rs`; Mistral drift noted in `docs/surfaces/cli.md`).
- **G3 — Agent-native tooling:** MCP, hooks, skills, slash commands, plan mode, subagents. 🟡 Partial (`apps/cli/src/mcp/`, `apps/cli/src/hooks.rs`, `crates/agiworkforce-app-server`).
- **G4 — Remote control of a live local session from phone/web. 🔭 Planned** (parity target; no repo path yet).

## User personas

- **Terminal-first engineer** — scriptable agent that respects Local privacy. ✅ Built (`agi exec`, `apps/cli/src/tui/`).
- **Privacy-constrained developer** — keeps prompts on-device unless they consent. ✅ Built (`apps/cli/src/agent/mod.rs`).
- **BYOK power user** — own provider keys, no markup. ✅ Built (`agi auth`/`agi login`).
- **Platform/CI operator** — wires the CLI into pipelines and MCP hosts. 🟡 Partial (`agi app-server`, `agi mcp-server`).

## User stories

- Stay Local; picking a cloud model makes the session **refuse** until I explicitly fork to BYOK. ✅ Built (`local_privacy_blocks_cloud_provider_until_explicit_byok` test, `apps/cli/src/agent/mod.rs`).
- Run `agi login`, choose a provider from `packages/types/src/models.json`, see the provider label every turn. 🟡 Partial (auth + catalog exist; label UX per `apps/cli/src/tui/`).
- Run `agi exec` with JSON output and parse `MessageDelta` events. ✅ Built (`json_events`, `apps/cli/src/agent/mod.rs`).
- Steer a running local `agi` session from my phone via QR pairing. 🔭 Planned.

## Success metrics

- Zero Local→non-local leaks in audit. ✅ Built enforcement; 🔭 telemetry.
- Turn cost + provider label shown every turn. 🟡 Partial (`cost_ledger`, `apps/cli/src/agent/mod.rs`).
- Time-to-first-token and tool-call success rate per provider. 🔭 Planned.
- Install-to-first-`exec` time across Homebrew/npm/curl/Cargo. 🟡 Partial (distribution live per `docs/surfaces/cli.md`; not instrumented).

## Business goals

Drive the freemium wedge: free **Local + BYOK** (access modes, not plans) convert developers into paid **Managed Cloud**. Subscription ladder (founder decision 2026-06-30): **Free $0**, **Basic $8/mo (₹399)**, **Pro $20/mo**, **Max $100/mo and $200/mo**, **Enterprise custom**. Local + BYOK stay free; no credit top-ups. 🟡 Partial (`packages/types/src/billing-catalog.ts` still encodes older tiers — reconciliation is a separate tracked task).

## Competitive analysis — vs Claude Code CLI and Codex CLI

Claude Code CLI binds to Anthropic; Codex CLI is OpenAI-centric; both offer limited BYOK, no local on-device inference, and no cross-provider trust-boundary enforcement. AGI CLI runs 12 named providers + `Custom` (🟡, `apps/cli/src/models/mod.rs`), first-class BYOK (✅), Local as default (✅), and enforced boundaries (✅, `agent/mod.rs`). MCP/hooks/plan mode: peers ship them, AGI is 🟡. Remote control: Claude ships a research preview, Codex a QR-paired host — AGI is 🔭 Planned.

AGI's edge is **multi-provider + per-surface trust + local-first**, not frontier-model exclusivity.

## Product principles

- Local is the default and is never silently escaped. ✅ Built.
- Every provider hop is labeled and consented. ✅ Built.
- Model IDs come only from `packages/types/src/models.json` — never hardcoded. 🟡 Partial (ghost/hardcoded IDs flagged in `docs/surfaces/cli.md` as fixes).
- Examples use the `agi` binary; `agiworkforce` is a compatibility alias only. ✅ Built (`apps/cli/Cargo.toml` `default-run = "agi"`).

## CLI architecture — Rust + Ratatui

Pure-Rust monolith: Tokio async, `reqwest` HTTP, `crossterm` + `ratatui` 0.29 TUI, `clap` command surface. Two binaries — `agi` (primary) and `agiworkforce` (alias). ✅ Built (`apps/cli/Cargo.toml`; TUI under `apps/cli/src/tui/`). Clap subcommands (`exec`, `review`, `apply`, `sandbox`, `mcp-server`, `app-server`, `resume`, `fork`, `session`, `cloud`, `mcp`, `hooks`, `models`, `auth`, …) are enumerated in `docs/cli/COMMAND_SURFACE.md`; verify counts from `apps/cli/src/lib.rs` before restating them.

## Runtime architecture — shared crates

The CLI **consumes** internal AGI Runtime crates rather than reimplementing them: `crates/agiworkforce-app-server` (JSON-RPC stdio + WebSocket tool host, ✅ `src/lib.rs`), plus `agiworkforce-{protocol,command-registry,execpolicy,sandbox-policy,utils-image}` (✅, `apps/cli/Cargo.toml`). MCP transports (stdio/SSE/Streamable HTTP + OAuth) live in `apps/cli/src/mcp/`. 🟡 Partial for plugin/task runtime wiring.

## Inference providers — three trust modes

- **Local:** on-device / localhost providers (Ollama Local, LM Studio, local OpenAI-compatible URLs) → `PrivacyMode::Local`. ✅ Built (`provider_privacy_mode`, `is_local_provider_url`).
- **BYOK:** user-supplied keys, direct to provider; Local→BYOK is an explicit fork (context selection, secret scan, payload preview, provider label, consent). ✅ Built (handoff arming/consume in `apps/cli/src/agent/mod.rs`).
- **Managed Cloud:** AGI-hosted access via `agi cloud`; public alpha, open for signed-in users. 🟡 Partial (`apps/cli/src/cloud.rs` per `docs/surfaces/cli.md`).

Provider capabilities and IDs are read from `packages/types/src/models.json`; the CLI never invents an ID.

## Constraints

- BYOK on CLI/Desktop/VS Code only — never Web/Mobile. ✅ Built (canon).
- Sessions stay workspace/session-scoped; no auto app-chat sync. ✅ Built.
- Sandbox: macOS Seatbelt + Linux bwrap ship; Windows/Landlock are stubs. 🟡 Partial (`apps/cli/src/sandbox.rs`; risk 10 in `docs/surfaces/cli.md`).

## Assumptions

- Users install via Homebrew/npm/curl/Cargo and run on macOS/Linux primarily. 🟡 Partial.
- `packages/types/src/models.json` stays the single source of model IDs. ✅ Built.
- Clerk + Neon + Stripe back auth/data/billing (never Supabase). ✅ Built (canon).

## Risks

- **Trust-boundary regression** — a refactor bypasses `validate_privacy_boundary`. Mitigation: privacy tests in `apps/cli/src/agent/mod.rs`. 🟡.
- **Pricing drift** — `billing-catalog.ts` encodes removed tiers (tracked reconciliation). 🟡.
- **Model-ID drift** — hardcoded/ghost IDs flagged in `docs/surfaces/cli.md`. 🟡.
- **Remote-control scope creep** — mistaking it for a 4th trust mode; it is a window, compute stays local. 🔭.

## Repository map

- `apps/cli/src/agent/mod.rs` — session, privacy modes, boundary enforcement.
- `apps/cli/src/{lib.rs,main.rs}` — Clap command surface, `agi` entry.
- `apps/cli/src/{tui/,mcp/,hooks.rs,models/,cloud.rs,sandbox.rs}` — TUI, MCP, hooks, providers (`models/mod.rs`), cloud, sandbox.
- `apps/cli/Cargo.toml` — binaries (`agi`, `agiworkforce` alias), crate deps.
- `crates/agiworkforce-{app-server,protocol,command-registry,execpolicy,sandbox-policy,utils-image}`.
- `packages/types/src/models.json` — model/provider SSOT.

## Competitor notes

Claude Code CLI (Anthropic-only) and Codex CLI (OpenAI-centric) both bind to one vendor. AGI CLI deliberately diverges: **multi-provider** from one binary, **BYOK where trust allows** (CLI/Desktop/VS Code), **per-surface trust modes**, and **local-first** defaults with enforced boundaries. Remote control mirrors Claude Code Remote Control and Codex remote connections as a secure _window_ over a locally running session — not a cloud migration. Do not copy competitor code or branding; they are parity references only.

## Acceptance / Definition of Done

Production-ready when trust boundaries are provably enforced, providers resolve only from `models.json`, and the `agi` surface builds green with no removed-tier or Supabase references.

**Build**

- [ ] `cargo check -p agiworkforce-cli` and `cargo test -p agiworkforce-cli --lib` pass.
- [ ] Examples use `agi …`; `agiworkforce` appears only as documented alias.

**Trust**

- [ ] Local session refuses non-local providers without an explicit BYOK fork (test-covered).
- [ ] Provider label + trust mode visible every turn; no auto app-chat sync.

**Security**

- [ ] No hardcoded/ghost model IDs; all IDs sourced from `packages/types/src/models.json`.
- [ ] Sandbox posture stated; no silent fallthrough on unsupported platforms.

## Anti-patterns

- Silently routing Local chats/files to BYOK or Cloud.
- Treating remote control as a 4th trust mode or moving local data to cloud.
- Hardcoding or inventing model IDs instead of reading `models.json`.
- Reintroducing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups.
- Referencing Supabase, or `middleware.ts` instead of Next.js 16 `proxy.ts`.
- Using `agiworkforce <cmd>` in examples instead of `agi <cmd>`.
- Claiming shipped state without a real repo path.
