# Current Monorepo Grade And A+ Developer-Friendliness Plan

Status: Current assessment
Owner: Platform lead
Last updated: 2026-05-21
Baseline commit: `b7d6debf0` (`chore: snapshot workspace before repo organization`)

## Executive Grade

Overall grade: **A+ for pre-release repo operability guardrails, with remaining product-domain cleanup now explicit and bounded.**

The core monorepo spine is strong: `apps/`, `packages/`, `crates/`, `services/`, `supabase/`, `docs/`, `audit/`, `tasks/`, `reports/`, `examples/`, and `scripts/` are the right large buckets for an OpenAI/Anthropic-style application suite.

The repo no longer has the most damaging founder-plus-LLM symptoms at root: scratch captures, historical campaign docs, reference catalogs, raw reference-index catalogs, local-only artifacts, stale Web feature shims, split Web feature roots, ambiguous Web workspace filters, duplicate Expo app configs, oversized current docs, Mobile waitlist pilot barrels, Mobile schedule layer-sprawl, Mobile billing service sprawl, Desktop temporary feature shims, workspace package deep imports, duplicate CLI release workflows, CLI release artifact-name drift, unowned report collections, implicit CI blind spots, provisional CODEOWNERS drift, and new legacy Supabase migration drift have been moved, archived, ignored, untracked, summarized, removed, or guarded.

The remaining work is no longer hidden repo entropy. It is explicit product-domain migration work: the large Desktop domains (`UnifiedAgenticChat`, `Settings`, `MCP`, `Artifacts`, `Memory`, execution/tooling domains) still need one-domain-at-a-time moves, and Mobile's remaining layer-first services/hooks should continue moving only when ownership is obvious. Replacing provisional CODEOWNERS with real GitHub teams also remains an external organization step after the team exists.

## Evidence Snapshot

| Area                            | Finding                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped non-generated file count | `6156` files excluding common generated/build folders.                                                                                                          |
| Largest top-level buckets       | `apps` 4752, `packages` 492, `crates` 178, `tasks` 163, `docs` 150, `services` 88.                                                                              |
| Largest product surfaces        | `apps/desktop` 2178 tracked files, `apps/web` 1292, `apps/cli` 552, `apps/mobile` 507.                                                                          |
| Shared package README coverage  | Top-level packages now have README ownership files. Provider leaf packages now have README files.                                                               |
| App/service README coverage     | Apps and services now have README ownership files.                                                                                                              |
| Crate README coverage           | Top-level crates now have README ownership files.                                                                                                               |
| Root source files               | Root is now short and intentional; scratch/historical/reference files were moved.                                                                               |
| Agent operability               | `docs/agent-context/` is implemented, metadata is strict, and checks pass.                                                                                      |
| Guardrails                      | `pnpm check:llm-operability` covers agent context, root hygiene, boundaries, structure, artifacts, reports, Supabase, CI, CODEOWNERS, READMEs, hooks, and docs. |
| Environment baseline            | Current shell uses Node `v22.21.1` and pnpm `9.15.3`, matching the repo engine contract.                                                                        |

## 2026-05-21 Checkpoint Update

- The broad dirty workspace was split into scoped commits for Web feature-root consolidation, Mobile feature barrels, CLI command naming, enterprise control-plane foundation, extension security cleanup paths, docs consolidation, repo-operability guardrails, Expo config drift removal, Web workspace filter cleanup, and README ownership hardening.
- The working tree is clean after the checkpoint sequence.
- Mobile Expo config is now single-source: root `app.json` and duplicate `apps/mobile/app.json` are removed, and repo-organization checks enforce `apps/mobile/app.config.js`.
- Web deployment and helper scripts now use `@agiworkforce/web` as the canonical workspace filter; `pnpm check:structure-conventions` rejects active-file regressions to ambiguous `--filter web`.
- README ownership markers are no longer advisory. Missing `Status:`, `Owner`, or `Purpose` markers now fail `pnpm check:readme-ownership`.
- The 2026-05-21 A+ push moved Mobile schedules under `apps/mobile/src/features/schedules`, completed the Mobile component-heavy domain wave under `apps/mobile/src/features`, added feature ownership READMEs for all current Web/Mobile/Desktop feature folders, hardened package public-export boundaries, removed duplicate CLI release workflow drift, restored linux-arm64 CLI release coverage, froze legacy Supabase migrations, and aligned CI/Web release filters with canonical workspace names.

