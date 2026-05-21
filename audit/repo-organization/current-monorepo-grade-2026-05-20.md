# Current Monorepo Grade And A+ Developer-Friendliness Plan

Status: Current assessment
Owner: Platform lead
Last updated: 2026-05-20
Baseline commit: `b7d6debf0` (`chore: snapshot workspace before repo organization`)

## Executive Grade

Overall grade: **C+ today, with a credible path to A+ before hiring a broad team.**

The core monorepo spine is strong: `apps/`, `packages/`, `crates/`, `services/`, `supabase/`, `docs/`, `audit/`, `tasks/`, `reports/`, `examples/`, and `scripts/` are the right large buckets for an OpenAI/Anthropic-style application suite.

The current problem is not that the repo is fundamentally wrong. The problem is that the repo still looks like a founder-plus-LLM build: product code, reference audits, screenshots, generated captures, root scratch files, stale docs, tool configs, and release artifacts are too close together. A future engineer can build, but they will lose time deciding what is current, what is historical, what is generated, and which owner boundary applies.

## Evidence Snapshot

| Area                            | Finding                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Scoped non-generated file count | `6156` files excluding common generated/build folders.                                              |
| Largest top-level buckets       | `apps` 4752, `packages` 492, `crates` 178, `tasks` 163, `docs` 150, `services` 88.                  |
| Largest product surfaces        | `apps/desktop` 2178 tracked files, `apps/web` 1292, `apps/cli` 552, `apps/mobile` 507.              |
| Shared package README coverage  | 2 of 18 top-level packages have README files: `data-layer`, `llm-normalize`.                        |
| App/service README coverage     | Apps missing README: `apps/desktop`, `apps/extension`, `apps/web`. Services missing README: both.   |
| Crate README coverage           | 2 of 17 top-level crates have README files: `agiworkforce-protocol`, `agiworkforce-utils-template`. |
| Root source files               | Root still contains scratch markdown/images and older source-of-truth candidates.                   |
| Agent operability               | First-pass `docs/agent-context/` is implemented and checks pass.                                    |
| Guardrails                      | `pnpm check:agent-context`, `pnpm check:repo-organization`, and `pnpm check:boundaries` pass.       |
| Environment warning             | Current shell uses Node `v20.11.0`; repo expects Node `22`.                                         |

## Scorecard

| Dimension                    | Grade | Why                                                                                                                                    |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level architecture       | B     | Correct monorepo spine and clear six-surface/product-platform buckets.                                                                 |
| Product-code discoverability | B-    | Main app/package/crate folders are obvious, but large surfaces still mix layer-first and domain-first layouts.                         |
| LLM operability              | B-    | `AGENTS.md` and `docs/agent-context/` now give agents maps, risks, commands, and known flaws; this needs CI and more complete ledgers. |
| Human onboarding             | C+    | `ONBOARDING.md`, `BUILD.md`, docs index, and surface docs exist, but package/service/crate READMEs are mostly missing.                 |
| Source-of-truth discipline   | C     | New `PLAN.md`, `TODO.md`, decisions, and agent context help, but old docs still claim canonical status in places.                      |
| Root hygiene                 | D+    | Root scratch files, screenshots, historical logs, and reference catalogs are still present.                                            |
| Generated artifact hygiene   | D+    | Generated captures/reports are tracked or present in developer-visible locations; they need retention rules.                           |
| Package boundaries           | C+    | Boundary check exists and passes, but package public-export policy and ownership docs are incomplete.                                  |
| CI/repo guardrails           | B-    | First guardrail scripts exist; they need CI workflow integration and stricter mode after cleanup.                                      |
| Hiring readiness             | C+    | A strong engineer can navigate it; a new team will need clearer ownership, READMEs, CODEOWNERS, and fewer stale docs.                  |

## Main Findings

1. **Root is still too noisy.**
   Current root has source-of-truth docs, configs, historical plans, scratch design markdown, screenshots, generated captures, reference catalogs, and local artifacts mixed together. Root must become boring.

2. **Docs have too many historical source-of-truth claims.**
   New docs now point to `PLAN.md`, `TODO.md`, `docs/decisions/CURRENT_DECISIONS.md`, and `docs/agent-context/`, but older PRDs, archive docs, and launch docs still use words like canonical/source of truth. Agents and engineers need a doc-status ledger enforced by CI.

