---
id: "ENG-build-and-test"
type: "engineering"
title: "Build, test and checks"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Build, test and checks

Commands to build, type-check, lint and test every AGI Workforce app, from root package.json and docs/agent-context/commands.json. It covers the two priority tiers (priority-level-1, security), the guard chain (check:llm-operability) and the traps: web and desktop use Vitest 5 while the root uses Vitest 4, the web type check needs an 8 GB heap, mobile Jest runs in shards, and loaded machines cause false failures.

## Purpose

This page tells an engineer or an LLM how to check a change in the AGI Workforce monorepo (pnpm workspaces plus a Cargo workspace, run through Turborepo). It lists the command for each app, what the priority test tiers and the guard chain do, and the traps that cause false failures. Apps covered: surface:web, surface:desktop, surface:mobile, surface:cli, surface:vscode, surface:chrome.

Status note: everything here is implementation status read from code [code]. No run was made for this page, so nothing is verified by execution.

Related pages: SYS-chat-turn-pipeline is unrelated to checks, but the model catalog guard (`sync:models:check`) touches the model catalog. See the catalog file `packages/ai/model-registry/catalog/models.curation.json` (AGENTS.md section 4).

## Procedure

The verification ladder is in file:docs/development/agent-workflow.md (section 'Verification Ladder') [requirement]:

1. Run the smallest check for the owner path (the app or package you changed).
2. If you changed shared packages, schemas, crates or provider adapters, run the shared-contract checks.
3. If you changed docs, repo structure, agent context, generated files or import boundaries, run `pnpm check:llm-operability` (the guard chain).
4. Run full app suites only when the blast radius justifies it.

AGENTS.md section 12 adds: say what you ran, never report success without running it [requirement]. Stage files first, then run guards, because most guards read the working tree (`git ls-files -co`), not HEAD [requirement].

On the owner's 16 GB machine, wrap commands: heavy jobs (builds, full suites, `tsc`, cargo, dev servers, browsers, emulators, `git push`) go through `scripts/dev/heavy-job.sh`; one test file, one package or lint on touched files goes through `scripts/dev/light-job.sh` [code] (scripts/dev/heavy-job.sh:1-4, scripts/dev/light-job.sh:1-4). The hook `.claude/hooks/heavy-job-gate.py` denies unwrapped heavy commands on machines with 24 GB or less [requirement] (CLAUDE.md, Delegation). This was seen live: a plain `grep` over package.json plus app names was blocked with 'This machine has 16 GB of RAM' [executed in this session only, not a project record].

Before a push, the pre-push hook runs the guard chain and then lint plus type-check for affected packages (see Commands).

## Commands

All root scripts are in file:package.json (lines 140-441) [code]. The inventory `docs/agent-context/commands.json` (lastUpdated 2026-11-09) lists the same commands per surface [code].

### Repo-wide

| Purpose | Command | Source |
|---|---|---|
| Install | `pnpm install` (Node >=24.15.0 <25, pnpm 10.34.7) | package.json:12-15 |
| Lint all except Chrome extension | `pnpm lint` = `turbo run lint --filter='!@agiworkforce/extension'` | package.json:141 |
| Lint Chrome extension | `pnpm lint:extension` | package.json:142 |
| Format / check | `pnpm format`, `pnpm format:check` (prettier) | package.json:399-400 |
| Type-check desktop only | `pnpm typecheck` | package.json:401 |
| Type-check everything | `pnpm typecheck:all` = `turbo run typecheck` | package.json:418 |
| Test all | `pnpm test` = `turbo run test --concurrency=2` | package.json:402 |
| Test affected | `pnpm test:affected` | package.json:403 |
| Priority tier 1 | `pnpm test:l1` = `node scripts/run-priority-tier.mjs priority-level-1` | package.json:404 |
| Security tier | `pnpm test:security` = `... run-priority-tier.mjs security` | package.json:405 |
| Coverage | `pnpm test:coverage` = `node scripts/run-coverage.mjs --coverage.thresholds.lines=75` | package.json:406 |
| CI test gate | `pnpm test:ci` = `test:l1` then `test:coverage` | package.json:407 |
| Build all but desktop | `pnpm build` / `pnpm build:all` | package.json:410-411 |
| Build desktop | `pnpm build:desktop` | package.json:412 |
| Docs check | `pnpm docs:check` (doc-status, non-md-artifacts, reference-integrity, capability-preconditions, readme-facts) | package.json:417 |
| Guard chain | `pnpm check:llm-operability` | package.json:397 |
| Rust | `cargo check --workspace`; `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`; `cargo fmt --all -- --check`; `cargo deny check bans sources licenses` | commands.json repoWide |
| Model catalog | `pnpm sync:models`, `pnpm sync:models:check`, `pnpm models:families` | package.json:386-394 |
| Protocol types | `pnpm generate:protocol-types`, `pnpm check:protocol-types` | package.json:420 |

