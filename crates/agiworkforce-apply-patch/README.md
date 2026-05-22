# agiworkforce-apply-patch

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Rust patch parser/application crate for agent code-edit workflows.

## Consumers

CLI, desktop/local tooling, and any Rust runtime that applies structured patches.

## Public API / Exports

Rust crate `agiworkforce_apply_patch`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Patch grammar parsing.
- Safe patch application primitives.
- Patch error types.

## What Does Not Belong Here

- TUI behavior.
- Git orchestration beyond patch application.
- App-specific file editors.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-apply-patch`
- `cargo test -p agiworkforce-apply-patch`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for path traversal, symlinks, binary handling, overwrite behavior, and error redaction.

## Tests Required For Changes

Add tests for malformed patches, traversal, missing files, conflict cases, and successful edits.

## Release / Deployment Notes

Keep semantics aligned with `packages/apply-patch` where both are used.

## Known Caveats

Patch behavior is high-risk because it writes files.

## CODEOWNERS

Primary: Tooling/security owner. Secondary: Rust platform.
