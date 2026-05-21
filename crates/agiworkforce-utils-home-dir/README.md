# agiworkforce-utils-home-dir

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: medium

## Purpose

Rust utility crate for resolving user home directories and related local paths.

## Consumers

Rust crates that need home-directory path resolution.

## Public API / Exports

Rust crate `agiworkforce_utils_home_dir`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Home-directory resolution helpers.
- Small path helpers tied to user local directories.

## What Does Not Belong Here

- App data retention policy.
- File indexing.
- Secret storage.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-utils-home-dir`
- `cargo test -p agiworkforce-utils-home-dir`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for path fallback behavior, platform-specific directories, and privacy-sensitive local storage locations.

## Tests Required For Changes

Add tests for platform/path edge cases where feasible.

## Release / Deployment Notes

Directory behavior affects local-first storage and privacy expectations.

## Known Caveats

Callers own permission checks and retention rules.

## CODEOWNERS

Primary: Rust platform. Secondary: security/privacy for local storage paths.
