# Naming Conventions

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

This is the locked naming policy for AGI Workforce. New files, docs, packages, branches, commands, and release notes should follow this unless a current decision doc explicitly overrides it.

## External Standards

Use these stable conventions where they fit:

- Keep a Changelog for `CHANGELOG.md`: `Unreleased` first, reverse chronological releases, and grouped `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` sections. Source: https://keepachangelog.com/en/1.1.0/
- Semantic Versioning for public packages, crates, app release channels, and CLI releases. Public API changes drive major/minor/patch meaning. Source: https://semver.org/
- Conventional Commits for commit and PR squash titles: `<type>(<scope>): <description>`. Source: https://www.conventionalcommits.org/en/v1.0.0/
- GitHub CODEOWNERS for path ownership and review routing. Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

## Product And CLI Names

- Public brand: `AGI`.
- Formal platform name: `AGI Workforce`.
- Repo, package namespace, crate prefix, database/service identifiers: `agiworkforce`.
- Primary CLI command: `agi`.
- Compatibility CLI alias: `agiworkforce`.
- Do not rename repo paths, npm packages, Cargo packages, bundle IDs, database schemas, auth clients, or historical storage paths just because the public command is `agi`.
- User-facing CLI examples must prefer `agi`. Use `agiworkforce` only when documenting the backward-compatible alias or an internal package/path name.

## Surface And Mode Names

User-facing surface and mode labels use the AGI-prefixed family. Never ship Claude's product terms (for example "Cowork") as our own UI, marketing, route, or doc labels.

- Surfaces: `AGI Desktop`, `AGI Web`, `AGI Mobile`, `AGI CLI`, `AGI in Chrome`, `AGI for VS Code`.
- Modes and product lines: `AGI Work` (agentic scheduled / dispatch / local-file work; replaces the former "Cowork" label), `AGI Code` (coding surface), `AGI Cloud` (managed cloud), `AGI Agent` / `AGI agents` (delegated tool-using sessions and subagents).
- `Cowork` is a Claude product term. Do not use it as an AGI surface, mode, route, or marketing name. It may appear ONLY as an explicit, attributed competitor reference (for example "vs Claude Cowork"), never as our own feature name.
- This rule applies to UI strings, marketing copy, page titles/metadata, public routes, and docs. Internal identifiers (file paths, component names, store keys) are not required to change for branding alone (see Product And CLI Names), but new code should prefer the AGI Work naming.

## Root Control Files

Keep only these active control files at repo root:

