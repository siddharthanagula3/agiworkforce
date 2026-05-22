# agiworkforce-utils-absolute-path

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: medium

## Purpose

Rust utility crate for absolute path handling and path serialization.

## Consumers

Rust crates that need normalized absolute paths.

## Public API / Exports

Rust crate `agiworkforce_utils_absolute_path`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Absolute path wrappers.
- Path normalization helpers.
- Serialization/schema support for paths.

## What Does Not Belong Here

- File writes.
- App-specific path policy.
- Sandbox decisions.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-utils-absolute-path`
- `cargo test -p agiworkforce-utils-absolute-path`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for normalization semantics, traversal behavior, home-dir expansion, and serialization.

## Tests Required For Changes

Add tests for relative paths, symlinks where relevant, platform separators, and invalid input.

## Release / Deployment Notes

Path behavior affects sandbox, file, and patch workflows.

## Known Caveats

Policy decisions should stay outside this utility crate.

## CODEOWNERS

Primary: Rust platform. Secondary: security/privacy for path semantics.
