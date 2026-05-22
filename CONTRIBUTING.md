# Contributing

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

AGI Workforce is proprietary software. We don't accept external code contributions at this time.

For bug reports or feature requests, contact us at https://agiworkforce.com/contact or report security issues to security@agiworkforce.com.

This guide is for internal contributors and coding agents working under human review.

## Start Here

1. Read `AGENTS.md`.
2. Check `PLAN.md` and `TODO.md` for active priorities.
3. Check `docs/agent-context/repo-map.json` for owner paths and commands.
4. Check `docs/agent-context/risk-map.json` for review focus.
5. Check `docs/agent-context/known-flaws.md` before treating a bug as new.
6. Read `docs/engineering/naming-conventions.md` before adding files, folders, packages, commands, or release artifacts.
7. Read the nearest owner README before editing an app, package, crate, or service.

## Work Rules

- Keep file moves separate from behavior changes when possible.
- Do not silently route Local mode to BYOK or managed cloud.
- Do not hardcode model IDs; use provider/model capability metadata.
- Do not commit local state, generated caches, build outputs, downloaded binaries, or secrets.
- Follow `docs/engineering/naming-conventions.md`; user-facing CLI examples use `agi`, not `agiworkforce`, unless documenting the compatibility alias.
- Update the owner README, `PLAN.md`, `TODO.md`, or decision docs when behavior or ownership changes.
- Record completed work in `CHANGELOG.md`.

## Branch And Change Shape

- Use one coherent branch per task.
- Keep write paths narrow and owned.
- For parallel agent work, follow `docs/engineering/agent-native-development.md`.
- For broad refactors, document source path, destination path, behavior-change intent, and rollback plan.

## Verification

Run the smallest useful owner-path check first. Then run broader checks when shared contracts changed.

Common repo checks:

```bash
pnpm check:llm-operability
pnpm lint
pnpm typecheck:all
pnpm test
cargo check --workspace
```

Use `docs/agent-context/commands.json` for surface-specific commands.

## Pull Requests

Use the default PR template unless a specialized template fits better:

- Product or surface change.
- Refactor or move.
- Security or privacy.
- Docs or research.
- Release or infrastructure.

Every PR must state:

- User or repo outcome.
- Owned paths.
- Risk classification.
- Checks run.
- Remaining risk.
- Whether an agent drafted or implemented the change.

High-risk PRs require the relevant secondary owner from `audit/repo-organization/ownership-model-2026-05-20.md`.
