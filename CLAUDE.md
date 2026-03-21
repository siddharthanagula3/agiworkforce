# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AGI Workforce — model-agnostic AI desktop platform. Tauri v2 (Rust + React 19). Beats Claude Desktop, ChatGPT, Gemini via multi-LLM routing, desktop autonomy, 150+ non-coding skills, mobile companion.

## What This Is

pnpm monorepo + Cargo workspace. 8 surfaces: Desktop (Tauri v2), Web (Next.js 16), Mobile (Expo), CLI (Rust), Chrome Extension (MV3), VS Code Extension, API Gateway (Express), Signaling Server (WebSocket).

```
apps/desktop/src-tauri/src/   # Rust backend (core/, sys/, automation/, features/, data/)
apps/desktop/src/              # React 19 frontend (components/, stores/, hooks/, services/)
apps/web/                      # Next.js 16 (Supabase auth, Stripe billing)
apps/mobile/                   # Expo + React Native (NativeWind)
apps/cli/                      # Rust CLI agent (37 files, ~31K LOC, Whisper voice mode)
apps/extension/                # Chrome MV3 (native messaging, DOM automation)
apps/extension-vscode/         # VS Code (chat participant, agent mode, inline completions)
packages/types/                # Shared TS types: a2a, cross-device, mcp-apps, event-triggers, audit
packages/utils/                # Shared utilities
services/api-gateway/          # Express API for mobile + integrations
services/signaling-server/     # WebSocket signaling for cross-device streams
```

Path-scoped rules in `.claude/rules/` auto-load when editing matching files (e.g., `tauri-ipc.md` loads for `apps/desktop/src/**`). Check those for per-surface conventions before editing unfamiliar surfaces.

## Build Commands

```bash
pnpm install                                    # Install all dependencies
cd apps/desktop && pnpm dev                     # Desktop dev (Vite + Rust)
cd apps/desktop && pnpm dev:vite                # Frontend-only (no Rust rebuild)
cd apps/web && pnpm dev                         # Web dev server
cd apps/mobile && pnpm dev                      # Expo dev server
cd apps/cli && cargo run -- "prompt"            # CLI test run with prompt
pnpm typecheck                                  # TypeScript (desktop only)
pnpm typecheck:all                              # TypeScript (all workspaces)
pnpm lint                                       # ESLint (max-warnings=0, excludes extension)
pnpm lint:extension                             # ESLint for Chrome extension only
pnpm format:check                               # Prettier check
pnpm format                                     # Prettier fix
cargo check                                     # Rust type check (both crates)
cargo clippy                                    # Rust linting
cargo check -p agiworkforce-cli                 # CLI crate only
cd apps/desktop && pnpm test                    # Vitest (only when asked)
cd apps/desktop && pnpm test -- src/__tests__/features.test.ts  # Single Vitest file
cargo test                                      # Rust tests (only when asked)
cargo test -p agiworkforce-cli -- test_name     # Single Rust test
cd apps/desktop && pnpm test:e2e               # Playwright E2E (only when asked)
```

Workspace targeting: `pnpm --filter @agiworkforce/desktop <cmd>` (desktop), `pnpm --filter @agiworkforce/web <cmd>` (web).

## Commit Conventions

- Format: `type(scope): lowercase subject` — max 100 chars
- Subject MUST be lowercase (not Sentence-case or PascalCase)
- Valid types: feat, fix, chore, docs, refactor, test, perf, ci, build, style
- Husky pre-commit: lint-staged (ESLint + Prettier). Commit-msg: commitlint

## Tauri IPC Rules (CRITICAL)

The #1 source of silent bugs. Tauri auto-converts param names at the boundary.

- TypeScript `invoke()` params: ALWAYS camelCase (`modelId`, `chatMessage`)
- Rust `#[tauri::command]` params: ALWAYS snake_case (`model_id`, `chat_message`)
- Command names: snake_case in BOTH languages (`send_message`)
- Snake_case in TypeScript invoke() silently arrives as `undefined` on Rust side — NO error
- After writing any invoke() call, verify parameter casing matches

## Architecture

- **Rust backend**: `core/` (LLM router, agents, swarm, MCP, embeddings, triggers), `sys/` (1415 commands, security), `automation/` (screen, input, browser, OCR), `features/` (terminal, speech, calendar), `data/` (SQLite, settings, cache), `integrations/` (cloud sync, APIs), `ui/` (tray, windows, overlay), `models/` (shared structs)
- **Rust entry**: `main.rs` → `lib.rs::run()` → Tauri setup with plugins + managed state
- **Frontend**: Zustand v5 + Immer + Persist. 100+ component dirs. Radix UI + Tailwind 4 + Lucide + Sonner toasts
- **Frontend↔Backend**: `invoke()` for commands, Tauri event channels for streaming (`tool:event`, `agentic:*`)
- **Security**: ToolGuard validates tool execution. SecretManager (Argon2id + AES-GCM). Never plaintext secrets
- **LLM Routing**: `llm_router.rs` routes across 9+ providers. SSE streaming via `sse_parser.rs`
- **MCP**: stdio + SSE + streamable HTTP. Config in `.mcp.json`. Unlimited tools. MCP Apps rendering via sandboxed iframes
- **Event Triggers**: Cron, webhooks (Slack, GitHub, Linear), file watchers. Automatic agent execution with approval gates
- **Agent-to-Agent**: A2A protocol for task delegation, conversation handoffs, and capability discovery. Transport-agnostic (in-process, WebRTC, HTTP)
- **Cross-Device**: Persistent threads synced across desktop & mobile via signaling server. Real-time execution streaming to mobile dashboards

