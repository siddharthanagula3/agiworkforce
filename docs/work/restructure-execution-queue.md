# Restructure execution queue

Status: Current
Owner: Founder
Last updated: 2026-08-28

Split out of root `PLAN.md` on 2026-08-28. `PLAN.md` keeps the standing
strategy and phase structure; this file carries the dated queue, which is
expected to go stale and be deleted when the phase closes.

## Frontend UI/UX redesign — phase state

Approved 2026-08-30. Resume from `Current phase` after any interruption.

| Phase | Scope                                                                   | State              |
| ----- | ----------------------------------------------------------------------- | ------------------ |
| 0a    | Shipping token defects, css-token guard blind spot                      | Done — `e4a11b4fa` |
| 0b    | Legibility ratchet guard, theme completeness                            | Done               |
| 1     | Token layer: one namespace, type scale, spacing, radii, z-index, motion | Next               |
| 2     | Primitive adoption; resolve the four forked components                  | Pending            |
| 3     | App shell, navigation, footer                                           | Pending            |
| 4     | Auth, pricing, upgrade, billing                                         | Pending            |
| 5     | Marketing page families                                                 | Pending            |
| 6     | Docs as a product                                                       | Pending            |
| 7     | Shared runtime convergence, block streaming, citations, workbench       | Pending            |

### Codex browser-audit remediation (2026-08-30)

Report: `~/.codex/visualizations/2026/08/30/01a05512-999f-7b00-85c2-e3b39e37b07a/chat-audit/FINAL-AUDIT.md`

Fixed and browser-verified: R1 lossy Formatted view, R2 code-copy `[object Object]`,
R3 mermaid raw/dropped, T1 false tool completion, MAP1 wrong-continent route,
I1 relative share URL, S1 blank mobile drawer, DR4 sources-sheet focus escape,
M8 connectors table off-viewport at 320px, M9 connector Add menu clipped.

M3 (drawer children off-canvas after a route change) does not reproduce: the S1
root-cause change fixed it too. Verified at 320px on Library, Projects, Tasks,
Schedules and `/chat/code` — panel at x=0..272 with all 102 controls inside it.

Fixed, covered by tests, browser verification still owed: DR1 research fetch
before approval, M1 truncation and seams, M2 stopped labelled complete, F1 one
unreadable attachment destroying the turn, DR3 citations not linked to sources,
G3 "Response complete" announced for a turn that produced nothing. Each is
blocked on the same thing: the QA account's chat request limiter stays tripped
for far longer than the "Resets in 1 min" it reports, and every attempt extends
it. Re-verify these in one batch after a long idle period.

Open P1: A2 interactive artifact stale.

**DR1, DR2 and SK1 are resolved, and DR2 was not what the audit thought.**
Verified against the running product on 2026-08-30:

- DR1: a research turn now stops at `phase: awaiting_approval` with a real
  four-step plan and `searches: 0, sources: 0`. Nothing is fetched before the
  reader approves, and `Start research` runs it.
- DR2: persistence was never broken. The read path returns the right row when
  filtered by conversation, and an approved run wrote its row even on the
  failure path. The audit's urban-tree conversation has **no research metadata
  at all** - its turns carry `tools`, `searchResults` and `thinkingContent`, the
  ordinary chat path. The research loop never ran, so there was never a report,
  and the panel was telling the truth.
  Why it never ran: `researchModeAllowed` needs the routed model to declare the
  `research` capability, and neither `gemini-3.5-flash-lite` nor `gpt-5.6-luna`
  does. The composer correctly disables Deep Research for those - but
  `modelSupportsResearch` short-circuits on `isAutoSelected`, and the disabled
  control's own tooltip says "Choose Auto". Under Auto the router can land on a
  model that cannot research, and the turn silently degraded. The only
  disclosure was a line in the capability preamble asking the model to mention
  it; the observed turn instead produced a confident answer with its own
  bibliography. It now travels on the fallback-reason header.
- SK1: the replay carries `skillName`, so Regenerate reproduces the turn with
  its skill instead of refusing. The skill's body is still never persisted -
  the name is what the send path uses.

