# agiworkforce-utils-image

Status: Current
Owner role: Rust platform
Last updated: 2026-05-20
Kind: rust-crate
Criticality: medium

## Purpose

Rust utility crate for image handling, MIME detection, encoding, and image-related helpers.

## Consumers

CLI/Desktop/tooling crates that process image inputs or generated image artifacts.

## Public API / Exports

Rust crate `agiworkforce_utils_image`; public API is defined by `src/lib.rs`.

## What Belongs Here

- Image metadata helpers.
- Encoding/decoding utilities.
- MIME and supported-format helpers.

## What Does Not Belong Here

- UI rendering.
- Image generation provider clients.
- Persistent artifact storage policy.

## Key Files

- `src/lib.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-utils-image`
- `cargo test -p agiworkforce-utils-image`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for untrusted image parsing, size limits, memory usage, metadata stripping, and file path handling.

## Tests Required For Changes

Add tests for supported formats, invalid/corrupt input, size limits, and metadata behavior.

## Release / Deployment Notes

Image parsing is input-sensitive; keep dependencies patched.

## Known Caveats

Do not silently upload or persist images from this utility crate.

## CODEOWNERS

Primary: Rust platform. Secondary: security/privacy for untrusted image processing.
