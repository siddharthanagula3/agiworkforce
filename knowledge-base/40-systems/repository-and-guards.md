---
id: "SYS-repository-and-guards"
type: "system"
title: "Repository layout and guards"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Repository layout and guards

The repo is one monorepo: pnpm and Turborepo for JavaScript, one Cargo workspace for Rust. A lane map assigns write ownership. A hook chain guards commits and pushes. A 229-step guard chain (check:llm-operability) runs in a clean worktree before every push. Generated files (model catalog, Rust-to-TypeScript types, agent-context indexes) have owners and check commands. Implementation is present; no run was executed in this review.

## What it is and why it exists

This page covers how the AGI Workforce repository is laid out and how it is protected from bad changes. It serves six product apps (surface:web, surface:desktop, surface:mobile, surface:cli, surface:vscode, surface:chrome) from one codebase, so shared behaviour lives once and drift is caught by machines, not by memory.

The design has four parts.

1. **Workspace layout.** pnpm workspaces for JavaScript/TypeScript, a Cargo workspace for Rust, Turborepo to run tasks across packages.
2. **Ownership lanes.** A machine-readable map of who may write which paths, so many agents or people can work in parallel without collisions.
3. **Generated files.** Some files are produced from a single source (model catalog, Rust protocol types, agent-context indexes). They must be regenerated, never hand-edited.
4. **Guards.** Small scripts (`scripts/check-*.mjs`) that fail when a rule is broken. A runner called the guard chain runs them all. Git hooks and CI call the chain.

Why: AGENTS.md says prose is the lowest-ranked source and that a rule "worth never violating belongs in a guard, not in prose" [requirement] (AGENTS.md section 2 and section 11). Source-of-truth precedence is: schemas and enforced config, then implementation, then tests/hooks/CI, then docs, then training knowledge [requirement] (AGENTS.md section 2).

Product context: the guards protect the established requirements (model agnostic, provider agnostic, one AGI Subscription system, free local inference, explicit execution boundaries). Examples are `check:model-id-literals` (no model ID outside the catalog), `check:entitlement-entry-point`, `check:usage-pool-is-shared`, `check:provider-call-reservation` and `check:trust-boundaries`. Each is a script that exists and is wired; what each one proves about product behaviour is covered by the pages that own those subjects.

## How it works today

### Workspace layout

[code] pnpm workspaces include `apps/*`, `packages/*/*`, `packages/ai/providers/*`, `services/*`, `infrastructure/*` (pnpm-workspace.yaml:1-6). The package manager is pinned to pnpm 10.34.7 and Node `>=24.15.0 <25` (package.json:12 and engines). pnpm also sets `minimumReleaseAge: 10080` (minutes, i.e. 7 days), so a new package version must age a week before install, with a named exclude list (pnpm-workspace.yaml:8-10).

[code] The Cargo workspace members are `apps/desktop/src-tauri`, `apps/desktop/gpui`, `apps/cli` and `crates/*` (Cargo.toml:2-7). The Rust toolchain is pinned in `rust-toolchain.toml` with clippy and rustfmt components (rust-toolchain.toml:9-10). A workspace clippy lint table denies a long list of patterns; per-crate files inherit it (Cargo.toml). Release profile uses LTO, size optimisation, strip and `panic = abort`.

[code] Turborepo (turbo.json) defines tasks `transit`, `build`, `lint`, `test`, `typecheck` and others, with `build` depending on `^build` and `lint`/`test` depending on `transit`. Root scripts: `pnpm typecheck` covers only desktop; `pnpm typecheck:all` runs `turbo run typecheck` for everything (package.json:418; AGENTS.md section 12). `pnpm test` runs Turbo with concurrency 2.

### Ownership lanes

