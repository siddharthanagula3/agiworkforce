# Architecture

> Last updated: 2026-05-08. Scope: cross-surface system architecture for a
> billion-dollar-scale AI agent platform that must remain cloud-portable as
> traffic grows.

## TL;DR

AGI Workforce is **six product surfaces** wrapping **one chat layer**, talking
to **10+ LLM providers** via **one provider-adapter contract**, persisting
through **one data-layer abstraction** to a **swappable cloud backend**.

```
┌─────────────────────────────────────────────────────────────────┐
│                     6 Surfaces (Clients)                        │
├──────────────┬──────────────┬─────────────┬─────────────────────┤
│ CLI / TUI    │ Desktop      │ Web         │ Mobile  │ Chrome ext│
│ (Rust)       │ (Tauri+React)│ (Next.js)   │ (Expo)  │ VS Code   │
└──────────────┴──────────────┴─────────────┴─────────────────────┘
       │              │             │            │          │
       └──────────────┴─────────────┴────────────┴──────────┘
                              │
                ┌─────────────┴──────────────┐
                │   Shared TS Packages       │
                │  ┌───────────────────────┐ │
                │  │ unified-chat (UI)     │ │
                │  │ providers/* (LLM)     │ │
                │  │ types (contracts)     │ │
                │  │ api (transport)       │ │
                │  │ llm-normalize (xprov) │ │
                │  │ apply-patch / mcp /   │ │
                │  │ skills / runtime      │ │
                │  │ DATA-LAYER (NEW) ─────┼─┐
                │  └───────────────────────┘ │
                └────────────────────────────┘
                              │              │
                ┌─────────────┴──────────┐   │
                │   Backend Services     │   │
                │  ┌──────────────────┐  │   │
                │  │ api-gateway      │  │   │
                │  │ signaling-server │  │   │
                │  └──────────────────┘  │   │
                └────────────────────────┘   │
                              │              │
                              └──────────────┘
                              │
                ┌─────────────┴────────────────────────────┐
                │  Cloud-portable backend (swappable)      │
                │  ┌────────┐ ┌──────┐ ┌────────┐ ┌─────┐ │
                │  │ DB     │ │ Auth │ │Storage │ │ RT  │ │
                │  │ supab- │ │ supa │ │ supab- │ │supa-│ │
                │  │ ase /  │ │ /clk │ │ ase /  │ │ ase │ │
                │  │ neon / │ │ auth0│ │ s3 / r2│ │/pus-│ │
                │  │ pg /   │ │/cog- │ │ / b2   │ │her /│ │
                │  │ rds    │ │ nito │ │        │ │ ably│ │
                │  └────────┘ └──────┘ └────────┘ └─────┘ │
                └──────────────────────────────────────────┘
```

## 1. The six surfaces

| Surface     | Path                     | Stack                                      | Distribution        |
| ----------- | ------------------------ | ------------------------------------------ | ------------------- |
| CLI / TUI   | `apps/cli/`              | Rust monolith, Ratatui TUI, 22 subcommands | cargo, npm, brew    |
| Desktop     | `apps/desktop/`          | Tauri v2 + React (Vite) + Rust backend     | DMG, MSI, AppImage  |
| Web         | `apps/web/`              | Next.js 14 app router @ agiworkforce.com   | Vercel              |
| Mobile      | `apps/mobile/` + `ios/`  | Expo + React Native 0.83.6                 | App Store, Play     |
| Chrome ext  | `apps/extension/`        | MV3 v1.2.0                                 | Chrome Web Store    |
| VS Code ext | `apps/extension-vscode/` | v0.3.0, @agi chat participant              | VS Code Marketplace |

Each surface is a thin shell. The chat surface is identical (`packages/unified-chat`,
`packages/chat`); the only surface-specific code is platform integration
(menu bars, deep links, file pickers, native notifications).

## 2. The chat layer

