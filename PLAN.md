# AGI Workforce Production Restructure

Status: Active
Owner: Founder + platform lead
Last updated: 2026-08-28
Detailed plan: retired. `docs/plans/monorepo-restructure-2026-07-08.md` was
deleted once its phases landed; the mechanical restructure it described is
complete (see the phase note below) and `docs/architecture/overview.md`
now carries the package/crate ownership it defined.

> **Phase note (2026-07-26).** The mechanical restructure below is complete —
> every wave is landed and the repository is structurally coherent (baseline:
> 10,272 passing tests, 27 green operability guardrails). The active phase is now
> **surface production quality**: Desktop Cloud and Mobile Cloud to the standard
> Web already meets, and the VS Code and Chrome extensions to the frontend UI/UX
> standard of ChatGPT's equivalents. The executable queue for that phase lives in
> `docs/work/restructure-execution-queue.md`. The objective and boundaries below
> still govern; only the sequencing has moved on.

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
- Desktop is one product surface with two installed shells (founder decision,
  2026-08-03). The Tauri shell keeps the isolated Local, BYOK, and Managed
  Cloud composition roots unchanged. A cloud-only Electron shell
  (`apps/desktop/electron/`) loads the hosted cloud web app by default
  (Claude-desktop model), with the desktop cloud web build as a bundled
  fallback renderer; it has no Local mode, no BYOK, and no local execution
  plane, and lives entirely inside the Managed Cloud trust boundary (same
  plane as Web). Local and BYOK remain Tauri-shell-only.
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
docs/            durable knowledge; see docs/README.md for the tier map
```

The macro layout is retained. The restructure consolidates ownership inside
this shape; it does not create taxonomy-driven directories with no runtime
consumer.

## Execution queue

The dated queue, resume point and evidence commands live in
[`docs/work/restructure-execution-queue.md`](docs/work/restructure-execution-queue.md).
This file carries the standing strategy and phase structure only.

## Completion Gate

Do not mark this plan complete until current evidence proves every explicit
objective and boundary above, every remaining workstream is closed, all
intentional compatibility layers are documented, no required renames remain,
and the six shipping surfaces plus services, packages, crates, migrations,
release paths, and recovery controls pass their authoritative verification.
