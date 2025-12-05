# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AGI Workforce is a Tauri-based desktop application combining AI chat, tool execution, browser automation, terminal control, and workflow orchestration. Built with React (frontend) and Rust (backend), it enables LLMs to interact with desktop systems through a comprehensive tool ecosystem.

**Architecture:** Monorepo managed with pnpm workspaces

- **apps/desktop**: Main Tauri application (React + Rust)
- **packages/types**: Shared TypeScript types
- **packages/utils**: Shared utilities
- **services/**: API gateway and signaling server (future)

## Development Commands

### Initial Setup

```bash
# Install dependencies (requires pnpm ≥9.15.0, Node.js ≥20.11.0)
pnpm install

# First-time build (especially on Windows with 1,040+ crates)
# Note: Debug builds disable all debug info to avoid Windows PDB limits
cd apps/desktop
pnpm dev
```

### Common Development Tasks

```bash
# Run desktop app in development mode
pnpm dev:desktop

# Build desktop app for production
pnpm build:desktop

# Build all packages except desktop
pnpm build:all

# Run tests (all packages)
pnpm test

# Run tests for desktop only
cd apps/desktop && pnpm test

# Run E2E tests with Playwright
cd apps/desktop && pnpm test:e2e
cd apps/desktop && pnpm test:e2e:ui  # With UI

# Type checking
pnpm typecheck           # Desktop only
pnpm typecheck:all       # All packages

# Linting and formatting
pnpm lint                # ESLint (max 15 warnings)
pnpm lint:fix            # Auto-fix issues
pnpm format              # Prettier
pnpm format:check        # Check formatting
```

### Rust-Specific Commands

```bash
# Run Rust tests (from workspace root or apps/desktop/src-tauri)
cargo test
cargo test --package agiworkforce-desktop

# Run specific test module
cargo test --package agiworkforce-desktop automation::tests

# Run benchmarks
cargo bench

# Build release (optimized for size)
cargo build --release

# Check without building
cargo check
```

### Debugging

```bash
# Run with Rust logs
RUST_LOG=debug pnpm dev:desktop

# Run specific Tauri commands
cd apps/desktop && pnpm tauri dev
cd apps/desktop && pnpm tauri build
```

## Architecture Overview

### Frontend Architecture (React + Zustand)

**State Management:** Zustand stores provide reactive state across the application. Key stores include:

- `unifiedChatStore.ts`: Primary chat interface, messages, streaming
- `settingsStore.ts`: Application settings, LLM configurations
- `automationStore.ts`: UI automation state
- `browserStore.ts`: Browser automation state
- `terminalStore.ts`: Terminal sessions
- `mcpStore.ts`: MCP server connections

**Component Structure:**

- `src/components/`: UI components using Radix UI primitives
- `src/pages/`: Route-level page components
- `src/hooks/`: React hooks for Tauri IPC and state
- `src/api/`: Frontend API layer wrapping Tauri commands

**Path Aliases:** Configured in vite.config.ts

- `@/`: src root
- `@components/`: src/components
- `@stores/`: src/stores
- `@hooks/`: src/hooks
- `@utils/`: src/utils

### Backend Architecture (Rust + Tauri)

**Core Pattern: Command → State → Module**

1. **Commands Layer** (`src-tauri/src/commands/`)
   - Tauri IPC command handlers exposed to frontend
   - Each module exports `#[tauri::command]` functions
   - Commands are registered in `main.rs` builder
   - State is managed through Tauri's dependency injection (`State<T>`)

2. **Module Layer** (Top-level modules in `src-tauri/src/`)
   - Core business logic separated from IPC layer
   - Examples: `router/`, `automation/`, `mcp/`, `agi/`, `security/`
   - Contains domain logic, integrations, and implementation details

3. **State Management** (`src-tauri/src/state.rs` and command state wrappers)
   - Global application state managed via `AppState`
   - Per-feature state wrappers (e.g., `LLMState`, `BrowserStateWrapper`)
   - State is injected into commands via `tauri::State<T>`

### Key Subsystems

#### LLM Router (`src-tauri/src/router/`)

Universal LLM interface supporting multiple providers:

- **Providers:** OpenAI, Anthropic, Google, Ollama, xAI, DeepSeek, Mistral, Qwen
- **Features:** Token counting, cost calculation, response caching, streaming
- **Tool Execution:** Function calling with unified tool registry
- **Vision Support:** Multimodal content handling

#### AGI System (`src-tauri/src/agi/`)

Advanced orchestration and reasoning:

- **Core:** AGI planning, execution, and goal management
- **Memory:** Long-term knowledge retention and learning
- **Orchestrator:** Multi-agent coordination with resource locking
- **Process Reasoning:** Outcome tracking and strategy selection
- **Templates:** Built-in workflow templates and agent definitions

#### Automation System (`src-tauri/src/automation/`)

Cross-platform desktop automation:

- **Input:** Keyboard/mouse control via `enigo` (cross-platform)
- **Screen:** Screen capture via `xcap`, OCR integration
- **UIA:** Windows UI Automation for element inspection
- **Vision Planner:** AI-driven UI element targeting
- **Safety:** Dangerous operation detection and approval

#### MCP Integration (`src-tauri/src/mcp/`)

Model Context Protocol client implementation:

- **Architecture:** JSON-RPC 2.0 over STDIO transport
- **Manager:** Server lifecycle (start, stop, health monitoring)
- **Registry:** Tool registration with AGI system
- **Session:** Initialization, capabilities negotiation
- **Events:** Real-time MCP events emitted to frontend

#### Security (`src-tauri/src/security/`)

Multi-layered security system:

- **AuthManager:** JWT-based authentication and sessions
- **SecretManager:** Secure credential storage (OS keyring + DB fallback)
- **Policy Engine:** Fine-grained permission controls
- **Approval System:** Dangerous operation confirmation
- **Guardrails:** Prompt injection detection, rate limiting

#### Browser Automation (`src-tauri/src/browser/`)

Headless browser integration:

- CDP client for Chrome DevTools Protocol
- Playwright bridge for cross-browser automation
- DOM operations and semantic element detection
- Tab management and navigation

#### Database Layer (`src-tauri/src/db/`)

SQLite-based persistence:

- **Migrations:** Schema versioning in `db/migrations.rs`
- **Connection:** Managed via `AppDatabase` state
- **Usage:** Chat history, settings, analytics, user data

## Important Patterns and Conventions

### Tauri Command Pattern

```rust
#[tauri::command]
pub async fn example_command(
    state: State<'_, ExampleState>,
    app: AppHandle,
    param: String,
) -> Result<ResponseType, String> {
    // Implementation
}
```

### Error Handling

- Backend: Use `anyhow::Result` for internal errors, convert to `Result<T, String>` for commands
- Frontend: Commands return Promise<T> that reject with error strings

### State Management Pattern

```rust
pub struct FeatureState(pub Arc<RwLock<InnerState>>);

impl FeatureState {
    pub fn new() -> Self {
        Self(Arc::new(RwLock::new(InnerState::default())))
    }
}
```

### Frontend-Backend Communication

```typescript
// Frontend calls Tauri command
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ResponseType>('command_name', {
  param: value,
});
```

### Test Organization

- **Rust:** Unit tests in module files, integration tests in `tests/` subdirectories
- **Frontend:** Vitest for unit tests (`*.test.ts`), Playwright for E2E (`e2e/*.spec.ts`)
- **Mocking:** Use `mockall` for Rust, `msw` for frontend HTTP mocking

## Special Considerations

### Windows-Specific Issues

1. **PDB Limit:** With 1,040+ crates, Windows PDB debug info exceeds 4,096 stream limit
   - **Solution:** Debug builds disable all debug info (`debug = 0` in Cargo.toml)
   - This is normal and expected; use release builds for profiling

2. **UI Automation:** Windows UIA APIs require `unsafe` code blocks (allowed in lints)

3. **Build Tools:** Requires Visual Studio Build Tools on Windows

### Cross-Platform Automation

- **Input:** `enigo` provides cross-platform keyboard/mouse control
- **Screen:** `xcap` handles cross-platform screen capture
- **Clipboard:** `arboard` for cross-platform clipboard access
- **Platform Detection:** Use `cfg(target_os = "windows")` / `cfg(target_os = "macos")` / `cfg(target_os = "linux")`

### Archived Features

The `apps/desktop/src/future_scope/` directory contains disabled features:

- **Purpose:** Future marketplace, employees, ROI dashboard features
- **Status:** Excluded from builds, linting, and type checking
- **Note:** May contain broken imports (expected)

### Memory Management

- Use `Arc<RwLock<T>>` for shared mutable state across async boundaries
- Use `Arc<Mutex<T>>` for simple cases, `parking_lot::RwLock` for hot paths
- `DashMap` for concurrent hash maps without explicit locking

### Security Model

- **Safe Mode:** Default mode requiring approval for dangerous operations
- **Full Control:** All tools execute without confirmation (user opt-in)
- **Audit Logging:** All tool executions logged for compliance
- **Prompt Injection:** Automatic detection and blocking

## Code Quality Standards

### Rust

- **Zero Warnings Policy:** `#![deny(warnings)]` in production code
- **Allowed:** `unsafe_code` (Windows API), `unused_results` (intentional), `unused_qualifications` (clarity)
- **Testing:** Use `#[cfg(test)]` modules, `serial_test` for sequential tests

### TypeScript

- **Max Warnings:** 15 warnings allowed (gradually decreasing)
- **Strict Mode:** TypeScript strict checks enabled
- **Path Aliases:** Use @ imports for cleaner paths

### Pre-commit Hooks

Husky + lint-staged automatically:

- Runs ESLint with auto-fix on staged .ts/.tsx/.js files
- Runs Prettier on staged files
- Validates commit messages (conventional commits)

## Troubleshooting

### Build Failures

- **Windows PDB errors:** This is handled in Cargo.toml; if you see LNK1318, check profile settings
- **Missing dependencies:** Run `pnpm install` from workspace root
- **Rust toolchain:** Ensure Rust ≥1.90.0 (`rustup update`)

### Development Issues

- **Port conflicts:** Vite auto-detects available ports starting from 5173
- **Tauri not found:** Run `pnpm install` to install `@tauri-apps/cli`
- **Type errors in future_scope:** Expected; this directory is excluded from builds

### Performance

- **Slow builds:** First Rust build takes 5-10 minutes; subsequent builds are incremental
- **Hot reload:** Frontend has HMR; Rust changes require full rebuild
- **Memory usage:** Development mode uses more memory; release builds are optimized

## Resources

- Tauri Docs: https://tauri.app/
- MCP Specification: https://spec.modelcontextprotocol.io/
- Project Issues: https://github.com/siddharthanagula3/agiworkforce-desktop-app/issues