`packages/unified-chat` is **the** chat layout — message list, composer,
sidebar, model picker, artifact viewer. Every surface mounts it. Local
storage / sync / streaming differ per surface, but the React tree is
identical to within a few feature flags.

Cross-cutting concerns:

- **Provider switching mid-conversation:** the chat thread holds a
  `ProviderId` per message. Switching the active provider does not break
  the thread — `packages/llm-normalize` translates tool calls + thinking
  blocks across vendors.
- **Tool calling:** every tool call passes through
  `packages/types/src/provider-adapter.ts` (`StreamChunk` discriminated
  union). The provider adapters convert vendor-specific SSE into this
  one wire format.
- **Skills:** `packages/skills` — modular Anthropic-style skills (140+
  catalog). Skills are LLM-prompt fragments + optional MCP tools.

## 3. The provider abstraction

Every LLM provider implements `ProviderAdapter` in
`packages/types/src/provider-adapter.ts`:

```ts
interface ProviderAdapter {
  id: ProviderId;
  label: string;
  auth: AuthMethod;
  catalog(): Promise<ModelMetadata[]>;
  buildReplayPolicy?(opts): ReplayPolicy;
  normalizeToolSchemas?(tools): ToolSchema[];
  wrapStreamFn?(fn): WrappedStream;
  stream(req): AsyncIterable<StreamChunk>;
}
```

12 named providers + 1 user-defined `Custom` registry (Anthropic, OpenAI,
Google, Ollama-Local, Ollama-Cloud, xAI, DeepSeek, Perplexity, Qwen,
Moonshot, Zhipu, LMStudio + Custom BYO). See `apps/cli/src/models.rs:287-310`
for the canonical registration list and `packages/providers/<vendor>/`
for adapters.

**Why this matters for scaling:** when a provider goes down, the chat
thread fails over to another provider on retry. Multi-provider in one UI
is also our **fault-tolerance story** — it's why we don't have to engineer
"redundant region of OpenAI" plumbing.

## 4. The data layer (NEW — `packages/data-layer`)

The codebase couples to Supabase today. The data layer is the new seam
through which we will swap Supabase for Neon, RDS, S3, Auth0, etc.

```
@agiworkforce/data-layer
├── DatabaseAdapter     (query/execute/transaction/withUser)
├── AuthAdapter         (verifyJwt/refreshToken)
├── StorageAdapter      (put/get/delete/signedUrl)
└── RealtimeAdapter     (subscribe/publish)
```

Concrete adapters:

| Interface         | Today                     | Skeleton (migrate later)                         |
| ----------------- | ------------------------- | ------------------------------------------------ |
| `DatabaseAdapter` | `SupabaseDatabaseAdapter` | `NeonDatabaseAdapter`, `PostgresDatabaseAdapter` |
| `AuthAdapter`     | `SupabaseAuthAdapter`     | Auth0 / Clerk / Cognito (TODO)                   |
| `StorageAdapter`  | `SupabaseStorageAdapter`  | S3 / R2 / B2 (TODO)                              |
| `RealtimeAdapter` | `SupabaseRealtimeAdapter` | Pusher / Ably / self-hosted (TODO)               |

**ENV-driven selection.** `AGI_DATABASE_PROVIDER`, `AGI_AUTH_PROVIDER`,
`AGI_STORAGE_PROVIDER`, `AGI_REALTIME_PROVIDER`. See `docs/SCALING.md` for
the migration playbook for each.

**Vertical-slice migration.** `apps/web/app/api/me/route.ts` is the
proof-of-concept refactored to use `createAuthClient()` +
`createDatabaseClient()`. Each subsequent route migration should follow
the pattern documented at the top of that file.

## 5. Backend services

| Service            | Path                        | Hosting     | Purpose                      |
| ------------------ | --------------------------- | ----------- | ---------------------------- |
| `api-gateway`      | `services/api-gateway`      | Fly.io      | Express v5 — 14 routes, MCP  |
| `signaling-server` | `services/signaling-server` | Fly.io      | WebRTC for Dispatch + Cowork |
| Supabase           | `supabase/migrations`       | supabase.co | Postgres, Auth, Storage, RT  |
| Stripe             | `apps/web/app/api/stripe-*` | stripe.com  | Billing webhooks             |