### Per app

| App | Type-check | Test | Build | Lint |
|---|---|---|---|---|
| surface:web (`@agiworkforce/web`) | `tsc --noEmit` | `vitest run` (Vitest 5); e2e `playwright test` | `pnpm notices && next build` | `eslint . --max-warnings=0` |
| surface:desktop (`@agiworkforce/desktop`) | `tsc --noEmit && pnpm run typecheck:electron` | `vitest run` (Vitest 5); e2e `wdio`; DOM e2e `playwright test`; Rust `cargo test -p agiworkforce-desktop --lib`; native GPUI tests `test:gpui*` | `build:release` (native host, vite build, tauri build); `build:electron` | `eslint . --ext ts,tsx --max-warnings=0` |
| surface:mobile (`@agiworkforce/mobile`) | `tsc --noEmit && tsc --noEmit -p tsconfig.scripts.json` | `pnpm run test:node && node scripts/run-jest-shards.mjs` (Jest 29); `test:local` = `jest --runInBand --forceExit`; e2e `detox` | `eas build --profile development/preview/production` | `eslint . --ext .ts,.tsx --max-warnings=0` |
| surface:cli (`agiworkforce-cli`, Rust) | `cargo check -p agiworkforce-cli` | `cargo test -p agiworkforce-cli --lib` | `cargo build --release -p agiworkforce-cli` | `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings -D unsafe-code` |
| surface:chrome (`@agiworkforce/extension`) | `tsc --noEmit` | `vitest run` (Vitest 4); e2e `pnpm build && node e2e/smoke.mjs` | `vite build && BUILD_TARGET=content vite build` | `pnpm lint:extension` |
| surface:vscode (`agi-workforce`, folder apps/extension-vscode) | `tsc --noEmit` | `vitest run`; `test:webview`; `test:integration` | `pnpm run compile` | theme-token check then eslint |

Sources: apps/web/package.json:7-18; apps/desktop/package.json:10-58; apps/mobile/package.json:39-48; apps/extension/package.json:25-35; apps/extension-vscode/package.json:1573-1583; docs/agent-context/commands.json (surfaces) [code].

Single test: `pnpm --filter <workspace-package> test <file-or-pattern>`. For web, use the package script or `pnpm exec vitest` inside apps/web.

### Hooks (husky)

- `.husky/pre-push`: runs `bash scripts/prepush-clean-worktree.sh` (a clean detached worktree at HEAD running `pnpm check:llm-operability`), or with `AGI_PREPUSH_ON_TREE=1` runs the chain on the live tree, then `turbo run lint typecheck --affected --concurrency=2` with `NODE_OPTIONS` defaulting to `--max-old-space-size=8192`, then `git diff --check`. `SKIP_PRE_PUSH=1` skips it [code] (.husky/pre-push:1-20; scripts/prepush-clean-worktree.sh:1-25).
- `.husky/pre-commit` and `.husky/commit-msg` exist; their contents were not read [unknown].

## Rules and traps

**Priority tiers.** `scripts/run-priority-tier.mjs <token>` scans `apps/*/__tests__` for test files whose path contains the token, then runs `pnpm --filter <pkg> run test <token>` in each owning app [code] (scripts/run-priority-tier.mjs:11-65). If no app matches, it exits 1 on purpose, so a tier cannot pass while empty [code] (:34-45). AGENTS.md says only `priority-level-1` and `security` resolve [requirement]. Directories found: `apps/web/__tests__/priority-level-1`, `apps/mobile/__tests__/priority-level-1`, `apps/extension/__tests__/priority-level-1`, `apps/web/__tests__/security`, plus `security` folders inside each priority-level-1 folder [code, found by find].

