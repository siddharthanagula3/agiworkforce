# agiworkforce-async-utils

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: low

## Purpose

Shared Rust async utilities for workspace crates.

## Consumers

Rust crates that need small async helpers.

## Public API / Exports

Rust crate `agiworkforce-async-utils`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Small reusable async helper traits/functions.

## What Does Not Belong Here

- Product runtime orchestration.
- App-specific async behavior.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-async-utils`
- `cargo test -p agiworkforce-async-utils`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Review cancellation, timeout, and task lifecycle behavior when helpers affect long-running work.

## Tests Required For Changes

Add tests for timing/cancellation helpers where behavior is non-trivial.

## Release / Deployment Notes

Keep APIs small and generic.

## Known Caveats

Move domain-specific async code to the owning crate instead.

## CODEOWNERS

Primary: Rust platform.
