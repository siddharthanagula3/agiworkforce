# Restructure Execution Program

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-15
Ruling it executes: `docs/plans/target-structure-finalization-2026-07-15.md`
Wave definitions it extends: `docs/plans/monorepo-restructure-2026-07-08.md` (Appendix B)

This is the complete, ordered execution program from the current verified
baseline to the finalized structure. Every wave lists scope, write set,
steps, gates, exit criteria, and an effort estimate. Waves marked MECHANICAL
contain no behavior changes; waves marked BEHAVIOR never move files.

## 0. Verified Baseline (2026-07-15, end of this session)

- Frontend P0s DONE: VS Code disabled-option guard (webview 13/13, full
  extension suite 543/543, typecheck clean) and the ID-based
  `removePendingAttachment` host protocol (state-manager 12/12 incl. new
  regression test); WebAppShell mobile drawer landed TDD-first (6 new
  component tests) and verified rendered at 320/390/768/1280 across
  `/projects`, `/projects/[id]`, `/library`, `/schedules` (evidence in
  session scratchpad `webappshell-evidence/`); known-flaws row
  `WEB-APPSHELL-MOBILE-SIDEBAR-01` marked Fixed.
- M6 merges EXECUTED (uncommitted): cache→`utils-image` (module `cache`),
  home-dir + rustls-provider→`network-proxy` (modules `home_dir`,
  `rustls_provider`), async-utils + string→`protocol` (modules
  `async_utils`, `string_utils`); `utils-template` DELETED as proven
  unused (zero source references — disposition adjusted from merge to
  delete). `cargo check --workspace` green (15 members);
  merged-module tests green; `repo-map.json#workspaceUnits` 64→58.
