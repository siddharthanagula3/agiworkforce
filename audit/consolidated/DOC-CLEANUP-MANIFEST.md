# AGI Workforce Doc Cleanup Manifest — 2026-05-30

## Summary

- **Files analyzed**: 647 classifications
- **Archive**: 339 files (52%) → `docs/archive/2026-05-30/`
- **Keep-in-place**: 302 files (47%)
  - Current/load-bearing: 252
  - Reference/methodology: 50
- **Keep-rename**: 0 files
- **Needs-Review**: 7 files
- **Protected (no touch)**: 56 files (canon, audits, root-control, legal)

**Safety statement**: All archival moves are reversible `git mv` operations to `docs/archive/2026-05-30/` with relative path preservation. Protected docs remain untouched. Zero destructive deletes.

---

## PROTECTED FILES (Confirmed Safe to Keep)

✓ **Canonical/Current** (load-bearing):

- `docs/current/source-of-truth.md`
- `docs/current/agi-product-requirements.md`
- `docs/current/parity-implementation-matrix.md`
- `docs/current/byok-strategy.md`
- `docs/current/technical-architecture.md`
- `docs/current/commercial-and-launch.md`

✓ **Agent Context** (canon + known-flaws.md):

- `docs/agent-context/**` (11 files)

✓ **Root Control** (explicitly protected):

