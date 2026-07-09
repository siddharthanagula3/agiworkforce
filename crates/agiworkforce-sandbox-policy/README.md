# agiworkforce-sandbox-policy

Status: Current
Owner role: Security/privacy owner
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Shared sandbox policy model for AGI Workforce surfaces.

## Consumers

CLI, Desktop, app-server, and future local/private/managed compute runners.

## Public API / Exports

Rust crate package `agiworkforce-sandbox-policy`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Sandbox permission models.
- Shared policy structs/enums.
- Serialization for policy exchange across runtimes.

## What Does Not Belong Here

- UI approval prompts.
- Actual process execution.
- Provider calls.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-sandbox-policy`
- `cargo test -p agiworkforce-sandbox-policy`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for allow/deny defaults, filesystem/network permissions, command permissions, policy serialization, and fallback behavior.

## Tests Required For Changes

Add tests for default policies, serialization compatibility, and deny-by-default cases.

## Release / Deployment Notes

Sandbox policy changes can alter what agents/tools may access.

## Known Caveats

Policy model changes must be coordinated with execution and UI approval layers.

## CODEOWNERS

Primary: Security/privacy owner. Secondary: Rust platform and CLI/Desktop owners.