- Known concurrent-lane noise (NOT this program's defects): 8
  `network-proxy` allowlist tests fail against another lane's uncommitted
  `mitm.rs` edit (+1/−4); web dev-server `/library` auto-opens a Team &
  Enterprise waitlist modal (founder judgment pending); desktop
  `connectorsStore.test.ts` 1 pre-existing failure.
- Commit policy (standing): commit a wave only when the staged set is
  verifiably 100% this program's work; `Cargo.lock`/`pnpm-lock.yaml` are
  co-dirty with other lanes, so waves land uncommitted for founder review
  unless the worktree quiesces.

## 1. Standing Rails (apply to every wave)

1. Mechanical waves are single-worker serialized; behavior lanes may run in
   parallel only with disjoint write sets per `docs/agent-context/lanes.json`.
2. Never mix moves with behavior changes. Never touch another lane's dirty
   files; if a required file is co-dirty, note it and route around or wait.
3. Breaking-change window OPEN (zero external users): internal contracts,
   schemas, and identifiers are fixed to FINAL shape without shims;
   external contracts (providers, App Store, Stripe) excluded.
4. Contracts before parity breadth: no new parity surface area until W5
   lands.
5. Per-wave minimum gates (Appendix B5): `check:repo-organization`,
   `check:boundaries`, `check:structure-conventions`, `check:agent-context`,
   `turbo run lint typecheck test build --dry=json`, `pnpm typecheck:all`,
   `git diff --check`, `cargo metadata`, `cargo check --workspace`, plus the
   owner-surface tests from `docs/agent-context/commands.json`.
6. Evidence before completion claims; update `known-flaws.md` and
   `CHANGELOG.md` with source-backed outcomes only.

## 2. Wave Program

### W1 — M6 close-out (MECHANICAL, in flight)

Remaining steps: run the guard battery; spot-format the six touched Rust
files; add the CHANGELOG entry (six microcrates merged, template deleted as
unused); note the mitm.rs-lane test collision for its owner.
Exit: guards green; CHANGELOG records M6 with the template-disposition
adjustment. Estimate: 0.5h.

### W2 — M7 tools/ root + skill-vetting move (MECHANICAL)

Write set: `scripts/check-repo-organization.mjs` (add `tools` to
`allowedRootDirs`), `services/skill-vetting/**` → `tools/skill-vetting/**`
(unchanged content incl. its LICENSE + THIRD_PARTY_NOTICES), new
`tools/AGENTS.md` (scoped rules: vendored read-mostly code, no behavior
edits without upstream diff review), `repo-map.json` (unit path +
disposition move→keep; the `verify.sh` check reference), CODEOWNERS if it
patterns `services/`.
Exit: guards green; no `services/skill-vetting` references outside history
docs. Estimate: 1–1.5h.

### W3 — M8 facade deletion (MECHANICAL; precondition: one green full cycle)

Precondition: full CI/verification cycle green after W1–W2.
Write set: delete `packages/services` + `packages/stores`; update the
guards that name them (`check-service-domain-ownership.mjs`,
`check-artifact-sync-ownership.mjs` facade clauses), `lanes.json`
(`shared-package-integration` lane paths), `repo-map.json` (58→56 units),
pnpm workspace prune, Appendix-B cross-refs in docs.
Exit: zero references; frozen install green. Estimate: 1–2h.

### W4 — T-wave: founder's reference grouping + confirmed renames (MECHANICAL)

Scope (finalization §3.2): regroup `packages/` into
`{contracts,ai,client,ui,tools,platform}` and execute the confirmed renames
`llm-runtime`→`provider-runtime`, `llm-normalize`→`provider-protocol`.
Steps: write the per-unit move manifest (approved like Appendix B3);
update `pnpm-workspace.yaml` globs (`packages/*/*` pattern alongside
`packages/providers/*`); move dirs; for the two renames update package
names + every import/mock/alias (Vite, Jest, tsconfig), manifests, lock
links; retag every package's `turbo.json` with its group; update
CODEOWNERS, `lanes.json` owned paths, guard path literals
(grep-audit every `scripts/check-*.mjs` for `packages/` literals),
`repo-map.json` paths, `commands.json`, docs.
Gates: full battery + `pnpm build` (Vercel build path) + owner test suites
of every moved package.
Exit: tree matches §3.2; dependent filters select correct consumers;
zero old-path references. Estimate: 4–6h (largest mechanical wave).

### W5 — Discipline wave 1: contracts + guardrails (BEHAVIOR, the core)

Contracts (all inside `packages/types/src/` + `cloud-contracts`, with first
consumers, breaking-window final shape):

1. Session taxonomy (`sessions/`): discriminated session kinds per CC §4.2
   (cloud_chat, cloud_work, managed_sandbox, desktop_local_chat,
   desktop_byok_chat, mobile_local_chat, developer_local, developer_cloud,
   browser_task, remote_projection, handoff_snapshot) carrying execution
   location, storage scope, trust boundary, host identity, capability
   snapshot, retention, handoff eligibility. First consumers: web chat +
   desktop composition root + mobile appMode (label their existing
   sessions).
2. ExecutionProfile (R5): one Local/Cloud toggle resolving
   identity/data/inference/tool/workflow planes; consumers: desktop runtime
   composition root, mobile mode stack.
3. Capability handshake (six-app finding A): server-authoritative
   effective-capability document per session; `capabilities/registry` +
   evaluator in `routing` admission (task-declared MANDATORY requirements
   the model cannot weaken); consumers: web `/api/me`-adjacent handshake,
   VS Code/CLI via app-server, mobile gate stack.
4. One versioned agent event envelope: extend `agiworkforce-protocol` +
   ts-rs generation; converge web SSE, app-server JSON-RPC events, and
   desktop stream events on it (adapters may translate at edges; no new
   dialects).

Guardrails landing with W5: vendor-type leak gate in `check:boundaries`;
Turbo `boundaries.tags` allow/deny mirroring the groups; facade-zero gate
retired post-M8; `docs/agent-context/generated/` machine indexes
(dependency-graph.json from turbo dry + cargo metadata, module-summaries,
contract-registry) with a generator script + drift check; `deny.toml` +
cargo-deny CI job; `rust-toolchain.toml` pin; nested `AGENTS.md` for
`providers`, `provider-runtime`, `provider-protocol`, `unified-chat`,
`model-registry`, `cloud-contracts`.
Gates: full battery + new contract test suites + ts-rs drift check.
Exit: contracts consumed by ≥1 real surface each; guards active in CI.
Estimate: 8–12h.

### W6 — Provider/billing correctness (BEHAVIOR, parallel-safe with W5)

1. Anthropic `refusal` stop reason mapped to an explicit refusal outcome
   (`packages/providers/anthropic/src/stream.ts`).
2. `post_promo_prices` consumed by
   `services/api-gateway/src/services/managedUsageBilling.ts` and
   `apps/web/lib/services/llm-cost-calculator.ts` (Sonnet post-2026-08-31
   pricing) + regression tests pinned to catalog dates.
3. Stale refund test rewritten against `settleCreditsDurably` (confirm
   production settlement path first).
4. OpenAI Responses-native hosted tools wired through the harness where the
   registry declares them; registry stays truthful otherwise.
   Exit: provider-contract + billing test suites green; no invented
   capabilities. Estimate: 3–5h.

### W7 — P4 residual: desktop engine twins (BEHAVIOR+DELETE, desktop-native lane)

Staged per `rust-engine-extraction-2026-07-09.md`: c2 SSE-decode swap, c3
28-arm dialect swap, c4 bedrock/managed-cloud swaps onto `agiworkforce-llm`;
d2 onto `agiworkforce-mcp`; e2 local-chat loop onto `agent-core`; b2
Op-envelope TS derive; then DELETE the ~201 twin files
(`core/llm` 69, `core/mcp` 30, `core/agi` 71, `core/agent` 31). Plus CLI
`exec_policy.rs` onto `agiworkforce-execpolicy` (EXEC-POLICY-DUP-01).
Gates: JSONL byte-identity fixtures, desktop full vitest + cargo tests;
EXTERNAL: live-provider + desktop-device smoke (founder-run or scheduled) —
do not fake-complete.
Exit: `DESKTOP-CLI-HARNESS-FRAGMENTATION-01` closed. Estimate: 6–10h agent
work + external smoke.

### W8 — P1 residual dead-code sweep (DELETE, after M8)

`apps/web/src/` orphan (import sweep first), `src-tauri/test.db`, dead
agent-mode trio (unified-chat `agentModeStore`+`AgentModeSwitcher`, desktop
`features/chat/AgentModeSwitcher`; web composer switcher stays), v3 dead
barrel exports (`AgiWorkHome`, `CodeModeHome`, `AgiWorkDispatch` only),
`SearchModalCmdK`. Exit: zero importers proven pre-delete; suites green.
Estimate: 1–2h.

### W9 — Breaking-window contract repairs (BEHAVIOR; fix-to-final-shape)

From CC §6.2 + audit contradictions, re-verified against current code
before each fix (several may already be fixed): E2B ComputeSession
tenant/user binding; custom-MCP handle global identity; schedules
table/column vocabulary unified with the migration lineage (one canonical
vocabulary, migrate the one database, delete the loser); org-membership
dual systems collapsed to one entity model; API-key issue/verify format
unified; desktop schedules moved off the replaceable in-memory native
store; worker-control routes either get their tables + producer or are
unmounted (no dead mounts). Every fix lands at FINAL shape — no dual-write,
no compat columns.
Gates: full battery + migration probe on a disposable Neon branch + the
owning route contract tests.
Exit: re-verified contradiction rows closed or marked stale-with-evidence
in `known-flaws.md`. Estimate: 4–8h.

### W10 — P6 mobile multimodal SLM + iOS canonical path (BEHAVIOR)

Ship Qwen3-VL-2B-Instruct (Apache-2.0, official GGUF + mmproj, tier-3
`initMultimodal`) with LFM2-VL-1.6B as the low-RAM tier-2 option: catalog
entries with verified license fields + checksums, `local-llm` mmproj
lifecycle, capability detection (`visionIn` true only when mmproj
installed), RAM ≥3.5GB gate, device QA matrix. Resolve root `ios/` vs
prebuild drift to the config-plugin-first canonical path
(`MOBILE-IOS-PREBUILD-DRIFT-01`); decide the dormant health-context client.
Gates: mobile typecheck + suites + on-device smoke (EXTERNAL, founder or
simulator run — do not fake-complete).
Estimate: 4–8h agent work + external QA.

### W11 — P7 enterprise-Local design doc (DOC-FIRST)

Design doc before code (plan §7 P7): offline licensing adoption plan
(CLI/Desktop consume `agiworkforce-licensing` or it is deleted pre-release),
signed org-policy distribution, SSO/SCIM without cloud chat routing, local
audit export, self-hosted gateway profile. Estimate: 2–3h.

### W12 — F5 web domain-first internal move (MECHANICAL, LAST move wave)

The final move wave, only after W3–W5: reorganize `apps/web` internals
(103 `app/` entries, 81 `lib/` dirs, 157 API routes, stray `src/`)
domain-first per naming-conventions folder-per-feature, with its own
approved per-directory manifest, zero behavior change, route-parity proof
(route inventory before/after identical), and full web suite + build gates.
Estimate: 6–10h.

## 3. Orchestration Model (founder directive 2026-07-15)

The main session (this agent) is the ORCHESTRATOR/INTEGRATOR; Sonnet-5
teammates execute waves. Rules:

- Teammates run in this worktree with lane-scoped write sets from
  `lanes.json`; their prompts embed: exact write-set, forbidden paths
  (including every other lane's dirty files), the standing rails (§1), the
  gate list, and "report evidence, never claim completion from build
  success."
- MECHANICAL waves stay single-worker: one teammate at a time for
  W2→W3→W4→W12, dispatched only after the previous wave's gates pass under
  orchestrator review.
- BEHAVIOR waves parallelize when write sets are disjoint: W5 (contracts
  lane), W6 (provider/billing lanes), W9 (web-api/db lanes) may run
  concurrently; W7 (desktop-native lane) may run beside them.
- The orchestrator personally owns: shared coordination files (PLAN.md,
  CHANGELOG.md, known-flaws.md, repo-map.json, lanes.json, guard scripts),
  wave gate execution, diff review of every teammate's output before
  acceptance, and disposition adjustments (e.g., the utils-template
  merge→delete call).
- A teammate that must touch a co-dirty file STOPS and reports; the
  orchestrator routes around or defers.

## 4. Timeline Estimate (honest, evidence-based)

Agent-hours by wave: W1 0.5 · W2 1–1.5 · W3 1–2 · W4 4–6 · W5 8–12 ·
W6 3–5 · W7 6–10 · W8 1–2 · W9 4–8 · W10 4–8 · W11 2–3 · W12 6–10 —
total ≈ 40–68 agent-hours.

Wall-clock with 3–4 parallel Sonnet-5 teammates and serialized mechanical
waves: the core program W1–W9 ≈ 2–4 working days of continuous
orchestration; the complete program through W12 ≈ 1–2 calendar weeks,
dominated by the EXTERNAL gates that cannot be faked (live-provider +
desktop-device smoke for W7, on-device mobile QA for W10, one green full
CI/release cycle before W3, live Neon migration probes for W9). Estimates
assume the current dirty worktree's other lanes land or quiesce; co-dirty
collisions add review time, not rework.

## 5. Completion Gate

The program is complete only when: all twelve waves' exit criteria hold
with evidence; PLAN.md's Completion Gate passes; `pnpm check:llm-operability`,
`pnpm typecheck:all`, `pnpm test`, and `cargo check --workspace` are green
on a quiesced tree; every intentional compatibility layer is documented or
deleted; and the final requirement-by-requirement audit (restructure plan
Remaining Workstream 8) is recorded in CHANGELOG with unresolved external
prerequisites listed separately. No wave is marked complete from build
success alone.
