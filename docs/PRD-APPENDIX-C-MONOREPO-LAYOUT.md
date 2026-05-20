# PRD V3 — Appendix C: Monorepo layout

**Parent:** [`docs/PRD.md`](PRD.md) | **Status:** locked | **Date:** 2026-05-17

This appendix specifies the monorepo tree, ownership boundaries, build commands per surface, env-var contract per surface, CI workflow contracts, and version pins as of May 2026.

---

## §C.1 — Tree (depth 3, ownership-annotated)

```
agiworkforce/
├── AGI_WORKFORCE.md                       # platform SSOT
├── MASTER_PLAN.md                         # per-surface decision trail
├── AGIWORKFORCE_IMPLEMENTATION_LOG.md     # milestone log
├── AUDIT_LOG.md                           # per-fire audit ledger
├── AGENTS.md                              # Codex agent rules (twin of CLAUDE.md)
├── CLAUDE.md                              # Claude Code agent rules
├── BUILD.md                               # prereqs + per-surface build commands
├── CHANGELOG.md
├── CONTRIBUTING.md                        # 7-line proprietary stub
├── LICENSE
├── README.md                              # user-facing
├── REFERENCE_INDEX.md                     # UI reference image catalog
├── REFERENCE_STRUCTURE.md
├── THIRD_PARTY_LICENSES.md                # OpenClaw MIT attribution
├── Cargo.toml                             # workspace: { members: [apps/desktop/src-tauri, apps/cli, crates/*] }
├── Cargo.lock
├── package.json                           # root workspace (pnpm)
├── pnpm-workspace.yaml                    # globs: apps/*, packages/*, packages/providers/*, services/*
├── pnpm-lock.yaml
├── tsconfig.base.json
├── commitlint.config.cjs
├── eslint.config.mjs                      # flat v9; AGI custom rules
├── vercel.json
├── docker-compose.yml                     # local dev (Postgres + pgAdmin)
├── docs/                                  # PRD owner: founder + platform engineering
│   ├── PRD.md                             # CANONICAL (this PRD V3)
│   ├── PRD-APPENDIX-A-DATA-MODELS.md
│   ├── PRD-APPENDIX-B-API-CONTRACTS.md
│   ├── PRD-APPENDIX-C-MONOREPO-LAYOUT.md  # this file
│   ├── PRD-RESOLUTIONS-AND-AUDIT.md
│   ├── VISION.md                          # one-chat-layout core realization
│   ├── ROADMAP.md
│   ├── PRICING.md
│   ├── ARCHITECTURE.md                    # ASCII cross-surface diagram
│   ├── BILLION_DOLLAR_PLAYBOOK.md
│   ├── PERFORMANCE.md
│   ├── SCALING.md
│   ├── HOSTING.md
│   ├── HANDOFF.md
│   ├── README.md                          # docs index
│   ├── cli-binary-size-2026-05-15.md
│   ├── design/
│   │   ├── design-spec-2026-05-15.md      # 16 locked design decisions
│   │   └── brand-mark-proposals/
│   │       ├── mark-a-nodes.svg
│   │       ├── mark-b-monogram.svg
│   │       ├── mark-c-prism.svg
│   │       └── preview.html
│   ├── decisions/                         # 18 ADRs dated 2026-05-09
│   ├── audit/                             # AUDIT_2026-05-03 + FIX_QUEUE
│   ├── architecture/                      # foundation-2026 + worker-protocol
│   ├── launch/                            # hobby-checklist + r-localllama + show-hn + twitter + wave-3-* + store-listings/
│   ├── planning/                          # cli-modernization-spec
│   ├── plans/                             # domain-first-reorg (proposed)
│   ├── research/                          # v1-product-validation
│   ├── security/                          # REVIEW + red-team + findings-* per surface
│   ├── superpowers/                       # plans + specs (UI audit)
│   └── archive/                           # pre-v3 + master-remediation + wave plans
├── apps/                                  # one ownership per surface
│   ├── desktop/                           # owner: desktop-engineer
│   │   ├── src/                           # 1,111 .ts/.tsx (React)
│   │   ├── src-tauri/                     # 749 .rs (Rust backend)
│   │   ├── e2e/                           # Playwright specs
│   │   ├── playwright.config.ts
│   │   ├── tauri.conf.json
│   │   ├── package.json
│   │   ├── Cargo.toml                     # workspace member
│   │   └── rust-toolchain.toml            # pin 1.95.0
│   ├── web/                               # owner: web-engineer
│   │   ├── app/                           # Next.js 16.2.x routes (67 top-level dirs)
│   │   ├── features/                      # 11 domain folders
│   │   ├── components/                    # shared UI
│   │   ├── core/                          # server logic (8 domains)
│   │   ├── services/                      # auth, supabase, error, download
│   │   ├── lib/                           # rate-limit, stripe-config, supabase-server, …
│   │   ├── stores/                        # client state (Zustand)
│   │   ├── hooks/                         # 14 React hooks
│   │   ├── providers/                     # ThemeProvider
│   │   ├── shared/                        # cross-domain primitives
│   │   ├── supabase/                      # LEGACY — DELETE in W6 per Appendix A §A.9
│   │   ├── proxy.ts                       # Next.js 16 middleware-replacement
│   │   ├── package.json                   # next: ^16.2.6
│   │   ├── next.config.ts
│   │   └── vercel.json
│   ├── mobile/                            # owner: mobile-engineer
│   │   ├── app/                           # Expo Router (45 .tsx screens)
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/                           # mmkv-encryption, secureFetch
│   │   ├── services/                      # 30 files: dispatchRealtime, voice, …
│   │   ├── stores/                        # 20 Zustand stores
│   │   ├── types/
│   │   ├── assets/
│   │   ├── app.config.js
│   │   ├── app.json                       # ios.bundleIdentifier com.agiworkforce.app
│   │   ├── eas.json
│   │   ├── package.json                   # react-native: 0.84.0; expo: ~55.0.23
│   │   └── EAS_SIGNING_RUNBOOK.md
│   ├── cli/                               # owner: cli-engineer
│   │   ├── src/                           # 289 .rs (incl. TUI ~155K LOC)
│   │   ├── npm/                           # @agiworkforce/cli npm shim
│   │   ├── Cargo.toml                     # workspace member
│   │   ├── README.md
│   │   └── ARCHITECTURE.md
│   ├── extension/                         # Chrome MV3 — owner: chrome-ext-engineer
│   │   ├── src/                           # 58 .ts (background, popup, sidepanel, content, autofill)
│   │   ├── native-host/                   # com.agiworkforce.browser.json.template + INSTALL.md
│   │   ├── __tests__/                     # 22 test files
│   │   ├── manifest.json                  # MV3 v1.2.0
│   │   └── package.json
│   └── extension-vscode/                  # owner: vscode-ext-engineer
│       ├── src/                           # 78 .ts (extension + providers + chatParticipant)
│       ├── __tests__/                     # 27 test files / 352 cases
│       ├── package.json                   # contributes: 62 commands, 25 settings, 13 keybindings
│       ├── CHANGELOG.md
│       └── MARKETPLACE_PUBLISH_RUNBOOK.md
├── packages/                              # shared TS — owner: platform
│   ├── unified-chat/                      # 245 files — active chat UX
│   ├── api/                               # 116 — HTTP wrappers
│   ├── types/                             # 105 — billing-catalog + model-catalog + provider-adapter
│   ├── providers/                         # 81 — 8 adapters
│   ├── runtime/                           # 47 — detect (isTauri, isCloudWeb)
│   ├── llm-normalize/                     # 30 / 2,633 LOC — cross-provider tool-schema norm
│   ├── llm-runtime/                       # 27 — retries / fallback orchestration
│   ├── utils/                             # 24
│   ├── data-layer/                        # 16 — Supabase / Postgres / Neon adapter
│   ├── skills/                            # 15 — markdown + YAML-frontmatter skill loader
│   ├── apply-patch/                       # 12 — diff applicator (workspaceOnly default)
│   ├── browser-tool/                      # 11 — Playwright wrapper (evaluate gated default-false)
│   ├── routing/                           # 10 — slot classifier
│   ├── mcp/                               # 9 — MCP client (3 transports)
│   ├── stores/                            # 2 — aggregator stub
│   ├── design-tokens/                     # 2 — color palette (teal #21808d, terracotta #da7756)
│   └── react-native-worklets/             # planned, empty
├── services/                              # backend — owner: platform
│   ├── api-gateway/                       # Express 5.2 (15 routes, 6 middleware, WS) — Fly.io
│   └── signaling-server/                  # WebRTC signaling — Fly.io
├── crates/                                # Rust shared — owner: cli-engineer + desktop-engineer
│   ├── agiworkforce-protocol/             # shared data types
│   ├── agiworkforce-app-server/           # JSON-RPC stdio + WS transport for IDE clients
│   ├── agiworkforce-apply-patch/          # patch parser + fs applier
│   ├── agiworkforce-async-utils/          # tokio cancellation tokens
│   ├── agiworkforce-command-registry/     # claude-style command registry
│   ├── agiworkforce-execpolicy/           # starlark exec-rule eval
│   ├── agiworkforce-network-proxy/        # MITM HTTP proxy + cert gen
│   ├── agiworkforce-plugin-runtime/       # 5 manifest formats
│   ├── agiworkforce-task-runtime/         # async-task RwLock state mgmt
│   ├── sandbox-policy/                    # sandbox-type enum
│   └── agiworkforce-utils-*               # 7 utility crates
├── supabase/                              # CANONICAL migrations dir
│   ├── migrations/                        # 43 .sql files
│   └── README.md
├── ios/                                   # native iOS bundle for Mobile
├── examples/                              # reference apps
│   ├── multi-provider-chat.ts             # 120-line demo
│   ├── google-batch-api.ts                # batch-API tutorial
│   ├── hooks/                             # 6 example hooks
│   └── fullstack-saas/                    # full Next 16 + Supabase + Redis + Terraform reference
├── tasks/                                 # working files
│   ├── todo.md
│   ├── auto-routing-spec.md               # frozen 2026-05-07
│   ├── launch-checklist-2026-07-18.md
│   ├── launch-readiness-2026-05-15.md
│   ├── launch-readiness-wave2-plan.md
│   ├── lessons.md
│   └── research/                          # exec reports
├── reports/
│   ├── frontend-parity-r1/
│   └── frontend-reference-comparison/
├── audit/                                 # raw scan output
│   ├── scan_dead.txt
│   ├── scan_network.txt
│   ├── scan_paths.txt
│   ├── scan_service_role.txt
│   ├── scan_tool_escape.txt
│   ├── scan_xss.txt
│   └── reports/
├── reference-index/                       # generated shards
│   └── shard-{00..09}.md                  # shard-08-recovery.md DELETED in W6
├── scripts/                               # repo-wide scripts (18 files)
├── dev-scripts/                           # dev-time helpers
├── .github/
│   └── workflows/                         # 10 yml files
└── .claude/
    └── agents/                            # 7 custom agent defs (desktop, web, mobile, cli, chrome, vscode, supervisor)
```

