# Target Structure Finalization

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-15
Extends: `docs/plans/monorepo-restructure-2026-07-08.md` (Appendix B and
`docs/agent-context/repo-map.json#workspaceUnits` remain the unit-disposition
source of truth)
Related:
`docs/research/competitor-capability-session-architecture-2026-07-15.md`

## 1. Purpose And Ruling Summary

The founder produced a July 2026 research corpus proposing agent-native
repository architectures:

- R1 — July 2026 application-layer inventory (Claude/ChatGPT suite taxonomy,
  `ReferenceHarness`).
- R2 — Greenfield reference architecture (context-bounded "cells", contract
  manifests, dual render/runtime engines, screen-scoped BFF contracts).
- R3 — Adversarial runtime showdown (delete Node/pnpm/Turbo/Next/React/Tauri/
  Neon; Bun build island; Rust-only authority; Redpanda/Scylla/`agi-logd`
  event fabric; SUIR/Web Components; CUE/TLA+ doc authority).
- R4 — TADD-AIWS-001 (moderate variant: keep Node/pnpm/Turbo/Next/Tauri
  pinned; cells with `INTERFACE.json`, archlint, token budgets).

Plus repo-internal inputs: `outputs/AGI_Architecture_Decision_Matrix_2026-07-14.csv`
(DM, 25 rulings), `outputs/repo-audit-appendices-2026-07-14/` (triage queues,
not remediation), and the in-repo competitor research (CC).

This document is the final ruling that reconciles that corpus against repo
reality. The ruling in one paragraph:

> The macro structure is already finalized and stays exactly as locked in
> `PLAN.md` and `monorepo-restructure-2026-07-08.md`: `apps/` (six surfaces),
> `packages/` (+ `packages/providers/*`), `crates/`, `services/`,
> `infrastructure/` (sandbox renderer), `apps/web/db/neon`, plus a new guarded
> `tools/` root landing in M7. The research corpus is adopted as a
> **discipline layer** (session taxonomy contracts, one versioned event
> envelope, server-authoritative capability manifests, vendor-type isolation,
> machine-readable unit manifests, boundary gates) and **rejected as a stack
> replacement** (no Bun, no Web Components/SUIR, no Tauri removal, no
> Redpanda/Scylla/`agi-logd`, no per-cell Bazel, no 3,200-token hard budgets).
> Every rejection is recorded with the adopted discipline that captures its
> intent, so future sessions do not relitigate without new evidence.

## 2. Authoritative Checkpoint (verified against code, 2026-07-15)

Two axes run in parallel; both statuses below were verified this session
(worktree inspection, Cargo manifests, importer counts), not read from docs.

Mechanical waves (move/rename only, single worker, serialized):

- M0–M5 — DONE (2026-07-15): graph repair; `client-runtime` and
  `desktop-command-client` renames; `cloud-contracts`/`licensing` ownership;
  `artifacts`/`sync` extraction; `trust-boundaries`/`routing`/`search`
  facade split.
- M6 — PENDING: six Rust microcrate merges (async-utils, utils-string,
  utils-template into protocol; utils-cache into utils-image; utils-home-dir,
  utils-rustls-provider into network-proxy).
- M7 — PENDING: add guarded `tools/` root; move `services/skill-vetting`
  (Python CLI, not a pnpm member) to `tools/skill-vetting`.
- M8 — PENDING: delete `packages/services` and `packages/stores` facades.
  Verified today: `packages/services` already has zero external importers;
  `packages/stores` is a passthrough to `packages/artifacts`. M8 still
  requires one full green CI/release cycle first, per its locked rule.

Architectural phases:

- P0 hygiene — DONE. P2 one TS ai-client — DONE (web is the only TS surface
  executing providers in-process; mobile rides `services/api-gateway`).
  P3 UI layering — DONE (`apps/web/components/ui/` no longer exists; web
  imports `@agiworkforce/ui` in ~128 files; the known-flaws row
  `DESKTOP-WEB-UI-PRIMITIVES-DUPLICATED-01` is stale, see §7). P5 data seam —
  DONE (RLS migration `0054` landed; live Neon probe remains external).
