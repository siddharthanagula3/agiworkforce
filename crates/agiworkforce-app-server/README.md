# agiworkforce-app-server

Status: Current
Owner role: Rust platform
Last updated: 2026-07-14
Kind: rust-crate
Criticality: high

## Purpose

Own the transport and request-admission layer for AGI local programmatic
clients. The typed JSONL stdio protocol serves local developer threads and
turns; the legacy JSON-RPC/WebSocket path exposes its explicitly limited tool
surface.

## Consumers

The CLI hosts the runtime. AGI for VS Code is the shipping typed-protocol
client. Other surfaces must define a reviewed trust boundary before adopting
this transport.

## Public API / Exports

Rust crate `agiworkforce-app-server`; public API is defined by `src/lib.rs`.

## What Belongs Here

- App-server transport contracts.
- Initialize/version negotiation and client identity.
- Typed thread, turn, streaming, approval, cancellation, and MCP status
  request routing through the `DeveloperSessionHost` interface.
- JSON-RPC and WebSocket server behavior.
- Programmatic tool exposure that is reusable across surfaces.

## What Does Not Belong Here

- CLI TUI.
- Desktop UI.
- Provider SDK logic.
- Session persistence, agent execution, or workspace policy; those belong to
  the CLI host implementation.

## Key Files

- `Cargo.toml`
- `src/lib.rs`
- `src/developer_sessions.rs`

## Commands

- `cargo check -p agiworkforce-app-server`
- `cargo test -p agiworkforce-app-server`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for authentication, transport admission, tool exposure, logging, and filesystem/network access.

## Tests Required For Changes

Add tests for initialization, protocol-version behavior, client identity,
request validation, typed host routing, notification interleaving, error
responses, and legacy tool exposure.

## Release / Deployment Notes

Keep wire behavior additive. A newly required client capability must increment
the protocol version and update generated TypeScript consumers.

## Known Caveats

The default stdio protocol is version 2. Long-running host work must return
control before streaming notifications so approvals and interruption remain
responsive.

## CODEOWNERS

Primary: Rust platform. Secondary: CLI/Desktop owners for consumers.