3. **Most packages and crates lack local ownership context.**
   Only 2 of 18 top-level packages and 2 of 17 top-level crates have README files. This slows every new engineer and every coding agent.

4. **Large app surfaces need domain-first cleanup.**
   `apps/desktop` and `apps/web` are large enough that layer-first folders become expensive. Existing `docs/plans/domain-first-reorg.md` is the right sub-plan, but it should start only after root/docs/package contracts are stable.

5. **Generated/build directories are present across many subtrees.**
   Many are ignored and not tracked, but their presence makes local exploration noisy. The repo needs stricter ignore and cleanup guidance, plus a check that fails only tracked or unclassified source-tree clutter.

6. **Agent-tool folders need explicit contracts.**
   `.claude`, `.codex`, `.cursor`, `.opencode`, `.agents`, `.agent`, `.minimax`, `.superpowers`, `.remember`, and `.playwright-mcp` all need classification before any move/delete. Some may be source-controlled team context; others are local caches or generated captures.

7. **Node version mismatch is already visible.**
   `pnpm` warns because the current shell is Node 20 while the repo expects Node 22. This is a developer-experience issue; new engineers will hit it immediately.

8. **The first LLM-operability layer is working.**
   `AGENTS.md` is now canonical, `CLAUDE.md` is a mirror, and `docs/agent-context/` gives agents repo maps, risk maps, known flaws, and commands. This should be expanded, not replaced.

## A+ Definition

An A+ AGI Workforce repo is not merely tidy. It is a repo where a new senior engineer, a contractor, and an LLM coding agent can all answer the same questions from the same source graph:

- What is current, historical, generated, local-only, or deprecated?
- Who owns each app, package, crate, service, schema, and runtime boundary?
- Which command proves a change is safe?
- Which imports, data flows, privacy modes, generated artifacts, and cloud paths are forbidden?
- Which product surface should own a feature?
- Which docs can be trusted as current source of truth?
- Which high-risk areas deserve extra review before merge?

The A+ bar is enforceable, not aspirational. Repo structure, docs freshness, root hygiene, generated artifact retention, package boundaries, ownership, and agent context must be checked by CI or explicit review policy.

## Refactor Plan To Reach A+

### Phase 0: Baseline And Rules

Status: mostly done.

- Commit current workspace baseline: done at `b7d6debf0`.
- Keep `AGENTS.md` as canonical tool-neutral agent entry.
- Keep `CLAUDE.md` as Claude-specific mirror only.
- Keep `docs/agent-context/` as coding-agent map.
- Keep `PLAN.md`, `TODO.md`, and `CHANGELOG.md` as active transition control plane.
- No domain moves until classification and guardrails are in place.

### Phase 1: Classification Ledgers

Goal: make every file class obvious before moving anything.

Status: in progress.

Tasks:

- Add `audit/repo-organization/root-classification-2026-05-20.md`.
- Add `audit/repo-organization/tool-folder-classification-2026-05-20.md`.
- Add `audit/repo-organization/package-readme-coverage-2026-05-20.md`.
- Add `audit/repo-organization/docs-status-2026-05-20.md`.
- Add `audit/repo-organization/generated-artifact-policy-2026-05-20.md`.

Acceptance:

- Every top-level file is classified as `keep-root`, `move-to-docs`, `move-to-reports`, `move-to-archive`, `ignore/delete-local`, or `needs-owner-decision`.
- Every hidden tool folder has owner, purpose, tracked/ignored policy, and move/delete decision.
- Every active/historical doc has a status.

### Phase 2: Root Hygiene

Goal: make root boring and predictable.

Status: next.

Tasks:

- Move scratch root markdown/images into dated folders under `reports/` or `_archive/`.
- Move reference catalogs into `docs/reference/` or `audit/reference-index/`.
- `MASTER_PLAN.md` and `AGIWORKFORCE_IMPLEMENTATION_LOG.md` moved under `docs/archive/2026-05-14-reverse-engineering-campaign/`.
- `REFERENCE_INDEX.md` and `REFERENCE_STRUCTURE.md` moved under `docs/reference/`.
- Keep only source-of-truth docs and required config at root.
- Tighten `scripts/check-repo-organization.mjs` from warning mode to failure mode after moves.

Acceptance:

- `git ls-files | awk -F/ 'NF==1 {print}'` is short and intentional.
- New root markdown/image files fail CI unless allowlisted.

