# Execution Plan

Status: Active
Owner: Founder + platform lead
Last updated: 2026-08-08

The session queue. Every item is scheduled from its `Writes:` set so agents can run in
parallel without colliding. When every item is `done`, this file and `CHANGELOG.md` are
both emptied and the next session starts a fresh queue.

## How this file is used

**`Writes:` is the scheduling primitive.** Two items may run in parallel **only if their
write-sets are disjoint**. That is the whole collision rule.

**`Owner: main`** means the orchestrator does it directly, never a subagent. That applies
to any file where parallel writes clobber rather than merge:

- `packages/contracts/types/src/**` — every surface imports these
- ratchet/allowlist files (`scripts/config/reference-integrity-allowlist.json`,
  `audit/inventory.json`) — they regenerate **wholesale**
- the 12 locale bundles — `check:i18n-parity` demands exact key parity
- database migrations — ordering is global
- `ExecutionPlan.md`, `CHANGELOG.md`, `docs/agent-context/known-flaws.md` — every task
  appends
- **all commits** — agents produce changes; the orchestrator stages, verifies, commits

Agents that must write in parallel run with worktree isolation so they cannot collide by
construction.

**The loop, per item:** verify against source → implement → targeted test → full suite +
`pnpm check:llm-operability` → append to `CHANGELOG.md` → mark `done` with evidence → next.

**Dismissals count as completion.** A finding that does not reproduce is recorded with the
evidence that disproves it. These queues are seeded from audits, and audits contain false
positives — one already turned out to be a render transition captured mid-frame.

**When input is needed:** ask. If no answer arrives, research how ChatGPT, Claude and
Gemini handle the same decision, choose from that evidence, and record the question, the
comparison, the choice and how to reverse it. Never self-decide anything outward-facing or
irreversible — publishing, deleting user data, live Stripe objects, production deploys.

---

## P0 — Production and CI

### E-01 Restore the authenticated API (argon2 native module not traced)

Status: in-review · PR #401
Owner: main
Writes: apps/web/next.config.ts · apps/web/lib/api-auth.ts
Verify: build, then assert route traces contain `prebuilds/linux-arm64`
Evidence: Confirmed via Vercel — 262 errors, 24 routes, continuous from 2026-08-07
21:41 UTC. `node-gyp-build` resolves `.node` paths at runtime so Next's static tracing
never copied them. After the fix 197 route traces carry the binary; before, zero did.
Blast radius was 98 route files via `api-auth.ts` → `ApiKeyService` → `argon2` at module
scope; that import is now lazy.

### E-02 Unblock CI (process group reaped before shutdown acknowledges)

Status: in-review · PR #400
Owner: main
Writes: apps/cli/src/process_tree.rs
Verify: `cargo test --lib` in apps/cli
Evidence: 100 consecutive red runs reduced to one test of 1,838. Real race:
`terminate_owners_and_wait` returned when the registry drained, which is the direct child
exiting, not the group being reaped. Full suite 1,837 passed / 0 failed.

### E-03 Deploy the restored API and confirm recovery

Status: blocked — needs founder go-ahead (production, not self-decided)
Owner: main
Blocks: everything that needs a verified deploy path
Verify: `get_runtime_errors` shows the argon2 group stop growing; `/api/me` non-500

### E-03b Unblock the deploy pipeline (Vercel git comments vs Next 16.3.0)

Status: blocked — founder action, see FoundersAssistance.md §1
Owner: main
Evidence: **Every** deploy fails after a successful build with "Cannot patch preview
comments when immutable static file upload is enabled." Not preview-only — it kills
production deploys too, which is the real reason nothing has shipped. No stable Next
release fixes it; only `16.3.1-canary.8`. API PATCH of `gitComments` was silently
rejected, so the dashboard toggle is required.

### E-03c Vercel CLI could not deploy at all (fixed)