**Ownership note:** every directory listed has a primary owner in `.claude/agents/<surface>-engineer.md`. Cross-cutting concerns (packages, services, docs, supabase) belong to the founder + platform.

---

## §C.2 — Per-surface build commands

### Repo-wide

```bash
pnpm install                  # first-time / after lockfile change
pnpm lint                     # eslint --max-warnings=0 (excludes apps/extension)
pnpm lint:extension           # lint apps/extension separately
pnpm typecheck                # desktop typecheck only
pnpm typecheck:all            # tsc --noEmit across every TS workspace
pnpm test                     # vitest across every TS workspace
pnpm format                   # prettier --write .
```

### Desktop (`apps/desktop`)

```bash
pnpm dev:desktop                              # Tauri hot-reload
pnpm build:desktop                            # bundles → apps/desktop/src-tauri/target/release/bundle/
pnpm --filter desktop exec playwright test    # e2e
```

Output: macOS `.dmg`, Windows `.msi`, Linux `.AppImage` / `.deb` (in `apps/desktop/src-tauri/target/release/bundle/`).

### Web (`apps/web`)

```bash
pnpm --filter web dev                         # Next.js 16 dev @ localhost:3000
pnpm --filter web build                       # builds desktop SPA → public/chat, then next build
pnpm --filter web test                        # vitest
pnpm --filter web exec playwright test        # e2e
```

