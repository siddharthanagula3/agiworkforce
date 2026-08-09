# AGI Workforce — Audit Remediation Execution Plan

Status: Current
Owner: Platform lead
Last updated: 2026-08-08

## The three audit sources

This remediation now has three independent inputs. They overlap heavily and
contradict each other in places, which is useful — a finding that all three
reach independently is worth more than one that appears once.

| Source                                        | Scope                                                                           | Where it lives                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| **This ledger** (5 artifacts: BL/SC/PP/CM/HC) | 535 verification items across 10 phases; the stop gate                          | this file                                       |
| **Gap audit, 2026-08-08**                     | 21 GAP items, evidence-graded CONFIRMED / TRACKED / LIVE-PROOF-REQUIRED / STALE | `docs/current/gap-audit-2026-08-08.md`          |
| **Wave 6 — conformance**                      | 592 canonical concepts scored; 117 findings, 2 critical                         | artifact `5d12b3a1-9e2c-4140-a9df-0ca34e171a7b` |

The gap audit's grading is the most useful convention of the three and should be
adopted here: it separates "confirmed in current source" from "recorded by an
older ledger and not revalidated" from "code exists, production configuration
unproven". Most disagreement between the three sources is explained by that
distinction rather than by anyone being wrong.

Wave 6's central finding is worth repeating because it changes what the work
_is_: only 36 of 592 concepts are genuinely conflated and 7 inverted. The
codebase does not misunderstand its domain. The recurring defect is that **a
correct abstraction exists and the code that should consume it doesn't** — a
policy engine with zero call sites, an agent runtime used by 2 of 11 loops, a
shipped realtime protocol with zero producers. That is wiring work, not design
work, and it is a much better position to be in.

## How this file relates to `ExecutionPlan.md`

Two files, two roles, deliberately not merged.

**This file is the requirements ledger.** Every finding from the five audit
artifacts, with its task ID, resolution mode and acceptance criteria. It says
what must become true, and Phase 9 is the stop gate.

**`ExecutionPlan.md` is the work queue.** The subset verified against the
current tree, carrying the `Writes:`/`Verify:` metadata a scheduler needs to run
items in parallel without two agents clobbering the same file. It says what to
do next.

Merging them would lose one or the other: a ledger entry carries no collision
key, and a queue item carries no acceptance criteria. When a queue item lands,
mark the ledger task it satisfies and record the commit — the ledger is what
Phase 9 reads, so an unmarked ledger entry is an open finding no matter how much
code was written.

**Both files have a real false-positive rate.** Two claims in these artifacts
have already been disproved against source: the "empty Team panel" was a
mid-frame render capture, and the Enterprise `$1,000,000` headroom is a
documented deliberate design. `NOT APPLICABLE` below is a legitimate outcome and
must be recorded with the same evidence a fix gets.

---

**Purpose:** convert the findings in the seven supplied audit screenshots into a dependency-ordered remediation plan that a coding agent can execute repeatedly. The agent must continue until every applicable finding is resolved and every final gate passes.

**Open verification items in this plan at generation time:** 535

**Audit sources represented here**

1. **BL — Business layer:** “The business layer nobody had audited.”
2. **SC — Scale/readiness:** “What is unfinished, what is slow, and what does not scale.”
3. **PP — Product parity:** “What the product promises, and what the code does.”
4. **CM — Contract mismatch:** “Two things that should match, don’t.”
5. **HC — Hardcoding:** “Where this repo hardcodes things it shouldn’t.”

The screenshots were captured on **2026-08-08**. Several reports refer to an audit branch/commit around `chore/retire-stale-docs` / `7611c622b` (BASE-001 corrected the branch name from the reported `chore/retro-stale-docs`, which does not exist); older supporting diligence material refers to `fix/audit-remediation-2026-07-25` / `9ba68da627f55ef6d8e0c6e0cb078dcce109a694`. **Line numbers and file locations may have moved. The finding remains open until the current equivalent is located and verified.**

---

## 0. Coding-agent mandate

Use this file as the controlling work queue.

```text
Read this document completely before editing code.

Execute phases in order, while respecting dependencies and severity.
At the start of every loop:
1. Load the current repository state and this ledger.
2. Select the first unresolved task whose dependencies are complete.
3. Reproduce or prove the finding against the current commit.
4. Fix the root cause, not only the visible symptom.
5. Add a regression test and, where applicable, an automated guardrail.
6. Run the narrowest relevant checks, then the required cross-surface checks.
7. Record exact evidence: changed files, migration IDs, tests, commands, and results.
8. Mark the task complete only when its acceptance criteria pass.
9. Continue immediately to the next unresolved task.

Do not declare completion because code was written, a test was added, the issue was
already documented, or a UI was hidden. Stop only when the Final Stop Gate passes.
```

### Resolution modes

Every finding must end in exactly one explicit state:

- **IMPLEMENT** — build the missing behavior end to end.
- **WIRE** — connect an existing implementation to the real production path and remove parallel dead paths.
- **CANONICALIZE** — create one owner/contract/constant and migrate every consumer.
- **REMOVE** — delete dead, duplicate, unsafe, or falsely advertised code.
- **DOWNGRADE** — change product copy, capability metadata, UI, docs, and tests so an intentionally unshipped feature is consistently labeled planned/unavailable.
- **NOT APPLICABLE** — allowed only with repository evidence proving the reported path no longer exists and no equivalent defect remains. Record the proof and add a regression guard if recurrence is possible.

A task is **not resolved** by changing copy alone when the product still exposes a broken control or API. A task is **not resolved** by implementing backend code alone when the user-visible path remains unwired.

### Required status notation

- `[ ]` open
- `[~]` in progress
- `[x]` complete and verified
- `[!]` externally blocked; do not claim completion

For every completed task, append an evidence line in this form:

```text
Evidence: <commit or diff>; <changed paths>; <tests/commands and results>; <runtime proof>
```

### Non-negotiable engineering rules

1. **One canonical owner.** Routes, roles, plans, model/provider IDs, limits, timeouts, prompts, and design tokens must have one production owner.
2. **Server/host authority.** Entitlements, permissions, approvals, tenant boundaries, billing, and security policy cannot depend on client-only checks.
3. **Fail closed.** Unknown role, mode, provider, route, capability, or policy state must not silently widen access.
4. **Idempotency.** Webhooks, approvals, payments, jobs, retries, and externally visible writes must tolerate replay.
5. **No false capability.** Present-tense product copy must correspond to a reachable, tested production path.
6. **No hidden completion.** Existing but unmounted/unregistered code is unfinished.
7. **No untrusted instructions.** Web, file, connector, browser, tool, and repository content is data, not authority.
8. **No silent trust-mode switch.** Local, user-key, and managed-cloud boundaries remain explicit and immutable per run unless a visible, consented handoff creates a new run.
9. **Tests must fail before the fix.** A regression test should demonstrate the defect or invariant whenever technically possible.
10. **No stop with skipped gates.** A skipped, flaky, or unavailable required test remains a blocker unless the test itself is repaired and executed.

---

## 1. Execution ordering

The screenshot reports are preserved in the source tags, but execution is reordered to avoid building on broken foundations:

1. **Phase 0:** establish reproducible baseline and repair red guardrails.
2. **Phase 1:** security, authorization, billing, data-integrity, and false-production-path defects.
3. **Phase 2:** contract, schema, route, prompt, and token drift.
4. **Phase 3:** hardcoded literals and duplicate configuration.
5. **Phase 4:** product-promise and end-to-end feature gaps.
6. **Phase 5:** unfinished, slow, concurrency, and scale defects.
7. **Phase 6:** business-layer completion and unit-economics instrumentation.
8. **Phase 7:** documentation, marketing, and capability metadata reconciliation.
9. **Phase 8:** distribution, enterprise readiness, and release proof.
10. **Phase 9:** full validation and stop gate.

---

# Phase 0 — Establish a trustworthy baseline

## P0.1 Snapshot and working-state controls

- [x] **BASE-001 — Record the exact starting state.** Save branch, commit SHA, package-manager version, Rust toolchain, Node version, OS, environment mode, and `git status` in the remediation log. This ledger is the remediation log; no baseline record existed anywhere in the repo before this entry (`grep -rl BASE-001` matched only this file).

      Evidence: recorded 2026-08-09. Two baselines exist and they are not the same commit.

      **Audit baseline** — what the findings in this ledger were captured against:
      branch `chore/retire-stale-docs`, commit
      `7611c622b9e1db99d5e9cf8fec2656d1bedec0bf` (`feat(billing): require two seats
      to buy team`, 2026-08-08 11:35:13 -0500). Correction: §"Audit sources" above
      spells this branch `chore/retro-stale-docs`; `git branch -a` has only
      `chore/retire-stale-docs`. Corrected in place.

      **Remediation baseline** — where the work is currently landing: branch
      `fix/codeql-high-severity-batch-1`, commit
      `73648df8c776f36d88e0c8b6a53b0051c2a4f939` (`docs(plan): the work queue is
      empty — 86 done, 9 blocked, 3 reverted, 1 dismissed`), ahead of its remote by
      55 commits. `git status --porcelain` → 0 lines immediately before this entry was
      written (working tree clean); the only change after it is this ledger edit.

      **Divergence, and it matters.** HEAD does not contain the audit commit:
      `git merge-base --is-ancestor 7611c622b HEAD` → false. Merge base is
      `86255ed3c` (`fix(ci): reclaim runner disk before the native sidecar build`,
      2026-08-07). `86255ed3c..HEAD` is 92 commits; 8 commits on the audit branch are
      absent from HEAD:

      ```text
      7611c622b feat(billing): require two seats to buy team
      aa796be07 refactor(web): pair the pricing toggles and lift the title
      8f8f00178 fix(web): remove the rule and dead space under the pricing header
      7210322d1 refactor(web): cut the pricing page down to prices
      73380216f feat(web): segment pricing by audience like chatgpt and claude
      7ae6c910c feat(web): serve the product on the root domain
      0e74383ca chore(docs): retire nine orphaned adrs and correct the decision index
      7214d0c70 chore(docs): retire 228 stale documents and the readme-ownership guard
      ```

      Any finding touching web pricing, root-domain serving, or the retired ADR/doc
      set must be verified against `chore/retire-stale-docs` as well as HEAD — a
      `NOT APPLICABLE` proved only on HEAD says nothing about those 8 commits, and a
      fix landed only on HEAD does not reach them.

      **Toolchain, all matching their pins.** Node `v24.18.0` (`package.json`
      `engines.node: "24"`; `.github/workflows/ci.yml:91` `node-version: 24`). pnpm
      `9.15.3` (`package.json` `packageManager: pnpm@9.15.3`, `engines.pnpm: >=9.15.0`).
      `rustc 1.94.0 (4a4ef493e 2026-03-02)` / `cargo 1.94.0`, active toolchain
      `1.94.0-aarch64-apple-darwin` overridden by `rust-toolchain.toml` (`channel =
      "1.94.0"`), which matches every CI pin (`ci.yml:255,552,750,813,854`,
      `codeql.yml:47`, and `RUST_VERSION: '1.94.0'` in `release-cli.yml:25`,
      `release-desktop.yml:41`, `build-windows-release.yml:22`).

      **OS:** macOS 26.5.2, `Darwin 25.5.0 arm64` (aarch64-apple-darwin).

      **Environment mode:** `NODE_ENV` is unset in the baseline shell, so surfaces
      resolve to their framework development default. `.env.local` is present and
      ignored by `.gitignore:195` (`.env*.local`); its contents are deliberately not
      read or recorded here.

- [x] **BASE-002 — Discover repository-owned commands.** Discovery performed; the
      canonical map already existed and was extended to cover the Rust and
      security gates it was missing.

      Evidence: `docs/agent-context/commands.json` is the canonical command map
      (`AGENTS.md:98`), enforced by `scripts/check-agent-context.mjs:367-412` and
      `scripts/check-service-layer.mjs:118-123`. Discovery sources read this run:
      root `package.json` (97 scripts), root `Cargo.toml` members
      (`apps/desktop/src-tauri`, `apps/cli`, `crates/*` — 14 packages per `cargo
      metadata`), 18 `.github/workflows/*.yml`, `scripts/check-*.mjs`, and
      `AGENTS.md`. Every command string in `commands.json` was resolved against
      real root/workspace scripts; the only two that do not resolve are the
      package-manager builtin `pnpm install` and the `testSinglePackage`
      placeholder template.

      Gap found and closed: the map documented `cargo check --workspace` but none
      of the blocking Rust or security gates, so an agent running BASE-003 would
      have had to invent them. Added to `repoWide`: `rustClippy`,
      `rustClippyWorkspace`, `rustFmtCheck`, `rustDependencyPolicy`,
      `rustDependencyAdvisories`, `secretScan`, `dependencyAuditJs`; added to
      `surfaces.desktop`: `rustTest`, `rustTestSingle`. Each string is copied from
      its CI definition (`ci.yml:115`, `:169`, `:311`, `:322`, `:368`, `:392`,
      `:836`; `release-cli.yml:94`), not composed.

      Verified 2026-08-09: `node scripts/check-agent-context.mjs` → exit 0;
      `node scripts/check-service-layer.mjs` → exit 0; `node
      scripts/check-secrets.mjs` → exit 0. `cargo fmt --all -- --check` → exit 1
      on a pre-existing diff in `apps/cli/src/models/streaming.rs:578` — a
      baseline failure for BASE-003/BASE-004, not introduced here and not owned by
      this task.