[code] `docs/agent-context/lanes.json` lists 19 writer lanes plus 4 review/verify/integrator lanes (lanes.json; `recommendedParallelism.writerLanes` is 19 at line 6). Each lane has `ownedWritePaths`, `readOnlyContextPaths`, `blockedPaths`, `requiredChecks` and `escalationOwners`. Shared files (root manifests, lockfiles, `.github/**`, `docs/agent-context/**`, `packages/contracts/types/**`, `apps/web/db/neon/**`) go only through the integration lanes `repo-operability` and `release-ci` (lanes.json `sharedFilePolicy`). `scripts/check-lane-ownership.mjs` validates the file (unique ids, owned paths exist, at least 15 writer lanes) and can test a staged change against one lane with `--lane <id> --staged`.

[code] `.github/CODEOWNERS` is provisional: every path routes to one founder account until real teams exist (CODEOWNERS:1-5). `pnpm check:codeowners` locks coverage.

### Generated files

| Generated output | Source | Regenerate | Drift check |
|---|---|---|---|
| Model catalog `packages/contracts/types/src/models.json` | `packages/ai/model-registry/catalog/models.curation.json` and other catalog files | `pnpm sync:models` (package.json:386) | `pnpm sync:models:check`, `check:model-catalog` |
| Rust protocol types in `packages/contracts/types/src/generated/protocol` | Rust crate `crates/agiworkforce-protocol` via ts-rs | `pnpm generate:protocol-types` (package.json:420) | `pnpm check:protocol-types` (renders to a staging dir and diffs) |
| `docs/agent-context/generated/` (contract registry, dependency graph, module summaries, knowledge graph) | repository scan | `pnpm generate:agent-context-indexes` | `pnpm check:agent-context-indexes` |
| `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` | written by `next dev` | commit them | none specific |
| iOS project in apps/mobile/ios (not found) | Expo prebuild and config plugins | prebuild | gitignored |

[code] `check-generated-artifacts.mjs` fails a tracked file that is git-ignored and unclassified, loose root images or scratch markdown, Playwright MCP captures, and archive files not on an allowed asset list (scripts/check-generated-artifacts.mjs:34-80).

### The guard chain

[code] `pnpm check:llm-operability` is `node scripts/run-guard-chain.mjs "<229 pnpm steps joined by &&>"` (package.json:397; I counted 229 entries). The runner (scripts/run-guard-chain.mjs):

- accepts only steps shaped like `pnpm [--filter @x/y] script` and rejects empty or repeated steps (lines 11 and 33-50);
- runs the `EXCLUSIVE` set alone first: `check:protocol-types`, `check:cross-version-matrix`, `check:script-tests`, `check:rust-fmt` (lines 18-23), because they run cargo or rewrite tracked files temporarily;
- runs the rest concurrently, default 4 (cores permitting), set with `AGI_GUARD_CONCURRENCY` from 1 to 16 (lines 25-26 and `concurrencyFrom`);
- reruns each failure alone; one that then passes is reported as "recovered", one that still fails counts as failed (`runChain`);
- gives every guard its own process group and stops them all on SIGINT/SIGTERM/SIGHUP, force-killing after 5 s (`stopGuards`);
- keeps only the last 4 MiB of each guard's output; exit code 0 only if nothing failed.

[code] `check:guard-inventory` enumerates every `scripts/check-*.mjs` and fails when nothing runs it, taking the closure of the chain plus workflow `run:` steps (scripts/check-guard-inventory.mjs:1-12, 50-60). A baseline lives in `scripts/config/guard-inventory.json`.

### What the important guards protect

