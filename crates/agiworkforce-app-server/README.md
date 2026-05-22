# agiworkforce-app-server

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

JSON-RPC stdio and WebSocket transport exposing AGI Workforce tools to programmatic clients.

## Consumers

CLI, desktop/local tooling, and future app-server integrations.

## Public API / Exports

Rust crate `agiworkforce-app-server`; public API is defined by `src/lib.rs`.

## What Belongs Here

- App-server transport contracts.
- JSON-RPC and WebSocket server behavior.
- Programmatic tool exposure that is reusable across surfaces.

## What Does Not Belong Here

- CLI TUI.
- Desktop UI.
- Provider SDK logic.

## Key Files

- `Cargo.toml`
- `src/lib.rs`

## Commands

- `cargo check -p agiworkforce-app-server`
- `cargo test -p agiworkforce-app-server`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for authentication, transport admission, tool exposure, logging, and filesystem/network access.

## Tests Required For Changes

Add tests for transport admission, request validation, error responses, and tool exposure.

## Release / Deployment Notes

Keep protocol behavior stable for clients.

## Known Caveats

Transport changes can affect multiple surfaces and automation clients.

## CODEOWNERS

Primary: Rust platform. Secondary: CLI/Desktop owners for consumers.
