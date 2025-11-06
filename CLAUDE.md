# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is an autonomous desktop automation platform built on **Tauri 2.0, React 18, TypeScript, and Rust**. The goal is to deliver a secure, low-latency Windows-first agent that orchestrates desktop automation, browser control, API workflows, and marketplace extensions while routing intelligently across multiple LLMs (including local models via Ollama) to minimize cost.

**Current Status:** Pre-alpha. Build health has been significantly improved through critical fixes to Rust unsafe code, TypeScript configuration, and dependency management. `pnpm typecheck` and `pnpm lint` pass with minimal errors. End-to-end automation, security guardrails, and runtime validation remain incomplete. Version pinning ensures reproducible builds across the team.

## Commands

### Setup and Installation

```powershell
# Install dependencies
pnpm install

# Lint and type-check
pnpm lint
pnpm typecheck
```

### Development

```powershell
# Run desktop app in dev mode (Vite + Tauri hot reload)
pnpm --filter @agiworkforce/desktop dev

# Build desktop app for production
pnpm --filter @agiworkforce/desktop build

# Run tests for desktop app
pnpm --filter @agiworkforce/desktop test

# Run tests with UI
pnpm --filter @agiworkforce/desktop test:ui

# Run tests with coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

### Rust Commands

```powershell
# Check Rust code (from apps/desktop/src-tauri)
cd apps/desktop/src-tauri
cargo check

# Run Rust tests
cargo test