- P4 Rust engine — HALF DONE. `agiworkforce-{llm,agent-core,mcp}` exist and
  both CLI and Desktop declare them in Cargo. Remaining: delete Desktop's
  ~201 twin files (`core/llm` 69, `core/mcp` 30, `core/agi` 71, `core/agent` 31) through the staged c2/c3/c4/d2/e2/b2 adoption, and make
  `apps/cli/src/exec_policy.rs` consume `agiworkforce-execpolicy` (the crate
  dep is declared; the local file uses none of it — `EXEC-POLICY-DUP-01`
  still real).
- P1 dead code — RESIDUAL ONLY (most targets superseded or already gone;
  verified remaining: `apps/web/src/` orphan tree,
  `apps/desktop/src-tauri/test.db`, dead agent-mode trio, three dead v3
  barrel exports, `SearchModalCmdK`). P6 mobile SLM + iOS canonical path —
  PENDING. P7 enterprise Local — PENDING (design doc first).

Coordination notes discovered during verification:

- `PLAN.md` "Exact Resume Point" was stale (claimed M0-only); corrected in
  the same change as this document.
- `TODO.md` is deleted in the dirty worktree (tracked at HEAD). Restoring is
  a founder call because the deletion's intent is unknown — surfaced, not
  auto-restored.

## 3. Final Target Structure (locked)

No top-level changes beyond M7's `tools/` root. Final state after M6–M8:

```text
agiworkforce/
├── apps/                      # six surfaces only: web, desktop, mobile,
│   │                          # cli, extension, extension-vscode
│   └── web/db/neon/           # canonical migrations
├── packages/                  # 25 shared TS packages after M8
│   └── providers/             # 14 adapters + factory (leaves stay behind
│                              # @agiworkforce/providers-factory)
├── crates/                    # 13 Rust crates after M6 merges
├── services/                  # api-gateway, signaling-server (coarse until
│                              # scaling/security evidence demands a split)
├── infrastructure/            # sandbox (web-owned cross-origin renderer)
├── tools/                     # NEW in M7: skill-vetting (guarded root)
├── docs/  scripts/  patches/  examples/  ios/   # ios/ until P6 decision
└── root control docs per docs/engineering/naming-conventions.md
```

Rules that finalize the shape (all pre-existing, now confirmed final):

- A package exists only with one responsibility and ≥1 real consumer; no
  empty scaffolds (abstraction-tax anti-goal, shared-packages decision log).
- New domain contracts grow inside `packages/types/src/` (sessions,
  capabilities, agents, tools, work, research, schedules — CC §7 tree) and
  `packages/cloud-contracts`; they do not spawn new packages until a second
  consumer exists.
- Name freeze: `llm-runtime` and `llm-normalize` keep their names. DM #10's
  residual renames (`provider-runtime`, `provider-protocol`) are DEFERRED —
  two of five proposed renames already landed under better names
  (`client-runtime`, `desktop-command-client`), and cosmetic churn now costs
  more than it clarifies. Revisit only after M8, founder-approved.
- The Rust-vs-TS twin engines (`agiworkforce-llm` vs `packages/providers` +
  `llm-runtime`; `agiworkforce-mcp` vs `packages/mcp`) are INTENTIONAL — two
  runtimes, one contract. Convergence is by shared golden fixtures and the
  ts-rs one-way generation (`agiworkforce-protocol` → `packages/types`),
  never by merging languages or hiding one behind the other.
- Model knowledge: hand-edit only `packages/model-registry/catalog/
models.curation.json`; `packages/types/src/models.json` and the Rust
  registry are generated read paths.

### 3.1 Scale test against the full application-layer inventory (R1)

The founder's target scope is the COMPLETE July 2026 ReferenceHarness
inventory (the union of the Claude and ChatGPT suites: Cowork/Work, Sites,
Canvas, remote sessions, schedules/triggers/monitors, connectors/plugins/
skills catalogs, office and messaging channels, admin console, memory,
voice, org administration, full metering). The structure is sized for that
scope because it is a GROWTH GRAMMAR, not a fixed inventory:

- Features are rows in `docs/current/parity-implementation-matrix.md`;
  structure only has to guarantee every row an unambiguous owner. R1's own
  closing section (NonpublicInternals) states that vendor service names,
  queue/deployment topology, and internal packages "should be implemented
  as interchangeable modules behind the ReferenceHarness rather than copied"
  — the inventory itself forbids treating its Backend list as a directory
  or deployment map.
