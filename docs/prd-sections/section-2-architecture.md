# AGI Workforce — Product Requirements Document
## Section 2: Technical Architecture

**Document version**: 1.0.0
**Last updated**: 2026-02-26
**Status**: Living document — update on each major release
**Owner**: Engineering Team

---

## 2.1 Architecture Overview

AGI Workforce is a monorepo containing five deployable applications, two shared packages, two backend services, and a comprehensive CI/CD pipeline. The desktop application is the primary product and contains the full AI agent runtime in its Rust backend. The remaining applications (web, browser extension, API gateway, signaling server) extend the platform's reach to browsers, mobile devices, and team-level management.

The central design principle is **local-first with optional cloud**: the desktop app is fully functional with no cloud connectivity. Cloud features (billing, sync, team collaboration) augment but never gate core functionality.

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's Machine                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Desktop App (Tauri v2)                     │  │
│  │                                                              │  │
│  │  ┌─────────────────────────┐  ┌──────────────────────────┐  │  │
│  │  │  React 19 Frontend      │  │    Rust Backend           │  │  │
│  │  │  (TypeScript 5.9.3)     │◄─►│    (Tokio async runtime) │  │  │
│  │  │  296 components         │  │    87 command modules     │  │  │
│  │  │  41 Zustand stores      │  │    579 source files       │  │  │
│  │  └─────────────────────────┘  └──────────┬───────────────┘  │  │
│  │                                          │                   │  │
│  │                                          ▼                   │  │
│  │                              ┌───────────────────────┐      │  │
│  │                              │  SQLite (SQLCipher)    │      │  │
│  │                              │  Encrypted local DB   │      │  │
│  │                              └───────────────────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────┐     ┌──────────────────────────────────────┐ │
│  │ Chrome Extension │────►│  Native Messaging Bridge             │ │
│  │ (MV3)            │     │  (Rust ↔ Browser IPC)                │ │
│  └──────────────────┘     └──────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ HTTPS / WebSocket
           ┌──────────────────────┼────────────────────────┐
           ▼                      ▼                        ▼
┌──────────────────┐  ┌──────────────────────┐  ┌────────────────────┐
│   LLM Providers  │  │   Web App (Vercel)   │  │  API Gateway       │
│   (cloud + local)│  │   Next.js 16         │  │  Express.js        │
│                  │  │   Supabase Auth      │  │  /auth /sync       │
│  Anthropic       │  │   Stripe Payments    │  │  /mobile /credits  │
│  OpenAI          │  └──────────────────────┘  └────────────────────┘
│  Google          │                                       │
│  Mistral         │  ┌──────────────────────┐  ┌────────────────────┐
│  Groq            │  │  Supabase            │  │  Signaling Server  │
│  DeepSeek        │  │  PostgreSQL + Auth   │  │  WebRTC Pairing    │
│  Ollama (local)  │  │  + Storage + Realtime│  │  Express.js + ws   │
│  LM Studio       │  └──────────────────────┘  └────────────────────┘
│  vLLM / llama.cpp│
│  OpenRouter      │  ┌──────────────────────┐
│  Together.ai     │  │  MCP Servers         │
│  Fireworks       │  │  Gmail, Calendar     │
└──────────────────┘  │  Vercel, n8n, etc.   │
                       └──────────────────────┘
