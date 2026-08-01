# AGI Workforce Production Restructure

Status: Active
Owner: Founder + platform lead
Last updated: 2026-08-01
Detailed plan: `docs/plans/monorepo-restructure-2026-07-08.md`
Organization sequence: `docs/plans/pre-release-repo-organization-2026-05-20.md`

> **Phase note (2026-07-26).** The mechanical restructure below is complete —
> every wave is landed and the repository is structurally coherent (baseline:
> 10,272 passing tests, 27 green operability guardrails). The active phase is now
> **surface production quality**: Desktop Cloud and Mobile Cloud to the standard
> Web already meets, and the VS Code and Chrome extensions to the frontend UI/UX
> standard of ChatGPT's equivalents. The executable queue for that phase lives in
> the **Exact Resume Point** section of this file. The objective and boundaries
> below still govern; only the sequencing has moved on.

## Objective

Transform AGI Workforce into one production-grade, agent-native,
multi-provider platform across Web, Desktop, Mobile, CLI, VS Code, and Chrome.
The work is complete only when the repository is structurally coherent, all
approved renames and moves are finished, shared capabilities have canonical
owners, all six applications have verified end-to-end flows, and the relevant
build, test, security, release, and runtime checks pass.

Passing an isolated test, completing a demo path, writing an audit, or moving
files without repairing consumers does not satisfy this plan. Migration remains
incremental so broad moves are never combined with behavioral changes, but the
final success criterion is the full platform outcome.

## Locked Product And Trust Boundaries

- Web is Managed Cloud only.
- Desktop is one installed Tauri application with isolated Local, BYOK, and
  Managed Cloud composition roots. It is not split into separate user-facing
  Local and Cloud applications.
- Mobile supports isolated on-device Local and Managed Cloud; it has no BYOK.
- Web, Desktop Cloud, and Mobile Cloud share cloud conversations, projects,
  memory, settings, account state, and managed artifact infrastructure.
- CLI and VS Code share local developer sessions and workspace context.
- Chrome owns browser-scoped conversations. Context leaves that boundary only
  through an explicit selected and redacted transfer.
- Local data never reaches BYOK or Managed Cloud without an explicit fork,
  context selection, secret scan, payload preview, consent, and visible target.
- Managed artifact sandboxes serve Web, Desktop Cloud, and Mobile Cloud and
  never leak into Local or developer runtimes.

## Canonical Ownership Rules

- `packages/ai/model-registry` owns model identity, routes, lifecycle,
  capabilities, limits, pricing, evidence, harnesses, runtime profiles, and
  routing policy. TypeScript and Rust artifacts are generated from it.
- `packages/ai/routing` owns task classification and trust/capability-aware model
  admission. Applications may provide surface adapters but not independent
  routing tables.
- Provider-aware request, stream, tool, reasoning, citation, artifact, usage,
  cancellation, retry, and error contracts must have one cross-surface owner.
- Reusable mechanics belong in packages, crates, or services. Applications own
  surface policy, presentation, and platform adapters.
- Deployable services remain coarse until independent scaling, security, data,
  or operational ownership proves a split is necessary.
- Applications, tests, docs, selectors, calculators, and adapters must not
  maintain independent managed-model lists or guessed provider capabilities.

## Target Repository Meaning

```text
apps/            user-facing product surfaces
packages/        shared TypeScript domains, contracts, services, and UI
crates/          shared Rust protocols, runtimes, policies, and mechanics
services/        independently deployed backend processes only
apps/web/db/neon canonical database migrations
infrastructure/  deployment, environment definitions, and isolated sandbox renderer
scripts/         supported repository automation
tests/           genuinely cross-surface and system-level verification
docs/            current architecture, decisions, plans, research, and runbooks
```

The macro layout is retained. The restructure consolidates ownership inside
this shape; it does not create taxonomy-driven directories with no runtime
consumer.

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
   2026-07-15 per `docs/plans/monorepo-restructure-2026-07-08.md` Appendix B).
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
   apply+probe the unapplied `apps/web/db/neon` migrations from 0056 through
   the current head (`0080_device_refresh_token_rotation.sql`) on prod Neon
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
`scripts/check-readme-ownership.mjs` enforces; this is a regression this branch
introduced and it blocks the pre-push gate. (b) `cargo test --workspace --lib`
is 6,770 passed / 4 failed / 34 ignored across 14 binaries, all four failures
inside `agiworkforce-desktop` and all four reproducing deterministically in
isolation — two effort-catalog assertions in `core::llm` that contradict
`claude-sonnet-5`'s `supportedEfforts` since `3044350c5`, and two `v59`
migration tests that expose a real hazard where the `v76` step runs
`CREATE INDEX` against `realtime_metrics` without guarding that the table
exists. All four files are byte-identical between `main` and this branch, so
this is pre-existing `main` breakage surfaced by the battery, not a regression
here — but it does mean the CHANGELOG 2026-07-26 claim of a green
`cargo test --workspace --lib` is stale and must not be re-asserted without
re-qualification. Guardrail count also moved: 34 in the chain now, not the 27
that entry records.

Founder decisions standing as of this checkpoint: the branch is **not pushed**
and **no PR is open**, deliberately — origin's copy is an ancestor 280 commits
behind, so a push would fast-forward whenever it is authorized. The full
successor briefing, including tree disposition and the not-run list, is
`docs/agent-context/remediation-handoff-2026-08-01.md`; read it before resuming.
Finally, `TODO.md` was deleted in `906fe5cda`, so this Exact Resume Point
section is now the executable queue — add new work here, not to a new root
control doc.

Founder decisions (2026-08-01, evening): build 11 of the 13 undecided missing
surfaces (all except Finances; Plugins resolves to Connectors permanently) —
the full list with external gates is recorded in
`docs/current/parity-implementation-matrix.md` §2026-08-01 Founder Scope
Decisions. Additionally: always-stack the mobile composer (model chip
permanently visible), sonnet-5 low/medium effort follows the catalog (tests
updated), and the branch is authorized for a plain push to origin (no PR).

Same-day update (2026-08-01, post-checkpoint): RED 1 is cleared — `528ba8bc3`
adds the three missing mobile feature READMEs and a fresh
`pnpm check:llm-operability` run exits 0 (34/34), so the pre-push gate is green
again. RED 2 (the four pre-existing desktop cargo failures, including the v76
`realtime_metrics` migration hazard) remains open and is now filed in
`docs/agent-context/known-flaws.md`. The active phase work is mobile parity
against the ChatGPT/Claude iOS reference sets on the founder's Desktop; the
prioritized backlog lives with the session that produced it and lands here as
commits.

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

## Completion Gate

Do not mark this plan complete until current evidence proves every explicit
objective and boundary above, every remaining workstream is closed, all
intentional compatibility layers are documented, no required renames remain,
and the six shipping surfaces plus services, packages, crates, migrations,
release paths, and recovery controls pass their authoritative verification.
