# agiworkforce-network-proxy

Status: Current
Owner role: Security/privacy owner
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Rust network proxy crate for controlled network access in AGI Workforce runtimes.

## Consumers

Sandboxed runtimes, CLI/Desktop local execution, and future managed/private compute paths.

## Public API / Exports

Rust crate `agiworkforce_network_proxy`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Network proxy configuration and enforcement.
- Allow/deny behavior for outbound traffic.
- Transport-level proxy helpers.

## What Does Not Belong Here

- Provider routing policy.
- UI controls.
- General HTTP client wrappers.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-network-proxy`
- `cargo test -p agiworkforce-network-proxy`

## Environment / Secrets

Do not commit proxy credentials, certificates, or captured traffic.

## Security, Privacy, Data Boundaries

Security/privacy review is required for egress defaults, URL/domain matching, proxy bypasses, TLS handling, credentials, and logging.

## Tests Required For Changes

Add tests for blocked/allowed hosts, bypass attempts, URL parsing, and fail-closed behavior.

## Release / Deployment Notes

Network proxy changes can affect data exfiltration controls.

## Known Caveats

Treat new protocol support as security-sensitive.

## CODEOWNERS

Primary: Security/privacy owner. Secondary: Rust platform.
