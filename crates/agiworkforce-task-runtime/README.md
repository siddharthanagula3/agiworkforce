# agiworkforce-task-runtime

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Shared task runtime model for background tasks, task state, and task execution metadata.

## Consumers

CLI, Desktop, app-server, and future local/private/managed compute runners.

## Public API / Exports

Rust crate `agiworkforce-task-runtime`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Task IDs, states, events, and metadata.
- Runtime-independent task orchestration primitives.

## What Does Not Belong Here

- Surface UI.
- Provider SDK clients.
- Billing settlement.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-task-runtime`
- `cargo test -p agiworkforce-task-runtime`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for task persistence, generated files, tool execution, cancellation, logs, and privacy-mode metadata.

## Tests Required For Changes

Add tests for state transitions, cancellation, serialization, and failure behavior.

## Release / Deployment Notes

Task runtime changes can affect CLI/Desktop and future cloud runners.

## Known Caveats

Keep execution-specific behavior in owning runners until there are multiple consumers.

## CODEOWNERS

Primary: Rust platform. Secondary: CLI/Desktop owners and security/privacy for task execution.
