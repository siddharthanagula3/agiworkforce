# AGI Workforce - OpenCode Instructions

This document consolidates the core rules and guidelines for AGI Workforce development with OpenCode.

## Project Overview

AGI Workforce is a Tauri v2 desktop application (Rust backend + React/TypeScript frontend) -- an open, model-agnostic AI desktop platform. Users can connect any LLM (cloud or local), use MCP tools, manage agents, and run autonomous workflows.

### Monorepo Structure

```
apps/
  desktop/              # Tauri v2 desktop app (primary product)
    src/                # React/TS frontend (Vite + React 19 + Tailwind 4)
    src-tauri/          # Rust backend (Tauri v2 commands, system APIs)
  web/                  # Next.js 16 marketing/auth/billing site
  mobile/               # React Native + Expo mobile app (iOS/Android)
  extension/            # Chrome extension (Manifest V3, native messaging)
  extension-vscode/     # VS Code extension
packages/
  types/                # Shared TypeScript type definitions
  utils/                # Shared utility functions
services/
  api-gateway/          # Express API for mobile + external integrations
  signaling-server/     # WebSocket signaling for realtime communication
```

### Build Commands

```bash
# Install dependencies
pnpm install

# Desktop development
cd apps/desktop && pnpm dev           # Vite frontend + Rust backend
cd apps/desktop && pnpm dev:vite      # Frontend-only (no Rust rebuild)

# Web app development
cd apps/web && pnpm dev

# Type checking
pnpm typecheck                        # Desktop: tsc --noEmit
cargo check                           # Rust type checking
cargo clippy                          # Rust linting

# Linting & Formatting
pnpm lint                             # ESLint
pnpm format                           # Prettier

# Tests (only run when explicitly asked)
cd apps/desktop && pnpm test          # Vitest unit tests
cd apps/desktop && pnpm test:e2e      # Playwright E2E
cd apps/web && pnpm test              # Web app tests
cargo test                            # Rust unit tests
```

---

## Security Guidelines (CRITICAL)

### AGI Workforce Security Architecture

- **ToolGuard** (`sys/security/tool_guard.rs`, 1778 lines) validates ALL tool execution
- **SecretManager** encrypts API keys via Argon2id + AES-GCM, stored in SQLite/keychain
- **NEVER** store secrets in plaintext, NEVER in committed `.env`
- Deep linking secured via ALLOWED_DEEP_LINK_PARAMS allowlist

### Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated (both Rust and TypeScript sides)
- [ ] SQL injection prevention (parameterized queries in Rust SQLite)
- [ ] XSS prevention (sanitized HTML in React components)
- [ ] CSRF protection enabled (web app API routes)
- [ ] Authentication/authorization verified (Supabase RLS)
- [ ] Rate limiting on all endpoints (Upstash Redis)
- [ ] Error messages don't leak sensitive data
- [ ] Tauri IPC commands validate all input parameters
- [ ] MCP tool execution goes through ToolGuard

### Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Through SecretManager (desktop) or env vars (web)
// Desktop: SecretManager encrypts with Argon2id + AES-GCM
// Web: process.env.SUPABASE_SERVICE_ROLE_KEY
```

### Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase for similar issues

---

## Coding Style

### TypeScript (Frontend)

- **Strict mode** enabled, prefer interfaces, named exports
- **React**: Functional components only, Tailwind 4 for styling
- **State**: Zustand v5 + Immer + Persist middleware
- **UI**: Radix UI primitives + Tailwind CSS 4 + Lucide icons + Sonner toasts
- **Imports**: Absolute imports from `src/`

### Rust (Backend)

- Follow Tauri v2 patterns, `#[tauri::command]` for invoke handlers
- Snake_case naming, proper error handling with `Result<T, E>`
- `deny(unsafe_code, dead_code, unused_imports, unused_variables, unused_mut)`
- All warnings are errors; `clippy::await_holding_lock` is allowed

### Tauri IPC (CRITICAL)

All `invoke()` calls in TypeScript MUST use camelCase param keys. Tauri auto-converts from Rust snake_case. Snake_case in invoke() silently fails.

```typescript
// WRONG: invoke('command', { conversation_id: id })
// RIGHT: invoke('command', { conversationId: id })
```

### File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling
- 200-400 lines typical, 800 max
- Extract utilities from large components
- Organize by feature/domain, not by type

### Immutability (CRITICAL)

