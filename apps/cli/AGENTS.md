# CLI Agent Rules

Status: Current
Owner: CLI lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/cli/README.md`.

## Scope

`apps/cli` owns the terminal coding-agent surface and reusable developer-engine behavior that has not yet moved into `crates/`.

## Lane Contract

- Primary lane: `cli-app`.
- Owned write path: `apps/cli/**`.
- Read-only context: `crates/**`, CLI docs, and command registry tests unless the task is explicitly assigned to the Rust platform lane.
- Shared-file edits, Cargo workspace edits, and command-registry crate edits require integrator or `rust-command-registry` ownership.

## High-Risk Areas

- Shell execution, file edits, workspace roots, sandbox policy, MCP, hooks, plugins, slash commands, session replay/forking, and Local/BYOK/Managed routing.
- Do not weaken approvals or expand filesystem/network access without an explicit security/privacy review.
- Do not panic in production paths; prefer typed errors and user-actionable diagnostics.

## Verification

- Small change: `cargo check -p agiworkforce-cli`
- CLI behavior: `cargo test -p agiworkforce-cli --lib`
- Command registry changes: `cargo test -p agiworkforce-command-registry --test slash_palette_golden`