```

---

## 2.2 Monorepo Structure

The repository uses pnpm workspaces (v9.15.3) with Node.js >= 22.12.0. The Rust workspace root is at `Cargo.toml` with a single member (`apps/desktop/src-tauri`).

```
~/Desktop/agiworkforce/                    # Monorepo root
├── apps/
│   ├── desktop/                           # Primary product: Tauri v2 desktop app
│   │   ├── src-tauri/                     # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── main.rs                # Entry point
│   │   │   │   ├── lib.rs                 # Tauri app builder, plugin registration
│   │   │   │   ├── automation/            # Desktop UI automation
│   │   │   │   │   ├── cdp/               # Chrome DevTools Protocol client
│   │   │   │   │   ├── computer_use/      # Vision-based screen interaction
│   │   │   │   │   └── input_sim/         # Keyboard + mouse simulation
│   │   │   │   ├── core/                  # AI engine (primary business logic)
│   │   │   │   │   ├── agent/             # AutonomousAgent, BackgroundAgent
│   │   │   │   │   ├── agi/               # AGI orchestration layer
│   │   │   │   │   ├── llm/               # LLM router, SSE parser, provider adapters
│   │   │   │   │   ├── mcp/               # MCP client (stdio, SSE, HTTP)
│   │   │   │   │   ├── swarm/             # Multi-agent swarm (TaskDecomposer, up to 100)
│   │   │   │   │   ├── embeddings/        # Local embedding generation
│   │   │   │   │   ├── research/          # Agentic research orchestrator
│   │   │   │   │   ├── skills/            # SKILL.md runtime, skill registry
│   │   │   │   │   ├── scheduler/         # Cron-based background scheduling
│   │   │   │   │   ├── intent/            # Intent classification
│   │   │   │   │   ├── artifacts/         # Canvas, code, image artifact management
│   │   │   │   │   ├── hooks/             # Pre/post tool execution hooks
│   │   │   │   │   └── codebase/          # Codebase indexing and search
│   │   │   │   ├── data/                  # Data layer
│   │   │   │   │   ├── db/                # SQLite schema, migrations, queries
│   │   │   │   │   ├── settings/          # User settings persistence
│   │   │   │   │   ├── database_connections/ # External DB connectors (PG, MySQL, Mongo, Redis)
│   │   │   │   │   ├── cache/             # In-process caching
│   │   │   │   │   ├── analytics/         # Usage analytics (local)
│   │   │   │   │   ├── metrics/           # Performance metrics
│   │   │   │   │   └── state/             # Cross-module state bus
│   │   │   │   ├── features/              # Product feature modules
│   │   │   │   │   ├── speech/            # STT (Whisper, Deepgram) + TTS (Piper, macOS)
│   │   │   │   │   ├── terminal/          # Shell command execution
│   │   │   │   │   ├── calendar/          # OAuth calendar (Google, Outlook)
│   │   │   │   │   ├── communications/    # IMAP/SMTP email
│   │   │   │   │   ├── document/          # PDF, DOCX, XLSX read/write
│   │   │   │   │   ├── messaging/         # In-app messaging
│   │   │   │   │   ├── productivity/      # Task management
│   │   │   │   │   ├── canvas/            # Visual canvas rendering
│   │   │   │   │   ├── search/            # Cross-app search
│   │   │   │   │   ├── tasks/             # Autonomous task queue
│   │   │   │   │   ├── teams/             # Team collaboration
│   │   │   │   │   ├── workflows/         # n8n-style workflow runner
│   │   │   │   │   ├── projects/          # Project context management
│   │   │   │   │   ├── clipboard/         # Clipboard monitor + history
│   │   │   │   │   └── updater/           # Auto-update (Tauri updater plugin)
│   │   │   │   ├── integrations/          # External service integrations
│   │   │   │   │   ├── cloud_storage/     # Drive, Dropbox, OneDrive
│   │   │   │   │   ├── native_messaging/  # Chrome extension bridge
│   │   │   │   │   ├── media/             # Image/video generation APIs
│   │   │   │   │   ├── realtime/          # WebSocket / SSE relay
│   │   │   │   │   └── sync/              # Cross-device sync
│   │   │   │   └── sys/                   # System and infrastructure
│   │   │   │       ├── commands/          # Tauri invoke command handlers (87 modules)
│   │   │   │       ├── security/          # ToolGuard, SecretManager, permissions
│   │   │   │       ├── telemetry/         # Optional telemetry (opt-in)
│   │   │   │       ├── diagnostics/       # Health checks, self-diagnostics
│   │   │   │       ├── filesystem/        # File system abstraction
│   │   │   │       ├── logging/           # Structured logging (tracing crate)
│   │   │   │       ├── permissions/       # OS permission requests (camera, mic, accessibility)
│   │   │   │       ├── billing/           # Stripe integration (feature-flagged)
│   │   │   │       ├── account/           # User account state
│   │   │   │       ├── api/               # HTTP client pool
│   │   │   │       └── error/             # Error taxonomy + friendly message mapping
│   │   │   ├── Cargo.toml                 # v1.1.5, edition 2021
│   │   │   └── capabilities/default.json  # Tauri capability declarations
│   │   ├── src/                           # React/TypeScript frontend
│   │   │   ├── components/                # 296 UI components across 70+ folders
│   │   │   ├── stores/                    # 41 Zustand stores (v5 + Immer + Persist)
│   │   │   ├── hooks/                     # 60+ custom React hooks
│   │   │   ├── api/                       # Tauri invoke() wrappers
│   │   │   ├── constants/                 # LLM model catalog (llm.ts, ~65K chars)
│   │   │   ├── services/                  # Frontend services (model router, subscription)
│   │   │   ├── lib/                       # Frontend utilities
│   │   │   └── types/                     # TypeScript type definitions
│   │   └── package.json                   # v1.1.5
│   ├── web/                               # Next.js 16 web application
│   │   ├── app/                           # App Router pages + 100+ API route handlers
│   │   ├── components/                    # React components
│   │   ├── stores/                        # Zustand stores
│   │   ├── lib/                           # supabase, stripe, csrf, cors, pino logger
│   │   └── middleware.ts                  # Auth, CSP headers, session refresh
│   └── extension/                         # Chrome MV3 browser extension
│       ├── manifest.json                  # v1.1.0, MV3
│       └── src/                           # background.js, content.js, side_panel/
├── packages/
│   ├── types/                             # @agiworkforce/types — shared TS types
│   │   └── src/                           # context, signaling, tauri, errors, customModel, prompt-enhancement
│   └── utils/                             # @agiworkforce/utils — shared utilities
│       └── src/                           # SignalingClient, validation, format, async, error
├── services/
│   ├── api-gateway/                       # Express.js API gateway (port 3000)
│   │   └── src/                           # routes: auth, desktop, sync, mobile, credits
│   └── signaling-server/                  # WebRTC pairing server
│       └── src/                           # HTTP endpoints, WebSocket, pairing sessions
├── supabase/                              # 16+ Supabase migration files
├── scripts/                               # Build and deploy utilities
├── .github/                               # CI/CD workflow definitions
├── .claude/                               # AI agent config (23 agents, skills, hooks)
├── docs/                                  # Documentation
├── package.json                           # Root pnpm monorepo config
├── pnpm-workspace.yaml                    # Workspace: apps/*, packages/*, services/*, tools/*
├── Cargo.toml                             # Rust workspace (single member)
└── docker-compose.yml                     # Local dev: PostgreSQL 16 + pgAdmin 4
```

---

## 2.3 Technology Stack

### 2.3.1 Desktop Application

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop framework | Tauri | 2.9.3 |
| Frontend framework | React | 19 |
| Build tool | Vite | 7 |
| Frontend language | TypeScript | 5.9.3 (strict mode) |
| Backend language | Rust | 1.90.0 (edition 2021) |
| CSS | Tailwind CSS | 4 |
| UI primitives | Radix UI | latest |
| State management | Zustand | 5 (+ Immer + Persist) |
| Icons | Lucide | latest |
| Toast notifications | Sonner | latest |
| Async runtime | Tokio | 1.37 (full features) |
| HTTP client | Reqwest | 0.12 (rustls-tls, no native-tls) |
| Local database | rusqlite | 0.31 (bundled-sqlcipher) |
| Async DB wrapper | tokio-rusqlite | latest |
| Serialization | serde + serde_json | latest |
| Concurrency | rayon 1.10 + dashmap 6.1 + parking_lot 0.12 | |
| Cryptography | argon2 0.5, aes-gcm, hkdf, sha2, hmac, ed25519-dalek | |
| Token counting | tiktoken-rs | latest |
| Screen capture | xcap | latest |
| OCR | tesseract | optional feature flag |
| PDF | pdf-extract + lopdf + printpdf | |
| DOCX | docx-rs | |
| XLSX | calamine (read) + rust_xlsxwriter (write) | |
| Email | lettre (SMTP) + imap (IMAP) | |
| Markdown | pulldown-cmark | |
| macOS platform | accessibility-sys, core-foundation, objc, cocoa | |
| Windows platform | windows 0.56 (Win32 APIs) | |

### 2.3.2 Web Application

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 16 (App Router) |
| React | React | 19 |
| Language | TypeScript | strict mode |
| Auth | Supabase Auth | SSR + JWT |
| Payments | Stripe SDK | API 2026-02-25.clover |
| Rate limiting | Upstash Redis | @upstash/ratelimit |
| Validation | Zod | 4 (.strict() schemas) |
| State management | Zustand | 5 (+ Immer + Persist) |
| UI | Radix UI + Tailwind CSS 4 + Lucide + Sonner | |
| Markdown | react-markdown + remark-gfm + KaTeX | |
| Logging | Pino + pino-pretty | |
| i18n | i18next + react-i18next | en, es |
| Deployment | Vercel | serverless |

### 2.3.3 Backend Services

| Service | Framework | Language | Exposed Port |
|---------|-----------|----------|-------------|
| API Gateway | Express.js | TypeScript | 3000 |
| Signaling Server | Express.js + ws | TypeScript | configurable |

### 2.3.4 Shared Packages

| Package | Export | Contents |
|---------|--------|----------|
| `@agiworkforce/types` | Named exports | `ContextMessage`, `SignalingMessage`, `TauriEvent`, `AppError`, `CustomModelConfig`, `PromptEnhancement` |
| `@agiworkforce/utils` | Named exports | `SignalingClient`, `validateInput`, `formatBytes`, `retry`, `mapError` |

### 2.3.5 Build and Developer Tooling

| Tool | Version / Config |
|------|-----------------|
| Package manager | pnpm 9.15.3 |
| Node.js | >= 22.12.0 |
| Rust | 1.90.0 |
| Git hooks | Husky 9 + lint-staged |
| Commit linting | commitlint — conventional commits, header max 100 chars, lowercase subject |
| Linting | ESLint 9 + @typescript-eslint |
| Formatting | Prettier |
| Unit testing | Vitest |
| E2E testing | Playwright |
| CI | GitHub Actions |

---

## 2.4 Rust Architecture Details

### 2.4.1 Feature Flags

Rust features control platform-specific capabilities and optional dependencies. All features are disabled by default unless noted.

| Feature Flag | Default | Purpose |
|-------------|:-------:|---------|
| `shell` | **on** | Tauri shell plugin (terminal execution). Disabled for App Store builds. |
| `updater` | **on** | Tauri updater plugin (auto-update). Disabled for App Store builds. |
| `devtools` | off | Tauri devtools panel (development only) |
| `ocr` | off | Tesseract OCR bindings (requires system Tesseract install) |
| `local-llm` | off | llama-cpp-2 for on-device inference (large binary dependency) |
| `webrtc-support` | off | WebRTC peer communications (mobile pairing on device) |
| `sentry` | off | Sentry error tracking integration |
| `billing` | off | Stripe billing SDK integration |
| `appstore` | off | Mac App Store build mode — disables `shell` and `updater` |
| `vad` | off | WebRTC voice activity detection |
| `local-whisper` | off | Offline Whisper.cpp speech-to-text |

### 2.4.2 Lint and Safety Configuration

The following lint rules are enforced at the crate level, not merely at clippy suggestion level:

```toml
[lints.rust]
unsafe_code = "deny"       # No unsafe blocks permitted
dead_code = "deny"         # No unused code may be merged
unused = "deny"            # No unused imports, variables, or parameters
```

All Rust code must pass `cargo clippy -- -D warnings` in CI.

### 2.4.3 Release Profile (Production Builds)

```toml
[profile.release]
codegen-units = 1          # Maximum optimization: single codegen unit
lto = true                 # Link-time optimization across all crates
opt-level = "z"            # Optimize for binary size (not speed)
strip = true               # Strip debug symbols from binary
panic = "abort"            # Abort on panic (no unwinding overhead)
```

### 2.4.4 Tauri Capability Model

All Tauri capabilities are declared in `capabilities/default.json`. This file is the security boundary for what the WebView is permitted to invoke. The deny list includes critical paths (`.env` files, credential stores, system security directories) and is enforced at the Tauri permission layer before any Rust handler is invoked.

**Current deny-list size**: 15 path patterns.

Any addition to the capability list requires:
1. A security review comment in the PR
2. Update to this PRD section
3. Update to `docs/SESSION_STATE.md` noting the change

---

## 2.5 Security Architecture

Security is a foundational requirement, not a feature. The following components form a defense-in-depth stack:

| Layer | Component | Mechanism |
|-------|-----------|-----------|
| Secrets storage | `SecretManager` | Argon2id key derivation + AES-GCM encryption + SQLCipher at rest + OS keychain fallback |
| Key derivation | HKDF + SHA-256 | Per-secret derived keys; master key never stored |
| Tool execution | `ToolGuard` | 1,778-line sandboxing module. Validates tool inputs, enforces deny lists, rate-limits executions |
| Input validation | Server-side + client-side | Zod schemas (web), serde validation (Rust), deny-list patterns |
| Capability boundary | Tauri capabilities | WebView cannot invoke undeclared commands |
| Network | rustls (TLS 1.3) | No native-tls; rustls used exclusively in reqwest |
| Database | SQLCipher | Full-database encryption for local SQLite |
| Commits | ed25519-dalek | Ed25519 signatures on AppImage releases |
| Web sessions | CSRF tokens + SameSite cookies | Enforced by web middleware |
| CSP | Content-Security-Policy headers | Configured in Next.js middleware |
| Rate limiting | Upstash Redis + @upstash/ratelimit | API gateway and web app routes |

### 2.5.1 ToolGuard Operation

ToolGuard intercepts every tool execution call before it reaches the Rust handler:

1. **Input validation** — Check tool arguments against schema and deny-list patterns
2. **Permission check** — Verify the calling agent has permission for this tool in the current context
3. **Rate limit** — Apply per-tool execution rate limits
4. **Execution** — Pass to handler if all checks pass
5. **Audit log** — Record invocation, result, and timing regardless of outcome

Auto-approve mode bypasses the user-facing confirmation dialog only. ToolGuard validation and audit logging remain active in all modes.

### 2.5.2 SecretManager Protocol

```
User provides API key
        │
        ▼
