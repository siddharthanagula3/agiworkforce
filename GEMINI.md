# GEMINI.md: AGI Workforce

This document provides a comprehensive overview of the AGI Workforce project, its structure, and development workflows. It is intended to be used as a primary context file for AI-assisted development.

## Project Overview

AGI Workforce is a developer-preview desktop application that provides an agentic workspace for interacting with Large Language Models (LLMs). It is built as a monorepo containing several components, with the main focus on the desktop application.

The core application is a Tauri-based desktop app, which combines a Rust backend with a React/TypeScript frontend. This architecture allows for powerful native capabilities (like file system access and shell commands) controlled by a modern web-based UI.

The project emphasizes safety through a tool approval system, where "dangerous" operations require user consent. It supports multiple LLM providers (OpenAI, Anthropic, Google, Ollama) and is highly configurable.

### Key Technologies

- **Desktop Framework:** [Tauri](https://tauri.app/) (Rust backend, webview frontend)
- **Frontend:** [React](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend (Rust):** [Tokio](https://tokio.rs/) for async runtime, [Serde](https://serde.rs/) for serialization, and numerous other crates for specific functionalities (see `apps/desktop/src-tauri/Cargo.toml`).
- **Model Context Protocol (MCP):** Supports connecting to various data sources (Supabase, GitHub, local filesystem, etc.) via MCP servers. Configuration is handled via `.mcp.json` and `apps/desktop/mcp-servers-config.example.json`.
- **Package Management:** [pnpm workspaces](https://pnpm.io/workspaces)
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
- **Testing:** [Vitest](https://vitest.dev/) for frontend unit/integration tests, [Playwright](https://playwright.dev/) for End-to-End tests, and `cargo test` for Rust tests.
- **CI/CD:** GitHub Actions

## Repository Structure & Organization

The project is a monorepo organized using pnpm workspaces.

```
/
├── apps/
│   ├── desktop/              # Main Tauri desktop application (React + Rust)
│   │   ├── src/              # React frontend source (components, pages, stores, etc.)
│   │   └── src-tauri/        # Rust backend source
│   ├── extension/            # Minimal browser extension scaffold
├── packages/
│   ├── types/                # Shared TypeScript types for the monorepo
│   └── utils/                # Shared utility functions
├── services/
│   ├── api-gateway/          # Backend services (Node.js)
│   └── signaling-server/     # Signaling server
├── dev-scripts/              # Helper scripts for development
└── ... (config files, docs, etc.)
```

**Note on Organization:**

- Feature-first domains are preferred under `apps/desktop/src/{components,pages,services,stores,api,lib,utils,types}`.
- Shared code sits in `packages/`.
- `ui-components` package has been removed; shared UI primitives should be kept local to `apps/desktop/src/components` until a real package is needed.

## Building and Running

### Prerequisites

- Node.js (version specified in `package.json` `engines` field)
- pnpm (version specified in `package.json` `engines` field)
- Rust toolchain (version specified in `rust-toolchain.toml`)
- Platform-specific build tools (see `INSTALLATION.md` if available, or Tauri docs)

### Development

To run the desktop application in a live-reloading development environment:

1.  **Install dependencies:**
    ```bash
    pnpm install
    ```
2.  **Run the development server:**
    ```bash
    pnpm dev:desktop
    ```
    (Or `pnpm build:all` to build workspace packages without the desktop app)

### Building

To build the application for production:

1.  **Build the desktop app:**
    ```bash
    pnpm build:desktop
    ```
    The output artifacts will be located in `apps/desktop/src-tauri/target/release`.

## Testing

The project has a comprehensive testing strategy.

- **Run all tests:**
  ```bash
  pnpm test
  ```
- **Linting:**
  ```bash
  pnpm lint
  ```
- **TypeScript Type Checking:**
  ```bash
  pnpm typecheck
  ```
- **Frontend Unit/Integration Tests (Vitest):**
  ```bash
  pnpm --filter @agiworkforce/desktop test
  ```
  Use `... test:coverage` to monitor deltas.
- **End-to-End Tests (Playwright):**
  ```bash
  pnpm --filter @agiworkforce/desktop test:e2e
  ```
  Use `... test:smoke` for quick sanity checks and `... test:e2e:ui` for interactive debugging.
- **Rust Tests:**
  ```bash
  cd apps/desktop/src-tauri
  cargo test
  ```
  Run `cargo fmt && cargo clippy` before shipping backend changes.

## Development Conventions

### Coding Style & Naming

- **TypeScript-first:** Prefer `.tsx` for UI.
- **Formatting:** Prettier (2-space, single quotes). Enforced via `husky` and `lint-staged`.
- **Linting:** ESLint (TS/React) and `clippy` (Rust).
- **Naming:**
  - React components/types: `PascalCase`
  - Hooks: `useThing.ts`
  - Utilities: `camelCase`
  - Files/folders: `kebab-case` (e.g., `src/hooks`, `src/stores`)

### Commits and Pull Requests

- **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/).
  - Examples: `feat(ui): add agent graph panel`, `fix(api): guard null session`.
- **Pull Requests:** Include summary, linked issue, checklist of checks run (`pnpm test`, lint, typecheck, e2e), and screenshots for UI changes.

### Configuration & Security

- **Secrets:** Managed via `.env` file in `apps/desktop`. Use `.env.example` as a template. **Never commit real secrets.**
- **MCP:** Use `mcp-servers-config.example.json` for MCP server setup.
- **Rust:** Tauri builds depend on the pinned Rust toolchain (see `rust-toolchain.toml`).

## Architecture & Design (Nov 2025 Alignment)

### Desktop Architecture

- **Rust Core:** Exposes stable Tauri commands. Modules aligned to domains (`automation`, `agent`, `billing`, `security`, `window`, `commands`).
- **State Management:** Co-locate Zustand stores per domain. Persist via `windowStatePersistence` or Rust DB only when needed.
- **Data Layer:** `api/` for HTTP + MCP clients, `services/` for orchestration, `stores/` for UI state.

### Unified Agentic Chat & Automation UX

- **Shell:** Single-pane conversational UI with right-rail tool/trace panel; command palette (`Cmd/Ctrl+K`).
- **Tasks:** Multi-step plans surfaced inline; tool invocations shown with structured cards.
- **Context:** Unified context panel (files, calendar, browser tabs, etc.) with explicit opt-in.
- **Execution:** Enforce per-task capability scopes (files, network) with human-readable prompts.
- **Performance:** Stream tokens; prefer server-side or local LLM fallbacks gated by `local-llm` feature.

### Backend, Auth, and Subscription

- **Auth:** Desktop auth relies on website/OIDC handoff, exchanging for a short-lived desktop token.
- **Subscriptions:** Managed in `services/api-gateway`. No billing logic in the client.
- **Telemetry:** Behind explicit consent; sent via gateway with privacy filters.
