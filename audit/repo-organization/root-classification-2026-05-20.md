# Root File Classification

Status: Current assessment
Owner: Platform lead
Last updated: 2026-05-20

Purpose: classify every tracked root-level file before cleanup moves.

## Decision Categories

- `keep-root`: belongs at repo root.
- `move-docs`: move under `docs/`.
- `move-audit`: move under `audit/`.
- `move-reports`: move under `reports/`.
- `move-archive`: move under `_archive/` or `docs/archive/`.
- `review`: needs owner decision before moving.

## Root Classification

| File                                 | Classification | Target / reason                                                           |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------- |
| `.claudeignore`                      | keep-root      | Tool ignore contract.                                                     |
| `.gitattributes`                     | keep-root      | Git behavior.                                                             |
| `.gitignore`                         | keep-root      | Git behavior.                                                             |
| `.npmrc`                             | keep-root      | Package manager behavior.                                                 |
| `.nvmrc`                             | keep-root      | Node version contract.                                                    |
| `.prettierignore`                    | keep-root      | Formatter behavior.                                                       |
| `.prettierrc.json`                   | keep-root      | Formatter behavior.                                                       |
| `.vercelignore`                      | keep-root      | Deploy behavior.                                                          |
| `AGENTS.md`                          | keep-root      | Canonical tool-neutral coding-agent entry.                                |
| `AGI_WORKFORCE.md`                   | keep-root      | Platform entry point.                                                     |
| `AUDIT_LOG.md`                       | review         | Keep root only if treated as living fire log; otherwise move to `audit/`. |
| `BUILD.md`                           | keep-root      | Build/test entry point.                                                   |
| `CHANGELOG.md`                       | keep-root      | Release/change history.                                                   |
| `CLAUDE.md`                          | keep-root      | Claude-specific mirror of `AGENTS.md`.                                    |
| `CONTRIBUTING.md`                    | keep-root      | Contributor workflow; needs expansion.                                    |
| `Cargo.lock`                         | keep-root      | Rust workspace lockfile.                                                  |
| `Cargo.toml`                         | keep-root      | Rust workspace manifest.                                                  |
| `LICENSE`                            | keep-root      | Legal.                                                                    |
| `ONBOARDING.md`                      | keep-root      | Human onboarding entry point.                                             |
| `PLAN.md`                            | keep-root      | Active transition plan.                                                   |
| `README.md`                          | keep-root      | User-facing repo entry.                                                   |
| `THIRD_PARTY_LICENSES.md`            | keep-root      | License obligations.                                                      |
| `TODO.md`                            | keep-root      | Active transition checklist.                                              |
| `app.json`                           | review         | Expo/root app config; decide if root or mobile-owned.                     |
| `commitlint.config.cjs`              | keep-root      | Commit policy.                                                            |
| `docker-compose.yml`                 | keep-root      | Root local dev services.                                                  |
| `eslint.config.mjs`                  | keep-root      | Lint policy.                                                              |
| `node-version.txt`                   | keep-root      | Node version helper; verify duplicate with `.nvmrc`.                      |
| `ollama-manifest.json`               | review         | Product/runtime manifest; decide owner path.                              |
| `opencode.json`                      | keep-root      | opencode root config.                                                     |
| `package.json`                       | keep-root      | JS workspace manifest.                                                    |
| `pnpm-lock.yaml`                     | keep-root      | JS workspace lockfile.                                                    |
| `pnpm-workspace.yaml`                | keep-root      | JS workspace config.                                                      |
| `skills-lock.json`                   | review         | Agent/skills lock; classify with tool-folder contract.                    |
| `tsconfig.base.json`                 | keep-root      | TS base config.                                                           |
| `vercel.json`                        | keep-root      | Root deploy config.                                                       |
| `AGIWORKFORCE_IMPLEMENTATION_LOG.md` | moved-archive  | Moved to `docs/archive/2026-05-14-reverse-engineering-campaign/`.         |
| `MASTER_PLAN.md`                     | moved-archive  | Moved to `docs/archive/2026-05-14-reverse-engineering-campaign/`.         |
| `REFERENCE_INDEX.md`                 | moved-docs     | Moved to `docs/reference/`.                                               |
| `REFERENCE_STRUCTURE.md`             | moved-docs     | Moved to `docs/reference/`.                                               |
| `app-after-fill.md`                  | move-reports   | Scratch/capture note.                                                     |
| `app-file-editor.md`                 | move-reports   | Scratch/capture note.                                                     |
| `claude-design-after-limit-close.md` | move-reports   | Scratch/capture note.                                                     |
| `claude-design-files-click.md`       | move-reports   | Scratch/capture note.                                                     |
| `claude-design-iframe-depth7.md`     | move-reports   | Scratch/capture note.                                                     |
| `claude-design-r6-file-selected.md`  | move-reports   | Scratch/capture note.                                                     |
| `final-model-picker-artboard.png`    | move-reports   | Design artifact.                                                          |
| `final-model-picker.png`             | move-reports   | Design artifact.                                                          |
| `final-r6-canonical-section.png`     | move-reports   | Design artifact.                                                          |
| `final-r6-section-depth6.md`         | move-reports   | Scratch/capture note.                                                     |
| `final-r6-snapshot.md`               | move-reports   | Scratch/capture note.                                                     |
| `index-after-app-save.md`            | move-reports   | Scratch/capture note.                                                     |
| `r6-after-provider-trim-attempt.md`  | move-reports   | Scratch/capture note.                                                     |
| `r6-canonical-section.png`           | move-reports   | Design artifact.                                                          |
| `r6-file-open.md`                    | move-reports   | Scratch/capture note.                                                     |

## Next Moves

1. Move `move-reports` files into `reports/root-scratch-archive/2026-05-20/`. Done.
2. Archive `MASTER_PLAN.md` and `AGIWORKFORCE_IMPLEMENTATION_LOG.md`. Done.
3. Decide whether `AUDIT_LOG.md` remains root.
4. Decide owner path for `app.json`, `ollama-manifest.json`, and `skills-lock.json`.
5. Tighten `scripts/check-repo-organization.mjs` after the moves.