The web build is unusual: Vite builds the desktop SPA, copies into `apps/web/public/chat/`, then `next build`. See `apps/web/package.json:scripts.build`.

### Mobile (`apps/mobile`)

```bash
pnpm --filter @agiworkforce/mobile start      # Expo dev server
pnpm --filter @agiworkforce/mobile ios        # iOS simulator
pnpm --filter @agiworkforce/mobile android    # Android emulator
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit
```

### CLI (`apps/cli`)

```bash
cargo build --release -p agiworkforce-cli     # release binary
cargo run    -p agiworkforce-cli -- exec "..."
cargo test   -p agiworkforce-cli              # ~1,337 unit tests
cargo clippy --workspace --lib -- -D warnings -D unsafe-code
```

Distribution: Homebrew tap + `install.sh` curl script + npm shim + GitHub Release.

### Chrome extension (`apps/extension`)

```bash
pnpm --filter @agiworkforce/extension dev     # rebuild on file change
pnpm --filter @agiworkforce/extension build   # → apps/extension/dist/
pnpm --filter @agiworkforce/extension package # → extension.zip for CWS upload
pnpm --filter @agiworkforce/extension test    # 596 cases / 22 files
```

### VS Code extension (`apps/extension-vscode`)

```bash
pnpm --filter agi-workforce build             # → .vsix
pnpm --filter agi-workforce test              # 352 cases / 20 suites
vsce publish                                   # marketplace publish
```