### Phase 3: Documentation And Agent Context

Goal: one current doc graph for humans and agents.

Status: in progress.

Tasks:

- Add status headers to active strategy docs.
- Update stale references to `UNIFIED_LAUNCH_PLAN`, old Claude memory, and older canonical claims.
- Expand `docs/agent-context/doc-status.json` to cover all current durable docs.
- Promote repeated audit/security findings into `docs/agent-context/known-flaws.md`.
- Add a docs link checker after moves.

Acceptance:

- New engineer starts from `README.md`, `AGENTS.md`, or `docs/README.md` and reaches the same current sources.
- Coding agents no longer rely on stale launch docs to decide current state.

### Phase 4: Package, Crate, And Service Ownership

Goal: every shared boundary explains itself locally.

Status: next.

Tasks:

- Add README files to all top-level packages.
- Add README files to all top-level crates.
- Add README files to `services/api-gateway` and `services/signaling-server`.
- Add owner role, purpose, public exports, test commands, and "do not import" rules to each README.
- Add `CODEOWNERS` after owner roles stabilize.

Acceptance:

- A new engineer can open any package/crate/service and know why it exists, who owns it, and how to test it in under 60 seconds.

### Phase 5: Boundary Enforcement

Goal: make architecture hard to accidentally break.

Status: in progress.

Tasks:

- Keep `pnpm check:boundaries`.
- Add stricter package public-export checks after README coverage lands.
- Forbid app-to-app imports.
- Forbid package-to-app imports.
- Forbid service-to-UI-package imports.
- Add CI workflow job for `pnpm check:llm-operability`.

Acceptance:

- Architectural violations fail before review.

### Phase 6: Domain-First Surface Cleanup

Goal: make large surfaces easy to modify by feature.

Order:

1. Web.
2. Mobile.
3. Desktop.

Rules:

- One domain per PR.
- Use `git mv`.
- No behavior changes in move PRs.
- Add or update feature-level README only when the domain is moved.
- Run surface typecheck/test after each move.

Acceptance:

- Feature work touches one domain folder, not five layer folders.
- Reviewers can assign owners by folder.

### Phase 7: Rust And CLI Engine Cleanup

Goal: make the Rust engine reusable without turning CLI into a dumping ground.

Tasks:

- Keep CLI product-specific TUI/REPL code in `apps/cli`.
- Move reusable protocol/runtime pieces to `crates/` only when a second consumer exists.
- Add crate README coverage before moving code.
- Keep command registry and protocol crates as the cross-surface bridge.

Acceptance:

- Desktop, VS Code, and future services can reuse runtime/protocol pieces without importing CLI UI code.

### Phase 8: Team And GTM Readiness

Goal: separate engineering, marketing, support, and legal paths.

Tasks:

- Create `docs/marketing/`, `docs/support/`, and `docs/legal/` when the first durable doc for each exists.
- Keep launch copy under `docs/launch/`.
- Expand `CONTRIBUTING.md` into real engineering workflow guidance.
- Add PR templates by change type.

Acceptance:

- Engineers, GTM, support, and legal do not need to read each other's internal working notes to find their materials.

## Immediate Next 10 Tasks

1. Commit the repo-organization script fix and this grade report. Done in `0d842263b`.
2. Add root classification ledger. Done.
3. Add tool-folder classification ledger. Done.
4. Add package README coverage ledger. Done.
5. Add docs status ledger. Done.
6. Add generated artifact policy. Done.
7. Move root scratch files into a dated archive/report folder. Done in `reports/root-scratch-archive/2026-05-20/`.
8. Add missing READMEs for `apps/web`, `apps/desktop`, `apps/extension`, and both services.
9. Add CI job for `pnpm check:llm-operability`. Done in `.github/workflows/repo-operability.yml`.
10. Start Web domain-first cleanup only after tasks 1-9 are green.

## Target State

Grade target before broad hiring: **A+**.

The repo is ready for scale when:

- Root is boring.
- Agent docs and human docs agree.
- Known flaws are indexed.
- Package/crate/service ownership is local and explicit.
- Import boundaries are enforced.
- Large apps are domain-first.
- Generated artifacts have retention policy.
- CI blocks organization drift.
- A new engineer can make a small change in any surface on day one without asking where the real code lives.
