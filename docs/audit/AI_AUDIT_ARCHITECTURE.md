# AI Audit — Discovered Architecture

Audit: PR #379, 2026-05-23
Branch: claude/jolly-goldberg-JXa65

## Repo Layout

```
agiworkforce/                  # pnpm + cargo monorepo
├── apps/
│   ├── cli/                   # Rust + Ratatui TUI (195 .rs files, 22 subcommands, 914 tests)
│   ├── desktop/               # Tauri v2 — Rust backend + React 19 frontend
│   │   ├── src/               # React frontend (TypeScript)
│   │   └── src-tauri/         # Rust backend (~700 .rs files)
│   ├── web/                   # Next.js 16 (App Router, Vercel deployed)
│   │   ├── app/api/           # 86+ API endpoints
│   │   ├── features/          # 392 feature files
│   │   └── shared/            # Shared components/lib
│   ├── mobile/                # Expo 55 + React Native 0.84
│   ├── extension/             # Chrome MV3 extension
│   ├── extension-vscode/      # VS Code extension (54+ commands)
│   └── sandbox/               # Artifact sandbox renderer
├── packages/                  # 20 shared TS packages
│   ├── mcp/                   # MCP client (3 transports)
│   ├── providers/             # LLM provider adapters
│   ├── types/                 # Canonical type contracts + models.json
│   ├── utils/                 # Shared utilities (fence, crypto, validation)
│   ├── llm-runtime/           # LLM runtime (retry, fallback, gateway)
│   ├── llm-normalize/         # Prompt normalization
│   ├── compliance/            # EU AI Act, provider gating
│   ├── data-layer/            # DB adapters (Supabase, Neon)
│   └── ...
├── crates/                    # 17 shared Rust crates
├── services/
│   ├── api-gateway/           # Express.js mobile companion API
│   └── signaling-server/      # WebRTC signaling
├── supabase/                  # 52 migrations, RLS policies
└── .github/workflows/         # 11 CI workflows
```

## Runtime Boundaries

- **Web**: Next.js 16 on Vercel, proxy.ts (not middleware.ts — Next.js 16 convention), Supabase auth via cookies
- **Desktop**: Tauri v2, Rust backend with IPC commands, React frontend, local SQLite + encrypted settings
- **CLI**: Pure Rust binary, terminal-native, sandbox via bwrap (Linux) / seatbelt (macOS)
- **Mobile**: Expo, MMKV encrypted storage, SecureStore for auth, Dispatch for desktop delegation
- **Chrome Extension**: MV3, native messaging bridge to desktop (port 8787), content scripts
- **VS Code Extension**: @agi chat participant, desktop bridge (port 8787), webview sidebar
- **API Gateway**: Express.js, JWT auth, rate limiting, Supabase proxy

## Auth Flow

- Web: Supabase Auth (JWT in httpOnly cookies), CSRF (HMAC-SHA256, session-bound)
- Desktop: Supabase JWT + custom token handling, master password for encrypted vault
- Mobile: Supabase JWT in SecureStore, biometric gate, MMKV encrypted storage
- API Gateway: HS256 JWT, per-user rate limiting
- Extensions: Bridge auth token with rotation + lockout

## Key Security Controls (Verified)

- Command validation: 40+ dangerous pattern categories
- Path validation: Traversal, symlink, null byte, device path, mount point checks
- Tool confirmation: Tiered safety system (Safe → Notification → Confirmation → ExplicitApproval)
- MCP: Signed manifest, tool name validation, env var filtering, PKCE OAuth
- Prompt injection: Nonce-bearing tool catalogs, untrusted content fencing
- Rate limiting: Per-endpoint, fail-closed for sensitive ops, Redis store (when configured)
- RLS: Row-level security via Supabase, session ownership enforcement
- CSRF: HMAC-SHA256 with rotation, Bearer bypass only with JWT validation
- API keys: Argon2id hashing, prefix-indexed lookup

## TypeScript Version

- Root/most packages: TS 5.9.3 (installed: 6.0.2 via pnpm overrides)
- Desktop: TS 6.0.3
- tsconfig.base.json: Deprecated baseUrl/downlevelIteration removed (this PR)