### Rust (CLI + Tauri backend) — repo-wide

```bash
cargo check --workspace                       # fast type check
cargo build --release --workspace
cargo test --workspace --lib
```

---

## §C.3 — Environment variable contract

### Desktop (`apps/desktop`)

Read at startup from OS env. Most are optional except where noted.

| Var                 | Purpose                                                      | Required        |
| ------------------- | ------------------------------------------------------------ | --------------- |
| `SUPABASE_URL`      | Cloud mode endpoint                                          | Cloud mode only |
| `SUPABASE_ANON_KEY` | Anon-tier key                                                | Cloud mode only |
| `OLLAMA_HOST`       | Local Ollama base URL (default `http://localhost:11434`)     | Local mode      |
| `LMSTUDIO_HOST`     | Local LMStudio base URL (default `http://localhost:1234/v1`) | Local mode      |
| `TAURI_DEV`         | Hot-reload flag                                              | dev only        |
| `RUST_LOG`          | Tracing level                                                | optional        |

### Web (`apps/web`)

| Var                                         | Purpose                                           | Required         |
| ------------------------------------------- | ------------------------------------------------- | ---------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                  | Browser-exposed Supabase URL                      | yes              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`             | Browser-exposed anon key                          | yes              |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Server-only; restricted to admin / webhook routes | yes (production) |
| `SUPABASE_JWT_SECRET`                       | For server-side JWT verification                  | yes              |
| `STRIPE_SECRET_KEY`                         | Stripe SDK init                                   | yes (prod)       |
| `STRIPE_WEBHOOK_SECRET`                     | HMAC verify on `/api/stripe-webhook`              | yes (prod)       |
| `STRIPE_PRICE_HOBBY_MONTHLY`                | Stripe price ID                                   | yes              |
| `STRIPE_PRICE_HOBBY_YEARLY`                 | Stripe price ID                                   | yes              |
| `STRIPE_PRICE_PRO_MONTHLY`                  | Stripe price ID                                   | yes              |
| `STRIPE_PRICE_PRO_YEARLY`                   | Stripe price ID                                   | yes              |
| `STRIPE_PRICE_PRO_PLUS_MONTHLY`             | Stripe price ID                                   | yes              |
| `STRIPE_PRICE_PRO_PLUS_YEARLY`              | Stripe price ID                                   | yes              |
| **`STRIPE_PRICE_PRO_MAX_MONTHLY`** (W6 NEW) | Stripe price ID for Pro Max                       | **W6**           |
| **`STRIPE_PRICE_PRO_MAX_YEARLY`** (W6 NEW)  | Stripe price ID for Pro Max                       | **W6**           |
| `STRIPE_PRICE_MAX_MONTHLY`                  | Stripe price ID                                   | yes              |
| `STRIPE_PRICE_MAX_YEARLY`                   | Stripe price ID                                   | yes              |
| `STRIPE_PRICE_ENTERPRISE_*`                 | enterprise prices                                 | contact-sales    |
| `UPSTASH_REDIS_REST_URL`                    | Rate-limit store                                  | yes (prod)       |
| `UPSTASH_REDIS_REST_TOKEN`                  | Rate-limit store                                  | yes (prod)       |
| `ANTHROPIC_API_KEY`                         | Managed-cloud routing                             | yes (managed)    |
| `OPENAI_API_KEY`                            | Managed-cloud routing                             | yes (managed)    |
| `GOOGLE_API_KEY`                            | Managed-cloud routing                             | yes (managed)    |
| `DEEPGRAM_API_KEY`                          | Voice STT cloud                                   | yes (voice)      |
| `RUNWAY_API_KEY`                            | Video gen (Pro+ / Max managed BYOK on-behalf)     | optional         |
| `CRON_SECRET`                               | `/api/cron/*` shared secret                       | yes (prod)       |
| `CRON_DEV_BYPASS`                           | Dev-time bypass co-flag                           | dev only         |
| `SIGNALING_INTERNAL_SECRET`                 | api-gateway → signaling-server HMAC               | yes (prod)       |
| `NEXT_PUBLIC_SENTRY_DSN`                    | Browser Sentry                                    | optional         |
| `SENTRY_DSN`                                | Server Sentry                                     | optional         |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`             | GA4                                               | optional         |

### Mobile (`apps/mobile`)

| Var                             | Purpose                    | Required |
| ------------------------------- | -------------------------- | -------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase URL               | yes      |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key                   | yes      |
| `EXPO_PUBLIC_GATEWAY_URL`       | api-gateway base           | yes      |
| `EXPO_PUBLIC_SIGNALING_URL`     | signaling-server WS URL    | yes      |
| `EAS_BUILD_PROFILE`             | dev / preview / production | varies   |

### CLI (`apps/cli`)

CLI does not require env vars at runtime; reads `~/.agiworkforce/config.toml`. For OAuth helpers:

| Var                 | Purpose                     |
| ------------------- | --------------------------- |
| `ANTHROPIC_API_KEY` | BYOK fallback when no OAuth |
| `OPENAI_API_KEY`    | BYOK fallback               |
| `GOOGLE_API_KEY`    | BYOK fallback               |
| `OLLAMA_API_KEY`    | Ollama Cloud (not Local)    |
| `OLLAMA_HOST`       | Local Ollama base           |

### Chrome ext (`apps/extension`)

Reads `chrome.storage.local`:

- `agi_bridge_url` (default `http://localhost:8787`)
- `agi_bridge_auth_token` (HMAC-signed by desktop at pairing)
- `agi_byok_consent_accepted_at` (web parity of mobile consent)

### VS Code ext (`apps/extension-vscode`)

Reads VS Code `workspace.getConfiguration()`:

- `agiWorkforce.apiEndpoint`
- `agiWorkforce.model`
- `agiWorkforce.streamingEnabled`
- `agiWorkforce.contextLines`
- `agiWorkforce.fallbackToVscodeLm`
- `agiWorkforce.telemetryEnabled`
- `agiWorkforce.hoverEnabled`
- `agiWorkforce.codeLensEnabled`
- `agiWorkforce.autoApplyFixes`
- `agiWorkforce.inlineCompletions.{enabled,debounceMs,maxLength}`
- `agiWorkforce.agent.{mode,effort,maxIterations}`
- `agiWorkforce.mcp.enabled`
- `agiWorkforce.desktopBridge.{enabled,port}`
- `agiWorkforce.telemetryEndpoint`
- `agiWorkforce.useProviderStream`
- `agiWorkforce.gatewayUrl`
- `agiWorkforce.providerStreamProvider`
- `agiWorkforce.tier` (read-only after auth)

API keys via `vscode.SecretStorage`.

### services/api-gateway

Same set as Web for Supabase + Stripe + provider keys + signaling. Plus:

- `PORT` (default 3000)
- `ALLOWED_ORIGINS` (comma list)
- `TRUST_PROXY` (Fly.io needs `'loopback'`)

### services/signaling-server

| Var                         | Purpose                |
| --------------------------- | ---------------------- |
| `NODE_ENV`                  | `production` in Fly.io |
| `ADMIN_API_KEY`             | `/metrics`, `/admin/*` |
| `SIGNALING_INTERNAL_SECRET` | api-gateway pairing    |
| `ALLOWED_ORIGINS`           | CORS                   |

---

## §C.4 — CI workflow contracts (.github/workflows)

10 workflows. Each declares: trigger, what it gates, secrets required.

| Workflow                      | Trigger                              | Gates                                                               | Required secrets                                                                              |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ci.yml`                      | `push`/`pr` to `main`, `claude/*`    | Build + lint + typecheck + test on all surfaces                     | none                                                                                          |
| `release.yml`                 | tag `v*`                             | Repo-wide release notes                                             | none                                                                                          |
| `release-desktop.yml`         | tag `v*`                             | Tauri build + macOS notarization + Windows EV sign                  | `APPLE_*` (notarization), `WINDOWS_CERTIFICATE_*` (EV), `D2PR62RLT4` (macOS signing identity) |
| `release-cli.yml`             | tag `v*`                             | Cargo build per-platform binary, npm publish, Homebrew tap update   | `NPM_TOKEN`                                                                                   |
| `build-windows-release.yml`   | manual / scheduled                   | Windows-only canary                                                 | `WINDOWS_CERTIFICATE_*`                                                                       |
| `e2e-tests.yml`               | pr-on-main                           | Playwright across surfaces                                          | none                                                                                          |
| `deploy-signaling-server.yml` | push to `services/signaling-server/` | Fly.io deploy                                                       | `FLY_API_TOKEN`                                                                               |
| `codeql.yml`                  | push, schedule                       | Security scan                                                       | none                                                                                          |
| `agiworkforce-bot.yml`        | issue / pr events                    | Bot automation                                                      | `GITHUB_TOKEN`                                                                                |
| `actions-pinned-check.yml`    | push                                 | Asserts every action `uses:` pin is a SHA, not a tag (supply-chain) | none                                                                                          |

**W6 deliverable:** add a "secrets present" job to `actions-pinned-check.yml` that prints `WARN: <secret> missing` for unset `NPM_TOKEN` / `APPLE_*` / `WINDOWS_CERTIFICATE*`. Surfaces missing secrets without failing CI.

---

## §C.5 — Version pins (May 2026)

Languages / toolchains (pin in `package.json` engines or `rust-toolchain.toml`):

| Item       | Pin                        | Source                                                                       |
| ---------- | -------------------------- | ---------------------------------------------------------------------------- |
| Node       | 22.x LTS                   | `.nvmrc`                                                                     |
| pnpm       | 9.15.3 (W7 plan: 11.1.x)   | `package.json` `packageManager` field                                        |
| TypeScript | 5.9.3 (pnpm overrides)     | root `package.json` `pnpm.overrides`                                         |
| Rust       | 1.95.0 (W6: 1.96.0 May 28) | `apps/desktop/src-tauri/rust-toolchain.toml`, `apps/cli/rust-toolchain.toml` |

Frontend:

| Item         | Pin                               | Notes                                 |
| ------------ | --------------------------------- | ------------------------------------- |
| Next.js      | 16.2.x                            | apps/web (proxy.ts not middleware.ts) |
| React        | 19.2.6                            | shared                                |
| Tailwind CSS | 4.3.x                             |                                       |
| Vite         | 8.0.x                             | Desktop SPA + monorepo bundling       |
| Zustand      | 5.0.13                            | shared                                |
| Playwright   | 1.59.x (1.60.0 has compat issues) |                                       |

Desktop:

| Item                           | Pin           |
| ------------------------------ | ------------- |
| Tauri                          | 2.11.1        |
| `@tauri-apps/api`              | 2.x           |
| `tauri-plugin-global-shortcut` | latest stable |
| `enigo`, `rdev`, `xcap`        | latest        |

Mobile:

| Item         | Pin                                     |
| ------------ | --------------------------------------- |
| Expo SDK     | 55.0.23                                 |
| React Native | 0.84.0                                  |
| Reanimated   | 4.3.1                                   |
| MMKV         | 4.3.1 (was 3.2.x in V2 — W6 major bump) |
| NativeWind   | 4.2.3                                   |

SDKs:

| Item                                | Pin                                                       |
| ----------------------------------- | --------------------------------------------------------- |
| `@anthropic-ai/sdk`                 | 0.96.x                                                    |
| `openai`                            | 6.38.x                                                    |
| `@supabase/supabase-js`             | 2.105.x                                                   |
| `@modelcontextprotocol/sdk`         | 1.29.x (spec date 2025-11-25)                             |
| Stripe Node SDK API version         | `2026-04-22.dahlia` (W6 upgrade from `2026-02-25.clover`) |
| `pino`, `zod`, `eslint`, `prettier` | latest stable                                             |

---

## §C.6 — Service boundaries

| Boundary                                         | Crosses via                                 | Auth                        |
| ------------------------------------------------ | ------------------------------------------- | --------------------------- |
| Desktop frontend ↔ Desktop backend               | `invoke()` IPC (1,488 commands)             | none (same process)         |
| Desktop ↔ services/api-gateway                   | HTTPS REST + WS                             | `user-jwt`                  |
| Mobile ↔ services/api-gateway                    | HTTPS REST                                  | `user-jwt`                  |
| Chrome ext ↔ Desktop                             | localhost:8787 HTTP + (W6) native messaging | HMAC token from pairing     |
| VS Code ext ↔ Desktop                            | localhost:8787 WebSocket                    | HMAC token                  |
| services/api-gateway ↔ Supabase                  | direct SDK (server)                         | service-role-restricted     |
| services/api-gateway ↔ services/signaling-server | HTTPS + WS                                  | `SIGNALING_INTERNAL_SECRET` |
| Web ↔ Supabase                                   | server SDK + browser anon                   | RLS-enforced                |
| Web ↔ Stripe                                     | `stripe-node` SDK                           | `STRIPE_SECRET_KEY`         |
| Mobile ↔ Desktop (Dispatch)                      | Supabase Realtime channel                   | HMAC v2 envelope            |
| CLI ↔ Anthropic / OpenAI / Google / etc.         | vendor SDK or REST                          | user OAuth or BYOK          |
| CLI ↔ MCP servers                                | stdio                                       | OAuth or anonymous          |

---

## §C.7 — Shared-package consumer matrix

Who imports what:

| Package                       | Desktop             | Web                          | Mobile  | CLI           | Chrome | VS Code |
| ----------------------------- | ------------------- | ---------------------------- | ------- | ------------- | ------ | ------- |
| `@agiworkforce/types`         | ✅                  | ✅                           | ✅      | (Rust mirror) | ✅     | ✅      |
| `@agiworkforce/runtime`       | ✅                  | ✅                           | ✅      | —             | ✅     | ✅      |
| `@agiworkforce/unified-chat`  | ✅ (active chat)    | ✅ (via WebRuntime fallback) | partial | —             | —      | —       |
| `@agiworkforce/providers`     | ✅ (proxy via Rust) | ✅                           | ✅      | (own impl)    | ✅     | ✅      |
| `@agiworkforce/llm-normalize` | ✅                  | ✅                           | ✅      | —             | —      | —       |
| `@agiworkforce/llm-runtime`   | ✅                  | ✅                           | ✅      | —             | —      | —       |
| `@agiworkforce/api`           | ✅                  | ✅                           | ✅      | —             | ✅     | ✅      |
| `@agiworkforce/mcp`           | ✅ (host)           | ✅                           | ✅      | (Rust impl)   | ✅     | ✅      |
| `@agiworkforce/skills`        | ✅                  | —                            | —       | (Rust impl)   | —      | —       |
| `@agiworkforce/apply-patch`   | ✅                  | —                            | —       | (Rust crate)  | —      | ✅      |
| `@agiworkforce/browser-tool`  | ✅                  | —                            | —       | —             | ✅     | —       |
| `@agiworkforce/design-tokens` | ✅                  | ✅                           | ✅      | —             | ✅     | ✅      |
| `@agiworkforce/data-layer`    | ✅                  | ✅                           | ✅      | —             | —      | —       |
| `@agiworkforce/routing`       | —                   | ✅                           | ✅      | —             | —      | —       |
| `@agiworkforce/stores`        | —                   | (legacy aggregator)          | —       | —             | —      | —       |
| `@agiworkforce/utils`         | ✅                  | ✅                           | ✅      | —             | ✅     | ✅      |

Rust crates consumed by CLI + Desktop backend:

- `agiworkforce-protocol`, `sandbox-policy`, `agiworkforce-execpolicy`, `agiworkforce-network-proxy`, `agiworkforce-async-utils`, `agiworkforce-plugin-runtime`, `agiworkforce-task-runtime`, `agiworkforce-apply-patch`, `agiworkforce-command-registry`, `agiworkforce-app-server`, plus 7 utility crates.

---

## §C.8 — Commit + PR conventions

- **Conventional Commits.** Header: `<type>(<scope>): <subject>`. Lowercase, ≤100 chars. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `style`.
- **Footer:** every commit must include `Co-Authored-By: <name> <email>`.
- **Branch naming:** `claude/<short-purpose>-<random-suffix>` for AI-authored work; `<author>/<feature>` for human-authored.
- **PR body** must answer three questions: what changed, why, how tested.

Enforcement: `commitlint.config.cjs` (root). Husky `lint-staged` runs eslint + prettier on staged files.

---

_End of Appendix C. See [`PRD-RESOLUTIONS-AND-AUDIT.md`](PRD-RESOLUTIONS-AND-AUDIT.md) for the consolidated audit and document classification._