Still true and still unexplained: a research run that reaches the loop can end
with `sources: 0` after a search. That is a search-provider question, not a UI
one, and needs a working environment to diagnose.

Open P2: S2 tablet crowding, S3/C1 composer context density, C2 large paste, C3
branch affordance, M3 long-response scale, Q1 clarification as prose, I2 video
failure recovery, G1/G2/G4 generic card language, M2 projects intro column, M4
task identity at 320px, M5 conversation title clipping, M7 search-filter focus,
M11 composer footer rows, M12 skills descriptions, M15 voice card overflow,
H1/H2/H3 short-viewport dialogs.

Not reproduced — record before re-opening:

- F1's `0 B` attachment chip. A genuine 96-byte upload through the composer's
  file input reports `96 B`. The chip reads `File.size` directly, so a zero
  there means the harness supplied an empty `File`. F1's server half was real
  and is fixed.

Found while fixing, not in the audit:

- **Every stored research report has `citations: []` and `sourcesConsulted: 0`
  while its prose cites `[1]`..`[10]`.** The model writes its own bibliography as
  titles with no URLs. Persistence is correct (`sources.toCitations(...)`); the
  source registry is empty by the time it runs. This is the root of DR3 and
  probably of DR2. Needs a live research run to diagnose.
- `MarkdownContent` gave every link `target="_blank"`, so any same-document
  fragment would have opened a blank tab. Fixed.
- Backslash-escaped brackets cannot be used for citation link text: `\[` and
  `\]` are LaTeX display-math delimiters and the math pass consumes them before
  the link is parsed. Use `&#91;`/`&#93;`.
- The server capped every answer at a hardcoded 1,024 output tokens while every
  text model in the catalogue declares 64,000 or more. That is M1's root cause;
  the ceiling now follows the model, capped by an answer-length policy so the
  pre-flight cost reservation stays realistic.

Standing invariants established in 0a/0b, do not regress:

- Three files emit the `--chat-*` contract (`chat.css`, `design-tokens/src/index.ts`,
  `apps/web/app/globals.css`). Guards now catch drift; **Phase 1 must reduce this to
  one owner** rather than leaving the guards to police duplication forever.
- Contrast is validated against every surface a token can land on, not just the page
  background, in both themes, and asserted for all four palettes.
- `scripts/.web-ui-invariants-baseline.json` only shrinks. The redesign is not
  finished while it is non-empty. Track with `pnpm check:web-ui-invariants --summary`.

## Execution Ledger

### Completed And Verified

- Established the generated model registry, schema validation, TypeScript and
  Rust artifacts, runtime profiles, harness metadata, and drift checks.
- Established one Rust app-server developer-session owner for CLI and VS Code,
  with workspace-scoped persistence, turns, streaming, approvals, cancellation,
  and nonblocking MCP discovery status. VS Code now uses a thin typed client and
  one local-runtime process per trusted workspace instead of owning a second
  conversation store, checkpoint manager, or agent loop.
- Established Chrome-owned browser conversation persistence in
  `chrome.storage.local`, separate from consumer app-chat synchronization.
- Added the Turbo task graph, package-owned task commands, affected CI
  selection, and product-specific CLI/Desktop release-tag validation and
  signing paths.
- Replaced Web shipping model routing with the canonical registry-backed
  classifier and resolver; retired the duplicate Web routers in that path.
- Ratified Desktop as one application with isolated runtime/storage/credential
  boundaries and immutable conversation execution modes.
- Migrated Mobile Managed Cloud picker rows, provider roster, canonical labels,
  defaults, and tier fallback to the `mobile/cloud-chat` runtime profile.
- Removed Mobile fake model aliases and the app-owned OpenAI probe default.
- Admitted Mobile managed media routes in the registry and added canonical
  capability fallback from an explicit text model to a specialist image model.
- Added natural-language image dispatch for Mobile new-chat and existing-chat
  entry points and consolidated image-turn state transitions into one shared
  action.
- Moved Auto profile identity/copy to the canonical routing policy, exposed
  Economy/Balanced/Best in both Mobile Local and Cloud pickers, and made Auto
  follow the active conversation boundary instead of forcing Local.
