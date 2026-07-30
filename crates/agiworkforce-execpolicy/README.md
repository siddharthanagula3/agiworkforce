# agiworkforce-execpolicy

Status: Current
Owner role: Tooling/security owner
Last updated: 2026-05-20
Kind: rust-crate
Criticality: high

## Purpose

Rust execution-policy engine for prefix-based command decisions.

## Consumers

CLI, desktop/local runtime, sandbox policy integrations, and command execution approval flows.

## Public API / Exports

Rust library `agiworkforce_execpolicy` and binary `agiworkforce-execpolicy`.

## What Belongs Here

- Execution policy parsing and evaluation.
- Starlark/prefix command decision logic.
- Policy CLI entrypoint.

## What Does Not Belong Here

- Shell execution implementation.
- UI approval prompts.
- Provider calls.

## Key Files

- `src/lib.rs`
- `src/main.rs`
- `Cargo.toml`

## Commands

- `cargo check -p agiworkforce-execpolicy`
- `cargo test -p agiworkforce-execpolicy`

## Environment / Secrets

No secrets belong in this crate.

## Security, Privacy, Data Boundaries

Security/privacy review is required for allow/deny semantics, prefix matching, Starlark policy execution, path handling, and default decisions.

## Tests Required For Changes

Add positive and negative policy tests, including ambiguous prefixes and unsafe command attempts.

## Release / Deployment Notes

Policy changes can alter what commands agents are allowed to run.

## Known Caveats

Prefer fail-closed behavior for ambiguous policy decisions.

## CODEOWNERS

Primary: Tooling/security owner. Secondary: Rust platform and CLI lead.
