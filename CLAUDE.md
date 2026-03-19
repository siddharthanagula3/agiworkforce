# CLAUDE.md

AGI Workforce — model-agnostic AI desktop platform. Tauri v2 (Rust + React 19). Beats Claude Desktop, ChatGPT, Gemini via multi-LLM routing, desktop autonomy, 150+ non-coding skills, mobile companion.

## What This Is

pnpm monorepo + Cargo workspace. 8 surfaces: Desktop (Tauri v2), Web (Next.js 16), Mobile (Expo), CLI (Rust), Chrome Extension (MV3), VS Code Extension, API Gateway (Express), Signaling Server (WebSocket).

```
apps/desktop/src-tauri/src/   # Rust backend (core/, sys/, automation/, features/, data/)
apps/desktop/src/              # React 19 frontend (components/, stores/, hooks/, services/)
apps/web/                      # Next.js 16 (Supabase auth, Stripe billing)
apps/mobile/                   # Expo + React Native (NativeWind)
apps/cli/                      # Rust CLI agent (24 files, 24K LOC, Whisper voice mode)
apps/extension/                # Chrome MV3 (native messaging, DOM automation)
apps/extension-vscode/         # VS Code (chat participant, agent mode, inline completions)
packages/types/                # Shared TS types: a2a, cross-device, mcp-apps, event-triggers, audit
packages/utils/                # Shared utilities
services/api-gateway/          # Express API for mobile + integrations
services/signaling-server/     # WebSocket signaling for cross-device streams
```

## Build Commands

```bash
pnpm install                                    # Install all dependencies
cd apps/desktop && pnpm dev                     # Desktop dev (Vite + Rust)
cd apps/desktop && pnpm dev:vite                # Frontend-only (no Rust rebuild)
cd apps/web && pnpm dev                         # Web dev server
cd apps/mobile && pnpm dev                      # Expo dev server
cd apps/cli && cargo run -- "prompt"            # CLI test run with prompt
pnpm typecheck                                  # TypeScript (desktop)
pnpm lint                                       # ESLint (max-warnings=0)
cargo check                                     # Rust type check
cargo clippy                                    # Rust linting
cargo check -p agiworkforce-cli                 # CLI crate check
cd apps/desktop && pnpm test                    # Vitest (only when asked)
cargo test                                      # Rust tests (only when asked)
```

## Commit Conventions

- Format: `type(scope): lowercase subject` — max 100 chars
- Valid types: feat, fix, chore, docs, refactor, test, perf, ci, build, style
- Husky pre-commit: lint-staged (ESLint + Prettier). Commit-msg: commitlint

## Tauri IPC Rules (CRITICAL)

- TypeScript `invoke()` params: ALWAYS camelCase (`modelId`, `chatMessage`)
- Rust `#[tauri::command]` params: ALWAYS snake_case (`model_id`, `chat_message`)
- Tauri auto-converts camelCase → snake_case at boundary
- Snake_case in TypeScript invoke() silently arrives as `undefined` on Rust side — NO error
- Command names stay snake_case in both languages

## Architecture

- **Rust backend**: `core/` (LLM router, agents, swarm, MCP, embeddings, triggers), `sys/` (1375 commands, security), `automation/`, `features/`, `data/`, `integrations/`
- **Frontend**: Zustand v5 + Immer + Persist. 75+ component dirs. Radix UI + Tailwind 4 + Lucide + Sonner toasts
- **Frontend↔Backend**: `invoke()` for commands, Tauri event channels for streaming (`tool:event`, `agentic:*`)
- **Security**: ToolGuard validates tool execution. SecretManager (Argon2id + AES-GCM). Never plaintext secrets
- **LLM Routing**: `llm_router.rs` routes across 9+ providers. SSE streaming via `sse_parser.rs`
- **MCP**: stdio + SSE + streamable HTTP. Config in `.mcp.json`. Unlimited tools. MCP Apps rendering via sandboxed iframes
- **Event Triggers**: Cron, webhooks (Slack, GitHub, Linear), file watchers. Automatic agent execution with approval gates
- **Agent-to-Agent**: A2A protocol for task delegation, conversation handoffs, and capability discovery. Transport-agnostic (in-process, WebRTC, HTTP)
- **Cross-Device**: Persistent threads synced across desktop & mobile via signaling server. Real-time execution streaming to mobile dashboards
- **Rust lint**: `deny(unsafe_code, dead_code, unused_imports, unused_variables, unused_mut)`

## Development Rules

- Do NOT run tests unless explicitly asked
- Rust/Tauri files: full edit access authorized
- Research the market (web search) before implementing any user-facing feature
- All secrets through SecretManager — never plaintext, never committed
- TypeScript: strict mode, interfaces over types, named exports, absolute imports
- React: functional components only, Tailwind for styling, Sonner for toasts
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

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Only touch what's necessary. No side effects with new bugs.

## Zone-Based File Ownership (Multi-Agent)

| Zone | Files |
|------|-------|
| A | `apps/desktop/src/components/**`, `apps/desktop/src/pages/**` |
| B | `apps/desktop/src/services/**`, `apps/web/api/**`, `services/**` |
| C | `supabase/migrations/**` |
| D | `apps/desktop/src/stores/mcpStore*`, `apps/extension/**` |
| SYSTEM | `apps/desktop/src-tauri/**`, `apps/cli/**` |
| SHARED | `package.json`, `tsconfig.json`, `CLAUDE.md`, `packages/**` |