- Block-by-block owners, current → at-scale: Conversation/Projects/Memory/
  Files/Sharing → web features + `cloud-contracts` + `types` contracts,
  extracting per-domain packages on second-consumer demand. Agent block
  (loop, subagents, checkpoints, backgrounding, compaction) →
  `agiworkforce-agent-core`/`app-server` + the WorkSession/event-log
  contracts (§4.1). Schedules/Triggers/Monitors → the schedules lane +
  `automations` contracts; a `services/workflow-worker` splits out on load
  evidence. Creation (Documents/Sites/Canvas) → `artifacts` +
  `unified-chat` renderers + `infrastructure/sandbox`; Sites publishing
  becomes a service when it exists. Connector/plugin/skill catalogs →
  `mcp`/`skills` + a `packages/connectors/*` subtree on the proven
  `providers/*` fleet pattern. Metering block → usage ledger + `routing`
  pricing + Stripe adapter. Admin/SCIM/SSO/RBAC/audit → enterprise types +
  gateway + P7.
- Surface growth beyond the six is ADDITIVE under the same roots and does
  not bend the shape: OfficeAddin → `apps/office-addin`; MessagingBot →
  `services/messaging-bot`; Developer/Admin console → web routes first,
  `apps/console` when it earns separation; **public SDKs → generated from
  the contract layer** (the ts-rs/OpenAPI bridges), landing as
  `packages/sdk-*` when the first external developer exists — decision #7
  ("SDKs are adapters, not architecture") already anticipates this. The
  six-surface list is a sequencing decision (#20), not an architecture
  ceiling.
- Service-split triggers stay evidence-based (independent scaling by an
  order of magnitude, distinct trust boundary or residency, distinct
  availability objective) — the same rule OpenAI and Anthropic visibly
  apply: both ship this entire inventory from pragmatic repositories
  (codex: two primary workspaces; §4.4).

Capacity check: the grammar grows ~40 owned units to 100+ (connector fleet,
domain contract packages, new surfaces, split services) with zero top-level
changes, because `providers/*` already proved the fleet-subtree pattern and
`types`/`cloud-contracts` already prove the contracts-first pattern.

### 3.2 T-wave — adopt the founder's reference grouping (decided 2026-07-15)

Founder decision: the repo adopts the reference tree's ORGANIZATION — its
grouped `packages/` taxonomy, machine indexes, named future services, and
supply-chain files — while keeping the already-rejected parts out (per-cell
envelope files, token-budget gates, stack swaps). Three tiers:

Immediate (lands with discipline wave 1, no moves):

- `docs/agent-context/generated/` machine indexes, generated not
  hand-written: `dependency-graph.json` (from `turbo --dry=json` +
  `cargo metadata`), `module-summaries.json` (one summary per workspace
  unit), `contract-registry.json` (schema/contract inventory) — the
  reference's `.agent/generated/` content in the repo's canonical
  agent-context home.
- Rust supply-chain files from the reference root: `deny.toml` +
  `cargo-deny` in CI (advisories, licenses, source policy) and
  `rust-toolchain.toml` (pinned toolchain).
- Future deployable names locked to the reference vocabulary so growth is
  pre-named: `services/workflow-worker`, `services/projection-worker`,
  `services/billing-worker`, `services/artifact-publisher`,
  `apps/local-runtime-daemon` (the shared local daemon direction the CC
  research already prescribes), `apps/console` (admin). Each is created
  only at its §3.1 split trigger.
- `tests/` root for genuinely cross-surface conformance suites
  (model-conformance, provider-replay, sync-conflict, migration) as the
  discipline-wave fixtures land — already anticipated by PLAN.md's target
  meaning.

T-wave (mechanical move wave, runs immediately after M8 so 39 single-owner
packages move exactly once): regroup `packages/` into the reference
taxonomy, preserving package names, with a per-unit manifest approved like
Appendix B. Draft bucketing (final map is the wave manifest):

```text
packages/
├── contracts/     types · cloud-contracts · trust-boundaries · licensing · compliance
├── ai/            providers/* (factory + 14) · llm-runtime · llm-normalize ·
│                  routing · model-registry · search
├── client/        client-runtime · desktop-command-client · sync
├── ui/            design-tokens · ui · unified-chat
├── tools/         mcp · skills · apply-patch · browser-tool
└── platform/      data-layer · local-llm · artifacts · utils
```

Turbo boundary tags mirror the group names, making the taxonomy enforced,
not decorative. DM #10's residual renames (`llm-runtime`→`provider-runtime`,
`llm-normalize`→`provider-protocol`) MAY ride the same wave under the
breaking-change window if the founder confirms them in the wave manifest.
Gates: the full Appendix B5 list; move-only, no behavior changes.

