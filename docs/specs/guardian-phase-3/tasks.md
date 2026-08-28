# Guardian phase 3 — tasks

Status: Active
Owner: Guardian
Last updated: 2026-08-28

All six were verified open on 2026-08-28. They are ordered: each depends on the
one before it.

1. **Persistence layer**: `guardian_review_runs` / `guardian_findings` /
   `guardian_suppressions` migrations following 0106's conventions, so
   baselining ("existing findings do not flood new PRs"), fixed-finding
   closure, and suppression expiry become durable across runs.
2. **Control-plane orchestration**: extend
   `apps/web/app/api/github/webhook/webhook-router.ts` to route push /
   pull_request / merge_group events into Guardian review runs via
   `guardian-github` normalization (currently only issue_comment mention flow
   is live); reuse installation tokens + entitlements; keep the Actions
   workflow as the in-repo surface.
3. **LLM specialist reviewers**: provider-neutral structured-output reviewers
   behind the existing model router with per-run cost budgets; findings enter
   the same verify → dedupe → rank → policy pipeline (schema already
   enforces the corroboration rule).
4. **Evaluation corpus** (a proposed future directory under docs/guardian): seeded mutations +
   historical defects; precision/recall tracking gates any promotion from
   shadow mode.
5. **Scanner expansion**: enable gitleaks/osv-scanner adapters with exact
   pins per LICENSING.md; SBOM lane.
6. Phases 3–5 per the mission (entitlements, dashboards, autofix, enterprise).
