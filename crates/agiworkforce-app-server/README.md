# agiworkforce-app-server

Status: Current
Owner role: Rust platform
Last updated: 2026-07-17
Kind: rust-crate
Criticality: high

## Purpose

Own the transport and request-admission layer for AGI local programmatic
clients. The typed developer-session protocol serves the same full local agent
over JSONL stdio and authenticated WebSocket, including threads, turns,
streaming, interruption, MCP state, and approval round-trips. A separate legacy
direct-tool JSON-RPC API remains available to embedders with an explicitly
limited dispatch supplied by its caller.

## Consumers

The CLI hosts the runtime. AGI for VS Code is the shipping stdio client;
WebSocket is the GUI/Cowork seam. Other surfaces must define a reviewed trust
boundary before adopting this transport.

## Public API / Exports

Rust crate `agiworkforce-app-server`; public API is defined by `src/lib.rs`.

## What Belongs Here

- App-server transport contracts.
- Initialize/version negotiation and client identity.
- Typed thread, turn, streaming, approval, cancellation, and MCP status
  request routing through the `DeveloperSessionHost` interface.
- Typed developer-session stdio and WebSocket behavior.
- Legacy direct-tool JSON-RPC behavior.
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

WebSocket admission requires a non-empty auth token and origin checks. The host
retains trust-mode, workspace, tool-permission, and approval policy. Tokens must
not be printed or written into synced state.

## Tests Required For Changes

Add tests for initialization, protocol-version behavior, client identity,
request validation, typed host routing, notification interleaving, approval
round-trips, error responses, and legacy tool exposure.

## Release / Deployment Notes

Keep wire behavior additive. A newly required client capability must increment
the protocol version and update generated TypeScript consumers.

## Known Caveats

The developer-session protocol is version 3 on both transports. Long-running
host work must return control before streaming notifications so approvals and
interruption remain responsive.

## CODEOWNERS

Primary: Rust platform. Secondary: CLI/Desktop owners for consumers.