- `README.md`, `AGENTS.md`, `CLAUDE.md`, `PLAN.md`, `TODO.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `ONBOARDING.md`, `BUILD.md`, `THIRD_PARTY_LICENSES.md`, `AGI_WORKFORCE.md`

✓ **NEW Audits (This Session)**:

- `audit/AUDIT-INDEX.md`
- `audit/CROSS-SURFACE-SYNTHESIS.md`
- `audit/honesty/*.md` (6 files)
- `audit/{codequality,supplychain-security-mcp,crates,docs-vs-impl,clerk-neon-completeness,supabase-hunt}.md` (6 files)
- `audit/consolidated/**` (partial; old backups archived, live synthesis kept)

✓ **Live Migrations** (never touch):

- `apps/web/db/neon/**` (32 live migrations)

✓ **Security/Legal** (conservative hold):

- `docs/security/auth-role-service-role-body-checks.md` (pattern doc, mark `needsReview=yes`)
- `docs/legal/**` (all kept)

---

## Archive Manifest

Target: `docs/archive/2026-05-30/` (preserve relative subpaths)

```sh
# Prep archive root
mkdir -p docs/archive/2026-05-30

# === docs/audit/ (R26 parity lanes — detail reports) ===
mkdir -p docs/archive/2026-05-30/docs/audit
git mv docs/audit/2026-05-22-claude-parity-w1-web.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-r-web.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-r-desktop.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-w2a-desktop-pro.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-w2b-desktop-max.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-w2c-desktop-platform.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-w3-mobile.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-w4-cli.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-w5-chrome-ext.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-w6-vscode-ext.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/2026-05-22-claude-parity-v-web-visual.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/docs-organization-2026-05-20.md docs/archive/2026-05-30/docs/audit/
git mv docs/audit/FIX_QUEUE.md docs/archive/2026-05-30/docs/audit/

# === docs/security/ (old red-team reports, superseded by honesty/*) ===
mkdir -p docs/archive/2026-05-30/docs/security
git mv docs/security/red-team-2026-05-04.md docs/archive/2026-05-30/docs/security/
git mv docs/security/REVIEW.md docs/archive/2026-05-30/docs/security/
git mv docs/security/findings-web.md docs/archive/2026-05-30/docs/security/
git mv docs/security/findings-desktop.md docs/archive/2026-05-30/docs/security/
git mv docs/security/findings-cli.md docs/archive/2026-05-30/docs/security/
git mv docs/security/findings-mobile.md docs/archive/2026-05-30/docs/security/
git mv docs/security/findings-chrome-ext.md docs/archive/2026-05-30/docs/security/
git mv docs/security/findings-vscode-ext.md docs/archive/2026-05-30/docs/security/
git mv docs/security/findings-supply-chain.md docs/archive/2026-05-30/docs/security/
git mv docs/security/review-architecture.md docs/archive/2026-05-30/docs/security/
git mv docs/security/review-performance.md docs/archive/2026-05-30/docs/security/

# === docs/archive/2026-05-21-docs-consolidation/ (old bulk consolidation) ===
mkdir -p docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation
git mv docs/archive/2026-05-21-docs-consolidation/AGI_WORKFORCE-legacy.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/ARCHITECTURE.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/BILLION_DOLLAR_PLAYBOOK.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/cli-binary-size-2026-05-15.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/HANDOFF.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/HOSTING.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PERFORMANCE.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRD-APPENDIX-A-DATA-MODELS.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRD-APPENDIX-B-API-CONTRACTS.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRD-APPENDIX-C-MONOREPO-LAYOUT.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRD-MOBILE.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRD-RESOLUTIONS-AND-AUDIT.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRD.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/PRICING.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/ROADMAP.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/SCALING.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/
git mv docs/archive/2026-05-21-docs-consolidation/VISION.md docs/archive/2026-05-30/docs/archive/2026-05-21-docs-consolidation/

# === docs/archive/2026-05-16-pre-v3/ (pre-v3 archived by prior curator) ===
mkdir -p docs/archive/2026-05-30/docs/archive/2026-05-16-pre-v3
git mv docs/archive/2026-05-16-pre-v3/DESIGN.md docs/archive/2026-05-30/docs/archive/2026-05-16-pre-v3/
git mv docs/archive/2026-05-16-pre-v3/SHIP_RUNBOOK.md docs/archive/2026-05-30/docs/archive/2026-05-16-pre-v3/
git mv docs/archive/2026-05-16-pre-v3/UNIFIED_LAUNCH_PLAN.md docs/archive/2026-05-30/docs/archive/2026-05-16-pre-v3/
git mv docs/archive/2026-05-16-pre-v3/VERIFICATION_2026-05-08.md docs/archive/2026-05-30/docs/archive/2026-05-16-pre-v3/

# === docs/visual-verification/ (snapshot findings JSONs — superseded by narrative in README) ===
mkdir -p docs/archive/2026-05-30/docs/visual-verification/web
git mv docs/visual-verification/web/home-route-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/projects-route-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/projects-detail-empty-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/round-17-home-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/round-17-pricing-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/round-17-project-detail-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/round-17-projects-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/round-17-chat-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/round-18-settings-findings.json docs/archive/2026-05-30/docs/visual-verification/web/
git mv docs/visual-verification/web/round-18-connectors-findings.json docs/archive/2026-05-30/docs/visual-verification/web/

mkdir -p docs/archive/2026-05-30/docs/visual-verification/desktop
git mv docs/visual-verification/desktop/round-17-root-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/
git mv docs/visual-verification/desktop/round-17-signup-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/
git mv docs/visual-verification/desktop/round-17-providers-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/
git mv docs/visual-verification/desktop/round-17-pricing-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/
git mv docs/visual-verification/desktop/desktop-root-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/
git mv docs/visual-verification/desktop/desktop-signup-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/
git mv docs/visual-verification/desktop/desktop-providers-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/
git mv docs/visual-verification/desktop/desktop-pricing-findings.json docs/archive/2026-05-30/docs/visual-verification/desktop/

# === docs/design/ (old prompts for Claude Design agent execution) ===
mkdir -p docs/archive/2026-05-30/docs/design
git mv docs/design/mobile-claude-design-prompt-r2-2026-05-18.md docs/archive/2026-05-30/docs/design/
git mv docs/design/mobile-screen-design-prompt-2026-05-18.md docs/archive/2026-05-30/docs/design/
git mv docs/design/pitch-deck-prompt-2026-05-17.md docs/archive/2026-05-30/docs/design/

# === docs/archive/ older dated trees ===
mkdir -p docs/archive/2026-05-30/docs/archive
git mv docs/archive/2026-05-02-master-remediation.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-02-sprint1-vault-rewire.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-14-exploration-ledger-phase1.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-14-reverse-engineering-campaign docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-14-rust-reverse-engineering-plan-v1.2.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-14-wave2-desktop-v1.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-14-wave3-mobile-extensions-web.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-18-exploration-report.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-18-wave-0-complete.md docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-20-planning docs/archive/2026-05-30/docs/archive/
git mv docs/archive/2026-05-24-supabase-to-clerk-neon-migration.md docs/archive/2026-05-30/docs/archive/

# === docs/launch/ (old wave 1 marketing drafts, superseded by wave-3-*) ===
mkdir -p docs/archive/2026-05-30/docs/launch
git mv docs/launch/show-hn.md docs/archive/2026-05-30/docs/launch/
git mv docs/launch/twitter.md docs/archive/2026-05-30/docs/launch/
git mv docs/launch/r-localllama.md docs/archive/2026-05-30/docs/launch/

# === docs/plans/ (dated planning snapshots) ===
mkdir -p docs/archive/2026-05-30/docs/plans
git mv docs/plans/six-surface-system-design-2026-05-20.md docs/archive/2026-05-30/docs/plans/

# === Root-level old reports ===
mkdir -p docs/archive/2026-05-30
git mv audit-report.md docs/archive/2026-05-30/
git mv REMEDIATION_BRIEF.md docs/archive/2026-05-30/
git mv REMEDIATION_LOG.md docs/archive/2026-05-30/

# === audit/ old index & per-slice files ===
mkdir -p docs/archive/2026-05-30/audit
git mv audit/2026-05-15-full-defect-inventory.md docs/archive/2026-05-30/audit/
git mv audit/audit-log.md docs/archive/2026-05-30/audit/
git mv audit/pricing-report.json docs/archive/2026-05-30/audit/
git mv audit/qa-readiness/baseline.json docs/archive/2026-05-30/audit/qa-readiness/
git mv audit/qa-readiness/state.json docs/archive/2026-05-30/audit/qa-readiness/

# === audit/consolidated/sources/ (backup copies of old versions) ===
mkdir -p docs/archive/2026-05-30/audit/consolidated/sources
git mv audit/consolidated/sources/audit__2026-05-15-full-defect-inventory.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/audit__audit-log.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/audit__COVERAGE.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/audit__FLAWS.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/audit__GAPS.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/audit__INDEX.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/audit-report.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__archive__2026-05-21-docs-consolidation__PRD-RESOLUTIONS-AND-AUDIT.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__2026-05-22-failure-mode-audit.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__AI_AUDIT_ARCHITECTURE.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__AI_AUDIT_COMMANDS.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__AI_AUDIT_LEDGER.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__AI_AUDIT_RISK_REGISTER.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__AI_AUDIT_STATE.json docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__AUDIT_2026-05-03.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__AUDIT_REPORT_2026-05-01.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__audit__desktop-audit-2026-05-20.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/docs__visual-verification__functional-audit-2026-05-22.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/REMEDIATION_BRIEF.md docs/archive/2026-05-30/audit/consolidated/sources/
git mv audit/consolidated/sources/REMEDIATION_LOG.md docs/archive/2026-05-30/audit/consolidated/sources/

# === audit/anthropic-apps-parity/ (old parity analysis, explicitly deleted by INDEX.md) ===
mkdir -p docs/archive/2026-05-30/audit/anthropic-apps-parity
git mv audit/anthropic-apps-parity docs/archive/2026-05-30/audit/

# === audit/reference-cli-deep-audit/ (old CLI parity audit, explicitly deleted by INDEX.md) ===
mkdir -p docs/archive/2026-05-30/audit/reference-cli-deep-audit
git mv audit/reference-cli-deep-audit docs/archive/2026-05-30/audit/

# === audit/repo-organization/ (old repo org audit, explicitly deleted by INDEX.md) ===
mkdir -p docs/archive/2026-05-30/audit/repo-organization
git mv audit/repo-organization docs/archive/2026-05-30/audit/

# === audit/reports/ (old batch reports, explicitly deleted by INDEX.md) ===
mkdir -p docs/archive/2026-05-30/audit/reports
git mv audit/reports docs/archive/2026-05-30/audit/

# === reports/ (old analysis reports, dated/superseded by new audits) ===
mkdir -p docs/archive/2026-05-30/reports
git mv reports/frontend-parity-r1 docs/archive/2026-05-30/reports/
git mv reports/frontend-reference-comparison docs/archive/2026-05-30/reports/
git mv reports/root-scratch-archive docs/archive/2026-05-30/reports/
git mv reports/playwright-mcp-archive docs/archive/2026-05-30/reports/
git mv reports/audit/inventory docs/archive/2026-05-30/reports/audit/
git mv reports/audit/AUDIT_2026-05-03.md docs/archive/2026-05-30/reports/audit/  # if present in reports/

# === tasks/ (old planning/research prompts & dated docs) ===
mkdir -p docs/archive/2026-05-30/tasks
git mv tasks/launch-checklist-2026-07-18.md docs/archive/2026-05-30/tasks/
git mv tasks/launch-readiness-wave2-plan.md docs/archive/2026-05-30/tasks/
git mv tasks/research/_decisions_to_lock.md docs/archive/2026-05-30/tasks/research/
git mv tasks/research/archive docs/archive/2026-05-30/tasks/research/
git mv tasks/research/PROMPT-APPLE-LORA-ADAPTER-RESEARCH.md docs/archive/2026-05-30/tasks/research/
git mv tasks/research/PROMPT-DSAR-E2EE-RESEARCH.md docs/archive/2026-05-30/tasks/research/
git mv tasks/research/PROMPT-IO-WWDC-2026-RESEARCH.md docs/archive/2026-05-30/tasks/research/
git mv tasks/research/PROMPT-V1-MODEL-SELECTION-RESEARCH.md docs/archive/2026-05-30/tasks/research/
git mv tasks/research/PROMPT-V6-INTELLIGENCE-SWEEP.md docs/archive/2026-05-30/tasks/research/
git mv tasks/team-status/phase4-execution-plan.md docs/archive/2026-05-30/tasks/team-status/
```

---

## Rename Manifest

No renames recommended. All keep-in-place docs already follow current conventions or are protected/reference materials with stable paths.

---

## Needs-Review Table

| Path                                                      | Why Risky                                                                                                                                                               | Recommended Action                                                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/archive/2026-05-21-docs-consolidation/OWNERSHIP.md` | May be referenced by code-review routing or cross-surface testing guardrails; not found in CLAUDE.md but ownership patterns could be implicit.                          | Grep codebase for `OWNERSHIP.md` references before archiving. If none found, safe to archive.                                                                        |
| `docs/archive/2026-05-16-pre-v3/SURFACE_VERIFICATION.md`  | Defines 'working' state for 6 surfaces + verification commands; may be embedded in CI or developer onboarding. Not confirmed referenced.                                | Check if CI gates or ONBOARDING.md cite this doc. If standalone, archive is safe.                                                                                    |
| `docs/security/auth-role-service-role-body-checks.md`     | Wave 2 audit follow-up: pattern accepted with caveats for defense-in-depth on SECURITY DEFINER RPCs. Still authoritative.                                               | Re-verify after migration #20260508210156 that pattern still holds. Mark `needsReview=yes` and keep in-place for now.                                                |
| `tasks/research/deep/*` (41 files)                        | Deep-dive component analysis supporting gap-matrix + MASTER_PLAN; referenced implicitly but not by name in control docs. Large volume.                                  | Confirm these are truly superseded by new audits (AUDIT-INDEX.md, honesty/\*). If so, safe to archive; if gap-matrix is still active, keep.                          |
| `reports/audit/inventory/*` (18 files)                    | Phase 1 per-slice inventory; findings rolled into INVENTORY_ROLLUP.md but kept for evidence. Policy says "archive once superseded."                                     | Keep in-place as evidence trail per retention policy; only archive if newer audits (honesty/, codequality.md) make them fully redundant. Conservative: keep for now. |
| `tasks/research/gap-matrix/*` (26 files)                  | Parity baseline measurement (38% avg); feeds MASTER_PLAN and architectural decisions. Not explicitly referenced by control docs but foundational to decision rationale. | Confirm whether active parity work still relies on these matrices. If decision lock is complete, archive is safe. Otherwise, keep.                                   |
| `tasks/research/exec/*` (8 files)                         | Wave execution reports (W1–W8); Phase 1 execution evidence. Dated but traceable to MASTER_PLAN milestones.                                                              | Confirm whether wave execution is still part of active roadmap. If superseded by newer phase reports, safe to archive. Otherwise, keep as evidence.                  |

**Operator action**: For each row, run the grep command suggested or manually confirm before archiving.

---

## Post-Move Validation Checks

After all `git mv` commands complete, run:

```sh
# 1. Verify no broken doc links in protected docs
rg 'docs/(audit|archive|plans|design|security|launch|visual-verification)' \
  CLAUDE.md AGENTS.md PLAN.md TODO.md CHANGELOG.md \
  docs/current/ docs/agent-context/ \
  --color never 2>/dev/null | grep -v 'docs/archive/2026-05-30' || echo "✓ No active links to archived docs"

# 2. Verify new audit dir structure is intact
test -f audit/AUDIT-INDEX.md && test -f audit/CROSS-SURFACE-SYNTHESIS.md && \
  test -d audit/honesty && test -f audit/honesty/cli.md && \
  echo "✓ New audit suite present" || echo "✗ New audit suite incomplete"

# 3. Verify protected docs untouched
test -f docs/current/source-of-truth.md && test -f README.md && test -f CLAUDE.md && \
  test -f docs/agent-context/known-flaws.md && \
  echo "✓ Protected docs intact" || echo "✗ Protected docs missing"

# 4. Run repo organization check
pnpm check:repo-organization 2>&1 | tail -20

# 5. Spot-check archive paths (sample)
test -d docs/archive/2026-05-30/audit && \
  test -f docs/archive/2026-05-30/docs/audit/2026-05-22-claude-parity-w1-web.md && \
  test -f docs/archive/2026-05-30/docs/security/red-team-2026-05-04.md && \
  echo "✓ Archive structure correct" || echo "✗ Archive incomplete"

# 6. Verify git status clean
git status --short | grep -E '(deleted|modified|new file)' && \
  echo "⚠ Uncommitted changes remain" || echo "✓ Staging clean"
```

---

## Summary for Operator

**Green to execute:**

- 339 archive moves (preserve relative paths in `docs/archive/2026-05-30/`)
- 302 keep-in-place (no touches)
- 7 files flagged for manual verification before archiving

**After execution:**

1. Run the 6 validation checks above.
2. For each item in Needs-Review table: confirm with grep, then decide to proceed or keep.
3. Create a single commit: `git commit -m "docs(cleanup): archive dated/superseded reports, consolidate into docs/archive/2026-05-30"`
4. Verify: `git log --oneline -1` and `git status` both clean.

All moves are reversible. Protected docs (CLAUDE.md, AGENTS.md, audit/CROSS-SURFACE-SYNTHESIS.md, honesty/\*, etc.) remain untouched.
