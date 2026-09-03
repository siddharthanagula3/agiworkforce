# ARCHITECTURE.md

Status: Current
Owner: Repository maintainers
Last updated: 2026-08-28

A compact map of the repository. Depth lives in `docs/architecture/`; rules for
changing any of it live in `AGENTS.md`.

## Shape

Two workspaces in one repository:

- **pnpm + Turborepo** over `apps/*`, `packages/*/*`, `packages/ai/providers/*`,
  `services/*`, `infrastructure/*`.
- **Cargo** over `apps/desktop/src-tauri`, `apps/cli`, `crates/*`.

| Root              | Holds                                                           |
| ----------------- | --------------------------------------------------------------- |
| `apps/`           | The six shipping client surfaces                                |
| `packages/`       | Shared TypeScript, grouped by role                              |
| `crates/`         | Shared Rust used by both the desktop and the CLI                |
| `services/`       | Deployable backend services (currently `signaling-server` only) |
| `infrastructure/` | Deploy targets that are not products (`sandbox`)                |
| `scripts/`        | Repository guards, generators, release and database tooling     |
| `tools/`          | Internal tooling: evals, skill vetting                          |
| `docs/`           | Durable knowledge (see `AGENTS.md` §11 for the taxonomy)        |

## Surfaces

Six clients on one contract layer. Each has its own build and release workflow;
none is forced into another's framework conventions.

| Surface                 | Stack                                     |
| ----------------------- | ----------------------------------------- |
| `apps/web`              | Next.js 16, App Router                    |
| `apps/desktop`          | Tauri 2, React 19 + Vite front, Rust back |
| `apps/mobile`           | Expo / React Native                       |
| `apps/cli`              | Rust binary `agi`                         |
| `apps/extension`        | Chrome MV3                                |
| `apps/extension-vscode` | VS Code                                   |

## Shared packages

| Group                | Owns                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/contracts` | Types, cloud contracts, licensing, compliance, trust boundaries. Depends on nothing else here. |
| `packages/ai`        | Model registry, routing, provider protocol and runtime, per-provider adapters                  |
| `packages/client`    | Client runtime, sync, desktop command client                                                   |
| `packages/ui`        | `unified-chat` (surface-neutral chat), shared UI, design tokens, i18n                          |
| `packages/platform`  | Data layer, local LLM, artifacts, utilities                                                    |
| `packages/tools`     | MCP, skills, apply-patch, browser tool                                                         |
| `packages/guardian`  | Findings pipeline and its GitHub surface                                                       |

Dependency direction runs one way: contracts depend on nothing, everything else
depends on contracts. `pnpm check:boundaries` fails an import that reaches past
a package's published entrypoints.

`crates/` mirrors this for Rust: `agiworkforce-protocol` is the contract crate,
and `agent-core`, `llm`, `mcp`, `model-registry`, `app-server`,
`command-registry`, `execpolicy`, `sandbox-policy` and `licensing` sit on it.
Both the desktop and the CLI path-depend on these rather than reimplementing.

## Load-bearing seams

Five invariants that are enforced mechanically, not by convention. `AGENTS.md`
§4–§6 states the rules; this is where they bind.

| Seam                                                                  | Enforced by                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| Model catalog is generated from `packages/ai/model-registry/catalog/` | `sync:models:check`, `check:model-id-literals`         |
| Rust protocol types flow one way into TypeScript                      | `check:protocol-types`                                 |
| Desktop frontend reaches Rust only via registered Tauri commands      | `apps/desktop/check-wiring.sh`                         |
| Local / BYOK / Managed Cloud never silently cross                     | `check:trust-boundaries`, `check:rust-egress-boundary` |
| `apps/web/db/neon` is append-only and checksummed                     | `check:neon-migrations`                                |

## Data ownership across surfaces

No client invents a value another layer owns. Quota, credit, reset, entitlement
and plan values come from the server; surfaces render them and never compute
them. Teams, organizations and billing are Managed and enterprise concerns and
are never required for a Local or BYOK session.

## Provider strategy

One TypeScript provider layer serves every surface:
`packages/ai/provider-runtime` exports a single streaming client, and
`packages/ai/providers/*` holds one adapter per provider behind
`@agiworkforce/provider-protocol`. `apps/web`'s public OpenAI-compatible v1
route dispatches through the same adapters.

Managed proxy paths are never a default for Local or strict BYOK. They are
reachable only behind explicit Managed labeling and consent. The desktop's Rust
`core/llm` engine is the one remaining engine outside this layer.

## CI and deploys

`.github/workflows/ci.yml` opens with a `scope` job that classifies changed
surfaces via `scripts/production-deploy-scope.mjs`, and later jobs gate on its
outputs. The Rust lane runs only when native code changed _and_ only on `main`.

`pnpm check:llm-operability` is the guard chain and is what `.husky/pre-push`
runs. Per-surface release workflows are separate from CI.

Two behaviors to know before trusting a green run: the chain is `&&` and stops
at the first failure, and `pnpm test:affected` stops at the first failing
package. Either can hide later problems.