# Build release binary
cargo build --release
```

### Individual Package Commands

```powershell
# Run commands for specific workspace packages
pnpm --filter @agiworkforce/utils test
pnpm --filter @agiworkforce/ui-components test
pnpm --filter @agiworkforce/types typecheck
```

### Monorepo Structure

The repository uses pnpm workspaces with the following structure:

- `apps/desktop` - Primary Tauri + React desktop application
- `apps/mobile` - React Native/Expo companion app (scaffolded, incomplete)
- `apps/extension` - Browser extension bridge (prototype)
- `packages/types` - Shared TypeScript types
- `packages/ui-components` - Shared React components
- `packages/utils` - Shared utilities
- `services/api-gateway` - Node/Express API gateway
- `services/signaling-server` - WebSocket signaling server for P2P
- `services/update-server` - Update distribution service

## Architecture

### Frontend (React/TypeScript)

- **Framework:** React 18 with TypeScript 5.4+, Vite build tool
- **State Management:** Zustand stores (located in `apps/desktop/src/stores/`)
- **UI Components:** Radix UI primitives + Tailwind CSS + custom components
- **Routing:** React Router v6
- **Forms:** React Hook Form with Zod validation
- **Key Libraries:** Monaco Editor, xterm.js, react-markdown, framer-motion

**Store Architecture:**

- Each feature has its own Zustand store (e.g., `chatStore.ts`, `automationStore.ts`, `settingsStore.ts`)
- Stores manage local UI state and communicate with Rust backend via Tauri IPC
- Use `immer` for immutable state updates

### Backend (Rust/Tauri)

- **Framework:** Tauri 2.0 with Tokio async runtime
- **Database:** SQLite (via `rusqlite`) for local persistence
- **Modular Control Primitives (MCPs):** Feature modules organized by domain

**MCP Modules** (in `apps/desktop/src-tauri/src/`):

- `automation/` - Windows UI automation via UIA (UI Automation API)
- `browser/` - Browser automation using Playwright/CDP
- `filesystem/` - File operations, watching, traversal
- `database/` - SQL and NoSQL database connectivity
- `api/` - HTTP client, OAuth2, request templating
- `communications/` - Email (IMAP/SMTP) integration
- `calendar/` - Google Calendar, Outlook integration
- `cloud/` - Drive, Dropbox, OneDrive connectors
- `productivity/` - Notion, Trello, Asana integrations
- `document/` - Document processing (Word, Excel, PDF)
- `terminal/` - PTY session management
- `providers/` - LLM provider implementations
- `router/` - Multi-LLM routing logic
- `security/` - Permission prompts, sandboxing
- `telemetry/` - Logging, tracing, metrics

**Command Registration:**
All Tauri commands are registered in `apps/desktop/src-tauri/src/main.rs` via `invoke_handler!` macro. When adding new commands:

1. Implement the command function in the appropriate module
2. Re-export it from `commands/mod.rs`
3. Add it to the `invoke_handler!` list in `main.rs`

### Multi-LLM Router

**Location:** `apps/desktop/src-tauri/src/router/`

The router intelligently selects between multiple LLM providers:

- **Providers:** OpenAI, Anthropic, Google, Ollama (local)
- **Strategy:** Prioritize Ollama for cost-free local inference, fall back to cloud providers based on quality/latency thresholds
- **Cost Tracking:** All requests log tokens, cost, and provider to SQLite for analytics
- **Configuration:** Provider credentials stored via Windows Credential Manager (DPAPI), not in SQLite

**Key Concepts:**

- `Provider` enum defines available providers
- `LLMProvider` trait must be implemented by all providers
- `LLMRouter` handles provider selection and fallback logic
- `RouterPreferences` and `RoutingStrategy` control routing behavior

### Database Schema

**Location:** `apps/desktop/src-tauri/src/db/migrations/`

SQLite schema includes:

- Conversations and messages (chat history)
- Settings (key-value store)
- Provider usage and cost analytics
- Calendar accounts and events
- File watch subscriptions
- Terminal session history

Run migrations automatically on app startup via `migrations::run_migrations()` in `main.rs`.

## TypeScript Configuration

The monorepo uses TypeScript 5.4+ with strict mode enabled:

- **Base Config:** `tsconfig.base.json` (root level, extends to all packages)
- **Module Resolution:** `bundler` mode (required for Tauri API compatibility)
- **Path Aliases:** Each package defines its own `tsconfig.json` with project references

**Important:** All imports of `@tauri-apps/*`, `react`, `lucide-react`, and shared packages must resolve through local package manifests. If you encounter module resolution errors, verify the package has proper `dependencies` in its `package.json`.

## Version Pinning and Reproducibility

This project enforces strict version pinning to ensure reproducible builds across all environments:

- **Node.js:** Version 20.11.0+ (enforced via `.nvmrc` and `package.json` engines field)
  - Use `nvm use` to automatically switch to the correct version
  - Supports Node v20.x and v22.x
- **pnpm:** Version 8.15.0+ (enforced via `package.json` engines and `.npmrc`)
  - The `.npmrc` file sets `engine-strict=true` to fail on version mismatches
- **Rust:** Version 1.90.0 (enforced via `rust-toolchain.toml`)
  - rustup automatically uses the pinned version when in the project directory

### First-Time Setup

```powershell
# Install Node.js (if not using nvm)
# Download from nodejs.org and install version 20.11.0+

# OR use nvm (recommended)
nvm install 20.11.0
nvm use  # Reads from .nvmrc

# Install pnpm globally
npm install -g pnpm@8.15.0

# Install Rust (rustup will read rust-toolchain.toml)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Verify versions
node --version    # Should output v20.x.x or v22.x.x
pnpm --version    # Should output 8.15.0+
rustc --version   # Should output rustc 1.90.0

# Install dependencies
pnpm install
```

## Development Workflow

### Adding a New Feature

1. **Backend (Rust):**
   - Create or extend MCP module in `apps/desktop/src-tauri/src/`
   - Add command functions with `#[tauri::command]` attribute
   - Register commands in `main.rs`
   - Add database migrations if needed
   - Write Rust tests

2. **Frontend (TypeScript):**
   - Create Zustand store in `apps/desktop/src/stores/`
   - Create React components in `apps/desktop/src/components/`
   - Add Tauri API calls via `@tauri-apps/api`
   - Write Vitest tests

3. **Integration:**
   - Update types in `packages/types/` if shared across apps
   - Test end-to-end workflow
   - Update documentation

### Working with Ollama (Local LLM)

1. Install [Ollama for Windows](https://ollama.com/download)
2. Pull a model: `ollama pull llama3`
3. Start service: `ollama serve`
4. Configure in desktop app settings (once UI is complete)
5. Router will automatically detect and prioritize Ollama for zero-cost inference

### Security Considerations

- **Never store API keys in SQLite or plaintext** - use Windows Credential Manager via `keyring` crate
- **Permission prompts required** before automation actions (filesystem, automation, browser)
- **Sandbox enforcement** via Tauri capabilities system
- **Structured logging** for all MCP invocations and provider calls
- **Prompt injection detection** middleware should escalate risky commands

## Testing

### TypeScript Tests (Vitest)

```powershell
# Run all tests
pnpm test

# Run desktop tests with UI
pnpm --filter @agiworkforce/desktop test:ui

# Run with coverage
pnpm --filter @agiworkforce/desktop test:coverage
```

Tests located in `apps/desktop/src/__tests__/` and co-located `*.test.ts` files.

### Rust Tests

```powershell
cd apps/desktop/src-tauri
cargo test
```

Dev dependencies include `mockall`, `tempfile`, `serial_test`, and `proptest` for comprehensive testing.

### E2E Tests (Playwright)

```powershell
pnpm --filter @agiworkforce/desktop test:e2e
```

Playwright config in `apps/desktop/playwright.config.ts`.

## Common Issues and Solutions

### TypeScript Errors After Adding Dependencies

**Status:** Significantly improved. TypeScript error count reduced from ~1,200 to under 100 through critical fixes in Phases 1-3.

**Key Fixes Applied:**

- Added missing `tsconfig.json` files to `packages/types` and `packages/utils`
- Relaxed `exactOptionalPropertyTypes` to `false` in `tsconfig.base.json` for better Tauri API compatibility
- Fixed Rust undefined behavior in screen capture module (RGBQUAD zero-initialization)
- Installed missing API gateway dependencies

**If you still encounter TypeScript errors:**

- Run `pnpm install` at root
- Verify `tsconfig.json` project references are correct
- Check that dependencies are listed in the package's `package.json`, not just root
- Ensure you're using the correct Node.js version: `node --version` (should be v20.x or v22.x)

### Tauri Build Failures

- Ensure Rust toolchain is up to date: `rustup update`
- Verify WebView2 runtime is installed (Windows)
- Check Tauri prerequisites: https://tauri.app/v1/guides/getting-started/prerequisites

### Windows Linker Error LNK1318 (PDB Limit Exceeded)

If you encounter `LINK : fatal error LNK1318: Unexpected PDB error; LIMIT (12)`:

**Root Cause:** With 1,040+ crates, debug info generation exceeds Windows linker PDB (Program Database) file limits.

**Solution:** Add a `[profile.dev]` section to the **workspace root** `Cargo.toml` (not the package `Cargo.toml`):

```toml
# In the root Cargo.toml (C:\Users\...\agiworkforce\Cargo.toml)
[profile.dev]
debug = 0  # Disable debug info to prevent LNK1318
incremental = false  # Disable incremental compilation
opt-level = 0  # Keep fast compile times
```

Then clean and rebuild:

```powershell
cd apps/desktop/src-tauri
cargo clean
cd ../..
pnpm --filter @agiworkforce/desktop dev
```

**Why this works:** Cargo workspaces require profile settings at the workspace root, not in member packages. Setting `debug = 0` at the profile level forces Rust to compile without any debug information, completely avoiding PDB file generation. Environment variables like `RUSTFLAGS=-Cdebuginfo=0` are ineffective because they can be overridden by Cargo's default dev profile settings.

### Module Resolution Errors

- The repo uses `moduleResolution: "bundler"`
- All imports must resolve through package manifests
- Use workspace protocol in `package.json`: `"@agiworkforce/types": "workspace:*"`

### Database Migration Errors

- Migrations run automatically on startup
- If schema is corrupted, delete `agiworkforce.db` in app data directory
- Check migration files in `apps/desktop/src-tauri/src/db/migrations/`

## Git Workflow

This repo uses conventional commits with commitlint and husky hooks:

- Format: `type(scope): description`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
- Pre-commit: runs `lint-staged` (ESLint + Prettier)
- Pre-push: runs type-check

## Performance Considerations

### Bundle Size

- Desktop app uses Vite with tree-shaking
- Monaco Editor and xterm.js are large dependencies - ensure code-splitting
- Use dynamic imports for heavy components

### Rust Performance

- Use `rayon` for CPU-bound parallel operations
- Use `dashmap` and `parking_lot` for concurrent data structures
- Profile with `cargo bench` (benchmarks in `benches/`)

### Database

- SQLite connection pooled via `tokio-rusqlite`
- Indexes exist on frequently queried columns
- Use prepared statements to prevent SQL injection

## Debugging

### Rust Backend

```powershell
# Enable Tauri devtools
$env:TAURI_CONFIG="{'build': {'devPath': 'http://localhost:5173', 'devtools': true}}"
pnpm --filter @agiworkforce/desktop dev
```

Rust logs appear in terminal. Configure log level via `RUST_LOG` env var:

```powershell
$env:RUST_LOG="debug"
```

### Frontend

- React DevTools and Redux DevTools extensions supported
- Zustand stores debuggable via browser console
- Vite HMR for rapid iteration

## Documentation

Key documentation files in the repository:

- `README.md` - Setup and getting started
- `PROJECT_OVERVIEW.md` - Consolidated project status and architecture
- Individual package READMEs for workspace details

Update documentation in the same PR that changes functionality.
