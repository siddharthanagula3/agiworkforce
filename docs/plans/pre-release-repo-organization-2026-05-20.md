# Pre-Release Repository Organization

Status: Active

Owner: Platform

Last updated: 2026-07-29

## Goal

Keep AGI Workforce navigable, buildable, and reviewable by product engineers,
release operators, support, and coding agents. Repository cleanup must preserve
every source, generated contract, documentation input, and release instruction
that a build or guard executes.

## Directory Contract

| Path                   | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `apps/`                | User-facing and distributable product surfaces                  |
| `packages/`            | Shared TypeScript contracts, clients, UI, and runtime libraries |
| `crates/`              | Shared Rust libraries                                           |
| `services/`            | Independently deployable backend services                       |
| `infrastructure/`      | Deployment and infrastructure definitions                       |
| `docs/`                | Durable architecture, operating, support, and decision records  |
| `audit/inventory.json` | The sole live product-integration status ledger                 |
| `examples/`            | Buildable integration examples                                  |
| `scripts/`             | Supported repository and CI automation                          |

Generated reports and task scratch files are not durable sources of truth.
They must be reproducible or promoted into the appropriate current document.

## Non-Negotiables

- Do not combine broad file moves with behavior changes.
- Do not remove Markdown by extension; some Markdown files are compiled,
  packaged, or asserted by CI.
- Before deleting a file, search compile-time inclusions, package manifests,
  scripts, workflows, and documentation guards.
- Keep application identifiers, public package names, and Rust crate names
  stable unless a migration is approved.
- Apps may depend on shared packages, but must not import other apps.
- Services must not import surface UI.
- Shared packages must expose supported public entry points.
- Every active plan and decision must identify its status, owner, and date.
- Every cleanup wave must pass the same build, typecheck, test, packaging, and
  repository-operability gates that protected the prior tree.

## Cleanup Workflow

1. Inventory the target paths and their inbound references.
2. Classify each file as runtime source, executable input, durable
   documentation, generated artifact, or disposable scratch output.
3. Move or delete only the disposable set.
4. Regenerate deterministic artifacts through their owning script.
5. Run `pnpm check:llm-operability`, relevant surface checks, and
   `cargo check --workspace`.
6. Record any policy exception in `docs/decisions/`.

## Documentation Model

- Root documents are entry points and operating contracts.
- `docs/current/` and `docs/agent-context/` route maintainers to current state.
- `docs/decisions/` records accepted architectural and policy decisions.
- `docs/plans/` contains active or recent execution plans with ownership.
- `docs/reference/` contains durable reference material.
- `docs/support/` and `docs/legal/` contain audience-specific operating
  material.
- Historical documents must be clearly archived or superseded.

The repository must not maintain parallel, drifting prose reports for the same
operational state. The one exception for measurable product integration is
`audit/inventory.json`, governed by
`docs/decisions/2026-07-29-live-integration-inventory.md`.

## LLM Operability

`AGENTS.md` is the canonical tool-neutral entry point. Agent-facing context
under `docs/agent-context/` is deliberately small and machine-verifiable:

- `repo-map.json` describes ownership and routing.
- `risk-map.json` identifies high-risk boundaries.
- `commands.json` names supported verification commands.
- `doc-status.json` classifies durable documents.
- `generated/` contains deterministic dependency, module, and contract
  indexes.

`pnpm check:llm-operability` enforces these contracts. A cleanup is incomplete
if this command cannot run from a fresh checkout.

## Release Readiness

The organization work is complete when:

- each product surface and shared boundary has a clear owner;
- root contains only supported entry points and required configuration;
- build and package inputs cannot be mistaken for disposable documentation;
- generated indexes are reproducible and committed;
- CI rejects unclassified root clutter, cross-boundary imports, malformed
  operational ledgers, and missing executable documentation;
- a new maintainer can locate the correct surface, contract, verification
  command, and release instructions without reconstructing repository history.
