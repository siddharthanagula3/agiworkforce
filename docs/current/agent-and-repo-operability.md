# Agent And Repo Operability

Status: Current
Owner: Platform lead
Last updated: 2026-05-28

## Goal

The repo must be easy for humans and LLM coding agents to navigate, split, audit, fix, and release. A+ means the repo structure itself reduces coordination cost.

## Source Of Truth

- `AGENTS.md` is the tool-neutral coding-agent entry point.
- `CLAUDE.md` is a Claude-specific mirror.
- `docs/current/source-of-truth.md` is the first product definition and parity/gap read.
- `docs/current/agi-product-requirements.md` is the long-form PRD for decision-complete product and Mobile v1 requirements.
- `docs/current/parity-implementation-matrix.md` is the first feature/component implementation read.
- `docs/current/byok-open-model-provider-strategy.md` is the first BYOK/open-model provider read.
- `PLAN.md` is the active strategy and transition plan.
- `TODO.md` is the active queue.
- `CHANGELOG.md` records completed work.
- `docs/current/` is the compact current docs layer.
- `docs/agent-context/` is the machine-readable agent map.
- `docs/engineering/naming-conventions.md` locks product, CLI, file, folder, package, branch, commit, version, and docs naming rules.
- `docs/engineering/service-layer-architecture.md` locks the action/route orchestration vs reusable service mechanics rule.
- `scripts/check-hooks.mjs` locks Husky hook wiring and commitlint policy.
- `scripts/check-report-retention.mjs` locks report collection ownership and retention metadata.
- `scripts/check-ci-guardrails.mjs` locks the CI baseline and makes advisory security gates explicit.
- `scripts/check-codeowners-contract.mjs` locks provisional ownership coverage until real GitHub teams exist.

## Parallel-Agent Rules

- Use `docs/agent-context/lanes.json` to assign write ownership.
- Exploration can read broadly; implementation writes narrowly.
- Shared files such as root docs, package manifests, migrations, CI, and lockfiles need an integrator.
- Every broad claim needs evidence: source, repo path, status, and verification.
- Never combine behavior changes with mechanical file moves unless the behavior change is required to keep builds passing.

## Documentation Rules

- Current docs need `Status`, `Owner`, and `Last updated`.
- Historical docs belong in `docs/archive`.
- Working notes belong in `tasks` until promoted.
- Evidence belongs in `audit`.
- Generated reports belong in `reports` or `audit`, not root.
- Report roots and direct child collections need `Status`, `Owner`, `Purpose`, and `Retention` metadata.
- If a doc is too long to be an entry point, summarize it in `docs/current` and archive the original.
- Treat `tasks/**`, `reports/**`, `docs/archive/**`, dated audit subdirectories, and local screenshot corpora as evidence or working notes unless promoted by a current doc.

## Naming Rules

- Public product copy says `AGI`; formal platform copy may say `AGI Workforce`.
- User-facing CLI examples use `agi`; `agiworkforce` is kept only as a compatibility alias or internal package/path identifier.
- New docs and evidence use lowercase kebab-case filenames, with `YYYY-MM-DD` suffixes only when the date is part of the artifact identity.
- Do not add new root `TASKS.md`, `FIXME.md`, `PRD.md`, `ROADMAP.md`, or ad hoc report files.
- Follow `docs/engineering/naming-conventions.md` before creating a new top-level folder, package, crate, service, release tag, branch, or root control file.
- Follow `docs/engineering/service-layer-architecture.md` before extracting repeated mechanics from actions, routes, command handlers, or UI workflow handlers.

## Hook Rules

- `commit-msg` enforces Conventional Commits through commitlint.
- `pre-commit` runs lint-staged plus fast repo structure checks.
- `pre-push` runs `pnpm check:llm-operability` and whitespace checks unless explicitly skipped with `SKIP_PRE_PUSH=1`.
- `pnpm check:hooks` must pass after any hook, commitlint, package-script, or repo-operability change.

## A+ Criteria

The repo is A+ when:

- root files are short, intentional, and enforced,
- every app/package/crate/service has local ownership docs,
- current docs are compact and conflict-free,
- stale docs are archived or deleted from active paths,
- structural conventions are checked by CI,
- service-layer extraction rules are documented and checked,
- import boundaries fail fast,
- generated artifacts are ignored or classified,
- report collections are owned and retention-scoped,
- CI guardrails prove lint/typecheck/test/audit/release-operability baselines,
- provisional CODEOWNERS covers all high-risk paths until real teams are created,
- parallel-agent lanes are explicit,
- high-risk areas route to owners.

## Required Checks

For docs, repo structure, or agent-context changes:

```bash
pnpm check:llm-operability
pnpm check:hooks
git diff --check
```

For surface moves, also run the surface typecheck and targeted tests.