- Routed Mobile Cloud Auto turns through `mobile/cloud-chat` to a concrete
  admitted model while preserving requested/resolved model provenance.
- Verified Mobile server-side web search end to end in code/tests and corrected
  its runtime-profile declaration from `partial` to `implemented`.
- Replaced Mobile Local-store-plus-Cloud-mirroring with a mode-aware repository
  owner; Cloud sends, streaming, approvals, retry, edit, delete, image, and fork
  flows now mutate Cloud state directly while Local remains device-only.
- Removed the Mobile display-time Local/Cloud message union and legacy overlap
  workaround so rendering follows the owning conversation repository.
- Routed Mobile voice through the same canonical chat/media dispatch and gates
  as the composer while preserving the voice contract that waits for the
  completed assistant turn before text-to-speech.
- Added an explicit Chrome-to-Desktop context-review queue with authenticated
  acknowledgement, expiry, malformed-payload rejection, accept/discard, and no
  automatic send or Local-data egress.
- Established server-version compare-and-swap chat, memory, project, and
  settings sync across Web, Mobile, and Desktop, including server-owned clocks,
  append-only message identity, conflict winners, tombstones, in-flight edit
  preservation, strict version validation, and cross-language fixtures.
- Made shared composer drafts conversation-scoped and store-owned so context
  insertion preserves existing work and only the originating send clears it.
- Hardened CLI MCP execution with Local-only stdio transport, discovered-tool
  identity validation, and fail-closed approval for privileged execution.
- Removed the unreachable Desktop v3 private composer family and duplicate
  voice-input store; the shipped Desktop shell has one composer and voice-store
  owner.
- Completed the remaining registry adoption for Web media/reasoning/cache,
  Desktop media/embeddings, Mobile Tier-1 system models, and shared routing
  metadata; corrected catalog-driven video cost reservations.
- Hardened product release workflows, signing/verification contracts, extension
  packaging, and static CI guardrails; remaining release prerequisites require
  external account identities, credentials, or dashboard configuration.
- Removed Desktop's duplicate persisted plan entitlement and made backend auth
  the owner for admission, visible plan, model reloads, and canonical app state.
- Added a shared Rust OpenAI Responses request/stream dialect and routed
  Desktop registry-classified reasoning models through it while preserving
  Chat Completions for chat and OpenAI-compatible providers.
- Applied the persisted Desktop terminal-sandbox policy to LLM-agent terminal
  execution through the canonical native sandbox command builder, without
  weakening the independent tool-approval boundary.
- Consolidated Managed Cloud media requests into shared strict schemas and one
  Desktop native adapter, removing the duplicate direct HTTP implementation
  and preserving registry-selected model provenance across surfaces.
- Replaced API-gateway no-op user scoping with migration-backed PostgreSQL RLS
  on the verified gateway tables, fail-closed identity propagation, named
  allowlisted system clients, and tenant-isolation regression coverage.
- Added durable managed-credit settlement and idempotent reconciliation for
  every post-provider completion path, including retry/recovery classification
  and a one-minute reconciliation schedule.
- Added one Desktop runtime composition root that selects Tauri Local/BYOK,
  admitted Managed Cloud, and browser Web runtimes without weakening the
  existing signed-build/authentication admission gate.
- Added stateful per-turn Auto routing for CLI/VS Code developer sessions,
  prompt-cache route continuity, and ordered provider-distinct fallback output
  in both generated TypeScript and Rust policy consumers.

### Active Workstream

Four non-overlapping lanes are active in parallel:

1. Restore Desktop artifact persistence/reopen fidelity and canonical rich
   type/version ownership through the live shared-chat runtime, including the
   Incognito no-disk invariant.
2. Finish cross-deployable provider-factory ownership for Web and API Gateway
   while keeping authentication, metering, transport, and deployment policy in
   their owning deployables.
3. Execute the remaining mechanical waves M6-M8 in order (M0-M5 completed
   2026-07-15; the Appendix B that recorded them lived in the since-retired
   `docs/plans/monorepo-restructure-2026-07-08.md`, so `CHANGELOG.md` is now the
   record of what those waves landed).