| Guard (pnpm script) | Protects | In the chain? |
|---|---|---|
| `check:model-id-literals` | no model ID literal outside the generated catalog; Rust side via `scripts/check-no-hardcoded-models.sh`, which now only calls the Node guard | yes |
| `check:model-catalog`, `sync:models:check` | catalog is internally consistent and in sync with curation | yes |
| `check:protocol-types` | generated TypeScript matches Rust types | yes (exclusive) |
| `check:boundaries` | imports do not reach past a package's published entrypoints; vendor SDKs only via port adapters (allowlist file) | yes |
| `check:neon-migrations`, `check:migration-dependencies` | append-only checksummed migration chain in `apps/web/db/neon` | yes |
| `check:db-isolation`, `check:rls-boundary` | database tenant isolation and row-level security | yes |
| `check:secrets` | no committed secrets | yes |
| `check:hardcoded-endpoints` | no endpoints the repo already models | yes |
| `check:css-tokens`, `check:ui-*`, `check:no-hex-*` | design values come from tokens | yes |
| `check:mock-exports` | a `vi.mock()` factory must keep every real export its subject imports | yes |
| `check:tauri-wiring` | desktop frontend and Tauri commands agree both ways (`apps/desktop/check-wiring.sh`) | yes |
| `check:lane-ownership` | lane map is valid | yes |
| `check:entitlement-entry-point`, `check:usage-pool-is-shared`, `check:provider-call-reservation`, `check:plan-tier-predicates` | subscription and usage rules go through one place | yes |
| `check:llm-failures` (and `:staged`) | known LLM failure patterns per `llm-failure-taxonomy.json` | chain: full; staged only in pre-commit |
| `check:hooks` | Husky hook wiring and commitlint policy | yes |
| `check:trust-boundaries` | Local, own-key and cloud trust separation | NOT in the chain; run by `.github/workflows/ci.yml` (line 932) |
| `check:rust-egress-boundary` | desktop Rust network calls only through an allowlisted transport | NOT in the chain; CI (ci.yml:130) |
| `check:hardcoded-arrays` | no hardcoded arrays of modelled data | NOT in the chain; CI (ci.yml:149) |
| `verify-skills-lock.mjs` | skill content hashes match `skills-lock.json` | NOT in the chain; `repo-operability.yml:163` |

### Commit and push rules

[code] Hooks live in `.husky/` and install via `prepare` (package.json:140).

- `commit-msg`: commitlint, conventional commits, header at most 100 characters, subject must be lower-case (commitlint.config.cjs; .husky/commit-msg).
- `pre-commit`: `lint-staged` (eslint fix and prettier on code; prettier on json/md/css/yaml; an em-dash copy check on many file types), then `check:audit-inventory`, `check:executable-docs`, `check:structure-conventions`, `check:llm-failures:staged` (.husky/pre-commit; package.json lint-staged block).
- `pre-push`: skipped when `SKIP_PRE_PUSH=1`. By default it runs `scripts/prepush-clean-worktree.sh`, which makes a detached git worktree of HEAD, links dependencies, runs the whole chain there, then runs `turbo run lint typecheck --affected` (against `origin/main` when present) and `git diff --check` over the push range. With `AGI_PREPUSH_ON_TREE=1` it runs the same checks on the live tree instead (.husky/pre-push; scripts/prepush-clean-worktree.sh).
- Lockfiles are never hand-edited; change the manifest and run pnpm or cargo. A Claude Code hook (`.claude/hooks/block-lock-files.sh`) blocks writes to `pnpm-lock.yaml` and `Cargo.lock` [requirement] (CLAUDE.md).
- `scripts/commit-pathspec.sh -m <subject> [-m <body>]... -- <path>...` commits exactly the listed paths (scripts/commit-pathspec.sh:1-9).
- New root files must be registered in `scripts/check-repo-organization.mjs` [requirement] (AGENTS.md section 12).
- Most guards read the working tree (`git ls-files -co`), not HEAD, so stage first, then run, then commit [requirement] (AGENTS.md section 12).

### Machine limits for agents

[code] `.claude/hooks/heavy-job-gate.py` denies unwrapped heavy commands (build, dev, test, lint, tsc, vitest, cargo build/test/check/clippy, `git push`, some check scripts) when the machine has 24 GB RAM or less (heavy-job-gate.py:9-12, 96). `scripts/dev/heavy-job.sh` takes a machine-wide lock and waits for at least 3 GB free memory (`AGI_HEAVY_MIN_FREE_GB`, up to 900 s). `scripts/dev/light-job.sh` is the scoped-job wrapper.

## Implementation map

