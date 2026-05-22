# agiworkforce-utils-cache

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: medium

## Purpose

Rust utility crate for shared cache helpers.

## Consumers

Rust crates that need LRU/time-based cache primitives.

## Public API / Exports

Rust crate `agiworkforce_utils_cache`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Small reusable cache primitives.
- Cache key/value helpers that are not domain-specific.

## What Does Not Belong Here

- User data persistence policy.
- Billing/usage caches.
- Security token caches.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-utils-cache`
- `cargo test -p agiworkforce-utils-cache`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Review caching of user content, tokens, provider payloads, and retention-sensitive data. Prefer explicit TTLs for sensitive values.

## Tests Required For Changes

Add tests for eviction, expiry, concurrency, and key behavior.

## Release / Deployment Notes

Cache behavior can affect correctness and privacy retention.

## Known Caveats

Do not store sensitive data unless the caller explicitly owns retention.

## CODEOWNERS

Primary: Rust platform. Secondary: security/privacy for sensitive caching.