Status: done
Owner: main
Writes: .vercelignore
Evidence: a CLI production deploy uploads the working directory and .vercelignore omitted every
native output, so the CLI pushed ~1.2GB and died on "File size limit exceeded (100 MB)" —
a CLI deploy was not an available incident-response path during the outage. Excluded
`target` (70GB), `apps/desktop/release`, `.vscode-test`, `ios/Pods`, `tmp`, `.turbo/cache`.
Build now completes; only E-03b remains.

### E-04 Post-deploy smoke check

Status: todo
Owner: main
Writes: .github/workflows/deploy-production.yml
Why: 21 hours of total API failure went undetected. A deploy that cannot answer
`/api/health` and `/api/me` must fail.

---

## P1 — Land the docs branch

### E-05 Restore `tools/skill-vetting/README.md`

Status: todo
Owner: main
Writes: tools/skill-vetting/README.md
Evidence: `pyproject.toml:9` declares `readme = "README.md"`. Hatchling fails without it,
`verify.sh` aborts under `set -euo pipefail` before any scan, and the `skill-supply-chain`
job dies — so the pre-install vetting gate for untrusted skills does not run. An exhaustive
sweep confirmed this is the **only** true build break among 237 deleted files.

### E-06 Merge `chore/retire-stale-docs`

Status: blocked by E-02, E-05
Owner: main

### E-06b Retire `PLAN.md` in favour of this file

Status: todo — deliberately deferred past the production incident
Owner: main
Writes: PLAN.md (delete) · scripts/check-repo-organization.mjs ·
docs/engineering/naming-conventions.md · scripts/check-structure-conventions.mjs ·
~15 referrers (AGENTS.md, docs/AGENTS.md, docs/current/source-of-truth.md, lanes.json,
risk-map.json, eslint.config.mjs, …)
Verify: `pnpm check:reference-integrity` — the real test that every referrer was updated
Why deferred: `PLAN.md` is referenced by 15+ files and pinned by a guard requiring
`docs/engineering/naming-conventions.md` to contain the literal sentence "Use `PLAN.md`
for active strategic plan and phase structure." (`check-structure-conventions.mjs:867`).
That is an 18-file change; running it alongside two urgent PRs invites conflicts for no
benefit. `ExecutionPlan.md` is already the live queue.

---

## P2 — Money, all verified against source

### E-07 Gateway abort billing

Status: todo
Owner: main
Writes: services/api-gateway/src/routes/llm.ts · services/api-gateway/src/services/managedUsageBilling.ts
Verify: new test — deltas delivered, _then_ abort, asserts non-zero settle
Evidence: `managedUsageBilling.ts:392-400` forces `actualCostCents = 0` on `failed`, and
migration 0056 line 453 refunds the whole reservation. No equivalent of the
`resolveBilledOutcome` guard already shipped in apps/web. The one existing disconnect test
passes only because its adapter emits no chunks.

### E-08 Gateway rolling caps

Status: todo
Owner: main
Writes: services/api-gateway/src/services/managedUsageBilling.ts
Evidence: calls the 8-arg legacy `reserve_managed_usage_request`; apps/web calls
`reserve_managed_usage_request_with_limits` with all three ceilings plus `is_flagship`. The
capped function is a wrapper that delegates to the legacy one after checking — so the
gateway is the same reservation minus every cap. Desktop, CLI and VS Code therefore enforce
no 5-hour, weekly or flagship limit at all.

### E-09 Team seat reconciliation

Status: todo
Owner: main
Writes: apps/web/app/api/settings/organization/route.ts
Evidence: `licensed_seats` defaults to 1 (`0085_…sql:72`) and is written only by the Stripe
webhook onto a row matched by owner. Self-serve purchases happen before org creation, so
`attachSeats` logs `no_organization` and returns; org creation never reads the purchased
quantity. The two-seat floor makes this hit **every** Team purchase.

### E-10 Tier-aware rate limits

Status: todo
Owner: agent
Writes: services/api-gateway/src/middleware/rateLimit.ts · apps/web/lib/rate-limit.ts
Evidence: 122 flat configs across two systems, zero tier awareness. On the LLM route the
subscription is loaded three lines after the limiter decides — the tier is available and
discarded.

