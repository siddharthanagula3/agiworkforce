# agiworkforce-utils-rustls-provider

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Rust utility crate for rustls provider/certificate setup.

## Consumers

Network and proxy crates that need TLS configuration.

## Public API / Exports

Rust crate `agiworkforce_utils_rustls_provider`; public API is defined by `src/lib.rs`.

## What Belongs Here

- rustls provider initialization.
- Native certificate loading helpers.

## What Does Not Belong Here

- HTTP routing policy.
- Certificate pinning policy unless explicitly owned here.
- Provider API clients.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-utils-rustls-provider`
- `cargo test -p agiworkforce-utils-rustls-provider`

## Environment / Secrets

Do not commit private keys or certificates.

## Security, Privacy, Data Boundaries

Security/privacy review is required for TLS defaults, certificate stores, root loading, and fallback behavior.

## Tests Required For Changes

Add tests or documented manual verification for certificate loading and TLS initialization changes.

## Release / Deployment Notes

TLS behavior affects all networked Rust components.

## Known Caveats

Keep defaults conservative.

## CODEOWNERS

Primary: Rust platform. Secondary: security/privacy for TLS/certificate behavior.