ALWAYS create new objects, NEVER mutate:

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return { ...user, name }
}
```

### Error Handling

ALWAYS handle errors comprehensively:

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('Detailed user-friendly message')
}
```

### Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling (both Rust and TS)
- [ ] No console.log statements (use structured logging)
- [ ] No hardcoded values
- [ ] No mutation (immutable patterns used)
- [ ] Tauri IPC uses camelCase params

---

## Testing Requirements

### Test Frameworks

| Workspace | Framework | Command |
|-----------|-----------|---------|
| Desktop (TS) | Vitest | `cd apps/desktop && pnpm test` |
| Desktop (E2E) | Playwright | `cd apps/desktop && pnpm test:e2e` |
| Desktop (Rust) | cargo test | `cargo test` |
| Web | Next.js test | `cd apps/web && pnpm test` |
| API Gateway | Jest | `cd services/api-gateway && pnpm test` |

### Minimum Test Coverage: 80%

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (Playwright)
4. **Rust Tests** - Module tests with `#[cfg(test)]`

### Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

---

## Git Workflow

### Commit Message Format (commitlint enforced)

```
<type>(<scope>): <lowercase subject>
```

- Header max 100 characters
- Subject MUST be lowercase
- Valid types: feat, fix, chore, docs, refactor, test, perf, ci, build, style

Examples:
- `fix(rust): websocket timing fix`
- `feat(desktop): add voice input overlay`
- `chore(web): update supabase deps`

### Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

---

## Agent Orchestration

### Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions, IPC design |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits, API key handling |
| build-error-resolver | Fix build errors | When tsc/cargo check fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs, CLAUDE.md |
| rust-reviewer | Rust code review | Tauri commands, async patterns |
| rust-build-resolver | Rust build errors | cargo check/clippy failures |
| database-reviewer | Database optimization | SQLite, Supabase, migrations |

### Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent
5. Rust code changes - Use **rust-reviewer** agent

---

## Zone-Based File Ownership (Multi-Agent)

When parallel agents work, each writes only to its assigned zone:

| Zone | Files |
|------|-------|
| A | `apps/desktop/src/components/**`, `apps/desktop/src/pages/**`, `apps/web/components/**` |
| B | `apps/desktop/src/services/**`, `apps/web/api/**`, `services/**` |
| C | `apps/web/core/storage/**`, `supabase/migrations/**` |
| D | `apps/desktop/src/stores/mcpStore*`, `apps/extension/**` |
| E | `Dockerfile`, `.github/**`, `scripts/**` |
| F | `docs/**`, `README.md`, `CHANGELOG.md` |
| SYSTEM | `apps/desktop/src-tauri/**` |
| SHARED | `package.json`, `tsconfig.json`, `CLAUDE.md`, `packages/**` |

---

## Performance Optimization

### Model Selection Strategy

**Haiku** (90% of Sonnet capability, 3x cost savings):
- Lightweight agents with frequent invocation
- Pair programming and code generation
- Worker agents in multi-agent systems

**Sonnet** (Best coding model):
- Main development work
- Orchestrating multi-agent workflows
- Complex coding tasks

**Opus** (Deepest reasoning):
- Complex architectural decisions
- Maximum reasoning requirements
- Research and analysis tasks

---

## OpenCode-Specific Notes

Since OpenCode does not support hooks, the following actions that were automated in Claude Code must be done manually:

### After Writing/Editing Code
- Run `prettier --write <file>` to format JS/TS files
- Run `pnpm typecheck` to check for TypeScript errors
- Run `cargo clippy` to check Rust code
- Check for console.log statements and remove them

### Before Committing
- Run security checks manually
- Verify no secrets in code
- Run full test suite if requested

### Commands Available

Use these commands in OpenCode:
- `/plan` - Create implementation plan
- `/tdd` - Enforce TDD workflow
- `/code-review` - Review code changes
- `/security` - Run security review
- `/build-fix` - Fix build errors (TS + Rust)
- `/e2e` - Generate E2E tests
- `/refactor-clean` - Remove dead code
- `/orchestrate` - Multi-agent workflow
- `/rust-review` - Rust code review
- `/rust-build` - Fix Rust build errors
- `/verify` - Run full verification loop

---

## Success Metrics

You are successful when:
- All tests pass (80%+ coverage)
- No security vulnerabilities
- Code is readable and maintainable
- `cargo check` and `cargo clippy` pass with zero warnings
- `pnpm typecheck` passes with zero errors
- Performance is acceptable
- User requirements are met
- Tauri IPC uses camelCase params consistently