4. Finish the canonical Auto-router migration across Chrome and remaining
   stateful consumer paths, then wire Managed-gateway fallback execution.

### Remaining Workstreams

1. Execute approved renames and moves in the locked M1-M8 mechanical sequence,
   beginning only after M0 is green and repairing imports, manifests, build
   graphs, generated outputs, docs, ownership maps, release automation, and
   intentional compatibility layers after every wave.
2. Consolidate remaining cross-surface provider execution, streaming
   normalization, retries, tool events, citations, usage, and errors without
   hiding provider-native differences.
3. Close remaining managed-cloud deletion and recovery gaps after the verified
   RLS and durable-usage foundations.
4. Consolidate shared cloud artifacts, telemetry, authorization, and account
   policy for Web, Desktop Cloud, and Mobile Cloud after sync lands.
5. Complete code-verifiable Desktop Cloud admission and end-to-end runtime
   wiring while keeping Local and BYOK isolated; signed-build/live-auth proof
   remains a release-environment gate.
6. Complete every classified merge/delete disposition and approved rename,
   repairing
   imports, manifests, build graphs, generated outputs, docs, ownership maps,
   release automation, and compatibility layers.
7. Complete the CI/CD rollout beyond the current Turbo affected graph and
   separate CLI/Desktop release channels: restore a green full verification
   baseline, finish platform signing/notarization, remote caching, migrations,
   observability, security, and recovery for every shipping surface.
8. Run the final requirement-by-requirement completion audit against current
   code and runtime evidence.

## Exact Resume Point

2026-07-16: THE TREE LANDED. The founder authorized commit-sequencing via the
session goal; the ~3,010-file working tree was committed in six reviewed
slices on `chore/repo-restructure-2026-07` (`5b14585dd..c39eba06c`) with the
full gate battery, `typecheck:all` (45/45), `cargo check --workspace`,
`turbo run lint`, `pnpm test` (44/44 tasks, web 4,389 tests), and a
post-commit secret audit all green. Waves W1-W6, W8, W9 (code), W10 (code),
and W11 are landed in history. See the CHANGELOG 2026-07-16 entry.

Remaining program work, in order of dependency:

1. W7 tail (desktop-native lane, in flight): c2c request-parity oracle +
   crate `ChatRequest` extension, then c3/c4 dialect/bedrock swaps, then the
   ~201 twin-file deletion behind a host-owned-file manifest + orchestrator
   review. CLI `exec_policy.rs` → `agiworkforce-execpolicy`.
2. Post-landing one-canonical-owner pass: knip + content-hash dedup sweep,
   web dead-stack archiving per the TODO wiring-gap audit.
3. W12 web domain-first internal move (LAST mechanical wave, after the
   behavior fixes above quiesce).
4. Live-defect closure for enterprise/demo readiness (PlansModal stale CTA in
   flight; star/archive + branch schema fixes; desktop project scoping after
   W7; the 12 stale-model-ID `routing_logic_tests` reds in desktop core/llm).
5. External release gates (founder-run or scheduled, cannot be faked):
   apply+probe the unapplied `apps/web/db/neon` migrations through the current
   head (`0152_restore_null_tolerant_usage_caps.sql` as of 2026-08-28) on prod Neon
   BEFORE merging this branch to `main` — re-read the directory listing rather
   than trusting this number, it moves every time a web slice lands; W7
   live-provider + desktop-device smoke; desktop restart-persistence smoke;
   W10 on-device mobile QA.
6. The final requirement-by-requirement completion audit (Remaining
   Workstream 8) recorded in CHANGELOG with unresolved external
   prerequisites listed separately.