- [x] **BASE-003 — Create a reproducible baseline report.** Baseline run recorded
      below. Six required gates are red — including the web production build — plus
      seven repo-defined commands that no workflow or hook enforces.

      Evidence: run 2026-08-09 on branch `fix/codeql-high-severity-batch-1`, commit
      `73648df8c776f36d88e0c8b6a53b0051c2a4f939` — the BASE-001 remediation baseline.
      `git status --porcelain` was empty when the sweep started and still empty apart
      from this ledger edit when the guard sweep finished; concurrent lanes began
      writing to the tree afterwards, so re-running these commands later measures
      their working tree, not this commit. Every command is a repo-owned command from
      `package.json` / `docs/agent-context/commands.json`; none were invented, and
      nothing was skipped to keep the report green.

      Read `pnpm check:llm-operability` (`package.json:145`) with care: it is a
      `&&` chain, so it stops at the first red guard and hides every guard after it.
      It aborts at `check:module-reachability`, which is only the 14th of 38. The
      guards were therefore also run one at a time; three more failures were behind
      that wall.

      **Green.** `pnpm lint` (45 tasks, 19.9s) · `pnpm lint:extension` ·
      `pnpm typecheck:all` (45 tasks, 30.1s) · `pnpm test:l1:l2` ·
      `pnpm test:db-migrate` · `pnpm audit --audit-level=high` (29 advisories, 2 high,
      both already ignored by policy) · `pnpm check:secrets` ·
      `pnpm check:hardcoded-arrays` · `pnpm check:protocol-types` ·
      `pnpm check:lock-drift` · `pnpm sync:models:check` · `pnpm check:ui-gaps` ·
      `pnpm check:ui-gaps:monotonic` (comparison skipped: no base ref locally) ·
      `bash scripts/check-no-hardcoded-models.sh` ·
      `node apps/desktop/scripts/check-wiring.mjs` · `cargo check --workspace` (1m37s) ·
      `AGIWORKFORCE_SKIP_VENDORED_BWRAP=1 RUSTFLAGS='' CARGO_INCREMENTAL=0 cargo test
      -p agiworkforce-desktop --lib` (`ci.yml:368`; 4694 passed, 0 failed, **32
      ignored** — that ignore count is BASE-008's inventory, not a pass) ·
      `cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings
      -D unsafe-code` (4m41s) · and these individual guards, each exit 0:
      surface-invariants, structure-conventions, mobile-hygiene, service-layer,
      lane-ownership, generated-artifacts, report-retention, non-md-artifacts,
      neon-migrations, workflow-cargo-features, codeowners, readme-ownership,
      doc-status, hooks, hook-fire-sites, model-catalog, marketing-models,
      availability-invariant, db-isolation, css-tokens, llm-failures, trust-boundaries,
      capability-boundaries, provider-contracts, agent-context, audit-inventory,
      capability-gaps, executable-docs, agent-context-indexes, repo-organization,
      workspace-scripts, boundaries, cloud-contract-ownership, artifact-sync-ownership,
      service-domain-ownership.

      **Red, and required by CI or `.husky/pre-push`.**

      1. `pnpm --filter @agiworkforce/web build` → exit 1. Turbopack compiles, then
         page-data collection dies: `TypeError: (0 , o.createContext) is not a
         function` at the `MarketingFooter` import — `app/about/page.tsx:5` on the
         first run, `app/accessibility/page.tsx:4` on a second run, i.e. whichever
         marketing page is collected first, reproduced twice. Mechanism, read from
         source: `MarketingFooter` → `@shared/components/agi/AgiMark`
         (`apps/web/shared/components/agi/AgiMark.tsx:6`, a re-export shim) →
         the `@agiworkforce/ui` barrel `packages/ui/ui/src/index.ts`, which carries no
         `'use client'` and re-exports client-only primitives that call
         `React.createContext` at module scope —
         `packages/ui/ui/src/primitives/Carousel.tsx:1` and
         `packages/ui/ui/src/primitives/ToggleGroup.tsx:1`, re-exported at
         `packages/ui/ui/src/index.ts:187` and `:265-270`.
         A server component evaluating that barrel gets the RSC React build, where
         `createContext` does not exist. Web is a deployable surface CI builds
         (`ci.yml:224-231`). Not bisected — no checkout was performed.
      2. `pnpm check:module-reachability` (`ci.yml:142`, and inside
         `check:llm-operability`) → exit 1: "known unreachable baseline is stale;
         remove wired/deleted path(s): apps/desktop/src/constants/timeouts.ts"
         (`scripts/check-module-reachability.mjs:251`).
      3. `pnpm check:surface-reachability` (inside `check:llm-operability`) → exit 1,
         same stale path, second copy:
         `scripts/config/surface-reachability-allowlist.json:58`.
         2 and 3 are both fallout of `be38f2cf4` ("make the ipc timeouts apply to the
         invoke callers actually use", ledger HARD-007/008/015), which wired
         `constants/timeouts.ts` into `utils/ipc.ts`, `api/ollama.ts`, `api/mcp.ts` and
         `stores/chat/agentWorkflowEvents.ts` without removing the two ratchet
         entries. The file is genuinely reachable now; the fix is deleting one line
         from each list, and it belongs to whoever owns those ratchets — not to this
         reporting task.
      4. `pnpm check:env-contract` (inside `check:llm-operability`) → exit 1: "web:
         apps/web/lib/moderation/hash-denylist.ts reads undocumented environment
         variable MODERATION_HASH_DENYLIST". Introduced by `7aa633875`.
      5. `pnpm check:ci-guardrails` (inside `check:llm-operability`) → exit 1:
         `vercel.json must include "\"source\": \"/v1/chat/completions\""`
         (`scripts/check-ci-guardrails.mjs:473`). `438e154d4` (ledger MATCH-008) moved
         that rewrite out of `vercel.json` into `apps/web/next.config.ts:98-99`, where
         it still exists; the guard's assertion now names the wrong owner. This one is
         a stale guard, not a lost route — but it is red, so pre-push is red.
      6. `pnpm test` → exit 1. 42 of 45 turbo tasks pass; mobile fails 1 of 2767
         (`apps/mobile/__tests__/paywall-bottom-sheet.test.tsx:165` expects
         "Upgrade to Max", the sheet renders "Upgrade to Max 5x"). `9f36c2d1a` ("one
         vocabulary for plan tiers") made "Max 5x" canonical
         (`packages/contracts/types/src/billing-catalog.ts:167`) and added
         a replacement asserting the new label at
         `apps/mobile/src/features/chat/components/__tests__/PaywallBottomSheet.tierLabels.test.tsx:57`,
         but left the old assertion behind. One stale expectation, not a product
         defect.

      Items 1-6 all trace to commits made after the merge base `86255ed3c`, i.e. by
      this remediation today (`be38f2cf4`, `7aa633875`, `438e154d4`, `9f36c2d1a`,
      and the `@agiworkforce/ui` barrel last touched by `c5d67f7be`). None are
      inherited debt. BASE-004 should classify them as remediation regressions.

      **Red, but not wired to CI or a hook** (repo-defined commands that no workflow
      and no husky hook runs — real, lower priority):

      - `pnpm format:check` → 733 files fail Prettier. Nothing enforces it; `lint`
        and the Claude post-save hook do not cover the repo.
      - `pnpm check:licenses` → "THIRD_PARTY_LICENSES.md not found"
        (`scripts/check-licenses.mjs:146`). The file was deleted in `906fe5cda` and
        never restored, while `AGENTS.md:88`, `docs/legal/README.md:68` and
        `docs/agent-context/known-flaws.md:2762` still describe it as the place
        third-party license obligations are recorded. Its pre-deletion content is
        recoverable (`git show 906fe5cda^:THIRD_PARTY_LICENSES.md`). Restoring it is
        a legal-content decision, not a mechanical fix.
      - `pnpm check:reference-integrity` and `pnpm docs:check` → 43 undeclared
        references, mostly `ExecutionPlan.md` citing paths that no longer resolve.
      - `pnpm check:spec-artifacts` → all 8 expected artifacts missing
        (engineering_rules, feature_matrix, competitor_matrix, implementation_map,
        dependency_graph, release_checklist, roadmap, architecture_report); the
        directory the checker expects them in does not exist.
      - `cargo fmt --all -- --check` → exit 1 on
        `apps/cli/src/models/streaming.rs:578` (already reported under BASE-002).
        Gates the `v-cli-*` release workflow (`release-cli.yml:94`), not PR CI.
      - `python3 scripts/check-no-conflict-markers.py` → 36 markers, all inside
        untracked local artifacts (`tmp/uiref/agiw-full.tar`, the downloaded
        `apps/extension-vscode/.vscode-test/` VS Code harness). The gate walks the
        working tree with `os.walk` rather than `git ls-files`
        (`scripts/check-no-conflict-markers.py:73-78`), so it is green on a fresh CI
        checkout and red on any developer machine that has run the VS Code
        integration tests. False positive locally, real ergonomics defect.

      **Not run, and why.** Playwright/E2E (`e2e-tests.yml`, needs browsers and a dev
      server), Semgrep (`ci.yml:206`, not installed), `cargo deny` (`ci.yml:311,322`,
      needs `cargo install cargo-deny`), and the Chrome/VSIX packaging steps
      (`ci.yml:233`, needs release fixtures), and `cargo test -p agiworkforce-cli`
      (`ci.yml:369`; only the desktop half of that CI step was run). Those five are the
      remaining gap in this baseline; treat them as unknown, not green.

- [ ] **BASE-004 — Classify failures.** Separate pre-existing failures from remediation regressions, but do not ignore either category.
- [x] **BASE-005 — Establish a clean evidence directory.** NOT APPLICABLE — the task's own
      escape clause fires: the repository already defines the location, so nothing new
      should be established.

      Evidence: `docs/current/agent-and-repo-operability.md:44-48` names the contract —
      evidence belongs in `audit/`, generated reports in `reports/` or `audit/reports/`,
      never at root. It is enforced, not just written down:
      `scripts/check-repo-organization.mjs:184-198` keeps `audit/` a required root that
      `scripts/clean-repo.mjs` may not delete or classify as stale, and its root allowlist
      rejects any unclassified root directory or file, so evidence cannot be dropped beside
      the source tree. `scripts/check-report-retention.mjs:9-46` requires
      `Status`/`Owner`/`Purpose`/`Retention` metadata on each report root and child
      collection. Both run in `pnpm check:llm-operability` (`package.json:145`), which
      `pre-push` executes. Local scratch is kept out of committed source by `.gitignore`
      (`/artifacts/`, `reports/generated/`, `reports/audit/gate-baseline/`, `test-results/`,
      `playwright-report/`, root `/*.png`).

      Verified 2026-08-09: `node scripts/check-repo-organization.mjs` → exit 0, "Repo
      organization check passed."; `node scripts/check-report-retention.mjs` → exit 0,
      "Report retention check passed." Use `audit/` for this remediation's evidence.

## P0.2 Repair known red guardrails first

- [x] **BASE-006 — Remove stale Google Batch wiring entries.** NOT APPLICABLE — already resolved before this ledger was written.

      Evidence: `grep -c google_batch apps/desktop/wiring-allowlist.json` → `0`. The
      allowlist carries no `google_batch_*` entry, so there is nothing stale to remove
      and the checker was never weakened. Note the audit's path for the checker is
      wrong: it lives at `apps/desktop/scripts/check-wiring.mjs`, not `scripts/`.

- [x] **BASE-007 — Make the wiring guard green from a clean checkout.**

      Evidence: `node apps/desktop/scripts/check-wiring.mjs` → exit 0, "Wiring check
      passed: 1272 registrations, 1268 frontend calls (1203 from 1223 modules reachable
      from apps/desktop/src/main.tsx), 1270 Rust command definitions, 4 reviewed orphan
      allowlist entries, 65 reviewed reachability allowlist entries." Run 2026-08-08 on
      commit 41d766367.

      The 4 orphan and 65 reachability allowlist entries are reviewed exemptions the
      checker already accounts for, not suppressions added to make this pass.

- [ ] **BASE-008 — Audit skipped tests.** Inventory every `test.skip`, conditional no-op, ignored Rust test, quarantined suite, and CI exclusion. Each must be fixed, explicitly time-bounded with an owner, or removed with an evidence-backed reason. The prior audit found many Desktop visual/settings/GDPR tests silently skipping.
- [x] **BASE-009 — Add an audit-plan progress check.** Add a simple script that fails if this ledger contains open tasks when a release-completion command is invoked. It must not run in ordinary developer flows unless intentionally configured.

      Evidence: `scripts/check-audit-progress.mjs` parses this ledger (skipping fenced
      code blocks) and exits 1 while any `- [ ]` remains, grouping open items by task ID.
      Its only caller is step `[9/9]` of `scripts/launch-readiness-check.sh:135-144`, the
      manual pre-tag release-completion command; it is not registered in `package.json`,
      turbo, or any workflow, so no ordinary developer flow runs it.

      Runs 2026-08-09: repo root → exit 1, "524 of 535 tasks ... are still open";
      fixture with every box checked → exit 0, "535 ledger tasks, all closed"; missing
      ledger → exit 1 (fails closed). `node scripts/check-repo-organization.mjs` and
      `node scripts/check-workspace-scripts.mjs` stay green.

**Phase 0 exit criteria**

- Baseline commands and failures are recorded.
- Required existing CI guardrails run locally.
- The stale wiring failure is fixed rather than suppressed.
- The working tree contains only intentional remediation changes.

---

# Phase 1 — Critical correctness, security, authorization, and commercial integrity

## 1A. Public product paths that are broken or misleading

### CRIT-001 — Connector catalog is largely nonfunctional by default

**Source:** PP, BL  
**Reported evidence:** `apps/web/lib/connectors/oauth-registry.ts` contains no real OAuth provider registrations; non-operator connector IDs return `501`; only GitHub and custom MCP are genuinely connected while many branded connectors are advertised in present tense.

- [ ] Choose one resolution per connector: implement the full authenticated adapter, or downgrade/remove it everywhere.
- [ ] Create a canonical connector capability registry containing implementation status, auth scheme, scopes, supported actions, surfaces, risk class, health, and release state.
- [ ] Generate catalog UI, API availability, tool discovery, docs, and tests from that registry.
- [ ] Ensure an unavailable connector cannot render a working-looking Connect button.
- [ ] Add contract tests proving each `available` connector completes authorize → callback → credential storage → discovery → read/write action → disconnect/reauthorize.
- [ ] Add a repository guard that rejects present-tense connector copy for entries whose implementation state is not production-ready.

**Done when:** every visible connector is either end-to-end functional or consistently labeled planned/unavailable; no default connector produces a surprise `501` after a successful-looking setup flow.

### CRIT-002 — Enterprise custom limits collapse to zero

**Source:** PP, BL  
**Reported evidence:** `toEnforceableLimit()` lacks a `custom` arm; enterprise custom connector/project limits can become `0`; safe-plan labels omit Enterprise.

- [x] Define one exhaustive limit type covering finite, unlimited, contract/custom, disabled, and inherited states. — `BillingPlanLimit` + `toEnforceableBillingPlanLimit` already model number / 'unlimited' / 'custom' / unknown.
- [x] Make every conversion exhaustive; unknown states fail closed without converting contract values to zero.
- [x] Add tests for every plan and capability, including Enterprise contract values and missing-contract behavior.
- [x] Add a guard so a new copy of the conversion cannot appear.
- [ ] Migrate API, UI, usage policy, CLI/desktop caches to the canonical representation. — **still open**; only the web org-entitlement path is confirmed migrated.

Evidence: commit `2a163f6af`; `apps/web/lib/services/org-entitlements.ts`,
`apps/web/lib/services/__tests__/org-entitlements-limits.test.ts`.
apps/web `lib/services` suite 254 passed across 19 files; web typecheck exit 0.

CONFIRMED REAL, and traced end to end before changing anything: catalog
`enterprise.projects: 'custom'` → the local converter → `0` →
`org-sharing-service.ts:278` throws `createError.validation`. The tier that
negotiates its limits was the only tier that could not share a single project or
connector with its own members, and the error told them to upgrade.

This was the SECOND copy of the defect. The first was fixed in
`free-plan-entitlements.ts` and pinned with a regression test; this one survived
because that fix went to a call site instead of to the owner. The local copy is
therefore deleted rather than patched, and a test now fails the build on any file
declaring its own converter — verified by planting one and watching it fire.

**Done when:** Enterprise limits reflect the authoritative contract and no custom value is silently interpreted as zero or unlimited.

### CRIT-003 — Checkout omits tax collection

**Source:** PP, BL  
**Reported evidence:** Stripe checkout creation lacks automatic tax and tax-ID collection while terms place tax obligations on users.

- [ ] Decide supported billing jurisdictions and tax policy with one documented product configuration.
- [ ] Enable and test the appropriate Stripe automatic-tax, billing-address, tax-ID, invoice, and customer-update behavior.
- [ ] Handle tax calculation failure explicitly; do not grant entitlement from an incomplete or unpaid checkout.
- [ ] Store only required tax/billing references, not unnecessary sensitive payment data.
- [ ] Add test-mode integration coverage for taxable, non-taxable, tax-ID, invalid-address, refund, and invoice flows.
- [ ] Reconcile legal/checkout copy with actual behavior.

**Done when:** tax is calculated/collected or explicitly unsupported according to one tested policy, and the receipt/invoice path reflects it.

### CRIT-004 — Desktop approval requests are emitted but not renderable/resumable

**Source:** PP, CM  
**Reported evidence:** manual tool execution emits approval events; the matching sidecar/prompt is unmounted or keyed to another event type; computer-use pauses without a complete resume path and may poll indefinitely.

- [ ] Define one approval domain model and event envelope for MCP, browser, computer-use, cloud-code, shell, connector, and other high-impact actions.
- [ ] Mount/register exactly one approval renderer in the active Desktop shell.
- [ ] Bind approval to actor, run, exact action, normalized arguments/resource, policy hash, expiry, and one-time nonce.
- [ ] Implement approve, deny, expire, cancel, reconnect, cross-device decision, and policy-changed outcomes.
- [ ] Resume the exact suspended step once; duplicate decisions must be idempotent.
- [ ] Remove infinite polling; use bounded reconnect/backoff and a terminal state.
- [ ] Add E2E tests covering approval display, app restart, stale approval, duplicate click, denial, timeout, and successful resume.

**Done when:** every production approval producer has a reachable consumer and every approved/denied run reaches a deterministic terminal or resumed state.

### CRIT-005 — Publicly servable uploads are not malware scanned

**Source:** PP, SC  
**Reported evidence:** upload completion validates path/MIME/size but not malicious content before files can be served or shared.

- [ ] Introduce quarantine → scan → accepted/rejected state transitions for every upload and generated archive that can be opened, shared, indexed, or passed to tools.
- [ ] Use a replaceable scanner interface with production implementation, timeout, retry, and fail-closed policy for high-risk file types.
- [ ] Prevent quarantined or failed files from download, preview, indexing, connector upload, model context, or public sharing.
- [ ] Validate actual content type and archive expansion limits; protect against zip bombs, polyglots, path traversal, and parser exploits.
- [ ] Add audit events and user-safe remediation messages without exposing scanner internals.
- [ ] Add benign, standard test-malware, archive, malformed, timeout, and scanner-unavailable tests.

**Done when:** no unscanned upload is publicly retrievable or processed by a privileged subsystem.

### CRIT-006 — Privacy UI claims a training opt-in/control that does not exist

**Source:** PP, BL  
**Reported evidence:** privacy copy references a training preference or opt-in path that was deleted/not implemented.

- [ ] Determine the actual provider/product training policy by trust mode and plan.
- [ ] Either implement a server-authoritative preference with provider-compatible enforcement, or remove the control/claim everywhere.
- [ ] Ensure privacy settings, legal pages, onboarding, API payloads, admin policy, telemetry, and data-export output agree.
- [ ] Add tests proving the effective setting and policy source shown to the user match the request path.

**Done when:** the product never displays a control or promise that has no enforceable backend effect.

### CRIT-007 — Mobile legal/store claims are false

**Source:** PP, BL  
**Reported evidence:** Mobile legal/help content claims App Store/Google Play availability or ratings while no confirmed listings exist.

- [ ] Remove all unverified store badges, ratings, install links, and availability claims.
- [ ] Add a release-state registry consumed by website, mobile, docs, download pages, and tests.
- [ ] Only enable store links after automated verification of the exact production listing/package ID.
- [ ] Add link and release-copy tests.

**Done when:** every distribution claim points to a live, verified channel or is clearly marked unavailable/private alpha.

### CRIT-008 — `/integrations` and `/apps` form a dead navigation loop

**Source:** PP

- [ ] Trace all redirects, CTAs, auth middleware, locale variants, and mobile/desktop deep links for integrations/connectors.
- [ ] Establish one canonical integrations route and one distinct app-directory route.
- [ ] Add route tests preventing redirect cycles and verifying unauthenticated/authenticated destinations.

**Done when:** a user can reach the intended catalog/setup flow in one deterministic path with no loop.

### CRIT-009 — Desktop built-in browser cannot launch on stock macOS

**Source:** PP  
**Reported evidence:** the launcher expects a `chromium` executable and does not locate normal Chrome/Chromium app bundles.

- [ ] Implement platform-specific browser discovery for supported macOS, Windows, and Linux installations.
- [ ] Support configured executable override with path validation and clear diagnostics.
- [ ] Define fallback behavior when no supported browser exists; never spin indefinitely.
- [ ] Add signed-build E2E coverage on each supported OS.

**Done when:** a clean supported machine can launch, reconnect, close, and relaunch the browser-control runtime without developer PATH modifications.

## 1B. Broken enterprise identity and administration paths

### CRIT-010 — SSO routes and UI query non-existent tables

**Source:** BL, PP  
**Reported evidence:** routes reference `sso_connections`; no migration creates the table.

- [ ] Decide whether SSO ships now. If yes, create versioned schema, encryption/secret references, metadata validation, domain binding, admin authorization, audit, and lifecycle migrations. If no, remove/disable routes and UI and label planned.
- [ ] Add migration tests from empty DB and every supported previous schema.
- [ ] Add SAML/OIDC integration tests for valid login, bad issuer/audience/signature, expired assertion, replay, domain mismatch, disabled connection, role change, and account recovery.

**Done when:** the visible SSO flow works against a real migrated database or no production surface claims it exists.

### CRIT-011 — Domain verification silently falls back to disabled

**Source:** BL

- [ ] Implement a real domain-verification record and challenge lifecycle, or remove the feature.
- [ ] Never swallow missing-table/config errors as `ssoEnabled: false`; return typed operational failure and alert telemetry.
- [ ] Test DNS challenge issuance, expiry, replay, ownership transfer, duplicate domains, and revocation.

### CRIT-012 — Directory sync is wired to missing storage

**Source:** BL

- [ ] Implement the directory-sync connection schema, secret storage, cursor/state, webhook or polling reconciliation, group mapping, deprovisioning, and audit—or remove/downscope every route/UI claim.
- [ ] Add idempotent, out-of-order, partial-failure, rate-limit, and deletion tests.

### CRIT-013 — SCIM is types-only

**Source:** BL, PP

- [ ] Implement standards-compliant `/Users`, `/Groups`, discovery, bearer-token rotation, filter/pagination, patch semantics, deprovisioning, and tenant isolation—or label unavailable.
- [ ] Add conformance and abuse tests.

### CRIT-014 — Admin console is a readiness dashboard, not an authoritative control plane

**Source:** BL, PP

- [ ] Inventory every admin control and identify its authoritative API/service.
- [ ] Remove static/fake status cards and zero-fetch controls.
- [ ] Add authorization, optimistic-concurrency/version checks, audit events, error states, and tests for each real control.

## 1C. Database and authorization safety

### CRIT-015 — Row-level security is incomplete

**Source:** BL

- [ ] Inventory every tenant/user-owned table, view, function, index, cache key, and search index.
- [ ] Apply RLS or an equivalent authoritative tenant boundary with deny-by-default policies.
- [ ] Test cross-user, cross-workspace, cross-organization, deleted membership, role downgrade, service-role, background worker, search, export, and cache paths.
- [ ] Add a migration/CI guard that fails when a new tenant-scoped table lacks an explicit isolation decision.

### CRIT-016 — Rust-side network requests bypass the WebView egress guard

**Source:** BL, SC

- [ ] Define one host-authoritative egress policy for browser, Rust `reqwest`, sidecars, tools, MCP, local model runtimes, and generated code.
- [ ] Route every outbound request through policy evaluation or a constrained transport.
- [ ] Preserve explicit exceptions for model/provider endpoints, with tenant/mode policy and audit.
- [ ] Add packet-level negative tests for Local/offline mode and blocked destinations.

### CRIT-017 — No CI secret scanner

**Source:** BL

- [x] Add repository-owned secret scanning for commits, pull requests, generated artifacts, fixtures, and release bundles.
- [x] Replace realistic secret-like fixtures with unmistakably fake values or allowlisted test fixtures.
- [x] Fail release on unreviewed findings.

Evidence: commit `12093d19b`; `scripts/check-secrets.mjs`,
`scripts/secret-scan-allowlist.json`, `package.json` (`check:secrets`),
`.github/workflows/ci.yml` (blocking step in `check`).
`pnpm check:secrets` → exit 0, "8366 tracked files, 13 credential formats,
55 reviewed exemption(s) across 41 allowlist entries".

**The scan result itself is the headline: 55 matches, and after opening every
one, ZERO are real credentials.** They are environment templates, the three
redactors (which must contain the shapes they recognise), and synthetic test
fixtures built from sequential filler. Nothing needs rotating.

Design notes worth keeping:

- Repository-owned rather than a third-party action, because every Action here
  is SHA-pinned — a scanner dependency is one more supply-chain edge to pin and
  rotate — and because it lets the scanner share its pattern roster with the
  three existing redactors. A format one recognises and the others do not is
  the gap every one of these bugs came through.
- Not entropy analysis. Entropy scanners fire on minified bundles and lockfile
  hashes, and a scanner that cries wolf gets `--no-verify`'d within a week.
- The allowlist is keyed on (path, FORMAT), not path. A new credential format in
  an already-listed file still fails, and an entry that stops matching fails the
  job as stale.
- Verified in three directions, not one: a planted `sk-ant-` key fails the scan,
  a planted stale entry fails it, and the clean tree passes.

Residual: scanning covers tracked source. Release BUNDLES are not yet scanned as
artifacts — tracked as a follow-up under REL-004/REL-010 rather than claimed
here.

### CRIT-018 — Dependency/security checks are not uniformly blocking

**Source:** BL, SC

- [ ] Make Rust and JS/TS dependency advisories, lockfile integrity, license policy, and critical static-analysis findings blocking according to documented severity policy.
- [ ] Cover shared crates/packages currently excluded from Clippy/static analysis or document and isolate vendored code precisely.

---

# Phase 2 — Contract, schema, route, prompt, and layout drift

## 2A. Schema and enum mismatches

### MATCH-001 — `origin_surface` contract accepts a value the database rejects

**Source:** CM  
**Reported behavior:** the TypeScript contract permits a `cli`-like surface value, a client can receive Pro capability, and the database `INSERT` rejects it because the SQL enum/check differs. Migration tests do not assert the column.

- [ ] Locate every `origin_surface`/surface enum in TypeScript, Rust, SQL, API validation, analytics, fixtures, and docs.
- [ ] Choose one canonical surface schema and generate or validate all projections from it.
- [ ] Migrate existing data safely and define unknown/legacy behavior.
- [ ] Add round-trip tests for every surface from request → authorization → insert → read → analytics/audit.
- [ ] Add schema parity CI that compares application enum values with SQL constraints.

### MATCH-002 — Cloud Code approval state machine is write-only

**Source:** CM  
**Reported evidence:** `cloud_code_agent_approvals` contains pending/approved/rejected/expired and decision fields, but production only inserts `pending`; no real select/update/decision/resume path exists; tests provide `preApproved` shortcuts.

- [ ] Define the authoritative approval service and transitions.
- [ ] Add read/list/decide/expire/cancel APIs with tenant/run/action authorization and expected-version checks.
- [ ] Replace test-only preapproval shortcuts with production-equivalent fixtures.
- [ ] Resume the suspended run exactly once after a valid decision.
- [ ] Update misleading migration comments.
- [ ] Add migration, API, concurrency, replay, expiry, and end-to-end resume tests.

### MATCH-003 — Admin-role logic is duplicated in raw SQL and TypeScript

**Source:** CM  
**Reported evidence:** the `owner`/`admin` pair appears in many production TypeScript and migration SQL locations while the canonical helper is barely used.

- [ ] Define one role taxonomy and permission policy, including custom/enterprise extension strategy.
- [ ] Replace client and server literal role comparisons with an authoritative policy evaluator.
- [ ] Centralize SQL policy generation or add SQL parity tests where database policies must remain literal.
- [ ] Add negative tests for member/viewer/unknown roles and role-change cache invalidation.
- [ ] Add a guard rejecting new raw role-pair comparisons outside approved schema/migration files.

## 2B. Route-path drift

### MATCH-004 — Canonical managed-cloud chat path has zero production consumers

**Source:** CM

- [ ] Locate `MANAGED_CLOUD_CHAT_BASE_PATH` and every literal equivalent across Web, Desktop, Mobile, CLI, VS Code, Chrome, tests, and docs.
- [ ] Make clients import a canonical route builder or generated API client.
- [ ] Eliminate drift in query parameters such as `surface` and sibling route naming.
- [ ] Add a route-contract test that starts the actual server and exercises every generated client path.

### MATCH-005 — Settings and related API paths are repeatedly literalized

**Source:** CM

- [ ] Canonicalize `/api/settings/preferences`, sync, and neighboring settings routes.
- [ ] Replace string concatenation with typed route builders.
- [ ] Add a no-literal guard for owned API route prefixes.

### MATCH-006 — Mobile shadows `TOOL_APPROVAL_RESUME_PATH`

**Source:** CM

- [ ] Remove local copies from Mobile, Web, and any third consumer.
- [ ] Export one route contract from the owning package.
- [ ] Add compile-time and runtime contract tests.

### MATCH-007 — One schedule/resource module uses three route forms

**Source:** CM

- [ ] Replace list/get/create raw literal, builder, and constant mixtures with one resource client.
- [ ] Cover list, create, read, update, delete, pagination, and route rename in contract tests.

### MATCH-008 — Half the routing config in `vercel.json` is inert/duplicated

**Source:** CM

- [ ] Determine the actual Next.js/Vercel routing source of truth.
- [ ] Delete inert duplicate rewrites or generate both files from one config only when both are required.
- [ ] Add deployed-preview smoke tests for every external API prefix and negative tests for `/_not-found` fallthrough.

### MATCH-009 — `CONNECTOR_OAUTH_START_PATH` has multiple live definitions

**Source:** CM

- [ ] Move the route and callback builders into the connector auth contract package.
- [ ] Replace strict path comparisons with normalized typed matching where appropriate.
- [ ] Add Web/Mobile/shared-UI contract tests and OAuth redirect URI tests.

## 2C. Prompt and tool-schema drift

### MATCH-010 — Desktop web-search results lack an untrusted-content envelope

**Source:** CM, PP

- [ ] Define a shared external-content envelope marking source, provenance, trust class, and instruction isolation.
- [ ] Use it for web search, page content, files, connectors, MCP resources, browser DOM, terminal output, and repository text.
- [ ] Ensure the system/developer prompt states that embedded instructions are untrusted data.
- [ ] Gate side effects independently of model text.
- [ ] Add prompt-injection fixtures and cross-surface parity tests.

### MATCH-011 — Desktop system prompt names a nonexistent memory tool

**Source:** CM  
**Reported behavior:** prompt says `memory_add`; runtime exposes names such as `memory_remember`, `memory_recall`, `memory_forget`, and `memory_search`.

- [ ] Generate tool instructions from the resolved runtime tool registry rather than handwritten names.
- [ ] Remove impossible tools from prompts and capability descriptions.
- [ ] Add a test that parses every system prompt tool reference and verifies a matching reachable tool schema.

## 2D. Design-token drift

### MATCH-012 — Exported z-index scale is unused while components hardcode values

**Source:** CM, HC

- [ ] Choose one overlay/layer contract for base content, sticky UI, dropdowns, tooltips, modals, drawers, toasts, command palette, and full-screen surfaces.
- [ ] Expose the scale as CSS variables and typed tokens consumed by all UI packages.
- [ ] Remove arbitrary literals and resolve nested stacking-context defects.
- [ ] Add visual E2E tests that open overlapping primitives in representative combinations.
- [ ] Add a lint/guard rule against unapproved z-index literals.

**Phase 2 exit criteria:** all listed schemas, routes, tool names, prompt protections, and layer values have one owner; parity tests fail on future drift.

---

# Phase 3 — Eliminate hardcoded configuration and add recurrence guards

## 3A. Provider/model endpoint duplication

### HARD-001 — Desktop conversation summarizer hardcodes OpenAI endpoints

**Source:** HC  
**Reported locations:** `apps/desktop/src-tauri/src/core/agi/conversation_summarizer.rs` and related sibling modules bypass a canonical `default_base_url()`/provider registry.

- [ ] Route every Desktop provider request through the canonical provider deployment/endpoint registry.
- [ ] Preserve environment, regional, proxy, user-key, local-runtime, and managed-gateway overrides.
- [ ] Add endpoint-resolution tests for every provider and trust mode.

### HARD-002 — Perplexity and Veo hosts are duplicated

**Source:** HC

- [ ] Remove repeated Perplexity/Veo host literals from provider modules and search config.
- [ ] Resolve endpoints through provider metadata plus capability-specific path builders.

### HARD-003 — CLI provider fallback hardcodes OpenAI chat-completions URL

**Source:** HC

- [ ] Replace fallback literal with the registry/adapter path.
- [ ] Ensure fallback cannot bypass trust mode, selected base URL, proxy, region, or provider-specific API shape.

### HARD-004 — Groq transcription endpoint is duplicated across Rust binaries

**Source:** HC

- [ ] Move speech-provider endpoint/configuration into a shared Rust crate or generated provider contract.
- [ ] Add same-code-path tests for Desktop and CLI.

### HARD-005 — Repository-wide endpoint sweep

- [ ] Search all first-party source for provider hostnames, model API paths, internal cloud hosts, callback URLs, localhost ports, and public asset origins.
- [ ] Classify each occurrence as canonical declaration, test fixture, documentation, or defect.
- [ ] Migrate defects and add a guard allowing only approved declaration files/fixtures.

## 3B. Limits and magic numbers

### HARD-006 — Upload cap is 10 MB in six clients while canonical cap is 12 MB

**Source:** HC

- [ ] Define one attachment-limit policy with per-file, per-request, per-plan, and per-type limits.
- [ ] Generate client hints and server enforcement from the same contract.
- [ ] Ensure server remains authoritative and returns typed limit metadata.
- [ ] Test 10 MB, 12 MB, boundary+1, multi-file aggregate, compressed, and streaming cases.
- [ ] Correct false comments claiming parity.

### HARD-007 — Desktop modules duplicate 30-second timeouts despite shared constants

**Source:** HC

- [ ] Replace private timeout constants with the canonical timeout policy.
- [ ] Differentiate connect, first-byte, idle-stream, total request, tool step, and shutdown timeouts rather than one ambiguous number.
- [ ] Test propagation and cancellation.

### HARD-008 — 120-second API/IPC timeouts are duplicated

**Source:** HC

- [ ] Consolidate 120-second model/tool/IPC deadlines into named policy values.
- [ ] Ensure a timeout in one layer does not outlive or contradict its parent deadline.

### HARD-009 — 300 ms debounce is copied across seven surfaces/components

**Source:** HC

- [ ] Define context-specific debounce policies for search, command palette, filters, MCP discovery, and autosave.
- [ ] Share only behavior that should be identical; do not force unrelated UX into one global number.
- [ ] Add fake-clock tests.

### HARD-010 — 10-second timeouts are duplicated and shadow unused exports

**Source:** HC

- [ ] Replace shadow constants and remove unused exports.
- [ ] Add an unused-config/dead-export check.

### HARD-011 — Four HTTP retry implementations default to three attempts

**Source:** HC

- [ ] Create one retry policy library supporting idempotency, status/error classification, jittered exponential backoff, `Retry-After`, total retry budget, cancellation, and telemetry.
- [ ] Do not retry unsafe writes without idempotency protection.
- [ ] Migrate all four implementations and remove duplicates.

### HARD-012 — Page size 50 is repeated across Desktop/Web/Mobile; run page size 20 drifts

**Source:** HC

- [ ] Define resource-specific pagination contracts with server maximums and opaque cursors where possible.
- [ ] Generate client defaults from the contract.
- [ ] Add tests for default, maximum, invalid, next-page, deletion-between-pages, and cross-surface parity.

## 3C. Tracked hardcoded defaults that remain open

### HARD-013 — Voice TTS default can point to a removed model

**Source:** HC

- [ ] Resolve TTS models through the live model/provider registry with lifecycle/deprecation checks and fallback policy.
- [ ] Add startup/catalog validation so removed models cannot remain defaults.

### HARD-014 — Local provider IDs are hardcoded to `ollama`

**Source:** HC

- [ ] Represent Ollama, LM Studio, llama.cpp, vLLM, and future local runtimes through one local-provider capability interface.
- [ ] Replace `provider === "ollama"` style branching with capability/adaptor checks.
- [ ] Add discovery and trust-boundary tests for each supported runtime.

### HARD-015 — Keyboard-shortcut defaults exist in three independent arrays

**Source:** HC

- [ ] Create one shortcut command registry with platform defaults and user overrides.
- [ ] Generate settings UI, command palette, help text, and registration from it.
- [ ] Test collisions, migration, reset, OS-specific modifiers, and inaccessible combinations.

### HARD-016 — Extension onboarding slash-command finder uses a separate built-in list

**Source:** HC

- [ ] Use the canonical command registry for onboarding search, composer autocomplete, help, and execution.
- [ ] Add a test that every discoverable command is executable and every public command is discoverable.

### HARD-017 — Preserve the previously fixed Mobile connector-catalog regression

**Source:** HC

- [ ] Verify Mobile no longer maintains an independent hardcoded connector array.
- [ ] Keep a regression test ensuring Mobile catalog comes from the canonical registry.

## 3D. Hardcoding guardrails

- [ ] **HARD-018 — Provider URL guard.** Reject new provider/internal endpoint literals outside approved registries and fixtures.
- [ ] **HARD-019 — Route literal guard.** Reject owned API route strings outside route declarations/builders.
- [ ] **HARD-020 — Role/plan/model ID guard.** Reject new raw comparisons outside canonical policy/catalog code.
- [ ] **HARD-021 — Magic-number guard.** Detect repeated timeout, retry, upload, pagination, debounce, and concurrency literals; allow documented local constants only.
- [ ] **HARD-022 — Design-token guard.** Reject arbitrary colors, spacing, z-index, breakpoints, and animation durations where shared tokens are required.
- [ ] **HARD-023 — Guard the guards.** Add positive/negative fixtures proving each checker catches a new violation and permits legitimate declarations.

---

# Phase 4 — Reconcile product promises with reachable code

## Resolution rule for this phase

For every product family below, first write a one-line product decision in the canonical capability matrix:

```text
<capability>: SHIP | PRIVATE_PREVIEW | PLANNED | NOT_SUPPORTED
```

- `SHIP` requires end-to-end implementation and tests on every advertised surface.
- `PRIVATE_PREVIEW` requires explicit gating and no public present-tense claim.
- `PLANNED` requires disabled/non-deceptive UI and accurate docs.
- `NOT_SUPPORTED` requires removal of dead UI/code unless retained as an isolated experiment.

Do not build every competitor feature merely because it appears in an audit. Resolve the mismatch by either shipping it properly or making the product truthfully narrower.

## PP-01 — Chat and message surface

- [ ] Add or explicitly decline camera capture in the composer.
- [ ] Add per-message report/feedback handling with privacy-safe telemetry, or remove the advertised control.
- [ ] Implement image-carousel rendering or map image results to a supported renderer.
- [ ] Implement accessible interactive tables or render a stable static fallback.
- [ ] Ensure streaming, stop, retry, edit-and-branch, partial failure, reconnect, and tool-result states are tested.

## PP-02 — Model and reasoning controls

- [ ] Wire the pin-to-model action or remove it.
- [ ] Add model-version/snapshot pinning where promised; otherwise state that aliases may move.
- [ ] Add authoritative default model and reasoning-effort preferences with defined scope/precedence.
- [ ] Remove duplicate reasoning components such as parallel `ReasoningAccordion` implementations.
- [ ] Ensure visible model/effort values reflect the model actually invoked after routing/fallback.

## PP-03 — Web Search

- [ ] Add a user-visible off/manual/automatic search mode.
- [ ] Implement domain, date, source-quality, and trusted-source filters if exposed.
- [ ] Mark all results as untrusted external content and preserve citation provenance.
- [ ] Implement or remove claims for weather, sports, finance, shopping, travel, maps, and local-business vertical cards.
- [ ] Test provider timeout, malformed results, duplicate citations, stale content, and prompt injection.

## PP-04 — Deep Research

- [ ] Add plan preview/approval before expensive or long-running research where promised.
- [ ] Support internal files, projects, connectors, and company data only with explicit authorization and source labels.
- [ ] Implement source-quality scoring, contradiction detection, citation verification, and unsupported-claim handling.
- [ ] Add budget/time/source limits and cancellation.
- [ ] Fix Desktop report/export/history components that exist but have no production importers.
- [ ] Preserve research SSE/events on Mobile instead of dropping them.
- [ ] Render report headings/tables/charts correctly; do not display literal Markdown syntax.
- [ ] Implement or downgrade slide/sheet/document export and scheduled research claims.

## PP-05 — Projects

- [ ] Implement or downgrade project templates, duplication, and export.
- [ ] Implement collaborators, tasks, and project-scoped agents if advertised.
- [ ] Replace decorative per-project memory with a real scoped memory policy or remove the control.
- [ ] Add project authorization, deletion, search, sync, conflict, and cross-surface tests.

## PP-06 — Project knowledge and RAG

- [ ] Replace full-context stuffing and hard truncation with indexed retrieval or explicitly scope the product as bounded full-context.
- [ ] Add extraction, chunking, embeddings, hybrid retrieval, reranking, metadata/ACL filtering, and provenance where RAG is claimed.
- [ ] Replace simple `ILIKE` memory/knowledge search for semantic claims.
- [ ] Wire or remove the Desktop RAG engine and hash-fallback path.
- [ ] Test deletion propagation, tenant isolation, stale index, prompt injection, and context-budget behavior.

## PP-07 — Memory and chat search

- [ ] Add Web controls to disable, inspect, edit, delete, export, and import memory—or downgrade claims.
- [ ] Mount the Desktop memory management UI if it is intended to ship.
- [ ] Add sensitive-data exclusions and memory-write policy.
- [ ] Separate global, project, organization, and temporary-chat memory scopes.
- [ ] Add provenance and source-chat behavior.
- [ ] Replace regex-only personalization suggestions with an explicit, reviewable policy or remove them.

## PP-08 — Styles and personalization

- [ ] Move styles from device-only `localStorage` to the intended account/project/device scope with deterministic precedence.
- [ ] Complete response-length and style controls across supported surfaces.
- [ ] Ensure instructions/styles are included in the actual context assembly and visible in effective settings.

## PP-09 — File ingestion and analysis

- [ ] Add or downgrade support for DOCX, PPTX, XLSX, ZIP/archive, audio, video, and notebook files.
- [ ] Implement OCR fallback, table extraction, archive safety, and parser isolation.
- [ ] Add folder, repository, and cloud-drive upload only where fully authorized and supported.
- [ ] Compare checksums rather than merely computing them.
- [ ] Add file quotas, versions, retention, deletion propagation, and scan state.

## PP-10 — Code execution and notebooks

- [ ] Implement `.ipynb` ingestion/edit/execution/export if advertised.
- [ ] Preserve sandbox limits, network policy, package policy, cancellation, artifact capture, and cleanup.
- [ ] Add orphan-sandbox reconciliation and cost attribution.

## PP-11 — Artifacts, Canvas, and shareable apps

- [ ] Implement select-and-edit and conflict-aware revisions or remove the edit affordance.
- [ ] Make the Web viewer editable if product copy says editable; otherwise label read-only.
- [ ] Implement real version navigation, restore/rollback, comments, remix/duplicate, and provenance where promised.
- [ ] Wire Desktop publish or remove permanent “coming soon” actions.
- [ ] Stop returning published version `1` for every artifact.
- [ ] Sandbox interactive artifacts on a separate origin/process with CSP, network limits, no ambient cookies, and validated messaging.
- [ ] Test revoked links, expired resources, concurrent edits, malformed code, and rollback.

## PP-12 — Documents, spreadsheets, presentations, and PDFs

- [ ] Wire or remove Word/Excel editor implementations.
- [ ] Restore or explicitly drop PDF editing.
- [ ] Implement or downgrade PowerPoint editing, charts, pivot tables, templates, branding, citations, and render-repair claims.
- [ ] Fix incorrect export MIME/extension behavior, including artifacts that download as the wrong Office format.
- [ ] Add format-open validation using real Office/PDF parsers in tests.

## PP-13 — AGI Work / agentic work

- [ ] Decide whether Work is a standalone durable task surface or merely a chat toggle; make navigation/copy/runtime match.
- [ ] Fix clarification questions so a running task can suspend, receive an answer, and resume.
- [ ] Add user pause/resume/cancel with durable state.
- [ ] Surface per-task model/tool/runtime cost and usage.
- [ ] Replace the single-threaded cloud loop with controlled parallelism only where task independence is explicit.
- [ ] Add durable runs, retries, checkpointing, deliverables, notifications, and post-client-close continuation.

## PP-14 — Coding agents

- [ ] Restore or remove the deleted repository indexer and orphaned Tauri commands.
- [ ] Replace `lsp_diagnostics` stubs with real LSP/diagnostic integration or remove the tool.
- [ ] Wire PR creation/review flows to UI and credentials; do not leave only a hidden `gh pr create` path.
- [ ] Register CodeReview commands that are currently unreachable.
- [ ] Remove or wire automation templates with no consumers; delete fabricated performance metrics.
- [ ] Wire or remove VisualEditor/LivePreview components.
- [ ] Add CI-result reading and status correlation.
- [ ] Implement GitLab beyond detection or mark unsupported.
- [ ] Implement SSH/cloud-dev sessions only if advertised.
- [ ] Add parent-agent visibility for parallel agents: task graph, progress, stop, steering, merge, cost, and failure recovery.
- [ ] Consolidate duplicate checkpoint implementations.
- [ ] Add VS Code PR/CI flows if claimed.
- [ ] Replace prompt-template-only security review with an actual scanner or label it advisory text review.

## PP-15 — Browser and computer use

- [ ] Fix macOS/Linux browser launch and lifecycle.
- [ ] Implement file download handling with scan/quarantine and user confirmation.
- [ ] Ensure host/site blocklists are called from actual navigation and action paths.
- [ ] Scan DOM/accessibility/page content for injection, not only screenshots.
- [ ] Mount and complete approval/resume flows.
- [ ] Replace infinite pause/poll loops with durable state.
- [ ] Consolidate or remove multiple unmounted replay/live-visualization stacks.
- [ ] Wire or remove remote cloud-browser code.
- [ ] Improve Mobile remote-session observability beyond plain text where promised.
- [ ] Add restricted-page, credential, CAPTCHA, payment, download, multi-tab, frame, service-worker-restart, native-disconnect, and permission-denial tests.

## PP-16 — Connectors and MCP

- [ ] Add or downgrade Maps, Photos, Contacts, Microsoft 365, Slack, and other catalog entries.
- [ ] Replace placeholder MCP directory content with a real signed/curated registry or remove it.
- [ ] Use scope, reauthorization, expiry, risk, and availability metadata in actual policy decisions.
- [ ] Mount the connector permission panel and fix mismatched keys.
- [ ] Add explicit connector invocation/discovery in the composer where claimed.
- [ ] Show an audit/provenance strip for connector reads and writes.
- [ ] Add revocation, schema-change, tool-poisoning, and credential-refresh tests.

## PP-17 — Custom assistants, skills, and plugins

- [ ] Decide on a canonical custom-assistant/GPT object, schema, API, builder, versioning, and sharing model.
- [ ] Extend skills beyond read-only discovery if users are promised create/install/update/delete/publish behavior.
- [ ] Implement plugin install, versioning, publisher identity, permissions, update policy, ratings/review, registry, and uninstall—or downgrade the store to preview.
- [ ] Add signature, allowlist, sandbox, kill-switch, and supply-chain tests.

## PP-18 — Image generation and editing

- [ ] Stop labeling a new generation as an edit.
- [ ] Preserve source image, mask/selection, transform parameters, provenance, and output relationship.
- [ ] Implement region editing or remove disabled “coming soon” controls.
- [ ] Implement or downgrade transparency, character consistency, and content-credential/C2PA claims.
- [ ] Test image safety, metadata stripping/preservation policy, retries, cancellation, and quota charging.

## PP-19 — Video, audio, and media generation

- [ ] Make all advertised aspect ratios reachable; remove hardcoded 16:9 where unsupported.
- [ ] Replace process-local video task maps with durable tenant-scoped storage/queue state.
- [ ] Mount the video result card/renderer.
- [ ] Implement or downgrade video-to-video, extend, avatars, sound, music, podcasts, and speech-to-speech.
- [ ] Add durable status, webhook reconciliation, idempotency, moderation, cancellation, retry, and cost tests.

## PP-20 — Voice and live translation

- [ ] Decide and implement the supported interaction model: turn-based or true realtime/full duplex.
- [ ] Add barge-in, VAD/turn detection, reconnect, session lease expiry, transcript reconciliation, and resource cleanup if realtime is promised.
- [ ] Implement or downgrade camera/screen sharing and live translation.
- [ ] Add a Web read-aloud voice picker if voice selection is promised.
- [ ] Remove hardcoded TTS model IDs through the canonical registry.
- [ ] Implement or downgrade watch/car/widget/headphone integrations.

## PP-21 — Tasks and schedules

- [ ] Replace “one non-streaming, no-tool completion” schedule behavior with the promised task runtime, or narrow the feature definition.
- [ ] Mount existing file-watch/cron/webhook UI if those backends are intended to ship.
- [ ] Add timezone/DST preview, idempotent occurrence IDs, skip/catch-up policy, pause/resume, retries, connector remediation, and exact-run deep links.
- [ ] Ensure tasks run without an open client and preserve outputs/history.

## PP-22 — Sharing and collaboration

- [ ] Add private/workspace/public scopes, expiry, revoke, and permission review—or remove unsupported options.
- [ ] Implement sharing for projects, artifacts, skills, plugins, and prompts only where authorization/retention is complete.
- [ ] Implement comments, co-editing, mentions, and organization templates only if advertised.
- [ ] Add Slack/Teams delivery only through real app installations.
- [ ] Test revoked membership, link leakage, tenant crossing, version conflicts, and deleted resources.

## PP-23 — Notifications

- [ ] Wire stored push tokens to a real sender and delivery/retry system, or remove notification claims.
- [ ] Add email notifications where promised.
- [ ] Add connector-expired, task-complete, approval-needed, quota, security, and billing events with user/admin preferences.
- [ ] Add deep-link authorization checks, duplicate suppression, quiet hours, and delivery telemetry.

## PP-24 — Settings

- [ ] Mount the font-size/accessibility control if supported.
- [ ] Add writers and persistence for settings that currently only have defaults/readers.
- [ ] Add or downgrade Web model, effort, shortcut, density, and code-block settings.
- [ ] Complete Chrome options for appearance, data, permissions, help, and reset.
- [ ] Add a real Help route/navigation target.
- [ ] Implement deterministic setting precedence and policy provenance.

## PP-25 — Billing and usage UX

- [ ] Mount credit-alert UI in production paths.
- [ ] Add transparent model/tool/media/runtime cost breakdowns without exposing internal provider-sensitive values if policy forbids them.
- [ ] Add per-project/team usage and budgets where advertised.
- [ ] Implement or remove education-plan claims.
- [ ] Reconcile reset times, rolling windows, spend caps, top-ups, invoices, and upgrade flows across all surfaces.

## PP-26 — Privacy and security UX

- [ ] Resolve the training-control mismatch in CRIT-006.
- [ ] Implement zero-data-retention as an enforceable provider/plan capability or label it documentation-only.
- [ ] Run secret scanning before chat/tool sends, not only during support handoff.
- [ ] Add user-visible new-device/session alerts and anomaly response where claimed.
- [ ] Implement file lockdown/malware handling from CRIT-005.

## PP-27 — Enterprise controls

- [ ] Replace four hardcoded roles with extensible RBAC/ABAC or explicitly limit the product.
- [ ] Add groups, organization policies, agent/skill/connector publishing approval, and policy inheritance where promised.
- [ ] Add organization-wide audit, usage, billing, retention, residency, IP allowlists, legal hold, CMEK, DLP, and SIEM only if the enterprise scope commits to them; otherwise mark roadmap.
- [ ] Complete domain verification, SSO, SCIM, and directory sync from Phase 1.

## PP-28 — Platform distribution and additional surfaces

- [ ] Publish or clearly mark unavailable: Mobile stores, CLI package/release, VS Code Marketplace, Chrome Web Store, macOS/Windows installers.
- [ ] Remove claims for JetBrains, Slack, Teams, Office, Google Workspace, Xcode, watch, car, widget, tablet, and SDK surfaces unless a tested product exists.

## PP-29 — Developer API

- [ ] Support structured outputs if advertised; do not hard-reject them behind an API that claims compatibility.
- [ ] Wire or remove unused embedding catalog entries.
- [ ] Implement or downgrade rerank, file search, batch, flex/priority, realtime, Apps SDK, outbound webhooks, service accounts, project budgets, regions, SDKs, and playground.
- [ ] Remove retired `/api/agents` paths and update clients/docs.
- [ ] Repair scoped billing/audit/analytics/organization API failures.
- [ ] Publish an explicit compatibility matrix rather than claiming full OpenAI-equivalence.

## PP-30 — Help, legal, and support

- [ ] Add or remove community-support claims.
- [ ] Add a DMCA/contact process if public content publishing requires it.
- [ ] Track model/provider license and resale constraints in the registry and release process.
- [ ] Ensure support diagnostics are redacted and correlate to request/run IDs.

## PP-31 — Specialized verticals

- [ ] Decide scope for health, legal, education/study, cybersecurity, shopping, travel, maps/local, and finance.
- [ ] For each vertical: implement domain-specific policy, disclaimers, data handling, sources, evaluations, and UI—or remove the advertised vertical/card.
- [ ] Remove decorative Plaid/financial integration if it is intentionally excluded.

## PP-32 — Product surface fidelity and accessibility

- [ ] Mount existing search/message/history/notification components that are intended to ship; otherwise delete them.
- [ ] Add keyboard, screen-reader, focus, reduced-motion, high-contrast, zoom, and responsive tests on every active surface.
- [ ] Ensure cards, code, tables, artifacts, and partial streams retain stable readable geometry.

**Phase 4 exit criteria:** every advertised feature has a reachable production path and tests, or all product surfaces consistently describe it as preview/planned/unsupported.

---

# Phase 5 — Unfinished, slow, concurrency, growth, and repository-scale defects

The scale report is organized under the visible sections **Spend**, **Throughput and I/O**, **Build**, **What is unfinished**, **Verification**, **Concurrency**, **Growth**, and **Repository purity**. Treat each section below as an independent exit gate.

## 5A. Spend and cost control

- [ ] **SCALE-SPEND-001 — Meter non-token costs.** Record provider cost for web search, embeddings/rerank, sandbox/code execution, browser/cloud compute, image, video, speech, storage, transfer, and third-party tools.
- [ ] **SCALE-SPEND-002 — Attribute cost to run/task/user/project/tenant.** Use one usage ledger with idempotent event IDs and corrections/refunds.
- [ ] **SCALE-SPEND-003 — Implement quality-adjusted cost metrics.** Track accepted-task cost, retries, escalations, human intervention, cache savings, and failed-work cost; do not optimize raw token price alone.
- [ ] **SCALE-SPEND-004 — Add budget admission and graceful degradation.** Enforce spend caps before execution and provide deterministic fallback/queue/deny outcomes.
- [ ] **SCALE-SPEND-005 — Measure cache/compression effects.** Track prompt-cache hit, semantic cache, compaction, and retrieval cost without double-counting.
- [ ] **SCALE-SPEND-006 — Reconcile provider invoices.** Compare internal usage with provider/Stripe settlement data and alert on drift.

## 5B. Throughput and I/O

- [ ] **SCALE-IO-001 — Profile actual hot paths.** Capture p50/p95/p99 for chat TTFT, token stream, retrieval, tool loops, upload, artifact, sync, billing, and agent runs.
- [ ] **SCALE-IO-002 — Remove unnecessary serial work.** Parallelize independent retrieval/tool/preflight operations with bounded concurrency and deterministic ordering.
- [ ] **SCALE-IO-003 — Eliminate N+1 and unbounded DB access.** Add query tracing, indexes, batching, and pagination for conversations, messages, projects, memory, files, tasks, approvals, audit, and usage.
- [ ] **SCALE-IO-004 — Stream large transfers.** Avoid buffering entire uploads/downloads/media/results in memory; add size/backpressure/cancellation/checksum handling.
- [ ] **SCALE-IO-005 — Reuse clients and connections.** Pool DB/HTTP/provider clients and prevent per-token/per-event client creation.
- [ ] **SCALE-IO-006 — Bound context and payloads.** Enforce limits for history, tool schemas, retrieved chunks, SSE queues, browser snapshots, logs, and artifacts.
- [ ] **SCALE-IO-007 — Add backpressure.** Producers must not overwhelm UI streams, queues, WebSockets/SSE, database writers, or external providers.

## 5C. Build and CI performance

- [ ] **SCALE-BUILD-001 — Make affected-only builds correct.** Verify Turborepo/Cargo dependency graphs do not skip transitive consumers after shared-contract changes.
- [ ] **SCALE-BUILD-002 — Add remote/local cache correctness tests.** Prevent stale generated registry/schema/type outputs.
- [ ] **SCALE-BUILD-003 — Split oversized modules and generated inputs.** Refactor monolithic side panels, agent routers, and giant components into testable domain/adaptor boundaries.
- [ ] **SCALE-BUILD-004 — Eliminate duplicate compilation/codegen.** One model/route/schema generation pass should feed all required projections.
- [ ] **SCALE-BUILD-005 — Track build budgets.** Fail or warn on material regressions in clean build, incremental build, bundle size, Rust binary size, and release packaging.
- [ ] **SCALE-BUILD-006 — Ensure clean-checkout reproducibility.** No undeclared local files, generated outputs, hidden env, or stale caches may be required.

## 5D. Finish or delete incomplete production code

- [ ] **SCALE-FIN-001 — Inventory zero-import/zero-caller production modules.** Classify each as WIRE, REMOVE, test-only, or generated entry point.
- [ ] **SCALE-FIN-002 — Inventory stubs.** Search `TODO`, `FIXME`, `unimplemented`, `coming soon`, `501`, placeholder data, test-only suppliers, fake metrics, empty adapters, and caught-and-ignored missing-table errors.
- [ ] **SCALE-FIN-003 — Remove unreachable duplicate implementations.** Retain one production path for reasoning UI, approvals, checkpoints, browser replay, notification center, memory manager, artifact publishing, and other reported duplicates.
- [ ] **SCALE-FIN-004 — Finish background services.** A service with zero production callers is not complete; connect trigger → service → persistence → notification → UI, or delete it.
- [ ] **SCALE-FIN-005 — Enforce no-present-tense-stub rule.** A production control may not return `501`, toast “coming soon,” or silently no-op unless explicitly labeled preview/planned before user action.

## 5E. Verification and runtime evidence

- [ ] **SCALE-VER-001 — Establish continuous performance tests.** Add a scheduled benchmark/load suite; alert when it has not produced valid results within the defined interval.
- [ ] **SCALE-VER-002 — Add E2E per surface.** Web, Desktop, Mobile, CLI, VS Code, and Chrome each need real happy-path, failure, auth, reconnect, and upgrade coverage.
- [ ] **SCALE-VER-003 — Replace skipped visual tests.** Render real active routes/components and fail on unexpected absence.
- [ ] **SCALE-VER-004 — Add contract tests across languages/surfaces.** Routes, event envelopes, model registry, permissions, limits, and trust modes must round-trip through TS, Rust, SQL, and clients.
- [ ] **SCALE-VER-005 — Add fault injection.** Provider outage, DB timeout, duplicate webhook, queue replay, network loss, expired token, disk full, worker crash, and partial stream.
- [ ] **SCALE-VER-006 — Add production observability.** Trace model, retrieval, tool, approval, task, billing, and external-call spans with redaction and shared correlation IDs.
- [ ] **SCALE-VER-007 — Define SLOs.** Availability, TTFT, completion, task success, approval wait, sync lag, queue age, scan latency, and notification delivery.
- [ ] **SCALE-VER-008 — Verify release claims from deployed artifacts.** Do not infer store, marketplace, signing, or production health from source configuration alone.

## 5F. Concurrency and durable execution

- [ ] **SCALE-CON-001 — Replace process-local job state.** Migrate video/media/tasks/agent state held in memory maps to durable tenant-scoped storage and queues.
- [ ] **SCALE-CON-002 — Add idempotency keys to all mutation entry points.** Chat sends with side effects, approvals, schedules, payments, webhooks, connector writes, file completion, and notifications.
- [ ] **SCALE-CON-003 — Use expected revisions/leases.** Prevent duplicate workers and stale clients from overwriting newer task, subscription, approval, or artifact state.
- [ ] **SCALE-CON-004 — Bound worker concurrency.** Per-provider, per-tenant, per-user, per-task-type, and global limits with fair scheduling.
- [ ] **SCALE-CON-005 — Add cancellation propagation.** Client stop must reach model streams, tools, subprocesses, browser sessions, uploads, and child agents.
- [ ] **SCALE-CON-006 — Prevent retry storms/token refresh stampedes.** Use distributed locks/single-flight, jitter, circuit breakers, and retry budgets.
- [ ] **SCALE-CON-007 — Persist agent checkpoints.** Recover after process/deploy failure without duplicating completed effects.
- [ ] **SCALE-CON-008 — Reconcile out-of-order events.** Use sequence/revision rules for sync, webhooks, push, tools, streams, and task updates.

## 5G. Growth and data lifecycle

- [ ] **SCALE-GROW-001 — Create data-volume forecasts and retention tiers.** Messages, events, tool logs, files, embeddings, audit, usage, notifications, and media.
- [ ] **SCALE-GROW-002 — Add archival/deletion propagation.** Primary DB, object storage, search/vector indexes, caches, backups, and analytics.
- [ ] **SCALE-GROW-003 — Add partitioning/index strategy.** Large append-only tables such as messages, usage, audit, agent events, and notifications.
- [ ] **SCALE-GROW-004 — Enforce opaque cursor pagination.** No unbounded list or offset-only path on high-growth tables.
- [ ] **SCALE-GROW-005 — Isolate tenants/cells.** Define routing, noisy-neighbor limits, backup/restore, and tenant move strategy.
- [ ] **SCALE-GROW-006 — Capacity-test Neon/Postgres as the stateful bottleneck.** Connection limits, transaction contention, hot rows, RLS overhead, indexes, and failover.
- [ ] **SCALE-GROW-007 — Add storage and transfer quotas.** Per user/project/org with deterministic cleanup and user-visible state.

## 5H. Repository purity

- [ ] **SCALE-PURE-001 — Separate first-party, generated, vendored, build, fixture, and audit assets.** Ensure metrics and searches exclude the correct classes.
- [ ] **SCALE-PURE-002 — Remove stale generated output and duplicate source-of-truth files.** Regeneration must produce a clean diff.
- [ ] **SCALE-PURE-003 — Delete dead code after replacement.** No permanent parallel implementation “for safety” without an owner and removal date.
- [ ] **SCALE-PURE-004 — Remove fabricated/sample metrics from production templates and marketing paths.** Test fixtures must be unmistakable.
- [ ] **SCALE-PURE-005 — Keep audit ledgers current.** Fixed items, open items, code state, and docs must agree in the same change.
- [ ] **SCALE-PURE-006 — Add dependency-boundary checks.** Apps consume shared contracts through approved packages; shared domain code must not import host/UI implementations.
- [ ] **SCALE-PURE-007 — Add duplicate-symbol/literal checks.** Detect parallel route, role, plan, timeout, endpoint, prompt, shortcut, and component definitions.

---

# Phase 6 — Complete the business layer

The business-layer report shows that substantial billing, entitlement, and enterprise plumbing exists, but several user-facing and accounting paths are dormant, inconsistent, or unverifiable. The following is the canonical business completion plan.

## 6A. Canonical plans, pricing, and entitlements

- [ ] **BIZ-001 — Create one billing/entitlement domain package.** Move plan catalog, capabilities, limits, transitions, usage windows, and display metadata out of Web-only ad hoc logic.
- [ ] **BIZ-002 — Resolve stale Team pricing.** Code/newer source says `$25/seat/month` and `$240/seat/year`; remove older `$30` decisions and add snapshot tests.
- [ ] **BIZ-003 — Separate plan identity from display labels.** Stable IDs must survive renaming and regional pricing.
- [ ] **BIZ-004 — Make all capability gates exhaustive.** Free, Basic, Pro, Max 5x, Max 15x, Team, Enterprise, local, and user-key modes.
- [ ] **BIZ-005 — Define contract/custom limits.** Complete CRIT-002 and surface policy source to admins/users.
- [ ] **BIZ-006 — Publish a machine-readable effective-entitlement endpoint.** Include plan, status, renewal, grace, capabilities, limits, reset times, and policy source without exposing payment secrets.
- [ ] **BIZ-007 — Add cross-surface entitlement contract tests.** Web/Desktop/Mobile/CLI/VS Code/Chrome must reach the same decision for the same account and capability.

## 6B. Checkout, subscription lifecycle, and reconciliation

- [ ] **BIZ-008 — Make checkout idempotent.** Duplicate clicks/callbacks must not create duplicate customers/subscriptions/credits.
- [ ] **BIZ-009 — Grant entitlement only from authoritative payment confirmation.** Do not trust redirect success alone.
- [ ] **BIZ-010 — Implement upgrade/downgrade/proration policy.** Define effective time, unused-time credit, consumed-usage carry, reset behavior, SCA/payment failure, and cancellation.
- [ ] **BIZ-011 — Preserve raw usage across plan changes.** Upgrading must not provide an unintended fresh allowance unless explicitly designed.
- [ ] **BIZ-012 — Handle trial, grace, past-due, canceled, unpaid, paused, refunded, disputed, and chargeback states.** Access changes must be monotonic and reconcilable.
- [ ] **BIZ-013 — Reconcile Stripe state periodically.** Repair missed/out-of-order webhooks from authoritative provider state.
- [ ] **BIZ-014 — Verify webhook signatures, timestamps, event IDs, and API versions.** Deduplicate and preserve raw event references.
- [ ] **BIZ-015 — Implement customer portal and invoice access with authorization.** No cross-customer object IDs.
- [ ] **BIZ-016 — Complete tax handling from CRIT-003.** Include invoices/credit notes/refunds.

## 6C. Team and Enterprise commercial paths

- [ ] **BIZ-017 — Add a real Team purchase path or remove self-serve implications.** Seat quantity, annual/monthly term, invitation, seat true-up, reduction, transfer, cancellation, and pooled usage.
- [ ] **BIZ-018 — Bind Team subscription to organization ownership and membership.** Prevent personal/account ambiguity.
- [ ] **BIZ-019 — Implement Enterprise contract onboarding or keep request-only.** Contract entitlements, invoice/ACH/wire references, term dates, seat/usage commitments, renewal, and support contacts.
- [ ] **BIZ-020 — Remove the `$0` Enterprise placeholder from any calculation or customer-facing path.** Use explicit contract pricing state.
- [ ] **BIZ-021 — Add delegated billing/admin roles and audit.** Billing administrators must not automatically receive content access.

## 6D. Credits, top-ups, refunds, and usage windows

- [ ] **BIZ-022 — Make top-ups purchasable or remove dormant plumbing.** Existing fulfillment code is not a feature without initiation UI/API.
- [ ] **BIZ-023 — Separate subscription allowance from purchased credit balance.** Define expiration, refundability, transfer, and priority of consumption.
- [ ] **BIZ-024 — Preserve refund-delta correctness.** Add replay/out-of-order/partial-refund tests.
- [ ] **BIZ-025 — Define rolling windows precisely.** Billing period, weekly, five-hour, flagship, voice, Work, media, concurrency, and provider-specific constraints.
- [ ] **BIZ-026 — Make reset times and warnings accurate.** UI must derive from authoritative windows, not client clocks or approximations.
- [ ] **BIZ-027 — Implement spend caps and auto-reload only with explicit consent.** Add limits, confirmation, failure, and notification behavior.
- [ ] **BIZ-028 — Add per-project/team budgets and chargeback/showback where advertised.**

## 6E. Mobile in-app purchase

- [ ] **BIZ-029 — Register and map real App Store/Play product IDs before enabling purchase UI.** Environment-specific IDs must be validated.
- [ ] **BIZ-030 — Validate signed store transactions server-side.** Bind account, product, environment, storefront, and original transaction.
- [ ] **BIZ-031 — Handle restore, renewal, grace, refund, revoke, transfer, and replay.** Reconcile out-of-order store notifications. OPEN — FEATURE, externally gated.

      Triaged 2026-08-09. There is nothing to remediate: Mobile sells no subscription at
      all, so there is no store lifecycle to reconcile. The whole purchase/restore/receipt
      slice was deliberately removed in `77169d3f1` under
      `docs/decisions/2026-07-30-mobile-store-billing-boundary.md` (Accepted) because every
      product identifier was a placeholder. Current source confirms it: `apps/mobile/package.json`
      has no StoreKit/Play Billing/react-native-iap/RevenueCat dependency, `apps/web/app/api/mobile/`
      holds only `content-report`, `feedback`, and `push-token`, and a repo-wide grep for
      `androidpublisher|rtdn|App Store Server Notification` returns no handler. Mobile's only
      store-aware code is read-only routing:
      `apps/mobile/src/features/billing/subscriptionSource.ts:47-70` fails closed on an
      entitled plan and sends the user to the store that owns it.

      Renewal/grace is partly covered for HISTORICAL store rows only, not by store signals:
      `apps/web/lib/services/subscription-service.ts:113-137` derives expiry in the single
      shared entitlement reader — a row with `apple_original_transaction_id`/`google_purchase_token`
      and no `stripe_subscription_id` flips to `expired` once `current_period_end` passes the
      3-day `STORE_RENEWAL_GRACE_MS` window (`:59`), with a null period end deliberately never
      expiring. Pinned by `apps/web/lib/services/subscription-service.store-expiry.test.ts`
      (7 tests, passing). Cross-channel double billing is blocked at
      `apps/web/app/api/checkout/route.ts:213-214`.

      What actually closing BIZ-031 takes (product scope, not a patch): real App Store Connect
      and Play products (MS-5 external gate, per `docs/current/parity-implementation-matrix.md:88`),
      a StoreKit 2 / Play Billing client and restore flow on Mobile, a signed-transaction
      verification endpoint (BIZ-030), an Apple ASSN V2 webhook plus a Play RTDN Pub/Sub
      subscriber with signature verification and an event-id/dedupe ledger so DID_RENEW,
      GRACE_PERIOD, REFUND, REVOKE and transfer notifications reconcile out of order, a
      periodic reverification job, and a web-vs-store ownership policy (BIZ-032). Per
      `docs/agent-context/known-flaws.md:178`, shipping IAP is a founder product/legal
      decision and must not be done as an audit fix.

- [ ] **BIZ-032 — Resolve web-vs-store subscription conflicts.** One effective entitlement with documented ownership/migration policy.

## 6F. Cost accounting and gross margin

- [ ] **BIZ-033 — Build a real cost ledger.** Token cost plus search, sandbox, image/video/audio, storage, transfer, infrastructure allocation, Stripe/payment fees, refunds, chargeback reserve, discounts, and support adjustments.
- [ ] **BIZ-034 — Compute gross margin from settled revenue and attributable COGS.** Exclude Local/user-key activity from managed-cloud revenue/COGS as appropriate.
- [ ] **BIZ-035 — Separate estimate, accrued, and settled values.** Do not present an estimate as an audited fact.
- [ ] **BIZ-036 — Add margin dashboards and alerts by plan/model/provider/capability/cohort.** Protect sensitive provider pricing with role-based access.
- [ ] **BIZ-037 — Add accepted-task economics.** Cost per successful task, retry/escalation cost, human intervention, and quality threshold.
- [ ] **BIZ-038 — Remove or qualify the “40% gross margin” claim until the live calculation exists.**

## 6G. Referrals, gifts, promotions, and fraud

- [ ] **BIZ-039 — Wire or remove `referral_code`.** Define attribution, eligibility, anti-self-referral, reward settlement, expiration, reversal, and privacy.
- [ ] **BIZ-040 — Implement gift/promo codes only with ledger-backed issuance and redemption.** Prevent brute force, replay, stacking, and negative balances.
- [ ] **BIZ-041 — Add payment and usage abuse controls.** Velocity limits, duplicate accounts, stolen cards, refund abuse, automation abuse, and manual review. OPEN — the usage half is largely built; the payment-fraud half is a FEATURE.

      Triaged 2026-08-09 against current source. The finding is split, and the two halves
      are not the same size.

      USAGE abuse is substantially implemented and reached. Per-endpoint velocity is
      Redis-backed and refuses to boot in production without Redis
      (`apps/web/lib/rate-limit.ts:43-53`), with billing-path buckets at
      `:66-70` (checkout 15/min), `:102-106` (claim-offer 3/h, fail-closed),
      `:127-131` (upgrade 5/min) and `:176-179` (auth-signup 3/h per IP — today's only
      mass-account-creation brake). Ceilings scale with the purchased tier rather than
      being flat (`:711-716`), per-plan concurrency is enforced as a TTL-bounded Redis
      sorted set (`:1216-1281`), and every 429 is attributed to a signature-verified
      principal and written to the audit store (`:1127-1131`). Spend is bounded
      independently of request rate: Free carries rolling 5-hour/weekly/monthly
      provider-cost budgets (`apps/web/lib/services/free-trial-service.ts:24-31`) and paid
      managed traffic reserves against DB-side limits before any provider call
      (`apps/web/lib/services/managed-usage-request-service.ts:175-223`, called from
      `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2633`).

      PAYMENT abuse has the money-movement guards but none of the fraud controls.
      Present: a provider-authoritative duplicate-subscription refusal that reads Stripe
      rather than the possibly-stale local table (`apps/web/app/api/checkout/route.ts:331-361`),
      a store-billed conflict guard (`:211-219`), plan-and-quantity-scoped idempotency
      keys (`:424-431`), full-refund entitlement revocation with double-clawback
      protection (`apps/web/app/api/stripe-webhook/lib/handlers.ts:191-332`) and dispute
      handling (`:334`). Absent, confirmed by grep: no `radar.early_fraud_warning.created`
      case in the webhook switch (`handlers.ts:29-334`; note
      `apps/web/__tests__/trust-boundary.test.ts:201` also asserts it is unhandled, but
      against its own literal event set rather than the route, so the grep is the proof), no
      captcha/bot check anywhere (`turnstile|hcaptcha|recaptcha` → 0 hits outside
      `node_modules`), no fraud/risk/abuse table in `apps/web/db/neon/` (0001–0104), no
      duplicate-account or shared-payment-instrument detection, no refund-abuse policy
      beyond the per-charge clawback, and no review console — `apps/web/app/api/admin/`
      holds only `directory-sync`, `security` and `sso`, and the security route
      (`apps/web/app/api/admin/security/route.ts:29-35`) is a read-only event/metric
      dashboard with no case queue and no action to hold or block a buyer.

      What shipping it would take (product scope, not a patch): a decision on risk
      appetite and Stripe Radar tier; enabling Radar rules on the Stripe account and
      handling `radar.early_fraud_warning.created` plus `review.opened`/`review.closed`
      in the webhook; a durable risk-signal store keyed by user, payment fingerprint, IP
      and device so velocity can be evaluated ACROSS accounts rather than per endpoint;
      duplicate-account linkage (email normalisation, shared card fingerprint, device
      id); a refund/chargeback history model with a per-customer threshold; bot
      mitigation on signup and free-tier consumption; and an admin case queue with
      explicit hold/block/release actions. Every one of those is coupled to BIZ-042 —
      each block needs an auditable reason code and an appeal path, or the controls
      become silent authorization policy. This must not be closed as an audit fix.

- [ ] **BIZ-042 — Ensure fraud controls do not become silent authorization policy.** Provide appeal/support paths and auditable reason codes.

## 6H. Business observability and support

- [ ] **BIZ-043 — Correlate checkout, webhook, subscription, entitlement, usage, invoice, and support events.**
- [ ] **BIZ-044 — Add customer-safe billing diagnostics.** Current plan, source, last reconciliation, reset times, transaction references, and support code.
- [ ] **BIZ-045 — Add operational alerts.** Webhook lag, reconciliation drift, negative credits, duplicate grants, missing invoices, tax failure, high COGS, and plan-gate anomalies.
- [ ] **BIZ-046 — Add data retention and audit policy for financial records.** Keep required records while minimizing sensitive data.

**Phase 6 exit criteria:** every purchasable plan can be bought, activated, metered, changed, canceled, refunded, reconciled, and supported; every non-purchasable plan is clearly request-only; margin is measured or explicitly labeled estimated.

---

# Phase 7 — Remove stale, false, or contradictory documentation and UI copy

## 7A. Delete or correct known false artifacts

- [x] **DOC-001 — Remove stale `google_batch_*` wiring documentation/allowlist entries.** FIXED — the allowlist arm was already clean (see BASE-006); the documentation arm was still open.

      Allowlist arm, NOT APPLICABLE: `grep -c google_batch apps/desktop/wiring-allowlist.json`
      → `0`, and `node apps/desktop/scripts/check-wiring.mjs` → exit 0, "Wiring check
      passed: 1272 registrations, 1268 frontend calls ..., 1270 Rust command definitions,
      4 reviewed orphan allowlist entries, 65 reviewed reachability allowlist entries."
      The 11 entries the audit cites at `wiring-allowlist.json:223-263` were removed in
      `4354d3d8b`; the audit's checker path (`scripts/check-wiring.mjs`) is also wrong —
      it lives at `apps/desktop/scripts/check-wiring.mjs`.

      Documentation arm, FIXED 2026-08-09: deleted `examples/google-batch-api.ts` — a
      16 KB example that documented the cut feature and imported 13 symbols from
      `../apps/desktop/src/api/googleBatch`, a module that no longer exists, so it could
      not compile. Nothing referenced it (no `package.json` script, no import, no doc
      link; `examples/multi-provider-chat.ts` is the only scripted example, via
      `demo:multi-provider`). `node scripts/check-repo-organization.mjs` → exit 0 after
      the delete (`examples/` is a required root and still holds `hooks/` and
      `multi-provider-chat.ts`).

      Left in place deliberately: `docs/agent-context/known-flaws.md:576-579` and
      `docs/current/parity-implementation-matrix.md:162` are accurate *historical*
      records that the feature was cut, not stale capability claims; `audit/` files are
      the triage queue and keep their original evidence.

      OPEN residue (not this task's to touch): the `google/embeddings` harness in
      `packages/ai/model-registry/catalog/harnesses.json:118-124` still names
      `"adapter": "desktop-google-batch"`, pointing at the deleted Desktop module. It is
      inert descriptive metadata — no TS or Rust code branches on the string — but it is
      mirrored into four generated registries (`packages/ai/model-registry/generated/registry.json:1056`,
      `crates/agiworkforce-model-registry/src/generated/model_registry.json:1056`,
      `crates/agiworkforce-protocol/src/generated/model_registry.json:1056`), so
      correcting it means editing the shared catalog and re-running
      `packages/ai/model-registry/scripts/compile.mjs`.

- [ ] **DOC-002 — Remove false training-preference copy.**
- [ ] **DOC-003 — Remove false Mobile store/rating copy and links.**
- [ ] **DOC-004 — Remove deleted-path entries from repo maps and surface docs.**
- [ ] **DOC-005 — Remove fabricated metrics from template automations and demos.**
- [x] **DOC-006 — Remove fake/deprecated model IDs and release names from developer demos.** FIXED — the release-name arm was already satisfied; the model-ID arm was still open and is now closed.

      Release-name arm, SATISFIED: the audit's only cited site is
      `audit/master-checklist-gap-audit-2026-08-05.md:456` → `apps/web/app/dev/inline-toolcall-demo/page.tsx:28-30`,
      "hardcodes a non-existent `https://www.anthropic.com/news/claude-4-7` URL and a
      fabricated release title". `git blame -L 26,36` shows those lines were rewritten in
      `4354d3d8b` (2026-08-07, after the audit): the fixture now points at the real
      `https://www.anthropic.com/news` / "Anthropic · News"
      (`apps/web/app/dev/inline-toolcall-demo/page.tsx:32-33`), and the invented release
      survives only inside the comment that records its removal (lines 28-31).

      Model-ID arm, FIXED 2026-08-09: `examples/multi-provider-chat.ts` — the repo's only
      scripted developer demo (`package.json:170`, `demo:multi-provider`) — pinned
      `claude-haiku-4.5` for its Anthropic target. That ID was retired from the canonical
      catalog in `f62274b63` (2026-07-28, "retire haiku 4.5") and the demo, authored in
      `75cc0ef5a`, was never updated. `packages/ai/providers/anthropic/src/translate.ts:293`
      sends `req.model` to the wire verbatim, so every run with `ANTHROPIC_API_KEY` set was
      a guaranteed 404. Repointed to `claude-sonnet-5` — the cheapest Anthropic model the
      catalog still serves ($3/1M in), matching the demo's cheap-tier intent on the OpenAI
      side (`gpt-5.4-mini`). Verified: a scratch checker that resolves every `model: '...'`
      literal in the demo against `packages/contracts/types/src/models.json` exits 1 before
      the change (`[claude-haiku-4.5] not in models.json`) and 0 after;
      `node scripts/check-model-catalog-integrity.mjs` → exit 0;
      `npx tsx examples/multi-provider-chat.ts "ping"` with no keys reaches the demo's own
      documented "No providers available" exit, proving it still compiles and runs.

      OPEN residue (guard ownership, not this task's to touch): the class guard
      `scripts/check-model-catalog-integrity.mjs` cannot catch this recurrence — its
      `SCAN_ROOTS` is `['apps', 'packages', 'services']` (line 149), so `examples/` and
      `tools/` are never walked, and `claude-haiku-4.5` is absent from
      `REMOVED_SELECTABLE_MODEL_IDS`/`DISALLOWED_SUBSTRING` (lines 58-127) even though the
      catalog dropped it. Closing that needs two edits to a shared guard script.

      OPEN residue (separate subtree): `tools/skill-vetting` hardcodes retired Anthropic
      IDs — `src/skillspector/providers/anthropic/provider.py:45,47`
      (`claude-opus-4-6`, `claude-sonnet-4-6`) and
      `src/skillspector/providers/anthropic_proxy/provider.py:209` (`claude-sonnet-4-6`).
      `claude-opus-4-6` is explicitly on this repo's removed-ID denylist
      (`scripts/check-model-catalog-integrity.mjs:59-60,119-120`). It is a developer tool,
      not a demo, and its defaults are backed by its own bundled registry
      (`.../anthropic/model_registry.yaml:16,20,24` — `claude-opus-4-5`,
      `claude-sonnet-4-6`, `claude-opus-4-6`), so correcting it means editing that registry
      plus both providers plus their tests.

## 7B. Rewrite stale capability statements

- [ ] **DOC-007 — Update AGI Work docs that say dispatch/schedules are unavailable if they now ship; otherwise downgrade code/UI.**
- [ ] **DOC-008 — Update parity matrices that misclassify shipped or removed features.**
- [ ] **DOC-009 — Reconcile known-flaws entries immediately when fixes land.**
- [ ] **DOC-010 — Stop saying the source-of-truth audit was removed if live audit artifacts remain.**
- [ ] **DOC-011 — Correct AdminConsole SSO/SCIM “schema ready” claims.**
- [ ] **DOC-012 — Correct browser-tool README consumer claims.**
- [ ] **DOC-013 — Rewrite connector descriptions so they match actual adapters/actions.**
- [ ] **DOC-014 — Correct CLI browser-control overclaims.**
- [ ] **DOC-015 — Correct VS Code “cloud-only” or other mode-description conflicts.**
- [ ] **DOC-016 — Correct Team price conflict and any stale tier names.**
- [ ] **DOC-017 — Correct SECURITY.md audit-log immutability status.**

## 7C. Downgrade roadmap-only features consistently

- [ ] **DOC-018 — Desktop artifact cloud publish.**
- [ ] **DOC-019 — Image region editing.**
- [ ] **DOC-020 — Artifact versioning where all versions are currently reported as `1`.**
- [ ] **DOC-021 — Design, Science, and Security vertical products.**
- [ ] **DOC-022 — Stale competitive-baseline claims.**
- [ ] **DOC-023 — Placeholder MCP directory.**
- [ ] **DOC-024 — Enterprise-ready/security-control claims without working identity/governance and external audit.**
- [ ] **DOC-025 — Router freshness/benchmark-learning claims.**
- [ ] **DOC-026 — “19 live providers,” “unlimited,” “six live apps,” traction, and quantified moat claims.**

## 7D. Automate truthfulness

- [ ] **DOC-027 — Generate public capability tables from the canonical capability registry.**
- [ ] **DOC-028 — Add link and distribution-state tests.**
- [ ] **DOC-029 — Add “no present-tense planned feature” lint checks for known product pages/catalogs.**
- [ ] **DOC-030 — Require code, test, docs, changelog, and known-flaws update in one pull request for capability-state changes.**

---

# Phase 8 — Distribution, enterprise readiness, and release proof

## 8A. Six-surface release completion

- [ ] **REL-001 — Web:** production smoke, auth, checkout, chat/tool/research, file, project, memory, artifact, billing, and rollback verification.
- [ ] **REL-002 — Desktop:** publish signed/notarized macOS, signed Windows, and signed Linux artifacts with updater, rollback, SBOM, and install tests.
- [ ] **REL-003 — Mobile:** complete store metadata, privacy manifests/data-safety forms, signing, product IDs, device-matrix E2E, phased rollout, crash/ANR/battery/thermal telemetry, and support links.
- [ ] **REL-004 — CLI:** publish verified packages/releases with signatures, checksums, install/uninstall/upgrade tests, and shell completion.
- [ ] **REL-005 — VS Code:** marketplace CI, signing/publisher identity, Restricted Mode/Workspace Trust behavior, remote-host tests, update/rollback, and telemetry disclosure.
- [ ] **REL-006 — Chrome:** MV3 store package, permission rationale, service-worker restart tests, update path, native-host installer, and restricted-page behavior.
- [ ] **REL-007 — Cross-surface continuity:** test same account/workspace/conversation, explicit mode boundaries, conflict recovery, logout purge, and version skew.

## 8B. Enterprise control plane

- [ ] **ENT-001 — Complete identity:** SSO/OIDC/SAML, SCIM, domain verification/capture, JIT, group mapping, deprovisioning, and recovery.
- [ ] **ENT-002 — Complete authorization:** custom roles or clearly bounded fixed roles, groups, policy inheritance, delegated admin, service accounts, and break-glass.
- [ ] **ENT-003 — Complete governance:** model/provider/tool/connector/skill/agent allowlists and read/write action controls.
- [ ] **ENT-004 — Complete audit:** organization/admin/agent action logs, immutable retention, export API, SIEM delivery, and correlation to traces.
- [ ] **ENT-005 — Complete data controls:** retention, deletion, legal hold, residency/processing region, DLP, eDiscovery, and support access policy according to committed scope.
- [ ] **ENT-006 — Complete encryption/networking:** CMEK/BYOK-encryption if promised, key rotation, private endpoint/VPC/IP allowlist/egress policy if promised.
- [ ] **ENT-007 — Complete capacity/commercial controls:** quotas, budgets, chargeback, priority/support tier, SLA/SLO reporting, and contract entitlements.
- [ ] **ENT-008 — Procurement evidence:** security architecture, threat model, pen test/audit status, subprocessor list, incident process, backup/DR proof, and honest certification status.

## 8C. Release evidence

- [ ] **REL-008 — Test from clean machines/accounts.** No founder machine state, cached credentials, unpublished package, or local DB may be required.
- [ ] **REL-009 — Test upgrades from the previous public version.** Include schema/config/model-cache migration and rollback.
- [ ] **REL-010 — Produce a support bundle.** Redacted logs, version, runtime/provider status, correlation IDs, and diagnostics without conversation content by default.
- [ ] **REL-011 — Verify public URLs/listings through automated probes.** Store and marketplace existence must be measured, not inferred.

---

# Phase 9 — Final validation and stop gate

The agent may print `AUDIT_REMEDIATION_COMPLETE` only after every condition below is true.

## 9A. Ledger completeness

- [ ] Every task in this document is `[x]`, or has an approved `NOT APPLICABLE` decision with current-code evidence and regression protection.
- [ ] No task is `[ ]`, `[~]`, or `[!]`.
- [ ] No duplicate issue remains open under another name in `known-flaws`, TODO, PLAN, issue tracker, or audit docs.

## 9B. Repository state

- [ ] Working tree is clean after committing intended changes.
- [ ] Generated files regenerate with no diff.
- [ ] No temporary debug flags, bypasses, broad allowlists, disabled security checks, test credentials, or audit-only hacks remain.
- [ ] No newly introduced dead exports, zero-caller production services, unmounted production components, or duplicate canonical definitions remain.

## 9C. Required checks

Discover and run the repository’s actual equivalents of all of the following:

- [ ] Root lint and formatting.
- [ ] TypeScript typecheck for every workspace/surface.
- [ ] Unit and integration tests for every workspace/surface.
- [ ] Rust `fmt`, `clippy` with required warnings policy, and full workspace tests.
- [ ] Database migration from empty state and upgrade from supported prior snapshots.
- [ ] RLS/tenant-isolation and authorization tests.
- [ ] Route/contract/schema parity checks.
- [ ] Wiring/dead-code/hardcoded-literal/design-token guardrails.
- [ ] Web production build.
- [ ] Desktop builds for macOS, Windows, and Linux in release CI.
- [ ] Mobile iOS and Android release builds.
- [ ] CLI release build/package tests.
- [ ] VS Code packaged-extension tests.
- [ ] Chrome MV3 packaged-extension tests.
- [ ] E2E smoke and failure suites on every supported surface.
- [ ] Security scans: dependency, secret, SAST, file-upload scanner, SBOM/signature verification.
- [ ] Load/performance suite with budgets and stored result.

A command that was not run is not a pass. A command that is flaky is not a pass. A command that succeeds only after excluding the modified subsystem is not a pass.

## 9D. Runtime acceptance matrix

For every supported plan × trust mode × surface, prove:

- [ ] Authentication and logout/account-switch isolation.
- [ ] Effective entitlement and quota.
- [ ] Manual and automatic model selection.
- [ ] Streaming, cancellation, retry, and fallback.
- [ ] Files, projects, memory, search/research, artifacts, tools, connectors, and approvals according to declared capability.
- [ ] Billing/usage attribution according to mode.
- [ ] Offline/local behavior with packet-level proof where applicable.
- [ ] No silent Local/user-key → managed-cloud movement.
- [ ] Tenant/workspace/resource authorization.
- [ ] Accessibility and responsive behavior.
- [ ] Upgrade/reconnect/version-skew recovery.

## 9E. Product-truth acceptance

- [ ] Every public feature claim is generated from or checked against the canonical capability/release registry.
- [ ] Every visible button reaches a tested action, a clear disabled reason, or a truthful planned state.
- [ ] Pricing, limits, tax, billing, stores, providers, models, security, enterprise, and distribution copy match runtime reality.
- [ ] No competitor/reference screenshot is presented as AGI product output.
- [ ] No measured business/traction/margin/scale claim is published without the corresponding evidence source.

## 9F. Final completion output

Only after all gates pass, output exactly:

```text
AUDIT_REMEDIATION_COMPLETE
commit: <final SHA>
ledger: 0 open / 0 blocked
checks: <path to recorded complete results>
release_evidence: <path or references>
```

Otherwise output:

```text
AUDIT_REMEDIATION_INCOMPLETE
next_task: <first unresolved task ID>
reason: <specific failing criterion>
evidence: <command/output/path>
```

Then continue the loop when execution is available.

---

# Iteration procedure

Use this exact control flow for each agent run:

```text
while true:
    refresh_repository_state()
    parse_this_ledger()

    if any_required_baseline_or_guard_is_red:
        fix_first_root_cause()
        add_regression_test()
        record_evidence()
        continue

    task = first_open_task_with_satisfied_dependencies()

    if task exists:
        reproduce(task)
        choose_resolution_mode(task)
        implement_root_fix(task)
        remove_superseded_paths(task)
        add_tests_and_guardrails(task)
        run_scoped_checks(task)
        run_cross_surface_contract_checks_if_shared(task)

        if acceptance_criteria_pass:
            mark_x_and_record_evidence(task)
        else:
            keep_open_and_record_failure(task)
        continue

    run_full_final_stop_gate()

    if every_final_gate_passes:
        print_completion_record()
        break

    convert_each_failed_gate_to_an_open_task()
```

---

# Per-task evidence template

```markdown
### Evidence — <TASK-ID>

- Starting commit:
- Reproduction:
- Root cause:
- Resolution mode:
- Files changed:
- Migrations/config changes:
- Tests added/updated:
- Scoped commands and results:
- Cross-surface commands and results:
- Runtime/E2E proof:
- Security/privacy review:
- Documentation/capability-registry update:
- Final commit:
- Remaining limitations: none | <explicit blocker>
```

---

# Appendix A — Source-order problem inventory and execution crosswalk

This appendix preserves the findings in the order of the screenshot reports. It is an inventory, not a second work queue. Resolve each row through the referenced canonical task(s) above and record the same evidence in both the task log and any repository issue/known-flaw entry.

## A1. BL — “The business layer nobody had audited”

|     # | Reported problem                                                                                                                                                                            | Canonical execution area                  |
| ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| BL-01 | The codebase has substantial billing and entitlement plumbing, but no dedicated shared billing-domain owner; logic is concentrated in Web/gateway code and repeated by clients.             | BIZ-001–BIZ-007; MATCH/HARD guards        |
| BL-02 | Plan price/tier documentation conflicts with code, especially Team pricing and stale tier names.                                                                                            | BIZ-002–BIZ-004; DOC-016                  |
| BL-03 | Team has invite/RBAC plumbing but cannot be bought through the live checkout.                                                                                                               | BIZ-017–BIZ-018                           |
| BL-04 | Enterprise uses a placeholder/contract state without a complete onboarding, invoice, ACH/wire, or entitlement path.                                                                         | BIZ-019–BIZ-021                           |
| BL-05 | Contract/custom entitlement values can be converted incorrectly, including custom values collapsing to zero.                                                                                | CRIT-002; BIZ-005–BIZ-007                 |
| BL-06 | Top-up fulfillment exists, but no purchase-initiation route or production UI makes top-ups buyable.                                                                                         | BIZ-022–BIZ-023                           |
| BL-07 | Refund logic exists but must remain replay-safe, delta-based, and reconciled with credits.                                                                                                  | BIZ-024; BIZ-008–BIZ-016                  |
| BL-08 | Usage is bounded by overlapping windows, but reset/warning/upgrade behavior must be one authoritative policy across surfaces.                                                               | BIZ-010–BIZ-012; BIZ-025–BIZ-028          |
| BL-09 | Checkout does not collect/calculate tax despite contractual tax language.                                                                                                                   | CRIT-003; BIZ-016                         |
| BL-10 | Mobile IAP plumbing exists without verified production product IDs/store purchase readiness.                                                                                                | BIZ-029–BIZ-032; REL-003                  |
| BL-11 | Only token-model provider cost is live; search, sandbox, image, video, speech, infrastructure, storage, transfer, payment fees, refunds, and support costs are absent from production COGS. | SCALE-SPEND-001–006; BIZ-033–BIZ-037      |
| BL-12 | The stated gross-margin figure is not computed or stored from live settled data.                                                                                                            | BIZ-033–BIZ-038; DOC-026                  |
| BL-13 | Cost-aware routing exists, but no measured savings/accepted-task economics proves the business claim.                                                                                       | SCALE-SPEND-003; BIZ-037                  |
| BL-14 | SSO routes/UI query `sso_connections`, a table absent from migrations.                                                                                                                      | CRIT-010                                  |
| BL-15 | Domain verification catches backend/schema failure and silently reports SSO disabled.                                                                                                       | CRIT-011                                  |
| BL-16 | Directory sync routes refer to missing persistence.                                                                                                                                         | CRIT-012                                  |
| BL-17 | SCIM is represented by types/plans without a production endpoint.                                                                                                                           | CRIT-013                                  |
| BL-18 | Admin console surfaces are static or partially wired rather than an authoritative control plane.                                                                                            | CRIT-014; ENT-001–ENT-008                 |
| BL-19 | Audit logging is primarily per-user and lacks complete organization/admin/action export and SIEM delivery.                                                                                  | PP-27; ENT-004                            |
| BL-20 | Data residency, private cloud/VPC/on-prem, customer-managed encryption, legal hold, DLP, and related controls are absent unless explicitly built later.                                     | PP-27; ENT-005–ENT-006; DOC-024           |
| BL-21 | No completed SOC 2, ISO 27001, HIPAA, or equivalent external audit/certification supports an enterprise-ready claim.                                                                        | ENT-008; DOC-024/DOC-026                  |
| BL-22 | Row-level security/tenant isolation is incomplete across candidate tables and derived stores.                                                                                               | CRIT-015                                  |
| BL-23 | WebView egress controls do not automatically govern Rust-side HTTP requests.                                                                                                                | CRIT-016                                  |
| BL-24 | Runtime handoff secret scanning exists, but repository-owned CI secret scanning is absent.                                                                                                  | CRIT-017                                  |
| BL-25 | Dependency/static-analysis coverage and blocking policy differ by language/package; some shared crates are excluded.                                                                        | CRIT-018                                  |
| BL-26 | There is no packet-level zero-network/offline end-to-end proof for the local trust boundary.                                                                                                | SCALE-VER-005/008; Phase 9 runtime matrix |
| BL-27 | Provider license/resale/commercial constraints are not represented as an enforceable release policy.                                                                                        | PP-30; DOC-030                            |
| BL-28 | Referrals/gifts/promotions are incomplete; `referral_code` is unused unless intentionally removed.                                                                                          | BIZ-039–BIZ-042                           |
| BL-29 | Billing support and reconciliation lack complete customer-safe diagnostics and operational alerts.                                                                                          | BIZ-043–BIZ-046                           |
| BL-30 | Public/commercial status differs by surface; Web is the reliable public path while other surfaces require distribution proof.                                                               | REL-001–REL-011; DOC-026                  |

## A2. SC — “What is unfinished, what is slow, and what does not scale”

| Section            | Reported problem classes                                                                                                                                                                                                                         | Canonical execution area    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Spend              | Unmetered non-token capabilities; no settled COGS/margin pipeline; no accepted-task cost; dormant top-ups; weak provider-invoice reconciliation; cost claims lack observed data.                                                                 | Phase 5A; Phase 6D–6F       |
| Throughput and I/O | Independent operations run serially; large payloads/context are buffered or stuffed; missing backpressure; repeated provider/DB/network work; potential N+1/unbounded lists; inconsistent streaming/cancellation.                                | Phase 5B                    |
| Build              | Monorepo/build graph and generated-output correctness need proof; oversized modules and duplicate codegen slow verification; clean builds and platform packages are not uniformly reproduced.                                                    | Phase 5C                    |
| What is unfinished | Zero-caller services, unmounted components, `501` handlers, test-only suppliers, placeholders, fake metrics, duplicate implementations, dormant routes, and “coming soon” actions exist in production-adjacent code.                             | Phase 5D; Phase 4           |
| Verification       | Most claims were code-inspection claims rather than deployed runtime proof; E2E is uneven; skipped tests can silently no-op; no continuous load/performance evidence; production Vercel/Stripe/Neon/store telemetry is not inferred from source. | Phase 5E; Phase 8C; Phase 9 |
| Concurrency        | Process-local job maps, duplicate/replayed events, unbounded workers, stale writers, retry/token-refresh stampedes, incomplete cancellation, and non-durable checkpoints can fail under multiple instances.                                      | Phase 5F                    |
| Growth             | Append-only messages/events/audit/usage/media need retention, partition/index, cursor pagination, archive/delete propagation, quotas, cell/tenant isolation, and database capacity testing.                                                      | Phase 5G                    |
| Repository purity  | Generated/vendored/build code contaminates metrics/searches; stale source-of-truth files and fixed audit entries remain; dead parallel implementations and realistic fake secrets/metrics create confusion.                                      | Phase 5H; Phase 7           |

Additional scale/readiness findings represented in the plan:

- Static benchmark snapshots are not evidence of adaptive routing; benchmark weights and knowledge cutoffs may exist as unused metadata.
- No production feedback loop records routing candidates, rejection reasons, task success, override, latency, retries, or quality outcomes.
- No user-facing routing explanation proves why Auto chose or changed a model.
- Neon/Postgres is a shared stateful dependency and must be load/capacity tested rather than described as proven scalable.
- Cloud/background work must survive client disconnects and deploy/process restarts.
- Media/agent/task status must not reside only in an application-process `Map`.
- Existing notification services, memory/search panels, artifact/report tools, and agent views are unfinished when they are unmounted or have zero callers.
- A full build/test was skipped in prior audit passes; typecheck alone is not release evidence.

## A3. PP — “What the product promises, and what the code does”

### A3.1 Immediate high-severity findings

|      # | Reported problem                                                                                                   | Canonical task    |
| -----: | ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| PP-H01 | Connector directory advertises many branded connectors that return `501` or have no OAuth provider implementation. | CRIT-001; PP-16   |
| PP-H02 | Enterprise custom limits can become zero because the conversion is non-exhaustive.                                 | CRIT-002          |
| PP-H03 | Required CI is red from stale deleted wiring entries.                                                              | BASE-006–BASE-008 |
| PP-H04 | Checkout lacks tax collection.                                                                                     | CRIT-003          |
| PP-H05 | Desktop approval events have no active renderer/resume consumer.                                                   | CRIT-004          |
| PP-H06 | Publicly servable uploads are not malware-scanned.                                                                 | CRIT-005          |
| PP-H07 | Privacy copy describes a training control that is absent.                                                          | CRIT-006          |
| PP-H08 | Mobile legal/help copy claims unverified store availability/ratings.                                               | CRIT-007          |
| PP-H09 | Integrations navigation redirects back and forth rather than reaching a usable destination.                        | CRIT-008          |
| PP-H10 | Desktop browser launcher assumes `chromium` and fails on ordinary macOS installs.                                  | CRIT-009; PP-15   |

### A3.2 Detailed feature-checklist crosswalk

|                           Group | Specific findings preserved from the report                                                                                                                        | Canonical task         |
| ------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
|                         1. Chat | Camera capture absent; per-message report/feedback absent; image carousel absent; interactive tables absent.                                                       | PP-01                  |
|        2. Model/effort selector | Pin-to-model unwired; no model snapshot/version pin; no authoritative default model/effort preference.                                                             | PP-02                  |
|            3. Extended thinking | Duplicate reasoning/accordion implementations and inconsistent active renderer.                                                                                    | PP-02; SCALE-FIN-003   |
|                   4. Web Search | Ambient-only behavior; no explicit off/manual mode; filters unused; no specialized result verticals.                                                               | PP-03                  |
|                     5. Research | No plan approval; weak citation/source verification; no contradiction handling; Desktop report/export/history hidden; Mobile drops research events.                | PP-04                  |
|                     6. Projects | No templates/duplicate/export; collaborators/tasks/agents absent; project memory decorative.                                                                       | PP-05                  |
|                7. Knowledge/RAG | Full-context stuffing and hard caps; no real vector retrieval; memory search is simple lexical matching; Desktop RAG unwired/fallback-like.                        | PP-06                  |
|           8. Memory/chat search | Web disable/import/export missing; Desktop manager unmounted; no sensitive-data exclusions/provenance policy.                                                      | PP-07                  |
| 9. Profile/project instructions | This area was the one reported group without a material parity gap; preserve regression coverage while consolidating context precedence.                           | PP-08; Phase 9         |
|                      10. Styles | Device-only/local storage; incomplete response-length control; not cross-device/scoped consistently.                                                               | PP-08                  |
|                11. File uploads | Missing Office/archive/audio/video/notebook types; no OCR fallback/table extraction; no folder/repo/cloud source; checksum not enforced; quotas/versioning absent. | PP-09                  |
|              12. Code execution | E2B path exists, but notebook support is absent.                                                                                                                   | PP-10                  |
|                   13. Artifacts | Web viewer read-only; no select-and-edit/restore/comments/remix; version behavior incomplete.                                                                      | PP-11                  |
|         14. Shareable artifacts | Publish is Web-only/partial; Desktop action is a placeholder; published version may always be `1`.                                                                 | PP-11                  |
|                 15. Cowork/Work | Real tool loop is exposed as a composer toggle instead of a durable standalone work surface.                                                                       | PP-13                  |
|                 16. Remote Work | Mobile-to-Desktop dispatch exists but docs/UI/observability are stale or thin.                                                                                     | PP-13; PP-15; DOC-007  |
|              17. Scheduled Work | Schedule executes a limited single completion without the promised rich task runtime.                                                                              | PP-21                  |
|                18. Computer use | Approvals/resume broken; DOM content lacks injection defense; sensitive-site blocking incomplete; Linux accessibility path can hard fail.                          | PP-15; MATCH-010       |
|                19. Coding agent | No CI-result reader/GitLab implementation/cloud-dev sessions; LSP diagnostics stub; PR/review paths unreachable; parallel-agent visibility incomplete.             | PP-14                  |
|             20. Design vertical | Missing; must be implemented as a real vertical or downgraded everywhere.                                                                                          | PP-31; DOC-021         |
|            21. Science vertical | Missing; must be implemented or downgraded.                                                                                                                        | PP-31; DOC-021         |
|           22. Security vertical | Missing as a scanner/product; CLI security review is only a prompt template.                                                                                       | PP-14; PP-31; DOC-021  |
|                      23. Skills | Read-only loader; no complete create/update/publish lifecycle.                                                                                                     | PP-17                  |
|                     24. Plugins | Preview rows/install disabled; no publish/default registry/version/permission lifecycle.                                                                           | PP-17                  |
|                  25. Connectors | OAuth registry/adapter gap and default `501` behavior.                                                                                                             | CRIT-001; PP-16        |
|                      26. Chrome | No file download; options/settings incomplete.                                                                                                                     | PP-15; PP-24; REL-006  |
|                       27. Slack | Outbound connector-like behavior only; no real Slack app events/slash commands/bot installation.                                                                   | PP-16; PP-22; PP-28    |
|               28. Microsoft 365 | Catalog/planned representation without real integration.                                                                                                           | PP-16; PP-28           |
|                       29. Excel | No real add-in/connector/editor product.                                                                                                                           | PP-12; PP-28           |
|                        30. Word | No real add-in/connector/editor product.                                                                                                                           | PP-12; PP-28           |
|                  31. PowerPoint | No real add-in/connector/editor product.                                                                                                                           | PP-12; PP-28           |
|                     32. Outlook | Catalog-only/partial; no production add-in.                                                                                                                        | PP-16; PP-28           |
|                       33. Xcode | Missing.                                                                                                                                                           | PP-28                  |
|            34. Enterprise admin | Missing custom roles/groups, organization-wide audit/usage/billing, model/connector/skill controls, retention/residency/legal hold/CMEK/DLP/SIEM.                  | PP-27; ENT-001–ENT-008 |
|                    35. Surfaces | Mobile unpublished; JetBrains/Slack/Teams/Office/Workspace/Xcode/watch/car/widget/tablet/SDK claims absent or unshipped.                                           | PP-28; Phase 8         |

### A3.3 Additional granular implementation defects

- **Onboarding:** no passkey/WebAuthn; no import-from-other-assistant; personalization/product-tour/personal-vs-business/referral/gift flows absent or incomplete.
- **App shell:** Notification Center unmounted; usage/credits partial; Desktop temporary-chat state has no production UI; custom assistants do not span promised surfaces.
- **Composer:** camera row may perform screen capture instead; `@` references are skills-only; Web Search lacks explicit disable; budget display is unwired; image/video generation lacks a clear entry point.
- **Conversation rendering:** specialized card registry is empty or falls back to text; token-usage and latency displays are dead/absent; report/image/table renderers are incomplete; duplicate reasoning renderer is orphaned.
- **Conversation management:** message search is implemented but unmounted; duplicate, branch/fork UI, share permissions/expiry, trash/undo, summary, and print are missing or partial.
- **Routing:** model pin callback absent; region/freshness/privacy inputs are incomplete; user cannot see the routing rationale.
- **Research:** scheduled research excluded; budget absent; reports lack charts/tables/export integrity; Markdown can render literally.
- **Files:** type coverage, extraction, folder/repo/cloud ingestion, checksum comparison, quota, and versioning gaps.
- **Artifacts/documents:** editors are unwired/deleted, Office export can use incorrect format, and version/publish semantics are incomplete.
- **Agent runs:** clarification producer and consumer do not complete a mid-run round trip; no durable user pause/resume; cloud loop lacks controlled parallelism.
- **Coding:** repository indexer deleted; Tauri commands orphaned; CodeReview commands unregistered; automation templates have no consumers; live preview/editor components unmounted; duplicate checkpoints unused.
- **Browser:** host block check has no caller in the actual navigate path; screenshot-only injection scan; multiple replay/visualization implementations unmounted; remote browser path dead.
- **Connector UI:** scope/reauth metadata unused; permission panel unmounted due key mismatch; no clear invocation/audit strip.
- **Image:** edit mode is actually generation; source/mask/origin are not preserved; region selection disabled.
- **Video:** only a subset of aspect ratios is reachable; process-local task storage breaks multi-instance status; result renderer unimported.
- **Voice:** no full-duplex/barge-in/realtime contract; translation/camera/screen absent; hardcoded TTS models; no platform companions.
- **Memory:** project memory can be a hardcoded decorative value; export/import hidden; no sensitive exclusions.
- **Tasks:** real file-watch/cron/webhook backend can exist without mounted UI; schedule runtime is too narrow.
- **Sharing:** token-public only; no workspace/private/expiry/revoke; no richer resource sharing/collaboration.
- **Notifications:** push tokens may persist without sender; email/connector-expiry events absent.
- **Settings:** controls have defaults but no writer/mount; Web and Chrome settings incomplete; Help navigation absent.
- **Privacy/security:** ZDR may be documentation-only; secret scan not on ordinary sends; user-facing new-device/anomaly alerts absent.
- **Developer API:** structured output rejected; embedding catalog unused; advanced APIs/SDKs/webhooks/service accounts/budgets/regions/playground absent; retired routes remain.
- **Help/legal/verticals:** community/DMCA/model licensing absent; health/legal/education/cyber/shopping/travel/maps verticals absent; decorative financial integration excluded.

## A4. CM — “Two things that should match, don’t”

|     # | Exact mismatch                                                                                                        | Canonical task     |
| ----: | --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| CM-01 | Application surface enum accepts an `origin_surface` value rejected by SQL.                                           | MATCH-001          |
| CM-02 | Migration tests do not assert the affected surface column/constraint.                                                 | MATCH-001          |
| CM-03 | Cloud Code approval rows can be inserted but not decided/resumed by a real production path.                           | MATCH-002          |
| CM-04 | Migration comments describe an approval-resume behavior that does not exist.                                          | MATCH-002; DOC-030 |
| CM-05 | `owner`/`admin` role checks are repeated in TypeScript and SQL instead of using one policy.                           | MATCH-003          |
| CM-06 | `MANAGED_CLOUD_CHAT_BASE_PATH` is exported but callers use repeated literals and drifting query shapes.               | MATCH-004          |
| CM-07 | Settings/API path literals are repeated while sibling paths use constants.                                            | MATCH-005          |
| CM-08 | Mobile/Web shadow `TOOL_APPROVAL_RESUME_PATH`.                                                                        | MATCH-006          |
| CM-09 | One schedule/resource client uses raw literal, builder, and constant for list/get/create.                             | MATCH-007          |
| CM-10 | `vercel.json` rewrites duplicate or conflict with the actual Next.js routing owner and can be inert.                  | MATCH-008          |
| CM-11 | `CONNECTOR_OAUTH_START_PATH` is independently declared in Web/shared UI/Mobile.                                       | MATCH-009          |
| CM-12 | Desktop passes search results to a higher-privilege model context without the untrusted-content fence used elsewhere. | MATCH-010          |
| CM-13 | Desktop prompt tells the model to call `memory_add`, but the runtime exposes different memory tool names.             | MATCH-011          |
| CM-14 | Design-token z-index scale is exported but unused while overlay primitives hardcode independent values.               | MATCH-012          |

## A5. HC — “Where this repo hardcodes things it shouldn’t”

|     # | Exact hardcoding/duplication                                                                                                                                                            | Canonical task    |
| ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| HC-01 | Desktop conversation summarizer and sibling modules hardcode OpenAI endpoint strings despite a canonical provider base URL table.                                                       | HARD-001          |
| HC-02 | Perplexity host is repeated in provider and web-search config; Veo host is also duplicated.                                                                                             | HARD-002          |
| HC-03 | CLI fallback hardcodes the OpenAI chat-completions URL byte-for-byte instead of using the registry.                                                                                     | HARD-003          |
| HC-04 | Groq transcription endpoint is duplicated in Desktop and CLI Rust binaries.                                                                                                             | HARD-004          |
| HC-05 | Six upload paths enforce 10 MB while the canonical attachment contract is 12 MB; comments incorrectly claim parity.                                                                     | HARD-006          |
| HC-06 | Six Desktop API modules define private 30-second timeout constants while shared timeout exports have no importers.                                                                      | HARD-007          |
| HC-07 | Three API files and an IPC timeout map independently hardcode 120 seconds.                                                                                                              | HARD-008          |
| HC-08 | A 300 ms debounce value is independently spread across seven Desktop/Mobile/Web/extension/shared-chat sites.                                                                            | HARD-009          |
| HC-09 | A 10-second timeout is repeated in multiple Desktop files and shadows unused shared constants.                                                                                          | HARD-010          |
| HC-10 | Four Web HTTP retry implementations independently default to three attempts.                                                                                                            | HARD-011          |
| HC-11 | Page size `50` is repeated across Desktop/Web/Mobile; schedules duplicate it and run history separately hardcodes `20`.                                                                 | HARD-012          |
| HC-12 | ElevenLabs/TTS default remained hardcoded after the provider removed the selected model.                                                                                                | HARD-013          |
| HC-13 | Local-provider logic recognizes only `ollama`, excluding other real local runtimes from canonical classification.                                                                       | HARD-014          |
| HC-14 | Three independent keyboard-shortcut default arrays can drift.                                                                                                                           | HARD-015          |
| HC-15 | Extension onboarding slash-command finder maintains a separate hardcoded built-in list.                                                                                                 | HARD-016          |
| HC-16 | Mobile previously carried an independent connector catalog; preserve the fix with a canonical-registry test.                                                                            | HARD-017          |
| HC-17 | Repository-wide literals remain possible for provider URLs, internal hosts, model IDs, routes, roles, plans, limits, timeouts, retries, page sizes, debounce values, and layout tokens. | HARD-018–HARD-023 |

## A6. Documentation/capability contradictions explicitly called out by the reports

The following are resolved through Phase 7 and must not be left as narrative-only notes:

- Delete stale Google Batch allowlist/source references after the implementation was removed.
- Delete false privacy training-control text.
- Delete false mobile store/rating claims.
- Delete stale repo-map paths and realistic/fabricated demo metrics.
- Rewrite AGI Work, parity, audit, SSO/SCIM, browser-tool, and connector documentation to match current code.
- Downgrade Desktop artifact cloud publish, image region edit, placeholder versioning, Design/Science/Security products, MCP directory, and other roadmap-only entries.
- Do not claim: six live apps, enterprise-ready, measured 40% margin, freshness/benchmark-aware routing, 19 live providers, unlimited plans, commercially available Team/Enterprise, traction, store/marketplace availability, achieved certifications, or a proven quantified moat without evidence.

---

# Completion principle

The repository is complete for this audit only when **code, database, runtime wiring, user interface, product copy, tests, security policy, billing behavior, and release evidence all describe the same product**. Tracking a defect, hiding a control, or adding an unexecuted implementation does not satisfy that condition.
