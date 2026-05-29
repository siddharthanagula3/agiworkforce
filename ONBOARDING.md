# Onboarding

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

This is the fast entry point for new engineers, coding agents, founders, GTM, support, legal, and advisors. It routes people to the compact current docs instead of the archived long-form PRD corpus.

## Product In One Minute

AGI is an OpenAI/Anthropic-style application suite across Web, Desktop, Mobile, CLI, VS Code, and Chrome. The product baseline is Claude/ChatGPT-style application parity; the differentiation is local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute.

Normal synced app chat is Web, Mobile, and Desktop only. CLI, VS Code, and Chrome stay workspace/task scoped unless the user explicitly hands off selected context.

## Read First

1. [README.md](README.md) - user-facing pitch, install paths, and launch posture.
2. [docs/current/README.md](docs/current/README.md) - compact current docs map.
3. [docs/current/product-suite.md](docs/current/product-suite.md) - thesis, surfaces, trust modes, and sync boundary.
4. [docs/current/technical-architecture.md](docs/current/technical-architecture.md) - monorepo shape, contracts, providers, generated files, and enterprise control plane.
5. [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md) - Local/BYOK/Managed posture, waitlist rules, payments, and enterprise gates.
6. [docs/current/agent-and-repo-operability.md](docs/current/agent-and-repo-operability.md) - A+ repo, docs, and coding-agent workflow rules.
7. [docs/decisions/CURRENT_DECISIONS.md](docs/decisions/CURRENT_DECISIONS.md) - locked decisions and conflict rules.

Archived product, pricing, roadmap, architecture, scaling, and handoff docs live under `docs/archive/2026-05-21-docs-consolidation/`. Use them as source material only.

## Surface Map

| Surface           | Code path                | Deep doc                                                               |
| ----------------- | ------------------------ | ---------------------------------------------------------------------- |
| Desktop           | `apps/desktop/`          | [docs/surfaces/desktop.md](docs/surfaces/desktop.md)                   |
| Web               | `apps/web/`              | [docs/surfaces/web.md](docs/surfaces/web.md)                           |
| Mobile            | `apps/mobile/`           | [docs/surfaces/mobile.md](docs/surfaces/mobile.md)                     |
| CLI               | `apps/cli/`              | [docs/surfaces/cli.md](docs/surfaces/cli.md)                           |
| Chrome extension  | `apps/extension/`        | [docs/surfaces/chrome-extension.md](docs/surfaces/chrome-extension.md) |
| VS Code extension | `apps/extension-vscode/` | [docs/surfaces/vscode-extension.md](docs/surfaces/vscode-extension.md) |

## Role Routes

New engineer:

1. Follow [BUILD.md](BUILD.md).
2. Read the surface doc you will touch.
3. Read [AGENTS.md](AGENTS.md) and the local `AGENTS.md` in your app/package/service path.
4. Use [docs/agent-context/commands.json](docs/agent-context/commands.json) for the verification command.

Coding agent:

1. Read [AGENTS.md](AGENTS.md).
2. Read [docs/agent-context/](docs/agent-context/) for repo map, risk map, lanes, commands, known flaws, and shared-file rules.
3. Keep writes inside the assigned lane unless acting as integrator.

Founder, advisor, or investor:

1. Read [docs/current/product-suite.md](docs/current/product-suite.md).
2. Read [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md).
3. Read [docs/enterprise/](docs/enterprise/) for profit-first enterprise readiness and managed-compute gates.
4. Use [audit/anthropic-apps-parity/](audit/anthropic-apps-parity/) for evidence-backed parity research.

Designer or marketer:

1. Read [docs/design/design-spec-2026-05-15.md](docs/design/design-spec-2026-05-15.md).
2. Read [docs/marketing/README.md](docs/marketing/README.md).
3. Do not publish claims that managed cloud is broadly available until [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md) changes.

Legal, privacy, or compliance reviewer:

1. Read [docs/current/commercial-and-launch.md](docs/current/commercial-and-launch.md).
2. Read [docs/legal/README.md](docs/legal/README.md).
3. Read [docs/enterprise/profit-first-enterprise-readiness.md](docs/enterprise/profit-first-enterprise-readiness.md).
4. For legacy detailed policy text, inspect the dated archive and promote only reviewed conclusions into a current legal/compliance doc.

## Repo Tour

| Path                  | Purpose                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| `apps/`               | Six user-facing surfaces.                                                       |
| `packages/`           | Shared TypeScript contracts, providers, runtime, UI, compliance, and utilities. |
| `crates/`             | Shared Rust runtime/protocol/command/sandbox pieces.                            |
| `services/`           | Deployable backend services.                                                    |
| `apps/web/db/neon/`   | Canonical Neon database migrations.                                             |
| `docs/current/`       | Compact current product, architecture, commercial, and repo-operability docs.   |
| `docs/agent-context/` | Machine-readable repo map for LLM coding agents.                                |
| `audit/`              | Evidence ledgers, scans, parity research, and repo-organization reports.        |
| `tasks/`              | Working notes and execution queues that have not been promoted.                 |

## First Day

```bash
nvm use
corepack enable
pnpm install
pnpm check:llm-operability
pnpm typecheck:all
cargo check --workspace
```

Then run the surface you own and its targeted checks. Keep `PLAN.md`, `TODO.md`, and `CHANGELOG.md` updated when you change transition scope, active work, or completed work.
