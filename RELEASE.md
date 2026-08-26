# Release Readiness — Single Source of Truth

Status: ACTIVE — release-execution session
Owner: Release lead (orchestrator)
Branch: `release/readiness-2026-08-25`
Last updated: 2026-08-25

This file is the **one** consolidated task list for taking every supported app to
public release. It supersedes the scattered control docs (PLAN.md, CHANGELOG.md,
ExecutionPlan.md, FoundersAssistance.md, docs/agent-context/known-flaws.md, and
the audit/parity markdown). Those are treated as stale leads only; every item
here is grounded in code, git, or a live run — not in a doc claim.

Supported release surfaces: **web, mobile, desktop, CLI, VS Code extension,
browser extension, backend services + shared packages.** `apps/slack-app` and
`apps/github-app` are future surfaces and are OUT OF SCOPE for this release.

Statuses: `TODO` `INVESTIGATING` `BLOCKED` `IMPLEMENTING` `FIXED` `VERIFIED`
`MANUAL` `NOT_APPLICABLE`. Once an item is `VERIFIED`, it moves to the Done log
and leaves the active table.

Severity × release impact drives order: build failures → runtime crashes →
data-loss → auth/authz → security → billing/entitlements → broken core →
integrations → frontend flows → UI/UX → responsive → perf → a11y → cleanup.

---

## Gather status (inputs being consolidated)

| Stream                        | Scope                                            | State                           |
| ----------------------------- | ------------------------------------------------ | ------------------------------- |
| Static health battery         | guardrails, typecheck:all, cargo check           | DONE — all green                |
| CI failure triage             | GitHub Actions live logs                         | DONE — root cause found + fixed |
| Deploy pipeline triage        | GitHub Actions + Vercel API                      | DONE — MANUAL blocker found     |
| Turbo build (all but desktop) | real build evidence                              | DONE — 40/40 tasks green        |
| Security scan                 | apps/web + server packages, adversarial-verified | RUNNING                         |
| Stale-purge discovery         | markdown / e2e / debris inventory                | DONE — purge wave pending       |
| Release-gather (6 scouts)     | code-grounded known-work, all surfaces           | RUNNING                         |
| Machine trackers              | audit/inventory.json (654), ui-gaps (341)        | mined; reconciling in gather    |

---

## Active release blockers & tasks

Ordered by release impact. IDs are stable within this file.

| ID      | Title                                                                                                 | Surface       | Sev  | Impact  | Status  | Auto? | Evidence                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------- | ------------- | ---- | ------- | ------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REL-001 | Migration 0145 unescaped apostrophe aborts every CI DB-prep step                                      | web/db        | crit | blocker | FIXED   | yes   | `apps/web/db/neon/0145_web_pack_example_prompts.sql`; CI "syntax error at or near s"; committed `eeefe1d14`, verified by full-chain SQL lexer                              |
| REL-002 | GitHub-Actions production deploy dead since 2026-08-09 (invalid VERCEL_TOKEN in `production-web` env) | release-infra | crit | blocker | MANUAL  | no    | `vercel pull` → "Could not retrieve Project Settings"; 5/200 runs green, last 2026-08-09; same pull succeeds with founder local login. Rotate token → see Manual Checklist |
| REL-003 | Production serving commit 83 behind main                                                              | release-infra | high | major   | BLOCKED | no    | depends on REL-002; prod serves `2f6901e3b`, main at `73b8031cc`. Unblocks once deploy token rotated                                                                       |
| REL-004 | Stale agent-doc apparatus removed (CLAUDE.md + AGENTS.md tree)                                        | repo          | low  | cleanup | FIXED   | yes   | committed `0dbae4f2b`; chain 42 checks EXIT 0                                                                                                                              |

More rows land as the four running streams report. Each incoming finding is
deduped against this table before it is added.

---

## Manual Release Checklist (actions that require the founder)

Only items that genuinely cannot be done from code/CLI/API in this environment.

1. **Rotate the Vercel deploy token (REL-002).** Where: Vercel dashboard →
   account/team tokens → create a token scoped to team `siddharthanagula4`
   (`team_QAqU2q6NTV4xxn971rfTy1F4`); then GitHub repo → Settings →
   Environments → `production-web` → update secret `VERCEL_TOKEN`. Why: the
   current token fails `vercel pull` in CI, so no commit auto-deploys.
   Unblocks: REL-002 and REL-003 (automatic promotion of main to production),
   and the whole "deploy all apps" release step. Verify after: re-run the
   Deploy Production Surfaces workflow; `scripts/verify-deployment.mjs
https://agiworkforce.com <main-sha>` should report production serving main.

---

## Done log (VERIFIED — kept for traceability, out of active scope)

_(empty until first items are verified end-to-end)_
