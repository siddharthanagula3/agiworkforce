# AGI Workforce — AI Memory

> This file is read at every session start and updated during work.
> The AI writes learnings, patterns, and preferences here.
> Keep entries concise. Move detailed notes to topic files in docs/.

## Architecture Decisions

- Tauri v2 for desktop — chosen for small binary size, native performance, and Rust security
- SQLite for local data storage — encrypted via Argon2id through SecretManager
- ToolGuard (1,778 lines) handles all tool execution sandboxing and permission checks
- Cloud models auto-routed internally — Custom Models feature is for user-provided endpoints only
- MCP for all external tool integration — supports stdio, SSE, HTTP transports
- Instruction file discovery loads CLAUDE.md, GEMINI.md, .cursorrules, etc. on project open

## Debugging Patterns

- Tauri invoke errors: check that the Rust command has `#[tauri::command]` and is registered in `main.rs`
- MCP connection failures: verify the server process is running, check stdio vs SSE transport type
- SecretManager key retrieval: trace the decryption path through Argon2id → SQLite → keychain
- Docker-dependent features (DB prompts 17, 69-71): require Docker Desktop running
- Voice pipeline: Whisper STT → processing → Piper/Deepgram TTS, check each stage separately

## User Preferences

- NO testing during development — self-review only, tests run ONLY when explicitly told
- Research market via web search BEFORE every user-facing feature implementation
- Conventional commits: feat(scope):, fix(scope):, chore(scope):
- Maximize parallelism — use sub-agents and agent teams whenever tasks are independent
- No onboarding demos or guardrails restricting coding flow
- Rust/Tauri changes go to docs/rust-fixes-needed.md (user applies manually)

## Build & Deploy

- Dev: `pnpm dev` (frontend) or `pnpm tauri dev` (full desktop)
- Build: `pnpm tauri build` produces platform-specific installer
- Type check: `pnpm typecheck`
- Lint: `pnpm lint` + `cargo clippy`
- Git: 65+ commits this week, GH CLI authenticated

## API Conventions

- All API keys stored via SecretManager — never plaintext, never in .env committed to git
- Custom models use OpenAI-compatible /v1/chat/completions format
- MCP config in .mcp.json (project-level) and settings store (global)
- Tauri commands exposed via `invoke()` from frontend

## Error Patterns & Solutions

- "Cannot connect to MCP server": Usually wrong transport type or server not running
- API key verification failure: Check base URL trailing slash, model ID exact match
- Context overflow in long sessions: Update SESSION_STATE.md, run /compact with focus
- Agent zone conflict: Two agents editing same file — check zone ownership in AGENTS.md
- Stripe webhook failures: Verify endpoint URL and signing secret in SecretManager

## Feature Audit Status

- PASS: 62 features (agent orchestration, voice pipeline, screenshot/OCR, git/GitHub, security, teams, billing, memory, analytics, templates, artifacts)
- PARTIAL: 14 (need completion)
- FAIL: 8 (need fixes)
- BLOCKED: 20 (missing dependencies — Docker, API keys, MCP connections)
- NOT TESTABLE: 10 (desktop-only features)

Key blockers: Docker daemon not running, image gen API keys missing, Gmail/Calendar/Drive/Notion MCPs not fully connected

## Self-Review Results (2026-02-26)

Full review in REVIEW_FINDINGS.md. Key patterns discovered:
- **Shared artifact utils**: `src/lib/artifactUtils.tsx` — `ArtifactTypeIcon` + `getArtifactFileExtension`
- **chatStore.ts**: `updateMessage` fallback condition was `||` (should be `&&`); message cap was applied independently (causes drift — always sync via `slice()`)
- **settingsStore.ts**: persist `merge()` was resetting `defaultProvider` to hardcoded value — preserve from persisted state
- **CSP**: tauri.conf.json `img-src https:` wildcard replaced with specific host allowlist
- **Auth**: Always use `supabase.auth.getUser()` (not `getSession()`) in Next.js server-side routes
- **ESLint**: `no-explicit-any` changed to `warn` (was `off`) — 269 existing `any` usages now visible
- **diffUtils.ts**: `applyDiff` multi-line hunk bug fixed — must spread `newContent.split('\n')`
- 10 Rust critical/high issues documented in `docs/rust-fixes-needed.md`

## Current Priorities

- Settings panel: Custom Models, Tools & Extensions, Memory & Instructions, Agents tabs
- Instruction file discovery: auto-detect CLAUDE.md, GEMINI.md, .cursorrules, etc.
- MEMORY.md integration: read/write during sessions, persist across restarts
- Fix remaining 8 FAIL features from audit
- Complete 14 PARTIAL features