### E-11 Cloud Code flat-rate turns

Status: todo
Owner: agent
Writes: apps/web/lib/services/cloud-code-agent-service.ts
Evidence: reserves 25¢, runs up to 24 steps, finalizes at the same flat 25¢ rather than
measured usage; no token plumbing exists, so it can never be reconciled.

---

## P3 — The four audit waves

Batched so write-sets stay disjoint. Each finding is verified against source before any fix.

| Batch | Source | Focus                                                                                                                       |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| E-20  | Wave 3 | Trust boundary — Local chat reaching managed cloud via image generation; capability filter running on zero production turns |
| E-21  | Wave 3 | Data loss — desktop project/memory sync not account-scoped (Critical); account-erasure cluster                              |
| E-22  | Wave 2 | Fail-open security — extension memory handlers, Plan/Safe mode writes, secret-scanner drift, SSRF gaps                      |
| E-23  | Wave 4 | Performance — 37 serial awaits before first token; 6 round trips per RLS read; markdown re-parsed per token                 |
| E-24  | Wave 1 | Hardcoded values — model IDs, token limits, duplicated constants                                                            |
| E-25  | Wave 2 | Drift — orphaned events, config contract, schema vocabulary, route paths                                                    |
| E-26  | Wave 4 | Unfinished — 537 unreachable modules; 20 dark desktop feature directories                                                   |
| E-27  | Wave 4 | i18n — 2,055 missing keys; three surfaces with no i18n mechanism                                                            |

---

## P3b — Code scanning: 108 open CodeQL alerts on `main`

Counted from the GitHub API, not the dashboard summary. Grouped by rule so write-sets stay
disjoint and each batch shares one mental model.

| Item | Rule                                                           | Count | Note                                                                                                                                         |
| ---- | -------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| E-40 | `rust/cleartext-logging`                                       | 39    | Largest group. Secrets or tokens reaching logs.                                                                                              |
| E-41 | `rust/hard-coded-cryptographic-value`                          | 21    | Concentrated in `managed_cloud_provider.rs`; some are test fixtures (`byok_vault_tests.rs`) and will be dismissals with evidence, not fixes. |
| E-42 | `js/polynomial-redos`                                          | 21    | Regex denial-of-service on user-supplied input.                                                                                              |
| E-43 | `js/insufficient-password-hash`                                | 4     | Directly adjacent to the argon2 work in E-01.                                                                                                |
| E-44 | `rust/cleartext-transmission`                                  | 3     |                                                                                                                                              |
| E-45 | `js/incomplete-sanitization` + multi-character + url-substring | 7     | Sanitizer families; fix together.                                                                                                            |
| E-46 | `rust/disabled-certificate-check`                              | 2     | Verify intent before touching — may be a deliberate local-dev path.                                                                          |
| E-47 | `js/missing-rate-limiting`                                     | 2     | Ties into E-10 tier-aware limits.                                                                                                            |
| E-48 | `js/bad-code-sanitization`                                     | 2     |                                                                                                                                              |
| E-49 | `actions/missing-workflow-permissions`                         | 2     | Workflow hardening; cheap.                                                                                                                   |

CodeQL itself currently reports errors on the repo — that is investigated as part of E-40
before trusting any individual alert, since a partially-failing scan can both miss real
findings and surface stale ones.

## P4 — Prevention, so these classes cannot recur

### E-30 Native-module bundling check in CI

Would have caught E-01 before deploy.

### E-31 Uptime monitoring and alerting

Nothing in the repo can page a human; `/api/health` exists and nothing calls it.

### E-32 E2E for signup → checkout → entitlement

Currently zero; Stripe is only ever mocked, which is how E-09 survived.

### E-33 Orphaned-module ratchet wired into CI

537 unreachable modules and the ratchet does not run.

### E-34 Load-test baseline

No k6/artillery/autocannon anywhere; p95 time-to-first-token is unmeasured.