2026-08-01: THE AUDIT-REMEDIATION BRANCH IS PARKED, MEASURED, NOT MERGED.
`fix/audit-remediation-2026-07-25` now carries 47 commits ahead of `main` and
0 behind, tip `07b87a6fd` — 46 remediation commits dated 2026-07-31..08-01 plus
the `chore(deps)` lockfile commit that pairs the working-tree `pnpm-lock.yaml`
with the already-committed `apps/mobile/package.json` swap
(`@expo-google-fonts/newsreader` and `expo-font` added,
`expo-background-fetch` replaced by `expo-background-task`). By slice theme:
30 mobile commits (the brand/UX parity sweep — artifacts in the transcript and
on the cached path, account-security parity with web, archived chats, accent
contrast, reflect and team surfaces), 9 desktop (six of them the MCP work:
protocol-revision negotiation on both the client and our own server, an honest
message when a server speaks only the stateless revision, server-instruction
delivery to the model with a read-and-cap step, and sanitisation extended from
tool descriptions to parameter descriptions; plus the reasoning-effort control,
the dead safety-tab repair, and the isolated wdio build config that desktop e2e
always required), 6 web (upgrade CTA on top plans, artifacts panel lifecycle
and its sandbox CSP, brand shell tokens and the spinning idle mark, managed
code presented as coming soon), and 1 i18n commit naming the schedules surface
identically on every platform.

The evidence battery was run against this tip and is recorded honestly, red
included. Green: `pnpm typecheck:all` 46/46 tasks in 5m20.944s with zero
`error TS`; `cargo check --workspace` clean, zero warnings; every JS/TS surface
passing in isolation — web 4,638, desktop 1,951, mobile 2,316, extension 1,221,
VS Code 727, i.e. 10,853 across the five named surfaces against the
2026-07-26 baseline of 10,272 (+581), and 14,146 passed repo-wide across all 45
turbo test tasks. The aggregate `pnpm test` exited 1, but every failure in it
was a bare 5s timeout under CPU contention from concurrent batteries and every
affected package reran green alone; note `turbo run test` has no `--continue`,
so the first red task cancels the rest and its counts are lower bounds. Red,
and still open: (a) `pnpm check:llm-operability` is 32 of 34 guardrails passing
— `check:mobile-hygiene` and `check:readme-ownership` both fail on the same
three missing files, `apps/mobile/src/features/{archived-chats,reflect,team}/README.md`,
each of which must carry the `Status:`, `Owner` and `Purpose` markers that
Per-directory ownership READMEs were retired on 2026-08-08; this is a regression this branch
introduced and it blocks the pre-push gate. (b) `cargo test --workspace --lib`
is 6,770 passed / 4 failed / 34 ignored across 14 binaries, all four failures
inside `agiworkforce-desktop` and all four reproducing deterministically in
isolation — two effort-catalog assertions in `core::llm` that contradict
the catalog-selected Anthropic balanced model's `supportedEfforts` since
`3044350c5`, and two `v59`
migration tests that expose a real hazard where the `v76` step runs
`CREATE INDEX` against `realtime_metrics` without guarding that the table
exists. All four files are byte-identical between `main` and this branch, so
this is pre-existing `main` breakage surfaced by the battery, not a regression
here — but it does mean the CHANGELOG 2026-07-26 claim of a green
`cargo test --workspace --lib` is stale and must not be re-asserted without
re-qualification. Guardrail count also moved: 34 in the chain now, not the 27
that entry records.

**Correction, 2026-08-24: all four are fixed and no longer reproduce.** The
`v76` migration guard landed in `ab9f8687a3` — `migrations.rs:6103-6114` now
checks `table_exists(conn, "realtime_metrics")` before creating the index
instead of assuming the table, closing the hazard this checkpoint flagged.
The effort-catalog predicates the two `core::llm` tests assert are satisfied
by the current catalog. Verified locally this session: `cargo test -p
agiworkforce-desktop --lib --locked` for
`test_migration_v59_rebuilds_and_redacts_auth_sessions`,
`test_migration_v59_skips_duplicate_hashed_tokens`,
`test_anthropic_effort_is_model_scoped_and_uses_output_config`, and
`test_anthropic_adapter_rejects_disabled_opus_at_max_effort` — all four pass.