## Rust Conventions

- `deny(unsafe_code, dead_code, unused_imports, unused_variables, unused_mut)` — all warnings are errors
- Zero `.unwrap()` on fallible ops outside tests — use `?` or `.map_err()`
- Zero `#[allow(dead_code)]` — wire it or delete it
- Prefer `anyhow::Result` for `#[tauri::command]` handlers
- Use `State<'_, T>` for managed state access
- Use degraded state constructors for optional features: `MemoryState::degraded()`
- `clippy::await_holding_lock` is allowed
- Feature flags: `default = ["shell", "updater", "billing", "vad"]`. Optional: `ocr`, `local-llm`, `local-whisper`, `webrtc-support`, `sentry`, `remote-databases`, `devtools`. Use `#[cfg(feature = "...")]` guards

## TypeScript Conventions

- Strict mode everywhere. Zero `// @ts-ignore` or `as any`
- `interface` over `type` for object shapes. Named exports only — no default exports
- Absolute imports from `src/` (e.g., `import { foo } from '@/lib/utils'`)
- Use `cn()` from `src/lib/utils` for className merging
- Toasts: `import { toast } from 'sonner'` — NOT `@/hooks/useToast`
- Icons: Lucide React — NOT heroicons or other libraries
- UI primitives: Radix UI — NOT headless UI or custom implementations
- Timer/listener cleanup: always in useEffect return. Refs in cleanup: copy to local variable first
- Every invoke() call must have try/catch error handling
- Immutability: never mutate objects — use spread or Immer's `produce()` in Zustand stores
- No `console.log` in production code — use toast notifications or proper logging
- Validation: Zod schemas at system boundaries (API responses, user input, IPC params)

## Per-App Quick Reference

- **Web** (`apps/web/`): Next.js 16 App Router. Auth: Supabase SSR. Billing: Stripe. Rate limiting: Upstash Redis. CSRF token required on state-changing calls. Server components by default.
- **Mobile** (`apps/mobile/`): Expo 55 + expo-router. Styling: NativeWind. Storage: MMKV (fast) + SecureStore (sensitive). Desktop companion: WebRTC data channel + signaling server fallback.
- **CLI** (`apps/cli/`): Binary `agiworkforce`, package `agiworkforce-cli`. 12 subcommands (exec, review, apply, sandbox, mcp-server, app-server, resume, fork, cloud, plugin, features, execpolicy). 12 built-in tools + 4 team tools. Config: `~/.agiworkforce/config.toml`. Sessions: SQLite in `~/.agiworkforce/sessions.db`. Plugin system: `~/.agiworkforce/plugins/` with `.app.json`/`.mcp.json` manifests. OS sandboxing: macOS Seatbelt, Linux Bubblewrap/Landlock. Dead code lint: warn (not deny) — API surface is intentionally broad.
- **Chrome Extension** (`apps/extension/`): MV3 service worker. Native messaging host: `com.agiworkforce.browser`. Side panel chat via HTTP bridge (localhost:8765). WebMCP tool discovery from page DOM.
- **VS Code Extension** (`apps/extension-vscode/`): Chat participant `@agi` with /explain, /fix, /refactor, /tests, /docs. Agent mode: multi-file editing with diff preview. Desktop bridge: WebSocket ws://127.0.0.1:8787/ws.

## Development Rules

- Do NOT run tests unless explicitly asked
- Rust/Tauri files: full edit access authorized
- Research the market (web search) before implementing any user-facing feature
- All secrets through SecretManager — never plaintext, never committed
- ALWAYS use parallel sub-agents — never sequential when tasks can be parallelized

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update memory with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to tasks/todo.md with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to tasks/todo.md
6. **Capture Lessons**: Update memory after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards
- **Minimal Impact**: Only touch what's necessary. No side effects with new bugs
- **File Size**: 200-400 lines typical, 800 max. Extract utilities from large modules

## Zone-Based File Ownership (Multi-Agent)

| Zone   | Files                                                            |
| ------ | ---------------------------------------------------------------- |
| A      | `apps/desktop/src/components/**`, `apps/desktop/src/pages/**`    |
| B      | `apps/desktop/src/services/**`, `apps/web/api/**`, `services/**` |
| C      | `supabase/migrations/**`                                         |
| D      | `apps/desktop/src/stores/mcpStore*`, `apps/extension/**`         |
| SYSTEM | `apps/desktop/src-tauri/**`, `apps/cli/**`                       |
| SHARED | `package.json`, `tsconfig.json`, `CLAUDE.md`, `packages/**`      |
