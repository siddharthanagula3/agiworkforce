# Autonomous Hardening Brief — AGI Workforce Monorepo

> HOW TO RUN THIS (read first):
>
> 1. In Claude Code, send this as its own message, alone: `/effort ultracode`
> 2. Then send: `Read REMEDIATION_BRIEF.md at the repo root and execute it autonomously, end to end.`
>    Do NOT type `/workflow` — the word "workflow" inside this brief is the trigger; Claude decides when to spin one.
>    Requires Claude Code v2.1.154+ and a paid plan.

## Fan-out (use the full capacity)

Use Dynamic Workflows aggressively. Each workflow may orchestrate up to 1,000 total subagents with up to 16 running concurrently, in JavaScript you write on the fly. For any batch below that touches many independent files, spin a workflow and parallelize to the 16-concurrent ceiling. Assign TWO independent reviewer subagents per file: reviewer A checks correctness and that the invariants below hold; reviewer B checks it builds/typechecks/tests. A file only merges if BOTH pass. Never let a parallel agent land an unreviewed change. (This two-reviewers-per-file discipline is what kept the Bun Zig-to-Rust port at 99.8% test-green across hundreds of parallel agents — match it.)

## Mission

You are a senior staff engineer operating autonomously on the monorepo at `~/Desktop/agiworkforce`. Take this codebase from "audit-flagged" to a production-credible, end-to-end-demoable v1 across all six surfaces, hardened to the engineering bar of the Claude/ChatGPT desktop+web clients on the dimensions that live in code: reliability, zero fabricated data, real end-to-end flows, clean types, graceful failure. Match that engineering bar; the company-scale items under "Out of scope" are not yours to attempt.

## Honesty-grade invariants (never violate, even under parallelism)

1. Never invent data. Where you find hardcoded or random numbers standing in for real data, wire them to real data or show an honest empty/loading/error state. NEVER invent new fake numbers. Top rule.
2. Read before you write. Understand a file and its callers first. Smallest change that fixes the issue. No style rewrites, no mass refactors.
3. Prove dead before deleting. Remove code only after the build passes without it AND a repo-wide reference search plus cargo-machete/knip confirm it is unused. Everything reversible via git/PRs.
4. Two independent reviewer subagents per file in every workflow (see Fan-out). A file merges only if both pass.
5. Do not break product invariants: v1 ships Local + BYOK only; managed cloud stays gated. No "unlimited [provider]" or reseller framing. Leave signed-build identifiers and release config intact.
6. Surface decisions, do not guess. For irreversible or product/architecture calls (which auth system to keep, deleting a whole package, changing a public API), make the most-integrated reversible choice, log it, and flag it.
7. Log every change in REMEDIATION_LOG.md (what / why / verification / audit-delta). Commits reference the batch.

## Calibrated context — the audit is mostly noise; do NOT chase it

`audit.sh` at the repo root is your feedback loop (read-only; writes audit-report.md). Re-run `bash audit.sh` after every batch; the targeted metric must drop with no regressions elsewhere. Before changing anything, read audit-report.md, docs/current/source-of-truth.md, the parity-implementation matrix, PLAN.md, root Cargo.toml and package.json, and the base tsconfig paths.

IGNORE these false positives — do not "fix" them:

- PLACEHOLDER (~1721): almost all the HTML/React placeholder= attribute. Legitimate.
- mock/mocked (~3330): mostly MSW, test fixtures, and identifiers. Only mock data rendered in non-test, user-facing code matters.
- WIP (~230): substring hits like "swipe"/"wipe". Noise.
- Math.random for IDs, keys, jitter/backoff, animation is fine.
- Undeclared imports that are tsconfig path aliases (@core/_, @features/_, @shared/\*, stores, features) are NOT missing packages.

## Batches (run in order; workflow the parallel ones)

### Batch 0 — Green baseline (serial)

Install from lockfile, build every app/service, run all suites, cargo check/clippy. If CI is missing or red, fix it first. Save the current audit-report.md as the baseline to diff against.

### Batch 1 — Dependency correctness (ship-breaker, do first)

Make a cold `pnpm install --frozen-lockfile` + production build work from scratch. Spin a workflow to verify and declare genuinely-undeclared runtime deps in the correct package.json: pg (packages/data-layer postgres adapter), qs + express-serve-static-core (services/api-gateway), highlight.js (web markdown renderer), glob + mocha (vscode-extension tests), @eslint/js, @expo/config-plugins. Leave vscode (host-provided). DoD: every app/service builds in isolation from a cold install.