**Guard chain.** `pnpm check:llm-operability` runs `scripts/run-guard-chain.mjs` with a long `&&` list of `pnpm <script>` steps (package.json:397) [code].
- Every step must match `^pnpm (--filter ...)? script$`; a repeated step or empty step throws (run-guard-chain.mjs:12-34).
- It runs four at a time by default; `AGI_GUARD_CONCURRENCY` sets 1 to 16 (run-guard-chain.mjs:23-27, 36-47).
- Four steps run alone first because they run cargo or rewrite tracked files: `check:protocol-types`, `check:cross-version-matrix`, `check:script-tests`, `check:rust-fmt` (run-guard-chain.mjs:15-20).
- A guard that fails beside others is re-run alone; it counts as green only if it then passes. The summary lists failures at the end (run-guard-chain.mjs:150-190).
- Most guards read the working tree, not HEAD. Stage first, run, then commit. `check:llm-failures:staged` reads index blobs [requirement] (AGENTS.md section 12).
- Guard names include `check:boundaries`, `check:trust-boundaries`, `check:model-id-literals`, `check:model-catalog`, `check:hardcoded-endpoints`, `check:css-tokens`, `check:secrets`, `check:db-isolation`, `check:neon-migrations`, `check:lane-ownership` (commands.json; package.json:144-295).

**Separate test-runner version in the web app.** `apps/web` and `apps/desktop` declare `vitest ^5.1.0` (apps/web/package.json:207; apps/desktop/package.json:182). The root package.json, `apps/extension` and `apps/extension-vscode` declare `^4.1.12` (package.json:469; apps/extension/package.json:72; apps/extension-vscode/package.json:1628) [code]. So the root binary is a different major. AGENTS.md says to run web tests through the package script or `pnpm exec vitest` inside apps/web, never the root binary, since mixed runs break `.rejects` [requirement]. `scripts/run-coverage.mjs` handles this by resolving each project's own vitest through `createRequire` at that project's folder (run-coverage.mjs:30-36) [code].

**Heap size for the web type check.** apps/web `typecheck` is plain `tsc --noEmit` with no heap flag (apps/web/package.json:12) [code]. AGENTS.md says it dies with SIGABRT unless `NODE_OPTIONS=--max-old-space-size=8192` is set [requirement]. Where the flag is applied: CI sets it in several jobs (.github/workflows/ci.yml:283, 442, 550, 1256, 1417), `turbo.json` passes `NODE_OPTIONS` through (turbo.json:5), and pre-push defaults it (.husky/pre-push) [code]. So a bare `pnpm typecheck:all` on a laptop needs you to export it yourself [inferred].

**Loaded-machine failures.** AGENTS.md: a loaded machine fails tests that pass alone; long suites time out under browser or build work and look like assertion failures. Check `uptime` and re-run in isolation before chasing an intermittent red [requirement]. `pnpm test` limits Turbo to `--concurrency=2` (package.json:402) [code]. docs/development/troubleshooting.md also covers isolating a failing test [requirement, partly read].

**Mobile Jest.** One in-band Jest process keeps every module graph and runs out of heap, so `run-jest-shards.mjs` splits files into shards of at most 120 per process (apps/mobile/scripts/run-jest-shards.mjs:8-12, 26-30) [code]. `test:local` runs `--runInBand` and is not sharded.

**Other rules.**
- Commit subjects are lowercase conventional commits; capitalized tokens (filenames too) are rejected by commitlint [requirement] (AGENTS.md section 12).
- Never hand-edit lockfiles (`pnpm-lock.yaml`, `Cargo.lock`); a hook blocks writes [requirement] (CLAUDE.md).
- New root files must be registered in `scripts/check-repo-organization.mjs` [requirement].
- `skills-lock.json` pins skill hashes; any edit fails CI until `node scripts/verify-skills-lock.mjs --regenerate` [requirement] (CLAUDE.md).
- Turbo dry runs prove task selection, not that tasks pass [requirement] (agent-workflow.md).
- Never weaken a test, lint rule or guard to make a change pass [requirement] (AGENTS.md section 9).

## Where the canonical document is

| Question | Canonical home | Basis |
|---|---|---|
| Which command for which app | file:docs/agent-context/commands.json | [requirement] (AGENTS.md section 12 names it the inventory) |
| Actual scripts | file:package.json and each app's package.json | [code], rank 1-2 in AGENTS.md section 2 |
| Validation rules and traps | file:AGENTS.md section 12 | [requirement] |
| Task shape, verification ladder, turbo graph | file:docs/development/agent-workflow.md | [requirement] |
| Task graph | file:turbo.json | [requirement] (agent-workflow.md says it is canonical) |
| CI jobs and pre-push | file:docs/development/ci-and-deploys.md, .github/workflows/ci.yml, .husky/pre-push | [code]/[requirement] |
| Guard chain list and runner | package.json:397 and scripts/run-guard-chain.mjs | [code] |
| Failure triage | file:docs/development/troubleshooting.md | [requirement], not fully read |
| Local resource wrappers | scripts/dev/heavy-job.sh, scripts/dev/light-job.sh, CLAUDE.md Delegation | [code]/[requirement] |