## Scorecard

| Dimension                    | Grade | Why                                                                                                                                                                                                          |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top-level architecture       | A+    | Correct monorepo spine, clear six-surface/product-platform buckets, root clutter classified, and top-level report/audit ownership enforced.                                                                  |
| Product-code discoverability | A     | Web feature-root split is fixed; Mobile component-heavy domains are under `src/features`; 14 Desktop small domains moved; large Desktop domains and remaining Mobile service/hook ownership remain explicit. |
| LLM operability              | A+    | Agent docs, lane maps, shared-file policy, task templates, known flaws, command maps, feature READMEs, and strict checks are in place.                                                                       |
| Human onboarding             | A     | Root docs, CONTRIBUTING, app/package/crate/service READMEs, current metadata, report retention, and ownership routes are in place.                                                                           |
| Source-of-truth discipline   | A+    | Current docs are compact, metadata-checked, archived historical docs are isolated, and retired top-level doc paths are guarded.                                                                              |
| Root hygiene                 | A+    | Root is short and intentional; backslash-named root entries, stale Expo app configs, and unclassified root files now fail checks.                                                                            |
| Generated artifact hygiene   | A     | Tracked local/generated debt is removed or archived; report roots and collections now have enforced retention metadata.                                                                                      |
| Package boundaries           | A+    | Boundary and README ownership checks pass; workspace package deep imports now fail unless the package explicitly exports the subpath.                                                                        |
| CI/repo guardrails           | A+    | Repo-operability, structure, hook, README, doc-status, artifact, report, release, CI, CODEOWNERS, Supabase, and package-boundary checks pass.                                                                |
| Hiring readiness             | A+    | A new engineer or coding agent can navigate ownership, commands, lanes, report retention, CI expectations, and provisional owner routing.                                                                    |

## Main Findings

1. **Root is now mostly boring.**
   Scratch design markdown, screenshots, historical campaign docs, reference catalogs, duplicate Expo config, and root downloads were moved or removed. Keep the allowlist strict.

2. **Docs now have a compact current layer.**
   `docs/current/` summarizes the current product, architecture, commercial posture, and repo-operability rules. Former top-level PRD/roadmap/pricing/architecture/scaling/handoff docs are archived under `docs/archive/2026-05-21-docs-consolidation/`, and active references are guarded by CI.

3. **Package and crate ownership context is now covered at the README level.**
   The remaining ownership work is CODEOWNERS mapping to real GitHub teams and deeper feature/domain READMEs inside large apps.

4. **Web feature-root, Mobile component domains, Desktop small domains, and release drift are closed; remaining large Desktop domains are next.**
   `apps/web/features` is now canonical, `apps/web/src/features` is forbidden by `pnpm check:structure-conventions`, and active Web commands use `@agiworkforce/web`. Mobile waitlist, projects, billing, schedules, component-heavy domains, voice services, and messaging service/state now have canonical domains under `apps/mobile/src/features`. The duplicate CLI release workflow is removed; `release-cli.yml`, `install.sh`, and Homebrew asset names align. Large Desktop domains and Mobile's remaining feature-specific services/hooks still need one-domain-at-a-time moves from the existing `docs/plans/domain-first-reorg.md`.

5. **Generated/build and report output are now classified.**
   Tracked generated artifacts and loose report files are guarded. Local ignored build output can still exist on a developer machine, but it no longer defines repo structure.

6. **Agent-tool folders need explicit contracts.**
   `.claude`, `.codex`, `.cursor`, `.opencode`, `.agents`, `.agent`, `.minimax`, `.superpowers`, `.remember`, and `.playwright-mcp` all need classification before any move/delete. Some may be source-controlled team context; others are local caches or generated captures.