SecretManager.store(key, plaintext)
        │
        ├── Derive encryption key via HKDF(SHA-256, master_key, key_label)
        ├── Encrypt plaintext via AES-GCM(derived_key, random_nonce)
        ├── Store ciphertext in SQLCipher DB
        └── Optionally store derived_key in OS keychain

SecretManager.get(key) → plaintext
        │
        ├── Retrieve ciphertext from SQLCipher DB
        ├── Retrieve or re-derive encryption key
        └── Decrypt via AES-GCM → return plaintext
```

Plaintext API keys must never appear in:
- Log files
- Error messages surfaced to users
- `process.env` in the renderer process
- Any `.env` file committed to the repository

---

## 2.6 Data Flow

```
User Input
    │
    ▼ (Tauri IPC)
React Frontend ──invoke()──► Rust Command Handler
                                      │
                 ┌────────────────────┼────────────────────────┐
                 ▼                    ▼                        ▼
          LLM Router            ToolGuard               SQLite (local)
          (core/llm/)           (sys/security/)         (data/db/)
                 │                    │
     ┌───────────┼──────────┐         ▼
     ▼           ▼          ▼    Tool Handler
  Cloud LLM  Local LLM   MCP     (filesystem, terminal,
  (HTTPS/SSE) (llama.cpp) Server  browser, email, calendar)
                                        │
                                        ▼
                                   Result + Audit Log
                                        │
                 ┌──────────────────────┘
                 ▼
          Rust Command Handler
                 │
                 ▼ (Tauri event)
          React Frontend ──► Zustand Store ──► UI Update
