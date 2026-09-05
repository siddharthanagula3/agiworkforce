# AGI Workforce

> One workspace for the AI models you already pay for, routed by task, cost, and cache warmth.

[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)

AGI Workforce unifies 22 catalog providers (including local runtimes) into
one application spanning **Mobile**, **Web**, **Desktop**, **CLI**, **Chrome
Extension**, and **VS Code Extension**. Each surface enforces its own trust
boundary: Local mode keeps data on device, BYOK (Bring Your Own Key) routes to
a user's own provider account, and a managed cloud mode (public alpha, open by
default since 2026-06-27) adds hosted inference. A request to a given model
can be dispatched over more than one route, direct to the provider, through
OpenRouter or Vercel AI Gateway, or through a compatible mirror, each with its
own price and cache behavior; the router picks the cheapest healthy route to
the exact model asked for and never substitutes a different model.

Users chat, generate code, run agentic workflows, automate browsers and
desktops, manage files, search the web, and orchestrate multi-step tasks
through one interface. The repository is a polyglot monorepo (TypeScript and
Rust) with six client surfaces sharing common packages for types, providers,
routing, runtime, artifacts, and a unified chat protocol.

## Key features

- **Multi-provider model routing**: Catalog of 55 models across 22 providers:
  AGI managed cloud, OpenAI, Anthropic, Google, xAI, DeepSeek, Qwen, Moonshot,
  MiniMax, Perplexity, ZhipuAI, Runway, OpenRouter, NVIDIA NIM, Groq,
  Cloudflare Workers AI, Vercel AI Gateway, AWS Bedrock, and the local
  runtimes Ollama, LM Studio, llama.cpp, and vLLM. Counts and provider names
  come from `packages/contracts/types/src/models.json`; `pnpm check:readme-facts`
  fails when this section drifts from it.
- **Local-first privacy and BYOK**: Desktop and mobile run local models via
  Ollama, LM Studio, and on-device inference (llama.rn, ExecuTorch), with no
  data leaving the device in Local mode; BYOK sends requests straight to a
  user's own provider account with their own key.
- **Agentic execution and tools**: Swarm-based orchestration (task
  decomposition, parallel sub-agent spawning, dependency-graph execution,
  result aggregation), an MCP client in desktop/CLI/web/extension, and a tool
  engine covering file operations, code execution, PTY terminal, git, web
  search, document extraction, calendar, email, and clipboard. The CLI adds
  an interactive TUI and a one-shot mode.
- **Computer use and browser automation**: Desktop includes screen capture,
  vision planning, input simulation (enigo/rdev), OCR (Tesseract), and a
  screen watcher; the Chrome Extension adds page capture, content extraction,
  and a native messaging bridge to the desktop app.
- **Voice, skills, and sync**: audio capture and optional local
  speech-to-text (Whisper.cpp) on desktop; a loadable skill and plugin
  system with a marketplace; and a WebRTC signaling server syncing
  conversations across web, mobile, and desktop.

## Surfaces

Every surface below is under active development. Status is a plain
description of what runs today, not a shipped-feature claim.

| Surface           | Version | Status                                                                                                                                                                  |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile            | 1.2.0   | Local-first chat runs on device. No build has reached TestFlight, Play Internal Testing, or a store listing. In-app purchase is fail-closed.                            |
| Web               | 0.1.1   | The deepest surface: product site, chat, and billing run in production.                                                                                                 |
| Desktop           | 1.2.0   | Tauri 2 app with a Rust backend. The latest published release ships Linux `.AppImage`/`.deb`/`.rpm` only; macOS and Windows installers are not yet published.           |
| CLI               | 1.7.1   | Interactive TUI and one-shot mode. `release-cli.yml` only cuts a release from a git tag matching `Cargo.toml`; the last published release predates this repo's version. |
| Chrome Extension  | 1.2.0   | Manifest V3 with browser automation and a side panel. Not yet published to the Chrome Web Store.                                                                        |
| VS Code Extension | 0.3.0   | IDE-native surface. Not yet published to the VS Code Marketplace; depends on a CLI release that has not shipped.                                                        |

`services/signaling-server` (WebRTC/WebSocket relay for cross-device sync,
deployed continuously to Fly.io and Railway) and `infrastructure/sandbox`
(static file for Vercel Sandbox origin checks) are live services outside this
table because they are not versioned client surfaces.

## Architecture

