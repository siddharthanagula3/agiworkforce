# agiworkforce-utils-string

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: medium

## Purpose

Rust utility crate for shared string helpers.

## Consumers

Rust crates that need common string parsing, redaction, or formatting helpers.

## Public API / Exports

Rust crate `agiworkforce_utils_string`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Small reusable string helpers.
- Parsing/formatting utilities with no app dependency.

## What Does Not Belong Here

- Prompt templates.
- UI copy.
- Provider-specific serialization.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-utils-string`
- `cargo test -p agiworkforce-utils-string`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for redaction, token detection, path/string sanitization, and user-input parsing.

## Tests Required For Changes

Add tests for edge cases, Unicode behavior when relevant, and redaction/sanitization helpers.

## Release / Deployment Notes

String helpers can affect logs and user-visible output.

## Known Caveats

Move domain-specific logic to its owning crate.

## CODEOWNERS

Primary: Rust platform. Secondary: security/privacy for redaction/sanitization.