Each is replaceable — see `docs/HOSTING.md`.

## 6. Cross-surface contracts

These are the protocol boundaries that let surfaces evolve independently:

1. **Agent SDK protocol** — JSON-stream events emitted by `apps/cli` (the
   engine), consumed by every other surface. Documented in
   `crates/agiworkforce-protocol`.
2. **Anthropic Dispatch parity** — desktop/mobile cross-device session
   handoff. Mobile listens for `dispatchHmac` + `dispatchSalt`; desktop
   listener due 2026-06-05 per FINAL_AUDIT §B.
3. **MCP (Model Context Protocol)** — stdio MCP for local tools, HTTP/SSE
   for hosted tools. Implemented in `packages/mcp`.
4. **Skills format** — Markdown front-matter + optional MCP server, see
   `packages/skills`.
5. **Tool-call normalization** — `packages/llm-normalize` 2,633 LOC ports
   from OpenClaw, makes `name` / `id` / `arguments` interoperable across
   Anthropic, OpenAI, Google, Ollama tool-call shapes.

## 7. Local vs Cloud mode

The desktop ships in two modes:

- **Local mode**: SQLite + Ollama/LMStudio. No Supabase. No auth. No
  cross-device sync. No Dispatch. The whole `data-layer` is unused — the
  desktop has its own Rust-side SQLite layer.
- **Cloud mode**: full data-layer plumbing. Supabase today;
  Neon / Auth0 / S3 / Pusher tomorrow.

Mode picker: `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx`.
Runtime detection: `packages/runtime/src/detect.ts` (`isTauri`,
`isCloudWeb`).

## 8. Why not a single mega-monolith

Two reasons:

1. **Surface-specific stacks are non-negotiable.** Tauri ships native
   menu bars, Expo ships native push, Next.js ships SSR + edge functions.
   You can't unify those into one runtime without losing every native
   integration.
2. **Provider lock-in is the existential risk.** If we're tied to one
   LLM provider or one cloud DB, we lose pricing leverage. The provider
   adapter + data-layer abstractions are how we keep that leverage at a
   billion-dollar scale.

## 9. Where the costs live

Order-of-magnitude monthly cost projections at scale:

| Cost center       | $0–10K MRR         | $1M MRR                        | Notes                                    |
| ----------------- | ------------------ | ------------------------------ | ---------------------------------------- |
| LLM calls         | ~50% of revenue    | ~30% of revenue                | Cost-aware routing (perf §)              |
| Database          | $25 (Supabase Pro) | $1–10K (Neon/RDS multi-region) | See `docs/SCALING.md`                    |
| Edge / Vercel     | ~$20               | $1–5K                          | Switch to Cloudflare Pages?              |
| Storage           | $0–10              | $200–2K                        | R2 cheaper than S3 cheaper than Supabase |
| Realtime          | $0 (Supabase free) | $500–5K                        | Self-host wins at scale                  |
| Stripe processing | 2.9% of revenue    | 2.9% (negotiate at $5M)        | Fixed                                    |

Rule of thumb: at >$1M MRR, we MUST be on the data-layer abstraction —
otherwise renegotiating Supabase's enterprise tier vs migrating to Neon
becomes a 6-month engineering project rather than a 2-week one.

## 10. Reading this codebase

Order:

1. `AGI_WORKFORCE.md` — single source of truth, audit status.
2. `docs/ARCHITECTURE.md` — this file.
3. `docs/SCALING.md` — cloud migration playbooks.
4. `docs/HOSTING.md` — multi-cloud deployment.
5. `docs/PERFORMANCE.md` — heavy-traffic patterns.
6. Pick a surface, read its `app/` or `src/` entry point, then trace into
   the shared packages.