| Concern | Where | Basis |
|---|---|---|
| JS workspace globs | `pnpm-workspace.yaml` | [code] |
| Rust workspace | `Cargo.toml`, `rust-toolchain.toml`, `deny.toml` | [code] |
| Task graph | `turbo.json` | [code] |
| Root scripts and chain list | `package.json` (chain at line 397) | [code] |
| Guard runner | `scripts/run-guard-chain.mjs` (+ its test `scripts/run-guard-chain.test.mjs`, named in a comment at line 14-16) | [code] |
| Guard scripts | `scripts/check-*.mjs` (251 `check:*` package scripts) | [code] |
| Guard inventory | `scripts/check-guard-inventory.mjs`, `scripts/config/guard-inventory.json` | [code] |
| Lane map | `docs/agent-context/lanes.json`, `scripts/check-lane-ownership.mjs`, `docs/agent-context/shared-files.md` | [code] |
| Repo map and risk map | `docs/agent-context/repo-map.json`, `docs/agent-context/risk-map.json` | [code] |
| Command inventory | `docs/agent-context/commands.json` | [code] |
| Hooks | `.husky/{commit-msg,pre-commit,pre-push}`, `commitlint.config.cjs`, `scripts/prepush-clean-worktree.sh` | [code] |
| Agent hooks | `.claude/hooks/*`, `.claude/settings.json`, `.claude/rules/` | [code] |
| CI | `.github/workflows/ci.yml`, `repo-operability.yml`, `test-l1.yml` and others | [code] |
| Ownership routing | `.github/CODEOWNERS` | [code] |
| Model catalog source | `packages/ai/model-registry/catalog/` (curation, families, routes, retired) | [code] |
| Protocol type generator | `scripts/generate-protocol-types.mjs`, `crates/agiworkforce-protocol` | [code] |
| Skills lock | `skills-lock.json`, `scripts/verify-skills-lock.mjs` | [code] |

Top-level folders [code]: `apps/` (cli, desktop, extension, extension-vscode, mobile, web), `crates/` (13 Rust crates such as agent-core, llm, mcp, model-registry, protocol, sandbox-policy), `packages/` (ai, client, contracts, guardian, platform, tools, ui), `services/` (signaling-server, upload-scanner), `infrastructure/sandbox`, `docs/`, `audit/`, `scripts/`.

Providers under `packages/ai/providers/`: anthropic, deepseek, factory, google, groq, lmstudio, minimax, moonshot, nvidia, ollama, openai, openrouter, perplexity, qwen, vercel-gateway, workers-ai, xai, zhipu [code].

## Data and state

- **Docs ownership table.** AGENTS.md section 11 gives each kind of knowledge exactly one home (agent rules in AGENTS.md; architecture in `docs/architecture/`; open defects in `audit/registers/known-flaws.md`; and so on) [requirement].
- **Machine-readable context** in `docs/agent-context/`: `lanes.json` (version 1, 2026-11-08), `commands.json` (2026-11-09), `risk-map.json` (version 2, dated 2026-08-13 inside the file), `repo-map.json`, `doc-status.json`, `llm-failure-taxonomy.json`, `non-md-artifact-status.json` [code].
- **Baselines and allowlists** that guards read: `scripts/config/guard-inventory.json`, `scripts/config/vendor-adapter-allowlist.json`, `scripts/config/managed-compute-evaluator-allowlist.json`, `.github/ci-failure-baseline.json`, `.github/cross-version-matrix.json` [code].
- **Database migrations** in `apps/web/db/neon/` are append-only and checksummed; a production apply needs `--confirm-production` [requirement] (AGENTS.md section 5). Never edit an applied migration.
- **Unresolved work** lives only in `audit/`; defect rows in `audit/registers/known-flaws.md` are cited by ID and deleted when fixed [requirement] (AGENTS.md section 12).
- **Local state of the guard system:** `/tmp/agi-heavy.kernel.lock` (machine lock) and `${TMPDIR}/agi-prepush-worktree/run-*` (clean worktrees, cleaned after 120 minutes) plus a Turbo cache dir [code] (scripts/dev/heavy-job.sh; scripts/prepush-clean-worktree.sh).

