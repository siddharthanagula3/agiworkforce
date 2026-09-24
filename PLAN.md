# AGI Workforce Production Strategy

Status: Current; mechanical restructure complete, website launch remediation active
Owner: Founder + platform lead
Last updated: 2026-09-22
Detailed plan: retired. `docs/plans/monorepo-restructure-2026-07-08.md` was
deleted once its phases landed; the mechanical restructure it described is
complete (see the phase note below) and `docs/architecture/overview.md`
now carries the package/crate ownership it defined.

> **Phase note (2026-09-21).** The mechanical restructure is complete. The
> active phase is **website launch readiness**. Work one public platform at a
> time: Web first; Mobile and Desktop next; Chrome after those; CLI and VS Code
> last. Shared contract/package repairs are allowed when they are required by
> the active platform and make the later surfaces inherit the correction.
> Current execution lives in `docs/specs/website-launch/PROGRESS.md` and
> `WEB_PUBLIC_RELEASE_AUDIT.md`. The older queue in
> `docs/work/restructure-execution-queue.md` is a historical checkpoint.

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
- Public Desktop is the Electron product under `apps/desktop/electron`. It
  combines the hosted Account Cloud client with a permissioned local host for
  files, computer use, voice, and developer-session projection. Retained Tauri
  code is internal implementation inventory, not a second public product and
  not evidence of a public capability.
- Mobile supports isolated on-device Local and Managed Cloud; it has no BYOK.
- Web, Desktop Cloud, Mobile Cloud, and provenance-eligible Chrome Managed
  Cloud share account-owned chats/messages, projects, cloud memory,
  files/artifacts, connected tools/apps, OAuth connection metadata, settings,
  personalization, and one effective entitlement.
- Desktop Code, CLI, and VS Code share host-owned local developer sessions,
  transcripts, tools/extensions, permissions, repositories/files, and
  credential references. Mobile or Web may project an authorized host session;
  they do not become the authority for local execution or files.
- Chrome page/browser state remains browser-scoped. Eligible Managed Cloud
  conversations participate in Account Cloud; local browser-task history does
  not silently become account chat history.
- Local data never reaches BYOK or Managed Cloud without an explicit fork,
  context selection, secret scan, payload preview, consent, and visible target.
- Managed artifact sandboxes serve Web, Desktop Cloud, and Mobile Cloud and
  never leak into Local or developer runtimes.
- Managed Free is available after sign-in. New paid subscriptions and upgrades
  remain waitlist/access-code gated; the gate is one account policy rather than
  a separate membership per client.

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

The current Web queue, resume point, and evidence commands live in
[`docs/specs/website-launch/PROGRESS.md`](docs/specs/website-launch/PROGRESS.md)
and [`WEB_PUBLIC_RELEASE_AUDIT.md`](WEB_PUBLIC_RELEASE_AUDIT.md). The dated
restructure queue is retained only as historical evidence.

## Completion Gate

Do not mark this plan complete until current evidence proves every explicit
objective and boundary above, every remaining workstream is closed, all
intentional compatibility layers are documented, no required renames remain,
and the six shipping surfaces plus services, packages, crates, migrations,
release paths, and recovery controls pass their authoritative verification.
