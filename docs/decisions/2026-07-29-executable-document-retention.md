# Retain Executable Documentation Inputs

Status: Accepted

Date: 2026-07-29

Owners: Platform, CLI, and documentation

## Context

Commit `906fe5cda` treated Markdown as disposable documentation and deleted files
that are consumed by builds, packages, loaders, and repository gates. In
particular, Rust `include_str!` inputs under `apps/cli/src/output_styles/` and
the npm wrapper README disappeared. The same cleanup also removed the
instruction and ownership documents required by the active pre-commit checks.
The repository reached `HEAD` with source code whose non-code inputs were
missing.

File extensions do not determine whether a file is executable infrastructure.
Markdown and text files can be compile-time resources, package payloads, agent
instructions, skill manifests, prompts, store metadata, or policy inputs.

## Decision

Before deleting or moving Markdown or text in bulk, the change owner must:

1. Search code, manifests, scripts, hooks, workflows, and loader conventions for
   consumers of every proposed path.
2. Preserve compile-time resources, package payloads, prompts, `SKILL.md` files,
   agent instructions, store metadata, and guardrail inputs unless their
   consumer is removed in the same change.
3. Run `pnpm check:executable-docs`, the relevant package check, and the
   repository pre-commit hook before the change is accepted.
4. Treat a consumer/path mismatch as a build defect, not as documentation debt.

`scripts/check-executable-docs.mjs` is the fast, dependency-free guard for known
non-code build inputs and literal Rust `include_str!` references to Markdown or
text. It runs in pre-commit and in the always-on Repo Operability workflow via
`pnpm check:llm-operability`, including for documentation-only changes.

## Consequences

- Documentation cleanup must account for code and packaging reachability.
- New executable Markdown or text inputs should be discoverable by a loader or
  added to the guard's explicit input list.
- Removing an executable document requires removing or updating its consumer in
  the same coherent change.
- The guard stays intentionally small; full Rust and package builds remain the
  final verification for release changes.