## Rules: access, plans, modes

This subject has no runtime plan or mode gating. It governs how code is changed, not what a user may do. Relevant rules:

- **Write access by lane.** A lane may write only its `ownedWritePaths`; shared files need the integrator lanes [code] (lanes.json `sharedFilePolicy`). Do not let two agents write the same file at once [requirement] (CLAUDE.md, Delegation).
- **Production-affecting commands.** `git push` is treated as a heavy job and must go through the lock wrapper on small machines [code] (heavy-job-gate.py). A deploy happens only when the owner asks in that message [requirement] (owner memory notes; not a repository file).
- **Mode and plan rules are protected, not defined, here.** Trust-boundary rules (mode:local, mode:own-key, mode:cloud must never route silently across) are in AGENTS.md section 6 [requirement] and enforced by `check:trust-boundaries`, `check:rust-egress-boundary`, `check:db-isolation`, `check:rls-boundary` [code]. Plan and quota rules are protected by `check:entitlement-entry-point`, `check:usage-pool-is-shared`, `check:plan-tier-predicates`, `check:provider-call-reservation` [code] (package.json chain). See SYS-chat-turn-pipeline for how a turn uses them [unknown: that page was not read here].
- **Never weaken a guard.** AGENTS.md section 9: do not weaken validation, tests, security, lint or guards to make a change pass [requirement].
- **Skills.** Editing any skill, even a reformat, breaks `skills-lock.json` until `node scripts/verify-skills-lock.mjs --regenerate` is run; never install with `npx skills add` [requirement] (CLAUDE.md). The web catalog ships every skill marked `audience: product`, so a skill edit changes what customers get [requirement] (AGENTS.md section 5).

## Differences between apps

| Surface | Workspace form | Lane | Typical checks |
|---|---|---|---|
| surface:web | pnpm package `apps/web` (Next.js; routing in `apps/web/proxy.ts`) | web-ui, web-api-billing, enterprise-admin-surface, database-compliance | `pnpm --filter @agiworkforce/web test` and `typecheck`; web has its own Vitest major, so use the package script; `tsc` needs `NODE_OPTIONS=--max-old-space-size=8192` |
| surface:desktop | pnpm `apps/desktop` (React, Tauri) plus Cargo members `src-tauri` and `gpui` | desktop-frontend, desktop-native | `cargo check -p agiworkforce-desktop`, `check:tauri-wiring`, `check:rust-egress-boundary` |
| surface:mobile | pnpm `apps/mobile` (Expo) | mobile-app, mobile-native-store | typecheck and tests; iOS output generated; run tests in chunks (owner notes) |
| surface:cli | Cargo member `apps/cli` | cli-app | `cargo check -p agiworkforce-cli`, `cargo test -p agiworkforce-cli --lib` |
| surface:vscode | pnpm `apps/extension-vscode` | vscode-extension | typecheck via `pnpm --filter agi-workforce` |
| surface:chrome | pnpm `apps/extension` | chrome-extension | `pnpm lint:extension` (the root `lint` excludes the extension), `check:no-hex`, `check:no-cloud-ipc` |

[requirement] AGENTS.md section 5 says seven application implementations map to six surfaces because Electron is the public Desktop and Tauri is retained internal code; `apps/desktop/src` never reaches the Electron window, which shows the hosted web app. `packages/ui/unified-chat` is shared by desktop, web, Chrome and VS Code, so it may not assume one surface's routing, billing or account model.

Each path-scoped `AGENTS.md` (for example `apps/web/AGENTS.md`) carries local rules; read the nearest one before editing [requirement] (docs/agent-context/README.md read order).

## Failure handling