- `AGI_WORKFORCE.md` - compact platform entry point and locked product/architecture summary.
- `PLAN.md` - active strategy and transition plan.
- `TODO.md` - active execution checklist.
- `CHANGELOG.md` - completed work log.
- `README.md`, `BUILD.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `LICENSE`, `NOTICE`.

Do not create new root docs such as `ROADMAP.md`, `PRD.md`, `TASKS.md`, `FIXME.md`, or ad hoc dated reports. Put them in the folders below.

## Planning And Work Logs

- Use `PLAN.md` for active strategic plan and phase structure.
- Use `TODO.md` for current executable tasks.
- Use `CHANGELOG.md` for completed work.
- Do not add `TASKS.md`, `FIXME.md`, or `AUDIT_LOG.md` at root.
- Use inline `TODO(<owner-or-area>):` comments only for small local follow-up notes that are next to the affected code.
- Put durable findings in `docs/agent-context/known-flaws.md`, `docs/security/`, or `audit/`.

## Directory Names

- Use lowercase kebab-case for new documentation, report, and audit directories: `docs/current`, `docs/agent-context`, `audit/tool-parity`.
- Use existing ecosystem casing where the platform requires it: `.github`, `CODEOWNERS`, `Cargo.toml`, `package.json`, Expo/Tauri/native folders.
- Apps live in `apps/<surface>`.
- Shared TypeScript packages live in `packages/<domain>`.
- Shared Rust crates live in `crates/agiworkforce-<domain>`.
- Deployable services live in `services/<service-name>`.
- Neon migrations live in `apps/web/db/neon`.
- Do not create cross-app imports; move shared code into `packages/` or `crates/`.
- Mobile root `hooks/` and `lib/` are frozen compatibility roots unless a repo guardrail explicitly allowlists the file. Feature-owned Mobile code belongs under `apps/mobile/src/features/<domain>/`; platform, storage, integration, and UI primitives belong under the matching `apps/mobile/src/*` layer.

## File Names

- Markdown docs: lowercase kebab-case, except root all-caps convention files such as `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CODEOWNERS`.
- Active plan docs: `docs/plans/<topic>.md`.
- Historical archive folders: `docs/archive/YYYY-MM-DD-<reason>/`.
- Audit/evidence files: `audit/<area>/<topic>-YYYY-MM-DD.md` when the date matters; otherwise `audit/<area>/<topic>.md`.
- Research summaries: `docs/research/<topic>-YYYY-MM-DD.md`.
- Design prompts and generated design specs: `docs/design/<topic>-YYYY-MM-DD.md`.
- TypeScript/React source files should follow the local app's existing convention; new domain feature files should prefer kebab-case filenames and PascalCase exported React components.
- Rust source files and modules use snake_case.
- Tests stay near the code unless the local package already centralizes tests.

## Package And Module Names

- npm packages: `@agiworkforce/<domain>` for first-party packages.
- platform-specific CLI npm packages: `@agiworkforce/cli-<os>-<arch>`.
- Rust crates: `agiworkforce-<domain>` for shared crates and `agiworkforce-cli` for the CLI Cargo package.
- TypeScript import aliases should point to packages or same-app domains, not another app's source tree.
- Public API names should describe the domain, not implementation history. Avoid names that mention reference projects unless they are explicit compatibility adapters.
- Shared persistent or wire contracts live in `packages/types`. Local duplicate contract shapes need an explicit migration baseline and removal plan.
- UI files should not call network/auth clients directly. Keep provider, Neon/Clerk, browser/computer-use, generated-file, and transport mechanics in feature services, integrations, packages, or service-layer modules.

## Branches, Commits, PRs

- Branches: `work/<area>-<short-goal>-YYYY-MM-DD` for normal work; `fix/<area>-<short-goal>-YYYY-MM-DD` for targeted fixes.
- Worktrees: `.worktrees/<area>-<short-goal>`.
- Conventional commit types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `style`.
- Commit/PR title subject should be lowercase and no more than 100 characters.
- Prefer one coherent change per PR. Broad mechanical moves need an explicit move plan and verification.

## Hooks

- `.husky/commit-msg` runs `pnpm exec commitlint --edit "$1"`.
- `.husky/pre-commit` runs `pnpm exec lint-staged`, `pnpm check:structure-conventions`, and `pnpm check:agent-context`.
- `.husky/pre-push` runs `pnpm check:llm-operability`, `git diff --check`, and `git diff --cached --check`.
- `SKIP_PRE_PUSH=1` may skip pre-push only for emergency pushes; the skipped checks must be recorded in the PR or handoff.
- `pnpm check:hooks` enforces this policy.

## Version And Release Names

- Public package and crate versions use SemVer.
- CLI release tags use `v-cli-X.Y.Z`.
- Desktop release tags use `v-desktop-X.Y.Z`.
- App-store/mobile release versions should still map back to a SemVer package version and build number.
- Changelog dates use ISO format: `YYYY-MM-DD`.

## Enforcement

- `pnpm check:structure-conventions` protects the highest-value naming and placement rules.
- `pnpm check:mobile-hygiene` protects Mobile feature ownership, frozen root hooks/lib imports, and UI/service-layer separation.
- `pnpm check:service-layer` protects orchestration-vs-service guidance and canonical shared-contract ownership.
- `pnpm check:llm-operability` is required after docs, repo-structure, agent-context, generated-artifact, or boundary changes.
- If a convention is intentionally broken, add a current decision doc and update this file in the same change.