Six client surfaces call into shared TypeScript packages (types, routing,
providers, MCP, runtime, sync, unified-chat, design-tokens, skills, utils).
Web and the signaling server are the two server-side entry points: the
Next.js web app hosts the LLM proxy, auth, and rate limiting; the Express
signaling server relays WebRTC/WebSocket sync. Both sit in front of Neon
PostgreSQL (the ledgered database) and, on desktop and CLI, a set of Rust
crates (protocol, sandbox-policy, command-registry, app-server, llm, mcp).

| Directory                   | Contents                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile`               | Expo 57 / React Native iOS + Android app with on-device LLM support                                                                                                                                          |
| `apps/web`                  | Next.js 16 web application: product site, chat, billing, docs, admin                                                                                                                                         |
| `apps/desktop`              | Tauri 2 desktop app: React 19 frontend + Rust native backend                                                                                                                                                 |
| `apps/cli`                  | Rust CLI binary (`agi`): interactive TUI, one-shot exec, daemon mode                                                                                                                                         |
| `apps/extension`            | Chrome Extension (Manifest V3): browser automation, side panel, native messaging                                                                                                                             |
| `apps/extension-vscode`     | VS Code extension: IDE-native AI surface                                                                                                                                                                     |
| `packages/`                 | 32 shared TypeScript packages outside the provider adapters (types, routing, model-registry, runtime, MCP, artifacts, UI, etc.)                                                                              |
| `packages/ai/providers/`    | 18 per-provider adapter packages (Anthropic, DeepSeek, Factory, Google, Groq, LM Studio, MiniMax, Moonshot, NVIDIA, Ollama, OpenAI, OpenRouter, Perplexity, Qwen, Vercel AI Gateway, Workers AI, xAI, Zhipu) |
| `crates/`                   | 12 Rust crates (protocol, llm, agent-core, mcp, sandbox-policy, execpolicy, etc.)                                                                                                                            |
| `services/signaling-server` | Express 5 WebRTC/WebSocket signaling server for cross-device sync                                                                                                                                            |
| `tools/skill-vetting`       | Skill vetting scanner (NVIDIA SkillSpector fork): developer/CI supply-chain vetting                                                                                                                          |

## Model routing and caching

`packages/ai/model-registry` compiles a curated catalog into a generated
registry (`generated/registry.json`) that declares 39 canonical models, 99
provider routes, and 30 protocol harnesses. A canonical model is not tied to
one provider: a single flagship model can have a route through its own
provider directly, through OpenRouter, through Vercel AI Gateway, and
through an Anthropic-Messages-compatible mirror, each with its own pricing
(input, output, cache read, cache write per million tokens), cache class
(`provider_explicit_prompt_cache`, `provider_implicit_prompt_cache`,
`gateway_prompt_cache`, or `no_provider_cache`), and commercial status
(`agi_direct`, `authorized_marketplace`, `experimental_only`, or
`customer_byok`). Harnesses describe the wire protocol each route speaks;
most route through allowlisted per-provider adapter packages, and a smaller
set declares its own base URL and API key environment variable directly in
the registry, which is how the Anthropic-Messages mirrors for DeepSeek,
Moonshot, and Zhipu are wired without a bespoke adapter.

Selection (`packages/ai/routing/src/auto.ts`) ranks every admissible route of
one canonical model by live health first (a per-route health snapshot with
cooldowns), then by expected cost, then by the model's declared default
route, then by route id, so equally priced routes never reorder between runs.
A caller already warm on one route keeps it as long as it stays healthy and
is not too much pricier than the cheapest option, which keeps a cache-warmed
session on the same provider. This never substitutes a model: it only orders
the routes serving the exact model requested, and pinning an exact model
confines failover to that model's own routes.

Caching keeps the cacheable part of a request stable: each provider's system
prompt is split at a stable prefix boundary so that prefix stays
byte-identical across turns. Anthropic requests attach `cache_control`
ephemeral breakpoints to it; OpenAI requests pin a derived `prompt_cache_key`
to the same prefix. Cache usage (tokens read from versus written to cache) is
parsed from each provider's response for OpenAI, Anthropic, Google, DeepSeek,
Moonshot, Qwen, xAI, Perplexity, Groq, OpenRouter, and Vercel AI Gateway, and
normalized into one shape the billing ledger prices against. A live probe
against the production chat route, not a mock, has confirmed an actual cache
read and write round trip on OpenAI and DeepSeek.

`apps/web/lib/services/cogs-ledger-service.ts` records, per settled request,
the actual cost billed against the company's provider account, a
retail-equivalent cost from the registry's own price sheet, and prefers the
provider's own reported cost when the route supplies it. Every row is tagged
with the route id that actually served it, not the one requested, so a
fallback is visible instead of hidden. An admin-only observability API
(`apps/web/app/api/admin/observability`) aggregates these rows by route,
model, user, or tenant: request counts, cache hit rate, cache token totals,
actual versus retail cost, and a value multiplier (retail divided by actual),
plus a per-request explain view.

## Tech stack

- **Frontend**: React 19 + TypeScript 5.9 (desktop, web), React Native 0.86 /
  Expo 57 (mobile), Tailwind CSS 4, Radix UI, Framer Motion, Zustand 5,
  React Router 7 (desktop), Expo Router (mobile), Next.js App Router (web),
  Monaco Editor, xterm.js, Mermaid/KaTeX/react-markdown, i18next.
- **Desktop native**: Rust (edition 2021, toolchain 1.94.0), Tauri 2.11,
  SQLite via rusqlite with SQLCipher, enigo/rdev/xcap, portable-pty, git2,
  cpal, keyring (OS keychain), reqwest, tokio.
- **Services**: Express 5 (signaling server), Clerk (web auth), Stripe
  (billing), Neon PostgreSQL with ordered, checksummed SQL migrations
  (`apps/web/db/neon`), Upstash Redis (rate limiting/cache), Vercel (web
  deployment), Pino (logging).
- **CLI**: Rust with clap 4, ratatui, rustyline, syntect, crossterm.
- **Build and CI**: pnpm 9.15, Vite 7, GitHub Actions, Playwright, Vitest,
  ESLint 9 + Prettier, Husky + lint-staged + commitlint.

`apps/web/db/neon` is an immutable, contiguous migration chain checked
against `public.schema_migrations` by exact SHA-256. The runner reads
`AGI_DATABASE_URL`, `DATABASE_URL`, or `NEON_DATABASE_URL` and never prints a
credential. `pnpm db:migrate -- status|apply|verify`; production apply
requires `--confirm-production`; baselining requires `--confirm-baseline`
plus a sequence, reason, and evidence, and runs only after branch
verification (`pnpm db:rls-probe -- --target local|ci|branch`).

## Setup

| Tool                              | Version |
| --------------------------------- | ------- |
| Node.js                           | 24      |
| pnpm                              | 9.15.3  |
| Rust                              | 1.94.0  |
| Xcode (macOS, for mobile/desktop) | Latest  |
| Android SDK (for mobile)          | Latest  |

```bash
git clone https://github.com/siddharthanagula3/agiworkforce.git
cd agiworkforce
nvm use
corepack enable && corepack prepare pnpm@9.15.3 --activate
pnpm install
```

```bash
# Desktop (Tauri)
rustup install 1.94.0 && rustup default 1.94.0
brew install llvm tesseract   # macOS, only if building with OCR
pnpm dev:desktop

