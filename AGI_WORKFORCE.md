# AGI Workforce

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-28

AGI Workforce is an OpenAI/Anthropic-style application suite across Web, Desktop, Mobile, CLI, VS Code, Chrome, shared engines, and future managed compute. The product baseline is Claude/ChatGPT-style application parity. The differentiation is local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute.

This file is now a compact entry point. The former long historical version is archived at `docs/archive/2026-05-21-docs-consolidation/AGI_WORKFORCE-legacy.md`.

## Current Sources

| Doc                                                                                                    | Purpose                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [README.md](README.md)                                                                                 | User-facing pitch and quick start.                                                              |
| [ONBOARDING.md](ONBOARDING.md)                                                                         | Role-based first-day route for humans and agents.                                               |
| [BUILD.md](BUILD.md)                                                                                   | Build prerequisites and per-surface commands.                                                   |
| [PLAN.md](PLAN.md)                                                                                     | Active Anthropic/OpenAI application-suite transition plan.                                      |
| [TODO.md](TODO.md)                                                                                     | Active execution queue.                                                                         |
| [CHANGELOG.md](CHANGELOG.md)                                                                           | Completed work log.                                                                             |
| [docs/current/README.md](docs/current/README.md)                                                       | Compact current docs map.                                                                       |
| [docs/current/source-of-truth.md](docs/current/source-of-truth.md)                                     | Single product definition, v1 target, current position, parity baseline, and gaps.              |
| [docs/current/agi-product-requirements.md](docs/current/agi-product-requirements.md)                   | Long-form PRD, serial surface order, Mobile v1 release bar, and decision-complete requirements. |
| [docs/current/parity-implementation-matrix.md](docs/current/parity-implementation-matrix.md)           | Feature/component parity matrix for implementation agents.                                      |
| [docs/current/byok-open-model-provider-strategy.md](docs/current/byok-open-model-provider-strategy.md) | BYOK/open-model provider strategy and model priority map.                                       |
| [docs/current/product-suite.md](docs/current/product-suite.md)                                         | Product thesis, surfaces, trust modes, and sync boundary.                                       |
| [docs/current/technical-architecture.md](docs/current/technical-architecture.md)                       | Monorepo shape, contracts, providers, generated files, and enterprise control plane.            |
| [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md)                         | Waitlist, BYOK, managed-compute, payment, and enterprise launch rules.                          |
| [docs/current/agent-and-repo-operability.md](docs/current/agent-and-repo-operability.md)               | A+ repo/docs/agent workflow rules.                                                              |
| [docs/decisions/CURRENT_DECISIONS.md](docs/decisions/CURRENT_DECISIONS.md)                             | Locked decisions and conflict rules.                                                            |
| [docs/agent-context/](docs/agent-context/)                                                             | Machine-readable repo map for coding agents.                                                    |

## Product Lock

- AGI is the public brand; repo/package/crate identifiers stay `agiworkforce`.
- The primary CLI command is `agi`; `agiworkforce` remains a compatibility alias for existing installs, scripts, and docs that have not migrated yet.
- Repo naming follows [docs/engineering/naming-conventions.md](docs/engineering/naming-conventions.md).
- Six surfaces are first-class: Web, Desktop, Mobile, CLI, VS Code, and Chrome.
- Web, Mobile, and Desktop share normal app chat sync.
- CLI, VS Code, and Chrome stay workspace/task scoped unless the user explicitly hands off selected context.
- Local mode never silently routes to BYOK or Managed.
- Local to BYOK is an explicit fork with context selection, secret scan, preview, provider label, and consent.
- Managed compute and managed credits stay waitlisted/private beta until metering, fraud, refunds, chargebacks, provider terms, retention, and deletion controls are ready.

## Architecture Lock

- `apps/` owns shippable surfaces.
- `packages/` owns shared TypeScript contracts, providers, runtime, UI, compliance, and utilities.
- `crates/` owns reusable Rust runtime/protocol/command/sandbox pieces.
- `services/` owns deployable backend services.
- `apps/web/db/neon/` is the canonical Neon database migration root.
- `patches/` owns pnpm dependency patches only.
- App code must not import another app.
- Packages must not import app code.
- Services must not import UI packages.
- Provider SDKs are adapters, not architecture.

## Surface Docs

| Surface | Path                     | Doc                                                                    |
| ------- | ------------------------ | ---------------------------------------------------------------------- |
| Desktop | `apps/desktop/`          | [docs/surfaces/desktop.md](docs/surfaces/desktop.md)                   |
| Web     | `apps/web/`              | [docs/surfaces/web.md](docs/surfaces/web.md)                           |
| Mobile  | `apps/mobile/`           | [docs/surfaces/mobile.md](docs/surfaces/mobile.md)                     |
| CLI     | `apps/cli/`              | [docs/surfaces/cli.md](docs/surfaces/cli.md)                           |
| Chrome  | `apps/extension/`        | [docs/surfaces/chrome-extension.md](docs/surfaces/chrome-extension.md) |
| VS Code | `apps/extension-vscode/` | [docs/surfaces/vscode-extension.md](docs/surfaces/vscode-extension.md) |

## Verification

For docs, repo organization, or agent-context changes:

```bash
pnpm check:llm-operability
git diff --check
```

For code changes, also run the surface/package-specific checks listed in `docs/agent-context/commands.json`.

## Update Rules

Update this file only when the current entry points, product locks, architecture locks, or surface map change. Put active work in `PLAN.md` and `TODO.md`; put completed work in `CHANGELOG.md`; put historical detail in `docs/archive`.