Founder decisions standing as of this checkpoint: the branch is **not pushed**
and **no PR is open**, deliberately — origin's copy is an ancestor 280 commits
behind, so a push would fast-forward whenever it is authorized. The full
successor briefing, including tree disposition and the not-run list, is
the 2026-08-01 remediation handoff (retired 2026-08-08; see git history); read it before resuming.
Finally, `TODO.md` was deleted in `906fe5cda`, so this Exact Resume Point
section is now the executable queue — add new work here, not to a new root
control doc.

Active goal (2026-08-01, latest): **six apps, nothing unwired, zero stubs,
zero partial** — the completion standard and its four scope decisions are
recorded in `docs/work/implementation-status.md` §2026-08-01
Completion Standard. Desktop first, then the rest; server contracts get built
on both sides; `audit/inventory.json` is corrected against verified code at the
end and the checker then enforces it.

Founder decisions (2026-08-01, evening): build 11 of the 13 undecided missing
surfaces (all except Finances; Plugins resolves to Connectors permanently) —
the full list with external gates is recorded in
`docs/work/implementation-status.md` §2026-08-01 Founder Scope
Decisions. Additionally: sonnet-5 low/medium effort follows the catalog (tests
updated and green), and the branch is authorized for a plain push to origin
(no PR). Reversed later the same evening: the model picker stays in the "+"
sheet / stacked control row — no always-stacked composer. New top priority
(founder, same evening): desktop Cloud mode presentable at parity with web,
verified manually through the wdio e2e harness — this outranks the remaining
mobile P1/P2 queue and the missing-surfaces program until done.

Same-day update (2026-08-01, post-checkpoint): RED 1 is cleared — `528ba8bc3`
adds the three missing mobile feature READMEs and a fresh
`pnpm check:llm-operability` run exits 0 (34/34), so the pre-push gate is green
again. RED 2 (the four pre-existing desktop cargo failures, including the v76
`realtime_metrics` migration hazard) remains open and is now filed in
`docs/agent-context/known-flaws.md`. The active phase work is mobile parity
against the ChatGPT/Claude iOS reference sets on the founder's Desktop; the
prioritized backlog lives with the session that produced it and lands here as
commits.

2026-08-05: THE ROUTER GETS AN OBJECTIVE — EXECUTIONPLAN AND CPST ARE
SPECIFIED, NOTHING IS IMPLEMENTED. The design spec landed as
`docs/architecture/execution-plan-contract.md` (docs-only slice;
no code, schema, curation, or generated file was touched). It specifies one
`ExecutionPlan` value carrying model snapshot, provider endpoint, reasoning
effort, service tier, execution location, harness version, tool bundle,
retrieval policy, cache policy, verifier, fallback policy, budget, and
approval policy, each mapped field-by-field onto what already exists — the
canonical resolvers (`crates/agiworkforce-model-registry/src/lib.rs`,
`packages/ai/routing/src/auto.ts`), the curation sources
(`packages/ai/model-registry/catalog/routing-policies.json` and
`harnesses.json`, both `schemaVersion: 1`, regenerated only via
`pnpm sync:models`), and the desktop router
(`apps/desktop/src-tauri/src/core/llm/llm_router.rs`). Five of the thirteen
fields already exist in some form and are recorded rather than re-invented;
`executionLocation` is explicitly the one field the plan may never influence,
because trust-mode admission stays the sole authority. It also defines CPST —
total variable cost of attempts plus tools plus retries plus fallback, divided
by tasks that actually succeeded, computed per task family only — and fixes
the six telemetry fields it needs. Eight open questions are recorded as
unknown rather than answered, including which of the two already-diverged
resolvers is canonical, what identifies a model snapshot (the generated
registry exposes only `schemaVersion`, no hash, no `generatedAt`), and the
service-tier vocabulary collision with the existing protocol
`ServiceTier { Fast, Flex }`. The rollout gates in the spec — router p95
around 100ms, router overhead 1-3% of CPST, escalation 5-10%, quality at 98%
of the balanced baseline, no high-risk regression — are labeled in the
document as internal targets that no repo measurement supports yet, not
market facts, and must be re-derived from the first two weeks of real data
before they gate anything. Evidence for this slice: `check-doc-status`,
`check-non-md-artifacts`, and `check-reference-integrity` all pass
(reference integrity 254 known findings, 0 undeclared);
`pnpm check:repo-organization` fails on ten untracked root `.png` files from
other in-flight work, which this slice did not create and did not touch.