- **A guard fails beside others.** The runner retries it alone; a pass is reported as recovered, a second failure is final. The run ends with the list of failures, exit 1 [code] (run-guard-chain.mjs `runChain`, `summarize`).
- **Guard steps that touch tracked files** are run alone first so they do not corrupt what others read [code] (EXCLUSIVE comment, lines 14-17).
- **Cancelled run.** Signals stop every guard process group, with a 5 s grace and 8 s limit, then exit `128 + signal` [code].
- **Local green does not mean committed green.** Guards read the working tree; the pre-push clean worktree checks HEAD instead, which catches unstaged-file passes [code] (prepush-clean-worktree.sh) and [requirement] (AGENTS.md section 12).
- **Loaded machine.** Long suites time out under load and report as assertion failures; check `uptime` and rerun alone before chasing [requirement] (AGENTS.md section 12).
- **Hook skipped.** `SKIP_PRE_PUSH=1` skips the push checks (.husky/pre-push:5-8). CI still runs its own jobs [code] (workflows); whether branch protection requires them is [unknown].
- **Branch name case clash** (`Fix/` vs `fix/`) can lose a ref; restore with `git branch -m`, never reset [inferred from owner notes, not a repository file].
- **Unregistered guard.** `check:guard-inventory` fails a `check-*.mjs` script nothing executes [code].

## How it should work

[proposed] Items that follow from the established requirements and the gaps below:

1. Every guard named in AGENTS.md as "Enforced by" should run in the same pre-push chain, or the docs should say which run only in CI. Today `check:trust-boundaries`, `check:rust-egress-boundary`, `check:hardcoded-arrays` and the skills-lock check run only in CI.
2. Guard counts and lists in docs should be generated, not typed, so they cannot drift (the chain has 229 steps and 251 `check:*` scripts; no doc states this).
3. The Cargo member list in AGENTS.md should include `apps/desktop/gpui`, since Cargo.toml has it.
4. Provider and model changes must stay catalog-only edits (curation file, then `pnpm sync:models`), which keeps the model-agnostic and provider-agnostic requirements cheap to hold.

## Gaps

Implementation status (is it there and connected) is separate from verification status (has anyone run it). Nothing in this review was run; no document in the files I read records a run of the full chain [unknown].

| Gap | Status | Basis |
|---|---|---|
| Four guards named in docs run only in CI, not in the local pre-push chain | Implemented but split | [code] (package.json chain lacks them; ci.yml:130, 149, 932; repo-operability.yml:163) |
| AGENTS.md lists `check:trust-boundaries`, `check:hardcoded-arrays` as enforcement without saying they are CI-only | Documentation gap | [code] |
| `risk-map.json` last updated 2026-08-13, older than lanes and commands | Possibly stale | [code] |
| Rust transport has no global enforced network chokepoint | Known gap, stated by the repo | [requirement] (risk-map.json, privacy-boundary entry) |
| CODEOWNERS routes everything to one account | Provisional by design | [code] (CODEOWNERS:1-5) |
| Desktop has two chat engines not yet converged | Stated in a Cargo.toml comment | [code] (Cargo.toml comment on restructure) |
| Whether CI jobs are required checks on the main branch | Cannot be determined from the repo | [unknown] |
| Whether the full chain currently passes | Not run | [unknown] |

## How to verify

Verification here means running commands; none were run for this page [unknown]. To verify, on a machine with enough RAM, use the lock wrappers (`scripts/dev/heavy-job.sh <cmd>` for heavy jobs, `scripts/dev/light-job.sh` for scoped ones).

1. Chain size: parse the quoted string in `package.json` `check:llm-operability`; expect 229 steps and no repeats (the runner throws on repeats).
2. Chain run: `pnpm check:llm-operability` (stage changes first). Expect `Guard chain passed: N guard(s).`
3. Runner behaviour: `node --test scripts/run-guard-chain.test.mjs`.
4. Generated files: `pnpm sync:models:check`, `pnpm check:protocol-types`, `pnpm check:agent-context-indexes`.
5. Lanes: `node scripts/check-lane-ownership.mjs --lane <id> --staged`.
6. Hooks: `pnpm check:hooks` after any change to hooks, commitlint or package scripts.
7. Docs and structure changes: `pnpm check:llm-operability`, `pnpm check:hooks`, `git diff --check` [requirement] (docs/development/agent-operability.md, Required Checks).
8. Commands by area: read `docs/agent-context/commands.json` instead of guessing a workspace filter.