```

### 2.6.1 LLM Streaming Path

Streaming responses use a dedicated HTTP client (`streaming_client`) that does not have the `stream_watchdog_timeout` constraint of the standard client. The SSE parser (`core/llm/sse_parser.rs`) handles:
- Standard SSE (`data: {...}`)
- OpenAI-compatible streaming chunks
- Anthropic event types (`content_block_delta`, `message_delta`)
- Error recovery on malformed chunks without terminating the stream

Image generation remains on the standard HTTP client path. Migrating image generation to the streaming client is a tracked backlog item.

### 2.6.2 State Management (Frontend)

| Store Count | Library | Persistence |
|-------------|---------|-------------|
| 41 Zustand stores | Zustand v5 + Immer | zustand/persist (localStorage, migration v10) |

Maximum ID mapping cap per store: 1,000 entries (enforced to prevent unbounded memory growth, see STR-002 fix). Immer is initialized globally via `enableImmer()` before any store is created.

---

## 2.7 Platform Targets

### 2.7.1 Desktop Distribution

| Platform | Architecture | Distribution Format | Signing |
|----------|-------------|--------------------|---------|
| macOS | Apple Silicon (aarch64) | .dmg | Developer ID + Notarization |
| macOS | Intel (x86_64) | .dmg | Developer ID + Notarization |
| macOS | Universal (fat binary) | .dmg | Developer ID + Notarization |
| Windows | x64 | .exe installer (WiX MSI) | Authenticode (planned) |
| Linux | x64 | .AppImage | Ed25519 signature |

The universal macOS build is the primary release artifact. All three macOS targets are built and signed in the same CI job via `cargo build --target universal-apple-darwin`.

### 2.7.2 Web and Service Deployment

| Component | Hosting | URL Pattern | Notes |
|-----------|---------|-------------|-------|
| Web App | Vercel | https://agiworkforce.com | Serverless, auto-scaled |
| Desktop App | GitHub Releases | github.com/…/releases/tag/v* | Tauri updater endpoint |
| API Gateway | TBD (any Node.js host) | https://api.agiworkforce.com | Stateless, horizontally scalable |
| Signaling Server | Fly.io or Railway | https://signaling.agiworkforce.com | Low-latency WebSocket |
| Database | Supabase | *.supabase.co | PostgreSQL 15 + Auth + Realtime |
| Redis | Upstash | *.upstash.io | Serverless Redis, rate limiting |
| Payments | Stripe | api.stripe.com | Webhook endpoint on web app |

---

## 2.8 CI/CD Pipelines

All pipelines are defined as GitHub Actions workflows in `.github/workflows/`.

| Workflow File | Trigger | Steps | Artifacts |
|--------------|---------|-------|-----------|
| `ci.yml` | Push / PR to `main` | lint → typecheck → unit tests → build all apps → `cargo audit` → `cargo clippy` → Playwright e2e | Test reports |
| `release-desktop.yml` | Git tag matching `v*` | validate → build macOS / Windows / Linux → sign → notarize (macOS) → create GitHub Release | .dmg, .exe, .AppImage |
| `deploy-signaling-server.yml` | Push affecting `services/signaling-server/**` | test → Docker build → deploy to Railway/Fly.io → health check | Docker image |
| `build-appstore.yml` | Manual / tag matching `appstore-v*` | build with `--features appstore` → upload to App Store Connect | .pkg |
| `e2e-tests.yml` | Schedule (nightly) / manual | Full Playwright E2E suite across macOS + Windows | Screenshots, videos |

### 2.8.1 Required CI Gates (PRs cannot merge without all passing)

1. TypeScript typecheck — zero type errors across all workspaces
2. ESLint — zero lint errors (warnings are allowed but tracked)
3. Prettier format check — no unformatted files
4. Vitest unit tests — all tests pass
5. `cargo clippy -- -D warnings` — zero Clippy warnings
6. `cargo audit` — no known CVEs in dependency tree
7. commitlint — all commit messages conform to conventional commits spec

---

## 2.9 Local Development Setup

### 2.9.1 Prerequisites

| Requirement | Version | Install |
|------------|---------|---------|
| Node.js | >= 22.12.0 | nvm or official installer |
| pnpm | 9.15.3 | `npm install -g pnpm@9.15.3` |
| Rust | 1.90.0 | `rustup install 1.90.0` |
| Tauri CLI | latest v2 | `cargo install tauri-cli --version '^2'` |
| Docker Desktop | latest | docker.com |
| Xcode (macOS) | 16+ | App Store (for signing tools) |

### 2.9.2 Development Commands

```bash
# Install all workspace dependencies
pnpm install

# Start frontend-only dev server (hot reload, no Rust)
pnpm dev

# Start full desktop development (frontend + Rust backend, hot rebuild)
pnpm tauri dev

# Start local PostgreSQL + pgAdmin for web app development
docker compose up -d

# Type checking across all workspaces
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Rust type check (fast, no linking)
cargo check

# Rust lint
cargo clippy

# Production desktop build
pnpm tauri build

# Production frontend build only
pnpm build
```

### 2.9.3 Environment Configuration

Environment variables are managed through:
- `.env` files (gitignored, never committed)
- `SecretManager` for runtime API keys (encrypted in SQLite)
- Tauri `capabilities/default.json` for permission scope

**Never** put API keys, database URLs, or JWT secrets in:
- Source files
- `CLAUDE.md` or any instruction file
- GitHub Actions secrets visible in logs
- Browser localStorage or sessionStorage

---

## 2.10 LLM Provider Catalog

The model catalog is maintained in `apps/desktop/src/constants/llm.ts` (TypeScript, ~65K characters) and mirrored in `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs` (Rust). These two files must remain in sync; six known mismatches exist as of v1.1.5 and are tracked in `docs/rust-fixes-needed.md`.

### 2.10.1 Supported Cloud Providers

| Provider | Auth Method | Streaming | Tool Use | Vision |
|----------|------------|-----------|----------|--------|
| Anthropic (Claude) | API key | SSE | Yes | Yes |
| OpenAI (GPT series) | API key | SSE | Yes | Yes |
| Google (Gemini) | API key / OAuth | SSE | Yes | Yes |
| Mistral | API key | SSE | Yes | No |
| Groq | API key | SSE | Yes | No |
| DeepSeek | API key | SSE | Yes | No |
| OpenRouter | API key | SSE | Passthrough | Passthrough |
| Together.ai | API key | SSE | Yes | Some models |
| Fireworks.ai | API key | SSE | Yes | Some models |

### 2.10.2 Supported Local Model Runtimes

| Runtime | Protocol | Default Endpoint | Notes |
|---------|---------|-----------------|-------|
| Ollama | OpenAI-compatible REST | http://localhost:11434 | Auto-discovery supported |
| LM Studio | OpenAI-compatible REST | http://localhost:1234 | Auto-discovery supported |
| vLLM | OpenAI-compatible REST | http://localhost:8000 | Production-grade serving |
| llama.cpp (server mode) | OpenAI-compatible REST | http://localhost:8080 | |
| llama-cpp-2 (embedded) | Rust FFI | In-process | Requires `local-llm` feature flag |

### 2.10.3 Custom Endpoint Support

Any OpenAI-compatible endpoint can be added as a custom model. The `CustomModelConfig` type (from `@agiworkforce/types`) defines the schema:

```typescript
interface CustomModelConfig {
  id: string;
  name: string;
  provider: 'openai-compatible' | 'anthropic-compatible' | 'ollama';
  baseUrl: string;
  apiKey?: string;          // Optional; stored via SecretManager if provided
  modelId: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsToolUse?: boolean;
  subscriptionLevel?: number; // 0-4, maps to tier gating
}
```

---

## 2.11 MCP (Model Context Protocol) Integration

MCP is the extensibility mechanism for adding external tools to agents.

### 2.11.1 Supported Transports

| Transport | Use Case | Config Location |
|-----------|---------|----------------|
| stdio | Local MCP servers (spawned as child processes) | `.mcp.json` |
| SSE (Server-Sent Events) | Remote MCP servers over HTTP | `.mcp.json` |
| Streamable HTTP | Next-generation MCP transport | `.mcp.json` |

### 2.11.2 Currently Connected MCP Servers

| Server | Capability |
|--------|-----------|
| Gmail | Email read, compose, send |
| Google Calendar | Event read, create, update |
| Vercel | Deployment triggers, project status |
| n8n | Workflow execution, webhook triggers |

### 2.11.3 Code-Complete but Not Active

| Server | Status |
|--------|--------|
| Google Drive | Code exists, not wired to settings UI |
| Notion | Code exists, not wired |
| Trello | Code exists, not wired |
| Asana | Code exists, not wired |

### 2.11.4 Tool Permission Model

| Mode | Behavior |
|------|---------|
| `ask` | Agent pauses and requests user approval before executing |
| `auto-approve-readonly` | Read-only tools execute without confirmation; write tools require approval |
| `auto-approve-all` | All tools execute without confirmation (trusted mode — ToolGuard still active) |

Permissions are scoped per tool, per agent, and can be overridden at the project level.

---

## 2.12 Architecture Decision Records

Brief record of significant architectural decisions made prior to v1.1.5:

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| ADR-001 | Use Tauri v2 (not Electron) | Binary size, memory footprint, Rust safety. Tauri builds are ~10x smaller than Electron equivalents. | Pre-v1.0 |
| ADR-002 | SQLCipher for local storage | Encryption at rest with no performance penalty; single-file portable database. | Pre-v1.0 |
| ADR-003 | Separate streaming HTTP client | Avoid `stream_watchdog_timeout` on long LLM streams without disabling safety entirely. | v1.1.0 |
| ADR-004 | Zustand v5 + Immer (not Redux) | Lower boilerplate for 41 stores; Immer draft pattern fits complex nested agent state. | Pre-v1.0 |
| ADR-005 | Argon2id for key derivation | OWASP-recommended as of 2026; resistant to GPU cracking for API key storage. | v1.0.5 |
| ADR-006 | pnpm workspaces (not npm/yarn) | Strict hoisting prevents phantom dependency bugs; faster CI caching; disk-efficient symlinks. | Pre-v1.0 |
| ADR-007 | rustls over native-tls | Removes OpenSSL dependency; consistent TLS behavior across macOS/Windows/Linux. | v1.1.0 |
| ADR-008 | `opt-level = "z"` release profile | Desktop app binary size matters for download UX; size optimization preferred over speed for UI layer. | v1.0.0 |
| ADR-009 | Proprietary commercial license | Protect IP and revenue; prevent unauthorized redistribution; allow controlled enterprise licensing via per-seat subscriptions. | v1.1.5 |
| ADR-010 | ToolGuard always-on (even in auto-approve) | User convenience (no dialogs) must not compromise security audit trail or input validation. | v1.0.8 |

---

*Section 1: Vision — see `section-1-vision.md`*
*Section 3: Feature Specifications — see `section-3-features.md` (forthcoming)*