# Web (Next.js)
cp apps/web/.env.example apps/web/.env.local   # fill in required values
pnpm --filter @agiworkforce/web dev

# Mobile (Expo)
cp apps/mobile/.env.local.example apps/mobile/.env.local
pnpm --filter @agiworkforce/mobile dev   # then press 'i' or 'a'

# CLI
cargo run -p agiworkforce-cli --bin agi -- exec "hello"
cargo run -p agiworkforce-cli --bin agi   # interactive TUI

# Local infrastructure
docker compose up -d   # PostgreSQL 16 + pgAdmin at http://localhost:5050
```

## Environment variables

Each surface owns its environment contract in a tracked `.env.example`; never
commit `.env`, `.env.local`, signing credentials, or provider secrets.

| Surface          | Contract                                 | Local loading                                  |
| ---------------- | ---------------------------------------- | ---------------------------------------------- |
| Desktop          | `apps/desktop/.env.example`              | Vite loads `apps/desktop/.env.local`           |
| Web              | `apps/web/.env.example`                  | Next.js loads `apps/web/.env.local`            |
| Mobile           | `apps/mobile/.env.example`               | Expo loads `.env.local`; EAS uses EAS envs     |
| Chrome extension | `apps/extension/.env.example`            | Vite loads `apps/extension/.env.local`         |
| Signaling        | `services/signaling-server/.env.example` | Loads `services/signaling-server/.env` locally |

```bash
# Reads process.env only and prints key names, never values.
pnpm env:doctor -- --scope web --mode production
pnpm env:doctor -- --scope gateway --mode production
pnpm env:doctor -- --scope signaling --mode production

pnpm check:env-contract   # verifies templates, git tracking, no-tmp-credentials
```

## Testing and linting

```bash
pnpm lint                     # ESLint across all surfaces
pnpm lint:extension           # Chrome extension lint
pnpm format:check             # Prettier format check
pnpm typecheck:all            # TypeScript type check all packages