Follow-on slices, in dependency order (2 can be built in parallel with 1 but
cannot ship before 4):

1. CPST telemetry fields — LANDED 2026-08-28. `apps/web/lib/cpst-telemetry.ts`
   declares every field below and `0129_cost_event_task_economics.sql` carries the
   columns. Kept for the naming constraint recorded underneath it. Original item:
   Add `taskOutcome`, `retries`, `fallbackUsed`,
   `verifierResult`, `routePlanId`, and `taskFamily` to the existing
   `usage jsonb` on `public.managed_usage_requests`
   (`apps/web/db/neon/0056_managed_usage_request_lifecycle.sql`) through the
   `usage` argument of `finalizeManagedUsageRequest`, the same channel
   `apps/web/lib/services/managed-usage-accounting-service.ts` already uses
   for `accounting`/`reason`/`providerCalls`/`totalTokens`. No migration in
   this slice. Two of the six values already exist in memory and are thrown
   away — `fallbackReason` and `routeDecision.code` in
   `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` — so
   wiring them is a pass-through at the existing reserve/finalize call sites,
   which sit on the hot chat-completions path and must not disturb the
   idempotency-replay or lease-token contracts documented in 0056. The task
   field must be named `taskOutcome`/`task_outcome`: `outcome` is already
   taken by the billing finalization and means "we billed it", not "it
   worked". Scope is managed cloud only — desktop has only a daily cap, CLI
   and mobile have no ledger, and `apps/web/lib/cost-tracker.ts` is in-memory
   and is not a CPST source. Exit: two weeks of rows with a measured non-null
   rate per key and a first per-family CPST baseline.
2. Rules-based eligibility plus a Pareto router, session-sticky and
   escalation-only. Eligibility is the existing hard gate (trust mode,
   runtime profile, tier ceiling, lifecycle, harness allow-list, capabilities,
   context minimum) and is not relaxed; the Pareto step only orders the
   already-eligible set on cost against measured success. Stickiness is
   already policy — `auto.continuity` is all-true in `routing-policies.json` —
   and switching must be escalation-only, up the fallback ladder and never
   sideways, because a sideways move buys nothing and pays the full
   cache-reset penalty that `packages/ai/routing/src/model-switch-cache.ts`
   already prices. Lands in the curation JSON plus both resolvers, or answers
   open question OQ-1 first by nominating one canonical.
3. Eval corpus of 8-12 task families, narrowed from the canonical 11-value
   `RoutingTaskType` taxonomy the policy already uses. Each family needs
   fixed versioned inputs, a grader (deterministic where possible; a model
   grader's cost counts as router overhead), a recorded balanced-profile
   baseline, and a `low`/`high` risk label that decides its rollout stage.
   There is no eval corpus and no evals directory in the repo today; this is
   net-new and is a hard prerequisite for live routing, not a parallel
   nice-to-have.
4. Shadow mode. Compute the `ExecutionPlan` and the router's preferred route
   on every request, record both, execute the current route regardless.
   Log-only by construction: no effect on billing, trust boundaries, or
   user-visible model labels. Exit: shadow plan produced for at least 95% of
   eligible requests, measured router decision latency, a counterfactual CPST
   estimate per family, and a written list of every disagreement that would
   have crossed a trust boundary — target zero, and any non-zero result
   blocks live routing outright.

## Current Evidence Commands

```bash
pnpm --filter @agiworkforce/model-registry test
pnpm --filter @agiworkforce/routing test
pnpm --filter @agiworkforce/types test
pnpm --filter @agiworkforce/mobile typecheck
pnpm --filter @agiworkforce/mobile test
pnpm check:agent-context
pnpm check:repo-organization
pnpm check:boundaries
pnpm check:structure-conventions
pnpm check:service-layer
pnpm check:llm-operability
pnpm typecheck:all
pnpm test
cargo check --workspace
```

The smallest relevant command runs first during each slice. The full list is a
final-stage requirement, not evidence that unfinished surfaces are complete.