When prose and code disagree, code wins (AGENTS.md section 2).

## Gaps in the documents

- AGENTS.md section 12 describes the separate Vitest major as an apps/web issue only. In code, apps/desktop also uses Vitest 5, and the root, Chrome and VS Code packages use Vitest 4 [code]. The risk applies to desktop too.
- AGENTS.md says `pnpm typecheck` covers only desktop; confirmed (package.json:401). commands.json has no entry for the heap flag; the web `typecheck` entry is a bare command [code].
- commands.json (lastUpdated 2026-11-09) does not list some scripts that exist, for example `check:script-tests`, `check:readme-facts`, mobile `test:local` and `test:handles`, desktop `test:smoke` and `test:gpui:search`, or the VS Code `test:integration:vsix` variants [code, compared by reading]. The full guard chain membership is not reproduced in any doc; it exists only in package.json:397.
- docs/development/agent-workflow.md is dated 2026-09-19 and does not mention the clean-worktree pre-push, the heavy-job wrappers, or the guard chain's re-run-alone rule.
- No document read states which guards run in CI versus only locally [unknown]; ci.yml was only grepped for the heap flag.
- Status of the full suites (passing or failing today) is not recorded anywhere I read [unknown].

## Key facts

| Fact | Basis | Source |
|---|---|---|
| pnpm typecheck only checks desktop; pnpm typecheck:all runs turbo typecheck for every package. | read in the code | `package.json:401`; `package.json:418`; `AGENTS.md section 12` |
| pnpm test runs turbo test with concurrency 2; test:affected adds --affected. | read in the code | `package.json:402-403` |
| Priority tiers are run by scripts/run-priority-tier.mjs, which matches a token against test file paths under apps/*/__tests__ and runs each owning app's test script with the token. | read in the code | `scripts/run-priority-tier.mjs:11-65` |
| A tier that matches no tests exits 1, so an empty tier cannot pass. | read in the code | `scripts/run-priority-tier.mjs:34-45` |
| Only priority-level-1 and security resolve as tiers (pnpm test:l1, pnpm test:security). | stated requirement | `AGENTS.md section 12`; `package.json:404-405` |
| test:ci is test:l1 followed by test:coverage with a 75 percent line threshold. | read in the code | `package.json:406-407` |
| The guard chain is pnpm check:llm-operability, which runs scripts/run-guard-chain.mjs over a list of pnpm scripts. | read in the code | `package.json:397`; `scripts/run-guard-chain.mjs` |
| The guard chain runs 4 guards at a time by default; AGI_GUARD_CONCURRENCY accepts 1 to 16. | read in the code | `scripts/run-guard-chain.mjs:23-27`; `scripts/run-guard-chain.mjs:36-47` |
| check:protocol-types, check:cross-version-matrix, check:script-tests and check:rust-fmt run alone before the concurrent pass. | read in the code | `scripts/run-guard-chain.mjs:15-20` |
| A guard that fails beside others is re-run alone and counts as recovered only if it then passes. | read in the code | `scripts/run-guard-chain.mjs:150-190` |
| Most guards read the working tree, so stage first, run guards, then commit; check:llm-failures:staged reads index blobs. | stated requirement | `AGENTS.md section 12` |
| apps/web and apps/desktop use vitest ^5.1.0; the root, extension and extension-vscode use ^4.1.12. | read in the code | `apps/web/package.json:207`; `apps/desktop/package.json:182`; `package.json:469`; `apps/extension/package.json:72`; `apps/extension-vscode/package.json:1628` |
| Web tests must run through the package script or pnpm exec vitest inside apps/web, not the root binary, because mixed majors break .rejects. | stated requirement | `AGENTS.md section 12` |
| apps/web typecheck is tsc --noEmit with no heap flag; it needs NODE_OPTIONS=--max-old-space-size=8192 or it aborts with SIGABRT. | stated requirement | `AGENTS.md section 12`; `apps/web/package.json:12` |
| CI sets NODE_OPTIONS to an 8192 MB heap in several jobs; turbo passes NODE_OPTIONS through; pre-push defaults it. | read in the code | `.github/workflows/ci.yml:283`; `turbo.json:5`; `.husky/pre-push` |
| Pre-push runs the guard chain in a clean detached worktree at HEAD (or on the live tree with AGI_PREPUSH_ON_TREE=1), then turbo lint and typecheck on affected packages; SKIP_PRE_PUSH=1 skips it. | read in the code | `.husky/pre-push`; `scripts/prepush-clean-worktree.sh:1-25` |
| Mobile tests run node tests plus Jest 29 in shards of up to 120 files per process to avoid heap exhaustion. | read in the code | `apps/mobile/package.json:44`; `apps/mobile/scripts/run-jest-shards.mjs:8-30`; `apps/mobile/package.json:169` |
| Loaded machines fail tests that pass alone; check uptime and re-run in isolation before chasing an intermittent failure. | stated requirement | `AGENTS.md section 12` |
| Heavy local jobs go through scripts/dev/heavy-job.sh (one at a time, waits for 3 GB free by default); scoped tests and lint through light-job.sh (two slots); a hook denies unwrapped heavy commands on 24 GB or less. | read in the code | `scripts/dev/heavy-job.sh:1-40`; `scripts/dev/light-job.sh:1-20`; `CLAUDE.md Delegation` |
| CLI tests are Rust: cargo test -p agiworkforce-cli --lib; build is cargo build --release -p agiworkforce-cli. | read in the code | `docs/agent-context/commands.json (surfaces.cli)` |
| Desktop has Vitest unit tests, wdio and Playwright e2e, Rust lib tests, and many native GPUI test scripts. | read in the code | `apps/desktop/package.json:20-60` |
| Chrome extension is linted separately (pnpm lint:extension); pnpm lint excludes it. | read in the code | `package.json:141-142` |
| Rust lint uses clippy with warnings and unsafe-code denied; dependency policy uses cargo deny. | read in the code | `docs/agent-context/commands.json (repoWide.rustClippy, rustDependencyPolicy)` |
| pnpm docs:check chains doc-status, non-md-artifacts, reference-integrity, capability-preconditions and readme-facts. | read in the code | `package.json:417` |
| Commit subjects must be lowercase conventional; lockfiles are never hand-edited. | stated requirement | `AGENTS.md section 12`; `CLAUDE.md` |
| Whether full suites pass today is not recorded in any document read. | unknown | `no run record found` (not found) |

## Open questions

- Which guards in the chain also run in CI, and which run only in the pre-push hook? Only the heap flag lines of ci.yml were read.
- What do .husky/pre-commit and .husky/commit-msg run? Not read.
- Is the desktop app also affected by the Vitest major mismatch the way AGENTS.md describes for web? Code shows both on 5.x but no doc says so.
- Should the 8 GB heap flag be built into the web typecheck script instead of relying on the caller (product/engineering choice the code leaves open)?
- Current pass/fail state of the full suites is unknown; no run record was found.
- What exactly is in the full guard chain list (package.json:397 is one long line and was only partly read)?

## Project documents found out of date

- `AGENTS.md section 12 (Vitest bullet)`: Describes the separate Vitest major as specific to apps/web. The code says: apps/desktop also declares vitest ^5.1.0, while the root, apps/extension and apps/extension-vscode use ^4.1.12. (apps/web/package.json:207; apps/desktop/package.json:182; package.json:469; apps/extension/package.json:72)
- `docs/agent-context/commands.json`: Inventory (lastUpdated 2026-11-09) omits scripts that exist, such as check:script-tests, check:readme-facts, mobile test:local and test:handles, desktop test:smoke and test:gpui:search, and VS Code test:integration:vsix. The code says: These scripts are defined in package.json and the app manifests. (package.json:363, 436; apps/mobile/package.json:46-47; apps/desktop/package.json:37, 57; apps/extension-vscode/package.json:1577)
- `docs/development/agent-workflow.md`: Last updated 2026-09-19; the verification ladder does not mention the clean-worktree pre-push, the heavy-job wrappers or the guard chain's run-alone and re-run rules. The code says: Pre-push uses scripts/prepush-clean-worktree.sh, and the guard chain re-runs failed guards alone. (.husky/pre-push; scripts/run-guard-chain.mjs:150-190)