pnpm test                                    # all package tests (Vitest + Jest)
pnpm --filter @agiworkforce/desktop test     # desktop unit tests
pnpm --filter @agiworkforce/web test         # web unit tests
pnpm --filter @agiworkforce/desktop test:e2e # Playwright/WebdriverIO E2E
pnpm --filter @agiworkforce/web test:e2e     # web E2E (Playwright)

cargo check --workspace
cargo test -p agiworkforce-desktop -p agiworkforce-cli --lib
cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib -- -D warnings

pnpm check:llm-operability        # full repo organization and convention checks
pnpm check:agent-context-indexes  # agent context file validation
pnpm check:boundaries             # package boundary enforcement
pnpm check:model-catalog          # model catalog integrity
pnpm check:readme-facts           # this file's counts, versions, and provider names
```

## Deployment

CI runs on GitHub Actions for every push and pull request. Production is
gated on that same run: `.github/workflows/deploy-production.yml` only
accepts a successful, push-triggered CI run for the exact `main` commit,
checks out that SHA, builds with a pinned Vercel CLI, and deploys the
prebuilt artifact; `vercel.json` disables Vercel's own automatic Git
deployment for `main` so it cannot race the CI-gated path. A daily scheduled
run checks that production is serving the current `main` commit.

- **Signaling server**: `deploy-signaling-server.yml` deploys to Railway and
  Fly.io behind the same successful-CI, exact-SHA gate.
- **Desktop**: `release-desktop.yml` and `build-windows-release.yml` are
  built to ship Linux `.AppImage`/`.deb`/`.rpm`, a notarized macOS `.dmg`,
  and a signed Windows NSIS installer from a version tag; the most recently
  published release contains Linux artifacts only.
- **CLI**: `release-cli.yml` publishes a signed GitHub Release and the
  `@agiworkforce/cli` npm package from a git tag matching
  `apps/cli/Cargo.toml`; not every commit to `apps/cli` has one.
- **Mobile**: built with EAS. Release scripts for App Store and Play
  submission live in `apps/mobile/scripts/release/`, but no EAS build has
  been submitted to either store yet.

Full policy, protected variables, path filters, and runner budget are in
[`docs/development/ci-and-deploys.md`](docs/development/ci-and-deploys.md).

## Security and privacy

Trust boundaries: [`docs/architecture/trust-boundaries.md`](docs/architecture/trust-boundaries.md).
Key custody and rotation: [`docs/security/`](docs/security/). Report a
vulnerability privately through GitHub's advisory flow: [`SECURITY.md`](SECURITY.md).

- **Trust boundary enforcement**: Local, BYOK, and Managed Cloud are separate;
  local chats never silently route to cloud providers, and BYOK transitions
  require explicit consent with payload preview and secret scanning.
- **Encrypted local storage**: SQLCipher-encrypted SQLite on desktop;
  credentials in the OS keychain (Keychain, Credential Manager, Secret Service).
- **Sandbox policies**: `crates/agiworkforce-sandbox-policy` enforces
  execution policy; the CLI supports optional Linux seccomp filtering.
- **Input validation**: Zod schemas on API boundaries; Helmet and rate
  limiting on Express services.
- **Secure automation**: the computer-use loop enforces a
  `ComputerUseSafetyLayer` with shared dangerous-pattern guards and an
  allowlist for destructive operations.
- **Chrome Extension CSP**: strict policy with no `unsafe-inline`,
  localhost-only bridge connections, and native messaging validation.
- **CI security gates**: npm and cargo-audit, Semgrep OWASP/security scans,
  CodeQL analysis, and hardcoded-secret detection.

## Current status

**Active development, pre-v1.0 MVP.** The long-form surface order lives in
[`docs/product/requirements.md`](docs/product/requirements.md); day-to-day
sequencing follows the ordered release gate in
[`docs/work/implementation-status.md`](docs/work/implementation-status.md),
tracked per capability, row by row. Managed Cloud is in public alpha and open
by default (founder decision, 2026-06-27); metering and abuse controls must
keep pace with public usage, but no longer gate access.

## Contributing

- System overview: [`docs/architecture/overview.md`](docs/architecture/overview.md)
- Product intent: [`docs/product/definition.md`](docs/product/definition.md), then [`docs/product/requirements.md`](docs/product/requirements.md)
- For coding agents: [`docs/agent-context/`](docs/agent-context/)
- Builds and deployment: [`docs/development/ci-and-deploys.md`](docs/development/ci-and-deploys.md)

## License

Proprietary and confidential. © 2026 AGI Workforce. All rights reserved. See
[LICENSE](LICENSE) for details.
