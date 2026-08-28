# Shared Files And Collision Policy

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

These files are high-contention. Feature agents should not edit them unless the task explicitly assigns the shared file.

## Shared Files

- Root workspace manifests: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `Cargo.toml`, `Cargo.lock`.
- Root config: `.gitignore`, `.gitattributes`, `tsconfig.base.json`, `eslint.config.mjs`, `.github/**`.
- Root source-of-truth docs: `AGENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, `CHANGELOG.md`.
- Tool-specific agent adapters: `CLAUDE.md` and hidden tool folders such as `.claude/`, `.codex/`, `.cursor/`, `.opencode/`, `.agents/`.
- Agent operating system: `docs/agent-context/**`, `docs/development/**`.
- Shared contracts: `packages/contracts/types/**`.
- Database migrations: `apps/web/db/neon/**`.
- Native mobile project: `ios/**`.

## Rules

1. Use `docs/agent-context/lanes.json` before assigning work.
2. One implementation agent owns one lane.
3. Shared files go through `repo-operability`, `release-ci`, or the final integrator.
4. Lockfiles are changed only after implementation lanes finish, then regenerated once.
5. Neon migrations are append-only and require backend/data plus security/privacy review.
6. Mobile native project changes require the `mobile-native-store` lane.
7. If an agent discovers it must touch a shared file, it stops and reports the need instead of editing.

## Collision Protocol

When two agents need the same path:

1. Pause the lower-priority task.
2. Decide one owning lane.
3. Convert the second task to read-only review or move it to a disjoint path.
4. Merge the owner lane first.
5. Rebase or restart the second task from the new base.
