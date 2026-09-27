# Open questions

Questions the code cannot settle, grouped by the document that raised them.
Each needs a product, architecture or founder answer before the work that
depends on it can claim to be finished. Record each answer under
`docs/decisions/`, update the source document, remove the entry here, and
delete this file when none are left.

Founder-only actions (accounts, credentials, contracts) are in
[`founder-actions.md`](founder-actions.md), and product calls already put to
the founder are in [`founder-decisions.md`](founder-decisions.md).

## From `docs/product/requirements.md` (former §25, "Open Questions And Tracked Gaps")

None of these blocked writing the PRD, but each must be answered before a later
implementation phase claims release readiness. Until then they are tracked gaps,
not hidden assumptions.

1. The exact Mobile local runtime and model pack shipping mechanism.
2. The exact VS Code BYOK setup timing after the released CLI path.
3. The exact App Store privacy nutrition labels, after the final Mobile data
   audit.
4. The exact Cloud invite-code backend and its abuse limits.
5. The exact provider retention metadata schema.
6. The exact local file storage and encryption behaviour on each platform.
7. The exact memory import prompt and import parser.
8. The exact artifact renderer and generated-file retention defaults.
9. The exact Desktop native host protocol for the Chrome, Mobile and CLI
   bridges.
10. The exact billing and usage ledger before the Cloud public launch.
11. The exact visual artifact and design workspace scope, renderer, export
    formats and release surface.

## From `docs/architecture/execution-plan-contract.md` (former §8, "Open Questions")

Each is genuinely undecided. None may be resolved by assumption.

- **OQ-1, which resolver is canonical?** `packages/ai/routing/src/auto.ts` and
  `crates/agiworkforce-model-registry/src/lib.rs` have already diverged (budget
  and capability fields, and eight against six unavailable codes). Adding
  `ExecutionPlan` to both doubles the divergence surface. Options: designate one
  canonical and have the other call it; generate both from the schema; or accept
  the divergence with a conformance test. `packages/ai/routing/README.md`
  ("Known Caveats") holds Rust adoption of the task-family stage until this is
  answered. `docs/architecture/routing-and-economics-2026-09-06.md` §4.6
  proposes an answer (TypeScript canonical for every managed-cloud decision;
  Rust keeps local and BYOK routing under the conformance fixture); it closes
  when that split is recorded as a decision.
- **OQ-2, what identifies a model snapshot?** `generated/registry.json` exposes
  only `schemaVersion: 1`; there is no content hash, no `generatedAt`, and every
  first-party adapter package is `0.0.1`. Without one of those, `modelSnapshot`
  and `harnessVersion` cannot be pinned. Answering it needs a `compile.mjs`
  change.
- **OQ-3, service-tier vocabulary.** The repository already has
  `ServiceTier { Fast, Flex }` (protocol config), `'auto' | 'default' | 'flex'`
  (OpenAI adapter), and a per-endpoint Anthropic gate. `standard/flex/priority/batch`
  collides with `Fast`. Which vocabulary wins, and who migrates, is undecided.
  Whether any provider in use exposes a batch or priority tier at all is not
  verified in this repository, and must be confirmed from official provider
  documentation before the field is authored.
- **OQ-4, who runs the verifier?** No verifier seam exists. Candidates include
  the web tool loop (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`)
  and the retained Tauri router path, but neither has been designed for it.
  Until this is answered `verifierResult` is always `skipped`.
- **OQ-5, approval-policy coverage.** Which surfaces already render an approval
  prompt for destructive or expensive actions was not verified when the contract
  was written. Unknown. (The approval blockers `audit/blockers/01` to `07` now
  record several surfaces that skip the gate.)
- **OQ-6, task identity across requests.** The CPST denominator counts tasks,
  but nothing in the ledger groups requests into a task.
  `managed_usage_request_extensions` groups provider steps within one billed
  request, which is narrower. A task identifier is required and its owner is
  undecided.
- **OQ-7, the 2026-09-01 Sonnet 5 step-up.** It is unverified against any
  repository file (contract §1). Until a curation update lands, no planning
  number may depend on it.
- **OQ-8, non-managed surfaces.** Retained Tauri BYOK and local, CLI, mobile and
  the extensions have no per-request cost ledger. Whether CPST extends there,
  and at what privacy cost, is undecided: local execution telemetry touches the
  local-first trust boundary and cannot be added by default.

## From `docs/specs/guardian-phase-3/spec.md` (former "Blockers requiring external action")

The in-repo interfaces are fixture-tested; these need an operator or repository
administrator.

- **GitHub App production credentials.** Registering and installing the GitHub
  App, and setting `GITHUB_WEBHOOK_SECRET` and the `GITHUB_APP_*` production
  credentials, are operator-owned. The existing `/api/github/webhook` route
  documents its environment expectations in `apps/web/lib/github-app.ts`.
- **Required check on `main`.** Making "AGI Guardian / Final Policy" a required
  status check is a branch-protection change, and is recommended only after a
  shadow-mode precision review. It overlaps the branch-protection item (F13) in
  [`founder-actions.md`](founder-actions.md).

## Founder sign-off on the two draft research workbooks

Both are marked `Status: DRAFT, pending founder sign-off`, and both are live
inputs: `scripts/check-no-hardcoded-model-ids.mjs` reads them, and
`free-pools.json` and the model registries cite them.

- `docs/research/free-inference-tos-workbook-2026-09-01.md`, the launch gate of
  the free-inference lane: what each candidate pool's terms currently say.
  Nothing in it authorizes launch until it is signed off.
- `docs/research/provider-free-value-matrix-2026-09-01.md`, the breadth pass
  beside it. Nothing in it authorizes a signup, a pool entry or a catalog change
  until it is signed off.

Decide: sign each off (and change its status line), or name what must change
first.

## Two status registers for the same features

`docs/product/surface-feature-matrix.json` (rendered to
`docs/product/surface-feature-matrix.md` and held by
`check:surface-feature-matrix`) records feature-by-surface cells: 184 present,
95 absent, 63 unverified and 1 partial as of 2026-09-20. The capability ledger
in `audit/ledger/` records the same kind of status, audited later and in more
detail. Two registers will drift apart.

Decide: retire the matrix and its guard in favour of `audit/ledger/`, derive the
matrix from the ledger, or keep both with a stated owner and a sync check.
