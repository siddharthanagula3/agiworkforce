# agiworkforce-plugin-runtime

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Plugin manifest schema and discovery for AGI Workforce CLI and plugin-compatible surfaces.

## Consumers

CLI, Desktop plugin flows, and future plugin marketplace/import paths.

## Public API / Exports

Rust crate `agiworkforce-plugin-runtime`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Plugin manifest schemas.
- Discovery across supported plugin formats.
- Plugin validation helpers.

## What Does Not Belong Here

- Plugin execution sandbox.
- Marketplace UI.
- Provider adapters.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-plugin-runtime`
- `cargo test -p agiworkforce-plugin-runtime`

## Environment / Secrets

Do not commit private plugin credentials or local user plugin manifests unless they are explicit fixtures.

## Security, Privacy, Data Boundaries

Security/privacy review is required for plugin discovery, tool permissions, local path handling, imported manifests, and executable hooks.

## Tests Required For Changes

Add tests for valid/invalid manifests, unsupported formats, path traversal, and permission defaults.

## Release / Deployment Notes

Plugin compatibility affects migration from Claude/Codex/opencode-style ecosystems.

## Known Caveats

Discovery does not imply execution permission.

## CODEOWNERS

Primary: Tooling/security owner. Secondary: CLI/Desktop owners for consuming flows.
