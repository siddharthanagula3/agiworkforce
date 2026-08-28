# Naming Conventions

Status: Current
Owner: Platform lead
Last updated: 2026-07-11

This is the locked naming policy for AGI Workforce. New files, docs, packages, branches, commands, and release notes should follow this unless a current decision doc explicitly overrides it.

As of 2026-06-28 this policy also mandates the structural / file-granularity conventions in the "Structural & File-Granularity Conventions" section below (folder-per-tool, co-located prompt/UI/logic, barrels, one concern per file), adapted from best-in-class agent codebases. All new code follows them immediately; existing code migrates opportunistically per `docs/strategy/15-structure-and-granularity-conventions.md` and `scripts/migrate-structure.mjs`.

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

- `AGENTS.md` - the canonical, tool-neutral agent contract.
- `CLAUDE.md` - a thin Claude Code adapter over it.
- `ARCHITECTURE.md` - the compact repository map.
- `PLAN.md` - active strategy and phase structure.
- `CHANGELOG.md` - completed work log.
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `THIRD_PARTY_LICENSES.md`.

`scripts/check-repo-organization.mjs` holds the enforced allowlist; this list
describes it and must not drift from it. `TODO.md`, `BUILD.md`, `NOTICE` and
`AGI_WORKFORCE.md` were named here long after they stopped existing.

Do not create new root docs such as `ROADMAP.md`, `PRD.md`, `TASKS.md`, `FIXME.md`, or ad hoc dated reports. Put them in the folders below.

## Planning And Work Logs

- Use `PLAN.md` for active strategic plan and phase structure.
- Put dated executable queues in `docs/work/`, not at the repository root.
- Use `CHANGELOG.md` for completed work.
- Do not add `TASKS.md`, `FIXME.md`, or `AUDIT_LOG.md` at root.
- Use inline `TODO(<owner-or-area>):` comments only for small local follow-up notes that are next to the affected code.
- Put durable findings in `docs/agent-context/known-flaws.md` or `docs/security/`. (The former `reports/`, `tasks/`, and `docs/archive/` root directories were removed repo-wide on 2026-06-28 — do not cite them as existing or route new work there without a current decision doc. The root `audit/` directory remains live as the evidence-ledger root, e.g. `audit/capability-gaps.csv`.)

## Directory Names

- Use lowercase kebab-case for new documentation directories: `docs/architecture`, `docs/agent-context`, `docs/research`.
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
- There is no archive directory and one must not be created. Historical material lives in git history.
- Durable findings belong in `docs/agent-context/known-flaws.md`; decision/evidence ledgers live under the live root `audit/` directory (e.g. `capability-gaps.csv`, `inventory.json`).
- Research summaries: `docs/research/<topic>-YYYY-MM-DD.md`.
- Design prompts and generated design specs: `docs/design/<topic>-YYYY-MM-DD.md`.
- TypeScript/React source files should follow the local app's existing convention; new domain feature files should prefer kebab-case filenames and PascalCase exported React components.
- Rust source files and modules use snake_case.
- Tests stay near the code unless the local package already centralizes tests.

## Structural And File-Granularity Conventions

Canonical as of 2026-06-28. Full version + CI enforcement: `docs/strategy/15-structure-and-granularity-conventions.md`.

- **Folder-per-feature.** Every tool, command, agent, and major UI feature is a folder, not a loose file.
- **Co-locate by feature.** A tool's logic, `prompt`, `UI`, `constants`, validators, and `types` live in the same folder — never split across `prompts/`, `ui/`, `logic/`.
- **Barrels.** Each folder exposes one public surface via `index.ts` (TS) / `mod.rs` (Rust); consumers import the folder, not deep paths.
- **One concern per file.** One tool/hook/migration per file; soft cap ~300 lines, split beyond.
- **Tool layout (TS):** `tools/<Name>Tool/{<Name>Tool.ts, prompt.ts, UI.tsx, constants.ts, <helpers>.ts, index.ts}`.
- **Tool layout (Rust):** `tools/<tool>/{mod.rs, prompt.rs, validation.rs, ui.rs}` implementing the `Tool` trait.
- **Command layout:** `commands/<name>/{<name>.tsx, index.ts}`.
- **Hooks:** one per file, `use` + PascalCase (`useToolPermission.ts`); sub-group when many.
- **utils/ discipline:** multi-file domains get a subfolder (`utils/bash/`); cross-cutting one-offs stay flat (`utils/uuid.ts`). Banned inside a feature: `helpers.ts`, `misc.ts`, `common.ts`, catch-all `utils.ts`.
- **Casing:** PascalCase for React components/classes and `.tsx`; camelCase for TS utility modules; snake_case for Rust files/modules; co-located prompts `prompt.ts`/`prompt.rs`; per-feature `constants.ts`/`types.ts`.
- **Generated/vendored isolation:** codegen under `*/generated/` (never hand-edited); ported third-party attributed in `THIRD_PARTY_LICENSES.md` + `PORTING-TRACKER.md`.
- **Migration is opportunistic** (no big-bang): new code complies now; existing code converts via `scripts/migrate-structure.mjs` (import-transparent moves) as each subsystem is touched.

## Package And Module Names

- npm packages: `@agiworkforce/<domain>` for first-party packages.
- platform-specific CLI npm packages: `@agiworkforce/cli-<os>-<arch>`.
- Rust crates: `agiworkforce-<domain>` for shared crates and `agiworkforce-cli` for the CLI Cargo package.
- TypeScript import aliases should point to packages or same-app domains, not another app's source tree.
- Public API names should describe the domain, not implementation history. Avoid names that mention reference projects unless they are explicit compatibility adapters.
- Shared persistent or wire contracts live in `packages/contracts/types`. Local duplicate contract shapes need an explicit migration baseline and removal plan.
- UI files should not call network/auth clients directly. Keep provider, Neon/Clerk, browser/computer-use, generated-file, and transport mechanics in feature services, integrations, packages, or service-layer modules.

## Branches, Commits, PRs

- Branches: `work/<area>-<short-goal>-YYYY-MM-DD` for normal work; `fix/<area>-<short-goal>-YYYY-MM-DD` for targeted fixes.
- Worktrees: `.worktrees/<area>-<short-goal>`.
- Conventional commit types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `style`.
- Commit/PR title subject should be lowercase and no more than 100 characters.
- Prefer one coherent change per PR. Broad mechanical moves need an explicit move plan and verification.

## Hooks

- `.husky/commit-msg` runs `pnpm exec commitlint --edit "$1"`.
- `.husky/pre-commit` runs `pnpm exec lint-staged`, `pnpm check:audit-inventory`, `pnpm check:executable-docs`, `pnpm check:structure-conventions`, and `pnpm check:llm-failures:staged`.
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
