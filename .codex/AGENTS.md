# AGI Workforce for Codex CLI

This supplements the root `CLAUDE.md` with Codex-specific guidance for the AGI Workforce monorepo.

## Project Overview

AGI Workforce is an open, model-agnostic AI desktop platform. Users connect any LLM (cloud or local), use MCP tools, manage agents, and run autonomous workflows.

**Stack**: Tauri v2 (Rust backend + React/TS frontend), Next.js 16 web app, React Native mobile, Chrome extension, VS Code extension, Express API gateway.

## Model Recommendations

| Task Type                         | Recommended Model                |
| --------------------------------- | -------------------------------- |
| Routine coding, tests, formatting | claude-3-5-sonnet or gpt-4o-mini |
| Complex features, architecture    | claude-3-7-opus or gpt-4o        |
| Debugging, refactoring            | claude-3-5-sonnet or gpt-4o-mini |
| Security review                   | claude-3-7-opus or gpt-4o        |

## Monorepo Structure

```
apps/
  desktop/           # Tauri v2 desktop app (primary product)
    src/             # React 19 + Vite + Tailwind 4 frontend
    src-tauri/       # Rust backend (Tauri v2 commands, system APIs)
  web/               # Next.js 16 marketing/auth/billing
  mobile/            # React Native + Expo (iOS/Android)
  extension/         # Chrome extension (Manifest V3)
  extension-vscode/  # VS Code extension
packages/
  types/             # Shared TypeScript types
  utils/             # Shared utilities
  api/               # ~1,061 typed API wrappers for all Tauri command domains
  runtime/           # Runtime detection + capability-aware command routing
  stores/            # Shared Zustand stores
  chat/              # Shared chat components
  react-native-worklets/ # React Native Reanimated worklets for mobile
services/
  api-gateway/       # Express API for mobile + external integrations
  signaling-server/  # WebSocket signaling
```

## Rust Backend Modules (`apps/desktop/src-tauri/src/`)

- **`core/`** -- AI engine: LLM routing, agents, MCP, embeddings, skills, artifacts
- **`sys/`** -- System services: 125+ Tauri commands, security (ToolGuard, SecretManager), billing
- **`automation/`** -- Desktop automation: screen capture, input simulation, browser control, OCR
- **`features/`** -- Domain features: terminal, speech, calendar, teams, workflows
- **`integrations/`** -- External services: cloud sync, native messaging, realtime
- **`data/`** -- Data layer: SQLite, settings, cache, analytics
- **`ui/`** -- Native UI: tray icon, window management, overlay

## TypeScript Frontend (`apps/desktop/src/`)

- **`components/`** -- 75+ component directories (Agent, Chat, Settings, Voice, Vision, Terminal)
- **`stores/`** -- 55+ Zustand stores with Immer and Persist middleware
- **`services/`** -- API services, analytics, Stripe, Supabase auth
- **`hooks/`** -- React hooks for features and IPC
- **`constants/`** -- LLM model definitions and app config

## Build Commands

```bash
pnpm install                          # Install all dependencies
cd apps/desktop && pnpm dev           # Desktop dev (Vite + Rust)
cd apps/web && pnpm dev               # Web dev (Next.js)
cargo check                           # Rust type checking
cargo clippy                          # Rust linting (0 warnings required)
pnpm typecheck                       # TypeScript checking
pnpm lint                             # ESLint
```

## Critical Rules

1. **IPC camelCase**: All `invoke()` calls use camelCase param keys. Snake_case silently fails.
2. **Security**: All secrets via SecretManager. Never plaintext. ToolGuard for all tool execution.
3. **Conventional commits**: `type(scope): lowercase subject`, max 100 chars. Subject MUST be lowercase.
4. **Rust strictness**: `deny(unsafe_code, dead_code, unused_imports, unused_variables, unused_mut)`. All warnings are errors.
5. **Model catalogs**: Desktop `llm.ts`, web `models.json`, Rust `provider_adapter.rs` must stay in sync.
6. **No tests unless asked**: Do not run tests mid-stream. Code and self-review only.

## MCP Servers

Configured in `.codex/config.toml` under `[mcp_servers]`:

- **GitHub** -- Repository operations and PR management
- **Context7** -- Library documentation lookup
- **Memory** -- Persistent knowledge graph
- **Sequential Thinking** -- Multi-step reasoning
- **Supabase** -- Database queries (read-only)
- **Vercel** -- Deployment management for the web app

## Key Differences from Claude Code

| Feature      | Claude Code                     | Codex CLI                   |
| ------------ | ------------------------------- | --------------------------- |
| Hooks        | 8+ event types                  | Not yet supported           |
| Context file | CLAUDE.md + AGENTS.md           | AGENTS.md only              |
| Skills       | Skills loaded via plugin        | `.agents/skills/` directory |
| Commands     | `/slash` commands               | Instruction-based           |
| Agents       | Subagent Task tool              | Single agent model          |
| Security     | Hook-based enforcement          | Instruction + sandbox       |
| MCP          | Full support (stdio, SSE, HTTP) | Command-based only          |

## Security Without Hooks

Since Codex lacks hooks, security enforcement is instruction-based:

1. All secrets through SecretManager (Argon2id + AES-GCM + SQLite/keychain)
2. Never hardcode API keys or credentials in source
3. Use ToolGuard for all tool execution sandboxing
4. Validate all user input before processing
5. Sanitize data before rendering in UI (XSS prevention)
6. Use `sandbox_mode = "workspace-write"` in config
7. Review `git diff` before every push
8. Run `cargo clippy` and `pnpm lint` before committing

## Zone-Based File Ownership

When working on tasks, be aware of module boundaries:

| Zone           | Files                                                            |
| -------------- | ---------------------------------------------------------------- |
| Frontend       | `apps/desktop/src/components/**`, `apps/desktop/src/pages/**`    |
| Services       | `apps/desktop/src/services/**`, `apps/web/api/**`, `services/**` |
| Data           | `apps/web/core/storage/**`, `supabase/migrations/**`             |
| MCP/Extensions | `apps/desktop/src/stores/mcpStore*`, `apps/extension/**`         |
| DevOps         | `Dockerfile`, `.github/**`, `scripts/**`                         |
| Rust Backend   | `apps/desktop/src-tauri/**`                                      |
| Shared         | `package.json`, `tsconfig.json`, `packages/**`                   |