Not adopted from the reference (unchanged rulings, §4.7): per-cell
`RULES.md`/`INTERFACE.json`/`CONTEXT.lock.json` envelopes (nested
`AGENTS.md` + `workspaceUnits` carry that content), hard token budgets, new
root control docs (`MODULE_INDEX.json`→`repo-map.json`,
`ARCHITECTURE.md`→`docs/current/technical-architecture.md`), separate
`generated/`/`schemas/` roots (generated code stays with its owning
package under the existing generated-artifact guard), and the app-splits
that duplicate existing owners (`cloud-runtime`, `cloud-gateway`,
`inference-worker-*`) until their §3.1 triggers fire.

## 4. Research Corpus Adjudication

### 4.1 Adopt (the discipline layer)

1. Discriminated session taxonomy (R2 "sessions are not a universal
   conversation database"; CC §4.2). Owner: `packages/types/src/sessions/`
   with execution location, storage scope, trust boundary, host identity,
   capability snapshot, retention, handoff eligibility. First consumers: the
   session-taxonomy P0 in CC §9 (split Chrome from developer surfaces).
2. One versioned agent event envelope (R2 §2.12; CC §6.3 "multiple
   dialects"). Owner: `crates/agiworkforce-protocol` + ts-rs generation into
   `packages/types`. The repo's existing one-way codegen IS R2's
   "GeneratedBridges" rule — extend it; do not add a second schema system.
3. Server-authoritative capability/tool manifests and capability honesty
   (R2 FailClosed; CC §2). Already a critical rule; the six-app report's
   cross-surface finding A (no effective-capability handshake) is the
   implementation gap to close.
4. Durable WorkSession / run / append-only event + usage ledger (DM rows
   1–8, 12 — all Adopt P0), implemented ON NEON (locked decision #17):
   append-only tables + RLS + idempotent settlement, extending the durable
   credit-settlement work that already landed. A workflow-engine seam stays
   behind a service module (DM #2 Temporal "after contract stabilization").
5. Vendor-type isolation (R2 NoVendorTypes; decisions #7 and #12 already
   say it). Provider SDK and wire types must not escape
   `packages/providers/*` / `agiworkforce-llm`; add the guard in §6.
6. Machine-readable unit manifests: EXTEND
   `repo-map.json#workspaceUnits` (purpose, trustZone, sideEffects fields)
   instead of creating 64 `INTERFACE.json` files. One map, already guarded,
   already consumed by agents.

### 4.2 Already in flight or done (no new work created by the corpus)

Single TS ai-client (P2), UI layering (P3), Rust engine convergence (P4,
half done), data-layer/RLS (P5), Turbo task graph (DM #16), affected-only CI
(DM #17), Chrome/VS Code thin-client over the CLI engine (CC §6.3 "strongest
seam"), trust-mode enforcement layers (mobile egress guard as reference).

### 4.3 Adapt (changed form, same intent)

- Context budgets: R3's own correction stands — per-directory token caps are
  wrong; task closure is the quantity. Adopt as ADVISORY guidance in
  `docs/agent-context` (target ≤ ~24k-token task closure per lane change),
  never a blocking gate.
- Turbo boundaries/tags: ADOPT in discipline wave 1 (upgraded from
  "evaluate" after the 2026-07-15 external evidence check, §4.4). Tag each
  package by layer (`contracts`, `ai-client`, `product-ui`, `platform`,
  `surface`) and encode the existing layer rules as `boundaries.tags`
  allow/deny lists in `turbo.json`. The feature is experimental upstream
  (open RFC), so the custom guards remain authoritative; tags are a
  config-only supplementary gate.
- Nested `AGENTS.md` expansion: the industry-standard form of R2's
  per-cell `RULES.md` is the nested `AGENTS.md` convention (open agents.md
  format, 60k+ projects, supported by Codex/Copilot/Gemini tooling). The
  repo already has the root file plus eight path-scoped files; discipline
  wave 1 adds path-scoped `AGENTS.md` to the highest-churn shared packages
  (`providers`, `llm-runtime`, `llm-normalize`, `unified-chat`,
  `model-registry`, `cloud-contracts`) instead of inventing a parallel
  manifest format.
- Public-API snapshots (R2 PublicApiDiff): pilot `api-extractor` /
  `cargo public-api` on three canonical units only (`llm-normalize`,
  `cloud-contracts`, `agiworkforce-protocol`) after M8; expand on evidence.

### 4.4 External evidence check (2026-07-15, re-verification pass)

Requested by the founder; sources fetched live. Findings that bear on this
ruling:

- Shipping AI-suite monorepos are consolidation-shaped and mostly COARSER
  than this repo: openai/codex (two primary workspaces `codex-cli` +
  `codex-rs`, plus `sdk/`, `tools/`, root `AGENTS.md`; Bazel coexists with
  pnpm), block/goose (`crates/` + `ui/` + `services/`, root `AGENTS.md` +
  `CLAUDE.md`), google-gemini/gemini-cli (seven packages total),
  continuedev/continue (`core`/`gui`/`extensions`/`packages`). None uses
  per-cell `INTERFACE.json`, `RULES.md` envelopes, or per-directory token
  budgets. codex's `tools/` root independently corroborates M7.
- Nx's own granularity guidance (nx.dev "Project Size") states both sides:
  more projects improve affected-command precision and tag constraints, but
  "every new project adds folders and configuration files that are not
  directly contributing to business value," and rapidly evolving code should
  live in one project "to allow a real architecture to emerge," splitting
  "once the pace of change has slowed." That is this plan's second-consumer
  rule stated by the industry's strongest pro-granularity authority.
- Turborepo Boundaries (tags + allow/deny rules) is a real shipped command
  but marked Experimental with an open RFC — adopted here as supplementary
  (§4.3), not as the authoritative gate.
- zed-industries/zed maintains dozens-to-hundreds of function-scoped crates,
  each with real consumers: fine-grained Rust decomposition is healthy and
  cheap, which supports the P4 shared-engine crates and confirms M6 only
  merges crates whose sole flaw is having one consumer and no boundary.
- The nested `AGENTS.md` convention (agents.md, 60k+ projects) is the
  industry's actual mechanism for per-directory agent rules; no meaningful
  adoption of `INTERFACE.json`-style cell manifests or hard per-module token
  budgets was found — context budgets appear only as harness-runtime
  concerns, not repository-structure gates.

Consequences applied: Turbo boundaries upgraded to adopt (§4.3); nested
`AGENTS.md` expansion added (§4.3). The flat-vs-grouped `packages/` question
was initially ruled flat from a four-repo survey; SUPERSEDED 2026-07-15 by
founder decision plus the correction that Nx-ecosystem monorepos routinely
group libraries into domain folders — the grouped layout has real precedent
and the repo itself already proved the nested pattern with
`packages/providers/*`. The regrouping is adopted as the T-wave (§3.2).
All other rulings stand unchanged.

### 4.5 R5 adjudication (Critical Stack Risk Assessment, pasted 2026-07-15)

The founder's fifth research document (model-landscape audit, dual-mode
execution matrix, zero-hallucination boundary pipeline, capability
certificates, unit-economics formulas) adjudicates as follows:

- ExecutionProfile — one visible Local/Cloud toggle resolving five internal
  planes (identity, data, inference, tools, workflow) — ADOPT as a contract
  in `packages/types/src/sessions/` during discipline wave 1. Desktop's
  runtime composition root and Mobile's appMode-plus-egress-guard stack are
  the existing implementations; the contract names what they already do and
  extends it to every surface.
- Capability negotiation with task-declared MANDATORY requirements the model
  cannot weaken — ADOPT into `packages/routing` admission (which already
  does trust/capability-aware model admission); the addition is the
  task-envelope requirement list evaluated before context compilation.
- Hardware classes (edge-mobile, edge-laptop, sovereign-workstation,
  sovereign-cluster) and digest-bound model capability certification
  (weights/quantization/tokenizer/template/runtime) — ADAPT into the
  existing `model-registry` catalog and `local-llm` tier gates: the catalog
  already carries checksums, licenses, and RAM gates for local models (P6
  checklist); certification becomes catalog fields plus conformance
  fixtures, not a new service. Advertised context = certified context on
  the selected hardware, never the family marketing maximum.
- "Zero hallucination at the system boundary, not inside the model" and the
  micro-tool inventory (search/fetch/exec/patch/browser as infrastructure,
  never model-weight claims) — ALREADY THE REPO'S ARCHITECTURE: the LLM
  Failure Prevention Rules, capability honesty, `search`/`browser-tool`/
  `apply-patch`/`mcp`/`skills` packages, and the E2B flag gate are exactly
  this. License sovereignty likewise: the curation gate already blocked a
  research-licensed model, and `licensing` owns policy.
- PatchPlan-style typed mutation (staged worktree, per-file expected hashes,
  registered verification IDs instead of model-chosen shell commands) —
  PARTIAL ADOPT, deferred to the agent-harness backlog: `apply-patch` plus
  desktop approval/sandbox staging cover the substrate; the registered
  verification-ID gate lands when AGI's own agent products need arbitrary
  repo mutation (trigger: AGI Work code-execution GA).
- Quality-adjusted routing economics (accepted-task cost including retry,
  escalation, and human-rework terms; break-even utilization) — ADOPT as
  the target data model for `routing` pricing evolution after discipline
  wave 1; unit-economics doc is the home for the formulas.
- The financial correction (savings bounded, no infinite-margin claims;
  sovereignty as FCFF delta) — recorded; consistent with the GTM thesis of
  competing on trust/portability, not on owning frontier models.

### 4.6 R6/R7 adjudication (UI-isolation audit + second runtime showdown, pasted 2026-07-15; researched rulings)

Founder directive: research the answers, then decide. Evidence fetched live
2026-07-15; the four rulings:

1. UI horizon — REACT/NEXT STAYS CANONICAL. Evidence: Zed paused GPUI (its
   custom Rust UI framework) in 2026 to "focus on business relevant work" —
   a funded specialist team shelved exactly the renderer path R6 prescribes;
   server-driven UI in production (Airbnb/Lyft/Netflix/Shopify) is a mobile
   release-cycle tool rendered through native components, never a
   web-canonical replacement; claude.ai ships on Next.js; LLM codegen
   quality tracks training-data density, which React dominates. ADOPTED from
   R6: typed view-model/presentation contracts, capability-gated action
   manifests, bounded/coalesced UI streams, no provider/DB imports in UI
   (already guarded). SUIR recorded as a trigger-gated option — trigger:
   measured agent task-closure data across 20+ screens demonstrating the
   claimed context reduction, plus a dedicated UI-platform lane.
2. Data plane — NEON STAYS AUTHORITATIVE (decision #17 reaffirmed);
   Cloudflare R2 ADOPTED as the immutable object/blob seam (zero-egress
   economics for generated files, artifacts, model assets) when the
   artifact/file-storage infra work lands, behind an object-store port.
   R7's `agi-logd` consensus log recorded as a scale-triggered seam —
   triggers: multi-node managed execution fleet, or sustained event-write
   rates approaching the measured Postgres ceiling. The Postgres-vs-Kafka
   literature consensus: start with Postgres, move when scale demands.
3. Execution/commit policy while founder is away: execute the full locked
   sequence; commit a wave only when the staged file set is verifiably
   100% this session's work (the worktree carries ~1,500 dirty paths from
   other lanes; files co-dirty with other lanes stay uncommitted).
4. DM #10 residual renames CONFIRMED to ride the T-wave
   (`llm-runtime`→`provider-runtime`, `llm-normalize`→`provider-protocol`).

Also adopted from R6/R7 into existing workstreams: fail-closed execution
controller semantics (terminal states COMMITTED/REJECTED/QUARANTINED/
BUDGET-EXHAUSTED; never auto-retry unknown external effects) into the
discipline-wave WorkSession contracts; view-patch epoch/sequence/hash
validation into the sync/artifact contracts; the mobile honesty renames
(background work = deferred outbox, foreground-only inference) already
match locked mobile architecture. Rejected unchanged: deleting
pnpm/Turbo/TS from production paths (web IS a production TS path), CUE/
TLA+ as documentation authority, wgpu/terminal renderers, Tauri removal.

### 4.7 Defer (recorded, revisit trigger named)

Kubernetes, Bazel, broad microservices (DM #18–20 — revisit at scale
evidence); LiteLLM, Langfuse, Firecracker/Daytona sandbox backends (DM
#21/22/24 — evaluate lanes); Temporal (DM #2 — after WorkSession contract
stabilizes); residual package renames (DM #10 — after M8, founder call).

### 4.8 Reject (with the adopted discipline that captures each intent)

1. Replace pnpm/Node with Bun; delete root `package.json`/`turbo.json` —
   REJECT. pnpm/Turbo just carried M0–M5 and the guard suite; the captured
   intent (hermetic, deterministic builds) is served by frozen-lockfile CI
   and the Turbo graph.
2. Delete Next.js/React for Web Components/SUIR — REJECT. Collides with the
   shipping web surface, shared-packages mandate, and P3's completed
   layering. Captured intent (screen-scoped contracts, no domain types in
   UI) → presentation contracts in `unified-chat`/`cloud-contracts` and the
   boundary guards.
3. Delete Tauri / external-daemon-only desktop — REJECT. Desktop is one
   Tauri app by locked decision; the 366-command IPC surface is typed via
   `desktop-command-client`. Captured intent (renderer is not the runtime;
   minimal bridge) → P4 completion moves engine code into shared crates, and
   `agiworkforce-app-server` remains the programmatic seam.
4. Neon → Redpanda/Scylla/`agi-logd` event fabric — REJECT. Decision #17
   locks Clerk+Neon; RLS and durable settlement just landed; pre-launch
   scale does not justify a consensus log we would operate alone. Captured
   intent (append-only truth, idempotent effects, replayability) → §4.1
   item 4 on Neon, with the workflow seam preserved.
5. Per-cell Bazel, 3,200-token hard budgets, 64 `INTERFACE.json` envelopes,
   CUE/TLA+ as documentation authority, generated-only `AGENTS.md`/
   `CLAUDE.md` — REJECT. The repo already has one machine-readable map, one
   guard suite, and mirrored-rule enforcement; duplicating authority
   violates its own single-source rules. Captured intent → §4.1 item 6 and
   §4.3.
6. "One cloud/local runtime implementation" — REJECT (DM #25, verbatim):
   Local, BYOK, and Managed Cloud are separate trust boundaries and require
   adapters, not hidden routing.

## 5. Integrated Execution Sequence

Ordering respects: mechanical waves single-worker serialized; behavior lanes
parallel with disjoint write sets (`docs/agent-context/lanes.json`); no move
mixed with behavior change; serial-by-surface for feature work (Mobile
active, decision #20).

Two standing directives (founder, 2026-07-15 — optimize for the 10–20 year
horizon, not demo velocity):

- BREAKING-CHANGE WINDOW OPEN. The product currently has zero users other
  than the founder. Internal contracts, wire formats, DB schemas, and
  identifiers are fixed TO THEIR FINAL SHAPE with no compatibility shims,
  deprecation windows, or dual-write paths (external provider/App Store/
  Stripe contracts excluded). Where the 2026-07-14 audits found dual systems
  (provider-stream request/auth mismatches, artifact publish contract,
  API-key format duality, two org-membership systems, schedule-table
  vocabulary), the resolution is: pick the canonical shape, migrate the one
  database, delete the loser. This window closes at first external user.
- CONTRACTS BEFORE PARITY BREADTH. Durable-contract work (§4.1 items 1–4,
  the capability handshake, provider/billing correctness) outranks new
  parity-feature surface area, which stays paused until discipline wave 1
  lands — the six-app report's own conclusion ("build durable task/run/event
  primitives before adding more parity UI").

1. Lane 0 — coordination hygiene (integrator lane, this session): this
   document; `PLAN.md` resume-point correction; surface `TODO.md` worktree
   deletion to founder; log the WebAppShell mobile P0 into known-flaws and
   reconcile the stale rows in §7.
2. Frontend handoff P0s (behavior lanes, from
   the retired 2026-07-15 frontend/restructure handoff §12–13): VS Code
   disabled-option guard (intentional RED at
   `webviewContent.webview.test.ts:180`) plus attachment-chip host-deletion
   contract; `WebAppShell` responsive drawer with TDD and rendered checks at
   320/390/768/desktop.
3. M6 → M7 → M8 (mechanical, in order, per-wave gates from Appendix B5),
   then the T-wave (§3.2) — regroup `packages/` into the reference taxonomy
   once every unit has a single owner and the facades are gone.
4. P4 residual (desktop-native lane): staged deletion of the ~201 desktop
   twin files onto the shared crates; CLI `exec_policy.rs` onto
   `agiworkforce-execpolicy` (`EXEC-POLICY-DUP-01`).
5. P1 residual sweep (small PRs, after M8 so facades go first):
   `apps/web/src/`, `src-tauri/test.db`, dead agent-mode trio (delete
   `unified-chat` `agentModeStore` + `AgentModeSwitcher` and desktop
   `features/chat/AgentModeSwitcher`; keep web's live composer switcher),
   v3 dead barrel exports (`AgiWorkHome`, `CodeModeHome`, `AgiWorkDispatch`
   only — siblings are live), `SearchModalCmdK`.
6. Discipline wave 1 — session taxonomy + event envelope contracts (§4.1
   items 1–3), then the CC §9 P0 list (tenant-bound ComputeSession, one
   event protocol, capability handshake).
7. Provider/billing correctness lane (handoff §6): Anthropic `refusal` stop
   reason; `post_promo_prices` consumption in `managedUsageBilling` and
   `llm-cost-calculator`; stale refund test onto `settleCreditsDurably`;
   OpenAI Responses-native hosted tools through the harness.
8. P6 (mobile SLM per §8 of the restructure plan + iOS canonical path),
   then P7 (enterprise Local design doc first).
9. Web domain-first internal move (F5 sprawl: 103 `app/` entries, 81 `lib/`
   dirs, 157 API routes) — LAST move wave, after M8, own approved manifest.

## 6. Guardrail Additions (land with discipline wave 1 unless noted)

- Vendor-type leak gate: extend `check:boundaries` so provider SDK/wire
  types cannot appear in exports outside `packages/providers/*`,
  `packages/llm-normalize` internals, and `crates/agiworkforce-llm`.
- Facade-zero gate (land with M8 prep): `packages/services` and
  `packages/stores` must keep zero external importers until deletion.
- `workspaceUnits` field extension: `purpose`, `trustZone`, `sideEffects`
  per unit; completeness enforced like `MAP-COMPLETE-01`.
- Public-API snapshot pilot (§4.3, three units, after M8).
- Advisory task-closure report (optional, lowest priority): measure the
  token closure of each lane's typical change; publish in
  `docs/agent-context`, no gate.

## 7. Reconciliations To Apply

- `PLAN.md` Exact Resume Point — corrected alongside this document
  (M0–M5 done; M6 next mechanical wave).
- `TODO.md` — deleted in worktree while tracked at HEAD; restore (founder
  confirm) and refresh its stale header in the same change.
- `docs/agent-context/known-flaws.md` — add the WebAppShell mobile-shell P0
  (handoff §10; evidence `/tmp/agi-web-mobile-projects.png`); mark
  `DESKTOP-WEB-UI-PRIMITIVES-DUPLICATED-01` web-side Fixed (verified: no
  `apps/web/components/ui/` remains); re-verify `EXEC-POLICY-DUP-01`
  wording (crate dep declared, local file still unused — still Open).
- `monorepo-restructure-2026-07-08.md` §3 tree shows `apps/sandbox`;
  superseded by `infrastructure/sandbox` (Appendix B + repo-map win; note
  only, no edit required by this ruling).
- 2026-07-14 audit CSVs (`outputs/`) are triage queues: rows verified stale
  today include C-024 (CLAUDE.md exists) and R-019 (Nx superseded by adopted
  Turborepo); re-verify each row against current code before acting.

## 8. Verification

- This change: `pnpm check:agent-context`, `pnpm check:doc-status`,
  `pnpm check:repo-organization`, `pnpm check:structure-conventions`.
- Every mechanical wave: the Appendix B5 gate list, unchanged.
- Discipline wave 1 adds: contract tests for session taxonomy + event
  envelope in `packages/types`/`cloud-contracts`, ts-rs regeneration drift
  check, and the new boundary gates in §6.
- Completion of the overall restructure remains governed by `PLAN.md`'s
  Completion Gate — this document does not soften it.
