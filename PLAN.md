# AGI Workforce Production Restructure

Status: Active
Owner: Founder + platform lead
Last updated: 2026-07-15
Detailed plan: `docs/plans/monorepo-restructure-2026-07-08.md`
Organization sequence: `docs/plans/pre-release-repo-organization-2026-05-20.md`

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
   apply+probe migrations 0056 → 0057/0058 on prod Neon BEFORE merging this
   branch to `main`; W7 live-provider + desktop-device smoke; desktop
   restart-persistence smoke; W10 on-device mobile QA.
6. The final requirement-by-requirement completion audit (Remaining
   Workstream 8) recorded in CHANGELOG with unresolved external
   prerequisites listed separately.

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