7. **Node version mismatch is resolved in the current shell.**
   The active environment is Node `v22.21.1` with pnpm `9.15.3`, matching the root engine and package-manager contract.

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

Status: mostly done.

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

Status: mostly done.

Tasks:

- Move scratch root markdown/images into dated folders under `reports/` or `_archive/`.
- Move reference catalogs into `docs/reference/` and raw generated ownership catalogs into `audit/repo-organization/reference-index/`.
- `MASTER_PLAN.md` and `AGIWORKFORCE_IMPLEMENTATION_LOG.md` moved under `docs/archive/2026-05-14-reverse-engineering-campaign/`.
- `REFERENCE_INDEX.md` and `REFERENCE_STRUCTURE.md` moved under `docs/reference/`.
- Keep only source-of-truth docs and required config at root.
- Tighten `scripts/check-repo-organization.mjs` from warning mode to failure mode after moves.

Acceptance:

- `git ls-files | awk -F/ 'NF==1 {print}'` is short and intentional.
- New root markdown/image files fail CI unless allowlisted.

### Phase 3: Documentation And Agent Context

Goal: one current doc graph for humans and agents.

Status: mostly done.

Tasks:

- Add status headers to active strategy docs.
- Update stale references to `UNIFIED_LAUNCH_PLAN`, old Claude memory, and older canonical claims.
- Expand `docs/agent-context/doc-status.json` to cover all current durable docs.
- Add compact current docs under `docs/current/`.
- Archive former top-level long-form docs under `docs/archive/2026-05-21-docs-consolidation/`.
- Replace oversized root `AGI_WORKFORCE.md` with a compact entry point.
- Promote repeated audit/security findings into `docs/agent-context/known-flaws.md`.
- Guard retired top-level docs and active references in `pnpm check:structure-conventions`.

Acceptance:

- New engineer starts from `README.md`, `AGENTS.md`, or `docs/README.md` and reaches the same current sources.
- Coding agents no longer rely on stale launch docs to decide current state.
- Core current docs stay short enough for LLM context and cite archives only as source material.

### Phase 4: Package, Crate, And Service Ownership

Goal: every shared boundary explains itself locally.

Status: mostly done.

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

1. Web - `apps/web/src/features` consolidation done, and active commands now use `@agiworkforce/web`.
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

## Immediate Next Tasks

1. Commit the repo-organization script fix and this grade report. Done in `0d842263b`.
2. Add root classification ledger. Done.
3. Add tool-folder classification ledger. Done.
4. Add package README coverage ledger. Done.
5. Add docs status ledger. Done.
6. Add generated artifact policy. Done.
7. Move root scratch files into a dated archive/report folder. Done in `reports/root-scratch-archive/2026-05-20/`.
8. Add missing READMEs for `apps/web`, `apps/desktop`, `apps/extension`, and both services. Done.
9. Add P0 package READMEs for `packages/types`, `packages/runtime`, `packages/providers`, and `packages/unified-chat`. Done.
10. Add CI job for `pnpm check:llm-operability`. Done in `.github/workflows/repo-operability.yml`.
11. Finish Web feature-root cleanup. Done; `apps/web/src/features` is forbidden by structure checks.
12. Remove stale Expo config drift. Done; `apps/mobile/app.config.js` is canonical.
13. Fix ambiguous Web workspace filters. Done; active commands use `@agiworkforce/web`.
14. Harden package public-export boundaries. Done; workspace package deep imports now fail unless explicitly exported.
15. Move Mobile schedules into the canonical feature root. Done; old schedule component/service/store paths are forbidden.
16. Add feature ownership READMEs. Done; Web/Mobile/Desktop feature folders are checked by `pnpm check:readme-ownership`.
17. Remove duplicate CLI release workflow and align release assets. Done; `release-cli.yml` is canonical and guarded.
18. Freeze legacy Supabase migration drift. Done; new SQL under `apps/web/supabase/migrations` fails `pnpm check:supabase-migrations`.
19. Continue remaining Mobile and Desktop domain-first cleanup one domain at a time.

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
