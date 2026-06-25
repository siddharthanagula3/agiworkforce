# Architecture

A five-minute mental model of the AGI platform. This is the high-level map; detailed,
authoritative material lives in [`AGENTS.md`](AGENTS.md) and
[`docs/current/technical-architecture.md`](docs/current/technical-architecture.md). The
machine-readable map is [`docs/agent-context/repo-map.json`](docs/agent-context/repo-map.json).

## What AGI is

AGI competes at the **application layer**, not the model layer. Users interact with
**capabilities**; the platform owns provider routing. Model providers (OpenAI, Anthropic,
Google, xAI, DeepSeek, open-weight, …) are infrastructure that can be swapped without an
architectural redesign. Model IDs live in exactly one place —
`packages/types/src/models.json` — and are never hardcoded elsewhere.

## Execution modes & trust boundaries

The platform runs in two modes, organized around three trust boundaries that are **never
silently crossed** (see [`SECURITY.md`](SECURITY.md)):

- **Local mode** — user-owned compute, storage, models. **BYOK** (the user's own provider
  keys, used client-direct, no markup) is part of Local mode, not a separate platform mode.
- **Cloud mode** — AGI-hosted inference, memory, projects, sync, billing. Waitlist /
  private beta until ledger, fraud, refund, retention, and deletion controls are proven.

## Surfaces

| Surface           | Path                    | Stack                   | Role                                                         |
| ----------------- | ----------------------- | ----------------------- | ------------------------------------------------------------ |
| CLI               | `apps/cli`              | Rust + Ratatui TUI      | Developer engine; Local + BYOK dev sessions                  |
| Desktop           | `apps/desktop`          | Tauri v2 (Rust + React) | Local-first private host; artifacts, MCP, computer-use       |
| Web               | `apps/web`              | Next.js 16 (App Router) | Account, billing, synced chats, admin; Cloud-only            |
| Mobile            | `apps/mobile`           | Expo / React Native     | Small local LLM + Cloud; Local + Managed (no BYOK)           |
| Browser Extension | `apps/extension`        | Chrome MV3              | Browser context + capture; bridges to Desktop (no LLM logic) |
| VS Code Extension | `apps/extension-vscode` | VS Code                 | IDE-native agent surface; BYOK dev sessions                  |
| Sandbox           | `apps/sandbox`          | Static HTML (Vercel)    | Cross-origin sandboxed artifact renderer                     |

Cloud-synced surfaces (Web, Desktop, Mobile) share chats, memory, projects, and settings.
CLI and VS Code keep local, project-oriented sessions. Synchronization is a Cloud-mode
capability — not every surface auto-syncs.

## Shared layers

- **`packages/`** — shared TypeScript: contracts (`types`, incl. `models.json`), provider
  adapters (`providers`), routing (`routing`), normalization (`llm-normalize`), UI
  (`ui`, `unified-chat`), stores, and local tools. Packages must not import from apps.
- **`crates/`** — shared Rust: protocol, command registry, sandbox/exec policy, network
  proxy, task and plugin runtimes, utilities. A crate earns its place once a second
  consumer exists.
- **`services/`** — `api-gateway` and `signaling-server` (and future managed-compute
  services). Services must not import UI packages.
- **`apps/web/db/neon/`** — canonical, ordered SQL migrations for the managed Postgres
  (Neon). This is the single database path; migrations are applied via the Neon workflow.

## How a request flows

Product surface → **capability** → **routing** (`packages/routing` + provider capability
metadata) → **provider** (`packages/providers`). On Desktop, every our-cloud network call
passes the central egress guard (`apps/desktop/src/lib/egressGuard.ts`), which fails closed
outside Managed mode; the CLI validates the trust boundary at every model stream call site.

## Where to go next

- Rules, lanes, hooks, commands, high-risk areas — [`AGENTS.md`](AGENTS.md) and the
  path-scoped `AGENTS.md` at each surface.
- Product source of truth — [`docs/current/source-of-truth.md`](docs/current/source-of-truth.md).
- Detailed architecture — [`docs/current/technical-architecture.md`](docs/current/technical-architecture.md).
- Security model & reporting — [`SECURITY.md`](SECURITY.md).
- Risk register & known gaps — `docs/agent-context/risk-map.json`, `docs/agent-context/known-flaws.md`.