Tests named in the repo for this subject: `scripts/run-guard-chain.test.mjs`, `scripts/check-guard-inventory.test.mjs`, `scripts/check-boundaries.test.mjs`, `scripts/check-secrets.test.mjs`, `scripts/check-neon-migrations.test.mjs`, `apps/desktop/scripts/check-wiring.node-test.mjs` [code] (referenced from package.json scripts and check-wiring.sh).

## Key facts

| Fact | Basis | Source |
|---|---|---|
| pnpm workspaces cover apps/*, packages/*/*, packages/ai/providers/*, services/*, infrastructure/*. | read in the code | `pnpm-workspace.yaml:1-6` |
| Package manager is pnpm 10.34.7 with Node >=24.15.0 <25; installs wait 7 days (minimumReleaseAge 10080) except a named list. | read in the code | `package.json:12`; `pnpm-workspace.yaml:8-10` |
| The Cargo workspace members are apps/desktop/src-tauri, apps/desktop/gpui, apps/cli and crates/*; AGENTS.md omits gpui. | read in the code | `Cargo.toml:2-7`; `AGENTS.md:88` |
| The Rust toolchain is pinned in rust-toolchain.toml with clippy and rustfmt; workspace clippy lints are deny-level. | read in the code | `rust-toolchain.toml:9-10`; `Cargo.toml [workspace.lints.clippy]` |
| pnpm typecheck covers only desktop; pnpm typecheck:all runs turbo for all packages. | read in the code | `package.json typecheck and typecheck:all (line 418)`; `AGENTS.md section 12` |
| The guard chain pnpm check:llm-operability has 229 steps run by scripts/run-guard-chain.mjs. | read in the code | `package.json:397`; `counted from the quoted string` (not found) |
| Guard runner runs 4 at a time by default, AGI_GUARD_CONCURRENCY allows 1 to 16, and a failed guard is rerun alone; a rerun pass is reported as recovered. | read in the code | `scripts/run-guard-chain.mjs:25-26`; `scripts/run-guard-chain.mjs runChain` |
| Four guards run alone before the rest: check:protocol-types, check:cross-version-matrix, check:script-tests, check:rust-fmt. | read in the code | `scripts/run-guard-chain.mjs:18-23` |
| The runner accepts only steps shaped like pnpm scripts and rejects empty or repeated steps. | read in the code | `scripts/run-guard-chain.mjs:11,33-50` |
| check:guard-inventory fails a scripts/check-*.mjs file that nothing in the chain or CI workflows runs. | read in the code | `scripts/check-guard-inventory.mjs:1-12,50-60` |
| check:trust-boundaries, check:rust-egress-boundary, check:hardcoded-arrays and verify-skills-lock run only in CI workflows, not in the local chain. | read in the code | `package.json:187,217,383`; `ci.yml:130,149,932` (not found); `repo-operability.yml:163` (not found) |
| lanes.json defines 19 writer lanes and 4 review/verify/integrator lanes; shared files go through repo-operability and release-ci. | read in the code | `docs/agent-context/lanes.json:6`; `lanes.json sharedFilePolicy` (not found) |
| check-lane-ownership requires at least 15 writer lanes and can test a staged change against one lane. | read in the code | `scripts/check-lane-ownership.mjs` |
| The model catalog models.json is generated from packages/ai/model-registry/catalog via pnpm sync:models and must not be hand-edited. | stated requirement | `AGENTS.md section 4`; `package.json:386` |
| Rust protocol types flow one way into TypeScript; regenerate with pnpm generate:protocol-types; check:protocol-types diffs into a staging dir. | read in the code | `package.json:420`; `scripts/generate-protocol-types.mjs` |
| commit-msg runs commitlint: conventional, header max 100, lower-case subject. | read in the code | `commitlint.config.cjs`; `/.husky/commit-msg` (not found) |
| pre-commit runs lint-staged then check:audit-inventory, check:executable-docs, check:structure-conventions and check:llm-failures:staged. | read in the code | `.husky/pre-commit` |
| pre-push builds a detached worktree of HEAD, runs the full chain there, then turbo lint and typecheck on affected packages and git diff --check; SKIP_PRE_PUSH=1 skips it, AGI_PREPUSH_ON_TREE=1 uses the live tree. | read in the code | `.husky/pre-push:5-20`; `scripts/prepush-clean-worktree.sh` |
| A Claude Code hook denies unwrapped heavy commands, including git push, on machines with 24 GB RAM or less; heavy-job.sh serialises them and waits for 3 GB free. | read in the code | `.claude/hooks/heavy-job-gate.py:9-12,96`; `scripts/dev/heavy-job.sh` |
| Most guards read the working tree, not HEAD; stage first, run, then commit. | stated requirement | `AGENTS.md section 12` |
| CODEOWNERS routes every path to one founder account as a provisional measure. | read in the code | `.github/CODEOWNERS:1-5` |
| check-no-hardcoded-models.sh is now only a compatibility wrapper calling the Node guard check-no-hardcoded-model-ids.mjs. | read in the code | `scripts/check-no-hardcoded-models.sh` |
| Editing any skill file fails CI until node scripts/verify-skills-lock.mjs --regenerate is run. | stated requirement | `CLAUDE.md Skills and sources`; `skills-lock.json` |
| There are 251 check:* scripts in package.json. | read in the code | `package.json scripts (counted)` |
| scripts/commit-pathspec.sh commits only the listed paths with -m messages. | read in the code | `scripts/commit-pathspec.sh:1-9` |
| Whether the guard chain currently passes was not run in this review. | unknown | `no run record read` (not found) |

## Open questions

- Does the full guard chain pass today? No run was made or found in the documents read.
- Are CI jobs (including the CI-only guards) required status checks on main? Branch protection settings are not in the repository.
- Why do check:trust-boundaries, check:rust-egress-boundary, check:hardcoded-arrays and verify-skills-lock stay out of the local pre-push chain? Intent is not stated.
- Which per-surface trust-boundary.test.ts files exist? AGENTS.md says there is one per surface; I did not open them.
- How the guards map one-to-one to subscription, quota and entitlement rules was not traced; see the pages that own those subjects (for example SYS-chat-turn-pipeline, not read).
- Product choice left open: when real GitHub teams exist, how CODEOWNERS and the lane owner roles will map to them.
- The owner notes mention scripts/commit.sh; I could not find it (found scripts/commit-pathspec.sh). Whether the name changed is unknown.

## Project documents found out of date

- `AGENTS.md section 5`: Cargo workspace listed as apps/desktop/src-tauri, apps/cli, crates/* The code says: Cargo.toml also has apps/desktop/gpui as a member (Cargo.toml:2-7 versus AGENTS.md:88)
- `AGENTS.md section 4`: Says the Rust model-literal check is scripts/check-no-hardcoded-models.sh The code says: That file only forwards to the Node guard scripts/check-no-hardcoded-model-ids.mjs, which scans Rust and TypeScript (scripts/check-no-hardcoded-models.sh)
- `docs/development/agent-operability.md (Hook Rules)`: Says pre-push runs check:llm-operability and whitespace checks The code says: pre-push runs the chain inside a clean detached worktree, then turbo lint and typecheck for affected packages, then git diff --check; it has an on-tree mode (.husky/pre-push; scripts/prepush-clean-worktree.sh)
- `docs/agent-context/risk-map.json`: lastUpdated 2026-08-13, older than lanes.json (2026-11-08) and commands.json (2026-11-09); may not reflect later changes The code says: Not re-verified path by path (docs/agent-context/risk-map.json lastUpdated)
- `docs/agent-context/README.md`: Says to run check:llm-operability after editing agent-context rules without noting that some enforced guards run only in CI The code says: check:trust-boundaries, check:rust-egress-boundary, check:hardcoded-arrays and the skills-lock check are outside the chain (package.json:397; ci.yml:130,149,932; repo-operability.yml:163)
