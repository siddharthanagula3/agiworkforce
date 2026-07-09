# agiworkforce-agent-core

Status: Current
Owner role: Rust platform + CLI lead
Last updated: 2026-07-09
Kind: rust-crate
Criticality: high

## Purpose

Shared agentic turn-loop mechanics for AGI's Rust surfaces (restructure Wave 5 stage e). Extracted from the CLI's `Session::send` so the CLI and (via stage e2) the desktop share one loop engine instead of maintaining parallel ones.

## Consumers

`apps/cli` (adopted via a turn-scoped `TurnHostAdapter` implementing `TurnHost`; `Session::send` orchestrates around `run_turn`). `apps/desktop/src-tauri` local-chat loop is the planned second consumer (stage e2), gated on a live tool-calling turn.

## Public API / Exports

Rust library `agiworkforce_agent_core`: `TurnEngine::run_turn`, the `TurnHost` trait (completion + tool dispatch + hooks + event seams), and types `TurnEvent`/`TurnParams`/`TurnOutcome`/`Prepared`/`ExecResult`/`Completion`/`LoopControl`, plus `RunawayTracker` + content-loop/runaway detection.

## What Belongs Here

- Drive the model stream, assemble tool calls, dispatch (sequential + parallel read-only batches with concurrency caps).
- Iterate until end-turn/limits; runaway, iteration-limit, and budget guards; turn events.

## What Does Not Belong Here

- The hooks engine, compaction, plan mode, privacy-boundary consent (trust-boundary code — stay in `Session::send`).
- Memory/skills/subagents policy, key/subscription-auth resolution, TUI/stderr routing, `CliError` mapping (all app-local via `TurnHost` impl).

## Key Files

- `src/{lib,engine,runaway}.rs`
- `tests/turn_loop.rs` (scripted-host fixtures: sequential/parallel/error/runaway/iteration/budget/malformed-args/mid-stream-error)
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-agent-core`
- `cargo test -p agiworkforce-agent-core`

## Environment / Secrets

No secrets belong in this crate. Completion (including key handling) is delegated to the host via `TurnHost::complete`.

## Security, Privacy, Data Boundaries

The engine owns loop mechanics only; consent/privacy-boundary validation stays in the CLI `Session`. Hook ordering and event cadence are observable behavior — preserve them.

## Tests Required For Changes

Extend the scripted-host fixtures for any loop/guard/dispatch change; the CLI JSONL transcript gate must stay byte-identical.

## Release / Deployment Notes

The API intentionally deviates from the original design sketch: no app-server `ToolDispatch` dependency (the CLI's dispatch is `&mut self`, mutating), and `run_turn(host, params)` folds completion into `TurnHost::complete` (no `LlmClient` object). Live-turn verification of the verbatim-moved bulk is tracked as `RUST-AGENTCORE-LIVE-TURN-VERIFY-01`.

## Known Caveats

The JSONL byte-identity gate exercises only the demo/fallback path; the real dispatch/hooks/transform bulk is fixture-verified against a test double, not yet byte-verified against a live tool-calling turn (e2/QA owns that).

## CODEOWNERS

Primary: Rust platform. Secondary: CLI lead.
