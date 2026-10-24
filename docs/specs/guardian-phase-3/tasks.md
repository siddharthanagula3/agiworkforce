# Guardian phase 3: tasks

Status: Active
Owner: Guardian
Last updated: 2026-10-23

All six were re-verified open against the code on 2026-10-23: no Guardian
migration exists under `apps/web/db/neon`; `webhook-router.ts` routes push and
pull_request to automation events only and has no `merge_group` route;
`packages/guardian/core/src/adapters` holds only the repo-check adapter, with
`osv` and `gitleaks` present as source-type names in `schema.ts` and no adapter;
and there is no Guardian evaluation corpus. They are ordered: each depends on the
one before it.

1. **Persistence layer**: `guardian_review_runs` / `guardian_findings` /
   `guardian_suppressions` migrations following 0106's conventions, so
   baselining ("existing findings do not flood new PRs"), fixed-finding
   closure, and suppression expiry become durable across runs.
2. **Control-plane orchestration**: extend
   `apps/web/app/api/github/webhook/webhook-router.ts` to route push /
   pull_request / merge_group events into Guardian review runs (today the
   router sends push and pull_request to automation events, not Guardian);
   reuse installation tokens + entitlements; keep the Actions workflow as the
   in-repo surface.
3. **LLM specialist reviewers**: provider-neutral structured-output reviewers
   behind the existing model router with per-run cost budgets; findings enter
   the same dedupe → rank → policy pipeline (policy already enforces the
   corroboration rule).
4. **Evaluation corpus** (a proposed future directory under docs/guardian): seeded mutations +
   historical defects; precision/recall tracking gates any promotion from
   shadow mode.
5. **Scanner expansion**: add gitleaks/osv-scanner adapters with exact
   pins per LICENSING.md; SBOM lane.
6. Phases 3–5 per the mission (entitlements, dashboards, autofix, enterprise).
