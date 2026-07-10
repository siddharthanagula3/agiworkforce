# agiworkforce-llm

Status: Current
Owner role: Rust platform + CLI lead
Last updated: 2026-07-09
Kind: rust-crate
Criticality: high

## Purpose

Shared provider HTTP + SSE decode + tool-call assembly for AGI's Rust surfaces (restructure Wave 5 stage c). Extracted from the CLI's provider stack so the CLI and (via stage c2) the desktop stop reimplementing streaming provider calls independently.

## Consumers

`apps/cli` (adopted via a signature-preserving facade in `src/models/streaming.rs`). `apps/desktop/src-tauri` adopted the SSE/NDJSON decode path in stage c2 via the desktop facade `src/core/llm/stream_engine.rs`, which drives the crate's `run_{anthropic,openai_compat,gemini}_stream` byte-stream runners and re-projects `StreamEvent`s into desktop's app-local `StreamChunk` IPC type — desktop's duplicate `parse_anthropic_sse`/`parse_google_sse` decoders were deleted. Because desktop is on reqwest 0.13 (vs this crate's 0.12), it feeds `Response::bytes_stream()` into the byte-stream runners rather than the `stream_chat`/`Client` entry; request serialization (c2c) and the Ollama + managed-cloud decode paths remain desktop-local pending the reqwest convergence and the c3 managed-cloud/credits work.

## Public API / Exports

Rust library `agiworkforce_llm`: `Dialect`, `ProviderSpec`/`Auth`, `StreamEvent`, `Utf8StreamDecoder`, `ToolCallAssembler`, `IdleWatchdog`, `retry`/`LlmError` classification, `fallback`, and the per-dialect `run_{anthropic,openai_compat,gemini,ollama}_stream` byte-stream runners.

## What Belongs Here

- Provider request building + SSE decoding + tool-call delta assembly (mechanics).
- Retry classification, idle watchdog, fallback chains.
- Dialect-parameterized wire handling (Anthropic, Gemini, Ollama-native, OpenAI-compatible incl. Responses API).

## What Does Not Belong Here

- Key resolution, BYOK vault, subscription-auth token exchange (stay app-local).
- CLI config, TUI notices, `CliError` mapping.
- Provider-selection UX and routing policy.

## Key Files

- `src/{spec,events,wire,decode,assembler,watchdog,error,stream}.rs`
- `tests/conformance.rs` + `tests/fixtures/*.jsonl` (the frozen decode contract for the desktop c2 swap)
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-llm`
- `cargo test -p agiworkforce-llm`

## Environment / Secrets

No secrets belong in this crate. Provider keys are passed in as opaque strings by the caller; `Auth`'s `Debug` redacts them (enforced by `tests/redaction.rs`).

## Security, Privacy, Data Boundaries

Security review required for auth-header handling and any tracing/logging change — the crate must never emit key material. `reqwest` is pinned at 0.12 with the CLI's TLS stance (see `Cargo.toml` rationale).

## Tests Required For Changes

Add/extend conformance fixtures (UTF-8 splits, framing, tool-call deltas, retry/paywall) plus a redaction assertion for any request-tracing change.

## Release / Deployment Notes

Wire-decode changes affect every provider stream; run the CLI JSONL transcript gate and, before the desktop c2 swap, live 4-provider streaming smoke.

## Known Caveats

Anthropic finalizes tool calls at `content_block_stop` (no public end-event); the assembler has two consumption modes (`into_completed()` vs `finish()`) to preserve that vs OpenAI's end-of-stream finalize.

## CODEOWNERS

Primary: Rust platform. Secondary: CLI lead.
