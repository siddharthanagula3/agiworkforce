# agiworkforce-command-registry

Status: Current
Owner role: CLI lead
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Shared AGI command registry contracts for CLI and TUI surfaces.

## Consumers

CLI/TUI, command tests, and future surfaces that need a canonical slash-command registry.

## Public API / Exports

Rust crate `agiworkforce-command-registry`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Slash command metadata.
- Command aliases, categories, descriptions, and capability declarations.
- Registry tests and golden coverage.

## What Does Not Belong Here

- Command execution side effects.
- TUI rendering.
- Provider calls.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-command-registry`
- `cargo test -p agiworkforce-command-registry`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for command names that imply execution, permissions, privacy-mode changes, or tool access.

## Tests Required For Changes

Every registered slash command should have metadata coverage and runtime behavior tests in consuming surfaces.

## Release / Deployment Notes

Registry changes affect CLI parity and user muscle memory.

## Known Caveats

Runtime command implementation still lives outside this registry.

## CODEOWNERS

Primary: CLI lead. Secondary: Rust platform.
