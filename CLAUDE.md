# AGI Workforce — Project Memory

> This file is loaded at the start of every Claude Code session.
> Keep it under ~500 lines. Move reference content to skills or docs/.
> Last updated: 2026-02-26

## What This Project Is

AGI Workforce is a **Tauri desktop application** (Rust backend + TypeScript/React frontend) that serves as an **open, model-agnostic AI desktop platform** — a Claude Desktop alternative without model restrictions. Users can connect any LLM (cloud or local), use MCP tools, manage agents, and run autonomous workflows from a single desktop app.

**Positioning**: Where Claude Desktop locks you to Anthropic and ChatGPT Desktop locks you to OpenAI, AGI Workforce lets users connect ANY model and use the same tools, skills, memory, and agents across all of them.

## Tech Stack

- **Desktop framework**: Tauri v2 (Rust + WebView)
- **Frontend**: React/TypeScript (Next.js patterns)
- **Backend**: Rust (Tauri commands, system integration)
- **Database**: SQLite (via Tauri)
- **Security**: ToolGuard (1,778 lines), Argon2id encryption, SecretManager
- **Voice**: Whisper STT, Deepgram, Piper TTS, macOS native TTS
- **Vision**: Screenshot capture, OCR, computer use
- **Payments**: Stripe integration
- **Auth**: Session-based, JWT
- **CI/CD**: GitHub Actions

## Project Structure

```
~/Desktop/agiworkforce/
├── src-tauri/              # Rust backend (Tauri commands, system APIs)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/       # Tauri invoke handlers
│   │   ├── security/       # ToolGuard, encryption
│   │   └── services/       # System services
│   └── Cargo.toml
├── src/                    # TypeScript frontend
│   ├── components/         # React UI components
│   ├── pages/              # App routes/pages
│   ├── services/           # API services, LLM routing, agent runtime
│   ├── hooks/              # React hooks
│   ├── utils/              # Utilities
│   └── types/              # TypeScript types
├── .claude/
│   ├── agents/             # 20+ custom sub-agents (see Agent Roster)
│   ├── commands/           # Slash commands
│   ├── skills/             # Skills (self-review, coderabbit-full)
│   ├── rules/              # Scoped rule files
│   └── settings.json       # Hooks, permissions, env vars
├── docs/
│   ├── SESSION_STATE.md    # Current session handoff state
│   ├── ARCHITECTURE_SNAPSHOT.md
│   ├── feature-audit-report.md
│   ├── research/           # Market research per feature
│   └── rust-fixes-needed.md
├── CLAUDE.md               # THIS FILE — project constitution
├── MEMORY.md               # Persistent AI memory (learnings, patterns)
├── AGENTS.md               # Agent roster and zone ownership
├── package.json
└── CHANGELOG.md
```

## Zone-Based File Ownership

When multiple agents work in parallel, each owns a zone to prevent merge conflicts:

| Zone   | Owner                    | Files                                             |
| ------ | ------------------------ | ------------------------------------------------- |
| A      | frontend-engineer        | src/components/**, src/pages/**, src/styles/\*\*  |
| B      | backend-engineer         | src/services/**, src/api/**, src/middleware/\*\*  |
| C      | database-engineer        | src/db/**, migrations/**, src/models/\*\*         |
| D      | integration-engineer     | src/integrations/**, src/mcp/**, src/hooks/\*\*   |
| E      | devops-build-engineer    | Dockerfile, .github/**, scripts/**                |
| F      | documentation-sync-agent | docs/\*\*, README.md, CHANGELOG.md                |
| SYSTEM | rust-tauri-engineer      | src-tauri/\*\* (Rust code)                        |
| SHARED | lead only                | package.json, tsconfig.json, CLAUDE.md, MEMORY.md |

Rule: Each agent reads all zones but writes only to its assigned zone. If you need to edit outside your zone, declare it first.

## Agent Roster

See `AGENTS.md` for full details. Summary:

**Opus-tier (complex reasoning)**:
agent-runtime-engineer, computer-use-vision-engineer, llm-router-engineer, memory-embeddings-engineer, rust-tauri-engineer, security-auditor, integration-reviewer, team-lead-orchestrator, spec-handoff-writer, research-orchestrator-fix

**Sonnet-tier (implementation)**:
frontend-engineer, backend-engineer, database-engineer, billing-stripe-engineer, browser-extension-engineer, mcp-integration-engineer, speech-audio-engineer, code-cleanup-refactor, shared-types-guardian, test-writer, git-branch-manager

**Haiku-tier (lightweight)**:
devops-build-engineer, documentation-sync-agent, progress-state-tracker

**Plugin agents**:
plugin-dev (agent-creator, plugin-validator, skill-reviewer), feature-dev (code-architect, code-explorer, code-reviewer), pr-review-toolkit (code-reviewer, code-simplifier, comment-analyzer, pr-test-analyzer), hookify (conversation-analyzer), code-simplifier, agent-sdk-dev (verifier-py, verifier-ts)

## Build & Run Commands

```bash
# Development
pnpm dev                    # Start dev server
pnpm tauri dev              # Start Tauri dev (frontend + Rust)

# Build
pnpm build                  # Build frontend
pnpm tauri build            # Build desktop app

# Checks
pnpm typecheck              # TypeScript type checking
pnpm lint                   # ESLint
pnpm format                 # Prettier
cargo check                 # Rust type checking
cargo clippy                # Rust linting
```

## Development Rules

### DO

- Research the market (web search) before implementing any user-facing feature
- Use sub-agents for file exploration to keep main context clean
- Commit after each meaningful change with conventional commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- Store API keys via SecretManager — NEVER in plaintext
- Self-review at module completion using the `self-review` skill
- Update `docs/SESSION_STATE.md` after every major task
- Save learnings to `MEMORY.md` when you discover something important
- Read instruction files: CLAUDE.md, MEMORY.md, AGENTS.md on session start
- Check for other instruction files: GEMINI.md, .cursorrules, .windsurfrules, .github/copilot-instructions.md

### DON'T

- Do NOT run tests unless explicitly told "run tests" or "test now"
- Do NOT stop coding to verify — self-review only, no mid-flow breaks
- Do NOT refactor working code unless asked
- Do NOT modify Rust/Tauri files directly — write changes to `docs/rust-fixes-needed.md`
- Do NOT put transient state in CLAUDE.md — use SESSION_STATE.md
- Do NOT hardcode model names without searching for current versions first

## Coding Standards

- TypeScript: strict mode, prefer interfaces over types, named exports
- React: functional components only, hooks for state, Tailwind for styling
- Rust: follow Tauri v2 patterns, use `#[tauri::command]` for invoke handlers
- Naming: camelCase for TS/JS, snake_case for Rust, kebab-case for files/directories
- Error handling: try/catch on all async operations, user-friendly error messages
- Imports: absolute paths from src/, no circular dependencies

## Instruction File Discovery

AGI Workforce reads instruction files from ALL AI tools. On project open, scan for and load:

1. `CLAUDE.md` (this file)
2. `MEMORY.md` (persistent memory)
3. `AGENTS.md` (agent definitions)
4. `.claude/rules/*.md` (scoped rules)
5. `GEMINI.md` (if exists)
6. `.cursorrules` (if exists)
7. `.cursor/rules/*.mdc` (if exists)
8. `.windsurfrules` (if exists)
9. `.github/copilot-instructions.md` (if exists)

Merge all into unified context. This is a key differentiator — projects from any AI tool "just work."

## Custom Models Architecture

Cloud models (Claude, GPT, Gemini) are auto-routed internally. The Custom Models feature lets users add:

- Local models: Ollama, LM Studio, vLLM, llama.cpp
- Third-party endpoints: OpenRouter, Groq, Together, Fireworks, Mistral, DeepSeek
- Self-hosted: company endpoints, fine-tuned models
- Any OpenAI-compatible API

Custom models are first-class citizens — they appear in every model dropdown alongside cloud models. No restrictions.

## MCP & Extensions

Extensions use Model Context Protocol (MCP) to connect external tools:

- Currently connected: Gmail, Google Calendar, Vercel, n8n
- Code exists for: Google Drive, Notion, Trello, Asana
- Supports: stdio, SSE, streamable HTTP transports
- Config stored in: `.mcp.json` and settings store
- Tool permissions: ask / auto-approve-readonly / auto-approve-all

## Security Architecture

- ToolGuard: 1,778 lines of tool execution sandboxing
- SecretManager: API keys encrypted via Argon2id, stored in SQLite/keychain
- Input validation: deny-list for dangerous operations
- Permission system: per-tool, per-agent approval controls

## Memory System

Three layers of persistent memory:

1. **CLAUDE.md** (this file) — permanent rules, loaded every session
2. **MEMORY.md** (project root) — AI learnings, patterns, updated during work
3. **docs/SESSION_STATE.md** — session handoff state, updated before compaction

## Compact Instructions

When compacting, ALWAYS preserve:

- Complete list of files modified in this session
- All architectural decisions and their rationale
- Current task progress and exact next steps
- Error patterns discovered and their solutions
- Zone ownership assignments for active agents
- Contents of docs/SESSION_STATE.md
- User preferences and workflow conventions

When compacting, discard:

- Raw file contents that have been committed
- Verbose build/test output (keep only pass/fail)
- Exploration paths that were abandoned
- Duplicate information already in CLAUDE.md or MEMORY.md

## Session Start Checklist

On every new session, silently:

1. Read `docs/SESSION_STATE.md` (if exists)
2. Read `MEMORY.md`
3. Run `git status` and `git log --oneline -10`
4. If SESSION_STATE.md has "Next Steps", start on step 1
5. If no state file, ask what to work on