### Batch 2 — De-fake user/investor-facing surfaces

Spin a workflow over the audit section-3 list (skip the animation/ID false positives) to replace fabricated stats with real data or honest empty states. Confirmed real offenders to start: apps/desktop/src/features/v3/CodeModeHome.tsx (hardcoded 612/697587 + random heatmap), apps/web/features/analytics/pages/AnalyticsDashboard.tsx, apps/desktop/src/services/analyticsQueries.ts, apps/extension-vscode/src/features/model-picker/modelMetrics.ts. DoD: no fabricated data in any non-test render path.

### Batch 3 — Crash-hardening (Rust)

todo!/unimplemented! are already 0. Spin a workflow across apps/desktop/src-tauri/src/sys/commands, crates/\* request handlers, and the apps/cli agent loop to triage the ~158 panic!(), 3 unreachable!(), ~4747 .unwrap()/.expect() ON USER-REACHABLE PATHS ONLY. Convert recoverable cases to Result + typed errors surfaced to the UI; keep panics only for genuine invariants. DoD: no panic/unwrap on user-reachable paths; app degrades, never crashes.

### Batch 4 — Auth unification (serial; this is a decision)

Collapse the Clerk-vs-Supabase fork to ONE system end-to-end (web proxy, gateway, desktop, mobile, extensions). Default to the JWT system the proxy/gateway/desktop/mobile already share; migrate the other. Log the decision. DoD: a single tested auth path, no dead auth code.

### Batch 5 — Dead code & duplication

Remove proven-dead crates/packages (cargo-machete + knip; corroborate the ~177 #[allow(dead_code)] and the self-admitted prunable crates). For dup-version files: KEEP automation_enhanced.rs (verified substantive); ignore anything under \_archive/; check whether a v1 coexists for settings_v2.rs and apps/cli/src/subagent_v2.rs and delete the dead one. Verify orphans before deleting: @agiworkforce/stores is likely imported via the @shared/stores alias (not dead); react-native-worklets may be vendored. Consolidate the two supabase/migrations dirs into one canonical history. DoD: 0 orphan packages, 0 dead dup files, single migration root.

### Batch 6 — Type safety & tests

Spin a workflow to eliminate the ~21 `as any` and ~17 @ts-ignore with real types, un-skip or delete the ~156 skipped/.only tests, and add meaningful tests for core paths (LLM proxy, three-tier router, provider adapters, agent loop, computer-use). DoD: 0 skipped tests, no `as any` in core, green meaningful suite.

### Batch 7 — Surface parity to genuinely end-to-end (the long pole)

For each surface in launch order (Mobile, Web, Desktop, CLI, Chrome, VS Code), spin a workflow per surface to take every "Partial" in the parity matrix to truly end-to-end on Local + BYOK: wire UI shells to real backends, close the documented P0 gaps. DoD: each surface demoable start-to-finish, no dead buttons or empty shells. PAUSE for founder input on product questions here.

### Batch 8 — Production hardening

Error reporting + observability, request rate-limiting, a security pass (no secrets in the client, no tokens in logs or URLs), and perf on the largest hotspots from audit section 12. Use /deep-research for any "current best practice for X" question instead of guessing. DoD: errors reported and recoverable; security pass clean.

## Definition of done (whole effort)

Cold `pnpm install --frozen-lockfile` + every app/service production-builds green. After excluding the documented noise: mock-data-in-prod ~ 0, Rust panics on user paths = 0, skipped tests = 0, dup-version files = 0, orphan packages = 0. Every surface demoable end-to-end on Local + BYOK; zero fabricated data anywhere. REMEDIATION_LOG.md documents every decision and audit delta.

## Out of scope — flag for the founder, do not attempt

Training or serving frontier models, acquiring users/distribution, managed-cloud infra/billing/ops at scale, legal/compliance/trust-and-safety, go-to-market. Your remit is the codebase.

## Cadence

Loop: pick next batch -> spin the workflow (up to 16 concurrent agents, two reviewers per file) -> verify (build/typecheck/test + audit.sh) -> commit + log -> re-run audit -> next. Post a short summary after each batch. Pause for human input only on irreversible or product/architecture decisions.
